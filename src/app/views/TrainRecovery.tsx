// Update 05 — Train › RECOVERY section.
//
// Server-derived deterministic readiness (activity load + optional daily
// check-in). Every displayed input is labeled with its source:
// "recorded activity" vs "your check-in". No AI, no medical claims.
import React, { useCallback, useEffect, useState } from "react";
import { HeartPulse, Loader2, RefreshCw } from "lucide-react";
import {
  getMyReadiness,
  saveMyRecoveryCheckin,
  listMyRecoveryHistory,
  type ReadinessData,
  type RecoveryHistoryPoint,
} from "../lib/recovery";

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

export const TrainRecovery: React.FC = () => {
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [history, setHistory] = useState<RecoveryHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [sleepHours, setSleepHours] = useState<string>("");
  const [soreness, setSoreness] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [perceived, setPerceived] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    if (h.ok) setHistory(h.history ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    } else {
      setError(result.error ?? "Check-in failed.");
    }
    setSaving(false);
  };

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
            <ScoreRing score={readiness.score} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Readiness
                </p>
                <p
                  className="font-anton text-xl uppercase"
                  style={{ color: SCORE_COLOR(readiness.score) }}
                >
                  {readiness.score} / 100
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Training Load
                </p>
                <p className="text-sm font-mono font-bold text-white">
                  {LOAD_LABELS[readiness.trainingLoad] ?? readiness.trainingLoad}
                  <span className="ml-1.5 text-[9px] uppercase text-[#8C8C90]">
                    from recorded activity
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
                  Recovery
                </p>
                <p className="text-sm font-mono font-bold capitalize text-white">
                  {readiness.recovery === "unknown" ? "No check-in yet" : readiness.recovery}
                  {readiness.recovery !== "unknown" && (
                    <span className="ml-1.5 text-[9px] uppercase text-[#8C8C90]">
                      your check-in
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Today advice */}
          <p className="mb-4 rounded-2xl border border-[#C81E3A]/25 bg-[#C81E3A]/10 px-3 py-2 text-xs font-mono text-white">
            <span className="mr-1.5 font-bold uppercase text-[#C81E3A]">Today</span>
            {readiness.todayAdvice}
          </p>

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
              className="mt-1 w-full rounded-2xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2.5 text-xs font-mono font-bold tracking-widest text-white transition-colors hover:bg-[#C81E3A]/30 disabled:opacity-50"
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

          {/* 14-day trend */}
          {history.length > 0 && (
            <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
              <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]">
                Last 14 days
              </p>
              <div className="flex items-end gap-1" style={{ height: 48 }}>
                {[...history].reverse().map((p) => (
                  <div
                    key={p.date}
                    title={`${p.date}: ${p.score}`}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${Math.max(6, p.score)}%`,
                      backgroundColor: SCORE_COLOR(p.score),
                      opacity: 0.85,
                    }}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[9px] font-mono text-[#8C8C90]">
                Readiness score per day — {history.length} recorded
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
