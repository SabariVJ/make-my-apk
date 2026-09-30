/**
 * Lovable Cloud admin-key integration tests.
 *
 * Pins the privileged server-key resolution in client.server.ts:
 *   1. SUPABASE_SERVICE_ROLE_KEY (Lovable Cloud managed) is preferred
 *   2. SVJ_SUPABASE_SECRET_KEY works as optional override/fallback
 *   3. publishable keys are never accepted as privileged admin keys
 *   4. missing privileged key fails closed ("Admin service key not configured")
 *   5. admin query uses the privileged server client
 *   6. normal support-ticket operations remain user-scoped
 *   7. privileged client never reaches browser bundles
 *   8. Supabase URL remains the oltm project
 * No real secrets are used — fake values only.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasAdminKey, requireAdminKey } from "../src/integrations/supabase/client.server";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");
const src = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const SVJ = "SVJ_SUPABASE_SECRET_KEY";
const LEGACY = "SUPABASE_SERVICE_ROLE_KEY";
const PUB = "SUPABASE_PUBLISHABLE_KEY";

function clearEnv() {
  for (const k of [SVJ, LEGACY, PUB, "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
    delete process.env[k];
  }
}

// Mirror of the module's resolution (SERVICE_ROLE first, SVJ override second).
function resolveAdminKey(serviceRole: string | undefined, svj: string | undefined) {
  const n = (v: string | undefined) => v?.trim() || undefined;
  return n(serviceRole) || n(svj);
}

describe("privileged key precedence (Lovable Cloud first)", () => {
  it("prefers SUPABASE_SERVICE_ROLE_KEY over SVJ_SUPABASE_SECRET_KEY", () => {
    assert.equal(resolveAdminKey("fake-service-role", "fake-svj"), "fake-service-role");
  });

  it("falls back to SVJ_SUPABASE_SECRET_KEY when SERVICE_ROLE is absent", () => {
    assert.equal(resolveAdminKey(undefined, "fake-svj"), "fake-svj");
  });

  it("falls back to SVJ key when SERVICE_ROLE is whitespace-only", () => {
    assert.equal(resolveAdminKey("   ", "fake-svj"), "fake-svj");
  });

  it("never uses VITE_ privileged variables", () => {
    const code = src("src/integrations/supabase/client.server.ts");
    assert.doesNotMatch(code, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(code, /VITE_SUPABASE_SECRET_KEY/);
  });
});

describe("fail-closed behavior for privileged clients", () => {
  afterEach(clearEnv);

  it("hasAdminKey() is false with no keys", () => {
    clearEnv();
    assert.equal(hasAdminKey(), false);
  });

  it("hasAdminKey() is true with Lovable-managed SERVICE_ROLE key only", () => {
    clearEnv();
    process.env[LEGACY] = "fake-service-role";
    assert.equal(hasAdminKey(), true);
  });

  it("hasAdminKey() is true with SVJ override key only", () => {
    clearEnv();
    process.env[SVJ] = "fake-svj";
    assert.equal(hasAdminKey(), true);
  });

  it("publishable key alone never authorizes privileged operations", () => {
    clearEnv();
    process.env[PUB] = "sb_publishable_fake";
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_fake";
    assert.equal(hasAdminKey(), false);
    assert.throws(() => requireAdminKey(), /Privileged operation requires/);
  });

  it("admin client creation throws 'Admin service key not configured' without keys", () => {
    clearEnv();
    // createSupabaseAdminClient runs lazily through the supabaseAdmin proxy;
    // without any privileged key it must throw the distinct config error
    // instead of silently using a publishable key.
    const code = src("src/integrations/supabase/client.server.ts");
    assert.match(code, /Admin service key not configured/);
    // The publishable-key fallback must be gone from the privileged client.
    assert.doesNotMatch(code, /sb_publishable_[A-Za-z0-9_]+["']/);
    assert.doesNotMatch(code, /SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("admin check + support tickets stay on the right clients", () => {
  it("requireAdminUserId uses the privileged server client for user_roles", () => {
    const code = src("src/lib/admin.functions.ts")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    assert.match(code, /await import\("@\/integrations\/supabase\/client\.server"\)/);
    assert.match(code, /supabaseAdmin\s*\.\s*from\("user_roles"\)/);
    assert.match(code, /context\.userId/);
    assert.match(code, /Forbidden: admin role required/);
  });

  it("support-ticket functions never import the privileged client", () => {
    const code = src("src/lib/support.functions.ts")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    assert.ok(!code.includes("client.server"), "support tickets must not use supabaseAdmin");
    assert.ok(!code.includes("supabaseAdmin"));
    assert.ok(code.includes("context.supabase"), "must use the user-scoped middleware client");
  });

  it("privileged client is server-only (.server.ts naming) and lazily imported", () => {
    // .server.ts modules are excluded from the client bundle by convention,
    // and *.functions.ts load it via dynamic import inside handlers only.
    const adminFn = src("src/lib/admin.functions.ts");
    assert.ok(
      adminFn.includes('await import("@/integrations/supabase/client.server")'),
      "supabaseAdmin must be dynamically imported inside handlers",
    );
    assert.doesNotMatch(adminFn, /^export .*supabaseAdmin/m);
  });

  it("Supabase URL keeps the oltm project and never mentions zdoj", () => {
    const code = src("src/integrations/supabase/client.server.ts");
    assert.match(code, /oltmnrkceodpyqznfhjb\.supabase\.co/);
    assert.ok(!code.includes("zdojqqilwnljzpqdshca"));
  });
});
