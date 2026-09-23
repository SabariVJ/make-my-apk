// Real PostgreSQL behaviour for two devices racing one plan slot.
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

const exerciseId = async () =>
  (await execute("SELECT id FROM public.svj_exercises WHERE slug='bench_press'")).rows[0].id;

async function saveWorkout(userId, sessionId, exercise) {
  const startedAt = new Date(Date.now() - 30 * 60_000);
  const result = await asRole(
    "authenticated",
    userId,
    "SELECT public.svj_save_strength_activity($1,$2,$3,$4,$5,$6,$7) AS result",
    [
      sessionId,
      startedAt.toISOString(),
      new Date().toISOString(),
      1800,
      JSON.stringify([
        {
          exercise_id: exercise,
          sets: [
            { reps: 10, weight_kg: 60 },
            { reps: 10, weight_kg: 60 },
            { reps: 10, weight_kg: 60 },
          ],
        },
      ]),
      null,
      null,
    ],
  );
  return result.rows[0].result;
}

const linkContext = (userId, sessionId, body) =>
  asRole("authenticated", userId, "SELECT public.svj_record_training_context($1,$2) AS result", [
    sessionId,
    JSON.stringify(body),
  ]).then((r) => r.rows[0].result);

async function planWithOneSession(userId) {
  const payload = {
    split_id: "upper_lower",
    split_name: "Upper / Lower",
    policy_version: "test",
    block_start: "2026-09-21",
    block_end: "2026-10-18",
    templates: [
      {
        id: "upper_a",
        family: "upper",
        variant: "A",
        name: "Upper A",
        version: 1,
        payload: { exercises: [] },
      },
    ],
    sessions: [
      {
        slot_index: 0,
        template_id: "upper_a",
        template_version: 1,
        scheduled_date: "2026-09-21",
        targets: [],
      },
    ],
  };
  const created = (
    await asRole("authenticated", userId, "SELECT public.svj_create_training_plan($1) AS result", [
      JSON.stringify(payload),
    ])
  ).rows[0].result;
  assert.equal(created.ok, true);
  const planSessionId = (
    await execute(
      "SELECT id FROM public.svj_training_plan_sessions WHERE plan_id=$1 AND slot_index=0",
      [created.plan_id],
    )
  ).rows[0].id;
  // The template must be in the user's library for usage to be tracked.
  await asRole("authenticated", userId, "SELECT public.svj_save_my_template('upper_a') AS result");
  return { planId: created.plan_id, planSessionId };
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

describe("multi-device plan-slot finalization", { concurrency: false }, () => {
  it("finalizes one slot once and tells the second device the slot is taken", async () => {
    const userId = await account();
    const exercise = await exerciseId();
    const { planId, planSessionId } = await planWithOneSession(userId);

    // Device A completes the session.
    const aSession = randomUUID();
    const aActivity = await saveWorkout(userId, aSession, exercise);
    assert.equal(aActivity.ok, true);
    const aResult = await linkContext(userId, aSession, {
      plan_id: planId,
      plan_session_id: planSessionId,
      template_id: "upper_a",
      template_version: 1,
      targets: [],
    });
    assert.equal(aResult.ok, true);
    assert.equal(aResult.slot_claimed, true);
    assert.equal(aResult.slot_already_finalized, false);

    // Device B, with stale state, completes the same slot with its own session.
    const bSession = randomUUID();
    const bActivity = await saveWorkout(userId, bSession, exercise);
    assert.equal(bActivity.ok, true);
    assert.notEqual(bActivity.activity.id, aActivity.activity.id);
    const bResult = await linkContext(userId, bSession, {
      plan_id: planId,
      plan_session_id: planSessionId,
      template_id: "upper_a",
      template_version: 1,
      targets: [],
    });
    assert.equal(bResult.ok, true);
    assert.equal(bResult.slot_already_finalized, true, "device B must be told the slot is taken");
    assert.equal(bResult.slot_claimed, false);

    // Exactly one completion, owned by device A's activity.
    const slot = await execute(
      "SELECT status, completed_activity_id FROM public.svj_training_plan_sessions WHERE id=$1",
      [planSessionId],
    );
    assert.equal(slot.rows[0].status, "completed");
    assert.equal(slot.rows[0].completed_activity_id, aActivity.activity.id);

    // Template usage counted ONCE, not twice.
    const usage = await execute(
      "SELECT use_count, last_completed_at FROM public.svj_user_template_library WHERE user_id=$1 AND template_id='upper_a'",
      [userId],
    );
    assert.equal(usage.rows[0].use_count, 1);
    assert.notEqual(usage.rows[0].last_completed_at, null);
  });

  it("keeps the retry of the winning device idempotent", async () => {
    const userId = await account();
    const exercise = await exerciseId();
    const { planId, planSessionId } = await planWithOneSession(userId);
    const session = randomUUID();
    await saveWorkout(userId, session, exercise);
    const ctx = {
      plan_id: planId,
      plan_session_id: planSessionId,
      template_id: "upper_a",
      template_version: 1,
      targets: [],
    };
    const first = await linkContext(userId, session, ctx);
    const retry = await linkContext(userId, session, ctx);
    assert.equal(first.slot_claimed, true);
    assert.equal(retry.duplicate, true);
    const usage = await execute(
      "SELECT use_count FROM public.svj_user_template_library WHERE user_id=$1 AND template_id='upper_a'",
      [userId],
    );
    assert.equal(usage.rows[0].use_count, 1, "a retry must not bump usage again");
  });

  it("refuses to link another user's plan slot", async () => {
    const owner = await account();
    const attacker = await account();
    const exercise = await exerciseId();
    const { planId, planSessionId } = await planWithOneSession(owner);
    const session = randomUUID();
    await saveWorkout(attacker, session, exercise);
    await assert.rejects(
      linkContext(attacker, session, {
        plan_id: planId,
        plan_session_id: planSessionId,
        template_id: "upper_a",
        template_version: 1,
      }),
      /Unknown plan session/,
    );
    const slot = await execute("SELECT status FROM public.svj_training_plan_sessions WHERE id=$1", [
      planSessionId,
    ]);
    assert.equal(slot.rows[0].status, "scheduled");
  });

  it("records one progression decision per evidence activity even when replayed", async () => {
    const userId = await account();
    const exercise = await exerciseId();
    const session = randomUUID();
    const activity = await saveWorkout(userId, session, exercise);
    const decision = (action) =>
      asRole("authenticated", userId, "SELECT public.svj_record_training_decision($1) AS result", [
        JSON.stringify({
          exercise_slug: "bench_press",
          action,
          rationale: "Two comparable sessions reached the top of range.",
          policy_version: "test",
          activity_id: activity.activity.id,
        }),
      ]).then((r) => r.rows[0].result);
    const first = await decision("increase");
    const replay = await decision("reduce");
    assert.equal(first.duplicate, false);
    assert.equal(replay.duplicate, true, "one workout's evidence yields one decision");
    const rows = await execute(
      "SELECT action FROM public.svj_training_decisions WHERE user_id=$1 AND activity_id=$2",
      [userId, activity.activity.id],
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].action, "increase");
  });

  it("hides another user's decisions and plan rows", async () => {
    const owner = await account();
    const other = await account();
    const exercise = await exerciseId();
    const session = randomUUID();
    const activity = await saveWorkout(owner, session, exercise);
    await asRole(
      "authenticated",
      owner,
      "SELECT public.svj_record_training_decision($1) AS result",
      [
        JSON.stringify({
          exercise_slug: "bench_press",
          action: "hold",
          rationale: "x",
          policy_version: "test",
          activity_id: activity.activity.id,
        }),
      ],
    );
    const ownerView = (
      await asRole(
        "authenticated",
        owner,
        "SELECT public.svj_list_training_decisions(10) AS result",
      )
    ).rows[0].result;
    const otherView = (
      await asRole(
        "authenticated",
        other,
        "SELECT public.svj_list_training_decisions(10) AS result",
      )
    ).rows[0].result;
    assert.equal(ownerView.decisions.length, 1);
    assert.equal(otherView.decisions.length, 0);
    // RLS lets the query run but returns none of the other user's rows, and the
    // client can never write a decision row directly (no INSERT grant).
    const otherRows = await asRole(
      "authenticated",
      other,
      "SELECT id FROM public.svj_training_decisions WHERE user_id=$1",
      [owner],
    );
    assert.equal(otherRows.rows.length, 0);
    await assert.rejects(
      asRole(
        "authenticated",
        other,
        "INSERT INTO public.svj_training_decisions(user_id,exercise_slug,action,policy_version) VALUES ($1,'bench_press','increase','x')",
        [other],
      ),
      /permission denied|row-level security/i,
    );
  });
});
