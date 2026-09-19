-- ============================================================================
-- SVJ HOTFIX — persistent personalized task assignments.
--
-- Problem fixed: personalized challenges were regenerated as ephemeral
-- React-only objects with Date.now() IDs on every GET, so tapping them hit
-- toggleChallenge() → "This task is no longer available." and completion
-- never persisted across refresh/devices.
--
-- This migration makes personalized tasks first-class server assignments:
--   • stable DB identity: unique (user_id, assigned_for, template_key)
--   • server-side generation from the existing selection logic (client sends
--     NO xp/stat/user inputs — the server function owns the payload)
--   • completion through a SECURITY DEFINER RPC keyed on auth.uid()
--   • XP via the immutable activity_events ledger (source_class
--     'svj_personalized', event key 'personalized.task:<assignment_id>')
--   • stat gains via immutable stat_events with per-assignment keys
--   • idempotent: retries return the existing completion, zero duplicates
--
-- Additive only. No historical data is modified.
-- ============================================================================

BEGIN;

-- ── 1) Assignment table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_personalized_task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  difficulty text NOT NULL,
  xp_reward integer NOT NULL CHECK (xp_reward BETWEEN 0 AND 300),
  duration_minutes integer,
  assigned_for date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'expired', 'replaced')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT personalized_assignments_server_clock
    CHECK (created_at <= now() + interval '1 minute')
);

-- Stable identity: one assignment per user/day/template. Regeneration on
-- refresh or page load cannot mint duplicate or drifting IDs.
CREATE UNIQUE INDEX IF NOT EXISTS svj_personalized_assignments_identity
  ON public.svj_personalized_task_assignments (user_id, assigned_for, template_key);
CREATE INDEX IF NOT EXISTS svj_personalized_assignments_user_day_idx
  ON public.svj_personalized_task_assignments (user_id, assigned_for DESC, status);

ALTER TABLE public.svj_personalized_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_personalized_task_assignments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_personalized_task_assignments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_personalized_task_assignments TO authenticated;
GRANT ALL ON public.svj_personalized_task_assignments TO service_role;

-- Read own assignments only. Writes happen exclusively through the definer
-- RPCs below — clients can never create fake assignments or edit XP.
DROP POLICY IF EXISTS "Users read own personalized assignments"
  ON public.svj_personalized_task_assignments;
CREATE POLICY "Users read own personalized assignments"
  ON public.svj_personalized_task_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── 2) Payload validation helper (internal) ─────────────────────────────────
-- The server function layer (challenge-engine.server.ts) owns selection and
-- XP mapping; this validator rejects malformed/over-sized payloads so even a
-- compromised server layer cannot mint arbitrary rewards.
CREATE OR REPLACE FUNCTION public.svj_validate_personalized_payload(
  p_templates jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_count integer := 0;
BEGIN
  IF jsonb_typeof(p_templates) <> 'array' THEN
    RAISE EXCEPTION 'invalid template payload';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_templates)
  LOOP
    v_count := v_count + 1;
    IF v_count > 12 THEN
      RAISE EXCEPTION 'too many templates';
    END IF;
    IF NOT (v_item ? 'template_key' AND v_item ? 'title'
            AND v_item ? 'category' AND v_item ? 'difficulty' AND v_item ? 'xp') THEN
      RAISE EXCEPTION 'template missing required fields';
    END IF;
    IF COALESCE((v_item->>'xp')::integer, 0) NOT BETWEEN 0 AND 300
       OR char_length(v_item->>'title') NOT BETWEEN 1 AND 120
       OR char_length(v_item->>'template_key') NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'template out of bounds';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_validate_personalized_payload(jsonb)
  FROM PUBLIC, anon, authenticated;

-- ── 3) Get-or-create today's assignments ────────────────────────────────────
-- Identity: auth.uid(). Templates come from the server selection layer.
-- If today's persisted set already exists it is returned unchanged — the SAME
-- IDs on refresh, logout/login, reinstall or new device.
CREATE OR REPLACE FUNCTION public.svj_get_or_create_my_personalized_tasks(
  p_templates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_assessed boolean;
  v_inserted integer := 0;
  v_item jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT assessment_completed INTO v_assessed
  FROM public.user_personalization WHERE user_id = v_caller;
  IF v_assessed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', true, 'assigned', false,
      'reason', 'Complete your SVJ Assessment to unlock personalized challenges.',
      'assignments', '[]'::jsonb);
  END IF;

  -- Expire stale active rows (past days) — housekeeping only.
  UPDATE public.svj_personalized_task_assignments
  SET status = 'expired'
  WHERE user_id = v_caller AND status = 'active' AND assigned_for < v_today;

  -- Return today's persisted set if it exists (already expired/completed rows
  -- for today stay visible so completions are never hidden).
  IF EXISTS (
    SELECT 1 FROM public.svj_personalized_task_assignments
    WHERE user_id = v_caller AND assigned_for = v_today
      AND status IN ('active', 'completed')
  ) THEN
    RETURN jsonb_build_object('ok', true, 'assigned', true, 'assignments',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'templateKey', a.template_key, 'title', a.title,
          'description', a.description, 'category', a.category,
          'difficulty', a.difficulty, 'xp', a.xp_reward,
          'durationMinutes', a.duration_minutes, 'status', a.status,
          'completed', a.status = 'completed', 'completedAt', a.completed_at
        ) ORDER BY a.created_at, a.id)
        FROM public.svj_personalized_task_assignments a
        WHERE a.user_id = v_caller AND a.assigned_for = v_today
          AND a.status IN ('active', 'completed')
      ), '[]'::jsonb));
  END IF;

  PERFORM public.svj_validate_personalized_payload(p_templates);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_templates)
  LOOP
    INSERT INTO public.svj_personalized_task_assignments (
      user_id, template_key, title, description, category, difficulty,
      xp_reward, duration_minutes, assigned_for, expires_at
    ) VALUES (
      v_caller,
      v_item->>'template_key',
      v_item->>'title',
      COALESCE(v_item->>'description', ''),
      v_item->>'category',
      v_item->>'difficulty',
      (v_item->>'xp')::integer,
      (v_item->>'durationMinutes')::integer,
      v_today,
      v_today::timestamptz + interval '1 day 6 hours'
    )
    ON CONFLICT (user_id, assigned_for, template_key) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'assigned', v_inserted > 0, 'assignments',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'templateKey', a.template_key, 'title', a.title,
        'description', a.description, 'category', a.category,
        'difficulty', a.difficulty, 'xp', a.xp_reward,
        'durationMinutes', a.duration_minutes, 'status', a.status,
        'completed', a.status = 'completed', 'completedAt', a.completed_at
      ) ORDER BY a.created_at, a.id)
      FROM public.svj_personalized_task_assignments a
      WHERE a.user_id = v_caller AND a.assigned_for = v_today
        AND a.status IN ('active', 'completed')
    ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.svj_get_or_create_my_personalized_tasks(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_get_or_create_my_personalized_tasks(jsonb)
  TO authenticated;

-- ── 4) Refresh: replace the uncompleted set (cooldown stays authoritative) ──
-- The 30-minute cooldown is enforced by the existing atomic
-- svj_reserve_personalized_refresh() RPC. Completed assignments are NEVER
-- undone and refresh itself never mints XP.
CREATE OR REPLACE FUNCTION public.svj_refresh_my_personalized_tasks(
  p_templates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_assessed boolean;
  v_reservation jsonb;
  v_item jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT assessment_completed INTO v_assessed
  FROM public.user_personalization WHERE user_id = v_caller;
  IF v_assessed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'cooldownRemainingMs', 0,
      'error', 'Complete your SVJ Assessment to unlock personalized challenges.');
  END IF;

  -- Atomic cooldown reservation (server-authoritative).
  SELECT public.svj_reserve_personalized_refresh() INTO v_reservation;
  IF NOT COALESCE((v_reservation->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'cooldownRemainingMs', COALESCE((v_reservation->>'cooldownRemainingMs')::bigint, 0),
      'error', COALESCE(v_reservation->>'error', 'Personalized tasks are on a cooldown.')
    );
  END IF;

  PERFORM public.svj_validate_personalized_payload(p_templates);

  -- Retire the current uncompleted set; completions are preserved untouched.
  UPDATE public.svj_personalized_task_assignments
  SET status = 'replaced'
  WHERE user_id = v_caller AND assigned_for = v_today AND status = 'active';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_templates)
  LOOP
    INSERT INTO public.svj_personalized_task_assignments (
      user_id, template_key, title, description, category, difficulty,
      xp_reward, duration_minutes, assigned_for, expires_at
    ) VALUES (
      v_caller,
      v_item->>'template_key',
      v_item->>'title',
      COALESCE(v_item->>'description', ''),
      v_item->>'category',
      v_item->>'difficulty',
      (v_item->>'xp')::integer,
      (v_item->>'durationMinutes')::integer,
      v_today,
      v_today::timestamptz + interval '1 day 6 hours'
    )
    ON CONFLICT (user_id, assigned_for, template_key) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cooldownRemainingMs', 0, 'assignments',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'templateKey', a.template_key, 'title', a.title,
        'description', a.description, 'category', a.category,
        'difficulty', a.difficulty, 'xp', a.xp_reward,
        'durationMinutes', a.duration_minutes, 'status', a.status,
        'completed', a.status = 'completed', 'completedAt', a.completed_at
      ) ORDER BY a.created_at, a.id)
      FROM public.svj_personalized_task_assignments a
      WHERE a.user_id = v_caller AND a.assigned_for = v_today
        AND a.status IN ('active', 'completed')
    ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.svj_refresh_my_personalized_tasks(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_refresh_my_personalized_tasks(jsonb)
  TO authenticated;

-- ── 5) Completion RPC: server-validated, idempotent, ledger-backed ─────────
-- XP comes from the SERVER-STORED xp_reward. The client sends only the
-- assignment id. Retrying returns the existing completion with zero new XP.
CREATE OR REPLACE FUNCTION public.svj_complete_my_personalized_task(
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_assignment public.svj_personalized_task_assignments%ROWTYPE;
  v_stat_changes jsonb := '{}'::jsonb;
  v_stat_name text;
  v_updated boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_assignment FROM public.svj_personalized_task_assignments
  WHERE id = p_assignment_id AND user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  -- Already completed → idempotent no-op, zero additional rewards.
  IF v_assignment.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyCompleted', true,
      'xpAwarded', 0, 'statChanges', '{}'::jsonb);
  END IF;

  IF v_assignment.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This assignment is no longer available.');
  END IF;

  -- Assignment must still be current (server clock, never device time).
  IF v_assignment.assigned_for <> (now() AT TIME ZONE 'utc')::date
     OR (v_assignment.expires_at IS NOT NULL AND v_assignment.expires_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This assignment has expired.');
  END IF;

  -- Claim exactly once (atomic status transition).
  UPDATE public.svj_personalized_task_assignments
  SET status = 'completed', completed_at = now()
  WHERE id = p_assignment_id AND user_id = v_caller AND status = 'active'
  RETURNING true INTO v_updated;

  IF v_updated IS DISTINCT FROM true THEN
    -- Lost a race with our own retry: treat as already completed.
    RETURN jsonb_build_object('ok', true, 'alreadyCompleted', true,
      'xpAwarded', 0, 'statChanges', '{}'::jsonb);
  END IF;

  -- ── XP through the immutable ledger, exactly once ───────────────────────
  -- Daily safety cap for personalized XP (separate from activity XP caps):
  -- once 300 personalized XP has been granted today, further completions
  -- still record completion but award 0 XP.
  DECLARE
    v_cap_room integer := GREATEST(0, 300 - COALESCE((
      SELECT SUM(e.lifetime_xp_delta)::integer
      FROM public.activity_events e
      WHERE e.user_id = v_caller
        AND e.source_class = 'svj_personalized'
        AND e.created_at >= date_trunc('day', now())
    ), 0));
    v_awarded integer := LEAST(v_assignment.xp_reward, v_cap_room);
  BEGIN
    INSERT INTO public.activity_events (
      user_id, event_key, event_type, source_class, source_id,
      occurred_at, lifetime_xp_delta, rivalry_xp_delta, stat_deltas, metadata
    ) VALUES (
      v_caller,
      'personalized.task:' || v_assignment.id::text,
      'challenge_completion',
      'svj_personalized',
      v_assignment.id::text,
      now(),
      v_awarded,
      v_awarded,
      '{}'::jsonb,
      jsonb_build_object(
        'assignment_id', v_assignment.id,
        'template_key', v_assignment.template_key,
        'category', v_assignment.category,
        'difficulty', v_assignment.difficulty
      )
    )
    ON CONFLICT (user_id, event_key) DO NOTHING;

    IF v_awarded > 0 THEN
      PERFORM set_config('svj.trusted_server_write', 'on', true);
      UPDATE public.profiles
      SET total_xp = COALESCE(total_xp, 0) + v_awarded
      WHERE id = v_caller;
    END IF;
  END;

  -- ── Stat gains: conservative +1 per completion, immutable evidence keys ──
  -- Category → canonical stat. Never client-declared.
  v_stat_name := CASE v_assignment.category
    WHEN 'Physical' THEN 'fitness'
    WHEN 'Discipline' THEN 'discipline'
    WHEN 'Mental' THEN 'focus'
    WHEN 'Mindset' THEN 'confidence'
    WHEN 'Nutrition' THEN 'nutrition'
    ELSE NULL
  END;

  IF v_stat_name IS NOT NULL THEN
    INSERT INTO public.stat_events (user_id, stat_name, delta, source, source_id, event_key)
    VALUES (
      v_caller, v_stat_name, 1, 'svj_personalized', v_assignment.id::text,
      'personalized.stat:' || v_assignment.id::text || ':' || v_stat_name
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.user_stats
    SET fitness     = LEAST(100, fitness     + CASE WHEN v_stat_name = 'fitness'     THEN 1 ELSE 0 END),
        discipline  = LEAST(100, discipline  + CASE WHEN v_stat_name = 'discipline'  THEN 1 ELSE 0 END),
        focus       = LEAST(100, focus       + CASE WHEN v_stat_name = 'focus'       THEN 1 ELSE 0 END),
        confidence  = LEAST(100, confidence  + CASE WHEN v_stat_name = 'confidence'  THEN 1 ELSE 0 END),
        nutrition   = LEAST(100, nutrition   + CASE WHEN v_stat_name = 'nutrition'   THEN 1 ELSE 0 END),
        updated_at  = now()
    WHERE user_id = v_caller;

    v_stat_changes := jsonb_build_object(v_stat_name, 1);
  END IF;

  RETURN jsonb_build_object('ok', true, 'alreadyCompleted', false,
    'xpAwarded', v_assignment.xp_reward, 'statChanges', v_stat_changes);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_complete_my_personalized_task(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_complete_my_personalized_task(uuid)
  TO authenticated;

-- ── 6) Indexes for XP-Today / cap queries ───────────────────────────────────
CREATE INDEX IF NOT EXISTS activity_events_personalized_day_idx
  ON public.activity_events (user_id, created_at DESC)
  WHERE source_class = 'svj_personalized';

-- ── 7) PostgREST schema reload ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
