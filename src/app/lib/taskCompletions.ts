/**
 * Task completion ledger.
 *
 * Every task completion is stored as a ROW — not a boolean — capturing the
 * exact XP and stat points that were granted at the moment of completion:
 *
 *   { challengeId, dayKey, completedAt, xpAwarded, statCategory, statPoints }
 *
 * That makes completion a true toggle for TODAY's tasks:
 *   * uncheck → the stored xpAwarded is subtracted from daily/lifetime XP and
 *     the stored statPoints are subtracted from the matching Character Matrix
 *     stat;
 *   * re-check → the SAME stored xpAwarded/statPoints are reused, so toggling
 *     can never re-roll a payout or farm XP.
 *
 * Derived figures (Character Matrix stats, Total Completed, Habit Consistency,
 * the per-day XP total and the streak threshold) are live sums over the rows
 * that are currently completed — never counters that only go up.
 *
 * This module is pure: no React, no storage, no network.
 */
import type { ChallengeCategory, UserStats } from "../types";
import { getChallengeStat } from "./activity";

/** Active completions needed for a day to count toward the streak. */
export const STREAK_MIN_TASKS_PER_DAY = 1;

/** Stat points granted per task completion (matches the historical +3). */
export const STAT_POINTS_PER_TASK = 3;

/** Rolling window used by Habit Consistency. */
export const HABIT_WINDOW_DAYS = 30;

export interface TaskCompletion {
  id: string;
  challengeId: string;
  title: string;
  category: ChallengeCategory;
  /** Local calendar day (YYYY-MM-DD) the completion belongs to. */
  dayKey: string;
  /** ISO timestamp of the first completion (never rewritten by a re-check). */
  completedAt: string;
  /** Exact XP granted when this row was completed. */
  xpAwarded: number;
  statCategory: keyof UserStats;
  /** Exact stat points granted when this row was completed. */
  statPoints: number;
  /** ISO timestamp of the most recent uncheck, cleared on re-check. */
  undoneAt?: string;
  /** ISO timestamp of a re-check (row reused, payout unchanged). */
  recompletedAt?: string;
}

export interface CompletionBaseline {
  /** Character Matrix stats as they were before this ledger's rows. */
  stats: UserStats;
  /** Lifetime completed-task count as it was before this ledger's rows. */
  totalCompleted: number;
}

export interface CompletionLedger {
  rows: TaskCompletion[];
  baseline: CompletionBaseline;
  /**
   * Ledger stat points already applied to the profile's stats. Reconciliation
   * (desired − applied) keeps stats a live sum over completed rows WITHOUT
   * discarding stat points earned outside the ledger (workouts, meals, …).
   */
  appliedPoints?: Record<keyof UserStats, number>;
}

const STAT_KEYS: (keyof UserStats)[] = [
  "physical",
  "social",
  "discipline",
  "mental",
  "intellect",
  "ambition",
];

const clampStat = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Local (device timezone) calendar day key, YYYY-MM-DD. */
export function localDayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function parseDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function dayKeyForIso(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : localDayKey(d);
}

export function createLedger(baseline: CompletionBaseline): CompletionLedger {
  return {
    rows: [],
    baseline: { stats: { ...baseline.stats }, totalCompleted: baseline.totalCompleted },
    appliedPoints: Object.fromEntries(STAT_KEYS.map((key) => [key, 0])) as Record<
      keyof UserStats,
      number
    >,
  };
}

/** Defensive load: drops malformed rows, keeps valid history. */
export function normalizeLedger(raw: unknown, fallback: CompletionBaseline): CompletionLedger {
  const value = (raw ?? {}) as Partial<CompletionLedger>;
  const rows = Array.isArray(value.rows)
    ? value.rows.filter(
        (row): row is TaskCompletion =>
          !!row &&
          typeof row.challengeId === "string" &&
          typeof row.dayKey === "string" &&
          typeof row.xpAwarded === "number" &&
          Number.isFinite(row.xpAwarded) &&
          STAT_KEYS.includes(row.statCategory as keyof UserStats),
      )
    : [];
  const stats = value.baseline?.stats;
  const baseline: CompletionBaseline = {
    stats:
      stats && typeof stats === "object"
        ? (Object.fromEntries(
            STAT_KEYS.map((key) => [key, clampStat(Number(stats[key]) || 0)]),
          ) as unknown as UserStats)
        : { ...fallback.stats },
    totalCompleted: Math.max(
      0,
      Math.round(Number(value.baseline?.totalCompleted ?? fallback.totalCompleted) || 0),
    ),
  };
  const appliedSource = value.appliedPoints;
  const appliedPoints =
    appliedSource && typeof appliedSource === "object"
      ? (Object.fromEntries(
          STAT_KEYS.map((key) => [key, Math.max(0, Math.round(Number(appliedSource[key]) || 0))]),
        ) as unknown as Record<keyof UserStats, number>)
      : undefined;
  return { rows, baseline, appliedPoints };
}

/** Rows that are currently completed (not unchecked). */
export function activeRows(ledger: CompletionLedger): TaskCompletion[] {
  return ledger.rows.filter((row) => !row.undoneAt);
}

/** Active completion rows for one day. */
/**
 * Difference between the ledger's current stat sums and what was already
 * applied to the profile. Applying this delta makes `stats` exactly
 * `baseline + currently-completed rows` for ledger contributions, while
 * leaving every non-ledger contribution untouched.
 */
export function reconcileStatPoints(ledger: CompletionLedger): {
  delta: Partial<UserStats>;
  applied: Record<keyof UserStats, number>;
} {
  const desired = statPointTotals(ledger);
  const previous = (ledger.appliedPoints ?? desired) as Record<keyof UserStats, number>;
  const delta: Partial<UserStats> = {};
  for (const key of STAT_KEYS) {
    const change = desired[key] - (Number(previous[key]) || 0);
    if (change !== 0) delta[key] = change;
  }
  return { delta, applied: desired };
}

export function activeRowsForDay(ledger: CompletionLedger, dayKey: string): TaskCompletion[] {
  return activeRows(ledger).filter((row) => row.dayKey === dayKey);
}

/** Latest row for a task+day, whether or not it is currently completed. */
export function findRow(
  ledger: CompletionLedger,
  challengeId: string,
  dayKey: string,
): TaskCompletion | undefined {
  for (let i = ledger.rows.length - 1; i >= 0; i -= 1) {
    const row = ledger.rows[i];
    if (row.challengeId === challengeId && row.dayKey === dayKey) return row;
  }
  return undefined;
}

/** Active completion for a task+day, if any. */
export function findActiveRow(
  ledger: CompletionLedger,
  challengeId: string,
  dayKey: string,
): TaskCompletion | undefined {
  const row = findRow(ledger, challengeId, dayKey);
  return row && !row.undoneAt ? row : undefined;
}

/** Sum of XP from the rows currently completed on a given day. */
export function dayXpTotal(ledger: CompletionLedger, dayKey: string): number {
  return activeRowsForDay(ledger, dayKey).reduce((sum, row) => sum + Math.max(0, row.xpAwarded), 0);
}

/** Stat points contributed by the rows currently completed (per attribute). */
export function statPointTotals(ledger: CompletionLedger): Record<keyof UserStats, number> {
  const totals = Object.fromEntries(STAT_KEYS.map((key) => [key, 0])) as Record<
    keyof UserStats,
    number
  >;
  for (const row of activeRows(ledger)) {
    totals[row.statCategory] += Math.max(0, row.statPoints);
  }
  return totals;
}

/** Character Matrix stats as a live sum: baseline + currently-completed rows. */
export function deriveStats(ledger: CompletionLedger): UserStats {
  const totals = statPointTotals(ledger);
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, clampStat(ledger.baseline.stats[key] + totals[key])]),
  ) as unknown as UserStats;
}

/** Lifetime completed tasks as a live sum: baseline + currently-completed rows. */
export function deriveTotalCompleted(ledger: CompletionLedger): number {
  return Math.max(0, ledger.baseline.totalCompleted + activeRows(ledger).length);
}

/**
 * Habit Consistency: percentage of the rolling window in which at least one
 * task was completed. Derived from the rows themselves, so unchecking today's
 * only task lowers it again.
 */
export function deriveHabitCompletionRate(
  ledger: CompletionLedger,
  daysActive: number,
  now: Date = new Date(),
): number {
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (HABIT_WINDOW_DAYS - 1));
  const knownDays = new Set(
    activeRows(ledger)
      .filter((row) => row.dayKey >= localDayKey(windowStart))
      .map((row) => row.dayKey),
  );
  // Denominator: days the account has been active, capped to the window.
  const tracked = Math.min(HABIT_WINDOW_DAYS, Math.max(1, Math.round(daysActive) || 1));
  return Math.max(0, Math.min(100, Math.round((knownDays.size / tracked) * 100)));
}

export interface ToggleTaskInput {
  id: string;
  title: string;
  category: ChallengeCategory;
  completed: boolean;
  xp: number;
  earnedXP?: number;
  completedAt?: string;
}

export type ToggleTaskResult =
  | { ok: false; error: string }
  | {
      ok: true;
      ledger: CompletionLedger;
      action: "complete" | "uncomplete";
      row: TaskCompletion;
      /** Signed XP change to apply (positive when completing). */
      xpDelta: number;
      /** Signed stat change to apply (positive when completing). */
      statDelta: Partial<UserStats>;
      /** Signed streak change (only when the day crosses the threshold). */
      streakDelta: number;
      /** True when an existing row's payout was reused instead of re-rolled. */
      reused: boolean;
      dayCountBefore: number;
      dayCountAfter: number;
    };

/**
 * Apply a completion toggle for one task.
 *
 * `now` determines TODAY: only completions whose dayKey is today can be
 * unchecked; rows from earlier days are read-only history.
 */
export function toggleTaskCompletion(
  ledger: CompletionLedger,
  challenge: ToggleTaskInput,
  options: { now?: Date; newId?: () => string } = {},
): ToggleTaskResult {
  const now = options.now ?? new Date();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const today = localDayKey(now);
  const dayCountBefore = activeRowsForDay(ledger, today).length;

  if (challenge.completed) {
    const row = findActiveRow(ledger, challenge.id, today);
    if (!row) {
      // No row for today: either it was completed on an earlier day, or it was
      // completed before this ledger existed. Both are locked history — we
      // cannot reverse a payout we never recorded.
      const completedDay = challenge.completedAt ? dayKeyForIso(challenge.completedAt) : null;
      const past = !!completedDay && completedDay !== today;
      return {
        ok: false,
        error: past
          ? "Past days are locked. Only today's tasks can be undone."
          : "This task was completed before undo tracking started, so its XP can't be reversed.",
      };
    }

    const rows = ledger.rows.map((candidate) =>
      candidate.id === row.id ? { ...candidate, undoneAt: now.toISOString() } : candidate,
    );
    const next: CompletionLedger = { ...ledger, rows };
    const dayCountAfter = activeRowsForDay(next, today).length;
    const reconciled = reconcileStatPoints(next);
    next.appliedPoints = reconciled.applied;

    return {
      ok: true,
      ledger: next,
      action: "uncomplete",
      row: { ...row, undoneAt: now.toISOString() },
      xpDelta: -Math.max(0, row.xpAwarded),
      statDelta: reconciled.delta,
      streakDelta:
        dayCountBefore >= STREAK_MIN_TASKS_PER_DAY && dayCountAfter < STREAK_MIN_TASKS_PER_DAY
          ? -1
          : 0,
      reused: false,
      dayCountBefore,
      dayCountAfter,
    };
  }

  // Completing (or re-completing) today's task.
  const existing = findRow(ledger, challenge.id, today);
  if (existing) {
    // Reuse the ORIGINAL payout — toggling must never re-roll XP or stats.
    const revived: TaskCompletion = {
      ...existing,
      undoneAt: undefined,
      recompletedAt: now.toISOString(),
    };
    const rows = ledger.rows.map((row) => (row.id === existing.id ? revived : row));
    const next: CompletionLedger = { ...ledger, rows };
    const dayCountAfter = activeRowsForDay(next, today).length;
    const reconciled = reconcileStatPoints(next);
    next.appliedPoints = reconciled.applied;
    return {
      ok: true,
      ledger: next,
      action: "complete",
      row: revived,
      xpDelta: Math.max(0, revived.xpAwarded),
      statDelta: reconciled.delta,
      streakDelta:
        dayCountBefore < STREAK_MIN_TASKS_PER_DAY && dayCountAfter >= STREAK_MIN_TASKS_PER_DAY
          ? 1
          : 0,
      reused: true,
      dayCountBefore,
      dayCountAfter,
    };
  }

  const xpAwarded = Math.max(0, Math.round(Number(challenge.earnedXP ?? challenge.xp) || 0));
  const statCategory = getChallengeStat(challenge.category);
  const row: TaskCompletion = {
    id: newId(),
    challengeId: challenge.id,
    title: challenge.title,
    category: challenge.category,
    dayKey: today,
    completedAt: now.toISOString(),
    xpAwarded,
    statCategory,
    statPoints: STAT_POINTS_PER_TASK,
  };
  const next: CompletionLedger = { ...ledger, rows: [...ledger.rows, row] };
  const dayCountAfter = activeRowsForDay(next, today).length;
  const reconciled = reconcileStatPoints(next);
  next.appliedPoints = reconciled.applied;

  return {
    ok: true,
    ledger: next,
    action: "complete",
    row,
    xpDelta: xpAwarded,
    statDelta: reconciled.delta,
    streakDelta:
      dayCountBefore < STREAK_MIN_TASKS_PER_DAY && dayCountAfter >= STREAK_MIN_TASKS_PER_DAY
        ? 1
        : 0,
    reused: false,
    dayCountBefore,
    dayCountAfter,
  };
}

/** True when this completion belongs to today (device-local calendar day). */
export function isToday(dayKey: string, now: Date = new Date()): boolean {
  return dayKey === localDayKey(now);
}

/** Order helpers used by the UI to bucket rows by day. */
export function dayKeysForRows(rows: TaskCompletion[]): string[] {
  return [...new Set(rows.map((row) => row.dayKey))].sort();
}

export { parseDayKey };
