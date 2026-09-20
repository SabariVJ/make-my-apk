import React from "react";

/**
 * SVJ Card — a clean, consistent surface.
 *
 * Levels:
 *   surface  → standard card (default)
 *   raised   → slightly elevated
 *   inset    → sunken content area (stats, data rows)
 *   crimson  → accent-bordered program card
 *   gold     → premium/Plus card
 */
export const SVJCard: React.FC<{
  level?: "surface" | "raised" | "inset" | "crimson" | "gold";
  className?: string;
  children: React.ReactNode;
  /** When true, disables pointer hover elevation (for non-interactive cards). */
  noHover?: boolean;
}> = ({ level = "surface", className = "", children, noHover = false }) => {
  const base = "rounded-2xl transition-colors duration-200";

  const levels: Record<string, string> = {
    surface: "bg-[#17171A] border border-white/[0.06]",
    raised: "bg-[#1e1e22] border border-white/[0.08]",
    inset: "bg-[#0b0b0c] border border-white/[0.04]",
    crimson:
      "bg-gradient-to-br from-[#1e1114] via-[#17171A] to-[#17171A] border border-[#C81E3A]/15",
    gold: "bg-gradient-to-br from-[#1e1a10] via-[#17171A] to-[#17171A] border border-[#d4af37]/15",
  };

  const hover = noHover ? "" : "hover:border-white/[0.10]";

  return <div className={`${base} ${levels[level]} ${hover} ${className}`}>{children}</div>;
};
