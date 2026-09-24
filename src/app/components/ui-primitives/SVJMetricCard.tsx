import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * SVJ MetricCard — one number that matters, presented precisely.
 *
 * Label (Inter, small caps) above a monospace readout. Numeric values always
 * use IBM Plex Mono per the SVJ type system. Optional delta and a footer slot
 * for sparklines or progress. Grid-friendly: multiple MetricCards form a
 * 2-col phone / 3-col tablet telemetry grid without stretching.
 */
export const SVJMetricCard: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  /** Optional delta element (use SVJStatDelta). */
  delta?: React.ReactNode;
  /** Optional footer slot: sparkline, SVJProgressMeter, context line. */
  footer?: React.ReactNode;
  /** Accent used on the icon only — values stay neutral for legibility. */
  tone?: "crimson" | "gold" | "positive" | "warning" | "info" | "neutral";
  className?: string;
}> = ({ label, value, unit, icon: Icon, delta, footer, tone = "neutral", className = "" }) => {
  const iconTones: Record<string, string> = {
    crimson: "text-svj-crimson",
    gold: "text-gold",
    positive: "text-state-positive",
    warning: "text-state-warning",
    info: "text-state-info",
    neutral: "text-svj-secondary",
  };

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-svj-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="svj-label-xs uppercase tracking-[0.12em]">{label}</span>
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${iconTones[tone]}`} aria-hidden="true" />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] leading-none font-semibold text-svj-text tabular-nums">
          {value}
        </span>
        {unit && <span className="font-inter text-xs text-svj-secondary">{unit}</span>}
        {delta && <span className="ml-auto">{delta}</span>}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
};
