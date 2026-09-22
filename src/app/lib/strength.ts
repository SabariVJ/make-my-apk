// ============================================================================
// Structured strength logging — Update 03.
//
// The server (svj_save_strength_activity) is the authority: it validates every
// set, creates the canonical activity + exercise links + sets in ONE
// transaction, derives strength records from stored sets and keeps the whole
// save idempotent by (user, client_session_id). Everything here exists to build
// a trustworthy local draft, mirror the server's validation for instant
// feedback, and normalise server responses — no client value is ever treated as
// a personal record.
// ============================================================================

import { normalizeServerActivity, type ServerActivity } from "./serverActivities";
import { extractSaveExtras, type GoalDto, type NewRecordDto } from "./goalsRecords";
import { LOAD_CONVENTIONS, type LoadConvention } from "./trainingProfile";

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "full_body",
  "other",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  full_body: "Full Body",
  other: "Other",
};

export const EXERCISE_CATEGORIES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "core",
  "conditioning",
  "full_body",
  "other",
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  core: "Core",
  conditioning: "Conditioning",
  full_body: "Full Body",
  other: "Other",
};

export const EXERCISE_TYPES = ["weighted_reps", "bodyweight_reps", "duration"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Strength PR categories. Every one is derived from stored sets. */
export const STRENGTH_RECORD_TYPES = [
  "heaviest_weight",
  "best_set_reps",
  "best_exercise_volume",
] as const;
export type StrengthRecordType = (typeof STRENGTH_RECORD_TYPES)[number];

export const STRENGTH_RECORD_LABELS: Record<StrengthRecordType, string> = {
  heaviest_weight: "Heaviest Weight",
  best_set_reps: "Most Reps in a Set",
  best_exercise_volume: "Best Session Volume",
};

export interface StrengthExerciseOption {
  id: string;
  name: string;
  slug: string;
  category: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  exerciseType: ExerciseType;
  isCustom: boolean;
  /**
   * Declared load convention from the catalog (server-owned). null means the
   * catalog does not classify this movement, so its loads must not be compared.
   */
  loadConvention: LoadConvention | null;
}

/** A single set while the workout is still a local draft. */
export interface StrengthSetDraft {
  id: string;
  /** Reps for rep-based sets; null for duration sets. */
  reps: number | null;
  /** External load in kg. null = bodyweight (never a fabricated 0). */
  weightKg: number | null;
  /** Seconds for duration sets; null for rep-based sets. */
  durationSeconds: number | null;
  /**
   * Ramp-up set. Warm-ups are visible in history but never count toward working
   * muscle volume, personal records, progression evidence or work-set targets.
   */
  isWarmup: boolean;
}

export interface StrengthExerciseDraft {
  id: string;
  exerciseId: string;
  name: string;
  exerciseType: ExerciseType;
  primaryMuscle: MuscleGroup;
  /** Captured from the catalog when the exercise was added. */
  secondaryMuscles: MuscleGroup[];
  notes?: string;
  sets: StrengthSetDraft[];
}

export interface MuscleTrained {
  muscle: MuscleGroup;
  score: number;
  level: "high" | "medium" | "low";
}

export interface StrengthSummary {
  exerciseCount: number;
  setCount: number;
  totalReps: number;
  volumeKg: number;
  muscles: MuscleTrained[];
}

export interface StrengthRecordAchieved {
  recordType: StrengthRecordType;
  exerciseId: string;
  exerciseName: string | null;
  value: number;
  previousValue: number | null;
  setId: string | null;
}

export interface StrengthRecordDto {
  recordType: StrengthRecordType;
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  primaryMuscle: MuscleGroup;
  value: number;
  activityId: string;
  setId: string | null;
  achievedAt: string;
}

export interface StrengthSetDto {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  /** Ramp-up set — excluded from working volume and progression evidence. */
  isWarmup: boolean;
}

export interface StrengthExerciseDetail {
  exerciseId: string;
  name: string;
  exerciseType: ExerciseType;
  primaryMuscle: MuscleGroup;
  position: number;
  notes: string | null;
  sets: StrengthSetDto[];
}

export interface GoalContribution {
  goalId: string;
  metric: "workout_count" | "step_total" | "active_minutes" | "distance";
  activityType: string | null;
  periodType: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  progress: number;
  contribution: number;
}

export interface StrengthDetail {
  activityId: string;
  summary: StrengthSummary;
  exercises: StrengthExerciseDetail[];
  records: {
    recordType: StrengthRecordType;
    exerciseId: string;
    exerciseName: string;
    value: number;
    setId: string | null;
    achievedAt: string;
  }[];
  goalContributions: GoalContribution[];
}

export interface ExerciseHistorySession {
  activityId: string;
  performedAt: string;
  setCount: number;
  totalReps: number;
  volumeKg: number;
  bestWeight: number | null;
  bestReps: number | null;
  totalSeconds: number;
  sets: StrengthSetDto[];
}

export interface ExerciseHistory {
  exercise: StrengthExerciseOption;
  records: {
    recordType: StrengthRecordType;
    value: number;
    activityId: string;
    setId: string | null;
    achievedAt: string;
  }[];
  sessions: ExerciseHistorySession[];
}

export interface StrengthSaveOutcome {
  ok: boolean;
  duplicate?: boolean;
  activity?: ServerActivity;
  summary?: StrengthSummary;
  strengthRecords: StrengthRecordAchieved[];
  /** Update 02 universal records (e.g. longest activity). */
  universalRecords: NewRecordDto[];
  goalProgress: GoalDto[];
  error?: string;
}

type RpcCaller = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

let draftCounter = 0;
export function newDraftId(prefix = "draft"): string {
  draftCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${draftCounter}`;
}

// ── Draft construction (quick entry) ───────────────────────────────────────

/** A new set prefills the previous set's WEIGHT only — never the reps. */
export function createSetDraft(previous?: StrengthSetDraft): StrengthSetDraft {
  return {
    id: newDraftId("set"),
    reps: null,
    weightKg: previous?.weightKg ?? null,
    durationSeconds: null,
    isWarmup: false,
  };
}

export function createExerciseDraft(option: StrengthExerciseOption): StrengthExerciseDraft {
  return {
    id: newDraftId("ex"),
    exerciseId: option.id,
    name: option.name,
    exerciseType: option.exerciseType,
    primaryMuscle: option.primaryMuscle,
    secondaryMuscles: option.secondaryMuscles.filter((m) => m !== option.primaryMuscle),
    sets: [createSetDraft()],
  };
}

// ── Validation (the server repeats every rule authoritatively) ─────────────

function validateReps(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return "Enter reps for every set.";
  if (!Number.isInteger(value) || value < 1 || value > 1000)
    return "Reps must be a whole number between 1 and 1000.";
  return null;
}

function validateWeight(value: number | null, required: boolean): string | null {
  if (value === null) return required ? "Enter a weight for weighted exercises." : null;
  if (!Number.isFinite(value) || value < 0 || value > 2000)
    return "Weight must be between 0 and 2000 kg.";
  return null;
}

export function validateStrengthDraft(drafts: StrengthExerciseDraft[]): string | null {
  if (drafts.length < 1) return "Add at least one exercise before saving.";
  if (drafts.length > 20) return "A workout supports up to 20 exercises.";
  for (const draft of drafts) {
    if (!draft.exerciseId) return "Choose an exercise.";
    if (draft.notes != null && draft.notes.length > 300)
      return "Exercise notes are limited to 300 characters.";
    if (draft.sets.length < 1) return `Add at least one set to ${draft.name}.`;
    if (draft.sets.length > 30) return `${draft.name} supports up to 30 sets.`;
    for (const set of draft.sets) {
      if (draft.exerciseType === "duration") {
        if (
          set.durationSeconds === null ||
          !Number.isFinite(set.durationSeconds) ||
          !Number.isInteger(set.durationSeconds) ||
          set.durationSeconds < 1 ||
          set.durationSeconds > 14_400
        )
          return `Enter a duration between 1 second and 4 hours for ${draft.name}.`;
        continue;
      }
      const repsError = validateReps(set.reps);
      if (repsError) return `${repsError} (${draft.name})`;
      const weightError = validateWeight(set.weightKg, draft.exerciseType === "weighted_reps");
      if (weightError) return `${weightError} (${draft.name})`;
    }
  }
  return null;
}

/** Server-shaped payload. Array order defines position and set_number. */
export function buildStrengthPayload(drafts: StrengthExerciseDraft[]): {
  exercise_id: string;
  notes: string | null;
  sets: { reps: number | null; weight_kg: number | null; duration_seconds: number | null }[];
}[] {
  return drafts.map((draft) => ({
    exercise_id: draft.exerciseId,
    notes: draft.notes?.trim() ? draft.notes.trim() : null,
    sets: draft.sets.map((set) => ({
      reps: draft.exerciseType === "duration" ? null : (set.reps ?? null),
      weight_kg: draft.exerciseType === "duration" ? null : (set.weightKg ?? null),
      duration_seconds: draft.exerciseType === "duration" ? (set.durationSeconds ?? null) : null,
      is_warmup: set.isWarmup === true,
    })),
  }));
}

// ── Volume + muscle summary (client-side preview of server values) ─────────

/** weight × reps. Bodyweight sets (no external load) contribute nothing. */
export function setVolume(set: StrengthSetDraft): number {
  if (set.weightKg === null || set.reps === null) return 0;
  if (!Number.isFinite(set.weightKg) || !Number.isFinite(set.reps)) return 0;
  if (set.weightKg <= 0 || set.reps <= 0) return 0;
  return set.weightKg * set.reps;
}

export function exerciseVolume(draft: StrengthExerciseDraft): number {
  return draft.sets.reduce((total, set) => total + setVolume(set), 0);
}

/**
 * Deterministic muscle contributions: every WORKING set counts 1.0 for the
 * exercise's primary muscle and 0.5 for each secondary muscle, then levels are
 * relative to the strongest muscle in this session. Warm-up sets are excluded
 * (ramp-up work is not working volume). Not physiological data.
 */
export function computeMuscleSummary(drafts: StrengthExerciseDraft[]): MuscleTrained[] {
  const scores = new Map<MuscleGroup, number>();
  for (const draft of drafts) {
    const sets = draft.sets.filter((set) => set.isWarmup !== true).length;
    if (sets === 0) continue;
    scores.set(draft.primaryMuscle, (scores.get(draft.primaryMuscle) ?? 0) + sets * 1);
    for (const secondary of draft.secondaryMuscles) {
      if (secondary === draft.primaryMuscle) continue;
      scores.set(secondary, (scores.get(secondary) ?? 0) + sets * 0.5);
    }
  }
  if (scores.size === 0) return [];
  const top = Math.max(...scores.values());
  return [...scores.entries()]
    .map(([muscle, score]) => ({
      muscle,
      score: Math.round(score * 100) / 100,
      level: (score >= top * 0.66 ? "high" : score >= top * 0.33 ? "medium" : "low") as
        "high" | "medium" | "low",
    }))
    .sort((a, b) => b.score - a.score || a.muscle.localeCompare(b.muscle));
}

export function computeDraftSummary(drafts: StrengthExerciseDraft[]): StrengthSummary {
  let setCount = 0;
  let totalReps = 0;
  let volumeKg = 0;
  for (const draft of drafts) {
    setCount += draft.sets.length;
    for (const set of draft.sets) {
      if (set.reps !== null && Number.isFinite(set.reps)) totalReps += set.reps;
      volumeKg += setVolume(set);
    }
  }
  return {
    exerciseCount: drafts.length,
    setCount,
    totalReps,
    volumeKg: Math.round(volumeKg * 100) / 100,
    muscles: computeMuscleSummary(drafts),
  };
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatWeight(weightKg: number | null): string | null {
  if (weightKg === null || !Number.isFinite(weightKg)) return null;
  const rounded = Math.round(weightKg * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

/** "60 × 10", "Bodyweight × 12" or "60 sec". Never a fake 0 kg. */
export function formatSetLabel(set: {
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
}): string {
  if (set.durationSeconds !== null && set.durationSeconds > 0) return `${set.durationSeconds} sec`;
  const weightLabel = set.weightKg === null ? null : formatWeight(set.weightKg);
  if (weightLabel !== null && Number(weightLabel) > 0) return `${weightLabel} × ${set.reps ?? 0}`;
  return `Bodyweight × ${set.reps ?? 0}`;
}

export function formatVolume(volumeKg: number): string {
  const value = Number.isFinite(volumeKg) ? volumeKg : 0;
  return `${Math.round(value).toLocaleString()} kg`;
}

export function formatRecordValue(recordType: StrengthRecordType, value: number): string {
  if (recordType === "best_set_reps") return `${Math.round(value)} reps`;
  if (recordType === "best_exercise_volume") return formatVolume(value);
  return `${formatWeight(value)} kg`;
}

export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Server response normalisation ──────────────────────────────────────────

export function normalizeExerciseOption(value: unknown): StrengthExerciseOption | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id : null;
  const name = typeof e.name === "string" ? e.name : null;
  if (!id || !name) return null;
  if (!(EXERCISE_TYPES as readonly string[]).includes(e.exercise_type as string)) return null;
  const primary = MUSCLE_GROUPS.includes(e.primary_muscle as MuscleGroup)
    ? (e.primary_muscle as MuscleGroup)
    : "other";
  const secondary = Array.isArray(e.secondary_muscles)
    ? (e.secondary_muscles.filter((m) => MUSCLE_GROUPS.includes(m as MuscleGroup)) as MuscleGroup[])
    : [];
  return {
    id,
    name,
    slug: typeof e.slug === "string" ? e.slug : "",
    category: typeof e.category === "string" ? e.category : "other",
    primaryMuscle: primary,
    secondaryMuscles: secondary,
    exerciseType: e.exercise_type as ExerciseType,
    isCustom: e.is_custom === true,
    loadConvention: (LOAD_CONVENTIONS as readonly string[]).includes(e.load_convention as string)
      ? (e.load_convention as LoadConvention)
      : null,
  };
}

function normalizeSet(value: unknown): StrengthSetDto | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const setNumber = num(s.set_number);
  if (setNumber === null) return null;
  if (s.reps === null && s.duration_seconds === null) return null;
  return {
    setNumber,
    reps: num(s.reps),
    weightKg: num(s.weight_kg),
    durationSeconds: num(s.duration_seconds),
    isWarmup: s.is_warmup === true,
  };
}

export function normalizeMuscles(value: unknown): MuscleTrained[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw): MuscleTrained | null => {
      if (!raw || typeof raw !== "object") return null;
      const m = raw as Record<string, unknown>;
      if (!MUSCLE_GROUPS.includes(m.muscle as MuscleGroup)) return null;
      const score = num(m.score) ?? 0;
      const level =
        m.level === "high" || m.level === "medium" || m.level === "low" ? m.level : "low";
      return { muscle: m.muscle as MuscleGroup, score, level };
    })
    .filter((m): m is MuscleTrained => m !== null);
}

export function normalizeStrengthSummary(value: unknown): StrengthSummary | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const exerciseCount = num(s.exercise_count);
  const setCount = num(s.set_count);
  if (exerciseCount === null || setCount === null) return null;
  return {
    exerciseCount,
    setCount,
    totalReps: num(s.total_reps) ?? 0,
    volumeKg: num(s.volume_kg) ?? 0,
    muscles: normalizeMuscles(s.muscles),
  };
}

function normalizeAchievedRecord(
  value: unknown,
  names: Map<string, string>,
): StrengthRecordAchieved | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (!(STRENGTH_RECORD_TYPES as readonly string[]).includes(r.record_type as string)) return null;
  const exerciseId = typeof r.exercise_id === "string" ? r.exercise_id : null;
  const recordValue = num(r.value);
  if (!exerciseId || recordValue === null) return null;
  return {
    recordType: r.record_type as StrengthRecordType,
    exerciseId,
    exerciseName: names.get(exerciseId) ?? null,
    value: recordValue,
    previousValue: num(r.previous_value),
    setId: typeof r.set_id === "string" ? r.set_id : null,
  };
}

export function normalizeStrengthRecord(value: unknown): StrengthRecordDto | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (!(STRENGTH_RECORD_TYPES as readonly string[]).includes(r.record_type as string)) return null;
  const exerciseId = typeof r.exercise_id === "string" ? r.exercise_id : null;
  const activityId = typeof r.activity_id === "string" ? r.activity_id : null;
  const recordValue = num(r.value);
  if (!exerciseId || !activityId || recordValue === null) return null;
  return {
    recordType: r.record_type as StrengthRecordType,
    exerciseId,
    exerciseName: typeof r.exercise_name === "string" ? r.exercise_name : "Exercise",
    exerciseType: (EXERCISE_TYPES as readonly string[]).includes(r.exercise_type as string)
      ? (r.exercise_type as ExerciseType)
      : "weighted_reps",
    primaryMuscle: MUSCLE_GROUPS.includes(r.primary_muscle as MuscleGroup)
      ? (r.primary_muscle as MuscleGroup)
      : "other",
    value: recordValue,
    activityId,
    setId: typeof r.set_id === "string" ? r.set_id : null,
    achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : "",
  };
}

function normalizeGoalContribution(value: unknown): GoalContribution | null {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  const goalId = typeof g.goal_id === "string" ? g.goal_id : null;
  const metric = g.metric;
  if (!goalId) return null;
  if (!["workout_count", "step_total", "active_minutes", "distance"].includes(metric as string))
    return null;
  const targetValue = num(g.target_value);
  const progress = num(g.progress);
  const contribution = num(g.contribution);
  if (targetValue === null || progress === null || contribution === null) return null;
  if (typeof g.period_start !== "string" || typeof g.period_end !== "string") return null;
  return {
    goalId,
    metric: metric as GoalContribution["metric"],
    activityType: typeof g.activity_type === "string" ? g.activity_type : null,
    periodType: g.period_type === "weekly" ? "weekly" : "monthly",
    periodStart: g.period_start,
    periodEnd: g.period_end,
    targetValue,
    progress,
    contribution,
  };
}

export function normalizeStrengthDetail(value: unknown): StrengthDetail | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  if (d.ok !== true || typeof d.activity_id !== "string") return null;
  const summary = normalizeStrengthSummary(d.summary);
  if (!summary) return null;
  const exercises: StrengthExerciseDetail[] = [];
  if (Array.isArray(d.exercises)) {
    for (const raw of d.exercises) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      if (typeof e.exercise_id !== "string" || typeof e.name !== "string") continue;
      const sets = Array.isArray(e.sets)
        ? e.sets.map(normalizeSet).filter((s): s is StrengthSetDto => s !== null)
        : [];
      exercises.push({
        exerciseId: e.exercise_id,
        name: e.name,
        exerciseType: (EXERCISE_TYPES as readonly string[]).includes(e.exercise_type as string)
          ? (e.exercise_type as ExerciseType)
          : "weighted_reps",
        primaryMuscle: MUSCLE_GROUPS.includes(e.primary_muscle as MuscleGroup)
          ? (e.primary_muscle as MuscleGroup)
          : "other",
        position: num(e.position) ?? exercises.length,
        notes: typeof e.notes === "string" && e.notes.length > 0 ? e.notes : null,
        sets,
      });
    }
  }
  const records = Array.isArray(d.records)
    ? d.records
        .map((raw): StrengthDetail["records"][number] | null => {
          if (!raw || typeof raw !== "object") return null;
          const r = raw as Record<string, unknown>;
          if (!(STRENGTH_RECORD_TYPES as readonly string[]).includes(r.record_type as string))
            return null;
          const recordValue = num(r.value);
          if (recordValue === null || typeof r.exercise_id !== "string") return null;
          return {
            recordType: r.record_type as StrengthRecordType,
            exerciseId: r.exercise_id,
            exerciseName: typeof r.exercise_name === "string" ? r.exercise_name : "Exercise",
            value: recordValue,
            setId: typeof r.set_id === "string" ? r.set_id : null,
            achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : "",
          };
        })
        .filter((r): r is StrengthDetail["records"][number] => r !== null)
    : [];
  const goalContributions = Array.isArray(d.goal_contributions)
    ? d.goal_contributions
        .map(normalizeGoalContribution)
        .filter((g): g is GoalContribution => g !== null)
    : [];
  return {
    activityId: d.activity_id,
    summary,
    exercises,
    records,
    goalContributions,
  };
}

export function normalizeExerciseHistory(value: unknown): ExerciseHistory | null {
  if (!value || typeof value !== "object") return null;
  const h = value as Record<string, unknown>;
  if (h.ok !== true) return null;
  const exercise = normalizeExerciseOption(h.exercise);
  if (!exercise) return null;
  const sessions: ExerciseHistorySession[] = [];
  if (Array.isArray(h.sessions)) {
    for (const raw of h.sessions) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw as Record<string, unknown>;
      if (typeof s.activity_id !== "string") continue;
      sessions.push({
        activityId: s.activity_id,
        performedAt: typeof s.performed_at === "string" ? s.performed_at : "",
        setCount: num(s.set_count) ?? 0,
        totalReps: num(s.total_reps) ?? 0,
        volumeKg: num(s.volume_kg) ?? 0,
        bestWeight: num(s.best_weight),
        bestReps: num(s.best_reps),
        totalSeconds: num(s.totals_seconds) ?? 0,
        sets: Array.isArray(s.sets)
          ? s.sets.map(normalizeSet).filter((x): x is StrengthSetDto => x !== null)
          : [],
      });
    }
  }
  const records = Array.isArray(h.records)
    ? h.records
        .map((raw): ExerciseHistory["records"][number] | null => {
          if (!raw || typeof raw !== "object") return null;
          const r = raw as Record<string, unknown>;
          if (!(STRENGTH_RECORD_TYPES as readonly string[]).includes(r.record_type as string))
            return null;
          const recordValue = num(r.value);
          if (recordValue === null) return null;
          return {
            recordType: r.record_type as StrengthRecordType,
            value: recordValue,
            activityId: typeof r.activity_id === "string" ? r.activity_id : "",
            setId: typeof r.set_id === "string" ? r.set_id : null,
            achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : "",
          };
        })
        .filter((r): r is ExerciseHistory["records"][number] => r !== null)
    : [];
  return { exercise, records, sessions };
}

/** Extract strength + Update 02 extras from a save envelope. */
export function extractStrengthExtras(
  data: unknown,
  names: Map<string, string> = new Map(),
): Omit<StrengthSaveOutcome, "ok"> {
  const universal = extractSaveExtras(data);
  if (!data || typeof data !== "object")
    return { strengthRecords: [], universalRecords: [], goalProgress: [] };
  const env = data as Record<string, unknown>;
  const strengthRecords = Array.isArray(env.strength_records)
    ? env.strength_records
        .map((raw) => normalizeAchievedRecord(raw, names))
        .filter((r): r is StrengthRecordAchieved => r !== null)
    : [];
  return {
    summary: normalizeStrengthSummary(env.summary) ?? undefined,
    strengthRecords,
    universalRecords: universal.newRecords,
    goalProgress: universal.goalProgress,
  };
}

// ── RPC clients (injected caller keeps tests network-free) ────────────────

export async function listExercises(
  callRpc: RpcCaller,
): Promise<{ ok: boolean; exercises: StrengthExerciseOption[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_exercises");
    if (error)
      return { ok: false, exercises: [], error: error.message || "Couldn't load exercises." };
    const env = data as { ok?: boolean; exercises?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.exercises))
      return { ok: false, exercises: [], error: "The server returned an unreadable catalog." };
    const exercises = env.exercises
      .map(normalizeExerciseOption)
      .filter((e): e is StrengthExerciseOption => e !== null);
    return { ok: true, exercises };
  } catch (e) {
    return { ok: false, exercises: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function createCustomExercise(
  callRpc: RpcCaller,
  input: {
    name: string;
    primaryMuscle: MuscleGroup;
    secondaryMuscles?: MuscleGroup[];
    exerciseType: ExerciseType;
  },
): Promise<{ ok: boolean; exercise?: StrengthExerciseOption; error?: string }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60)
    return { ok: false, error: "Exercise names are between 2 and 60 characters." };
  if (!MUSCLE_GROUPS.includes(input.primaryMuscle))
    return { ok: false, error: "Choose a primary muscle group." };
  try {
    const { data, error } = await callRpc("svj_create_custom_exercise", {
      p_name: name,
      p_primary_muscle: input.primaryMuscle,
      p_secondary_muscles: (input.secondaryMuscles ?? []).filter((m) => m !== input.primaryMuscle),
      p_exercise_type: input.exerciseType,
    });
    if (error) return { ok: false, error: error.message || "Couldn't create the exercise." };
    const env = data as { ok?: boolean; exercise?: unknown } | null;
    const exercise = env && env.ok === true ? normalizeExerciseOption(env.exercise) : null;
    if (!exercise) return { ok: false, error: "The server rejected this exercise." };
    return { ok: true, exercise };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

/**
 * Save ONE structured strength workout. The same clientSessionId retried after
 * a network failure returns the original workout (duplicate = true) and never
 * creates a second activity, second set of records or duplicate goal progress.
 */
export async function saveStrengthActivity(
  callRpc: RpcCaller,
  input: {
    clientSessionId: string;
    startedAtMs: number;
    endedAtMs: number;
    durationSeconds: number;
    drafts: StrengthExerciseDraft[];
    perceivedEffort?: number;
    notes?: string;
  },
  nowMs = Date.now(),
): Promise<StrengthSaveOutcome> {
  const empty: StrengthSaveOutcome = {
    ok: false,
    strengthRecords: [],
    universalRecords: [],
    goalProgress: [],
  };
  const sessionId = input.clientSessionId?.trim() ?? "";
  if (sessionId.length < 8 || sessionId.length > 100)
    return { ...empty, error: "This workout cannot be saved. Start a new workout." };
  const invalid = validateStrengthDraft(input.drafts);
  if (invalid) return { ...empty, error: invalid };
  if (!Number.isFinite(input.startedAtMs) || !Number.isFinite(input.endedAtMs))
    return { ...empty, error: "Workout times are invalid." };
  if (input.endedAtMs <= input.startedAtMs)
    return { ...empty, error: "Workout end must be after its start." };
  if (input.endedAtMs > nowMs + 5 * 60_000)
    return { ...empty, error: "Workout end time cannot be in the future." };
  if (
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds < 1 ||
    input.durationSeconds > 86_400
  )
    return { ...empty, error: "Workout duration is out of range." };

  const names = new Map(input.drafts.map((d) => [d.exerciseId, d.name]));

  try {
    const { data, error } = await callRpc("svj_save_strength_activity", {
      p_client_session_id: sessionId,
      p_started_at: new Date(input.startedAtMs).toISOString(),
      p_ended_at: new Date(input.endedAtMs).toISOString(),
      p_duration_seconds: Math.round(input.durationSeconds),
      p_exercises: buildStrengthPayload(input.drafts),
      p_perceived_effort: input.perceivedEffort ?? null,
      p_notes: input.notes?.trim() ? input.notes.trim() : null,
    });
    if (error) return { ...empty, error: error.message || "Couldn't save the workout." };
    const env = data as { ok?: boolean; duplicate?: boolean; activity?: unknown } | null;
    if (!env || env.ok !== true || typeof env.activity !== "object")
      return { ...empty, error: "The server rejected this workout." };
    const activity = normalizeServerActivity(env.activity);
    if (!activity) return { ...empty, error: "The server returned an unreadable workout." };
    return {
      ok: true,
      duplicate: env.duplicate === true,
      activity,
      ...extractStrengthExtras(data, names),
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function getStrengthDetail(
  callRpc: RpcCaller,
  activityId: string,
): Promise<{ ok: boolean; detail?: StrengthDetail; error?: string }> {
  if (!activityId) return { ok: false, error: "Missing workout." };
  try {
    const { data, error } = await callRpc("svj_get_strength_detail", {
      p_activity_id: activityId,
    });
    if (error) return { ok: false, error: error.message || "Couldn't load the workout." };
    const detail = normalizeStrengthDetail(data);
    if (!detail) return { ok: false, error: "The server returned an unreadable workout." };
    return { ok: true, detail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function listStrengthSummaries(
  callRpc: RpcCaller,
  limit = 100,
): Promise<{ ok: boolean; summaries: Map<string, StrengthSummary>; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_strength_summaries", { p_limit: limit });
    if (error) return { ok: false, summaries: new Map(), error: error.message };
    const env = data as { ok?: boolean; summaries?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.summaries))
      return { ok: false, summaries: new Map(), error: "Unexpected strength summary response." };
    const summaries = new Map<string, StrengthSummary>();
    for (const raw of env.summaries) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const activityId = typeof row.activity_id === "string" ? row.activity_id : null;
      const summary = normalizeStrengthSummary(row);
      if (activityId && summary) summaries.set(activityId, summary);
    }
    return { ok: true, summaries };
  } catch (e) {
    return {
      ok: false,
      summaries: new Map(),
      error: e instanceof Error ? e.message : "Network error.",
    };
  }
}

export async function getExerciseHistory(
  callRpc: RpcCaller,
  exerciseId: string,
  limit = 20,
): Promise<{ ok: boolean; history?: ExerciseHistory; error?: string }> {
  if (!exerciseId) return { ok: false, error: "Missing exercise." };
  try {
    const { data, error } = await callRpc("svj_get_exercise_history", {
      p_exercise_id: exerciseId,
      p_limit: limit,
    });
    if (error) return { ok: false, error: error.message || "Couldn't load exercise history." };
    const history = normalizeExerciseHistory(data);
    if (!history) return { ok: false, error: "The server returned unreadable history." };
    return { ok: true, history };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function listStrengthRecords(
  callRpc: RpcCaller,
): Promise<{ ok: boolean; records: StrengthRecordDto[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_strength_records");
    if (error) return { ok: false, records: [], error: error.message || "Couldn't load records." };
    const env = data as { ok?: boolean; records?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.records))
      return { ok: false, records: [], error: "The server returned an unreadable response." };
    return {
      ok: true,
      records: env.records
        .map(normalizeStrengthRecord)
        .filter((r): r is StrengthRecordDto => r !== null),
    };
  } catch (e) {
    return { ok: false, records: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

/**
 * A protected strength record only exists when the workout carries real stored
 * sets. A manual "Strength 45 min" log has no sets, so it can never claim one.
 */
export function hasProtectedRecordEvidence(detail: StrengthDetail): boolean {
  return detail.exercises.some((exercise) =>
    exercise.sets.some((set) =>
      set.durationSeconds !== null ? set.durationSeconds > 0 : (set.reps ?? 0) > 0,
    ),
  );
}
