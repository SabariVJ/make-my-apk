-- Admin role + support ticket system for the SVJ admin dashboard.
--
-- Security model:
-- - The admin identity lives in a dedicated user_roles table, never a column
--   on profiles. The only way a row is created is the signup trigger below,
--   which grants 'admin' to exactly ONE email (the owner's Gmail) and ONLY
--   when the account was created via Google sign-in. All other writes are
--   revoked from anon/authenticated; only the service role and the trigger
--   (SECURITY DEFINER) can write.
-- - is_admin_or_mod() is the single authorization predicate for the support
--   ticket admin surface.
-- - support_tickets RLS: users own their rows; admins see and answer all.
-- - No profile schema changes.

-- ============================================================================
-- 1) user_roles
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Authenticated users may only read their own role row (the app uses this for
-- the silent admin check). Everyone else gets nothing.
CREATE POLICY "Users can view their own role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies exist: RLS denies all such operations for
-- anon and authenticated by default. Explicitly revoke grants too (defense in
-- depth — the table is not in the default grant set, but be explicit).
REVOKE ALL ON public.user_roles FROM anon, authenticated;

-- ============================================================================
-- 2) Signup trigger: grant admin to the owner's Google account ONLY
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, signup_date)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(COALESCE(NEW.email, 'voyager'), '@', 1)),
    COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (id) DO NOTHING;

  -- Admin grant: exactly one email, Google-provider signups only. lower()
  -- makes the comparison case-insensitive; the provider check ensures no
  -- password/other-method account with the same address can ever qualify.
  IF lower(COALESCE(NEW.email, '')) = 'sabarivj777@gmail.com'
     AND NEW.raw_app_meta_data ->> 'provider' = 'google' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger to bind to the updated function (drop guards against
-- double-application on environments where the trigger name already exists).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 3) Authorization predicate
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_mod(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid);
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_mod(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_mod(uuid) TO authenticated;

-- ============================================================================
-- 4) support_tickets
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('payment', 'bug', 'account', 'other')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Ticket owners: insert own, read own. No UPDATE/DELETE policies for owners:
-- a regular user cannot modify a ticket after creating it.
CREATE POLICY "Users can create their own tickets"
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own tickets"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins: read everything, and update ONLY the admin-controlled columns.
CREATE POLICY "Admins can view all tickets"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_mod(auth.uid()));

CREATE POLICY "Admins can update tickets"
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_mod(auth.uid()))
  WITH CHECK (public.is_admin_or_mod(auth.uid()));

-- Column-level enforcement: even an admin UPDATE may only touch status,
-- admin_response, resolved_at, updated_at. Anything else (user_id, message,
-- category, created_at) is rejected for authenticated roles regardless of
-- policy. The service role is unaffected.
REVOKE UPDATE ON public.support_tickets FROM authenticated;
GRANT UPDATE (status, admin_response, resolved_at, updated_at)
  ON public.support_tickets TO authenticated;

REVOKE ALL ON public.support_tickets FROM anon;

-- Keep updated_at fresh.
CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
