// Real PostgreSQL behaviour for plan-day management (move / skip).
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
    "Training database tests refuse remote hosts",
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

async function planWithTwoSessions(userId) {
  const payload = {
    split_id: "upper_lower",
    split_name: "Upper / Lower",
    policy_version: "test",
    block_start: "2026-09-21",
    block_end: "2026-10-18",
    templates: [
      { id: "upper_a", family: "upper", variant: "A", name: "Upper A", version: 1, payload: {} },
      { id: "lower_a", family: "lower", variant: "A", name: "Lower A", version: 1, payload: {} },
    ],
    sessions: [
      {
        slot_index: 0,
        template_id: "upper_a",
        template_version: 1,
        scheduled_date: "2026-09-21",
        targets: [],
      },
      {
        slot_index: 1,
        template_id: "lower_a",
        template_version: 1,
        scheduled_date: "2026-09-23",
        targets: [],
      },
    ],
  };
  const created = (
    await asRole("authenticated", userId, "SELECT public.svj_create_training_plan($1) AS result", [
      JSON.stringify(payload),
    ])
  ).rows[0].result;
  const rows = await execute(
    "SELECT id, slot_index FROM public.svj_training_plan_sessions WHERE plan_id=$1 ORDER BY slot_index",
    [created.plan_id],
  );
  return { planId: created.plan_id, first: rows.rows[0].id, second: rows.rows[1].id };
}

const move = (userId, sessionId, date) =>
  asRole("authenticated", userId, "SELECT public.svj_reschedule_plan_session($1,$2) AS result", [
    sessionId,
    date,
  ]).then((r) => r.rows[0].result);
const skip = (userId, sessionId) =>
  asRole("authenticated", userId, "SELECT public.svj_skip_plan_session($1) AS result", [
    sessionId,
  ]).then((r) => r.rows[0].result);

const slot = async (id) =>
  (
    await execute(
      "SELECT status, scheduled_date FROM public.svj_training_plan_sessions WHERE id=$1",
      [id],
    )
  ).rows[0];

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

describe("plan day management", { concurrency: false }, () => {
  it("moves a session to a free day and marks it moved", async () => {
    const userId = await account();
    const { first } = await planWithTwoSessions(userId);
    const result = await move(userId, first, "2026-09-25");
    assert.equal(result.ok, true);
    assert.equal(result.status, "moved");
    const row = await slot(first);
    assert.equal(row.status, "moved");
    assert.equal(new Date(row.scheduled_date).toISOString().slice(0, 10), "2026-09-25");
  });

  it("refuses to stack two sessions on one day", async () => {
    const userId = await account();
    const { first, second } = await planWithTwoSessions(userId);
    await assert.rejects(move(userId, first, "2026-09-23"), /already have a session on that day/);
    assert.equal((await slot(second)).status, "scheduled");
    assert.equal((await slot(first)).scheduled_date.toISOString().slice(0, 10), "2026-09-21");
  });

  it("skips a session as a rest day and re-activates it when moved", async () => {
    const userId = await account();
    const { first } = await planWithTwoSessions(userId);
    assert.equal((await skip(userId, first)).status, "skipped");
    assert.equal((await slot(first)).status, "skipped");
    const moved = await move(userId, first, "2026-09-26");
    assert.equal(moved.status, "moved");
    assert.equal((await slot(first)).status, "moved");
  });

  it("never rewrites a completed session", async () => {
    const userId = await account();
    const { first, second } = await planWithTwoSessions(userId);
    await execute("UPDATE public.svj_training_plan_sessions SET status='completed' WHERE id=$1", [
      first,
    ]);
    await assert.rejects(move(userId, first, "2026-09-28"), /already completed/);
    await assert.rejects(skip(userId, first), /already completed/);
    assert.equal((await slot(first)).status, "completed");
    // The other session is still editable.
    assert.equal((await skip(userId, second)).ok, true);
  });

  it("refuses to touch another user's plan", async () => {
    const owner = await account();
    const other = await account();
    const { first } = await planWithTwoSessions(owner);
    await assert.rejects(move(other, first, "2026-09-30"), /Unknown plan session/);
    await assert.rejects(skip(other, first), /Unknown plan session/);
    assert.equal((await slot(first)).status, "scheduled");
  });

  it("requires authentication", async () => {
    const userId = await account();
    const { first } = await planWithTwoSessions(userId);
    await assert.rejects(
      asRole("anon", null, "SELECT public.svj_skip_plan_session($1) AS result", [first]),
      /permission denied|Authentication required/i,
    );
  });
});
