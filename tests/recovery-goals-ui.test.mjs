// Phase 5 — the real Recovery → Goals section in jsdom.
//
// Only the network boundary is replaced; the shipped component renders as-is.
// Verifies: the four Recovery metrics only, SVJSelect (no native <select>),
// create/edit/cancel flows, server-derived states, accessible progress, and
// that the shared goal surface stays compatible (TrainGoals activity-only,
// Today's Focus ignoring recovery metrics).
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

const { render, cleanup, fireEvent, screen, waitFor } = await import("@testing-library/react");
let temporary;
let app;

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

// Raw SQL row shape — the real normalizeGoal in goalsRecords runs in this bundle.
const goalDto = (overrides = {}) => ({
  id: "g-default",
  metric: "recovery_checkin_count",
  activity_type: null,
  target_value: 5,
  period_type: "weekly",
  period_start: dayKey(-3),
  period_end: dayKey(3),
  status: "active",
  progress: 2,
  created_at: "",
  updated_at: "",
  ...overrides,
});

before(async () => {
  temporary = await mkdtemp(path.resolve(".recovery-goals-test-"));
  const output = path.join(temporary, "goals.mjs");
  await build({
    stdin: {
      contents: `
      export { RecoveryView } from './src/app/components/RecoveryView';
      import RecoveryGoalsSection from './src/app/components/recovery/RecoveryGoalsSection';
      export { RecoveryGoalsSection };
      import RecoveryHistorySection from './src/app/components/recovery/RecoveryHistorySection';
      export { RecoveryHistorySection };
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
        name: "isolated-phase5",
        setup(builder) {
          const map = {
            // Supabase client: the goal RPC boundary.
            "@/integrations/supabase/client": "supabase",
            // Recovery RPC boundary (real shapes) — used by TrainRecovery and
            // RecoveryHistorySection inside the full-shell renders.
            "../lib/recovery": "recovery",
            "../../lib/recovery": "recovery",
            // Storage + account providers (used by the other sections).
            "../lib/storage": "storage",
            "../../lib/storage": "storage",
            "../context/SVJContext": "context",
            "../../context/SVJContext": "context",
            "../hooks/useRecoveryInsights": "insights",
            "../../hooks/useRecoveryInsights": "insights",
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
              supabase: `
                export const hasSupabaseConfig = () => true;
                export const supabase = { rpc: (fn, args) => globalThis.__svjP5.rpc(fn, args) };`,
              recovery: `
                export const getMyReadiness = async () => ({
                  ok: true,
                  readiness: { score: 70, trainingLoad: 'moderate', recovery: 'good', todayAdvice: 'Train normally.', components: { loadPoints7d: 200, loadBand: 'moderate', restDaysLast3: 2, loadPenalty: 0, sleepHours: null, soreness: null, energy: null, perceivedRecovery: null, dataSources: ['recorded_activity'] } },
                });
                export const saveMyRecoveryCheckin = async () => ({ ok: false, error: 'skipped' });
                export const listMyRecoveryHistory = async () => ({ ok: true, history: [] });
                export const listMyRecoveryRecords = async () => ({ ok: true, records: [] });`,
              storage: `
                export const readStoredJson = (k, f) => f;
                export const writeStoredJson = () => {};`,
              context: `
                const EMPTY = [];
                export const useSVJ = () => ({
                  taskCompletions: (globalThis.__svjP5 && globalThis.__svjP5.taskCompletions) || EMPTY,
                });`,
              insights:
                "export const useRecoveryInsights = () => ({ goals: [], trainingProfile: { goal: null }, muscleRows: [], muscleAvailability: 'ready', loading: false, reload() {} });",
              motion: `import React from 'react';const cache={};export const motion=new Proxy({}, {get:(_,tag)=>cache[tag]??=(props)=>{const {children,initial,animate,transition,whileHover,layoutId,...rest}=props;return React.createElement(tag,rest,children)}});`,
            }[target],
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(output).href);
});

const okEnvelope = (goals) => ({ data: { ok: true, goals }, error: null });

beforeEach(() => {
  localStorage.clear();
  globalThis.__svjP5 = {
    goals: [],
    taskCompletions: [], // stable reference — TrainRecovery persists on change
    rpc: () => Promise.resolve(okEnvelope([])),
  };
});

afterEach(() => {
  act(() => cleanup());
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

const renderGoals = async () => {
  await act(async () => {
    render(React.createElement(app.RecoveryGoalsSection));
  });
  await waitFor(() =>
    assert.ok(
      screen.queryByTestId("recovery-goal-form") ?? screen.queryByTestId("recovery-goals-error"),
    ),
  );
};

describe("Recovery → Goals form", () => {
  it("offers exactly the four recovery metrics, no activity metrics", async () => {
    await renderGoals();
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goal-metric-trigger"));
    });
    const list = screen.getByRole("listbox");
    const labels = ["Recovery Check-ins", "7h+ Sleep Days", "Rest Days", "Ready Days (60+)"];
    for (const label of labels) assert.ok(list.textContent.includes(label), label);
    for (const banned of ["Workouts", "Steps", "Active Minutes", "Distance"]) {
      assert.equal(
        list.textContent.includes(banned),
        false,
        `${banned} must not appear in the Recovery form`,
      );
    }
    // No native <select> anywhere in the new form.
    assert.equal(document.querySelector("select"), null);
  });

  it("explains the qualifying condition without medical claims", async () => {
    await renderGoals();
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goal-metric-trigger"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("7h+ Sleep Days"));
    });
    assert.match(document.body.textContent, /reported 7\+ hours/);
    assert.doesNotMatch(document.body.textContent, /medical|clinical|doctor/i);
  });

  it("creates a goal via the server and refreshes the list", async () => {
    let created = null;
    globalThis.__svjP5.rpc = (fn, args) => {
      if (fn === "svj_create_goal") {
        created = args;
        return Promise.resolve({
          data: { ok: true, goal: goalDto({ id: "g-new", progress: 0 }) },
          error: null,
        });
      }
      return Promise.resolve(okEnvelope([goalDto({ id: "g-new", progress: 0 })]));
    };
    await renderGoals();
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goal-create"));
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-goal-card-g-new")));
    assert.equal(created.p_metric, "recovery_checkin_count");
    assert.equal(created.p_activity_type, null);
  });

  it("surfaces validation failures without a raw SQL identifier", async () => {
    globalThis.__svjP5.rpc = (fn) =>
      fn === "svj_create_goal"
        ? Promise.resolve({
            data: null,
            error: { message: "Recovery goal target cannot exceed the days in its period" },
          })
        : Promise.resolve(okEnvelope([]));
    await renderGoals();
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goal-create"));
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-goal-form-error")));
    assert.match(
      screen.getByTestId("recovery-goal-form-error").textContent,
      /target cannot exceed/i,
    );
  });

  it("clamps the client target mirror to the weekly period length", async () => {
    let created = null;
    globalThis.__svjP5.rpc = (fn, args) => {
      if (fn === "svj_create_goal") created = args;
      return Promise.resolve(okEnvelope([]));
    };
    await renderGoals();
    // Open the target select and confirm 8+ days are never offered on a week.
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goal-target-trigger"));
    });
    const options = screen.getByRole("listbox").textContent;
    assert.match(options, /7 days/);
    assert.doesNotMatch(options, /8 days/);
  });
});

describe("goal states from the server", () => {
  it("shows active progress with an accessible bar and edit/cancel controls", async () => {
    globalThis.__svjP5.rpc = () => Promise.resolve(okEnvelope([goalDto({ id: "g-a" })]));
    await renderGoals();
    const card = screen.getByTestId("recovery-goal-card-g-a");
    assert.match(card.textContent, /2 \/ 5 days/);
    const bar = card.querySelector('[role="progressbar"]');
    assert.equal(bar.getAttribute("aria-valuenow"), "40");
    assert.match(bar.getAttribute("aria-label"), /2 of 5 days/);
    assert.ok(screen.getByTestId("recovery-goal-edit-g-a"));
    assert.ok(screen.getByTestId("recovery-goal-cancel-g-a"));
  });

  it("edits the target through the server", async () => {
    let updated = null;
    globalThis.__svjP5.rpc = (fn, args) => {
      if (fn === "svj_update_goal") updated = args;
      return Promise.resolve(okEnvelope([goalDto({ id: "g-a", targetValue: 6 })]));
    };
    await renderGoals();
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goal-edit-g-a"));
    });
    await waitFor(() => assert.ok(updated));
    assert.equal(updated.p_target_value, 6);
  });

  it("cancels an active goal", async () => {
    let cancelled = null;
    let listed = false;
    globalThis.__svjP5.rpc = (fn, args) => {
      if (fn === "svj_cancel_goal") cancelled = args;
      if (fn === "svj_list_goals" && listed) {
        return Promise.resolve(okEnvelope([goalDto({ id: "g-a", status: "cancelled" })]));
      }
      if (fn === "svj_list_goals") listed = true;
      return Promise.resolve(okEnvelope([goalDto({ id: "g-a" })]));
    };
    await renderGoals();
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goal-cancel-g-a"));
    });
    await waitFor(() => assert.ok(cancelled));
    await waitFor(() =>
      assert.ok(screen.getByTestId("recovery-goal-card-g-a").textContent.includes("Cancelled")),
    );
  });

  it("renders completed and expired states from server truth", async () => {
    globalThis.__svjP5.rpc = () =>
      Promise.resolve(
        okEnvelope([
          goalDto({ id: "g-done", status: "completed", progress: 5 }),
          goalDto({ id: "g-old", status: "expired", progress: 2 }),
        ]),
      );
    await renderGoals();
    assert.ok(screen.getByTestId("recovery-goal-card-g-done").textContent.includes("Completed"));
    assert.ok(screen.getByTestId("recovery-goal-card-g-old").textContent.includes("Expired"));
    // Completed/expired goals offer no edit or cancel.
    assert.equal(screen.queryByTestId("recovery-goal-edit-g-done"), null);
    assert.equal(screen.queryByTestId("recovery-goal-cancel-g-old"), null);
  });

  it("shows an honest empty state, loading state and retryable error", async () => {
    await renderGoals();
    assert.ok(screen.getByTestId("recovery-goals-empty"));

    act(() => cleanup());
    // Loading state: the request hangs until the section is unmounted.
    let release;
    globalThis.__svjP5.rpc = () => new Promise((resolve) => (release = resolve));
    await act(async () => {
      render(React.createElement(app.RecoveryGoalsSection));
    });
    assert.ok(screen.getByTestId("recovery-goals-loading"));

    act(() => cleanup());
    release?.({ data: { ok: true, goals: [] }, error: null });

    globalThis.__svjP5.rpc = () =>
      Promise.resolve({
        data: null,
        error: { message: "Could not find the function public.svj_list_goals" },
      });
    await act(async () => {
      render(React.createElement(app.RecoveryGoalsSection));
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-goals-error")));
    assert.match(document.body.textContent, /aren't available on this deployment yet/);
    assert.doesNotMatch(document.body.textContent, /Could not find the function/);
    globalThis.__svjP5.rpc = () => Promise.resolve(okEnvelope([]));
    await act(async () => {
      fireEvent.click(screen.getByTestId("recovery-goals-retry"));
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-goals-empty")));
  });
});

describe("shared goal surface compatibility", () => {
  it("Goals is a real panel in the shell; Progress and Devices stay placeholders", async () => {
    await act(async () => {
      render(React.createElement(app.RecoveryView));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    await act(async () => {
      screen.getByTestId("recovery-section-tab-goals").click();
    });
    assert.ok(screen.getByTestId("recovery-section-goals"));
    // Records shipped in Phase 6 (with its own suite) — a real derived panel.
    await act(async () => {
      screen.getByTestId("recovery-section-tab-records").click();
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-section-records")));
    assert.equal(screen.queryByText(/Coming next/), null, "Records is no longer a placeholder");
    // Progress shipped in Phase 7 (its own suite) — a real weekly digest panel.
    await act(async () => {
      screen.getByTestId("recovery-section-tab-progress").click();
    });
    assert.ok(screen.getByTestId("recovery-section-progress"), "Progress is real now");
    for (const section of ["devices"]) {
      await act(async () => {
        screen.getByTestId(`recovery-section-tab-${section}`).click();
      });
      assert.ok(screen.getByText(/Coming next/), `${section} stays an honest placeholder`);
    }
  });

  it("keeps Today's Focus free of recovery-goal copy", async () => {
    // applicableActivityGoals is imported from the real module in this bundle —
    // verify the exclusion through the pure helper directly.
    const { applicableActivityGoals } = await import(
      pathToFileURL(path.resolve("src/app/lib/recoveryInsights.ts")).href
    );
    const goals = [
      {
        status: "active",
        periodStart: dayKey(-2),
        periodEnd: dayKey(4),
        metric: "recovery_checkin_count",
        progress: 3,
        targetValue: 5,
      },
      {
        status: "active",
        periodStart: dayKey(-2),
        periodEnd: dayKey(4),
        metric: "workout_count",
        progress: 2,
        targetValue: 4,
      },
    ];
    const result = applicableActivityGoals(goals);
    assert.equal(result.metric, "workout_count", "recovery metrics are skipped");
  });

  it("leaves the standalone Train › Recovery path goals-free", async () => {
    await act(async () => {
      render(React.createElement(app.TrainRecovery));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    assert.equal(screen.queryByTestId("recovery-section-goals"), null);
    assert.ok(screen.getByTestId("recovery-score"));
  });
});
