// Phase 2 — real PostgreSQL behaviour for the automated recovery pipeline
// (isolated PGlite/WASM, or an explicitly named LOCAL test database — never a
// remote host).
//
// Verifies, against the real migration chain:
//   - training load comes from canonical svj_activities (real duration + type),
//   - readiness is a meaningful PARTIAL score with no check-in (never zero),
//   - the history RPC exposes the caller's own check-in values (sleep etc.),
//   - identity is auth.uid() only and one user can never read another's rows.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const connectionString = process.env.SVJ_REWARD_TEST_DATABASE_URL;
const native = Boolean(connectionString);
if (native) {
  const target = new URL(connectionString);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
    "Recovery database tests refuse remote hosts",
  );
}
const database = native ? new pg.Pool({ connectionString, max: 8 }) : new PGlite();
const execute = (sql, args = []) => database.query(sql, args);
const execScript = async (sql) => (native ? database.query(sql) : database.exec(sql));

async function asRole(role, userId, sql, args = []) {
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

async function account() {
  const id = randomUUID();
  await execute(
    "INSERT INTO auth.users(id,email,email_confirmed_at,created_at) VALUES ($1,$2,now(),now()-interval '60 days')",
    [id, id + "@example.test"],
  );
  return id;
}

/** Readiness exactly as the client reads it (authenticated, no user id). */
const readiness = async (userId) =>
  (await asRole("authenticated", userId, "SELECT public.svj_get_my_readiness() AS result")).rows[0]
    .result;

const history = async (userId, limit = 30) =>
  (
    await asRole(
      "authenticated",
      userId,
      "SELECT public.svj_list_my_recovery_history($1) AS result",
      [limit],
    )
  ).rows[0].result;

/** One canonical recorded activity, inserted at a real offset from now. */
async function recordActivity(userId, { type = "strength", minutes = 60, daysAgo = 0 } = {}) {
  const endedAt = new Date(Date.now() - daysAgo * 86_400_000 - 3_600_000);
  const startedAt = new Date(endedAt.getTime() - minutes * 60_000);
  await execute(
    `INSERT INTO public.svj_activities(
       user_id, client_session_id, activity_type, source,
       started_at, ended_at, duration_seconds, step_count
     ) VALUES ($1,$2,$3,'manual',$4,$5,$6,0)`,
    [
      userId,
      randomUUID().replace(/-/g, "").slice(0, 12),
      type,
      startedAt.toISOString(),
      endedAt.toISOString(),
      Math.round(minutes * 60),
    ],
  );
}

before(async () => {
  await execScript(await readFile("tests/fixtures/rewards-auth.sql", "utf8"));
  const names = (await readdir("supabase/migrations")).filter((x) => x.endsWith(".sql")).sort();
  for (const name of names.filter((x) => x < "20260920000000")) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
  await execScript(await readFile("supabase/pending/20260902_earned_plus.sql", "utf8"));
  await execScript(
    await readFile("supabase/pending/20260903_earned_plus_qualifying_days_7.sql", "utf8"),
  );
  for (const name of names.filter((x) => x >= "20260920000000")) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
});
after(async () => {
  if (native) await database.end();
  else await database.close();
});

describe("training load uses real canonical activity", { concurrency: false }, () => {
  it("computes points from real duration and activity type", async () => {
    const id = await account();
    const before = await readiness(id);
    assert.equal(before.components.loadPoints7d, 0, "a clean account starts at zero load");

    await recordActivity(id, { type: "strength", minutes: 60 });
    const after = await readiness(id);
    // 60 min strength × 1.3 = 78 points — never a hardcoded/demo figure.
    assert.equal(after.components.loadPoints7d, 78);
    assert.equal(after.components.loadBand, "low");
    assert.equal(after.components.dataSources.includes("recorded_activity"), true);
  });

  it("caps an accidental 24h log at three hours", async () => {
    const id = await account();
    await recordActivity(id, { type: "strength", minutes: 1440 });
    const result = await readiness(id);
    // 3h × 1.3 = 234 points, not 1440 min × 1.3.
    assert.equal(result.components.loadPoints7d, 234);
  });

  it("bands a heavy week and lowers readiness only when rest is missing", async () => {
    const id = await account();
    // Three 3h strength sessions, one in each of the last three day windows.
    await recordActivity(id, { type: "strength", minutes: 180, daysAgo: 0 });
    await recordActivity(id, { type: "strength", minutes: 180, daysAgo: 1 });
    await recordActivity(id, { type: "strength", minutes: 180, daysAgo: 2 });

    const result = await readiness(id);
    assert.equal(result.components.loadPoints7d, 702);
    assert.equal(result.trainingLoad, "very_high");
    assert.equal(result.components.restDaysLast3, 0);
    assert.equal(result.components.loadPenalty, 28);
    assert.equal(result.score, 42);
    assert.equal(result.recovery, "unknown", "no check-in means no recovery grade");
  });
});

describe("readiness is a meaningful partial score", { concurrency: false }, () => {
  it("never reports zero just because today's check-in is missing", async () => {
    const id = await account();
    const result = await readiness(id);
    assert.equal(result.score, 70);
    assert.ok(result.score > 0);
    assert.equal(result.recovery, "unknown");
    assert.equal(result.components.sleepHours, null);
    // The snapshot's source list carries no usable source on a clean day (the
    // builder emits empty slots for absent inputs rather than inventing one).
    assert.equal(result.components.dataSources.filter(Boolean).length, 0);
  });

  it("refines the score with a check-in instead of unlocking it", async () => {
    const id = await account();
    const partial = await readiness(id);

    const saved = (
      await asRole(
        "authenticated",
        id,
        "SELECT public.svj_save_my_recovery_checkin($1,$2,$3,$4) AS result",
        [8, 1, 5, 5],
      )
    ).rows[0].result;

    assert.equal(saved.components.dataSources.includes("user_checkin"), true);
    assert.ok(saved.score > partial.score, "a good check-in must refine the partial score");
    assert.equal(saved.components.sleepHours, 8);
    assert.equal(saved.components.soreness, 1);
    assert.equal(saved.components.energy, 5);
    assert.equal(saved.components.perceivedRecovery, 5);
  });

  it("stays idempotent per day and keeps values the client omits", async () => {
    const id = await account();
    await asRole("authenticated", id, "SELECT public.svj_save_my_recovery_checkin($1,$2,$3,$4)", [
      7.5,
      null,
      null,
      null,
    ]);
    await asRole("authenticated", id, "SELECT public.svj_save_my_recovery_checkin($1,$2,$3,$4)", [
      null,
      2,
      null,
      null,
    ]);
    const stored = await execute(
      "SELECT sleep_hours, soreness FROM public.svj_recovery_checkins WHERE user_id=$1",
      [id],
    );
    assert.equal(stored.rows.length, 1, "one check-in row per user per day");
    assert.equal(Number(stored.rows[0].sleep_hours), 7.5);
    assert.equal(stored.rows[0].soreness, 2);
  });
});

describe("history accumulates from real data", { concurrency: false }, () => {
  it("exposes the caller's own check-in values, not just the derived score", async () => {
    const id = await account();
    await asRole(
      "authenticated",
      id,
      "SELECT public.svj_save_my_recovery_checkin($1,$2,$3,$4)",
      [7.5, 2, 4, 4],
    );

    const rows = await history(id);
    assert.equal(rows.length, 1);
    const day = rows[0];
    assert.equal(day.date, new Date().toISOString().slice(0, 10));
    assert.equal(day.hasCheckin, true);
    assert.equal(Number(day.sleepHours), 7.5);
    assert.equal(day.soreness, 2);
    assert.equal(day.energy, 4);
    assert.equal(day.perceivedRecovery, 4);
    assert.equal(typeof day.score, "number");
    assert.ok(day.score > 0);
  });

  it("reports a real one-day-at-a-time series with the recorded load behind each day", async () => {
    const id = await account();
    await recordActivity(id, { type: "running", minutes: 40 });
    await readiness(id);
    await asRole(
      "authenticated",
      id,
      "SELECT public.svj_save_my_recovery_checkin($1,$2,$3,$4)",
      [8, 1, 5, 5],
    );

    const rows = await history(id, 7);
    assert.equal(rows.length, 1, "only days the athlete actually recorded exist");
    assert.equal(rows[0].loadPoints7d, 44, "40 min running × 1.1");
    assert.equal(rows[0].trainingLoad, "low");
    assert.equal(rows[0].hasCheckin, true);
  });

  it("marks a derived day with no check-in as having no check-in", async () => {
    const id = await account();
    await readiness(id); // readiness row without any check-in
    const rows = await history(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].hasCheckin, false);
    assert.equal(rows[0].sleepHours, null, "never invent sleep hours");
  });

  it("keeps the RPC callable with and without a limit (PostgREST contract)", async () => {
    const id = await account();
    await readiness(id);
    const noArg = (
      await asRole("authenticated", id, "SELECT public.svj_list_my_recovery_history() AS result")
    ).rows[0].result;
    assert.ok(Array.isArray(noArg));
    assert.equal(noArg.length, 1);
    const clamped = await history(id, 500);
    assert.ok(Array.isArray(clamped));
  });
});

describe("recovery data is private", { concurrency: false }, () => {
  it("refuses an unauthenticated caller", async () => {
    await assert.rejects(
      asRole("authenticated", undefined, "SELECT public.svj_get_my_readiness()"),
      /Authentication required/,
    );
    await assert.rejects(
      asRole("authenticated", undefined, "SELECT public.svj_list_my_recovery_history(30)"),
      /Authentication required/,
    );
    await assert.rejects(
      asRole(
        "authenticated",
        undefined,
        "SELECT public.svj_save_my_recovery_checkin($1,$2,$3,$4)",
        [8, 1, 5, 5],
      ),
      /Authentication required/,
    );
  });

  it("never returns another athlete's days", async () => {
    const owner = await account();
    const stranger = await account();
    await asRole(
      "authenticated",
      owner,
      "SELECT public.svj_save_my_recovery_checkin($1,$2,$3,$4)",
      [9, 1, 5, 5],
    );
    assert.equal((await history(owner)).length, 1);
    assert.deepEqual(await history(stranger), []);
    assert.equal((await readiness(stranger)).score, 70, "a stranger's own clean day");
  });

  it("exposes no client-settable user id", async () => {
    const row = await execute(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS definer,
              p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='svj_list_my_recovery_history'`,
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].args, "p_limit integer");
    assert.equal(row.rows[0].args.includes("user"), false, "no user id may be accepted");
    assert.equal(row.rows[0].definer, true, "must stay SECURITY DEFINER");
    assert.match(row.rows[0].config.join(","), /search_path=public/);
  });
});
