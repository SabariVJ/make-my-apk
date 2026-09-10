// ============================================================================
// Personalized task hardening — regression contracts.
//
// Pattern follows tests/outperform-security.test.ts: assert the real server
// source and migration SQL so the security-relevant behavior cannot silently
// regress. These tests cover:
//   * assessment gating of getPersonalizedChallenges (server-side)
//   * atomic cooldown reservation (single-statement check + reserve)
//   * refresh awards no XP and does not touch reward paths
//   * user-scoped client usage (no service-role bypass)
//   * one-time assessment: no normal-user path resets assessment_completed
// ============================================================================
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

// Anchor on a real file (tsx resolves bare ".." URL segments against the
// transformed module URL, so resolve from a concrete file path instead).
const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const read = (rel: string) => readFile(path.join(root, rel), "utf8");

const serverSource = await read("src/lib/challenge-engine.server.ts");
const refreshRpcMigration = await read("supabase/migrations/20260905_add_atomic_refresh_rpc.sql");
const cooldownColumnMigration = await read(
  "supabase/migrations/20260905_add_personalized_refresh_cooldown.sql",
);

// ── Assessment gating ─────────────────────────────────────────────────────

test("personalized challenges are gated server-side on assessment completion", () => {
  // The gate must live in the server function, after the personalization row
  // is read by user_id, and refuse to generate tasks when incomplete.
  assert.match(serverSource, /assessmentCompleted/);
  assert.match(serverSource, /Complete your SVJ Assessment to unlock personalized challenges\./);
  // Gate ordering: readPersonalization result checked before generation.
  const gateIndex = serverSource.indexOf("if (!assessmentCompleted)");
  const generateIndex = serverSource.indexOf("selectPersonalizedChallenges(stats");
  assert.ok(gateIndex > -1, "assessment gate condition missing");
  assert.ok(gateIndex < generateIndex, "assessment gate must run before challenge generation");
});

test("the personalized gate reads the authenticated user's own rows only", () => {
  assert.match(serverSource, /\.eq\("user_id", context\.userId\)/);
  assert.match(serverSource, /requireSupabaseAuth/);
  assert.match(serverSource, /context\.supabase/);
  // Never uses the service-role client for personalized reads/refreshes.
  assert.doesNotMatch(serverSource, /supabaseAdmin/);
});

// ── Atomic refresh cooldown ───────────────────────────────────────────────

test("refresh cooldown is reserved atomically in the database", () => {
  // Single-statement conditional UPDATE: check + reserve in one operation so
  // two concurrent refreshes cannot both pass the cooldown check.
  assert.match(
    refreshRpcMigration,
    /UPDATE public\.user_personalization\s*\n\s*SET last_personalized_refresh_at = new_ts\s*\n\s*WHERE user_id = caller_id\s*\n\s*AND \(last_personalized_refresh_at IS NULL\s*\n\s*OR last_personalized_refresh_at <= new_ts - cooldown_interval\)/,
  );
  // The not-reserved branch reports remaining cooldown instead of generating.
  assert.match(refreshRpcMigration, /IF NOT FOUND THEN/);
  assert.match(refreshRpcMigration, /'cooldownRemainingMs'/);
});

test("the cooldown RPC authenticates the caller and is not public", () => {
  assert.match(refreshRpcMigration, /caller_id uuid := auth\.uid\(\)/);
  assert.match(refreshRpcMigration, /RAISE EXCEPTION 'Authentication required'/);
  assert.match(
    refreshRpcMigration,
    /REVOKE ALL ON FUNCTION public\.svj_reserve_personalized_refresh\(\) FROM PUBLIC, anon/,
  );
  assert.match(
    refreshRpcMigration,
    /GRANT EXECUTE ON FUNCTION public\.svj_reserve_personalized_refresh\(\) TO authenticated/,
  );
  assert.match(refreshRpcMigration, /SECURITY DEFINER/);
});

test("the refresh column migration is idempotent and non-destructive", () => {
  assert.match(
    cooldownColumnMigration,
    /ADD COLUMN IF NOT EXISTS last_personalized_refresh_at timestamptz/,
  );
  assert.doesNotMatch(cooldownColumnMigration, /DROP COLUMN|DROP TABLE|TRUNCATE/);
});

test("the server prefers the atomic RPC and only falls back when it is missing", () => {
  assert.match(serverSource, /svj_reserve_personalized_refresh/);
  // Fallback only for PGRST202 / function-not-found — never on other errors.
  assert.match(serverSource, /PGRST202/);
  assert.match(serverSource, /could not find the function/);
});

test("cooldown is enforced server-side with a 30-minute window", () => {
  assert.match(serverSource, /REFRESH_COOLDOWN_MS = 30 \* 60 \* 1000/);
});

// ── Refresh never awards XP ───────────────────────────────────────────────

test("refresh and generation paths never award XP", () => {
  // The refresh function returns challenge definitions only; XP must come
  // exclusively from the completion path.
  const refreshIndex = serverSource.indexOf("refreshPersonalizedChallenges");
  assert.ok(refreshIndex > -1, "refresh function missing");
  const refreshBody = serverSource.slice(refreshIndex);
  assert.doesNotMatch(refreshBody, /applyActivityXp|xp_delta|increment_total_xp/);
});

// ── One-time assessment enforcement ──────────────────────────────────────

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(rel)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(rel);
  }
  return files;
}

test("no normal-user flow can reset assessment_completed to false", async () => {
  const files = await collectSourceFiles("src");
  const offenders: string[] = [];
  for (const rel of files) {
    const source = await readFile(path.join(root, rel), "utf8");
    // Matches writes/reads that explicitly assign false — e.g. upsert bodies.
    if (/assessment_completed['"]?\s*:\s*false/.test(source)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test("assessment completion is persisted server-side through the authenticated upsert", async () => {
  const personalization = await read("src/lib/personalization.functions.ts");
  assert.match(personalization, /savePersonalization = createServerFn\(\{ method: "POST" \}\)/);
  assert.match(personalization, /assessment_completed: data\.assessmentCompleted/);
  assert.match(personalization, /\.from\("user_personalization"\)\.upsert/);
});
