-- ============================================================================
-- Update 03: structured strength logging — exercise catalog, sets, exercise
-- history and strength personal records.
--
-- Additive only; nothing in Update 01 (20260916000000_server_activities.sql) or
-- Update 02 (20260916200000_goals_and_records.sql) is rewritten. Structured
-- workouts reuse the SAME canonical activity row, so Activity History, Goals
-- and the existing universal PRs keep working untouched:
--
--   public.svj_activities            (Update 01 — one row per workout)
--        ↓ public.svj_activity_exercises
--        ↓ public.svj_strength_sets
--
-- Rules enforced here:
--   * ONE transaction creates activity + exercises + sets + completion event +
--     strength records + goal progress. A partial workout cannot exist.
--   * Idempotency uses the existing (user_id, client_session_id) identity: a
--     retried save returns the original workout and duplicates nothing.
--   * Progress/PRs are always derived from stored sets. Clients can never state
--     a PR value, attach sets to somebody else's activity, or write these
--     tables directly (no INSERT/UPDATE/DELETE grant to authenticated).
--   * Structured sessions carry their own provenance ('strength_log') so a
--     manual, user-typed "Strength 45 min" log can never establish a protected
--     weight/rep record — it has no sets.
-- ============================================================================

BEGIN;

-- ── 0) Provenance for structured sessions ──────────────────────────────────
-- 'svj_native' = device sensor session, 'manual' = user-typed activity,
-- 'strength_log' = structured strength workout saved with real sets.
ALTER TABLE public.svj_activities DROP CONSTRAINT IF EXISTS svj_activities_source_check;
ALTER TABLE public.svj_activities
  ADD CONSTRAINT svj_activities_source_check
  CHECK (source IN ('svj_native', 'manual', 'strength_log'));

-- ── 1) Exercise catalog ────────────────────────────────────────────────────
-- owner_user_id IS NULL  → global catalog row, readable by everyone.
-- owner_user_id = a user → that user's private custom exercise.
CREATE TABLE IF NOT EXISTS public.svj_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9_]+$'),
  category text NOT NULL CHECK (category IN (
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'quads', 'hamstrings', 'glutes', 'calves', 'legs',
    'core', 'full_body', 'conditioning', 'other'
  )),
  -- Centralised muscle metadata: primary + optional secondary groups. This is
  -- the single source of truth a future muscle map / balance view reads.
  primary_muscle text NOT NULL CHECK (primary_muscle IN (
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body', 'other'
  )),
  secondary_muscles text[] NOT NULL DEFAULT '{}'::text[] CHECK (
    secondary_muscles <@ ARRAY[
      'chest', 'back', 'shoulders', 'biceps', 'triceps',
      'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body', 'other'
    ]::text[]
    AND cardinality(secondary_muscles) = cardinality(array_remove(secondary_muscles, NULL))
  ),
  -- Rep-based with external load, rep-based bodyweight, or duration based.
  exercise_type text NOT NULL CHECK (exercise_type IN (
    'weighted_reps', 'bodyweight_reps', 'duration'
  )),
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_exercises_owner_custom CHECK (
    (owner_user_id IS NULL AND is_custom = false)
    OR (owner_user_id IS NOT NULL AND is_custom = true)
  )
);

-- Global rows are unique by slug; custom rows are unique per owner by slug and
-- by display name (one "My Bench Variant" per user).
CREATE UNIQUE INDEX IF NOT EXISTS svj_exercises_global_slug_key
  ON public.svj_exercises (slug) WHERE owner_user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS svj_exercises_owner_slug_key
  ON public.svj_exercises (owner_user_id, slug) WHERE owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS svj_exercises_owner_name_key
  ON public.svj_exercises (owner_user_id, lower(btrim(name))) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS svj_exercises_category_idx
  ON public.svj_exercises (category, name);

ALTER TABLE public.svj_exercises ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_exercises FROM PUBLIC, anon, authenticated;
-- Read-only for authenticated users (global + own custom). Custom exercises are
-- created only through svj_create_custom_exercise, so a client can neither
-- forge owner_user_id nor mutate the global catalog.
GRANT SELECT ON public.svj_exercises TO authenticated;
GRANT ALL ON public.svj_exercises TO service_role;

DROP POLICY IF EXISTS "Read global and own exercises" ON public.svj_exercises;
CREATE POLICY "Read global and own exercises"
  ON public.svj_exercises
  FOR SELECT
  TO authenticated
  USING (owner_user_id IS NULL OR owner_user_id = auth.uid());

-- ── 2) Initial catalog ─────────────────────────────────────────────────────
INSERT INTO public.svj_exercises
  (owner_user_id, name, slug, category, primary_muscle, secondary_muscles, exercise_type, is_custom)
VALUES
  -- CHEST
  (NULL, 'Bench Press', 'bench_press', 'chest', 'chest', ARRAY['triceps','shoulders'], 'weighted_reps', false),
  (NULL, 'Incline Bench Press', 'incline_bench_press', 'chest', 'chest', ARRAY['shoulders','triceps'], 'weighted_reps', false),
  (NULL, 'Dumbbell Bench Press', 'dumbbell_bench_press', 'chest', 'chest', ARRAY['triceps','shoulders'], 'weighted_reps', false),
  (NULL, 'Chest Press', 'chest_press', 'chest', 'chest', ARRAY['triceps'], 'weighted_reps', false),
  (NULL, 'Chest Fly', 'chest_fly', 'chest', 'chest', ARRAY['shoulders'], 'weighted_reps', false),
  (NULL, 'Push-Up', 'push_up', 'chest', 'chest', ARRAY['triceps','shoulders'], 'bodyweight_reps', false),
  -- BACK
  (NULL, 'Pull-Up', 'pull_up', 'back', 'back', ARRAY['biceps'], 'bodyweight_reps', false),
  (NULL, 'Lat Pulldown', 'lat_pulldown', 'back', 'back', ARRAY['biceps'], 'weighted_reps', false),
  (NULL, 'Barbell Row', 'barbell_row', 'back', 'back', ARRAY['biceps'], 'weighted_reps', false),
  (NULL, 'Dumbbell Row', 'dumbbell_row', 'back', 'back', ARRAY['biceps'], 'weighted_reps', false),
  (NULL, 'Seated Cable Row', 'seated_cable_row', 'back', 'back', ARRAY['biceps'], 'weighted_reps', false),
  -- SHOULDERS
  (NULL, 'Overhead Press', 'overhead_press', 'shoulders', 'shoulders', ARRAY['triceps'], 'weighted_reps', false),
  (NULL, 'Dumbbell Shoulder Press', 'dumbbell_shoulder_press', 'shoulders', 'shoulders', ARRAY['triceps'], 'weighted_reps', false),
  (NULL, 'Lateral Raise', 'lateral_raise', 'shoulders', 'shoulders', ARRAY[]::text[], 'weighted_reps', false),
  (NULL, 'Rear Delt Fly', 'rear_delt_fly', 'shoulders', 'shoulders', ARRAY['back'], 'weighted_reps', false),
  -- BICEPS
  (NULL, 'Bicep Curl', 'bicep_curl', 'biceps', 'biceps', ARRAY[]::text[], 'weighted_reps', false),
  (NULL, 'Hammer Curl', 'hammer_curl', 'biceps', 'biceps', ARRAY[]::text[], 'weighted_reps', false),
  -- TRICEPS
  (NULL, 'Tricep Pushdown', 'tricep_pushdown', 'triceps', 'triceps', ARRAY[]::text[], 'weighted_reps', false),
  (NULL, 'Overhead Tricep Extension', 'overhead_tricep_extension', 'triceps', 'triceps', ARRAY[]::text[], 'weighted_reps', false),
  (NULL, 'Dips', 'dips', 'triceps', 'triceps', ARRAY['chest','shoulders'], 'bodyweight_reps', false),
  -- LEGS
  (NULL, 'Squat', 'squat', 'legs', 'quads', ARRAY['glutes','hamstrings'], 'weighted_reps', false),
  (NULL, 'Leg Press', 'leg_press', 'legs', 'quads', ARRAY['glutes'], 'weighted_reps', false),
  (NULL, 'Lunges', 'lunges', 'legs', 'quads', ARRAY['glutes','hamstrings'], 'weighted_reps', false),
  (NULL, 'Bulgarian Split Squat', 'bulgarian_split_squat', 'legs', 'quads', ARRAY['glutes'], 'weighted_reps', false),
  (NULL, 'Leg Extension', 'leg_extension', 'legs', 'quads', ARRAY[]::text[], 'weighted_reps', false),
  (NULL, 'Leg Curl', 'leg_curl', 'legs', 'hamstrings', ARRAY[]::text[], 'weighted_reps', false),
  (NULL, 'Romanian Deadlift', 'romanian_deadlift', 'legs', 'hamstrings', ARRAY['glutes','back'], 'weighted_reps', false),
  (NULL, 'Deadlift', 'deadlift', 'legs', 'hamstrings', ARRAY['glutes','back'], 'weighted_reps', false),
  (NULL, 'Calf Raise', 'calf_raise', 'legs', 'calves', ARRAY[]::text[], 'weighted_reps', false),
  -- CORE
  (NULL, 'Plank', 'plank', 'core', 'core', ARRAY[]::text[], 'duration', false),
  (NULL, 'Crunch', 'crunch', 'core', 'core', ARRAY[]::text[], 'bodyweight_reps', false),
  (NULL, 'Leg Raise', 'leg_raise', 'core', 'core', ARRAY[]::text[], 'bodyweight_reps', false),
  (NULL, 'Russian Twist', 'russian_twist', 'core', 'core', ARRAY[]::text[], 'bodyweight_reps', false),
  -- CONDITIONING
  (NULL, 'Burpee', 'burpee', 'conditioning', 'full_body', ARRAY['chest','quads'], 'bodyweight_reps', false),
  (NULL, 'Kettlebell Swing', 'kettlebell_swing', 'conditioning', 'full_body', ARRAY['glutes','hamstrings'], 'weighted_reps', false),
  -- OTHER
  (NULL, 'Custom Exercise', 'custom_exercise', 'other', 'other', ARRAY[]::text[], 'weighted_reps', false)
ON CONFLICT DO NOTHING;

-- ── 3) Workout exercises ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_activity_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.svj_activities(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.svj_exercises(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 49),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_activity_exercises_position UNIQUE (activity_id, position)
);

CREATE INDEX IF NOT EXISTS svj_activity_exercises_activity_idx
  ON public.svj_activity_exercises (activity_id, position);
CREATE INDEX IF NOT EXISTS svj_activity_exercises_exercise_idx
  ON public.svj_activity_exercises (user_id, exercise_id);
CREATE INDEX IF NOT EXISTS svj_activity_exercises_user_idx
  ON public.svj_activity_exercises (user_id, created_at DESC);

ALTER TABLE public.svj_activity_exercises ENABLE ROW LEVEL SECURITY;

-- Read-only from the client: rows are written only by svj_save_strength_activity
-- (SECURITY DEFINER), which derives identity from auth.uid(). No INSERT grant
-- means a user can never attach sets to somebody else's activity.
REVOKE ALL ON public.svj_activity_exercises FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_activity_exercises TO authenticated;
GRANT ALL ON public.svj_activity_exercises TO service_role;

DROP POLICY IF EXISTS "Users read own activity exercises" ON public.svj_activity_exercises;
CREATE POLICY "Users read own activity exercises"
  ON public.svj_activity_exercises
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 4) Strength sets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_strength_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_exercise_id uuid NOT NULL REFERENCES public.svj_activity_exercises(id) ON DELETE CASCADE,
  set_number integer NOT NULL CHECK (set_number BETWEEN 1 AND 100),
  -- Rep-based sets carry reps; duration sets carry seconds. Bodyweight sets
  -- legitimately have no external weight (weight_kg stays NULL, never 0-faked).
  reps integer CHECK (reps IS NULL OR reps BETWEEN 1 AND 1000),
  weight_kg numeric(7, 2) CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 2000)),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 14400),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_strength_sets_has_value CHECK (reps IS NOT NULL OR duration_seconds IS NOT NULL),
  CONSTRAINT svj_strength_sets_number_unique UNIQUE (activity_exercise_id, set_number)
);

CREATE INDEX IF NOT EXISTS svj_strength_sets_exercise_idx
  ON public.svj_strength_sets (activity_exercise_id, set_number);
CREATE INDEX IF NOT EXISTS svj_strength_sets_user_idx
  ON public.svj_strength_sets (user_id, created_at DESC);

ALTER TABLE public.svj_strength_sets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_strength_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_strength_sets TO authenticated;
GRANT ALL ON public.svj_strength_sets TO service_role;

DROP POLICY IF EXISTS "Users read own strength sets" ON public.svj_strength_sets;
CREATE POLICY "Users read own strength sets"
  ON public.svj_strength_sets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 5) Strength personal records (evidence-linked) ─────────────────────────
-- Materialised for fast reads, but never independent evidence: every row links
-- the canonical activity and (where a single set established it) that set.
-- Only svj_save_strength_activity writes here.
CREATE TABLE IF NOT EXISTS public.svj_personal_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN (
    'heaviest_weight', 'best_set_reps', 'best_exercise_volume'
  )),
  exercise_id uuid NOT NULL REFERENCES public.svj_exercises(id) ON DELETE CASCADE,
  value numeric(12, 2) NOT NULL CHECK (value > 0),
  activity_id uuid NOT NULL REFERENCES public.svj_activities(id) ON DELETE CASCADE,
  set_id uuid REFERENCES public.svj_strength_sets(id) ON DELETE SET NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_personal_records_unique UNIQUE (user_id, record_type, exercise_id)
);

CREATE INDEX IF NOT EXISTS svj_personal_records_user_idx
  ON public.svj_personal_records (user_id, achieved_at DESC);
CREATE INDEX IF NOT EXISTS svj_personal_records_activity_idx
  ON public.svj_personal_records (user_id, activity_id);

ALTER TABLE public.svj_personal_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_personal_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_personal_records TO authenticated;
GRANT ALL ON public.svj_personal_records TO service_role;

DROP POLICY IF EXISTS "Users read own personal records" ON public.svj_personal_records;
CREATE POLICY "Users read own personal records"
  ON public.svj_personal_records
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 6) Muscle summary (deterministic, non-clinical) ────────────────────────
-- Each set contributes 1.0 to the exercise's primary muscle and 0.5 to each
-- secondary muscle. Levels are RELATIVE to the strongest muscle in that
-- session — this is a training summary, not EMG data or a medical claim.
CREATE OR REPLACE FUNCTION public.svj_muscle_summary(p_activity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH contributions AS (
    SELECT m.muscle,
           SUM(CASE WHEN m.is_primary THEN 1.0 ELSE 0.5 END) AS score
    FROM public.svj_activity_exercises ae
    JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    JOIN public.svj_exercises e ON e.id = ae.exercise_id
    CROSS JOIN LATERAL (
      SELECT e.primary_muscle AS muscle, true AS is_primary
      UNION ALL
      SELECT unnest(e.secondary_muscles) AS muscle, false AS is_primary
    ) m
    WHERE ae.activity_id = p_activity_id
    GROUP BY m.muscle
  ),
  scaled AS (
    SELECT muscle, score, MAX(score) OVER () AS top_score FROM contributions
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'muscle', muscle,
      'score', score,
      'level', CASE
        WHEN score >= top_score * 0.66 THEN 'high'
        WHEN score >= top_score * 0.33 THEN 'medium'
        ELSE 'low'
      END
    ) ORDER BY score DESC, muscle), '[]'::jsonb)
  FROM scaled;
$$;

-- One shared summary shape for the save response, the history list and detail.
CREATE OR REPLACE FUNCTION public.svj_strength_summary(p_activity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'exercise_count', COALESCE(c.exercise_count, 0),
    'set_count', COALESCE(c.set_count, 0),
    'total_reps', COALESCE(c.total_reps, 0),
    'volume_kg', COALESCE(ROUND(c.volume_kg, 2), 0),
    'muscles', public.svj_muscle_summary(p_activity_id)
  )
  FROM (
    SELECT COUNT(DISTINCT ae.id) AS exercise_count,
           COUNT(s.id) AS set_count,
           COALESCE(SUM(s.reps), 0) AS total_reps,
           COALESCE(SUM(
             CASE WHEN s.weight_kg IS NOT NULL AND s.reps IS NOT NULL
                  THEN s.weight_kg * s.reps ELSE 0 END), 0) AS volume_kg
    FROM public.svj_activity_exercises ae
    LEFT JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    WHERE ae.activity_id = p_activity_id
  ) c;
$$;

-- ── 7) Custom exercises (user-owned, never mutating the global catalog) ────
CREATE OR REPLACE FUNCTION public.svj_create_custom_exercise(
  p_name text,
  p_primary_muscle text,
  p_secondary_muscles text[] DEFAULT '{}'::text[],
  p_exercise_type text DEFAULT 'weighted_reps'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(COALESCE(p_name, ''));
  v_slug text;
  v_secondary text[];
  v_exercise public.svj_exercises;
  v_allowed text[] := ARRAY[
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body', 'other'
  ]::text[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Exercise names are between 2 and 60 characters';
  END IF;
  IF p_primary_muscle IS NULL OR NOT (p_primary_muscle = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'Choose a valid primary muscle group';
  END IF;
  IF p_exercise_type IS NULL OR p_exercise_type NOT IN (
    'weighted_reps', 'bodyweight_reps', 'duration'
  ) THEN
    RAISE EXCEPTION 'Unknown exercise type';
  END IF;
  v_secondary := COALESCE(p_secondary_muscles, '{}'::text[]);
  IF cardinality(v_secondary) <> cardinality(array_remove(v_secondary, NULL))
    OR NOT (v_secondary <@ v_allowed) THEN
    RAISE EXCEPTION 'Invalid secondary muscle group';
  END IF;
  -- Secondary muscles never duplicate the primary.
  SELECT COALESCE(array_agg(DISTINCT m), '{}'::text[])
    INTO v_secondary
    FROM unnest(v_secondary) AS m
    WHERE m <> p_primary_muscle;

  v_slug := trim(both '_' from
    substr(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), 1, 40));
  IF v_slug = '' THEN
    v_slug := 'custom';
  END IF;
  -- Suffix keeps slugs unique while the (owner, name) index owns name clashes.
  v_slug := v_slug || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  BEGIN
    INSERT INTO public.svj_exercises (
      owner_user_id, name, slug, category, primary_muscle,
      secondary_muscles, exercise_type, is_custom
    ) VALUES (
      v_user_id, v_name, v_slug, 'other', p_primary_muscle,
      v_secondary, p_exercise_type, true
    )
    RETURNING * INTO v_exercise;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have an exercise with this name';
  END;

  RETURN jsonb_build_object('ok', true, 'exercise', jsonb_build_object(
    'id', v_exercise.id,
    'name', v_exercise.name,
    'slug', v_exercise.slug,
    'category', v_exercise.category,
    'primary_muscle', v_exercise.primary_muscle,
    'secondary_muscles', v_exercise.secondary_muscles,
    'exercise_type', v_exercise.exercise_type,
    'is_custom', v_exercise.is_custom
  ));
END;
$$;

-- ── 8) Exercise catalog read ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_list_exercises()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN jsonb_build_object('ok', true, 'exercises', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'slug', e.slug,
      'category', e.category,
      'primary_muscle', e.primary_muscle,
      'secondary_muscles', e.secondary_muscles,
      'exercise_type', e.exercise_type,
      'is_custom', e.is_custom
    ) ORDER BY e.category, e.name)
    FROM public.svj_exercises e
    WHERE e.owner_user_id IS NULL OR e.owner_user_id = v_user_id
  ), '[]'::jsonb));
END;
$$;

-- ── 9) Atomic, idempotent strength save ────────────────────────────────────
-- p_exercises is a JSON array; ORDER defines position and set_number, so a
-- client cannot scramble ordering:
--   [{ "exercise_id": uuid, "notes": text|null,
--      "sets": [{ "reps": int, "weight_kg": numeric|null, "duration_seconds": int|null }] }]
CREATE OR REPLACE FUNCTION public.svj_save_strength_activity(
  p_client_session_id text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_exercises jsonb,
  p_perceived_effort integer DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity_id uuid;
  v_existing public.svj_activities;
  v_exercise jsonb;
  v_set jsonb;
  v_exercise_id uuid;
  v_exercise_type text;
  v_activity_exercise_id uuid;
  v_position integer := -1;
  v_set_number integer;
  v_reps integer;
  v_weight numeric;
  v_duration integer;
  v_notes text;
  v_summary jsonb;
  v_goal_progress jsonb;
  v_batch jsonb;
  v_strength_records jsonb := '[]'::jsonb;
  v_universal_records jsonb := '[]'::jsonb;
  v_record_type text;
  v_value numeric;
  v_previous numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_client_session_id IS NULL
    OR char_length(btrim(p_client_session_id)) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'A valid session id is required';
  END IF;
  IF p_started_at IS NULL OR p_ended_at IS NULL OR p_ended_at <= p_started_at THEN
    RAISE EXCEPTION 'Workout end must be after its start';
  END IF;
  IF p_ended_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Workout end time cannot be in the future';
  END IF;
  IF p_duration_seconds IS NULL OR p_duration_seconds < 1
    OR p_duration_seconds > 86400
    OR p_duration_seconds > EXTRACT(EPOCH FROM (p_ended_at - p_started_at))::integer + 120 THEN
    RAISE EXCEPTION 'Invalid workout duration';
  END IF;
  IF p_perceived_effort IS NOT NULL AND p_perceived_effort NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid perceived effort';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 500 THEN
    RAISE EXCEPTION 'Notes are too long';
  END IF;
  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION 'Add at least one exercise before saving';
  END IF;
  IF jsonb_array_length(p_exercises) < 1 OR jsonb_array_length(p_exercises) > 20 THEN
    RAISE EXCEPTION 'A strength workout supports between 1 and 20 exercises';
  END IF;

  -- One canonical activity row per workout — identical idempotency identity to
  -- Update 01, so a retried save can never create a second workout.
  INSERT INTO public.svj_activities (
    user_id, client_session_id, activity_type, source,
    started_at, ended_at, duration_seconds,
    step_count, distance_meters, calories_estimate,
    perceived_effort, notes
  ) VALUES (
    v_user_id, btrim(p_client_session_id), 'strength', 'strength_log',
    p_started_at, p_ended_at, p_duration_seconds,
    0, NULL, NULL,
    p_perceived_effort, NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  ON CONFLICT (user_id, client_session_id) DO NOTHING
  RETURNING id INTO v_activity_id;

  IF v_activity_id IS NULL THEN
    -- Idempotent retry: return the workout that already exists, with its stored
    -- sets summarised. No second activity, no second event, no re-awarded PR.
    SELECT * INTO v_existing FROM public.svj_activities
    WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
    SELECT COALESCE(jsonb_agg(public.svj_goal_with_progress(g) ORDER BY g.created_at), '[]'::jsonb)
      INTO v_goal_progress
      FROM public.svj_goals g
      WHERE g.user_id = v_user_id
        AND g.status IN ('active', 'completed')
        AND v_existing.started_at >= g.period_start
        AND v_existing.started_at < g.period_end + 1;
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'activity', to_jsonb(v_existing),
      'summary', public.svj_strength_summary(v_existing.id),
      'strength_records', '[]'::jsonb,
      'new_records', '[]'::jsonb,
      'goal_progress', v_goal_progress
    );
  END IF;

  -- ── Exercises + sets (validated server-side, in one transaction) ─────────
  FOR v_exercise IN SELECT value FROM jsonb_array_elements(p_exercises) LOOP
    v_position := v_position + 1;
    IF jsonb_typeof(v_exercise) <> 'object' THEN
      RAISE EXCEPTION 'Invalid exercise entry';
    END IF;
    IF v_exercise->>'exercise_id' IS NULL THEN
      RAISE EXCEPTION 'Each exercise needs an exercise id';
    END IF;
    BEGIN
      v_exercise_id := (v_exercise->>'exercise_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid exercise id';
    END;

    SELECT e.exercise_type INTO v_exercise_type
    FROM public.svj_exercises e
    WHERE e.id = v_exercise_id
      AND (e.owner_user_id IS NULL OR e.owner_user_id = v_user_id);
    IF v_exercise_type IS NULL THEN
      RAISE EXCEPTION 'Unknown exercise';
    END IF;

    v_notes := NULLIF(btrim(COALESCE(v_exercise->>'notes', '')), '');
    IF v_notes IS NOT NULL AND char_length(v_notes) > 300 THEN
      RAISE EXCEPTION 'Exercise notes are too long';
    END IF;

    IF v_exercise->'sets' IS NULL OR jsonb_typeof(v_exercise->'sets') <> 'array'
      OR jsonb_array_length(v_exercise->'sets') < 1
      OR jsonb_array_length(v_exercise->'sets') > 30 THEN
      RAISE EXCEPTION 'Each exercise needs between 1 and 30 sets';
    END IF;

    INSERT INTO public.svj_activity_exercises (
      user_id, activity_id, exercise_id, position, notes
    ) VALUES (
      v_user_id, v_activity_id, v_exercise_id, v_position, v_notes
    )
    RETURNING id INTO v_activity_exercise_id;

    v_set_number := 0;
    FOR v_set IN SELECT value FROM jsonb_array_elements(v_exercise->'sets') LOOP
      v_set_number := v_set_number + 1;
      IF jsonb_typeof(v_set) <> 'object' THEN
        RAISE EXCEPTION 'Invalid set entry';
      END IF;

      -- JSON has no NaN/Infinity; any numeric string that cannot fit the column
      -- ranges is rejected below (never trusted as-is).
      BEGIN
        v_reps := CASE WHEN jsonb_typeof(v_set->'reps') = 'number'
          THEN (v_set->>'reps')::numeric::integer ELSE NULL END;
        v_weight := CASE WHEN jsonb_typeof(v_set->'weight_kg') = 'number'
          THEN (v_set->>'weight_kg')::numeric ELSE NULL END;
        v_duration := CASE WHEN jsonb_typeof(v_set->'duration_seconds') = 'number'
          THEN (v_set->>'duration_seconds')::numeric::integer ELSE NULL END;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid set value';
      END;

      IF v_exercise_type = 'duration' THEN
        IF v_duration IS NULL OR v_duration < 1 OR v_duration > 14400 THEN
          RAISE EXCEPTION 'Time-based sets need between 1 second and 4 hours';
        END IF;
        v_reps := NULL;
        v_weight := NULL;
      ELSE
        IF v_reps IS NULL OR v_reps < 1 OR v_reps > 1000 THEN
          RAISE EXCEPTION 'Each set needs between 1 and 1000 reps';
        END IF;
        IF v_weight IS NOT NULL AND (v_weight < 0 OR v_weight > 2000) THEN
          RAISE EXCEPTION 'Invalid weight';
        END IF;
        IF v_exercise_type = 'weighted_reps' AND v_weight IS NULL THEN
          RAISE EXCEPTION 'Weighted exercises need a weight value';
        END IF;
        v_duration := NULL;
      END IF;

      INSERT INTO public.svj_strength_sets (
        user_id, activity_exercise_id, set_number, reps, weight_kg, duration_seconds
      ) VALUES (
        v_user_id, v_activity_exercise_id, v_set_number, v_reps, v_weight, v_duration
      );
    END LOOP;
  END LOOP;

  -- ── Exactly one completion event (same key shape as Update 01/02) ─────────
  INSERT INTO public.activity_events (
    user_id, event_key, event_type, source_class, source_id, occurred_at, metadata
  ) VALUES (
    v_user_id,
    'activity.completed:' || v_activity_id::text,
    'workout',
    'workout',
    v_activity_id::text,
    p_ended_at,
    jsonb_build_object(
      'activity_id', v_activity_id,
      'client_session_id', btrim(p_client_session_id),
      'activity_type', 'strength',
      'source', 'strength_log',
      'exercise_count', jsonb_array_length(p_exercises),
      'duration_seconds', p_duration_seconds
    )
  )
  ON CONFLICT (user_id, event_key) DO NOTHING;

  -- ── Universal records (Update 02 rules; structured source is step/distance
  --    ineligible by definition, duration is genuine) ────────────────────────
  FOREACH v_record_type IN ARRAY ARRAY[
    'most_steps_in_activity', 'longest_activity_duration', 'longest_distance'
  ] LOOP
    CONTINUE WHEN NOT public.svj_record_eligible(
      v_record_type, 'strength_log', 0, NULL, p_duration_seconds);
    v_value := public.svj_record_value(v_record_type, 0, NULL, p_duration_seconds);
    SELECT MAX(public.svj_record_value(
        r.record_type, a.step_count, a.distance_meters, a.duration_seconds))
      INTO v_previous
      FROM public.svj_activities a
      CROSS JOIN (VALUES (v_record_type)) AS r(record_type)
      WHERE a.user_id = v_user_id
        AND a.id <> v_activity_id
        AND public.svj_record_eligible(
          r.record_type, a.source, a.step_count, a.distance_meters, a.duration_seconds);
    IF v_previous IS NULL OR v_value > v_previous THEN
      v_universal_records := v_universal_records || jsonb_build_array(jsonb_build_object(
        'record_type', v_record_type,
        'value', v_value,
        'previous_value', v_previous
      ));
    END IF;
  END LOOP;

  -- ── Heaviest weight per exercise (weighted sets only) ─────────────────────
  WITH performed AS (
    SELECT ae.exercise_id, s.weight_kg AS value, s.id AS set_id, s.set_number
    FROM public.svj_activity_exercises ae
    JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    WHERE ae.activity_id = v_activity_id
      AND s.weight_kg IS NOT NULL AND s.weight_kg > 0
  ),
  best AS (
    SELECT DISTINCT ON (exercise_id) exercise_id, value, set_id
    FROM performed
    ORDER BY exercise_id, value DESC, set_number ASC, set_id
  ),
  previous AS (
    SELECT ae.exercise_id, MAX(s.weight_kg) AS value
    FROM public.svj_activity_exercises ae
    JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    WHERE ae.user_id = v_user_id
      AND ae.activity_id <> v_activity_id
      AND s.weight_kg IS NOT NULL AND s.weight_kg > 0
    GROUP BY ae.exercise_id
  ),
  upserted AS (
    INSERT INTO public.svj_personal_records AS pr (
      user_id, record_type, exercise_id, value, activity_id, set_id, achieved_at, updated_at
    )
    SELECT v_user_id, 'heaviest_weight', b.exercise_id, b.value, v_activity_id,
           b.set_id, p_ended_at, now()
    FROM best b
    LEFT JOIN previous p ON p.exercise_id = b.exercise_id
    WHERE p.value IS NULL OR b.value > p.value
    ON CONFLICT (user_id, record_type, exercise_id) DO UPDATE
      SET value = EXCLUDED.value,
          activity_id = EXCLUDED.activity_id,
          set_id = EXCLUDED.set_id,
          achieved_at = EXCLUDED.achieved_at,
          updated_at = now()
      WHERE EXCLUDED.value > pr.value
    RETURNING pr.exercise_id, pr.value, pr.set_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'record_type', 'heaviest_weight',
      'exercise_id', u.exercise_id,
      'value', u.value,
      'previous_value', p.value,
      'set_id', u.set_id
    )), '[]'::jsonb)
  INTO v_batch
  FROM upserted u
  LEFT JOIN previous p ON p.exercise_id = u.exercise_id;
  v_strength_records := v_strength_records || v_batch;

  -- ── Most reps in one set per exercise (bodyweight friendly) ───────────────
  WITH performed AS (
    SELECT ae.exercise_id, s.reps::numeric AS value, s.id AS set_id, s.set_number
    FROM public.svj_activity_exercises ae
    JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    WHERE ae.activity_id = v_activity_id
      AND s.reps IS NOT NULL AND s.reps > 0
  ),
  best AS (
    SELECT DISTINCT ON (exercise_id) exercise_id, value, set_id
    FROM performed
    ORDER BY exercise_id, value DESC, set_number ASC, set_id
  ),
  previous AS (
    SELECT ae.exercise_id, MAX(s.reps)::numeric AS value
    FROM public.svj_activity_exercises ae
    JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    WHERE ae.user_id = v_user_id
      AND ae.activity_id <> v_activity_id
      AND s.reps IS NOT NULL AND s.reps > 0
    GROUP BY ae.exercise_id
  ),
  upserted AS (
    INSERT INTO public.svj_personal_records AS pr (
      user_id, record_type, exercise_id, value, activity_id, set_id, achieved_at, updated_at
    )
    SELECT v_user_id, 'best_set_reps', b.exercise_id, b.value, v_activity_id,
           b.set_id, p_ended_at, now()
    FROM best b
    LEFT JOIN previous p ON p.exercise_id = b.exercise_id
    WHERE p.value IS NULL OR b.value > p.value
    ON CONFLICT (user_id, record_type, exercise_id) DO UPDATE
      SET value = EXCLUDED.value,
          activity_id = EXCLUDED.activity_id,
          set_id = EXCLUDED.set_id,
          achieved_at = EXCLUDED.achieved_at,
          updated_at = now()
      WHERE EXCLUDED.value > pr.value
    RETURNING pr.exercise_id, pr.value, pr.set_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'record_type', 'best_set_reps',
      'exercise_id', u.exercise_id,
      'value', u.value,
      'previous_value', p.value,
      'set_id', u.set_id
    )), '[]'::jsonb)
  INTO v_batch
  FROM upserted u
  LEFT JOIN previous p ON p.exercise_id = u.exercise_id;
  v_strength_records := v_strength_records || v_batch;

  -- ── Highest single-session volume per exercise (weighted sets only) ───────
  WITH performed AS (
    SELECT ae.exercise_id, SUM(s.weight_kg * s.reps) AS value
    FROM public.svj_activity_exercises ae
    JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
    WHERE ae.activity_id = v_activity_id
      AND s.weight_kg IS NOT NULL AND s.reps IS NOT NULL AND s.weight_kg > 0
    GROUP BY ae.exercise_id
  ),
  previous AS (
    SELECT t.exercise_id, MAX(t.total) AS value
    FROM (
      SELECT ae.exercise_id, ae.activity_id, SUM(s.weight_kg * s.reps) AS total
      FROM public.svj_activity_exercises ae
      JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
      WHERE ae.user_id = v_user_id
        AND ae.activity_id <> v_activity_id
        AND s.weight_kg IS NOT NULL AND s.reps IS NOT NULL AND s.weight_kg > 0
      GROUP BY ae.exercise_id, ae.activity_id
    ) t
    GROUP BY t.exercise_id
  ),
  upserted AS (
    INSERT INTO public.svj_personal_records AS pr (
      user_id, record_type, exercise_id, value, activity_id, set_id, achieved_at, updated_at
    )
    SELECT v_user_id, 'best_exercise_volume', b.exercise_id, b.value, v_activity_id,
           NULL, p_ended_at, now()
    FROM performed b
    LEFT JOIN previous p ON p.exercise_id = b.exercise_id
    WHERE p.value IS NULL OR b.value > p.value
    ON CONFLICT (user_id, record_type, exercise_id) DO UPDATE
      SET value = EXCLUDED.value,
          activity_id = EXCLUDED.activity_id,
          set_id = EXCLUDED.set_id,
          achieved_at = EXCLUDED.achieved_at,
          updated_at = now()
      WHERE EXCLUDED.value > pr.value
    RETURNING pr.exercise_id, pr.value
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'record_type', 'best_exercise_volume',
      'exercise_id', u.exercise_id,
      'value', u.value,
      'previous_value', p.value,
      'set_id', NULL
    )), '[]'::jsonb)
  INTO v_batch
  FROM upserted u
  LEFT JOIN previous p ON p.exercise_id = u.exercise_id;
  v_strength_records := v_strength_records || v_batch;

  -- One idempotent ledger event per newly established strength record. The
  -- (user_id, event_key) unique constraint is the replay guard.
  INSERT INTO public.activity_events (
    user_id, event_key, event_type, source_class, source_id, occurred_at, metadata
  )
  SELECT v_user_id,
         'personal_record.achieved:' || v_activity_id::text || ':'
           || (r->>'record_type') || ':' || (r->>'exercise_id'),
         'stat_change',
         'system',
         v_activity_id::text,
         p_ended_at,
         jsonb_build_object(
           'activity_id', v_activity_id,
           'profile', 'strength',
           'record_type', r->>'record_type',
           'exercise_id', r->>'exercise_id',
           'value', (r->>'value')::numeric
         )
  FROM jsonb_array_elements(v_strength_records) AS r
  ON CONFLICT (user_id, event_key) DO NOTHING;

  -- ── Goal progress from the canonical activity (never client-stated) ───────
  SELECT COALESCE(jsonb_agg(public.svj_goal_with_progress(g) ORDER BY g.created_at), '[]'::jsonb)
    INTO v_goal_progress
    FROM public.svj_goals g
    WHERE g.user_id = v_user_id
      AND g.status IN ('active', 'completed')
      AND p_started_at >= g.period_start
      AND p_started_at < g.period_end + 1;
  PERFORM public.svj_refresh_goal_statuses(v_user_id);

  v_summary := public.svj_strength_summary(v_activity_id);

  SELECT * INTO v_existing FROM public.svj_activities WHERE id = v_activity_id;
  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'activity', to_jsonb(v_existing),
    'summary', v_summary,
    'strength_records', v_strength_records,
    'new_records', v_universal_records,
    'goal_progress', v_goal_progress
  );
END;
$$;

-- ── 10) Strength detail for one saved workout ──────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_get_strength_detail(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity public.svj_activities;
  v_exercises jsonb;
  v_records jsonb;
  v_goals jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_activity FROM public.svj_activities a
  WHERE a.id = p_activity_id AND a.user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Workout not found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'exercise_id', x.exercise_id,
      'name', x.name,
      'exercise_type', x.exercise_type,
      'primary_muscle', x.primary_muscle,
      'position', x.position,
      'notes', x.notes,
      'sets', x.sets
    ) ORDER BY x.position), '[]'::jsonb)
  INTO v_exercises
  FROM (
    SELECT ae.position, ae.exercise_id, e.name, e.exercise_type,
           e.primary_muscle, ae.notes,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'set_number', s.set_number,
               'reps', s.reps,
               'weight_kg', s.weight_kg,
               'duration_seconds', s.duration_seconds
             ) ORDER BY s.set_number)
             FROM public.svj_strength_sets s
             WHERE s.activity_exercise_id = ae.id
           ), '[]'::jsonb) AS sets
    FROM public.svj_activity_exercises ae
    JOIN public.svj_exercises e ON e.id = ae.exercise_id
    WHERE ae.activity_id = p_activity_id
  ) x;

  -- Records this exact workout established (evidence-linked).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'record_type', pr.record_type,
      'exercise_id', pr.exercise_id,
      'exercise_name', e.name,
      'value', pr.value,
      'set_id', pr.set_id,
      'achieved_at', pr.achieved_at
    ) ORDER BY pr.record_type, e.name), '[]'::jsonb)
  INTO v_records
  FROM public.svj_personal_records pr
  JOIN public.svj_exercises e ON e.id = pr.exercise_id
  WHERE pr.user_id = v_user_id AND pr.activity_id = p_activity_id;

  -- Goals this workout genuinely contributed to, with the exact contribution.
  SELECT COALESCE(jsonb_agg(x.item ORDER BY x.period_end DESC), '[]'::jsonb)
  INTO v_goals
  FROM (
    SELECT g.period_end,
           jsonb_build_object(
             'goal_id', g.id,
             'metric', g.metric,
             'activity_type', g.activity_type,
             'period_type', g.period_type,
             'period_start', g.period_start,
             'period_end', g.period_end,
             'target_value', g.target_value,
             'progress', public.svj_goal_progress(g),
             'contribution', CASE g.metric
               WHEN 'workout_count' THEN 1::numeric
               WHEN 'active_minutes' THEN ROUND(v_activity.duration_seconds / 60.0, 2)
               WHEN 'step_total' THEN CASE WHEN v_activity.source = 'svj_native'
                 THEN v_activity.step_count::numeric ELSE 0::numeric END
               WHEN 'distance' THEN CASE
                 WHEN v_activity.source = 'svj_native' AND v_activity.distance_meters IS NOT NULL
                 THEN v_activity.distance_meters ELSE 0::numeric END
               ELSE 0::numeric
             END
           ) AS item
    FROM public.svj_goals g
    WHERE g.user_id = v_user_id
      AND g.status IN ('active', 'completed')
      AND (g.activity_type IS NULL OR g.activity_type = v_activity.activity_type)
      AND v_activity.started_at >= g.period_start
      AND v_activity.started_at < g.period_end + 1
  ) x
  WHERE (x.item->>'contribution')::numeric > 0;

  RETURN jsonb_build_object(
    'ok', true,
    'activity_id', v_activity.id,
    'summary', public.svj_strength_summary(p_activity_id),
    'exercises', v_exercises,
    'records', v_records,
    'goal_contributions', v_goals
  );
END;
$$;

-- ── 11) Strength summaries for the Activity History list ───────────────────
CREATE OR REPLACE FUNCTION public.svj_list_strength_summaries(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN jsonb_build_object('ok', true, 'summaries', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'activity_id', x.id,
      'exercise_count', x.exercise_count,
      'set_count', x.set_count,
      'total_reps', x.total_reps,
      'volume_kg', x.volume_kg,
      'muscles', public.svj_muscle_summary(x.id)
    ) ORDER BY x.ended_at DESC)
    FROM (
      SELECT a.id, a.ended_at,
             COUNT(DISTINCT ae.id) AS exercise_count,
             COUNT(s.id) AS set_count,
             COALESCE(SUM(s.reps), 0) AS total_reps,
             COALESCE(SUM(CASE WHEN s.weight_kg IS NOT NULL AND s.reps IS NOT NULL
                               THEN s.weight_kg * s.reps ELSE 0 END), 0) AS volume_kg
      FROM public.svj_activities a
      JOIN public.svj_activity_exercises ae ON ae.activity_id = a.id
      LEFT JOIN public.svj_strength_sets s ON s.activity_exercise_id = ae.id
      WHERE a.user_id = v_user_id
      GROUP BY a.id, a.ended_at
      ORDER BY a.ended_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200))
    ) x
  ), '[]'::jsonb));
END;
$$;

-- ── 12) Exercise history (own activities only, bounded, newest first) ──────
CREATE OR REPLACE FUNCTION public.svj_get_exercise_history(
  p_exercise_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_exercise public.svj_exercises;
  v_sessions jsonb;
  v_records jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_exercise FROM public.svj_exercises e
  WHERE e.id = p_exercise_id
    AND (e.owner_user_id IS NULL OR e.owner_user_id = v_user_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Exercise not found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'activity_id', s.activity_id,
      'performed_at', s.ended_at,
      'set_count', s.set_count,
      'total_reps', s.total_reps,
      'volume_kg', s.volume_kg,
      'best_weight', s.best_weight,
      'best_reps', s.best_reps,
      'totals_seconds', s.total_seconds,
      'sets', s.sets
    ) ORDER BY s.ended_at DESC), '[]'::jsonb)
  INTO v_sessions
  FROM (
    SELECT a.id AS activity_id, a.ended_at,
           COUNT(st.id) AS set_count,
           COALESCE(SUM(st.reps), 0) AS total_reps,
           COALESCE(SUM(CASE WHEN st.weight_kg IS NOT NULL AND st.reps IS NOT NULL
                             THEN st.weight_kg * st.reps ELSE 0 END), 0) AS volume_kg,
           MAX(st.weight_kg) AS best_weight,
           MAX(st.reps) AS best_reps,
           COALESCE(SUM(st.duration_seconds), 0) AS total_seconds,
           jsonb_agg(jsonb_build_object(
             'set_number', st.set_number,
             'reps', st.reps,
             'weight_kg', st.weight_kg,
             'duration_seconds', st.duration_seconds
           ) ORDER BY st.set_number) AS sets
    FROM public.svj_activity_exercises ae
    JOIN public.svj_activities a ON a.id = ae.activity_id AND a.user_id = v_user_id
    JOIN public.svj_strength_sets st ON st.activity_exercise_id = ae.id
    WHERE ae.exercise_id = p_exercise_id
    GROUP BY a.id, a.ended_at
    ORDER BY a.ended_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50))
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'record_type', pr.record_type,
      'value', pr.value,
      'activity_id', pr.activity_id,
      'set_id', pr.set_id,
      'achieved_at', pr.achieved_at
    ) ORDER BY pr.record_type), '[]'::jsonb)
  INTO v_records
  FROM public.svj_personal_records pr
  WHERE pr.user_id = v_user_id AND pr.exercise_id = p_exercise_id;

  RETURN jsonb_build_object(
    'ok', true,
    'exercise', jsonb_build_object(
      'id', v_exercise.id,
      'name', v_exercise.name,
      'category', v_exercise.category,
      'primary_muscle', v_exercise.primary_muscle,
      'secondary_muscles', v_exercise.secondary_muscles,
      'exercise_type', v_exercise.exercise_type,
      'is_custom', v_exercise.is_custom
    ),
    'records', v_records,
    'sessions', v_sessions
  );
END;
$$;

-- ── 13) Strength records read ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_list_strength_records()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN jsonb_build_object('ok', true, 'records', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'record_type', pr.record_type,
      'exercise_id', pr.exercise_id,
      'exercise_name', e.name,
      'exercise_type', e.exercise_type,
      'primary_muscle', e.primary_muscle,
      'value', pr.value,
      'activity_id', pr.activity_id,
      'set_id', pr.set_id,
      'achieved_at', pr.achieved_at
    ) ORDER BY pr.achieved_at DESC)
    FROM public.svj_personal_records pr
    JOIN public.svj_exercises e ON e.id = pr.exercise_id
    WHERE pr.user_id = v_user_id
  ), '[]'::jsonb));
END;
$$;

-- ── 14) Permissions: authenticated only, no direct table writes ────────────
REVOKE ALL ON FUNCTION public.svj_muscle_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_muscle_summary(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.svj_strength_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_strength_summary(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.svj_create_custom_exercise(text, text, text[], text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_create_custom_exercise(text, text, text[], text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.svj_list_exercises() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_exercises() TO authenticated;

REVOKE ALL ON FUNCTION public.svj_save_strength_activity(
  text, timestamptz, timestamptz, integer, jsonb, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_save_strength_activity(
  text, timestamptz, timestamptz, integer, jsonb, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.svj_get_strength_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_strength_detail(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.svj_list_strength_summaries(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_strength_summaries(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.svj_get_exercise_history(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_exercise_history(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.svj_list_strength_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_strength_records() TO authenticated;

COMMENT ON TABLE public.svj_exercises IS
  'Controlled exercise catalog. owner_user_id NULL = global catalog row; a user id = that user''s private custom exercise. Central muscle metadata for future muscle-map/balance views.';
COMMENT ON TABLE public.svj_activity_exercises IS
  'Exercises performed inside one canonical strength workout. Written only by svj_save_strength_activity; read-only from the client.';
COMMENT ON TABLE public.svj_strength_sets IS
  'Individual strength sets (reps / weight_kg / duration_seconds). bodyweight sets keep weight_kg NULL — never a fabricated 0 kg.';
COMMENT ON TABLE public.svj_personal_records IS
  'Materialised strength personal records, each linked to the canonical activity (and set) that established it. Never client-authored.';

COMMIT;
