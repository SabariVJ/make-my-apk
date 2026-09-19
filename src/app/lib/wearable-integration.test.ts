import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currentPaceSecondsPerKm } from "../views/WorkoutRecorder";
import {
  createTileViewport,
  createTileViewportAtZoom,
} from "../components/ActivityMap";
import { GpsWorkoutRecorder, createMemoryStorage } from "../lib/gpsRecorder";
import type { TrackPoint } from "../lib/gpsActivity";

/** A point 1 second after `previous`, `meters` north of it. */
function nextPoint(previous: TrackPoint, meters: number, accuracy = 5): TrackPoint {
  const dLat = meters / 111_320;
  return {
    ...previous,
    lat: previous.lat + dLat,
    t: previous.t + 1000,
    accuracy,
  };
}

const START: TrackPoint = { lat: 12.9716, lng: 77.5946, t: 0, ele: null, accuracy: 5, hr: null, cad: null, moving: true };

describe("stabilized current pace", () => {
  it("returns null for a short, jittery early session (the 2:34/km bug)", () => {
    // ~7 s of samples: 49 m from a first-fix jump. Far below both the 20 s
    // minimum window and the 40 m plausible-displacement floor.
    const points: TrackPoint[] = [START];
    let cursor = START;
    for (let i = 0; i < 6; i += 1) {
      cursor = nextPoint(cursor, 8);
      points.push(cursor);
    }
    assert.equal(currentPaceSecondsPerKm(points), null);
  });

  it("returns null until the minimum elapsed window exists", () => {
    const points: TrackPoint[] = [START];
    let cursor = START;
    for (let i = 0; i < 15; i += 1) {
      cursor = nextPoint(cursor, 4);
      points.push(cursor);
    }
    // 15 s elapsed, 60 m moved: distance is fine, window is not.
    assert.equal(currentPaceSecondsPerKm(points), null);
  });

  it("shows pace only after a real window with real displacement", () => {
    const points: TrackPoint[] = [START];
    let cursor = START;
    // 30 samples at 3.5 m/s ≈ 105 m in 30 s.
    for (let i = 0; i < 30; i += 1) {
      cursor = nextPoint(cursor, 3.5);
      points.push(cursor);
    }
    const pace = currentPaceSecondsPerKm(points);
    assert.ok(pace != null);
    // ~3.5 m/s → ~286 s/km, allow rounding.
    assert.ok(pace > 270 && pace < 300, `pace ${pace} outside plausible range`);
  });

  it("excludes low-accuracy segments from the distance", () => {
    const points: TrackPoint[] = [START];
    let cursor = START;
    for (let i = 0; i < 30; i += 1) {
      // Every segment anchored to a ±60 m fix is dropped.
      cursor = nextPoint(cursor, 3.5, 60);
      points.push(cursor);
    }
    assert.equal(currentPaceSecondsPerKm(points), null);
  });

  it("respects a custom window", () => {
    const points: TrackPoint[] = [START];
    let cursor = START;
    for (let i = 0; i < 30; i += 1) {
      cursor = nextPoint(cursor, 3.5);
      points.push(cursor);
    }
    assert.equal(currentPaceSecondsPerKm(points, 5), null); // 5 s window → too short
  });
});

describe("map viewport touch interaction", () => {
  const points = [
    { lat: 12.9716, lng: 77.5946 },
    { lat: 12.9800, lng: 77.6050 },
  ];

  it("creates a zoom-locked viewport with a center", () => {
    const fit = createTileViewport(points, 400, 220);
    assert.ok(fit.zoom >= 3 && fit.zoom <= 19);
    assert.ok(typeof fit.centerLat === "number" && typeof fit.centerLng === "number");
  });

  it("renders a user pinch-zoom viewport around the same center", () => {
    const fit = createTileViewport(points, 400, 220);
    const zoomed = createTileViewportAtZoom(fit.centerLat, fit.centerLng, Math.min(19, fit.zoom + 2), 400, 220);
    assert.equal(zoomed.zoom, Math.min(19, fit.zoom + 2));
    const before = fit.project(points[0]!.lat, points[0]!.lng);
    const after = zoomed.project(points[0]!.lat, points[0]!.lng);
    assert.ok(Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1);
  });

  it("applies a user pan offset in world pixels", () => {
    const unpanned = createTileViewportAtZoom(12.9716, 77.5946, 16, 400, 220);
    const panned = createTileViewportAtZoom(12.9716, 77.5946, 16, 400, 220, -80, -40);
    const a = unpanned.project(12.9716, 77.5946);
    const b = panned.project(12.9716, 77.5946);
    // Dragging left (−80 px) pans the map content left: world origin shifts
    // so the point appears 80 px further left on screen.
    assert.ok(Math.abs(a.x - b.x - 80) <= 1);
    assert.ok(Math.abs(a.y - b.y - 40) <= 1);
  });

  it("keeps tile coordinates consistent at extreme zooms", () => {
    for (const zoom of [3, 19]) {
      const viewport = createTileViewportAtZoom(12.9716, 77.5946, zoom, 400, 220);
      for (const tile of viewport.tiles) {
        assert.ok(tile.x >= 0 && tile.x < 2 ** zoom);
        assert.ok(tile.y >= 0 && tile.y < 2 ** zoom);
      }
    }
  });
});

describe("recorder heart-rate ingestion", () => {
  function makeRecorder(now: () => number): GpsWorkoutRecorder {
    return new GpsWorkoutRecorder({
      storage: createMemoryStorage(),
      now,
      genId: (() => "test-activity-id") as () => string,
    });
  }

  it("attributes a live BLE reading to the newest GPS point", async () => {
    let time = 1_000_000;
    const recorder = makeRecorder(() => time);
    recorder.setLocationAdapter(null);
    await recorder.start("running");
    time += 5_000;
    assert.equal(recorder.ingest({ lat: 12.9716, lng: 77.5946, accuracy: 5, timestampMs: time }), true);
    time += 1_000;
    assert.equal(recorder.ingestHeartRate(143, time), true);
    const points = recorder.session?.points ?? [];
    assert.equal(points[points.length - 1]?.hr, 143);
    await recorder.discard();
  });

  it("rejects implausible readings without corrupting the track", async () => {
    let time = 1_000_000;
    const recorder = makeRecorder(() => time);
    recorder.setLocationAdapter(null);
    await recorder.start("running");
    time += 5_000;
    recorder.ingest({ lat: 12.9716, lng: 77.5946, accuracy: 5, timestampMs: time });
    const before = recorder.session?.points.length ?? 0;
    assert.equal(recorder.ingestHeartRate(0, time + 1_000), false);
    assert.equal(recorder.ingestHeartRate(999, time + 1_000), false);
    assert.equal(recorder.session?.points.length, before);
    await recorder.discard();
  });

  it("stores a reading with no GPS point yet for later attribution", async () => {
    let time = 1_000_000;
    const recorder = makeRecorder(() => time);
    recorder.setLocationAdapter(null);
    await recorder.start("running");
    time += 1_000;
    // No GPS point exists yet; the reading is retained (never lost).
    assert.equal(recorder.ingestHeartRate(120, time), true);
    time += 3_000;
    recorder.ingest({ lat: 12.9716, lng: 77.5946, accuracy: 5, timestampMs: time });
    const points = recorder.session?.points ?? [];
    assert.equal(points.length, 1);
    await recorder.discard();
  });
});
