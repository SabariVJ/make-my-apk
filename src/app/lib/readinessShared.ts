// ============================================================================
// SVJ Recovery V2 — shared TrainRecovery publication channel (model only).
//
// The founder's Overview renders the existing TrainRecovery panel AND the
// Phase-3 widgets. Rather than recomputing readiness a second time (and
// risking a second, disagreeing number), TrainRecovery publishes its already
// computed combined readiness/day-history/server-history and the widgets read
// exactly that.
//
// Kept out of the component file per the project's react-refresh convention
// (mirroring ../lib/utilityNav and ../lib/recoveryNav).
// ============================================================================
import { createContext, useContext } from "react";
import type { ReadinessResult, RecoveryDayRecord } from "./recoveryInsights";
import type { RecoveryHistoryPoint } from "./recovery";

export interface TrainRecoveryShared {
  /** The single combined readiness reading the panel renders. */
  today: ReadinessResult;
  /** Day-keyed records the panel maintains (server + local merge). */
  dayHistory: RecoveryDayRecord[];
  /** Raw server history points the panel fetched. */
  historyPoints: RecoveryHistoryPoint[];
}

export interface SharedState extends Partial<TrainRecoveryShared> {
  publish?: (value: TrainRecoveryShared) => void;
}

export const ReadinessHistoryContext = createContext<SharedState | null>(null);

/** Consumer side for the widgets; null outside the provider. */
export function useTrainRecoveryShared(): SharedState | null {
  return useContext(ReadinessHistoryContext);
}

/** Inside TrainRecovery: the publish channel when one exists, else null. */
export function useTrainRecoveryPublisher(): ((value: TrainRecoveryShared) => void) | null {
  const context = useContext(ReadinessHistoryContext);
  return context?.publish ?? null;
}
