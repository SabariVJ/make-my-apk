-- ============================================================================
-- SVJ RECOVERY — history automation: expose the user's own check-in values.
--
-- ADDITIVE ONLY. No table, column, index, policy or grant is created, dropped
-- or altered; this replaces one read-only RPC with the SAME name and the SAME
-- signature so existing clients keep working.
--
-- Why: the readiness snapshot (svj_readiness_daily) stores the derived score and
-- training-load band, but the user's own check-in (sleep / soreness / energy /
-- perceived recovery) lives in svj_recovery_checkins and was invisible to the
-- history read. The client therefore only ever had sleep evidence in its local
-- cache, so on a reinstall or a new device the 7-day trend lost its sleep
-- points and "your best sleep" had no history to derive from.
--
-- Each day now also reports the recorded-activity load that produced its score,
-- so history accumulates automatically from real canonical activity instead of
-- being reconstructed from whatever happened to be cached on the device.
--
-- Identity stays auth.uid(): no user id is ever accepted from the client, and
-- every branch is filtered by the caller on BOTH joined tables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.svj_list_my_recovery_history(
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_limit integer := GREATEST(1, LEAST(90, COALESCE(p_limit, 30)));
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN COALESCE(jsonb_agg(s.row ORDER BY s.readiness_date DESC), '[]'::jsonb)
  FROM (
    SELECT
      d.readiness_date,
      jsonb_build_object(
        'date', d.readiness_date,
        'score', d.score,
        'trainingLoad', d.training_load,
        'recovery', d.recovery_grade,
        -- Additive: the real recorded-activity load behind that day's score.
        'loadPoints7d', COALESCE(d.components -> 'loadPoints7d', '0'::jsonb),
        'restDaysLast3', COALESCE(d.components -> 'restDaysLast3', 'null'::jsonb),
        -- Additive: the user's own check-in — the authoritative durable copy.
        'hasCheckin', (c.checkin_date IS NOT NULL),
        'sleepHours', c.sleep_hours,
        'soreness', c.soreness,
        'energy', c.energy,
        'perceivedRecovery', c.perceived_recovery
      ) AS row
    FROM public.svj_readiness_daily d
    LEFT JOIN public.svj_recovery_checkins c
      ON c.user_id = d.user_id
     AND c.checkin_date = d.readiness_date
    WHERE d.user_id = v_caller
      AND (c.user_id IS NULL OR c.user_id = v_caller)
    ORDER BY d.readiness_date DESC
    LIMIT v_limit
  ) s;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_list_my_recovery_history(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_list_my_recovery_history(integer)
  TO authenticated;

-- ── PostgREST schema reload ──────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
