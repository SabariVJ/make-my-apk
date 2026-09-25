import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Crosshair,
  Flame,
  Flag,
  Loader2,
  RefreshCw,
  Trash2,
  Trophy,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  SVJ_STREET_TILES,
  createTileViewport,
  createTileViewportAtZoom,
  type MapBounds,
} from "../components/ActivityMap";
import {
  HEATMAP_RANGES,
  HEATMAP_RANGE_LABELS,
  activityRpcClient,
  deleteSegment,
  fetchActivityHeatmap,
  fetchGpsRecords,
  fetchSegments,
  gpsRecordFormat,
  GPS_RECORD_LABELS,
  type GpsRecord,
  type HeatmapCell,
  type HeatmapRange,
  type PersonalSegment,
  type RpcClient,
} from "../lib/activityPlatform";
import {
  GPS_ACTIVITY_TYPES,
  formatClock,
  formatDistance,
  formatPace,
  formatSpeed,
  type GpsActivityType,
} from "../lib/gpsActivity";

type Section = "records" | "heatmap" | "segments";

export function formatRecordValue(record: GpsRecord): string {
  switch (gpsRecordFormat(record.recordType)) {
    case "duration":
      return formatClock(record.value);
    case "pace":
      return formatPace(record.value);
    case "speed":
      return formatSpeed(record.value);
    default:
      return formatDistance(record.value);
  }
}

export function recordLabel(recordType: string): string {
  return GPS_RECORD_LABELS[recordType as keyof typeof GPS_RECORD_LABELS] ?? recordType;
}

/**
 * Private heatmap of your own SVJ GPS activity.
 *
 * Renders on the same real OpenStreetMap basemap as the activity route map,
 * so density cells sit on the streets the athlete actually ran — not on an
 * abstract grid. Cells stay pure SVJ-owned aggregates; the tile layer comes
 * from the public OSM service with no API key.
 */
export const HeatmapCanvas: React.FC<{ cells: readonly HeatmapCell[]; height?: number }> = ({
  cells,
  height = 260,
}) => {
  const width = 400;
  const mapPoints = useMemo(() => cells.map((cell) => ({ lat: cell.lat, lng: cell.lng })), [cells]);
  const fitViewport = useMemo(
    () => createTileViewport(mapPoints, width, height),
    [mapPoints, height],
  );
  const [zoom, setZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setZoom(null);
    setPan({ x: 0, y: 0 });
  }, [cells]);

  const viewport = useMemo(() => {
    if (zoom == null && pan.x === 0 && pan.y === 0) return fitViewport;
    return createTileViewportAtZoom(
      fitViewport.centerLat,
      fitViewport.centerLng,
      zoom ?? fitViewport.zoom,
      width,
      height,
      pan.x,
      pan.y,
    );
  }, [fitViewport, height, pan, zoom]);

  const maxWeight = useMemo(
    () => cells.reduce((max, cell) => Math.max(max, cell.weight), 0),
    [cells],
  );

  const projected = useMemo(
    () => cells.map((cell) => viewport.project(cell.lat, cell.lng)),
    [cells, viewport],
  );

  const changeZoom = (delta: number) => {
    setZoom((current) => Math.min(19, Math.max(3, Math.round(current ?? fitViewport.zoom) + delta)));
  };

  const resetView = () => {
    setZoom(null);
    setPan({ x: 0, y: 0 });
  };

  if (cells.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/8 bg-[#08080A]"
        style={{ height }}
        data-testid="heatmap-empty"
      >
        <Flame className="h-5 w-5 text-[#8C8C90]" />
        <p className="px-6 text-center text-[11px] font-mono text-[#8C8C90]">
          No GPS activity matches this filter yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative touch-none overflow-hidden rounded-2xl border border-white/8 bg-[#08080A]"
      style={{ height }}
      data-testid="heatmap"
      onPointerDown={(event) => {
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      {SVJ_STREET_TILES.urlTemplate &&
        viewport.tiles.map((tile) => (
          <img
            key={`${tile.z}/${tile.x}/${tile.y}`}
            src={SVJ_STREET_TILES.urlTemplate!.replace("{z}", String(tile.z))
              .replace("{x}", String(tile.x))
              .replace("{y}", String(tile.y))}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{ left: tile.left, top: tile.top, width: 256, height: 256 }}
          />
        ))}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="pointer-events-none absolute inset-0 w-full"
        style={{ height }}
        role="img"
        aria-label="Personal activity heatmap"
      >
        {projected.map((point, index) => {
          const weight = cells[index]?.weight ?? 1;
          const intensity = maxWeight > 0 ? weight / maxWeight : 0;
          return (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={2.2 + intensity * 5.5}
              fill="#E62846"
              opacity={0.16 + intensity * 0.62}
            />
          );
        })}
      </svg>

      <div
        className="absolute left-2 top-2 flex flex-col gap-1"
        aria-label="Heatmap controls"
        data-testid="heatmap-controls"
      >
        <button
          type="button"
          onClick={() => changeZoom(1)}
          aria-label="Zoom heatmap in"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/75 text-white"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => changeZoom(-1)}
          aria-label="Zoom heatmap out"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/75 text-white"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset heatmap view"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/75 text-white"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[8px] font-mono text-[#B8B8C0]">
        Drag to pan · zoom {viewport.zoom}
      </span>

      {SVJ_STREET_TILES.attribution && (
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-mono text-[#8C8C90]">
          {SVJ_STREET_TILES.attribution}
        </span>
      )}
    </div>
  );
};

export interface RecordsViewProps {
  client?: RpcClient | null;
}

export const RecordsView: React.FC<RecordsViewProps> = ({ client: injected }) => {
  const [section, setSection] = useState<Section>("records");
  const [records, setRecords] = useState<GpsRecord[]>([]);
  const [segments, setSegments] = useState<PersonalSegment[]>([]);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [range, setRange] = useState<HeatmapRange>("all");
  const [heatType, setHeatType] = useState<GpsActivityType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const client = injected ?? activityRpcClient();

  const load = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [recordsResult, segmentsResult] = await Promise.all([
      fetchGpsRecords(client),
      fetchSegments(client),
    ]);
    if (recordsResult.ok) setRecords(recordsResult.records);
    if (segmentsResult.ok) setSegments(segmentsResult.segments);
    if (!recordsResult.ok && !segmentsResult.ok) {
      setError(recordsResult.error ?? segmentsResult.error ?? "Couldn't load your records.");
    } else {
      setError(null);
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadHeatmap = useCallback(async () => {
    if (!client) return;
    setHeatmapLoading(true);
    const result = await fetchActivityHeatmap(client, { range, activityType: heatType });
    if (result.ok) {
      setCells(result.cells);
      setHeatmapError(null);
    } else {
      // Distinguish a data problem (heatmap stays empty) from a request
      // failure (explicit error) — a silently blank map is never acceptable.
      setHeatmapError(result.error ?? "Couldn't build your heatmap.");
    }
    setHeatmapLoading(false);
  }, [client, heatType, range]);

  useEffect(() => {
    if (section !== "heatmap") return;
    void loadHeatmap();
  }, [loadHeatmap, section]);

  const removeSegment = async (segment: PersonalSegment) => {
    if (!client) return;
    setBusy(true);
    try {
      const result = await deleteSegment(client, segment.id);
      if (!result.ok) setError(result.error ?? "Couldn't delete this segment.");
      else setSegments((current) => current.filter((item) => item.id !== segment.id));
    } finally {
      setBusy(false);
    }
  };

  if (!client) {
    return (
      <p className="text-[11px] font-mono text-[#8C8C90]">
        Sign in to see your SVJ records, heatmap and personal segments.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="records-view">
      <div className="flex gap-1.5" data-testid="records-sections">
        {(
          [
            { id: "records", label: "Records", icon: Trophy },
            { id: "heatmap", label: "Heatmap", icon: Flame },
            { id: "segments", label: "Segments", icon: Flag },
          ] as const
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setSection(entry.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
              section === entry.id
                ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"
            }`}
          >
            <entry.icon className="h-3.5 w-3.5" />
            {entry.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
          <p className="flex-1 text-[11px] font-mono text-crimson">{error}</p>
        </div>
      )}

      {loading && records.length === 0 && segments.length === 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-black/40 p-4 text-[11px] font-mono text-[#8C8C90]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {section === "records" && (
        <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-white">
              Personal bests
            </span>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh records"
              className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          {records.length === 0 ? (
            <p className="text-[11px] font-mono text-[#8C8C90]">
              No GPS records yet. Record a run, walk or ride to set your first bests.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {records.map((record) => (
                <div
                  key={record.recordType}
                  className="rounded-2xl border border-white/5 bg-black/40 p-3"
                  data-testid="record-card"
                >
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                    {recordLabel(record.recordType)}
                  </div>
                  <div className="mt-1 font-mono text-base font-bold text-[#E62846]">
                    {formatRecordValue(record)}
                  </div>
                  <div className="mt-0.5 text-[9px] font-mono text-[#8C8C90]">
                    {record.activityType}
                    {record.achievedAt
                      ? ` · ${new Date(record.achievedAt).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === "heatmap" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {HEATMAP_RANGES.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setRange(entry)}
                data-testid={`heatmap-range-${entry}`}
                className={`rounded-lg border px-2 py-1 text-[10px] font-mono uppercase ${
                  range === entry
                    ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 bg-black/40 text-[#8C8C90]"
                }`}
              >
                {HEATMAP_RANGE_LABELS[entry]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setHeatType(null)}
              className={`rounded-lg border px-2 py-1 text-[10px] font-mono uppercase ${
                heatType == null
                  ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                  : "border-white/10 bg-black/40 text-[#8C8C90]"
              }`}
            >
              All
            </button>
            {GPS_ACTIVITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setHeatType(type)}
                data-testid={`heatmap-type-${type}`}
                className={`rounded-lg border px-2 py-1 text-[10px] font-mono uppercase ${
                  heatType === type
                    ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 bg-black/40 text-[#8C8C90]"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          {heatmapLoading && (
            <div
              className="flex items-center justify-center rounded-2xl border border-white/8 bg-[#08080A]"
              style={{ height: 260 }}
              data-testid="heatmap-loading"
            >
              <Loader2 className="h-5 w-5 animate-spin text-[#8C8C90]" />
            </div>
          )}
          {!heatmapLoading && heatmapError && (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-crimson/30 bg-crimson/5"
              style={{ height: 260 }}
              data-testid="heatmap-error"
            >
              <Flame className="h-5 w-5 text-crimson" />
              <p className="px-6 text-center text-[11px] font-mono text-crimson">{heatmapError}</p>
              <button
                type="button"
                onClick={() => void loadHeatmap()}
                data-testid="heatmap-retry"
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-white"
              >
                Retry
              </button>
            </div>
          )}
          {!heatmapLoading && !heatmapError && <HeatmapCanvas cells={cells} />}
          <p className="text-[10px] font-mono leading-relaxed text-[#8C8C90]">
            Your heatmap is private and built only from workouts SVJ recorded on your own device. It
            is never shared with other members or used for ranking.
          </p>
        </div>
      )}

      {section === "segments" && (
        <div className="space-y-3">
          {segments.length === 0 && (
            <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 text-center">
              <Flag className="mx-auto mb-2 h-5 w-5 text-[#8C8C90]" />
              <p className="text-[11px] font-mono text-[#8C8C90]">
                No personal segments yet. Open a saved GPS workout and create one from its route.
              </p>
            </div>
          )}
          {segments.map((segment) => (
            <div
              key={segment.id}
              className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4"
              data-testid="segment-card"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-mono font-bold text-white">
                    {segment.name}
                  </div>
                  <div className="text-[10px] font-mono text-[#8C8C90]">
                    {segment.activityType} · {segment.attemptCount} attempt
                    {segment.attemptCount === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeSegment(segment)}
                  aria-label={`Delete ${segment.name}`}
                  className="rounded-lg border border-white/10 p-1.5 text-[#8C8C90] hover:text-white disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-full border border-white/5 bg-black/40 p-2.5">
                  <div className="text-[9px] font-mono uppercase text-[#8C8C90]">Best</div>
                  <div className="font-mono text-sm font-bold text-[#E62846]">
                    {formatClock(segment.bestDurationSeconds)}
                  </div>
                </div>
                <div className="rounded-full border border-white/5 bg-black/40 p-2.5">
                  <div className="text-[9px] font-mono uppercase text-[#8C8C90]">Latest</div>
                  <div className="font-mono text-sm font-bold text-white">
                    {formatClock(segment.lastDurationSeconds)}
                  </div>
                </div>
                <div className="rounded-full border border-white/5 bg-black/40 p-2.5">
                  <div className="text-[9px] font-mono uppercase text-[#8C8C90]">Change</div>
                  <div
                    className={`font-mono text-sm font-bold ${
                      (segment.improvementSeconds ?? 0) <= 0 ? "text-emerald-400" : "text-white"
                    }`}
                  >
                    {segment.improvementSeconds == null
                      ? "—"
                      : segment.improvementSeconds <= 0
                        ? `−${formatClock(Math.abs(segment.improvementSeconds))}`
                        : `+${formatClock(segment.improvementSeconds)}`}
                  </div>
                </div>
              </div>

              {segment.recentAttempts.length > 0 && (
                <div className="mt-3 space-y-1">
                  {segment.recentAttempts.slice(0, 5).map((attempt) => (
                    <div
                      key={attempt.activityId}
                      className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5"
                    >
                      <span className="text-[10px] font-mono text-[#8C8C90]">
                        {attempt.startedAt ? new Date(attempt.startedAt).toLocaleDateString() : "—"}
                      </span>
                      <span className="text-[11px] font-mono text-white">
                        {formatClock(attempt.durationSeconds)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecordsView;
