import React, { useState } from "react";

/**
 * Decorative transformation-complete hero layer.
 *
 * Presents the approved premium asset from
 * /assets/svj-premium/transformation/hero.webp as a subtle background behind
 * the top of the 60-Day completion card. Presentation-only:
 * - aria-hidden + empty alt: purely decorative for assistive tech
 * - pointer-events-none: never intercepts taps on the code / CTAs
 * - onError fallback: if the asset is missing, the layer hides itself and
 *   the completion card renders exactly as before
 * - dark charcoal gradients keep white/gold/crimson text readable
 * - focal points keep the exhausted athlete left/left-center on desktop
 *   while mobile crops toward the subject without covering title/buttons
 */
export const SvjTransformationHero: React.FC = () => {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div
      data-testid="transformation-hero-visual"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-28 select-none overflow-hidden sm:h-36"
    >
      <img
        src="/assets/svj-premium/transformation/hero.webp"
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-[28%_32%] opacity-40 sm:object-[24%_40%] sm:opacity-50"
      />
      {/* Dark charcoal gradients preserve text readability over the image. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#17171A]/65 via-[#17171A]/50 to-[#17171A]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0C]/60 via-[#0B0B0C]/30 to-[#0B0B0C]/75" />
    </div>
  );
};
