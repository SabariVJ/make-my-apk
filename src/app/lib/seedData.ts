// ============================================================================
// Legacy seed-content cleanup.
//
// Early builds shipped fabricated community content: sample members with
// stock-photo avatars, a seeded activity feed and fake reaction counts. Those
// records were cached into localStorage, so removing the seed arrays alone
// made them reappear on every restart. These helpers identify the KNOWN seed
// records by their original provenance — the exact fabricated ids and usernames
// in src/app/data/initialData.ts at the time the seeds shipped — and strip them
// during cache restoration.
//
// Cleanup is deliberately conservative: only records matching a known seed id
// or a known seed username are removed. Real users are never judged by
// appearance, name similarity, low activity or incomplete profiles.
// ============================================================================

/** Fabricated leaderboard/member ids from the original INITIAL_USER and
 *  LEADERBOARD_USERS seed tables (user-1 … user-10 plus the local demo row). */
export const SEED_USER_IDS: ReadonlySet<string> = new Set([
  "user-me",
  "user-1",
  "user-2",
  "user-3",
  "user-4",
  "user-5",
  "user-6",
  "user-7",
  "user-8",
  "user-9",
  "user-10",
]);

/** Fabricated identities seen in production screenshots of the seeded
 *  community. Matched case-insensitively on the exact handle. */
export const SEED_USERNAMES: ReadonlySet<string> = new Set(
  [
    "initiate_svj",
    "vikram_elite",
    "ryu_mastery",
    "marcus_iron",
    "priya_apex",
    "alex_titan",
    "karan_shield",
    "sophia_vanguard",
    "liam_forge",
    "dev_warrior",
    "rafael_steel",
  ].map((name) => name.toLowerCase()),
);

/** Fabricated feed-post ids from the original INITIAL_FEED table. */
export const SEED_FEED_IDS: ReadonlySet<string> = new Set(["feed-1", "feed-2", "feed-3"]);

export function isSeedUserId(id: string | null | undefined): boolean {
  return typeof id === "string" && SEED_USER_IDS.has(id);
}

export function isSeedUsername(username: string | null | undefined): boolean {
  return typeof username === "string" && SEED_USERNAMES.has(username.trim().toLowerCase());
}

export function isSeedFeedId(id: string | null | undefined): boolean {
  return typeof id === "string" && SEED_FEED_IDS.has(id);
}

/** A feed post authored by a known seed account or carrying a seed post id. */
export function isSeedFeedPost(post: {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
}): boolean {
  if (!post) return false;
  return isSeedFeedId(post.id) || isSeedUserId(post.userId) || isSeedUsername(post.username);
}

/** A leaderboard/community row that is a known fabricated member. */
export function isSeedMember(entry: { id?: string | null; username?: string | null }): boolean {
  if (!entry) return false;
  // The local demo row "user-me" only counts as a seed when it keeps its
  // fabricated handle; a real signed-in account keeps whatever id it has.
  if (entry.id === "user-me" && !isSeedUsername(entry.username)) return false;
  if (entry.id !== "user-me" && isSeedUserId(entry.id)) return true;
  return isSeedUsername(entry.username);
}

/** Drop every known seed record from a cached feed array. */
export function stripSeedFeedPosts<
  T extends {
    id?: string | null;
    userId?: string | null;
    username?: string | null;
  },
>(posts: T[] | null | undefined): T[] {
  if (!Array.isArray(posts)) return [];
  return posts.filter((post) => !isSeedFeedPost(post));
}

/** Drop every known fabricated member from a cached directory/leaderboard. */
export function stripSeedMembers<T extends { id?: string | null; username?: string | null }>(
  entries: T[] | null | undefined,
): T[] {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => !isSeedMember(entry));
}
