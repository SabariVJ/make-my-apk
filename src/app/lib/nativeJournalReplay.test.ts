import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GpsWorkoutRecorder,
  createAccountStorage,
  createMemoryStorage,
  readQueue,
  writeQueue,
  flushOfflineQueue,
  type NativeWorkoutEvent,
} from "./gpsRecorder";
import { createJournalLocationAdapter, validateJournalEvent } from "./nativeWorkout";

const ownerId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const startedAtMs = 1_700_000_000_000;
const event = (
  sequence: number,
  kind: NativeWorkoutEvent["kind"],
  extra = {},
): NativeWorkoutEvent => ({
  ownerId,
  activityId,
  sequence,
  kind,
  timestampMs: startedAtMs + sequence * 5000,
  ...extra,
});
const recorderFor = (storage = createMemoryStorage()) =>
  new GpsWorkoutRecorder({
    ownerId,
    storage,
    now: () => startedAtMs + 3600000,
    autoPauseEnabled: false,
  });
function adopt(recorder: GpsWorkoutRecorder) {
  recorder.adoptNative({
    ownerId,
    activityId,
    activityType: "walking",
    startedAtMs,
    active: true,
    paused: false,
  });
}

describe("durable native journal replay", () => {
  it("reattaches after JavaScript was detached and consumes paginated points exactly once", async () => {
    const saved = [
      event(1, "start"),
      ...Array.from({ length: 300 }, (_, index) =>
        event(index + 2, "point", { lat: 10 + index * 0.00004, lng: 20, accuracy: 5 }),
      ),
      event(302, "steps", { steps: 620 }),
      event(303, "end"),
    ];
    const recorder = recorderFor();
    adopt(recorder);
    const listeners = new Set<(raw: unknown) => void>();
    let removed = 0;
    const adapter = createJournalLocationAdapter(
      {
        readJournal: async ({ afterSequence, limit }) => ({
          events: saved.filter((e) => e.sequence > afterSequence).slice(0, limit),
        }),
        addListener: async (_, handler) => {
          listeners.add(handler);
          return {
            remove: async () => {
              listeners.delete(handler);
              removed++;
            },
          };
        },
      },
      ownerId,
      recorder,
    );
    recorder.setLocationAdapter(adapter);
    await recorder.attach();
    await recorder.attach();
    assert.equal(recorder.current?.points.length, 300);
    assert.equal(recorder.current?.steps, 620);
    assert.equal(recorder.current?.state, "stopping");
    assert.equal(recorder.current?.nativeSequence, 303);
    await recorder.detach();
    assert.equal(listeners.size, 0);
    assert.equal(removed, 4);
  });
  it("persists pause timing and the original end time across reopening", () => {
    const storage = createMemoryStorage();
    const first = recorderFor(storage);
    adopt(first);
    first.replayNativeEvent(event(1, "start"));
    first.replayNativeEvent(event(2, "pause"));
    first.replayNativeEvent(event(3, "resume"));
    first.replayNativeEvent(event(4, "end"));
    const second = recorderFor(storage);
    second.recover();
    assert.equal(second.current?.pausedTotalSeconds, 5);
    assert.equal(second.current?.durationSeconds, 20);
    assert.equal(second.current?.endedAtMs, startedAtMs + 20000);
    assert.equal(second.current?.state, "stopping");
  });
  it("rejects wrong-account, stale-session, gaps and invalid points", () => {
    const recorder = recorderFor();
    adopt(recorder);
    assert.throws(() =>
      validateJournalEvent({ ...event(1, "point"), lat: 1000, lng: 2 }, ownerId, activityId),
    );
    assert.throws(() => recorder.replayNativeEvent({ ...event(1, "start"), ownerId: "another" }));
    assert.throws(() =>
      recorder.replayNativeEvent({ ...event(1, "start"), activityId: "another" }),
    );
    assert.throws(() => recorder.replayNativeEvent(event(2, "start")));
  });
  it("does not count movement or elapsed pause gaps as recorded exercise", () => {
    const recorder = recorderFor();
    adopt(recorder);
    recorder.replayNativeEvent(event(1, "start"));
    recorder.replayNativeEvent(event(2, "point", { lat: 12, lng: 77, accuracy: 5 }));
    recorder.replayNativeEvent(event(3, "point", { lat: 12.0001, lng: 77, accuracy: 5 }));
    recorder.replayNativeEvent(event(4, "pause"));
    recorder.replayNativeEvent(event(5, "resume"));
    recorder.replayNativeEvent(event(6, "point", { lat: 12.001, lng: 77, accuracy: 5 }));
    recorder.replayNativeEvent(event(7, "point", { lat: 12.0011, lng: 77, accuracy: 5 }));
    recorder.replayNativeEvent(event(8, "point", { lat: 12.0012, lng: 77, accuracy: 5 }));
    assert.equal(recorder.current?.points[2]?.moving, false);
    assert.equal(recorder.current?.pausedTotalSeconds, 5);
    assert.ok((recorder.summary()?.distanceMeters ?? 0) < 30);
  });
  it("reattaching an active native recording does not invent a pause", () => {
    const storage = createMemoryStorage(),
      first = recorderFor(storage);
    adopt(first);
    first.replayNativeEvent(event(1, "start"));
    const second = recorderFor(storage);
    second.recover();
    adopt(second);
    second.replayNativeEvent(event(2, "end"));
    assert.equal(second.current?.pausedTotalSeconds, 0);
    assert.equal(second.current?.endedAtMs, startedAtMs + 10000);
  });
  it("keeps the cursor unchanged on storage failure so replay can be retried", () => {
    const base = createMemoryStorage();
    let full = false;
    const recorder = recorderFor({
      ...base,
      write: (key, value) => {
        if (full) throw new Error("Full");
        base.write(key, value);
      },
    });
    adopt(recorder);
    full = true;
    assert.throws(() => recorder.replayNativeEvent(event(1, "start")));
    assert.equal(recorder.current?.nativeSequence, undefined);
    full = false;
    recorder.replayNativeEvent(event(1, "start"));
    assert.equal(recorder.current?.nativeSequence, 1);
  });
  it("does not report Finish when native stop fails", async () => {
    const recorder = recorderFor();
    adopt(recorder);
    recorder.setLocationAdapter({
      start: async () => {},
      stop: async () => {
        throw new Error("permission lost");
      },
    });
    await assert.rejects(recorder.finish());
    assert.equal(recorder.current?.endedAtMs, null);
  });
});

describe("owned persistent queue", () => {
  it("isolates accounts, retains the legacy queue, and keeps more than twenty workouts", () => {
    const base = createMemoryStorage({ "svj.workout.queue.v1": '[{"legacy":true}]' });
    const account = createAccountStorage(ownerId, base);
    const recorder = recorderFor(account);
    adopt(recorder);
    const session = recorder.current!;
    writeQueue(
      account,
      Array.from({ length: 32 }, (_, index) => ({
        ...session,
        clientSessionId: `session-${index}`,
      })),
    );
    assert.equal(readQueue(account).length, 32);
    assert.equal(readQueue(createAccountStorage("other", base)).length, 0);
    assert.equal(base.read("svj.workout.queue.v1"), '[{"legacy":true}]');
  });
  it("serializes retries and preserves entries added during a save", async () => {
    const storage = createMemoryStorage();
    const recorder = recorderFor(storage);
    adopt(recorder);
    const session = recorder.current!;
    writeQueue(storage, [session]);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    let saves = 0;
    const save = async () => {
      saves++;
      await blocker;
      return { ok: true };
    };
    const one = flushOfflineQueue(storage, save);
    const two = flushOfflineQueue(storage, save);
    writeQueue(storage, [session, { ...session, clientSessionId: "added-while-syncing" }]);
    release();
    await Promise.all([one, two]);
    assert.equal(saves, 1);
    assert.deepEqual(
      readQueue(storage).map((entry) => entry.clientSessionId),
      ["added-while-syncing"],
    );
  });
});
