// Pure rate-limit helpers. Environment-safe (no secrets, no env access, no
// I/O): fixed-window math, identity keying, IP normalization, and policy
// classification. The server-only store and configuration live in
// rate-limit.server.ts.

/** A fixed-window rate-limit policy. */
export interface RateLimitPolicy {
  /** Requests allowed per window. */
  max: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

/** Result of consuming one slot from a policy bucket. */
export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the current window rolls over (Retry-After value). */
  retryAfterSeconds: number;
  /** Unix seconds at which the current window resets. */
  resetAtSeconds: number;
}

/** Route categories, coarsest to strictest. */
export type RateLimitCategory = "default" | "sensitive" | "expensive";

const POLICY_ORDER: RateLimitCategory[] = ["sensitive", "expensive", "default"];

/**
 * Classify a TanStack serverFn id into a rate-limit category. Ids look like
 * `src/lib/nutrition.functions.ts_analyzeMealPhoto`. Matching is prefix-based
 * on real function ids only — nothing is invented here.
 *
 * - sensitive: account-level and value-transfer operations where abuse is
 *   destructive (account deletion, Plus code redemption).
 * - expensive: functions that trigger costly external calls (the AI meal
 *   photo scan hits the Lovable AI gateway) — the limit applies BEFORE the
 *   handler runs, i.e. before the external call is made.
 * - default: every other server function.
 */
export function classifyServerFnId(fnId: string): RateLimitCategory {
  if (fnId.startsWith("src/lib/account.functions.ts_")) return "sensitive";
  if (fnId.startsWith("src/lib/trial.functions.ts_redeemPlusCode")) return "sensitive";
  if (fnId.startsWith("src/lib/nutrition.functions.ts_analyzeMealPhoto")) return "expensive";
  return "default";
}

/** The strictest applicable category wins when several rules could match. */
export function strictestCategory(a: RateLimitCategory, b: RateLimitCategory): RateLimitCategory {
  return POLICY_ORDER.indexOf(a) <= POLICY_ORDER.indexOf(b) ? a : b;
}

/**
 * Normalize an IP literal for use as a rate-limit key: lowercased, brackets
 * stripped, IPv6 zone index and port removed. IPv4-mapped IPv6
 * (::ffff:a.b.c.d) is collapsed to the IPv4 form so the same client cannot
 * split its bucket by address-family formatting.
 */
export function normalizeIp(ip: string): string {
  let value = ip.trim().toLowerCase();
  // Bracketed IPv6, optionally with a port: [v6] or [v6]:port.
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close !== -1) value = value.slice(1, close);
  } else if (value.includes(":")) {
    // Unbracketed: strip a trailing :port only when the tail is numeric and
    // the head still contains an address. Bare IPv6 like 2001:db8::1 keeps
    // its last hex group because it contains "::" or multiple colon groups.
    const lastColon = value.lastIndexOf(":");
    const head = value.slice(0, lastColon);
    const tail = value.slice(lastColon + 1);
    const tailIsPort = /^\d{1,5}$/.test(tail);
    const headIsV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(head);
    const headIsBracketlessV6WithPort =
      !head.includes("::") && head.split(":").length === 2 && head.includes(".");
    if (tailIsPort && (headIsV4 || headIsBracketlessV6WithPort)) {
      value = head;
    }
  }
  const zoneIndex = value.indexOf("%");
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex);
  const v4mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4mapped) value = v4mapped[1]!;
  return value;
}

/**
 * Build the bucket key for a request.
 *
 * - With a bearer token, the sub claim (decoded WITHOUT signature
 *   verification — bucketing only; authentication happens later in the
 *   chain) is combined with the client IP: an attacker forging someone
 *   else's sub still lands in a bucket anchored to their own IP, so they can
 *   only exhaust their own quota, never a victim's.
 * - Without a token, the IP alone keys the bucket.
 */
export function buildRateLimitKey(
  category: RateLimitCategory,
  ip: string,
  bearerToken: string | null,
): string {
  const normalizedIp = normalizeIp(ip);
  const sub = bearerToken ? decodeJwtSub(bearerToken) : undefined;
  if (sub) {
    return `${category}:u:${sub}:${normalizedIp}`;
  }
  return `${category}:ip:${normalizedIp}`;
}

/** Extract the `sub` claim from a JWT's payload segment. Never verified. */
export function decodeJwtSub(token: string): string | undefined {
  const segments = token.split(".");
  if (segments.length !== 3) return undefined;
  try {
    const payload = JSON.parse(atobUrl(segments[1]!)) as { sub?: unknown };
    if (typeof payload.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 128) {
      return payload.sub;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function atobUrl(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("utf8");
}

/** Pure fixed-window decision given the previous state. */
export function evaluateFixedWindow(
  previous: { windowStartedAtSeconds: number; count: number } | undefined,
  policy: RateLimitPolicy,
  nowSeconds: number,
): { decision: RateLimitDecision; next: { windowStartedAtSeconds: number; count: number } } {
  const windowSeconds = policy.windowSeconds;
  const isCurrentWindow =
    previous !== undefined && nowSeconds - previous.windowStartedAtSeconds < windowSeconds;

  const windowStartedAtSeconds = isCurrentWindow ? previous!.windowStartedAtSeconds : nowSeconds;
  const count = isCurrentWindow ? previous!.count : 0;
  const resetAtSeconds = windowStartedAtSeconds + windowSeconds;
  const allowed = count < policy.max;

  return {
    decision: {
      allowed,
      limit: policy.max,
      remaining: Math.max(0, policy.max - count - 1),
      retryAfterSeconds: Math.max(1, resetAtSeconds - nowSeconds),
      resetAtSeconds,
    },
    next: { windowStartedAtSeconds, count: allowed ? count + 1 : count },
  };
}
