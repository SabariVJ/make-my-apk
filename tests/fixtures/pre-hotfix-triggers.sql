-- PRE-HOTFIX (production-style) profile-protection trigger bodies, extracted
-- verbatim from the c929d01~1 versions of the historical migrations:
--   supabase/migrations/20260905111202_19b6224e-...sql (protect_profile_privileged_columns)
--   supabase/pending/20260902_earned_plus.sql          (protect_engagement_profile_xp)
-- Production (oltmnrkceodpyqznfhjb) still runs these OLD bodies because
-- historical migrations already applied are never re-executed by file edits.
-- The production-parity tests install these, then prove that applying ONLY
-- 20260920000000_earned_plus_self_service.sql upgrades the live triggers.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.is_plus_member := OLD.is_plus_member;
  NEW.plus_unlocked_at := OLD.plus_unlocked_at;
  NEW.plus_expires_at := OLD.plus_expires_at;
  NEW.signup_date := OLD.signup_date;
  NEW.qualifying_xp := OLD.qualifying_xp;
  NEW.total_xp := OLD.total_xp;
  NEW.current_streak := OLD.current_streak;
  NEW.leaderboard_eligible := OLD.leaderboard_eligible;

  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
    AND NEW.avatar_url IS NOT NULL
    AND NEW.avatar_url NOT LIKE ('%/avatars/' || auth.uid()::text || '/%') THEN
    NEW.avatar_url := OLD.avatar_url;
  END IF;

  RETURN NEW;
END;
$$;

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
