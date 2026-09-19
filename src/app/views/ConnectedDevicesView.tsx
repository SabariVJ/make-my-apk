import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  Activity,
  BatteryMedium,
  Bluetooth,
  HeartPulse,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Watch,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  isNativeWearableAvailable,
  normalizeBatteryLevel,
  normalizeWearableHeartRate,
  reduceWearableEvent,
  VjWearable,
  type WearableState,
  type DiscoveredDevice,
  type BleDeviceInfo,
} from "../lib/wearable";
import { isHeartRateFresh } from "../lib/bleHeartRate";

const initialState: WearableState = {
  connection: "disconnected",
  scanning: false,
  discovered: [],
  device: null,
  heartRate: null,
  batteryPercent: null,
  error: null,
};

const CONNECTION_LABELS: Record<string, string> = {
  disconnected: "No sensor connected",
  scanning: "Scanning…",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  permission_denied: "Bluetooth permission denied",
  bluetooth_unavailable: "Bluetooth is off",
};

/**
 * Activity → Connected Devices.
 *
 * Real BLE Heart Rate Service sensors only: a device is shown as connected
 * exclusively because the native plugin confirmed a GATT connection and an
 * active HR notification subscription. Nothing is faked when hardware is
 * absent — the screen explains what each source supports instead.
 */
export const ConnectedDevicesView: React.FC = () => {
  const nativeAvailable = useMemo(() => isNativeWearableAvailable(), []);
  const [state, dispatchUi] = useReducer(
    (state: WearableState, event: Parameters<typeof reduceWearableEvent>[1]) =>
      reduceWearableEvent(state, event, Date.now()),
    initialState,
  );

  // Stale-HR watchdog: an old BPM must degrade to "signal lost", never linger.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!nativeAvailable) return;
    const hrHandle = VjWearable.addListener("heartRateMeasurement", (event) => {
      const reading = normalizeWearableHeartRate(event, Date.now());
      if (reading) dispatchUi({ type: "heart_rate", reading });
    });
    const batteryHandle = VjWearable.addListener("batteryLevelChanged", (event) => {
      const level = normalizeBatteryLevel(event);
      if (level != null) dispatchUi({ type: "battery", percent: level });
    });
    const errorHandle = VjWearable.addListener("sensorError", (event) => {
      if (event && typeof event === "object") {
        const code = (event as Record<string, unknown>).code;
        if (code === "permission_denied") dispatchUi({ type: "permission_denied" });
        else if (code === "bluetooth_unavailable") dispatchUi({ type: "bluetooth_unavailable" });
      }
    });
    const stateHandle = VjWearable.addListener("connectionStateChanged", (event) => {
      const value = event as Record<string, unknown>;
      if (value.state === "connected" && typeof value.deviceId === "string") {
        dispatchUi({
          type: "connected",
          device: { deviceId: value.deviceId, name: typeof value.name === "string" ? value.name : "BLE sensor" },
        });
      } else if (value.state === "disconnected") {
        dispatchUi({ type: "disconnected" });
      }
    });
    return () => {
      void hrHandle.then((h) => h.remove());
      void batteryHandle.then((h) => h.remove());
      void errorHandle.then((h) => h.remove());
      void stateHandle.then((h) => h.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAvailable]);

  const checkBluetooth = useCallback(async () => {
    if (!nativeAvailable) return;
    const support = await VjWearable.isSupported();
    if (!support.supported || !support.bluetoothEnabled) {
      dispatchUi({ type: "bluetooth_unavailable" });
    }
  }, [nativeAvailable]);

  useEffect(() => {
    void checkBluetooth();
  }, [checkBluetooth]);

  const scan = useCallback(async () => {
    if (!nativeAvailable) return;
    const permissions = await VjWearable.checkPermissions();
    if (!permissions.granted) {
      const request = await VjWearable.requestPermissions();
      if (!request.granted) {
        dispatchUi({ type: "permission_denied" });
        return;
      }
    }
    const support = await VjWearable.isSupported();
    if (!support.supported || !support.bluetoothEnabled) {
      dispatchUi({ type: "bluetooth_unavailable" });
      return;
    }
    dispatchUi({ type: "scan_started" });
    try {
      await VjWearable.startScan();
      const result = await VjWearable.getDiscoveredDevices();
      dispatchUi({ type: "devices_discovered", devices: result.devices as DiscoveredDevice[] });
      dispatchUi({ type: "scan_stopped" });
    } catch {
      dispatchUi({ type: "scan_stopped" });
      dispatchUi({ type: "error", message: "Scan failed. Check Bluetooth and permissions." });
    }
  }, [nativeAvailable]);

  const connect = useCallback(async (deviceId: string) => {
    dispatchUi({ type: "connecting", deviceId });
    try {
      const result = await VjWearable.connect({ deviceId });
      dispatchUi({ type: "connected", device: result.device as BleDeviceInfo });
    } catch (error) {
      dispatchUi({ type: "error", message: error instanceof Error ? error.message : "Connection failed" });
      dispatchUi({ type: "disconnected" });
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!state.device) return;
    await VjWearable.disconnect({ deviceId: state.device.deviceId }).catch(() => undefined);
    dispatchUi({ type: "disconnected" });
  }, [state.device]);

  const forget = useCallback(async () => {
    if (!state.device) return;
    await VjWearable.forgetDevice({ deviceId: state.device.deviceId }).catch(() => undefined);
    dispatchUi({ type: "disconnected" });
  }, [state.device]);

  const hrFresh = isHeartRateFresh(state.heartRate, now);
  const hr = hrFresh ? state.heartRate : null;

  return (
    <div className="space-y-4" data-testid="connected-devices">
      {/* Live heart rate summary */}
      <div className="rounded-2xl border border-white/8 bg-[#0B0B0C] p-4">
        <div className="mb-2 flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-[#E62846]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            Heart rate
          </span>
        </div>
        <div className="font-mono text-3xl font-bold text-white" data-testid="wearable-hr-value">
          {hr ? `${hr.bpm}` : "—"}
          {hr && <span className="ml-1 text-sm text-[#8C8C90]">BPM</span>}
        </div>
        <p className="mt-1 text-[10px] font-mono text-[#8C8C90]" data-testid="wearable-hr-status">
          {!hr && state.heartRate
            ? "Sensor signal lost"
            : hr
              ? `Direct Bluetooth sensor${hr.deviceName ? ` · ${hr.deviceName}` : ""}`
              : CONNECTION_LABELS[state.connection] ?? "No sensor connected"}
        </p>
        {state.batteryPercent != null && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[#8C8C90]">
            <BatteryMedium className="h-3 w-3" /> {state.batteryPercent}% battery
          </p>
        )}
        {!nativeAvailable && (
          <p className="mt-2 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] font-mono text-[#8C8C90]">
            Direct Bluetooth sensors are available in the SVJ Android app. On web, Health
            Connect devices still sync their workouts into your history.
          </p>
        )}
      </div>

      {/* Connected device */}
      {state.device && (
        <div className="rounded-2xl border border-[#C81E3A]/30 bg-[#C81E3A]/8 p-4" data-testid="connected-device">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bluetooth className="h-4 w-4 text-[#E62846]" />
              <div>
                <p className="text-xs font-bold text-white">{state.device.name}</p>
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Direct Bluetooth Sensor
                  {state.device.bodySensorLocation ? ` · ${state.device.bodySensorLocation}` : ""}
                </p>
              </div>
            </div>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono uppercase text-emerald-400">
              Connected
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void disconnect()}
              data-testid="wearable-disconnect"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] transition-colors hover:text-white"
            >
              <Unlink className="h-3 w-3" /> Disconnect
            </button>
            <button
              type="button"
              onClick={() => void forget()}
              data-testid="wearable-forget"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] transition-colors hover:text-white"
            >
              <Trash2 className="h-3 w-3" /> Forget
            </button>
          </div>
        </div>
      )}

      {/* Bluetooth sensors */}
      <div className="rounded-2xl border border-white/8 bg-[#0B0B0C] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Watch className="h-4 w-4 text-[#E62846]" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
              Bluetooth Sensors
            </span>
          </div>
          <button
            type="button"
            onClick={() => void scan()}
            disabled={state.scanning}
            data-testid="wearable-scan"
            className="flex items-center gap-1.5 rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/15 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#C81E3A]/25 disabled:opacity-50"
          >
            {state.scanning ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Scanning…
              </>
            ) : (
              <>
                <Search className="h-3 w-3" /> Scan
              </>
            )}
          </button>
        </div>

        {state.error && (
          <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] font-mono text-red-300" data-testid="wearable-error">
            {state.error}
          </p>
        )}

        {state.scanning && state.discovered.length === 0 && (
          <p className="py-3 text-center text-[10px] font-mono text-[#8C8C90]">
            Scanning for heart-rate sensors… Put your strap in pairing mode.
          </p>
        )}

        {state.discovered.map((device) => (
          <div
            key={device.deviceId}
            className="mb-2 flex items-center justify-between rounded-xl border border-white/8 bg-black/40 p-3"
            data-testid={`wearable-device-${device.deviceId}`}
          >
            <div className="flex items-center gap-2">
              <Bluetooth className="h-4 w-4 text-[#8C8C90]" />
              <div>
                <p className="text-xs font-bold text-white">{device.name}</p>
                <p className="text-[9px] font-mono text-[#8C8C90]">
                  {device.hasHeartRateService ? "Heart Rate Service" : "BLE device"}
                  {device.rssi != null ? ` · ${device.rssi} dBm` : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void connect(device.deviceId)}
              data-testid={`wearable-connect-${device.deviceId}`}
              className="rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/15 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
            >
              Connect
            </button>
          </div>
        ))}
      </div>

      {/* Health Connect */}
      <div className="rounded-2xl border border-white/8 bg-[#0B0B0C] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Watch className="h-4 w-4 text-[#E62846]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            Health Connect
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-[#8C8C90]">
          Syncs authorized workouts, heart rate, steps and distance from supported
          Android health and watch apps into SVJ — through Android's Health
          Connect, with the exact permissions you grant. Manage it in{" "}
          <span className="text-white">Profile → Settings → Integrations</span>.
        </p>
      </div>

      {/* Compatibility notes — honest about what works with what */}
      <div className="rounded-2xl border border-white/8 bg-[#0B0B0C] p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#E62846]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            Device compatibility
          </span>
        </div>
        <ul className="space-y-2 text-[11px] leading-relaxed text-[#8C8C90]">
          <li className="flex gap-2">
            <Bluetooth className="mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" />
            <span><span className="text-white">Direct Bluetooth</span> — works with compatible BLE heart-rate sensors that expose the standard Heart Rate Service (most chest straps and many bands).</span>
          </li>
          <li className="flex gap-2">
            <Watch className="mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" />
            <span><span className="text-white">Health Connect</span> — syncs authorized health information from supported Android health/watch apps.</span>
          </li>
          <li className="flex gap-2">
            <Activity className="mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" />
            <span><span className="text-white">Other watches</span> — may require the manufacturer's health app/SDK and may not support direct real-time heart-rate streaming.</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ConnectedDevicesView;
