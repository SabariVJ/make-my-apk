// SERVER-ONLY: bounded in-memory fixed-window rate-limit store plus
// configuration and trusted client-IP resolution. Marker-protected so any
// client-side import fails the build; the store never leaves the server
// process.
import "@tanstack/react-start/server-only";

import {
  buildRateLimitKey,
  classifyServerFnId,
  evaluateFixedWindow,
  normalizeIp,
  type RateLimitCategory,
  type RateLimitDecision,
  type RateLimitPolicy,
} from "./rate-limit";

// ── Configuration (non-secret, env-driven) ──────────────────────────────────

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

// Policies are read once at module init so mid-flight env changes cannot
// produce inconsistent windows across a request lifecycle. Tests reset them
// via resetRateLimitConfigForTests().
let policies: Record<RateLimitCategory, RateLimitPolicy> = readPolicies();
let enabled = readEnabled();
let maxBuckets = envInt("RATE_LIMIT_MAX_BUCKETS", 10_000);
let sweepIntervalSeconds = envInt("RATE_LIMIT_SWEEP_INTERVAL_SECONDS", 60);

function readEnabled(): boolean {
  return process.env["RATE_LIMIT_ENABLED"] !== "false";
}

function readPolicies(): Record<RateLimitCategory, RateLimitPolicy> {
  return {
    sensitive: {
      max: envInt("RATE_LIMIT_SENSITIVE_MAX", 5),
      windowSeconds: envInt("RATE_LIMIT_SENSITIVE_WINDOW_SECONDS", 60),
    },
    expensive: {
      max: envInt("RATE_LIMIT_EXPENSIVE_MAX", 10),
      windowSeconds: envInt("RATE_LIMIT_EXPENSIVE_WINDOW_SECONDS", 3600),
    },
    default: {
      max: envInt("RATE_LIMIT_DEFAULT_MAX", 60),
      windowSeconds: envInt("RATE_LIMIT_DEFAULT_WINDOW_SECONDS", 60),
    },
  };
}

export function getPolicyForCategory(category: RateLimitCategory): RateLimitPolicy {
  return policies[category];
}

export function isRateLimitEnabled(): boolean {
  return enabled;
}

/**
 * Test-only: re-read env-driven configuration after a test changed the
 * environment, and drop the cached store. Never call from production code.
 */
export function resetRateLimitConfigForTests(): void {
  policies = readPolicies();
  enabled = readEnabled();
  maxBuckets = envInt("RATE_LIMIT_MAX_BUCKETS", 10_000);
  sweepIntervalSeconds = envInt("RATE_LIMIT_SWEEP_INTERVAL_SECONDS", 60);
  const host = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const storeSymbol = Object.getOwnPropertySymbols(globalThis).find(
    (s) => String(s) === "Symbol(svj.rate-limit.store)",
  );
  if (storeSymbol) delete (host as Record<symbol, unknown>)[storeSymbol];
  setNowForTests(undefined);
}

// ── Store (bounded, expiring, in-memory) ────────────────────────────────────

interface WindowState {
  windowStartedAtSeconds: number;
  count: number;
  /** Bookkeeping for the sweep: last time this bucket was touched. */
  lastSeenAtSeconds: number;
}

/**
 * In-memory fixed-window store.
 *
 * Bounds:
 * - At most `maxKeys` distinct buckets; when full, new (i.e. least-recently
 *   created) identities are refused rather than growing without limit — a
 *   flood of spoofed IPs degrades to blanket rejection, not OOM.
 * - Expired windows are dropped lazily on access and proactively by a
 *   periodic sweep piggybacked on consume() (no timers in worker runtimes).
 */
class BoundedWindowStore {
  private buckets = new Map<string, WindowState>();
  private lastSweepAtSeconds = 0;

  constructor(
    private readonly maxKeys: number,
    private readonly sweepIntervalSeconds: number,
  ) {}

  consume(key: string, policy: RateLimitPolicy, nowSeconds: number) {
    this.sweepIfNeeded(nowSeconds, policy.windowSeconds);

    const existing = this.buckets.get(key);
    const { decision, next } = evaluateFixedWindow(
      existing && nowSeconds - existing.windowStartedAtSeconds < policy.windowSeconds
        ? { windowStartedAtSeconds: existing.windowStartedAtSeconds, count: existing.count }
        : undefined,
      policy,
      nowSeconds,
    );

    if (!existing && this.buckets.size >= this.maxKeys && decision.allowed) {
      // Memory bound reached: refuse new identities instead of growing.
      return {
        decision: {
          ...decision,
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, policy.windowSeconds),
        } as RateLimitDecision,
        stored: false,
      };
    }

    this.buckets.set(key, {
      windowStartedAtSeconds: next.windowStartedAtSeconds,
      count: next.count,
      lastSeenAtSeconds: nowSeconds,
    });
    return { decision, stored: true };
  }

  /** Drop windows that can no longer influence any decision. */
  private sweepIfNeeded(nowSeconds: number, windowSeconds: number) {
    if (nowSeconds - this.lastSweepAtSeconds < this.sweepIntervalSeconds) return;
    this.lastSweepAtSeconds = nowSeconds;
    for (const [key, state] of this.buckets) {
      if (nowSeconds - state.windowStartedAtSeconds >= windowSeconds) {
        this.buckets.delete(key);
      }
    }
  }

  /** Test/diagnostic accessor: number of live buckets. */
  get size(): number {
    return this.buckets.size;
  }
}

// Worker-isolate-sized bounds: each isolate holds at most this many buckets
// and sweeps once a minute of wall time (values re-readable via the test
// reset hook).
const globalStoreKey = Symbol.for("svj.rate-limit.store");
type StoreHost = typeof globalThis & { [globalStoreKey]?: BoundedWindowStore };

function getStore(): BoundedWindowStore {
  const host = globalThis as StoreHost;
  if (!host[globalStoreKey]) {
    host[globalStoreKey] = new BoundedWindowStore(maxBuckets, sweepIntervalSeconds);
  }
  return host[globalStoreKey]!;
}

// ── Trusted client IP ───────────────────────────────────────────────────────

/**
 * Resolve the client IP from TRUSTED sources only, in order:
 * 1. `cf-connecting-ip` — set by Cloudflare's edge (production runtime is
 *    cloudflare-module); clients cannot set it.
 * 2. `x-nf-client-connection-ip` — set by Netlify's edge (deploy previews).
 * 3. The runtime socket/peer address exposed by the framework — on Node the
 *    direct connection; NOT derived from any forwarded header.
 *
 * X-Forwarded-For / X-Real-IP are deliberately NEVER consulted: they are
 * client-suppliable and would let an attacker rotate buckets (or poison
 * another client's) at will.
 */
export function getClientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const nf = request.headers.get("x-nf-client-connection-ip");
  if (nf) return nf;
  const runtime = (request as Request & { ip?: string }).ip;
  if (runtime) return runtime;
  // Last resort for runtimes that expose nothing: a constant bucket shared by
  // all such clients (fail-closed for identification, still bounded).
  return "unknown";
}

// ── Public entry point used by the middleware ───────────────────────────────

export interface RateLimitConsumeResult {
  decision: RateLimitDecision;
  key: string;
}

/** Consume one slot for the request's identity under the fn's category policy. */
export function consumeRateLimit(options: {
  request: Request;
  serverFnId: string;
  nowSeconds?: number;
}): RateLimitConsumeResult {
  const category = classifyServerFnId(options.serverFnId);
  const policy = getPolicyForCategory(category);
  const ip = normalizeIp(getClientIp(options.request));
  const authorization = options.request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim() || null
    : null;
  const key = buildRateLimitKey(category, ip, bearer);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const { decision } = getStore().consume(key, policy, now);
  return { decision, key };
}

/**
 * Test/diagnostic accessor for the live store. Not used by the middleware
 * chain; keeps the global-symbol plumbing out of the tests.
 */
export function getStoreForTests(): { size: number } {
  return getStore();
}

/**
 * Test-only clock override. Always undefined in production; lets tests drive
 * window rollover deterministically without fake timers.
 */
let nowOverrideForTests: number | undefined;
export function setNowForTests(value: number | undefined): void {
  nowOverrideForTests = value;
}
export function currentRateLimitNow(): number {
  return nowOverrideForTests ?? Math.floor(Date.now() / 1000);
}
