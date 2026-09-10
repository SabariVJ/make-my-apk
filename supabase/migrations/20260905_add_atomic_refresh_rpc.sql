-- ============================================================================
-- Atomic personalized-refresh cooldown reservation.
-- ============================================================================
-- Replaces the two-step SELECT-then-UPDATE in refreshPersonalizedChallenges
-- with a single atomic operation, so concurrent refresh requests cannot both
-- pass the cooldown check.
--
-- Depends on the column added by 20260905_add_personalized_refresh_cooldown.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.svj_reserve_personalized_refresh()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  cooldown_interval interval := interval '30 minutes';
  new_ts timestamptz := now();
  current_ts timestamptz;
  remaining_ms integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  -- Atomic check-and-reserve: only one caller wins per cooldown window.
  UPDATE public.user_personalization
  SET last_personalized_refresh_at = new_ts
  WHERE user_id = caller_id
    AND (last_personalized_refresh_at IS NULL
         OR last_personalized_refresh_at <= new_ts - cooldown_interval);

  IF NOT FOUND THEN
    -- Cooldown still active, or another request already consumed it.
    SELECT last_personalized_refresh_at
      INTO current_ts
    FROM public.user_personalization
    WHERE user_id = caller_id;

    IF current_ts IS NULL THEN
      -- No row yet (defensive; should not happen when assessment is complete).
      remaining_ms := 30 * 60 * 1000;
    ELSE
      remaining_ms := CEIL(EXTRACT(EPOCH FROM (new_ts - current_ts)) * 1000);
      IF remaining_ms < 0 THEN
        remaining_ms := 0;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'cooldownRemainingMs', remaining_ms,
      'error', 'Personalized tasks are on a cooldown. Try again later.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'cooldownRemainingMs', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.svj_reserve_personalized_refresh() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_reserve_personalized_refresh() TO authenticated;
