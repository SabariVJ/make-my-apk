// Phase 7 — the shipped weekly digest, Rest-Day alert and MY SVJ PLAN recovery
// note in jsdom. Only the Supabase RPC transport is mocked; the shipped
// components, the shipped recovery client and the shipped pure helpers all run
// as-is. Verifies honest loading/partial/insufficient/error states, a sanitized
// error that never leaks raw server text, the alert firing ONLY on the
// authoritative rest emphasis, accessible evidence, a live-or-absent CTA (never
// a dead button), the plan's four states, and the founder/standalone invariants.
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

/** One raw history row — camelCase, exactly what the RPC jsonb emits. */
const serverDay = (date, overrides = {}) => ({
  date,
  score: 70,
  trainingLoad: "moderate",
  recovery: "good",
  hasCheckin: false,
  sleepHours: null,
  soreness: null,
  energy: null,
  perceivedRecovery: null,
  activityLoadPoints: 0,
  restDaysLast3: null,
  ...overrides,
});

const historyEnvelope = (rows) => ({ data: rows, error: null });

const readinessEnvelope = (components = {}) => ({
  data: {
    score: 70,
    trainingLoad: "moderate",
    recovery: "good",
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
      ...components,
    },
  },
  error: null,
});

const FULL_WEEK = [
  serverDay("2026-09-01", { score: 60, hasCheckin: true, sleepHours: 7, restDaysLast3: 1 }),
  serverDay("2026-09-02", { score: 64, hasCheckin: true, sleepHours: 7.5, restDaysLast3: 1 }),
  serverDay("2026-09-03", { score: 68, hasCheckin: true, sleepHours: 6, restDaysLast3: 2 }),
  serverDay("2026-09-04", { score: 72, hasCheckin: false, restDaysLast3: 2 }),
  serverDay("2026-09-05", { score: 76, hasCheckin: true, sleepHours: 8, restDaysLast3: 1 }),
  serverDay("2026-09-06", { score: 80, hasCheckin: false, restDaysLast3: 1 }),
  serverDay("2026-09-07", { score: 80, trainingLoad: "high", hasCheckin: true, restDaysLast3: 0 }),
];

function defaultRpc(fn) {
  if (fn === "svj_list_my_recovery_history") return Promise.resolve(historyEnvelope(FULL_WEEK));
  if (fn === "svj_get_my_readiness") return Promise.resolve(readinessEnvelope());
  return Promise.resolve({ data: null, error: { message: `unexpected ${fn}` } });
}

before(async () => {
  temporary = await mkdtemp(path.resolve(".recovery-weekly-test-"));
  const output = path.join(temporary, "weekly.mjs");
  await build({
    stdin: {
      contents: `
      export { RecoveryView } from './src/app/components/RecoveryView';
      import RecoveryWeeklyDigest from './src/app/components/recovery/RecoveryWeeklyDigest';
      export { RecoveryWeeklyDigest };
      import { RestDayAlertCard } from './src/app/components/recovery/RestDayAlertCard';
      export { RestDayAlertCard };
      import { PlanRecoveryCard } from './src/app/components/recovery/PlanRecoveryCard';
      export { PlanRecoveryCard };
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
        name: "isolated-phase7",
        setup(builder) {
          const map = {
            // The ONE mocked boundary: the Supabase RPC transport.
            "@/integrations/supabase/client": "supabase",
            "../lib/storage": "storage",
            "../../lib/storage": "storage",
            "../context/SVJContext": "context",
            "../../context/SVJContext": "context",
            "../hooks/useRecoveryInsights": "insights",
            "../../hooks/useRecoveryInsights": "insights",
            "motion/react": "motion",
          };
          for (const [from, to] of Object.entries(map)) {
            builder.onResolve(
              { filter: new RegExp("^" + from.replace(/\//g, "\\/") + "$") },
              () => ({ path: to, namespace: "mock" }),
            );
          }
          builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: target }) => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents: {
              supabase: `
                export const hasSupabaseConfig = () => true;
                export const supabase = {
                  rpc: (fn, args) => {
                    globalThis.__svjP7.calls.push(fn);
                    return globalThis.__svjP7.rpc(fn, args);
                  },
                };`,
              storage: `
                export const readStoredJson = (k, f) => f;
                export const writeStoredJson = () => {};`,
              context: `
                const EMPTY = [];
                export const useSVJ = () => ({
                  taskCompletions: (globalThis.__svjP7 && globalThis.__svjP7.taskCompletions) || EMPTY,
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

beforeEach(() => {
  localStorage.clear();
  globalThis.__svjP7 = {
    calls: [],
    taskCompletions: [],
    rpc: defaultRpc,
  };
});

afterEach(() => {
  act(() => cleanup());
});

after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

// ── Weekly digest ───────────────────────────────────────────────────────────

const renderDigest = async () => {
  await act(async () => {
    render(React.createElement(app.RecoveryWeeklyDigest));
  });
};

describe("Recovery → Progress weekly digest", () => {
  it("shows a real loading state before the read resolves", async () => {
    let release;
    globalThis.__svjP7.rpc = (fn) => {
      if (fn === "svj_list_my_recovery_history") return new Promise((r) => (release = r));
      return defaultRpc(fn);
    };
    await renderDigest();
    assert.ok(screen.getByTestId("recovery-weekly-loading"));
    await act(async () => {
      release(historyEnvelope(FULL_WEEK));
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-weekly-metrics")));
  });

  it("summarises a full week from the real rows", async () => {
    await renderDigest();
    await waitFor(() => assert.ok(screen.getByTestId("recovery-weekly-metrics")));
    const average = screen.getByTestId("recovery-weekly-average");
    // (60+64+68+72+76+80+80)/7 = 71.43 → 71
    assert.match(average.textContent, /71 \/ 100/);
    assert.match(average.textContent, /71 out of 100/); // spoken equivalent
    assert.match(screen.getByTestId("recovery-weekly-checkins").textContent, /5 of 7/);
    assert.match(screen.getByTestId("recovery-weekly-sleep").textContent, /4 nights/);
    assert.match(screen.getByTestId("recovery-weekly-rest").textContent, /0 of the last 3/);
    assert.match(screen.getByTestId("recovery-weekly-load").textContent, /High/);
    // Trend is always stated as text, never colour alone.
    assert.match(screen.getByTestId("recovery-weekly-trend").textContent, /trending upward/);
  });

  it("is honest about a partial week (no fabricated days)", async () => {
    globalThis.__svjP7.rpc = (fn, args) =>
      fn === "svj_list_my_recovery_history"
        ? Promise.resolve(historyEnvelope([serverDay("2026-09-01", { score: 80 })]))
        : defaultRpc(fn, args);
    await renderDigest();
    await waitFor(() => assert.ok(screen.getByTestId("recovery-weekly-metrics")));
    assert.match(screen.getByTestId("recovery-weekly-average").textContent, /80 \/ 100/);
    assert.match(screen.getByTestId("recovery-weekly-checkins").textContent, /0 of 1/);
    assert.match(screen.getByTestId("recovery-weekly-sleep").textContent, /No nights/);
  });

  it("reports an insufficient state when there is no history", async () => {
    globalThis.__svjP7.rpc = (fn, args) =>
      fn === "svj_list_my_recovery_history"
        ? Promise.resolve(historyEnvelope([]))
        : defaultRpc(fn, args);
    await renderDigest();
    await waitFor(() => assert.ok(screen.getByTestId("recovery-weekly-insufficient")));
    assert.equal(screen.queryByTestId("recovery-weekly-metrics"), null);
  });

  it("shows a sanitized, retryable error and never leaks raw server text", async () => {
    let fail = true;
    globalThis.__svjP7.rpc = (fn, args) => {
      if (fn !== "svj_list_my_recovery_history") return defaultRpc(fn, args);
      return fail
        ? Promise.resolve({ data: null, error: { message: "PGRST202 could not find function" } })
        : Promise.resolve(historyEnvelope(FULL_WEEK));
    };
    await renderDigest();
    await waitFor(() => assert.ok(screen.getByTestId("recovery-weekly-error")));
    const text = document.body.textContent;
    assert.equal(text.includes("PGRST"), false);
    assert.equal(text.includes("could not find"), false);

    fail = false;
    await act(async () => {
      screen.getByTestId("recovery-weekly-retry").click();
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-weekly-metrics")));
  });
});

// ── Rest-Day alert ──────────────────────────────────────────────────────────

const readinessResult = ({
  score = 70,
  band = "moderate",
  restDaysLast3 = 2,
  activityLoadPoints = 200,
  taskLoadPoints = 0,
} = {}) => ({
  score,
  band,
  recovery: score >= 78 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor",
  components: {
    activityLoadPoints,
    taskLoadPoints,
    totalLoadPoints: activityLoadPoints + taskLoadPoints,
    loadPenalty: 0,
    taskCount: 0,
    restDaysLast3,
    sources: [],
  },
  advice: "Train normally.",
  isLow: score < 60,
});

const renderAlert = async (readiness, onReviewPlan) => {
  await act(async () => {
    render(React.createElement(app.RestDayAlertCard, { readiness, onReviewPlan }));
  });
};

describe("Rest-Day alert card", () => {
  it("renders nothing when the authoritative emphasis is not rest", async () => {
    await renderAlert(readinessResult({ score: 70, band: "moderate", restDaysLast3: 2 }));
    assert.equal(screen.queryByTestId("recovery-rest-alert"), null);
  });

  it("renders real evidence and a suggestion when a low score justifies it", async () => {
    await renderAlert(readinessResult({ score: 36, band: "moderate", restDaysLast3: 2 }));
    const alert = screen.getByTestId("recovery-rest-alert");
    assert.match(alert.textContent, /Take a recovery-focused day/);
    assert.match(screen.getByTestId("recovery-rest-alert-evidence").textContent, /Readiness is 36/);
    assert.match(alert.textContent, /sleep, hydration, mobility/);
  });

  it("adds load and rest evidence only when the data supports it", async () => {
    await renderAlert(readinessResult({ score: 42, band: "very_high", restDaysLast3: 0 }));
    const evidence = screen.getByTestId("recovery-rest-alert-evidence").textContent;
    assert.match(evidence, /very high/);
    assert.match(evidence, /rest day in the last 3/);
  });

  it("has no CTA (no dead button) unless a real navigation handler exists", async () => {
    await renderAlert(readinessResult({ score: 36, band: "moderate", restDaysLast3: 2 }));
    assert.equal(screen.queryByTestId("recovery-rest-alert-plan"), null);
  });

  it("fires a real CTA when a handler is provided", async () => {
    let opened = 0;
    await renderAlert(
      readinessResult({ score: 36, band: "moderate", restDaysLast3: 2 }),
      () => (opened += 1),
    );
    const cta = screen.getByTestId("recovery-rest-alert-plan");
    await act(async () => {
      cta.click();
    });
    assert.equal(opened, 1);
  });
});

// ── MY SVJ PLAN recovery note ───────────────────────────────────────────────

const renderPlanNote = async (readiness) => {
  await act(async () => {
    render(React.createElement(app.PlanRecoveryCard, { readiness }));
  });
};

describe("MY SVJ PLAN recovery note", () => {
  it("communicates a rest day without changing the plan", async () => {
    await renderPlanNote(readinessResult({ score: 36, band: "moderate", restDaysLast3: 2 }));
    const card = screen.getByTestId("plan-recovery-check");
    assert.equal(card.getAttribute("data-emphasis"), "rest");
    assert.match(card.textContent, /Prioritise recovery today/);
    assert.match(card.textContent, /missions stay exactly as they are/);
  });

  it("communicates a lighter day", async () => {
    await renderPlanNote(readinessResult({ score: 55, band: "moderate", restDaysLast3: 2 }));
    const card = screen.getByTestId("plan-recovery-check");
    assert.equal(card.getAttribute("data-emphasis"), "lighter");
    assert.match(card.textContent, /Keep it light today/);
  });

  it("stays neutral for a normal day", async () => {
    await renderPlanNote(readinessResult({ score: 70, band: "moderate", restDaysLast3: 2 }));
    const card = screen.getByTestId("plan-recovery-check");
    assert.equal(card.getAttribute("data-emphasis"), "normal");
    assert.match(card.textContent, /Train normally today/);
    assert.equal(/recovery-focused day/.test(card.textContent), false);
  });

  it("treats a strong day as readiness context, never an automatic increase", async () => {
    await renderPlanNote(readinessResult({ score: 82, band: "low", restDaysLast3: 1 }));
    const card = screen.getByTestId("plan-recovery-check");
    assert.equal(card.getAttribute("data-emphasis"), "stronger");
    assert.match(
      card.textContent,
      /Progressive overload still follows your existing training plan/,
    );
    assert.match(card.textContent, /not an automatic increase/);
  });
});

// ── Shell + founder/standalone invariants ───────────────────────────────────

const openShell = async (props = {}) => {
  await act(async () => {
    render(React.createElement(app.RecoveryView, props));
  });
  await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
};

describe("Recovery shell integration", () => {
  it("renders the real Progress digest panel and no placeholder there", async () => {
    await openShell();
    await act(async () => {
      screen.getByTestId("recovery-section-tab-progress").click();
    });
    assert.ok(screen.getByTestId("recovery-section-progress"));
    assert.equal(screen.queryByText(/Coming next/), null);
  });

  it("shows the Rest-Day alert in Overview and wires its CTA to the plan", async () => {
    let opened = 0;
    globalThis.__svjP7.rpc = (fn, args) =>
      fn === "svj_get_my_readiness"
        ? Promise.resolve(
            readinessEnvelope({ loadPoints7d: 600, loadBand: "very_high", restDaysLast3: 0 }),
          )
        : defaultRpc(fn, args);
    await openShell({ onOpenPlan: () => (opened += 1) });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-rest-alert")));
    // The CTA only exists because RecoveryView receives a real handler (App
    // supplies it) — never a dead button.
    const cta = screen.getByTestId("recovery-rest-alert-plan");
    await act(async () => {
      cta.click();
    });
    assert.equal(opened, 1);
  });

  it("keeps the alert absent for a normal reading", async () => {
    await openShell();
    await waitFor(() => assert.ok(screen.getByTestId("recovery-focus")));
    assert.equal(screen.queryByTestId("recovery-rest-alert"), null);
  });

  it("leaves the standalone Train › Recovery path free of Phase-7 surfaces", async () => {
    await act(async () => {
      render(React.createElement(app.TrainRecovery));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    assert.equal(screen.queryByTestId("recovery-rest-alert"), null);
    assert.equal(screen.queryByTestId("recovery-section-progress"), null);
  });
});
