-- Phase 03: durable, private, immutable activity ledger.
-- This migration intentionally does not backfill unverifiable historical activity.

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 8 AND 200),
  event_type text NOT NULL CHECK (event_type IN (
    'challenge_completion', 'workout', 'focus_session', 'meal_log',
    'recovery_action', 'xp_award', 'stat_change', 'rivalry_contribution'
  )),
  source_class text NOT NULL CHECK (source_class IN (
    'svj_verified', 'svj_personalized', 'sixty_day', 'user_created',
    'workout', 'focus', 'nutrition', 'recovery', 'system'
  )),
  source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifetime_xp_delta integer NOT NULL DEFAULT 0 CHECK (lifetime_xp_delta BETWEEN 0 AND 1000),
  qualifying_xp_delta integer NOT NULL DEFAULT 0 CHECK (qualifying_xp_delta BETWEEN 0 AND 150),
  rivalry_xp_delta integer NOT NULL DEFAULT 0 CHECK (rivalry_xp_delta BETWEEN 0 AND 1000),
  stat_deltas jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT activity_events_identity UNIQUE (user_id, event_key),
  CONSTRAINT activity_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT activity_events_stat_deltas_object CHECK (jsonb_typeof(stat_deltas) = 'object'),
  CONSTRAINT activity_events_server_clock CHECK (created_at <= now() + interval '1 minute')
);

CREATE INDEX IF NOT EXISTS activity_events_user_occurred_idx
  ON public.activity_events (user_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS activity_events_source_idx
  ON public.activity_events (user_id, source_class, source_id);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.activity_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;

DROP POLICY IF EXISTS "Users read own private activity" ON public.activity_events;
CREATE POLICY "Users read own private activity"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Ledger rows are immutable. Only trusted server/database routines may insert.
CREATE OR REPLACE FUNCTION public.prevent_activity_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'activity events are immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_activity_event_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS activity_events_immutable ON public.activity_events;
CREATE TRIGGER activity_events_immutable
  BEFORE UPDATE OR DELETE ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_activity_event_mutation();

COMMENT ON TABLE public.activity_events IS
  'Private immutable event ledger. Insert through trusted server/database flows; never accept client-authored reward deltas.';

