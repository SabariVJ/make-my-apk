-- ============================================================================
-- Update 01: server-backed activity foundation + activity history.
--
-- Additive only. One canonical activity record per completed session, owned
-- by the authenticated user, with an idempotent save path and exactly one
-- durable `activity.completed` ledger event per activity. No XP, PR, goal or
-- community behaviour is introduced here.
--
-- Sources start at 'svj_native' (device sensor session) and 'manual'. Future
-- sources such as 'health_connect' can be added with one ALTER — the table
-- intentionally stores provenance without trusting client reward data.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.svj_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stable client-provided session identity. Retrying a failed save reuses
  -- the same value so a network retry can never create a duplicate activity.
  client_session_id text NOT NULL CHECK (char_length(client_session_id) BETWEEN 8 AND 100),
  activity_type text NOT NULL CHECK (activity_type IN (
    'walking', 'running', 'strength', 'cycling', 'football',
    'calisthenics', 'hiit', 'yoga', 'other'
  )),
  source text NOT NULL CHECK (source IN ('svj_native', 'manual')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 1 AND 86400),
  step_count integer NOT NULL DEFAULT 0 CHECK (step_count BETWEEN 0 AND 500000),
  -- Only populated when genuinely measured (sensor distance). Never fabricated.
  distance_meters numeric(10, 2) CHECK (distance_meters IS NULL OR distance_meters >= 0),
  -- Only populated when genuinely calculated by the existing estimator.
  calories_estimate numeric(8, 2) CHECK (calories_estimate IS NULL OR calories_estimate >= 0),
  perceived_effort integer CHECK (perceived_effort BETWEEN 1 AND 10),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  -- Conservative default: activities are private until sharing is designed.
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'community')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_activities_session_identity UNIQUE (user_id, client_session_id),
  CONSTRAINT svj_activities_time_order CHECK (ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS svj_activities_user_ended_idx
  ON public.svj_activities (user_id, ended_at DESC, id DESC);

ALTER TABLE public.svj_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_activities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_activities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.svj_activities TO authenticated;
GRANT ALL ON public.svj_activities TO service_role;

-- Ownership: a user may read and create ONLY their own activities. No
-- UPDATE/DELETE is granted to authenticated at all — saved activities are
-- immutable from the client, so another user's rows can never be modified
-- and even the owner cannot silently rewrite history. user_id is never
-- accepted from the client: every policy is derived from auth.uid().
DROP POLICY IF EXISTS "Users read own activities" ON public.svj_activities;
CREATE POLICY "Users read own activities"
  ON public.svj_activities
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own activities" ON public.svj_activities;
CREATE POLICY "Users insert own activities"
  ON public.svj_activities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── Idempotent save + single completion event ───────────────────────────────
-- Runs as the owner-checking definer: re-derives the user from auth.uid()
-- (the caller NEVER supplies user_id), validates the payload server-side,
-- inserts at most one activity per (user, client_session_id) and, only when
-- the activity row is newly created, emits exactly one immutable ledger event.
-- A retry after a network failure returns the original activity unchanged.
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
    -- Manual entries never fabricate sensor metrics; steps on a manual log
    -- are allowed only as a user-declared count without sensor distance.
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
    -- Idempotent retry: the activity already exists. Return it unchanged and
    -- never emit a second completion event.
    SELECT * INTO v_existing FROM public.svj_activities
    WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'activity', to_jsonb(v_existing)
    );
  END IF;

  -- Exactly one durable completion event, keyed to the canonical activity.
  -- The (user_id, event_key) unique constraint is the replay guard.
  INSERT INTO public.activity_events (
    user_id,
    event_key,
    event_type,
    source_class,
    source_id,
    occurred_at,
    metadata
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

  SELECT * INTO v_existing FROM public.svj_activities WHERE id = v_activity_id;
  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'activity', to_jsonb(v_existing)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.svj_save_activity(text, text, text, timestamptz, timestamptz, integer, integer, numeric, numeric, integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_save_activity(text, text, text, timestamptz, timestamptz, integer, integer, numeric, numeric, integer, text)
  TO authenticated;

-- History read path: newest first, server-derived identity (auth.uid()).
-- Uses the RLS SELECT policy, so rows from other users are never returned.
CREATE OR REPLACE FUNCTION public.svj_list_activities(
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.svj_activities
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.svj_activities
  WHERE user_id = auth.uid()
  ORDER BY ended_at DESC, id DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200));
$$;

REVOKE ALL ON FUNCTION public.svj_list_activities(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_activities(integer) TO authenticated;

COMMENT ON TABLE public.svj_activities IS
  'Canonical server-backed activity records. One row per completed session; idempotent by (user_id, client_session_id). Private by default.';

COMMIT;
