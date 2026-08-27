-- ============================================================================
-- 60-Day Challenge + redeem code reward system
--
-- ⚠️  RUN THIS ON THE CORRECT SVJ PRODUCTION SUPABASE DATABASE ⚠️
--   Project: oltmnrkceodpyqznfhjb  (https://oltmnrkceodpyqznfhjb.supabase.co)
--   Execute via the Supabase SQL editor or your migration pipeline.
--
-- Security model:
--   * ALL writes to challenge tables and redeem_codes go through TanStack Start
--     server functions that use the service_role client (see src/lib/challenge.functions.ts).
--   * These tables have RLS enabled with ZERO policies and NO grants for
--     authenticated/anon, so direct client writes are impossible.
--   * "now" for unlock math is always the database clock via public.db_now(),
--     never the device clock.
--
-- Idempotency: every statement is safe to re-run (IF NOT EXISTS / CREATE OR
-- REPLACE / DROP TRIGGER IF EXISTS / re-issuable grants), so applying it to a
-- database where some objects already exist will not create duplicates or
-- clobber existing data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Plus expiry. Paid unlocks are lifetime (plus_expires_at NULL); codes
--    redeemed from the 60-Day Challenge grant exactly 2 months.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plus_expires_at timestamptz;

-- Protect plus_expires_at exactly like the other privileged columns so users
-- can never self-grant Plus (only the service_role server functions can write it).
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
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

REVOKE UPDATE (is_plus_member, plus_unlocked_at, plus_expires_at, signup_date) ON public.profiles FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 2) Database clock: server-side "now" for all challenge logic.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.db_now()
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT now();
$$;

REVOKE ALL ON FUNCTION public.db_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.db_now() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) XP: atomic, server-side-only increment of the EXISTING profiles.total_xp
--    column (the same column the leaderboard reads). Callable only by
--    service_role; clients can never invoke it directly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_total_xp(target_user uuid, amount integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total integer;
BEGIN
  UPDATE public.profiles
     SET total_xp = total_xp + amount
   WHERE id = target_user
   RETURNING total_xp INTO new_total;
  RETURN new_total;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_total_xp(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_total_xp(uuid, integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 4) Challenge tables.
-- ----------------------------------------------------------------------------
-- One enrollment per user, ever. started_at is the unlock-clock anchor:
-- day N unlocks at started_at + (N - 1) * 24h. On a missed day the challenge
-- pauses and, on resume, started_at is re-anchored so the pending day unlocks
-- immediately (streak and completed-day history are preserved).
CREATE TABLE IF NOT EXISTS public.challenge_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  completed_at timestamptz,
  code_granted boolean NOT NULL DEFAULT false,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_enrollments_user_unique UNIQUE (user_id)
);

-- Only COMPLETED days are stored (a missed day is derived from timing + the
-- enrollment's paused state). day_number is enforced sequentially by the
-- server functions.
CREATE TABLE IF NOT EXISTS public.challenge_day_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.challenge_enrollments(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'missed')),
  completed_at timestamptz,
  checkin_duration_minutes integer,
  checkin_reflection text,
  tasks_completed jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_day_progress_unique_day UNIQUE (enrollment_id, day_number)
);

-- One unique code per finisher, locked to their account (user_id), single use.
CREATE TABLE IF NOT EXISTS public.redeem_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redeemed boolean NOT NULL DEFAULT false,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redeem_codes_user_unique UNIQUE (user_id)
);

-- ----------------------------------------------------------------------------
-- 5) Lock everything down: service_role (server functions) only.
--    RLS is enabled with no policies, so authenticated/anon are denied every
--    operation even if a stray grant appears later.
-- ----------------------------------------------------------------------------
ALTER TABLE public.challenge_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_day_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.challenge_enrollments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.challenge_day_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.redeem_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.challenge_enrollments TO service_role;
GRANT ALL ON public.challenge_day_progress TO service_role;
GRANT ALL ON public.redeem_codes TO service_role;
