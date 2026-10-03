import {
  GpsWorkoutRecorder,
  createMemoryStorage,
  readQueue,
  writeQueue,
  type SessionStorage,
} from "./gpsRecorder";
import { GPS_ACTIVITY_TYPES, MIN_GPS_POINTS_TO_SAVE } from "./gpsActivity";
import { validateJournalEvent, type WorkoutPlugin } from "./nativeWorkout";

/** Rebuild completed native recordings if WebView storage was lost; UUID stays stable. */
export async function recoverCompletedNativeRecordings(
  plugin: WorkoutPlugin,
  ownerId: string,
  storage: SessionStorage,
): Promise<number> {
  if (!plugin.listRecordings || !plugin.readJournal) return 0;
  const { recordings } = await plugin.listRecordings({ ownerId });
  let recovered = 0;
  for (const recording of recordings) {
    if (
      !recording.ended ||
      recording.ownerId !== ownerId ||
      !GPS_ACTIVITY_TYPES.includes(recording.activityType as (typeof GPS_ACTIVITY_TYPES)[number]) ||
      !Number.isFinite(recording.startedAtMs)
    )
      continue;
    const recorder = new GpsWorkoutRecorder({
      ownerId,
      storage: createMemoryStorage(),
      autoPauseEnabled: false,
    });
    recorder.adoptNative({ ...recording, active: false, paused: true });
    while (true) {
      const { events } = await plugin.readJournal({
        ownerId,
        activityId: recording.activityId,
        afterSequence: recorder.current?.nativeSequence ?? 0,
        limit: 250,
      });
      for (const event of events)
        recorder.replayNativeEvent(validateJournalEvent(event, ownerId, recording.activityId));
      if (events.length < 250) break;
    }
    const session = recorder.current;
    if (!session?.endedAtMs || session.points.length < MIN_GPS_POINTS_TO_SAVE) continue;
    const queue = readQueue(storage);
    if (!queue.some((entry) => entry.clientSessionId === session.clientSessionId)) {
      writeQueue(storage, [...queue, session]);
      recovered++;
    }
  }
  return recovered;
}
