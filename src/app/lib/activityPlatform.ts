// ============================================================================
// SVJ NATIVE ACTIVITY PLATFORM — RPC layer.
//
// Network code lives here so the pure modules stay testable. Every call takes
// an injected `RpcClient` (the existing convention in this codebase), so tests
// never touch the network and the signed-out app never constructs a client.
//
// Nothing in this file computes XP: a saved workout is handed to the existing
// server-authoritative reward processor by id only.
// ============================================================================

import { processActivityRewards, rewardsRpcClient, type RpcClient } from "./rewards";
import {
  decodePolyline,
  encodePolyline,
  formatClock,
  formatDistance,
  simplifyTrack,
  type GpsActivityType,
  type TrackPoint,
} from "./gpsActivity";
import type { WorkoutSession } from "./gpsRecorder";

export type { RpcClient };

/** Null when the app has no backend configured (signed-out / web preview). */
export function activityRpcClient(): RpcClient | null {
  return rewardsRpcClient();
}

async function call(
  client: RpcClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) return { ok: false, error: error.message || "Request failed." };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ── Saving a recorded workout ──────────────────────────────────────────────

/** Wire shape of one submitted sample. `acc` is the raw GPS accuracy. */
export interface GpsPointPayload {
  lat: number;
  lng: number;
  t: number;
  ele: number | null;
  hr: number | null;
  cad: number | null;
  acc: number | null;
  moving: boolean;
}

export interface GpsSavePayload {
  p_client_session_id: string;
  p_activity_type: GpsActivityType;
  p_started_at: string;
  p_ended_at: string;
  p_duration_seconds: number;
  p_points: GpsPointPayload[];
  p_step_count: number;
  p_moving_seconds: number | null;
  p_polyline: string | null;
  p_bounds: Record<string, number> | null;
  p_device_platform: string;
  p_gps_quality: string;
  p_auto_paused: boolean;
  p_split_unit: "km" | "mi";
}

/** Raw samples plus display hints. No XP, no distance claim, no user id. */
export function buildGpsSavePayload(session: WorkoutSession): GpsSavePayload | null {
  if (session.points.length < 2 || session.endedAtMs == null) return null;
  const simplified = simplifyTrack(session.points, 8);
  return {
    p_client_session_id: session.clientSessionId,
    p_activity_type: session.activityType,
    p_started_at: new Date(session.startedAtMs).toISOString(),
    p_ended_at: new Date(session.endedAtMs).toISOString(),
    p_duration_seconds: Math.max(1, Math.round(session.durationSeconds)),
    p_points: session.points.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      t: point.t,
      ele: point.ele ?? null,
      hr: point.hr ?? null,
      cad: point.cad ?? null,
      acc: point.accuracy ?? null,
      moving: point.moving !== false,
    })),
    p_step_count: Math.max(0, Math.round(session.steps)),
    p_moving_seconds: null,
    p_polyline: simplified.length >= 2 ? encodePolyline(simplified) : null,
    p_bounds: session.points.length >= 2 ? boundsOf(session.points) : null,
    p_device_platform: session.devicePlatform,
    p_gps_quality: session.gpsQuality,
    p_auto_paused: session.autoPaused === true,
    p_split_unit: session.splitUnit,
  };
}

function boundsOf(points: readonly TrackPoint[]): Record<string, number> | null {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) return null;
  return { minLat, minLng, maxLat, maxLng };
}

export interface SaveWorkoutResult {
  ok: boolean;
  duplicate?: boolean;
  activityId?: string;
  error?: string;
  /** Server-confirmed rewards (never calculated on the client). */
  rewards?: Awaited<ReturnType<typeof processActivityRewards>>["rewards"];
}

/**
 * Save one recorded workout, then ask the server to evaluate rewards.
 * Retrying the SAME session is safe: the server returns the original activity
 * and the reward ledger makes a second grant a no-op.
 */
export async function saveGpsWorkout(
  client: RpcClient,
  session: WorkoutSession,
): Promise<SaveWorkoutResult> {
  const payload = buildGpsSavePayload(session);
  if (!payload) {
    return { ok: false, error: "This workout has no GPS track to save." };
  }
  const result = await call(
    client,
    "svj_save_gps_activity",
    payload as unknown as Record<string, unknown>,
  );
  if (!result.ok) return { ok: false, error: result.error };
  const envelope = result.data;
  if (!isRecord(envelope) || envelope.ok !== true || !isRecord(envelope.activity)) {
    return { ok: false, error: "The server rejected this workout." };
  }
  const activityId = str(envelope.activity.id);
  if (!activityId) return { ok: false, error: "The server returned an unreadable workout." };

  const duplicate = envelope.duplicate === true;
  // XP is evaluated only for a genuinely new activity; a duplicate is already
  // fully processed and the ledger would no-op anyway.
  const rewardResult = duplicate
    ? { ok: true as const, rewards: undefined }
    : await processActivityRewards(client, activityId);

  return {
    ok: true,
    duplicate,
    activityId,
    rewards: rewardResult.rewards,
    error: rewardResult.ok ? undefined : rewardResult.error,
  };
}

// ── Reading a recorded track ───────────────────────────────────────────────

export interface ActivityTrack {
  activityId: string;
  activityType: string;
  polyline: string | null;
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
  pointCount: number;
  points: TrackPoint[];
}

export function normalizeActivityTrack(raw: unknown): ActivityTrack | null {
  if (!isRecord(raw)) return null;
  const activityId = str(raw.activityId);
  if (!activityId) return null;
  const points: TrackPoint[] = [];
  if (Array.isArray(raw.points)) {
    for (const entry of raw.points) {
      if (!isRecord(entry)) continue;
      const lat = num(entry.lat);
      const lng = num(entry.lng);
      const t = num(entry.t);
      if (lat == null || lng == null || t == null) continue;
      points.push({
        lat,
        lng,
        t,
        ele: num(entry.ele),
        hr: num(entry.hr),
        moving: entry.moving !== false,
      });
    }
  }
  const boundsRaw = raw.bounds;
  const bounds =
    isRecord(boundsRaw) &&
    num(boundsRaw.minLat) != null &&
    num(boundsRaw.minLng) != null &&
    num(boundsRaw.maxLat) != null &&
    num(boundsRaw.maxLng) != null
      ? {
          minLat: num(boundsRaw.minLat)!,
          minLng: num(boundsRaw.minLng)!,
          maxLat: num(boundsRaw.maxLat)!,
          maxLng: num(boundsRaw.maxLng)!,
        }
      : null;
  return {
    activityId,
    activityType: str(raw.activityType) ?? "other",
    polyline: str(raw.polyline),
    bounds,
    pointCount: num(raw.pointCount) ?? points.length,
    points,
  };
}

export async function fetchActivityTrack(
  client: RpcClient,
  activityId: string,
  maxPoints = 600,
): Promise<{ ok: boolean; track?: ActivityTrack; error?: string }> {
  const result = await call(client, "svj_get_activity_track", {
    p_activity_id: activityId,
    p_max_points: maxPoints,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const track = normalizeActivityTrack(result.data);
  if (!track) return { ok: false, error: "No recorded route for this activity." };
  return { ok: true, track };
}

// ── Personal bests (GPS-aware, additive to the existing records engine) ────

export type GpsRecordType =
  | "fastest_1km"
  | "fastest_5km"
  | "fastest_5km_cycle"
  | "longest_run"
  | "longest_walk"
  | "longest_ride"
  | "best_avg_pace"
  | "best_avg_speed"
  | "longest_duration";

export const GPS_RECORD_LABELS: Record<GpsRecordType, string> = {
  fastest_1km: "Fastest 1 km",
  fastest_5km: "Fastest 5 km",
  fastest_5km_cycle: "Fastest 5 km ride",
  longest_run: "Longest run",
  longest_walk: "Longest walk",
  longest_ride: "Longest ride",
  best_avg_pace: "Best average pace",
  best_avg_speed: "Best average speed",
  longest_duration: "Longest moving time",
};

/** How a record value must be rendered (time vs distance vs speed). */
export function gpsRecordFormat(type: string): "duration" | "distance" | "pace" | "speed" {
  if (type === "fastest_1km" || type === "fastest_5km" || type === "fastest_5km_cycle")
    return "duration";
  if (type === "best_avg_pace") return "pace";
  if (type === "best_avg_speed") return "speed";
  if (type === "longest_duration") return "duration";
  return "distance";
}

export interface GpsRecord {
  recordType: string;
  activityType: string;
  value: number;
  activityId: string;
  achievedAt: string;
}

export function normalizeGpsRecords(raw: unknown): GpsRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: GpsRecord[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const recordType = str(entry.recordType);
    const activityId = str(entry.activityId);
    const value = num(entry.value);
    if (!recordType || !activityId || value == null || value <= 0) continue;
    records.push({
      recordType,
      activityType: str(entry.activityType) ?? "other",
      value,
      activityId,
      achievedAt: str(entry.achievedAt) ?? "",
    });
  }
  return records;
}

export async function fetchGpsRecords(
  client: RpcClient,
): Promise<{ ok: boolean; records: GpsRecord[]; error?: string }> {
  const result = await call(client, "svj_list_gps_records");
  if (!result.ok) return { ok: false, records: [], error: result.error };
  return { ok: true, records: normalizeGpsRecords(result.data) };
}

// ── Personal heatmap ───────────────────────────────────────────────────────

export const HEATMAP_RANGES = ["all", "year", "90d"] as const;
export type HeatmapRange = (typeof HEATMAP_RANGES)[number];

export const HEATMAP_RANGE_LABELS: Record<HeatmapRange, string> = {
  all: "All time",
  year: "This year",
  "90d": "Last 90 days",
};

/** Pure so the filter is testable without a clock or a database. */
export function heatmapSinceMs(range: HeatmapRange, nowMs = Date.now()): number | null {
  if (range === "all") return null;
  if (range === "90d") return nowMs - 90 * 24 * 60 * 60 * 1000;
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), 0, 1);
}

export interface HeatmapCell {
  lat: number;
  lng: number;
  weight: number;
}

export function normalizeHeatmap(raw: unknown): HeatmapCell[] {
  if (!Array.isArray(raw)) return [];
  const cells: HeatmapCell[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const lat = num(entry.lat);
    const lng = num(entry.lng);
    const weight = num(entry.weight);
    if (lat == null || lng == null || weight == null || weight <= 0) continue;
    cells.push({ lat, lng, weight });
  }
  return cells;
}

export async function fetchActivityHeatmap(
  client: RpcClient,
  options: { range?: HeatmapRange; activityType?: GpsActivityType | null; nowMs?: number } = {},
): Promise<{ ok: boolean; cells: HeatmapCell[]; error?: string }> {
  const since = heatmapSinceMs(options.range ?? "all", options.nowMs);
  const result = await call(client, "svj_get_activity_heatmap", {
    p_since: since == null ? null : new Date(since).toISOString(),
    p_activity_type: options.activityType ?? null,
    p_max_cells: 4000,
  });
  if (!result.ok) return { ok: false, cells: [], error: result.error };
  return { ok: true, cells: normalizeHeatmap(result.data) };
}

// ── Route library ──────────────────────────────────────────────────────────

export interface SavedRoute {
  id: string;
  name: string;
  activityType: string;
  polyline: string;
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
  sourceActivityId: string | null;
  favorite: boolean;
  updatedAt: string;
}

export function normalizeRoute(raw: unknown): SavedRoute | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const polyline = str(raw.polyline);
  if (!id || !name || !polyline) return null;
  const boundsRaw = raw.bounds;
  return {
    id,
    name,
    activityType: str(raw.activity_type) ?? str(raw.activityType) ?? "other",
    polyline,
    bounds: isRecord(boundsRaw)
      ? {
          minLat: num(boundsRaw.minLat) ?? 0,
          minLng: num(boundsRaw.minLng) ?? 0,
          maxLat: num(boundsRaw.maxLat) ?? 0,
          maxLng: num(boundsRaw.maxLng) ?? 0,
        }
      : null,
    distanceMeters: num(raw.distance_meters),
    elevationGainMeters: num(raw.elevation_gain_meters),
    sourceActivityId: str(raw.source_activity_id),
    favorite: raw.favorite === true,
    updatedAt: str(raw.updated_at) ?? str(raw.created_at) ?? "",
  };
}

/**
 * Decode a stored route polyline back into drawable points. Routes persist the
 * encoded polyline rather than a point table, so this is the one place the
 * geometry is turned back into coordinates for the map renderer.
 */
export function routeToPoints(polyline: string): TrackPoint[] {
  if (!polyline) return [];
  return decodePolyline(polyline).map((point, index) => ({
    lat: point.lat,
    lng: point.lng,
    t: index,
  }));
}

/** Compact "2.50 km · +120 m" summary used on route cards and the recorder. */
export function plannedRouteSummary(
  route: Pick<SavedRoute, "distanceMeters" | "elevationGainMeters">,
): string {
  const distance = formatDistance(route.distanceMeters);
  return route.elevationGainMeters != null
    ? `${distance} · +${Math.round(route.elevationGainMeters)} m`
    : distance;
}

/** Distance/elevation readouts that must degrade to "—" rather than to 0. */
export function formatRouteElevation(meters: number | null | undefined): string {
  return meters == null || !Number.isFinite(meters) ? "—" : `${Math.round(meters)} m`;
}

/** Previous-attempt duration on a saved route. */
export function formatRouteTime(seconds: number | null | undefined): string {
  return seconds == null || !Number.isFinite(seconds) ? "—" : formatClock(seconds);
}

export async function saveRouteFromActivity(
  client: RpcClient,
  activityId: string,
  name: string,
  favorite = false,
): Promise<{ ok: boolean; route?: SavedRoute; error?: string }> {
  const result = await call(client, "svj_save_route_from_activity", {
    p_activity_id: activityId,
    p_name: name,
    p_favorite: favorite,
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (!isRecord(result.data) || result.data.ok !== true) {
    return { ok: false, error: "The server rejected this route." };
  }
  const route = normalizeRoute(result.data.route);
  if (!route) return { ok: false, error: "Unreadable route response." };
  return { ok: true, route };
}

export async function fetchRoutes(
  client: RpcClient,
): Promise<{ ok: boolean; routes: SavedRoute[]; error?: string }> {
  // Reads through the owner-scoped RPC (RLS-independent), never a raw table
  // query, so no client-supplied user id can ever widen the result set.
  const result = await call(client, "svj_list_routes");
  if (!result.ok) return { ok: false, routes: [], error: result.error };
  if (!Array.isArray(result.data)) return { ok: true, routes: [] };
  const routes = result.data
    .map((row) => normalizeRoute(row))
    .filter((r): r is SavedRoute => r != null)
    .sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt),
    );
  return { ok: true, routes };
}

export async function updateRoute(
  client: RpcClient,
  routeId: string,
  patch: { name?: string; favorite?: boolean },
): Promise<{ ok: boolean; route?: SavedRoute; error?: string }> {
  const result = await call(client, "svj_update_route", {
    p_route_id: routeId,
    p_name: patch.name ?? null,
    p_favorite: patch.favorite ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const route = isRecord(result.data) ? normalizeRoute(result.data.route) : null;
  if (!route) return { ok: false, error: "Unreadable route response." };
  return { ok: true, route };
}

export async function deleteRoute(
  client: RpcClient,
  routeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await call(client, "svj_delete_route", { p_route_id: routeId });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

// ── Personal segments ──────────────────────────────────────────────────────

export interface SegmentAttempt {
  activityId: string;
  durationSeconds: number;
  startedAt: string;
}

export interface PersonalSegment {
  id: string;
  name: string;
  activityType: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  toleranceMeters: number;
  attemptCount: number;
  bestDurationSeconds: number | null;
  lastDurationSeconds: number | null;
  improvementSeconds: number | null;
  recentAttempts: SegmentAttempt[];
}

export function normalizeSegment(raw: unknown): PersonalSegment | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  const attempts: SegmentAttempt[] = [];
  if (Array.isArray(raw.recentAttempts)) {
    for (const entry of raw.recentAttempts) {
      if (!isRecord(entry)) continue;
      const activityId = str(entry.activityId);
      const duration = num(entry.durationSeconds);
      if (!activityId || duration == null || duration <= 0) continue;
      attempts.push({
        activityId,
        durationSeconds: duration,
        startedAt: str(entry.startedAt) ?? "",
      });
    }
  }
  return {
    id,
    name,
    activityType: str(raw.activityType) ?? "other",
    startLat: num(raw.startLat) ?? 0,
    startLng: num(raw.startLng) ?? 0,
    endLat: num(raw.endLat) ?? 0,
    endLng: num(raw.endLng) ?? 0,
    toleranceMeters: num(raw.toleranceMeters) ?? 30,
    attemptCount: num(raw.attemptCount) ?? attempts.length,
    bestDurationSeconds: num(raw.bestDurationSeconds),
    lastDurationSeconds: num(raw.lastDurationSeconds),
    improvementSeconds: num(raw.improvementSeconds),
    recentAttempts: attempts,
  };
}

export async function createSegment(
  client: RpcClient,
  input: {
    name: string;
    activityId: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    activityType?: string;
    toleranceMeters?: number;
  },
): Promise<{ ok: boolean; segment?: PersonalSegment; error?: string }> {
  const result = await call(client, "svj_create_segment", {
    p_name: input.name,
    p_activity_id: input.activityId,
    p_start_lat: input.startLat,
    p_start_lng: input.startLng,
    p_end_lat: input.endLat,
    p_end_lng: input.endLng,
    p_activity_type: input.activityType ?? null,
    p_tolerance_meters: input.toleranceMeters ?? 30,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const segment = isRecord(result.data) ? normalizeSegment(result.data.segment) : null;
  if (!segment) return { ok: false, error: "The server rejected this segment." };
  return { ok: true, segment };
}

export async function fetchSegments(
  client: RpcClient,
): Promise<{ ok: boolean; segments: PersonalSegment[]; error?: string }> {
  const result = await call(client, "svj_list_segments");
  if (!result.ok) return { ok: false, segments: [], error: result.error };
  if (!Array.isArray(result.data)) return { ok: true, segments: [] };
  const segments = result.data
    .map((row) => normalizeSegment(row))
    .filter((s): s is PersonalSegment => s != null);
  return { ok: true, segments };
}

export async function deleteSegment(
  client: RpcClient,
  segmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await call(client, "svj_delete_segment", { p_segment_id: segmentId });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// ── SVJ Live Share ─────────────────────────────────────────────────────────

export interface LiveShare {
  active: boolean;
  token?: string;
  activityId?: string;
  activityType?: string | null;
  displayName?: string | null;
  startedAt?: string;
  expiresAt?: string;
  lastLat?: number | null;
  lastLng?: number | null;
  lastUpdateAt?: string | null;
  lastElapsedSeconds?: number | null;
  lastDistanceMeters?: number | null;
  batteryPercent?: number | null;
}

export function normalizeLiveShare(raw: unknown): LiveShare {
  if (!isRecord(raw)) return { active: false };
  if (raw.active !== true) return { active: false };
  return {
    active: true,
    token: str(raw.token) ?? undefined,
    activityId: str(raw.activityId) ?? undefined,
    activityType: str(raw.activityType),
    displayName: str(raw.displayName),
    startedAt: str(raw.startedAt) ?? undefined,
    expiresAt: str(raw.expiresAt) ?? undefined,
    lastLat: num(raw.lastLat),
    lastLng: num(raw.lastLng),
    lastUpdateAt: str(raw.lastUpdateAt),
    lastElapsedSeconds: num(raw.lastElapsedSeconds ?? raw.elapsedSeconds),
    lastDistanceMeters: num(raw.lastDistanceMeters ?? raw.distanceMeters),
    batteryPercent: num(raw.batteryPercent),
  };
}

export async function startLiveShare(
  client: RpcClient,
  activityId: string,
  options: { ttlMinutes?: number; displayName?: string } = {},
): Promise<{ ok: boolean; share?: LiveShare; error?: string }> {
  const result = await call(client, "svj_start_live_share", {
    p_activity_id: activityId,
    p_ttl_minutes: options.ttlMinutes ?? 180,
    p_display_name: options.displayName ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const share = normalizeLiveShare(result.data);
  if (!share.active) return { ok: false, error: "Couldn't start live sharing." };
  return { ok: true, share };
}

export async function updateLiveShare(
  client: RpcClient,
  token: string,
  position: {
    lat: number;
    lng: number;
    elapsedSeconds?: number;
    distanceMeters?: number;
    accuracyMeters?: number;
    batteryPercent?: number;
  },
): Promise<{ ok: boolean; error?: string }> {
  const result = await call(client, "svj_update_live_share", {
    p_token: token,
    p_lat: position.lat,
    p_lng: position.lng,
    p_elapsed_seconds: position.elapsedSeconds ?? null,
    p_distance_meters: position.distanceMeters ?? null,
    p_accuracy_m: position.accuracyMeters ?? null,
    p_battery_percent: position.batteryPercent ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (isRecord(result.data) && result.data.ok === false) {
    return { ok: false, error: "Live sharing has ended." };
  }
  return { ok: true };
}

export async function stopLiveShare(
  client: RpcClient,
  token?: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await call(client, "svj_stop_live_share", { p_token: token ?? null });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function fetchMyLiveShare(
  client: RpcClient,
): Promise<{ ok: boolean; share: LiveShare; error?: string }> {
  const result = await call(client, "svj_get_my_live_share");
  if (!result.ok) return { ok: false, share: { active: false }, error: result.error };
  return { ok: true, share: normalizeLiveShare(result.data) };
}

/**
 * Public reader for a share link. No account is involved and no identity is
 * returned: an expired, revoked or malformed token reads as inactive.
 */
export async function fetchPublicLiveShare(client: RpcClient, token: string): Promise<LiveShare> {
  const result = await call(client, "svj_get_public_live_share", { p_token: token });
  if (!result.ok) return { active: false };
  return normalizeLiveShare(result.data);
}

export function liveShareUrl(token: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://savaje-com.lovable.app");
  return `${base}/live/${token}`;
}

/** True once the share's own window has closed. */
export function isLiveShareExpired(share: LiveShare, nowMs = Date.now()): boolean {
  if (!share.active || !share.expiresAt) return false;
  const expiry = Date.parse(share.expiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry <= nowMs;
}

// ── Platform (Health Connect) import ───────────────────────────────────────

export interface PlatformActivityInput {
  clientSessionId: string;
  externalId: string;
  activityType: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  stepCount?: number;
  distanceMeters?: number | null;
  caloriesEstimate?: number | null;
  avgHeartRate?: number | null;
  /**
   * Where the workout came from. The server derives the stored activity
   * `source` from this value ('health_connect' or 'wear_os') instead of
   * trusting client text, so provenance can never be misreported.
   */
  devicePlatform?: "health_connect" | "wear_os";
}

/**
 * Import one device-platform workout. The SERVER decides whether it is new:
 * a repeated external id, a repeated session id, or an existing SVJ workout
 * that overlaps in type/time/duration is returned as a duplicate and never
 * becomes a second activity or a second XP grant.
 */
export async function importPlatformActivity(
  client: RpcClient,
  input: PlatformActivityInput,
): Promise<{ ok: boolean; duplicate?: boolean; activityId?: string; error?: string }> {
  const result = await call(client, "svj_import_platform_activity", {
    p_client_session_id: input.clientSessionId,
    p_external_id: input.externalId,
    p_activity_type: input.activityType,
    p_started_at: new Date(input.startedAtMs).toISOString(),
    p_ended_at: new Date(input.endedAtMs).toISOString(),
    p_duration_seconds: Math.round(input.durationSeconds),
    p_step_count: Math.max(0, Math.round(input.stepCount ?? 0)),
    p_distance_meters: input.distanceMeters ?? null,
    p_calories_estimate: input.caloriesEstimate ?? null,
    p_avg_heart_rate: input.avgHeartRate ?? null,
    p_device_platform: input.devicePlatform ?? "health_connect",
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (!isRecord(result.data) || result.data.ok !== true) {
    return { ok: false, error: "The server rejected this import." };
  }
  const activityId = isRecord(result.data.activity) ? str(result.data.activity.id) : null;
  if (!activityId) return { ok: false, error: "Unreadable import response." };
  const duplicate = result.data.duplicate === true;
  if (!duplicate) await processActivityRewards(client, activityId);
  return { ok: true, duplicate, activityId };
}
