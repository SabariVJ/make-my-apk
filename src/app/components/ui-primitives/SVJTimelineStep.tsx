import React from "react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * SVJ TimelineStep — one node of a vertical timeline.
 *
 * Built for the 60-Day transformation arc, recovery weeks and challenge
 * milestones: done → crimson check, active → ringed node, upcoming → muted.
 * Compose steps in a column; pass isLast on the final step to drop the rail.
 */
export const SVJTimelineStep: React.FC<{
  state: "done" | "active" | "upcoming";
  title: string;
  /** Mono readout on the right (date, XP, metric). */
  meta?: string;
  description?: string;
  /** Optional node icon for active steps (defaults to a dot). */
  icon?: LucideIcon;
  isLast?: boolean;
  className?: string;
}> = ({ state, title, meta, description, icon: Icon, isLast = false, className = "" }) => {
  const node =
    state === "done" ? (
      <div className="w-6 h-6 rounded-full bg-svj-crimson flex items-center justify-center">
        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} aria-hidden="true" />
      </div>
    ) : state === "active" ? (
      <div className="w-6 h-6 rounded-full border-2 border-svj-crimson bg-svj-surface flex items-center justify-center">
        {Icon ? (
          <Icon className="w-3 h-3 text-svj-crimson" aria-hidden="true" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-svj-crimson" aria-hidden="true" />
        )}
      </div>
    ) : (
      <div className="w-6 h-6 rounded-full border border-white/[0.12] bg-svj-surface" />
    );

  return (
    <div className={`flex gap-3 ${className}`}>
      <div className="flex flex-col items-center shrink-0">
        {node}
        {!isLast && <div className="w-px flex-1 min-h-6 bg-white/[0.08] my-1" aria-hidden="true" />}
      </div>
      <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={`font-inter text-sm leading-tight ${
              state === "upcoming" ? "text-svj-secondary" : "text-svj-text font-semibold"
            }`}
          >
            {title}
          </p>
          {meta && (
            <span className="font-mono text-[11px] text-svj-secondary tabular-nums shrink-0">
              {meta}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-svj-secondary leading-relaxed mt-1">{description}</p>
        )}
      </div>
    </div>
  );
};
