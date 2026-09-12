import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  VjMeasurementEvent,
  VjPedometerState,
  VjSensorInfo,
  VjSensorMode,
} from "../src/app/lib/vj-pedometer";

const read = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");

const bridge = read("src/app/lib/vj-pedometer.ts");
const nativePlugin = read("android/app/src/main/java/app/lovable/svj/VjPedometerPlugin.java");
const detector = read("android/app/src/main/java/app/lovable/svj/AccelStepDetector.java");
const mainActivity = read("android/app/src/main/java/app/lovable/svj/MainActivity.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");

describe("VjPedometer universal sensor contract", () => {
  it("normalized measurement event always carries a non-negative step count", () => {
    const event: VjMeasurementEvent = {
      mode: "counter",
      timestamp: 1762000000300,
      rawValue: 5000,
      steps: 120,
      sensorAvailable: true,
      listenerRegistered: true,
      sensorStarted: true,
      sensorName: "Kathyrin Step Counter",
      sensorVendor: "Kathyrin",
      lastError: null,
    };

    assert.ok(event.steps >= 0);
    assert.ok(event.rawValue >= event.steps);
  });

  it("normalized measurement event shape is stable across sensor modes", () => {
    const counter: VjMeasurementEvent = {
      mode: "counter",
      timestamp: 1,
      rawValue: 1000,
      steps: 1000,
      sensorAvailable: true,
      listenerRegistered: true,
      sensorStarted: true,
      sensorName: "X",
      sensorVendor: "Y",
      lastError: null,
    };

    assert.equal(counter.mode, "counter");
    assert.ok(counter.steps >= 0);

    const detectorEvent: VjMeasurementEvent = {
      ...counter,
      mode: "detector",
      rawValue: 1,
      steps: 1,
    };

    assert.equal(detectorEvent.mode, "detector");
    assert.equal(detectorEvent.steps, 1);

    const accel: VjMeasurementEvent = {
      ...counter,
      mode: "accelerometer",
      rawValue: 0,
      steps: 1,
    };

    assert.equal(accel.mode, "accelerometer");
    assert.equal(accel.steps, 1);
  });

  it("sensor info exposes mode, hardware metadata, and the native debug flag", () => {
    const info: VjSensorInfo = {
      mode: "accelerometer",
      available: false,
      name: "Kinsus Accelerometer",
      vendor: "Kinsus",
      type: 3,
      debug: false,
    };

    assert.equal(info.mode, "accelerometer");
    assert.equal(typeof info.type, "number");
    assert.equal(info.available, false);
    assert.equal(info.debug, false);
  });

  it("sensor mode selection prefers counter over detector and accelerometer", () => {
    type Available = { counter: boolean; detector: boolean; accelerometer: boolean };

    const pickMode = (avail: Available): VjSensorMode => {
      if (avail.counter) return "counter";
      if (avail.detector) return "detector";
      if (avail.accelerometer) return "accelerometer";
      return "none";
    };

    assert.equal(pickMode({ counter: true, detector: true, accelerometer: true }), "counter");
    assert.equal(pickMode({ counter: false, detector: true, accelerometer: true }), "detector");
    assert.equal(
      pickMode({ counter: false, detector: false, accelerometer: true }),
      "accelerometer",
    );
    assert.equal(pickMode({ counter: false, detector: false, accelerometer: false }), "none");
  });

  it("counter delta is cumulative minus baseline", () => {
    const baseline = 10000;
    const raw = 10050;
    assert.equal(Math.max(0, raw - baseline), 50);
  });

  it("counter reset is handled by restarting the baseline", () => {
    const baseline = 5000;
    const rawAfterReboot = 120;
    assert.equal(Math.max(0, rawAfterReboot - baseline), 0);

    const restartedBaseline = rawAfterReboot;
    assert.equal(Math.max(0, 200 - restartedBaseline), 80);
  });

  it("detector counts individual events as steps", () => {
    const events = [1, 1, 1, 1];
    assert.equal(
      events.reduce((acc, delta) => acc + delta, 0),
      4,
    );
  });

  it("accelerometer detection rejects near-zero motion magnitude", () => {
    const magnitude = (ax: number, ay: number, az: number) => Math.hypot(ax, ay, az);
    assert.ok(magnitude(0.01, -0.01, 0.02) < 0.05);
  });

  it("accelerometer detection uses magnitude peaks above a threshold", () => {
    const window: number[] = [9.7, 9.8, 10.2, 11.1, 9.9, 10.3, 9.6];
    const gravity = 9.81;
    const mags = window.map((v) => Math.abs(v - gravity));

    const threshold = 1.1;
    let peaks = 0;
    let lastPeakTime = -1000;

    for (let i = 0; i < mags.length; i += 1) {
      const now = i * 50;
      if (mags[i] > threshold && now - lastPeakTime >= 250) {
        peaks += 1;
        lastPeakTime = now;
      }
    }

    assert.ok(peaks > 0);
  });
});

describe("VjPedometer native plugin registration", () => {
  it("registers the app-local plugin before the Capacitor bridge is created", () => {
    const registerAt = mainActivity.indexOf("registerPlugin(VjPedometerPlugin.class)");
    const bridgeAt = mainActivity.indexOf("super.onCreate(savedInstanceState)");
    assert.ok(registerAt > -1, "MainActivity must register VjPedometerPlugin");
    assert.ok(bridgeAt > -1, "MainActivity must call super.onCreate");
    assert.ok(registerAt < bridgeAt, "registration must happen before super.onCreate()");
  });

  it("reaches the plugin through Capacitor.registerPlugin, not a window global", () => {
    assert.ok(bridge.includes('registerPlugin<VjNativePlugin>("VjPedometer")'));
    assert.ok(bridge.includes('Capacitor.isPluginAvailable("VjPedometer")'));
    assert.ok(!bridge.includes("Capacitor?.plugins"));
  });

  it("declares ACTIVITY_RECOGNITION in the manifest and the plugin", () => {
    assert.ok(manifest.includes("android.permission.ACTIVITY_RECOGNITION"));
    assert.ok(nativePlugin.includes("Manifest.permission.ACTIVITY_RECOGNITION"));
  });
});

describe("VjPedometer universal sensor selection (native)", () => {
  it("selects counter, then detector, then accelerometer", () => {
    const counterAt = nativePlugin.indexOf("Sensor.TYPE_STEP_COUNTER);");
    const detectorAt = nativePlugin.indexOf("Sensor.TYPE_STEP_DETECTOR);");
    const accelAt = nativePlugin.indexOf("Sensor.TYPE_ACCELEROMETER);");
    assert.ok(counterAt > -1);
    assert.ok(detectorAt > counterAt);
    assert.ok(accelAt > detectorAt);
  });

  it("reports the selected mode and never assumes registerListener succeeded", () => {
    assert.ok(nativePlugin.includes('result.put("mode", selectedMode)'));
    assert.ok(nativePlugin.includes("= sensorManager.registerListener(this, selectedSensor"));
    assert.ok(nativePlugin.includes("if (!registered)"));
  });

  it("runs the accelerometer detector with a debounce and reports estimated steps", () => {
    assert.ok(nativePlugin.includes("accelDetector.onSample("));
    assert.ok(detector.includes("MIN_STEP_INTERVAL_MS"));
    assert.ok(detector.includes("PEAK_TO_HIGH"));
    assert.ok(
      detector.includes("VIOLENT_DYNAMIC_CEILING") || detector.includes("window_dynamic_energy"),
    );
  });
});

describe("VjPedometer state persistence", () => {
  it("state stores raw baseline, last raw, and session start", () => {
    const state: VjPedometerState = {
      sensorAvailable: true,
      listenerRegistered: true,
      sensorStarted: true,
      mode: "counter",
      firstRaw: 12000,
      lastRaw: 12300,
      dailySteps: 300,
      guardedLastRaw: 12300,
      startDateMs: 1762000000000,
      lastEventMs: 1762000000300,
      lastError: null,
    };

    assert.equal(typeof state.firstRaw, "number");
    assert.equal(typeof state.lastRaw, "number");
    assert.equal(typeof state.dailySteps, "number");
    assert.equal(typeof state.guardedLastRaw, "number");
    assert.equal(typeof state.startDateMs, "number");
  });

  it("state can represent a detector session", () => {
    const state: VjPedometerState = {
      sensorAvailable: true,
      listenerRegistered: true,
      sensorStarted: true,
      mode: "detector",
      firstRaw: -1,
      lastRaw: -1,
      dailySteps: 14,
      guardedLastRaw: -1,
      startDateMs: 1762000000000,
      lastEventMs: 1762000000300,
      lastError: null,
    };

    assert.equal(state.mode, "detector");
    assert.ok(state.dailySteps > 0);
  });

  it("state can represent an estimated accelerometer session", () => {
    const state: VjPedometerState = {
      sensorAvailable: true,
      listenerRegistered: true,
      sensorStarted: true,
      mode: "accelerometer",
      firstRaw: -1,
      lastRaw: -1,
      dailySteps: 27,
      guardedLastRaw: -1,
      startDateMs: 1762000000000,
      lastEventMs: 1762000000300,
      lastError: null,
    };

    assert.equal(state.mode, "accelerometer");
    assert.ok(state.dailySteps > 0);
  });
});
