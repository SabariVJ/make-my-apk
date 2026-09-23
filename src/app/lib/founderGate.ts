/**
 * Founder-only rollout gate (SVJ Recovery V2 — staged rollout).
 *
 * Recovery V2 is promoted to a top-level destination for the founder account
 * first; ordinary users keep the exact current application. The authoritative
 * identity is the profile SVJContext resolves from Supabase (`isFounder` /
 * `isOwner`) — which already contains the owner-email fallback inside the
 * context, so this module deliberately has NO email allow-list of its own and
 * introduces no second founder column, table or role system.
 *
 * The gate refuses to answer before the real profile has loaded. That is what
 * stops the INITIAL_USER placeholder (or a stale localStorage cache) from
 * flashing a founder-only destination for a moment.
 */
export interface FounderIdentity {
  isFounder?: boolean;
  isOwner?: boolean;
}

/**
 * True only when the authenticated, server-backed profile is the founder/owner
 * AND that profile has actually loaded.
 */
export function isFounderAccount(
  user: FounderIdentity | null | undefined,
  profileLoaded: boolean,
): boolean {
  if (!profileLoaded || !user) return false;
  return user.isFounder === true || user.isOwner === true;
}
