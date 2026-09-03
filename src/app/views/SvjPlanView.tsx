import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  Dumbbell,
  Shield,
  Clock,
  Users,
  Apple,
  Zap,
  ChevronRight,
  Sparkles,
  Calendar,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getUserStats,
  getPersonalization,
  type UserStatsData,
  type PersonalizationData,
} from "@/lib/personalization.functions";
import { getChallengeInsights, selectPersonalizedChallenges } from "@/lib/challenge-engine";

// ── Stat display config ──────────────────────────────────────────────────

interface StatDisplay {
  key: keyof UserStatsData;
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  gradient: string;
}

const STAT_DISPLAY: StatDisplay[] = [
  {
    key: "fitness",
    label: "Fitness",
    icon: Dumbbell,
    color: "text-orange-400",
    gradient: "from-orange-500 to-red-500",
  },
  {
    key: "discipline",
    label: "Discipline",
    icon: Shield,
    color: "text-blue-400",
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    key: "focus",
    label: "Focus",
    icon: Brain,
    color: "text-purple-400",
    gradient: "from-purple-500 to-violet-500",
  },
  {
    key: "confidence",
    label: "Confidence",
    icon: Zap,
    color: "text-amber-400",
    gradient: "from-amber-500 to-yellow-500",
  },
  {
    key: "social",
    label: "Social",
    icon: Users,
    color: "text-teal-400",
    gradient: "from-teal-500 to-emerald-500",
  },
  {
    key: "nutrition",
    label: "Nutrition",
    icon: Apple,
    color: "text-green-400",
    gradient: "from-green-500 to-lime-500",
  },
  {
    key: "recovery",
    label: "Recovery",
    icon: Clock,
    color: "text-sky-400",
    gradient: "from-sky-500 to-blue-500",
  },
  {
    key: "consistency",
    label: "Consistency",
    icon: Calendar,
    color: "text-rose-400",
    gradient: "from-rose-500 to-pink-500",
  },
];

// ── Helper functions ─────────────────────────────────────────────────────

function getStatLevel(score: number): string {
  if (score >= 80) return "Mastery";
  if (score >= 60) return "Strong";
  if (score >= 40) return "Growing";
  if (score >= 20) return "Developing";
  return "Starting";
}

function getStatColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-blue-400";
  if (score >= 40) return "text-amber-400";
  return "text-rose-400";
}

function getWeekLabel(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${fmt(monday)} — ${fmt(sunday)}`;
}

// ── Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  stat,
  baseline,
  index,
}: {
  stat: StatDisplay;
  baseline?: number;
  index: number;
}) {
  const { user } = useSVJ();
  const currentValue =
    user.stats?.[stat.key.replace(/([A-Z])/g, "_$1").toLowerCase() as keyof typeof user.stats] ??
    50;
  const baselineVal = baseline ?? currentValue;
  const delta = currentValue - baselineVal;
  const Icon = stat.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="relative p-4 rounded-2xl bg-[#17171A] border border-white/10 overflow-hidden"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-5`} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${stat.color}`} />
            <span className="text-xs font-mono uppercase tracking-wider text-[#8C8C90]">
              {stat.label}
            </span>
          </div>
          <span className={`text-[10px] font-mono font-bold ${getStatColor(currentValue)}`}>
            {getStatLevel(currentValue)}
          </span>
        </div>

        <div className="flex items-end gap-3">
          <span className="font-mono text-2xl font-bold text-white">{currentValue}</span>
          {delta !== 0 && (
            <span
              className={`flex items-center gap-0.5 text-[10px] font-mono font-bold mb-1 ${
                delta > 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {delta > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${currentValue}%` }}
            transition={{ delay: index * 0.05 + 0.2, duration: 0.6 }}
            className={`h-full rounded-full bg-gradient-to-r ${stat.gradient}`}
          />
        </div>

        {baselineVal !== currentValue && (
          <div className="mt-1.5 flex items-center gap-1 text-[9px] font-mono text-[#8C8C90]">
            <span>Baseline: {baselineVal}</span>
            <span>•</span>
            <span className={delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : ""}>
              {delta > 0
                ? `+${delta} since start`
                : delta < 0
                  ? `${delta} since start`
                  : "No change"}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Priority Card ────────────────────────────────────────────────────────

function PriorityCard({ areas, reason }: { areas: string[]; reason: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-5 rounded-2xl bg-gradient-to-br from-[#2A1218] via-[#17171A] to-[#17171A] border border-[#C81E3A]/30"
    >
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 text-[#C81E3A]" />
        <span className="font-anton text-sm uppercase tracking-wider text-[#C81E3A]">
          This Week's Priority
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {areas.map((area) => (
          <span
            key={area}
            className="px-3 py-1 rounded-xl bg-[#C81E3A]/20 border border-[#C81E3A]/40 text-[#C81E3A] text-xs font-mono font-bold"
          >
            {area}
          </span>
        ))}
      </div>

      <p className="text-xs font-inter text-[#B8B8C0] leading-relaxed">{reason}</p>
    </motion.div>
  );
}

// ── Mission Card ─────────────────────────────────────────────────────────

function MissionCard({
  title,
  description,
  category,
  difficulty,
  xp,
  index,
}: {
  title: string;
  description: string;
  category: string;
  difficulty: string;
  xp: number;
  index: number;
}) {
  const diffColor =
    difficulty === "Easy"
      ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
      : difficulty === "Medium"
        ? "bg-amber-950/80 text-amber-400 border-amber-800"
        : difficulty === "Hard"
          ? "bg-rose-950/80 text-rose-400 border-rose-800"
          : "bg-purple-950/80 text-purple-300 border-purple-800";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
      className="flex items-center gap-4 p-4 rounded-2xl bg-[#17171A] border border-white/10 hover:border-white/20 transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-[#C81E3A]/15 border border-[#C81E3A]/30 flex items-center justify-center shrink-0">
        <span className="text-lg">🎯</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-inter font-semibold text-sm text-white truncate">{title}</h4>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${diffColor}`}>
            {difficulty}
          </span>
        </div>
        <p className="text-[11px] text-[#8C8C90] mt-0.5 line-clamp-1">{description}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-mono text-[#C81E3A]">{category}</span>
          <span className="text-[10px] font-mono text-[#8C8C90]">•</span>
          <span className="text-[10px] font-mono text-[#C81E3A] font-bold">+{xp} XP</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-[#8C8C90] shrink-0" />
    </motion.div>
  );
}

// ── Main View ────────────────────────────────────────────────────────────

export const SvjPlanView: React.FC = () => {
  const { user, isPlusMember } = useSVJ();
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month">("week");

  const callGetStats = useServerFn(getUserStats);
  const callGetPersonalization = useServerFn(getPersonalization);

  const { data: serverStats } = useQuery<UserStatsData | null>({
    queryKey: ["user-stats"],
    queryFn: async () => {
      try {
        return (await callGetStats({})) as UserStatsData;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: personalization } = useQuery<PersonalizationData | null>({
    queryKey: ["personalization"],
    queryFn: async () => {
      try {
        return (await callGetPersonalization({})) as PersonalizationData;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const stats = serverStats ?? {
    fitness: user.stats?.physical ?? 50,
    discipline: user.stats?.discipline ?? 50,
    focus: user.stats?.mental ?? 50,
    confidence: user.stats?.intellect ?? 50,
    social: user.stats?.social ?? 50,
    nutrition: 50,
    recovery: 50,
    consistency: 50,
  };

  const goals = personalization?.goals ?? [];
  const insights = useMemo(() => getChallengeInsights(stats, goals), [stats, goals]);
  const weeklyChallenges = useMemo(
    () => selectPersonalizedChallenges(stats, goals, [], 6),
    [stats, goals],
  );

  const avgScore = Math.round(
    (stats.fitness +
      stats.discipline +
      stats.focus +
      stats.confidence +
      stats.social +
      stats.nutrition +
      stats.recovery +
      stats.consistency) /
      8,
  );

  const weekLabel = getWeekLabel();

  // Compute weakest/strongest for summary
  const statEntries: [string, number][] = STAT_DISPLAY.map((s) => [
    s.label,
    stats[s.key as keyof UserStatsData] ?? 50,
  ]);
  statEntries.sort((a, b) => a[1] - b[1]);
  const weakest = statEntries[0];
  const strongest = statEntries[statEntries.length - 1];

  // Is this a Plus feature? Show upgrade prompt for free users
  const isPlus = isPlusMember === true;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="relative rounded-3xl bg-[#17171A] border border-white/10 p-6 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#C81E3A]/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#C81E3A] uppercase tracking-widest mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>MY SVJ PLAN</span>
            {!isPlus && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-400 font-bold">
                PLUS FEATURE
              </span>
            )}
          </div>
          <h1 className="font-anton text-2xl sm:text-3xl text-white uppercase tracking-wide">
            Your Weekly Blueprint
          </h1>
          <p className="text-xs font-mono text-[#8C8C90] mt-1">{weekLabel}</p>
        </div>
      </div>

      {!isPlus ? (
        /* Upgrade prompt for free users */
        <div className="p-6 rounded-2xl bg-[#17171A] border border-white/10 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#C81E3A]/15 border border-[#C81E3A]/30 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-[#C81E3A]" />
          </div>
          <div>
            <h3 className="font-anton text-lg text-white uppercase">Unlock MY SVJ PLAN</h3>
            <p className="text-xs text-[#8C8C90] mt-1 max-w-sm mx-auto">
              Get personalized weekly analysis, stat intelligence, priority areas, and adaptive
              challenge recommendations based on your actual progress.
            </p>
          </div>
          <div className="space-y-2 text-xs text-left max-w-sm mx-auto">
            <div className="flex items-center gap-2 text-[#B8B8C0]">
              <Target className="w-3.5 h-3.5 text-[#C81E3A]" />
              <span>Weekly stat analysis with trends</span>
            </div>
            <div className="flex items-center gap-2 text-[#B8B8C0]">
              <Brain className="w-3.5 h-3.5 text-[#C81E3A]" />
              <span>Priority area identification</span>
            </div>
            <div className="flex items-center gap-2 text-[#B8B8C0]">
              <Zap className="w-3.5 h-3.5 text-[#C81E3A]" />
              <span>Personalized weekly missions</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Average Score */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#17171A] border border-white/10">
            <div>
              <span className="text-[10px] font-mono text-[#8C8C90] uppercase">Overall Score</span>
              <div className="font-mono text-3xl font-bold text-white mt-0.5">{avgScore}</div>
            </div>
            <div className="text-right space-y-1">
              <div className="text-[10px] font-mono text-[#8C8C90]">
                Strongest: <span className="text-emerald-400">{strongest[0]}</span>
              </div>
              <div className="text-[10px] font-mono text-[#8C8C90]">
                Focus Area: <span className="text-amber-400">{weakest[0]}</span>
              </div>
            </div>
          </div>

          {/* This Week's Priority */}
          <PriorityCard areas={insights.focusAreas} reason={insights.reason} />

          {/* 8 Stat Cards Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-anton text-sm uppercase tracking-wider text-white">
                Attribute Matrix
              </h3>
              <div className="flex gap-1">
                {(["week", "month"] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all ${
                      selectedPeriod === period
                        ? "bg-[#C81E3A] text-white"
                        : "bg-[#17171A] text-[#8C8C90] hover:text-white border border-white/10"
                    }`}
                  >
                    {period === "week" ? "7D" : "30D"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {STAT_DISPLAY.map((stat, i) => (
                <StatCard
                  key={stat.key}
                  stat={stat}
                  baseline={
                    serverStats
                      ? ((serverStats as unknown as Record<string, number>)[
                          `baseline_${stat.key}`
                        ] as number | undefined)
                      : undefined
                  }
                  index={i}
                />
              ))}
            </div>
          </div>

          {/* Recommended Missions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-[#C81E3A]" />
              <h3 className="font-anton text-sm uppercase tracking-wider text-white">
                This Week's Missions
              </h3>
            </div>
            <div className="space-y-2">
              {weeklyChallenges.map((challenge, i) => (
                <MissionCard
                  key={challenge.title}
                  title={challenge.title}
                  description={challenge.description}
                  category={challenge.category}
                  difficulty={challenge.difficulty}
                  xp={
                    challenge.difficulty === "Easy"
                      ? 50
                      : challenge.difficulty === "Medium"
                        ? 80
                        : challenge.difficulty === "Hard"
                          ? 120
                          : 180
                  }
                  index={i}
                />
              ))}
            </div>
          </div>

          {/* Week Summary */}
          <div className="p-5 rounded-2xl bg-[#17171A] border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-[#C81E3A]" />
              <h3 className="font-anton text-sm uppercase tracking-wider text-white">
                Week Summary
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5">
                <div className="font-mono text-xl font-bold text-white">
                  {user.totalChallengesCompleted}
                </div>
                <div className="text-[10px] font-mono text-[#8C8C90] uppercase">
                  Challenges Done
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5">
                <div className="font-mono text-xl font-bold text-[#C81E3A]">
                  {user.currentStreak}
                </div>
                <div className="text-[10px] font-mono text-[#8C8C90] uppercase">Day Streak</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5">
                <div className="font-mono text-xl font-bold text-white">{goals.length}</div>
                <div className="text-[10px] font-mono text-[#8C8C90] uppercase">Active Goals</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5">
                <div className="font-mono text-xl font-bold text-emerald-400">+{user.weeklyXP}</div>
                <div className="text-[10px] font-mono text-[#8C8C90] uppercase">XP This Week</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
