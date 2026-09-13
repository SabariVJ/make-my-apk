// Real ActivityProvider + ActivityView + JS bridge. Only native hardware, server
// calls, and decorative chart/animation rendering are replaced.
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://svj.test/" });
for (const key of [
  "window",
  "document",
  "navigator",
  "localStorage",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "SVGElement",
  "MutationObserver",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "window" ? dom.window : dom.window[key],
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
let app, api, temporary, view, client, test;
const baseState = () => ({
  mode: "counter",
  sensorAvailable: true,
  sensorStarted: false,
  listenerRegistered: false,
  listenerRemoved: true,
  trackingRequested: false,
  trackingActive: false,
  sessionBaselineRaw: -1,
  sessionSteps: 0,
  sessionStartedMs: -1,
  sessionStoppedMs: -1,
  sessionId: "",
  firstRaw: -1,
  lastRaw: -1,
  dailySteps: 0,
  guardedLastRaw: -1,
  startDateMs: -1,
  lastEventMs: -1,
  lastError: null,
});
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function makeNative() {
  const native = {
    state: baseState(),
    permission: "granted",
    mode: "counter",
    calls: { start: 0, stop: 0, request: 0, info: 0 },
    handlers: { measurement: new Set(), trackingStateChanged: new Set() },
    removed: [],
    startGate: null,
    permissionGate: null,
    addGate: null,
    addFails: false,
    stopFails: false,
    maxMeasurementListeners: 0,
    async getSensorInfo() {
      native.calls.info++;
      return {
        mode: native.mode,
        available: true,
        name: "Test sensor",
        vendor: "Test",
        type: 19,
        debug: true,
        permission: native.permission,
      };
    },
    async getState() {
      return { ...native.state };
    },
    async checkPermissions() {
      return { activityRecognition: native.permission };
    },
    async requestPermissions() {
      native.calls.request++;
      if (native.permissionGate) await native.permissionGate.promise;
      return { activityRecognition: native.permission };
    },
    async startTracking({ sessionId }) {
      native.calls.start++;
      if (native.startGate) await native.startGate.promise;
      native.state = {
        ...baseState(),
        mode: native.mode,
        sessionId,
        trackingRequested: true,
        trackingActive: true,
        listenerRegistered: true,
        listenerRemoved: false,
        sensorStarted: true,
        sessionStartedMs: Date.now(),
      };
      for (const fn of native.handlers.trackingStateChanged) fn({ ...native.state });
      return { ...native.state };
    },
    async stopTracking() {
      native.calls.stop++;
      if (native.stopFails) throw new Error("native unregister failed");
      Object.assign(native.state, {
        trackingRequested: false,
        trackingActive: false,
        listenerRegistered: false,
        listenerRemoved: true,
        sensorStarted: false,
        sessionStoppedMs: Date.now(),
      });
      for (const fn of native.handlers.trackingStateChanged) fn({ ...native.state });
      return { ...native.state };
    },
    async addListener(name, fn) {
      if (native.addGate && name === "measurement") await native.addGate.promise;
      if (native.addFails && name === "measurement") throw new Error("listener failed");
      native.handlers[name].add(fn);
      native.maxMeasurementListeners = Math.max(
        native.maxMeasurementListeners,
        native.handlers.measurement.size,
      );
      return {
        remove: async () => {
          native.handlers[name].delete(fn);
          native.removed.push(name);
        },
      };
    },
  };
  return native;
}
function payload(steps, overrides = {}) {
  return {
    ...test.native.state,
    sessionSteps: steps,
    sessionBaselineRaw: 10000,
    timestamp: Date.now(),
    rawValue: 10000 + steps,
    steps: 90000 + steps,
    ...overrides,
  };
}
async function emit(steps, overrides = {}) {
  await act(async () => {
    for (const fn of test.native.handlers.measurement) fn(payload(steps, overrides));
  });
}
function tree(show = true, userId = "test-user") {
  function Capture() {
    api = app.useActivity();
    return null;
  }
  return React.createElement(
    React.StrictMode,
    null,
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        app.ActivityProvider,
        { userId },
        React.createElement(Capture),
        show ? React.createElement(app.ActivityView) : null,
      ),
    ),
  );
}
async function mount(show = true, userId = "test-user") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => {
    view = render(tree(show, userId));
  });
  await waitFor(() => assert.equal(api.trackingStatus, "stopped"));
}
async function start() {
  await act(async () => {
    await api.startTracking();
  });
}
async function stop() {
  await act(async () => {
    await api.stopTracking();
  });
}

before(async () => {
  temporary = await mkdtemp(path.resolve(".tracking-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `
      export { ActivityProvider, useActivity } from './src/app/context/ActivityContext';
      export { ActivityView } from './src/app/views/ActivityView';
      export { vjAddMeasurementListener } from './src/app/lib/vj-pedometer';
    `,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    define: { "import.meta.env.MODE": '"test"' },
    plugins: [
      {
        name: "hardware-and-services",
        setup(builder) {
          const modules = {
            "@capacitor/core": `export const Capacitor={getPlatform:()=> 'android',isPluginAvailable:()=>globalThis.__svjTracking.available};export const registerPlugin=()=>new Proxy({}, {get:(_,key)=>globalThis.__svjTracking.native[key]});`,
            "./SVJContext": `const awardXp=(xp)=>globalThis.__svjTracking.xp.push(xp);const addActivity=(...args)=>globalThis.__svjTracking.feed.push(args);export const useSVJ=()=>({awardXp,addActivity});`,
            "@/lib/personalization.functions": `export const getBodyProfile=async()=>globalThis.__svjTracking.profile;`,
            "@tanstack/react-start": `export const useServerFn=fn=>fn;`,
            "motion/react": `import React from 'react';const cache={};export const motion=new Proxy({}, {get:(_,tag)=>cache[tag]??=(props)=>{const {children,initial,animate,transition,whileHover,...rest}=props;return React.createElement(tag,rest,children)}});`,
            recharts: `export const Bar=()=>null,CartesianGrid=Bar,Tooltip=Bar,XAxis=Bar,YAxis=Bar,BarChart=Bar;export const ResponsiveContainer=({children})=>children;`,
          };
          builder.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(modules, args.path) ? { path: args.path, namespace: "mock" } : null,
          );
          builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
            contents: modules[args.path],
            loader: "js",
            resolveDir: process.cwd(),
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(output).href);
});
beforeEach(() => {
  localStorage.clear();
  test = {
    native: makeNative(),
    available: true,
    xp: [],
    feed: [],
    profile: { weightKg: 70, heightCm: 170, sex: "male", bmr: 1600 },
  };
  globalThis.__svjTracking = test;
});
afterEach(async () => {
  await act(async () => cleanup());
  client?.clear();
});
after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

describe("user-controlled Activity tracking", { concurrency: false, timeout: 20_000 }, () => {
  it("mounts stopped in StrictMode, shows START, and reads sensor info without requesting permission", async () => {
    await mount();
    assert.equal(test.native.calls.start, 0);
    assert.equal(test.native.calls.request, 0);
    assert.equal(test.native.handlers.measurement.size, 0);
    assert.ok(screen.getByRole("button", { name: "START TRACKING" }));
    assert.ok(screen.getByText("Tracking stopped", { exact: true }));
    assert.ok(test.native.calls.info > 0);
    assert.match(document.body.textContent, /Plugin registered: yes/);
  });
  it("wires START/STOP buttons, session totals, native status and all required diagnostics", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "START TRACKING" }));
    await waitFor(() => assert.equal(api.trackingStatus, "tracking"));
    assert.equal(test.native.calls.start, 1);
    assert.equal(test.native.handlers.measurement.size, 1);
    await emit(0);
    assert.equal(api.todaySteps, 0);
    await emit(120);
    assert.equal(api.todaySteps, 120);
    assert.ok(screen.getByText("Tracking active", { exact: true }));
    for (const label of [
      "Plugin registered",
      "Sensor mode",
      "Sensor available",
      "Permission",
      "Tracking requested",
      "Tracking active",
      "Listener registered",
      "Listener removed",
      "Session baseline raw",
      "Session steps",
      "Selected sensor mode",
      "Active calories",
    ]) {
      assert.ok(document.body.textContent.includes(label), label);
    }
    fireEvent.click(screen.getByRole("button", { name: "STOP TRACKING" }));
    await waitFor(() => assert.equal(api.trackingStatus, "stopped"));
    assert.equal(test.native.state.listenerRegistered, false);
    assert.equal(test.native.handlers.measurement.size, 0);
    assert.equal(test.native.handlers.trackingStateChanged.size, 0);
    assert.match(document.body.textContent, /Listener removed: yes/);
  });
  it("never counts native all-day totals, and starts a second session from zero", async () => {
    await mount();
    await start();
    await emit(0);
    await emit(120);
    await stop();
    await start();
    await emit(0, { rawValue: 50000, steps: 70000 });
    assert.equal(api.todaySteps, 120);
    await emit(11);
    assert.equal(api.todaySteps, 131);
    assert.equal(test.native.maxMeasurementListeners, 1);
  });
  it("rejects late stopped events for steps, movement calories and XP", async () => {
    await mount();
    await start();
    await emit(100);
    const late = [...test.native.handlers.measurement][0];
    const event = payload(10000);
    await stop();
    const before = { steps: api.todaySteps, kcal: api.activeKcal, xp: test.xp.length };
    await act(async () => late(event));
    assert.deepEqual({ steps: api.todaySteps, kcal: api.activeKcal, xp: test.xp.length }, before);
    assert.ok(before.kcal > 0);
  });
  it("deduplicates events, rejects backward readings, and grants each tracked milestone once", async () => {
    await mount();
    await start();
    await emit(2499);
    await emit(2499);
    await emit(2400);
    assert.equal(api.todaySteps, 2499);
    assert.deepEqual(test.xp, []);
    await emit(2500);
    await emit(2500);
    assert.equal(api.todaySteps, 2500);
    assert.deepEqual(test.xp, [40]);
    await stop();
    await start();
    await emit(0);
    await emit(10);
    assert.deepEqual(test.xp, [40]);
    assert.equal(api.todaySteps, 2510);
    const saved = JSON.parse(localStorage.getItem("svj_activity_v1"));
    assert.deepEqual(saved.today.xpMilestones, [2500]);
  });
  it("preserves legacy calories without importing all-day steps into new calories or XP", async () => {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    localStorage.setItem(
      "svj_activity_v1",
      JSON.stringify({
        version: 1,
        days: [],
        today: {
          dateKey,
          steps: 10000,
          distanceMeters: 0,
          activeSeconds: 0,
          activeKcal: 42,
          totalKcal: 100,
          xpMilestones: [],
        },
      }),
    );
    await mount();
    assert.equal(api.activeKcal, 42);
    assert.deepEqual(test.xp, []);
    await start();
    await emit(0);
    await emit(1);
    assert.equal(api.milestoneSteps, 1);
    assert.ok(api.activeKcal >= 42 && api.activeKcal <= 43);
    assert.deepEqual(test.xp, []);
  });
  it("unmounts only ActivityView, stops its sensor and does not restart on return", async () => {
    await mount();
    await start();
    await emit(5);
    await act(async () => view.rerender(tree(false)));
    await waitFor(() => assert.equal(api.trackingStatus, "stopped"));
    assert.equal(test.native.state.trackingActive, false);
    assert.equal(test.native.handlers.measurement.size, 0);
    await act(async () => view.rerender(tree(true)));
    assert.equal(test.native.calls.start, 1);
    assert.equal(api.trackingActive, false);
  });
  it("cancels startup on provider unmount while permission is pending", async () => {
    test.native.permission = "prompt";
    test.native.permissionGate = deferred();
    await mount();
    let startup;
    await act(async () => {
      startup = api.startTracking();
    });
    await waitFor(() => assert.equal(test.native.calls.request, 1));
    await act(async () => view.unmount());
    test.native.permission = "granted";
    await act(async () => {
      test.native.permissionGate.resolve();
      await startup;
    });
    assert.equal(test.native.calls.start, 0);
    assert.equal(test.native.handlers.measurement.size, 0);
  });
  it("dispatches STOP during unresolved native START and removes any late registration", async () => {
    await mount();
    test.native.startGate = deferred();
    let startup, stopping;
    await act(async () => {
      startup = api.startTracking();
    });
    await waitFor(() => assert.equal(test.native.calls.start, 1));
    const stops = test.native.calls.stop;
    await act(async () => {
      stopping = api.stopTracking();
    });
    assert.ok(test.native.calls.stop > stops, "STOP must not wait for START response");
    await act(async () => {
      test.native.startGate.resolve();
      await startup;
      await stopping;
    });
    assert.equal(test.native.state.trackingActive, false);
    assert.equal(api.trackingRequested, false);
    assert.equal(test.native.handlers.measurement.size, 0);
  });
  it("removes a listener whose registration resolves after STOP", async () => {
    await mount();
    test.native.addGate = deferred();
    let startup, stopping;
    await act(async () => {
      startup = api.startTracking();
    });
    await waitFor(() => assert.equal(test.native.handlers.trackingStateChanged.size, 1));
    await act(async () => {
      stopping = api.stopTracking();
    });
    await act(async () => {
      test.native.addGate.resolve();
      await startup;
      await stopping;
    });
    assert.equal(test.native.calls.start, 0);
    assert.equal(test.native.handlers.measurement.size, 0);
    assert.equal(test.native.handlers.trackingStateChanged.size, 0);
  });
  it("denied permission and failed event registration leave no active listener", async () => {
    test.native.permission = "denied";
    await mount();
    await start();
    assert.equal(api.trackingStatus, "denied");
    assert.equal(test.native.calls.start, 0);
    test.native.permission = "granted";
    test.native.addFails = true;
    await start();
    assert.equal(api.trackingStatus, "unsupported");
    assert.equal(test.native.handlers.trackingStateChanged.size, 0);
    assert.equal(test.native.state.trackingActive, false);
  });
  it("reports failed native unregistration and allows STOP to be retried", async () => {
    await mount();
    await start();
    test.native.stopFails = true;
    await stop();
    assert.equal(api.trackingStatus, "error");
    assert.equal(api.debugInfo.listenerRemoved, false);
    assert.ok(screen.getByRole("button", { name: "RETRY STOP" }));
    test.native.stopFails = false;
    await stop();
    assert.equal(api.trackingStatus, "stopped");
    assert.equal(api.debugInfo.listenerRemoved, true);
  });
  it("native pause notification updates the UI and visibility does not restart tracking", async () => {
    await mount();
    await start();
    await act(async () => {
      await test.native.stopTracking();
    });
    await waitFor(() => assert.equal(api.trackingStatus, "stopped"));
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    assert.equal(test.native.calls.start, 1);
    assert.equal(api.trackingActive, false);
  });
  it("freezes movement calories if the body profile changes while stopped", async () => {
    await mount();
    await start();
    await emit(500);
    await stop();
    const kcal = api.activeKcal;
    await act(async () =>
      client.setQueryData(["activity-body-profile"], { weightKg: 120, heightCm: 190, bmr: 2000 }),
    );
    assert.equal(api.activeKcal, kcal);
    assert.ok(api.totalKcal >= kcal);
  });
  it("never restarts after remount and persists XP deduplication", async () => {
    await mount();
    await start();
    await emit(2500);
    await stop();
    await act(async () => view.unmount());
    await mount();
    assert.equal(test.native.calls.start, 1);
    assert.deepEqual(test.xp, [40]);
    await start();
    await emit(5);
    assert.deepEqual(test.xp, [40]);
  });
  it("two immediate START calls create just one native session", async () => {
    await mount();
    await act(async () => {
      await Promise.all([api.startTracking(), api.startTracking()]);
    });
    assert.equal(test.native.calls.start, 1);
    assert.equal(test.native.handlers.measurement.size, 1);
  });
  it("an old bridge cleanup cannot remove a newer handle", async () => {
    const first = await app.vjAddMeasurementListener(() => {}),
      second = await app.vjAddMeasurementListener(() => {});
    assert.equal(test.native.handlers.measurement.size, 2);
    await first();
    await first();
    assert.equal(test.native.handlers.measurement.size, 1);
    await second();
    assert.equal(test.native.handlers.measurement.size, 0);
  });
});
