// ============================================================================
// SVJ × STRAVA — server-only integration.
//
// Runs exclusively on the server. Strava client credentials, access tokens and
// refresh tokens never reach the browser: tokens are written to
// public.svj_strava_connections (RLS-forced, no client privileges) through
// service-role RPCs, and only non-secret connection status is returned to the
// client.
//
// All reward values are produced by the existing activity reward pipeline
// (svj_process_activity_rewards_impl). This module never computes XP, stats or
// qualifying days, and never accepts a user id from the browser.
//
// Required environment (set in the project's Keys/API keys tab):
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
// Optional:
//   STRAVA_REDIRECT_URI (defaults to <app origin>/strava/callback)
// ============================================================================

import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildStravaAuthorizeUrl,
  normalizeStravaActivities,
  normalizeStravaStatus,
  normalizeStravaSync,
  STRAVA_API_BASE,
  STRAVA_SCOPE,
  STRAVA_TOKEN_URL,
  type StravaStatus,
  type StravaSyncSummary,
} from "./strava";

/** Structural view of the service-role client's rpc(); the new Strava RPCs are
 *  not yet in the generated Database types. */
interface ServiceDb {
  rpc: <R = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: R; error: { code?: string; message?: string } | null }>;
}

const db = supabaseAdmin as unknown as ServiceDb;

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Trim and collapse whitespace-only env values to undefined. */
function env(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() || undefined;
}

export function stravaConfigured(): boolean {
  return Boolean(env("STRAVA_CLIENT_ID") && env("STRAVA_CLIENT_SECRET"));
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Resolve config for this request. Null when the deployment is unconfigured. */
export function readStravaConfig(origin: string | undefined): StravaConfig | null {
  const clientId = env("STRAVA_CLIENT_ID");
  const clientSecret = env("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    env("STRAVA_REDIRECT_URI") ??
    (origin ? `${withoutTrailingSlash(origin)}/strava/callback` : undefined);
  if (!redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Extract the public origin from a request URL. */
export function resolveOrigin(url: string | undefined, fallback?: string): string | undefined {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return fallback;
  }
}

/**
 * Public origin of the current request, preferring proxy headers when present.
 * Lives here (not in the server-function module) because it is the only
 * server-only dependency: the server-function module is also bundled for the
 * browser.`STRAVA_REDIRECT_URI` overrides it when the deployment needs an
 * externally registered callback URL.
 */
export function resolveOriginFromRequest(): string | undefined {
  try {
    const request = getRequest();
    if (!request) return undefined;
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedHost) {
      const proto = forwardedProto?.split(",")[0]?.trim() || "https";
      return `${proto}://${forwardedHost.split(",")[0]?.trim()}`;
    }
    return resolveOrigin(request.url);
  } catch {
    return undefined;
  }
}

/** Raise a sanitized SVJ_STRAVA_* code, never a raw database/provider error. */
export class StravaError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "StravaError";
  }
}

function fail(code: string): never {
  throw new StravaError(code);
}

function rpcErrorMessage(error: { code?: string; message?: string } | null): string | undefined {
  if (!error) return undefined;
  const message = error.message ?? "";
  // RPC bodies raise bare SVJ_STRAVA_* codes; anything else is a deployment or
  // transport problem and is reported as unconfigured/unavailable instead of
  // being echoed to the client.
  const known = message.match(/SVJ_STRAVA_[A-Z_]+/);
  return known ? known[0] : undefined;
}

// ── OAuth ───────────────────────────────────────────────────────────────────

/**
 * Begin a connection for the verified server-side user id. The state is
 * generated here, stored server-side, single-use and expires in ten minutes.
 */
export async function beginStravaConnect(
  userId: string,
  origin: string | undefined,
): Promise<{ url: string }> {
  const config = readStravaConfig(origin);
  if (!config) fail("STRAVA_NOT_CONFIGURED");

  const state = `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`.replace(/-/g, "");
  const { error } = await db.rpc("svj_strava_begin_connect", {
    p_user_id: userId,
    p_state: state,
    p_return_to: "/landing",
  });
  if (error) fail(rpcErrorMessage(error) ?? "STRAVA_SYNC_FAILED");

  return {
    url: buildStravaAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
    }),
  };
}

interface StravaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  athlete?: { id?: number; firstname?: string; lastname?: string; username?: string };
}

async function exchangeToken(
  config: StravaConfig,
  body: Record<string, string>,
): Promise<StravaTokenResponse> {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...body,
    }),
  });
  if (!response.ok) fail("STRAVA_EXCHANGE_FAILED");
  const payload = (await response.json()) as StravaTokenResponse;
  if (!payload?.access_token || !payload?.refresh_token) fail("STRAVA_EXCHANGE_FAILED");
  return payload;
}

function athleteName(athlete: StravaTokenResponse["athlete"]): string | null {
  if (!athlete) return null;
  const full = [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim();
  const name = full || athlete.username || "";
  return name ? name.slice(0, 120) : null;
}

/**
 * Complete the redirect: consume the single-use state, exchange the code and
 * persist the token set server-side. Returns the owning user id so the caller
 * can run an initial sync.
 */
export async function completeStravaConnect(
  code: string,
  state: string,
  origin: string | undefined,
  expectedUserId?: string,
): Promise<{ userId: string | null }> {
  const config = readStravaConfig(origin);
  if (!config) fail("STRAVA_NOT_CONFIGURED");
  if (!code || !state) fail("STRAVA_SYNC_FAILED");

  const consumed = await db.rpc<{ userId?: string }>("svj_strava_consume_state", {
    p_state: state,
  });
  if (consumed.error) fail(rpcErrorMessage(consumed.error) ?? "SVJ_STRAVA_STATE_INVALID");
  const userId = (consumed.data as { userId?: string } | null)?.userId ?? null;
  if (!userId) fail("SVJ_STRAVA_STATE_INVALID");
  // The state is bound to the initiating user; the completing session must be
  // that same user, so a stolen redirect can never link an attacker's Strava
  // account to somebody else's SVJ account. Checked BEFORE any token is stored.
  if (expectedUserId && expectedUserId !== userId) fail("SVJ_STRAVA_STATE_INVALID");

  const token = await exchangeToken(config, {
    code,
    grant_type: "authorization_code",
  });
  const athleteId = token.athlete?.id;
  if (typeof athleteId !== "number" || !Number.isFinite(athleteId)) fail("STRAVA_EXCHANGE_FAILED");

  const expiresAt = new Date(
    typeof token.expires_at === "number" ? token.expires_at * 1000 : Date.now() + 6 * 3600 * 1000,
  ).toISOString();

  const saved = await db.rpc("svj_strava_save_connection", {
    p_user_id: userId,
    p_athlete_id: Math.trunc(athleteId),
    p_athlete_name: athleteName(token.athlete),
    p_access_token: token.access_token,
    p_refresh_token: token.refresh_token,
    p_expires_at: expiresAt,
    p_scopes: token.scope ?? STRAVA_SCOPE,
  });
  if (saved.error) fail(rpcErrorMessage(saved.error) ?? "STRAVA_EXCHANGE_FAILED");
  return { userId };
}

// ── Sync ────────────────────────────────────────────────────────────────────

interface StravaConnection {
  athleteId: number;
  athleteName: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  lastSyncedAt: string | null;
}

async function readConnection(userId: string): Promise<StravaConnection | null> {
  const { data, error } = await db.rpc<StravaConnection | null>("svj_strava_read_connection", {
    p_user_id: userId,
  });
  if (error || !data) return null;
  if (!data.accessToken || !data.refreshToken) return null;
  return data;
}

/** Read connection status through a caller-supplied client (the user's own
 *  authenticated session client), so auth.uid() is derived by the database. */
export async function readStravaStatusWith(db: ServiceDb): Promise<StravaStatus> {
  const { data, error } = await db.rpc("svj_get_my_strava_status");
  if (error) {
    console.error("[SVJ strava] Status read failed", { code: error.code ?? "unknown" });
    return normalizeStravaStatus(null);
  }
  return normalizeStravaStatus(data);
}

/** Refresh an expired access token, persisting the rotated pair. */
async function ensureFreshToken(
  userId: string,
  config: StravaConfig,
  connection: StravaConnection,
): Promise<string> {
  const expiresAt = new Date(connection.expiresAt).getTime();
  // Refresh a minute early so an in-flight request never races the expiry.
  if (Number.isFinite(expiresAt) && expiresAt - 60_000 > Date.now()) {
    return connection.accessToken;
  }
  const refreshed = await exchangeToken(config, {
    grant_type: "refresh_token",
    refresh_token: connection.refreshToken,
  });
  // The athlete identity is already stored; it is passed back so the strict
  // upsert keeps the NOT NULL athlete id and the display name intact.
  const saved = await db.rpc("svj_strava_save_connection", {
    p_user_id: userId,
    p_athlete_id: connection.athleteId,
    p_athlete_name: connection.athleteName,
    p_access_token: refreshed.access_token,
    p_refresh_token: refreshed.refresh_token,
    p_expires_at: new Date(
      typeof refreshed.expires_at === "number"
        ? refreshed.expires_at * 1000
        : Date.now() + 6 * 3600 * 1000,
    ).toISOString(),
    p_scopes: refreshed.scope ?? STRAVA_SCOPE,
  });
  if (saved.error) fail("STRAVA_EXCHANGE_FAILED");
  return refreshed.access_token as string;
}

async function fetchActivities(accessToken: string, afterSeconds: number): Promise<unknown[]> {
  const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
  url.searchParams.set("after", String(Math.max(0, Math.floor(afterSeconds))));
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "50");
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  // 401/403 means the grant was revoked in Strava — surfaced as not connected
  // so the UI can prompt a reconnect instead of failing silently.
  if (response.status === 401 || response.status === 403) fail("SVJ_STRAVA_NOT_CONNECTED");
  if (!response.ok) fail("STRAVA_SYNC_FAILED");
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

/**
 * Import recent Strava activities for the verified server-side user id.
 * Idempotency lives in the database: (user_id, client_session_id) makes a
 * repeated sync a no-op, and the reward ledger keys make double-crediting
 * impossible. A first sync looks back 30 days; later syncs resume from the
 * last successful sync minus a small overlap.
 */
export async function syncStravaActivities(
  userId: string,
  origin: string | undefined,
  nowMs = Date.now(),
): Promise<StravaSyncSummary> {
  const config = readStravaConfig(origin);
  if (!config) fail("STRAVA_NOT_CONFIGURED");

  const connection = await readConnection(userId);
  if (!connection) fail("SVJ_STRAVA_NOT_CONNECTED");

  let imported: StravaSyncSummary = {
    ok: true,
    imported: 0,
    duplicate: 0,
    skipped: 0,
    xpAwarded: 0,
  };

  try {
    const accessToken = await ensureFreshToken(userId, config, connection);
    const lastSync = connection.lastSyncedAt ? new Date(connection.lastSyncedAt).getTime() : NaN;
    const after =
      Number.isFinite(lastSync) && lastSync > 0
        ? // One day of overlap absorbs activities uploaded late by another device.
          lastSync / 1000 - 86_400
        : nowMs / 1000 - 30 * 86_400;

    const raw = await fetchActivities(accessToken, after);
    const activities = normalizeStravaActivities(raw, nowMs);

    if (activities.length > 0) {
      const { data, error } = await db.rpc("svj_strava_import_activities", {
        p_user_id: userId,
        p_activities: activities.map((activity) => ({
          stravaId: activity.stravaId,
          activityType: activity.activityType,
          startedAt: activity.startedAt,
          endedAt: activity.endedAt,
          durationSeconds: activity.durationSeconds,
          stepCount: activity.stepCount,
          distanceMeters: activity.distanceMeters,
          caloriesEstimate: activity.caloriesEstimate,
          name: activity.name,
        })),
      });
      if (error) fail(rpcErrorMessage(error) ?? "STRAVA_SYNC_FAILED");
      const summary = normalizeStravaSync(data);
      if (!summary) fail("STRAVA_SYNC_FAILED");
      imported = summary;
    }

    await db.rpc("svj_strava_mark_synced", { p_user_id: userId, p_error: null });
    return imported;
  } catch (caught) {
    const code = caught instanceof StravaError ? caught.code : "STRAVA_SYNC_FAILED";
    // Record a sanitized reason so the UI can explain the last attempt.
    await db.rpc("svj_strava_mark_synced", { p_user_id: userId, p_error: code });
    throw caught instanceof StravaError ? caught : new StravaError("STRAVA_SYNC_FAILED");
  }
}

// Status and disconnect intentionally live in the server-function layer: they
// run through the caller's own authenticated session client so the database
// derives auth.uid() itself. Only token exchange and import need the service
// role, and both receive the SERVER-verified user id.
