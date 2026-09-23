// Legacy seed cleanup: fabricated sample content (vikram_elite, alex_titan,
// priya_apex, marcus_iron, sophia_vanguard, …) must be stripped from cached
// data during restoration, while real accounts pass through untouched.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSeedMember,
  isSeedFeedPost,
  stripSeedFeedPosts,
  stripSeedMembers,
} from "../src/app/lib/seedData";

describe("seed member cleanup", () => {
  it("flags every fabricated seed identity", () => {
    for (const username of [
      "vikram_elite",
      "VIKRAM_ELITE", // case-insensitive
      "alex_titan",
      "priya_apex",
      "marcus_iron",
      "sophia_vanguard",
      "ryu_mastery",
      "karan_shield",
      "liam_forge",
      "dev_warrior",
      "rafael_steel",
    ]) {
      assert.equal(isSeedMember({ id: "some-other-uuid", username }), true, username);
    }
  });

  it("flags fabricated seed ids including the demo row", () => {
    assert.equal(isSeedMember({ id: "user-7", username: "anything" }), true);
    assert.equal(isSeedMember({ id: "user-me", username: "initiate_svj" }), true);
  });

  it("does not flag a real account that merely shares the demo id but has a real handle", () => {
    assert.equal(isSeedMember({ id: "user-me", username: "real_user" }), false);
  });

  it("keeps real members regardless of activity, name or profile completeness", () => {
    assert.equal(isSeedMember({ id: "abc", username: "some_newcomer" }), false);
    assert.equal(isSeedMember({ id: "def", username: "vikram_elite_fan" }), false);
    assert.equal(isSeedMember({ id: "ghi", username: null }), false);
  });
});

describe("seed feed cleanup", () => {
  it("flags seeded posts by id, author id or author handle", () => {
    assert.equal(isSeedFeedPost({ id: "feed-2" }), true);
    assert.equal(isSeedFeedPost({ id: "anything", userId: "user-5" }), true);
    assert.equal(isSeedFeedPost({ id: "anything", username: "vikram_elite" }), true);
    assert.equal(isSeedFeedPost({ id: "anything", username: "Marcus_Iron" }), true);
  });

  it("keeps real activity posts", () => {
    assert.equal(isSeedFeedPost({ id: "post-99", userId: "uuid-1", username: "real_member" }), false);
  });

  it("strips only seeded rows from a cached feed array", () => {
    const cached = [
      { id: "feed-1", username: "vikram_elite" },
      { id: "post-live", userId: "uuid-1", username: "real_member" },
      { id: "feed-3", username: "priya_apex" },
    ];
    const cleaned = stripSeedFeedPosts(cached);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, "post-live");
  });

  it("handles null and empty caches", () => {
    assert.deepEqual(stripSeedFeedPosts(null), []);
    assert.deepEqual(stripSeedFeedPosts([]), []);
  });
});

describe("seed member cleanup over cached arrays", () => {
  it("drops fabricated rows from a cached leaderboard", () => {
    const cached = [
      { id: "user-1", username: "vikram_elite" },
      { id: "uuid-2", username: "actual_person" },
      { id: "user-10", username: "rafael_steel" },
    ];
    const cleaned = stripSeedMembers(cached);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].id, "uuid-2");
  });

  it("keeps arrays with no fabricated content intact", () => {
    const cached = [{ id: "uuid-3", username: "member_one" }];
    assert.deepEqual(stripSeedMembers(cached), cached);
  });
});
