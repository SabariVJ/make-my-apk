/**
 * Session-expiry plumbing (UI only).
 *
 * Detects "the stored Supabase session is no longer valid" and lets any layer
 * of the app raise the branded Session Expired screen. Nothing here touches
 * RPCs, XP, migrations or server data — it only classifies errors and notifies
 * listeners.
 */

const listeners = new Set<() => void>();

/** Set while the user is deliberately signing out, so we don't call it expiry. */
let intentionalSignOut = false;
let intentionalTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Mark the next auth state change as a deliberate sign-out. Auto-clears after
 * a few seconds so a later involuntary sign-out is still detected.
 */
export function markIntentionalSignOut(): void {
  intentionalSignOut = true;
  if (intentionalTimer) clearTimeout(intentionalTimer);
  intentionalTimer = setTimeout(() => {
    intentionalSignOut = false;
    intentionalTimer = null;
  }, 8000);
}

/** Consume + clear the intentional-sign-out flag. */
export function consumeIntentionalSignOut(): boolean {
  if (intentionalTimer) {
    clearTimeout(intentionalTimer);
    intentionalTimer = null;
  }
  const was = intentionalSignOut;
  intentionalSignOut = false;
  return was;
}

/** Notify listeners that the session has expired. */
export function notifySessionExpired(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to session-expiry events. Returns an unsubscribe function. */
export function subscribeToSessionExpiry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Watch for unhandled failures that mean the session died (e.g. a background
 * auth refresh or an authenticated request returning 401) and raise the
 * Session Expired state. Returns a cleanup function.
 */
export function installSessionExpiryWatcher(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onRejection = (event: PromiseRejectionEvent) => {
    if (isSessionExpiredError(event.reason)) notifySessionExpired();
  };

  window.addEventListener("unhandledrejection", onRejection);
  return () => window.removeEventListener("unhandledrejection", onRejection);
}

const EXPIRED_MESSAGES = [
  /jwt expired/i,
  /invalid refresh token/i,
  /refresh token not found/i,
  /invalid jwt/i,
  /token has expired/i,
  /session (?:is )?(?:expired|missing|not found)/i,
  /auth session missing/i,
  /invalid claim/i,
  /not authenticated|unauthorized/i,
];

/**
 * True when an error means the session is expired/invalid rather than a
 * generic failure. Recognises Supabase auth errors (401 + known messages) and
 * TanStack Start server-function responses.
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (!error) return false;

  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as {
      status?: unknown;
      statusCode?: unknown;
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };

    const status = Number(candidate.status ?? candidate.statusCode);
    if (status === 401) return true;
    if (candidate.name === "AuthSessionMissingError") return true;

    if (typeof candidate.message === "string" && candidate.message.length > 0) {
      if (EXPIRED_MESSAGES.some((re) => re.test(candidate.message as string))) return true;
    }
    current = candidate.cause;
  }

  if (typeof error === "string") return EXPIRED_MESSAGES.some((re) => re.test(error));
  return false;
}
