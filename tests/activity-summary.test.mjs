// Activity UI cleanup regression (Phase A of release hardening).
//
// Asserts two things and nothing about pixels:
//   1. Behaviourally — the real ActivityView renders the Avg Steps / Best Day /
//      Avg KCAL period summaries and NO chart surface for them.
//   2. Structurally — the Activity source cannot silently grow the two removed
//      bar graphs (steps, estimated calories) back in, and never re-imports a
//      charting library for this screen.
//
// Only the Activity provider and the sibling sections ActivityView imports are
// replaced; the view itself is the shipped component.
import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  "HTMLButtonElement",
  "Element",
  "Node",
  "CustomEvent",
  "Event",
  "MutationObserver",
  "DocumentFragment",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "window" ? dom.window : dom.window[key],
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;

const { render, cleanup, screen } = await import("@testing-library/react");

// A stable snapshot object: an Activity provider that re-created its value on
// every read would loop the view's persist/subscribe effects.
const EMPTY_DEBUG = {};
const ACTIVITY = {
  todaySteps: 8123,
  milestoneSteps: 7500,
  stepGoal: 10000,
  stepPercent: 81,
  remainingSteps: 1877,
  activeKcal: 412,
  totalKcal: 1930,
  kcalGoal: 600,
  kcalPercent: 69,
  xpEarnedToday: 100,
  serverActivityXpToday: 100,
  trackingStatus: "stopped",
  trackingRequested: false,
  trackingActive: false,
  startTracking: async () => {},
  stopTracking: async () => {},
  getSensorInfo: async () => {},
  statusMessage: "Step tracking is stopped.",
  stepSource: "counter",
  summary7: {
    averageSteps: 7842,
    bestDay: { label: "Sat", steps: 11405 },
    averageActiveKcal: 388,
  },
  summary30: {
    averageSteps: 7311,
    bestDay: { label: "Sun", steps: 12980 },
    averageActiveKcal: 355,
  },
  debugInfo: EMPTY_DEBUG,
  showDiagnostics: false,
};

let temporary;
let app;

before(async () => {
  temporary = await mkdtemp(path.resolve(".svj-activity-summary-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `export { ActivityView } from './src/app/views/ActivityView';`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    define: { "import.meta.env.DEV": "false" },
    plugins: [
      {
        name: "isolated-activity",
        setup(builder) {
          // The provider owns native plugins and Supabase; the summary numbers
          // it feeds the view are what this suite is about.
          builder.onResolve({ filter: /^\.\.\/context\/ActivityContext$/ }, () => ({
            path: "context",
            namespace: "mock",
          }));
          for (const section of [
            "ActivityHistory",
            "TrainGoals",
            "TrainRecovery",
            "RouteLibrary",
            "RecordsView",
            "ConnectedDevicesView",
            "WorkoutRecorder",
          ]) {
            builder.onResolve({ filter: new RegExp(`^\\./${section}$`) }, () => ({
              path: section.toLowerCase(),
              namespace: "mock",
            }));
          }
          builder.onResolve({ filter: /^motion\/react$/ }, () => ({
            path: "motion",
            namespace: "mock",
          }));
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents: {
              context: `export const useActivityOptional = () => globalThis.__svjActivity;`,
              activityhistory:
                "export const ActivityHistory = () => null; export const CompletedSessionCard = () => null;",
              traingoals:
                "export const TrainGoals = () => null; export const TrainProgress = () => null;",
              trainrecovery: "export const TrainRecovery = () => null;",
              routelibrary: "export const RouteLibrary = () => null;",
              recordsview: "export const RecordsView = () => null;",
              connecteddevicesview: "export const ConnectedDevicesView = () => null;",
              workoutrecorder: "export const WorkoutRecorder = () => null;",
              motion: `import React from 'react';const cache={};export const motion=new Proxy({}, {get:(_,tag)=>cache[tag]??=(props)=>{const {children,initial,animate,transition,whileHover,whileTap,layoutId,...rest}=props;return React.createElement(tag,rest,children)}});export const useReducedMotion=()=>true;export const AnimatePresence=({children})=>children;`,
            }[target],
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(output).href);
});

afterEach(() => {
  act(() => cleanup());
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

describe("Activity period summaries replace the removed charts", { concurrency: false }, () => {
  it("keeps Avg Steps, Best Day and Avg KCAL for both periods and drops every chart surface", async () => {
    globalThis.__svjActivity = ACTIVITY;
    await act(async () => {
      render(React.createElement(app.ActivityView));
    });

    const cards = screen.getAllByTestId("activity-period-summary");
    assert.equal(cards.length, 2, "both the 7-day and 30-day summaries still render");

    for (const card of cards) {
      assert.match(card.textContent, /Avg Steps/);
      assert.match(card.textContent, /Best Day/);
      assert.match(card.textContent, /Avg KCAL/);
      assert.doesNotMatch(card.textContent, /Daily Steps/);
      assert.doesNotMatch(card.textContent, /Daily Calories Burned/);
      // No empty chart container left behind: the card holds no charting
      // surface and no fixed-height (h-[160px]) chart box. The header still has
      // its decorative lucide icon, which is not a chart.
      assert.equal(card.querySelectorAll("[class*='recharts'], canvas").length, 0);
      assert.doesNotMatch(card.className, /h-\[160px\]/);
      assert.equal(card.querySelectorAll("[height='160']").length, 0);
    }

    assert.deepEqual(
      cards.map((card) => /Last (7|30) Days/.exec(card.textContent)?.[0]),
      ["Last 7 Days", "Last 30 Days"],
    );

    // The real summary numbers are still rendered, not placeholders.
    assert.match(cards[0].textContent, /7,842/);
    assert.match(cards[0].textContent, /11,405/);
    assert.match(cards[0].textContent, /388/);
    assert.match(cards[1].textContent, /12,980/);

    // No charting library rendered anything anywhere on the screen.
    assert.equal(document.querySelector(".recharts-wrapper"), null);
    assert.equal(document.querySelector(".recharts-surface"), null);
    assert.doesNotMatch(document.body.textContent, /Daily Steps/);
    assert.doesNotMatch(document.body.textContent, /Daily Calories Burned/);
  });

  it("keeps the honest empty state when there is no best day yet", async () => {
    globalThis.__svjActivity = {
      ...ACTIVITY,
      summary7: { averageSteps: 0, bestDay: null, averageActiveKcal: 0 },
    };
    await act(async () => {
      render(React.createElement(app.ActivityView));
    });
    assert.match(screen.getAllByTestId("activity-period-summary")[0].textContent, /—/);
  });

  it("makes the removed graphs impossible to reintroduce by accident", async () => {
    const source = await readFile("src/app/views/ActivityView.tsx", "utf8");
    assert.doesNotMatch(source, /from "recharts"/, "Activity must not re-import a chart library");
    assert.doesNotMatch(source, /ResponsiveContainer|StepChart|KcalChart/);
    assert.doesNotMatch(
      source,
      /Daily Steps|Daily Calories Burned/,
      "the two removed graph titles must stay out of the source",
    );
    // The summary metrics must stay.
    for (const label of ["Avg Steps", "Best Day", "Avg KCAL"]) {
      assert.ok(source.includes(label), `${label} must remain in ActivityView`);
    }
  });

  it("still reads the period summaries from the provider (no aggregation dropped)", async () => {
    const source = await readFile("src/app/views/ActivityView.tsx", "utf8");
    assert.match(source, /summary7/);
    assert.match(source, /summary30/);
    assert.match(source, /averageSteps/);
    assert.match(source, /averageActiveKcal/);
  });

  it("leaves the provider's history aggregation intact for other consumers", async () => {
    const source = await readFile("src/app/context/ActivityContext.tsx", "utf8");
    assert.match(source, /history7/);
    assert.match(source, /history30/);
  });
});
