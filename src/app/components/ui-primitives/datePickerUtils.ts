export type DateValue = string;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDay {
  year: number;
  /** 0-11 */
  month: number;
  day: number;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Serializes local Y/M/D parts into `YYYY-MM-DD` without any timezone shift. */
export function toDateValue(year: number, month: number, day: number): DateValue {
  return `${String(year).padStart(4, "0")}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Parses `YYYY-MM-DD` into local parts, or null when the value is unusable. */
export function parseDateValue(value: string | null | undefined): CalendarDay | null {
  if (!value) return null;
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1) return null;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day > daysInMonth) return null;
  return { year, month, day, inMonth: true };
}

/** Shifts a year/month pair by whole months, normalizing the wrap. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Builds a stable Monday-first 6x7 grid padded with adjacent-month days. */
export function buildMonthMatrix(year: number, month: number): CalendarDay[][] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previous = addMonths(year, month, -1);
  const daysInPrevious = new Date(previous.year, previous.month + 1, 0).getDate();

  const cells: CalendarDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    const offset = index - firstWeekday + 1;
    if (offset < 1) {
      cells.push({
        year: previous.year,
        month: previous.month,
        day: daysInPrevious + offset,
        inMonth: false,
      });
    } else if (offset > daysInMonth) {
      const next = addMonths(year, month, 1);
      cells.push({ year: next.year, month: next.month, day: offset - daysInMonth, inMonth: false });
    } else {
      cells.push({ year, month, day: offset, inMonth: true });
    }
  }

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** Human-readable long date, or an empty string for an invalid calendar day. */
export function formatLongDate(value: string | null | undefined): string {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return new Date(parsed.year, parsed.month, parsed.day, 12).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Accessible label for one calendar-day button. */
export function formatDayLabel(year: number, month: number, day: number): string {
  return new Date(year, month, day, 12).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Today's local calendar day as `YYYY-MM-DD`. */
export function todayDateValue(): DateValue {
  const now = new Date();
  return toDateValue(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True when a value falls outside the inclusive `min`/`max` window. */
export function isOutsideRange(
  value: string | null | undefined,
  min?: string,
  max?: string,
): boolean {
  if (!value) return false;
  if (min && value < min) return true;
  if (max && value > max) return true;
  return false;
}

export function monthLabel(month: number): string {
  return MONTH_LABELS[month] ?? "";
}
