// SVJ Recovery V2 — Phase 5: the real Recovery → Goals section.
//
// Server-authoritative goals on the EXISTING svj_goals system: progress is
// always derived by the server; the client can create, retarget and cancel
// but never state progress. Only the four Recovery metrics are offered here —
// TrainGoals keeps its activity metrics untouched. Form controls use the
// shared SVJSelect primitive (no native <select> overlay on Android).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Target, Trash2 } from "lucide-react";
import { SVJEmptyState } from "../ui-primitives/SVJEmptyState";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import {
  GOAL_METRIC_LABELS,
  RECOVERY_GOAL_METRICS,
  createGoal,
  listGoals,
  cancelGoal,
  updateGoal,
  formatGoalProgress,
  periodBoundsWeekly,
  periodBoundsMonthly,
  periodLabel,
  validateGoalInput,
  type GoalDto,
  type GoalMetric,
  type GoalPeriod,
} from "../../lib/goalsRecords";
import { sanitizeTrainingRpcError } from "../../lib/trainingErrors";
import { SVJSelect } from "../ui-primitives/SVJSelect";

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

const callRpc = (
  fn: string,
  args?: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> => {
  const client = rpcClient();
  if (!client)
    return Promise.resolve({ data: null, error: { message: "Backend is not configured." } });
  return client.rpc(fn, args);
};

const CARD = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-3";
const SECTION_TITLE = "text-[11px] font-inter font-semibold text-[#8C8C90]";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A] disabled:cursor-not-allowed disabled:opacity-50";

/** Plain-language qualifying conditions — no medical claims. */
const METRIC_HINTS: Record<string, string> = {
  recovery_checkin_count: "Days with a saved recovery check-in.",
  sleep_7h_day_count: "Check-in days where you reported 7+ hours of sleep.",
  rest_day_count: "Days with no recorded activity in the goal period.",
  readiness_60_day_count: "Days your readiness score reached 60 or higher.",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  expired: "Expired",
  cancelled: "Cancelled",
};

const GoalCard: React.FC<{
  goal: GoalDto;
  onRetarget?: (target: number) => void;
  onCancel?: () => void;
  busy?: boolean;
}> = ({ goal, onRetarget, onCancel, busy }) => {
  const percent = Math.min(100, Math.round((goal.progress / goal.targetValue) * 100));
  const done = goal.status !== "active";
  return (
    <div
      className="rounded-xl border border-white/5 bg-black/30 p-3"
      data-testid={`recovery-goal-card-${goal.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-inter font-semibold text-[#F4F2ED]">
            {GOAL_METRIC_LABELS[goal.metric]}
          </p>
          <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
            {periodLabel(goal)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider ${
            goal.status === "completed"
              ? "border-emerald-400/30 text-emerald-300"
              : goal.status === "expired"
                ? "border-gold/30 text-gold"
                : goal.status === "cancelled"
                  ? "border-white/10 text-[#8C8C90]"
                  : "border-white/10 text-[#8C8C90]"
          }`}
        >
          {STATUS_LABEL[goal.status] ?? goal.status}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${GOAL_METRIC_LABELS[goal.metric]}: ${formatGoalProgress(goal.metric, goal.progress)} of ${formatGoalProgress(goal.metric, goal.targetValue)} days`}
      >
        <div
          className={`h-full rounded-full ${goal.status === "completed" ? "bg-emerald-400" : "bg-gold"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] font-inter text-[#F4F2ED]">
        {formatGoalProgress(goal.metric, goal.progress)} /{" "}
        {formatGoalProgress(goal.metric, goal.targetValue)} days
        <span className="sr-only">
          {" "}
          — {percent}% complete, {STATUS_LABEL[goal.status] ?? goal.status}
        </span>
      </p>
      <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
        {METRIC_HINTS[goal.metric] ?? "Derived by the server from your own data."}
      </p>
      {!done && (onRetarget || onCancel) && (
        <div className="mt-2 flex gap-2">
          {onRetarget && (
            <button
              type="button"
              className={`${BUTTON} flex-1`}
              disabled={busy}
              onClick={() => {
                const next = Math.min(goal.targetValue + 1, 31);
                if (next !== goal.targetValue) onRetarget(next);
              }}
              data-testid={`recovery-goal-edit-${goal.id}`}
            >
              +1 day target
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              className={`${BUTTON} flex-1 border-[#C81E3A]/40 text-[#C81E3A]`}
              disabled={busy}
              onClick={onCancel}
              data-testid={`recovery-goal-cancel-${goal.id}`}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const RecoveryGoalsSection: React.FC = () => {
  const [goals, setGoals] = useState<GoalDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Distinguishes "the goal RPCs are missing on this backend" from a generic
  // load failure, so the error surface can say which one actually happened.
  const [deploymentIssue, setDeploymentIssue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const [metric, setMetric] = useState<GoalMetric>("recovery_checkin_count");
  const [target, setTarget] = useState(5);
  const [period, setPeriod] = useState<GoalPeriod>("weekly");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    const result = await listGoals(callRpc, true);
    if (signal.cancelled) return; // unmounted mid-flight — drop the response
    setGoals(result.ok ? result.goals : []);
    if (!result.ok) {
      const { meta } = sanitizeTrainingRpcError(result.error ?? "");
      setDeploymentIssue(Boolean(meta.deploymentProblem));
      setError("recovery-goals-load-failed");
    } else {
      setDeploymentIssue(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load, attempt]); // attempt only changes via the explicit retry button

  const periodBounds = useMemo(
    () => (period === "weekly" ? periodBoundsWeekly(new Date()) : periodBoundsMonthly(new Date())),
    [period],
  );

  /** Client mirror of the server's day-count validation — UX only. */
  const daysInPeriod =
    (Date.parse(`${periodBounds.periodEnd}T00:00:00`) -
      Date.parse(`${periodBounds.periodStart}T00:00:00`)) /
      86_400_000 +
    1;
  const maxTarget = period === "weekly" ? 7 : 31;
  const targetOptions = Array.from({ length: maxTarget }, (_, i) => i + 1).map((n) => ({
    value: n,
    label: `${n} day${n === 1 ? "" : "s"}`,
  }));
  const effectiveTarget = Math.min(target, maxTarget);

  const submit = async () => {
    setFormError(null);
    const input = {
      metric,
      targetValue: effectiveTarget,
      periodType: period,
      periodStart: periodBounds.periodStart,
      periodEnd: periodBounds.periodEnd,
      activityType: null,
    };
    const invalid = validateGoalInput(input);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setBusy(true);
    const result = await createGoal(callRpc, {
      metric: input.metric as GoalMetric,
      targetValue: input.targetValue as number,
      periodType: period,
      periodStart: input.periodStart as string,
      periodEnd: input.periodEnd as string,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error ?? "Couldn't create the goal.");
      return;
    }
    setFormError(null);
    await load({ cancelled: false });
  };

  const retarget = async (goal: GoalDto, next: number) => {
    setBusy(true);
    await updateGoal(callRpc, goal.id, next);
    setBusy(false);
    await load({ cancelled: false });
  };

  const cancel = async (goal: GoalDto) => {
    setBusy(true);
    await cancelGoal(callRpc, goal.id);
    setBusy(false);
    await load({ cancelled: false });
  };

  if (loading && goals === null) {
    return (
      <div
        role="tabpanel"
        id="recovery-panel-goals"
        aria-labelledby="recovery-tab-goals"
        data-testid="recovery-section-goals"
        className={CARD}
      >
        <h2 className="font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]">
          Recovery goals
        </h2>
        <p
          className="mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]"
          data-testid="recovery-goals-loading"
        >
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          Loading your goals…
        </p>
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="recovery-panel-goals"
      aria-labelledby="recovery-tab-goals"
      data-testid="recovery-section-goals"
    >
      <div className={CARD}>
        <h2 className="font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]">
          Recovery goals
        </h2>
        <p className="mt-1 text-[11px] font-inter text-[#8C8C90]">
          Progress is derived on the server from your own check-ins, recorded activity and readiness
          — never entered by hand.
        </p>

        {error ? (
          <div data-testid="recovery-goals-error">
            <SVJEmptyState
              variant="error"
              compact
              title={
                deploymentIssue
                  ? "Recovery goals aren't available on this deployment yet"
                  : "Your recovery goals didn't load"
              }
              description={
                deploymentIssue
                  ? "The goal functions haven't been applied to this backend yet. Your check-ins and readiness are unaffected."
                  : "Goals are measured on the server from your own check-ins and activity, so they need a connection to your account."
              }
              action={
                <button
                  type="button"
                  className={BUTTON}
                  data-testid="recovery-goals-retry"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                  Try again
                </button>
              }
            />
          </div>
        ) : (
          <>
            {/* Create form — Recovery metrics only, SVJSelect everywhere. */}
            <div
              className="mt-3 rounded-xl border border-white/5 bg-black/30 p-3"
              data-testid="recovery-goal-form"
            >
              <p className={SECTION_TITLE}>New goal</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <SVJSelect
                  label="Metric"
                  value={metric}
                  testId="recovery-goal-metric"
                  options={RECOVERY_GOAL_METRICS.map((m) => ({
                    value: m as GoalMetric,
                    label: GOAL_METRIC_LABELS[m],
                  }))}
                  onChange={(next) => setMetric(next)}
                />
                <SVJSelect
                  label="Target"
                  value={effectiveTarget}
                  testId="recovery-goal-target"
                  options={targetOptions}
                  onChange={(next) => setTarget(next)}
                />
                <SVJSelect
                  label="Period"
                  value={period}
                  testId="recovery-goal-period"
                  options={[
                    { value: "weekly" as GoalPeriod, label: "This week" },
                    { value: "monthly" as GoalPeriod, label: "This month" },
                  ]}
                  onChange={(next) => setPeriod(next)}
                />
              </div>
              <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
                {METRIC_HINTS[metric]}
              </p>
              {formError && (
                <p
                  className="mt-2 text-[11px] font-inter text-[#C81E3A]"
                  data-testid="recovery-goal-form-error"
                  role="alert"
                >
                  {formError}
                </p>
              )}
              <button
                type="button"
                className={`${BUTTON} mt-2 w-full border-[#C81E3A]/50 bg-[#C81E3A]/15`}
                disabled={busy}
                onClick={submit}
                data-testid="recovery-goal-create"
              >
                <Target aria-hidden className="h-3.5 w-3.5" />
                Create goal
              </button>
            </div>

            {(goals ?? []).length === 0 ? (
              <p
                className="mt-4 text-center text-[11px] font-mono uppercase text-[#8C8C90]"
                data-testid="recovery-goals-empty"
              >
                No goals yet — create your first recovery goal above.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {(goals ?? []).map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    busy={busy}
                    onRetarget={
                      goal.status === "active" ? (next) => void retarget(goal, next) : undefined
                    }
                    onCancel={goal.status === "active" ? () => void cancel(goal) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RecoveryGoalsSection;
