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
CREATE POLICY "Own live steps read" ON public.svj_live_daily_steps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own live steps insert" ON public.svj_live_daily_steps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own live steps update" ON public.svj_live_daily_steps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.svj_live_daily_steps REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.svj_live_daily_steps;
COMMENT ON TABLE public.svj_live_daily_steps IS 'Display-only live mirror of today''s device step count; never used for XP or rewards.';