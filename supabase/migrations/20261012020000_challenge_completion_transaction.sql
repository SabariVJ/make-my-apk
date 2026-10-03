-- Additive repair: keep completion, reward processing, streak update and return in
-- the normal transaction body. The previous outer EXCEPTION handler skipped
-- the return on success. Require the existing verified reward RPC; fail atomically
-- rather than awarding legacy XP without canonical activity evidence.

BEGIN;

CREATE OR REPLACE FUNCTION public.svj_complete_my_challenge_day(
  p_task_ids jsonb,
  p_duration_minutes integer,
  p_reflection text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_now timestamptz := now();
  enrollment public.challenge_enrollments%ROWTYPE;
  v_completed integer[];
  v_run record;
  v_def public.challenge_day_definitions%ROWTYPE;
  v_required jsonb;
  v_inserted integer;
  v_award jsonb;
  v_last_granted_xp integer := 0;
  v_completed_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT * INTO enrollment FROM public.challenge_enrollments WHERE user_id = caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Start the 60-Day Challenge before completing days.';
  END IF;
  IF enrollment.status = 'completed' THEN
    RAISE EXCEPTION 'The 60-Day Challenge is already complete.';
  END IF;

  SELECT coalesce(array_agg(p.day_number ORDER BY p.day_number), ARRAY[]::integer[])
    INTO v_completed
  FROM public.challenge_day_progress p
  WHERE p.enrollment_id = enrollment.id AND p.status = 'completed';

  SELECT * INTO v_run
    FROM public.svj_compute_challenge_run(enrollment.started_at, v_completed, enrollment.status, v_now);

  IF v_run.effective_status = 'paused' THEN
    RAISE EXCEPTION 'This day was missed. Resume the challenge to continue.';
  END IF;
  IF v_run.effective_status = 'completed' THEN
    RAISE EXCEPTION 'The 60-Day Challenge is already complete.';
  END IF;
  IF v_run.unlock_at IS NULL OR v_now < v_run.unlock_at THEN
    RAISE EXCEPTION 'Day % is not unlocked yet. It unlocks %.', v_run.next_day, coalesce(v_run.unlock_at::text, 'later');
  END IF;

  SELECT * INTO v_def FROM public.challenge_day_definitions WHERE day_number = v_run.next_day;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown day definition.';
  END IF;

  -- All of the day's tasks must be checked. The task list comes from the
  -- server-side definition, never from the client payload.
  IF jsonb_array_length(v_def.tasks) = 0
     OR p_task_ids IS NULL
     OR jsonb_typeof(p_task_ids) <> 'array'
     OR jsonb_array_length(p_task_ids) <> jsonb_array_length(v_def.tasks)
     OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_def.tasks)-1) AS i
                WHERE NOT (p_task_ids @> jsonb_build_array(i::text))) THEN
    RAISE EXCEPTION 'Check off every task for this day before completing it.';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 600 THEN
    RAISE EXCEPTION 'Add a valid check-in duration (1–600 minutes).';
  END IF;
  IF p_reflection IS NULL OR length(btrim(p_reflection)) < 5 THEN
    RAISE EXCEPTION 'Write a short check-in reflection before finishing the day.';
  END IF;

  -- Replay-safe: a repeated call for the same day inserts nothing.
  INSERT INTO public.challenge_day_progress (
    enrollment_id, day_number, status, completed_at,
    checkin_duration_minutes, checkin_reflection, tasks_completed
  )
  VALUES (
    enrollment.id, v_run.next_day, 'completed', v_now,
    p_duration_minutes, left(btrim(p_reflection), 2000), v_def.tasks
  )
  ON CONFLICT (enrollment_id, day_number) DO NOTHING
  RETURNING 1 INTO v_inserted;

  -- Exactly-once XP / stats / rivalry via the existing verified RPC, keyed by
  -- the immutable event key. Kept callable by service_role only — reached here
  -- inside this SECURITY DEFINER context, same trust boundary as before.
  v_award := public.svj_record_verified_60_day_completion(
    caller_id, enrollment.id, v_run.next_day, v_def.xp, v_def.focus
  );
  IF coalesce(v_award ->> 'xp_awarded', 'false') = 'true' THEN
    v_last_granted_xp := v_def.xp;
  END IF;

  -- Streaks mirror the previous behavior; completing day 60 closes the run.
  UPDATE public.challenge_enrollments
     SET current_streak = greatest(current_streak, v_run.next_day),
         best_streak = greatest(best_streak, greatest(current_streak, v_run.next_day)),
         status = CASE WHEN v_run.next_day = 60 THEN 'completed' ELSE status END,
         completed_at = CASE WHEN v_run.next_day = 60 THEN v_now ELSE completed_at END,
         updated_at = v_now
   WHERE id = enrollment.id;

  IF v_run.next_day = 60 THEN
    SELECT count(*) INTO v_completed_count
    FROM public.challenge_day_progress
    WHERE enrollment_id = enrollment.id AND status = 'completed';
    IF v_completed_count = 60 THEN
      PERFORM public.svj_grant_my_completion_code();
    END IF;
  END IF;

  RETURN public.svj_get_my_challenge_state() || jsonb_build_object('lastGrantedXp', v_last_granted_xp);
END;
$$;


REVOKE ALL ON FUNCTION public.svj_complete_my_challenge_day(jsonb, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_complete_my_challenge_day(jsonb, integer, text) TO authenticated;
COMMIT;
