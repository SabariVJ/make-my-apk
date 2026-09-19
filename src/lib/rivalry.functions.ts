import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface RivalryData {
  id: string;
  challengerId: string;
  opponentId: string;
  status: "pending" | "accepted" | "active" | "completed" | "declined" | "cancelled" | "expired";
  challengerBaselineXp: number;
  opponentBaselineXp: number;
  winnerId?: string;
  startedAt?: string;
  endedAt?: string;
  expiresAt?: string;
  createdAt: string;
  opponentUsername?: string;
  opponentDisplayName?: string;
  opponentAvatarUrl?: string;
  myScore?: number;
  opponentScore?: number;
  myEvents?: number;
  opponentEvents?: number;
}

export interface NotificationData {
  id: string;
  type: string;
  fromUserId?: string;
  fromUserName?: string;
  referenceId?: string;
  title: string;
  body: string;
  read: boolean;
  handled: boolean;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRivalry(row: any): RivalryData {
  return {
    id: row.id,
    challengerId: row.challenger_id,
    opponentId: row.opponent_id,
    status: row.status,
    challengerBaselineXp: row.challenger_baseline_xp ?? 0,
    opponentBaselineXp: row.opponent_baseline_xp ?? 0,
    winnerId: row.winner_id ?? undefined,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    opponentUsername: row.opponent_username ?? undefined,
    opponentDisplayName: row.opponent_display_name ?? undefined,
    opponentAvatarUrl: row.opponent_avatar_url ?? undefined,
    myScore: row.my_score ?? 0,
    opponentScore: row.opponent_score ?? 0,
    myEvents: row.my_events ?? 0,
    opponentEvents: row.opponent_events ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcFailure(error: any) {
  return error?.message || "That rivalry action could not be completed. Please retry.";
}

/** Create a request through the database state machine. No client-owned XP,
 * status, baseline, recipient or notification fields are accepted. */
export const createRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { opponentId: string }) => input)
  .handler(
    async ({
      context,
      data,
    }): Promise<{ ok: boolean; rivalry?: RivalryData; existing?: boolean; error?: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = context.supabase as any;
      const { data: result, error } = await client.rpc("svj_create_rivalry", {
        p_opponent_id: data.opponentId,
      });
      if (error) return { ok: false, error: rpcFailure(error) };
      if (!result?.ok || !result.rivalry)
        return { ok: false, error: "The request could not be created." };
      return { ok: true, existing: result.existing === true, rivalry: mapRivalry(result.rivalry) };
    },
  );

export const acceptRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(
    async ({ context, data }): Promise<{ ok: boolean; rivalry?: RivalryData; error?: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = context.supabase as any;
      const { data: result, error } = await client.rpc("svj_respond_to_rivalry", {
        p_rivalry_id: data.rivalryId,
        p_action: "accept",
      });
      if (error) return { ok: false, error: rpcFailure(error) };
      return result?.ok
        ? { ok: true, rivalry: mapRivalry(result.rivalry) }
        : { ok: false, error: "The request is no longer pending." };
    },
  );

export const declineRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(
    async ({ context, data }): Promise<{ ok: boolean; rivalry?: RivalryData; error?: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = context.supabase as any;
      const { data: result, error } = await client.rpc("svj_respond_to_rivalry", {
        p_rivalry_id: data.rivalryId,
        p_action: "decline",
      });
      if (error) return { ok: false, error: rpcFailure(error) };
      return result?.ok
        ? { ok: true, rivalry: mapRivalry(result.rivalry) }
        : { ok: false, error: "The request is no longer pending." };
    },
  );

export const cancelRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(
    async ({ context, data }): Promise<{ ok: boolean; rivalry?: RivalryData; error?: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = context.supabase as any;
      const { data: result, error } = await client.rpc("svj_cancel_rivalry", {
        p_rivalry_id: data.rivalryId,
      });
      if (error) return { ok: false, error: rpcFailure(error) };
      return result?.ok
        ? { ok: true, rivalry: mapRivalry(result.rivalry) }
        : { ok: false, error: "The request is no longer pending." };
    },
  );

export const getRivalries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RivalryData[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data, error } = await client.rpc("svj_list_rivalries");
    if (error || !Array.isArray(data)) return [];
    return data.map(mapRivalry);
  });

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationData[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data, error } = await client
      .from("in_app_notifications")
      .select("id,type,from_user_id,reference_id,title,body,read,handled,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    // Names are not copied into relationship rows; friend/rival screens load
    // their canonical live profile through the rivalry/list RPC.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((row: any) => ({
      id: row.id,
      type: row.type,
      fromUserId: row.from_user_id ?? undefined,
      referenceId: row.reference_id ?? undefined,
      title: row.title,
      body: row.body,
      read: row.read,
      handled: row.handled,
      createdAt: row.created_at,
    }));
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { notificationId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { error } = await client
      .from("in_app_notifications")
      .update({ read: true })
      .eq("id", data.notificationId)
      .eq("user_id", context.userId);
    return error ? { ok: false, error: rpcFailure(error) } : { ok: true };
  });

/** Deliberately no client-callable XP delta endpoint. Trusted completion flows
 * insert rivalry events server-side after validating the underlying activity. */
export const recordRivalryEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { rivalryId: string; xpDelta: number; eventType: string; sourceId?: string }) => input,
  )
  .handler(async (): Promise<{ ok: boolean; error: string }> => ({
    ok: false,
    error: "Rivalry progress is recorded only from verified SVJ activity.",
  }));
