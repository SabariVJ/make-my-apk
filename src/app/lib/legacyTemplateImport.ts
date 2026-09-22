// ============================================================================
// SVJ Automated Training — legacy (on-device) template import.
//
// Device templates were authored before there was an account, so they are not
// evidence of anything server-side. This module only PLANS an import:
//
//   * an exercise is matched only when exactly one catalog exercise has the same
//     normalized name — anything else is surfaced for the user to resolve;
//   * muscle metadata is never guessed from an arbitrary name. An unmatched
//     exercise is skipped unless the user maps it to a real catalog exercise or
//     creates their own;
//   * the local originals are read-only here and stay on the device until the
//     server acknowledges the import;
//   * an import never awards XP and never marks a workout performed.
// ============================================================================

export interface LegacySet {
  reps: number;
  weight: number;
}

export interface LegacyExercise {
  id: string;
  name: string;
  sets: LegacySet[];
}

export interface LegacyTemplate {
  id: string;
  name: string;
  exercises: LegacyExercise[];
}

/** The catalog fields the planner needs (from svj_list_exercises). */
export interface CatalogExerciseRef {
  id: string;
  name: string;
  slug: string;
  primaryMuscle: string;
}

export type ExerciseResolution =
  | {
      kind: "matched";
      legacy: LegacyExercise;
      exerciseId: string;
      exerciseName: string;
      primaryMuscle: string;
    }
  | { kind: "ambiguous"; legacy: LegacyExercise; candidates: CatalogExerciseRef[] }
  | { kind: "unmapped"; legacy: LegacyExercise; suggestion: string };

export interface TemplateImportPlan {
  legacyId: string;
  /** Stable identity: the same device template always yields the same key. */
  sourceKey: string;
  name: string;
  resolutions: ExerciseResolution[];
  matchedCount: number;
  unresolvedCount: number;
  /** True when at least one exercise can be imported. */
  importable: boolean;
}

export interface ImportedTemplateExercise {
  exercise_id: string;
  /** Catalog slug, so an imported template can launch the logger directly. */
  slug: string;
  name: string;
  primary_muscle: string;
  sets: { reps: number; weight_kg: number }[];
}

/** Lowercase, strip punctuation, collapse whitespace — never fuzzy. */
export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function legacySourceKey(legacyId: string): string {
  return `legacy-template:${legacyId}`;
}

function isUsableLegacyTemplate(value: unknown): value is LegacyTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Record<string, unknown>;
  if (typeof template.id !== "string" || template.id.length === 0) return false;
  if (typeof template.name !== "string") return false;
  if (!Array.isArray(template.exercises) || template.exercises.length === 0) return false;
  return template.exercises.every((exercise) => {
    if (!exercise || typeof exercise !== "object") return false;
    const e = exercise as Record<string, unknown>;
    return typeof e.id === "string" && typeof e.name === "string" && Array.isArray(e.sets);
  });
}

/**
 * Build one plan per importable legacy template. Ambiguity is resolved by the
 * user, never by picking the first candidate.
 */
export function planLegacyImport(
  templates: unknown[],
  catalog: CatalogExerciseRef[],
): TemplateImportPlan[] {
  const byName = new Map<string, CatalogExerciseRef[]>();
  for (const exercise of catalog) {
    const key = normalizeExerciseName(exercise.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), exercise]);
  }

  return templates.filter(isUsableLegacyTemplate).map((template) => {
    const resolutions: ExerciseResolution[] = template.exercises.map((legacy) => {
      const candidates = byName.get(normalizeExerciseName(legacy.name)) ?? [];
      if (candidates.length === 1) {
        return {
          kind: "matched",
          legacy,
          exerciseId: candidates[0].id,
          exerciseName: candidates[0].name,
          primaryMuscle: candidates[0].primaryMuscle,
        };
      }
      if (candidates.length > 1) return { kind: "ambiguous", legacy, candidates };
      return { kind: "unmapped", legacy, suggestion: legacy.name.trim() };
    });
    const matchedCount = resolutions.filter((r) => r.kind === "matched").length;
    return {
      legacyId: template.id,
      sourceKey: legacySourceKey(template.id),
      name: template.name.trim() || "Imported template",
      resolutions,
      matchedCount,
      unresolvedCount: resolutions.length - matchedCount,
      importable: matchedCount > 0,
    };
  });
}

/**
 * Turn a plan plus the user's resolutions into the import payload. `choices`
 * maps a legacy exercise id to a catalog exercise id the user selected (or to
 * "skip"). Exercises with no match and no choice are omitted — never guessed.
 */
export function buildImportPayload(
  plan: TemplateImportPlan,
  catalog: CatalogExerciseRef[],
  choices: Record<string, string> = {},
): { sourceKey: string; name: string; exercises: ImportedTemplateExercise[] } {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const exercises: ImportedTemplateExercise[] = [];

  for (const resolution of plan.resolutions) {
    const legacy = resolution.legacy;
    const chosen =
      choices[legacy.id] === "skip"
        ? null
        : (choices[legacy.id] ?? (resolution.kind === "matched" ? resolution.exerciseId : null));
    if (!chosen) continue;
    const catalogExercise =
      byId.get(chosen) ??
      (resolution.kind === "matched" && chosen === resolution.exerciseId
        ? {
            id: resolution.exerciseId,
            name: resolution.exerciseName,
            slug: "",
            primaryMuscle: resolution.primaryMuscle,
          }
        : undefined);
    if (!catalogExercise) continue;

    exercises.push({
      exercise_id: catalogExercise.id,
      slug: catalogExercise.slug,
      name: catalogExercise.name,
      primary_muscle: catalogExercise.primaryMuscle,
      sets: (legacy.sets ?? [])
        .filter((set) => Number.isFinite(set?.reps) && set.reps > 0)
        .slice(0, 30)
        .map((set) => ({
          reps: Math.round(set.reps),
          weight_kg: Number.isFinite(set.weight) && set.weight > 0 ? set.weight : 0,
        })),
    });
  }

  return { sourceKey: plan.sourceKey, name: plan.name, exercises };
}

/** Validate before calling the server so the user gets an instant reason. */
export function validateImportPayload(payload: {
  name: string;
  exercises: ImportedTemplateExercise[];
}): string | null {
  if (payload.name.trim().length < 2 || payload.name.trim().length > 80)
    return "Template names must be between 2 and 80 characters.";
  if (payload.exercises.length === 0)
    return "Choose at least one catalog exercise for this template.";
  if (payload.exercises.length > 20) return "A template supports up to 20 exercises.";
  return null;
}

/** Local templates whose source key has already been imported are not offered again. */
export function pendingLegacyTemplates(
  plans: TemplateImportPlan[],
  importedSourceKeys: string[],
): TemplateImportPlan[] {
  const imported = new Set(importedSourceKeys);
  return plans.filter((plan) => plan.importable && !imported.has(plan.sourceKey));
}
