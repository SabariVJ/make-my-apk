// ============================================================================
// SVJ time picker — app-controlled dark hour/minute dialog.
//
// Same root cause as SVJDatePicker: Android WebView/Capacitor delegates a native
// HTML time field to the platform TimePicker dialog, which is themed by Android
// rather than by the web UI and therefore appears as a white overlay with a
// dimmed app behind it, material-blue controls and displaced SET/CANCEL. CSS
// cannot reach it.
//
// This primitive keeps the interaction inside React: a dark centered dialog
// with scrollable hour and minute columns, explicit Cancel/Set, keyboard a11y
// (Escape cancels, arrow keys move the highlighted value, Enter/Space selects),
// and a 24-hour display so the stored value is never ambiguous. Minutes are
// listed individually so an existing off-grid value (e.g. 07:23) survives an
// edit unchanged.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import {
  HOURS,
  MINUTES,
  formatTimeLabel,
  parseTimeValue,
  toTimeValue,
  type TimeValue,
} from "./timePickerUtils";

export interface SVJTimePickerProps {
  /** Accessible name; also the visible field label. */
  label: string;
  /** Current value as `HH:MM`; empty string means "nothing selected yet". */
  value: string;
  /** Fired only when the user confirms a time (Set), never on Cancel. */
  onChange: (value: TimeValue) => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export function SVJTimePicker({
  label,
  value,
  onChange,
  disabled = false,
  className,
  testId,
}: SVJTimePickerProps) {
  const [open, setOpen] = useState(false);
  const display = formatTimeLabel(value);

  const [draftHour, setDraftHour] = useState("00");
  const [draftMinute, setDraftMinute] = useState("00");

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);

  const draftValue = useMemo(() => toTimeValue(draftHour, draftMinute), [draftHour, draftMinute]);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openDialog = useCallback(() => {
    const seed = parseTimeValue(value) ?? { hour: "00", minute: "00" };
    setDraftHour(seed.hour);
    setDraftMinute(seed.minute);
    setOpen(true);
  }, [value]);

  // Focus the dialog on open, trap Tab, and dismiss on Escape / outside tap.
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.focus();

    // Bring the selected hour/minute into view without scrolling the page.
    requestAnimationFrame(() => {
      for (const [ref, selected] of [
        [hourRef, draftHour],
        [minuteRef, draftMinute],
      ] as const) {
        const target = ref.current?.querySelector<HTMLElement>(`[data-value="${selected}"]`);
        target?.scrollIntoView({ block: "center" });
      }
    });

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
  }, [close, draftHour, draftMinute, open]);

  /** Moves the draft within a column, stepping by day-equivalent rows. */
  const shift = (part: "hour" | "minute", delta: number) => {
    const [setter, list, current] =
      part === "hour"
        ? ([setDraftHour, HOURS, draftHour] as const)
        : ([setDraftMinute, MINUTES, draftMinute] as const);
    const index = list.indexOf(current);
    const next = Math.min(list.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta));
    setter(list[next]);
    const target = (part === "hour" ? hourRef : minuteRef).current?.querySelector<HTMLElement>(
      `[data-value="${list[next]}"]`,
    );
    target?.focus();
  };

  const confirm = () => {
    onChange(draftValue);
    close(true);
  };

  const columnKeyDown = (part: "hour" | "minute") => (event: React.KeyboardEvent) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      shift(part, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      shift(part, 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      shift(part, -60);
    } else if (event.key === "End") {
      event.preventDefault();
      shift(part, 60);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${display || "no time selected"}`}
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
            {display || "Select a time"}
          </span>
        </span>
        <Clock className="h-4 w-4 shrink-0 text-[#8C8C90]" aria-hidden />
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
            className="flex max-h-[85vh] w-full max-w-xs flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17171A] shadow-2xl shadow-black/70 outline-none"
          >
            <div className="shrink-0 border-b border-white/5 px-3 py-2.5 text-center">
              <p className="text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]">
                {label}
              </p>
              <p
                aria-live="polite"
                className="font-anton text-2xl uppercase tracking-wide text-[#F4F2ED]"
              >
                {draftValue}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="pb-1 text-center text-[10px] font-mono uppercase text-[#8C8C90]">
                    Hour
                  </p>
                  <div
                    ref={hourRef}
                    role="listbox"
                    aria-label={`${label} hour`}
                    tabIndex={-1}
                    onKeyDown={columnKeyDown("hour")}
                    className="max-h-56 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-1"
                  >
                    {HOURS.map((hour) => (
                      <button
                        key={hour}
                        type="button"
                        role="option"
                        aria-selected={draftHour === hour}
                        data-value={hour}
                        data-testid={testId ? `${testId}-hour-${hour}` : undefined}
                        onClick={() => setDraftHour(hour)}
                        className={`flex min-h-[40px] w-full items-center justify-center rounded-2xl font-mono text-xs ${
                          draftHour === hour
                            ? "bg-[#C81E3A]/25 font-bold text-white ring-2 ring-[#E62846]"
                            : "text-[#B8B8C0] hover:bg-white/[0.06]"
                        }`}
                      >
                        {hour}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="pb-1 text-center text-[10px] font-mono uppercase text-[#8C8C90]">
                    Minute
                  </p>
                  <div
                    ref={minuteRef}
                    role="listbox"
                    aria-label={`${label} minute`}
                    tabIndex={-1}
                    onKeyDown={columnKeyDown("minute")}
                    className="max-h-56 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-1"
                  >
                    {MINUTES.map((minute) => (
                      <button
                        key={minute}
                        type="button"
                        role="option"
                        aria-selected={draftMinute === minute}
                        data-value={minute}
                        data-testid={testId ? `${testId}-minute-${minute}` : undefined}
                        onClick={() => setDraftMinute(minute)}
                        className={`flex min-h-[40px] w-full items-center justify-center rounded-2xl font-mono text-xs ${
                          draftMinute === minute
                            ? "bg-[#C81E3A]/25 font-bold text-white ring-2 ring-[#E62846]"
                            : "text-[#B8B8C0] hover:bg-white/[0.06]"
                        }`}
                      >
                        {minute}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
                data-testid={testId ? `${testId}-confirm` : undefined}
                onClick={confirm}
                className="min-h-[44px] rounded-lg bg-[#C81E3A] px-4 text-[11px] font-anton uppercase tracking-wider text-white hover:bg-[#A0182E]"
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
