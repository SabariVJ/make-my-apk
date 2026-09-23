// Update 05 — Train › RECOVERY section.
//
// Server-derived deterministic readiness (activity load + optional daily
// check-in). Every displayed input is labeled with its source:
// "recorded activity" vs "your check-in". No AI, no medical claims.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { HeartPulse, Loader2, Moon, RefreshCw, TrendingUp } from "lucide-react";
import {
  getMyReadiness,
  saveMyRecoveryCheckin,
  listMyRecoveryHistory,
  type ReadinessData,
  type RecoveryHistoryPoint,
} from "../lib/recovery";
import { useSVJ } from "../context/SVJContext";
import { readStoredJson, writeStoredJson } from "../lib/storage";
import { localDayKey } from "../lib/taskCompletions";
import {
  DEFAULT_WAKE_HOUR,
  RECOVERY_HISTORY_STORAGE_KEY,
  bestSleepRange,
  computeReadiness,
  mergeServerHistory,
  normalizeHistory,
  readinessTrend,
  recomputeSleepWindow,
  taskLoadForDay,
  taskLoadPoints,
  upsertDayRecord,
  type LoadBand,
  type ReadinessResult,
  type RecoveryDayRecord,
  type RecoveryGrade,
  type ServerHistoryDay,
} from "../lib/recoveryInsights";
import { useTrainRecoveryPublisher } from "../lib/readinessShared";

const LOAD_LABELS: Record<string, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very High",
};

const SCORE_COLOR = (score: number) =>
  score >= 78 ? "#34d399" : score >= 60 ? "#eab308" : score >= 40 ? "#fb923c" : "#f87171";

function ScoreRing({ score }: { score: number }) {
  const color = SCORE_COLOR(score);
  const radius = 44;
  const c = 2 * Math.PI * radius;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg width={112} height={112} className="-rotate-90">
        <circle
          cx={56}
          cy={56}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={9}
          fill="none"
        />
        <circle
          cx={56}
          cy={56}
          r={radius}
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-anton text-3xl" style={{ color }}>
          {score}
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">/ 100</span>
      </div>
    </div>
  );
}

const ScaleInput: React.FC<{
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  low: string;
  high: string;
  testId: string;
}> = ({ label, value, onChange, low, high, testId }) => (
  <div className="rounded-2xl border border-white/5 bg-black/40 p-3" data-testid={testId}>
    <div className="mb-1 flex items-center justify-between">
      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white">
        {label}
      </span>
      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[9px] font-mono text-[#8C8C90] hover:text-white"
        >
          clear
        </button>
      )}
    </div>
    <div className="flex justify-between gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-8 flex-1 rounded-lg border text-xs font-mono font-bold transition-colors ${
            value === n
              ? "border-[#C81E3A]/60 bg-[#C81E3A]/25 text-white"
              : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
    <div className="mt-1 flex justify-between text-[8px] font-mono uppercase text-[#8C8C90]">
      <span>{low}</span>
      <span>{high}</span>
    </div>
  </div>
);

/**
 * Combined readiness for today: server activity load + client task load,
 * blended with the manual check-in by the same transparent formula the server
 * uses. Falls back to the server snapshot's own inputs when offline.
 */
function combine(
  serverReadiness: ReadinessData | null,
  rows: Parameters<typeof taskLoadPoints>[0],
  checkin: {
    sleepHours: number | null;
    soreness: number | null;
    energy: number | null;
    perceivedRecovery: number | null;
  },
): ReadinessResult {
  const task = taskLoadPoints(rows);
  return computeReadiness({
    activityLoadPoints: serverReadiness?.components.loadPoints7d ?? 0,
    taskLoadPoints: task.points,
    taskCount: task.taskCount,
    checkin,
    restDays: serverReadiness?.components.restDaysLast3 ?? null,
  });
}

/**
 * Adapter: one server history row → the client's day-record merge input.
 * Only real server values are forwarded; nothing is inferred here.
 */
const serverDay = (point: RecoveryHistoryPoint): ServerHistoryDay => ({
  date: point.date,
  score: point.score,
  band: point.trainingLoad as LoadBand,
  recovery: point.recovery as RecoveryGrade,
  hasCheckin: point.hasCheckin,
  sleepHours: point.sleepHours,
  soreness: point.soreness,
  energy: point.energy,
  perceivedRecovery: point.perceivedRecovery,
  activityLoadPoints: point.activityLoadPoints,
  restDaysLast3: point.restDaysLast3,
});

export const TrainRecovery: React.FC = () => {
  // Day records + history are also lifted into a shared context so the
  // founder's Phase-3 widgets (Today's Focus / streak) reuse the SAME
  // readiness history without a second round of queries. See the provider
  // below; when absent (ordinary Train › Recovery) the component works alone.
  // Task completions live on the client, so the task share of today's training
  // load is computed here and combined with the server's activity load.
  const { taskCompletions } = useSVJ();
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [history, setHistory] = useState<RecoveryHistoryPoint[]>([]);
  const [dayHistory, setDayHistory] = useState<RecoveryDayRecord[]>(() =>
    normalizeHistory(readStoredJson(RECOVERY_HISTORY_STORAGE_KEY, [])),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when the server's own history could not be read — the local days are
  // still shown, and the athlete is told instead of silently losing them.
  const [historyError, setHistoryError] = useState(false);
  const [saved, setSaved] = useState(false);

  const [sleepHours, setSleepHours] = useState<string>("");
  const [soreness, setSoreness] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [perceived, setPerceived] = useState<number | null>(null);

  /** Typed check-in values (the sleep field is a text input). */
  const checkinValues = useMemo(() => {
    const hours = sleepHours.trim() === "" ? null : Number(sleepHours);
    return {
      sleepHours: hours !== null && Number.isFinite(hours) ? hours : null,
      soreness,
      energy,
      perceivedRecovery: perceived,
    };
  }, [sleepHours, soreness, energy, perceived]);

  /** Today's combined reading, recomputed whenever tasks or inputs change. */
  const today = useMemo(
    () => combine(readiness, taskCompletions, checkinValues),
    [readiness, taskCompletions, checkinValues],
  );

  /** Persist today's check-in + computed load so trends can be derived. */
  const persistToday = useCallback((record: RecoveryDayRecord) => {
    setDayHistory((previous) => {
      const next = upsertDayRecord(previous, record);
      writeStoredJson(RECOVERY_HISTORY_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHistoryError(false);
    const stored = normalizeHistory(readStoredJson(RECOVERY_HISTORY_STORAGE_KEY, []));
    const r = await getMyReadiness();
    if (r.ok && r.readiness) {
      setReadiness(r.readiness);
      setSleepHours(
        r.readiness.components.sleepHours != null ? String(r.readiness.components.sleepHours) : "",
      );
      setSoreness(r.readiness.components.soreness ?? null);
      setEnergy(r.readiness.components.energy ?? null);
      setPerceived(r.readiness.components.perceivedRecovery ?? null);
    } else {
      setError(r.error ?? "Could not load readiness.");
    }
    const h = await listMyRecoveryHistory(14);
    setHistoryError(!h.ok);
    if (h.ok) setHistory(h.history ?? []);

    // Fold the server's own days into this device's store so the 7-day trend
    // and the sleep correlation are rebuilt from durable server data (the only
    // copy of the athlete's check-ins that survives a reinstall) — every rule
    // lives in mergeServerHistory, and only days the server returned are touched.
    const merged = mergeServerHistory(stored, (h.history ?? []).map(serverDay));
    writeStoredJson(RECOVERY_HISTORY_STORAGE_KEY, merged);
    setDayHistory(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep today's row current as tasks are completed or unchecked.
  useEffect(() => {
    if (loading) return;
    const task = taskLoadPoints(taskCompletions);
    persistToday({
      date: localDayKey(),
      checkin: checkinValues,
      activityLoadPoints: readiness?.components.loadPoints7d ?? 0,
      taskLoadPoints: task.points,
      totalLoadPoints: today.components.totalLoadPoints,
      band: today.band,
      score: today.score,
      recovery: today.recovery,
      taskCount: task.taskCount,
    });
  }, [loading, readiness, taskCompletions, checkinValues, today, persistToday]);

  const sleep = useMemo(() => bestSleepRange(dayHistory), [dayHistory]);
  const window = useMemo(() => recomputeSleepWindow(sleep, today.band), [sleep, today.band]);
  const trend = useMemo(() => readinessTrend(dayHistory, 7), [dayHistory]);
  const todayTaskLoad = taskLoadForDay(
    taskCompletions.filter((row) => !row.undoneAt),
    localDayKey(),
  );

  const submit = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    const hours = sleepHours.trim() === "" ? null : Number(sleepHours);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      setError("Sleep hours must be between 0 and 24.");
      setSaving(false);
      return;
    }
    const result = await saveMyRecoveryCheckin({
      sleepHours: hours,
      soreness,
      energy,
      perceivedRecovery: perceived,
    });
    if (result.ok && result.readiness) {
      setReadiness(result.readiness);
      setSaved(true);
      const h = await listMyRecoveryHistory(14);
      if (h.ok) setHistory(h.history ?? []);
      const task = taskLoadPoints(taskCompletions);
      const combined = computeReadiness({
        activityLoadPoints: result.readiness.components.loadPoints7d ?? 0,
        taskLoadPoints: task.points,
        taskCount: task.taskCount,
        checkin: {
          sleepHours: hours,
          soreness,
          energy,
          perceivedRecovery: perceived,
        },
        restDays: result.readiness.components.restDaysLast3 ?? null,
      });
      persistToday({
        date: localDayKey(),
        checkin: { sleepHours: hours, soreness, energy, perceivedRecovery: perceived },
        activityLoadPoints: result.readiness.components.loadPoints7d ?? 0,
        taskLoadPoints: task.points,
        totalLoadPoints: combined.components.totalLoadPoints,
        band: combined.band,
        score: combined.score,
        recovery: combined.recovery,
        taskCount: task.taskCount,
      });
    } else {
      setError(result.error ?? "Check-in failed.");
    }
    setSaving(false);
  };

  const publish = useTrainRecoveryPublisher();
  useEffect(() => {
    if (!publish) return;
    publish({ dayHistory, historyPoints: history, today });
  }, [publish, dayHistory, history, today]);

  return (
    <div
      className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5"
      data-testid="train-recovery"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-rose-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-white">
            Recovery
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh recovery"
          className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-6 text-[11px] font-mono uppercase text-[#8C8C90]">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading readiness…
        </p>
      )}

      {error && (
        <div className="mb-3 rounded-2xl border border-crimson/30 bg-crimson/5 p-3 text-center">
          <p className="mb-2 text-[11px] font-mono text-crimson">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-crimson"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && readiness && (
        <>
          {/* Score summary */}
          <div className="mb-4 flex items-center gap-4 rounded-2xl border border-white/5 bg-black/40 p-4">
            {/* One readiness number: the same combined reading that drives the
                advice, the low-readiness flag and the recorded history, so real
                completed tasks genuinely move the headline score. */}
            <ScoreRing score={today.score} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Readiness
                </p>
                <p
                  data-testid="recovery-score"
                  className="font-anton text-xl uppercase"
                  style={{ color: SCORE_COLOR(today.score) }}
                >
                  {today.score} / 100
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Training Load
                </p>
                <p className="text-sm font-mono font-bold text-white">
                  {LOAD_LABELS[today.band] ?? today.band}
                  <span className="ml-1.5 text-[9px] uppercase text-[#8C8C90]">
                    {Math.round(today.components.totalLoadPoints)} pts · 7 days
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Recovery
                </p>
                <p className="text-sm font-mono font-bold capitalize text-white">
                  {today.recovery === "unknown" ? "No check-in yet" : today.recovery}
                  {today.recovery !== "unknown" && (
                    <span className="ml-1.5 text-[9px] uppercase text-[#8C8C90]">
                      your check-in
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Load breakdown — every number is labeled with its source. The task
              COUNT and the task LOAD are separate figures: the count is real
              completed work, the load is the strain it contributed. */}
          <div
            className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
            data-testid="recovery-load-breakdown"
          >
            <div className="rounded-xl border border-white/5 bg-black/40 p-3">
              <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                Recorded activity
              </p>
              <p className="font-mono text-lg font-bold text-white">
                {Math.round(today.components.activityLoadPoints)}
                <span className="ml-1 text-[9px] uppercase text-[#8C8C90]">pts / 7d</span>
              </p>
            </div>
            <div
              className="rounded-xl border border-white/5 bg-black/40 p-3"
              data-testid="recovery-completed-tasks"
            >
              <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                Completed tasks
              </p>
              <p className="font-mono text-lg font-bold text-white">
                {today.components.taskCount}
                <span className="ml-1 text-[9px] uppercase text-[#8C8C90]">tasks / 7d</span>
              </p>
            </div>
            <div
              className="rounded-xl border border-white/5 bg-black/40 p-3"
              data-testid="recovery-task-load"
            >
              <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                Task load
              </p>
              <p className="font-mono text-lg font-bold text-white">
                {Math.round(today.components.taskLoadPoints)}
                <span className="ml-1 text-[9px] uppercase text-[#8C8C90]">pts / 7d</span>
              </p>
            </div>
          </div>

          {/* Today advice + low-readiness flag */}
          <p className="mb-3 rounded-2xl border border-[#C81E3A]/25 bg-[#C81E3A]/10 px-3 py-2 text-xs font-mono text-white">
            <span className="mr-1.5 font-bold uppercase text-[#C81E3A]">Today</span>
            {today.advice}
          </p>

          {today.isLow && (
            <p
              role="status"
              data-testid="recovery-low-flag"
              className="mb-4 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2 text-[11px] font-mono text-gold"
            >
              Readiness is low ({today.score}) — tomorrow's personalized tasks are capped at Medium
              difficulty so you can recover.
            </p>
          )}

          {/* Daily check-in */}
          <div className="mb-3 rounded-2xl border border-white/5 bg-black/30 p-3">
            <p className="mb-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]">
              Daily check-in <span className="normal-case text-[#8C8C90]/70">— 30 seconds</span>
            </p>
            <label
              className="mb-2.5 block rounded-2xl border border-white/5 bg-black/40 p-3"
              data-testid="recovery-sleep"
            >
              <span className="mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-widest text-white">
                Sleep (hours)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={24}
                step={0.5}
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                placeholder="e.g. 7.5"
                className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm font-mono text-white placeholder:text-[#8C8C90]/50 focus:border-[#C81E3A]/50 focus:outline-none"
              />
            </label>
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <ScaleInput
                label="Soreness"
                value={soreness}
                onChange={setSoreness}
                low="None"
                high="Severe"
                testId="recovery-soreness"
              />
              <ScaleInput
                label="Energy"
                value={energy}
                onChange={setEnergy}
                low="Drained"
                high="Full"
                testId="recovery-energy"
              />
              <ScaleInput
                label="Recovery"
                value={perceived}
                onChange={setPerceived}
                low="Rough"
                high="Fresh"
                testId="recovery-perceived"
              />
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="mt-1 w-full rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2.5 text-xs font-mono font-bold tracking-widest text-white transition-colors hover:bg-[#C81E3A]/30 disabled:opacity-50"
            >
              {saving ? "SAVING…" : "SAVE CHECK-IN"}
            </button>
            {saved && (
              <p
                role="status"
                className="mt-2 text-center text-[10px] font-mono uppercase text-emerald-400"
              >
                Check-in saved — readiness updated
              </p>
            )}
          </div>

          {/* Tonight's sleep window — personal optimum adjusted for load */}
          <div
            className="mb-3 rounded-2xl border border-white/5 bg-black/30 p-3"
            data-testid="recovery-sleep-window"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]">
              <Moon className="h-3 w-3 text-gold" /> Tonight&apos;s sleep window
            </p>
            <p className="font-anton text-xl uppercase text-white">
              {window.minHours}–{window.maxHours} h
            </p>
            <p className="mt-0.5 text-xs font-mono text-[#8C8C90]">
              In bed {window.bedtimeFrom}–{window.bedtimeTo}{" "}
              <span className="text-[#8C8C90]/70">
                (assuming a {String(DEFAULT_WAKE_HOUR).padStart(2, "0")}:00 wake-up)
              </span>
            </p>
            {window.loadAdjustmentMinutes > 0 && (
              <p className="mt-1 text-[10px] font-mono uppercase text-gold">
                +{window.loadAdjustmentMinutes} min added for a {LOAD_LABELS[today.band]} load day
              </p>
            )}
            <p className="mt-1 text-[10px] font-mono text-[#8C8C90]">{window.note}</p>
          </div>

          {/* Personal best sleep — the user's OWN sleep vs next-day outcome */}
          <div
            className="mb-3 rounded-2xl border border-white/5 bg-black/30 p-3"
            data-testid="recovery-best-sleep"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]">
              <TrendingUp className="h-3 w-3 text-emerald-400" /> Your best sleep
            </p>
            {sleep.insufficientData ? (
              <p className="text-[11px] font-mono text-[#8C8C90]">
                Not enough history yet ({sleep.pairedDays} of 3 logged nights compared). Keep
                checking in and this becomes your own number — never a generic one.
              </p>
            ) : (
              <>
                <p className="font-anton text-xl uppercase text-emerald-400">
                  {sleep.bestRangeLabel}
                </p>
                <p className="mt-0.5 text-xs font-mono text-[#8C8C90]">
                  Best next-day energy ({sleep.best?.avgNextEnergy?.toFixed(1) ?? "—"}/5) across
                  your last {sleep.pairedDays} logged nights.
                </p>
                {sleep.buckets.length > 1 && (
                  <div className="mt-2 space-y-1">
                    {sleep.buckets.map((bucket) => (
                      <div
                        key={bucket.fromHour}
                        className="flex items-center gap-2 text-[10px] font-mono text-[#8C8C90]"
                      >
                        <span className="w-16 shrink-0">
                          {bucket.fromHour}–{bucket.toHour} h
                        </span>
                        <span className="flex-1">
                          <span
                            className="block h-1.5 rounded-full bg-[#C81E3A]"
                            style={{ width: `${((bucket.avgNextEnergy ?? 0) / 5) * 100}%` }}
                          />
                        </span>
                        <span className="w-10 text-right">
                          {bucket.avgNextEnergy?.toFixed(1) ?? "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 7-day readiness + sleep trend */}
          <div
            className="rounded-2xl border border-white/5 bg-black/30 p-3"
            data-testid="recovery-7day-trend"
          >
            <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]">
              7-day readiness &amp; sleep
            </p>
            <div className="flex items-end gap-2" style={{ height: 56 }}>
              {trend.map((point) => (
                <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className="text-[9px] font-mono"
                    style={{ color: SCORE_COLOR(point.score) }}
                  >
                    {point.hasData ? point.score : ""}
                  </span>
                  <div className="flex h-full w-full items-end">
                    <div
                      title={`${point.date}: readiness ${point.score}, sleep ${point.sleepHours ?? "—"} h`}
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${point.hasData ? Math.max(6, point.score) : 0}%`,
                        backgroundColor: SCORE_COLOR(point.score),
                        opacity: point.hasData ? 0.85 : 0.25,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-mono uppercase text-[#8C8C90]">
                    {point.label}
                  </span>
                  <span className="text-[9px] font-mono text-gold">
                    {point.sleepHours !== null ? `${point.sleepHours}h` : "·"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[9px] font-mono text-[#8C8C90]">
              Bars: readiness score · gold: hours slept ({history.length} server days recorded)
            </p>
            {historyError && (
              <p
                role="status"
                data-testid="recovery-history-note"
                className="mt-1.5 text-[9px] font-mono text-gold"
              >
                Server history is unavailable right now — showing only the days this device
                recorded. Nothing is invented.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
