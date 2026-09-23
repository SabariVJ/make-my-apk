/**
 * Phase 3 — founder Overview intelligence (pure helpers).
 *
 * Pins the locked Phase 3 decisions:
 *   - streak: consecutive SERVER hasCheckin days only, server day basis,
 *     missing day breaks, no check-in day never counts, not required to
 *     include today;
 *   - focus: deterministic emphasis from the shared readiness result, Training
 *     Profile goal primary, applicable svj_goals secondary (active + period
 *     covers today), personalization never involved;
 *   - fatigue: state purely from last-trained recency (today/yesterday → High,
 *     2–3 days → Moderate, 4+ → Fresh, none → No recent data); volume only
 *     flavours the reason, never the state.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applicableActivityGoals,
  computeReadiness,
  estimateMuscleRecovery,
  muscleRecoveryStateLabel,
  recoveryCheckinStreak,
  todaysFocus,
} from "../src/app/lib/recoveryInsights";

const NOW = new Date(2026, 8, 23, 12, 0, 0); // Wed 23 Sep 2026, local noon
const day = (offset: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const serverDay = (date: string, over: { hasCheckin?: boolean } = {}) => ({
  date,
  hasCheckin: false,
  ...over,
});

const readiness = (over: Parameters<typeof computeReadiness>[0]) => computeReadiness(over);

describe("recovery check-in streak (server day basis)", () => {
  it("is zero with no check-ins at all", () => {
    assert.equal(recoveryCheckinStreak([], NOW), 0);
    assert.equal(recoveryCheckinStreak([serverDay(day(0))], NOW), 0);
  });

  it("never counts a day that has no check-in flag", () => {
    assert.equal(recoveryCheckinStreak([serverDay(day(0), { hasCheckin: true })], NOW), 1);
  });

  it("counts consecutive server hasCheckin days ending today", () => {
    const days = [
      serverDay(day(0), { hasCheckin: true }),
      serverDay(day(-1), { hasCheckin: true }),
      serverDay(day(-2), { hasCheckin: true }),
    ];
    assert.equal(recoveryCheckinStreak(days, NOW), 3);
  });

  it("breaks at the first missing day", () => {
    const days = [
      serverDay(day(0), { hasCheckin: true }),
      serverDay(day(-1), { hasCheckin: true }),
      serverDay(day(-2)), // gap
      serverDay(day(-3), { hasCheckin: true }),
      serverDay(day(-4), { hasCheckin: true }),
    ];
    assert.equal(recoveryCheckinStreak(days, NOW), 2);
  });

  it("survives a day when the latest check-in was yesterday", () => {
    const days = [
      serverDay(day(-1), { hasCheckin: true }),
      serverDay(day(-2), { hasCheckin: true }),
    ];
    assert.equal(recoveryCheckinStreak(days, NOW), 2);
  });

  it("ignores local placeholder days (all-null check-ins are never in server history)", () => {
    // The caller passes only server rows; a synthetic local row must not move
    // the number even if it is somehow handed in.
    const days = [
      serverDay(day(0)),
      serverDay(day(-1), { hasCheckin: true }),
      serverDay(day(-2), { hasCheckin: true }),
      { date: day(0), hasCheckin: undefined }, // local shape, no server flag
    ];
    assert.equal(recoveryCheckinStreak(days, NOW), 2);
  });

  it("ignores malformed rows instead of counting them", () => {
    const days = [
      { date: "", hasCheckin: true },
      null as unknown as { date: string; hasCheckin?: boolean },
      serverDay(day(0), { hasCheckin: true }),
      serverDay(day(-1), { hasCheckin: true }),
    ];
    assert.equal(recoveryCheckinStreak(days, NOW), 2);
  });

  it("stays deterministic for repeated calls", () => {
    const days = [
      serverDay(day(0), { hasCheckin: true }),
      serverDay(day(-1), { hasCheckin: true }),
    ];
    assert.equal(recoveryCheckinStreak(days, NOW), recoveryCheckinStreak(days, NOW));
  });
});

describe("Today's Focus (deterministic, shared readiness)", () => {
  it("keeps normal training on a healthy moderate day", () => {
    const focus = todaysFocus({
      readiness: readiness({ activityLoadPoints: 200, taskLoadPoints: 0, restDays: 2 }),
      trainingGoal: "general",
      activityGoal: null,
    });
    assert.equal(focus.emphasis, "normal");
    assert.match(focus.detail, /Readiness is 70/);
    assert.match(focus.detail, /moderate load/);
  });

  it("demands rest on a very high load week with no rest day", () => {
    const focus = todaysFocus({
      readiness: readiness({ activityLoadPoints: 700, taskLoadPoints: 0, restDays: 0 }),
      trainingGoal: "strength",
      activityGoal: null,
    });
    assert.equal(focus.emphasis, "rest");
    assert.match(focus.detail, /42/); // score 70 - 28 very_high+no-rest penalty
  });

  it("recommends lighter training on a low readiness score", () => {
    const focus = todaysFocus({
      readiness: readiness({
        activityLoadPoints: 0,
        taskLoadPoints: 0,
        checkin: { sleepHours: 4, soreness: 5, energy: 1 },
      }),
      trainingGoal: "muscle",
      activityGoal: null,
    });
    // The documented formula yields 43 for this check-in — light session range.
    assert.equal(focus.emphasis, "lighter");
    assert.match(focus.detail, /Readiness is 43/);
  });

  it("demands rest when the score itself sinks below 40", () => {
    const focus = todaysFocus({
      readiness: readiness({
        activityLoadPoints: 0,
        taskLoadPoints: 0,
        checkin: { sleepHours: 0, soreness: 5, energy: 1, perceivedRecovery: 1 },
      }),
      trainingGoal: null,
      activityGoal: null,
    });
    assert.equal(focus.emphasis, "rest");
  });

  it("allows a strong session when the score is excellent and load is light", () => {
    // An excellent check-in pushes the combined score to 78+ on a light week.
    const focus = todaysFocus({
      readiness: readiness({
        activityLoadPoints: 60,
        taskLoadPoints: 0,
        restDays: 1,
        checkin: { sleepHours: 8, soreness: 1, energy: 5, perceivedRecovery: 5 },
      }),
      trainingGoal: "strength",
      activityGoal: null,
    });
    assert.equal(focus.emphasis, "stronger");
    assert.match(focus.detail, /Readiness is 90/);
    assert.match(focus.detail, /strength progress/);
  });

  it("uses the Training Profile goal in the wording", () => {
    const focus = todaysFocus({
      readiness: readiness({ activityLoadPoints: 0, taskLoadPoints: 0 }),
      trainingGoal: "muscle",
      activityGoal: null,
    });
    assert.match(focus.detail, /building muscle/);
  });

  it("never injects a goal clause for the general goal", () => {
    const focus = todaysFocus({
      readiness: readiness({ activityLoadPoints: 0, taskLoadPoints: 0 }),
      trainingGoal: "general",
      activityGoal: null,
    });
    assert.doesNotMatch(focus.detail, /goal/);
  });

  it("falls back to general fitness wording without a profile", () => {
    const focus = todaysFocus({
      readiness: readiness({ activityLoadPoints: 0, taskLoadPoints: 0 }),
      trainingGoal: null,
      activityGoal: null,
    });
    assert.doesNotMatch(focus.detail, /goal on track/);
    assert.equal(focus.emphasis, "normal");
  });

  it("adds the applicable activity goal as a secondary signal without changing emphasis", () => {
    const base = {
      readiness: readiness({ activityLoadPoints: 0, taskLoadPoints: 0 }),
      trainingGoal: "general" as const,
    };
    const without = todaysFocus(base);
    const withGoal = todaysFocus({
      ...base,
      activityGoal: { metric: "workout_count", progress: 2, targetValue: 4 },
    });
    assert.equal(
      without.emphasis,
      withGoal.emphasis,
      "the secondary goal never flips the emphasis",
    );
    assert.match(withGoal.detail, /50% into your weekly workout goal/);
  });

  it("stays deterministic for identical inputs", () => {
    const input = {
      readiness: readiness({ activityLoadPoints: 120, taskLoadPoints: 0, restDays: 1 }),
      trainingGoal: "athletic" as const,
      activityGoal: null,
    };
    assert.deepEqual(todaysFocus(input), todaysFocus(input));
  });
});

describe("applicable svj_goals filter", () => {
  const goal = (over: Record<string, unknown>) => ({
    status: "active",
    periodStart: day(-2),
    periodEnd: day(4),
    metric: "workout_count",
    progress: 1,
    targetValue: 5,
    ...over,
  });

  it("accepts an active goal whose period covers today", () => {
    assert.deepEqual(applicableActivityGoals([goal({})], NOW), {
      metric: "workout_count",
      progress: 1,
      targetValue: 5,
    });
  });

  it("ignores an active goal whose period already ended (broken server expiry)", () => {
    assert.equal(applicableActivityGoals([goal({ periodEnd: day(-1) })], NOW), null);
  });

  it("ignores a future active goal", () => {
    assert.equal(
      applicableActivityGoals([goal({ periodStart: day(1), periodEnd: day(7) })], NOW),
      null,
    );
  });

  it("ignores completed or cancelled goals even inside the window", () => {
    assert.equal(applicableActivityGoals([goal({ status: "completed" })], NOW), null);
    assert.equal(applicableActivityGoals([goal({ status: "cancelled" })], NOW), null);
  });

  it("ignores rows with an invalid target", () => {
    assert.equal(applicableActivityGoals([goal({ targetValue: 0 })], NOW), null);
  });

  it("falls back to the metric default on malformed rows", () => {
    assert.deepEqual(applicableActivityGoals([goal({ metric: 42 })], NOW), {
      metric: "workout_count",
      progress: 1,
      targetValue: 5,
    });
  });
});

describe("estimated muscle recovery (activity summary, not physiology)", () => {
  const row = (over: Record<string, unknown>) => ({
    muscle: "chest",
    directSets: 0,
    supportingSets: 0,
    directVolume: 0,
    lastTrainedDate: null as string | null,
    ...over,
  });

  it("labels a muscle trained today as High", () => {
    const map = estimateMuscleRecovery(
      [row({ directSets: 6, directVolume: 2400, lastTrainedDate: day(0) })],
      NOW,
    );
    const chest = map.entries.find((e) => e.muscle === "chest");
    assert.equal(chest?.state, "high");
    assert.match(chest?.reason ?? "", /today/);
    assert.match(chest?.reason ?? "", /6 direct sets/);
    assert.match(chest?.reason ?? "", /2,400 kg volume/);
  });

  it("labels yesterday as High and 2–3 days as Moderate", () => {
    const map = estimateMuscleRecovery(
      [
        row({ muscle: "back", directSets: 4, lastTrainedDate: day(-1) }),
        row({ muscle: "quads", directSets: 3, lastTrainedDate: day(-2) }),
        row({ muscle: "core", supportingSets: 2, lastTrainedDate: day(-3) }),
      ],
      NOW,
    );
    assert.equal(map.entries.find((e) => e.muscle === "back")?.state, "high");
    assert.equal(map.entries.find((e) => e.muscle === "quads")?.state, "moderate");
    assert.equal(map.entries.find((e) => e.muscle === "core")?.state, "moderate");
    assert.match(map.entries.find((e) => e.muscle === "core")?.reason ?? "", /2 supporting sets/);
  });

  it("labels 4+ days ago as Fresh within the window", () => {
    const map = estimateMuscleRecovery([row({ directSets: 3, lastTrainedDate: day(-5) })], NOW);
    assert.equal(map.entries.find((e) => e.muscle === "chest")?.state, "fresh");
  });

  it("labels untrained muscles as No recent data and never invents values", () => {
    const map = estimateMuscleRecovery([], NOW);
    assert.equal(map.hasAnyData, false);
    for (const entry of map.entries) {
      assert.equal(entry.state, "no_recent_data");
      assert.equal(entry.reason, "No logged training in the last 7 days.");
    }
  });

  it("treats a row with no sets as no data even with a stale date", () => {
    const map = estimateMuscleRecovery([row({ directSets: 0, lastTrainedDate: day(-1) })], NOW);
    assert.equal(map.hasAnyData, false);
  });

  it("covers every muscle group exactly once with stable labels", () => {
    const map = estimateMuscleRecovery([], NOW);
    assert.equal(map.entries.length, 12);
    assert.equal(new Set(map.entries.map((e) => e.muscle)).size, 12);
    assert.equal(muscleRecoveryStateLabel("fresh"), "Fresh");
    assert.equal(muscleRecoveryStateLabel("moderate"), "Moderate");
    assert.equal(muscleRecoveryStateLabel("high"), "High");
    assert.equal(muscleRecoveryStateLabel("no_recent_data"), "No recent data");
  });

  it("is deterministic for repeated calls", () => {
    const rows = [row({ directSets: 4, lastTrainedDate: day(-2) })];
    assert.deepEqual(estimateMuscleRecovery(rows, NOW), estimateMuscleRecovery(rows, NOW));
  });
});
