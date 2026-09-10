import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Activity as ActivityIcon,
  Footprints,
  Flame,
  TrendingUp,
  Trophy,
  Watch,
  ActivitySquare,
  BarChart3,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useActivity } from "../context/ActivityContext";

/** Animated numeric readout with a subtle pulse on every increase. */
const LiveNumber: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value <= prev.current) {
      prev.current = value;
      return;
    }
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 450);
    prev.current = value;
    return () => window.clearTimeout(t);
  }, [value]);
  return (
    <motion.span
      key={value}
      initial={bump ? { scale: 1.12 } : false}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
      className={`inline-block ${className ?? ""}`}
    >
      {value.toLocaleString()}
    </motion.span>
  );
};

/** Circular progress ring with neon sweep. */
const ProgressRing: React.FC<{
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  children: React.ReactNode;
}> = ({ percent, size = 190, stroke = 12, color = "#E62846", children }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
};

const StepChart: React.FC<{ data: { label: string; steps: number }[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={160}>
    <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
      />
      <Tooltip
        cursor={{ fill: "rgba(230,40,70,0.08)" }}
        contentStyle={{
          background: "#141116",
          border: "1px solid rgba(230,40,70,0.35)",
          borderRadius: 12,
          fontFamily: "monospace",
          fontSize: 11,
        }}
        labelStyle={{ color: "#F4F2ED" }}
        itemStyle={{ color: "#E62846" }}
      />
      <Bar dataKey="steps" fill="#E62846" radius={[4, 4, 0, 0]} maxBarSize={26} />
    </BarChart>
  </ResponsiveContainer>
);

const KcalChart: React.FC<{ data: { label: string; activeKcal: number }[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={160}>
    <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
        axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
        tickLine={false}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        cursor={{ fill: "rgba(245,158,11,0.08)" }}
        contentStyle={{
          background: "#141116",
          border: "1px solid rgba(245,158,11,0.35)",
          borderRadius: 12,
          fontFamily: "monospace",
          fontSize: 11,
        }}
        labelStyle={{ color: "#F4F2ED" }}
        itemStyle={{ color: "#F59E0B" }}
      />
      <Bar dataKey="activeKcal" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={26} />
    </BarChart>
  </ResponsiveContainer>
);

const HistoryPanel: React.FC<{
  title: string;
  history: { label: string; steps: number; activeKcal: number }[];
  summary: {
    averageSteps: number;
    bestDay: { label: string; steps: number } | null;
    averageActiveKcal: number;
  };
}> = ({ title, history, summary }) => (
  <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5">
    <div className="flex items-center gap-2 mb-3">
      <BarChart3 className="w-4 h-4 text-[#C81E3A]" />
      <span className="text-xs font-mono uppercase tracking-widest text-white font-bold">
        {title}
      </span>
    </div>
    <div className="grid grid-cols-3 gap-2 mb-4">
      <div className="rounded-xl bg-black/40 border border-white/5 p-2.5 text-center">
        <div className="text-[9px] font-mono uppercase text-[#8C8C90] mb-0.5">Avg Steps</div>
        <div className="font-mono text-sm font-bold text-white">
          {summary.averageSteps.toLocaleString()}
        </div>
      </div>
      <div className="rounded-xl bg-black/40 border border-white/5 p-2.5 text-center">
        <div className="text-[9px] font-mono uppercase text-[#8C8C90] mb-0.5">Best Day</div>
        <div className="font-mono text-sm font-bold text-[#E62846]">
          {summary.bestDay ? summary.bestDay.steps.toLocaleString() : "—"}
        </div>
        {summary.bestDay && (
          <div className="text-[9px] font-mono text-[#8C8C90]">{summary.bestDay.label}</div>
        )}
      </div>
      <div className="rounded-xl bg-black/40 border border-white/5 p-2.5 text-center">
        <div className="text-[9px] font-mono uppercase text-[#8C8C90] mb-0.5">Avg KCAL</div>
        <div className="font-mono text-sm font-bold text-amber-400">
          {summary.averageActiveKcal.toLocaleString()}
        </div>
      </div>
    </div>
    <div className="space-y-3">
      <div>
        <div className="text-[10px] font-mono uppercase text-[#8C8C90] mb-1">Daily Steps</div>
        <StepChart data={history} />
      </div>
      <div>
        <div className="text-[10px] font-mono uppercase text-[#8C8C90] mb-1">
          Daily Calories Burned (est.)
        </div>
        <KcalChart data={history} />
      </div>
    </div>
  </div>
);

export const ActivityView: React.FC = () => {
  const activity = useActivity();
  const {
    todaySteps,
    stepGoal,
    stepPercent,
    remainingSteps,
    activeKcal,
    totalKcal,
    kcalGoal,
    kcalPercent,
    trackingStatus,
    statusMessage,
    history7,
    history30,
    summary7,
    summary30,
  } = activity;

  const nextMilestone = [2500, 5000, 7500, 10000].find((m) => todaySteps < m) ?? 10000;
  const chart7 = history7.map((d) => ({
    label: d.label,
    steps: d.steps,
    activeKcal: d.activeKcal,
  }));
  const chart30 = history30.map((d) => ({
    label: d.label,
    steps: d.steps,
    activeKcal: d.activeKcal,
  }));

  return (
    <div className="pb-24 pt-4 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#C81E3A]/15 border border-[#C81E3A]/40 flex items-center justify-center">
            <ActivityIcon className="w-5 h-5 text-[#E62846]" />
          </div>
          <h1 className="font-anton text-2xl uppercase tracking-wider text-white">Activity</h1>
        </div>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-mono uppercase ${
            trackingStatus === "tracking"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : trackingStatus === "starting"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                : "border-white/10 bg-black/40 text-[#8C8C90]"
          }`}
        >
          {trackingStatus === "tracking" ? (
            <Watch className="w-3.5 h-3.5" />
          ) : (
            <ActivitySquare className="w-3.5 h-3.5" />
          )}
          {trackingStatus === "tracking" ? "Live" : trackingStatus}
        </div>
      </div>

      {trackingStatus !== "tracking" && (
        <p className="mb-4 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] font-mono text-[#8C8C90]">
          {statusMessage}
        </p>
      )}

      {/* Today's activity */}
      <div className="rounded-2xl border border-[#C81E3A]/25 bg-gradient-to-b from-[#C81E3A]/8 to-[#0B0B0C] p-5 mb-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90] mb-3">
          Today's Activity
        </div>
        <div className="flex flex-col items-center">
          <ProgressRing percent={stepPercent}>
            <Footprints className="w-5 h-5 text-[#E62846] mb-1" />
            <LiveNumber value={todaySteps} className="font-mono text-4xl font-bold text-white" />
            <div className="text-[10px] font-mono text-[#8C8C90] mt-1">
              of {stepGoal.toLocaleString()} steps · {stepPercent}%
            </div>
            <div className="text-[10px] font-mono text-[#E62846] mt-0.5">
              {remainingSteps > 0 ? `${remainingSteps.toLocaleString()} to go` : "Goal complete"}
            </div>
          </ProgressRing>
          <div className="mt-3 text-[10px] font-mono text-[#8C8C90] text-center">
            Next milestone:{" "}
            <span className="text-white">{nextMilestone.toLocaleString()} steps</span> — XP awarded
            automatically at 2.5K / 5K / 7.5K / 10K
          </div>
        </div>
      </div>

      {/* Calories */}
      <div className="rounded-2xl border border-amber-500/20 bg-[#0B0B0C] p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-mono uppercase tracking-widest text-white font-bold">
              Calories Burned
            </span>
          </div>
          <span className="text-[9px] font-mono uppercase text-[#8C8C90] border border-white/10 rounded px-1.5 py-0.5">
            Estimate
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-black/40 border border-white/5 p-3">
            <div className="text-[9px] font-mono uppercase text-[#8C8C90] mb-1">
              Active Calories
            </div>
            <LiveNumber
              value={activeKcal}
              className="font-mono text-2xl font-bold text-amber-400"
            />
            <div className="text-[9px] font-mono text-[#8C8C90] mt-0.5">KCAL · from movement</div>
          </div>
          <div className="rounded-xl bg-black/40 border border-white/5 p-3">
            <div className="text-[9px] font-mono uppercase text-[#8C8C90] mb-1">Total Calories</div>
            <LiveNumber value={totalKcal} className="font-mono text-2xl font-bold text-white" />
            <div className="text-[9px] font-mono text-[#8C8C90] mt-0.5">
              KCAL · incl. resting burn
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-[10px] font-mono text-[#8C8C90]">
            <span>Active Calorie Goal</span>
            <span>
              {activeKcal.toLocaleString()} / {kcalGoal.toLocaleString()} KCAL
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden p-0.5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${kcalPercent}%` }}
              transition={{ duration: 0.8 }}
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
            />
          </div>
        </div>
        <p className="mt-3 text-[9px] font-mono leading-relaxed text-[#8C8C90]">
          Calorie values are estimates calculated from steps, distance and your SVJ body profile —
          not medical measurements.
        </p>
      </div>

      {/* History */}
      <HistoryPanel title="Last 7 Days" history={chart7} summary={summary7} />
      <HistoryPanel title="Last 30 Days" history={chart30} summary={summary30} />

      {/* How XP works */}
      <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-mono uppercase tracking-widest text-white font-bold">
            Step XP
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { steps: 2500, xp: 40 },
            { steps: 5000, xp: 60 },
            { steps: 7500, xp: 80 },
            { steps: 10000, xp: 120 },
          ].map((m) => {
            const reached = todaySteps >= m.steps;
            return (
              <div
                key={m.steps}
                className={`rounded-xl border p-2 text-center ${
                  reached ? "border-[#C81E3A]/50 bg-[#C81E3A]/10" : "border-white/5 bg-black/40"
                }`}
              >
                <div
                  className={`font-mono text-xs font-bold ${reached ? "text-[#E62846]" : "text-[#8C8C90]"}`}
                >
                  {(m.steps / 1000).toFixed(1)}K
                </div>
                <div
                  className={`text-[9px] font-mono ${reached ? "text-emerald-400" : "text-[#8C8C90]"}`}
                >
                  +{m.xp} XP
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[9px] font-mono text-[#8C8C90]">
          <TrendingUp className="w-3 h-3" />
          XP is granted once per milestone per day and counts toward XP Today, your Daily XP Goal
          and streak.
        </div>
      </div>
    </div>
  );
};
