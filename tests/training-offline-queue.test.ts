/**
 * Automated Training — offline workout queue + account isolation.
 *
 * The queue must survive a dropped connection, a timeout and a process restart
 * while guaranteeing ONE canonical workout, and it must never leak a workout
 * between signed-in accounts.
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_QUEUED_WORKOUTS,
  clearWorkoutDraft,
  dequeueWorkout,
  enqueueWorkout,
  isRetryableFailure,
  markWorkoutAttempt,
  normalizeQueuedWorkout,
  pendingWorkoutsFor,
  readWorkoutDraft,
  readWorkoutQueue,
  workoutDraftKey,
  workoutQueueKey,
  writeWorkoutDraft,
  writeWorkoutQueue,
  type QueuedWorkout,
} from "../src/app/lib/workoutQueue";
import type { StrengthExerciseDraft } from "../src/app/lib/strength";

const USER_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

before(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
});

const drafts = (): StrengthExerciseDraft[] => [
  {
    id: "ex-1",
    exerciseId: "ex-bench",
    name: "Bench Press",
    exerciseType: "weighted_reps",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps"],
    sets: [
      { id: "s-1", reps: 15, weightKg: 40, durationSeconds: null, isWarmup: true },
      { id: "s-2", reps: 10, weightKg: 60, durationSeconds: null, isWarmup: false },
    ],
  },
];

const entry = (userId: string, clientSessionId: string): QueuedWorkout => ({
  version: 1,
  userId,
  clientSessionId,
  startedAtMs: 1_700_000_000_000,
  endedAtMs: 1_700_000_600_000,
  durationSeconds: 600,
  drafts: drafts(),
  context: { planId: "p-1", planSessionId: "s-1", templateId: "upper_a", templateVersion: 1 },
  targets: [],
  status: "pending",
  attempts: 0,
  lastAttemptAt: null,
  lastError: null,
  createdAt: new Date().toISOString(),
});

describe("offline workout queue", () => {
  it("scopes storage to the authenticated account", () => {
    assert.notEqual(workoutQueueKey(USER_A), workoutQueueKey(USER_B));
    assert.ok(workoutQueueKey(USER_A).includes(USER_A));
    writeWorkoutQueue(USER_A, [entry(USER_A, "session-aaaaaaaa")]);
    assert.equal(readWorkoutQueue(USER_A).length, 1);
    // Account B can never see account A's queued workout.
    assert.equal(readWorkoutQueue(USER_B).length, 0);
    writeWorkoutQueue(USER_A, []);
  });

  it("drops an entry whose owner does not match the storage key", () => {
    writeWorkoutQueue(USER_A, [
      entry(USER_B, "session-bbbbbbbb"),
      entry(USER_A, "session-aaaaaaaa"),
    ]);
    const queue = readWorkoutQueue(USER_A);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].userId, USER_A);
    // And a direct normalization of B's entry against A's key is refused.
    assert.equal(normalizeQueuedWorkout(entry(USER_B, "session-bbbbbbbb"), USER_A), null);
    writeWorkoutQueue(USER_A, []);
  });

  it("never returns another account's entries as pending", () => {
    const queue = [entry(USER_A, "session-aaaaaaaa"), entry(USER_B, "session-bbbbbbbb")];
    assert.deepEqual(
      pendingWorkoutsFor(queue, USER_B).map((e) => e.clientSessionId),
      ["session-bbbbbbbb"],
    );
  });

  it("is idempotent by client_session_id — a double tap queues one workout", () => {
    let queue: QueuedWorkout[] = [];
    queue = enqueueWorkout(queue, entry(USER_A, "session-aaaaaaaa"));
    queue = enqueueWorkout(queue, entry(USER_A, "session-aaaaaaaa"));
    assert.equal(queue.length, 1);
  });

  it("keeps a timed-out workout queued and records the failed attempt", () => {
    let queue = enqueueWorkout([], entry(USER_A, "session-aaaaaaaa"));
    queue = markWorkoutAttempt(queue, "session-aaaaaaaa", {
      ok: false,
      error: "Network request failed",
      at: "2026-09-21T10:00:00.000Z",
    });
    assert.equal(queue.length, 1, "the workout must not be lost");
    assert.equal(queue[0].status, "failed");
    assert.equal(queue[0].attempts, 1);
    assert.equal(queue[0].lastError, "Network request failed");
    assert.equal(
      queue[0].clientSessionId,
      "session-aaaaaaaa",
      "identity is preserved for the retry",
    );
  });

  it("removes exactly the synced entry, leaving other pending work intact", () => {
    let queue = enqueueWorkout([], entry(USER_A, "session-aaaaaaaa"));
    queue = enqueueWorkout(queue, entry(USER_A, "session-bbbbbbbb"));
    queue = dequeueWorkout(queue, "session-aaaaaaaa");
    assert.deepEqual(
      queue.map((e) => e.clientSessionId),
      ["session-bbbbbbbb"],
    );
  });

  it("rejects malformed entries rather than uploading garbage", () => {
    assert.equal(normalizeQueuedWorkout(null, USER_A), null);
    assert.equal(normalizeQueuedWorkout({ userId: USER_A }, USER_A), null);
    assert.equal(
      normalizeQueuedWorkout(
        { ...entry(USER_A, "session-aaaaaaaa"), clientSessionId: "short" },
        USER_A,
      ),
      null,
    );
    assert.equal(
      normalizeQueuedWorkout(
        { ...entry(USER_A, "session-aaaaaaaa"), endedAtMs: 1, startedAtMs: 2 },
        USER_A,
      ),
      null,
    );
    assert.equal(
      normalizeQueuedWorkout({ ...entry(USER_A, "session-aaaaaaaa"), drafts: [] }, USER_A),
      null,
    );
  });

  it("is bounded so a corrupt store cannot grow without limit", () => {
    let queue: QueuedWorkout[] = [];
    for (let i = 0; i < MAX_QUEUED_WORKOUTS + 5; i += 1) {
      queue = enqueueWorkout(queue, entry(USER_A, `session-${i.toString().padStart(8, "0")}`));
    }
    assert.equal(queue.length, MAX_QUEUED_WORKOUTS);
  });

  it("separates a retryable network failure from a permanent validation error", () => {
    assert.equal(isRetryableFailure("Network request failed"), true);
    assert.equal(isRetryableFailure("Failed to fetch"), true);
    assert.equal(isRetryableFailure(null), true);
    assert.equal(isRetryableFailure("Each exercise needs between 1 and 30 sets"), false);
    assert.equal(isRetryableFailure("Weighted exercises need a weight value"), false);
  });
});

describe("offline workout draft", () => {
  it("persists and restores an in-progress workout for its owner only", () => {
    writeWorkoutDraft(USER_A, {
      clientSessionId: "session-aaaaaaaa",
      startedAtMs: 1_700_000_000_000,
      drafts: drafts(),
      context: null,
      targets: [],
      note: "Upper A",
    });
    const restored = readWorkoutDraft(USER_A);
    assert.ok(restored);
    assert.equal(restored.clientSessionId, "session-aaaaaaaa");
    assert.equal(restored.drafts.length, 1);
    assert.equal(
      restored.drafts[0].sets[0].isWarmup,
      true,
      "warm-up classification survives a restart",
    );
    assert.equal(readWorkoutDraft(USER_B), null);
  });

  it("ignores a draft written under another account's key", () => {
    const key = workoutDraftKey(USER_A);
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        userId: USER_B,
        clientSessionId: "session-bbbbbbbb",
        startedAtMs: 1,
        drafts: drafts(),
        updatedAt: "2026-09-21T10:00:00.000Z",
      }),
    );
    assert.equal(readWorkoutDraft(USER_A), null);
    clearWorkoutDraft(USER_A);
  });

  it("clears cleanly so a finished workout is not resumed", () => {
    writeWorkoutDraft(USER_A, {
      clientSessionId: "session-aaaaaaaa",
      startedAtMs: 1,
      drafts: drafts(),
      context: null,
      targets: [],
      note: null,
    });
    clearWorkoutDraft(USER_A);
    assert.equal(readWorkoutDraft(USER_A), null);
  });
});
