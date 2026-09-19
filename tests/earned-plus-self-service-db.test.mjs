// Real-PostgreSQL authorization-chain tests for the Earn Plus self-service
// RPC layer (supabase/migrations/20260920000000_earned_plus_self_service.sql).
//
// These run against the SAME disposable in-memory engine (or explicit local
// database) as tests/engagement-db.test.mjs and execute the actual SQL as
// actual PostgreSQL roles (SET LOCAL ROLE + JWT claims), proving the
// delegation chain: authenticated role → self-service RPC → internal impl →
// reward logic — WITHOUT any service-role key.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

let savedLocationDescriptor = null;
let locationWasPoisoned = false;
const locationIsPoisoned = () => {
  try {
    void globalThis.location?.href;
    return false;
  } catch {
    return true;
  }
};

const connectionString = process.env.SVJ_REWARD_TEST_DATABASE_URL;
const native = Boolean(connectionString);
if (native) {
  const target = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  assert.match(target.pathname, /^\/svj_rewards_test(?:_[a-z0-9]+)?$/);
}
let database = native ? new pg.Pool({ connectionString, max: 16 }) : new PGlite();
// jsdom UI suites share this process and can leave a torn-down `window`
// global whose non-configurable `location` getter throws. Emscripten's WASM
// loader reads window.location during PGlite startup and would crash. That
// environment is unfixable from here (jsdom window properties are
// unforgeable), so detect it and SKIP the suite — run this file in isolation
// or set SVJ_REWARD_TEST_DATABASE_URL for a local PostgreSQL database.
const domEnvironmentIsBroken = () => {
  if (typeof window === "undefined") return locationIsPoisoned();
  try {
    void window.location?.pathname;
    return locationIsPoisoned();
  } catch {
    return true;
  }
};
let skipAll = false;
const ensureDatabase = async () => {
  if (native) return;
  if (domEnvironmentIsBroken()) {
    skipAll = true;
    database.close().catch(() => {});
  }
};
const SKIP_MESSAGE = "polluted DOM runtime — run in isolation or set SVJ_REWARD_TEST_DATABASE_URL";
const execute = (sql, args = []) => database.query(sql, args);
const execScript = async (sql) => (native ? database.query(sql) : database.exec(sql));

const campaign = "earned-plus-launch-v1";
const confirmation = "I completed the planned activity and wrote down my next useful step.";

async function asRole(role, userId, sql, args = []) {
  assert.ok(["service_role", "authenticated", "anon"].includes(role));
  const run = async (client) => {
    await client.query("SET LOCAL ROLE " + role);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
    ]);
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

const SELF_RPC = "SELECT public.%NAME%(%ARGS%) AS result";
async function callSelfService(name, role, userId, args = []) {
  const placeholders = args.map((_, i) => "$" + (i + 1)).join(",");
  const sql = SELF_RPC.replace("%NAME%", name).replace("%ARGS%", placeholders);
  return asRole(role, userId, sql, args);
}
async function callPrivileged(name, role, userId, args = []) {
  const placeholders = args.map((_, i) => "$" + (i + 1)).join(",");
  const sql = "SELECT public." + name + "(" + placeholders + ") AS result";
  return asRole(role, userId, sql, args);
}

async function account({ verified = true, age = 35, email, lifetime = false, expiry = null } = {}) {
  const id = randomUUID();
  await execute(
    "INSERT INTO auth.users(id,email,email_confirmed_at,created_at) VALUES ($1,$2,CASE WHEN $3 THEN now() ELSE NULL END,now()-make_interval(days=>$4))",
    [id, email ?? id + "@example.test", verified, age],
  );
  await execute(
    "INSERT INTO public.profiles(id,email,total_xp) VALUES ($1,$2,100) ON CONFLICT (id) DO NOTHING",
    [id, email ?? id + "@example.test"],
  );
  // Membership columns are server-privileged; seed them as service_role so
  // the protection trigger treats it exactly like a real backend write.
  if (lifetime || expiry) {
    await asRole(
      "service_role",
      null,
      "UPDATE public.profiles SET is_plus_member=$2, plus_expires_at=$3 WHERE id=$1",
      [id, lifetime || Boolean(expiry), expiry],
    );
  }
  return id;
}

async function seedEligibility(id, { days = 20, balance = 3000 } = {}) {
  await execute(
    "INSERT INTO public.reward_wallets(user_id,reward_xp,qualifying_days) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET reward_xp=$2,qualifying_days=$3",
    [id, balance, days],
  );
  const missions = balance / 50;
  await execute(
    "INSERT INTO public.reward_xp_ledger(user_id,campaign_id,policy_day,kind,source_key,reward_xp_delta) SELECT $1,$2,(clock_timestamp() AT TIME ZONE p.reward_timezone)::date-floor(g.i::numeric*$4/$3)::int,'mission_completion',gen_random_uuid(),50 FROM public.reward_policies p CROSS JOIN generate_series(0,$3-1) AS g(i) WHERE p.campaign_id=$2",
    [id, campaign, missions, days],
  );
}

async function enable() {
  await execute(
    "UPDATE public.reward_policies SET enabled=true,claims_enabled=true,launched_at=clock_timestamp()-interval '60 days',reward_timezone=CASE WHEN extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC')>=20 THEN 'America/New_York' ELSE 'UTC' END WHERE campaign_id=$1",
    [campaign],
  );
}

async function totalXp(id) {
  const r = await execute(
    "SELECT COALESCE(total_xp, 0)::int AS xp FROM public.profiles WHERE id=$1",
    [id],
  );
  return r.rows[0].xp;
}

async function makeReady(assignmentId) {
  await execute(
    "UPDATE public.reward_mission_sessions s SET started_at=clock_timestamp()-make_interval(secs=>a.minimum_seconds+5),eligible_at=clock_timestamp()-interval '5 seconds' FROM public.reward_mission_assignments a WHERE a.id=s.assignment_id AND a.id=$1",
    [assignmentId],
  );
}

before(async () => {
  await ensureDatabase();
  if (skipAll) {
    console.warn(
      `[skip] Earn Plus self-service DB chain: ${SKIP_MESSAGE} — this suite still runs standalone (bun test tests/earned-plus-self-service-db.test.mjs) or against local PostgreSQL.`,
    );
    return;
  }
  await execScript(await readFile("tests/fixtures/rewards-auth.sql", "utf8"));
  for (const name of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql") && x < "20260920000000")
    .sort()) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
  // PRODUCTION PARITY: production still runs the PRE-trusted-write trigger
  // bodies from the already-applied historical migrations. Recreate the OLD
  // trigger definitions on top (as production has them), then prove the new
  // migration alone upgrades them. Extracted from the c929d01~1 (pre-hotfix)
  // versions of the historical files via `git show`.
  await execScript(await readFile("tests/fixtures/pre-hotfix-triggers.sql", "utf8"));
  await execScript(await readFile("supabase/pending/20260902_earned_plus.sql", "utf8"));
  await execScript(
    await readFile("supabase/pending/20260903_earned_plus_qualifying_days_7.sql", "utf8"),
  );
  // The migrations under test, applied exactly as they will be deployed:
  // 20260920000000 is already live in production and the later hardening
  // migrations ride on top of it in filename order.
  for (const name of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql") && x >= "20260920000000")
    .sort()) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
  await enable();
});

after(async () => {
  if (!database || skipAll) return;
  if (native) await database.end();
  else await database.close();
});

describe(
  "Earn Plus self-service authorization chain (real SQL roles)",
  { concurrency: false },
  () => {
    it("1-2. authenticated caller executes svj_get_my_engagement_state() WITHOUT service_role", async () => {
      if (skipAll) return;
      const id = await account();
      const result = await callSelfService("svj_get_my_engagement_state", "authenticated", id);
      assert.equal(result.rows[0].result.status, "ready");
      assert.equal(result.rows[0].result.userId, id);
      assert.equal(result.rows[0].result.policy.claimsEnabled, true);
    });

    it("3. authenticated caller CANNOT invoke the original privileged RPC directly", async () => {
      if (skipAll) return;
      const id = await account();
      await assert.rejects(
        () => callPrivileged("svj_get_engagement_state", "authenticated", id, [id]),
        (error) =>
          /permission denied|does not exist|SVJ_REWARD_SERVICE_ROLE_REQUIRED/i.test(error.message),
      );
    });

    it("4. anon can invoke neither the privileged nor the self-service RPC", async () => {
      if (skipAll) return;
      const id = await account();
      await assert.rejects(
        () => callPrivileged("svj_get_engagement_state", "anon", null, [id]),
        (error) => /permission denied|does not exist/i.test(error.message),
      );
      await assert.rejects(
        () => callSelfService("svj_get_my_engagement_state", "anon", null),
        (error) =>
          /permission denied|does not exist|Authenticated user required/i.test(error.message),
      );
    });

    it("5-6. self-service identity equals auth.uid(); no client user id is even accepted", async () => {
      if (skipAll) return;
      const id = await account();
      const state = (await callSelfService("svj_get_my_engagement_state", "authenticated", id))
        .rows[0].result;
      assert.equal(state.userId, id);
      // The signatures take no user parameter at all; a forged identity is
      // impossible by construction. Prove it: the RPC arg list is only what the
      // signature declares.
      const signatures = await execute(
        "SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('svj_get_my_engagement_state','svj_claim_my_daily_checkin','svj_start_my_daily_mission','svj_complete_my_daily_mission','svj_redeem_my_earned_plus')",
      );
      assert.equal(signatures.rows.length, 5, "all five self-service RPCs exist");
      for (const row of signatures.rows) {
        assert.ok(!/user_id|p_user/i.test(row.args), `${row.proname} must not accept a user id`);
      }
    });

    it("7. duplicate check-in request awards exactly once", async () => {
      if (skipAll) return;
      const id = await account();
      const requestId = randomUUID();
      const first = (
        await callSelfService("svj_claim_my_daily_checkin", "authenticated", id, [requestId])
      ).rows[0].result;
      assert.equal(first.replayed, false);
      const second = (
        await callSelfService("svj_claim_my_daily_checkin", "authenticated", id, [requestId])
      ).rows[0].result;
      assert.equal(second.replayed, true);
      const rows = await execute(
        "SELECT count(*)::int AS n FROM public.reward_daily_checkins WHERE user_id=$1",
        [id],
      );
      assert.equal(rows.rows[0].n, 1);
    });

    it("8. duplicate mission-complete request awards exactly once", async () => {
      if (skipAll) return;
      const id = await account();
      const requestId = randomUUID();
      const startReceipt = (
        await callSelfService("svj_start_my_daily_mission", "authenticated", id, [
          requestId,
          "plan-and-reflect",
        ])
      ).rows[0].result;
      await makeReady(startReceipt.receipt.assignmentId);
      const completeId = randomUUID();
      const done = (
        await callSelfService("svj_complete_my_daily_mission", "authenticated", id, [
          completeId,
          startReceipt.receipt.assignmentId,
          confirmation,
        ])
      ).rows[0].result;
      assert.equal(done.replayed, false);
      assert.ok(done.receipt.rewardXpAwarded > 0);
      const again = (
        await callSelfService("svj_complete_my_daily_mission", "authenticated", id, [
          completeId,
          startReceipt.receipt.assignmentId,
          confirmation,
        ])
      ).rows[0].result;
      assert.equal(again.replayed, true);
      const ledger = await execute(
        "SELECT count(*)::int AS n FROM public.reward_xp_ledger WHERE user_id=$1 AND kind='mission_completion' AND source_key=$2",
        [id, startReceipt.receipt.assignmentId],
      );
      assert.equal(ledger.rows[0].n, 1);
    });

    it("9. mission timing is enforced by the database clock (too-early completion rejected)", async () => {
      if (skipAll) return;
      const id = await account();
      const receipt = (
        await callSelfService("svj_start_my_daily_mission", "authenticated", id, [
          randomUUID(),
          "plan-and-reflect",
        ])
      ).rows[0].result;
      await assert.rejects(
        () =>
          callSelfService("svj_complete_my_daily_mission", "authenticated", id, [
            randomUUID(),
            receipt.receipt.assignmentId,
            confirmation,
          ]),
        (error) => /SVJ_REWARD_MINIMUM_TIME_NOT_MET/i.test(error.message),
      );
    });

    it("10. qualifying day added exactly once per completion", async () => {
      if (skipAll) return;
      const id = await account();
      const requestId = randomUUID();
      const receipt = (
        await callSelfService("svj_start_my_daily_mission", "authenticated", id, [
          requestId,
          "plan-and-reflect",
        ])
      ).rows[0].result;
      await makeReady(receipt.receipt.assignmentId);
      await callSelfService("svj_complete_my_daily_mission", "authenticated", id, [
        randomUUID(),
        receipt.receipt.assignmentId,
        confirmation,
      ]);
      const wallet = await execute(
        "SELECT qualifying_days FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      assert.equal(wallet.rows[0].qualifying_days, 1);
    });

    it("11. daily Reward XP cap preserved (third 50XP mission on an exhausted day rejected)", async () => {
      if (skipAll) return;
      const id = await account();
      // Simulate three earlier 50-XP mission completions today (150/150 cap).
      const day = (
        await execute(
          "SELECT (clock_timestamp() AT TIME ZONE reward_timezone)::date AS d FROM public.reward_policies WHERE campaign_id=$1",
          [campaign],
        )
      ).rows[0].d;
      await execute(
        "INSERT INTO public.reward_xp_ledger(user_id,campaign_id,policy_day,kind,source_key,reward_xp_delta) SELECT $1,$2,$3,'mission_completion',gen_random_uuid(),50 FROM generate_series(1,3)",
        [id, campaign, day],
      );
      const receipt = (
        await callSelfService("svj_start_my_daily_mission", "authenticated", id, [
          randomUUID(),
          "plan-and-reflect",
        ])
      ).rows[0].result;
      await makeReady(receipt.receipt.assignmentId);
      await assert.rejects(
        () =>
          callSelfService("svj_complete_my_daily_mission", "authenticated", id, [
            randomUUID(),
            receipt.receipt.assignmentId,
            confirmation,
          ]),
        (error) => /SVJ_REWARD_DAILY_CAP_REACHED/i.test(error.message),
      );
    });

    it("12. Founder lifetime access can never be shortened", async () => {
      if (skipAll) return;
      const id = await account({ lifetime: true });
      await seedEligibility(id);
      await assert.rejects(
        () => callSelfService("svj_redeem_my_earned_plus", "authenticated", id, [randomUUID()]),
        (error) => /SVJ_REWARD_LIFETIME_ALREADY_ACTIVE/i.test(error.message),
      );
      const profile = await execute("SELECT plus_expires_at FROM public.profiles WHERE id=$1", [
        id,
      ]);
      assert.equal(profile.rows[0].plus_expires_at, null);
    });

    it("13. timed Plus extends correctly (not replaced)", async () => {
      if (skipAll) return;
      const id = await account({ expiry: new Date(Date.now() + 10 * 86400000).toISOString() });
      await seedEligibility(id);
      const receipt = (
        await callSelfService("svj_redeem_my_earned_plus", "authenticated", id, [randomUUID()])
      ).rows[0].result;
      const base = new Date(receipt.receipt.plusExpiresAt).getTime();
      const old = new Date(Date.now() + 10 * 86400000).getTime();
      assert.ok(base > old + 29 * 86400000, "expiry must be old expiry + ~30 days");
    });

    it("14. claims_enabled=false rejects redemption", async () => {
      if (skipAll) return;
      const id = await account();
      await seedEligibility(id);
      await execute("UPDATE public.reward_policies SET claims_enabled=false WHERE campaign_id=$1", [
        campaign,
      ]);
      try {
        await assert.rejects(
          () => callSelfService("svj_redeem_my_earned_plus", "authenticated", id, [randomUUID()]),
          (error) => /SVJ_REWARD_CLAIMS_NOT_ENABLED/i.test(error.message),
        );
      } finally {
        await enable();
      }
    });

    it("15. reward policy disabled rejects earning", async () => {
      if (skipAll) return;
      const id = await account();
      // claims_enabled implies enabled (existing CHECK), so pause both.
      await execute(
        "UPDATE public.reward_policies SET claims_enabled=false, enabled=false WHERE campaign_id=$1",
        [campaign],
      );
      try {
        await assert.rejects(
          () => callSelfService("svj_claim_my_daily_checkin", "authenticated", id, [randomUUID()]),
          (error) => /SVJ_REWARD_NOT_ENABLED/i.test(error.message),
        );
      } finally {
        await enable();
      }
    });

    it("16. a request ID reused against a different operation fails", async () => {
      if (skipAll) return;
      const id = await account();
      const requestId = randomUUID();
      await callSelfService("svj_claim_my_daily_checkin", "authenticated", id, [requestId]);
      await assert.rejects(
        () =>
          callSelfService("svj_start_my_daily_mission", "authenticated", id, [
            requestId,
            "plan-and-reflect",
          ]),
        (error) => /SVJ_REWARD_REQUEST_REUSED/i.test(error.message),
      );
    });

    it("17. no client write access to reward ledger/wallet tables", async () => {
      if (skipAll) return;
      const id = await account();
      for (const [table, sql] of [
        ["reward_wallets", "UPDATE public.reward_wallets SET reward_xp=999999 WHERE user_id=$1"],
        [
          "reward_xp_ledger",
          "INSERT INTO public.reward_xp_ledger(user_id,campaign_id,policy_day,kind,source_key,reward_xp_delta) VALUES ($1,'earned-plus-launch-v1',(now() AT TIME ZONE 'UTC')::date,'mission_completion',gen_random_uuid(),999)",
        ],
        [
          "reward_redemptions",
          "INSERT INTO public.reward_redemptions(user_id,verified_identity,campaign_id,reward_xp_spent,plus_starts_at,plus_expires_at) VALUES ($1,'x',$2,0,now(),now())",
        ],
      ]) {
        await assert.rejects(
          () =>
            asRole(
              "authenticated",
              id,
              sql,
              table === "reward_redemptions" ? [id, campaign] : [id],
            ),
          (error) => /permission denied/i.test(error.message),
          `${table} must deny client writes`,
        );
      }
    });

    it("18. original service-role flows remain operational through the same impl", async () => {
      if (skipAll) return;
      const id = await account();
      const state = (await callPrivileged("svj_get_engagement_state", "service_role", null, [id]))
        .rows[0].result;
      assert.equal(state.status, "ready");
      const receipt = (
        await callPrivileged("svj_claim_daily_checkin", "service_role", null, [id, randomUUID()])
      ).rows[0].result;
      assert.equal(receipt.replayed, false);
      assert.ok(receipt.receipt.profileXpAwarded > 0);
    });

    it("regression: the self-service RPCs delegate to impl functions, never to a service-role-gated function", async () => {
      if (skipAll) return;
      const migration = await readFile(
        "supabase/migrations/20260920000000_earned_plus_self_service.sql",
        "utf8",
      );
      // Extract each self-service function body.
      const bodies = [
        ...migration.matchAll(
          /CREATE OR REPLACE FUNCTION public\.(svj_\w+_my_\w+)[\s\S]*?AS \$\$\n([\s\S]*?)\n\$\$;/g,
        ),
      ];
      assert.ok(bodies.length >= 5, "all five self-service functions found");
      for (const [, name, body] of bodies) {
        assert.ok(
          !_implForbidden.some((fn) => body.includes(fn + "(")),
          `${name} must not call the service-role-gated entry points`,
        );
        assert.ok(/_impl\(/.test(body), `${name} must delegate to an internal impl function`);
      }
      // And no impl body contains the service-role assertion.
      const impls = [
        ...migration.matchAll(
          /CREATE OR REPLACE FUNCTION public\.(svj_\w+_impl)[\s\S]*?AS \$\$\n([\s\S]*?)\n\$\$;/g,
        ),
      ];
      assert.ok(impls.length >= 5, "internal impl functions exist");
      for (const [, name, body] of impls) {
        assert.ok(!/svj_assert_reward_service_role/.test(body), `${name} must be assertion-free`);
      }
    });

    it("regression: internal impl functions are revoked from PUBLIC, anon AND authenticated", async () => {
      if (skipAll) return;
      const id = await account();
      await assert.rejects(
        () =>
          asRole("authenticated", id, "SELECT public.svj_claim_daily_checkin_impl($1,$2)", [
            id,
            randomUUID(),
          ]),
        (error) => /permission denied|does not exist/i.test(error.message),
      );
      await assert.rejects(
        () => asRole("anon", null, "SELECT public.svj_lock_reward_wallet_impl($1)", [id]),
        (error) => /permission denied|does not exist/i.test(error.message),
      );
    });

    // ── PRODUCTION-PARITY UPGRADE PROOFS ────────────────────────────────────
    // The `before` hook installed the PRE-hotfix trigger bodies (as the live
    // database still has them) BEFORE this migration ran. Every assertion
    // below therefore proves that applying ONLY the new migration to an OLD
    // production-style schema is sufficient.

    it("upgrade: the migration itself replaced the old trigger bodies", async () => {
      if (skipAll) return;
      const def = await execute(
        "SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='protect_profile_privileged_columns'",
      );
      assert.match(def.rows[0].d, /svj\.trusted_server_write/);
      const def2 = await execute(
        "SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='protect_engagement_profile_xp'",
      );
      assert.match(def2.rows[0].d, /svj\.trusted_server_write/);
    });

    it("upgrade: check-in ACTUALLY increments profiles.total_xp under the OLD trigger", async () => {
      if (skipAll) return;
      const id = await account();
      const before = await totalXp(id);
      const receipt = (
        await callSelfService("svj_claim_my_daily_checkin", "authenticated", id, [randomUUID()])
      ).rows[0].result;
      assert.ok(receipt.receipt.profileXpAwarded > 0);
      const after = await totalXp(id);
      assert.equal(after - before, receipt.receipt.profileXpAwarded, "profile XP must persist");
    });

    it("upgrade: mission completion ACTUALLY increments profiles.total_xp and stays consistent", async () => {
      if (skipAll) return;
      const id = await account();
      const start = (
        await callSelfService("svj_start_my_daily_mission", "authenticated", id, [
          randomUUID(),
          "plan-and-reflect",
        ])
      ).rows[0].result;
      await makeReady(start.receipt.assignmentId);
      const before = await totalXp(id);
      const done = (
        await callSelfService("svj_complete_my_daily_mission", "authenticated", id, [
          randomUUID(),
          start.receipt.assignmentId,
          confirmation,
        ])
      ).rows[0].result;
      assert.equal((await totalXp(id)) - before, done.receipt.profileXpAwarded);
      const wallet = await execute(
        "SELECT reward_xp, qualifying_days FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      const ledger = await execute(
        "SELECT COALESCE(sum(reward_xp_delta),0)::int AS s FROM public.reward_xp_ledger WHERE user_id=$1",
        [id],
      );
      assert.equal(wallet.rows[0].reward_xp, ledger.rows[0].s, "wallet and ledger must agree");
    });

    it("upgrade: Founder lifetime survives redemption attempts under the upgraded trigger", async () => {
      if (skipAll) return;
      const id = await account({ lifetime: true });
      await seedEligibility(id);
      await assert.rejects(
        () => callSelfService("svj_redeem_my_earned_plus", "authenticated", id, [randomUUID()]),
        (error) => /SVJ_REWARD_LIFETIME_ALREADY_ACTIVE/i.test(error.message),
      );
      const profile = await execute(
        "SELECT is_plus_member, plus_expires_at FROM public.profiles WHERE id=$1",
        [id],
      );
      assert.equal(profile.rows[0].is_plus_member, true);
      assert.equal(profile.rows[0].plus_expires_at, null);
    });

    it("upgrade: timed Plus redemption ACTUALLY activates membership (no silent trigger revert)", async () => {
      if (skipAll) return;
      const id = await account({ expiry: new Date(Date.now() + 10 * 86400000).toISOString() });
      await seedEligibility(id);
      const receipt = (
        await callSelfService("svj_redeem_my_earned_plus", "authenticated", id, [randomUUID()])
      ).rows[0].result;
      const redemption = await execute(
        "SELECT plus_expires_at FROM public.reward_redemptions WHERE user_id=$1",
        [id],
      );
      assert.equal(redemption.rows.length, 1, "redemption row exists");
      const profile = await execute(
        "SELECT is_plus_member, plus_expires_at FROM public.profiles WHERE id=$1",
        [id],
      );
      assert.equal(profile.rows[0].is_plus_member, true, "is_plus_member must be written");
      assert.equal(
        new Date(profile.rows[0].plus_expires_at).getTime(),
        new Date(redemption.rows[0].plus_expires_at).getTime(),
        "redemption row and live membership MUST agree — a revert here is the production bug",
      );
      assert.ok(
        new Date(receipt.receipt.plusExpiresAt).getTime() > Date.now() + 39 * 86400000,
        "expiry = old expiry + 30 days",
      );
    });

    it("upgrade: unauthorized authenticated profile updates still cannot alter protected fields", async () => {
      if (skipAll) return;
      const id = await account();
      // Protected columns are column-REVOKEd from authenticated, so the write
      // is denied outright; if a role ever regains the grant, the recreated
      // trigger must still revert the values. Either protection is acceptable.
      try {
        await asRole(
          "authenticated",
          id,
          "UPDATE public.profiles SET is_plus_member=true, plus_expires_at=now()+interval '365 days', total_xp=999999 WHERE id=$1",
          [id],
        );
      } catch (error) {
        assert.match(
          error.message,
          /permission denied/i,
          "denied writes must be permission errors",
        );
      }
      const profile = await execute(
        "SELECT is_plus_member, plus_expires_at, total_xp FROM public.profiles WHERE id=$1",
        [id],
      );
      assert.equal(profile.rows[0].is_plus_member, false, "membership must stay unchanged");
      assert.notEqual(profile.rows[0].total_xp, 999999, "total_xp must stay unchanged");
    });
  },
);

// ---------------------------------------------------------------------------
// Update 09 / Earn Plus hardening — 20260921000000_earned_plus_stale_session_hardening.sql
// ---------------------------------------------------------------------------

const HARDENING_MIGRATION =
  "supabase/migrations/20260921000000_earned_plus_stale_session_hardening.sql";

/** Push a started session's expiry into the past WITHOUT stamping expired_at,
 *  reproducing exactly the stale-row state found in production. */
async function expireSessionLeavingItOpen(assignmentId) {
  await execute(
    "UPDATE public.reward_mission_sessions SET started_at=clock_timestamp()-interval '2 hours', eligible_at=clock_timestamp()-interval '1 hour', expires_at=clock_timestamp()-interval '30 minutes' WHERE assignment_id=$1",
    [assignmentId],
  );
}

const start = (id, key, requestId = randomUUID()) =>
  callSelfService("svj_start_my_daily_mission", "authenticated", id, [requestId, key]);
const complete = (id, assignmentId, requestId = randomUUID()) =>
  callSelfService("svj_complete_my_daily_mission", "authenticated", id, [
    requestId,
    assignmentId,
    confirmation,
  ]);

async function startAndFinish(id, key) {
  const receipt = (await start(id, key)).rows[0].result;
  await makeReady(receipt.receipt.assignmentId);
  const done = await complete(id, receipt.receipt.assignmentId);
  return { start: receipt.receipt, done: done.rows[0].result.receipt };
}

describe(
  "Earn Plus stale mission-session hardening (real SQL)",
  { concurrency: false },
  () => {
    it("stale session (expired_at NULL, expires_at in the past) cannot block a new mission", async () => {
      if (skipAll) return;
      const id = await account();
      const first = (await start(id, "focused-practice")).rows[0].result;
      await expireSessionLeavingItOpen(first.receipt.assignmentId);

      // Before the fix this INSERT collided with reward_one_open_session_per_user
      // (23505). It must now succeed and open a genuinely new session.
      const second = (await start(id, "plan-and-reflect")).rows[0].result;
      assert.equal(second.replayed, false);
      assert.notEqual(second.receipt.assignmentId, first.receipt.assignmentId);

      const open = await execute(
        "SELECT count(*)::int AS n FROM public.reward_mission_sessions WHERE user_id=$1 AND completed_at IS NULL AND expired_at IS NULL",
        [id],
      );
      assert.equal(open.rows[0].n, 1, "exactly one session may stay open");
    });

    it("stale sessions are stamped with their own deterministic expiry instant", async () => {
      if (skipAll) return;
      const id = await account();
      const first = (await start(id, "focused-practice")).rows[0].result;
      await expireSessionLeavingItOpen(first.receipt.assignmentId);
      await start(id, "plan-and-reflect");

      const row = await execute(
        "SELECT expired_at IS NOT NULL AS stamped, expired_at = expires_at AS deterministic FROM public.reward_mission_sessions WHERE assignment_id=$1",
        [first.receipt.assignmentId],
      );
      assert.equal(row.rows[0].stamped, true, "the stale session must be closed");
      assert.equal(row.rows[0].deterministic, true, "expired_at must equal expires_at");
    });

    it("a genuinely live mission still blocks a second start", async () => {
      if (skipAll) return;
      const id = await account();
      await start(id, "focused-practice");
      await assert.rejects(
        () => start(id, "plan-and-reflect"),
        (error) => /SVJ_REWARD_MISSION_ALREADY_RUNNING/i.test(error.message),
      );
    });

    it("completion stamps BOTH the assignment and its session", async () => {
      if (skipAll) return;
      const id = await account();
      const receipt = (await start(id, "plan-and-reflect")).rows[0].result;
      await makeReady(receipt.receipt.assignmentId);
      await complete(id, receipt.receipt.assignmentId);

      const row = await execute(
        "SELECT a.completed_at AS a_done, s.completed_at AS s_done, s.confirmation_text AS text FROM public.reward_mission_assignments a JOIN public.reward_mission_sessions s ON s.assignment_id = a.id WHERE a.id=$1",
        [receipt.receipt.assignmentId],
      );
      assert.ok(row.rows[0].a_done, "assignment.completed_at must be set");
      assert.ok(row.rows[0].s_done, "session.completed_at must be set");
      assert.equal(row.rows[0].text, confirmation);
    });

    it("the next mission can start immediately after a completion", async () => {
      if (skipAll) return;
      const id = await account();
      await startAndFinish(id, "plan-and-reflect");
      const next = (await start(id, "focused-practice")).rows[0].result;
      assert.equal(next.replayed, false);
      assert.ok(next.receipt.assignmentId, "a fresh assignment must be issued");
    });

    it("two missions on one policy day add exactly ONE qualifying day", async () => {
      if (skipAll) return;
      const id = await account();
      await startAndFinish(id, "plan-and-reflect");
      await startAndFinish(id, "focused-practice");
      const wallet = await execute(
        "SELECT reward_xp, qualifying_days FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      assert.equal(wallet.rows[0].reward_xp, 100, "Reward XP still accumulates per mission");
      assert.equal(wallet.rows[0].qualifying_days, 1, "one qualifying day per policy day");
    });

    it("three missions in one day still yield exactly one qualifying day", async () => {
      if (skipAll) return;
      const id = await account();
      const before = await totalXp(id);
      await startAndFinish(id, "plan-and-reflect"); // 300s minimum
      await startAndFinish(id, "intentional-movement"); // 600s
      await startAndFinish(id, "focused-practice"); // 900s -> 150/150 cap
      const wallet = await execute(
        "SELECT reward_xp, qualifying_days FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      assert.equal(wallet.rows[0].reward_xp, 150);
      assert.equal(wallet.rows[0].qualifying_days, 1);
      assert.equal((await totalXp(id)) - before, 150, "three missions credit 150 profile XP");
    });

    it("a later policy day adds the next qualifying day", async () => {
      if (skipAll) return;
      const id = await account();
      await startAndFinish(id, "plan-and-reflect");
      const day = (
        await execute(
          "SELECT (clock_timestamp() AT TIME ZONE reward_timezone)::date AS d FROM public.reward_policies WHERE campaign_id=$1",
          [campaign],
        )
      ).rows[0].d;
      // Same shape as a real yesterday completion, written by the server role.
      await asRole(
        "service_role",
        null,
        "INSERT INTO public.reward_xp_ledger(user_id,campaign_id,policy_day,kind,source_key,reward_xp_delta) VALUES ($1,$2,$3::date-1,'mission_completion',gen_random_uuid(),50)",
        [id, campaign, day],
      );
      await execScript(await readFile(HARDENING_MIGRATION, "utf8"));
      const wallet = await execute(
        "SELECT qualifying_days, last_qualifying_day FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      assert.equal(wallet.rows[0].qualifying_days, 2, "two distinct policy days = two days");
      const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
      assert.equal(
        iso(wallet.rows[0].last_qualifying_day),
        iso(day),
        "last day tracks the ledger",
      );
    });

    it("qualifying-day reconciliation repairs a historically overcounted wallet", async () => {
      if (skipAll) return;
      const id = await account();
      await startAndFinish(id, "plan-and-reflect");
      await startAndFinish(id, "focused-practice");
      await execute("UPDATE public.reward_wallets SET qualifying_days=99 WHERE user_id=$1", [id]);
      const before = await execute(
        "SELECT reward_xp FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      await execScript(await readFile(HARDENING_MIGRATION, "utf8"));
      const after = await execute(
        "SELECT qualifying_days, reward_xp FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      assert.equal(after.rows[0].qualifying_days, 1, "reconciled from the ledger");
      assert.equal(
        after.rows[0].reward_xp,
        before.rows[0].reward_xp,
        "legitimate Reward XP must never be altered by the repair",
      );
    });

    it("the hardening migration is idempotent and preserves the open-session index", async () => {
      if (skipAll) return;
      await execScript(await readFile(HARDENING_MIGRATION, "utf8"));
      const index = await execute(
        "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='reward_one_open_session_per_user'",
      );
      assert.equal(index.rows.length, 1, "the unique open-session index must survive");
      assert.match(index.rows[0].indexdef, /completed_at IS NULL/);
      assert.match(index.rows[0].indexdef, /expired_at IS NULL/);
    });

    it("backfill closes every logically-open expired session", async () => {
      if (skipAll) return;
      const id = await account();
      const first = (await start(id, "focused-practice")).rows[0].result;
      await expireSessionLeavingItOpen(first.receipt.assignmentId);
      const before = await execute(
        "SELECT count(*)::int AS n FROM public.reward_mission_sessions WHERE completed_at IS NULL AND expired_at IS NULL AND expires_at <= clock_timestamp()",
      );
      assert.ok(before.rows[0].n >= 1, "the stale row must exist before the backfill");
      await execScript(await readFile(HARDENING_MIGRATION, "utf8"));
      const after = await execute(
        "SELECT count(*)::int AS n FROM public.reward_mission_sessions WHERE completed_at IS NULL AND expired_at IS NULL AND expires_at <= clock_timestamp()",
      );
      assert.equal(after.rows[0].n, 0, "no expired session may stay logically open");
    });

    it("completion retry stays exactly-once and rewards once", async () => {
      if (skipAll) return;
      const id = await account();
      const before = await totalXp(id);
      const receipt = (await start(id, "plan-and-reflect")).rows[0].result;
      await makeReady(receipt.receipt.assignmentId);
      const requestId = randomUUID();
      await complete(id, receipt.receipt.assignmentId, requestId);
      const replay = (await complete(id, receipt.receipt.assignmentId, requestId)).rows[0].result;
      assert.equal(replay.replayed, true);
      const wallet = await execute(
        "SELECT reward_xp, qualifying_days FROM public.reward_wallets WHERE user_id=$1",
        [id],
      );
      assert.equal(wallet.rows[0].reward_xp, 50, "a retry must not award twice");
      assert.equal(wallet.rows[0].qualifying_days, 1);
      assert.equal((await totalXp(id)) - before, 50, "profile XP must be awarded exactly once");
    });

    it("re-using a request id for a different mission is rejected", async () => {
      if (skipAll) return;
      const id = await account();
      const requestId = randomUUID();
      await start(id, "plan-and-reflect", requestId);
      await assert.rejects(
        () => start(id, "focused-practice", requestId),
        (error) => /SVJ_REWARD_REQUEST_REUSED/i.test(error.message),
      );
    });
  },
);

// The privileged, service-role-gated entry points the self-service RPCs must
// NOT call (proved via the migration source + grant checks above).
const _implForbidden = [
  "svj_get_engagement_state",
  "svj_claim_daily_checkin",
  "svj_start_daily_mission",
  "svj_complete_daily_mission",
  "svj_redeem_earned_plus",
  "svj_assert_reward_service_role",
];
