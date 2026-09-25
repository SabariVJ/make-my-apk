import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GpsWorkoutRecorder,
  RECORDER_QUEUE_KEY,
  RECORDER_SESSION_KEY,
  buildClientSessionId,
  createMemoryStorage,
  flushOfflineQueue,
  readQueue,
  writeQueue,
  type LocationAdapter,
  type RawLocationSample,
  type SessionStorage,
  type WorkoutSession,
} from "./gpsRecorder";

const T0 = 1_760_000_000_000;

interface Harness {
  recorder: GpsWorkoutRecorder;
  storage: SessionStorage;
  setNow: (ms: number) => void;
  emit: (sample: Partial<RawLocationSample> & { lat: number; lng: number }) => void;
  stopCalls: () => number;
  startedCalls: () => number;
}

function harness(options: { autoPauseEnabled?: boolean; withLocation?: boolean } = {}): Harness {
  const storage = createMemoryStorage();
  let nowMs = T0;
  let stopCount = 0;
  let startCount = 0;
  let handler: ((sample: RawLocationSample) => void) | null = null;

  const location: LocationAdapter = {
    async start(onSample) {
      startCount += 1;
      handler = onSample;
    },
    async stop() {
      stopCount += 1;
      handler = null;
    },
  };

  const recorder = new GpsWorkoutRecorder({
    storage,
    now: () => nowMs,
    genId: () => "11111111-2222-4333-8444-555555555555",
    location: options.withLocation === false ? null : location,
    autoPauseEnabled: options.autoPauseEnabled ?? false,
    devicePlatform: "android",
  });

  return {
    recorder,
    storage,
    setNow: (ms) => {
      nowMs = ms;
    },
    emit: (sample) => {
      handler?.({
        accuracy: 8,
        timestampMs: nowMs,
        ...sample,
      });
    },
    stopCalls: () => stopCount,
    startedCalls: () => startCount,
  };
}

/** Walk north at ~1.1 m per 10 ms step, which is ~110 m/s: use 1000 ms. */
const LEG_DEG = 0.0001; // ~11.1 m

describe("buildClientSessionId", () => {
  it("is stable for the same activity id", () => {
    assert.equal(
      buildClientSessionId("11111111-2222-4333-8444-555555555555"),
      buildClientSessionId("11111111-2222-4333-8444-555555555555"),
    );
  });

  it("fits the server's 8..100 character window", () => {
    const id = buildClientSessionId("11111111-2222-4333-8444-555555555555");
    assert.ok(id.length >= 8 && id.length <= 100, `bad length ${id.length}`);
  });
});

describe("workout lifecycle", () => {
  it("creates a stable activity identity at start", async () => {
    const h = harness();
    const session = await h.recorder.start("running");
    assert.equal(session.state, "recording");
    assert.equal(session.activityType, "running");
    assert.equal(session.devicePlatform, "android");
    assert.equal(session.gpsQuality, "searching");
    assert.equal(session.points.length, 0);
    assert.equal(h.startedCalls(), 1);
  });

  it("moves through pause and resume", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.recorder.pause();
    assert.equal(h.recorder.current?.state, "paused");
    h.recorder.resume();
    assert.equal(h.recorder.current?.state, "recording");
  });

  it("records points and derives a live summary", async () => {
    const h = harness();
    await h.recorder.start("running");
    for (let i = 0; i < 6; i += 1) {
      h.setNow(T0 + i * 1000);
      h.emit({ lat: i * LEG_DEG, lng: 0 });
    }
    const summary = h.recorder.summary();
    assert.equal(h.recorder.current?.points.length, 6);
    assert.ok(summary != null && summary.distanceMeters > 50);
    assert.equal(h.recorder.current?.gpsQuality, "excellent");
  });

  it("stops collecting location when the workout finishes", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 60_000);
    const finished = await h.recorder.finish();
    assert.equal(finished?.state, "stopping");
    assert.equal(finished?.endedAtMs, T0 + 60_000);
    assert.equal(finished?.durationSeconds, 60);
    assert.equal(h.stopCalls(), 1);
  });

  it("is idempotent: finishing twice keeps the first end time", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 60_000);
    await h.recorder.finish();
    h.setNow(T0 + 600_000);
    const second = await h.recorder.finish();
    assert.equal(second?.endedAtMs, T0 + 60_000);
  });

  it("discard throws the workout away without queueing anything", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 1000);
    h.emit({ lat: 0, lng: 0 });
    await h.recorder.discard();
    assert.equal(h.recorder.current, null);
    assert.equal(h.storage.read(RECORDER_SESSION_KEY), null);
    assert.deepEqual(readQueue(h.storage), []);
  });
});

describe("GPS noise rejection while recording", () => {
  it("drops a poor-accuracy sample but keeps recording", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 1000);
    h.emit({ lat: 0, lng: 0 });
    h.setNow(T0 + 2000);
    h.emit({ lat: 0.0001, lng: 0, accuracy: 400 });
    assert.equal(h.recorder.current?.points.length, 1, "noisy point must not join the track");
    assert.equal(h.recorder.current?.gpsQuality, "weak", "quality is still surfaced");

    h.setNow(T0 + 3000);
    h.emit({ lat: 0.0002, lng: 0 });
    assert.equal(h.recorder.current?.points.length, 2);
  });

  it("drops an impossible jump", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 1000);
    h.emit({ lat: 0, lng: 0 });
    h.setNow(T0 + 2000);
    h.emit({ lat: 0.02, lng: 0 }); // ~2.2 km in 1 s
    assert.equal(h.recorder.current?.points.length, 1);
  });

  it("ignores samples while paused", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 1000);
    h.emit({ lat: 0, lng: 0 });
    h.recorder.pause();
    h.setNow(T0 + 2000);
    h.emit({ lat: 0.0001, lng: 0 });
    assert.equal(h.recorder.current?.points.length, 1);
    h.recorder.resume();
    h.setNow(T0 + 3000);
    h.emit({ lat: 0.0002, lng: 0 });
    assert.equal(h.recorder.current?.points.length, 2);
  });
});

describe("auto pause", () => {
  it("marks stationary points as not moving", async () => {
    const h = harness({ autoPauseEnabled: true });
    await h.recorder.start("walking");

    // 1 s apart but not moving: the detector needs 12 s of stillness.
    for (let i = 0; i < 15; i += 1) {
      h.setNow(T0 + i * 1000);
      h.emit({ lat: 0, lng: 0 });
    }
    assert.equal(h.recorder.current?.autoPaused, true);
    const last = h.recorder.current?.points.at(-1);
    assert.equal(last?.moving, false);
  });

  it("auto-resumes after sustained real movement", async () => {
    const h = harness({ autoPauseEnabled: true });
    await h.recorder.start("walking");

    for (let i = 0; i < 15; i += 1) {
      h.setNow(T0 + i * 1000);
      h.emit({ lat: 0, lng: 0 });
    }
    assert.equal(h.recorder.current?.autoPaused, true);

    // ~1.1 m each second is above the 1.0 m/s resume threshold. The detector
    // must see raw displacement even though the last paused points are marked
    // moving=false.
    for (let i = 1; i <= 5; i += 1) {
      h.setNow(T0 + (14 + i) * 1000);
      h.emit({ lat: i * 0.00001, lng: 0 });
    }

    assert.equal(h.recorder.current?.autoPaused, false);
    assert.equal(h.recorder.current?.points.at(-1)?.moving, true);
  });
});

describe("offline recovery", () => {
  it("restores an unfinished workout as PAUSED", async () => {
    const storage = createMemoryStorage();
    let nowMs = T0;
    const recorder = new GpsWorkoutRecorder({ storage, now: () => nowMs, autoPauseEnabled: false });
    await recorder.start("cycling");
    // Realistic 5 s sampling: each accepted point refreshes the durable copy.
    for (let i = 0; i < 4; i += 1) {
      nowMs = T0 + i * 5000;
      recorder.ingest({ lat: i * LEG_DEG, lng: 0, timestampMs: nowMs, accuracy: 6 });
    }

    // Simulate a process restart: a brand new recorder over the same storage.
    const revived = new GpsWorkoutRecorder({ storage, now: () => nowMs, autoPauseEnabled: false });
    const recovered = revived.recover();
    assert.ok(recovered != null);
    assert.equal(recovered!.state, "paused", "recovery must never silently resume tracking");
    assert.equal(recovered!.points.length, 4);
    assert.equal(recovered!.clientSessionId, buildClientSessionId(recorder.current!.activityId));
  });

  it("returns null when there is nothing to recover", () => {
    const recorder = new GpsWorkoutRecorder({ storage: createMemoryStorage() });
    assert.equal(recorder.recover(), null);
  });

  it("does not recover an already-saved workout", async () => {
    const storage = createMemoryStorage();
    const recorder = new GpsWorkoutRecorder({ storage, now: () => T0 });
    await recorder.start("running");
    recorder.markSaved();
    const fresh = new GpsWorkoutRecorder({ storage, now: () => T0 });
    assert.equal(fresh.recover(), null);
  });
});

describe("offline sync queue", () => {
  function finishedSession(id: string): WorkoutSession {
    return {
      activityId: `activity-${id}`,
      clientSessionId: `svj-gps-${id}`,
      activityType: "running",
      state: "stopping",
      startedAtMs: T0,
      endedAtMs: T0 + 600_000,
      durationSeconds: 600,
      pausedTotalSeconds: 0,
      points: [
        { lat: 0, lng: 0, t: 0, moving: true },
        { lat: 0.001, lng: 0, t: 600_000, moving: true },
      ],
      steps: 900,
      autoPaused: false,
      splitUnit: "km",
      gpsQuality: "good",
      devicePlatform: "android",
    };
  }

  it("keeps a workout queued until the server confirms it", async () => {
    const storage = createMemoryStorage();
    writeQueue(storage, [finishedSession("a")]);

    const offline = await flushOfflineQueue(storage, async () => ({ ok: false, error: "offline" }));
    assert.deepEqual(offline, { synced: 0, failed: 1 });
    assert.equal(readQueue(storage).length, 1, "a failed sync must never lose the workout");

    const online = await flushOfflineQueue(storage, async () => ({ ok: true, duplicate: false }));
    assert.deepEqual(online, { synced: 1, failed: 0 });
    assert.equal(readQueue(storage).length, 0);
  });

  it("treats a duplicate response as success", async () => {
    const storage = createMemoryStorage();
    writeQueue(storage, [finishedSession("b")]);
    const result = await flushOfflineQueue(storage, async () => ({ ok: true, duplicate: true }));
    assert.equal(result.synced, 1);
    assert.equal(readQueue(storage).length, 0);
  });

  it("survives a thrown sync error", async () => {
    const storage = createMemoryStorage();
    writeQueue(storage, [finishedSession("c")]);
    const result = await flushOfflineQueue(storage, async () => {
      throw new Error("network down");
    });
    assert.equal(result.failed, 1);
    assert.equal(readQueue(storage).length, 1);
  });

  it("retries with the SAME idempotency key", async () => {
    const storage = createMemoryStorage();
    writeQueue(storage, [finishedSession("d")]);
    const seen: string[] = [];
    await flushOfflineQueue(storage, async (session) => {
      seen.push(session.clientSessionId);
      return { ok: false };
    });
    await flushOfflineQueue(storage, async (session) => {
      seen.push(session.clientSessionId);
      return { ok: true };
    });
    assert.equal(seen.length, 2);
    assert.equal(seen[0], seen[1], "retry must reuse the idempotency key");
  });

  it("ignores a corrupt queue instead of throwing", () => {
    const storage = createMemoryStorage({ [RECORDER_QUEUE_KEY]: "{not json" });
    assert.deepEqual(readQueue(storage), []);
  });
});

describe("enqueue for sync", () => {
  it("queues a finished workout once, replacing an older copy", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 1000);
    h.emit({ lat: 0, lng: 0 });
    h.setNow(T0 + 2000);
    h.emit({ lat: LEG_DEG, lng: 0 });
    h.setNow(T0 + 60_000);
    await h.recorder.finish();

    h.recorder.enqueueForSync();
    h.recorder.enqueueForSync();
    const queue = readQueue(h.storage);
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.points.length, 2);
  });

  it("drops the session from the queue once saved", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 1000);
    h.emit({ lat: 0, lng: 0 });
    h.setNow(T0 + 2000);
    h.emit({ lat: LEG_DEG, lng: 0 });
    h.setNow(T0 + 60_000);
    await h.recorder.finish();
    h.recorder.enqueueForSync();
    h.recorder.markSaved();

    assert.equal(readQueue(h.storage).length, 0);
    assert.equal(h.storage.read(RECORDER_SESSION_KEY), null);
    assert.equal(h.recorder.current?.state, "saved");
  });
});

describe("sync failure telemetry", () => {
  it("counts attempts and keeps the sanitized message", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.recorder.markSyncFailure("Network error while saving.");
    h.recorder.markSyncFailure("Network error while saving.");
    assert.equal(h.recorder.current?.syncAttempts, 2);
    assert.equal(h.recorder.current?.lastSyncError, "Network error while saving.");
  });
});

describe("polyline for display", () => {
  it("encodes a compact route from the recorded points", async () => {
    const h = harness();
    await h.recorder.start("running");
    for (let i = 0; i < 8; i += 1) {
      h.setNow(T0 + i * 1000);
      h.emit({ lat: i * LEG_DEG, lng: i * LEG_DEG });
    }
    const polyline = h.recorder.polyline();
    assert.ok(polyline.length > 0);
    assert.ok(polyline.length < h.recorder.current!.points.length * 12);
  });

  it("reports bounds for fit-to-route", async () => {
    const h = harness();
    await h.recorder.start("running");
    h.setNow(T0 + 1000);
    h.emit({ lat: 1, lng: 2 });
    // 5 s later: a realistic walking delta, accepted by the noise filter.
    h.setNow(T0 + 6000);
    h.emit({ lat: 1.0001, lng: 2.0001 });
    const bounds = h.recorder.bounds();
    assert.ok(bounds != null);
    assert.equal(bounds!.minLat, 1);
    assert.equal(bounds!.maxLng, 2.0001);
  });
});
