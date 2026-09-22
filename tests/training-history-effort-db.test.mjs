// Real PostgreSQL behaviour for effort-aware exercise history
// (supabase/migrations/20261001000000_training_history_effort.sql).
//
// The progressive-overload engine needs REAL perceived effort next to the sets
// it already reads. The migration re-creates svj_get_exercise_history to also
// return the activity's stored perceived_effort — nothing else about the
// response changes, and effort is never invented when the user did not log it.
//
// Isolated PGlite/WASM by default, or an explicitly named LOCAL test database
// (SVJ_REWARD_TEST_DATABASE_URL) — never a remote host.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const connectionString = process.env.SVJ_REWARD_TEST_DATABASE_URL;
const native = Boolean(connectionString);
if (native) {
  const target = new URL(connectionString);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
    "Training history database tests refuse remote hosts",
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

/** The canonical save path, with the session effort the logger collects. */
async function saveStrength(userId, sessionId, exercises, perceivedEffort = null) {
  const endedAt = new Date();
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
      perceivedEffort,
      null,
    ],
  );
  return result.rows[0].result;
}

const historyFor = async (userId, exercise) =>
  (
    await asRole("authenticated", userId, "SELECT public.svj_get_exercise_history($1) AS result", [
      exercise,
    ])
  ).rows[0].result;

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

describe("effort migration safety (20261001000000_training_history_effort.sql)", () => {
  const sql = readFileSync(
    "supabase/migrations/20261001000000_training_history_effort.sql",
    "utf8",
  );

  it("is additive only — it re-creates one read function, nothing destructive", () => {
    assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
    assert.doesNotMatch(sql, /DROP FUNCTION/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.svj_get_exercise_history/);
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.svj_get_exercise_history\(uuid, integer\) TO authenticated/,
    );
  });

  it("returns effort beside the sets without changing the rest of the response", () => {
    assert.match(sql, /'perceived_effort', s\.perceived_effort/);
    assert.match(sql, /'sets', s\.sets/);
    assert.match(sql, /'records', v_records/);
    assert.doesNotMatch(sql, /xp|award/i, "no reward authority rides along");
  });
});

describe("perceived effort in exercise history", { concurrency: false }, () => {
  it("returns the stored session effort next to the sets, warm-ups intact", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    const outcome = await saveStrength(
      id,
      randomUUID(),
      [
        {
          exercise_id: bench,
          sets: [
            { reps: 15, weight_kg: 40, is_warmup: true },
            { reps: 10, weight_kg: 60 },
            { reps: 10, weight_kg: 60 },
            { reps: 10, weight_kg: 60 },
          ],
        },
      ],
      7,
    );
    assert.equal(outcome.ok, true);

    const history = await historyFor(id, bench);
    assert.equal(history.ok, true);
    assert.equal(
      history.sessions[0].perceived_effort,
      7,
      "the logged effort is read back verbatim",
    );
    assert.deepEqual(
      history.sessions[0].sets.map((s) => s.is_warmup),
      [true, false, false, false],
      "the set payload the engine already consumed is unchanged",
    );
  });

  it("never invents effort when the user did not log it", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    const outcome = await saveStrength(id, randomUUID(), [
      { exercise_id: bench, sets: [{ reps: 10, weight_kg: 60 }] },
    ]);
    assert.equal(outcome.ok, true);

    const history = await historyFor(id, bench);
    assert.equal(history.ok, true);
    assert.equal(history.sessions[0].perceived_effort, null);
  });

  it("rejects effort outside the 1–10 scale instead of storing nonsense", async () => {
    const id = await account();
    const bench = await exerciseId("bench_press");
    await assert.rejects(
      saveStrength(
        id,
        randomUUID(),
        [{ exercise_id: bench, sets: [{ reps: 10, weight_kg: 60 }] }],
        11,
      ),
      /effort|between/i,
    );
  });

  it("keeps one user's effort history invisible to another", async () => {
    const owner = await account();
    const other = await account();
    const bench = await exerciseId("bench_press");
    await saveStrength(
      owner,
      randomUUID(),
      [{ exercise_id: bench, sets: [{ reps: 10, weight_kg: 60 }] }],
      9,
    );
    const viewer = await historyFor(other, bench);
    assert.equal(viewer.ok, true);
    assert.deepEqual(viewer.sessions, [], "history is derived from the caller's own sets only");
  });

  it("requires authentication — no anonymous effort history", async () => {
    const bench = await exerciseId("bench_press");
    await assert.rejects(
      asRole("authenticated", null, "SELECT public.svj_get_exercise_history($1) AS result", [
        bench,
      ]),
      /Authentication required/i,
    );
  });
});
