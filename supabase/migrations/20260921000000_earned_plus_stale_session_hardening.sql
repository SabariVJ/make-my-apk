-- =============================================================================
-- SVJ EARN PLUS — STALE MISSION-SESSION HARDENING
-- =============================================================================
-- ADDITIVE and IDEMPOTENT. Targets the live SVJ runtime backend
-- (oltmnrkceodpyqznfhjb). Safe to re-run.
--
-- WHY THIS EXISTS
-- 20260920000000_earned_plus_self_service.sql extracted the reward business
-- logic into internal *_impl functions. Two behaviours from the original RPC
-- bodies were lost during that extraction, and either one permanently blocks a
-- user from earning again:
--
--   1. svj_start_daily_mission_impl no longer closes EXPIRED mission sessions
--      before inserting a new one. `reward_mission_sessions` carries
--
--        CREATE UNIQUE INDEX reward_one_open_session_per_user
--          ON public.reward_mission_sessions (user_id)
--          WHERE completed_at IS NULL AND expired_at IS NULL;
--
--      so a session whose expires_at has passed but which was never stamped
--      (completed_at IS NULL, expired_at IS NULL) stays "open" forever and the
--      next INSERT collides with the index → PostgreSQL 23505 → PostgREST,
--      which the browser surfaced as the misleading
--      "This action has already been recorded...".
--
--   2. svj_complete_daily_mission_impl no longer stamped
--      reward_mission_sessions.completed_at, so a SUCCESSFULLY completed
--      mission left its own session open and blocked the very next start the
--      same way.
--
-- It also fixes qualifying-day overcounting: the extracted body incremented
-- reward_wallets.qualifying_days once per MISSION, but a qualifying day is
-- "at least one valid completed mission on a policy day", so the live rule
-- must be +1 per distinct mission_completion policy_day.
--
-- WHAT IS DELIBERATELY NOT CHANGED
-- Reward XP prices, daily_reward_xp_cap, required_qualifying_days, minimum
-- mission timing, mission expiry, account-age requirement, campaign id,
-- enabled/claims_enabled policy flags, request-receipt idempotency, ledger
-- rules, founder lifetime behaviour, timed-Plus extension, one-time Earn Plus
-- redemption, 60-Day rewards, activity/profile XP, and the service-role
-- lockdown of the original privileged RPCs all stay exactly as deployed.
--
-- `svj_assert_reward_service_role()`, the original service-role RPCs, and the
-- self-service entry points are NOT modified by this migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) STALE SESSION BACKFILL
--    Stamp the deterministic expiry instant on every logically-open session
--    whose expiry has already passed. Active (non-expired) sessions are
--    untouched, and no XP, wallet, receipt or assignment row is modified.
-- -----------------------------------------------------------------------------
UPDATE public.reward_mission_sessions
SET expired_at = expires_at
WHERE completed_at IS NULL
  AND expired_at IS NULL
  AND expires_at IS NOT NULL
  AND expires_at <= clock_timestamp();

-- -----------------------------------------------------------------------------
-- B) QUALIFYING-DAY RECONCILIATION
--    Reward XP is never touched. `qualifying_days` is derived from the
--    authoritative ledger: the number of DISTINCT policy_day values that carry
--    a valid mission_completion event for the active campaign. This repairs any
--    historical overcount produced by the per-mission increment. Only rows that
--    actually disagree are written, so the statement is a no-op when correct.
-- -----------------------------------------------------------------------------
WITH derived AS (
  SELECT w.user_id,
    COALESCE((
      SELECT count(DISTINCT l.policy_day)::integer
      FROM public.reward_xp_ledger l
      WHERE l.user_id = w.user_id
        AND l.campaign_id = 'earned-plus-launch-v1'
        AND l.kind = 'mission_completion'
    ), 0) AS days,
    (
      SELECT max(l.policy_day)
      FROM public.reward_xp_ledger l
      WHERE l.user_id = w.user_id
        AND l.campaign_id = 'earned-plus-launch-v1'
        AND l.kind = 'mission_completion'
    ) AS last_day
  FROM public.reward_wallets w
)
UPDATE public.reward_wallets w
SET qualifying_days = d.days,
    last_qualifying_day = d.last_day,
    updated_at = clock_timestamp()
FROM derived d
WHERE d.user_id = w.user_id
  AND (
    w.qualifying_days IS DISTINCT FROM d.days
    OR w.last_qualifying_day IS DISTINCT FROM d.last_day
  );

-- -----------------------------------------------------------------------------
-- C) MISSION START — close stale sessions before the open-session check and
--    before the INSERT. Everything else is unchanged from the deployed body.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_start_daily_mission_impl(
  p_user_id uuid, p_request_id uuid, p_mission_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_policy public.reward_policies%ROWTYPE;
  v_definition public.reward_mission_definitions%ROWTYPE;
  v_assignment public.reward_mission_assignments%ROWTYPE;
  v_wallet public.reward_wallets%ROWTYPE;
  v_session public.reward_mission_sessions%ROWTYPE;
  v_day date;
  v_reset timestamptz;
  v_source text;
  v_replay jsonb;
  v_receipt jsonb;
BEGIN
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  v_wallet := public.svj_lock_reward_wallet_impl(p_user_id);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_day := (v_now AT TIME ZONE v_policy.reward_timezone)::date;
  v_reset := ((v_day + 1)::timestamp AT TIME ZONE v_policy.reward_timezone);
  SELECT * INTO v_definition FROM public.reward_mission_definitions
    WHERE mission_key = p_mission_key AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_MISSION_NOT_FOUND'; END IF;
  v_source := v_day::text || ':' || v_definition.mission_key;
  v_replay := public.svj_replay_reward_operation_impl(
    p_user_id, p_request_id, 'start_mission', v_source);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state_impl(p_user_id));
  END IF;

  -- (1) Retire every logically-open session whose expiry has already passed.
  --     This is what keeps reward_one_open_session_per_user from turning an
  --     expired historical session into a permanent 23505 on INSERT.
  UPDATE public.reward_mission_sessions
  SET expired_at = expires_at
  WHERE user_id = p_user_id
    AND completed_at IS NULL
    AND expired_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at <= v_now;

  -- (2) Only a genuinely live session may block a new start. The predicate is
  --     exactly the unique index's predicate so a real conflict is reported as
  --     a domain error instead of a raw unique violation.
  IF EXISTS (
    SELECT 1 FROM public.reward_mission_sessions
    WHERE user_id = p_user_id AND completed_at IS NULL AND expired_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SVJ_REWARD_MISSION_ALREADY_RUNNING';
  END IF;

  INSERT INTO public.reward_mission_assignments (
    user_id, policy_day, mission_key, definition_version, minimum_seconds,
    reward_xp, profile_xp
  ) VALUES (
    p_user_id, v_day, v_definition.mission_key, v_definition.version,
    v_definition.minimum_seconds, v_definition.reward_xp, v_definition.profile_xp
  ) RETURNING * INTO v_assignment;
  INSERT INTO public.reward_mission_sessions (
    assignment_id, user_id, started_at, eligible_at, expires_at
  ) VALUES (
    v_assignment.id, p_user_id, v_now,
    v_now + make_interval(secs => v_definition.minimum_seconds),
    v_reset
  ) RETURNING * INTO v_session;
  v_receipt := jsonb_build_object('action', 'start_mission',
    'assignmentId', v_assignment.id, 'missionKey', v_definition.mission_key,
    'startedAt', v_session.started_at, 'eligibleAt', v_session.eligible_at,
    'expiresAt', v_session.expires_at, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'start_mission', v_source, v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state_impl(p_user_id));
END;
$$;

-- -----------------------------------------------------------------------------
-- D) MISSION COMPLETION — atomically close BOTH the assignment and its
--    session, add at most one qualifying day per policy day, and emit the
--    canonical SVJ_REWARD_* error names the client already maps.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_complete_daily_mission_impl(
  p_user_id uuid, p_request_id uuid, p_assignment_id uuid, p_confirmation_text text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_policy public.reward_policies%ROWTYPE;
  v_assignment public.reward_mission_assignments%ROWTYPE;
  v_wallet public.reward_wallets%ROWTYPE;
  v_session public.reward_mission_sessions%ROWTYPE;
  v_day date;
  v_source text;
  v_replay jsonb;
  v_earned_today integer;
  v_cap_room integer;
  v_reward integer;
  v_first_today boolean;
  v_receipt jsonb;
BEGIN
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  v_wallet := public.svj_lock_reward_wallet_impl(p_user_id);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_day := (v_now AT TIME ZONE v_policy.reward_timezone)::date;
  v_source := p_assignment_id::text;
  v_replay := public.svj_replay_reward_operation_impl(
    p_user_id, p_request_id, 'complete_mission', v_source);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state_impl(p_user_id));
  END IF;
  IF p_confirmation_text IS NULL
     OR length(btrim(p_confirmation_text)) < 20
     OR length(btrim(p_confirmation_text)) > 500 THEN
    RAISE EXCEPTION 'SVJ_REWARD_CONFIRMATION_REQUIRED';
  END IF;
  SELECT * INTO v_assignment FROM public.reward_mission_assignments
    WHERE id = p_assignment_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_ASSIGNMENT_NOT_FOUND'; END IF;
  IF v_assignment.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_MISSION_ALREADY_COMPLETED';
  END IF;
  SELECT * INTO v_session FROM public.reward_mission_sessions
    WHERE assignment_id = v_assignment.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_SESSION_NOT_FOUND'; END IF;
  IF v_session.started_at IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_SESSION_NOT_FOUND'; END IF;
  IF (v_session.expired_at IS NOT NULL OR v_session.expires_at <= v_now)
     OR v_assignment.policy_day <> v_day THEN
    RAISE EXCEPTION 'SVJ_REWARD_SESSION_EXPIRED';
  END IF;
  IF (v_session.eligible_at IS NOT NULL AND v_session.eligible_at > v_now)
     OR extract(epoch FROM (v_now - v_session.started_at)) < v_assignment.minimum_seconds THEN
    RAISE EXCEPTION 'SVJ_REWARD_MINIMUM_TIME_NOT_MET';
  END IF;
  SELECT COALESCE(sum(reward_xp_delta), 0)::integer INTO v_earned_today
    FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND campaign_id = v_policy.campaign_id
      AND policy_day = v_day AND kind = 'mission_completion';
  v_cap_room := v_policy.daily_reward_xp_cap - v_earned_today;
  IF v_cap_room <= 0 THEN RAISE EXCEPTION 'SVJ_REWARD_DAILY_CAP_REACHED'; END IF;
  v_reward := least(v_cap_room, v_assignment.reward_xp);
  -- A qualifying day is "at least one completed mission on a policy day".
  SELECT NOT EXISTS (
    SELECT 1 FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND campaign_id = v_policy.campaign_id
      AND policy_day = v_day AND kind = 'mission_completion'
  ) INTO v_first_today;

  -- Close the assignment AND its session together, so a completed mission can
  -- never keep reward_one_open_session_per_user occupied.
  UPDATE public.reward_mission_assignments SET completed_at = v_now
    WHERE id = v_assignment.id;
  UPDATE public.reward_mission_sessions
    SET completed_at = v_now, confirmation_text = btrim(p_confirmation_text)
    WHERE id = v_session.id;
  INSERT INTO public.reward_xp_ledger (
    user_id, campaign_id, policy_day, kind, source_key,
    reward_xp_delta, profile_xp_delta, created_at, metadata
  ) VALUES (
    p_user_id, v_policy.campaign_id, v_day, 'mission_completion',
    v_assignment.id::text, v_reward, v_assignment.profile_xp, v_now,
    jsonb_build_object('missionKey', v_assignment.mission_key,
      'definitionVersion', v_assignment.definition_version)
  );
  UPDATE public.reward_wallets SET
    reward_xp = reward_xp + v_reward,
    profile_xp_earned = profile_xp_earned + v_assignment.profile_xp,
    qualifying_days = qualifying_days + CASE WHEN v_first_today THEN 1 ELSE 0 END,
    last_qualifying_day = v_day,
    updated_at = v_now
    WHERE user_id = p_user_id;
  UPDATE public.profiles SET
    total_xp = COALESCE(total_xp, 0) + v_assignment.profile_xp,
    engagement_profile_xp = engagement_profile_xp + v_assignment.profile_xp
    WHERE id = p_user_id;
  v_receipt := jsonb_build_object('action', 'complete_mission',
    'assignmentId', v_assignment.id, 'missionKey', v_assignment.mission_key,
    'profileXpAwarded', v_assignment.profile_xp, 'rewardXpAwarded', v_reward,
    'qualifyingDayAdded', v_first_today, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'complete_mission', v_source, v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state_impl(p_user_id));
END;
$$;

-- -----------------------------------------------------------------------------
-- E) RE-ASSERT THE GRANT BOUNDARY
--    CREATE OR REPLACE keeps existing privileges, but restate them so this
--    migration is self-sufficient if ever applied to a fresh database.
--    The internal implementations stay unreachable by every client role and the
--    original privileged RPCs stay service-role only.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.svj_start_daily_mission_impl(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_complete_daily_mission_impl(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_start_daily_mission(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_complete_daily_mission(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_start_daily_mission(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_complete_daily_mission(uuid, uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.svj_start_my_daily_mission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_complete_my_daily_mission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_start_my_daily_mission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_complete_my_daily_mission(uuid, uuid, text) TO authenticated;

-- The one-open-session invariant stays in place as defence in depth.
-- (No DROP/CREATE of reward_one_open_session_per_user in this migration.)

NOTIFY pgrst, 'reload schema';
