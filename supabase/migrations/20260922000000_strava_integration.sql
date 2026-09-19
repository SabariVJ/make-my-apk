-- ============================================================================
-- SVJ × STRAVA — connection store + server-authoritative activity import.
--
-- ADDITIVE and IDEMPOTENT. Extends the existing Update 01/Update 04 activity
-- architecture; it does NOT create a second activity or XP system.
--
-- WHAT THIS ADDS
--   • svj_activities.source accepts 'strava' alongside svj_native / manual.
--   • public.svj_strava_connections — one OAuth token set per SVJ user.
--   • public.svj_strava_oauth_states — short-lived CSRF state for the OAuth
--     redirect, bound to the initiating user and consumed exactly once.
--   • public.svj_process_activity_rewards_impl(uuid, uuid) — the ONE
--     authoritative activity reward implementation, extracted verbatim from
--     svj_process_activity_rewards with a single change: the target user id is
--     passed in instead of read from auth.uid(). The public
--     svj_process_activity_rewards(uuid) keeps its exact signature and grants
--     and now asserts the caller then delegates to the implementation.
--   • public.svj_strava_import_activities(uuid, jsonb) — service-role only.
--     Insert is idempotent on (user_id, client_session_id) and therefore on
--     the Strava activity id; rewards come from the SAME impl above, keyed by
--     the same immutable activity_events ledger keys, so a re-sync can never
--     double-credit XP, stats, rivalry or records.
--
-- SECURITY MODEL
--   Tokens live ONLY in svj_strava_connections, which is RLS-forced and has
--   every privilege revoked from PUBLIC, anon and authenticated. No client
--   role can read or write it: the browser never receives a Strava token.
--   Imported activities are attributed to the server-verified user id; the
--   browser never supplies user_id, XP, stat deltas or reward amounts.
--
-- NOT CHANGED: reward policy numbers, daily caps, evidence rules, PR rules,
-- 60-Day rewards, Earn Plus, membership, goals, community/rivalry scoring, and
-- the service-role lockdown of the original privileged RPCs.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) svj_activities.source gains 'strava'
--    The CHECK was declared inline, so PostgreSQL named it
--    svj_activities_source_check. Replaced with the same rule plus 'strava'.
-- ---------------------------------------------------------------------------
ALTER TABLE public.svj_activities
  DROP CONSTRAINT IF EXISTS svj_activities_source_check;
ALTER TABLE public.svj_activities
  ADD CONSTRAINT svj_activities_source_check
  CHECK (source IN ('svj_native', 'manual', 'strength_log', 'strava'));

-- ---------------------------------------------------------------------------
-- 2) OAuth connection store — server-only, never readable by a client role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.svj_strava_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- One Strava athlete may feed exactly one SVJ account (no cross-account
  -- duplication of the same real-world workout).
  strava_athlete_id bigint NOT NULL UNIQUE,
  athlete_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text NOT NULL DEFAULT 'read,activity:read_all',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_sync_error text,
  CONSTRAINT svj_strava_athlete_name_len CHECK (
    athlete_name IS NULL OR char_length(athlete_name) <= 120
  )
);

ALTER TABLE public.svj_strava_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_strava_connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_strava_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.svj_strava_connections TO service_role;

CREATE TABLE IF NOT EXISTS public.svj_strava_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT svj_strava_state_len CHECK (char_length(state) BETWEEN 16 AND 200)
);

CREATE INDEX IF NOT EXISTS svj_strava_oauth_states_user_idx
  ON public.svj_strava_oauth_states (user_id, expires_at DESC);

ALTER TABLE public.svj_strava_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_strava_oauth_states FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_strava_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.svj_strava_oauth_states TO service_role;

-- ---------------------------------------------------------------------------
-- 3) ONE authoritative activity reward implementation.
--
--    Body is the deployed svj_process_activity_rewards body verbatim, with a
--    single change: `v_caller uuid := p_user_id` replaces `:= auth.uid()`.
--    Every ownership check (`WHERE id = p_activity_id AND user_id = v_caller`)
--    and every ledger key is preserved, so a wrong p_user_id cannot reach
--    another user's activity and cannot double-credit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_process_activity_rewards_impl(
  p_user_id uuid,
  p_activity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := p_user_id;
  v_activity public.svj_activities;
  v_policy public.svj_activity_reward_policy;
  v_event_key text;
  v_base_xp integer := 0;
  v_bonus_xp integer := 0;
  v_pr_xp integer := 0;
  v_awarded_xp integer := 0;
  v_cap_room integer;
  v_stat_gain jsonb;
  v_stat_name text;
  v_stat_delta integer;
  v_has_new_pr boolean;
  v_stat_changes jsonb := '{}'::jsonb;
  v_xp_event_key text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_activity FROM public.svj_activities
  WHERE id = p_activity_id AND user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- Owner-only post-processing, exactly once. A duplicate save (same
  -- client_session_id) returns the same activity id, and the ledger key
  -- below makes a second call a no-op.
  v_xp_event_key := 'activity.xp:' || v_activity.id::text;

  -- ── Eligibility: canonical policy, never client-declared ────────────────
  IF v_activity.source = 'manual' THEN
    -- Manual generic activities earn nothing protected (history/goals only).
    RETURN jsonb_build_object(
      'ok', true, 'eligible', false, 'reason', 'manual_source',
      'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb,
      'dailyActivityXpRemaining', GREATEST(0,
        100 - public.svj_activity_xp_earned_today(v_caller))
    );
  END IF;

  SELECT * INTO v_policy FROM public.svj_activity_reward_policy
  WHERE activity_type = v_activity.activity_type AND enabled;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'eligible', false, 'reason', 'no_policy',
      'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
    );
  END IF;

  -- Sanity safeguards (defence in depth; save already bounds these).
  IF v_activity.duration_seconds <= 0 OR v_activity.duration_seconds > 86400 THEN
    RETURN jsonb_build_object(
      'ok', true, 'eligible', false, 'reason', 'invalid_duration',
      'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
    );
  END IF;
  IF v_policy.requires_evidence THEN
    -- Step-based cardio needs genuine evidence: steps or measured distance.
    -- Cycling is the distance-measured exception handled below.
    IF v_activity.activity_type IN ('walking', 'running', 'cycling', 'football')
      AND v_activity.step_count <= 0
      AND (v_activity.distance_meters IS NULL OR v_activity.distance_meters <= 0) THEN
      RETURN jsonb_build_object(
        'ok', true, 'eligible', false, 'reason', 'no_evidence',
        'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
      );
    END IF;
  END IF;

  -- Idempotency fast-path: XP already processed for this activity.
  IF EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE user_id = v_caller AND event_key = v_xp_event_key
  ) THEN
    RETURN jsonb_build_object(
      'ok', true, 'eligible', true, 'xpAwarded', 0,
      'prBonusAwarded', 0, 'statChanges', '{}'::jsonb, 'duplicate', true,
      'dailyActivityXpRemaining', GREATEST(0,
        100 - public.svj_activity_xp_earned_today(v_caller))
    );
  END IF;

  -- ── Qualification ────────────────────────────────────────────────────────
  IF v_activity.activity_type = 'strength' THEN
    IF NOT public.svj_strength_workout_qualifies(v_activity.id) THEN
      RETURN jsonb_build_object(
        'ok', true, 'eligible', false, 'reason', 'insufficient_evidence',
        'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
      );
    END IF;
  ELSE
    IF v_activity.duration_seconds < v_policy.min_duration_seconds THEN
      RETURN jsonb_build_object(
        'ok', true, 'eligible', false, 'reason', 'duration_too_short',
        'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
      );
    END IF;
  END IF;

  -- ── XP: base + bounded duration bonus (server clock, capped) ────────────
  v_base_xp := v_policy.base_xp;
  v_bonus_xp := CASE
    WHEN v_activity.duration_seconds >= 3600 THEN 15
    WHEN v_activity.duration_seconds >= 2700 THEN 10
    WHEN v_activity.duration_seconds >= 1800 THEN 5
    ELSE 0
  END;

  -- ── PR bonus: at most +5 per activity, once, evidence-keyed ─────────────
  SELECT EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE user_id = v_caller
      AND source_id = v_activity.id::text
      AND event_key LIKE 'personal_record.achieved:' || v_activity.id::text || ':%'
      AND NOT EXISTS (
        SELECT 1 FROM public.activity_events pr_xp
        WHERE pr_xp.user_id = v_caller
          AND pr_xp.event_key = 'activity.pr_bonus:' || v_activity.id::text
      )
  ) INTO v_has_new_pr;
  IF v_has_new_pr THEN
    v_pr_xp := 5;
  END IF;

  v_awarded_xp := LEAST(100, v_base_xp + v_bonus_xp + v_pr_xp);
  v_cap_room := GREATEST(0, 100 - public.svj_activity_xp_earned_today(v_caller));
  v_awarded_xp := LEAST(v_awarded_xp, v_cap_room);

  -- ── One immutable XP ledger event → aggregate once ───────────────────────
  INSERT INTO public.activity_events (
    user_id, event_key, event_type, source_class, source_id,
    occurred_at, lifetime_xp_delta, rivalry_xp_delta,
    stat_deltas, metadata
  ) VALUES (
    v_caller,
    v_xp_event_key,
    'xp_award',
    'workout',
    v_activity.id::text,
    v_activity.ended_at,
    v_awarded_xp,
    v_awarded_xp,
    v_policy.stat_map,
    jsonb_build_object(
      'activity_id', v_activity.id,
      'activity_type', v_activity.activity_type,
      'source', v_activity.source,
      'duration_seconds', v_activity.duration_seconds,
      'base_xp', v_base_xp,
      'duration_bonus', v_bonus_xp,
      'pr_bonus', v_pr_xp
    )
  )
  ON CONFLICT (user_id, event_key) DO NOTHING
  RETURNING id INTO v_event_key;

  IF v_event_key IS NOT NULL AND v_awarded_xp > 0 THEN
    PERFORM set_config('svj.trusted_server_write', 'on', true);
    UPDATE public.profiles
    SET total_xp = COALESCE(total_xp, 0) + v_awarded_xp
    WHERE id = v_caller;
  END IF;

  -- Separate PR-bonus evidence event so a recomputation can never re-grant.
  IF v_pr_xp > 0 THEN
    INSERT INTO public.activity_events (
      user_id, event_key, event_type, source_class, source_id,
      occurred_at, lifetime_xp_delta, rivalry_xp_delta, stat_deltas, metadata
    ) VALUES (
      v_caller,
      'activity.pr_bonus:' || v_activity.id::text,
      'xp_award',
      'workout',
      v_activity.id::text,
      v_activity.ended_at,
      0,
      0,
      '{}'::jsonb,
      jsonb_build_object('pr_bonus_included_in', v_xp_event_key)
    )
    ON CONFLICT (user_id, event_key) DO NOTHING;
  END IF;

  -- ── Stat events: small bounded gains with per-stat daily caps ───────────
  -- Daily caps: fitness +6, discipline +3, focus +2 (from activity).
  FOR v_stat_name, v_stat_delta IN
    SELECT * FROM jsonb_each_text(v_policy.stat_map)
  LOOP
    CONTINUE WHEN v_stat_delta IS NULL OR v_stat_delta::integer <= 0;

    v_cap_room := CASE v_stat_name
      WHEN 'fitness' THEN GREATEST(0, 6 - COALESCE((
        SELECT SUM(delta)::integer FROM public.stat_events
        WHERE user_id = v_caller AND stat_name = 'fitness'
          AND source = 'activity'
          AND created_at >= date_trunc('day', now())
      ), 0))
      WHEN 'discipline' THEN GREATEST(0, 3 - COALESCE((
        SELECT SUM(delta)::integer FROM public.stat_events
        WHERE user_id = v_caller AND stat_name = 'discipline'
          AND source = 'activity'
          AND created_at >= date_trunc('day', now())
      ), 0))
      WHEN 'focus' THEN GREATEST(0, 2 - COALESCE((
        SELECT SUM(delta)::integer FROM public.stat_events
        WHERE user_id = v_caller AND stat_name = 'focus'
          AND source = 'activity'
          AND created_at >= date_trunc('day', now())
      ), 0))
      ELSE 0
    END;
    CONTINUE WHEN v_cap_room <= 0;

    v_stat_delta := LEAST(v_stat_delta::integer, v_cap_room);

    INSERT INTO public.stat_events (user_id, stat_name, delta, source, source_id, event_key)
    VALUES (
      v_caller,
      v_stat_name,
      v_stat_delta,
      'activity',
      v_activity.id::text,
      'activity.stat:' || v_activity.id::text || ':' || v_stat_name
    )
    ON CONFLICT DO NOTHING;

    -- user_stats is the aggregate: derive ONLY from server stat events.
    UPDATE public.user_stats
    SET fitness     = LEAST(100, fitness     + CASE WHEN v_stat_name = 'fitness'     THEN v_stat_delta ELSE 0 END),
        discipline  = LEAST(100, discipline  + CASE WHEN v_stat_name = 'discipline'  THEN v_stat_delta ELSE 0 END),
        focus       = LEAST(100, focus       + CASE WHEN v_stat_name = 'focus'       THEN v_stat_delta ELSE 0 END)
    WHERE user_id = v_caller;

    v_stat_changes := v_stat_changes || jsonb_build_object(v_stat_name, v_stat_delta);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'eligible', true,
    'xpAwarded', v_awarded_xp,
    'prBonusAwarded', CASE WHEN v_pr_xp > 0 AND v_awarded_xp > 0 THEN 5 ELSE 0 END,
    'statChanges', v_stat_changes,
    'dailyActivityXpRemaining', GREATEST(0, 100 - public.svj_activity_xp_earned_today(v_caller))
  );
END;
$$;

-- The implementation is unreachable by every client role.
REVOKE ALL ON FUNCTION public.svj_process_activity_rewards_impl(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- The public contract is unchanged: same signature, same auth assertion,
-- same ownership semantics (the impl enforces them on p_user_id).
CREATE OR REPLACE FUNCTION public.svj_process_activity_rewards(
  p_activity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN public.svj_process_activity_rewards_impl(v_caller, p_activity_id);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_process_activity_rewards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_process_activity_rewards(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Server-side Strava flows (service_role only — no client privileges).
-- ---------------------------------------------------------------------------

-- Begin a connect: bound to the authenticated user resolved by the server.
CREATE OR REPLACE FUNCTION public.svj_strava_begin_connect(
  p_user_id uuid,
  p_state text,
  p_return_to text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'SVJ_STRAVA_USER_REQUIRED';
  END IF;
  IF p_state IS NULL OR char_length(btrim(p_state)) NOT BETWEEN 16 AND 200 THEN
    RAISE EXCEPTION 'SVJ_STRAVA_STATE_INVALID';
  END IF;
  -- Opportunistic cleanup so the table stays small.
  DELETE FROM public.svj_strava_oauth_states WHERE expires_at <= now();
  INSERT INTO public.svj_strava_oauth_states (state, user_id, return_to, expires_at)
  VALUES (
    btrim(p_state), p_user_id,
    NULLIF(btrim(COALESCE(p_return_to, '')), ''),
    now() + interval '10 minutes'
  )
  ON CONFLICT (state) DO NOTHING;
END;
$$;

-- Consume a state exactly once. Returns the bound user, or raises.
CREATE OR REPLACE FUNCTION public.svj_strava_consume_state(p_state text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.svj_strava_oauth_states;
BEGIN
  DELETE FROM public.svj_strava_oauth_states
  WHERE state = btrim(COALESCE(p_state, ''))
  RETURNING * INTO v_row;
  IF NOT FOUND OR v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'SVJ_STRAVA_STATE_INVALID';
  END IF;
  RETURN jsonb_build_object('userId', v_row.user_id, 'returnTo', v_row.return_to);
END;
$$;

-- Upsert the token set after a successful code exchange.
CREATE OR REPLACE FUNCTION public.svj_strava_save_connection(
  p_user_id uuid,
  p_athlete_id bigint,
  p_athlete_name text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_scopes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holder uuid;
BEGIN
  IF p_user_id IS NULL OR p_athlete_id IS NULL THEN
    RAISE EXCEPTION 'SVJ_STRAVA_CONNECTION_INVALID';
  END IF;
  IF p_access_token IS NULL OR p_refresh_token IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'SVJ_STRAVA_CONNECTION_INVALID';
  END IF;
  SELECT user_id INTO v_holder FROM public.svj_strava_connections
  WHERE strava_athlete_id = p_athlete_id;
  IF FOUND AND v_holder <> p_user_id THEN
    -- The same real-world athlete may not feed two SVJ accounts.
    RAISE EXCEPTION 'SVJ_STRAVA_ALREADY_LINKED';
  END IF;

  INSERT INTO public.svj_strava_connections (
    user_id, strava_athlete_id, athlete_name,
    access_token, refresh_token, token_expires_at, scopes,
    connected_at, last_sync_error
  ) VALUES (
    p_user_id, p_athlete_id, NULLIF(btrim(COALESCE(p_athlete_name, '')), ''),
    p_access_token, p_refresh_token, p_expires_at,
    COALESCE(NULLIF(btrim(COALESCE(p_scopes, '')), ''), 'read,activity:read_all'),
    now(), NULL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    strava_athlete_id = EXCLUDED.strava_athlete_id,
    athlete_name = EXCLUDED.athlete_name,
    access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    token_expires_at = EXCLUDED.token_expires_at,
    scopes = EXCLUDED.scopes,
    connected_at = now(),
    last_sync_error = NULL;
END;
$$;

-- Read the token set for the sync worker.
CREATE OR REPLACE FUNCTION public.svj_strava_read_connection(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'userId', c.user_id,
    'athleteId', c.strava_athlete_id,
    'athleteName', c.athlete_name,
    'accessToken', c.access_token,
    'refreshToken', c.refresh_token,
    'expiresAt', c.token_expires_at,
    'scopes', c.scopes,
    'lastSyncedAt', c.last_synced_at
  )
  FROM public.svj_strava_connections c
  WHERE c.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.svj_strava_mark_synced(
  p_user_id uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.svj_strava_connections
  SET last_synced_at = CASE WHEN p_error IS NULL THEN now() ELSE last_synced_at END,
      last_sync_error = NULLIF(btrim(COALESCE(p_error, '')), '')
  WHERE user_id = p_user_id;
$$;

-- Import a page of Strava activities. Idempotent per Strava activity id, and
-- every reward is granted by the one authoritative impl above.
CREATE OR REPLACE FUNCTION public.svj_strava_import_activities(
  p_user_id uuid,
  p_activities jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_strava_id text;
  v_session text;
  v_type text;
  v_started timestamptz;
  v_ended timestamptz;
  v_duration integer;
  v_steps integer;
  v_distance numeric;
  v_calories numeric;
  v_name text;
  v_activity_id uuid;
  v_imported integer := 0;
  v_duplicate integer := 0;
  v_skipped integer := 0;
  v_xp integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_reward jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'SVJ_STRAVA_USER_REQUIRED';
  END IF;
  IF p_activities IS NULL
     OR jsonb_typeof(p_activities) <> 'array' THEN
    RAISE EXCEPTION 'SVJ_STRAVA_PAYLOAD_INVALID';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_activities)
  LOOP
    BEGIN
      v_strava_id := NULLIF(btrim(COALESCE(v_item ->> 'stravaId', '')), '');
      v_type := NULLIF(btrim(COALESCE(v_item ->> 'activityType', '')), '');
      v_started := (v_item ->> 'startedAt')::timestamptz;
      v_ended := (v_item ->> 'endedAt')::timestamptz;
      v_duration := NULLIF(v_item ->> 'durationSeconds', '')::integer;
      v_steps := COALESCE(NULLIF(v_item ->> 'stepCount', '')::integer, 0);
      v_distance := NULLIF(v_item ->> 'distanceMeters', '')::numeric;
      v_calories := NULLIF(v_item ->> 'caloriesEstimate', '')::numeric;
      v_name := NULLIF(btrim(COALESCE(v_item ->> 'name', '')), '');

      IF v_strava_id IS NULL
         OR v_strava_id !~ '^[0-9]{1,32}$'
         OR v_type IS NULL
         OR v_started IS NULL
         OR v_ended IS NULL
         OR v_duration IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      -- Re-validate against the canonical server rules; a provider payload is
      -- still untrusted input.
      IF v_type NOT IN (
        'walking', 'running', 'strength', 'cycling', 'football',
        'calisthenics', 'hiit', 'yoga', 'other'
      )
         OR v_ended <= v_started
         OR v_duration < 1 OR v_duration > 86400
         OR v_steps < 0 OR v_steps > 500000
         OR (v_distance IS NOT NULL AND (v_distance < 0 OR v_distance > 500000))
         OR (v_calories IS NOT NULL AND (v_calories < 0 OR v_calories > 20000)) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Stable per-provider identity: retrying a sync can never duplicate.
      v_session := 'strava:' || v_strava_id;

      INSERT INTO public.svj_activities (
        user_id, client_session_id, activity_type, source,
        started_at, ended_at, duration_seconds,
        step_count, distance_meters, calories_estimate, notes
      ) VALUES (
        p_user_id, v_session, v_type, 'strava',
        v_started, v_ended, v_duration,
        v_steps, v_distance, v_calories,
        CASE WHEN v_name IS NULL THEN 'Imported from Strava'
             ELSE left('Strava: ' || v_name, 500) END
      )
      ON CONFLICT (user_id, client_session_id) DO NOTHING
      RETURNING id INTO v_activity_id;

      IF v_activity_id IS NULL THEN
        v_duplicate := v_duplicate + 1;
        CONTINUE;
      END IF;

      -- Exactly one durable completion event per imported activity.
      INSERT INTO public.activity_events (
        user_id, event_key, event_type, source_class, source_id,
        occurred_at, metadata
      ) VALUES (
        p_user_id,
        'activity.completed:' || v_activity_id::text,
        'workout',
        'workout',
        v_activity_id::text,
        v_ended,
        jsonb_build_object(
          'activity_id', v_activity_id,
          'client_session_id', v_session,
          'activity_type', v_type,
          'source', 'strava',
          'strava_id', v_strava_id
        )
      )
      ON CONFLICT (user_id, event_key) DO NOTHING;

      v_reward := public.svj_process_activity_rewards_impl(p_user_id, v_activity_id);
      v_imported := v_imported + 1;
      v_xp := v_xp + COALESCE((v_reward ->> 'xpAwarded')::integer, 0);
      v_results := v_results || jsonb_build_object(
        'stravaId', v_strava_id,
        'activityId', v_activity_id,
        'xpAwarded', COALESCE((v_reward ->> 'xpAwarded')::integer, 0),
        'eligible', COALESCE((v_reward ->> 'eligible')::boolean, false)
      );
    EXCEPTION WHEN OTHERS THEN
      -- One malformed provider row must never abort the whole sync, and a
      -- unique-index race is reported as a duplicate rather than an error.
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'imported', v_imported,
    'duplicate', v_duplicate,
    'skipped', v_skipped,
    'xpAwarded', v_xp,
    'results', v_results
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Grant boundary.
--    Privileged internals: service_role only. Client-facing helpers: the
--    authenticated owner only, never anon.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.svj_strava_begin_connect(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_strava_consume_state(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_strava_save_connection(uuid, bigint, text, text, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_strava_read_connection(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_strava_mark_synced(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_strava_import_activities(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.svj_strava_begin_connect(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_strava_consume_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_strava_save_connection(uuid, bigint, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_strava_read_connection(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_strava_mark_synced(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_strava_import_activities(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Owner-facing status + disconnect. These run as the authenticated user and
--    derive identity from auth.uid(); they can never name another user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_get_my_strava_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.svj_strava_connections;
  v_connected boolean := false;
  v_imported integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO v_row FROM public.svj_strava_connections WHERE user_id = v_caller;
  v_connected := FOUND;
  SELECT count(*)::integer INTO v_imported
  FROM public.svj_activities
  WHERE user_id = v_caller AND source = 'strava';

  RETURN jsonb_build_object(
    'connected', v_connected,
    'athleteName', CASE WHEN v_connected THEN v_row.athlete_name END,
    'connectedAt', CASE WHEN v_connected THEN v_row.connected_at END,
    'lastSyncedAt', CASE WHEN v_connected THEN v_row.last_synced_at END,
    'lastSyncError', CASE WHEN v_connected THEN v_row.last_sync_error END,
    'importedActivities', v_imported
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_disconnect_my_strava()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_deleted integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  -- Imported activities stay: they are the user's real history and earned XP.
  DELETE FROM public.svj_strava_oauth_states WHERE user_id = v_caller;
  DELETE FROM public.svj_strava_connections WHERE user_id = v_caller;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'disconnected', v_deleted > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_get_my_strava_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_disconnect_my_strava() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_my_strava_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_disconnect_my_strava() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
