-- ============================================================================
-- SVJ membership RPC: resolve same-email Plus expiry by strongest entitlement
--
-- Same-email profile merging previously used COALESCE(self.plus_expires_at,
-- siblings.plus_expires_at). If the current profile held an older expired
-- timestamp, a newly gifted sibling profile could still resolve as expired.
--
-- Entitlement merge rule:
--   * lifetime Plus wins when any linked Plus profile has plus_expires_at NULL
--   * otherwise the latest timed expiry wins
--   * is_plus_member remains true if any linked profile has ever had Plus
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
  self public.profiles%ROWTYPE;
  sibling public.profiles%ROWTYPE;
  v_has_lifetime_plus boolean := false;
  v_latest_plus_expires_at timestamptz;
BEGIN
  IF caller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.* INTO self
  FROM public.profiles AS p
  WHERE p.id = caller_id;

  IF NOT FOUND THEN
    SELECT u.email INTO caller_email
    FROM auth.users AS u
    WHERE u.id = caller_id;

    INSERT INTO public.profiles (id, email)
    VALUES (caller_id, caller_email)
    ON CONFLICT (id) DO NOTHING;

    SELECT p.* INTO self
    FROM public.profiles AS p
    WHERE p.id = caller_id;
  END IF;

  IF self.email IS NOT NULL THEN
    FOR sibling IN
      SELECT p.*
      FROM public.profiles AS p
      WHERE p.email = self.email
        AND p.id <> caller_id
      ORDER BY p.created_at ASC
    LOOP
      self.signup_date := LEAST(self.signup_date, sibling.signup_date);
      self.is_plus_member := self.is_plus_member OR sibling.is_plus_member;
      self.plus_unlocked_at := COALESCE(self.plus_unlocked_at, sibling.plus_unlocked_at);
      self.display_name := COALESCE(self.display_name, sibling.display_name);
      self.username := COALESCE(self.username, sibling.username);
      self.avatar_url := COALESCE(self.avatar_url, sibling.avatar_url);
      self.total_xp := GREATEST(self.total_xp, sibling.total_xp);
      self.current_streak := GREATEST(self.current_streak, sibling.current_streak);
    END LOOP;

    SELECT
      bool_or(p.is_plus_member AND p.plus_expires_at IS NULL),
      max(p.plus_expires_at) FILTER (WHERE p.is_plus_member AND p.plus_expires_at IS NOT NULL)
      INTO v_has_lifetime_plus, v_latest_plus_expires_at
    FROM public.profiles AS p
    WHERE p.email = self.email;

    self.plus_expires_at := CASE
      WHEN COALESCE(v_has_lifetime_plus, false) THEN NULL
      ELSE v_latest_plus_expires_at
    END;

    UPDATE public.profiles AS p
    SET signup_date = self.signup_date,
        is_plus_member = self.is_plus_member,
        plus_unlocked_at = self.plus_unlocked_at,
        plus_expires_at = self.plus_expires_at,
        display_name = COALESCE(self.display_name, p.display_name),
        username = COALESCE(self.username, p.username),
        avatar_url = COALESCE(self.avatar_url, p.avatar_url),
        total_xp = self.total_xp,
        current_streak = self.current_streak
    WHERE p.email = self.email;

    SELECT p.* INTO self
    FROM public.profiles AS p
    WHERE p.id = caller_id;
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
