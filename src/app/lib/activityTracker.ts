// ============================================================================
// Activity tracker — pure logic for the automatic step counter feature.
//
// No React, storage, or sensor access here. The ActivityContext owns side
// effects; this module owns the math so it is fully unit-testable:
//   * daily records + midnight rollover
//   * calorie estimation from steps/distance/duration + body profile
//   * step-milestone XP with per-day duplicate protection
// ============================================================================

export const STEP_GOAL = 10000;

/** Step milestones that award XP once per day, in claim order. */
export const STEP_MILESTONES: ReadonlyArray<{ steps: number; xp: number; label: string }> = [
  { steps: 2500, xp: 40, label: "2.5K" },
  { steps: 5000, xp: 60, label: "5K" },
  { steps: 7500, xp: 80, label: "7.5K" },
  { steps: 10000, xp: 120, label: "10K" },
];

/** Default active-calorie goal when no body profile exists (kcal burned). */
export const ACTIVE_KCAL_GOAL_DEFAULT = 500;

export interface BodyMetrics {
  weightKg?: number;
  heightCm?: number;
  ageYears?: number;
  sex?: string;
  /** BMR measured by the assessment flow, when present. */
  bmr?: number;
  dailyCalorieTarget?: number;
}

/** One persisted calendar day of automatic activity (device sensors only —
 *  manually logged workouts are stored separately by the existing systems). */
export interface ActivityDayRecord {
  dateKey: string; // "2026-09-10" local
  steps: number;
  distanceMeters: number;
  activeSeconds: number;
  activeKcal: number;
  totalKcal: number;
  /** Step thresholds already rewarded for this day — duplicate-XP guard. */
  xpMilestones: number[];
}

export interface ActivityState {
  version: 1;
  /** Archived days, oldest first. Today lives in `today` until rollover. */
  days: ActivityDayRecord[];
  today: ActivityDayRecord | null;
  /** Today's total at the moment the live sensor session (re)anchored. */
  sessionRefSteps: number;
  sessionRefDistance: number;
  /** Last cumulative reading reported by the live session's listener.
   *  Pedometer sessions report steps since the session started, so each
   *  accepted event contributes `reading - sessionLastSteps`. */
  sessionLastSteps: number;
  sessionLastDistance: number;
  /** Epoch ms of the most recent accepted sensor measurement. */
  lastSyncedAt: number | null;
}

export const ACTIVITY_HISTORY_CAP = 60;

export function dateKeyOf(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

const nonNegative = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;

export function emptyActivityState(): ActivityState {
  return {
    version: 1,
    days: [],
    today: null,
    sessionRefSteps: 0,
    sessionRefDistance: 0,
    sessionLastSteps: 0,
    sessionLastDistance: 0,
    lastSyncedAt: null,
  };
}

/** Defensive restore for older/partial persisted payloads. */
export function normalizeActivityState(value: unknown): ActivityState {
  const base = emptyActivityState();
  if (!value || typeof value !== "object") return base;
  const saved = value as Partial<ActivityState>;
  const days = Array.isArray(saved.days)
    ? saved.days
        .filter((d): d is ActivityDayRecord => !!d && typeof d.dateKey === "string")
        .map((d) => ({
          dateKey: d.dateKey,
          steps: nonNegative(d.steps),
          distanceMeters: nonNegative(d.distanceMeters),
          activeSeconds: nonNegative(d.activeSeconds),
          activeKcal: nonNegative(d.activeKcal),
          totalKcal: nonNegative(d.totalKcal),
          xpMilestones: Array.isArray(d.xpMilestones)
            ? d.xpMilestones.filter((m) => typeof m === "number")
            : [],
        }))
        .slice(-ACTIVITY_HISTORY_CAP)
    : [];
  const today =
    saved.today && typeof saved.today.dateKey === "string"
      ? {
          dateKey: saved.today.dateKey,
          steps: nonNegative(saved.today.steps),
          distanceMeters: nonNegative(saved.today.distanceMeters),
          activeSeconds: nonNegative(saved.today.activeSeconds),
          activeKcal: nonNegative(saved.today.activeKcal),
          totalKcal: nonNegative(saved.today.totalKcal),
          xpMilestones: Array.isArray(saved.today.xpMilestones)
            ? saved.today.xpMilestones.filter((m) => typeof m === "number")
            : [],
        }
      : null;
  return {
    version: 1,
    days,
    today,
    sessionRefSteps: nonNegative(saved.sessionRefSteps),
    sessionRefDistance: nonNegative(saved.sessionRefDistance),
    sessionLastSteps: nonNegative(saved.sessionLastSteps),
    sessionLastDistance: nonNegative(saved.sessionLastDistance),
    lastSyncedAt: typeof saved.lastSyncedAt === "number" ? saved.lastSyncedAt : null,
  };
}

/**
 * Roll a day over: when the local date changes, the live record is archived
 * and tracking restarts from zero for the new day (midnight reset).
 *
 * Any live sensor session is re-anchored to the new day: its last reading
 * becomes the new session reference, so the next delta (reading - reference)
 * counts only steps taken after midnight — never yesterday's total.
 */
export function rollActivityDay(
  state: ActivityState,
  now: Date,
): { state: ActivityState; rolled: boolean } {
  const key = dateKeyOf(now);
  if (state.today && state.today.dateKey === key) return { state, rolled: false };
  const days = state.today ? [...state.days, state.today].slice(-ACTIVITY_HISTORY_CAP) : state.days;
  const refSteps = nonNegative(state.sessionLastSteps);
  const refDistance = nonNegative(state.sessionLastDistance);
  return {
    state: {
      ...state,
      days,
      today: freshDayRecord(key),
      sessionRefSteps: refSteps,
      sessionRefDistance: refDistance,
    },
    rolled: true,
  };
}

export function freshDayRecord(dateKey: string): ActivityDayRecord {
  return {
    dateKey,
    steps: 0,
    distanceMeters: 0,
    activeSeconds: 0,
    activeKcal: 0,
    totalKcal: 0,
    xpMilestones: [],
  };
}

/**
 * Merge a live pedometer measurement into today's record.
 *
 * The measurement is a cumulative reading since the current sensor session
 * started (Android TYPE_STEP_COUNTER session delta; iOS startUpdates(from:
 * session start)). Only the delta since the previous reading counts, so a
 * live session surviving midnight keeps counting the new day correctly.
 */
export function applyMeasurement(
  state: ActivityState,
  now: Date,
  measurement: {
    steps: number; // cumulative since the current sensor session started
    distanceMeters?: number;
    atMs?: number; // measurement end time (defaults to now)
  },
): ActivityState {
  const { state: rolled } = rollActivityDay(state, now);
  const today = rolled.today ?? freshDayRecord(dateKeyOf(now));
  const reading = nonNegative(measurement.steps);
  const lastReading = nonNegative(rolled.sessionLastSteps);
  const deltaSteps = Math.max(0, reading - lastReading);
  const steps = today.steps + deltaSteps;
  const distance =
    measurement.distanceMeters != null
      ? today.distanceMeters +
        Math.max(
          0,
          nonNegative(measurement.distanceMeters) - nonNegative(rolled.sessionLastDistance),
        )
      : today.distanceMeters;
  // Walking-time estimate: grow active time only while steps increase, and cap
  // each accepted gap so background pauses never count as active minutes.
  const atMs = measurement.atMs ?? now.getTime();
  const elapsedSinceSync = rolled.lastSyncedAt
    ? Math.min((atMs - rolled.lastSyncedAt) / 1000, 120)
    : 0;
  const activeSeconds =
    deltaSteps > 0 ? today.activeSeconds + Math.max(0, elapsedSinceSync) : today.activeSeconds;
  const nextToday: ActivityDayRecord = { ...today, steps, distanceMeters: distance, activeSeconds };
  return {
    ...rolled,
    today: nextToday,
    sessionLastSteps: reading,
    sessionLastDistance:
      measurement.distanceMeters != null
        ? nonNegative(measurement.distanceMeters)
        : rolled.sessionLastDistance,
    lastSyncedAt: atMs,
  };
}

/**
 * Anchor a fresh sensor session to the current day count.
 *
 * `baselineSteps` is the authoritative count already walked today — the last
 * synced value (Android) or the true midnight→now total queried from
 * CMPedometer (iOS). The day record is raised to the baseline (monotonic, so
 * a stale persisted value catches up to the iOS query without ever losing
 * data), and the session reference starts from that same count. Live events
 * then contribute only `reading - lastReading` deltas, so nothing the
 * baseline already accounted for is counted twice, and a counter that resets
 * mid-session (device reboot) clamps to a zero delta instead of going
 * negative.
 */
export function startSession(
  state: ActivityState,
  now: Date,
  baselineSteps: number,
  baselineDistance = 0,
): ActivityState {
  const { state: rolled } = rollActivityDay(state, now);
  const today = rolled.today ?? freshDayRecord(dateKeyOf(now));
  const steps = Math.max(today.steps, nonNegative(baselineSteps));
  const distance = Math.max(today.distanceMeters, nonNegative(baselineDistance));
  return {
    ...rolled,
    today:
      steps !== today.steps || distance !== today.distanceMeters
        ? { ...today, steps, distanceMeters: distance }
        : today,
    sessionRefSteps: steps,
    sessionRefDistance: distance,
    sessionLastSteps: 0,
    sessionLastDistance: 0,
  };
}

/** Milestones newly reached by `steps` and not yet awarded today. */
export function pendingMilestones(record: ActivityDayRecord | null): typeof STEP_MILESTONES {
  if (!record) return [];
  const claimed = new Set(record.xpMilestones);
  return STEP_MILESTONES.filter((m) => !claimed.has(m.steps) && record.steps >= m.steps);
}

/** Mark a milestone as claimed for today (call BEFORE awarding XP). */
export function claimMilestone(state: ActivityState, now: Date, threshold: number): ActivityState {
  const key = dateKeyOf(now);
  const today = state.today?.dateKey === key ? state.today : freshDayRecord(key);
  if (today.xpMilestones.includes(threshold)) return state;
  return { ...state, today: { ...today, xpMilestones: [...today.xpMilestones, threshold] } };
}

/** Total XP granted by the milestones already claimed on a day record. */
export function milestoneXpClaimed(record: ActivityDayRecord | null): number {
  if (!record) return 0;
  const xpBySteps = new Map(STEP_MILESTONES.map((m) => [m.steps, m.xp]));
  return record.xpMilestones.reduce((sum, steps) => sum + (xpBySteps.get(steps) ?? 0), 0);
}

// ── Calories ──────────────────────────────────────────────────────────────

/** Mifflin-St Jeor BMR; falls back to the assessment BMR, then 1,600 kcal. */
export function estimateBmr(metrics: BodyMetrics): number {
  if (metrics.bmr && metrics.bmr > 0) return Math.round(metrics.bmr);
  const weight = nonNegative(metrics.weightKg, 70);
  const height = nonNegative(metrics.heightCm, 170);
  const age = nonNegative(metrics.ageYears, 25);
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(metrics.sex?.toLowerCase() === "male" ? base + 5 : base - 161);
}

/** Stride length (meters) from height, with a population-average fallback. */
export function estimateStrideMeters(metrics: BodyMetrics): number {
  const height = nonNegative(metrics.heightCm, 0);
  return height > 0 ? height * 0.00414 : 0.71;
}

/**
 * Estimate calories for one day of automatic activity.
 *
 * Single accounting model — the sensor stream is the only source, so manually
 * logged workouts (stored separately) are never double-counted here.
 * - Active kcal: MET model from walking speed when duration+distance exist,
 *   otherwise the weight-scaled per-step fallback (~0.05 kcal/step at 80 kg).
 * - Total kcal: active + the day's elapsed share of BMR.
 */
export function estimateCalories(
  day: Pick<ActivityDayRecord, "steps" | "distanceMeters" | "activeSeconds">,
  metrics: BodyMetrics,
  now: Date,
): { activeKcal: number; totalKcal: number } {
  const steps = nonNegative(day.steps);
  if (steps === 0) {
    const bmr = estimateBmr(metrics);
    const hoursElapsed = now.getHours() + now.getMinutes() / 60 || 1;
    return { activeKcal: 0, totalKcal: Math.round((bmr / 24) * hoursElapsed) };
  }

  const weight = nonNegative(metrics.weightKg, 70);
  const stride = estimateStrideMeters(metrics);
  const walkedMeters = day.distanceMeters > 0 ? day.distanceMeters : steps * stride;
  const activeHours = Math.max(0, nonNegative(day.activeSeconds) / 3600);

  let activeKcal: number;
  if (activeHours > 1 / 60 && walkedMeters > 0) {
    // MET for walking from speed (m/s): ~2.8 MET at 0.8 m/s rising to ~4.3
    // at 1.8 m/s. kcal = MET × weight(kg) × hours.
    const speed = walkedMeters / activeHours / 3600;
    const met = Math.min(6, Math.max(2.8, 2.2 + speed * 1.1));
    activeKcal = met * weight * activeHours;
  } else {
    // Fallback: steps only. 0.53 kcal per km per kg, ~0.71 m stride.
    activeKcal = (walkedMeters / 1000) * weight * 0.53;
  }

  const bmr = estimateBmr(metrics);
  const hoursElapsed = now.getHours() + now.getMinutes() / 60 || 1;
  const totalKcal = activeKcal + (bmr / 24) * hoursElapsed;
  return { activeKcal: Math.round(activeKcal), totalKcal: Math.round(totalKcal) };
}

/** Active-kcal goal: a quarter of the assessment calorie target, or 500. */
export function activeKcalGoal(metrics: BodyMetrics): number {
  const target = nonNegative(metrics.dailyCalorieTarget, 0);
  return target > 0 ? Math.max(250, Math.round(target * 0.25)) : ACTIVE_KCAL_GOAL_DEFAULT;
}

// ── History ───────────────────────────────────────────────────────────────

export interface DayPoint {
  dateKey: string;
  label: string;
  steps: number;
  activeKcal: number;
  totalKcal: number;
}

/** Today (live) plus the archived days, newest last, limited to `count`. */
export function buildHistory(state: ActivityState, now: Date, count: number): DayPoint[] {
  const today = state.today ?? freshDayRecord(dateKeyOf(now));
  const live: DayPoint = {
    dateKey: today.dateKey,
    label: today.dateKey.slice(5),
    steps: today.steps,
    activeKcal: today.activeKcal,
    totalKcal: today.totalKcal,
  };
  const archived = state.days
    .filter((d) => d.dateKey !== today.dateKey)
    .slice(-Math.max(0, count - 1))
    .map<DayPoint>((d) => ({
      dateKey: d.dateKey,
      label: d.dateKey.slice(5),
      steps: d.steps,
      activeKcal: d.activeKcal,
      totalKcal: d.totalKcal,
    }));
  return [...archived, live].slice(-count);
}

export function summarizeHistory(history: DayPoint[]): {
  averageSteps: number;
  bestDay: DayPoint | null;
  averageActiveKcal: number;
} {
  if (history.length === 0) return { averageSteps: 0, bestDay: null, averageActiveKcal: 0 };
  const totalSteps = history.reduce((sum, d) => sum + d.steps, 0);
  const totalKcal = history.reduce((sum, d) => sum + d.activeKcal, 0);
  const bestDay = history.reduce<DayPoint | null>(
    (best, d) => (!best || d.steps > best.steps ? d : best),
    null,
  );
  return {
    averageSteps: Math.round(totalSteps / history.length),
    bestDay,
    averageActiveKcal: Math.round(totalKcal / history.length),
  };
}
