-- ============================================================================
-- SVJ EMERGENCY HOTFIX — Earn Plus self-service authenticated RPC layer
--
-- ⚠️  TARGET DATABASE: oltmnrkceodpyqznfhjb (Lovable Cloud / live SVJ backend)
--   Do NOT apply to any other project.
--
-- WHY THIS EXISTS
--   The Earn Plus server functions (src/lib/engagement.server.ts) called the
--   original service-role-only RPCs (svj_get_engagement_state(uuid), etc.)
--   through requireAdminKey() + supabaseAdmin. The Lovable-managed backend
--   does not expose a service-role key, so every normal authenticated Earn
--   Plus screen load failed with
--     "Rewards are temporarily unavailable. Your confirmed progress is safe;
--      try again."
--   Membership (svj_get_my_membership) and the 60-Day challenge
--   (svj_get_my_challenge_state, …) already have self-service equivalents.
--   This migration adds the same compatibility layer for Earn Plus.
--
-- THE FIX
--   Thin SECURITY DEFINER wrappers that derive identity from auth.uid() only
--   and delegate to the EXISTING reward logic. No reward economics, policy
--   value, ledger rule, idempotency key, lock order, or grant/revoke on any
--   pre-existing object is changed. The original service-role RPCs and the
--   strict svj_assert_reward_service_role() gate remain untouched so nothing
--   else is weakened.
--
--   Wrapper bodies run with LOCAL search_path = '' while explicitly
--   schema-qualifying every object they touch, mirroring the original
--   functions' hardening. The trusted-write GUC that the profile-protection
--   triggers already honor (svj.trusted_server_write) is set inside the same
--   transaction so the delegates' own profile XP/membership updates keep
--   working exactly as they did under the service role.
--
-- ADDITIVE + IDEMPOTENT: CREATE OR REPLACE + conditional grants only. No
-- table, wallet, ledger row, policy row, or membership history is touched.
--
-- GRANTS: REVOKE from PUBLIC + anon; EXECUTE to authenticated only. Anonymous
-- callers get no function visibility; auth.uid() is re-asserted defensively
-- inside every wrapper.
-- ============================================================================

BEGIN;

-- ── 1) Read-only engagement state for the caller ───────────────────────────
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
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  RETURN public.svj_get_engagement_state(caller_id);
END;
$$;

-- ── 2) Daily check-in (request-receipt idempotent via existing ops table) ──
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
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED';
  END IF;
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  RETURN public.svj_claim_daily_checkin(caller_id, p_request_id);
END;
$$;

-- ── 3) Start a daily mission (server clock, one active mission preserved) ──
CREATE OR REPLACE FUNCTION public.svj_start_my_daily_mission(
  p_request_id uuid,
  p_mission_key text
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
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED';
  END IF;
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  RETURN public.svj_start_daily_mission(caller_id, p_request_id, p_mission_key);
END;
$$;

-- ── 4) Complete a daily mission (minimum timing/expiry validated by the
--       original delegate; assignment ownership enforced there) ────────────
CREATE OR REPLACE FUNCTION public.svj_complete_my_daily_mission(
  p_request_id uuid,
  p_assignment_id uuid,
  p_confirmation_text text
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
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  RETURN public.svj_complete_daily_mission(
    caller_id, p_request_id, p_assignment_id, p_confirmation_text);
END;
$$;

-- ── 5) Earned Plus redemption (one-time, policy-gated, ledger-verified) ────
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
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED';
  END IF;
  PERFORM set_config('svj.trusted_server_write', 'on', true);
  RETURN public.svj_redeem_earned_plus(caller_id, p_request_id);
END;
$$;

-- ── Privileges: authenticated-only, never anon, never PUBLIC ──────────────
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

-- PostgREST schema cache reload (safe to run manually after deployment):
-- NOTIFY pgrst, 'reload schema';
