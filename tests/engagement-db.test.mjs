// Runs only against a disposable in-memory PostgreSQL engine or an explicitly
// named LOCAL test database. Never consumes SUPABASE_URL or production secrets.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const connectionString = process.env.SVJ_REWARD_TEST_DATABASE_URL;
const native = Boolean(connectionString);
if (process.env.SVJ_REWARD_REQUIRE_NATIVE === "true" && !native) {
  throw new Error("Native PostgreSQL is required for this command; use the ephemeral CI database URL.");
}
if (native) {
  const target = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
    "Reward database tests refuse remote hosts");
  assert.match(target.pathname, /^\/svj_rewards_test(?:_[a-z0-9]+)?$/,
    "Use a dedicated svj_rewards_test database");
}
const database = native ? new pg.Pool({ connectionString, max: 16 }) : new PGlite();
const execute = (sql, args = []) => database.query(sql, args);
const execScript = async (sql) => native ? database.query(sql) : database.exec(sql);
const schema = await readFile("supabase/pending/20260902_earned_plus.sql", "utf8");
const confirmation = "I completed the planned activity and wrote down my next useful step.";
const campaign = "earned-plus-launch-v1";

async function asRole(role, userId, sql, args = []) {
  assert.ok(["service_role", "authenticated", "anon"].includes(role));
  const run = async (client) => {
    await client.query("SET LOCAL ROLE " + role);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ role, ...(userId ? { sub: userId } : {}) })]);
    return client.query(sql, args);
  };
  if (!native) return database.transaction(run);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function rpc(name, userId, ...args) {
  assert.ok([
    "svj_get_engagement_state", "svj_claim_daily_checkin", "svj_start_daily_mission",
    "svj_complete_daily_mission", "svj_redeem_earned_plus",
  ].includes(name));
  const values = [userId, ...args];
  const query = "SELECT public." + name + "(" + values.map((_, i) => "$" + (i + 1)).join(",") + ") AS result";
  return (await asRole("service_role", null, query, values)).rows[0].result;
}
const state = (id) => rpc("svj_get_engagement_state", id);
const checkin = (id, requestId = randomUUID()) => rpc("svj_claim_daily_checkin", id, requestId);
const start = (id, key = "plan-and-reflect", requestId = randomUUID()) =>
  rpc("svj_start_daily_mission", id, requestId, key);
const complete = (id, assignmentId, requestId = randomUUID(), text = confirmation) =>
  rpc("svj_complete_daily_mission", id, requestId, assignmentId, text);
const redeem = (id, requestId = randomUUID()) => rpc("svj_redeem_earned_plus", id, requestId);

async function account({ verified = true, age = 35, xp = 100, email, lifetime = false, expiry = null } = {}) {
  const id = randomUUID();
  await execute(
    "INSERT INTO auth.users(id,email,email_confirmed_at,created_at) VALUES ($1,$2,CASE WHEN $3 THEN now() ELSE NULL END,now()-make_interval(days=>$4))",
    [id, email ?? id + "@example.test", verified, age],
  );
  await asRole("service_role", null,
    "UPDATE public.profiles SET total_xp=$2,is_plus_member=$3,plus_expires_at=$4 WHERE id=$1",
    [id, xp, lifetime || Boolean(expiry), expiry]);
  return id;
}
async function makeReady(assignmentId) {
  await execute(
    "UPDATE public.reward_mission_sessions s SET started_at=clock_timestamp()-make_interval(secs=>a.minimum_seconds+5),eligible_at=clock_timestamp()-interval '5 seconds' FROM public.reward_mission_assignments a WHERE a.id=s.assignment_id AND a.id=$1",
    [assignmentId]);
}
async function seedEligibility(id, { days = 21, balance = 3000 } = {}) {
  // Synthetic historical receipts, never a live account or a public mint API.
  assert.ok(Number.isInteger(days) && days > 0 && days <= 365);
  assert.ok(Number.isInteger(balance) && balance >= days * 50 && balance <= days * 150 && balance % 50 === 0,
    "Synthetic eligibility must use server-sized mission receipts");
  await execute(
    "INSERT INTO public.reward_wallets(user_id,reward_xp,qualifying_days) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET reward_xp=$2,qualifying_days=$3",
    [id, balance, days]);
  const missions = balance / 50;
  // Spread three-or-fewer 50 XP receipts over the requested qualifying days
  // in one statement, keeping the fixture fast while preserving real receipt
  // sizes and distinct source keys.
  await execute(
    "INSERT INTO public.reward_xp_ledger(user_id,campaign_id,policy_day,kind,source_key,reward_xp_delta) SELECT $1,$2,(clock_timestamp() AT TIME ZONE p.reward_timezone)::date-floor(g.i::numeric*$4/$3)::int,'mission_completion',gen_random_uuid(),50 FROM public.reward_policies p CROSS JOIN generate_series(0,$3-1) AS g(i) WHERE p.campaign_id=$2",
    [id, campaign, missions, days]);
}
async function enable() {
  // Avoid a midnight boundary flake when this suite runs in CI.
  await execute(
    "UPDATE public.reward_policies SET enabled=true,claims_enabled=true,launched_at=clock_timestamp()-interval '60 days',reward_timezone=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC')>=20 THEN 'America/New_York' ELSE 'UTC' END WHERE campaign_id=$1",
    [campaign]);
}

before(async () => {
  await execScript(await readFile("tests/fixtures/rewards-auth.sql", "utf8"));
  for (const name of (await readdir("supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
  await execScript(schema);
});
after(async () => {
  if (native) await database.end();
  else await database.close();
});

describe("Earned Plus SQL on " + (native ? "native PostgreSQL" : "isolated PostgreSQL/WASM"), { concurrency: false }, () => {
  it("ships disabled, applies twice without enabling or altering existing XP, and GET is read-only", async () => {
    const id = await account({ xp: 100285, lifetime: true });
    const initial = await state(id);
    assert.equal(initial.status, "disabled");
    assert.equal(initial.wallet.profileTotalXp, 100285);
    assert.equal(initial.wallet.rewardXp, 0);
    assert.equal(initial.account.lifetimeAccess, true);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_wallets")).rows[0].n, 0);
    await assert.rejects(checkin(id), /SVJ_REWARD_NOT_ENABLED/);
    await execScript(schema);
    assert.equal((await state(id)).status, "disabled");
    assert.equal((await state(id)).wallet.profileTotalXp, 100285);
    await enable();
  });

  it("uses the explicit policy timezone regardless of database session timezone", async () => {
    const id = await account();
    const result = await state(id);
    const expected = await execute(
      "SELECT (clock_timestamp() AT TIME ZONE reward_timezone)::date::text AS day FROM public.reward_policies WHERE campaign_id=$1", [campaign]);
    assert.equal(result.policyDay, expected.rows[0].day);
    assert.ok(Date.parse(result.nextResetAt) > Date.parse(result.serverNow));
    assert.ok(Date.parse(result.nextResetAt) - Date.parse(result.serverNow) <= 25 * 3600000);
  });

  it("grants one login receipt across retries/new request IDs without redeemable credit", async () => {
    const id = await account();
    const request = randomUUID();
    const first = await checkin(id, request);
    const replay = await checkin(id, request);
    const changedRequest = await checkin(id);
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(changedRequest.replayed, true);
    assert.equal(changedRequest.state.wallet.profileTotalXp, 110);
    assert.equal(changedRequest.state.wallet.rewardXp, 0);
    assert.equal(changedRequest.state.wallet.qualifyingDays, 0);
    assert.equal(changedRequest.state.wallet.currentLoginStreak, 1);
    const rows = await execute("SELECT count(*)::int AS n FROM public.reward_operations WHERE user_id=$1", [id]);
    assert.equal(rows.rows[0].n, 1);
  });

  it("awards the seventh-day milestone once and resets a missed streak without losing the best", async () => {
    const id = await account();
    await execute(
      "INSERT INTO public.reward_wallets(user_id,current_login_streak,best_login_streak,last_checkin_day) SELECT $1,6,20,(clock_timestamp() AT TIME ZONE reward_timezone)::date-1 FROM public.reward_policies WHERE campaign_id=$2",
      [id, campaign]);
    const result = await checkin(id);
    assert.equal(result.receipt.profileXpAwarded, 40);
    assert.equal(result.state.wallet.currentLoginStreak, 7);
    assert.equal(result.state.wallet.bestLoginStreak, 20);
    assert.equal((await checkin(id)).state.wallet.profileTotalXp, 140);

    const missed = await account();
    await execute(
      "INSERT INTO public.reward_wallets(user_id,current_login_streak,best_login_streak,last_checkin_day) SELECT $1,10,20,(clock_timestamp() AT TIME ZONE reward_timezone)::date-3 FROM public.reward_policies WHERE campaign_id=$2",
      [missed, campaign]);
    assert.equal((await state(missed)).wallet.currentLoginStreak, 0);
    const reset = await checkin(missed);
    assert.equal(reset.state.wallet.currentLoginStreak, 1);
    assert.equal(reset.state.wallet.bestLoginStreak, 20);
  });

  it("rejects unverified accounts before writing any wallet or receipt", async () => {
    const id = await account({ verified: false });
    await assert.rejects(checkin(id), /ACCOUNT_NOT_VERIFIED/);
    await assert.rejects(start(id), /ACCOUNT_NOT_VERIFIED/);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_wallets WHERE user_id=$1", [id])).rows[0].n, 0);
  });

  it("requires a server session, minimum time, and a completion reflection", async () => {
    const id = await account();
    await assert.rejects(complete(id, randomUUID()), /ASSIGNMENT_NOT_FOUND/);
    const begun = await start(id);
    const assignment = begun.receipt.assignmentId;
    await assert.rejects(complete(id, assignment), /MINIMUM_TIME_NOT_MET/);
    await makeReady(assignment);
    await assert.rejects(complete(id, assignment, randomUUID(), "done"), /CONFIRMATION_REQUIRED/);
    const finished = await complete(id, assignment);
    assert.equal(finished.state.wallet.rewardXp, 50);
    assert.equal(finished.state.wallet.qualifyingDays, 1);
    assert.equal(finished.state.wallet.profileTotalXp, 150);
    assert.equal(finished.state.missions.find((x) => x.assignmentId === assignment).status, "completed");
    assert.equal((await complete(id, assignment)).state.wallet.rewardXp, 50);
  });

  it("permits only one active mission, resumes its receipt, and caps a day at 150 Reward XP", async () => {
    const id = await account();
    const first = await start(id, "intentional-movement");
    assert.equal((await start(id, "intentional-movement")).receipt.assignmentId, first.receipt.assignmentId);
    await assert.rejects(start(id, "focused-practice"), /MISSION_ALREADY_RUNNING/);
    await makeReady(first.receipt.assignmentId);
    await complete(id, first.receipt.assignmentId);
    for (const key of ["focused-practice", "plan-and-reflect"]) {
      const next = await start(id, key);
      await makeReady(next.receipt.assignmentId);
      await complete(id, next.receipt.assignmentId);
    }
    const result = await state(id);
    assert.equal(result.wallet.rewardXp, 150);
    assert.equal(result.wallet.qualifyingDays, 1);
    assert.equal(result.wallet.missionsCompletedToday, 3);
    await complete(id, first.receipt.assignmentId);
    assert.equal((await state(id)).wallet.rewardXp, 150);
  });

  it("does not let custom task names or client-selected difficulties mint Reward XP", async () => {
    const id = await account({ xp: 999999 });
    for (let i = 0; i < 100; i++) {
      await assert.rejects(start(id, "custom-elite-task-" + i), /MISSION_NOT_FOUND/);
    }
    const result = await state(id);
    assert.equal(result.wallet.rewardXp, 0);
    assert.equal(result.wallet.qualifyingDays, 0);
    assert.equal(result.wallet.profileTotalXp, 999999);
  });

  it("keeps reward tables and RPCs private while RLS hides another user's wallet", async () => {
    const first = await account();
    const second = await account();
    await checkin(first);
    const hidden = await asRole("authenticated", second,
      "SELECT user_id FROM public.reward_wallets WHERE user_id=$1", [first]);
    const visible = await asRole("authenticated", first,
      "SELECT user_id FROM public.reward_wallets WHERE user_id=$1", [first]);
    assert.equal(hidden.rows.length, 0);
    assert.equal(visible.rows.length, 1);
    await assert.rejects(
      asRole("authenticated", first, "INSERT INTO public.reward_wallets(user_id) VALUES ($1)", [first]),
      /permission denied|row-level security/i,
    );
    await assert.rejects(
      asRole("authenticated", first, "SELECT public.svj_get_engagement_state($1)", [first]),
      /permission denied/i,
    );
  });

  it("freezes server-assigned mission rewards and rejects a request reused for another action", async () => {
    const id = await account();
    const begun = await start(id, "intentional-movement");
    await assert.rejects(
      asRole("service_role", null,
        "UPDATE public.reward_mission_assignments SET reward_xp=reward_xp+50 WHERE id=$1",
        [begun.receipt.assignmentId]),
      /SVJ_REWARD_ASSIGNMENT_IMMUTABLE/,
    );
    const requestId = randomUUID();
    await checkin(id, requestId);
    await assert.rejects(start(id, "plan-and-reflect", requestId), /SVJ_REWARD_REQUEST_REUSED/);
    assert.equal((await state(id)).wallet.rewardXp, 0);
  });

  it("expires an unfinished session and never credits it after the daily reset", async () => {
    const id = await account();
    const begun = await start(id);
    await execute(
      "UPDATE public.reward_mission_sessions SET expired_at=clock_timestamp() WHERE assignment_id=$1",
      [begun.receipt.assignmentId],
    );
    await assert.rejects(complete(id, begun.receipt.assignmentId), /SVJ_REWARD_SESSION_EXPIRED/);
    const result = await state(id);
    assert.equal(result.wallet.rewardXp, 0);
    assert.equal(result.wallet.qualifyingDays, 0);
    assert.equal(result.missions.find((mission) => mission.assignmentId === begun.receipt.assignmentId).status, "expired");
  });

  it("checks every claim requirement on the server before spending Reward XP", async () => {
    const tooNew = await account({ age: 20 });
    await seedEligibility(tooNew);
    await assert.rejects(redeem(tooNew), /SVJ_REWARD_ACCOUNT_TOO_NEW/);

    const tooFewDays = await account();
    await seedEligibility(tooFewDays, { days: 20, balance: 3000 });
    await assert.rejects(redeem(tooFewDays), /SVJ_REWARD_QUALIFYING_DAYS_REQUIRED/);

    const tooFewXp = await account();
    await seedEligibility(tooFewXp, { days: 21, balance: 2950 });
    await assert.rejects(redeem(tooFewXp), /SVJ_REWARD_XP_REQUIRED/);

    for (const id of [tooNew, tooFewDays, tooFewXp]) {
      const wallet = (await execute("SELECT reward_xp,qualifying_days FROM public.reward_wallets WHERE user_id=$1", [id])).rows[0];
      assert.ok(wallet.reward_xp > 0);
      assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE user_id=$1", [id])).rows[0].n, 0);
    }
  });

  it("redeems once atomically, preserves Profile XP, and replays the original receipt", async () => {
    const id = await account({ xp: 777 });
    await seedEligibility(id);
    const seeded = (await execute("SELECT w.reward_xp,w.qualifying_days,COALESCE(sum(l.reward_xp_delta),0)::int AS ledger_xp,count(DISTINCT l.policy_day) FILTER (WHERE l.kind='mission_completion')::int AS ledger_days FROM public.reward_wallets w LEFT JOIN public.reward_xp_ledger l ON l.user_id=w.user_id WHERE w.user_id=$1 GROUP BY w.reward_xp,w.qualifying_days", [id])).rows[0];
    assert.deepEqual(seeded, { reward_xp: 3000, qualifying_days: 21, ledger_xp: 3000, ledger_days: 21 });
    const requestId = randomUUID();
    const first = await redeem(id, requestId);
    assert.equal(first.replayed, false);
    assert.equal(first.receipt.rewardXpSpent, 3000);
    assert.equal(first.state.wallet.rewardXp, 0);
    assert.equal(first.state.wallet.profileTotalXp, 777);
    assert.equal(first.state.account.plusActive, true);
    assert.ok(Date.parse(first.receipt.plusExpiresAt) > Date.now() + 29 * 86400000);
    const replay = await redeem(id, requestId);
    assert.equal(replay.replayed, true);
    assert.equal(replay.receipt.redemptionId, first.receipt.redemptionId);
    await assert.rejects(redeem(id), /SVJ_REWARD_ALREADY_REDEEMED/);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE user_id=$1", [id])).rows[0].n, 1);
    assert.equal((await execute("SELECT reward_xp,total_xp,is_plus_member FROM public.reward_wallets w JOIN public.profiles p ON p.id=w.user_id WHERE w.user_id=$1", [id])).rows[0].reward_xp, 0);
  });

  it("extends an existing timed Plus period and never replaces Founder lifetime access", async () => {
    const expiry = new Date(Date.now() + 10 * 86400000).toISOString();
    const timed = await account({ expiry });
    await seedEligibility(timed);
    const claimed = await redeem(timed);
    assert.ok(Date.parse(claimed.receipt.plusExpiresAt) >= Date.parse(expiry) + 29 * 86400000);

    const founder = await account({ lifetime: true });
    await seedEligibility(founder);
    await assert.rejects(redeem(founder), /SVJ_REWARD_LIFETIME_ALREADY_ACTIVE/);
    const unchanged = (await execute("SELECT reward_xp,plus_expires_at FROM public.reward_wallets w JOIN public.profiles p ON p.id=w.user_id WHERE w.user_id=$1", [founder])).rows[0];
    assert.equal(unchanged.reward_xp, 3000);
    assert.equal(unchanged.plus_expires_at, null);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE user_id=$1", [founder])).rows[0].n, 0);
  });

  it("allows only one redemption for a verified identity shared by two accounts", async () => {
    const email = "shared-verified@example.test";
    const first = await account({ email });
    const second = await account({ email });
    await seedEligibility(first);
    await seedEligibility(second);
    await redeem(first);
    await assert.rejects(redeem(second), /SVJ_REWARD_ALREADY_REDEEMED/);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE verified_identity=$1", [email])).rows[0].n, 1);
    assert.equal((await state(second)).wallet.rewardXp, 3000);
  });

  it("refuses a corrupted wallet or ledger and leaves all claim state untouched", async () => {
    const id = await account();
    await seedEligibility(id);
    await execute("UPDATE public.reward_wallets SET reward_xp=3001 WHERE user_id=$1", [id]);
    await assert.rejects(redeem(id), /SVJ_REWARD_LEDGER_MISMATCH/);
    const row = (await execute("SELECT reward_xp FROM public.reward_wallets WHERE user_id=$1", [id])).rows[0];
    assert.equal(row.reward_xp, 3001);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE user_id=$1", [id])).rows[0].n, 0);
  });

  it("rolls back the debit and redemption when the membership write fails", async () => {
    const id = await account();
    await seedEligibility(id);
    await execScript(`
      CREATE OR REPLACE FUNCTION public.test_block_earned_plus_profile()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.is_plus_member = true AND COALESCE(OLD.is_plus_member, false) = false THEN
          RAISE EXCEPTION 'SVJ_TEST_PROFILE_WRITE';
        END IF;
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS test_block_earned_plus_profile ON public.profiles;
      CREATE TRIGGER test_block_earned_plus_profile BEFORE UPDATE ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.test_block_earned_plus_profile();
    `);
    await assert.rejects(redeem(id), /SVJ_TEST_PROFILE_WRITE/);
    assert.equal((await execute("SELECT reward_xp FROM public.reward_wallets WHERE user_id=$1", [id])).rows[0].reward_xp, 3000);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE user_id=$1", [id])).rows[0].n, 0);
    await execScript("DROP TRIGGER test_block_earned_plus_profile ON public.profiles; DROP FUNCTION public.test_block_earned_plus_profile();");
    const retry = await redeem(id);
    assert.equal(retry.replayed, false);
    assert.equal(retry.state.wallet.rewardXp, 0);
  });

  it("cascades reward receipts when a disposable account is deleted", async () => {
    const id = await account();
    await checkin(id);
    const begun = await start(id);
    await execute("DELETE FROM auth.users WHERE id=$1", [id]);
    for (const [table, column] of [
      ["profiles", "id"], ["reward_wallets", "user_id"], ["reward_daily_checkins", "user_id"],
      ["reward_mission_assignments", "user_id"], ["reward_mission_sessions", "user_id"],
      ["reward_xp_ledger", "user_id"], ["reward_operations", "user_id"], ["reward_redemptions", "user_id"],
    ]) {
      assert.equal((await execute("SELECT count(*)::int AS n FROM public." + table + " WHERE " + column + "=$1", [id])).rows[0].n, 0,
        table + " did not cascade");
    }
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_mission_sessions WHERE assignment_id=$1", [begun.receipt.assignmentId])).rows[0].n, 0);
  });

  it("serializes same-user redemption retries on native PostgreSQL", { skip: !native }, async () => {
    const id = await account();
    await seedEligibility(id);
    const requestId = randomUUID();
    const results = await Promise.allSettled([redeem(id, requestId), redeem(id, requestId)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    const values = results.map((result) => result.status === "fulfilled" ? result.value : null);
    assert.equal(values.filter(Boolean).filter((value) => value.replayed === false).length, 1);
    assert.equal(values.filter(Boolean).filter((value) => value.replayed === true).length, 1);
    assert.equal((await state(id)).wallet.rewardXp, 0);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE user_id=$1", [id])).rows[0].n, 1);
  });

  it("serializes verified-identity redemption races on native PostgreSQL", { skip: !native }, async () => {
    const email = "concurrent-verified@example.test";
    const first = await account({ email });
    const second = await account({ email });
    await seedEligibility(first);
    await seedEligibility(second);
    const results = await Promise.allSettled([redeem(first), redeem(second)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.match(String(rejected?.reason?.message ?? rejected?.reason), /SVJ_REWARD_ALREADY_REDEEMED/);
    assert.equal((await execute("SELECT count(*)::int AS n FROM public.reward_redemptions WHERE verified_identity=$1", [email])).rows[0].n, 1);
  });
});
