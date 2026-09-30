# Rate Limiting (SVJ)

Server-side request-volume limiting for the SVJ TanStack Start backend. It is
an additional protection layer: it neither replaces nor weakens CSRF, Supabase
authentication, authorization, or RLS.

## Architecture

```
request
  → src/server.ts (SSR error wrapper)
  → requestMiddleware chain (src/start.ts):
      1. errorMiddleware        (existing)
      2. csrfMiddleware         (existing, unchanged)
      3. rateLimitRequestMiddleware   (NEW)
  → functionMiddleware chain:
      4. attachSupabaseAuth / requireSupabaseAuth (existing, unchanged)
      5. requireAdminKey guards (existing, unchanged)
  → server function handler
```

Rate limiting runs before authentication because it is the cheapest check:
abusive traffic — authenticated or not — is rejected without touching the
Supabase client or any handler. Rate limiting is one additional layer; it never
replaces authentication.

Scope: **server functions only**. SSR pages, static assets, public routes
(`/privacy`, `/terms`, `/live/$token`) and the Supabase OAuth callback are not
limited — they are edge/CDN-served and throttling them would only hurt real
users. There is no health-check route in this app, so none is classified.

## Algorithm and storage

**Fixed-window counters** per (category, identity) bucket — O(1) per request,
deterministic `Retry-After`.

**Storage: bounded in-memory store** (`rate-limit.server.ts`):

- Buckets expire when their window passes (`windowStartedAtSeconds +
windowSeconds <= now`); they are dropped lazily on access and proactively by
  a sweep piggybacked on `consume()` (no timers — worker runtimes dislike
  them).
- At most `RATE_LIMIT_MAX_BUCKETS` (default 10,000) distinct buckets per
  isolate. When full, **new** identities are refused rather than growing
  memory: an IP-spoofing flood degrades to blanket 429s, never OOM.
- The store lives in module-global `Symbol.for("svj.rate-limit.store")` so dev
  HMR module re-instantiation keeps one store per isolate.

**Multi-instance caveat (important):** production runs on Nitro's
`cloudflare-module` preset — Cloudflare Worker isolates. In-memory counters are
per-isolate, so limits are approximately `max × isolates` under heavy fan-out.
This is accepted for the current threat model (no Redis/Upstash exists in the
stack and the spec forbids adding infrastructure unless required). The
`consume()` seam is the single place to swap in a shared store later; the
decision shape and headers would not change.

## Identity and keying

- **Authenticated requests** (an `Authorization: Bearer <jwt>` header is
  present): key = `category:u:<sub>:<ip>`. `sub` is decoded from the JWT
  payload **without verification** — it is used for bucketing only; real
  authentication happens later via `requireSupabaseAuth`. An attacker forging
  a victim's `sub` still lands in a bucket anchored to their own IP, so they
  can only exhaust their own quota, never a victim's.
- **Unauthenticated requests**: key = `category:ip:<ip>`.

### Trusted client IP resolution (in order)

1. `cf-connecting-ip` — set by Cloudflare's edge (production runtime);
   clients cannot set it.
2. `x-nf-client-connection-ip` — set by Netlify's edge (deploy previews).
3. The runtime peer address exposed by the framework (`request.ip`).

`X-Forwarded-For` and `X-Real-IP` are **never** consulted: they are
client-suppliable and would let an attacker rotate buckets or poison another
client's. IP normalization lowercases, strips brackets, zone indices
(`%eth0`), and `:port` suffixes, and collapses IPv4-mapped IPv6
(`::ffff:a.b.c.d` → `a.b.c.d`) so formatting cannot split or merge buckets.

## Route categories and defaults

Categories are derived from **real** server-function ids only (prefix match on
`serverFnMeta.id`):

| Category    | Functions                                                                                                            | Default limit  |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | -------------- |
| `sensitive` | `account.functions.ts_*` (account deletion & other account-sensitive mutations), `trial.functions.ts_redeemPlusCode` | **5 / 60s**    |
| `expensive` | `nutrition.functions.ts_analyzeMealPhoto` (external AI gateway call)                                                 | **10 / 3600s** |
| `default`   | every other server function                                                                                          | **60 / 60s**   |

The expensive-endpoint limit is enforced in the request middleware — i.e.
**before** the handler runs and before the external AI call is billed. The
function's own DB-backed daily-usage cap (3 scans/day) still applies on top.

## Response on exhaustion

```json
{ "error": "Too many requests", "code": "RATE_LIMITED" }
```

with HTTP 429 and headers:

- `Retry-After` — correct whole seconds until the window rolls over.
- `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` — establishing
  the project's rate-limit header convention (none existed before).

## Configuration (non-secret, env)

| Variable                                       | Default                   | Meaning            |
| ---------------------------------------------- | ------------------------- | ------------------ |
| `RATE_LIMIT_ENABLED`                           | `true` (`false` disables) | Master switch      |
| `RATE_LIMIT_DEFAULT_MAX` / `_WINDOW_SECONDS`   | 60 / 60                   | Default category   |
| `RATE_LIMIT_SENSITIVE_MAX` / `_WINDOW_SECONDS` | 5 / 60                    | Sensitive category |
| `RATE_LIMIT_EXPENSIVE_MAX` / `_WINDOW_SECONDS` | 10 / 3600                 | Expensive category |
| `RATE_LIMIT_MAX_BUCKETS`                       | 10000                     | Memory bound       |
| `RATE_LIMIT_SWEEP_INTERVAL_SECONDS`            | 60                        | Sweep cadence      |

Policies are read once at module init; none of these values is secret or
exposed to client bundles (`rate-limit.server.ts` is marker-protected
server-only, and the middleware module it lives behind contains no env reads).

## Anti-bypass analysis

- **Alternate/equivalent routes:** limits key on the server-function _id_, not
  the URL; every TanStack RPC for the same function maps to one id.
- **Trivial URL changes:** same — the id is compile-time, not path-derived.
- **Spoofed forwarded IPs:** only edge-set headers are trusted (see above);
  `X-Forwarded-For`/`X-Real-IP` are ignored.
- **IP-format churn:** normalization collapses bracket/zone/port/IPv4-mapped
  variants to one bucket.
- **Session churn:** unauthenticated buckets key on IP, not sessions; creating
  sessions does not reset anything.
- **Reaching the same expensive operation via another route:** the expensive
  category keys on the function id that wraps the external call; no other
  server function calls the AI gateway.
- **No exclusions create loopholes:** excluded request types (pages, assets)
  are not server functions and cannot reach privileged handlers.

## Tests

`tests/rate-limit-security.test.ts` (17 tests) covers: below/at/above limit,
`Retry-After` correctness, user + IP identity and forgery self-limiting,
IPv4/IPv6 normalization, trusted-proxy headers vs spoofed `X-Forwarded-For`,
per-category policies, expensive-endpoint pre-handler blocking, window
rollover, stale-entry sweep, bounded memory, router pass-through, disable
switch, auth-header preservation, request-middleware ordering, client-exposure
scanning, and defensive JWT sub decoding.
