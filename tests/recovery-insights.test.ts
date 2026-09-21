/**
 * Recovery insights regressions:
 *  - training load comes from completed tasks (weighted) + recorded activity
 *  - readiness blends that load with the manual check-in
 *  - a day-keyed history store backs the trends
 *  - "your best sleep" is the user's own data, never a generic number
 *  - low readiness softens personalized difficulty
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LOW_READINESS_THRESHOLD,
  TASK_LOAD_WEIGHTS,
  bandForLoad,
  bestSleepRange,
  computeReadiness,
  isLowReadiness,
  normalizeHistory,
  readinessTrend,
  recomputeSleepWindow,
  restDaysLast3,
  taskLoadForDay,
  taskLoadPoints,
  upsertDayRecord,
  type RecoveryDayRecord,
  emptyDayRecord,
} from "../src/app/lib/recoveryInsights";
import { localDayKey, type TaskCompletion } from "../src/app/lib/taskCompletions";
import { softenForLowReadiness } from "../src/lib/challenge-engine";

const NOW = new Date(2026, 8, 21, 12, 0, 0);
const today = (offset = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return localDayKey(d);
};

const row = (over: Partial<TaskCompletion> = {}): TaskCompletion => ({
  id: "r1",
  challengeId: "c1",
  title: "Task",
  category: "Physical",
  dayKey: today(),
  completedAt: NOW.toISOString(),
  xpAwarded: 40,
  statCategory: "physical",
  statPoints: 3,
  ...over,
});

describe("training load from completed tasks", () => {
  it("weights strain categories above cognitive ones", () => {
    assert.ok(TASK_LOAD_WEIGHTS.Physical > TASK_LOAD_WEIGHTS.Mental);
    assert.ok(TASK_LOAD_WEIGHTS.Discipline > TASK_LOAD_WEIGHTS.Mindset);
  });

  it("counts only currently-completed tasks in the trailing window", () => {
    const rows = [
      row({ id: "a", category: "Physical" }),
      row({ id: "b", category: "Mental" }),
      row({ id: "c", category: "Physical", dayKey: today(-10) }), // outside window
      row({ id: "d", category: "Physical", undoneAt: NOW.toISOString() }), // unchecked
    ];
    const load = taskLoadPoints(rows, 7, NOW);
    assert.equal(load.taskCount, 2);
    assert.equal(load.points, TASK_LOAD_WEIGHTS.Physical + TASK_LOAD_WEIGHTS.Mental);
  });

  it("computes one day's load and reflects unchecking", () => {
    const rows = [row({ id: "a", category: "Discipline" }), row({ id: "b", category: "Nutrition" })];
    assert.equal(taskLoadForDay(rows, today()), TASK_LOAD_WEIGHTS.Discipline + TASK_LOAD_WEIGHTS.Nutrition);
    rows[1].undoneAt = NOW.toISOString();
    assert.equal(taskLoadForDay(rows.filter((r) => !r.undoneAt), today()), TASK_LOAD_WEIGHTS.Discipline);
  });

  it("bands total load with the documented thresholds", () => {
    assert.equal(bandForLoad(0), "low");
    assert.equal(bandForLoad(120), "low");
    assert.equal(bandForLoad(121), "moderate");
    assert.equal(bandForLoad(300), "moderate");
    assert.equal(bandForLoad(301), "high");
    assert.equal(bandForLoad(521), "very_high");
  });

  it("counts rest days from days with no recorded load at all", () => {
    // Load recorded today only → two of the last three days were rest days.
    assert.equal(restDaysLast3([], [today()], NOW), 2);
    assert.equal(restDaysLast3([today()], [today()], NOW), 2);
  });
});

describe("readiness", () => {
  it("uses activity + task load, not the check-in alone", () => {
    const noTasks = computeReadiness({ activityLoadPoints: 0, taskLoadPoints: 0 });
    const tasks = computeReadiness({
      activityLoadPoints: 0,
      taskLoadPoints: 200,
      taskCount: 4,
    });
    assert.equal(noTasks.band, "low");
    assert.equal(tasks.band, "moderate");
    assert.equal(tasks.components.taskLoadPoints, 200);
    assert.ok(tasks.components.sources.includes("completed_tasks"));
  });

  it("blends the manual check-in into the score", () => {
    const base = computeReadiness({ activityLoadPoints: 0, taskLoadPoints: 0 });
    const good = computeReadiness({
      activityLoadPoints: 0,
      taskLoadPoints: 0,
      checkin: { sleepHours: 8, soreness: 1, energy: 5, perceivedRecovery: 5 },
    });
    const bad = computeReadiness({
      activityLoadPoints: 0,
      taskLoadPoints: 0,
      checkin: { sleepHours: 4, soreness: 5, energy: 1, perceivedRecovery: 1 },
    });
    assert.ok(good.score > base.score);
    assert.ok(bad.score < base.score);
    assert.equal(good.recovery, "excellent");
    assert.equal(bad.recovery, "poor");
  });

  it("penalises a very high load week and flags low readiness", () => {
    const heavy = computeReadiness({ activityLoadPoints: 600, taskLoadPoints: 0, restDays: 0 });
    assert.equal(heavy.band, "very_high");
    assert.ok(heavy.components.loadPenalty >= 20);
    assert.ok(heavy.score < 70);
    const depleted = computeReadiness({
      activityLoadPoints: 600,
      taskLoadPoints: 0,
      restDays: 0,
      checkin: { sleepHours: 4, soreness: 5, energy: 1, perceivedRecovery: 1 },
    });
    assert.equal(depleted.isLow, true);
    assert.equal(isLowReadiness(depleted.score), true);
    assert.equal(isLowReadiness(null), false);
    assert.ok(depleted.score < LOW_READINESS_THRESHOLD);
  });
});

describe("history store", () => {
  it("upserts one record per day and sorts oldest-first", () => {
    let history: RecoveryDayRecord[] = [];
    history = upsertDayRecord(history, { ...emptyDayRecord(today(-1)), score: 70 });
    history = upsertDayRecord(history, { ...emptyDayRecord(today()), score: 55 });
    history = upsertDayRecord(history, { ...emptyDayRecord(today()), score: 61 });
    assert.equal(history.length, 2);
    assert.deepEqual(
      history.map((h) => h.date),
      [today(-1), today()],
    );
    assert.equal(history[1].score, 61);
  });

  it("drops malformed stored rows", () => {
    assert.deepEqual(normalizeHistory("nope"), []);
    const history = normalizeHistory([{ date: today(), score: 50, checkin: { sleepHours: 7 } }]);
    assert.equal(history.length, 1);
    assert.equal(history[0].checkin.sleepHours, 7);
    assert.equal(history[0].checkin.energy, null);
  });

  it("produces a 7-day series with gaps preserved", () => {
    const history = upsertDayRecord([], {
      ...emptyDayRecord(today(-2)),
      score: 80,
      checkin: { sleepHours: 7.5, soreness: 2, energy: 4, perceivedRecovery: 4 },
    });
    const trend = readinessTrend(history, 7);
    assert.equal(trend.length, 7);
    assert.equal(trend[6].date, today());
    const filled = trend.find((p) => p.date === today(-2));
    assert.equal(filled?.score, 80);
    assert.equal(filled?.sleepHours, 7.5);
    assert.equal(trend[0].hasData, false);
  });
});

describe("personal best sleep", () => {
  const dayWith = (
    offset: number,
    sleep: number | null,
    energy: number | null,
  ): RecoveryDayRecord => ({
    ...emptyDayRecord(today(offset)),
    checkin: { sleepHours: sleep, soreness: 2, energy, perceivedRecovery: 3 },
    score: energy !== null ? energy * 15 : 0,
  });


  it("refuses to invent a number without personal history", () => {
    const result = bestSleepRange([dayWith(-2, 7, 4)], 3);
    assert.equal(result.insufficientData, true);
    assert.equal(result.best, null);
    assert.equal(result.bestRangeLabel, null);
  });

  it("picks the user's own best next-day outcome", () => {
    // Each day's sleep is correlated with the NEXT day's energy:
    //   -6 slept 5h   → -5 energy 2
    //   -5 slept 5h   → -4 energy 3   (5h bucket averages 2.5)
    //   -4 slept 8h   → -3 energy 5
    //   -3 slept 8h   → -2 energy 5   (8h bucket averages 5.0)
    //   -2 slept 6.5h → -1 energy 3
    const history = [
      dayWith(-6, 5, null),
      dayWith(-5, 5, 2),
      dayWith(-4, 8, 3),
      dayWith(-3, 8, 5),
      dayWith(-2, 6.5, 5),
      dayWith(-1, 6.5, 3),
    ];
    const result = bestSleepRange(history, 3);
    assert.equal(result.insufficientData, false);
    assert.equal(result.best?.fromHour, 8);
    assert.equal(result.bestRangeLabel, "8–8.5 h");
    assert.equal(result.pairedDays, 5);
  });
});

describe("tonight's sleep window", () => {
  it("uses the personal optimum and stays inside the day", () => {
    const history: RecoveryDayRecord[] = [];
    const best = bestSleepRange(history, 3);
    const w = recomputeSleepWindow(best, "low", { wakeHour: 7 });
    assert.equal(w.personalised, false);
    assert.match(w.note, /Log a few more nights/);
    assert.equal(w.loadAdjustmentMinutes, 0);
    assert.match(w.bedtimeFrom, /^\d{2}:\d{2}$/);
  });

  it("extends the window on higher training-load days", () => {
    const personalised = {
      buckets: [],
      best: { fromHour: 8, toHour: 8.5, samples: 3, avgNextEnergy: 5, avgNextScore: 80 },
      pairedDays: 6,
      bestRangeLabel: "8–8.5 h",
      insufficientData: false,
    };
    const low = recomputeSleepWindow(personalised, "low", { wakeHour: 7 });
    const moderate = recomputeSleepWindow(personalised, "moderate", { wakeHour: 7 });
    const high = recomputeSleepWindow(personalised, "high", { wakeHour: 7 });
    const veryHigh = recomputeSleepWindow(personalised, "very_high", { wakeHour: 7 });
    assert.equal(low.loadAdjustmentMinutes, 0);
    assert.equal(moderate.loadAdjustmentMinutes, 15);
    assert.equal(high.loadAdjustmentMinutes, 30);
    assert.equal(veryHigh.loadAdjustmentMinutes, 45);
    assert.ok(veryHigh.minHours > low.minHours);
    assert.ok(veryHigh.bedtimeFrom < low.bedtimeFrom);
    assert.equal(veryHigh.personalised, true);
  });
});

describe("personalized engine softening", () => {
  it("caps difficulty at Medium only when readiness is low", () => {
    assert.deepEqual(softenForLowReadiness({ min: 1, max: 3 }, null), { min: 1, max: 3 });
    assert.deepEqual(softenForLowReadiness({ min: 1, max: 3 }, { score: 80, isLow: false }), {
      min: 1,
      max: 3,
    });
    assert.deepEqual(softenForLowReadiness({ min: 0, max: 3 }, { score: 45, isLow: true }), {
      min: 0,
      max: 1,
    });
    // Never raises a low range.
    assert.deepEqual(softenForLowReadiness({ min: 0, max: 0 }, { score: 20, isLow: true }), {
      min: 0,
      max: 0,
    });
  });
});

describe("wiring", () => {
  const view = readFileSync("src/app/views/TrainRecovery.tsx", "utf8");
  const server = readFileSync("src/lib/challenge-engine.server.ts", "utf8");

  it("the view combines tasks, check-in, history, best sleep and the trend", () => {
    assert.match(view, /taskLoadPoints\(taskCompletions\)/);
    assert.match(view, /bestSleepRange\(dayHistory\)/);
    assert.match(view, /recomputeSleepWindow\(/);
    assert.match(view, /readinessTrend\(dayHistory, 7\)/);
    assert.match(view, /RECOVERY_HISTORY_STORAGE_KEY/);
    assert.match(view, /data-testid="recovery-7day-trend"/);
    assert.match(view, /data-testid="recovery-best-sleep"/);
    assert.match(view, /data-testid="recovery-low-flag"/);
  });

  it("the server reads the user's own readiness before selecting tasks", () => {
    assert.match(server, /from\("svj_readiness_daily"\)/);
    assert.match(server, /selectPersonalizedChallenges\(stats, goals, \[\], 6, readiness\)/);
    assert.match(server, /readinessNote/);
  });
});
