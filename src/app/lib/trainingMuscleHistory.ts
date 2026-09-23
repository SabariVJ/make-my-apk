// ============================================================================
// SVJ Automated Training — muscle history from real completed sets.
//
// Muscle work is derived ONLY from completed working sets. It never counts:
//   * a workout title or template definition
//   * a scheduled-but-unperformed exercise
//   * an abandoned draft
//   * skipped sets
// Warm-up sets are classified separately and never inflate working volume.
//
// A muscle's membership is DIRECT when it is the exercise's primary muscle and
// SUPPORTING when it is secondary. Primary/secondary weighting is a display
// summary ONLY — it is not fatigue, hypertrophy, damage or recovery data.
// ============================================================================

import { localDayKey } from "./taskCompletions";
import { MUSCLE_COVERAGE_DAYS } from "./trainingPolicy";
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from "./strength";

export interface MuscleSetEvidence {
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  isWarmup: boolean;
  skipped: boolean;
}

export interface CompletedExerciseEvidence {
  activityId: string;
  /** ISO UTC timestamp the session ended (provenance preserved). */
  performedAt: string;
  /** Local calendar day the session belongs to (handles midnight crossings). */
  localDate: string;
  exerciseSlug: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  sets: MuscleSetEvidence[];
  /** Template/version actually performed, when there was one. */
  templateId?: string | null;
}

export type MuscleHistoryStatus = "trained" | "no_logged_training" | "older_unclassified";

export interface MuscleHistoryEntry {
  muscle: MuscleGroup;
  label: string;
  /** Local date of the most recent completed working set involving the muscle. */
  lastTrainedLocalDate: string | null;
  /** ISO UTC timestamp of that set. */
  lastTrainedAt: string | null;
  /** Completed working sets where this muscle is primary, in the coverage window. */
  directSets7d: number;
  /** Completed working sets where this muscle is a secondary mover. */
  supportingSets7d: number;
  /** Weighted volume (kg × reps) for direct work only. Never a growth claim. */
  directVolume7d: number;
  /** Warm-up sets (classification only — excluded from working counts). */
  warmupSets7d: number;
  /** Number of distinct local days with completed work in the window. */
  daysCovered7d: number;
  status: MuscleHistoryStatus;
}

export interface MuscleHistoryResult {
  entries: MuscleHistoryEntry[];
  /** Exercises present in history but missing muscle metadata. */
  unclassifiedExerciseCount: number;
  /** Total completed working sets counted across all activities. */
  workingSetCount: number;
  coverageDays: number;
}

function isCompletedWorkingSet(set: MuscleSetEvidence): boolean {
  if (set.skipped || set.isWarmup) return false;
  if (set.durationSeconds !== null) return set.durationSeconds > 0;
  return (set.reps ?? 0) > 0;
}

function setVolume(set: MuscleSetEvidence): number {
  if (set.weightKg === null || set.reps === null) return 0;
  if (set.weightKg <= 0 || set.reps <= 0) return 0;
  return set.weightKg * set.reps;
}

const emptyEntry = (muscle: MuscleGroup): MuscleHistoryEntry => ({
  muscle,
  label: MUSCLE_LABELS[muscle],
  lastTrainedLocalDate: null,
  lastTrainedAt: null,
  directSets7d: 0,
  supportingSets7d: 0,
  directVolume7d: 0,
  warmupSets7d: 0,
  daysCovered7d: 0,
  status: "no_logged_training",
});

/**
 * Build per-muscle history from completed exercise evidence.
 *
 * `unknownMetadataExercises` lets a caller tell "no logged training" apart from
 * "older sets we cannot classify" — the latter is shown honestly rather than
 * guessed.
 */
export function computeMuscleHistory(
  activities: CompletedExerciseEvidence[],
  options: {
    now?: Date;
    coverageDays?: number;
    unknownMetadataExercises?: number;
  } = {},
): MuscleHistoryResult {
  const now = options.now ?? new Date();
  const coverageDays = options.coverageDays ?? MUSCLE_COVERAGE_DAYS;
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (coverageDays - 1));
  const windowStartKey = localDayKey(windowStart);

  const entries = new Map<MuscleGroup, MuscleHistoryEntry>();
  for (const muscle of MUSCLE_GROUPS) entries.set(muscle, emptyEntry(muscle));
  const coveredDays = new Map<MuscleGroup, Set<string>>();

  let workingSetCount = 0;
  let anyLogged = false;

  for (const activity of activities) {
    const localDate = activity.localDate || localDayKey(new Date(activity.performedAt));
    const inWindow = localDate >= windowStartKey;
    for (const set of activity.sets) {
      const completed = isCompletedWorkingSet(set);
      if (!completed && !set.isWarmup) continue; // skipped/unperformed — ignore
      if (set.isWarmup) {
        if (inWindow) {
          const entry = entries.get(activity.primaryMuscle);
          if (entry) entry.warmupSets7d += 1;
        }
        continue;
      }
      workingSetCount += 1;
      anyLogged = true;

      const primary = entries.get(activity.primaryMuscle);
      if (primary) {
        if (primary.lastTrainedLocalDate === null || localDate > primary.lastTrainedLocalDate) {
          primary.lastTrainedLocalDate = localDate;
          primary.lastTrainedAt = activity.performedAt;
        }
        primary.status = "trained";
        if (inWindow) {
          primary.directSets7d += 1;
          primary.directVolume7d += setVolume(set);
          const days = coveredDays.get(activity.primaryMuscle) ?? new Set<string>();
          days.add(localDate);
          coveredDays.set(activity.primaryMuscle, days);
        }
      }

      for (const secondaryMuscle of activity.secondaryMuscles) {
        if (secondaryMuscle === activity.primaryMuscle) continue;
        const entry = entries.get(secondaryMuscle);
        if (!entry) continue;
        if (entry.lastTrainedLocalDate === null || localDate > entry.lastTrainedLocalDate) {
          entry.lastTrainedLocalDate = localDate;
          entry.lastTrainedAt = activity.performedAt;
        }
        if (entry.status !== "trained") entry.status = "trained";
        if (inWindow) {
          entry.supportingSets7d += 1;
          const days = coveredDays.get(secondaryMuscle) ?? new Set<string>();
          days.add(localDate);
          coveredDays.set(secondaryMuscle, days);
        }
      }
    }
  }

  const unknownMetadataExercises = options.unknownMetadataExercises ?? 0;

  const list = [...entries.values()].map((entry) => ({
    ...entry,
    directVolume7d: Number(entry.directVolume7d.toFixed(2)),
    daysCovered7d: coveredDays.get(entry.muscle)?.size ?? 0,
    status:
      entry.status === "trained"
        ? "trained"
        : unknownMetadataExercises > 0 && !anyLogged
          ? "older_unclassified"
          : "no_logged_training",
  })) as MuscleHistoryEntry[];

  return {
    entries: list,
    unclassifiedExerciseCount: unknownMetadataExercises,
    workingSetCount,
    coverageDays,
  };
}

/** Muscles trained most recently (for a Today surface), newest first. */
export function recentlyTrainedMuscles(
  result: MuscleHistoryResult,
  limit = 4,
): MuscleHistoryEntry[] {
  return result.entries
    .filter((entry) => entry.lastTrainedLocalDate !== null)
    .sort((a, b) => (b.lastTrainedLocalDate ?? "").localeCompare(a.lastTrainedLocalDate ?? ""))
    .slice(0, limit);
}

/**
 * Human label for a muscle's last-trained state. Never invents a date: unknown
 * history says so explicitly.
 */
export function muscleRecencyLabel(entry: MuscleHistoryEntry, now: Date = new Date()): string {
  if (entry.lastTrainedLocalDate === null) {
    return entry.status === "older_unclassified" ? "Older sets unclassified" : "No logged training";
  }
  const [y, m, d] = entry.lastTrainedLocalDate.split("-").map(Number);
  const then = new Date(y, (m ?? 1) - 1, d ?? 1);
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return `${Math.floor(days / 7)} weeks ago`;
}

/** Muscles in the window with no direct work — a coverage gap, not a warning. */
export function coverageGaps(result: MuscleHistoryResult): MuscleHistoryEntry[] {
  return result.entries.filter((entry) => entry.directSets7d === 0 && entry.supportingSets7d === 0);
}
