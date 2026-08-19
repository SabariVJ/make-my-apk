import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
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

interface SVJContextType {
  user: UserProfile;
  /** True once the user profile has been synced from localStorage or Supabase
   *  auth — prevents a flash of INITIAL_USER while the session is loading. */
  profileLoaded: boolean;
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
  isDarkOnboardingOpen: boolean;
  isGoogleAuthModalOpen: boolean;

  // Actions
  toggleChallenge: (id: string) => void;
  /** Apply a server-confirmed XP grant to the user's profile (60-day challenge). */
  awardXp: (xp: number) => void;
  addCustomChallenge: (
    title: string,
    category: DailyChallenge["category"],
    difficulty: DailyChallenge["difficulty"],
    xp: number,
  ) => void;
  toggleReaction: (activityId: string, reaction: ReactionType) => void;
  addComment: (activityId: string, text: string) => void;
  redeemReward: (rewardId: string) => void;
  logWorkout: (name: string, exercises: WorkoutExercise[]) => void;
  deleteWorkout: (id: string) => void;
  saveWorkoutTemplate: (name: string, exercises: WorkoutExercise[]) => void;
  deleteWorkoutTemplate: (id: string) => void;
  logMeal: (name: string, calories: number, mealType: MealEntry["mealType"]) => void;
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
  setIsDarkOnboardingOpen: (open: boolean) => void;
  setIsGoogleAuthModalOpen: (open: boolean) => void;
  triggerConfetti: () => void;
}

const SVJContext = createContext<SVJContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "svj_app_state_v5";

export const SVJProvider: React.FC<{
  children: React.ReactNode;
  /** Server-authoritative Plus status from TrialGate (null = unknown/signed out). */
  plusActive?: boolean | null;
}> = ({ children, plusActive = null }) => {
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_user`);
    if (!saved) return INITIAL_USER;
    try {
      const parsed = JSON.parse(saved) as UserProfile;
      // Never trust a persisted isPremium — the server-side check is the only authority.
      parsed.isPremium = false;
      return parsed;
    } catch {
      return INITIAL_USER;
    }
  });

  const [challenges, setChallenges] = useState<DailyChallenge[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_challenges`);
    return saved ? JSON.parse(saved) : INITIAL_CHALLENGES;
  });

  const [feed, setFeed] = useState<FeedActivity[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_feed`);
    if (!saved) return INITIAL_FEED;
    try {
      const parsed: FeedActivity[] = JSON.parse(saved);
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
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_leaderboard`);
    return saved ? JSON.parse(saved) : LEADERBOARD_USERS;
  });

  const [rewards, setRewards] = useState<RewardItem[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_rewards`);
    return saved ? JSON.parse(saved) : INITIAL_REWARDS;
  });

  const [workouts, setWorkouts] = useState<WorkoutEntry[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_workouts`);
    return saved ? JSON.parse(saved) : [];
  });

  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_workout_templates`);
    return saved ? JSON.parse(saved) : [];
  });

  const [meals, setMeals] = useState<MealEntry[]>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_meals`);
    return saved ? JSON.parse(saved) : [];
  });

  const [calorieGoal, setCalorieGoalState] = useState<number>(() => {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_calorie_goal`);
    return saved ? Number(saved) : 2200;
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
  const [isDarkOnboardingOpen, setIsDarkOnboardingOpen] = useState<boolean>(() => {
    const onboarded = localStorage.getItem(`${LOCAL_STORAGE_KEY}_has_dark_onboarded`);
    return !onboarded;
  });
  const [isGoogleAuthModalOpen, setIsGoogleAuthModalOpen] = useState<boolean>(false);

  // Tracks whether the user profile has been synced from localStorage or the
  // Supabase session. While false the app shows a splash instead of rendering
  // INITIAL_USER as if it were the real authenticated user.
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);

  // Auto-restore active Gmail account from localStorage cache.
  // Only marks profileLoaded when data was actually restored — the auth-sync
  // effect handles the cross-device case where localStorage is empty.
  useEffect(() => {
    const activeEmail = localStorage.getItem(`${LOCAL_STORAGE_KEY}_active_email`);
    if (activeEmail) {
      const savedAcc = localStorage.getItem(`svj_user_account_${activeEmail.toLowerCase()}`);
      if (savedAcc) {
        try {
          const parsed = JSON.parse(savedAcc) as UserProfile;
          parsed.isPremium = false; // server-side check is the only authority
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
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setProfileLoaded(true);
    }).catch(() => setProfileLoaded(true));
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
    const syncSessionProfile = async (session: Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >["data"]["session"]) => {
      const sessionEmail = session?.user?.email;
      if (!sessionEmail) return;
      const lower = sessionEmail.toLowerCase();
      // Skip if we already synced this email (prevents redundant calls
      // when GoogleAuthModal's own listener also handles the same event).
      if (syncedEmailRef.current === lower) return;
      syncedEmailRef.current = lower;

      // Check whether we already have a cached profile for this email.
      const hasLocalProfile = localStorage.getItem(`svj_user_account_${lower}`) !== null;

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
            .select("id, total_xp, current_streak, username, display_name, avatar_url, is_plus_member")
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

      // If this is a returning user (cached locally or has a server profile),
      // suppress the dark cinematic onboarding — they've already completed it.
      if (hasLocalProfile || serverProfile) {
        setIsDarkOnboardingOpen(false);
      }
    };

    // TrialGate owns the application's single auth subscription. By the time
    // this provider mounts it has restored the session, so a one-shot read is
    // sufficient and avoids racing a second listener against SIGNED_OUT.
    void supabase.auth.getSession().then(({ data }) => syncSessionProfile(data.session));
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
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_user`, JSON.stringify(persisted));
    if (user.email) {
      localStorage.setItem(`svj_user_account_${user.email.toLowerCase()}`, JSON.stringify(persisted));
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
  }, [user]);

  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_challenges`, JSON.stringify(challenges));
  }, [challenges]);

  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_feed`, JSON.stringify(feed));
  }, [feed]);

  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_leaderboard`, JSON.stringify(leaderboard));
  }, [leaderboard]);

  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_rewards`, JSON.stringify(rewards));
  }, [rewards]);

  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_workouts`, JSON.stringify(workouts));
  }, [workouts]);

  useEffect(() => {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY}_workout_templates`,
      JSON.stringify(workoutTemplates),
    );
  }, [workoutTemplates]);

  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_meals`, JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_calorie_goal`, String(calorieGoal));
  }, [calorieGoal]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#C81E3A", "#D4AF37", "#F4F2ED", "#E62846"],
    });
  };

  const getTierForXP = (xp: number): TierLevel => {
    if (xp >= 60000) return "Obsidian";
    if (xp >= 35000) return "Diamond";
    if (xp >= 20000) return "Platinum";
    if (xp >= 12000) return "Gold";
    if (xp >= 6000) return "Silver";
    if (xp >= 2500) return "Bronze";
    return "Initiate";
  };

  // Server-confirmed XP grant (e.g. 60-Day Challenge day completion). The amount
  // is validated server-side (increment_total_xp on profiles.total_xp) and only
  // surfaced here after the server confirms the grant, so the client can never
  // mint XP on its own. Mirrors the existing toggleChallenge/logWorkout XP math.
  const awardXp = (xp: number) => {
    const amount = Math.max(0, Math.round(xp) || 0);
    if (amount <= 0) return;
    setUser((prevUser) => {
      const oldTier = prevUser.tier;
      const newXP = prevUser.totalXP + amount;
      const newTier = getTierForXP(newXP);
      if (
        newTier !== oldTier &&
        TIERS.findIndex((t) => t.name === newTier) > TIERS.findIndex((t) => t.name === oldTier)
      ) {
        setLevelUpModalData({ oldTier, newTier });
      }
      const todayStr = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short" });
      const updatedHistory = [...prevUser.xpHistory];
      const lastIdx = updatedHistory.length - 1;
      if (lastIdx >= 0) {
        updatedHistory[lastIdx] = {
          date: todayStr,
          xp: Math.max(0, updatedHistory[lastIdx].xp + amount),
        };
      }
      return {
        ...prevUser,
        totalXP: newXP,
        weeklyXP: prevUser.weeklyXP + amount,
        monthlyXP: prevUser.monthlyXP + amount,
        tier: newTier,
        xpHistory: updatedHistory,
      };
    });
  };

  const toggleChallenge = (id: string) => {
    setChallenges((prev) => {
      let xpDelta = 0;
      let completedItem: DailyChallenge | undefined;

      const updated = prev.map((ch) => {
        if (ch.id === id) {
          const nextState = !ch.completed;
          xpDelta = nextState ? ch.xp : -ch.xp;
          completedItem = {
            ...ch,
            completed: nextState,
            completedAt: nextState
              ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : undefined,
          };
          return completedItem;
        }
        return ch;
      });

      if (completedItem) {
        if (completedItem.completed && xpDelta > 0) {
          triggerConfetti();
        }

        // Update User XP & Check Tier Progression
        setUser((prevUser) => {
          const oldXP = prevUser.totalXP;
          const newXP = Math.max(0, oldXP + xpDelta);
          const oldTier = prevUser.tier;
          const newTier = getTierForXP(newXP);

          if (
            completedItem?.completed &&
            newTier !== oldTier &&
            TIERS.findIndex((t) => t.name === newTier) > TIERS.findIndex((t) => t.name === oldTier)
          ) {
            setLevelUpModalData({ oldTier, newTier });
          }

          // Also update 30-day XP history
          const todayStr = new Date().toLocaleDateString("en-US", {
            day: "2-digit",
            month: "short",
          });
          const updatedHistory = [...prevUser.xpHistory];
          const lastIdx = updatedHistory.length - 1;
          if (lastIdx >= 0) {
            updatedHistory[lastIdx] = {
              date: todayStr,
              xp: Math.max(0, updatedHistory[lastIdx].xp + xpDelta),
            };
          }

          // Dynamically adjust category attribute stats
          const categoryStatMap: Record<string, keyof UserStats> = {
            Physical: "physical",
            Nutrition: "physical",
            Discipline: "discipline",
            Mental: "mental",
            Mindset: "mental",
            Social: "social",
            Community: "social",
            Intellect: "intellect",
            Guide: "intellect",
            Ambition: "ambition",
            Goal: "ambition",
          };

          const statKey = categoryStatMap[completedItem!.category] || "discipline";
          const currentStats = prevUser.stats || {
            physical: 12,
            social: 10,
            discipline: 15,
            mental: 14,
            intellect: 12,
            ambition: 20,
          };
          const statChange = completedItem!.completed ? 3 : -3;
          const updatedStats: UserStats = {
            ...currentStats,
            [statKey]: Math.min(100, Math.max(0, (currentStats[statKey] || 10) + statChange)),
          };

          return {
            ...prevUser,
            totalXP: newXP,
            weeklyXP: Math.max(0, prevUser.weeklyXP + xpDelta),
            monthlyXP: Math.max(0, prevUser.monthlyXP + xpDelta),
            totalChallengesCompleted: Math.max(
              0,
              prevUser.totalChallengesCompleted + (completedItem!.completed ? 1 : -1),
            ),
            tier: newTier,
            stats: updatedStats,
            xpHistory: updatedHistory,
          };
        });

        if (completedItem.completed) {
          // Add activity post to Feed
          const newFeedItem: FeedActivity = {
            id: `feed-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            userId: user.id,
            username: user.username,
            userAvatar: user.avatar,
            userTier: user.tier,
            isVerified: user.verifiedIcon,
            isVIP: user.vipIcon,
            actionType: "completed_challenge",
            title: `⚡ Completed Challenge: ${completedItem.title}`,
            details: `Earned +${completedItem.xp} XP in ${completedItem!.category}. Daily discipline on point!`,
            xpEarned: completedItem.xp,
            timestamp: "Just now",
            reactions: { fire: 1, crown: 0, hundred: 1, bolt: 1, wolf: 0 },
            userReactions: { [user.id]: "fire" },
            comments: [],
          };

          setFeed((f) => [newFeedItem, ...f]);
        }
      }

      return updated;
    });
  };

  const logWorkout = (name: string, exercises: WorkoutExercise[]) => {
    const cleaned = exercises
      .map((ex) => ({ ...ex, sets: ex.sets.filter((st) => st.reps > 0) }))
      .filter((ex) => ex.name.trim() && ex.sets.length > 0);

    if (cleaned.length === 0) return;

    const totalSets = cleaned.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolume = cleaned.reduce(
      (sum, ex) => sum + ex.sets.reduce((s, st) => s + st.reps * st.weight, 0),
      0,
    );
    const xpEarned = Math.max(25, Math.min(400, totalSets * 15 + Math.round(totalVolume / 100)));

    const entry: WorkoutEntry = {
      id: `wo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim() || "Training Session",
      date: new Date().toISOString(),
      exercises: cleaned,
      totalVolume,
      xpEarned,
    };

    setWorkouts((prev) => [entry, ...prev]);
    triggerConfetti();

    setUser((prevUser) => {
      const oldTier = prevUser.tier;
      const newXP = prevUser.totalXP + xpEarned;
      const newTier = getTierForXP(newXP);
      if (
        newTier !== oldTier &&
        TIERS.findIndex((t) => t.name === newTier) > TIERS.findIndex((t) => t.name === oldTier)
      ) {
        setLevelUpModalData({ oldTier, newTier });
      }

      const todayStr = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short" });
      const updatedHistory = [...prevUser.xpHistory];
      const lastIdx = updatedHistory.length - 1;
      if (lastIdx >= 0) {
        updatedHistory[lastIdx] = {
          date: todayStr,
          xp: Math.max(0, updatedHistory[lastIdx].xp + xpEarned),
        };
      }

      const currentStats = prevUser.stats || {
        physical: 12,
        social: 10,
        discipline: 15,
        mental: 14,
        intellect: 12,
        ambition: 20,
      };
      const updatedStats: UserStats = {
        ...currentStats,
        physical: Math.min(100, (currentStats.physical || 10) + 3),
      };

      return {
        ...prevUser,
        totalXP: newXP,
        weeklyXP: prevUser.weeklyXP + xpEarned,
        monthlyXP: prevUser.monthlyXP + xpEarned,
        tier: newTier,
        stats: updatedStats,
        xpHistory: updatedHistory,
      };
    });

    const newFeedItem: FeedActivity = {
      id: `feed-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      userId: user.id,
      username: user.username,
      userAvatar: user.avatar,
      userTier: user.tier,
      isVerified: user.verifiedIcon,
      isVIP: user.vipIcon,
      actionType: "completed_challenge",
      title: `\ud83c\udfcb\ufe0f Logged Workout: ${entry.name}`,
      details: `${totalSets} sets \u2022 ${Math.round(totalVolume).toLocaleString()} kg total volume. Physical +3.`,
      xpEarned,
      timestamp: "Just now",
      reactions: { fire: 1, crown: 0, hundred: 0, bolt: 1, wolf: 0 },
      userReactions: { [user.id]: "fire" },
      comments: [],
    };
    setFeed((f) => [newFeedItem, ...f]);
  };

  const deleteWorkout = (id: string) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
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
    setMeals((prev) => prev.filter((m) => m.id !== id));
  };

  const logMeal = (name: string, calories: number, mealType: MealEntry["mealType"]) => {
    const cleanName = name.trim();
    const kcal = Math.max(0, Math.round(calories) || 0);
    if (!cleanName || kcal <= 0) return;

    const todayKey = new Date().toDateString();
    const isFirstToday = !meals.some((m) => new Date(m.date).toDateString() === todayKey);

    // Consistency bonus: first log of the day is worth far more than extra entries
    const xpEarned = isFirstToday ? 60 : 10;

    const entry: MealEntry = {
      id: `meal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      calories: kcal,
      mealType,
      date: new Date().toISOString(),
      xpEarned,
    };

    setMeals((prev) => [entry, ...prev]);

    setUser((prevUser) => {
      const oldTier = prevUser.tier;
      const newXP = prevUser.totalXP + xpEarned;
      const newTier = getTierForXP(newXP);
      if (
        newTier !== oldTier &&
        TIERS.findIndex((t) => t.name === newTier) > TIERS.findIndex((t) => t.name === oldTier)
      ) {
        setLevelUpModalData({ oldTier, newTier });
      }

      const todayStr = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short" });
      const updatedHistory = [...prevUser.xpHistory];
      const lastIdx = updatedHistory.length - 1;
      if (lastIdx >= 0) {
        updatedHistory[lastIdx] = {
          date: todayStr,
          xp: Math.max(0, updatedHistory[lastIdx].xp + xpEarned),
        };
      }

      const currentStats = prevUser.stats || {
        physical: 12,
        social: 10,
        discipline: 15,
        mental: 14,
        intellect: 12,
        ambition: 20,
      };
      const updatedStats: UserStats = isFirstToday
        ? {
            ...currentStats,
            discipline: Math.min(100, (currentStats.discipline || 10) + 2),
            physical: Math.min(100, (currentStats.physical || 10) + 1),
          }
        : currentStats;

      return {
        ...prevUser,
        totalXP: newXP,
        weeklyXP: prevUser.weeklyXP + xpEarned,
        monthlyXP: prevUser.monthlyXP + xpEarned,
        tier: newTier,
        stats: updatedStats,
        xpHistory: updatedHistory,
      };
    });

    if (isFirstToday) {
      triggerConfetti();
      const newFeedItem: FeedActivity = {
        id: `feed-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        userId: user.id,
        username: user.username,
        userAvatar: user.avatar,
        userTier: user.tier,
        isVerified: user.verifiedIcon,
        isVIP: user.vipIcon,
        actionType: "completed_challenge",
        title: `\ud83c\udf7d\ufe0f Nutrition logged for today`,
        details: `Started tracking intake with ${cleanName} (${kcal} kcal). Discipline +2, Physical +1.`,
        xpEarned,
        timestamp: "Just now",
        reactions: { fire: 1, crown: 0, hundred: 0, bolt: 0, wolf: 0 },
        userReactions: { [user.id]: "fire" },
        comments: [],
      };
      setFeed((f) => [newFeedItem, ...f]);
    }
  };

  const addCustomChallenge = (
    title: string,
    category: DailyChallenge["category"],
    difficulty: DailyChallenge["difficulty"],
    xp: number,
  ) => {
    const newCh: DailyChallenge = {
      id: `ch-custom-${Date.now()}`,
      title,
      category,
      difficulty,
      xp,
      durationMinutes: 20,
      description: "Custom user habit designed for daily excellence.",
      completed: false,
      isCustom: true,
    };
    setChallenges((prev) => [newCh, ...prev]);
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
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_has_onboarded`, "true");

    // Update user profile with welcome bonus +100 XP
    setUser((prev) => ({
      ...prev,
      name: data.name,
      username: data.username,
      bio: data.bio,
      location: data.location,
      avatar: data.avatar,
      totalXP: 100,
      weeklyXP: 100,
      monthlyXP: 100,
      xpHistory: [{ date: "31 Jul", xp: 100 }],
    }));

    // Update user on leaderboard
    setLeaderboard((prev) =>
      prev.map((item) =>
        item.id === "user-me"
          ? {
              ...item,
              username: data.username,
              avatar: data.avatar,
              bio: data.bio,
              totalXP: 100,
              weeklyXP: 100,
              monthlyXP: 100,
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
    // Privileged presentation is never inferred from an email address. Until
    // protected profile/RPC data exposes an entitlement, this remains false.
    const isOwnerEmail = false;

    // Ensure the ref always points to the real function so the auth-sync
    // listener (which uses loginWithGmailRef) can invoke it even though
    // it was defined before this function in the component body.
    loginWithGmailRef.current = loginWithGmail;

    // ── Resolve base profile ───────────────────────────────────────────────
    // Priority: localStorage cache > server profile > current state (INITIAL_USER)
    const savedAccount = localStorage.getItem(`svj_user_account_${cleanEmail}`);
    let baseUser: UserProfile = user;

    if (savedAccount) {
      try {
        baseUser = JSON.parse(savedAccount);
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
      setRewards((prev) => {
        const allUnlocked = prev.map((r) => ({ ...r, unlocked: true }));
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_rewards`, JSON.stringify(allUnlocked));
        return allUnlocked;
      });
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
      totalXP: isOwnerEmail ? Math.max(baseUser.totalXP, 100000) : baseUser.totalXP,
      weeklyXP: isOwnerEmail ? Math.max(baseUser.weeklyXP, 15000) : baseUser.weeklyXP,
      monthlyXP: isOwnerEmail ? Math.max(baseUser.monthlyXP, 50000) : baseUser.monthlyXP,
      leagueRank: isOwnerEmail ? "FOUNDER #1" : baseUser.leagueRank,
      equippedFrame: isOwnerEmail ? "frame-crimson" : baseUser.equippedFrame,
      equippedBadge: isOwnerEmail ? "bdg-top1" : baseUser.equippedBadge,
      evolutionTheme: isOwnerEmail ? "samurai" : baseUser.evolutionTheme,
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
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_user`, JSON.stringify(persistedUser));
    localStorage.setItem(`svj_user_account_${cleanEmail}`, JSON.stringify(persistedUser));
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_active_email`, cleanEmail);
    triggerConfetti();
    setIsGoogleAuthModalOpen(false);
  };

  // Ensure the ref is also wired on the very first render (before loginWithGmail
  // could be called from within the function body above).
  loginWithGmailRef.current = loginWithGmail;

  const logoutGmail = () => {
    localStorage.removeItem(`${LOCAL_STORAGE_KEY}_active_email`);
    setUser((prev) => {
      const nextUser = {
        ...prev,
        email: undefined,
        isFounder: false,
        isOwner: false,
        isPremium: false,
      };
      localStorage.setItem(`${LOCAL_STORAGE_KEY}_user`, JSON.stringify(nextUser));
      return nextUser;
    });
  };

  return (
    <SVJContext.Provider
      value={{
        user,
        profileLoaded,
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
        isDarkOnboardingOpen,
        isGoogleAuthModalOpen,
        toggleChallenge,
        awardXp,
        addCustomChallenge,
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
        setIsDarkOnboardingOpen,
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
