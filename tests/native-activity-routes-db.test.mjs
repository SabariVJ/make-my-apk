// Real-PostgreSQL tests for the SVJ route library (and the GPS save path it
// depends on): supabase/migrations/20260923000000_native_activity_track_storage.sql,
// 20260923010000_native_activity_rpcs.sql and
// 20260923020000_native_activity_live_share.sql.
//
// The whole migration chain is replayed from scratch, then every route-library
// operation is executed as an actual PostgreSQL `authenticated` role with JWT
// claims — so "save from a workout, rename, favourite, view distance and
// elevation" is proven against real SQL, not against a mock.
//
// Run standalone: `node --import tsx --test tests/native-activity-routes-db.test.mjs`
// or set SVJ_REWARD_TEST_DATABASE_URL to a disposable local PostgreSQL database.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
// The real client sends a simplified encoded polyline alongside the points
// (see src/app/lib/activityPlatform.ts buildGpsSavePayload). Reuse the exact
// encoder so this test submits the same payload the app does.
import { encodePolyline, simplifyTrack } from "../src/app/lib/gpsActivity.ts";

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

async function call(name, role, userId, args = []) {
  const placeholders = args.map((_, index) => "$" + (index + 1)).join(",");
  return asRole(role, userId, `SELECT public.${name}(${placeholders}) AS result`, args);
}

async function callResult(name, role, userId, args = []) {
  return (await call(name, role, userId, args)).rows[0].result;
}

async function account() {
  const id = randomUUID();
  await execute(
    "INSERT INTO auth.users(id,email,email_confirmed_at,created_at) VALUES ($1,$2,now(),now())",
    [id, `${id}@example.test`],
  );
  await execute(
    "INSERT INTO public.profiles(id,email,total_xp) VALUES ($1,$2,100) ON CONFLICT (id) DO NOTHING",
    [id, `${id}@example.test`],
  );
  return id;
}

/** A short but real running track: ~1.3 km north at ~22 m per minute. */
function buildTrack(pointCount = 60, degPerStep = 0.0002, stepMs = 60_000) {
  return Array.from({ length: pointCount }, (_, index) => ({
    lat: index * degPerStep,
    lng: 0,
    t: index * stepMs,
    ele: 100 + index * 2,
    moving: true,
    acc: 8,
  }));
}

/** Record one GPS workout through the real RPC and return the activity row. */
async function recordWorkout(userId, overrides = {}) {
  const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const endedAt = new Date().toISOString();
  const points = overrides.p_points ?? buildTrack();
  const simplified = simplifyTrack(points, 8);
  const payload = {
    p_client_session_id: `svj-gps-${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    p_activity_type: "running",
    p_started_at: startedAt,
    p_ended_at: endedAt,
    p_duration_seconds: 3600,
    p_points: points,
    p_step_count: 1200,
    p_polyline: simplified.length >= 2 ? encodePolyline(simplified) : null,
    p_bounds: null,
    p_device_platform: "android",
    p_gps_quality: "good",
    p_auto_paused: false,
    p_split_unit: "km",
    ...overrides,
    p_points: points,
  };
  const args = [
    payload.p_client_session_id,
    payload.p_activity_type,
    payload.p_started_at,
    payload.p_ended_at,
    payload.p_duration_seconds,
    JSON.stringify(payload.p_points),
    payload.p_step_count,
    null,
    payload.p_polyline,
    null,
    payload.p_device_platform,
    payload.p_gps_quality,
    payload.p_auto_paused,
    payload.p_split_unit,
    null,
  ];
  const result = await callResult("svj_save_gps_activity", "authenticated", userId, args);
  return result;
}

before(async () => {
  await ensureDatabase();
  if (skipAll) {
    console.warn(`[skip] SVJ route library DB: ${SKIP_MESSAGE}`);
    return;
  }
  try {
    void globalThis.location?.href;
  } catch {
    savedLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
    locationWasPoisoned = true;
  }
  // Same bootstrap sequence as the Earn Plus DB suite, so this exercises the
  // real production path: auth fixture → shipped migrations → the pending
  // Earn Plus scripts production already has → later migrations in order.
  await execScript(await readFile("tests/fixtures/rewards-auth.sql", "utf8"));
  const migrations = (await readdir("supabase/migrations")).filter((entry) => entry.endsWith(".sql")).sort();
  for (const name of migrations.filter((entry) => entry < "20260920000000")) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
  await execScript(await readFile("tests/fixtures/pre-hotfix-triggers.sql", "utf8"));
  await execScript(await readFile("supabase/pending/20260902_earned_plus.sql", "utf8"));
  await execScript(
    await readFile("supabase/pending/20260903_earned_plus_qualifying_days_7.sql", "utf8"),
  );
  for (const name of migrations.filter((entry) => entry >= "20260920000000")) {
    await execScript(await readFile("supabase/migrations/" + name, "utf8"));
  }
});

after(async () => {
  if (!database || skipAll) return;
  if (native) await database.end();
  else await database.close();
  if (locationWasPoisoned && savedLocationDescriptor) {
    Object.defineProperty(globalThis, "location", savedLocationDescriptor);
  }
});

describe("route library (real SQL roles)", { concurrency: false }, () => {
  it("records a GPS workout that exposes a route to save", async () => {
    if (skipAll) return;
    const id = await account();
    const saved = await recordWorkout(id);
    assert.equal(saved.ok, true);
    assert.equal(saved.duplicate, false);
    assert.equal(saved.activity.source, "svj_native");
    assert.ok(Number(saved.activity.distance_meters) > 1000, "server computed the distance");
    assert.ok(Number(saved.activity.track_point_count) >= 60);
    assert.ok(Array.isArray(saved.activity.splits) && saved.activity.splits.length >= 1);
    assert.equal(saved.activity.split_unit, "km");
    assert.ok(saved.activity.elevation_gain_meters != null);
  });

  it("rejects a save that has no usable track", async () => {
    if (skipAll) return;
    const id = await account();
    await assert.rejects(
      () => recordWorkout(id, { p_points: [{ lat: 0, lng: 0, t: 0 }] }),
      (error) => /between 2 and 200000 track points/.test(error.message),
    );
  });

  it("saves a route from a workout, with distance and elevation", async () => {
    if (skipAll) return;
    const id = await account();
    const saved = await recordWorkout(id);

    const route = await callResult("svj_save_route_from_activity", "authenticated", id, [
      saved.activity.id,
      "Riverside loop",
      false,
    ]);
    assert.equal(route.ok, true);
    assert.equal(route.route.name, "Riverside loop");
    assert.equal(route.route.activity_type, "running");
    assert.equal(route.route.favorite, false);
    assert.equal(route.route.source_activity_id, saved.activity.id);
    assert.ok(Number(route.route.distance_meters) > 1000, "route carries the measured distance");
    assert.ok(Number(route.route.elevation_gain_meters) > 0, "route carries elevation gain");
    assert.ok(typeof route.route.polyline === "string" && route.route.polyline.length > 0);
  });

  it("lists routes with distance, elevation and zero attempts", async () => {
    if (skipAll) return;
    const id = await account();
    const saved = await recordWorkout(id);
    await callResult("svj_save_route_from_activity", "authenticated", id, [
      saved.activity.id,
      "Morning loop",
    ]);

    const routes = await callResult("svj_list_routes", "authenticated", id);
    assert.equal(routes.length, 1);
    assert.equal(routes[0].name, "Morning loop");
    assert.ok(Number(routes[0].distance_meters) > 1000);
    assert.ok(Number(routes[0].elevation_gain_meters) > 0);
    assert.equal(routes[0].attempt_count, 0);
    assert.ok(routes[0].polyline.length > 0);
  });

  it("renames a route", async () => {
    if (skipAll) return;
    const id = await account();
    const saved = await recordWorkout(id);
    const created = await callResult("svj_save_route_from_activity", "authenticated", id, [
      saved.activity.id,
      "Old name",
    ]);

    const renamed = await callResult("svj_update_route", "authenticated", id, [
      created.route.id,
      "New name",
      null,
    ]);
    assert.equal(renamed.ok, true);
    assert.equal(renamed.route.name, "New name");
    // A rename must not silently clear the favourite flag.
    assert.equal(renamed.route.favorite, false);

    const routes = await callResult("svj_list_routes", "authenticated", id);
    assert.equal(routes[0].name, "New name");
  });

  it("favourites and un-favourites a route", async () => {
    if (skipAll) return;
    const id = await account();
    const saved = await recordWorkout(id);
    const created = await callResult("svj_save_route_from_activity", "authenticated", id, [
      saved.activity.id,
      "Hill repeats",
    ]);

    const favourited = await callResult("svj_update_route", "authenticated", id, [
      created.route.id,
      null,
      true,
    ]);
    assert.equal(favourited.route.favorite, true);
    assert.equal(favourited.route.name, "Hill repeats", "favouriting must not rename");

    const listing = await callResult("svj_list_routes", "authenticated", id);
    assert.equal(listing[0].favorite, true);

    const unfavourited = await callResult("svj_update_route", "authenticated", id, [
      created.route.id,
      null,
      false,
    ]);
    assert.equal(unfavourited.route.favorite, false);
  });

  it("re-saving the same route name updates it instead of duplicating", async () => {
    if (skipAll) return;
    const id = await account();
    const first = await recordWorkout(id);
    const second = await recordWorkout(id);

    const a = await callResult("svj_save_route_from_activity", "authenticated", id, [
      first.activity.id,
      "Loop",
    ]);
    const b = await callResult("svj_save_route_from_activity", "authenticated", id, [
      second.activity.id,
      "Loop",
      true,
    ]);
    assert.equal(a.route.id, b.route.id, "same name is the same saved route");
    assert.equal(b.route.favorite, true);

    const routes = await callResult("svj_list_routes", "authenticated", id);
    assert.equal(routes.length, 1);
  });

  it("favourites sort first in the route list", async () => {
    if (skipAll) return;
    const id = await account();
    const first = await recordWorkout(id);
    const second = await recordWorkout(id);
    await callResult("svj_save_route_from_activity", "authenticated", id, [
      first.activity.id,
      "AA plain",
    ]);
    const starred = await callResult("svj_save_route_from_activity", "authenticated", id, [
      second.activity.id,
      "ZZ starred",
    ]);
    await callResult("svj_update_route", "authenticated", id, [starred.route.id, null, true]);

    const routes = await callResult("svj_list_routes", "authenticated", id);
    assert.equal(routes[0].name, "ZZ starred");
  });

  it("deletes only the caller's own route", async () => {
    if (skipAll) return;
    const owner = await account();
    const other = await account();
    const saved = await recordWorkout(owner);
    const created = await callResult("svj_save_route_from_activity", "authenticated", owner, [
      saved.activity.id,
      "Mine",
    ]);

    // A different authenticated user cannot see or delete it.
    const otherList = await callResult("svj_list_routes", "authenticated", other);
    assert.equal(otherList.length, 0, "routes are owner-scoped by auth.uid()");
    const foreignDelete = await callResult("svj_delete_route", "authenticated", other, [
      created.route.id,
    ]);
    assert.equal(foreignDelete.deleted, false);

    const own = await callResult("svj_delete_route", "authenticated", owner, [created.route.id]);
    assert.equal(own.deleted, true);
    assert.equal((await callResult("svj_list_routes", "authenticated", owner)).length, 0);
  });

  it("refuses to rename another user's route", async () => {
    if (skipAll) return;
    const owner = await account();
    const other = await account();
    const saved = await recordWorkout(owner);
    const created = await callResult("svj_save_route_from_activity", "authenticated", owner, [
      saved.activity.id,
      "Owner only",
    ]);
    await assert.rejects(
      () =>
        call("svj_update_route", "authenticated", other, [
          created.route.id,
          "Hijacked",
          null,
        ]),
      (error) => /Route not found/.test(error.message),
    );
    const routes = await callResult("svj_list_routes", "authenticated", owner);
    assert.equal(routes[0].name, "Owner only");
  });

  it("validates route names", async () => {
    if (skipAll) return;
    const id = await account();
    const saved = await recordWorkout(id);
    await assert.rejects(
      () =>
        call("svj_save_route_from_activity", "authenticated", id, [saved.activity.id, "   "]),
      (error) => /route name between 1 and 80/.test(error.message),
    );
    await assert.rejects(
      () => call("svj_save_route_from_activity", "authenticated", id, [saved.activity.id, "x".repeat(81)]),
      (error) => /route name between 1 and 80/.test(error.message),
    );
  });

  it("refuses to save a route from another user's activity", async () => {
    if (skipAll) return;
    const owner = await account();
    const other = await account();
    const saved = await recordWorkout(owner);
    await assert.rejects(
      () =>
        call("svj_save_route_from_activity", "authenticated", other, [
          saved.activity.id,
          "Stolen",
        ]),
      (error) => /Activity not found/.test(error.message),
    );
  });

  it("denies the route library to anon", async () => {
    if (skipAll) return;
    for (const [name, args] of [
      ["svj_list_routes", []],
      ["svj_save_route_from_activity", [randomUUID(), "Nope"]],
      ["svj_update_route", [randomUUID(), "Nope"]],
      ["svj_delete_route", [randomUUID()]],
    ]) {
      await assert.rejects(
        () => call(name, "anon", null, args),
        (error) => /permission denied|does not exist/i.test(error.message),
        `${name} must not be executable by anon`,
      );
    }
  });

  it("requires authentication (no auth.uid()) for every route RPC", async () => {
    if (skipAll) return;
    // `authenticated` role but no JWT subject: identity must be refused.
    await assert.rejects(
      () => call("svj_list_routes", "authenticated", null, []),
      (error) => /Authentication required/.test(error.message),
    );
  });

  it("keeps routes private at the table level (RLS is forced)", async () => {
    if (skipAll) return;
    const forced = await execute(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'svj_routes'",
    );
    assert.equal(forced.rows[0].relrowsecurity, true);
    assert.equal(forced.rows[0].relforcerowsecurity, true);

    const grants = await execute(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'svj_routes' AND grantee = 'anon'`,
    );
    assert.equal(grants.rows.length, 0, "anon has no table privileges");
  });

  it("stores GPS tracks as indexed points, owner-scoped", async () => {
    if (skipAll) return;
    const owner = await account();
    const other = await account();
    const saved = await recordWorkout(owner);

    const points = await execute(
      "SELECT count(*)::int AS n FROM public.svj_activity_track_points WHERE activity_id = $1",
      [saved.activity.id],
    );
    assert.ok(points.rows[0].n >= 60, "the point track was persisted");

    // Another user reads nothing through the owner-facing track RPC.
    await assert.rejects(
      () => call("svj_get_activity_track", "authenticated", other, [saved.activity.id]),
      (error) => /Activity not found/.test(error.message),
    );

    const track = await callResult("svj_get_activity_track", "authenticated", owner, [
      saved.activity.id,
      200,
    ]);
    assert.equal(track.activityId, saved.activity.id);
    assert.ok(track.pointCount >= 60);
    assert.ok(track.points.length >= 2);
    assert.equal(track.points[0].seq, 0);
  });

  it("builds a heatmap from the owner's own GPS activity only", async () => {
    if (skipAll) return;
    const owner = await account();
    const other = await account();
    await recordWorkout(owner);

    const mine = await callResult("svj_get_activity_heatmap", "authenticated", owner, [
      null,
      null,
      4000,
    ]);
    assert.ok(Array.isArray(mine) && mine.length > 0, "owner sees heatmap cells");
    assert.ok(mine.every((cell) => Number.isFinite(cell.lat) && Number.isFinite(cell.lng)));

    const theirs = await callResult("svj_get_activity_heatmap", "authenticated", other, [
      null,
      null,
      4000,
    ]);
    assert.equal(theirs.length, 0, "heatmap is owner-scoped");
  });
});

describe("route library SQL surface", { concurrency: false }, () => {
  it("declares every route RPC with the expected grants", async () => {
    if (skipAll) return;
    const expected = [
      "svj_save_route_from_activity",
      "svj_update_route",
      "svj_delete_route",
      "svj_list_routes",
    ];
    const { rows } = await execute(
      `SELECT p.proname,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ok
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1)`,
      [expected],
    );
    assert.equal(rows.length, expected.length, "all four route RPCs exist");
    for (const row of rows) {
      assert.equal(row.auth_ok, true, `${row.proname} is executable by authenticated`);
      assert.equal(row.anon_ok, false, `${row.proname} is denied to anon`);
    }
  });

  it("never accepts a client-supplied user id", async () => {
    if (skipAll) return;
    const { rows } = await execute(
      `SELECT p.proname, pg_get_function_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (
           'svj_save_route_from_activity','svj_update_route','svj_delete_route','svj_list_routes'
         )`,
    );
    for (const row of rows) {
      assert.doesNotMatch(
        row.args,
        /p_user_id|user_id/,
        `${row.proname} must derive identity from auth.uid()`,
      );
    }
  });
});
