import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHeartRateFresh, parseHeartRateMeasurement, HR_STALE_MS } from "./bleHeartRate";
import {
  heartRateLost,
  normalizeBatteryLevel,
  normalizeWearableHeartRate,
  reduceWearableEvent,
  type WearableState,
} from "./wearable";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("BLE heart rate parsing (Bluetooth SIG 0x2A37)", () => {
  it("parses an 8-bit heart rate packet", () => {
    const result = parseHeartRateMeasurement(bytes(0x00, 143));
    assert.ok(result);
    assert.equal(result.bpm, 143);
    assert.equal(result.sensorContact, "unsupported");
    assert.equal(result.energyExpendedJoules, undefined);
    assert.equal(result.rrIntervalsMs, undefined);
  });

  it("parses a 16-bit heart rate packet", () => {
    const result = parseHeartRateMeasurement(bytes(0x01, 0x8f, 0x00));
    assert.ok(result);
    assert.equal(result.bpm, 143);
  });

  it("parses energy expended only when the flag is set", () => {
    const result = parseHeartRateMeasurement(bytes(0x11, 0x8f, 0x00, 0x38, 0x02));
    assert.ok(result);
    assert.equal(result.bpm, 143);
    assert.equal(result.energyExpendedJoules, 568);
  });

  it("parses RR intervals in milliseconds", () => {
    const result = parseHeartRateMeasurement(bytes(0x21, 0x8f, 0x00, 0x00, 0x04));
    assert.ok(result);
    assert.deepEqual(result.rrIntervalsMs, [1000]);
  });

  it("rejects malformed packets without guessing", () => {
    assert.equal(parseHeartRateMeasurement(new Uint8Array(0)), null);
    assert.equal(parseHeartRateMeasurement(bytes(0x00)), null);
    // 16-bit flag but truncated value
    assert.equal(parseHeartRateMeasurement(bytes(0x01, 0x8f)), null);
    // energy flag but truncated energy field (flags + hr + 1 energy byte)
    assert.equal(parseHeartRateMeasurement(bytes(0x10, 0x8f, 0x38)), null);
    // impossible BPM
    assert.equal(parseHeartRateMeasurement(bytes(0x00, 0x00)), null);
    assert.equal(parseHeartRateMeasurement(bytes(0x00, 0xff, 0x7f)), null);
  });

  it("distinguishes sensor contact states", () => {
    assert.equal(parseHeartRateMeasurement(bytes(0x0a, 120))?.sensorContact, "supported_contact");
    assert.equal(
      parseHeartRateMeasurement(bytes(0x08, 120))?.sensorContact,
      "supported_no_contact",
    );
    assert.equal(
      parseHeartRateMeasurement(bytes(0x04, 120))?.sensorContact,
      "not_supported_or_no_contact",
    );
  });
});

describe("stale heart rate handling", () => {
  const reading = { bpm: 143, timestampMs: 1_000, source: "ble" as const };

  it("keeps a fresh reading", () => {
    assert.equal(isHeartRateFresh(reading, 1_000 + HR_STALE_MS), true);
  });

  it("drops a stale reading", () => {
    assert.equal(isHeartRateFresh(reading, 1_000 + HR_STALE_MS + 1), false);
  });

  it("reducer holds the stale reading; heartRateLost flags it for the UI", () => {
    let state: WearableState = {
      connection: "connected",
      scanning: false,
      discovered: [],
      device: { deviceId: "aa", name: "Strap" },
      heartRate: reading,
      batteryPercent: null,
      error: null,
    };
    assert.equal(heartRateLost(state, 1_000 + HR_STALE_MS + 1), true);
    // A new measurement restores freshness
    state = reduceWearableEvent(
      state,
      { type: "heart_rate", reading: { ...reading, bpm: 151, timestampMs: 99_000 } },
      99_000,
    );
    assert.equal(state.heartRate?.bpm, 151);
    assert.equal(heartRateLost(state, 99_500), false);
  });
});

describe("wearable connection lifecycle reducer", () => {
  const base: WearableState = {
    connection: "disconnected",
    scanning: false,
    discovered: [],
    device: null,
    heartRate: null,
    batteryPercent: null,
    error: null,
  };

  it("moves through scan → discovered → connecting → connected", () => {
    let state = reduceWearableEvent(base, { type: "scan_started" }, 0);
    assert.equal(state.scanning, true);
    state = reduceWearableEvent(
      state,
      {
        type: "devices_discovered",
        devices: [{ deviceId: "aa", name: "Strap", rssi: -60, hasHeartRateService: true }],
      },
      1,
    );
    assert.equal(state.discovered.length, 1);
    state = reduceWearableEvent(state, { type: "connecting", deviceId: "aa" }, 2);
    assert.equal(state.connection, "connecting");
    state = reduceWearableEvent(
      state,
      { type: "connected", device: { deviceId: "aa", name: "Strap" } },
      3,
    );
    assert.equal(state.connection, "connected");
    assert.equal(state.device?.deviceId, "aa");
  });

  it("handles disconnect, permission denial and bluetooth unavailability", () => {
    let state = reduceWearableEvent(
      base,
      { type: "connected", device: { deviceId: "aa", name: "Strap" } },
      0,
    );
    state = reduceWearableEvent(
      state,
      { type: "heart_rate", reading: { bpm: 140, timestampMs: 1, source: "ble" } },
      1,
    );
    state = reduceWearableEvent(state, { type: "disconnected" }, 2);
    assert.equal(state.connection, "disconnected");
    assert.equal(state.device, null);
    assert.equal(state.heartRate, null);
    assert.equal(
      reduceWearableEvent(base, { type: "permission_denied" }, 0).connection,
      "permission_denied",
    );
    assert.equal(
      reduceWearableEvent(base, { type: "bluetooth_unavailable" }, 0).connection,
      "bluetooth_unavailable",
    );
  });

  it("normalizes native payloads and rejects bad battery values", () => {
    const reading = normalizeWearableHeartRate(
      { data: bytes(0x00, 150), timestamp: 5_000, deviceId: "aa", deviceName: "Strap" },
      9_000,
    );
    assert.ok(reading);
    assert.equal(reading.bpm, 150);
    assert.equal(reading.source, "ble");
    assert.equal(normalizeBatteryLevel({ level: 76 }), 76);
    assert.equal(normalizeBatteryLevel({ level: 200 }), null);
    assert.equal(normalizeBatteryLevel({ level: "high" }), null);
    assert.equal(normalizeWearableHeartRate({ data: bytes(0x00) }, 0), null);
  });
});
