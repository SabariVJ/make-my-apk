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
  Cpu,
  AlertCircle,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useActivityOptional, type ActivityContextValue } from "../context/ActivityContext";
import { CompletedSessionCard, ActivityHistory } from "./ActivityHistory";
import { TrainGoals, TrainProgress } from "./TrainGoals";
import { TrainRecovery } from "./TrainRecovery";
import { RouteLibrary } from "./RouteLibrary";
import { RecordsView } from "./RecordsView";
import { ConnectedDevicesView } from "./ConnectedDevicesView";
import { WorkoutRecorder } from "./WorkoutRecorder";
import type { SavedRoute } from "../lib/activityPlatform";

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
  <div className="rounded-2xl bg-[#17171A] border border-white/[0.06] p-4 mb-5">
    <div className="flex items-center gap-2 mb-3">
      <BarChart3 className="w-4 h-4 text-[#C81E3A]" />
      <span className="text-[11px] font-inter font-semibold uppercase tracking-wider text-white">
        {title}
      </span>
    </div>
    <div className="grid grid-cols-3 gap-2 mb-4">
      <div className="svj-stat p-2.5 text-center">
        <div className="text-[11px] font-inter text-[#8C8C90] mb-0.5">Avg Steps</div>
        <div className="font-mono text-sm font-bold text-white">
          {summary.averageSteps.toLocaleString()}
        </div>
      </div>
      <div className="svj-stat p-2.5 text-center">
        <div className="text-[11px] font-inter text-[#8C8C90] mb-0.5">Best Day</div>
        <div className="font-mono text-sm font-bold text-[#C81E3A]">
          {summary.bestDay ? summary.bestDay.steps.toLocaleString() : "—"}
        </div>
        {summary.bestDay && (
          <div className="text-[10px] font-inter text-[#8C8C90]">{summary.bestDay.label}</div>
        )}
      </div>
      <div className="svj-stat p-2.5 text-center">
        <div className="text-[11px] font-inter text-[#8C8C90] mb-0.5">Avg KCAL</div>
        <div className="font-mono text-sm font-bold text-amber-400">
          {summary.averageActiveKcal.toLocaleString()}
        </div>
      </div>
    </div>
    <div className="space-y-3">
      <div>
        <div className="text-[11px] font-inter text-[#8C8C90] mb-1">Daily Steps</div>
        <StepChart data={history} />
      </div>
      <div>
        <div className="text-[11px] font-inter text-[#8C8C90] mb-1">
          Daily Calories Burned (est.)
        </div>
        <KcalChart data={history} />
      </div>
    </div>
  </div>
);

/**
 * Renders a calm placeholder instead of crashing the whole app when the
 * Activity provider is not mounted above this screen (e.g. after a hot reload
 * swaps the context module identity).
 */
export const ActivityView: React.FC = () => {
  const activity = useActivityOptional();
  if (!activity) {
    return (
      <div className="rounded-2xl bg-[#17171A] border border-white/[0.06] p-6 text-center space-y-2">
        <p className="font-anton text-lg uppercase tracking-wider text-white">
          Activity Unavailable
        </p>
        <p className="text-xs font-inter text-[#8C8C90]">
          Reload the app to reconnect step tracking.
        </p>
      </div>
    );
  }
  return <ActivityViewContent activity={activity} />;
};

type TrainSection =
  | "activity"
  | "record"
  | "history"
  | "routes"
  | "records"
  | "devices"
  | "goals"
  | "progress"
  | "recovery";

const ActivityViewContent: React.FC<{ activity: ActivityContextValue }> = ({ activity }) => {
  const {
    todaySteps,
    milestoneSteps,
    stepGoal,
    stepPercent,
    remainingSteps,
    activeKcal,
    totalKcal,
    kcalGoal,
    kcalPercent,
    trackingStatus,
    trackingRequested,
    trackingActive,
    startTracking,
    stopTracking,
    getSensorInfo,
    statusMessage,
    stepSource,
    history7,
    history30,
    summary7,
    summary30,
    debugInfo,
    showDiagnostics,
  } = activity;

  // The provider also serves summary cards, so leaving this screen must stop
  // its owned session even when the provider itself remains mounted.
  useEffect(
    () => () => {
      void stopTracking();
    },
    [stopTracking],
  );

  const [section, setSection] = useState<TrainSection>("activity");
  // A saved route the athlete chose to follow outdoors.
  const [plannedRoute, setPlannedRoute] = useState<SavedRoute | null>(null);

  const nextMilestone = [2500, 5000, 7500, 10000].find((m) => milestoneSteps < m) ?? 10000;
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
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-inter font-medium ${
            trackingStatus === "tracking"
              ? "bg-emerald-500/10 text-emerald-400"
              : trackingStatus === "starting"
                ? "bg-amber-500/10 text-amber-400"
                : "bg-white/[0.04] text-[#8C8C90]"
          }`}
        >
          {trackingStatus === "tracking" ? (
            <Watch className="w-3.5 h-3.5" />
          ) : (
            <ActivitySquare className="w-3.5 h-3.5" />
          )}
          {trackingActive ? "Tracking active" : "Tracking stopped"}
        </div>
      </div>

      {/* Always visible: the Activity screen must never be silently stuck. */}
      <p
        role="status"
        className="mb-3 rounded-lg bg-[#0b0b0c] border border-white/[0.04] px-3 py-2 text-[11px] font-inter text-[#8C8C90]"
      >
        {statusMessage}
      </p>
      <button
        type="button"
        disabled={trackingStatus === "stopping" || trackingStatus === "update-required"}
        onClick={() => {
          if (trackingRequested || trackingActive || trackingStatus === "error")
            void stopTracking();
          else void startTracking();
        }}
        className="mb-5 w-full rounded-xl bg-[#C81E3A] px-4 py-3 text-xs font-anton uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] disabled:opacity-50 svj-press"
      >
        {trackingStatus === "update-required"
          ? "APP UPDATE REQUIRED"
          : trackingStatus === "error"
            ? "RETRY STOP"
            : trackingRequested || trackingActive
              ? "STOP TRACKING"
              : "START TRACKING"}
      </button>

      {/* Train internal navigation: only working sections are exposed. */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" data-testid="train-sections">
        {(
          [
            { id: "activity", label: "Overview" },
            { id: "record", label: "Record" },
            { id: "history", label: "History" },
            { id: "routes", label: "Routes" },
            { id: "records", label: "Records" },
            { id: "devices", label: "Devices" },
            { id: "goals", label: "Goals" },
            { id: "progress", label: "Progress" },
            { id: "recovery", label: "Recovery" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-inter font-medium transition-colors ${
              section === s.id
                ? "bg-[#C81E3A]/15 text-white"
                : "bg-white/[0.04] text-[#8C8C90] hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "goals" && <TrainGoals />}
      {section === "progress" && <TrainProgress />}
      {section === "recovery" && <TrainRecovery />}

      {/* Native outdoor recording into the existing activity pipeline. */}
      {section === "record" && (
        <WorkoutRecorder
          plannedRoute={plannedRoute}
          onClearPlannedRoute={() => setPlannedRoute(null)}
        />
      )}

      {/* Route library: save, rename, favourite and reuse own routes. */}
      {section === "routes" && (
        <RouteLibrary
          onStartRoute={(route) => {
            setPlannedRoute(route);
            setSection("record");
          }}
        />
      )}

      {/* GPS records, private heatmap and personal segments. */}
      {section === "records" && <RecordsView />}
      {section === "devices" && <ConnectedDevicesView />}

      {/* Today's activity — visible on the Activity section. */}
      {section === "activity" && (
        <>
          <div className="rounded-2xl bg-[#17171A] border border-white/[0.06] p-5 mb-5">
            <div className="text-[11px] font-inter uppercase tracking-wider text-[#8C8C90] mb-3">
              Today&apos;s Activity
            </div>
            <div className="flex flex-col items-center">
              <ProgressRing percent={stepPercent}>
                <Footprints className="w-5 h-5 text-[#E62846] mb-1" />
                <LiveNumber
                  value={todaySteps}
                  className="font-mono text-4xl font-bold text-white"
                />
                <div className="text-[10px] font-mono text-[#8C8C90] mt-1">
                  of {stepGoal.toLocaleString()} steps · {stepPercent}%
                </div>
                <div className="text-[10px] font-mono text-[#E62846] mt-0.5">
                  {remainingSteps > 0
                    ? `${remainingSteps.toLocaleString()} to go`
                    : "Goal complete"}
                </div>
              </ProgressRing>
              {stepSource === "accelerometer" && (
                <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-amber-300">
                  Estimated steps — accelerometer motion detection
                </div>
              )}
              {stepSource === "detector" && (
                <div className="mt-2 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">
                  Source: step detector
                </div>
              )}
              {stepSource === "counter" && (
                <div className="mt-2 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">
                  Source: hardware step counter
                </div>
              )}
              <div className="mt-3 text-[10px] font-mono text-[#8C8C90] text-center">
                Next milestone:{" "}
                <span className="text-white">{nextMilestone.toLocaleString()} steps</span> — XP
                awarded automatically at 2.5K / 5K / 7.5K / 10K
              </div>
            </div>
          </div>

          {/* Calories */}
          <div className="rounded-2xl bg-[#17171A] border border-white/[0.06] p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-inter font-semibold uppercase tracking-wider text-white">
                  Calories Burned
                </span>
              </div>
              <span className="text-[10px] font-inter text-[#8C8C90]">Estimate</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="svj-stat p-3">
                <div className="text-[11px] font-inter text-[#8C8C90] mb-1">Active Calories</div>
                <LiveNumber
                  value={activeKcal}
                  className="font-mono text-2xl font-bold text-amber-400"
                />
                <div className="text-[10px] font-inter text-[#8C8C90] mt-0.5">
                  KCAL · from movement
                </div>
              </div>
              <div className="svj-stat p-3">
                <div className="text-[11px] font-inter text-[#8C8C90] mb-1">Total Calories</div>
                <LiveNumber value={totalKcal} className="font-mono text-2xl font-bold text-white" />
                <div className="text-[10px] font-inter text-[#8C8C90] mt-0.5">
                  KCAL · incl. resting burn
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-[11px] font-inter text-[#8C8C90]">
                <span>Active Calorie Goal</span>
                <span>
                  {activeKcal.toLocaleString()} / {kcalGoal.toLocaleString()} KCAL
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#0b0b0c] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${kcalPercent}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400"
                />
              </div>
            </div>
            <p className="mt-3 text-[10px] font-inter leading-relaxed text-[#8C8C90]">
              Estimates from steps, distance and your body profile — not medical measurements.
            </p>
          </div>
        </>
      )}

      {/* Completion summary + canonical server save (Update 01/02) */}
      <CompletedSessionCard />

      {/* Server-backed activity history + manual logging (Update 01) */}
      {section === "history" && <ActivityHistory />}

      {/* Charts */}
      {section === "activity" && (
        <>
          <HistoryPanel title="Last 7 Days" history={chart7} summary={summary7} />
          <HistoryPanel title="Last 30 Days" history={chart30} summary={summary30} />
        </>
      )}

      {/* How XP works */}
      <div className="rounded-2xl bg-[#17171A] border border-white/[0.06] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-[11px] font-inter font-semibold uppercase tracking-wider text-white">
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
            const reached = milestoneSteps >= m.steps;
            return (
              <div
                key={m.steps}
                className={`rounded-xl p-2 text-center ${
                  reached ? "bg-[#C81E3A]/10" : "bg-[#0b0b0c]"
                }`}
              >
                <div
                  className={`font-mono text-sm font-bold ${reached ? "text-[#C81E3A]" : "text-[#8C8C90]"}`}
                >
                  {(m.steps / 1000).toFixed(1)}K
                </div>
                <div
                  className={`text-[10px] font-inter ${reached ? "text-emerald-400" : "text-[#8C8C90]"}`}
                >
                  +{m.xp} XP
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-inter text-[#8C8C90]">
          <TrendingUp className="w-3 h-3" />
          XP is granted once per milestone per day and counts toward your streak.
        </div>
      </div>

      {/* Developer diagnostics — only render when the explicit opt-in or a dev/test bundle enables them. */}
      {showDiagnostics && debugInfo && (
        <div className="rounded-2xl border border-amber-500/30 bg-black/60 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
              ANDROID PEDOMETER DEBUG
            </span>
            <span className="text-[9px] font-mono text-[#8C8C90]">
              {" "}
              — shown when the native sensor bridge is present
            </span>
          </div>
          <ul className="space-y-1 text-[10px] font-mono leading-relaxed">
            <li className="text-[#8C8C90]">Platform: android · status: {trackingStatus}</li>
            <li className="text-[#8C8C90]">
              Plugin registered:{" "}
              {debugInfo.pluginAvailable == null
                ? "unknown"
                : debugInfo.pluginAvailable
                  ? "yes"
                  : "no"}
            </li>
            <li className="text-[#8C8C90]">Sensor mode: {debugInfo.sensorMode ?? "none"}</li>
            <li className="text-[#8C8C90]">
              Sensor name: {debugInfo.sensorName ?? "none"}
              {debugInfo.sensorVendor ? ` (${debugInfo.sensorVendor})` : ""}
            </li>
            <li className="text-[#8C8C90]">
              Sensor available:{" "}
              {debugInfo.sensorAvailable === true
                ? "true"
                : debugInfo.sensorAvailable === false
                  ? "false"
                  : "unknown"}
            </li>
            <li className="text-[#8C8C90]">Permission: {debugInfo.permission ?? "unknown"}</li>
            <li className="text-[#8C8C90]">
              Tracking requested: {debugInfo.trackingRequested ? "yes" : "no"}
            </li>
            <li className="text-[#8C8C90]">
              Tracking active: {debugInfo.trackingActive ? "yes" : "no"}
            </li>
            <li className="text-[#8C8C90]">
              Listener registered: {debugInfo.listenerRegistered ? "yes" : "no"}
            </li>
            <li className="text-[#8C8C90]">
              Listener removed: {debugInfo.listenerRemoved ? "yes" : "no"}
            </li>
            <li className="text-[#8C8C90]">
              Session baseline raw: {debugInfo.sessionBaselineRaw ?? "waiting for first reading"}
            </li>
            <li className="text-[#8C8C90]">Session steps: {debugInfo.sessionSteps}</li>
            <li className="text-[#8C8C90]">
              Selected sensor mode: {debugInfo.selectedSensorMode ?? "none"}
            </li>
            <li className="text-[#8C8C90]">Active calories: {activeKcal} kcal</li>
            <li className="text-[#8C8C90]">
              Listener connected: {debugInfo.listenerConnected ? "yes" : "no"}
            </li>
            <li className="text-[#8C8C90]">
              Sensor started: {debugInfo.sensorStarted ? "yes" : "no"}
            </li>
            <li className="text-[#8C8C90]">
              Last raw value: {debugInfo.lastRawSteps != null ? debugInfo.lastRawSteps : "none"}
            </li>
            <li className="text-[#8C8C90]">
              Last daily steps:{" "}
              {debugInfo.lastDailySteps != null ? debugInfo.lastDailySteps : "none"}
            </li>
            <li className="text-[#8C8C90]">
              Last measurement at:{" "}
              {debugInfo.lastMeasurementAtMs != null
                ? new Date(debugInfo.lastMeasurementAtMs).toISOString()
                : "none"}
            </li>
            <li className="text-[#8C8C90]">
              Last event time:{" "}
              {debugInfo.lastMeasurementAtMs != null
                ? new Date(debugInfo.lastMeasurementAtMs).toLocaleTimeString()
                : "none"}
            </li>
            <li className="text-[#8C8C90]">Last error: {debugInfo.lastError ?? "none"}</li>
          </ul>
          <button
            type="button"
            onClick={() => {
              void getSensorInfo();
            }}
            className="mt-3 text-[10px] font-mono text-amber-400 underline"
          >
            Refresh diagnostics
          </button>
          {debugInfo.notes && debugInfo.notes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {debugInfo.notes.slice(0, 40).map((n, i) => (
                <span
                  key={i}
                  className="inline-block rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-mono text-amber-300 break-all"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
          {debugInfo.lastError && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-2 text-[10px] font-mono text-red-400">
              <AlertCircle className="mt-0.5 shrink-0" />
              <span>{debugInfo.lastError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
