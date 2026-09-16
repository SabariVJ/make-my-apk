import React, { useCallback, useEffect, useState } from "react";
import {
  Target,
  Trophy,
  Plus,
  X,
  RefreshCw,
  ChevronLeft,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
  RECORD_LABELS,
  createGoal,
  cancelGoal,
  updateGoal,
  formatGoalProgress,
  formatRecordValue,
  listGoals,
  listRecords,
  periodBoundsMonthly,
  periodBoundsWeekly,
  periodLabel,
  validateGoalInput,
  type GoalDto,
  type GoalMetric,
  type GoalPeriod,
  type RecordDto,
} from "../lib/goalsRecords";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function rpcClient(): RpcClient | null {
  if (!hasSupabaseConfig()) return null;
  // Newer RPCs are not yet in the generated Database types — cast once here.
  return supabase as unknown as RpcClient;
}

/** Small rounded progress bar with the SVJ crimson fill. */
const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => (
  <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/60 p-0.5">
    <div
      className="h-full rounded-full bg-gradient-to-r from-[#C81E3A] to-[#E62846]"
      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
    />
  </div>
);

// ── Goals section ──────────────────────────────────────────────────────────

export const TrainGoals: React.FC = () => {
  const [goals, setGoals] = useState<GoalDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"active" | "completed">("active");

  const load = useCallback(async () => {
    setError(null);
    const client = rpcClient();
    if (!client) {
      setError("Backend is not configured.");
      setGoals([]);
      return;
    }
    const result = await listGoals((fn, args) => client.rpc(fn, args), true);
    if (result.ok) setGoals(result.goals);
    else {
      setError(result.error ?? "Couldn't load goals.");
      setGoals([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = (goals ?? []).filter((g) =>
    tab === "active" ? g.status === "active" : g.status === "completed",
  );

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5" data-testid="train-goals">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[#C81E3A]" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-white">
            My Goals
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white"
          >
            <Plus className="h-3 w-3" /> Create
          </button>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh goals"
            className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateGoalForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      )}

      <div className="mb-3 flex gap-2">
        {(["active", "completed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider ${
              tab === t
                ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white"
                : "border-white/10 bg-black/40 text-[#8C8C90]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {goals === null && (
        <p className="py-6 text-center text-[11px] font-mono uppercase text-[#8C8C90]">
          Loading goals…
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-center">
          <p className="mb-2 text-[11px] font-mono text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {!error && goals !== null && visible.length === 0 && (
        <p className="py-6 text-center text-[11px] font-mono text-[#8C8C90]">
          {tab === "active"
            ? "No active goals yet — create one to start tracking."
            : "No completed goals yet."}
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onChanged={() => void load()} />
        ))}
      </ul>
    </div>
  );
};

const GoalCard: React.FC<{ goal: GoalDto; onChanged: () => void }> = ({ goal, onChanged }) => {
  const percent = Math.min(100, Math.round((goal.progress / goal.targetValue) * 100));
  const completed = goal.status === "completed" || goal.progress >= goal.targetValue;
  const [editing, setEditing] = useState(false);
  const [newTarget, setNewTarget] = useState(String(goal.targetValue));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveEdit = async () => {
    const client = rpcClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    const result = await updateGoal((fn, args) => client.rpc(fn, args), goal.id, Number(newTarget));
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      onChanged();
    } else setError(result.error ?? "Couldn't update the goal.");
  };

  const cancel = async () => {
    const client = rpcClient();
    if (!client) return;
    setBusy(true);
    const result = await cancelGoal((fn, args) => client.rpc(fn, args), goal.id);
    setBusy(false);
    if (result.ok) onChanged();
    else setError(result.error ?? "Couldn't cancel the goal.");
  };

  return (
    <li className="rounded-xl border border-white/5 bg-black/40 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
          {GOAL_METRIC_LABELS[goal.metric]}
          {goal.activityType ? ` · ${goal.activityType}` : ""}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${
            completed
              ? "border-emerald-500/40 text-emerald-400"
              : "border-white/15 text-[#8C8C90]"
          }`}
        >
          {periodLabel(goal)}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="font-mono text-lg font-bold text-white">
          {formatGoalProgress(goal.metric, goal.progress)}
          <span className="text-sm text-[#8C8C90]">
            {" / "}
            {formatGoalProgress(goal.metric, goal.targetValue)}
          </span>
        </span>
        <span className="font-mono text-sm font-bold text-[#E62846]">{percent}%</span>
      </div>
      <div className="mt-1.5">
        <ProgressBar percent={percent} />
      </div>
      {completed && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> GOAL COMPLETE
        </p>
      )}
      {goal.status === "active" && !editing && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
          >
            Edit target
          </button>
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={busy}
            className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-red-400"
          >
            Cancel goal
          </button>
        </div>
      )}
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            className="w-24 rounded-lg border border-white/10 bg-[#17171A] px-2 py-1.5 text-xs text-white"
          />
          <button
            type="button"
            onClick={() => void saveEdit()}
            disabled={busy}
            className="rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-2 py-1.5 text-[9px] font-mono uppercase text-white"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[9px] font-mono uppercase text-[#8C8C90]"
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-[10px] font-mono text-red-400">
          {error}
        </p>
      )}
    </li>
  );
};

const CreateGoalForm: React.FC<{ onClose: () => void; onCreated: () => void }> = ({
  onClose,
  onCreated,
}) => {
  const [metric, setMetric] = useState<GoalMetric>("workout_count");
  const [periodType, setPeriodType] = useState<GoalPeriod>("monthly");
  const [target, setTarget] = useState("12");
  const [activityType, setActivityType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bounds =
      periodType === "weekly" ? periodBoundsWeekly(new Date()) : periodBoundsMonthly(new Date());
    const input = {
      metric,
      targetValue: Number(target),
      periodType,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      activityType: activityType || null,
    };
    const invalid = validateGoalInput(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    const client = rpcClient();
    if (!client) {
      setError("Backend is not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createGoal((fn, args) => client.rpc(fn, args), input);
    setBusy(false);
    if (result.ok) onCreated();
    else setError(result.error ?? "Couldn't create the goal.");
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mb-3 space-y-2 rounded-xl border border-white/10 bg-black/40 p-3"
      data-testid="create-goal-form"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-white">
          Create goal
        </span>
        <button type="button" onClick={onClose} aria-label="Close form">
          <X className="h-3.5 w-3.5 text-[#8C8C90]" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[9px] font-mono uppercase text-[#8C8C90]">
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as GoalMetric)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
          >
            {GOAL_METRICS.map((m) => (
              <option key={m} value={m}>
                {GOAL_METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[9px] font-mono uppercase text-[#8C8C90]">
          Period
          <select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as GoalPeriod)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[9px] font-mono uppercase text-[#8C8C90]">
          Target
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
          />
        </label>
        <label className="text-[9px] font-mono uppercase text-[#8C8C90]">
          Activity type (optional)
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
          >
            <option value="">Any</option>
            {["walking", "running", "cycling", "strength", "yoga"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-[10px] font-mono text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create goal"}
      </button>
    </form>
  );
};

// ── Progress / Personal Records section ───────────────────────────────────

export const TrainProgress: React.FC = () => {
  const [records, setRecords] = useState<RecordDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const client = rpcClient();
    if (!client) {
      setError("Backend is not configured.");
      setRecords([]);
      return;
    }
    const result = await listRecords((fn, args) => client.rpc(fn, args));
    if (result.ok) setRecords(result.records);
    else {
      setError(result.error ?? "Couldn't load records.");
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5"
      data-testid="train-progress"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-white">
            Personal Records
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh records"
          className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {records === null && (
        <p className="flex items-center justify-center gap-2 py-6 text-[11px] font-mono uppercase text-[#8C8C90]">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading records…
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-center">
          <p className="mb-2 text-[11px] font-mono text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {!error && records !== null && (
        <ul className="space-y-2">
          {RECORD_LABELS &&
            (Object.keys(RECORD_LABELS) as (keyof typeof RECORD_LABELS)[]).map((type) => {
              const record = records.find((r) => r.recordType === type);
              return (
                <li
                  key={type}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-black/40 p-3"
                >
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                    {RECORD_LABELS[type]}
                  </span>
                  {record ? (
                    <span className="font-mono text-sm font-bold text-[#E62846]">
                      {formatRecordValue(record.recordType, record.value)}
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">
                      Complete more activities to set this record
                    </span>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {!error && records !== null && records.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
            Recent records
          </p>
          <ul className="space-y-1">
            {[...records]
              .sort((a, b) => (a.achievedAt < b.achievedAt ? 1 : -1))
              .slice(0, 4)
              .map((r) => (
                <li
                  key={`${r.recordType}-${r.activityId}`}
                  className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5"
                >
                  <span className="text-[10px] font-mono text-[#8C8C90]">
                    {new Date(r.achievedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="text-[10px] font-mono text-white">
                    {RECORD_LABELS[r.recordType]} ·{" "}
                    <span className="text-[#E62846]">
                      {formatRecordValue(r.recordType, r.value)}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** Back-chevron shared by detail screens. */
export const BackLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mb-3 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
  >
    <ChevronLeft className="h-3.5 w-3.5" /> {label}
  </button>
);
