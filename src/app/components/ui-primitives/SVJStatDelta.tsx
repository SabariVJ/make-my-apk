import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/**
 * SVJ StatDelta — direction of travel for a metric.
 *
 * Compact mono readout: ▲ 12% / ▼ 4 / — flat. `invert` flips good/bad for
 * metrics where down is better (resting HR, sleep debt, load strain).
 */
export const SVJStatDelta: React.FC<{
  /** Signed change (e.g. +12, -4). */
  value: number;
  /** Unit or suffix rendered after the number (%, XP, bpm…). */
  suffix?: string;
  /** True when a decrease is the improvement (resting HR, debt…). */
  invert?: boolean;
  /** Neutral label when value is 0. */
  flatLabel?: string;
  className?: string;
}> = ({ value, suffix = "", invert = false, flatLabel = "Flat", className = "" }) => {
  if (value === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono text-[11px] text-svj-secondary ${className}`}
      >
        <Minus className="w-3 h-3" aria-hidden="true" />
        {flatLabel}
      </span>
    );
  }

  const improving = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  const colorClass = improving ? "text-state-positive" : "text-state-critical";

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[11px] tabular-nums ${colorClass} ${className}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {Math.abs(value)}
      {suffix}
    </span>
  );
};
