import React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * SVJ HeroCard — the opening statement of a screen.
 *
 * One per screen, always first. Carries the screen identity: eyebrow label,
 * Anton display title, optional supporting copy, and one slot for signature
 * graphics (Character Matrix, recovery ring, telemetry). A single 2px accent
 * hairline is the only decoration.
 */
export const SVJHeroCard: React.FC<{
  eyebrow: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  tone?: "crimson" | "gold" | "plain";
  /** Signature graphic slot (chart, ring, map). Rendered full-width below. */
  graphic?: React.ReactNode;
  /** Right-hand action slot (CTA button, status pill). */
  action?: React.ReactNode;
  className?: string;
}> = ({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = "crimson",
  graphic,
  action,
  className = "",
}) => {
  const accent =
    tone === "gold" ? "bg-gold" : tone === "crimson" ? "bg-svj-crimson" : "bg-white/[0.08]";

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-svj-surface ${className}`}
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} aria-hidden="true" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="svj-label-xs uppercase tracking-[0.14em] flex items-center gap-1.5">
              {Icon && (
                <Icon className="w-3.5 h-3.5 text-svj-crimson shrink-0" aria-hidden="true" />
              )}
              {eyebrow}
            </p>
            <h2 className="svj-heading text-2xl leading-tight mt-1.5">{title}</h2>
            {description && (
              <p className="text-[13px] leading-relaxed text-svj-secondary mt-1.5 max-w-prose">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {graphic && <div className="mt-4">{graphic}</div>}
      </div>
    </section>
  );
};
