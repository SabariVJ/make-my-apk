-- ============================================================================
-- Durable avatar references: accept bare Storage object paths.
--
-- The client now saves the avatar as the bare object path (`<uid>/<file>`)
-- inside the private `avatars` bucket instead of a cache-busted public URL.
-- This migration normalizes whatever shape arrives (bare path, bucket-prefixed
-- path, public-style URL, signed URL) down to the bare object path before it is
-- stored, while keeping the ownership rule: only the caller's own namespace is
-- accepted. Existing stored public/signed URLs keep working — display paths
-- re-sign them at render time.
--
-- Idempotent: safe to run multiple times.
-- ============================================================================

BEGIN;

-- Normalization helper: reduce any accepted avatar reference shape to the bare
-- object path inside the avatars bucket. Returns NULL for non-storage shapes.
CREATE OR REPLACE FUNCTION public.svj_normalize_avatar_ref(p_ref text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed text := btrim(COALESCE(p_ref, ''));
  marker_pos integer;
  remainder text;
BEGIN
  IF trimmed IS NULL OR trimmed = '' THEN
    RETURN NULL;
  END IF;

  -- Already-signed or public-style Storage URL: take the segment after the
  -- bucket marker (…/object/sign/avatars/<uid>/<file>).
  marker_pos := strpos(trimmed, '/object/sign/avatars/');
  IF marker_pos = 0 THEN
    marker_pos := strpos(trimmed, '/object/public/avatars/');
  END IF;
  IF marker_pos > 0 THEN
    remainder := substr(trimmed, marker_pos + length('/object/sign/avatars/'));
    remainder := regexp_replace(remainder, '\?.*$', ''); -- drop ?token=…
    RETURN btrim(remainder);
  END IF;

  -- Bucket/public-prefixed bare path: strip the prefixes.
  IF left(trimmed, 15) = 'public/avatars/' THEN
    RETURN btrim(substr(trimmed, 16));
  END IF;
  IF left(trimmed, 8) = 'avatars/' THEN
    RETURN btrim(substr(trimmed, 9));
  END IF;
  IF left(trimmed, 7) = 'public/' THEN
    RETURN btrim(substr(trimmed, 8));
  END IF;

  -- Any other absolute URL (Google avatar, preset image, CDN) is not a Storage
  -- reference; keep it verbatim. Ownership rules below handle the rest.
  IF trimmed LIKE 'http://%' OR trimmed LIKE 'https://%' THEN
    RETURN trimmed;
  END IF;

  -- Bare `<uid>/<file>` object path: keep as-is.
  RETURN trimmed;
END;
$$;

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
  clean_avatar text := public.svj_normalize_avatar_ref(p_avatar_url);
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

  -- Storage-backed avatar references must live in the caller's own namespace.
  -- This covers every accepted shape because normalization has already reduced
  -- them to the bare object path. Explicit removal (p_avatar_changed with a
  -- null/empty reference) is allowed and persists as NULL.
  IF p_avatar_changed
     AND clean_avatar IS NOT NULL
     AND clean_avatar NOT LIKE 'http%'
     AND clean_avatar NOT LIKE (caller_id::text || '/%') THEN
    RAISE EXCEPTION 'Avatar must belong to your SVJ Storage folder';
  END IF;

  RETURN QUERY
  UPDATE public.profiles AS p
  SET display_name = clean_display_name,
      username = clean_username,
      bio = clean_bio,
      location = clean_location,
      avatar_url = CASE WHEN p_avatar_changed THEN clean_avatar ELSE p.avatar_url END
  WHERE p.id = caller_id
  RETURNING p.id, p.username, p.display_name, p.avatar_url, p.bio, p.location, p.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.svj_update_my_profile(text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.svj_update_my_profile(text, text, text, text, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.svj_normalize_avatar_ref(text) FROM PUBLIC, anon, authenticated;

COMMIT;
