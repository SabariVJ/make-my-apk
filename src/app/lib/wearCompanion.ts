// ============================================================================
// SVJ WEARABLES V2 — phone-side Wear OS companion controller.
//
// One singleton owns the native `VjWear` listeners, the persisted inbox the
// native WearableListenerService fills while the app is closed, and the import
// of completed watch workouts into the EXISTING canonical SVJ activity
// pipeline. Views subscribe; nothing else attaches listeners, so an event is
// never acknowledged twice.
//
// What this file does NOT do: grant XP, grant Plus/entitlements, or compute
// rewardable numbers. A watch workout is imported as evidence and the server
// decides the rewards.
// ============================================================================

import {
  EMPTY_WEAR_STATUS,
  isNativeWearAvailable,
  normalizeNativeWearEvents,
  normalizeWearCompanionStatus,
  normalizeWearHandshake,
  normalizeWearMeasurement,
  normalizeWearStateMessage,
  normalizeWearSummary,
  wearClientSessionId,
  wearConnectionState,
  wearExternalId,
  VjWear,
  type NativeWearEvent,
  type WearCapabilities,
  type WearCompanionStatus,
  type WearConnectionState,
  type WearMeasurement,
  type WearWorkoutState,
  type WearWorkoutSummary,
} from "./wearOs";
import { importPlatformActivity, activityRpcClient } from "./activityPlatform";

export interface WearWorkoutLiveState {
  sessionId: string;
  state: WearWorkoutState;
  activityType: string | null;
  elapsedSeconds: number | null;
  stepCount: number | null;
  heartRate: number | null;
  updatedAtMs: number;
}

export interface WearCompanionSnapshot {
  status: WearCompanionStatus;
  connection: WearConnectionState;
  /** Active watch workout, or null when the watch is idle. */
  workout: WearWorkoutLiveState | null;
  /** Latest accepted measurement from the watch (any type). */
  lastMeasurement: WearMeasurement | null;
  /** Latest accepted heart-rate measurement, for the recorder. */
  lastHeartRate: WearMeasurement | null;
  /** Result of the most recent completion import, for the UI to surface. */
  importNotice: string | null;
}

const IMPORTED_SESSIONS_KEY = "svj.wear.importedSessions";
const MAX_TRACKED_SESSIONS = 200;

let snapshot: WearCompanionSnapshot = {
  status: { ...EMPTY_WEAR_STATUS },
  connection: "unavailable",
  workout: null,
  lastMeasurement: null,
  lastHeartRate: null,
  importNotice: null,
};

const subscribers = new Set<() => void>();
const heartRateSubscribers = new Set<(measurement: WearMeasurement) => void>();
const summarySubscribers = new Set<(summary: WearWorkoutSummary, duplicate: boolean) => void>();

let started = false;
let ticker: number | null = null;
let listeners: { remove: () => Promise<void> }[] = [];

export function getWearCompanionSnapshot(): WearCompanionSnapshot {
  return snapshot;
}

export function subscribeWearCompanion(listener: () => void): () => void {
  startWearCompanion();
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

/** Live HR consumers (the workout recorder) — one callback per accepted sample. */
export function onWearHeartRateSample(
  listener: (measurement: WearMeasurement) => void,
): () => void {
  startWearCompanion();
  heartRateSubscribers.add(listener);
  return () => heartRateSubscribers.delete(listener);
}

/** Completed watch workouts, after they were handed to the server pipeline. */
export function onWearWorkoutSummary(
  listener: (summary: WearWorkoutSummary, duplicate: boolean) => void,
): () => void {
  startWearCompanion();
  summarySubscribers.add(listener);
  return () => summarySubscribers.delete(listener);
}

function publish(patch: Partial<WearCompanionSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of subscribers) listener();
}

// ── Idempotency bookkeeping ────────────────────────────────────────────────

function readImportedSessions(): string[] {
  try {
    const raw = window.localStorage.getItem(IMPORTED_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberImportedSession(sessionId: string): void {
  try {
    const next = [sessionId, ...readImportedSessions().filter((id) => id !== sessionId)].slice(
      0,
      MAX_TRACKED_SESSIONS,
    );
    window.localStorage.setItem(IMPORTED_SESSIONS_KEY, JSON.stringify(next));
  } catch {
    // Storage is a cache only: the server is the authority on duplicates.
  }
}

export function hasImportedWearSession(sessionId: string): boolean {
  return readImportedSessions().includes(sessionId);
}

/** True when this watch session still has to be handed to the server. */
export function shouldImportWearSummary(sessionId: string): boolean {
  return !hasImportedWearSession(sessionId);
}

/**
 * The exact canonical-pipeline payload for one watch completion. Pure, so the
 * mapping (stable session id, namespaced external id, wear_os provenance) is
 * pinned by tests. Rewardable numbers are not computed here.
 */
export function planWearImportSummary(summary: WearWorkoutSummary) {
  return {
    clientSessionId: wearClientSessionId(summary.sessionId),
    externalId: wearExternalId(summary.sessionId),
    activityType: summary.activityType,
    startedAtMs: summary.startedAtMs,
    endedAtMs: summary.endedAtMs,
    durationSeconds: summary.durationSeconds,
    stepCount: summary.stepCount,
    distanceMeters: summary.distanceMeters,
    caloriesEstimate: summary.caloriesEstimate,
    avgHeartRate: summary.avgHeartRate,
    devicePlatform: "wear_os" as const,
  };
}

/** Test seam: forget the local import cache. */
export function clearWearImportCache(): void {
  try {
    window.localStorage.removeItem(IMPORTED_SESSIONS_KEY);
  } catch {
    // ignore
  }
}

// ── Native lifecycle ───────────────────────────────────────────────────────

export function startWearCompanion(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  if (!isNativeWearAvailable()) {
    publish({
      status: { ...EMPTY_WEAR_STATUS, available: false },
      connection: "unavailable",
    });
    return;
  }

  void refreshStatus();
  void drainInbox();

  void VjWear.addListener?.("wearEvent", (event) => {
    const normalized = normalizeNativeWearEvents([event], Date.now())[0];
    if (normalized) void handleEvent(normalized, { acknowledge: true });
  }).then((handle) => {
    if (handle) listeners.push(handle);
  });

  void VjWear.addListener?.("wearConnection", () => void refreshStatus()).then((handle) => {
    if (handle) listeners.push(handle);
  });

  void VjWear.addListener?.("wearCapabilities", (event) => {
    const handshake = normalizeWearHandshake(event);
    if (!handshake) return;
    publish({
      status: {
        ...snapshot.status,
        installed: true,
        protocol: handshake.protocol,
        capabilities: handshake.capabilities,
        lastSeenMs: Date.now(),
        lastSeenAgeMs: 0,
      },
    });
  }).then((handle) => {
    if (handle) listeners.push(handle);
  });

  // A 2 s tick keeps staleness honest: an old BPM or a vanished watch must
  // degrade in the UI instead of lingering as if it were live.
  ticker = window.setInterval(() => {
    void refreshStatus();
    const lastSeen = snapshot.status.lastSeenMs;
    if (snapshot.workout && lastSeen != null && Date.now() - lastSeen > 90_000) {
      // The watch went away mid-workout: keep the session visible as
      // reconnecting rather than pretending the workout ended.
      publish({ connection: wearConnectionState(snapshot.status, Date.now()) });
    }
  }, 2000);
}

export function stopWearCompanion(): void {
  if (ticker != null) window.clearInterval(ticker);
  ticker = null;
  for (const handle of listeners) void handle.remove();
  listeners = [];
  started = false;
}

async function refreshStatus(): Promise<void> {
  try {
    const raw = await VjWear.getCompanionStatus?.();
    const status = normalizeWearCompanionStatus(raw, Date.now());
    publish({ status, connection: wearConnectionState(status, Date.now()) });
  } catch {
    publish({ status: { ...EMPTY_WEAR_STATUS }, connection: "unavailable" });
  }
}

/** Read everything the native side buffered while the app was closed. */
export async function drainInbox(): Promise<number> {
  let events: NativeWearEvent[] = [];
  try {
    const raw = await VjWear.getPendingEvents?.();
    const envelope =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? ((raw as Record<string, unknown>).events ?? raw)
        : raw;
    events = normalizeNativeWearEvents(envelope, Date.now());
  } catch {
    return 0;
  }
  if (events.length === 0) return 0;
  for (const event of events) await handleEvent(event, { acknowledge: false });
  await acknowledge(events.map((event) => event.id));
  return events.length;
}

async function acknowledge(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await VjWear.acknowledgeEvents?.({ ids });
  } catch {
    // The inbox is idempotent: unacknowledged events are simply handled again.
  }
}

// ── Event handling ─────────────────────────────────────────────────────────

async function handleEvent(
  event: NativeWearEvent,
  options: { acknowledge: boolean } = { acknowledge: false },
): Promise<void> {
  const nowMs = Date.now();
  if (options.acknowledge) await acknowledge([event.id]);
  const touch = (patch: Partial<WearCompanionSnapshot> = {}) =>
    publish({
      ...patch,
      status: { ...snapshot.status, lastSeenMs: nowMs, lastSeenAgeMs: 0, installed: true },
      connection: "connected",
    });

  if (event.type === "handshake") {
    const handshake = normalizeWearHandshake(event.payload);
    if (!handshake) return;
    touch({
      status: {
        ...snapshot.status,
        installed: true,
        protocol: handshake.protocol,
        capabilities: handshake.capabilities,
        lastSeenMs: nowMs,
        lastSeenAgeMs: 0,
        activeSessionId: handshake.sessionId,
      },
    });
    return;
  }

  if (event.type === "sample") {
    const measurement = normalizeWearMeasurement(event.payload, nowMs);
    if (!measurement) return;
    touch({
      lastMeasurement: measurement,
      lastHeartRate: measurement.type === "heart_rate" ? measurement : snapshot.lastHeartRate,
    });
    if (measurement.type === "heart_rate") {
      for (const listener of heartRateSubscribers) listener(measurement);
    }
    return;
  }

  if (event.type === "state") {
    const state = normalizeWearStateMessage(event.payload);
    if (!state) return;
    touch({
      workout:
        state.state === "finished"
          ? null
          : {
              sessionId: state.sessionId,
              state: state.state,
              activityType: state.activityType,
              elapsedSeconds: state.elapsedSeconds,
              stepCount: state.stepCount,
              heartRate: state.heartRate,
              updatedAtMs: nowMs,
            },
      status: {
        ...snapshot.status,
        activeSessionId: state.state === "finished" ? null : state.sessionId,
      },
    });
    return;
  }

  if (event.type === "summary") {
    const summary = normalizeWearSummary(event.payload, nowMs);
    if (!summary) return;
    touch({ workout: null, status: { ...snapshot.status, activeSessionId: null } });
    await importWearSummary(summary);
  }
}

/**
 * Hand a completed watch workout to the canonical SVJ server pipeline.
 *
 * The server deduplicates by external id, session id and type/time/duration
 * overlap, so a repeated completion — or a workout the phone already recorded
 * as a GPS activity — never becomes a second activity or a second XP grant.
 */
export async function importWearSummary(
  summary: WearWorkoutSummary,
): Promise<{ ok: boolean; duplicate?: boolean; activityId?: string; error?: string }> {
  const client = activityRpcClient();
  if (!client) {
    publish({ importNotice: "Sign in to save this watch workout." });
    return { ok: false, error: "Sign in to save this watch workout." };
  }
  if (!shouldImportWearSummary(summary.sessionId)) {
    for (const listener of summarySubscribers) listener(summary, true);
    publish({ importNotice: "This watch workout is already in your SVJ history." });
    return { ok: true, duplicate: true };
  }
  const result = await importPlatformActivity(client, planWearImportSummary(summary));
  if (!result.ok) {
    publish({ importNotice: result.error ?? "Couldn't save this watch workout." });
    return result;
  }
  rememberImportedSession(summary.sessionId);
  for (const listener of summarySubscribers) listener(summary, result.duplicate === true);
  publish({
    importNotice: result.duplicate
      ? "This watch workout matches an activity already in SVJ — nothing was duplicated."
      : "Watch workout saved to your SVJ activity history.",
  });
  return result;
}

/** Test/documentation seam: route one already-normalized native event. */
export async function handleNativeWearEvent(event: NativeWearEvent): Promise<void> {
  return handleEvent(event);
}

/** The active watch workout, or null when the watch is idle. */
export function activeWearWorkout(): WearWorkoutLiveState | null {
  return snapshot.workout;
}

/** Capabilities the phone currently believes the watch has. */
export function wearCapabilities(): WearCapabilities {
  return snapshot.status.capabilities;
}
