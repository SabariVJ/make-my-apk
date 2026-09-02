import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import confetti from "canvas-confetti";
import { Capacitor } from "@capacitor/core";
import {
  UserProfile,
  UserStats,
  DailyChallenge,
  FeedActivity,
  LeaderboardEntry,
  RewardItem,
  ReactionType,
  TierLevel,
  WorkoutEntry,
  WorkoutTemplate,
  WorkoutExercise,
  MealEntry,
} from "../types";
import {
  INITIAL_USER,
  INITIAL_CHALLENGES,
  INITIAL_FEED,
  LEADERBOARD_USERS,
  INITIAL_REWARDS,
  TIERS,
} from "../data/initialData";
import { supabase } from "@/integrations/supabase/client";
import {
  applyActivityXp,
  CHALLENGE_XP,
  CHALLENGE_CATEGORIES,
  editCustomChallenge,
  getChallengeStat,
  getTierForXP,
  normalizeUserProfile,
  summarizeWorkout,
  type SaveResult,
} from "../lib/activity";
import { appStorage, readStoredArray, readStoredJson, writeStoredJson } from "../lib/storage";

interface SVJContextType {
  user: UserProfile;
  /** True once the user profile has been synced from localStorage or Supabase
   *  auth — prevents a flash of INITIAL_USER while the session is loading. */
  profileLoaded: boolean;
  storageError: string | null;
  /** Server-authoritative: whether the user has a Plus membership row. */
  isPlusMember: boolean | null;
  /** Server-authoritative: ISO expiry timestamp for timed Plus, null for lifetime. */
  plusExpiresAt: string | null;
  challenges: DailyChallenge[];
  feed: FeedActivity[];
  leaderboard: LeaderboardEntry[];
  rewards: RewardItem[];
  workouts: WorkoutEntry[];
  workoutTemplates: WorkoutTemplate[];
  meals: MealEntry[];
  calorieGoal: number;
  comparingMember: LeaderboardEntry | null;
  selectedMemberModal: LeaderboardEntry | null;
  levelUpModalData: { oldTier: TierLevel; newTier: TierLevel } | null;
  isPaywallOpen: boolean;
  isEditProfileOpen: boolean;
  isUPIModalOpen: boolean;
  isFirstTimeOnboardingOpen: boolean;
  isGoogleAuthModalOpen: boolean;

  // Actions
  toggleChallenge: (id: string) => SaveResult;
  /** Apply a server-confirmed XP grant to the user's profile (60-day challenge). */
  awardXp: (xp: number) => void;
  addCustomChallenge: (
    title: string,
    category: DailyChallenge["category"],
    difficulty: DailyChallenge["difficulty"],
  ) => SaveResult;
  updateCustomChallenge: (
    id: string,
    updates: Pick<DailyChallenge, "title" | "category" | "difficulty">,
  ) => SaveResult;
  removeChallenge: (id: string) => void;
  toggleReaction: (activityId: string, reaction: ReactionType) => void;
  addComment: (activityId: string, text: string) => void;
  redeemReward: (rewardId: string) => void;
  logWorkout: (name: string, exercises: WorkoutExercise[]) => SaveResult;
  deleteWorkout: (id: string) => void;
  saveWorkoutTemplate: (name: string, exercises: WorkoutExercise[]) => void;
  deleteWorkoutTemplate: (id: string) => void;
  logMeal: (name: string, calories: number, mealType: MealEntry["mealType"]) => SaveResult;
  deleteMeal: (id: string) => void;
  setCalorieGoal: (goal: number) => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  completeOnboarding: (data: {
    name: string;
    username: string;
    bio: string;
    location: string;
    avatar: string;
  }) => void;
  loginWithGmail: (email: string, name?: string, avatar?: string) => void;
  logoutGmail: () => void;
  setComparingMember: (member: LeaderboardEntry | null) => void;
  setSelectedMemberModal: (member: LeaderboardEntry | null) => void;
  setLevelUpModalData: (data: { oldTier: TierLevel; newTier: TierLevel } | null) => void;
  setIsPaywallOpen: (open: boolean) => void;
  setIsEditProfileOpen: (open: boolean) => void;
  setIsUPIModalOpen: (open: boolean) => void;
  setIsFirstTimeOnboardingOpen: (open: boolean) => void;
  setIsGoogleAuthModalOpen: (open: boolean) => void;
  triggerConfetti: () => void;
}

const SVJContext = createContext<SVJContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "svj_app_state_v5";

/**
 * localStorage has a hard per-origin quota (~5MB). Large payloads (e.g. base64
 * avatars stored on leaderboard/feed rows) can blow past it and throw
 * QuotaExceededError, which would otherwise crash the React render. Persisting
 * is a cache, never the source of truth, so failures are swallowed.
 */
const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    try {
      // Free space by dropping the largest, most disposable caches first.
      localStorage.removeItem(`${LOCAL_STORAGE_KEY}_leaderboard`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY}_feed`);
      localStorage.setItem(key, value);
    } catch {
      /* out of space — skip persisting this slice */
    }
  }
};

/** Drop inline base64 images so cached rows stay small. */
const slimAvatar = (avatar?: string) =>
  typeof avatar === "string" && avatar.startsWith("data:") ? "" : avatar;

const MAX_CACHED_ROWS = 100;

export const SVJProvider: React.FC<{
  children: React.ReactNode;
  /** Server-authoritative Plus status from TrialGate (null = unknown/signed out). */
  plusActive?: boolean | null;
  /** Server-authoritative: whether the user has a Plus membership row. */
  isPlusMember?: boolean | null;
  /** Server-authoritative: ISO expiry timestamp for timed Plus, null for lifetime. */
  plusExpiresAt?: string | null;
}> = ({
  children,
  plusActive = null,
  isPlusMember: isPlusMemberProp = null,
  plusExpiresAt: plusExpiresAtProp = null,
}) => {
  const [storageError, setStorageError] = useState<string | null>(null);
  const persist = useCallback((key: string, value: unknown): SaveResult => {
    const result = writeStoredJson(key, value);
    if (!result.ok) setStorageError(result.error);
    return result;
  }, []);

  const [user, setUser] = useState<UserProfile>(() =>
    normalizeUserProfile(readStoredJson(`${LOCAL_STORAGE_KEY}_user`, INITIAL_USER)),
  );

  const [challenges, setChallenges] = useState<DailyChallenge[]>(() => {
    const removed = readStoredArray<string>(`${LOCAL_STORAGE_KEY}_removed_challenges`, []);
    return readStoredArray<DailyChallenge>(
      `${LOCAL_STORAGE_KEY}_challenges`,
      INITIAL_CHALLENGES,
    ).filter((challenge) => !removed.includes(challenge.id));
  });

  const [feed, setFeed] = useState<FeedActivity[]>(() => {
    const saved = appStorage.getItem(`${LOCAL_STORAGE_KEY}_feed`);
    if (!saved) return INITIAL_FEED;
    try {
      const parsed = readStoredArray<FeedActivity>(`${LOCAL_STORAGE_KEY}_feed`, INITIAL_FEED);
      const seenIds = new Set<string>();
      return parsed.map((item, idx) => {
        if (!item.id || seenIds.has(item.id)) {
          const uniqueId = `feed-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
          seenIds.add(uniqueId);
          return { ...item, id: uniqueId };
        }
        seenIds.add(item.id);
        return item;
      });
    } catch {
      return INITIAL_FEED;
    }
  });

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    return readStoredArray<LeaderboardEntry>(
      `${LOCAL_STORAGE_KEY}_leaderboard`,
      import.meta.env.DEV ? LEADERBOARD_USERS : [],
    );
  });

  const [rewards, setRewards] = useState<RewardItem[]>(() => {
    return readStoredArray<RewardItem>(`${LOCAL_STORAGE_KEY}_rewards`, INITIAL_REWARDS);
  });

  const [workouts, setWorkouts] = useState<WorkoutEntry[]>(() => {
    return readStoredArray<WorkoutEntry>(`${LOCAL_STORAGE_KEY}_workouts`, []);
  });

  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>(() => {
    return readStoredArray<WorkoutTemplate>(`${LOCAL_STORAGE_KEY}_workout_templates`, []);
  });

  const [meals, setMeals] = useState<MealEntry[]>(() => {
    return readStoredArray<MealEntry>(`${LOCAL_STORAGE_KEY}_meals`, []);
  });

  const [calorieGoal, setCalorieGoalState] = useState<number>(() => {
    const saved = appStorage.getItem(`${LOCAL_STORAGE_KEY}_calorie_goal`);
    const value = Number(saved);
    return Number.isFinite(value) && value >= 500 && value <= 10000 ? value : 2200;
  });

  const [comparingMember, setComparingMember] = useState<LeaderboardEntry | null>(null);
  const [selectedMemberModal, setSelectedMemberModal] = useState<LeaderboardEntry | null>(null);
  const [levelUpModalData, setLevelUpModalData] = useState<{
    oldTier: TierLevel;
    newTier: TierLevel;
  } | null>(null);
  const [isPaywallOpen, setIsPaywallOpen] = useState<boolean>(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [isUPIModalOpen, setIsUPIModalOpen] = useState<boolean>(false);
  const [isFirstTimeOnboardingOpen, setIsFirstTimeOnboardingOpen] = useState<boolean>(false);
  const [isGoogleAuthModalOpen, setIsGoogleAuthModalOpen] = useState<boolean>(false);

  // Tracks whether the user profile has been synced from localStorage or the
  // Supabase session. While false the app shows a splash instead of rendering
  // INITIAL_USER as if it were the real authenticated user.
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);

  // Auto-restore active Gmail account from localStorage cache.
  // Only marks profileLoaded when data was actually restored — the auth-sync
  // effect handles the cross-device case where localStorage is empty.
  useEffect(() => {
    const activeEmail = appStorage.getItem(`${LOCAL_STORAGE_KEY}_active_email`);
    if (activeEmail) {
      const savedAcc = appStorage.getItem(`svj_user_account_${activeEmail.toLowerCase()}`);
      if (savedAcc) {
        try {
          const parsed = normalizeUserProfile(JSON.parse(savedAcc));
          setUser(parsed);
          setProfileLoaded(true);
        } catch (e) {
          console.error(e);
        }
      }
    }

    // Safety net: if profileLoaded is still false after the localStorage
    // check, verify whether there's a Supabase session.  When there ISN'T,
    // the user is unauthenticated and TrialGate will show AuthScreen —
    // mark profileLoaded so the AppContent splash guard doesn't get stuck.
    // When there IS a session, the auth-sync effect below will call
    // setProfileLoaded once the server profile lookup finishes.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session) setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
  }, []);

  // ── Unified auth sync ─────────────────────────────────────────────────────
  // Subscribe to Supabase auth events at the context level so that
  // loginWithGmail() is called for EVERY sign-in path — not just when the
  // GoogleAuthModal happens to be open.  Without this, signing in from
  // AuthScreen's "Continue with Google" button establishes the Supabase
  // session but never syncs the user profile into the app state, leaving
  // the user stuck on INITIAL_USER ("New Voyager", 0 XP, no email).
  //
  // This handles SIGNED_IN (new OAuth), INITIAL_SESSION (stored session on
  // app boot), and TOKEN_REFRESHED — any event that carries a session with
  // a user email triggers the sync.
  //
  // Cross-device: when localStorage has no cached profile, the effect
  // queries the Supabase profiles table (RLS allows authenticated SELECT
  // on own row) to restore server-persisted XP, streak, username, etc.
  const syncedEmailRef = useRef<string | null>(null);
  const loginWithGmailRef = useRef<
    (
      email: string,
      name?: string,
      avatar?: string,
      userId?: string,
      serverProfile?: {
        id: string;
        total_xp: number;
        current_streak: number;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
        is_plus_member: boolean;
      } | null,
    ) => void
  >(() => {});

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const sessionEmail = session?.user?.email;
      if (!sessionEmail) return;
      const lower = sessionEmail.toLowerCase();
      // Skip if we already synced this email (prevents redundant calls
      // when GoogleAuthModal's own listener also handles the same event).
      if (syncedEmailRef.current === lower) return;
      syncedEmailRef.current = lower;

      // Check whether we already have a cached profile for this email.
      const hasLocalProfile = appStorage.getItem(`svj_user_account_${lower}`) !== null;

      // Cross-device: if localStorage is empty, query the server profile
      // so we can restore XP, streak, username, etc. from the database
      // instead of falling back to INITIAL_USER.
      let serverProfile: {
        id: string;
        total_xp: number;
        current_streak: number;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
        is_plus_member: boolean;
      } | null = null;

      if (!hasLocalProfile) {
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select(
              "id, total_xp, current_streak, username, display_name, avatar_url, is_plus_member",
            )
            .eq("id", session.user.id)
            .maybeSingle();
          if (!error && data) {
            serverProfile = data;
          }
        } catch (e) {
          console.error("[SVJ] Failed to fetch server profile for cross-device restore:", e);
        }
      }

      loginWithGmailRef.current(
        sessionEmail,
        session.user.user_metadata?.full_name as string | undefined,
        session.user.user_metadata?.avatar_url as string | undefined,
        session.user.id,
        serverProfile,
      );

      // Mark profile as loaded so the splash disappears and the real app renders.
      setProfileLoaded(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Server-authoritative Plus state: mirror the server status in BOTH directions.
  // When the authenticated session loads or refreshes, TrialGate refetches the
  // server status and feeds plusActive down — an expired Plus flips isPremium
  // back to false, an active one flips it to true.
  useEffect(() => {
    if (plusActive === null) return;
    setUser((prev) => (prev.isPremium === plusActive ? prev : { ...prev, isPremium: plusActive }));
  }, [plusActive]);

  // Sync user state to local storage and sync user entry on the global leaderboard
  useEffect(() => {
    // Persist everything EXCEPT Plus status: isPremium is only ever derived from
    // the server-side check (plusActive), so localStorage can never keep an
    // expired user looking Premium.
    const persisted = { ...user, isPremium: false };
    safeSetItem(`${LOCAL_STORAGE_KEY}_user`, JSON.stringify(persisted));
    if (user.email) {
      safeSetItem(
        `svj_user_account_${user.email.toLowerCase()}`,
        JSON.stringify(persisted),
      );
    }

    setLeaderboard((prev) => {
      const userIndex = prev.findIndex((item) => item.id === user.id || item.id === "user-me");
      if (userIndex !== -1) {
        const updated = [...prev];
        updated[userIndex] = {
          ...updated[userIndex],
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          tier: user.tier,
          totalXP: user.totalXP,
          weeklyXP: user.weeklyXP,
          monthlyXP: user.monthlyXP,
          streak: user.currentStreak,
          isVerified: user.verifiedIcon,
          isVIP: user.vipIcon,
          isFounder: user.isFounder,
          isOwner: user.isOwner,
          bio: user.bio,
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            rank: prev.length + 1,
            rankDelta: 0,
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            tier: user.tier,
            totalXP: user.totalXP,
            weeklyXP: user.weeklyXP,
            monthlyXP: user.monthlyXP,
            streak: user.currentStreak,
            country: "US",
            isVerified: user.verifiedIcon,
            isVIP: user.vipIcon,
            isFounder: user.isFounder,
            isOwner: user.isOwner,
            bio: user.bio,
          },
        ];
      }
    });
  }, [user, persist]);

  useEffect(() => {
    safeSetItem(`${LOCAL_STORAGE_KEY}_challenges`, JSON.stringify(challenges));
  }, [challenges]);

  useEffect(() => {
    safeSetItem(`${LOCAL_STORAGE_KEY}_feed`, JSON.stringify(feed.slice(0, MAX_CACHED_ROWS)));
  }, [feed]);

  useEffect(() => {
    const slim = leaderboard
      .slice(0, MAX_CACHED_ROWS)
      .map((entry) => ({ ...entry, avatar: slimAvatar(entry.avatar) }));
    safeSetItem(`${LOCAL_STORAGE_KEY}_leaderboard`, JSON.stringify(slim));
  }, [leaderboard]);

  useEffect(() => {
    safeSetItem(`${LOCAL_STORAGE_KEY}_rewards`, JSON.stringify(rewards));
  }, [rewards]);

  useEffect(() => {
    safeSetItem(`${LOCAL_STORAGE_KEY}_workouts`, JSON.stringify(workouts));
  }, [workouts]);

  useEffect(() => {
    safeSetItem(
      `${LOCAL_STORAGE_KEY}_workout_templates`,
      JSON.stringify(workoutTemplates),
    );
  }, [workoutTemplates]);

  useEffect(() => {
    safeSetItem(`${LOCAL_STORAGE_KEY}_meals`, JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    safeSetItem(`${LOCAL_STORAGE_KEY}_calorie_goal`, String(calorieGoal));
  }, [calorieGoal]);

  const triggerConfetti = () => {
    if (Capacitor.isNativePlatform()) return;
    // Celebration must never turn a successful save into a failed page.
    try {
      const animation = confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#C81E3A", "#D4AF37", "#F4F2ED", "#E62846"],
        disableForReducedMotion: true,
      });
      void animation?.catch(() => {});
    } catch {
      /* Canvas may be unavailable in an embedded browser. */
    }
  };

  // React may replay state updaters. Notify only after a committed tier change.
  const previousTier = useRef({ id: user.id, tier: user.tier, xp: user.totalXP });
  useEffect(() => {
    const previous = previousTier.current;
    previousTier.current = { id: user.id, tier: user.tier, xp: user.totalXP };
    if (
      previous.id === user.id &&
      user.totalXP > previous.xp &&
      TIERS.findIndex((t) => t.name === user.tier) >
        TIERS.findIndex((t) => t.name === previous.tier)
    ) {
      setLevelUpModalData({ oldTier: previous.tier, newTier: user.tier });
    }
  }, [user.id, user.tier, user.totalXP]);

  // This only mirrors grants already confirmed by the 60-day server endpoint.
  // Ordinary device-only activity XP is not eligible for membership redemption.
  const awardXp = (xp: number) => {
    if (!Number.isFinite(xp) || xp <= 0) return;
    const now = new Date();
    setUser((previous) => applyActivityXp(previous, xp, now));
  };

  const addActivity = (title: string, details: string, xpEarned: number) => {
    const item: FeedActivity = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      userAvatar: user.avatar,
      userTier: user.tier,
      isVerified: user.verifiedIcon,
      isVIP: user.vipIcon,
      actionType: "completed_challenge",
      title,
      details,
      xpEarned,
      timestamp: "Just now",
      reactions: { fire: 0, crown: 0, hundred: 0, bolt: 0, wolf: 0 },
      userReactions: {},
      comments: [],
    };
    setFeed((previous) => [item, ...previous]);
  };

  const toggleChallenge = (id: string): SaveResult => {
    const current = challenges.find((challenge) => challenge.id === id);
    if (!current) return { ok: false, error: "This task is no longer available." };
    const now = new Date();
    const completed = !current.completed;
    const earnedXP = current.earnedXP ?? current.xp;
    const updated = challenges.map((challenge) =>
      challenge.id !== id
        ? challenge
        : {
            ...challenge,
            completed,
            earnedXP: completed ? challenge.xp : undefined,
            completedAt: completed
              ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : undefined,
          },
    );
    const saved = persist(`${LOCAL_STORAGE_KEY}_challenges`, updated);
    if (!saved.ok) return saved;
    setChallenges(updated);
    setStorageError(null);
    setUser((previous) =>
      applyActivityXp(previous, completed ? current.xp : -earnedXP, now, {
        stats: { [getChallengeStat(current.category)]: completed ? 3 : -3 },
        challengeDelta: completed ? 1 : -1,
      }),
    );
    if (completed) {
      addActivity(
        `Completed Challenge: ${current.title}`,
        `Earned +${current.xp} XP in ${current.category}.`,
        current.xp,
      );
      triggerConfetti();
    }
    return { ok: true };
  };

  const logWorkout = (name: string, exercises: WorkoutExercise[]): SaveResult => {
    const summary = summarizeWorkout(exercises);
    if (!summary.valid)
      return {
        ok: false,
        error:
          "Enter an exercise name, positive whole-number reps, and a valid weight for each set.",
      };
    const now = new Date();
    const entry: WorkoutEntry = {
      id: crypto.randomUUID(),
      name: name.trim() || "Training Session",
      date: now.toISOString(),
      exercises: summary.exercises,
      totalVolume: summary.volume,
      xpEarned: summary.xp,
    };
    const updated = [entry, ...workouts];
    const saved = persist(`${LOCAL_STORAGE_KEY}_workouts`, updated);
    if (!saved.ok) return saved;
    setWorkouts(updated);
    setStorageError(null);
    setUser((previous) =>
      applyActivityXp(previous, entry.xpEarned, now, { stats: { physical: 3 } }),
    );
    addActivity(
      `Logged Workout: ${entry.name}`,
      `${summary.sets} sets · ${Math.round(summary.volume).toLocaleString()} kg total volume.`,
      entry.xpEarned,
    );
    triggerConfetti();
    return { ok: true };
  };

  const deleteWorkout = (id: string) => {
    const updated = workouts.filter((workout) => workout.id !== id);
    if (persist(`${LOCAL_STORAGE_KEY}_workouts`, updated).ok) setWorkouts(updated);
  };

  const saveWorkoutTemplate = (name: string, exercises: WorkoutExercise[]) => {
    const cleaned = exercises.filter((ex) => ex.name.trim());
    if (!cleaned.length) return;
    const tpl: WorkoutTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim() || "Untitled Template",
      exercises: cleaned,
      createdAt: new Date().toISOString(),
    };
    setWorkoutTemplates((prev) => [tpl, ...prev]);
  };

  const deleteWorkoutTemplate = (id: string) => {
    setWorkoutTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const setCalorieGoal = (goal: number) => {
    setCalorieGoalState(Math.max(500, Math.min(10000, Math.round(goal) || 2000)));
  };

  const deleteMeal = (id: string) => {
    const updated = meals.filter((meal) => meal.id !== id);
    if (persist(`${LOCAL_STORAGE_KEY}_meals`, updated).ok) setMeals(updated);
  };

  const logMeal = (name: string, calories: number, mealType: MealEntry["mealType"]): SaveResult => {
    const cleanName = name.trim();
    const kcal = Math.round(calories);
    if (
      !cleanName ||
      !Number.isSafeInteger(kcal) ||
      kcal <= 0 ||
      !["Breakfast", "Lunch", "Dinner", "Snack"].includes(mealType)
    ) {
      return { ok: false, error: "Enter a meal name and a positive calorie amount." };
    }
    const now = new Date();
    const isFirstToday = !meals.some(
      (meal) => new Date(meal.date).toDateString() === now.toDateString(),
    );
    const xpEarned = isFirstToday ? 60 : 10;
    const entry: MealEntry = {
      id: crypto.randomUUID(),
      name: cleanName,
      calories: kcal,
      mealType,
      date: now.toISOString(),
      xpEarned,
    };
    const updated = [entry, ...meals];
    const saved = persist(`${LOCAL_STORAGE_KEY}_meals`, updated);
    if (!saved.ok) return saved;
    setMeals(updated);
    setStorageError(null);
    setUser((previous) =>
      applyActivityXp(previous, xpEarned, now, {
        stats: isFirstToday ? { discipline: 2, physical: 1 } : {},
      }),
    );
    if (isFirstToday) {
      addActivity("Nutrition logged for today", `${cleanName} (${kcal} kcal).`, xpEarned);
      triggerConfetti();
    }
    return { ok: true };
  };

  const addCustomChallenge = (
    title: string,
    category: DailyChallenge["category"],
    difficulty: DailyChallenge["difficulty"],
  ): SaveResult => {
    if (
      !title.trim() ||
      title.trim().length > 120 ||
      !CHALLENGE_CATEGORIES.includes(category) ||
      !Object.hasOwn(CHALLENGE_XP, difficulty)
    ) {
      return { ok: false, error: "Enter a task title, category, and difficulty." };
    }
    const newChallenge: DailyChallenge = {
      id: `ch-custom-${crypto.randomUUID()}`,
      title: title.trim(),
      category,
      difficulty,
      xp: CHALLENGE_XP[difficulty],
      durationMinutes: 20,
      description: "Custom task",
      completed: false,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };
    const updated = [newChallenge, ...challenges];
    const saved = persist(`${LOCAL_STORAGE_KEY}_challenges`, updated);
    if (!saved.ok) return saved;
    setChallenges(updated);
    setStorageError(null);
    return { ok: true };
  };

  const updateCustomChallenge = (
    id: string,
    updates: Pick<DailyChallenge, "title" | "category" | "difficulty">,
  ): SaveResult => {
    const current = challenges.find((challenge) => challenge.id === id);
    const edited = current ? editCustomChallenge(current, updates, new Date()) : null;
    if (!edited)
      return {
        ok: false,
        error:
          "Completed tasks can only be renamed. Mark the task incomplete before changing its category or difficulty.",
      };
    const updated = challenges.map((challenge) => (challenge.id === id ? edited : challenge));
    const saved = persist(`${LOCAL_STORAGE_KEY}_challenges`, updated);
    if (!saved.ok) return saved;
    setChallenges(updated);
    setStorageError(null);
    return { ok: true };
  };

  const removeChallenge = (id: string) => {
    setChallenges((prev) => prev.filter((c) => c.id !== id));
    // Track removed IDs so they stay hidden even if localStorage resets
    const removed = readStoredArray<string>(`${LOCAL_STORAGE_KEY}_removed_challenges`, []);
    if (!removed.includes(id)) {
      safeSetItem(
        `${LOCAL_STORAGE_KEY}_removed_challenges`,
        JSON.stringify([...removed, id]),
      );
    }
  };

  const toggleReaction = (activityId: string, reaction: ReactionType) => {
    setFeed((prevFeed) =>
      prevFeed.map((item) => {
        if (item.id !== activityId) return item;

        const currentReaction = item.userReactions[user.id];
        const newReactions = { ...item.reactions };
        const newUserReactions = { ...item.userReactions };

        if (currentReaction === reaction) {
          // Remove reaction
          newReactions[reaction] = Math.max(0, newReactions[reaction] - 1);
          delete newUserReactions[user.id];
        } else {
          // If had prior reaction, decrement old
          if (currentReaction) {
            newReactions[currentReaction] = Math.max(0, newReactions[currentReaction] - 1);
          }
          // Increment new
          newReactions[reaction] = (newReactions[reaction] || 0) + 1;
          newUserReactions[user.id] = reaction;
        }

        return {
          ...item,
          reactions: newReactions,
          userReactions: newUserReactions,
        };
      }),
    );
  };

  const addComment = (activityId: string, text: string) => {
    if (!text.trim()) return;
    const newComment = {
      id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      text: text.trim(),
      createdAt: "Just now",
      tier: user.tier,
    };

    setFeed((prevFeed) =>
      prevFeed.map((item) => {
        if (item.id === activityId) {
          return {
            ...item,
            comments: [...item.comments, newComment],
          };
        }
        return item;
      }),
    );
  };

  const redeemReward = (rewardId: string) => {
    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward || reward.unlocked) return;

    if (user.totalXP < reward.xpCost) {
      alert(`You need ${reward.xpCost - user.totalXP} more XP to unlock this reward!`);
      return;
    }

    if (reward.isPremiumOnly && !user.isPremium) {
      setIsPaywallOpen(true);
      return;
    }

    triggerConfetti();

    setRewards((prev) => prev.map((r) => (r.id === rewardId ? { ...r, unlocked: true } : r)));

    // Deducing XP or maintaining lifetime total XP? In SVJ totalXP represents rank, so we unlock without burning lifetime rank XP!
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...updates }));

    // Sync leaderboard if user profile updates
    setLeaderboard((prev) =>
      prev.map((item) =>
        item.id === "user-me"
          ? {
              ...item,
              username: updates.username || item.username,
              avatar: updates.avatar || item.avatar,
              bio: updates.bio || item.bio,
            }
          : item,
      ),
    );
  };

  const completeOnboarding = (data: {
    name: string;
    username: string;
    bio: string;
    location: string;
    avatar: string;
  }) => {
    triggerConfetti();
    safeSetItem(`${LOCAL_STORAGE_KEY}_has_onboarded`, "true");

    // Profile setup does not mint XP or reset existing progress.
    setUser((prev) => ({
      ...prev,
      name: data.name,
      username: data.username,
      bio: data.bio,
      location: data.location,
      avatar: data.avatar,
    }));

    // Update display information without a welcome grant.
    setLeaderboard((prev) =>
      prev.map((item) =>
        item.id === "user-me"
          ? {
              ...item,
              username: data.username,
              avatar: data.avatar,
              bio: data.bio,
            }
          : item,
      ),
    );

    setIsFirstTimeOnboardingOpen(false);
  };

  const loginWithGmail = (
    email: string,
    name?: string,
    avatar?: string,
    userId?: string,
    serverProfile?: {
      id: string;
      total_xp: number;
      current_streak: number;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      is_plus_member: boolean;
    } | null,
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    // Idempotency guard: if we already have this email set, skip to avoid
    // redundant confetti / modal-close / state churn.
    if (user.email?.toLowerCase() === cleanEmail) return;
    const isOwnerEmail = cleanEmail === "sabarivj777@gmail.com";

    // Ensure the ref always points to the real function so the auth-sync
    // listener (which uses loginWithGmailRef) can invoke it even though
    // it was defined before this function in the component body.
    loginWithGmailRef.current = loginWithGmail;

    // ── Resolve base profile ───────────────────────────────────────────────
    // Priority: localStorage cache > server profile > current state (INITIAL_USER)
    const savedAccount = appStorage.getItem(`svj_user_account_${cleanEmail}`);
    let baseUser: UserProfile = user;

    if (savedAccount) {
      try {
        baseUser = normalizeUserProfile(JSON.parse(savedAccount));
      } catch (e) {
        console.error(e);
      }
    } else if (serverProfile) {
      // Cross-device restore: build base from Supabase server data.
      // This prevents INITIAL_USER (0 XP, "New Voyager") from overwriting
      // the real account on a new browser/device.
      baseUser = {
        ...INITIAL_USER,
        id: userId || INITIAL_USER.id,
        email: cleanEmail,
        name: serverProfile.display_name || INITIAL_USER.name,
        username: serverProfile.username || INITIAL_USER.username,
        avatar: serverProfile.avatar_url || INITIAL_USER.avatar,
        totalXP: serverProfile.total_xp,
        currentStreak: serverProfile.current_streak,
        bestStreak: serverProfile.current_streak,
        tier: getTierForXP(serverProfile.total_xp),
        level: Math.max(1, Math.floor(serverProfile.total_xp / 500) + 1),
        isPremium: isOwnerEmail || false,
      };
    }

    if (isOwnerEmail) {
      // Unlock all rewards vault items
      setRewards((prev) => prev.map((reward) => ({ ...reward, unlocked: true })));
    }

    const updatedUser: UserProfile = {
      ...baseUser,
      id: userId || baseUser.id,
      email: cleanEmail,
      name: isOwnerEmail
        ? "Sabari (Founder & Owner)"
        : name || (baseUser.name !== "New Voyager" ? baseUser.name : cleanEmail.split("@")[0]),
      username:
        baseUser.username !== "initiate_svj"
          ? baseUser.username
          : cleanEmail
              .split("@")[0]
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_"),
      avatar: avatar || baseUser.avatar,
      isFounder: isOwnerEmail || baseUser.isFounder || false,
      isOwner: isOwnerEmail || baseUser.isOwner || false,
      isPremium: isOwnerEmail ? true : false, // otherwise server check decides
      verifiedIcon: isOwnerEmail ? true : baseUser.verifiedIcon,
      vipIcon: isOwnerEmail ? true : baseUser.vipIcon,
      tier: isOwnerEmail ? "Obsidian" : baseUser.tier,
      totalXP: baseUser.totalXP,
      weeklyXP: baseUser.weeklyXP,
      monthlyXP: baseUser.monthlyXP,
      leagueRank: isOwnerEmail ? "FOUNDER #1" : baseUser.leagueRank,
      equippedFrame: isOwnerEmail ? "frame-crimson" : baseUser.equippedFrame,
      equippedBadge: isOwnerEmail ? "bdg-top1" : baseUser.equippedBadge,
      stats: isOwnerEmail
        ? {
            physical: 93,
            mental: 91,
            social: 87,
            intellect: 84,
            discipline: 93,
            ambition: 95,
          }
        : baseUser.stats,
      badges: isOwnerEmail
        ? baseUser.badges.map((b) => ({ ...b, unlocked: true }))
        : baseUser.badges,
      achievements: isOwnerEmail
        ? baseUser.achievements.map((a) => ({
            ...a,
            unlocked: true,
            unlockedAt: a.unlockedAt || "2026-07-31",
          }))
        : baseUser.achievements,
    };

    setUser(updatedUser);
    // Persist everything EXCEPT Plus status (same rule as the sync effect):
    // localStorage must never hold isPremium=true, only the server check decides.
    const persistedUser = { ...updatedUser, isPremium: false };
    safeSetItem(`${LOCAL_STORAGE_KEY}_user`, JSON.stringify(persistedUser));
    safeSetItem(`svj_user_account_${cleanEmail}`, JSON.stringify(persistedUser));
    safeSetItem(`${LOCAL_STORAGE_KEY}_active_email`, cleanEmail);
    triggerConfetti();
    setIsGoogleAuthModalOpen(false);
  };

  // Ensure the ref is also wired on the very first render (before loginWithGmail
  // could be called from within the function body above).
  loginWithGmailRef.current = loginWithGmail;

  const logoutGmail = () => {
    appStorage.removeItem(`${LOCAL_STORAGE_KEY}_active_email`);
    setUser((prev) => {
      const nextUser = {
        ...prev,
        email: undefined,
        isFounder: false,
        isOwner: false,
        isPremium: false,
      };
      safeSetItem(`${LOCAL_STORAGE_KEY}_user`, JSON.stringify(nextUser));
      return nextUser;
    });
  };

  return (
    <SVJContext.Provider
      value={{
        user,
        profileLoaded,
        storageError,
        isPlusMember: isPlusMemberProp,
        plusExpiresAt: plusExpiresAtProp,
        challenges,
        feed,
        leaderboard,
        rewards,
        workouts,
        workoutTemplates,
        meals,
        calorieGoal,
        comparingMember,
        selectedMemberModal,
        levelUpModalData,
        isPaywallOpen,
        isEditProfileOpen,
        isUPIModalOpen,
        isFirstTimeOnboardingOpen,
        isGoogleAuthModalOpen,
        toggleChallenge,
        awardXp,
        addCustomChallenge,
        updateCustomChallenge,
        removeChallenge,
        toggleReaction,
        addComment,
        redeemReward,
        logWorkout,
        deleteWorkout,
        saveWorkoutTemplate,
        deleteWorkoutTemplate,
        logMeal,
        deleteMeal,
        setCalorieGoal,
        updateUserProfile,
        completeOnboarding,
        loginWithGmail,
        logoutGmail,
        setComparingMember,
        setSelectedMemberModal,
        setLevelUpModalData,
        setIsPaywallOpen,
        setIsEditProfileOpen,
        setIsUPIModalOpen,
        setIsFirstTimeOnboardingOpen,
        setIsGoogleAuthModalOpen,
        triggerConfetti,
      }}
    >
      {children}
    </SVJContext.Provider>
  );
};

export const useSVJ = () => {
  const context = useContext(SVJContext);
  if (!context) {
    throw new Error("useSVJ must be used within an SVJProvider");
  }
  return context;
};
