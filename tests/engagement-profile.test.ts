import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INITIAL_USER } from "../src/app/data/initialData";
import { reconcileEngagementProfile } from "../src/app/lib/engagementProfile";

describe("server-confirmed engagement Profile XP", () => {
  it("applies a new cumulative grant exactly once and binds its watermark to the account", () => {
    const user = structuredClone(INITIAL_USER);
    const first = reconcileEngagementProfile(user, user.id, 60, "2026-09-02T10:00:00.000Z");
    assert.equal(first.totalXP, 60);
    assert.equal(first.engagementProfileXp, 60);
    assert.equal(first.engagementXpUserId, user.id);
    assert.equal(first.xpHistory.at(-1)?.xp, 60);

    const replay = reconcileEngagementProfile(first, user.id, 60, "2026-09-02T10:01:00.000Z");
    assert.deepEqual(replay, first);
  });

  it("ignores stale, cross-account, malformed, and negative server values", () => {
    const user = structuredClone(INITIAL_USER);
    const granted = reconcileEngagementProfile(user, user.id, 100, "2026-09-02T10:00:00.000Z");
    assert.deepEqual(
      reconcileEngagementProfile(granted, user.id, 90, "2026-09-02T10:01:00.000Z"),
      granted,
    );
    assert.deepEqual(
      reconcileEngagementProfile(granted, "another-account", 1000, "2026-09-02T10:01:00.000Z"),
      granted,
    );
    assert.deepEqual(
      reconcileEngagementProfile(granted, user.id, 1.5, "2026-09-02T10:01:00.000Z"),
      granted,
    );
    assert.deepEqual(
      reconcileEngagementProfile(granted, user.id, -100, "2026-09-02T10:01:00.000Z"),
      granted,
    );
    assert.deepEqual(
      reconcileEngagementProfile(granted, user.id, 1000, "not-a-timestamp"),
      granted,
    );
  });

  it("only applies the positive delta when a later receipt arrives", () => {
    const user = structuredClone(INITIAL_USER);
    const first = reconcileEngagementProfile(user, user.id, 50, "2026-09-02T10:00:00.000Z");
    const second = reconcileEngagementProfile(first, user.id, 125, "2026-09-02T11:00:00.000Z");
    assert.equal(second.totalXP, 125);
    assert.equal(second.engagementProfileXp, 125);
    assert.equal(second.xpHistory.at(-1)?.xp, 125);
  });
});
