import type { UserProfile } from "../types";
import { applyActivityXp } from "./activity";

/**
 * Mirror a cumulative, server-confirmed Profile XP total once. Reward XP never
 * enters this function. Account binding and a monotonic watermark prevent
 * response replays, StrictMode, stale reads and account switches from re-awarding.
 */
export function reconcileEngagementProfile(
  user: UserProfile,
  userId: string,
  earnedProfileXp: number,
  serverNow: string,
): UserProfile {
  if (user.id !== userId || !Number.isSafeInteger(earnedProfileXp) || earnedProfileXp < 0)
    return user;
  const last =
    user.engagementXpUserId === userId &&
    Number.isSafeInteger(user.engagementProfileXp) &&
    (user.engagementProfileXp ?? -1) >= 0
      ? user.engagementProfileXp!
      : 0;
  if (earnedProfileXp < last) return user;
  if (earnedProfileXp === last && user.engagementXpUserId === userId) return user;
  const date = new Date(serverNow);
  if (!Number.isFinite(date.getTime())) return user;
  const delta = earnedProfileXp - last;
  const next = delta > 0 ? applyActivityXp(user, delta, date) : user;
  return { ...next, engagementProfileXp: earnedProfileXp, engagementXpUserId: userId };
}
