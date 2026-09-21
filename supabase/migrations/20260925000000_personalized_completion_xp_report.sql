-- ============================================================================
-- SVJ HOTFIX — personalized completion: report the XP actually granted.
--
-- svj_complete_my_personalized_task capped the awarded XP at the daily
-- personalized-XP ceiling but returned the assignment's NOMINAL xp_reward,
-- so the client displayed (and telemetry recorded) more XP than the ledger
-- actually granted. This migration re-creates the RPC with
-- 'xpAwarded', v_awarded (the capped, ledger-confirmed figure).
--
-- Daily cap policy is UNCHANGED: 300 personalized XP per day; completions
-- past the cap still record completion but award 0 XP.
--
-- The idempotency, ledger and stat_event behavior is byte-for-byte the same
-- as 20260919010000; only the reported xpAwarded value changes.
-- ============================================================================

BEGIN;

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

  -- FIX: report the XP ACTUALLY granted (v_awarded), not the nominal reward.
  RETURN jsonb_build_object('ok', true, 'alreadyCompleted', false,
    'xpAwarded', v_awarded, 'statChanges', v_stat_changes);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_complete_my_personalized_task(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_complete_my_personalized_task(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
