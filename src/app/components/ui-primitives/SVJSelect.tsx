// ============================================================================
// SVJ form select — accessible custom listbox used on mobile-first forms.
//
// Android WebView/Capacitor renders <select> popups as a large white native
// overlay that clashes with the dark SVJ UI and cannot be themed. This
// primitive replaces that interaction with an in-app dark listbox that keeps
// keyboard a11y on web (roving focus, Escape closes, Enter/Space selects) and
// communicates the selected option by an explicit check icon — never by color
// alone. It is a plain button + listbox (no portal) so the popup stays inside
// the viewport and never zooms or clips behind bottom navigation.
// ============================================================================
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SVJSelectOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SVJSelectProps<T extends string | number> {
  /** Accessible name; also used as the visible field label when provided. */
  label: string;
  value: T;
  options: SVJSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

function labelFor<T extends string | number>(options: SVJSelectOption<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? String(value);
}

export function SVJSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
  testId,
}: SVJSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );

  useEffect(() => {
    if (!open) return;
    const index = options.findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, options, value]);

  // Dismiss on outside pointerdown / focus leaving the control, and on Escape
  // while open (with focus returned to the trigger, like a native select).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const commit = useCallback(
    (option: SVJSelectOption<T>) => {
      onChange(option.value);
      setOpen(false);
      buttonRef.current?.focus();
    },
    [onChange],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (open) setActiveIndex((i) => Math.max(0, i - 1));
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (!open) setOpen(true);
        else if (options[activeIndex]) commit(options[activeIndex]);
        break;
      }
      case "Tab": {
        // Tab moves focus away and closes the popup without committing —
        // matching native select behavior rather than a menu.
        setOpen(false);
        break;
      }
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
    }
  };

  const focusActive = () => {
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      const node = list.querySelector('[data-active="true"]');
      (node as HTMLElement | null)?.focus();
    });
  };

  const activeId = `${listboxId}-opt-${activeIndex}`;

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={listboxId}
        data-testid={testId ? `${testId}-trigger` : undefined}
        onClick={() => {
          if (disabled) return;
          const next = !open;
          setOpen(next);
          if (next) focusActive();
        }}
        className="flex w-full min-h-[44px] items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0B0B0C] px-3 py-2 text-left text-xs font-mono text-white hover:border-white/20 disabled:opacity-40"
      >
        <span id={listboxId} className="text-[11px] font-inter text-[#8C8C90]">
          {label}
          <span className="sr-only">: </span>
          <span className="ml-1 text-white" data-testid={testId ? `${testId}-value` : undefined}>
            {labelFor(options, value)}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#8C8C90] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-labelledby={listboxId}
          tabIndex={-1}
          data-testid={testId ? `${testId}-listbox` : undefined}
          className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#17171A] py-1 shadow-xl shadow-black/60"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <li key={String(option.value)} role="none">
                <div
                  role="option"
                  aria-selected={selected}
                  data-active={active}
                  tabIndex={-1}
                  data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                  onClick={() => commit(option)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      commit(option);
                    }
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-mono ${
                    active ? "bg-white/[0.06]" : ""
                  } ${selected ? "text-[#F4F2ED]" : "text-[#B8B8C0]"}`}
                >
                  <span>{option.label}</span>
                  {selected && (
                    <Check className="h-4 w-4 shrink-0 text-[#C81E3A]" aria-label="Selected" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
