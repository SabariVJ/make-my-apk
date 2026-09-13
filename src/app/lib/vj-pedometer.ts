import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Android step-tracking bridge for the app-local `VjPedometerPlugin`.
 *
 * The plugin is registered natively (MainActivity + @CapacitorPlugin) and must
 * be reached through `registerPlugin("VjPedometer")`, which is what populates
 * `Capacitor.isPluginAvailable()` / `Capacitor.PluginHeaders`. Reading
 * `window.Capacitor.plugins.*` does NOT work: Capacitor only adds a plugin to
 * that object when JS itself calls `registerPlugin`, and the property is
 * capitalised (`Capacitor.Plugins`).
 */

export type VjSensorMode = "counter" | "detector" | "accelerometer" | "none";

export interface VjValidatedMeasurement {
  numberOfSteps: number;
  distance?: number;
}

/** Validate the native payload without coercing strings, nulls or fractional steps. */
export function vjValidateMeasurement(value: unknown): VjValidatedMeasurement {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid pedometer measurement: expected an object.");
  const { numberOfSteps, distance } = value as Record<string, unknown>;
  if (
    typeof numberOfSteps !== "number" ||
    !Number.isSafeInteger(numberOfSteps) ||
    numberOfSteps < 0
  )
    throw new TypeError("Invalid numberOfSteps: expected a non-negative safe integer.");
  if (
    distance !== undefined &&
    (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0)
  )
    throw new TypeError("Invalid distance: expected a finite non-negative number.");
  return distance === undefined ? { numberOfSteps } : { numberOfSteps, distance };
}

/** Validate explicit query responses with the same rules used for live readings.
 * Activity sessions do not query or import historical/all-day measurements. */
export async function vjGetMeasurement(
  plugin:
    | { getMeasurement?: (options?: { start?: number; end?: number }) => Promise<unknown> }
    | null
    | undefined,
  options?: { start?: number; end?: number },
): Promise<VjValidatedMeasurement> {
  if (!plugin || typeof plugin.getMeasurement !== "function")
    throw new Error("Pedometer getMeasurement is unavailable in this app.");
  return vjValidateMeasurement(await plugin.getMeasurement(options));
}

export interface VjSensorInfo {
  mode: VjSensorMode;
  available: boolean;
  name: string;
  vendor: string;
  type: number;
  /** True when the native app is a debuggable build (diagnostics allowed). */
  debug: boolean;
  permission?: VjPermissionState["activityRecognition"];
}

export interface VjTrackingState {
  trackingRequested: boolean;
  trackingActive: boolean;
  listenerRegistered: boolean;
  listenerRemoved: boolean;
  sessionBaselineRaw: number;
  sessionSteps: number;
  sessionStartedMs: number;
  sessionStoppedMs: number;
  sessionId: string;
}

export interface VjPedometerAvailability {
  stepCounting: boolean;
  sensorManager: boolean;
}

export interface VjPermissionState {
  activityRecognition: "granted" | "denied" | "prompt" | "prompt-with-rationale";
}

export interface VjPedometerState extends VjTrackingState {
  /** Bridge compatibility hint: an older native STOP was used for cleanup only. */
  requiresAppUpdate?: boolean;
  sensorAvailable: boolean;
  listenerRegistered: boolean;
  sensorStarted: boolean;
  mode: VjSensorMode;
  firstRaw: number;
  lastRaw: number;
  dailySteps: number;
  guardedLastRaw: number;
  startDateMs: number;
  lastEventMs: number;
  lastError: string | null;
}

export interface VjMeasurementEvent extends VjTrackingState {
  mode: VjSensorMode;
  timestamp: number;
  rawValue: number;
  steps: number;
  sensorAvailable: boolean;
  listenerRegistered: boolean;
  sensorStarted: boolean;
  sensorName?: string;
  sensorVendor?: string;
  lastError?: string | null;
}

interface VjListenerHandle {
  remove: () => Promise<void> | void;
}

interface VjNativePlugin {
  isAvailable(): Promise<VjPedometerAvailability>;
  getSensorInfo(): Promise<VjSensorInfo>;
  checkPermissions(): Promise<VjPermissionState>;
  requestPermissions(): Promise<VjPermissionState>;
  startTracking(options: { sessionId: string }): Promise<VjPedometerState>;
  stopTracking(): Promise<VjPedometerState>;
  startUpdates(): Promise<void>;
  stopUpdates(): Promise<void>;
  getState(): Promise<VjPedometerState>;
  clearState(): Promise<void>;
  addListener(
    eventName: "measurement",
    listener: (event: VjMeasurementEvent) => void,
  ): Promise<VjListenerHandle>;
  addListener(
    eventName: "trackingStateChanged",
    listener: (event: VjPedometerState) => void,
  ): Promise<VjListenerHandle>;
}

/** Registered proxy — always use this, never `window.Capacitor.plugins`. */
export const VjPedometer = registerPlugin<VjNativePlugin>("VjPedometer");

export const VJ_NATIVE_UPDATE_MESSAGE =
  "Close SVJ and install the latest Android app to use step tracking.";

export class VjNativeUpdateRequiredError extends Error {
  constructor() {
    super(VJ_NATIVE_UPDATE_MESSAGE);
    this.name = "VjNativeUpdateRequiredError";
  }
}

function isMissingNativeMethod(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "UNIMPLEMENTED"
  );
}

export async function vjStartTracking(sessionId: string): Promise<VjPedometerState> {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  try {
    return await VjPedometer.startTracking({ sessionId });
  } catch (error) {
    if (isMissingNativeMethod(error)) throw new VjNativeUpdateRequiredError();
    throw error;
  }
}

/** STOP errors propagate: the UI must not claim a failed unregister succeeded. */
export async function vjStopTracking(): Promise<VjPedometerState | null> {
  if (!vjPluginAvailable()) return null;
  try {
    return requireStoppedState(await VjPedometer.stopTracking());
  } catch (error) {
    // A hosted web update can reach an older APK. Fall back only for an absent
    // method, never for an actual failure to unregister the sensor.
    if (!isMissingNativeMethod(error)) throw error;
  }
  try {
    await VjPedometer.stopUpdates();
    const state = requireStoppedState(await VjPedometer.getState(), true);
    return { ...state, requiresAppUpdate: true };
  } catch (error) {
    if (isMissingNativeMethod(error)) throw new VjNativeUpdateRequiredError();
    throw error;
  }
}

function requireStoppedState(
  state: VjPedometerState | undefined,
  legacy = false,
): VjPedometerState {
  if (
    !state ||
    state.listenerRegistered !== false ||
    state.sensorStarted !== false ||
    state.trackingRequested === true ||
    state.trackingActive === true ||
    (!legacy &&
      (state.listenerRemoved !== true ||
        state.trackingRequested !== false ||
        state.trackingActive !== false))
  ) {
    throw new Error("The native sensor did not confirm that its listener was removed.");
  }
  return state;
}

export function vjPluginAvailable(): boolean {
  return Capacitor.isPluginAvailable("VjPedometer");
}

export async function vjIsAvailable(): Promise<VjPedometerAvailability | null> {
  if (!vjPluginAvailable()) return null;
  try {
    return (await VjPedometer.isAvailable()) as VjPedometerAvailability;
  } catch (err) {
    console.warn("[SVJ.VjPedometer] isAvailable error:", err);
    return null;
  }
}

export async function vjCheckPermissions(): Promise<VjPermissionState | null> {
  if (!vjPluginAvailable()) return null;
  try {
    return (await VjPedometer.checkPermissions()) as VjPermissionState;
  } catch (err) {
    console.warn("[SVJ.VjPedometer] checkPermissions error:", err);
    return null;
  }
}

export async function vjRequestPermissions(): Promise<VjPermissionState | null> {
  if (!vjPluginAvailable()) return null;
  try {
    return (await VjPedometer.requestPermissions()) as VjPermissionState;
  } catch (err) {
    console.warn("[SVJ.VjPedometer] requestPermissions error:", err);
    return null;
  }
}

export async function vjStartUpdates(): Promise<void> {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  await VjPedometer.startUpdates();
}

export async function vjStopUpdates(): Promise<void> {
  if (!vjPluginAvailable()) return;
  await VjPedometer.stopUpdates();
}

export async function vjGetState(): Promise<VjPedometerState | null> {
  if (!vjPluginAvailable()) return null;
  try {
    return (await VjPedometer.getState()) as VjPedometerState;
  } catch (err) {
    console.warn("[SVJ.VjPedometer] getState error:", err);
    return null;
  }
}

export async function vjGetSensorInfo(): Promise<VjSensorInfo | null> {
  if (!vjPluginAvailable()) return null;
  try {
    return (await VjPedometer.getSensorInfo()) as VjSensorInfo;
  } catch (err) {
    console.warn("[SVJ.VjPedometer] getSensorInfo error:", err);
    return null;
  }
}

/** Each cleanup owns exactly its own handle, even if a new session has begun. */
export async function vjAddMeasurementListener(
  handler: (event: VjMeasurementEvent) => void,
): Promise<() => Promise<void>> {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  const handle = await VjPedometer.addListener("measurement", handler);
  return ownedCleanup(handle);
}

export async function vjAddTrackingStateListener(
  handler: (state: VjPedometerState) => void,
): Promise<() => Promise<void>> {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  return ownedCleanup(await VjPedometer.addListener("trackingStateChanged", handler));
}

function ownedCleanup(handle: VjListenerHandle): () => Promise<void> {
  let removed = false;
  return async () => {
    if (removed) return;
    await handle.remove();
    removed = true;
  };
}
