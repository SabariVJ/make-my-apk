-- ============================================================================
-- SVJ Earn Plus self-service authenticated RPC layer  (CORRECTED ARCHITECTURE)
--
-- ⚠️  TARGET DATABASE: oltmnrkceodpyqznfhjb (Lovable Cloud / live SVJ backend)
--   Do NOT apply to any other project.
--
-- WHY THIS EXISTS
--   The Earn Plus server functions called the service-role-only reward RPCs
--   through requireAdminKey() + supabaseAdmin. The Lovable-managed backend
--   does not expose a service-role key, so every normal authenticated Earn
--   Plus screen load failed. The original RPCs keep their strict
--   svj_assert_reward_service_role() gate; a SECURITY DEFINER wrapper does
--   NOT convert an authenticated JWT role to service_role, so simply wrapping
--   them (the first draft of this migration) still raised
--   SVJ_REWARD_SERVICE_ROLE_REQUIRED for real authenticated callers.
--
-- THE CORRECTED ARCHITECTURE
--   The reward BUSINESS LOGIC is extracted into internal *_impl functions
--   that contain no role assertion and accept an already-verified target
--   user id. Two, and only two, secure entry points call them:
--
--     1. The ORIGINAL service-role RPCs (unchanged signatures):
--        assert service role → delegate to the impl with p_user_id.
--        They keep their service-role-only EXECUTE grants.
--     2. NEW self-service RPCs: caller_id := auth.uid() (never a client
--        argument) → delegate to the SAME impl with caller_id.
--
--   The impl functions are REVOKEd from PUBLIC, anon, AND authenticated —
--   no role can execute them directly; access flows only through the two
--   entry-point families. The svj.trusted_server_write GUC is set inside the
--   SECURITY DEFINER impl transaction (a server-controlled setting that no
--   browser call path can reach — PostgREST callers cannot set arbitrary
--   custom GUCs, and the impls set it unconditionally from trusted server
--   code, never from client input) so the profile-protection triggers that
--   already honor it (20260904183000, and protect_engagement_profile_xp as
--   amended in supabase/pending) accept the XP/membership writes exactly as
--   they did under the service role.
--
--   NO economics, policy values, ledger rules, lock order, idempotency keys,
--   timezone math, or replay behavior is changed. No table, wallet, ledger
--   row, or membership history is touched. Additive + idempotent:
--   re-applying will not duplicate or clobber anything.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 0) INTERNAL IMPLEMENTATIONS — business logic only, no role assertion.
--    Declaration order note: PL/pgSQL validates %ROWTYPE references at
--    compile time, so the impl helpers the state reader depends on are
--    declared first; the state reader itself is forward-referenced by the
--    mutation impls and is compiled after them.
-- ─────────────────────────────────────────────────────────────────────────

-- Verified-identity resolution, assertion-free internal form.
CREATE OR REPLACE FUNCTION public.svj_reward_identity_impl(p_user_id uuid)
RETURNS TABLE (verified boolean, verified_identity text, account_created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY SELECT
    (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL),
    coalesce(
      CASE WHEN u.email_confirmed_at IS NOT NULL THEN 'email:' || lower(u.email) END,
      CASE WHEN u.phone_confirmed_at IS NOT NULL THEN 'phone:' || u.phone END
    ),
    u.created_at
  FROM auth.users u WHERE u.id = p_user_id;
END;
$$;

-- Replay/idempotency lookup, assertion-free internal form.
CREATE OR REPLACE FUNCTION public.svj_replay_reward_operation_impl(
  p_user_id uuid, p_request_id uuid, p_action text, p_source_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_op public.reward_operations%ROWTYPE;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED'; END IF;
  SELECT * INTO v_op FROM public.reward_operations
    WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_op.action <> p_action OR v_op.source_key <> p_source_key THEN
      RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REUSED';
    END IF;
    RETURN v_op.receipt;
  END IF;
  SELECT * INTO v_op FROM public.reward_operations
    WHERE user_id = p_user_id AND action = p_action AND source_key = p_source_key;
  -- A one-time redemption must report ALREADY_REDEEMED for a new retry key;
  -- replay only the exact request ID that may have timed out after commit.
  IF FOUND AND p_action <> 'redeem_plus' THEN RETURN v_op.receipt; END IF;
  RETURN NULL;
END;
$$;

-- Lock order: policy -> wallet -> profile. All grant checks use the DB clock.
CREATE OR REPLACE FUNCTION public.svj_lock_reward_wallet_impl(
  p_user_id uuid, p_claim boolean DEFAULT false
)
RETURNS public.reward_wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_policy public.reward_policies%ROWTYPE;
  v_wallet public.reward_wallets%ROWTYPE;
  v_verified boolean;
BEGIN
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  SELECT * INTO v_policy FROM public.reward_policies
    WHERE campaign_id = 'earned-plus-launch-v1' FOR SHARE;
  IF NOT FOUND OR NOT v_policy.enabled
     OR v_policy.launched_at IS NULL OR v_policy.launched_at > clock_timestamp() THEN
    RAISE EXCEPTION 'SVJ_REWARD_NOT_ENABLED';
  END IF;
  IF p_claim AND NOT v_policy.claims_enabled THEN
    RAISE EXCEPTION 'SVJ_REWARD_CLAIMS_NOT_ENABLED';
  END IF;
  SELECT i.verified INTO v_verified
    FROM public.svj_reward_identity_impl(p_user_id) AS i;
  IF NOT COALESCE(v_verified, false) THEN
    RAISE EXCEPTION 'SVJ_REWARD_ACCOUNT_NOT_VERIFIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'SVJ_REWARD_PROFILE_NOT_FOUND';
  END IF;
  INSERT INTO public.reward_wallets (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.reward_wallets
    WHERE user_id = p_user_id FOR UPDATE;
  RETURN v_wallet;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) STATE + MUTATION IMPLEMENTATIONS
--    Direct ports of the original function bodies with the service-role
--    assertion removed; all rules are preserved.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.svj_get_engagement_state_impl(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_policy public.reward_policies%ROWTYPE;
  v_wallet public.reward_wallets%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_verified boolean := false;
  v_identity text;
  v_created_at timestamptz;
  v_day date;
  v_next_reset timestamptz;
  v_account_age integer := 0;
  v_redeemed boolean := false;
  v_missions jsonb;
  v_ledger jsonb;
  v_reasons text[] := ARRAY[]::text[];
  v_earned_today integer := 0;
BEGIN
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  SELECT * INTO v_policy FROM public.reward_policies
    WHERE campaign_id = 'earned-plus-launch-v1';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'setup_required', 'userId', p_user_id,
      'message', 'Earn Plus database setup is pending.');
  END IF;
  v_day := (v_now AT TIME ZONE v_policy.reward_timezone)::date;
  v_next_reset := ((v_day + 1)::timestamp AT TIME ZONE v_policy.reward_timezone);
  SELECT i.verified, i.verified_identity, i.account_created_at
    INTO v_verified, v_identity, v_created_at
    FROM public.svj_reward_identity_impl(p_user_id) AS i;
  IF v_created_at IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_ACCOUNT_NOT_FOUND'; END IF;
  v_account_age := GREATEST(0, floor(extract(epoch FROM (v_now - v_created_at)) / 86400)::integer);

  SELECT * INTO v_wallet FROM public.reward_wallets WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    v_wallet.user_id := p_user_id;
    v_wallet.reward_xp := 0;
    v_wallet.profile_xp_earned := 0;
    v_wallet.qualifying_days := 0;
    v_wallet.current_login_streak := 0;
    v_wallet.best_login_streak := 0;
    v_wallet.last_checkin_day := NULL;
  END IF;
  v_wallet.reward_xp := COALESCE(v_wallet.reward_xp, 0);
  v_wallet.profile_xp_earned := COALESCE(v_wallet.profile_xp_earned, 0);
  v_wallet.qualifying_days := COALESCE(v_wallet.qualifying_days, 0);
  v_wallet.current_login_streak := COALESCE(v_wallet.current_login_streak, 0);
  v_wallet.best_login_streak := COALESCE(v_wallet.best_login_streak, 0);

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_PROFILE_NOT_FOUND'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.reward_redemptions WHERE user_id = p_user_id)
    INTO v_redeemed;

  SELECT coalesce(jsonb_agg(m ORDER BY m->>'key'), '[]'::jsonb) INTO v_missions
    FROM (
      SELECT jsonb_build_object(
        'key', d.mission_key,
        'title', d.title,
        'description', d.description,
        'category', d.category,
        'minimumMinutes', ceil(d.minimum_seconds / 60.0),
        'rewardXp', d.reward_xp,
        'profileXp', d.profile_xp,
        'assignmentId', a.id,
        'startedAt', s.started_at,
        'eligibleAt', s.eligible_at,
        'expiresAt', s.expires_at,
        'completedAt', a.completed_at,
        'status', CASE
          WHEN a.id IS NULL THEN 'available'
          WHEN a.completed_at IS NOT NULL THEN 'completed'
          WHEN s.started_at IS NULL THEN 'assigned'
          WHEN s.expires_at IS NOT NULL AND s.expires_at <= v_now THEN 'expired'
          WHEN s.eligible_at IS NOT NULL AND s.eligible_at <= v_now THEN 'ready'
          ELSE 'running'
        END
      ) AS m
      FROM public.reward_mission_definitions d
      LEFT JOIN public.reward_mission_assignments a
        ON a.mission_key = d.mission_key AND a.definition_version = d.version
       AND a.user_id = p_user_id AND a.policy_day = v_day
      LEFT JOIN public.reward_mission_sessions s ON s.assignment_id = a.id
      WHERE d.active
    ) missions_today;

  SELECT coalesce(jsonb_agg(l ORDER BY l->>'createdAt' DESC), '[]'::jsonb) INTO v_ledger
    FROM (
      SELECT jsonb_build_object(
        'id', x.id,
        'kind', x.kind,
        'policyDay', x.policy_day,
        'profileXpDelta', x.profile_xp_delta,
        'rewardXpDelta', x.reward_xp_delta,
        'createdAt', x.created_at
      ) AS l
      FROM public.reward_xp_ledger x
      WHERE x.user_id = p_user_id AND x.campaign_id = v_policy.campaign_id
      ORDER BY x.created_at DESC LIMIT 20
    ) recent_ledger;

  SELECT COALESCE(sum(reward_xp_delta), 0)::integer INTO v_earned_today
    FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND campaign_id = v_policy.campaign_id
      AND policy_day = v_day AND kind = 'mission_completion';

  IF NOT v_policy.enabled THEN
    v_reasons := array_append(v_reasons, 'Earn Plus is currently disabled.');
  END IF;
  IF NOT v_verified THEN
    v_reasons := array_append(v_reasons, 'Verify your email or phone number to claim.');
  END IF;
  IF v_account_age < v_policy.required_account_age_days THEN
    v_reasons := array_append(v_reasons,
      format('Your account must be at least %s days old.', v_policy.required_account_age_days));
  END IF;
  IF v_wallet.qualifying_days < v_policy.required_qualifying_days THEN
    v_reasons := array_append(v_reasons,
      format('Reach %s qualifying days. You have %s.',
        v_policy.required_qualifying_days, v_wallet.qualifying_days));
  END IF;
  IF v_wallet.reward_xp < v_policy.reward_xp_cost THEN
    v_reasons := array_append(v_reasons,
      format('Reward XP: %s of %s.', v_wallet.reward_xp, v_policy.reward_xp_cost));
  END IF;
  IF v_redeemed THEN
    v_reasons := array_append(v_reasons, 'This launch reward has already been claimed.');
  END IF;
  IF v_profile.is_plus_member AND v_profile.plus_expires_at IS NULL THEN
    v_reasons := array_append(v_reasons, 'Lifetime access is already active.');
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_policy.enabled THEN 'ready' ELSE 'disabled' END,
    'userId', p_user_id, 'serverNow', v_now, 'nextResetAt', v_next_reset,
    'policyDay', v_day,
    'policy', jsonb_build_object(
      'enabled', v_policy.enabled, 'claimsEnabled', v_policy.claims_enabled,
      'rewardXpCost', v_policy.reward_xp_cost,
      'requiredQualifyingDays', v_policy.required_qualifying_days,
      'requiredAccountAgeDays', v_policy.required_account_age_days,
      'dailyRewardXpCap', v_policy.daily_reward_xp_cap,
      'checkinProfileXp', v_policy.checkin_profile_xp,
      'milestoneDays', v_policy.streak_milestone_days,
      'milestoneProfileXp', v_policy.streak_milestone_profile_xp,
      'plusDays', v_policy.plus_days
    ),
    'wallet', jsonb_build_object(
      'rewardXp', v_wallet.reward_xp, 'profileXpEarned', v_wallet.profile_xp_earned,
      'qualifyingDays', v_wallet.qualifying_days,
      'currentLoginStreak', CASE
        WHEN v_wallet.last_checkin_day IS NULL OR v_wallet.last_checkin_day < v_day - 1 THEN 0
        ELSE v_wallet.current_login_streak END,
      'bestLoginStreak', v_wallet.best_login_streak,
      'checkedInToday', COALESCE(v_wallet.last_checkin_day = v_day, false),
      'rewardXpToday', v_earned_today,
      'missionsCompletedToday', (
        SELECT count(*)::integer FROM public.reward_mission_assignments
        WHERE user_id = p_user_id AND policy_day = v_day AND completed_at IS NOT NULL
      ),
      'profileTotalXp', COALESCE(v_profile.total_xp, 0)
    ),
    'account', jsonb_build_object(
      'verified', v_verified, 'ageDays', v_account_age,
      'plusActive', v_profile.is_plus_member
        AND (v_profile.plus_expires_at IS NULL OR v_profile.plus_expires_at > v_now),
      'lifetimeAccess', v_profile.is_plus_member AND v_profile.plus_expires_at IS NULL,
      'plusExpiresAt', v_profile.plus_expires_at, 'alreadyRedeemed', v_redeemed
    ),
    'eligibility', jsonb_build_object(
      'canClaim', cardinality(v_reasons) = 0, 'reasons', to_jsonb(v_reasons)
    ),
    'missions', v_missions, 'ledger', v_ledger
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_claim_daily_checkin_impl(
  p_user_id uuid, p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_policy public.reward_policies%ROWTYPE;
  v_wallet public.reward_wallets%ROWTYPE;
  v_day date;
  v_replay jsonb;
  v_streak integer;
  v_bonus integer := 0;
  v_receipt jsonb;
BEGIN
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  v_wallet := public.svj_lock_reward_wallet_impl(p_user_id);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_day := (v_now AT TIME ZONE v_policy.reward_timezone)::date;
  v_replay := public.svj_replay_reward_operation_impl(p_user_id, p_request_id, 'checkin', v_day::text);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state_impl(p_user_id));
  END IF;
  v_streak := CASE WHEN v_wallet.last_checkin_day = v_day - 1
    THEN v_wallet.current_login_streak + 1 ELSE 1 END;
  IF v_streak % v_policy.streak_milestone_days = 0 THEN
    v_bonus := v_policy.streak_milestone_profile_xp;
  END IF;
  INSERT INTO public.reward_daily_checkins (
    user_id, policy_day, streak_after, profile_xp_awarded, checked_in_at
  ) VALUES (p_user_id, v_day, v_streak, v_policy.checkin_profile_xp + v_bonus, v_now);
  INSERT INTO public.reward_xp_ledger (
    user_id, campaign_id, policy_day, kind, source_key, profile_xp_delta, created_at
  ) VALUES (p_user_id, v_policy.campaign_id, v_day, 'daily_checkin', v_day::text,
    v_policy.checkin_profile_xp, v_now);
  IF v_bonus > 0 THEN
    INSERT INTO public.reward_xp_ledger (
      user_id, campaign_id, policy_day, kind, source_key, profile_xp_delta, created_at, metadata
    ) VALUES (p_user_id, v_policy.campaign_id, v_day, 'streak_milestone', v_day::text,
      v_bonus, v_now, jsonb_build_object('streak', v_streak));
  END IF;
  UPDATE public.reward_wallets SET
    profile_xp_earned = profile_xp_earned + v_policy.checkin_profile_xp + v_bonus,
    current_login_streak = v_streak, best_login_streak = GREATEST(best_login_streak, v_streak),
    last_checkin_day = v_day, updated_at = v_now
    WHERE user_id = p_user_id;
  -- Existing challenge streaks and historical XP are never reset.
  UPDATE public.profiles SET
    total_xp = COALESCE(total_xp, 0) + v_policy.checkin_profile_xp + v_bonus,
    engagement_profile_xp = engagement_profile_xp + v_policy.checkin_profile_xp + v_bonus
    WHERE id = p_user_id;
  v_receipt := jsonb_build_object('action', 'checkin', 'policyDay', v_day,
    'profileXpAwarded', v_policy.checkin_profile_xp + v_bonus, 'rewardXpAwarded', 0,
    'streak', v_streak, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'checkin', v_day::text, v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state_impl(p_user_id));
END;
$$;

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
  IF EXISTS (
    SELECT 1 FROM public.reward_mission_assignments a
    JOIN public.reward_mission_sessions s ON s.assignment_id = a.id
    WHERE a.user_id = p_user_id AND a.policy_day = v_day
      AND a.completed_at IS NULL AND s.expires_at > v_now AND s.started_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'SVJ_REWARD_MISSION_RUNNING'; END IF;
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
  SELECT * INTO v_assignment FROM public.reward_mission_assignments
    WHERE id = p_assignment_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_ASSIGNMENT_NOT_FOUND'; END IF;
  IF v_assignment.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_ASSIGNMENT_COMPLETED';
  END IF;
  IF v_assignment.policy_day <> v_day THEN RAISE EXCEPTION 'SVJ_REWARD_ASSIGNMENT_EXPIRED'; END IF;
  SELECT * INTO v_session FROM public.reward_mission_sessions
    WHERE assignment_id = v_assignment.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_ASSIGNMENT_NOT_FOUND'; END IF;
  IF v_session.started_at IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_MISSION_NOT_STARTED'; END IF;
  IF v_session.expires_at IS NOT NULL AND v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'SVJ_REWARD_MISSION_EXPIRED';
  END IF;
  IF v_session.eligible_at IS NOT NULL AND v_session.eligible_at > v_now THEN
    RAISE EXCEPTION 'SVJ_REWARD_MISSION_TOO_EARLY';
  END IF;
  IF p_confirmation_text IS NULL OR length(btrim(p_confirmation_text)) < 20
     OR length(p_confirmation_text) > 500 THEN
    RAISE EXCEPTION 'SVJ_REWARD_CONFIRMATION_REQUIRED';
  END IF;
  SELECT COALESCE(sum(reward_xp_delta), 0)::integer INTO v_earned_today
    FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND campaign_id = v_policy.campaign_id
      AND policy_day = v_day AND kind = 'mission_completion';
  v_cap_room := v_policy.daily_reward_xp_cap - v_earned_today;
  IF v_cap_room <= 0 THEN RAISE EXCEPTION 'SVJ_REWARD_DAILY_CAP_REACHED'; END IF;
  v_reward := least(v_cap_room, v_assignment.reward_xp);
  UPDATE public.reward_mission_assignments SET completed_at = v_now
    WHERE id = v_assignment.id;
  INSERT INTO public.reward_xp_ledger (
    user_id, campaign_id, policy_day, kind, source_key,
    reward_xp_delta, profile_xp_delta, created_at
  ) VALUES (
    p_user_id, v_policy.campaign_id, v_day, 'mission_completion',
    v_assignment.id::text, v_reward, v_assignment.profile_xp, v_now
  );
  UPDATE public.reward_wallets SET
    reward_xp = reward_xp + v_reward,
    profile_xp_earned = profile_xp_earned + v_assignment.profile_xp,
    qualifying_days = qualifying_days + 1,
    updated_at = v_now
    WHERE user_id = p_user_id;
  UPDATE public.profiles SET
    total_xp = COALESCE(total_xp, 0) + v_assignment.profile_xp,
    engagement_profile_xp = engagement_profile_xp + v_assignment.profile_xp
    WHERE id = p_user_id;
  v_receipt := jsonb_build_object('action', 'complete_mission',
    'assignmentId', v_assignment.id, 'missionKey', v_assignment.mission_key,
    'profileXpAwarded', v_assignment.profile_xp, 'rewardXpAwarded', v_reward,
    'qualifyingDayAdded', true, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'complete_mission', v_source, v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state_impl(p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_redeem_earned_plus_impl(
  p_user_id uuid, p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_policy public.reward_policies%ROWTYPE;
  v_wallet public.reward_wallets%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_identity text;
  v_created_at timestamptz;
  v_age integer;
  v_replay jsonb;
  v_expires timestamptz;
  v_id uuid;
  v_receipt jsonb;
  v_ledger_balance integer;
  v_ledger_days integer;
BEGIN
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  v_wallet := public.svj_lock_reward_wallet_impl(p_user_id, true);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_replay := public.svj_replay_reward_operation_impl(
    p_user_id, p_request_id, 'redeem_plus', 'earned-plus-launch-v1');
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state_impl(p_user_id));
  END IF;
  SELECT i.verified_identity, i.account_created_at INTO v_identity, v_created_at
    FROM public.svj_reward_identity_impl(p_user_id) AS i;
  -- Accounts sharing a verified email/phone serialize before the unique
  -- identity check, so two simultaneous claims cannot race into a raw
  -- duplicate-key error or spend both wallets.
  PERFORM pg_advisory_xact_lock(hashtext(v_identity));
  v_age := GREATEST(0, floor(extract(epoch FROM (v_now - v_created_at)) / 86400)::integer);
  IF v_age < v_policy.required_account_age_days THEN RAISE EXCEPTION 'SVJ_REWARD_ACCOUNT_TOO_NEW'; END IF;
  IF EXISTS (SELECT 1 FROM public.reward_redemptions
    WHERE user_id = p_user_id OR verified_identity = v_identity) THEN
    RAISE EXCEPTION 'SVJ_REWARD_ALREADY_REDEEMED';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_profile.is_plus_member AND v_profile.plus_expires_at IS NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_LIFETIME_ALREADY_ACTIVE';
  END IF;
  IF v_wallet.qualifying_days < v_policy.required_qualifying_days THEN
    RAISE EXCEPTION 'SVJ_REWARD_QUALIFYING_DAYS_REQUIRED';
  END IF;
  IF v_wallet.reward_xp < v_policy.reward_xp_cost THEN RAISE EXCEPTION 'SVJ_REWARD_XP_REQUIRED'; END IF;

  SELECT COALESCE(sum(reward_xp_delta), 0)::integer,
    count(DISTINCT policy_day) FILTER (WHERE kind = 'mission_completion')::integer
    INTO v_ledger_balance, v_ledger_days
    FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND campaign_id = v_policy.campaign_id;
  IF v_wallet.reward_xp <> v_ledger_balance OR v_wallet.qualifying_days <> v_ledger_days THEN
    RAISE EXCEPTION 'SVJ_REWARD_LEDGER_MISMATCH';
  END IF;

  v_expires := CASE WHEN v_profile.is_plus_member AND v_profile.plus_expires_at > v_now
    THEN v_profile.plus_expires_at ELSE v_now END + make_interval(days => v_policy.plus_days);
  INSERT INTO public.reward_redemptions (
    user_id, verified_identity, campaign_id, reward_xp_spent, plus_starts_at, plus_expires_at, created_at
  ) VALUES (p_user_id, v_identity, v_policy.campaign_id, v_policy.reward_xp_cost,
    v_now, v_expires, v_now) RETURNING id INTO v_id;
  INSERT INTO public.reward_xp_ledger (
    user_id, campaign_id, policy_day, kind, source_key,
    reward_xp_delta, profile_xp_delta, created_at, metadata
  ) VALUES (
    p_user_id, v_policy.campaign_id, (v_now AT TIME ZONE v_policy.reward_timezone)::date,
    'earned_plus_redemption', v_id::text, -v_policy.reward_xp_cost, 0, v_now,
    jsonb_build_object('plusDays', v_policy.plus_days)
  );
  UPDATE public.reward_wallets SET reward_xp = reward_xp - v_policy.reward_xp_cost,
    updated_at = v_now WHERE user_id = p_user_id;
  -- The trusted-write GUC is set inside this SECURITY DEFINER transaction, so
  -- the profile-protection triggers accept this server-computed membership
  -- update exactly as they did under the service role. Failure here rolls
  -- back the debit AND the redemption.
  UPDATE public.profiles SET is_plus_member = true,
    plus_unlocked_at = COALESCE(plus_unlocked_at, v_now), plus_expires_at = v_expires
    WHERE id = p_user_id;
  v_receipt := jsonb_build_object('action', 'redeem_plus', 'redemptionId', v_id,
    'rewardXpSpent', v_policy.reward_xp_cost, 'plusExpiresAt', v_expires, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'redeem_plus', 'earned-plus-launch-v1', v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state_impl(p_user_id));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) ORIGINAL SERVICE-ROLE RPCs — same signatures, same strict assertion,
--    now thin delegators to the internal implementations.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.svj_get_engagement_state(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN public.svj_get_engagement_state_impl(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_claim_daily_checkin(p_user_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN public.svj_claim_daily_checkin_impl(p_user_id, p_request_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_start_daily_mission(p_user_id uuid, p_request_id uuid, p_mission_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN public.svj_start_daily_mission_impl(p_user_id, p_request_id, p_mission_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_complete_daily_mission(p_user_id uuid, p_request_id uuid, p_assignment_id uuid, p_confirmation_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN public.svj_complete_daily_mission_impl(p_user_id, p_request_id, p_assignment_id, p_confirmation_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_redeem_earned_plus(p_user_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN public.svj_redeem_earned_plus_impl(p_user_id, p_request_id);
END;
$$;

-- The assertion-aware internal helpers keep their original service-role gate
-- so any other privileged caller path keeps working exactly as before.
CREATE OR REPLACE FUNCTION public.svj_reward_identity(p_user_id uuid)
RETURNS TABLE (verified boolean, verified_identity text, account_created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN QUERY SELECT * FROM public.svj_reward_identity_impl(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_replay_reward_operation(
  p_user_id uuid, p_request_id uuid, p_action text, p_source_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN public.svj_replay_reward_operation_impl(p_user_id, p_request_id, p_action, p_source_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_lock_reward_wallet(p_user_id uuid, p_claim boolean DEFAULT false)
RETURNS public.reward_wallets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN public.svj_lock_reward_wallet_impl(p_user_id, p_claim);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) SELF-SERVICE ENTRY POINTS — identity from auth.uid() only, never a
--    client argument. Each delegates to the SAME internal implementation
--    used by the service-role path.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.svj_get_my_engagement_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '28000';
  END IF;
  RETURN public.svj_get_engagement_state_impl(caller_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_claim_my_daily_checkin(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED'; END IF;
  RETURN public.svj_claim_daily_checkin_impl(caller_id, p_request_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_start_my_daily_mission(p_request_id uuid, p_mission_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED'; END IF;
  RETURN public.svj_start_daily_mission_impl(caller_id, p_request_id, p_mission_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_complete_my_daily_mission(
  p_request_id uuid, p_assignment_id uuid, p_confirmation_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL OR p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED';
  END IF;
  RETURN public.svj_complete_daily_mission_impl(caller_id, p_request_id, p_assignment_id, p_confirmation_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_redeem_my_earned_plus(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required' USING ERRCODE = '28000';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED'; END IF;
  RETURN public.svj_redeem_earned_plus_impl(caller_id, p_request_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) LOCKDOWN — no role executes the internals directly; original RPCs stay
--    service-role-only; self-service entry points are authenticated-only.
-- ─────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.svj_get_engagement_state_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_reward_identity_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_replay_reward_operation_impl(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_lock_reward_wallet_impl(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_claim_daily_checkin_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_start_daily_mission_impl(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_complete_daily_mission_impl(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_redeem_earned_plus_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.svj_get_engagement_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_claim_daily_checkin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_start_daily_mission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_complete_daily_mission(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_redeem_earned_plus(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_reward_identity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_replay_reward_operation(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_lock_reward_wallet(uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.svj_get_engagement_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_claim_daily_checkin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_start_daily_mission(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_complete_daily_mission(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_redeem_earned_plus(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.svj_get_my_engagement_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_claim_my_daily_checkin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_start_my_daily_mission(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_complete_my_daily_mission(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_redeem_my_earned_plus(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.svj_get_my_engagement_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_claim_my_daily_checkin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_start_my_daily_mission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_complete_my_daily_mission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_redeem_my_earned_plus(uuid) TO authenticated;

COMMIT;

-- PostgREST caches function signatures; refresh so the new RPCs are visible.
NOTIFY pgrst, 'reload schema';
