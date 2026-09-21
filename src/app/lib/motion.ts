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

/** Spring presets — tactile, restrained; used for entrances + press feedback. */
export const svjSpring = { type: "spring", stiffness: 420, damping: 34 } as const;
export const svjSpringSoft = { type: "spring", stiffness: 300, damping: 30 } as const;

/**
 * Standard tap feedback for primary buttons and interactive cards.
 * Spread onto a motion element: whileTap={svjWhileTap}
 */
export const svjWhileTap = { scale: 0.97 } as const;

/**
 * Staggered list container/item variants. Wrap the list in a motion element
 * with variants={svjStaggerContainer} initial="hidden" animate="show" and
 * give each row variants={svjStaggerItem}.
 */
export const svjStaggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
} as const;

export const svjStaggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: svjSpringSoft },
} as const;
