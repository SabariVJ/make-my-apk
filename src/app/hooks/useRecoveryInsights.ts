// ============================================================================
// SVJ Recovery V2 — Phase 3 data layer (founder Overview widgets).
//
// Loads ONLY the three extra inputs Today's Focus and the Muscle Recovery Map
// need — svj_list_goals, svj_get_my_training_profile, svj_recent_muscle_history
// — deliberately NOT mounting useTrainingPlan(), which fetches seven unrelated
// RPCs. Readiness/history stay with Recovery's existing loading; nothing here
// duplicates those queries.
//
// Identity is always auth.uid() on the server; this layer only reads. An
// unavailable svj_recent_muscle_history (its migration chain is not deployed to
// production yet) degrades to an honest unavailable state and blocks nothing
// else — the same defensive pattern the training/recovery clients use.
// ============================================================================
import { useEffect, useState } from "react";
import { sanitizeTrainingRpcError } from "../lib/trainingErrors";
import {
  trainingRpcClient,
  getTrainingProfile,
  recentMuscleHistory,
  type MuscleHistoryRow,
} from "../lib/trainingClient";
import { normalizeTrainingProfile, type TrainingProfile } from "../lib/trainingProfile";
import { listGoals, type GoalDto } from "../lib/goalsRecords";

export type MuscleDataAvailability = "loading" | "ready" | "unavailable" | "error";

export interface RecoveryInsightsState {
  /** Active goals with their server-derived progress (raw rows; filter later). */
  goals: GoalDto[];
  /** Server training profile when one exists, else the neutral default. */
  trainingProfile: TrainingProfile;
  muscleRows: MuscleHistoryRow[];
  muscleAvailability: MuscleDataAvailability;
  loading: boolean;
  /** Reload everything (pull-to-refresh / retry). */
  reload: () => void;
}

const emptyProfile = normalizeTrainingProfile(null);

export function useRecoveryInsights(): RecoveryInsightsState {
  const [goals, setGoals] = useState<GoalDto[]>([]);
  const [trainingProfile, setTrainingProfile] = useState<TrainingProfile>(emptyProfile);
  const [muscleRows, setMuscleRows] = useState<MuscleHistoryRow[]>([]);
  const [muscleAvailability, setMuscleAvailability] = useState<MuscleDataAvailability>("loading");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const rpc = trainingRpcClient();
      if (!rpc) {
        if (!mounted) return;
        setGoals([]);
        setTrainingProfile(emptyProfile);
        setMuscleRows([]);
        setMuscleAvailability("error");
        setLoading(false);
        return;
      }

      const [goalResult, profileResult, muscleResult] = await Promise.all([
        listGoals((fn, args) => rpc(fn, args), false),
        getTrainingProfile(rpc),
        recentMuscleHistory(rpc, 7),
      ]);
      if (!mounted) return;

      setGoals(goalResult.ok ? goalResult.goals : []);
      if (profileResult.ok) {
        setTrainingProfile(
          profileResult.profile ? normalizeTrainingProfile(profileResult.profile) : emptyProfile,
        );
      }

      if (muscleResult.ok) {
        setMuscleRows(muscleResult.rows);
        setMuscleAvailability("ready");
      } else {
        // Distinguish "this deployment doesn't have the RPC yet" (PGRST202 /
        // 42883 / 42P01) from a transient failure, without showing raw
        // PostgREST text anywhere.
        const { meta } = sanitizeTrainingRpcError(muscleResult.error);
        setMuscleRows([]);
        setMuscleAvailability(meta.deploymentProblem ? "unavailable" : "error");
        if (meta.deploymentProblem) {
          console.warn("[SVJ recovery] svj_recent_muscle_history is not deployed", {
            code: meta.code,
          });
        }
      }

      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [attempt]);

  return {
    goals,
    trainingProfile,
    muscleRows,
    muscleAvailability,
    loading,
    reload: () => setAttempt((n) => n + 1),
  };
}
