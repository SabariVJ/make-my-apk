/**
 * Recovery insights — Training load, Readiness, sleep personalisation.
 *
 * The database remains the source of truth for RECORDED ACTIVITY load and for
 * its own readiness snapshot (svj_activities + svj_recovery_checkins). This
 * module adds the part the server cannot see — completions of the user's daily
 * tasks — on top of that, using the SAME transparent weights and thresholds
 * the server uses, so both numbers stay comparable:
 *
 *   task load points (7d)   = Σ category weight per completed task
 *   total load points (7d)  = activity load points + task load points
 *   band                    = ≤120 low · ≤300 moderate · ≤520 high · else very high
 *   readiness (0–100)       = 70 − load penalty, blended 50/50 with today's
 *                             check-in (sleep / soreness / energy), ±5 for
 *                             perceived recovery — exactly the server formula
 *
 * Everything here is deterministic. No AI, no diagnosis, no invented wearable
 * data. The daily history store (date-keyed) exists so trends and the personal
 * sleep correlation can be computed from the user's own logged days.
 */
import type { ChallengeCategory } from "../types";
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from "./strength";
import type { TaskCompletion } from "./taskCompletions";
import { localDayKey } from "./taskCompletions";
import { RECOVERY_GOAL_METRICS } from "./goalsRecords";

/** Recovery day-count metrics — excluded from the training-focus goal signal. */
const RECOVERY_METRICS: readonly string[] = RECOVERY_GOAL_METRICS;

export type LoadBand = "low" | "moderate" | "high" | "very_high";
export type RecoveryGrade = "poor" | "fair" | "good" | "excellent" | "unknown";

/** Category weighting: strain-producing work counts more than cognitive work. */
export const TASK_LOAD_WEIGHTS: Record<ChallengeCategory, number> = {
  Physical: 6,
  Discipline: 6,
  Nutrition: 4,
  Mental: 3,
  Mindset: 3,
};

/** Fallback for any category the bank may add later. */
export const DEFAULT_TASK_LOAD_WEIGHT = 3;

/** Band thresholds, mirroring svj_load_band(). */
export const LOAD_BAND_THRESHOLDS = { low: 120, moderate: 300, high: 520 } as const;

/** Readiness below this is "low" and softens tomorrow's suggested tasks. */
export const LOW_READINESS_THRESHOLD = 60;

/** Default wake time used to place the recommended sleep window (local time). */
export const DEFAULT_WAKE_HOUR = 7;

export const RECOVERY_HISTORY_DAYS = 60;

/** Local storage key for the day-keyed recovery history store. */
export const RECOVERY_HISTORY_STORAGE_KEY = "svj_app_state_v5_recovery_history";

export interface RecoveryCheckin {
  sleepHours: number | null;
  soreness: number | null;
  energy: number | null;
  perceivedRecovery: number | null;
}

export interface RecoveryDayRecord {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  checkin: RecoveryCheckin;
  /** Load points from recorded activity sessions (server-reported). */
  activityLoadPoints: number;
  /** Load points from completed daily tasks (client-computed). */
  taskLoadPoints: number;
  /** Activity + task load for the trailing 7 days at the time of writing. */
  totalLoadPoints: number;
  band: LoadBand;
  score: number;
  recovery: RecoveryGrade;
  /** Task completions counted into taskLoadPoints. */
  taskCount: number;
}

export interface ReadinessResult {
  score: number;
  band: LoadBand;
  recovery: RecoveryGrade;
  /** Breakdown so the UI can label where each number came from. */
  components: {
    activityLoadPoints: number;
    taskLoadPoints: number;
    totalLoadPoints: number;
    loadPenalty: number;
    taskCount: number;
    restDaysLast3: number | null;
    sources: string[];
  };
  advice: string;
  isLow: boolean;
}

// ── Day helpers ─────────────────────────────────────────────────────────────

export function dayKeyOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDayKey(d);
}

function lastNDayKeys(days: number, from: Date = new Date()): string[] {
  return Array.from({ length: days }, (_, i) => dayKeyOffset(-i, from));
}

export function bandForLoad(points: number): LoadBand {
  if (points <= LOAD_BAND_THRESHOLDS.low) return "low";
  if (points <= LOAD_BAND_THRESHOLDS.moderate) return "moderate";
  if (points <= LOAD_BAND_THRESHOLDS.high) return "high";
  return "very_high";
}

export function gradeForScore(score: number): RecoveryGrade {
  if (score >= 78) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

// ── Load from completed tasks ───────────────────────────────────────────────

export function taskLoadWeight(category: ChallengeCategory): number {
  return TASK_LOAD_WEIGHTS[category] ?? DEFAULT_TASK_LOAD_WEIGHT;
}

/** Load points contributed by the task completions of one day. */
export function taskLoadForDay(rows: TaskCompletion[], dayKey: string): number {
  return rows
    .filter((row) => row.dayKey === dayKey)
    .reduce((sum, row) => sum + taskLoadWeight(row.category), 0);
}

/**
 * Task load over the trailing window (today included), counted only for rows
 * that are CURRENTLY completed — unchecking a task removes its load again.
 */
export function taskLoadPoints(
  ledgerRows: TaskCompletion[],
  days = 7,
  from: Date = new Date(),
): { points: number; taskCount: number } {
  const window = new Set(lastNDayKeys(days, from));
  const inWindow = ledgerRows.filter((row) => !row.undoneAt && window.has(row.dayKey));
  return {
    points: inWindow.reduce((sum, row) => sum + taskLoadWeight(row.category), 0),
    taskCount: inWindow.length,
  };
}

/** Rest days inside the last 3 days, derived from days that recorded load. */
export function restDaysLast3(
  activityDays: string[],
  taskDays: string[],
  from: Date = new Date(),
): number {
  const busy = new Set([...activityDays, ...taskDays]);
  return [0, 1, 2].filter((offset) => !busy.has(dayKeyOffset(-offset, from))).length;
}

// ── Readiness ───────────────────────────────────────────────────────────────

export interface ReadinessInput {
  activityLoadPoints: number;
  taskLoadPoints: number;
  taskCount?: number;
  checkin?: Partial<RecoveryCheckin> | null;
  /** Number of the last 3 days without recorded load (server-provided if known). */
  restDays?: number | null;
}

/**
 * One-sentence, non-medical advice for a readiness score. Extracted so the
 * server-readiness adapter (Phase 7) reuses the exact same wording instead of
 * growing a second copy that could drift.
 */
export function readinessAdvice(score: number): string {
  return score >= 78
    ? "Train normally — push if you feel good."
    : score >= 60
      ? "Train normally."
      : score >= 40
        ? "Light session recommended."
        : "Rest or very light movement today.";
}

/**
 * Transparent readiness score. Mirrors svj_compute_readiness() and then adds
 * the task-load contribution, so completed tasks genuinely move the score.
 */
export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const activity = Math.max(0, Number(input.activityLoadPoints) || 0);
  const task = Math.max(0, Number(input.taskLoadPoints) || 0);
  const total = activity + task;
  const band = bandForLoad(total);
  const restDays = typeof input.restDays === "number" ? input.restDays : null;

  let penalty = 0;
  if (band === "high" && restDays === 0) penalty = 12;
  if (band === "very_high") penalty = 20;
  if (band === "very_high" && restDays === 0) penalty = 28;

  let score = 70 - penalty;
  let recovery: RecoveryGrade = "unknown";

  const checkin = input.checkin ?? null;
  const hasCheckin =
    !!checkin &&
    (checkin.sleepHours !== null ||
      checkin.soreness !== null ||
      checkin.energy !== null ||
      checkin.perceivedRecovery !== null);

  if (hasCheckin) {
    const sleepPoints = Math.min(20, Math.max(0, ((Number(checkin.sleepHours ?? 7) - 5) / 3) * 20));
    const sorenessPoints = (6 - Number(checkin.soreness ?? 3)) * 5;
    const energyPoints = Number(checkin.energy ?? 3) * 4;
    const checkinPoints = Math.min(
      100,
      Math.max(0, ((sleepPoints + sorenessPoints + energyPoints) / 60) * 100),
    );
    score = Math.round(score * 0.5 + checkinPoints * 0.5);
    if (checkin.perceivedRecovery === 5) score += 5;
    if (checkin.perceivedRecovery === 1) score -= 5;
    recovery = gradeForScore(Math.max(0, Math.min(100, score)));
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const sources: string[] = [];
  if (activity > 0) sources.push("recorded_activity");
  if (task > 0) sources.push("completed_tasks");
  if (hasCheckin) sources.push("user_checkin");

  return {
    score,
    band,
    recovery,
    components: {
      activityLoadPoints: activity,
      taskLoadPoints: task,
      totalLoadPoints: total,
      loadPenalty: penalty,
      taskCount: Math.max(0, Math.round(Number(input.taskCount) || 0)),
      restDaysLast3: restDays,
      sources,
    },
    advice: readinessAdvice(score),
    isLow: score < LOW_READINESS_THRESHOLD,
  };
}

/** True when readiness is low enough to soften tomorrow's task difficulty. */
export function isLowReadiness(score: number | null | undefined): boolean {
  return typeof score === "number" && Number.isFinite(score) && score < LOW_READINESS_THRESHOLD;
}

// ── History store ───────────────────────────────────────────────────────────

export function emptyDayRecord(date: string): RecoveryDayRecord {
  return {
    date,
    checkin: { sleepHours: null, soreness: null, energy: null, perceivedRecovery: null },
    activityLoadPoints: 0,
    taskLoadPoints: 0,
    totalLoadPoints: 0,
    band: "low",
    score: 0,
    recovery: "unknown",
    taskCount: 0,
  };
}

/** Defensive load of the persisted history. */
export function normalizeHistory(raw: unknown): RecoveryDayRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (row): row is RecoveryDayRecord =>
        !!row && typeof row === "object" && typeof (row as RecoveryDayRecord).date === "string",
    )
    .map((row) => ({
      ...emptyDayRecord(row.date),
      ...row,
      checkin: { ...emptyDayRecord(row.date).checkin, ...(row.checkin ?? {}) },
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-RECOVERY_HISTORY_DAYS);
}

/**
 * Upsert one day's record (check-in + computed load + score) so trends can be
 * derived later. Keeps the newest RECOVERY_HISTORY_DAYS entries.
 */
export function upsertDayRecord(
  history: RecoveryDayRecord[],
  record: RecoveryDayRecord,
): RecoveryDayRecord[] {
  const next = history.filter((row) => row.date !== record.date);
  next.push(record);
  return next.sort((a, b) => a.date.localeCompare(b.date)).slice(-RECOVERY_HISTORY_DAYS);
}

/** The trailing `days` records ending today, oldest first (gaps included). */
export function trailingRecords(
  history: RecoveryDayRecord[],
  days = 7,
  now: Date = new Date(),
): RecoveryDayRecord[] {
  const byDate = new Map(history.map((row) => [row.date, row]));
  return lastNDayKeys(days, now)
    .reverse()
    .map((date) => byDate.get(date) ?? emptyDayRecord(date));
}

/**
 * One day of the server's recovery history (svj_list_my_recovery_history).
 * The check-in fields are the athlete's own durable inputs — the only copy
 * that survives a reinstall or a new device.
 */
export interface ServerHistoryDay {
  date: string;
  score: number;
  band: LoadBand;
  recovery: RecoveryGrade;
  /** True when a check-in row actually exists for that day. */
  hasCheckin?: boolean;
  sleepHours?: number | null;
  soreness?: number | null;
  energy?: number | null;
  perceivedRecovery?: number | null;
  /** Real recorded-activity load behind that day's score. */
  activityLoadPoints?: number;
  restDaysLast3?: number | null;
}

/**
 * Fold the server's own history into this device's store, so the trend and the
 * sleep correlation are rebuilt from durable data instead of only from what
 * happens to be cached locally.
 *
 * Rules (no fabricated days, ever):
 *  - only days the server actually returned are touched;
 *  - the athlete's check-in values are adopted whenever the server has them;
 *    a day with no check-in never has local values erased or invented;
 *  - a day this device already scored keeps that score — it was computed with
 *    the local completion ledger at the time and is the richer record — while
 *    a day only the server knows about uses the server's own snapshot.
 */
export function mergeServerHistory(
  history: RecoveryDayRecord[],
  serverDays: ServerHistoryDay[],
): RecoveryDayRecord[] {
  let merged = history;

  // "Already scored by this device" is decided from the store we were given,
  // not from days this merge itself creates, so a server day can never shield
  // itself from a newer server value for the same date.
  const locallyScored = new Set(history.filter((row) => row.score > 0).map((row) => row.date));

  for (const day of serverDays) {
    if (!day || typeof day.date !== "string" || day.date === "") continue;
    const existing = merged.find((row) => row.date === day.date);
    const base = existing ?? emptyDayRecord(day.date);

    const serverCheckin: Partial<RecoveryCheckin> = {};
    if (day.hasCheckin) {
      if (typeof day.sleepHours === "number") serverCheckin.sleepHours = day.sleepHours;
      if (typeof day.soreness === "number") serverCheckin.soreness = day.soreness;
      if (typeof day.energy === "number") serverCheckin.energy = day.energy;
      if (typeof day.perceivedRecovery === "number") {
        serverCheckin.perceivedRecovery = day.perceivedRecovery;
      }
    }
    const checkin: RecoveryCheckin = { ...base.checkin, ...serverCheckin };
    const serverLoad = Math.max(0, Number(day.activityLoadPoints) || 0);
    const keepLocalScore = locallyScored.has(day.date);

    const record: RecoveryDayRecord = keepLocalScore
      ? {
          ...base,
          date: day.date,
          checkin,
          activityLoadPoints: base.activityLoadPoints > 0 ? base.activityLoadPoints : serverLoad,
        }
      : {
          ...base,
          date: day.date,
          checkin,
          activityLoadPoints: serverLoad,
          totalLoadPoints: base.totalLoadPoints > 0 ? base.totalLoadPoints : serverLoad,
          score: Math.max(0, Math.min(100, Number(day.score) || 0)),
          band: day.band ?? base.band,
          recovery: day.recovery ?? base.recovery,
        };

    merged = upsertDayRecord(merged, record);
  }

  return merged;
}

// ── Personal best sleep ─────────────────────────────────────────────────────

export interface SleepBucket {
  /** Lower bound of the bucket, in hours (0.5h steps). */
  fromHour: number;
  toHour: number;
  /** Days in this bucket that also have a next-day measurement. */
  samples: number;
  /** Average next-day energy (1–5), or null when unlogged. */
  avgNextEnergy: number | null;
  /** Average next-day readiness score, or null when unknown. */
  avgNextScore: number | null;
}

export interface BestSleepResult {
  buckets: SleepBucket[];
  /** Best bucket by next-day outcome, when there is enough evidence. */
  best: SleepBucket | null;
  /** How many sleep→next-day pairs were available. */
  pairedDays: number;
  /** Human range, e.g. "7.5–8.0 h". */
  bestRangeLabel: string | null;
  /** True when there is not enough personal history yet. */
  insufficientData: boolean;
}

const hoursLabel = (fromHour: number, toHour: number) =>
  `${fromHour.toFixed(1).replace(/\.0$/, "")}–${toHour.toFixed(1).replace(/\.0$/, "")} h`;

/**
 * Correlate the user's OWN sleep entries against the NEXT day's energy (and
 * readiness), returning their personal optimal range. Deliberately returns no
 * recommendation until at least `minPairs` sleep→next-day pairs exist, so we
 * never show a generic number dressed up as personalisation.
 */
export function bestSleepRange(history: RecoveryDayRecord[], minPairs = 3): BestSleepResult {
  const byDate = new Map(history.map((row) => [row.date, row]));
  const buckets = new Map<number, { energy: number[]; score: number[] }>();

  let pairedDays = 0;
  for (const row of history) {
    const sleep = row.checkin.sleepHours;
    if (typeof sleep !== "number" || !Number.isFinite(sleep) || sleep <= 0 || sleep > 24) continue;

    const nextDate = dayKeyOffset(1, new Date(`${row.date}T12:00:00`));
    const next = byDate.get(nextDate);
    if (!next) continue;

    const energy = next.checkin.energy;
    const hasScore = next.score > 0;
    if (typeof energy !== "number" && !hasScore) continue;

    pairedDays += 1;
    const bucketKey = Math.floor(sleep * 2) / 2; // 0.5h buckets
    const bucket = buckets.get(bucketKey) ?? { energy: [], score: [] };
    if (typeof energy === "number") bucket.energy.push(energy);
    if (hasScore) bucket.score.push(next.score);
    buckets.set(bucketKey, bucket);
  }

  const list: SleepBucket[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fromHour, values]) => ({
      fromHour,
      toHour: fromHour + 0.5,
      samples: Math.max(values.energy.length, values.score.length),
      avgNextEnergy: values.energy.length
        ? values.energy.reduce((a, b) => a + b, 0) / values.energy.length
        : null,
      avgNextScore: values.score.length
        ? values.score.reduce((a, b) => a + b, 0) / values.score.length
        : null,
    }));

  const eligible = list.filter((bucket) => bucket.samples >= 2);
  const insufficientData = pairedDays < minPairs || eligible.length === 0;

  let best: SleepBucket | null = null;
  if (!insufficientData) {
    best = eligible.reduce(
      (champion, bucket) => {
        const value = (b: SleepBucket) => (b.avgNextEnergy ?? 0) * 25 + (b.avgNextScore ?? 0);
        if (!champion) return bucket;
        return value(bucket) > value(champion) ? bucket : champion;
      },
      null as SleepBucket | null,
    );
  }

  return {
    buckets: list,
    best,
    pairedDays,
    bestRangeLabel: best ? hoursLabel(best.fromHour, best.toHour) : null,
    insufficientData,
  };
}

// ── Tonight's sleep window ──────────────────────────────────────────────────

export interface SleepWindow {
  /** Recommended sleep duration (hours), personal optimum + load adjustment. */
  minHours: number;
  maxHours: number;
  /** Bedtime range as "HH:MM" local strings, given a wake time. */
  bedtimeFrom: string;
  bedtimeTo: string;
  /** Extra minutes added because of a high training-load day. */
  loadAdjustmentMinutes: number;
  /** True when the window comes from the user's own history. */
  personalised: boolean;
  /** Set when there is no personal optimum yet. */
  note: string;
}

const FALLBACK_SLEEP_HOURS = 8;
/** Minimum sleep we will ever recommend, regardless of load. */
const MIN_SLEEP_HOURS = 6;

function formatClock(hoursFromMidnight: number): string {
  const wrapped = ((hoursFromMidnight % 24) + 24) % 24;
  const h = Math.floor(wrapped);
  const m = Math.round((wrapped - h) * 60);
  const hh = m === 60 ? (h + 1) % 24 : h;
  const mm = m === 60 ? 0 : m;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Tonight's sleep window: the personal optimum when we have one, extended on
 * higher training-load days (moderate +15 min, high +30, very high +45).
 */
export function recomputeSleepWindow(
  best: BestSleepResult,
  band: LoadBand,
  options: { wakeHour?: number; wakeMinute?: number } = {},
): SleepWindow {
  const loadAdjustmentMinutes =
    band === "very_high" ? 45 : band === "high" ? 30 : band === "moderate" ? 15 : 0;

  const personalised = !!best.best;
  const baseMin = personalised ? best.best!.fromHour : FALLBACK_SLEEP_HOURS - 0.5;
  const baseMax = personalised ? best.best!.toHour : FALLBACK_SLEEP_HOURS + 0.5;

  const minHours = Math.max(
    MIN_SLEEP_HOURS,
    Number((baseMin + loadAdjustmentMinutes / 60).toFixed(2)),
  );
  const maxHours = Math.max(minHours, Number((baseMax + loadAdjustmentMinutes / 60).toFixed(2)));

  const wakeHour = options.wakeHour ?? DEFAULT_WAKE_HOUR;
  const wakeMinute = options.wakeMinute ?? 0;
  const wake = wakeHour + wakeMinute / 60;

  return {
    minHours,
    maxHours,
    bedtimeFrom: formatClock(wake - maxHours),
    bedtimeTo: formatClock(wake - minHours),
    loadAdjustmentMinutes,
    personalised,
    note: personalised
      ? `Based on your own logged sleep. Load adjustment: +${loadAdjustmentMinutes} min.`
      : "Log a few more nights to personalise this from your own sleep history.",
  };
}

// ── Phase 3 — founder Overview intelligence (pure + deterministic) ─────────

// ── Recovery streak ─────────────────────────────────────────────────────────

/**
 * Consecutive-day check-in streak counted over SERVER history days only.
 *
 * Day basis: the server's own dates (svj_recovery_checkins.checkin_date is a
 * UTC calendar day) are authoritative. Local records are never merged into
 * this number. The streak counts back from the most recent check-in day and
 * breaks at the first missing calendar day — it is not required to include
 * today, so the streak survives until the day after the athlete last checked
 * in. Only days with a real stored check-in count: opening Recovery writes no
 * server row, and a failed save writes no row either.
 */
export function recoveryCheckinStreak(
  /** Minimal shape: the streak only reads a day's date + hasCheckin flag. */
  serverDays: { date: string; hasCheckin?: boolean }[],
  now: Date = new Date(),
): number {
  const checkedDays = new Set(
    serverDays
      .filter((day) => !!day && typeof day.date === "string" && day.hasCheckin === true)
      .map((day) => day.date),
  );
  if (checkedDays.size === 0) return 0;

  // Start at the most recent checked-in day (today when there is one) so a
  // yesterday-only streak is still shown as alive, and count backwards over
  // consecutive calendar days. A gap breaks the count immediately.
  const cursor = new Date(now);
  while (!checkedDays.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    // A server history can only ever contain dates at or before today; going
    // further back than the window can reach means the set is empty.
    if (checkedDays.size === 0) return 0;
  }

  let streak = 0;
  while (checkedDays.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ── Today's Focus ───────────────────────────────────────────────────────────

export type FocusEmphasis = "rest" | "lighter" | "normal" | "stronger";

export interface FocusInput {
  /** The same combined readiness the existing Recovery panel renders. */
  readiness: ReadinessResult;
  /** Training-profile goal — the primary goal signal. */
  trainingGoal: string | null;
  /** Applicable active svj_goals rows (already filtered, may be empty). */
  activityGoal: { metric: string; progress: number; targetValue: number } | null;
}

export interface FocusRecommendation {
  emphasis: FocusEmphasis;
  headline: string;
  /** One deterministic, explainable sentence; no medical claims. */
  detail: string;
}

const goalLabel = (trainingGoal: string | null): string =>
  ({
    muscle: "building muscle",
    athletic: "athletic performance",
    strength: "strength progress",
    general: "general fitness",
  })[trainingGoal ?? "general"] ?? "general fitness";

/**
 * Deterministic, explainable recommendation built on the shared ReadinessResult
 * (the exact object the Recovery panel renders) so it can never disagree with
 * the ring. The emphasis comes from readinessEmphasis below; the applicable
 * activity goal (secondary signal) only appends a progress sentence.
 */
/**
 * The SINGLE authoritative recovery→training emphasis decision, derived only
 * from the shared ReadinessResult. Every Phase-7 surface (Today's Focus, the
 * Rest-Day alert and MY SVJ PLAN's recovery note) consumes THIS function, so
 * there is exactly one set of thresholds and they can never compete.
 *
 *   rest     : score < 40, or (very_high load AND no rest day in the last 3)
 *   lighter  : score < 60, or (high load AND no rest day in the last 3)
 *   stronger : score ≥ 78 AND (low load OR a rest day in the last 3)
 *   normal   : everything else
 */
export function readinessEmphasis(readiness: ReadinessResult): FocusEmphasis {
  const band = readiness.band;
  const restDays = readiness.components.restDaysLast3;
  const score = readiness.score;

  if (score < 40 || (band === "very_high" && restDays === 0)) return "rest";
  if (score < 60 || (band === "high" && restDays === 0)) return "lighter";
  if (score >= 78 && (band === "low" || (typeof restDays === "number" && restDays > 0))) {
    return "stronger";
  }
  return "normal";
}

export function todaysFocus(input: FocusInput): FocusRecommendation {
  const { readiness, trainingGoal, activityGoal } = input;
  const band = readiness.band;
  const goal = goalLabel(trainingGoal);
  const score = readiness.score;

  const goalClause =
    trainingGoal && trainingGoal !== "general" ? ` while keeping your ${goal} goal on track` : "";

  const emphasis = readinessEmphasis(readiness);
  let headline: string;
  let detail: string;

  if (emphasis === "rest") {
    headline = "Prioritise recovery today";
    detail = `Readiness is ${score} with a ${
      band === "very_high" ? "very high" : "low"
    } training load$?
      goalClause
    }. Rest or keep movement very light so your body can catch up.`;
  } else if (emphasis === "lighter") {
    headline = "Keep it light today";
    detail = `Readiness is ${score} — a lighter session is the right call${goalClause}.`;
  } else if (emphasis === "stronger") {
    headline = "Green light for a strong session";
    detail =
      readiness.components.activityLoadPoints === 0 && readiness.components.taskLoadPoints === 0
        ? `Readiness is ${score} and your week is light — a solid session would land well${goalClause}.`
        : `Readiness is ${score} with a ${band} load — a strong session fits${goalClause}.`;
  } else {
    headline = "Train normally today";
    detail = `Readiness is ${score} on a ${band} load — train normally${goalClause}.`;
  }

  // An applicable activity goal refines the wording without ever contradicting
  // the emphasis derived from readiness (secondary signal only).
  if (activityGoal && activityGoal.targetValue > 0) {
    const metric =
      activityGoal.metric === "workout_count"
        ? "workout"
        : activityGoal.metric === "step_total"
          ? "step"
          : activityGoal.metric === "distance"
            ? "distance"
            : "active-minute";
    const percent = Math.min(
      99,
      Math.round((activityGoal.progress / activityGoal.targetValue) * 100),
    );
    detail += ` You are ${percent}% into your weekly ${metric} goal.`;
  }

  return { emphasis, headline, detail };
}

/**
 * Filter raw goal rows down to the applicable set for Focus: active AND the
 * period covers today. Broken server expiry is deliberately not fixed here —
 * a non-current goal is simply ignored (the real lifecycle fix is Phase 5).
 */
export function applicableActivityGoals(
  goals: {
    status?: string;
    periodStart?: string;
    periodEnd?: string;
    metric?: string;
    progress?: number;
    targetValue?: number;
  }[],
  now: Date = new Date(),
): NonNullable<FocusInput["activityGoal"]> | null {
  const today = localDayKey(now);
  for (const goal of goals) {
    if (goal.status !== "active") continue;
    // Recovery day-count goals never belong in a TRAINING focus sentence
    // ("complete 5 sleep days" would be nonsense) — they are excluded here;
    // recovery goal progress lives in the Recovery → Goals section.
    if (RECOVERY_METRICS.includes(goal.metric ?? "")) continue;
    if (!goal.periodStart || !goal.periodEnd) continue;
    if (goal.periodStart > today || goal.periodEnd < today) continue;
    if (typeof goal.targetValue !== "number" || goal.targetValue <= 0) continue;
    return {
      metric: typeof goal.metric === "string" ? goal.metric : "workout_count",
      progress: Math.max(0, Number(goal.progress) || 0),
      targetValue: goal.targetValue,
    };
  }
  return null;
}

// ── Estimated muscle recovery (NOT physiology) ───────────────────────────

export type MuscleRecoveryState = "fresh" | "moderate" | "high" | "no_recent_data";

export interface MuscleRecoveryEntry {
  muscle: string;
  label: string;
  state: MuscleRecoveryState;
  /** Deterministic, explainable reason for the state (also the a11y text). */
  reason: string;
}

export interface MuscleRecoveryMap {
  entries: MuscleRecoveryEntry[];
  /** True when no real training evidence exists at all in the window. */
  hasAnyData: boolean;
}

const MUSCLE_RECOVERY_STATES: Record<MuscleRecoveryState, string> = {
  fresh: "Fresh",
  moderate: "Moderate",
  high: "High",
  no_recent_data: "No recent data",
};

export const muscleRecoveryStateLabel = (state: MuscleRecoveryState): string =>
  MUSCLE_RECOVERY_STATES[state];

/**
 * Estimated recovery state per muscle, derived ONLY from real recent training
 * history (last-trained recency + direct/supporting set counts + volume).
 *
 * This is an activity summary, NOT physiology: it says nothing about soreness,
 * damage, HRV or what the muscle can actually do. The UI must present it as
 * estimated from recent training history.
 *
 * Rule (deterministic, explainable):
 *   high     — trained today or yesterday (direct or supporting work)
 *   moderate — trained 2–3 days ago
 *   fresh    — trained 4+ days ago within the window
 *   none     — no logged training in the window
 * Volume only breaks ties in the reasons, never moves a state.
 */
export function estimateMuscleRecovery(
  rows: {
    muscle: string;
    directSets: number;
    supportingSets: number;
    directVolume: number;
    lastTrainedDate: string | null;
  }[],
  now: Date = new Date(),
): MuscleRecoveryMap {
  const byMuscle = new Map(rows.map((row) => [row.muscle, row]));
  const entries: MuscleRecoveryEntry[] = MUSCLE_GROUPS.map((muscle: MuscleGroup) => {
    const row = byMuscle.get(muscle);
    const label = MUSCLE_LABELS[muscle] ?? muscle;
    if (
      !row ||
      row.lastTrainedDate === null ||
      (row.directSets === 0 && row.supportingSets === 0)
    ) {
      return {
        muscle,
        label,
        state: "no_recent_data",
        reason: "No logged training in the last 7 days.",
      };
    }
    const [y, m, d] = row.lastTrainedDate.split("-").map(Number);
    const then = new Date(y, (m ?? 1) - 1, d ?? 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.floor((today.getTime() - then.getTime()) / 86_400_000);
    const direct = row.directSets;
    const supporting = row.supportingSets;
    const volume = Math.round(Number(row.directVolume) || 0);

    let state: MuscleRecoveryState;
    if (days <= 1) state = "high";
    else if (days <= 3) state = "moderate";
    else state = "fresh";

    const daysLabel = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    const work =
      direct > 0 && supporting > 0
        ? `${direct} direct + ${supporting} supporting sets`
        : direct > 0
          ? `${direct} direct sets`
          : `${supporting} supporting sets`;
    const reason = `Last trained ${daysLabel} — ${work}${volume > 0 ? `, ${volume.toLocaleString()} kg volume` : ""}.`;
    return { muscle, label, state, reason };
  });

  return {
    entries,
    hasAnyData: entries.some((entry) => entry.state !== "no_recent_data"),
  };
}

// ── 7-day trend ─────────────────────────────────────────────────────────────

export interface TrendPoint {
  date: string;
  label: string;
  score: number;
  sleepHours: number | null;
  band: LoadBand;
  hasData: boolean;
}

/** Seven-day readiness + sleep series (oldest first) for the trend graph. */
export function readinessTrend(
  history: RecoveryDayRecord[],
  days = 7,
  now: Date = new Date(),
): TrendPoint[] {
  return trailingRecords(history, days, now).map((row) => {
    const parsed = new Date(`${row.date}T12:00:00`);
    return {
      date: row.date,
      label: parsed.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      score: row.score,
      sleepHours: row.checkin.sleepHours ?? null,
      band: row.band,
      hasData: row.score > 0 || row.checkin.sleepHours !== null,
    };
  });
}

// ── Phase 4 — server-authoritative history heatmap ───────────────────────
//
// The History calendar is built ONLY from svj_list_my_recovery_history rows.
// The server-returned `date` string is the canonical day key: rows are placed
// on that key verbatim and never shifted to a local calendar day, and local
// RecoveryDayRecord storage is never merged in to "fill" dates. A calendar
// cell with no server row is NO DATA — never a fabricated zero score.

import type { RecoveryHistoryPoint } from "./recovery";

export type HeatCellState = "scored" | "no_data";

export interface HeatmapCell {
  /** Canonical server day key (YYYY-MM-DD) for scored cells; synthesized
   *  calendar key (same format) for no-data cells. */
  date: string;
  state: HeatCellState;
  /** Server score when state === "scored" (0–100); null for no-data. */
  score: number | null;
  grade: RecoveryGrade | null;
  band: LoadBand | null;
  hasCheckin: boolean;
  sleepHours: number | null;
}

/**
 * Build the heatmap calendar for the last `days` SERVER days.
 *
 * - Every server row is kept: `score > 0` and `score === 0` are BOTH scored
 *   days (a genuinely low/zero readiness day is real data, not a gap).
 * - Calendar days inside the window without a server row are `no_data`.
 * - Row order in the result is oldest → newest. The window ends on the
 *   newest server date when one exists (the server is the day authority); a
 *   fully empty history returns an empty grid rather than inventing dates.
 */
export function buildRecoveryHeatmap(serverDays: RecoveryHistoryPoint[], days = 35): HeatmapCell[] {
  const byDate = new Map<string, RecoveryHistoryPoint>();
  let newest: string | null = null;
  for (const row of serverDays) {
    if (typeof row.date !== "string" || row.date === "") continue;
    byDate.set(row.date, row);
    if (newest === null || row.date > newest) newest = row.date;
  }
  if (newest === null) return [];

  const cells: HeatmapCell[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(`${newest}T12:00:00`);
    day.setDate(day.getDate() - offset);
    const key = localDayKey(day);
    const row = byDate.get(key);
    if (!row) {
      cells.push({
        date: key,
        state: "no_data",
        score: null,
        grade: null,
        band: null,
        hasCheckin: false,
        sleepHours: null,
      });
      continue;
    }
    const score = typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0;
    cells.push({
      date: key,
      state: "scored",
      score,
      grade: gradeForScore(score),
      band: (["low", "moderate", "high", "very_high"].includes(row.trainingLoad)
        ? row.trainingLoad
        : "moderate") as LoadBand,
      hasCheckin: row.hasCheckin === true,
      sleepHours: typeof row.sleepHours === "number" ? row.sleepHours : null,
    });
  }
  return cells;
}

/** Month/day caption for a heatmap cell, e.g. "September 18". */
export function heatCellDateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

/** Human band word for the accessible label ("good", "no data", …). */
export function heatCellBandLabel(grade: RecoveryGrade | null): string {
  if (!grade || grade === "unknown") return "no data";
  return grade;
}

// ── Phase 4 — sleep vs readiness (deterministic, honest) ─────────────────
//
// Pearson correlation between reported sleep and the SAME day's readiness
// score, computed only over days that have BOTH a usable sleep value and a
// server readiness score. Missing inputs are skipped — never treated as 0.

export type SleepCorrelationStrength =
  | "insufficient_data"
  | "no_clear_relationship"
  | "higher_sleep_higher_readiness"
  | "higher_sleep_lower_readiness";

export interface SleepReadinessCorrelation {
  strength: SleepCorrelationStrength;
  /** Paired days actually used. */
  samples: number;
  /** Pearson r in [-1, 1], or null when not computable (incl. zero variance). */
  r: number | null;
  /** Human-readable, non-causal summary. */
  summary: string;
}

/** Below this many usable sleep↔readiness pairs we refuse to interpret. */
export const SLEEP_CORRELATION_MIN_SAMPLES = 5;
/** |r| at or below this is reported as "no clear relationship". */
export const SLEEP_CORRELATION_WEAK_THRESHOLD = 0.3;

/**
 * Deterministic Pearson correlation of sleepHours ↔ score over server history
 * rows. Rules (documented for tests):
 *  - a pair needs a finite sleepHours > 0 AND a finite score ≥ 0 on the SAME
 *    server day; anything else is skipped (missing sleep is NOT 0),
 *  - fewer than SLEEP_CORRELATION_MIN_SAMPLES usable pairs → insufficient_data,
 *  - zero variance on either axis (or a non-finite intermediate) → r = null and
 *    no_clear_relationship — never NaN/Infinity,
 *  - |r| ≤ SLEEP_CORRELATION_WEAK_THRESHOLD → no_clear_relationship,
 *  - r > threshold → higher_sleep_higher_readiness; r < −threshold → the
 *    opposite. Wording is neutral and never implies causation.
 */
export function correlateSleepReadiness(
  serverDays: RecoveryHistoryPoint[],
): SleepReadinessCorrelation {
  const pairs: Array<{ sleep: number; score: number }> = [];
  for (const row of serverDays) {
    const sleep = row.sleepHours;
    const score = row.score;
    if (typeof sleep !== "number" || !Number.isFinite(sleep) || sleep <= 0) continue;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0) continue;
    pairs.push({ sleep, score });
  }

  const insufficient = (samples: number): SleepReadinessCorrelation => ({
    strength: "insufficient_data" as const,
    samples,
    r: null,
    summary:
      samples === 0
        ? "No paired sleep and readiness days yet — save a check-in with your sleep hours to build this view."
        : `Not enough paired sleep and readiness days yet (${samples} of ${SLEEP_CORRELATION_MIN_SAMPLES} needed) — keep logging your check-ins.`,
  });

  if (pairs.length < SLEEP_CORRELATION_MIN_SAMPLES) return insufficient(pairs.length);

  const n = pairs.length;
  const meanSleep = pairs.reduce((s, p) => s + p.sleep, 0) / n;
  const meanScore = pairs.reduce((s, p) => s + p.score, 0) / n;
  let cov = 0;
  let varSleep = 0;
  let varScore = 0;
  for (const p of pairs) {
    const ds = p.sleep - meanSleep;
    const dq = p.score - meanScore;
    cov += ds * dq;
    varSleep += ds * ds;
    varScore += dq * dq;
  }
  const denominator = Math.sqrt(varSleep * varScore);
  if (denominator <= 0 || !Number.isFinite(denominator) || !Number.isFinite(cov)) {
    return {
      strength: "no_clear_relationship",
      samples: n,
      r: null,
      summary:
        "Your logged nights are too similar (or too flat) to show a relationship with readiness yet.",
    };
  }
  const r = cov / denominator;
  const clamped = Math.max(-1, Math.min(1, r));
  if (!Number.isFinite(clamped) || Math.abs(clamped) <= SLEEP_CORRELATION_WEAK_THRESHOLD) {
    return {
      strength: "no_clear_relationship",
      samples: n,
      r: Number.isFinite(clamped) ? clamped : null,
      summary:
        "Your recent data does not show a clear relationship between sleep and readiness yet.",
    };
  }
  return clamped > 0
    ? {
        strength: "higher_sleep_higher_readiness",
        samples: n,
        r: clamped,
        summary:
          "On days after longer reported sleep, your readiness scores have tended to be higher.",
      }
    : {
        strength: "higher_sleep_lower_readiness",
        samples: n,
        r: clamped,
        summary:
          "On days after longer reported sleep, your readiness scores have tended to be lower.",
      };
}

// ── Phase 7 — weekly recovery intelligence (pure + deterministic) ───────────
//
// The weekly digest, its readiness trend and the Rest-Day alert all derive from
// the SAME canonical server days the Overview/History already use
// (svj_list_my_recovery_history → RecoveryHistoryPoint). Nothing is invented:
// a missing day is never a 0, missing sleep is never 0 hours, and a metric that
// cannot be supported from real rows is omitted rather than guessed.

export const VALID_LOAD_BANDS: readonly LoadBand[] = ["low", "moderate", "high", "very_high"];

/** The digest window: the latest seven canonical server days. */
export const WEEKLY_DIGEST_DAYS = 7;

/** Fewer scored days than this and no trend is claimed (tiny-sample guard). */
export const READINESS_TREND_MIN_DAYS = 4;

/** |recent − earlier| ≤ this many points is reported as "stable". */
export const READINESS_TREND_STABLE_BAND = 3;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The last `days` REAL server days, oldest → newest, by canonical server date.
 * Rows without a valid server day key are dropped (never repositioned), so the
 * window can only ever contain days the server actually returned.
 */
function canonicalWindow<T extends { date: string }>(serverDays: T[], days: number): T[] {
  if (!Array.isArray(serverDays)) return [];
  return serverDays
    .filter((row) => !!row && typeof row.date === "string" && DAY_KEY.test(row.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-Math.max(1, days));
}

/** Whole calendar days from `start` to `end` inclusive, from their own parts. */
function daySpanInclusive(start: string, end: string): number {
  const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
  const [sy, sm, sd] = parts(start);
  const [ey, em, ed] = parts(end);
  const from = Date.UTC(sy, sm - 1, sd);
  const to = Date.UTC(ey, em - 1, ed);
  const span = Math.round((to - from) / 86_400_000) + 1;
  return Number.isFinite(span) && span > 0 ? span : 1;
}

// ── Server readiness → the shared ReadinessResult shape ─────────────────────

/**
 * The structural shape svj_get_my_readiness returns (see ../lib/recovery).
 * Declared locally so this module never has to import the network client.
 */
export interface ServerReadinessLike {
  score: number;
  trainingLoad?: string;
  recovery?: string;
  todayAdvice?: string;
  components?: {
    loadPoints7d?: number;
    loadBand?: string;
    restDaysLast3?: number | null;
    loadPenalty?: number;
    dataSources?: string[];
  } | null;
}

/**
 * Adapt the SERVER readiness snapshot to the canonical ReadinessResult so MY
 * SVJ PLAN can reuse todaysFocus instead of inventing its own thresholds.
 *
 * Honest limits (documented, never papered over): the server cannot see the
 * local task-completion ledger, so taskLoadPoints is 0 here — this is the
 * activity-only reading, and the Recovery destination's combined reading stays
 * the authority. A non-finite score becomes 0; a missing band falls back to
 * the load points' band rather than a guessed band.
 */
export function readinessFromServer(raw: ServerReadinessLike): ReadinessResult {
  const components = raw.components ?? {};
  const load = Math.max(0, Number(components.loadPoints7d) || 0);
  const declared = String(components.loadBand ?? raw.trainingLoad ?? "");
  const band = (VALID_LOAD_BANDS as readonly string[]).includes(declared)
    ? (declared as LoadBand)
    : bandForLoad(load);
  const score = Number.isFinite(raw.score) ? Math.max(0, Math.min(100, Math.round(raw.score))) : 0;
  const restDays =
    typeof components.restDaysLast3 === "number" && Number.isFinite(components.restDaysLast3)
      ? Math.max(0, Math.round(components.restDaysLast3))
      : null;
  return {
    score,
    band,
    recovery: gradeForScore(score),
    components: {
      activityLoadPoints: load,
      taskLoadPoints: 0,
      totalLoadPoints: load,
      loadPenalty: Math.max(0, Number(components.loadPenalty) || 0),
      taskCount: 0,
      restDaysLast3: restDays,
      sources: Array.isArray(components.dataSources) ? components.dataSources : [],
    },
    advice: readinessAdvice(score),
    isLow: score < LOW_READINESS_THRESHOLD,
  };
}

// ── Readiness trend ─────────────────────────────────────────────────────────

export type ReadinessTrendDirection = "improving" | "stable" | "declining" | "insufficient_data";

export interface ReadinessTrend {
  direction: ReadinessTrendDirection;
  /** Scored days actually compared. */
  samples: number;
  /** Mean of the earlier half of the window (rounded); null when insufficient. */
  earlierAvg: number | null;
  /** Mean of the more recent half of the window (rounded); null when insufficient. */
  recentAvg: number | null;
  /** recentAvg − earlierAvg, one decimal; null when insufficient. */
  delta: number | null;
}

/**
 * Deterministic trend over the window's REAL readiness rows, gaps ignored
 * (never filled with 0). Rule, exactly:
 *  - take the finite scores of the last `days` canonical server days, oldest →
 *    newest;
 *  - fewer than READINESS_TREND_MIN_DAYS scored days → insufficient_data;
 *  - split in half (earlier = first floor(n/2), recent = the rest) and compare
 *    their means;
 *  - delta > +READINESS_TREND_STABLE_BAND → improving; delta < −band →
 *    declining; otherwise stable. A tiny/noisy change therefore stays stable
 *    and never becomes a claim.
 */
export function readinessTrendDirection(
  serverDays: { date: string; score: number }[],
  days = WEEKLY_DIGEST_DAYS,
): ReadinessTrend {
  const scores = canonicalWindow(serverDays, days)
    .map((row) => row.score)
    .filter((score) => typeof score === "number" && Number.isFinite(score));

  if (scores.length < READINESS_TREND_MIN_DAYS) {
    return {
      direction: "insufficient_data",
      samples: scores.length,
      earlierAvg: null,
      recentAvg: null,
      delta: null,
    };
  }

  const half = Math.floor(scores.length / 2);
  const earlier = scores.slice(0, half);
  const recent = scores.slice(half);
  const earlierAvg = earlier.reduce((sum, s) => sum + s, 0) / earlier.length;
  const recentAvg = recent.reduce((sum, s) => sum + s, 0) / recent.length;
  const delta = recentAvg - earlierAvg;
  const direction: ReadinessTrendDirection =
    delta > READINESS_TREND_STABLE_BAND
      ? "improving"
      : delta < -READINESS_TREND_STABLE_BAND
        ? "declining"
        : "stable";

  return {
    direction,
    samples: scores.length,
    earlierAvg: Math.round(earlierAvg),
    recentAvg: Math.round(recentAvg),
    delta: Math.round(delta * 10) / 10,
  };
}

// ── Weekly recovery digest ──────────────────────────────────────────────────

export type DigestState = "complete" | "partial" | "insufficient";

export interface WeeklyRecoveryDigest {
  /** Data sufficiency of the window (a failed read is handled by the caller). */
  state: DigestState;
  /** Calendar days covered by the window (1–7), 0 when there is no data. */
  windowDays: number;
  windowStart: string | null;
  windowEnd: string | null;
  /** Server days that carry a finite readiness score. */
  readinessDays: number;
  /** Mean readiness over the real rows, rounded; null when none. */
  averageReadiness: number | null;
  trend: ReadinessTrend;
  /** Days in the window with a real stored check-in. */
  checkinDays: number;
  /** Days in the window with a reported sleep value > 0. */
  sleepDays: number;
  /** Newest row's rest-day count (last 3 days), or null when not reported. */
  restDaysLast3: number | null;
  /** Newest row's load band, or null when not reported. */
  loadBand: LoadBand | null;
}

const EMPTY_TREND: ReadinessTrend = {
  direction: "insufficient_data",
  samples: 0,
  earlierAvg: null,
  recentAvg: null,
  delta: null,
};

/**
 * Build the weekly digest from the canonical server days.
 *
 * State rule: 0 scored days → insufficient; a full `days` of scored days →
 * complete; anything in between → partial. "unavailable" is never returned
 * here — that is the caller's read-failure state, kept separate so a transient
 * error can never masquerade as "no data". Every metric is derived from a real
 * row; a metric with no supporting rows is null/0 and the UI omits it.
 */
export function buildWeeklyRecoveryDigest(
  serverDays: RecoveryHistoryPoint[],
  days = WEEKLY_DIGEST_DAYS,
): WeeklyRecoveryDigest {
  const window = canonicalWindow(serverDays, days);
  if (window.length === 0) {
    return {
      state: "insufficient",
      windowDays: 0,
      windowStart: null,
      windowEnd: null,
      readinessDays: 0,
      averageReadiness: null,
      trend: EMPTY_TREND,
      checkinDays: 0,
      sleepDays: 0,
      restDaysLast3: null,
      loadBand: null,
    };
  }

  const scores = window
    .map((row) => row.score)
    .filter((score) => typeof score === "number" && Number.isFinite(score));
  const readinessDays = scores.length;
  const averageReadiness = readinessDays
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / readinessDays)
    : null;
  const checkinDays = window.filter((row) => row.hasCheckin === true).length;
  const sleepDays = window.filter(
    (row) =>
      typeof row.sleepHours === "number" && Number.isFinite(row.sleepHours) && row.sleepHours > 0,
  ).length;

  const newest = window[window.length - 1];
  const restDaysLast3 =
    typeof newest.restDaysLast3 === "number" && Number.isFinite(newest.restDaysLast3)
      ? Math.max(0, Math.round(newest.restDaysLast3))
      : null;
  const declaredBand = String(newest.trainingLoad ?? "");
  const loadBand = (VALID_LOAD_BANDS as readonly string[]).includes(declaredBand)
    ? (declaredBand as LoadBand)
    : null;

  const state: DigestState =
    readinessDays === 0 ? "insufficient" : readinessDays >= days ? "complete" : "partial";

  return {
    state,
    windowDays: daySpanInclusive(window[0].date, newest.date),
    windowStart: window[0].date,
    windowEnd: newest.date,
    readinessDays,
    averageReadiness,
    trend: readinessTrendDirection(window, days),
    checkinDays,
    sleepDays,
    restDaysLast3,
    loadBand,
  };
}

/** Non-colour trend wording (the text equivalent of the trend indicator). */
export function digestTrendSentence(trend: ReadinessTrend): string {
  switch (trend.direction) {
    case "improving":
      return "Your readiness has been trending upward across the last few recorded days.";
    case "declining":
      return "Your readiness has been trending downward across the last few recorded days.";
    case "stable":
      return "Your readiness has been holding steady across the last few recorded days.";
    case "insufficient_data":
      return "There are not enough recorded days this week to call a trend yet.";
  }
}

// ── Rest-Day alert ──────────────────────────────────────────────────────────

export interface RestDayAlert {
  active: boolean;
  headline: string;
  /** Concise, real evidence — only factors actually available are included. */
  evidence: string[];
  /** General recovery suggestion (never a medical or deficiency claim). */
  suggestion: string;
}

/**
 * The Rest-Day alert is active ONLY when the single authoritative emphasis is
 * "rest" — it consumes readinessEmphasis, so the threshold is never copied.
 * Evidence is drawn only from the real readiness components: the score, the
 * load band when it is genuinely high, and an actually-zero rest count.
 */
export function restDayAlert(readiness: ReadinessResult): RestDayAlert {
  if (readinessEmphasis(readiness) !== "rest") {
    return { active: false, headline: "", evidence: [], suggestion: "" };
  }

  const score = readiness.score;
  const band = readiness.band;
  const restDays = readiness.components.restDaysLast3;

  const evidence: string[] = [`Readiness is ${score} today.`];
  if (band === "high" || band === "very_high") {
    evidence.push(
      `Your recent training load is ${band === "very_high" ? "very high" : "high"} relative to your recovery.`,
    );
  }
  if (restDays === 0) {
    evidence.push("You have not recorded a rest day in the last 3 days.");
  }

  return {
    active: true,
    headline: "Take a recovery-focused day",
    evidence,
    suggestion: "Prioritise sleep, hydration, mobility and low-intensity movement.",
  };
}
