import React, { useMemo, useState } from "react";
import { Maximize2, MapPin, Minimize2, Navigation } from "lucide-react";
import type { TrackPoint } from "../lib/gpsActivity";

/**
 * SVJ route map.
 *
 * The route is drawn from SVJ-owned GPS points as vector geometry, so it needs
 * no map SDK, no API key and no network — it always renders offline, including
 * on the Android recording screen. The component is provider-neutral: tiles are
 * an optional background layer supplied through `MapTileProvider`, and the
 * renderer works identically with a raster/vector tile layer or with none,
 * which keeps a future MapLibre-compatible basemap a drop-in concern instead of
 * a rewrite. No external fitness branding or styling is used anywhere.
 */
export interface MapTileProvider {
  /** Stable id, e.g. "svj-none" or a self-hosted vector style id. */
  id: string;
  /** Optional URL template for a raster basemap layer. */
  urlTemplate?: string;
  attribution?: string;
}

/** Default: geometry only. Offline, private, zero third-party requests. */
export const SVJ_VECTOR_ONLY_TILES: MapTileProvider = { id: "svj-vector-only" };

export interface MapBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface ActivityMapProps {
  points: readonly TrackPoint[];
  bounds?: MapBounds | null;
  height?: number;
  /** Compact preview vs the record screen's hero map. */
  variant?: "preview" | "hero";
  showStartFinish?: boolean;
  showCurrentPosition?: boolean;
  /** Optional basemap layer; the default draws no tiles at all. */
  tileProvider?: MapTileProvider;
  /**
   * A saved route the athlete is following. Drawn as a dashed reference line,
   * included in the fit so both the planned route and the live track stay
   * visible while recording.
   */
  guidePoints?: readonly { lat: number; lng: number }[];
  className?: string;
  emptyMessage?: string;
}

const PADDING = 14;

export function computeBounds(points: readonly TrackPoint[]): MapBounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  return Number.isFinite(minLat) ? { minLat, minLng, maxLat, maxLng } : null;
}

/**
 * Project lat/lng into the SVG viewport, fit to the route with padding.
 * Longitude is scaled by cos(lat) so a route does not look stretched
 * east-west at higher latitudes.
 */
export function projectPoints(
  points: readonly TrackPoint[],
  bounds: MapBounds,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const usableW = Math.max(1, width - PADDING * 2);
  const usableH = Math.max(1, height - PADDING * 2);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const lngScale = Math.max(0.05, Math.cos((midLat * Math.PI) / 180));

  const spanLng = Math.max((bounds.maxLng - bounds.minLng) * lngScale, 1e-7);
  const spanLat = Math.max(bounds.maxLat - bounds.minLat, 1e-7);
  // Uniform scale keeps the route's real shape; whichever axis is tighter wins.
  const scale = Math.min(usableW / spanLng, usableH / spanLat);
  const drawW = spanLng * scale;
  const drawH = spanLat * scale;
  const offsetX = PADDING + (usableW - drawW) / 2;
  const offsetY = PADDING + (usableH - drawH) / 2;

  return points.map((point) => ({
    x: offsetX + (point.lng - bounds.minLng) * lngScale * scale,
    y: offsetY + (bounds.maxLat - point.lat) * scale,
  }));
}

export function buildPath(projected: readonly { x: number; y: number }[]): string {
  if (projected.length === 0) return "";
  if (projected.length === 1) return `M ${projected[0]!.x} ${projected[0]!.y}`;
  return projected
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

export const ActivityMap: React.FC<ActivityMapProps> = ({
  points,
  bounds,
  height = 220,
  variant = "preview",
  showStartFinish = true,
  showCurrentPosition = false,
  tileProvider = SVJ_VECTOR_ONLY_TILES,
  guidePoints,
  className,
  emptyMessage = "No route recorded",
}) => {
  const [fullscreen, setFullscreen] = useState(false);
  const width = 400;
  const viewportHeight = fullscreen ? 620 : height;

  const resolvedBounds = useMemo(() => {
    if (bounds) return bounds;
    const combined: TrackPoint[] = [
      ...points,
      ...(guidePoints ?? []).map((point, index) => ({ ...point, t: index })),
    ];
    return computeBounds(combined);
  }, [bounds, points, guidePoints]);
  const projected = useMemo(() => {
    if (!resolvedBounds || points.length === 0) return [];
    return projectPoints(points, resolvedBounds, width, viewportHeight);
  }, [points, resolvedBounds, viewportHeight]);

  const path = useMemo(() => buildPath(projected), [projected]);
  const start = projected[0];
  const end = projected[projected.length - 1];

  const guidePath = useMemo(() => {
    if (!guidePoints || guidePoints.length < 2 || !resolvedBounds) return "";
    const asTrack: TrackPoint[] = guidePoints.map((point, index) => ({ ...point, t: index }));
    return buildPath(projectPoints(asTrack, resolvedBounds, width, viewportHeight));
  }, [guidePoints, resolvedBounds, viewportHeight]);

  const body =
    projected.length < 2 ? (
      <div
        className="flex flex-col items-center justify-center gap-1.5 text-center"
        style={{ height: viewportHeight }}
        data-testid="activity-map-empty"
      >
        <MapPin className="h-5 w-5 text-[#8C8C90]" />
        <p className="px-6 text-[11px] font-mono text-[#8C8C90]">{emptyMessage}</p>
      </div>
    ) : (
      <svg
        viewBox={`0 0 ${width} ${viewportHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        style={{ height: viewportHeight }}
        role="img"
        aria-label="SVJ recorded route"
        data-testid="activity-map"
      >
        <defs>
          <linearGradient id="svj-route-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#E62846" />
            <stop offset="100%" stopColor="#FF6B4A" />
          </linearGradient>
          <filter id="svj-route-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Basemap layer: nothing by default (offline, provider-neutral). */}
        {tileProvider.urlTemplate ? (
          <image
            href={tileProvider.urlTemplate}
            x={0}
            y={0}
            width={width}
            height={viewportHeight}
            opacity={0.35}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            {Array.from({ length: 7 }, (_, i) => (
              <line
                key={`h${i}`}
                x1={0}
                x2={width}
                y1={(viewportHeight / 6) * i}
                y2={(viewportHeight / 6) * i}
                stroke="rgba(255,255,255,0.035)"
                strokeWidth={0.6}
              />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line
                key={`v${i}`}
                y1={0}
                y2={viewportHeight}
                x1={(width / 5) * i}
                x2={(width / 5) * i}
                stroke="rgba(255,255,255,0.035)"
                strokeWidth={0.6}
              />
            ))}
          </>
        )}

        {guidePath && (
          <path
            d={guidePath}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
            data-testid="map-guide-route"
          />
        )}

        <path
          d={path}
          fill="none"
          stroke="#E62846"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.28}
          filter="url(#svj-route-blur)"
        />
        <path
          d={path}
          fill="none"
          stroke="url(#svj-route-glow)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {showStartFinish && start && (
          <g data-testid="map-start">
            <circle cx={start.x} cy={start.y} r={6} fill="#0B0B0C" stroke="#22C55E" strokeWidth={2.5} />
            <circle cx={start.x} cy={start.y} r={2} fill="#22C55E" />
          </g>
        )}
        {showStartFinish && end && (
          <g data-testid="map-finish">
            <circle cx={end.x} cy={end.y} r={6} fill="#0B0B0C" stroke="#E62846" strokeWidth={2.5} />
            <circle cx={end.x} cy={end.y} r={2} fill="#E62846" />
          </g>
        )}
        {showCurrentPosition && end && (
          <circle cx={end.x} cy={end.y} r={11} fill="none" stroke="#E62846" strokeWidth={1} opacity={0.5}>
            <animate attributeName="r" values="8;14;8" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
    );

  const chrome = (
    <>
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 backdrop-blur">
        <Navigation className="h-3 w-3 text-[#E62846]" />
        <span className="text-[9px] font-mono uppercase tracking-widest text-white">SVJ Route</span>
      </div>
      <button
        type="button"
        onClick={() => setFullscreen((value) => !value)}
        aria-label={fullscreen ? "Exit fullscreen map" : "Open fullscreen map"}
        data-testid="map-fullscreen-toggle"
        className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/60 p-1.5 text-[#8C8C90] backdrop-blur transition-colors hover:text-white"
      >
        {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
      {tileProvider.attribution && (
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-mono text-[#8C8C90]">
          {tileProvider.attribution}
        </span>
      )}
    </>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-3 backdrop-blur"
        data-testid="map-fullscreen"
      >
        <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-[#C81E3A]/30 bg-[#0B0B0C]">
          {body}
          {chrome}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/8 bg-[#08080A] ${
        variant === "hero" ? "border-[#C81E3A]/25" : ""
      } ${className ?? ""}`}
      data-testid="activity-map-frame"
    >
      {body}
      {chrome}
    </div>
  );
};

export default ActivityMap;
