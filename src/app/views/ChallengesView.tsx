import React, { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AnimatePresence, motion } from "motion/react";
import { svjStaggerContainer, svjStaggerItem, svjWhileTap } from "../lib/motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Flame, Loader2, Plus, RotateCw, Sparkles, Target, X } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { useActivityOptional } from "../context/ActivityContext";
import { TaskEditorDialog } from "../components/TaskEditorDialog";
import { EarnPlusCard } from "../components/EarnPlusCard";
import { SixtyDayProgramCard } from "../components/SixtyDayProgramCard";
import { ActivitySummaryCard } from "../components/ActivitySummaryCard";
import { ChallengeCard } from "../components/ChallengeCard";
import { CharacterMatrix } from "../components/CharacterMatrix";
import { XpLevelStrip } from "../components/XpLevelStrip";
import {
  ChallengeCompletionBanner,
  useChallengeCompletion,
} from "../components/ChallengeCompletionBanner";
import { SVJSkeleton, SVJEmptyState, SVJErrorState } from "../components/ui-primitives";
import { ChallengeCategory, DailyChallenge } from "../types";
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
import { localDayKey, type TaskCompletion } from "../lib/taskCompletions";
import { categoryColor } from "../lib/challengeUI";
import type { AttributeKey } from "../lib/designTokens";

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
    getTodayCompletion,
    taskCompletions,
  } = useSVJ();

  // Signature completion moment — concise, auto-dismissing, server-fed numbers.
  const completionFlash = useChallengeCompletion();

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
  const [selectedKey, setSelectedKey] = useState<ChallengeCategory | "All">("All");
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
          setRefreshState({ status: "cooldown", remainingMs: result.cooldownRemainingMs });
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

  // ── Matrix data ───────────────────────────────────────────────────────────
  // Assessment-backed stats are mapped onto the six attributes using the same
  // relationship the data tables define. Fallbacks reflect the attribute the
  // server stat READ would land on — never invented magnitudes.
  const serverStats: UserStatsData | null = statsQuery.data ?? null;
  const radarStats: Record<AttributeKey, number> = useMemo(() => {
    const s = serverStats;
    if (s) {
      return {
        physical: s.fitness,
        discipline: s.discipline,
        mental: s.focus,
        intellect: s.nutrition,
        ambition: s.consistency,
        social: s.social,
      };
    }
    const local = user.stats;
    return {
      physical: local.physical,
      discipline: local.discipline,
      mental: local.mental,
      intellect: local.intellect,
      ambition: local.ambition,
      social: local.social,
    };
  }, [serverStats, user.stats]);

  const radarUserStats = useMemo(
    () => ({
      physical: radarStats.physical,
      discipline: radarStats.discipline,
      mental: radarStats.mental,
      intellect: radarStats.intellect,
      ambition: radarStats.ambition,
      social: radarStats.social,
    }),
    [radarStats],
  );

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

  /**
   * A completion is reversible only when it happened TODAY and has a stored
   * ledger row whose exact payout can be reversed. Personalized rows are
   * server-owned (no un-complete path) and older days stay read-only history.
   */
  const completionLocked = (challenge: DailyChallenge): boolean => {
    if (!challenge.isPersonalized && getTodayCompletion(challenge.id)) return false;
    const completedAt = challenge.completedAt;
    if (!challenge.isPersonalized && completedAt) {
      const parsed = new Date(completedAt);
      if (!Number.isNaN(parsed.getTime()) && localDayKey(parsed) === localDayKey()) return false;
    }
    return true;
  };

  /**
   * Personalized assignments complete through the server-validated RPC —
   * never through the local toggleChallenge()/applyActivityXp path. This
   * removes the false "This task is no longer available" error (their IDs
   * are not local challenge IDs) and keeps XP server-controlled.
   */
  const handlePersonalizedComplete = async (challenge: DailyChallenge) => {
    if (completingId) return; // prevent duplicate taps on the pending task
    setCompletingId(challenge.id);
    setActionError(null);
    try {
      const result = (await callCompletePersonalized({
        data: { assignmentId: challenge.id },
      })) as {
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

      // Banner figures come from the server response — XP is never computed
      // or mutated client-side.
      completionFlash.display({
        id: `personalized-${challenge.id}-${Date.now()}`,
        title: challenge.title,
        category: challenge.category,
        xpAwarded: result.xpAwarded ?? challenge.xp,
        newTotalXp: user.totalXP + (result.xpAwarded ?? challenge.xp),
      });
    } catch {
      setActionError("Could not complete this task. Please retry.");
    } finally {
      setCompletingId(null);
    }
  };

  const handleToggle = (challenge: DailyChallenge) => {
    // Locked history can't be undone: personalized rows are server-owned and
    // older days have no reversible payout. The disabled checkbox backs this.
    if (challenge.completed && completionLocked(challenge)) return;
    if (personalizedQuery.data?.challenges?.some((p) => p.id === challenge.id)) {
      // Personalized rows complete through the server RPC; they never undo.
      if (challenge.completed) return;
      void handlePersonalizedComplete(challenge);
      return;
    }

    // Local completion is a true toggle: the checkbox completes today's task
    // AND undoes it. The banner only celebrates a completion — undoing is
    // silent, since XP already went back down.
    const wasCompleted = challenge.completed;
    const beforeXP = user.totalXP;
    const result = toggleChallenge(challenge.id);
    setActionError(result.ok ? null : result.error);
    if (result.ok && !wasCompleted) {
      const xpAwarded = challenge.earnedXP ?? challenge.xp;
      completionFlash.display({
        id: `local-${challenge.id}-${Date.now()}`,
        title: challenge.title,
        category: challenge.category,
        xpAwarded,
        newTotalXp: beforeXP + xpAwarded,
        // Re-completing today reuses the original payout; the banner says
        // "Completed again" instead of implying a fresh XP award.
        reused: (result as { reused?: boolean }).reused,
      });
    }
  };

  const sortedLeaderboard = [...leaderboard].sort((a, b) => b.totalXP - a.totalXP);
  const myIndexInSorted = sortedLeaderboard.findIndex(
    (l) => l.id === user.id || l.id === "user-me",
  );
  const userRank = myIndexInSorted !== -1 ? myIndexInSorted + 1 : sortedLeaderboard.length;

  const filteredChallenges =
    selectedKey === "All"
      ? displayChallenges
      : displayChallenges.filter((c) => c.category === selectedKey);

  const completedCount = displayChallenges.filter((c) => c.completed).length;
  const totalCount = displayChallenges.length;
  // Task XP today is the sum of the STORED payouts on rows still completed —
  // never the nominal challenge XP, so a re-check reuses the original amount.
  const todayXP = displayChallenges
    .filter((c) => c.completed)
    .reduce((acc, c) => acc + (c.earnedXP ?? c.xp), 0);
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

  // Answers "what should I do first": highest-XP, incomplete, available task.
  const availableChallenges = displayChallenges.filter((c) => !c.completed);
  const primaryObjective =
    availableChallenges.length > 0
      ? [...availableChallenges].sort((a, b) => (b.earnedXP ?? b.xp) - (a.earnedXP ?? a.xp))[0]
      : null;

  // ── Contribution evidence (real completion-ledger rows only) ─────────────
  const todayKey = localDayKey();
  const todayActiveRows: TaskCompletion[] = taskCompletions.filter(
    (row) => row.dayKey === todayKey && !row.undoneAt,
  );
  const matrixContributions = todayActiveRows.map((row) => ({
    statCategory: row.statCategory,
    statPoints: row.statPoints,
  }));

  const loadingChallenges = personalizationQuery.isLoading || personalizedQuery.isLoading;
  // Failures should never hide real local/custom challenges; the error surface
  // only appears when there is nothing else to render.
  const serverListFailed = personalizationQuery.isError || personalizedQuery.isError;

  const retryAll = () => {
    void personalizationQuery.refetch();
    void personalizedQuery.refetch();
    void statsQuery.refetch();
  };

  return (
    <div className="space-y-4 pb-24" data-testid="challenges-view">
      {/* ── Assessment gate ─────────────────────────────────────────────── */}
      {!personalizationQuery.isLoading &&
        !personalizationQuery.data?.personalization?.assessmentCompleted && (
          <button
            type="button"
            onClick={() => setShowAssessment(true)}
            className="w-full svj-card-crimson p-4 text-left svj-press"
          >
            <span className="flex items-center gap-2 font-anton text-sm uppercase tracking-wide text-white">
              <ClipboardCheck className="h-4 w-4 text-[#C81E3A]" aria-hidden="true" />
              Complete Your SVJ Assessment
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
            <X className="h-5 w-5" aria-hidden="true" />
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

      {/* ── HERO — orientation without overwhelm ─────────────────────────── */}
      <section
        aria-label="Today overview"
        className="overflow-hidden rounded-2xl border border-white/[0.06] bg-svj-surface"
      >
        <div className="h-0.5 w-full bg-svj-crimson" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            <p className="svj-label-xs flex items-center gap-1.5 uppercase tracking-[0.14em]">
              <Target className="h-3.5 w-3.5 text-svj-crimson" aria-hidden="true" />
              Today's Mission
            </p>
            <h1 className="svj-heading text-2xl leading-tight sm:text-3xl">Forge Your Day</h1>
          </div>
          <div
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.06] bg-svj-bg px-2.5 py-1.5"
            title="Current streak"
          >
            <Flame className="h-4 w-4 text-gold" aria-hidden="true" />
            <span className="font-mono text-xs font-semibold tabular-nums text-gold">
              {user.currentStreak}
            </span>
            <span className="font-inter text-[10px] uppercase tracking-wide text-svj-secondary">
              day streak
            </span>
          </div>
        </div>

        {/* XP / level progression — the ONE premium treatment. */}
        <XpLevelStrip
          totalXp={user.totalXP}
          todayXp={totalTodayXp}
          level={user.level}
          className="px-4 pt-3 sm:px-5"
        />

        {onOpenActivity && <ActivitySummaryCard onOpen={onOpenActivity} />}

        {/* Character Matrix — the signature graphic, as hero preview. */}
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-2 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <span className="svj-label-xs flex items-center gap-1.5 uppercase tracking-[0.14em] text-svj-text">
              <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
              Character Matrix — Level {user.level || 1}
            </span>
            <span className="shrink-0 rounded bg-svj-crimson/10 px-2 py-0.5 font-inter text-[10px] font-semibold uppercase text-svj-crimson">
              {user.leagueRank || "APPRENTICE I"}
            </span>
          </div>

          <CharacterMatrix
            className="mt-1"
            stats={radarUserStats}
            interactive
            contributions={matrixContributions}
          />
        </div>
      </section>

      {/* ── Filters + Add Task ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5">
          {categories.map((cat) => {
            const active = selectedKey === cat;
            const catHex = cat === "All" ? undefined : categoryColor(cat as ChallengeCategory);
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedKey(cat)}
                className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 font-inter text-[11px] font-medium transition-colors ${
                  active
                    ? "border-svj-crimson/40 bg-svj-crimson/10 text-svj-text"
                    : "border-white/[0.06] bg-svj-surface text-svj-secondary hover:text-white"
                }`}
              >
                {cat !== "All" && catHex && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: catHex }}
                    aria-hidden="true"
                  />
                )}
                {cat}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={(event) => {
            editorTrigger.current = event.currentTarget;
            setEditingTask(null);
            setIsAddModalOpen(true);
          }}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.06] bg-svj-surface px-3 py-2 font-inter text-[11px] font-medium text-white hover:bg-white/[0.06]"
        >
          <Plus className="h-3.5 w-3.5 text-svj-crimson" aria-hidden="true" />
          <span>Add Task</span>
        </button>
      </div>

      {actionError && (
        <SVJErrorState title="Couldn't update this task" message={actionError} compact />
      )}

      {/* ── Daily challenge list — real state, clear hierarchy ───────────── */}
      {loadingChallenges ? (
        <div role="status" aria-label="Loading challenges" className="space-y-3">
          <SVJSkeleton className="h-24 w-full rounded-2xl" />
          <SVJSkeleton className="h-24 w-full rounded-2xl" />
          <SVJSkeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : serverListFailed && displayChallenges.length === 0 ? (
        <SVJErrorState
          title="Challenges unavailable"
          message="We couldn't load your challenges. Check your connection and try again."
          action={
            <button
              type="button"
              onClick={retryAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-svj-crimson px-3.5 py-2 font-inter text-xs font-semibold text-white hover:bg-svj-crimson-hover svj-press"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          }
        />
      ) : filteredChallenges.length === 0 ? (
        <section aria-label="Challenges">
          <div className="mb-3">
            <h2 className="svj-heading text-sm">
              {selectedKey === "All" ? "Daily Challenges" : selectedKey}
            </h2>
          </div>
          <SVJEmptyState
            icon={Sparkles}
            title="No challenges here"
            description={
              selectedKey === "All"
                ? "Daily challenges are generated once you complete the SVJ Assessment, matched to your goals and growth areas."
                : "No challenges in this category yet. Complete the assessment or add your own task."
            }
          />
        </section>
      ) : (
        <section aria-label="Challenges">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="svj-heading text-sm">
                {selectedKey === "All" ? "Daily Challenges" : selectedKey}
              </h2>
              {completedCount > 0 && (
                <p className="mt-0.5 svj-label-xs">
                  {completedCount} of {totalCount} complete
                </p>
              )}
            </div>
            {/* Tertiary context — supporting, not louder than the list. */}
            {!isAndroid && totalCount > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-svj-secondary">
                Global rank #{userRank}
              </span>
            )}
          </div>

          <motion.div
            variants={svjStaggerContainer}
            initial="hidden"
            animate="show"
            className="space-y-2.5"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredChallenges.map((challenge) => (
                <motion.div
                  key={challenge.id}
                  layout
                  variants={svjStaggerItem}
                  whileTap={svjWhileTap}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                >
                  <ChallengeCard
                    challenge={challenge}
                    pending={completingId === challenge.id}
                    completionLocked={completionLocked(challenge)}
                    isPrimary={primaryObjective?.id === challenge.id}
                    onToggle={handleToggle}
                    onEdit={(c) => {
                      editorTrigger.current = document.activeElement as HTMLButtonElement | null;
                      setEditingTask(c);
                      setIsAddModalOpen(true);
                    }}
                    onRemove={(c) => removeChallenge(c.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </section>
      )}

      {/* ── Personalized context — real reasoning from the engine ────────── */}
      {personalizedQuery.data &&
        personalizationQuery.data?.personalization?.assessmentCompleted && (
          <section aria-label="Personalization" data-testid="personalized-reason">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate font-inter text-[11px] text-svj-secondary">
                <span className="font-semibold text-svj-crimson">Personalized</span> —{" "}
                {personalizedQuery.data.reason}
              </p>
              <RefreshButton
                onClick={handleRefreshPersonalized}
                refreshState={refreshState}
                disabled={refreshState.status === "loading"}
              />
            </div>
          </section>
        )}

      {/* Signature completion moment — concise, auto-dismissing, never a modal. */}
      <ChallengeCompletionBanner flash={completionFlash.active} />

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
      className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-inter font-semibold transition-colors ${
        disabled || refreshState.status === "loading"
          ? "cursor-not-allowed bg-white/[0.04] text-[#8C8C90]"
          : refreshState.status === "success"
            ? "bg-emerald-500/10 text-emerald-400"
            : isCooldown
              ? "cursor-not-allowed bg-gold/10 text-gold"
              : "bg-[#C81E3A]/10 text-[#C81E3A] hover:bg-[#C81E3A]/20"
      }`}
      aria-label={cooldownLabel ?? "Renew personalized tasks"}
    >
      {refreshState.status === "loading" && (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
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
