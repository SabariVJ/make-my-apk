-- 1) Lock down SECURITY DEFINER / trigger functions from direct API execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Intentionally callable RPCs: restrict to signed-in users only (no PUBLIC/anon)
REVOKE ALL ON FUNCTION public.get_friends() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_friend_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

-- 2) Profiles: owner-scoped INSERT and DELETE policies
CREATE POLICY "Users can create their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);
