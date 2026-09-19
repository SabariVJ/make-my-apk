import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DISCONNECTED_STRAVA_STATUS,
  normalizeStravaStatus,
  type StravaStatus,
  type StravaSyncSummary,
} from "./strava";

// ─────────────────────────────────────────────────────────────────────────────
// SVJ × STRAVA server functions.
//
// Identity always comes from the verified session (requireSupabaseAuth), never
// from the browser: no server function below accepts a user id. Reads and
// disconnects run through the user's own authenticated session client, so the
// database derives auth.uid() itself. OAuth token exchange and activity import
// are service-role only and receive the SERVER-verified user id.
//
// Client keys (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET) exist only in the
// server environment; nothing secret is ever returned to the browser.
// ─────────────────────────────────────────────────────────────────────────────

/** Structural view of an authenticated session client's rpc(). */
interface SessionDb {
  rpc: <R = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: R; error: { code?: string; message?: string } | null }>;
}

const asSessionDb = (client: unknown): SessionDb => client as SessionDb;

export interface StravaSettingsReply {
  configured: boolean;
  status: StravaStatus;
  error?: string;
}

export interface StravaConnectReply {
  status?: StravaStatus;
  /** Server-reported import result. XP is never computed on the client. */
  summary?: StravaSyncSummary | null;
  error?: string;
}

/** Sync and connect-complete share the same reply shape. */
export type StravaSyncReply = StravaConnectReply;

/** Strava is an optional integration: an unconfigured deployment is not an error. */
export const getStravaSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StravaSettingsReply> => {
    const { readStravaStatusWith, stravaConfigured } = await import("./strava.server");
    try {
      const status = await readStravaStatusWith(asSessionDb(context.supabase));
      return { configured: stravaConfigured(), status };
    } catch {
      return { configured: stravaConfigured(), status: DISCONNECTED_STRAVA_STATUS };
    }
  });

/**
 * Complete the OAuth redirect. The completing session must be the same user
 * that started the connection (checked server-side before any token is
 * stored), so a stolen redirect cannot link someone else's Strava account.
 * An initial sync runs immediately so the user sees real data on return.
 */
export const finishStravaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        code: z.string().min(1).max(512),
        state: z.string().min(16).max(200),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<StravaConnectReply> => {
    const {
      completeStravaConnect,
      readStravaStatusWith,
      syncStravaActivities,
      resolveOriginFromRequest,
    } = await import("./strava.server");
    const { stravaErrorMessage } = await import("./strava");
    const origin = resolveOriginFromRequest();
    try {
      await completeStravaConnect(data.code, data.state, origin, context.userId);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : undefined;
      return { error: stravaErrorMessage(code) };
    }
    // The connection is stored; a failed first sync must not undo it.
    let summary: StravaSyncSummary | null;
    try {
      summary = await syncStravaActivities(context.userId, origin);
    } catch {
      summary = null;
    }
    const status = await readStravaStatusWith(asSessionDb(context.supabase));
    return { status, summary };
  });

/** Mint a single-use Strava authorize URL for the signed-in user. */
export const startStravaConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string } | { error: string }> => {
    const { beginStravaConnect, resolveOriginFromRequest } = await import("./strava.server");
    const { stravaErrorMessage } = await import("./strava");
    try {
      const { url } = await beginStravaConnect(context.userId, resolveOriginFromRequest());
      return { url };
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : undefined;
      return { error: stravaErrorMessage(code) };
    }
  });

/** Import recent Strava activities. Idempotent — a retry never double-credits. */
export const syncStrava = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StravaSyncReply> => {
    const { syncStravaActivities, readStravaStatusWith, resolveOriginFromRequest } = await import(
      "./strava.server"
    );
    const { stravaErrorMessage } = await import("./strava");
    try {
      const summary = await syncStravaActivities(context.userId, resolveOriginFromRequest());
      const status = await readStravaStatusWith(asSessionDb(context.supabase));
      return { status, summary };
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : undefined;
      const status = await readStravaStatusWith(asSessionDb(context.supabase));
      return { status, error: stravaErrorMessage(code) };
    }
  });

/** Disconnect: removes the stored tokens. Imported activities and XP stay. */
export const disconnectStrava = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: StravaStatus } | { error: string }> => {
    const { stravaErrorMessage } = await import("./strava");
    try {
      const { error } = await asSessionDb(context.supabase).rpc("svj_disconnect_my_strava");
      if (error) {
        console.error("[SVJ strava] Disconnect failed", { code: error.code ?? "unknown" });
        return { error: stravaErrorMessage("STRAVA_SYNC_FAILED") };
      }
      return { status: normalizeStravaStatus(null) };
    } catch {
      return { error: stravaErrorMessage("STRAVA_SYNC_FAILED") };
    }
  });
