// ============================================================================
// Rivalry — server-side functions.
//
// SECURITY MODEL
//   * User ID from verified session, never client-supplied.
//   * Baselines are captured at rivalry creation, not trusted from client.
//   * Only progress SINCE rivalry start counts.
//   * Duplicate active rivalries prevented by unique constraint.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminKey } from "@/integrations/supabase/client.server";

export interface RivalryData {
  id: string;
  challengerId: string;
  opponentId: string;
  status: string;
  challengerBaselineXp: number;
  opponentBaselineXp: number;
  winnerId?: string;
  startedAt?: string;
  endedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

async function getClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // New tables not yet in generated types — safe to cast for the migration period.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

/** Send a rivalry challenge request */
export const createRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { opponentId: string }) => input)
  .handler(
    async ({ context, data }): Promise<{ ok: boolean; rivalry?: RivalryData; error?: string }> => {
      requireAdminKey();
      const client = await getClient();
      const challengerId = context.userId;
      const opponentId = data.opponentId;

      if (challengerId === opponentId) {
        return { ok: false, error: "You cannot challenge yourself." };
      }

      // Check for existing active rivalry between these users
      const { data: existing } = await client
        .from("rivalries")
        .select("id, status")
        .or(
          `and(challenger_id.eq.${challengerId},opponent_id.eq.${opponentId}),and(challenger_id.eq.${opponentId},opponent_id.eq.${challengerId})`,
        )
        .in("status", ["pending", "accepted", "active"])
        .maybeSingle();

      if (existing) {
        return { ok: false, error: "An active rivalry already exists with this user." };
      }

      // Get challenger's current lifetime XP for baseline
      const { data: challengerProfile } = await client
        .from("profiles")
        .select("total_xp")
        .eq("id", challengerId)
        .maybeSingle();

      // Get opponent's current lifetime XP for baseline
      const { data: opponentProfile } = await client
        .from("profiles")
        .select("total_xp")
        .eq("id", opponentId)
        .maybeSingle();

      const challengerBaseline = challengerProfile?.total_xp ?? 0;
      const opponentBaseline = opponentProfile?.total_xp ?? 0;

      // Create rivalry
      const { data: rivalry, error } = await client
        .from("rivalries")
        .insert({
          challenger_id: challengerId,
          opponent_id: opponentId,
          status: "pending",
          challenger_baseline_xp: challengerBaseline,
          opponent_baseline_xp: opponentBaseline,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return { ok: false, error: "A rivalry request already exists." };
        }
        throw error;
      }

      return {
        ok: true,
        rivalry: {
          id: rivalry.id,
          challengerId: rivalry.challenger_id,
          opponentId: rivalry.opponent_id,
          status: rivalry.status,
          challengerBaselineXp: rivalry.challenger_baseline_xp,
          opponentBaselineXp: rivalry.opponent_baseline_xp,
          createdAt: rivalry.created_at,
        },
      };
    },
  );

/** Accept a rivalry challenge */
export const acceptRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    requireAdminKey();
    const client = await getClient();

    const { data: rivalry, error: fetchError } = await client
      .from("rivalries")
      .select("*")
      .eq("id", data.rivalryId)
      .eq("opponent_id", context.userId)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchError || !rivalry) {
      return { ok: false, error: "Rivalry request not found." };
    }

    // Get opponent's current XP for accurate baseline
    const { data: opponentProfile } = await client
      .from("profiles")
      .select("total_xp")
      .eq("id", context.userId)
      .maybeSingle();

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const { error } = await client
      .from("rivalries")
      .update({
        status: "active",
        started_at: now,
        expires_at: expiresAt,
        opponent_baseline_xp: opponentProfile?.total_xp ?? rivalry.opponent_baseline_xp,
      })
      .eq("id", data.rivalryId);

    if (error) throw error;
    return { ok: true };
  });

/** Decline a rivalry challenge */
export const declineRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    requireAdminKey();
    const client = await getClient();

    const { error } = await client
      .from("rivalries")
      .update({ status: "declined", ended_at: new Date().toISOString() })
      .eq("id", data.rivalryId)
      .eq("opponent_id", context.userId)
      .eq("status", "pending");

    if (error) return { ok: false, error: "Could not decline rivalry." };
    return { ok: true };
  });

/** Get user's rivalries */
export const getRivalries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RivalryData[]> => {
    requireAdminKey();
    const client = await getClient();
    const userId = context.userId;

    const { data, error } = await client
      .from("rivalries")
      .select("*")
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    return data.map((r: any) => ({
      id: r.id,
      challengerId: r.challenger_id,
      opponentId: r.opponent_id,
      status: r.status,
      challengerBaselineXp: r.challenger_baseline_xp,
      opponentBaselineXp: r.opponent_baseline_xp,
      winnerId: r.winner_id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  });

/** Record a rivalry event (progress since rivalry start) */
export const recordRivalryEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { rivalryId: string; xpDelta: number; eventType: string; sourceId?: string }) => input,
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    requireAdminKey();
    const client = await getClient();

    // Verify rivalry is active and user is participant
    const { data: rivalry } = await client
      .from("rivalries")
      .select("id, status")
      .eq("id", data.rivalryId)
      .eq("status", "active")
      .or(`challenger_id.eq.${context.userId},opponent_id.eq.${context.userId}`)
      .maybeSingle();

    if (!rivalry) {
      return { ok: false, error: "No active rivalry found." };
    }

    const { error } = await client.from("rivalry_events").insert({
      rivalry_id: data.rivalryId,
      user_id: context.userId,
      xp_delta: data.xpDelta,
      event_type: data.eventType,
      source_id: data.sourceId,
    });

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "This event was already recorded." };
      }
      throw error;
    }
    return { ok: true };
  });
