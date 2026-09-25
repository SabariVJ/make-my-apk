// SVJ Recovery V2 — Phase 3 founder Overview widgets.
//
// Rendered around the existing TrainRecovery panel inside the founder-only
// Recovery destination. Every displayed value is derived by the pure helpers in
// ../lib/recoveryInsights from real data; absent data shows honest empty
// states. The fatigue map is explicitly an activity summary, not physiology.
import React from "react";
import { Flame, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import {
  estimateMuscleRecovery,
  muscleRecoveryStateLabel,
  recoveryCheckinStreak,
  todaysFocus,
  applicableActivityGoals,
  type ReadinessResult,
} from "../../lib/recoveryInsights";
import type { GoalDto } from "../../lib/goalsRecords";
import type { MuscleHistoryRow } from "../../lib/trainingClient";
import type { MuscleDataAvailability } from "../../hooks/useRecoveryInsights";
import { MuscleBodyMap } from "./MuscleBodyMap";

const CARD = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-3.5 mb-2.5";
const CARD_TITLE = "text-[11px] font-inter font-semibold text-[#8C8C90]";

const STATE_COLORS: Record<string, string> = {
  fresh: "text-emerald-400",
  moderate: "text-gold",
  high: "text-[#C81E3A]",
  no_recent_data: "text-[#8C8C90]",
};

const STATE_SWATCH: Record<string, string> = {
  fresh: "bg-emerald-400",
  moderate: "bg-gold",
  high: "bg-[#C81E3A]",
  no_recent_data: "bg-[#8C8C90]",
};

const FocusEmphasisStyles: Record<string, string> = {
  rest: "border-gold/30 bg-gold/10 text-gold",
  lighter: "border-gold/20 bg-gold/5 text-gold",
  normal: "border-white/10 bg-black/30 text-[#F4F2ED]",
  stronger: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
};

/** ── Today's Focus ─────────────────────────────────────────────────────── */
export const TodaysFocusCard: React.FC<{
  readiness: ReadinessResult;
  trainingGoal: string | null;
  goals: GoalDto[];
}> = ({ readiness, trainingGoal, goals }) => {
  const activityGoal = applicableActivityGoals(
    goals.map((g) => ({
      status: g.status,
      periodStart: g.periodStart,
      periodEnd: g.periodEnd,
      metric: g.metric,
      progress: g.progress,
      targetValue: g.targetValue,
    })),
  );
  const focus = todaysFocus({ readiness, trainingGoal, activityGoal });
  return (
    <div className={CARD} data-testid="recovery-focus">
      <p className={`mb-1.5 flex items-center gap-1.5 ${CARD_TITLE}`}>
        <Sparkles aria-hidden className="h-3 w-3 text-[#C81E3A]" /> Today&apos;s focus
      </p>
      <h2 className="font-anton text-lg tracking-wide text-[#F4F2ED]">{focus.headline}</h2>
      <p
        className={`mt-1.5 rounded-xl border px-3 py-2 text-xs font-inter leading-relaxed ${
          FocusEmphasisStyles[focus.emphasis] ?? FocusEmphasisStyles.normal
        }`}
      >
        {focus.detail}
      </p>
    </div>
  );
};

/** ── Recovery streak ───────────────────────────────────────────────────── */
export const RecoveryStreakCard: React.FC<{
  history: { date: string; hasCheckin?: boolean }[];
}> = ({ history }) => {
  const streak = recoveryCheckinStreak(history);
  return (
    <div className={CARD} data-testid="recovery-streak">
      <p className={`mb-2 ${CARD_TITLE}`}>Check-in streak</p>
      <div className="flex items-center gap-3">
        <span
          data-testid="recovery-streak-count"
          className="flex items-center gap-1.5 rounded-full border border-gold/20 bg-[#17171A] px-3 py-1.5 font-mono text-sm font-medium text-[#F4F2ED]"
        >
          <Flame aria-hidden className="h-4 w-4 text-gold fill-gold/30" />
          {streak}d
        </span>
        <p className="text-[11px] font-inter leading-snug text-[#8C8C90]">
          {streak > 0
            ? `Consecutive days with a saved recovery check-in. A missed day resets it.`
            : "No check-ins yet — save today's check-in to start your streak."}
        </p>
      </div>
    </div>
  );
};

/** ── Muscle recovery map (estimated from training history) ─────────────── */
export const MuscleRecoveryCard: React.FC<{
  rows: MuscleHistoryRow[];
  availability: MuscleDataAvailability;
}> = ({ rows, availability }) => {
  if (availability === "loading") {
    return (
      <div className={CARD} data-testid="recovery-muscles">
        <MuscleCardHeader />
        <p
          role="status"
          className="py-4 text-center text-[11px] font-mono uppercase text-[#8C8C90]"
        >
          Loading muscle history…
        </p>
      </div>
    );
  }

  if (availability === "unavailable") {
    return (
      <div className={CARD} data-testid="recovery-muscles">
        <MuscleCardHeader />
        <p
          role="status"
          data-testid="recovery-muscles-unavailable"
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] font-inter leading-relaxed text-[#8C8C90]"
        >
          Muscle recovery data isn&apos;t available on this deployment yet. Everything else in
          Recovery keeps working.
        </p>
      </div>
    );
  }

  if (availability === "error") {
    return (
      <div className={CARD} data-testid="recovery-muscles">
        <MuscleCardHeader />
        <p
          role="status"
          data-testid="recovery-muscles-error"
          className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-[11px] font-inter text-gold"
        >
          Muscle history could not be loaded right now. Retry below — nothing here is estimated
          without data.
        </p>
      </div>
    );
  }

  const map = estimateMuscleRecovery(
    rows.map((row) => ({
      muscle: row.muscle,
      directSets: row.directSets,
      supportingSets: row.supportingSets,
      directVolume: row.directVolume,
      lastTrainedDate: row.lastTrainedDate,
    })),
  );

  return (
    <div className={CARD} data-testid="recovery-muscles">
      <MuscleCardHeader />
      {!map.hasAnyData ? (
        <p className="py-3 text-center text-[11px] font-inter text-[#8C8C90]">
          No muscle data yet — complete a structured strength session.
        </p>
      ) : (
        <>
          <MuscleBodyMap
            entries={map.entries.map((entry) => ({
              muscle: entry.muscle,
              label: entry.label,
              state: entry.state,
            }))}
            className="mb-3"
          />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="recovery-muscle-list">
            {map.entries.map((entry) => (
              <li
                key={entry.muscle}
                data-testid={`muscle-${entry.muscle}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATE_SWATCH[entry.state]}`}
                  />
                  <span className="truncate text-xs font-inter text-[#F4F2ED]">{entry.label}</span>
                </span>
                <span
                  className={`shrink-0 font-inter text-[10px] font-semibold ${
                    STATE_COLORS[entry.state] ?? "text-[#8C8C90]"
                  }`}
                >
                  {muscleRecoveryStateLabel(entry.state)}
                  <span className="sr-only"> — {entry.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* Text equivalent of the whole map, for screen readers and scanning. */}
      <p className="mt-2 text-[10px] font-inter text-[#8C8C90]">
        Estimated from recent training history — not a medical or sensor measurement.
      </p>
      {map.hasAnyData && (
        <ul className="sr-only" data-testid="recovery-muscle-text">
          {map.entries.map((entry) => (
            <li key={entry.muscle}>
              {entry.label}: {muscleRecoveryStateLabel(entry.state)}. {entry.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const MuscleCardHeader: React.FC = () => (
  <p className={`mb-2 ${CARD_TITLE}`}>Estimated muscle recovery</p>
);

export const RecoveryWidgetsError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className={CARD} data-testid="recovery-widgets-error">
    <p className="flex items-center gap-1.5 text-[11px] font-mono text-gold">
      <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
      Recovery insights could not load.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-2 flex min-h-[44px] items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <RefreshCw aria-hidden className="h-3 w-3" /> Retry
    </button>
  </div>
);
