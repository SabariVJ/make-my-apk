-- ============================================================================
-- Canonical founder identity + lifetime Plus
-- ============================================================================
--
-- Canonical founder/admin account: sabarivj2008@gmail.com
-- (the legacy sabarivj777@gmail.com owner mapping is retired at the
-- application level; 777 remains the public SUPPORT address and its data is
-- preserved untouched).
--
-- This migration:
--   1) grants lifetime Plus (is_plus_member = true, plus_expires_at = NULL)
--      to the EXISTING auth user / profile for the canonical founder email,
--   2) backfills the existing admin role row for that same user if missing
--      (same conventions as 20261007000000_founder_admin_access.sql).
--
-- Safety:
--   - locates the user by email (case-insensitive) with the Google provider,
--     LIMIT 1, deterministic ORDER BY — never creates a user, never touches
--     any other account (sabarivj777@gmail.com data is preserved as-is),
--   - updates ONLY is_plus_member / plus_unlocked_at / plus_expires_at via the
--     audited trusted-server write path (svj.trusted_server_write), so the
--     protect_profile_privileged_columns trigger and the column-level REVOKEs
--     keep protecting every other column (XP, streak, signup_date, ...),
--   - lifetime Plus is expressed as plus_expires_at = NULL (the existing
--     schema's representation for "no expiry"),
--   - idempotent: re-running is a no-op (UPDATE to the same values, INSERT
--     ... ON CONFLICT DO NOTHING),
--   - runs entirely as service role / migration context; no client input.
-- ============================================================================

-- ── 1) Lifetime Plus for the canonical founder account ─────────────────────
DO $$
DECLARE
  v_founder_id uuid;
BEGIN
  SELECT u.id INTO v_founder_id
  FROM auth.users u
  WHERE lower(COALESCE(u.email, '')) = 'sabarivj2008@gmail.com'
    AND (
      u.raw_app_meta_data ->> 'provider' = 'google'
      OR u.raw_app_meta_data -> 'providers' ? 'google'
    )
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF v_founder_id IS NULL THEN
    RAISE NOTICE 'canonical founder account sabarivj2008@gmail.com not found; nothing to do';
    RETURN;
  END IF;

  -- Trusted-server write so protect_profile_privileged_columns does not
  -- revert the membership columns (same audited escape hatch the
  -- self-service Plus/XP RPCs use). Only membership fields change.
  PERFORM set_config('svj.trusted_server_write', 'on', true);

  UPDATE public.profiles
     SET is_plus_member = true,
         plus_expires_at = NULL,
         plus_unlocked_at = COALESCE(plus_unlocked_at, now())
   WHERE id = v_founder_id;

  PERFORM set_config('svj.trusted_server_write', 'off', true);
END;
$$;

-- ── 2) Backfill the admin role row for the canonical founder account ───────
-- Same predicate and idempotency as the 20261007000000 backfill, pointed at
-- the canonical 2008 address. The unique(user_id) constraint plus
-- ON CONFLICT DO NOTHING guarantee no duplicates and no second admin.
INSERT INTO public.user_roles (user_id, role)
SELECT founder.id, 'admin'
FROM (
  SELECT u.id
  FROM auth.users u
  WHERE lower(COALESCE(u.email, '')) = 'sabarivj2008@gmail.com'
    AND (
      u.raw_app_meta_data ->> 'provider' = 'google'
      OR u.raw_app_meta_data -> 'providers' ? 'google'
    )
  ORDER BY u.created_at ASC
  LIMIT 1
) AS founder
ON CONFLICT (user_id) DO NOTHING;
