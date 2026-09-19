BEGIN;

-- ── Profile fields and leaderboard eligibility ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS leaderboard_eligible boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (is_plus_member, plus_unlocked_at, plus_expires_at, signup_date, qualifying_xp, total_xp, current_streak, leaderboard_eligible)
  ON public.profiles FROM authenticated, anon;

-- ── Avatar Storage policies (bucket created via storage tool) ───────────────
DROP POLICY IF EXISTS "Public avatar reads" ON storage.objects;
CREATE POLICY "Public avatar reads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatars" ON storage.objects;
CREATE POLICY "Users upload own avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatars" ON storage.objects;
CREATE POLICY "Users update own avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own avatars" ON storage.objects;
CREATE POLICY "Users delete own avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Canonical self-profile mutation.
CREATE OR REPLACE FUNCTION public.svj_update_my_profile(
  p_display_name text,
  p_username text,
  p_bio text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_avatar_changed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  location text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  clean_display_name text := NULLIF(btrim(COALESCE(p_display_name, '')), '');
  clean_username text := lower(NULLIF(btrim(COALESCE(p_username, '')), ''));
  clean_bio text := NULLIF(btrim(COALESCE(p_bio, '')), '');
  clean_location text := NULLIF(btrim(COALESCE(p_location, '')), '');
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF clean_display_name IS NULL OR char_length(clean_display_name) > 80 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 80 characters';
  END IF;
  IF clean_username IS NULL OR clean_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3–30 lowercase letters, numbers, or underscores';
  END IF;
  IF clean_bio IS NOT NULL AND char_length(clean_bio) > 280 THEN
    RAISE EXCEPTION 'Bio is too long';
  END IF;
  IF clean_location IS NOT NULL AND char_length(clean_location) > 100 THEN
    RAISE EXCEPTION 'Location is too long';
  END IF;
  IF p_avatar_changed AND p_avatar_url IS NOT NULL
    AND p_avatar_url NOT LIKE ('%/avatars/' || caller_id::text || '/%') THEN
    RAISE EXCEPTION 'Avatar must belong to your SVJ Storage folder';
  END IF;

  RETURN QUERY
  UPDATE public.profiles AS p
  SET display_name = clean_display_name,
      username = clean_username,
      bio = clean_bio,
      location = clean_location,
      avatar_url = CASE WHEN p_avatar_changed THEN p_avatar_url ELSE p.avatar_url END
  WHERE p.id = caller_id
  RETURNING p.id, p.username, p.display_name, p.avatar_url, p.bio, p.location, p.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_update_my_profile(text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_update_my_profile(text, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.svj_list_public_profiles(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 50,
  p_include_self boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  total_xp integer,
  current_streak integer,
  rank integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.total_xp,
      p.current_streak,
      row_number() OVER (ORDER BY p.total_xp DESC, p.created_at ASC, p.id)::integer AS rank
    FROM public.profiles p
    WHERE auth.uid() IS NOT NULL
      AND p.leaderboard_eligible = true
      AND (p_include_self OR p.id <> auth.uid())
      AND (
        NULLIF(btrim(COALESCE(p_query, '')), '') IS NULL
        OR p.username ILIKE '%' || btrim(p_query) || '%'
        OR p.display_name ILIKE '%' || btrim(p_query) || '%'
      )
  )
  SELECT *
  FROM visible
  ORDER BY rank
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.svj_list_public_profiles(text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_public_profiles(text, integer, boolean) TO authenticated;

-- ── Assessment baseline ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.svj_finalize_assessment_baseline()
RETURNS SETOF public.user_stats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.user_stats (
    user_id,
    fitness, discipline, focus, confidence, social, nutrition, recovery, consistency,
    baseline_fitness, baseline_discipline, baseline_focus, baseline_confidence,
    baseline_social, baseline_nutrition, baseline_recovery, baseline_consistency
  )
  SELECT
    p.user_id,
    s.fitness, s.discipline, s.focus, s.confidence, s.social, s.nutrition, s.recovery, s.consistency,
    s.fitness, s.discipline, s.focus, s.confidence, s.social, s.nutrition, s.recovery, s.consistency
  FROM public.user_personalization p
  CROSS JOIN LATERAL (
    SELECT
      LEAST(100, GREATEST(1, ROUND((
        CASE p.fitness_activity_level
          WHEN 'sedentary' THEN 20 WHEN 'light' THEN 40 WHEN 'moderate' THEN 60
          WHEN 'active' THEN 80 WHEN 'very_active' THEN 95 ELSE 50 END
        + COALESCE(p.fitness_days_per_week, 3) * (100.0 / 7)
        + COALESCE((p.fitness_confidence - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.fitness_consistency - 1) * (99.0 / 4) + 1, 50)
      ) / 4)))::integer AS fitness,
      LEAST(100, GREATEST(1, ROUND((
        COALESCE((p.discipline_task_completion - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((6 - p.discipline_procrastination - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.discipline_routine - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.discipline_commitments - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((6 - p.discipline_distractibility - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.discipline_habits - 1) * (99.0 / 4) + 1, 50)
      ) / 6)))::integer AS discipline,
      LEAST(100, GREATEST(1, ROUND((
        COALESCE((p.focus_phone_resistance - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.focus_study_consistency - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.focus_time_management - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.focus_deep_work - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((6 - p.focus_distraction_frequency - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.focus_planned_completion - 1) * (99.0 / 4) + 1, 50)
      ) / 6)))::integer AS focus,
      LEAST(100, GREATEST(1, ROUND((
        COALESCE((p.confidence_general - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.confidence_initiative - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.confidence_unfamiliar - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.confidence_setbacks - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.confidence_speaking_up - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.confidence_goals - 1) * (99.0 / 4) + 1, 50)
      ) / 6)))::integer AS confidence,
      LEAST(100, GREATEST(1, ROUND((
        COALESCE((p.social_comfort_new_people - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.social_comfort_conversations - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.social_comfort_groups - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((6 - p.social_avoidance_frequency - 1) * (99.0 / 4) + 1, 50)
      ) / 4)))::integer AS social,
      LEAST(100, GREATEST(1, ROUND((
        COALESCE((p.nutrition_eating_schedule - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.nutrition_food_quality - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.nutrition_protein_consistency - 1) * (99.0 / 4) + 1, 50)
      ) / 3)))::integer AS nutrition,
      LEAST(100, GREATEST(1, ROUND((
        COALESCE(LEAST(100, GREATEST(1, (p.recovery_sleep_hours - 3) * (99.0 / 7) + 1)), 50)
        + COALESCE((p.recovery_sleep_consistency - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.recovery_morning_energy - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.recovery_perception - 1) * (99.0 / 4) + 1, 50)
      ) / 4)))::integer AS recovery,
      LEAST(100, GREATEST(1, ROUND((
        COALESCE((p.discipline_routine - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.discipline_habits - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.focus_study_consistency - 1) * (99.0 / 4) + 1, 50)
        + COALESCE((p.fitness_consistency - 1) * (99.0 / 4) + 1, 50)
      ) / 4)))::integer AS consistency
  ) s
  WHERE p.user_id = caller_id
    AND p.assessment_completed = true
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY SELECT * FROM public.user_stats WHERE user_id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_finalize_assessment_baseline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_finalize_assessment_baseline() TO authenticated;

-- ── Rivalry state machine ───────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.rivalries FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.rivalry_events FROM authenticated, anon;
DROP POLICY IF EXISTS "Users can create rivalries as challenger" ON public.rivalries;
DROP POLICY IF EXISTS "Users can update own rivalries" ON public.rivalries;
DROP POLICY IF EXISTS "Users can insert own rivalry events" ON public.rivalry_events;

CREATE OR REPLACE FUNCTION public.svj_create_rivalry(p_opponent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  rivalry public.rivalries%ROWTYPE;
  challenger_xp integer := 0;
  opponent_xp integer := 0;
  challenger_name text := 'A member';
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_opponent_id IS NULL OR p_opponent_id = caller_id THEN
    RAISE EXCEPTION 'You cannot challenge yourself';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_opponent_id AND leaderboard_eligible = true
  ) THEN
    RAISE EXCEPTION 'This member is unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = caller_id AND addressee_id = p_opponent_id)
        OR (requester_id = p_opponent_id AND addressee_id = caller_id))
  ) THEN
    RAISE EXCEPTION 'Become friends before starting an Outperform rivalry';
  END IF;

  SELECT * INTO rivalry
  FROM public.rivalries
  WHERE ((challenger_id = caller_id AND opponent_id = p_opponent_id)
      OR (challenger_id = p_opponent_id AND opponent_id = caller_id))
    AND status IN ('pending', 'accepted', 'active')
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'existing', true, 'rivalry', to_jsonb(rivalry));
  END IF;

  SELECT total_xp, COALESCE(username, display_name, 'A member')
    INTO challenger_xp, challenger_name
  FROM public.profiles WHERE id = caller_id;
  SELECT total_xp INTO opponent_xp FROM public.profiles WHERE id = p_opponent_id;

  BEGIN
    INSERT INTO public.rivalries (
      challenger_id, opponent_id, status, challenger_baseline_xp, opponent_baseline_xp
    ) VALUES (
      caller_id, p_opponent_id, 'pending', COALESCE(challenger_xp, 0), COALESCE(opponent_xp, 0)
    ) RETURNING * INTO rivalry;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO rivalry
    FROM public.rivalries
    WHERE ((challenger_id = caller_id AND opponent_id = p_opponent_id)
        OR (challenger_id = p_opponent_id AND opponent_id = caller_id))
      AND status IN ('pending', 'accepted', 'active')
    ORDER BY created_at DESC
    LIMIT 1;
  END;

  INSERT INTO public.in_app_notifications (user_id, type, from_user_id, reference_id, title, body)
  VALUES (
    p_opponent_id,
    'rivalry_request',
    caller_id,
    rivalry.id,
    'Outperform Challenge',
    challenger_name || ' challenged you to an Outperform competition.'
  );

  RETURN jsonb_build_object('ok', true, 'existing', false, 'rivalry', to_jsonb(rivalry));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_respond_to_rivalry(p_rivalry_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  rivalry public.rivalries%ROWTYPE;
  caller_xp integer := 0;
  caller_name text := 'Your opponent';
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'Invalid rivalry response';
  END IF;

  SELECT * INTO rivalry FROM public.rivalries
  WHERE id = p_rivalry_id AND opponent_id = caller_id
  FOR UPDATE;
  IF NOT FOUND OR rivalry.status <> 'pending' THEN
    RAISE EXCEPTION 'Rivalry request is no longer pending';
  END IF;

  SELECT total_xp, COALESCE(username, display_name, 'Your opponent')
    INTO caller_xp, caller_name
  FROM public.profiles WHERE id = caller_id;

  IF p_action = 'accept' THEN
    UPDATE public.rivalries
    SET status = 'active',
        started_at = now(),
        expires_at = now() + interval '7 days',
        opponent_baseline_xp = COALESCE(caller_xp, opponent_baseline_xp)
    WHERE id = rivalry.id
    RETURNING * INTO rivalry;

    INSERT INTO public.in_app_notifications (user_id, type, from_user_id, reference_id, title, body)
    VALUES (
      rivalry.challenger_id,
      'rivalry_accepted',
      caller_id,
      rivalry.id,
      'Outperform Challenge Accepted',
      caller_name || ' accepted your Outperform challenge. The rivalry is active.'
    );
  ELSE
    UPDATE public.rivalries
    SET status = 'declined', ended_at = now()
    WHERE id = rivalry.id
    RETURNING * INTO rivalry;

    INSERT INTO public.in_app_notifications (user_id, type, from_user_id, reference_id, title, body)
    VALUES (
      rivalry.challenger_id,
      'rivalry_declined',
      caller_id,
      rivalry.id,
      'Outperform Challenge Declined',
      caller_name || ' declined your Outperform challenge.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'rivalry', to_jsonb(rivalry));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_cancel_rivalry(p_rivalry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  rivalry public.rivalries%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.rivalries
  SET status = 'cancelled', ended_at = now()
  WHERE id = p_rivalry_id
    AND challenger_id = caller_id
    AND status = 'pending'
  RETURNING * INTO rivalry;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rivalry request is no longer pending';
  END IF;
  RETURN jsonb_build_object('ok', true, 'rivalry', to_jsonb(rivalry));
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_list_rivalries()
RETURNS TABLE (
  id uuid,
  challenger_id uuid,
  opponent_id uuid,
  status text,
  challenger_baseline_xp integer,
  opponent_baseline_xp integer,
  winner_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  opponent_username text,
  opponent_display_name text,
  opponent_avatar_url text,
  my_score integer,
  opponent_score integer,
  my_events integer,
  opponent_events integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  WITH expiring AS (
    SELECT
      r.id,
      r.challenger_id,
      r.opponent_id,
      COALESCE(SUM(e.xp_delta) FILTER (WHERE e.user_id = r.challenger_id), 0)::integer AS challenger_score,
      COALESCE(SUM(e.xp_delta) FILTER (WHERE e.user_id = r.opponent_id), 0)::integer AS opponent_score
    FROM public.rivalries r
    LEFT JOIN public.rivalry_events e ON e.rivalry_id = r.id
    WHERE r.status = 'active'
      AND r.expires_at IS NOT NULL
      AND r.expires_at <= now()
      AND (r.challenger_id = caller_id OR r.opponent_id = caller_id)
    GROUP BY r.id, r.challenger_id, r.opponent_id
  )
  UPDATE public.rivalries r
  SET status = 'completed',
      ended_at = now(),
      winner_id = CASE
        WHEN x.challenger_score > x.opponent_score THEN x.challenger_id
        WHEN x.opponent_score > x.challenger_score THEN x.opponent_id
        ELSE NULL
      END
  FROM expiring x
  WHERE r.id = x.id;

  RETURN QUERY
  SELECT
    r.id,
    r.challenger_id,
    r.opponent_id,
    r.status,
    r.challenger_baseline_xp,
    r.opponent_baseline_xp,
    r.winner_id,
    r.started_at,
    r.ended_at,
    r.expires_at,
    r.created_at,
    other.username,
    other.display_name,
    other.avatar_url,
    COALESCE(SUM(e.xp_delta) FILTER (WHERE e.user_id = caller_id), 0)::integer AS my_score,
    COALESCE(SUM(e.xp_delta) FILTER (WHERE e.user_id <> caller_id), 0)::integer AS opponent_score,
    COUNT(*) FILTER (WHERE e.user_id = caller_id)::integer AS my_events,
    COUNT(*) FILTER (WHERE e.user_id <> caller_id)::integer AS opponent_events
  FROM public.rivalries r
  JOIN public.profiles other
    ON other.id = CASE WHEN r.challenger_id = caller_id THEN r.opponent_id ELSE r.challenger_id END
  LEFT JOIN public.rivalry_events e ON e.rivalry_id = r.id
  WHERE r.challenger_id = caller_id OR r.opponent_id = caller_id
  GROUP BY r.id, other.username, other.display_name, other.avatar_url
  ORDER BY r.created_at DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_create_rivalry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_respond_to_rivalry(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_cancel_rivalry(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.svj_list_rivalries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_create_rivalry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_respond_to_rivalry(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_cancel_rivalry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_rivalries() TO authenticated;

COMMIT;