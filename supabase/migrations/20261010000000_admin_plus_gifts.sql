-- ============================================================================
-- SVJ Admin Plus gifts + in-app claim notice
--
-- The admin "Give Plus" action must write through the same trusted-server path
-- used by protected membership fields. A persistent gift row lets the recipient
-- see a one-time in-app "Claim Plus" notice after login.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.plus_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  sender_label text NOT NULL DEFAULT 'SVJ Admin'
    CHECK (char_length(sender_label) BETWEEN 1 AND 32),
  duration_value integer NOT NULL,
  duration_unit text NOT NULL
    CHECK (duration_unit IN ('week', 'month', 'lifetime')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  CHECK (
    (duration_unit = 'lifetime' AND duration_value = 0)
    OR
    (duration_unit IN ('week', 'month') AND duration_value BETWEEN 1 AND 104)
  )
);

CREATE INDEX IF NOT EXISTS plus_gifts_recipient_pending_idx
  ON public.plus_gifts (recipient_user_id, created_at DESC)
  WHERE claimed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS plus_gifts_one_pending_per_user_idx
  ON public.plus_gifts (recipient_user_id)
  WHERE claimed_at IS NULL;

ALTER TABLE public.plus_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plus_gifts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.plus_gifts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plus_gifts TO authenticated;

DROP POLICY IF EXISTS "Users can view their own Plus gifts" ON public.plus_gifts;
CREATE POLICY "Users can view their own Plus gifts"
  ON public.plus_gifts
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- --------------------------------------------------------------------------
-- Admin grant RPC
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.svj_admin_grant_plus(
  p_target_user_id uuid,
  p_granted_by uuid,
  p_duration_value integer,
  p_duration_unit text,
  p_sender_label text DEFAULT 'SVJ Admin'
)
RETURNS TABLE (
  grant_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
  v_profile public.profiles%ROWTYPE;
  v_grant_id uuid;
BEGIN
  IF COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_SERVICE_ROLE_REQUIRED';
  END IF;

  IF p_target_user_id IS NULL OR p_granted_by IS NULL THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_INVALID_USER';
  END IF;

  IF p_duration_unit NOT IN ('week', 'month', 'lifetime') THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_INVALID_DURATION';
  END IF;

  IF p_duration_unit = 'lifetime' THEN
    IF p_duration_value <> 0 THEN
      RAISE EXCEPTION 'SVJ_ADMIN_PLUS_INVALID_DURATION';
    END IF;
    v_expires_at := NULL;
  ELSIF p_duration_value IS NULL OR p_duration_value < 1 OR p_duration_value > 104 THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_INVALID_DURATION';
  ELSIF p_duration_unit = 'week' THEN
    v_expires_at := v_now + make_interval(weeks => p_duration_value);
  ELSE
    IF p_duration_value > 24 THEN
      RAISE EXCEPTION 'SVJ_ADMIN_PLUS_INVALID_DURATION';
    END IF;
    v_expires_at := v_now + make_interval(months => p_duration_value);
  END IF;

  SELECT *
    INTO v_profile
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_PROFILE_NOT_FOUND';
  END IF;

  IF v_profile.is_plus_member
     AND (v_profile.plus_expires_at IS NULL OR v_profile.plus_expires_at > v_now) THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_ALREADY_ACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.plus_gifts
    WHERE recipient_user_id = p_target_user_id
      AND claimed_at IS NULL
      AND (expires_at IS NULL OR expires_at > v_now)
  ) THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_GIFT_PENDING';
  END IF;

  PERFORM set_config('svj.trusted_server_write', 'on', true);

  UPDATE public.profiles
     SET is_plus_member = true,
         plus_expires_at = v_expires_at,
         plus_unlocked_at = COALESCE(plus_unlocked_at, v_now)
   WHERE id = p_target_user_id;

  PERFORM set_config('svj.trusted_server_write', 'off', true);

  INSERT INTO public.plus_gifts (
    recipient_user_id,
    granted_by,
    sender_label,
    duration_value,
    duration_unit,
    expires_at
  )
  VALUES (
    p_target_user_id,
    p_granted_by,
    COALESCE(NULLIF(trim(p_sender_label), ''), 'SVJ Admin'),
    p_duration_value,
    p_duration_unit,
    v_expires_at
  )
  RETURNING id INTO v_grant_id;

  RETURN QUERY SELECT v_grant_id, v_expires_at;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('svj.trusted_server_write', 'off', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_admin_grant_plus(uuid, uuid, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.svj_admin_grant_plus(uuid, uuid, integer, text, text)
  TO service_role;

-- --------------------------------------------------------------------------
-- Recipient claim/acknowledgement RPC
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.svj_claim_plus_gift(p_grant_id uuid)
RETURNS TABLE (
  ok boolean,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift public.plus_gifts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT *
    INTO v_gift
  FROM public.plus_gifts
  WHERE id = p_grant_id
    AND recipient_user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SVJ_PLUS_GIFT_NOT_FOUND';
  END IF;

  IF v_gift.claimed_at IS NOT NULL THEN
    RETURN QUERY SELECT false, v_gift.expires_at;
    RETURN;
  END IF;

  IF v_gift.expires_at IS NOT NULL AND v_gift.expires_at <= v_now THEN
    RAISE EXCEPTION 'SVJ_PLUS_GIFT_EXPIRED';
  END IF;

  UPDATE public.plus_gifts
     SET claimed_at = v_now
   WHERE id = v_gift.id;

  RETURN QUERY SELECT true, v_gift.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_claim_plus_gift(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_claim_plus_gift(uuid)
  TO authenticated;

COMMIT;
