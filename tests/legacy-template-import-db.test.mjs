// Real PostgreSQL behaviour for the legacy (on-device) template import.
//
// The contract this guards:
//   * an import creates exactly ONE owned template, version and library entry,
//     no matter how many times it is retried;
//   * importing awards no XP, records no strength sets and marks nothing
//     performed;
//   * owned templates are invisible to every other account;
//   * an exercise that is not in the catalog (or not owned by the caller) is
//     rejected instead of being accepted with guessed metadata;
//   * global reviewed catalog rows stay read-only for normal users.
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

const exerciseId = async (slug) =>
  (await execute("SELECT id FROM public.svj_exercises WHERE slug=$1", [slug])).rows[0].id;

const importTemplate = (userId, sourceKey, name, exercises) =>
  asRole(
    "authenticated",
    userId,
    "SELECT public.svj_import_legacy_template($1,$2,$3::jsonb) AS result",
    [sourceKey, name, JSON.stringify(exercises)],
  ).then((r) => r.rows[0].result);

const ownedTemplates = (userId) =>
  asRole("authenticated", userId, "SELECT public.svj_list_my_owned_templates() AS result").then(
    (r) => r.rows[0].result,
  );

const countRows = async (table, userId) =>
  (await execute(`SELECT count(*)::int AS n FROM public.${table} WHERE user_id=$1`, [userId]))
    .rows[0].n;

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

describe("legacy template import", { concurrency: false }, () => {
  it("creates one owned template, version and library entry", async () => {
    const userId = await account();
    const bench = await exerciseId("bench_press");
    const result = await importTemplate(userId, "legacy-template:abc-123", "Push Day", [
      {
        exercise_id: bench,
        name: "Bench Press",
        primary_muscle: "chest",
        sets: [{ reps: 8, weight_kg: 50 }],
      },
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.duplicate, false);
    assert.ok(result.template_id);

    const templates = await execute(
      "SELECT owner_user_id, source_key FROM public.svj_workout_templates WHERE id=$1",
      [result.template_id],
    );
    assert.equal(templates.rows.length, 1);
    assert.equal(templates.rows[0].owner_user_id, userId);
    assert.equal(templates.rows[0].source_key, "legacy-template:abc-123");

    const versions = await execute(
      "SELECT count(*)::int AS n FROM public.svj_workout_template_versions WHERE template_id=$1",
      [result.template_id],
    );
    assert.equal(versions.rows[0].n, 1);

    const library = await execute(
      "SELECT count(*)::int AS n FROM public.svj_user_template_library WHERE user_id=$1 AND template_id=$2",
      [userId, result.template_id],
    );
    assert.equal(library.rows[0].n, 1);
  });

  it("retrying the same source key is a duplicate with no extra rows", async () => {
    const userId = await account();
    const bench = await exerciseId("bench_press");
    const payload = [
      {
        exercise_id: bench,
        name: "Bench Press",
        primary_muscle: "chest",
        sets: [{ reps: 8, weight_kg: 50 }],
      },
    ];
    const first = await importTemplate(userId, "legacy-template:retry-me", "Push Day", payload);
    const second = await importTemplate(userId, "legacy-template:retry-me", "Push Day", payload);

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.template_id, first.template_id);

    const rows = await execute(
      "SELECT count(*)::int AS n FROM public.svj_workout_templates WHERE owner_user_id=$1 AND source_key=$2",
      [userId, "legacy-template:retry-me"],
    );
    assert.equal(rows.rows[0].n, 1, "retry must not create a duplicate card");
  });

  it("awards no XP, logs no sets and marks nothing performed", async () => {
    const userId = await account();
    const bench = await exerciseId("bench_press");
    await importTemplate(userId, "legacy-template:no-reward", "Push Day", [
      {
        exercise_id: bench,
        name: "Bench Press",
        primary_muscle: "chest",
        sets: [{ reps: 10, weight_kg: 60 }],
      },
    ]);

    assert.equal(await countRows("svj_strength_sets", userId), 0);
    assert.equal(await countRows("svj_activities", userId), 0);
    const sessions = await execute(
      "SELECT count(*)::int AS n FROM public.svj_training_plan_sessions s JOIN public.svj_training_plans p ON p.id = s.plan_id WHERE p.user_id=$1",
      [userId],
    );
    assert.equal(sessions.rows[0].n, 0, "an import never completes a plan slot");
  });

  it("keeps owned templates private to their owner", async () => {
    const owner = await account();
    const other = await account();
    const bench = await exerciseId("bench_press");
    const imported = await importTemplate(owner, "legacy-template:private-1", "Owner Only", [
      {
        exercise_id: bench,
        name: "Bench Press",
        primary_muscle: "chest",
        sets: [{ reps: 8, weight_kg: 40 }],
      },
    ]);

    const mine = await ownedTemplates(owner);
    assert.equal(mine.templates.length, 1);
    assert.equal(mine.templates[0].id, imported.template_id);

    const theirs = await ownedTemplates(other);
    assert.equal(theirs.templates.length, 0, "another account must not see the import");

    const direct = await asRole(
      "authenticated",
      other,
      "SELECT id FROM public.svj_workout_templates WHERE id=$1",
      [imported.template_id],
    );
    assert.equal(direct.rows.length, 0, "RLS hides another account's private template");

    const payload = await asRole(
      "authenticated",
      other,
      "SELECT payload FROM public.svj_workout_template_versions WHERE template_id=$1",
      [imported.template_id],
    );
    assert.equal(payload.rows.length, 0, "RLS hides another account's template payload");
  });

  it("gives each account its own row for the same source key", async () => {
    const a = await account();
    const b = await account();
    const bench = await exerciseId("bench_press");
    const payload = [
      {
        exercise_id: bench,
        name: "Bench Press",
        primary_muscle: "chest",
        sets: [{ reps: 5, weight_kg: 30 }],
      },
    ];
    const first = await importTemplate(a, "legacy-template:shared-key", "Shared", payload);
    const second = await importTemplate(b, "legacy-template:shared-key", "Shared", payload);

    assert.notEqual(first.template_id, second.template_id, "uniqueness is per owner");
    assert.equal(second.duplicate, false);
  });

  it("rejects an exercise that is not in the catalog", async () => {
    const userId = await account();
    await assert.rejects(
      importTemplate(userId, "legacy-template:unknown-exercise", "Mystery", [
        {
          exercise_id: randomUUID(),
          name: "Invented Movement",
          primary_muscle: "core",
          sets: [{ reps: 8, weight_kg: 10 }],
        },
      ]),
      /Unknown exercise/,
    );
    const rows = await execute(
      "SELECT count(*)::int AS n FROM public.svj_workout_templates WHERE owner_user_id=$1",
      [userId],
    );
    assert.equal(rows.rows[0].n, 0);
  });

  it("requires authentication", async () => {
    const bench = await exerciseId("bench_press");
    await assert.rejects(
      asRole("anon", null, "SELECT public.svj_import_legacy_template($1,$2,$3::jsonb)", [
        "legacy-template:anon-attempt",
        "Anon",
        JSON.stringify([
          { exercise_id: bench, name: "Bench Press", primary_muscle: "chest", sets: [] },
        ]),
      ]),
    );
  });

  it("refuses an unauthenticated listing", async () => {
    await assert.rejects(
      asRole("anon", null, "SELECT public.svj_list_my_owned_templates()"),
      /permission denied|Authentication required/i,
    );
  });

  it("keeps the global catalog read-only for normal users", async () => {
    const userId = await account();
    const global = await execute(
      "SELECT id, name FROM public.svj_workout_templates WHERE owner_user_id IS NULL LIMIT 1",
    );
    assert.equal(global.rows.length, 1, "the reviewed catalog is seeded");
    const before = global.rows[0].name;

    await assert.rejects(
      asRole(
        "authenticated",
        userId,
        "UPDATE public.svj_workout_templates SET name='hacked' WHERE id=$1",
        [global.rows[0].id],
      ),
      /permission denied/i,
    );
    const after = await execute("SELECT name FROM public.svj_workout_templates WHERE id=$1", [
      global.rows[0].id,
    ]);
    assert.equal(after.rows[0].name, before);
  });
});
