import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, History, Loader2, RefreshCw, Trophy } from "lucide-react";
import { strengthRpcClient } from "../lib/strengthClient";
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
  medium: "border-gold/30 bg-gold/10 text-gold",
  low: "border-white/10 bg-black/40 text-[#8C8C90]",
};

/** Deterministic training summary — relative contribution, never EMG data. */
export const MuscleTrainedList: React.FC<{ muscles: MuscleTrained[] }> = ({ muscles }) => {
  if (muscles.length === 0) return null;
  return (
    <div data-testid="muscles-trained">
      <div className="mb-1.5 text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
        Muscles Trained
      </div>
      <div className="flex flex-wrap gap-1.5">
        {muscles.map((muscle) => (
          <span
            key={muscle.muscle}
            className={`rounded-lg border px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${LEVEL_STYLES[muscle.level]}`}
          >
            {MUSCLE_LABELS[muscle.muscle]}
            <span className="ml-1.5 text-[9px] opacity-80">{muscle.level}</span>
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
          className="rounded-2xl border border-white/5 bg-black/40 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              disabled={!onSelectExercise}
              onClick={() => onSelectExercise?.(exercise.exerciseId, exercise.name)}
              className="text-left text-xs font-mono font-bold uppercase tracking-wider text-white disabled:cursor-default"
            >
              {exercise.name}
            </button>
            <span className="text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">
              {MUSCLE_LABELS[exercise.primaryMuscle]}
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {exercise.sets.map((set) => (
              <li
                key={set.setNumber}
                className="flex items-center justify-between text-[11px] font-mono"
              >
                <span className="text-[#8C8C90]">SET {set.setNumber}</span>
                <span className="text-white">{formatSetLabel(set)}</span>
              </li>
            ))}
          </ul>
          {volume > 0 && (
            <p className="mt-1.5 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]">
              Volume {formatVolume(volume)}
            </p>
          )}
          {exercise.notes && (
            <p className="mt-1.5 text-[10px] font-mono text-[#F4F2ED]">{exercise.notes}</p>
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
      className="rounded-2xl border border-white/10 bg-black/40 p-3"
      data-testid="exercise-history"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh exercise history"
          className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-[#E62846]" />
        <span className="font-anton text-sm uppercase tracking-wider text-white">
          {history?.exercise.name ?? exerciseName}
        </span>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-5 text-[10px] font-mono uppercase text-[#8C8C90]">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading history…
        </p>
      )}

      {!loading && error && (
        <div className="mt-3 rounded-lg border border-crimson/30 bg-crimson/5 p-2.5 text-center">
          <p className="text-[10px] font-mono text-crimson">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 rounded-lg border border-crimson/40 bg-crimson/10 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-crimson"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && history && history.sessions.length === 0 && (
        <div className="py-5 text-center">
          <p className="font-anton text-xs uppercase tracking-wider text-white">NO SESSIONS YET</p>
          <p className="mt-1 text-[10px] font-mono text-[#8C8C90]">
            Complete your first {history.exercise.name} workout to start tracking progress.
          </p>
        </div>
      )}

      {!loading && !error && history && history.sessions.length > 0 && (
        <>
          {history.records.length > 0 && (
            <div className="mt-2 rounded-lg border border-gold/25 bg-gold/5 p-2">
              <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-gold">
                <Trophy className="h-3 w-3" /> Personal Bests
              </div>
              <ul className="mt-1 space-y-0.5">
                {history.records.map((record) => (
                  <li
                    key={record.recordType}
                    className="flex items-center justify-between text-[10px] font-mono"
                  >
                    <span className="text-[#8C8C90]">
                      {STRENGTH_RECORD_LABELS[record.recordType]}
                    </span>
                    <span className="text-white">
                      {formatRecordValue(record.recordType, record.value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 space-y-2" data-testid="exercise-history-sessions">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]">
              Recent Workouts
            </div>
            {history.sessions.map((session) => (
              <div
                key={session.activityId}
                className="rounded-lg border border-white/5 bg-[#0B0B0C] p-2.5"
              >
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider">
                  <span className="text-white">{formatSessionDate(session.performedAt)}</span>
                  <span className="text-[#8C8C90]">
                    {session.setCount} {session.setCount === 1 ? "set" : "sets"}
                    {session.volumeKg > 0 ? ` · ${formatVolume(session.volumeKg)}` : ""}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {session.sets.map((set) => (
                    <li
                      key={set.setNumber}
                      className="flex items-center justify-between text-[11px] font-mono"
                    >
                      <span className="text-[#8C8C90]">{set.setNumber}</span>
                      <span className="text-white">{formatSetLabel(set)}</span>
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
