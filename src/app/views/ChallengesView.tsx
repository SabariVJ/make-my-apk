import React, { useState, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { motion, AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Flame,
  CheckCircle2,
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
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { TaskEditorDialog } from "../components/TaskEditorDialog";
import { EarnPlusCard } from "../components/EarnPlusCard";
import { ChallengeCategory, DailyChallenge } from "../types";
import { HexagonRadarChart } from "../components/HexagonRadarChart";
import { getChallengeState, type ChallengeState } from "@/lib/challenge.functions";
import { getPersonalizedChallenges } from "@/lib/challenge-engine";

export const ChallengesView: React.FC<{
  onOpenSixtyDay?: () => void;
  onOpenEarnPlus?: () => void;
}> = ({ onOpenSixtyDay, onOpenEarnPlus }) => {
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
  const sixtyDayCompleted = sixtyDayQuery.data?.status === "completed";
  const [selectedCategory, setSelectedCategory] = useState<ChallengeCategory | "All">("All");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyChallenge | null>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  // Fetch personalized challenges from the server when assessment data exists
  const callGetPersonalized = useServerFn(getPersonalizedChallenges);
  const personalizedQuery = useQuery<{
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

  // Merge personalized challenges with user's existing challenges
  const displayChallenges = React.useMemo(() => {
    const personalized = personalizedQuery.data?.challenges;
    if (!personalized || personalized.length === 0) return challenges;

    // Convert personalized templates to DailyChallenge format and prepend
    const personalizedChallenges: DailyChallenge[] = personalized.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category as ChallengeCategory,
      difficulty: p.difficulty as DailyChallenge["difficulty"],
      xp: p.xp,
      durationMinutes: p.durationMinutes,
      completed: false,
      isCustom: false,
    }));

    // Deduplicate: keep personalized + user's custom challenges, skip duplicates by title
    const personalizedTitles = new Set(personalizedChallenges.map((c) => c.title));
    const userCustom = challenges.filter((c) => c.isCustom || !personalizedTitles.has(c.title));

    return [...personalizedChallenges, ...userCustom];
  }, [challenges, personalizedQuery.data]);

  const [actionError, setActionError] = useState<string | null>(null);
  const handleToggle = (id: string) => {
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
        return "bg-emerald-950/80 text-emerald-400 border-emerald-800";
      case "Medium":
        return "bg-amber-950/80 text-amber-400 border-amber-800";
      case "Hard":
        return "bg-rose-950/80 text-rose-400 border-rose-800";
      case "Elite":
        return "bg-purple-950/80 text-purple-300 border-purple-800";
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {onOpenEarnPlus && <EarnPlusCard onOpen={onOpenEarnPlus} />}
      {/* 60-Day Gauntlet CTA — hidden when server confirms completion */}
      {onOpenSixtyDay && !sixtyDayCompleted && !sixtyDayQuery.isLoading && (
        <button
          onClick={onOpenSixtyDay}
          className="w-full text-left rounded-3xl overflow-hidden relative bg-gradient-to-r from-[#2A1218] via-[#17171A] to-[#17171A] border border-[#C81E3A]/30 p-5 shadow-xl shadow-[#C81E3A]/10 transition-all hover:border-[#C81E3A]/60 hover:shadow-[#C81E3A]/20 group cursor-pointer"
        >
          <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full bg-[#C81E3A]/15 blur-2xl group-hover:bg-[#C81E3A]/25 transition-colors pointer-events-none" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-[#C81E3A]/20 border border-[#C81E3A]/40 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5 text-[#C81E3A]" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-[#C81E3A] uppercase tracking-widest mb-0.5">
                  <span>60-Day Gauntlet</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 font-bold">
                    2 months SVJ Plus reward
                  </span>
                </div>
                <div className="font-anton text-lg text-white uppercase tracking-wide">
                  60 days. One code. Your reward awaits.
                </div>
              </div>
            </div>
            <span className="px-4 py-2 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold uppercase shrink-0 transition-colors">
              Open
            </span>
          </div>
        </button>
      )}

      {/* Today's Mission Banner */}
      <div className="relative rounded-3xl bg-[#17171A] border border-white/10 p-6 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#C81E3A]/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#8C8C90] uppercase tracking-wider mb-1">
              <span>Today's Mission</span>
              <span>•</span>
              <span className="text-[#C81E3A] font-bold">Daily Reset in 13h 42m</span>
            </div>
            <h1 className="font-anton text-3xl sm:text-4xl text-white uppercase tracking-wide">
              Forge Your Day
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-xs font-mono flex items-center gap-1.5 text-orange-400">
              <Flame className="w-4 h-4 fill-orange-500/20" />
              <span>{user.currentStreak} day streak</span>
            </div>
          </div>
        </div>

        {/* Progress Metrics Row */}
        <div className={`grid gap-3 mb-6 ${isAndroid ? "grid-cols-2" : "grid-cols-3"}`}>
          <div className="p-3.5 rounded-2xl bg-[#0B0B0C] border border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
              <Zap className="w-3.5 h-3.5 text-[#C81E3A]" />
              XP Today
            </div>
            <div className="font-mono text-xl font-bold text-[#C81E3A]">+{todayXP}</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0B0B0C] border border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              Completed
            </div>
            <div className="font-mono text-xl font-bold text-white">
              {completedCount}{" "}
              <span className="text-xs text-[#8C8C90] font-normal">/ {totalCount}</span>
            </div>
          </div>

          {!isAndroid && (
            <div className="p-3.5 rounded-2xl bg-[#0B0B0C] border border-white/5">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Global Rank
              </div>
              <div className="font-mono text-xl font-bold text-amber-400">#{userRank}</div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 mb-6">
          <div className="flex justify-between text-xs font-mono text-[#8C8C90]">
            <span>Daily XP Goal</span>
            <span>{todayXP} / 500 XP</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-[#0B0B0C] overflow-hidden p-0.5 border border-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.round((todayXP / 500) * 100))}%` }}
              transition={{ duration: 0.8 }}
              className="h-full rounded-full bg-gradient-to-r from-[#E62846] to-[#C81E3A]"
            />
          </div>
        </div>

        {/* 6 Dynamic Attribute Stats Hexagon Radar */}
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-widest text-white font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Character Hexagon Matrix (Level {user.level || 1})
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#C81E3A]/20 border border-[#C81E3A]/40 text-[#C81E3A] text-[10px] font-mono font-bold uppercase">
                {user.leagueRank || "APPRENTICE I"}
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#8C8C90]">
              Complete challenges to expand stats
            </span>
          </div>

          <HexagonRadarChart
            stats={
              user.stats || {
                physical: 93,
                mental: 91,
                social: 87,
                intellect: 84,
                discipline: 93,
                ambition: 95,
              }
            }
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
        <div className="flex items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? "bg-[#C81E3A] text-white font-bold shadow-lg shadow-[#C81E3A]/20"
                  : "bg-[#17171A] text-[#8C8C90] hover:text-white border border-white/5"
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
          className="px-3.5 py-1.5 rounded-xl bg-[#17171A] hover:bg-white/10 text-white border border-white/10 text-xs font-mono font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C81E3A]" />
          <span>Add Task</span>
        </button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-rose-300">
          {actionError}
        </p>
      )}

      {/* Personalized challenge insight */}
      {personalizedQuery.data && (
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#17171A] border border-[#C81E3A]/20">
          <Sparkles className="w-4 h-4 text-[#C81E3A] shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] font-mono text-[#8C8C90]">
              <span className="text-[#C81E3A] font-bold">Personalized</span> —{" "}
              {personalizedQuery.data.reason}
            </p>
          </div>
          <button
            onClick={() => personalizedQuery.refetch()}
            className="px-2.5 py-1 rounded-lg bg-[#C81E3A]/15 border border-[#C81E3A]/30 text-[#C81E3A] text-[10px] font-mono font-bold shrink-0 cursor-pointer hover:bg-[#C81E3A]/25 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Challenges List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredChallenges.map((challenge) => (
            <motion.div
              key={challenge.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => handleToggle(challenge.id)}
              className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                challenge.completed
                  ? "bg-[#17171A]/40 border-white/5 opacity-75"
                  : "bg-[#17171A] border-white/10 hover:border-[#C81E3A]/40 shadow-lg"
              }`}
            >
              <div className="flex items-start gap-3.5">
                {/* Custom Checkbox */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={challenge.completed}
                  aria-label={`Complete ${challenge.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleToggle(challenge.id);
                  }}
                  className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                    challenge.completed
                      ? "bg-[#C81E3A] border-[#C81E3A] text-white"
                      : "border-white/20 group-hover:border-[#C81E3A]"
                  }`}
                >
                  {challenge.completed && <CheckCircle2 className="w-4 h-4" />}
                </button>

                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-inter font-semibold text-sm ${
                        challenge.completed ? "line-through text-[#8C8C90]" : "text-white"
                      }`}
                    >
                      {challenge.title}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-mono border ${getDifficultyBadge(
                        challenge.difficulty,
                      )}`}
                    >
                      {challenge.difficulty}
                    </span>
                  </div>

                  <p className="text-xs text-[#8C8C90] mt-1 font-inter line-clamp-1">
                    {challenge.description}
                  </p>

                  <div className="flex items-center gap-3 text-[10px] font-mono text-[#8C8C90] mt-2">
                    <span className="text-[#C81E3A] font-semibold">{challenge.category}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {challenge.durationMinutes}m
                    </span>
                    {challenge.completedAt && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400">Done at {challenge.completedAt}</span>
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
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold shrink-0 ${
                    challenge.completed
                      ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/50"
                      : "bg-[#0B0B0C] text-[#C81E3A] border border-white/10"
                  }`}
                >
                  +{challenge.xp} XP
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

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
