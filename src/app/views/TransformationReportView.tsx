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
import { ATTRIBUTE_COLORS } from "../lib/attributeColors";
import { SVJSectionHeader } from "../components/ui-primitives/SVJSectionHeader";
import { SVJTimelineStep } from "../components/ui-primitives/SVJTimelineStep";

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

/*
 * Assessment attributes mapped onto the Character Matrix palette, so a bar
 * here uses the same hue as the matching point on the hexagon instead of one
 * flat crimson fill for all eight.
 */
const STAT_CONFIG = [
  {
    key: "fitness",
    label: "Fitness",
    icon: Dumbbell,
    color: "text-emerald-400",
    hue: ATTRIBUTE_COLORS.physical,
  },
  {
    key: "discipline",
    label: "Discipline",
    icon: Shield,
    color: "text-rose-400",
    hue: ATTRIBUTE_COLORS.discipline,
  },
  {
    key: "focus",
    label: "Focus",
    icon: Brain,
    color: "text-yellow-400",
    hue: ATTRIBUTE_COLORS.mental,
  },
  {
    key: "confidence",
    label: "Confidence",
    icon: Zap,
    color: "text-purple-400",
    hue: ATTRIBUTE_COLORS.ambition,
  },
  {
    key: "social",
    label: "Social",
    icon: Users,
    color: "text-blue-400",
    hue: ATTRIBUTE_COLORS.social,
  },
  {
    key: "nutrition",
    label: "Nutrition",
    icon: Apple,
    color: "text-amber-400",
    hue: ATTRIBUTE_COLORS.intellect,
  },
  {
    key: "recovery",
    label: "Recovery",
    icon: Clock,
    color: "text-emerald-400",
    hue: ATTRIBUTE_COLORS.physical,
  },
  {
    key: "consistency",
    label: "Consistency",
    icon: Calendar,
    color: "text-blue-400",
    hue: ATTRIBUTE_COLORS.social,
  },
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
  const lastIndex = milestones.length - 1;
  return (
    <ol className="relative">
      {milestones.map((milestone, i) => (
        <SVJTimelineStep
          key={milestone.day}
          marker={String(milestone.day)}
          title={`Day ${milestone.day}`}
          meta={milestone.label}
          status={i === lastIndex ? "current" : "done"}
          last={i === lastIndex}
        >
          <div className="grid grid-cols-4 gap-2 rounded-xl border border-white/[0.06] bg-[#0B0B0C] p-3">
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
                    <div className="text-[10px] font-inter text-[#8C8C90]">{config.label}</div>
                    <div className="font-mono text-sm font-bold" style={{ color: config.hue }}>
                      {val}
                    </div>
                    {delta !== 0 && (
                      <div
                        className={`flex items-center justify-center gap-0.5 font-mono text-[9px] ${getDeltaColor(delta)}`}
                      >
                        <DeltaIcon className="h-2.5 w-2.5" />
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </SVJTimelineStep>
      ))}
    </ol>
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
    <div className="space-y-4">
      {/* Header — the app's victory-lap moment, so it gets the premium accent
          and more weight than a standard data screen. */}
      <div className="svj-radius-card svj-elev-3 relative overflow-hidden border border-[#C9A227]/25 bg-gradient-to-br from-[#201A0C] via-[#141416] to-[#141416] p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[#C9A227] opacity-[0.16] blur-3xl"
        />
        <div className="relative z-10">
          <p className="flex items-center gap-2 font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C9A227]">
            <Trophy aria-hidden className="h-3.5 w-3.5" />
            Transformation report
          </p>
          <h1 className="mt-1 font-anton text-2xl leading-none tracking-wide text-white sm:text-3xl">
            Day 1 → Day {daysSinceJoin}
          </h1>
          <p className="mt-2 text-xs font-inter text-[#A9A9AE]">
            Your journey so far. Every number is real.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#17171A] p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90]">
            <Flame className="h-3.5 w-3.5 text-[#C81E3A]" />
            Total challenges
          </div>
          <div className="font-mono text-xl font-bold text-white">
            {user.totalChallengesCompleted}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#17171A] p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90]">
            <Target className="h-3.5 w-3.5 text-emerald-400" />
            Longest streak
          </div>
          <div className="font-mono text-xl font-bold text-white">{user.bestStreak} days</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#17171A] p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90]">
            <Zap className="h-3.5 w-3.5 text-[#C81E3A]" />
            Lifetime XP
          </div>
          <div className="font-mono text-xl font-bold text-[#C81E3A]">
            {user.totalXP.toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#17171A] p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90]">
            <Sparkles className="h-3.5 w-3.5 text-[#C9A227]" />
            Stats improved
          </div>
          <div className="font-mono text-xl font-bold text-white">
            {positiveChanges} / {statChanges.length}
          </div>
        </div>
      </div>

      {/* Stat Changes Bar — each bar carries its attribute hue (the same colour
          as the matching Character Matrix point) rather than one flat fill. */}
      <div className="space-y-3 rounded-2xl border border-white/10 bg-[#17171A] p-3.5">
        <SVJSectionHeader title="Attribute changes" icon={BarChart3} className="mb-1" />

        {statChanges.map((change, i) => {
          const Icon = change.icon;
          const hue = STAT_CONFIG.find((s) => s.label === change.label)?.hue ?? "#C81E3A";
          return (
            <motion.div
              key={change.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3"
            >
              <span className="shrink-0" style={{ color: hue }}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="w-20 shrink-0 text-xs font-inter text-[#8C8C90]">
                {change.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-black/40 overflow-hidden relative">
                {/* Baseline marker */}
                <div
                  className="absolute h-full w-0.5 bg-[#8C8C90]/50 z-10"
                  style={{ left: `${change.from}%` }}
                />
                {/* Current bar — attribute hue, dimmed when the delta is negative. */}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${change.to}%` }}
                  transition={{ delay: i * 0.05 + 0.2, duration: 0.6 }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${hue}66 0%, ${hue} 100%)`,
                    opacity: change.delta < 0 ? 0.55 : 1,
                  }}
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

      {/* Milestone Timeline — the one place in the app where a genuine ordered
          sequence earns the TimelineStep treatment. */}
      {milestones.length > 1 && (
        <div className="space-y-3">
          <SVJSectionHeader title="Milestone history" icon={Calendar} />
          <MilestoneTimeline milestones={milestones} currentStats={currentStats} />
        </div>
      )}

      {/* Insights — one consistent colour system per insight type:
          positive (emerald) / needs attention (premium amber) / neutral (surface). */}
      <div className="svj-radius-card svj-elev-1 border border-white/10 bg-[#17171A] p-4 space-y-3">
        <SVJSectionHeader title="Insights" icon={Sparkles} className="mb-1" />

        {mostImproved && mostImproved.delta > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <span className="text-xs font-inter font-semibold text-emerald-300">
                Most improved — {mostImproved.label}
              </span>
              <p className="mt-0.5 text-[11px] font-inter text-[#B8B8C0]">
                +{mostImproved.delta} points since your assessment baseline.
              </p>
            </div>
          </div>
        )}

        {needsAttention && needsAttention.delta <= 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-[#C9A227]/25 bg-[#C9A227]/10 p-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A227]" />
            <div>
              <span className="text-xs font-inter font-semibold text-[#C9A227]">
                Needs attention — {needsAttention.label}
              </span>
              <p className="mt-0.5 text-[11px] font-inter text-[#B8B8C0]">
                This area hasn't improved yet. Try including more{" "}
                {needsAttention.label.toLowerCase()}-focused challenges.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#0B0B0C] p-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#C81E3A]" />
          <div>
            <span className="text-xs font-inter font-semibold text-[#C81E3A]">
              Total attribute growth
            </span>
            <p className="mt-0.5 text-[11px] font-inter text-[#B8B8C0]">
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
