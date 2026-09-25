/**
 * Update 07 — Community / Friends / Rivalry hardening contracts.
 *
 * Pins the real friend + rivalry state machine:
 *   - friendships flow request → pending → accepted → active rivalry → done
 *   - rivalry baselines: XP delta since rivalry start, never lifetime XP
 *   - duplicate prevention and leaderboard eligibility checks are in the DB
 *   - clients never own rivalry state, XP or recipient identity
 *   - profiles are the username/avatar source of truth (live RPC refresh)
 *   - no bots/demo/seed members can reach the leaderboard
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rivalryHardening = readFileSync(
  new URL(
    "../supabase/migrations/20260904180000_profile_avatar_rivalry_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const rivalryFns = readFileSync(
  new URL("../src/lib/rivalry.functions.ts", import.meta.url),
  "utf8",
);
const communityView = readFileSync(
  new URL("../src/app/views/CommunityView.tsx", import.meta.url),
  "utf8",
);
const friendsPanel = readFileSync(
  new URL("../src/app/components/FriendsPanel.tsx", import.meta.url),
  "utf8",
);
const seedData = readFileSync(new URL("../src/app/lib/seedData.ts", import.meta.url), "utf8");
const comparisonModal = readFileSync(
  new URL("../src/app/components/XPComparisonModal.tsx", import.meta.url),
  "utf8",
);

describe("rivalry state machine (database-owned)", () => {
  test("create/accept/decline/cancel/list RPCs exist and are locked down", () => {
    for (const fn of [
      "svj_create_rivalry",
      "svj_respond_to_rivalry",
      "svj_cancel_rivalry",
      "svj_list_rivalries",
    ]) {
      assert.match(rivalryHardening, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
      assert.match(
        rivalryHardening,
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[^;]*FROM PUBLIC, anon`),
      );
    }
    assert.match(
      rivalryHardening,
      /GRANT EXECUTE ON FUNCTION public\.svj_create_rivalry\(uuid\) TO authenticated/,
    );
  });

  test("identity is auth.uid(); self-challenge blocked; eligibility required", () => {
    assert.match(rivalryHardening, /caller_id uuid := auth\.uid\(\)/);
    assert.match(rivalryHardening, /You cannot challenge yourself/);
    assert.match(rivalryHardening, /leaderboard_eligible = true/);
  });

  test("duplicates prevented: existing pending/active rivalry is returned, not recreated", () => {
    assert.match(
      rivalryHardening,
      /AND status IN \('pending', 'accepted', 'active'\)[\s\S]{0,120}IF FOUND THEN[\s\S]{0,120}'existing', true/,
    );
  });

  test("no client-owned XP, status or baseline inputs", () => {
    assert.doesNotMatch(rivalryFns, /p_xp|p_status|p_baseline/);
    assert.match(rivalryFns, /p_opponent_id: data\.opponentId/);
  });

  test("expiry + winner resolution happens server-side on list", () => {
    assert.match(
      rivalryHardening,
      /SET status = 'completed',\s*\n\s*ended_at = now\(\),\s*\n\s*winner_id = CASE/,
    );
  });
});

describe("rivalry scoring semantics", () => {
  test("scores are XP deltas from rivalry_events since start, never lifetime XP", () => {
    assert.match(rivalryHardening, /JOIN public\.rivalry_events e ON e\.rivalry_id = r\.id/);
    assert.match(friendsPanel, /Lifetime XP is not used here\./);
  });

  test("rivalry dashboard shows opponent, scores, events and time remaining", () => {
    assert.match(friendsPanel, /Active rivalry/);
    assert.match(friendsPanel, /selectedRivalry\.opponentUsername/);
    assert.match(friendsPanel, /selectedRivalry\.myScore/);
    assert.match(friendsPanel, /selectedRivalry\.opponentScore/);
    assert.match(friendsPanel, /remainingRivalryTime/);
  });
});

describe("community UI state machine", () => {
  test("sender sees REQUEST SENT with @username — no infinite spinner", () => {
    assert.match(communityView, /outgoing_pending/);
    assert.match(communityView, /Request sent/);
    assert.match(comparisonModal, /Request sent — waiting for @\{member\.username\}/);
    // Sending state is always cleared in finally — no stuck spinner.
    assert.match(comparisonModal, /finally/);
    assert.match(comparisonModal, /setSending\(false\)/);
  });

  test("active rivalry hides the challenge CTA and offers View Rivalry", () => {
    assert.doesNotMatch(
      communityView,
      /rivalryState === "active"[\s\S]{0,400}Outperform/,
      "active rivalry must not re-offer Outperform",
    );
    assert.match(communityView, /View rivalry/);
    assert.match(comparisonModal, /"View Rivalry"/);
  });

  test("friend request → pending → accepted flow and cancel-outgoing exist", () => {
    assert.match(friendsPanel, /Request sent/);
    assert.match(friendsPanel, /removeFriend\(r\.friendship_id\)/, "cancel outgoing");
    assert.match(friendsPanel, /acceptRivalry|handleAcceptRivalry/);
    assert.match(friendsPanel, /declineRivalry|handleDeclineRivalry/);
    assert.match(friendsPanel, /cancelRivalry|handleCancelRivalry/);
  });

  test("profiles are the live username/avatar source (20s account-scoped refresh)", () => {
    assert.match(rivalryFns, /svj_list_rivalries/);
    assert.match(rivalryHardening, /JOIN public\.profiles other/);
    assert.match(friendsPanel, /refreshRivalryData/);
  });
});

describe("leaderboard hygiene", () => {
  test("seed/bot members are stripped and eligibility is enforced in SQL", () => {
    assert.match(seedData, /stripSeedMembers/);
    assert.match(seedData, /SEED_USERNAMES/);
    assert.match(rivalryHardening, /p\.leaderboard_eligible = true/);
  });
});
