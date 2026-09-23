// Real PostgreSQL behaviour for warm-up set persistence (isolated PGlite/WASM or
// an explicitly named LOCAL test database — never a remote host).
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
    "Strength database tests refuse remote hosts",
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

const exerciseId = async (slug) =>
  (await execute("SELECT id FROM public.svj_exercises WHERE slug=$1", [slug])).rows[0].id;

/** Save one strength workout as the authenticated user (the real client path). */
async function saveStrength(userId, sessionId, exercises, endedAt = new Date()) {
  const startedAt = new Date(endedAt.getTime() - 45 * 60_000);
  const result = await asRole(
    "authenticated",
    userId,
    "SELECT public.svj_save_strength_activity($1,$2,$3,$4,$5,$6,$7) AS result",
    [
      sessionId,
      startedAt.toISOString(),
      endedAt.toISOString(),
      2700,
      JSON.stringify(exercises),
      null,
      null,
    ],
  );
  return result.rows[0].result;
}

before(async () => {
  await execScript(await readFile("tests/fixtures/rewards-auth.sql", "utf8"));
  const names = (await readdir("supabase/migrations")).filter((x) => x.endsWith(".sql")).sort();
  // Base tables first, then the reward schema the later layered migrations build on.
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

const sets = (rows) => rows.map((r) => (typeof r === "number" ? { reps: r, weight_kg: 0 } : r));

describe("warm-up set persistence", { concurrency: false }, () => {
  it("stores is_warmup per set and returns it through detail + exercise history", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    const outcome = await saveStrength(id, randomUUID(), [
      {
        exercise_id: bench,
        notes: null,
        sets: [
          { reps: 15, weight_kg: 40, is_warmup: true },
          { reps: 10, weight_kg: 60 },
          { reps: 10, weight_kg: 60 },
          { reps: 10, weight_kg: 60 },
        ],
      },
    ]);
    assert.equal(outcome.ok, true);
    const activityId = outcome.activity.id;

    const stored = await execute(
      "SELECT s.set_number, s.is_warmup FROM public.svj_strength_sets s JOIN public.svj_activity_exercises ae ON ae.id=s.activity_exercise_id WHERE ae.activity_id=$1 ORDER BY s.set_number",
      [activityId],
    );
    assert.deepEqual(
      stored.rows.map((r) => r.is_warmup),
      [true, false, false, false],
    );

    const detail = (
      await asRole("authenticated", id, "SELECT public.svj_get_strength_detail($1) AS result", [
        activityId,
      ])
    ).rows[0].result;
    assert.equal(detail.ok, true);
    assert.deepEqual(
      detail.exercises[0].sets.map((s) => s.is_warmup),
      [true, false, false, false],
    );

    const history = (
      await asRole("authenticated", id, "SELECT public.svj_get_exercise_history($1) AS result", [
        bench,
      ])
    ).rows[0].result;
    assert.equal(history.ok, true);
    assert.deepEqual(
      history.sessions[0].sets.map((s) => s.is_warmup),
      [true, false, false, false],
    );
  });

  it("never lets a heavier warm-up set become a personal record", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    // A deliberately heavier ramp-up set: it must not create the PR.
    await saveStrength(id, randomUUID(), [
      {
        exercise_id: bench,
        sets: [
          { reps: 5, weight_kg: 120, is_warmup: true },
          { reps: 10, weight_kg: 60 },
          { reps: 10, weight_kg: 60 },
          { reps: 10, weight_kg: 60 },
        ],
      },
    ]);
    const records = await execute(
      "SELECT record_type, value FROM public.svj_personal_records WHERE user_id=$1 AND exercise_id=$2 ORDER BY record_type",
      [id, bench],
    );
    const byType = new Map(records.rows.map((r) => [r.record_type, Number(r.value)]));
    assert.equal(byType.get("heaviest_weight"), 60, "the 120 kg ramp-up must not be the PR");
    assert.equal(
      byType.get("best_exercise_volume"),
      1800,
      "only the three working sets (60 × 10 × 3) count toward volume",
    );
  });

  it("excludes warm-up sets from muscle history while keeping them visible", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    await saveStrength(id, randomUUID(), [
      {
        exercise_id: bench,
        sets: [
          { reps: 20, weight_kg: 20, is_warmup: true },
          { reps: 10, weight_kg: 60 },
          { reps: 10, weight_kg: 60 },
        ],
      },
    ]);
    const result = (
      await asRole("authenticated", id, "SELECT public.svj_recent_muscle_history(7) AS result")
    ).rows[0].result;
    const chest = result.muscles.find((m) => m.muscle === "chest");
    assert.equal(chest.directSets, 2, "only the two working sets count as chest volume");
    // The warm-up row still exists in history (it is classified, not deleted).
    assert.equal(
      (
        await execute(
          "SELECT count(*)::int AS n FROM public.svj_strength_sets s JOIN public.svj_activity_exercises ae ON ae.id=s.activity_exercise_id WHERE ae.user_id=$1 AND s.is_warmup=true",
          [id],
        )
      ).rows[0].n,
      1,
    );
  });

  it("stays backward compatible: a payload without is_warmup saves as all working sets", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    const outcome = await saveStrength(id, randomUUID(), [
      { exercise_id: bench, sets: sets([8, 8, 8]) },
    ]);
    assert.equal(outcome.ok, true);
    const stored = await execute(
      "SELECT count(*)::int AS n FROM public.svj_strength_sets s JOIN public.svj_activity_exercises ae ON ae.id=s.activity_exercise_id WHERE ae.activity_id=$1 AND s.is_warmup=false",
      [outcome.activity.id],
    );
    assert.equal(stored.rows[0].n, 3);
  });

  it("keeps the canonical save idempotent with warm-ups present", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    const sessionId = randomUUID();
    const payload = [
      {
        exercise_id: bench,
        sets: [
          { reps: 12, weight_kg: 40, is_warmup: true },
          { reps: 10, weight_kg: 60 },
          { reps: 10, weight_kg: 60 },
          { reps: 10, weight_kg: 60 },
        ],
      },
    ];
    const first = await saveStrength(id, sessionId, payload);
    const second = await saveStrength(id, sessionId, payload);
    assert.equal(first.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(second.activity.id, first.activity.id);
    assert.equal(
      (await execute("SELECT count(*)::int AS n FROM public.svj_activities WHERE user_id=$1", [id]))
        .rows[0].n,
      1,
    );
    assert.equal(
      (
        await execute("SELECT count(*)::int AS n FROM public.svj_strength_sets WHERE user_id=$1", [
          id,
        ])
      ).rows[0].n,
      4,
    );
  });

  it("keeps warm-up data private to its owner", async () => {
    const owner = await account();
    const other = await account();
    const bench = await exerciseId("bench_press");
    const outcome = await saveStrength(owner, randomUUID(), [
      {
        exercise_id: bench,
        sets: [{ reps: 10, weight_kg: 60, is_warmup: true }],
      },
    ]);
    const hidden = await asRole(
      "authenticated",
      other,
      "SELECT public.svj_get_strength_detail($1) AS result",
      [outcome.activity.id],
    );
    assert.equal(hidden.rows[0].result.ok, false);
    await assert.rejects(
      asRole(
        "authenticated",
        other,
        "INSERT INTO public.svj_strength_sets(user_id,activity_exercise_id,set_number,reps,is_warmup) VALUES ($1,$2,1,5,true)",
        [owner, randomUUID()],
      ),
      /permission denied|violates|invalid input/i,
    );
  });
});
