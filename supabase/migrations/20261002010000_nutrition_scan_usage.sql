-- ============================================================================
-- SVJ Fuel / Nutrition V2 — server-enforced AI scan quotas.
-- Free accounts: 3 meal-photo analyses per local day.
-- Plus accounts: 20 per local day.
-- The caller identity always comes from auth.uid().
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.svj_nutrition_scan_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_key date NOT NULL,
  scan_count integer NOT NULL DEFAULT 0 CHECK (scan_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_key)
);

ALTER TABLE public.svj_nutrition_scan_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_nutrition_scan_usage FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.svj_nutrition_scan_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.svj_nutrition_scan_usage TO service_role;

DROP POLICY IF EXISTS "Users read own nutrition scan usage" ON public.svj_nutrition_scan_usage;
CREATE POLICY "Users read own nutrition scan usage"
  ON public.svj_nutrition_scan_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.svj_claim_nutrition_scan(p_day_key date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_day date := COALESCE(p_day_key, CURRENT_DATE);
  v_plus boolean := false;
  v_limit integer;
  v_used integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF v_day < CURRENT_DATE - 1 OR v_day > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'Invalid scan date';
  END IF;

  SELECT COALESCE(
    is_plus_member
    AND (plus_expires_at IS NULL OR plus_expires_at > now()),
    false
  )
  INTO v_plus
  FROM public.profiles
  WHERE id = v_user_id;

  v_limit := CASE WHEN v_plus THEN 20 ELSE 3 END;

  INSERT INTO public.svj_nutrition_scan_usage (user_id, day_key, scan_count, updated_at)
  VALUES (v_user_id, v_day, 0, now())
  ON CONFLICT (user_id, day_key) DO NOTHING;

  SELECT scan_count INTO v_used
  FROM public.svj_nutrition_scan_usage
  WHERE user_id = v_user_id AND day_key = v_day
  FOR UPDATE;

  IF COALESCE(v_used, 0) >= v_limit THEN
    RETURN jsonb_build_object(
      'ok', true,
      'allowed', false,
      'used', COALESCE(v_used, 0),
      'limit', v_limit
    );
  END IF;

  UPDATE public.svj_nutrition_scan_usage
  SET scan_count = scan_count + 1, updated_at = now()
  WHERE user_id = v_user_id AND day_key = v_day
  RETURNING scan_count INTO v_used;

  RETURN jsonb_build_object(
    'ok', true,
    'allowed', true,
    'used', v_used,
    'limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.svj_claim_nutrition_scan(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_claim_nutrition_scan(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.svj_claim_nutrition_scan(date) TO service_role;

COMMIT;
