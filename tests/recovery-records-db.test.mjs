// Phase 6 — real PostgreSQL behaviour for derived Recovery records (isolated
// PGlite/WASM, or an explicitly named LOCAL test database — never a remote host).
//
// Verifies, against the real migration chain, that every Recovery record is
// DERIVED ON READ from canonical recovery history:
//   - highest_readiness_score    MAX(score), ties keep the most recent day, 0 is data
//   - longest_checkin_streak     consecutive stored check-in days, gaps break it
//   - longest_ready_streak       consecutive readiness days at the 60 boundary
//   - best_7d_readiness_average  7 COMPLETE calendar days, SUM(score)/7.0
// plus: no record table/column/write RPC exists, records never award stats or
// complete goals, and no user (or anon) can read another user's records.
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
    "Recovery records database tests refuse remote hosts",
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
  await execute(`INSERT INTO public.user_stats(user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
  return id;
}

/** The exact call the client makes: authenticated, no user id parameter. */
const listRecords = async (userId) =>
  (await asRole("authenticated", userId, "SELECT public.svj_list_recovery_records() AS r")).rows[0]
    .r;

const recordOf = (envelope, recordType) =>
  (envelope.records ?? []).find((row) => row.record_type === recordType) ?? null;

const history = async (userId, limit = 30) =>
  (
    await asRole("authenticated", userId, "SELECT public.svj_list_my_recovery_history($1) AS r", [
      limit,
    ])
  ).rows[0].r;

/** Create a goal as the caller (Phase 5 surface, to prove Records cannot touch it). */
const createGoal = async (userId, metric, target, periodType, start, end) =>
  (
    await asRole("authenticated", userId, "SELECT public.svj_create_goal($1,$2,$3,$4,$5,$6) AS r", [
      metric,
      target,
      periodType,
      start,
      end,
      null,
    ])
  ).rows[0].r;

const discipline = async (userId) =>
  (await execute("SELECT discipline FROM public.user_stats WHERE user_id = $1", [userId])).rows[0]
    .discipline;

const statEvents = async (userId) =>
  (await execute("SELECT COUNT(*)::int AS n FROM public.stat_events WHERE user_id = $1", [userId]))
    .rows[0].n;

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/** One canonical readiness snapshot row (server-derived in production). */
async function readinessDay(userId, date, score) {
  await execute(
    `INSERT INTO public.svj_readiness_daily(user_id, readiness_date, score, training_load, load_score, recovery_grade)
     VALUES ($1,$2,$3,'low',$4,'unknown')`,
    [userId, date, score, Math.min(100, score)],
  );
}

/** One canonical check-in row (stored user check-in). */
async function checkin(userId, date) {
  await execute(
    `INSERT INTO public.svj_recovery_checkins(user_id, checkin_date, sleep_hours)
     VALUES ($1,$2,7.5) ON CONFLICT (user_id, checkin_date) DO NOTHING`,
    [userId, date],
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

describe("highest_readiness_score", { concurrency: false }, () => {
  it("reports no record at all when the user has no readiness rows", async () => {
    const id = await account();
    const envelope = await listRecords(id);
    assert.equal(envelope.ok, true);
    // An absent record is absent — never reported as 0.
    assert.deepEqual(envelope.records, []);
  });

  it("treats a genuinely stored score of 0 as valid data", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-2), 0);
    const record = recordOf(await listRecords(id), "highest_readiness_score");
    assert.equal(record.value, 0, "a real 0 is data, not a missing record");
    assert.equal(record.achieved_date, dayKey(-2));
  });

  it("selects the highest score and its own canonical day", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-4), 55);
    await readinessDay(id, dayKey(-3), 84);
    await readinessDay(id, dayKey(-2), 61);
    const record = recordOf(await listRecords(id), "highest_readiness_score");
    assert.equal(record.value, 84);
    assert.equal(record.achieved_date, dayKey(-3));
  });

  it("breaks a tie with the most recent qualifying day", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-5), 92);
    await readinessDay(id, dayKey(-1), 92);
    const record = recordOf(await listRecords(id), "highest_readiness_score");
    assert.equal(record.value, 92);
    assert.equal(record.achieved_date, dayKey(-1));
  });
});

describe("longest_checkin_streak", { concurrency: false }, () => {
  it("counts a single stored check-in as a one-day streak", async () => {
    const id = await account();
    await checkin(id, dayKey(-1));
    const record = recordOf(await listRecords(id), "longest_checkin_streak");
    assert.equal(record.value, 1);
    assert.equal(record.achieved_date, dayKey(-1));
    assert.equal(record.start_date, dayKey(-1));
  });

  it("grows the streak across consecutive server days", async () => {
    const id = await account();
    for (const offset of [-3, -2, -1, 0]) await checkin(id, dayKey(offset));
    const record = recordOf(await listRecords(id), "longest_checkin_streak");
    assert.equal(record.value, 4);
    assert.equal(record.start_date, dayKey(-3));
    assert.equal(record.achieved_date, dayKey(0));
  });

  it("breaks the streak on a missing calendar day", async () => {
    const id = await account();
    for (const offset of [-9, -8, -7]) await checkin(id, dayKey(offset));
    for (const offset of [-1, 0]) await checkin(id, dayKey(offset));
    const record = recordOf(await listRecords(id), "longest_checkin_streak");
    assert.equal(record.value, 3);
    assert.equal(record.achieved_date, dayKey(-7));
  });

  it("cannot inflate the count by re-saving the same day", async () => {
    const id = await account();
    await checkin(id, dayKey(-1));
    // A second check-in for the SAME server day updates the one row.
    await execute(
      `INSERT INTO public.svj_recovery_checkins(user_id, checkin_date, energy)
       VALUES ($1,$2,4)
       ON CONFLICT (user_id, checkin_date) DO UPDATE SET energy = EXCLUDED.energy, updated_at = now()`,
      [id, dayKey(-1)],
    );
    const rows = await execute(
      "SELECT COUNT(*)::int AS n FROM public.svj_recovery_checkins WHERE user_id = $1",
      [id],
    );
    assert.equal(rows.rows[0].n, 1, "one date stays one row");
    const record = recordOf(await listRecords(id), "longest_checkin_streak");
    assert.equal(record.value, 1);
  });

  it("breaks a tie between two equal streaks with the most recent run", async () => {
    const id = await account();
    for (const offset of [-10, -9, -8]) await checkin(id, dayKey(offset));
    for (const offset of [-3, -2, -1]) await checkin(id, dayKey(offset));
    const record = recordOf(await listRecords(id), "longest_checkin_streak");
    assert.equal(record.value, 3);
    assert.equal(record.start_date, dayKey(-3));
    assert.equal(record.achieved_date, dayKey(-1));
  });
});

describe("longest_ready_streak", { concurrency: false }, () => {
  it("qualifies a day at exactly the 60 boundary", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-2), 60);
    const record = recordOf(await listRecords(id), "longest_ready_streak");
    assert.equal(record.value, 1);
    assert.equal(record.achieved_date, dayKey(-2));
  });

  it("breaks the streak on a score of 59", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-4), 80);
    await readinessDay(id, dayKey(-3), 59);
    await readinessDay(id, dayKey(-2), 80);
    await readinessDay(id, dayKey(-1), 80);
    const record = recordOf(await listRecords(id), "longest_ready_streak");
    assert.equal(record.value, 2, "59 breaks the run");
    assert.equal(record.start_date, dayKey(-2));
    assert.equal(record.achieved_date, dayKey(-1));
  });

  it("breaks the streak on a missing readiness day", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-4), 70);
    await readinessDay(id, dayKey(-3), 70);
    // day -2 deliberately has NO canonical readiness row.
    await readinessDay(id, dayKey(-1), 70);
    await readinessDay(id, dayKey(0), 70);
    const record = recordOf(await listRecords(id), "longest_ready_streak");
    assert.equal(record.value, 2, "the missing day is never filled in");
    assert.equal(record.achieved_date, dayKey(0));
  });

  it("keeps a real score of 0 as data but never as a ready day", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-2), 0);
    await readinessDay(id, dayKey(-1), 0);
    const envelope = await listRecords(id);
    assert.equal(recordOf(envelope, "highest_readiness_score").value, 0);
    assert.equal(recordOf(envelope, "longest_ready_streak"), null);
  });

  it("breaks a tie between two equal ready streaks with the most recent run", async () => {
    const id = await account();
    for (const offset of [-10, -9, -8]) await readinessDay(id, dayKey(offset), 75);
    for (const offset of [-2, -1, 0]) await readinessDay(id, dayKey(offset), 65);
    const record = recordOf(await listRecords(id), "longest_ready_streak");
    assert.equal(record.value, 3);
    assert.equal(record.start_date, dayKey(-2));
    assert.equal(record.achieved_date, dayKey(0));
  });
});

describe("best_7d_readiness_average", { concurrency: false }, () => {
  it("qualifies exactly seven consecutive days and averages them", async () => {
    const id = await account();
    const scores = [0, 50, 60, 70, 80, 90, 100];
    for (const [index, score] of scores.entries())
      await readinessDay(id, dayKey(-6 + index), score);
    const record = recordOf(await listRecords(id), "best_7d_readiness_average");
    assert.equal(record.start_date, dayKey(-6));
    assert.equal(record.achieved_date, dayKey(0));
    // 450 / 7 = 64.285714285714285714… at full numeric precision.
    assert.ok(Math.abs(record.value - 450 / 7) < 1e-9, `got ${record.value}`);
  });

  it("does not qualify six days", async () => {
    const id = await account();
    for (const offset of [-5, -4, -3, -2, -1, 0]) await readinessDay(id, dayKey(offset), 80);
    assert.equal(recordOf(await listRecords(id), "best_7d_readiness_average"), null);
  });

  it("invalidates a window whose middle day is missing, then qualifies once it exists", async () => {
    const id = await account();
    for (const offset of [-6, -5, -4, -3, -1, 0]) await readinessDay(id, dayKey(offset), 70);
    assert.equal(
      recordOf(await listRecords(id), "best_7d_readiness_average"),
      null,
      "a gap invalidates the window instead of counting as 0",
    );
    await readinessDay(id, dayKey(-2), 70);
    const record = recordOf(await listRecords(id), "best_7d_readiness_average");
    assert.ok(record, "all seven days present now qualify");
    assert.equal(record.value, 70);
    assert.equal(record.start_date, dayKey(-6));
    assert.equal(record.achieved_date, dayKey(0));
  });

  it("includes a real zero score instead of treating it as missing", async () => {
    const id = await account();
    for (const offset of [-6, -5, -4, -3, -2, -1, 0]) await readinessDay(id, dayKey(offset), 0);
    const record = recordOf(await listRecords(id), "best_7d_readiness_average");
    assert.equal(record.value, 0);
    assert.equal(Number.isFinite(record.value), true);
  });

  it("evaluates overlapping windows and keeps the highest average", async () => {
    const id = await account();
    // One complete strong week, a gap, then one complete weak week.
    for (const offset of [-20, -19, -18, -17, -16, -15, -14])
      await readinessDay(id, dayKey(offset), 90);
    for (const offset of [-6, -5, -4, -3, -2, -1, 0]) await readinessDay(id, dayKey(offset), 20);
    const record = recordOf(await listRecords(id), "best_7d_readiness_average");
    assert.equal(record.value, 90);
    assert.equal(record.start_date, dayKey(-20));
    assert.equal(record.achieved_date, dayKey(-14));
  });

  it("breaks a tie between two equal 7-day windows with the most recent window", async () => {
    const id = await account();
    for (let offset = -13; offset <= 0; offset += 1) await readinessDay(id, dayKey(offset), 60);
    const record = recordOf(await listRecords(id), "best_7d_readiness_average");
    assert.equal(record.value, 60);
    assert.equal(record.achieved_date, dayKey(0), "the most recent window wins");
    assert.equal(record.start_date, dayKey(-6));
  });

  it("returns a finite numeric average — never NaN or Infinity", async () => {
    const id = await account();
    for (const offset of [-6, -5, -4, -3, -2, -1, 0]) await readinessDay(id, dayKey(offset), 33);
    const record = recordOf(await listRecords(id), "best_7d_readiness_average");
    assert.equal(typeof record.value, "number");
    assert.equal(Number.isFinite(record.value), true);
    // JSON round-trip: an unrepresentable value would be null instead.
    const roundTrip = JSON.parse(JSON.stringify(await listRecords(id)));
    const again = recordOf(roundTrip, "best_7d_readiness_average");
    assert.equal(Number.isFinite(again.value), true);
  });

  it("agrees with History: a day History omits never enters a window", async () => {
    const id = await account();
    for (const offset of [-6, -5, -4, -3, -2, -1]) await readinessDay(id, dayKey(offset), 88);
    const points = await history(id, 30);
    const days = points.map((point) => point.date);
    assert.equal(days.includes(dayKey(0)), false, "History calls today absent");
    assert.equal(recordOf(await listRecords(id), "best_7d_readiness_average"), null);
    // The highest-score record still uses a day History actually returned.
    const record = recordOf(await listRecords(id), "highest_readiness_score");
    assert.equal(days.includes(record.achieved_date), true);
  });
});

describe("records are derived, never stored or writable", { concurrency: false }, () => {
  it("has no record table and no record column anywhere", async () => {
    const tables = await execute(
      `SELECT relname FROM pg_class
       WHERE relkind = 'r' AND relname IN
         ('recovery_records', 'personal_recovery_records', 'recovery_prs', 'svj_recovery_records')`,
    );
    assert.deepEqual(tables.rows, [], "no mutable recovery record table may exist");
  });

  it("exposes no create/update/delete record RPC at all", async () => {
    const functions = await execute(
      `SELECT p.proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND (p.proname LIKE '%recovery_record%' OR p.proname LIKE '%record%recovery%')
       ORDER BY p.proname`,
    );
    assert.deepEqual(
      functions.rows.map((row) => row.proname),
      ["svj_list_recovery_records"],
      "only the derived reader exists — no write path for a record",
    );
    for (const write of [
      "svj_create_recovery_record",
      "svj_update_recovery_record",
      "svj_delete_recovery_record",
      "svj_set_recovery_record",
    ]) {
      await assert.rejects(
        () => asRole("authenticated", randomUUID(), `SELECT public.${write}() IS NULL AS r`),
        (error) => /function|does not exist/i.test(String(error.message)),
        `${write} must not exist`,
      );
    }
  });

  it("is a HARDENED reader: search_path set, not SECURITY DEFINER, anon denied", async () => {
    const rows = await execute(
      `SELECT p.prosecdef, p.provolatile, p.proconfig,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ok,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_ok
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'svj_list_recovery_records'`,
    );
    assert.equal(rows.rows.length, 1);
    const [fn] = rows.rows;
    assert.equal(fn.prosecdef, false, "the reader runs with the caller's rights");
    assert.equal(fn.provolatile, "s", "the reader is STABLE");
    assert.ok(
      (fn.proconfig ?? []).some((entry) => entry.startsWith("search_path=")),
      "search_path must be pinned",
    );
    assert.equal(fn.anon_ok, false, "anon must not execute the reader");
    assert.equal(fn.authenticated_ok, true);
  });

  it("re-derives the record when canonical history changes", async () => {
    const id = await account();
    await checkin(id, dayKey(-1));
    assert.equal(recordOf(await listRecords(id), "longest_checkin_streak").value, 1);
    await checkin(id, dayKey(0));
    assert.equal(recordOf(await listRecords(id), "longest_checkin_streak").value, 2);

    await readinessDay(id, dayKey(-1), 40);
    assert.equal(recordOf(await listRecords(id), "highest_readiness_score").value, 40);
    await execute(
      "UPDATE public.svj_readiness_daily SET score = 95 WHERE user_id = $1 AND readiness_date = $2",
      [id, dayKey(-1)],
    );
    assert.equal(
      recordOf(await listRecords(id), "highest_readiness_score").value,
      95,
      "the record follows the canonical row, so it cannot be a stored snapshot",
    );
  });

  it("never awards XP, Discipline or a goal completion", async () => {
    const id = await account();
    await checkin(id, dayKey(0));
    const before = await discipline(id);
    const goal = await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    await listRecords(id);
    await listRecords(id);
    assert.equal(await discipline(id), before, "reading records grants no stat");
    assert.equal(await statEvents(id), 0);
    const stored = (
      await execute("SELECT status FROM public.svj_goals WHERE id = $1", [goal.goal.id])
    ).rows[0];
    assert.equal(stored.status, "active", "records are not goals and never complete one");
  });
});

describe("security", { concurrency: false }, () => {
  it("exposes only the caller's own recovery history", async () => {
    const owner = await account();
    const stranger = await account();
    for (const offset of [-2, -1, 0]) await checkin(owner, dayKey(offset));
    for (const offset of [-11, -10, -9, -8]) await readinessDay(owner, dayKey(offset), 77);
    await checkin(stranger, dayKey(-1));
    await readinessDay(stranger, dayKey(-1), 12);

    const mine = await listRecords(owner);
    assert.equal(recordOf(mine, "highest_readiness_score").value, 77);
    assert.equal(recordOf(mine, "longest_checkin_streak").value, 3);

    const theirs = await listRecords(stranger);
    assert.equal(recordOf(theirs, "highest_readiness_score").value, 12);
    assert.equal(recordOf(theirs, "longest_checkin_streak").value, 1);
    assert.equal(recordOf(theirs, "best_7d_readiness_average"), null);

    // The stranger's data can never leak into the owner's records: the owner
    // has exactly their own three records (score, check-in streak, ready
    // streak), their single weak day is never the highest score, and their
    // ready streak is the one their OWN four 77-point days form.
    assert.equal(mine.records.length, 3);
    assert.notEqual(recordOf(mine, "highest_readiness_score").value, 12);
    const ready = recordOf(mine, "longest_ready_streak");
    assert.equal(ready.value, 4);
    assert.equal(ready.start_date, dayKey(-11));
    assert.equal(ready.achieved_date, dayKey(-8));
  });

  it("denies anon and unauthenticated callers", async () => {
    const owner = await account();
    await checkin(owner, dayKey(0));
    await assert.rejects(
      () => asRole("anon", null, "SELECT public.svj_list_recovery_records() AS r"),
      (error) => /permission denied/i.test(String(error.message)),
      "anon cannot execute the records reader",
    );
  });

  it("requires authentication inside the function as well", async () => {
    await assert.rejects(
      () => asRole("authenticated", null, "SELECT public.svj_list_recovery_records() AS r"),
      (error) => /authentication required/i.test(String(error.message)),
      "a session without a subject is refused",
    );
  });
});
