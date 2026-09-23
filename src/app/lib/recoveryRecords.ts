// ============================================================================
// Recovery Records (Phase 6) — the pure client model for Recovery → Records.
//
// The SERVER derives every record at read time from canonical recovery history
// (public.svj_readiness_daily + public.svj_recovery_checkins) through
// svj_list_recovery_records(). Nothing in this module computes a record: it
// only names the four record types, normalizes the server envelope and formats
// the derived result for display. There is no client-side record that can be
// created, edited or deleted, and a record that genuinely does not exist is
// never rendered as 0.
//
// Recovery record types live in their OWN group (TRAINING_RECORD_TYPES in
// ./goalsRecords stays Training-only) so a Recovery record can never appear in
// a Training-only list, and vice versa.
// ============================================================================

/** The four Recovery records, in display order. */
export const RECOVERY_RECORD_TYPES = [
  "highest_readiness_score",
  "longest_checkin_streak",
  "longest_ready_streak",
  "best_7d_readiness_average",
] as const;

export type RecoveryRecordType = (typeof RECOVERY_RECORD_TYPES)[number];

export const RECOVERY_RECORD_LABELS: Record<RecoveryRecordType, string> = {
  highest_readiness_score: "Highest Readiness",
  longest_checkin_streak: "Longest Check-in Streak",
  longest_ready_streak: "Longest Ready Streak",
  best_7d_readiness_average: "Best 7-Day Readiness",
};

export interface RecoveryRecordDto {
  recordType: RecoveryRecordType;
  /** Server-derived value: a 0–100 score, a day count, or a 7-day average. */
  value: number;
  /** Anchor day (server calendar date): score day, streak end, window end. */
  achievedDate: string;
  /** First day of a range record (streak or 7-day window); null for a single day. */
  startDate: string | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real ISO calendar date, or null — never a guessed/fabricated day. */
export function isServerDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

/**
 * A local-calendar Date for a server ISO date. The date is built from its own
 * parts, so a stored server day can never shift into the neighbouring day.
 */
function calendarDate(iso: string): Date | null {
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize one server record. A value of 0 is real data and is kept; only
 * structurally broken rows (unknown type, non-finite value, no server date)
 * are dropped, so an unreadable record is never silently rendered as 0 either.
 */
export function normalizeRecoveryRecord(value: unknown): RecoveryRecordDto | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.record_type !== "string" ||
    !(RECOVERY_RECORD_TYPES as readonly string[]).includes(raw.record_type)
  )
    return null;
  if (typeof raw.value !== "number" || !Number.isFinite(raw.value)) return null;
  if (!isServerDate(raw.achieved_date)) return null;
  return {
    recordType: raw.record_type as RecoveryRecordType,
    value: raw.value,
    achievedDate: raw.achieved_date,
    startDate: isServerDate(raw.start_date) ? raw.start_date : null,
  };
}

/** Normalize a whole svj_list_recovery_records envelope. */
export function normalizeRecoveryRecords(envelope: unknown): RecoveryRecordDto[] | null {
  if (!envelope || typeof envelope !== "object") return null;
  const env = envelope as Record<string, unknown>;
  if (env.ok !== true || !Array.isArray(env.records)) return null;
  return env.records
    .map(normalizeRecoveryRecord)
    .filter((record): record is RecoveryRecordDto => record !== null);
}

/** The records present, in the canonical display order. */
export function orderRecoveryRecords(records: readonly RecoveryRecordDto[]): RecoveryRecordDto[] {
  const byType = new Map(records.map((record) => [record.recordType, record]));
  return RECOVERY_RECORD_TYPES.map((type) => byType.get(type)).filter(
    (record): record is RecoveryRecordDto => record !== undefined,
  );
}

// ── Display formatting (the server owns the value, the client owns the copy) ─

/**
 * The record's headline value. Rounding exists only here in the display layer;
 * the server keeps full numeric precision (a 7-day average is SUM(score)/7.0).
 */
export function formatRecoveryRecordValue(recordType: RecoveryRecordType, value: number): string {
  switch (recordType) {
    case "highest_readiness_score":
      return `${Math.round(value)} / 100`;
    case "longest_checkin_streak":
    case "longest_ready_streak": {
      const days = Math.round(value);
      return `${days} ${days === 1 ? "day" : "days"}`;
    }
    case "best_7d_readiness_average":
      return `${Math.round(value)} avg`;
  }
}

/**
 * A screen-reader-friendly reading of the same value — "/ 100" and "avg" are
 * not reliably announced, so readers get words instead.
 */
export function recoveryRecordValueSpoken(recordType: RecoveryRecordType, value: number): string {
  switch (recordType) {
    case "highest_readiness_score":
      return `${Math.round(value)} out of 100`;
    case "longest_checkin_streak":
    case "longest_ready_streak": {
      const days = Math.round(value);
      return `${days} ${days === 1 ? "day" : "days"} in a row`;
    }
    case "best_7d_readiness_average":
      return `${Math.round(value)} average readiness`;
  }
}

/** "10 September 2026" — an explicit locale keeps the label deterministic. */
export function formatRecoveryRecordDate(iso: string): string {
  const date = calendarDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "7–13 September 2026" for a streak or 7-day window. */
export function formatRecoveryRecordRange(startIso: string, endIso: string): string {
  const start = calendarDate(startIso);
  const end = calendarDate(endIso);
  if (!start || !end) return "";
  const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric" });
  const month = (date: Date) => date.toLocaleDateString("en-GB", { month: "long" });
  const monthYear = (date: Date) =>
    date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth())
    return `${day(start)}–${day(end)} ${monthYear(end)}`;
  if (start.getFullYear() === end.getFullYear())
    return `${day(start)} ${month(start)} – ${day(end)} ${monthYear(end)}`;
  return `${day(start)} ${monthYear(start)} – ${day(end)} ${monthYear(end)}`;
}

/** "Achieved 10 September 2026" (single day) or "Ended 13 September 2026". */
export function recoveryRecordDateLabel(record: RecoveryRecordDto): string {
  const date = formatRecoveryRecordDate(record.achievedDate);
  if (!date) return "";
  return record.recordType === "highest_readiness_score" ? `Achieved ${date}` : `Ended ${date}`;
}

/** The covered range for a streak/window record ("7–13 September 2026"), else null. */
export function recoveryRecordRangeLabel(record: RecoveryRecordDto): string | null {
  if (!record.startDate || record.startDate === record.achievedDate) return null;
  const range = formatRecoveryRecordRange(record.startDate, record.achievedDate);
  return range || null;
}
