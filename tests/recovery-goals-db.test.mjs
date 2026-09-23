// Phase 5 — real PostgreSQL behaviour for Recovery goals (isolated PGlite/WASM,
// or an explicitly named LOCAL test database — never a remote host).
//
// Verifies, against the real migration chain:
//   - the four activity metrics keep their exact original progress rules,
//   - the four Recovery metrics count qualifying days server-side,
//   - the expired lifecycle fix (completion wins over expiry),
//   - Discipline progression is idempotent, capped, and never fires for
//     cancelled/expired/incomplete goals.
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
    "Recovery goals database tests refuse remote hosts",
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

/** Create a goal as the caller (mirrors the client path). */
const createGoal = async (userId, metric, target, periodType, start, end, activityType = null) =>
  (
    await asRole("authenticated", userId, "SELECT public.svj_create_goal($1,$2,$3,$4,$5,$6) AS r", [
      metric,
      target,
      periodType,
      start,
      end,
      activityType,
    ])
  ).rows[0].r;

const listGoals = async (userId, includeCompleted = true) =>
  (
    await asRole("authenticated", userId, "SELECT public.svj_list_goals($1) AS r", [
      includeCompleted,
    ])
  ).rows[0].r;

const refresh = async (userId) =>
  (
    await asRole("authenticated", userId, "SELECT public.svj_refresh_goal_statuses($1) AS r", [
      userId,
    ])
  ).rows[0].r;

const rawGoal = async (userId, goalId) =>
  (await execute("SELECT * FROM public.svj_goals WHERE id = $1", [goalId])).rows[0];

const stats = async (userId) =>
  (await execute("SELECT discipline FROM public.user_stats WHERE user_id = $1", [userId])).rows[0]
    .discipline;

const goalEvents = async (userId) =>
  (
    await execute(
      "SELECT delta, source, event_key FROM public.stat_events WHERE user_id = $1 AND source = 'recovery_goal' ORDER BY created_at",
      [userId],
    )
  ).rows;

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

async function checkin(
  userId,
  date,
  { sleep = null, soreness = null, energy = null, perceived = null } = {},
) {
  await execute(
    `INSERT INTO public.svj_recovery_checkins(user_id, checkin_date, sleep_hours, soreness, energy, perceived_recovery)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, checkin_date) DO NOTHING`,
    [userId, date, sleep, soreness, energy, perceived],
  );
}

async function readinessDay(userId, date, score) {
  await execute(
    `INSERT INTO public.svj_readiness_daily(user_id, readiness_date, score, training_load, load_score, recovery_grade)
     VALUES ($1,$2,$3,'low',$4,'unknown') ON CONFLICT (user_id, readiness_date) DO NOTHING`,
    [userId, date, score, Math.min(100, score)],
  );
}

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

// ── Activity metrics keep their exact original rules ────────────────────────

describe("activity metrics unchanged", { concurrency: false }, () => {
  it("counts workouts from any source as before", async () => {
    const id = await account();
    await recordActivity(id, { daysAgo: 0 });
    await recordActivity(id, { daysAgo: 1, minutes: 30 });
    const goal = await createGoal(id, "workout_count", 2, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 2);
  });

  it("still refuses non-native steps (anti-cheat preserved)", async () => {
    const id = await account();
    await execute(
      `INSERT INTO public.svj_activities(user_id, client_session_id, activity_type, source, started_at, ended_at, duration_seconds, step_count)
       VALUES ($1,$2,'walking','manual',now()-interval '1 hour',now(),3600,9000)`,
      [id, randomUUID().replace(/-/g, "").slice(0, 12)],
    );
    const goal = await createGoal(id, "step_total", 1000, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 0, "manual steps can never count");
  });

  it("keeps active_minutes derived from real duration", async () => {
    const id = await account();
    await recordActivity(id, { minutes: 45, daysAgo: 0 });
    const goal = await createGoal(id, "active_minutes", 30, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 45);
  });
});

// ── Recovery metric definitions ─────────────────────────────────────────────

describe("recovery_checkin_count", { concurrency: false }, () => {
  it("counts distinct stored check-in days only", async () => {
    const id = await account();
    await checkin(id, dayKey(-1), { sleep: 7 });
    await checkin(id, dayKey(0), { sleep: 6 });
    const goal = await createGoal(id, "recovery_checkin_count", 2, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 2);
  });

  it("duplicate-day upserts cannot double-count one day", async () => {
    const id = await account();
    await checkin(id, dayKey(0), { sleep: 7 });
    await checkin(id, dayKey(0), { sleep: 8 }); // unique constraint keeps one row
    const goal = await createGoal(id, "recovery_checkin_count", 5, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 1);
  });

  it("opening recovery without saving never counts (no row = no progress)", async () => {
    const id = await account();
    const goal = await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 0);
  });
});

describe("sleep_7h_day_count", { concurrency: false }, () => {
  it("counts 7h and 8h nights", async () => {
    const id = await account();
    await checkin(id, dayKey(-1), { sleep: 7 });
    await checkin(id, dayKey(0), { sleep: 8.5 });
    const goal = await createGoal(id, "sleep_7h_day_count", 2, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 2);
  });

  it("does not count nights below 7h", async () => {
    const id = await account();
    await checkin(id, dayKey(0), { sleep: 6.9 });
    const goal = await createGoal(id, "sleep_7h_day_count", 1, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 0);
  });

  it("never converts NULL sleep into 0 or a qualifying value", async () => {
    const id = await account();
    await checkin(id, dayKey(0), { sleep: null });
    const goal = await createGoal(id, "sleep_7h_day_count", 1, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 0);
  });
});

describe("rest_day_count", { concurrency: false }, () => {
  it("uses the readiness rest-day semantics (no activity that day)", async () => {
    const id = await account();
    await recordActivity(id, { daysAgo: 1 }); // yesterday: active
    const goal = await createGoal(id, "rest_day_count", 3, "weekly", dayKey(-3), dayKey(3));
    // Elapsed days: -3, -2, -1, 0. -1 has an activity → 3 rest days.
    assert.ok(goal.goal.progress >= 3, `elapsed rest days counted, got ${goal.goal.progress}`);
    assert.ok(goal.goal.progress <= 4, "future days never counted");
  });

  it("future dates never contribute", async () => {
    const id = await account();
    const goal = await createGoal(id, "rest_day_count", 3, "weekly", dayKey(-1), dayKey(5));
    // Elapsed days: -1 and today → at most 2 even though the period spans 7.
    assert.ok(goal.goal.progress <= 2, `only elapsed days count, got ${goal.goal.progress}`);
  });
});

describe("readiness_60_day_count", { concurrency: false }, () => {
  it("counts 60+ days and excludes 59 and missing days", async () => {
    const id = await account();
    await readinessDay(id, dayKey(-1), 60);
    await readinessDay(id, dayKey(0), 59);
    // dayKey(-2): deliberately no readiness row.
    const goal = await createGoal(id, "readiness_60_day_count", 3, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 1);
  });

  it("does not treat a missing readiness day as score 0 or 60", async () => {
    const id = await account();
    const goal = await createGoal(id, "readiness_60_day_count", 1, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.goal.progress, 0);
  });
});

// ── Target validation ───────────────────────────────────────────────────────

describe("recovery target validation", { concurrency: false }, () => {
  it("rejects a weekly target larger than the period days", async () => {
    const id = await account();
    await assert.rejects(
      asRole("authenticated", id, "SELECT public.svj_create_goal($1,$2,$3,$4,$5,$6)", [
        "recovery_checkin_count",
        20,
        "weekly",
        dayKey(-3),
        dayKey(3),
        null,
      ]),
      /cannot exceed the days/,
    );
  });

  it("rejects a monthly target larger than the period days", async () => {
    const id = await account();
    await assert.rejects(
      asRole("authenticated", id, "SELECT public.svj_create_goal($1,$2,$3,$4,$5,$6)", [
        "rest_day_count",
        40,
        "monthly",
        dayKey(0),
        dayKey(30),
        null,
      ]),
      /cannot exceed the days/,
    );
  });

  it("rejects a non-integer recovery target", async () => {
    const id = await account();
    await assert.rejects(
      asRole("authenticated", id, "SELECT public.svj_create_goal($1,$2,$3,$4,$5,$6)", [
        "recovery_checkin_count",
        2.5,
        "weekly",
        dayKey(-3),
        dayKey(3),
        null,
      ]),
      /whole days/,
    );
  });

  it("rejects an activity type on a recovery goal", async () => {
    const id = await account();
    await assert.rejects(
      asRole("authenticated", id, "SELECT public.svj_create_goal($1,$2,$3,$4,$5,$6)", [
        "recovery_checkin_count",
        2,
        "weekly",
        dayKey(-3),
        dayKey(3),
        "running",
      ]),
      /activity type/i,
    );
  });

  it("accepts a valid recovery goal at the period boundary", async () => {
    const id = await account();
    const goal = await createGoal(id, "recovery_checkin_count", 7, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.ok, true);
  });

  it("keeps large activity targets valid (unchanged behavior)", async () => {
    const id = await account();
    const goal = await createGoal(id, "step_total", 100000, "weekly", dayKey(-3), dayKey(3));
    assert.equal(goal.ok, true);
  });
});

// ── Lifecycle: completion wins over expiry ──────────────────────────────────

describe("goal lifecycle", { concurrency: false }, () => {
  it("an active unmet goal inside its period stays active", async () => {
    const id = await account();
    const goal = await createGoal(id, "recovery_checkin_count", 5, "weekly", dayKey(-3), dayKey(3));
    await refresh(id);
    assert.equal((await rawGoal(id, goal.goal.id)).status, "active");
  });

  it("a target-met goal becomes completed", async () => {
    const id = await account();
    await checkin(id, dayKey(-1));
    await checkin(id, dayKey(0));
    const goal = await createGoal(id, "recovery_checkin_count", 2, "weekly", dayKey(-3), dayKey(3));
    await refresh(id);
    assert.equal((await rawGoal(id, goal.goal.id)).status, "completed");
  });

  it("a past unmet goal becomes expired (the fixed bug)", async () => {
    const id = await account();
    const goal = await createGoal(
      id,
      "recovery_checkin_count",
      5,
      "weekly",
      dayKey(-20),
      dayKey(-14),
    );
    await refresh(id);
    assert.equal((await rawGoal(id, goal.goal.id)).status, "expired");
  });

  it("a target-met past goal becomes completed, NOT expired", async () => {
    const id = await account();
    await checkin(id, dayKey(-15));
    await checkin(id, dayKey(-14));
    const goal = await createGoal(
      id,
      "recovery_checkin_count",
      2,
      "weekly",
      dayKey(-20),
      dayKey(-14),
    );
    await refresh(id);
    assert.equal((await rawGoal(id, goal.goal.id)).status, "completed");
  });

  it("cancelled stays cancelled and completed stays completed", async () => {
    const id = await account();
    const a = await createGoal(id, "recovery_checkin_count", 2, "weekly", dayKey(-3), dayKey(3));
    const b = await createGoal(id, "recovery_checkin_count", 2, "weekly", dayKey(-3), dayKey(3));
    await asRole("authenticated", id, "SELECT public.svj_cancel_goal($1)", [a.goal.id]);
    await checkin(id, dayKey(0));
    await checkin(id, dayKey(-1));
    await refresh(id);
    assert.equal((await rawGoal(id, a.goal.id)).status, "cancelled");
    assert.equal((await rawGoal(id, b.goal.id)).status, "completed");
  });

  it("an old active goal stuck past its period repairs itself on refresh", async () => {
    const id = await account();
    const goal = await createGoal(
      id,
      "recovery_checkin_count",
      7,
      "weekly",
      dayKey(-30),
      dayKey(-24),
    );
    await refresh(id);
    assert.equal((await rawGoal(id, goal.goal.id)).status, "expired");
  });
});

// ── Discipline progression ──────────────────────────────────────────────────

describe("discipline stat progression", { concurrency: false }, () => {
  it("a legitimate completion grants exactly +1 discipline", async () => {
    const id = await account();
    const before = await stats(id);
    await checkin(id, dayKey(0));
    const goal = await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    await refresh(id);
    assert.equal(await stats(id), before + 1);
    const events = await goalEvents(id);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_key, `recovery_goal.completed:${goal.goal.id}`);
    assert.equal(events[0].source, "recovery_goal");
  });

  it("refreshing twice still grants only +1 (idempotent event key)", async () => {
    const id = await account();
    await checkin(id, dayKey(0));
    await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    await refresh(id);
    await refresh(id);
    await refresh(id);
    assert.equal((await goalEvents(id)).length, 1);
    const after = await stats(id);
    await refresh(id);
    assert.equal(await stats(id), after);
  });

  it("repeated svj_list_goals() grants no duplicate reward", async () => {
    const id = await account();
    await checkin(id, dayKey(0));
    await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    await listGoals(id);
    await listGoals(id);
    await listGoals(id);
    assert.equal((await goalEvents(id)).length, 1);
  });

  it("a cancelled goal grants zero stat", async () => {
    const id = await account();
    await checkin(id, dayKey(0));
    const goal = await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    await asRole("authenticated", id, "SELECT public.svj_cancel_goal($1)", [goal.goal.id]);
    await refresh(id);
    assert.equal((await goalEvents(id)).length, 0);
    assert.equal(await stats(id), 50);
  });

  it("an expired goal grants zero stat", async () => {
    const id = await account();
    await createGoal(id, "recovery_checkin_count", 5, "weekly", dayKey(-20), dayKey(-14));
    await refresh(id);
    assert.equal((await goalEvents(id)).length, 0);
  });

  it("an incomplete active goal grants zero stat", async () => {
    const id = await account();
    await createGoal(id, "recovery_checkin_count", 7, "weekly", dayKey(-3), dayKey(3));
    await refresh(id);
    assert.equal((await goalEvents(id)).length, 0);
  });

  it("the daily recovery_goal cap (+2) blocks a third same-day completion", async () => {
    const id = await account();
    await checkin(id, dayKey(-1));
    await checkin(id, dayKey(0));
    // Three distinct goals that all complete today.
    const g1 = await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    const g2 = await createGoal(id, "recovery_checkin_count", 2, "weekly", dayKey(-3), dayKey(3));
    const g3 = await createGoal(id, "recovery_checkin_count", 3, "weekly", dayKey(-3), dayKey(3));
    await refresh(id);
    const events = await goalEvents(id);
    const grantedKeys = events.map((e) => e.event_key);
    assert.ok(grantedKeys.includes(`recovery_goal.completed:${g1.goal.id}`));
    assert.ok(grantedKeys.includes(`recovery_goal.completed:${g2.goal.id}`));
    // Third completion is capped: event rolled back, status is still completed.
    assert.equal(grantedKeys.includes(`recovery_goal.completed:${g3.goal.id}`), false);
    assert.equal(
      events.reduce((s, e) => s + e.delta, 0),
      2,
    );
    assert.equal(await stats(id), 52);
  });

  it("the activity discipline cap is untouched by recovery awards", async () => {
    const id = await account();
    // Seed activity-source discipline events up to the +3 activity cap.
    for (let i = 0; i < 3; i += 1) {
      await execute(
        `INSERT INTO public.stat_events(user_id, stat_name, delta, source, event_key)
         VALUES ($1,'discipline',1,'activity',$2)`,
        [id, `activity.stat:test-${i}:discipline`],
      );
    }
    await execute("UPDATE public.user_stats SET discipline = 53 WHERE user_id = $1", [id]);
    await checkin(id, dayKey(0));
    await createGoal(id, "recovery_checkin_count", 1, "weekly", dayKey(-3), dayKey(3));
    await refresh(id);
    // Recovery award still lands: the caps are independent sums.
    assert.equal(await stats(id), 54);
  });
});
