import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, Dumbbell, Info, Loader2, TrendingUp } from "lucide-react";
import { MUSCLE_LABELS, formatVolume, type ExerciseHistory } from "../lib/strength";
import {
  buildConsistency,
  buildExerciseProgress,
  buildMuscleCoverage,
  buildPlanReview,
  decisionHeadline,
  decisionReason,
  humanizeSlug,
  recency,
  TREND_LABELS,
  type CoverageStatus,
  type ExerciseProgressPoint,
  type TrainingDecisionRecord,
} from "../lib/trainingProgress";
import { SVJEmptyState } from "./ui-primitives/SVJEmptyState";
import { SVJSectionHeader } from "./ui-primitives/SVJSectionHeader";
import { MuscleBodyMap, type MuscleMapState } from "./recovery/MuscleBodyMap";
import type { MuscleHistoryRow, ServerPlan } from "../lib/trainingClient";
import type { StrengthRecordDto } from "../lib/strength";
import { toLocalIsoDate, type WeeklyPlan } from "../lib/trainingPlan";
import { svjStaggerContainer, svjStaggerItem } from "../lib/motion";

export interface TrainingProgressProps {
  loading: boolean;
  serverPlan: ServerPlan | null;
  weekly: WeeklyPlan | null;
  muscleRows: MuscleHistoryRow[];
  decisions: TrainingDecisionRecord[];
  strengthRecords: StrengthRecordDto[];
  loadExerciseHistory: (exerciseId: string) => Promise<ExerciseHistory | null>;
}

const ACTION_TONE: Record<string, string> = {
  increase: "text-[#D4AF37]",
  hold: "text-[#B8B8C0]",
  reduce: "text-[#E62846]",
  reentry: "text-[#D4AF37]",
  stop_pain: "text-[#E62846]",
  new_baseline: "text-[#8C8C90]",
  none: "text-[#8C8C90]",
};

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-3.5 sm:p-4">
    <SVJSectionHeader title={title} />
    {subtitle && (
      <p className="mt-1.5 text-[11px] font-inter leading-relaxed text-[#8C8C90]">{subtitle}</p>
    )}
    <div className="mt-2.5">{children}</div>
  </section>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-inter text-[#8C8C90]">{children}</p>
);

/**
 * Map the server's coverage status onto the body-map's load states.
 *
 * Recency drives the tint: work inside a day reads as recently trained, inside
 * three days as still recovering, anything older as recovered. A muscle with no
 * logged training is its own neutral state — never painted as a low value.
 */
const coverageState = (status: CoverageStatus, lastTrainedDate: string | null): MuscleMapState => {
  if (status !== "trained" || lastTrainedDate === null) return "no_recent_data";
  const [y, m, d] = lastTrainedDate.split("-").map(Number);
  const days = Math.floor((Date.now() - new Date(y, (m ?? 1) - 1, d ?? 1).getTime()) / 86_400_000);
  if (days <= 1) return "high";
  if (days <= 3) return "moderate";
  return "fresh";
};

export const TrainingProgress: React.FC<TrainingProgressProps> = ({
  loading,
  serverPlan,
  weekly,
  muscleRows,
  decisions,
  strengthRecords,
  loadExerciseHistory,
}) => {
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const options = useMemo(() => {
    const byId = new Map<string, string>();
    for (const record of strengthRecords) byId.set(record.exerciseId, record.exerciseName);
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [strengthRecords]);

  useEffect(() => {
    if (selectedExerciseId === null && options.length > 0) {
      setSelectedExerciseId(options[0].id);
    }
  }, [options, selectedExerciseId]);

  useEffect(() => {
    let active = true;
    if (!selectedExerciseId) {
      setHistory(null);
      return;
    }
    setHistoryLoading(true);
    void loadExerciseHistory(selectedExerciseId).then((result) => {
      if (!active) return;
      setHistory(result);
      setHistoryLoading(false);
    });
    return () => {
      active = false;
    };
  }, [selectedExerciseId, loadExerciseHistory]);

  const sessions = useMemo(() => serverPlan?.sessions ?? [], [serverPlan]);
  const consistency = useMemo(() => buildConsistency(sessions), [sessions]);
  const coverage = useMemo(() => buildMuscleCoverage(muscleRows), [muscleRows]);

  const daysSinceLastSession = useMemo(() => {
    const completed = consistency.rows
      .filter((row) => row.outcome === "completed" || row.outcome === "moved")
      .map((row) => row.scheduledDate)
      .sort();
    const last = completed[completed.length - 1];
    if (!last) return null;
    const [y, m, d] = last.split("-").map(Number);
    return Math.floor((Date.now() - new Date(y, (m ?? 1) - 1, d ?? 1).getTime()) / 86_400_000);
  }, [consistency]);

  const review = useMemo(
    () =>
      buildPlanReview({
        blockEnd: serverPlan?.blockEnd ?? weekly?.blockEnd ?? null,
        consistency,
        decisions,
        coverage,
        daysSinceLastSession,
      }),
    [serverPlan, weekly, consistency, decisions, coverage, daysSinceLastSession],
  );

  const progress = useMemo(() => {
    if (!history) return null;
    const forExercise = strengthRecords.filter((r) => r.exerciseId === history.exercise.id);
    const record = (type: StrengthRecordDto["recordType"]) =>
      forExercise.find((r) => r.recordType === type)?.value ?? null;
    return buildExerciseProgress({
      exerciseId: history.exercise.id,
      exerciseName: history.exercise.name,
      loadConvention: history.exercise.loadConvention ?? null,
      records: {
        heaviestWeightKg: record("heaviest_weight"),
        bestSetReps: record("best_set_reps"),
      },
      sessions: history.sessions.map((session) => ({
        activityId: session.activityId,
        performedAt: session.performedAt,
        localDate: toLocalIsoDate(new Date(session.performedAt)),
        loadConvention: history.exercise.loadConvention ?? null,
        sets: session.sets.map((set) => ({
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds,
          isWarmup: set.isWarmup,
        })),
      })),
    });
  }, [history, strengthRecords]);

  /** The next unstarted prescription for the selected movement, when planned. */
  const nextTarget = useMemo(() => {
    if (!history) return null;
    const slug = history.exercise.slug;
    const upcoming = sessions
      .filter((session) => session.status === "scheduled")
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    for (const session of upcoming) {
      const target = session.targets.find((t) => t.exerciseSlug === slug);
      if (target) return { session, target };
    }
    return null;
  }, [history, sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs font-inter text-[#8C8C90]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your progress…
      </div>
    );
  }

  const maxPoint = progress
    ? Math.max(
        ...progress.points.map((p) =>
          progress.trendBasis === "weight"
            ? (p.topWeightKg ?? 0)
            : progress.trendBasis === "duration"
              ? (p.topSeconds ?? 0)
              : (p.topReps ?? 0),
        ),
        1,
      )
    : 1;

  const pointValue = (point: ExerciseProgressPoint): number =>
    progress?.trendBasis === "weight"
      ? (point.topWeightKg ?? 0)
      : progress?.trendBasis === "duration"
        ? (point.topSeconds ?? 0)
        : (point.topReps ?? 0);

  // Two columns at desktop width: the review, consistency, coverage,
  // recommendation and trend cards use the horizontal space instead of one
  // card per screenful.
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2" data-testid="training-progress">
      {/* Plan review */}
      <Card title="Plan review" subtitle={review.headline}>
        <ul className="space-y-1">
          {review.reasons.map((reason) => (
            <li key={reason} className="text-[11px] font-inter text-[#B8B8C0]">
              • {reason}
            </li>
          ))}
        </ul>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Planned" value={String(review.planned)} />
          <Stat label="Completed" value={String(review.completed)} />
          <Stat label="Missed" value={String(review.missed)} />
        </div>
        <p className="mt-2 text-[10px] font-mono text-[#8C8C90]">
          {review.blockComplete
            ? "Block review is due."
            : review.daysUntilReview === null
              ? "No active block to review yet."
              : `Next review in ${review.daysUntilReview} day${review.daysUntilReview === 1 ? "" : "s"}.`}
        </p>
      </Card>

      {/* Consistency */}
      <Card
        title="Training consistency"
        subtitle="Completed plus rescheduled sessions ÷ eligible sessions"
      >
        {consistency.eligible === 0 ? (
          <Empty>No eligible sessions yet — consistency appears once the block starts.</Empty>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-white">
                {consistency.attendancePercent}
              </span>
              <span className="text-[11px] font-mono text-[#8C8C90]">% attendance</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip label={`${consistency.completed} completed`} tone="crimson" />
              <Chip label={`${consistency.moved} rescheduled`} tone="neutral" />
              <Chip
                label={`${consistency.missed} missed`}
                tone={consistency.missed > 0 ? "gold" : "neutral"}
              />
              <Chip label={`${consistency.upcoming} upcoming`} tone="neutral" />
              {consistency.omitted > 0 && (
                <Chip label={`${consistency.omitted} skipped`} tone="neutral" />
              )}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] font-inter text-[#8C8C90]">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {consistency.performanceNote}
            </p>
          </>
        )}
      </Card>

      {/* Weekly muscle coverage */}
      <Card
        title="Muscle coverage"
        subtitle="Direct and supporting work from completed sets, last 7 days"
      >
        {coverage.length === 0 ? (
          <SVJEmptyState
            icon={Dumbbell}
            compact
            title="No logged training yet"
            description="Coverage is built from the sets you actually complete in a structured session. Log one and each muscle group fills in with its real direct and supporting work."
          />
        ) : (
          <>
            <MuscleBodyMap
              entries={coverage.map((entry) => ({
                muscle: entry.muscle,
                label: entry.label,
                state: coverageState(entry.status, entry.lastTrainedDate),
              }))}
              className="mb-4"
            />
            <ul className="space-y-2" data-testid="muscle-coverage">
              {coverage.map((entry) => (
                <li key={entry.muscle} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs font-inter text-[#F4F2ED]">
                    {entry.status === "trained" ? (
                      <Check className="h-3.5 w-3.5 text-[#C81E3A]" aria-hidden />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-md border border-white/15" aria-hidden />
                    )}
                    {entry.label}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[10px] text-[#8C8C90]">
                    <span>{recency(entry.lastTrainedDate)}</span>
                    <span className="text-[#F4F2ED]">{entry.directSets} direct</span>
                    <span>{entry.supportingSets} supporting</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Exercise progress */}
      <Card title="Exercise progress" subtitle="Real completed working sets — never a target">
        {options.length === 0 ? (
          <Empty>
            No completed exercises yet. Log a structured workout and your trends appear here.
          </Empty>
        ) : (
          <>
            <label className="block text-[11px] font-inter text-[#8C8C90]">
              Exercise
              <select
                value={selectedExerciseId ?? ""}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                aria-label="Choose an exercise to review"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0B0C] px-2 py-2 text-xs font-inter text-white focus:outline-none focus:border-[#C81E3A]/60"
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            {historyLoading && (
              <p className="mt-3 flex items-center gap-2 text-[11px] font-mono text-[#8C8C90]">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading history…
              </p>
            )}

            {!historyLoading && progress && progress.sessionCount === 0 && (
              <p className="mt-3 text-[11px] font-inter text-[#8C8C90]">
                No completed working sets for this movement yet.
              </p>
            )}

            {!historyLoading && progress && progress.sessionCount > 0 && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat label="Sessions" value={String(progress.sessionCount)} />
                  <Stat label="Working sets" value={String(progress.workingSetCount)} />
                  <Stat
                    label={progress.trendBasis === "duration" ? "Best hold" : "Best weight"}
                    value={
                      progress.trendBasis === "duration"
                        ? `${progress.bestHoldSeconds ?? 0} sec`
                        : progress.bestWeightKg !== null
                          ? `${progress.bestWeightKg} kg`
                          : "Bodyweight"
                    }
                  />
                  <Stat
                    label="Total volume"
                    value={progress.totalVolumeKg > 0 ? formatVolume(progress.totalVolumeKg) : "—"}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-[#8C8C90]">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" />
                    {TREND_LABELS[progress.trend]}
                  </span>
                  {progress.warmupSetCount > 0 && (
                    <span>{progress.warmupSetCount} warm-up sets excluded</span>
                  )}
                </div>
                {progress.loadConvention && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-[#8C8C90]">
                    <span>Load convention: {progress.loadConvention.replace(/_/g, " ")}</span>
                    <span
                      className={
                        progress.conventionConsistent ? "text-[#8C8C90]" : "text-[#EAB308]"
                      }
                    >
                      {progress.conventionConsistent
                        ? "Comparable across these sessions"
                        : "Different setups — not directly comparable"}
                    </span>
                  </div>
                )}

                {/* Real per-session chart. Bars are completed work only. */}
                <div
                  role="img"
                  aria-label={`${progress.exerciseName} by session, oldest to newest: ${progress.points
                    .map(
                      (p) =>
                        `${p.localDate} ${pointValue(p)}${
                          progress.trendBasis === "weight"
                            ? " kg"
                            : progress.trendBasis === "duration"
                              ? " seconds"
                              : " reps"
                        }`,
                    )
                    .join(", ")}`}
                  className="mt-3 flex items-end gap-1.5"
                  style={{ height: 96 }}
                >
                  {progress.points.slice(-12).map((point) => (
                    <div
                      key={point.activityId}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    >
                      <span className="font-mono text-[9px] text-[#8C8C90]">
                        {pointValue(point)}
                      </span>
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-[#8E1226] to-[#C81E3A]"
                        style={{ height: `${Math.max(6, (pointValue(point) / maxPoint) * 64)}px` }}
                      />
                      <span className="w-full truncate text-center font-mono text-[8px] text-[#8C8C90]">
                        {point.localDate.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
                {progress.points.length > 12 && (
                  <p className="mt-1 text-[9px] font-mono text-[#8C8C90]">
                    Showing the most recent 12 of {progress.points.length} sessions.
                  </p>
                )}

                {nextTarget && (
                  <div
                    className="svj-radius-row mt-3 border border-[#C9A227]/25 bg-[#C9A227]/[0.06] px-3 py-2.5"
                    data-testid="next-target"
                  >
                    <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C9A227]">
                      Next target
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#E8D9A0]">
                      {nextTarget.session.scheduledDate}
                      <span className="ml-2 text-[#F4F2ED]">
                        {nextTarget.target.durationSeconds !== null
                          ? `${nextTarget.target.workSets} × ${nextTarget.target.durationSeconds} sec`
                          : `${nextTarget.target.workSets} × ${nextTarget.target.repMin}–${nextTarget.target.repMax}${
                              nextTarget.target.loadKg ? ` @ ${nextTarget.target.loadKg} kg` : ""
                            }`}
                      </span>
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Card>

      {/* Recommendation history */}
      <Card
        title="Recommendation history"
        subtitle="Why each target changed — from your real sessions"
      >
        {decisions.length === 0 ? (
          <Empty>
            No progression decisions yet. They are recorded as you complete comparable sessions.
          </Empty>
        ) : (
          <motion.ul
            variants={svjStaggerContainer}
            initial="hidden"
            animate="show"
            className="space-y-3"
            data-testid="decision-history"
          >
            {decisions.slice(0, 12).map((decision, index) => (
              <motion.li
                key={`${decision.exerciseSlug}-${decision.createdAt}-${index}`}
                variants={svjStaggerItem}
                className="border-l-2 border-white/10 pl-3"
              >
                <p className="text-xs font-inter text-[#F4F2ED]">
                  {decisionHeadline(decision, humanizeSlug(decision.exerciseSlug))}
                </p>
                <p
                  className={`mt-0.5 text-[10px] font-mono uppercase tracking-wider ${ACTION_TONE[decision.action] ?? "text-[#8C8C90]"}`}
                >
                  {decision.action.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-[11px] font-inter text-[#8C8C90]">
                  {decisionReason(decision)}
                </p>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Card>

      {/* Body-weight trend — only real logged series, never estimated */}
      <Card title="Body-weight trend" subtitle="Only shown from weight entries you logged">
        <Empty>
          No body-weight series has been logged yet, so no trend is shown. SVJ never estimates body
          change from workout volume.
        </Empty>
      </Card>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-white/5 bg-black/30 p-2.5">
    <div className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">{label}</div>
    <div className="font-mono text-lg font-bold text-white">{value}</div>
  </div>
);

const Chip: React.FC<{ label: string; tone: "crimson" | "gold" | "neutral" }> = ({
  label,
  tone,
}) => (
  <span
    className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${
      tone === "crimson"
        ? "bg-[#C81E3A]/15 text-[#F4F2ED]"
        : tone === "gold"
          ? "bg-[#D4AF37]/15 text-[#D4AF37]"
          : "bg-white/5 text-[#8C8C90]"
    }`}
  >
    {label}
  </span>
);
