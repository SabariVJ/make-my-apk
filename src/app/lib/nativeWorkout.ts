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
import type {
  GpsWorkoutRecorder,
  NativeWorkoutEvent,
  LocationAdapter,
  RawLocationSample,
} from "./gpsRecorder";
import type { GpsActivityType } from "./gpsActivity";

export const WORKOUT_PLUGIN_NAME = "VjWorkout";

export type PermissionStatus = "granted" | "denied" | "prompt" | "unavailable";

export interface WorkoutPermissions {
  location: PermissionStatus;
  backgroundLocation: PermissionStatus;
  notifications: PermissionStatus;
}

export interface WorkoutNativeState {
  version?: number;
  ownerId?: string;
  error?: string | null;
  active: boolean;
  activityId: string | null;
  activityType: string | null;
  startedAtMs: number | null;
  paused: boolean;
  pointCount: number;
}

export interface WorkoutPlugin {
  isAvailable?: () => Promise<{
    available?: boolean;
    foregroundService?: boolean;
    version?: number;
    journal?: boolean;
  }>;
  checkPermissions?: () => Promise<unknown>;
  requestPermissions?: () => Promise<unknown>;
  startWorkout?: (options: {
    activityId: string;
    activityType: string;
    title?: string;
    autoPause?: boolean;
    ownerId?: string;
    startedAtMs?: number;
  }) => Promise<unknown>;
  pauseWorkout?: (identity?: WorkoutIdentity) => Promise<unknown>;
  resumeWorkout?: (identity?: WorkoutIdentity) => Promise<unknown>;
  stopWorkout?: (identity?: WorkoutIdentity) => Promise<unknown>;
  getState?: () => Promise<unknown>;
  getLastLocation?: () => Promise<unknown>;
  readJournal?: (options: {
    ownerId: string;
    activityId: string;
    afterSequence: number;
    limit: number;
  }) => Promise<{ events: unknown[] }>;
  listRecordings?: (options: { ownerId: string }) => Promise<{
    recordings: Array<{
      ownerId: string;
      activityId: string;
      activityType: string;
      startedAtMs: number;
      ended: boolean;
    }>;
  }>;
  clearJournal?: (options: {
    ownerId: string;
    activityId: string;
    confirmed: boolean;
  }) => Promise<void>;
  addListener?: (
    event: string,
    handler: (payload: unknown) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
}

export interface WorkoutIdentity {
  ownerId: string;
  activityId: string;
}

/** The registered plugin, or null on web / when the native build lacks it. */
export function workoutPlugin(): WorkoutPlugin | null {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(WORKOUT_PLUGIN_NAME))
    return null;
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
    version: typeof source.version === "number" ? source.version : 1,
    ownerId: typeof source.ownerId === "string" ? source.ownerId : "",
    error: typeof source.error === "string" ? source.error : null,
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
  ownerId?: string;
  startedAtMs?: number;
  activityId: string;
  activityType: GpsActivityType;
  title?: string;
  autoPause?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const plugin = workoutPlugin();
  if (!plugin?.startWorkout) return { ok: false, error: "Native workout service unavailable." };
  try {
    const acknowledged = normalizeWorkoutState(
      await plugin.startWorkout({
        activityId: options.activityId,
        activityType: options.activityType,
        title: options.title ?? "SVJ is recording your activity",
        autoPause: options.autoPause ?? true,
        ownerId: options.ownerId,
        startedAtMs: options.startedAtMs,
      }),
    );
    if (
      options.ownerId &&
      (acknowledged.version !== 2 ||
        !acknowledged.active ||
        acknowledged.paused ||
        acknowledged.ownerId !== options.ownerId ||
        acknowledged.activityId !== options.activityId)
    )
      return { ok: false, error: "Recording did not confirm its start. Your workout is retained." };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not start the workout service.",
    };
  }
}

export async function setNativeWorkoutPaused(
  paused: boolean,
  identity?: WorkoutIdentity,
): Promise<void> {
  const plugin = workoutPlugin();
  if (!plugin) return;
  const expected = identity ?? (await currentIdentity(plugin));
  if (paused) await plugin.pauseWorkout?.(expected);
  else await plugin.resumeWorkout?.(expected);
}

async function currentIdentity(plugin: WorkoutPlugin): Promise<WorkoutIdentity | undefined> {
  const state = normalizeWorkoutState(await plugin.getState?.());
  if (state.version === 2 && state.ownerId && state.activityId)
    return { ownerId: state.ownerId, activityId: state.activityId };
  return undefined;
}

export async function stopNativeWorkout(identity?: WorkoutIdentity): Promise<void> {
  const plugin = workoutPlugin();
  if (!plugin?.stopWorkout) return;
  const expected = identity ?? (await currentIdentity(plugin));
  if (!expected && plugin.getState && normalizeWorkoutState(await plugin.getState()).version === 2)
    return;
  await plugin.stopWorkout(expected);
}

export function validateJournalEvent(
  raw: unknown,
  ownerId: string,
  activityId: string,
): NativeWorkoutEvent {
  if (!raw || typeof raw !== "object") throw new Error("Invalid saved recording.");
  const event = raw as NativeWorkoutEvent;
  if (
    event.ownerId !== ownerId ||
    event.activityId !== activityId ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence <= 0 ||
    !Number.isFinite(event.timestampMs) ||
    event.timestampMs <= 0 ||
    !["start", "point", "pause", "resume", "end", "steps"].includes(event.kind)
  )
    throw new Error("Saved recording identity or sequence is invalid.");
  if (event.kind === "point" && !normalizeNativeSample(event))
    throw new Error("Invalid saved GPS point.");
  return event;
}

export function createJournalLocationAdapter(
  plugin: WorkoutPlugin,
  ownerId: string,
  recorder: GpsWorkoutRecorder,
): LocationAdapter {
  let handles: Array<{ remove: () => Promise<void> }> = [];
  let draining: Promise<void> | null = null;
  let dirty = false;
  let report: ((message: string) => void) | undefined;
  let generation = 0;
  let visibleCleanup: (() => void) | undefined;
  const drain = (): Promise<void> => {
    dirty = true;
    if (draining) return draining;
    const run = async () => {
      do {
        dirty = false;
        const session = recorder.current;
        if (!session || session.ownerId !== ownerId || !plugin.readJournal) return;
        while (true) {
          const page = await plugin.readJournal({
            ownerId,
            activityId: session.activityId,
            afterSequence: recorder.current?.nativeSequence ?? 0,
            limit: 250,
          });
          if (!Array.isArray(page.events)) throw new Error("Update SVJ to recover saved routes.");
          for (const raw of page.events)
            recorder.replayNativeEvent(validateJournalEvent(raw, ownerId, session.activityId));
          if (page.events.length < 250) break;
        }
      } while (dirty);
    };
    draining = run().finally(() => {
      draining = null;
    });
    return draining;
  };
  const detach = async () => {
    generation += 1;
    visibleCleanup?.();
    visibleCleanup = undefined;
    const owned = handles;
    handles = [];
    await Promise.all(owned.map((h) => h.remove()));
  };
  return {
    async start(_onSample, onError) {
      report = onError;
      await detach();
      const attachedGeneration = generation;
      if (!plugin.addListener) throw new Error("Update SVJ to record routes.");
      const wake = () => {
        void drain().catch(() =>
          report?.("Could not recover route points. Check device storage and retry."),
        );
      };
      const listen = async (event: string, handler: (value: unknown) => void) => {
        const handle = await plugin.addListener!(event, handler);
        if (generation !== attachedGeneration) await handle.remove();
        else handles.push(handle);
      };
      await listen("journalChanged", wake);
      await listen("workoutState", (payload) => {
        const state = normalizeWorkoutState(payload);
        if (state.ownerId === ownerId && state.error) report?.(state.error);
        wake();
      });
      const onVisible = () => {
        if (!document.hidden) wake();
      };
      if (typeof document !== "undefined" && generation === attachedGeneration) {
        document.addEventListener("visibilitychange", onVisible);
        visibleCleanup = () => document.removeEventListener("visibilitychange", onVisible);
      }
      await drain();
    },
    async stop() {
      const activityId = recorder.current?.activityId;
      if (activityId) await plugin.stopWorkout?.({ ownerId, activityId });
      await drain();
      await detach();
    },
    detach,
  };
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
  let handles: Array<{ remove: () => Promise<void> }> = [];
  let generation = 0;
  const detach = async () => {
    generation += 1;
    const owned = handles;
    handles = [];
    await Promise.all(owned.map((handle) => handle.remove()));
  };
  return {
    async start(onSample, onError) {
      await detach();
      const attached = generation;
      if (!plugin?.addListener) {
        onError?.("Native workout service unavailable.");
        return;
      }
      const listen = async (event: string, handler: (payload: unknown) => void) => {
        const handle = await plugin.addListener!(event, handler);
        if (generation !== attached) await handle.remove();
        else handles.push(handle);
      };
      await listen("location", (payload) => {
        const sample = normalizeNativeSample(payload);
        if (sample) onSample(sample);
      });
      // State events are informational. Collection is ended by the recorder
      // itself (its adapter `stop()`), so an inactive payload is expected and
      // must never be surfaced as a failure — the recorder still owns every
      // point it has already accepted. Real native/local disagreement is
      // detected by reconcileNativeWorkout() on recovery instead of guessed
      // here, where the local session state is not visible.
      await listen("workoutState", () => {});
      // A foreground service can receive its first fix before the WebView has
      // attached (or while it is being recreated). Replay the persisted fix so
      // the route UI never waits forever for a second movement callback.
      if (plugin.getLastLocation) {
        const cached = normalizeNativeSample(await plugin.getLastLocation());
        if (cached && generation === attached) onSample(cached);
      }
    },
    async stop() {
      await stopNativeWorkout();
      await detach();
    },
    detach,
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
