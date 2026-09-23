-- ============================================================================
-- SVJ Fuel / Nutrition V2 foundation.
--
-- Additive, user-owned nutrition tracking with daily macro targets, meals and
-- reviewed meal items. Photo analysis is performed by an authenticated server
-- function; only the reviewed estimate is stored here. Raw meal photos are not
-- persisted by this migration.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.svj_nutrition_targets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calories integer NOT NULL CHECK (calories BETWEEN 800 AND 10000),
  protein_g numeric(8,2) NOT NULL CHECK (protein_g BETWEEN 0 AND 1000),
  carbs_g numeric(8,2) NOT NULL CHECK (carbs_g BETWEEN 0 AND 2000),
  fat_g numeric(8,2) NOT NULL CHECK (fat_g BETWEEN 0 AND 1000),
  fiber_g numeric(8,2) NOT NULL DEFAULT 25 CHECK (fiber_g BETWEEN 0 AND 200),
  water_ml integer NOT NULL DEFAULT 2500 CHECK (water_ml BETWEEN 0 AND 15000),
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('body_profile','custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.svj_nutrition_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_key date NOT NULL,
  eaten_at timestamptz NOT NULL DEFAULT now(),
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','photo_ai','repeat')),
  calories integer NOT NULL DEFAULT 0 CHECK (calories BETWEEN 0 AND 10000),
  protein_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (protein_g BETWEEN 0 AND 1000),
  carbs_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (carbs_g BETWEEN 0 AND 2000),
  fat_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (fat_g BETWEEN 0 AND 1000),
  fiber_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (fiber_g BETWEEN 0 AND 200),
  ai_estimated boolean NOT NULL DEFAULT false,
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS svj_nutrition_meals_user_day_idx
  ON public.svj_nutrition_meals (user_id, day_key DESC, eaten_at DESC);

CREATE TABLE IF NOT EXISTS public.svj_nutrition_meal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL REFERENCES public.svj_nutrition_meals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 50),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  serving_label text CHECK (serving_label IS NULL OR char_length(serving_label) <= 80),
  calories integer NOT NULL DEFAULT 0 CHECK (calories BETWEEN 0 AND 5000),
  protein_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (protein_g BETWEEN 0 AND 500),
  carbs_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (carbs_g BETWEEN 0 AND 1000),
  fat_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (fat_g BETWEEN 0 AND 500),
  fiber_g numeric(8,2) NOT NULL DEFAULT 0 CHECK (fiber_g BETWEEN 0 AND 100),
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS svj_nutrition_items_meal_idx
  ON public.svj_nutrition_meal_items (meal_id, position);

ALTER TABLE public.svj_nutrition_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_nutrition_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.svj_nutrition_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_nutrition_meals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.svj_nutrition_meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_nutrition_meal_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_nutrition_targets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.svj_nutrition_meals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.svj_nutrition_meal_items FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.svj_nutrition_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.svj_nutrition_meals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.svj_nutrition_meal_items TO authenticated;
GRANT ALL ON public.svj_nutrition_targets TO service_role;
GRANT ALL ON public.svj_nutrition_meals TO service_role;
GRANT ALL ON public.svj_nutrition_meal_items TO service_role;

DROP POLICY IF EXISTS "Users manage own nutrition targets" ON public.svj_nutrition_targets;
CREATE POLICY "Users manage own nutrition targets"
  ON public.svj_nutrition_targets FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own nutrition meals" ON public.svj_nutrition_meals;
CREATE POLICY "Users manage own nutrition meals"
  ON public.svj_nutrition_meals FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own nutrition meal items" ON public.svj_nutrition_meal_items;
CREATE POLICY "Users manage own nutrition meal items"
  ON public.svj_nutrition_meal_items FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.svj_nutrition_meals m
      WHERE m.id = meal_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.svj_nutrition_meals m
      WHERE m.id = meal_id AND m.user_id = auth.uid()
    )
  );

COMMIT;
