import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PendingPlusGift {
  id: string;
  senderLabel: string;
  durationValue: number;
  durationUnit: "week" | "month" | "lifetime";
  expiresAt: string | null;
  createdAt: string;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

/**
 * Returns the oldest unclaimed, unexpired gift for the authenticated user.
 * The browser never supplies the recipient id; the server derives it from
 * the verified session.
 */
export const getMyPendingPlusGift = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingPlusGift | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data, error } = await client
      .from("plus_gifts")
      .select("id, sender_label, duration_value, duration_unit, expires_at, created_at")
      .eq("recipient_user_id", context.userId)
      .is("claimed_at", null)
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;

    const expiresAt = (row.expires_at as string | null) ?? null;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return {
      id: String(row.id),
      senderLabel: String(row.sender_label || "SVJ Admin"),
      durationValue: Number(row.duration_value),
      durationUnit: row.duration_unit as PendingPlusGift["durationUnit"],
      expiresAt,
      createdAt: String(row.created_at),
    };
  });

export const claimMyPlusGift = createServerFn({ method: "POST" })
  .validator((input: { grantId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ ok: true; expiresAt: string | null }> => {
    const grantId = String(data.grantId || "");
    if (!isValidUuid(grantId)) throw new Error("Invalid Plus gift");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data: rows, error } = await client.rpc("svj_claim_plus_gift", {
      p_grant_id: grantId,
    });

    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || row.ok !== true) throw new Error("This Plus gift has already been claimed");

    return {
      ok: true,
      expiresAt: (row.expires_at as string | null) ?? null,
    };
  });
