// ============================================================================
// SVJ Automated Training — client adapters.
//
// Network-free helpers (payload building, normalization) live here so they stay
// unit-testable; the thin RPC wrappers take an injected caller so tests never
// touch the network. No client value is ever trusted as authoritative — the
// server validates ownership and derives identity from auth.uid().
// ============================================================================

import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import { MUSCLE_GROUPS, type MuscleGroup } from "./strength";
import {
  loadConventionForSlug,
  templateForSlot,
  type SessionFamily,
  type WorkoutTemplate,
} from "./trainingTemplates";
import type { PrescribedTarget } from "./trainingProgression";
import type { TrainingDecisionRecord } from "./trainingProgress";
import type { TrainingProfile } from "./trainingProfile";
import type { PlanSession, SplitDecision, WeeklyPlan } from "./trainingPlan";

export type TrainingRpcCaller = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Null when the app has no backend configured (signed-out / web preview). */
export function trainingRpcClient(): TrainingRpcCaller | null {
  if (!hasSupabaseConfig()) return null;
  // The training RPCs are not yet in the generated Database types. The RPC is
  // dereferenced lazily so an unavailable client fails inside each caller's
  // try/catch rather than at hook mount.
  return (fn, args) => {
    const typed = supabase as unknown as {
      rpc: (
        name: string,
        params?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    return typed.rpc(fn, args);
  };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

// ── Normalized server shapes ───────────────────────────────────────────────

export interface ServerTemplateIdentity {
  id: string;
  family: SessionFamily;
  variant: "A" | "B";
  name: string;
  currentVersion: number;
}

export interface TemplateLibraryEntry {
  templateId: string;
  templateVersion: number;
  customName: string | null;
  pinned: boolean;
  archived: boolean;
  useCount: number;
  lastCompletedAt: string | null;
}

export interface ServerPlanSession {
  id: string;
  slotIndex: number;
  templateId: string;
  templateVersion: number;
  scheduledDate: string;
  status: "scheduled" | "completed" | "skipped" | "moved";
  targets: PrescribedTarget[];
  completedActivityId: string | null;
}

export interface ServerPlan {
  id: string;
  policyVersion: string;
  splitId: string;
  splitName: string;
  blockStart: string;
  blockEnd: string;
  sessions: ServerPlanSession[];
}

export interface MuscleHistoryRow {
  muscle: MuscleGroup;
  directSets: number;
  supportingSets: number;
  directVolume: number;
  lastTrainedAt: string | null;
  lastTrainedDate: string | null;
}

function normalizeTarget(value: unknown): PrescribedTarget | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Record<string, unknown>;
  const slug = str(t.exerciseSlug) ?? str(t.exercise_slug);
  if (!slug) return null;
  return {
    exerciseSlug: slug,
    exerciseName: str(t.exerciseName) ?? str(t.exercise_name) ?? slug,
    loadType: (t.loadType ?? t.load_type ?? "weighted") as PrescribedTarget["loadType"],
    loadConvention: (t.loadConvention ??
      t.load_convention ??
      "barbell_total") as PrescribedTarget["loadConvention"],
    equipmentKey: str(t.equipmentKey) ?? str(t.equipment_key) ?? "unknown",
    workSets: num(t.workSets) ?? num(t.work_sets) ?? 3,
    repMin: num(t.repMin) ?? num(t.rep_min) ?? 8,
    repMax: num(t.repMax) ?? num(t.rep_max) ?? 12,
    durationSeconds: num(t.durationSeconds) ?? num(t.duration_seconds),
    loadKg: num(t.loadKg) ?? num(t.load_kg),
    targetRpe: num(t.targetRpe) ?? num(t.target_rpe) ?? 8,
  };
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function getTrainingProfile(
  callRpc: TrainingRpcCaller,
): Promise<{ ok: boolean; profile: unknown | null; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_get_my_training_profile");
    if (error) return { ok: false, profile: null, error: error.message };
    const env = data as { ok?: boolean; profile?: unknown } | null;
    if (!env || env.ok !== true) return { ok: false, profile: null, error: "Unexpected response." };
    return { ok: true, profile: env.profile ?? null };
  } catch (e) {
    return { ok: false, profile: null, error: e instanceof Error ? e.message : "Network error." };
  }
}

export function profileToPayload(profile: TrainingProfile): Record<string, unknown> {
  return {
    version: profile.version,
    setupComplete: profile.setupComplete,
    experience: profile.experience,
    goal: profile.goal,
    secondaryGoal: profile.secondaryGoal,
    availableDays: profile.availableDays,
    sessionsPerWeek: profile.sessionsPerWeek,
    sessionMinutes: profile.sessionMinutes,
    equipment: profile.equipment,
    avoidMovements: profile.avoidMovements,
    familiarMovements: profile.familiarMovements,
    prefersMachines: profile.prefersMachines,
    units: profile.units,
    loadConvention: profile.loadConvention,
    athlete: profile.athlete,
  };
}

export async function saveTrainingProfile(
  callRpc: TrainingRpcCaller,
  profile: TrainingProfile,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_save_training_profile", {
      p_profile: profileToPayload(profile),
    });
    if (error) return { ok: false, error: error.message };
    const env = data as { ok?: boolean } | null;
    return env?.ok === true
      ? { ok: true }
      : { ok: false, error: "The server rejected the profile." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

export async function listWorkoutTemplates(
  callRpc: TrainingRpcCaller,
): Promise<{ ok: boolean; templates: ServerTemplateIdentity[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_workout_templates");
    if (error) return { ok: false, templates: [], error: error.message };
    const env = data as { ok?: boolean; templates?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.templates))
      return { ok: false, templates: [], error: "Unexpected catalog response." };
    const templates = env.templates
      .map((raw): ServerTemplateIdentity | null => {
        if (!raw || typeof raw !== "object") return null;
        const t = raw as Record<string, unknown>;
        const id = str(t.id);
        const family = str(t.family);
        if (!id || !family) return null;
        return {
          id,
          family: family as SessionFamily,
          variant: t.variant === "B" ? "B" : "A",
          name: str(t.name) ?? id,
          currentVersion: num(t.currentVersion) ?? 1,
        };
      })
      .filter((t): t is ServerTemplateIdentity => t !== null);
    return { ok: true, templates };
  } catch (e) {
    return { ok: false, templates: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function saveMyTemplate(
  callRpc: TrainingRpcCaller,
  input: { templateId: string; customName?: string | null; pinned?: boolean; archived?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_save_my_template", {
      p_template_id: input.templateId,
      p_custom_name: input.customName ?? null,
      p_pinned: input.pinned ?? null,
      p_archived: input.archived ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return (data as { ok?: boolean } | null)?.ok === true
      ? { ok: true }
      : { ok: false, error: "Couldn't save the template." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function removeMyTemplate(
  callRpc: TrainingRpcCaller,
  templateId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_remove_my_template", {
      p_template_id: templateId,
    });
    if (error) return { ok: false, error: error.message };
    return (data as { ok?: boolean } | null)?.ok === true
      ? { ok: true }
      : { ok: false, error: "Couldn't remove the template." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function listMyTemplateLibrary(
  callRpc: TrainingRpcCaller,
): Promise<{ ok: boolean; library: TemplateLibraryEntry[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_my_template_library");
    if (error) return { ok: false, library: [], error: error.message };
    const env = data as { ok?: boolean; library?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.library))
      return { ok: false, library: [], error: "Unexpected library response." };
    const library = env.library
      .map((raw): TemplateLibraryEntry | null => {
        if (!raw || typeof raw !== "object") return null;
        const l = raw as Record<string, unknown>;
        const templateId = str(l.templateId);
        if (!templateId) return null;
        return {
          templateId,
          templateVersion: num(l.templateVersion) ?? 1,
          customName: str(l.customName),
          pinned: l.pinned === true,
          archived: l.archived === true,
          useCount: num(l.useCount) ?? 0,
          lastCompletedAt: str(l.lastCompletedAt),
        };
      })
      .filter((l): l is TemplateLibraryEntry => l !== null);
    return { ok: true, library };
  } catch (e) {
    return { ok: false, library: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

// ── Plan payload (pure) ────────────────────────────────────────────────────

export interface PlanPayload {
  split_id: string;
  split_name: string;
  policy_version: string;
  block_start: string;
  block_end: string;
  templates: {
    id: string;
    family: string;
    variant: string;
    name: string;
    version: number;
    payload: Record<string, unknown>;
  }[];
  sessions: {
    slot_index: number;
    template_id: string;
    template_version: number;
    scheduled_date: string;
    targets: PrescribedTarget[];
  }[];
}

/**
 * Convert a deterministic plan into the server payload, snapshotting each
 * template's reviewed prescription (immutable version) and per-exercise targets.
 * `previousLoadKg` prefills a working load from real history — never invented.
 */
export function buildPlanPayload(
  decision: SplitDecision,
  weekly: WeeklyPlan,
  options: {
    policyVersion: string;
    previousLoadKg?: (slug: string) => number | null;
  },
): PlanPayload {
  const usedFamilies = new Map<string, ReturnType<typeof templateForSlot>>();
  for (const slot of decision.slots) {
    const template = templateForSlot(slot.family, slot.variant);
    if (template) usedFamilies.set(template.id, template);
  }

  const templates = [...usedFamilies.values()]
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .map((t) => ({
      id: t.id,
      family: t.family,
      variant: t.variant,
      name: t.name,
      version: 1,
      payload: {
        estimatedMinutes: t.estimatedMinutes,
        warmup: t.warmup,
        progressionPolicy: t.progressionPolicy,
        exercises: t.exercises,
      },
    }));

  const sessions = weekly.sessions.map((session) => {
    const template = templateForSlot(session.family, session.variant);
    const targets = template ? prescribedTargetsForTemplate(template, options.previousLoadKg) : [];
    return {
      slot_index: session.slotIndex,
      template_id: session.templateId,
      template_version: 1,
      scheduled_date: session.scheduledDate,
      targets,
    };
  });

  return {
    split_id: decision.splitId,
    split_name: decision.splitName,
    policy_version: options.policyVersion,
    block_start: weekly.blockStart,
    block_end: weekly.blockEnd,
    templates,
    sessions,
  };
}

/**
 * Convert a reviewed template into logger targets. Loads are only ever prefilled
 * from real history (`previousLoadKg`); never invented.
 */
export function prescribedTargetsForTemplate(
  template: WorkoutTemplate,
  previousLoadKg?: (slug: string) => number | null,
): PrescribedTarget[] {
  return template.exercises.map((e) => ({
    exerciseSlug: e.slug,
    exerciseName: e.name,
    loadType: e.loadType,
    // The declared convention, not a blanket default: dumbbell per-hand work is
    // never compared against a barbell total or a machine stack.
    loadConvention: loadConventionForSlug(e.slug, e.loadType),
    equipmentKey: e.equipment[0] ?? "unknown",
    workSets: e.workSets,
    repMin: e.repMin,
    repMax: e.repMax,
    durationSeconds: e.durationSeconds,
    loadKg: previousLoadKg?.(e.slug) ?? null,
    targetRpe: e.rpe,
  }));
}

// ── Plan RPCs ──────────────────────────────────────────────────────────────

export async function createTrainingPlan(
  callRpc: TrainingRpcCaller,
  payload: PlanPayload,
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_create_training_plan", { p_payload: payload });
    if (error) return { ok: false, error: error.message };
    const env = data as { ok?: boolean; plan_id?: unknown } | null;
    if (!env || env.ok !== true) return { ok: false, error: "The server rejected the plan." };
    return { ok: true, planId: str(env.plan_id) ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

export function normalizeServerPlan(value: unknown): ServerPlan | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const id = str(p.id);
  if (!id) return null;
  const sessions: ServerPlanSession[] = Array.isArray(p.sessions)
    ? p.sessions
        .map((raw): ServerPlanSession | null => {
          if (!raw || typeof raw !== "object") return null;
          const s = raw as Record<string, unknown>;
          const sid = str(s.id);
          const templateId = str(s.templateId) ?? str(s.template_id);
          if (!sid || !templateId) return null;
          const status = s.status;
          return {
            id: sid,
            slotIndex: num(s.slotIndex) ?? 0,
            templateId,
            templateVersion: num(s.templateVersion) ?? 1,
            scheduledDate: str(s.scheduledDate) ?? "",
            status:
              status === "completed" || status === "skipped" || status === "moved"
                ? status
                : "scheduled",
            targets: Array.isArray(s.targets)
              ? s.targets.map(normalizeTarget).filter((t): t is PrescribedTarget => t !== null)
              : [],
            completedActivityId: str(s.completedActivityId),
          };
        })
        .filter((s): s is ServerPlanSession => s !== null)
    : [];
  return {
    id,
    policyVersion: str(p.policyVersion) ?? "unknown",
    splitId: str(p.splitId) ?? "custom",
    splitName: str(p.splitName) ?? "Training plan",
    blockStart: str(p.blockStart) ?? "",
    blockEnd: str(p.blockEnd) ?? "",
    sessions,
  };
}

export async function getMyTrainingPlan(
  callRpc: TrainingRpcCaller,
): Promise<{ ok: boolean; plan: ServerPlan | null; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_get_my_training_plan");
    if (error) return { ok: false, plan: null, error: error.message };
    const env = data as { ok?: boolean; plan?: unknown } | null;
    if (!env || env.ok !== true) return { ok: false, plan: null, error: "Unexpected response." };
    return { ok: true, plan: env.plan ? normalizeServerPlan(env.plan) : null };
  } catch (e) {
    return { ok: false, plan: null, error: e instanceof Error ? e.message : "Network error." };
  }
}

// ── Plan day management ────────────────────────────────────────────────────

/** Move a planned session. The server refuses completed slots and same-day clashes. */
export async function reschedulePlanSession(
  callRpc: TrainingRpcCaller,
  sessionId: string,
  newDate: string,
): Promise<{ ok: boolean; scheduledDate?: string; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_reschedule_plan_session", {
      p_session_id: sessionId,
      p_new_date: newDate,
    });
    if (error) return { ok: false, error: error.message };
    const env = data as { ok?: boolean; scheduled_date?: unknown } | null;
    if (!env || env.ok !== true) return { ok: false, error: "Couldn't move that session." };
    return { ok: true, scheduledDate: str(env.scheduled_date) ?? newDate };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

/** Skip a planned session. A rest day is a valid state, not a failure. */
export async function skipPlanSession(
  callRpc: TrainingRpcCaller,
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_skip_plan_session", {
      p_session_id: sessionId,
    });
    if (error) return { ok: false, error: error.message };
    return (data as { ok?: boolean } | null)?.ok === true
      ? { ok: true }
      : { ok: false, error: "Couldn't skip that session." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

// ── Training context (idempotent slot finalization) ────────────────────────

export interface TrainingContextInput {
  planId?: string | null;
  planSessionId?: string | null;
  templateId?: string | null;
  templateVersion?: number | null;
  targets?: PrescribedTarget[];
  feedback?: Record<string, unknown>;
}

export async function recordTrainingContext(
  callRpc: TrainingRpcCaller,
  clientSessionId: string,
  context: TrainingContextInput,
): Promise<{
  ok: boolean;
  duplicate?: boolean;
  /** True when this activity lost the race for an already-finalized slot. */
  slotAlreadyFinalized?: boolean;
  slotStatus?: string;
  error?: string;
}> {
  try {
    const { data, error } = await callRpc("svj_record_training_context", {
      p_client_session_id: clientSessionId,
      p_context: {
        plan_id: context.planId ?? null,
        plan_session_id: context.planSessionId ?? null,
        template_id: context.templateId ?? null,
        template_version: context.templateVersion ?? null,
        targets: context.targets ?? [],
        feedback: context.feedback ?? {},
      },
    });
    if (error) return { ok: false, error: error.message };
    const env = data as {
      ok?: boolean;
      duplicate?: unknown;
      slot_already_finalized?: unknown;
      slot_status?: unknown;
    } | null;
    if (!env || env.ok !== true) return { ok: false, error: "Couldn't record training context." };
    return {
      ok: true,
      duplicate: env.duplicate === true,
      slotAlreadyFinalized: env.slot_already_finalized === true,
      slotStatus: str(env.slot_status) ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

// ── Muscle history ─────────────────────────────────────────────────────────

export async function recentMuscleHistory(
  callRpc: TrainingRpcCaller,
  days = 7,
): Promise<{ ok: boolean; rows: MuscleHistoryRow[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_recent_muscle_history", { p_days: days });
    if (error) return { ok: false, rows: [], error: error.message };
    const env = data as { ok?: boolean; muscles?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.muscles))
      return { ok: false, rows: [], error: "Unexpected muscle history response." };
    const rows = env.muscles
      .map((raw): MuscleHistoryRow | null => {
        if (!raw || typeof raw !== "object") return null;
        const r = raw as Record<string, unknown>;
        const muscle = r.muscle;
        if (typeof muscle !== "string" || !MUSCLE_GROUPS.includes(muscle as MuscleGroup))
          return null;
        return {
          muscle: muscle as MuscleGroup,
          directSets: num(r.directSets) ?? 0,
          supportingSets: num(r.supportingSets) ?? 0,
          directVolume: num(r.directVolume) ?? 0,
          lastTrainedAt: str(r.lastTrainedAt),
          lastTrainedDate: str(r.lastTrainedDate),
        };
      })
      .filter((r): r is MuscleHistoryRow => r !== null);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, rows: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

// ── Legacy template import ─────────────────────────────────────────────────

export interface OwnedTemplateSet {
  reps: number;
  weightKg: number;
}

export interface OwnedTemplateExercise {
  exerciseId: string;
  /** Catalog slug; null for payloads imported before slugs were stored. */
  slug: string | null;
  name: string;
  primaryMuscle: string;
  sets: OwnedTemplateSet[];
}

export interface OwnedTemplate {
  id: string;
  name: string;
  sourceKey: string | null;
  exercises: OwnedTemplateExercise[];
}

/** Import one on-device template. Idempotent by (owner, source key). */
export async function importLegacyTemplate(
  callRpc: TrainingRpcCaller,
  payload: {
    sourceKey: string;
    name: string;
    exercises: {
      exercise_id: string;
      name: string;
      primary_muscle: string;
      sets: { reps: number; weight_kg: number }[];
    }[];
  },
): Promise<{ ok: boolean; templateId?: string; duplicate?: boolean; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_import_legacy_template", {
      p_source_key: payload.sourceKey,
      p_name: payload.name,
      p_exercises: payload.exercises,
    });
    if (error) return { ok: false, error: error.message };
    const env = data as { ok?: boolean; template_id?: unknown; duplicate?: unknown } | null;
    if (!env || env.ok !== true) return { ok: false, error: "The server rejected this import." };
    return {
      ok: true,
      templateId: str(env.template_id) ?? undefined,
      duplicate: env.duplicate === true,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

/** Templates already imported for this account, so nothing is offered twice. */
export async function listMyOwnedTemplates(
  callRpc: TrainingRpcCaller,
): Promise<{ ok: boolean; templates: OwnedTemplate[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_my_owned_templates");
    if (error) return { ok: false, templates: [], error: error.message };
    const env = data as { ok?: boolean; templates?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.templates))
      return { ok: false, templates: [], error: "Unexpected response." };
    const templates = env.templates
      .map((raw): OwnedTemplate | null => {
        if (!raw || typeof raw !== "object") return null;
        const t = raw as Record<string, unknown>;
        const id = str(t.id);
        if (!id) return null;
        const exercises: OwnedTemplateExercise[] = Array.isArray(t.exercises)
          ? t.exercises
              .map((rawExercise): OwnedTemplateExercise | null => {
                if (!rawExercise || typeof rawExercise !== "object") return null;
                const e = rawExercise as Record<string, unknown>;
                const exerciseId = str(e.exercise_id);
                const name = str(e.name);
                if (!exerciseId || !name) return null;
                const sets: OwnedTemplateSet[] = Array.isArray(e.sets)
                  ? e.sets
                      .map((rawSet): OwnedTemplateSet | null => {
                        if (!rawSet || typeof rawSet !== "object") return null;
                        const s = rawSet as Record<string, unknown>;
                        const reps = num(s.reps);
                        if (reps === null || reps <= 0) return null;
                        const weight = num(s.weight_kg);
                        return { reps: Math.round(reps), weightKg: weight !== null && weight > 0 ? weight : 0 };
                      })
                      .filter((s): s is OwnedTemplateSet => s !== null)
                  : [];
                return {
                  exerciseId,
                  slug: str(e.slug),
                  name,
                  primaryMuscle: str(e.primary_muscle) ?? "chest",
                  sets,
                };
              })
              .filter((e): e is OwnedTemplateExercise => e !== null)
          : [];
        return {
          id,
          name: str(t.name) ?? id,
          sourceKey: str(t.sourceKey),
          exercises,
        };
      })
      .filter((t): t is OwnedTemplate => t !== null);
    return { ok: true, templates };
  } catch (e) {
    return { ok: false, templates: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

// ── Decision audit ─────────────────────────────────────────────────────────

export async function listTrainingDecisions(
  callRpc: TrainingRpcCaller,
  limit = 50,
): Promise<{ ok: boolean; decisions: TrainingDecisionRecord[]; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_list_training_decisions", { p_limit: limit });
    if (error) return { ok: false, decisions: [], error: error.message };
    const env = data as { ok?: boolean; decisions?: unknown } | null;
    if (!env || env.ok !== true || !Array.isArray(env.decisions))
      return { ok: false, decisions: [], error: "Unexpected decision history response." };
    const decisions = env.decisions
      .map((raw): TrainingDecisionRecord | null => {
        if (!raw || typeof raw !== "object") return null;
        const d = raw as Record<string, unknown>;
        const slug = str(d.exerciseSlug) ?? str(d.exercise_slug);
        const action = str(d.action);
        if (!slug || !action) return null;
        return {
          exerciseSlug: slug,
          action: action as TrainingDecisionRecord["action"],
          rationale: str(d.rationale) ?? "",
          createdAt: str(d.createdAt) ?? str(d.created_at) ?? "",
          policyVersion: str(d.policyVersion) ?? str(d.policy_version) ?? undefined,
        };
      })
      .filter((d): d is TrainingDecisionRecord => d !== null);
    return { ok: true, decisions };
  } catch (e) {
    return { ok: false, decisions: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

export async function recordTrainingDecision(
  callRpc: TrainingRpcCaller,
  input: {
    exerciseSlug: string;
    action: string;
    rationale: string;
    payload?: Record<string, unknown>;
    policyVersion: string;
    activityId?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await callRpc("svj_record_training_decision", {
      p_payload: {
        exercise_slug: input.exerciseSlug,
        action: input.action,
        rationale: input.rationale,
        payload: input.payload ?? {},
        policy_version: input.policyVersion,
        activity_id: input.activityId ?? null,
      },
    });
    if (error) return { ok: false, error: error.message };
    return (data as { ok?: boolean } | null)?.ok === true
      ? { ok: true }
      : { ok: false, error: "Couldn't record the decision." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

/**
 * Convert an imported (owned) template into logger targets. Every value comes
 * from the stored payload — the recorded sets, never an invented prescription.
 * Exercises without a catalog slug are omitted (they cannot be resolved, so
 * the UI asks the user to add them explicitly).
 */
export function prescribedTargetsForOwnedTemplate(
  template: OwnedTemplate,
  previousLoadKg?: (slug: string) => number | null,
): PrescribedTarget[] {
  return template.exercises
    .filter((e): e is OwnedTemplateExercise & { slug: string } => Boolean(e.slug))
    .map((e) => {
      const reps = e.sets.map((s) => s.reps).filter((n) => n > 0);
      const loads = e.sets.map((s) => s.weightKg).filter((n) => n > 0);
      const repMin = reps.length > 0 ? Math.min(...reps) : 8;
      const repMax = reps.length > 0 ? Math.max(...reps) : 12;
      return {
        exerciseSlug: e.slug,
        exerciseName: e.name,
        loadType: "weighted" as const,
        loadConvention: loadConventionForSlug(e.slug, "weighted"),
        equipmentKey: "unknown",
        workSets: Math.max(1, e.sets.length),
        repMin,
        repMax: Math.max(repMin, repMax),
        durationSeconds: null,
        // Prefill from the load the user actually recorded, else real history.
        loadKg: loads.length > 0 ? Math.max(...loads) : (previousLoadKg?.(e.slug) ?? null),
        targetRpe: 8,
      };
    });
}

// ── Targeted exercise resolution for launching a template ──────────────────

/**
 * Build the logger's exercise drafts from a plan session's targets, resolving
 * each target's slug to a real catalog exercise. Unresolved slugs are reported
 * so the UI can ask the user to pick a known exercise (never guessed).
 */
export function resolveTargetsToProps(
  targets: PrescribedTarget[],
  catalogBySlug: Map<string, { id: string; name: string }>,
): {
  resolved: { target: PrescribedTarget; exerciseId: string; name: string }[];
  unresolved: PrescribedTarget[];
} {
  const resolved: { target: PrescribedTarget; exerciseId: string; name: string }[] = [];
  const unresolved: PrescribedTarget[] = [];
  for (const target of targets) {
    const found = catalogBySlug.get(target.exerciseSlug);
    if (found) resolved.push({ target, exerciseId: found.id, name: found.name });
    else unresolved.push(target);
  }
  return { resolved, unresolved };
}
