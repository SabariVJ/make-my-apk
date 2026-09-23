-- ============================================================================
-- Automated Training — multi-device plan-slot finalization.
--
-- ADDITIVE. Replaces svj_record_training_context with a version that:
--
--   1. Claims the plan slot with a single row-locking UPDATE. The device that
--      matches the row wins; the loser matches nothing and is told the slot is
--      already finalized instead of silently creating a second completion.
--   2. Increments template usage ONLY for the activity that actually claimed the
--      slot (or for a browse-launched session with no slot). A second activity
--      that lost the race can no longer bump the same template twice.
--   3. Returns the slot state so a stale second device can reconcile its view.
--
-- Progression decisions are already unique per (user, exercise, evidence
-- activity) via 20260928000000; that index is what stops one workout's evidence
-- from producing two decisions.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.svj_record_training_context(
  p_client_session_id text,
  p_context jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_activity_id uuid;
  v_plan_session_id uuid;
  v_inserted boolean := false;
  v_slot_owner uuid;
  v_slot_status text;
  v_prior_status text;
  v_claimed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT id INTO v_activity_id FROM public.svj_activities
    WHERE user_id = v_user_id AND client_session_id = btrim(p_client_session_id);
  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'No saved workout found for this session';
  END IF;

  v_plan_session_id := NULLIF(p_context->>'plan_session_id', '')::uuid;

  -- Ownership is verified before any link is written.
  IF v_plan_session_id IS NOT NULL THEN
    SELECT s.user_id, s.status INTO v_slot_owner, v_slot_status
      FROM public.svj_training_plan_sessions s
     WHERE s.id = v_plan_session_id;
    IF v_slot_owner IS NULL OR v_slot_owner <> v_user_id THEN
      RAISE EXCEPTION 'Unknown plan session';
    END IF;
    v_prior_status := v_slot_status;
  END IF;

  INSERT INTO public.svj_activity_training_context (
    activity_id, user_id, plan_id, plan_session_id, template_id,
    template_version, targets, feedback
  ) VALUES (
    v_activity_id,
    v_user_id,
    NULLIF(p_context->>'plan_id', '')::uuid,
    v_plan_session_id,
    NULLIF(p_context->>'template_id', ''),
    NULLIF(p_context->>'template_version', '')::integer,
    COALESCE(p_context->'targets', '[]'::jsonb),
    COALESCE(p_context->'feedback', '{}'::jsonb)
  )
  ON CONFLICT (activity_id) DO NOTHING;
  v_inserted := FOUND;

  -- Finalize the slot exactly once. The UPDATE takes a row lock, so two
  -- concurrent devices serialize: one claims the slot, the other sees it taken.
  -- Note: a zero-row `RETURNING ... INTO` assigns NULL, so the prior status is
  -- kept in its own variable for the response below.
  IF v_plan_session_id IS NOT NULL THEN
    UPDATE public.svj_training_plan_sessions
      SET status = 'completed',
          completed_activity_id = v_activity_id,
          updated_at = now()
      WHERE id = v_plan_session_id
        AND user_id = v_user_id
        AND (status <> 'completed' OR completed_activity_id = v_activity_id)
      RETURNING status INTO v_slot_status;
    v_claimed := FOUND;
  END IF;

  -- Template usage increments once, and only for the activity that owns the
  -- slot (or for a session launched straight from the template browser).
  IF v_inserted
     AND p_context->>'template_id' IS NOT NULL
     AND (v_plan_session_id IS NULL OR v_claimed) THEN
    UPDATE public.svj_user_template_library
      SET use_count = use_count + 1,
          last_completed_at = now(),
          updated_at = now()
      WHERE user_id = v_user_id AND template_id = p_context->>'template_id';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', NOT v_inserted,
    'activity_id', v_activity_id,
    'slot_status', COALESCE(v_slot_status, v_prior_status, 'none'),
    'slot_claimed', v_claimed,
    'slot_already_finalized',
      v_plan_session_id IS NOT NULL AND v_prior_status = 'completed' AND NOT v_claimed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.svj_record_training_context(text, jsonb) TO authenticated;

COMMIT;
