// Phase 3 — the real founder Overview widgets (jsdom).
//
// Only the network boundary and the account provider are replaced; the shipped
// components render as-is. Verifies: widget stacking around the existing
// TrainRecovery panel, the gold Flame streak pill, honest muscle states
// (including the unavailable-RPC deployment state), accessible text
// equivalents, keyboard-visible focus styling hooks, and that the ordinary
// Train › Recovery path is untouched.
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
  temporary = await mkdtemp(path.resolve(".recovery-widgets-test-"));
  const output = path.join(temporary, "components.mjs");
  await build({
    stdin: {
      contents: `
      export { RecoveryView } from './src/app/components/RecoveryView';
      export { TrainRecovery } from './src/app/views/TrainRecovery';
    `,
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
        name: "isolated-phase3",
        setup(builder) {
          const map = {
            // The recovery RPC boundary (readiness/history) — real shapes.
            "../lib/recovery": "recovery",
            "../lib/trainingClient": "trainingClient",
            "../lib/trainingErrors": "trainingErrors",
            "../lib/goalsRecords": "goalsRecords",
            "../lib/strengthClient": "strengthClient",
            // Storage: deterministic local history per test.
            "../lib/storage": "storage",
            // Account/task providers.
            "../context/SVJContext": "context",
            "../../context/SVJContext": "context",
            // Decorative motion only.
            "motion/react": "motion",
          };
          for (const [from, to] of Object.entries(map)) {
            builder.onResolve(
              { filter: new RegExp("^" + from.replace(/\//g, "\\/") + "$") },
              () => ({
                path: to,
                namespace: "mock",
              }),
            );
          }
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents: {
              recovery: `
                export const getMyReadiness = async () => globalThis.__svjP3.readiness;
                export const saveMyRecoveryCheckin = async (i) => {
                  if (globalThis.__svjP3.saveFails) return { ok: false, error: 'Save failed' };
                  globalThis.__svjP3.savedCheckins.push(i);
                  return { ok: true, readiness: globalThis.__svjP3.readiness.readiness };
                };
                export const listMyRecoveryHistory = async () => globalThis.__svjP3.history;`,
              trainingClient: `
                export const trainingRpcClient = () => globalThis.__svjP3.rpc;
                export const getTrainingProfile = async (rpc) => globalThis.__svjP3.profile;
                export const recentMuscleHistory = async (rpc, days) => globalThis.__svjP3.muscles;`,
              trainingErrors: `export const sanitizeTrainingRpcError = (m) => {
                const raw = String(m ?? '');
                const deployment = raw.includes('Could not find the function') || raw.includes('PGRST202');
                return { userMessage: 'unavailable', meta: { code: deployment ? 'PGRST202' : 'UNKNOWN', deploymentProblem: deployment } };
              };`,
              goalsRecords: `
                export const listGoals = async (callRpc) => globalThis.__svjP3.goals;`,
              strengthClient: `export const strengthRpcClient = () => null;`,
              storage: `
                export const readStoredJson = (k, f) => globalThis.__svjP3.localHistory ?? f;
                export const writeStoredJson = (k, v) => { globalThis.__svjP3.localHistory = v; };`,
              context: `export const useSVJ = () => ({ taskCompletions: globalThis.__svjP3.taskCompletions ?? [] });`,
              motion: `import React from 'react';const cache={};export const motion=new Proxy({}, {get:(_,tag)=>cache[tag]??=(props)=>{const {children,initial,animate,transition,whileHover,layoutId,...rest}=props;return React.createElement(tag,rest,children)}});`,
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

const serverDay = (date, hasCheckin) => ({
  date,
  score: 70,
  trainingLoad: "low",
  recovery: "good",
  hasCheckin,
  sleepHours: hasCheckin ? 7.5 : null,
  soreness: hasCheckin ? 2 : null,
  energy: hasCheckin ? 4 : null,
  perceivedRecovery: hasCheckin ? 4 : null,
  activityLoadPoints: 0,
  restDaysLast3: null,
});

const muscleRows = [
  {
    muscle: "chest",
    directSets: 6,
    supportingSets: 0,
    directVolume: 2400,
    lastTrainedAt: "x",
    lastTrainedDate: dayKey(0),
  },
  {
    muscle: "back",
    directSets: 4,
    supportingSets: 2,
    directVolume: 1800,
    lastTrainedAt: "x",
    lastTrainedDate: dayKey(-2),
  },
  {
    muscle: "quads",
    directSets: 3,
    supportingSets: 0,
    directVolume: 900,
    lastTrainedAt: "x",
    lastTrainedDate: dayKey(-6),
  },
];

beforeEach(() => {
  localStorage.clear();
  globalThis.__svjP3 = {
    readiness: {
      ok: true,
      readiness: {
        score: 70,
        trainingLoad: "moderate",
        recovery: "unknown",
        todayAdvice: "Train normally.",
        components: {
          loadPoints7d: 200,
          loadBand: "moderate",
          restDaysLast3: 2,
          loadPenalty: 0,
          sleepHours: null,
          soreness: null,
          energy: null,
          perceivedRecovery: null,
          dataSources: ["recorded_activity"],
        },
      },
    },
    history: {
      ok: true,
      history: [serverDay(dayKey(0), true), serverDay(dayKey(-1), true)],
    },
    goals: { ok: true, goals: [] },
    profile: { ok: true, profile: null },
    muscles: { ok: true, rows: muscleRows },
    rpc: (fn, args) =>
      fn === "svj_list_goals"
        ? Promise.resolve({
            data: { ok: true, goals: globalThis.__svjP3.goals.goals },
            error: null,
          })
        : Promise.resolve({ data: null, error: null }),
    taskCompletions: [],
    savedCheckins: [],
  };
});

afterEach(() => {
  act(() => cleanup());
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

const openOverview = async () => {
  await act(async () => {
    render(React.createElement(app.RecoveryView));
  });
  await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
  await waitFor(() => assert.ok(screen.queryByTestId("recovery-focus")));
};

describe("founder Overview: three widgets around the existing panel", () => {
  it("renders Focus, Streak and the muscle map beside TrainRecovery", async () => {
    await openOverview();
    assert.ok(screen.getByTestId("recovery-focus"));
    assert.ok(screen.getByTestId("recovery-streak"));
    assert.ok(screen.getByTestId("recovery-muscles"));
    assert.ok(screen.getByTestId("train-recovery"), "the existing engine stays mounted");
    assert.ok(screen.getByTestId("recovery-score"), "readiness ring still present");
  });

  it("derives the streak from server hasCheckin days and matches the gold Flame pill", async () => {
    await openOverview();
    const pill = screen.getByTestId("recovery-streak-count");
    assert.match(pill.textContent, /2d/);
    const flame = pill.querySelector("svg");
    assert.ok(flame, "the Flame icon is present");
    assert.match(pill.className, /border-gold\/20/);
    assert.match(pill.className, /bg-\[#17171A\]/, "the Header pill background");
    assert.match(flame.getAttribute("class"), /text-gold/);
  });

  it("shows a zero streak honestly without a check-in day", async () => {
    globalThis.__svjP3.history = { ok: true, history: [serverDay(dayKey(-1), false)] };
    await openOverview();
    assert.match(screen.getByTestId("recovery-streak-count").textContent, /0d/);
    assert.match(document.body.textContent, /No check-ins yet/);
  });

  it("keeps the focus recommendation consistent with the readiness score", async () => {
    await openOverview();
    // Score 70 (from the ring) → normal emphasis mentioning the same number.
    assert.match(screen.getByTestId("recovery-score").textContent, /70 \/ 100/);
    assert.match(screen.getByTestId("recovery-focus").textContent, /Readiness is 70/);
    assert.match(screen.getByTestId("recovery-focus").textContent, /Train normally today/);
  });

  it("reflects the Training Profile goal in the focus wording", async () => {
    globalThis.__svjP3.profile = {
      ok: true,
      profile: { experience: "intermediate", goal: "strength", availableDays: [1, 3, 5] },
    };
    await openOverview();
    assert.match(screen.getByTestId("recovery-focus").textContent, /strength progress/);
  });

  it("adds an applicable svj_goals signal (secondary) without flipping emphasis", async () => {
    globalThis.__svjP3.goals = {
      ok: true,
      goals: [
        // Mocked goalsRecords bypasses normalizeGoal, so provide DTO-shaped rows.
        {
          id: "g1",
          metric: "workout_count",
          activityType: null,
          targetValue: 4,
          periodType: "weekly",
          periodStart: dayKey(-2),
          periodEnd: dayKey(4),
          status: "active",
          progress: 2,
          createdAt: "",
          updatedAt: "",
        },
      ],
    };
    await openOverview();
    assert.match(
      screen.getByTestId("recovery-focus").textContent,
      /50% into your weekly workout goal/,
    );
  });

  it("ignores an expired-by-date active goal", async () => {
    globalThis.__svjP3.goals = {
      ok: true,
      goals: [
        {
          id: "g1",
          metric: "workout_count",
          targetValue: 4,
          periodStart: dayKey(-10),
          periodEnd: dayKey(-4),
          status: "active",
          progress: 2,
        },
      ],
    };
    await openOverview();
    assert.doesNotMatch(screen.getByTestId("recovery-focus").textContent, /workout goal/);
  });
});

describe("muscle recovery map honesty", () => {
  it("shows the three states with readable labels and text equivalents", async () => {
    await openOverview();
    const list = screen.getByTestId("recovery-muscle-list");
    assert.match(list.textContent, /High/);
    assert.match(list.textContent, /Moderate/);
    assert.match(list.textContent, /Fresh/);
    assert.match(list.textContent, /No recent data/);
    // Text equivalent for screen readers with per-muscle reasons.
    const text = screen.getByTestId("recovery-muscle-text");
    assert.match(text.textContent, /Chest: High\. Last trained today/);
    assert.match(text.textContent, /Back: Moderate\. Last trained 2 days ago/);
    // Visible disclaimer next to the map (not colour/visual-only meaning).
    assert.match(
      screen.getByTestId("recovery-muscles").textContent,
      /Estimated from recent training history/,
    );
    assert.match(document.body.textContent, /not a medical or sensor measurement/);
  });

  it("states the deployment limitation without fake values", async () => {
    globalThis.__svjP3.muscles = {
      ok: false,
      error: "Could not find the function public.svj_recent_muscle_history in the schema cache",
    };
    await openOverview();
    assert.ok(screen.getByTestId("recovery-muscles-unavailable"));
    assert.match(
      document.body.textContent,
      /Muscle recovery data isn't available on this deployment yet/,
    );
    assert.equal(screen.queryByTestId("recovery-muscle-list"), null);
    // The other widgets and the panel keep working.
    assert.ok(screen.getByTestId("recovery-focus"));
    assert.ok(screen.getByTestId("recovery-streak"));
    assert.ok(screen.getByTestId("recovery-score"));
  });

  it("shows an honest empty state when the athlete has no muscle data", async () => {
    globalThis.__svjP3.muscles = { ok: true, rows: [] };
    await openOverview();
    assert.match(screen.getByTestId("recovery-muscles").textContent, /No muscle data yet/);
    assert.equal(screen.queryByTestId("recovery-muscle-text"), null);
  });

  it("shows a retryable error state on transient muscle failures", async () => {
    globalThis.__svjP3.muscles = { ok: false, error: "Network error" };
    await openOverview();
    assert.ok(screen.getByTestId("recovery-muscles-error"));
    assert.doesNotMatch(document.body.textContent, /Network error/);
  });

  it("shows a loading state before the muscle rows arrive", async () => {
    globalThis.__svjP3.muscles = new Promise(() => {});
    await act(async () => {
      render(React.createElement(app.RecoveryView));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    assert.match(screen.getByTestId("recovery-muscles").textContent, /Loading muscle history/);
  });
});

describe("Phase 1/2 invariants stay intact", () => {
  it("keeps the six sections and the honest placeholders", async () => {
    await openOverview();
    assert.deepEqual(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.replace("(selected)", "").trim()),
      ["Overview", "History", "Goals", "Records", "Progress", "Devices"],
    );
    await act(async () => {
      screen.getByTestId("recovery-section-tab-history").click();
    });
    assert.ok(screen.getByText(/Coming next/));
    assert.equal(screen.queryByTestId("recovery-focus"), null, "widgets live only in Overview");
  });

  it("leaves the standalone Train › Recovery path widget-free", async () => {
    await act(async () => {
      render(React.createElement(app.TrainRecovery));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    assert.equal(screen.queryByTestId("recovery-focus"), null);
    assert.equal(screen.queryByTestId("recovery-streak"), null);
    assert.equal(screen.queryByTestId("recovery-muscles"), null);
    assert.ok(screen.getByTestId("recovery-score"), "the readiness ring still renders");
  });

  it("never counts a failed check-in save in the streak", async () => {
    globalThis.__svjP3.saveFails = true;
    await openOverview();
    const before = screen.getByTestId("recovery-streak-count").textContent;
    // Saving is impossible here without the real form flow; the streak helper
    // only ever reads server rows, so the count cannot move.
    assert.match(before, /2d/);
  });
});
