import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react";
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
import {
  WEAR_CAPABILITY_LABELS,
  WEAR_CONNECTION_LABELS,
  describeWearCapabilities,
  getHeartRateSourcePreference,
  isNativeWearAvailable,
  setHeartRateSourcePreference,
  subscribeHeartRateSourcePreference,
  wearConnectionState,
  VjWear,
  type HeartRateSourcePreference,
} from "../lib/wearOs";
import { getWearCompanionSnapshot, subscribeWearCompanion } from "../lib/wearCompanion";

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
          device: {
            deviceId: value.deviceId,
            name: typeof value.name === "string" ? value.name : "BLE sensor",
          },
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
      dispatchUi({
        type: "error",
        message: error instanceof Error ? error.message : "Connection failed",
      });
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
      <WearDevicesSection now={now} />

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
              : (CONNECTION_LABELS[state.connection] ?? "No sensor connected")}
        </p>
        {state.batteryPercent != null && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[#8C8C90]">
            <BatteryMedium className="h-3 w-3" /> {state.batteryPercent}% battery
          </p>
        )}
        {!nativeAvailable && (
          <p className="mt-2 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] font-mono text-[#8C8C90]">
            Direct Bluetooth sensors are available in the SVJ Android app. On web, Health Connect
            devices still sync their workouts into your history.
          </p>
        )}
      </div>

      {/* Connected device */}
      {state.device && (
        <div
          className="rounded-2xl border border-[#C81E3A]/30 bg-[#C81E3A]/8 p-4"
          data-testid="connected-device"
        >
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
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] transition-colors hover:text-white"
            >
              <Unlink className="h-3 w-3" /> Disconnect
            </button>
            <button
              type="button"
              onClick={() => void forget()}
              data-testid="wearable-forget"
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] transition-colors hover:text-white"
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
            className="flex items-center gap-1.5 rounded-2xl border border-[#C81E3A]/40 bg-[#C81E3A]/15 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#C81E3A]/25 disabled:opacity-50"
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
          <p
            className="mb-2 rounded-lg border border-crimson/30 bg-crimson/10 px-2 py-1.5 text-[10px] font-mono text-crimson"
            data-testid="wearable-error"
          >
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
            className="mb-2 flex items-center justify-between rounded-2xl border border-white/8 bg-black/40 p-3"
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
              className="rounded-2xl border border-[#C81E3A]/40 bg-[#C81E3A]/15 px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
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
          Syncs authorized workouts, heart rate, steps and distance from supported Android health
          and watch apps into SVJ — through Android's Health Connect, with the exact permissions you
          grant. Manage it in <span className="text-white">Profile → Settings → Integrations</span>.
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
            <span>
              <span className="text-white">Direct Bluetooth</span> — works with compatible BLE
              heart-rate sensors that expose the standard Heart Rate Service (most chest straps and
              many bands).
            </span>
          </li>
          <li className="flex gap-2">
            <Watch className="mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" />
            <span>
              <span className="text-white">Health Connect</span> — syncs authorized health
              information from supported Android health/watch apps.
            </span>
          </li>
          <li className="flex gap-2">
            <Activity className="mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" />
            <span>
              <span className="text-white">Other watches</span> — may require the manufacturer's
              health app/SDK and may not support direct real-time heart-rate streaming.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};

const HEART_RATE_SOURCE_OPTIONS: {
  value: HeartRateSourcePreference;
  label: string;
  hint: string;
}[] = [
  { value: "auto", label: "Automatic", hint: "Bluetooth strap first, then SVJ Watch" },
  { value: "ble", label: "Bluetooth sensor", hint: "Always prefer the chest strap" },
  { value: "wear_os", label: "SVJ Watch", hint: "Always prefer the watch" },
];

function lastSeenLabel(ageMs: number | null): string {
  if (ageMs == null) return "Never";
  const seconds = Math.round(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

/**
 * My Devices → SVJ Watch, plus the live heart-rate source selector.
 *
 * The watch row is driven entirely by what the Wear OS Data Layer actually
 * reports: an app that is merely installed is never shown as connected, and
 * capabilities come from the watch's own declaration rather than from a model
 * name.
 */
const WearDevicesSection: React.FC<{ now: number }> = ({ now }) => {
  const companion = useSyncExternalStore(subscribeWearCompanion, getWearCompanionSnapshot);
  const preference = useSyncExternalStore(
    subscribeHeartRateSourcePreference,
    getHeartRateSourcePreference,
  );
  const nativeWear = useMemo(() => isNativeWearAvailable(), []);
  const connection = wearConnectionState(companion.status, now);
  const capabilities = describeWearCapabilities(companion.status.capabilities);
  const workout = companion.workout;

  const stopWatchWorkout = useCallback(async () => {
    await VjWear.sendCommand?.({ type: "finish", sessionId: workout?.sessionId }).catch(
      () => undefined,
    );
  }, [workout?.sessionId]);

  return (
    <div className="rounded-2xl border border-white/8 bg-[#0B0B0C] p-4" data-testid="wear-devices">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Watch className="h-4 w-4 text-[#E62846]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
            My devices
          </span>
        </div>
        <span
          className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]"
          data-testid="wear-connection"
        >
          {WEAR_CONNECTION_LABELS[connection]}
        </span>
      </div>

      <div
        className="rounded-2xl border border-white/8 bg-black/40 p-3"
        data-testid="wear-watch-card"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-white">SVJ Watch</p>
            <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
              Wear OS companion
            </p>
          </div>
          {connection === "connected" && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono uppercase text-emerald-400">
              Live
            </span>
          )}
        </div>

        <dl className="mt-3 space-y-1 text-[10px] font-mono text-[#8C8C90]">
          <div className="flex justify-between gap-2">
            <dt>Capabilities</dt>
            <dd className="text-right text-white">
              {capabilities.length > 0
                ? capabilities.map((key) => WEAR_CAPABILITY_LABELS[key]).join(" • ")
                : "None reported"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Last seen</dt>
            <dd className="text-right text-white">
              {lastSeenLabel(companion.status.lastSeenAgeMs)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Workout</dt>
            <dd className="text-right text-white" data-testid="wear-workout-state">
              {workout
                ? `${workout.state}${workout.heartRate != null ? ` · ${workout.heartRate} bpm` : ""}`
                : "No active watch workout"}
            </dd>
          </div>
        </dl>

        {workout && (
          <button
            type="button"
            onClick={() => void stopWatchWorkout()}
            data-testid="wear-stop-workout"
            className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] transition-colors hover:text-white"
          >
            Finish watch workout
          </button>
        )}

        {connection === "companion_missing" && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] font-mono leading-relaxed text-[#8C8C90]">
            <p data-testid="wear-companion-missing">SVJ is not installed on your watch.</p>
            <a
              href="https://play.google.com/store/apps/details?id=app.lovable.svj"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="wear-install-on-watch"
              className="mt-2 inline-flex w-full items-center justify-center rounded-2xl border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#FF4D6D] transition-colors hover:bg-[#C81E3A]/25"
            >
              Install on watch
            </a>
            <p className="mt-1.5">
              On a paired Wear OS watch the Play Store offers SVJ for the watch automatically.
              Pairing over Bluetooth alone is not enough.
            </p>
          </div>
        )}
        {connection === "unavailable" && (
          <p className="mt-3 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px] font-mono leading-relaxed text-[#8C8C90]">
            {nativeWear
              ? "Wear OS is not available on this device."
              : "The SVJ Watch bridge runs in the SVJ Android app. Open SVJ on your phone to connect your watch."}
          </p>
        )}
        {connection === "reconnecting" && (
          <p className="mt-3 rounded-lg border border-gold/30 bg-gold/10 px-2 py-1.5 text-[10px] font-mono leading-relaxed text-gold">
            The watch is out of range. A running watch workout keeps recording on the watch and
            syncs when it reconnects.
          </p>
        )}
      </div>

      {/* Heart-rate source selection: both transports can be live at once, so
          the user decides, and only the selected source feeds the workout. */}
      <div className="mt-3">
        <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]">
          Heart rate source
        </p>
        <div className="space-y-1" role="radiogroup" aria-label="Heart rate source">
          {HEART_RATE_SOURCE_OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`hr-source-${option.value}`}
                onClick={() => setHeartRateSourcePreference(option.value)}
                className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors ${
                  selected
                    ? "border-[#C81E3A]/50 bg-[#C81E3A]/15"
                    : "border-white/8 bg-black/40 hover:border-white/20"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    selected ? "bg-[#E62846]" : "border border-white/30"
                  }`}
                />
                <span className="flex-1">
                  <span className="block text-[11px] font-bold text-white">{option.label}</span>
                  <span className="block text-[9px] font-mono text-[#8C8C90]">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ConnectedDevicesView;
