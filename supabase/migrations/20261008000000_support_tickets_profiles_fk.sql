-- Explicit profiles relationship for the admin support-ticket list.
--
-- Problem this fixes:
-- 20261006000000 created support_tickets with its ownership FK pointing at
-- auth.users:
--
--   user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE
--
-- PostgREST can only embed across foreign keys that live in an exposed schema,
-- so that FK cannot be used to embed public.profiles. The admin ticket list
-- (adminListSupportTickets in src/lib/support.functions.ts) nevertheless asked
-- for a profiles embed — `profiles!support_tickets_user_id_fkey(username,
-- email)` — which fails with PGRST200 ("could not find a relationship between
-- 'support_tickets' and 'profiles'") in any project where this migration pair
-- is the source of truth. The user-facing ticket list does not embed, which is
-- why only the admin screen broke.
--
-- Fix: keep the existing auth.users ownership FK exactly as it is (it is the
-- real ownership/cleanup relationship and every RLS policy depends on the
-- user_id → auth.uid() mapping) and add a SECOND, explicitly named FK from
-- support_tickets.user_id to public.profiles(id). The query then references
-- that constraint by name, so there is no implicit relationship to guess at,
-- and it stays unambiguous if more relations are added later.
--
-- Idempotent and safe:
-- - guarded by a pg_constraint existence check, so re-running is a no-op;
-- - ON DELETE CASCADE mirrors the ownership FK (deleting the profile removes
--   that user's tickets);
-- - the constraint is only added as NOT VALID when existing rows would already
--   violate it (legacy accounts without a public.profiles row), so applying
--   this migration can never fail on pre-existing data. As soon as those rows
--   are cleaned up, `ALTER TABLE public.support_tickets VALIDATE CONSTRAINT
--   support_tickets_user_id_profiles_fkey;` upgrades it to a validated
--   constraint.
--
-- Nothing else is touched: no policy, no grant, no RLS change, no change to
-- handle_new_user(), is_admin_or_mod(), or the founder provisioning rule.
DO $$
DECLARE
  orphan_tickets integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_tickets_user_id_profiles_fkey'
      AND conrelid = 'public.support_tickets'::regclass
  ) THEN
    RETURN; -- already applied
  END IF;

  SELECT count(*)
  INTO orphan_tickets
  FROM public.support_tickets t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE p.id IS NULL;

  IF orphan_tickets = 0 THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;
  ELSE
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE
      NOT VALID;
    RAISE NOTICE
      'support_tickets_user_id_profiles_fkey added NOT VALID: % existing ticket(s) have no public.profiles row. Validate the constraint once those rows are cleaned up.',
      orphan_tickets;
  END IF;
END
$$;
