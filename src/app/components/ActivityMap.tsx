import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Maximize2, MapPin, Minimize2, Minus, Navigation, Plus } from "lucide-react";
import type { TrackPoint } from "../lib/gpsActivity";
import { useElementWidth } from "../hooks/useElementWidth";
import { BRAND_COLORS, STATUS_COLORS } from "../lib/designTokens";

/**
 * SVJ route map.
 *
 * The route is drawn from SVJ-owned GPS points as vector geometry, so it needs
 * no map SDK or API key. A street basemap is shown by default, while the SVJ
 * route geometry still renders when tiles are unavailable. The component is
 * provider-neutral: tiles are supplied through `MapTileProvider`, so a future
 * hosted raster/vector source can be substituted without changing recording.
 */
export interface MapTileProvider {
  /** Stable id, e.g. "svj-none" or a self-hosted vector style id. */
  id: string;
  /** Optional URL template for a raster basemap layer. */
  urlTemplate?: string;
  attribution?: string;
}

/** Public street basemap; no API key is required. */
export const SVJ_STREET_TILES: MapTileProvider = {
  id: "openstreetmap",
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
};
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
  /** Optional basemap layer; defaults to the public OpenStreetMap tile service. */
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

const TILE_SIZE = 256;

function mercatorWorld(lat: number, lng: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/**
 * Build a slippy-map viewport at an explicit zoom around an explicit center,
 * with an optional world-pixel offset. Used for user pan/zoom; the point-fit
 * variant below is the automatic default.
 */
export function createTileViewportAtZoom(
  centerLat: number,
  centerLng: number,
  zoom: number,
  width: number,
  height: number,
  offsetXPx = 0,
  offsetYPx = 0,
) {
  const center = mercatorWorld(centerLat, centerLng, zoom);
  const originX = center.x - width / 2 - offsetXPx;
  const originY = center.y - height / 2 - offsetYPx;
  const count = 2 ** zoom;
  const tiles: Array<{ z: number; x: number; y: number; left: number; top: number }> = [];
  const minTileX = Math.floor(originX / TILE_SIZE);
  const maxTileX = Math.floor((originX + width) / TILE_SIZE);
  const minTileY = Math.floor(originY / TILE_SIZE);
  const maxTileY = Math.floor((originY + height) / TILE_SIZE);
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= count) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = ((tileX % count) + count) % count;
      tiles.push({
        z: zoom,
        x: wrappedX,
        y: tileY,
        left: tileX * TILE_SIZE - originX,
        top: tileY * TILE_SIZE - originY,
      });
    }
  }
  return {
    zoom,
    centerLat,
    centerLng,
    tiles,
    project(lat: number, lng: number) {
      const world = mercatorWorld(lat, lng, zoom);
      return { x: world.x - originX, y: world.y - originY };
    },
  };
}

/** Build a slippy-map viewport without an SDK or API key. */
export function createTileViewport(
  points: readonly { lat: number; lng: number }[],
  width: number,
  height: number,
) {
  const valid = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  // Before the first fix, show India rather than an empty black rectangle. The
  // viewport immediately recentres to the athlete when a fix arrives.
  const centerLat = valid.length
    ? valid.reduce((sum, point) => sum + point.lat, 0) / valid.length
    : 20.5937;
  const centerLng = valid.length
    ? valid.reduce((sum, point) => sum + point.lng, 0) / valid.length
    : 78.9629;

  let zoom = valid.length ? 16 : 4;
  if (valid.length > 1) {
    for (; zoom > 3; zoom -= 1) {
      const world = valid.map((point) => mercatorWorld(point.lat, point.lng, zoom));
      const spanX =
        Math.max(...world.map((point) => point.x)) - Math.min(...world.map((point) => point.x));
      const spanY =
        Math.max(...world.map((point) => point.y)) - Math.min(...world.map((point) => point.y));
      if (spanX <= width - 56 && spanY <= height - 56) break;
    }
  }

  const center = mercatorWorld(centerLat, centerLng, zoom);
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;
  const count = 2 ** zoom;
  const tiles: Array<{ z: number; x: number; y: number; left: number; top: number }> = [];
  const minTileX = Math.floor(originX / TILE_SIZE);
  const maxTileX = Math.floor((originX + width) / TILE_SIZE);
  const minTileY = Math.floor(originY / TILE_SIZE);
  const maxTileY = Math.floor((originY + height) / TILE_SIZE);
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= count) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = ((tileX % count) + count) % count;
      tiles.push({
        z: zoom,
        x: wrappedX,
        y: tileY,
        left: tileX * TILE_SIZE - originX,
        top: tileY * TILE_SIZE - originY,
      });
    }
  }
  return {
    zoom,
    centerLat,
    centerLng,
    tiles,
    project(lat: number, lng: number) {
      const world = mercatorWorld(lat, lng, zoom);
      return { x: world.x - originX, y: world.y - originY };
    },
  };
}

export const ActivityMap: React.FC<ActivityMapProps> = ({
  points,
  bounds,
  height = 220,
  variant = "preview",
  showStartFinish = true,
  showCurrentPosition = false,
  tileProvider = SVJ_STREET_TILES,
  guidePoints,
  className,
  emptyMessage = "No route recorded",
}) => {
  const [fullscreen, setFullscreen] = useState(false);
  const viewportHeight = fullscreen ? 620 : height;

  // ── Touch interaction: pinch zoom, drag pan, recenter ──────────────────
  // User pan/zoom is respected: while the user is manually inspecting the
  // map, automatic recentering to the newest GPS point pauses until they tap
  // the recenter control.
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const [userPan, setUserPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [followGps, setFollowGps] = useState(true);
  // The tile layer and the route geometry must share ONE projected width, so
  // the container is measured instead of assuming a fixed canvas. 400px is the
  // first-paint fallback (also the value the pure viewport helpers are tested
  // against) until the real width is known.
  const { ref: containerRef, width } = useElementWidth<HTMLDivElement>(400, fullscreen);
  const gesture = useRef<{
    mode: "none" | "pan" | "pinch";
    lastX: number;
    lastY: number;
    startDistance: number;
    startZoom: number;
  }>({ mode: "none", lastX: 0, lastY: 0, startDistance: 0, startZoom: 16 });

  const pinchDistance = (touches: React.TouchList): number | null => {
    if (touches.length < 2) return null;
    const a = touches[0]!;
    const b = touches[1]!;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length >= 2) {
      const distance = pinchDistance(event.touches);
      if (distance != null) {
        gesture.current = {
          mode: "pinch",
          lastX: 0,
          lastY: 0,
          startDistance: distance,
          startZoom: userZoom ?? mapViewport.zoom,
        };
      }
    } else if (event.touches.length === 1) {
      const touch = event.touches[0]!;
      gesture.current = {
        mode: "pan",
        lastX: touch.clientX,
        lastY: touch.clientY,
        startDistance: 0,
        startZoom: 16,
      };
    }
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const mode = gesture.current.mode;
    if (mode === "pinch") {
      const distance = pinchDistance(event.touches);
      if (distance != null && gesture.current.startDistance > 0) {
        const scale = distance / gesture.current.startDistance;
        const next = Math.min(19, Math.max(3, gesture.current.startZoom + Math.log2(scale)));
        setUserZoom(next);
        setFollowGps(false);
      }
    } else if (mode === "pan" && event.touches.length === 1) {
      const touch = event.touches[0]!;
      const dx = touch.clientX - gesture.current.lastX;
      const dy = touch.clientY - gesture.current.lastY;
      gesture.current.lastX = touch.clientX;
      gesture.current.lastY = touch.clientY;
      setUserPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
      setFollowGps(false);
    }
  };

  const onTouchEnd = () => {
    gesture.current.mode = "none";
  };

  const recenter = () => {
    setUserZoom(null);
    setUserPan({ x: 0, y: 0 });
    setFollowGps(true);
  };

  const mapPoints = useMemo<TrackPoint[]>(
    () => [
      ...points,
      ...(guidePoints ?? []).map((point, index) => ({ ...point, t: index })),
      ...(bounds
        ? [
            { lat: bounds.minLat, lng: bounds.minLng, t: 0 },
            { lat: bounds.maxLat, lng: bounds.maxLng, t: 1 },
          ]
        : []),
    ],
    [points, guidePoints, bounds],
  );
  const fitViewport = useMemo(
    () => createTileViewport(mapPoints, width, viewportHeight),
    [mapPoints, width, viewportHeight],
  );

  // When the user has zoomed or panned, recompute the viewport at their zoom,
  // keeping the fit-center geo position anchored and applying their screen
  // pan in world pixels at the new zoom.
  const mapViewport = useMemo(() => {
    const zoom = userZoom ?? fitViewport.zoom;
    if (userZoom == null && userPan.x === 0 && userPan.y === 0) return fitViewport;
    return createTileViewportAtZoom(
      fitViewport.centerLat,
      fitViewport.centerLng,
      zoom,
      width,
      viewportHeight,
      userPan.x,
      userPan.y,
    );
  }, [fitViewport, userZoom, userPan, width, viewportHeight]);

  // Fullscreen is a modal surface: Escape must close it for keyboard users.
  useEffect(() => {
    if (!fullscreen || typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  /** Step zoom for pointer/keyboard users — pinch stays available on touch. */
  const zoomBy = (delta: number) => {
    const base = userZoom ?? fitViewport.zoom;
    setUserZoom(Math.min(19, Math.max(3, base + delta)));
    setFollowGps(false);
  };

  const projected = useMemo(
    () => points.map((point) => mapViewport.project(point.lat, point.lng)),
    [points, mapViewport],
  );

  const path = useMemo(() => buildPath(projected), [projected]);
  const start = projected[0];
  const end = projected[projected.length - 1];

  const guidePath = useMemo(() => {
    if (!guidePoints || guidePoints.length < 2) return "";
    return buildPath(guidePoints.map((point) => mapViewport.project(point.lat, point.lng)));
  }, [guidePoints, mapViewport]);

  const body = (
    <div
      ref={containerRef}
      className="relative touch-none overflow-hidden"
      style={{ height: viewportHeight }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      data-testid="activity-map-surface"
    >
      {tileProvider.urlTemplate &&
        mapViewport.tiles.map((tile) => (
          <img
            key={`${tile.z}/${tile.x}/${tile.y}`}
            src={tileProvider
              .urlTemplate!.replace("{z}", String(tile.z))
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
        viewBox={`0 0 ${width} ${viewportHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="SVJ recorded route"
        data-testid="activity-map"
      >
        {!tileProvider.urlTemplate && (
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

        {/* Route casing + core: depth from a darker outline, never from a
            blur filter (filters are expensive to repaint on every GPS tick). */}
        <path
          d={path}
          fill="none"
          stroke={BRAND_COLORS.bg}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.55}
        />
        <path
          d={path}
          fill="none"
          stroke={BRAND_COLORS.crimson}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="map-route"
        />

        {showStartFinish && start && (
          <g data-testid="map-start">
            <circle
              cx={start.x}
              cy={start.y}
              r={6}
              fill={BRAND_COLORS.bg}
              stroke={STATUS_COLORS.positive}
              strokeWidth={2.5}
            />
            <circle cx={start.x} cy={start.y} r={2} fill={STATUS_COLORS.positive} />
          </g>
        )}
        {showStartFinish && end && (
          <g data-testid="map-finish">
            <circle
              cx={end.x}
              cy={end.y}
              r={6}
              fill={BRAND_COLORS.bg}
              stroke={BRAND_COLORS.crimson}
              strokeWidth={2.5}
            />
            <circle cx={end.x} cy={end.y} r={2} fill={BRAND_COLORS.crimson} />
          </g>
        )}
        {showCurrentPosition && end && (
          <circle
            cx={end.x}
            cy={end.y}
            r={11}
            fill="none"
            stroke={BRAND_COLORS.crimson}
            strokeWidth={1}
            opacity={0.5}
          >
            <animate attributeName="r" values="8;14;8" dur="2.4s" repeatCount="indefinite" />
            <animate
              attributeName="opacity"
              values="0.55;0;0.55"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
        )}
      </svg>
      {projected.length < 2 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/20 text-center"
          data-testid="activity-map-empty"
        >
          <MapPin className="h-5 w-5 text-white/80" />
          <p className="rounded-2xl bg-black/65 px-3 py-1.5 text-[11px] font-mono text-white/80">
            {emptyMessage}
          </p>
        </div>
      )}
    </div>
  );

  const chrome = (
    <>
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 backdrop-blur">
        <Navigation className="h-3 w-3 text-svj-crimson" />
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
      <div className="absolute right-3 top-14 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom map in"
          data-testid="map-zoom-in"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-[#8C8C90] backdrop-blur transition-colors hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom map out"
          data-testid="map-zoom-out"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-[#8C8C90] backdrop-blur transition-colors hover:text-white"
        >
          <Minus className="h-4 w-4" />
        </button>
        {!followGps && (
          <button
            type="button"
            onClick={recenter}
            aria-label="Recenter map on your position"
            data-testid="map-recenter"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-svj-crimson/40 bg-black/60 text-svj-crimson backdrop-blur transition-colors hover:text-white"
          >
            <Crosshair className="h-4 w-4" />
          </button>
        )}
      </div>
      {tileProvider.attribution && (
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-mono text-[#8C8C90]">
          {tileProvider.attribution}
        </span>
      )}
    </>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-3 backdrop-blur svj-safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-label="Fullscreen route map"
        data-testid="map-fullscreen"
      >
        <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-svj-crimson/30 bg-svj-bg">
          {body}
          {chrome}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-svj-bg ${
        variant === "hero" ? "border-svj-crimson/25" : ""
      } ${className ?? ""}`}
      data-testid="activity-map-frame"
    >
      {body}
      {chrome}
    </div>
  );
};

export default ActivityMap;
