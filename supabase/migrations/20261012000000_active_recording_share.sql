-- An unfinished recording can be shared without creating an activity or rewards.
BEGIN;
ALTER TABLE public.svj_live_share_sessions ALTER COLUMN activity_id DROP NOT NULL;
ALTER TABLE public.svj_live_share_sessions ADD COLUMN IF NOT EXISTS recording_id uuid;
CREATE INDEX IF NOT EXISTS svj_share_recording_owner_idx ON public.svj_live_share_sessions(user_id, recording_id);

CREATE OR REPLACE FUNCTION public.svj_start_recording_live_share(
  p_recording_id uuid, p_activity_type text, p_ttl_minutes integer DEFAULT 180
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid(); v_share public.svj_live_share_sessions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_recording_id IS NULL OR p_activity_type NOT IN ('walking', 'running', 'hiking', 'cycling') THEN RAISE EXCEPTION 'Invalid recording'; END IF;
  UPDATE public.svj_live_share_sessions SET revoked_at = now() WHERE user_id = v_user AND revoked_at IS NULL;
  INSERT INTO public.svj_live_share_sessions(user_id, recording_id, token, activity_type, started_at, expires_at)
  VALUES (v_user, p_recording_id, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), p_activity_type,
    now(), now() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes, 180), 720)))) RETURNING * INTO v_share;
  RETURN jsonb_build_object('ok', true, 'active', true, 'token', v_share.token, 'activityType', v_share.activity_type, 'startedAt', v_share.started_at, 'expiresAt', v_share.expires_at);
END; $$;
REVOKE ALL ON FUNCTION public.svj_start_recording_live_share(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_start_recording_live_share(uuid, text, integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.svj_get_my_live_share()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_share public.svj_live_share_sessions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_share FROM public.svj_live_share_sessions
  WHERE user_id = v_user AND revoked_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('active', false); END IF;
  RETURN jsonb_build_object('active', true, 'token', v_share.token,
    'activityId', v_share.activity_id, 'recordingId', v_share.recording_id,
    'activityType', v_share.activity_type, 'displayName', v_share.display_name,
    'startedAt', v_share.started_at, 'expiresAt', v_share.expires_at,
    'lastLat', v_share.last_lat, 'lastLng', v_share.last_lng,
    'lastUpdateAt', v_share.last_update_at, 'lastElapsedSeconds', v_share.last_elapsed_seconds,
    'lastDistanceMeters', v_share.last_distance_meters, 'batteryPercent', v_share.battery_percent);
END; $$;
REVOKE ALL ON FUNCTION public.svj_get_my_live_share() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_my_live_share() TO authenticated;
COMMIT;
