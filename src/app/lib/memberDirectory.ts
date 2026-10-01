import type { LeaderboardEntry } from "../types";
import { getTierForXP } from "./activity";

/**
 * The canonical server member shape returned by `svj_list_public_profiles` /
 * `get_friends`. Only these fields exist server-side — anything else a member
 * surface shows must be derived from them, never invented.
 */
export interface DirectoryMember {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_streak: number;
  rank: number;
}

/**
 * Map one server member row onto a leaderboard/compare entry.
 *
 * Identity, lifetime XP, streak and global rank come straight from the
 * database. Tier is DERIVED from lifetime XP (previously every member was
 * rendered as "Initiate" regardless of XP). Fields the directory RPC does not
 * report — weekly/monthly XP, rank movement, country — stay at neutral
 * zero/empty values and are never rendered, so no member can display an
 * invented number.
 */
export function memberToLeaderboardEntry(member: DirectoryMember): LeaderboardEntry {
  const totalXP = finite(member.total_xp);
  return {
    id: member.id,
    username: member.username || member.display_name || "member",
    avatar: member.avatar_url || "",
    totalXP,
    weeklyXP: 0,
    monthlyXP: 0,
    streak: finite(member.current_streak),
    rank: finite(member.rank),
    rankDelta: 0,
    tier: getTierForXP(totalXP),
    country: "",
  };
}

/** True when a leaderboard/directory row is the signed-in account itself. */
export function isSelfEntry(entryId: string, userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.length > 0 && entryId === userId;
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
