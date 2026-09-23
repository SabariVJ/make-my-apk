// SVJ Recovery V2 — Phase 7: the real Recovery → Progress weekly digest.
//
// The digest summarises the athlete's OWN last seven canonical server days
// (svj_list_my_recovery_history → RecoveryHistoryPoint). Every value is derived
// by the pure helpers in ../../lib/recoveryInsights; nothing is invented:
//   - a missing day is never treated as score 0,
//   - missing sleep is never 0 hours,
//   - a metric that has no supporting rows is omitted, not guessed,
//   - a failed read is a retryable error, never fake "no data".
// No RPC is added, no digest is persisted and no new table exists.
import React, { useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  CalendarCheck,
  Dumbbell,
  Loader2,
  Minus,
  Moon,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { listMyRecoveryHistory, type RecoveryHistoryPoint } from "../../lib/recovery";
import {
  buildWeeklyRecoveryDigest,
  digestTrendSentence,
  estimateMuscleRecovery,
  type LoadBand,
  type ReadinessTrendDirection,
} from "../../lib/recoveryInsights";
import { useRecoveryInsights } from "../../hooks/useRecoveryInsights";

const CARD = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4";
const HEADING = "font-anton text-sm uppercase tracking-wide text-[#F4F2ED]";
const CAPTION = "text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]";
const ROW =
  "flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-black/30 px-3 py-2";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A]";

const BAND_LABEL: Record<LoadBand, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very high",
};

const TREND_ICON: Record<ReadinessTrendDirection, React.FC<{ className?: string }>> = {
  improving: TrendingUp,
  declining: TrendingDown,
  stable: Minus,
  insufficient_data: Minus,
};

const TrendIcon: React.FC<{ direction: ReadinessTrendDirection }> = ({ direction }) => {
  const Icon = TREND_ICON[direction];
  // Decorative only — the trend is always stated as text beside it.
  return <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#8C8C90]" />;
};

const RecoveryWeeklyDigest: React.FC = () => {
  const [history, setHistory] = useState<RecoveryHistoryPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { muscleRows, muscleAvailability } = useRecoveryInsights();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      setHistory(null);
      const result = await listMyRecoveryHistory(14);
      if (cancelled) return;
      if (!result.ok) {
        // Raw PostgREST text (PGRST…/SQL…) never reaches the user.
        setError("Your weekly recovery summary is unavailable right now.");
        setHistory([]);
        return;
      }
      setHistory(result.history ?? []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const digest = useMemo(() => buildWeeklyRecoveryDigest(history ?? []), [history]);

  // Muscle line: only ever shown when the muscle RPC actually answered with
  // real rows — otherwise it is omitted rather than guessed.
  const muscleSummary = useMemo(() => {
    if (muscleAvailability !== "ready") return null;
    const map = estimateMuscleRecovery(
      muscleRows.map((row) => ({
        muscle: row.muscle,
        directSets: row.directSets,
        supportingSets: row.supportingSets,
        directVolume: row.directVolume,
        lastTrainedDate: row.lastTrainedDate,
      })),
    );
    const trained = map.entries.filter((entry) => entry.state !== "no_recent_data").length;
    return { trained, hasAnyData: map.hasAnyData };
  }, [muscleRows, muscleAvailability]);

  const hasMetrics =
    digest.state !== "insufficient" && digest.averageReadiness !== null && digest.windowDays > 0;

  return (
    <div
      role="tabpanel"
      id="recovery-panel-progress"
      aria-labelledby="recovery-tab-progress"
      data-testid="recovery-section-progress"
    >
      <div className={CARD}>
        <h2 className={HEADING}>Recovery this week</h2>
        <p className="mt-1 text-[11px] font-inter text-[#8C8C90]">
          A summary of your last seven recorded days, derived only from your own readiness,
          check-ins and training history. Missing days are never counted as zero.
        </p>

        {error ? (
          <div data-testid="recovery-weekly-error">
            <p className="mt-3 flex items-start gap-2 text-xs font-inter text-[#8C8C90]">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              {error}
            </p>
            <button
              type="button"
              className={`${BUTTON} mt-3`}
              data-testid="recovery-weekly-retry"
              onClick={() => setAttempt((n) => n + 1)}
            >
              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : history === null ? (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]"
            data-testid="recovery-weekly-loading"
          >
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            Loading your weekly recovery summary…
          </p>
        ) : !hasMetrics ? (
          <p
            className="mt-3 rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]"
            data-testid="recovery-weekly-insufficient"
          >
            Not enough recorded days yet to summarise this week. Save a recovery check-in on the
            Overview tab and your weekly picture will build from real data.
          </p>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="recovery-weekly-metrics">
            <li className={ROW} data-testid="recovery-weekly-average">
              <span className="text-xs font-inter text-[#F4F2ED]">Average readiness</span>
              <span className="shrink-0 font-mono text-sm font-bold text-[#E62846]">
                <span aria-hidden="true">{digest.averageReadiness} / 100</span>
                <span className="sr-only">{digest.averageReadiness} out of 100</span>
              </span>
            </li>

            <li className={ROW} data-testid="recovery-weekly-trend">
              <span className="flex items-start gap-2">
                <TrendIcon direction={digest.trend.direction} />
                <span className="text-xs font-inter text-[#F4F2ED]">
                  {digestTrendSentence(digest.trend)}
                </span>
              </span>
              {digest.trend.samples > 0 && (
                <span className={`${CAPTION} shrink-0 text-right`}>
                  {digest.trend.samples} recorded days
                </span>
              )}
            </li>

            <li className={ROW} data-testid="recovery-weekly-checkins">
              <span className="flex items-center gap-2 text-xs font-inter text-[#F4F2ED]">
                <CalendarCheck aria-hidden className="h-4 w-4 shrink-0 text-[#8C8C90]" />
                Recovery check-ins
              </span>
              <span className="shrink-0 font-mono text-sm text-[#F4F2ED]">
                {digest.checkinDays} of {digest.windowDays}
              </span>
            </li>

            <li className={ROW} data-testid="recovery-weekly-sleep">
              <span className="flex items-center gap-2 text-xs font-inter text-[#F4F2ED]">
                <BedDouble aria-hidden className="h-4 w-4 shrink-0 text-[#8C8C90]" />
                Sleep logged
              </span>
              <span className="shrink-0 font-mono text-sm text-[#F4F2ED]">
                {digest.sleepDays > 0
                  ? `${digest.sleepDays} ${digest.sleepDays === 1 ? "night" : "nights"}`
                  : "No nights"}
              </span>
            </li>

            {digest.restDaysLast3 !== null && (
              <li className={ROW} data-testid="recovery-weekly-rest">
                <span className="flex items-center gap-2 text-xs font-inter text-[#F4F2ED]">
                  <Moon aria-hidden className="h-4 w-4 shrink-0 text-[#8C8C90]" />
                  Days without recorded training
                </span>
                <span className="shrink-0 font-mono text-sm text-[#F4F2ED]">
                  {digest.restDaysLast3} of the last 3
                </span>
              </li>
            )}

            {digest.loadBand !== null && (
              <li className={ROW} data-testid="recovery-weekly-load">
                <span className="text-xs font-inter text-[#F4F2ED]">Training load</span>
                <span className="shrink-0 font-mono text-sm text-[#F4F2ED]">
                  {BAND_LABEL[digest.loadBand]}
                </span>
              </li>
            )}

            {muscleSummary && (
              <li className={ROW} data-testid="recovery-weekly-muscles">
                <span className="flex items-center gap-2 text-xs font-inter text-[#F4F2ED]">
                  <Dumbbell aria-hidden className="h-4 w-4 shrink-0 text-[#8C8C90]" />
                  Strength training
                </span>
                <span className="shrink-0 font-mono text-sm text-[#F4F2ED]">
                  {muscleSummary.hasAnyData
                    ? `${muscleSummary.trained} groups in 7 days`
                    : "None in 7 days"}
                </span>
              </li>
            )}
          </ul>
        )}

        {!error && history !== null && hasMetrics && (
          <p className="mt-3 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
            Derived from your own recorded days — nothing is estimated or inferred.
          </p>
        )}
      </div>
    </div>
  );
};

export default RecoveryWeeklyDigest;
