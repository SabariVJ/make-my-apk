/**
 * Automated Training — legacy (on-device) template import.
 *
 * The plan is deliberately conservative: an exercise is matched only when the
 * catalog is unambiguous, muscle metadata is never guessed from a name, and
 * nothing is uploaded without the user's confirmation. These tests pin that
 * behaviour and the wiring that keeps the local originals untouched.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildImportPayload,
  legacySourceKey,
  normalizeExerciseName,
  pendingLegacyTemplates,
  planLegacyImport,
  validateImportPayload,
  type CatalogExerciseRef,
  type LegacyTemplate,
} from "../src/app/lib/legacyTemplateImport";

const catalog: CatalogExerciseRef[] = [
  { id: "ex-bench", name: "Barbell Bench Press", slug: "bench_press", primaryMuscle: "chest" },
  {
    id: "ex-bench-db",
    name: "Dumbbell Bench Press",
    slug: "dumbbell_bench_press",
    primaryMuscle: "chest",
  },
  { id: "ex-squat", name: "Back Squat", slug: "back_squat", primaryMuscle: "quads" },
];

const legacy = (exercises: { id: string; name: string }[]): LegacyTemplate => ({
  id: "local-1",
  name: "My Old Push Day",
  exercises: exercises.map((e) => ({ ...e, sets: [{ reps: 8, weight: 50 }] })),
});

describe("exercise name normalization", () => {
  it("is case, punctuation and whitespace insensitive", () => {
    assert.equal(normalizeExerciseName("  Barbell-Bench   Press!! "), "barbell bench press");
    assert.equal(normalizeExerciseName("BENCH PRESS"), "bench press");
  });

  it("does not collapse genuinely different names", () => {
    assert.notEqual(
      normalizeExerciseName("Dumbbell Bench Press"),
      normalizeExerciseName("Barbell Bench Press"),
    );
  });
});

describe("import planning", () => {
  it("uses a stable source key for the same device template", () => {
    assert.equal(legacySourceKey("local-1"), legacySourceKey("local-1"));
    assert.notEqual(legacySourceKey("local-1"), legacySourceKey("local-2"));
  });

  it("matches an exercise only when exactly one catalog entry agrees", () => {
    const [plan] = planLegacyImport([legacy([{ id: "a", name: "Back Squat" }])], catalog);
    assert.equal(plan.resolutions[0].kind, "matched");
    assert.equal(plan.matchedCount, 1);
    assert.equal(plan.unresolvedCount, 0);
  });

  it("surfaces ambiguity instead of picking the first candidate", () => {
    const [plan] = planLegacyImport(
      [legacy([{ id: "a", name: "Chest Press" }])],
      [
        { id: "m1", name: "Chest Press", slug: "chest_press_machine", primaryMuscle: "chest" },
        { id: "m2", name: "Chest Press", slug: "chest_press_other", primaryMuscle: "chest" },
      ],
    );
    assert.equal(plan.resolutions[0].kind, "ambiguous");
    assert.equal((plan.resolutions[0] as { candidates: unknown[] }).candidates.length, 2);
    assert.equal(plan.matchedCount, 0);
    assert.equal(plan.importable, false);
  });

  it("never guesses muscle metadata for an unknown name", () => {
    const [plan] = planLegacyImport([legacy([{ id: "a", name: "Zercher Fandango" }])], catalog);
    assert.equal(plan.resolutions[0].kind, "unmapped");
    assert.equal(plan.unresolvedCount, 1);
    assert.equal(plan.matchedCount, 0);
  });

  it("ignores malformed local templates rather than importing junk", () => {
    const plans = planLegacyImport(
      [{ id: "", name: "No id", exercises: [] }, { name: "No id" }, null as never],
      catalog,
    );
    assert.equal(plans.length, 0);
  });

  it("builds a payload only from confirmed mappings", () => {
    const [plan] = planLegacyImport(
      [
        legacy([
          { id: "a", name: "Back Squat" },
          { id: "b", name: "Zercher Fandango" },
        ]),
      ],
      catalog,
    );
    const payload = buildImportPayload(plan, catalog);
    assert.equal(payload.exercises.length, 1, "the unmapped exercise is not invented");
    assert.equal(payload.exercises[0].exercise_id, "ex-squat");
    assert.equal(payload.exercises[0].primary_muscle, "quads");
    assert.equal(payload.sourceKey, legacySourceKey("local-1"));
  });

  it("honors a user's explicit mapping and skip choice", () => {
    const [plan] = planLegacyImport(
      [
        legacy([
          { id: "a", name: "Zercher Fandango" },
          { id: "b", name: "Chest Press" },
        ]),
      ],
      catalog,
    );
    const mapped = buildImportPayload(plan, catalog, { a: "ex-bench", b: "skip" });
    assert.deepEqual(
      mapped.exercises.map((e) => e.exercise_id),
      ["ex-bench"],
    );
    const skipped = buildImportPayload(plan, catalog, { a: "skip", b: "skip" });
    assert.equal(skipped.exercises.length, 0);
  });

  it("drops non-positive sets instead of recording them", () => {
    const plan = planLegacyImport(
      [
        {
          id: "local-1",
          name: "Odd Sets",
          exercises: [
            {
              id: "a",
              name: "Back Squat",
              sets: [
                { reps: 8, weight: 60 },
                { reps: 0, weight: 60 },
                { reps: 5, weight: -10 },
              ],
            },
          ],
        },
      ],
      catalog,
    );
    const payload = buildImportPayload(plan, catalog);
    assert.equal(payload.exercises[0].sets.length, 1);
    assert.equal(payload.exercises[0].sets[0].weight_kg, 0, "a negative load is never recorded");
  });

  it("validates the payload before it reaches the server", () => {
    assert.ok(validateImportPayload({ name: "x", exercises: [] }));
    assert.ok(
      validateImportPayload({
        name: "ok",
        exercises: [
          { exercise_id: "a", name: "A", primary_muscle: "chest", sets: [] },
        ],
      }) === null,
    );
  });

  it("does not offer an already-imported template again", () => {
    const plans = planLegacyImport([legacy([{ id: "a", name: "Back Squat" }])], catalog);
    assert.equal(pendingLegacyTemplates(plans, []).length, 1);
    assert.equal(pendingLegacyTemplates(plans, [legacySourceKey("local-1")]).length, 0);
  });
});

describe("import surface wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("is reachable from the Train surface without a new nav destination", () => {
    const browser = read("src/app/components/TemplateBrowser.tsx");
    assert.match(browser, /LegacyTemplateImportCard/);
    const view = read("src/app/views/WorkoutView.tsx");
    assert.match(view, /deviceTemplates=\{workoutTemplates/);
  });

  it("requires an explicit confirmation and shows the user what moves", () => {
    const card = read("src/app/components/LegacyTemplateImportCard.tsx");
    assert.match(card, /data-testid="legacy-template-import-confirm"/);
    assert.match(card, /Import these templates/);
    assert.match(card, /SVJ never guesses/);
  });

  it("never deletes the device originals and never awards XP", () => {
    const card = read("src/app/components/LegacyTemplateImportCard.tsx");
    assert.doesNotMatch(card, /deleteWorkoutTemplate|awardXp|completeChallenge/);
    assert.match(card, /device copies stay until the server confirms/);
    const sql = read("supabase/migrations/20260931000000_legacy_template_import.sql");
    assert.match(sql, /svj_import_legacy_template/);
    assert.doesNotMatch(sql, /svj_award|xp_award/);
  });

  it("scopes the import to the caller and keeps it idempotent", () => {
    const sql = read("supabase/migrations/20260931000000_legacy_template_import.sql");
    assert.match(sql, /owner_user_id = auth\.uid\(\)/);
    assert.match(sql, /ON CONFLICT \(owner_user_id, source_key\)/);
    assert.match(sql, /'duplicate', NOT v_inserted/);
    assert.match(sql, /IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'/);
  });

  it("keeps private template payloads private", () => {
    const sql = read("supabase/migrations/20260931000000_legacy_template_import.sql");
    assert.doesNotMatch(
      sql,
      /USING \(true\)/,
      "a published-catalog policy must not expose another account's private payload",
    );
    assert.match(sql, /t\.is_published = true OR t\.owner_user_id = auth\.uid\(\)/);
  });

  it("does not let the anon role reach the import RPCs", () => {
    const sql = read("supabase/migrations/20260931000000_legacy_template_import.sql");
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.svj_import_legacy_template/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.svj_list_my_owned_templates/);
  });
});
