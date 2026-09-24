import React from "react";

/**
 * SVJ Surface — the foundational layer primitive of the Performance OS.
 *
 * Near-black hierarchy (no pure black, no glassmorphism):
 *   base    → page sections on the app background (#0B0B0C)
 *   surface → standard panel (#17171A)
 *   raised  → elevated panel (#1E1E22)
 *   overlay → hover/pressed state of interactive panels (#212126)
 *
 * Depth comes from hairline borders + elevation tokens, never glow.
 */
export type SurfaceLevel = "base" | "surface" | "raised" | "overlay";

const LEVEL_CLASSES: Record<SurfaceLevel, string> = {
  base: "bg-svj-bg border-white/[0.04]",
  surface: "bg-svj-surface border-white/[0.06]",
  raised: "bg-svj-surface-raised border-white/[0.08]",
  overlay: "bg-svj-overlay border-white/[0.10]",
};

export const SVJSurface: React.FC<{
  level?: SurfaceLevel;
  /** Standard card padding; pass "none" to control padding yourself. */
  padding?: "none" | "sm" | "md" | "lg";
  radius?: "module" | "card" | "control";
  /** Adds hover border brightening + press feedback for tappable panels. */
  interactive?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
  children: React.ReactNode;
}> = ({
  level = "surface",
  padding = "md",
  radius = "card",
  interactive = false,
  onClick,
  className = "",
  children,
}) => {
  const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-5" } as const;
  const radii = { module: "rounded-xl", card: "rounded-2xl", control: "rounded-lg" } as const;
  const hover = interactive ? "transition-colors hover:border-white/[0.12] cursor-pointer" : "";
  const press = interactive ? "svj-press" : "";

  return (
    <div
      onClick={onClick}
      className={`border ${LEVEL_CLASSES[level]} ${radii[radius]} ${paddings[padding]} ${hover} ${press} ${className}`}
    >
      {children}
    </div>
  );
};
