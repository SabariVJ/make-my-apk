// Phase 4 — the real Recovery → History section in jsdom.
//
// Only the recovery RPC boundary is replaced; the shipped component renders
// as-is. Verifies: scored/low/no-data cells, accessible labels, buttons with
// ≥44px targets, day detail, legend, sleep-correlation and best-sleep states,
// empty history, loading state, RPC failure/retry, and that the section lives
// only inside the founder Recovery destination.
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

before(async () => {
  temporary = await mkdtemp(path.resolve(".recovery-history-test-"));
  const output = path.join(temporary, "history.mjs");
  await build({
    stdin: {
      contents: `
      export { RecoveryView } from './src/app/components/RecoveryView';
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
        name: "isolated-phase4",
        setup(builder) {
          const map = {
            // The recovery RPC boundary — real shapes, mocked responses.
            "../lib/recovery": "recovery",
            "../../lib/recovery": "recovery",
            // Storage: deterministic local history per test.
            "../lib/storage": "storage",
            "../../lib/storage": "storage",
            // Account/task providers.
            "../context/SVJContext": "context",
            "../../context/SVJContext": "context",
            "../hooks/useRecoveryInsights": "insights",
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
                export const getMyReadiness = async () => globalThis.__svjP4.readiness;
                export const saveMyRecoveryCheckin = async () => ({ ok: true, readiness: globalThis.__svjP4.readiness.readiness });
                export const listMyRecoveryHistory = async (limit) => globalThis.__svjP4.history(limit);
                export const listMyRecoveryRecords = async () => ({ ok: true, records: [] });`,
              storage: `
                export const readStoredJson = (k, f) => globalThis.__svjP4.localHistory ?? f;
                export const writeStoredJson = (k, v) => { globalThis.__svjP4.localHistory = v; };`,
              context: `export const useSVJ = () => ({ taskCompletions: globalThis.__svjP4.taskCompletions ?? [] });`,
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

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const serverDay = (date, overrides = {}) => ({
  date,
  score: 70,
  trainingLoad: "low",
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

const okReadiness = {
  ok: true,
  readiness: {
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
    },
  },
};

beforeEach(() => {
  localStorage.clear();
  globalThis.__svjP4 = {
    readiness: okReadiness,
    history: () => Promise.resolve({ ok: true, history: [] }),
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

const renderHistory = async () => {
  await act(async () => {
    render(React.createElement(app.RecoveryHistorySection));
  });
  await waitFor(() =>
    assert.ok(
      screen.queryByTestId("recovery-history-grid") ??
        screen.queryByTestId("recovery-history-empty"),
    ),
  );
};

describe("Recovery → History heatmap", () => {
  it("renders scored days, low-score days and no-data days distinctly", async () => {
    globalThis.__svjP4.history = () =>
      Promise.resolve({
        ok: true,
        history: [
          serverDay(dayKey(0)),
          serverDay(dayKey(-1), { score: 22, recovery: "poor" }),
          // dayKey(-2) intentionally missing → no-data cell
        ],
      });
    await renderHistory();
    const grid = screen.getByTestId("recovery-history-grid");
    assert.match(grid.textContent, /◆/, "scored days carry a filled glyph");
    assert.match(grid.textContent, /✕/, "low-score days are scored, not missing");
    assert.match(grid.textContent, /·/, "missing days are a neutral no-data state");
    assert.ok(screen.getByTestId(`recovery-history-cell-${dayKey(-2)}`), "missing day has a cell");
    const missing = screen.getByTestId(`recovery-history-cell-${dayKey(-2)}`);
    assert.match(missing.getAttribute("aria-label"), /no recovery data/);
    const low = screen.getByTestId(`recovery-history-cell-${dayKey(-1)}`);
    assert.match(low.getAttribute("aria-label"), /readiness 22/);
  });

  it("exposes date, score, band and check-in state in the accessible label", async () => {
    globalThis.__svjP4.history = () =>
      Promise.resolve({
        ok: true,
        history: [serverDay(dayKey(0), { hasCheckin: true, sleepHours: 7.5 })],
      });
    await renderHistory();
    const label = screen
      .getByTestId(`recovery-history-cell-${dayKey(0)}`)
      .getAttribute("aria-label");
    assert.match(label, /readiness 70/);
    assert.match(label, /good/);
    assert.match(label, /check-in completed/);
    assert.match(label, /\d/); // a real date label
  });

  it("never fabricates a zero score for a missing date (label says no data)", async () => {
    globalThis.__svjP4.history = () =>
      Promise.resolve({ ok: true, history: [serverDay(dayKey(0))] });
    await renderHistory();
    const missing = screen.getByTestId(`recovery-history-cell-${dayKey(-1)}`);
    assert.doesNotMatch(missing.getAttribute("aria-label"), /readiness/);
    assert.match(missing.getAttribute("aria-label"), /no recovery data/);
  });

  it("keeps the server day key authoritative", async () => {
    globalThis.__svjP4.history = () =>
      Promise.resolve({ ok: true, history: [serverDay("2026-01-01", { score: 55 })] });
    await renderHistory();
    assert.ok(
      screen.getByTestId("recovery-history-cell-2026-01-01"),
      "server key preserved verbatim",
    );
  });

  it("shows the legend without colour-only meaning", async () => {
    globalThis.__svjP4.history = () =>
      Promise.resolve({ ok: true, history: [serverDay(dayKey(0))] });
    await renderHistory();
    const legend = screen.getByTestId("recovery-history-legend");
    assert.match(legend.textContent, /No data/);
    assert.match(legend.textContent, /Excellent/);
    assert.match(legend.textContent, /Poor/);
  });

  it("selects a day with a real button and shows its server detail", async () => {
    globalThis.__svjP4.history = () =>
      Promise.resolve({
        ok: true,
        history: [serverDay(dayKey(0), { hasCheckin: true, sleepHours: 7.5 })],
      });
    await renderHistory();
    assert.equal(screen.queryByTestId("recovery-history-day-detail"), null);
    const cell = screen.getByTestId(`recovery-history-cell-${dayKey(0)}`);
    assert.equal(cell.tagName, "BUTTON", "selectable days are buttons, not divs");
    await act(async () => {
      fireEvent.click(cell);
    });
    const detail = screen.getByTestId("recovery-history-day-detail");
    assert.match(detail.textContent, /Readiness/);
    assert.match(detail.textContent, /70/);
    assert.match(detail.textContent, /7\.5 h/);
    assert.match(detail.textContent, /Completed/);
    assert.equal(cell.getAttribute("aria-pressed"), "true");
  });

  it("shows an honest empty state with no history", async () => {
    await renderHistory();
    assert.ok(screen.getByTestId("recovery-history-empty"));
    assert.match(document.body.textContent, /No recovery history yet/);
  });

  it("shows a loading state before the rows arrive", async () => {
    globalThis.__svjP4.history = () => new Promise(() => {});
    await act(async () => {
      render(React.createElement(app.RecoveryHistorySection));
    });
    assert.ok(screen.getByTestId("recovery-history-loading"));
  });

  it("shows a retryable error state without raw RPC text", async () => {
    globalThis.__svjP4.history = () =>
      Promise.resolve({
        ok: false,
        error: "Could not find the function public.svj_list_my_recovery_history",
      });
    await act(async () => {
      render(React.createElement(app.RecoveryHistorySection));
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-history-error")));
    assert.match(document.body.textContent, /Recovery history is unavailable right now/);
    assert.doesNotMatch(document.body.textContent, /Could not find the function/);
    const retry = screen.getByTestId("recovery-history-retry");
    // Recovery works again after a successful retry.
    globalThis.__svjP4.history = () => Promise.resolve({ ok: true, history: [] });
    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-history-empty")));
  });
});

describe("Sleep vs readiness insight (History tab)", () => {
  it("states insufficient data honestly below the minimum sample", async () => {
    await renderHistory();
    const card = screen.getByTestId("recovery-sleep-correlation");
    assert.match(card.textContent, /paired day/);
    assert.match(card.textContent, /0 paired days/);
    assert.doesNotMatch(card.textContent, /tended to be higher|tended to be lower/);
  });

  it("shows the positive tendency with neutral, non-causal wording", async () => {
    const rows = [5, 6, 7, 8, 9].map((sleep, i) =>
      serverDay(dayKey(-i), { sleepHours: sleep, score: 40 + i * 13, hasCheckin: true }),
    );
    globalThis.__svjP4.history = () => Promise.resolve({ ok: true, history: rows });
    await renderHistory();
    const card = screen.getByTestId("recovery-sleep-correlation");
    assert.match(card.textContent, /tended to be higher/);
    assert.match(card.textContent, /not a cause/);
  });

  it("keeps the best-sleep insight honest with insufficient history", async () => {
    await renderHistory();
    const card = screen.getByTestId("recovery-best-sleep");
    assert.match(card.textContent, /Not enough logged nights yet/);
    assert.doesNotMatch(card.textContent, /\d–\d(\.\d)? h/);
  });

  it("surfaces the personal best-sleep range from real logged nights", async () => {
    // 3+ paired nights so bestSleepRange has enough evidence.
    const rows = [6, 6.5, 6, 8.5, 8, 8.5].map((sleep, i) =>
      serverDay(dayKey(-i - 1), {
        sleepHours: sleep,
        hasCheckin: true,
        score: 60,
        energy: sleep > 7 ? 5 : 2,
      }),
    );
    globalThis.__svjP4.history = () => Promise.resolve({ ok: true, history: rows });
    await renderHistory();
    const card = screen.getByTestId("recovery-best-sleep");
    assert.match(card.textContent, /\d(\.\d)?–\d(\.\d)? h/);
    assert.match(card.textContent, /your own logged recovery history/);
  });
});

describe("Phase 1–3 invariants stay intact", () => {
  it("History is a real panel inside the six-section shell (placeholders elsewhere)", async () => {
    await act(async () => {
      render(React.createElement(app.RecoveryView));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    assert.deepEqual(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.replace("(selected)", "").trim()),
      ["Overview", "History", "Goals", "Records", "Progress", "Devices"],
    );
    // Records is a real derived panel since Phase 6; Progress/Devices remain
    // honest placeholders.
    await act(async () => {
      screen.getByTestId("recovery-section-tab-records").click();
    });
    assert.ok(screen.getByTestId("recovery-section-records"));
    assert.equal(screen.queryByText(/Coming next/), null, "Records is no longer a placeholder");
    await act(async () => {
      screen.getByTestId("recovery-section-tab-history").click();
    });
    assert.ok(screen.getByTestId("recovery-section-history"));
    assert.equal(
      screen.queryByTestId("recovery-history-loading"),
      null,
      "history data arrives via the section's own single request",
    );
  });

  it("leaves the standalone Train › Recovery path history-free", async () => {
    await act(async () => {
      render(React.createElement(app.TrainRecovery));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    assert.equal(screen.queryByTestId("recovery-section-history"), null);
    assert.equal(screen.queryByTestId("recovery-history-grid"), null);
    assert.ok(screen.getByTestId("recovery-score"), "the readiness ring still renders");
  });
});
