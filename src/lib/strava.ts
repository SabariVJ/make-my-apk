// ============================================================================
// SVJ × STRAVA — pure helpers.
//
// This module is network-free and side-effect-free so it can be unit tested
// and imported from both browser and server code. It contains:
//   • the Strava OAuth authorize-URL builder
//   • a conservative Strava sport_type → SVJ activity_type mapping
//   • strict normalization of untrusted Strava API payloads into the shape the
//     existing activity import RPC accepts
//
// It NEVER computes XP, stat gains, qualifying days or membership. Reward
// values are derived server-side by the existing activity reward policy.
//
// Privacy: no token, secret or athlete-identifying value is ever logged here.
// ============================================================================

import { ACTIVITY_TYPES, type ActivityType } from "@/app/lib/serverActivities";

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";

/** Read-only access to the athlete's activities is the narrowest useful scope. */
export const STRAVA_SCOPE = "read,activity:read_all";

export const STRAVA_ERRORS: Record<string, string> = {
  SVJ_STRAVA_USER_REQUIRED: "Sign in again to connect Strava.",
  SVJ_STRAVA_STATE_INVALID: "That Strava link has expired. Start the connection again.",
  SVJ_STRAVA_PAYLOAD_INVALID: "Strava returned an unreadable response. Try again.",
  SVJ_STRAVA_CONNECTION_INVALID: "Strava did not return a usable authorization. Try again.",
  SVJ_STRAVA_ALREADY_LINKED:
    "This Strava account is already connected to a different SVJ account.",
  SVJ_STRAVA_NOT_CONNECTED: "Connect Strava before syncing activities.",
  STRAVA_EXCHANGE_FAILED: "Strava refused the connection. Please try again.",
  STRAVA_SYNC_FAILED: "Could not reach Strava. Your saved activities are unaffected.",
  STRAVA_NOT_CONFIGURED:
    "Strava is not configured on this deployment yet. Add the Strava client keys.",
};

/** Sanitized, user-safe message for a Strava failure. Never leaks details. */
export function stravaErrorMessage(code: string | undefined | null): string {
  if (!code) return STRAVA_ERRORS.STRAVA_SYNC_FAILED;
  return STRAVA_ERRORS[code] ?? STRAVA_ERRORS.STRAVA_SYNC_FAILED;
}

/**
 * Build the Strava authorize URL. `state` must be a server-generated,
 * single-use, high-entropy value bound to the signed-in user — it is what
 * prevents an attacker from attaching their own Strava account to a victim.
 */
export function buildStravaAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state: input.state,
  });
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Conservative sport_type mapping. Anything that is not a clear equivalent
 * becomes 'other' rather than being optimistically credited: the reward policy
 * for 'other' grants no XP, so an ambiguous import can never inflate a score.
 * Strava's own `type` field is only consulted when `sport_type` is absent.
 */
const STRAVA_SPORT_MAP: Record<string, ActivityType> = {
  run: "running",
  trailrun: "running",
  virtualrun: "running",
  walk: "walking",
  hike: "walking",
  ride: "cycling",
  virtualride: "cycling",
  ebikeride: "cycling",
  gravelride: "cycling",
  mountainbikeride: "cycling",
  soccer: "football",
  yoga: "yoga",
  weighttraining: "strength",
  highintensityintervaltraining: "hiit",
  swim: "other",
};

export function mapStravaSportType(sportType: unknown, fallbackType?: unknown): ActivityType {
  const key = (value: unknown): string =>
    typeof value === "string" ? value.trim().toLowerCase() : "";
  const mapped = STRAVA_SPORT_MAP[key(sportType)];
  if (mapped) return mapped;
  const fallback = STRAVA_SPORT_MAP[key(fallbackType)];
  return fallback ?? "other";
}

/** One normalized activity ready for the server-side import RPC. */
export interface StravaActivityImport {
  stravaId: string;
  activityType: ActivityType;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  stepCount: number;
  distanceMeters: number | null;
  caloriesEstimate: number | null;
  name: string | null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Normalize ONE Strava summary activity.
 *
 * Everything is re-derived and re-validated here so a provider payload is
 * treated as untrusted input. Missing measurements stay null — SVJ never
 * fabricates distance, calories or steps for an imported activity.
 */
export function normalizeStravaActivity(raw: unknown): StravaActivityImport | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const id = row.id;
  const stravaId =
    typeof id === "number" && Number.isFinite(id) && id > 0
      ? String(Math.trunc(id))
      : typeof id === "string" && /^[0-9]{1,32}$/.test(id)
        ? id
        : null;
  if (!stravaId) return null;

  // Strava reports start_date as a UTC ISO timestamp. Anything unparseable is
  // dropped rather than guessed.
  const startRaw = typeof row.start_date === "string" ? row.start_date : null;
  if (!startRaw) return null;
  const started = new Date(startRaw.includes("Z") || startRaw.includes("+") ? startRaw : `${startRaw}Z`);
  if (Number.isNaN(started.getTime())) return null;

  // moving_time is the honest "time actually moving" figure; elapsed_time is
  // the fallback when it is absent.
  const moving = positiveNumber(row.moving_time);
  const elapsed = positiveNumber(row.elapsed_time);
  const durationSeconds = Math.round(moving ?? elapsed ?? 0);
  if (durationSeconds < 1 || durationSeconds > 86_400) return null;

  const ended = new Date(started.getTime() + durationSeconds * 1000);
  const distance = positiveNumber(row.distance);

  return {
    stravaId,
    activityType: mapStravaSportType(row.sport_type, row.type),
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    durationSeconds,
    // Strava exposes no step count: recorded as 0, never estimated.
    stepCount: 0,
    distanceMeters: distance === null ? null : Math.round(distance * 100) / 100,
    // The summary endpoint does not return calories; leave it absent.
    caloriesEstimate: null,
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 500) : null,
  };
}

/**
 * Normalize a page of activities. Rows that end in the future (clock skew or a
 * malformed record) are dropped, as are unparseable rows. Deterministic order
 * is preserved so syncs are reproducible.
 */
export function normalizeStravaActivities(
  raw: unknown,
  nowMs = Date.now(),
  limit = 100,
): StravaActivityImport[] {
  if (!Array.isArray(raw)) return [];
  const out: StravaActivityImport[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= limit) break;
    const activity = normalizeStravaActivity(item);
    if (!activity) continue;
    if (new Date(activity.endedAt).getTime() > nowMs + 5 * 60_000) continue;
    if (seen.has(activity.stravaId)) continue;
    seen.add(activity.stravaId);
    out.push(activity);
  }
  return out;
}

/** Server-confirmed Strava connection state (tokens are never included). */
export interface StravaStatus {
  connected: boolean;
  athleteName: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  importedActivities: number;
}

export const DISCONNECTED_STRAVA_STATUS: StravaStatus = {
  connected: false,
  athleteName: null,
  connectedAt: null,
  lastSyncedAt: null,
  lastSyncError: null,
  importedActivities: 0,
};

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
}

/** Parse svj_get_my_strava_status() output. Unknown shapes read as disconnected. */
export function normalizeStravaStatus(raw: unknown): StravaStatus {
  if (!raw || typeof raw !== "object") return DISCONNECTED_STRAVA_STATUS;
  const row = raw as Record<string, unknown>;
  const connected = row.connected === true;
  const imported =
    typeof row.importedActivities === "number" && Number.isFinite(row.importedActivities)
      ? Math.max(0, Math.trunc(row.importedActivities))
      : 0;
  if (!connected) return { ...DISCONNECTED_STRAVA_STATUS, importedActivities: imported };
  return {
    connected: true,
    athleteName:
      typeof row.athleteName === "string" && row.athleteName.trim()
        ? row.athleteName.trim().slice(0, 120)
        : null,
    connectedAt: isoOrNull(row.connectedAt),
    lastSyncedAt: isoOrNull(row.lastSyncedAt),
    lastSyncError:
      typeof row.lastSyncError === "string" && row.lastSyncError.trim()
        ? row.lastSyncError.trim().slice(0, 200)
        : null,
    importedActivities: imported,
  };
}

/** Result summary of one import run. XP is server-reported, never computed here. */
export interface StravaSyncSummary {
  ok: boolean;
  imported: number;
  duplicate: number;
  skipped: number;
  xpAwarded: number;
}

export function normalizeStravaSync(raw: unknown): StravaSyncSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.ok !== true) return null;
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  return {
    ok: true,
    imported: num(row.imported),
    duplicate: num(row.duplicate),
    skipped: num(row.skipped),
    xpAwarded: num(row.xpAwarded),
  };
}

/** Every mapped activity type must exist in the canonical SVJ type list. */
export function isKnownActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}
