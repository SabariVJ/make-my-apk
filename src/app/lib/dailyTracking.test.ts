import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDailyState, type DailyTrackingState } from "./dailyTracking";
const owner = "original-account";
const state: DailyTrackingState = {
  version: 2,
  ownerId: owner,
  enabled: true,
  available: true,
  listening: true,
  permission: "granted",
  dateKey: "2026-10-04",
  steps: 100,
  raw: 4000,
  measurementAt: 1700000000000,
  source: "Hardware step counter",
  error: null,
};
describe("daily bridge diagnostics", () => {
  it("requires matching native capability and original account", () => {
    assert.throws(() => validateDailyState({ ...state, version: 1 }, owner));
    assert.throws(() => validateDailyState({ ...state, ownerId: "new-account" }, owner));
  });
  it("retains denied, unsupported and waiting states without inventing steps", () => {
    const denied = validateDailyState(
      {
        ...state,
        permission: "denied",
        available: false,
        listening: false,
        steps: 0,
        raw: -1,
        measurementAt: null,
      },
      owner,
    );
    assert.equal(denied.steps, 0);
    assert.equal(denied.raw, null);
    assert.equal(denied.listening, false);
    assert.equal(denied.measurementAt, null);
  });
  it("rejects malformed counts and measurement times", () => {
    for (const steps of [-1, NaN, Infinity, 1.5])
      assert.throws(() => validateDailyState({ ...state, steps }, owner));
    for (const measurementAt of [NaN, Infinity, -1])
      assert.throws(() => validateDailyState({ ...state, measurementAt }, owner));
  });
});
