/**
 * Emergency backend stabilization — regression tests.
 *
 * Failure class being guarded against:
 *   Normal membership resolution (getTrialStatus) previously called
 *   requireAdminKey() + supabaseAdmin, so every sign-in failed with
 *   "Privileged operation requires SVJ_SUPABASE_SECRET_KEY or
 *   SUPABASE_SERVICE_ROLE_KEY" on the Lovable-managed backend where no
 *   service-role key exists.
 *
 * Invariants under test:
 *   1. trial.functions.ts contains NO admin-key dependency and NO admin-client
 *      access — membership reads go through the authenticated middleware and
 *      the svj_get_my_membership RPC only.
 *   2. Privileged operations (account.functions) still fail closed without an
 *      admin key — requireAdminKey must remain in place there.
 *   3. The migration's RPC contract: no user_id parameter, no email leakage,
 *      identity derived server-side via auth.uid().
 *   4. The backend URL remains the authoritative oltm project; zdoj is never
 *      referenced by runtime configuration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");

function readSource(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("membership resolution does not require an admin key", () => {
  it("getTrialStatus has no requireAdminKey / admin-client dependency", () => {
    const src = readSource("src/lib/trial.functions.ts");

    // Strip comments so documentation about the old architecture doesn't
    // trip the source-level assertions — only executable code must be clean.
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

    assert.ok(
      !code.includes("requireAdminKey"),
      "trial.functions.ts must not call requireAdminKey for membership reads",
    );
    assert.ok(
      !code.includes("supabaseAdmin"),
      "trial.functions.ts must not use the admin client for membership reads",
    );
    assert.ok(
      !code.includes("SVJ_SUPABASE_SECRET_KEY") && !code.includes("SUPABASE_SERVICE_ROLE_KEY"),
      "trial.functions.ts must not reference admin key env vars",
    );
    // Must go through the authenticated middleware (user's own JWT, RLS applies).
    assert.ok(
      src.includes("requireSupabaseAuth"),
      "getTrialStatus must run behind the authenticated-user middleware",
    );
    // Must resolve via the self-service RPC, not arbitrary profile queries.
    assert.ok(
      src.includes('rpc("svj_get_my_membership")'),
      "getTrialStatus must resolve membership via the svj_get_my_membership RPC",
    );
    // Never forwards a client-controlled user id to the RPC.
    assert.ok(
      !src.includes("p_user_id") && !src.includes('eq("id"'),
      "membership resolution must not query profiles by a caller-supplied id",
    );
  });

  it("the RPC migration derives identity from auth.uid() and leaks no email", () => {
    const migrations = readSource("supabase/migrations/20260917000000_my_membership_rpc.sql");

    assert.ok(
      migrations.includes("auth.uid()"),
      "svj_get_my_membership must derive identity from auth.uid()",
    );
    assert.ok(
      !migrations.includes("p_user_id"),
      "svj_get_my_membership must take no user_id parameter",
    );
    // Return-shape guard: email must not be part of the RPC output.
    const returnsBlock = migrations.slice(
      migrations.indexOf("RETURNS TABLE"),
      migrations.indexOf("LANGUAGE plpgsql"),
    );
    assert.ok(
      !/\bemail\b/.test(returnsBlock),
      "svj_get_my_membership must not return email addresses",
    );
    assert.ok(
      migrations.includes("SECURITY DEFINER") && migrations.includes("SET search_path = public"),
      "svj_get_my_membership must be SECURITY DEFINER with a safe search_path",
    );
    assert.ok(
      migrations.includes(
        "REVOKE ALL ON FUNCTION public.svj_get_my_membership() FROM PUBLIC, anon",
      ) &&
        migrations.includes(
          "GRANT EXECUTE ON FUNCTION public.svj_get_my_membership() TO authenticated",
        ),
      "svj_get_my_membership must be revoked from PUBLIC/anon and granted to authenticated only",
    );
  });

  it("membership failure surfaces a safe retryable message, not a key error", () => {
    const gate = readSource("src/app/components/TrialGate.tsx");
    // The error card must offer a retry path and stay generic (no secrets/stack).
    assert.ok(gate.includes("Retry"), "TrialGate must offer Retry on membership errors");
    assert.ok(
      gate.includes("Could not verify your membership"),
      "TrialGate must render the recoverable membership error state",
    );
  });

  it("privilege escalation guards: TrialGate consumes only server-checked status", () => {
    const gate = readSource("src/app/components/TrialGate.tsx");
    // Entitlement must come from the server status object, never localStorage.
    assert.ok(
      gate.includes("status.plusActive") || gate.includes("statusQuery.data"),
      "TrialGate must use the server-authoritative status object",
    );
    const gateCode = gate
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    assert.ok(
      !gateCode.includes("localStorage"),
      "TrialGate must not derive entitlement from localStorage",
    );
  });
});

describe("privileged operations still fail closed without an admin key", () => {
  it("account deletion keeps requireAdminKey", () => {
    const src = readSource("src/lib/account.functions.ts");
    assert.ok(
      src.includes("requireAdminKey()"),
      "privileged account deletion must still require an admin key",
    );
  });

  it("engagement server operations keep requireAdminKey", () => {
    const src = readSource("src/lib/engagement.server.ts");
    assert.ok(
      src.includes("requireAdminKey()"),
      "privileged engagement writes must still require an admin key",
    );
  });
});

describe("runtime configuration points at the authoritative backend", () => {
  it("auth middleware keeps the oltm project as fallback and never mentions zdoj", () => {
    const middleware = readSource("src/integrations/supabase/auth-middleware.ts");
    assert.ok(
      middleware.includes("oltmnrkceodpyqznfhjb"),
      "auth middleware fallback must remain the authoritative oltm backend",
    );
    assert.ok(
      !middleware.includes("zdojqqilwnljzpqdshca"),
      "runtime configuration must not reference the zdoj project",
    );
  });

  it("server client keeps the oltm project as fallback and never mentions zdoj", () => {
    const server = readSource("src/integrations/supabase/client.server.ts");
    assert.ok(
      server.includes("oltmnrkceodpyqznfhjb"),
      "server client fallback must remain the authoritative oltm backend",
    );
    assert.ok(
      !server.includes("zdojqqilwnljzpqdshca"),
      "runtime configuration must not reference the zdoj project",
    );
  });
});
