import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TRIAL_DAYS = 7;

export type TrialStatus = {
  userId: string;
  email: string | null;
  displayName: string | null;
  signupDate: string;
  isPlusMember: boolean;
  /** Server-authoritative Plus status ("has_active_plus"). True only when
   * is_plus_member is set AND the expiry (if any) is still in the future.
   * The client must never derive this from localStorage. */
  plusActive: boolean;
  /** ISO expiry timestamp for timed Plus, or null for lifetime Plus.
   * Display-only — access control uses plusActive, not this value. */
  plusExpiresAt: string | null;
  dayOfTrial: number;
  daysLeft: number;
  locked: boolean;
};

function buildStatus(row: {
  id: string;
  email: string | null;
  display_name: string | null;
  signup_date: string;
  is_plus_member: boolean;
  plus_expires_at: string | null;
}): TrialStatus {
  const start = new Date(row.signup_date).getTime();
  const elapsedDays = Math.floor((Date.now() - start) / 86_400_000);
  const dayOfTrial = elapsedDays + 1;
  const daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays);
  // Plus is active for paid/lifetime members (no expiry) OR until the
  // server-checked expiry timestamp for code-redemption grants (exactly 2 months).
  const plusActive =
    row.is_plus_member &&
    (!row.plus_expires_at || new Date(row.plus_expires_at).getTime() > Date.now());
  return {
    userId: row.id,
    email: row.email,
    displayName: row.display_name,
    signupDate: row.signup_date,
    isPlusMember: row.is_plus_member,
    plusActive,
    plusExpiresAt: row.plus_expires_at,
    dayOfTrial,
    daysLeft,
    locked: !plusActive && daysLeft <= 0,
  };
}

/**
 * Membership resolution for the CURRENTLY AUTHENTICATED USER ONLY.
 *
 * Architecture (emergency backend stabilization):
 *   authenticated session/JWT
 *     → RLS-respecting Supabase client (auth middleware attaches the caller's
 *       own bearer token — no service-role/admin key involved)
 *     → svj_get_my_membership() SECURITY DEFINER RPC
 *     → server derives auth.uid() and returns ONLY that user's entitlement
 *
 * This deliberately does NOT require SVJ_SUPABASE_SECRET_KEY or
 * SUPABASE_SERVICE_ROLE_KEY. The old flow went through requireAdminKey() +
 * supabaseAdmin, which crashed every normal sign-in on the Lovable-managed
 * backend where no service-role key is exposed. Privileged operations
 * (account deletion, Plus grants, code redemption) still call
 * requireAdminKey() and remain fail-closed — see client.server.ts.
 *
 * The RPC takes no user_id parameter and derives identity from auth.uid(),
 * so a caller can never request another user's membership. The same-email
 * sibling-account merge (Google vs. password sign-up) moved into the RPC so
 * both providers land on identical entitlement data without an admin client.
 */
export const getTrialStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrialStatus> => {
    // context.supabase is the publishable-key client carrying the caller's own
    // bearer token. RLS + auth.uid() restrict every read to the caller's row.
    // The generated types intentionally lag additive SQL migrations; this RPC
    // has a fixed, audited output shape and is safe to cast locally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data: rows, error } = await client.rpc("svj_get_my_membership");
    if (error) throw new Error(error.message);

    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      // svj_get_my_membership() returns no rows for an unauthenticated
      // caller. The middleware guarantees a valid session here, so an empty
      // result means the profile row could not be provisioned.
      throw new Error("Your membership could not be resolved. Please retry.");
    }

    const email = ((context.claims["email"] as string | undefined) ?? "").toLowerCase() || null;

    return buildStatus({
      id: row.id as string,
      // Keep the token's own email for display; the RPC never returns email.
      email: email ?? null,
      display_name: (row.display_name as string | null) ?? null,
      signup_date: row.signup_date as string,
      is_plus_member: Boolean(row.is_plus_member),
      plus_expires_at: (row.plus_expires_at as string | null) ?? null,
    });
  });
