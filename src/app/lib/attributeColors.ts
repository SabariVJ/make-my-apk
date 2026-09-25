/**
 * Character Matrix attribute palette — the app's most distinctive system.
 *
 * These six colors used to exist only inside the radar chart's local array, so
 * challenge tags, the 60-Day attribute bars and the Train muscle map each
 * invented their own tint. This module is now the single source: threading the
 * same hues through every one of those surfaces is what makes the app read as
 * one designed product rather than a set of screens.
 *
 * Keep in sync with the --color-attr-* tokens in src/styles.css.
 */
export const ATTRIBUTE_COLORS = {
  physical: "#10B981",
  ambition: "#A855F7",
  intellect: "#F59E0B",
  mental: "#EAB308",
  social: "#3B82F6",
  discipline: "#F43F5E",
} as const;

export type AttributeKey = keyof typeof ATTRIBUTE_COLORS;

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  physical: "Physical",
  ambition: "Ambition",
  intellect: "Intellect",
  mental: "Mental",
  social: "Social",
  discipline: "Discipline",
};

/** Hex for an attribute key, tolerating unknown/legacy keys. */
export function attributeColor(key: string | null | undefined): string {
  if (key && key in ATTRIBUTE_COLORS) return ATTRIBUTE_COLORS[key as AttributeKey];
  return ATTRIBUTE_COLORS.physical;
}

/**
 * Challenge category → attribute hue. Categories are the user-facing label;
 * the hue comes from the attribute each category actually trains, so a
 * "Physical" tag and the Physical point on the hexagon are the same green.
 */
const CATEGORY_ATTRIBUTE: Record<string, AttributeKey> = {
  physical: "physical",
  mental: "mental",
  discipline: "discipline",
  social: "social",
  mindset: "ambition",
  ambition: "ambition",
  intellect: "intellect",
  nutrition: "physical",
  recovery: "social",
};

export function challengeCategoryColor(category: string | null | undefined): string {
  if (!category) return ATTRIBUTE_COLORS.physical;
  return attributeColor(CATEGORY_ATTRIBUTE[category.trim().toLowerCase()] ?? "physical");
}

/** Translucent background paired with a category hue for tag chips. */
export function challengeCategoryTint(category: string | null | undefined): string {
  const hex = challengeCategoryColor(category);
  return `${hex}1f`;
}
