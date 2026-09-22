// ============================================================================
// SVJ Automated Training — progress, coverage, consistency and plan review.
//
// Pure and deterministic: every number here is derived from REAL server data
// (completed working sets, plan-session statuses, recorded decisions). Nothing
// is interpolated, invented or estimated. When the evidence is missing the
// result says so instead of drawing a line through nothing.
//
// Warm-up sets are excluded everywhere working volume is counted.
// Weight comparisons are only meaningful inside one exercise identity and one
// load convention, so the convention is carried alongside every figure.
// ============================================================================

import { MUSCLE_LABELS, type MuscleGroup } from "./strength";
import type { MuscleHistoryRow } from "./trainingClient";
import type { ServerPlanSession } from "./trainingClient";
import type { ProgressionAction } from "./trainingProgression";
import type { LoadConvention } from "./trainingProfile";

const MS_PER_DAY = 86_400_000;

// ── Exercise progress ──────────────────────────────────────────────────────

export interface ProgressSet {
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  isWarmup: boolean;
}

export interface ProgressSessionInput {
  activityId: string;
  /** ISO UTC timestamp the session ended. */
  performedAt: string;
  /** Local calendar day, so a workout crossing midnight lands on the right day. */
  localDate: string;
  sets: ProgressSet[];
  /** Equipment/convention the sets were logged with, when known. */
  loadConvention?: LoadConvention | null;
}

export interface ExerciseProgressPoint {
  activityId: string;
  localDate: string;
  performedAt: string;
  workingSetCount: number;
  warmupSetCount: number;
  /** Heaviest working set in kg (null when the exercise carries no external load). */
  topWeightKg: number | null;
  /** Best working-set reps (null for timed work). */
  topReps: number | null;
  /** Longest working hold in seconds (timed work only). */
  topSeconds: number | null;
  /** Weight × reps across working sets only. 0 when bodyweight/untracked. */
  volumeKg: number;
}

export type ProgressTrend = "improving" | "steadier" | "declining" | "insufficient_data";

export interface ExerciseProgress {
  exerciseId: string;
  exerciseName: string;
  loadConvention: LoadConvention | null;
  /** Sessions that contain at least one completed working set. */
  sessionCount: number;
  workingSetCount: number;
  warmupSetCount: number;
  bestWeightKg: number | null;
  bestReps: number | null;
  bestHoldSeconds: number | null;
  totalVolumeKg: number;
  /** Chronological (oldest first) so charts read left-to-right. */
  points: ExerciseProgressPoint[];
  trend: ProgressTrend;
  trendBasis: "weight" | "reps" | "duration" | "none";
  /** True when every point shares one convention — never compare across these. */
  conventionConsistent: boolean;
  /**
   * Sessions before the user started classifying warm-ups. They are shown but
   * never used for automatic progression.
   */
  unclassifiedHistoricalSessions: number;
}

function workingSetsOf(session: ProgressSessionInput): ProgressSet[] {
  return session.sets.filter((set) => set.isWarmup !== true);
}

function isCompletedWorkingSet(set: ProgressSet): boolean {
  if (set.durationSeconds !== null) return set.durationSeconds > 0;
  return (set.reps ?? 0) > 0;
}

export function buildExerciseProgress(input: {
  exerciseId: string;
  exerciseName: string;
  loadConvention?: LoadConvention | null;
  sessions: ProgressSessionInput[];
  /** Mirror of the personal-record values the server owns, for display only. */
  records?: { heaviestWeightKg?: number | null; bestSetReps?: number | null };
}): ExerciseProgress {
  const working = input.sessions
    .map((session) => ({ session, sets: workingSetsOf(session) }))
    .filter(({ sets }) => sets.some(isCompletedWorkingSet))
    .sort((a, b) => a.session.performedAt.localeCompare(b.session.performedAt));

  const points: ExerciseProgressPoint[] = working.map(({ session, sets }) => {
    const done = sets.filter(isCompletedWorkingSet);
    const weights = done.map((s) => s.weightKg).filter((w): w is number => w !== null && w > 0);
    const reps = done.map((s) => s.reps).filter((r): r is number => r !== null && r > 0);
    const seconds = done
      .map((s) => s.durationSeconds)
      .filter((s): s is number => s !== null && s > 0);
    const volume = done.reduce((total, set) => {
      if (set.weightKg === null || set.reps === null) return total;
      if (set.weightKg <= 0 || set.reps <= 0) return total;
      return total + set.weightKg * set.reps;
    }, 0);
    return {
      activityId: session.activityId,
      localDate: session.localDate,
      performedAt: session.performedAt,
      workingSetCount: done.length,
      warmupSetCount: session.sets.length - sets.length,
      topWeightKg: weights.length > 0 ? Math.max(...weights) : null,
      topReps: reps.length > 0 ? Math.max(...reps) : null,
      topSeconds: seconds.length > 0 ? Math.max(...seconds) : null,
      volumeKg: Math.round(volume * 100) / 100,
    };
  });

  // Trend basis: external load when it exists, otherwise reps, otherwise time.
  const hasWeight = points.some((p) => p.topWeightKg !== null);
  const hasReps = points.some((p) => p.topReps !== null);
  const basis: ExerciseProgress["trendBasis"] = hasWeight
    ? "weight"
    : hasReps
      ? "reps"
      : points.some((p) => p.topSeconds !== null)
        ? "duration"
        : "none";
  const value = (p: ExerciseProgressPoint): number | null =>
    basis === "weight"
      ? p.topWeightKg
      : basis === "reps"
        ? p.topReps
        : basis === "duration"
          ? p.topSeconds
          : null;

  const conventions = new Set(
    input.sessions.map((s) => s.loadConvention ?? input.loadConvention ?? "unknown"),
  );

  const bestWeightKg = points.reduce<number | null>(
    (best, p) =>
      p.topWeightKg !== null && (best === null || p.topWeightKg > best) ? p.topWeightKg : best,
    input.records?.heaviestWeightKg ?? null,
  );
  const bestReps = points.reduce<number | null>(
    (best, p) => (p.topReps !== null && (best === null || p.topReps > best) ? p.topReps : best),
    input.records?.bestSetReps ?? null,
  );
  const bestHoldSeconds = points.reduce<number | null>(
    (best, p) =>
      p.topSeconds !== null && (best === null || p.topSeconds > best) ? p.topSeconds : best,
    null,
  );
  const totalVolumeKg = Math.round(points.reduce((total, p) => total + p.volumeKg, 0) * 100) / 100;

  return {
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    loadConvention: input.loadConvention ?? null,
    sessionCount: points.length,
    workingSetCount: points.reduce((total, p) => total + p.workingSetCount, 0),
    warmupSetCount: points.reduce((total, p) => total + p.warmupSetCount, 0),
    bestWeightKg,
    bestReps,
    bestHoldSeconds,
    totalVolumeKg,
    points,
    trend: computeTrend(points.map(value)),
    trendBasis: basis,
    conventionConsistent: conventions.size <= 1,
    unclassifiedHistoricalSessions: 0,
  };
}

/**
 * Compare the mean of the most recent three observations with the three before
 * them. Fewer than four observations can never claim a trend.
 */
export function computeTrend(values: (number | null)[]): ProgressTrend {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length < 4) return "insufficient_data";
  const recent = known.slice(-3);
  const previous = known.slice(-6, -3);
  if (previous.length === 0) return "insufficient_data";
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = avg(recent) - avg(previous);
  const scale = Math.max(avg(previous), 0.0001);
  if (delta / scale > 0.02) return "improving";
  if (delta / scale < -0.02) return "declining";
  return "steadier";
}

export const TREND_LABELS: Record<ProgressTrend, string> = {
  improving: "Improving",
  steadier: "Holding steady",
  declining: "Declining",
  insufficient_data: "Not enough sessions yet",
};

// ── Weekly muscle coverage ─────────────────────────────────────────────────

export type CoverageStatus = "trained" | "not_trained" | "older_unclassified";

export interface MuscleCoverageEntry {
  muscle: MuscleGroup;
  label: string;
  lastTrainedDate: string | null;
  recencyLabel: string;
  directSets: number;
  supportingSets: number;
  /** Completed working sets involving the muscle inside the 7-day window. */
  totalSets: number;
  status: CoverageStatus;
}

/**
 * Coverage from the server's real muscle history rows. The server already
 * excludes warm-up sets; a muscle with no rows says "No logged training"
 * rather than showing a zero that implies an observed empty session.
 */
export function buildMuscleCoverage(
  rows: MuscleHistoryRow[],
  options: { now?: Date; limit?: number } = {},
): MuscleCoverageEntry[] {
  const now = options.now ?? new Date();
  return rows
    .map((row) => {
      const total = row.directSets + row.supportingSets;
      return {
        muscle: row.muscle,
        label: MUSCLE_LABELS[row.muscle] ?? row.muscle,
        lastTrainedDate: row.lastTrainedDate,
        recencyLabel: recency(row.lastTrainedDate, now),
        directSets: row.directSets,
        supportingSets: row.supportingSets,
        totalSets: total,
        status: (row.lastTrainedDate === null ? "not_trained" : "trained") as CoverageStatus,
      };
    })
    .sort((a, b) => {
      if (a.totalSets !== b.totalSets) return b.totalSets - a.totalSets;
      return (b.lastTrainedDate ?? "").localeCompare(a.lastTrainedDate ?? "");
    })
    .slice(0, options.limit ?? rows.length);
}

export function recency(date: string | null, now: Date = new Date()): string {
  if (!date) return "No logged training";
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y, (m ?? 1) - 1, d ?? 1);
  const days = Math.floor((now.getTime() - then.getTime()) / MS_PER_DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return `${Math.floor(days / 7)} weeks ago`;
}

export function coverageGaps(entries: MuscleCoverageEntry[]): MuscleCoverageEntry[] {
  return entries.filter((entry) => entry.totalSets === 0);
}

// ── Consistency (planned vs completed) ─────────────────────────────────────

export type SessionOutcome = "completed" | "missed" | "moved" | "upcoming" | "omitted";

export interface SessionOutcomeRow {
  sessionId: string;
  slotIndex: number;
  scheduledDate: string;
  status: ServerPlanSession["status"];
  outcome: SessionOutcome;
}

export interface ConsistencySummary {
  rows: SessionOutcomeRow[];
  completed: number;
  missed: number;
  moved: number;
  upcoming: number;
  omitted: number;
  /** Eligible sessions whose day has passed (completed + missed + moved). */
  eligible: number;
  /** completed ÷ eligible, or null when nothing is eligible yet. */
  attendancePercent: number | null;
  /** Deliberately separate from attendance: attendance never implies progress. */
  performanceNote: string;
}

export function buildConsistency(
  sessions: ServerPlanSession[],
  options: { today?: Date } = {},
): ConsistencySummary {
  const today = options.today ?? new Date();
  const todayIso = toLocalIsoDate(today);
  const rows: SessionOutcomeRow[] = sessions.map((session) => {
    let outcome: SessionOutcome;
    if (session.status === "completed") outcome = "completed";
    else if (session.status === "moved") outcome = "moved";
    else if (session.status === "skipped") outcome = "omitted";
    else outcome = session.scheduledDate < todayIso ? "missed" : "upcoming";
    return {
      sessionId: session.id,
      slotIndex: session.slotIndex,
      scheduledDate: session.scheduledDate,
      status: session.status,
      outcome,
    };
  });

  const count = (o: SessionOutcome) => rows.filter((r) => r.outcome === o).length;
  const completed = count("completed");
  const missed = count("missed");
  const moved = count("moved");
  const upcoming = count("upcoming");
  const omitted = count("omitted");
  const eligible = completed + missed + moved;
  return {
    rows,
    completed,
    missed,
    moved,
    upcoming,
    omitted,
    eligible,
    attendancePercent: eligible === 0 ? null : Math.round(((completed + moved) / eligible) * 100),
    performanceNote:
      completed === 0
        ? "No completed sessions yet — performance is measured from real sets."
        : "Attendance counts showing up. Progression is judged separately from the sets you actually completed.",
  };
}

// ── Recommendation history ─────────────────────────────────────────────────

export interface TrainingDecisionRecord {
  exerciseSlug: string;
  action: ProgressionAction;
  rationale: string;
  createdAt: string;
  policyVersion?: string;
}

export const DECISION_HEADLINES: Record<ProgressionAction, string> = {
  hold: "held",
  increase: "target increased",
  reduce: "target reduced",
  reentry: "re-entry prescribed",
  stop_pain: "progression paused",
  new_baseline: "new baseline",
  none: "no change",
};

/** Human headline, e.g. "Bench Press — target increased to 52.5 kg". */
export function decisionHeadline(
  decision: TrainingDecisionRecord,
  exerciseName?: string | null,
): string {
  const name = exerciseName ?? humanizeSlug(decision.exerciseSlug);
  return `${name} — ${DECISION_HEADLINES[decision.action] ?? "updated"}`;
}

export function humanizeSlug(slug: string): string {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Never surface a raw reason code: the stored rationale is already readable. */
export function decisionReason(decision: TrainingDecisionRecord): string {
  const rationale = decision.rationale?.trim();
  if (rationale) return rationale;
  switch (decision.action) {
    case "stop_pain":
      return "Pain was reported for this movement, so automatic progression is paused.";
    case "reentry":
      return "A long break was recorded, so this movement restarts conservatively.";
    case "increase":
      return "The required comparable sessions reached the top of the prescribed range.";
    case "reduce":
      return "Recent sessions stayed below the prescribed range at high effort.";
    case "new_baseline":
      return "No completed history exists yet for this movement.";
    default:
      return "More comparable evidence is needed before changing this target.";
  }
}

// ── Plan review ────────────────────────────────────────────────────────────

export type PlanReviewRecommendation =
  | "continue"
  | "adjust_schedule"
  | "substitute_movement"
  | "conservative_reentry"
  | "collect_more_evidence";

export interface PlanReview {
  /** True when the current block has reached its review boundary. */
  blockComplete: boolean;
  blockEnd: string | null;
  daysUntilReview: number | null;
  recommendation: PlanReviewRecommendation;
  headline: string;
  reasons: string[];
  planned: number;
  completed: number;
  missed: number;
  moved: number;
  holds: number;
  increases: number;
  reductions: number;
  paused: number;
}

export function buildPlanReview(input: {
  blockEnd: string | null;
  consistency: ConsistencySummary;
  decisions: TrainingDecisionRecord[];
  coverage: MuscleCoverageEntry[];
  /** Days since the most recent completed session, when any. */
  daysSinceLastSession?: number | null;
  today?: Date;
}): PlanReview {
  const today = input.today ?? new Date();
  const todayIso = toLocalIsoDate(today);
  const daysUntilReview =
    input.blockEnd === null
      ? null
      : Math.ceil(
          (new Date(`${input.blockEnd}T12:00:00`).getTime() -
            new Date(`${todayIso}T12:00:00`).getTime()) /
            MS_PER_DAY,
        );

  const count = (action: ProgressionAction) =>
    input.decisions.filter((d) => d.action === action).length;
  const holds = count("hold");
  const increases = count("increase");
  const reductions = count("reduce");
  const paused = count("stop_pain");

  const reasons: string[] = [];
  let recommendation: PlanReviewRecommendation = "continue";
  let headline = "Keep the current split";

  if (paused > 0) {
    recommendation = "substitute_movement";
    headline = "Substitute the paused movement";
    reasons.push(
      `${paused} movement${paused === 1 ? "" : "s"} paused for pain — swap ${paused === 1 ? "it" : "them"} rather than changing the whole plan.`,
    );
  }

  if (input.daysSinceLastSession !== null && input.daysSinceLastSession !== undefined) {
    if (input.daysSinceLastSession >= 14) {
      recommendation =
        recommendation === "substitute_movement" ? recommendation : "conservative_reentry";
      if (recommendation === "conservative_reentry") headline = "Re-enter conservatively";
      reasons.push(
        `${input.daysSinceLastSession} days since your last completed session — restart lighter before rebuilding.`,
      );
    } else if (input.daysSinceLastSession >= 10) {
      reasons.push(`${input.daysSinceLastSession} days since your last session — ease back in.`);
    }
  }

  const eligibility = input.consistency.eligible;
  if (recommendation === "continue" && eligibility >= 4) {
    const missRate = input.consistency.missed / eligibility;
    if (missRate >= 0.4) {
      recommendation = "adjust_schedule";
      headline = "Adjust your schedule";
      reasons.push(
        `You missed ${input.consistency.missed} of ${eligibility} eligible sessions. Fewer, more realistic training days will fit better than a plan you cannot attend.`,
      );
    }
  }

  if (eligibility === 0 && input.consistency.completed === 0) {
    recommendation = "collect_more_evidence";
    headline = "Complete a few sessions first";
    reasons.push("A block review needs completed sessions to review.");
  }

  const gaps = coverageGaps(input.coverage);
  if (recommendation === "continue" && gaps.length > 0 && eligibility >= 4) {
    reasons.push(
      `No work logged for ${gaps
        .slice(0, 3)
        .map((g) => g.label.toLowerCase())
        .join(", ")} in the last 7 days.`,
    );
  }

  if (reasons.length === 0) {
    reasons.push(
      "Attendance and coverage match the plan, so keeping the same split for another block is the right call.",
    );
  }
  reasons.push(
    increases + holds + reductions > 0
      ? `Progression: ${increases} increase${increases === 1 ? "" : "s"}, ${holds} hold${holds === 1 ? "" : "s"}${
          reductions > 0 ? `, ${reductions} reduction${reductions === 1 ? "" : "s"}` : ""
        }.`
      : "No progression decisions recorded in this block yet.",
  );

  return {
    blockComplete: daysUntilReview !== null && daysUntilReview <= 0,
    blockEnd: input.blockEnd,
    daysUntilReview,
    recommendation,
    headline,
    reasons,
    planned: eligibility + input.consistency.upcoming + input.consistency.omitted,
    completed: input.consistency.completed,
    missed: input.consistency.missed,
    moved: input.consistency.moved,
    holds,
    increases,
    reductions,
    paused,
  };
}

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
