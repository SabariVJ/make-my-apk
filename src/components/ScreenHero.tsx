import React, { useEffect, useRef, useState } from "react";
import { HERO_ASSETS, type HeroScreen } from "@/lib/heroAssets";

/**
 * Reusable premium hero for the top of a screen.
 *
 * Layout contract (this is the part that matters):
 * - the hero is a normal block element in the document flow with its own fixed
 *   responsive height, so it always pushes its siblings down instead of
 *   floating over them; only the gradient + title overlay are absolutely
 *   positioned, and they are clipped by the hero's own box
 * - `relative z-0` keeps the hero below any sibling controls (headers, tab
 *   bars, sticky nav) — the "Fuel hero overlapping summary and tab controls"
 *   bug came from a hero that did not reserve its own height
 * - the image is `object-cover` with a per-screen focal point from the registry
 * - each size tier uses a fixed aspect ratio (not a fixed pixel height), so the
 *   proportion of the source art that stays visible is constant at every
 *   viewport width, with a max-height cap per tier for very large windows
 *
 * Performance: `loading="lazy"` + `decoding="async"` by default; `priority`
 * switches an above-the-fold hero to eager/high-priority loading.
 *
 * Resilience: a missing or broken file never breaks the screen. A decorative
 * hero (no title/subtitle) renders nothing at all, so a screen can be wired up
 * ahead of its art; a hero with copy falls back to a crimson/charcoal gradient
 * and keeps its height.
 */
export interface ScreenHeroProps {
  /** Registry key; must match the folder under public/assets/svj-premium. */
  screen: HeroScreen;
  /** Optional heading, overlaid at the bottom of the hero. */
  title?: string;
  /** Optional supporting line, overlaid under the title. */
  subtitle?: string;
  height?: "sm" | "md" | "lg";
  /** Above-the-fold heroes (Activity, Challenges, Onboarding) load eagerly. */
  priority?: boolean;
  /** Use only when the hero is the topmost element of a screen with no app header. */
  safeArea?: boolean;
}

const HEIGHT_CLASSES: Record<NonNullable<ScreenHeroProps["height"]>, string> = {
  sm: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-40 sm:max-h-48 lg:max-h-56",
  md: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-52 sm:max-h-64 lg:max-h-80",
  lg: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-64 sm:max-h-80 lg:max-h-96",
};

export const ScreenHero: React.FC<ScreenHeroProps> = ({
  screen,
  title,
  subtitle,
  height = "md",
  priority = false,
  safeArea = false,
}) => {
  const asset = HERO_ASSETS[screen];
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  // A cached image can finish loading before React attaches onLoad, so read
  // `complete` once on mount — otherwise the fade-in would never start.
  useEffect(() => {
    const node = imgRef.current;
    if (!node?.complete) return;
    setState(node.naturalWidth > 0 ? "ready" : "failed");
  }, []);

  const decorative = !title && !subtitle;

  // A decorative hero has no copy to keep readable, so a missing file hides the
  // whole hero and leaves the screen byte-for-byte as it was. That is what lets
  // a screen be wired up before its art is delivered: it lights up on its own
  // the moment the file exists. Heroes that carry a title keep the gradient
  // fallback below so the copy stays legible over whatever is behind it.
  if (decorative && state === "failed") return null;

  return (
    <section
      data-testid={"screen-hero-" + screen}
      aria-hidden={decorative ? "true" : undefined}
      style={safeArea ? { marginTop: "env(safe-area-inset-top)" } : undefined}
      className={
        "relative z-0 w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0B0B0C] " +
        HEIGHT_CLASSES[height]
      }
    >
      {state === "failed" ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#2A0E14] via-[#0B0B0C] to-[#0B0B0C]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_20%_0%,rgba(200,30,58,0.35),transparent_62%)]" />
        </div>
      ) : (
        <img
          ref={imgRef}
          src={asset.src}
          alt={decorative ? asset.alt : ""}
          style={{ objectPosition: asset.focal }}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className={
            "block h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-700 " +
            (state === "ready" ? "opacity-100" : "opacity-0")
          }
        />
      )}

      {/* Dark-to-transparent overlays: bottom fade seats the title text, side
          fades keep the frame edges from competing with real UI. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/55 to-[#0B0B0C]/5" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B0B0C]/55 via-transparent to-[#0B0B0C]/35" />

      {(title || subtitle) && (
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          {title && (
            <h2 className="font-anton text-2xl tracking-wide text-white sm:text-3xl">{title}</h2>
          )}
          {subtitle && (
            <p className="mt-1.5 max-w-xl font-inter text-sm leading-relaxed text-[#C4C4CC]">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
