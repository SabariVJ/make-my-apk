/**
 * Regression tests for the admin/support server-function auth fixes.
 *
 * Failure class being guarded against:
 *   1. Server handlers calling supabase.auth.getSession() — the SSR server
 *      client has no persisted session, so the resolved uid was always
 *      undefined and admin support-ticket calls failed with "Unauthorized".
 *      Identity must come from requireSupabaseAuth's context.userId instead.
 *   2. requireAdminUserId conflating a missing service key (which silently
 *      falls back to the publishable key and RLS-filters every row) with a
 *      genuine "no admin role" result, and swallowing the query error object.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");

function readSource(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("support server handlers use middleware context, not getSession()", () => {
  const code = readSource("src/lib/support.functions.ts")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

  it("no server handler calls supabase.auth.getSession()", () => {
    assert.ok(
      !code.includes("auth.getSession()"),
      "server handlers must resolve identity from context.userId, not getSession()",
    );
  });

  it("handlers derive the caller's uid from requireSupabaseAuth context.userId", () => {
    const userIdUses = code.match(/context\.userId/g) ?? [];
    assert.ok(userIdUses.length >= 3, "every handler that needs identity must use context.userId");
  });

  it("handlers use the middleware-provided user-scoped client", () => {
    const clientUses = code.match(/context\.supabase/g) ?? [];
    assert.ok(clientUses.length >= 4, "each handler must use context.supabase");
  });

  it("keeps the server-side admin role re-checks for both admin ticket calls", () => {
    const forbidden = code.match(/Forbidden: admin role required/g) ?? [];
    assert.ok(forbidden.length >= 2, "admin list/update must both re-check the role");
  });

  it("keeps the profiles embed through the explicit FK name", () => {
    assert.match(code, /profiles!support_tickets_user_id_profiles_fkey\(username, email\)/);
  });
});

describe("requireAdminUserId fails closed with distinct, logged errors", () => {
  const code = readSource("src/lib/admin.functions.ts")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

  it("throws a distinct error when the admin service key is not configured", () => {
    assert.match(code, /if \(!hasAdminKey\(\)\)/);
    assert.match(code, /throw new Error\("Admin service key not configured"\)/);
  });

  it("logs the query error object before the Forbidden throw", () => {
    assert.match(
      code,
      /if \(error\) \{\s*console\.error\("[^"]*user_roles query failed", error\);\s*\}/,
    );
  });

  it("still throws Forbidden: admin role required when no role row is found", () => {
    assert.match(code, /if \(error \|\| !data\)/);
    assert.match(code, /throw new Error\("Forbidden: admin role required"\)/);
  });
});
