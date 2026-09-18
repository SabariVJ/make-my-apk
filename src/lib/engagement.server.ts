import type { z } from "zod";
import {
  engagementStateSchema,
  rewardMutationSchema,
  REWARD_ERRORS,
  type EngagementReply,
  type EngagementState,
  type RewardMutation,
} from "./engagement";

// ─────────────────────────────────────────────────────────────────────────────
// Earn Plus data access — authenticated self-service RPCs only.
//
// Identity is NEVER taken from the browser or from a p_user_id argument: every
// RPC below derives the caller from auth.uid() on the database side (the
// middleware client sends the user's Bearer token). No service-role/admin key
// is required or used for normal Earn Plus operations.
//
// RPC contract (supabase/migrations/20260920000000_earned_plus_self_service.sql):
//   svj_get_my_engagement_state()
//   svj_claim_my_daily_checkin(p_request_id uuid)
//   svj_start_my_daily_mission(p_request_id uuid, p_mission_key text)
//   svj_complete_my_daily_mission(p_request_id uuid, p_assignment_id uuid, p_confirmation_text text)
//   svj_redeem_my_earned_plus(p_request_id uuid)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal structural view of a Supabase client's rpc() — any generated
 *  Database-typed client satisfies this; the loose fn name keeps the wrapper
 *  usable before the new RPCs appear in generated types. */
export interface AuthenticatedDb {
  rpc: <R = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: R; error: { code?: string; message?: string } | null }>;
}

type KnownErrorCode =
  | "PGRST202" // RPC not in schema cache — deployment problem
  | "42883" // function does not exist — deployment problem
  | "42501" // insufficient privilege (e.g. anon without EXECUTE)
  | "28000" // invalid authorization (unauthenticated call inside RPC)
  | "42P01" // relation missing — deployment problem
  | (string & {});

export type RewardFailureCode =
  | "REWARDS_NOT_DEPLOYED"
  | "REWARDS_AUTH_REQUIRED"
  | "REWARDS_POLICY_DISABLED"
  | "REWARDS_UNAVAILABLE"
  | "INVALID_REWARD_STATE"
  | "ACCOUNT_CHANGED";

const POLICY_DISABLED_CODES = new Set(["SVJ_REWARD_NOT_ENABLED", "SVJ_REWARD_CLAIMS_NOT_ENABLED"]);

/** Map a database failure to a sanitized, internally distinguishable code. */
function classifyError(error: { code?: string; message?: string }): {
  error: string;
  code: RewardFailureCode;
} {
  const dbCode = (error.code ?? "") as KnownErrorCode;
  const message = error.message ?? "";

  // An obvious deployment problem must not masquerade as a network blurb.
  if (dbCode === "PGRST202" || dbCode === "42883" || dbCode === "42P01") {
    console.error("[SVJ rewards] Earn Plus RPCs are not deployed", { code: dbCode });
    return {
      error: "Earn Plus is not active yet. Please update the app or try again later.",
      code: "REWARDS_NOT_DEPLOYED",
    };
  }
  if (dbCode === "28000" || /Authenticated user required/i.test(message)) {
    return {
      error: "Your session has expired. Please sign in again.",
      code: "REWARDS_AUTH_REQUIRED",
    };
  }
  if (POLICY_DISABLED_CODES.has(message)) {
    return {
      error: REWARD_ERRORS[message] ?? "Earn Plus is currently disabled.",
      code: "REWARDS_POLICY_DISABLED",
    };
  }
  const known = REWARD_ERRORS[message];
  if (known) return { error: known, code: "REWARDS_POLICY_DISABLED" };
  if (dbCode === "23505") {
    return {
      error: "This action has already been recorded. Refresh to load the confirmed receipt.",
      code: "INVALID_REWARD_STATE",
    };
  }
  // Never serialize database details, credentials, or SQL to the browser.
  console.error("[SVJ rewards] Database request failed", { code: error.code ?? "unknown" });
  return {
    error: "Rewards are temporarily unavailable. Your confirmed progress is safe; try again.",
    code: "REWARDS_UNAVAILABLE",
  };
}

async function runRpc<T>(
  db: AuthenticatedDb,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
  userId: string,
): Promise<EngagementReply<T>> {
  try {
    const { data, error } = await db.rpc(name, args);
    if (error) return { ok: false, ...classifyError(error) };
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      console.error("[SVJ rewards] Response shape validation failed", { rpc: name });
      return {
        ok: false,
        error: "Reward data could not be verified. Please refresh.",
        code: "INVALID_REWARD_STATE",
      };
    }
    const state =
      "state" in (parsed.data as Record<string, unknown>)
        ? (parsed.data as RewardMutation).state
        : (parsed.data as EngagementState);
    if (state.userId !== userId) {
      return {
        ok: false,
        error: "The reward account changed. Please sign in again.",
        code: "ACCOUNT_CHANGED",
      };
    }
    return { ok: true, value: parsed.data };
  } catch {
    return {
      ok: false,
      error: "The rewards server could not be reached. Please try again.",
      code: "REWARDS_UNAVAILABLE",
    };
  }
}

export async function readEngagementState(
  db: AuthenticatedDb,
  userId: string,
): Promise<EngagementReply<EngagementState>> {
  try {
    const { data, error } = await db.rpc("svj_get_my_engagement_state");
    // A pending rollout is explicit, not a fake wallet with a fabricated zero balance.
    if (error && ["PGRST202", "42P01", "42883"].includes(error.code ?? "")) {
      return {
        ok: true,
        value: {
          status: "setup_required",
          userId,
          message: "Earn Plus is built, but its database setup has not been activated yet.",
        },
      };
    }
    if (error) return { ok: false, ...classifyError(error) };
    const parsed = engagementStateSchema.safeParse(data);
    if (!parsed.success || parsed.data.userId !== userId) {
      return {
        ok: false,
        error: "Reward data could not be verified. Please refresh.",
        code: "INVALID_REWARD_STATE",
      };
    }
    return { ok: true, value: parsed.data };
  } catch {
    return {
      ok: false,
      error: "The rewards server could not be reached. Please try again.",
      code: "REWARDS_UNAVAILABLE",
    };
  }
}

export const recordDailyCheckin = (db: AuthenticatedDb, userId: string, requestId: string) =>
  runRpc(
    db,
    "svj_claim_my_daily_checkin",
    { p_request_id: requestId },
    rewardMutationSchema,
    userId,
  );

export const beginDailyMission = (
  db: AuthenticatedDb,
  userId: string,
  requestId: string,
  missionKey: string,
) =>
  runRpc(
    db,
    "svj_start_my_daily_mission",
    { p_request_id: requestId, p_mission_key: missionKey },
    rewardMutationSchema,
    userId,
  );

export const finishDailyMission = (
  db: AuthenticatedDb,
  userId: string,
  requestId: string,
  assignmentId: string,
  confirmation: string,
) =>
  runRpc(
    db,
    "svj_complete_my_daily_mission",
    { p_request_id: requestId, p_assignment_id: assignmentId, p_confirmation_text: confirmation },
    rewardMutationSchema,
    userId,
  );

export const claimEarnedPlus = (db: AuthenticatedDb, userId: string, requestId: string) =>
  runRpc(
    db,
    "svj_redeem_my_earned_plus",
    { p_request_id: requestId },
    rewardMutationSchema,
    userId,
  );
