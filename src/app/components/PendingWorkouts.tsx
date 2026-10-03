import { useWorkoutRecorder } from "../hooks/useWorkoutRecorder";
import { useWorkoutQueue } from "../hooks/useWorkoutQueue";
import { useOnlineStatus } from "../lib/useOnlineStatus";

export function PendingWorkouts() {
  const gps = useWorkoutRecorder();
  const strength = useWorkoutQueue();
  const online = useOnlineStatus();
  const count = gps.pendingSync + strength.pendingCount;
  if (online && !count && !strength.lastError) return null;
  return (
    <div className="mb-3 min-w-0 rounded-2xl border border-white/10 p-3 text-sm" role="status">
      {!online && <p>Offline — your recording continues on this device.</p>}
      {count > 0 && (
        <p>
          {count} {count === 1 ? "workout" : "workouts"} waiting to sync
        </p>
      )}
      {strength.lastError && <p className="text-rose-200">{strength.lastError}</p>}
      {count > 0 && online && (
        <button
          className="mt-2 rounded-lg border border-white/20 px-3 py-2"
          onClick={() => {
            void gps.syncPending();
            void strength.sync();
          }}
        >
          Retry sync
        </button>
      )}
    </div>
  );
}
