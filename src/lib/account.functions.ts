// ============================================================================
// Account deletion — server-side function.
//
// SECURITY MODEL
//   * Requires authenticated user via requireSupabaseAuth middleware.
//   * Requires a configured administrator key via requireAdminKey.
//   * Derives the target user ID from the verified session, never from
//     caller-supplied input.
//   * Deletes the Supabase Auth identity, which cascades to all related
//     tables (profiles, challenge_enrollments, challenge_day_progress,
//     redeem_codes, friendships) via ON DELETE CASCADE foreign keys.
//   * Idempotent: deleting a non-existent user is treated as success.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminKey } from "@/integrations/supabase/client.server";

export type DeleteAccountResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Delete the authenticated user's account.
 *
 * This permanently removes:
 * - The Supabase Auth identity (cascades to all FK-linked tables)
 * - Profile data, challenge progress, redeem codes, friendships
 *
 * The user must confirm by typing DELETE. Reauthentication is recommended
 * but not enforced at this layer — the client should handle reauth before
 * calling this function.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .validator((input: { confirmation: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<DeleteAccountResult> => {
    const input = data as { confirmation?: string };

    // Require explicit confirmation
    if (input?.confirmation?.toUpperCase() !== "DELETE") {
      return {
        ok: false,
        message: "Type DELETE to confirm account deletion.",
      };
    }

    // Require admin key — refuse to operate with publishable key
    requireAdminKey();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Delete the Supabase Auth user. This cascades to all related tables
    // via ON DELETE CASCADE foreign keys:
    //   profiles → challenge_enrollments → challenge_day_progress
    //   redeem_codes, friendships
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);

    if (error) {
      console.error("[SVJ] Account deletion failed:", error.message);
      return {
        ok: false,
        message: "Account deletion failed. Please try again or contact support.",
      };
    }

    return {
      ok: true,
      message: "Account deleted successfully.",
    };
  });
