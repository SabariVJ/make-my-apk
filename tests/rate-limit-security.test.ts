// Rate-limit security tests (see docs/SVJ_RATE_LIMITING.md).
//
// The middleware is exercised exactly as TanStack Start's request pipeline
// invokes it: a Request, handlerType/serverFnMeta, and a `next` recorder.
// Clock and store isolation are controlled per test via a fresh global store.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildRateLimitKey,
  classifyServerFnId,
  decodeJwtSub,
  evaluateFixedWindow,
  normalizeIp,
  strictestCategory,
} from "../src/lib/rate-limit";
import { rateLimitRequestMiddleware } from "../src/lib/rate-limit-request.middleware";

const SENSITIVE_ID = "src/lib/account.functions.ts_deleteAccount";
const EXPENSIVE_ID = "src/lib/nutrition.functions.ts_analyzeMealPhoto";
const DEFAULT_ID = "src/lib/trial.functions.ts_getTrialStatus";

function base64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build an UNVERIFIABLE bearer token (garbage signature) — bucketing only. */
function bearerWithSub(sub: string): string {
  return `Bearer ${base64Url('{"alg":"HS256"}')}.${base64Url(JSON.stringify({ sub }))}.invalid-signature`;
}

type TestCtx = Parameters<typeof rateLimitRequestMiddleware.options.server>[0];

function makeCtx(options: {
  ip?: string;
  authorization?: string | null;
  fnId?: string;
  handlerType?: "serverFn" | "router";
  now?: number;
  extraHeaders?: Record<string, string>;
}): { ctx: TestCtx; next: { context?: Record<string, unknown>; called: boolean } } {
  const headers = new Headers(options.extraHeaders);
  if (options.authorization !== undefined) {
    if (options.authorization !== null) headers.set("authorization", options.authorization);
  }
  if (options.ip) {
    headers.set("cf-connecting-ip", options.ip);
  }
  const request = new Request("https://svj.example/_server/", { method: "POST", headers });
  // Expose a runtime socket IP only when no edge header was set — mirroring
  // production, where cf-connecting-ip and the runtime address coexist but
  // the edge header wins.
  if (!options.ip) {
    (request as Request & { ip?: string }).ip = "10.0.0.1";
  }
  const next = { context: undefined as Record<string, unknown> | undefined, called: false };
  const handlerType = options.handlerType ?? "serverFn";
  const ctx = {
    request,
    pathname: "/_server/",
    context: {},
    handlerType,
    serverFnMeta:
      handlerType === "serverFn" && options.fnId !== undefined
        ? { id: options.fnId, name: "fn", filename: "src/lib/x.functions.ts" }
        : undefined,
    next: async (opts?: { context?: Record<string, unknown> }) => {
      next.called = true;
      next.context = opts?.context;
      return {
        request,
        pathname: ctx.pathname,
        context: ctx.context,
        response: new Response("ok"),
      };
    },
  };
  return { ctx: ctx as unknown as TestCtx, next };
}

/** Fresh store per test: re-read config from the test's env and reset the store. */
async function freshStore() {
  const { resetRateLimitConfigForTests } = await import("../src/lib/rate-limit.server");
  process.env["RATE_LIMIT_ENABLED"] = "true";
  process.env["RATE_LIMIT_DEFAULT_MAX"] = "3";
  process.env["RATE_LIMIT_SENSITIVE_MAX"] = "2";
  process.env["RATE_LIMIT_EXPENSIVE_MAX"] = "2";
  process.env["RATE_LIMIT_EXPENSIVE_WINDOW_SECONDS"] = "3600";
  process.env["RATE_LIMIT_MAX_BUCKETS"] = "10";
  process.env["RATE_LIMIT_SWEEP_INTERVAL_SECONDS"] = "1";
  resetRateLimitConfigForTests();
}

async function run(ctx: TestCtx): Promise<Response | { request: unknown }> {
  const result = (await rateLimitRequestMiddleware.options.server(ctx)) as
    Response | { request: unknown };
  return result;
}

test("classification uses only real function ids", () => {
  assert.equal(classifyServerFnId(SENSITIVE_ID), "sensitive");
  assert.equal(classifyServerFnId("src/lib/trial.functions.ts_redeemPlusCode"), "sensitive");
  assert.equal(classifyServerFnId(EXPENSIVE_ID), "expensive");
  assert.equal(classifyServerFnId(DEFAULT_ID), "default");
  assert.equal(classifyServerFnId("src/lib/unknown.functions.ts_whatever"), "default");
  assert.equal(strictestCategory("expensive", "sensitive"), "sensitive");
});

test("requests below the limit succeed and the context is marked", async () => {
  await freshStore();
  const { ctx, next } = makeCtx({ ip: "1.2.3.4", fnId: DEFAULT_ID });
  const result = await run(ctx);
  console.log(
    "DBG-REAL:",
    next.called,
    JSON.stringify(next.context),
    result instanceof Response ? "Response" : "ctx",
    "meta:",
    JSON.stringify((ctx as { serverFnMeta?: unknown }).serverFnMeta),
    "handlerType:",
    (ctx as { handlerType?: unknown }).handlerType,
  );
  assert.ok(!(result instanceof Response));
  assert.equal(next.called, true);
  assert.equal(next.context?.["rateLimitCategory"], "default");
});

test("request at the limit succeeds, above the limit returns 429 RATE_LIMITED", async () => {
  await freshStore(); // default max = 3
  const first = makeCtx({ ip: "1.2.3.4", fnId: DEFAULT_ID });
  const second = makeCtx({ ip: "1.2.3.4", fnId: DEFAULT_ID });
  const third = makeCtx({ ip: "1.2.3.4", fnId: DEFAULT_ID });
  const fourth = makeCtx({ ip: "1.2.3.4", fnId: DEFAULT_ID });
  await run(first.ctx);
  await run(second.ctx);
  const atLimit = (await run(third.ctx)) as Response | object;
  assert.ok(!(atLimit instanceof Response) || atLimit.status !== 429, "3rd request should pass");
  const blocked = (await run(fourth.ctx)) as Response;
  assert.ok(blocked instanceof Response);
  assert.equal(blocked.status, 429);
  const body = (await blocked.json()) as { error: string; code: string };
  assert.equal(body.error, "Too many requests");
  assert.equal(body.code, "RATE_LIMITED");
});

test("429 includes a correct Retry-After and RateLimit headers", async () => {
  await freshStore(); // sensitive max = 2
  for (let i = 0; i < 2; i += 1) await run(makeCtx({ ip: "5.6.7.8", fnId: SENSITIVE_ID }).ctx);
  const blocked = (await run(makeCtx({ ip: "5.6.7.8", fnId: SENSITIVE_ID }).ctx)) as Response;
  assert.equal(blocked.status, 429);
  const retryAfter = Number(blocked.headers.get("retry-after"));
  assert.ok(
    Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60,
    `retry-after=${retryAfter}`,
  );
  assert.equal(blocked.headers.get("ratelimit-limit"), "2");
  assert.equal(blocked.headers.get("ratelimit-remaining"), "0");
});

test("authenticated identity keys on the sub claim + IP; forgery self-limits", async () => {
  await freshStore();
  // Exhaust the victim's bucket.
  for (let i = 0; i < 2; i += 1) {
    await run(
      makeCtx({ ip: "9.9.9.9", fnId: SENSITIVE_ID, authorization: bearerWithSub("victim") }).ctx,
    );
  }
  const victimBlocked = (await run(
    makeCtx({ ip: "9.9.9.9", fnId: SENSITIVE_ID, authorization: bearerWithSub("victim") }).ctx,
  )) as Response;
  assert.ok(victimBlocked instanceof Response && victimBlocked.status === 429);
  // The same IP with a DIFFERENT sub is unaffected (their own bucket)…
  const otherOk = (await run(
    makeCtx({ ip: "9.9.9.9", fnId: SENSITIVE_ID, authorization: bearerWithSub("other") }).ctx,
  )) as Response | object;
  assert.ok(!(otherOk instanceof Response) || otherOk.status !== 429);
  // …and the attacker's forged-victim request from their own IP is unaffected too.
  const forgedOk = (await run(
    makeCtx({ ip: "8.8.8.8", fnId: SENSITIVE_ID, authorization: bearerWithSub("victim") }).ctx,
  )) as Response | object;
  assert.ok(!(forgedOk instanceof Response) || forgedOk.status !== 429);
});

test("unauthenticated identity keys on IP; IPv4 and IPv6 are distinct", async () => {
  await freshStore();
  await run(makeCtx({ ip: "192.168.1.1", fnId: DEFAULT_ID }).ctx);
  await run(makeCtx({ ip: "192.168.1.1", fnId: DEFAULT_ID }).ctx);
  const exhaustedV4 = (await run(makeCtx({ ip: "192.168.1.1", fnId: DEFAULT_ID }).ctx)) as
    Response | object;
  assert.ok(!(exhaustedV4 instanceof Response) || exhaustedV4.status !== 429);
  // A different IPv4 client is a different bucket.
  const otherV4 = (await run(makeCtx({ ip: "192.168.1.2", fnId: DEFAULT_ID }).ctx)) as
    Response | object;
  assert.ok(!(otherV4 instanceof Response) || otherV4.status !== 429);
  // IPv6 (bracketed, uppercased, zoned) normalizes to one bucket.
  const keyA = buildRateLimitKey("default", "[2001:DB8::1]:443", null);
  const keyB = buildRateLimitKey("default", "2001:db8::1%eth0", null);
  assert.equal(keyA, keyB);
  // IPv4-mapped IPv6 collapses to the IPv4 form.
  assert.equal(normalizeIp("::ffff:192.168.1.1"), "192.168.1.1");
});

test("spoofed forwarded-IP headers are ignored", async () => {
  await freshStore();
  // A client-supplied X-Forwarded-For must NOT create a fresh bucket.
  for (let i = 0; i < 3; i += 1) {
    await run(
      makeCtx({
        ip: "7.7.7.7",
        fnId: DEFAULT_ID,
        extraHeaders: { "x-forwarded-for": `10.10.10.${i}`, "x-real-ip": `10.10.10.${i}` },
      }).ctx,
    );
  }
  const blocked = (await run(
    makeCtx({
      ip: "7.7.7.7",
      fnId: DEFAULT_ID,
      extraHeaders: { "x-forwarded-for": "10.10.10.99" },
    }).ctx,
  )) as Response;
  assert.ok(
    blocked instanceof Response && blocked.status === 429,
    "spoofed header must not bypass",
  );
});

test("route categories apply different policies", async () => {
  await freshStore();
  // Sensitive (max 2) blocks on the 3rd request…
  await run(makeCtx({ ip: "3.3.3.3", fnId: SENSITIVE_ID }).ctx);
  await run(makeCtx({ ip: "3.3.3.3", fnId: SENSITIVE_ID }).ctx);
  const sensitiveBlocked = (await run(
    makeCtx({ ip: "3.3.3.3", fnId: SENSITIVE_ID }).ctx,
  )) as Response;
  assert.ok(sensitiveBlocked instanceof Response && sensitiveBlocked.status === 429);
  // …but the default policy (max 3) on the same identity still has room.
  const defaultOk = (await run(makeCtx({ ip: "3.3.3.3", fnId: DEFAULT_ID }).ctx)) as
    Response | object;
  assert.ok(!(defaultOk instanceof Response) || defaultOk.status !== 429);
});

test("expensive endpoint policy blocks before the handler (and its external AI call)", async () => {
  await freshStore();
  await run(makeCtx({ ip: "4.4.4.4", fnId: EXPENSIVE_ID }).ctx);
  await run(makeCtx({ ip: "4.4.4.4", fnId: EXPENSIVE_ID }).ctx);
  const { ctx, next } = makeCtx({ ip: "4.4.4.4", fnId: EXPENSIVE_ID });
  const blocked = (await run(ctx)) as Response;
  assert.ok(blocked instanceof Response && blocked.status === 429);
  assert.equal(next.called, false, "handler (and its AI gateway call) must not run");
  assert.equal(blocked.headers.get("ratelimit-limit"), "2");
});

test("fixed-window rolls over after the window elapses", () => {
  const policy = { max: 2, windowSeconds: 60 };
  const first = evaluateFixedWindow(undefined, policy, 1000);
  assert.equal(first.decision.allowed, true);
  const second = evaluateFixedWindow(first.next, policy, 1030);
  assert.equal(second.decision.allowed, true);
  const third = evaluateFixedWindow(second.next, policy, 1040);
  assert.equal(third.decision.allowed, false);
  assert.equal(third.decision.retryAfterSeconds, 60 - 40);
  // Window rolls over at 1060.
  const rolled = evaluateFixedWindow(second.next, policy, 1060);
  assert.equal(rolled.decision.allowed, true);
  assert.equal(rolled.next.count, 1);
});

test("stale entries are cleaned up and memory is bounded", async () => {
  await freshStore();
  // Hammer many unique IPs; the store caps at RATE_LIMIT_MAX_BUCKETS = 10.
  for (let i = 0; i < 50; i += 1) {
    await run(makeCtx({ ip: `10.1.${Math.floor(i / 256)}.${i % 256}`, fnId: DEFAULT_ID }).ctx);
  }
  const { getStoreForTests } = await import("../src/lib/rate-limit.server");
  const store = getStoreForTests();
  assert.ok(store.size <= 10, `store size ${store.size} must be bounded`);
  // Expired windows are dropped by the sweep: jump far past the real clock.
  const { setNowForTests } = await import("../src/lib/rate-limit.server");
  setNowForTests(Math.floor(Date.now() / 1000) + 3_600);
  await run(makeCtx({ ip: "11.1.1.1", fnId: DEFAULT_ID }).ctx);
  assert.ok(store.size < 10, "sweep must drop stale entries");
});

test("middleware does not limit router (pages/assets) requests", async () => {
  await freshStore();
  const { ctx, next } = makeCtx({ handlerType: "router", fnId: undefined });
  const result = await run(ctx);
  assert.ok(!(result instanceof Response));
  assert.equal(next.called, true);
});

test("disabling via env makes the middleware inert", async () => {
  const { resetRateLimitConfigForTests } = await import("../src/lib/rate-limit.server");
  await freshStore();
  process.env["RATE_LIMIT_ENABLED"] = "false";
  resetRateLimitConfigForTests();
  for (let i = 0; i < 10; i += 1) {
    const result = await run(makeCtx({ ip: "12.12.12.12", fnId: DEFAULT_ID }).ctx);
    assert.ok(!(result instanceof Response));
  }
});

test("interaction with authentication: auth headers pass through untouched", async () => {
  await freshStore();
  const token = bearerWithSub("someone");
  const { ctx, next } = makeCtx({ ip: "6.6.6.6", fnId: DEFAULT_ID, authorization: token });
  await run(ctx);
  assert.equal(ctx.request.headers.get("authorization"), token);
  assert.equal(next.called, true);
});

test("interaction with other request middleware: rate limiting runs after CSRF, before auth", async () => {
  const start = await readFile(new URL("../src/start.ts", import.meta.url), "utf8");
  // The shipped chain is error boundary → CSRF → rate limiting → HMAC →
  // per-function Supabase auth: throttling happens after the same-origin gate
  // and before any authenticated handler or HMAC verification.
  assert.match(
    start,
    /requestMiddleware:\s*\[[^\]]*errorMiddleware[\s\S]*?csrfMiddleware[\s\S]*?rateLimitRequestMiddleware[\s\S]*?hmacRequestMiddleware[\s\S]*?\],/,
  );
  const chain = start.match(/requestMiddleware:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const csrfPos = chain.indexOf("csrfMiddleware");
  const rateLimitPos = chain.indexOf("rateLimitRequestMiddleware");
  assert.ok(csrfPos >= 0 && rateLimitPos > csrfPos, "rate limiting runs after CSRF");
  // Rate limiting is a request middleware, never a function middleware: it
  // must not be able to gate or replace the per-function auth checks.
  assert.match(start, /functionMiddleware:\s*\[attachSupabaseAuth\]/);
  assert.doesNotMatch(start, /functionMiddleware:\s*\[[^\]]*rateLimitRequestMiddleware/);
});

test("no server-side rate-limit configuration reaches frontend code", async () => {
  // rate-limit.server.ts is marker-protected.
  const serverModule = await readFile(
    new URL("../src/lib/rate-limit.server.ts", import.meta.url),
    "utf8",
  );
  assert.match(serverModule, /@tanstack\/react-start\/server-only/);
  // Client-reachable directories never import the store or read its env vars.
  const clientDirs = ["src/app", "src/components", "src/hooks", "src/routes"];
  for (const dir of clientDirs) {
    const files = await listFiles(new URL(`../${dir}`, import.meta.url));
    for (const file of files) {
      const text = await readFile(file, "utf8");
      assert.ok(!text.includes("rate-limit.server"), `rate-limit.server imported in ${file}`);
      assert.ok(!text.includes("RATE_LIMIT_"), `rate-limit config referenced in ${file}`);
    }
  }
});

test("JWT sub decoding is defensive", () => {
  assert.equal(decodeJwtSub("not-a-jwt"), undefined);
  assert.equal(decodeJwtSub("a.b"), undefined);
  assert.equal(
    decodeJwtSub(`${base64Url('{"alg":"none"}')}.${base64Url('{"other":1}')}.x`),
    undefined,
  );
  assert.equal(
    decodeJwtSub(`${base64Url('{"alg":"none"}')}.${base64Url('{"sub":""}')}.x`),
    undefined,
  );
  assert.equal(
    decodeJwtSub(
      `${base64Url('{"alg":"none"}')}.${base64Url('{"sub":"' + "x".repeat(200) + '"}')}.x`,
    ),
    undefined,
  );
  assert.equal(
    decodeJwtSub(`${base64Url('{"alg":"none"}')}.${base64Url('{"sub":"abc"}')}.x`),
    "abc",
  );
});

async function listFiles(url: URL): Promise<URL[]> {
  const { readdir } = await import("node:fs/promises");
  const base = url.href.endsWith("/") ? url : new URL(`${url.href}/`);
  const entries = await readdir(base, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, base);
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child);
  }
  return files;
}
