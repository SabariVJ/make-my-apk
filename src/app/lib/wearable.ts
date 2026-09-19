import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  HEART_RATE_MEASUREMENT_UUID,
  isHeartRateFresh,
  parseHeartRateMeasurement,
  type LiveHeartRate,
} from "./bleHeartRate";

/**
 * Android BLE wearable bridge for the app-local `VjWearablePlugin`.
 *
 * Talks to standard Bluetooth SIG GATT services — primarily the Heart Rate
 * Service (0x180D) — so any compatible chest strap or health band works
 * without brand-specific code. All payloads are validated here before use;
 * nothing is fabricated when a sensor does not transmit a field.
 */

export type WearableConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "permission_denied"
  | "bluetooth_unavailable";

export interface DiscoveredDevice {
  deviceId: string;
  name: string;
  /** Advertised signal strength in dBm (more negative = farther). */
  rssi: number | null;
  /** True when the advertisement includes the standard Heart Rate Service. */
  hasHeartRateService: boolean;
}

export interface BleDeviceInfo {
  deviceId: string;
  name: string;
  /** Body sensor location string from 0x2A38, when the device supplies it. */
  bodySensorLocation?: string;
  batteryPercent?: number;
}

export interface VjWearablePlugin {
  isSupported(): Promise<{ supported: boolean; bluetoothEnabled: boolean }>;
  checkPermissions(): Promise<{ granted: boolean }>;
  requestPermissions(): Promise<{ granted: boolean }>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  getDiscoveredDevices(): Promise<{ devices: DiscoveredDevice[] }>;
  connect(options: { deviceId: string }): Promise<{ device: BleDeviceInfo }>;
  disconnect(options: { deviceId: string }): Promise<void>;
  forgetDevice(options: { deviceId: string }): Promise<void>;
  getConnectedDevices(): Promise<{ devices: BleDeviceInfo[] }>;
  addListener(
    eventName: "heartRateMeasurement",
    listener: (event: unknown) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "batteryLevelChanged",
    listener: (event: unknown) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "sensorError" | "connectionStateChanged" | "deviceDiscovered",
    listener: (event: unknown) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const VjWearable = registerPlugin<VjWearablePlugin>("VjWearable");

export function isNativeWearableAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("VjWearable");
}

/** Validate a native heartRateMeasurement event payload before use. */
export function normalizeWearableHeartRate(
  raw: unknown,
  nowMs: number,
): LiveHeartRate | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const measurement = parseHeartRateMeasurement(
    value.data instanceof Uint8Array || value.data instanceof ArrayBuffer
      ? (value.data as Uint8Array)
      : new Uint8Array(0),
  );
  if (!measurement) return null;
  const timestampMs =
    typeof value.timestamp === "number" && Number.isFinite(value.timestamp)
      ? value.timestamp
      : nowMs;
  return {
    bpm: measurement.bpm,
    timestampMs,
    source: "ble",
    deviceName: typeof value.deviceName === "string" ? value.deviceName : undefined,
    deviceId: typeof value.deviceId === "string" ? value.deviceId : undefined,
    sensorContact: measurement.sensorContact,
  };
}

/** Validate a battery event payload. */
export function normalizeBatteryLevel(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const percent = (raw as Record<string, unknown>).level;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100)
    return null;
  return Math.round(percent);
}

export interface WearableState {
  connection: WearableConnectionState;
  scanning: boolean;
  discovered: DiscoveredDevice[];
  device: BleDeviceInfo | null;
  /** Latest fresh HR reading, or null when stale/absent. */
  heartRate: LiveHeartRate | null;
  batteryPercent: number | null;
  error: string | null;
}

export type WearableEvent =
  | { type: "scan_started" }
  | { type: "scan_stopped" }
  | { type: "devices_discovered"; devices: DiscoveredDevice[] }
  | { type: "connecting"; deviceId: string }
  | { type: "connected"; device: BleDeviceInfo }
  | { type: "disconnected" }
  | { type: "permission_denied" }
  | { type: "bluetooth_unavailable" }
  | { type: "heart_rate"; reading: LiveHeartRate }
  | { type: "battery"; percent: number }
  | { type: "error"; message: string };

/**
 * Pure reducer for connection lifecycle + stale-HR handling. The UI renders
 * exclusively from this state, so it is fully testable without hardware.
 */
export function reduceWearableEvent(state: WearableState, event: WearableEvent, nowMs: number): WearableState {
  switch (event.type) {
    case "scan_started":
      return { ...state, scanning: true, discovered: [], connection: state.connection === "connected" ? state.connection : "scanning", error: null };
    case "scan_stopped":
      return { ...state, scanning: false, connection: state.device ? "connected" : state.connection === "scanning" ? "disconnected" : state.connection };
    case "devices_discovered":
      return { ...state, discovered: event.devices };
    case "connecting":
      return { ...state, scanning: false, connection: "connecting" };
    case "connected":
      return { ...state, scanning: false, connection: "connected", device: event.device, error: null };
    case "disconnected":
      return { ...state, connection: "disconnected", device: null, heartRate: null, batteryPercent: null };
    case "permission_denied":
      return { ...state, scanning: false, connection: "permission_denied", error: "Bluetooth permission denied" };
    case "bluetooth_unavailable":
      return { ...state, scanning: false, connection: "bluetooth_unavailable", error: "Bluetooth is off or unavailable" };
    case "heart_rate":
      return { ...state, heartRate: event.reading };
    case "battery":
      return { ...state, batteryPercent: event.percent };
    case "error":
      return { ...state, error: event.message };
    default:
      return state;
  }
}

/** True when the current HR reading has gone stale (UI shows "signal lost"). */
export function heartRateLost(state: WearableState, nowMs: number): boolean {
  return state.heartRate != null && !isHeartRateFresh(state.heartRate, nowMs);
}

export { HEART_RATE_MEASUREMENT_UUID };
