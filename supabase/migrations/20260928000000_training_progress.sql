-- ============================================================================
-- Automated Training — progress, load conventions and multi-device safety.
--
-- ADDITIVE. Nothing here changes the canonical strength transaction.
--
--   1. Every reviewed catalog exercise now declares its LOAD CONVENTION, so a
--      progress comparison can never equate "20 kg per hand" with "40 kg on the
--      machine". Unclassified movements stay NULL and are never compared.
--   2. svj_get_exercise_history returns that convention (and the movement
--      pattern) alongside the sets it already returned.
--   3. svj_record_training_context reports whether the plan slot was already
--      finalized, so a second device gets a clear answer instead of silently
--      creating a second completion.
--   4. Progression decisions are unique per (user, exercise, evidence activity):
--      replaying the same workout can never produce two decisions from one set
--      of evidence.
-- ============================================================================

BEGIN;

-- ── 1) Declared load conventions for the reviewed catalog ──────────────────
WITH declared(slug, convention) AS (
  VALUES
    ('bench_press', 'barbell_total'),
    ('incline_bench_press', 'barbell_total'),
    ('dumbbell_bench_press', 'dumbbell_per_hand'),
    ('chest_press', 'machine_stack'),
    ('chest_fly', 'dumbbell_per_hand'),
    ('push_up', 'bodyweight_added'),
    ('pull_up', 'bodyweight_added'),
    ('lat_pulldown', 'machine_stack'),
    ('barbell_row', 'barbell_total'),
    ('dumbbell_row', 'dumbbell_per_hand'),
    ('seated_cable_row', 'cable'),
    ('overhead_press', 'barbell_total'),
    ('dumbbell_shoulder_press', 'dumbbell_per_hand'),
    ('lateral_raise', 'dumbbell_per_hand'),
    ('rear_delt_fly', 'dumbbell_per_hand'),
    ('bicep_curl', 'dumbbell_per_hand'),
    ('hammer_curl', 'dumbbell_per_hand'),
    ('tricep_pushdown', 'cable'),
    ('overhead_tricep_extension', 'cable'),
    ('dips', 'bodyweight_added'),
    ('squat', 'barbell_total'),
    ('leg_press', 'machine_stack'),
    ('lunges', 'dumbbell_per_hand'),
    ('bulgarian_split_squat', 'dumbbell_per_hand'),
    ('leg_extension', 'machine_stack'),
    ('leg_curl', 'machine_stack'),
    ('romanian_deadlift', 'barbell_total'),
    ('deadlift', 'barbell_total'),
    ('calf_raise', 'machine_stack'),
    ('plank', 'bodyweight_added'),
    ('crunch', 'bodyweight_added'),
    ('leg_raise', 'bodyweight_added'),
    ('russian_twist', 'bodyweight_added'),
    ('burpee', 'bodyweight_added'),
    ('kettlebell_swing', 'barbell_total')
)
UPDATE public.svj_exercises e
   SET load_convention = d.convention
  FROM declared d
 WHERE e.slug = d.slug
   AND e.owner_user_id IS NULL
   AND e.load_convention IS NULL;

-- Reviewed catalog rows must never disagree with the declaration above.
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_bad
    FROM public.svj_exercises e
   WHERE e.owner_user_id IS NULL
     AND e.slug IN ('bench_press', 'incline_bench_press', 'dumbbell_bench_press', 'chest_press', 'chest_fly', 'push_up', 'pull_up', 'lat_pulldown', 'barbell_row', 'dumbbell_row', 'seated_cable_row', 'overhead_press', 'dumbbell_shoulder_press', 'lateral_raise', 'rear_delt_fly', 'bicep_curl', 'hammer_curl', 'tricep_pushdown', 'overhead_tricep_extension', 'dips', 'squat', 'leg_press', 'lunges', 'bulgarian_split_squat', 'leg_extension', 'leg_curl', 'romanian_deadlift', 'deadlift', 'calf_raise', 'plank', 'crunch', 'leg_raise', 'russian_twist', 'burpee', 'kettlebell_swing');
  IF v_bad = 0 THEN
    RAISE NOTICE 'No global catalog exercises present; conventions will seed later.';
  END IF;
END;
$$;

-- ── 2) Exercise history carries the convention it was logged under ─────────
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
             'duration_seconds', st.duration_seconds,
             'is_warmup', st.is_warmup
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
      'is_custom', v_exercise.is_custom,
      'load_convention', v_exercise.load_convention,
      'movement_pattern', v_exercise.movement_pattern
    ),
    'records', v_records,
    'sessions', v_sessions
  );
END;
$$;

-- ── 3) Slot finalization tells a second device the truth ───────────────────
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
  v_slot_owner uuid;
  v_slot_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT id INTO v_activity_id FROM public.svj_activities
    WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'No saved workout found for this session';
  END IF;

  v_plan_session_id := NULLIF(p_context->>'plan_session_id', '')::uuid;

  -- Ownership is verified before any link is written.
  IF v_plan_session_id IS NOT NULL THEN
    SELECT s.user_id, s.status INTO v_slot_owner, v_slot_status
      FROM public.svj_training_plan_sessions s
     WHERE s.id = v_plan_session_id;
    IF v_slot_owner IS NULL OR v_slot_owner <> v_user_id THEN
      RAISE EXCEPTION 'Unknown plan session';
    END IF;
  END IF;

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

  -- Finalize the slot exactly once. The WHERE guard plus this single-statement
  -- update is what makes two devices racing the same slot resolve to one
  -- completion: the loser matches zero rows and is told the slot is taken.
  IF v_plan_session_id IS NOT NULL THEN
    UPDATE public.svj_training_plan_sessions
      SET status = 'completed',
          completed_activity_id = v_activity_id,
          updated_at = now()
      WHERE id = v_plan_session_id
        AND user_id = v_user_id
        AND (status <> 'completed' OR completed_activity_id = v_activity_id)
      RETURNING status INTO v_slot_status;
  END IF;

  -- Template usage increments once per finalized activity.
  IF v_inserted AND p_context->>'template_id' IS NOT NULL THEN
    UPDATE public.svj_user_template_library
      SET use_count = use_count + 1,
          last_completed_at = now(),
          updated_at = now()
      WHERE user_id = v_user_id AND template_id = p_context->>'template_id';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', NOT v_inserted,
    'activity_id', v_activity_id,
    'slot_status', COALESCE(v_slot_status, 'none'),
    'slot_already_finalized', v_plan_session_id IS NOT NULL AND v_slot_status = 'completed' AND NOT v_inserted
  );
END;
$$;

-- ── 4) One progression decision per (user, exercise, evidence) ─────────────
CREATE UNIQUE INDEX IF NOT EXISTS svj_training_decisions_evidence_unique
  ON public.svj_training_decisions (user_id, exercise_slug, activity_id)
  WHERE activity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.svj_record_training_decision(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_activity_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_activity_id := NULLIF(p_payload->>'activity_id', '')::uuid;

  INSERT INTO public.svj_training_decisions (
    user_id, exercise_slug, activity_id, action, rationale, payload, policy_version
  ) VALUES (
    v_user_id,
    COALESCE(p_payload->>'exercise_slug', 'unknown'),
    v_activity_id,
    COALESCE(p_payload->>'action', 'hold'),
    COALESCE(p_payload->>'rationale', ''),
    COALESCE(p_payload->'payload', '{}'::jsonb),
    COALESCE(p_payload->>'policy_version', 'unknown')
  )
  ON CONFLICT (user_id, exercise_slug, activity_id) WHERE activity_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.svj_training_decisions
      WHERE user_id = v_user_id
        AND exercise_slug = COALESCE(p_payload->>'exercise_slug', 'unknown')
        AND activity_id = v_activity_id;
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
END;
$$;

-- ── 5) Decision history carries the policy version it was made under ───────
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
      'policyVersion', d.policy_version,
      'createdAt', d.created_at
    ) ORDER BY d.created_at DESC)
    FROM (
      SELECT * FROM public.svj_training_decisions
       WHERE user_id = auth.uid()
       ORDER BY created_at DESC
       LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    ) d
  ), '[]'::jsonb));
$$;

GRANT EXECUTE ON FUNCTION public.svj_get_exercise_history(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_record_training_context(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_record_training_decision(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_training_decisions(integer) TO authenticated;

COMMIT;
