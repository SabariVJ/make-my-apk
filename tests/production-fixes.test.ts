// Regression tests for the production hardening pass:
//   * self-comparison is refused server-side (not only by disabled UI),
//   * member rows carry only data the backend actually reports,
//   * the fabricated profile/leaderboard defaults stay removed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateRivalryOpponent, rivalryFailureMessage } from "../src/lib/rivalry.functions";
import { isSelfEntry, memberToLeaderboardEntry } from "../src/app/lib/memberDirectory";
import { INITIAL_USER, TIERS } from "../src/app/data/initialData";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

const CALLER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

test("server-side guard refuses comparing an account against itself", () => {
  const self = validateRivalryOpponent(CALLER, CALLER);
  assert.equal(self.ok, false);
  assert.match(self.ok === false ? self.error : "", /cannot challenge your own account/i);

  const other = validateRivalryOpponent(OTHER, CALLER);
  assert.deepEqual(other, { ok: true, opponentId: OTHER });
});

test("server-side guard rejects unresolved and malformed opponent ids", () => {
  for (const value of [undefined, null, 42, "", "not-a-uuid", "user-me", `${OTHER} `]) {
    const result = validateRivalryOpponent(value, CALLER);
    assert.equal(result.ok, false, String(value));
  }
});

test("database rejections are translated into user-readable messages", () => {
  assert.match(rivalryFailureMessage("You cannot challenge yourself"), /own account/i);
  assert.match(
    rivalryFailureMessage("Become friends before starting an Outperform rivalry"),
    /^Become friends/,
  );
  assert.match(rivalryFailureMessage("This member is unavailable"), /not available/i);
  assert.equal(rivalryFailureMessage("Some other failure"), "Some other failure");
});

test("the rivalry server function guards before it calls the RPC", async () => {
  const source = await read("../src/lib/rivalry.functions.ts");
  const guardIndex = source.indexOf("validateRivalryOpponent(data.opponentId, context.userId)");
  const rpcIndex = source.indexOf('rpc("svj_create_rivalry"');
  assert.ok(guardIndex >= 0, "createRivalry must validate the opponent server-side");
  assert.ok(rpcIndex > guardIndex, "validation must run before the RPC call");
});

test("member rows map only backend-reported fields", () => {
  const entry = memberToLeaderboardEntry({
    id: OTHER,
    username: "runner",
    display_name: null,
    avatar_url: null,
    total_xp: 3000,
    current_streak: 4,
    rank: 7,
  });
  assert.equal(entry.id, OTHER);
  assert.equal(entry.username, "runner");
  assert.equal(entry.totalXP, 3000);
  assert.equal(entry.streak, 4);
  assert.equal(entry.rank, 7);
  // Tier is DERIVED from lifetime XP, not hard-coded "Initiate" for everyone.
  assert.equal(entry.tier, "Bronze");
  // Fields the directory RPC cannot report stay neutral and are never rendered.
  assert.equal(entry.weeklyXP, 0);
  assert.equal(entry.monthlyXP, 0);
  assert.equal(entry.rankDelta, 0);
  assert.equal(entry.country, "");
});

test("member rows never carry a fabricated identity", () => {
  const unknown = memberToLeaderboardEntry({
    id: CALLER,
    username: null,
    display_name: null,
    avatar_url: null,
    total_xp: 0,
    current_streak: 0,
    rank: 1,
  });
  assert.equal(unknown.avatar, "");
  assert.equal(unknown.tier, "Initiate");
});

test("self-detection is id based, never name based", () => {
  assert.equal(isSelfEntry(CALLER, CALLER), true);
  assert.equal(isSelfEntry(OTHER, CALLER), false);
  assert.equal(isSelfEntry(CALLER, null), false);
  assert.equal(isSelfEntry(CALLER, undefined), false);
  assert.equal(isSelfEntry(CALLER, ""), false);
});

test("the default profile fabricates no stats, serial, join date or photo", () => {
  assert.equal(INITIAL_USER.avatar, "");
  assert.equal(INITIAL_USER.bio, "");
  assert.equal(INITIAL_USER.location, "");
  assert.equal(INITIAL_USER.memberId, "");
  assert.equal(INITIAL_USER.joinDate, "");
  assert.equal(INITIAL_USER.daysActive, 0);
  assert.deepEqual(INITIAL_USER.xpHistory, []);
  assert.deepEqual(INITIAL_USER.weeklyHistory, []);
  assert.deepEqual(INITIAL_USER.stats, {
    physical: 0,
    social: 0,
    discipline: 0,
    mental: 0,
    intellect: 0,
    ambition: 0,
  });
});

test("tier badges are semantic keys, never emoji glyphs", () => {
  for (const tier of TIERS) {
    assert.match(tier.icon, /^[a-z]+$/, `${tier.name} emblem must be a semantic key`);
  }
});

test("the device activity cache is scoped per account, so logout leaks nothing", async () => {
  const context = await read("../src/app/context/ActivityContext.tsx");
  assert.match(context, /activityStorageKey\(userId\)/);
  assert.match(context, /`\$\{STORAGE_KEY_PREFIX\}_\$\{userId\}`/);
  const app = await read("../src/app/App.tsx");
  assert.match(app, /<ActivityProvider key=\{status\?\.userId \?\? "signed-out"\}/);
});

test("the Outperform flow offers friendship first and is never self-targeted", async () => {
  const community = await read("../src/app/views/CommunityView.tsx");
  assert.match(community, /isSelfEntry\(m\.id, user\.id\)/);
  assert.match(community, /isFriend && rivalryState === "none"/);
  assert.match(community, /friendsApi\.sendRequest\(m\.id\)/);
  assert.match(community, /You cannot challenge your own account/);

  const modal = await read("../src/app/components/XPComparisonModal.tsx");
  assert.match(modal, /Add Friend to Compete/);
  assert.match(modal, /isSelfEntry\(member\.id, user\.id\)/);
  assert.match(modal, /This is your own account/);
});

test("compare surfaces never print XP the backend does not report", async () => {
  for (const path of [
    "../src/app/components/XPComparisonModal.tsx",
    "../src/app/views/LeaderboardView.tsx",
    "../src/app/views/CommunityView.tsx",
    "../src/app/components/MemberProfileModal.tsx",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(source, /weeklyXP|monthlyXP/, path);
  }
});

test("no leaderboard or directory surface hard-codes a tier or fake weekly XP", async () => {
  for (const path of [
    "../src/app/views/LeaderboardView.tsx",
    "../src/app/views/CommunityView.tsx",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(source, /tier: "Initiate"/, path);
    assert.doesNotMatch(source, /weeklyXP: 0,\s*\n\s*monthlyXP: 0/, path);
    assert.match(source, /memberToLeaderboardEntry/, path);
  }
});
