import React from "react";

const SIZES = {
  xs: { box: "w-6 h-6", text: "text-[9px]", ring: "ring-1" },
  sm: { box: "w-8 h-8", text: "text-[10px]", ring: "ring-1" },
  md: { box: "w-10 h-10", text: "text-xs", ring: "ring-2" },
  lg: { box: "w-14 h-14", text: "text-base", ring: "ring-2" },
  xl: { box: "w-20 h-20", text: "text-xl", ring: "ring-2" },
} as const;

/**
 * SVJ Avatar — identity mark with deterministic initials fallback.
 *
 * Optional level ring: crimson for members, gold for Plus/Founder. No
 * gradient rings, no glow — a precise 1-2px ring on the near-black surface.
 */
export const SVJAvatar: React.FC<{
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  ring?: "none" | "crimson" | "gold";
  /** Small slot anchored bottom-right (level badge, status dot). */
  badge?: React.ReactNode;
  className?: string;
}> = ({ name, src, size = "md", ring = "none", badge, className = "" }) => {
  const s = SIZES[size];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const ringClass =
    ring === "gold"
      ? `${s.ring} ring-gold/70 ring-offset-2 ring-offset-svj-bg`
      : ring === "crimson"
        ? `${s.ring} ring-svj-crimson/70 ring-offset-2 ring-offset-svj-bg`
        : "";

  return (
    <div className={`relative shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={`${s.box} rounded-full object-cover border border-white/[0.08] ${ringClass}`}
        />
      ) : (
        <div
          aria-label={name}
          role="img"
          className={`${s.box} rounded-full bg-svj-surface-raised border border-white/[0.08] flex items-center justify-center font-anton text-svj-secondary ${s.text} ${ringClass}`}
        >
          {initials || "SVJ"}
        </div>
      )}
      {badge && <div className="absolute -bottom-0.5 -right-0.5">{badge}</div>}
    </div>
  );
};
