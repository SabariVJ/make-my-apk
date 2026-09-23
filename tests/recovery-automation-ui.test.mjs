// Phase 2 — the real Recovery Overview component (jsdom).
//
// Only the network boundary is replaced (the recovery RPC client) and the
// account provider. The component itself is the shipped one, so these tests
// prove the behaviour the athlete actually sees:
//   - readiness is a real partial score with no check-in (never zero),
//   - completed tasks move the headline score (real task load, not a count),
//   - "Completed tasks" reports the real COUNT, separate from task LOAD,
//   - server-backed history is restored, and an unreachable server is stated
//     honestly instead of silently losing days.
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
  "HTMLButtonElement",
  "HTMLInputElement",
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

const { render, cleanup, screen, waitFor } = await import("@testing-library/react");
let temporary;
let app;

before(async () => {
  temporary = await mkdtemp(path.resolve(".recovery-automation-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `export { TrainRecovery } from './src/app/views/TrainRecovery';`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    define: { "import.meta.env.DEV": "false", "import.meta.env.MODE": '"test"' },
    plugins: [
      {
        name: "isolated-recovery-rpcs",
        setup(builder) {
          // The network boundary only — every payload is a real server shape.
          builder.onResolve({ filter: /^\.\.\/lib\/recovery$/ }, () => ({
            path: "recovery",
            namespace: "mock",
          }));
          builder.onResolve({ filter: /^\.\.\/context\/SVJContext$/ }, () => ({
            path: "context",
            namespace: "mock",
          }));
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents: {
              recovery: `
                export const getMyReadiness = async () => globalThis.__svjRecovery.readiness;
                export const saveMyRecoveryCheckin = async () => globalThis.__svjRecovery.save ?? { ok: false };
                export const listMyRecoveryHistory = async () => globalThis.__svjRecovery.history;`,
              context: `export const useSVJ = () => ({ taskCompletions: globalThis.__svjRecovery.taskCompletions });`,
            }[target],
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(output).href);
});

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/** A real completed-task ledger row in the trailing window. */
const task = (category, offset = 0, id = Math.random().toString(36).slice(2)) => ({
  id,
  challengeId: "c1",
  title: "Task",
  category,
  dayKey: dayKey(offset),
  completedAt: new Date().toISOString(),
  xpAwarded: 40,
  statCategory: "physical",
  statPoints: 3,
});

const readiness = (over = {}) => ({
  ok: true,
  readiness: {
    score: 70,
    trainingLoad: "moderate",
    recovery: "unknown",
    todayAdvice: "Train normally.",
    components: {
      loadPoints7d: 270,
      loadBand: "moderate",
      restDaysLast3: 0,
      loadPenalty: 0,
      sleepHours: null,
      soreness: null,
      energy: null,
      perceivedRecovery: null,
      dataSources: ["recorded_activity"],
    },
    ...over,
  },
});

beforeEach(() => {
  localStorage.clear();
  globalThis.__svjRecovery = {
    readiness: readiness(),
    history: { ok: true, history: [] },
    taskCompletions: [],
  };
});

afterEach(() => {
  act(() => cleanup());
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

const mount = async () => {
  await act(async () => {
    render(React.createElement(app.TrainRecovery));
  });
  await waitFor(() => assert.ok(screen.getByTestId("recovery-score")));
};

describe("Overview readiness is a real partial score", { concurrency: false }, () => {
  it("shows a meaningful score and no check-in state without any check-in", async () => {
    await mount();
    assert.match(screen.getByTestId("recovery-score").textContent, /70 \/ 100/);
    assert.ok(screen.getByText("No check-in yet"));
    assert.equal(screen.queryByTestId("recovery-low-flag"), null);
  });

  it("lets real completed tasks move the headline score", async () => {
    // 7 Physical tasks = 42 task-load points. Server activity alone (270) is a
    // moderate week; with the task load (312) it becomes a high-load week with
    // no rest day, so the combined score drops — the ring must show that.
    globalThis.__svjRecovery.taskCompletions = Array.from({ length: 7 }, (_, i) =>
      task("Physical", 0, `t${i}`),
    );
    await mount();
    assert.match(screen.getByTestId("recovery-score").textContent, /58 \/ 100/);
    assert.ok(screen.getByTestId("recovery-low-flag"), "58 is genuinely a low-readiness day");
    assert.match(document.body.textContent, /Recorded activity/);
  });

  it("uses the check-in to refine, not to unlock, the score", async () => {
    globalThis.__svjRecovery.readiness = readiness({
      score: 88,
      recovery: "excellent",
      components: {
        loadPoints7d: 100,
        loadBand: "low",
        restDaysLast3: 2,
        loadPenalty: 0,
        sleepHours: 8,
        soreness: 1,
        energy: 5,
        perceivedRecovery: 5,
        dataSources: ["recorded_activity", "user_checkin"],
      },
    });
    await mount();
    assert.equal(screen.queryByText("No check-in yet"), null);
    assert.ok(screen.getByText("excellent"));
    // The same transparent formula the server uses, recomputed client-side so
    // real task load is included: 70 base, blended with an excellent check-in.
    assert.match(screen.getByTestId("recovery-score").textContent, /90 \/ 100/);
    assert.equal(screen.getByLabelText("Sleep (hours)").value, "8");
  });
});

describe("completed tasks are reported honestly", { concurrency: false }, () => {
  it("separates the real task count from the task load it contributed", async () => {
    globalThis.__svjRecovery.taskCompletions = [
      task("Physical"),
      task("Physical"),
      task("Nutrition"),
      task("Mental"),
    ];
    await mount();
    const count = screen.getByTestId("recovery-completed-tasks");
    const load = screen.getByTestId("recovery-task-load");
    // 2×Physical (6) + Nutrition (4) + Mental (3) = 19 points from 4 tasks.
    assert.match(count.textContent, /4/);
    assert.match(count.textContent, /tasks \/ 7d/);
    assert.match(load.textContent, /19/);
    assert.match(load.textContent, /pts \/ 7d/);
    assert.doesNotMatch(count.textContent, /19/);
  });

  it("ignores unchecked and out-of-window completions", async () => {
    globalThis.__svjRecovery.taskCompletions = [
      task("Physical"),
      { ...task("Physical"), undoneAt: new Date().toISOString() },
      task("Physical", -10),
      task("Physical", -40),
    ];
    await mount();
    assert.match(screen.getByTestId("recovery-completed-tasks").textContent, /1/);
    assert.match(screen.getByTestId("recovery-task-load").textContent, /6/);
  });

  it("shows zero work honestly when nothing was completed", async () => {
    await mount();
    assert.match(screen.getByTestId("recovery-completed-tasks").textContent, /0/);
    assert.match(screen.getByTestId("recovery-task-load").textContent, /0/);
  });
});

describe("history accumulates from the server", { concurrency: false }, () => {
  it("restores real check-in values and sleeps from the server history", async () => {
    globalThis.__svjRecovery.history = {
      ok: true,
      history: [
        {
          date: dayKey(-1),
          score: 74,
          trainingLoad: "low",
          recovery: "good",
          hasCheckin: true,
          sleepHours: 7.5,
          soreness: 2,
          energy: 4,
          perceivedRecovery: 4,
          activityLoadPoints: 44,
          restDaysLast3: 1,
        },
      ],
    };
    await mount();
    // The reinstalled device had no local days at all: this one came from the
    // server, with the athlete's own recorded sleep.
    assert.match(document.body.textContent, /7\.5h/);
    assert.match(document.body.textContent, /1 server days recorded/);
    assert.match(document.body.textContent, /Not enough history yet/);
  });

  it("states honestly when the server history is unreachable", async () => {
    globalThis.__svjRecovery.history = { ok: false, error: "boom" };
    await mount();
    const note = screen.getByTestId("recovery-history-note");
    assert.match(note.textContent, /Server history is unavailable right now/);
    assert.match(note.textContent, /Nothing is invented/);
    assert.doesNotMatch(document.body.textContent, /boom/, "raw RPC errors never surface");
  });

  it("never fabricates a trend point for a day with no data", async () => {
    globalThis.__svjRecovery.history = {
      ok: true,
      history: [
        {
          date: dayKey(-2),
          score: 66,
          trainingLoad: "low",
          recovery: "good",
          hasCheckin: false,
          sleepHours: null,
          soreness: null,
          energy: null,
          perceivedRecovery: null,
          activityLoadPoints: 0,
          restDaysLast3: null,
        },
      ],
    };
    await mount();
    const trend = screen.getByTestId("recovery-7day-trend");
    assert.match(trend.textContent, /66/, "the one real server day is plotted");
    assert.match(trend.textContent, /1 server days recorded/);
    // Real bars are opaque and scored; the five days with no data stay empty
    // rather than being plotted as a zero score.
    assert.equal(trend.querySelectorAll('div[style*="opacity: 0.85"]').length, 2);
    assert.equal(trend.querySelectorAll('div[style*="height: 0%"]').length, 5);
    assert.equal(trend.querySelectorAll("span").length > 0, true);
  });
});
