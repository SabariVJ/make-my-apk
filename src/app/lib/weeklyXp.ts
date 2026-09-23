/**
 * Weekly XP chart data — real per-day XP from the profile's xpHistory,
 * bucketed into the current Monday–Sunday week. Pure, no side effects.
 */

export interface DayXpPoint {
  /** Short weekday label, e.g. "Mon". */
  day: string;
  /** Real XP earned that day (0 when no activity was recorded). */
  xp: number;
  /** ISO day key (YYYY-MM-DD) for the bucket. */
  dayKey: string;
  /** True for today's bucket. */
  isToday: boolean;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Build the 7-day (Mon–Sun) view of the CURRENT week from real xpHistory
 * entries. Only entries whose dayKey falls inside this week contribute;
 * previous weeks are ignored entirely, so the chart resets to all-zero at
 * the start of each new week.
 */
export function getCurrentWeekXp(
  xpHistory: { date: string; dayKey?: string; xp: number }[],
  now: Date = new Date(),
): DayXpPoint[] {
  // Monday 00:00 of the current week.
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const byDayKey = new Map<string, number>();
  for (const entry of xpHistory) {
    if (!entry || typeof entry.xp !== "number" || !Number.isFinite(entry.xp)) continue;
    const key = entry.dayKey ?? isoDayKey(new Date(entry.date));
    if (Number.isFinite(new Date(key).getTime()) === false && !entry.dayKey) continue;
    // Day-key match is authoritative; legacy entries without dayKey are
    // parsed from their display date ("25 Jul") which lacks a year — accept
    // only exact key matches to avoid misassigning old data into this week.
    if (entry.dayKey) byDayKey.set(entry.dayKey, Math.max(0, entry.xp));
  }

  return WEEKDAYS.map((day, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const key = isoDayKey(d);
    return { day, dayKey: key, xp: byDayKey.get(key) ?? 0, isToday: key === isoDayKey(now) };
  });
}

/** Real average XP/day across the current week (0 when no XP earned yet). */
export function getWeekAverageXp(week: DayXpPoint[]): number {
  const total = week.reduce((sum, d) => sum + d.xp, 0);
  return Math.round(total / 7);
}
