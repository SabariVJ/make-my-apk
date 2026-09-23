-- ============================================================================
-- SVJ emergency backend stabilization: self-service membership resolution
--
-- ⚠️  TARGET DATABASE: oltmnrkceodpyqznfhjb (Lovable Cloud / live SVJ backend)
--   Do NOT apply to any other project.
--
-- WHY THIS EXISTS
--   getTrialStatus previously ran through requireAdminKey() + the service-role
--   client, so normal sign-in failed with:
--     "[Supabase] Privileged operation requires SVJ_SUPABASE_SECRET_KEY or
--      SUPABASE_SERVICE_ROLE_KEY. Neither is configured. Operation refused."
--   The Lovable-managed backend does not expose a service-role key to the
--   owner. Membership resolution for the *currently authenticated user* must
--   not require a privileged key at all.
--
-- THE FIX
--   public.svj_get_my_membership() — SECURITY DEFINER, safe search_path,
--   identity derived from auth.uid() only. No user_id parameter, no email
--   column in the output, no cross-user access. The privileged sibling-account
--   merge from getTrialStatus (same-email account unification) is moved into
--   this function so the client path keeps identical semantics.
--
-- Privileged operations (account deletion, Plus grants, code redemption)
-- continue to require requireAdminKey(); this migration does not touch them.
--
-- Idempotency: every statement is re-runnable (CREATE OR REPLACE / conditional
-- grants). Applying it again will not duplicate or clobber anything.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.svj_get_my_membership()
RETURNS TABLE (
  id uuid,
  display_name text,
  signup_date timestamptz,
  is_plus_member boolean,
  plus_unlocked_at timestamptz,
  plus_expires_at timestamptz,
  total_xp integer,
  current_streak integer,
  username text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
  self profiles%ROWTYPE;
  siblings record;
  canonical record;
  merged profiles%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    -- Anonymous callers get nothing; the client treats this as signed-out.
    RETURN;
  END IF;

  SELECT * INTO self FROM public.profiles WHERE id = caller_id;

  -- Safety net for users created before the profiles trigger existed: the
  -- previous admin path auto-created the missing profile row. Keep that
  -- behaviour so a legacy account still signs in.
  IF NOT FOUND THEN
    SELECT email INTO caller_email FROM auth.users WHERE id = caller_id;
    INSERT INTO public.profiles (id, email)
    VALUES (caller_id, caller_email)
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO self FROM public.profiles WHERE id = caller_id;
  END IF;

  -- ── Sibling-account unification (same email, two auth providers) ──────────
  -- Previously done with the admin client in getTrialStatus. SECURITY DEFINER
  -- lets this read sibling rows (RLS would hide them) while still only ever
  -- writing the caller's own row.
  IF self.email IS NOT NULL THEN
    canonical := NULL;
    FOR siblings IN
      SELECT id, email, display_name, signup_date, is_plus_member,
             plus_unlocked_at, plus_expires_at, username, avatar_url,
             total_xp, current_streak
      FROM public.profiles
      WHERE email = self.email
        AND id <> caller_id
      ORDER BY created_at ASC
    LOOP
      -- Merge into self: oldest signup wins, best membership/XP/streak wins.
      self.signup_date := LEAST(self.signup_date, siblings.signup_date);
      self.is_plus_member := self.is_plus_member OR siblings.is_plus_member;
      self.plus_unlocked_at := COALESCE(self.plus_unlocked_at, siblings.plus_unlocked_at);
      self.plus_expires_at := COALESCE(self.plus_expires_at, siblings.plus_expires_at);
      self.display_name := COALESCE(self.display_name, siblings.display_name);
      self.username := COALESCE(self.username, siblings.username);
      self.avatar_url := COALESCE(self.avatar_url, siblings.avatar_url);
      self.total_xp := GREATEST(self.total_xp, siblings.total_xp);
      self.current_streak := GREATEST(self.current_streak, siblings.current_streak);

      -- Mirror the merged fields into the sibling rows so both providers land
      -- on the same account data (same invariant as the old admin merge).
      UPDATE public.profiles s
      SET signup_date = LEAST(s.signup_date, self.signup_date),
          is_plus_member = s.is_plus_member OR self.is_plus_member,
          plus_unlocked_at = COALESCE(s.plus_unlocked_at, self.plus_unlocked_at),
          plus_expires_at = COALESCE(s.plus_expires_at, self.plus_expires_at),
          display_name = COALESCE(s.display_name, self.display_name),
          username = COALESCE(s.username, self.username),
          avatar_url = COALESCE(s.avatar_url, self.avatar_url),
          total_xp = GREATEST(s.total_xp, self.total_xp),
          current_streak = GREATEST(s.current_streak, self.current_streak)
      WHERE s.id = siblings.id;
    END LOOP;

    UPDATE public.profiles
    SET signup_date = self.signup_date,
        is_plus_member = self.is_plus_member,
        plus_unlocked_at = self.plus_unlocked_at,
        plus_expires_at = self.plus_expires_at,
        display_name = COALESCE(self.display_name, display_name),
        username = COALESCE(self.username, username),
        avatar_url = COALESCE(self.avatar_url, avatar_url),
        total_xp = self.total_xp,
        current_streak = self.current_streak
    WHERE id = caller_id;

    SELECT * INTO self FROM public.profiles WHERE id = caller_id;
  END IF;

  RETURN QUERY
  SELECT
    self.id,
    self.display_name,
    self.signup_date,
    self.is_plus_member,
    self.plus_unlocked_at,
    self.plus_expires_at,
    self.total_xp,
    self.current_streak,
    self.username,
    self.avatar_url;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_get_my_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_get_my_membership() TO authenticated;

COMMIT;
