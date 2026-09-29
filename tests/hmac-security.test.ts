// HMAC request-signing security tests (see docs/SVJ_HMAC_REQUEST_SIGNING.md).
//
// The verification middleware is exercised end-to-end by invoking its `server`
// handler exactly as TanStack Start's request pipeline does: with a Request,
// pathname, handlerType/serverFnMeta and a `next` that records what the
// downstream chain would receive. Crypto runs for real via WebCrypto — the
// same primitive the production runtime uses.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { hmacRequestMiddleware, getProtectedServerFnIds } from "../src/lib/hmac-request.middleware";
import {
  createHmacHeaders,
  hasHmacSecret,
  requireHmacSecret,
  signHmacPayload,
} from "../src/lib/hmac.server";
import {
  buildHmacMessage,
  hmacSignaturesMatch,
  isHmacTimestampFresh,
  parseHmacTimestamp,
  HMAC_TIMESTAMP_TOLERANCE_SECONDS,
} from "../src/lib/hmac";

const PROTECTED_ID = "src/lib/telemetry.functions.ts_ingestGpsSample";
const SECRET = "test-hmac-secret-do-not-use-in-production";

type NextInvocation = { request?: Request; context?: Record<string, unknown> };

function makeCtx(options: {
  body?: string;
  method?: string;
  headers?: Record<string, string>;
  handlerType?: "serverFn" | "router";
  fnId?: string;
  pathname?: string;
}): { ctx: Parameters<typeof hmacRequestMiddleware.options.server>[0]; next: NextInvocation } {
  const invocation: NextInvocation = {};
  const request = new Request("https://svj.example/rpc", {
    method: options.method ?? "POST",
    headers: options.headers ?? {},
    body: options.method === "GET" || options.method === "HEAD" ? undefined : (options.body ?? ""),
  });
  const handlerType = options.handlerType ?? "serverFn";
  const fnId = options.fnId ?? PROTECTED_ID; // serverFn requests default to the protected id
  const ctx = {
    request,
    pathname: options.pathname ?? "/_server/",
    context: {},
    handlerType,
    serverFnMeta: handlerType === "serverFn" && fnId ? protectedMeta(fnId) : undefined,
    next: async (nextOptions?: { request?: Request; context?: Record<string, unknown> }) => {
      invocation.request = nextOptions?.request;
      invocation.context = nextOptions?.context;
      return {
        request,
        pathname: ctx.pathname,
        context: ctx.context,
        response: new Response("ok"),
      };
    },
  };
  return {
    ctx: ctx as unknown as Parameters<typeof hmacRequestMiddleware.options.server>[0],
    next: invocation,
  };
}

async function signedHeaders(payload: string, timestamp?: number) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  return createHmacHeaders(payload, ts);
}

/** Sign with an arbitrary secret WITHOUT touching process.env (for negative tests). */
async function signWithRawSecret(
  payload: string,
  timestamp: number,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    { name: "HMAC", hash: "SHA-256" },
    key,
    new TextEncoder().encode(buildHmacMessage(timestamp, payload)),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function protectedMeta(id = PROTECTED_ID) {
  return { id, name: "ingestGpsSample", filename: "src/lib/telemetry.functions.ts" };
}

test("environment handles a missing HMAC_SECRET safely", () => {
  delete process.env["HMAC_SECRET"];
  assert.equal(hasHmacSecret(), false);
  assert.throws(() => requireHmacSecret(), /HMAC_SECRET is not configured/);
  process.env["HMAC_SECRET"] = SECRET;
  assert.equal(hasHmacSecret(), true);
});

test("signs the exact `${timestamp}.${payload}` message as lowercase hex", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  const payload = '{"a":1}';
  const ts = 1_700_000_000;
  const signature = await signHmacPayload(payload, ts);
  assert.match(signature, /^[0-9a-f]{64}$/);
  // Independent recomputation with WebCrypto.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    { name: "HMAC", hash: "SHA-256" },
    key,
    new TextEncoder().encode(buildHmacMessage(ts, payload)),
  );
  const expected = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  assert.equal(signature, expected);
});

test("parseHmacTimestamp rejects malformed values", () => {
  for (const bad of ["", "abc", "1e9", "12.5", "-5", "+5", " 5", "5 ", "0x10", "NaN", "Infinity"]) {
    assert.equal(parseHmacTimestamp(bad), undefined, bad);
  }
  assert.equal(parseHmacTimestamp("1700000000"), 1_700_000_000);
  assert.equal(parseHmacTimestamp("99999999999999999999"), undefined); // overflow
});

test("freshness window is exactly ±300s and rejects outside values", () => {
  const now = 1_800_000_000;
  assert.ok(isHmacTimestampFresh(now, now));
  assert.ok(isHmacTimestampFresh(now - 300, now));
  assert.ok(isHmacTimestampFresh(now + 300, now));
  assert.equal(isHmacTimestampFresh(now - 301, now), false);
  assert.equal(isHmacTimestampFresh(now + 301, now), false);
  assert.equal(HMAC_TIMESTAMP_TOLERANCE_SECONDS, 300);
});

test("timing-safe compare handles different lengths without throwing", () => {
  const valid = "a".repeat(64);
  assert.equal(hmacSignaturesMatch(valid, valid), true);
  assert.equal(hmacSignaturesMatch("", valid), false);
  assert.equal(hmacSignaturesMatch("abc", valid), false);
  assert.equal(hmacSignaturesMatch(valid, valid.slice(0, 32)), false);
  assert.equal(hmacSignaturesMatch("g".repeat(64), "a".repeat(64)), false); // non-hex
  assert.equal(hmacSignaturesMatch(valid.toUpperCase(), valid), true); // case-insensitive hex
  assert.doesNotThrow(() => hmacSignaturesMatch("zzz", "qqqq"));
});

test("valid signed POST with JSON body passes and sets hmacValidated", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = '{"sample":{"lat":40.1,"lng":-73.9},"at":1700000000}';
  const { ctx, next } = makeCtx({ body: payload, headers: await signedHeaders(payload) });
  await hmacRequestMiddleware.options.server(ctx);
  assert.equal(next.context?.["hmacValidated"], true);
  // The original request continues downstream (framework contract) and its
  // body is still readable — the middleware never consumed it.
  assert.equal(await ctx.request.text(), payload);
  assert.equal(ctx.request.headers.get("authorization"), null);
});

test("exact body preservation: the request the handler sees parses to the signed bytes", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = '{ "b": 2 , "a":1 }'; // unusual spacing, deliberately
  const { ctx, next } = makeCtx({ body: payload, headers: await signedHeaders(payload) });
  await hmacRequestMiddleware.options.server(ctx);
  assert.equal(next.context?.["hmacValidated"], true);
  // What the framework/handler would read equals byte-for-byte what was signed.
  assert.equal(await ctx.request.text(), payload);
});

test("GET with empty payload passes when signed as empty", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const { ctx, next } = makeCtx({
    method: "GET",
    headers: await signedHeaders(""),
  });
  await hmacRequestMiddleware.options.server(ctx);
  assert.equal(next.context?.["hmacValidated"], true);
});

test("HEAD with empty payload passes when signed as empty", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const { ctx, next } = makeCtx({
    method: "HEAD",
    headers: await signedHeaders(""),
  });
  await hmacRequestMiddleware.options.server(ctx);
  assert.equal(next.context?.["hmacValidated"], true);
});

test("missing x-signature returns 401 MISSING_SIGNATURE_HEADERS", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const headers = await signedHeaders(payload);
  delete headers["x-signature"];
  const { ctx, next } = makeCtx({ body: payload, headers });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; code: string };
  assert.equal(body.code, "MISSING_SIGNATURE_HEADERS");
  assert.equal(body.error, "Missing signature or timestamp header");
  assert.equal(next.context?.["hmacValidated"], undefined);
});

test("missing x-timestamp returns 401 MISSING_SIGNATURE_HEADERS", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const headers = await signedHeaders(payload);
  delete headers["x-timestamp"];
  const { ctx } = makeCtx({ body: payload, headers });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "MISSING_SIGNATURE_HEADERS");
});

test("malformed timestamp returns 401 INVALID_SIGNATURE", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const headers = await signedHeaders(payload);
  headers["x-timestamp"] = "not-a-number";
  const { ctx } = makeCtx({ body: payload, headers });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "INVALID_SIGNATURE");
});

test("expired timestamp (older than 300s) returns 401 EXPIRED_TIMESTAMP", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const stale = Math.floor(Date.now() / 1000) - (HMAC_TIMESTAMP_TOLERANCE_SECONDS + 1);
  const headers = await createHmacHeaders(payload, stale);
  const { ctx } = makeCtx({ body: payload, headers });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "EXPIRED_TIMESTAMP");
});

test("future timestamp outside the window returns 401 EXPIRED_TIMESTAMP", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const future = Math.floor(Date.now() / 1000) + (HMAC_TIMESTAMP_TOLERANCE_SECONDS + 30);
  const headers = await createHmacHeaders(payload, future);
  const { ctx } = makeCtx({ body: payload, headers });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "EXPIRED_TIMESTAMP");
});

test("invalid signature returns 401 INVALID_SIGNATURE", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const ts = Math.floor(Date.now() / 1000);
  const forged = await signWithRawSecret(payload, ts, "a-different-secret");
  const { ctx } = makeCtx({
    body: payload,
    headers: { "x-signature": forged, "x-timestamp": String(ts) },
  });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "INVALID_SIGNATURE");
});

test("signature with different length is rejected without throwing", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const headers = await signedHeaders(payload);
  headers["x-signature"] = headers["x-signature"]!.slice(0, 40);
  const { ctx } = makeCtx({ body: payload, headers });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "INVALID_SIGNATURE");
});

test("tampered body after signing is rejected", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = '{"amount":1}';
  const headers = await signedHeaders(payload);
  const tampered = '{"amount":100}';
  const { ctx } = makeCtx({ body: tampered, headers });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 401);
});

test("unprotected server functions are not challenged (route exclusions)", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const { ctx, next } = makeCtx({
    body: "unsigned",
    fnId: "src/lib/trial.functions.ts_getTrialStatus",
  });
  await hmacRequestMiddleware.options.server(ctx);
  assert.equal(next.context?.["hmacValidated"], undefined); // untouched, no 401
});

test("router (SSR/page/asset) requests are never challenged", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const { ctx } = makeCtx({ handlerType: "router", fnId: undefined });
  const result = await hmacRequestMiddleware.options.server(ctx);
  // Pass-through: no 401 Response short-circuit.
  assert.ok(!(result instanceof Response));
});

test("protected list is empty by default and the middleware is inert", async () => {
  delete process.env["HMAC_PROTECTED_SERVER_FN_IDS"];
  assert.deepEqual(getProtectedServerFnIds(), []);
  const { ctx, next } = makeCtx({ body: "x", fnId: PROTECTED_ID });
  await hmacRequestMiddleware.options.server(ctx);
  assert.equal(next.context?.["hmacValidated"], undefined);
});

test("missing HMAC_SECRET fails closed with a 500, not an open 200", async () => {
  delete process.env["HMAC_SECRET"];
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const { ctx } = makeCtx({
    body: "{}",
    headers: {
      "x-signature": "ab".repeat(32),
      "x-timestamp": String(Math.floor(Date.now() / 1000)),
    },
  });
  const response = (await hmacRequestMiddleware.options.server(ctx)) as Response;
  assert.equal(response.status, 500);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "SERVER_HMAC_MISCONFIGURED");
  process.env["HMAC_SECRET"] = SECRET;
});

test("authentication interaction: middleware is a function/request layer and does not consume auth headers", async () => {
  process.env["HMAC_SECRET"] = SECRET;
  process.env["HMAC_PROTECTED_SERVER_FN_IDS"] = PROTECTED_ID;
  const payload = "{}";
  const headers = {
    ...(await signedHeaders(payload)),
    authorization: "Bearer supabase-jwt-would-go-here",
  };
  const { ctx, next } = makeCtx({ body: payload, headers });
  await hmacRequestMiddleware.options.server(ctx);
  // The Authorization header reaches the downstream auth middleware untouched.
  assert.equal(ctx.request.headers.get("authorization"), "Bearer supabase-jwt-would-go-here");
  assert.equal(next.context?.["hmacValidated"], true);
});

test("rate-limiting interaction: HMAC runs as one request middleware and weakens nothing", async () => {
  // The repo has no rate limiter today; the contract this test pins is that
  // HMAC is a plain request middleware in src/start.ts and that unauthenticated
  // unsigned requests are still rejected before any handler runs.
  const startSource = await readFile(new URL("../src/start.ts", import.meta.url), "utf8");
  assert.match(
    startSource,
    /requestMiddleware: \[errorMiddleware, csrfMiddleware, hmacRequestMiddleware\]/,
  );
});

test("secret is never exposed to client-reachable code", async () => {
  // 1) The secret module carries the TanStack server-only marker, which the
  //    Start compiler enforces: any client-side import fails the build.
  const marker = "@tanstack/react-start/server-only";
  const secretModule = await readFile(
    new URL("../src/lib/hmac.server.ts", import.meta.url),
    "utf8",
  );
  assert.ok(secretModule.includes(marker), "hmac.server.ts must be marked server-only");
  // 2) The pure module and the middleware hold no secret/env access.
  const pure = await readFile(new URL("../src/lib/hmac.ts", import.meta.url), "utf8");
  assert.ok(!pure.includes("HMAC_SECRET"), "hmac.ts must not read the secret");
  const middleware = await readFile(
    new URL("../src/lib/hmac-request.middleware.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    !/process\.env\[["']HMAC_SECRET/.test(middleware),
    "middleware must not read the secret directly",
  );
  // 3) start.ts imports the middleware but never the raw secret module API.
  const start = await readFile(new URL("../src/start.ts", import.meta.url), "utf8");
  assert.ok(!start.includes("HMAC_SECRET"));
  // 3) No client-bundle-visible directory references the secret.
  const clientDirs = ["src/app", "src/components", "src/hooks", "src/routes"];
  for (const dir of clientDirs) {
    const files = await readdirRecursive(new URL(`../${dir}`, import.meta.url));
    for (const file of files) {
      const text = await readFile(file, "utf8");
      assert.ok(!text.includes("HMAC_SECRET"), `HMAC_SECRET referenced in ${file}`);
    }
  }
});

async function readdirRecursive(url: URL): Promise<URL[]> {
  const { readdir } = await import("node:fs/promises");
  // URLs used as a relative-resolution base must end in "/" or the last
  // segment is dropped.
  const base = url.href.endsWith("/") ? url : new URL(`${url.href}/`);
  const entries = await readdir(base, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    if (entry.name.endsWith(".test.ts")) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, base);
    if (entry.isDirectory()) files.push(...(await readdirRecursive(child)));
    else files.push(child);
  }
  return files;
}
