// SVJ Recovery V2 — provider component for the shared TrainRecovery channel.
// Model/context live in ../lib/readinessShared (react-refresh convention).
import { useMemo, useState, type ReactNode } from "react";
import { ReadinessHistoryContext, type TrainRecoveryShared } from "../lib/readinessShared";

export const ReadinessHistoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [shared, setShared] = useState<TrainRecoveryShared | null>(null);
  const value = useMemo(
    () => ({
      today: shared?.today,
      dayHistory: shared?.dayHistory,
      historyPoints: shared?.historyPoints,
      publish: setShared,
    }),
    [shared],
  );
  return (
    <ReadinessHistoryContext.Provider value={value}>{children}</ReadinessHistoryContext.Provider>
  );
};
