import type { DailyChallenge, UserProfile, UserStats, WorkoutExercise } from "../types";
import { INITIAL_USER, TIERS } from "../data/initialData";

export type SaveResult = { ok: true } | { ok: false; error: string };

export const CHALLENGE_XP: Record<DailyChallenge["difficulty"], number> = {
  Easy: 50,
  Medium: 80,
  Hard: 120,
  Elite: 180,
};

export const CHALLENGE_CATEGORIES: DailyChallenge["category"][] = [
  "Physical",
  "Discipline",
  "Mental",
  "Mindset",
  "Nutrition",
];

const nonNegative = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;

export function getTierForXP(xp: number) {
  return [...TIERS].reverse().find((tier) => xp >= tier.minXP)?.name ?? "Initiate";
}

/** Older device caches may predate stats/history fields. Never spread an absent history. */
export function normalizeUserProfile(value: unknown): UserProfile {
  const saved = value && typeof value === "object" ? (value as Partial<UserProfile>) : {};
  const totalXP = nonNegative(saved.totalXP);
  const stats = Object.fromEntries(
    Object.entries(INITIAL_USER.stats).map(([key, fallback]) => [
      key,
      Math.min(100, nonNegative(saved.stats?.[key as keyof UserStats], fallback)),
    ]),
  ) as unknown as UserStats;
  return {
    ...INITIAL_USER,
    ...saved,
    totalXP,
    weeklyXP: nonNegative(saved.weeklyXP),
    monthlyXP: nonNegative(saved.monthlyXP),
    currentStreak: nonNegative(saved.currentStreak),
    bestStreak: nonNegative(saved.bestStreak),
    totalChallengesCompleted: nonNegative(saved.totalChallengesCompleted),
    daysActive: nonNegative(saved.daysActive),
    tier: getTierForXP(totalXP),
    level: Math.floor(totalXP / 500) + 1,
    isPremium: false,
    stats,
    xpHistory: Array.isArray(saved.xpHistory)
      ? saved.xpHistory.filter((p) => p && typeof p.date === "string" && Number.isFinite(p.xp))
      : [],
    weeklyHistory: Array.isArray(saved.weeklyHistory)
      ? saved.weeklyHistory.filter((p) => p && typeof p.week === "string" && Number.isFinite(p.xp))
      : [],
    badges: Array.isArray(saved.badges) ? saved.badges.filter(Boolean) : INITIAL_USER.badges,
    achievements: Array.isArray(saved.achievements)
      ? saved.achievements.filter(Boolean)
      : INITIAL_USER.achievements,
  };
}

/** Pure calculation: no React setters, storage, network or animation side effects. */
export function applyActivityXp(
  user: UserProfile,
  xp: number,
  now: Date,
  options: { stats?: Partial<UserStats>; challengeDelta?: number } = {},
): UserProfile {
  const delta = Number.isFinite(xp) ? Math.round(xp) : 0;
  const totalXP = Math.max(0, nonNegative(user.totalXP) + delta);
  const date = now.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const history = Array.isArray(user.xpHistory) ? user.xpHistory : [];
  const last = history.at(-1);
  const sameDay = last?.dayKey ? last.dayKey === dayKey : last?.date === date;
  const xpHistory = sameDay
    ? [...history.slice(0, -1), { date, dayKey, xp: Math.max(0, last!.xp + delta) }]
    : [...history, { date, dayKey, xp: Math.max(0, delta) }];
  const stats = { ...INITIAL_USER.stats, ...user.stats };
  for (const [key, change] of Object.entries(options.stats ?? {})) {
    const stat = key as keyof UserStats;
    stats[stat] = Math.max(0, Math.min(100, stats[stat] + change));
  }
  return {
    ...user,
    totalXP,
    weeklyXP: Math.max(0, nonNegative(user.weeklyXP) + delta),
    monthlyXP: Math.max(0, nonNegative(user.monthlyXP) + delta),
    totalChallengesCompleted: Math.max(
      0,
      nonNegative(user.totalChallengesCompleted) + (options.challengeDelta ?? 0),
    ),
    tier: getTierForXP(totalXP),
    level: Math.floor(totalXP / 500) + 1,
    stats,
    xpHistory: xpHistory.slice(-30),
  };
}

export function getChallengeStat(category: DailyChallenge["category"]): keyof UserStats {
  return category === "Physical" || category === "Nutrition"
    ? "physical"
    : category === "Mental" || category === "Mindset"
      ? "mental"
      : "discipline";
}

export function editCustomChallenge(
  challenge: DailyChallenge,
  updates: Pick<DailyChallenge, "title" | "category" | "difficulty">,
  now: Date,
): DailyChallenge | null {
  if (
    !challenge.isCustom ||
    !updates.title.trim() ||
    updates.title.trim().length > 120 ||
    !CHALLENGE_CATEGORIES.includes(updates.category) ||
    !Object.hasOwn(CHALLENGE_XP, updates.difficulty)
  )
    return null;
  // Completed titles remain editable; earned XP/category cannot be rewritten.
  if (
    challenge.completed &&
    (updates.category !== challenge.category || updates.difficulty !== challenge.difficulty)
  )
    return null;
  return {
    ...challenge,
    title: updates.title.trim(),
    category: updates.category,
    difficulty: updates.difficulty,
    xp: challenge.completed ? challenge.xp : CHALLENGE_XP[updates.difficulty],
    updatedAt: now.toISOString(),
  };
}

export function summarizeWorkout(exercises: WorkoutExercise[]) {
  const cleaned = exercises
    .filter((ex) => ex.name.trim())
    .map((ex) => ({
      ...ex,
      name: ex.name.trim(),
      sets: ex.sets.filter((set) => set.reps > 0),
    }));
  const valid =
    cleaned.length > 0 &&
    cleaned.every(
      (ex) =>
        ex.sets.length > 0 &&
        ex.sets.every(
          (set) =>
            Number.isSafeInteger(set.reps) &&
            set.reps > 0 &&
            Number.isFinite(set.weight) &&
            set.weight >= 0,
        ),
    );
  if (!valid) return { valid: false, exercises: cleaned, sets: 0, volume: 0, xp: 0 };
  const sets = cleaned.reduce((sum, ex) => sum + ex.sets.length, 0);
  const volume = cleaned.reduce(
    (sum, ex) => sum + ex.sets.reduce((subtotal, set) => subtotal + set.reps * set.weight, 0),
    0,
  );
  if (!Number.isFinite(volume))
    return { valid: false, exercises: cleaned, sets: 0, volume: 0, xp: 0 };
  return {
    valid: true,
    exercises: cleaned,
    sets,
    volume,
    xp: Math.max(25, Math.min(400, sets * 15 + Math.round(volume / 100))),
  };
}
