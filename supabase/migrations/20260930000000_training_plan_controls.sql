-- ============================================================================
-- Automated Training — plan day management.
--
-- ADDITIVE. Users can move or skip a planned session. Rules enforced on the
-- server, not in the UI:
--
--   * a COMPLETED session can never be rescheduled or skipped — completed
--     history is immutable;
--   * a session can never be moved onto a day that already carries another
--     session in the same plan, so the app can never stack two demanding
--     sessions on one day to "repair" a missed one;
--   * only the owner of the plan can touch it.
--
-- Skipping is a legitimate state: a rest day is not a failure.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.svj_reschedule_plan_session(
  p_session_id uuid,
  p_new_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session public.svj_training_plan_sessions;
  v_conflict integer;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_new_date IS NULL THEN RAISE EXCEPTION 'Choose a day for this session'; END IF;

  SELECT * INTO v_session FROM public.svj_training_plan_sessions
   WHERE id = p_session_id AND user_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown plan session'; END IF;
  IF v_session.status = 'completed' THEN
    RAISE EXCEPTION 'This session is already completed and cannot be moved';
  END IF;

  SELECT COUNT(*) INTO v_conflict FROM public.svj_training_plan_sessions s
   WHERE s.plan_id = v_session.plan_id
     AND s.user_id = v_user_id
     AND s.id <> v_session.id
     AND s.scheduled_date = p_new_date
     AND s.status <> 'skipped';
  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'You already have a session on that day';
  END IF;

  v_status := CASE WHEN v_session.scheduled_date = p_new_date THEN 'scheduled' ELSE 'moved' END;

  UPDATE public.svj_training_plan_sessions
     SET scheduled_date = p_new_date,
         status = CASE WHEN status = 'skipped' THEN 'moved' ELSE v_status END,
         updated_at = now()
   WHERE id = v_session.id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'scheduled_date', p_new_date,
    'status', CASE WHEN v_session.status = 'skipped' THEN 'moved' ELSE v_status END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_skip_plan_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session public.svj_training_plan_sessions;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_session FROM public.svj_training_plan_sessions
   WHERE id = p_session_id AND user_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown plan session'; END IF;
  IF v_session.status = 'completed' THEN
    RAISE EXCEPTION 'This session is already completed and cannot be skipped';
  END IF;

  UPDATE public.svj_training_plan_sessions
     SET status = 'skipped', updated_at = now()
   WHERE id = v_session.id AND user_id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'session_id', v_session.id, 'status', 'skipped');
END;
$$;

GRANT EXECUTE ON FUNCTION public.svj_reschedule_plan_session(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_skip_plan_session(uuid) TO authenticated;

COMMIT;
