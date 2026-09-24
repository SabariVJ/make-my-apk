import React, { useMemo } from "react";
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
import { SVJStatusPill } from "../components/ui-primitives/SVJStatusPill";
import { useWorkoutRecorder } from "../hooks/useWorkoutRecorder";
import {
  GPS_ACTIVITY_LABELS,
  GPS_ACTIVITY_TYPES,
  GPS_QUALITY_LABELS,
  formatClock,
  formatDistance,
  formatPace,
  haversineMeters,
  type GpsActivityType,
  type TrackPoint,
} from "../lib/gpsActivity";
import {
  liveShareUrl,
  plannedRouteSummary,
  routeToPoints,
  type SavedRoute,
} from "../lib/activityPlatform";

const QUALITY_STYLES: Record<string, string> = {
  searching: "border-white/[0.08] bg-svj-bg text-svj-secondary",
  weak: "border-gold/40 bg-gold/10 text-gold",
  good: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  excellent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
};

/**
 * Current pace from the most recent stretch of accepted points, so the live
 * readout reflects what the athlete is doing now rather than the whole
 * average. Pure and local; the saved workout's pace is computed server-side.
 *
 * Stabilised against early-session GPS noise: until the window contains both
 * enough elapsed time AND enough plausible displacement, the readout stays
 * "—" instead of extrapolating a pace like 2:34/km from a 7-second,
 * 49-metre GPS jump. Points with poor accuracy are excluded entirely.
 */
export function currentPaceSecondsPerKm(
  points: readonly TrackPoint[],
  windowSeconds = 30,
  options: {
    minWindowSeconds?: number;
    minDistanceMeters?: number;
    maxAccuracyMeters?: number;
  } = {},
): number | null {
  const minWindowSeconds = options.minWindowSeconds ?? 20;
  const minDistanceMeters = options.minDistanceMeters ?? 40;
  const maxAccuracyMeters = options.maxAccuracyMeters ?? 30;
  if (points.length < 2) return null;
  const last = points[points.length - 1]!;
  const cutoff = last.t - windowSeconds * 1000;
  let startIndex = points.length - 1;
  while (startIndex > 0 && points[startIndex - 1]!.t >= cutoff) startIndex -= 1;
  const first = points[startIndex]!;
  if (first === last) return null;
  const seconds = (last.t - first.t) / 1000;
  if (seconds < minWindowSeconds) return null;
  let distance = 0;
  for (let i = startIndex + 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.moving === false || b.moving === false) continue;
    // Skip segments anchored to a low-accuracy fix: a ±25 m error over a
    // short span fabricates either a sprint or a standstill.
    if (
      (a.accuracy != null && a.accuracy > maxAccuracyMeters) ||
      (b.accuracy != null && b.accuracy > maxAccuracyMeters)
    )
      continue;
    distance += haversineMeters(a.lat, a.lng, b.lat, b.lng);
  }
  if (distance < minDistanceMeters || seconds <= 0) return null;
  return Math.round(seconds / (distance / 1000));
}

const Metric: React.FC<{
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  icon?: React.ReactNode;
}> = ({ label, value, hint, accent, icon }) => (
  <div
    className={`rounded-2xl border p-3 ${
      accent ? "border-svj-crimson/30 bg-svj-crimson/8" : "border-white/[0.06] bg-svj-surface"
    }`}
  >
    <div className="mb-1 flex items-center gap-1.5">
      {icon}
      <span className="svj-label-xs uppercase tracking-[0.1em]">{label}</span>
    </div>
    <div
      className={`font-mono text-xl font-semibold tabular-nums ${
        accent ? "text-svj-crimson" : "text-svj-text"
      }`}
      data-testid={`metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      {value}
    </div>
    {hint && <div className="mt-0.5 font-mono text-[9px] leading-snug text-svj-muted">{hint}</div>}
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
            className="text-[10px] font-mono uppercase text-svj-secondary hover:text-svj-text"
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
            className="text-[10px] font-mono uppercase text-svj-secondary hover:text-svj-text"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Recording status */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.08em] ${
            active
              ? state === "paused"
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-svj-crimson/40 bg-svj-crimson/10 text-svj-crimson"
              : "border-white/[0.08] bg-svj-bg text-svj-secondary"
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
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.08em] ${
            QUALITY_STYLES[session?.gpsQuality ?? "searching"]
          }`}
          data-testid="gps-quality"
        >
          <Zap className="h-3.5 w-3.5" />
          GPS {GPS_QUALITY_LABELS[session?.gpsQuality ?? "searching"]}
        </div>
        {nativeRecording && (
          <div className="flex items-center gap-1.5 rounded-md border border-svj-crimson/30 bg-svj-crimson/10 px-2.5 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.08em] text-svj-crimson">
            SVJ foreground service
          </div>
        )}
        {pendingSync > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-[0.08em] text-gold"
            data-testid="pending-sync"
          >
            <CloudOff className="h-3.5 w-3.5" />
            {pendingSync} waiting to sync
          </div>
        )}
      </div>

      {/* Activity type + split unit picker (locked while recording) */}
      {!active && !finished && (
        <div className="space-y-2.5 rounded-2xl border border-white/[0.06] bg-svj-bg p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-svj-secondary">
            Choose activity
          </div>
          <div className="grid grid-cols-4 gap-2" data-testid="activity-type-picker">
            {GPS_ACTIVITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActivityType(type)}
                data-testid={`pick-${type}`}
                className={`rounded-full border min-h-11 px-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                  activityType === type
                    ? "border-svj-crimson/60 bg-svj-crimson/15 text-svj-text"
                    : "border-white/[0.08] bg-svj-bg text-svj-secondary hover:text-svj-text"
                }`}
              >
                {GPS_ACTIVITY_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-svj-secondary">Splits</span>
            {(["km", "mi"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                onClick={() => setSplitUnit(unit)}
                data-testid={`split-unit-${unit}`}
                className={`rounded-lg border px-2 py-1 text-[10px] font-mono uppercase ${
                  splitUnit === unit
                    ? "border-svj-crimson/50 bg-svj-crimson/15 text-svj-text"
                    : "border-white/[0.08] text-svj-secondary"
                }`}
              >
                {unit === "km" ? "1 km" : "1 mile"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="Elapsed" value={formatClock(session?.durationSeconds ?? 0)} accent />
        <Metric label="Distance" value={formatDistance(summary?.distanceMeters ?? 0, splitUnit)} />
        <Metric label="Current pace" value={formatPace(currentPace, splitUnit)} />
        <Metric label="Average pace" value={formatPace(summary?.avgPaceSecondsPerKm, splitUnit)} />
        <Metric
          label="Elevation"
          value={
            summary?.elevationGainMeters != null
              ? `${Math.round(summary.elevationGainMeters)} m`
              : "—"
          }
          icon={<Mountain className="h-3 w-3 text-svj-secondary" />}
          hint="From GPS elevation"
        />
        <Metric
          label="Steps"
          value={(session?.steps ?? 0).toLocaleString()}
          icon={<Footprints className="h-3 w-3 text-svj-secondary" />}
        />
        <Metric
          label="Heart rate"
          value={
            liveHeartRate
              ? `${liveHeartRate.bpm}`
              : summary?.avgHeartRate != null
                ? `${summary.avgHeartRate} bpm`
                : "—"
          }
          icon={<Heart className="h-3 w-3 text-svj-crimson" />}
          hint={
            liveHeartRate
              ? `${liveHeartRate.deviceName ?? (liveHeartRate.source === "wear_os" ? "SVJ Watch" : "Chest sensor")} · ${
                  liveHeartRate.status === "reconnecting" ? "reconnecting" : "live"
                }`
              : summary?.maxHeartRate != null
                ? `avg ${summary.avgHeartRate ?? "—"} · max ${summary.maxHeartRate} bpm`
                : "No sensor connected"
          }
        />
        <Metric
          label="Moving time"
          value={formatClock(summary?.movingSeconds ?? 0)}
          hint={session?.autoPaused ? "Auto-paused" : undefined}
        />
      </div>

      {plannedRoute && (
        <div className="flex items-center gap-2 rounded-xl border border-svj-crimson/25 bg-svj-crimson/8 px-3 py-2">
          <span className="flex-1 text-[10px] font-mono text-svj-text">
            Following route: <span className="text-svj-crimson">{plannedRoute.name}</span> ·{" "}
            {plannedRouteSummary(plannedRoute)}
          </span>
          {onClearPlannedRoute && (
            <button
              type="button"
              onClick={onClearPlannedRoute}
              data-testid="clear-planned-route"
              className="text-[10px] font-mono uppercase text-svj-secondary hover:text-svj-text"
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
            ? "Searching for GPS — head outdoors for a fix."
            : "Start recording to draw your SVJ route."
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-svj-crimson/60 bg-svj-crimson/20 min-h-12 px-4 text-xs font-mono font-bold uppercase tracking-widest text-svj-text transition-colors hover:bg-svj-crimson/35 disabled:opacity-50"
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/15 min-h-12 px-4 text-xs font-mono font-bold uppercase tracking-widest text-gold"
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 min-h-12 px-4 text-xs font-mono font-bold uppercase tracking-widest text-emerald-200"
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-svj-bg min-h-12 px-4 text-xs font-mono font-bold uppercase tracking-widest text-svj-text disabled:opacity-50"
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
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl border border-svj-crimson/60 bg-svj-crimson/20 min-h-12 px-4 text-xs font-mono font-bold uppercase tracking-widest text-svj-text disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save workout
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void discard()}
              data-testid="recorder-discard"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-svj-bg min-h-12 px-4 text-xs font-mono font-bold uppercase tracking-widest text-svj-secondary disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Discard
            </button>
          </>
        )}
      </div>

      {/* Splits */}
      {(summary?.splits.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-svj-bg p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-svj-text">
              Splits
            </span>
            {summary?.fastestSplitIndex != null && (
              <span className="text-[10px] font-mono text-svj-crimson">
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
                    ? "border-svj-crimson/40 bg-svj-crimson/8"
                    : "border-white/[0.06] bg-svj-bg"
                }`}
              >
                <span className="w-12 text-[10px] font-mono uppercase text-svj-secondary">
                  {split.partial ? "…" : `${split.index}`}
                </span>
                <span className="flex-1 text-[11px] font-mono text-svj-text">
                  {formatDistance(split.distanceMeters, splitUnit)}
                </span>
                <span className="text-[11px] font-mono text-svj-text">
                  {formatClock(split.durationSeconds)}
                </span>
                <span className="w-20 text-right text-[10px] font-mono text-svj-secondary">
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
        <div className="rounded-2xl border border-svj-crimson/25 bg-svj-bg p-4">
          <div className="mb-2 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-svj-crimson" />
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-svj-text">
              SVJ Live Share
            </span>
          </div>
          <p className="mb-3 text-[10px] font-mono leading-relaxed text-svj-secondary">
            Share your live position with a private link. The link expires and stops working the
            moment you stop sharing. It never exposes your account.
          </p>
          {liveShare?.token ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2">
                <SVJStatusPill tone="positive" dot pulse>
                  Sharing live
                </SVJStatusPill>
              </div>
              <div className="break-all rounded-lg border border-white/[0.08] bg-svj-bg px-3 py-2 text-[10px] font-mono text-svj-secondary">
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
                  className="min-h-11 flex-1 rounded-lg border border-white/[0.08] bg-svj-bg px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-svj-text svj-press"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  disabled={liveShareBusy}
                  onClick={() => void stopSharing()}
                  data-testid="stop-live-share"
                  className="min-h-11 flex-1 rounded-lg border border-svj-crimson/50 bg-svj-crimson/15 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-svj-text disabled:opacity-50 svj-press"
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
              className="min-h-11 w-full rounded-lg border border-svj-crimson/50 bg-svj-crimson/15 px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-svj-text disabled:opacity-50 svj-press"
            >
              {liveShareBusy ? "Preparing…" : "Start live sharing"}
            </button>
          )}
        </div>
      )}

      {!active && !finished && (
        <p className="text-[10px] font-mono leading-relaxed text-svj-secondary">
          SVJ records location only while you have an outdoor workout started. On Android the
          recording runs in a foreground service so it survives a locked screen, and a workout you
          pause or lose signal during is kept on the device until it syncs.
        </p>
      )}
    </div>
  );
};

export default WorkoutRecorder;
