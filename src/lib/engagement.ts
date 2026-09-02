import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();

export const rewardRequestInput = z.object({ requestId: uuid }).strict();
export const startMissionInput = rewardRequestInput
  .extend({
    missionKey: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/),
  })
  .strict();
export const completeMissionInput = rewardRequestInput
  .extend({
    assignmentId: uuid,
    confirmation: z.string().trim().min(20).max(500),
  })
  .strict();

export const rewardMissionSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  minimumMinutes: count,
  rewardXp: count,
  profileXp: count,
  assignmentId: uuid.nullable(),
  startedAt: timestamp.nullable(),
  eligibleAt: timestamp.nullable(),
  expiresAt: timestamp.nullable(),
  completedAt: timestamp.nullable(),
  status: z.enum(["available", "running", "ready", "completed", "expired"]),
});

export const activeEngagementSchema = z.object({
  status: z.enum(["ready", "disabled"]),
  userId: uuid,
  serverNow: timestamp,
  nextResetAt: timestamp,
  policyDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  policy: z.object({
    enabled: z.boolean(),
    claimsEnabled: z.boolean(),
    rewardXpCost: count,
    requiredQualifyingDays: count,
    requiredAccountAgeDays: count,
    dailyRewardXpCap: count,
    checkinProfileXp: count,
    milestoneDays: count,
    milestoneProfileXp: count,
    plusDays: count,
  }),
  wallet: z.object({
    rewardXp: count,
    profileXpEarned: count,
    qualifyingDays: count,
    currentLoginStreak: count,
    bestLoginStreak: count,
    checkedInToday: z.boolean(),
    rewardXpToday: count,
    missionsCompletedToday: count,
    profileTotalXp: count,
  }),
  account: z.object({
    verified: z.boolean(),
    ageDays: count,
    plusActive: z.boolean(),
    lifetimeAccess: z.boolean(),
    plusExpiresAt: timestamp.nullable(),
    alreadyRedeemed: z.boolean(),
  }),
  eligibility: z.object({ canClaim: z.boolean(), reasons: z.array(z.string()) }),
  missions: z.array(rewardMissionSchema),
  ledger: z.array(
    z.object({
      id: uuid,
      kind: z.enum([
        "daily_checkin",
        "streak_milestone",
        "mission_completion",
        "earned_plus_redemption",
      ]),
      rewardXpDelta: z.number().int(),
      profileXpDelta: z.number().int(),
      policyDay: z.string(),
      createdAt: timestamp,
    }),
  ),
});

export const engagementStateSchema = z.union([
  activeEngagementSchema,
  z.object({ status: z.literal("setup_required"), userId: uuid, message: z.string() }),
]);

const receiptBase = z.object({ issuedAt: timestamp });
export const rewardReceiptSchema = z.discriminatedUnion("action", [
  receiptBase.extend({
    action: z.literal("checkin"),
    policyDay: z.string(),
    profileXpAwarded: count,
    rewardXpAwarded: z.literal(0),
    streak: count,
  }),
  receiptBase.extend({
    action: z.literal("start_mission"),
    assignmentId: uuid,
    missionKey: z.string(),
    startedAt: timestamp,
    eligibleAt: timestamp,
    expiresAt: timestamp,
  }),
  receiptBase.extend({
    action: z.literal("complete_mission"),
    assignmentId: uuid,
    missionKey: z.string(),
    profileXpAwarded: count,
    rewardXpAwarded: count,
    qualifyingDayAdded: z.boolean(),
  }),
  receiptBase.extend({
    action: z.literal("redeem_plus"),
    redemptionId: uuid,
    rewardXpSpent: count,
    plusExpiresAt: timestamp,
  }),
]);

export const rewardMutationSchema = z.object({
  receipt: rewardReceiptSchema,
  replayed: z.boolean(),
  state: activeEngagementSchema,
});

export type RewardMission = z.infer<typeof rewardMissionSchema>;
export type ActiveEngagementState = z.infer<typeof activeEngagementSchema>;
export type EngagementState = z.infer<typeof engagementStateSchema>;
export type RewardMutation = z.infer<typeof rewardMutationSchema>;
export type RewardReceipt = z.infer<typeof rewardReceiptSchema>;
export type EngagementReply<T> =
  { ok: true; value: T } | { ok: false; error: string; code: string };

export const REWARD_ERRORS: Record<string, string> = {
  SVJ_REWARD_NOT_ENABLED: "Earn Plus is not active yet. Your existing progress is unchanged.",
  SVJ_REWARD_CLAIMS_NOT_ENABLED: "Plus claims have not opened yet. Your Reward XP is safe.",
  SVJ_REWARD_ACCOUNT_NOT_VERIFIED: "Verify your email or phone number before earning rewards.",
  SVJ_REWARD_MISSION_NOT_FOUND: "That mission is no longer available. Refresh your missions.",
  SVJ_REWARD_ASSIGNMENT_NOT_FOUND: "This mission does not belong to this account.",
  SVJ_REWARD_SESSION_NOT_FOUND: "Start this mission before completing it.",
  SVJ_REWARD_MISSION_ALREADY_RUNNING: "Finish your active mission before starting another.",
  SVJ_REWARD_MISSION_ALREADY_COMPLETED: "This mission has already been credited.",
  SVJ_REWARD_TOO_LATE_TODAY:
    "There is not enough time before today's reset. Start after the reset.",
  SVJ_REWARD_SESSION_EXPIRED: "This mission's day has ended. Refresh to see today's missions.",
  SVJ_REWARD_MINIMUM_TIME_NOT_MET: "The minimum mission time has not elapsed on the server.",
  SVJ_REWARD_DAILY_CAP_REACHED: "You have reached today's Reward XP limit.",
  SVJ_REWARD_CONFIRMATION_REQUIRED: "Describe what you completed in 20–500 characters.",
  SVJ_REWARD_ACCOUNT_TOO_NEW: "Your account has not reached the required age yet.",
  SVJ_REWARD_QUALIFYING_DAYS_REQUIRED: "Complete missions on more qualifying days before claiming.",
  SVJ_REWARD_XP_REQUIRED: "You need more Reward XP before claiming Plus.",
  SVJ_REWARD_ALREADY_REDEEMED: "This launch reward has already been claimed by this account.",
  SVJ_REWARD_LIFETIME_ALREADY_ACTIVE: "Lifetime access is already active. No XP was spent.",
  SVJ_REWARD_LEDGER_MISMATCH: "Your reward receipts need review. No XP was spent.",
  SVJ_REWARD_REQUEST_REUSED: "This request belongs to a different action. Refresh and try again.",
  SVJ_REWARD_PROFILE_NOT_FOUND: "Your profile could not be found. Refresh your sign-in.",
  SVJ_REWARD_ACCOUNT_NOT_FOUND: "Your account could not be verified. Sign in again.",
};

export function isActiveEngagement(
  state: EngagementState | undefined,
): state is ActiveEngagementState {
  return state?.status === "ready" || state?.status === "disabled";
}

/** Uses a server time snapshot plus elapsed monotonic time, not the device clock. */
export function rewardSecondsRemaining(target: string | null, serverNowMs: number): number {
  if (!target || !Number.isFinite(serverNowMs)) return 0;
  return Math.max(0, Math.ceil((Date.parse(target) - serverNowMs) / 1000));
}

export function formatRewardDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return hours > 0
    ? String(hours) + "h " + String(minutes) + "m"
    : String(minutes).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0");
}
