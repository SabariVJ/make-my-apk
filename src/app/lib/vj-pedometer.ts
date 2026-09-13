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

export async function vjStartTracking(sessionId: string): Promise<VjPedometerState> {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  return VjPedometer.startTracking({ sessionId });
}

/** STOP errors propagate: the UI must not claim a failed unregister succeeded. */
export async function vjStopTracking(): Promise<VjPedometerState | null> {
  if (!vjPluginAvailable()) return null;
  return VjPedometer.stopTracking();
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
