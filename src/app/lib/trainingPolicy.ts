// ============================================================================
// SVJ Automated Training — versioned policy configuration.
//
// Every tunable number that decides a training outcome lives here and nowhere
// else, so the behaviour is auditable and can be revised without hunting
// through UI components. This is deliberately data-only: changing a value here
// changes the deterministic engines (split selection, block length, progression
// window, increments), never business state on the server.
// ============================================================================

/** Bump when any policy value below changes meaning the plan is regenerated. */
export const TRAINING_POLICY_VERSION = "svj-training-2026-09-1";

/** A training block stays stable for this many weeks before a review. */
export const PLAN_BLOCK_WEEKS = 4;

/** Recent-session evidence window for progression decisions (days). */
export const PROGRESSION_WINDOW_DAYS = 28;

/** A gap this long (days) triggers a conservative re-entry prescription. */
export const RE_ENTRY_GAP_DAYS = 14;

/** A gap this long between comparable sessions breaks the "comparable" chain. */
export const COMPARABLE_GAP_DAYS = 14;

/** Two recent comparable qualifying sessions are required before an increase. */
export const QUALIFYING_SESSIONS_REQUIRED = 2;

/** Default maximum load increase, as a fraction of the working weight. */
export const MAX_INCREASE_FRACTION = 0.05;

/** Never suggest an increase below this (kg) — it must be a real, usable bump. */
export const MIN_INCREASE_KG = 1;

/**
 * Smallest practical increment by load convention (kg). The progression engine
 * picks the smallest increment that fits, capped by MAX_INCREASE_FRACTION.
 */
export const INCREMENTS_KG: Record<string, number> = {
  barbell_total: 2.5,
  dumbbell_per_hand: 1,
  machine_stack: 2.5,
  assisted: 2.5,
  cable: 2.5,
  bodyweight_added: 1.25,
};

/** Practical plates/machines rarely move in finer steps than this (kg). */
export const FALLBACK_INCREMENT_KG = 1;

/** Repetitions a bodyweight movement must add before a variation change. */
export const BODYWEIGHT_REP_STEP = 2;

/** Timed-hold progression: seconds added once the top of range is held. */
export const TIMED_HOLD_STEP_SECONDS = 5;

/** A session counts as "comparable" when the same exercise variant sits within
 * this many reps of the target working range (guards against warm-up rows). */
export const COMPARABLE_REP_TOLERANCE = 0;

/** Sessions with a perceived-effort value at/above this are treated as hard. */
export const HARD_EFFORT_RIR_MAX = 1;

/** Repeated below-range sessions at/above this effort trigger a deload note. */
export const DELOAD_STREAK = 2;

/** Availability: a beginner with 4+ available days trains this many to start. */
export const BEGINNER_START_DAYS = 3;

/** Usable session durations (minutes) — used to trim/pad templates. */
export const SESSION_DURATION_BANDS = {
  short: 30,
  standard: 45,
  long: 60,
  extended: 75,
} as const;

/** Athlete scheduling: avoid a demanding lower-body session this many days
 * before a known competition (configurable policy, never a medical claim). */
export const COMPETITION_LOWER_BODY_BUFFER_DAYS = 2;

/** A session counts toward streak/consistency only above this completed-set count. */
export const MIN_COMPLETED_SETS_PER_SESSION = 1;

/** Weekly muscle-coverage window. */
export const MUSCLE_COVERAGE_DAYS = 7;

/** Policy snapshot handed to UIs/tests so they render the exact rules in force. */
export function policySnapshot() {
  return {
    version: TRAINING_POLICY_VERSION,
    blockWeeks: PLAN_BLOCK_WEEKS,
    progressionWindowDays: PROGRESSION_WINDOW_DAYS,
    reEntryGapDays: RE_ENTRY_GAP_DAYS,
    comparableGapDays: COMPARABLE_GAP_DAYS,
    qualifyingSessionsRequired: QUALIFYING_SESSIONS_REQUIRED,
    maxIncreaseFraction: MAX_INCREASE_FRACTION,
    minIncreaseKg: MIN_INCREASE_KG,
    competitionLowerBodyBufferDays: COMPETITION_LOWER_BODY_BUFFER_DAYS,
    muscleCoverageDays: MUSCLE_COVERAGE_DAYS,
  } as const;
}
