-- ============================================================================
-- Automated Training system — Phase 1 foundation.
--
-- ADDITIVE ONLY. Nothing here rewrites the canonical strength pipeline
-- (20260918000000_strength_logging.sql), the activity ledger, XP or rewards.
-- Structured workouts still save through svj_save_strength_activity; this adds
-- the planning layer AROUND that canonical record:
--
--   svj_training_profiles          one owned profile per user
--   svj_workout_templates          global catalog identity (read-only to users)
--   svj_workout_template_versions  immutable published snapshots
--   svj_user_template_library      per-user save/pin/archive/usage metadata
--   svj_training_plans             one ACTIVE plan per user
--   svj_training_plan_sessions     ordered slots; one finalized activity each
--   svj_activity_training_context  links a canonical activity to its slot
--   svj_training_decisions         progression-decision audit trail
--
-- Security: every user-scoped table is RLS-protected and READ-ONLY from the
-- client. All writes go through SECURITY DEFINER RPCs that derive identity from
-- auth.uid() — a client can never set another user's id.
-- ============================================================================

BEGIN;

-- ── 0) Forward-compatible warm-up classification on canonical sets ─────────
-- Existing rows legitimately remain false (unknown ⇒ not a warm-up claim).
ALTER TABLE public.svj_strength_sets
  ADD COLUMN IF NOT EXISTS is_warmup boolean NOT NULL DEFAULT false;

-- Movement metadata on the exercise catalog. Additive with safe defaults so
-- existing custom exercises keep working untouched.
ALTER TABLE public.svj_exercises
  ADD COLUMN IF NOT EXISTS movement_pattern text;
ALTER TABLE public.svj_exercises
  ADD COLUMN IF NOT EXISTS load_convention text;
ALTER TABLE public.svj_exercises
  ADD COLUMN IF NOT EXISTS equipment text[] NOT NULL DEFAULT '{}'::text[];

-- ── 1) Training profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_training_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 2 CHECK (version BETWEEN 1 AND 100),
  setup_complete boolean NOT NULL DEFAULT false,
  experience text NOT NULL DEFAULT 'beginner'
    CHECK (experience IN ('beginner', 'intermediate', 'veteran')),
  goal text NOT NULL DEFAULT 'general'
    CHECK (goal IN ('muscle', 'athletic', 'strength', 'general')),
  secondary_goal text CHECK (secondary_goal IS NULL OR secondary_goal IN (
    'muscle', 'athletic', 'strength', 'general'
  )),
  available_days integer[] NOT NULL DEFAULT '{1,3,5}'::integer[]
    CHECK (available_days <@ ARRAY[0,1,2,3,4,5,6]::integer[]),
  sessions_per_week integer NOT NULL DEFAULT 3 CHECK (sessions_per_week BETWEEN 1 AND 6),
  session_minutes integer NOT NULL DEFAULT 45 CHECK (session_minutes BETWEEN 20 AND 150),
  equipment text[] NOT NULL DEFAULT '{full_gym}'::text[]
    CHECK (equipment <@ ARRAY['full_gym','dumbbells','bands','bodyweight']::text[]),
  avoid_movements text[] NOT NULL DEFAULT '{}'::text[],
  familiar_movements text[] NOT NULL DEFAULT '{}'::text[],
  prefers_machines boolean NOT NULL DEFAULT false,
  units text NOT NULL DEFAULT 'kg' CHECK (units IN ('kg', 'lb')),
  load_convention text NOT NULL DEFAULT 'barbell_total' CHECK (load_convention IN (
    'barbell_total','dumbbell_per_hand','machine_stack','assisted','cable','bodyweight_added'
  )),
  athlete jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.svj_training_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_training_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_training_profiles TO authenticated;
GRANT ALL ON public.svj_training_profiles TO service_role;

DROP POLICY IF EXISTS "Users read own training profile" ON public.svj_training_profiles;
CREATE POLICY "Users read own training profile"
  ON public.svj_training_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 2) Template catalog identity + immutable versions ──────────────────────
CREATE TABLE IF NOT EXISTS public.svj_workout_templates (
  id text PRIMARY KEY,
  family text NOT NULL CHECK (family IN (
    'full_body','upper','lower','push','pull','legs','athletic_full_body'
  )),
  variant text NOT NULL DEFAULT 'A' CHECK (variant IN ('A', 'B')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.svj_workout_template_versions (
  template_id text NOT NULL REFERENCES public.svj_workout_templates(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);

ALTER TABLE public.svj_workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_workout_template_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_workout_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.svj_workout_template_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_workout_templates TO authenticated;
GRANT SELECT ON public.svj_workout_template_versions TO authenticated;
GRANT ALL ON public.svj_workout_templates TO service_role;
GRANT ALL ON public.svj_workout_template_versions TO service_role;

-- Global catalog: readable by any authenticated user, writable only by the
-- service role / SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Anyone reads published templates" ON public.svj_workout_templates;
CREATE POLICY "Anyone reads published templates"
  ON public.svj_workout_templates FOR SELECT TO authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "Anyone reads template versions" ON public.svj_workout_template_versions;
CREATE POLICY "Anyone reads template versions"
  ON public.svj_workout_template_versions FOR SELECT TO authenticated
  USING (true);

-- Seed catalog IDENTITY only. The reviewed exercise payload is authored in the
-- application (single source of truth) and snapshotted immutably on first use.
INSERT INTO public.svj_workout_templates (id, family, variant, name, current_version, is_published)
VALUES
  ('full_body_a', 'full_body', 'A', 'Full Body A', 1, true),
  ('full_body_b', 'full_body', 'B', 'Full Body B', 1, true),
  ('upper_a', 'upper', 'A', 'Upper A', 1, true),
  ('upper_b', 'upper', 'B', 'Upper B', 1, true),
  ('lower_a', 'lower', 'A', 'Lower A', 1, true),
  ('lower_b', 'lower', 'B', 'Lower B', 1, true),
  ('push_a', 'push', 'A', 'Push A', 1, true),
  ('push_b', 'push', 'B', 'Push B', 1, true),
  ('pull_a', 'pull', 'A', 'Pull A', 1, true),
  ('pull_b', 'pull', 'B', 'Pull B', 1, true),
  ('legs_a', 'legs', 'A', 'Legs A', 1, true),
  ('legs_b', 'legs', 'B', 'Legs B', 1, true),
  ('athletic_full_body_a', 'athletic_full_body', 'A', 'Athletic Full Body A', 1, true)
ON CONFLICT (id) DO NOTHING;

-- ── 3) Per-user template library ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_user_template_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id text NOT NULL REFERENCES public.svj_workout_templates(id) ON DELETE CASCADE,
  template_version integer NOT NULL DEFAULT 1,
  custom_name text CHECK (custom_name IS NULL OR char_length(btrim(custom_name)) BETWEEN 1 AND 80),
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_user_template_library_unique UNIQUE (user_id, template_id)
);

CREATE INDEX IF NOT EXISTS svj_user_template_library_user_idx
  ON public.svj_user_template_library (user_id, archived, updated_at DESC);

ALTER TABLE public.svj_user_template_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_user_template_library FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_user_template_library TO authenticated;
GRANT ALL ON public.svj_user_template_library TO service_role;

DROP POLICY IF EXISTS "Users read own template library" ON public.svj_user_template_library;
CREATE POLICY "Users read own template library"
  ON public.svj_user_template_library FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 4) Training plans + ordered sessions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  split_id text NOT NULL,
  split_name text NOT NULL,
  block_start date NOT NULL,
  block_end date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_training_plans_block_order CHECK (block_end >= block_start)
);

-- At most ONE active plan per user (a safer equivalent of the plan invariant).
CREATE UNIQUE INDEX IF NOT EXISTS svj_training_plans_one_active
  ON public.svj_training_plans (user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.svj_training_plan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.svj_training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_index integer NOT NULL CHECK (slot_index BETWEEN 0 AND 40),
  template_id text NOT NULL REFERENCES public.svj_workout_templates(id) ON DELETE RESTRICT,
  template_version integer NOT NULL DEFAULT 1,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'skipped', 'moved')),
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_activity_id uuid REFERENCES public.svj_activities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_training_plan_sessions_slot_unique UNIQUE (plan_id, slot_index)
);

CREATE INDEX IF NOT EXISTS svj_training_plan_sessions_user_idx
  ON public.svj_training_plan_sessions (user_id, scheduled_date);

ALTER TABLE public.svj_training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_training_plan_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_training_plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.svj_training_plan_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_training_plans TO authenticated;
GRANT SELECT ON public.svj_training_plan_sessions TO authenticated;
GRANT ALL ON public.svj_training_plans TO service_role;
GRANT ALL ON public.svj_training_plan_sessions TO service_role;

DROP POLICY IF EXISTS "Users read own plans" ON public.svj_training_plans;
CREATE POLICY "Users read own plans"
  ON public.svj_training_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own plan sessions" ON public.svj_training_plan_sessions;
CREATE POLICY "Users read own plan sessions"
  ON public.svj_training_plan_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 5) Activity ⇄ training context link ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_activity_training_context (
  activity_id uuid PRIMARY KEY REFERENCES public.svj_activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.svj_training_plans(id) ON DELETE SET NULL,
  plan_session_id uuid REFERENCES public.svj_training_plan_sessions(id) ON DELETE SET NULL,
  template_id text REFERENCES public.svj_workout_templates(id) ON DELETE SET NULL,
  template_version integer,
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS svj_activity_training_context_user_idx
  ON public.svj_activity_training_context (user_id, created_at DESC);

ALTER TABLE public.svj_activity_training_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_activity_training_context FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_activity_training_context TO authenticated;
GRANT ALL ON public.svj_activity_training_context TO service_role;

DROP POLICY IF EXISTS "Users read own training context" ON public.svj_activity_training_context;
CREATE POLICY "Users read own training context"
  ON public.svj_activity_training_context FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 6) Progression decision audit ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_training_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_slug text NOT NULL,
  activity_id uuid REFERENCES public.svj_activities(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'hold','increase','reduce','reentry','stop_pain','new_baseline','none'
  )),
  rationale text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS svj_training_decisions_user_idx
  ON public.svj_training_decisions (user_id, created_at DESC);

ALTER TABLE public.svj_training_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_training_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_training_decisions TO authenticated;
GRANT ALL ON public.svj_training_decisions TO service_role;

DROP POLICY IF EXISTS "Users read own training decisions" ON public.svj_training_decisions;
CREATE POLICY "Users read own training decisions"
  ON public.svj_training_decisions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- RPCs
-- ============================================================================

-- ── 7) Training profile read/write ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_get_my_training_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.svj_training_profiles;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_row FROM public.svj_training_profiles WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'profile', NULL);
  END IF;
  RETURN jsonb_build_object('ok', true, 'profile', jsonb_build_object(
    'version', v_row.version,
    'setupComplete', v_row.setup_complete,
    'experience', v_row.experience,
    'goal', v_row.goal,
    'secondaryGoal', v_row.secondary_goal,
    'availableDays', to_jsonb(v_row.available_days),
    'sessionsPerWeek', v_row.sessions_per_week,
    'sessionMinutes', v_row.session_minutes,
    'equipment', to_jsonb(v_row.equipment),
    'avoidMovements', to_jsonb(v_row.avoid_movements),
    'familiarMovements', to_jsonb(v_row.familiar_movements),
    'prefersMachines', v_row.prefers_machines,
    'units', v_row.units,
    'loadConvention', v_row.load_convention,
    'athlete', v_row.athlete,
    'updatedAt', v_row.updated_at
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_save_training_profile(p_profile jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Invalid profile payload';
  END IF;

  INSERT INTO public.svj_training_profiles (
    user_id, version, setup_complete, experience, goal, secondary_goal,
    available_days, sessions_per_week, session_minutes, equipment,
    avoid_movements, familiar_movements, prefers_machines, units,
    load_convention, athlete, updated_at
  ) VALUES (
    v_user_id,
    COALESCE((p_profile->>'version')::integer, 2),
    COALESCE((p_profile->>'setupComplete')::boolean, false),
    COALESCE(p_profile->>'experience', 'beginner'),
    COALESCE(p_profile->>'goal', 'general'),
    NULLIF(p_profile->>'secondaryGoal', ''),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_profile->'availableDays'))::integer[], '{1,3,5}'),
    COALESCE((p_profile->>'sessionsPerWeek')::integer, 3),
    COALESCE((p_profile->>'sessionMinutes')::integer, 45),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_profile->'equipment'))::text[], '{full_gym}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_profile->'avoidMovements'))::text[], '{}'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_profile->'familiarMovements'))::text[], '{}'),
    COALESCE((p_profile->>'prefersMachines')::boolean, false),
    COALESCE(p_profile->>'units', 'kg'),
    COALESCE(p_profile->>'loadConvention', 'barbell_total'),
    COALESCE(p_profile->'athlete', '{}'::jsonb),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    version = EXCLUDED.version,
    setup_complete = EXCLUDED.setup_complete,
    experience = EXCLUDED.experience,
    goal = EXCLUDED.goal,
    secondary_goal = EXCLUDED.secondary_goal,
    available_days = EXCLUDED.available_days,
    sessions_per_week = EXCLUDED.sessions_per_week,
    session_minutes = EXCLUDED.session_minutes,
    equipment = EXCLUDED.equipment,
    avoid_movements = EXCLUDED.avoid_movements,
    familiar_movements = EXCLUDED.familiar_movements,
    prefers_machines = EXCLUDED.prefers_machines,
    units = EXCLUDED.units,
    load_convention = EXCLUDED.load_convention,
    athlete = EXCLUDED.athlete,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 8) Template catalog read ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_list_workout_templates()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true, 'templates', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id,
      'family', t.family,
      'variant', t.variant,
      'name', t.name,
      'currentVersion', t.current_version
    ) ORDER BY t.family, t.variant)
    FROM public.svj_workout_templates t
    WHERE t.is_published = true
  ), '[]'::jsonb));
$$;

-- ── 9) Template library ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_save_my_template(
  p_template_id text,
  p_custom_name text DEFAULT NULL,
  p_pinned boolean DEFAULT NULL,
  p_archived boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_version integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT current_version INTO v_version
    FROM public.svj_workout_templates WHERE id = p_template_id AND is_published = true;
  IF v_version IS NULL THEN RAISE EXCEPTION 'Unknown template'; END IF;

  INSERT INTO public.svj_user_template_library (
    user_id, template_id, template_version, custom_name, pinned, archived, updated_at
  ) VALUES (
    v_user_id, p_template_id, v_version, NULLIF(btrim(COALESCE(p_custom_name, '')), ''),
    COALESCE(p_pinned, false), COALESCE(p_archived, false), now()
  )
  ON CONFLICT (user_id, template_id) DO UPDATE SET
    custom_name = COALESCE(EXCLUDED.custom_name, public.svj_user_template_library.custom_name),
    pinned = COALESCE(p_pinned, public.svj_user_template_library.pinned),
    archived = COALESCE(p_archived, public.svj_user_template_library.archived),
    template_version = GREATEST(public.svj_user_template_library.template_version, EXCLUDED.template_version),
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_remove_my_template(p_template_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  DELETE FROM public.svj_user_template_library
    WHERE user_id = v_user_id AND template_id = p_template_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_list_my_template_library()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true, 'library', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'templateId', l.template_id,
      'templateVersion', l.template_version,
      'customName', l.custom_name,
      'pinned', l.pinned,
      'archived', l.archived,
      'useCount', l.use_count,
      'lastCompletedAt', l.last_completed_at
    ) ORDER BY l.pinned DESC, l.updated_at DESC)
    FROM public.svj_user_template_library l
    WHERE l.user_id = auth.uid()
  ), '[]'::jsonb));
$$;

-- ── 10) Create a plan (archives the previous active one) ───────────────────
-- p_payload: { split_id, split_name, policy_version, block_start, block_end,
--              templates: [{id, family, variant, name, version, payload}],
--              sessions:  [{slot_index, template_id, template_version,
--                            scheduled_date, targets}] }
CREATE OR REPLACE FUNCTION public.svj_create_training_plan(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_template jsonb;
  v_session jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid plan payload';
  END IF;

  -- Preserve history: archive, never delete, any prior active plan.
  UPDATE public.svj_training_plans
    SET status = 'archived', updated_at = now()
    WHERE user_id = v_user_id AND status = 'active';

  -- Snapshot reviewed template identities + immutable versions (created once).
  FOR v_template IN SELECT jsonb_array_elements(COALESCE(p_payload->'templates', '[]'::jsonb))
  LOOP
    INSERT INTO public.svj_workout_templates (id, family, variant, name, current_version, is_published)
    VALUES (
      v_template->>'id',
      v_template->>'family',
      COALESCE(v_template->>'variant', 'A'),
      COALESCE(v_template->>'name', v_template->>'id'),
      COALESCE((v_template->>'version')::integer, 1),
      true
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.svj_workout_template_versions (template_id, version, payload)
    VALUES (
      v_template->>'id',
      COALESCE((v_template->>'version')::integer, 1),
      COALESCE(v_template->'payload', '{}'::jsonb)
    )
    ON CONFLICT (template_id, version) DO NOTHING;
  END LOOP;

  INSERT INTO public.svj_training_plans (
    user_id, policy_version, split_id, split_name, block_start, block_end, status
  ) VALUES (
    v_user_id,
    COALESCE(p_payload->>'policy_version', 'unknown'),
    COALESCE(p_payload->>'split_id', 'custom'),
    COALESCE(p_payload->>'split_name', 'Training plan'),
    COALESCE((p_payload->>'block_start')::date, CURRENT_DATE),
    COALESCE((p_payload->>'block_end')::date, CURRENT_DATE + 27),
    'active'
  )
  RETURNING id INTO v_plan_id;

  FOR v_session IN SELECT jsonb_array_elements(COALESCE(p_payload->'sessions', '[]'::jsonb))
  LOOP
    INSERT INTO public.svj_training_plan_sessions (
      plan_id, user_id, slot_index, template_id, template_version,
      scheduled_date, status, targets
    ) VALUES (
      v_plan_id,
      v_user_id,
      COALESCE((v_session->>'slot_index')::integer, 0),
      v_session->>'template_id',
      COALESCE((v_session->>'template_version')::integer, 1),
      COALESCE((v_session->>'scheduled_date')::date, CURRENT_DATE),
      'scheduled',
      COALESCE(v_session->'targets', '[]'::jsonb)
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'plan_id', v_plan_id);
END;
$$;

-- ── 11) Read the active plan ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_get_my_training_plan()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.svj_training_plans;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_plan FROM public.svj_training_plans
    WHERE user_id = v_user_id AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'plan', NULL); END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'policyVersion', v_plan.policy_version,
      'splitId', v_plan.split_id,
      'splitName', v_plan.split_name,
      'blockStart', v_plan.block_start,
      'blockEnd', v_plan.block_end,
      'sessions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id,
          'slotIndex', s.slot_index,
          'templateId', s.template_id,
          'templateVersion', s.template_version,
          'scheduledDate', s.scheduled_date,
          'status', s.status,
          'targets', s.targets,
          'completedActivityId', s.completed_activity_id
        ) ORDER BY s.slot_index)
        FROM public.svj_training_plan_sessions s
        WHERE s.plan_id = v_plan.id AND s.user_id = v_user_id
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- ── 12) Finalize a plan slot against a canonical activity (idempotent) ─────
-- Called AFTER svj_save_strength_activity succeeds. Linking is idempotent by
-- activity_id (PK) and a slot can only be finalized once.
CREATE OR REPLACE FUNCTION public.svj_record_training_context(
  p_client_session_id text,
  p_context jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity_id uuid;
  v_plan_session_id uuid;
  v_inserted boolean := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT id INTO v_activity_id FROM public.svj_activities
    WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'No saved workout found for this session';
  END IF;

  v_plan_session_id := NULLIF(p_context->>'plan_session_id', '')::uuid;

  INSERT INTO public.svj_activity_training_context (
    activity_id, user_id, plan_id, plan_session_id, template_id,
    template_version, targets, feedback
  ) VALUES (
    v_activity_id,
    v_user_id,
    NULLIF(p_context->>'plan_id', '')::uuid,
    v_plan_session_id,
    NULLIF(p_context->>'template_id', ''),
    NULLIF(p_context->>'template_version', '')::integer,
    COALESCE(p_context->'targets', '[]'::jsonb),
    COALESCE(p_context->'feedback', '{}'::jsonb)
  )
  ON CONFLICT (activity_id) DO NOTHING;
  v_inserted := FOUND;

  -- Finalize the slot exactly once; a retry cannot double-finalize.
  IF v_plan_session_id IS NOT NULL THEN
    UPDATE public.svj_training_plan_sessions
      SET status = 'completed',
          completed_activity_id = v_activity_id,
          updated_at = now()
      WHERE id = v_plan_session_id
        AND user_id = v_user_id
        AND status <> 'completed';
  END IF;

  -- Template usage increments once per finalized activity.
  IF v_inserted AND p_context->>'template_id' IS NOT NULL THEN
    UPDATE public.svj_user_template_library
      SET use_count = use_count + 1,
          last_completed_at = now(),
          updated_at = now()
      WHERE user_id = v_user_id AND template_id = p_context->>'template_id';
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', NOT v_inserted, 'activity_id', v_activity_id);
END;
$$;

-- ── 13) Recent muscle history from REAL completed sets ─────────────────────
CREATE OR REPLACE FUNCTION public.svj_recent_muscle_history(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_start AS (
    SELECT (CURRENT_DATE - GREATEST(COALESCE(p_days, 7), 1) + 1) AS start_date
  ),
  completed_sets AS (
    SELECT ae.user_id,
           ae.exercise_id,
           e.primary_muscle,
           e.secondary_muscles,
           a.ended_at,
           (a.ended_at AT TIME ZONE 'UTC')::date AS local_date,
           s.reps,
           s.weight_kg,
           s.duration_seconds
    FROM public.svj_activity_exercises ae
    JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    JOIN public.svj_exercises e ON e.id = ae.exercise_id
    JOIN public.svj_activities a ON a.id = ae.activity_id
    WHERE ae.user_id = auth.uid()
      AND s.is_warmup = false
      AND (s.duration_seconds IS NOT NULL AND s.duration_seconds > 0
           OR s.reps IS NOT NULL AND s.reps > 0)
  ),
  direct AS (
    SELECT primary_muscle AS muscle,
           COUNT(*) AS direct_sets,
           COALESCE(SUM(CASE WHEN weight_kg IS NOT NULL AND reps IS NOT NULL
                             THEN weight_kg * reps ELSE 0 END), 0) AS direct_volume,
           MAX(ended_at) AS last_at,
           MAX(local_date) AS last_date
    FROM completed_sets
    WHERE local_date >= (SELECT start_date FROM window_start)
    GROUP BY primary_muscle
  ),
  supporting AS (
    SELECT mv.muscle, COUNT(*) AS supporting_sets
    FROM completed_sets cs
    CROSS JOIN LATERAL unnest(cs.secondary_muscles) AS mv(muscle)
    WHERE cs.local_date >= (SELECT start_date FROM window_start)
      AND mv.muscle <> cs.primary_muscle
    GROUP BY mv.muscle
  ),
  all_work AS (
    SELECT primary_muscle AS muscle, ended_at AS last_at, local_date AS last_date
    FROM completed_sets
    UNION ALL
    SELECT mv.muscle, cs.ended_at, cs.local_date
    FROM completed_sets cs
    CROSS JOIN LATERAL unnest(cs.secondary_muscles) AS mv(muscle)
  ),
  last_trained AS (
    SELECT muscle, MAX(last_at) AS last_at, MAX(last_date) AS last_date
    FROM all_work
    GROUP BY muscle
  ),
  muscles AS (
    SELECT unnest(ARRAY[
      'chest','back','shoulders','biceps','triceps','quads','hamstrings',
      'glutes','calves','core','full_body','other'
    ]) AS muscle
  )
  SELECT jsonb_build_object('ok', true, 'muscles', COALESCE(jsonb_agg(jsonb_build_object(
      'muscle', m.muscle,
      'directSets', COALESCE(d.direct_sets, 0),
      'supportingSets', COALESCE(s.supporting_sets, 0),
      'directVolume', COALESCE(d.direct_volume, 0),
      'lastTrainedAt', lt.last_at,
      'lastTrainedDate', lt.last_date
    ) ORDER BY m.muscle), '[]'::jsonb))
  FROM muscles m
  LEFT JOIN direct d ON d.muscle = m.muscle
  LEFT JOIN supporting s ON s.muscle = m.muscle
  LEFT JOIN last_trained lt ON lt.muscle = m.muscle;
$$;

-- ── 14) Progression decision audit ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_record_training_decision(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.svj_training_decisions (
    user_id, exercise_slug, activity_id, action, rationale, payload, policy_version
  ) VALUES (
    v_user_id,
    COALESCE(p_payload->>'exercise_slug', 'unknown'),
    NULLIF(p_payload->>'activity_id', '')::uuid,
    COALESCE(p_payload->>'action', 'hold'),
    COALESCE(p_payload->>'rationale', ''),
    COALESCE(p_payload->'payload', '{}'::jsonb),
    COALESCE(p_payload->>'policy_version', 'unknown')
  )
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_list_training_decisions(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true, 'decisions', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'exerciseSlug', d.exercise_slug,
      'action', d.action,
      'rationale', d.rationale,
      'createdAt', d.created_at
    ) ORDER BY d.created_at DESC)
    FROM public.svj_training_decisions d
    WHERE d.user_id = auth.uid()
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ), '[]'::jsonb));
$$;

GRANT EXECUTE ON FUNCTION public.svj_get_my_training_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_save_training_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_workout_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_save_my_template(text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_remove_my_template(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_my_template_library() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_create_training_plan(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_get_my_training_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_record_training_context(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_recent_muscle_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_record_training_decision(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_training_decisions(integer) TO authenticated;

COMMIT;
