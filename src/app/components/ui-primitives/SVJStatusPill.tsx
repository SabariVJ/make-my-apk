import React from "react";

/**
 * SVJ StatusPill — state signal, not decoration.
 *
 * Rounded square (rounded-md) instead of a pill by default: the app already
 * over-uses rounded-full. Tones map to the design-token palette so a status
 * color means the same thing on every screen.
 */
export type StatusToneName =
  "neutral" | "crimson" | "gold" | "positive" | "warning" | "caution" | "critical" | "info";

const TONE_STYLES: Record<StatusToneName, { text: string; dot: string }> = {
  neutral: { text: "text-svj-secondary", dot: "bg-svj-secondary" },
  crimson: { text: "text-svj-crimson", dot: "bg-svj-crimson" },
  gold: { text: "text-gold", dot: "bg-gold" },
  positive: { text: "text-state-positive", dot: "bg-state-positive" },
  warning: { text: "text-state-warning", dot: "bg-state-warning" },
  caution: { text: "text-state-caution", dot: "bg-state-caution" },
  critical: { text: "text-state-critical", dot: "bg-state-critical" },
  info: { text: "text-state-info", dot: "bg-state-info" },
};

export const SVJStatusPill: React.FC<{
  tone?: StatusToneName;
  children: React.ReactNode;
  /** Leading status dot (live recording, sync state…). */
  dot?: boolean;
  /** Animate the dot for live/ongoing states only. */
  pulse?: boolean;
  className?: string;
}> = ({ tone = "neutral", children, dot = false, pulse = false, className = "" }) => {
  const t = TONE_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1 font-inter text-[10px] font-semibold uppercase tracking-[0.08em] ${t.text} ${className}`}
    >
      {dot && (
        <span className="relative flex w-1.5 h-1.5" aria-hidden="true">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${t.dot}`}
            />
          )}
          <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${t.dot}`} />
        </span>
      )}
      {children}
    </span>
  );
};
