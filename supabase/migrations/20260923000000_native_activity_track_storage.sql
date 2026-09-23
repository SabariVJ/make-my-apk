-- ============================================================================
-- SVJ NATIVE ACTIVITY PLATFORM — storage layer (part 1 of 2).
--
-- Fully SVJ-native. There is no external fitness provider anywhere in this
-- schema: every GPS workout is recorded by the SVJ Android foreground service
-- or the SVJ web recorder, and every derived metric is computed server-side
-- from the SVJ-owned track points.
--
-- Tracks are stored as INDEXED GPS POINTS (canonical, for distance / splits /
-- heatmap / segment matching precision) plus a bounded SIMPLIFIED ENCODED
-- POLYLINE on the activity row (display-only, for history previews and maps
-- that must not load thousands of points). Summary fields stay queryable
-- columns so list views never decode a track. This avoids storing huge raw
-- JSON blobs while keeping map rendering cheap.
--
-- Additive only: no existing table is dropped, no existing RPC is changed, no
-- reward economics are touched, and every new table is owner-scoped by RLS
-- with `auth.uid()` — never a client-supplied user id.
-- ============================================================================

BEGIN;

-- ── 1) Provenance: allow genuine Health Connect imports ────────────────────
-- Sources stay a closed set. 'health_connect' is a device/platform source
-- (never a third-party app integration) and is inserted only by the
-- server-side import RPC after deduplication.
ALTER TABLE public.svj_activities DROP CONSTRAINT IF EXISTS svj_activities_source_check;
ALTER TABLE public.svj_activities
  ADD CONSTRAINT svj_activities_source_check
  CHECK (source IN ('svj_native', 'manual', 'strength_log', 'health_connect'));

-- ── 2) GPS / movement summary columns (additive) ───────────────────────────
ALTER TABLE public.svj_activities
  ADD COLUMN IF NOT EXISTS moving_seconds integer,
  ADD COLUMN IF NOT EXISTS elevation_gain_meters numeric(8, 2),
  ADD COLUMN IF NOT EXISTS elevation_loss_meters numeric(8, 2),
  ADD COLUMN IF NOT EXISTS avg_speed_mps numeric(6, 3),
  ADD COLUMN IF NOT EXISTS max_speed_mps numeric(6, 3),
  ADD COLUMN IF NOT EXISTS avg_pace_seconds_per_km integer,
  ADD COLUMN IF NOT EXISTS avg_heart_rate integer,
  ADD COLUMN IF NOT EXISTS max_heart_rate integer,
  ADD COLUMN IF NOT EXISTS avg_cadence integer,
  -- Display-only simplified polyline (encoded, Google/Mapbox algorithm).
  ADD COLUMN IF NOT EXISTS track_polyline text,
  ADD COLUMN IF NOT EXISTS track_point_count integer,
  -- {minLat,minLng,maxLat,maxLng} so maps can fit-to-route without the points.
  ADD COLUMN IF NOT EXISTS track_bounds jsonb,
  -- Server-computed splits: [{index,distanceMeters,durationSeconds,elevGain}]
  ADD COLUMN IF NOT EXISTS splits jsonb,
  ADD COLUMN IF NOT EXISTS split_unit text,
  ADD COLUMN IF NOT EXISTS auto_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_platform text,
  -- GPS quality observed during the recording: searching|weak|good|excellent
  ADD COLUMN IF NOT EXISTS gps_quality text,
  -- Provider-scoped identity used ONLY for dedupe of platform imports.
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS route_id uuid;

-- Bounds are enforced where they matter; NULL means "not measured", never 0.
ALTER TABLE public.svj_activities DROP CONSTRAINT IF EXISTS svj_activities_gps_bounds;
ALTER TABLE public.svj_activities
  ADD CONSTRAINT svj_activities_gps_bounds CHECK (
    (moving_seconds IS NULL OR moving_seconds BETWEEN 0 AND 86400)
    AND (elevation_gain_meters IS NULL OR elevation_gain_meters BETWEEN 0 AND 20000)
    AND (elevation_loss_meters IS NULL OR elevation_loss_meters BETWEEN 0 AND 20000)
    AND (avg_speed_mps IS NULL OR avg_speed_mps BETWEEN 0 AND 100)
    AND (max_speed_mps IS NULL OR max_speed_mps BETWEEN 0 AND 100)
    AND (avg_pace_seconds_per_km IS NULL OR avg_pace_seconds_per_km BETWEEN 0 AND 36000)
    AND (avg_heart_rate IS NULL OR avg_heart_rate BETWEEN 20 AND 260)
    AND (max_heart_rate IS NULL OR max_heart_rate BETWEEN 20 AND 260)
    AND (avg_cadence IS NULL OR avg_cadence BETWEEN 0 AND 400)
    AND (track_point_count IS NULL OR track_point_count BETWEEN 0 AND 200000)
    AND (track_polyline IS NULL OR char_length(track_polyline) <= 200000)
    AND (split_unit IS NULL OR split_unit IN ('km', 'mi'))
    AND (gps_quality IS NULL OR gps_quality IN ('searching', 'weak', 'good', 'excellent'))
  );

-- One platform import can never create a second permanent activity.
CREATE UNIQUE INDEX IF NOT EXISTS svj_activities_external_identity
  ON public.svj_activities (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS svj_activities_user_started_idx
  ON public.svj_activities (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS svj_activities_user_type_started_idx
  ON public.svj_activities (user_id, activity_type, started_at DESC);

-- ── 3) Canonical GPS track points ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.svj_activity_track_points (
  id bigserial PRIMARY KEY,
  activity_id uuid NOT NULL REFERENCES public.svj_activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Monotonic order within the activity. Pauses do not reset it.
  seq integer NOT NULL CHECK (seq >= 0),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  elevation_m numeric(8, 2),
  -- Milliseconds since the activity started (server-validated, monotonic).
  t_offset_ms bigint NOT NULL CHECK (t_offset_ms >= 0),
  -- 0 means "paused when sampled": excluded from moving time and distance.
  moving boolean NOT NULL DEFAULT true,
  heart_rate integer CHECK (heart_rate IS NULL OR heart_rate BETWEEN 20 AND 260),
  cadence integer CHECK (cadence IS NULL OR cadence BETWEEN 0 AND 400),
  accuracy_m numeric(6, 2),
  CONSTRAINT svj_track_points_identity UNIQUE (activity_id, seq)
);

CREATE INDEX IF NOT EXISTS svj_track_points_activity_idx
  ON public.svj_activity_track_points (activity_id, seq);
-- Heatmap + "activities near me" queries scan by owner + time.
CREATE INDEX IF NOT EXISTS svj_track_points_user_idx
  ON public.svj_activity_track_points (user_id, activity_id);

ALTER TABLE public.svj_activity_track_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_activity_track_points FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_activity_track_points FROM PUBLIC, anon, authenticated;
-- Read-only for the owner; rows are written exclusively by the definer RPC.
GRANT SELECT ON public.svj_activity_track_points TO authenticated;
GRANT ALL ON public.svj_activity_track_points TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.svj_activity_track_points_id_seq TO service_role;

DROP POLICY IF EXISTS "Users read own track points" ON public.svj_activity_track_points;
CREATE POLICY "Users read own track points"
  ON public.svj_activity_track_points FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners write own track points" ON public.svj_activity_track_points;
CREATE POLICY "Owners write own track points"
  ON public.svj_activity_track_points FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 4) Route library (SVJ-owned, private by default) ───────────────────────
CREATE TABLE IF NOT EXISTS public.svj_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  activity_type text NOT NULL CHECK (activity_type IN (
    'walking', 'running', 'cycling', 'hiking', 'other'
  )),
  -- Route geometry is a copy of an SVJ activity's simplified polyline.
  polyline text NOT NULL CHECK (char_length(polyline) BETWEEN 2 AND 200000),
  bounds jsonb,
  distance_meters numeric(10, 2) CHECK (distance_meters IS NULL OR distance_meters >= 0),
  elevation_gain_meters numeric(8, 2) CHECK (elevation_gain_meters IS NULL OR elevation_gain_meters >= 0),
  source_activity_id uuid REFERENCES public.svj_activities(id) ON DELETE SET NULL,
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_routes_name_identity UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS svj_routes_user_idx
  ON public.svj_routes (user_id, favorite DESC, updated_at DESC);

ALTER TABLE public.svj_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_routes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_routes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_routes TO authenticated;
GRANT ALL ON public.svj_routes TO service_role;

-- Routes are never writable directly: name/type/polyline validation lives in
-- the definer RPCs, so a client cannot forge geometry or another owner's row.
DROP POLICY IF EXISTS "Users read own routes" ON public.svj_routes;
CREATE POLICY "Users read own routes"
  ON public.svj_routes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners write own routes" ON public.svj_routes;
CREATE POLICY "Owners write own routes"
  ON public.svj_routes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 5) Personal segments (never public, never a KOM clone) ─────────────────
CREATE TABLE IF NOT EXISTS public.svj_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  activity_type text NOT NULL CHECK (activity_type IN (
    'walking', 'running', 'cycling', 'hiking', 'other'
  )),
  start_lat double precision NOT NULL CHECK (start_lat BETWEEN -90 AND 90),
  start_lng double precision NOT NULL CHECK (start_lng BETWEEN -180 AND 180),
  end_lat double precision NOT NULL CHECK (end_lat BETWEEN -90 AND 90),
  end_lng double precision NOT NULL CHECK (end_lng BETWEEN -180 AND 180),
  -- Match tolerance in metres for start/end anchors.
  tolerance_meters integer NOT NULL DEFAULT 30 CHECK (tolerance_meters BETWEEN 10 AND 200),
  source_activity_id uuid REFERENCES public.svj_activities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_segments_name_identity UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS svj_segments_user_idx
  ON public.svj_segments (user_id, created_at DESC);

ALTER TABLE public.svj_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_segments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_segments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_segments TO authenticated;
GRANT ALL ON public.svj_segments TO service_role;

DROP POLICY IF EXISTS "Users read own segments" ON public.svj_segments;
CREATE POLICY "Users read own segments"
  ON public.svj_segments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners write own segments" ON public.svj_segments;
CREATE POLICY "Owners write own segments"
  ON public.svj_segments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Attempts are derived server-side from track points. The unique key makes
-- re-processing the same activity idempotent (never a duplicate attempt).
CREATE TABLE IF NOT EXISTS public.svj_segment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id uuid NOT NULL REFERENCES public.svj_segments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.svj_activities(id) ON DELETE CASCADE,
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 1 AND 43200),
  started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_segment_attempts_identity UNIQUE (segment_id, activity_id)
);

CREATE INDEX IF NOT EXISTS svj_segment_attempts_segment_idx
  ON public.svj_segment_attempts (segment_id, duration_seconds);

ALTER TABLE public.svj_segment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_segment_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_segment_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_segment_attempts TO authenticated;
GRANT ALL ON public.svj_segment_attempts TO service_role;

DROP POLICY IF EXISTS "Users read own segment attempts" ON public.svj_segment_attempts;
CREATE POLICY "Users read own segment attempts"
  ON public.svj_segment_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners write own segment attempts" ON public.svj_segment_attempts;
CREATE POLICY "Owners write own segment attempts"
  ON public.svj_segment_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 6) SVJ Live Share ─────────────────────────────────────────────────────
-- A live share is a short-lived, revocable, unguessable token that exposes a
-- coarse live position for ONE activity. It never exposes an account id,
-- e-mail, token or auth state: the public reader returns a sanitized payload.
CREATE TABLE IF NOT EXISTS public.svj_live_share_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.svj_activities(id) ON DELETE CASCADE,
  -- 32 bytes of CSPRNG entropy, hex encoded (64 chars). Unguessable.
  token text NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 32 AND 128),
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 40),
  activity_type text,
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_lat double precision CHECK (last_lat IS NULL OR last_lat BETWEEN -90 AND 90),
  last_lng double precision CHECK (last_lng IS NULL OR last_lng BETWEEN -180 AND 180),
  last_accuracy_m numeric(6, 2),
  last_elapsed_seconds integer CHECK (last_elapsed_seconds IS NULL OR last_elapsed_seconds >= 0),
  last_distance_meters numeric(10, 2) CHECK (last_distance_meters IS NULL OR last_distance_meters >= 0),
  last_update_at timestamptz,
  battery_percent integer CHECK (battery_percent IS NULL OR battery_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT svj_live_share_window CHECK (expires_at > started_at)
);

CREATE INDEX IF NOT EXISTS svj_live_share_user_idx
  ON public.svj_live_share_sessions (user_id, expires_at DESC);

ALTER TABLE public.svj_live_share_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.svj_live_share_sessions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.svj_live_share_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.svj_live_share_sessions TO authenticated;
GRANT ALL ON public.svj_live_share_sessions TO service_role;

-- Only the owner can even see the row (including the token). The public
-- reader is a definer function with an expiry + revocation check.
DROP POLICY IF EXISTS "Owners read own live shares" ON public.svj_live_share_sessions;
CREATE POLICY "Owners read own live shares"
  ON public.svj_live_share_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners write own live shares" ON public.svj_live_share_sessions;
CREATE POLICY "Owners write own live shares"
  ON public.svj_live_share_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.svj_activities IS
  'Canonical server-backed activity records. One row per completed session; idempotent by (user_id, client_session_id). GPS workouts additionally carry server-computed distance/splits/polyline and an indexed point track in svj_activity_track_points.';
COMMENT ON TABLE public.svj_activity_track_points IS
  'Canonical SVJ-owned GPS samples for one activity. Indexed points (not raw JSON) so distance, splits, heatmap and segment matching stay queryable. Owner-scoped by RLS.';
COMMENT ON TABLE public.svj_live_share_sessions IS
  'SVJ Live Share: revocable, expiring, unguessable token exposing a coarse live position for one activity. Never exposes account identity or auth material.';

COMMIT;
