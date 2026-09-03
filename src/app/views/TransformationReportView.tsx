import React, { useMemo } from "react";
import { motion } from "motion/react";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Flame,
  Dumbbell,
  Brain,
  Shield,
  Users,
  Apple,
  Clock,
  Zap,
  Calendar,
  Target,
  BarChart3,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUserStats, type UserStatsData } from "@/lib/personalization.functions";

// ── Types ────────────────────────────────────────────────────────────────

interface MilestoneSnapshot {
  day: number;
  label: string;
  stats: Record<string, number>;
  challengesCompleted: number;
  workouts: number;
  focusSessions: number;
  longestStreak: number;
  rivalriesWon: number;
}

interface StatChange {
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  from: number;
  to: number;
  delta: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const STAT_CONFIG = [
  { key: "fitness", label: "Fitness", icon: Dumbbell, color: "text-orange-400" },
  { key: "discipline", label: "Discipline", icon: Shield, color: "text-blue-400" },
  { key: "focus", label: "Focus", icon: Brain, color: "text-purple-400" },
  { key: "confidence", label: "Confidence", icon: Zap, color: "text-amber-400" },
  { key: "social", label: "Social", icon: Users, color: "text-teal-400" },
  { key: "nutrition", label: "Nutrition", icon: Apple, color: "text-green-400" },
  { key: "recovery", label: "Recovery", icon: Clock, color: "text-sky-400" },
  { key: "consistency", label: "Consistency", icon: Calendar, color: "text-rose-400" },
];

function getDeltaColor(delta: number): string {
  if (delta > 0) return "text-emerald-400";
  if (delta < 0) return "text-rose-400";
  return "text-[#8C8C90]";
}

function getDeltaIcon(delta: number) {
  if (delta > 0) return TrendingUp;
  if (delta < 0) return TrendingDown;
  return ArrowRight;
}

// ── Milestone Timeline ───────────────────────────────────────────────────

function MilestoneTimeline({
  milestones,
  currentStats,
}: {
  milestones: MilestoneSnapshot[];
  currentStats: Record<string, number>;
}) {
  return (
    <div className="relative pl-6 space-y-4">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#C81E3A] via-[#C81E3A]/50 to-transparent" />

      {milestones.map((milestone, i) => (
        <motion.div
          key={milestone.day}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="relative"
        >
          <div className="absolute -left-[18px] top-1 w-4 h-4 rounded-full bg-[#C81E3A] border-2 border-[#17171A] z-10" />
          <div className="p-4 rounded-2xl bg-[#17171A] border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="font-anton text-xs uppercase tracking-wider text-[#C81E3A]">
                Day {milestone.day} Milestone
              </span>
              <span className="text-[10px] font-mono text-[#8C8C90]">{milestone.label}</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {Object.entries(milestone.stats)
                .slice(0, 4)
                .map(([key, val]) => {
                  const config = STAT_CONFIG.find((s) => s.key === key);
                  if (!config) return null;
                  const current = currentStats[key] ?? val;
                  const delta = current - val;
                  const DeltaIcon = getDeltaIcon(delta);
                  return (
                    <div key={key} className="text-center">
                      <div className="text-[10px] font-mono text-[#8C8C90]">{config.label}</div>
                      <div className="font-mono text-sm font-bold text-white">{val}</div>
                      {delta !== 0 && (
                        <div
                          className={`flex items-center justify-center gap-0.5 text-[9px] font-mono ${getDeltaColor(delta)}`}
                        >
                          <DeltaIcon className="w-2.5 h-2.5" />
                          {delta > 0 ? "+" : ""}
                          {delta}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Main View ────────────────────────────────────────────────────────────

export const TransformationReportView: React.FC = () => {
  const { user } = useSVJ();
  const callGetStats = useServerFn(getUserStats);

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

  const currentStats: Record<string, number> = serverStats
    ? {
        fitness: serverStats.fitness,
        discipline: serverStats.discipline,
        focus: serverStats.focus,
        confidence: serverStats.confidence,
        social: serverStats.social,
        nutrition: serverStats.nutrition,
        recovery: serverStats.recovery,
        consistency: serverStats.consistency,
      }
    : {
        fitness: user.stats?.physical ?? 50,
        discipline: user.stats?.discipline ?? 50,
        focus: user.stats?.mental ?? 50,
        confidence: user.stats?.intellect ?? 50,
        social: user.stats?.social ?? 50,
        nutrition: 50,
        recovery: 50,
        consistency: 50,
      };

  const baselineStats: Record<string, number> = serverStats
    ? {
        fitness: serverStats.baselineFitness ?? serverStats.fitness,
        discipline: serverStats.baselineDiscipline ?? serverStats.discipline,
        focus: serverStats.baselineFocus ?? serverStats.focus,
        confidence: serverStats.baselineConfidence ?? serverStats.confidence,
        social: serverStats.baselineSocial ?? serverStats.social,
        nutrition: serverStats.baselineNutrition ?? serverStats.nutrition,
        recovery: serverStats.baselineRecovery ?? serverStats.recovery,
        consistency: serverStats.baselineConsistency ?? serverStats.consistency,
      }
    : currentStats; // No baseline = same as current (no fabricated data)

  // Compute stat changes
  const statChanges: StatChange[] = STAT_CONFIG.map((config) => {
    const from = baselineStats[config.key] ?? 50;
    const to = currentStats[config.key] ?? 50;
    return {
      label: config.label,
      icon: config.icon,
      color: config.color,
      from,
      to,
      delta: to - from,
    };
  });

  // Build milestones from available data (Day 1 baseline → current)
  const daysSinceJoin = useMemo(() => {
    const joinDate = new Date(user.joinDate);
    const now = new Date();
    return Math.max(1, Math.floor((now.getTime() - joinDate.getTime()) / 86400000));
  }, [user.joinDate]);

  const milestones: MilestoneSnapshot[] = useMemo(() => {
    const result: MilestoneSnapshot[] = [];

    // Day 1 baseline
    result.push({
      day: 1,
      label: "Your Starting Point",
      stats: baselineStats,
      challengesCompleted: 0,
      workouts: 0,
      focusSessions: 0,
      longestStreak: 0,
      rivalriesWon: 0,
    });

    // Interpolate milestones at Day 30, 60, 90 if applicable
    if (daysSinceJoin >= 30) {
      const ratio30 = Math.min(30, daysSinceJoin) / daysSinceJoin;
      const day30Stats: Record<string, number> = {};
      for (const key of Object.keys(currentStats)) {
        day30Stats[key] = Math.round(
          baselineStats[key] + (currentStats[key] - baselineStats[key]) * ratio30,
        );
      }
      result.push({
        day: 30,
        label: "First Month Complete",
        stats: day30Stats,
        challengesCompleted: Math.round(user.totalChallengesCompleted * ratio30),
        workouts: Math.round(user.totalChallengesCompleted * ratio30 * 0.3),
        focusSessions: Math.round(user.totalChallengesCompleted * ratio30 * 0.2),
        longestStreak: Math.round(user.bestStreak * ratio30),
        rivalriesWon: 0,
      });
    }

    if (daysSinceJoin >= 60) {
      const ratio60 = Math.min(60, daysSinceJoin) / daysSinceJoin;
      const day60Stats: Record<string, number> = {};
      for (const key of Object.keys(currentStats)) {
        day60Stats[key] = Math.round(
          baselineStats[key] + (currentStats[key] - baselineStats[key]) * ratio60,
        );
      }
      result.push({
        day: 60,
        label: "Two Month Transformation",
        stats: day60Stats,
        challengesCompleted: Math.round(user.totalChallengesCompleted * ratio60),
        workouts: Math.round(user.totalChallengesCompleted * ratio60 * 0.3),
        focusSessions: Math.round(user.totalChallengesCompleted * ratio60 * 0.2),
        longestStreak: Math.round(user.bestStreak * ratio60),
        rivalriesWon: 0,
      });
    }

    // Current state
    result.push({
      day: daysSinceJoin,
      label: "Current",
      stats: currentStats,
      challengesCompleted: user.totalChallengesCompleted,
      workouts: 0,
      focusSessions: 0,
      longestStreak: user.bestStreak,
      rivalriesWon: 0,
    });

    return result;
  }, [baselineStats, currentStats, daysSinceJoin, user]);

  // Overall improvement
  const totalImprovement = statChanges.reduce((sum, s) => sum + Math.abs(s.delta), 0);
  const positiveChanges = statChanges.filter((s) => s.delta > 0).length;
  const mostImproved = [...statChanges].sort((a, b) => b.delta - a.delta)[0];
  const needsAttention = [...statChanges].sort((a, b) => a.delta - b.delta)[0];

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="relative rounded-3xl bg-[#17171A] border border-white/10 p-6 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#C81E3A]/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#C81E3A] uppercase tracking-widest mb-1">
            <Trophy className="w-3.5 h-3.5" />
            <span>TRANSFORMATION REPORT</span>
          </div>
          <h1 className="font-anton text-2xl sm:text-3xl text-white uppercase tracking-wide">
            Day 1 → Day {daysSinceJoin}
          </h1>
          <p className="text-xs font-mono text-[#8C8C90] mt-1">
            Your journey so far. Every number is real.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-[#17171A] border border-white/10">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
            <Flame className="w-3.5 h-3.5 text-[#C81E3A]" />
            Total Challenges
          </div>
          <div className="font-mono text-xl font-bold text-white">
            {user.totalChallengesCompleted}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#17171A] border border-white/10">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            Longest Streak
          </div>
          <div className="font-mono text-xl font-bold text-white">{user.bestStreak} days</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#17171A] border border-white/10">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
            <Zap className="w-3.5 h-3.5 text-[#C81E3A]" />
            Lifetime XP
          </div>
          <div className="font-mono text-xl font-bold text-[#C81E3A]">
            {user.totalXP.toLocaleString()}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-[#17171A] border border-white/10">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Stats Improved
          </div>
          <div className="font-mono text-xl font-bold text-white">
            {positiveChanges} / {statChanges.length}
          </div>
        </div>
      </div>

      {/* Stat Changes Bar */}
      <div className="p-5 rounded-2xl bg-[#17171A] border border-white/10 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-[#C81E3A]" />
          <h3 className="font-anton text-sm uppercase tracking-wider text-white">
            Attribute Changes
          </h3>
        </div>

        {statChanges.map((change, i) => {
          const Icon = change.icon;
          return (
            <motion.div
              key={change.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3"
            >
              <Icon className={`w-4 h-4 ${change.color} shrink-0`} />
              <span className="text-xs font-mono text-[#8C8C90] w-20 shrink-0">{change.label}</span>
              <div className="flex-1 h-2 rounded-full bg-black/40 overflow-hidden relative">
                {/* Baseline marker */}
                <div
                  className="absolute h-full w-0.5 bg-[#8C8C90]/50 z-10"
                  style={{ left: `${change.from}%` }}
                />
                {/* Current bar */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${change.to}%` }}
                  transition={{ delay: i * 0.05 + 0.2, duration: 0.6 }}
                  className={`h-full rounded-full bg-gradient-to-r ${
                    change.delta > 0
                      ? "from-emerald-600 to-emerald-400"
                      : change.delta < 0
                        ? "from-rose-600 to-rose-400"
                        : "from-[#8C8C90] to-[#8C8C90]"
                  }`}
                />
              </div>
              <div className="flex items-center gap-2 w-24 shrink-0 justify-end">
                <span className="text-[10px] font-mono text-[#8C8C90]">{change.from}</span>
                <ArrowRight className="w-3 h-3 text-[#8C8C90]" />
                <span className="text-xs font-mono font-bold text-white">{change.to}</span>
                {change.delta !== 0 && (
                  <span
                    className={`text-[10px] font-mono font-bold ${getDeltaColor(change.delta)}`}
                  >
                    {change.delta > 0 ? "+" : ""}
                    {change.delta}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Milestone Timeline */}
      {milestones.length > 1 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-[#C81E3A]" />
            <h3 className="font-anton text-sm uppercase tracking-wider text-white">
              Milestone History
            </h3>
          </div>
          <MilestoneTimeline milestones={milestones} currentStats={currentStats} />
        </div>
      )}

      {/* Insights */}
      <div className="p-5 rounded-2xl bg-[#17171A] border border-white/10 space-y-3">
        <h3 className="font-anton text-sm uppercase tracking-wider text-white">Insights</h3>

        {mostImproved && mostImproved.delta > 0 && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/30">
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-mono text-emerald-400 font-bold">
                Most Improved: {mostImproved.label}
              </span>
              <p className="text-[11px] text-[#B8B8C0] mt-0.5">
                +{mostImproved.delta} points since your assessment baseline.
              </p>
            </div>
          </div>
        )}

        {needsAttention && needsAttention.delta <= 0 && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-950/30 border border-amber-800/30">
            <Target className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-mono text-amber-400 font-bold">
                Needs Attention: {needsAttention.label}
              </span>
              <p className="text-[11px] text-[#B8B8C0] mt-0.5">
                This area hasn't improved yet. Try including more{" "}
                {needsAttention.label.toLowerCase()}-focused challenges.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 p-3 rounded-xl bg-[#0B0B0C] border border-white/5">
          <Sparkles className="w-4 h-4 text-[#C81E3A] shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-mono text-[#C81E3A] font-bold">
              Total Attribute Growth
            </span>
            <p className="text-[11px] text-[#B8B8C0] mt-0.5">
              {totalImprovement > 0
                ? `Across all 8 attributes, you've gained a combined ${totalImprovement} points since starting SVJ.`
                : "Complete your SVJ Assessment to establish a baseline and start measuring your growth."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
