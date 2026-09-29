import React, { useState } from "react";

/**
 * Decorative Train/Workout hero layer.
 *
 * Presents the approved premium asset from
 * /assets/svj-premium/train/hero.webp as a subtle background behind the top
 * Train ("Iron Log") header row. Presentation-only:
 * - aria-hidden + empty alt: purely decorative for assistive tech
 * - pointer-events-none: never intercepts taps or clicks
 * - onError fallback: if the asset is missing, the layer hides itself and
 *   the Train screen renders exactly as before
 * - `absolute inset-0` fills the parent hero section exactly. The caller wraps
 *   this layer and the header row in one in-flow band that owns the responsive
 *   hero height, so the art covers that box and nothing more: the band pushes
 *   the following content down and `overflow-hidden` clips the image to it, so
 *   it can never cover the cards below
 * - z-0 keeps the layer behind the header row (z-10) inside that band
 * - dark graphite gradients keep the title and Guided toggle readable
 *   without burying the asset
 * - focal point keeps the athlete + barbell left/left-center; the right of
 *   the frame is negative space usable by real stats UI
 * - the desktop step brightens the art so the gym scene reads clearly on
 *   large monitors while mobile keeps the quieter crop toward the subject
 */
export const SvjTrainHero: React.FC = () => {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div
      data-testid="train-hero-visual"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
    >
      <img
        src="/assets/svj-premium/train/hero.webp"
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-[22%_38%] opacity-40 sm:object-[20%_40%] sm:opacity-60 lg:object-[20%_42%] lg:opacity-75"
      />
      {/* Dark graphite gradients preserve text readability over the image.
          Weaker on desktop (sm:) so the asset stays clearly visible; the
          bottom fade always returns to the page background. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0C]/60 via-[#0B0B0C]/35 sm:via-[#0B0B0C]/25 to-[#0B0B0C]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0C]/55 via-[#0B0B0C]/20 sm:via-[#0B0B0C]/15 to-[#0B0B0C]/70" />
    </div>
  );
};
