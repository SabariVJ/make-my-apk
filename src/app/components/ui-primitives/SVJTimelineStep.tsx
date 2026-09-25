import React from "react";

export type TimelineStatus = "done" | "current" | "upcoming" | "missed";

/**
 * SVJ TimelineStep — for genuinely sequential content only (the 60-Day
 * milestone history: Day 1 / 30 / 60 / 85). It is deliberately NOT a generic
 * decoration: if the content is not an ordered sequence, use a list row.
 */
export const SVJTimelineStep: React.FC<{
  /** Marked step label, e.g. "Day 30". */
  marker: string;
  title: string;
  description?: string;
  /** Right-aligned meta line (a date, a completion time). */
  meta?: string;
  status?: TimelineStatus;
  /** Hide the connector on the final step. */
  last?: boolean;
  /** Extra content rendered under the description (stat grids, chips). */
  children?: React.ReactNode;
  className?: string;
}> = ({
  marker,
  title,
  description,
  meta,
  status = "upcoming",
  last = false,
  children,
  className = "",
}) => {
  const dot: Record<TimelineStatus, string> = {
    done: "border-emerald-400/50 bg-emerald-400/15 text-emerald-300",
    current: "border-[#C81E3A]/60 bg-[#C81E3A]/18 text-[#F4F2ED]",
    upcoming: "border-white/10 bg-[#17171A] text-[#8C8C90]",
    missed: "border-white/10 bg-[#17171A] text-[#5C5C60]",
  };
  const connector: Record<TimelineStatus, string> = {
    done: "bg-emerald-400/25",
    current: "bg-gradient-to-b from-[#C81E3A]/50 to-white/8",
    upcoming: "bg-white/8",
    missed: "bg-white/6",
  };

  return (
    <li
      className={`relative flex gap-3.5 pb-4 ${last ? "pb-0" : ""} ${className}`}
      aria-current={status === "current" ? "step" : undefined}
    >
      <div className="relative flex w-16 shrink-0 flex-col items-center sm:w-20">
        <span
          className={`z-10 flex h-9 w-9 items-center justify-center rounded-full border font-mono text-[10px] font-bold uppercase ${dot[status]}`}
        >
          {marker.replace(/^day\s*/i, "")}
        </span>
        {!last && <span aria-hidden className={`mt-1 w-px flex-1 ${connector[status]}`} />}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="font-inter text-sm font-semibold text-[#F4F2ED]">{title}</h4>
          {meta && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[#8C8C90]">
              {meta}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-xs font-inter leading-relaxed text-[#8C8C90]">{description}</p>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
};
