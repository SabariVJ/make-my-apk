// ============================================================================
// Goals + Personal Records — Update 02.
//
// The server derives all progress from canonical activities (Update 01's
// svj_activities); the client can create, edit and cancel goals but can never
// state its own progress or PR. Source-eligibility mirrors the SQL rules in
// 20260916200000_goals_and_records.sql and lives here ONLY for display
// decisions — the server remains the authority.
// ============================================================================

export const GOAL_METRICS = ["workout_count", "step_total", "active_minutes", "distance"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_PERIODS = ["weekly", "monthly"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const RECORD_TYPES = [
  "most_steps_in_activity",
  "longest_activity_duration",
  "longest_distance",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  workout_count: "Workouts",
  step_total: "Steps",
  active_minutes: "Active Minutes",
  distance: "Distance",
};

export const RECORD_LABELS: Record<RecordType, string> = {
  most_steps_in_activity: "Most Steps",
  longest_activity_duration: "Longest Activity",
  longest_distance: "Longest Distance",
};

export interface GoalDto {
  id: string;
  metric: GoalMetric;
  activityType: string | null;
  targetValue: number;
  periodType: GoalPeriod;
  periodStart: string; // ISO date (yyyy-mm-dd)
  periodEnd: string;
  status: "active" | "completed" | "expired" | "cancelled";
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewRecordDto {
  recordType: RecordType;
  value: number;
  previousValue: number | null;
}

export interface RecordDto {
  recordType: RecordType;
  value: number;
  activityId: string;
  activityType: string;
  source: string;
  achievedAt: string;
}

export interface SaveExtras {
  newRecords: NewRecordDto[];
  goalProgress: GoalDto[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ── Period helpers (local-calendar semantics, no UTC shifting) ─────────────

export function periodBoundsWeekly(anchor: Date): { periodStart: string; periodEnd: string } {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // week starts Sunday, local
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { periodStart: isoDateOf(start), periodEnd: isoDateOf(end) };
}

export function periodBoundsMonthly(anchor: Date): { periodStart: string; periodEnd: string } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { periodStart: isoDateOf(start), periodEnd: isoDateOf(end) };
}

export function isoDateOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function periodLabel(
  goal: Pick<GoalDto, "periodStart" | "periodEnd" | "periodType">,
): string {
  if (goal.periodType === "weekly") return "This Week";
  const month = new Date(`${goal.periodStart}T00:00:00`);
  if (Number.isNaN(month.getTime())) return goal.periodStart;
  return month.toLocaleDateString("en-GB", { month: "long" });
}

// ── Client-side validation (the server repeats every rule) ────────────────

export function validateGoalInput(input: {
  metric: unknown;
  targetValue: unknown;
  periodType: unknown;
  periodStart: unknown;
  periodEnd: unknown;
  activityType?: unknown;
}): string | null {
  if (
    typeof input.metric !== "string" ||
    !(GOAL_METRICS as readonly string[]).includes(input.metric)
  )
    return "Choose a goal metric.";
  const target = num(input.targetValue);
  if (target === null || target <= 0 || target > 10_000_000)
    return "Target must be a positive number.";
  if (
    typeof input.periodType !== "string" ||
    !(GOAL_PERIODS as readonly string[]).includes(input.periodType)
  )
    return "Choose a weekly or monthly goal.";
  if (typeof input.periodStart !== "string" || !ISO_DATE.test(input.periodStart))
    return "Invalid start date.";
  if (typeof input.periodEnd !== "string" || !ISO_DATE.test(input.periodEnd))
    return "Invalid end date.";
  const days =
    (Date.parse(`${input.periodEnd}T00:00:00`) - Date.parse(`${input.periodStart}T00:00:00`)) /
    86_400_000;
  if (!Number.isFinite(days) || days < 0) return "End date must be on or after the start date.";
  if (input.periodType === "weekly" && days > 7) return "Weekly goals span at most 7 days.";
  if (input.periodType === "monthly" && days > 31) return "Monthly goals span at most 31 days.";
  if (
    input.activityType != null &&
    (typeof input.activityType !== "string" || input.activityType.length === 0)
  )
    return "Invalid activity type filter.";
  return null;
}

// ── Source-eligibility for DISPLAY (authoritative rules live in SQL) ───────

export function isEligibleForRecord(recordType: RecordType, source: string): boolean {
  if (recordType === "longest_activity_duration") return true;
  return source === "svj_native";
}

export function normalizeGoal(value: unknown): GoalDto | null {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  const id = typeof g.id === "string" ? g.id : null;
  const metric =
    typeof g.metric === "string" && (GOAL_METRICS as readonly string[]).includes(g.metric)
      ? (g.metric as GoalMetric)
      : null;
  const periodType =
    typeof g.period_type === "string" && (GOAL_PERIODS as readonly string[]).includes(g.period_type)
      ? (g.period_type as GoalPeriod)
      : null;
  const status =
    typeof g.status === "string" &&
    ["active", "completed", "expired", "cancelled"].includes(g.status)
      ? (g.status as GoalDto["status"])
      : null;
  const progress = num(g.progress);
  const target = num(g.target_value);
  if (!id || !metric || !periodType || !status || progress === null || target === null) return null;
  if (typeof g.period_start !== "string" || typeof g.period_end !== "string") return null;
  return {
    id,
    metric,
    activityType: typeof g.activity_type === "string" ? g.activity_type : null,
    targetValue: target,
    periodType,
    periodStart: g.period_start,
    periodEnd: g.period_end,
    status,
    progress,
    createdAt: typeof g.created_at === "string" ? g.created_at : g.period_start,
    updatedAt: typeof g.updated_at === "string" ? g.updated_at : g.period_start,
  };
}

export function normalizeNewRecords(value: unknown): NewRecordDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): NewRecordDto | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      if (
        typeof r.record_type !== "string" ||
        !(RECORD_TYPES as readonly string[]).includes(r.record_type)
      )
        return null;
      const value2 = num(r.value);
      if (value2 === null) return null;
      const previous = num(r.previous_value);
      return {
        recordType: r.record_type as RecordType,
        value: value2,
        previousValue: previous,
      };
    })
    .filter((r): r is NewRecordDto => r !== null);
}

export function normalizeRecord(value: unknown): RecordDto | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.record_type !== "string" ||
    !(RECORD_TYPES as readonly string[]).includes(r.record_type)
  )
    return null;
  const v = num(r.value);
  if (v === null || typeof r.activity_id !== "string") return null;
  return {
    recordType: r.record_type as RecordType,
    value: v,
    activityId: r.activity_id,
    activityType: typeof r.activity_type === "string" ? r.activity_type : "other",
    source: typeof r.source === "string" ? r.source : "svj_native",
    achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : "",
  };
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatGoalProgress(metric: GoalMetric, progress: number): string {
  if (metric === "distance")
    return `${(progress / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
  return Math.round(progress).toLocaleString();
}

export function formatRecordValue(recordType: RecordType, value: number): string {
  switch (recordType) {
    case "most_steps_in_activity":
      return Math.round(value).toLocaleString();
    case "longest_activity_duration": {
      const minutes = Math.round(value / 60);
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    case "longest_distance":
      return `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`;
  }
}

// ── RPC clients (injected callers keep tests network-free) ────────────────

type RpcCaller = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function unwrap<T>(
  envelope: unknown,
  key: string,
  normalize: (raw: unknown) => T | null,
): { ok: true; items: T[] } | { ok: false; error: string } {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    (envelope as Record<string, unknown>).ok !== true
  )
    return { ok: false, error: "The server returned an unreadable response." };
  const raw = (envelope as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return { ok: false, error: "The server returned an unreadable list." };
  const items = raw.map(normalize).filter((x): x is T => x !== null);
  return { ok: true, items };
}

export async function listGoals(
  callRpc: RpcCaller,
  includeCompleted = true,
): Promise<{ ok: boolean; goals: GoalDto[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_goals", {
      p_include_completed: includeCompleted,
    });
    if (error) return { ok: false, goals: [], error: error.message || "Couldn't load goals." };
    const result = unwrap(data, "goals", normalizeGoal);
    return result.ok
      ? { ok: true, goals: result.items }
      : { ok: false, goals: [], error: result.error };
  } catch (e) {
    return { ok: false, goals: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function createGoal(
  callRpc: RpcCaller,
  input: {
    metric: GoalMetric;
    targetValue: number;
    periodType: GoalPeriod;
    periodStart: string;
    periodEnd: string;
    activityType?: string | null;
  },
): Promise<{ ok: boolean; goal?: GoalDto; error?: string }> {
  const invalid = validateGoalInput(input);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { data, error } = await callRpc("svj_create_goal", {
      p_metric: input.metric,
      p_target_value: input.targetValue,
      p_period_type: input.periodType,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_activity_type: input.activityType ?? null,
    });
    if (error) return { ok: false, error: error.message || "Couldn't create the goal." };
    const env = data as { ok?: boolean; goal?: unknown } | null;
    const goal = env && env.ok === true ? normalizeGoal(env.goal) : null;
    if (!goal) return { ok: false, error: "The server rejected this goal." };
    return { ok: true, goal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function updateGoal(
  callRpc: RpcCaller,
  goalId: string,
  targetValue: number,
): Promise<{ ok: boolean; goal?: GoalDto; error?: string }> {
  const target = num(targetValue);
  if (!goalId || target === null || target <= 0)
    return { ok: false, error: "Invalid goal update." };
  try {
    const { data, error } = await callRpc("svj_update_goal", {
      p_goal_id: goalId,
      p_target_value: target,
    });
    if (error) return { ok: false, error: error.message || "Couldn't update the goal." };
    const env = data as { ok?: boolean; goal?: unknown } | null;
    const goal = env && env.ok === true ? normalizeGoal(env.goal) : null;
    if (!goal) return { ok: false, error: "The server rejected this update." };
    return { ok: true, goal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function cancelGoal(
  callRpc: RpcCaller,
  goalId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!goalId) return { ok: false, error: "Invalid goal." };
  try {
    const { error } = await callRpc("svj_cancel_goal", { p_goal_id: goalId });
    if (error) return { ok: false, error: error.message || "Couldn't cancel the goal." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function listRecords(
  callRpc: RpcCaller,
): Promise<{ ok: boolean; records: RecordDto[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_records");
    if (error) return { ok: false, records: [], error: error.message || "Couldn't load records." };
    const env = data as { ok?: boolean; records?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.records))
      return { ok: false, records: [], error: "The server returned an unreadable response." };
    const records = env.records.map(normalizeRecord).filter((r): r is RecordDto => r !== null);
    return { ok: true, records };
  } catch (e) {
    return { ok: false, records: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

/** Extract the Update 02 extras from a svj_save_activity envelope. */
export function extractSaveExtras(data: unknown): SaveExtras {
  if (!data || typeof data !== "object") return { newRecords: [], goalProgress: [] };
  const env = data as Record<string, unknown>;
  const goals = Array.isArray(env.goal_progress)
    ? env.goal_progress.map(normalizeGoal).filter((g): g is GoalDto => g !== null)
    : [];
  return { newRecords: normalizeNewRecords(env.new_records), goalProgress: goals };
}
