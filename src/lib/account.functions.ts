// ============================================================================
// Account deletion — server-side function.
//
// SECURITY MODEL
//   * Requires authenticated user via requireSupabaseAuth middleware.
//   * Requires a configured administrator key via requireAdminKey.
//   * Derives the target user ID from the verified session, never from
//     caller-supplied input.
//   * Requires a fresh deletion-challenge token (issued by this server)
//     so the request cannot be forged from a stale session.
//   * Deletes the Supabase Auth identity, which cascades to all related
//     tables via ON DELETE CASCADE foreign keys.
//   * Idempotent: deleting a non-existent user is treated as success.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminKey } from "@/integrations/supabase/client.server";

export type DeleteAccountResult = { ok: true; message: string } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// In-memory challenge store (per-process, ephemeral).
// Each challenge is single-use and expires after CHALLENGE_TTL_MS.
// ---------------------------------------------------------------------------
const challenges = new Map<string, { createdAt: number; userId: string }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateChallengeToken(): string {
  const bytes = new Uint8Array(32);
  // Works in Node 19+ and modern browsers — fallback is crypto.getRandomValues
  // which is available in the Vite/server bundle.
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// 1. Request a deletion challenge (step 1 of 2)
//    The server issues a short-lived, single-use token bound to the user.
// ---------------------------------------------------------------------------
export const requestDeletionChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ challengeToken: string }> => {
    // Require admin key — refuse to issue challenges without privileged config
    requireAdminKey();

    // Sweep expired challenges
    const now = Date.now();
    for (const [key, entry] of challenges) {
      if (now - entry.createdAt > CHALLENGE_TTL_MS) challenges.delete(key);
    }

    const token = generateChallengeToken();
    challenges.set(token, { createdAt: now, userId: context.userId });
    return { challengeToken: token };
  });

// ---------------------------------------------------------------------------
// 2. Execute deletion (step 2 of 2)
//    Requires the challenge token + typed confirmation + verified session.
// ---------------------------------------------------------------------------
export const deleteAccount = createServerFn({ method: "POST" })
  .validator((input: { confirmation: string; challengeToken: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<DeleteAccountResult> => {
    const input = data as { confirmation?: string; challengeToken?: string };

    // Require explicit confirmation
    if (input?.confirmation?.toUpperCase() !== "DELETE") {
      return { ok: false, message: "Type DELETE to confirm account deletion." };
    }

    // Require a valid, unexpired, unused challenge token
    const token = input?.challengeToken;
    if (!token) {
      return { ok: false, message: "Missing deletion challenge. Please start again." };
    }
    const challenge = challenges.get(token);
    if (!challenge) {
      return { ok: false, message: "Invalid or expired challenge. Please start again." };
    }
    // Must belong to the same user
    if (challenge.userId !== context.userId) {
      challenges.delete(token);
      return { ok: false, message: "Challenge does not match your session." };
    }
    // Consume the token (single-use)
    challenges.delete(token);

    // Require admin key — refuse to operate with publishable key
    requireAdminKey();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Delete the Supabase Auth user. Cascade deletes all FK-linked rows:
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

    return { ok: true, message: "Account deleted successfully." };
  });
