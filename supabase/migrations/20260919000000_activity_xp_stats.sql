-- ============================================================================
-- Update 04: verified activity → Character Matrix + secure XP.
--
-- Additive only. One centralized server policy (`svj_activity_reward_policy`)
-- turns a canonical svj_activity into:
--   • bounded activity XP (base + capped duration bonus + one PR bonus)
--   • bounded Character Matrix stat gains (user_stats 1–100 scale)
-- every grant keyed by an immutable (user_id, event_key) row in the existing
-- activity_events ledger, so repeated invocation can never duplicate.
--
-- Anti-farming rules (server-side, never client-argued):
--   • manual-source activities: eligible for nothing (history/goals only)
--   • strength: one flat XP per qualifying workout, never per set/rep/kg
--   • daily activity-XP cap + per-stat daily caps (database clock)
--   • qualifying native cardio requires duration > 0 and genuine sensor
--     evidence (steps or distance > 0 for step-based types)
--   • absurd values are already rejected at save time; reward re-validates
--
-- NOT changed here: 60-Day verified completion XP, membership, goals, PR
-- record generation (records themselves), rivalry scoring, Earn Plus rules.
--
-- No backfill: only activities saved AFTER this rollout are rewarded.
-- ============================================================================

BEGIN;

-- ── 1) Server-only reward policy (single source of XP/stat numbers) ────────
-- Rows are read by the reward function; the client can never tune these.
CREATE TABLE IF NOT EXISTS public.svj_activity_reward_policy (
  activity_type text PRIMARY KEY CHECK (activity_type IN (
    'walking', 'running', 'cycling', 'football', 'hiit',
    'calisthenics', 'yoga', 'strength', 'other'
  )),
  min_duration_seconds integer NOT NULL CHECK (min_duration_seconds > 0),
  base_xp integer NOT NULL CHECK (base_xp BETWEEN 0 AND 100),
  stat_map jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(stat_map) = 'object'),
  requires_evidence boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true
);

INSERT INTO public.svj_activity_reward_policy
  (activity_type, min_duration_seconds, base_xp, stat_map, requires_evidence)
VALUES
  ('walking',      600, 10, '{"fitness": 1, "discipline": 0}', true),
  ('running',      600, 20, '{"fitness": 2, "discipline": 1}', true),
  ('cycling',      900, 20, '{"fitness": 2, "discipline": 1}', true),
  ('football',     900, 25, '{"fitness": 2, "discipline": 1}', true),
  ('hiit',         600, 20, '{"fitness": 2, "discipline": 1}', true),
  ('calisthenics', 600, 20, '{"fitness": 2, "discipline": 1}', true),
  ('yoga',         600, 15, '{"fitness": 1, "focus": 1}',      true),
  ('strength',     300, 25, '{"fitness": 2, "discipline": 1}', false),
  ('other',        600,  0, '{}'::jsonb,                       true)
ON CONFLICT (activity_type) DO NOTHING;

REVOKE ALL ON public.svj_activity_reward_policy FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.svj_activity_reward_policy TO service_role;

-- ── 2) Strength workout validity (evidence quality, not volume size) ───────
-- A strength workout qualifies only with real structured evidence:
-- ≥ 2 valid exercises AND ≥ 4 valid completed sets, OR ≥ 15 minutes with
-- valid structured sets. Amount of weight/reps/volume never scales XP.
CREATE OR REPLACE FUNCTION public.svj_strength_workout_qualifies(
  p_activity_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT COUNT(DISTINCT ae.id) FROM public.svj_activity_exercises ae
      WHERE ae.activity_id = p_activity_id) >= 2
    AND
    (SELECT COUNT(*) FROM public.svj_strength_sets s
      JOIN public.svj_activity_exercises ae ON ae.id = s.activity_exercise_id
      WHERE ae.activity_id = p_activity_id) >= 4
  ) OR (
    (SELECT a.duration_seconds FROM public.svj_activities a
      WHERE a.id = p_activity_id) >= 900
    AND
    (SELECT COUNT(*) FROM public.svj_strength_sets s
      JOIN public.svj_activity_exercises ae ON ae.id = s.activity_exercise_id
      WHERE ae.activity_id = p_activity_id) >= 1
  );
$$;

REVOKE ALL ON FUNCTION public.svj_strength_workout_qualifies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_strength_workout_qualifies(uuid) TO authenticated, service_role;

-- ── 3) Daily counters helper (database clock, indexed lookups) ─────────────
CREATE OR REPLACE FUNCTION public.svj_activity_xp_earned_today(
  p_user_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(e.lifetime_xp_delta), 0)::integer
  FROM public.activity_events e
  WHERE e.user_id = p_user_id
    AND e.source_class = 'workout'
    AND e.occurred_at >= date_trunc('day', now())
    AND e.occurred_at < date_trunc('day', now()) + interval '1 day';
$$;

-- ── 4) Stat events helper: immutable, evidence-keyed ───────────────────────
-- stat_events currently has no event_key; extend it additively so every
-- activity stat gain carries its own duplicate guard. Historical rows keep
-- NULL (their uniqueness is already enforced by their source RPCs).
ALTER TABLE public.stat_events
  ADD COLUMN IF NOT EXISTS event_key text;

-- One stat gain per (user, key). NULL keys (legacy 60-day rows) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS stat_events_identity
  ON public.stat_events (user_id, event_key)
  WHERE event_key IS NOT NULL;

ALTER TABLE public.stat_events ENABLE ROW LEVEL SECURITY;

-- stat_events grant was ALL-to-service_role already; a NULL-safe trigger is
-- unnecessary — inserts go through the definer reward function below.

-- ── 5) THE centralized reward processor ────────────────────────────────────
-- Callable by the authenticated owner right after a successful non-duplicate
-- save (or by service_role in future server flows). Derived entirely from
-- the canonical activity row: no xp_amount, stat_amount or user_id input.
-- Safe to call repeatedly: zero duplicates guaranteed by ledger uniqueness.
CREATE OR REPLACE FUNCTION public.svj_process_activity_rewards(
  p_activity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_activity public.svj_activities;
  v_policy public.svj_activity_reward_policy;
  v_event_key text;
  v_base_xp integer := 0;
  v_bonus_xp integer := 0;
  v_pr_xp integer := 0;
  v_awarded_xp integer := 0;
  v_cap_room integer;
  v_stat_gain jsonb;
  v_stat_name text;
  v_stat_delta integer;
  v_has_new_pr boolean;
  v_stat_changes jsonb := '{}'::jsonb;
  v_xp_event_key text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_activity FROM public.svj_activities
  WHERE id = p_activity_id AND user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found';
  END IF;

  -- Owner-only post-processing, exactly once. A duplicate save (same
  -- client_session_id) returns the same activity id, and the ledger key
  -- below makes a second call a no-op.
  v_xp_event_key := 'activity.xp:' || v_activity.id::text;

  -- ── Eligibility: canonical policy, never client-declared ────────────────
  IF v_activity.source = 'manual' THEN
    -- Manual generic activities earn nothing protected (history/goals only).
    RETURN jsonb_build_object(
      'ok', true, 'eligible', false, 'reason', 'manual_source',
      'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb,
      'dailyActivityXpRemaining', GREATEST(0,
        100 - public.svj_activity_xp_earned_today(v_caller))
    );
  END IF;

  SELECT * INTO v_policy FROM public.svj_activity_reward_policy
  WHERE activity_type = v_activity.activity_type AND enabled;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'eligible', false, 'reason', 'no_policy',
      'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
    );
  END IF;

  -- Sanity safeguards (defence in depth; save already bounds these).
  IF v_activity.duration_seconds <= 0 OR v_activity.duration_seconds > 86400 THEN
    RETURN jsonb_build_object(
      'ok', true, 'eligible', false, 'reason', 'invalid_duration',
      'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
    );
  END IF;
  IF v_policy.requires_evidence THEN
    -- Step-based cardio needs genuine sensor evidence: steps or measured
    -- distance. Cycling is the distance-measured exception handled below.
    IF v_activity.activity_type IN ('walking', 'running', 'cycling', 'football')
      AND v_activity.step_count <= 0
      AND (v_activity.distance_meters IS NULL OR v_activity.distance_meters <= 0) THEN
      RETURN jsonb_build_object(
        'ok', true, 'eligible', false, 'reason', 'no_evidence',
        'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
      );
    END IF;
  END IF;

  -- Idempotency fast-path: XP already processed for this activity.
  IF EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE user_id = v_caller AND event_key = v_xp_event_key
  ) THEN
    RETURN jsonb_build_object(
      'ok', true, 'eligible', true, 'xpAwarded', 0,
      'prBonusAwarded', 0, 'statChanges', '{}'::jsonb, 'duplicate', true,
      'dailyActivityXpRemaining', GREATEST(0,
        100 - public.svj_activity_xp_earned_today(v_caller))
    );
  END IF;

  -- ── Qualification ────────────────────────────────────────────────────────
  IF v_activity.activity_type = 'strength' THEN
    IF NOT public.svj_strength_workout_qualifies(v_activity.id) THEN
      RETURN jsonb_build_object(
        'ok', true, 'eligible', false, 'reason', 'insufficient_evidence',
        'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
      );
    END IF;
  ELSE
    IF v_activity.duration_seconds < v_policy.min_duration_seconds THEN
      RETURN jsonb_build_object(
        'ok', true, 'eligible', false, 'reason', 'duration_too_short',
        'xpAwarded', 0, 'prBonusAwarded', 0, 'statChanges', '{}'::jsonb
      );
    END IF;
  END IF;

  -- ── XP: base + bounded duration bonus (server clock, capped) ────────────
  v_base_xp := v_policy.base_xp;
  v_bonus_xp := CASE
    WHEN v_activity.duration_seconds >= 3600 THEN 15
    WHEN v_activity.duration_seconds >= 2700 THEN 10
    WHEN v_activity.duration_seconds >= 1800 THEN 5
    ELSE 0
  END;

  -- ── PR bonus: at most +5 per activity, once, evidence-keyed ─────────────
  SELECT EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE user_id = v_caller
      AND source_id = v_activity.id::text
      AND event_key LIKE 'personal_record.achieved:' || v_activity.id::text || ':%'
      AND NOT EXISTS (
        SELECT 1 FROM public.activity_events pr_xp
        WHERE pr_xp.user_id = v_caller
          AND pr_xp.event_key = 'activity.pr_bonus:' || v_activity.id::text
      )
  ) INTO v_has_new_pr;
  IF v_has_new_pr THEN
    v_pr_xp := 5;
  END IF;

  v_awarded_xp := LEAST(100, v_base_xp + v_bonus_xp + v_pr_xp);
  v_cap_room := GREATEST(0, 100 - public.svj_activity_xp_earned_today(v_caller));
  v_awarded_xp := LEAST(v_awarded_xp, v_cap_room);

  -- ── One immutable XP ledger event → aggregate once ───────────────────────
  INSERT INTO public.activity_events (
    user_id, event_key, event_type, source_class, source_id,
    occurred_at, lifetime_xp_delta, rivalry_xp_delta,
    stat_deltas, metadata
  ) VALUES (
    v_caller,
    v_xp_event_key,
    'xp_award',
    'workout',
    v_activity.id::text,
    v_activity.ended_at,
    v_awarded_xp,
    v_awarded_xp,
    v_policy.stat_map,
    jsonb_build_object(
      'activity_id', v_activity.id,
      'activity_type', v_activity.activity_type,
      'source', v_activity.source,
      'duration_seconds', v_activity.duration_seconds,
      'base_xp', v_base_xp,
      'duration_bonus', v_bonus_xp,
      'pr_bonus', v_pr_xp
    )
  )
  ON CONFLICT (user_id, event_key) DO NOTHING
  RETURNING id INTO v_event_key;

  IF v_event_key IS NOT NULL AND v_awarded_xp > 0 THEN
    PERFORM set_config('svj.trusted_server_write', 'on', true);
    UPDATE public.profiles
    SET total_xp = COALESCE(total_xp, 0) + v_awarded_xp
    WHERE id = v_caller;
  END IF;

  -- Separate PR-bonus evidence event so a recomputation can never re-grant.
  IF v_pr_xp > 0 THEN
    INSERT INTO public.activity_events (
      user_id, event_key, event_type, source_class, source_id,
      occurred_at, lifetime_xp_delta, rivalry_xp_delta, stat_deltas, metadata
    ) VALUES (
      v_caller,
      'activity.pr_bonus:' || v_activity.id::text,
      'xp_award',
      'workout',
      v_activity.id::text,
      v_activity.ended_at,
      0,
      0,
      '{}'::jsonb,
      jsonb_build_object('pr_bonus_included_in', v_xp_event_key)
    )
    ON CONFLICT (user_id, event_key) DO NOTHING;
  END IF;

  -- ── Stat events: small bounded gains with per-stat daily caps ───────────
  -- Daily caps: fitness +6, discipline +3, focus +2 (from activity).
  FOR v_stat_name, v_stat_delta IN
    SELECT * FROM jsonb_each_text(v_policy.stat_map)
  LOOP
    CONTINUE WHEN v_stat_delta IS NULL OR v_stat_delta::integer <= 0;

    v_cap_room := CASE v_stat_name
      WHEN 'fitness' THEN GREATEST(0, 6 - COALESCE((
        SELECT SUM(delta)::integer FROM public.stat_events
        WHERE user_id = v_caller AND stat_name = 'fitness'
          AND source = 'activity'
          AND created_at >= date_trunc('day', now())
      ), 0))
      WHEN 'discipline' THEN GREATEST(0, 3 - COALESCE((
        SELECT SUM(delta)::integer FROM public.stat_events
        WHERE user_id = v_caller AND stat_name = 'discipline'
          AND source = 'activity'
          AND created_at >= date_trunc('day', now())
      ), 0))
      WHEN 'focus' THEN GREATEST(0, 2 - COALESCE((
        SELECT SUM(delta)::integer FROM public.stat_events
        WHERE user_id = v_caller AND stat_name = 'focus'
          AND source = 'activity'
          AND created_at >= date_trunc('day', now())
      ), 0))
      ELSE 0
    END;
    CONTINUE WHEN v_cap_room <= 0;

    v_stat_delta := LEAST(v_stat_delta::integer, v_cap_room);

    INSERT INTO public.stat_events (user_id, stat_name, delta, source, source_id, event_key)
    VALUES (
      v_caller,
      v_stat_name,
      v_stat_delta,
      'activity',
      v_activity.id::text,
      'activity.stat:' || v_activity.id::text || ':' || v_stat_name
    )
    ON CONFLICT DO NOTHING;

    -- user_stats is the aggregate: derive ONLY from server stat events.
    UPDATE public.user_stats
    SET fitness     = LEAST(100, fitness     + CASE WHEN v_stat_name = 'fitness'     THEN v_stat_delta ELSE 0 END),
        discipline  = LEAST(100, discipline  + CASE WHEN v_stat_name = 'discipline'  THEN v_stat_delta ELSE 0 END),
        focus       = LEAST(100, focus       + CASE WHEN v_stat_name = 'focus'       THEN v_stat_delta ELSE 0 END)
    WHERE user_id = v_caller;

    v_stat_changes := v_stat_changes || jsonb_build_object(v_stat_name, v_stat_delta);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'eligible', true,
    'xpAwarded', v_awarded_xp,
    'prBonusAwarded', CASE WHEN v_pr_xp > 0 AND v_awarded_xp > 0 THEN 5 ELSE 0 END,
    'statChanges', v_stat_changes,
    'dailyActivityXpRemaining', GREATEST(0, 100 - public.svj_activity_xp_earned_today(v_caller))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.svj_process_activity_rewards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_process_activity_rewards(uuid) TO authenticated;

-- ── 6) Indexes for the cap/ledger queries (no full scans on save) ──────────
CREATE INDEX IF NOT EXISTS activity_events_key_class_idx
  ON public.activity_events (user_id, source_class, occurred_at DESC)
  WHERE source_class = 'workout';
CREATE INDEX IF NOT EXISTS stat_events_activity_day_idx
  ON public.stat_events (user_id, stat_name, created_at DESC)
  WHERE source = 'activity';

-- ── 7) PostgREST schema reload (managed environments pick this up live) ────
NOTIFY pgrst, 'reload schema';

COMMIT;
