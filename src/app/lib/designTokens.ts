/**
 * SVJ PERFORMANCE OS — design tokens (JS mirror of src/styles.css).
 *
 * These constants are the single source of truth for colors used inside
 * SVG graphics (radar charts, muscle map, rings, maps). Tailwind utilities
 * read the same values from CSS custom properties — keep both in sync.
 *
 * Rules:
 * - Crimson is the brand signal. Gold is reserved for Plus/Founder.
 * - The six Character Matrix attribute colors are the ONLY secondary data
 *   palette. They map to OS domains:
 *     physical   → Body / Activity
 *     discipline → Training / Discipline
 *     mental     → Recovery / Mind
 *     intellect  → Nutrition / Fuel
 *     ambition   → Progression / XP
 *     social     → Competition / Community
 * - Status colors express readiness/load telemetry, never decoration.
 */

export const BRAND_COLORS = {
  bg: "#0B0B0C",
  surface: "#17171A",
  surfaceRaised: "#1E1E22",
  overlay: "#212126",
  crimson: "#C81E3A",
  crimsonHover: "#A0182E",
  gold: "#D4AF37",
  text: "#F4F2ED",
  textSecondary: "#8C8C90",
  textMuted: "#5C5C60",
} as const;

/** Character Matrix attribute colors — preserved from the original radar. */
export const ATTRIBUTE_COLORS = {
  physical: "#10B981",
  ambition: "#A855F7",
  intellect: "#F59E0B",
  mental: "#EAB308",
  social: "#3B82F6",
  discipline: "#F43F5E",
} as const;

export type AttributeKey = keyof typeof ATTRIBUTE_COLORS;

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  "physical",
  "ambition",
  "intellect",
  "mental",
  "social",
  "discipline",
];

/** OS domain → attribute mapping for cross-screen data color consistency. */
export const DOMAIN_ATTRIBUTES = {
  body: "physical",
  training: "discipline",
  recovery: "mental",
  nutrition: "intellect",
  progression: "ambition",
  competition: "social",
  discipline: "discipline",
  identity: "ambition",
} as const satisfies Record<string, AttributeKey>;

/** Readiness/load telemetry colors (matches recovery grade bands). */
export const STATUS_COLORS = {
  positive: "#34D399",
  warning: "#EAB308",
  caution: "#FB923C",
  critical: "#F87171",
  info: "#60A5FA",
} as const;

export type StatusTone = keyof typeof STATUS_COLORS;

/** Radius scale — cards 16px, modules 12px, controls 10px, chips 6px. */
export const RADII = {
  chip: "0.375rem",
  control: "0.625rem",
  module: "0.75rem",
  card: "1rem",
} as const;

/** Motion durations in ms — mirrors src/app/lib/motion.ts. */
export const MOTION = {
  fast: 120,
  base: 200,
  page: 240,
  progress: 500,
  staggerItem: 40,
  staggerMax: 300,
} as const;

/** Responsive targets (px): phones first, tablet grid from md up. */
export const BREAKPOINTS = {
  xs: 416,
  sm: 640,
  md: 768,
  lg: 1024,
} as const;

/** Default readiness band color used across Recovery surfaces. */
export function readinessColor(score: number): string {
  if (score >= 78) return STATUS_COLORS.positive;
  if (score >= 60) return STATUS_COLORS.warning;
  if (score >= 40) return STATUS_COLORS.caution;
  return STATUS_COLORS.critical;
}
