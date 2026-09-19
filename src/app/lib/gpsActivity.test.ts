import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acceptPoint,
  appendPoint,
  classifyGpsQuality,
  computeSplits,
  createAutoPause,
  decodePolyline,
  encodePolyline,
  formatClock,
  formatDistance,
  formatPace,
  formatSpeed,
  haversineMeters,
  movingSeconds,
  pathDistanceMeters,
  simplifyTrack,
  summarizeTrack,
  trackBounds,
  validateWorkoutForSave,
  canTransition,
  type TrackPoint,
} from "./gpsActivity";

/** ~111.32 m per 0.001 degrees of latitude at the equator. */
const STEP_DEG = 0.001;

function straightTrack(count: number, stepMs = 1000, deg = STEP_DEG): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: i * deg,
    lng: 0,
    t: i * stepMs,
    moving: true,
  }));
}

describe("haversineMeters", () => {
  it("is zero for identical coordinates", () => {
    assert.equal(haversineMeters(12.5, 77.5, 12.5, 77.5), 0);
  });

  it("measures a known equatorial degree", () => {
    const d = haversineMeters(0, 0, 0.001, 0);
    assert.ok(Math.abs(d - 111.19) < 1, `expected ~111.19 m, got ${d}`);
  });

  it("is symmetric", () => {
    const a = haversineMeters(12.9, 77.6, 13.1, 77.7);
    const b = haversineMeters(13.1, 77.7, 12.9, 77.6);
    assert.ok(Math.abs(a - b) < 1e-6);
  });
});

describe("polyline codec", () => {
  it("round-trips coordinates at 5 digit precision", () => {
    const points = [
      { lat: 12.971598, lng: 77.594562 },
      { lat: 12.9721, lng: 77.596 },
      { lat: 12.9699, lng: 77.5901 },
    ];
    const decoded = decodePolyline(encodePolyline(points));
    assert.equal(decoded.length, points.length);
    for (let i = 0; i < points.length; i += 1) {
      assert.ok(Math.abs(decoded[i]!.lat - points[i]!.lat) < 1e-4);
      assert.ok(Math.abs(decoded[i]!.lng - points[i]!.lng) < 1e-4);
    }
  });

  it("returns an empty list for an empty string", () => {
    assert.deepEqual(decodePolyline(""), []);
  });
});

describe("simplifyTrack", () => {
  it("keeps endpoints and drops collinear interior points", () => {
    const simplified = simplifyTrack(straightTrack(20), 1);
    assert.equal(simplified.length, 2);
    assert.equal(simplified[0]!.t, 0);
    assert.equal(simplified[1]!.t, 19_000);
  });

  it("preserves a genuine detour", () => {
    const track = straightTrack(10);
    track[5] = { lat: 5 * STEP_DEG + 0.01, lng: 0, t: 5000, moving: true };
    const simplified = simplifyTrack(track, 1);
    assert.ok(simplified.length >= 3);
  });
});

describe("classifyGpsQuality", () => {
  it("maps accuracy to the four display states", () => {
    assert.equal(classifyGpsQuality(null), "searching");
    assert.equal(classifyGpsQuality(0), "searching");
    assert.equal(classifyGpsQuality(120), "weak");
    assert.equal(classifyGpsQuality(35), "good");
    assert.equal(classifyGpsQuality(8), "excellent");
  });
});

describe("acceptPoint", () => {
  const origin: TrackPoint = { lat: 12.9, lng: 77.5, t: 1000, accuracy: 10, moving: true };

  it("accepts the first point unconditionally", () => {
    assert.equal(acceptPoint(null, origin).accept, true);
  });

  it("rejects out-of-range coordinates", () => {
    assert.equal(acceptPoint(origin, { lat: 200, lng: 0, t: 3000 }).accept, false);
    assert.equal(acceptPoint(origin, { lat: 12.9, lng: 400, t: 3000 }).accept, false);
    assert.equal(acceptPoint(origin, { lat: NaN, lng: 0, t: 3000 }).accept, false);
  });

  it("rejects non-monotonic time", () => {
    const decision = acceptPoint(origin, { lat: 12.9, lng: 77.5, t: 500 });
    assert.equal(decision.accept, false);
    assert.equal(decision.reason, "non_monotonic_time");
  });

  it("rejects duplicate and too-soon samples", () => {
    assert.equal(acceptPoint(origin, { lat: 12.9, lng: 77.5, t: 1000 }).reason, "duplicate_time");
    assert.equal(acceptPoint(origin, { lat: 12.9, lng: 77.5, t: 1200 }).reason, "too_soon");
  });

  it("rejects poor accuracy", () => {
    const decision = acceptPoint(origin, { lat: 12.9, lng: 77.5, t: 5000, accuracy: 200 });
    assert.equal(decision.accept, false);
    assert.equal(decision.reason, "accuracy");
  });

  it("rejects an impossible GPS jump", () => {
    // ~1.1 km in 2 seconds is ~550 m/s: a spike, not a sprint.
    const decision = acceptPoint(origin, { lat: 12.91, lng: 77.5, t: 3000 });
    assert.equal(decision.accept, false);
    assert.equal(decision.reason, "impossible_jump");
  });

  it("accepts a realistic running sample", () => {
    const decision = acceptPoint(origin, { lat: 12.9002, lng: 77.5, t: 5000, accuracy: 8 });
    assert.equal(decision.accept, true);
  });
});

describe("appendPoint", () => {
  it("never mutates the input track", () => {
    const original: TrackPoint[] = [{ lat: 0, lng: 0, t: 0, moving: true }];
    const frozen = [...original];
    const { track } = appendPoint(original, { lat: 0.0002, lng: 0, t: 5000, moving: true });
    assert.equal(original.length, frozen.length);
    assert.equal(track.length, 2);
  });

  it("leaves the track unchanged on a rejected sample", () => {
    const track: TrackPoint[] = [{ lat: 0, lng: 0, t: 0, moving: true }];
    const result = appendPoint(track, { lat: 5, lng: 0, t: 1000, moving: true });
    assert.equal(result.decision.accept, false);
    assert.equal(result.track.length, 1);
  });
});

describe("auto pause", () => {
  it("pauses only after a sustained stop", () => {
    const detector = createAutoPause({
      stopSpeedMps: 0.5,
      resumeSpeedMps: 1,
      stopDelaySeconds: 10,
      resumeDelaySeconds: 3,
    });
    assert.equal(detector.update(0, 5), false);
    assert.equal(detector.paused, false);
    assert.equal(detector.update(0, 5), true);
    assert.equal(detector.paused, true);
  });

  it("does not flap between pause and resume", () => {
    const detector = createAutoPause({
      stopSpeedMps: 0.5,
      resumeSpeedMps: 1.5,
      stopDelaySeconds: 10,
      resumeDelaySeconds: 5,
    });
    for (let i = 0; i < 4; i += 1) detector.update(0, 2);
    assert.equal(detector.paused, false, "8 s of stillness should not pause yet");

    detector.update(0, 2);
    assert.equal(detector.paused, true, "10 s of stillness pauses");

    // A single glitchy fast sample must not resume.
    assert.equal(detector.update(3, 1), false);
    assert.equal(detector.paused, true, "resume needs sustained movement");
    assert.equal(detector.update(0.1, 1), false);
    assert.equal(detector.paused, true);
  });

  it("resumes after sustained movement", () => {
    const detector = createAutoPause({ stopDelaySeconds: 5, resumeDelaySeconds: 3 });
    detector.update(0, 5);
    assert.equal(detector.paused, true);
    detector.update(2, 1);
    detector.update(2, 1);
    assert.equal(detector.update(2, 1), true);
    assert.equal(detector.paused, false);
  });
});

describe("path distance and moving time", () => {
  it("excludes paused intervals from both", () => {
    const track: TrackPoint[] = [
      { lat: 0, lng: 0, t: 0, moving: true },
      { lat: 0.001, lng: 0, t: 10_000, moving: true },
      { lat: 0.001, lng: 0, t: 40_000, moving: false },
      { lat: 0.002, lng: 0, t: 50_000, moving: true },
    ];
    const distance = pathDistanceMeters(track);
    const moving = movingSeconds(track);
    // Only the pre-pause leg counts; a paused interval contributes neither
    // distance nor movement time.
    assert.ok(Math.abs(distance - 111.2) < 2, `expected ~111 m, got ${distance}`);
    assert.equal(moving, 10);
  });
});

describe("computeSplits", () => {
  it("produces one split per completed kilometre", () => {
    // 0.0009 deg per second over ~22 s ≈ 100 m/s? No: keep it realistic —
    // 25 points of ~100 m each at 30 s per point ≈ 2.5 km in 12.5 min.
    const points: TrackPoint[] = Array.from({ length: 26 }, (_, i) => ({
      lat: i * 0.0009,
      lng: 0,
      t: i * 30_000,
      moving: true,
    }));
    const { splits, distanceMeters } = computeSplits(points, 1000);
    assert.ok(distanceMeters > 2000, `expected > 2 km, got ${distanceMeters}`);
    const complete = splits.filter((s) => !s.partial);
    assert.equal(complete.length, 2);
    assert.equal(complete[0]!.index, 1);
    assert.ok(complete[0]!.durationSeconds > 0);
  });

  it("marks the trailing remainder as partial and never as a record", () => {
    const points: TrackPoint[] = Array.from({ length: 12 }, (_, i) => ({
      lat: i * 0.0009,
      lng: 0,
      t: i * 30_000,
      moving: true,
    }));
    const { splits } = computeSplits(points, 1000);
    const partial = splits.filter((s) => s.partial);
    assert.equal(partial.length, 1);
    assert.equal(partial[0]!.index, splits.length);
  });

  it("returns nothing for a track shorter than one split", () => {
    const { splits } = computeSplits(straightTrack(3, 1000, 0.0001), 1000);
    assert.equal(splits.length, 0);
  });
});

describe("summarizeTrack", () => {
  it("derives pace, speed and elevation only from real values", () => {
    const points: TrackPoint[] = Array.from({ length: 11 }, (_, i) => ({
      lat: i * 0.0009,
      lng: 0,
      t: i * 30_000,
      ele: i * 10,
      moving: true,
    }));
    const summary = summarizeTrack(points);
    assert.ok(summary.distanceMeters > 900);
    assert.equal(summary.durationSeconds, 300);
    assert.ok(summary.elevationGainMeters != null && summary.elevationGainMeters > 90);
    assert.ok(summary.avgPaceSecondsPerKm != null);
    assert.ok(summary.avgSpeedMps != null);
    assert.equal(summary.avgHeartRate, null, "no HR samples means null, never a guess");
  });

  it("reports null elevation when no point carries elevation", () => {
    const summary = summarizeTrack(straightTrack(5));
    assert.equal(summary.elevationGainMeters, null);
    assert.equal(summary.maxHeartRate, null);
  });

  it("computes HR average and max from samples only", () => {
    const points = straightTrack(4).map((p, i) => ({ ...p, hr: 120 + i * 10 }));
    const summary = summarizeTrack(points);
    assert.equal(summary.avgHeartRate, 135);
    assert.equal(summary.maxHeartRate, 150);
  });
});

describe("trackBounds", () => {
  it("is null for an empty track", () => {
    assert.equal(trackBounds([]), null);
  });

  it("covers every point", () => {
    const bounds = trackBounds([
      { lat: 1, lng: 2, t: 0 },
      { lat: -1, lng: 5, t: 1 },
    ]);
    assert.deepEqual(bounds, { minLat: -1, minLng: 2, maxLat: 1, maxLng: 5 });
  });
});

describe("formatting", () => {
  it("formats distance in km and mi", () => {
    assert.equal(formatDistance(0), "0 m");
    assert.equal(formatDistance(950), "950 m");
    assert.equal(formatDistance(2500), "2.50 km");
    assert.equal(formatDistance(1609.344, "mi"), "1.00 mi");
    assert.equal(formatDistance(null), "—");
  });

  it("formats pace and speed", () => {
    assert.equal(formatPace(300), "5:00 /km");
    assert.equal(formatPace(null), "—");
    assert.equal(formatSpeed(2.5), "9.0 km/h");
    assert.equal(formatSpeed(0), "—");
  });

  it("formats the elapsed clock", () => {
    assert.equal(formatClock(0), "0:00");
    assert.equal(formatClock(65), "1:05");
    assert.equal(formatClock(3725), "1:02:05");
  });
});

describe("validateWorkoutForSave", () => {
  it("rejects an empty track", () => {
    assert.match(
      validateWorkoutForSave([], { distanceMeters: 0, durationSeconds: 100 }, "running") ?? "",
      /no GPS track/i,
    );
  });

  it("rejects a workout that is too short", () => {
    const points = straightTrack(3);
    assert.match(
      validateWorkoutForSave(points, { distanceMeters: 200, durationSeconds: 3 }, "running") ?? "",
      /too short/i,
    );
  });

  it("accepts a genuine short run", () => {
    const points = straightTrack(5);
    assert.equal(
      validateWorkoutForSave(points, { distanceMeters: 400, durationSeconds: 60 }, "running"),
      null,
    );
  });
});

describe("workout state machine", () => {
  it("allows the real lifecycle", () => {
    assert.equal(canTransition("idle", "recording"), true);
    assert.equal(canTransition("recording", "paused"), true);
    assert.equal(canTransition("paused", "recording"), true);
    assert.equal(canTransition("recording", "stopping"), true);
    assert.equal(canTransition("stopping", "saved"), true);
  });

  it("refuses impossible transitions", () => {
    assert.equal(canTransition("idle", "paused"), false);
    assert.equal(canTransition("saved", "recording"), false);
    assert.equal(canTransition("discarded", "recording"), false);
  });
});
