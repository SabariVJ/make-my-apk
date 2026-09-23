// SVJ Recovery V2 — Phase 4: the real Recovery → History section.
//
// Built ONLY from svj_list_my_recovery_history rows (the server date string is
// the canonical day key). A missing calendar day is NO DATA — never a fabricated
// zero score. Colour is never the only signal: every cell carries a glyph and a
// full accessible label, selectable days are real buttons with ≥44px targets.
import React, { useCallback, useMemo, useState } from "react";
import { Loader2, Moon, RefreshCw, TriangleAlert } from "lucide-react";
import { listMyRecoveryHistory, type RecoveryHistoryPoint } from "../../lib/recovery";
import {
  SLEEP_CORRELATION_MIN_SAMPLES,
  bestSleepRange,
  buildRecoveryHeatmap,
  correlateSleepReadiness,
  heatCellBandLabel,
  heatCellDateLabel,
  type HeatmapCell,
} from "../../lib/recoveryInsights";

const CARD = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-3";
const HEADING = "font-anton text-sm uppercase tracking-wide text-[#F4F2ED]";
const SECTION_TITLE = "text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]";

const HISTORY_LIMIT = 35;

/** Visual treatment per scored grade; also used by the legend. */
const GRADE_STYLE: Record<string, { bg: string; text: string; swatch: string }> = {
  excellent: { bg: "bg-emerald-400/25", text: "text-emerald-300", swatch: "bg-emerald-400" },
  good: { bg: "bg-gold/25", text: "text-gold", swatch: "bg-gold" },
  fair: { bg: "bg-orange-400/25", text: "text-orange-300", swatch: "bg-orange-400" },
  poor: { bg: "bg-[#C81E3A]/30", text: "text-[#C81E3A]", swatch: "bg-[#C81E3A]" },
  unknown: { bg: "bg-white/5", text: "text-[#8C8C90]", swatch: "bg-white/10" },
};

/** Cell glyph — meaning is never carried by colour alone. */
const GRADE_GLYPH: Record<string, string> = {
  excellent: "◆",
  good: "◆",
  fair: "◇",
  poor: "✕",
  unknown: "",
};

const cellStyle = (cell: HeatmapCell) =>
  cell.state === "no_data" ? GRADE_STYLE.unknown : GRADE_STYLE[cell.grade ?? "unknown"];

const cellAria = (cell: HeatmapCell) =>
  cell.state === "no_data"
    ? `${heatCellDateLabel(cell.date)}, no recovery data`
    : `${heatCellDateLabel(cell.date)}, readiness ${cell.score}, ${heatCellBandLabel(cell.grade)}, ${
        cell.hasCheckin ? "check-in completed" : "no check-in"
      }`;

/** Selected-day summary: the real server fields behind the cell. */
const DayDetail: React.FC<{ cell: HeatmapCell }> = ({ cell }) => (
  <div
    className={`${CARD} mb-0 border-[#C81E3A]/30`}
    role="status"
    data-testid="recovery-history-day-detail"
  >
    <p className={SECTION_TITLE}>{heatCellDateLabel(cell.date)}</p>
    {cell.state === "no_data" ? (
      <p className="mt-1 text-xs font-inter text-[#8C8C90]">
        No readiness data for this day — SVJ never fills gaps with estimates.
      </p>
    ) : (
      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-inter text-[#F4F2ED]">
        <div className="flex justify-between gap-2">
          <dt className="text-[#8C8C90]">Readiness</dt>
          <dd className="font-mono">
            {cell.score} — {heatCellBandLabel(cell.grade)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#8C8C90]">Check-in</dt>
          <dd className="font-mono">{cell.hasCheckin ? "Completed" : "None"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#8C8C90]">Reported sleep</dt>
          <dd className="font-mono">{cell.sleepHours !== null ? `${cell.sleepHours} h` : "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#8C8C90]">Activity load</dt>
          <dd className="font-mono">{cell.band ? cell.band.replace("_", " ") : "—"}</dd>
        </div>
      </dl>
    )}
  </div>
);

const RecoveryHistorySection: React.FC = () => {
  const [history, setHistory] = useState<RecoveryHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const result = await listMyRecoveryHistory(HISTORY_LIMIT);
      if (!mounted) return;
      if (result.ok) {
        setHistory(result.history ?? []);
      } else {
        // Raw RPC text stays in the console, never in the UI.
        setError("Recovery history is unavailable right now.");
      }
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [attempt]);

  const cells = useMemo(() => buildRecoveryHeatmap(history ?? [], HISTORY_LIMIT), [history]);

  // Sleep insights read the SAME server rows — one authoritative collection.
  const correlation = useMemo(() => correlateSleepReadiness(history ?? []), [history]);
  const bestSleep = useMemo(
    () =>
      bestSleepRange(
        (history ?? []).map((row) => ({
          date: row.date,
          checkin: {
            sleepHours: row.sleepHours,
            soreness: row.soreness,
            energy: row.energy,
            perceivedRecovery: row.perceivedRecovery,
          },
          activityLoadPoints: row.activityLoadPoints,
          taskLoadPoints: 0,
          totalLoadPoints: row.activityLoadPoints,
          band: "moderate",
          score: row.score,
          recovery: "unknown",
          taskCount: 0,
        })),
      ),
    [history],
  );

  const selectedCell = cells.find((cell) => cell.date === selected) ?? null;

  const focusCell = useCallback((cell: HeatmapCell) => {
    setSelected(cell.date);
  }, []);

  if (loading && history === null) {
    return (
      <div
        role="tabpanel"
        id="recovery-panel-history"
        aria-labelledby="recovery-tab-history"
        data-testid="recovery-section-history"
        className={CARD}
      >
        <h2 className={HEADING}>Recovery history</h2>
        <p
          className="mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]"
          data-testid="recovery-history-loading"
        >
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          Loading your recovery history…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="tabpanel"
        id="recovery-panel-history"
        aria-labelledby="recovery-tab-history"
        data-testid="recovery-section-history"
        className={CARD}
      >
        <h2 className={HEADING}>Recovery history</h2>
        <p
          className="mt-3 flex items-start gap-2 text-xs font-inter text-[#8C8C90]"
          data-testid="recovery-history-error"
        >
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          {error}
        </p>
        <button
          type="button"
          data-testid="recovery-history-retry"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A]"
        >
          <RefreshCw aria-hidden className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      role="tabpanel"
      id="recovery-panel-history"
      aria-labelledby="recovery-tab-history"
      data-testid="recovery-section-history"
    >
      <div className={CARD}>
        <h2 className={HEADING}>Recovery history</h2>
        <p className="mt-1 text-[11px] font-inter text-[#8C8C90]">
          Your last {HISTORY_LIMIT} days, from your saved readiness on the server. Days without
          saved data stay empty — they are never counted as low readiness.
        </p>

        {cells.length === 0 ? (
          <p
            className="mt-4 text-center text-[11px] font-mono uppercase text-[#8C8C90]"
            data-testid="recovery-history-empty"
          >
            No recovery history yet — save a check-in on the Overview tab to start.
          </p>
        ) : (
          <>
            <ul
              className="mt-3 grid grid-cols-7 gap-1.5"
              data-testid="recovery-history-grid"
              aria-label="Recovery history calendar"
            >
              {cells.map((cell) => {
                const style = cellStyle(cell);
                const isSelected = selected === cell.date;
                return (
                  <li key={cell.date}>
                    <button
                      type="button"
                      data-testid={`recovery-history-cell-${cell.date}`}
                      aria-label={cellAria(cell)}
                      aria-pressed={isSelected}
                      onClick={() => focusCell(cell)}
                      className={`flex h-10 w-full min-w-[44px] items-center justify-center rounded-lg border text-[10px] font-mono transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C81E3A] ${
                        isSelected ? "border-[#C81E3A]" : "border-white/5"
                      } ${style.bg}`}
                    >
                      <span aria-hidden className={style.text}>
                        {cell.state === "no_data" ? "·" : GRADE_GLYPH[cell.grade ?? "unknown"]}
                      </span>
                      <span className="sr-only">{cellAria(cell)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Legend — colour + glyph + word, so no meaning is colour-only. */}
            <ul
              className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
              data-testid="recovery-history-legend"
            >
              {(
                [
                  ["excellent", "78+"],
                  ["good", "60–77"],
                  ["fair", "40–59"],
                  ["poor", "below 40"],
                  ["unknown", "no data"],
                ] as const
              ).map(([grade, range]) => (
                <li
                  key={grade}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90]"
                >
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 items-center justify-center rounded ${GRADE_STYLE[grade].swatch} ${
                      grade === "unknown" ? "" : "bg-opacity-40"
                    }`}
                  >
                    {GRADE_GLYPH[grade] || "·"}
                  </span>
                  {grade === "unknown"
                    ? "No data"
                    : `${grade[0].toUpperCase()}${grade.slice(1)} (${range})`}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {selectedCell && <DayDetail cell={selectedCell} />}

      <div className={CARD} data-testid="recovery-sleep-correlation">
        <p className={SECTION_TITLE}>Sleep vs readiness</p>
        <p className="mt-1 text-xs font-inter leading-relaxed text-[#F4F2ED]">
          {correlation.summary}
        </p>
        <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
          {correlation.samples} paired day{correlation.samples === 1 ? "" : "s"} from your own
          check-ins · observed tendency only, not a cause
        </p>
      </div>

      <div className={CARD} data-testid="recovery-best-sleep">
        <p className={SECTION_TITLE}>Your best sleep</p>
        {bestSleep.insufficientData || !bestSleep.bestRangeLabel ? (
          <p className="mt-1 text-xs font-inter leading-relaxed text-[#8C8C90]">
            Not enough logged nights yet — save check-ins with your sleep hours and SVJ will find
            the range that suits you.
          </p>
        ) : (
          <>
            <p className="mt-1 flex items-center gap-2 text-xs font-inter leading-relaxed text-[#F4F2ED]">
              <Moon aria-hidden className="h-4 w-4 shrink-0 text-gold" />
              On nights around {bestSleep.bestRangeLabel}, your next-day energy and readiness have
              been at their best.
            </p>
            <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
              From your own logged recovery history — not a clinical recommendation
            </p>
          </>
        )}
        <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
          Sleep insight needs {SLEEP_CORRELATION_MIN_SAMPLES}+ paired days before SVJ will interpret
          anything.
        </p>
      </div>
    </div>
  );
};

export default RecoveryHistorySection;
