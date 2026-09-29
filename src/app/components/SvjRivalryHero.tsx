import React, { useState } from "react";

/**
 * Decorative "Lock In & Outperform" rivalry hero layer.
 *
 * Presents the approved premium asset from
 * /assets/svj-premium/rivalry/hero.webp as a subtle background strip behind
 * the top of the rivalry UI. Presentation-only:
 * - aria-hidden + empty alt: purely decorative for assistive tech
 * - pointer-events-none: never intercepts taps on real UI
 * - onError fallback: if the asset is missing, the layer hides itself and
 *   the interface renders exactly as before
 * - dual dark gradients (bottom + edges) keep white SVJ text readable
 * - responsive focal points keep both athletes visible on desktop while
 *   mobile crops toward the center tension without awkward framing
 */
export const SvjRivalryHero: React.FC = () => {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div
      data-testid="rivalry-hero-visual"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-28 select-none overflow-hidden sm:h-36"
    >
      <img
        src="/assets/svj-premium/rivalry/hero.webp"
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-[50%_30%] opacity-40 sm:object-[50%_38%] sm:opacity-50"
      />
      {/* Dark gradient overlays preserve text readability over the image. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#17171A]/60 via-[#17171A]/45 to-[#17171A]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#17171A]/70 via-transparent to-[#17171A]/70" />
    </div>
  );
};
