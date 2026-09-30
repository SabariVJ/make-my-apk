// Support-ticket server functions.
//
// User-side operations rely purely on RLS (owner-scoped). Admin operations
// additionally verify the caller's user_roles row server-side before serving
// data that RLS would otherwise allow but that we still gate for defense in
// depth. Admin ticket updates use the authenticated client — the migration's
// column-level GRANT restricts updates to status/admin_response/resolved_at.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

export type TicketCategory = "payment" | "bug" | "account" | "other";
export type TicketStatus = "open" | "in_progress" | "resolved";

export interface SupportTicket {
  id: string;
  user_id: string;
  category: TicketCategory;
  message: string;
  status: TicketStatus;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface SupportTicketWithReporter extends SupportTicket {
  reporter_username: string | null;
  reporter_email: string | null;
}

/** Create a ticket for the current user (RLS: user_id must equal auth.uid()). */
export const createSupportTicket = createServerFn({ method: "POST" })
  .validator((input: { category: TicketCategory; message: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<{ ok: true; id: string }> => {
    const category = String(data.category || "");
    if (!["payment", "bug", "account", "other"].includes(category)) {
      throw new Error("Invalid category");
    }
    const message = String(data.message || "").trim();
    if (message.length < 1 || message.length > 5000) {
      throw new Error("Message must be between 1 and 5000 characters");
    }

    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) throw new Error("Unauthorized");

    const { data: inserted, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: userId, category, message })
      .select("id")
      .single();
    if (error || !inserted) throw new Error("Failed to submit ticket");
    return { ok: true, id: inserted.id as string };
  });

/** List the current user's own tickets (RLS scopes to user_id = auth.uid()). */
export const listMySupportTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SupportTicket[]> => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select(
        "id, user_id, category, message, status, admin_response, created_at, updated_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Failed to load tickets");
    return (data ?? []) as SupportTicket[];
  });

/** Admin: list all tickets with reporter identity, optionally by status. */
export const adminListSupportTickets = createServerFn({ method: "POST" })
  .validator((input: { status?: TicketStatus | "all"; limit?: number }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<SupportTicketWithReporter[]> => {
    // Defense in depth: assert the caller is an admin before serving the
    // joined reporter identity (RLS already scopes the rows themselves).
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) throw new Error("Unauthorized");
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin role required");

    const limit = Math.min(Math.max(Math.round(Number(data.limit) || 100), 1), 200);
    let query = supabase
      .from("support_tickets")
      .select(
        "id, user_id, category, message, status, admin_response, created_at, updated_at, resolved_at, profiles!support_tickets_user_id_fkey(username, email)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    const status = data.status;
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: tickets, error } = await query;
    if (error) throw new Error("Failed to load tickets");

    type RawTicketRow = {
      id: string;
      user_id: string;
      category: string;
      message: string;
      status: string;
      admin_response: string | null;
      created_at: string;
      updated_at: string;
      resolved_at: string | null;
      profiles: { username?: string | null; email?: string | null } | null;
    };

    return ((tickets ?? []) as unknown as RawTicketRow[]).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      category: row.category as TicketCategory,
      message: row.message,
      status: row.status as TicketStatus,
      admin_response: row.admin_response ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      resolved_at: row.resolved_at ?? null,
      reporter_username: row.profiles?.username ?? null,
      reporter_email: row.profiles?.email ?? null,
    }));
  });

/** Admin: set status and/or the admin response on a ticket. */
export const adminUpdateSupportTicket = createServerFn({ method: "POST" })
  .validator(
    (input: { ticketId: string; status?: TicketStatus; adminResponse?: string | null }) => input,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) throw new Error("Unauthorized");
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin role required");

    const ticketId = String(data.ticketId || "");
    if (!/^[0-9a-f-]{36}$/i.test(ticketId)) throw new Error("Invalid ticket id");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status !== undefined) {
      if (!["open", "in_progress", "resolved"].includes(data.status)) {
        throw new Error("Invalid status");
      }
      patch.status = data.status;
      patch.resolved_at = data.status === "resolved" ? new Date().toISOString() : null;
    }
    if (data.adminResponse !== undefined) {
      const response =
        data.adminResponse === null ? null : String(data.adminResponse).slice(0, 5000);
      patch.admin_response = response && response.length > 0 ? response : null;
    }

    // Authenticated client: RLS permits this update only for admins, and the
    // migration's column grant restricts writes to the admin-controlled cols.
    const { error } = await supabase
      .from("support_tickets")
      .update(
        patch as {
          status?: string;
          admin_response?: string | null;
          resolved_at?: string | null;
          updated_at?: string;
        },
      )
      .eq("id", ticketId);
    if (error) throw new Error("Failed to update ticket");
    return { ok: true };
  });
