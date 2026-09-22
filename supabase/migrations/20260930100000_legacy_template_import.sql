-- ============================================================================
-- Automated Training — safe LEGACY TEMPLATE IMPORT.
--
-- ADDITIVE. Local (browser) templates were never evidence of a signed-in
-- account, so they must not be uploaded silently. This migration adds the
-- storage and one explicit, idempotent import path:
--
--   * svj_workout_templates gains owner_user_id + source_key. A NULL owner is a
--     global reviewed catalog row (unchanged, readable by everyone); a non-NULL
--     owner is a private template readable only by that user.
--   * (owner, source_key) is unique, so re-importing the same legacy template
--     updates nothing and creates no duplicate card.
--   * The import RPC never awards XP, never marks anything performed and never
--     accepts an exercise that is not in the global catalog or owned by the
--     caller. The browser keeps its originals until the server acknowledges.
-- ============================================================================

BEGIN;

ALTER TABLE public.svj_workout_templates
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.svj_workout_templates
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS svj_workout_templates_owner_source_unique
  ON public.svj_workout_templates (owner_user_id, source_key)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS svj_workout_templates_owner_idx
  ON public.svj_workout_templates (owner_user_id, created_at DESC)
  WHERE owner_user_id IS NOT NULL;

-- Private templates are readable only by their owner. The published-catalog
-- policy from 20260926000000 stays in force for global rows.
DROP POLICY IF EXISTS "Owners read their own templates" ON public.svj_workout_templates;
CREATE POLICY "Owners read their own templates"
  ON public.svj_workout_templates FOR SELECT TO authenticated
  USING (owner_user_id IS NOT NULL AND owner_user_id = auth.uid());

-- The original published-catalog policy read EVERY version payload with
-- a permissive full-row predicate. That was harmless while every row was global,
-- but private imports make it a privacy hole: any signed-in account could read another
-- account's template exercises. Re-scope it to published rows plus the caller's
-- own. Payloads of the reviewed catalog stay readable exactly as before.
DROP POLICY IF EXISTS "Anyone reads template versions" ON public.svj_workout_template_versions;
DROP POLICY IF EXISTS "Owners read their own template versions" ON public.svj_workout_template_versions;
CREATE POLICY "Anyone reads template versions"
  ON public.svj_workout_template_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.svj_workout_templates t
       WHERE t.id = template_id
         AND (t.is_published = true OR t.owner_user_id = auth.uid())
    )
  );

-- ── Import one legacy template (idempotent by owner + source key) ──────────
-- p_exercises: [{ exercise_id, name, primary_muscle, sets: [{reps, weight_kg}] }]
CREATE OR REPLACE FUNCTION public.svj_import_legacy_template(
  p_source_key text,
  p_name text,
  p_exercises jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_source_key text := btrim(COALESCE(p_source_key, ''));
  v_name text := btrim(COALESCE(p_name, ''));
  v_template_id text;
  v_new_id text;
  v_inserted boolean := false;
  v_exercise jsonb;
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF char_length(v_source_key) < 8 OR char_length(v_source_key) > 120 THEN
    RAISE EXCEPTION 'Invalid template source';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Template names are between 2 and 80 characters';
  END IF;
  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array'
     OR jsonb_array_length(p_exercises) < 1 OR jsonb_array_length(p_exercises) > 20 THEN
    RAISE EXCEPTION 'A template needs between 1 and 20 mapped exercises';
  END IF;

  -- Every referenced exercise must exist globally or belong to the caller.
  FOR v_exercise IN SELECT value FROM jsonb_array_elements(p_exercises) LOOP
    IF v_exercise->>'exercise_id' IS NULL THEN
      RAISE EXCEPTION 'Each mapped exercise needs an exercise id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.svj_exercises e
       WHERE e.id = (v_exercise->>'exercise_id')::uuid
         AND (e.owner_user_id IS NULL OR e.owner_user_id = v_user_id)
    ) THEN
      RAISE EXCEPTION 'Unknown exercise';
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN RAISE EXCEPTION 'Nothing to import'; END IF;

  v_template_id := 'user_' || replace(v_user_id::text, '-', '') || '_' || substr(md5(v_source_key), 1, 12);

  INSERT INTO public.svj_workout_templates (
    id, family, variant, name, current_version, is_published, owner_user_id, source_key
  ) VALUES (
    v_template_id, 'full_body', 'A', v_name, 1, false, v_user_id, v_source_key
  )
  ON CONFLICT (owner_user_id, source_key) WHERE owner_user_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_new_id;
  v_inserted := FOUND;

  IF v_inserted THEN
    v_template_id := v_new_id;
  ELSE
    SELECT id INTO v_template_id FROM public.svj_workout_templates
     WHERE owner_user_id = v_user_id AND source_key = v_source_key;
    IF v_template_id IS NULL THEN RAISE EXCEPTION 'Could not import this template'; END IF;
  END IF;

  INSERT INTO public.svj_workout_template_versions (template_id, version, payload)
  VALUES (
    v_template_id,
    1,
    jsonb_build_object('legacy', true, 'importedFrom', v_source_key, 'exercises', p_exercises)
  )
  ON CONFLICT (template_id, version) DO NOTHING;

  -- Appears in the user's library once; never marked as performed.
  INSERT INTO public.svj_user_template_library (user_id, template_id, template_version)
  VALUES (v_user_id, v_template_id, 1)
  ON CONFLICT (user_id, template_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'template_id', v_template_id,
    'duplicate', NOT v_inserted
  );
END;
$$;

-- ── The caller's imported (owned) templates, with their stored payload ─────
CREATE OR REPLACE FUNCTION public.svj_list_my_owned_templates()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true, 'templates', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'sourceKey', t.source_key,
      'exercises', COALESCE((
        SELECT v.payload->'exercises'
          FROM public.svj_workout_template_versions v
         WHERE v.template_id = t.id
         ORDER BY v.version DESC
         LIMIT 1
      ), '[]'::jsonb)
    ) ORDER BY t.created_at DESC)
    FROM public.svj_workout_templates t
    WHERE t.owner_user_id = auth.uid()
  ), '[]'::jsonb));
$$;

-- Functions are EXECUTE-to-PUBLIC by default, which a plain GRANT does not
-- tighten. Revoke first so only a signed-in caller can reach them at all.
REVOKE ALL ON FUNCTION public.svj_import_legacy_template(text, text, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_list_my_owned_templates() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.svj_import_legacy_template(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_my_owned_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_import_legacy_template(text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_list_my_owned_templates() TO service_role;

COMMIT;
