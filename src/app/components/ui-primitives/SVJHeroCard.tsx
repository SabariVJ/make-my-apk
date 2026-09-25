import React from "react";
import type { LucideIcon } from "lucide-react";

export type HeroVariant = "active" | "complete" | "reward" | "milestone";

/**
 * SVJ HeroCard — the one surface for genuinely headline content (Today's
 * Mission, Earn Plus, a 60-Day milestone).
 *
 * Variants exist so a completed milestone never looks identical to an active
 * mission. This is deliberately NOT the default card: ordinary content uses
 * SVJCard. Only ~one hero per screen so the screen keeps a single primary job.
 */
export const SVJHeroCard: React.FC<{
  variant?: HeroVariant;
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Trailing action row (buttons / links). */
  actions?: React.ReactNode;
  /** Any extra content below the actions (progress, stats). */
  children?: React.ReactNode;
  className?: string;
}> = ({
  variant = "active",
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  children,
  className = "",
}) => {
  const variants: Record<
    HeroVariant,
    { shell: string; accent: string; eyebrowColor: string; badge?: string }
  > = {
    active: {
      shell: "border-[#C81E3A]/25 bg-gradient-to-br from-[#1E1114] via-[#151517] to-[#151517]",
      accent: "#C81E3A",
      eyebrowColor: "text-[#E62846]",
    },
    complete: {
      shell: "border-emerald-400/20 bg-gradient-to-br from-[#0F1B16] via-[#141416] to-[#141416]",
      accent: "#10B981",
      eyebrowColor: "text-emerald-400",
      badge: "Complete",
    },
    reward: {
      shell: "border-[#C9A227]/30 bg-gradient-to-br from-[#201A0C] via-[#151517] to-[#151517]",
      accent: "#C9A227",
      eyebrowColor: "text-[#C9A227]",
    },
    milestone: {
      shell: "border-[#A855F7]/25 bg-gradient-to-br from-[#1A1024] via-[#151517] to-[#151517]",
      accent: "#A855F7",
      eyebrowColor: "text-[#C79BF5]",
    },
  };

  const v = variants[variant];

  return (
    <section
      className={`svj-radius-card svj-elev-3 relative overflow-hidden border ${v.shell} ${className}`}
    >
      {/* Top light + a corner accent glow keyed to the variant. */}
      <div aria-hidden className="svj-lit-top pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-[0.18] blur-3xl"
        style={{ background: v.accent }}
      />

      <div className="relative p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && (
              <p
                className={`font-inter text-[10px] font-semibold uppercase tracking-[0.18em] ${v.eyebrowColor}`}
              >
                {eyebrow}
              </p>
            )}
            <h2 className="mt-1 font-anton text-lg leading-tight tracking-wide text-[#F4F2ED] sm:text-xl">
              {title}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {v.badge && (
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-inter font-semibold uppercase tracking-wide text-emerald-300">
                {v.badge}
              </span>
            )}
            {Icon && (
              <span
                className="flex h-10 w-10 items-center justify-center rounded-2xl border"
                style={{
                  borderColor: `${v.accent}55`,
                  backgroundColor: `${v.accent}1f`,
                  color: v.accent,
                }}
              >
                <Icon aria-hidden className="h-5 w-5" />
              </span>
            )}
          </div>
        </div>

        {description && (
          <p className="mt-2 max-w-prose text-xs font-inter leading-relaxed text-[#A9A9AE]">
            {description}
          </p>
        )}

        {children && <div className="mt-3">{children}</div>}

        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
};
