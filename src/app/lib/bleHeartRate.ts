/**
 * Bluetooth SIG Heart Rate Service (0x180D) parsing.
 *
 * Pure byte-level parsing of the Heart Rate Measurement characteristic
 * (0x2A37) exactly as its flags field dictates. No field is ever fabricated:
 * energy expended and RR intervals are only present when the sensor actually
 * transmits them. Shared by the native Android plugin (which mirrors this
 * logic in Java) and by web-side validation of bridge payloads.
 */

export interface HeartRateMeasurement {
  /** Beats per minute. Always present in a well-formed packet. */
  bpm: number;
  /** Sensor contact feature support + detected contact, from flags 1-2. */
  sensorContact:
    "unsupported" | "not_supported_or_no_contact" | "supported_no_contact" | "supported_contact";
  /** Calories burned so far by the sensor. Only when flag 3 is set. */
  energyExpendedJoules?: number;
  /** RR intervals in milliseconds (1/1024 s units converted). Only when flag 4 is set. */
  rrIntervalsMs?: number[];
}

const HR_FORMAT_16BIT = 0x01;
const SENSOR_CONTACT_UNSUPPORTED = 0x04;
const SENSOR_CONTACT_SUPPORTED = 0x08;
const CONTACT_DETECTED = 0x02;
const ENERGY_PRESENT = 0x10;
const RR_PRESENT = 0x20;

export function parseHeartRateMeasurement(
  data: Uint8Array | ArrayBuffer,
): HeartRateMeasurement | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // Flags (1) + at least one HR byte.
  if (bytes.length < 2) return null;
  const flags = bytes[0]!;
  const wide = (flags & HR_FORMAT_16BIT) !== 0;
  if (wide && bytes.length < 3) return null;

  const bpm = wide ? bytes[1]! | (bytes[2]! << 8) : bytes[1]!;
  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 250) return null;

  const measurement: HeartRateMeasurement = {
    bpm,
    sensorContact: sensorContactState(flags),
  };

  let offset = wide ? 3 : 2;
  if ((flags & ENERGY_PRESENT) !== 0) {
    if (bytes.length < offset + 2) return null;
    const energy = bytes[offset]! | (bytes[offset + 1]! << 8);
    if (energy > 0) measurement.energyExpendedJoules = energy;
    offset += 2;
  }
  if ((flags & RR_PRESENT) !== 0) {
    const intervals: number[] = [];
    // RR intervals come in pairs of bytes; a truncated trailing pair is a
    // malformed packet rather than a partial reading.
    for (; offset + 1 < bytes.length + 1 && offset + 1 <= bytes.length - 1; offset += 2) {
      const raw = bytes[offset]! | (bytes[offset + 1]! << 8);
      if (raw === 0) continue; // 0 is not a valid interval
      // 1/1024 s units → milliseconds. Plausible human range ~250–2000 ms.
      const ms = Math.round((raw * 1000) / 1024);
      if (ms >= 250 && ms <= 2000) intervals.push(ms);
    }
    if ((flags & RR_PRESENT) !== 0 && bytes.length < offset && intervals.length === 0) return null;
    if (intervals.length > 0) measurement.rrIntervalsMs = intervals;
  }
  return measurement;
}

function sensorContactState(flags: number): HeartRateMeasurement["sensorContact"] {
  if ((flags & SENSOR_CONTACT_SUPPORTED) !== 0) {
    return (flags & CONTACT_DETECTED) !== 0 ? "supported_contact" : "supported_no_contact";
  }
  if ((flags & SENSOR_CONTACT_UNSUPPORTED) !== 0) return "not_supported_or_no_contact";
  return "unsupported";
}

/** Standard Bluetooth SIG service/characteristic UUIDs (16-bit, little-endian on the wire). */
export const HEART_RATE_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
export const HEART_RATE_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb";
export const BODY_SENSOR_LOCATION_UUID = "00002a38-0000-1000-8000-00805f9b34fb";
export const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
export const BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

/** A live heart-rate reading with provenance, as surfaced to the UI. */
export interface LiveHeartRate {
  bpm: number;
  timestampMs: number;
  source: "ble" | "health_connect";
  deviceName?: string;
  deviceId?: string;
  sensorContact?: HeartRateMeasurement["sensorContact"];
}

/** After this long without a fresh measurement the reading is considered lost. */
export const HR_STALE_MS = 12_000;

/**
 * Decide whether a reading is still current. HR straps transmit roughly every
 * 1 s; 12 s of silence means the strap left range or lost contact — the UI
 * must show "signal lost" instead of pretending the old BPM is live.
 */
export function isHeartRateFresh(
  reading: LiveHeartRate | null | undefined,
  nowMs: number,
  staleMs: number = HR_STALE_MS,
): reading is LiveHeartRate {
  return reading != null && Number.isFinite(reading.bpm) && nowMs - reading.timestampMs <= staleMs;
}
