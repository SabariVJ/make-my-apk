import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, History, Loader2, RefreshCw, Trophy } from "lucide-react";
import { strengthRpcClient } from "../lib/strengthClient";
import { SVJEmptyState } from "./ui-primitives/SVJEmptyState";
import {
  MUSCLE_LABELS,
  STRENGTH_RECORD_LABELS,
  formatRecordValue,
  formatSessionDate,
  formatSetLabel,
  formatVolume,
  getExerciseHistory,
  type ExerciseHistory,
  type MuscleTrained,
  type StrengthExerciseDetail,
} from "../lib/strength";

const LEVEL_STYLES: Record<MuscleTrained["level"], string> = {
  high: "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-[#F4F2ED]",
  medium: "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]",
  low: "border-white/10 bg-[#08080A] text-[#8C8C90]",
};

const LEVEL_LABELS: Record<MuscleTrained["level"], string> = {
  high: "High",
  medium: "Moderate",
  low: "Light",
};

/** Deterministic training summary — relative contribution, never EMG data. */
export const MuscleTrainedList: React.FC<{ muscles: MuscleTrained[] }> = ({ muscles }) => {
  if (muscles.length === 0) return null;
  return (
    <div data-testid="muscles-trained">
      <div className="mb-1.5 font-inter text-[11px] font-semibold text-[#8C8C90]">
        Muscles trained
      </div>
      <div className="flex flex-wrap gap-1.5">
        {muscles.map((muscle) => (
          <span
            key={muscle.muscle}
            className={`svj-radius-row border px-2 py-1 font-inter text-[11px] font-medium ${LEVEL_STYLES[muscle.level]}`}
          >
            {MUSCLE_LABELS[muscle.muscle]}
            <span className="ml-1.5 text-[10px] opacity-80">{LEVEL_LABELS[muscle.level]}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/** Exercise blocks with their recorded sets. */
export const StrengthSetsList: React.FC<{
  exercises: StrengthExerciseDetail[];
  onSelectExercise?: (exerciseId: string, exerciseName: string) => void;
}> = ({ exercises, onSelectExercise }) => (
  <div className="space-y-3" data-testid="strength-sets">
    {exercises.map((exercise) => {
      const volume = exercise.sets.reduce(
        (total, set) =>
          total + (set.weightKg !== null && set.reps !== null ? set.weightKg * set.reps : 0),
        0,
      );
      return (
        <div
          key={`${exercise.exerciseId}-${exercise.position}`}
          className="svj-radius-card svj-lit-top border border-white/[0.06] bg-[#17171A] p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              disabled={!onSelectExercise}
              onClick={() => onSelectExercise?.(exercise.exerciseId, exercise.name)}
              className="text-left font-inter text-sm font-semibold text-[#F4F2ED] disabled:cursor-default"
            >
              {exercise.name}
            </button>
            <span className="font-inter text-[11px] text-[#8C8C90]">
              {MUSCLE_LABELS[exercise.primaryMuscle]}
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {exercise.sets.map((set) => (
              <li
                key={set.setNumber}
                className="flex items-center justify-between font-inter text-[12px]"
              >
                <span className="text-[#8C8C90]">Set {set.setNumber}</span>
                <span className="font-mono text-[#F4F2ED]">{formatSetLabel(set)}</span>
              </li>
            ))}
          </ul>
          {volume > 0 && (
            <p className="mt-1.5 font-inter text-[11px] text-[#8C8C90]">
              Volume <span className="font-mono text-[#F4F2ED]">{formatVolume(volume)}</span>
            </p>
          )}
          {exercise.notes && (
            <p className="mt-1.5 font-inter text-[11px] text-[#F4F2ED]">{exercise.notes}</p>
          )}
        </div>
      );
    })}
  </div>
);

/**
 * Per-exercise history for the signed-in user, newest first. Server-backed, so
 * it survives refresh and logout/login; an exercise with no sessions shows an
 * honest empty state instead of fabricated values.
 */
export const ExerciseHistoryPanel: React.FC<{
  exerciseId: string;
  exerciseName: string;
  onClose: () => void;
}> = ({ exerciseId, exerciseName, onClose }) => {
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = strengthRpcClient();
    if (!client) {
      setError("Backend is not configured.");
      setLoading(false);
      return;
    }
    const result = await getExerciseHistory((fn, args) => client.rpc(fn, args), exerciseId, 20);
    if (result.ok && result.history) setHistory(result.history);
    else setError(result.error ?? "Couldn't load exercise history.");
    setLoading(false);
  }, [exerciseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="svj-radius-card svj-lit-top border border-white/[0.06] bg-[#17171A] p-3"
      data-testid="exercise-history"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 font-inter text-[11px] font-medium text-[#8C8C90] transition-colors hover:text-[#F4F2ED]"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh exercise history"
          className="svj-radius-row border border-white/10 bg-[#08080A] p-1.5 text-[#8C8C90] transition-colors hover:text-[#F4F2ED]"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-[#E62846]" />
        <span className="font-inter text-sm font-semibold text-[#F4F2ED]">
          {history?.exercise.name ?? exerciseName}
        </span>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-5 font-inter text-[11px] text-[#8C8C90]">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading history…
        </p>
      )}

      {!loading && error && (
        <SVJEmptyState
          compact
          variant="error"
          title="History unavailable"
          description={error}
          action={
            <button
              type="button"
              onClick={() => void load()}
              className="svj-radius-row border border-[#C81E3A]/40 bg-[#C81E3A]/10 px-3 py-1.5 font-inter text-[11px] font-semibold text-[#E62846]"
            >
              Retry
            </button>
          }
        />
      )}

      {!loading && !error && history && history.sessions.length === 0 && (
        <SVJEmptyState
          compact
          title="No sessions yet"
          description={`Complete your first ${history.exercise.name} workout to start tracking progress.`}
        />
      )}

      {!loading && !error && history && history.sessions.length > 0 && (
        <>
          {history.records.length > 0 && (
            <div className="mt-2 svj-radius-row border border-[#C9A227]/25 bg-[#C9A227]/5 p-2.5">
              <div className="flex items-center gap-1.5 font-inter text-[11px] font-semibold text-[#C9A227]">
                <Trophy className="h-3 w-3" /> Personal bests
              </div>
              <ul className="mt-1.5 space-y-1">
                {history.records.map((record) => (
                  <li
                    key={record.recordType}
                    className="flex items-center justify-between font-inter text-[11px]"
                  >
                    <span className="text-[#8C8C90]">
                      {STRENGTH_RECORD_LABELS[record.recordType]}
                    </span>
                    <span className="font-mono text-[#F4F2ED]">
                      {formatRecordValue(record.recordType, record.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 space-y-2" data-testid="exercise-history-sessions">
            <div className="font-inter text-[11px] font-semibold text-[#8C8C90]">
              Recent workouts
            </div>
            {history.sessions.map((session) => (
              <div
                key={session.activityId}
                className="svj-radius-row border border-white/[0.06] bg-[#08080A] p-2.5"
              >
                <div className="flex items-center justify-between font-inter text-[11px]">
                  <span className="font-medium text-[#F4F2ED]">
                    {formatSessionDate(session.performedAt)}
                  </span>
                  <span className="text-[#8C8C90]">
                    {session.setCount} {session.setCount === 1 ? "set" : "sets"}
                    {session.volumeKg > 0 ? ` · ${formatVolume(session.volumeKg)}` : ""}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {session.sets.map((set) => (
                    <li
                      key={set.setNumber}
                      className="flex items-center justify-between font-inter text-[12px]"
                    >
                      <span className="text-[#8C8C90]">{set.setNumber}</span>
                      <span className="font-mono text-[#F4F2ED]">{formatSetLabel(set)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
