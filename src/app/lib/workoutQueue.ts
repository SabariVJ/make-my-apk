// ============================================================================
// SVJ Automated Training — offline workout draft + retry queue.
//
// A completed workout must never disappear because the connection dropped.
// The draft is kept locally while training, and a failed canonical save is
// queued as Pending Sync and replayed with the SAME client_session_id, so the
// server's idempotency guarantees exactly ONE activity, ONE reward
// contribution, ONE template-usage increment and ONE slot finalization.
//
// Every entry is scoped to the authenticated account that created it: the
// storage key embeds the user id and an entry whose owner does not match the
// key is discarded on read. Account A's queued workout can therefore never be
// uploaded while account B is signed in.
//
// Nothing here fabricates server state: no local XP, no local personal records,
// and no "saved" claim until the server actually confirms.
// ============================================================================

import { appStorage, writeStoredJson } from "./storage";
import type { SaveResult } from "./activity";
import type { StrengthExerciseDraft } from "./strength";
import type { PrescribedTarget } from "./trainingProgression";
import type { TrainingContextInput } from "./trainingClient";

export const WORKOUT_QUEUE_VERSION = 1;
export const WORKOUT_QUEUE_KEY_PREFIX = "svj_app_state_v5_workout_queue:";
export const WORKOUT_DRAFT_KEY_PREFIX = "svj_app_state_v5_workout_draft:";

/** Bounded so a corrupt or hostile store cannot grow without limit. */
export const MAX_QUEUED_WORKOUTS = 20;

export type QueuedWorkoutStatus = "pending" | "syncing" | "failed";

export interface QueuedWorkout {
  version: number;
  /** Authenticated owner. An entry is only ever uploaded for this account. */
  userId: string;
  clientSessionId: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  drafts: StrengthExerciseDraft[];
  perceivedEffort?: number;
  notes?: string;
  /** Prescription linkage replayed with the retry (idempotent server-side). */
  context: TrainingContextInput | null;
  targets: PrescribedTarget[];
  status: QueuedWorkoutStatus;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface WorkoutDraft {
  version: number;
  userId: string;
  clientSessionId: string;
  startedAtMs: number;
  drafts: StrengthExerciseDraft[];
  context: TrainingContextInput | null;
  targets: PrescribedTarget[];
  note: string | null;
  updatedAt: string;
}

export function workoutQueueKey(userId: string): string {
  return `${WORKOUT_QUEUE_KEY_PREFIX}${userId}`;
}

export function workoutDraftKey(userId: string): string {
  return `${WORKOUT_DRAFT_KEY_PREFIX}${userId}`;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isSetDraft(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const set = value as Record<string, unknown>;
  if (typeof set.id !== "string" || set.id.length === 0) return false;
  if (set.reps !== null && !isFiniteNumber(set.reps)) return false;
  if (set.weightKg !== null && !isFiniteNumber(set.weightKg)) return false;
  if (set.durationSeconds !== null && !isFiniteNumber(set.durationSeconds)) return false;
  return true;
}

function isExerciseDraft(value: unknown): value is StrengthExerciseDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  if (typeof draft.id !== "string" || typeof draft.exerciseId !== "string") return false;
  if (!Array.isArray(draft.sets) || draft.sets.length === 0) return false;
  return draft.sets.every(isSetDraft);
}

function normalizeContext(value: unknown): TrainingContextInput | null {
  if (!value || typeof value !== "object") return null;
  const context = value as Record<string, unknown>;
  return {
    planId: typeof context.planId === "string" ? context.planId : null,
    planSessionId: typeof context.planSessionId === "string" ? context.planSessionId : null,
    templateId: typeof context.templateId === "string" ? context.templateId : null,
    templateVersion: isFiniteNumber(context.templateVersion)
      ? (context.templateVersion as number)
      : null,
  };
}

function normalizeTargets(value: unknown): PrescribedTarget[] {
  return Array.isArray(value)
    ? (value.filter((t) => t && typeof t === "object") as PrescribedTarget[])
    : [];
}

/**
 * Normalize one stored entry. Returns null when it is malformed or belongs to a
 * different account than the storage key — the entry is then dropped, never
 * uploaded under the wrong identity.
 */
export function normalizeQueuedWorkout(raw: unknown, userId: string): QueuedWorkout | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (entry.userId !== userId) return null;
  if (typeof entry.clientSessionId !== "string" || entry.clientSessionId.length < 8) return null;
  if (!isFiniteNumber(entry.startedAtMs) || !isFiniteNumber(entry.endedAtMs)) return null;
  if (entry.endedAtMs <= entry.startedAtMs) return null;
  if (!Array.isArray(entry.drafts) || entry.drafts.length === 0) return null;
  if (!entry.drafts.every(isExerciseDraft)) return null;
  const status = entry.status;
  return {
    version: WORKOUT_QUEUE_VERSION,
    userId,
    clientSessionId: entry.clientSessionId,
    startedAtMs: entry.startedAtMs,
    endedAtMs: entry.endedAtMs,
    durationSeconds: isFiniteNumber(entry.durationSeconds)
      ? entry.durationSeconds
      : Math.max(1, Math.round((entry.endedAtMs - entry.startedAtMs) / 1000)),
    drafts: entry.drafts as StrengthExerciseDraft[],
    perceivedEffort: isFiniteNumber(entry.perceivedEffort) ? entry.perceivedEffort : undefined,
    notes: typeof entry.notes === "string" ? entry.notes : undefined,
    context: normalizeContext(entry.context),
    targets: normalizeTargets(entry.targets),
    status: status === "syncing" || status === "failed" ? status : "pending",
    attempts: isFiniteNumber(entry.attempts) ? Math.max(0, Math.floor(entry.attempts)) : 0,
    lastAttemptAt: typeof entry.lastAttemptAt === "string" ? entry.lastAttemptAt : null,
    lastError: typeof entry.lastError === "string" ? entry.lastError : null,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
  };
}

export function readWorkoutQueue(userId: string | null): QueuedWorkout[] {
  if (!userId) return [];
  const stored = appStorage.getItem(workoutQueueKey(userId));
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeQueuedWorkout(entry, userId))
      .filter((entry): entry is QueuedWorkout => entry !== null)
      .slice(0, MAX_QUEUED_WORKOUTS);
  } catch {
    return [];
  }
}

export function writeWorkoutQueue(userId: string | null, entries: QueuedWorkout[]): SaveResult {
  if (!userId) return { ok: false, error: "No signed-in account." };
  return writeStoredJson(workoutQueueKey(userId), entries.slice(0, MAX_QUEUED_WORKOUTS));
}

/** Idempotent by client_session_id: re-queuing the same workout replaces it. */
export function enqueueWorkout(queue: QueuedWorkout[], entry: QueuedWorkout): QueuedWorkout[] {
  return [entry, ...queue.filter((e) => e.clientSessionId !== entry.clientSessionId)].slice(
    0,
    MAX_QUEUED_WORKOUTS,
  );
}

export function dequeueWorkout(queue: QueuedWorkout[], clientSessionId: string): QueuedWorkout[] {
  return queue.filter((entry) => entry.clientSessionId !== clientSessionId);
}

export function markWorkoutAttempt(
  queue: QueuedWorkout[],
  clientSessionId: string,
  result: { ok: boolean; error?: string | null; at?: string },
): QueuedWorkout[] {
  return queue.map((entry) =>
    entry.clientSessionId !== clientSessionId
      ? entry
      : {
          ...entry,
          status: result.ok ? "pending" : "failed",
          attempts: entry.attempts + 1,
          lastAttemptAt: result.at ?? new Date().toISOString(),
          lastError: result.ok ? null : (result.error ?? "Couldn't reach the server."),
        },
  );
}

export function pendingWorkoutsFor(queue: QueuedWorkout[], userId: string): QueuedWorkout[] {
  return queue.filter((entry) => entry.userId === userId && entry.status !== "syncing");
}

/**
 * A 4xx-style validation error will never succeed on retry; a network/timeout
 * error will. Only the latter should keep automatic retries going.
 */
export function isRetryableFailure(error: string | null | undefined): boolean {
  if (!error) return true;
  const message = error.toLowerCase();
  return (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("fetch") ||
    message.includes("offline") ||
    message.includes("failed to load") ||
    message.includes("connection") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

// ── Draft persistence ──────────────────────────────────────────────────────

export function readWorkoutDraft(userId: string | null): WorkoutDraft | null {
  if (!userId) return null;
  const stored = appStorage.getItem(workoutDraftKey(userId));
  if (!stored) return null;
  try {
    const raw = JSON.parse(stored) as Record<string, unknown>;
    if (!raw || typeof raw !== "object" || raw.userId !== userId) return null;
    if (typeof raw.clientSessionId !== "string" || raw.clientSessionId.length < 8) return null;
    if (!isFiniteNumber(raw.startedAtMs)) return null;
    if (!Array.isArray(raw.drafts) || !raw.drafts.every(isExerciseDraft)) return null;
    return {
      version: WORKOUT_QUEUE_VERSION,
      userId,
      clientSessionId: raw.clientSessionId,
      startedAtMs: raw.startedAtMs,
      drafts: raw.drafts as StrengthExerciseDraft[],
      context: normalizeContext(raw.context),
      targets: normalizeTargets(raw.targets),
      note: typeof raw.note === "string" ? raw.note : null,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeWorkoutDraft(
  userId: string | null,
  draft: Omit<WorkoutDraft, "version" | "userId" | "updatedAt">,
): SaveResult {
  if (!userId) return { ok: false, error: "No signed-in account." };
  return writeStoredJson(workoutDraftKey(userId), {
    ...draft,
    version: WORKOUT_QUEUE_VERSION,
    userId,
    updatedAt: new Date().toISOString(),
  });
}

export function clearWorkoutDraft(userId: string | null): void {
  if (!userId) return;
  appStorage.removeItem(workoutDraftKey(userId));
}
