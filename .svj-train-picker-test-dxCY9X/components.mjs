// src/app/components/ui-primitives/SVJDatePicker.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// src/app/components/ui-primitives/datePickerUtils.ts
var MONTH_LABELS = [
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
  "December"
];
var WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
var ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
function pad2(value) {
  return String(value).padStart(2, "0");
}
function toDateValue(year, month, day) {
  return `${String(year).padStart(4, "0")}-${pad2(month + 1)}-${pad2(day)}`;
}
function parseDateValue(value) {
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
function addMonths(year, month, delta) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: (total % 12 + 12) % 12 };
}
function buildMonthMatrix(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previous = addMonths(year, month, -1);
  const daysInPrevious = new Date(previous.year, previous.month + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const offset = index - firstWeekday + 1;
    if (offset < 1) {
      cells.push({
        year: previous.year,
        month: previous.month,
        day: daysInPrevious + offset,
        inMonth: false
      });
    } else if (offset > daysInMonth) {
      const next = addMonths(year, month, 1);
      cells.push({ year: next.year, month: next.month, day: offset - daysInMonth, inMonth: false });
    } else {
      cells.push({ year, month, day: offset, inMonth: true });
    }
  }
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}
function formatLongDate(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return new Date(parsed.year, parsed.month, parsed.day, 12).toLocaleDateString(void 0, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}
function formatDayLabel(year, month, day) {
  return new Date(year, month, day, 12).toLocaleDateString(void 0, {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}
function todayDateValue() {
  const now = /* @__PURE__ */ new Date();
  return toDateValue(now.getFullYear(), now.getMonth(), now.getDate());
}
function isOutsideRange(value, min, max) {
  if (!value) return false;
  if (min && value < min) return true;
  if (max && value > max) return true;
  return false;
}
function monthLabel(month) {
  return MONTH_LABELS[month] ?? "";
}

// src/app/components/ui-primitives/SVJDatePicker.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function SVJDatePicker({
  label,
  value,
  onChange,
  disabled = false,
  min,
  max,
  className,
  testId
}) {
  const [open, setOpen] = useState(false);
  const parsedValue = useMemo(() => parseDateValue(value), [value]);
  const today = todayDateValue();
  const [view, setView] = useState(() => {
    const seed = parsedValue ?? parseDateValue(today);
    return { year: seed.year, month: seed.month };
  });
  const [draft, setDraft] = useState(() => value || "");
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const close = useCallback((restoreFocus) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);
  const openDialog = useCallback(() => {
    const seed = parseDateValue(value) ?? parseDateValue(todayDateValue());
    setView({ year: seed.year, month: seed.month });
    setDraft(value || "");
    setOpen(true);
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = node.querySelectorAll(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    const onPointerDown = (event) => {
      if (node && !node.contains(event.target)) close(true);
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
  const shiftMonth = (delta) => setView((current) => addMonths(current.year, current.month, delta));
  const confirm = () => {
    if (!draft || isOutsideRange(draft, min, max)) return;
    onChange(draft);
    close(true);
  };
  const selectDay = (cell) => {
    const cellValue = toDateValue(cell.year, cell.month, cell.day);
    if (isOutsideRange(cellValue, min, max)) return;
    setDraft(cellValue);
    if (!cell.inMonth) setView({ year: cell.year, month: cell.month });
  };
  const moveFocusByDays = (delta) => {
    const start = parseDateValue(draft) ?? parseDateValue(today);
    const step = delta < 0 ? -1 : 1;
    let cursor = new Date(start.year, start.month, start.day, 12);
    for (let taken = 0; taken < Math.abs(delta); taken += 1) {
      const candidate = new Date(cursor.getTime());
      candidate.setDate(candidate.getDate() + step);
      const candidateValue = toDateValue(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate()
      );
      if (isOutsideRange(candidateValue, min, max)) break;
      cursor = candidate;
    }
    const nextValue = toDateValue(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    setDraft(nextValue);
    setView({ year: cursor.getFullYear(), month: cursor.getMonth() });
    const target = dialogRef.current?.querySelector(
      `[data-day-value="${nextValue}"][data-in-month="true"]`
    );
    target?.focus();
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        ref: triggerRef,
        type: "button",
        disabled,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "aria-label": `${label}: ${display || "no date selected"}`,
        "data-testid": testId ? `${testId}-trigger` : void 0,
        onClick: () => open ? close(false) : openDialog(),
        className: `flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0B0B0C] px-3 py-2 text-left text-xs hover:border-white/20 disabled:opacity-40 ${className ?? ""}`,
        children: [
          /* @__PURE__ */ jsxs("span", { className: "flex min-w-0 flex-col", children: [
            /* @__PURE__ */ jsx("span", { className: "text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]", children: label }),
            /* @__PURE__ */ jsx(
              "span",
              {
                className: "truncate font-mono text-[11px] text-white",
                "data-testid": testId ? `${testId}-value` : void 0,
                children: display || "Select a date"
              }
            )
          ] }),
          /* @__PURE__ */ jsx(CalendarDays, { className: "h-4 w-4 shrink-0 text-[#8C8C90]", "aria-hidden": true })
        ]
      }
    ),
    open && /* @__PURE__ */ jsx(
      "div",
      {
        className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3",
        "data-testid": testId ? `${testId}-overlay` : void 0,
        children: /* @__PURE__ */ jsxs(
          "div",
          {
            ref: dialogRef,
            role: "dialog",
            "aria-modal": "true",
            "aria-label": label,
            tabIndex: -1,
            "data-testid": testId ? `${testId}-dialog` : void 0,
            className: "flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17171A] shadow-2xl shadow-black/70 outline-none",
            children: [
              /* @__PURE__ */ jsxs("div", { className: "flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    "aria-label": "Previous month",
                    "data-testid": testId ? `${testId}-prev-month` : void 0,
                    onClick: () => shiftMonth(-1),
                    className: "flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#B8B8C0] hover:text-white",
                    children: /* @__PURE__ */ jsx(ChevronLeft, { className: "h-4 w-4", "aria-hidden": true })
                  }
                ),
                /* @__PURE__ */ jsxs(
                  "p",
                  {
                    "aria-live": "polite",
                    className: "font-anton text-sm uppercase tracking-wide text-[#F4F2ED]",
                    children: [
                      monthLabel(view.month),
                      " ",
                      view.year
                    ]
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    "aria-label": "Next month",
                    "data-testid": testId ? `${testId}-next-month` : void 0,
                    onClick: () => shiftMonth(1),
                    className: "flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#B8B8C0] hover:text-white",
                    children: /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4", "aria-hidden": true })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "min-h-0 overflow-y-auto px-3 py-3", children: [
                /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 gap-1 pb-1", children: WEEKDAY_LABELS.map((day, index) => /* @__PURE__ */ jsx(
                  "span",
                  {
                    "aria-hidden": true,
                    className: "text-center text-[10px] font-mono uppercase text-[#8C8C90]",
                    children: day
                  },
                  `${day}-${index}`
                )) }),
                weeks.map((week, weekIndex) => /* @__PURE__ */ jsx("div", { className: "grid grid-cols-7 gap-1", children: week.map((cell) => {
                  const cellValue = toDateValue(cell.year, cell.month, cell.day);
                  const selected = draft === cellValue;
                  const isToday = today === cellValue;
                  const blocked = isOutsideRange(cellValue, min, max);
                  return /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      disabled: blocked,
                      "aria-selected": selected,
                      "aria-disabled": blocked || void 0,
                      "aria-current": isToday ? "date" : void 0,
                      "aria-label": formatDayLabel(cell.year, cell.month, cell.day),
                      "data-testid": testId ? `${testId}-day-${cellValue}` : void 0,
                      "data-day-value": cellValue,
                      "data-in-month": cell.inMonth ? "true" : "false",
                      onClick: () => selectDay(cell),
                      onKeyDown: (event) => {
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
                      },
                      className: `flex min-h-[44px] items-center justify-center rounded-lg text-xs font-mono transition-colors ${cell.inMonth ? "text-[#F4F2ED]" : "text-[#8C8C90]/60"} ${selected ? "bg-[#C81E3A]/25 font-bold ring-2 ring-[#E62846]" : "hover:bg-white/[0.06]"} ${isToday && !selected ? "border border-[#D4AF37]/60" : ""} ${blocked ? "cursor-not-allowed opacity-30" : ""}`,
                      children: cell.day
                    },
                    cellValue
                  );
                }) }, weekIndex))
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex shrink-0 items-center justify-end gap-2 border-t border-white/5 px-3 py-2.5", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    "data-testid": testId ? `${testId}-cancel` : void 0,
                    onClick: () => close(true),
                    className: "min-h-[44px] rounded-lg border border-white/10 bg-black/30 px-3 text-[11px] font-inter uppercase tracking-wider text-[#8C8C90] hover:text-white",
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    disabled: !draft || isOutsideRange(draft, min, max),
                    "data-testid": testId ? `${testId}-confirm` : void 0,
                    onClick: confirm,
                    className: "min-h-[44px] rounded-lg bg-[#C81E3A] px-4 text-[11px] font-anton uppercase tracking-wider text-white hover:bg-[#A0182E] disabled:opacity-40",
                    children: "Set"
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
}
export {
  SVJDatePicker,
  addMonths,
  buildMonthMatrix,
  formatDayLabel,
  formatLongDate,
  parseDateValue,
  toDateValue,
  todayDateValue
};
