/**
 * Human-friendly date/time display helpers.
 *
 * Raw database timestamps (ISO 8601 with microseconds and a UTC offset) must
 * never reach the UI. Everything user-facing goes through here so every card
 * formats completion state identically, in the device's own timezone.
 */

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDayAndTime(d: Date): string {
  // Day-then-month ordering ("20 Sep") matches the rest of SVJ's date copy.
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${formatTime(d)}`;
}

/**
 * Render a completion timestamp for a task/challenge row.
 *
 * - today      → "Completed · 10:42 AM"
 * - yesterday  → "Yesterday · 10:42 AM"
 * - older      → "20 Sep · 10:42 AM"
 *
 * Returns an empty string for missing/invalid input so callers can simply
 * check truthiness. The stored timestamp itself is never modified.
 */
export function formatCompletedAt(value?: string | null, now: Date = new Date()): string {
  if (!value) return "";
  const d = new Date(value);
  if (!isValidDate(d)) return "";

  if (sameLocalDay(d, now)) return `Completed · ${formatTime(d)}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameLocalDay(d, yesterday)) return `Yesterday · ${formatTime(d)}`;

  return formatDayAndTime(d);
}
