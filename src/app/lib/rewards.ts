// Shared Supabase RPC client for the Update 04 reward engine.
//
// Kept out of the pure lib modules (which stay network-free and unit-testable)
// and out of the component files (so they only export components).
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

export type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => {
        gte: (
          col: string,
          val: unknown,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
};

/** Null when the app has no backend configured (signed-out / web preview). */
export function rewardsRpcClient(): RpcClient | null {
  try {
    if (!hasSupabaseConfig()) return null;
    // The Update 04 RPC is not yet in the generated Database types.
    return supabase as unknown as RpcClient;
  } catch {
    // Config resolution itself failed (e.g. no env at all) — treat as offline.
    return null;
  }
}

/** Server-confirmed reward summary from svj_process_activity_rewards. */
export interface ActivityRewards {
  eligible: boolean;
  reason?: string;
  xpAwarded: number;
  prBonusAwarded: number;
  /** Server stat names mapped for display: fitness→Physical, focus→Mental. */
  statChanges: Record<string, number>;
  dailyActivityXpRemaining?: number;
}

export function normalizeRewards(raw: unknown): ActivityRewards | null {
  if (!raw || typeof raw !== "object") return null;
  const env = raw as Record<string, unknown>;
  if (env.ok !== true) return null;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const statChanges: Record<string, number> = {};
  if (env.statChanges && typeof env.statChanges === "object") {
    for (const [k, v] of Object.entries(env.statChanges as Record<string, unknown>)) {
      const n = num(v);
      if (n > 0) statChanges[k] = n;
    }
  }
  return {
    eligible: env.eligible === true,
    reason: typeof env.reason === "string" ? env.reason : undefined,
    xpAwarded: num(env.xpAwarded),
    prBonusAwarded: num(env.prBonusAwarded),
    statChanges,
    dailyActivityXpRemaining: num(env.dailyActivityXpRemaining),
  };
}

/**
 * Ask the server to process rewards for a canonical activity. Amounts are
 * NEVER sent by the client — only the activity id. Safe to call repeatedly:
 * the ledger's unique event keys make reprocessing a zero-duplicate no-op.
 */
export async function processActivityRewards(
  client: RpcClient,
  activityId: string,
): Promise<{ ok: boolean; rewards?: ActivityRewards; error?: string }> {
  if (!activityId) return { ok: false, error: "Missing activity." };
  try {
    const { data, error } = await client.rpc("svj_process_activity_rewards", {
      p_activity_id: activityId,
    });
    if (error) return { ok: false, error: error.message || "Rewards failed." };
    const rewards = normalizeRewards(data);
    if (!rewards) return { ok: false, error: "Unreadable reward response." };
    return { ok: true, rewards };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

/**
 * Read today's server-confirmed personalized-task XP from the immutable
 * ledger (source_class 'svj_personalized'). Ledger-backed so XP Today never
 * double-counts local task math and survives refresh/devices.
 */
export async function fetchPersonalizedXpToday(client: RpcClient): Promise<number> {
  try {
    const { data, error } = await client
      .from("activity_events")
      .select("lifetime_xp_delta")
      .eq("source_class", "svj_personalized")
      .gte("created_at", new Date().toISOString().slice(0, 10));
    if (error || !Array.isArray(data)) return 0;
    return data.reduce(
      (acc, row) =>
        acc +
        (typeof row.lifetime_xp_delta === "number" &&
        Number.isFinite(row.lifetime_xp_delta) &&
        row.lifetime_xp_delta > 0
          ? row.lifetime_xp_delta
          : 0),
      0,
    );
  } catch {
    return 0;
  }
}
