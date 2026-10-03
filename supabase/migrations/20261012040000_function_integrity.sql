-- Additive repairs discovered by isolated function lint and GPS pause tests.
-- Preserve every existing row, ledger key, grant and published migration.
BEGIN;
-- The historical cooldown migration contains literal \n inside a comment,
-- so it never created this column. Do not rewrite its published bytes.
ALTER TABLE public.user_personalization ADD COLUMN IF NOT EXISTS last_personalized_refresh_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='svj_gps_track_sample') THEN
    CREATE TYPE public.svj_gps_track_sample AS (
      seq integer, lat double precision, lng double precision, ele numeric,
      t_ms bigint, moving boolean, hr integer, cad integer, acc numeric,
      d_m double precision, pt_ms bigint, pele numeric, pmoving boolean
    );
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.svj_get_my_membership()
RETURNS TABLE (
  id uuid,
  display_name text,
  signup_date timestamptz,
  is_plus_member boolean,
  plus_unlocked_at timestamptz,
  plus_expires_at timestamptz,
  total_xp integer,
  current_streak integer,
  username text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
  self public.profiles%ROWTYPE;
  sibling public.profiles%ROWTYPE;
  v_has_lifetime_plus boolean := false;
  v_latest_plus_expires_at timestamptz;
BEGIN
  IF caller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.* INTO self
  FROM public.profiles AS p
  WHERE p.id = caller_id;

  IF NOT FOUND THEN
    SELECT u.email INTO caller_email
    FROM auth.users AS u
    WHERE u.id = caller_id;

    INSERT INTO public.profiles (id, email)
    VALUES (caller_id, caller_email)
    ON CONFLICT ON CONSTRAINT profiles_pkey DO NOTHING;

    SELECT p.* INTO self
    FROM public.profiles AS p
    WHERE p.id = caller_id;
  END IF;

  IF self.email IS NOT NULL THEN
    FOR sibling IN
      SELECT p.*
      FROM public.profiles AS p
      WHERE p.email = self.email
        AND p.id <> caller_id
      ORDER BY p.created_at ASC
    LOOP
      self.signup_date := LEAST(self.signup_date, sibling.signup_date);
      self.is_plus_member := self.is_plus_member OR sibling.is_plus_member;
      self.plus_unlocked_at := COALESCE(self.plus_unlocked_at, sibling.plus_unlocked_at);
      self.display_name := COALESCE(self.display_name, sibling.display_name);
      self.username := COALESCE(self.username, sibling.username);
      self.avatar_url := COALESCE(self.avatar_url, sibling.avatar_url);
      self.total_xp := GREATEST(self.total_xp, sibling.total_xp);
      self.current_streak := GREATEST(self.current_streak, sibling.current_streak);
    END LOOP;

    SELECT
      bool_or(p.is_plus_member AND p.plus_expires_at IS NULL),
      max(p.plus_expires_at) FILTER (WHERE p.is_plus_member AND p.plus_expires_at IS NOT NULL)
      INTO v_has_lifetime_plus, v_latest_plus_expires_at
    FROM public.profiles AS p
    WHERE p.email = self.email;

    self.plus_expires_at := CASE
      WHEN COALESCE(v_has_lifetime_plus, false) THEN NULL
      ELSE v_latest_plus_expires_at
    END;

    UPDATE public.profiles AS p
    SET signup_date = self.signup_date,
        is_plus_member = self.is_plus_member,
        plus_unlocked_at = self.plus_unlocked_at,
        plus_expires_at = self.plus_expires_at,
        display_name = COALESCE(self.display_name, p.display_name),
        username = COALESCE(self.username, p.username),
        avatar_url = COALESCE(self.avatar_url, p.avatar_url),
        total_xp = self.total_xp,
        current_streak = self.current_streak
    WHERE p.email = self.email;

    SELECT p.* INTO self
    FROM public.profiles AS p
    WHERE p.id = caller_id;
  END IF;

  RETURN QUERY
  SELECT
    self.id,
    self.display_name,
    self.signup_date,
    self.is_plus_member,
    self.plus_unlocked_at,
    self.plus_expires_at,
    self.total_xp,
    self.current_streak,
    self.username,
    self.avatar_url;
END;
$$;
CREATE OR REPLACE FUNCTION public.svj_reserve_personalized_refresh()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  cooldown_interval interval := interval '30 minutes';
  new_ts timestamptz := now();
  current_ts timestamptz;
  remaining_ms integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Atomic check-and-reserve: only one caller wins per cooldown window.
  UPDATE public.user_personalization
  SET last_personalized_refresh_at = new_ts
  WHERE user_id = caller_id
    AND (last_personalized_refresh_at IS NULL
         OR last_personalized_refresh_at <= new_ts - cooldown_interval);

  IF NOT FOUND THEN
    -- Cooldown still active, or another request already consumed it.
    SELECT last_personalized_refresh_at
      INTO current_ts
    FROM public.user_personalization
    WHERE user_id = caller_id;

    IF current_ts IS NULL THEN
      -- No row yet (defensive; should not happen when assessment is complete).
      remaining_ms := 30 * 60 * 1000;
    ELSE
      remaining_ms := CEIL(EXTRACT(EPOCH FROM (current_ts + cooldown_interval - new_ts)) * 1000);
      IF remaining_ms < 0 THEN
        remaining_ms := 0;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'cooldownRemainingMs', remaining_ms,
      'error', 'Personalized tasks are on a cooldown. Try again later.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'cooldownRemainingMs', 0);
END;
$$;
CREATE OR REPLACE FUNCTION public.svj_complete_my_personalized_task(
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_assignment public.svj_personalized_task_assignments%ROWTYPE;
  v_stat_changes jsonb := '{}'::jsonb;
  v_stat_name text;
  v_updated boolean;
  v_awarded integer := 0;
  v_ledger_rows integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_assignment FROM public.svj_personalized_task_assignments
  WHERE id = p_assignment_id AND user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  -- Already completed → idempotent no-op, zero additional rewards.
  IF v_assignment.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyCompleted', true,
      'xpAwarded', 0, 'statChanges', '{}'::jsonb);
  END IF;

  IF v_assignment.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This assignment is no longer available.');
  END IF;

  -- Assignment must still be current (server clock, never device time).
  IF v_assignment.assigned_for <> (now() AT TIME ZONE 'utc')::date
     OR (v_assignment.expires_at IS NOT NULL AND v_assignment.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This assignment has expired.');
  END IF;

  -- Claim exactly once (atomic status transition).
  UPDATE public.svj_personalized_task_assignments
  SET status = 'completed', completed_at = now()
  WHERE id = p_assignment_id AND user_id = v_caller AND status = 'active'
  RETURNING true INTO v_updated;

  IF v_updated IS DISTINCT FROM true THEN
    -- Lost a race with our own retry: treat as already completed.
    RETURN jsonb_build_object('ok', true, 'alreadyCompleted', true,
      'xpAwarded', 0, 'statChanges', '{}'::jsonb);
  END IF;

  -- Serialize the daily cap across different assignments for this account.
  PERFORM 1 FROM public.profiles WHERE id = v_caller FOR UPDATE;

  -- ── XP through the immutable ledger, exactly once ───────────────────────
  -- Daily safety cap for personalized XP (separate from activity XP caps):
  -- once 300 personalized XP has been granted today, further completions
  -- still record completion but award 0 XP.
  DECLARE
    v_cap_room integer := GREATEST(0, 300 - COALESCE((
      SELECT SUM(e.lifetime_xp_delta)::integer
      FROM public.activity_events e
      WHERE e.user_id = v_caller
        AND e.source_class = 'svj_personalized'
        AND e.created_at >= date_trunc('day', now())
    ), 0));
  BEGIN
    v_awarded := LEAST(v_assignment.xp_reward, v_cap_room);
    INSERT INTO public.activity_events (
      user_id, event_key, event_type, source_class, source_id,
      occurred_at, lifetime_xp_delta, rivalry_xp_delta, stat_deltas, metadata
    ) VALUES (
      v_caller,
      'personalized.task:' || v_assignment.id::text,
      'challenge_completion',
      'svj_personalized',
      v_assignment.id::text,
      now(),
      v_awarded,
      v_awarded,
      '{}'::jsonb,
      jsonb_build_object(
        'assignment_id', v_assignment.id,
        'template_key', v_assignment.template_key,
        'category', v_assignment.category,
        'difficulty', v_assignment.difficulty
      )
    )
    ON CONFLICT (user_id, event_key) DO NOTHING;
    GET DIAGNOSTICS v_ledger_rows = ROW_COUNT;
    IF v_ledger_rows = 0 THEN v_awarded := 0; END IF;

    IF v_awarded > 0 THEN
      PERFORM set_config('svj.trusted_server_write', 'on', true);
      UPDATE public.profiles
      SET total_xp = COALESCE(total_xp, 0) + v_awarded
      WHERE id = v_caller;
    END IF;
  END;

  -- ── Stat gains: conservative +1 per completion, immutable evidence keys ──
  v_stat_name := CASE v_assignment.category
    WHEN 'Physical' THEN 'fitness'
    WHEN 'Discipline' THEN 'discipline'
    WHEN 'Mental' THEN 'focus'
    WHEN 'Mindset' THEN 'confidence'
    WHEN 'Nutrition' THEN 'nutrition'
    ELSE NULL
  END;

  IF v_stat_name IS NOT NULL THEN
    INSERT INTO public.stat_events (user_id, stat_name, delta, source, source_id, event_key)
    VALUES (
      v_caller, v_stat_name, 1, 'svj_personalized', v_assignment.id::text,
      'personalized.stat:' || v_assignment.id::text || ':' || v_stat_name
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_ledger_rows = ROW_COUNT;

    IF v_ledger_rows > 0 THEN
    UPDATE public.user_stats
    SET fitness     = LEAST(100, fitness     + CASE WHEN v_stat_name = 'fitness'     THEN 1 ELSE 0 END),
        discipline  = LEAST(100, discipline  + CASE WHEN v_stat_name = 'discipline'  THEN 1 ELSE 0 END),
        focus       = LEAST(100, focus       + CASE WHEN v_stat_name = 'focus'       THEN 1 ELSE 0 END),
        confidence  = LEAST(100, confidence  + CASE WHEN v_stat_name = 'confidence'  THEN 1 ELSE 0 END),
        nutrition   = LEAST(100, nutrition   + CASE WHEN v_stat_name = 'nutrition'   THEN 1 ELSE 0 END),
        updated_at  = now()
    WHERE user_id = v_caller;

    v_stat_changes := jsonb_build_object(v_stat_name, 1);
    END IF;
  END IF;

  -- FIX: report the XP ACTUALLY granted (v_awarded), not the nominal reward.
  RETURN jsonb_build_object('ok', true, 'alreadyCompleted', false,
    'xpAwarded', v_awarded, 'statChanges', v_stat_changes);
END;
$$;
CREATE OR REPLACE FUNCTION public.svj_grant_my_completion_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  enrollment record;
  existing public.redeem_codes%ROWTYPE;
  v_code text;
  v_attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT * INTO existing FROM public.redeem_codes WHERE user_id = caller_id;
  IF FOUND THEN
    IF NOT existing.redeemed THEN
      UPDATE public.challenge_enrollments
         SET code_granted = true
       WHERE user_id = caller_id;
    END IF;
    RETURN existing.code;
  END IF;

  SELECT id INTO enrollment FROM public.challenge_enrollments WHERE user_id = caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No 60-Day enrollment found';
  END IF;

  FOR v_attempt IN 1..6 LOOP
    -- Hex bytes mapped into the unambiguous alphabet from the original
    -- generator (no 0/O/1/I/L), formatted SVJ-XXXX-XXXX.
    v_code := 'SVJ-'
      || translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4),
                   '0123456789abcdef', '23456789ABCDEFGH')
      || '-'
      || translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4),
                   '0123456789abcdef', '23456789ABCDEFGH');
    BEGIN
      INSERT INTO public.redeem_codes (code, user_id, redeemed)
      VALUES (v_code, caller_id, false);
      UPDATE public.challenge_enrollments
         SET code_granted = true
       WHERE id = enrollment.id;
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_code := NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not generate a unique redeem code. Please retry.';
END;
$$;
-- A typed local array replaces the per-call temporary relation. This also
-- makes the GPS function statically checkable and keeps concurrent calls independent.
CREATE OR REPLACE FUNCTION public.svj_save_gps_activity(
  p_client_session_id text,
  p_activity_type text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_points jsonb,
  p_step_count integer DEFAULT 0,
  p_moving_seconds integer DEFAULT NULL,
  p_polyline text DEFAULT NULL,
  p_bounds jsonb DEFAULT NULL,
  p_device_platform text DEFAULT NULL,
  p_gps_quality text DEFAULT NULL,
  p_auto_paused boolean DEFAULT false,
  p_split_unit text DEFAULT 'km',
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
  v_count integer;
  v_dist numeric := 0;
  v_gain numeric := NULL;
  v_loss numeric := NULL;
  v_moving integer := NULL;
  v_max_speed numeric := NULL;
  v_first_ms bigint;
  v_last_ms bigint;
  v_avg_hr integer;
  v_max_hr integer;
  v_avg_cad integer;
  v_splits jsonb := '[]'::jsonb;
  v_split_len numeric;
  v_pace integer;
  v_avg_speed numeric;
  v_duplicate boolean := false;
  v_seq_min integer;
  v_seq_max integer;
  v_track public.svj_gps_track_sample[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_client_session_id IS NULL
    OR char_length(btrim(p_client_session_id)) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'A valid session id is required';
  END IF;
  IF p_activity_type NOT IN ('walking', 'running', 'cycling', 'hiking', 'other') THEN
    RAISE EXCEPTION 'Unknown GPS activity type';
  END IF;
  IF p_started_at IS NULL OR p_ended_at IS NULL OR p_ended_at <= p_started_at THEN
    RAISE EXCEPTION 'Activity end must be after start';
  END IF;
  IF p_ended_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'Activity end time cannot be in the future';
  END IF;
  IF p_duration_seconds IS NULL OR p_duration_seconds < 1 OR p_duration_seconds > 86400
    OR p_duration_seconds > EXTRACT(EPOCH FROM (p_ended_at - p_started_at))::integer + 120 THEN
    RAISE EXCEPTION 'Invalid activity duration';
  END IF;
  IF jsonb_typeof(p_points) <> 'array' THEN
    RAISE EXCEPTION 'Track points are required';
  END IF;
  v_count := jsonb_array_length(p_points);
  IF v_count < 2 OR v_count > 200000 THEN
    RAISE EXCEPTION 'A recorded workout needs between 2 and 200000 track points';
  END IF;
  IF p_step_count IS NULL OR p_step_count < 0 OR p_step_count > 500000 THEN
    RAISE EXCEPTION 'Invalid step count';
  END IF;
  IF p_split_unit IS NOT NULL AND p_split_unit NOT IN ('km', 'mi') THEN
    RAISE EXCEPTION 'Unknown split unit';
  END IF;
  IF p_gps_quality IS NOT NULL
    AND p_gps_quality NOT IN ('searching', 'weak', 'good', 'excellent') THEN
    RAISE EXCEPTION 'Unknown GPS quality';
  END IF;
  IF p_polyline IS NOT NULL AND char_length(p_polyline) > 200000 THEN
    RAISE EXCEPTION 'Polyline too large';
  END IF;

  -- ── Idempotency: an exact retry returns the original activity ────────────
  SELECT * INTO v_existing FROM public.svj_activities
  WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'activity', to_jsonb(v_existing));
  END IF;

  -- ── Materialize + validate the survey, server-side ───────────────────────
  WITH raw AS (
    SELECT
      (ord - 1)::integer AS seq,
      (p ->> 'lat')::double precision AS lat,
      (p ->> 'lng')::double precision AS lng,
      NULLIF(p ->> 'ele', '')::numeric AS ele,
      COALESCE((p ->> 't')::bigint, 0) AS t_ms,
      COALESCE((p ->> 'moving')::boolean, true) AS moving,
      NULLIF(p ->> 'hr', '')::integer AS hr,
      NULLIF(p ->> 'cad', '')::integer AS cad,
      NULLIF(p ->> 'acc', '')::numeric AS acc
    FROM jsonb_array_elements(p_points) WITH ORDINALITY AS x(p, ord)
  ),
  lagged AS (
    SELECT raw.*,
      lag(lat) OVER w AS plat,
      lag(lng) OVER w AS plng,
      lag(ele) OVER w AS pele,
      lag(t_ms) OVER w AS pt_ms,
      lag(moving) OVER w AS pmoving
    FROM raw
    WINDOW w AS (ORDER BY seq)
  ),
  seg AS (
    SELECT lagged.*,
      CASE
        WHEN plat IS NULL OR NOT (moving AND pmoving) THEN 0::double precision
        ELSE (
          SELECT public.svj_haversine_m(plat, plng, lat, lng)
        )
      END AS d_raw
    FROM lagged
  )
  SELECT array_agg(ROW(
    seq, lat, lng, ele, t_ms, moving, hr, cad, acc,
    -- Impossible-jump filter: an interval implying > 25 m/s (90 km/h) on foot
    -- or > 45 m/s on a bike is noise, not movement. It is dropped from
    -- distance (and therefore from pace) rather than silently inflating it.
    CASE
      WHEN plat IS NULL OR NOT (moving AND pmoving) THEN 0::double precision
      WHEN t_ms <= pt_ms THEN 0::double precision
      WHEN d_raw / ((t_ms - pt_ms) / 1000.0) > (
        CASE WHEN p_activity_type = 'cycling' THEN 45 ELSE 25 END
      ) THEN 0::double precision
      ELSE d_raw
    END,
    pt_ms, pele, pmoving
  )::public.svj_gps_track_sample ORDER BY seq) INTO v_track
  FROM seg;

  IF EXISTS (SELECT 1 FROM unnest(v_track) WHERE lat IS NULL OR lng IS NULL) THEN
    RAISE EXCEPTION 'Track point coordinates are invalid';
  END IF;

  SELECT
    min(seq), max(seq), min(t_ms), max(t_ms)
  INTO v_seq_min, v_seq_max, v_first_ms, v_last_ms
  FROM unnest(v_track);
  IF v_seq_min <> 0 OR v_seq_max <> v_count - 1 THEN
    RAISE EXCEPTION 'Track point sequence is not contiguous';
  END IF;
  IF v_first_ms < 0 OR v_last_ms > p_duration_seconds * 1000 + 60000 THEN
    RAISE EXCEPTION 'Track point timestamps are out of range';
  END IF;

  SELECT
    COALESCE(sum(d_m), 0),
    sum(greatest(COALESCE(ele, 0) - COALESCE(pele, 0), 0))
      FILTER (WHERE ele IS NOT NULL AND pele IS NOT NULL),
    sum(greatest(COALESCE(pele, 0) - COALESCE(ele, 0), 0))
      FILTER (WHERE ele IS NOT NULL AND pele IS NOT NULL),
    (sum(t_ms - pt_ms) FILTER (WHERE moving AND pmoving AND t_ms > pt_ms) / 1000)::integer,
    max(CASE WHEN d_m > 0 AND t_ms > pt_ms
             THEN d_m / ((t_ms - pt_ms) / 1000.0) END),
    round(avg(hr))::integer,
    max(hr)::integer,
    round(avg(cad))::integer
  INTO v_dist, v_gain, v_loss, v_moving, v_max_speed, v_avg_hr, v_max_hr, v_avg_cad
  FROM unnest(v_track);

  -- Paused intervals never accumulate movement time; the server bounds it.
  v_moving := least(COALESCE(v_moving, 0), p_duration_seconds);
  IF v_moving = 0 AND p_duration_seconds > 0 THEN
    v_moving := NULL; -- not genuinely measured
  END IF;
  v_dist := round(v_dist, 2);
  v_max_speed := CASE WHEN v_max_speed IS NULL OR v_max_speed > 100 THEN NULL
                      ELSE round(v_max_speed, 3) END;
  v_avg_speed := CASE
    WHEN v_moving IS NOT NULL AND v_moving > 0 AND v_dist > 0
    THEN round((v_dist / v_moving)::numeric, 3) ELSE NULL END;
  v_pace := CASE
    WHEN v_moving IS NOT NULL AND v_moving > 0 AND v_dist >= 100
    THEN round(v_moving / (v_dist / 1000.0))::integer ELSE NULL END;

  -- ── Splits, computed from the same authoritative points ─────────────────
  v_split_len := CASE WHEN COALESCE(p_split_unit, 'km') = 'mi' THEN 1609.344 ELSE 1000 END;
  WITH cum AS (
    SELECT seq, t_ms,
      sum(d_m) OVER (ORDER BY seq) AS cum_m
    FROM unnest(v_track)
  ),
  bucketed AS (
    SELECT
      floor(cum_m / v_split_len)::integer AS bucket,
      t_ms,
      cum_m
    FROM cum
    WHERE cum_m > 0
  ),
  per_bucket AS (
    SELECT
      bucket,
      min(t_ms) AS start_ms,
      max(t_ms) AS end_ms,
      min(cum_m) AS cum_start
    FROM bucketed
    GROUP BY bucket
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'index', bucket + 1,
      'distanceMeters', v_split_len,
      'durationSeconds', greatest(1, ((end_ms - start_ms) / 1000.0))::integer,
      'partial', (cum_start + v_split_len) > v_dist
    ) ORDER BY bucket), '[]'::jsonb)
  INTO v_splits
  FROM per_bucket
  -- Only fully completed splits become splits; the trailing partial distance
  -- stays in the activity summary instead of faking a faster final split.
  WHERE (cum_start + v_split_len) <= v_dist;

  -- ── Insert the canonical activity row ───────────────────────────────────
  INSERT INTO public.svj_activities (
    user_id, client_session_id, activity_type, source,
    started_at, ended_at, duration_seconds,
    step_count, distance_meters,
    moving_seconds, elevation_gain_meters, elevation_loss_meters,
    avg_speed_mps, max_speed_mps, avg_pace_seconds_per_km,
    avg_heart_rate, max_heart_rate, avg_cadence,
    track_polyline, track_point_count, track_bounds, splits, split_unit,
    auto_paused, device_platform, gps_quality, notes
  ) VALUES (
    v_user_id, btrim(p_client_session_id), p_activity_type, 'svj_native',
    p_started_at, p_ended_at, p_duration_seconds,
    p_step_count, v_dist,
    v_moving, v_gain, v_loss,
    v_avg_speed, v_max_speed, v_pace,
    v_avg_hr, v_max_hr, v_avg_cad,
    p_polyline, v_count, p_bounds, v_splits,
    COALESCE(p_split_unit, 'km')::text,
    COALESCE(p_auto_paused, false), p_device_platform, p_gps_quality,
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_activity_id;

  -- ── Persist the indexed track ───────────────────────────────────────────
  INSERT INTO public.svj_activity_track_points (
    activity_id, user_id, seq, lat, lng, elevation_m, t_offset_ms,
    moving, heart_rate, cadence, accuracy_m
  )
  SELECT v_activity_id, v_user_id, seq, lat, lng, ele, t_ms,
         moving, hr, cad, acc
  FROM unnest(v_track);

  -- ── Exactly one durable completion event (existing ledger + XP pipeline) ─
  INSERT INTO public.activity_events (
    user_id, event_key, event_type, source_class, source_id, occurred_at, metadata
  ) VALUES (
    v_user_id,
    'activity.completed:' || v_activity_id::text,
    'workout', 'workout', v_activity_id::text, p_ended_at,
    jsonb_build_object(
      'activity_id', v_activity_id,
      'client_session_id', btrim(p_client_session_id),
      'activity_type', p_activity_type,
      'source', 'svj_native',
      'step_count', p_step_count,
      'duration_seconds', p_duration_seconds,
      'distance_meters', v_dist
    )
  )
  ON CONFLICT (user_id, event_key) DO NOTHING;

  -- Segment attempts are derived from the points we just stored.
  PERFORM public.svj_match_segments_for_activity(v_activity_id);

  SELECT * INTO v_existing FROM public.svj_activities WHERE id = v_activity_id;
  RETURN jsonb_build_object(
    'ok', true, 'duplicate', false, 'activity', to_jsonb(v_existing)
  );
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
