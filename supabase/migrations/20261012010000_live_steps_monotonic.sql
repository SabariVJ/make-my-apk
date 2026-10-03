BEGIN;
CREATE TABLE IF NOT EXISTS public.svj_live_daily_steps (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_key date NOT NULL,
  steps integer NOT NULL DEFAULT 0 CHECK (steps >= 0 AND steps <= 200000),
  distance_meters numeric NOT NULL DEFAULT 0 CHECK (distance_meters >= 0),
  source text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date_key)
);
GRANT SELECT, INSERT, UPDATE ON public.svj_live_daily_steps TO authenticated;
GRANT ALL ON public.svj_live_daily_steps TO service_role;
ALTER TABLE public.svj_live_daily_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own live steps read" ON public.svj_live_daily_steps;
CREATE POLICY "Own live steps read" ON public.svj_live_daily_steps FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Own live steps insert" ON public.svj_live_daily_steps;
CREATE POLICY "Own live steps insert" ON public.svj_live_daily_steps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Own live steps update" ON public.svj_live_daily_steps;
CREATE POLICY "Own live steps update" ON public.svj_live_daily_steps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.svj_live_daily_steps REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='svj_live_daily_steps') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.svj_live_daily_steps;
  END IF;
END $$;
COMMENT ON TABLE public.svj_live_daily_steps IS 'Display-only live mirror of today''s device step count; never used for XP or rewards.';
-- Preserve overlapping device totals. The mirror remains display-only.
CREATE OR REPLACE FUNCTION public.svj_keep_live_steps_monotonic()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id = OLD.user_id AND NEW.date_key = OLD.date_key THEN
    NEW.steps := greatest(OLD.steps, NEW.steps);
    NEW.distance_meters := greatest(OLD.distance_meters, NEW.distance_meters);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.svj_keep_live_steps_monotonic() FROM PUBLIC;
DROP TRIGGER IF EXISTS svj_live_steps_monotonic ON public.svj_live_daily_steps;
CREATE TRIGGER svj_live_steps_monotonic BEFORE INSERT OR UPDATE ON public.svj_live_daily_steps
FOR EACH ROW EXECUTE FUNCTION public.svj_keep_live_steps_monotonic();

COMMIT;
