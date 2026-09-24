import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * SVJ InsightCard — an interpretation, not a number.
 *
 * Used where the OS explains state ("Recovery trending up", "Load is high —
 * deload suggested"). Left icon rail keeps the reading column clean.
 */
export const SVJInsightCard: React.FC<{
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  tone?: "crimson" | "gold" | "positive" | "warning" | "caution" | "critical" | "info" | "neutral";
  /** Small metadata row under the body (source, timestamp). */
  meta?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, children, tone = "neutral", meta, className = "" }) => {
  const tones: Record<string, { icon: string; tile: string }> = {
    crimson: { icon: "text-svj-crimson", tile: "bg-svj-crimson/10 border-svj-crimson/20" },
    gold: { icon: "text-gold", tile: "bg-gold/10 border-gold/20" },
    positive: {
      icon: "text-state-positive",
      tile: "bg-state-positive/10 border-state-positive/20",
    },
    warning: { icon: "text-state-warning", tile: "bg-state-warning/10 border-state-warning/20" },
    caution: { icon: "text-state-caution", tile: "bg-state-caution/10 border-state-caution/20" },
    critical: {
      icon: "text-state-critical",
      tile: "bg-state-critical/10 border-state-critical/20",
    },
    info: { icon: "text-state-info", tile: "bg-state-info/10 border-state-info/20" },
    neutral: { icon: "text-svj-secondary", tile: "bg-white/[0.04] border-white/[0.06]" },
  };
  const t = tones[tone];

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-svj-surface p-4 ${className}`}>
      <div className="flex gap-3">
        <div
          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${t.tile}`}
        >
          <Icon className={`w-4.5 h-4.5 ${t.icon}`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h4 className="font-inter text-[13px] font-semibold text-svj-text leading-snug">
            {title}
          </h4>
          <div className="text-xs leading-relaxed text-svj-secondary mt-1">{children}</div>
          {meta && <div className="mt-2 svj-label-xs">{meta}</div>}
        </div>
      </div>
    </div>
  );
};
