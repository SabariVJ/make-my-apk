// Request middleware: server-side rate limiting for TanStack Start server
// functions. Registered in src/start.ts after the CSRF gate and BEFORE the
// per-function authentication, so abusive traffic — authenticated or not — is
// rejected at the cheapest layer and never reaches Supabase or expensive
// handlers.
//
// Environment note: this module is imported by src/start.ts, which compiles for
// both bundles, so it stays environment-safe; the store, configuration and
// trusted-IP resolution live in rate-limit.server.ts (marker-protected,
// lazily imported below).
//
// Scope: serverFn requests only. SSR pages, static assets, public routes
// (/privacy, /terms, /live/$token) and the OAuth callback are NOT limited —
// they are served by the CDN/edge and throttling them would only hurt real
// users. There is no health-check route in this app, so none is classified.
//
// Response on exhaustion: 429 JSON body plus Retry-After (correct seconds
// until the window rolls over) and RateLimit-* headers. No rate-limit header
// convention existed in this project before, so these establish one.
import { createMiddleware } from "@tanstack/react-start";
import type { RequestServerOptions } from "@tanstack/react-start";

import { classifyServerFnId } from "./rate-limit";

function rateLimitResponse(decision: {
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  resetAtSeconds: number;
}): Response {
  return new Response(JSON.stringify({ error: "Too many requests", code: "RATE_LIMITED" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(decision.retryAfterSeconds),
      "ratelimit-limit": String(decision.limit),
      "ratelimit-remaining": String(decision.remaining),
      "ratelimit-reset": String(decision.resetAtSeconds),
    },
  });
}

export const rateLimitRequestMiddleware = createMiddleware({ type: "request" }).server(
  async (ctx) => {
    // Only server functions are throttled; everything else passes through.
    if (ctx.handlerType !== "serverFn") {
      return ctx.next();
    }
    const fnId = ctx.serverFnMeta?.id;
    if (!fnId) {
      return ctx.next();
    }

    // Classification is pure and cheap; the store import is server-only.
    const category = classifyServerFnId(fnId);

    const { consumeRateLimit, isRateLimitEnabled, currentRateLimitNow } =
      await import("./rate-limit.server");
    if (!isRateLimitEnabled()) {
      return ctx.next();
    }

    const { decision } = consumeRateLimit({
      request: ctx.request,
      serverFnId: fnId,
      nowSeconds: currentRateLimitNow(),
    });
    if (!decision.allowed) {
      return rateLimitResponse(decision);
    }

    return ctx.next({ context: { rateLimitCategory: category } });
  },
);
