import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  Dumbbell,
  Plus,
  Trash2,
  Save,
  History,
  TrendingUp,
  Zap,
  X,
  Layers,
  CalendarCheck,
  BarChart3,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { WorkoutExercise } from "../types";
import { summarizeWorkout } from "../lib/activity";
import { StructuredStrengthCard } from "../components/StructuredStrengthCard";
import { TrainStrength, type StrengthPrescription } from "./TrainStrength";
import { TrainingToday } from "../components/TrainingToday";
import { TemplateBrowser } from "../components/TemplateBrowser";
import { TrainingProgress } from "../components/TrainingProgress";
import { useTrainingPlan } from "../hooks/useTrainingPlan";
import {
  FEATURE_FLAGS,
  isAutomatedTrainingEnabled,
  writeFeatureFlagOverride,
} from "../lib/featureFlags";
import { strengthRpcClient } from "../lib/strengthClient";
import { listServerActivities, formatActivityDate } from "../lib/serverActivities";
import { prescribedTargetsForTemplate, type TrainingContextInput } from "../lib/trainingClient";
import { explainSession, type PlanSession } from "../lib/trainingPlan";
import { templateForSlot, type WorkoutTemplate } from "../lib/trainingTemplates";

type Tab = "today" | "log" | "templates" | "history" | "progress";

const blankExercise = (): WorkoutExercise => ({
  id: `ex-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
  name: "",
  sets: [{ reps: 8, weight: 20 }],
});

export const WorkoutView: React.FC = () => {
  const {
    workouts,
    workoutTemplates,
    logWorkout,
    deleteWorkout,
    saveWorkoutTemplate,
    deleteWorkoutTemplate,
  } = useSVJ();

  const training = useTrainingPlan();
  // Runtime rollback: turning the guided experience off restores the previous
  // Train flow (Log / History / device templates) and never deletes any saved
  // profile, plan, decision or completed workout.
  const [guided, setGuided] = useState(() => isAutomatedTrainingEnabled());
  const [tab, setTab] = useState<Tab>(guided ? "today" : "log");
  const [name, setName] = useState("");
  const [exercises, setExercises] = useState<WorkoutExercise[]>([blankExercise()]);
  const [trendExercise, setTrendExercise] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Structured Strength is a focused flow inside Train, not another nav tab.
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [prescription, setPrescription] = useState<StrengthPrescription | null>(null);

  /** Open the canonical logger from a planned session (target vs actual). */
  const startPlanSession = (session: PlanSession) => {
    const serverSession = training.serverPlan?.sessions.find(
      (s) => s.slotIndex === session.slotIndex,
    );
    const template = templateForSlot(session.family, session.variant);
    const targets =
      serverSession && serverSession.targets.length > 0
        ? serverSession.targets
        : template
          ? prescribedTargetsForTemplate(template)
          : [];
    const context: TrainingContextInput = {
      planId: training.serverPlan?.id ?? null,
      planSessionId: serverSession?.id ?? null,
      templateId: session.templateId,
      templateVersion: serverSession?.templateVersion ?? 1,
    };
    setPrescription({
      targets,
      context,
      title: session.label,
      note: training.weekly ? explainSession(training.weekly, session) : null,
    });
    setStrengthOpen(true);
  };

  /** Open the logger from a browsed template (no plan slot). */
  const startTemplate = (template: WorkoutTemplate) => {
    setPrescription({
      targets: prescribedTargetsForTemplate(template),
      context: { templateId: template.id, templateVersion: 1 },
      title: template.name,
      note: `Browse session · ~${template.estimatedMinutes} min. ${template.warmup}`,
    });
    setStrengthOpen(true);
  };

  const closeStrength = () => {
    setStrengthOpen(false);
    setPrescription(null);
    void training.reloadMuscleHistory();
    void training.refresh();
  };

  // Real last structured session — read from the canonical activity pipeline
  // (`strength_log` provenance). No fabricated program/split state is shown.
  const recentStrengthQuery = useQuery({
    queryKey: ["train-last-strength"],
    queryFn: async () => {
      const client = strengthRpcClient();
      if (!client) return null;
      const result = await listServerActivities(() =>
        client.rpc("svj_list_activities", { p_limit: 50 }),
      );
      if (!result.ok) return null;
      const latest = result.activities.find((a) => a.source === "strength_log");
      return latest ? formatActivityDate(latest.startedAt) : null;
    },
    staleTime: 60_000,
    retry: false,
  });

  const updateExercise = (id: string, patch: Partial<WorkoutExercise>) =>
    setExercises((prev) => prev.map((ex) => (ex.id === id ? { ...ex, ...patch } : ex)));

  const updateSet = (exId: string, idx: number, field: "reps" | "weight", value: number) =>
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exId
          ? { ...ex, sets: ex.sets.map((s, i) => (i === idx ? { ...s, [field]: value } : s)) }
          : ex,
      ),
    );

  const totals = useMemo(() => summarizeWorkout(exercises), [exercises]);

  const exerciseNames = useMemo(() => {
    const names = new Set<string>();
    workouts.forEach((w) => w.exercises.forEach((ex) => names.add(ex.name.trim())));
    return Array.from(names).filter(Boolean).sort();
  }, [workouts]);

  const trendData = useMemo(() => {
    const target = trendExercise ?? exerciseNames[0];
    if (!target) return [];
    return workouts
      .slice()
      .reverse()
      .flatMap((w) =>
        w.exercises
          .filter((ex) => ex.name.trim().toLowerCase() === target.toLowerCase())
          .map((ex) => ({
            date: new Date(w.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" }),
            top: Math.max(...ex.sets.map((s) => s.weight), 0),
          })),
      );
  }, [workouts, trendExercise, exerciseNames]);

  const maxTop = Math.max(...trendData.map((d) => d.top), 1);

  const reset = () => {
    setName("");
    setExercises([blankExercise()]);
  };

  const handleLog = () => {
    const result = logWorkout(name, exercises);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    setSaveError(null);
    reset();
    setTab("history");
  };

  const loadTemplate = (tplId: string) => {
    const tpl = workoutTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    setName(tpl.name);
    setExercises(
      tpl.exercises.map((ex) => ({
        ...ex,
        id: `ex-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sets: ex.sets.map((s) => ({ ...s })),
      })),
    );
    setTab("log");
  };

  const allTabs: { id: Tab; label: string; icon: typeof Dumbbell }[] = [
    { id: "today", label: "Today", icon: CalendarCheck },
    { id: "templates", label: "Templates", icon: Layers },
    { id: "progress", label: "Progress", icon: BarChart3 },
    { id: "history", label: "History", icon: History },
    { id: "log", label: "Log", icon: Dumbbell },
  ];
  const tabs = guided
    ? allTabs
    : allTabs.filter((t) => t.id === "log" || t.id === "history" || t.id === "templates");

  const toggleGuided = () => {
    const next = !guided;
    writeFeatureFlagOverride(FEATURE_FLAGS.automatedTrainingV1, next);
    setGuided(next);
    setTab(next ? "today" : "log");
  };

  if (strengthOpen) {
    return (
      <div className="pb-24 pt-4 max-w-2xl mx-auto">
        <TrainStrength prescription={prescription} onExit={closeStrength} />
      </div>
    );
  }

  return (
    <div className="pb-28 space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-full svj-border bg-[#17171A] p-4">
        <div className="absolute -top-16 -right-10 w-40 h-40 rounded-full bg-[#C81E3A]/20 blur-3xl animate-crimson-pulse" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-anton text-2xl sm:text-3xl uppercase text-[#F4F2ED]">Iron Log</h1>
              <p className="font-inter text-sm text-[#8C8C90] mt-1">
                Track every lift. Every set feeds your{" "}
                <span className="text-[#C81E3A] font-semibold">Physical</span> stat.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleGuided}
              aria-pressed={guided}
              data-testid="train-guided-toggle"
              title={
                guided
                  ? "Turn off the guided training experience (your data is kept)"
                  : "Turn on the guided training experience"
              }
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider ${
                guided
                  ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-[#F4F2ED]"
                  : "border-white/10 bg-black/30 text-[#8C8C90]"
              }`}
            >
              Guided {guided ? "on" : "off"}
            </button>
          </div>
        </div>
      </div>

      {/* Structured Strength — the primary Train destination, always on top. */}
      <StructuredStrengthCard
        onStart={() => {
          // Prefer the planned session so the logger opens with real targets.
          if (training.todaySession) startPlanSession(training.todaySession);
          else {
            setPrescription(null);
            setStrengthOpen(true);
          }
        }}
        lastSessionLabel={recentStrengthQuery.data ?? null}
      />

      {/* Training modes */}
      {/* Horizontally scrollable so five destinations fit a narrow phone
          without shrinking the touch targets. */}
      <div
        role="tablist"
        aria-label="Training sections"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={active}
              data-testid={`train-tab-${t.id}`}
              className={`flex flex-1 shrink-0 items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-inter font-semibold transition-all cursor-pointer ${
                active
                  ? "bg-[#C81E3A]/15 border-[#C81E3A]/50 text-[#F4F2ED]"
                  : "bg-[#17171A] border-white/8 text-[#8C8C90] hover:text-[#F4F2ED]"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {guided && tab === "today" && (
          <motion.div
            key="today"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <TrainingToday
              profile={training.profile}
              profileReady={training.profileReady}
              loading={training.loading}
              savingProfile={training.savingProfile}
              creatingPlan={training.creatingPlan}
              splitName={training.decision?.splitName ?? null}
              explanation={training.weekly?.explanation ?? null}
              reasons={training.weekly?.reasons ?? []}
              sessions={training.weekly?.sessions ?? []}
              todaySession={training.todaySession}
              muscleRows={training.muscleRows}
              error={training.error}
              onSaveProfile={training.saveProfile}
              onGeneratePlan={training.generatePlan}
              onStartSession={startPlanSession}
              serverSessionIdForSlot={training.serverSessionIdForSlot}
              onMoveSession={training.moveSession}
              onSkipSession={training.skipSession}
            />
          </motion.div>
        )}

        {tab === "log" && (
          <motion.div
            key="log"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <input
              aria-label="Session name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Session name (e.g. Push Day)"
              className="w-full bg-[#17171A] svj-border rounded-xl px-4 py-3 text-[#F4F2ED] font-inter placeholder:text-[#8C8C90]/70 focus:outline-none focus:border-[#C81E3A]/60"
            />

            {exercises.map((ex, exIdx) => (
              <div key={ex.id} className="rounded-2xl bg-[#17171A] svj-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#C81E3A]">
                    {String(exIdx + 1).padStart(2, "0")}
                  </span>
                  <input
                    aria-label={`Exercise ${exIdx + 1} name`}
                    value={ex.name}
                    onChange={(e) => updateExercise(ex.id, { name: e.target.value })}
                    placeholder="Exercise name"
                    list="svj-exercise-names"
                    className="flex-1 bg-transparent border-b border-white/10 pb-1 text-[#F4F2ED] font-inter font-semibold placeholder:text-[#8C8C90]/70 focus:outline-none focus:border-[#C81E3A]/60"
                  />
                  {exercises.length > 1 && (
                    <button
                      onClick={() => setExercises((prev) => prev.filter((e2) => e2.id !== ex.id))}
                      className="text-[#8C8C90] hover:text-[#C81E3A] cursor-pointer"
                      aria-label="Remove exercise"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 text-[10px] uppercase tracking-wider font-inter text-[#8C8C90]">
                    <span>Set</span>
                    <span>Reps</span>
                    <span>Weight (kg)</span>
                    <span />
                  </div>
                  {ex.sets.map((st, i) => (
                    <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center">
                      <span className="font-mono text-xs text-[#8C8C90]">{i + 1}</span>
                      <input
                        type="number"
                        min={0}
                        aria-label={`Exercise ${exIdx + 1}, set ${i + 1} reps`}
                        value={st.reps}
                        onChange={(e) => updateSet(ex.id, i, "reps", Number(e.target.value))}
                        className="min-w-0 bg-[#0B0B0C] svj-border rounded-lg px-3 py-2 text-sm font-mono text-[#F4F2ED] focus:outline-none focus:border-[#C81E3A]/60"
                      />
                      <input
                        type="number"
                        min={0}
                        step={2.5}
                        aria-label={`Exercise ${exIdx + 1}, set ${i + 1} weight`}
                        value={st.weight}
                        onChange={(e) => updateSet(ex.id, i, "weight", Number(e.target.value))}
                        className="min-w-0 bg-[#0B0B0C] svj-border rounded-lg px-3 py-2 text-sm font-mono text-[#F4F2ED] focus:outline-none focus:border-[#C81E3A]/60"
                      />
                      {ex.sets.length > 1 ? (
                        <button
                          onClick={() =>
                            updateExercise(ex.id, { sets: ex.sets.filter((_, j) => j !== i) })
                          }
                          className="text-[#8C8C90] hover:text-[#C81E3A] cursor-pointer"
                          aria-label="Remove set"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() =>
                    updateExercise(ex.id, {
                      sets: [
                        ...ex.sets,
                        { ...(ex.sets[ex.sets.length - 1] ?? { reps: 8, weight: 20 }) },
                      ],
                    })
                  }
                  className="text-xs font-inter font-semibold text-[#C81E3A] hover:text-[#E62846] cursor-pointer"
                >
                  + Add set
                </button>
              </div>
            ))}

            <datalist id="svj-exercise-names">
              {exerciseNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <button
              onClick={() => setExercises((prev) => [...prev, blankExercise()])}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/15 text-[#8C8C90] hover:text-[#F4F2ED] hover:border-[#C81E3A]/50 font-inter text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add exercise
            </button>

            <div className="rounded-2xl bg-[#17171A] svj-border p-4 flex items-center justify-between">
              <div className="font-inter text-sm text-[#8C8C90]">
                <span className="text-[#F4F2ED] font-semibold">{totals.sets}</span> sets ·{" "}
                <span className="text-[#F4F2ED] font-semibold">
                  {Math.round(totals.volume).toLocaleString()}
                </span>{" "}
                kg volume
              </div>
              <div className="flex items-center gap-1.5 text-[#D4AF37] font-mono text-sm">
                <Zap className="w-4 h-4" /> +{totals.xp} XP
              </div>
            </div>

            {saveError && (
              <p role="alert" className="text-sm text-rose-300">
                {saveError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => saveWorkoutTemplate(name || "Untitled Template", exercises)}
                disabled={!exercises.some((e) => e.name.trim())}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#17171A] svj-border text-[#F4F2ED] font-inter font-semibold text-sm hover:bg-[#212126] disabled:opacity-40 cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save template
              </button>
              <button
                onClick={handleLog}
                disabled={!totals.valid}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl svj-crimson-gradient text-white font-inter font-bold text-sm disabled:opacity-40 svj-card-glow cursor-pointer"
              >
                <Dumbbell className="w-4 h-4" /> Log workout
              </button>
            </div>
          </motion.div>
        )}

        {tab === "templates" && (
          <motion.div
            key="templates"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <TemplateBrowser
              profile={training.profile}
              library={training.library}
              savedTemplateIds={training.savedTemplateIds}
              onToggleSave={training.toggleSaveTemplate}
              onStartTemplate={startTemplate}
            />

            <p className="pt-2 font-anton text-sm uppercase tracking-wide text-white">
              Your device templates
            </p>
            {workoutTemplates.length === 0 && (
              <p className="text-center text-[#8C8C90] font-inter text-sm py-10">
                No templates yet. Build a session in the Log tab and hit “Save template”.
              </p>
            )}
            {workoutTemplates.map((tpl) => (
              <div key={tpl.id} className="rounded-2xl bg-[#17171A] svj-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-anton uppercase text-lg text-[#F4F2ED]">{tpl.name}</h3>
                    <p className="font-inter text-xs text-[#8C8C90] mt-1">
                      {tpl.exercises.map((e) => e.name).join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteWorkoutTemplate(tpl.id)}
                    className="text-[#8C8C90] hover:text-[#C81E3A] cursor-pointer"
                    aria-label="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => loadTemplate(tpl.id)}
                  className="mt-3 w-full py-2.5 rounded-xl bg-[#C81E3A]/15 border border-[#C81E3A]/40 text-[#F4F2ED] font-inter font-semibold text-sm hover:bg-[#C81E3A]/25 cursor-pointer"
                >
                  Start this workout
                </button>
              </div>
            ))}
          </motion.div>
        )}

        {guided && tab === "progress" && (
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <TrainingProgress
              loading={training.loading}
              serverPlan={training.serverPlan}
              weekly={training.weekly}
              muscleRows={training.muscleRows}
              decisions={training.decisions}
              strengthRecords={training.strengthRecords}
              loadExerciseHistory={training.loadExerciseHistory}
            />
          </motion.div>
        )}

        {tab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {exerciseNames.length > 0 && (
              <div className="rounded-2xl bg-[#17171A] svj-border p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 text-[#F4F2ED] font-inter font-semibold text-sm">
                    <TrendingUp className="w-4 h-4 text-[#C81E3A]" /> Weight trend
                  </div>
                  <select
                    value={trendExercise ?? exerciseNames[0]}
                    onChange={(e) => setTrendExercise(e.target.value)}
                    className="bg-[#0B0B0C] svj-border rounded-lg px-2 py-1.5 text-xs font-inter text-[#F4F2ED] focus:outline-none"
                  >
                    {exerciseNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-2 h-28">
                  {trendData.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <span className="font-mono text-[10px] text-[#8C8C90]">{d.top}</span>
                      <div
                        className="w-full rounded-t-md svj-crimson-gradient"
                        style={{ height: `${Math.max(6, (d.top / maxTop) * 80)}px` }}
                      />
                      <span className="font-mono text-[9px] text-[#8C8C90] truncate w-full text-center">
                        {d.date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {workouts.length === 0 && (
              <p className="text-center text-[#8C8C90] font-inter text-sm py-10">
                No workouts logged yet.
              </p>
            )}

            {workouts.map((w) => (
              <div key={w.id} className="rounded-2xl bg-[#17171A] svj-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-anton uppercase text-lg text-[#F4F2ED]">{w.name}</h3>
                    <p className="font-mono text-[11px] text-[#8C8C90]">
                      {new Date(w.date).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#D4AF37] font-mono text-sm">+{w.xpEarned} XP</span>
                    <button
                      onClick={() => deleteWorkout(w.id)}
                      className="text-[#8C8C90] hover:text-[#C81E3A] cursor-pointer"
                      aria-label="Delete workout"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {w.exercises.map((ex) => (
                    <div key={ex.id} className="flex justify-between gap-3 text-xs font-inter">
                      <span className="text-[#F4F2ED]">{ex.name}</span>
                      <span className="font-mono text-[#8C8C90]">
                        {ex.sets.map((s) => `${s.reps}×${s.weight}`).join("  ")}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 font-mono text-[11px] text-[#8C8C90]">
                  Volume {Math.round(w.totalVolume).toLocaleString()} kg
                </p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
