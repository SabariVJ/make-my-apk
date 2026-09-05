-- ============================================================================
-- Verified 60-Day activity award and rivalry scoring.
--
-- This is deliberately additive: it preserves existing accounts, XP,
-- memberships, Founder access and challenge history. The function below is
-- callable only by the service role used by the authenticated server route.
-- ============================================================================

BEGIN;

-- Permit a narrowly-scoped trusted server transaction to update progression
-- fields while preserving the existing protection against browser-originated
-- profile updates.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role'
    OR auth.role() = 'service_role'
    OR current_setting('svj.trusted_server_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  NEW.is_plus_member := OLD.is_plus_member;
  NEW.plus_unlocked_at := OLD.plus_unlocked_at;
  NEW.plus_expires_at := OLD.plus_expires_at;
  NEW.signup_date := OLD.signup_date;
  NEW.qualifying_xp := OLD.qualifying_xp;
  NEW.total_xp := OLD.total_xp;
  NEW.current_streak := OLD.current_streak;
  NEW.leaderboard_eligible := OLD.leaderboard_eligible;

  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
    AND NEW.avatar_url IS NOT NULL
    AND NEW.avatar_url NOT LIKE ('%/avatars/' || auth.uid()::text || '/%') THEN
    NEW.avatar_url := OLD.avatar_url;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_record_verified_60_day_completion(
  p_user_id uuid,
  p_enrollment_id uuid,
  p_day_number integer,
  p_xp integer,
  p_focus text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_key text;
  v_stat_name text;
  v_activity_id uuid;
  v_rivalry record;
BEGIN
  IF p_user_id IS NULL OR p_enrollment_id IS NULL THEN
    RAISE EXCEPTION 'A user and enrollment are required';
  END IF;
  IF p_day_number NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Invalid 60-Day Challenge day';
  END IF;
  IF p_xp NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'Invalid verified XP amount';
  END IF;

  v_stat_name := CASE p_focus
    WHEN 'Physical' THEN 'fitness'
    WHEN 'Discipline' THEN 'discipline'
    WHEN 'Mental' THEN 'focus'
    WHEN 'Nutrition' THEN 'nutrition'
    WHEN 'Mindset' THEN 'confidence'
    ELSE NULL
  END;
  IF v_stat_name IS NULL THEN
    RAISE EXCEPTION 'Invalid verified activity focus';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.challenge_enrollments enrollment
    JOIN public.challenge_day_progress progress ON progress.enrollment_id = enrollment.id
    WHERE enrollment.id = p_enrollment_id
      AND enrollment.user_id = p_user_id
      AND progress.day_number = p_day_number
      AND progress.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Verified challenge completion not found';
  END IF;

  v_event_key := 'sixty-day:' || p_enrollment_id::text || ':' || p_day_number::text;

  INSERT INTO public.activity_events (
    user_id,
    event_key,
    event_type,
    source_class,
    source_id,
    occurred_at,
    lifetime_xp_delta,
    qualifying_xp_delta,
    rivalry_xp_delta,
    stat_deltas,
    metadata
  ) VALUES (
    p_user_id,
    v_event_key,
    'challenge_completion',
    'sixty_day',
    p_enrollment_id::text || ':' || p_day_number::text,
    now(),
    p_xp,
    0,
    p_xp,
    jsonb_build_object(v_stat_name, 1),
    jsonb_build_object('day_number', p_day_number, 'focus', p_focus)
  )
  ON CONFLICT (user_id, event_key) DO NOTHING
  RETURNING id INTO v_activity_id;

  -- The immutable activity-event key is the idempotency and replay guard for
  -- both lifetime XP and every downstream score/stat event.
  IF v_activity_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'xp_awarded', false, 'event_key', v_event_key);
  END IF;

  PERFORM set_config('svj.trusted_server_write', 'on', true);
  UPDATE public.profiles
  SET total_xp = COALESCE(total_xp, 0) + p_xp
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for verified completion';
  END IF;

  -- A missing assessment baseline stays missing; completing a challenge cannot
  -- manufacture a second stat system. Existing server-backed stats progress by
  -- one bounded point for the verified day focus.
  UPDATE public.user_stats
  SET fitness = LEAST(100, fitness + CASE WHEN v_stat_name = 'fitness' THEN 1 ELSE 0 END),
      discipline = LEAST(100, discipline + CASE WHEN v_stat_name = 'discipline' THEN 1 ELSE 0 END),
      focus = LEAST(100, focus + CASE WHEN v_stat_name = 'focus' THEN 1 ELSE 0 END),
      confidence = LEAST(100, confidence + CASE WHEN v_stat_name = 'confidence' THEN 1 ELSE 0 END),
      social = LEAST(100, social + CASE WHEN v_stat_name = 'social' THEN 1 ELSE 0 END),
      nutrition = LEAST(100, nutrition + CASE WHEN v_stat_name = 'nutrition' THEN 1 ELSE 0 END),
      recovery = LEAST(100, recovery + CASE WHEN v_stat_name = 'recovery' THEN 1 ELSE 0 END),
      consistency = LEAST(100, consistency + CASE WHEN v_stat_name = 'consistency' THEN 1 ELSE 0 END)
  WHERE user_id = p_user_id;

  INSERT INTO public.stat_events (user_id, stat_name, delta, source, source_id)
  VALUES (p_user_id, v_stat_name, 1, 'sixty_day', v_event_key);

  -- Rivalry scores are event deltas created only after the same verified
  -- activity-event insert succeeds. Lifetime profile XP is never read here.
  FOR v_rivalry IN
    SELECT id
    FROM public.rivalries
    WHERE status = 'active'
      AND (challenger_id = p_user_id OR opponent_id = p_user_id)
      AND (expires_at IS NULL OR expires_at > now())
  LOOP
    INSERT INTO public.rivalry_events (rivalry_id, user_id, xp_delta, event_type, source_id)
    VALUES (v_rivalry.id, p_user_id, p_xp, 'challenge_complete', v_event_key)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'xp_awarded', true, 'event_key', v_event_key);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_record_verified_60_day_completion(uuid, uuid, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_record_verified_60_day_completion(uuid, uuid, integer, integer, text)
  TO service_role;

COMMIT;
