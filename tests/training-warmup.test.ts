/**
 * Automated Training — warm-up client behaviour.
 *
 * Warm-up sets stay visible in the logger and in history, but never count
 * toward working muscle volume, personal records or progression evidence.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStrengthPayload,
  computeMuscleSummary,
  createExerciseDraft,
  createSetDraft,
  normalizeStrengthDetail,
  type StrengthExerciseDraft,
} from "../src/app/lib/strength";

const option = {
  id: "ex-bench",
  name: "Bench Press",
  slug: "bench_press",
  category: "chest",
  primaryMuscle: "chest" as const,
  secondaryMuscles: ["triceps" as const],
  exerciseType: "weighted_reps" as const,
  isCustom: false,
};

const draft = (sets: Partial<StrengthExerciseDraft["sets"][number]>[]): StrengthExerciseDraft => {
  const base = createExerciseDraft(option);
  return {
    ...base,
    sets: sets.map((patch) => ({ ...createSetDraft(), ...patch })),
  };
};

describe("warm-up sets", () => {
  it("a newly added set is never silently a warm-up", () => {
    assert.equal(createSetDraft().isWarmup, false);
    assert.equal(createSetDraft(createSetDraft()).isWarmup, false);
  });

  it("sends is_warmup to the canonical save payload and omits nothing else", () => {
    const payload = buildStrengthPayload([
      draft([
        { reps: 15, weightKg: 40, isWarmup: true },
        { reps: 10, weightKg: 60 },
      ]),
    ]);
    assert.deepEqual(
      payload[0].sets.map((s) => s.is_warmup),
      [true, false],
    );
    assert.deepEqual(
      payload[0].sets.map((s) => s.weight_kg),
      [40, 60],
    );
  });

  it("excludes warm-up sets from working muscle volume", () => {
    const muscles = computeMuscleSummary([
      draft([
        { reps: 20, weightKg: 20, isWarmup: true },
        { reps: 10, weightKg: 60 },
        { reps: 10, weightKg: 60 },
      ]),
    ]);
    const chest = muscles.find((m) => m.muscle === "chest");
    const triceps = muscles.find((m) => m.muscle === "triceps");
    assert.equal(chest?.score, 2, "two working sets, not three");
    assert.equal(triceps?.score, 1, "secondary work is 0.5 × two working sets");
  });

  it("still previews volume for a warm-up-only session without claiming working load", () => {
    // The logger's summary is honest: it shows zero working muscle volume.
    assert.deepEqual(
      computeMuscleSummary([draft([{ reps: 20, weightKg: 20, isWarmup: true }])]),
      [],
    );
  });

  it("reads is_warmup back from server detail (unknown history defaults to working)", () => {
    const detail = normalizeStrengthDetail({
      ok: true,
      activity_id: "act-1",
      summary: { exercise_count: 1, set_count: 2, total_reps: 25, volume_kg: 1000, muscles: [] },
      exercises: [
        {
          exercise_id: "ex-bench",
          name: "Bench Press",
          exercise_type: "weighted_reps",
          primary_muscle: "chest",
          position: 0,
          sets: [
            { set_number: 1, reps: 15, weight_kg: 40, duration_seconds: null, is_warmup: true },
            { set_number: 2, reps: 10, weight_kg: 60, duration_seconds: null },
          ],
        },
      ],
    });
    assert.ok(detail);
    assert.deepEqual(
      detail.exercises[0].sets.map((s) => s.isWarmup),
      [true, false],
    );
  });
});
