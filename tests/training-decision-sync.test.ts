/**
 * Automated Training — training decision synchronization.
 *
 * After a canonical workout save, the pure engine judges the exercise's REAL
 * completed history (fetched through the injected caller, never invented) and
 * the resulting decision is written to the server audit trail.
 *
 * Invariants under test:
 *   - evidence only ever comes from stored history, warm-ups stay flagged and
 *     effort/technique values are passed through — never fabricated;
 *   - no path may throw back into the already-saved workout: a failed history
 *     read skips, a failed audit write is counted, an unexpected throw is
 *     contained;
 *   - without a canonical activity id nothing is recorded at all.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evidenceFromHistory,
  syncTrainingDecisions,
  type DecisionSyncExercise,
} from "../src/app/lib/trainingDecisionSync";
import { TRAINING_POLICY_VERSION } from "../src/app/lib/trainingPolicy";
import type { PrescribedTarget, ProgressionAction } from "../src/app/lib/trainingProgression";
import type { TrainingRpcCaller } from "../src/app/lib/trainingClient";
import type { ExerciseHistory } from "../src/app/lib/strength";

type StrengthCall = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const NOW = new Date("2026-09-22T12:00:00.000Z");

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

/** The raw server envelope `svj_get_exercise_history` returns. */
const historyEnvelope = (sessions: Record<string, unknown>[]) => ({
  ok: true,
  exercise: {
    id: "ex-bench",
    name: "Bench Press",
    category: "chest",
    primary_muscle: "chest",
    secondary_muscles: ["triceps"],
    exercise_type: "weighted_reps",
    is_custom: false,
    load_convention: "barbell_total",
  },
  records: [],
  sessions,
});

const workingSession = (over: Record<string, unknown> = {}) => ({
  activity_id: "act-recent",
  performed_at: "2026-09-20T10:00:00.000Z",
  set_count: 4,
  total_reps: 45,
  volume_kg: 2200,
  best_weight: 60,
  best_reps: 10,
  totals_seconds: 0,
  perceived_effort: 8,
  sets: [
    { set_number: 1, reps: 15, weight_kg: 40, duration_seconds: null, is_warmup: true },
    { set_number: 2, reps: 10, weight_kg: 60, duration_seconds: null, is_warmup: false },
    { set_number: 3, reps: 10, weight_kg: 60, duration_seconds: null, is_warmup: false },
    { set_number: 4, reps: 10, weight_kg: 60, duration_seconds: null, is_warmup: false },
  ],
  ...over,
});

function strengthReturning(data: unknown, error: { message: string } | null = null): StrengthCall {
  return async (fn) => {
    assert.equal(fn, "svj_get_exercise_history", "history is the only strength read here");
    return { data, error };
  };
}

function recordingTrainingClient(
  respond: (
    fn: string,
    args: Record<string, unknown>,
  ) => { data: unknown; error: { message: string } | null } = () => ({
    data: { ok: true },
    error: null,
  }),
): { client: TrainingRpcCaller; calls: { fn: string; args: Record<string, unknown> }[] } {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: TrainingRpcCaller = async (fn, args = {}) => {
    calls.push({ fn, args });
    return respond(fn, args);
  };
  return { client, calls };
}

const exercise = (id: string): DecisionSyncExercise => ({ target: target(), exerciseId: id });

describe("evidenceFromHistory", () => {
  // The NORMALIZED history shape `getExerciseHistory` hands to the sync — the
  // raw envelope above is what the server returns; this is what survives the
  // client normalizer.
  const normalizedHistory = (): ExerciseHistory => ({
    exercise: {
      id: "ex-bench",
      name: "Bench Press",
      slug: "bench_press",
      category: "chest",
      primaryMuscle: "chest",
      secondaryMuscles: ["triceps"],
      exerciseType: "weighted_reps",
      isCustom: false,
      loadConvention: "barbell_total",
    },
    records: [],
    sessions: [
      {
        activityId: "act-recent",
        performedAt: "2026-09-20T10:00:00.000Z",
        setCount: 4,
        totalReps: 45,
        volumeKg: 2200,
        bestWeight: 60,
        bestReps: 10,
        totalSeconds: 0,
        perceivedEffort: 8,
        sets: [
          { setNumber: 1, reps: 15, weightKg: 40, durationSeconds: null, isWarmup: true },
          { setNumber: 2, reps: 10, weightKg: 60, durationSeconds: null, isWarmup: false },
          { setNumber: 3, reps: 10, weightKg: 60, durationSeconds: null, isWarmup: false },
          { setNumber: 4, reps: 10, weightKg: 60, durationSeconds: null, isWarmup: false },
        ],
      },
      {
        activityId: "act-draft",
        performedAt: "",
        setCount: 0,
        totalReps: 0,
        volumeKg: 0,
        bestWeight: null,
        bestReps: null,
        totalSeconds: 0,
        perceivedEffort: null,
        sets: [],
      },
    ],
  });

  it("keeps warm-ups flagged, set order intact and never invents effort", () => {
    const evidence = evidenceFromHistory(normalizedHistory(), target());
    assert.equal(
      evidence.length,
      1,
      "sessions without a performed timestamp are drafts, not evidence",
    );
    const session = evidence[0];
    assert.equal(session.activityId, "act-recent");
    assert.equal(session.perceivedEffort, 8, "the stored session effort is passed through");
    assert.deepEqual(
      session.sets.map((s) => s.isWarmup),
      [true, false, false, false],
      "warm-up rows stay classified so they never count as working evidence",
    );
    assert.deepEqual(
      session.sets.map((s) => s.setNumber),
      [1, 2, 3, 4],
    );
    for (const set of session.sets) {
      assert.equal(set.rir, null, "RIR is never invented — the logger does not collect it");
      assert.equal(set.pain, null, "pain is never invented");
      assert.equal(set.skipped, false);
    }
    assert.equal(session.controlledTechnique, null);
  });
});

describe("syncTrainingDecisions", () => {
  it("records one audit decision per prescription, anchored to the activity", async () => {
    const { client, calls } = recordingTrainingClient();
    const result = await syncTrainingDecisions({
      trainingClient: client,
      strengthCall: strengthReturning(historyEnvelope([workingSession()])),
      exercises: [exercise("ex-bench")],
      activityId: "act-sync-1",
      policyVersion: TRAINING_POLICY_VERSION,
      now: NOW,
    });

    assert.deepEqual(result, { recorded: 1, skipped: 0, failed: 0 });
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.fn, "svj_record_training_decision");
    const payload = call.args.p_payload as Record<string, unknown>;
    assert.equal(payload.exercise_slug, "bench_press");
    assert.equal(payload.policy_version, TRAINING_POLICY_VERSION);
    assert.equal(
      payload.activity_id,
      "act-sync-1",
      "the unique evidence key is the saved activity",
    );
    assert.ok(
      (
        ["hold", "increase", "reduce", "reentry", "stop_pain", "new_baseline", "none"] as const
      ).includes(payload.action as ProgressionAction),
    );
    assert.ok(String(payload.rationale).length > 0, "every decision explains itself");
    const inner = payload.payload as { evidence?: { comparableSessions?: number } };
    assert.equal(
      inner.evidence?.comparableSessions,
      1,
      "the evidence count comes from the stored history that was read",
    );
    assert.ok(
      !("user_id" in payload) && !("userId" in payload),
      "identity is never sent by the client",
    );
  });

  it("skips — never throws — when the history read fails", async () => {
    const { client, calls } = recordingTrainingClient();
    const result = await syncTrainingDecisions({
      trainingClient: client,
      strengthCall: strengthReturning(null, { message: "boom" }),
      exercises: [exercise("ex-bench")],
      activityId: "act-sync-1",
      policyVersion: TRAINING_POLICY_VERSION,
      now: NOW,
    });
    assert.deepEqual(result, { recorded: 0, skipped: 1, failed: 0 });
    assert.equal(calls.length, 0, "no audit write is attempted without real evidence");
  });

  it("skips when the server has no sessions for the movement", async () => {
    const { client, calls } = recordingTrainingClient();
    const result = await syncTrainingDecisions({
      trainingClient: client,
      strengthCall: strengthReturning(historyEnvelope([workingSession({ performed_at: "" })])),
      exercises: [exercise("ex-bench")],
      activityId: "act-sync-1",
      policyVersion: TRAINING_POLICY_VERSION,
      now: NOW,
    });
    assert.deepEqual(result, { recorded: 0, skipped: 1, failed: 0 });
    assert.equal(calls.length, 0);
  });

  it("counts a rejected audit write as failed and keeps the workout intact", async () => {
    const { client } = recordingTrainingClient(() => ({
      data: { ok: false },
      error: null,
    }));
    const result = await syncTrainingDecisions({
      trainingClient: client,
      strengthCall: strengthReturning(historyEnvelope([workingSession()])),
      exercises: [exercise("ex-bench")],
      activityId: "act-sync-1",
      policyVersion: TRAINING_POLICY_VERSION,
      now: NOW,
    });
    assert.deepEqual(result, { recorded: 0, skipped: 0, failed: 1 });
  });

  it("contains an unexpected throw from the audit trail", async () => {
    const client: TrainingRpcCaller = async () => {
      throw new Error("offline");
    };
    const result = await syncTrainingDecisions({
      trainingClient: client,
      strengthCall: strengthReturning(historyEnvelope([workingSession()])),
      exercises: [exercise("ex-bench")],
      activityId: "act-sync-1",
      policyVersion: TRAINING_POLICY_VERSION,
      now: NOW,
    });
    assert.deepEqual(result, { recorded: 0, skipped: 0, failed: 1 });
  });

  it("records nothing when the workout was not saved canonically", async () => {
    let strengthReads = 0;
    const { client, calls } = recordingTrainingClient();
    const result = await syncTrainingDecisions({
      trainingClient: client,
      strengthCall: async (fn) => {
        strengthReads += 1;
        return strengthReturning(historyEnvelope([workingSession()]))(fn);
      },
      exercises: [exercise("ex-bench")],
      activityId: null,
      policyVersion: TRAINING_POLICY_VERSION,
      now: NOW,
    });
    assert.deepEqual(result, { recorded: 0, skipped: 0, failed: 0 });
    assert.equal(strengthReads, 0);
    assert.equal(calls.length, 0);
  });

  it("records nothing for an empty prescription list", async () => {
    const { client, calls } = recordingTrainingClient();
    const result = await syncTrainingDecisions({
      trainingClient: client,
      strengthCall: strengthReturning(historyEnvelope([workingSession()])),
      exercises: [],
      activityId: "act-sync-1",
      policyVersion: TRAINING_POLICY_VERSION,
      now: NOW,
    });
    assert.deepEqual(result, { recorded: 0, skipped: 0, failed: 0 });
    assert.equal(calls.length, 0);
  });
});
