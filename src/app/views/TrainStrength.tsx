import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dumbbell,
  Plus,
  Trash2,
  X,
  Check,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trophy,
  Search,
  ArrowLeft,
  Target,
} from "lucide-react";
import { buildClientSessionId, formatDurationLabel } from "../lib/serverActivities";
import { useAuthUserId, useWorkoutQueue } from "../hooks/useWorkoutQueue";
import {
  clearWorkoutDraft,
  isRetryableFailure,
  readWorkoutDraft,
  writeWorkoutDraft,
  type WorkoutDraft,
} from "../lib/workoutQueue";
import {
  CATEGORY_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  STRENGTH_RECORD_LABELS,
  computeDraftSummary,
  createCustomExercise,
  createExerciseDraft,
  createSetDraft,
  formatRecordValue,
  formatSetLabel,
  formatVolume,
  listExercises,
  saveStrengthActivity,
  validateStrengthDraft,
  type ExerciseType,
  type MuscleGroup,
  type StrengthExerciseDraft,
  type StrengthExerciseOption,
  type StrengthSaveOutcome,
  type StrengthSetDraft,
} from "../lib/strength";
import { MuscleTrainedList } from "../components/StrengthDetails";
import { strengthRpcClient } from "../lib/strengthClient";
import { processActivityRewards, rewardsRpcClient, type ActivityRewards } from "../lib/rewards";
import {
  recordTrainingContext,
  resolveTargetsToProps,
  trainingRpcClient,
  type TrainingContextInput,
} from "../lib/trainingClient";
import { syncTrainingDecisions } from "../lib/trainingDecisionSync";
import { TRAINING_POLICY_VERSION } from "../lib/trainingPolicy";
import type { PrescribedTarget } from "../lib/trainingProgression";

export interface StrengthPrescription {
  /** Reviewed targets from the planned session (target vs actual). */
  targets: PrescribedTarget[];
  /** Plan/template linkage recorded against the canonical activity. */
  context: TrainingContextInput;
  /** Human explanation shown above the logger ("Why this session?"). */
  note?: string | null;
  title?: string | null;
}

type Phase = "idle" | "logging" | "summary" | "saved";

const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weighted_reps: "Weighted reps",
  bodyweight_reps: "Bodyweight reps",
  duration: "Time based",
};

/** Server stat name → Character Matrix display label (Update 04). */
const REWARD_STAT_LABELS: Record<string, string> = {
  fitness: "PHYSICAL",
  discipline: "DISCIPLINE",
  focus: "MENTAL",
};

/** Human target label, e.g. "3 × 8–12 @ 60 kg" or "3 × 45 sec". */
function formatTarget(target: PrescribedTarget): string {
  if (target.durationSeconds !== null) {
    return `${target.workSets} × ${target.durationSeconds} sec`;
  }
  const range =
    target.repMin === target.repMax ? `${target.repMax}` : `${target.repMin}–${target.repMax}`;
  const load = target.loadKg !== null && target.loadKg > 0 ? ` @ ${target.loadKg} kg` : "";
  return `${target.workSets} × ${range}${load}`;
}

const numeric = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const Field: React.FC<{
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  step?: number;
  testId?: string;
}> = ({ label, value, onChange, placeholder, step, testId }) => (
  <label className="flex-1">
    <span className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">{label}</span>
    <input
      type="number"
      inputMode="decimal"
      step={step ?? 1}
      min={0}
      value={value ?? ""}
      placeholder={placeholder}
      data-testid={testId}
      onChange={(e) => onChange(numeric(e.target.value))}
      className="mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-center text-sm font-mono text-white placeholder:text-[#8C8C90]/50"
    />
  </label>
);

/**
 * Structured strength logger (Update 03). Keeps a local draft while training and
 * saves atomically: ONE canonical activity with its exercises and sets, so a
 * retried save can never create a duplicate workout.
 */
export const TrainStrength: React.FC<{
  onExit: () => void;
  /** When present, the logger starts from a planned session's targets. */
  prescription?: StrengthPrescription | null;
}> = ({ onExit, prescription = null }) => {
  const queryClient = useQueryClient();
  const [catalog, setCatalog] = useState<StrengthExerciseOption[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [drafts, setDrafts] = useState<StrengthExerciseDraft[]>([]);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [endedAtMs, setEndedAtMs] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<StrengthSaveOutcome | null>(null);
  const [rewards, setRewards] = useState<ActivityRewards | null>(null);
  const [targetByExerciseId, setTargetByExerciseId] = useState<Map<string, PrescribedTarget>>(
    new Map(),
  );
  const [prescriptionNote, setPrescriptionNote] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [resumable, setResumable] = useState<WorkoutDraft | null>(null);
  /** Optional session RPE (1–10) — real effort evidence for future decisions. */
  const [perceivedEffort, setPerceivedEffort] = useState<number | null>(null);
  const sessionIdRef = useRef<string>("");
  const userId = useAuthUserId();
  const queue = useWorkoutQueue();

  // A draft survives a process restart: the workout is never lost to a reload.
  useEffect(() => {
    if (phase === "idle" && sessionIdRef.current === "") {
      setResumable(readWorkoutDraft(userId));
    }
  }, [phase, userId]);

  // Keep the on-device draft current while sets are being logged (never on a
  // timer that could mark work done — only real entered values are stored).
  useEffect(() => {
    if (phase !== "logging" || startedAtMs === null || sessionIdRef.current === "") return;
    writeWorkoutDraft(userId, {
      clientSessionId: sessionIdRef.current,
      startedAtMs,
      drafts,
      context: prescription?.context ?? null,
      targets: prescription?.targets ?? [],
      note: prescriptionNote,
    });
  }, [phase, startedAtMs, drafts, prescription, prescriptionNote, userId]);

  // Retry anything left pending as soon as the logger opens.
  useEffect(() => {
    if (queue.pendingCount > 0) void queue.sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.pendingCount]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    const client = strengthRpcClient();
    if (!client) {
      setCatalogError("Backend is not configured.");
      setCatalogLoading(false);
      return;
    }
    const result = await listExercises((fn, args) => client.rpc(fn, args));
    if (result.ok) setCatalog(result.exercises);
    else setCatalogError(result.error ?? "Couldn't load exercises.");
    setCatalogLoading(false);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const summary = useMemo(() => computeDraftSummary(drafts), [drafts]);

  const start = () => {
    sessionIdRef.current = buildClientSessionId();
    setOutcome(null);
    setRewards(null);
    setSaveError(null);
    setDraftError(null);
    setPendingSync(false);
    setPerceivedEffort(null);
    setEndedAtMs(null);
    setStartedAtMs(Date.now());

    // A planned session prefills TARGET values only — no set is marked done.
    if (prescription && prescription.targets.length > 0 && catalog.length > 0) {
      const bySlug = new Map(catalog.map((option) => [option.slug, option]));
      const { resolved, unresolved } = resolveTargetsToProps(prescription.targets, bySlug);
      const targetMap = new Map<string, PrescribedTarget>();
      const prefilled: StrengthExerciseDraft[] = [];
      for (const item of resolved) {
        const option = bySlug.get(item.target.exerciseSlug);
        if (!option) continue;
        const draft = createExerciseDraft(option);
        const sets = Array.from({ length: Math.max(1, item.target.workSets) }, () => ({
          ...createSetDraft(),
          weightKg: item.target.loadKg ?? null,
        }));
        targetMap.set(option.id, item.target);
        prefilled.push({ ...draft, sets });
      }
      setTargetByExerciseId(targetMap);
      setDrafts(prefilled);
      setPrescriptionNote(
        unresolved.length > 0
          ? `${unresolved.length} planned movement${unresolved.length === 1 ? "" : "s"} need a catalog match — add ${unresolved.length === 1 ? "it" : "them"} from the picker.`
          : (prescription.note ?? null),
      );
    } else {
      setTargetByExerciseId(new Map());
      setPrescriptionNote(prescription?.note ?? null);
      setDrafts([]);
    }
    setPhase("logging");
  };

  const reset = () => {
    clearWorkoutDraft(userId);
    sessionIdRef.current = "";
    setDrafts([]);
    setOutcome(null);
    setSaveError(null);
    setDraftError(null);
    setPendingSync(false);
    setPerceivedEffort(null);
    setTargetByExerciseId(new Map());
    setPrescriptionNote(null);
    setStartedAtMs(null);
    setEndedAtMs(null);
    setPhase("idle");
  };

  /** Restore an in-progress draft after a reload or process restart. */
  const resumeDraft = (draft: WorkoutDraft) => {
    sessionIdRef.current = draft.clientSessionId;
    setDrafts(draft.drafts);
    setStartedAtMs(draft.startedAtMs);
    setEndedAtMs(null);
    setPrescriptionNote(draft.note);
    setOutcome(null);
    setSaveError(null);
    setPendingSync(false);
    setResumable(null);
    setPhase("logging");
  };

  const addExercise = (option: StrengthExerciseOption) => {
    setDrafts((prev) => [...prev, createExerciseDraft(option)]);
    setPickerOpen(false);
    setDraftError(null);
  };

  const updateSet = (exerciseId: string, setId: string, patch: Partial<StrengthSetDraft>) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id !== exerciseId
          ? draft
          : {
              ...draft,
              sets: draft.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
            },
      ),
    );
  };

  const addSet = (exerciseId: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id !== exerciseId
          ? draft
          : { ...draft, sets: [...draft.sets, createSetDraft(draft.sets[draft.sets.length - 1])] },
      ),
    );
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id !== exerciseId || draft.sets.length <= 1
          ? draft
          : { ...draft, sets: draft.sets.filter((set) => set.id !== setId) },
      ),
    );
  };

  const removeExercise = (exerciseId: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== exerciseId));
  };

  const moveExercise = (exerciseId: string, direction: -1 | 1) => {
    setDrafts((prev) => {
      const index = prev.findIndex((draft) => draft.id === exerciseId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const setNotes = (exerciseId: string, notes: string) => {
    setDrafts((prev) =>
      prev.map((draft) => (draft.id === exerciseId ? { ...draft, notes } : draft)),
    );
  };

  const finish = () => {
    const invalid = validateStrengthDraft(drafts);
    if (invalid) {
      setDraftError(invalid);
      return;
    }
    setDraftError(null);
    const now = Date.now();
    setEndedAtMs(now);
    setPhase("summary");
  };

  const save = async () => {
    if (startedAtMs === null || endedAtMs === null) return;
    setSaving(true);
    setSaveError(null);
    const client = strengthRpcClient();
    if (!client) {
      setSaving(false);
      setSaveError("Backend is not configured.");
      return;
    }
    const result = await saveStrengthActivity((fn, args) => client.rpc(fn, args), {
      clientSessionId: sessionIdRef.current,
      startedAtMs,
      endedAtMs,
      durationSeconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000)),
      drafts,
      perceivedEffort: perceivedEffort ?? undefined,
    });
    setSaving(false);
    if (result.ok) {
      clearWorkoutDraft(userId);
      setOutcome(result);
      setPhase("saved");
      // Link the canonical activity to its plan slot (idempotent; a retry can
      // never finalize the same slot twice). A failure here never loses the
      // workout — it is already saved.
      if (!result.duplicate && prescription) {
        const trpc = trainingRpcClient();
        if (trpc) {
          void recordTrainingContext(trpc, sessionIdRef.current, {
            ...prescription.context,
            targets: prescription.targets,
          });
        }
      }
      // Progression decisions: judged from the server's real history for each
      // prescribed exercise and written to the audit trail (idempotent). A
      // failure here never touches the already-canonical workout.
      if (!result.duplicate && result.activity && targetByExerciseId.size > 0) {
        const trpc = trainingRpcClient();
        if (trpc) {
          const exercises = [...targetByExerciseId.entries()].map(([exerciseId, target]) => ({
            exerciseId,
            target,
          }));
          void syncTrainingDecisions({
            trainingClient: trpc,
            strengthCall: (fn, args) => client.rpc(fn, args),
            exercises,
            activityId: result.activity.id,
            policyVersion: TRAINING_POLICY_VERSION,
          });
        }
      }
      // Update 04: server-confirmed rewards. Only a NEW workout processes
      // rewards; a retried save returns the original workout and must never
      // re-announce them. The server enforces zero duplicates regardless.
      if (!result.duplicate && result.activity) {
        const rpc = rewardsRpcClient();
        if (rpc) {
          const processed = await processActivityRewards(rpc, result.activity.id);
          if (processed.ok) setRewards(processed.rewards ?? null);
          // A rewards failure never fails the save — the workout is canonical.
          // Refresh Character Matrix + profile XP without a reload once the
          // server confirms progression for this workout.
          if (
            processed.ok &&
            processed.rewards &&
            (processed.rewards.xpAwarded > 0 ||
              Object.keys(processed.rewards.statChanges).length > 0)
          ) {
            void queryClient.invalidateQueries({ queryKey: ["user-stats"] });
          }
        }
      }
    } else if (isRetryableFailure(result.error)) {
      // The connection failed, not the workout: keep the real data on this
      // device and replay the SAME client_session_id when the server is
      // reachable again. Nothing is claimed as saved.
      queue.enqueueNow({
        clientSessionId: sessionIdRef.current,
        startedAtMs,
        endedAtMs,
        durationSeconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000)),
        drafts,
        perceivedEffort: perceivedEffort ?? undefined,
        context: prescription?.context ?? null,
        targets: prescription?.targets ?? [],
        slugByExerciseId: Object.fromEntries(
          [...targetByExerciseId.entries()].map(([id, target]) => [id, target.exerciseSlug]),
        ),
      });
      setPendingSync(true);
      setSaveError(result.error ?? "Couldn't save the workout.");
    } else {
      setPendingSync(false);
      setSaveError(result.error ?? "Couldn't save the workout.");
    }
  };

  const durationSeconds =
    startedAtMs !== null && endedAtMs !== null
      ? Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000))
      : 0;

  return (
    <div
      className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5"
      data-testid="strength-logger"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-[#C81E3A]" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-white">
            Strength Workout
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            onExit();
          }}
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white"
        >
          <ArrowLeft className="h-3 w-3" /> Activity
        </button>
      </div>

      {prescriptionNote && phase !== "saved" && (
        <p
          data-testid="strength-prescription-note"
          className="mb-2 whitespace-pre-line rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3 py-2 text-[11px] font-inter text-[#E8D9A0]"
        >
          {prescriptionNote}
        </p>
      )}

      {phase === "idle" && (
        <div className="py-6 text-center">
          <p className="font-anton text-lg uppercase tracking-wider text-white">
            {prescription?.title ?? "STRUCTURED STRENGTH"}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-[11px] font-mono text-[#8C8C90]">
            Log exercises, sets, reps and weight. One workout is saved as a single canonical
            activity with its full exercise history.
          </p>
          {resumable && (
            <div
              data-testid="strength-resume-draft"
              className="mx-auto mt-4 max-w-sm rounded-2xl border border-white/10 bg-black/40 p-3 text-left"
            >
              <p className="text-[11px] font-mono uppercase tracking-wider text-white">
                Unfinished workout on this device
              </p>
              <p className="mt-1 text-[10px] font-mono text-[#8C8C90]">
                {resumable.drafts.length} exercise{resumable.drafts.length === 1 ? "" : "s"} logged
                — pick up where you left off, or discard it.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => resumeDraft(resumable)}
                  className="flex-1 rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                >
                  Resume workout
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearWorkoutDraft(userId);
                    setResumable(null);
                  }}
                  className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={start}
            data-testid="strength-start"
            className="mt-4 rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-5 py-3 text-xs font-mono font-bold uppercase tracking-widest text-white hover:bg-[#C81E3A]/30"
          >
            {resumable ? "START A NEW WORKOUT" : "START WORKOUT"}
          </button>
          {queue.pendingCount > 0 && (
            <p
              data-testid="strength-queue-count"
              className="mt-3 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]"
            >
              {queue.pendingCount} workout{queue.pendingCount === 1 ? "" : "s"} waiting to sync
            </p>
          )}
        </div>
      )}

      {phase === "logging" && (
        <>
          {drafts.length === 0 && (
            <div className="rounded-2xl border border-white/5 bg-black/40 p-4 text-center">
              <p className="font-anton text-sm uppercase tracking-wider text-white">
                NO EXERCISES YET
              </p>
              <p className="mt-1 text-[11px] font-mono text-[#8C8C90]">
                Add your first exercise to start logging sets.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {drafts.map((draft, index) => (
              <div
                key={draft.id}
                data-testid="strength-exercise"
                className="rounded-2xl border border-white/10 bg-black/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      {draft.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-inter text-[10px] text-[#8C8C90]">
                        {MUSCLE_LABELS[draft.primaryMuscle]}
                      </span>
                      <span className="font-inter text-[10px] text-[#8C8C90]">
                        {EXERCISE_TYPE_LABELS[draft.exerciseType]}
                      </span>
                    </div>
                    {targetByExerciseId.get(draft.exerciseId) && (
                      <p
                        data-testid="strength-target"
                        className="mt-0.5 text-[10px] font-mono text-[#D4AF37]"
                      >
                        Target {formatTarget(targetByExerciseId.get(draft.exerciseId)!)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move ${draft.name} up`}
                      disabled={index === 0}
                      onClick={() => moveExercise(draft.id, -1)}
                      className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-[#8C8C90] disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${draft.name} down`}
                      disabled={index === drafts.length - 1}
                      onClick={() => moveExercise(draft.id, 1)}
                      className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-[#8C8C90] disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${draft.name}`}
                      onClick={() => removeExercise(draft.id)}
                      className="rounded-lg border border-white/10 p-1 text-[#8C8C90] hover:text-crimson"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 space-y-2">
                  {draft.sets.map((set, setIndex) => (
                    <div key={set.id} className="flex items-end gap-2" data-testid="strength-set">
                      <span className="w-10 pb-2 text-[9px] font-mono uppercase text-[#8C8C90]">
                        #{setIndex + 1}
                      </span>
                      {draft.exerciseType === "duration" ? (
                        <Field
                          label="Seconds"
                          value={set.durationSeconds}
                          placeholder="60"
                          testId="strength-set-duration"
                          onChange={(durationSeconds) =>
                            updateSet(draft.id, set.id, { durationSeconds })
                          }
                        />
                      ) : (
                        <>
                          <Field
                            label="Reps"
                            value={set.reps}
                            placeholder="10"
                            testId="strength-set-reps"
                            onChange={(reps) => updateSet(draft.id, set.id, { reps })}
                          />
                          <Field
                            label={draft.exerciseType === "weighted_reps" ? "Kg" : "Kg (opt)"}
                            value={set.weightKg}
                            placeholder={draft.exerciseType === "weighted_reps" ? "60" : "—"}
                            step={0.5}
                            testId="strength-set-weight"
                            onChange={(weightKg) => updateSet(draft.id, set.id, { weightKg })}
                          />
                        </>
                      )}
                      <button
                        type="button"
                        aria-pressed={set.isWarmup === true}
                        aria-label={
                          set.isWarmup
                            ? `Set ${setIndex + 1} is a warm-up set. Mark as working set`
                            : `Mark set ${setIndex + 1} as a warm-up set`
                        }
                        title="Warm-up set — shown in history but never counts as working volume"
                        onClick={() =>
                          updateSet(draft.id, set.id, { isWarmup: set.isWarmup !== true })
                        }
                        data-testid="strength-set-warmup"
                        className={`mb-1.5 rounded-md border px-1.5 py-1 text-[9px] font-mono uppercase tracking-wider ${
                          set.isWarmup
                            ? "border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]"
                            : "border-white/10 text-[#8C8C90] hover:text-white"
                        }`}
                      >
                        WU
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove set ${setIndex + 1}`}
                        onClick={() => removeSet(draft.id, set.id)}
                        disabled={draft.sets.length <= 1}
                        className="pb-2 text-[#8C8C90] disabled:opacity-30 hover:text-crimson"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addSet(draft.id)}
                    data-testid="strength-add-set"
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white"
                  >
                    <Plus className="h-3 w-3" /> Set
                  </button>
                  <input
                    value={draft.notes ?? ""}
                    onChange={(e) => setNotes(draft.id, e.target.value)}
                    aria-label={`Note for ${draft.name}`}
                    maxLength={300}
                    placeholder="Note (optional)"
                    className="flex-1 rounded-lg border border-white/10 bg-[#17171A] px-2 py-1.5 text-[11px] font-mono text-white placeholder:text-[#8C8C90]/50"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              data-testid="strength-add-exercise"
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
            >
              <Plus className="h-3 w-3" /> Add Exercise
            </button>
            <button
              type="button"
              onClick={finish}
              data-testid="strength-finish"
              disabled={drafts.length === 0}
              className="ml-auto rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-40"
            >
              FINISH WORKOUT
            </button>
          </div>

          {draftError && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1.5 text-[10px] font-mono text-crimson"
            >
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {draftError}
            </p>
          )}

          {pickerOpen && (
            <ExercisePicker
              catalog={catalog}
              loading={catalogLoading}
              error={catalogError}
              onRetry={() => void loadCatalog()}
              onSelect={addExercise}
              onClose={() => setPickerOpen(false)}
              onCreated={(option) => {
                setCatalog((prev) => [...prev, option]);
                addExercise(option);
              }}
            />
          )}
        </>
      )}

      {(phase === "summary" || phase === "saved") && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="strength-summary"
        >
          <p className="font-anton text-lg uppercase tracking-wider text-white">
            STRENGTH COMPLETE
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Duration" value={formatDurationLabel(durationSeconds)} />
            <Stat label="Exercises" value={String(summary.exerciseCount)} />
            <Stat label="Sets" value={String(summary.setCount)} />
            <Stat label="Total Reps" value={String(summary.totalReps)} />
          </div>
          {summary.volumeKg > 0 && (
            <div className="mt-2 rounded-2xl border border-white/5 bg-black/40 p-3">
              <div className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">
                Training Volume
              </div>
              <div className="font-mono text-xl font-bold text-white">
                {formatVolume(summary.volumeKg)}
              </div>
              <p className="mt-0.5 text-[9px] font-mono text-[#8C8C90]">
                Weighted sets only — bodyweight sets add no load.
              </p>
            </div>
          )}
          <div className="mt-3">
            <MuscleTrainedList muscles={summary.muscles} />
          </div>

          <div className="mt-3 space-y-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-full border border-white/5 bg-black/40 p-2.5">
                <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                  {draft.name}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {draft.sets.map((set, index) => (
                    <li key={set.id} className="flex justify-between text-[11px] font-mono">
                      <span className="text-[#8C8C90]">
                        {set.isWarmup ? `WARM-UP ${index + 1}` : `SET ${index + 1}`}
                      </span>
                      <span className={set.isWarmup ? "text-[#8C8C90]" : "text-white"}>
                        {formatSetLabel(set)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {phase === "summary" && (
            <>
              <div className="mt-4" data-testid="strength-effort">
                <p
                  id="strength-effort-label"
                  className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]"
                >
                  How hard was it? (1–10)
                </p>
                <div
                  role="group"
                  aria-labelledby="strength-effort-label"
                  className="mt-1.5 flex flex-wrap gap-1"
                >
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={perceivedEffort === value}
                      aria-label={`Effort ${value} of 10`}
                      onClick={() => setPerceivedEffort((prev) => (prev === value ? null : value))}
                      className={`h-8 w-8 rounded-lg border font-mono text-[11px] ${
                        perceivedEffort === value
                          ? "border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]"
                          : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[9px] font-mono text-[#8C8C90]">
                  Optional — effort is real evidence for future load decisions, never a score.
                </p>
              </div>

              {pendingSync ? (
                <div
                  data-testid="strength-pending-sync"
                  className="mt-4 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3"
                >
                  <p className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-[#D4AF37]">
                    <Clock className="h-3.5 w-3.5" /> Pending sync
                  </p>
                  <p role="alert" className="mt-1 text-[11px] font-inter text-[#B8B8C0]">
                    COULDN'T SAVE WORKOUT — {saveError ?? "the server could not be reached"}. It is
                    kept on this device and will sync automatically when you're back online; nothing
                    is counted until the server confirms it.
                  </p>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    data-testid="strength-retry"
                    className="mt-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] disabled:opacity-40"
                  >
                    {saving ? "Syncing…" : "Retry"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  data-testid="strength-save"
                  className="mt-4 w-full rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-3 text-xs font-mono font-bold uppercase tracking-widest text-white disabled:opacity-50"
                >
                  {saving ? "SAVING…" : "SAVE ACTIVITY"}
                </button>
              )}
              {saveError && !pendingSync && (
                <div className="mt-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3">
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 text-[11px] font-mono text-crimson"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    COULDN'T SAVE WORKOUT — {saveError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void save()}
                    data-testid="strength-retry"
                    className="mt-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-crimson"
                  >
                    Retry
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={reset}
                className="mt-3 w-full text-[9px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
              >
                Discard workout
              </button>
            </>
          )}

          {phase === "saved" && outcome && (
            <>
              <p
                role="status"
                className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {outcome.duplicate
                  ? "Already saved — no duplicate workout created."
                  : "Saved to your activity history."}
              </p>

              {/* Update 04: compact server-confirmed reward summary. */}
              {!outcome.duplicate &&
                rewards &&
                (rewards.xpAwarded > 0 || Object.keys(rewards.statChanges).length > 0) && (
                  <div
                    data-testid="strength-rewards"
                    className="mt-3 rounded-2xl border border-[#C81E3A]/30 bg-black/40 px-3 py-2"
                  >
                    {rewards.xpAwarded > 0 && (
                      <p className="text-[11px] font-mono font-bold text-[#C81E3A]">
                        +{rewards.xpAwarded} XP
                      </p>
                    )}
                    {Object.entries(REWARD_STAT_LABELS).map(([key, label]) => {
                      const gain = rewards.statChanges[key];
                      if (!gain) return null;
                      return (
                        <p key={key} className="text-[10px] font-mono text-[#8C8C90]">
                          {label} +{gain}
                        </p>
                      );
                    })}
                    {rewards.prBonusAwarded > 0 && (
                      <p className="mt-0.5 text-[10px] font-mono text-gold">NEW PR 🔥</p>
                    )}
                  </div>
                )}

              {/* A retried save returns the original workout: it must never
                  re-announce the same personal record. */}
              {!outcome.duplicate && outcome.strengthRecords.length > 0 && (
                <div
                  data-testid="strength-new-pr"
                  className="mt-3 rounded-2xl border border-gold/40 bg-gold/5 p-3"
                >
                  <p className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-gold">
                    <Trophy className="h-3.5 w-3.5" /> NEW PERSONAL RECORD
                  </p>
                  <ul className="mt-2 space-y-2">
                    {outcome.strengthRecords.map((record) => (
                      <li
                        key={`${record.recordType}-${record.exerciseId}`}
                        className="text-[11px] font-mono"
                      >
                        <div className="text-white">
                          {record.exerciseName ?? "Exercise"} —{" "}
                          {STRENGTH_RECORD_LABELS[record.recordType]}
                        </div>
                        <div className="text-gold">
                          {formatRecordValue(record.recordType, record.value)}
                          {record.previousValue !== null && (
                            <span className="ml-2 text-[#8C8C90]">
                              previous {formatRecordValue(record.recordType, record.previousValue)}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {outcome.goalProgress.length > 0 && (
                <div
                  data-testid="strength-goal-progress"
                  className="mt-3 rounded-2xl border border-[#C81E3A]/30 bg-black/40 p-3"
                >
                  <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white">
                    <Target className="h-3.5 w-3.5 text-[#E62846]" /> GOAL PROGRESS
                  </p>
                  <ul className="mt-2 space-y-1">
                    {outcome.goalProgress.map((goal) => (
                      <li
                        key={goal.id}
                        className="flex items-center justify-between text-[11px] font-mono"
                      >
                        <span className="text-[#8C8C90]">
                          {goal.periodType === "monthly" ? "Monthly" : "Weekly"}
                          {goal.activityType ? ` ${goal.activityType}` : ""}
                        </span>
                        <span className="text-white">
                          {Math.round(goal.progress).toLocaleString()} /{" "}
                          {Math.round(goal.targetValue).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-full border border-white/10 bg-black/40 px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
                >
                  Log another
                </button>
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    onExit();
                  }}
                  className="flex-1 rounded-full border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-white/5 bg-black/40 p-3">
    <div className="text-[9px] font-mono uppercase text-[#8C8C90]">{label}</div>
    <div className="font-mono text-xl font-bold text-white">{value}</div>
  </div>
);

/** Catalog picker + user-owned custom exercise creation. */
const ExercisePicker: React.FC<{
  catalog: StrengthExerciseOption[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (option: StrengthExerciseOption) => void;
  onClose: () => void;
  onCreated: (option: StrengthExerciseOption) => void;
}> = ({ catalog, loading, error, onRetry, onSelect, onClose, onCreated }) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>("chest");
  const [customType, setCustomType] = useState<ExerciseType>("weighted_reps");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customSaving, setCustomSaving] = useState(false);

  const filtered = catalog.filter((option) => {
    if (category !== "all" && option.category !== category) return false;
    if (!query.trim()) return true;
    return option.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const create = async () => {
    setCustomSaving(true);
    setCustomError(null);
    const client = strengthRpcClient();
    if (!client) {
      setCustomSaving(false);
      setCustomError("Backend is not configured.");
      return;
    }
    const result = await createCustomExercise((fn, args) => client.rpc(fn, args), {
      name: customName,
      primaryMuscle: customMuscle,
      exerciseType: customType,
    });
    setCustomSaving(false);
    if (result.ok && result.exercise) {
      onCreated(result.exercise);
    } else {
      setCustomError(result.error ?? "Couldn't create the exercise.");
    }
  };

  return (
    <div
      className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-3"
      data-testid="strength-exercise-picker"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-white">
          Add exercise
        </span>
        <button type="button" onClick={onClose} aria-label="Close exercise picker">
          <X className="h-3.5 w-3.5 text-[#8C8C90]" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-[#17171A] px-2">
        <Search className="h-3.5 w-3.5 text-[#8C8C90]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search exercises"
          placeholder="Search exercises"
          className="w-full bg-transparent py-2 text-xs font-mono text-white placeholder:text-[#8C8C90]/60 focus:outline-none"
        />
      </div>

      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {["all", ...EXERCISE_CATEGORIES].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-mono uppercase tracking-wider ${
              category === id
                ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                : "border-white/10 bg-black/40 text-[#8C8C90]"
            }`}
          >
            {id === "all" ? "All" : (CATEGORY_LABELS[id] ?? id)}
          </button>
        ))}
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-4 text-[10px] font-mono uppercase text-[#8C8C90]">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading catalog…
        </p>
      )}

      {!loading && error && (
        <div className="mt-2 rounded-lg border border-crimson/30 bg-crimson/5 p-2.5 text-center">
          <p className="text-[10px] font-mono text-crimson">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 rounded-lg border border-crimson/40 bg-crimson/10 px-2.5 py-1 text-[9px] font-mono uppercase text-crimson"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {filtered.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onSelect(option)}
                data-testid="strength-exercise-option"
                className="flex w-full items-center justify-between rounded-lg border border-white/5 bg-black/40 px-2.5 py-2 text-left hover:border-[#C81E3A]/40"
              >
                <span className="text-[11px] font-mono text-white">{option.name}</span>
                <span className="flex items-center gap-1.5 font-inter text-[10px] text-[#8C8C90]">
                  {MUSCLE_LABELS[option.primaryMuscle]}
                  {option.isCustom && (
                    <span className="rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-1.5 py-0.5 font-inter text-[9px] font-semibold uppercase tracking-[0.1em] text-[#C9A227]">
                      Custom
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-3 text-center text-[10px] font-mono text-[#8C8C90]">
              No match. Create a custom exercise below.
            </li>
          )}
        </ul>
      )}

      {!creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="strength-create-custom"
          className="mt-2 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#E62846]"
        >
          <Plus className="h-3 w-3" /> Create custom exercise
        </button>
      )}

      {creating && (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/40 p-2.5">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            maxLength={60}
            placeholder="Exercise name"
            className="w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs font-mono text-white placeholder:text-[#8C8C90]/50"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={customMuscle}
              onChange={(e) => setCustomMuscle(e.target.value as MuscleGroup)}
              className="rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs font-mono text-white"
            >
              {MUSCLE_GROUPS.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {MUSCLE_LABELS[muscle]}
                </option>
              ))}
            </select>
            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value as ExerciseType)}
              className="rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs font-mono text-white"
            >
              {EXERCISE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EXERCISE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          {customError && (
            <p role="alert" className="text-[10px] font-mono text-crimson">
              {customError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void create()}
              disabled={customSaving || customName.trim().length < 2}
              data-testid="strength-save-custom"
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-white disabled:opacity-40"
            >
              {customSaving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setCustomError(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]"
            >
              Cancel
            </button>
          </div>
          <p className="text-[9px] font-mono text-[#8C8C90]">
            Custom exercises belong to your account only and never change the shared catalog.
          </p>
        </div>
      )}
    </div>
  );
};
