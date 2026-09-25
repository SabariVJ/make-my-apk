import React, { useEffect, useState, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { motion, AnimatePresence } from "motion/react";
import { svjStaggerContainer, svjStaggerItem, svjSpringSoft, svjWhileTap } from "../lib/motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Flame,
  Check,
  Lock,
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
  Footprints,
} from "lucide-react";
import { challengeCategoryColor } from "../lib/attributeColors";
import { useSVJ } from "../context/SVJContext";
import { useActivityOptional } from "../context/ActivityContext";
import { TaskEditorDialog } from "../components/TaskEditorDialog";
import { EarnPlusCard } from "../components/EarnPlusCard";
import { SVJScoreRing } from "../components/ui-primitives/SVJScoreRing";
import { SVJSectionHeader } from "../components/ui-primitives/SVJSectionHeader";
import { SixtyDayProgramCard } from "../components/SixtyDayProgramCard";
import { ActivitySummaryCard } from "../components/ActivitySummaryCard";
import { ChallengeCategory, DailyChallenge } from "../types";
import { getChallengeState, type ChallengeState } from "@/lib/challenge.functions";
import {
  getPersonalizedChallenges,
  refreshPersonalizedChallenges,
  completePersonalizedTask,
} from "@/lib/challenge-engine.server";
import {
  getAssessmentEntryState,
  type AssessmentEntryState,
} from "@/lib/personalization.functions";
import { AssessmentView } from "./AssessmentView";
import { formatCompletedAt } from "../lib/dateFormat";
import { localDayKey } from "../lib/taskCompletions";

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
        // Invalidate profile/XP + stats so account totals and any Character
        // Matrix surface outside Challenges refresh from ledger-confirmed data.
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
    <div className="space-y-4">
      {!personalizationQuery.isLoading &&
        !personalizationQuery.data?.personalization?.assessmentCompleted && (
          <button
            type="button"
            onClick={() => setShowAssessment(true)}
            className="w-full svj-card-crimson p-4 text-left svj-press"
          >
            <span className="flex items-center gap-2 font-inter text-sm font-semibold text-[#F4F2ED]">
              <ClipboardCheck className="h-4 w-4 text-[#E62846]" /> Complete your SVJ assessment
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
      {/* Today's Mission — the ONE hero on this screen. The stat trio, the XP
          progress bar and the step counter used to each be their own
          equally-weighted block here; the daily XP goal now lives in the shared
          ScoreRing, and the secondary figures sit beside it. */}
      <section className="svj-radius-card svj-elev-3 svj-lit-top relative overflow-hidden border border-[#C81E3A]/20 bg-gradient-to-br from-[#1E1114] via-[#141416] to-[#141416] p-3.5 sm:p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-[#C81E3A] opacity-[0.14] blur-3xl"
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E62846]">
                Today&apos;s mission
              </p>
              <h1 className="mt-1 font-anton text-2xl leading-none tracking-wide text-white sm:text-3xl">
                Forge your day
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#C9A227]/25 bg-[#C9A227]/10 px-2.5 py-1.5 text-[11px] font-inter font-semibold text-[#C9A227]">
              <Flame aria-hidden className="h-3.5 w-3.5" />
              {user.currentStreak}d streak
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
            <SVJScoreRing
              value={totalTodayXp}
              max={500}
              label="Daily XP"
              tone="crimson"
              size={132}
              sublabel={`${totalTodayXp} of 500 XP earned today`}
            />
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="svj-stat p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90]">
                  <Zap aria-hidden className="h-3.5 w-3.5 text-[#C81E3A]" />
                  XP today
                </div>
                <div className="font-mono text-xl font-bold text-[#C81E3A]">+{totalTodayXp}</div>
              </div>
              <div className="svj-stat p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90]">
                  <Target aria-hidden className="h-3.5 w-3.5 text-emerald-400" />
                  Tasks done
                </div>
                <div className="font-mono text-xl font-bold text-white">
                  {completedCount}{" "}
                  <span className="text-xs font-normal text-[#8C8C90]">/ {totalCount}</span>
                </div>
              </div>
              {!isAndroid && (
                <div className="svj-stat p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90]">
                    <Sparkles aria-hidden className="h-3.5 w-3.5 text-[#C9A227]" />
                    Global rank
                  </div>
                  <div className="font-mono text-xl font-bold text-[#C9A227]">#{userRank}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Programs — demoted from two full hero cards to compact status chips.
          Each chip opens the exact destination it always did. */}
      <section className="space-y-3">
        <SVJSectionHeader title="Your programs" eyebrow="Long-running" />
        <div className="grid items-start gap-2 lg:grid-cols-2">
          {onOpenEarnPlus && <EarnPlusCard onOpen={onOpenEarnPlus} compact />}
          {onOpenSixtyDay && !sixtyDayQuery.isError && (
            <SixtyDayProgramCard
              state={sixtyDayQuery.data ?? null}
              loading={sixtyDayQuery.isLoading}
              onOpen={onOpenSixtyDay}
              compact
            />
          )}
        </div>
      </section>

      {/* Today's movement — compact live step/calorie summary. */}
      {onOpenActivity && (
        <section className="space-y-3">
          <SVJSectionHeader title="Today's movement" icon={Footprints} />
          <ActivitySummaryCard onOpen={onOpenActivity} />
        </section>
      )}

      {/* Task filters + the challenge list — the screen's actual "what do I do
          today" content. */}
      <SVJSectionHeader title="Today's tasks" trailing={undefined} />

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
        className="grid gap-2.5 lg:grid-cols-2"
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
              onClick={() => {
                // Undoing is deliberate: the checkbox owns it, so a stray tap on
                // a completed row never reverses XP.
                if (challenge.completed) return;
                handleToggle(challenge.id);
              }}
              className={`group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-[#17171A] p-3.5 transition-colors ${
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
                  aria-label={`${challenge.completed ? "Uncomplete" : "Complete"} ${challenge.title}${
                    completionLocked(challenge) ? " (locked)" : ""
                  }`}
                  title={
                    completionLocked(challenge)
                      ? "This completion can't be undone — only today's tasks are reversible."
                      : challenge.completed
                        ? "Uncheck to undo today's completion"
                        : undefined
                  }
                  disabled={
                    completingId === challenge.id ||
                    (challenge.completed && completionLocked(challenge))
                  }
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
                  ) : challenge.completed ? (
                    completionLocked(challenge) ? (
                      <Lock className="w-3 h-3 text-white/80" />
                    ) : (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    )
                  ) : null}
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
                    <span
                      className="font-medium"
                      style={{ color: challengeCategoryColor(challenge.category) }}
                    >
                      {challenge.category}
                    </span>
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
