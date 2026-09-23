-- ============================================================================
-- SVJ Recovery V2 — Phase 6: derived Recovery records.
--
-- Recovery → Records shows the athlete's OWN historical bests, derived at READ
-- time from the canonical recovery history and from nothing else:
--
--   public.svj_readiness_daily   (server-derived readiness snapshots)
--   public.svj_recovery_checkins (explicit, stored user check-ins)
--
-- There is deliberately NO record table, NO record column and NO write RPC:
-- a client can never create, state, edit or delete a Recovery record. The four
-- record types are:
--
--   highest_readiness_score    MAX(score); ties → most recent day
--   longest_checkin_streak     longest run of consecutive stored check-in
--                              dates; ties → most recent run
--   longest_ready_streak       longest run of consecutive readiness days with
--                              score >= 60 (the existing Phase 2/5 boundary);
--                              ties → most recent run
--   best_7d_readiness_average  highest SUM(score) / 7.0 across 7 consecutive
--                              calendar days that ALL have canonical rows;
--                              ties → most recent window
--
-- Calendar semantics: every date is a canonical SERVER date exactly as stored
-- (readiness_date / checkin_date). Consecutiveness means date + 1 calendar day.
-- A missing day is ABSENT — never score 0 — and it breaks streaks and 7-day
-- windows exactly as Recovery → History renders them. A stored score of 0 is
-- real data and stays a real value.
--
-- Records are read/derive/display only: no XP, no Discipline, no Recovery stat
-- and no achievement is awarded here, and goals are never touched.
--
-- DEPENDENCY: public.svj_readiness_daily + public.svj_recovery_checkins
-- (20260919120000_recovery_readiness.sql). Additive and idempotent; safe to run
-- on the current production schema. It does NOT modify svj_list_records,
-- svj_goals, stat_events or any Training record function.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.svj_list_recovery_records()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_records jsonb := '[]'::jsonb;
  v_score integer;
  v_score_date date;
  v_len integer;
  v_start date;
  v_end date;
  v_average numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ── 1) highest_readiness_score ───────────────────────────────────────────
  -- MAX(score) across every canonical readiness day of the caller. A real
  -- stored 0 is data, so the record exists whenever a row does; the tie-break
  -- (score DESC, date DESC) keeps the most recent qualifying day.
  SELECT r.score, r.readiness_date INTO v_score, v_score_date
  FROM public.svj_readiness_daily r
  WHERE r.user_id = v_user_id
  ORDER BY r.score DESC, r.readiness_date DESC
  LIMIT 1;

  IF v_score IS NOT NULL THEN
    v_records := v_records || jsonb_build_object(
      'record_type', 'highest_readiness_score',
      'value', v_score,
      'achieved_date', v_score_date,
      'start_date', NULL
    );
  END IF;

  -- ── 2) longest_checkin_streak ────────────────────────────────────────────
  -- Longest sequence of consecutive stored check-in dates. DISTINCT keeps one
  -- date counting once; a missing calendar day breaks the run. Gaps-and-islands:
  -- consecutive dates share the same (date - row_number) island key. Ties keep
  -- the most recent run.
  SELECT COUNT(*)::integer, MIN(run_day), MAX(run_day)
    INTO v_len, v_start, v_end
  FROM (
    SELECT d AS run_day, d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS island
    FROM (
      SELECT DISTINCT c.checkin_date AS d
      FROM public.svj_recovery_checkins c
      WHERE c.user_id = v_user_id
    ) checkin_days
  ) runs
  GROUP BY island
  ORDER BY COUNT(*) DESC, MAX(run_day) DESC, MIN(run_day) DESC
  LIMIT 1;

  IF v_len IS NOT NULL THEN
    v_records := v_records || jsonb_build_object(
      'record_type', 'longest_checkin_streak',
      'value', v_len,
      'achieved_date', v_end,
      'start_date', v_start
    );
  END IF;

  -- ── 3) longest_ready_streak ──────────────────────────────────────────────
  -- Same shape, restricted to canonical readiness days at 60 or above. 60 is
  -- the SAME low-readiness boundary Recovery has used since Phase 2
  -- (svj_compute_readiness 'good' grade, svj_goal_progress 'readiness_60_day_count')
  -- — not a new threshold. Missing days are never synthesized, and a stored
  -- score of 59 breaks the run while 60 continues it.
  SELECT COUNT(*)::integer, MIN(run_day), MAX(run_day)
    INTO v_len, v_start, v_end
  FROM (
    SELECT d AS run_day, d - (ROW_NUMBER() OVER (ORDER BY d))::integer AS island
    FROM (
      SELECT DISTINCT r.readiness_date AS d
      FROM public.svj_readiness_daily r
      WHERE r.user_id = v_user_id
        AND r.score >= 60
    ) ready_days
  ) runs
  GROUP BY island
  ORDER BY COUNT(*) DESC, MAX(run_day) DESC, MIN(run_day) DESC
  LIMIT 1;

  IF v_len IS NOT NULL THEN
    v_records := v_records || jsonb_build_object(
      'record_type', 'longest_ready_streak',
      'value', v_len,
      'achieved_date', v_end,
      'start_date', v_start
    );
  END IF;

  -- ── 4) best_7d_readiness_average ─────────────────────────────────────────
  -- Every window ends on a real readiness day and spans that day plus the six
  -- preceding calendar days. A window only qualifies when ALL SEVEN dates have
  -- canonical rows (present_days = 7): a missing day invalidates the window and
  -- is never counted as 0. The average is SUM(score) / 7.0 at full numeric
  -- precision — rounding is a display concern. Ties keep the most recent window.
  SELECT w.total_score / 7.0, w.window_start, w.window_end
    INTO v_average, v_start, v_end
  FROM (
    SELECT d.end_date AS window_end,
           (d.end_date - 6) AS window_start,
           (
             SELECT COUNT(*)
             FROM public.svj_readiness_daily present
             WHERE present.user_id = v_user_id
               AND present.readiness_date BETWEEN (d.end_date - 6) AND d.end_date
           ) AS present_days,
           (
             SELECT SUM(present.score)
             FROM public.svj_readiness_daily present
             WHERE present.user_id = v_user_id
               AND present.readiness_date BETWEEN (d.end_date - 6) AND d.end_date
           ) AS total_score
    FROM (
      SELECT DISTINCT r.readiness_date AS end_date
      FROM public.svj_readiness_daily r
      WHERE r.user_id = v_user_id
    ) d
  ) w
  WHERE w.present_days = 7
  ORDER BY (w.total_score / 7.0) DESC, w.window_end DESC
  LIMIT 1;

  IF v_average IS NOT NULL THEN
    v_records := v_records || jsonb_build_object(
      'record_type', 'best_7d_readiness_average',
      'value', v_average,
      'achieved_date', v_end,
      'start_date', v_start
    );
  END IF;

  -- Only records that genuinely exist are returned: an absent record type is
  -- never reported as 0, and a real 0 (highest_readiness_score) is real.
  RETURN jsonb_build_object('ok', true, 'records', v_records);
END;
$$;

-- Identity is always auth.uid(); there is no caller-supplied user id and no
-- write path. Same grant surface as the existing record readers.
REVOKE ALL ON FUNCTION public.svj_list_recovery_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_list_recovery_records() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
