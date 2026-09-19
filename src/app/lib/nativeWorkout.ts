// ============================================================================
// SVJ NATIVE ACTIVITY — Android foreground workout bridge.
//
// Wraps the app-local `VjWorkout` Capacitor plugin, which owns a real Android
// foreground service with a persistent "SVJ is recording your activity"
// notification. Recording therefore survives screen lock, app backgrounding
// and WebView recreation — the browser is only the display.
//
// Collection is strictly user-driven: the service starts only when the user
// starts an outdoor workout and stops the moment it ends. There is no
// background or passive location collection anywhere in SVJ.
//
// Every native payload is validated before it reaches the recorder: a bad
// bridge response must degrade to "no sample", never to a corrupt track.
// ============================================================================

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { LocationAdapter, RawLocationSample } from "./gpsRecorder";
import type { GpsActivityType } from "./gpsActivity";

export const WORKOUT_PLUGIN_NAME = "VjWorkout";

export type PermissionStatus = "granted" | "denied" | "prompt" | "unavailable";

export interface WorkoutPermissions {
  location: PermissionStatus;
  backgroundLocation: PermissionStatus;
  notifications: PermissionStatus;
}

export interface WorkoutNativeState {
  active: boolean;
  activityId: string | null;
  activityType: string | null;
  startedAtMs: number | null;
  paused: boolean;
  pointCount: number;
}

export interface WorkoutPlugin {
  isAvailable?: () => Promise<{ available?: boolean; foregroundService?: boolean }>;
  checkPermissions?: () => Promise<unknown>;
  requestPermissions?: () => Promise<unknown>;
  startWorkout?: (options: {
    activityId: string;
    activityType: string;
    title?: string;
    autoPause?: boolean;
  }) => Promise<unknown>;
  pauseWorkout?: () => Promise<unknown>;
  resumeWorkout?: () => Promise<unknown>;
  stopWorkout?: () => Promise<unknown>;
  getState?: () => Promise<unknown>;
  getLastLocation?: () => Promise<unknown>;
  addListener?: (
    event: string,
    handler: (payload: unknown) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
}

/** The registered plugin, or null on web / when the native build lacks it. */
export function workoutPlugin(): WorkoutPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return registerPlugin<WorkoutPlugin>(WORKOUT_PLUGIN_NAME);
  } catch {
    return null;
  }
}

export function workoutPluginAvailable(): boolean {
  const plugin = workoutPlugin();
  return Boolean(plugin && typeof plugin.startWorkout === "function");
}

function normalizePermission(value: unknown): PermissionStatus {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  if (value === "prompt" || value === "prompt-with-rationale") return "prompt";
  return "unavailable";
}

export function normalizeWorkoutPermissions(raw: unknown): WorkoutPermissions {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    location: normalizePermission(source.location),
    backgroundLocation: normalizePermission(source.backgroundLocation),
    notifications: normalizePermission(source.notifications),
  };
}

export async function checkWorkoutPermissions(): Promise<WorkoutPermissions> {
  const plugin = workoutPlugin();
  if (!plugin?.checkPermissions) {
    return {
      location: "unavailable",
      backgroundLocation: "unavailable",
      notifications: "unavailable",
    };
  }
  try {
    return normalizeWorkoutPermissions(await plugin.checkPermissions());
  } catch {
    return {
      location: "unavailable",
      backgroundLocation: "unavailable",
      notifications: "unavailable",
    };
  }
}

export async function requestWorkoutPermissions(): Promise<WorkoutPermissions> {
  const plugin = workoutPlugin();
  if (!plugin?.requestPermissions) return checkWorkoutPermissions();
  try {
    return normalizeWorkoutPermissions(await plugin.requestPermissions());
  } catch {
    return checkWorkoutPermissions();
  }
}

/**
 * Recording needs foreground location; background location is optional and only
 * upgrades the experience (it keeps the service alive when the app is swiped
 * away). Refusing background location must NOT block recording.
 */
export function canRecordWith(permissions: WorkoutPermissions): boolean {
  return permissions.location === "granted";
}

// ── Sample validation ──────────────────────────────────────────────────────

/** Validate one native location payload without coercing bad values. */
export function normalizeNativeSample(raw: unknown): RawLocationSample | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const lat = value.lat;
  const lng = value.lng;
  const timestampMs = value.timestampMs ?? value.time;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs) || timestampMs <= 0)
    return null;

  const optional = (candidate: unknown, min: number, max: number): number | null =>
    typeof candidate === "number" &&
    Number.isFinite(candidate) &&
    candidate >= min &&
    candidate <= max
      ? candidate
      : null;

  return {
    lat,
    lng,
    timestampMs,
    accuracy: optional(value.accuracy, 0, 10_000),
    elevation: optional(value.elevation ?? value.altitude, -500, 10_000),
    heartRate: optional(value.heartRate ?? value.hr, 20, 260),
    cadence: optional(value.cadence, 0, 400),
  };
}

export function normalizeWorkoutState(raw: unknown): WorkoutNativeState {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const numOrNull = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    active: source.active === true,
    activityId: typeof source.activityId === "string" ? source.activityId : null,
    activityType: typeof source.activityType === "string" ? source.activityType : null,
    startedAtMs: numOrNull(source.startedAtMs),
    paused: source.paused === true,
    pointCount: Math.max(0, Math.round(numOrNull(source.pointCount) ?? 0)),
  };
}

export async function getNativeWorkoutState(): Promise<WorkoutNativeState | null> {
  const plugin = workoutPlugin();
  if (!plugin?.getState) return null;
  try {
    return normalizeWorkoutState(await plugin.getState());
  } catch {
    return null;
  }
}

export async function startNativeWorkout(options: {
  activityId: string;
  activityType: GpsActivityType;
  title?: string;
  autoPause?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const plugin = workoutPlugin();
  if (!plugin?.startWorkout) return { ok: false, error: "Native workout service unavailable." };
  try {
    await plugin.startWorkout({
      activityId: options.activityId,
      activityType: options.activityType,
      title: options.title ?? "SVJ is recording your activity",
      autoPause: options.autoPause ?? true,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not start the workout service.",
    };
  }
}

export async function setNativeWorkoutPaused(paused: boolean): Promise<void> {
  const plugin = workoutPlugin();
  if (!plugin) return;
  try {
    if (paused) await plugin.pauseWorkout?.();
    else await plugin.resumeWorkout?.();
  } catch {
    // The JS recorder still owns pause state; a native hiccup must not break it.
  }
}

export async function stopNativeWorkout(): Promise<void> {
  const plugin = workoutPlugin();
  if (!plugin?.stopWorkout) return;
  try {
    await plugin.stopWorkout();
  } catch {
    // ignore
  }
}

/** Foreground-service battery/notification state, when the device exposes it. */
export async function readBatteryPercent(): Promise<number | null> {
  const plugin = workoutPlugin() as
    | (WorkoutPlugin & {
        getBattery?: () => Promise<unknown>;
      })
    | null;
  if (!plugin?.getBattery) return null;
  try {
    const raw = await plugin.getBattery();
    const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const level = value.level ?? value.percent;
    return typeof level === "number" && Number.isFinite(level) && level >= 0 && level <= 100
      ? Math.round(level)
      : null;
  } catch {
    return null;
  }
}

// ── LocationAdapter over the native service ────────────────────────────────

/**
 * Wrap the native foreground service as a recorder location source. Samples
 * arrive from the service (not from the WebView), so a locked screen or a
 * backgrounded app keeps recording.
 */
export function createNativeWorkoutLocationAdapter(plugin: WorkoutPlugin | null): LocationAdapter {
  return {
    async start(onSample, onError) {
      if (!plugin?.addListener) {
        onError?.("Native workout service unavailable.");
        return;
      }
      await plugin.addListener("location", (payload) => {
        const sample = normalizeNativeSample(payload);
        if (sample) onSample(sample);
      });
      // State events are informational. Collection is ended by the recorder
      // itself (its adapter `stop()`), so an inactive payload is expected and
      // must never be surfaced as a failure — the recorder still owns every
      // point it has already accepted. Real native/local disagreement is
      // detected by reconcileNativeWorkout() on recovery instead of guessed
      // here, where the local session state is not visible.
      await plugin.addListener("workoutState", () => {});
      // A foreground service can receive its first fix before the WebView has
      // attached (or while it is being recreated). Replay the persisted fix so
      // the route UI never waits forever for a second movement callback.
      if (plugin.getLastLocation) {
        const cached = normalizeNativeSample(await plugin.getLastLocation());
        if (cached) onSample(cached);
      }
    },
    async stop() {
      await stopNativeWorkout();
    },
  };
}

// ── Session recovery / reconciliation ──────────────────────────────────────

export interface NativeReconciliation {
  /** The Android service currently believes a workout is running. */
  nativeActive: boolean;
  /** The activity id the service is recording, when it knows one. */
  activityId: string | null;
  /** Native and local state agree on the same workout. */
  matchesLocal: boolean;
  /**
   * The service is running a workout the local recorder knows nothing about.
   * This MUST NOT be silently continued: it would become a second activity.
   */
  orphaned: boolean;
}

/**
 * Compare the Android service's view of the world with the locally persisted
 * workout. Called on app/webview start, where a process recreation can leave a
 * live service and a restored (or missing) local session.
 */
/**
 * Pure reconciliation rule, separated from the bridge so it is unit-testable:
 * native and local state only "match" when both are actually recording the
 * same activity id. Anything else that is still active natively is orphaned.
 */
export function reconcileWorkoutStates(
  native: WorkoutNativeState | null,
  localActivityId: string | null,
): NativeReconciliation | null {
  if (!native) return null;
  const matchesLocal =
    native.active && localActivityId != null && native.activityId === localActivityId;
  return {
    nativeActive: native.active,
    activityId: native.activityId,
    matchesLocal,
    orphaned: native.active && !matchesLocal,
  };
}

export async function reconcileNativeWorkout(
  localActivityId: string | null,
): Promise<NativeReconciliation | null> {
  return reconcileWorkoutStates(await getNativeWorkoutState(), localActivityId);
}
