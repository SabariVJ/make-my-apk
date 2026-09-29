import React, { useState } from "react";

/**
 * Decorative Fuel/Nutrition hero layer.
 *
 * Presents the approved premium asset from
 * /assets/svj-premium/fuel/hero.webp as a subtle background behind the top
 * Fuel header area. Presentation-only:
 * - aria-hidden + empty alt: purely decorative for assistive tech
 * - pointer-events-none: never intercepts taps on header buttons
 * - onError fallback: if the asset is missing, the layer hides itself and
 *   the Fuel screen renders exactly as before
 * - dark graphite gradients keep the Fuel title and body-profile button
 *   readable over the image
 * - focal point keeps the plated chicken/rice/greens left/left-center on
 *   desktop while mobile crops toward the plate without covering stats or
 *   controls; the right side of the frame is negative space that stays
 *   available for real nutrition UI
 * - desktop gets a taller, brighter presentation so the premium asset reads
 *   clearly on large monitors while mobile keeps heavier protection
 * - z-0 keeps the layer behind all real UI; the bottom fade clamps the
 *   strip so it ends before the summary card and tab controls
 */
export const SvjFuelHero: React.FC = () => {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div
      data-testid="fuel-hero-visual"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-24 select-none overflow-hidden sm:h-36 lg:h-40"
    >
      <img
        src="/assets/svj-premium/fuel/hero.webp"
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-[28%_45%] opacity-40 sm:object-[26%_42%] sm:opacity-60 lg:object-[25%_40%] lg:opacity-75"
      />
      {/* Dark graphite gradients preserve text readability over the image.
          Weaker on desktop (sm:) so the asset stays clearly visible; the
          bottom fade always returns to the page background. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0C]/60 via-[#0B0B0C]/35 sm:via-[#0B0B0C]/25 to-[#0B0B0C]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0C]/55 via-[#0B0B0C]/20 sm:via-[#0B0B0C]/15 to-[#0B0B0C]/70" />
    </div>
  );
};
