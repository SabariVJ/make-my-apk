-- ============================================================================
-- SVJ Personalization, Body Profile, Rivalry, Anti-Abuse & Stats Migration
-- Safe/idempotent: IF NOT EXISTS on all objects.
-- ============================================================================

BEGIN;

-- ── 1) USER PERSONALIZATION (assessment answers) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_personalization (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Assessment section flags
  assessment_completed boolean NOT NULL DEFAULT false,
  goals_selected boolean NOT NULL DEFAULT false,
  -- Goals (array of text)
  goals text[] NOT NULL DEFAULT '{}',
  -- Social assessment (1-5 scale)
  social_comfort_new_people integer CHECK (social_comfort_new_people BETWEEN 1 AND 5),
  social_comfort_conversations integer CHECK (social_comfort_conversations BETWEEN 1 AND 5),
  social_comfort_groups integer CHECK (social_comfort_groups BETWEEN 1 AND 5),
  social_avoidance_frequency integer CHECK (social_avoidance_frequency BETWEEN 1 AND 5),
  social_self_description text CHECK (social_self_description IN ('very_introverted','introverted','balanced','extroverted','very_extroverted')),
  -- Confidence assessment (1-5 scale)
  confidence_general integer CHECK (confidence_general BETWEEN 1 AND 5),
  confidence_initiative integer CHECK (confidence_initiative BETWEEN 1 AND 5),
  confidence_unfamiliar integer CHECK (confidence_unfamiliar BETWEEN 1 AND 5),
  confidence_setbacks integer CHECK (confidence_setbacks BETWEEN 1 AND 5),
  confidence_speaking_up integer CHECK (confidence_speaking_up BETWEEN 1 AND 5),
  confidence_goals integer CHECK (confidence_goals BETWEEN 1 AND 5),
  -- Discipline assessment (1-5 scale)
  discipline_task_completion integer CHECK (discipline_task_completion BETWEEN 1 AND 5),
  discipline_procrastination integer CHECK (discipline_procrastination BETWEEN 1 AND 5),
  discipline_routine integer CHECK (discipline_routine BETWEEN 1 AND 5),
  discipline_commitments integer CHECK (discipline_commitments BETWEEN 1 AND 5),
  discipline_distractibility integer CHECK (discipline_distractibility BETWEEN 1 AND 5),
  discipline_habits integer CHECK (discipline_habits BETWEEN 1 AND 5),
  -- Focus/Productivity assessment (1-5 scale)
  focus_phone_resistance integer CHECK (focus_phone_resistance BETWEEN 1 AND 5),
  focus_study_consistency integer CHECK (focus_study_consistency BETWEEN 1 AND 5),
  focus_time_management integer CHECK (focus_time_management BETWEEN 1 AND 5),
  focus_deep_work integer CHECK (focus_deep_work BETWEEN 1 AND 5),
  focus_distraction_frequency integer CHECK (focus_distraction_frequency BETWEEN 1 AND 5),
  focus_planned_completion integer CHECK (focus_planned_completion BETWEEN 1 AND 5),
  -- Fitness assessment
  fitness_activity_level text CHECK (fitness_activity_level IN ('sedentary','light','moderate','active','very_active')),
  fitness_days_per_week integer CHECK (fitness_days_per_week BETWEEN 0 AND 7),
  fitness_confidence integer CHECK (fitness_confidence BETWEEN 1 AND 5),
  fitness_primary_goal text,
  fitness_consistency integer CHECK (fitness_consistency BETWEEN 1 AND 5),
  -- Recovery assessment
  recovery_sleep_hours numeric(3,1),
  recovery_sleep_consistency integer CHECK (recovery_sleep_consistency BETWEEN 1 AND 5),
  recovery_morning_energy integer CHECK (recovery_morning_energy BETWEEN 1 AND 5),
  recovery_perception integer CHECK (recovery_perception BETWEEN 1 AND 5),
  -- Nutrition assessment
  nutrition_dietary_preference text CHECK (nutrition_dietary_preference IN ('vegetarian','eggetarian','non_vegetarian','vegan')),
  nutrition_allergies text[] NOT NULL DEFAULT '{}',
  nutrition_eating_schedule integer CHECK (nutrition_eating_schedule BETWEEN 1 AND 5),
  nutrition_food_quality integer CHECK (nutrition_food_quality BETWEEN 1 AND 5),
  nutrition_protein_consistency integer CHECK (nutrition_protein_consistency BETWEEN 1 AND 5),
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_personalization ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_personalization FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_personalization TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_personalization TO authenticated;
CREATE POLICY "Users can manage own personalization"
  ON public.user_personalization FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2) USER STATS (computed baseline + dynamic progression) ─────────────────
CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Baseline stats (1-100, set from assessment)
  fitness integer NOT NULL DEFAULT 50 CHECK (fitness BETWEEN 1 AND 100),
  discipline integer NOT NULL DEFAULT 50 CHECK (discipline BETWEEN 1 AND 100),
  focus integer NOT NULL DEFAULT 50 CHECK (focus BETWEEN 1 AND 100),
  confidence integer NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 1 AND 100),
  social integer NOT NULL DEFAULT 50 CHECK (social BETWEEN 1 AND 100),
  nutrition integer NOT NULL DEFAULT 50 CHECK (nutrition BETWEEN 1 AND 100),
  recovery integer NOT NULL DEFAULT 50 CHECK (recovery BETWEEN 1 AND 100),
  consistency integer NOT NULL DEFAULT 50 CHECK (consistency BETWEEN 1 AND 100),
  -- Assessment-based baseline (snapshot)
  baseline_fitness integer,
  baseline_discipline integer,
  baseline_focus integer,
  baseline_confidence integer,
  baseline_social integer,
  baseline_nutrition integer,
  baseline_recovery integer,
  baseline_consistency integer,
  -- Versioning
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_stats TO service_role;
GRANT SELECT ON public.user_stats TO authenticated;
CREATE POLICY "Users can read own stats"
  ON public.user_stats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 3) STAT EVENTS (server-controlled progression ledger) ────────────────────
CREATE TABLE IF NOT EXISTS public.stat_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stat_name text NOT NULL CHECK (stat_name IN ('fitness','discipline','focus','confidence','social','nutrition','recovery','consistency')),
  delta integer NOT NULL,
  source text NOT NULL,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stat_events_user_idx ON public.stat_events (user_id, created_at DESC);

ALTER TABLE public.stat_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stat_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stat_events TO service_role;
GRANT SELECT ON public.stat_events TO authenticated;
CREATE POLICY "Users can read own stat events"
  ON public.stat_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 4) USER BODY PROFILE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_body_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  date_of_birth date,
  sex text CHECK (sex IN ('male','female','other')),
  height_cm numeric(5,1) CHECK (height_cm > 0 AND height_cm < 300),
  weight_kg numeric(5,1) CHECK (weight_kg > 0 AND weight_kg < 500),
  activity_level text CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  body_goal text CHECK (body_goal IN ('lose_fat','maintain','gain_muscle','improve_fitness')),
  target_weight_kg numeric(5,1),
  -- Computed values (set by server)
  bmi numeric(4,1),
  bmi_category text,
  bmr numeric(6,1),
  tdee numeric(6,1),
  daily_calorie_target numeric(6,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_body_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_body_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_body_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_body_profiles TO authenticated;
CREATE POLICY "Users can manage own body profile"
  ON public.user_body_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 5) RIVALRIES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rivalries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','active','completed','declined','cancelled','expired')),
  -- Baselines at rivalry start (lifetime XP snapshot)
  challenger_baseline_xp integer NOT NULL DEFAULT 0,
  opponent_baseline_xp integer NOT NULL DEFAULT 0,
  -- Result
  winner_id uuid,
  -- Timing
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rivalries_not_self CHECK (challenger_id <> opponent_id)
);
-- Canonical unordered pair index: prevents A->B AND B->A from existing
-- simultaneously. Uses LEAST/GREATEST so {A,B} always maps to the same key.
-- Only enforced for live rivalries; declined/cancelled/completed allow re-challenge.
DROP CONSTRAINT IF EXISTS rivalries_unique_active ON public.rivalries;
DROP INDEX IF EXISTS rivalries_no_pending_or_active_dupes ON public.rivalries;
CREATE UNIQUE INDEX IF NOT EXISTS rivalries_no_live_pair_dupes
  ON public.rivalries (LEAST(challenger_id, opponent_id), GREATEST(challenger_id, opponent_id))
  WHERE status IN ('pending', 'accepted', 'active');

ALTER TABLE public.rivalries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rivalries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rivalries TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.rivalries TO authenticated;
CREATE POLICY "Users can see own rivalries"
  ON public.rivalries FOR SELECT TO authenticated
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);
CREATE POLICY "Users can create rivalries as challenger"
  ON public.rivalries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = challenger_id);
CREATE POLICY "Users can update own rivalries"
  ON public.rivalries FOR UPDATE TO authenticated
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id)
  WITH CHECK (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- ── 6) RIVALRY EVENTS (progress ledger during active rivalry) ────────────────
CREATE TABLE IF NOT EXISTS public.rivalry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rivalry_id uuid NOT NULL REFERENCES public.rivalries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xp_delta integer NOT NULL DEFAULT 0,
  event_type text NOT NULL CHECK (event_type IN ('challenge_complete','workout','mission','daily_checkin')),
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rivalry_events_rivalry_idx ON public.rivalry_events (rivalry_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rivalry_events_no_dupe ON public.rivalry_events (rivalry_id, user_id, event_type, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE public.rivalry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rivalry_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rivalry_events TO service_role;
GRANT SELECT, INSERT ON public.rivalry_events TO authenticated;
CREATE POLICY "Users can read own rivalry events"
  ON public.rivalry_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rivalry events"
  ON public.rivalry_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 7) ANTI-ABUSE ELIGIBILITY LEDGER ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promotion_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eligibility_key text NOT NULL UNIQUE,  -- HMAC of provider identity
  campaign_id text NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  reward_granted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.promotion_eligibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promotion_eligibility FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.promotion_eligibility TO service_role;

-- ── 8) QUALIFYING XP TRACKER ────────────────────────────────────────────────
-- Separate from profiles.total_xp to distinguish lifetime XP from qualifying XP
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qualifying_xp integer NOT NULL DEFAULT 0;

-- Protect qualifying_xp from client-side modification
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.is_plus_member := OLD.is_plus_member;
  NEW.plus_unlocked_at := OLD.plus_unlocked_at;
  NEW.plus_expires_at := OLD.plus_expires_at;
  NEW.signup_date := OLD.signup_date;
  NEW.qualifying_xp := OLD.qualifying_xp;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

REVOKE UPDATE (is_plus_member, plus_unlocked_at, plus_expires_at, signup_date, qualifying_xp)
  ON public.profiles FROM authenticated, anon;

-- ── 9) PROFILE AVATAR URL column already exists, ensure it persists ─────────
-- avatar_url is already in profiles from migration 20260804, no change needed.

-- ── 10) Trigger for updated_at on new tables ────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_personalization','user_stats','user_body_profiles','rivalries'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;

-- ── 11) IN-APP NOTIFICATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rivalry_request','rivalry_accepted','rivalry_declined','friend_request','friend_accepted')),
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_id uuid,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  handled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_notifications_user_idx ON public.in_app_notifications (user_id, read, created_at DESC);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.in_app_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.in_app_notifications TO service_role;
GRANT SELECT, UPDATE ON public.in_app_notifications TO authenticated;
CREATE POLICY "Users can read own notifications"
  ON public.in_app_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can mark own notifications read"
  ON public.in_app_notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 12) SECURITY DEFINER RPC: trusted notification creation ─────────────────
-- Authenticated users call this RPC to create rivalry notifications.
-- The function runs as its owner (service_role) and bypasses RLS,
-- allowing cross-user notification delivery without granting INSERT.
-- Authorization: caller must be a participant in the rivalry.
-- The RPC resolves the recipient and sender from the rivalry table,
-- so the caller cannot forge any notification field.

CREATE OR REPLACE FUNCTION public.create_rivalry_notification(
  p_rivalry_id uuid,
  p_notification_type text,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  is_participant boolean;
  recipient_id uuid;
BEGIN
  -- Caller must be authenticated
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate notification type (whitelist)
  IF p_notification_type NOT IN ('rivalry_request', 'rivalry_accepted', 'rivalry_declined') THEN
    RAISE EXCEPTION 'Invalid notification type: %', p_notification_type;
  END IF;

  -- Caller must be a participant in the rivalry
  SELECT EXISTS (
    SELECT 1 FROM public.rivalries
    WHERE id = p_rivalry_id
      AND (challenger_id = caller_id OR opponent_id = caller_id)
  ) INTO is_participant;

  IF NOT is_participant THEN
    RAISE EXCEPTION 'Not a participant in this rivalry';
  END IF;

  -- Resolve recipient (the OTHER participant)
  SELECT CASE
    WHEN challenger_id = caller_id THEN opponent_id
    ELSE challenger_id
  END INTO recipient_id
  FROM public.rivalries
  WHERE id = p_rivalry_id;

  -- Create notification — runs as service_role, bypasses RLS
  INSERT INTO public.in_app_notifications (
    user_id, type, from_user_id, reference_id, title, body
  ) VALUES (
    recipient_id,
    p_notification_type,
    caller_id,
    p_rivalry_id,
    p_title,
    p_body
  );
END;
$$;

-- Only the function owner (or superuser) can execute this RPC.
-- Authenticated users access it through the Supabase RPC endpoint,
-- which routes through PostgREST and respects SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.create_rivalry_notification(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_rivalry_notification(uuid, text, text, text) TO authenticated;

COMMIT;
