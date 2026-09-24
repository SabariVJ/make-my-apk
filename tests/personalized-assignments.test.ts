/**
 * Personalized-task hotfix — contract tests.
 *
 * Pins the server-backed assignment architecture:
 *   1. Persistence: assignments come from svj_personalized_task_assignments
 *      with stable database IDs (unique user/day/template) — never
 *      Date.now()-generated React-only identities.
 *   2. Completion: clients may send ONLY the assignment id; identity, status
 *      and rewards are decided by the SECURITY DEFINER RPC
 *      svj_complete_my_personalized_task, with exactly-once XP/stats.
 *   3. Anti-farming: no client xp/user_id/stat inputs; refresh never mints
 *      XP; cooldown remains server-authoritative.
 *   4. The local toggleChallenge()/applyActivityXp path is never used for
 *      personalized tasks (no more "This task is no longer available").
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260919010000_personalized_task_assignments.sql",
    import.meta.url,
  ),
  "utf8",
);
const serverFn = readFileSync(
  new URL("../src/lib/challenge-engine.server.ts", import.meta.url),
  "utf8",
);
const view = readFileSync(new URL("../src/app/views/ChallengesView.tsx", import.meta.url), "utf8");
const rewardsLib = readFileSync(new URL("../src/app/lib/rewards.ts", import.meta.url), "utf8");
const contextSource = readFileSync(
  new URL("../src/app/context/ActivityContext.tsx", import.meta.url),
  "utf8",
);

// ── 1. Stable identity & persistence ────────────────────────────────────────

describe("personalized assignment persistence", () => {
  test("assignments table exists with server identity", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_personalized_task_assignments/);
    assert.match(
      migration,
      /UNIQUE INDEX IF NOT EXISTS svj_personalized_assignments_identity\s+ON public\.svj_personalized_task_assignments \(user_id, assigned_for, template_key\)/,
    );
  });

  test("no Date.now() task identity anywhere in the assignment chain", () => {
    assert.doesNotMatch(
      serverFn,
      /personalized-\$\{.*Date\.now/,
      "task IDs must come from the database, not Date.now()",
    );
    assert.match(serverFn, /svj_get_or_create_my_personalized_tasks/);
  });

  test("RLS: users read only own assignments; writes only via definer RPC", () => {
    assert.match(migration, /FORCE ROW LEVEL SECURITY/);
    assert.match(
      migration,
      /GRANT SELECT ON public\.svj_personalized_task_assignments TO authenticated/,
    );
    assert.doesNotMatch(
      migration,
      /GRANT (ALL|INSERT|UPDATE) ON public\.svj_personalized_task_assignments TO authenticated/,
      "authenticated must not be able to write assignments directly",
    );
    assert.match(migration, /USING \(auth\.uid\(\) = user_id\)/);
  });

  test("refetch returns the same rows (get-or-create, not regenerate)", () => {
    assert.match(migration, /Return today's persisted set/);
  });
});

// ── 2. Completion RPC ───────────────────────────────────────────────────────

describe("completion RPC", () => {
  test("RPC takes only the assignment id and derives auth.uid()", () => {
    assert.match(
      migration,
      /FUNCTION public\.svj_complete_my_personalized_task\(\s*p_assignment_id uuid\s*\)/,
    );
    const fnBody = migration.slice(migration.indexOf("svj_complete_my_personalized_task"));
    assert.doesNotMatch(fnBody, /p_user_id/, "no user_id parameter allowed");
    assert.match(fnBody, /v_caller uuid := auth\.uid\(\)/);
  });

  test("completion is idempotent: retry grants zero XP", () => {
    assert.match(
      migration,
      /IF v_assignment\.status = 'completed' THEN[\s\S]{0,300}'xpAwarded', 0/,
    );
    assert.match(migration, /ON CONFLICT \(user_id, event_key\) DO NOTHING/);
  });

  test("XP comes from the SERVER-STORED xp_reward, not client input", () => {
    assert.match(migration, /personalized\.task:' \|\| v_assignment\.id::text/);
    assert.match(migration, /source_class\s*=\s*'svj_personalized'|\n\s+'svj_personalized',/);
    assert.match(migration, /'personalized\.task:' \|\| v_assignment\.id::text/);
    assert.doesNotMatch(migration, /p_xp|p_xp_amount/, "no client-declared XP parameter");
  });

  test("stat gains use immutable per-assignment evidence keys", () => {
    assert.match(
      migration,
      /personalized\.stat:' \|\| v_assignment\.id::text \|\| ':' \|\| v_stat_name/,
    );
    assert.match(migration, /ON CONFLICT DO NOTHING/);
  });

  test("execution restricted to authenticated", () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.svj_complete_my_personalized_task\(uuid\)\s+FROM PUBLIC, anon/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.svj_complete_my_personalized_task\(uuid\)\s+TO authenticated/,
    );
  });
});

// ── 3. Refresh behaviour ────────────────────────────────────────────────────

describe("refresh", () => {
  test("cooldown stays server-authoritative via atomic reservation", () => {
    assert.match(migration, /svj_reserve_personalized_refresh/);
    assert.match(migration, /svj_refresh_my_personalized_tasks/);
  });

  test("refresh marks uncompleted rows replaced and never touches completions", () => {
    assert.match(
      migration,
      /SET status = 'replaced'\s+WHERE user_id = v_caller AND assigned_for = v_today AND status = 'active'/,
    );
  });

  test("refresh never mints XP", () => {
    const refreshBody = migration.slice(
      migration.indexOf("svj_refresh_my_personalized_tasks"),
      migration.indexOf("svj_complete_my_personalized_task"),
    );
    assert.doesNotMatch(refreshBody, /activity_events/, "no ledger writes on refresh");
    assert.doesNotMatch(refreshBody, /total_xp/);
  });
});

// ── 4. Client wiring ────────────────────────────────────────────────────────

describe("client wiring", () => {
  test("personalized tasks complete through the server path, never toggleChallenge", () => {
    assert.match(view, /completePersonalizedTask/);
    assert.match(view, /svj_complete_my_personalized_task|callCompletePersonalized/);
    assert.match(
      view,
      /personalizedQuery\.data\?\.challenges\?\.some\(\(p\) => p\.id === challenge\.id\)/,
      "the handler must branch personalized IDs away from toggleChallenge",
    );
  });

  test("client sends only the assignment id", () => {
    assert.match(serverFn, /p_assignment_id: data\.assignmentId/);
    // The only xp assignment in the server layer is the server-side XP_MAP
    // template payload (server→server); no client XP input exists.
    assert.match(serverFn, /XP_MAP\[t\.difficulty\]/);
    assert.doesNotMatch(serverFn, /data\.xp|input\.xp/, "no client-declared XP");
    assert.doesNotMatch(view, /xp_reward/);
  });

  test("completed state renders from SERVER assignment state", () => {
    assert.match(view, /completed: p\.completed \?\? false/);
    assert.match(view, /await personalizedQuery\.refetch\(\)/);
    // The banner shows the server-returned award but never fabricates a
    // lifetime total: previousTotalXp is null and the level-up is deferred
    // (client estimates are never labeled authoritative).
    assert.match(view, /xpAwarded: result\.xpAwarded \?\? challenge\.xp/);
    assert.match(view, /previousTotalXp: null/);
    assert.match(view, /deferLevelUp: true/);
  });

  test("reward invalidation: user-stats and profile refresh, no optimistic writes", () => {
    assert.match(view, /invalidateQueries\(\{ queryKey: \["user-stats"\] \}\)/);
    assert.match(view, /invalidateQueries\(\{ queryKey: \["profile"\] \}\)/);
  });

  test("XP Today merges personalized ledger XP without double counting", () => {
    assert.match(contextSource, /personalizedXpToday/);
    assert.match(rewardsLib, /fetchPersonalizedXpToday/);
    assert.match(rewardsLib, /source_class.*svj_personalized/);
  });
});
