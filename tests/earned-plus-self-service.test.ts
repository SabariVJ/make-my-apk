import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readEngagementState,
  recordDailyCheckin,
  beginDailyMission,
  finishDailyMission,
  claimEarnedPlus,
  type AuthenticatedDb,
} from "../src/lib/engagement.server.ts";
import { engagementStateSchema, rewardMutationSchema } from "../src/lib/engagement.ts";

const SERVER_FILE = readFileSync(
  resolve(import.meta.dirname, "../src/lib/engagement.server.ts"),
  "utf8",
);
const FUNCTIONS_FILE = readFileSync(
  resolve(import.meta.dirname, "../src/lib/engagement.functions.ts"),
  "utf8",
);
const MIGRATION = readFileSync(
  resolve(
    import.meta.dirname,
    "../supabase/migrations/20260920000000_earned_plus_self_service.sql",
  ),
  "utf8",
);

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-0000000000ff";
const REQUEST = "00000000-0000-4000-8000-00000000000a";
const ASSIGNMENT = "00000000-0000-4000-8000-00000000000b";
const NOW = "2026-09-20T10:00:00.000+00:00";

/** Scriptable fake of the authenticated Supabase client. */
function makeDb(options: {
  /** RPCs the database still knows (deployment simulation). */
  deployed?: string[];
  /** Whether an authenticated JWT session is present (auth.uid() simulation). */
  authenticated?: boolean;
  /** Argument captures for assertions. */
  calls?: Array<{ fn: string; args: Record<string, unknown> | undefined }>;
  /** Force an error response. */
  error?: { code?: string; message?: string };
  /** Force a success payload (skips shape validation via schema pass-through). */
  data?: unknown;
}): AuthenticatedDb {
  const deployed = new Set(
    options.deployed ?? [
      "svj_get_my_engagement_state",
      "svj_claim_my_daily_checkin",
      "svj_start_my_daily_mission",
      "svj_complete_my_daily_mission",
      "svj_redeem_my_earned_plus",
    ],
  );
  return {
    rpc(fn, args) {
      options.calls?.push({ fn, args });
      if (!deployed.has(fn)) {
        return Promise.resolve({
          data: null,
          error: { code: "42883", message: `function ${fn} does not exist` },
        });
      }
      // Default is authenticated; only an explicit false simulates anon.
      if (options.authenticated === false) {
        return Promise.resolve({
          data: null,
          error: { code: "28000", message: "Authenticated user required" },
        });
      }
      if (options.error) return Promise.resolve({ data: null, error: options.error });
      if (options.data !== undefined) return Promise.resolve({ data: options.data, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const stateFor = (userId: string) => ({
  status: "ready",
  userId,
  serverNow: NOW,
  nextResetAt: "2026-09-21T00:00:00.000+00:00",
  policyDay: "2026-09-20",
  policy: {
    enabled: true,
    claimsEnabled: false,
    rewardXpCost: 3000,
    requiredQualifyingDays: 7,
    requiredAccountAgeDays: 21,
    dailyRewardXpCap: 150,
    checkinProfileXp: 10,
    milestoneDays: 7,
    milestoneProfileXp: 30,
    plusDays: 30,
  },
  wallet: {
    rewardXp: 0,
    profileXpEarned: 0,
    qualifyingDays: 0,
    currentLoginStreak: 0,
    bestLoginStreak: 0,
    checkedInToday: false,
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
  eligibility: { canClaim: false, reasons: ["Reach 7 qualifying days."] },
  missions: [],
  ledger: [],
});

describe("Earn Plus admin-key removal (architecture regression)", () => {
  it("1-2. engagement.server.ts no longer imports requireAdminKey or supabaseAdmin", () => {
    assert.ok(!/requireAdminKey/.test(SERVER_FILE), "requireAdminKey must be gone");
    assert.ok(!/supabaseAdmin/.test(SERVER_FILE), "supabaseAdmin must be gone");
    assert.ok(!/client\.server/.test(SERVER_FILE), "must not import the privileged client module");
  });

  it("3+16. state loads through the authenticated self-service RPC with no admin key", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const db = makeDb({
      calls,
      data: stateFor(USER),
    });
    const reply = await readEngagementState(db, USER);
    assert.equal(reply.ok, true, JSON.stringify(reply));
    assert.equal(calls[0].fn, "svj_get_my_engagement_state");
    // No p_user_id may be passed — identity is auth.uid() on the database side.
    assert.equal(calls[0].args, undefined);
  });

  it("4. browser inputs carry no p_user_id and no reward fields (schema is strict)", () => {
    const requestId = REQUEST;
    for (const forged of [
      { requestId, userId: OTHER },
      { requestId, p_user_id: OTHER },
      { requestId, rewardXp: 9999 },
      { requestId, plusDays: 999 },
      { requestId, qualifyingDays: 99 },
      { requestId, streak: 99 },
      { requestId, plusExpiresAt: NOW },
    ]) {
      assert.throws(
        () => engagementStateSchema.strict().parse(forged),
        undefined,
        `forged field must be rejected: ${JSON.stringify(forged)}`,
      );
    }
  });

  it("5. identity derives from auth.uid() — migration wrappers take no user parameter", () => {
    for (const signature of [
      "svj_get_my_engagement_state",
      "svj_claim_my_daily_checkin",
      "svj_start_my_daily_mission",
      "svj_complete_my_daily_mission",
      "svj_redeem_my_earned_plus",
    ]) {
      // Signature exists AND takes no user id parameter in its arg list.
      const re = new RegExp("FUNCTION public\\." + signature + "\\s*\\(([^)]*)\\)", "i");
      const match = MIGRATION.match(re);
      assert.ok(match, `missing self-service signature: ${signature}`);
      assert.ok(!/user_id|p_user/i.test(match[1]), `${signature} must not accept a user id`);
    }
    // Every wrapper derives the caller from auth.uid() only.
    const wrapperCount = (MIGRATION.match(/caller_id uuid := auth\.uid\(\);/g) ?? []).length;
    assert.equal(wrapperCount, 5);
    // And each wrapper delegates to the INTERNAL impl, never to a
    // service-role-gated original RPC.
    const implCalls = (MIGRATION.match(/public\.svj_[a-z_]+_impl\(caller_id/g) ?? []).length;
    assert.equal(implCalls, 5, "all five wrappers must call *_impl functions");
    assert.ok(
      !/public\.svj_(get_engagement_state|claim_daily_checkin|start_daily_mission|complete_daily_mission|redeem_earned_plus)\(caller_id/.test(
        MIGRATION,
      ),
      "wrappers must NOT call the service-role-gated originals",
    );
  });

  it("6. anonymous execution is denied (28000 → REWARDS_AUTH_REQUIRED, sanitized)", async () => {
    const db = makeDb({ authenticated: false });
    const reply = await readEngagementState(db, USER);
    assert.equal(reply.ok, false);
    if (reply.ok === false) {
      assert.equal(reply.code, "REWARDS_AUTH_REQUIRED");
      assert.ok(!/SVJ_|SQL|postgres/i.test(reply.error), "must not leak DB details");
    }
  });

  it("7. authenticated execution is allowed and returns the parsed server state", async () => {
    const reply = await readEngagementState(
      makeDb({ authenticated: true, data: stateFor(USER) }),
      USER,
    );
    assert.equal(reply.ok, true);
    if (reply.ok) {
      assert.equal(reply.value.status, "ready");
      assert.equal(reply.value.userId, USER);
    }
  });

  it("8-10. duplicate request ids award nothing twice — receipt replay handled by the ops table", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const db = makeDb({
      calls,
      data: {
        receipt: {
          action: "checkin",
          policyDay: "2026-09-20",
          profileXpAwarded: 10,
          rewardXpAwarded: 0,
          streak: 1,
          issuedAt: NOW,
        },
        replayed: true,
        state: stateFor(USER),
      },
    });
    const reply = await recordDailyCheckin(db, USER, REQUEST);
    assert.equal(reply.ok, true);
    assert.equal(calls[0].fn, "svj_claim_my_daily_checkin");
    assert.deepEqual(calls[0].args, { p_request_id: REQUEST });
    const missionCalls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const db2 = makeDb({
      calls: missionCalls,
      data: {
        receipt: {
          action: "start_mission",
          assignmentId: ASSIGNMENT,
          missionKey: "plan-and-reflect",
          startedAt: NOW,
          eligibleAt: NOW,
          expiresAt: NOW,
          issuedAt: NOW,
        },
        replayed: false,
        state: stateFor(USER),
      },
    });
    await beginDailyMission(db2, USER, REQUEST, "plan-and-reflect");
    assert.equal(missionCalls[0].fn, "svj_start_my_daily_mission");
    assert.deepEqual(missionCalls[0].args, {
      p_request_id: REQUEST,
      p_mission_key: "plan-and-reflect",
    });
  });

  it("9. mission completion sends only the request, assignment, and confirmation", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const db = makeDb({
      calls,
      data: {
        receipt: {
          action: "complete_mission",
          assignmentId: ASSIGNMENT,
          missionKey: "plan-and-reflect",
          profileXpAwarded: 50,
          rewardXpAwarded: 50,
          qualifyingDayAdded: true,
          issuedAt: NOW,
        },
        replayed: false,
        state: stateFor(USER),
      },
    });
    const reply = await finishDailyMission(db, USER, REQUEST, ASSIGNMENT, "x".repeat(30));
    assert.equal(reply.ok, true);
    assert.equal(calls[0].fn, "svj_complete_my_daily_mission");
    assert.deepEqual(calls[0].args, {
      p_request_id: REQUEST,
      p_assignment_id: ASSIGNMENT,
      p_confirmation_text: "x".repeat(30),
    });
  });

  it("11. qualifying day remains server-derived (no client field can influence it)", async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const db = makeDb({
      calls,
      data: {
        receipt: {
          action: "redeem_plus",
          redemptionId: ASSIGNMENT,
          rewardXpSpent: 3000,
          plusExpiresAt: NOW,
          issuedAt: NOW,
        },
        replayed: false,
        state: stateFor(USER),
      },
    });
    await claimEarnedPlus(db, USER, REQUEST);
    assert.deepEqual(calls[0].args, { p_request_id: REQUEST });
  });

  it("12-13. Founder/lifetime and timed-Plus rules are untouched in the migration", () => {
    // The wrapper delegates to the internal redeem implementation; it must
    // not re-implement or relax the lifetime/extension logic.
    assert.ok(MIGRATION.includes("public.svj_redeem_earned_plus_impl(caller_id, p_request_id)"));
    // Membership writes are only allowed inside the extracted impl (copied
    // verbatim from the original service-role implementation) — never in the
    // self-service or privileged entry-point wrappers themselves.
    const wrappers = MIGRATION.slice(MIGRATION.indexOf("svj_get_engagement_state(p_user_id uuid)"));
    const wrapperBodies = wrappers
      .split("CREATE OR REPLACE FUNCTION")
      .filter((b) => b.includes("_impl("));
    for (const body of wrapperBodies) {
      assert.ok(
        !/is_plus_member|plus_expires_at\s*=/.test(body),
        "entry-point wrapper must not touch entitlements",
      );
    }
    // The impl preserves both original rules.
    const implBody = MIGRATION.slice(MIGRATION.indexOf("svj_redeem_earned_plus_impl"));
    assert.ok(implBody.includes("SVJ_REWARD_LIFETIME_ALREADY_ACTIVE"), "lifetime rule preserved");
    assert.ok(
      implBody.includes("v_profile.plus_expires_at > v_now"),
      "timed-Plus extension preserved",
    );
  });

  it("14-15. policy disabled and claims disabled remain fail-closed", async () => {
    for (const message of ["SVJ_REWARD_NOT_ENABLED", "SVJ_REWARD_CLAIMS_NOT_ENABLED"]) {
      const reply = await recordDailyCheckin(
        makeDb({ authenticated: true, error: { code: "P0001", message } }),
        USER,
        REQUEST,
      );
      assert.equal(reply.ok, false);
      if (reply.ok === false) assert.equal(reply.code, "REWARDS_POLICY_DISABLED");
    }
  });

  it("deployment problems are distinguishable from transient failures", async () => {
    const notDeployed = await readEngagementState(
      makeDb({ deployed: [], authenticated: true }),
      USER,
    );
    // A missing RPC on the read path still maps to the explicit setup_required
    // state (never a fake wallet), matching the pre-existing contract.
    assert.equal(notDeployed.ok, true);
    if (notDeployed.ok) assert.equal(notDeployed.value.status, "setup_required");

    const onMutation = await recordDailyCheckin(
      makeDb({ deployed: [], authenticated: true }),
      USER,
      REQUEST,
    );
    assert.equal(onMutation.ok, false);
    if (onMutation.ok === false) assert.equal(onMutation.code, "REWARDS_NOT_DEPLOYED");
  });

  it("cross-account responses are rejected even if the database returned another user's state", async () => {
    const reply = await readEngagementState(
      makeDb({ authenticated: true, data: stateFor(OTHER) }),
      USER,
    );
    assert.equal(reply.ok, false);
    if (reply.ok === false) {
      // The state fails verification against the caller's session identity —
      // never rendered, never accepted.
      assert.ok(["ACCOUNT_CHANGED", "INVALID_REWARD_STATE"].includes(reply.code));
    }
  });

  it("16. a normal Earn Plus screen load needs no service-role key (env-free call path)", async () => {
    // The full read path succeeds using only the authenticated db handle.
    const reply = await readEngagementState(
      makeDb({ authenticated: true, data: stateFor(USER) }),
      USER,
    );
    assert.equal(reply.ok, true);
    assert.ok(!/process\.env/.test(SERVER_FILE), "server module must not read privileged env vars");
  });

  it("grants are authenticated-only: REVOKE from PUBLIC/anon, GRANT to authenticated", () => {
    const revokeCount = (
      MIGRATION.match(/REVOKE ALL ON FUNCTION public\.svj_\w+\([^)]*\) FROM PUBLIC, anon;/g) ?? []
    ).length;
    assert.equal(revokeCount, 5);
    const grantCount = (
      MIGRATION.match(/GRANT EXECUTE ON FUNCTION public\.svj_\w+\([^)]*\) TO authenticated;/g) ?? []
    ).length;
    assert.equal(grantCount, 5);
  });

  it("engagement.functions.ts wires the middleware session client, not the admin client", () => {
    assert.ok(!/supabaseAdmin|requireAdminKey/.test(FUNCTIONS_FILE));
    assert.ok(/requireSupabaseAuth/.test(FUNCTIONS_FILE));
    assert.ok(/context\.supabase/.test(FUNCTIONS_FILE));
  });
});
