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
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_base_expires_at timestamptz;
  v_expires_at timestamptz;
  v_existing_gift public.plus_gifts%ROWTYPE;
  v_has_existing_gift boolean := false;
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
  ELSIF p_duration_value IS NULL OR p_duration_value < 1 OR p_duration_value > 104 THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_INVALID_DURATION';
  ELSE
    IF p_duration_value > 24 THEN
      RAISE EXCEPTION 'SVJ_ADMIN_PLUS_INVALID_DURATION';
    END IF;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SVJ_ADMIN_PLUS_PROFILE_NOT_FOUND';
  END IF;

  UPDATE public.plus_gifts
     SET claimed_at = v_now
   WHERE recipient_user_id = p_target_user_id
     AND claimed_at IS NULL
     AND expires_at IS NOT NULL
     AND expires_at <= v_now;

  SELECT * INTO v_existing_gift
    FROM public.plus_gifts
    WHERE recipient_user_id = p_target_user_id
      AND claimed_at IS NULL
    ORDER BY
      CASE WHEN expires_at IS NULL THEN 0 ELSE 1 END,
      expires_at DESC NULLS FIRST,
      created_at DESC
    LIMIT 1
    FOR UPDATE;
  v_has_existing_gift := FOUND;

  IF v_has_existing_gift AND v_existing_gift.duration_unit = 'lifetime' THEN
    PERFORM set_config('svj.trusted_server_write', 'on', true);
    UPDATE public.profiles
       SET is_plus_member = true,
           plus_expires_at = NULL,
           plus_unlocked_at = COALESCE(plus_unlocked_at, v_now)
     WHERE id = p_target_user_id;
    PERFORM set_config('svj.trusted_server_write', 'off', true);
    RETURN QUERY SELECT v_existing_gift.id, NULL::timestamptz;
    RETURN;
  END IF;

  v_base_expires_at := CASE
    WHEN v_has_existing_gift AND v_existing_gift.expires_at IS NOT NULL AND v_existing_gift.expires_at > v_now
      THEN v_existing_gift.expires_at
    WHEN v_profile.plus_expires_at IS NOT NULL AND v_profile.plus_expires_at > v_now
      THEN v_profile.plus_expires_at
    ELSE v_now
  END;

  IF p_duration_unit = 'lifetime' THEN
    v_expires_at := NULL;
  ELSIF p_duration_unit = 'week' THEN
    v_expires_at := v_base_expires_at + make_interval(weeks => p_duration_value);
  ELSE
    v_expires_at := v_base_expires_at + make_interval(months => p_duration_value);
  END IF;

  PERFORM set_config('svj.trusted_server_write', 'on', true);
  UPDATE public.profiles
     SET is_plus_member = true,
         plus_expires_at = v_expires_at,
         plus_unlocked_at = COALESCE(plus_unlocked_at, v_now)
   WHERE id = p_target_user_id;
  PERFORM set_config('svj.trusted_server_write', 'off', true);

  IF v_has_existing_gift THEN
    UPDATE public.plus_gifts
       SET granted_by = p_granted_by,
           sender_label = COALESCE(NULLIF(trim(p_sender_label), ''), 'SVJ Admin'),
           duration_value = p_duration_value,
           duration_unit = p_duration_unit,
           expires_at = v_expires_at
     WHERE id = v_existing_gift.id
     RETURNING id INTO v_grant_id;
  ELSE
    INSERT INTO public.plus_gifts (recipient_user_id, granted_by, sender_label, duration_value, duration_unit, expires_at)
    VALUES (p_target_user_id, p_granted_by, COALESCE(NULLIF(trim(p_sender_label), ''), 'SVJ Admin'), p_duration_value, p_duration_unit, v_expires_at)
    RETURNING id INTO v_grant_id;
  END IF;

  RETURN QUERY SELECT v_grant_id, v_expires_at;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('svj.trusted_server_write', 'off', true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.svj_claim_plus_gift(p_grant_id uuid)
RETURNS TABLE (
  ok boolean,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_gift public.plus_gifts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_gift FROM public.plus_gifts
  WHERE id = p_grant_id AND recipient_user_id = auth.uid()
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
  UPDATE public.plus_gifts SET claimed_at = v_now WHERE id = v_gift.id;
  RETURN QUERY SELECT true, v_gift.expires_at;
END;
$$;