import React from "react";
import type { LucideIcon } from "lucide-react";
import { TriangleAlert, Sparkles } from "lucide-react";

export type EmptyStateVariant = "empty" | "error" | "coming-soon";

/**
 * SVJ EmptyState — the single component for every "nothing here" surface:
 * genuinely no data yet, a failed load, or a feature that has not shipped.
 *
 * Copy rule: say what is ACTUALLY true and what to do next, in the app's own
 * voice. Never "something went wrong" + a bare Retry. Each call site passes
 * copy specific to what is missing (check-ins vs. weekly summary vs. history).
 */
export const SVJEmptyState: React.FC<{
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  variant?: EmptyStateVariant;
  /** Compact layout for use inside a card or a small panel. */
  compact?: boolean;
  className?: string;
}> = ({
  icon: Icon,
  title,
  description,
  action,
  variant = "empty",
  compact = false,
  className = "",
}) => {
  const ResolvedIcon: LucideIcon = Icon ?? (variant === "error" ? TriangleAlert : Sparkles);

  const tone: Record<EmptyStateVariant, { tile: string; glyph: string; label?: string }> = {
    empty: {
      tile: "border-white/8 bg-[#1E1E22]",
      glyph: "text-[#8C8C90]",
    },
    error: {
      tile: "border-[#C81E3A]/25 bg-[#C81E3A]/10",
      glyph: "text-[#E62846]",
      label: "Couldn't load",
    },
    "coming-soon": {
      tile: "border-[#C9A227]/25 bg-[#C9A227]/10",
      glyph: "text-[#C9A227]",
      label: "Coming next",
    },
  };
  const t = tone[variant];

  return (
    <div
      data-empty-variant={variant}
      className={`flex flex-col items-center justify-center text-center ${compact ? "px-4 py-5" : "px-5 py-8"} ${className}`}
    >
      <div
        className={`flex items-center justify-center rounded-2xl border ${t.tile} ${compact ? "mb-3 h-10 w-10" : "mb-4 h-12 w-12"}`}
      >
        <ResolvedIcon aria-hidden className={`${compact ? "h-4 w-4" : "h-5 w-5"} ${t.glyph}`} />
      </div>

      {t.label && (
        <p className="mb-1 font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8C8C90]">
          {t.label}
        </p>
      )}

      <h4 className="font-inter text-sm font-semibold text-[#F4F2ED]">{title}</h4>
      <p className="mt-1.5 max-w-xs text-xs font-inter leading-relaxed text-[#8C8C90]">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
