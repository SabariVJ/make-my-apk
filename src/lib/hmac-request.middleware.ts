// Request middleware: HMAC-SHA256 verification for TanStack Start server
// functions. Registered in src/start.ts AFTER the CSRF middleware and BEFORE
// the per-function authentication middleware.
//
// NOTE on environment: src/start.ts is compiled for BOTH client and server
// bundles, so this module must stay importable everywhere. It contains no
// secret material itself — pure helpers come from hmac.ts, and the secret
// lives only in hmac.server.ts, which is imported lazily inside the server
// handler below and is marker-protected (build fails on any client import).
//
// Enforcement is opt-in per server function: every TanStack serverFn carries a
// compile-time id (visible to request middleware as serverFnMeta.id). A
// function is HMAC-protected when its id is listed in
// HMAC_PROTECTED_SERVER_FN_IDS (comma-separated env var). Unlisted functions —
// and every non-serverFn request (SSR pages, static assets, public routes,
// health-ish paths, the Supabase OAuth callback) — pass through untouched, so
// the browser SPA is unaffected and no secret is ever needed client-side.
//
// A request to a protected function must carry `x-signature` and `x-timestamp`
// signing `${x-timestamp}.${rawBody}` with HMAC-SHA256. The timestamp is the
// header value VERBATIM, so a signer never has to guess canonicalization; the
// freshness check independently parses it as Unix seconds. The body is read
// from a CLONE of the request, so the original request — the exact object the
// framework hands to the server function — is never consumed or replaced and
// the handler parses precisely the bytes that were signed.
//
// On success the downstream chain receives `context.hmacValidated = true`;
// the existing authentication/authorization middleware then run unchanged.
//
// Fails closed: if a protected function is configured but HMAC_SECRET is
// missing, the request 500s rather than passing unverified.
import { createMiddleware } from "@tanstack/react-start";
import type { RequestServerOptions } from "@tanstack/react-start";

import { hmacSignaturesMatch, isHmacTimestampFresh, parseHmacTimestamp } from "./hmac";

function hmacErrorResponse(status: 401 | 500, error: string, code: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function missingHeadersResponse(): Response {
  return hmacErrorResponse(
    401,
    "Missing signature or timestamp header",
    "MISSING_SIGNATURE_HEADERS",
  );
}

function expiredTimestampResponse(): Response {
  return hmacErrorResponse(401, "Request timestamp expired", "EXPIRED_TIMESTAMP");
}

function invalidSignatureResponse(): Response {
  return hmacErrorResponse(401, "Invalid signature", "INVALID_SIGNATURE");
}

function missingSecretResponse(): Response {
  // Do not name the missing environment variable in the response: the deploy
  // misconfiguration is a server-side concern and responses must not become a
  // configuration probe.
  return hmacErrorResponse(500, "Server HMAC configuration error", "SERVER_HMAC_MISCONFIGURED");
}

/** Protected function ids come from configuration; surrounding whitespace is tolerated. */
export function getProtectedServerFnIds(): string[] {
  return (process.env["HMAC_PROTECTED_SERVER_FN_IDS"] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function isProtectedRequest(ctx: RequestServerOptions<never, never>): boolean {
  if (ctx.handlerType !== "serverFn") return false;
  const id = ctx.serverFnMeta?.id;
  return id !== undefined && getProtectedServerFnIds().includes(id);
}

/**
 * The exact payload that must have been signed: "" for bodyless methods,
 * otherwise the raw request body. Reads a CLONE so the original request body
 * stays intact for the framework's own parsing downstream.
 */
async function extractSignedPayload(request: Request): Promise<string> {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return "";
  return request.clone().text();
}

export const hmacRequestMiddleware = createMiddleware({ type: "request" }).server(async (ctx) => {
  if (!isProtectedRequest(ctx)) {
    return ctx.next();
  }

  const request = ctx.request;
  const signature = request.headers.get("x-signature");
  const timestampHeader = request.headers.get("x-timestamp");

  // 1) Header presence — the cheapest rejection comes first.
  if (!signature || !timestampHeader) {
    return missingHeadersResponse();
  }

  // 2) Timestamp syntax — parse before freshness so NaN/overflow/malformed
  //    values are rejected here and can never reach the comparison.
  const timestamp = parseHmacTimestamp(timestampHeader);
  if (timestamp === undefined) {
    return invalidSignatureResponse();
  }

  // 3) Timestamp freshness — the basic replay-resistance window (±300s).
  if (!isHmacTimestampFresh(timestamp)) {
    return expiredTimestampResponse();
  }

  // 4) Fail closed on misconfiguration: a protected function must never be
  //    served without verification just because the secret is absent. The
  //    signer (and the secret) is loaded from the marker-protected module.
  let expected: string;
  let rawPayload: string;
  try {
    const { signHmacPayload } = await import("./hmac.server");
    rawPayload = await extractSignedPayload(request);
    expected = await signHmacPayload(rawPayload, timestampHeader);
  } catch {
    return missingSecretResponse();
  }

  // 5) Timing-safe comparison; length mismatches are handled inside and
  //    can never throw or leak an oracle.
  if (!hmacSignaturesMatch(signature, expected)) {
    return invalidSignatureResponse();
  }

  // 6) Verified: mark the context. The original request (headers AND body
  //    untouched) continues through the normal chain.
  return ctx.next({
    context: { hmacValidated: true },
  });
});
