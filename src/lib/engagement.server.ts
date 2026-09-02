import type { z } from "zod";
import { requireAdminKey, supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  engagementStateSchema,
  rewardMutationSchema,
  REWARD_ERRORS,
  type EngagementReply,
  type EngagementState,
  type RewardMutation,
} from "./engagement";
import type { Database } from "@/integrations/supabase/types";

type RpcName =
  | "svj_get_engagement_state"
  | "svj_claim_daily_checkin"
  | "svj_start_daily_mission"
  | "svj_complete_daily_mission"
  | "svj_redeem_earned_plus";

function safeError(error: { code?: string; message?: string }): { error: string; code: string } {
  const message = error.message ?? "";
  const known = REWARD_ERRORS[message];
  if (known) return { error: known, code: message };
  if (error.code === "23505") {
    return {
      error: "This action has already been recorded. Refresh to load the confirmed receipt.",
      code: "ALREADY_RECORDED",
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
  name: RpcName,
  args: Database["public"]["Functions"][RpcName]["Args"],
  schema: z.ZodType<T>,
  userId: string,
): Promise<EngagementReply<T>> {
  try {
    requireAdminKey();
    const { data, error } = await supabaseAdmin.rpc(name, args);
    if (error) return { ok: false, ...safeError(error) };
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
      name === "svj_get_engagement_state"
        ? (parsed.data as EngagementState)
        : (parsed.data as RewardMutation).state;
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
  userId: string,
): Promise<EngagementReply<EngagementState>> {
  try {
    requireAdminKey();
    const { data, error } = await supabaseAdmin.rpc("svj_get_engagement_state", {
      p_user_id: userId,
    });
    // A pending rollout is explicit, not a fake wallet with a fabricated zero balance.
    if (error && ["PGRST202", "42P01", "42883"].includes(error.code)) {
      return {
        ok: true,
        value: {
          status: "setup_required",
          userId,
          message: "Earn Plus is built, but its database setup has not been activated yet.",
        },
      };
    }
    if (error) return { ok: false, ...safeError(error) };
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

export const recordDailyCheckin = (userId: string, requestId: string) =>
  runRpc(
    "svj_claim_daily_checkin",
    { p_user_id: userId, p_request_id: requestId },
    rewardMutationSchema,
    userId,
  );

export const beginDailyMission = (userId: string, requestId: string, missionKey: string) =>
  runRpc(
    "svj_start_daily_mission",
    {
      p_user_id: userId,
      p_request_id: requestId,
      p_mission_key: missionKey,
    },
    rewardMutationSchema,
    userId,
  );

export const finishDailyMission = (
  userId: string,
  requestId: string,
  assignmentId: string,
  confirmation: string,
) =>
  runRpc(
    "svj_complete_daily_mission",
    {
      p_user_id: userId,
      p_request_id: requestId,
      p_assignment_id: assignmentId,
      p_confirmation_text: confirmation,
    },
    rewardMutationSchema,
    userId,
  );

export const claimEarnedPlus = (userId: string, requestId: string) =>
  runRpc(
    "svj_redeem_earned_plus",
    { p_user_id: userId, p_request_id: requestId },
    rewardMutationSchema,
    userId,
  );
