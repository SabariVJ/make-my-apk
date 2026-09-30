-- Founder admin access fix (follow-up to 20261006000000_admin_roles_support_tickets).
--
-- Symptom: the founder, signed in with Google as sabarivj777@gmail.com, saw the
-- normal Profile/support-ticket UI but never the existing Admin Dashboard.
--
-- Root cause (two independent defects in the previous migration):
--
-- 1) user_roles was unreadable by its own owner.
--    20261006000000 ran `REVOKE ALL ON public.user_roles FROM anon,
--    authenticated`, and REVOKE ALL includes SELECT. That removed the table
--    privilege the RLS policy depends on: the policy
--    "Users can view their own role" still existed, but a SELECT raised
--    "permission denied for table user_roles" for every authenticated caller.
--    The client gate (useAdminRole) treats an errored read as "no role", so the
--    Admin entry never rendered for anyone — including a real admin.
--    Section 1 restores SELECT only. Row visibility is still constrained to
--    user_id = auth.uid() by the existing policy, and every write privilege
--    stays revoked, so this cannot be used to read or modify another user's role.
--
-- 2) The founder's existing account never received a role row.
--    handle_new_user() grants the admin row from an AFTER INSERT trigger on
--    auth.users, so it can only fire at signup. The founder's Google account
--    was created long before 20261006000000 was applied, so no backfill ever
--    happened and public.user_roles has no row for it. Section 2 backfills that
--    exact account, once, and only for the email + Google-provider combination.
--
-- Not changed here (deliberately):
-- - the signup grant in handle_new_user() (new Google signups keep working),
-- - is_admin_or_mod(),
-- - support_tickets RLS/grants and the support-ticket flow,
-- - the admin server functions (they already verify the role server-side with
--   requireAdminUserId(); this migration only makes the DB state match reality).
--
-- Idempotent: re-running is a no-op for both sections.

-- ============================================================================
-- 1) Let authenticated users read their OWN role row again
-- ============================================================================
GRANT SELECT ON public.user_roles TO authenticated;

-- Writes remain impossible for client roles: no INSERT/UPDATE/DELETE policy
-- exists for user_roles, and these privileges stay explicitly revoked. anon has
-- no access at all. Only the service role and the SECURITY DEFINER trigger can
-- write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_roles FROM anon, authenticated;
REVOKE ALL ON public.user_roles FROM anon;

-- ============================================================================
-- 2) Backfill the founder's existing Google account
-- ============================================================================
-- Same predicate as the signup trigger: the owner's address (case-insensitive)
-- AND Google as an authenticated provider. Accepted evidence of Google is the
-- primary `provider` claim or a Google entry in the `providers` list, which is
-- how Supabase records the linked identities. A password/other-provider account
-- with this address does not qualify, and no other address is ever considered —
-- the client never supplies this value.
--
-- LIMIT 1 keeps the grant to a single admin row (the unique user_id constraint
-- is unchanged); ORDER BY makes the pick deterministic if auth.users ever held
-- two rows for the same address. ON CONFLICT DO NOTHING makes the backfill
-- idempotent and safe to run on an environment where the row already exists —
-- it never creates a second admin, and it never removes one.
INSERT INTO public.user_roles (user_id, role)
SELECT founder.id, 'admin'
FROM (
  SELECT u.id
  FROM auth.users u
  WHERE lower(COALESCE(u.email, '')) = 'sabarivj777@gmail.com'
    AND (
      u.raw_app_meta_data ->> 'provider' = 'google'
      OR u.raw_app_meta_data -> 'providers' ? 'google'
    )
  ORDER BY u.created_at ASC
  LIMIT 1
) AS founder
ON CONFLICT (user_id) DO NOTHING;
