// Regression coverage for the SVJ native workout bridge.
//
// The Android service and the JavaScript recorder must agree on one workout.
// These tests pin the two places where a bad native payload could otherwise
// corrupt a track or create a second activity:
//   • sample/state normalization (a malformed bridge payload is dropped)
//   • native↔local reconciliation (an unmatched live service is not continued)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canRecordWith,
  normalizeNativeSample,
  normalizeWorkoutPermissions,
  normalizeWorkoutState,
  reconcileWorkoutStates,
  type WorkoutNativeState,
} from "../src/app/lib/nativeWorkout";

describe("normalizeNativeSample", () => {
  it("accepts a valid native location payload", () => {
    const sample = normalizeNativeSample({
      lat: 51.5,
      lng: -0.12,
      timestampMs: 1_700_000_000_000,
      accuracy: 8.5,
      elevation: 31.2,
      heartRate: 142,
      cadence: 88,
    });
    assert.deepEqual(sample, {
      lat: 51.5,
      lng: -0.12,
      timestampMs: 1_700_000_000_000,
      accuracy: 8.5,
      elevation: 31.2,
      heartRate: 142,
      cadence: 88,
    });
  });

  it("accepts the Android altitude/hr aliases", () => {
    const sample = normalizeNativeSample({
      lat: 1,
      lng: 2,
      timestampMs: 1_700_000_000_000,
      altitude: 12,
      hr: 150,
    });
    assert.equal(sample?.elevation, 12);
    assert.equal(sample?.heartRate, 150);
  });

  it("rejects out-of-range coordinates", () => {
    assert.equal(
      normalizeNativeSample({ lat: 91, lng: 0, timestampMs: 1_700_000_000_000 }),
      null,
    );
    assert.equal(
      normalizeNativeSample({ lat: 0, lng: -181, timestampMs: 1_700_000_000_000 }),
      null,
    );
  });

  it("rejects a missing or invalid timestamp", () => {
    assert.equal(normalizeNativeSample({ lat: 1, lng: 2 }), null);
    assert.equal(normalizeNativeSample({ lat: 1, lng: 2, timestampMs: 0 }), null);
    assert.equal(normalizeNativeSample({ lat: 1, lng: 2, timestampMs: Number.NaN }), null);
  });

  it("drops implausible optional values instead of coercing them", () => {
    const sample = normalizeNativeSample({
      lat: 1,
      lng: 2,
      timestampMs: 1_700_000_000_000,
      accuracy: 99_999,
      heartRate: 400,
      cadence: -5,
    });
    assert.equal(sample?.accuracy, null);
    assert.equal(sample?.heartRate, null);
    assert.equal(sample?.cadence, null);
  });

  it("rejects non-objects, arrays and null", () => {
    assert.equal(normalizeNativeSample(null), null);
    assert.equal(normalizeNativeSample("sample"), null);
    assert.equal(normalizeNativeSample([{ lat: 1, lng: 2, timestampMs: 1 }]), null);
  });
});

describe("normalizeWorkoutState", () => {
  it("defaults to inactive and coerces an unknown payload safely", () => {
    assert.deepEqual(normalizeWorkoutState(null), {
      active: false,
      activityId: null,
      activityType: null,
      startedAtMs: null,
      paused: false,
      pointCount: 0,
    });
  });

  it("reads a live service state", () => {
    const state = normalizeWorkoutState({
      active: true,
      activityId: "abc",
      activityType: "cycling",
      startedAtMs: 123,
      paused: true,
      pointCount: 42.7,
    });
    assert.equal(state.active, true);
    assert.equal(state.activityId, "abc");
    assert.equal(state.activityType, "cycling");
    assert.equal(state.startedAtMs, 123);
    assert.equal(state.paused, true);
    assert.equal(state.pointCount, 43);
  });

  it("never reports a negative point count", () => {
    assert.equal(normalizeWorkoutState({ active: true, pointCount: -10 }).pointCount, 0);
  });
});

describe("normalizeWorkoutPermissions", () => {
  it("maps the native permission strings", () => {
    assert.deepEqual(
      normalizeWorkoutPermissions({
        location: "granted",
        backgroundLocation: "denied",
        notifications: "prompt-with-rationale",
      }),
      { location: "granted", backgroundLocation: "denied", notifications: "prompt" },
    );
  });

  it("treats anything unknown as unavailable", () => {
    assert.deepEqual(normalizeWorkoutPermissions({}), {
      location: "unavailable",
      backgroundLocation: "unavailable",
      notifications: "unavailable",
    });
  });

  it("only requires foreground location to record", () => {
    assert.equal(
      canRecordWith({
        location: "granted",
        backgroundLocation: "denied",
        notifications: "denied",
      }),
      true,
    );
    assert.equal(
      canRecordWith({
        location: "denied",
        backgroundLocation: "granted",
        notifications: "granted",
      }),
      false,
    );
  });
});

describe("reconcileWorkoutStates", () => {
  const active = (activityId: string | null): WorkoutNativeState => ({
    active: true,
    activityId,
    activityType: "running",
    startedAtMs: 1,
    paused: false,
    pointCount: 10,
  });

  it("returns null when the native service is not available", () => {
    assert.equal(reconcileWorkoutStates(null, "abc"), null);
  });

  it("matches a native workout to the same local activity", () => {
    const result = reconcileWorkoutStates(active("abc"), "abc");
    assert.equal(result?.matchesLocal, true);
    assert.equal(result?.orphaned, false);
  });

  it("flags a live native workout with no local session as orphaned", () => {
    const result = reconcileWorkoutStates(active("abc"), null);
    assert.equal(result?.nativeActive, true);
    assert.equal(result?.matchesLocal, false);
    assert.equal(result?.orphaned, true);
  });

  it("flags a mismatched activity id as orphaned rather than merging", () => {
    const result = reconcileWorkoutStates(active("native-1"), "local-2");
    assert.equal(result?.matchesLocal, false);
    assert.equal(result?.orphaned, true);
  });

  it("reports an inactive service as neither matching nor orphaned", () => {
    const result = reconcileWorkoutStates({ ...active("abc"), active: false }, "abc");
    assert.equal(result?.nativeActive, false);
    assert.equal(result?.matchesLocal, false);
    assert.equal(result?.orphaned, false);
  });

  it("flags a live native workout with an unknown id as orphaned", () => {
    const result = reconcileWorkoutStates(active(null), "abc");
    assert.equal(result?.matchesLocal, false);
    assert.equal(result?.orphaned, true);
  });
});
