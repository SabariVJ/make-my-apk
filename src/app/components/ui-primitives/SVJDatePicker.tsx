// ============================================================================
// SVJ date picker — app-controlled dark calendar dialog.
//
// Android WebView/Capacitor delegates a native HTML date field straight to the
// platform DatePicker dialog. That dialog is themed by the *Android* theme, not
// by the web UI, so it appears as a giant white sheet with a dimmed app
// behind it, small blue controls, a floating date value and displaced
// SET/CANCEL buttons — completely at odds with the dark SVJ palette, and it
// ignores web sizing/max-width entirely. There is no CSS that can theme it.
//
// This primitive replaces that interaction with an in-app dark dialog rendered
// in the React tree (no native bridge): readable text, centered, viewport-safe
// width, capped height with internal scrolling, Cancel + Set, keyboard
// a11y (Escape cancels, arrow keys move days, Enter/Space selects, Tab is
// trapped), and selection communicated by ring + weight + aria-selected rather
// than by color alone.
//
// All date maths is done with local Y/M/D components — never via toISOString —
// so a device in any timezone reads and writes the same calendar day.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  WEEKDAY_LABELS,
  addMonths,
  buildMonthMatrix,
  formatDayLabel,
  formatLongDate,
  isOutsideRange,
  monthLabel,
  parseDateValue,
  todayDateValue,
  toDateValue,
  type CalendarDay,
  type DateValue,
} from "./datePickerUtils";

export interface SVJDatePickerProps {
  /** Accessible name; also the visible field label. */
  label: string;
  /** Current value as `YYYY-MM-DD`; empty string means "nothing selected yet". */
  value: string;
  /** Fired only when the user confirms a day (Set), never on Cancel. */
  onChange: (value: DateValue) => void;
  disabled?: boolean;
  /** Inclusive earliest selectable day (`YYYY-MM-DD`). */
  min?: string;
  /** Inclusive latest selectable day (`YYYY-MM-DD`). */
  max?: string;
  className?: string;
  testId?: string;
}

export function SVJDatePicker({
  label,
  value,
  onChange,
  disabled = false,
  min,
  max,
  className,
  testId,
}: SVJDatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsedValue = useMemo(() => parseDateValue(value), [value]);
  const today = todayDateValue();

  // The month currently on screen, and the day the user has highlighted but not
  // yet confirmed. Both are (re)seeded from `value` every time the dialog opens
  // so Cancel always discards the draft.
  const [view, setView] = useState(() => {
    const seed = parsedValue ?? parseDateValue(today)!;
    return { year: seed.year, month: seed.month };
  });
  const [draft, setDraft] = useState<DateValue>(() => value || "");

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openDialog = useCallback(() => {
    const seed = parseDateValue(value) ?? parseDateValue(todayDateValue())!;
    setView({ year: seed.year, month: seed.month });
    setDraft(value || "");
    setOpen(true);
  }, [value]);

  // Move focus into the dialog on open, and trap Tab inside it while open.
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (node && !node.contains(event.target as Node)) close(true);
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [close, open]);

  const weeks = useMemo(() => buildMonthMatrix(view.year, view.month), [view.year, view.month]);
  const display = formatLongDate(value);

  const shiftMonth = (delta: number) =>
    setView((current) => addMonths(current.year, current.month, delta));

  const confirm = () => {
    if (!draft || isOutsideRange(draft, min, max)) return;
    onChange(draft);
    close(true);
  };

  const selectDay = (cell: CalendarDay) => {
    const cellValue = toDateValue(cell.year, cell.month, cell.day);
    // Out-of-range days are inert: the range is a validation rule, not a hint.
    if (isOutsideRange(cellValue, min, max)) return;
    setDraft(cellValue);
    if (!cell.inMonth) setView({ year: cell.year, month: cell.month });
  };

  const moveFocusByDays = (delta: number) => {
    const start = parseDateValue(draft) ?? parseDateValue(today)!;
    // Step one day at a time so out-of-range days are stepped over rather than
    // selected as the draft.
    const step = delta < 0 ? -1 : 1;
    let cursor = new Date(start.year, start.month, start.day, 12);
    for (let taken = 0; taken < Math.abs(delta); taken += 1) {
      const candidate = new Date(cursor.getTime());
      candidate.setDate(candidate.getDate() + step);
      const candidateValue = toDateValue(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate(),
      );
      if (isOutsideRange(candidateValue, min, max)) break;
      cursor = candidate;
    }
    const nextValue = toDateValue(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    setDraft(nextValue);
    setView({ year: cursor.getFullYear(), month: cursor.getMonth() });
    const target = dialogRef.current?.querySelector<HTMLElement>(
      `[data-day-value="${nextValue}"][data-in-month="true"]`,
    );
    target?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${display || "no date selected"}`}
        data-testid={testId ? `${testId}-trigger` : undefined}
        onClick={() => (open ? close(false) : openDialog())}
        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0B0B0C] px-3 py-2 text-left text-xs hover:border-white/20 disabled:opacity-40 ${
          className ?? ""
        }`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]">
            {label}
          </span>
          <span
            className="truncate font-mono text-[11px] text-white"
            data-testid={testId ? `${testId}-value` : undefined}
          >
            {display || "Select a date"}
          </span>
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#8C8C90]" aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3"
          data-testid={testId ? `${testId}-overlay` : undefined}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            data-testid={testId ? `${testId}-dialog` : undefined}
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17171A] shadow-2xl shadow-black/70 outline-none"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5">
              <button
                type="button"
                aria-label="Previous month"
                data-testid={testId ? `${testId}-prev-month` : undefined}
                onClick={() => shiftMonth(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#B8B8C0] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <p
                aria-live="polite"
                className="font-anton text-sm uppercase tracking-wide text-[#F4F2ED]"
              >
                {monthLabel(view.month)} {view.year}
              </p>
              <button
                type="button"
                aria-label="Next month"
                data-testid={testId ? `${testId}-next-month` : undefined}
                onClick={() => shiftMonth(1)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#B8B8C0] hover:text-white"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto px-3 py-3">
              <div className="grid grid-cols-7 gap-1 pb-1">
                {WEEKDAY_LABELS.map((day, index) => (
                  <span
                    key={`${day}-${index}`}
                    aria-hidden
                    className="text-center text-[10px] font-mono uppercase text-[#8C8C90]"
                  >
                    {day}
                  </span>
                ))}
              </div>
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 gap-1">
                  {week.map((cell) => {
                    const cellValue = toDateValue(cell.year, cell.month, cell.day);
                    const selected = draft === cellValue;
                    const isToday = today === cellValue;
                    const blocked = isOutsideRange(cellValue, min, max);
                    return (
                      <button
                        key={cellValue}
                        type="button"
                        disabled={blocked}
                        aria-selected={selected}
                        aria-disabled={blocked || undefined}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={formatDayLabel(cell.year, cell.month, cell.day)}
                        data-testid={testId ? `${testId}-day-${cellValue}` : undefined}
                        data-day-value={cellValue}
                        data-in-month={cell.inMonth ? "true" : "false"}
                        onClick={() => selectDay(cell)}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowLeft") {
                            event.preventDefault();
                            moveFocusByDays(-1);
                          } else if (event.key === "ArrowRight") {
                            event.preventDefault();
                            moveFocusByDays(1);
                          } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            moveFocusByDays(-7);
                          } else if (event.key === "ArrowDown") {
                            event.preventDefault();
                            moveFocusByDays(7);
                          } else if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectDay(cell);
                          }
                        }}
                        className={`flex min-h-[44px] items-center justify-center rounded-lg text-xs font-mono transition-colors ${
                          cell.inMonth ? "text-[#F4F2ED]" : "text-[#8C8C90]/60"
                        } ${
                          selected
                            ? "bg-[#C81E3A]/25 font-bold ring-2 ring-[#E62846]"
                            : "hover:bg-white/[0.06]"
                        } ${isToday && !selected ? "border border-[#D4AF37]/60" : ""} ${
                          blocked ? "cursor-not-allowed opacity-30" : ""
                        }`}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/5 px-3 py-2.5">
              <button
                type="button"
                data-testid={testId ? `${testId}-cancel` : undefined}
                onClick={() => close(true)}
                className="min-h-[44px] rounded-lg border border-white/10 bg-black/30 px-3 text-[11px] font-inter uppercase tracking-wider text-[#8C8C90] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draft || isOutsideRange(draft, min, max)}
                data-testid={testId ? `${testId}-confirm` : undefined}
                onClick={confirm}
                className="min-h-[44px] rounded-lg bg-[#C81E3A] px-4 text-[11px] font-anton uppercase tracking-wider text-white hover:bg-[#A0182E] disabled:opacity-40"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
