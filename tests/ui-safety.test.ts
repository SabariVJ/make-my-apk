// UI-safety regression checks for production user experience.
// These verify the shipped source statically: no fabricated content defaults,
// no browser alert/confirm dialogs, no diagnostics enabled by platform state.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { INITIAL_USER, INITIAL_CHALLENGES, INITIAL_REWARDS } from "../src/app/data/initialData";
import { stripSeedFeedPosts, stripSeedMembers } from "../src/app/lib/seedData";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("no fabricated community or badge content ships", () => {
  it("the seed data module no longer exports fabricated feeds or leaderboards", async () => {
    const source = await read("../src/app/data/initialData.ts");
    assert.doesNotMatch(source, /INITIAL_FEED/);
    assert.doesNotMatch(source, /LEADERBOARD_USERS/);
    assert.doesNotMatch(source, /INITIAL_BADGES/);
    assert.doesNotMatch(source, /INITIAL_ACHIEVEMENTS/);
    assert.doesNotMatch(source, /vikram_elite|alex_titan|priya_apex|marcus_iron|sophia_vanguard/);
  });

  it("the default profile carries no invented badges or achievements", () => {
    assert.deepEqual(INITIAL_USER.badges, []);
    assert.deepEqual(INITIAL_USER.achievements, []);
  });

  it("cached feed and leaderboard restoration strips legacy seeds and defaults to empty", async () => {
    const context = await read("../src/app/context/SVJContext.tsx");
    assert.match(context, /stripSeedFeedPosts/);
    assert.match(context, /stripSeedMembers/);
    assert.match(context, /if \(!saved\) return \[\];/);
  });

  it("the community view renders clean empty states instead of fabricated activity", async () => {
    const view = await read("../src/app/views/CommunityView.tsx");
    // Both the feed and the member directory resolve to the shared empty-state
    // primitive with copy for the actual situation, so nothing is invented and
    // no bare spinner is left behind on an empty account.
    assert.match(view, /SVJEmptyState/);
    assert.match(view, /title="The feed is quiet"/);
    assert.match(view, /No member matches that search/);
    assert.match(view, /The directory is just you/);
  });
});

describe("no browser dialog APIs in user flows", () => {
  it("ProfileView uses an in-app logout dialog, not window.confirm", async () => {
    const view = await read("../src/app/views/ProfileView.tsx");
    assert.doesNotMatch(view, /window\.confirm/);
    assert.match(view, /Log out of SVJ\?/);
    assert.match(view, /showLogoutDialog/);
  });

  it("CommunityView uses in-app feedback, not window.alert", async () => {
    const view = await read("../src/app/views/CommunityView.tsx");
    assert.doesNotMatch(view, /\balert\(/);
    assert.match(view, /Request sent — waiting for/);
  });

  it("no window.prompt remains anywhere in the app", async () => {
    for (const path of [
      "../src/app/views/CommunityView.tsx",
      "../src/app/views/ProfileView.tsx",
      "../src/app/components/XPComparisonModal.tsx",
      "../src/app/components/MemberProfileModal.tsx",
    ]) {
      const source = await read(path);
      assert.doesNotMatch(source, /window\.prompt/, path);
    }
  });
});

describe("pedometer diagnostics are gone from every user-facing screen", () => {
  it("no debug panel, flag or diagnostics state remains in the activity flow", async () => {
    for (const path of [
      "../src/app/context/ActivityContext.tsx",
      "../src/app/views/ActivityView.tsx",
    ]) {
      const source = await read(path);
      assert.doesNotMatch(source, /ANDROID PEDOMETER DEBUG/, path);
      assert.doesNotMatch(source, /VITE_PEDOMETER_DIAGNOSTICS/, path);
      assert.doesNotMatch(source, /showDiagnostics|debugInfo|debugRef|EMPTY_DEBUG/, path);
      assert.doesNotMatch(source, /shouldEnableDiagnostics/, path);
    }
  });

  it("no screen renders native sensor state", async () => {
    for (const dir of ["../src/app/views", "../src/app/components"]) {
      const { readdir } = await import("node:fs/promises");
      const base = new URL(`${dir}/`, import.meta.url);
      for (const entry of await readdir(base, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
        const source = await read(`${dir}/${entry.name}`);
        assert.doesNotMatch(source, /PEDOMETER DEBUG/, entry.name);
        assert.doesNotMatch(source, /debugInfo/, entry.name);
        assert.doesNotMatch(source, /Refresh diagnostics/, entry.name);
      }
    }
  });

  it("the diagnostics harness no longer opts into a debug bundle", async () => {
    const source = await read("../tests/activity-tracking.test.mjs");
    assert.doesNotMatch(source, /VITE_PEDOMETER_DIAGNOSTICS/);
  });

  it("seed helpers never delete by appearance heuristics", () => {
    // A member that only *looks* similar to a seed must survive.
    assert.equal(stripSeedMembers([{ id: "x", username: "vikram" }]).length, 1);
    assert.equal(stripSeedMembers([{ id: "y", username: "elite_vikram" }]).length, 1);
    // Legacy cached rows are stripped.
    assert.equal(stripSeedMembers([{ id: "user-3", username: "marcus_iron" }]).length, 0);
    assert.equal(stripSeedFeedPosts([{ id: "feed-1" }]).length, 0);
  });
});

describe("real user data is preserved", () => {
  it("the daily challenge catalog stays usable", () => {
    assert.ok(INITIAL_CHALLENGES.length >= 6);
  });

  it("the rewards catalog only offers what the app can actually grant", () => {
    assert.ok(INITIAL_REWARDS.length >= 3);
    // No fabricated redemption codes or real-world voucher promises: those
    // asked members to spend XP on a deliverable that did not exist.
    for (const reward of INITIAL_REWARDS) {
      assert.equal(reward.code, undefined, `${reward.id} must not ship a voucher code`);
      assert.equal(reward.perkDetails, undefined, `${reward.id} must not promise a perk`);
      assert.doesNotMatch(reward.description, /voucher|discount/i, reward.id);
    }
  });
});
