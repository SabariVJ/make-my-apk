// ============================================================================
// SVJ NATIVE ACTIVITY — Android Health Connect bridge.
//
// Health Connect is the Android platform's on-device health store, not a
// third-party fitness service: SVJ reads the user's own local records after an
// explicit, per-type permission grant, and the user can revoke any type at any
// time (revocation is re-checked before every read).
//
// SVJ never writes to Health Connect, never reads a type that was not granted,
// and never turns an imported record into XP on its own: imports go through
// the server's dedupe/validation RPC, which refuses to create a second copy of
// a workout SVJ already recorded.
// ============================================================================

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PlatformActivityInput } from "./activityPlatform";

export const HEALTH_CONNECT_PLUGIN_NAME = "VjHealthConnect";

/** Record types SVJ can read. Nothing outside this list is ever requested. */
export const HEALTH_CONNECT_TYPES = [
  "steps",
  "distance",
  "exerciseSessions",
  "heartRate",
  "restingHeartRate",
  "sleep",
  "calories",
  "weight",
] as const;
export type HealthConnectType = (typeof HEALTH_CONNECT_TYPES)[number];

export const HEALTH_CONNECT_TYPE_LABELS: Record<HealthConnectType, string> = {
  steps: "Steps",
  distance: "Distance",
  exerciseSessions: "Workouts",
  heartRate: "Heart rate",
  restingHeartRate: "Resting heart rate",
  sleep: "Sleep",
  calories: "Active calories",
  weight: "Weight",
};

export type HealthConnectPermission = "granted" | "denied" | "prompt" | "unavailable";

/** Types SVJ asks for by default: the minimum needed for workouts + recovery. */
export const DEFAULT_HEALTH_CONNECT_TYPES: readonly HealthConnectType[] = [
  "exerciseSessions",
  "steps",
  "distance",
  "heartRate",
  "calories",
];

export interface HealthConnectPlugin {
  isAvailable?: () => Promise<unknown>;
  checkPermissions?: (options: { types: string[] }) => Promise<unknown>;
  requestPermissions?: (options: { types: string[] }) => Promise<unknown>;
  readRecords?: (options: {
    type: string;
    startMs: number;
    endMs: number;
  }) => Promise<unknown>;
  openSettings?: () => Promise<unknown>;
}

export function healthConnectPlugin(): HealthConnectPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return registerPlugin<HealthConnectPlugin>(HEALTH_CONNECT_PLUGIN_NAME);
  } catch {
    return null;
  }
}

export function healthConnectAvailable(): boolean {
  const plugin = healthConnectPlugin();
  return Boolean(plugin && typeof plugin.readRecords === "function");
}

function normalizePermission(value: unknown): HealthConnectPermission {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  if (value === "prompt" || value === "prompt-with-rationale") return "prompt";
  return "unavailable";
}

export type HealthConnectPermissions = Record<HealthConnectType, HealthConnectPermission>;

export function normalizeHealthConnectPermissions(raw: unknown): HealthConnectPermissions {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = {} as HealthConnectPermissions;
  for (const type of HEALTH_CONNECT_TYPES) {
    result[type] = normalizePermission(source[type]);
  }
  return result;
}

export async function checkHealthConnectPermissions(
  types: readonly HealthConnectType[] = DEFAULT_HEALTH_CONNECT_TYPES,
): Promise<HealthConnectPermissions> {
  const plugin = healthConnectPlugin();
  if (!plugin?.checkPermissions) return normalizeHealthConnectPermissions({});
  try {
    return normalizeHealthConnectPermissions(await plugin.checkPermissions({ types: [...types] }));
  } catch {
    return normalizeHealthConnectPermissions({});
  }
}

export async function requestHealthConnectPermissions(
  types: readonly HealthConnectType[] = DEFAULT_HEALTH_CONNECT_TYPES,
): Promise<HealthConnectPermissions> {
  const plugin = healthConnectPlugin();
  if (!plugin?.requestPermissions) return checkHealthConnectPermissions(types);
  try {
    return normalizeHealthConnectPermissions(
      await plugin.requestPermissions({ types: [...types] }),
    );
  } catch {
    return checkHealthConnectPermissions(types);
  }
}

/**
 * Re-check a type immediately before reading it. Permission revocation is
 * respected on every call rather than cached at setup time.
 */
export async function hasGranted(
  type: HealthConnectType,
): Promise<boolean> {
  const permissions = await checkHealthConnectPermissions([type]);
  return permissions[type] === "granted";
}

export async function openHealthConnectSettings(): Promise<void> {
  try {
    await healthConnectPlugin()?.openSettings?.();
  } catch {
    // ignore
  }
}

// ── Reading + normalizing records ──────────────────────────────────────────

export interface ImportedWorkout {
  externalId: string;
  activityType: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  stepCount: number;
  distanceMeters: number | null;
  caloriesEstimate: number | null;
  avgHeartRate: number | null;
  sourceApp: string | null;
}

/** Map a Health Connect exercise-session type onto an SVJ activity type. */
export function mapExerciseType(raw: unknown): string {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value.includes("run") || value.includes("jog")) return "running";
  if (value.includes("walk")) return "walking";
  if (value.includes("hik")) return "hiking";
  if (value.includes("bik") || value.includes("cycl")) return "cycling";
  if (value.includes("strength") || value.includes("weight")) return "strength";
  if (value.includes("yoga")) return "yoga";
  if (value.includes("hiit") || value.includes("interval")) return "hiit";
  if (value.includes("football") || value.includes("soccer")) return "football";
  return "other";
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Validate one raw exercise-session record. Anything malformed is dropped
 * rather than imported as a half-real workout.
 */
export function normalizeImportedWorkout(raw: unknown): ImportedWorkout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const externalId = typeof value.id === "string" && value.id.length >= 4 ? value.id : null;
  const startMs = finite(value.startTimeMs ?? value.startMs);
  const endMs = finite(value.endTimeMs ?? value.endMs);
  if (!externalId || startMs == null || endMs == null || endMs <= startMs) return null;
  const durationSeconds = Math.round((endMs - startMs) / 1000);
  if (durationSeconds < 60 || durationSeconds > 86_400) return null;

  const stepCountRaw = finite(value.stepCount) ?? 0;
  const distanceRaw = finite(value.distanceMeters);
  const caloriesRaw = finite(value.caloriesEstimate ?? value.calories);
  const hrRaw = finite(value.avgHeartRate ?? value.averageHeartRate);

  return {
    externalId,
    activityType: mapExerciseType(value.exerciseType ?? value.type ?? value.title),
    startedAtMs: startMs,
    endedAtMs: endMs,
    durationSeconds,
    stepCount: Math.max(0, Math.round(stepCountRaw)),
    distanceMeters: distanceRaw != null && distanceRaw >= 0 && distanceRaw <= 500_000 ? distanceRaw : null,
    caloriesEstimate:
      caloriesRaw != null && caloriesRaw >= 0 && caloriesRaw <= 20_000 ? caloriesRaw : null,
    avgHeartRate: hrRaw != null && hrRaw >= 20 && hrRaw <= 260 ? Math.round(hrRaw) : null,
    sourceApp: typeof value.sourceApp === "string" ? value.sourceApp : null,
  };
}

export function normalizeImportedWorkouts(raw: unknown): ImportedWorkout[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeImportedWorkout(entry))
    .filter((entry): entry is ImportedWorkout => entry != null);
}

// ── Local pre-filter (the server still makes the final call) ───────────────

export interface ExistingActivityFingerprint {
  activityType: string;
  startedAtMs: number;
  durationSeconds: number;
  distanceMeters: number | null;
}

/**
 * Mirrors the server's overlap rule so the UI can avoid pointless requests.
 * The server remains authoritative — this only reduces traffic, and a match
 * here is reported to the user as "already in SVJ", never silently dropped.
 */
export function isDuplicateOfExisting(
  candidate: ImportedWorkout,
  existing: readonly ExistingActivityFingerprint[],
): boolean {
  for (const other of existing) {
    if (other.activityType !== candidate.activityType) continue;
    if (Math.abs(other.startedAtMs - candidate.startedAtMs) > 120_000) continue;
    if (Math.abs(other.durationSeconds - candidate.durationSeconds) > 180) continue;
    if (other.distanceMeters != null && candidate.distanceMeters != null) {
      const tolerance = Math.max(50, other.distanceMeters * 0.1);
      if (Math.abs(other.distanceMeters - candidate.distanceMeters) > tolerance) continue;
    }
    return true;
  }
  return false;
}

/** Deterministic session id: re-importing the same record reuses it. */
export function sessionIdForImport(externalId: string): string {
  const cleaned = externalId.replace(/[^a-zA-Z0-9]/g, "");
  return `svj-hc-${cleaned.slice(0, 40).padEnd(8, "0")}`;
}

export function toPlatformInput(workout: ImportedWorkout): PlatformActivityInput {
  return {
    clientSessionId: sessionIdForImport(workout.externalId),
    externalId: workout.externalId,
    activityType: workout.activityType,
    startedAtMs: workout.startedAtMs,
    endedAtMs: workout.endedAtMs,
    durationSeconds: workout.durationSeconds,
    stepCount: workout.stepCount,
    distanceMeters: workout.distanceMeters,
    caloriesEstimate: workout.caloriesEstimate,
    avgHeartRate: workout.avgHeartRate,
  };
}

export async function readExerciseSessions(
  startMs: number,
  endMs: number,
): Promise<{ ok: boolean; workouts: ImportedWorkout[]; error?: string }> {
  const plugin = healthConnectPlugin();
  if (!plugin?.readRecords) {
    return { ok: false, workouts: [], error: "Health Connect is not available on this device." };
  }
  if (!(await hasGranted("exerciseSessions"))) {
    return { ok: false, workouts: [], error: "Health Connect workouts permission was not granted." };
  }
  try {
    const raw = await plugin.readRecords({ type: "exerciseSessions", startMs, endMs });
    const envelope = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const records = Array.isArray(raw) ? raw : envelope.records;
    return { ok: true, workouts: normalizeImportedWorkouts(records) };
  } catch (error) {
    return {
      ok: false,
      workouts: [],
      error: error instanceof Error ? error.message : "Couldn't read Health Connect.",
    };
  }
}
