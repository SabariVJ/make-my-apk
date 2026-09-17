-- Fix PL/pgSQL output-column ambiguity in svj_get_my_membership().
--
-- The previous function RETURNS TABLE(... id, display_name, ...), which creates
-- PL/pgSQL output variables with those names. Unqualified profile-column
-- references such as `WHERE id = caller_id` and `COALESCE(..., display_name)`
-- can therefore raise SQLSTATE 42702 (column reference is ambiguous).
--
-- This additive hotfix keeps the same membership semantics and permissions,
-- but qualifies every potentially-conflicting table column explicitly.

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
  siblings record;
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
    FOR siblings IN
      SELECT p.id, p.email, p.display_name, p.signup_date, p.is_plus_member,
             p.plus_unlocked_at, p.plus_expires_at, p.username, p.avatar_url,
             p.total_xp, p.current_streak
      FROM public.profiles AS p
      WHERE p.email = self.email
        AND p.id <> caller_id
      ORDER BY p.created_at ASC
    LOOP
      self.signup_date := LEAST(self.signup_date, siblings.signup_date);
      self.is_plus_member := self.is_plus_member OR siblings.is_plus_member;
      self.plus_unlocked_at := COALESCE(self.plus_unlocked_at, siblings.plus_unlocked_at);
      self.plus_expires_at := COALESCE(self.plus_expires_at, siblings.plus_expires_at);
      self.display_name := COALESCE(self.display_name, siblings.display_name);
      self.username := COALESCE(self.username, siblings.username);
      self.avatar_url := COALESCE(self.avatar_url, siblings.avatar_url);
      self.total_xp := GREATEST(self.total_xp, siblings.total_xp);
      self.current_streak := GREATEST(self.current_streak, siblings.current_streak);

      UPDATE public.profiles AS s
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
    WHERE p.id = caller_id;

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
