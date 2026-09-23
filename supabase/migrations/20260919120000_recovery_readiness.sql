-- ============================================================================
-- SVJ UPDATE 05 — Recovery / Training Load / Readiness foundation.
--
-- Deterministic, non-AI: every input is either recorded server activity
-- (svj_activities) or an explicit user check-in. No diagnosis, no medical
-- claims, no fake wearable data. HRV and resting heart rate are intentionally
-- absent because they are not stored.
--
--   TRAINING LOAD  — derived from the last 7 days of canonical activity
--                    (duration + type weighting), stored per day.
--   CHECK-INS      — sleep hours, soreness, energy, perceived recovery
--                    (1–5 scales), one per user per day, idempotent upsert.
--   READINESS      — transparent deterministic score 0–100 from load +
--                    today's check-in, persisted per day, recomputed on
--                    every read/write.
-- ============================================================================

BEGIN;

-- ── 1) Daily recovery check-ins (user-reported, one per day) ────────────────
CREATE TABLE IF NOT EXISTS public.svj_recovery_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  sleep_hours numeric(4,1) CHECK (sleep_hours BETWEEN 0 AND 24),
  soreness integer CHECK (soreness BETWEEN 1 AND 5),
  energy integer CHECK (energy BETWEEN 1 AND 5),
  perceived_recovery integer CHECK (perceived_recovery BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_recovery_checkins_server_clock
    CHECK (created_at <= now() + interval '1 minute'),
  CONSTRAINT svj_recovery_checkins_identity UNIQUE (user_id, checkin_date)
);

ALTER TABLE public.svj_recovery_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_recovery_checkins FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_recovery_checkins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.svj_recovery_checkins TO authenticated;
GRANT ALL ON public.svj_recovery_checkins TO service_role;

DROP POLICY IF EXISTS "Users manage own recovery checkins"
  ON public.svj_recovery_checkins;
CREATE POLICY "Users manage own recovery checkins"
  ON public.svj_recovery_checkins FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2) Daily readiness snapshot (server-derived; no client inputs) ─────────
CREATE TABLE IF NOT EXISTS public.svj_readiness_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  readiness_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  training_load text NOT NULL
    CHECK (training_load IN ('low', 'moderate', 'high', 'very_high')),
  load_score integer NOT NULL CHECK (load_score BETWEEN 0 AND 100),
  recovery_grade text NOT NULL
    CHECK (recovery_grade IN ('poor', 'fair', 'good', 'excellent', 'unknown')),
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_readiness_identity UNIQUE (user_id, readiness_date)
);

ALTER TABLE public.svj_readiness_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_readiness_daily FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_readiness_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_readiness_daily TO authenticated;
GRANT ALL ON public.svj_readiness_daily TO service_role;

DROP POLICY IF EXISTS "Users read own readiness"
  ON public.svj_readiness_daily;
CREATE POLICY "Users read own readiness"
  ON public.svj_readiness_daily FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS svj_readiness_user_day_idx
  ON public.svj_readiness_daily (user_id, readiness_date DESC);
CREATE INDEX IF NOT EXISTS svj_recovery_checkins_user_day_idx
  ON public.svj_recovery_checkins (user_id, checkin_date DESC);

-- ── 3) Deterministic scoring helpers ───────────────────────────────────────

-- Training-load points from one canonical activity. Weights are transparent:
--   strength/heavy types count 1.3×/minute, general cardio 1.0×, walking 0.6×.
-- Duration is capped at 3h per activity to neutralize accidental 24h logs.
CREATE OR REPLACE FUNCTION public.svj_activity_load_points(
  p_activity_type text,
  p_duration_seconds integer
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ROUND(
    LEAST(p_duration_seconds, 10800) / 60.0
    * CASE p_activity_type
        WHEN 'strength' THEN 1.3
        WHEN 'hiit' THEN 1.25
        WHEN 'running' THEN 1.1
        WHEN 'cycling' THEN 1.0
        WHEN 'football' THEN 1.15
        WHEN 'calisthenics' THEN 1.1
        WHEN 'yoga' THEN 0.7
        WHEN 'walking' THEN 0.6
        ELSE 0.9
      END
  );
$$;

-- Load points accumulated over the trailing 7 days (database clock).
CREATE OR REPLACE FUNCTION public.svj_training_load_points(
  p_user_id uuid,
  p_days integer DEFAULT 7
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    public.svj_activity_load_points(a.activity_type, a.duration_seconds)
  ), 0)
  FROM public.svj_activities a
  WHERE a.user_id = p_user_id
    AND a.ended_at >= now() - make_interval(days => p_days)
    AND a.ended_at < now();
$$;

CREATE OR REPLACE FUNCTION public.svj_load_band(p_points numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_points <= 120 THEN 'low'
    WHEN p_points <= 300 THEN 'moderate'
    WHEN p_points <= 520 THEN 'high'
    ELSE 'very_high'
  END;
$$;

-- ── 4) Readiness computation + snapshot upsert (internal, definer) ─────────
CREATE OR REPLACE FUNCTION public.svj_compute_readiness(p_user_id uuid, p_day date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points numeric;
  v_band text;
  v_checkin public.svj_recovery_checkins%ROWTYPE;
  v_rest_days integer;
  v_score integer;
  v_load_penalty integer := 0;
  v_recovery_grade text := 'unknown';
  v_components jsonb;
BEGIN
  v_points := public.svj_training_load_points(p_user_id, 7);
  v_band := public.svj_load_band(v_points);

  -- Rest-day awareness: how many of the last 3 days had no activity.
  SELECT COUNT(*)::integer INTO v_rest_days
  FROM generate_series(0, 2) AS d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.svj_activities a
    WHERE a.user_id = p_user_id
      AND a.ended_at >= (now() - make_interval(days => d + 1))
      AND a.ended_at <  (now() - make_interval(days => d))
  );

  SELECT * INTO v_checkin FROM public.svj_recovery_checkins
  WHERE user_id = p_user_id AND checkin_date = p_day;

  -- Transparent load penalty: only a HIGH/VERY_HIGH week with no recent rest
  -- reduces the score. Moderate training is neutral, low training is neutral.
  IF v_band = 'high' AND v_rest_days = 0 THEN v_load_penalty := 12; END IF;
  IF v_band = 'very_high' THEN v_load_penalty := 20; END IF;
  IF v_band = 'very_high' AND v_rest_days = 0 THEN v_load_penalty := 28; END IF;

  -- Base score: 70 (train-normally default) minus load penalty, then blended
  -- with today's self-reported recovery when the user checked in.
  v_score := 70 - v_load_penalty;

  IF v_checkin.checkin_date IS NOT NULL THEN
    -- Each 1–5 input maps to 0–20 points; the three inputs are averaged.
    v_recovery_grade := CASE
      WHEN v_checkin.perceived_recovery IS NULL THEN 'unknown'
      WHEN v_checkin.perceived_recovery >= 4 THEN 'good'
      WHEN v_checkin.perceived_recovery = 3 THEN 'fair'
      ELSE 'poor'
    END;
    v_score := ROUND((
      (v_score * 0.5)
      + ((
          -- sleep: <=5h → low, >=8h → full
          LEAST(20, GREATEST(0,
            (COALESCE(v_checkin.sleep_hours, 7) - 5) / 3.0 * 20))
          -- soreness: 1 (none) → 20, 5 (severe) → 0
        + (6 - COALESCE(v_checkin.soreness, 3)) * 5
          -- energy: 1 → 4, 5 → 20
        + COALESCE(v_checkin.energy, 3) * 4
        ) / 60.0 * 100 * 0.5
      ))
    )::integer;
    -- Perceived recovery nudges ±5 at the extremes.
    IF v_checkin.perceived_recovery = 5 THEN v_score := v_score + 5; END IF;
    IF v_checkin.perceived_recovery = 1 THEN v_score := v_score - 5; END IF;
    v_recovery_grade := CASE
      WHEN v_score >= 78 THEN 'excellent'
      WHEN v_score >= 60 THEN 'good'
      WHEN v_score >= 40 THEN 'fair'
      ELSE 'poor'
    END;
  END IF;

  v_score := GREATEST(0, LEAST(100, v_score));

  v_components := jsonb_build_object(
    'loadPoints7d', v_points,
    'loadBand', v_band,
    'restDaysLast3', v_rest_days,
    'loadPenalty', v_load_penalty,
    'sleepHours', v_checkin.sleep_hours,
    'soreness', v_checkin.soreness,
    'energy', v_checkin.energy,
    'perceivedRecovery', v_checkin.perceived_recovery,
    'dataSources', jsonb_build_array(
      CASE WHEN v_points > 0 THEN 'recorded_activity' ELSE NULL END,
      CASE WHEN v_checkin.checkin_date IS NOT NULL THEN 'user_checkin' ELSE NULL END
    )
  );

  INSERT INTO public.svj_readiness_daily (
    user_id, readiness_date, score, training_load, load_score,
    recovery_grade, components
  ) VALUES (
    p_user_id, p_day, v_score,
    v_band,
    LEAST(100, ROUND(v_points / 5.2)::integer),
    v_recovery_grade,
    v_components
  )
  ON CONFLICT (user_id, readiness_date) DO UPDATE SET
    score = EXCLUDED.score,
    training_load = EXCLUDED.training_load,
    load_score = EXCLUDED.load_score,
    recovery_grade = EXCLUDED.recovery_grade,
    components = EXCLUDED.components,
    updated_at = now();

  RETURN jsonb_build_object(
    'score', v_score,
    'trainingLoad', v_band,
    'recovery', v_recovery_grade,
    'todayAdvice', CASE
      WHEN v_score >= 78 THEN 'Train normally — push if you feel good.'
      WHEN v_score >= 60 THEN 'Train normally.'
      WHEN v_score >= 40 THEN 'Light session recommended.'
      ELSE 'Rest or very light movement today.'
    END,
    'components', v_components
  );
END;
$$;

REVOKE ALL ON FUNCTION public.svj_compute_readiness(uuid, date)
  FROM PUBLIC, anon, authenticated;

-- ── 5) Self-service RPCs (no admin key; identity = auth.uid()) ─────────────

-- Upsert today's check-in and return the recomputed readiness. Idempotent
-- per day: resubmitting updates the row and the score.
CREATE OR REPLACE FUNCTION public.svj_save_my_recovery_checkin(
  p_sleep_hours numeric,
  p_soreness integer,
  p_energy integer,
  p_perceived_recovery integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_sleep_hours IS NOT NULL AND (p_sleep_hours < 0 OR p_sleep_hours > 24) THEN
    RAISE EXCEPTION 'Invalid sleep hours';
  END IF;
  IF p_soreness IS NOT NULL AND p_soreness NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Invalid soreness';
  END IF;
  IF p_energy IS NOT NULL AND p_energy NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Invalid energy';
  END IF;
  IF p_perceived_recovery IS NOT NULL AND p_perceived_recovery NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Invalid perceived recovery';
  END IF;
  IF p_sleep_hours IS NULL AND p_soreness IS NULL AND p_energy IS NULL
     AND p_perceived_recovery IS NULL THEN
    RAISE EXCEPTION 'At least one check-in value is required';
  END IF;

  INSERT INTO public.svj_recovery_checkins (
    user_id, checkin_date, sleep_hours, soreness, energy, perceived_recovery
  ) VALUES (
    v_caller, v_today, p_sleep_hours, p_soreness, p_energy, p_perceived_recovery
  )
  ON CONFLICT (user_id, checkin_date) DO UPDATE SET
    sleep_hours = COALESCE(EXCLUDED.sleep_hours, svj_recovery_checkins.sleep_hours),
    soreness = COALESCE(EXCLUDED.soreness, svj_recovery_checkins.soreness),
    energy = COALESCE(EXCLUDED.energy, svj_recovery_checkins.energy),
    perceived_recovery = COALESCE(EXCLUDED.perceived_recovery, svj_recovery_checkins.perceived_recovery),
    updated_at = now();

  RETURN public.svj_compute_readiness(v_caller, v_today);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_save_my_recovery_checkin(numeric, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_save_my_recovery_checkin(numeric, integer, integer, integer)
  TO authenticated;

-- Read today's readiness (recomputes from stored activity + check-in).
CREATE OR REPLACE FUNCTION public.svj_get_my_readiness()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN public.svj_compute_readiness(v_caller, v_today);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_get_my_readiness()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_get_my_readiness() TO authenticated;

-- 30-day history of readiness + check-ins for trends.
CREATE OR REPLACE FUNCTION public.svj_list_my_recovery_history(
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_limit integer := GREATEST(1, LEAST(90, COALESCE(p_limit, 30)));
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  RETURN COALESCE(jsonb_agg(row ORDER BY row.readiness_date DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'date', r.readiness_date,
      'score', r.score,
      'trainingLoad', r.training_load,
      'recovery', r.recovery_grade
    ) AS row
    FROM public.svj_readiness_daily r
    WHERE r.user_id = v_caller
    ORDER BY r.readiness_date DESC
    LIMIT v_limit
  ) s;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_list_my_recovery_history(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_my_recovery_history(integer)
  TO authenticated;

-- ── 6) PostgREST schema reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
