// ============================================================================
// Rivalry — server-side functions.
//
// SECURITY MODEL
//   * User ID from verified session (context.userId), never client-supplied.
//   * All rivalry CRUD uses the authenticated user's Supabase client (context.supabase).
//   * RLS policies enforce authorization: users can only see/modify rivalries they participate in.
//   * Notification creation uses a SECURITY DEFINER RPC that validates
//     the caller is a rivalry participant before inserting.
//   * No requireAdminKey() needed — operations run within RLS boundaries.
//   * Duplicate active rivalries prevented by partial unique index.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// ── Notification helper ─────────────────────────────────────────────────────
// Calls the SECURITY DEFINER RPC which validates the caller is a rivalry
// participant and resolves the recipient from the rivalry table.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type
type SupabaseClient = any;

async function createRivalryNotification(
  client: SupabaseClient,
  rivalryId: string,
  notificationType: "rivalry_request" | "rivalry_accepted" | "rivalry_declined",
  title: string,
  body: string,
): Promise<void> {
  const { error } = await client.rpc("create_rivalry_notification", {
    p_rivalry_id: rivalryId,
    p_notification_type: notificationType,
    p_title: title,
    p_body: body,
  });
  // Notification failure is non-fatal — the rivalry operation already succeeded.
  // The RPC may fail if the caller is not a participant (defence-in-depth).
  void error;
}

// ── Send a rivalry challenge request ────────────────────────────────────────

export const createRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { opponentId: string }) => input)
  .handler(
    async ({ context, data }): Promise<{ ok: boolean; rivalry?: RivalryData; error?: string }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
      const client = context.supabase as any;
      const challengerId = context.userId;
      const opponentId = data.opponentId;

      // Self-challenge prevention
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

      // Get challenger's profile for baseline and notification name
      const { data: challengerProfile } = await client
        .from("profiles")
        .select("total_xp, username, display_name")
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

      // Create rivalry — RLS WITH CHECK ensures auth.uid() = challenger_id
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

      // Create notification via SECURITY DEFINER RPC
      // The RPC validates caller is a rivalry participant and resolves recipient.
      const challengerName =
        challengerProfile?.username || challengerProfile?.display_name || "A member";
      await createRivalryNotification(
        client,
        rivalry.id,
        "rivalry_request",
        "Outperform Challenge",
        `${challengerName} challenged you to an Outperform competition!`,
      );

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

// ── Cancel a pending rivalry request (challenger only) ──────────────────────

export const cancelRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const client = context.supabase as any;

    // RLS SELECT ensures user can only see rivalries they participate in.
    // The explicit challenger_id filter ensures only the challenger can cancel.
    const { data: rivalry, error: fetchError } = await client
      .from("rivalries")
      .select("id, challenger_id, status")
      .eq("id", data.rivalryId)
      .eq("challenger_id", context.userId)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchError || !rivalry) {
      return { ok: false, error: "Rivalry request not found or already handled." };
    }

    const { error } = await client
      .from("rivalries")
      .update({ status: "cancelled", ended_at: new Date().toISOString() })
      .eq("id", data.rivalryId);

    if (error) return { ok: false, error: "Could not cancel rivalry." };
    return { ok: true };
  });

// ── Accept a rivalry challenge ──────────────────────────────────────────────

export const acceptRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const client = context.supabase as any;

    // RLS SELECT + explicit opponent_id filter ensures only the recipient can accept.
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

    // Create acceptance notification via SECURITY DEFINER RPC
    const { data: acceptorProfile } = await client
      .from("profiles")
      .select("username, display_name")
      .eq("id", context.userId)
      .maybeSingle();
    const acceptorName =
      acceptorProfile?.username || acceptorProfile?.display_name || "Your opponent";
    await createRivalryNotification(
      client,
      rivalry.id,
      "rivalry_accepted",
      "Outperform Challenge Accepted!",
      `${acceptorName} accepted your Outperform challenge. The competition is now active!`,
    );

    return { ok: true };
  });

// ── Decline a rivalry challenge ─────────────────────────────────────────────

export const declineRivalry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rivalryId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const client = context.supabase as any;

    // RLS SELECT + explicit opponent_id filter ensures only the recipient can decline.
    const { error } = await client
      .from("rivalries")
      .update({ status: "declined", ended_at: new Date().toISOString() })
      .eq("id", data.rivalryId)
      .eq("opponent_id", context.userId)
      .eq("status", "pending");

    if (error) return { ok: false, error: "Could not decline rivalry." };

    // Get challenger_id for notification via RPC
    const { data: declineInfo } = await client
      .from("rivalries")
      .select("challenger_id")
      .eq("id", data.rivalryId)
      .maybeSingle();

    if (declineInfo) {
      const { data: declinerProfile } = await client
        .from("profiles")
        .select("username, display_name")
        .eq("id", context.userId)
        .maybeSingle();
      const declinerName =
        declinerProfile?.username || declinerProfile?.display_name || "Your opponent";
      await createRivalryNotification(
        client,
        data.rivalryId,
        "rivalry_declined",
        "Outperform Challenge Declined",
        `${declinerName} declined your Outperform challenge.`,
      );
    }

    return { ok: true };
  });

// ── Get user's rivalries ───────────────────────────────────────────────────

export const getRivalries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RivalryData[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const client = context.supabase as any;
    const userId = context.userId;

    // RLS SELECT ensures user can only see rivalries they participate in.
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

// ── Notifications ─────────────────────────────────────────────────────────────

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

/** Get notifications for the authenticated user */
export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationData[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const client = context.supabase as any;

    // RLS SELECT ensures user can only see their own notifications.
    const { data, error } = await client
      .from("in_app_notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) return [];

    // Resolve from_user display names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const fromUserIds = [...new Set(data.map((n: any) => n.from_user_id).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (fromUserIds.length > 0) {
      const { data: profiles } = await client
        .from("profiles")
        .select("id, username, display_name")
        .in("id", fromUserIds);
      if (profiles) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
        for (const p of profiles as any[]) {
          nameMap[p.id] = p.username || p.display_name || "A member";
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    return data.map((n: any) => ({
      id: n.id,
      type: n.type,
      fromUserId: n.from_user_id,
      fromUserName: n.from_user_id ? nameMap[n.from_user_id] : undefined,
      referenceId: n.reference_id,
      title: n.title,
      body: n.body,
      read: n.read,
      handled: n.handled,
      createdAt: n.created_at,
    }));
  });

/** Mark a notification as read */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { notificationId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const client = context.supabase as any;

    // RLS UPDATE ensures user can only mark their own notifications.
    // WITH CHECK ensures user_id cannot be changed.
    const { error } = await client
      .from("in_app_notifications")
      .update({ read: true })
      .eq("id", data.notificationId)
      .eq("user_id", context.userId);

    if (error) return { ok: false, error: "Could not mark notification." };
    return { ok: true };
  });

// ── Record a rivalry event (progress since rivalry start) ────────────────────

export const recordRivalryEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { rivalryId: string; xpDelta: number; eventType: string; sourceId?: string }) => input,
  )
  .handler(async ({ context, data }): Promise<{ ok: boolean; error?: string }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new tables not yet in generated types
    const client = context.supabase as any;

    // Verify rivalry is active and user is participant (RLS + explicit filter)
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

    // RIVALRY_EVENTS: RLS INSERT ensures user_id = auth.uid()
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
