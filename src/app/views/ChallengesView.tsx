import React, { useEffect, useState, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { motion, AnimatePresence } from "motion/react";
import { svjStaggerContainer, svjStaggerItem, svjSpringSoft, svjWhileTap } from "../lib/motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Flame,
  Check,
  Plus,
  X,
  Clock,
  Zap,
  Target,
  ShieldAlert,
  Sparkles,
  Filter,
  ChevronDown,
  Pencil,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { useActivityOptional } from "../context/ActivityContext";
import { TaskEditorDialog } from "../components/TaskEditorDialog";
import { EarnPlusCard } from "../components/EarnPlusCard";
import { SixtyDayProgramCard } from "../components/SixtyDayProgramCard";
import { ActivitySummaryCard } from "../components/ActivitySummaryCard";
import { ChallengeCategory, DailyChallenge } from "../types";
import { HexagonRadarChart } from "../components/HexagonRadarChart";
import { getChallengeState, type ChallengeState } from "@/lib/challenge.functions";
import {
  getPersonalizedChallenges,
  refreshPersonalizedChallenges,
  completePersonalizedTask,
} from "@/lib/challenge-engine.server";
import {
  getAssessmentEntryState,
  getUserStats,
  type AssessmentEntryState,
  type UserStatsData,
} from "@/lib/personalization.functions";
import { AssessmentView } from "./AssessmentView";
import { formatCompletedAt } from "../lib/dateFormat";

export const ChallengesView: React.FC<{
  onOpenSixtyDay?: () => void;
  onOpenEarnPlus?: () => void;
  onOpenActivity?: () => void;
}> = ({ onOpenSixtyDay, onOpenEarnPlus, onOpenActivity }) => {
  const {
    challenges,
    toggleChallenge,
    addCustomChallenge,
    updateCustomChallenge,
    removeChallenge,
    user,
    leaderboard,
  } = useSVJ();

  // Fetch server-authoritative challenge state to hide 60-Day CTA when completed
  const callGetState = useServerFn(getChallengeState);
  const sixtyDayQuery = useQuery<ChallengeState | null>({
    queryKey: ["sixty-challenge"],
    queryFn: async () => {
      try {
        return (await callGetState({})) as ChallengeState;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [selectedCategory, setSelectedCategory] = useState<ChallengeCategory | "All">("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyChallenge | null>(null);
  const [showAssessment, setShowAssessment] = useState(false);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);

  // Fetch personalized challenges from the server when assessment data exists
  const callGetPersonalized = useServerFn(getPersonalizedChallenges);
  const callRefreshPersonalized = useServerFn(refreshPersonalizedChallenges);
  const callGetAssessmentEntryState = useServerFn(getAssessmentEntryState);
  const callGetUserStats = useServerFn(getUserStats);
  const personalizationQuery = useQuery<AssessmentEntryState>({
    queryKey: ["assessment-entry-state"],
    queryFn: () => callGetAssessmentEntryState({}) as Promise<AssessmentEntryState>,
    retry: false,
  });

  useEffect(() => {
    const saved = personalizationQuery.data;
    if (saved?.shouldAutoOpen) {
      setShowAssessment(true);
    }
  }, [personalizationQuery.data]);

  const [refreshState, setRefreshState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "cooldown"; remainingMs: number }
    | { status: "error"; message: string }
    | { status: "success" }
  >({ status: "idle" });

  const personalizedQuery = useQuery<{
    challenges: Array<{
      id: string;
      title: string;
      description: string;
      category: string;
      difficulty: string;
      xp: number;
      durationMinutes: number;
      status?: string;
      completed?: boolean;
      completedAt?: string | null;
    }>;
    focusAreas: string[];
    reason: string;
  } | null>({
    queryKey: ["personalized-challenges"],
    queryFn: async () => {
      try {
        return (await callGetPersonalized({})) as {
          challenges: Array<{
            id: string;
            title: string;
            description: string;
            category: string;
            difficulty: string;
            xp: number;
            durationMinutes: number;
          }>;
          focusAreas: string[];
          reason: string;
        };
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const handleRefreshPersonalized = async () => {
    setRefreshState({ status: "loading" });
    try {
      const result = (await callRefreshPersonalized({})) as {
        ok: boolean;
        cooldownRemainingMs: number;
        challenges?: Array<{
          id: string;
          title: string;
          description: string;
          category: string;
          difficulty: string;
          xp: number;
          durationMinutes: number;
        }>;
        focusAreas?: string[];
        reason?: string;
        error?: string;
      };

      if (!result.ok) {
        if (result.cooldownRemainingMs > 0) {
          setRefreshState({
            status: "cooldown",
            remainingMs: result.cooldownRemainingMs,
          });
        } else {
          setRefreshState({ status: "error", message: result.error ?? "Refresh failed." });
        }
        return;
      }

      // Inject the refreshed set directly into the query cache so the UI
      // updates immediately. The new IDs differ from the previous set, so the
      // client merge layer (which deduplicates by title) will not re-add stale
      // tasks.
      // @ts-expect-error TanStack Query v5 exposes setData on the query observer,
      // which is not surfaced through the shared UseQueryResult type in this
      // project's generated types.
      personalizedQuery.setData(
        {
          challenges: result.challenges ?? [],
          focusAreas: result.focusAreas ?? [],
          reason: result.reason ?? "",
        },
        { updatedAt: Date.now() },
      );
      // Also reload in the background so the cache is reconciled with the
      // server after the refresh timestamp has been recorded.
      void personalizedQuery.refetch({ cancelRefetch: false });
      setRefreshState({ status: "success" });
    } catch {
      setRefreshState({ status: "error", message: "Could not refresh personalized tasks." });
    }
  };

  const statsQuery = useQuery<UserStatsData | null>({
    queryKey: ["user-stats"],
    queryFn: async () => {
      try {
        return (await callGetUserStats({})) as UserStatsData | null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const radarStats = statsQuery.data
    ? {
        physical: statsQuery.data.fitness,
        ambition: statsQuery.data.confidence,
        intellect: statsQuery.data.consistency,
        mental: statsQuery.data.focus,
        social: statsQuery.data.social,
        discipline: statsQuery.data.discipline,
      }
    : user.stats;

  // Merge personalized SERVER assignments with user's existing challenges.
  // Personalized rows carry stable database IDs and server completion state,
  // so they are never routed through the local toggleChallenge() path.
  const displayChallenges = React.useMemo(() => {
    const personalized = personalizedQuery.data?.challenges;
    if (!personalized || personalized.length === 0) return challenges;

    const personalizedChallenges: DailyChallenge[] = personalized.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category as ChallengeCategory,
      difficulty: p.difficulty as DailyChallenge["difficulty"],
      xp: p.xp,
      durationMinutes: p.durationMinutes,
      // Server completion state is authoritative — never derived locally.
      completed: p.completed ?? false,
      completedAt: p.completedAt ?? undefined,
      isCustom: false,
      isPersonalized: true,
    }));

    // Deduplicate: keep personalized + user's custom challenges, skip duplicates by title
    const personalizedTitles = new Set(personalizedChallenges.map((c) => c.title));
    const userCustom = challenges.filter((c) => c.isCustom || !personalizedTitles.has(c.title));

    return [...personalizedChallenges, ...userCustom];
  }, [challenges, personalizedQuery.data]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const callCompletePersonalized = useServerFn(completePersonalizedTask);
  const queryClient = useQueryClient();

  const handleToggle = async (id: string) => {
    // Personalized assignments complete through the server-validated RPC —
    // never through the local toggleChallenge()/applyActivityXp path. This
    // removes the false "This task is no longer available" error (their IDs
    // are not local challenge IDs) and keeps XP server-controlled.
    if (personalizedQuery.data?.challenges?.some((p) => p.id === id)) {
      if (completingId) return; // prevent duplicate taps on the pending task
      setCompletingId(id);
      setActionError(null);
      try {
        const result = (await callCompletePersonalized({ data: { assignmentId: id } })) as {
          ok: boolean;
          xpAwarded?: number;
          statChanges?: Record<string, number>;
          error?: string;
        };
        if (!result.ok) {
          // Friendly copy only — raw Postgres internals never reach users.
          setActionError(
            /could not find the function|PGRST202/i.test(result.error ?? "")
              ? "Personalized task service is not available in this environment."
              : (result.error ?? "Could not complete this task. Please retry."),
          );
          return;
        }
        // Refetch so the checked state comes from SERVER assignment state.
        await personalizedQuery.refetch();
        // Invalidate profile/XP + stats so Character Matrix, total XP and
        // XP Today refresh from ledger-confirmed data. No optimistic writes.
        void queryClient.invalidateQueries({ queryKey: ["user-stats"] });
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
      } catch {
        setActionError("Could not complete this task. Please retry.");
      } finally {
        setCompletingId(null);
      }
      return;
    }

    const result = toggleChallenge(id);
    setActionError(result.ok ? null : result.error);
  };

  const sortedLeaderboard = [...leaderboard].sort((a, b) => b.totalXP - a.totalXP);
  const myIndexInSorted = sortedLeaderboard.findIndex(
    (l) => l.id === user.id || l.id === "user-me",
  );
  const userRank = myIndexInSorted !== -1 ? myIndexInSorted + 1 : sortedLeaderboard.length;

  const filteredChallenges =
    selectedCategory === "All"
      ? displayChallenges
      : displayChallenges.filter((c) => c.category === selectedCategory);

  const completedCount = displayChallenges.filter((c) => c.completed).length;
  const totalCount = displayChallenges.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const todayXP = displayChallenges.filter((c) => c.completed).reduce((acc, c) => acc + c.xp, 0);
  // Automatic step-milestone XP + server-verified activity XP count toward
  // the daily totals too. Server activity XP is the authoritative, capped,
  // evidence-backed figure from the database — never device-local math.
  const activity = useActivityOptional();
  // Personalized-task XP comes only from the ledger; the local XP math above
  // counts personalized rows too, so strip them out here to avoid double
  // counting, then add the authoritative ledger figure.
  const personalizedLocalXp = displayChallenges
    .filter((c) => c.isPersonalized && c.completed)
    .reduce((acc, c) => acc + c.xp, 0);
  const totalTodayXp =
    todayXP -
    personalizedLocalXp +
    (activity?.xpEarnedToday ?? 0) +
    (activity?.serverActivityXpToday ?? 0) +
    (activity?.personalizedXpToday ?? 0);

  const isAndroid = Capacitor.getPlatform() === "android";

  const categories: (ChallengeCategory | "All")[] = [
    "All",
    "Physical",
    "Discipline",
    "Mental",
    "Mindset",
    "Nutrition",
  ];

  const getDifficultyBadge = (diff: DailyChallenge["difficulty"]) => {
    switch (diff) {
      case "Easy":
        return "bg-emerald-500/10 text-emerald-400";
      case "Medium":
        return "bg-gold/10 text-gold";
      case "Hard":
        return "bg-rose-500/10 text-rose-400";
      case "Elite":
        return "bg-purple-500/10 text-purple-300";
    }
  };

  return (
    <div className="space-y-5 pb-24">
      {!personalizationQuery.isLoading &&
        !personalizationQuery.data?.personalization?.assessmentCompleted && (
          <button
            type="button"
            onClick={() => setShowAssessment(true)}
            className="w-full svj-card-crimson p-4 text-left svj-press"
          >
            <span className="flex items-center gap-2 font-anton text-sm uppercase tracking-wide text-white">
              <ClipboardCheck className="h-4 w-4 text-[#C81E3A]" /> Complete Your SVJ Assessment
            </span>
            <span className="mt-1 block text-xs font-inter text-[#8C8C90]">
              Personalize challenges around your goals, interests and improvement areas.
            </span>
          </button>
        )}
      {showAssessment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0B0B0C]">
          <AssessmentView
            onComplete={() => {
              setShowAssessment(false);
              void personalizationQuery.refetch();
              void personalizedQuery.refetch();
              void statsQuery.refetch();
            }}
          />
          <button
            type="button"
            onClick={() => setShowAssessment(false)}
            className="fixed right-4 top-4 z-50 rounded-full border border-white/10 bg-[#17171A] p-2 text-white"
            aria-label="Close assessment"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      {onOpenEarnPlus && <EarnPlusCard onOpen={onOpenEarnPlus} />}
      {/* 60-Day Transformation — the program now lives here, not in the bottom nav.
          Progress is the server's own ChallengeState; the CTA opens the
          existing 60-Day route. */}
      {onOpenSixtyDay && !sixtyDayQuery.isError && (
        <SixtyDayProgramCard
          state={sixtyDayQuery.data ?? null}
          loading={sixtyDayQuery.isLoading}
          onOpen={onOpenSixtyDay}
        />
      )}

      {/* Today's Mission Banner */}
      <div className="rounded-2xl bg-[#17171A] border border-white/[0.06] p-4 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-inter text-[#8C8C90] uppercase tracking-wider mb-1">
              <span>Today&apos;s Mission</span>
            </div>
            <h1 className="font-anton text-2xl sm:text-3xl text-white uppercase tracking-wide">
              Forge Your Day
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-2xl bg-[#0b0b0c] border border-white/[0.04] text-xs font-inter flex items-center gap-1.5 text-gold">
              <Flame className="w-4 h-4 fill-gold/20" />
              <span>{user.currentStreak}d streak</span>
            </div>
          </div>
        </div>

        {/* Progress Metrics — connected stat strip */}
        <div className={`grid gap-2 mb-5 ${isAndroid ? "grid-cols-2" : "grid-cols-3"}`}>
          <div className="svj-stat p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90] mb-1">
              <Zap className="w-3.5 h-3.5 text-[#C81E3A]" />
              XP Today
            </div>
            <div className="font-mono text-xl font-bold text-[#C81E3A]">+{totalTodayXp}</div>
          </div>

          <div className="svj-stat p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90] mb-1">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              Completed
            </div>
            <div className="font-mono text-xl font-bold text-white">
              {completedCount}{" "}
              <span className="text-xs text-[#8C8C90] font-normal">/ {totalCount}</span>
            </div>
          </div>

          {!isAndroid && (
            <div className="svj-stat p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90] mb-1">
                <Sparkles className="w-3.5 h-3.5 text-gold" />
                Global Rank
              </div>
              <div className="font-mono text-xl font-bold text-gold">#{userRank}</div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 mb-5">
          <div className="flex justify-between text-[11px] font-inter text-[#8C8C90]">
            <span>Daily XP Goal</span>
            <span>{totalTodayXp} / 500 XP</span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#0b0b0c] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.round((totalTodayXp / 500) * 100))}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-[#8C1327] to-[#C81E3A]"
            />
          </div>
        </div>

        {/* Compact live Activity card — automatic step counter summary */}
        {onOpenActivity && <ActivitySummaryCard onOpen={onOpenActivity} />}

        {/* Character Hexagon Matrix */}
        <div className="border-t border-white/[0.06] pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-inter font-semibold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-gold" />
                Character Matrix — Level {user.level || 1}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#C81E3A]/10 text-[#C81E3A] text-[10px] font-inter font-semibold uppercase">
                {user.leagueRank || "APPRENTICE I"}
              </span>
            </div>
            <span className="text-[11px] font-inter text-[#8C8C90]">Complete tasks to grow</span>
          </div>

          <HexagonRadarChart
            stats={radarStats}
            level={user.level}
            onStatClick={(statKey) => {
              // Quick filter by clicked attribute's category!
              const statCatMap: Record<string, ChallengeCategory> = {
                physical: "Physical",
                mental: "Mental",
                discipline: "Discipline",
                social: "Mindset",
                intellect: "Mindset",
                ambition: "Mindset",
              };
              if (statCatMap[statKey]) {
                setSelectedCategory(statCatMap[statKey]);
              }
            }}
          />
        </div>
      </div>

      {/* Categories & Custom Task Button */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-inter font-medium transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? "bg-[#C81E3A] text-white"
                  : "bg-[#17171A] text-[#8C8C90] hover:text-white border border-white/[0.04]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <button
          onClick={(event) => {
            editorTrigger.current = event.currentTarget;
            setEditingTask(null);
            setIsAddModalOpen(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-[#17171A] hover:bg-white/[0.06] text-white border border-white/[0.06] text-[11px] font-inter font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#C81E3A]" />
          <span>Add Task</span>
        </button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm font-inter text-rose-300">
          {actionError}
        </p>
      )}

      {/* Personalized challenge insight */}
      {personalizationQuery.data?.personalization?.assessmentCompleted &&
        personalizedQuery.data && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#17171A] border border-[#C81E3A]/10">
            <Sparkles className="w-4 h-4 text-[#C81E3A] shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] font-inter text-[#8C8C90]">
                <span className="text-[#C81E3A] font-semibold">Personalized</span> —{" "}
                {personalizedQuery.data.reason}
              </p>
            </div>
            <RefreshButton
              onClick={handleRefreshPersonalized}
              refreshState={refreshState}
              disabled={refreshState.status === "loading"}
            />
          </div>
        )}

      {/* Challenges List — staggered entrance, tactile press feedback */}
      <motion.div
        variants={svjStaggerContainer}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        <AnimatePresence mode="popLayout">
          {filteredChallenges.map((challenge) => (
            <motion.div
              key={challenge.id}
              layout
              variants={svjStaggerItem}
              whileTap={svjWhileTap}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => handleToggle(challenge.id)}
              className={`group p-4 rounded-2xl bg-[#17171A] border transition-colors cursor-pointer flex items-center justify-between gap-4 ${
                completingId === challenge.id
                  ? "border-[#C81E3A]/40"
                  : challenge.completed
                    ? "border-white/[0.06] opacity-80"
                    : "border-white/[0.06] hover:border-white/[0.12]"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Custom Checkbox */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={challenge.completed}
                  aria-busy={completingId === challenge.id}
                  aria-label={`Complete ${challenge.title}`}
                  disabled={completingId === challenge.id || challenge.completed}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleToggle(challenge.id);
                  }}
                  className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                    challenge.completed
                      ? "bg-[#C81E3A] border-[#C81E3A] text-white"
                      : "border-white/20 group-hover:border-[#C81E3A]/60"
                  } ${completingId === challenge.id ? "cursor-wait" : ""}`}
                >
                  {completingId === challenge.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white/70" />
                  ) : (
                    challenge.completed && <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  )}
                </button>

                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-inter font-medium text-sm ${
                        challenge.completed ? "text-[#8C8C90]" : "text-white"
                      }`}
                    >
                      {challenge.title}
                    </h3>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[9px] font-inter font-medium ${getDifficultyBadge(
                        challenge.difficulty,
                      )}`}
                    >
                      {challenge.difficulty}
                    </span>
                  </div>

                  <p className="text-xs font-inter text-[#8C8C90] mt-1 line-clamp-1">
                    {challenge.description}
                  </p>

                  {/* Inline error for THIS task (plus the global alert above) */}
                  {completingId === challenge.id && actionError && (
                    <p role="status" className="text-[11px] font-inter text-rose-300 mt-1.5">
                      {actionError}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] font-inter text-[#8C8C90] mt-2">
                    <span className="text-[#C81E3A] font-medium">{challenge.category}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {challenge.durationMinutes}m
                    </span>
                    {formatCompletedAt(challenge.completedAt) && (
                      <>
                        <span>·</span>
                        <span className="text-[#8C8C90]">
                          {formatCompletedAt(challenge.completedAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* XP Value Pill */}
              <div className="flex items-center gap-2 shrink-0">
                {challenge.isCustom && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      editorTrigger.current = event.currentTarget;
                      setEditingTask(challenge);
                      setIsAddModalOpen(true);
                    }}
                    aria-label={`Edit ${challenge.title}`}
                    className="p-1.5 rounded-lg text-[#A6A6AD] hover:text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#C81E3A]"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {/* Server-assigned personalized tasks are never locally
                    removable — they are completed or replaced via the
                    authorized Refresh flow only. */}
                {!challenge.isPersonalized && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeChallenge(challenge.id);
                    }}
                    aria-label={`Remove ${challenge.title}`}
                    title={`Remove ${challenge.title}`}
                    className="p-1.5 rounded-lg text-[#8C8C90] hover:text-[#C81E3A] hover:bg-[#C81E3A]/10 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div
                  className={`px-2.5 py-1 rounded-full text-[11px] font-inter font-semibold shrink-0 ${
                    challenge.completed
                      ? "bg-[#C81E3A]/10 text-[#C81E3A]"
                      : "bg-[#0b0b0c] text-[#C81E3A]"
                  }`}
                >
                  +{challenge.xp} XP
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <TaskEditorDialog
        open={isAddModalOpen}
        task={editingTask}
        onOpenChange={setIsAddModalOpen}
        returnFocus={editorTrigger.current}
        onSave={(fields) =>
          editingTask
            ? updateCustomChallenge(editingTask.id, fields)
            : addCustomChallenge(fields.title, fields.category, fields.difficulty)
        }
      />
    </div>
  );
};

/** Minimal refresh control for the personalized task section.
 *
 * Only a Renewal / cooldown UI is shown. There is no "Retake Assessment" or
 * infinite regeneration path — the server enforces the one-time assessment
 * gate and the refresh cooldown.
 */
function RefreshButton({
  onClick,
  refreshState,
  disabled,
}: {
  onClick: () => void;
  refreshState: {
    status: "idle" | "loading" | "cooldown" | "error" | "success";
    remainingMs?: number;
    message?: string;
  };
  disabled: boolean;
}) {
  const isCooldown = refreshState.status === "cooldown" && refreshState.remainingMs != null;
  const cooldownLabel = isCooldown ? formatCooldown(refreshState.remainingMs!) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || refreshState.status === "loading" || isCooldown}
      className={`px-2.5 py-1 rounded-lg text-[10px] font-inter font-semibold shrink-0 cursor-pointer transition-colors ${
        disabled || refreshState.status === "loading"
          ? "bg-white/[0.04] text-[#8C8C90] cursor-not-allowed"
          : refreshState.status === "success"
            ? "bg-emerald-500/10 text-emerald-400"
            : isCooldown
              ? "bg-gold/10 text-gold cursor-not-allowed"
              : "bg-[#C81E3A]/10 text-[#C81E3A] hover:bg-[#C81E3A]/20"
      }`}
      aria-label={cooldownLabel ?? "Renew personalized tasks"}
    >
      {refreshState.status === "loading" && (
        <Loader2 className="h-3 w-3 animate-spin inline-block" />
      )}
      {refreshState.status === "success" && "Renewed"}
      {refreshState.status === "error" && "Error"}
      {isCooldown && cooldownLabel}
      {refreshState.status === "idle" && "Refresh"}
    </button>
  );
}

function formatCooldown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `Cooldown ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `Cooldown ${minutes}m ${secs}s` : `Cooldown ${minutes}m`;
}
