-- ============================================================================
-- SVJ WEARABLES V2 — Wear OS activity provenance.
--
-- A workout recorded on the SVJ Wear OS companion is SVJ's own watch app, not
-- an external provider and not a Health Connect record. Storing it as
-- `health_connect` would misreport its origin in Activity History and on the
-- activity detail source badge, so the canonical activity row gets its own
-- `wear_os` source value.
--
-- This migration is ADDITIVE and IDEMPOTENT:
--   * the source CHECK constraint is dropped and re-added with `wear_os`
--     included — no existing row is touched or rewritten;
--   * `svj_import_platform_activity` is recreated (CREATE OR REPLACE) so the
--     stored source follows the submitted device platform. The default
--     argument is unchanged, so every existing Health Connect caller keeps
--     behaving exactly as before;
--   * no table, column, row, policy or grant is removed. XP stays entirely
--     server-authoritative: this function still only records the activity and
--     the single `activity.completed` ledger event, and rewards are granted by
--     the existing `svj_process_activity_rewards`.
-- ============================================================================

-- ── 1) Allow the `wear_os` source ──────────────────────────────────────────
ALTER TABLE public.svj_activities DROP CONSTRAINT IF EXISTS svj_activities_source_check;
ALTER TABLE public.svj_activities
  ADD CONSTRAINT svj_activities_source_check
  CHECK (source IN ('svj_native', 'manual', 'strength_log', 'health_connect', 'wear_os'));

-- ── 2) Platform import now records the real device platform ────────────────
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
  v_source text;
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

  -- Provenance is derived from the submitting client, never trusted as free
  -- text: only the two SVJ device pipelines are accepted.
  v_source := CASE
    WHEN lower(coalesce(p_device_platform, 'health_connect')) = 'wear_os' THEN 'wear_os'
    ELSE 'health_connect'
  END;

  -- Same device record imported twice → original row, no second activity.
  SELECT * INTO v_activity FROM public.svj_activities
  WHERE user_id = v_user_id
    AND source IN ('health_connect', 'wear_os')
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

  -- The same real-world workout already recorded by SVJ natively (for example
  -- the phone recorded the GPS route while the watch recorded heart rate):
  -- never create a permanent second copy, and never a second XP grant.
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
    v_user_id, btrim(p_client_session_id), p_activity_type, v_source,
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
      'source', v_source,
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

COMMENT ON FUNCTION public.svj_import_platform_activity(text, text, text, timestamptz, timestamptz, integer, integer, numeric, numeric, integer, text) IS
  'Records one device-sourced workout (Health Connect or the SVJ Wear OS companion), deduplicated by external id, session id and overlap against existing SVJ activities. Emits exactly one activity.completed ledger event; XP is granted only by svj_process_activity_rewards.';
