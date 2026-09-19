import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildStravaAuthorizeUrl,
  DISCONNECTED_STRAVA_STATUS,
  mapStravaSportType,
  normalizeStravaActivities,
  normalizeStravaActivity,
  normalizeStravaStatus,
  normalizeStravaSync,
  stravaErrorMessage,
} from "../src/lib/strava";

const RUN = {
  id: 12345678901,
  name: " Morning Run ",
  sport_type: "Run",
  start_date: "2026-09-18T06:15:00Z",
  moving_time: 1800,
  elapsed_time: 2400,
  distance: 5123.456,
};

describe("Strava authorize URL", () => {
  it("requests only the read scopes and carries the server state", () => {
    const url = new URL(
      buildStravaAuthorizeUrl({
        clientId: "12345",
        redirectUri: "https://app.example/strava/callback",
        state: "state-abcdefghijklmnop",
      }),
    );
    assert.equal(url.origin + url.pathname, "https://www.strava.com/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "12345");
    assert.equal(url.searchParams.get("redirect_uri"), "https://app.example/strava/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "state-abcdefghijklmnop");
    // Never any write scope, and never a secret.
    assert.equal(url.searchParams.get("scope"), "read,activity:read_all");
    assert.equal(url.searchParams.get("client_secret"), null);
  });
});

describe("Strava sport mapping", () => {
  it("maps clear equivalents and defaults everything else to 'other'", () => {
    assert.equal(mapStravaSportType("Run"), "running");
    assert.equal(mapStravaSportType("TrailRun"), "running");
    assert.equal(mapStravaSportType("VirtualRide"), "cycling");
    assert.equal(mapStravaSportType("MountainBikeRide"), "cycling");
    assert.equal(mapStravaSportType("Walk"), "walking");
    assert.equal(mapStravaSportType("Hike"), "walking");
    assert.equal(mapStravaSportType("Soccer"), "football");
    assert.equal(mapStravaSportType("Yoga"), "yoga");
    assert.equal(mapStravaSportType("WeightTraining"), "strength");
    assert.equal(mapStravaSportType("HighIntensityIntervalTraining"), "hiit");
    // No optimistic credit for ambiguous or unknown sports.
    assert.equal(mapStravaSportType("Swim"), "other");
    assert.equal(mapStravaSportType("Kayaking"), "other");
    assert.equal(mapStravaSportType(undefined), "other");
    assert.equal(mapStravaSportType(null, 42), "other");
  });

  it("falls back to Strava's legacy `type` field when sport_type is absent", () => {
    assert.equal(mapStravaSportType(undefined, "Ride"), "cycling");
    assert.equal(mapStravaSportType("", "Run"), "running");
  });
});

describe("normalizeStravaActivity", () => {
  it("derives a server-shaped import record from a real payload", () => {
    const activity = normalizeStravaActivity(RUN);
    assert.ok(activity);
    assert.equal(activity.stravaId, "12345678901");
    assert.equal(activity.activityType, "running");
    assert.equal(activity.durationSeconds, 1800);
    assert.equal(activity.startedAt, "2026-09-18T06:15:00.000Z");
    assert.equal(activity.endedAt, "2026-09-18T06:45:00.000Z");
    assert.equal(activity.distanceMeters, 5123.46);
    assert.equal(activity.name, "Morning Run");
  });

  it("never fabricates steps or calories", () => {
    const activity = normalizeStravaActivity(RUN);
    assert.ok(activity);
    assert.equal(activity.stepCount, 0);
    assert.equal(activity.caloriesEstimate, null);
  });

  it("prefers moving_time but falls back to elapsed_time", () => {
    const moved = normalizeStravaActivity({ ...RUN, moving_time: 600 });
    assert.equal(moved?.durationSeconds, 600);
    const elapsedOnly = normalizeStravaActivity({
      ...RUN,
      moving_time: undefined,
      elapsed_time: 900,
    });
    assert.equal(elapsedOnly?.durationSeconds, 900);
  });

  it("treats a zero/absent duration or unparseable input as unusable", () => {
    assert.equal(normalizeStravaActivity({ ...RUN, moving_time: 0, elapsed_time: 0 }), null);
    assert.equal(normalizeStravaActivity({ ...RUN, start_date: "not-a-date" }), null);
    assert.equal(normalizeStravaActivity({ ...RUN, id: "abc" }), null);
    assert.equal(normalizeStravaActivity(null), null);
    assert.equal(normalizeStravaActivity("nope"), null);
    // A 24h+ record is rejected rather than clamped.
    assert.equal(normalizeStravaActivity({ ...RUN, moving_time: 90000 }), null);
  });

  it("accepts a string id and rejects out-of-range distance", () => {
    const byString = normalizeStravaActivity({ ...RUN, id: "9876543210" });
    assert.equal(byString?.stravaId, "9876543210");
    const huge = normalizeStravaActivity({ ...RUN, distance: 900000 });
    assert.equal(huge?.distanceMeters, 900000, "normalization keeps the value for the DB to validate");
  });
});

describe("normalizeStravaActivities", () => {
  const now = Date.parse("2026-09-19T00:00:00Z");

  it("drops future-dated, malformed and duplicate rows but keeps order", () => {
    const rows = normalizeStravaActivities(
      [
        RUN,
        { ...RUN, id: 22222222222, start_date: "2030-01-01T00:00:00Z" },
        { nonsense: true },
        { ...RUN, id: 33333333333, sport_type: "Ride", start_date: "2026-09-17T06:00:00Z" },
      ],
      now,
    );
    assert.deepEqual(
      rows.map((r) => r.stravaId),
      ["12345678901", "33333333333"],
    );
  });

  it("de-duplicates the same provider id within one page", () => {
    const rows = normalizeStravaActivities([RUN, RUN], now);
    assert.equal(rows.length, 1);
  });

  it("returns an empty list for a non-array payload", () => {
    assert.deepEqual(normalizeStravaActivities(null, now), []);
    assert.deepEqual(normalizeStravaActivities({ activities: [] }, now), []);
  });

  it("honours the page limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...RUN, id: 40000000000 + i }));
    assert.equal(normalizeStravaActivities(many, now, 3).length, 3);
  });
});

describe("strava status + sync parsing", () => {
  it("reads a disconnected account", () => {
    assert.deepEqual(normalizeStravaStatus(null), DISCONNECTED_STRAVA_STATUS);
    assert.deepEqual(normalizeStravaStatus({ connected: false }), DISCONNECTED_STRAVA_STATUS);
  });

  it("reads a connected account without any token material", () => {
    const status = normalizeStravaStatus({
      connected: true,
      athleteName: "Ada Runner",
      connectedAt: "2026-09-18T10:00:00Z",
      lastSyncedAt: "2026-09-19T09:00:00Z",
      lastSyncError: null,
      importedActivities: 12,
    });
    assert.equal(status.connected, true);
    assert.equal(status.athleteName, "Ada Runner");
    assert.equal(status.importedActivities, 12);
    assert.equal(status.lastSyncError, null);
  });

  it("keeps the imported count while disconnected", () => {
    const status = normalizeStravaStatus({ connected: false, importedActivities: 5 });
    assert.equal(status.connected, false);
    assert.equal(status.importedActivities, 5);
    assert.equal(status.athleteName, null);
  });

  it("sanitizes a sync summary and rejects a failed envelope", () => {
    assert.deepEqual(normalizeStravaSync({ ok: true, imported: 2, duplicate: 1, skipped: 0, xpAwarded: 45 }), {
      ok: true,
      imported: 2,
      duplicate: 1,
      skipped: 0,
      xpAwarded: 45,
    });
    assert.equal(normalizeStravaSync({ ok: false }), null);
    assert.equal(normalizeStravaSync(null), null);
  });
});

describe("stravaErrorMessage", () => {
  it("maps known codes and never echoes the raw code", () => {
    assert.match(stravaErrorMessage("SVJ_STRAVA_ALREADY_LINKED"), /already connected/i);
    assert.match(stravaErrorMessage("SVJ_STRAVA_STATE_INVALID"), /expired/i);
    assert.match(stravaErrorMessage("STRAVA_NOT_CONFIGURED"), /not configured/i);
    assert.doesNotMatch(stravaErrorMessage("raw database failure"), /raw database failure/);
    assert.doesNotMatch(stravaErrorMessage(undefined), /undefined/);
  });
});
