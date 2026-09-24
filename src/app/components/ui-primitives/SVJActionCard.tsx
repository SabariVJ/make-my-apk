import React from "react";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * SVJ ActionCard — a tappable destination card.
 *
 * Real <button> semantics (keyboard + a11y for free), press feedback via
 * svj-press, one chevron as the affordance. Used for "Start workout",
 * "Open 60-Day", "View report" style entries.
 */
export const SVJActionCard: React.FC<{
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Trailing element replacing the default chevron (badge, count, ring). */
  trailing?: React.ReactNode;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  tone?: "default" | "crimson" | "gold";
  className?: string;
}> = ({
  icon: Icon,
  title,
  subtitle,
  trailing,
  disabled,
  onClick,
  tone = "default",
  className = "",
}) => {
  const border =
    tone === "crimson"
      ? "border-svj-crimson/15 hover:border-svj-crimson/30"
      : tone === "gold"
        ? "border-gold/15 hover:border-gold/30"
        : "border-white/[0.06] hover:border-white/[0.12]";
  const iconTile =
    tone === "crimson"
      ? "bg-svj-crimson/10 text-svj-crimson"
      : tone === "gold"
        ? "bg-gold/10 text-gold"
        : "bg-white/[0.04] text-svj-secondary";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left rounded-2xl border bg-svj-surface p-4 flex items-center gap-3 transition-colors svj-press disabled:opacity-40 disabled:pointer-events-none ${border} ${className}`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconTile}`}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-inter text-sm font-semibold text-svj-text leading-tight">{title}</p>
        {subtitle && <p className="text-xs text-svj-secondary mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      <div className="shrink-0 text-svj-muted">
        {trailing ?? <ChevronRight className="w-4 h-4" aria-hidden="true" />}
      </div>
    </button>
  );
};
