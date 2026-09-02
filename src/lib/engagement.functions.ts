import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rewardRequestInput, startMissionInput, completeMissionInput } from "./engagement";

// User ID, rewards, membership dates and all timing come from the verified
// session/database. The browser supplies only a request identity and user input.
export const getEngagementState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readEngagementState } = await import("./engagement.server");
    return readEngagementState(context.userId);
  });

export const claimDailyCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rewardRequestInput.parse(data))
  .handler(async ({ context, data }) => {
    const { recordDailyCheckin } = await import("./engagement.server");
    return recordDailyCheckin(context.userId, data.requestId);
  });

export const startDailyMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startMissionInput.parse(data))
  .handler(async ({ context, data }) => {
    const { beginDailyMission } = await import("./engagement.server");
    return beginDailyMission(context.userId, data.requestId, data.missionKey);
  });

export const completeDailyMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => completeMissionInput.parse(data))
  .handler(async ({ context, data }) => {
    const { finishDailyMission } = await import("./engagement.server");
    return finishDailyMission(context.userId, data.requestId, data.assignmentId, data.confirmation);
  });

export const redeemEarnedPlus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rewardRequestInput.parse(data))
  .handler(async ({ context, data }) => {
    const { claimEarnedPlus } = await import("./engagement.server");
    return claimEarnedPlus(context.userId, data.requestId);
  });
