import {
  createContext,
  createElement,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { withAccountRpcClient } from "../lib/accountSync";
import { recoverCompletedNativeRecordings } from "../lib/nativeRecordingRecovery";
import { Capacitor } from "@capacitor/core";
import {
  GpsWorkoutRecorder,
  createAccountStorage,
  flushOfflineQueue,
  readQueue,
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
import { isNativeWearableAvailable, normalizeWearableHeartRate, VjWearable } from "../lib/wearable";
import {
  chooseHeartRateSource,
  preferredSourceForArbitration,
  subscribeHeartRateSourcePreference,
  wearMeasurementToHeartRate,
  type HeartRateCandidate,
} from "../lib/wearOs";
import {
  onWearHeartRateSample,
  onWearWorkoutSummary,
  startWearCompanion,
} from "../lib/wearCompanion";
import {
  canRecordWith,
  getNativeWorkoutState,
  createJournalLocationAdapter,
  workoutPlugin,
  requestWorkoutPermissions,
  setNativeWorkoutPaused,
  startNativeWorkout,
  stopNativeWorkout,
} from "../lib/nativeWorkout";
import {
  activityRpcClient,
  saveGpsWorkout,
  startRecordingLiveShare,
  stopLiveShare,
  fetchMyLiveShare,
  updateLiveShare,
  type LiveShare,
} from "../lib/activityPlatform";

export interface LiveHeartRateDisplay {
  bpm: number;
  source: string;
  deviceName?: string;
  /** "live" while the selected source is healthy, "reconnecting" when degraded. */
  status: "live" | "reconnecting";
}

export interface UseWorkoutRecorder {
  /** Live heart rate (null when absent/stale) — displayed on the HR card. */
  liveHeartRate: LiveHeartRateDisplay | null;
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

const RecorderContext = createContext<UseWorkoutRecorder | null>(null);
export function WorkoutRecorderProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const value = useWorkoutRecorderController(userId);
  return createElement(RecorderContext.Provider, { value }, children);
}
export function useWorkoutRecorder(): UseWorkoutRecorder {
  const value = useContext(RecorderContext);
  if (!value) throw new Error("Workout recording is unavailable. Please reopen SVJ.");
  return value;
}
function useWorkoutRecorderController(userId: string | null): UseWorkoutRecorder {
  const owner = useRef(userId);
  owner.current = userId;
  const storage = useMemo(() => createAccountStorage(userId), [userId]);
  const [liveHeartRate, setLiveHeartRate] = useState<LiveHeartRateDisplay | null>(null);
  const recorder = useMemo(
    () =>
      new GpsWorkoutRecorder({
        devicePlatform: Capacitor.getPlatform(),
        ownerId: userId ?? undefined,
        storage,
        autoPauseEnabled: true,
      }),
    [storage, userId],
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
    const plugin = workoutPlugin();
    recorder.setLocationAdapter(
      plugin && userId
        ? createJournalLocationAdapter(plugin, userId, recorder)
        : createDefaultLocationAdapter(),
    );
    const unsubscribe = recorder.subscribe((next) => {
      setSession(next);
      setSummary(next ? recorder.summary() : null);
    });

    // A workout the OS killed comes back PAUSED and unsaved, never silently
    // resumed: collecting location requires an explicit user action.
    let recovered: WorkoutSession | null = null;
    try {
      recovered = recorder.recover();
      setPendingSync(readQueue(storage).length);
    } catch {
      setError("Could not read saved workouts. Check device storage and reopen SVJ.");
    }
    if (recovered) {
      setSession(recovered);
      setSummary(recorder.summary());
      setNotice("Recovered an unfinished workout. It is paused — tap Resume to continue.");
    }

    let alive = true;
    if (isNativeRecordingAvailable() && userId) {
      void (async () => {
        const nativePlugin = workoutPlugin();
        if (nativePlugin) {
          await recoverCompletedNativeRecordings(nativePlugin, userId, storage);
          if (!alive) return;
          setPendingSync(readQueue(storage).length);
        }
        const native = await getNativeWorkoutState();
        if (!alive || !native || !native.activityId) return;
        if (native.ownerId !== userId) {
          if (native.active) await stopNativeWorkout();
          return;
        }
        if (native.version !== 2 || !native.startedAtMs || !native.activityType) return;
        recorder.adoptNative({
          ...native,
          ownerId: userId,
          activityId: native.activityId,
          activityType: native.activityType,
          startedAtMs: native.startedAtMs,
        });
        await recorder.attach();
        if ((!native.active || native.paused) && !recorder.current?.endedAtMs) recorder.pause();
        setNotice(
          native.active
            ? "Reconnected to your workout."
            : "Recovered your unfinished workout. Resume or save it.",
        );
      })().catch(() => {
        if (alive) setError("Could not recover this workout. Your native recording is retained.");
      });
    }

    // ── Live heart rate: BLE strap and SVJ Watch, with explicit arbitration ─
    // Both sources publish real measurements; exactly one is selected (the
    // user's choice first, then the BLE strap, then the watch). Only a freshly
    // selected sample is folded into the workout, so a reading is never double
    // counted and the two sources are never averaged together.
    const candidates: { ble: HeartRateCandidate; wear: HeartRateCandidate } = {
      ble: { reading: null, lastSampleMs: null },
      wear: { reading: null, lastSampleMs: null },
    };
    const ingestedAt = { ble: 0, wear_os: 0 };

    const applyHeartRate = () => {
      const selection = chooseHeartRateSource(
        { preferred: preferredSourceForArbitration(), ble: candidates.ble, wear: candidates.wear },
        Date.now(),
      );
      if (!selection.reading || !selection.source) {
        setLiveHeartRate(null);
        return;
      }
      const source = selection.source;
      if (selection.reading.timestampMs > ingestedAt[source]) {
        ingestedAt[source] = selection.reading.timestampMs;
        void recorder.ingestHeartRate(selection.reading.bpm, selection.reading.timestampMs);
      }
      setLiveHeartRate({
        bpm: selection.reading.bpm,
        source,
        deviceName:
          source === "wear_os"
            ? (selection.reading.deviceName ?? "SVJ Watch")
            : selection.reading.deviceName,
        status: selection.degraded ? "reconnecting" : "live",
      });
    };

    const cleanups: (() => void)[] = [];
    if (isNativeWearableAvailable()) {
      let wearableHandle: { remove: () => Promise<void> } | null = null;
      void VjWearable.addListener("heartRateMeasurement", (event) => {
        const reading = normalizeWearableHeartRate(event, Date.now());
        if (!reading) return;
        candidates.ble = { reading, lastSampleMs: reading.timestampMs };
        applyHeartRate();
      })
        .then((handle) => {
          if (!alive) void handle.remove();
          else wearableHandle = handle;
        })
        .catch(() => undefined);
      cleanups.push(() => void wearableHandle?.remove());
    }

    // The SVJ Watch streams real heart rate while its own workout is running.
    // The companion controller owns the native listeners and the inbox.
    startWearCompanion();
    cleanups.push(
      onWearHeartRateSample((measurement) => {
        const reading = wearMeasurementToHeartRate(measurement);
        if (!reading) return;
        candidates.wear = { reading, lastSampleMs: reading.timestampMs };
        applyHeartRate();
      }),
      subscribeHeartRateSourcePreference(() => applyHeartRate()),
    );
    // Staleness must be visible: a silent strap degrades to "—" instead of
    // freezing the last BPM on screen forever.
    const hrTicker = window.setInterval(applyHeartRate, 2000);

    return () => {
      alive = false;
      void recorder.detach().catch(() => undefined);
      unsubscribe();
      window.clearInterval(hrTicker);
      for (const cleanup of cleanups) cleanup();
    };
  }, [recorder, userId]);

  // ── Offline queue flush ─────────────────────────────────────────────────
  const syncPending = useCallback(async () => {
    const client = activityRpcClient();
    if (!client || !userId || document.hidden || !navigator.onLine) return;
    try {
      await flushOfflineQueue(storage, async (queued): Promise<SyncOutcome> => {
        const { data } = await supabase.auth.getSession();
        if (
          queued.ownerId !== userId ||
          data.session?.user.id !== userId ||
          owner.current !== userId
        )
          return { ok: false, error: "Sign into the original account to sync." };
        if (document.hidden || !navigator.onLine) return { ok: false, error: "Sync paused." };
        const result = await withAccountRpcClient(
          userId,
          (scoped) => saveGpsWorkout(scoped, queued),
          () => owner.current === userId,
        );
        if (result.ok)
          await workoutPlugin()?.clearJournal?.({
            ownerId: userId,
            activityId: queued.activityId,
            confirmed: true,
          });
        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, duplicate: result.duplicate };
      });
      setPendingSync(readQueue(storage).length);
    } catch {
      setError(
        "Could not sync saved workouts. Your queue is retained. Free device storage and retry.",
      );
    }
  }, [storage, userId]);

  // A completed watch workout is imported by the companion controller through
  // the canonical server pipeline; here we only surface the outcome and make
  // sure the local offline queue is flushed.
  useEffect(
    () =>
      onWearWorkoutSummary((summary, duplicate) => {
        setNotice(
          duplicate
            ? "That watch workout is already in your SVJ history."
            : `Watch workout saved · ${summary.activityType}`,
        );
        void syncPending();
      }),
    [syncPending],
  );

  useEffect(() => {
    void syncPending();
    const onOnline = () => void syncPending();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onOnline);
    const interval = window.setInterval(() => void syncPending(), 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onOnline);
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
        if (!userId) throw new Error("Sign in to record a workout.");
        if (isNativeRecordingAvailable()) {
          const capability = await workoutPlugin()?.isAvailable?.();
          if (capability?.version !== 2 || !capability.journal)
            throw new Error("Install the latest SVJ app to record and recover workouts.");
          const permissions = await requestWorkoutPermissions();
          if (!canRecordWith(permissions)) {
            throw new Error(
              "Allow Location while using SVJ in your phone Settings, then try again.",
            );
          }
        }
        await recorder.start(activityType, { splitUnit });
        if (isNativeRecordingAvailable()) {
          // One stable activity id ties the native service and the JS session
          // to the same workout, so nothing is double-counted.
          const result = await startNativeWorkout({
            ownerId: userId ?? undefined,
            startedAtMs: recorder.current?.startedAtMs,
            activityId: recorder.current?.activityId ?? "",
            activityType,
          });
          if (!result.ok) {
            recorder.pause();
            throw new Error(result.error ?? "Could not start recording.");
          }
        }
        setSession(recorder.current);
        setSummary(recorder.summary());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not start recording.");
      } finally {
        setBusy(false);
      }
    },
    [recorder, userId],
  );

  const pause = useCallback(() => {
    void (async () => {
      try {
        const current = recorder.current;
        if (!current?.ownerId) return;
        await setNativeWorkoutPaused(true, {
          ownerId: current.ownerId,
          activityId: current.activityId,
        });
        recorder.pause();
      } catch {
        setError("Could not pause recording. Try again.");
      }
    })();
  }, [recorder]);
  const resume = useCallback(() => {
    void (async () => {
      try {
        const current = recorder.current;
        if (!current?.ownerId) return;
        await setNativeWorkoutPaused(false, {
          ownerId: current.ownerId,
          activityId: current.activityId,
        });
        recorder.resume();
        await recorder.attach();
      } catch {
        setError("Could not resume recording. Check location permission.");
      }
    })();
  }, [recorder]);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      await recorder.finish();
      setSession(recorder.current ? { ...recorder.current } : null);
      setSummary(recorder.summary());
      const shareClient = activityRpcClient();
      if (shareClient && sharingRef.current) {
        const stopped = await stopLiveShare(shareClient, sharingRef.current);
        if (!stopped.ok) {
          setError(
            "Recording stopped. The live link could not confirm its stop; reconnect and tap Stop Sharing.",
          );
          return;
        }
        sharingRef.current = null;
        setLiveShare(null);
      }
      setSession(recorder.current ? { ...recorder.current } : null);
      setSummary(recorder.summary());
    } catch {
      setError(
        "Could not confirm recording stopped. Your workout is retained. Reopen SVJ and retry Finish.",
      );
    } finally {
      setBusy(false);
    }
  }, [recorder]);

  const discard = useCallback(async () => {
    setBusy(true);
    try {
      await recorder.finish();
      const shareClient = activityRpcClient();
      if (shareClient && sharingRef.current) {
        const stopped = await stopLiveShare(shareClient, sharingRef.current);
        if (!stopped.ok) throw new Error("Could not stop sharing");
      }
      sharingRef.current = null;
      setLiveShare(null);
      const discardedId = recorder.current?.activityId;
      await recorder.discard();
      if (userId && discardedId)
        await workoutPlugin()?.clearJournal?.({
          ownerId: userId,
          activityId: discardedId,
          confirmed: true,
        });
      await stopNativeWorkout();
      setSession(null);
      setSummary(null);
      setNotice("Workout discarded. Nothing was saved.");
    } catch {
      setError("Could not confirm discard. Your recording is retained; reopen SVJ and retry.");
    } finally {
      setBusy(false);
    }
  }, [recorder, userId]);

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
    try {
      if (!userId || owner.current !== current.ownerId)
        throw new Error("Sign in to the original account to save.");
      if (!current.endedAtMs) throw new Error("Finish this recording before saving.");
      recorder.enqueueForSync();
      setPendingSync(readQueue(storage).length);
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== userId)
        throw new Error("Sign in to the original account to save.");
      const result = await withAccountRpcClient(
        userId,
        (scoped) => saveGpsWorkout(scoped, current),
        () => owner.current === userId,
      );
      if (!result.ok) {
        recorder.markSyncFailure(result.error ?? "Couldn't save this workout.");
        setError(result.error ?? "Couldn't save this workout.");
        return;
      }
      recorder.markSaved();
      await workoutPlugin()?.clearJournal?.({
        ownerId: userId,
        activityId: current.activityId,
        confirmed: true,
      });
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
    } catch {
      setError(
        "Could not finish saving. Your recording is retained; check connection and device storage, then retry.",
      );
    } finally {
      setBusy(false);
    }
  }, [recorder, syncPending, storage, userId]);

  const shareLive = useCallback(async () => {
    const current = recorder.current;
    const client = activityRpcClient();
    if (!current || !client) {
      setError("Sign in to use SVJ Live Share.");
      return;
    }
    // Live sharing must not finish a workout or create reward-bearing activity data.
    setLiveShareBusy(true);
    setError(null);
    try {
      if (current.state !== "recording" || current.ownerId !== userId) {
        setError("Start or resume your workout before sharing live.");
        return;
      }
      const started = await startRecordingLiveShare(
        client,
        current.activityId,
        current.activityType,
      );
      if (!started.ok || !started.share?.token) {
        setError(started.error ?? "Couldn't start live sharing.");
        return;
      }
      sharingRef.current = started.share.token;
      lastSharePushRef.current = 0;
      setLiveShare(started.share);
      setSession(recorder.current);
      setNotice("SVJ Live Share is on. The link stops working when you stop sharing.");
    } catch {
      setError("Could not start sharing. Check your connection and retry.");
    } finally {
      setLiveShareBusy(false);
    }
  }, [recorder, userId]);

  const stopSharing = useCallback(async () => {
    const client = activityRpcClient();
    setLiveShareBusy(true);
    try {
      if (!client) throw new Error("Sign in to stop sharing.");
      const stopped = await stopLiveShare(client, sharingRef.current ?? undefined);
      if (!stopped.ok) throw new Error("Stop sharing did not succeed.");
      sharingRef.current = null;
      setLiveShare(null);
      setNotice("Live sharing stopped.");
    } catch {
      setError("Could not confirm sharing stopped. Check your connection and retry.");
    } finally {
      setLiveShareBusy(false);
    }
  }, []);

  // A recreated WebView reattaches to the owner's existing link, never a different recording.
  useEffect(() => {
    const activityId = session?.activityId;
    if (!userId || !activityId) return;
    let alive = true;
    const restoreShare = async () => {
      if (document.hidden || !navigator.onLine) return;
      try {
        const result = await withAccountRpcClient(
          userId,
          (client) => fetchMyLiveShare(client),
          () => alive && owner.current === userId,
        );
        if (!alive || !result.ok || result.share?.recordingId !== activityId || !result.share.token)
          return;
        sharingRef.current = result.share.token;
        setLiveShare(result.share);
        if (recorder.current?.endedAtMs) {
          const stopped = await withAccountRpcClient(
            userId,
            (client) => stopLiveShare(client, result.share!.token),
            () => alive && owner.current === userId,
          );
          if (stopped.ok && alive) {
            sharingRef.current = null;
            setLiveShare(null);
          }
        }
      } catch {
        /* Keep the existing link/status until the server confirms a change. */
      }
    };
    void restoreShare();
    window.addEventListener("online", restoreShare);
    document.addEventListener("visibilitychange", restoreShare);
    return () => {
      alive = false;
      window.removeEventListener("online", restoreShare);
      document.removeEventListener("visibilitychange", restoreShare);
    };
  }, [userId, session?.activityId, session?.endedAtMs, recorder]);

  const dismissError = useCallback(() => setError(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const canSave =
    session != null &&
    session.points.length >= MIN_GPS_POINTS_TO_SAVE &&
    canTransition(session.state, "stopping");

  return {
    session,
    summary,
    liveHeartRate,
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
