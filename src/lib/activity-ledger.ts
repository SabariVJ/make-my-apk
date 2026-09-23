export const ACTIVITY_EVENT_TYPES = [
  "challenge_completion",
  "workout",
  "focus_session",
  "meal_log",
  "recovery_action",
  "xp_award",
  "stat_change",
  "rivalry_contribution",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export const ACTIVITY_SOURCE_CLASSES = [
  "svj_verified",
  "svj_personalized",
  "sixty_day",
  "user_created",
  "workout",
  "focus",
  "nutrition",
  "recovery",
  "system",
] as const;

export type ActivitySourceClass = (typeof ACTIVITY_SOURCE_CLASSES)[number];

export interface ActivityEventIdentity {
  eventType: ActivityEventType;
  sourceClass: ActivitySourceClass;
  sourceId: string;
  requestId: string;
}

/**
 * Stable identity used by trusted server mutations. It deliberately contains
 * no XP/stat amount: reward values are derived by server policy.
 */
export function buildActivityEventKey(identity: ActivityEventIdentity): string {
  const sourceId = identity.sourceId.trim();
  const requestId = identity.requestId.trim();
  if (!sourceId || !requestId) throw new Error("Activity source and request IDs are required.");
  if (sourceId.length > 200 || requestId.length > 200) {
    throw new Error("Activity identity is too long.");
  }
  return `${identity.eventType}:${identity.sourceClass}:${sourceId}:${requestId}`;
}
