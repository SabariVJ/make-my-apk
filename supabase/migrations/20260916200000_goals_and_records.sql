-- ============================================================================
-- Update 02: personal fitness goals + personal records.
--
-- Builds directly on Update 01's canonical svj_activities. Additive only.
--
-- Goals are measurable targets across a weekly/monthly period. Progress is
-- ALWAYS derived server-side from canonical activities — the client can
-- create, edit and cancel goals but can never state its own progress.
--
-- Personal records are derived from eligible canonical activities. The
-- client cannot set a PR. Each newly established record emits exactly one
-- immutable personal_record.achieved ledger event keyed to the canonical
-- activity, so a retried save can never create a duplicate record or event.
--
-- Timezone: period boundaries are accepted as dates and validated for shape;
-- the app follows the existing SVJ convention of treating day boundaries in
-- the user's local calendar (the client computes the date window, the server
-- validates the shape and derives all progress within it).
-- ============================================================================

BEGIN;

-- ── 1) GOALS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN (
    'workout_count', 'step_total', 'active_minutes', 'distance'
  )),
  -- Optional canonical activity-type filter (e.g. steps from running only).
  -- NULL = any activity type permitted by the metric's eligibility rules.
  activity_type text CHECK (
    activity_type IS NULL OR activity_type IN (
      'walking', 'running', 'strength', 'cycling', 'football',
      'calisthenics', 'hiit', 'yoga', 'other'
    )
  ),
  target_value numeric(12, 2) NOT NULL CHECK (target_value > 0 AND target_value <= 10000000),
  period_type text NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_goals_period_order CHECK (period_end >= period_start),
  CONSTRAINT svj_goals_period_shape CHECK (
    (period_type = 'weekly' AND period_end - period_start <= 7)
    OR (period_type = 'monthly' AND period_end - period_start <= 31)
  )
);

CREATE INDEX IF NOT EXISTS svj_goals_user_status_idx
  ON public.svj_goals (user_id, status, period_end DESC);
CREATE INDEX IF NOT EXISTS svj_goals_user_period_idx
  ON public.svj_goals (user_id, period_start, period_end);

ALTER TABLE public.svj_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_goals FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_goals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.svj_goals TO authenticated;
GRANT ALL ON public.svj_goals TO service_role;

-- Strict ownership: identity always derived from auth.uid(); no other user's
-- goals can be read or written. Progress is never a writable column, so
-- "setting" progress directly is impossible by schema design.
DROP POLICY IF EXISTS "Users manage own goals" ON public.svj_goals;
CREATE POLICY "Users manage own goals"
  ON public.svj_goals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2) Central source-eligibility rules (single source of truth) ───────────
-- svj_native activities carry genuine sensor steps and sensor distance.
-- Manual activities carry genuinely-spent time but user-typed step/distance
-- values, which must never influence step/distance metrics or PRs.
CREATE OR REPLACE FUNCTION public.svj_goal_metric_units(p_metric text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_metric
    WHEN 'workout_count' THEN 'workouts'
    WHEN 'step_total' THEN 'steps'
    WHEN 'active_minutes' THEN 'minutes'
    WHEN 'distance' THEN 'meters'
  END;
$$;

-- ── 3) Progress derivation from canonical activities ───────────────────────
CREATE OR REPLACE FUNCTION public.svj_goal_progress(goal public.svj_goals)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  IF goal.metric = 'workout_count' THEN
    SELECT COUNT(*) INTO v_total
    FROM public.svj_activities a
    WHERE a.user_id = goal.user_id
      AND a.started_at >= goal.period_start
      AND a.started_at < goal.period_end + 1
      AND (goal.activity_type IS NULL OR a.activity_type = goal.activity_type);
  ELSIF goal.metric = 'step_total' THEN
    -- Native sensor steps only: manual step entries are user-typed.
    SELECT COALESCE(SUM(a.step_count), 0) INTO v_total
    FROM public.svj_activities a
    WHERE a.user_id = goal.user_id
      AND a.source = 'svj_native'
      AND a.started_at >= goal.period_start
      AND a.started_at < goal.period_end + 1
      AND (goal.activity_type IS NULL OR a.activity_type = goal.activity_type);
  ELSIF goal.metric = 'active_minutes' THEN
    -- Both sources genuinely spent the time.
    SELECT COALESCE(SUM(a.duration_seconds), 0) / 60.0 INTO v_total
    FROM public.svj_activities a
    WHERE a.user_id = goal.user_id
      AND a.started_at >= goal.period_start
      AND a.started_at < goal.period_end + 1
      AND (goal.activity_type IS NULL OR a.activity_type = goal.activity_type);
  ELSIF goal.metric = 'distance' THEN
    -- Only genuinely measured distance (native sensor) may count.
    SELECT COALESCE(SUM(a.distance_meters), 0) INTO v_total
    FROM public.svj_activities a
    WHERE a.user_id = goal.user_id
      AND a.source = 'svj_native'
      AND a.distance_meters IS NOT NULL
      AND a.started_at >= goal.period_start
      AND a.started_at < goal.period_end + 1
      AND (goal.activity_type IS NULL OR a.activity_type = goal.activity_type);
  END IF;
  RETURN ROUND(v_total::numeric, 2);
END;
$$;

-- ── 4) Goal RPCs (identity from auth.uid(), never a client field) ──────────
CREATE OR REPLACE FUNCTION public.svj_create_goal(
  p_metric text,
  p_target_value numeric,
  p_period_type text,
  p_period_start date,
  p_period_end date,
  p_activity_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_goal public.svj_goals;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_metric NOT IN ('workout_count', 'step_total', 'active_minutes', 'distance') THEN
    RAISE EXCEPTION 'Unknown goal metric';
  END IF;
  IF p_activity_type IS NOT NULL AND p_activity_type NOT IN (
    'walking', 'running', 'strength', 'cycling', 'football',
    'calisthenics', 'hiit', 'yoga', 'other'
  ) THEN
    RAISE EXCEPTION 'Unknown activity type';
  END IF;
  IF p_target_value IS NULL OR p_target_value <= 0 OR p_target_value > 10000000 THEN
    RAISE EXCEPTION 'Invalid goal target';
  END IF;
  IF p_period_type NOT IN ('weekly', 'monthly') THEN
    RAISE EXCEPTION 'Unknown goal period';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid goal period dates';
  END IF;
  IF p_period_type = 'weekly' AND p_period_end - p_period_start > 7 THEN
    RAISE EXCEPTION 'Weekly goals span at most 7 days';
  END IF;
  IF p_period_type = 'monthly' AND (p_period_end - p_period_start > 31) THEN
    RAISE EXCEPTION 'Monthly goals span at most 31 days';
  END IF;

  INSERT INTO public.svj_goals (
    user_id, metric, activity_type, target_value,
    period_type, period_start, period_end
  ) VALUES (
    v_user_id, p_metric, p_activity_type, p_target_value,
    p_period_type, p_period_start, p_period_end
  )
  RETURNING * INTO v_goal;

  RETURN jsonb_build_object('ok', true, 'goal', public.svj_goal_with_progress(v_goal));
END;
$$;

-- One read shape: the goal row plus its server-derived progress.
CREATE OR REPLACE FUNCTION public.svj_goal_with_progress(goal public.svj_goals)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_progress numeric := public.svj_goal_progress(goal);
  v_status text := goal.status;
BEGIN
  IF v_status = 'active' AND v_progress >= goal.target_value THEN
    v_status := 'completed';
  END IF;
  RETURN jsonb_build_object(
    'id', goal.id,
    'user_id', goal.user_id,
    'metric', goal.metric,
    'activity_type', goal.activity_type,
    'target_value', goal.target_value,
    'period_type', goal.period_type,
    'period_start', goal.period_start,
    'period_end', goal.period_end,
    'status', v_status,
    'progress', v_progress,
    'created_at', goal.created_at,
    'updated_at', goal.updated_at
  );
END;
$$;

-- Completion is derived on read; persist it so history is stable.
CREATE OR REPLACE FUNCTION public.svj_refresh_goal_statuses(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.svj_goals g
  SET status = 'completed', updated_at = now()
  WHERE g.user_id = p_user_id
    AND g.status = 'active'
    AND public.svj_goal_progress(g) >= g.target_value;
$$;

CREATE OR REPLACE FUNCTION public.svj_list_goals(
  p_include_completed boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  PERFORM public.svj_refresh_goal_statuses(v_user_id);
  RETURN jsonb_build_object(
    'ok', true,
    'goals', COALESCE(
      jsonb_agg(
        public.svj_goal_with_progress(g)
        ORDER BY g.status = 'active' DESC, g.period_end DESC, g.created_at DESC
      ) FILTER (WHERE p_include_completed OR g.status = 'active'),
      '[]'::jsonb
    )
  )
  FROM public.svj_goals g
  WHERE g.user_id = v_user_id
    AND (p_include_completed OR g.status = 'active');
END;
$$;

-- Legitimate editing: target/cancel only, own active goals only. Progress is
-- always recomputed from activity history — never carried over or granted.
CREATE OR REPLACE FUNCTION public.svj_update_goal(
  p_goal_id uuid,
  p_target_value numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_goal public.svj_goals;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_target_value IS NULL OR p_target_value <= 0 OR p_target_value > 10000000 THEN
    RAISE EXCEPTION 'Invalid goal target';
  END IF;
  UPDATE public.svj_goals
  SET target_value = p_target_value, updated_at = now()
  WHERE id = p_goal_id AND user_id = v_user_id AND status = 'active'
  RETURNING * INTO v_goal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active goal not found';
  END IF;
  RETURN jsonb_build_object('ok', true, 'goal', public.svj_goal_with_progress(v_goal));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_cancel_goal(p_goal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_goal public.svj_goals;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  UPDATE public.svj_goals
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_goal_id AND user_id = v_user_id AND status = 'active'
  RETURNING * INTO v_goal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active goal not found';
  END IF;
  RETURN jsonb_build_object('ok', true, 'goal', public.svj_goal_with_progress(v_goal));
END;
$$;

REVOKE ALL ON FUNCTION public.svj_create_goal(text, numeric, text, date, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_create_goal(text, numeric, text, date, date, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.svj_list_goals(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_goals(boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.svj_update_goal(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_update_goal(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.svj_cancel_goal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_cancel_goal(uuid) TO authenticated;

-- ── 5) Personal records ─────────────────────────────────────────────────────
-- Derived from canonical activities; never client-authored. Eligibility:
--   most_steps_in_activity     → svj_native only (sensor step_count > 0)
--   longest_activity_duration  → any source (genuinely spent time)
--   longest_distance           → svj_native with non-null distance only
-- Running split PRs (1K/5K/10K) are deliberately deferred: Update 01 has no
-- trustworthy per-split distance data, and accuracy beats card count.
CREATE OR REPLACE FUNCTION public.svj_record_eligible(
  p_record_type text,
  p_source text,
  p_step_count integer,
  p_distance_meters numeric,
  p_duration_seconds integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_record_type
    WHEN 'most_steps_in_activity' THEN
      p_source = 'svj_native' AND p_step_count > 0
    WHEN 'longest_activity_duration' THEN
      p_duration_seconds > 0
    WHEN 'longest_distance' THEN
      p_source = 'svj_native' AND p_distance_meters IS NOT NULL AND p_distance_meters > 0
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.svj_record_value(
  p_record_type text,
  p_step_count integer,
  p_distance_meters numeric,
  p_duration_seconds integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_record_type
    WHEN 'most_steps_in_activity' THEN p_step_count::numeric
    WHEN 'longest_activity_duration' THEN p_duration_seconds::numeric
    WHEN 'longest_distance' THEN p_distance_meters
    ELSE 0
  END;
$$;

-- Current records + the activities that set them, derived live from the
-- canonical history. An activity "holds" a record when its value is the
-- maximum among all earlier-or-equal eligible activities and it is the
-- earliest activity holding that maximum (ties keep the first achiever).
CREATE OR REPLACE FUNCTION public.svj_list_records()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_records jsonb;
  v_recent jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  WITH eligible AS (
    SELECT a.*,
           r.record_type,
           public.svj_record_value(r.record_type, a.step_count, a.distance_meters, a.duration_seconds) AS value
    FROM public.svj_activities a
    CROSS JOIN (VALUES
      ('most_steps_in_activity'),
      ('longest_activity_duration'),
      ('longest_distance')
    ) AS r(record_type)
    WHERE a.user_id = v_user_id
      AND public.svj_record_eligible(
        r.record_type, a.source, a.step_count, a.distance_meters, a.duration_seconds)
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY record_type
        ORDER BY value DESC, ended_at ASC, id ASC
      ) AS rn
    FROM eligible
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'record_type', record_type,
      'value', value,
      'activity_id', id,
      'activity_type', activity_type,
      'source', source,
      'achieved_at', ended_at
    ) ORDER BY record_type), '[]'::jsonb)
  INTO v_records
  FROM ranked WHERE rn = 1;

  -- Recent record-setting activities (latest six across all record types).
  WITH eligible AS (
    SELECT a.*,
           r.record_type,
           public.svj_record_value(r.record_type, a.step_count, a.distance_meters, a.duration_seconds) AS value
    FROM public.svj_activities a
    CROSS JOIN (VALUES
      ('most_steps_in_activity'),
      ('longest_activity_duration'),
      ('longest_distance')
    ) AS r(record_type)
    WHERE a.user_id = v_user_id
      AND public.svj_record_eligible(
        r.record_type, a.source, a.step_count, a.distance_meters, a.duration_seconds)
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY record_type
        ORDER BY value DESC, ended_at ASC, id ASC
      ) AS rn
    FROM eligible
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'record_type', record_type,
      'value', value,
      'activity_id', id,
      'activity_type', activity_type,
      'achieved_at', ended_at
    ) ORDER BY ended_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM ranked
  WHERE id IN (
    SELECT id FROM ranked WHERE rn = 1
    UNION ALL
    -- earlier record-holders that a later activity surpassed
    SELECT earlier.id
    FROM ranked current_holder
    JOIN ranked earlier
      ON earlier.record_type = current_holder.record_type
      AND earlier.rn > 1
      AND earlier.value < current_holder.value
    WHERE current_holder.rn = 1
      AND NOT EXISTS (
        SELECT 1 FROM ranked between_holder
        WHERE between_holder.record_type = earlier.record_type
          AND between_holder.rn > 1
          AND between_holder.value > earlier.value
          AND between_holder.ended_at < (
            SELECT MIN(h.ended_at) FROM ranked h
            WHERE h.record_type = earlier.record_type AND h.rn = 1)
      )
  )
  LIMIT 6;

  RETURN jsonb_build_object('ok', true, 'records', v_records, 'recent', v_recent);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_list_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_records() TO authenticated;

-- ── 6) PR detection on save + idempotent record events ─────────────────────
-- Replaces the Update 01 save function (additive CREATE OR REPLACE — the
-- committed migration file is untouched). The envelope gains:
--   new_records: [{ record_type, value, previous_value | null }]
--   goal_progress: [{ goal_id, metric, progress, target_value, period_type }]
-- Each newly established record writes one activity_events row keyed
-- personal_record.achieved:<activity_id>:<record_type> — the existing unique
-- constraint makes retries return the same result without duplicate events.
CREATE OR REPLACE FUNCTION public.svj_save_activity(
  p_client_session_id text,
  p_activity_type text,
  p_source text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_step_count integer DEFAULT 0,
  p_distance_meters numeric DEFAULT NULL,
  p_calories_estimate numeric DEFAULT NULL,
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
  v_record_type text;
  v_value numeric;
  v_previous numeric;
  v_new_records jsonb := '[]'::jsonb;
  v_goal_progress jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_client_session_id IS NULL OR char_length(btrim(p_client_session_id)) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'A valid session id is required';
  END IF;
  IF p_activity_type NOT IN (
    'walking', 'running', 'strength', 'cycling', 'football',
    'calisthenics', 'hiit', 'yoga', 'other'
  ) THEN
    RAISE EXCEPTION 'Unknown activity type';
  END IF;
  IF p_source NOT IN ('svj_native', 'manual') THEN
    RAISE EXCEPTION 'Unknown activity source';
  END IF;
  IF p_started_at IS NULL OR p_ended_at IS NULL OR p_ended_at <= p_started_at THEN
    RAISE EXCEPTION 'Activity end must be after start';
  END IF;
  IF p_ended_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Activity end time cannot be in the future';
  END IF;
  IF p_duration_seconds IS NULL OR p_duration_seconds < 1
    OR p_duration_seconds > 86400
    OR p_duration_seconds > EXTRACT(EPOCH FROM (p_ended_at - p_started_at))::integer + 120 THEN
    RAISE EXCEPTION 'Invalid activity duration';
  END IF;
  IF p_step_count IS NULL OR p_step_count < 0 OR p_step_count > 500000 THEN
    RAISE EXCEPTION 'Invalid step count';
  END IF;
  IF p_source = 'manual' AND p_step_count > 0 AND p_distance_meters IS NOT NULL THEN
    p_distance_meters := NULL;
  END IF;
  IF p_distance_meters IS NOT NULL AND (p_distance_meters < 0 OR p_distance_meters > 500000) THEN
    RAISE EXCEPTION 'Invalid distance';
  END IF;
  IF p_calories_estimate IS NOT NULL AND (p_calories_estimate < 0 OR p_calories_estimate > 20000) THEN
    RAISE EXCEPTION 'Invalid calorie estimate';
  END IF;
  IF p_perceived_effort IS NOT NULL AND p_perceived_effort NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Invalid perceived effort';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 500 THEN
    RAISE EXCEPTION 'Notes are too long';
  END IF;

  INSERT INTO public.svj_activities (
    user_id, client_session_id, activity_type, source,
    started_at, ended_at, duration_seconds,
    step_count, distance_meters, calories_estimate,
    perceived_effort, notes
  ) VALUES (
    v_user_id, btrim(p_client_session_id), p_activity_type, p_source,
    p_started_at, p_ended_at, p_duration_seconds,
    p_step_count, p_distance_meters, p_calories_estimate,
    p_perceived_effort, NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  ON CONFLICT (user_id, client_session_id) DO NOTHING
  RETURNING id INTO v_activity_id;

  IF v_activity_id IS NULL THEN
    SELECT * INTO v_existing FROM public.svj_activities
    WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
    -- Idempotent retry: the canonical activity already exists, its completion
    -- event exists, and any records it set were recorded at first save. The
    -- retry re-reads (never re-writes) goal progress so the response stays
    -- accurate without duplicating anything.
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
      'new_records', '[]'::jsonb,
      'goal_progress', v_goal_progress
    );
  END IF;

  -- One durable completion event (Update 01 behaviour preserved).
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
      'activity_type', p_activity_type,
      'source', p_source,
      'step_count', p_step_count,
      'duration_seconds', p_duration_seconds
    )
  )
  ON CONFLICT (user_id, event_key) DO NOTHING;

  -- ── New personal record detection (eligible types only) ─────────────────
  FOREACH v_record_type IN ARRAY ARRAY[
    'most_steps_in_activity', 'longest_activity_duration', 'longest_distance'
  ] LOOP
    CONTINUE WHEN NOT public.svj_record_eligible(
      v_record_type, p_source, p_step_count, p_distance_meters, p_duration_seconds);
    v_value := public.svj_record_value(
      v_record_type, p_step_count, p_distance_meters, p_duration_seconds);

    SELECT MAX(public.svj_record_value(
        r.record_type,
        a.step_count, a.distance_meters, a.duration_seconds))
      INTO v_previous
      FROM public.svj_activities a
      CROSS JOIN (VALUES (v_record_type)) AS r(record_type)
      WHERE a.user_id = v_user_id
        AND a.id <> v_activity_id
        AND public.svj_record_eligible(
          r.record_type, a.source, a.step_count, a.distance_meters, a.duration_seconds);

    IF v_previous IS NULL OR v_value > v_previous THEN
      v_new_records := v_new_records || jsonb_build_array(jsonb_build_object(
        'record_type', v_record_type,
        'value', v_value,
        'previous_value', v_previous
      ));
      -- Idempotent ledger event: a retried save returns the duplicate branch
      -- above and never reaches this path a second time.
      INSERT INTO public.activity_events (
        user_id, event_key, event_type, source_class, source_id, occurred_at, metadata
      ) VALUES (
        v_user_id,
        'personal_record.achieved:' || v_activity_id::text || ':' || v_record_type,
        'stat_change',
        'system',
        v_activity_id::text,
        p_ended_at,
        jsonb_build_object(
          'activity_id', v_activity_id,
          'record_type', v_record_type,
          'value', v_value,
          'previous_value', v_previous
        )
      )
      ON CONFLICT (user_id, event_key) DO NOTHING;
    END IF;
  END LOOP;

  -- Goal progress affected by this activity (derived, never client-stated).
  SELECT COALESCE(jsonb_agg(public.svj_goal_with_progress(g) ORDER BY g.created_at), '[]'::jsonb)
    INTO v_goal_progress
    FROM public.svj_goals g
    WHERE g.user_id = v_user_id
      AND g.status IN ('active', 'completed')
      AND p_started_at >= g.period_start
      AND p_started_at < g.period_end + 1;
  PERFORM public.svj_refresh_goal_statuses(v_user_id);

  SELECT * INTO v_existing FROM public.svj_activities WHERE id = v_activity_id;
  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'activity', to_jsonb(v_existing),
    'new_records', v_new_records,
    'goal_progress', v_goal_progress
  );
END;
$$;

COMMENT ON TABLE public.svj_goals IS
  'Personal fitness goals over weekly/monthly periods. Progress is server-derived from canonical activities; clients manage targets only.';

COMMIT;
