-- Recovery Goals (Phase 5) — server-authoritative day-count metrics, the
-- expired-lifecycle fix, and idempotent Discipline progression.
--
-- Extends the EXISTING svj_goals system (no second goals table, no client
-- progress). Additive and idempotent; safe to run on the current production
-- schema. DEPENDENCY: public.svj_recovery_checkins and public.svj_readiness_daily
-- (20260919120000_recovery_readiness.sql) must exist — Phase 5 progress reads
-- them. It does NOT depend on the Automated Training chain.
BEGIN;

-- ── 1) Widen the metric CHECK: four activity + four Recovery metrics ───────
ALTER TABLE public.svj_goals DROP CONSTRAINT IF EXISTS svj_goals_metric_check;
ALTER TABLE public.svj_goals
  ADD CONSTRAINT svj_goals_metric_check CHECK (metric IN (
    'workout_count', 'step_total', 'active_minutes', 'distance',
    'recovery_checkin_count', 'sleep_7h_day_count',
    'rest_day_count', 'readiness_60_day_count'
  ));

-- Recovery goals are day counts: activity_type is meaningless on them and any
-- legacy value would silently mislead the progress logic.
ALTER TABLE public.svj_goals
  DROP CONSTRAINT IF EXISTS svj_goals_recovery_activity_type,
  ADD CONSTRAINT svj_goals_recovery_activity_type CHECK (
    metric IN ('workout_count', 'step_total', 'active_minutes', 'distance')
    OR activity_type IS NULL
  );

-- ── 2) Metric units (display) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_goal_metric_units(p_metric text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_metric
    WHEN 'workout_count' THEN 'workouts'
    WHEN 'step_total' THEN 'steps'
    WHEN 'active_minutes' THEN 'minutes'
    WHEN 'distance' THEN 'meters'
    WHEN 'recovery_checkin_count' THEN 'days'
    WHEN 'sleep_7h_day_count' THEN 'days'
    WHEN 'rest_day_count' THEN 'days'
    WHEN 'readiness_60_day_count' THEN 'days'
  END;
$$;

-- ── 3) Authoritative progress for the four Recovery metrics ────────────────
-- All four are monotonic counts of qualifying calendar days. Only elapsed
-- dates count: a day after the server's "today" never contributes. The
-- server clock is the sole calendar authority — the client never computes
-- progress.
CREATE OR REPLACE FUNCTION public.svj_goal_progress(goal public.svj_goals)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := goal.user_id;
  -- Inclusive elapsed days: period_start .. min(period_end, today).
  v_effective_end date := LEAST(goal.period_end, (now() AT TIME ZONE 'utc')::date);
  v_count integer;
BEGIN
  CASE goal.metric
    WHEN 'recovery_checkin_count' THEN
      SELECT COUNT(*)::integer INTO v_count
      FROM public.svj_recovery_checkins c
      WHERE c.user_id = v_user
        AND c.checkin_date >= goal.period_start
        AND c.checkin_date <= v_effective_end;

    WHEN 'sleep_7h_day_count' THEN
      -- Stored check-in days with sleep_hours >= 7. Missing/NULL sleep is
      -- excluded — never converted to 0.
      SELECT COUNT(*)::integer INTO v_count
      FROM public.svj_recovery_checkins c
      WHERE c.user_id = v_user
        AND c.checkin_date >= goal.period_start
        AND c.checkin_date <= v_effective_end
        AND c.sleep_hours IS NOT NULL
        AND c.sleep_hours >= 7;

    WHEN 'rest_day_count' THEN
      -- Authoritative rest-day semantics, identical to svj_compute_readiness:
      -- a rest day is an elapsed calendar date with NO canonical activity
      -- ending inside that UTC day.
      SELECT COUNT(*)::integer INTO v_count
      FROM generate_series(goal.period_start, v_effective_end, interval '1 day') AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.svj_activities a
        WHERE a.user_id = v_user
          AND a.ended_at >= d
          AND a.ended_at <  d + interval '1 day'
      );

    WHEN 'readiness_60_day_count' THEN
      -- Days whose persisted readiness score reached the existing 60 boundary.
      -- Missing readiness days do not count (and are never score 0).
      SELECT COUNT(*)::integer INTO v_count
      FROM public.svj_readiness_daily r
      WHERE r.user_id = v_user
        AND r.readiness_date >= goal.period_start
        AND r.readiness_date <= v_effective_end
        AND r.score >= 60;

    ELSE
      -- The four activity metrics keep their exact original branches
      -- (integrity guards included) so existing goals are untouched.
      IF goal.metric = 'workout_count' THEN
        SELECT COUNT(*)::integer INTO v_count
        FROM public.svj_activities a
        WHERE a.user_id = v_user
          AND a.started_at >= goal.period_start
          AND a.started_at <  goal.period_end + interval '1 day';
      ELSIF goal.metric = 'step_total' THEN
        SELECT COALESCE(SUM(a.step_count), 0)::integer INTO v_count
        FROM public.svj_activities a
        WHERE a.user_id = v_user
          AND a.source = 'svj_native'
          AND a.step_count IS NOT NULL
          AND a.started_at >= goal.period_start
          AND a.started_at <  goal.period_end + interval '1 day';
      ELSIF goal.metric = 'active_minutes' THEN
        SELECT COALESCE(ROUND(SUM(a.duration_seconds) / 60.0), 0)::integer INTO v_count
        FROM public.svj_activities a
        WHERE a.user_id = v_user
          AND a.started_at >= goal.period_start
          AND a.started_at <  goal.period_end + interval '1 day';
      ELSIF goal.metric = 'distance' THEN
        SELECT COALESCE(ROUND(SUM(a.distance_meters)), 0)::integer INTO v_count
        FROM public.svj_activities a
        WHERE a.user_id = v_user
          AND a.source = 'svj_native'
          AND a.distance_meters IS NOT NULL
          AND a.started_at >= goal.period_start
          AND a.started_at <  goal.period_end + interval '1 day';
      END IF;
  END CASE;

  RETURN COALESCE(v_count, 0)::numeric;
END;
$$;

-- ── 4) Target validation: day-count targets fit inside the period ──────────
CREATE OR REPLACE FUNCTION public.svj_goal_target_error(
  p_metric text,
  p_target numeric,
  p_period_start date,
  p_period_end date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_target IS NULL OR p_target <= 0 THEN
    RETURN 'Invalid goal target';
  END IF;
  IF p_metric IN (
    'recovery_checkin_count', 'sleep_7h_day_count',
    'rest_day_count', 'readiness_60_day_count'
  ) THEN
    IF p_target <> floor(p_target) THEN
      RETURN 'Recovery goal targets are whole days';
    END IF;
    IF p_target > (p_period_end - p_period_start + 1) THEN
      RETURN 'Recovery goal target cannot exceed the days in its period';
    END IF;
  ELSIF p_target > 10000000 THEN
    RETURN 'Invalid goal target';
  END IF;
  RETURN NULL;
END;
$$;

-- ── 5) create_goal: accept the new metrics with mirrored validation ────────
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
  v_target_error text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_metric NOT IN (
    'workout_count', 'step_total', 'active_minutes', 'distance',
    'recovery_checkin_count', 'sleep_7h_day_count',
    'rest_day_count', 'readiness_60_day_count'
  ) THEN
    RAISE EXCEPTION 'Unknown goal metric';
  END IF;
  IF p_activity_type IS NOT NULL AND p_activity_type NOT IN (
    'walking', 'running', 'strength', 'cycling', 'football',
    'calisthenics', 'hiit', 'yoga', 'other'
  ) THEN
    RAISE EXCEPTION 'Unknown activity type';
  END IF;
  v_target_error := public.svj_goal_target_error(
    p_metric, p_target_value, p_period_start, p_period_end
  );
  IF v_target_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_target_error;
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
  -- Recovery metrics are calendar-day counts; an activity-type filter would
  -- silently narrow or break their semantics.
  IF p_metric IN (
    'recovery_checkin_count', 'sleep_7h_day_count',
    'rest_day_count', 'readiness_60_day_count'
  ) AND p_activity_type IS NOT NULL THEN
    RAISE EXCEPTION 'Recovery goals do not take an activity type';
  END IF;

  INSERT INTO public.svj_goals (
    user_id, metric, activity_type, target_value,
    period_type, period_start, period_end
  ) VALUES (
    v_user_id, p_metric, NULL, p_target_value,
    p_period_type, p_period_start, p_period_end
  )
  RETURNING * INTO v_goal;

  RETURN jsonb_build_object('ok', true, 'goal', public.svj_goal_with_progress(v_goal));
END;
$$;

-- ── 6) Lifecycle: completion wins over expiry + Discipline reward ──────────
-- Derive authoritative progress for every active goal:
--   progress >= target          → completed (never expired, even if past end)
--   period_end < today (unmet)  → expired
--   otherwise                   → stays active
-- A goal completed before this migration existed is NOT retroactively
-- rewarded (no backfill): stat awards flow only from a refresh that observes
-- an active→completed transition.
-- NOTE: the return type stays void — the original signature is preserved so
-- every existing caller (svj_save_activity, strength logging, warmup) keeps
-- working unchanged.
CREATE OR REPLACE FUNCTION public.svj_refresh_goal_statuses(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal public.svj_goals;
  v_progress numeric;
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  FOR v_goal IN
    SELECT * FROM public.svj_goals
    WHERE user_id = p_user_id AND status = 'active'
  LOOP
    v_progress := public.svj_goal_progress(v_goal);

    IF v_progress >= v_goal.target_value THEN
      UPDATE public.svj_goals
      SET status = 'completed', updated_at = now()
      WHERE id = v_goal.id;
      PERFORM public.svj_award_recovery_goal_discipline(p_user_id, v_goal.id);
    ELSIF v_goal.period_end < v_today THEN
      UPDATE public.svj_goals
      SET status = 'expired', updated_at = now()
      WHERE id = v_goal.id;
    END IF;
    -- Otherwise: still inside its period and unmet → active.
  END LOOP;
END;
$$;

-- ── 7) Discipline award: idempotent + capped, internal only ────────────────
-- source = 'recovery_goal', +1 discipline per completion, at most +2 per
-- server day (independent of the activity caps). The stat_events unique index
-- on (user_id, event_key) makes a repeat grant a no-op; user_stats is updated
-- only when the event row was actually inserted.
CREATE OR REPLACE FUNCTION public.svj_award_recovery_goal_discipline(
  p_user_id uuid,
  p_goal_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_key text := 'recovery_goal.completed:' || p_goal_id::text;
  v_inserted boolean := false;
  v_day_sum integer;
BEGIN
  INSERT INTO public.stat_events (
    user_id, stat_name, delta, source, source_id, event_key
  ) VALUES (
    p_user_id, 'discipline', 1, 'recovery_goal', p_goal_id::text, v_event_key
  )
  -- The (user_id, event_key) identity is a PARTIAL unique index, so conflict
  -- targeting by column list is unavailable — DO NOTHING covers it (same
  -- pattern as the activity reward writer).
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted IS NOT TRUE THEN
    RETURN false;  -- already rewarded (idempotent replay)
  END IF;

  -- Conservative anti-farming cap: max +2 discipline/day from recovery_goal
  -- sources. Independent of — and never touching — the activity cap sums.
  SELECT COALESCE(SUM(delta), 0)::integer INTO v_day_sum
  FROM public.stat_events
  WHERE user_id = p_user_id
    AND stat_name = 'discipline'
    AND source = 'recovery_goal'
    AND created_at >= date_trunc('day', now());

  IF v_day_sum > 2 THEN
    -- Over the cap: undo the event so the ledger stays the sole truth.
    DELETE FROM public.stat_events
    WHERE user_id = p_user_id AND event_key = v_event_key;
    RETURN false;
  END IF;

  UPDATE public.user_stats
  SET discipline = LEAST(100, discipline + 1)
  WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_award_recovery_goal_discipline(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- Re-assert the full existing grant surface for every replaced function.
REVOKE ALL ON FUNCTION public.svj_goal_progress(public.svj_goals) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_goal_metric_units(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_goal_target_error(text, numeric, date, date) FROM PUBLIC, anon;
-- The original goal RPCs call svj_goal_progress with the caller's rights
-- (create/list are SECURITY INVOKER), so authenticated keeps EXECUTE.
GRANT EXECUTE ON FUNCTION public.svj_goal_progress(public.svj_goals) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_goal_metric_units(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_goal_target_error(text, numeric, date, date)
  TO authenticated;
REVOKE ALL ON FUNCTION public.svj_refresh_goal_statuses(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_create_goal(text, numeric, text, date, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_refresh_goal_statuses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_create_goal(text, numeric, text, date, date, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
