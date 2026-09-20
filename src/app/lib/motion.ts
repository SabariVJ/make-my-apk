/**
 * SVJ Motion utilities — centralized timing and animation helpers.
 *
 * All durations in milliseconds. All values designed for mid-range Android
 * phones (transform + opacity only, no layout thrashing).
 */

/** Check if the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Standard animation variants for Framer Motion / motion/react. */
export const svjFadeIn = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
} as const;

export const svjScaleIn = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
} as const;

/** Stagger delay helper for list items. */
export function staggerDelay(index: number, baseMs = 40): number {
  return Math.min(index * baseMs, 300);
}

/** Transition presets. */
export const svjTransitionFast = { duration: 0.12, ease: "easeOut" } as const;
export const svjTransition = { duration: 0.2, ease: "easeOut" } as const;
export const svjTransitionPage = { duration: 0.24, ease: "easeOut" } as const;
export const svjTransitionProgress = { duration: 0.5, ease: "easeOut" } as const;
