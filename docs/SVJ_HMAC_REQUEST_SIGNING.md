# HMAC Request Signing (SVJ)

Request-integrity layer for the SVJ TanStack Start server: selected server
functions can require an HMAC-SHA256 signature over their exact request body,
so machine-to-machine callers (GPS telemetry ingestion, reward reconciliation,
future integrations) are proven to share the server's secret — on top of, never
instead of, Supabase authentication.

## Architecture (fits the existing stack)

```
browser / WebView ── same-origin serverFn RPC ──┐
                                                │
machine caller ── signed request ───────────────┤
                                                ▼
        src/server.ts (SSR error wrapper)
                    │
        requestMiddleware chain (src/start.ts):
          1. errorMiddleware        (existing)
          2. csrfMiddleware         (existing, unchanged)
          3. hmacRequestMiddleware  (NEW — integrity only)
                    │
        functionMiddleware chain:
          4. attachSupabaseAuth     (existing client-side bearer attach)
          5. requireSupabaseAuth    (existing, per function)
          6. requireAdminKey guards (existing, privileged functions)
                    │
          7. server function handler
```

HMAC is request-integrity, not identity. Every existing authentication and
authorization control still runs; a valid signature only sets
`context.hmacValidated = true` and lets the request proceed through the same
chain as before.

## Why the browser cannot sign

The SVJ client is a public SPA (and a Capacitor WebView). Any signing key in
browser JavaScript, `VITE_*` env vars, Capacitor assets, or web/local storage
would be extractable from the shipped APK or the bundle. The spec forbids
exposing `HMAC_SECRET` to the client, therefore **browser traffic is not
HMAC-signed and is not required to be**. HMAC applies only to server functions
whose callers can hold the secret server-side (server-to-server integrations).
For the browser, the existing protections remain: same-origin CSRF middleware,
Supabase bearer authentication, and RLS.

## Signature format

Signed message (exactly):

```
${timestamp}.${payload}
```

- `timestamp` — Unix seconds, sent verbatim in `x-timestamp` (the verifier
  uses the header string itself, so no canonicalization mismatch is possible).
- `payload` — the exact request body string. `GET`/`HEAD` (and any request
  without a body) sign the empty string.
- `signature` — `HMAC-SHA256(secret, message)` as lowercase hex, sent in
  `x-signature`.

No JSON re-serialization happens on either side: the bytes the client signed
are the bytes the server verifies and the bytes the server function receives.

## Verification pipeline (src/lib/hmac-request.middleware.ts)

For each request to an HMAC-protected server function, in order:

1. **Header presence** — missing `x-signature` or `x-timestamp` →
   `401 {"error":"Missing signature or timestamp header","code":"MISSING_SIGNATURE_HEADERS"}`.
2. **Timestamp syntax** — `x-timestamp` must be a plain decimal integer that
   fits in a safe integer; anything else (`"abc"`, `"1e9"`, `"12.5"`, `"NaN"`,
   overflow digits) → `401 … "INVALID_SIGNATURE"`. NaN can never pass.
3. **Freshness** — `|now − timestamp| ≤ 300` seconds, else
   `401 {"error":"Request timestamp expired","code":"EXPIRED_TIMESTAMP"}`.
   This ±300 s window is the replay-resistance mechanism; requests older or
   newer than the window are refused. There is no nonce store in this stack,
   so none was invented (see "Replay protection" below).
4. **Fail-closed configuration** — if `HMAC_SECRET` is missing, the request is
   refused with `500 {"error":"Server HMAC configuration error","code":"SERVER_HMAC_MISCONFIGURED"}`
   rather than being served unverified. The error never names the variable.
5. **Signature check** — the expected digest is computed over the raw body and
   compared with `hmacSignaturesMatch`, a constant-time comparator that never
   throws on length differences and never leaks a byte-position oracle.
   Mismatch → `401 … "INVALID_SIGNATURE"`.
6. **Forward** — `context.hmacValidated = true` and a rebuilt `Request` whose
   body is the identical signed string are passed to the rest of the chain.

## Enabling protection for a server function

Protection is opt-in per function id (each `createServerFn` has a compile-time
id, visible to request middleware as `serverFnMeta.id`):

```sh
HMAC_SECRET=<64+ random hex chars>          # server-only secret
HMAC_PROTECTED_SERVER_FN_IDS=<fn id 1>,<fn id 2>
```

- Find a function id in the generated server-functions manifest
  (`.tanstack`, or the compiled `createServerRpc` id strings, e.g.
  `src/lib/telemetry.functions.ts_ingestGpsSample`).
- Ids are comma-separated; surrounding whitespace is tolerated.
- If the list is **empty or unset** (the default), the middleware is inert:
  nothing changes for any existing client or route. Only opted-in functions
  fail closed.
- Never list a function that a browser must call unsigned, and never list a
  public webhook/OAuth callback (`/auth/callback`), a health endpoint, static
  assets, or public pages — those are excluded by construction because they are
  not server functions at all.

## Secret handling

- `HMAC_SECRET` is read only inside `src/lib/hmac.ts`, which carries the
  `@tanstack/react-start/server-only` marker — the Start compiler **fails the
  build** if that module is ever imported from client code.
- It is never logged, never returned in responses or errors, never written to
  localStorage/sessionStorage, never placed in `VITE_*` vars, Capacitor assets,
  or the APK.
- Generate with `openssl rand -hex 32` (or equivalent). Rotate by changing the
  env var; during rotation both old and new secrets can be accepted by running
  two verifiers in sequence if zero-downtime is required.

## Replay protection

The ±300 s timestamp window provides basic replay resistance within the
window. The repository has no nonce/request-ID dedup mechanism, and the spec
says not to invent a database-backed one unless needed. When a consumer needs
stronger guarantees (e.g. exactly-once telemetry), add a per-caller nonce cache
at the storage layer used by that consumer — this middleware's contract
(`context.hmacValidated`) is the natural hook for it.

## Rate limiting

The stack has no rate limiter today. When one is added, order it **before**
HMAC (cheap rejection first): rate limit → CSRF → HMAC → auth → handler. This
integration weakens nothing and reserves that slot.

## Tests

`tests/hmac-security.test.ts` (24 tests) covers: valid signatures, missing
headers, malformed/expired/future timestamps, invalid and wrong-length
signatures, tampered bodies, exact body preservation, GET/HEAD empty payloads,
`hmacValidated`, missing-secret fail-closed behavior, unprotected-function and
router pass-through, authentication-header preservation, middleware ordering,
and client-bundle secret-exposure scanning.
