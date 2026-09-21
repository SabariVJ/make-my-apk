/**
 * Automated Training — deterministic domain engine regressions.
 *
 * Covers split selection (incl. the "Veteran with 2 days" and BMI-independence
 * rules), weekly scheduling, athlete/competition coordination, missed-session
 * reconciliation, progressive overload outcomes, template filtering and real
 * muscle history. Behavior only — never arbitrary Tailwind strings.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignTrainingDays,
  buildWeeklyPlan,
  currentSession,
  dateForWeekday,
  reconcileMissedSessions,
  selectSplit,
  toLocalIsoDate,
} from "../src/app/lib/trainingPlan";
import {
  emptyTrainingProfile,
  normalizeTrainingProfile,
  validateTrainingProfile,
  type TrainingProfile,
} from "../src/app/lib/trainingProfile";
import {
  WORKOUT_TEMPLATE_CATALOG,
  filterTemplates,
  templateForSlot,
  templateIsFeasible,
} from "../src/app/lib/trainingTemplates";
import {
  decideProgression,
  sessionQualifies,
  type PrescribedTarget,
  type SessionEvidence,
} from "../src/app/lib/trainingProgression";
import {
  computeMuscleHistory,
  muscleRecencyLabel,
  type CompletedExerciseEvidence,
} from "../src/app/lib/trainingMuscleHistory";

const profile = (over: Partial<TrainingProfile> = {}): TrainingProfile =>
  normalizeTrainingProfile({ ...emptyTrainingProfile(), setupComplete: true, ...over });

const NOW = new Date(2026, 8, 21, 9, 0, 0); // local Monday-ish

describe("split selection", () => {
  it("Scenario A: beginner, 3 days, dumbbells, general fitness → full-body sequence", () => {
    const decision = selectSplit({
      profile: profile({
        experience: "beginner",
        goal: "general",
        availableDays: [1, 3, 5],
        sessionsPerWeek: 3,
        equipment: ["dumbbells"],
      }),
    });
    assert.equal(decision.days, 3);
    assert.equal(decision.splitId, "full_body_alternating");
    assert.ok(decision.slots.every((s) => s.family === "full_body"));
  });

  it("Scenario B: intermediate, hypertrophy, 4 days, gym → Upper/Lower plan", () => {
    const decision = selectSplit({
      profile: profile({
        experience: "intermediate",
        goal: "muscle",
        availableDays: [1, 2, 4, 5],
        sessionsPerWeek: 4,
        equipment: ["full_gym"],
      }),
    });
    assert.equal(decision.splitId, "upper_lower");
    assert.deepEqual(
      decision.slots.map((s) => s.family),
      ["upper", "lower", "upper", "lower"],
    );
  });

  it("Scenario C: veteran with only 2 available days gets a real 2-day plan (never forced 6-day PPL)", () => {
    const decision = selectSplit({
      profile: profile({
        experience: "veteran",
        goal: "strength",
        availableDays: [2, 6],
        sessionsPerWeek: 6, // asks for 6 but only 2 days exist
        equipment: ["full_gym"],
      }),
    });
    assert.equal(decision.days, 2);
    assert.equal(decision.slots.length, 2);
    assert.equal(decision.splitId, "full_body_ab");
    assert.notEqual(decision.splitId, "ppl_x2");
  });

  it("Scenario D: athlete schedule uses sport context and 2–4 days", () => {
    const decision = selectSplit({
      profile: profile({
        experience: "veteran",
        goal: "athletic",
        availableDays: [1, 2, 3, 4, 5],
        sessionsPerWeek: 6,
        equipment: ["full_gym"],
        athlete: { sport: "football", practiceDays: [2, 4], competitionDates: [], inSeason: true },
      }),
    });
    assert.ok(decision.days <= 4);
    assert.ok(decision.slots.every((s) => s.family === "upper" || s.family === "lower"));
  });

  it("caps a beginner at 3 days even when more are available", () => {
    const decision = selectSplit({
      profile: profile({
        experience: "beginner",
        goal: "general",
        availableDays: [1, 2, 3, 4, 5],
        sessionsPerWeek: 5,
        equipment: ["full_gym"],
      }),
    });
    assert.equal(decision.days, 3);
    assert.equal(decision.cappedFrom, 5);
  });

  it("never consults BMI — split depends only on profile inputs", () => {
    // No body/BMI field exists on the profile; a plan is produced with none.
    const decision = selectSplit({ profile: profile({ experience: "beginner" }) });
    assert.ok(decision.slots.length > 0);
    assert.ok(!JSON.stringify(decision).toLowerCase().includes("bmi"));
  });
});

describe("weekly scheduling", () => {
  it("assigns sessions only to available training days", () => {
    const p = profile({ availableDays: [1, 3, 5], sessionsPerWeek: 3 });
    const days = assignTrainingDays(p, 3, NOW);
    assert.deepEqual(
      [...days].sort((a, b) => a - b),
      [1, 3, 5],
    );
  });

  it("spreads sessions evenly and never duplicates a day", () => {
    const p = profile({ availableDays: [1, 2, 3, 4, 5], sessionsPerWeek: 3 });
    const days = assignTrainingDays(p, 3, NOW);
    assert.equal(new Set(days).size, days.length);
    assert.equal(days.length, 3);
  });

  it("prefers non-practice days for athletes", () => {
    const p = profile({
      goal: "athletic",
      availableDays: [1, 2, 3, 4, 5],
      sessionsPerWeek: 3,
      athlete: { sport: "soccer", practiceDays: [2, 4], competitionDates: [], inSeason: true },
    });
    const days = assignTrainingDays(p, 3, NOW);
    assert.ok(!days.includes(2), "should avoid a practice day when alternatives exist");
    assert.ok(!days.includes(4));
  });

  it("moves lower-body work away from competition day", () => {
    const competition = toLocalIsoDate(dateForWeekday(3, NOW)); // Wed
    const p = profile({
      goal: "athletic",
      experience: "intermediate",
      availableDays: [1, 2, 3, 5, 6],
      sessionsPerWeek: 4,
      equipment: ["full_gym"],
      athlete: {
        sport: "rugby",
        practiceDays: [],
        competitionDates: [competition],
        inSeason: true,
      },
    });
    const decision = selectSplit({ profile: p });
    const plan = buildWeeklyPlan(p, decision, NOW);
    const lowerNearComp = plan.sessions.some((s) => {
      if (s.family !== "lower" && s.family !== "legs") return false;
      const d = new Date(`${s.scheduledDate}T12:00:00`);
      for (let b = 0; b <= 2; b += 1) {
        const check = new Date(d);
        check.setDate(check.getDate() + b);
        if (toLocalIsoDate(check) === competition) return true;
      }
      return false;
    });
    assert.equal(lowerNearComp, false);
  });

  it("currentSession returns today's or the next scheduled session", () => {
    const p = profile({ availableDays: [1, 3, 5], sessionsPerWeek: 3 });
    const plan = buildWeeklyPlan(p, selectSplit({ profile: p }), NOW);
    const session = currentSession(plan, NOW);
    assert.ok(session);
    assert.equal(session?.status, "scheduled");
  });
});

describe("missed-session reconciliation", () => {
  it("rolls a missed session forward without stacking two on one day", () => {
    const p = profile({ availableDays: [1, 2, 3, 4, 5], sessionsPerWeek: 3 });
    const plan = buildWeeklyPlan(p, selectSplit({ profile: p }), NOW);
    // Pretend two sessions are in the past and uncompleted.
    plan.sessions[0].scheduledDate = "2026-09-01";
    plan.sessions[1].scheduledDate = "2026-09-02";
    const today = new Date(2026, 8, 21);
    const { plan: next, rolledForward } = reconcileMissedSessions(p, plan, today);
    assert.ok(rolledForward >= 1);
    const future = next.sessions.filter((s) => s.scheduledDate >= "2026-09-21");
    const dates = future.map((s) => s.scheduledDate);
    assert.equal(new Set(dates).size, dates.length, "no two sessions share a day");
  });

  it("never touches completed sessions", () => {
    const p = profile({ availableDays: [1, 2, 3], sessionsPerWeek: 3 });
    const plan = buildWeeklyPlan(p, selectSplit({ profile: p }), NOW);
    plan.sessions[0].status = "completed";
    plan.sessions[0].completedActivityId = "act-1";
    const { plan: next } = reconcileMissedSessions(p, plan, new Date(2026, 8, 30));
    assert.equal(next.sessions[0].status, "completed");
    assert.equal(next.sessions[0].completedActivityId, "act-1");
  });
});

describe("template catalog + filtering", () => {
  it("has reviewed session families with stable exercise slugs", () => {
    const families = new Set(WORKOUT_TEMPLATE_CATALOG.map((t) => t.family));
    for (const expected of [
      "full_body",
      "upper",
      "lower",
      "push",
      "pull",
      "legs",
      "athletic_full_body",
    ]) {
      assert.ok(families.has(expected as never), `missing ${expected}`);
    }
    for (const t of WORKOUT_TEMPLATE_CATALOG) {
      assert.ok(t.exercises.length > 0);
      for (const e of t.exercises) assert.ok(e.slug.length > 0);
    }
  });

  it("filters by goal, session family, muscle and equipment", () => {
    const upper = filterTemplates(WORKOUT_TEMPLATE_CATALOG, { families: ["upper"] });
    assert.ok(upper.length >= 2);
    assert.ok(upper.every((t) => t.family === "upper"));

    const chest = filterTemplates(WORKOUT_TEMPLATE_CATALOG, { muscles: ["chest"] });
    assert.ok(chest.some((t) => t.id === "upper_a"));

    const strength = filterTemplates(WORKOUT_TEMPLATE_CATALOG, { goal: "strength" });
    assert.ok(strength.length > 0);

    const bodyweightOnly = filterTemplates(WORKOUT_TEMPLATE_CATALOG, { equipment: ["bodyweight"] });
    for (const t of bodyweightOnly) {
      assert.equal(templateIsFeasible(t, ["bodyweight"]), true);
    }
  });

  it("resolves a slot's family + variant to a real template", () => {
    assert.ok(templateForSlot("upper", "B")?.id === "upper_b");
    assert.ok(templateForSlot("legs", "A")?.id === "legs_a");
  });
});

describe("progressive overload", () => {
  const target = (over: Partial<PrescribedTarget> = {}): PrescribedTarget => ({
    exerciseSlug: "bench_press",
    exerciseName: "Bench Press",
    loadType: "weighted",
    loadConvention: "barbell_total",
    equipmentKey: "barbell",
    workSets: 3,
    repMin: 8,
    repMax: 12,
    durationSeconds: null,
    loadKg: 60,
    targetRpe: 8,
    ...over,
  });

  const session = (
    performedAt: string,
    over: Partial<SessionEvidence> = {},
    reps: number[] = [12, 12, 12],
    rir = 2,
  ): SessionEvidence => ({
    activityId: `a-${performedAt}`,
    performedAt,
    target: target(),
    sets: reps.map((r, i) => ({
      setNumber: i + 1,
      reps: r,
      weightKg: 60,
      durationSeconds: null,
      isWarmup: false,
      rir,
      pain: false,
      skipped: false,
    })),
    controlledTechnique: true,
    perceivedEffort: 7,
    ...over,
  });

  const day = (n: number) => new Date(2026, 8, 21 - n, 12, 0, 0).toISOString();

  it("Scenario J: one perfect session → hold", () => {
    const d = decideProgression(target(), [session(day(1))], NOW);
    assert.equal(d.action, "hold");
    assert.equal(d.suggestedLoadKg, null);
  });

  it("Scenario K: two qualifying comparable sessions → small permitted increase", () => {
    const d = decideProgression(target(), [session(day(1)), session(day(3))], NOW);
    assert.equal(d.action, "increase");
    assert.ok((d.suggestedLoadKg ?? 0) > 60);
    assert.ok((d.suggestedLoadKg ?? 0) <= 60 * 1.05 + 0.001);
  });

  it("Scenario L: missing effort → hold", () => {
    const d = decideProgression(
      target(),
      [
        session(day(1), { perceivedEffort: null }, [12, 12, 12], null),
        session(day(3), { perceivedEffort: null }, [12, 12, 12], null),
      ],
      NOW,
    );
    assert.equal(d.action, "hold");
  });

  it("Scenario L: failed set → hold", () => {
    const d = decideProgression(
      target(),
      [session(day(1), {}, [12, 12, 5]), session(day(3), {}, [12, 12, 4])],
      NOW,
    );
    assert.notEqual(d.action, "increase");
  });

  it("Scenario L: oversized equipment jump → progress reps instead of load", () => {
    const light = target({
      loadKg: 8,
      loadConvention: "dumbbell_per_hand",
      equipmentKey: "dumbbell",
    });
    const withTarget = (s: SessionEvidence): SessionEvidence => ({ ...s, target: light });
    const d = decideProgression(
      light,
      [withTarget(session(day(1))), withTarget(session(day(3)))],
      NOW,
    );
    assert.equal(d.action, "increase");
    assert.equal(d.suggestedLoadKg, null);
    assert.ok((d.suggestedReps?.max ?? 0) > 12);
  });

  it("Scenario M: long layoff → re-entry prescription", () => {
    const old = new Date(2026, 7, 1, 12, 0, 0).toISOString(); // ~50 days
    const d = decideProgression(target(), [session(old)], NOW);
    assert.equal(d.action, "reentry");
    assert.ok((d.suggestedLoadKg ?? 100) < 60);
  });

  it("Scenario N: pain stops automatic progression (no diagnosis)", () => {
    const painful = session(day(1));
    painful.sets[0].pain = true;
    const d = decideProgression(target(), [painful, session(day(3))], NOW);
    assert.equal(d.action, "stop_pain");
    assert.equal(d.suggestedLoadKg, null);
  });

  it("Scenario O: bodyweight progresses reps, duration progresses time", () => {
    const bwTarget = target({
      loadType: "bodyweight",
      loadKg: null,
      equipmentKey: "bodyweight",
      exerciseSlug: "push_up",
    });
    const bw = (iso: string): SessionEvidence => ({
      ...session(iso, { target: bwTarget }),
      target: bwTarget,
    });
    const bwDecision = decideProgression(bwTarget, [bw(day(1)), bw(day(3))], NOW);
    assert.equal(bwDecision.action, "increase");
    assert.ok((bwDecision.suggestedReps?.max ?? 0) > 12);

    const holdTarget = target({
      loadType: "duration",
      loadKg: null,
      equipmentKey: "bodyweight",
      exerciseSlug: "plank",
      repMin: 0,
      repMax: 0,
      durationSeconds: 45,
    });
    const hold = (iso: string): SessionEvidence => ({
      activityId: `h-${iso}`,
      performedAt: iso,
      target: holdTarget,
      sets: [0, 1, 2].map((i) => ({
        setNumber: i + 1,
        reps: null,
        weightKg: null,
        durationSeconds: 45,
        isWarmup: false,
        rir: 2,
        pain: false,
        skipped: false,
      })),
      controlledTechnique: true,
      perceivedEffort: 7,
    });
    const holdDecision = decideProgression(holdTarget, [hold(day(1)), hold(day(3))], NOW);
    assert.equal(holdDecision.action, "increase");
    assert.ok((holdDecision.suggestedDurationSeconds ?? 0) > 45);
  });

  it("Scenario O: assisted movements treat less assistance as progress", () => {
    const assisted = target({
      loadType: "assisted",
      loadConvention: "assisted",
      equipmentKey: "assisted_machine",
      exerciseSlug: "pull_up",
      loadKg: 20,
    });
    const s = (iso: string): SessionEvidence => ({
      ...session(iso, { target: assisted }),
      target: assisted,
    });
    const d = decideProgression(assisted, [s(day(1)), s(day(3))], NOW);
    assert.equal(d.action, "increase");
    assert.ok((d.suggestedLoadKg ?? 100) < 20, "assistance should decrease");
  });

  it("ignores warm-up sets and requires the planned working-set count", () => {
    const warmupOnly = session(day(1), {}, [12, 12, 12]);
    warmupOnly.sets = warmupOnly.sets.map((x) => ({ ...x, isWarmup: true }));
    assert.equal(sessionQualifies(warmupOnly, target()), false);
  });
});

describe("muscle history from real completed sets", () => {
  const ex = (
    slug: string,
    primary: CompletedExerciseEvidence["primaryMuscle"],
    secondary: CompletedExerciseEvidence["secondaryMuscles"],
    sets: CompletedExerciseEvidence["sets"],
    localDate = "2026-09-20",
  ): CompletedExerciseEvidence => ({
    activityId: `act-${slug}-${localDate}`,
    performedAt: `${localDate}T10:00:00.000Z`,
    localDate,
    exerciseSlug: slug,
    primaryMuscle: primary,
    secondaryMuscles: secondary,
    sets,
  });

  const working = (reps = 10, weightKg = 60): CompletedExerciseEvidence["sets"][number] => ({
    reps,
    weightKg,
    durationSeconds: null,
    isWarmup: false,
    skipped: false,
  });

  it("Scenario G: only completed exercises count as trained", () => {
    // Full-body template: bench + row performed, squat not.
    const result = computeMuscleHistory(
      [
        ex("bench_press", "chest", ["triceps"], [working()]),
        ex("barbell_row", "back", ["biceps"], [working()]),
      ],
      { now: new Date(2026, 8, 21) },
    );
    const byMuscle = new Map(result.entries.map((e) => [e.muscle, e]));
    assert.equal(byMuscle.get("chest")?.status, "trained");
    assert.equal(byMuscle.get("back")?.status, "trained");
    assert.equal(byMuscle.get("quads")?.status, "no_logged_training");
    assert.equal(byMuscle.get("triceps")?.status, "trained"); // supporting work
  });

  it("Scenario F: an abandoned draft (no completed sets) trains nothing", () => {
    const result = computeMuscleHistory([], { now: new Date(2026, 8, 21) });
    assert.ok(result.entries.every((e) => e.status === "no_logged_training"));
    assert.equal(result.workingSetCount, 0);
  });

  it("excludes skipped sets and classifies warm-ups separately", () => {
    const sets = [working(), { ...working(), skipped: true }, { ...working(), isWarmup: true }];
    const result = computeMuscleHistory([ex("squat", "quads", ["glutes"], sets)], {
      now: new Date(2026, 8, 21),
    });
    const quads = result.entries.find((e) => e.muscle === "quads");
    assert.equal(quads?.directSets7d, 1);
    assert.equal(quads?.warmupSets7d, 1);
    assert.equal(result.workingSetCount, 1);
  });

  it("separates direct vs supporting work and computes weighted volume", () => {
    const result = computeMuscleHistory(
      [ex("bench_press", "chest", ["triceps"], [working(10, 70), working(10, 70)])],
      { now: new Date(2026, 8, 21) },
    );
    const chest = result.entries.find((e) => e.muscle === "chest");
    const triceps = result.entries.find((e) => e.muscle === "triceps");
    assert.equal(chest?.directSets7d, 2);
    assert.equal(chest?.directVolume7d, 1400);
    assert.equal(triceps?.directSets7d, 0);
    assert.equal(triceps?.supportingSets7d, 2);
  });

  it("respects the local day for workouts crossing midnight", () => {
    const lateNight = ex("squat", "quads", [], [working()], "2026-09-20");
    lateNight.performedAt = "2026-09-20T23:30:00.000Z";
    const result = computeMuscleHistory([lateNight], { now: new Date(2026, 8, 21) });
    const quads = result.entries.find((e) => e.muscle === "quads");
    assert.equal(quads?.lastTrainedLocalDate, "2026-09-20");
    assert.equal(muscleRecencyLabel(quads!, new Date(2026, 8, 21)), "Yesterday");
  });

  it("reports unknown/older history honestly instead of inventing dates", () => {
    const result = computeMuscleHistory([], {
      now: new Date(2026, 8, 21),
      unknownMetadataExercises: 3,
    });
    const chest = result.entries.find((e) => e.muscle === "chest");
    assert.equal(chest?.lastTrainedLocalDate, null);
    assert.equal(chest?.status, "older_unclassified");
    assert.equal(muscleRecencyLabel(chest!), "Older sets unclassified");
  });
});

describe("training profile", () => {
  it("normalizes untrusted records and drops invalid values", () => {
    const normalized = normalizeTrainingProfile({
      experience: "godlike",
      equipment: [],
      availableDays: [9, 1, 1, 3],
      sessionsPerWeek: 99,
      units: "lb",
    });
    assert.equal(normalized.experience, "beginner");
    assert.deepEqual(normalized.availableDays, [1, 3]);
    assert.ok(normalized.sessionsPerWeek <= 6);
    assert.equal(normalized.units, "lb");
    assert.deepEqual(normalized.equipment, ["full_gym"]);
  });

  it("requires a sport for an athletic goal but not for others", () => {
    const athletic = profile({
      goal: "athletic",
      availableDays: [1, 3],
      athlete: { sport: "", practiceDays: [], competitionDates: [], inSeason: false },
    });
    assert.ok(validateTrainingProfile(athletic));
    const general = profile({ goal: "general", availableDays: [1, 3] });
    assert.equal(validateTrainingProfile(general), null);
  });

  it("BMI is never a profile field", () => {
    const keys = Object.keys(emptyTrainingProfile());
    assert.ok(!keys.some((k) => k.toLowerCase().includes("bmi")));
  });
});
