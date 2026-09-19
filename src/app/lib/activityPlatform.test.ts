import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deleteRoute,
  fetchRoutes,
  formatRouteElevation,
  formatRouteTime,
  gpsRecordFormat,
  heatmapSinceMs,
  isLiveShareExpired,
  liveShareUrl,
  normalizeActivityTrack,
  normalizeGpsRecords,
  normalizeHeatmap,
  normalizeLiveShare,
  normalizeRoute,
  normalizeSegment,
  plannedRouteSummary,
  routeToPoints,
  saveRouteFromActivity,
  updateRoute,
  type RpcClient,
} from "./activityPlatform";
import { encodePolyline } from "./gpsActivity";

/** Minimal injected RPC client: records calls, returns scripted responses. */
function fakeClient(responses: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      const scripted = responses[fn];
      if (!scripted) return { data: null, error: null };
      return { data: scripted.data ?? null, error: scripted.error ?? null };
    },
  } as unknown as RpcClient;
  return { client, calls };
}

const ROUTE_ROW = {
  id: "route-1",
  name: "Riverside loop",
  activity_type: "running",
  polyline: encodePolyline([
    { lat: 12.9716, lng: 77.5946 },
    { lat: 12.9726, lng: 77.5956 },
    { lat: 12.9736, lng: 77.5966 },
  ]),
  bounds: { minLat: 12.9716, minLng: 77.5946, maxLat: 12.9736, maxLng: 77.5966 },
  distance_meters: 2500,
  elevation_gain_meters: 42,
  source_activity_id: "activity-1",
  favorite: false,
  created_at: "2026-09-01T06:00:00.000Z",
  updated_at: "2026-09-02T06:00:00.000Z",
};

describe("routeToPoints", () => {
  it("decodes a stored route polyline into drawable points", () => {
    const points = routeToPoints(ROUTE_ROW.polyline);
    assert.equal(points.length, 3);
    assert.ok(Math.abs(points[0]!.lat - 12.9716) < 1e-4);
    assert.ok(Math.abs(points[2]!.lng - 77.5966) < 1e-4);
  });

  it("returns nothing for an empty polyline instead of throwing", () => {
    assert.deepEqual(routeToPoints(""), []);
  });
});

describe("normalizeRoute", () => {
  it("maps a server row into a SavedRoute", () => {
    const route = normalizeRoute(ROUTE_ROW);
    assert.ok(route != null);
    assert.equal(route!.id, "route-1");
    assert.equal(route!.name, "Riverside loop");
    assert.equal(route!.activityType, "running");
    assert.equal(route!.distanceMeters, 2500);
    assert.equal(route!.elevationGainMeters, 42);
    assert.equal(route!.favorite, false);
    assert.equal(route!.sourceActivityId, "activity-1");
    assert.ok(route!.bounds != null);
  });

  it("rejects a row without geometry", () => {
    assert.equal(normalizeRoute({ ...ROUTE_ROW, polyline: "" }), null);
    assert.equal(normalizeRoute({ ...ROUTE_ROW, polyline: null }), null);
  });

  it("rejects a row without an id or name", () => {
    assert.equal(normalizeRoute({ ...ROUTE_ROW, id: undefined }), null);
    assert.equal(normalizeRoute({ ...ROUTE_ROW, name: null }), null);
    assert.equal(normalizeRoute(null), null);
    assert.equal(normalizeRoute("nope"), null);
  });

  it("treats a missing distance/elevation as unknown, never as zero", () => {
    const route = normalizeRoute({
      ...ROUTE_ROW,
      distance_meters: null,
      elevation_gain_meters: null,
    });
    assert.equal(route!.distanceMeters, null);
    assert.equal(route!.elevationGainMeters, null);
  });
});

describe("route display helpers", () => {
  it("builds a distance + elevation summary", () => {
    assert.equal(
      plannedRouteSummary({ distanceMeters: 2500, elevationGainMeters: 42 }),
      "2.50 km · +42 m",
    );
  });

  it("omits elevation when it was not measured", () => {
    assert.equal(
      plannedRouteSummary({ distanceMeters: 900, elevationGainMeters: null }),
      "900 m",
    );
  });

  it("formats elevation and previous-attempt time with a dash fallback", () => {
    assert.equal(formatRouteElevation(42.4), "42 m");
    assert.equal(formatRouteElevation(null), "—");
    assert.equal(formatRouteTime(605), "10:05");
    assert.equal(formatRouteTime(null), "—");
  });
});

describe("fetchRoutes", () => {
  it("reads through the owner-scoped RPC and never sends a user id", async () => {
    const { client, calls } = fakeClient({ svj_list_routes: { data: [ROUTE_ROW] } });
    const result = await fetchRoutes(client);
    assert.equal(result.ok, true);
    assert.equal(result.routes.length, 1);
    assert.equal(calls[0]!.fn, "svj_list_routes");
    assert.equal(calls[0]!.args, undefined);
  });

  it("sorts favourites first, then most recently updated", async () => {
    const favourite = { ...ROUTE_ROW, id: "route-2", favorite: true, name: "Hill repeats" };
    const older = { ...ROUTE_ROW, id: "route-3", name: "Old loop", updated_at: "2026-08-01T00:00:00.000Z" };
    const { client } = fakeClient({ svj_list_routes: { data: [older, ROUTE_ROW, favourite] } });
    const result = await fetchRoutes(client);
    assert.deepEqual(
      result.routes.map((route) => route.id),
      ["route-2", "route-1", "route-3"],
    );
  });

  it("surfaces a server error and returns no routes", async () => {
    const { client } = fakeClient({
      svj_list_routes: { error: { message: "Authentication required" } },
    });
    const result = await fetchRoutes(client);
    assert.equal(result.ok, false);
    assert.equal(result.routes.length, 0);
    assert.match(result.error ?? "", /Authentication required/);
  });

  it("drops unreadable rows instead of failing the whole list", async () => {
    const { client } = fakeClient({ svj_list_routes: { data: [ROUTE_ROW, { id: "x" }, 7] } });
    const result = await fetchRoutes(client);
    assert.equal(result.routes.length, 1);
  });
});

describe("saveRouteFromActivity", () => {
  it("sends the activity id and name, never a user id", async () => {
    const { client, calls } = fakeClient({
      svj_save_route_from_activity: { data: { ok: true, route: ROUTE_ROW } },
    });
    const result = await saveRouteFromActivity(client, "activity-1", "Riverside loop", true);
    assert.equal(result.ok, true);
    assert.equal(result.route!.id, "route-1");
    assert.deepEqual(calls[0]!.args, {
      p_activity_id: "activity-1",
      p_name: "Riverside loop",
      p_favorite: true,
    });
  });

  it("reports a rejected save", async () => {
    const { client } = fakeClient({
      svj_save_route_from_activity: { data: { ok: false } },
    });
    const result = await saveRouteFromActivity(client, "activity-1", "Nope");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /rejected/i);
  });

  it("reports a transport error", async () => {
    const { client } = fakeClient({
      svj_save_route_from_activity: { error: { message: "Network error." } },
    });
    const result = await saveRouteFromActivity(client, "activity-1", "Nope");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Network error/);
  });
});

describe("updateRoute", () => {
  it("renames a route", async () => {
    const { client, calls } = fakeClient({
      svj_update_route: { data: { ok: true, route: { ...ROUTE_ROW, name: "New name" } } },
    });
    const result = await updateRoute(client, "route-1", { name: "New name" });
    assert.equal(result.ok, true);
    assert.equal(result.route!.name, "New name");
    assert.deepEqual(calls[0]!.args, {
      p_route_id: "route-1",
      p_name: "New name",
      p_favorite: null,
    });
  });

  it("favourites a route without touching its name", async () => {
    const { client, calls } = fakeClient({
      svj_update_route: { data: { ok: true, route: { ...ROUTE_ROW, favorite: true } } },
    });
    const result = await updateRoute(client, "route-1", { favorite: true });
    assert.equal(result.route!.favorite, true);
    assert.deepEqual(calls[0]!.args, {
      p_route_id: "route-1",
      p_name: null,
      p_favorite: true,
    });
  });

  it("surfaces an unreadable response", async () => {
    const { client } = fakeClient({ svj_update_route: { data: { ok: true } } });
    const result = await updateRoute(client, "route-1", { favorite: true });
    assert.equal(result.ok, false);
  });
});

describe("deleteRoute", () => {
  it("deletes by id only", async () => {
    const { client, calls } = fakeClient({ svj_delete_route: { data: { ok: true } } });
    const result = await deleteRoute(client, "route-1");
    assert.equal(result.ok, true);
    assert.deepEqual(calls[0]!.args, { p_route_id: "route-1" });
  });
});

describe("normalizeActivityTrack", () => {
  it("reads points and bounds", () => {
    const track = normalizeActivityTrack({
      activityId: "a1",
      activityType: "running",
      polyline: "abc",
      bounds: { minLat: 1, minLng: 2, maxLat: 3, maxLng: 4 },
      pointCount: 2,
      points: [
        { seq: 0, lat: 1, lng: 2, t: 0, ele: 10, moving: true },
        { seq: 1, lat: 1.1, lng: 2.1, t: 5000, ele: 12, moving: true },
      ],
    });
    assert.ok(track != null);
    assert.equal(track!.points.length, 2);
    assert.equal(track!.bounds!.maxLat, 3);
  });

  it("drops malformed points and survives an empty track", () => {
    const track = normalizeActivityTrack({
      activityId: "a1",
      points: [{ lat: "x", lng: 2, t: 0 }, { lat: 1, lng: 2, t: 0 }],
    });
    assert.equal(track!.points.length, 1);
  });

  it("requires an activity id", () => {
    assert.equal(normalizeActivityTrack({ points: [] }), null);
  });
});

describe("GPS records", () => {
  it("normalizes server records", () => {
    const records = normalizeGpsRecords([
      { recordType: "fastest_1km", activityType: "running", value: 250, activityId: "a1", achievedAt: "2026-09-01T00:00:00Z" },
    ]);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.value, 250);
  });

  it("drops zero and non-positive values so a missing record never renders", () => {
    assert.deepEqual(
      normalizeGpsRecords([
        { recordType: "fastest_5km", activityType: "running", value: 0, activityId: "a1" },
        { recordType: "fastest_5km", activityType: "running", value: -1, activityId: "a1" },
      ]),
      [],
    );
  });

  it("maps each record type to the right unit", () => {
    assert.equal(gpsRecordFormat("fastest_1km"), "duration");
    assert.equal(gpsRecordFormat("best_avg_pace"), "pace");
    assert.equal(gpsRecordFormat("best_avg_speed"), "speed");
    assert.equal(gpsRecordFormat("longest_run"), "distance");
  });
});

describe("personal heatmap", () => {
  it("resolves the range filters", () => {
    const now = Date.UTC(2026, 8, 19);
    assert.equal(heatmapSinceMs("all", now), null);
    assert.equal(heatmapSinceMs("year", now), Date.UTC(2026, 0, 1));
    assert.equal(heatmapSinceMs("90d", now), now - 90 * 24 * 60 * 60 * 1000);
  });

  it("drops unreadable cells", () => {
    assert.deepEqual(
      normalizeHeatmap([
        { lat: 1, lng: 2, weight: 3 },
        { lat: "x", lng: 2, weight: 3 },
        { lat: 1, lng: 2, weight: 0 },
      ]),
      [{ lat: 1, lng: 2, weight: 3 }],
    );
  });
});

describe("personal segments", () => {
  it("normalizes a segment with attempts", () => {
    const segment = normalizeSegment({
      id: "s1",
      name: "Bridge sprint",
      activityType: "running",
      startLat: 1,
      startLng: 2,
      endLat: 3,
      endLng: 4,
      toleranceMeters: 30,
      attemptCount: 2,
      bestDurationSeconds: 90,
      lastDurationSeconds: 95,
      improvementSeconds: 5,
      recentAttempts: [
        { activityId: "a1", durationSeconds: 90, startedAt: "2026-09-01T00:00:00Z" },
      ],
    });
    assert.ok(segment != null);
    assert.equal(segment!.bestDurationSeconds, 90);
    assert.equal(segment!.recentAttempts.length, 1);
  });

  it("never invents a best time when none exists", () => {
    const segment = normalizeSegment({ id: "s1", name: "New segment" });
    assert.equal(segment!.bestDurationSeconds, null);
    assert.equal(segment!.attemptCount, 0);
  });
});

describe("SVJ Live Share", () => {
  it("only reports an active share as active", () => {
    assert.equal(normalizeLiveShare({ active: false }).active, false);
    assert.equal(normalizeLiveShare(null).active, false);
    const share = normalizeLiveShare({ active: true, token: "t", expiresAt: "2026-09-19T10:00:00Z" });
    assert.equal(share.active, true);
    assert.equal(share.token, "t");
  });

  it("detects an expired share window", () => {
    const share = normalizeLiveShare({ active: true, expiresAt: "2026-09-19T10:00:00Z" });
    assert.equal(isLiveShareExpired(share, Date.parse("2026-09-19T09:59:00Z")), false);
    assert.equal(isLiveShareExpired(share, Date.parse("2026-09-19T10:01:00Z")), true);
  });

  it("builds a public link that carries no account identity", () => {
    const url = liveShareUrl("a".repeat(64), "https://svj.example");
    assert.equal(url, `https://svj.example/live/${"a".repeat(64)}`);
    assert.ok(!url.includes("@"));
  });
});
