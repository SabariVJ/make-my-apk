import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveStrengthActivity, type StrengthSaveOutcome } from "../lib/strength";
import { strengthRpcClient } from "../lib/strengthClient";
import { recordTrainingContext, trainingRpcClient } from "../lib/trainingClient";
import { syncTrainingDecisions } from "../lib/trainingDecisionSync";
import { TRAINING_POLICY_VERSION } from "../lib/trainingPolicy";
import { processActivityRewards, rewardsRpcClient } from "../lib/rewards";
import {
  dequeueWorkout,
  enqueueWorkout,
  markWorkoutAttempt,
  pendingWorkoutsFor,
  readWorkoutQueue,
  writeWorkoutQueue,
  type QueuedWorkout,
} from "../lib/workoutQueue";

export type QueuedWorkoutInput = Omit<
  QueuedWorkout,
  "version" | "userId" | "status" | "attempts" | "lastAttemptAt" | "lastError" | "createdAt"
>;

export interface WorkoutQueueApi {
  pending: QueuedWorkout[];
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
  /** Queue a workout that failed to reach the server. Scoped to this account. */
  enqueueNow: (input: QueuedWorkoutInput) => void;
  /** Replay every pending workout for the signed-in account. */
  sync: () => Promise<{ synced: number; failed: number }>;
  /** Drop one queued workout the user no longer wants to upload. */
  discard: (clientSessionId: string) => void;
  refresh: () => void;
}

/**
 * The authenticated account id, read straight from the Supabase session so the
 * queue can be scoped without depending on any app-level provider. Changing
 * accounts changes this value, which is exactly what isolates queued workouts.
 */
export function useAuthUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    // The auth client is absent in an unconfigured build; the queue then simply
    // stays empty rather than throwing.
    const auth = supabase?.auth;
    if (!auth) return;
    void auth
      .getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user?.id ?? null);
      })
      .catch(() => {
        if (active) setUserId(null);
      });
    const { data: subscription } = auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);
  return userId;
}

/**
 * Drains the account-scoped offline workout queue. The queue is keyed by the
 * signed-in user id, so a workout logged by account A is never uploaded while
 * account B is signed in — it simply stays under A's key until A returns.
 */
export function useWorkoutQueue(): WorkoutQueueApi {
  const userId = useAuthUserId();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<QueuedWorkout[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const refresh = useCallback(() => {
    setPending(userId ? pendingWorkoutsFor(readWorkoutQueue(userId), userId) : []);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enqueueNow = useCallback(
    (input: QueuedWorkoutInput) => {
      if (!userId) return;
      const queue = readWorkoutQueue(userId);
      const next = enqueueWorkout(queue, {
        ...input,
        version: 1,
        userId,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
      });
      writeWorkoutQueue(userId, next);
      setPending(pendingWorkoutsFor(next, userId));
    },
    [userId],
  );

  const discard = useCallback(
    (clientSessionId: string) => {
      if (!userId) return;
      const next = dequeueWorkout(readWorkoutQueue(userId), clientSessionId);
      writeWorkoutQueue(userId, next);
      setPending(pendingWorkoutsFor(next, userId));
    },
    [userId],
  );

  const sync = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (!userId || syncingRef.current) return { synced: 0, failed: 0 };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { synced: 0, failed: 0 };
    }
    const client = strengthRpcClient();
    if (!client) return { synced: 0, failed: 0 };

    const queued = pendingWorkoutsFor(readWorkoutQueue(userId), userId);
    if (queued.length === 0) return { synced: 0, failed: 0 };

    // Never upload under an identity we cannot prove — a signed-out state must
    // leave the queue untouched rather than posting it as someone else.
    const auth = supabase?.auth;
    if (!auth) return { synced: 0, failed: 0 };
    const { data: sessionData } = await auth.getSession();
    if (!sessionData.session?.user?.id || sessionData.session.user.id !== userId) {
      return { synced: 0, failed: 0 };
    }

    syncingRef.current = true;
    setSyncing(true);
    setLastError(null);
    let synced = 0;
    let failed = 0;

    for (const entry of queued) {
      const result: StrengthSaveOutcome = await saveStrengthActivity(
        (fn, args) => client.rpc(fn, args),
        {
          clientSessionId: entry.clientSessionId,
          startedAtMs: entry.startedAtMs,
          endedAtMs: entry.endedAtMs,
          durationSeconds: entry.durationSeconds,
          drafts: entry.drafts,
          perceivedEffort: entry.perceivedEffort,
          notes: entry.notes,
        },
      );

      if (result.ok) {
        synced += 1;
        // Link the slot (idempotent) — a failure here never loses the workout.
        const trainingClient = trainingRpcClient();
        if (
          trainingClient &&
          entry.context &&
          (entry.context.planSessionId || entry.context.templateId)
        ) {
          void recordTrainingContext(trainingClient, entry.clientSessionId, {
            ...entry.context,
            targets: entry.targets,
          });
        }
        // Progression judgement for the replayed workout — idempotent on the
        // server (unique per user + exercise + activity) and never blocking.
        if (trainingClient && entry.targets.length > 0 && result.activity) {
          const idBySlug = new Map(
            Object.entries(entry.slugByExerciseId ?? {}).map(([id, slug]) => [slug, id]),
          );
          const exercises = entry.targets
            .map((target) => {
              const exerciseId =
                idBySlug.get(target.exerciseSlug) ??
                entry.drafts.find((draft) => draft.name === target.exerciseName)?.exerciseId ??
                null;
              return exerciseId ? { target, exerciseId } : null;
            })
            .filter(
              (item): item is { target: (typeof entry.targets)[number]; exerciseId: string } =>
                item !== null,
            );
          if (exercises.length > 0) {
            void syncTrainingDecisions({
              trainingClient,
              strengthCall: (fn, args) => client.rpc(fn, args),
              exercises,
              activityId: result.activity.id,
              policyVersion: TRAINING_POLICY_VERSION,
            });
          }
        }
        if (!result.duplicate && result.activity) {
          const rewards = rewardsRpcClient();
          if (rewards) {
            const processed = await processActivityRewards(rewards, result.activity.id);
            if (processed.ok && processed.rewards) {
              if (
                processed.rewards.xpAwarded > 0 ||
                Object.keys(processed.rewards.statChanges).length > 0
              ) {
                void queryClient.invalidateQueries({ queryKey: ["user-stats"] });
              }
            }
          }
        }
        const remaining = dequeueWorkout(readWorkoutQueue(userId), entry.clientSessionId);
        writeWorkoutQueue(userId, remaining);
        setPending(pendingWorkoutsFor(remaining, userId));
        setLastSyncedAt(new Date().toISOString());
      } else {
        failed += 1;
        setLastError(result.error ?? null);
        const marked = markWorkoutAttempt(readWorkoutQueue(userId), entry.clientSessionId, {
          ok: false,
          error: result.error ?? null,
        });
        writeWorkoutQueue(userId, marked);
        setPending(pendingWorkoutsFor(marked, userId));
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    return { synced, failed };
  }, [userId, queryClient]);

  // Retry when connectivity returns.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sync]);

  // Drain on mount and keep retrying while anything is pending, so a queue
  // left behind by a crash or an offline period never waits for the next
  // manual open of the logger to reach the server.
  useEffect(() => {
    if (!userId || pending.length === 0) return;
    void sync();
    const timer = setInterval(() => {
      if (!syncingRef.current) void sync();
    }, 45_000);
    return () => clearInterval(timer);
  }, [userId, pending.length, sync]);

  return {
    pending,
    pendingCount: pending.length,
    syncing,
    lastError,
    lastSyncedAt,
    enqueueNow,
    sync,
    discard,
    refresh,
  };
}
