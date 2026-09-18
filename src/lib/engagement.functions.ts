import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rewardRequestInput, startMissionInput, completeMissionInput } from "./engagement";
import type { AuthenticatedDb } from "./engagement.server";

/** The generated Database-typed client is structurally a superset of the
 *  AuthenticatedDb view; the cast is safe and keeps the wrapper decoupled
 *  from regenerated type unions. */
const asAuthDb = (client: unknown): AuthenticatedDb => client as AuthenticatedDb;

// User ID, rewards, membership dates and all timing come from the verified
// session/database. The browser supplies only a request identity and user
// input. All operations run through the authenticated session client (the
// user's Bearer token), so the database derives identity from auth.uid() —
// no p_user_id can be declared by the client, and no service-role/admin key
// is needed for normal Earn Plus flows.
export const getEngagementState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readEngagementState } = await import("./engagement.server");
    return readEngagementState(asAuthDb(context.supabase), context.userId);
  });

export const claimDailyCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rewardRequestInput.parse(data))
  .handler(async ({ context, data }) => {
    const { recordDailyCheckin } = await import("./engagement.server");
    return recordDailyCheckin(asAuthDb(context.supabase), context.userId, data.requestId);
  });

export const startDailyMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startMissionInput.parse(data))
  .handler(async ({ context, data }) => {
    const { beginDailyMission } = await import("./engagement.server");
    return beginDailyMission(
      asAuthDb(context.supabase),
      context.userId,
      data.requestId,
      data.missionKey,
    );
  });

export const completeDailyMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => completeMissionInput.parse(data))
  .handler(async ({ context, data }) => {
    const { finishDailyMission } = await import("./engagement.server");
    return finishDailyMission(
      asAuthDb(context.supabase),
      context.userId,
      data.requestId,
      data.assignmentId,
      data.confirmation,
    );
  });

export const redeemEarnedPlus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rewardRequestInput.parse(data))
  .handler(async ({ context, data }) => {
    const { claimEarnedPlus } = await import("./engagement.server");
    return claimEarnedPlus(asAuthDb(context.supabase), context.userId, data.requestId);
  });
