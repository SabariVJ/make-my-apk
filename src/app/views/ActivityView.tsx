import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Activity as ActivityIcon,
  Footprints,
  Flame,
  TrendingUp,
  Trophy,
  BarChart3,
  Cpu,
  AlertCircle,
  Crosshair,
  History as HistoryIcon,
  Play,
  Square,
  RotateCw,
  Download,
} from "lucide-react";
import { useActivityOptional, type ActivityContextValue } from "../context/ActivityContext";
import { CompletedSessionCard, ActivityHistory } from "./ActivityHistory";
import { TrainGoals, TrainProgress } from "./TrainGoals";
import { TrainRecovery } from "./TrainRecovery";
import { RouteLibrary } from "./RouteLibrary";
import { RecordsView } from "./RecordsView";
import { ConnectedDevicesView } from "./ConnectedDevicesView";
import { WorkoutRecorder } from "./WorkoutRecorder";
import {
  SVJActionCard,
  SVJHeroCard,
  SVJMetricCard,
  SVJProgressMeter,
  SVJScoreRing,
  SVJSectionHeader,
  SVJStatusPill,
  SVJSurface,
  type StatusToneName,
} from "../components/ui-primitives";
import { BRAND_COLORS } from "../lib/designTokens";
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
      initial={bump ? { scale: 1.06 } : false}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`inline-block tabular-nums ${className ?? ""}`}
    >
      {value.toLocaleString()}
    </motion.span>
  );
};

/**
 * Real tracking states only — every label maps to a state the provider can
 * actually be in. Nothing here is invented for decoration.
 */
type TrackingStatus = ActivityContextValue["trackingStatus"];

const STATUS_COPY: Record<
  TrackingStatus,
  { label: string; tone: StatusToneName; pulse: boolean; headline: string }
> = {
  stopped: {
    label: "Ready",
    tone: "positive",
    pulse: false,
    headline: "Ready to track",
  },
  starting: {
    label: "Starting",
    tone: "warning",
    pulse: true,
    headline: "Starting sensors",
  },
  tracking: {
    label: "Recording",
    tone: "crimson",
    pulse: true,
    headline: "Live tracking",
  },
  stopping: {
    label: "Stopping",
    tone: "warning",
    pulse: true,
    headline: "Stopping session",
  },
  denied: {
    label: "Needs attention",
    tone: "caution",
    pulse: false,
    headline: "Permission needed",
  },
  unsupported: {
    label: "Needs attention",
    tone: "caution",
    pulse: false,
    headline: "No step sensor",
  },
  error: {
    label: "Retry stop",
    tone: "critical",
    pulse: false,
    headline: "Stop incomplete",
  },
  "update-required": {
    label: "App update required",
    tone: "critical",
    pulse: false,
    headline: "App update required",
  },
};

/** Honest sensor-source copy — never claims a source the device did not report. */
const STEP_SOURCE_COPY: Record<string, { label: string; detail: string; tone: StatusToneName }> = {
  counter: {
    label: "Hardware step counter",
    detail: "Source: hardware step counter",
    tone: "positive",
  },
  detector: {
    label: "Step detector",
    detail: "Source: step detector",
    tone: "info",
  },
  accelerometer: {
    label: "Motion estimate",
    detail: "Estimated steps — accelerometer motion detection",
    tone: "warning",
  },
  ios: { label: "Device pedometer", detail: "Source: device pedometer", tone: "info" },
};

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
  <SVJSurface level="surface" testId="activity-period-summary">
    <SVJSectionHeader title={title} icon={BarChart3} className="mb-3" />
    <dl className="grid grid-cols-3 gap-2">
      <div className="svj-stat p-2.5 text-center">
        <dt className="svj-label-xs uppercase tracking-[0.08em] mb-1">Avg Steps</dt>
        <dd className="font-mono text-sm font-semibold text-svj-text tabular-nums">
          {summary.averageSteps.toLocaleString()}
        </dd>
      </div>
      <div className="svj-stat p-2.5 text-center">
        <dt className="svj-label-xs uppercase tracking-[0.08em] mb-1">Best Day</dt>
        <dd className="font-mono text-sm font-semibold text-svj-crimson tabular-nums">
          {summary.bestDay ? summary.bestDay.steps.toLocaleString() : "—"}
        </dd>
        {summary.bestDay && (
          <p className="text-[10px] font-inter text-svj-secondary mt-0.5">
            {summary.bestDay.label}
          </p>
        )}
      </div>
      <div className="svj-stat p-2.5 text-center">
        <dt className="svj-label-xs uppercase tracking-[0.08em] mb-1">Avg KCAL</dt>
        <dd className="font-mono text-sm font-semibold text-gold tabular-nums">
          {summary.averageActiveKcal.toLocaleString()}
        </dd>
      </div>
    </dl>
  </SVJSurface>
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
      <SVJSurface level="surface" className="text-center space-y-2">
        <p className="svj-heading text-lg">Activity Unavailable</p>
        <p className="text-xs font-inter text-svj-secondary">
          Reload the app to reconnect step tracking.
        </p>
      </SVJSurface>
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

const SECTION_ITEMS: ReadonlyArray<{ id: TrainSection; label: string }> = [
  { id: "activity", label: "Overview" },
  { id: "record", label: "Record" },
  { id: "history", label: "History" },
  { id: "routes", label: "Routes" },
  { id: "records", label: "Records" },
  { id: "devices", label: "Devices" },
  { id: "goals", label: "Goals" },
  { id: "progress", label: "Progress" },
  { id: "recovery", label: "Recovery" },
];

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
    xpEarnedToday,
    serverActivityXpToday,
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
  // Defensive: an unexpected status (older persisted state, a future provider
  // value) must degrade to the calm "ready" copy instead of crashing the
  // screen. The tracking engine itself is untouched.
  const status = STATUS_COPY[trackingStatus] ?? STATUS_COPY.stopped;
  const source = stepSource ? (STEP_SOURCE_COPY[stepSource] ?? null) : null;
  const busy = trackingStatus === "starting" || trackingStatus === "stopping";
  const ctaDisabled = busy || trackingStatus === "update-required";
  const ctaLabel =
    trackingStatus === "update-required"
      ? "APP UPDATE REQUIRED"
      : trackingStatus === "error"
        ? "RETRY STOP"
        : trackingRequested || trackingActive
          ? "STOP TRACKING"
          : "START TRACKING";
  const CtaIcon =
    trackingStatus === "update-required"
      ? Download
      : trackingStatus === "error"
        ? RotateCw
        : trackingRequested || trackingActive
          ? Square
          : Play;

  const sections = SECTION_ITEMS.filter((s) => !hideRecoverySection || s.id !== "recovery");

  return (
    <div className="pb-28 pt-4 px-4 sm:px-6 max-w-2xl mx-auto lg:max-w-4xl">
      {/* ── A. Live / ready hero ─────────────────────────────────────────── */}
      <SVJHeroCard
        eyebrow="Performance telemetry"
        title="Activity"
        icon={ActivityIcon}
        description={status.headline}
        action={
          <SVJStatusPill tone={status.tone} dot pulse={status.pulse}>
            {trackingActive ? "Tracking active" : "Tracking stopped"}
          </SVJStatusPill>
        }
        graphic={
          <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <div className="flex justify-center md:justify-start">
              <SVJScoreRing
                value={stepPercent}
                size={164}
                strokeWidth={10}
                color={BRAND_COLORS.crimson}
                label="Step goal progress"
              >
                <Footprints className="w-4 h-4 text-svj-crimson mb-1" aria-hidden="true" />
                <LiveNumber
                  value={todaySteps}
                  className="font-mono text-[32px] leading-none font-semibold text-svj-text"
                />
                <p className="font-mono text-[10px] text-svj-secondary mt-1.5 tabular-nums">
                  of {stepGoal.toLocaleString()} · {stepPercent}%
                </p>
              </SVJScoreRing>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <SVJStatusPill tone={status.tone} dot={false}>
                  {status.label}
                </SVJStatusPill>
                {source && (
                  <SVJStatusPill tone={source.tone}>
                    <Cpu className="w-3 h-3" aria-hidden="true" />
                    {source.label}
                  </SVJStatusPill>
                )}
              </div>

              <SVJProgressMeter
                label="Step goal"
                value={todaySteps}
                max={stepGoal}
                readout={
                  remainingSteps > 0 ? `${remainingSteps.toLocaleString()} to go` : "Goal complete"
                }
                tone="crimson"
              />
              <SVJProgressMeter
                label="Active calorie goal"
                value={activeKcal}
                max={kcalGoal}
                readout={`${activeKcal.toLocaleString()} / ${kcalGoal.toLocaleString()} KCAL`}
                tone="gold"
              />

              <button
                type="button"
                disabled={ctaDisabled}
                onClick={() => {
                  if (trackingRequested || trackingActive || trackingStatus === "error")
                    void stopTracking();
                  else void startTracking();
                }}
                data-testid="activity-tracking-toggle"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-svj-crimson px-4 py-3 font-anton text-xs uppercase tracking-wider text-white transition-colors hover:bg-svj-crimson-hover disabled:opacity-50 svj-press"
              >
                <CtaIcon className="w-4 h-4" aria-hidden="true" />
                <span>{ctaLabel}</span>
              </button>
            </div>
          </div>
        }
      />

      {/* The provider's own status sentence is always visible: the screen must
          never be silently stuck. */}
      <p
        role="status"
        className="mt-3 rounded-xl svj-inset px-3 py-2.5 text-[11px] font-inter leading-relaxed text-svj-secondary"
      >
        {statusMessage}
      </p>
      {source && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-svj-muted">
          {source.detail}
        </p>
      )}

      {/* ── Section navigation (9 internal destinations, never bottom-nav) ── */}
      <nav aria-label="Activity sections" className="mt-5">
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
          data-testid="train-sections"
        >
          {sections.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={active ? "true" : undefined}
                className={`shrink-0 rounded-lg border px-3 py-2.5 min-h-11 text-[11px] font-inter font-semibold uppercase tracking-[0.06em] transition-colors svj-press ${
                  active
                    ? "border-svj-crimson/40 bg-svj-crimson/12 text-svj-text"
                    : "border-white/[0.06] bg-white/[0.03] text-svj-secondary hover:text-svj-text"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>

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

      {section === "activity" && (
        <div className="mt-5 space-y-4">
          {/* ── B. Live telemetry ────────────────────────────────────────── */}
          <section aria-label="Today's telemetry">
            <SVJSectionHeader
              title="Today's telemetry"
              icon={TrendingUp}
              trailing={<span className="svj-label-xs">Step mode · Estimate</span>}
              className="mb-2.5"
            />
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <SVJMetricCard
                label="Steps"
                value={<LiveNumber value={todaySteps} />}
                icon={Footprints}
                tone="crimson"
                footer={<SVJProgressMeter label="Goal" value={stepPercent} height={4} />}
                className="col-span-2 md:col-span-1"
              />
              <SVJMetricCard
                label="Active Calories"
                value={<LiveNumber value={activeKcal} />}
                unit="KCAL"
                icon={Flame}
                tone="gold"
                footer={
                  <p className="svj-label-xs">
                    {kcalPercent}% of {kcalGoal.toLocaleString()} KCAL goal
                  </p>
                }
              />
              <SVJMetricCard
                label="Total Calories"
                value={<LiveNumber value={totalKcal} />}
                unit="KCAL"
                icon={Flame}
                tone="neutral"
                footer={<p className="svj-label-xs">Includes resting burn</p>}
              />
              <SVJMetricCard
                label="Step XP today"
                value={xpEarnedToday}
                unit="XP"
                icon={Trophy}
                tone="crimson"
                footer={
                  <p className="svj-label-xs">
                    {serverActivityXpToday > 0
                      ? `${serverActivityXpToday.toLocaleString()} XP confirmed by server`
                      : "Awarded at step milestones"}
                  </p>
                }
              />
            </div>
            <p className="mt-2 text-[10px] font-inter leading-relaxed text-svj-muted">
              Estimates from steps, distance and your body profile — not medical measurements. Step
              mode reports steps and active calories only; pace, distance and elevation appear in
              the GPS recorder, where they are real.
            </p>
          </section>

          {/* ── C. GPS / route entry point (the recorder mounts once, in Record) ── */}
          <SVJActionCard
            icon={Crosshair}
            title="Record an outdoor workout"
            subtitle="GPS route, pace, splits and elevation from the native foreground recorder."
            onClick={() => setSection("record")}
            tone="crimson"
          />

          {/* ── E. Recent activity: the frozen completion summary ─────────── */}
          <section aria-label="Recent activity">
            <SVJSectionHeader
              title="Recent activity"
              icon={HistoryIcon}
              trailing={
                <button
                  type="button"
                  onClick={() => setSection("history")}
                  className="svj-label-xs uppercase tracking-[0.08em] text-svj-crimson hover:underline"
                >
                  Full history
                </button>
              }
              className="mb-2.5"
            />
            <CompletedSessionCard />
          </section>

          {/* ── D. Daily summary (Avg Steps / Best Day / Avg KCAL, no charts) ── */}
          <section aria-label="Period summaries" className="space-y-2.5">
            <HistoryPanel title="Last 7 Days" summary={summary7} />
            <HistoryPanel title="Last 30 Days" summary={summary30} />
          </section>

          {/* ── Step XP milestones ───────────────────────────────────────── */}
          <SVJSurface level="surface">
            <SVJSectionHeader title="Step XP" icon={Trophy} className="mb-3" />
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
                    className={`rounded-lg border p-2 text-center ${
                      reached
                        ? "border-svj-crimson/25 bg-svj-crimson/10"
                        : "border-white/[0.04] bg-svj-bg"
                    }`}
                  >
                    <p
                      className={`font-mono text-sm font-semibold tabular-nums ${
                        reached ? "text-svj-crimson" : "text-svj-secondary"
                      }`}
                    >
                      {(m.steps / 1000).toFixed(1)}K
                    </p>
                    <p
                      className={`text-[10px] font-inter ${
                        reached ? "text-state-positive" : "text-svj-muted"
                      }`}
                    >
                      +{m.xp} XP
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[10px] font-inter leading-relaxed text-svj-secondary">
              <TrendingUp className="mt-0.5 w-3 h-3 shrink-0" aria-hidden="true" />
              Next milestone {nextMilestone.toLocaleString()} steps — XP is granted once per
              milestone per day by the server and counts toward your streak.
            </p>
          </SVJSurface>
        </div>
      )}

      {/* Completion summary + canonical server save (Update 01/02) */}
      {section !== "activity" && <CompletedSessionCard />}

      {/* Server-backed activity history + manual logging (Update 01) */}
      {section === "history" && <ActivityHistory />}

      {/* Developer diagnostics — only render when the explicit opt-in or a dev/test bundle enables them. */}
      {showDiagnostics && debugInfo && (
        <SVJSurface level="raised" className="mt-4 border-gold/25">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Cpu className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-gold">
              ANDROID PEDOMETER DEBUG
            </span>
            <span className="font-mono text-[9px] text-svj-secondary">
              — shown when the native sensor bridge is present
            </span>
          </div>
          <ul className="space-y-1 text-[10px] font-mono leading-relaxed">
            <li className="text-svj-secondary">Platform: android · status: {trackingStatus}</li>
            <li className="text-svj-secondary">
              Plugin registered:{" "}
              {debugInfo.pluginAvailable == null
                ? "unknown"
                : debugInfo.pluginAvailable
                  ? "yes"
                  : "no"}
            </li>
            <li className="text-svj-secondary">Sensor mode: {debugInfo.sensorMode ?? "none"}</li>
            <li className="text-svj-secondary">
              Sensor name: {debugInfo.sensorName ?? "none"}
              {debugInfo.sensorVendor ? ` (${debugInfo.sensorVendor})` : ""}
            </li>
            <li className="text-svj-secondary">
              Sensor available:{" "}
              {debugInfo.sensorAvailable === true
                ? "true"
                : debugInfo.sensorAvailable === false
                  ? "false"
                  : "unknown"}
            </li>
            <li className="text-svj-secondary">Permission: {debugInfo.permission ?? "unknown"}</li>
            <li className="text-svj-secondary">
              Tracking requested: {debugInfo.trackingRequested ? "yes" : "no"}
            </li>
            <li className="text-svj-secondary">
              Tracking active: {debugInfo.trackingActive ? "yes" : "no"}
            </li>
            <li className="text-svj-secondary">
              Listener registered: {debugInfo.listenerRegistered ? "yes" : "no"}
            </li>
            <li className="text-svj-secondary">
              Listener removed: {debugInfo.listenerRemoved ? "yes" : "no"}
            </li>
            <li className="text-svj-secondary">
              Session baseline raw: {debugInfo.sessionBaselineRaw ?? "waiting for first reading"}
            </li>
            <li className="text-svj-secondary">Session steps: {debugInfo.sessionSteps}</li>
            <li className="text-svj-secondary">
              Selected sensor mode: {debugInfo.selectedSensorMode ?? "none"}
            </li>
            <li className="text-svj-secondary">Active calories: {activeKcal} kcal</li>
            <li className="text-svj-secondary">
              Listener connected: {debugInfo.listenerConnected ? "yes" : "no"}
            </li>
            <li className="text-svj-secondary">
              Sensor started: {debugInfo.sensorStarted ? "yes" : "no"}
            </li>
            <li className="text-svj-secondary">
              Last raw value: {debugInfo.lastRawSteps != null ? debugInfo.lastRawSteps : "none"}
            </li>
            <li className="text-svj-secondary">
              Last daily steps:{" "}
              {debugInfo.lastDailySteps != null ? debugInfo.lastDailySteps : "none"}
            </li>
            <li className="text-svj-secondary">
              Last measurement at:{" "}
              {debugInfo.lastMeasurementAtMs != null
                ? new Date(debugInfo.lastMeasurementAtMs).toISOString()
                : "none"}
            </li>
            <li className="text-svj-secondary">
              Last event time:{" "}
              {debugInfo.lastMeasurementAtMs != null
                ? new Date(debugInfo.lastMeasurementAtMs).toLocaleTimeString()
                : "none"}
            </li>
            <li className="text-svj-secondary">Last error: {debugInfo.lastError ?? "none"}</li>
          </ul>
          <button
            type="button"
            onClick={() => {
              void getSensorInfo();
            }}
            className="mt-3 min-h-11 rounded-lg border border-gold/30 px-3 font-mono text-[10px] uppercase tracking-wider text-gold svj-press"
          >
            Refresh diagnostics
          </button>
          {debugInfo.notes && debugInfo.notes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {debugInfo.notes.slice(0, 40).map((n, i) => (
                <span
                  key={i}
                  className="inline-block break-all rounded-md border border-gold/20 bg-gold/10 px-1.5 py-0.5 font-mono text-[9px] text-gold"
                >
                  {n}
                </span>
              ))}
            </div>
          )}
          {debugInfo.lastError && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-svj-crimson/30 bg-svj-crimson/5 p-2 font-mono text-[10px] text-svj-crimson">
              <AlertCircle className="mt-0.5 shrink-0 w-3.5 h-3.5" aria-hidden="true" />
              <span>{debugInfo.lastError}</span>
            </div>
          )}
        </SVJSurface>
      )}
    </div>
  );
};
