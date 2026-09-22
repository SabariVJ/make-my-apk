-- ============================================================================
-- Automated Training — exercise history carries perceived effort.
--
-- ADDITIVE. The progressive-overload engine needs real effort evidence (session
-- RPE) to justify a load change; it must never guess effort from attendance.
-- svj_get_exercise_history is re-created to return the session's stored
-- perceived_effort (1-10, NULL when the user did not log it) next to the sets
-- it already returned. Nothing else about the response changes.
-- ============================================================================

BEGIN;

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
      'perceived_effort', s.perceived_effort,
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
           a.perceived_effort,
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

GRANT EXECUTE ON FUNCTION public.svj_get_exercise_history(uuid, integer) TO authenticated;

COMMIT;
