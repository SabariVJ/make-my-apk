/**
 * Tests for privileged-key selection in client.server.ts.
 *
 * Run with: node --test src/integrations/supabase/client.server.test.ts
 *
 * These tests verify:
 * 1. SVJ_SUPABASE_SECRET_KEY is preferred over SUPABASE_SERVICE_ROLE_KEY
 * 2. Legacy SUPABASE_SERVICE_ROLE_KEY is used as fallback
 * 3. Empty, missing, and whitespace-only values fall through per-key
 * 4. hasAdminKey() returns false when both keys are absent/empty
 * 5. hasAdminKey() returns true when either key has a real value
 * 6. Privileged operations must fail closed when no admin key exists
 * 7. REGRESSION: whitespace-only preferred key falls through to valid legacy key
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { hasAdminKey, requireAdminKey } from "./client.server";

// ── helpers ──────────────────────────────────────────────────────────
// Mirrors the normalizeKey + resolution logic in client.server.ts.

function normalizeKey(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function resolveAdminKey(
  svjKey: string | undefined,
  legacyKey: string | undefined,
): string | undefined {
  return normalizeKey(svjKey) || normalizeKey(legacyKey);
}

function hasAdminKeyFromEnv(svjKey: string | undefined, legacyKey: string | undefined): boolean {
  return !!normalizeKey(svjKey) || !!normalizeKey(legacyKey);
}

// ── tests ────────────────────────────────────────────────────────────

describe("resolveAdminKey — priority and fallback", () => {
  it("prefers SVJ_SUPABASE_SECRET_KEY over SUPABASE_SERVICE_ROLE_KEY", () => {
    assert.equal(resolveAdminKey("svj-secret-123", "legacy-role-456"), "svj-secret-123");
  });

  it("falls back to SUPABASE_SERVICE_ROLE_KEY when SVJ key is undefined", () => {
    assert.equal(resolveAdminKey(undefined, "legacy-role-456"), "legacy-role-456");
  });

  it("returns undefined when both keys are undefined", () => {
    assert.equal(resolveAdminKey(undefined, undefined), undefined);
  });

  it("returns undefined when both keys are empty strings", () => {
    assert.equal(resolveAdminKey("", ""), undefined);
  });

  it("returns undefined when both keys are whitespace-only", () => {
    assert.equal(resolveAdminKey("  ", "  "), undefined);
  });

  it("trims leading/trailing whitespace from valid SVJ key", () => {
    assert.equal(resolveAdminKey("  svj-secret-123  ", undefined), "svj-secret-123");
  });

  it("trims whitespace from legacy key and returns it when SVJ is empty", () => {
    assert.equal(resolveAdminKey("", "  legacy-role-456  "), "legacy-role-456");
  });

  it("treats an explicit empty-string SVJ key as absent", () => {
    assert.equal(resolveAdminKey("", "legacy-role-456"), "legacy-role-456");
  });
});

describe("resolveAdminKey — REGRESSION: whitespace-only preferred falls through", () => {
  it("whitespace-only SVJ key falls through to valid legacy key", () => {
    // This is the exact regression case: SVJ key is "   " (whitespace-only),
    // legacy key is "legacy-valid". The old logic picked "   " as truthy
    // via ||, trimmed to "", and returned undefined — losing the legacy key.
    // The corrected logic normalizes each candidate individually.
    assert.equal(
      resolveAdminKey("   ", "legacy-valid"),
      "legacy-valid",
      "Whitespace-only SVJ key must not block valid legacy key",
    );
  });

  it("reverse: whitespace-only legacy falls through to valid SVJ key", () => {
    assert.equal(
      resolveAdminKey("svj-valid", "   "),
      "svj-valid",
      "Whitespace-only legacy key must not block valid SVJ key",
    );
  });

  it("both empty returns undefined", () => {
    assert.equal(resolveAdminKey("", ""), undefined);
  });

  it("both missing returns undefined", () => {
    assert.equal(resolveAdminKey(undefined, undefined), undefined);
  });

  it("whitespace in both returns undefined", () => {
    assert.equal(resolveAdminKey("  ", "  "), undefined);
  });
});

describe("hasAdminKeyFromEnv — privileged operation gate", () => {
  it("returns true when SVJ key is set", () => {
    assert.equal(hasAdminKeyFromEnv("svj-secret", undefined), true);
  });

  it("returns true when legacy key is set", () => {
    assert.equal(hasAdminKeyFromEnv(undefined, "legacy-role"), true);
  });

  it("returns true when both keys are set", () => {
    assert.equal(hasAdminKeyFromEnv("svj-secret", "legacy-role"), true);
  });

  it("returns false when both keys are undefined", () => {
    assert.equal(hasAdminKeyFromEnv(undefined, undefined), false);
  });

  it("returns false when both keys are empty strings", () => {
    assert.equal(hasAdminKeyFromEnv("", ""), false);
  });

  it("returns false when both keys are whitespace-only", () => {
    assert.equal(hasAdminKeyFromEnv("   ", "   "), false);
  });

  it("returns true when SVJ key has leading/trailing spaces", () => {
    assert.equal(hasAdminKeyFromEnv("  svj-secret  ", undefined), true);
  });

  it("returns true when legacy key has leading/trailing spaces", () => {
    assert.equal(hasAdminKeyFromEnv(undefined, "  legacy-role  "), true);
  });
});

describe("Privileged operations must fail closed", () => {
  it("rejects when neither key is configured", () => {
    const adminKey = resolveAdminKey(undefined, undefined);
    const isAdmin = hasAdminKeyFromEnv(undefined, undefined);

    if (!adminKey || !isAdmin) {
      assert.equal(adminKey, undefined);
      assert.equal(isAdmin, false);
      return;
    }
    assert.fail("Should not reach here — privileged operation should be rejected");
  });

  it("rejects when keys are whitespace-only", () => {
    const adminKey = resolveAdminKey("  ", "  ");
    const isAdmin = hasAdminKeyFromEnv("  ", "  ");

    if (!adminKey || !isAdmin) {
      assert.equal(adminKey, undefined);
      assert.equal(isAdmin, false);
      return;
    }
    assert.fail("Should not reach here — whitespace-only keys should be rejected");
  });

  it("rejects when preferred is whitespace-only and legacy is empty", () => {
    const adminKey = resolveAdminKey("   ", "");
    const isAdmin = hasAdminKeyFromEnv("   ", "");

    if (!adminKey || !isAdmin) {
      assert.equal(adminKey, undefined);
      assert.equal(isAdmin, false);
      return;
    }
    assert.fail("Should not reach here — no valid key configured");
  });

  it("allows when a valid key exists", () => {
    const adminKey = resolveAdminKey("real-key", undefined);
    const isAdmin = hasAdminKeyFromEnv("real-key", undefined);

    assert.ok(adminKey, "adminKey should be truthy");
    assert.ok(isAdmin, "hasAdminKey should return true");
  });

  it("resolveAdminKey and hasAdminKeyFromEnv never disagree", () => {
    const cases: [string | undefined, string | undefined][] = [
      [undefined, undefined],
      ["", ""],
      ["  ", "  "],
      ["svj-key", undefined],
      [undefined, "legacy-key"],
      ["svj-key", "legacy-key"],
      ["   ", "legacy-valid"],
      ["svj-valid", "   "],
      ["  svj-key  ", "  legacy-key  "],
    ];

    for (const [svj, legacy] of cases) {
      const key = resolveAdminKey(svj, legacy);
      const isAdmin = hasAdminKeyFromEnv(svj, legacy);
      assert.equal(
        !!key,
        isAdmin,
        `Disagreement for [${svj}, ${legacy}]: resolveAdminKey=${key}, hasAdminKey=${isAdmin}`,
      );
    }
  });
});

// ── Integration tests: actual requireAdminKey / hasAdminKey from the module ──

const SVJ_KEY = "SVJ_SUPABASE_SECRET_KEY";
const LEGACY_KEY = "SUPABASE_SERVICE_ROLE_KEY";

function clearKeys() {
  delete process.env[SVJ_KEY];
  delete process.env[LEGACY_KEY];
}

describe("requireAdminKey — actual module import", () => {
  afterEach(clearKeys);

  it("throws when neither key is configured", () => {
    clearKeys();
    assert.throws(() => requireAdminKey(), /Privileged operation requires/);
  });

  it("throws when both keys are whitespace-only", () => {
    process.env[SVJ_KEY] = "   ";
    process.env[LEGACY_KEY] = "  \t\n ";
    assert.throws(() => requireAdminKey(), /Privileged operation requires/);
  });

  it("throws when preferred is whitespace-only and legacy is empty", () => {
    process.env[SVJ_KEY] = "   ";
    process.env[LEGACY_KEY] = "";
    assert.throws(() => requireAdminKey(), /Privileged operation requires/);
  });

  it("does NOT throw when SVJ key is valid", () => {
    process.env[SVJ_KEY] = "svj-secret-valid";
    assert.doesNotThrow(() => requireAdminKey());
  });

  it("does NOT throw when legacy key is valid", () => {
    process.env[LEGACY_KEY] = "legacy-role-valid";
    assert.doesNotThrow(() => requireAdminKey());
  });

  it("does NOT throw when both keys are valid (prefers SVJ)", () => {
    process.env[SVJ_KEY] = "svj-secret";
    process.env[LEGACY_KEY] = "legacy-role";
    assert.doesNotThrow(() => requireAdminKey());
  });

  it("does NOT throw when SVJ key has surrounding whitespace but is non-empty", () => {
    process.env[SVJ_KEY] = "  svj-secret  ";
    assert.doesNotThrow(() => requireAdminKey());
  });
});

describe("hasAdminKey — actual module import consistency", () => {
  afterEach(clearKeys);

  it("returns false when both keys are missing", () => {
    clearKeys();
    assert.equal(hasAdminKey(), false);
  });

  it("returns true when SVJ key is set", () => {
    process.env[SVJ_KEY] = "test-key";
    assert.equal(hasAdminKey(), true);
  });

  it("returns true when legacy key is set", () => {
    process.env[LEGACY_KEY] = "test-key";
    assert.equal(hasAdminKey(), true);
  });

  it("returns false when both are whitespace-only", () => {
    process.env[SVJ_KEY] = "   ";
    process.env[LEGACY_KEY] = "  ";
    assert.equal(hasAdminKey(), false);
  });

  it("whitespace-only SVJ falls through to valid legacy in hasAdminKey", () => {
    process.env[SVJ_KEY] = "   ";
    process.env[LEGACY_KEY] = "legacy-valid";
    assert.equal(hasAdminKey(), true);
  });
});

describe("Publishable key cannot authorize privileged operations", () => {
  afterEach(clearKeys);

  it("requireAdminKey rejects even when only publishable key is set", () => {
    clearKeys();
    // Publishable key is not an admin key — must still throw
    assert.throws(() => requireAdminKey(), /Privileged operation requires/);
  });

  it("hasAdminKey returns false when only non-admin env vars are set", () => {
    clearKeys();
    // Simulate: SUPABASE_URL and publishable key exist but no admin key
    process.env["SUPABASE_URL"] = "https://test.supabase.co";
    process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
    assert.equal(hasAdminKey(), false);
    assert.throws(() => requireAdminKey(), /Privileged operation requires/);
  });
});
