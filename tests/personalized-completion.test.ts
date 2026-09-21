// ============================================================================
// Personalized task checkbox/completion hotfix — regression contracts.
//
// Static + behavioral assertions guarding:
//   * the server serializer preserves status/completed/completedAt
//   * the completion RPC reports the XP actually granted (daily cap), not
//     the nominal reward
//   * the Challenges UI uses per-task pending state, no remove button for
//     personalized assignments, and never local toggleChallenge
//   * idempotent completion: retry = zero additional XP
// ============================================================================
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const read = (rel: string) => readFile(path.join(root, rel), "utf8");

const serverSource = await read("src/lib/challenge-engine.server.ts");
const viewSource = await read("src/app/views/ChallengesView.tsx");
const xpFixMigration = await read(
  "supabase/migrations/20260925000000_personalized_completion_xp_report.sql",
);
const baseMigration = await read(
  "supabase/migrations/20260919010000_personalized_task_assignments.sql",
);

// ── 1–3. Serializer preserves completion state ────────────────────────────

test("toResult preserves status, completed and completedAt", () => {
  const fn = serverSource.slice(serverSource.indexOf("function toResult"));
  const body = fn.slice(0, fn.indexOf("}\n\n") + 1);
  assert.match(body, /status: a\.status/);
  assert.match(body, /completed: a\.completed/);
  assert.match(body, /completedAt: a\.completedAt/);
});

test("the PersonalizedResult challenge type includes completion fields", () => {
  const iface = serverSource.slice(
    serverSource.indexOf("interface PersonalizedResult"),
    serverSource.indexOf("/**\n * Server refresh cooldown"),
  );
  assert.match(iface, /status: string/);
  assert.match(iface, /completed: boolean/);
  assert.match(iface, /completedAt: string \| null/);
});

test("the view maps server completed/completedAt without inventing state", () => {
  // The UI must read the server value, defaulting only when absent.
  assert.match(viewSource, /completed: p\.completed \?\? false/);
  assert.match(viewSource, /completedAt: p\.completedAt \?\? undefined/);
});

// ── 13. Actual XP returned respects the daily cap ─────────────────────────

test("completion RPC reports the capped v_awarded, not nominal xp_reward", () => {
  // Final success return must use v_awarded.
  assert.match(
    xpFixMigration,
    /'ok', true, 'alreadyCompleted', false,\s*\n\s*'xpAwarded', v_awarded/,
  );
  // And must NOT return the nominal reward.
  assert.doesNotMatch(xpFixMigration, /'xpAwarded', v_assignment\.xp_reward/);
  // Cap computation is unchanged: 300/day, LEAST(xp_reward, room).
  assert.match(xpFixMigration, /300 - COALESCE/);
  assert.match(xpFixMigration, /v_awarded integer := LEAST\(v_assignment\.xp_reward, v_cap_room\)/);
});

// ── 7. Idempotency: duplicate completion does not duplicate XP ────────────

test("completed assignments are idempotent no-ops with zero additional XP", () => {
  assert.match(
    baseMigration,
    /IF v_assignment\.status = 'completed' THEN\s*\n\s*RETURN jsonb_build_object\('ok', true, 'alreadyCompleted', true,\s*\n\s*'xpAwarded', 0/,
  );
  // Ledger insert keyed on immutable event_key with DO NOTHING.
  assert.match(baseMigration, /'personalized\.task:' \|\| v_assignment\.id::text/);
  assert.match(baseMigration, /ON CONFLICT \(user_id, event_key\) DO NOTHING/);
});

// ── 8–12. UI behaviors ────────────────────────────────────────────────────

test("personalized tasks never route through local toggleChallenge", () => {
  const toggleIdx = viewSource.indexOf("const result = toggleChallenge(id)");
  const personalizedBranch = viewSource.slice(
    viewSource.indexOf("if (personalizedQuery.data?.challenges?.some"),
    toggleIdx,
  );
  assert.ok(toggleIdx > -1, "custom challenges still use toggleChallenge");
  assert.doesNotMatch(personalizedBranch, /toggleChallenge/);
  assert.match(personalizedBranch, /callCompletePersonalized/);
});

test("personalized tasks do not show the local remove button", () => {
  // Remove button is wrapped in a non-personalized guard.
  assert.match(viewSource, /\{!challenge\.isPersonalized && \(/);
  // Edit (pencil) stays custom-only.
  assert.match(viewSource, /challenge\.isCustom && \(/);
});

test("pending completion disables only the tapped task and shows a spinner", () => {
  assert.match(viewSource, /completingId === challenge\.id \? \(\s*\n?\s*<Loader2/);
  // Completed rows stay interactive unless the completion is locked (personalized
  // server rows or past days), because completion is now a real toggle.
  assert.match(
    viewSource,
    /disabled=\{\s*completingId === challenge\.id \|\|\s*\(challenge\.completed && completionLocked\(challenge\)\)\s*\}/,
  );
  // Duplicate tap guard.
  assert.match(viewSource, /if \(completingId\) return/);
});

test("completion failure surfaces an accessible, friendly error", () => {
  assert.match(viewSource, /role="alert"/);
  // Environment-specific message when the RPC is missing.
  assert.match(viewSource, /Personalized task service is not available in this environment\./);
  assert.match(viewSource, /Could not complete this task\. Please retry\./);
  // Raw Postgres internals never reach the UI as-is from the catch path.
  assert.doesNotMatch(viewSource, /setActionError\((?:\s|\w)*error\.message/);
});

test("completed personalized tasks render checked via server refetch", () => {
  assert.match(viewSource, /await personalizedQuery\.refetch\(\)/);
  // Server XP/profile invalidation after ledger confirmation, no optimistic XP.
  assert.match(viewSource, /invalidateQueries\(\{ queryKey: \["user-stats"\] \}\)/);
  assert.match(viewSource, /invalidateQueries\(\{ queryKey: \["profile"\] \}\)/);
});

// ── Migration hygiene ─────────────────────────────────────────────────────

test("the xp-report fix migration is additive and preserves the cap policy", () => {
  assert.doesNotMatch(xpFixMigration, /DROP TABLE|TRUNCATE|DROP POLICY|ALTER POLICY/);
  assert.match(
    xpFixMigration,
    /GRANT EXECUTE ON FUNCTION public\.svj_complete_my_personalized_task\(uuid\)\s*\n\s*TO authenticated/,
  );
});
