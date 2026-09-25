import React, { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
  Save,
  RefreshCw,
  ClipboardList,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trophy,
  Target,
} from "lucide-react";
import { GpsActivityDetail } from "./GpsActivityDetail";
import { SVJEmptyState } from "../components/ui-primitives/SVJEmptyState";
import { SVJSectionHeader } from "../components/ui-primitives/SVJSectionHeader";
import { SVJSelect } from "../components/ui-primitives/SVJSelect";
import { SVJDatePicker } from "../components/ui-primitives/SVJDatePicker";
import { todayDateValue } from "../components/ui-primitives/datePickerUtils";
import { SVJTimePicker } from "../components/ui-primitives/SVJTimePicker";
import { useActivityOptional, type ActivityTypeFromLib } from "../context/ActivityContext";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  formatActivityDate,
  formatDurationLabel,
  listServerActivities,
  type ServerActivity,
} from "../lib/serverActivities";
import {
  STRENGTH_RECORD_LABELS,
  formatRecordValue,
  formatVolume,
  getStrengthDetail,
  listStrengthSummaries,
  type GoalContribution,
  type StrengthDetail,
  type StrengthSummary,
} from "../lib/strength";
import {
  ExerciseHistoryPanel,
  MuscleTrainedList,
  StrengthSetsList,
} from "../components/StrengthDetails";
import { strengthRpcClient } from "../lib/strengthClient";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

type LoadState = "loading" | "loaded" | "error";

/**
 * Completion summary shown after STOP TRACKING, with the SAVE ACTIVITY
 * action. Shows only genuinely available metrics; a failed save keeps the
 * card mounted with an inline COULDN'T SAVE ACTIVITY / Retry recovery.
 */
export const CompletedSessionCard: React.FC = () => {
  const activity = useActivityOptional();
  const [type, setType] = useState<ActivityTypeFromLib>("walking");
  const [saved, setSaved] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  if (!activity || !activity.completedSession) return null;
  const session = activity.completedSession;
  const rewards = saved ? activity.lastSaveRewards : null;

  const save = async () => {
    const result = await activity.saveCompletedSession(type);
    if (result.ok) {
      setSaved(true);
      setDuplicate(result.duplicate === true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 rounded-2xl border border-[#C81E3A]/30 bg-gradient-to-b from-[#C81E3A]/10 to-[#0B0B0C] p-3.5"
      data-testid="workout-complete"
    >
      <p className="font-anton text-lg uppercase tracking-wider text-white">WORKOUT COMPLETE</p>
      <p className="mt-0.5 text-[10px] font-mono uppercase tracking-widest text-[#E62846]">
        {ACTIVITY_TYPE_LABELS[type]}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-black/40 border border-white/5 p-3">
          <div className="text-[9px] font-mono uppercase text-[#8C8C90]">Duration</div>
          <div className="font-mono text-xl font-bold text-white">
            {formatDurationLabel(session.durationSeconds)}
          </div>
        </div>
        <div className="rounded-2xl bg-black/40 border border-white/5 p-3">
          <div className="text-[9px] font-mono uppercase text-[#8C8C90]">Steps</div>
          <div className="font-mono text-xl font-bold text-white">
            {session.stepCount.toLocaleString()}
          </div>
        </div>
      </div>
      {session.distanceMeters != null && session.distanceMeters > 0 && (
        <p className="mt-2 text-[10px] font-mono text-[#8C8C90]">
          Distance (measured): {(session.distanceMeters / 1000).toFixed(2)} km
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {/* Dark in-app listbox: a native select renders as a white Android popup. */}
        <SVJSelect
          label="Activity type"
          testId="saved-activity-type"
          className="flex-1"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(next) => setType(next)}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={activity.saveState === "saving" || saved}
          className="flex items-center gap-1.5 rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {activity.saveState === "saving" ? "Saving…" : saved ? "Saved" : "Save Activity"}
        </button>
      </div>

      {saved && (
        <p
          role="status"
          className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {duplicate ? "Already saved — no duplicate created." : "Saved to your activity history."}
        </p>
      )}

      {/* Update 04: compact server-confirmed reward summary. Never optimistic:
          rewards render only after the server has confirmed them. */}
      {saved &&
        !duplicate &&
        rewards &&
        (rewards.xpAwarded > 0 || Object.keys(rewards.statChanges).length > 0) && (
          <div
            data-testid="activity-rewards"
            className="mt-2 rounded-full border border-[#C81E3A]/30 bg-black/40 px-3 py-2"
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

      {activity.saveState === "error" && activity.lastSaveError && (
        <div className="mt-3 rounded-2xl border border-crimson/30 bg-crimson/5 p-3">
          <p role="alert" className="flex items-start gap-1.5 text-[11px] font-mono text-crimson">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            COULDN'T SAVE ACTIVITY — {activity.lastSaveError}
          </p>
          <button
            type="button"
            onClick={() => void activity.retrySaveCompletedSession()}
            className="mt-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-crimson"
          >
            Retry
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => activity.dismissCompletedSession()}
        className="mt-3 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
      >
        Dismiss
      </button>
    </motion.div>
  );
};

const TYPE_OPTIONS = ACTIVITY_TYPES.map((t) => ({
  value: t,
  label: ACTIVITY_TYPE_LABELS[t],
}));

/** Server stat name → Character Matrix display label (Update 04). */
const REWARD_STAT_LABELS: Record<string, string> = {
  fitness: "PHYSICAL",
  discipline: "DISCIPLINE",
  focus: "MENTAL",
};

/**
 * Server-backed activity history (Update 01). Loads the signed-in user's
 * canonical activities newest-first from the database; survives refresh,
 * logout/login and reinstall because the server is the source of truth.
 */
export const ActivityHistory: React.FC = () => {
  const activity = useActivityOptional();
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<ServerActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ServerActivity | null>(null);
  const [showManual, setShowManual] = useState(false);
  // Exercise/set totals for structured strength workouts (server derived).
  const [summaries, setSummaries] = useState<Map<string, StrengthSummary>>(new Map());

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    if (!hasSupabaseConfig()) {
      setState("error");
      setError("Backend is not configured.");
      return;
    }
    const client = supabase as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
    const result = await listServerActivities(() =>
      client.rpc("svj_list_activities", { p_limit: 100 }),
    );
    if (result.ok) {
      setItems(result.activities);
      setState("loaded");
      // Best effort: strength rows show their exercise/set totals. A failure
      // here must never hide the activity history itself.
      if (result.activities.some((a) => a.activityType === "strength")) {
        const extras = await listStrengthSummaries((fn, args) => client.rpc(fn, args), 100);
        if (extras.ok) setSummaries(extras.summaries);
      }
    } else {
      setError(result.error ?? "Couldn't load history.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summaryFor = (item: ServerActivity): StrengthSummary | undefined => summaries.get(item.id);

  if (selected) {
    return (
      <ActivityDetail
        activity={selected}
        summary={summaries.get(selected.id)}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div
      className="svj-radius-card svj-lit-top mb-3 border border-white/[0.06] bg-[#17171A] p-3.5"
      data-testid="activity-history"
    >
      <SVJSectionHeader
        title="Activity history"
        icon={HistoryIcon}
        className="mb-3"
        trailing={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#08080A] px-2.5 py-1.5 font-inter text-[11px] font-semibold text-[#8C8C90] hover:text-[#F4F2ED]"
            >
              <Plus className="h-3 w-3" /> Log
            </button>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh history"
              className="rounded-lg border border-white/[0.08] bg-[#08080A] p-1.5 text-[#8C8C90] hover:text-[#F4F2ED]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      />

      {showManual && activity && (
        <ManualActivityForm
          onClose={() => setShowManual(false)}
          onSubmit={async (input) => {
            const result = await activity.logManualActivity(input);
            if (result.ok) {
              setShowManual(false);
              void load();
            }
            return result;
          }}
          saving={activity.manualSaveState === "saving"}
          error={activity.manualSaveError}
        />
      )}

      {state === "loading" && (
        <p className="py-6 text-center font-inter text-[11px] text-[#8C8C90]">Loading history…</p>
      )}

      {state === "error" && (
        <div className="svj-radius-row border border-crimson/30 bg-crimson/[0.06] p-3 text-center">
          <p className="mb-2 font-inter text-[11px] leading-relaxed text-crimson">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 font-inter text-[11px] font-semibold text-crimson"
          >
            Retry
          </button>
        </div>
      )}

      {state === "loaded" && items.length === 0 && (
        <SVJEmptyState
          icon={HistoryIcon}
          title="No activities yet"
          description="Recorded walks, runs, rides and logged workouts appear here with their real distance, pace and effort."
          compact
        />
      )}

      {state === "loaded" && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="w-full rounded-2xl border border-white/5 bg-black/40 p-3 text-left transition-colors hover:border-[#C81E3A]/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                    {ACTIVITY_TYPE_LABELS[item.activityType]}
                  </span>
                  <span className="text-[10px] font-mono text-[#8C8C90]">
                    {formatActivityDate(item.startedAt)}
                  </span>
                </div>
                {/* Real per-activity facts, separated — previously one string
                    joined with middle dots. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 font-inter text-[10px] text-[#8C8C90]">
                  <span>{formatDurationLabel(item.durationSeconds)}</span>
                  {item.stepCount > 0 && <span>{item.stepCount.toLocaleString()} steps</span>}
                  {(summaryFor(item)?.exerciseCount ?? 0) > 0 && (
                    <span>
                      {summaryFor(item)!.exerciseCount}{" "}
                      {summaryFor(item)!.exerciseCount === 1 ? "exercise" : "exercises"},{" "}
                      {summaryFor(item)!.setCount}{" "}
                      {summaryFor(item)!.setCount === 1 ? "set" : "sets"}
                    </span>
                  )}
                  {(summaryFor(item)?.volumeKg ?? 0) > 0 && (
                    <span>{formatVolume(summaryFor(item)!.volumeKg)} volume</span>
                  )}
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                      item.source === "manual"
                        ? "border-white/12 text-[#8C8C90]"
                        : "border-[#C81E3A]/40 text-[#E62846]"
                    }`}
                  >
                    {item.source === "svj_native"
                      ? "Tracked"
                      : item.source === "strength_log"
                        ? "Strength log"
                        : "Manual"}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ActivityDetail: React.FC<{
  activity: ServerActivity;
  summary?: StrengthSummary;
  onBack: () => void;
}> = ({ activity, summary, onBack }) => {
  const isStrength = activity.activityType === "strength";
  const [detail, setDetail] = useState<StrengthDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeExercise, setActiveExercise] = useState<{ id: string; name: string } | null>(null);

  // Structured sets live behind one bounded RPC (no N+1 per exercise).
  useEffect(() => {
    if (!isStrength) return;
    let cancelled = false;
    const client = strengthRpcClient();
    if (!client) {
      setDetailError("Backend is not configured.");
      return;
    }
    void (async () => {
      const result = await getStrengthDetail((fn, args) => client.rpc(fn, args), activity.id);
      if (cancelled) return;
      if (result.ok && result.detail) setDetail(result.detail);
      else setDetailError(result.error ?? "Couldn't load workout detail.");
    })();
    return () => {
      cancelled = true;
    };
  }, [isStrength, activity.id]);

  const strengthSummary = detail?.summary ?? summary;

  return (
    <div className="mb-3 rounded-2xl border border-white/5 bg-[#0B0B0C] p-3.5">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back to history
      </button>
      <h3 className="font-inter text-lg font-semibold tracking-tight text-[#F4F2ED]">
        {ACTIVITY_TYPE_LABELS[activity.activityType]}
      </h3>
      {/* Date and time band as two labelled facts with a hairline between them. */}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 font-inter text-[11px] text-[#8C8C90]">
        <span>{formatActivityDate(activity.startedAt)}</span>
        <span aria-hidden className="h-2.5 w-px bg-white/12" />
        <span>
          {new Date(activity.startedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" – "}
          {new Date(activity.endedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </p>
      <dl className="mt-3 space-y-1.5 text-[11px] font-mono">
        <div className="flex justify-between">
          <dt className="text-[#8C8C90]">Duration</dt>
          <dd className="text-white">{formatDurationLabel(activity.durationSeconds)}</dd>
        </div>
        {activity.stepCount > 0 && (
          <div className="flex justify-between">
            <dt className="text-[#8C8C90]">Steps</dt>
            <dd className="text-white">{activity.stepCount.toLocaleString()}</dd>
          </div>
        )}
        {activity.distanceMeters != null && (
          <div className="flex justify-between">
            <dt className="text-[#8C8C90]">Distance (measured)</dt>
            <dd className="text-white">{(activity.distanceMeters / 1000).toFixed(2)} km</dd>
          </div>
        )}
        {activity.caloriesEstimate != null && (
          <div className="flex justify-between">
            <dt className="text-[#8C8C90]">Calories (est.)</dt>
            <dd className="text-white">{Math.round(activity.caloriesEstimate)} kcal</dd>
          </div>
        )}
        {activity.perceivedEffort != null && (
          <div className="flex justify-between">
            <dt className="text-[#8C8C90]">Perceived effort</dt>
            <dd className="text-white">{activity.perceivedEffort}/10</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-[#8C8C90]">Source</dt>
          <dd className="text-white">
            {activity.source === "svj_native"
              ? "Device tracking"
              : activity.source === "strength_log"
                ? "Structured strength log"
                : "Manual entry"}
          </dd>
        </div>
        {activity.notes && (
          <div className="pt-1">
            <dt className="text-[#8C8C90]">Notes</dt>
            <dd className="mt-0.5 text-[#F4F2ED]">{activity.notes}</dd>
          </div>
        )}
      </dl>

      {/*
       * GPS workout enrichment: route map, splits, performance/HR/elevation
       * charts, provenance, and the "save as route" / "create segment" actions
       * that feed the SVJ route library. Embedded so the existing detail screen
       * stays the single place a history row opens.
       */}
      {activity.source === "svj_native" && (
        <div className="mt-4 border-t border-white/5 pt-4">
          <GpsActivityDetail activity={activity} embedded />
        </div>
      )}

      {isStrength && (
        <div className="mt-4 space-y-3" data-testid="strength-detail">
          {strengthSummary && strengthSummary.exerciseCount > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <DetailStat label="Exercises" value={String(strengthSummary.exerciseCount)} />
              <DetailStat label="Sets" value={String(strengthSummary.setCount)} />
              <DetailStat label="Volume" value={formatVolume(strengthSummary.volumeKg)} />
            </div>
          )}

          {detail && detail.records.length > 0 && (
            <div
              className="rounded-2xl border border-gold/40 bg-gold/5 p-3"
              data-testid="strength-detail-pr"
            >
              <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-gold">
                <Trophy className="h-3.5 w-3.5" /> Personal Record
              </p>
              <ul className="mt-1.5 space-y-1">
                {detail.records.map((record) => (
                  <li
                    key={`${record.recordType}-${record.exerciseId}`}
                    className="flex items-center justify-between text-[11px] font-mono"
                  >
                    <span className="text-[#F4F2ED]">{record.exerciseName}</span>
                    <span className="text-white">
                      {STRENGTH_RECORD_LABELS[record.recordType]}
                      {" · "}
                      {formatRecordValue(record.recordType, record.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail && detail.exercises.length === 0 && (
            <p className="rounded-2xl border border-white/5 bg-black/40 p-3 text-center text-[10px] font-mono text-[#8C8C90]">
              Logged without structured sets — no exercise history or protected records.
            </p>
          )}

          {activeExercise ? (
            <ExerciseHistoryPanel
              exerciseId={activeExercise.id}
              exerciseName={activeExercise.name}
              onClose={() => setActiveExercise(null)}
            />
          ) : (
            detail &&
            detail.exercises.length > 0 && (
              <StrengthSetsList
                exercises={detail.exercises}
                onSelectExercise={(id, name) => setActiveExercise({ id, name })}
              />
            )
          )}

          {detail && <MuscleTrainedList muscles={detail.summary.muscles} />}

          {detail && detail.goalContributions.length > 0 && (
            <div
              className="rounded-2xl border border-[#C81E3A]/25 bg-black/40 p-3"
              data-testid="strength-detail-goals"
            >
              <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white">
                <Target className="h-3.5 w-3.5 text-[#E62846]" /> Goals Contributed To
              </p>
              <ul className="mt-1.5 space-y-1">
                {detail.goalContributions.map((goal) => (
                  <li
                    key={goal.goalId}
                    className="flex items-center justify-between text-[11px] font-mono"
                  >
                    <span className="text-[#8C8C90]">{goalLabel(goal)}</span>
                    <span className="text-emerald-400">+{formatContribution(goal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isStrength && !detail && !detailError && (
            <p className="flex items-center justify-center gap-2 py-3 text-[10px] font-mono uppercase text-[#8C8C90]">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading workout…
            </p>
          )}
          {detailError && <p className="text-[10px] font-mono text-crimson">{detailError}</p>}
        </div>
      )}
    </div>
  );
};

const DetailStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-full border border-white/5 bg-black/40 p-2 text-center">
    <div className="text-[9px] font-mono uppercase text-[#8C8C90]">{label}</div>
    <div className="font-mono text-sm font-bold text-white">{value}</div>
  </div>
);

const GOAL_METRIC_SHORT: Record<string, string> = {
  workout_count: "Workouts",
  step_total: "Steps",
  active_minutes: "Active Minutes",
  distance: "Distance",
};

function goalLabel(goal: GoalContribution): string {
  const period =
    goal.periodType === "monthly"
      ? new Date(`${goal.periodStart}T00:00:00`).toLocaleDateString("en-GB", { month: "long" })
      : "Weekly";
  return `${period} ${GOAL_METRIC_SHORT[goal.metric] ?? "Goal"}`;
}

function formatContribution(goal: GoalContribution): string {
  if (goal.metric === "distance") return `${(goal.contribution / 1000).toFixed(2)} km`;
  if (goal.metric === "active_minutes") return `${Math.round(goal.contribution)} min`;
  return Math.round(goal.contribution).toLocaleString();
}

const ManualActivityForm: React.FC<{
  onClose: () => void;
  onSubmit: (input: {
    activityType: ActivityTypeFromLib;
    startedAtMs: number;
    durationMinutes: number;
    perceivedEffort?: number;
    notes?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  saving: boolean;
  error: string | null;
}> = ({ onClose, onSubmit, saving, error }) => {
  const [type, setType] = useState<ActivityTypeFromLib>("strength");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [duration, setDuration] = useState("30");
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const started = new Date(`${date}T${time || "00:00"}`);
    if (Number.isNaN(started.getTime())) return;
    const minutes = Number(duration);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return;
    await onSubmit({
      activityType: type,
      startedAtMs: started.getTime(),
      durationMinutes: minutes,
      perceivedEffort: effort ? Number(effort) : undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mb-3 space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3"
      data-testid="manual-activity-form"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-white">
          Log an activity
        </span>
        <button type="button" onClick={onClose} aria-label="Close form">
          <X className="w-3.5 h-3.5 text-[#8C8C90]" />
        </button>
      </div>
      {/* Dark in-app listbox + calendar + time dialog. Native date/time/select
          controls are handed to the Android system dialogs, which are themed by
          the OS (big white sheets) and cannot be styled from CSS. */}
      <SVJSelect
        label="Activity type"
        testId="log-activity-type"
        value={type}
        options={TYPE_OPTIONS}
        onChange={(next) => setType(next)}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SVJDatePicker
          label="Date"
          testId="log-activity-date"
          value={date}
          max={todayDateValue()}
          onChange={setDate}
        />
        <SVJTimePicker label="Time" testId="log-activity-time" value={time} onChange={setTime} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[9px] font-mono uppercase text-[#8C8C90]">
          Duration (min)
          <input
            type="number"
            min={1}
            max={1440}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
          />
        </label>
        <label className="text-[9px] font-mono uppercase text-[#8C8C90]">
          Effort (1–10, optional)
          <input
            type="number"
            min={1}
            max={10}
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
          />
        </label>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={500}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white placeholder:text-[#8C8C90]/60"
      />
      {error && (
        <p role="alert" className="text-[10px] font-mono text-crimson">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save activity"}
      </button>
    </form>
  );
};
