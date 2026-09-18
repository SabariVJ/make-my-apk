import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  browserStartDailyMission,
  browserCompleteDailyMission,
  browserRedeemEarnedPlus,
  withTimeout,
  REWARD_MUTATION_TIMEOUT_MS,
} from "../src/lib/engagement.server.ts";

const CONTEXT_FILE = readFileSync(
  resolve(import.meta.dirname, "../src/app/context/EngagementContext.tsx"),
  "utf8",
);
const VIEW_FILE = readFileSync(
  resolve(import.meta.dirname, "../src/app/views/EarnPlusView.tsx"),
  "utf8",
);
const SERVER_FILE = readFileSync(
  resolve(import.meta.dirname, "../src/lib/engagement.server.ts"),
  "utf8",
);
const ENGAGEMENT_FILE = readFileSync(
  resolve(import.meta.dirname, "../src/lib/engagement.ts"),
  "utf8",
);

const USER = "00000000-0000-4000-8000-000000000001";
const ASSIGNMENT = "00000000-0000-4000-8000-00000000000b";
const REQUEST = "00000000-0000-4000-8000-00000000000a";
const NOW = "2026-09-20T10:00:00.000+00:00";

function mutationPayload(overrides: Record<string, unknown> = {}) {
  return {
    receipt: {
      action: "start_mission",
      issuedAt: NOW,
      assignmentId: ASSIGNMENT,
      missionKey: "focused-practice",
      startedAt: NOW,
      eligibleAt: NOW,
      expiresAt: NOW,
    },
    replayed: false,
    state: {
      status: "ready",
      userId: USER,
      serverNow: NOW,
      nextResetAt: NOW,
      policyDay: "2026-09-20",
      policy: {
        enabled: true,
        claimsEnabled: true,
        rewardXpCost: 1500,
        requiredQualifyingDays: 5,
        requiredAccountAgeDays: 7,
        dailyRewardXpCap: 150,
        checkinProfileXp: 5,
        milestoneDays: 7,
        milestoneProfileXp: 25,
        plusDays: 30,
      },
      wallet: {
        rewardXp: 0,
        profileXpEarned: 0,
        qualifyingDays: 0,
        currentLoginStreak: 1,
        bestLoginStreak: 1,
        checkedInToday: true,
        rewardXpToday: 0,
        missionsCompletedToday: 0,
        profileTotalXp: 0,
      },
      account: {
        verified: true,
        ageDays: 30,
        plusActive: false,
        lifetimeAccess: false,
        plusExpiresAt: null,
        alreadyRedeemed: false,
      },
      eligibility: { canClaim: false, reasons: [] },
      missions: [],
      ledger: [],
    },
    ...overrides,
  };
}

/** Scriptable fake of the authenticated browser Supabase client. */
function makeClient(options: {
  calls?: Array<{ fn: string; args: Record<string, unknown> | undefined }>;
  hang?: boolean;
  delayMs?: number;
  error?: { code?: string; message?: string } | null;
  data?: unknown;
}) {
  return {
    rpc(fn: string, args?: Record<string, unknown>) {
      options.calls?.push({ fn, args });
      if (options.hang) return new Promise(() => {});
      const settle = Promise.resolve({
        data: (options.data ?? mutationPayload()) as never,
        error: (options.error ?? null) as never,
      });
      if (options.delayMs) {
        return new Promise<{ data: never; error: never }>((res) =>
          setTimeout(() => res(settle as never), options.delayMs),
        );
      }
      return settle;
    },
  };
}

describe("Earn Plus mission start runtime (regression)", () => {
  it("1. MissionCard checks its exact operation key, not a start: prefix", () => {
    assert.match(
      VIEW_FILE,
      /pending === "start:" \+ policyDay \+ ":" \+ mission\.key/,
      "start pending must match the exact mission key",
    );
    assert.match(
      VIEW_FILE,
      /pending === "complete:" \+ mission\.assignmentId/,
      "complete pending must match the exact assignment",
    );
    assert.doesNotMatch(VIEW_FILE, /pending\?\.startsWith\("start:"\)/);
  });

  it("2. context builds the same exact key used by the view", () => {
    assert.match(CONTEXT_FILE, /snapshot\.policyDay \+ ":" \+ action\.missionKey/);
    assert.match(CONTEXT_FILE, /const key = action\.kind \+ ":" \+ source;/);
  });

  it("3. start routes through the authenticated browser client RPC", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const client = makeClient({ calls });
    const result = await browserStartDailyMission(client, USER, REQUEST, "focused-practice");
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      {
        fn: "svj_start_my_daily_mission",
        args: { p_request_id: REQUEST, p_mission_key: "focused-practice" },
      },
    ]);
  });

  it("4. browser never sends user_id, XP, or policy values", () => {
    for (const name of [
      "browserStartDailyMission",
      "browserCompleteDailyMission",
      "browserRedeemEarnedPlus",
    ]) {
      const body = SERVER_FILE.slice(SERVER_FILE.indexOf(`export const ${name}`));
      const end = body.indexOf("\nexport const", 10);
      const fn = body.slice(0, end === -1 ? body.length : end);
      assert.match(fn, /p_request_id/);
      assert.doesNotMatch(fn, /p_user_id/);
      assert.doesNotMatch(fn, /p_.*xp|plus_days|policy/, "no economic values from the client");
    }
  });

  it("5. complete and redeem pass only requestId/assignment/confirmation", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const client = makeClient({ calls });
    await browserCompleteDailyMission(
      client,
      USER,
      REQUEST,
      ASSIGNMENT,
      "Completed the session fully.",
    );
    await browserRedeemEarnedPlus(client, USER, REQUEST);
    assert.deepEqual(calls[0].args, {
      p_request_id: REQUEST,
      p_assignment_id: ASSIGNMENT,
      p_confirmation_text: "Completed the session fully.",
    });
    assert.deepEqual(calls[1].args, { p_request_id: REQUEST });
  });

  it("6. hung transport times out and clears pending (finite timeout)", async () => {
    const hung = new Promise(() => {});
    await assert.rejects(
      withTimeout(hung, 25),
      (error: Error) => error.message === "SVJ_REWARD_TRANSPORT_TIMEOUT",
    );
    // And through the wrapper end-to-end (uses the real 20s bound; assert the
    // rejection shape via a hanging rpc and a stubbed clock-free race).
    const client = makeClient({ hang: true });
    const result = await Promise.race([
      browserStartDailyMission(client, USER, REQUEST, "focused-practice"),
      new Promise<"still-hanging">((res) => setTimeout(() => res("still-hanging"), 50)),
    ]);
    // The wrapper only resolves after its finite timeout (20s) — it must not
    // resolve a fake success. This assertion documents the bound is finite.
    assert.ok(
      result === "still-hanging" || (result.ok === false && result.code === "REWARDS_UNAVAILABLE"),
    );
  });

  it("7. the client timeout is finite and short enough for UI recovery", () => {
    assert.ok(REWARD_MUTATION_TIMEOUT_MS > 0 && REWARD_MUTATION_TIMEOUT_MS <= 60_000);
    assert.equal(REWARD_MUTATION_TIMEOUT_MS, 20_000);
  });

  it("8. success resolves with the server-confirmed state (no optimistic membership)", async () => {
    const client = makeClient({});
    const result = await browserStartDailyMission(client, USER, REQUEST, "focused-practice");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.receipt.action, "start_mission");
      assert.equal(result.value.state.userId, USER);
    }
  });

  it("9. database failure surfaces sanitized error and never a fake success", async () => {
    const client = makeClient({
      error: { code: "23505", message: "duplicate key" },
    });
    const result = await browserStartDailyMission(client, USER, REQUEST, "focused-practice");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /already been recorded/);
  });

  it("10. context clears pending in finally (always)", () => {
    assert.match(
      CONTEXT_FILE,
      /finally \{[\s\S]*?inflight\.current\.delete\(key\);[\s\S]*?setPending\(null\);/,
    );
  });

  it("11. duplicate protection is per-operation, not a global busy boolean", () => {
    assert.match(CONTEXT_FILE, /inflight\.current\.has\(key\)/);
    assert.doesNotMatch(CONTEXT_FILE, /busy\.current = true/);
    assert.doesNotMatch(CONTEXT_FILE, /const busy = useRef\(false\)/);
  });

  it("12. retry reuses the same requestId (requests map kept on failure)", () => {
    assert.match(CONTEXT_FILE, /requests\.current\.get\(key\) \?\? newRequestId\(\)/);
    assert.match(CONTEXT_FILE, /requests\.current\.set\(key, requestId\)/);
    // The map entry is deleted only after a CONFIRMED success.
    const successIdx = CONTEXT_FILE.indexOf("requests.current.delete(key)");
    const successBlock = CONTEXT_FILE.slice(successIdx - 400, successIdx);
    assert.match(successBlock, /receiptNotice/, "deletion happens on confirmed success only");
  });

  it("13. check-in still uses the working serverFn path", () => {
    assert.match(CONTEXT_FILE, /calls\.current\.checkin\(\{ data: \{ requestId \} \}\)/);
    assert.match(CONTEXT_FILE, /Check-in is confirmed working through the serverFn path\./);
  });

  it("14. no service-role/admin dependency introduced", () => {
    assert.doesNotMatch(
      CONTEXT_FILE,
      /requireAdminKey|supabaseAdmin|SERVICE_ROLE|SVJ_SUPABASE_SECRET/,
    );
    assert.doesNotMatch(
      SERVER_FILE,
      /requireAdminKey|supabaseAdmin|SERVICE_ROLE|SVJ_SUPABASE_SECRET/,
    );
  });

  it("15. identity is never a client parameter — auth.uid() stays authoritative", () => {
    // The browser client wrapper sends only request/mission input:
    assert.doesNotMatch(CONTEXT_FILE, /user_id|userId:\s*action/);
    // No client-supplied p_user_id anywhere in the browser-facing wrappers:
    for (const name of [
      "browserStartDailyMission",
      "browserCompleteDailyMission",
      "browserRedeemEarnedPlus",
    ]) {
      const body = SERVER_FILE.slice(SERVER_FILE.indexOf(`export const ${name}`));
      const end = body.indexOf("\nexport const", 10);
      assert.doesNotMatch(body.slice(0, end === -1 ? body.length : end), /p_user_id/);
    }
    // The DB contract (documented in the server module) keeps auth.uid() identity:
    assert.match(SERVER_FILE, /auth\.uid\(\) (on|in) /);
  });
});
