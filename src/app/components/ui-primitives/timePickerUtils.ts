export type TimeValue = string;

export const HOURS: string[] = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
export const MINUTES: string[] = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

/** Parses `HH:MM` (or `HH:MM:SS`) into parts, or null when unusable. */
export function parseTimeValue(value: string | null | undefined): {
  hour: string;
  minute: string;
} | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour: String(hour).padStart(2, "0"), minute: String(minute).padStart(2, "0") };
}

/** Serializes hour/minute into `HH:MM`. */
export function toTimeValue(hour: string, minute: string): TimeValue {
  return `${hour}:${minute}`;
}

/** Readable label for a stored value, or an empty string for invalid input. */
export function formatTimeLabel(value: string | null | undefined): string {
  const parsed = parseTimeValue(value);
  if (!parsed) return "";
  const asDate = new Date(2000, 0, 1, Number(parsed.hour), Number(parsed.minute), 0, 0);
  const twelveHour = asDate.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${parsed.hour}:${parsed.minute} (${twelveHour})`;
}
