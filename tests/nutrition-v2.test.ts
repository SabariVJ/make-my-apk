import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Nutrition V2 persistence and security", () => {
  const migration = read("supabase/migrations/20261002000000_nutrition_v2.sql");
  const quotaMigration = read("supabase/migrations/20261002010000_nutrition_scan_usage.sql");
  const server = read("src/lib/nutrition.functions.ts");
  const view = read("src/app/views/NutritionView.tsx");

  it("persists user-owned targets, meals and meal items behind RLS", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_nutrition_targets/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_nutrition_meals/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_nutrition_meal_items/);
    assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
    assert.match(migration, /auth\.uid\(\) = user_id/);
  });

  it("never exposes an AI provider key to the client bundle", () => {
    assert.match(server, /process\.env\["LOVABLE_API_KEY"\]/);
    assert.doesNotMatch(view, /LOVABLE_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY/);
  });

  it("enforces a server-side scan quota from auth identity and Plus status", () => {
    assert.match(quotaMigration, /auth\.uid\(\)/);
    assert.match(quotaMigration, /is_plus_member/);
    assert.match(quotaMigration, /CASE WHEN v_plus THEN 20 ELSE 3 END/);
    assert.match(server, /svj_claim_nutrition_scan/);
  });

  it("requires AI scans to pass through a review state before saving", () => {
    assert.match(view, /nutrition-scan-review/);
    assert.match(view, /Review estimate/);
    assert.match(view, /saveScannedMeal/);
    assert.match(view, /source: "photo_ai"/);
  });

  it("keeps manual logging available when photo analysis is unavailable", () => {
    assert.match(view, /Manual/);
    assert.match(view, /saveManual/);
    assert.match(view, /source: "manual"/);
  });

  it("supports Breakfast, Lunch, Dinner and Snack grouping", () => {
    assert.match(view, /breakfast: "Breakfast"/);
    assert.match(view, /lunch: "Lunch"/);
    assert.match(view, /dinner: "Dinner"/);
    assert.match(view, /snack: "Snack"/);
  });

  it("shows calories and all three primary macros plus 7-day history", () => {
    assert.match(view, /Protein/);
    assert.match(view, /Carbs/);
    assert.match(view, /Fat/);
    assert.match(view, /Last 7 days/);
  });

  it("supports quick relog from real saved meals", () => {
    assert.match(view, /source: "repeat"/);
    assert.match(view, /Log again/);
  });
});

describe("Training rebuild regression", () => {
  const today = read("src/app/components/TrainingToday.tsx");

  it("reopens the setup flow instead of silently rebuilding identical choices", () => {
    assert.match(today, /setEditingSetup\(true\)/);
    assert.match(today, /training-rebuild-setup/);
    assert.match(today, /Change your goal, days, session length or equipment/);
  });
});
