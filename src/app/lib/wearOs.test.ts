// ============================================================================
// SVJ WEARABLES V2 — regression coverage for the Wear OS protocol layer.
//
// Everything here is pure: capability discovery, measurement validation,
// session state machine, heart-rate statistics, source arbitration and
// duplicate-completion protection. No hardware is required and no production
// data is faked.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_HEART_RATE_STATS,
  NO_WEAR_CAPABILITIES,
  WEAR_PROTOCOL_VERSION,
  accumulateHeartRate,
  chooseHeartRateSource,
  chooseStepCount,
  createWearWorkoutSnapshot,
  describeWearCapabilities,
  isWearSummaryAlreadyImported,
  normalizeNativeWearEvents,
  normalizeWearCapabilities,
  normalizeWearCompanionStatus,
  normalizeWearHandshake,
  normalizeWearMeasurement,
  normalizeWearStateMessage,
  normalizeWearSummary,
  reduceWearWorkout,
  wearClientSessionId,
  wearConnectionState,
  wearExternalId,
  wearMeasurementToHeartRate,
} from "./wearOs";
import type { HeartRateCandidate } from "./wearOs";
import type { LiveHeartRate } from "./bleHeartRate";

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);

function hr(bpm: number, atMs = NOW): LiveHeartRate {
  return { bpm, timestampMs: atMs, source: "ble" };
}

function candidate(reading: LiveHeartRate | null, lastSampleMs: number | null): HeartRateCandidate {
  return { reading, lastSampleMs };
}

describe("wear capabilities", () => {
  it("only reports capabilities the watch actually declared", () => {
    const capabilities = normalizeWearCapabilities({
      heart_rate: true,
      workout: true,
      steps: "yes",
    });
    assert.deepEqual(capabilities, {
      heart_rate: true,
      steps: false,
      workout: true,
      distance: false,
      calories: false,
    });
    assert.deepEqual(describeWearCapabilities(capabilities), ["heart_rate", "workout"]);
  });

  it("never invents capabilities from a device name or model", () => {
    assert.deepEqual(normalizeWearCapabilities({ deviceName: "Galaxy Watch 6", model: "SM-R9" }), {
      ...NO_WEAR_CAPABILITIES,
    });
    assert.deepEqual(normalizeWearCapabilities(null), { ...NO_WEAR_CAPABILITIES });
  });
});

describe("wear companion status", () => {
  it("distinguishes 'app not installed' from 'not connected'", () => {
    const missing = normalizeWearCompanionStatus(
      { available: true, installed: false, connected: false },
      NOW,
    );
    assert.equal(wearConnectionState(missing, NOW), "companion_missing");

    const disconnected = normalizeWearCompanionStatus(
      { available: true, installed: true, connected: false },
      NOW,
    );
    assert.equal(wearConnectionState(disconnected, NOW), "disconnected");
  });

  it("reports reconnecting while the watch is silently away and live when reachable", () => {
    const connected = normalizeWearCompanionStatus(
      { available: true, installed: true, connected: true, capabilities: { heart_rate: true } },
      NOW,
    );
    assert.equal(wearConnectionState(connected, NOW), "connected");
    assert.equal(connected.capabilities.heart_rate, true);

    const away = normalizeWearCompanionStatus(
      { available: true, installed: true, connected: false, lastSeenMs: NOW - 5_000 },
      NOW,
    );
    assert.equal(wearConnectionState(away, NOW), "reconnecting");

    const stale = normalizeWearCompanionStatus(
      { available: true, installed: true, connected: false, lastSeenMs: NOW - 10 * 60_000 },
      NOW + 10 * 60_000,
    );
    assert.equal(wearConnectionState(stale, NOW + 10 * 60_000), "disconnected");
  });

  it("treats a platform without the Data Layer as unavailable", () => {
    const status = normalizeWearCompanionStatus({ available: false }, NOW);
    assert.equal(wearConnectionState(status, NOW), "unavailable");
  });
});

describe("wear measurement validation", () => {
  it("accepts plausible measurements with a real timestamp", () => {
    const measurement = normalizeWearMeasurement(
      { type: "heart_rate", value: 148.4, timestamp: NOW - 1000, sessionId: "sess-1" },
      NOW,
    );
    assert.ok(measurement);
    assert.equal(measurement.type, "heart_rate");
    assert.equal(measurement.value, 148);
    assert.equal(measurement.source, "wear_os");
    assert.equal(measurement.timestampMs, NOW - 1000);
  });

  it("rejects malformed, out-of-range and stale packets", () => {
    assert.equal(normalizeWearMeasurement(null, NOW), null);
    assert.equal(normalizeWearMeasurement({ type: "spo2", value: 98 }, NOW), null);
    assert.equal(normalizeWearMeasurement({ type: "heart_rate", value: 400 }, NOW), null);
    assert.equal(normalizeWearMeasurement({ type: "heart_rate", value: 0 }, NOW), null);
    assert.equal(normalizeWearMeasurement({ type: "heart_rate", value: Number.NaN }, NOW), null);
    assert.equal(
      normalizeWearMeasurement(
        { type: "heart_rate", value: 140, timestamp: NOW + 60 * 60_000 },
        NOW,
      ),
      null,
      "a timestamp an hour in the future is not a live sample",
    );
    assert.equal(
      normalizeWearMeasurement(
        { type: "heart_rate", value: 140, timestamp: NOW - 10 * 60_000 },
        NOW,
      ),
      null,
      "a ten-minute-old sample is not live data",
    );
  });

  it("never estimates SpO2, blood pressure or ECG", () => {
    for (const type of ["spo2", "blood_pressure", "ecg"]) {
      assert.equal(normalizeWearMeasurement({ type, value: 120 }, NOW), null);
    }
  });

  it("converts an accepted sample into the shared live-HR shape", () => {
    const measurement = normalizeWearMeasurement({ type: "heart_rate", value: 152 }, NOW);
    assert.ok(measurement);
    const reading = wearMeasurementToHeartRate(measurement);
    assert.ok(reading);
    assert.equal(reading.bpm, 152);
    assert.equal(reading.source, "wear_os");
    assert.equal(reading.deviceName, "SVJ Watch");
    assert.equal(wearMeasurementToHeartRate({ ...measurement, type: "steps" }), null);
  });
});

describe("heart-rate statistics", () => {
  it("tracks current, average, maximum and sample count from real samples only", () => {
    let stats = { ...EMPTY_HEART_RATE_STATS };
    for (const bpm of [140, 150, 160]) stats = accumulateHeartRate(stats, bpm);
    assert.equal(stats.current, 160);
    assert.equal(stats.average, 150);
    assert.equal(stats.maximum, 160);
    assert.equal(stats.sampleCount, 3);
  });

  it("rejects impossible values instead of averaging them in", () => {
    let stats = { ...EMPTY_HEART_RATE_STATS };
    stats = accumulateHeartRate(stats, 150);
    stats = accumulateHeartRate(stats, 9000);
    stats = accumulateHeartRate(stats, -5);
    assert.equal(stats.sampleCount, 1);
    assert.equal(stats.average, 150);
  });

  it("never fabricates a value between samples", () => {
    assert.deepEqual(EMPTY_HEART_RATE_STATS, {
      current: null,
      average: null,
      maximum: null,
      sampleCount: 0,
    });
  });
});

describe("watch workout session state machine", () => {
  const started = createWearWorkoutSnapshot("sess-aaaa-bbbb", "running", NOW);

  it("start → pause → resume → finish with correct moving semantics", () => {
    let snapshot = reduceWearWorkout(started, { type: "start", atMs: NOW });
    assert.equal(snapshot.state, "running");
    snapshot = reduceWearWorkout(snapshot, { type: "tick", atMs: NOW + 60_000 });
    assert.equal(snapshot.elapsedSeconds, 60);
    snapshot = reduceWearWorkout(snapshot, { type: "pause", atMs: NOW + 60_000 });
    assert.equal(snapshot.state, "paused");
    // A pause is not a new session and does not lose accumulated data.
    assert.equal(snapshot.sessionId, started.sessionId);
    snapshot = reduceWearWorkout(snapshot, { type: "resume", atMs: NOW + 90_000 });
    assert.equal(snapshot.state, "running");
    snapshot = reduceWearWorkout(snapshot, { type: "finish", atMs: NOW + 120_000 });
    assert.equal(snapshot.state, "finished");
    assert.equal(snapshot.endedAtMs, NOW + 120_000);
  });

  it("ignores illegal transitions and terminal finishes", () => {
    const running = reduceWearWorkout(started, { type: "start", atMs: NOW });
    assert.equal(reduceWearWorkout(running, { type: "start", atMs: NOW }).state, "running");
    assert.equal(reduceWearWorkout(started, { type: "pause", atMs: NOW }).state, "idle");
    assert.equal(reduceWearWorkout(started, { type: "resume", atMs: NOW }).state, "idle");
    const finished = reduceWearWorkout(running, { type: "finish", atMs: NOW + 1000 });
    assert.equal(
      reduceWearWorkout(finished, { type: "start", atMs: NOW + 2000 }).state,
      "finished",
    );
    assert.equal(
      reduceWearWorkout(finished, { type: "resume", atMs: NOW + 2000 }).state,
      "finished",
    );
  });

  it("folds measurements in and keeps the session id stable", () => {
    const running = reduceWearWorkout(started, { type: "start", atMs: NOW });
    const measurement = normalizeWearMeasurement({ type: "heart_rate", value: 149 }, NOW);
    assert.ok(measurement);
    const next = reduceWearWorkout(running, { type: "measurement", measurement });
    assert.equal(next.heartRate.current, 149);
    assert.equal(next.sessionId, running.sessionId);
  });

  it("ignores measurements outside an active session", () => {
    const measurement = normalizeWearMeasurement({ type: "heart_rate", value: 149 }, NOW);
    assert.ok(measurement);
    assert.equal(
      reduceWearWorkout(started, { type: "measurement", measurement }).heartRate.current,
      null,
    );
  });
});

describe("completion summaries", () => {
  const rawSummary = {
    sessionId: "svj-wear-abc12345",
    activityType: "running",
    startedAtMs: NOW - 1_800_000,
    endedAtMs: NOW - 30_000,
    durationSeconds: 1770,
    movingSeconds: 1700,
    stepCount: 3200,
    avgHeartRate: 150,
    maxHeartRate: 181,
    heartRateSampleCount: 1700,
  };

  it("normalizes a valid summary and keeps real values only", () => {
    const summary = normalizeWearSummary(rawSummary, NOW);
    assert.ok(summary);
    assert.equal(summary.activityType, "running");
    assert.equal(summary.durationSeconds, 1770);
    assert.equal(summary.avgHeartRate, 150);
    assert.equal(summary.maxHeartRate, 181);
    assert.equal(summary.source, "wear_os");
    assert.equal(
      summary.distanceMeters,
      null,
      "the watch reported no distance, so none is invented",
    );
    assert.equal(summary.caloriesEstimate, null);
  });

  it("re-derives HR statistics from the accepted samples when they are available", () => {
    const samples = [140, 160, 180]
      .map((bpm) =>
        normalizeWearMeasurement(
          {
            type: "heart_rate",
            value: bpm,
            sessionId: rawSummary.sessionId,
            timestamp: NOW - 1000,
          },
          NOW,
        ),
      )
      .filter((entry) => entry != null);
    const summary = normalizeWearSummary(rawSummary, NOW, samples);
    assert.ok(summary);
    assert.equal(summary.avgHeartRate, 160);
    assert.equal(summary.maxHeartRate, 180);
    assert.equal(summary.heartRateSampleCount, 3);
  });

  it("rejects summaries with a broken session, time or activity type", () => {
    assert.equal(normalizeWearSummary({ ...rawSummary, sessionId: "x" }, NOW), null);
    assert.equal(normalizeWearSummary({ ...rawSummary, activityType: "swimming" }, NOW), null);
    assert.equal(
      normalizeWearSummary({ ...rawSummary, endedAtMs: rawSummary.startedAtMs }, NOW),
      null,
    );
    assert.equal(
      normalizeWearSummary({ ...rawSummary, startedAtMs: NOW - 10_000, endedAtMs: NOW }, NOW),
      null,
      "a ten-second watch session is not a workout",
    );
    assert.equal(normalizeWearSummary({ ...rawSummary, endedAtMs: NOW + 45 * 60_000 }, NOW), null);
  });

  it("produces stable ids so a repeated completion is never a second activity", () => {
    assert.equal(
      wearClientSessionId("svj-wear-abc12345"),
      wearClientSessionId("svj-wear-abc12345"),
    );
    assert.equal(wearExternalId("svj-wear-abc12345"), wearExternalId("svj-wear-abc12345"));
    assert.match(wearClientSessionId("svj-wear-abc12345"), /^svj-wear-/);
    const summary = normalizeWearSummary(rawSummary, NOW);
    assert.ok(summary);
    assert.equal(isWearSummaryAlreadyImported(summary, []), false);
    assert.equal(
      isWearSummaryAlreadyImported(summary, [{ sessionId: rawSummary.sessionId }]),
      true,
    );
    assert.equal(isWearSummaryAlreadyImported(summary, [{ sessionId: "other" }]), false);
  });
});

describe("heart-rate source arbitration", () => {
  const freshBle = candidate(hr(120), NOW - 1000);
  const freshWear = candidate({ ...hr(150), source: "wear_os" }, NOW - 1000);
  const staleWear = candidate(
    { ...hr(150), timestampMs: NOW - 60_000, source: "wear_os" },
    NOW - 60_000,
  );

  it("prefers an explicitly selected source while it is healthy", () => {
    const selection = chooseHeartRateSource(
      { preferred: "wear_os", ble: freshBle, wear: freshWear },
      NOW,
    );
    assert.equal(selection.source, "wear_os");
    assert.equal(selection.degraded, false);

    const bleOnly = chooseHeartRateSource(
      { preferred: "ble", ble: freshBle, wear: freshWear },
      NOW,
    );
    assert.equal(bleOnly.source, "ble");
  });

  it("degrades explicitly but keeps showing the other source", () => {
    const selection = chooseHeartRateSource(
      { preferred: "wear_os", ble: freshBle, wear: staleWear },
      NOW,
    );
    assert.equal(selection.source, "ble");
    assert.equal(selection.degraded, true);

    const dead = chooseHeartRateSource(
      { preferred: "wear_os", ble: candidate(null, null), wear: staleWear },
      NOW,
    );
    assert.equal(dead.source, null);
    assert.equal(dead.reading, null);
  });

  it("automatic priority is direct BLE, then the watch, then nothing", () => {
    assert.equal(
      chooseHeartRateSource({ preferred: null, ble: freshBle, wear: freshWear }, NOW).source,
      "ble",
    );
    assert.equal(
      chooseHeartRateSource({ preferred: null, ble: candidate(null, null), wear: freshWear }, NOW)
        .source,
      "wear_os",
    );
    assert.equal(
      chooseHeartRateSource(
        { preferred: null, ble: candidate(null, null), wear: candidate(null, null) },
        NOW,
      ).source,
      null,
    );
  });

  it("stale heart rate is never presented as live", () => {
    const selection = chooseHeartRateSource(
      {
        preferred: null,
        ble: candidate({ ...hr(120), timestampMs: NOW - 60_000 }, NOW - 60_000),
        wear: candidate(null, null),
      },
      NOW,
    );
    assert.equal(selection.reading, null);
  });
});

describe("step double counting", () => {
  it("uses either the watch counter or the phone pedometer, never their sum", () => {
    assert.equal(chooseStepCount({ wearSteps: 900, phoneSteps: 1200, wearActive: true }), 900);
    assert.equal(chooseStepCount({ wearSteps: 900, phoneSteps: 1200, wearActive: false }), 1200);
    assert.equal(chooseStepCount({ wearSteps: null, phoneSteps: 1200, wearActive: true }), 1200);
    assert.equal(chooseStepCount({ wearSteps: 0, phoneSteps: 0, wearActive: true }), 0);
  });
});

describe("native event normalization", () => {
  it("parses JSON string payloads from the Data Layer", () => {
    const events = normalizeNativeWearEvents(
      [
        {
          type: "sample",
          id: "e1",
          sessionId: "sess-1",
          payload: JSON.stringify({ type: "heart_rate", value: 151, timestamp: NOW - 500 }),
          receivedAtMs: NOW,
        },
        { type: "nonsense", id: "e2", payload: "{}" },
        { type: "summary", id: "", payload: "{}" },
        { type: "summary", id: "e3", payload: "not-json" },
      ],
      NOW,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]!.id, "e1");
    assert.deepEqual(events[0]!.payload, { type: "heart_rate", value: 151, timestamp: NOW - 500 });
  });

  it("reads handshake and state messages without trusting unknown values", () => {
    const handshake = normalizeWearHandshake({
      protocol: WEAR_PROTOCOL_VERSION,
      capabilities: { heart_rate: true, steps: true, workout: true },
      sessionId: "sess-1",
      state: "running",
    });
    assert.ok(handshake);
    assert.equal(handshake.protocol, 1);
    assert.equal(handshake.capabilities.heart_rate, true);
    assert.equal(handshake.state, "running");
    assert.equal(normalizeWearHandshake("garbage"), null);

    const state = normalizeWearStateMessage({
      sessionId: "svj-wear-session-1",
      state: "paused",
      heartRate: 900,
    });
    assert.ok(state);
    assert.equal(state.state, "paused");
    assert.equal(state.heartRate, null, "an implausible BPM is not surfaced");
    assert.equal(
      normalizeWearStateMessage({ sessionId: "svj-wear-session-1", state: "dancing" }),
      null,
    );
    assert.equal(normalizeWearStateMessage({ sessionId: "short", state: "running" }), null);
  });
});
