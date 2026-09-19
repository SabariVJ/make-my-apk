-- ============================================================================
-- SVJ NATIVE ACTIVITY PLATFORM — SVJ Live Share + Health Connect (part 3).
--
-- SVJ Live Share lets a user share a live position for ONE active workout.
-- The token is 256 bits of CSPRNG entropy (two UUIDv4 values, which the
-- database generates from a cryptographic source), expires automatically, and
-- is instantly revocable. The public reader returns a sanitized payload only:
-- no account id, no e-mail, no token echo, no auth material. Nothing about
-- authentication is ever reachable from a share link.
--
-- Health Connect is a DEVICE platform on Android, not a third-party fitness
-- app: SVJ reads the user's own local health records after an explicit
-- permission grant. Imports are deduplicated server-side and can never
-- double-award XP.
-- ============================================================================

BEGIN;

-- ── 1) SVJ Live Share ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_start_live_share(
  p_activity_id uuid,
  p_ttl_minutes integer DEFAULT 180,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity public.svj_activities;
  v_share public.svj_live_share_sessions;
  v_ttl integer := greatest(5, least(COALESCE(p_ttl_minutes, 180), 720));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_activity FROM public.svj_activities
  WHERE id = p_activity_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- One active share per activity: restarting replaces the previous token and
  -- revokes it, so a leaked old link stops working immediately.
  UPDATE public.svj_live_share_sessions
  SET revoked_at = now()
  WHERE activity_id = p_activity_id AND user_id = v_user_id
    AND revoked_at IS NULL AND expires_at > now();

  INSERT INTO public.svj_live_share_sessions (
    user_id, activity_id, token, display_name, activity_type,
    started_at, expires_at
  ) VALUES (
    v_user_id, p_activity_id,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    NULLIF(btrim(COALESCE(p_display_name, '')), ''),
    v_activity.activity_type,
    now(), now() + (v_ttl || ' minutes')::interval
  )
  RETURNING * INTO v_share;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_share.token,
    'activityId', v_share.activity_id,
    'activityType', v_share.activity_type,
    'displayName', v_share.display_name,
    'startedAt', v_share.started_at,
    'expiresAt', v_share.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.svj_start_live_share(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_start_live_share(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.svj_update_live_share(
  p_token text,
  p_lat double precision,
  p_lng double precision,
  p_elapsed_seconds integer DEFAULT NULL,
  p_distance_meters numeric DEFAULT NULL,
  p_accuracy_m numeric DEFAULT NULL,
  p_battery_percent integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_share public.svj_live_share_sessions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_token IS NULL OR char_length(p_token) < 32 THEN
    RAISE EXCEPTION 'A valid share token is required';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL
    OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid coordinates';
  END IF;

  UPDATE public.svj_live_share_sessions
  SET last_lat = p_lat,
      last_lng = p_lng,
      last_accuracy_m = CASE WHEN p_accuracy_m BETWEEN 0 AND 10000 THEN p_accuracy_m END,
      last_elapsed_seconds = CASE WHEN p_elapsed_seconds BETWEEN 0 AND 172800 THEN p_elapsed_seconds END,
      last_distance_meters = CASE WHEN p_distance_meters BETWEEN 0 AND 1000000 THEN p_distance_meters END,
      battery_percent = CASE WHEN p_battery_percent BETWEEN 0 AND 100 THEN p_battery_percent END,
      last_update_at = now()
  WHERE token = p_token
    AND user_id = v_user_id
    AND revoked_at IS NULL
    AND expires_at > now()
  RETURNING * INTO v_share;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'share_inactive');
  END IF;
  RETURN jsonb_build_object('ok', true, 'updatedAt', v_share.last_update_at);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_update_live_share(text, double precision, double precision, integer, numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_update_live_share(text, double precision, double precision, integer, numeric, numeric, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.svj_stop_live_share(p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stopped integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  -- Without a token, every active share owned by the caller stops at once.
  UPDATE public.svj_live_share_sessions
  SET revoked_at = now()
  WHERE user_id = v_user_id AND revoked_at IS NULL
    AND (p_token IS NULL OR token = p_token);
  GET DIAGNOSTICS v_stopped = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'stopped', v_stopped);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_stop_live_share(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_stop_live_share(text) TO authenticated;

-- Owner view of the current share (the only place a token is returned to the
-- client, and only to its owner).
CREATE OR REPLACE FUNCTION public.svj_get_my_live_share()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_share public.svj_live_share_sessions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_share FROM public.svj_live_share_sessions
  WHERE user_id = v_user_id AND revoked_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', false);
  END IF;
  RETURN jsonb_build_object(
    'active', true,
    'token', v_share.token,
    'activityId', v_share.activity_id,
    'activityType', v_share.activity_type,
    'displayName', v_share.display_name,
    'startedAt', v_share.started_at,
    'expiresAt', v_share.expires_at,
    'lastLat', v_share.last_lat,
    'lastLng', v_share.last_lng,
    'lastUpdateAt', v_share.last_update_at,
    'lastElapsedSeconds', v_share.last_elapsed_seconds,
    'lastDistanceMeters', v_share.last_distance_meters,
    'batteryPercent', v_share.battery_percent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.svj_get_my_live_share() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_my_live_share() TO authenticated;

-- Public reader. Requires NO authentication and exposes NO identity: only a
-- coarse live position for an activity that is still active and unexpired.
-- Malformed, expired and revoked tokens all return the same neutral payload,
-- so the endpoint cannot be used to probe for valid tokens.
CREATE OR REPLACE FUNCTION public.svj_get_public_live_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.svj_live_share_sessions;
BEGIN
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 32 AND 128 THEN
    RETURN jsonb_build_object('ok', false, 'active', false);
  END IF;

  SELECT * INTO v_share FROM public.svj_live_share_sessions
  WHERE token = p_token AND revoked_at IS NULL AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'active', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'active', true,
    'displayName', v_share.display_name,
    'activityType', v_share.activity_type,
    'startedAt', v_share.started_at,
    'expiresAt', v_share.expires_at,
    'lastLat', v_share.last_lat,
    'lastLng', v_share.last_lng,
    'lastAccuracyMeters', v_share.last_accuracy_m,
    'lastUpdateAt', v_share.last_update_at,
    'elapsedSeconds', v_share.last_elapsed_seconds,
    'distanceMeters', v_share.last_distance_meters,
    'batteryPercent', v_share.battery_percent
  );
END;
$$;

-- Public by design: this is the share link.
REVOKE ALL ON FUNCTION public.svj_get_public_live_share(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.svj_get_public_live_share(text) TO anon, authenticated;

-- ── 2) Health Connect import (device-sourced, deduplicated) ────────────────
-- Android Health Connect is a local platform store, not an external service.
-- The Android bridge reads only the record types the user explicitly granted
-- and passes them here, where the server decides whether the workout is new.
CREATE OR REPLACE FUNCTION public.svj_import_platform_activity(
  p_client_session_id text,
  p_external_id text,
  p_activity_type text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_step_count integer DEFAULT 0,
  p_distance_meters numeric DEFAULT NULL,
  p_calories_estimate numeric DEFAULT NULL,
  p_avg_heart_rate integer DEFAULT NULL,
  p_device_platform text DEFAULT 'health_connect'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity public.svj_activities;
  v_match public.svj_activities;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_client_session_id IS NULL
    OR char_length(btrim(p_client_session_id)) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'A valid session id is required';
  END IF;
  IF p_external_id IS NULL OR char_length(btrim(p_external_id)) NOT BETWEEN 4 AND 200 THEN
    RAISE EXCEPTION 'A platform record id is required';
  END IF;
  IF p_activity_type NOT IN (
    'walking', 'running', 'strength', 'cycling', 'football',
    'calisthenics', 'hiit', 'yoga', 'other'
  ) THEN
    RAISE EXCEPTION 'Unknown activity type';
  END IF;
  IF p_started_at IS NULL OR p_ended_at IS NULL OR p_ended_at <= p_started_at THEN
    RAISE EXCEPTION 'Activity end must be after start';
  END IF;
  IF p_duration_seconds IS NULL OR p_duration_seconds < 1 OR p_duration_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid activity duration';
  END IF;

  -- Same platform record imported twice → original row, no second activity.
  SELECT * INTO v_activity FROM public.svj_activities
  WHERE user_id = v_user_id AND source = 'health_connect'
    AND external_id = btrim(p_external_id);
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'matched', 'external_id',
                              'activity', to_jsonb(v_activity));
  END IF;

  SELECT * INTO v_activity FROM public.svj_activities
  WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'matched', 'client_session_id',
                              'activity', to_jsonb(v_activity));
  END IF;

  -- The same real-world workout already recorded by SVJ natively: never create
  -- a permanent second copy, and never a second XP grant.
  SELECT * INTO v_match FROM public.svj_activities
  WHERE user_id = v_user_id
    AND activity_type = p_activity_type
    AND abs(EXTRACT(EPOCH FROM (started_at - p_started_at))) <= 120
    AND abs(duration_seconds - p_duration_seconds) <= 180
    AND (
      distance_meters IS NULL OR p_distance_meters IS NULL
      OR abs(distance_meters - p_distance_meters) <= greatest(50, distance_meters * 0.1)
    )
  ORDER BY started_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'matched', 'overlap',
                              'activity', to_jsonb(v_match));
  END IF;

  INSERT INTO public.svj_activities (
    user_id, client_session_id, activity_type, source,
    started_at, ended_at, duration_seconds,
    step_count, distance_meters, calories_estimate,
    avg_heart_rate, external_id, device_platform
  ) VALUES (
    v_user_id, btrim(p_client_session_id), p_activity_type, 'health_connect',
    p_started_at, p_ended_at, p_duration_seconds,
    COALESCE(p_step_count, 0), p_distance_meters, p_calories_estimate,
    CASE WHEN p_avg_heart_rate BETWEEN 20 AND 260 THEN p_avg_heart_rate END,
    btrim(p_external_id), COALESCE(p_device_platform, 'health_connect')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.activity_events (
    user_id, event_key, event_type, source_class, source_id, occurred_at, metadata
  ) VALUES (
    v_user_id,
    'activity.completed:' || v_id::text,
    'workout', 'workout', v_id::text, p_ended_at,
    jsonb_build_object(
      'activity_id', v_id,
      'client_session_id', btrim(p_client_session_id),
      'activity_type', p_activity_type,
      'source', 'health_connect',
      'step_count', COALESCE(p_step_count, 0),
      'duration_seconds', p_duration_seconds,
      'distance_meters', p_distance_meters
    )
  )
  ON CONFLICT (user_id, event_key) DO NOTHING;

  SELECT * INTO v_activity FROM public.svj_activities WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'activity', to_jsonb(v_activity));
END;
$$;

REVOKE ALL ON FUNCTION public.svj_import_platform_activity(text, text, text, timestamptz, timestamptz, integer, integer, numeric, numeric, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_import_platform_activity(text, text, text, timestamptz, timestamptz, integer, integer, numeric, numeric, integer, text)
  TO authenticated;

-- ── 3) Mental model: one authoritative reward entry point ──────────────────
-- GPS- and platform-sourced activities reach XP through the SAME existing
-- processor as every other activity. Nothing here grants XP itself: the
-- existing function validates source, evidence, daily caps and idempotency.
COMMENT ON FUNCTION public.svj_save_gps_activity(text, text, timestamptz, timestamptz, integer, jsonb, integer, integer, text, jsonb, text, text, boolean, text, text) IS
  'Records one SVJ-native GPS workout. Distance, moving time, elevation, splits and segment attempts are computed server-side from the submitted points. Emits exactly one activity.completed ledger event; XP is granted only by svj_process_activity_rewards.';

COMMIT;
