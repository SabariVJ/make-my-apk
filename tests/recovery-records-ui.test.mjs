// Phase 6 — the real Recovery → Records section in jsdom.
//
// Only the network boundary is replaced (the Supabase rpc call); the shipped
// section, the shipped recovery client and the shipped normalizer all render
// as-is. Verifies: the four derived records with their labels and dates, a real
// 0 rendered as data, absent records never rendered as 0, insufficient-history
// and empty states, loading, a retryable error that never leaks raw server
// text, accessible values/dates, and the surrounding Recovery shell intact.
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

const RECORD_TYPES = [
  "highest_readiness_score",
  "longest_checkin_streak",
  "longest_ready_streak",
  "best_7d_readiness_average",
];

/** Raw SQL envelope row shape — the real normalizer runs in this bundle. */
const rawRecord = (record_type, value, achieved_date, start_date = null) => ({
  record_type,
  value,
  achieved_date,
  start_date,
});

const ALL_RECORDS = [
  rawRecord("highest_readiness_score", 84, "2026-09-10"),
  rawRecord("longest_checkin_streak", 6, "2026-09-13", "2026-09-08"),
  rawRecord("longest_ready_streak", 3, "2026-09-13", "2026-09-11"),
  rawRecord("best_7d_readiness_average", 76, "2026-09-13", "2026-09-07"),
];

const recordsEnvelope = (records) => ({ data: { ok: true, records }, error: null });

const readinessEnvelope = () => ({
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
    },
  },
  error: null,
});

function defaultRpc(fn) {
  if (fn === "svj_list_recovery_records") return Promise.resolve(recordsEnvelope(ALL_RECORDS));
  if (fn === "svj_get_my_readiness") return Promise.resolve(readinessEnvelope());
  if (fn === "svj_list_my_recovery_history") return Promise.resolve({ data: [], error: null });
  if (fn === "svj_list_goals")
    return Promise.resolve({ data: { ok: true, goals: [] }, error: null });
  if (fn === "svj_list_records")
    return Promise.resolve({ data: { ok: true, records: [] }, error: null });
  if (fn === "svj_list_strength_records")
    return Promise.resolve({ data: { ok: true, records: [] }, error: null });
  return Promise.resolve({ data: null, error: { message: `unexpected ${fn}` } });
}

before(async () => {
  temporary = await mkdtemp(path.resolve(".recovery-records-test-"));
  const output = path.join(temporary, "records.mjs");
  await build({
    stdin: {
      contents: `
      export { RecoveryView } from './src/app/components/RecoveryView';
      import RecoveryRecordsSection from './src/app/components/recovery/RecoveryRecordsSection';
      export { RecoveryRecordsSection };
      export { RecoveryHistorySection } from './src/app/components/recovery/RecoveryHistorySection';
      export { RecoveryGoalsSection } from './src/app/components/recovery/RecoveryGoalsSection';
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
        name: "isolated-phase6",
        setup(builder) {
          const map = {
            // The ONE mocked boundary: the Supabase RPC transport. The real
            // lib/recovery client and lib/recoveryRecords normalizer run.
            "@/integrations/supabase/client": "supabase",
            // Storage + account providers used by the shell's other sections.
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
                export const supabase = {
                  rpc: (fn, args) => {
                    globalThis.__svjP6.calls.push(fn);
                    return globalThis.__svjP6.rpc(fn, args);
                  },
                };`,
              storage: `
                export const readStoredJson = (k, f) => f;
                export const writeStoredJson = () => {};`,
              context: `
                const EMPTY = [];
                export const useSVJ = () => ({
                  taskCompletions: (globalThis.__svjP6 && globalThis.__svjP6.taskCompletions) || EMPTY,
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
  globalThis.__svjP6 = {
    calls: [],
    taskCompletions: [], // stable reference — TrainRecovery persists on change
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

/** Render the shipped section and wait for its terminal state. */
const renderSection = async () => {
  await act(async () => {
    render(React.createElement(app.RecoveryRecordsSection));
  });
  await waitFor(() =>
    assert.ok(
      screen.queryByTestId("recovery-records-list") ??
        screen.queryByTestId("recovery-records-error"),
      "the section reaches a terminal state",
    ),
  );
};

const cardFor = (recordType) =>
  document.querySelector(`[data-testid="recovery-record-card"][data-record-type="${recordType}"]`);

const openShellSection = async (section) => {
  await act(async () => {
    render(React.createElement(app.RecoveryView));
  });
  await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
  await act(async () => {
    screen.getByTestId(`recovery-section-tab-${section}`).click();
  });
};

describe("Recovery → Records shell", () => {
  it("is a real panel — Records no longer says Coming next", async () => {
    await openShellSection("records");
    await waitFor(() => assert.ok(screen.getByTestId("recovery-section-records")));
    assert.equal(screen.queryByText(/Coming next/), null);
    assert.equal(document.body.textContent.includes("Nothing is shown here yet"), false);
    // Progress shipped in Phase 7 (its own suite); Devices stays a placeholder.
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

  it("keeps the six-section shell, Overview, History and Goals intact", async () => {
    await openShellSection("records");
    assert.deepEqual(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.replace("(selected)", "").trim()),
      ["Overview", "History", "Goals", "Records", "Progress", "Devices"],
    );
    await act(async () => {
      screen.getByTestId("recovery-section-tab-overview").click();
    });
    assert.ok(screen.getByTestId("train-recovery"));
    await act(async () => {
      screen.getByTestId("recovery-section-tab-history").click();
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-section-history")));
    await act(async () => {
      screen.getByTestId("recovery-section-tab-goals").click();
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-section-goals")));
  });

  it("leaves the standalone Train › Recovery path records-free", async () => {
    await act(async () => {
      render(React.createElement(app.TrainRecovery));
    });
    await waitFor(() => assert.ok(screen.getByTestId("train-recovery")));
    assert.equal(screen.queryByTestId("recovery-section-records"), null);
    assert.equal(screen.queryByTestId("recovery-records-list"), null);
    assert.ok(screen.getByTestId("recovery-score"), "the readiness ring still renders");
  });

  it("does not let a failed Records read break the other sections", async () => {
    globalThis.__svjP6.rpc = (fn) =>
      fn === "svj_list_recovery_records"
        ? Promise.resolve({
            data: null,
            error: { message: "PGRST202 could not find the function" },
          })
        : defaultRpc(fn);
    await openShellSection("records");
    await waitFor(() => assert.ok(screen.getByTestId("recovery-records-error")));
    for (const [section, testId] of [
      ["overview", "train-recovery"],
      ["history", "recovery-section-history"],
      ["goals", "recovery-section-goals"],
    ]) {
      await act(async () => {
        screen.getByTestId(`recovery-section-tab-${section}`).click();
      });
      await waitFor(() => assert.ok(screen.getByTestId(testId), `${section} still works`));
    }
  });
});

describe("the four derived records", () => {
  it("renders exactly four record cards with the locked labels and order", async () => {
    await renderSection();
    const cards = screen.getAllByTestId("recovery-record-card");
    assert.equal(cards.length, 4, "no more and no fewer than four records");
    assert.deepEqual(
      cards.map((card) => card.getAttribute("data-record-type")),
      RECORD_TYPES,
    );
    assert.deepEqual(
      cards.map((card) => card.querySelector("h3")?.textContent),
      [
        "Highest Readiness",
        "Longest Check-in Streak",
        "Longest Ready Streak",
        "Best 7-Day Readiness",
      ],
    );
  });

  it("renders the highest readiness score with its achieved date", async () => {
    await renderSection();
    const card = cardFor("highest_readiness_score");
    assert.match(card.textContent, /84 \/ 100/);
    assert.match(card.textContent, /Achieved 10 September 2026/);
    assert.match(card.textContent, /84 out of 100/, "spoken equivalent for screen readers");
    assert.equal(card.querySelectorAll('[data-testid="recovery-record-empty"]').length, 0);
  });

  it("renders the check-in streak with its days and ending date", async () => {
    await renderSection();
    const card = cardFor("longest_checkin_streak");
    assert.match(card.textContent, /6 days/);
    assert.match(card.textContent, /Ended 13 September 2026/);
    assert.match(card.textContent, /8–13 September 2026/, "the covered range");
    assert.match(card.textContent, /back-to-back days with a saved recovery check-in/);
  });

  it("renders the ready streak at the existing 60 boundary", async () => {
    await renderSection();
    const card = cardFor("longest_ready_streak");
    assert.match(card.textContent, /3 days/);
    assert.match(card.textContent, /Ended 13 September 2026/);
    assert.match(card.textContent, /60 or above/);
    assert.match(card.textContent, /3 days in a row/, "spoken equivalent for screen readers");
  });

  it("renders the best 7-day average as an average, not a total", async () => {
    await renderSection();
    const card = cardFor("best_7d_readiness_average");
    assert.match(card.textContent, /76 avg/);
    assert.match(card.textContent, /7–13 September 2026/);
    assert.match(card.textContent, /7 straight days that all have saved readiness/);
    assert.match(card.textContent, /76 average readiness/, "spoken equivalent");
    assert.doesNotMatch(card.textContent, /76 \/ 100/);
  });

  it("never awards or claims points, ranks or competition language", async () => {
    await renderSection();
    const text = document.body.textContent ?? "";
    assert.match(text, /no points, badges or streaks are granted/);
    assert.match(text, /not a ranking against other members/);
    for (const banned of [
      "Elite",
      "Top 1%",
      "Better than",
      "World class",
      "percentile",
      "leaderboard",
    ]) {
      assert.equal(text.includes(banned), false, `${banned} must never appear`);
    }
  });

  it("only ever calls the derived reader — no record write RPC", async () => {
    await renderSection();
    assert.deepEqual(globalThis.__svjP6.calls, ["svj_list_recovery_records"]);
    for (const call of globalThis.__svjP6.calls) {
      assert.doesNotMatch(call, /create|update|delete|set_|insert|save/i);
    }
  });
});

describe("honest empty, insufficient and zero states", () => {
  it("renders a real readiness score of 0 as valid data", async () => {
    globalThis.__svjP6.rpc = (fn) =>
      fn === "svj_list_recovery_records"
        ? Promise.resolve(
            recordsEnvelope([
              rawRecord("highest_readiness_score", 0, "2026-09-09"),
              rawRecord("longest_checkin_streak", 1, "2026-09-09", "2026-09-09"),
            ]),
          )
        : defaultRpc(fn);
    await renderSection();
    const card = cardFor("highest_readiness_score");
    assert.match(card.textContent, /0 \/ 100/, "a real 0 is rendered, not hidden");
    assert.match(card.textContent, /Achieved 9 September 2026/);
    assert.equal(card.querySelectorAll('[data-testid="recovery-record-empty"]').length, 0);
    assert.match(cardFor("longest_checkin_streak").textContent, /1 day\b/);
  });

  it("never renders 0 for a record that does not exist", async () => {
    globalThis.__svjP6.rpc = (fn) =>
      fn === "svj_list_recovery_records"
        ? Promise.resolve(
            recordsEnvelope([rawRecord("longest_checkin_streak", 2, "2026-09-09", "2026-09-08")]),
          )
        : defaultRpc(fn);
    await renderSection();
    const missing = [
      "highest_readiness_score",
      "longest_ready_streak",
      "best_7d_readiness_average",
    ].map(cardFor);
    for (const card of missing) {
      assert.equal(
        card.querySelectorAll('[data-testid="recovery-record-empty"]').length,
        1,
        "an absent record states that it is absent",
      );
      assert.doesNotMatch(card.textContent, /\b0\b/, "and never shows a fabricated 0");
    }
    assert.match(cardFor("highest_readiness_score").textContent, /No readiness record yet\./);
    assert.match(cardFor("longest_ready_streak").textContent, /No readiness record yet\./);
  });

  it("explains an insufficient 7-day history instead of implying a low score", async () => {
    globalThis.__svjP6.rpc = (fn) =>
      fn === "svj_list_recovery_records"
        ? Promise.resolve(
            recordsEnvelope([
              rawRecord("highest_readiness_score", 71, "2026-09-09"),
              rawRecord("longest_ready_streak", 4, "2026-09-09", "2026-09-06"),
            ]),
          )
        : defaultRpc(fn);
    await renderSection();
    const card = cardFor("best_7d_readiness_average");
    assert.match(card.textContent, /Not enough complete recovery history yet\./);
    assert.doesNotMatch(card.textContent, /\b0\b|\bavg\b/);
  });

  it("keeps a missing ready streak apart from missing readiness entirely", async () => {
    globalThis.__svjP6.rpc = (fn) =>
      fn === "svj_list_recovery_records"
        ? Promise.resolve(
            recordsEnvelope([
              rawRecord("highest_readiness_score", 58, "2026-09-09"),
              rawRecord("longest_checkin_streak", 2, "2026-09-09", "2026-09-08"),
            ]),
          )
        : defaultRpc(fn);
    await renderSection();
    assert.match(cardFor("longest_ready_streak").textContent, /No 60\+ readiness streak yet\./);
  });

  it("shows the honest empty state when the server has no records at all", async () => {
    globalThis.__svjP6.rpc = (fn) =>
      fn === "svj_list_recovery_records" ? Promise.resolve(recordsEnvelope([])) : defaultRpc(fn);
    await renderSection();
    const empties = screen.getAllByTestId("recovery-record-empty");
    assert.equal(empties.length, 4, "every record says what it is waiting for");
    assert.deepEqual(
      empties.map((node) => node.textContent),
      [
        "No readiness record yet.",
        "No recovery check-in streak yet.",
        "No readiness record yet.",
        "Not enough complete recovery history yet.",
      ],
    );
    assert.doesNotMatch(document.body.textContent, /\b0 (\/|days|avg)/);
  });
});

describe("loading, error and retry", () => {
  it("shows a loading state while the reader is in flight", async () => {
    globalThis.__svjP6.rpc = () => new Promise(() => {});
    await act(async () => {
      render(React.createElement(app.RecoveryRecordsSection));
    });
    assert.ok(screen.getByTestId("recovery-records-loading"));
    assert.equal(screen.queryByTestId("recovery-records-list"), null);
  });

  it("fails safely with a 44px retry that reloads the derived records", async () => {
    let attempt = 0;
    globalThis.__svjP6.rpc = (fn) => {
      if (fn !== "svj_list_recovery_records") return defaultRpc(fn);
      attempt += 1;
      return attempt === 1
        ? Promise.resolve({
            data: null,
            error: {
              message:
                "Could not find the function public.svj_list_recovery_records in the schema cache (PGRST202)",
            },
          })
        : Promise.resolve(recordsEnvelope(ALL_RECORDS));
    };
    await renderSection();
    const error = screen.getByTestId("recovery-records-error");
    assert.match(error.textContent, /Recovery records are unavailable right now\./);
    // Raw server text never reaches the user.
    for (const leak of ["PGRST", "Could not find the function", "schema cache", "public."]) {
      assert.equal(document.body.textContent.includes(leak), false, `${leak} must not leak`);
    }
    const retry = screen.getByTestId("recovery-records-retry");
    assert.match(retry.className, /min-h-\[44px\]/, "the retry target stays at least 44px");
    assert.equal(retry.textContent?.includes("Retry"), true);

    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => assert.ok(screen.getByTestId("recovery-records-list")));
    assert.equal(screen.queryByTestId("recovery-records-error"), null);
    assert.equal(screen.getAllByTestId("recovery-record-card").length, 4);
  });
});

describe("accessibility", () => {
  it("uses a semantic heading and a list for the records", async () => {
    await renderSection();
    const heading = screen.getByRole("heading", { name: "Recovery records" });
    assert.equal(heading.tagName, "H2");
    assert.equal(screen.getByTestId("recovery-records-list").tagName, "UL");
    for (const card of screen.getAllByTestId("recovery-record-card")) {
      assert.equal(card.tagName, "LI");
      assert.equal(card.querySelector("h3")?.tagName, "H3");
    }
    // Decorative trophy icons carry no meaning for assistive tech.
    for (const icon of document.querySelectorAll("svg.lucide-trophy")) {
      assert.equal(icon.getAttribute("aria-hidden"), "true");
    }
  });

  it("formats server dates as readable labels without shifting the day", async () => {
    globalThis.__svjP6.rpc = (fn) =>
      fn === "svj_list_recovery_records"
        ? Promise.resolve(
            recordsEnvelope([
              rawRecord("highest_readiness_score", 90, "2026-01-01"),
              rawRecord("longest_checkin_streak", 2, "2026-01-02", "2026-01-01"),
            ]),
          )
        : defaultRpc(fn);
    await renderSection();
    // A UTC-midnight parse would render 31 December 2025 west of Greenwich.
    assert.match(cardFor("highest_readiness_score").textContent, /Achieved 1 January 2026/);
    assert.doesNotMatch(document.body.textContent, /31 December 2025/);
  });
});
