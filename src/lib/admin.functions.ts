// Admin dashboard server functions.
//
// SECURITY MODEL: every function below first verifies, server-side, that the
// CALLER has a row in public.user_roles (role = 'admin') — resolved via the
// caller's own authenticated Supabase client so RLS applies. Only then does it
// touch the service-role client. The role check can never be satisfied from
// the client by argument tampering: the uid is taken from the verified session
// token, never from input.
//
// Privileged writes (grant/revoke Plus, user deletion) use supabaseAdmin
// (service role), mirroring account.functions.ts. The service key never
// leaves the server.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FOUNDER_EMAIL } from "@/app/lib/founderIdentity";

/** Resolve the caller's verified auth uid and assert they hold an admin role. */
async function requireAdminUserId(userId: string): Promise<string> {
  const { hasAdminKey, supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!hasAdminKey()) {
    // Without the service key the admin client silently falls back to the
    // publishable key, which RLS filters — the check below would then fail
    // for every caller (even real admins) with a misleading Forbidden error.
    throw new Error("Admin service key not configured");
  }
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.error("[admin] user_roles query failed", error);
  }
  if (error || !data) {
    throw new Error("Forbidden: admin role required");
  }
  return userId;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  totalPlusMembers: number;
  newSignupsLast7Days: number;
  openTickets: number;
}

export interface AdminUserRow {
  id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  is_plus_member: boolean;
  plus_expires_at: string | null;
  current_streak: number;
  total_xp: number;
  created_at: string;
}

export interface AdminUserPage {
  users: AdminUserRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AdminTicketRow {
  id: string;
  user_id: string;
  category: "payment" | "bug" | "account" | "other";
  message: string;
  status: "open" | "in_progress" | "resolved";
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  /** Joined reporter identity (admin-only read). */
  reporter_username: string | null;
  reporter_email: string | null;
}

// ── Stats ───────────────────────────────────────────────────────────────────

export const getAdminDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminStats> => {
    await requireAdminUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const [users, plus, newSignups, tickets] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_plus_member", true),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo),
      supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ]);

    return {
      totalUsers: users.count ?? 0,
      totalPlusMembers: plus.count ?? 0,
      newSignupsLast7Days: newSignups.count ?? 0,
      openTickets: tickets.count ?? 0,
    };
  });

// ── User list ───────────────────────────────────────────────────────────────

export const adminListUsers = createServerFn({ method: "POST" })
  .validator((input: { search?: string; page?: number; pageSize?: number }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<AdminUserPage> => {
    await requireAdminUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const pageSize = Math.min(Math.max(Math.round(Number(data.pageSize) || 25), 1), 100);
    const page = Math.max(Math.round(Number(data.page) || 1), 1);
    const search = typeof data.search === "string" ? data.search.trim() : "";

    let query = supabaseAdmin
      .from("profiles")
      .select(
        "id, username, display_name, email, is_plus_member, plus_expires_at, current_streak, total_xp, created_at",
      )
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // Search across username / display_name / email. The OR filter is
    // parameterized by the client (no string interpolation into SQL).
    if (search) {
      const term = search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(
          `username.ilike.%${term}%,display_name.ilike.%${term}%,email.ilike.%${term}%`,
        );
      }
    }

    const { data: users, error } = await query;
    if (error) throw new Error("Failed to list users");

    const rows = (users ?? []) as AdminUserRow[];
    return { users: rows, page, pageSize, hasMore: rows.length === pageSize };
  });

// ── Plus grants ─────────────────────────────────────────────────────────────

export const adminGrantPlus = createServerFn({ method: "POST" })
  .validator(
    (input: {
      targetUserId: string;
      durationValue: number;
      durationUnit: "week" | "month" | "lifetime";
    }) => input,
  )
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
      data,
    }): Promise<{ ok: true; grantId: string; expiresAt: string | null }> => {
      await requireAdminUserId(context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const targetUserId = String(data.targetUserId || "");
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
        throw new Error("Invalid target user");
      }

      const durationUnit = data.durationUnit;
      const durationValue = Number(data.durationValue);
      if (!["week", "month", "lifetime"].includes(durationUnit)) {
        throw new Error("Invalid Plus duration");
      }
      if (
        durationUnit === "lifetime"
          ? durationValue !== 0
          : !Number.isInteger(durationValue) ||
            durationValue < 1 ||
            (durationUnit === "week" ? durationValue > 104 : durationValue > 24)
      ) {
        throw new Error("Invalid Plus duration");
      }

      const senderEmail =
        typeof context.claims?.email === "string" ? context.claims.email.trim().toLowerCase() : "";
      const senderLabel = senderEmail === FOUNDER_EMAIL ? "Founder" : "SVJ Admin";

      const { data: rows, error } = await supabaseAdmin.rpc("svj_admin_grant_plus", {
        p_target_user_id: targetUserId,
        p_granted_by: context.userId,
        p_duration_value: durationValue,
        p_duration_unit: durationUnit,
        p_sender_label: senderLabel,
      });

      if (error) throw new Error(error.message || "Failed to grant Plus");
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.grant_id) throw new Error("Failed to record Plus gift");

      return {
        ok: true,
        grantId: String(row.grant_id),
        expiresAt: (row.expires_at as string | null) ?? null,
      };
    },
  );

export const adminRevokePlus = createServerFn({ method: "POST" })
  .validator((input: { targetUserId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdminUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const targetUserId = String(data.targetUserId || "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      throw new Error("Invalid target user");
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_plus_member: false, plus_expires_at: null })
      .eq("id", targetUserId);
    if (error) throw new Error("Failed to revoke Plus");
    return { ok: true };
  });

// ── User deletion (irreversible) ────────────────────────────────────────────

export const adminDeleteUser = createServerFn({ method: "POST" })
  .validator((input: { targetUserId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireAdminUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const targetUserId = String(data.targetUserId || "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      throw new Error("Invalid target user");
    }
    // Guardrail: an admin cannot delete their own account from the dashboard.
    if (targetUserId === context.userId) {
      throw new Error("Refusing to delete your own account from the admin dashboard");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (error) throw new Error("Failed to delete user");
    return { ok: true };
  });
