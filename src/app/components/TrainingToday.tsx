import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Clock,
  Dumbbell,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { MUSCLE_LABELS, type MuscleGroup } from "../lib/strength";
import {
  EQUIPMENT_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  WEEKDAY_LABELS,
  type EquipmentId,
  type ExperienceLevel,
  type TrainingGoal,
  type TrainingProfile,
  type Weekday,
} from "../lib/trainingProfile";
import { templateForSlot, SESSION_FAMILY_LABELS } from "../lib/trainingTemplates";
import { SVJSelect } from "./ui-primitives/SVJSelect";
import { SVJDatePicker } from "./ui-primitives/SVJDatePicker";
import { SVJEmptyState } from "./ui-primitives/SVJEmptyState";
import { SVJSectionHeader } from "./ui-primitives/SVJSectionHeader";
import { svjStaggerContainer, svjStaggerItem, svjWhileTap } from "../lib/motion";
import type { PlanSession } from "../lib/trainingPlan";
import type { MuscleHistoryRow } from "../lib/trainingClient";

export interface TrainingTodayProps {
  profile: TrainingProfile;
  profileReady: boolean;
  loading: boolean;
  savingProfile: boolean;
  creatingPlan: boolean;
  splitName: string | null;
  explanation: string | null;
  reasons: string[];
  sessions: PlanSession[];
  todaySession: PlanSession | null;
  muscleRows: MuscleHistoryRow[];
  error: string | null;
  onSaveProfile: (profile: TrainingProfile) => Promise<{ ok: boolean; error?: string }>;
  onGeneratePlan: () => Promise<{ ok: boolean; error?: string }>;
  onStartSession: (session: PlanSession) => void;
  /** Server id for a slot, needed to move or skip a persisted session. */
  serverSessionIdForSlot: (slotIndex: number) => string | null;
  onMoveSession: (sessionId: string, newDate: string) => Promise<{ ok: boolean; error?: string }>;
  onSkipSession: (sessionId: string) => Promise<{ ok: boolean; error?: string }>;
}

const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const EQUIPMENT_ORDER: EquipmentId[] = ["full_gym", "dumbbells", "bands", "bodyweight"];

/** Valid choices retained from the previous native selects. */
const SESSIONS_PER_WEEK_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({
  value: n,
  label: `${n} / week`,
}));
const SESSION_MINUTES_OPTIONS = [30, 45, 60, 75, 90].map((n) => ({
  value: n,
  label: `${n} min`,
}));

function recencyLabel(row: MuscleHistoryRow): string {
  if (!row.lastTrainedDate) return "No logged training";
  const then = new Date(`${row.lastTrainedDate}T12:00:00`);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return `${Math.floor(days / 7)} weeks ago`;
}

/** Compact alignment of a muscle's real completed work. */
const MuscleHistoryPanel: React.FC<{ rows: MuscleHistoryRow[] }> = ({ rows }) => {
  const visible = useMemo(
    () =>
      rows
        .filter((row) => row.directSets > 0 || row.supportingSets > 0 || row.lastTrainedDate)
        .slice(0, 8),
    [rows],
  );

  if (visible.length === 0) {
    return (
      <div
        className="svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-4"
        data-testid="muscle-history"
      >
        <SVJSectionHeader title="Muscle history" icon={Dumbbell} />
        <SVJEmptyState
          compact
          icon={Dumbbell}
          title="No logged training yet"
          description="Muscle history is built from the sets you actually complete in a structured session — never from a scheduled plan. Log one and each group fills in here."
        />
      </div>
    );
  }

  return (
    <div
      className="svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-4"
      data-testid="muscle-history"
    >
      <SVJSectionHeader
        title="Muscle history"
        icon={Dumbbell}
        trailing={<span className="font-inter text-[10px] text-[#8C8C90]">Last 7 days</span>}
      />
      <p className="mt-1.5 font-inter text-[11px] leading-relaxed text-[#8C8C90]">
        Direct and supporting work from the sets you actually completed.
      </p>
      <ul className="mt-3 space-y-2">
        {visible.map((row) => (
          <li key={row.muscle} className="flex items-center justify-between gap-3">
            <span className="text-xs font-inter text-[#F4F2ED]">
              {MUSCLE_LABELS[row.muscle as MuscleGroup] ?? row.muscle}
            </span>
            <span className="flex items-center gap-2 font-mono text-[10px] text-[#8C8C90]">
              {row.directSets > 0 && (
                <span className="rounded-full bg-[#C81E3A]/15 px-2 py-0.5 text-[#F4F2ED]">
                  {row.directSets} direct
                </span>
              )}
              {row.supportingSets > 0 && <span>{row.supportingSets} supporting</span>}
              <span className="w-24 text-right">{recencyLabel(row)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** One-step-at-a-time setup; resumable because it edits the persisted profile. */
const SetupFlow: React.FC<{
  profile: TrainingProfile;
  saving: boolean;
  onSave: (profile: TrainingProfile) => Promise<{ ok: boolean; error?: string }>;
}> = ({ profile, saving, onSave }) => {
  const [draft, setDraft] = useState<TrainingProfile>(profile);
  const [error, setError] = useState<string | null>(null);

  const patch = (next: Partial<TrainingProfile>) => setDraft((prev) => ({ ...prev, ...next }));

  const toggleDay = (day: Weekday) => {
    const has = draft.availableDays.includes(day);
    const availableDays = has
      ? draft.availableDays.filter((d) => d !== day)
      : [...draft.availableDays, day].sort((a, b) => a - b);
    patch({
      availableDays,
      sessionsPerWeek: Math.min(draft.sessionsPerWeek, Math.max(1, availableDays.length)),
    });
  };

  const toggleEquipment = (equipment: EquipmentId) => {
    const has = draft.equipment.includes(equipment);
    const next = has
      ? draft.equipment.filter((e) => e !== equipment)
      : [...draft.equipment, equipment];
    patch({ equipment: next });
  };

  const submit = async () => {
    setError(null);
    const next: TrainingProfile = { ...draft, setupComplete: true };
    const result = await onSave(next);
    if (!result.ok) setError(result.error ?? "Couldn't save your setup.");
  };

  return (
    <div
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1e1114] via-[#17171A] to-[#17171A] p-4"
      data-testid="training-setup"
    >
      <p className="flex items-center gap-1.5 font-inter text-[11px] uppercase tracking-wider text-[#C81E3A]">
        <Sparkles className="h-3.5 w-3.5" /> Build my program
      </p>
      <h2 className="mt-1 font-anton text-xl leading-none tracking-wide text-white">
        How do you train?
      </h2>
      <p className="mt-1.5 text-xs font-inter text-[#8C8C90]">
        SVJ builds a reviewed weekly plan from these answers. BMI is never used to choose it.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[11px] font-inter uppercase tracking-wider text-[#8C8C90]">
            Experience
          </p>
          <div className="mt-1.5 flex gap-2">
            {(Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => patch({ experience: level })}
                className={`flex-1 rounded-lg border px-2 py-2 text-[11px] font-inter ${
                  draft.experience === level
                    ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 bg-black/30 text-[#8C8C90]"
                }`}
              >
                {EXPERIENCE_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-inter uppercase tracking-wider text-[#8C8C90]">
            Primary goal
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(Object.keys(GOAL_LABELS) as TrainingGoal[]).map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => patch({ goal })}
                className={`rounded-lg border px-2 py-2 text-[11px] font-inter ${
                  draft.goal === goal
                    ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 bg-black/30 text-[#8C8C90]"
                }`}
              >
                {GOAL_LABELS[goal]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-inter uppercase tracking-wider text-[#8C8C90]">
            Days you can train
          </p>
          <div className="mt-1.5 flex gap-1.5">
            {ALL_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`flex-1 rounded-lg border py-2 text-[10px] font-mono ${
                  draft.availableDays.includes(day)
                    ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 bg-black/30 text-[#8C8C90]"
                }`}
              >
                {WEEKDAY_LABELS[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SVJSelect
            label="Sessions / week"
            value={draft.sessionsPerWeek}
            options={SESSIONS_PER_WEEK_OPTIONS}
            onChange={(sessionsPerWeek) => patch({ sessionsPerWeek })}
            testId="sessions-per-week"
          />
          <SVJSelect
            label="Minutes available"
            value={draft.sessionMinutes}
            options={SESSION_MINUTES_OPTIONS}
            onChange={(sessionMinutes) => patch({ sessionMinutes })}
            testId="session-minutes"
          />
        </div>

        <div>
          <p className="text-[11px] font-inter uppercase tracking-wider text-[#8C8C90]">
            Equipment
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {EQUIPMENT_ORDER.map((equipment) => (
              <button
                key={equipment}
                type="button"
                onClick={() => toggleEquipment(equipment)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-inter ${
                  draft.equipment.includes(equipment)
                    ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-white"
                    : "border-white/10 bg-black/30 text-[#8C8C90]"
                }`}
              >
                {EQUIPMENT_LABELS[equipment]}
              </button>
            ))}
          </div>
        </div>

        {draft.goal === "athletic" && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-3">
            <label className="block text-[11px] font-inter text-[#8C8C90]">
              Sport
              <input
                value={draft.athlete.sport}
                onChange={(e) =>
                  patch({ athlete: { ...draft.athlete, sport: e.target.value.slice(0, 40) } })
                }
                placeholder="e.g. Football"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0B0C] px-2 py-2 text-xs font-inter text-white"
              />
            </label>
            <p className="text-[10px] font-inter text-[#8C8C90]">
              Practice days (kept clear of lifting by default)
            </p>
            <div className="flex gap-1.5">
              {ALL_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    const has = draft.athlete.practiceDays.includes(day);
                    patch({
                      athlete: {
                        ...draft.athlete,
                        practiceDays: has
                          ? draft.athlete.practiceDays.filter((d) => d !== day)
                          : [...draft.athlete.practiceDays, day].sort((a, b) => a - b),
                      },
                    });
                  }}
                  className={`flex-1 rounded-lg border py-1.5 text-[10px] font-mono ${
                    draft.athlete.practiceDays.includes(day)
                      ? "border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#F4F2ED]"
                      : "border-white/10 bg-black/30 text-[#8C8C90]"
                  }`}
                >
                  {WEEKDAY_LABELS[day].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-inter text-rose-300">
            {error}
          </p>
        )}

        <motion.button
          type="button"
          whileTap={svjWhileTap}
          onClick={() => void submit()}
          disabled={saving || draft.availableDays.length === 0 || draft.equipment.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C81E3A] px-4 py-3 font-anton text-xs uppercase tracking-wider text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Build my weekly plan
        </motion.button>
      </div>
    </div>
  );
};

export const TrainingToday: React.FC<TrainingTodayProps> = ({
  profile,
  profileReady,
  loading,
  savingProfile,
  creatingPlan,
  splitName,
  explanation,
  reasons,
  sessions,
  todaySession,
  muscleRows,
  error,
  onSaveProfile,
  onGeneratePlan,
  onStartSession,
  serverSessionIdForSlot,
  onMoveSession,
  onSkipSession,
}) => {
  const [showWhy, setShowWhy] = useState(false);
  const [editingSetup, setEditingSetup] = useState(false);
  const [movingSlot, setMovingSlot] = useState<number | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-xs font-inter text-[#8C8C90]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your training plan…
      </div>
    );
  }

  if (error && !profileReady) {
    // A load failure (including a missing server deployment) shows a friendly
    // retry card — never a raw Supabase/PostgREST error. Raw messages are
    // sanitized upstream in useTrainingPlan; this is a defense in depth.
    const safeMessage =
      error.length > 0 && !/could not find the function|schema cache|PGRST/i.test(error)
        ? error
        : "Couldn't load your training profile. Please try again.";
    return (
      <div
        className="rounded-2xl border border-white/10 bg-[#17171A] p-5 text-center"
        data-testid="training-load-error"
      >
        <p className="font-inter text-sm font-semibold text-[#F4F2ED]">
          Training needs a connection
        </p>
        <p role="alert" className="mt-2 text-xs font-inter text-[#B8B8C0]">
          {safeMessage}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#C81E3A] px-4 py-2.5 font-anton text-xs uppercase tracking-wider text-white"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  /** A failed refresh keeps the last valid plan on screen and says so. */
  const refreshPending = error ? (
    <p
      role="alert"
      data-testid="plan-refresh-pending"
      className="rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3 py-2 text-[11px] font-inter text-[#E8D9A0]"
    >
      Couldn't refresh your plan — showing the last plan we loaded. Your completed sessions and
      saved data are unchanged; it will refresh when the connection returns.
    </p>
  ) : null;

  if (!profileReady) {
    return (
      <div className="space-y-4">
        {refreshPending}
        <SetupFlow profile={profile} saving={savingProfile} onSave={onSaveProfile} />
      </div>
    );
  }

  if (profileReady && editingSetup) {
    return (
      <div className="space-y-3" data-testid="training-rebuild-setup">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#17171A] px-3 py-2">
          <div>
            <p className="font-inter text-sm font-semibold text-[#F4F2ED]">Rebuild your program</p>
            <p className="text-[11px] font-inter text-[#8C8C90]">
              Change your goal, days, session length or equipment. Saving creates a fresh plan from
              these choices.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingSetup(false)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-inter uppercase tracking-wider text-[#B8B8C0] hover:text-white"
          >
            Cancel
          </button>
        </div>
        <SetupFlow
          profile={profile}
          saving={savingProfile}
          onSave={async (next) => {
            const result = await onSaveProfile(next);
            if (result.ok) setEditingSetup(false);
            return result;
          }}
        />
      </div>
    );
  }

  const template = todaySession ? templateForSlot(todaySession.family, todaySession.variant) : null;
  const muscles = template
    ? [...new Set(template.exercises.map((e) => e.muscle))]
        .slice(0, 5)
        .map((m) => MUSCLE_LABELS[m as MuscleGroup] ?? m)
    : [];

  return (
    <div className="space-y-4">
      {refreshPending}

      {/* Today's or next session */}
      {todaySession ? (
        <section
          data-testid="today-session"
          className="rounded-2xl border border-[#C81E3A]/20 bg-gradient-to-br from-[#1e1114] via-[#17171A] to-[#17171A] p-4"
        >
          <p className="flex items-center gap-1.5 font-inter text-[11px] uppercase tracking-wider text-[#C81E3A]">
            <Dumbbell className="h-3.5 w-3.5" /> Next session
          </p>
          <h2 className="mt-0.5 font-anton text-2xl leading-none text-white">
            {todaySession.label}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {muscles.map((muscle) => (
              <span
                key={muscle}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-inter text-[10px] text-[#B8B8C0]"
              >
                {muscle}
              </span>
            ))}
            {template && (
              <span className="ml-0.5 inline-flex items-center gap-1 font-inter text-[11px] text-[#8C8C90]">
                <Clock aria-hidden className="h-3 w-3" /> about {template.estimatedMinutes} min
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-inter text-[#8C8C90] hover:text-white"
            >
              <Info className="h-3.5 w-3.5" /> Why this session?
            </button>
            <motion.button
              type="button"
              whileTap={svjWhileTap}
              onClick={() => onStartSession(todaySession)}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#C81E3A] px-4 py-2.5 font-anton text-xs uppercase tracking-wider text-white"
            >
              Start workout <ArrowRight className="h-4 w-4" />
            </motion.button>
          </div>

          {showWhy && (
            <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3">
              {reasons.map((reason) => (
                <li key={reason} className="text-[11px] font-inter text-[#8C8C90]">
                  • {reason}
                </li>
              ))}
              {template && (
                <li className="text-[11px] font-inter text-[#8C8C90]">
                  • Warm-up: {template.warmup}
                </li>
              )}
            </ul>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-white/5 bg-[#17171A] p-4">
          <p className="font-inter text-sm font-semibold text-[#F4F2ED]">No session scheduled</p>
          <p className="mt-1 text-xs font-inter text-[#8C8C90]">
            Every planned session for this block is complete. Rebuild the plan when you are ready.
          </p>
        </section>
      )}

      {/* Plan summary */}
      <section className="rounded-2xl border border-white/5 bg-[#17171A] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-inter text-sm font-semibold text-[#F4F2ED]">
              {splitName ?? "Your plan"}
            </p>
            <p className="mt-0.5 text-[11px] font-inter text-[#8C8C90]">{explanation ?? ""}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditingSetup(true)}
            disabled={creatingPlan}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10px] font-inter uppercase tracking-wider text-[#8C8C90] hover:text-white disabled:opacity-40"
          >
            {creatingPlan ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Rebuild
          </button>
        </div>

        {sessionError && (
          <p role="alert" className="mt-3 text-[11px] font-inter text-[#E8D9A0]">
            {sessionError}
          </p>
        )}
        <motion.ul
          variants={svjStaggerContainer}
          initial="hidden"
          animate="show"
          className="mt-3 space-y-2"
        >
          {sessions.map((session) => {
            const serverId = serverSessionIdForSlot(session.slotIndex);
            const editable = Boolean(serverId) && session.status !== "completed";
            return (
              <motion.li
                key={`${session.slotIndex}-${session.scheduledDate}`}
                variants={svjStaggerItem}
                className="rounded-xl border border-white/5 bg-black/25 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs font-inter text-[#F4F2ED]">
                    <Clock className="h-3.5 w-3.5 text-[#8C8C90]" aria-hidden />
                    {session.label}
                  </span>
                  <span className="flex items-center gap-2 text-[10px] font-mono text-[#8C8C90]">
                    <span>
                      {new Date(`${session.scheduledDate}T12:00:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    {session.status === "completed" && (
                      <span className="rounded-full bg-[#C81E3A]/15 px-2 py-0.5 text-[#F4F2ED]">
                        Done
                      </span>
                    )}
                    {session.status === "moved" && (
                      <span className="rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[#D4AF37]">
                        Moved
                      </span>
                    )}
                    {session.status === "skipped" && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[#8C8C90]">
                        Rest
                      </span>
                    )}
                    {session.status === "scheduled" &&
                      session.slotIndex === todaySession?.slotIndex && (
                        <span className="rounded-full bg-[#C81E3A]/20 px-2 py-0.5 text-[#F4F2ED]">
                          Next
                        </span>
                      )}
                  </span>
                </div>

                {editable && (
                  <div className="mt-2.5 flex items-center gap-2">
                    {/* Move keeps its day but shifts it; marking a rest day is the
                        quieter, reversible fallback — so it reads as secondary. */}
                    <button
                      type="button"
                      onClick={() =>
                        setMovingSlot(movingSlot === session.slotIndex ? null : session.slotIndex)
                      }
                      aria-expanded={movingSlot === session.slotIndex}
                      aria-label={`Move ${session.label}`}
                      className={`rounded-xl border px-2.5 py-1.5 font-inter text-[11px] font-medium transition-colors ${
                        movingSlot === session.slotIndex
                          ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                          : "border-white/12 bg-white/[0.03] text-[#B8B8C0] hover:text-white"
                      }`}
                    >
                      Move to another day
                    </button>
                    <button
                      type="button"
                      disabled={sessionBusy}
                      onClick={async () => {
                        if (!serverId) return;
                        setSessionBusy(true);
                        setSessionError(null);
                        const result = await onSkipSession(serverId);
                        setSessionBusy(false);
                        if (!result.ok)
                          setSessionError(result.error ?? "Couldn't skip that session.");
                      }}
                      aria-label={`Mark ${session.label} as a rest day`}
                      className="rounded-xl px-2 py-1.5 font-inter text-[11px] text-[#8C8C90] transition-colors hover:text-white disabled:opacity-40"
                    >
                      {session.status === "skipped" ? "Rest day kept" : "Mark as rest day"}
                    </button>
                  </div>
                )}

                {editable && movingSlot === session.slotIndex && (
                  <div className="mt-2">
                    {/*
                     * Dark in-app calendar, never a native HTML date field.
                     * Android WebView hands a native date input to the OS
                     * DatePicker dialog, which is themed by Android rather than
                     * by the web UI and shows up as a giant white sheet with a
                     * dimmed app behind it — unthemeable from CSS. Cancel leaves
                     * the schedule untouched; Set moves the session server-side.
                     */}
                    <SVJDatePicker
                      label="New day"
                      testId={`move-session-date-${session.slotIndex}`}
                      value={session.scheduledDate}
                      disabled={sessionBusy}
                      onChange={async (value) => {
                        if (!serverId) return;
                        // Re-picking the day it already sits on is a no-op: close
                        // the Move panel without a pointless server write.
                        if (value === session.scheduledDate) {
                          setMovingSlot(null);
                          return;
                        }
                        setSessionBusy(true);
                        setSessionError(null);
                        const result = await onMoveSession(serverId, value);
                        setSessionBusy(false);
                        if (!result.ok) {
                          setSessionError(result.error ?? "Couldn't move that session.");
                        } else {
                          setMovingSlot(null);
                        }
                      }}
                    />
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
        <p className="mt-2 text-[10px] font-inter text-[#8C8C90]">
          Missing a session never stacks two hard days together — move it to a free day, or mark it
          as a rest day.
        </p>
        {splitName && (
          <p className="mt-2 text-[10px] font-inter text-[#8C8C90]">
            {SESSION_FAMILY_LABELS[todaySession?.family ?? "full_body"]} style block. Your plan
            stays stable for the whole block; targets adapt between sessions.
          </p>
        )}
      </section>

      <MuscleHistoryPanel rows={muscleRows} />
    </div>
  );
};
