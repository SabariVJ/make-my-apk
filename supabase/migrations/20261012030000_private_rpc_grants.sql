-- Additive permission repair. Keep token-based public sharing explicit; all
-- other SVJ definer RPCs require an authenticated or trusted server caller.
BEGIN;
DO $$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'svj_%' AND p.prosecdef
      AND p.proname <> 'svj_get_public_live_share'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', target.signature);
  END LOOP;
END;
$$;
-- These internal helpers accept another user's id and bypass RLS. They are
-- reached by trusted definer transactions, never directly by app clients.
REVOKE ALL ON FUNCTION public.svj_training_load_points(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_activity_xp_earned_today(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_training_load_points(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.svj_activity_xp_earned_today(uuid) TO service_role;
COMMIT;
