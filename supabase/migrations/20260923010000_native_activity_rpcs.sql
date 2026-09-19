-- ============================================================================
-- SVJ NATIVE ACTIVITY PLATFORM — server logic (part 2 of 2).
--
-- Every derived number (distance, moving time, elevation gain, splits, record
-- eligibility, segment attempts, heatmap cells) is computed HERE from the
-- SVJ-owned track points. The client sends raw samples and display hints; it
-- never sends XP, never sends a user id, and never sends a finished record.
--
-- Reward XP is NOT reimplemented: a saved GPS workout emits the same
-- `activity.completed` ledger event as every other activity, so the existing
-- server-authoritative pipeline (svj_process_activity_rewards) is the single
-- source of XP and stat gains.
-- ============================================================================

BEGIN;

-- ── 0) Distance helper (metres, great-circle) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_haversine_m(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )));
$$;

REVOKE ALL ON FUNCTION public.svj_haversine_m(double precision, double precision, double precision, double precision) FROM PUBLIC, anon, authenticated;

-- ── 1) Save a complete SVJ-native GPS workout ──────────────────────────────
-- One call = one activity + one point track + one completion event. Retrying
-- the same (user, client_session_id) returns the original row untouched, so a
-- dead transport or an offline replay can never duplicate a workout.
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
  DROP TABLE IF EXISTS svj_tmp_track;
  CREATE TEMP TABLE svj_tmp_track ON COMMIT DROP AS
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
  SELECT
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
    END AS d_m,
    pt_ms, pele, pmoving
  FROM seg;

  IF EXISTS (SELECT 1 FROM svj_tmp_track WHERE lat IS NULL OR lng IS NULL) THEN
    RAISE EXCEPTION 'Track point coordinates are invalid';
  END IF;

  SELECT
    min(seq), max(seq), min(t_ms), max(t_ms)
  INTO v_seq_min, v_seq_max, v_first_ms, v_last_ms
  FROM svj_tmp_track;
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
    sum(t_ms - pt_ms) FILTER (WHERE moving AND pmoving AND t_ms > pt_ms),
    max(CASE WHEN d_m > 0 AND t_ms > pt_ms
             THEN d_m / ((t_ms - pt_ms) / 1000.0) END),
    round(avg(hr))::integer,
    max(hr)::integer,
    round(avg(cad))::integer
  INTO v_dist, v_gain, v_loss, v_moving, v_max_speed, v_avg_hr, v_max_hr, v_avg_cad
  FROM svj_tmp_track;

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
    FROM svj_tmp_track
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
  FROM svj_tmp_track;

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

REVOKE ALL ON FUNCTION public.svj_save_gps_activity(text, text, timestamptz, timestamptz, integer, jsonb, integer, integer, text, jsonb, text, text, boolean, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_save_gps_activity(text, text, timestamptz, timestamptz, integer, jsonb, integer, integer, text, jsonb, text, text, boolean, text, text)
  TO authenticated;

-- ── 2) Read one activity's track (owner only) ──────────────────────────────
-- Returns a bounded, downsampled series so a 3-hour ride cannot blow up the
-- webview. `p_max_points` caps the payload; stride sampling keeps shape.
CREATE OR REPLACE FUNCTION public.svj_get_activity_track(
  p_activity_id uuid,
  p_max_points integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_total integer;
  v_stride integer;
  v_activity public.svj_activities;
  v_points jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_activity FROM public.svj_activities
  WHERE id = p_activity_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  SELECT count(*) INTO v_total FROM public.svj_activity_track_points
  WHERE activity_id = p_activity_id AND user_id = v_user_id;
  v_stride := greatest(1, ceil(v_total::numeric / greatest(50, least(COALESCE(p_max_points, 600), 2000)))::integer);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'seq', seq, 'lat', lat, 'lng', lng, 't', t_offset_ms,
      'ele', elevation_m, 'hr', heart_rate, 'moving', moving
    ) ORDER BY seq), '[]'::jsonb)
  INTO v_points
  FROM (
    SELECT * FROM public.svj_activity_track_points
    WHERE activity_id = p_activity_id AND user_id = v_user_id
      AND (seq % v_stride = 0 OR seq = 0 OR seq = v_total - 1)
    ORDER BY seq
  ) s;

  RETURN jsonb_build_object(
    'activityId', v_activity.id,
    'activityType', v_activity.activity_type,
    'polyline', v_activity.track_polyline,
    'bounds', v_activity.track_bounds,
    'pointCount', v_total,
    'sampledPointCount', jsonb_array_length(v_points),
    'points', v_points
  );
END;
$$;

REVOKE ALL ON FUNCTION public.svj_get_activity_track(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_activity_track(uuid, integer) TO authenticated;

-- ── 3) GPS-aware personal bests (additive sibling of svj_list_records) ─────
-- Reads the same canonical activities; adds the distance-split records that
-- the step-based engine could not express. Eligibility is server-derived:
-- metrics come from server-computed splits and server-computed distance.
CREATE OR REPLACE FUNCTION public.svj_list_gps_records()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  WITH splits AS (
    SELECT
      a.id, a.activity_type, a.ended_at, a.distance_meters, a.moving_seconds,
      a.avg_pace_seconds_per_km, a.avg_speed_mps,
      COALESCE((s ->> 'durationSeconds')::numeric, NULL) AS split_seconds,
      COALESCE((s ->> 'index')::integer, 0) AS split_index
    FROM public.svj_activities a
    LEFT JOIN LATERAL jsonb_array_elements(COALESCE(a.splits, '[]'::jsonb)) s ON true
    WHERE a.user_id = v_user_id
      AND a.source IN ('svj_native', 'health_connect')
  ),
  sum5 AS (
    SELECT id, activity_type, ended_at,
      sum(split_seconds) AS seconds_5k
    FROM splits WHERE split_index <= 5 GROUP BY id, activity_type, ended_at
    HAVING count(*) = 5
  ),
  sum1 AS (
    SELECT id, activity_type, ended_at, sum(split_seconds) AS seconds_1k
    FROM splits WHERE split_index <= 1 GROUP BY id, activity_type, ended_at
    HAVING count(*) = 1
  ),
  candidates AS (
    SELECT 'fastest_1km'::text AS record_type, s.activity_type, s.seconds_1k AS value,
           s.id AS activity_id, s.ended_at
    FROM sum1 s WHERE s.activity_type IN ('running', 'walking')
    UNION ALL
    SELECT 'fastest_5km', s.activity_type, s.seconds_5k, s.id, s.ended_at
    FROM sum5 s WHERE s.activity_type = 'running'
    UNION ALL
    SELECT 'fastest_5km_cycle', 'cycling', s.seconds_5k, s.id, s.ended_at
    FROM sum5 s WHERE s.activity_type = 'cycling'
    UNION ALL
    SELECT 'longest_run', a.activity_type, a.distance_meters, a.id, a.ended_at
    FROM public.svj_activities a
    WHERE a.user_id = v_user_id AND a.activity_type = 'running'
      AND a.distance_meters IS NOT NULL
    UNION ALL
    SELECT 'longest_walk', a.activity_type, a.distance_meters, a.id, a.ended_at
    FROM public.svj_activities a
    WHERE a.user_id = v_user_id AND a.activity_type = 'walking'
      AND a.distance_meters IS NOT NULL
    UNION ALL
    SELECT 'longest_ride', a.activity_type, a.distance_meters, a.id, a.ended_at
    FROM public.svj_activities a
    WHERE a.user_id = v_user_id AND a.activity_type = 'cycling'
      AND a.distance_meters IS NOT NULL
    UNION ALL
    SELECT 'best_avg_pace', a.activity_type, a.avg_pace_seconds_per_km, a.id, a.ended_at
    FROM public.svj_activities a
    WHERE a.user_id = v_user_id AND a.activity_type IN ('running', 'walking')
      AND a.distance_meters >= 1000 AND a.avg_pace_seconds_per_km IS NOT NULL
    UNION ALL
    SELECT 'best_avg_speed', a.activity_type, a.avg_speed_mps, a.id, a.ended_at
    FROM public.svj_activities a
    WHERE a.user_id = v_user_id AND a.activity_type = 'cycling'
      AND a.distance_meters >= 5000 AND a.avg_speed_mps IS NOT NULL
    UNION ALL
    SELECT 'longest_duration', a.activity_type, a.moving_seconds::numeric, a.id, a.ended_at
    FROM public.svj_activities a
    WHERE a.user_id = v_user_id AND a.moving_seconds IS NOT NULL
  ),
  ranked AS (
    SELECT c.*,
      row_number() OVER (
        PARTITION BY c.record_type
        ORDER BY
          CASE WHEN c.record_type IN ('best_avg_pace') THEN c.value END ASC NULLS LAST,
          CASE WHEN c.record_type NOT IN ('best_avg_pace') THEN c.value END DESC NULLS LAST,
          c.ended_at ASC
      ) AS rn
    FROM candidates c
    WHERE c.value IS NOT NULL AND c.value > 0
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'recordType', record_type,
      'activityType', activity_type,
      'value', value,
      'activityId', activity_id,
      'achievedAt', ended_at
    ) ORDER BY record_type), '[]'::jsonb)
  INTO v_result
  FROM ranked WHERE rn = 1;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_list_gps_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_gps_records() TO authenticated;

-- ── 4) Personal heatmap (private, SVJ-native GPS only) ────────────────────
CREATE OR REPLACE FUNCTION public.svj_get_activity_heatmap(
  p_since timestamptz DEFAULT NULL,
  p_activity_type text DEFAULT NULL,
  p_max_cells integer DEFAULT 4000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cells jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_activity_type IS NOT NULL
    AND p_activity_type NOT IN ('walking', 'running', 'cycling', 'hiking', 'other') THEN
    RAISE EXCEPTION 'Unknown activity type';
  END IF;

  -- ~11 m grid. Only the owner's own points, only GPS-recorded activities.
  WITH gridded AS (
    SELECT
      round(tp.lat * 10000) / 10000 AS cell_lat,
      round(tp.lng * 10000) / 10000 AS cell_lng,
      count(*) AS weight
    FROM public.svj_activity_track_points tp
    JOIN public.svj_activities a ON a.id = tp.activity_id
    WHERE tp.user_id = v_user_id
      AND a.user_id = v_user_id
      AND a.source = 'svj_native'
      AND (p_since IS NULL OR a.started_at >= p_since)
      AND (p_activity_type IS NULL OR a.activity_type = p_activity_type)
    GROUP BY 1, 2
    ORDER BY weight DESC
    LIMIT greatest(1, least(COALESCE(p_max_cells, 4000), 20000))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'lat', cell_lat, 'lng', cell_lng, 'weight', weight
  )), '[]'::jsonb)
  INTO v_cells
  FROM gridded;

  RETURN COALESCE(v_cells, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_get_activity_heatmap(timestamptz, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_activity_heatmap(timestamptz, text, integer) TO authenticated;

-- ── 5) Route library ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_save_route_from_activity(
  p_activity_id uuid,
  p_name text,
  p_favorite boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity public.svj_activities;
  v_route public.svj_routes;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'A route name between 1 and 80 characters is required';
  END IF;
  SELECT * INTO v_activity FROM public.svj_activities
  WHERE id = p_activity_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;
  IF v_activity.track_polyline IS NULL
    OR char_length(v_activity.track_polyline) < 2 THEN
    RAISE EXCEPTION 'This activity has no recorded route';
  END IF;

  INSERT INTO public.svj_routes (
    user_id, name, activity_type, polyline, bounds,
    distance_meters, elevation_gain_meters, source_activity_id, favorite
  ) VALUES (
    v_user_id, btrim(p_name),
    CASE WHEN v_activity.activity_type = 'hiking' THEN 'hiking'
         WHEN v_activity.activity_type IN ('running', 'walking', 'cycling')
           THEN v_activity.activity_type
         ELSE 'other' END,
    v_activity.track_polyline, v_activity.track_bounds,
    v_activity.distance_meters, v_activity.elevation_gain_meters,
    v_activity.id, COALESCE(p_favorite, false)
  )
  ON CONFLICT (user_id, name) DO UPDATE
    SET polyline = EXCLUDED.polyline,
        bounds = EXCLUDED.bounds,
        activity_type = EXCLUDED.activity_type,
        distance_meters = EXCLUDED.distance_meters,
        elevation_gain_meters = EXCLUDED.elevation_gain_meters,
        source_activity_id = EXCLUDED.source_activity_id,
        favorite = public.svj_routes.favorite OR EXCLUDED.favorite,
        updated_at = now()
  RETURNING * INTO v_route;

  RETURN jsonb_build_object('ok', true, 'route', to_jsonb(v_route));
END;
$$;

REVOKE ALL ON FUNCTION public.svj_save_route_from_activity(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_save_route_from_activity(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.svj_update_route(
  p_route_id uuid,
  p_name text DEFAULT NULL,
  p_favorite boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_route public.svj_routes;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_name IS NOT NULL AND char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'A route name between 1 and 80 characters is required';
  END IF;

  UPDATE public.svj_routes
  SET name = COALESCE(NULLIF(btrim(COALESCE(p_name, '')), ''), name),
      favorite = COALESCE(p_favorite, favorite),
      updated_at = now()
  WHERE id = p_route_id AND user_id = v_user_id
  RETURNING * INTO v_route;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Route not found';
  END IF;
  RETURN jsonb_build_object('ok', true, 'route', to_jsonb(v_route));
END;
$$;

REVOKE ALL ON FUNCTION public.svj_update_route(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_update_route(uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.svj_delete_route(p_route_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  DELETE FROM public.svj_routes
  WHERE id = p_route_id AND user_id = v_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_delete_route(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_delete_route(uuid) TO authenticated;

-- Route list with previous attempts, so a saved route shows how it has been
-- run before. Owner-scoped by auth.uid(): there is no parameter to widen it.
CREATE OR REPLACE FUNCTION public.svj_list_routes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(jsonb_agg(entry ORDER BY (entry ->> 'favorite') DESC, (entry ->> 'name')), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'activity_type', r.activity_type,
      'polyline', r.polyline,
      'bounds', r.bounds,
      'distance_meters', r.distance_meters,
      'elevation_gain_meters', r.elevation_gain_meters,
      'source_activity_id', r.source_activity_id,
      'favorite', r.favorite,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'attempt_count', COALESCE(att.attempt_count, 0),
      'best_duration_seconds', att.best_seconds,
      'last_attempt_at', att.last_attempt_at
    ) AS entry
    FROM public.svj_routes r
    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS attempt_count,
        min(a.moving_seconds) AS best_seconds,
        max(a.started_at) AS last_attempt_at
      FROM public.svj_activities a
      WHERE a.user_id = v_user_id
        AND a.route_id = r.id
        AND a.moving_seconds IS NOT NULL
    ) att ON true
    WHERE r.user_id = v_user_id
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_list_routes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_routes() TO authenticated;

-- ── 6) Personal segments ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_create_segment(
  p_name text,
  p_activity_id uuid,
  p_start_lat double precision,
  p_start_lng double precision,
  p_end_lat double precision,
  p_end_lng double precision,
  p_activity_type text DEFAULT NULL,
  p_tolerance_meters integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity public.svj_activities;
  v_seg public.svj_segments;
  v_near_start integer;
  v_near_end integer;
  v_type text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'A segment name between 1 and 80 characters is required';
  END IF;
  IF p_start_lat IS NULL OR p_start_lng IS NULL OR p_end_lat IS NULL OR p_end_lng IS NULL THEN
    RAISE EXCEPTION 'Segment start and end are required';
  END IF;
  SELECT * INTO v_activity FROM public.svj_activities
  WHERE id = p_activity_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- The anchors must genuinely exist on the owner's own track, so a segment
  -- can never be fabricated off-route.
  SELECT count(*) INTO v_near_start
  FROM public.svj_activity_track_points
  WHERE activity_id = p_activity_id AND user_id = v_user_id
    AND public.svj_haversine_m(lat, lng, p_start_lat, p_start_lng)
        <= greatest(10, least(COALESCE(p_tolerance_meters, 30), 200));
  SELECT count(*) INTO v_near_end
  FROM public.svj_activity_track_points
  WHERE activity_id = p_activity_id AND user_id = v_user_id
    AND public.svj_haversine_m(lat, lng, p_end_lat, p_end_lng)
        <= greatest(10, least(COALESCE(p_tolerance_meters, 30), 200));
  IF v_near_start = 0 OR v_near_end = 0 THEN
    RAISE EXCEPTION 'Segment anchors must lie on the recorded route';
  END IF;

  v_type := CASE
    WHEN p_activity_type IN ('walking', 'running', 'cycling', 'hiking', 'other')
      THEN p_activity_type
    WHEN v_activity.activity_type IN ('walking', 'running', 'cycling', 'hiking')
      THEN v_activity.activity_type
    ELSE 'other' END;

  INSERT INTO public.svj_segments (
    user_id, name, activity_type,
    start_lat, start_lng, end_lat, end_lng,
    tolerance_meters, source_activity_id
  ) VALUES (
    v_user_id, btrim(p_name), v_type,
    p_start_lat, p_start_lng, p_end_lat, p_end_lng,
    greatest(10, least(COALESCE(p_tolerance_meters, 30), 200)), p_activity_id
  )
  ON CONFLICT (user_id, name) DO UPDATE
    SET start_lat = EXCLUDED.start_lat,
        start_lng = EXCLUDED.start_lng,
        end_lat = EXCLUDED.end_lat,
        end_lng = EXCLUDED.end_lng,
        activity_type = EXCLUDED.activity_type,
        source_activity_id = EXCLUDED.source_activity_id,
        tolerance_meters = EXCLUDED.tolerance_meters
  RETURNING * INTO v_seg;

  PERFORM public.svj_match_segments_for_activity(p_activity_id);
  RETURN jsonb_build_object('ok', true, 'segment', to_jsonb(v_seg));
END;
$$;

REVOKE ALL ON FUNCTION public.svj_create_segment(text, uuid, double precision, double precision, double precision, double precision, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_create_segment(text, uuid, double precision, double precision, double precision, double precision, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.svj_delete_segment(p_segment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  DELETE FROM public.svj_segments WHERE id = p_segment_id AND user_id = v_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_delete_segment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_delete_segment(uuid) TO authenticated;

-- Server-side segment matching. Idempotent by (segment_id, activity_id).
CREATE OR REPLACE FUNCTION public.svj_match_segments_for_activity(p_activity_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity public.svj_activities;
  v_inserted integer := 0;
  v_seg record;
  v_start record;
  v_end record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_activity FROM public.svj_activities
  WHERE id = p_activity_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_seg IN
    SELECT * FROM public.svj_segments WHERE user_id = v_user_id
  LOOP
    SELECT tp.seq, tp.t_offset_ms
      INTO v_start
    FROM public.svj_activity_track_points tp
    WHERE tp.activity_id = p_activity_id AND tp.user_id = v_user_id
      AND public.svj_haversine_m(tp.lat, tp.lng, v_seg.start_lat, v_seg.start_lng)
          <= v_seg.tolerance_meters
    ORDER BY tp.seq LIMIT 1;

    IF v_start.seq IS NULL THEN CONTINUE; END IF;

    SELECT tp.seq, tp.t_offset_ms
      INTO v_end
    FROM public.svj_activity_track_points tp
    WHERE tp.activity_id = p_activity_id AND tp.user_id = v_user_id
      AND tp.seq > v_start.seq
      AND public.svj_haversine_m(tp.lat, tp.lng, v_seg.end_lat, v_seg.end_lng)
          <= v_seg.tolerance_meters
    ORDER BY tp.seq LIMIT 1;

    IF v_end.seq IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.svj_segment_attempts (
      segment_id, user_id, activity_id, duration_seconds, started_at
    ) VALUES (
      v_seg.id, v_user_id, p_activity_id,
      greatest(1, ((v_end.t_offset_ms - v_start.t_offset_ms) / 1000.0))::integer,
      v_activity.started_at + (v_start.t_offset_ms || ' milliseconds')::interval
    )
    ON CONFLICT (segment_id, activity_id) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_match_segments_for_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_match_segments_for_activity(uuid) TO authenticated;

-- Segment list with best time, attempt count and recent attempts.
CREATE OR REPLACE FUNCTION public.svj_list_segments()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(jsonb_agg(entry ORDER BY entry ->> 'name'), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'activityType', s.activity_type,
      'startLat', s.start_lat,
      'startLng', s.start_lng,
      'endLat', s.end_lat,
      'endLng', s.end_lng,
      'toleranceMeters', s.tolerance_meters,
      'attemptCount', COALESCE(agg.attempt_count, 0),
      'bestDurationSeconds', agg.best_seconds,
      'lastDurationSeconds', agg.last_seconds,
      'improvementSeconds', CASE
        WHEN agg.best_seconds IS NULL OR agg.last_seconds IS NULL THEN NULL
        ELSE agg.last_seconds - agg.best_seconds END,
      'lastAttemptAt', agg.last_attempt_at,
      'recentAttempts', COALESCE(agg.recent, '[]'::jsonb)
    ) AS entry
    FROM public.svj_segments s
    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS attempt_count,
        min(t.duration_seconds) AS best_seconds,
        (array_agg(t.duration_seconds ORDER BY t.started_at DESC))[1] AS last_seconds,
        max(t.started_at) AS last_attempt_at,
        (SELECT jsonb_agg(jsonb_build_object(
            'activityId', x.activity_id,
            'durationSeconds', x.duration_seconds,
            'startedAt', x.started_at
          ) ORDER BY x.started_at DESC)
         FROM (
           SELECT activity_id, duration_seconds, started_at
           FROM public.svj_segment_attempts
           WHERE segment_id = s.id AND user_id = v_user_id
           ORDER BY started_at DESC LIMIT 10
         ) x) AS recent
      FROM public.svj_segment_attempts t
      WHERE t.segment_id = s.id AND t.user_id = v_user_id
    ) agg ON true
    WHERE s.user_id = v_user_id
  ) q;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_list_segments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_segments() TO authenticated;

COMMIT;
