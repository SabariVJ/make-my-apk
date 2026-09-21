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
import type { TaskCompletion } from "./taskCompletions";
import { localDayKey } from "./taskCompletions";

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
    advice:
      score >= 78
        ? "Train normally — push if you feel good."
        : score >= 60
          ? "Train normally."
          : score >= 40
            ? "Light session recommended."
            : "Rest or very light movement today.",
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
export function trailingRecords(history: RecoveryDayRecord[], days = 7): RecoveryDayRecord[] {
  const byDate = new Map(history.map((row) => [row.date, row]));
  return lastNDayKeys(days)
    .reverse()
    .map((date) => byDate.get(date) ?? emptyDayRecord(date));
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
export function readinessTrend(history: RecoveryDayRecord[], days = 7): TrendPoint[] {
  return trailingRecords(history, days).map((row) => {
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
