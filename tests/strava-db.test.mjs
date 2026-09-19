// Real-PostgreSQL tests for the Strava integration
// (supabase/migrations/20260922000000_strava_integration.sql).
//
// Proves, as actual PostgreSQL roles (SET LOCAL ROLE + JWT claims):
//   • 'strava' is an accepted activity source and unknown sources are not
//   • the connection/token store is unreachable by anon AND authenticated
//   • every server-only Strava RPC is denied to client roles
//   • the two owner-facing RPCs work for authenticated and are denied to anon
//   • importing is idempotent and awards XP exactly once
//   • the extracted activity-reward implementation preserves the original
//     authenticated svj_process_activity_rewards behaviour
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

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
const database = native ? new pg.Pool({ connectionString, max: 16 }) : new PGlite();

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

const execute = (sql, args = []) => database.query(sql, args);
const execScript = async (sql) => (native ? database.query(sql) : database.exec(sql));

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

const denied = (error) =>
  /permission denied|insufficient privilege|not authorized|denied/i.test(error.message);

async function account() {
  const id = randomUUID();
  await execute(
    "INSERT INTO auth.users(id,email,email_confirmed_at,created_at) VALUES ($1,$2,now(),now()-interval '40 days')",
    [id, id + "@example.test"],
  );
  await execute(
    "INSERT INTO public.profiles(id,email,total_xp) VALUES ($1,$2,0) ON CONFLICT (id) DO NOTHING",
    [id, id + "@example.test"],
  );
  return id;
}

const totalXp = async (id) =>
  (
    await execute("SELECT COALESCE(total_xp,0)::int AS xp FROM public.profiles WHERE id=$1", [id])
  ).rows[0].xp;

/** A payload shaped exactly like the server's normalized Strava activity. */
function runActivity(stravaId, { minutes = 30, meters = 5000 } = {}) {
  const finished = new Date(Date.now() - 60 * 60 * 1000);
  const started = new Date(finished.getTime() - minutes * 60 * 1000);
  return {
    stravaId: String(stravaId),
    activityType: "running",
    startedAt: started.toISOString(),
    endedAt: finished.toISOString(),
    durationSeconds: minutes * 60,
    stepCount: 0,
    distanceMeters: meters,
    caloriesEstimate: null,
    name: "Morning run",
  };
}

const importActivities = (as, userId, activities) =>
  asRole(
    as,
    null,
    "SELECT public.svj_strava_import_activities($1,$2::jsonb) AS result",
    [userId, JSON.stringify(activities)],
  ).then((r) => r.rows[0].result);

before(async () => {
  await ensureDatabase();
  if (skipAll) {
    console.warn(
      "[skip] Strava DB chain: polluted DOM runtime — run this file in isolation or set SVJ_REWARD_TEST_DATABASE_URL.",
    );
    return;
  }
  await execScript(await readFile("tests/fixtures/rewards-auth.sql", "utf8"));
  for (const name of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql") && x < "20260920000000")
    .sort()) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
  await execScript(await readFile("tests/fixtures/pre-hotfix-triggers.sql", "utf8"));
  await execScript(await readFile("supabase/pending/20260902_earned_plus.sql", "utf8"));
  await execScript(
    await readFile("supabase/pending/20260903_earned_plus_qualifying_days_7.sql", "utf8"),
  );
  // The production chain from the Earn Plus correction onward, including the
  // Strava migration under test.
  for (const name of (await readdir("supabase/migrations"))
    .filter((x) => x.endsWith(".sql") && x >= "20260920000000")
    .sort()) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
});

describe("Strava integration (real SQL)", { concurrency: false }, () => {
  it("accepts 'strava' as an activity source and rejects unknown ones", async () => {
    if (skipAll) return;
    const id = await account();
    await execute(
      "INSERT INTO public.svj_activities(user_id,client_session_id,activity_type,source,started_at,ended_at,duration_seconds,distance_meters) VALUES ($1,$2,'running','strava',now()-interval '1 hour',now()-interval '30 minutes',1800,5000)",
      [id, "strava:" + randomUUID()],
    );
    await assert.rejects(
      () =>
        execute(
          "INSERT INTO public.svj_activities(user_id,client_session_id,activity_type,source,started_at,ended_at,duration_seconds) VALUES ($1,$2,'running','fitbit',now()-interval '1 hour',now()-interval '30 minutes',1800)",
          [id, "x-" + randomUUID()],
        ),
      (error) => /source_check|check constraint/i.test(error.message),
    );
  });

  it("keeps the Strava token store unreachable by anon and authenticated", async () => {
    if (skipAll) return;
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(
        () => asRole(role, null, "SELECT count(*) FROM public.svj_strava_connections"),
        denied,
        role + " must not read the token store",
      );
      await assert.rejects(
        () => asRole(role, null, "SELECT count(*) FROM public.svj_strava_oauth_states"),
        denied,
        role + " must not read the oauth state store",
      );
    }
  });

  it("denies every server-only Strava RPC to client roles", async () => {
    if (skipAll) return;
    const id = await account();
    const calls = [
      ["SELECT public.svj_strava_begin_connect($1,repeat('x',20),null)", [id]],
      ["SELECT public.svj_strava_consume_state($1)", ["x".repeat(20)]],
      ["SELECT public.svj_strava_read_connection($1)", [id]],
      ["SELECT public.svj_strava_mark_synced($1,null)", [id]],
      [
        "SELECT public.svj_strava_save_connection($1,1,null,$2,$3,now()+interval '1 hour',null)",
        [id, "access", "refresh"],
      ],
      ["SELECT public.svj_strava_import_activities($1,'[]'::jsonb)", [id]],
      ["SELECT public.svj_process_activity_rewards_impl($1,$1)", [id]],
    ];
    for (const [sql, args] of calls) {
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(
          () => asRole(role, id, sql, args),
          denied,
          `${role} must not execute: ${sql}`,
        );
      }
    }
  });

  it("exposes status and disconnect to the authenticated owner but not anon", async () => {
    if (skipAll) return;
    const id = await account();
    const status = await asRole(
      "authenticated",
      id,
      "SELECT public.svj_get_my_strava_status() AS result",
    );
    assert.equal(status.rows[0].result.connected, false);
    assert.equal(status.rows[0].result.importedActivities, 0);

    const off = await asRole(
      "authenticated",
      id,
      "SELECT public.svj_disconnect_my_strava() AS result",
    );
    assert.equal(off.rows[0].result.ok, true);

    for (const sql of [
      "SELECT public.svj_get_my_strava_status()",
      "SELECT public.svj_disconnect_my_strava()",
    ]) {
      await assert.rejects(() => asRole("anon", null, sql), denied, "anon must be denied: " + sql);
    }
  });

  it("rejects an unauthenticated RPC body call with no claims", async () => {
    if (skipAll) return;
    await assert.rejects(
      () => asRole("authenticated", null, "SELECT public.svj_get_my_strava_status()"),
      (error) => /Authentication required/i.test(error.message),
    );
  });

  it("is a service-role-only boundary for the whole import path", async () => {
    if (skipAll) return;
    const id = await account();
    await assert.rejects(
      () => importActivities("authenticated", id, [runActivity(1)]),
      denied,
      "authenticated must never import directly",
    );
  });

  it("imports once, awards server-side XP once, and is idempotent on re-sync", async () => {
    if (skipAll) return;
    const id = await account();
    const before = await totalXp(id);

    const first = await importActivities("service_role", id, [runActivity(900001)]);
    assert.equal(first.imported, 1);
    assert.equal(first.duplicate, 0);
    // running: base 20 + 30-minute duration bonus 5 = 25, from the existing policy.
    assert.equal(first.xpAwarded, 25);
    assert.equal(await totalXp(id), before + 25);

    const rows = await execute(
      "SELECT count(*)::int AS n FROM public.svj_activities WHERE user_id=$1 AND source='strava'",
      [id],
    );
    assert.equal(rows.rows[0].n, 1, "exactly one activity row");

    const events = await execute(
      "SELECT count(*)::int AS n FROM public.activity_events WHERE user_id=$1 AND event_key LIKE 'activity.completed:%'",
      [id],
    );
    assert.equal(events.rows[0].n, 1, "exactly one completion event");

    // A repeated sync (same provider id) must not duplicate anything.
    const second = await importActivities("service_role", id, [runActivity(900001)]);
    assert.equal(second.imported, 0);
    assert.equal(second.duplicate, 1);
    assert.equal(second.xpAwarded, 0);
    assert.equal(await totalXp(id), before + 25, "XP must never be awarded twice");

    const after = await execute(
      "SELECT count(*)::int AS n FROM public.svj_activities WHERE user_id=$1 AND source='strava'",
      [id],
    );
    assert.equal(after.rows[0].n, 1);
  });

  it("never crosses accounts: an import for one user leaves another untouched", async () => {
    if (skipAll) return;
    const mine = await account();
    const other = await account();
    await importActivities("service_role", mine, [runActivity(910001)]);
    const rows = await execute(
      "SELECT count(*)::int AS n FROM public.svj_activities WHERE user_id=$1",
      [other],
    );
    assert.equal(rows.rows[0].n, 0);
    assert.equal(await totalXp(other), 0);
  });

  it("drops malformed provider rows instead of aborting the sync", async () => {
    if (skipAll) return;
    const id = await account();
    const result = await importActivities("service_role", id, [
      { stravaId: "not-a-number", activityType: "running" },
      { stravaId: "920001", activityType: "swimming", startedAt: "x", endedAt: "y" },
      runActivity(920002),
    ]);
    assert.equal(result.imported, 1, "the valid row is still imported");
    assert.equal(result.skipped, 2);
  });

  it("stores, reads back and disconnects a connection without exposing tokens", async () => {
    if (skipAll) return;
    const id = await account();
    await asRole(
      "service_role",
      null,
      "SELECT public.svj_strava_save_connection($1,$2,$3,$4,$5,now()+interval '6 hours',$6)",
      [id, 555001, "Ada Runner", "access-token", "refresh-token", "read,activity:read_all"],
    );

    const stored = await asRole(
      "service_role",
      null,
      "SELECT public.svj_strava_read_connection($1) AS result",
      [id],
    );
    assert.equal(stored.rows[0].result.athleteId, 555001);

    // The owner-facing status must never include token material.
    const status = await asRole(
      "authenticated",
      id,
      "SELECT public.svj_get_my_strava_status() AS result",
    );
    const serialized = JSON.stringify(status.rows[0].result);
    assert.equal(status.rows[0].result.connected, true);
    assert.equal(status.rows[0].result.athleteName, "Ada Runner");
    assert.doesNotMatch(serialized, /access-token|refresh-token/);

    const off = await asRole(
      "authenticated",
      id,
      "SELECT public.svj_disconnect_my_strava() AS result",
    );
    assert.equal(off.rows[0].result.disconnected, true);
    const after = await asRole(
      "authenticated",
      id,
      "SELECT public.svj_get_my_strava_status() AS result",
    );
    assert.equal(after.rows[0].result.connected, false);
  });

  it("refuses to link one Strava athlete to a second SVJ account", async () => {
    if (skipAll) return;
    const first = await account();
    const second = await account();
    await asRole(
      "service_role",
      null,
      "SELECT public.svj_strava_save_connection($1,$2,null,$3,$4,now()+interval '6 hours',null)",
      [first, 777001, "a", "r"],
    );
    await assert.rejects(
      () =>
        asRole(
          "service_role",
          null,
          "SELECT public.svj_strava_save_connection($1,$2,null,$3,$4,now()+interval '6 hours',null)",
          [second, 777001, "a", "r"],
        ),
      (error) => /SVJ_STRAVA_ALREADY_LINKED/.test(error.message),
    );
  });

  it("consumes an OAuth state exactly once and binds it to its user", async () => {
    if (skipAll) return;
    const id = await account();
    const state = "s".repeat(40);
    await assert.rejects(
      () => asRole("authenticated", id, "SELECT public.svj_strava_consume_state($1)", [state]),
      denied,
      "state consumption is service-role only",
    );
    await asRole(
      "service_role",
      null,
      "SELECT public.svj_strava_begin_connect($1,$2,'/landing')",
      [id, state],
    );
    const consumed = await asRole(
      "service_role",
      null,
      "SELECT public.svj_strava_consume_state($1) AS result",
      [state],
    );
    assert.equal(consumed.rows[0].result.userId, id);
    await assert.rejects(
      () =>
        asRole("service_role", null, "SELECT public.svj_strava_consume_state($1)", [state]),
      (error) => /SVJ_STRAVA_STATE_INVALID/.test(error.message),
      "a state may not be replayed",
    );
  });

  it("keeps the original authenticated reward RPC working after the impl extraction", async () => {
    if (skipAll) return;
    const id = await account();
    const before = await totalXp(id);
    const activityId = (
      await execute(
        "INSERT INTO public.svj_activities(user_id,client_session_id,activity_type,source,started_at,ended_at,duration_seconds,step_count,distance_meters) VALUES ($1,$2,'walking','svj_native',now()-interval '1 hour',now()-interval '30 minutes',1800,0,4000) RETURNING id",
        [id, "svj-" + randomUUID()],
      )
    ).rows[0].id;

    const first = await asRole(
      "authenticated",
      id,
      "SELECT public.svj_process_activity_rewards($1) AS result",
      [activityId],
    );
    // walking: base 10 + the existing 30-minute duration bonus 5 = 15.
    assert.equal(first.rows[0].result.xpAwarded, 15, "walking XP is unchanged");
    assert.equal(await totalXp(id), before + 15);

    // Reprocessing is a zero-duplicate no-op, exactly as before the refactor.
    const again = await asRole(
      "authenticated",
      id,
      "SELECT public.svj_process_activity_rewards($1) AS result",
      [activityId],
    );
    assert.equal(again.rows[0].result.duplicate, true);
    assert.equal(again.rows[0].result.xpAwarded, 0);
    assert.equal(await totalXp(id), before + 15);
  });

  it("still refuses to reward another user's activity through the public RPC", async () => {
    if (skipAll) return;
    const mine = await account();
    const other = await account();
    const activityId = (
      await execute(
        "INSERT INTO public.svj_activities(user_id,client_session_id,activity_type,source,started_at,ended_at,duration_seconds,distance_meters) VALUES ($1,$2,'running','svj_native',now()-interval '1 hour',now()-interval '30 minutes',1800,5000) RETURNING id",
        [other, "svj-" + randomUUID()],
      )
    ).rows[0].id;
    await assert.rejects(
      () =>
        asRole("authenticated", mine, "SELECT public.svj_process_activity_rewards($1)", [
          activityId,
        ]),
      (error) => /Activity not found/.test(error.message),
    );
  });

  it("leaves the Earn Plus service-role lockdown intact", async () => {
    if (skipAll) return;
    const id = await account();
    const privileged = [
      ["SELECT public.svj_get_engagement_state($1)", [id]],
      ["SELECT public.svj_start_daily_mission($1,$2,'focused-practice')", [id, randomUUID()]],
    ];
    for (const [sql, args] of privileged) {
      await assert.rejects(
        () => asRole("authenticated", id, sql, args),
        denied,
        "authenticated must not reach the privileged Earn Plus RPCs: " + sql,
      );
    }
  });
});
