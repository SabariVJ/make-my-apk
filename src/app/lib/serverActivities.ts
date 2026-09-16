// ============================================================================
// Server-backed activities — Update 01 foundation.
//
// One canonical record per completed session, saved through the
// svj_save_activity database function so retries are idempotent by
// (user, client_session_id) and exactly one activity.completed ledger event
// exists per activity. Pure helpers are exported for unit tests; the save
// path takes an injected caller so tests never touch the network.
//
// No fake metrics: distance/calories are stored only when genuinely measured
// or estimated by the existing estimator; unavailable fields stay absent.
// ============================================================================

export const ACTIVITY_TYPES = [
  "walking",
  "running",
  "strength",
  "cycling",
  "football",
  "calisthenics",
  "hiit",
  "yoga",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Step-capable types use the native pedometer session; the rest are manual. */
export const STEP_COMPATIBLE_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set([
  "walking",
  "running",
]);

export const ACTIVITY_SOURCES = ["svj_native", "manual"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  walking: "Walking",
  running: "Running",
  strength: "Strength",
  cycling: "Cycling",
  football: "Football",
  calisthenics: "Calisthenics",
  hiit: "HIIT",
  yoga: "Yoga",
  other: "Other",
};

/** Canonical activity record as read back from the server. */
export interface ServerActivity {
  id: string;
  userId: string;
  clientSessionId: string;
  activityType: ActivityType;
  source: ActivitySource;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  stepCount: number;
  distanceMeters: number | null;
  caloriesEstimate: number | null;
  perceivedEffort: number | null;
  notes: string | null;
  visibility: "private" | "friends" | "community";
  createdAt: string;
  updatedAt: string;
}

/** Payload built when a tracking session completes (source: svj_native). */
export interface CompletedSessionPayload {
  clientSessionId: string;
  activityType: ActivityType;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  stepCount: number;
  /** Sensor-reported distance only — never a stride guess. */
  distanceMeters?: number;
  /** Calories from the existing estimator only — shown as an estimate. */
  caloriesEstimate?: number;
}

/** Payload for a manual log (source: manual). */
export interface ManualActivityPayload {
  clientSessionId: string;
  activityType: ActivityType;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  perceivedEffort?: number;
  notes?: string;
}

export interface SaveActivityResult {
  ok: boolean;
  /** True when the server already had this session (idempotent retry). */
  duplicate?: boolean;
  activity?: ServerActivity;
  error?: string;
}

const MIN_SESSION_ID_LENGTH = 8;
const MAX_SESSION_ID_LENGTH = 100;

export function buildClientSessionId(now = new Date(), entropy = Math.random()): string {
  const stamp = now.getTime().toString(36);
  const rand = Math.floor(entropy * 0xffffffff)
    .toString(36)
    .padStart(7, "0");
  return `svj-${stamp}-${rand}`;
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.round(value);
  return int >= min && int <= max ? int : null;
}

export function isValidActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

/**
 * Validate a completed-session payload. Returns a user-presentable error
 * string, or null when the payload is well-formed. Server-side validation in
 * svj_save_activity repeats every rule — this keeps obvious mistakes local.
 */
export function validateCompletedSession(
  payload: CompletedSessionPayload,
  nowMs = Date.now(),
): string | null {
  const session = typeof payload.clientSessionId === "string" ? payload.clientSessionId.trim() : "";
  if (session.length < MIN_SESSION_ID_LENGTH || session.length > MAX_SESSION_ID_LENGTH)
    return "This session cannot be saved. Start a new activity.";
  if (!isValidActivityType(payload.activityType)) return "Choose an activity type.";
  if (!Number.isFinite(payload.startedAtMs) || !Number.isFinite(payload.endedAtMs))
    return "Activity times are invalid.";
  if (payload.endedAtMs <= payload.startedAtMs) return "Activity end must be after its start.";
  if (payload.endedAtMs > nowMs + 5 * 60_000) return "Activity end time cannot be in the future.";
  if (clampInt(payload.durationSeconds, 1, 86_400) === null)
    return "Activity duration is out of range.";
  const elapsed = Math.round((payload.endedAtMs - payload.startedAtMs) / 1000);
  if (payload.durationSeconds > elapsed + 120) return "Activity duration exceeds its time span.";
  if (clampInt(payload.stepCount, 0, 500_000) === null) return "Step count is out of range.";
  if (
    payload.distanceMeters !== undefined &&
    (typeof payload.distanceMeters !== "number" ||
      !Number.isFinite(payload.distanceMeters) ||
      payload.distanceMeters < 0 ||
      payload.distanceMeters > 500_000)
  )
    return "Distance value is invalid.";
  if (
    payload.caloriesEstimate !== undefined &&
    (typeof payload.caloriesEstimate !== "number" ||
      !Number.isFinite(payload.caloriesEstimate) ||
      payload.caloriesEstimate < 0 ||
      payload.caloriesEstimate > 20_000)
  )
    return "Calorie value is invalid.";
  return null;
}

/** Validate a manual log payload; same rule set minus sensor metrics. */
export function validateManualActivity(
  payload: ManualActivityPayload,
  nowMs = Date.now(),
): string | null {
  const session = typeof payload.clientSessionId === "string" ? payload.clientSessionId.trim() : "";
  if (session.length < MIN_SESSION_ID_LENGTH || session.length > MAX_SESSION_ID_LENGTH)
    return "Could not generate a stable session id.";
  if (!isValidActivityType(payload.activityType)) return "Choose an activity type.";
  if (!Number.isFinite(payload.startedAtMs) || !Number.isFinite(payload.endedAtMs))
    return "Activity times are invalid.";
  if (payload.endedAtMs <= payload.startedAtMs) return "End must be after start.";
  if (payload.endedAtMs > nowMs + 5 * 60_000) return "End time cannot be in the future.";
  if (clampInt(payload.durationSeconds, 1, 86_400) === null)
    return "Duration must be between 1 minute and 24 hours (in seconds).";
  const elapsed = Math.round((payload.endedAtMs - payload.startedAtMs) / 1000);
  if (payload.durationSeconds > elapsed + 120) return "Duration exceeds the time span.";
  if (payload.perceivedEffort !== undefined && clampInt(payload.perceivedEffort, 1, 10) === null)
    return "Perceived effort must be 1–10.";
  if (payload.notes != null && (typeof payload.notes !== "string" || payload.notes.length > 500))
    return "Notes are limited to 500 characters.";
  return null;
}

/** Normalize one raw DB row into ServerActivity; unknown rows are dropped. */
export function normalizeServerActivity(value: unknown): ServerActivity | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  const session = typeof row.client_session_id === "string" ? row.client_session_id : null;
  if (!id || !userId || !session) return null;
  if (!isValidActivityType(row.activity_type)) return null;
  if (
    typeof row.source !== "string" ||
    !(ACTIVITY_SOURCES as readonly string[]).includes(row.source)
  )
    return null;
  if (typeof row.started_at !== "string" || typeof row.ended_at !== "string") return null;
  if (typeof row.duration_seconds !== "number") return null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    id,
    userId,
    clientSessionId: session,
    activityType: row.activity_type as ActivityType,
    source: row.source as ActivitySource,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    stepCount: num(row.step_count) ?? 0,
    distanceMeters: num(row.distance_meters),
    caloriesEstimate: num(row.calories_estimate),
    perceivedEffort: num(row.perceived_effort),
    notes: typeof row.notes === "string" && row.notes.length > 0 ? row.notes : null,
    visibility:
      row.visibility === "friends" || row.visibility === "community" ? row.visibility : "private",
    createdAt: typeof row.created_at === "string" ? row.created_at : row.ended_at,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.ended_at,
  };
}

type SaveActivityRpc = (
  payload: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Save one canonical activity. Retrying the SAME payload (same
 * client_session_id) returns the original row with duplicate=true and never
 * creates a second activity or completion event.
 */
export async function saveServerActivity(
  callRpc: SaveActivityRpc,
  payload: CompletedSessionPayload | ManualActivityPayload,
  nowMs = Date.now(),
  options: { source?: ActivitySource } = {},
): Promise<SaveActivityResult> {
  const isManual =
    options.source === "manual" ||
    (!("stepCount" in payload) &&
      !("distanceMeters" in payload) &&
      !("caloriesEstimate" in payload));
  const validationError = isManual
    ? validateManualActivity(payload, nowMs)
    : validateCompletedSession(payload, nowMs);
  if (validationError) return { ok: false, error: validationError };

  const common = {
    p_client_session_id: payload.clientSessionId.trim(),
    p_activity_type: payload.activityType,
    p_started_at: new Date(payload.startedAtMs).toISOString(),
    p_ended_at: new Date(payload.endedAtMs).toISOString(),
    p_duration_seconds: Math.round(payload.durationSeconds),
  };
  const rpcPayload = isManual
    ? {
        ...common,
        p_source: "manual" as const,
        p_step_count: 0,
        p_distance_meters: null,
        p_calories_estimate: null,
        p_perceived_effort: (payload as ManualActivityPayload).perceivedEffort ?? null,
        p_notes: (payload as ManualActivityPayload).notes?.trim()
          ? (payload as ManualActivityPayload).notes!.trim()
          : null,
      }
    : {
        ...common,
        p_source: "svj_native" as const,
        p_step_count: Math.round(payload.stepCount),
        p_distance_meters: payload.distanceMeters ?? null,
        p_calories_estimate: payload.caloriesEstimate ?? null,
      };

  try {
    const { data, error } = await callRpc(rpcPayload);
    if (error) return { ok: false, error: error.message || "Couldn't save activity." };
    const envelope = data as { ok?: boolean; duplicate?: boolean; activity?: unknown } | null;
    if (!envelope || envelope.ok !== true || typeof envelope.activity !== "object")
      return { ok: false, error: "The server rejected this activity." };
    const activity = normalizeServerActivity(envelope.activity);
    if (!activity) return { ok: false, error: "The server returned an unreadable activity." };
    return { ok: true, duplicate: envelope.duplicate === true, activity };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error while saving.",
    };
  }
}

type ListActivitiesRpc = () => Promise<{ data: unknown; error: { message: string } | null }>;

/** Load the signed-in user's activities, newest first. */
export async function listServerActivities(callRpc: ListActivitiesRpc): Promise<{
  ok: boolean;
  activities: ServerActivity[];
  error?: string;
}> {
  try {
    const { data, error } = await callRpc();
    if (error)
      return { ok: false, activities: [], error: error.message || "Couldn't load history." };
    if (!Array.isArray(data))
      return { ok: false, activities: [], error: "Unexpected history response." };
    const activities = data
      .map((row) => normalizeServerActivity(row))
      .filter((a): a is ServerActivity => a !== null);
    return { ok: true, activities };
  } catch (error) {
    return {
      ok: false,
      activities: [],
      error: error instanceof Error ? error.message : "Network error while loading history.",
    };
  }
}

// ── Display helpers (real values only — no fabrication) ───────────────────

export function formatDurationLabel(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} hr`;
  return `${m} min`;
}

export function formatActivityDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const todayKey = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === todayKey) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
