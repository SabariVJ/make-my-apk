import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMeasurement,
  activeKcalGoal,
  buildHistory,
  claimMilestone,
  dateKeyOf,
  emptyActivityState,
  estimateBmr,
  estimateCalories,
  estimateStrideMeters,
  normalizeActivityState,
  pendingMilestones,
  rollActivityDay,
  startSession,
  STEP_MILESTONES,
  summarizeHistory,
} from "./activityTracker";

const MORNING = new Date(2026, 8, 10, 9, 0, 0); // 2026-09-10 09:00 local
const EVENING = new Date(2026, 8, 10, 21, 0, 0);

describe("dateKeyOf", () => {
  it("formats the local calendar day", () => {
    assert.equal(dateKeyOf(MORNING), "2026-09-10");
  });
});

describe("rollActivityDay", () => {
  it("archives today, resets baselines, and re-anchors a live session at midnight", () => {
    const state = {
      ...emptyActivityState(),
      today: {
        dateKey: "2026-09-09",
        steps: 4200,
        distanceMeters: 3000,
        activeSeconds: 1800,
        activeKcal: 120,
        totalKcal: 1800,
        xpMilestones: [2500],
      },
      sessionRefSteps: 4200,
      sessionRefDistance: 3000,
      sessionLastSteps: 8050,
      sessionLastDistance: 5800,
    };
    const { state: rolled, rolled: didRoll } = rollActivityDay(state, MORNING);
    assert.equal(didRoll, true);
    assert.equal(rolled.today?.dateKey, "2026-09-10");
    assert.equal(rolled.today?.steps, 0);
    assert.equal(rolled.days.length, 1);
    assert.equal(rolled.days[0].steps, 4200);
    // The live session re-anchors: the next delta counts only post-midnight steps.
    assert.equal(rolled.sessionRefSteps, 8050);
    assert.equal(rolled.sessionRefDistance, 5800);
  });

  it("keeps the same record within one day", () => {
    const state = {
      ...emptyActivityState(),
      today: {
        dateKey: "2026-09-10",
        steps: 10,
        distanceMeters: 0,
        activeSeconds: 0,
        activeKcal: 0,
        totalKcal: 0,
        xpMilestones: [],
      },
    };
    const { state: rolled, rolled: didRoll } = rollActivityDay(state, EVENING);
    assert.equal(didRoll, false);
    assert.equal(rolled.today?.steps, 10);
    assert.equal(rolled.days.length, 0);
  });

  it("counts only the delta when a live session crosses midnight", () => {
    // Production bug regression: an Android session reporting 8050 cumulative
    // steps at 00:01 must add only post-midnight steps to the new day.
    let state = startSession(emptyActivityState(), new Date(2026, 8, 9, 8, 0, 0), 0);
    const lateNight = new Date(2026, 8, 9, 23, 59, 0);
    state = applyMeasurement(state, lateNight, { steps: 8050, atMs: lateNight.getTime() });
    assert.equal(state.today?.steps, 8050);
    const nextDay = new Date(2026, 8, 10, 0, 1, 0);
    state = applyMeasurement(state, nextDay, { steps: 8080, atMs: nextDay.getTime() });
    assert.equal(state.today?.dateKey, "2026-09-10");
    assert.equal(state.today?.steps, 30);
  });
});

describe("applyMeasurement", () => {
  it("merges the anchor baseline with session-relative sensor deltas", () => {
    // startSession(6800) seeds today with 6800 walked steps; the session's
    // first cumulative reading of 1200 adds only its delta (1200 - 0).
    let state = startSession(emptyActivityState(), MORNING, 6800);
    state = applyMeasurement(state, EVENING, { steps: 1200, atMs: EVENING.getTime() });
    assert.equal(state.today?.steps, 8000);
    assert.equal(state.today?.dateKey, "2026-09-10");
  });

  it("counts only the delta between successive readings", () => {
    let state = startSession(emptyActivityState(), MORNING, 0);
    const t1 = new Date(2026, 8, 10, 12, 0, 0);
    state = applyMeasurement(state, t1, { steps: 300, atMs: t1.getTime() });
    assert.equal(state.today?.steps, 300);
    const t2 = new Date(2026, 8, 10, 13, 0, 0);
    state = applyMeasurement(state, t2, { steps: 700, atMs: t2.getTime() });
    assert.equal(state.today?.steps, 700); // +400 delta, not 700 again
  });

  it("does not count active time before the first sync of a session", () => {
    let state = startSession(emptyActivityState(), MORNING, 0);
    const t1 = new Date(2026, 8, 10, 10, 0, 0);
    state = applyMeasurement(state, t1, { steps: 1000, atMs: t1.getTime() });
    // No prior sync point — the elapsed hour since session start is unknown
    // activity, so it must not be counted.
    assert.equal(state.today?.activeSeconds, 0);
    // A second increase counts only the capped gap since the last sync.
    const t2 = new Date(2026, 8, 10, 10, 1, 0);
    state = applyMeasurement(state, t2, { steps: 1300, atMs: t2.getTime() });
    assert.equal(state.today?.activeSeconds, 60);
  });

  it("caps the active-time gap between syncs at two minutes", () => {
    let state = startSession(emptyActivityState(), MORNING, 0);
    const t1 = new Date(2026, 8, 10, 10, 0, 0);
    const t2 = new Date(2026, 8, 10, 11, 0, 0); // one hour later
    state = applyMeasurement(state, t1, { steps: 500, atMs: t1.getTime() });
    const activeAfterFirst = state.today?.activeSeconds ?? 0;
    state = applyMeasurement(state, t2, { steps: 1500, atMs: t2.getTime() });
    assert.equal((state.today?.activeSeconds ?? 0) - activeAfterFirst, 120);
  });
});

describe("milestones", () => {
  it("awards each milestone once per day", () => {
    let state = startSession(emptyActivityState(), MORNING, 0);
    state = applyMeasurement(state, EVENING, { steps: 5200, atMs: EVENING.getTime() });
    const pending = pendingMilestones(state.today);
    assert.deepEqual(
      pending.map((m) => m.steps),
      [2500, 5000],
    );
    state = claimMilestone(state, EVENING, 2500);
    state = claimMilestone(state, EVENING, 5000);
    assert.deepEqual(pendingMilestones(state.today), []);
    // Claiming again is a no-op.
    const unchanged = claimMilestone(state, EVENING, 2500);
    assert.equal(unchanged, state);
  });

  it("allows the same milestone again the next day", () => {
    let state = startSession(emptyActivityState(), MORNING, 0);
    state = applyMeasurement(state, EVENING, { steps: 2600, atMs: EVENING.getTime() });
    state = claimMilestone(state, EVENING, 2500);
    const nextDay = new Date(2026, 8, 11, 8, 0, 0);
    // A new sensor session anchors the next day from zero.
    state = startSession(state, nextDay, 0);
    state = applyMeasurement(state, nextDay, { steps: 2600, atMs: nextDay.getTime() });
    const pending = pendingMilestones(state.today);
    assert.ok(pending.some((m) => m.steps === 2500));
  });

  it("defines exactly the four required thresholds", () => {
    assert.deepEqual(
      STEP_MILESTONES.map((m) => m.steps),
      [2500, 5000, 7500, 10000],
    );
  });
});

describe("calorie estimation", () => {
  it("uses a sensible per-step fallback when only steps are known", () => {
    const { activeKcal } = estimateCalories(
      { steps: 10000, distanceMeters: 0, activeSeconds: 0 },
      {},
      EVENING,
    );
    // 10000 steps ≈ 7.1 km at 70 kg → ~266 kcal active.
    assert.ok(activeKcal > 150 && activeKcal < 450, `activeKcal=${activeKcal}`);
  });

  it("prefers real distance and duration via the MET model", () => {
    const withDuration = estimateCalories(
      { steps: 10000, distanceMeters: 7200, activeSeconds: 5400 },
      { weightKg: 80 },
      EVENING,
    );
    assert.ok(withDuration.activeKcal > 200);
  });

  it("reports total kcal as active plus the elapsed share of BMR", () => {
    const { activeKcal, totalKcal } = estimateCalories(
      { steps: 5000, distanceMeters: 0, activeSeconds: 0 },
      { weightKg: 70, heightCm: 175, ageYears: 30, sex: "male" },
      EVENING, // 21h elapsed
    );
    assert.ok(totalKcal > activeKcal);
    assert.ok(totalKcal > 1500); // ~1712 BMR × 21/24 + active
  });

  it("prefers the assessment BMR when provided", () => {
    const bmr = estimateBmr({ bmr: 1800 });
    assert.equal(bmr, 1800);
    const mifflin = estimateBmr({ weightKg: 70, heightCm: 175, ageYears: 30, sex: "male" });
    assert.equal(mifflin, 1649); // 10*70 + 6.25*175 - 5*30 + 5 = 1648.75
  });

  it("scales the stride with height and falls back to average", () => {
    assert.ok(Math.abs(estimateStrideMeters({ heightCm: 180 }) - 0.745) < 0.001);
    assert.equal(estimateStrideMeters({}), 0.71);
  });

  it("derives the active goal from the assessment calorie target", () => {
    assert.equal(activeKcalGoal({ dailyCalorieTarget: 2400 }), 600);
    assert.equal(activeKcalGoal({}), 500);
    assert.equal(activeKcalGoal({ dailyCalorieTarget: 1200 }), 300);
  });

  it("never counts steps twice across sources", () => {
    // Same day record passed twice must produce identical estimates.
    const day = { steps: 6000, distanceMeters: 4300, activeSeconds: 3600 };
    const a = estimateCalories(day, { weightKg: 75 }, EVENING);
    const b = estimateCalories(day, { weightKg: 75 }, EVENING);
    assert.deepEqual(a, b);
  });
});

describe("normalizeActivityState", () => {
  it("repairs partial or corrupt persisted payloads", () => {
    const restored = normalizeActivityState({
      days: [{ dateKey: "2026-09-08", steps: -5, activeSeconds: "x" }, null, { steps: 10 }],
      today: { dateKey: "2026-09-09", steps: 300, xpMilestones: ["2500", 2500] },
      sessionRefSteps: "bad",
      sessionLastSteps: 456,
      lastSyncedAt: 123,
    });
    assert.equal(restored.days.length, 1);
    assert.equal(restored.days[0].steps, 0);
    assert.equal(restored.today?.steps, 300);
    assert.deepEqual(restored.today?.xpMilestones, [2500]);
    assert.equal(restored.sessionRefSteps, 0);
    assert.equal(restored.sessionLastSteps, 456);
    assert.equal(restored.lastSyncedAt, 123);
  });

  it("returns a clean state for garbage input", () => {
    assert.deepEqual(normalizeActivityState(null), emptyActivityState());
    assert.deepEqual(normalizeActivityState("nope"), emptyActivityState());
  });
});

describe("history", () => {
  it("builds a bounded series with today last", () => {
    const state = normalizeActivityState({
      days: [
        { dateKey: "2026-09-08", steps: 8000, activeKcal: 250, totalKcal: 2200, xpMilestones: [] },
        { dateKey: "2026-09-09", steps: 12000, activeKcal: 380, totalKcal: 2400, xpMilestones: [] },
      ],
      today: {
        dateKey: "2026-09-10",
        steps: 4200,
        activeKcal: 140,
        totalKcal: 1900,
        xpMilestones: [],
      },
    });
    const history = buildHistory(state, MORNING, 7);
    assert.equal(history.length, 3);
    assert.equal(history.at(-1)?.dateKey, "2026-09-10");
    assert.equal(history[0].dateKey, "2026-09-08");
  });

  it("summarizes averages and best day", () => {
    const state = normalizeActivityState({
      days: [
        { dateKey: "2026-09-08", steps: 8000, activeKcal: 250, totalKcal: 2200, xpMilestones: [] },
        { dateKey: "2026-09-09", steps: 12000, activeKcal: 380, totalKcal: 2400, xpMilestones: [] },
      ],
      today: {
        dateKey: "2026-09-10",
        steps: 4000,
        activeKcal: 120,
        totalKcal: 1900,
        xpMilestones: [],
      },
    });
    const summary = summarizeHistory(buildHistory(state, MORNING, 7));
    assert.equal(summary.averageSteps, 8000);
    assert.equal(summary.bestDay?.dateKey, "2026-09-09");
    assert.equal(summary.averageActiveKcal, 250);
  });
});
