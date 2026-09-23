// Phase 4 — pure helper tests: server-authoritative heatmap + sleep/readiness
// correlation. Every rule below is the contract documented in recoveryInsights.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SLEEP_CORRELATION_MIN_SAMPLES,
  SLEEP_CORRELATION_WEAK_THRESHOLD,
  buildRecoveryHeatmap,
  correlateSleepReadiness,
  heatCellBandLabel,
  heatCellDateLabel,
  type RecoveryHistoryPoint,
} from "../src/app/lib/recoveryInsights";

const dayKey = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const serverDay = (
  date: string,
  overrides: Partial<RecoveryHistoryPoint> = {},
): RecoveryHistoryPoint => ({
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

// ── Heatmap ──────────────────────────────────────────────────────────────────

describe("buildRecoveryHeatmap (server-authoritative)", () => {
  it("renders a scored day as scored with grade and band", () => {
    const cells = buildRecoveryHeatmap([serverDay(dayKey(0))], 7);
    const cell = cells[cells.length - 1];
    assert.equal(cell.state, "scored");
    assert.equal(cell.score, 70);
    assert.equal(cell.grade, "good");
    assert.equal(cell.band, "low");
    assert.equal(cell.hasCheckin, false);
  });

  it("treats a low score as a real scored day, never as missing", () => {
    const cells = buildRecoveryHeatmap([serverDay(dayKey(0), { score: 22 })], 5);
    const cell = cells[cells.length - 1];
    assert.equal(cell.state, "scored");
    assert.equal(cell.score, 22);
    assert.equal(cell.grade, "poor");
  });

  it("represents a calendar day with no server row as no-data", () => {
    const cells = buildRecoveryHeatmap([serverDay(dayKey(0))], 3);
    assert.equal(cells.filter((c) => c.state === "no_data").length, 2);
    const gap = cells[0];
    assert.equal(gap.state, "no_data");
    assert.equal(gap.score, null);
    assert.equal(gap.grade, null);
  });

  it("never fabricates a zero score for a missing date", () => {
    const cells = buildRecoveryHeatmap(
      [serverDay(dayKey(0)), serverDay(dayKey(-2), { score: 0 })],
      4,
    );
    const missing = cells.find((c) => c.date === dayKey(-1))!;
    assert.equal(missing.state, "no_data");
    assert.equal(missing.score, null, "missing day must not become score 0");
    const zeroScored = cells.find((c) => c.date === dayKey(-2))!;
    assert.equal(zeroScored.state, "scored", "an actual server zero is real data");
    assert.equal(zeroScored.score, 0);
  });

  it("keeps the server day key authoritative (no local shifting, no local rows)", () => {
    // A UTC-day key that is not "today" locally still lands exactly there.
    const utcDay = "2026-01-01";
    const cells = buildRecoveryHeatmap([serverDay(utcDay)], 5);
    const cell = cells.find((c) => c.date === utcDay)!;
    assert.ok(cell, "server key preserved verbatim");
    assert.equal(cell.state, "scored");
  });

  it("distinguishes check-in and no-check-in days", () => {
    const cells = buildRecoveryHeatmap(
      [serverDay(dayKey(0), { hasCheckin: true }), serverDay(dayKey(-1), { hasCheckin: false })],
      3,
    );
    assert.equal(cells[cells.length - 1].hasCheckin, true);
    assert.equal(cells[cells.length - 2].hasCheckin, false);
  });

  it("carries sleep hours from the server row onto the scored cell", () => {
    const cells = buildRecoveryHeatmap([serverDay(dayKey(0), { sleepHours: 7.5 })], 2);
    assert.equal(cells[cells.length - 1].sleepHours, 7.5);
  });

  it("returns an empty grid for empty history instead of inventing dates", () => {
    assert.deepEqual(buildRecoveryHeatmap([], 35), []);
  });

  it("ignores malformed rows (empty date)", () => {
    const cells = buildRecoveryHeatmap([serverDay("")], 5);
    assert.deepEqual(cells, []);
  });

  it("orders cells oldest → newest within the window", () => {
    const cells = buildRecoveryHeatmap([serverDay(dayKey(0)), serverDay(dayKey(-3))], 5);
    const dates = cells.map((c) => c.date);
    assert.deepEqual([...dates].sort(), dates);
    assert.equal(dates[dates.length - 1], dayKey(0));
  });

  it("exposes accessible label pieces: date, score, band, check-in state", () => {
    assert.match(heatCellDateLabel(dayKey(0)), /\d/); // month + day words
    assert.equal(heatCellBandLabel(null), "no data");
    assert.equal(heatCellBandLabel("unknown"), "no data");
    assert.equal(heatCellBandLabel("excellent"), "excellent");
  });
});

// ── Sleep ↔ readiness correlation ───────────────────────────────────────────

const pairDay = (sleep: number | null, score: number): RecoveryHistoryPoint =>
  serverDay(dayKey(0), { sleepHours: sleep, score, hasCheckin: sleep !== null });

const pairSet = (pairs: Array<[number | null, number]>): RecoveryHistoryPoint[] =>
  // Distinct dates so rows never collide in maps downstream.
  pairs.map(([sleep, score], i) => ({
    ...pairDay(sleep, score),
    date: dayKey(-i),
  }));

describe("correlateSleepReadiness", () => {
  it("reports insufficient data with zero paired samples", () => {
    const result = correlateSleepReadiness(pairSet([]));
    assert.equal(result.strength, "insufficient_data");
    assert.equal(result.samples, 0);
    assert.equal(result.r, null);
  });

  it("reports insufficient data below the documented minimum", () => {
    const result = correlateSleepReadiness(
      pairSet([
        [7, 70],
        [8, 75],
        [6, 60],
        [9, 80],
      ]),
    );
    assert.equal(result.samples, 4);
    assert.equal(result.strength, "insufficient_data");
    assert.ok(result.summary.includes(String(SLEEP_CORRELATION_MIN_SAMPLES - 1)));
  });

  it("excludes days with missing sleep (never converts to 0)", () => {
    const rows = pairSet([
      [null, 50],
      [8, 80],
      [7, 70],
      [6, 60],
      [9, 85],
      [5, 55],
    ]);
    const result = correlateSleepReadiness(rows);
    assert.equal(result.samples, 5, "only paired days counted");
    assert.ok(result.strength !== "insufficient_data");
  });

  it("excludes days with unusable readiness values", () => {
    const rows = pairSet([
      [7, 70],
      [8, 80],
      [6, 60],
      [9, 90],
      [5, 50],
      [7.5, -1],
    ]);
    const result = correlateSleepReadiness(rows);
    assert.equal(result.samples, 5, "negative/garbage score is not a usable pair");
  });

  it("finds a positive relationship", () => {
    const result = correlateSleepReadiness(
      pairSet([
        [5, 40],
        [6, 55],
        [7, 70],
        [8, 82],
        [9, 92],
      ]),
    );
    assert.equal(result.strength, "higher_sleep_higher_readiness");
    assert.ok((result.r ?? 0) > SLEEP_CORRELATION_WEAK_THRESHOLD);
    assert.match(result.summary, /tended to be higher/);
    assert.doesNotMatch(result.summary, /cause|guarantee|medical/i);
  });

  it("finds a negative relationship without causal wording", () => {
    const result = correlateSleepReadiness(
      pairSet([
        [5, 90],
        [6, 82],
        [7, 70],
        [8, 55],
        [9, 42],
      ]),
    );
    assert.equal(result.strength, "higher_sleep_lower_readiness");
    assert.ok((result.r ?? 0) < -SLEEP_CORRELATION_WEAK_THRESHOLD);
    assert.match(result.summary, /tended to be lower/);
  });

  it("reports no clear relationship for a weak correlation", () => {
    const result = correlateSleepReadiness(
      pairSet([
        [5, 70],
        [6, 68],
        [7, 72],
        [8, 66],
        [9, 71],
      ]),
    );
    assert.equal(result.strength, "no_clear_relationship");
    assert.ok(Math.abs(result.r ?? 1) <= SLEEP_CORRELATION_WEAK_THRESHOLD);
  });

  it("handles zero-variance inputs safely (no NaN/Infinity)", () => {
    const flat = correlateSleepReadiness(
      pairSet([
        [8, 70],
        [8, 70],
        [8, 70],
        [8, 70],
        [8, 70],
      ]),
    );
    assert.equal(flat.strength, "no_clear_relationship");
    assert.equal(flat.r, null);
    assert.ok(Number.isFinite(flat.samples));

    const flatSleep = correlateSleepReadiness(
      pairSet([
        [8, 40],
        [8, 55],
        [8, 70],
        [8, 85],
        [8, 92],
      ]),
    );
    assert.equal(flatSleep.r, null);
    assert.equal(flatSleep.strength, "no_clear_relationship");
  });

  it("never returns NaN or Infinity as r for any input", () => {
    const result = correlateSleepReadiness(
      pairSet([
        [7, 70],
        [8, 80],
        [6, 60],
        [9, 90],
        [5, 50],
      ]),
    );
    assert.ok(result.r === null || Number.isFinite(result.r));
  });

  it("is deterministic for identical input", () => {
    const rows = pairSet([
      [5, 40],
      [6, 55],
      [7, 70],
      [8, 82],
      [9, 92],
    ]);
    const a = correlateSleepReadiness(rows);
    const b = correlateSleepReadiness(rows.map((r) => ({ ...r })));
    assert.deepEqual(a, b);
  });

  it("uses neutral wording only (no causation, no medical claims)", () => {
    const positives = correlateSleepReadiness(
      pairSet([
        [5, 40],
        [6, 55],
        [7, 70],
        [8, 82],
        [9, 92],
      ]),
    );
    for (const result of [positives]) {
      assert.doesNotMatch(result.summary, /caused|causes|guarantees|diagnos|treat/i);
    }
  });
});
