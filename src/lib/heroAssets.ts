/**
 * Central registry for the premium SVJ hero art.
 *
 * Paths are absolute public paths (`/assets/...`) on purpose: the web build and
 * the Capacitor WebView both serve `public/` from the root, so importing a file
 * relatively would resolve differently between the two shells.
 *
 * Presence on disk today (verified with `ls public/assets/svj-premium`):
 * `fuel`, `plus`, `rivalry`, `transformation`. The remaining screens are
 * registered here so their path/focal point live in one place, but the art must
 * land in `public/assets/svj-premium/<screen>/hero.webp` before it renders —
 * `ScreenHero` hides the image (and keeps the screen intact) while it is absent.
 */
export type HeroScreen =
  | "activity"
  | "challenges"
  | "onboarding"
  | "plus"
  | "profile"
  | "rivalry"
  | "train"
  | "transformation"
  | "fuel";

export interface HeroAsset {
  /** Absolute public path, served at the WebView root on Android. */
  src: string;
  /** Short descriptive text; decorative heroes render it as `alt=""`. */
  alt: string;
  /** CSS `object-position` focal point that keeps the subject in frame. */
  focal: string;
}

export const HERO_ASSETS: Record<HeroScreen, HeroAsset> = {
  activity: {
    src: "/assets/svj-premium/activity/hero.webp",
    alt: "Cyclist riding through the city at night",
    focal: "50% 40%",
  },
  challenges: {
    src: "/assets/svj-premium/challenges/hero.webp",
    alt: "Hiker overlooking a mountain lake at sunset",
    focal: "50% 45%",
  },
  onboarding: {
    src: "/assets/svj-premium/onboarding/hero.webp",
    alt: "Dark engraved hexagon texture",
    focal: "50% 50%",
  },
  plus: {
    src: "/assets/svj-premium/plus/hero.webp",
    alt: "SVJ Plus premium hero",
    focal: "68% 35%",
  },
  profile: {
    src: "/assets/svj-premium/profile/hero.webp",
    alt: "Athlete at rest in a dark gym",
    focal: "30% 35%",
  },
  rivalry: {
    src: "/assets/svj-premium/rivalry/hero.webp",
    alt: "Two athletes facing off in a dark training space",
    focal: "50% 35%",
  },
  train: {
    src: "/assets/svj-premium/train/hero.webp",
    alt: "Athlete and barbell in a dark gym",
    focal: "22% 40%",
  },
  transformation: {
    src: "/assets/svj-premium/transformation/hero.webp",
    alt: "Athlete recovering after a hard session",
    focal: "26% 38%",
  },
  fuel: {
    src: "/assets/svj-premium/fuel/hero.webp",
    alt: "Plated high-protein meal on a dark table",
    focal: "26% 42%",
  },
};
