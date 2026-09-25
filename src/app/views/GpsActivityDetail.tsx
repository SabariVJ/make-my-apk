import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Flag,
  Footprints,
  Heart,
  Loader2,
  Mountain,
  Route as RouteIcon,
  Satellite,
  Timer,
  Watch,
} from "lucide-react";
import { ActivityMap } from "../components/ActivityMap";
import {
  activityRpcClient,
  createSegment,
  fetchActivityTrack,
  saveRouteFromActivity,
  type ActivityTrack,
  type RpcClient,
} from "../lib/activityPlatform";
import {
  formatActivityDate,
  formatDurationLabel,
  type ActivityType,
  type ServerActivity,
} from "../lib/serverActivities";
import {
  formatClock,
  formatDistance,
  formatPace,
  formatSpeed,
  haversineMeters,
  type Split,
} from "../lib/gpsActivity";

/** Activity row plus the GPS summary columns added by the track migration. */
export interface GpsActivityRow extends ServerActivity {
  movingSeconds?: number | null;
  elevationGainMeters?: number | null;
  avgspeedMps?: number | null;
  avgSpeedMps?: number | null;
  maxSpeedMps?: number | null;
  avgPaceSecondsPerKm?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  avgCadence?: number | null;
  trackPointCount?: number | null;
  splits?: Split[] | null;
  splitUnit?: string | null;
  devicePlatform?: string | null;
  gpsQuality?: string | null;
  autoPaused?: boolean | null;
}

export const SOURCE_LABELS: Record<string, string> = {
  svj_native: "Recorded by SVJ",
  manual: "Logged manually",
  strength_log: "Structured strength",
  health_connect: "Health Connect",
  wear_os: "SVJ Watch",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? "SVJ activity";
}

type Section = "overview" | "map" | "splits" | "performance" | "heart" | "elevation" | "source";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Map" },
  { id: "splits", label: "Splits" },
  { id: "performance", label: "Performance" },
  { id: "heart", label: "Heart Rate" },
  { id: "elevation", label: "Elevation" },
  { id: "source", label: "Source" },
];

function chartTooltip() {
  return {
    contentStyle: {
      background: "#141116",
      border: "1px solid rgba(230,40,70,0.35)",
      borderRadius: 12,
      fontFamily: "monospace",
      fontSize: 11,
    },
    labelStyle: { color: "#F4F2ED" },
    itemStyle: { color: "#E62846" },
  };
}

/** Rolling pace series from the sampled track, for the performance chart. */
export function paceSeries(
  track: ActivityTrack,
  windowSeconds = 30,
): { t: number; label: string; pace: number | null; speed: number | null }[] {
  const points = track.points;
  const series: { t: number; label: string; pace: number | null; speed: number | null }[] = [];
  let startIndex = 0;
  for (let i = 1; i < points.length; i += 1) {
    while (startIndex < i && points[i]!.t - points[startIndex]!.t > windowSeconds * 1000) {
      startIndex += 1;
    }
    let distance = 0;
    for (let j = startIndex + 1; j <= i; j += 1) {
      const a = points[j - 1]!;
      const b = points[j]!;
      if (a.moving === false || b.moving === false) continue;
      distance += haversineMeters(a.lat, a.lng, b.lat, b.lng);
    }
    const seconds = (points[i]!.t - points[startIndex]!.t) / 1000;
    const speed = seconds > 0 && distance > 5 ? distance / seconds : null;
    series.push({
      t: points[i]!.t,
      label: formatClock(Math.round(points[i]!.t / 1000)),
      pace: speed != null ? Math.round(1000 / speed) : null,
      speed: speed != null ? Math.round(speed * 100) / 100 : null,
    });
  }
  // Downsample so the chart stays light on a long workout.
  const stride = Math.max(1, Math.ceil(series.length / 220));
  return series.filter((_, index) => index % stride === 0);
}

export function elevationSeries(track: ActivityTrack) {
  const stride = Math.max(1, Math.ceil(track.points.length / 220));
  return track.points
    .filter((_, index) => index % stride === 0)
    .filter((point) => point.ele != null)
    .map((point) => ({
      label: formatClock(Math.round(point.t / 1000)),
      elevation: Math.round(point.ele as number),
    }));
}

export function heartRateSeries(track: ActivityTrack) {
  const stride = Math.max(1, Math.ceil(track.points.length / 220));
  return track.points
    .filter((_, index) => index % stride === 0)
    .filter((point) => point.hr != null)
    .map((point) => ({
      label: formatClock(Math.round(point.t / 1000)),
      hr: Math.round(point.hr as number),
    }));
}

export interface GpsActivityDetailProps {
  activity: GpsActivityRow;
  /** `embedded` renders inside an existing detail screen without its header. */
  embedded?: boolean;
  onBack?: () => void;
  client?: RpcClient | null;
}

export const GpsActivityDetail: React.FC<GpsActivityDetailProps> = ({
  activity,
  embedded = false,
  onBack,
  client: injectedClient,
}) => {
  const [section, setSection] = useState<Section>("overview");
  const [track, setTrack] = useState<ActivityTrack | null>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [segmentName, setSegmentName] = useState("");
  const [segmentStart, setSegmentStart] = useState("0");
  const [segmentEnd, setSegmentEnd] = useState("");

  const client = injectedClient ?? activityRpcClient();
  // GPS capability is decided by provenance, not by a summary column: history
  // rows are normalized and may not carry the optional track metadata. A track
  // that fails to load simply reads as "no route" instead.
  const isGpsRecorded = activity.source === "svj_native";
  const unit: "km" | "mi" = activity.splitUnit === "mi" ? "mi" : "km";
  const splits = activity.splits ?? [];

  useEffect(() => {
    if (!isGpsRecorded || !client) return;
    let cancelled = false;
    setLoadingTrack(true);
    void fetchActivityTrack(client, activity.id).then((result) => {
      if (cancelled) return;
      if (result.ok && result.track) setTrack(result.track);
      else setTrackError(result.error ?? "Couldn't load the recorded route.");
      setLoadingTrack(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activity.id, client, isGpsRecorded]);

  const paceData = useMemo(() => (track ? paceSeries(track) : []), [track]);
  const elevationData = useMemo(() => (track ? elevationSeries(track) : []), [track]);
  const heartData = useMemo(() => (track ? heartRateSeries(track) : []), [track]);

  const fastest = useMemo(() => {
    const complete = splits.filter((split) => !split.partial && split.durationSeconds > 0);
    if (complete.length === 0) return null;
    return complete.reduce((best, split) =>
      split.durationSeconds < best.durationSeconds ? split : best,
    );
  }, [splits]);

  const saveRoute = async () => {
    if (!client) return;
    const name = routeName.trim() || `${sourceLabel(activity.source)} route`;
    setBusy(true);
    setError(null);
    try {
      const result = await saveRouteFromActivity(client, activity.id, name);
      if (!result.ok) setError(result.error ?? "Couldn't save this route.");
      else setNotice(`Saved "${name}" to your route library.`);
    } finally {
      setBusy(false);
    }
  };

  const makeSegment = async () => {
    if (!client || !track || track.points.length < 2) return;
    const name = segmentName.trim();
    if (!name) {
      setError("Give the segment a name.");
      return;
    }
    const startIndex = Math.max(0, Math.min(Number(segmentStart) || 0, track.points.length - 2));
    const endIndex = Math.max(
      startIndex + 1,
      Math.min(Number(segmentEnd) || track.points.length - 1, track.points.length - 1),
    );
    const start = track.points[startIndex]!;
    const end = track.points[endIndex]!;
    setBusy(true);
    setError(null);
    try {
      const result = await createSegment(client, {
        name,
        activityId: activity.id,
        startLat: start.lat,
        startLng: start.lng,
        endLat: end.lat,
        endLng: end.lng,
        activityType: activity.activityType,
      });
      if (!result.ok) setError(result.error ?? "Couldn't create this segment.");
      else {
        setNotice(`Segment "${name}" saved. Future workouts will be matched against it.`);
        setSegmentName("");
      }
    } finally {
      setBusy(false);
    }
  };

  const metrics = [
    {
      label: "Distance",
      value: formatDistance(activity.distanceMeters, unit),
      icon: <RouteIcon className="h-3 w-3 text-[#8C8C90]" />,
    },
    {
      label: "Moving time",
      value: formatClock(activity.movingSeconds ?? activity.durationSeconds),
      icon: <Timer className="h-3 w-3 text-[#8C8C90]" />,
    },
    {
      label: "Elapsed",
      value: formatDurationLabel(activity.durationSeconds),
      icon: <Watch className="h-3 w-3 text-[#8C8C90]" />,
    },
    { label: "Average pace", value: formatPace(activity.avgPaceSecondsPerKm ?? null, unit) },
    { label: "Average speed", value: formatSpeed(activity.avgSpeedMps ?? null, unit) },
    {
      label: "Elevation gain",
      value:
        activity.elevationGainMeters != null
          ? `${Math.round(activity.elevationGainMeters)} m`
          : "—",
      icon: <Mountain className="h-3 w-3 text-[#8C8C90]" />,
    },
    {
      label: "Steps",
      value: activity.stepCount.toLocaleString(),
      icon: <Footprints className="h-3 w-3 text-[#8C8C90]" />,
    },
    {
      label: "Heart rate",
      value: activity.avgHeartRate != null ? `${activity.avgHeartRate} bpm` : "—",
      icon: <Heart className="h-3 w-3 text-[#8C8C90]" />,
      hint: activity.maxHeartRate != null ? `max ${activity.maxHeartRate} bpm` : undefined,
    },
  ];

  return (
    <div className={embedded ? "space-y-3" : "space-y-4 pb-8"} data-testid="gps-activity-detail">
      <div className={`flex items-center gap-3 ${embedded ? "hidden" : ""}`}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to history"
            data-testid="detail-back"
            className="rounded-lg border border-white/10 bg-black/40 p-2 text-[#8C8C90] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-anton text-xl tracking-wider text-white">
            {activity.activityType}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-inter text-[11px] text-[#8C8C90]">
            <span>{formatActivityDate(activity.startedAt)}</span>
            <span>{sourceLabel(activity.source)}</span>
            {activity.gpsQuality && (
              <span className="inline-flex items-center gap-1">
                <Satellite aria-hidden className="h-3 w-3" /> GPS {activity.gpsQuality}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
          <p className="flex-1 text-[11px] font-mono text-crimson">{error}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-[11px] font-mono text-emerald-200">
          {notice}
        </div>
      )}

      {/* Section nav */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="detail-sections">
        {SECTIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSection(entry.id)}
            className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
              section === entry.id
                ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {(section === "overview" || section === "map") && (
        <ActivityMap
          points={track?.points ?? []}
          bounds={track?.bounds ?? null}
          variant="hero"
          height={section === "map" ? 320 : 230}
          emptyMessage={
            loadingTrack
              ? "Loading your SVJ route…"
              : isGpsRecorded
                ? "Route could not be loaded."
                : "This activity has no GPS route (manual or sensor-only)."
          }
        />
      )}

      {section === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/5 bg-black/40 p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  {metric.icon}
                  <span className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                    {metric.label}
                  </span>
                </div>
                <div className="font-mono text-base font-bold text-white">{metric.value}</div>
                {metric.hint && (
                  <div className="mt-0.5 text-[9px] font-mono text-[#8C8C90]">{metric.hint}</div>
                )}
              </div>
            ))}
          </div>
          {fastest && (
            <div className="rounded-2xl border border-[#C81E3A]/25 bg-[#0B0B0C] p-4">
              <div className="mb-1 flex items-center gap-2">
                <Flag className="h-4 w-4 text-[#E62846]" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Fastest split
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-mono text-lg font-bold text-white">
                  {formatClock(fastest.durationSeconds)}
                </span>
                <span className="font-mono text-xs text-[#8C8C90]">
                  {formatPace(
                    Math.round(fastest.durationSeconds / (fastest.distanceMeters / 1000)),
                    unit,
                  )}
                </span>
                <span className="font-inter text-[11px] text-[#8C8C90]">Split {fastest.index}</span>
              </div>
            </div>
          )}
        </>
      )}

      {section === "splits" && (
        <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
          {splits.length === 0 ? (
            <p className="text-[11px] font-mono text-[#8C8C90]">
              No splits for this activity. Splits are computed for GPS-recorded workouts.
            </p>
          ) : (
            <div className="space-y-1">
              {splits.map((split) => (
                <div
                  key={split.index}
                  className={`flex items-center gap-3 rounded-lg border px-2.5 py-1.5 ${
                    split.index === fastest?.index
                      ? "border-[#C81E3A]/40 bg-[#C81E3A]/8"
                      : "border-white/5 bg-black/30"
                  }`}
                >
                  <span className="w-10 text-[10px] font-mono uppercase text-[#8C8C90]">
                    {split.partial ? "…" : `#${split.index}`}
                  </span>
                  <span className="flex-1 text-[11px] font-mono text-white">
                    {formatDistance(split.distanceMeters, unit)}
                  </span>
                  <span className="text-[11px] font-mono text-white">
                    {formatClock(split.durationSeconds)}
                  </span>
                  <span className="w-16 text-right text-[10px] font-mono text-[#8C8C90]">
                    {split.elevationGainMeters != null
                      ? `+${Math.round(split.elevationGainMeters)} m`
                      : "—"}
                  </span>
                  <span className="w-20 text-right text-[10px] font-mono text-[#8C8C90]">
                    {formatPace(
                      Math.round(split.durationSeconds / (split.distanceMeters / 1000)),
                      unit,
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "performance" && (
        <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            {unit === "mi" ? "Speed over time" : "Pace over time"}
          </span>
          {paceData.length < 2 ? (
            <p className="mt-2 text-[11px] font-mono text-[#8C8C90]">Not enough track data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={paceData} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatClock(v)}
                />
                <Tooltip {...chartTooltip()} formatter={(value: number) => formatClock(value)} />
                <Line
                  type="monotone"
                  dataKey="pace"
                  stroke="#E62846"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {section === "heart" && (
        <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            Heart rate
          </span>
          {heartData.length < 2 ? (
            <p className="mt-2 text-[11px] font-mono text-[#8C8C90]">
              No heart-rate samples were recorded for this workout.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={heartData} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  domain={["dataMin - 10", "dataMax + 10"]}
                />
                <Tooltip {...chartTooltip()} />
                <Line type="monotone" dataKey="hr" stroke="#F59E0B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {section === "elevation" && (
        <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            Elevation profile
          </span>
          {elevationData.length < 2 ? (
            <p className="mt-2 text-[11px] font-mono text-[#8C8C90]">
              No elevation samples were recorded for this workout.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={elevationData} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="svj-elevation" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E62846" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#E62846" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" }}
                  axisLine={false}
                  tickLine={false}
                  domain={["dataMin - 10", "dataMax + 10"]}
                />
                <Tooltip {...chartTooltip()} />
                <Area
                  type="monotone"
                  dataKey="elevation"
                  stroke="#E62846"
                  fill="url(#svj-elevation)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {section === "source" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
            <div className="mb-3 text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
              Provenance
            </div>
            <dl className="space-y-1.5 text-[11px] font-mono">
              {[
                ["Source", sourceLabel(activity.source)],
                ["Provenance key", activity.source],
                ["Device platform", activity.devicePlatform ?? "—"],
                ["GPS quality", activity.gpsQuality ?? "—"],
                ["Track points", (activity.trackPointCount ?? 0).toLocaleString()],
                ["Auto-pause used", activity.autoPaused ? "Yes" : "No"],
                ["Started", new Date(activity.startedAt).toLocaleString()],
                ["Ended", new Date(activity.endedAt).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-[#8C8C90]">{label}</dt>
                  <dd className="text-right text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[10px] font-mono leading-relaxed text-[#8C8C90]">
              Distance, moving time, elevation and splits for this workout were computed on the SVJ
              server from the recorded GPS points. XP is granted only by the server reward engine.
            </p>
          </div>

          {isGpsRecorded && client && (
            <>
              <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-[#E62846]" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-white">
                    Save as route
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={routeName}
                    onChange={(event) => setRouteName(event.target.value)}
                    placeholder="Route name"
                    aria-label="Route name"
                    className="flex-1 rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white placeholder:text-[#8C8C90] focus:border-[#C81E3A]/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveRoute()}
                    data-testid="save-route"
                    className="rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Flag className="h-4 w-4 text-[#E62846]" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-white">
                    Create a personal segment
                  </span>
                </div>
                <p className="mb-3 text-[10px] font-mono leading-relaxed text-[#8C8C90]">
                  Segments are private to you: SVJ matches them against your own future workouts to
                  show your best time and your improvement. There are no public leaderboards.
                </p>
                <div className="space-y-2">
                  <input
                    value={segmentName}
                    onChange={(event) => setSegmentName(event.target.value)}
                    placeholder="Segment name"
                    aria-label="Segment name"
                    className="w-full rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white placeholder:text-[#8C8C90] focus:border-[#C81E3A]/60 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex-1 text-[10px] font-mono text-[#8C8C90]">
                      Start point
                      <input
                        value={segmentStart}
                        onChange={(event) => setSegmentStart(event.target.value)}
                        inputMode="numeric"
                        aria-label="Segment start point index"
                        className="mt-1 w-full rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white focus:border-[#C81E3A]/60 focus:outline-none"
                      />
                    </label>
                    <label className="flex-1 text-[10px] font-mono text-[#8C8C90]">
                      End point
                      <input
                        value={segmentEnd}
                        onChange={(event) => setSegmentEnd(event.target.value)}
                        inputMode="numeric"
                        placeholder={String(track?.points.length ? track.points.length - 1 : "")}
                        aria-label="Segment end point index"
                        className="mt-1 w-full rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white placeholder:text-[#8C8C90] focus:border-[#C81E3A]/60 focus:outline-none"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !track}
                    onClick={() => void makeSegment()}
                    data-testid="create-segment"
                    className="w-full rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    Create segment
                  </button>
                </div>
              </div>
            </>
          )}

          {trackError && <p className="text-[10px] font-mono text-[#8C8C90]">{trackError}</p>}
        </div>
      )}
    </div>
  );
};

export default GpsActivityDetail;
