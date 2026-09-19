import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  GpsWorkoutRecorder,
  createLocalStorageAdapter,
  flushOfflineQueue,
  readQueue,
  type SessionStorage,
  type SyncOutcome,
  type WorkoutSession,
} from "../lib/gpsRecorder";
import {
  canTransition,
  type GpsActivityType,
  type WorkoutSummary,
  MIN_GPS_POINTS_TO_SAVE,
} from "../lib/gpsActivity";
import { createDefaultLocationAdapter, isNativeRecordingAvailable } from "../lib/locationAdapters";
import {
  canRecordWith,
  reconcileNativeWorkout,
  requestWorkoutPermissions,
  setNativeWorkoutPaused,
  startNativeWorkout,
  stopNativeWorkout,
} from "../lib/nativeWorkout";
import {
  activityRpcClient,
  saveGpsWorkout,
  startLiveShare,
  stopLiveShare,
  updateLiveShare,
  type LiveShare,
} from "../lib/activityPlatform";

export interface UseWorkoutRecorder {
  session: WorkoutSession | null;
  summary: WorkoutSummary | null;
  points: WorkoutSession["points"];
  pendingSync: number;
  busy: boolean;
  error: string | null;
  notice: string | null;
  lastSavedId: string | null;
  liveShare: LiveShare | null;
  liveShareBusy: boolean;
  nativeRecording: boolean;
  canSave: boolean;
  start: (activityType: GpsActivityType, splitUnit?: "km" | "mi") => Promise<void>;
  pause: () => void;
  resume: () => void;
  finish: () => Promise<void>;
  discard: () => Promise<void>;
  save: () => Promise<void>;
  syncPending: () => Promise<void>;
  shareLive: () => Promise<void>;
  stopSharing: () => Promise<void>;
  dismissError: () => void;
  dismissNotice: () => void;
}

export function useWorkoutRecorder(): UseWorkoutRecorder {
  const recorder = useMemo(
    () =>
      new GpsWorkoutRecorder({
        devicePlatform: Capacitor.isNativePlatform() ? "android" : "web",
        autoPauseEnabled: true,
      }),
    [],
  );

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [liveShare, setLiveShare] = useState<LiveShare | null>(null);
  const [liveShareBusy, setLiveShareBusy] = useState(false);
  const [nativeRecording] = useState(() => isNativeRecordingAvailable());
  const lastSharePushRef = useRef(0);
  const sharingRef = useRef<string | null>(null);

  // ── Wire the recorder ───────────────────────────────────────────────────
  useEffect(() => {
    recorder.setLocationAdapter(createDefaultLocationAdapter());
    const unsubscribe = recorder.subscribe((next) => {
      setSession(next);
      setSummary(next ? recorder.summary() : null);
    });

    // A workout the OS killed comes back PAUSED and unsaved, never silently
    // resumed: collecting location requires an explicit user action.
    const recovered = recorder.recover();
    if (recovered) {
      setSession(recovered);
      setSummary(recorder.summary());
      setNotice("Recovered an unfinished workout. It is paused — tap Resume to continue.");
    }
    setPendingSync(readQueue(recorderStorage()).length);

    // Process/WebView recreation can leave the Android foreground service
    // running against a local session that was restored — or, worse, one that
    // is gone. Reconcile the two before the user can record anything, and
    // never silently continue into a second activity.
    if (isNativeRecordingAvailable()) {
      void (async () => {
        const reconciliation = await reconcileNativeWorkout(recovered?.activityId ?? null);
        if (!reconciliation) return;
        if (reconciliation.matchesLocal) {
          // The native service may still be actively collecting. Recovery must
          // present a genuinely PAUSED workout: pause the native recording
          // first (same UUID, same points), and only then show the notice.
          await setNativeWorkoutPaused(true);
          setNotice("Recovered the active workout. It is paused — tap Resume to continue.");
          return;
        }
        if (reconciliation.orphaned) {
          await stopNativeWorkout();
          setError(
            "A recording from a previous session couldn't be matched to a saved workout, so it was stopped to avoid creating a duplicate activity.",
          );
        }
      })();
    }

    return () => {
      unsubscribe();
    };
  }, [recorder]);

  // ── Offline queue flush ─────────────────────────────────────────────────
  const syncPending = useCallback(async () => {
    const client = activityRpcClient();
    if (!client) return;
    await flushOfflineQueue(recorderStorage(), async (queued): Promise<SyncOutcome> => {
      const result = await saveGpsWorkout(client, queued);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, duplicate: result.duplicate };
    });
    setPendingSync(readQueue(recorderStorage()).length);
  }, []);

  useEffect(() => {
    void syncPending();
    const onOnline = () => void syncPending();
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => void syncPending(), 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, [syncPending]);

  // ── Live share position push (throttled, best effort) ────────────────────
  useEffect(() => {
    const token = sharingRef.current;
    if (!token || !session || session.state !== "recording") return;
    const last = session.points[session.points.length - 1];
    if (!last) return;
    if (Date.now() - lastSharePushRef.current < 15_000) return;
    lastSharePushRef.current = Date.now();
    const client = activityRpcClient();
    if (!client) return;
    void updateLiveShare(client, token, {
      lat: last.lat,
      lng: last.lng,
      elapsedSeconds: session.durationSeconds,
      distanceMeters: summary?.distanceMeters,
      accuracyMeters: last.accuracy ?? undefined,
    });
  }, [session, summary]);

  const start = useCallback(
    async (activityType: GpsActivityType, splitUnit: "km" | "mi" = "km") => {
      setBusy(true);
      setError(null);
      setNotice(null);
      setLastSavedId(null);
      try {
        if (isNativeRecordingAvailable()) {
          const permissions = await requestWorkoutPermissions();
          if (!canRecordWith(permissions)) {
            throw new Error(
              "Precise or approximate location permission is required. Open Android Settings → Apps → SVJ → Permissions → Location, then allow it while using the app.",
            );
          }
        }
        await recorder.start(activityType, { splitUnit });
        if (isNativeRecordingAvailable()) {
          // One stable activity id ties the native service and the JS session
          // to the same workout, so nothing is double-counted.
          const result = await startNativeWorkout({
            activityId: recorder.current?.activityId ?? "",
            activityType,
          });
          if (!result.ok && result.error) setError(result.error);
        }
        setSession(recorder.current);
        setSummary(recorder.summary());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not start recording.");
      } finally {
        setBusy(false);
      }
    },
    [recorder],
  );

  const pause = useCallback(() => {
    recorder.pause();
    void setNativeWorkoutPaused(true);
  }, [recorder]);

  const resume = useCallback(() => {
    recorder.resume();
    void setNativeWorkoutPaused(false);
  }, [recorder]);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      await recorder.finish();
      setSession(recorder.current ? { ...recorder.current } : null);
      setSummary(recorder.summary());
    } finally {
      setBusy(false);
    }
  }, [recorder]);

  const discard = useCallback(async () => {
    setBusy(true);
    try {
      sharingRef.current = null;
      setLiveShare(null);
      await recorder.discard();
      await stopNativeWorkout();
      setSession(null);
      setSummary(null);
      setNotice("Workout discarded. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }, [recorder]);

  const save = useCallback(async () => {
    const current = recorder.current;
    if (!current) return;
    const client = activityRpcClient();
    if (!client) {
      setError("Sign in to save this workout.");
      return;
    }
    setBusy(true);
    setError(null);
    // Queue first: if the network dies mid-request the workout is still safe.
    recorder.enqueueForSync();
    setPendingSync(readQueue(recorderStorage()).length);
    try {
      const result = await saveGpsWorkout(client, current);
      if (!result.ok) {
        recorder.markSyncFailure(result.error ?? "Couldn't save this workout.");
        setError(result.error ?? "Couldn't save this workout.");
        return;
      }
      recorder.markSaved();
      setLastSavedId(result.activityId ?? null);
      setSession(recorder.current);
      if (sharingRef.current) {
        sharingRef.current = null;
        setLiveShare(null);
      }
      setNotice(
        result.duplicate
          ? "This workout was already saved."
          : "Workout saved to your SVJ activity history.",
      );
      await syncPending();
    } finally {
      setBusy(false);
    }
  }, [recorder, syncPending]);

  const shareLive = useCallback(async () => {
    const current = recorder.current;
    const client = activityRpcClient();
    if (!current || !client) {
      setError("Sign in to use SVJ Live Share.");
      return;
    }
    // Live sharing needs a saved activity row to attach the share to.
    setLiveShareBusy(true);
    setError(null);
    try {
      if (!current.endedAtMs) await recorder.finish();
      const pending = recorder.current;
      if (!pending || pending.points.length < MIN_GPS_POINTS_TO_SAVE) {
        setError("Record a little more before sharing live.");
        return;
      }
      recorder.enqueueForSync();
      const saved = await saveGpsWorkout(client, pending);
      if (!saved.ok || !saved.activityId) {
        setError(saved.error ?? "Couldn't prepare live sharing.");
        return;
      }
      recorder.markSaved();
      const started = await startLiveShare(client, saved.activityId, { ttlMinutes: 180 });
      if (!started.ok || !started.share?.token) {
        setError(started.error ?? "Couldn't start live sharing.");
        return;
      }
      sharingRef.current = started.share.token;
      lastSharePushRef.current = 0;
      setLiveShare(started.share);
      setSession(recorder.current);
      setNotice("SVJ Live Share is on. The link stops working when you stop sharing.");
    } finally {
      setLiveShareBusy(false);
    }
  }, [recorder]);

  const stopSharing = useCallback(async () => {
    const client = activityRpcClient();
    setLiveShareBusy(true);
    try {
      if (client) await stopLiveShare(client, sharingRef.current ?? undefined);
      sharingRef.current = null;
      setLiveShare(null);
      setNotice("Live sharing stopped.");
    } finally {
      setLiveShareBusy(false);
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const canSave =
    session != null &&
    session.points.length >= MIN_GPS_POINTS_TO_SAVE &&
    canTransition(session.state, "stopping");

  return {
    session,
    summary,
    points: session?.points ?? [],
    pendingSync,
    busy,
    error,
    notice,
    lastSavedId,
    liveShare,
    liveShareBusy,
    nativeRecording,
    canSave,
    start,
    pause,
    resume,
    finish,
    discard,
    save,
    syncPending,
    shareLive,
    stopSharing,
    dismissError,
    dismissNotice,
  };
}

// The recorder and this hook must agree on where offline workouts live: both
// resolve the same localStorage keys through this one cached adapter.
let cachedStorage: SessionStorage | null = null;

function recorderStorage(): SessionStorage {
  if (!cachedStorage) cachedStorage = createLocalStorageAdapter();
  return cachedStorage;
}
