-- ============================================================================
-- FIX 1 — Protect profiles.plus_expires_at from client-side tampering
--
-- The production trigger function public.protect_profile_privileged_columns()
-- (created in 20260807043818_...) protects is_plus_member / plus_unlocked_at /
-- signup_date but NOT plus_expires_at. Without this change an authenticated
-- client could UPDATE profiles SET plus_expires_at = <far future> and extend
-- its own Plus status.
--
-- This migration:
--   * adds plus_expires_at (IF NOT EXISTS, so it also works standalone when the
--     60-day challenge migration has not been applied yet — NULL means lifetime),
--   * re-creates the trigger function so plus_expires_at is reset to OLD on any
--     non-service_role UPDATE (the service_role guard is unchanged, so the
--     legitimate server-side redeem/reward flow can still set it),
--   * extends the column-level REVOKE UPDATE to include plus_expires_at.
--
-- Safe/idempotent: CREATE OR REPLACE + DROP/CREATE TRIGGER IF EXISTS.
-- Does not modify any existing Plus expiry values.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plus_expires_at timestamptz;

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
