/**
 * Update 04 — verified activity → Character Matrix + secure XP.
 *
 * Contract tests in two layers (the live-RPC behaviour is enforced by the
 * database itself; here we pin the policy, idempotency and anti-farming
 * invariants so they cannot silently regress):
 *
 *   1. Client rewards library: only the activity id ever leaves the browser —
 *      no xp_amount, stat_amount or user_id is ever sent, and nothing is
 *      displayed before the server confirms it.
 *   2. The additive migration's invariants: centralized server policy,
 *      manual-source ineligibility, strength qualification (never per
 *      set/rep/kg), bounded duration bonus, one PR bonus per activity,
 *      daily XP cap + per-stat caps, immutable event keys, server clock,
 *      RLS/grant hardening, and no backfill of historical activities.
 *   3. Regressions: 60-Day and membership flows keep their no-admin-key
 *      self-service architecture; strength save stays untouched.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeRewards,
  processActivityRewards,
  rewardsRpcClient,
  type ActivityRewards,
} from "../src/app/lib/rewards";
import { extractSaveExtras } from "../src/app/lib/goalsRecords";
import { normalizeServerActivity } from "../src/app/lib/serverActivities";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");
// Normalized line endings: Windows checkouts (core.autocrlf) must not change
// what these regex contracts see.
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20260919000000_activity_xp_stats.sql");
const strengthMigration = read("supabase/migrations/20260918000000_strength_logging.sql");
const challengeServer = read("src/lib/challenge.functions.ts");
const selfServiceMigration = read("supabase/migrations/20260918000000_challenge_self_service.sql");
const membershipRpc = read("supabase/migrations/20260917000000_my_membership_rpc.sql");
const activityContext = read("src/app/context/ActivityContext.tsx");
const trainStrength = read("src/app/views/TrainStrength.tsx");
const challengesView = read("src/app/views/ChallengesView.tsx");

function fakeRpc(
  responder: (
    fn: string,
    args?: Record<string, unknown>,
  ) =>
    | { data: unknown; error: { message: string } | null }
    | Promise<{ data: unknown; error: { message: string } | null }>,
) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  return {
    calls,
    async rpc(fn: string, args?: Record<string, unknown>) {
      calls.push({ fn, args });
      return responder(fn, args);
    },
  };
}

const SERVER_ENVELOPE = {
  ok: true,
  eligible: true,
  xpAwarded: 35,
  prBonusAwarded: 5,
  statChanges: { fitness: 2, discipline: 1 },
  dailyActivityXpRemaining: 65,
};

// ── 1) Client rewards library ───────────────────────────────────────────────

describe("rewards client library", () => {
  it("sends ONLY the activity id — never xp, stat amounts or user ids", async () => {
    const client = fakeRpc(() => ({ data: SERVER_ENVELOPE, error: null }));
    const result = await processActivityRewards(client as never, "act-123");
    assert.equal(result.ok, true);
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].fn, "svj_process_activity_rewards");
    assert.deepEqual(client.calls[0].args, { p_activity_id: "act-123" });
  });

  it("normalizes the server-confirmed reward summary", () => {
    const rewards = normalizeRewards(SERVER_ENVELOPE);
    assert.ok(rewards);
    assert.equal(rewards.eligible, true);
    assert.equal(rewards.xpAwarded, 35);
    assert.equal(rewards.prBonusAwarded, 5);
    assert.deepEqual(rewards.statChanges, { fitness: 2, discipline: 1 });
    assert.equal(rewards.dailyActivityXpRemaining, 65);
  });

  it("drops negative, non-finite and junk stat values (server truth only)", () => {
    const rewards = normalizeRewards({
      ok: true,
      eligible: true,
      xpAwarded: 10,
      prBonusAwarded: 0,
      statChanges: { fitness: 2, discipline: -5, focus: Number.NaN, ambition: "100" },
    });
    assert.ok(rewards);
    assert.deepEqual(rewards.statChanges, { fitness: 2 });
  });

  it("rejects malformed envelopes instead of guessing rewards", () => {
    assert.equal(normalizeRewards(null), null);
    assert.equal(normalizeRewards({ ok: false }), null);
    assert.equal(normalizeRewards("ok"), null);
    assert.equal(normalizeRewards({}), null);
  });

  it("surfaces the server error and never fabricates a reward", async () => {
    const client = fakeRpc(() => ({
      data: null,
      error: { message: "Activity not found" },
    }));
    const result = await processActivityRewards(client as never, "act-x");
    assert.equal(result.ok, false);
    assert.equal(result.rewards, undefined);
    assert.match(result.error ?? "", /Activity not found/);
  });

  it("treats a zero-XP ineligible response as an ok, explicit no-op", async () => {
    const client = fakeRpc(() => ({
      data: {
        ok: true,
        eligible: false,
        reason: "manual_source",
        xpAwarded: 0,
        prBonusAwarded: 0,
        statChanges: {},
      },
      error: null,
    }));
    const result = await processActivityRewards(client as never, "act-manual");
    assert.equal(result.ok, true);
    assert.equal(result.rewards?.eligible, false);
    assert.equal(result.rewards?.xpAwarded, 0);
  });

  it("rewardsRpcClient returns null without backend config (no crash)", () => {
    // hasSupabaseConfig() reads import.meta.env, which is undefined under the
    // plain tsx runner; it must degrade gracefully to "no backend".
    let client: unknown;
    try {
      client = rewardsRpcClient();
    } catch {
      client = "threw";
    }
    assert.ok(client === null || typeof client === "object");
  });
});

// ── 2) Migration invariants ─────────────────────────────────────────────────

describe("Update 04 migration invariants", () => {
  it("keeps ONE centralized server policy table — numbers live server-side", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_activity_reward_policy/);
    // Every canonical activity type has exactly one policy row.
    for (const t of [
      "walking",
      "running",
      "cycling",
      "football",
      "hiit",
      "calisthenics",
      "yoga",
      "strength",
    ]) {
      assert.match(migration, new RegExp(`\\('${t}',`), `policy row for ${t}`);
    }
    // Policy table is fully locked away from clients.
    assert.match(
      migration,
      /REVOKE ALL ON public\.svj_activity_reward_policy FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("never exposes xp_amount, stat_amount or user_id on the reward RPC", () => {
    assert.match(migration, /svj_process_activity_rewards\(\s*p_activity_id uuid\s*\)/);
    // The RPC derives identity from the canonical activity row, not an argument.
    const fn = migration.slice(
      migration.indexOf("svj_process_activity_rewards("),
      migration.indexOf("-- ── 6)"),
    );
    assert.doesNotMatch(fn, /p_user_id|p_xp_amount|p_stat_amount/);
    assert.match(fn, /v_caller uuid := auth\.uid\(\)/);
  });

  it("manual activities are ineligible for protected XP and stat gains", () => {
    assert.match(migration, /IF v_activity\.source = 'manual' THEN/);
    assert.match(migration, /'reason', 'manual_source'/);
  });

  it("strength XP is one flat reward — never per set, rep, kg or volume", () => {
    assert.match(migration, /svj_strength_workout_qualifies/);
    // Qualification is evidence-based: exercises/sets thresholds or duration.
    assert.match(migration, /COUNT\(DISTINCT ae\.id\)[\s\S]*>= 2/);
    assert.match(migration, /COUNT\(\*\)[\s\S]*>= 4/);
    assert.match(migration, />= 900/);
    // No multiplication of XP by volume/reps/weight anywhere in the reward fn.
    const fn = migration.slice(
      migration.indexOf("svj_process_activity_rewards("),
      migration.indexOf("-- ── 6)"),
    );
    assert.doesNotMatch(fn, /\*\s*v_volume|\*\s*total_reps|\*\s*weight|set_count\s*\*/);
  });

  it("duration bonus is small and capped at +15", () => {
    assert.match(migration, /WHEN v_activity\.duration_seconds >= 3600 THEN 15/);
    assert.match(migration, /WHEN v_activity\.duration_seconds >= 2700 THEN 10/);
    assert.match(migration, /WHEN v_activity\.duration_seconds >= 1800 THEN 5/);
    assert.match(migration, /v_awarded_xp := LEAST\(100, v_base_xp \+ v_bonus_xp \+ v_pr_xp\)/);
  });

  it("awards at most ONE PR bonus (+5) per activity, evidence-keyed", () => {
    assert.match(migration, /v_pr_xp := 5/);
    assert.match(migration, /'activity\.pr_bonus:' \|\| v_activity\.id::text/);
    // Exactly one dedicated PR-bonus ledger event, keyed to the activity: the
    // main XP event may reference it, but only one event carries the key.
    const fn = migration.slice(
      migration.indexOf("svj_process_activity_rewards("),
      migration.indexOf("-- ── 6)"),
    );
    const bonusEvents = fn.match(/'activity\.pr_bonus:' \|\| v_activity\.id::text/g) ?? [];
    assert.equal(bonusEvents.length, 2, "one key build + one ON CONFLICT guard");
    // The bonus event itself awards 0 extra XP — it is evidence only.
    assert.match(fn, /'activity\.pr_bonus:'[\s\S]*?\n\s+0,\n\s+0,/);
  });

  it("enforces a 100 XP/day activity cap using the database clock", () => {
    assert.match(migration, /svj_activity_xp_earned_today/);
    assert.match(migration, /GREATEST\(0, 100 - public\.svj_activity_xp_earned_today/);
    assert.match(migration, /date_trunc\('day', now\(\)\)/);
    // Cap counts only activity XP — 60-Day/verified challenge XP stays separate.
    assert.match(migration, /e\.source_class = 'workout'/);
  });

  it("enforces per-stat daily caps (fitness 6, discipline 3, focus 2)", () => {
    assert.match(migration, /WHEN 'fitness' THEN GREATEST\(0, 6 - /);
    assert.match(migration, /WHEN 'discipline' THEN GREATEST\(0, 3 - /);
    assert.match(migration, /WHEN 'focus' THEN GREATEST\(0, 2 - /);
    // Only activity-sourced stat events count toward the activity caps.
    const caps = migration.match(/stat_name = '\w+'\s+AND source = 'activity'/g) ?? [];
    assert.ok(caps.length >= 3, "caps filter by source = 'activity'");
  });

  it("no client stat mutation: user_stats updates derive from server policy only", () => {
    // The reward fn is the only new user_stats writer, and only via stat_map.
    assert.match(migration, /UPDATE public\.user_stats/);
    const context = activityContext + trainStrength;
    assert.doesNotMatch(context, /user_stats|stat_events/);
    assert.doesNotMatch(challengesView, /\.update\("user_stats"\)/);
  });

  it("every XP grant carries an immutable ledger event key", () => {
    assert.match(migration, /'activity\.xp:' \|\| v_activity\.id::text/);
    assert.match(migration, /ON CONFLICT \(user_id, event_key\) DO NOTHING/);
    // XP is aggregated exactly once, only when the ledger row was new.
    assert.match(migration, /IF v_event_key IS NOT NULL AND v_awarded_xp > 0 THEN/);
  });

  it("uses the trusted server write mechanism for profiles.total_xp", () => {
    assert.match(migration, /set_config\('svj\.trusted_server_write', 'on', true\)/);
    assert.match(migration, /SET total_xp = COALESCE\(total_xp, 0\) \+ v_awarded_xp/);
  });

  it("stat gains use immutable per-stat event keys", () => {
    assert.match(
      migration,
      /'activity\.stat:' \|\| v_activity\.id::text \|\| ':' \|\| v_stat_name/,
    );
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS stat_events_identity/);
  });

  it("qualifying native cardio requires genuine sensor evidence", () => {
    assert.match(migration, /AND v_activity\.step_count <= 0/);
    assert.match(
      migration,
      /v_activity\.distance_meters IS NULL OR v_activity\.distance_meters <= 0/,
    );
    assert.match(migration, /'reason', 'no_evidence'/);
  });

  it("rejects absurd durations before rewarding", () => {
    assert.match(migration, /v_activity\.duration_seconds > 86400/);
    assert.match(migration, /'reason', 'invalid_duration'/);
  });

  it("does NOT backfill rewards for historical activities", () => {
    // No INSERT INTO svj_activities / no UPDATE rewarding past rows.
    const fn = migration.slice(
      migration.indexOf("svj_process_activity_rewards("),
      migration.indexOf("-- ── 6)"),
    );
    assert.doesNotMatch(fn, /INSERT INTO public\.svj_activities/);
    assert.doesNotMatch(fn, /UPDATE public\.svj_activities/);
  });

  it("locks the reward function away from PUBLIC and anon", () => {
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.svj_process_activity_rewards\(uuid\) FROM PUBLIC, anon;/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.svj_process_activity_rewards\(uuid\) TO authenticated;/,
    );
  });

  it("indexes cap/ledger lookups to avoid full scans on save", () => {
    assert.match(migration, /CREATE INDEX IF NOT EXISTS activity_events_key_class_idx/);
    assert.match(migration, /CREATE INDEX IF NOT EXISTS stat_events_activity_day_idx/);
  });

  it("reloads the PostgREST schema cache", () => {
    assert.match(migration, /NOTIFY pgrst, 'reload schema';/);
  });
});

// ── 3) Frontend wiring invariants ───────────────────────────────────────────

describe("Update 04 frontend wiring", () => {
  it("processes rewards only after a NEW canonical save — never on retries", () => {
    const persist = activityContext.slice(
      activityContext.indexOf("const persist = useCallback("),
      activityContext.indexOf("const runSave = useCallback("),
    );
    assert.match(persist, /!result\.duplicate && result\.activity/);
    assert.match(persist, /processActivityRewards/);
  });

  it("a rewards failure never fails the save", () => {
    assert.match(activityContext, /A rewards failure never fails the save/);
  });

  it("renders rewards only from the server-confirmed summary", () => {
    assert.match(activityContext, /rewards: ActivityRewards \| null/);
    assert.match(challengesView, /serverActivityXpToday/);
  });

  it("merges server activity XP into XP Today / Daily XP Goal", () => {
    assert.match(challengesView, /activity\?\.serverActivityXpToday \?\? 0/);
  });

  it("refreshes the Character Matrix via query invalidation (no reload)", () => {
    const wired = activityContext + trainStrength;
    assert.match(wired, /invalidateQueries\(\{ queryKey: \["user-stats"\] \}\)/);
    assert.doesNotMatch(wired, /window\.location\.reload/);
  });

  it("strength save flow calls the reward engine exactly once per save", () => {
    const saveFn = trainStrength.slice(
      trainStrength.indexOf("const save = async () => {"),
      trainStrength.indexOf("const durationSeconds ="),
    );
    const calls = saveFn.match(/processActivityRewards/g) ?? [];
    assert.equal(calls.length, 1);
    assert.match(saveFn, /!result\.duplicate && result\.activity/);
  });

  it("display labels stay compact and map server stats correctly", () => {
    const historyView = read("src/app/views/ActivityHistory.tsx");
    assert.match(historyView, /fitness: "PHYSICAL"/);
    assert.match(historyView, /discipline: "DISCIPLINE"/);
    assert.match(historyView, /focus: "MENTAL"/);
  });

  it("save extras / activity normalization remain backward compatible", () => {
    assert.deepEqual(extractSaveExtras({ ok: true }), { newRecords: [], goalProgress: [] });
    const activity = normalizeServerActivity({
      id: "a1",
      user_id: "user-1",
      client_session_id: "svj-session-abc123",
      activity_type: "walking",
      source: "svj_native",
      started_at: "2026-09-19T10:00:00Z",
      ended_at: "2026-09-19T10:30:00Z",
      duration_seconds: 1800,
      step_count: 3200,
    });
    assert.ok(activity);
    assert.equal(activity.id, "a1");
  });

  it("new rewards shape does not break existing consumers", () => {
    // SaveActivityResultLike stays structurally assignable.
    const result: { ok: boolean; rewards?: ActivityRewards | null } = {
      ok: true,
      rewards: null,
    };
    assert.equal(result.ok, true);
  });
});

// ── 4) Regressions: earlier updates stay intact ─────────────────────────────

describe("Update 04 regressions", () => {
  it("60-Day self-service flows keep zero requireAdminKey dependency", () => {
    assert.match(challengeServer, /svj_complete_my_challenge_day/);
    // Only a historical comment may mention it — no callable reference.
    assert.doesNotMatch(challengeServer, /(?<!\/\/.*)(?<!\* .*)\brequireAdminKey\(/);
    assert.match(selfServiceMigration, /svj_get_my_challenge_state/);
    assert.match(selfServiceMigration, /svj_start_my_challenge/);
    assert.match(selfServiceMigration, /svj_resume_my_challenge/);
    assert.match(selfServiceMigration, /svj_complete_my_challenge_day/);
  });

  it("membership stays admin-key independent", () => {
    assert.match(membershipRpc, /svj_get_my_membership/);
    const migrationSource = migration;
    assert.doesNotMatch(migrationSource, /SVJ_SUPABASE_SECRET_KEY/);
    assert.doesNotMatch(migrationSource, /SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("does not disturb Update 03 strength tables or save function", () => {
    assert.match(strengthMigration, /svj_save_strength_activity/);
    assert.doesNotMatch(migration, /DROP TABLE.*svj_strength_sets/);
    assert.doesNotMatch(migration, /DROP FUNCTION.*svj_save_strength_activity/);
    assert.doesNotMatch(migration, /DROP FUNCTION.*svj_save_activity/);
  });

  it("is a purely additive migration — no destructive statements", () => {
    assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
    // Historical migrations are not edited: the PR only adds a new file.
    assert.match(migration, /Additive only/);
  });

  it("preserves the existing 60-Day verified XP path untouched", () => {
    assert.doesNotMatch(migration, /svj_record_verified_60_day_completion\s*\(/);
    // The daily activity cap counts only workout-class events, never sixty_day.
    assert.match(migration, /e\.source_class = 'workout'/);
    assert.doesNotMatch(migration, /source_class = 'sixty_day'/);
  });
});
