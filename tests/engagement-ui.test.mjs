import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  completeMissionInput,
  formatRewardDuration,
  rewardRequestInput,
  rewardSecondsRemaining,
  selectCurrentLoginReceipts,
  startMissionInput,
} from "../src/lib/engagement.ts";

describe("Earn Plus browser contract", () => {
  it("accepts only server-safe action inputs and rejects forged reward fields", () => {
    const requestId = "00000000-0000-4000-8000-000000000001";
    assert.deepEqual(rewardRequestInput.parse({ requestId }), { requestId });
    assert.deepEqual(startMissionInput.parse({ requestId, missionKey: "plan-and-reflect" }), {
      requestId,
      missionKey: "plan-and-reflect",
    });
    assert.deepEqual(
      completeMissionInput.parse({
        requestId,
        assignmentId: "00000000-0000-4000-8000-000000000002",
        confirmation: "I completed the planned activity and wrote down my next useful step.",
      }).requestId,
      requestId,
    );
    for (const value of [
      { requestId, userId: "forged" },
      { requestId, rewardXp: 999999 },
      { requestId, profileXp: 999999 },
      { requestId, issuedAt: new Date().toISOString() },
    ]) {
      assert.throws(() => rewardRequestInput.parse(value));
    }
    assert.throws(() => startMissionInput.parse({ requestId, missionKey: "Custom Task" }));
    assert.throws(() =>
      completeMissionInput.parse({
        requestId,
        assignmentId: "00000000-0000-4000-8000-000000000002",
        confirmation: "too short",
      }),
    );
  });

  it("uses the server timestamp anchor for countdowns and never goes negative", () => {
    const serverNow = Date.parse("2026-09-02T10:00:00.000Z");
    assert.equal(rewardSecondsRemaining("2026-09-02T10:00:05.100Z", serverNow), 6);
    assert.equal(rewardSecondsRemaining("2026-09-02T09:59:59.000Z", serverNow), 0);
    assert.equal(rewardSecondsRemaining(null, serverNow), 0);
    assert.equal(formatRewardDuration(3661), "1h 1m");
    assert.equal(formatRewardDuration(65), "01:05");
    assert.equal(formatRewardDuration(-5), "00:00");
  });

  it("resets login receipts at seven-day boundaries while retaining other receipt kinds", () => {
    const receipt = (kind, policyDay) => ({ kind, policyDay });
    const ledger = [
      receipt("daily_checkin", "2026-09-01"),
      receipt("streak_milestone", "2026-09-07"),
      receipt("daily_checkin", "2026-09-08"),
      receipt("mission_completion", "2026-09-01"),
      receipt("earned_plus_redemption", "2026-09-02"),
    ];

    assert.deepEqual(
      selectCurrentLoginReceipts(ledger, "2026-09-07", 7, true).map((entry) => entry.policyDay),
      ["2026-09-01", "2026-09-07"],
    );
    assert.deepEqual(selectCurrentLoginReceipts(ledger.slice(0, 2), "2026-09-08", 7, false), []);
    assert.deepEqual(
      selectCurrentLoginReceipts(ledger, "2026-09-08", 8, true).map((entry) => entry.policyDay),
      ["2026-09-08"],
    );
    assert.deepEqual(selectCurrentLoginReceipts(ledger, "2026-09-09", 0, false), []);
  });
});
