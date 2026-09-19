// ============================================================================
// SVJ NATIVE ACTIVITY — workout recorder engine.
//
// Framework-agnostic and fully injectable (clock, location source, storage),
// so the whole start → pause → resume → finish → save → discard lifecycle and
// the offline recovery path are unit-testable without a device or a browser.
//
// Two guarantees this module owns:
//   1. A workout survives a dead network. Points are persisted locally as they
//      arrive and the finished workout is queued for sync until the server
//      actually confirms it.
//   2. A workout is never duplicated. One stable `clientSessionId` is created
//      at start, kept across process restarts, and reused for every retry, so
//      the server's idempotency key is always the same value.
// ============================================================================

import {
  appendPoint,
  createAutoPause,
  defaultMaxSpeed,
  encodePolyline,
  simplifyTrack,
  summarizeTrack,
  type Bounds,
  type GpsActivityType,
  type GpsQuality,
  type Split,
  type TrackPoint,
  type WorkoutState,
  type WorkoutSummary,
  canTransition,
  classifyGpsQuality,
  type AutoPauseDetector,
} from "./gpsActivity";

export interface RawLocationSample {
  lat: number;
  lng: number;
  accuracy?: number | null;
  elevation?: number | null;
  heartRate?: number | null;
  cadence?: number | null;
  timestampMs: number;
}

/** The device location source (native foreground service or web geolocation). */
export interface LocationAdapter {
  start(
    onSample: (sample: RawLocationSample) => void,
    onError?: (message: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
}

export interface SessionStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export function createMemoryStorage(seed: Record<string, string> = {}): SessionStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => {
      map.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
    },
  };
}

export function createLocalStorageAdapter(): SessionStorage {
  try {
    if (typeof localStorage !== "undefined") {
      const probe = "__svj_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return {
        read: (key) => localStorage.getItem(key),
        write: (key, value) => {
          localStorage.setItem(key, value);
        },
        remove: (key) => {
          localStorage.removeItem(key);
        },
      };
    }
  } catch {
    // Private mode / storage disabled: fall through to memory.
  }
  return createMemoryStorage();
}

// ── Session shape ──────────────────────────────────────────────────────────

export interface WorkoutSession {
  /** Stable activity identity created at start, never regenerated. */
  activityId: string;
  /** Stable idempotency key sent to the server on every retry. */
  clientSessionId: string;
  activityType: GpsActivityType;
  state: WorkoutState;
  startedAtMs: number;
  endedAtMs: number | null;
  /** Wall-clock time after the first start, including pauses. */
  durationSeconds: number;
  pausedTotalSeconds: number;
  points: TrackPoint[];
  steps: number;
  autoPaused: boolean;
  splitUnit: "km" | "mi";
  gpsQuality: GpsQuality;
  devicePlatform: string;
  /** Set once the server has confirmed the workout. */
  savedAtMs?: number;
  /** Number of failed sync attempts, for backoff/telemetry. */
  syncAttempts?: number;
  lastSyncError?: string | null;
}

export const RECORDER_SESSION_KEY = "svj.workout.active.v1";
export const RECORDER_QUEUE_KEY = "svj.workout.queue.v1";
const MAX_QUEUED_WORKOUTS = 20;
const MAX_SESSION_POINTS = 200_000;

export interface RecorderOptions {
  storage?: SessionStorage;
  now?: () => number;
  genId?: () => string;
  splitMeters?: number;
  autoPauseEnabled?: boolean;
  devicePlatform?: string;
  location?: LocationAdapter | null;
  autoPause?: ReturnType<typeof createAutoPause>;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildClientSessionId(activityId: string): string {
  return `svj-gps-${activityId.replace(/-/g, "").slice(0, 24)}`;
}

export function defaultSplitMeters(unit: "km" | "mi"): number {
  return unit === "mi" ? 1609.344 : 1000;
}

// ── Recorder ───────────────────────────────────────────────────────────────

export class GpsWorkoutRecorder {
  private readonly storage: SessionStorage;
  private readonly now: () => number;
  private readonly genId: () => string;
  private readonly splitMeters: number;
  private readonly autoPauseEnabled: boolean;
  private readonly devicePlatform: string;
  private readonly autoPause: AutoPauseDetector;
  private readonly listeners = new Set<(session: WorkoutSession) => void>();

  private session: WorkoutSession | null = null;
  private location: LocationAdapter | null;
  private unsubscribeLocation: (() => void) | null = null;
  private lastPointAtMs = 0;
  private lastAutoPauseAtMs = 0;
  private lastPersistCount = 0;
  private lastPersistAtMs = 0;

  constructor(options: RecorderOptions = {}) {
    this.storage = options.storage ?? createLocalStorageAdapter();
    this.now = options.now ?? (() => Date.now());
    this.genId = options.genId ?? randomId;
    this.splitMeters = options.splitMeters ?? 1000;
    this.autoPauseEnabled = options.autoPauseEnabled ?? true;
    this.devicePlatform = options.devicePlatform ?? "web";
    this.location = options.location ?? null;
    this.autoPause = options.autoPause ?? createAutoPause();
  }

  // ── Observation ─────────────────────────────────────────────────────────

  subscribe(listener: (session: WorkoutSession | null) => void): () => void {
    this.listeners.add(listener as (session: WorkoutSession) => void);
    return () => this.listeners.delete(listener as (session: WorkoutSession) => void);
  }

  private emit(): void {
    const snapshot = this.session ? { ...this.session, points: this.session.points } : null;
    for (const listener of this.listeners) {
      try {
        listener(snapshot as WorkoutSession);
      } catch {
        // A broken listener must never break recording.
      }
    }
  }

  get current(): WorkoutSession | null {
    return this.session;
  }

  setLocationAdapter(adapter: LocationAdapter | null): void {
    this.location = adapter;
  }

  /** Attach an external step source (the existing SVJ pedometer bridge). */
  setSteps(steps: number): void {
    if (!this.session) return;
    this.session = { ...this.session, steps: Math.max(0, Math.round(steps)) };
    this.persist();
    this.emit();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Begin a workout. The stable activity id and idempotency key are created
   * exactly once here and are never regenerated, so retries cannot duplicate.
   */
  async start(
    activityType: GpsActivityType,
    options: { splitUnit?: "km" | "mi"; autoPauseEnabled?: boolean } = {},
  ): Promise<WorkoutSession> {
    const splitUnit = options.splitUnit ?? "km";
    const activityId = this.genId();
    const session: WorkoutSession = {
      activityId,
      clientSessionId: buildClientSessionId(activityId),
      activityType,
      state: "recording",
      startedAtMs: this.now(),
      endedAtMs: null,
      durationSeconds: 0,
      pausedTotalSeconds: 0,
      points: [],
      steps: 0,
      autoPaused: false,
      splitUnit,
      gpsQuality: "searching",
      devicePlatform: this.devicePlatform,
      syncAttempts: 0,
      lastSyncError: null,
    };
    this.session = session;
    this.autoPause.reset();
    this.lastAutoPauseAtMs = session.startedAtMs;
    this.lastPointAtMs = 0;
    this.lastPersistCount = 0;
    this.lastPersistAtMs = session.startedAtMs;
    this.persist();
    this.emit();
    await this.beginLocation();
    return session;
  }

  /** Recover an unfinished workout after a process restart / webview reload. */
  recover(): WorkoutSession | null {
    const raw = this.storage.read(RECORDER_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as WorkoutSession;
      if (!parsed?.activityId || !Array.isArray(parsed.points)) return null;
      if (parsed.savedAtMs) return null;
      // A recovered workout always comes back PAUSED: collecting location
      // without the user explicitly resuming would be surveillance.
      this.session = {
        ...parsed,
        state: "paused",
        points: parsed.points.filter(isFinitePoint),
      };
      this.autoPause.reset();
      this.emit();
      return this.session;
    } catch {
      this.storage.remove(RECORDER_SESSION_KEY);
      return null;
    }
  }

  private async beginLocation(): Promise<void> {
    if (this.location == null) return;
    this.session = { ...(this.session as WorkoutSession), state: "recording" };
    try {
      await this.location.start(
        (sample) => this.ingest(sample),
        (message) => this.fail(message),
      );
      this.unsubscribeLocation = () => {
        void this.location?.stop();
      };
      this.persist();
      this.emit();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Location unavailable");
    }
  }

  private fail(message: string): void {
    if (!this.session) return;
    this.session = { ...this.session, lastSyncError: message };
    this.persist();
    this.emit();
  }

  /** Accept a raw device sample. Filtering happens inside `appendPoint`. */
  ingest(sample: RawLocationSample): boolean {
    if (!this.session) return false;
    if (this.session.state !== "recording") return false;
    if (this.session.points.length >= MAX_SESSION_POINTS) return false;
    if (sample.heartRate != null) this.lastHeartRate = { bpm: sample.heartRate, atMs: sample.timestampMs };

    const t = sample.timestampMs - this.session.startedAtMs;
    let point: TrackPoint = {
      lat: sample.lat,
      lng: sample.lng,
      t,
      ele: sample.elevation ?? null,
      accuracy: sample.accuracy ?? null,
      hr: sample.heartRate ?? null,
      cad: sample.cadence ?? null,
      moving: true,
    };

    const previous = this.session.points.length > 0
      ? this.session.points[this.session.points.length - 1]!
      : null;

    // Auto pause decides whether this interval counts as movement.
    if (this.autoPauseEnabled && previous != null) {
      const deltaSeconds = Math.max(0, (sample.timestampMs - this.lastAutoPauseAtMs) / 1000);
      const distance = previous.moving === false ? 0 : distanceBetween(previous, point);
      const speed = deltaSeconds > 0 ? distance / deltaSeconds : 0;
      const changed = this.autoPause.update(speed, deltaSeconds);
      this.lastAutoPauseAtMs = sample.timestampMs;
      if (changed || this.autoPause.paused) {
        this.session = { ...this.session, autoPaused: this.autoPause.paused };
      }
    } else {
      this.lastAutoPauseAtMs = sample.timestampMs;
    }

    point = { ...point, moving: !(this.autoPauseEnabled && this.autoPause.paused) };

    const { track, decision } = appendPoint(this.session.points, point, {
      maxSpeedMps: defaultMaxSpeed(this.session.activityType),
    });
    if (!decision.accept) {
      // A rejected sample still refreshes the observed GPS quality so the UI
      // can show "Weak" instead of silently appearing frozen.
      const quality = classifyGpsQuality(sample.accuracy);
      if (quality !== this.session.gpsQuality) {
        this.session = { ...this.session, gpsQuality: quality };
        this.emit();
      }
      return false;
    }

    this.lastPointAtMs = sample.timestampMs;
    this.session = {
      ...this.session,
      points: track,
      steps: this.currentSteps(),
      gpsQuality: classifyGpsQuality(sample.accuracy),
    };
    this.refreshDuration();
    // Persist on a cadence, not on every sample: a 3-hour ride would otherwise
    // rewrite the whole track thousands of times. The time-based half matters
    // most: a slow walk must still survive a process restart, so progress is
    // durable within ~10 s of real recording rather than only every 10 points.
    const dueByCount = track.length - this.lastPersistCount >= 5;
    const dueByTime = sample.timestampMs - this.lastPersistAtMs >= 5_000;
    if (track.length === 1 || dueByCount || dueByTime) {
      this.lastPersistCount = track.length;
      this.lastPersistAtMs = sample.timestampMs;
      this.persist();
    }
    this.emit();
    return true;
  }

  private currentSteps(): number {
    return this.session?.steps ?? 0;
  }

  private lastHeartRate: { bpm: number; atMs: number } | null = null;

  /**
   * Record a standalone wearable heart-rate reading (BLE strap) against the
   * active session. GPS points arrive far less often than HR notifications,
   * so HR is stored on the most recent track point it can be attributed to;
   * summary aggregates only real measurements, never interpolations.
   */
  ingestHeartRate(bpm: number, atMs: number, maxAgeMs = 15_000): boolean {
    if (!this.session) return false;
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) return false;
    if (this.session.state !== "recording" && this.session.state !== "paused") return false;
    this.lastHeartRate = { bpm, atMs };
    const points = this.session.points;
    if (points.length === 0) return true;
    const last = points[points.length - 1]!;
    if (atMs - (this.session.startedAtMs + last.t) > maxAgeMs) return true; // too old to attribute
    if (last.hr != null && last.hr === bpm) return true;
    const updated = [...points.slice(0, -1), { ...last, hr: bpm }];
    this.session = { ...this.session, points: updated };
    this.persist();
    this.emit();
    return true;
  }

  private refreshDuration(): void {
    if (!this.session) return;
    const elapsed = Math.max(0, Math.round((this.now() - this.session.startedAtMs) / 1000));
    this.session = { ...this.session, durationSeconds: elapsed };
  }

  pause(manual = true): void {
    if (!this.session) return;
    if (!canTransition(this.session.state, "paused")) return;
    if (manual) this.autoPause.reset();
    this.session = { ...this.session, state: "paused", autoPaused: manual ? false : this.session.autoPaused };
    this.refreshDuration();
    this.persist();
    this.emit();
  }

  resume(): void {
    if (!this.session) return;
    if (!canTransition(this.session.state, "recording")) return;
    this.autoPause.reset();
    this.lastAutoPauseAtMs = this.now();
    this.session = { ...this.session, state: "recording", autoPaused: false };
    this.persist();
    this.emit();
  }

  /** Stop collecting and finalise the session. Safe to call twice. */
  async finish(): Promise<WorkoutSession | null> {
    if (!this.session) return null;
    // Finishing is idempotent: an already-finalised session is returned as-is
    // so a retried tap can never move the end time or duplicate the stop.
    if (
      this.session.state === "saved" ||
      this.session.state === "discarded" ||
      this.session.endedAtMs != null
    ) {
      return this.session;
    }
    this.session = { ...this.session, state: "stopping" };
    this.emit();
    await this.stopLocation();
    const endedAtMs = this.now();
    const durationSeconds = Math.max(
      0,
      Math.round((endedAtMs - this.session.startedAtMs) / 1000),
    );
    this.session = {
      ...this.session,
      state: "stopping",
      endedAtMs,
      durationSeconds,
      autoPaused: false,
    };
    this.refreshDuration();
    this.persist();
    this.emit();
    return this.session;
  }

  /** Throw the workout away. Nothing is queued and no activity is created. */
  async discard(): Promise<void> {
    await this.stopLocation();
    this.session = null;
    this.storage.remove(RECORDER_SESSION_KEY);
    this.emit();
  }

  markSaved(): void {
    if (!this.session) return;
    this.session = { ...this.session, state: "saved", savedAtMs: this.now() };
    this.persist();
    this.removeFromQueue(this.session.clientSessionId);
    this.storage.remove(RECORDER_SESSION_KEY);
    this.emit();
  }

  markSyncFailure(message: string): void {
    if (!this.session) return;
    this.session = {
      ...this.session,
      syncAttempts: (this.session.syncAttempts ?? 0) + 1,
      lastSyncError: message,
    };
    this.persist();
    this.emit();
  }

  /** Send the finished workout to the durable offline queue. */
  enqueueForSync(): void {
    if (!this.session) return;
    if (this.session.state === "discarded") return;
    const queue = readQueue(this.storage);
    const without = queue.filter((w) => w.clientSessionId !== this.session!.clientSessionId);
    without.unshift(this.session);
    writeQueue(this.storage, without.slice(0, MAX_QUEUED_WORKOUTS));
  }

  private removeFromQueue(clientSessionId: string): void {
    const queue = readQueue(this.storage).filter((w) => w.clientSessionId !== clientSessionId);
    writeQueue(this.storage, queue);
  }

  private async stopLocation(): Promise<void> {
    if (this.unsubscribeLocation) {
      try {
        this.unsubscribeLocation();
      } catch {
        // ignore
      }
      this.unsubscribeLocation = null;
      return;
    }
    try {
      await this.location?.stop();
    } catch {
      // ignore
    }
  }

  private persist(): void {
    if (!this.session) return;
    if (this.session.state === "discarded") return;
    try {
      this.storage.write(RECORDER_SESSION_KEY, JSON.stringify(this.session));
    } catch {
      // Storage full: recording continues in memory rather than aborting.
    }
  }

  // ── Derived view for the UI ─────────────────────────────────────────────

  summary(): WorkoutSummary | null {
    if (!this.session) return null;
    return summarizeTrack(this.session.points, {
      durationSeconds: this.session.durationSeconds,
      stepCount: this.session.steps,
      splitMeters: defaultSplitMeters(this.session.splitUnit),
    });
  }

  splits(): Split[] {
    return this.summary()?.splits ?? [];
  }

  polyline(): string {
    if (!this.session) return "";
    return encodePolyline(simplifyTrack(this.session.points, 8));
  }

  bounds(): Bounds | null {
    return this.summary()?.bounds ?? null;
  }
}

function distanceBetween(a: TrackPoint, b: TrackPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(x)));
}

function isFinitePoint(value: unknown): value is TrackPoint {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.lat === "number" && typeof p.lng === "number" && typeof p.t === "number";
}

// ── Offline queue ──────────────────────────────────────────────────────────

export function readQueue(storage: SessionStorage): WorkoutSession[] {
  const raw = storage.read(RECORDER_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is WorkoutSession =>
        Boolean(entry) &&
        typeof entry.clientSessionId === "string" &&
        Array.isArray(entry.points),
    );
  } catch {
    return [];
  }
}

export function writeQueue(storage: SessionStorage, queue: readonly WorkoutSession[]): void {
  try {
    storage.write(RECORDER_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export interface SyncOutcome {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
}

/**
 * Flush queued workouts. A workout leaves the queue only when the server
 * explicitly confirms it, so a crash mid-sync never loses a workout.
 */
export async function flushOfflineQueue(
  storage: SessionStorage,
  save: (session: WorkoutSession) => Promise<SyncOutcome>,
  onProgress?: (session: WorkoutSession, outcome: SyncOutcome) => void,
): Promise<{ synced: number; failed: number }> {
  let queue = readQueue(storage);
  let synced = 0;
  let failed = 0;
  const remaining: WorkoutSession[] = [];

  for (const session of queue) {
    let outcome: SyncOutcome;
    try {
      outcome = await save(session);
    } catch (error) {
      outcome = {
        ok: false,
        error: error instanceof Error ? error.message : "Network error while syncing.",
      };
    }
    if (outcome.ok) {
      synced += 1;
    } else {
      failed += 1;
      remaining.push(session);
    }
    onProgress?.(session, outcome);
  }

  writeQueue(storage, remaining);
  return { synced, failed };
}
