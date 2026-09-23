-- ============================================================================
-- Automated Training — warm-up set persistence.
--
-- ADDITIVE. The canonical strength transaction (svj_save_strength_activity) is
-- REPLACED with a byte-faithful extension: the only behavioural changes are
--
--   1. each set may now carry is_warmup (default false — older clients are
--      unaffected and unknown historical rows stay false, never guessed);
--   2. warm-up sets are excluded from personal-record derivation, because a
--      ramp-up set is not working effort.
--
-- svj_get_strength_detail and svj_get_exercise_history now expose is_warmup so
-- the client can separate warm-ups from working volume and progression
-- evidence. Session-level volume/reps summaries are unchanged (a warm-up set is
-- still real physical work); only muscle history and records exclude it.
-- ============================================================================

BEGIN;

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
  v_is_warmup boolean;
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
        v_is_warmup := CASE WHEN jsonb_typeof(v_set->'is_warmup') = 'boolean'
          THEN (v_set->>'is_warmup')::boolean ELSE false END;
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
        user_id, activity_exercise_id, set_number, reps, weight_kg, duration_seconds, is_warmup
      ) VALUES (
        v_user_id, v_activity_exercise_id, v_set_number, v_reps, v_weight, v_duration, v_is_warmup
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
      AND s.is_warmup = false
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
      AND s.is_warmup = false
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
      AND s.is_warmup = false
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
      AND s.is_warmup = false
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
      AND s.is_warmup = false
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
        AND s.is_warmup = false
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
               'duration_seconds', s.duration_seconds,
               'is_warmup', s.is_warmup
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
      'is_custom', v_exercise.is_custom
    ),
    'records', v_records,
    'sessions', v_sessions
  );
END;
$$;

-- Re-assert the authenticated surface (CREATE OR REPLACE preserves ACLs; this
-- keeps the migration self-documenting and safe on a fresh database).
GRANT EXECUTE ON FUNCTION public.svj_save_strength_activity(text, timestamptz, timestamptz, integer, jsonb, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_get_strength_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_get_exercise_history(uuid, integer) TO authenticated;

COMMIT;
