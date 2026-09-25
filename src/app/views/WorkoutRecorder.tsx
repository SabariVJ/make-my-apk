import React, { useMemo } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  Footprints,
  Heart,
  Link2,
  Loader2,
  Mountain,
  Pause,
  Play,
  Radio,
  Save,
  Square,
  Trash2,
  Zap,
} from "lucide-react";
import { ActivityMap } from "../components/ActivityMap";
import { useWorkoutRecorder } from "../hooks/useWorkoutRecorder";
import {
  GPS_ACTIVITY_LABELS,
  GPS_ACTIVITY_TYPES,
  GPS_QUALITY_LABELS,
  currentPaceSecondsPerKm,
  formatClock,
  formatDistance,
  formatPace,
  formatSpeed,
  type GpsActivityType,
  type TrackPoint,
} from "../lib/gpsActivity";
export { currentPaceSecondsPerKm } from "../lib/gpsActivity";

import {
  liveShareUrl,
  plannedRouteSummary,
  routeToPoints,
  type SavedRoute,
} from "../lib/activityPlatform";

const QUALITY_STYLES: Record<string, string> = {
  searching: "border-white/10 bg-black/40 text-[#8C8C90]",
  weak: "border-gold/40 bg-gold/10 text-gold",
  good: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  excellent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
};

const Metric: React.FC<{
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="svj-radius-row border border-white/[0.06] bg-[#08080A] p-3">
    <div className="mb-1 flex items-center gap-1.5">
      {icon}
      <span className="font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
        {label}
      </span>
    </div>
    <div
      className="font-mono text-lg font-bold text-[#F4F2ED]"
      data-testid={`metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      {value}
    </div>
    {hint && <div className="mt-1 font-inter text-[10px] leading-snug text-[#8C8C90]">{hint}</div>}
  </div>
);

export interface WorkoutRecorderProps {
  /** A saved route the athlete chose to follow, from the route library. */
  plannedRoute?: SavedRoute | null;
  onClearPlannedRoute?: () => void;
}

export const WorkoutRecorder: React.FC<WorkoutRecorderProps> = ({
  plannedRoute = null,
  onClearPlannedRoute,
}) => {
  const {
    session,
    summary,
    liveHeartRate,
    points,
    pendingSync,
    busy,
    error,
    notice,
    liveShare,
    liveShareBusy,
    nativeRecording,
    canSave,
    start,
    pause,
    resume,
    finish,
    discard,
    save,
    shareLive,
    stopSharing,
    dismissError,
    dismissNotice,
  } = useWorkoutRecorder();

  const [activityType, setActivityType] = React.useState<GpsActivityType>("running");
  const [splitUnit, setSplitUnit] = React.useState<"km" | "mi">("km");

  // Following a saved route: the geometry is drawn as a guide and the route is
  // pre-selected by activity type. No XP or record is derived from the guide;
  // only the recorded track is ever scored.
  const guide = useMemo(
    () => (plannedRoute ? routeToPoints(plannedRoute.polyline) : undefined),
    [plannedRoute],
  );
  React.useEffect(() => {
    if (!plannedRoute) return;
    const match = (["running", "walking", "hiking", "cycling"] as GpsActivityType[]).find(
      (type) => type === plannedRoute.activityType,
    );
    if (match) setActivityType(match);
  }, [plannedRoute]);

  const currentPace = useMemo(() => currentPaceSecondsPerKm(points), [points]);
  const state = session?.state ?? "idle";
  const active = state === "recording" || state === "paused";
  const finished = state === "stopping";

  return (
    <div className="space-y-4 pb-6">
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
          <p className="flex-1 text-[11px] font-mono text-crimson">{error}</p>
          <button
            type="button"
            onClick={dismissError}
            className="text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="flex-1 text-[11px] font-mono text-emerald-200">{notice}</p>
          <button
            type="button"
            onClick={dismissNotice}
            className="text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Recording status */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-mono uppercase ${
            active
              ? state === "paused"
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-white/10 bg-black/40 text-[#8C8C90]"
          }`}
          data-testid="recorder-state"
        >
          <Radio className="h-3.5 w-3.5" />
          {state === "recording"
            ? "Recording"
            : state === "paused"
              ? "Paused"
              : state === "stopping"
                ? "Finished"
                : "Idle"}
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-mono uppercase ${
            QUALITY_STYLES[session?.gpsQuality ?? "searching"]
          }`}
          data-testid="gps-quality"
        >
          <Zap className="h-3.5 w-3.5" />
          GPS {GPS_QUALITY_LABELS[session?.gpsQuality ?? "searching"]}
        </div>
        {nativeRecording && (
          <div className="flex items-center gap-1.5 rounded-full border border-[#C81E3A]/30 bg-[#C81E3A]/10 px-2.5 py-1.5 text-[10px] font-mono uppercase text-[#E62846]">
            SVJ foreground service
          </div>
        )}
        {pendingSync > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10px] font-mono uppercase text-gold"
            data-testid="pending-sync"
          >
            <CloudOff className="h-3.5 w-3.5" />
            {pendingSync} waiting to sync
          </div>
        )}
      </div>

      {/* Activity type + split unit picker (locked while recording) */}
      {!active && !finished && (
        <div className="space-y-2.5 rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            Choose activity
          </div>
          <div className="grid grid-cols-4 gap-2" data-testid="activity-type-picker">
            {GPS_ACTIVITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActivityType(type)}
                data-testid={`pick-${type}`}
                className={`rounded-full border px-2 py-3 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                  activityType === type
                    ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"
                }`}
              >
                {GPS_ACTIVITY_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-[#8C8C90]">Splits</span>
            {(["km", "mi"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setSplitUnit(unit)}
                data-testid={`split-unit-${unit}`}
                className={`rounded-lg border px-2 py-1 text-[10px] font-mono uppercase ${
                  splitUnit === unit
                    ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 text-[#8C8C90]"
                }`}
              >
                {unit === "km" ? "1 km" : "1 mile"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
       * Metrics — Elapsed is the one number a runner glances at mid-run, so it
       * gets a hero tile. The rest are genuinely secondary and stay in a quiet
       * grid instead of seven boxes competing at the same weight.
       */}
      <div className="svj-radius-card svj-elev-1 svj-lit-top border border-white/[0.06] bg-[#17171A] px-4 py-3.5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8C8C90]">
              Elapsed
            </p>
            <p
              className={`mt-1 font-anton text-[42px] leading-none tracking-tight ${
                state === "paused" ? "text-gold" : "text-[#F4F2ED]"
              }`}
              data-testid="metric-elapsed"
            >
              {formatClock(session?.durationSeconds ?? 0)}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8C8C90]">
              Distance
            </p>
            <p
              className="mt-1 font-mono text-2xl font-bold leading-none text-[#F4F2ED]"
              data-testid="metric-distance"
            >
              {formatDistance(summary?.distanceMeters ?? 0, splitUnit)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric
          label={activityType === "cycling" ? "Current speed" : "Current pace"}
          value={
            activityType === "cycling"
              ? formatSpeed(currentPace ? 1000 / currentPace : null, splitUnit)
              : formatPace(currentPace, splitUnit)
          }
        />
        <Metric
          label={activityType === "cycling" ? "Average speed" : "Average pace"}
          value={
            activityType === "cycling"
              ? formatSpeed(summary?.avgSpeedMps, splitUnit)
              : formatPace(summary?.avgPaceSecondsPerKm, splitUnit)
          }
        />
        <Metric
          label="Moving time"
          value={formatClock(summary?.movingSeconds ?? 0)}
          hint={session?.autoPaused ? "Auto-paused" : undefined}
        />
        <Metric
          label="Elevation"
          value={
            summary?.elevationGainMeters != null
              ? `${Math.round(summary.elevationGainMeters)} m`
              : "—"
          }
          icon={<Mountain className="h-3 w-3 text-[#8C8C90]" />}
          hint="From GPS elevation"
        />
        {activityType === "cycling" ? (
          <Metric
            label="Cadence"
            value={summary?.avgCadence != null ? `${summary.avgCadence} rpm` : "—"}
            hint="Sensor data only"
          />
        ) : (
          <Metric
            label="Max speed"
            value={formatSpeed(summary?.maxSpeedMps, splitUnit)}
            icon={<Footprints className="h-3 w-3 text-[#8C8C90]" />}
            hint="From accepted GPS segments"
          />
        )}
        <Metric
          label="Heart rate"
          value={
            liveHeartRate
              ? `${liveHeartRate.bpm}`
              : summary?.avgHeartRate != null
                ? `${summary.avgHeartRate} bpm`
                : "—"
          }
          icon={<Heart className="h-3 w-3 text-[#E62846]" />}
          hint={
            liveHeartRate ? (
              <span className="block">
                {liveHeartRate.deviceName ??
                  (liveHeartRate.source === "wear_os" ? "SVJ Watch" : "Chest sensor")}
                <span
                  className={`mt-0.5 block font-semibold ${
                    liveHeartRate.status === "reconnecting" ? "text-gold" : "text-emerald-400"
                  }`}
                >
                  {liveHeartRate.status === "reconnecting" ? "Reconnecting" : "Live now"}
                </span>
              </span>
            ) : summary?.maxHeartRate != null ? (
              `Average ${summary.avgHeartRate ?? "—"}, peak ${summary.maxHeartRate} bpm`
            ) : (
              "No sensor connected"
            )
          }
        />
      </div>

      {plannedRoute && (
        <div className="svj-radius-row flex items-center gap-2 border border-[#C81E3A]/25 bg-[#C81E3A]/[0.08] px-3 py-2.5">
          <Link2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#E62846]" />
          <span className="min-w-0 flex-1 font-inter text-[11px] text-white">
            Following <span className="font-semibold text-[#E62846]">{plannedRoute.name}</span>
            <span className="mt-0.5 block text-[10px] text-[#8C8C90]">
              {plannedRouteSummary(plannedRoute)}
            </span>
          </span>
          {onClearPlannedRoute && (
            <button
              type="button"
              onClick={onClearPlannedRoute}
              data-testid="clear-planned-route"
              className="shrink-0 text-[11px] font-inter font-semibold text-[#8C8C90] hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Live map */}
      <ActivityMap
        points={points}
        guidePoints={guide}
        variant="hero"
        height={230}
        showCurrentPosition={state === "recording" && points.length > 1}
        emptyMessage={
          active
            ? "Searching for GPS — the map frames your position the moment a fix lands, then draws as you move."
            : "Start recording and this map centres on you, then draws your route as you move."
        }
      />

      {/* Controls */}
      <div className="flex gap-2">
        {!active && !finished && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(activityType, splitUnit)}
            data-testid="recorder-start"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/20 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#C81E3A]/35 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start {GPS_ACTIVITY_LABELS[activityType]}
          </button>
        )}

        {state === "recording" && (
          <button
            type="button"
            onClick={pause}
            data-testid="recorder-pause"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/15 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-gold"
          >
            <Pause className="h-4 w-4" />
            Pause
          </button>
        )}

        {state === "paused" && (
          <button
            type="button"
            onClick={resume}
            data-testid="recorder-resume"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-emerald-200"
          >
            <Play className="h-4 w-4" />
            Resume
          </button>
        )}

        {active && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void finish()}
            data-testid="recorder-finish"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/50 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-white disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            Finish
          </button>
        )}

        {finished && (
          <>
            <button
              type="button"
              disabled={busy || !canSave}
              onClick={() => void save()}
              data-testid="recorder-save"
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/20 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save workout
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void discard()}
              data-testid="recorder-discard"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-[#8C8C90] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Discard
            </button>
          </>
        )}
      </div>

      {/* Splits */}
      {(summary?.splits.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-white">Splits</span>
            {summary?.fastestSplitIndex != null && (
              <span className="text-[10px] font-mono text-[#E62846]">
                Fastest: split {summary.fastestSplitIndex}
              </span>
            )}
          </div>
          <div className="space-y-1">
            {summary!.splits.map((split) => (
              <div
                key={split.index}
                className={`flex items-center gap-3 rounded-lg border px-2.5 py-1.5 ${
                  split.index === summary!.fastestSplitIndex
                    ? "border-[#C81E3A]/40 bg-[#C81E3A]/8"
                    : "border-white/5 bg-black/30"
                }`}
              >
                <span className="w-12 text-[10px] font-mono uppercase text-[#8C8C90]">
                  {split.partial ? "…" : `${split.index}`}
                </span>
                <span className="flex-1 text-[11px] font-mono text-white">
                  {formatDistance(split.distanceMeters, splitUnit)}
                </span>
                <span className="text-[11px] font-mono text-white">
                  {formatClock(split.durationSeconds)}
                </span>
                <span className="w-20 text-right text-[10px] font-mono text-[#8C8C90]">
                  {formatPace(
                    Math.round(split.durationSeconds / (split.distanceMeters / 1000)),
                    splitUnit,
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SVJ Live Share */}
      {(active || finished) && (
        <div className="rounded-2xl border border-[#C81E3A]/25 bg-[#0B0B0C] p-4">
          <div className="mb-2 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-[#E62846]" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-white">
              SVJ Live Share
            </span>
          </div>
          <p className="mb-3 text-[10px] font-mono leading-relaxed text-[#8C8C90]">
            Share your live position with a private link. The link expires and stops working the
            moment you stop sharing. It never exposes your account.
          </p>
          {liveShare?.token ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2">
                <motion.span
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  className="h-2 w-2 rounded-full bg-emerald-400"
                />
                <span className="text-[11px] font-mono text-emerald-300">Sharing live</span>
              </div>
              <div className="break-all rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[10px] font-mono text-[#8C8C90]">
                {liveShareUrl(liveShare.token)}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(liveShareUrl(liveShare.token!))
                      .catch(() => {
                        /* clipboard unavailable */
                      })
                  }
                  data-testid="copy-live-link"
                  className="flex-1 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  disabled={liveShareBusy}
                  onClick={() => void stopSharing()}
                  data-testid="stop-live-share"
                  className="flex-1 rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50"
                >
                  Stop sharing
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={liveShareBusy || points.length < 2}
              onClick={() => void shareLive()}
              data-testid="start-live-share"
              className="w-full rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50"
            >
              {liveShareBusy ? "Preparing…" : "Start live sharing"}
            </button>
          )}
        </div>
      )}

      {!active && !finished && (
        <p className="text-[10px] font-mono leading-relaxed text-[#8C8C90]">
          SVJ records location only while you have an outdoor workout started. On Android the
          recording runs in a foreground service so it survives a locked screen, and a workout you
          pause or lose signal during is kept on the device until it syncs.
        </p>
      )}
    </div>
  );
};

export default WorkoutRecorder;
