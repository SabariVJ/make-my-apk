// ============================================================================
// SVJ Automated Training — progression decision recording.
//
// After a workout is saved, the pure engine (decideProgression) judges the
// exercise's REAL completed history — fetched from the server, never invented
// locally — and the resulting decision is written to the server audit trail
// (svj_record_training_decision, unique per user + exercise + activity).
//
// This runs fire-and-forget: a failure to record a decision never affects the
// already-canonical workout, and a replay is idempotent thanks to the server's
// unique evidence key. No notification, streak or attendance value is ever
// treated as workout evidence.
// ============================================================================

import { getExerciseHistory, type ExerciseHistory } from "./strength";
import { recordTrainingDecision, type TrainingRpcCaller } from "./trainingClient";
import { decideProgression, type PrescribedTarget, type SessionEvidence } from "./trainingProgression";

type StrengthCall = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export interface DecisionSyncExercise {
  target: PrescribedTarget;
  /** Catalog exercise id — the server history is keyed by it. */
  exerciseId: string;
}

export interface DecisionSyncInput {
  trainingClient: TrainingRpcCaller;
  strengthCall: StrengthCall;
  exercises: DecisionSyncExercise[];
  /** Canonical activity this judgement is anchored to (evidence key). */
  activityId: string | null;
  policyVersion: string;
  now?: Date;
}

export interface DecisionSyncResult {
  recorded: number;
  skipped: number;
  failed: number;
}

/**
 * Map stored history sessions to progression evidence. The prescription used
 * for comparability is the CURRENT target for the same exercise — identity
 * (slug/convention/equipment) is a property of the movement; the set data,
 * effort and timestamps all come from the server.
 */
export function evidenceFromHistory(
  history: ExerciseHistory,
  target: PrescribedTarget,
): SessionEvidence[] {
  return history.sessions
    .filter((session) => Boolean(session.performedAt))
    .map((session) => ({
      activityId: session.activityId,
      performedAt: session.performedAt,
      target,
      sets: session.sets.map((set, index) => ({
        setNumber: set.setNumber || index + 1,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSeconds: set.durationSeconds,
        isWarmup: set.isWarmup === true,
        rir: null,
        pain: null,
        skipped: false,
      })),
      controlledTechnique: null,
      perceivedEffort: session.perceivedEffort ?? null,
    }));
}

/**
 * Record one progression decision per exercised prescription. Never throws —
 * a missing history or a failed write leaves the workout untouched.
 */
export async function syncTrainingDecisions(
  input: DecisionSyncInput,
): Promise<DecisionSyncResult> {
  const result: DecisionSyncResult = { recorded: 0, skipped: 0, failed: 0 };
  if (input.exercises.length === 0 || !input.activityId) return result;
  const now = input.now ?? new Date();

  for (const exercise of input.exercises) {
    try {
      const history = await getExerciseHistory(input.strengthCall, exercise.exerciseId, 30);
      if (!history.ok || !history.history) {
        result.skipped += 1;
        continue;
      }
      const evidence = evidenceFromHistory(history.history, exercise.target);
      if (evidence.length === 0) {
        result.skipped += 1;
        continue;
      }
      const decision = decideProgression(exercise.target, evidence, now);
      const recorded = await recordTrainingDecision(input.trainingClient, {
        exerciseSlug: exercise.target.exerciseSlug,
        action: decision.action,
        rationale: decision.rationale,
        payload: {
          currentLoadKg: decision.currentLoadKg,
          suggestedLoadKg: decision.suggestedLoadKg,
          suggestedReps: decision.suggestedReps,
          suggestedSets: decision.suggestedSets,
          suggestedDurationSeconds: decision.suggestedDurationSeconds,
          evidence: decision.evidence,
        },
        policyVersion: decision.policyVersion,
        activityId: input.activityId,
      });
      if (recorded.ok) result.recorded += 1;
      else result.failed += 1;
    } catch {
      // Fire-and-forget: never propagate into the saved workout flow.
      result.failed += 1;
    }
  }
  return result;
}
