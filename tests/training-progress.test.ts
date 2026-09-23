/**
 * Automated Training — progress / coverage / consistency / review.
 *
 * Behaviour only, computed from real-shaped inputs. These tests also pin the
 * load-convention contract: the client's declared conventions must match the
 * SQL seed exactly, or a progress comparison could equate two different loads.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildConsistency,
  buildExerciseProgress,
  buildMuscleCoverage,
  buildPlanReview,
  computeTrend,
  coverageGaps,
  decisionHeadline,
  decisionReason,
  recency,
  type ProgressSessionInput,
} from "../src/app/lib/trainingProgress";
import { CATALOG_LOAD_CONVENTIONS, loadConventionForSlug } from "../src/app/lib/trainingTemplates";
import type { MuscleHistoryRow, ServerPlanSession } from "../src/app/lib/trainingClient";

const session = (
  localDate: string,
  sets: ProgressSessionInput["sets"],
  loadConvention: ProgressSessionInput["loadConvention"] = "barbell_total",
): ProgressSessionInput => ({
  activityId: `act-${localDate}`,
  performedAt: `${localDate}T10:00:00.000Z`,
  localDate,
  sets,
  loadConvention,
});

const working = (reps: number, weightKg: number | null = 60) => ({
  reps,
  weightKg,
  durationSeconds: null,
  isWarmup: false,
});

describe("exercise progress", () => {
  it("excludes warm-up sets from working sets, volume and best weight", () => {
    const progress = buildExerciseProgress({
      exerciseId: "ex-bench",
      exerciseName: "Bench Press",
      loadConvention: "barbell_total",
      sessions: [
        session("2026-09-10", [
          { reps: 15, weightKg: 100, durationSeconds: null, isWarmup: true },
          working(10, 60),
          working(10, 60),
        ]),
        session("2026-09-12", [working(10, 62.5), working(10, 62.5)]),
      ],
    });
    assert.equal(progress.workingSetCount, 4);
    assert.equal(progress.warmupSetCount, 1);
    assert.equal(progress.bestWeightKg, 62.5, "the 100 kg ramp-up is not the best working weight");
    assert.equal(progress.totalVolumeKg, 60 * 10 * 2 + 62.5 * 10 * 2);
    assert.equal(progress.points.length, 2);
  });

  it("never claims a trend from fewer than four observations", () => {
    const progress = buildExerciseProgress({
      exerciseId: "ex-bench",
      exerciseName: "Bench Press",
      sessions: [
        session("2026-09-10", [working(10, 50)]),
        session("2026-09-12", [working(10, 55)]),
        session("2026-09-14", [working(10, 60)]),
      ],
    });
    assert.equal(progress.trend, "insufficient_data");
    assert.equal(computeTrend([]), "insufficient_data");
    assert.equal(computeTrend([50, 60]), "insufficient_data");
  });

  it("reports improving and declining from real recent sessions", () => {
    const at = (weights: number[]) =>
      weights.map((w, i) => session(`2026-09-0${i + 1}`, [working(10, w)]));
    assert.equal(
      buildExerciseProgress({
        exerciseId: "x",
        exerciseName: "X",
        sessions: at([50, 50, 50, 60, 60, 60]),
      }).trend,
      "improving",
    );
    assert.equal(
      buildExerciseProgress({
        exerciseId: "x",
        exerciseName: "X",
        sessions: at([60, 60, 60, 50, 50, 50]),
      }).trend,
      "declining",
    );
  });

  it("uses reps as the trend basis for bodyweight work and duration for timed work", () => {
    const bodyweight = buildExerciseProgress({
      exerciseId: "ex-pushup",
      exerciseName: "Push-Up",
      loadConvention: "bodyweight_added",
      sessions: ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-07"].map((d) =>
        session(d, [{ reps: 20, weightKg: null, durationSeconds: null, isWarmup: false }]),
      ),
    });
    assert.equal(bodyweight.trendBasis, "reps");
    assert.equal(bodyweight.bestWeightKg, null);

    const timed = buildExerciseProgress({
      exerciseId: "ex-plank",
      exerciseName: "Plank",
      loadConvention: "bodyweight_added",
      sessions: ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-07"].map((d) =>
        session(d, [{ reps: null, weightKg: null, durationSeconds: 60, isWarmup: false }]),
      ),
    });
    assert.equal(timed.trendBasis, "duration");
    assert.equal(timed.bestHoldSeconds, 60);
  });

  it("flags incomparable conventions instead of averaging them", () => {
    const progress = buildExerciseProgress({
      exerciseId: "ex-bench",
      exerciseName: "Bench Press",
      loadConvention: "barbell_total",
      sessions: [
        session("2026-09-10", [working(10, 60)], "barbell_total"),
        session("2026-09-12", [working(10, 20)], "dumbbell_per_hand"),
      ],
    });
    assert.equal(progress.conventionConsistent, false);
  });

  it("ignores sessions with no completed working sets (warm-up only)", () => {
    const progress = buildExerciseProgress({
      exerciseId: "ex-bench",
      exerciseName: "Bench Press",
      sessions: [
        session("2026-09-10", [{ reps: 15, weightKg: 20, durationSeconds: null, isWarmup: true }]),
      ],
    });
    assert.equal(progress.sessionCount, 0);
    assert.equal(progress.workingSetCount, 0);
  });
});

describe("load conventions", () => {
  it("matches the server-side seed exactly", () => {
    const sql = readFileSync("supabase/migrations/20260928000000_training_progress.sql", "utf8");
    const seeded = new Map<string, string>();
    for (const match of sql.matchAll(
      /\('([a-z_]+)', '(barbell_total|dumbbell_per_hand|machine_stack|assisted|cable|bodyweight_added)'\)/g,
    )) {
      seeded.set(match[1], match[2]);
    }
    assert.ok(seeded.size >= 30, "the migration must declare the reviewed catalog");
    for (const [slug, convention] of Object.entries(CATALOG_LOAD_CONVENTIONS)) {
      assert.equal(seeded.get(slug), convention, `convention drift for ${slug}`);
    }
  });

  it("derives a convention per exercise and never for a mismatched load type", () => {
    assert.equal(loadConventionForSlug("dumbbell_bench_press", "weighted"), "dumbbell_per_hand");
    assert.equal(loadConventionForSlug("squat", "weighted"), "barbell_total");
    assert.equal(loadConventionForSlug("tricep_pushdown", "weighted"), "cable");
    assert.equal(loadConventionForSlug("unknown_movement", "weighted"), "barbell_total");
    assert.equal(loadConventionForSlug("whatever", "assisted"), "assisted");
    assert.equal(loadConventionForSlug("whatever", "bodyweight"), "bodyweight_added");
  });
});

describe("weekly muscle coverage", () => {
  const rows: MuscleHistoryRow[] = [
    {
      muscle: "chest",
      directSets: 8,
      supportingSets: 0,
      directVolume: 4800,
      lastTrainedAt: "2026-09-20T10:00:00.000Z",
      lastTrainedDate: "2026-09-20",
    },
    {
      muscle: "back",
      directSets: 0,
      supportingSets: 4,
      directVolume: 0,
      lastTrainedAt: null,
      lastTrainedDate: null,
    },
    {
      muscle: "quads",
      directSets: 0,
      supportingSets: 0,
      directVolume: 0,
      lastTrainedAt: null,
      lastTrainedDate: null,
    },
  ];

  it("reports direct/supporting sets and a human recency label — never a recovery percentage", () => {
    const entries = buildMuscleCoverage(rows, { now: new Date(2026, 8, 21) });
    const chest = entries.find((e) => e.muscle === "chest");
    assert.equal(chest?.label, "Chest");
    assert.equal(chest?.directSets, 8);
    assert.equal(chest?.recencyLabel, "Yesterday");
    assert.equal(chest?.status, "trained");
    assert.ok(!JSON.stringify(entries).toLowerCase().includes("% recovered"));
  });

  it("says 'No logged training' rather than a misleading zero, and exposes gaps", () => {
    const entries = buildMuscleCoverage(rows, { now: new Date(2026, 8, 21) });
    const back = entries.find((e) => e.muscle === "back");
    assert.equal(back?.recencyLabel, "No logged training");
    assert.equal(back?.status, "not_trained");
    // Supporting work still counts as coverage; an untrained muscle is a gap.
    assert.equal(back?.totalSets, 4);
    assert.deepEqual(
      coverageGaps(entries).map((e) => e.muscle),
      ["quads"],
    );
    assert.equal(recency(null), "No logged training");
  });
});

describe("consistency", () => {
  const planSession = (
    slotIndex: number,
    scheduledDate: string,
    status: ServerPlanSession["status"],
  ): ServerPlanSession => ({
    id: `s-${slotIndex}`,
    slotIndex,
    templateId: "upper_a",
    templateVersion: 1,
    scheduledDate,
    status,
    targets: [],
    completedActivityId: null,
  });

  it("separates completed, missed, rescheduled, upcoming and omitted sessions", () => {
    const summary = buildConsistency(
      [
        planSession(0, "2026-09-14", "completed"),
        planSession(1, "2026-09-16", "moved"),
        planSession(2, "2026-09-18", "scheduled"),
        planSession(3, "2026-09-22", "scheduled"),
        planSession(4, "2026-09-24", "skipped"),
      ],
      { today: new Date(2026, 8, 21) },
    );
    assert.equal(summary.completed, 1);
    assert.equal(summary.moved, 1);
    assert.equal(summary.missed, 1);
    assert.equal(summary.upcoming, 1);
    assert.equal(summary.omitted, 1);
    assert.equal(summary.eligible, 3);
    assert.equal(summary.attendancePercent, 67);
  });

  it("keeps attendance separate from performance", () => {
    const summary = buildConsistency([planSession(0, "2026-09-14", "completed")], {
      today: new Date(2026, 8, 21),
    });
    assert.match(summary.performanceNote, /Progression is judged separately/);
  });

  it("never reports 0% when nothing is eligible yet", () => {
    const summary = buildConsistency([planSession(0, "2026-09-25", "scheduled")], {
      today: new Date(2026, 8, 21),
    });
    assert.equal(summary.attendancePercent, null);
  });
});

describe("plan review", () => {
  const base = {
    blockEnd: "2026-09-27",
    coverage: [],
    decisions: [],
    today: new Date(2026, 8, 21),
  };
  const consistencyOf = (completed: number, missed: number, upcoming = 0) => ({
    rows: [],
    completed,
    missed,
    moved: 0,
    upcoming,
    omitted: 0,
    eligible: completed + missed,
    attendancePercent: null,
    performanceNote: "",
  });

  it("keeps the current split when the block is on track", () => {
    const review = buildPlanReview({
      ...base,
      consistency: consistencyOf(8, 0, 2),
      daysSinceLastSession: 2,
    });
    assert.equal(review.recommendation, "continue");
    assert.match(review.headline, /Keep the current split/);
  });

  it("recommends a schedule adjustment after repeated misses", () => {
    const review = buildPlanReview({
      ...base,
      consistency: consistencyOf(3, 5),
      daysSinceLastSession: 3,
    });
    assert.equal(review.recommendation, "adjust_schedule");
  });

  it("recommends conservative re-entry after a long break", () => {
    const review = buildPlanReview({
      ...base,
      consistency: consistencyOf(4, 0),
      daysSinceLastSession: 20,
    });
    assert.equal(review.recommendation, "conservative_reentry");
  });

  it("recommends substituting a movement paused for pain, without changing the plan", () => {
    const review = buildPlanReview({
      ...base,
      consistency: consistencyOf(4, 0),
      daysSinceLastSession: 2,
      decisions: [
        {
          exerciseSlug: "bench_press",
          action: "stop_pain",
          rationale: "",
          createdAt: "2026-09-20T10:00:00.000Z",
        },
      ],
    });
    assert.equal(review.recommendation, "substitute_movement");
    assert.match(review.reasons.join(" "), /swap/);
  });

  it("asks for evidence instead of regenerating for novelty", () => {
    const review = buildPlanReview({
      ...base,
      consistency: consistencyOf(0, 0),
      daysSinceLastSession: null,
    });
    assert.equal(review.recommendation, "collect_more_evidence");
  });

  it("counts progression outcomes across the block", () => {
    const review = buildPlanReview({
      ...base,
      consistency: consistencyOf(6, 0),
      daysSinceLastSession: 1,
      decisions: [
        { exerciseSlug: "squat", action: "increase", rationale: "", createdAt: "" },
        { exerciseSlug: "bench_press", action: "hold", rationale: "", createdAt: "" },
        { exerciseSlug: "leg_curl", action: "reduce", rationale: "", createdAt: "" },
      ],
    });
    assert.equal(review.increases, 1);
    assert.equal(review.holds, 1);
    assert.equal(review.reductions, 1);
  });
});

describe("progress surface wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("is reachable from Train (not a bottom-navigation destination)", () => {
    const train = read("src/app/views/WorkoutView.tsx");
    assert.match(train, /import \{ TrainingProgress \}/);
    assert.match(train, /<TrainingProgress/);
    assert.match(train, /data-testid=\{`train-tab-\$\{t\.id\}`\}/);
    assert.match(train, /\{ id: "progress", label: "Progress"/);
    const bottomNav = read("src/app/components/Navigation.tsx");
    assert.ok(!/progress/i.test(bottomNav), "Progress must not become a primary nav tab");
  });

  it("feeds the surface only real server data", () => {
    const train = read("src/app/views/WorkoutView.tsx");
    for (const prop of [
      "muscleRows={training.muscleRows}",
      "decisions={training.decisions}",
      "strengthRecords={training.strengthRecords}",
      "loadExerciseHistory={training.loadExerciseHistory}",
      "serverPlan={training.serverPlan}",
    ]) {
      assert.ok(train.includes(prop), `Train must pass ${prop}`);
    }
    const component = read("src/app/components/TrainingProgress.tsx");
    assert.ok(!/% recovered/i.test(component), "never claims a recovery percentage");
    assert.ok(!/muscle gained|fat loss|tonnage/i.test(component), "never claims body change");
  });

  it("exposes warm-up classification and a load convention on every exercise", () => {
    const strength = read("src/app/lib/strength.ts");
    assert.match(strength, /is_warmup: set\.isWarmup === true/);
    const client = read("src/app/lib/trainingClient.ts");
    assert.match(client, /loadConvention: loadConventionForSlug\(e\.slug, e\.loadType\)/);
  });
});

describe("recommendation history", () => {
  it("maps actions to readable text instead of raw codes", () => {
    const decision = {
      exerciseSlug: "bench_press",
      action: "increase" as const,
      rationale: "Two comparable sessions reached the top of the prescribed rep range.",
      createdAt: "2026-09-20T10:00:00.000Z",
    };
    assert.match(decisionHeadline(decision, "Bench Press"), /Bench Press — target increased/);
    assert.match(decisionReason(decision), /Two comparable sessions/);
    // Falls back to a readable sentence when the stored rationale is empty.
    assert.match(
      decisionReason({ ...decision, action: "stop_pain", rationale: "" }),
      /Pain was reported/,
    );
    assert.equal(
      decisionHeadline({ ...decision, exerciseSlug: "leg_curl" }, null),
      "Leg Curl — target increased",
    );
  });
});
