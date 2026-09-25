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
import { useActivityOptional, type ActivityContextValue } from "../context/ActivityContext";
import { CompletedSessionCard, ActivityHistory } from "./ActivityHistory";
import { TrainGoals, TrainProgress } from "./TrainGoals";
import { TrainRecovery } from "./TrainRecovery";
import { RouteLibrary } from "./RouteLibrary";
import { RecordsView } from "./RecordsView";
import { ConnectedDevicesView } from "./ConnectedDevicesView";
import { WorkoutRecorder } from "./WorkoutRecorder";
import type { SavedRoute } from "../lib/activityPlatform";
import { SVJScoreRing } from "../components/ui-primitives/SVJScoreRing";
import { SVJSectionHeader } from "../components/ui-primitives/SVJSectionHeader";
import { SVJEmptyState } from "../components/ui-primitives/SVJEmptyState";

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

// The bespoke step/calorie ring was removed: every "value out of a maximum"
// on this screen now renders the shared SVJScoreRing, so the steps ring, the
// active-kcal goal and the Recovery readiness ring can never drift apart.

/**
 * Period summaries only.
 *
 * The two per-period bar graphs (steps, and estimated calories burned) were
 * removed from this screen — they were the only Activity chart visualizations
 * and the summary tiles already convey the same period numbers. `Avg Steps`,
 * `Best Day`
 * and `Avg KCAL` are still computed by the Activity provider and rendered here,
 * so no aggregation was dropped. Do not re-add a chart block to this card; the
 * `activity-summary` test guards against the graphs returning.
 */
const HistoryPanel: React.FC<{
  title: string;
  summary: {
    averageSteps: number;
    bestDay: { label: string; steps: number } | null;
    averageActiveKcal: number;
  };
}> = ({ title, summary }) => (
  <div
    data-testid="activity-period-summary"
    className="svj-radius-card svj-elev-1 svj-lit-top border border-white/[0.06] bg-[#17171A] p-4 mb-3"
  >
    <SVJSectionHeader title={title} icon={BarChart3} className="mb-3" />
    <div className="grid grid-cols-3 gap-2">
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
        <div className="font-mono text-sm font-bold text-gold">
          {summary.averageActiveKcal.toLocaleString()}
        </div>
      </div>
    </div>
  </div>
);

/**
 * Renders a calm placeholder instead of crashing the whole app when the
 * Activity provider is not mounted above this screen (e.g. after a hot reload
 * swaps the context module identity).
 */
export const ActivityView: React.FC<{ hideRecoverySection?: boolean }> = ({
  hideRecoverySection = false,
}) => {
  const activity = useActivityOptional();
  if (!activity) {
    return (
      <div className="rounded-2xl bg-[#17171A] border border-white/[0.06] p-4 text-center space-y-2">
        <p className="font-anton text-lg tracking-wide text-white">Activity Unavailable</p>
        <p className="text-xs font-inter text-[#8C8C90]">
          Reload the app to reconnect step tracking.
        </p>
      </div>
    );
  }
  return <ActivityViewContent activity={activity} hideRecoverySection={hideRecoverySection} />;
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

const ActivityViewContent: React.FC<{
  activity: ActivityContextValue;
  /**
   * Founder-only staged rollout: Recovery lives at its own top-level
   * destination, so the inner section is hidden to avoid exposing two Recovery
   * entry points to the same person. Ordinary users keep it exactly as shipped.
   */
  hideRecoverySection?: boolean;
}> = ({ activity, hideRecoverySection = false }) => {
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

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-[#C81E3A]/15 border border-[#C81E3A]/40 flex items-center justify-center">
            <ActivityIcon className="w-5 h-5 text-[#E62846]" />
          </div>
          <h1 className="font-anton text-2xl tracking-wide text-white">Activity</h1>
        </div>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-inter font-medium ${
            trackingStatus === "tracking"
              ? "bg-emerald-500/10 text-emerald-400"
              : trackingStatus === "starting"
                ? "bg-gold/10 text-gold"
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
        className="mb-3 w-full rounded-xl bg-[#C81E3A] px-4 py-3 text-xs font-anton uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] disabled:opacity-50 svj-press"
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
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" data-testid="train-sections">
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
        )
          .filter((s) => !hideRecoverySection || s.id !== "recovery")
          .map((s) => (
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
      {/* Overview cards share the desktop width instead of stacking two
          full-width blocks down the page. */}
      {section === "activity" && (
        <div className="mb-3 grid items-start gap-3 lg:grid-cols-2">
          <div className="svj-radius-card svj-elev-2 svj-lit-top border border-white/[0.06] bg-[#17171A] p-3.5">
            <SVJSectionHeader title="Today's activity" icon={Footprints} className="mb-1" />
            <div className="flex flex-col items-center">
              <SVJScoreRing
                value={todaySteps}
                max={stepGoal}
                display={todaySteps.toLocaleString()}
                label="Steps"
                sublabel={
                  remainingSteps > 0
                    ? `of ${stepGoal.toLocaleString()} steps (${stepPercent}%) — ${remainingSteps.toLocaleString()} to go`
                    : `of ${stepGoal.toLocaleString()} steps — daily goal complete`
                }
              />
              {stepSource === "accelerometer" && (
                <div className="mt-2 rounded-lg border border-gold/25 bg-gold/5 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-gold">
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
          <div className="svj-radius-card svj-elev-2 svj-lit-top border border-white/[0.06] bg-[#17171A] p-3.5">
            <SVJSectionHeader
              title="Calories burned"
              icon={Flame}
              trailing={<span className="text-[10px] font-inter text-[#8C8C90]">Estimate</span>}
              className="mb-1"
            />
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
              <SVJScoreRing
                value={activeKcal}
                max={kcalGoal}
                display={activeKcal.toLocaleString()}
                label="Active kcal"
                tone="premium"
                size={148}
                sublabel={`of ${kcalGoal.toLocaleString()} active kcal goal (${kcalPercent}%)`}
              />
              <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-1">
                <div className="svj-stat p-3">
                  <div className="text-[11px] font-inter text-[#8C8C90]">Active Calories</div>
                  <LiveNumber
                    value={activeKcal}
                    className="font-mono text-xl font-bold text-[#C9A227]"
                  />
                  <div className="text-[10px] font-inter text-[#8C8C90] mt-0.5">From movement</div>
                </div>
                <div className="svj-stat p-3">
                  <div className="text-[11px] font-inter text-[#8C8C90]">Total Calories</div>
                  <LiveNumber
                    value={totalKcal}
                    className="font-mono text-xl font-bold text-white"
                  />
                  <div className="text-[10px] font-inter text-[#8C8C90] mt-0.5">
                    Including resting burn
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[10px] font-inter leading-relaxed text-[#8C8C90]">
              Estimates from steps, distance and your body profile — not medical measurements.
            </p>
          </div>
        </div>
      )}

      {/* Completion summary + canonical server save (Update 01/02) */}
      <CompletedSessionCard />

      {/* Server-backed activity history + manual logging (Update 01) */}
      {section === "history" && <ActivityHistory />}

      {/* Period summaries (Avg Steps / Best Day / Avg KCAL) — no chart blocks. */}
      {section === "activity" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <HistoryPanel title="Last 7 Days" summary={summary7} />
          <HistoryPanel title="Last 30 Days" summary={summary30} />
        </div>
      )}

      {/* How XP works — rendered ONCE, on Overview only. It previously repeated
          verbatim on every Activity sub-tab. */}
      {section === "activity" && (
        <div className="svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-3.5 mb-3">
          <SVJSectionHeader title="Step XP milestones" icon={Trophy} className="mb-3" />
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
                  className={`rounded-lg p-2 text-center ${
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
      )}

      {/* Developer diagnostics — only render when the explicit opt-in or a dev/test bundle enables them. */}
      {showDiagnostics && debugInfo && (
        <div className="rounded-2xl border border-gold/30 bg-black/60 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-3.5 h-3.5 text-gold" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-gold">
              ANDROID PEDOMETER DEBUG
            </span>
            <span className="text-[9px] font-mono text-[#8C8C90]">
              {" "}
              — shown when the native sensor bridge is present
            </span>
          </div>
          <ul className="space-y-1 text-[10px] font-mono leading-relaxed">
            <li className="text-[#8C8C90]">Platform android, tracking status {trackingStatus}</li>
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
            className="mt-3 text-[10px] font-mono text-gold underline"
          >
            Refresh diagnostics
          </button>
          {debugInfo.notes && debugInfo.notes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {debugInfo.notes.slice(0, 40).map((n, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full bg-gold/10 border border-gold/20 px-1.5 py-0.5 text-[9px] font-mono text-gold break-all"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
          {debugInfo.lastError && (
            <div className="mt-2 flex items-start gap-2 rounded-full border border-crimson/30 bg-crimson/5 p-2 text-[10px] font-mono text-crimson">
              <AlertCircle className="mt-0.5 shrink-0" />
              <span>{debugInfo.lastError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
