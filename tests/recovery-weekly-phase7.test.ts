// Phase 7 — pure weekly-intelligence tests: the weekly digest, its readiness
// trend, the server-readiness adapter and the Rest-Day alert. Every rule below
// is the contract documented in recoveryInsights.ts. Deterministic only — the
// digest never invents a day, a sleep value or a score.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  READINESS_TREND_MIN_DAYS,
  READINESS_TREND_STABLE_BAND,
  WEEKLY_DIGEST_DAYS,
  buildWeeklyRecoveryDigest,
  digestTrendSentence,
  gradeForScore,
  readinessAdvice,
  readinessEmphasis,
  readinessFromServer,
  readinessTrendDirection,
  restDayAlert,
  todaysFocus,
  type ReadinessResult,
  type RecoveryHistoryPoint,
} from "../src/app/lib/recoveryInsights";

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

const readiness = ({
  score = 70,
  band = "moderate",
  restDaysLast3 = 2,
  activityLoadPoints = 100,
  taskLoadPoints = 0,
  loadPenalty = 0,
}: {
  score?: number;
  band?: ReadinessResult["band"];
  restDaysLast3?: number | null;
  activityLoadPoints?: number;
  taskLoadPoints?: number;
  loadPenalty?: number;
} = {}): ReadinessResult => ({
  score,
  band,
  recovery: gradeForScore(score),
  components: {
    activityLoadPoints,
    taskLoadPoints,
    totalLoadPoints: activityLoadPoints + taskLoadPoints,
    loadPenalty,
    taskCount: 0,
    restDaysLast3,
    sources: [],
  },
  advice: readinessAdvice(score),
  isLow: score < 60,
});

const week = (scores: number[], startDay = 1): RecoveryHistoryPoint[] =>
  scores.map((score, index) =>
    serverDay(`2026-09-${String(startDay + index).padStart(2, "0")}`, {
      score,
      trainingLoad: "moderate",
    }),
  );

describe("weekly digest — data sufficiency", () => {
  it("reports insufficient with no fabricated values when there is no history", () => {
    const digest = buildWeeklyRecoveryDigest([]);
    assert.equal(digest.state, "insufficient");
    assert.equal(digest.windowDays, 0);
    assert.equal(digest.windowStart, null);
    assert.equal(digest.windowEnd, null);
    assert.equal(digest.readinessDays, 0);
    assert.equal(digest.averageReadiness, null);
    assert.equal(digest.checkinDays, 0);
    assert.equal(digest.sleepDays, 0);
    assert.equal(digest.restDaysLast3, null);
    assert.equal(digest.loadBand, null);
    assert.equal(digest.trend.direction, "insufficient_data");
  });

  it("handles a single readiness row without inventing siblings", () => {
    const digest = buildWeeklyRecoveryDigest([serverDay("2026-09-01", { score: 66 })]);
    assert.equal(digest.state, "partial");
    assert.equal(digest.windowDays, 1);
    assert.equal(digest.readinessDays, 1);
    assert.equal(digest.averageReadiness, 66);
    assert.equal(digest.trend.direction, "insufficient_data");
  });

  it("is partial for a partial week and complete for a full week", () => {
    const partial = buildWeeklyRecoveryDigest(week([70, 72, 74]));
    assert.equal(partial.state, "partial");
    assert.equal(partial.readinessDays, 3);
    assert.equal(partial.windowDays, 3);

    const complete = buildWeeklyRecoveryDigest(week([70, 71, 72, 73, 74, 75, 76]));
    assert.equal(complete.state, "complete");
    assert.equal(complete.readinessDays, WEEKLY_DIGEST_DAYS);
    assert.equal(complete.windowDays, 7);
  });

  it("keeps a real score of 0 as data", () => {
    const digest = buildWeeklyRecoveryDigest(week([0, 60, 60, 60]));
    assert.equal(digest.readinessDays, 4);
    assert.equal(digest.averageReadiness, Math.round((0 + 60 + 60 + 60) / 4));
  });

  it("never fills a missing calendar day with 0", () => {
    // 2026-09-01 and 2026-09-03 are present; the 2nd is genuinely absent.
    const digest = buildWeeklyRecoveryDigest([
      serverDay("2026-09-01", { score: 80 }),
      serverDay("2026-09-03", { score: 80 }),
    ]);
    assert.equal(digest.readinessDays, 2, "only real rows are scored");
    assert.equal(digest.averageReadiness, 80, "the gap is not averaged in as 0");
    assert.equal(digest.windowDays, 3, "the calendar span still spans the gap");
  });

  it("caps the window at the latest seven days", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      serverDay(`2026-09-${String(i + 1).padStart(2, "0")}`, { score: 50 + i }),
    );
    const digest = buildWeeklyRecoveryDigest(rows);
    assert.equal(digest.windowDays, 7);
    assert.equal(digest.windowStart, "2026-09-06");
    assert.equal(digest.windowEnd, "2026-09-12");
  });

  it("drops rows without a valid server day key and tolerates garbage input", () => {
    const digest = buildWeeklyRecoveryDigest([
      serverDay("not-a-day", { score: 90 }),
      serverDay("2026-09-01", { score: 80 }),
    ] as RecoveryHistoryPoint[]);
    assert.equal(digest.readinessDays, 1);
    assert.equal(digest.averageReadiness, 80);

    // @ts-expect-error — defensive: a non-array must not throw.
    assert.equal(buildWeeklyRecoveryDigest(null).state, "insufficient");
  });
});

describe("weekly digest — sleep and check-in consistency", () => {
  it("counts only real check-ins, never treating a missing day as checked in", () => {
    const digest = buildWeeklyRecoveryDigest([
      serverDay("2026-09-01", { score: 70, hasCheckin: true }),
      serverDay("2026-09-02", { score: 70, hasCheckin: false }),
      serverDay("2026-09-03", { score: 70, hasCheckin: true }),
    ]);
    assert.equal(digest.checkinDays, 2);
    assert.equal(digest.windowDays, 3);
  });

  it("counts only nights with a real sleep value > 0, never a missing night as 0h", () => {
    const digest = buildWeeklyRecoveryDigest([
      serverDay("2026-09-01", { score: 70, hasCheckin: true, sleepHours: 7.5 }),
      serverDay("2026-09-02", { score: 70, hasCheckin: true, sleepHours: null }),
      serverDay("2026-09-03", { score: 70, hasCheckin: true, sleepHours: 0 }),
      serverDay("2026-09-04", { score: 70, hasCheckin: true, sleepHours: 6 }),
    ]);
    assert.equal(digest.sleepDays, 2, "7.5 and 6 count; null and 0 do not");
  });

  it("reports the newest day's rest count and load band only when present", () => {
    const withMeta = buildWeeklyRecoveryDigest([
      serverDay("2026-09-01", { score: 70, trainingLoad: "moderate", restDaysLast3: 1 }),
      serverDay("2026-09-02", { score: 70, trainingLoad: "high", restDaysLast3: 0 }),
    ]);
    assert.equal(withMeta.restDaysLast3, 0);
    assert.equal(withMeta.loadBand, "high");

    const withoutMeta = buildWeeklyRecoveryDigest([
      serverDay("2026-09-02", { score: 70, trainingLoad: "unknown-band", restDaysLast3: null }),
    ]);
    assert.equal(withoutMeta.restDaysLast3, null);
    assert.equal(withoutMeta.loadBand, null);
  });

  it("is deterministic for identical input", () => {
    const rows = week([60, 70, 80, 65, 75]);
    assert.deepEqual(buildWeeklyRecoveryDigest(rows), buildWeeklyRecoveryDigest(rows));
  });
});

describe("readiness trend", () => {
  it("needs a minimum number of scored days before claiming a trend", () => {
    const trend = readinessTrendDirection(week([70, 80, 90]));
    assert.equal(trend.samples, 3);
    assert.equal(trend.direction, "insufficient_data");
    assert.equal(trend.delta, null);
    assert.equal(READINESS_TREND_MIN_DAYS, 4);
  });

  it("reports improving when the recent half is meaningfully higher", () => {
    const trend = readinessTrendDirection(week([50, 55, 80, 85]));
    assert.equal(trend.direction, "improving");
    assert.equal(trend.earlierAvg, Math.round((50 + 55) / 2));
    assert.equal(trend.recentAvg, Math.round((80 + 85) / 2));
    assert.ok((trend.delta ?? 0) > READINESS_TREND_STABLE_BAND);
  });

  it("reports declining when the recent half is meaningfully lower", () => {
    const trend = readinessTrendDirection(week([85, 80, 55, 50]));
    assert.equal(trend.direction, "declining");
    assert.ok((trend.delta ?? 0) < -READINESS_TREND_STABLE_BAND);
  });

  it("stays stable for a tiny/noisy change", () => {
    const trend = readinessTrendDirection(week([70, 71, 72, 70]));
    assert.equal(trend.direction, "stable");
    assert.ok(Math.abs(trend.delta ?? 0) <= READINESS_TREND_STABLE_BAND);
  });

  it("ignores gaps rather than counting them as 0", () => {
    // Four real rows improving, spread over six calendar days with a gap.
    const trend = readinessTrendDirection([
      serverDay("2026-09-01", { score: 50 }),
      serverDay("2026-09-02", { score: 52 }),
      serverDay("2026-09-05", { score: 82 }),
      serverDay("2026-09-06", { score: 84 }),
    ]);
    assert.equal(trend.samples, 4);
    assert.equal(trend.direction, "improving");
  });

  it("is safe with NaN/Infinity scores", () => {
    const trend = readinessTrendDirection([
      serverDay("2026-09-01", { score: Number.NaN }),
      serverDay("2026-09-02", { score: Number.POSITIVE_INFINITY }),
      serverDay("2026-09-03", { score: 70 }),
    ]);
    assert.equal(trend.samples, 1);
    assert.equal(trend.direction, "insufficient_data");
  });

  it("has non-colour wording for every direction", () => {
    for (const direction of ["improving", "declining", "stable", "insufficient_data"] as const) {
      const sentence = digestTrendSentence({
        direction,
        samples: 5,
        earlierAvg: 60,
        recentAvg: 70,
        delta: 10,
      });
      assert.ok(sentence.length > 10);
    }
  });
});

describe("server readiness adapter", () => {
  it("maps the server snapshot onto the canonical ReadinessResult", () => {
    const adapted = readinessFromServer({
      score: 74,
      trainingLoad: "high",
      components: { loadPoints7d: 400, loadBand: "high", restDaysLast3: 1, loadPenalty: 12 },
    });
    assert.equal(adapted.score, 74);
    assert.equal(adapted.band, "high");
    assert.equal(adapted.components.activityLoadPoints, 400);
    assert.equal(adapted.components.taskLoadPoints, 0, "the server cannot see local task load");
    assert.equal(adapted.components.restDaysLast3, 1);
    assert.equal(adapted.advice, "Train normally.");
  });

  it("falls back to the load-points band and never emits NaN", () => {
    const adapted = readinessFromServer({
      score: Number.NaN,
      components: { loadPoints7d: 600, loadBand: "not-a-band" },
    });
    assert.equal(adapted.score, 0);
    assert.equal(adapted.band, "very_high");
    assert.ok(Number.isFinite(adapted.components.totalLoadPoints));
    assert.equal(adapted.components.restDaysLast3, null);
  });
});

describe("readiness emphasis — the one authoritative decision", () => {
  it("is rest below the low-readiness threshold", () => {
    assert.equal(readinessEmphasis(readiness({ score: 36, band: "moderate" })), "rest");
  });

  it("is rest for a very-high load week with no recent rest", () => {
    assert.equal(
      readinessEmphasis(readiness({ score: 70, band: "very_high", restDaysLast3: 0 })),
      "rest",
    );
  });

  it("is lighter for a high load week with no recent rest", () => {
    assert.equal(
      readinessEmphasis(readiness({ score: 70, band: "high", restDaysLast3: 0 })),
      "lighter",
    );
  });

  it("is lighter below 60", () => {
    assert.equal(readinessEmphasis(readiness({ score: 55, band: "moderate" })), "lighter");
  });

  it("is stronger only for high readiness with light load or a recent rest", () => {
    assert.equal(
      readinessEmphasis(readiness({ score: 82, band: "low", restDaysLast3: 0 })),
      "stronger",
    );
    assert.equal(
      readinessEmphasis(readiness({ score: 82, band: "moderate", restDaysLast3: 1 })),
      "stronger",
    );
    assert.equal(
      readinessEmphasis(readiness({ score: 82, band: "very_high", restDaysLast3: 0 })),
      "rest",
      "a very-high load with no rest outranks strength",
    );
  });

  it("is normal for a high load with recent rest", () => {
    assert.equal(
      readinessEmphasis(readiness({ score: 70, band: "high", restDaysLast3: 2 })),
      "normal",
    );
  });

  it("never disagrees with Today's Focus", () => {
    for (const score of [20, 39, 55, 70, 78, 90]) {
      for (const band of ["low", "moderate", "high", "very_high"] as const) {
        for (const restDaysLast3 of [0, 1, null]) {
          const r = readiness({ score, band, restDaysLast3 });
          assert.equal(
            todaysFocus({ readiness: r, trainingGoal: null, activityGoal: null }).emphasis,
            readinessEmphasis(r),
          );
        }
      }
    }
  });
});

describe("Rest-Day alert", () => {
  it("is inactive and empty unless the emphasis is rest", () => {
    const alert = restDayAlert(readiness({ score: 70, band: "moderate", restDaysLast3: 2 }));
    assert.equal(alert.active, false);
    assert.equal(alert.headline, "");
    assert.deepEqual(alert.evidence, []);
    assert.equal(alert.suggestion, "");
  });

  it("is active with the score as evidence for a low score", () => {
    const alert = restDayAlert(readiness({ score: 36, band: "moderate", restDaysLast3: 2 }));
    assert.equal(alert.active, true);
    assert.equal(alert.headline, "Take a recovery-focused day");
    assert.ok(alert.evidence.some((line) => line.includes("36")));
    assert.equal(
      alert.evidence.some((line) => line.includes("training load")),
      false,
      "no load claim when the load is not high",
    );
    assert.equal(
      alert.evidence.some((line) => line.includes("rest day")),
      false,
      "no rest claim when rest days were logged",
    );
  });

  it("adds load and rest evidence only when the data supports it", () => {
    const alert = restDayAlert(readiness({ score: 42, band: "very_high", restDaysLast3: 0 }));
    assert.equal(alert.active, true);
    assert.ok(alert.evidence.some((line) => line.includes("very high")));
    assert.ok(alert.evidence.some((line) => line.includes("rest day")));
    assert.ok(alert.suggestion.length > 0);
  });

  it("uses neutral, non-medical wording", () => {
    const alert = restDayAlert(readiness({ score: 20, band: "high", restDaysLast3: 0 }));
    const copy = [alert.headline, alert.suggestion, ...alert.evidence].join(" ").toLowerCase();
    for (const banned of ["overtrain", "medical", "diagnos", "nervous system", "damaged"]) {
      assert.equal(copy.includes(banned), false, `must not contain "${banned}"`);
    }
  });
});
