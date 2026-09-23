-- SVJ Earned Plus. REVIEW ONLY: not an automatic migration.
-- Apply to an isolated database first. Live schema/activation requires approval.
-- Both earning and claiming are disabled by default. Existing XP is not imported.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_profile_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plus_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.reward_policies (
  campaign_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  claims_enabled boolean NOT NULL DEFAULT false,
  reward_timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  reward_xp_cost integer NOT NULL CHECK (reward_xp_cost > 0),
  required_qualifying_days integer NOT NULL CHECK (required_qualifying_days > 0),
  required_account_age_days integer NOT NULL CHECK (required_account_age_days > 0),
  daily_reward_xp_cap integer NOT NULL CHECK (daily_reward_xp_cap > 0),
  checkin_profile_xp integer NOT NULL CHECK (checkin_profile_xp >= 0),
  streak_milestone_days integer NOT NULL CHECK (streak_milestone_days > 0),
  streak_milestone_profile_xp integer NOT NULL CHECK (streak_milestone_profile_xp >= 0),
  plus_days integer NOT NULL CHECK (plus_days > 0),
  launched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR launched_at IS NOT NULL),
  CHECK (NOT claims_enabled OR enabled)
);
INSERT INTO public.reward_policies (
  campaign_id, reward_xp_cost, required_qualifying_days, required_account_age_days,
  daily_reward_xp_cap, checkin_profile_xp, streak_milestone_days,
  streak_milestone_profile_xp, plus_days
) VALUES ('earned-plus-launch-v1', 3000, 21, 21, 150, 10, 7, 30, 30)
ON CONFLICT (campaign_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.reward_mission_definitions (
  mission_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 240),
  category text NOT NULL CHECK (category IN ('Physical', 'Discipline', 'Mental', 'Mindset')),
  minimum_seconds integer NOT NULL CHECK (minimum_seconds BETWEEN 60 AND 7200),
  reward_xp integer NOT NULL CHECK (reward_xp > 0),
  profile_xp integer NOT NULL CHECK (profile_xp >= 0),
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL,
  PRIMARY KEY (mission_key, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_one_active_definition_per_key
  ON public.reward_mission_definitions (mission_key) WHERE active;
INSERT INTO public.reward_mission_definitions (
  mission_key, version, title, description, category,
  minimum_seconds, reward_xp, profile_xp, display_order
) VALUES
  ('intentional-movement', 1, 'Move With Intention',
   'Complete a focused movement, training, walk, or mobility session.',
   'Physical', 600, 50, 50, 10),
  ('focused-practice', 1, 'Focused Practice',
   'Work without switching tasks on one useful skill, project, or study goal.',
   'Discipline', 900, 50, 50, 20),
  ('plan-and-reflect', 1, 'Plan & Reflect',
   'Review what mattered today and write the next concrete step.',
   'Mindset', 300, 50, 50, 30)
ON CONFLICT (mission_key, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.reward_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_xp integer NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  profile_xp_earned integer NOT NULL DEFAULT 0 CHECK (profile_xp_earned >= 0),
  qualifying_days integer NOT NULL DEFAULT 0 CHECK (qualifying_days >= 0),
  last_qualifying_day date,
  current_login_streak integer NOT NULL DEFAULT 0 CHECK (current_login_streak >= 0),
  best_login_streak integer NOT NULL DEFAULT 0 CHECK (best_login_streak >= 0),
  last_checkin_day date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reward_daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_day date NOT NULL,
  streak_after integer NOT NULL CHECK (streak_after > 0),
  profile_xp_awarded integer NOT NULL CHECK (profile_xp_awarded >= 0),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, policy_day)
);
CREATE TABLE IF NOT EXISTS public.reward_mission_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_day date NOT NULL,
  mission_key text NOT NULL,
  definition_version integer NOT NULL,
  minimum_seconds integer NOT NULL CHECK (minimum_seconds BETWEEN 60 AND 7200),
  reward_xp integer NOT NULL CHECK (reward_xp > 0),
  profile_xp integer NOT NULL CHECK (profile_xp >= 0),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (mission_key, definition_version)
    REFERENCES public.reward_mission_definitions(mission_key, version),
  UNIQUE (user_id, policy_day, mission_key)
);
CREATE TABLE IF NOT EXISTS public.reward_mission_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL UNIQUE
    REFERENCES public.reward_mission_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  eligible_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  expired_at timestamptz,
  confirmation_text text,
  CHECK (eligible_at > started_at AND expires_at > started_at),
  CHECK (NOT (completed_at IS NOT NULL AND expired_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS reward_one_open_session_per_user
  ON public.reward_mission_sessions (user_id)
  WHERE completed_at IS NULL AND expired_at IS NULL;

CREATE TABLE IF NOT EXISTS public.reward_xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES public.reward_policies(campaign_id),
  policy_day date NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'daily_checkin', 'streak_milestone', 'mission_completion', 'earned_plus_redemption'
  )),
  source_key text NOT NULL,
  reward_xp_delta integer NOT NULL DEFAULT 0,
  profile_xp_delta integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, kind, source_key),
  CHECK (
    (kind = 'mission_completion' AND reward_xp_delta > 0 AND profile_xp_delta >= 0) OR
    (kind = 'daily_checkin' AND reward_xp_delta = 0 AND profile_xp_delta >= 0) OR
    (kind = 'streak_milestone' AND reward_xp_delta = 0 AND profile_xp_delta > 0) OR
    (kind = 'earned_plus_redemption' AND reward_xp_delta < 0 AND profile_xp_delta = 0)
  )
);
CREATE INDEX IF NOT EXISTS reward_ledger_user_created_idx
  ON public.reward_xp_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reward_ledger_user_day_idx
  ON public.reward_xp_ledger (user_id, policy_day);

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_identity text NOT NULL UNIQUE,
  campaign_id text NOT NULL REFERENCES public.reward_policies(campaign_id),
  reward_xp_spent integer NOT NULL CHECK (reward_xp_spent > 0),
  plus_starts_at timestamptz NOT NULL,
  plus_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (plus_expires_at > plus_starts_at)
);
-- Unique user/verified-identity constraints are independent of policy version.
CREATE TABLE IF NOT EXISTS public.reward_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('checkin', 'start_mission', 'complete_mission', 'redeem_plus')),
  source_key text NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id),
  UNIQUE (user_id, action, source_key)
);

-- Table privileges are scoped to these new tables, not all public objects.
DO $lockdown$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'reward_policies', 'reward_mission_definitions', 'reward_wallets',
    'reward_daily_checkins', 'reward_mission_assignments', 'reward_mission_sessions',
    'reward_xp_ledger', 'reward_redemptions', 'reward_operations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', v_table);
    IF v_table NOT IN ('reward_policies', 'reward_mission_definitions', 'reward_operations') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
      EXECUTE format('DROP POLICY IF EXISTS reward_owner_read ON public.%I', v_table);
      EXECUTE format(
        'CREATE POLICY reward_owner_read ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)',
        v_table
      );
    END IF;
  END LOOP;
END;
$lockdown$;

CREATE OR REPLACE FUNCTION public.freeze_reward_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF ROW(NEW.user_id, NEW.policy_day, NEW.mission_key, NEW.definition_version,
         NEW.minimum_seconds, NEW.reward_xp, NEW.profile_xp, NEW.assigned_at)
     IS DISTINCT FROM
     ROW(OLD.user_id, OLD.policy_day, OLD.mission_key, OLD.definition_version,
         OLD.minimum_seconds, OLD.reward_xp, OLD.profile_xp, OLD.assigned_at) THEN
    RAISE EXCEPTION 'SVJ_REWARD_ASSIGNMENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reward_assignment_freeze ON public.reward_mission_assignments;
CREATE TRIGGER reward_assignment_freeze BEFORE UPDATE ON public.reward_mission_assignments
  FOR EACH ROW EXECUTE FUNCTION public.freeze_reward_assignment();

-- Separate mirror counter prevents double-counting when a new device restores
-- profiles.total_xp, which already includes confirmed engagement grants.
CREATE OR REPLACE FUNCTION public.protect_engagement_profile_xp()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role'
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    NEW.engagement_profile_xp := OLD.engagement_profile_xp;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protect_engagement_xp ON public.profiles;
CREATE TRIGGER profiles_protect_engagement_xp BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_engagement_profile_xp();
REVOKE UPDATE (engagement_profile_xp) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.svj_assert_reward_service_role()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role'
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SVJ_REWARD_SERVICE_ROLE_REQUIRED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_reward_identity(p_user_id uuid)
RETURNS TABLE (verified boolean, verified_identity text, account_created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  RETURN QUERY SELECT
    (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL),
    CASE
      WHEN u.email_confirmed_at IS NOT NULL THEN lower(btrim(u.email))
      WHEN u.phone_confirmed_at IS NOT NULL THEN 'phone:' || btrim(u.phone)
      ELSE 'unverified:' || u.id::text
    END,
    u.created_at
  FROM auth.users AS u WHERE u.id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_replay_reward_operation(
  p_user_id uuid, p_request_id uuid, p_action text, p_source_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_op public.reward_operations%ROWTYPE;
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'SVJ_REWARD_REQUEST_REQUIRED'; END IF;
  SELECT * INTO v_op FROM public.reward_operations
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    -- Retry after midnight returns the original receipt, never another award.
    IF v_op.action <> p_action
       OR (p_action = 'complete_mission' AND v_op.source_key <> p_source_key)
       OR (p_action = 'start_mission'
           AND v_op.receipt->>'missionKey' <> split_part(p_source_key, ':', 2)) THEN
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

-- This GET is genuinely read-only: it never creates a wallet or assignment.
CREATE OR REPLACE FUNCTION public.svj_get_engagement_state(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  PERFORM public.svj_assert_reward_service_role();
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
    FROM public.svj_reward_identity(p_user_id) AS i;
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
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_PROFILE_NOT_FOUND'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.reward_redemptions
    WHERE user_id = p_user_id OR verified_identity = v_identity) INTO v_redeemed;
  SELECT COALESCE(sum(reward_xp_delta), 0)::integer INTO v_earned_today
    FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND policy_day = v_day AND reward_xp_delta > 0;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', d.mission_key,
    'title', COALESCE(original.title, d.title),
    'description', COALESCE(original.description, d.description),
    'category', COALESCE(original.category, d.category),
    'minimumMinutes', ceil(COALESCE(a.minimum_seconds, d.minimum_seconds) / 60.0)::integer,
    'rewardXp', COALESCE(a.reward_xp, d.reward_xp),
    'profileXp', COALESCE(a.profile_xp, d.profile_xp),
    'assignmentId', a.id,
    'startedAt', s.started_at, 'eligibleAt', s.eligible_at,
    'expiresAt', s.expires_at, 'completedAt', a.completed_at,
    'status', CASE
      WHEN a.completed_at IS NOT NULL THEN 'completed'
      WHEN s.id IS NULL THEN 'available'
      WHEN s.expired_at IS NOT NULL OR s.expires_at <= v_now THEN 'expired'
      WHEN s.eligible_at <= v_now THEN 'ready'
      ELSE 'running'
    END
  ) ORDER BY d.display_order), '[]'::jsonb) INTO v_missions
  FROM public.reward_mission_definitions AS d
  LEFT JOIN public.reward_mission_assignments AS a
    ON a.user_id = p_user_id AND a.policy_day = v_day AND a.mission_key = d.mission_key
  LEFT JOIN public.reward_mission_definitions AS original
    ON original.mission_key = a.mission_key AND original.version = a.definition_version
  LEFT JOIN public.reward_mission_sessions AS s ON s.assignment_id = a.id
  WHERE d.active;

  SELECT COALESCE(jsonb_agg(to_jsonb(entry) ORDER BY entry."createdAt" DESC), '[]'::jsonb)
    INTO v_ledger
  FROM (
    SELECT id, kind, reward_xp_delta AS "rewardXpDelta", profile_xp_delta AS "profileXpDelta",
      policy_day AS "policyDay", created_at AS "createdAt"
    FROM public.reward_xp_ledger WHERE user_id = p_user_id
    ORDER BY created_at DESC, id DESC LIMIT 20
  ) AS entry;

  IF NOT v_policy.enabled THEN
    v_reasons := array_append(v_reasons, 'Earn Plus is paused.');
  END IF;
  IF NOT v_policy.claims_enabled THEN
    v_reasons := array_append(v_reasons, 'Claims open after the security rollout.');
  END IF;
  IF NOT v_verified THEN
    v_reasons := array_append(v_reasons, 'Verify your email or phone number.');
  END IF;
  IF v_account_age < v_policy.required_account_age_days THEN
    v_reasons := array_append(v_reasons,
      format('Account age: %s of %s days.', v_account_age, v_policy.required_account_age_days));
  END IF;
  IF v_wallet.qualifying_days < v_policy.required_qualifying_days THEN
    v_reasons := array_append(v_reasons,
      format('Qualifying days: %s of %s.', v_wallet.qualifying_days, v_policy.required_qualifying_days));
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

-- Lock order: policy -> wallet -> profile. All grant checks use the DB clock.
CREATE OR REPLACE FUNCTION public.svj_lock_reward_wallet(p_user_id uuid, p_claim boolean DEFAULT false)
RETURNS public.reward_wallets LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_policy public.reward_policies%ROWTYPE;
  v_wallet public.reward_wallets%ROWTYPE;
  v_verified boolean;
BEGIN
  PERFORM public.svj_assert_reward_service_role();
  SELECT * INTO v_policy FROM public.reward_policies
    WHERE campaign_id = 'earned-plus-launch-v1' FOR SHARE;
  IF NOT FOUND OR NOT v_policy.enabled
     OR v_policy.launched_at IS NULL OR v_policy.launched_at > clock_timestamp() THEN
    RAISE EXCEPTION 'SVJ_REWARD_NOT_ENABLED';
  END IF;
  IF p_claim AND NOT v_policy.claims_enabled THEN
    RAISE EXCEPTION 'SVJ_REWARD_CLAIMS_NOT_ENABLED';
  END IF;
  SELECT i.verified INTO v_verified FROM public.svj_reward_identity(p_user_id) AS i;
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

CREATE OR REPLACE FUNCTION public.svj_claim_daily_checkin(p_user_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  v_wallet := public.svj_lock_reward_wallet(p_user_id);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_day := (v_now AT TIME ZONE v_policy.reward_timezone)::date;
  v_replay := public.svj_replay_reward_operation(p_user_id, p_request_id, 'checkin', v_day::text);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state(p_user_id));
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
    'state', public.svj_get_engagement_state(p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_start_daily_mission(
  p_user_id uuid, p_request_id uuid, p_mission_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_policy public.reward_policies%ROWTYPE;
  v_definition public.reward_mission_definitions%ROWTYPE;
  v_assignment public.reward_mission_assignments%ROWTYPE;
  v_session public.reward_mission_sessions%ROWTYPE;
  v_day date;
  v_reset timestamptz;
  v_source text;
  v_replay jsonb;
  v_receipt jsonb;
  v_earned_today integer;
BEGIN
  PERFORM public.svj_lock_reward_wallet(p_user_id);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_day := (v_now AT TIME ZONE v_policy.reward_timezone)::date;
  v_reset := ((v_day + 1)::timestamp AT TIME ZONE v_policy.reward_timezone);
  v_source := v_day::text || ':' || p_mission_key;
  v_replay := public.svj_replay_reward_operation(p_user_id, p_request_id, 'start_mission', v_source);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state(p_user_id));
  END IF;
  SELECT * INTO v_definition FROM public.reward_mission_definitions
    WHERE mission_key = p_mission_key AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_MISSION_NOT_FOUND'; END IF;
  IF v_now + make_interval(secs => v_definition.minimum_seconds) >= v_reset THEN
    RAISE EXCEPTION 'SVJ_REWARD_TOO_LATE_TODAY';
  END IF;
  SELECT COALESCE(sum(reward_xp_delta), 0)::integer INTO v_earned_today
    FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND policy_day = v_day AND reward_xp_delta > 0;
  IF v_earned_today + v_definition.reward_xp > v_policy.daily_reward_xp_cap THEN
    RAISE EXCEPTION 'SVJ_REWARD_DAILY_CAP_REACHED';
  END IF;
  UPDATE public.reward_mission_sessions SET expired_at = v_now
    WHERE user_id = p_user_id AND completed_at IS NULL AND expired_at IS NULL AND expires_at <= v_now;
  IF EXISTS (SELECT 1 FROM public.reward_mission_sessions
    WHERE user_id = p_user_id AND completed_at IS NULL AND expired_at IS NULL) THEN
    RAISE EXCEPTION 'SVJ_REWARD_MISSION_ALREADY_RUNNING';
  END IF;
  INSERT INTO public.reward_mission_assignments (
    user_id, policy_day, mission_key, definition_version, minimum_seconds,
    reward_xp, profile_xp, assigned_at
  ) VALUES (p_user_id, v_day, v_definition.mission_key, v_definition.version,
    v_definition.minimum_seconds, v_definition.reward_xp, v_definition.profile_xp, v_now)
    RETURNING * INTO v_assignment;
  INSERT INTO public.reward_mission_sessions (
    assignment_id, user_id, started_at, eligible_at, expires_at
  ) VALUES (v_assignment.id, p_user_id, v_now,
    v_now + make_interval(secs => v_assignment.minimum_seconds), v_reset)
    RETURNING * INTO v_session;
  v_receipt := jsonb_build_object('action', 'start_mission', 'assignmentId', v_assignment.id,
    'missionKey', p_mission_key, 'startedAt', v_session.started_at,
    'eligibleAt', v_session.eligible_at, 'expiresAt', v_session.expires_at, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'start_mission', v_source, v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state(p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_complete_daily_mission(
  p_user_id uuid, p_request_id uuid, p_assignment_id uuid, p_confirmation_text text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_policy public.reward_policies%ROWTYPE;
  v_assignment public.reward_mission_assignments%ROWTYPE;
  v_session public.reward_mission_sessions%ROWTYPE;
  v_day date;
  v_replay jsonb;
  v_earned_today integer;
  v_first_today boolean;
  v_receipt jsonb;
BEGIN
  PERFORM public.svj_lock_reward_wallet(p_user_id);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_replay := public.svj_replay_reward_operation(
    p_user_id, p_request_id, 'complete_mission', p_assignment_id::text);
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state(p_user_id));
  END IF;
  IF char_length(btrim(COALESCE(p_confirmation_text, ''))) < 20
     OR char_length(btrim(p_confirmation_text)) > 500 THEN
    RAISE EXCEPTION 'SVJ_REWARD_CONFIRMATION_REQUIRED';
  END IF;
  SELECT * INTO v_assignment FROM public.reward_mission_assignments
    WHERE id = p_assignment_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_ASSIGNMENT_NOT_FOUND'; END IF;
  IF v_assignment.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'SVJ_REWARD_MISSION_ALREADY_COMPLETED';
  END IF;
  SELECT * INTO v_session FROM public.reward_mission_sessions
    WHERE assignment_id = p_assignment_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SVJ_REWARD_SESSION_NOT_FOUND'; END IF;
  IF v_session.expired_at IS NOT NULL OR v_session.expires_at <= v_now THEN
    RAISE EXCEPTION 'SVJ_REWARD_SESSION_EXPIRED';
  END IF;
  IF v_session.eligible_at > v_now
     OR extract(epoch FROM (v_now - v_session.started_at)) < v_assignment.minimum_seconds THEN
    RAISE EXCEPTION 'SVJ_REWARD_MINIMUM_TIME_NOT_MET';
  END IF;
  v_day := (v_now AT TIME ZONE v_policy.reward_timezone)::date;
  IF v_assignment.policy_day <> v_day THEN RAISE EXCEPTION 'SVJ_REWARD_SESSION_EXPIRED'; END IF;
  SELECT COALESCE(sum(reward_xp_delta), 0)::integer INTO v_earned_today
    FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND policy_day = v_day AND reward_xp_delta > 0;
  IF v_earned_today + v_assignment.reward_xp > v_policy.daily_reward_xp_cap THEN
    RAISE EXCEPTION 'SVJ_REWARD_DAILY_CAP_REACHED';
  END IF;
  SELECT NOT EXISTS (SELECT 1 FROM public.reward_xp_ledger
    WHERE user_id = p_user_id AND policy_day = v_day AND kind = 'mission_completion')
    INTO v_first_today;

  UPDATE public.reward_mission_sessions SET completed_at = v_now,
    confirmation_text = btrim(p_confirmation_text) WHERE id = v_session.id;
  UPDATE public.reward_mission_assignments SET completed_at = v_now WHERE id = v_assignment.id;
  INSERT INTO public.reward_xp_ledger (
    user_id, campaign_id, policy_day, kind, source_key, reward_xp_delta,
    profile_xp_delta, created_at, metadata
  ) VALUES (
    p_user_id, v_policy.campaign_id, v_day, 'mission_completion', v_assignment.id::text,
    v_assignment.reward_xp, v_assignment.profile_xp, v_now,
    jsonb_build_object('missionKey', v_assignment.mission_key,
      'definitionVersion', v_assignment.definition_version)
  );
  UPDATE public.reward_wallets SET
    reward_xp = reward_xp + v_assignment.reward_xp,
    profile_xp_earned = profile_xp_earned + v_assignment.profile_xp,
    qualifying_days = qualifying_days + CASE WHEN v_first_today THEN 1 ELSE 0 END,
    last_qualifying_day = v_day, updated_at = v_now
    WHERE user_id = p_user_id;
  UPDATE public.profiles SET
    total_xp = COALESCE(total_xp, 0) + v_assignment.profile_xp,
    engagement_profile_xp = engagement_profile_xp + v_assignment.profile_xp
    WHERE id = p_user_id;
  v_receipt := jsonb_build_object('action', 'complete_mission',
    'assignmentId', v_assignment.id, 'missionKey', v_assignment.mission_key,
    'profileXpAwarded', v_assignment.profile_xp, 'rewardXpAwarded', v_assignment.reward_xp,
    'qualifyingDayAdded', v_first_today, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'complete_mission', p_assignment_id::text, v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state(p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_redeem_earned_plus(p_user_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
  v_wallet := public.svj_lock_reward_wallet(p_user_id, true);
  v_now := clock_timestamp();
  SELECT * INTO v_policy FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  v_replay := public.svj_replay_reward_operation(
    p_user_id, p_request_id, 'redeem_plus', 'earned-plus-launch-v1');
  IF v_replay IS NOT NULL THEN
    RETURN jsonb_build_object('receipt', v_replay, 'replayed', true,
      'state', public.svj_get_engagement_state(p_user_id));
  END IF;
  SELECT i.verified_identity, i.account_created_at INTO v_identity, v_created_at
    FROM public.svj_reward_identity(p_user_id) AS i;
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
  -- Existing privileged-column protection stays in place: this executes only
  -- for the service role. Failure here rolls back debit AND redemption.
  UPDATE public.profiles SET is_plus_member = true,
    plus_unlocked_at = COALESCE(plus_unlocked_at, v_now), plus_expires_at = v_expires
    WHERE id = p_user_id;
  v_receipt := jsonb_build_object('action', 'redeem_plus', 'redemptionId', v_id,
    'rewardXpSpent', v_policy.reward_xp_cost, 'plusExpiresAt', v_expires, 'issuedAt', v_now);
  INSERT INTO public.reward_operations (user_id, request_id, action, source_key, receipt, created_at)
    VALUES (p_user_id, p_request_id, 'redeem_plus', 'earned-plus-launch-v1', v_receipt, v_now);
  RETURN jsonb_build_object('receipt', v_receipt, 'replayed', false,
    'state', public.svj_get_engagement_state(p_user_id));
END;
$$;

-- Do not alter privileges on pre-existing functions or weaken their triggers.
REVOKE ALL ON FUNCTION public.freeze_reward_assignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_engagement_profile_xp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_assert_reward_service_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_reward_identity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_replay_reward_operation(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_lock_reward_wallet(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_get_engagement_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_claim_daily_checkin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_start_daily_mission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_complete_daily_mission(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_redeem_earned_plus(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_get_engagement_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_claim_daily_checkin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_start_daily_mission(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_complete_daily_mission(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_redeem_earned_plus(uuid, uuid) TO service_role;

COMMIT;
