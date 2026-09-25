// ============================================================================
// SVJ NATIVE ACTIVITY — pure GPS / analytics core.
//
// Everything here is deterministic and dependency-free so it can be unit
// tested without a device, a DOM or a database: haversine distance, encoded
// polylines, GPS quality classification, point acceptance (noise rejection),
// auto-pause, splits, moving time and display formatting.
//
// These helpers only produce *display and capture* values. The authoritative
// distance, moving time, elevation and splits for a saved workout are computed
// again on the server from the same raw points (svj_save_gps_activity), so a
// tampered client cannot inflate a record or XP.
// ============================================================================

/** Activity types SVJ records outdoors with GPS. */
export const GPS_ACTIVITY_TYPES = ["running", "walking", "hiking", "cycling"] as const;
export type GpsActivityType = (typeof GPS_ACTIVITY_TYPES)[number];

export const GPS_ACTIVITY_LABELS: Record<GpsActivityType, string> = {
  running: "Run",
  walking: "Walk",
  hiking: "Hike",
  cycling: "Cycle",
};

/** Recorder lifecycle. `paused` is reachable from `recording` and back. */
export const WORKOUT_STATES = [
  "idle",
  "preparing",
  "ready",
  "recording",
  "paused",
  "stopping",
  "saved",
  "discarded",
] as const;
export type WorkoutState = (typeof WORKOUT_STATES)[number];

const VALID_TRANSITIONS: Record<WorkoutState, readonly WorkoutState[]> = {
  idle: ["preparing", "recording"],
  preparing: ["ready", "idle", "discarded"],
  ready: ["recording", "discarded", "idle"],
  recording: ["paused", "stopping"],
  paused: ["recording", "stopping"],
  stopping: ["saved", "discarded", "recording"],
  saved: ["idle"],
  discarded: ["idle"],
};

export function canTransition(from: WorkoutState, to: WorkoutState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/** One accepted GPS sample. `t` is milliseconds since the workout started. */
export interface TrackPoint {
  lat: number;
  lng: number;
  t: number;
  ele?: number | null;
  accuracy?: number | null;
  hr?: number | null;
  cad?: number | null;
  /** False while paused: excluded from distance, pace and moving time. */
  moving?: boolean;
}

export type GpsQuality = "searching" | "weak" | "good" | "excellent";

// ── Geometry ───────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6371008.8;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function pathDistanceMeters(points: readonly TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a == null || b == null) continue;
    if (a.moving === false || b.moving === false) continue;
    total += haversineMeters(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}

export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function trackBounds(points: readonly TrackPoint[]): Bounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  if (!Number.isFinite(minLat)) return null;
  return { minLat, minLng, maxLat, maxLng };
}

// ── Encoded polyline (map preview only) ────────────────────────────────────

export function encodePolyline(
  points: readonly Pick<TrackPoint, "lat" | "lng">[],
  precision = 5,
): string {
  const factor = 10 ** precision;
  let lastLat = 0;
  let lastLng = 0;
  let out = "";
  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    out += encodeSigned(lat - lastLat);
    out += encodeSigned(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

export function decodePolyline(encoded: string, precision = 5): { lat: number; lng: number }[] {
  const factor = 10 ** precision;
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const latResult = decodeSigned(encoded, index);
    if (latResult == null) break;
    index = latResult.index;
    lat += latResult.value;
    const lngResult = decodeSigned(encoded, index);
    if (lngResult == null) break;
    index = lngResult.index;
    lng += lngResult.value;
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

function decodeSigned(encoded: string, start: number): { value: number; index: number } | null {
  let index = start;
  let result = 0;
  let shift = 0;
  let byte: number;
  do {
    if (index >= encoded.length) return null;
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, index };
}

/** Douglas–Peucker simplification, in metres, for compact map payloads. */
export function simplifyTrack(points: readonly TrackPoint[], toleranceMeters = 8): TrackPoint[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    if (last - first < 2) continue;
    let maxDist = -1;
    let maxIndex = -1;
    const a = points[first];
    const b = points[last];
    for (let i = first + 1; i < last; i += 1) {
      const d = perpendicularMeters(points[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxDist > toleranceMeters && maxIndex > 0) {
      keep[maxIndex] = true;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpendicularMeters(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const px = (p.lng - a.lng) * lngScale;
  const py = (p.lat - a.lat) * latScale;
  const bx = (b.lng - a.lng) * lngScale;
  const by = (b.lat - a.lat) * latScale;
  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

// ── GPS quality ────────────────────────────────────────────────────────────

export function classifyGpsQuality(accuracyMeters: number | null | undefined): GpsQuality {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0)
    return "searching";
  if (accuracyMeters > 50) return "weak";
  if (accuracyMeters > 20) return "good";
  return "excellent";
}

export const GPS_QUALITY_LABELS: Record<GpsQuality, string> = {
  searching: "Searching",
  weak: "Weak",
  good: "Good",
  excellent: "Excellent",
};

// ── Point acceptance (noise rejection) ─────────────────────────────────────

export interface PointFilterOptions {
  /** Samples worse than this are discarded as noise. Default 65 m. */
  maxAccuracyMeters?: number;
  /** Speeds above this are treated as impossible jumps, in m/s. */
  maxSpeedMps?: number;
  /** Minimum spacing between accepted samples, in ms. Default 800 ms. */
  minIntervalMs?: number;
}

export type PointRejectionReason =
  "invalid" | "accuracy" | "non_monotonic_time" | "duplicate_time" | "too_soon" | "impossible_jump";

export interface PointDecision {
  accept: boolean;
  reason?: PointRejectionReason;
}

const DEFAULT_FILTER: Required<PointFilterOptions> = {
  maxAccuracyMeters: 65,
  maxSpeedMps: 25,
  minIntervalMs: 800,
};

export function defaultMaxSpeed(activityType: GpsActivityType): number {
  return activityType === "cycling" ? 45 : 25;
}

/**
 * Decide whether a raw sample may join the track. Rejections are silent and
 * never end the workout: a dropped point simply does not contribute distance.
 */
export function acceptPoint(
  previous: TrackPoint | null,
  next: TrackPoint,
  options: PointFilterOptions = {},
): PointDecision {
  const opts = { ...DEFAULT_FILTER, ...options };
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) {
    return { accept: false, reason: "invalid" };
  }
  if (next.lat < -90 || next.lat > 90 || next.lng < -180 || next.lng > 180) {
    return { accept: false, reason: "invalid" };
  }
  if (!Number.isFinite(next.t) || next.t < 0) {
    return { accept: false, reason: "non_monotonic_time" };
  }
  if (previous == null) return { accept: true };
  if (next.t < previous.t) return { accept: false, reason: "non_monotonic_time" };
  if (next.t === previous.t) return { accept: false, reason: "duplicate_time" };
  if (next.t - previous.t < opts.minIntervalMs) return { accept: false, reason: "too_soon" };
  if (
    next.accuracy != null &&
    Number.isFinite(next.accuracy) &&
    next.accuracy > opts.maxAccuracyMeters
  ) {
    return { accept: false, reason: "accuracy" };
  }
  const distance = haversineMeters(previous.lat, previous.lng, next.lat, next.lng);
  const seconds = (next.t - previous.t) / 1000;
  if (seconds > 0 && distance / seconds > opts.maxSpeedMps) {
    return { accept: false, reason: "impossible_jump" };
  }
  return { accept: true };
}

/**
 * Append a sample to a track, applying `acceptPoint`. Returns the (possibly
 * unchanged) track so callers stay immutable and testable.
 */
export function appendPoint(
  track: readonly TrackPoint[],
  next: TrackPoint,
  options: PointFilterOptions = {},
): { track: TrackPoint[]; decision: PointDecision } {
  const previous = track.length > 0 ? track[track.length - 1]! : null;
  const decision = acceptPoint(previous, next, options);
  if (!decision.accept) return { track: [...track], decision };
  return { track: [...track, next], decision };
}

// ── Auto pause ─────────────────────────────────────────────────────────────

export interface AutoPauseOptions {
  /** Speed (m/s) below which the athlete counts as stopped. Default 0.6. */
  stopSpeedMps?: number;
  /** Speed above which movement resumes. Hysteresis avoids flapping. */
  resumeSpeedMps?: number;
  /** Must stay stopped this long before pausing. Default 12 s. */
  stopDelaySeconds?: number;
  /** Must be moving this long before resuming. Default 4 s. */
  resumeDelaySeconds?: number;
}

export interface AutoPauseState {
  paused: boolean;
  stoppedForSeconds: number;
  movingForSeconds: number;
}

export const AUTO_PAUSE_DEFAULTS: Required<AutoPauseOptions> = {
  stopSpeedMps: 0.6,
  resumeSpeedMps: 1.0,
  stopDelaySeconds: 12,
  resumeDelaySeconds: 4,
};

export function createAutoPause(options: AutoPauseOptions = {}) {
  const opts = { ...AUTO_PAUSE_DEFAULTS, ...options };
  let state: AutoPauseState = { paused: false, stoppedForSeconds: 0, movingForSeconds: 0 };

  return {
    get paused(): boolean {
      return state.paused;
    },
    get snapshot(): AutoPauseState {
      return { ...state };
    },
    /** Feed one interval. Returns true when the pause state changed. */
    update(speedMps: number, deltaSeconds: number): boolean {
      const delta = Math.max(0, Math.min(deltaSeconds, 120));
      if (!Number.isFinite(speedMps) || speedMps < 0) return false;
      if (state.paused) {
        if (speedMps >= opts.resumeSpeedMps) {
          state = { ...state, movingForSeconds: state.movingForSeconds + delta };
          if (state.movingForSeconds >= opts.resumeDelaySeconds) {
            state = { paused: false, stoppedForSeconds: 0, movingForSeconds: 0 };
            return true;
          }
        } else {
          state = { ...state, movingForSeconds: 0 };
        }
        return false;
      }
      if (speedMps <= opts.stopSpeedMps) {
        state = { ...state, stoppedForSeconds: state.stoppedForSeconds + delta };
        if (state.stoppedForSeconds >= opts.stopDelaySeconds) {
          state = { paused: true, stoppedForSeconds: 0, movingForSeconds: 0 };
          return true;
        }
      } else {
        state = { ...state, stoppedForSeconds: 0 };
      }
      return false;
    },
    reset(): void {
      state = { paused: false, stoppedForSeconds: 0, movingForSeconds: 0 };
    },
  };
}

export type AutoPauseDetector = ReturnType<typeof createAutoPause>;

// ── Moving time, splits and summary ────────────────────────────────────────

export function movingSeconds(points: readonly TrackPoint[], fallbackSeconds = 0): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a == null || b == null) continue;
    if (a.moving === false || b.moving === false) continue;
    total += Math.max(0, b.t - a.t);
  }
  if (total > 0) return Math.round(total / 1000);
  return Math.max(0, Math.round(fallbackSeconds));
}

export const MIN_PARTIAL_SPLIT_METERS = 50;

export interface Split {
  index: number;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number | null;
  /** True when this split is the trailing, not-yet-complete remainder. */
  partial: boolean;
}

export interface SplitComputation {
  splits: Split[];
  distanceMeters: number;
  fastestSplitIndex: number | null;
}

/**
 * Compute distance splits from accepted points. Only fully completed splits
 * are ever marked non-partial, so a truncated final split can never look like
 * a personal best.
 */
export function computeSplits(
  points: readonly TrackPoint[],
  splitMeters: number,
): SplitComputation {
  const splits: Split[] = [];
  if (points.length < 2 || splitMeters <= 0) {
    return { splits, distanceMeters: 0, fastestSplitIndex: null };
  }

  let cumulative = 0;
  let bucket = 0;
  let bucketStartT: number | null = null;
  let bucketStartCum = 0;
  let bucketElevGain = 0;
  let bucketHasElev = false;

  const pushBucket = (endT: number): void => {
    if (bucketStartT == null) return;
    const duration = Math.max(1, Math.round((endT - bucketStartT) / 1000));
    const completed = bucketStartCum + splitMeters <= cumulative;
    splits.push({
      index: bucket + 1,
      distanceMeters: splitMeters,
      durationSeconds: duration,
      elevationGainMeters: bucketHasElev ? Math.round(bucketElevGain * 100) / 100 : null,
      partial: !completed,
    });
    bucket += 1;
    bucketStartT = null;
    bucketStartCum = 0;
    bucketElevGain = 0;
    bucketHasElev = false;
  };

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a == null || b == null) continue;
    if (a.moving === false || b.moving === false) continue;
    const segment = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    if (!(segment > 0)) continue;
    if (bucketStartT == null) {
      bucketStartT = a.t;
      bucketStartCum = cumulative;
    }
    cumulative += segment;
    if (a.ele != null && b.ele != null) {
      const gain = b.ele - a.ele;
      bucketElevGain += Math.max(0, gain);
      bucketHasElev = true;
    }
    while (cumulative >= (bucket + 1) * splitMeters) {
      const overshoot = cumulative - (bucket + 1) * splitMeters;
      const ratio = segment > 0 ? (segment - overshoot) / segment : 1;
      const boundaryT = a.t + (b.t - a.t) * Math.max(0, Math.min(1, ratio));
      pushBucket(boundaryT);
      // The remainder of this segment starts the next split.
      bucketStartT = boundaryT;
      bucketStartCum = bucket * splitMeters;
    }
  }
  // A trailing remainder only counts as a split when it is long enough to be
  // meaningful; otherwise a 20 m shuffle would render as "split 1".
  if (bucketStartT != null && cumulative - bucket * splitMeters >= MIN_PARTIAL_SPLIT_METERS) {
    pushBucket(points[points.length - 1]!.t);
  }

  const complete = splits.filter((s) => !s.partial);
  let fastestSplitIndex: number | null = null;
  for (const split of complete) {
    if (split.durationSeconds <= 0) continue;
    if (
      fastestSplitIndex == null ||
      split.durationSeconds < complete.find((s) => s.index === fastestSplitIndex)!.durationSeconds
    ) {
      fastestSplitIndex = split.index;
    }
  }
  return { splits, distanceMeters: cumulative, fastestSplitIndex };
}

export interface WorkoutSummary {
  distanceMeters: number;
  durationSeconds: number;
  movingSeconds: number;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  stepCount: number;
  splits: Split[];
  fastestSplitIndex: number | null;
  bounds: Bounds | null;
  pointCount: number;
}

/**
 * Local, immediately-visible summary. The server recomputes every rewardable
 * number; this exists so the live UI can respond instantly.
 */
export function summarizeTrack(
  points: readonly TrackPoint[],
  options: {
    durationSeconds?: number;
    stepCount?: number;
    splitMeters?: number;
  } = {},
): WorkoutSummary {
  const splitMeters = options.splitMeters ?? 1000;
  const { splits, distanceMeters, fastestSplitIndex } = computeSplits(points, splitMeters);
  const duration =
    options.durationSeconds ??
    (points.length > 1 ? Math.round((points[points.length - 1]!.t - points[0]!.t) / 1000) : 0);
  const moving = movingSeconds(points, duration);

  let gain = 0;
  let loss = 0;
  let gainSeen = false;
  let maxSpeed: number | null = null;
  const hrValues: number[] = [];
  const cadValues: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (p.hr != null && Number.isFinite(p.hr)) hrValues.push(p.hr);
    if (p.cad != null && Number.isFinite(p.cad)) cadValues.push(p.cad);
    if (i === 0) continue;
    const a = points[i - 1]!;
    if (a.ele != null && p.ele != null) {
      const delta = p.ele - a.ele;
      gain += Math.max(0, delta);
      loss += Math.max(0, -delta);
      gainSeen = true;
    }
    if (a.moving === false || p.moving === false) continue;
    const dt = (p.t - a.t) / 1000;
    if (dt <= 0) continue;
    const speed = haversineMeters(a.lat, a.lng, p.lat, p.lng) / dt;
    if (speed > 0 && speed <= 100) maxSpeed = Math.max(maxSpeed ?? 0, speed);
  }

  const avg = (values: number[]): number | null =>
    values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  return {
    distanceMeters: Math.round(distanceMeters * 100) / 100,
    durationSeconds: Math.max(0, duration),
    movingSeconds: moving,
    elevationGainMeters: gainSeen ? Math.round(gain * 100) / 100 : null,
    elevationLossMeters: gainSeen ? Math.round(loss * 100) / 100 : null,
    avgSpeedMps:
      moving > 0 && distanceMeters > 1 ? Math.round((distanceMeters / moving) * 1000) / 1000 : null,
    maxSpeedMps: maxSpeed == null ? null : Math.round(maxSpeed * 1000) / 1000,
    avgPaceSecondsPerKm:
      moving > 0 && distanceMeters >= 100 ? Math.round(moving / (distanceMeters / 1000)) : null,
    avgHeartRate: avg(hrValues),
    maxHeartRate: hrValues.length === 0 ? null : Math.max(...hrValues),
    avgCadence: avg(cadValues),
    stepCount: Math.max(0, Math.round(options.stepCount ?? 0)),
    splits,
    fastestSplitIndex,
    bounds: trackBounds(points),
    pointCount: points.length,
  };
}

// ── Display formatting ─────────────────────────────────────────────────────

/**
 * Current pace from a recent accepted-point window.
 *
 * Uses only valid moving segments in the denominator. This prevents a turn,
 * auto-pause interval, or poor-accuracy fix from making live pace appear much
 * slower when the athlete doubles back over the same route.
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
  const elapsedSeconds = (last.t - first.t) / 1000;
  if (elapsedSeconds < minWindowSeconds) return null;

  let distanceMeters = 0;
  let movingSecondsInWindow = 0;

  for (let i = startIndex + 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.moving === false || b.moving === false) continue;
    if (
      (a.accuracy != null && a.accuracy > maxAccuracyMeters) ||
      (b.accuracy != null && b.accuracy > maxAccuracyMeters)
    ) {
      continue;
    }

    const seconds = (b.t - a.t) / 1000;
    if (!(seconds > 0)) continue;

    distanceMeters += haversineMeters(a.lat, a.lng, b.lat, b.lng);
    movingSecondsInWindow += seconds;
  }

  // Require enough real moving time as well as displacement so a single clean
  // point after a long GPS gap cannot fabricate a current pace.
  if (
    distanceMeters < minDistanceMeters ||
    movingSecondsInWindow < Math.min(minWindowSeconds, 10)
  ) {
    return null;
  }

  return Math.round(movingSecondsInWindow / (distanceMeters / 1000));
}

export function formatDistance(
  meters: number | null | undefined,
  unit: "km" | "mi" = "km",
): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (unit === "mi") {
    const miles = meters / 1609.344;
    return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(2)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

export function formatPace(
  secondsPerKm: number | null | undefined,
  unit: "km" | "mi" = "km",
): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  const adjusted = unit === "mi" ? secondsPerKm * 1.609344 : secondsPerKm;
  const total = Math.round(adjusted);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /${unit}`;
}

export function formatSpeed(mps: number | null | undefined, unit: "km" | "mi" = "km"): string {
  if (mps == null || !Number.isFinite(mps) || mps <= 0) return "—";
  const perHour = mps * 3.6;
  return unit === "mi" ? `${(perHour / 1.609344).toFixed(1)} mph` : `${perHour.toFixed(1)} km/h`;
}

export function formatClock(seconds: number | null | undefined): string {
  const safe = seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Save validation (client-side pre-flight only) ──────────────────────────

export const MIN_GPS_POINTS_TO_SAVE = 2;

export function validateWorkoutForSave(
  points: readonly TrackPoint[],
  summary: Pick<WorkoutSummary, "distanceMeters" | "durationSeconds">,
  activityType: GpsActivityType,
): string | null {
  if (!GPS_ACTIVITY_TYPES.includes(activityType)) return "Choose an activity type.";
  if (points.length < MIN_GPS_POINTS_TO_SAVE)
    return "This workout has no GPS track yet. Record at least a few seconds outdoors.";
  if (summary.durationSeconds < 10) return "That workout is too short to save.";
  if (summary.distanceMeters <= 0) return "No movement was recorded, so there is nothing to save.";
  return null;
}
