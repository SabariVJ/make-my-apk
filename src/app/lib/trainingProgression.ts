// ============================================================================
// SVJ Automated Training — progressive overload engine.
//
// Conservative, deterministic and explainable. It never fabricates evidence and
// never mutates a workout: given a target and that exercise's REAL completed
// history it returns a decision (hold / increase / reduce / re-entry / stop for
// pain / new baseline) that a future, unstarted session can use.
//
// Attendance alone never progresses a user. A streak never raises weight, reps
// and sets at once — one variable changes at a time.
// ============================================================================

import {
  BODYWEIGHT_REP_STEP,
  COMPARABLE_GAP_DAYS,
  DELOAD_STREAK,
  FALLBACK_INCREMENT_KG,
  INCREMENTS_KG,
  MAX_INCREASE_FRACTION,
  PROGRESSION_WINDOW_DAYS,
  QUALIFYING_SESSIONS_REQUIRED,
  RE_ENTRY_GAP_DAYS,
  TIMED_HOLD_STEP_SECONDS,
  TRAINING_POLICY_VERSION,
} from "./trainingPolicy";
import type { LoadType } from "./trainingTemplates";
import type { LoadConvention } from "./trainingProfile";

export type ProgressionAction =
  "hold" | "increase" | "reduce" | "reentry" | "stop_pain" | "new_baseline" | "none";

export const PROGRESSION_ACTION_LABELS: Record<ProgressionAction, string> = {
  hold: "Hold",
  increase: "Ready to increase",
  reduce: "Reduce",
  reentry: "Re-entry",
  stop_pain: "Paused (pain reported)",
  new_baseline: "New baseline",
  none: "No history",
};

/** The prescription a session is built from. Snapshot into evidence when saved. */
export interface PrescribedTarget {
  exerciseSlug: string;
  exerciseName: string;
  loadType: LoadType;
  loadConvention: LoadConvention;
  /** Equipment identity used for "comparable equipment" checks, e.g. "barbell". */
  equipmentKey: string;
  workSets: number;
  repMin: number;
  repMax: number;
  durationSeconds: number | null;
  /** Working load in kg (assistance amount for assisted movements). */
  loadKg: number | null;
  targetRpe: number;
}

export interface CompletedSetEvidence {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  /** True for ramp-up/warm-up sets — excluded from working-set evidence. */
  isWarmup: boolean;
  /** Reps in reserve; null when the user did not log effort. */
  rir: number | null;
  pain: boolean | null;
  skipped: boolean;
}

export interface SessionEvidence {
  activityId: string;
  /** ISO timestamp the session ended. */
  performedAt: string;
  target: PrescribedTarget;
  sets: CompletedSetEvidence[];
  /** Did the user report controlled technique? null when not asked. */
  controlledTechnique: boolean | null;
  /** Overall session effort 1–10, when logged. */
  perceivedEffort: number | null;
}

export interface ProgressionDecision {
  action: ProgressionAction;
  exerciseSlug: string;
  currentLoadKg: number | null;
  suggestedLoadKg: number | null;
  suggestedReps: { min: number; max: number } | null;
  suggestedSets: number | null;
  suggestedDurationSeconds: number | null;
  rationale: string;
  evidence: {
    comparableSessions: number;
    qualifyingSessions: number;
    windowDays: number;
    lastPerformedAt: string | null;
    gapDays: number | null;
  };
  policyVersion: string;
}

const MS_PER_DAY = 86_400_000;

function daysBetween(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / MS_PER_DAY);
}

/** Sessions inside the progression evidence window (most recent first). */
export function filterEvidenceWindow(
  history: SessionEvidence[],
  now: Date = new Date(),
  windowDays = PROGRESSION_WINDOW_DAYS,
): SessionEvidence[] {
  return history
    .filter((s) => {
      const gap = daysBetween(s.performedAt, now);
      return gap !== null && gap >= 0 && gap <= windowDays;
    })
    .sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt));
}

export function isComparableSession(session: SessionEvidence, target: PrescribedTarget): boolean {
  return (
    session.target.loadConvention === target.loadConvention &&
    session.target.equipmentKey === target.equipmentKey &&
    session.target.exerciseSlug === target.exerciseSlug
  );
}

function workingSets(session: SessionEvidence): CompletedSetEvidence[] {
  return session.sets.filter((s) => !s.isWarmup && !s.skipped);
}

function topOfRange(set: CompletedSetEvidence, target: PrescribedTarget): boolean {
  if (target.durationSeconds !== null) {
    return set.durationSeconds !== null && set.durationSeconds >= target.durationSeconds;
  }
  return set.reps !== null && set.reps >= target.repMax;
}

function belowRange(set: CompletedSetEvidence, target: PrescribedTarget): boolean {
  if (target.durationSeconds !== null) {
    return set.durationSeconds === null || set.durationSeconds < target.durationSeconds;
  }
  return set.reps === null || set.reps < target.repMin;
}

function hasPain(session: SessionEvidence): boolean {
  return session.sets.some((s) => s.pain === true) || session.controlledTechnique === false;
}

/** Effort evidence is present when RIR or perceived effort was logged. */
function hasEffortEvidence(session: SessionEvidence): boolean {
  return (
    session.sets.some((s) => !s.isWarmup && s.rir !== null) || session.perceivedEffort !== null
  );
}

/** Sessions ground out to failure are not progression evidence. */
function isGrinder(session: SessionEvidence): boolean {
  const failureSet = session.sets.some((s) => !s.isWarmup && s.rir !== null && s.rir <= 0);
  return failureSet || (session.perceivedEffort !== null && session.perceivedEffort >= 9);
}

/**
 * A session qualifies as progression evidence when: every required working set
 * reached the top of the prescribed range, no pain was reported, effort was
 * logged, and the session was not ground out to failure.
 */
export function sessionQualifies(session: SessionEvidence, target: PrescribedTarget): boolean {
  const work = workingSets(session);
  if (work.length < target.workSets) return false;
  if (!work.every((s) => topOfRange(s, target))) return false;
  if (hasPain(session)) return false;
  if (!hasEffortEvidence(session)) return false;
  if (isGrinder(session)) return false;
  return true;
}

/** Count consecutive most-recent recent sessions that missed the rep range. */
function belowRangeStreak(recent: SessionEvidence[], target: PrescribedTarget): number {
  let streak = 0;
  for (const session of recent) {
    const work = workingSets(session);
    const missed = work.some((s) => belowRange(s, target));
    if (!missed) break;
    streak += 1;
  }
  return streak;
}

function incrementFor(convention: LoadConvention): number {
  return INCREMENTS_KG[convention] ?? FALLBACK_INCREMENT_KG;
}

function suggestedDuration(target: PrescribedTarget): number {
  return (target.durationSeconds ?? 0) + TIMED_HOLD_STEP_SECONDS;
}

function holdDecision(
  target: PrescribedTarget,
  rationale: string,
  evidence: ProgressionDecision["evidence"],
  action: ProgressionAction = "hold",
  extra: Partial<ProgressionDecision> = {},
): ProgressionDecision {
  return {
    action,
    exerciseSlug: target.exerciseSlug,
    currentLoadKg: target.loadKg,
    suggestedLoadKg: null,
    suggestedReps: null,
    suggestedSets: null,
    suggestedDurationSeconds: null,
    rationale,
    evidence,
    policyVersion: TRAINING_POLICY_VERSION,
    ...extra,
  };
}

/**
 * The decision for one exercise. `history` may be in any order and include other
 * exercises; only comparable sessions matter.
 */
export function decideProgression(
  target: PrescribedTarget,
  history: SessionEvidence[],
  now: Date = new Date(),
): ProgressionDecision {
  const related = history
    .filter((s) => s.target.exerciseSlug === target.exerciseSlug)
    .sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt));

  if (related.length === 0) {
    return holdDecision(
      target,
      "No completed sets for this movement yet.",
      {
        comparableSessions: 0,
        qualifyingSessions: 0,
        windowDays: PROGRESSION_WINDOW_DAYS,
        lastPerformedAt: null,
        gapDays: null,
      },
      "new_baseline",
    );
  }

  // The most recent session is judged even if it is outside the window, so a
  // long break produces a re-entry prescription instead of a false baseline.
  const latestAny = related[0];
  const overallGap = daysBetween(latestAny.performedAt, now);

  if (hasPain(latestAny)) {
    return holdDecision(
      target,
      "Pain or uncontrolled technique was reported last session. Progression is paused for this movement — seek advice before loading it again.",
      {
        comparableSessions: related.filter((s) => isComparableSession(s, target)).length,
        qualifyingSessions: 0,
        windowDays: PROGRESSION_WINDOW_DAYS,
        lastPerformedAt: latestAny.performedAt,
        gapDays: overallGap,
      },
      "stop_pain",
    );
  }

  if (overallGap !== null && overallGap >= RE_ENTRY_GAP_DAYS) {
    return holdDecision(
      target,
      `It has been ${overallGap} days since this movement. Re-enter lighter and rebuild before progressing.`,
      {
        comparableSessions: 0,
        qualifyingSessions: 0,
        windowDays: PROGRESSION_WINDOW_DAYS,
        lastPerformedAt: latestAny.performedAt,
        gapDays: overallGap,
      },
      "reentry",
      {
        suggestedLoadKg: target.loadKg !== null ? Number((target.loadKg * 0.9).toFixed(2)) : null,
        suggestedSets: Math.max(1, target.workSets - 1),
      },
    );
  }

  const recent = filterEvidenceWindow(related, now);
  if (recent.length === 0) {
    return holdDecision(target, "No recent completed sets in the evidence window.", {
      comparableSessions: 0,
      qualifyingSessions: 0,
      windowDays: PROGRESSION_WINDOW_DAYS,
      lastPerformedAt: latestAny.performedAt,
      gapDays: overallGap,
    });
  }

  const latest = recent[0];
  const gapDays = daysBetween(latest.performedAt, now);
  const comparable = recent.filter((s) => isComparableSession(s, target));
  const evidence = {
    comparableSessions: comparable.length,
    qualifyingSessions: comparable.filter((s) => sessionQualifies(s, target)).length,
    windowDays: PROGRESSION_WINDOW_DAYS,
    lastPerformedAt: latest.performedAt,
    gapDays,
  };

  void gapDays;
  void latest;

  // 3) No comparable evidence (different equipment/convention) → hold.
  if (comparable.length === 0) {
    return holdDecision(
      target,
      "Recent work used different equipment or a different load convention, so it isn't comparable. Keep collecting evidence on this setup.",
      evidence,
    );
  }

  // 4) Repeated below-range grinding → reduce.
  const streak = belowRangeStreak(comparable, target);
  if (streak >= DELOAD_STREAK) {
    return reduceDecision(target, evidence, streak);
  }

  // 5) Missing effort evidence / stale / conflicting → hold.
  if (!comparable.some((s) => hasEffortEvidence(s))) {
    return holdDecision(
      target,
      "Log reps-in-reserve (or effort) so a load increase can be justified.",
      evidence,
    );
  }
  if (comparable.some((s) => isGrinder(s))) {
    return holdDecision(
      target,
      "The last comparable session was ground out to failure. Hold this load and collect a controlled session.",
      evidence,
    );
  }

  // 6) One good session → hold and collect more evidence.
  const requiredForPower = 3;
  const required = target.loadType === "power" ? requiredForPower : QUALIFYING_SESSIONS_REQUIRED;
  if (evidence.qualifyingSessions < required) {
    return holdDecision(
      target,
      evidence.qualifyingSessions === 0
        ? "Work toward the top of the prescribed rep range before adding load."
        : `One qualifying session logged. Hold this load and repeat it once more before progressing.`,
      evidence,
    );
  }

  // 7) Enough qualifying evidence → increase, one variable at a time.
  return increaseDecision(target, evidence);
}

function reduceDecision(
  target: PrescribedTarget,
  evidence: ProgressionDecision["evidence"],
  streak: number,
): ProgressionDecision {
  const summary = `${streak} recent sessions stayed below the prescribed range at high effort.`;
  if (target.loadType === "weighted" && target.loadKg !== null) {
    const inc = incrementFor(target.loadConvention);
    return holdDecision(target, `${summary} Reduce load by one increment.`, evidence, "reduce", {
      suggestedLoadKg: Math.max(0, target.loadKg - inc),
    });
  }
  if (target.loadType === "assisted" && target.loadKg !== null) {
    const inc = incrementFor(target.loadConvention);
    return holdDecision(target, `${summary} Use more assistance.`, evidence, "reduce", {
      suggestedLoadKg: target.loadKg + inc,
    });
  }
  return holdDecision(target, `${summary} Drop one work set.`, evidence, "reduce", {
    suggestedSets: Math.max(1, target.workSets - 1),
  });
}

function increaseDecision(
  target: PrescribedTarget,
  evidence: ProgressionDecision["evidence"],
): ProgressionDecision {
  const reason = `${evidence.qualifyingSessions} qualifying comparable sessions reached the top of range with controlled effort.`;

  if (target.loadType === "duration") {
    return holdDecision(target, `${reason} Extend the hold.`, evidence, "increase", {
      suggestedDurationSeconds: suggestedDuration(target),
    });
  }

  if (target.loadType === "bodyweight") {
    return holdDecision(
      target,
      `${reason} Add repetitions before moving to a harder variation.`,
      evidence,
      "increase",
      {
        suggestedReps: { min: target.repMin, max: target.repMax + BODYWEIGHT_REP_STEP },
      },
    );
  }

  if (target.loadType === "power") {
    return holdDecision(
      target,
      `${reason} Explosive work keeps quality first — a small load increase is permitted, never failure training.`,
      evidence,
      "increase",
      { suggestedLoadKg: target.loadKg },
    );
  }

  // Weighted / assisted: only increase if the smallest real increment fits
  // inside the 5% policy cap. Otherwise progress reps instead.
  if (target.loadKg === null) {
    return holdDecision(
      target,
      "No working load recorded yet — establish a baseline.",
      evidence,
      "new_baseline",
    );
  }
  const inc = incrementFor(target.loadConvention);
  const maxBump = target.loadKg * MAX_INCREASE_FRACTION;
  // Assisted machines step in fixed amounts and assistance is not the athlete's
  // load, so the 5% cap applies to weighted work only.
  if (target.loadType !== "assisted" && inc > maxBump) {
    return holdDecision(
      target,
      `${reason} The smallest available load jump is too large for this weight — add reps before adding load.`,
      evidence,
      "increase",
      { suggestedReps: { min: target.repMin, max: target.repMax + 2 } },
    );
  }
  const delta = target.loadType === "assisted" ? -inc : inc;
  const next =
    target.loadType === "assisted" ? Math.max(0, target.loadKg + delta) : target.loadKg + delta;
  return holdDecision(
    target,
    target.loadType === "assisted"
      ? `${reason} Reduce assistance by ${inc} kg.`
      : `${reason} Add ${inc} kg next session.`,
    evidence,
    "increase",
    { suggestedLoadKg: Number(next.toFixed(2)) },
  );
}

/** Apply a decision to a target to produce the NEXT prescription (unstarted). */
export function applyDecision(
  target: PrescribedTarget,
  decision: ProgressionDecision,
): PrescribedTarget {
  if (decision.action !== "increase" && decision.action !== "reduce") return target;
  return {
    ...target,
    loadKg: decision.suggestedLoadKg ?? target.loadKg,
    repMin: decision.suggestedReps?.min ?? target.repMin,
    repMax: decision.suggestedReps?.max ?? target.repMax,
    workSets: decision.suggestedSets ?? target.workSets,
    durationSeconds: decision.suggestedDurationSeconds ?? target.durationSeconds,
  };
}

/** True when two comparable sessions are close enough to form a chain. */
export function withinComparableGap(aIso: string, bIso: string): boolean {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) / MS_PER_DAY <= COMPARABLE_GAP_DAYS;
}
