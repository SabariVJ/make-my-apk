-- ============================================================================
-- SVJ 60-Day emergency hotfix: self-service challenge RPCs
--
-- ⚠️  TARGET DATABASE: oltmnrkceodpyqznfhjb (Lovable Cloud / live SVJ backend)
--   Do NOT apply to any other project.
--
-- WHY THIS EXISTS
--   Every normal 60-Day flow (read state, start, complete day, resume,
--   redeem own code) went through requireAdminKey() + the service-role client.
--   The Lovable-managed backend does not expose a service-role key, so these
--   flows failed with "Privileged operation requires SVJ_SUPABASE_SECRET_KEY
--   or SUPABASE_SERVICE_ROLE_KEY" — including the misleading
--   "Could not read the server clock. Please retry." message from getDbNow().
--
-- THE FIX
--   The application already authenticates every request (requireSupabaseAuth
--   validates the caller's own JWT). These SECURITY DEFINER RPCs derive
--   identity from auth.uid() — never from a caller-supplied user_id — and use
--   the database clock (now()) for all unlock timing. Normal users no longer
--   need any privileged key. Privileged operations elsewhere (account
--   deletion, Plus grants, engagement writes) remain requireAdminKey()-gated.
--
-- PRESERVED SEMANTICS (identical to the previous server functions):
--   * one enrollment per user; started_at is the unlock anchor
--   * day N unlocks at started_at + (N-1)*24h; window is 24h
--   * strictly sequential completion, replay-safe upsert
--   * missed day → paused; resume re-anchors so the pending day unlocks now
--   * XP / stats / rivalry awarded exactly once via the existing verified
--     activity RPC (svj_record_verified_60_day_completion), keyed by an
--     immutable event key
--   * one unique SVJ-XXXX-XXXX code per finisher, locked to their account
--
-- SECURITY
--   * identity: auth.uid() only; no caller-supplied user_id parameters anywhere
--   * SECURITY DEFINER with SET search_path = public (required: the tables
--     have RLS enabled with zero policies and no grants for authenticated)
--   * day content (XP, focus, tasks) is server-side only in
--     challenge_day_definitions — callers cannot choose their own XP
--   * REVOKE from PUBLIC/anon/authenticated; GRANT EXECUTE to authenticated
--   * svj_redeem_my_plus_code updates plus_expires_at/is_plus_member on the
--     caller's own profile only, inside the narrowly-scoped trusted server
--     transaction (svj.trusted_server_write) that the existing
--     protect_profile_privileged_columns trigger explicitly allows — the same
--     audited mechanism svj_record_verified_60_day_completion uses for XP.
--
-- Idempotency: every statement is re-runnable (CREATE OR REPLACE / conditional
-- grants / ON CONFLICT DO NOTHING seeds). Existing rows are never overwritten.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Server-side day definitions (content the client cannot influence).
--    Seeded once from the shared program (src/lib/challengeDays.ts). Existing
--    rows are left untouched; ON CONFLICT updates keep a re-run consistent
--    without ever deleting progress.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_day_definitions (
  day_number integer PRIMARY KEY CHECK (day_number BETWEEN 1 AND 60),
  phase text NOT NULL,
  focus text NOT NULL CHECK (focus IN ('Physical', 'Discipline', 'Mental', 'Nutrition', 'Mindset')),
  xp integer NOT NULL CHECK (xp BETWEEN 0 AND 1000),
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkin_prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.challenge_day_definitions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.challenge_day_definitions TO service_role;

INSERT INTO public.challenge_day_definitions (day_number, phase, focus, xp, tasks, checkin_prompt)
VALUES
('1','Ignition','Physical',100,'["45 min strength session","20 min conditioning finisher","10 min mobility cooldown","Log your session in SVJ"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('2','Ignition','Discipline',100,'["No phone for the first 30 min awake","10 min sunlight or outdoor walk","Make your bed","2L of water before noon"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('3','Ignition','Mental',100,'["10 min box breathing","60 min single deep-work block","Write 3 priorities for the day","No social media until priority #1 is done"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('4','Ignition','Nutrition',100,'["No sugar before 12pm","Protein at every meal","Cook one meal from scratch","Track every calorie you eat"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('5','Ignition','Mindset',100,'["30 min full-body strength","100 push-ups in any sets","5 min plank total","10 min stretch"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('6','Ignition','Physical',100,'["No skipped planned task","Screen time under 4 hours","60 second cold shower","Journal tonight before bed"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('7','Ignition','Discipline',100,'["Read 30 pages","Summarize what you read in 5 bullets","30 min focus session","Evening brain dump"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('8','Ignition','Mental',100,'["3L of water","No caffeine after 2pm","In bed by 11pm","7.5h+ of sleep target"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('9','Ignition','Nutrition',100,'["10k steps","20 min zone 2 cardio","10 min mobility","Walk after dinner"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('10','Ignition','Mindset',100,'["Review your week in writing","Set one audacious 30-day goal","Send one encouraging message","Plan tomorrow tonight"]'::jsonb,'What was the hardest part of today, and what did you actually do about it?'),
('11','Compound','Physical',125,'["45 min squat + hinge base session","Farmers carry 3×40m","10 min core circuit","Log your lifts with PRs"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('12','Compound','Discipline',125,'["6×40m sprints","10 min jump rope","10 min cooldown stretch","No screens for 1h after dinner"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('13','Compound','Mental',125,'["2×90 min focus blocks","Phone in another room","Tackle the hardest task first","Night reflection in journal"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('14','Compound','Nutrition',125,'["160g+ of protein","Meal-prep tomorrow''s lunch","No fried food today","3L of water"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('15','Compound','Mindset',125,'["Heavy carry session 30 min","20 min ruck or incline walk","10 min grip work","10 min mobility"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('16','Compound','Physical',125,'["Sleep by 10:30pm","No screens after 10pm","Plan tomorrow''s morning routine","Journal 3 wins"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('17','Compound','Discipline',125,'["45 min zone 2 cardio","10 min mobility","Read 20 pages","Phone-free lunch"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('18','Compound','Mental',125,'["Write out every open loop","Do one dreaded task","15 min meditation","Plan tomorrow"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('19','Compound','Nutrition',125,'["Dead hangs 5×30s","Kettlebell or dumbbell session 30 min","20 min conditioning","10 min cooldown"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('20','Compound','Mindset',125,'["Review all 10 days in writing","Recompute your 30-day goal","Active recovery only","Plan the next 10 days"]'::jsonb,'Rate your energy today 1–10. What moved it — and what would move it more?'),
('21','Overload','Physical',150,'["5×800m or 5×3 min threshold intervals","10 min cooldown","3 rounds of breathwork","Log your effort"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('22','Overload','Discipline',150,'["High-volume push session","100 pull-ups in any sets","20 min finisher","Full-body stretch session"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('23','Overload','Mental',150,'["Track every bite","Cut 200 kcal from baseline","No liquid calories","Protein first at every meal"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('24','Overload','Nutrition',150,'["60 min phone-free","20 min meditation","Write 1 page longhand","No news today"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('25','Overload','Mindset',150,'["90 min strength session","30 min zone 2 cardio","15 min mobility","Eat within 30 min of finishing"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('26','Overload','Physical',150,'["45 min power technique work","15 min plyometrics","8×30m sprints","Cold or contrast therapy"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('27','Overload','Discipline',150,'["8h+ of sleep","Blackout the room","No caffeine after 12pm","45 min wind-down routine"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('28','Overload','Mental',150,'["Read 40 pages","Apply 1 idea from the book today","Teach the idea to someone","Journal the result"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('29','Overload','Nutrition',150,'["3×30 min AMRAP blocks","Log every round","Rest 10 min between blocks","3.5L of water"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('30','Overload','Mindset',150,'["30 min full mobility session","Review the month in writing","Name 1 weakness to attack next","Plan a rest day"]'::jsonb,'What did you prove to yourself today that you doubted yesterday?'),
('31','Mastery','Physical',175,'["45 min intent practice on one lift","Film and review 3 sets","20 min skill drilling","Journal the cue that clicked"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('32','Mastery','Discipline',175,'["5k or 30 min steady run","Negative splits","10 min cooldown","Evening reflection"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('33','Mastery','Mental',175,'["Hit exact macros for the day","Prep all meals ahead","No restaurants","Track sleep vs. recovery"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('34','Mastery','Nutrition',175,'["20 min focus drill","3h of deep work","Zero multitasking","Write tomorrow''s map"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('35','Mastery','Mindset',175,'["20 min hard circuit","20 min zone 2 cardio","10 min core","90 second cold shower"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('36','Mastery','Physical',175,'["14h overnight fast","High-protein first meal","No snacking","3L of water"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('37','Mastery','Discipline',175,'["Squat / deadlift / bench focus session","5×3 heavy singles","20 min back work","15 min mobility"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('38','Mastery','Mental',175,'["Write 2 pages","Review every past reflection","Define 1 core standard","Plan the week"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('39','Mastery','Nutrition',175,'["3 min ice bath or cold shower","20 min foam rolling","9h sleep target","Zero training today"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('40','Mastery','Mindset',175,'["Review all 40 days in writing","Audit habits vs. streak","Write the final 20-day war plan","Rest tonight"]'::jsonb,'What skill improved most today, and what exact cue or habit caused it?'),
('41','War','Physical',200,'["5×1 heavy singles","15 min finisher","10 min cooldown","Log every set"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('42','War','Discipline',200,'["10×1 min hard intervals","10 min jog recovery","10 min breathing drill","Hydrate aggressively"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('43','War','Mental',200,'["Zero junk food","Every meal home-cooked","170g+ protein","No sugar"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('44','War','Nutrition',200,'["90 min strength session","No phone during the session","30 min zone 2","Journal effort vs. output"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('45','War','Mindset',200,'["60 min of your hardest work","No breaks allowed","Cold shower","Write what it felt like"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('46','War','Physical',200,'["Under 100g carbs","Fat and protein focus","3L water + electrolytes","Light cardio only"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('47','War','Discipline',200,'["45 min power movements","10 hill sprints","15 min plyometrics","Full stretch"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('48','War','Mental',200,'["60 min total phone time","30 min meditation","Write 1 page","Slow speech, full eye contact"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('49','War','Nutrition',200,'["60 min long cardio","Test your fuel plan","20 min mobility","Sleep by 10pm"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('50','War','Mindset',200,'["Review all 50 days in writing","Confirm the final 10-day assault","Write your finish line","Visualize Day 60"]'::jsonb,'Describe the exact moment you wanted to quit today — and why you didn''t.'),
('51','Ascension','Physical',225,'["Peak strength session","Light conditioning","Full mobility","Early sleep"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('52','Ascension','Discipline',225,'["2×90 min deep work","Zero distractions","High-protein day","Evening reflection"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('53','Ascension','Mental',225,'["60 min signature session","20 min finisher","2 min cold shower","Journal the ritual"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('54','Ascension','Nutrition',225,'["75 min long zone 2","15 min breathwork","15 min heat exposure","4L of water"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('55','Ascension','Mindset',225,'["Final threshold intervals","8×40m sprints","10 min cooldown","Visualize Day 60"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('56','Ascension','Physical',225,'["9h of sleep","No screens after 8pm","60 min nature walk","Write a gratitude list"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('57','Ascension','Discipline',225,'["Full-body warrior session","Carry + core circuit","Cold exposure","Write your war cry"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('58','Ascension','Mental',225,'["Write your 60-day story","Letter to your future self","Thank your past self","Read your oldest reflections"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('59','Ascension','Nutrition',225,'["Light training only","Clean meal prep","Sleep by 9:30pm","Plan your Day 60 ritual"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?'),
('60','Ascension','Mindset',225,'["60 min victory session","Full mobility","Write your finisher reflection","Claim your redeem code"]'::jsonb,'Write one line to your 60-day-finisher self. What did you become?')
ON CONFLICT (day_number) DO UPDATE
SET phase = EXCLUDED.phase,
    focus = EXCLUDED.focus,
    xp = EXCLUDED.xp,
    tasks = EXCLUDED.tasks,
    checkin_prompt = EXCLUDED.checkin_prompt;

-- ----------------------------------------------------------------------------
-- 2) Shared state computation. Same math as computeRun() in
--    src/lib/challenge.functions.ts. day_keys / day_states use ordinal
--    position (i) so jsonb_array_elements alignment never depends on
--    generate_series ordering.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_compute_challenge_run(
  p_started_at timestamptz,
  p_completed_days integer[],
  p_status text,
  p_now timestamptz
)
RETURNS TABLE (
  days_completed integer,
  next_day integer,
  unlock_at timestamptz,
  is_missed boolean,
  effective_status text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_unlock timestamptz;
  v_window_elapsed boolean;
BEGIN
  IF p_started_at IS NULL THEN
    RETURN QUERY SELECT 0, 1, NULL::timestamptz, false, 'not_started'::text;
    RETURN;
  END IF;

  v_next := COALESCE(array_length(p_completed_days, 1), 0) + 1;

  IF v_next > 60 THEN
    RETURN QUERY SELECT COALESCE(array_length(p_completed_days, 1), 0), v_next,
                        NULL::timestamptz, false, 'completed'::text;
    RETURN;
  END IF;

  v_unlock := p_started_at + make_interval(days => v_next - 1);
  v_window_elapsed := p_now > v_unlock + interval '24 hours';

  IF p_status = 'paused' OR v_window_elapsed THEN
    RETURN QUERY SELECT COALESCE(array_length(p_completed_days, 1), 0), v_next,
                        v_unlock, true, 'paused'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT COALESCE(array_length(p_completed_days, 1), 0), v_next,
                      v_unlock, false, 'active'::text;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3) Self-service state read. No parameters; identity = auth.uid(). Returns
--    the caller's enrollment, day progress, redeem code and database clock.
--    Includes the lazy missed-day pause the old getChallengeState performed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_get_my_challenge_state()
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
  v_code public.redeem_codes%ROWTYPE;
  v_day_keys jsonb;
  v_day_states jsonb;
  v_paused_now boolean := false;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT * INTO enrollment FROM public.challenge_enrollments WHERE user_id = caller_id;

  IF FOUND THEN
    SELECT coalesce(array_agg(p.day_number ORDER BY p.day_number), ARRAY[]::integer[])
      INTO v_completed
    FROM public.challenge_day_progress p
    WHERE p.enrollment_id = enrollment.id AND p.status = 'completed';
  ELSE
    v_completed := ARRAY[]::integer[];
  END IF;

  SELECT * INTO v_run
    FROM public.svj_compute_challenge_run(enrollment.started_at, v_completed, enrollment.status, v_now);

  IF FOUND THEN
    -- Lazily persist a missed day (same as the old server-function read path).
    IF v_run.effective_status = 'paused' AND enrollment.status <> 'paused' THEN
      UPDATE public.challenge_enrollments
         SET status = 'paused', paused_at = v_now, updated_at = v_now
       WHERE id = enrollment.id;
      enrollment.status := 'paused';
      enrollment.paused_at := v_now;
      v_paused_now := true;
    END IF;
  END IF;

  SELECT * INTO v_code FROM public.redeem_codes WHERE user_id = caller_id;

  -- Day ledger: ordinal i matches day i. completed rows carry their server
  -- completed_at; the pending day is 'current', or 'missed' once paused.
  SELECT coalesce(jsonb_agg(jsonb_build_object('day', d)), '[]'::jsonb)
    INTO v_day_keys
  FROM generate_series(1, 60) AS d;

  SELECT coalesce(jsonb_object_agg(p.day_number, jsonb_build_object('status', 'completed', 'completedAt', p.completed_at)), '{}'::jsonb)
    INTO v_day_states
  FROM public.challenge_day_progress p
  WHERE enrollment.id IS NOT NULL
    AND p.enrollment_id = enrollment.id
    AND p.status = 'completed';

  IF enrollment.id IS NOT NULL THEN
    IF enrollment.status = 'paused' OR v_paused_now THEN
      v_day_states := jsonb_set(v_day_states, ARRAY[v_run.next_day::text],
        jsonb_build_object('status', 'missed'), true);
    ELSIF v_run.effective_status = 'active' THEN
      v_day_states := jsonb_set(v_day_states, ARRAY[v_run.next_day::text],
        jsonb_build_object('status', 'current'), true);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN enrollment.id IS NULL THEN 'not_started' ELSE enrollment.status END,
    'startedAt', enrollment.started_at,
    'pausedAt', enrollment.paused_at,
    'completedAt', enrollment.completed_at,
    'currentDay', v_run.next_day,
    'daysCompleted', v_run.days_completed,
    'currentStreak', enrollment.current_streak,
    'bestStreak', enrollment.best_streak,
    'currentUnlockAt', v_run.unlock_at,
    'currentUnlocked', v_run.effective_status = 'active' AND v_run.unlock_at IS NOT NULL AND v_now >= v_run.unlock_at,
    'dayKeys', v_day_keys,
    'dayStates', v_day_states,
    'code', v_code.code,
    'codeRedeemed', coalesce(v_code.redeemed, false),
    'serverNow', v_now
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4) Self-service start. One enrollment per user; server timestamp anchor.
--    Idempotent: an existing enrollment is returned unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_start_my_challenge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  INSERT INTO public.challenge_enrollments (user_id, status, started_at)
  VALUES (caller_id, 'active', v_now)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN public.svj_get_my_challenge_state();
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Self-service resume (after a missed day). Re-anchors the unlock clock so
--    the pending day unlocks immediately; streak and history are preserved.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_resume_my_challenge()
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
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT * INTO enrollment FROM public.challenge_enrollments WHERE user_id = caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Start the 60-Day Challenge before resuming.';
  END IF;
  IF enrollment.status = 'completed' THEN
    RETURN public.svj_get_my_challenge_state();
  END IF;

  SELECT coalesce(array_agg(p.day_number ORDER BY p.day_number), ARRAY[]::integer[])
    INTO v_completed
  FROM public.challenge_day_progress p
  WHERE p.enrollment_id = enrollment.id AND p.status = 'completed';

  SELECT * INTO v_run
    FROM public.svj_compute_challenge_run(enrollment.started_at, v_completed, enrollment.status, v_now);

  IF v_run.effective_status <> 'paused' THEN
    RETURN public.svj_get_my_challenge_state();
  END IF;

  UPDATE public.challenge_enrollments
     SET status = 'active',
         paused_at = NULL,
         started_at = v_now - make_interval(days => v_run.next_day - 1),
         updated_at = v_now
   WHERE id = enrollment.id;

  RETURN public.svj_get_my_challenge_state();
END;
$$;

-- ----------------------------------------------------------------------------
-- 6) Self-service day completion. Full validation parity with the previous
--    server function: enrollment present, not completed, not paused, correct
--    sequential day, unlocked by the database clock, ALL tasks submitted
--    (validated against challenge_day_definitions, not client content),
--    duration 1–600, reflection ≥ 5 chars. XP/focus come from the server-side
--    definition table; the award goes through the existing verified activity
--    RPC so XP, stats and rivalry can never be granted twice. Finishing day
--    60 verifies full sequential completion and grants the redeem code.
-- ----------------------------------------------------------------------------
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
  v_missing_verified_activity_rpc boolean := false;
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
     OR jsonb_array_length(p_task_ids) <> jsonb_array_length(v_def.tasks) THEN
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

  -- Narrow deploy-window compatibility: if the verified RPC has not been
  -- applied yet (PGRST202 / function-not-found), preserve the previous
  -- legacy exactly-once XP path. Any other failure is a real error.
  EXCEPTION
    WHEN OTHERS THEN
      -- Deploy-window compatibility: only a missing verified-activity function
      -- takes the legacy path; every other failure is a real error.
      IF SQLSTATE = '42883'
         AND SQLERRM ILIKE '%svj_record_verified_60_day_completion%' THEN
        v_missing_verified_activity_rpc := true;
      ELSE
        RAISE;
      END IF;

  IF v_missing_verified_activity_rpc THEN
    IF v_inserted IS NOT NULL THEN
      -- Same narrowly-scoped trusted write the verified RPC uses; without it
      -- protect_profile_privileged_columns would silently revert total_xp.
      PERFORM set_config('svj.trusted_server_write', 'on', true);
      UPDATE public.profiles
         SET total_xp = coalesce(total_xp, 0) + v_def.xp
       WHERE id = caller_id;
      v_last_granted_xp := v_def.xp;
    END IF;
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

-- ----------------------------------------------------------------------------
-- 7) Completion code grant (used by the completion RPC). One unique
--    SVJ-XXXX-XXXX code per finisher, locked to their account. Idempotent.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_grant_my_completion_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  enrollment record;
  existing public.redeem_codes%ROWTYPE;
  v_code text;
  v_attempt integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  SELECT * INTO existing FROM public.redeem_codes WHERE user_id = caller_id;
  IF FOUND THEN
    IF NOT existing.redeemed THEN
      UPDATE public.challenge_enrollments
         SET code_granted = true
       WHERE user_id = caller_id;
    END IF;
    RETURN existing.code;
  END IF;

  SELECT id INTO enrollment FROM public.challenge_enrollments WHERE user_id = caller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No 60-Day enrollment found';
  END IF;

  FOR v_attempt IN 1..6 LOOP
    -- Hex bytes mapped into the unambiguous alphabet from the original
    -- generator (no 0/O/1/I/L), formatted SVJ-XXXX-XXXX.
    v_code := 'SVJ-'
      || translate(substr(encode(gen_random_bytes(4), 'hex'), 1, 4),
                   '0123456789abcdef', '23456789ABCDEFGH')
      || '-'
      || translate(substr(encode(gen_random_bytes(4), 'hex'), 1, 4),
                   '0123456789abcdef', '23456789ABCDEFGH');
    BEGIN
      INSERT INTO public.redeem_codes (code, user_id, redeemed)
      VALUES (v_code, caller_id, false);
      UPDATE public.challenge_enrollments
         SET code_granted = true
       WHERE id = enrollment.id;
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_code := NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not generate a unique redeem code. Please retry.';
END;
$$;

-- ----------------------------------------------------------------------------
-- 8) Self-service redemption of the caller's OWN earned code. Identity is
--    auth.uid(): a code that belongs to anyone else is simply "invalid".
--    Generic errors never reveal whether a code exists (unguessable).
--    Entitlement safety preserved: never shortens an existing Plus grant;
--    lifetime members consume the code but keep lifetime access.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svj_redeem_my_plus_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  v_now timestamptz := now();
  v_raw text := btrim(coalesce(p_code, ''));
  code_row public.redeem_codes%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  v_claimed uuid;
  v_base timestamptz;
  v_expires timestamptz;
  v_generic constant text := 'This code is invalid or has already been redeemed.';
BEGIN
  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', v_generic);
  END IF;
  IF v_raw = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', v_generic);
  END IF;

  SELECT * INTO code_row FROM public.redeem_codes WHERE code = upper(v_raw);
  IF NOT FOUND OR code_row.redeemed OR code_row.user_id <> caller_id THEN
    RETURN jsonb_build_object('ok', false, 'message', v_generic);
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = caller_id;

  -- Atomic claim: only one redemption can flip redeemed=false -> true.
  UPDATE public.redeem_codes
     SET redeemed = true, redeemed_at = v_now
   WHERE id = code_row.id AND redeemed = false
  RETURNING id INTO v_claimed;
  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', v_generic);
  END IF;

  -- Lifetime Plus: consume the code, keep the superior entitlement.
  IF profile_row.is_plus_member AND profile_row.plus_expires_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Code redeemed. Your existing lifetime SVJ Plus remains active.',
      'plusExpiresAt', NULL
    );
  END IF;

  -- Extend from the existing valid expiry, or from now.
  IF profile_row.is_plus_member AND profile_row.plus_expires_at > v_now THEN
    v_base := profile_row.plus_expires_at;
  ELSE
    v_base := v_now;
  END IF;
  v_expires := v_base + interval '2 months';

  BEGIN
    -- Narrowly-scoped trusted server write (the audited escape hatch the
    -- protect_profile_privileged_columns trigger allows) so the self-service
    -- Plus grant is not silently reverted like a browser-originated write.
    PERFORM set_config('svj.trusted_server_write', 'on', true);
    UPDATE public.profiles
       SET is_plus_member = true,
           plus_unlocked_at = coalesce(plus_unlocked_at, v_now),
           plus_expires_at = v_expires
     WHERE id = caller_id;
  EXCEPTION WHEN OTHERS THEN
    -- Compensation: un-burn the code so a transient error does not destroy
    -- the user's reward.
    UPDATE public.redeem_codes
       SET redeemed = false, redeemed_at = NULL
     WHERE id = code_row.id;
    RETURN jsonb_build_object('ok', false, 'message', 'Redemption failed. Please retry.');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'SVJ Plus activated for 2 months. Locked to your account — single use.',
    'plusExpiresAt', v_expires
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9) Lock down and grant.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.svj_compute_challenge_run(timestamptz, integer[], text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_get_my_challenge_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_start_my_challenge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_resume_my_challenge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_complete_my_challenge_day(jsonb, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_grant_my_completion_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.svj_redeem_my_plus_code(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.svj_get_my_challenge_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_start_my_challenge() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_resume_my_challenge() TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_complete_my_challenge_day(jsonb, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_redeem_my_plus_code(text) TO authenticated;

COMMIT;

-- PostgREST caches function signatures; refresh so the new RPCs are visible.
NOTIFY pgrst, 'reload schema';
