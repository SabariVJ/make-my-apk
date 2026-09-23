// ============================================================================
// SVJ WEARABLES V2 — Wear OS companion bridge and protocol.
//
// The SVJ Wear OS app is SVJ's own watch application (module `android/wear`),
// not a third-party provider. Phone and watch talk over the Wear OS Data Layer
// (`VjWear` Capacitor plugin on the phone side), and every value that arrives
// is validated here before the UI or the canonical activity pipeline sees it.
//
// Rules enforced in this file:
//   * a capability is only reported when the watch declared it;
//   * a measurement is dropped unless its type, value and timestamp are
//     physically plausible — nothing is fabricated, nothing is smoothed;
//   * heart rate never grants XP: summaries are imported through the existing
//     server-authoritative `svj_import_platform_activity` pipeline;
//   * a repeated completion for the same watch session is never imported twice;
//   * phone steps and watch steps are never summed together.
// ============================================================================

import { Capacitor, registerPlugin } from "@capacitor/core";
import { isHeartRateFresh, type LiveHeartRate } from "./bleHeartRate";

/** Bumped whenever the phone/watch payload contract changes shape. */
export const WEAR_PROTOCOL_VERSION = 1;

/** Data Layer capability the watch advertises so the phone can find it. */
export const WEAR_CAPABILITY_NAME = "svj_wear_companion";

export const WEAR_PATHS = {
  handshake: "/svj/wear/handshake",
  command: "/svj/wear/command",
  sample: "/svj/wear/sample",
  state: "/svj/wear/state",
  summary: "/svj/wear/summary",
} as const;

/** Every path the phone listens on. */
export const WEAR_LISTENED_PATHS: readonly string[] = [
  WEAR_PATHS.handshake,
  WEAR_PATHS.sample,
  WEAR_PATHS.state,
  WEAR_PATHS.summary,
];

export const WEAR_CAPABILITIES = [
  "heart_rate",
  "steps",
  "workout",
  "distance",
  "calories",
] as const;
export type WearCapability = (typeof WEAR_CAPABILITIES)[number];

export const WEAR_CAPABILITY_LABELS: Record<WearCapability, string> = {
  heart_rate: "Heart rate",
  steps: "Steps",
  workout: "Workout",
  distance: "Distance",
  calories: "Calories",
};

export const WEAR_MEASUREMENT_TYPES = [
  "heart_rate",
  "steps",
  "distance",
  "calories",
  "cadence",
] as const;
export type WearMeasurementType = (typeof WEAR_MEASUREMENT_TYPES)[number];

export const WEAR_WORKOUT_STATES = ["idle", "running", "paused", "finished"] as const;
export type WearWorkoutState = (typeof WEAR_WORKOUT_STATES)[number];

/**
 * Sensor source arbitration values. `phone` and `ble` are the sources already
 * implemented on the phone; `wear_os` is the watch companion.
 */
export const SENSOR_SOURCES = ["phone", "ble", "wear_os", "health_connect"] as const;
export type SensorSource = (typeof SENSOR_SOURCES)[number];

export const SENSOR_SOURCE_LABELS: Record<SensorSource, string> = {
  phone: "Phone",
  ble: "Bluetooth sensor",
  wear_os: "SVJ Watch",
  health_connect: "Health Connect",
};

export interface WearCapabilities {
  heart_rate: boolean;
  steps: boolean;
  workout: boolean;
  distance: boolean;
  calories: boolean;
}

export const NO_WEAR_CAPABILITIES: WearCapabilities = {
  heart_rate: false,
  steps: false,
  workout: false,
  distance: false,
  calories: false,
};

/**
 * Capabilities are read from the watch's own declaration. A missing or
 * malformed entry is simply false — the phone never infers a capability from a
 * device name or a watch model.
 */
export function normalizeWearCapabilities(raw: unknown): WearCapabilities {
  const source = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const result = { ...NO_WEAR_CAPABILITIES };
  for (const key of WEAR_CAPABILITIES) {
    result[key] = source[key] === true;
  }
  return result;
}

export function describeWearCapabilities(capabilities: WearCapabilities): WearCapability[] {
  return WEAR_CAPABILITIES.filter((key) => capabilities[key]);
}

export type WearConnectionState =
  "unavailable" | "companion_missing" | "disconnected" | "connected" | "reconnecting";

export const WEAR_CONNECTION_LABELS: Record<WearConnectionState, string> = {
  unavailable: "Not available on this device",
  companion_missing: "SVJ Wear OS app required",
  disconnected: "Not connected",
  connected: "Connected",
  reconnecting: "Reconnecting…",
};

export interface WearCompanionStatus {
  /** The watch app is installed (the capability was discovered on a node). */
  installed: boolean;
  /** A watch node is currently reachable. */
  connected: boolean;
  /** The Wear OS Data Layer exists at all on this phone. */
  available: boolean;
  nodeName: string | null;
  /** Protocol version reported by the last handshake. */
  protocol: number | null;
  capabilities: WearCapabilities;
  /** Epoch ms of the last message received from the watch. */
  lastSeenMs: number | null;
  /** Milliseconds since the last message, or null when never seen. */
  lastSeenAgeMs: number | null;
  /** Active watch workout session id, when the watch reports one. */
  activeSessionId: string | null;
}

export const EMPTY_WEAR_STATUS: WearCompanionStatus = {
  installed: false,
  connected: false,
  available: false,
  nodeName: null,
  protocol: null,
  capabilities: { ...NO_WEAR_CAPABILITIES },
  lastSeenMs: null,
  lastSeenAgeMs: null,
  activeSessionId: null,
};

/** A watch workout session is considered live for this long after its last message. */
export const WEAR_LIVE_WINDOW_MS = 30_000;

export function wearConnectionState(
  status: WearCompanionStatus,
  nowMs: number,
): WearConnectionState {
  if (!status.available) return "unavailable";
  if (status.connected) return "connected";
  if (!status.installed) return "companion_missing";
  const seenRecently =
    status.lastSeenMs != null && nowMs - status.lastSeenMs <= WEAR_LIVE_WINDOW_MS;
  return seenRecently ? "reconnecting" : "disconnected";
}

/** Normalize the native `getCompanionStatus()` payload. */
export function normalizeWearCompanionStatus(raw: unknown, nowMs: number): WearCompanionStatus {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_WEAR_STATUS };
  const value = raw as Record<string, unknown>;
  const lastSeenMs =
    typeof value.lastSeenMs === "number" &&
    Number.isFinite(value.lastSeenMs) &&
    value.lastSeenMs > 0
      ? value.lastSeenMs
      : null;
  const protocol =
    typeof value.protocol === "number" && Number.isFinite(value.protocol) ? value.protocol : null;
  return {
    installed: value.installed === true,
    connected: value.connected === true,
    available: value.available !== false,
    nodeName:
      typeof value.nodeName === "string" && value.nodeName.length > 0 ? value.nodeName : null,
    protocol,
    capabilities: normalizeWearCapabilities(value.capabilities),
    lastSeenMs,
    lastSeenAgeMs: lastSeenMs == null ? null : Math.max(0, nowMs - lastSeenMs),
    activeSessionId:
      typeof value.activeSessionId === "string" && value.activeSessionId.length > 0
        ? value.activeSessionId
        : null,
  };
}

// ── Measurements ───────────────────────────────────────────────────────────

export interface WearMeasurement {
  type: WearMeasurementType;
  value: number;
  timestampMs: number;
  source: SensorSource;
  deviceId?: string;
  deviceName?: string;
  sessionId?: string;
}

const MEASUREMENT_BOUNDS: Record<WearMeasurementType, { min: number; max: number }> = {
  heart_rate: { min: 20, max: 250 },
  steps: { min: 0, max: 200_000 },
  distance: { min: 0, max: 500_000 },
  calories: { min: 0, max: 20_000 },
  cadence: { min: 0, max: 300 },
};

/** Measurements older/newer than this window cannot be trusted as live. */
export const WEAR_MAX_SAMPLE_AGE_MS = 120_000;
const WEAR_MAX_FUTURE_SKEW_MS = 5 * 60_000;

export function isWearMeasurementType(value: unknown): value is WearMeasurementType {
  return typeof value === "string" && (WEAR_MEASUREMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Validate one measurement from the watch. Returns null for anything
 * implausible: unknown type, non-finite or out-of-range value, impossible
 * timestamp. A rejected sample is never silently coerced.
 */
export function normalizeWearMeasurement(raw: unknown, nowMs: number): WearMeasurement | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!isWearMeasurementType(value.type)) return null;
  const numeric = typeof value.value === "number" ? value.value : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const bounds = MEASUREMENT_BOUNDS[value.type];
  if (numeric < bounds.min || numeric > bounds.max) return null;
  const timestampMs =
    typeof value.timestamp === "number" && Number.isFinite(value.timestamp)
      ? value.timestamp
      : nowMs;
  if (timestampMs > nowMs + WEAR_MAX_FUTURE_SKEW_MS) return null;
  if (nowMs - timestampMs > WEAR_MAX_SAMPLE_AGE_MS) return null;
  return {
    type: value.type,
    value: value.type === "heart_rate" ? Math.round(numeric) : numeric,
    timestampMs,
    source: "wear_os",
    deviceId: typeof value.deviceId === "string" ? value.deviceId : undefined,
    deviceName:
      typeof value.deviceName === "string" && value.deviceName.length > 0
        ? value.deviceName
        : "SVJ Watch",
    sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
  };
}

/** Convert an accepted watch HR sample into the shared live-HR shape. */
export function wearMeasurementToHeartRate(measurement: WearMeasurement): LiveHeartRate | null {
  if (measurement.type !== "heart_rate") return null;
  return {
    bpm: measurement.value,
    timestampMs: measurement.timestampMs,
    source: "wear_os",
    deviceName: measurement.deviceName ?? "SVJ Watch",
    deviceId: measurement.deviceId,
  };
}

/** Heart-rate statistics derived only from accepted measurements. */
export interface HeartRateStats {
  current: number | null;
  average: number | null;
  maximum: number | null;
  sampleCount: number;
}

export const EMPTY_HEART_RATE_STATS: HeartRateStats = {
  current: null,
  average: null,
  maximum: null,
  sampleCount: 0,
};

/**
 * Fold one sample into the running statistics. Invalid samples are rejected
 * rather than averaged in, and no value is ever interpolated between samples.
 */
export function accumulateHeartRate(
  stats: HeartRateStats,
  bpm: number,
  maxSamples = 7200,
): HeartRateStats {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 250) return stats;
  const sampleCount = stats.sampleCount + 1;
  const total = (stats.average ?? 0) * stats.sampleCount + bpm;
  const bounded = Math.min(sampleCount, maxSamples);
  const divisor = Math.max(1, Math.min(sampleCount, maxSamples));
  return {
    current: Math.round(bpm),
    average: Math.round(total / divisor),
    maximum: Math.max(stats.maximum ?? 0, Math.round(bpm)),
    sampleCount: bounded,
  };
}

// ── Watch workout session state machine ─────────────────────────────────────

export interface WearWorkoutSnapshot {
  sessionId: string;
  state: WearWorkoutState;
  activityType: string;
  startedAtMs: number | null;
  endedAtMs: number | null;
  /** Wall-clock elapsed including pauses. */
  elapsedSeconds: number;
  /** Accumulated running time, pauses excluded. */
  movingSeconds: number;
  stepCount: number;
  heartRate: HeartRateStats;
  /** Last real measurement per type, for the live watch screen. */
  lastSteps: number | null;
  lastDistanceMeters: number | null;
  lastCalories: number | null;
}

export function createWearWorkoutSnapshot(
  sessionId: string,
  activityType: string,
  startedAtMs: number | null = null,
): WearWorkoutSnapshot {
  return {
    sessionId,
    state: "idle",
    activityType,
    startedAtMs,
    endedAtMs: null,
    elapsedSeconds: 0,
    movingSeconds: 0,
    stepCount: 0,
    heartRate: { ...EMPTY_HEART_RATE_STATS },
    lastSteps: null,
    lastDistanceMeters: null,
    lastCalories: null,
  };
}

export type WearWorkoutEvent =
  | { type: "start"; atMs: number }
  | { type: "pause"; atMs: number }
  | { type: "resume"; atMs: number }
  | { type: "finish"; atMs: number }
  | { type: "tick"; atMs: number }
  | { type: "measurement"; measurement: WearMeasurement };

/**
 * Pure session reducer shared by the watch UI, the watch service and the phone
 * (which mirrors the state it receives). Paused time is never counted as
 * moving time, and finishing is terminal.
 */
export function reduceWearWorkout(
  snapshot: WearWorkoutSnapshot,
  event: WearWorkoutEvent,
): WearWorkoutSnapshot {
  switch (event.type) {
    case "start":
      if (snapshot.state !== "idle") return snapshot;
      return { ...snapshot, state: "running", startedAtMs: event.atMs, endedAtMs: null };
    case "pause":
      if (snapshot.state !== "running") return snapshot;
      return { ...snapshot, state: "paused" };
    case "resume":
      if (snapshot.state !== "paused") return snapshot;
      return { ...snapshot, state: "running" };
    case "finish":
      if (snapshot.state === "finished" || snapshot.state === "idle") return snapshot;
      return { ...snapshot, state: "finished", endedAtMs: event.atMs };
    case "tick": {
      if (snapshot.startedAtMs == null || snapshot.state === "idle") return snapshot;
      const elapsed = Math.max(0, Math.round((event.atMs - snapshot.startedAtMs) / 1000));
      if (snapshot.state === "finished" && snapshot.endedAtMs != null) {
        return { ...snapshot, elapsedSeconds: snapshot.elapsedSeconds };
      }
      return { ...snapshot, elapsedSeconds: elapsed };
    }
    case "measurement": {
      const measurement = event.measurement;
      if (snapshot.state === "idle" || snapshot.state === "finished") return snapshot;
      if (measurement.type === "heart_rate") {
        return {
          ...snapshot,
          heartRate: accumulateHeartRate(snapshot.heartRate, measurement.value),
        };
      }
      if (measurement.type === "steps") {
        return {
          ...snapshot,
          stepCount: Math.max(snapshot.stepCount, Math.round(measurement.value)),
        };
      }
      if (measurement.type === "distance") {
        return { ...snapshot, lastDistanceMeters: measurement.value };
      }
      if (measurement.type === "calories") {
        return { ...snapshot, lastCalories: measurement.value };
      }
      return snapshot;
    }
    default:
      return snapshot;
  }
}

// ── Completion summary ─────────────────────────────────────────────────────

export interface WearWorkoutSummary {
  sessionId: string;
  activityType: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  movingSeconds: number | null;
  stepCount: number;
  distanceMeters: number | null;
  caloriesEstimate: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  heartRateSampleCount: number;
  source: "wear_os";
}

/** Activity types the canonical SVJ pipeline accepts from the watch. */
export const WEAR_ACTIVITY_TYPES = [
  "running",
  "walking",
  "cycling",
  "strength",
  "football",
  "other",
] as const;

export function isWearActivityType(value: unknown): boolean {
  return typeof value === "string" && (WEAR_ACTIVITY_TYPES as readonly string[]).includes(value);
}

/**
 * Validate a completion summary sent by the watch. Only genuinely measured
 * values survive; unavailable metrics stay null so nothing is fabricated
 * server-side. Heart-rate averages are re-derived from the accepted samples.
 */
export function normalizeWearSummary(
  raw: unknown,
  nowMs: number,
  samples: readonly WearMeasurement[] = [],
): WearWorkoutSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  if (sessionId.length < 8 || sessionId.length > 100) return null;
  if (!isWearActivityType(value.activityType)) return null;
  const startedAtMs = numericOrNull(value.startedAtMs);
  const endedAtMs = numericOrNull(value.endedAtMs);
  if (startedAtMs == null || endedAtMs == null) return null;
  if (endedAtMs <= startedAtMs) return null;
  if (endedAtMs > nowMs + 5 * 60_000) return null;

  const durationSeconds = Math.round((endedAtMs - startedAtMs) / 1000);
  if (durationSeconds < 30 || durationSeconds > 86_400) return null;

  const stats = samples
    .filter((sample) => sample.type === "heart_rate" && sample.sessionId === sessionId)
    .reduce((acc, sample) => accumulateHeartRate(acc, sample.value), {
      ...EMPTY_HEART_RATE_STATS,
    } as HeartRateStats);
  const watchAverage = numericOrNull(value.avgHeartRate);
  const watchMaximum = numericOrNull(value.maxHeartRate);
  const avgHeartRate =
    stats.sampleCount > 0
      ? stats.average
      : watchAverage != null && watchAverage >= 20 && watchAverage <= 250
        ? Math.round(watchAverage)
        : null;
  const maxHeartRate =
    stats.sampleCount > 0
      ? stats.maximum
      : watchMaximum != null && watchMaximum >= 20 && watchMaximum <= 250
        ? Math.round(watchMaximum)
        : null;

  const movingSeconds = numericOrNull(value.movingSeconds);
  const stepCount = numericOrNull(value.stepCount);
  const distanceMeters = numericOrNull(value.distanceMeters ?? value.lastDistanceMeters);
  const calories = numericOrNull(value.caloriesEstimate ?? value.lastCalories);

  return {
    sessionId,
    activityType: value.activityType as string,
    startedAtMs,
    endedAtMs,
    durationSeconds,
    movingSeconds:
      movingSeconds != null && movingSeconds >= 0 && movingSeconds <= durationSeconds + 60
        ? Math.round(movingSeconds)
        : null,
    // Steps the watch actually counted — never the phone's steps added in.
    stepCount:
      stepCount != null && stepCount >= 0 && stepCount <= 200_000 ? Math.round(stepCount) : 0,
    distanceMeters:
      distanceMeters != null && distanceMeters >= 0 && distanceMeters <= 500_000
        ? distanceMeters
        : null,
    caloriesEstimate: calories != null && calories >= 0 && calories <= 20_000 ? calories : null,
    avgHeartRate,
    maxHeartRate,
    heartRateSampleCount: stats.sampleCount,
    source: "wear_os",
  };
}

function numericOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Deterministic external id: re-importing the same session reuses it. */
export function wearExternalId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^a-zA-Z0-9]/g, "");
  return `wear-${cleaned.slice(0, 60)}`;
}

/** Stable SVJ client session id derived from the watch session id. */
export function wearClientSessionId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  return `svj-wear-${cleaned.slice(0, 60)}`.padEnd(12, "0");
}

/**
 * A watch session is imported at most once. The server also deduplicates
 * (external id, session id and type/time/duration overlap), so this is a
 * traffic-avoiding pre-filter that can never cause a lost workout.
 */
export function isWearSummaryAlreadyImported(
  summary: WearWorkoutSummary,
  imported: readonly { sessionId: string }[],
): boolean {
  return imported.some((entry) => entry.sessionId === summary.sessionId);
}

// ── Heart-rate source arbitration ──────────────────────────────────────────

export interface HeartRateCandidate {
  reading: LiveHeartRate | null;
  /** Epoch ms of the last accepted sample, or null when none arrived. */
  lastSampleMs: number | null;
}

export interface HeartRateArbitrationInput {
  /** Explicit user choice from Activity → Devices, or null for "automatic". */
  preferred: "ble" | "wear_os" | null;
  ble: HeartRateCandidate;
  wear: HeartRateCandidate;
}

export interface HeartRateSelection {
  reading: LiveHeartRate | null;
  source: "ble" | "wear_os" | null;
  /** True when the preferred source is selected but currently silent. */
  degraded: boolean;
}

/**
 * Deterministic live heart-rate priority:
 *
 *   1. an explicitly selected source while it is healthy,
 *   2. the direct BLE strap (lowest latency, most accurate),
 *   3. the SVJ Watch,
 *   4. nothing.
 *
 * Health Connect is deliberately excluded: it is delayed historical data and is
 * never presented as a live stream.
 */
export function chooseHeartRateSource(
  input: HeartRateArbitrationInput,
  nowMs: number,
): HeartRateSelection {
  const bleFresh = isHeartRateFresh(input.ble.reading, nowMs);
  const wearFresh = isHeartRateFresh(input.wear.reading, nowMs);

  if (input.preferred === "ble") {
    if (bleFresh) return { reading: input.ble.reading, source: "ble", degraded: false };
    if (wearFresh) return { reading: input.wear.reading, source: "wear_os", degraded: true };
    return { reading: null, source: null, degraded: true };
  }
  if (input.preferred === "wear_os") {
    if (wearFresh) return { reading: input.wear.reading, source: "wear_os", degraded: false };
    if (bleFresh) return { reading: input.ble.reading, source: "ble", degraded: true };
    return { reading: null, source: null, degraded: true };
  }
  if (bleFresh) return { reading: input.ble.reading, source: "ble", degraded: false };
  if (wearFresh) return { reading: input.wear.reading, source: "wear_os", degraded: false };
  return { reading: null, source: null, degraded: false };
}

/**
 * Step counting rule: the watch's own counter is used while the watch is the
 * active workout source; the phone's pedometer is used otherwise. The two are
 * NEVER added together, which is what prevents double-counted steps.
 */
export function chooseStepCount(input: {
  wearSteps: number | null;
  phoneSteps: number;
  wearActive: boolean;
}): number {
  if (input.wearActive && input.wearSteps != null && input.wearSteps > 0) {
    return Math.round(input.wearSteps);
  }
  return Math.max(0, Math.round(input.phoneSteps));
}

// ── User heart-rate source preference ──────────────────────────────────────

const HR_PREFERENCE_KEY = "svj.hrSourcePreference";
export type HeartRateSourcePreference = "auto" | "ble" | "wear_os";

function readPreference(): HeartRateSourcePreference {
  try {
    const stored = window.localStorage.getItem(HR_PREFERENCE_KEY);
    if (stored === "ble" || stored === "wear_os" || stored === "auto") return stored;
  } catch {
    // Storage can be unavailable (private mode); automatic selection is fine.
  }
  return "auto";
}

let preference: HeartRateSourcePreference =
  typeof window === "undefined" ? "auto" : readPreference();
const preferenceListeners = new Set<() => void>();

export function getHeartRateSourcePreference(): HeartRateSourcePreference {
  return preference;
}

export function setHeartRateSourcePreference(next: HeartRateSourcePreference): void {
  preference = next;
  try {
    window.localStorage.setItem(HR_PREFERENCE_KEY, next);
  } catch {
    // ignore
  }
  for (const listener of preferenceListeners) listener();
}

export function subscribeHeartRateSourcePreference(listener: () => void): () => void {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}

/** "auto" means no explicit selection — arbitration picks the freshest source. */
export function preferredSourceForArbitration(
  value: HeartRateSourcePreference = preference,
): "ble" | "wear_os" | null {
  return value === "auto" ? null : value;
}

// ── Native plugin bridge ───────────────────────────────────────────────────

export interface NativeWearEvent {
  type: "sample" | "state" | "summary" | "handshake";
  id: string;
  sessionId?: string;
  payload: unknown;
  receivedAtMs: number;
}

export interface VjWearPlugin {
  isAvailable?: () => Promise<unknown>;
  getCompanionStatus?: () => Promise<unknown>;
  getPendingEvents?: () => Promise<unknown>;
  acknowledgeEvents?: (options: { ids: string[] }) => Promise<unknown>;
  sendCommand?: (options: {
    type: "start" | "pause" | "resume" | "finish" | "request_summary";
    sessionId?: string;
    activityType?: string;
  }) => Promise<unknown>;
  addListener?: (
    eventName: "wearEvent" | "wearConnection" | "wearCapabilities",
    listener: (event: unknown) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
}

export const VjWear = registerPlugin<VjWearPlugin>("VjWear");

export function isNativeWearAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("VjWear");
}

/** Normalize one native inbox event. Unknown/malformed entries are dropped. */
export function normalizeNativeWearEvent(raw: unknown, nowMs: number): NativeWearEvent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const type = value.type;
  if (type !== "sample" && type !== "state" && type !== "summary" && type !== "handshake")
    return null;
  const id = typeof value.id === "string" && value.id.length > 0 ? value.id : null;
  if (!id) return null;
  const payload = parseWearPayload(value.payload);
  if (payload == null) return null;
  return {
    type,
    id,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
    payload,
    receivedAtMs: numericOrNull(value.receivedAtMs) ?? nowMs,
  };
}

export function normalizeNativeWearEvents(raw: unknown, nowMs: number): NativeWearEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeNativeWearEvent(entry, nowMs))
    .filter((entry): entry is NativeWearEvent => entry != null);
}

/**
 * The Data Layer carries a JSON string so the watch and phone cannot drift on
 * serialization. A payload that is not a JSON object is rejected outright.
 */
export function parseWearPayload(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/** Validate a `state` message from the watch. */
export function normalizeWearStateMessage(raw: unknown): {
  sessionId: string;
  state: WearWorkoutState;
  activityType: string | null;
  elapsedSeconds: number | null;
  stepCount: number | null;
  heartRate: number | null;
} | null {
  const value = parseWearPayload(raw);
  if (!value) return null;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  if (sessionId.length < 8) return null;
  const state = value.state;
  if (typeof state !== "string" || !(WEAR_WORKOUT_STATES as readonly string[]).includes(state)) {
    return null;
  }
  const heartRate = numericOrNull(value.heartRate);
  return {
    sessionId,
    state: state as WearWorkoutState,
    activityType: typeof value.activityType === "string" ? value.activityType : null,
    elapsedSeconds: numericOrNull(value.elapsedSeconds),
    stepCount: numericOrNull(value.stepCount),
    heartRate:
      heartRate != null && heartRate >= 20 && heartRate <= 250 ? Math.round(heartRate) : null,
  };
}

/** Validate a `handshake` message from the watch. */
export function normalizeWearHandshake(raw: unknown): {
  protocol: number;
  capabilities: WearCapabilities;
  sessionId: string | null;
  state: WearWorkoutState | null;
} | null {
  const value = parseWearPayload(raw);
  if (!value) return null;
  const protocol = numericOrNull(value.protocol);
  if (protocol == null) return null;
  const state = value.state;
  return {
    protocol: Math.round(protocol),
    capabilities: normalizeWearCapabilities(value.capabilities),
    sessionId:
      typeof value.sessionId === "string" && value.sessionId.length > 0 ? value.sessionId : null,
    state:
      typeof state === "string" && (WEAR_WORKOUT_STATES as readonly string[]).includes(state)
        ? (state as WearWorkoutState)
        : null,
  };
}

export { isHeartRateFresh };
export type { LiveHeartRate };
