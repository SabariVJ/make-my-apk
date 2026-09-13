import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBodyProfile } from "@/lib/personalization.functions";
import { useSVJ } from "./SVJContext";
import { readStoredJson, writeStoredJson } from "../lib/storage";
import {
  vjCheckPermissions,
  vjRequestPermissions,
  vjStartTracking,
  vjStopTracking,
  vjGetState,
  vjGetSensorInfo,
  vjPluginAvailable,
  vjAddMeasurementListener,
  vjAddTrackingStateListener,
  type VjPedometerState,
  type VjSensorInfo,
  type VjSensorMode,
} from "../lib/vj-pedometer";
import {
  activeKcalGoal,
  applyTrackedMeasurement,
  buildHistory,
  claimMilestone,
  estimateCalories,
  milestoneXpClaimed,
  normalizeActivityState,
  pendingTrackedMilestones,
  rollActivityDay,
  startTrackedSession,
  summarizeHistory,
  STEP_GOAL,
  type ActivityState,
  type BodyMetrics,
  type DayPoint,
} from "../lib/activityTracker";

const STORAGE_KEY = "svj_activity_v1";
const MILESTONE_FEED_PREFIX = "Step Milestone";

/** Android needs its own runtime path (native VjPedometer bridge). */
const ANDROID_PLATFORM = Capacitor.getPlatform() === "android";
/** Web/dev builds keep the diagnostics panel even without a native flag. */
const WEB_DEBUG_BUILD = import.meta.env?.MODE !== "production";

type PedometerPlugin = import("@capgo/capacitor-pedometer").CapacitorPedometerPlugin;

export type ActivityStepSource = VjSensorMode | "ios" | null;

interface ActivityContextValue {
  todaySteps: number;
  stepGoal: number;
  stepPercent: number;
  remainingSteps: number;
  /** XP granted today by step milestones (feeds XP Today / Daily XP Goal). */
  xpEarnedToday: number;
  milestoneSteps: number;
  activeKcal: number;
  totalKcal: number;
  kcalGoal: number;
  kcalPercent: number;
  trackingStatus:
    "stopped" | "starting" | "tracking" | "stopping" | "denied" | "unsupported" | "error";
  trackingRequested: boolean;
  trackingActive: boolean;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  getSensorInfo: () => Promise<VjSensorInfo | null>;
  statusMessage: string;
  /** Which sensor supplied today's steps (null on web/unsupported). */
  stepSource: ActivityStepSource;
  lastSyncedAt: number | null;
  history7: DayPoint[];
  history30: DayPoint[];
  summary7: ReturnType<typeof summarizeHistory>;
  summary30: ReturnType<typeof summarizeHistory>;
  bodyMetrics: BodyMetrics;
  debugInfo: ActivityDebugInfo | null;
}

interface ActivityDebugInfo {
  pluginAvailable: boolean | null;
  sensorMode: string | null;
  sensorName: string | null;
  sensorVendor: string | null;
  sensorAvailable: boolean | null;
  permission: string | null;
  listenerConnected: boolean;
  sensorStarted: boolean;
  trackingRequested: boolean;
  trackingActive: boolean;
  listenerRegistered: boolean;
  listenerRemoved: boolean;
  sessionBaselineRaw: number | null;
  sessionSteps: number;
  selectedSensorMode: string | null;
  lastMeasurementAtMs: number | null;
  lastRawSteps: number | null;
  lastDailySteps: number | null;
  lastError: string | null;
  notes: string[];
}

const EMPTY_DEBUG: ActivityDebugInfo = {
  pluginAvailable: null,
  sensorMode: null,
  sensorName: null,
  sensorVendor: null,
  sensorAvailable: null,
  permission: null,
  listenerConnected: false,
  sensorStarted: false,
  trackingRequested: false,
  trackingActive: false,
  listenerRegistered: false,
  listenerRemoved: false,
  sessionBaselineRaw: null,
  sessionSteps: 0,
  selectedSensorMode: null,
  lastMeasurementAtMs: null,
  lastRawSteps: null,
  lastDailySteps: null,
  lastError: null,
  notes: [],
};

const ActivityContext = createContext<ActivityContextValue | null>(null);

/** Safely import the iOS/web pedometer plugin (absent in some bundles). */
async function loadPedometer(): Promise<PedometerPlugin | null> {
  try {
    const mod = await import("@capgo/capacitor-pedometer");
    return mod.CapacitorPedometer ?? null;
  } catch {
    return null;
  }
}

/** Activity status line per selected Android sensor mode. */
function androidStatusMessage(mode: VjSensorMode): string {
  switch (mode) {
    case "counter":
      return "Step tracking active — hardware counter.";
    case "detector":
      return "Step tracking active — step detector.";
    case "accelerometer":
      return "Step tracking active — motion estimate (steps are estimated from accelerometer motion).";
    default:
      return "No compatible step sensor found on this device.";
  }
}

export function ActivityProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string | null;
}) {
  const { awardXp, addActivity } = useSVJ();
  const callGetBodyProfile = useServerFn(getBodyProfile);

  const [state, setState] = useState<ActivityState>(
    () =>
      rollActivityDay(
        normalizeActivityState(readStoredJson<unknown>(STORAGE_KEY, null)),
        new Date(),
      ).state,
  );
  const [trackingStatus, setTrackingStatus] =
    useState<ActivityContextValue["trackingStatus"]>("stopped");
  const [statusMessage, setStatusMessage] = useState(
    "Tracking stopped — press START TRACKING to begin.",
  );
  const [stepSource, setStepSource] = useState<ActivityStepSource>(null);
  /**
   * Diagnostics on Android are on by default so a debug APK always shows them,
   * and are switched off when the native plugin reports a non-debuggable
   * (release) build. Never rely on import.meta.env.DEV: the WebView bundle is
   * production-built even inside a debug APK.
   */
  const [showDiagnostics, setShowDiagnostics] = useState(ANDROID_PLATFORM || WEB_DEBUG_BUILD);
  const [debugTick, setDebugTick] = useState(0);
  const pluginRef = useRef<PedometerPlugin | null>(null);
  const debugRef = useRef<ActivityDebugInfo>({ ...EMPTY_DEBUG, notes: [] });
  /** StrictMode-safe guard: milestones already paid this instance, "dateKey:threshold". */
  const paidMilestonesRef = useRef<Set<string>>(new Set());

  const stateRef = useRef(state);
  stateRef.current = state;
  const mountedRef = useRef(false);
  const requestedRef = useRef(false);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const rewardSessionRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const listenerCleanupsRef = useRef<Array<() => Promise<void>>>([]);

  const note = useCallback((message: string) => {
    debugRef.current.notes = [message, ...debugRef.current.notes].slice(0, 40);
    if (mountedRef.current) setDebugTick((t) => t + 1);
  }, []);

  const refreshDebug = useCallback(() => {
    if (mountedRef.current) setDebugTick((t) => t + 1);
  }, []);

  // ── Persistence ────────────────────────────────────────────────────────
  useEffect(() => {
    writeStoredJson(STORAGE_KEY, state);
  }, [state]);

  // ── Body metrics for calorie estimation ────────────────────────────────
  const bodyProfileQuery = useQuery({
    queryKey: ["activity-body-profile"],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => callGetBodyProfile({}),
  });

  const { bodyMetrics, ageYears } = useMemo(() => {
    const profile = bodyProfileQuery.data;
    let age: number | undefined;
    const dob = profile?.dateOfBirth;
    if (dob) {
      const birth = new Date(dob);
      if (!Number.isNaN(birth.getTime())) {
        const now = new Date();
        age = now.getFullYear() - birth.getFullYear();
        const beforeBirthday =
          now.getMonth() < birth.getMonth() ||
          (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
        if (beforeBirthday) age -= 1;
        if (age <= 0 || age >= 120) age = undefined;
      }
    }
    return {
      bodyMetrics: {
        weightKg: profile?.weightKg ?? undefined,
        heightCm: profile?.heightCm ?? undefined,
        sex: profile?.sex ?? undefined,
        bmr: profile?.bmr ?? undefined,
        dailyCalorieTarget: profile?.dailyCalorieTarget ?? undefined,
      } satisfies BodyMetrics,
      ageYears: age,
    };
  }, [bodyProfileQuery.data]);

  // ── XP milestones (effect, never inside a state updater — StrictMode safe:
  //    claim is persisted first and a ref guard blocks same-instance replays) ─
  useEffect(() => {
    const today = state.today;
    if (!today || !activeRef.current || rewardSessionRef.current !== generationRef.current) return;
    let claimed = stateRef.current;
    for (const milestone of pendingTrackedMilestones(today)) {
      const key = `${today.dateKey}:${milestone.steps}`;
      if (paidMilestonesRef.current.has(key)) continue;
      const next = claimMilestone(claimed, new Date(), milestone.steps);
      if (!writeStoredJson(STORAGE_KEY, next).ok) continue;
      claimed = next;
      paidMilestonesRef.current.add(key);
      setState((prev) => claimMilestone(prev, new Date(), milestone.steps));
      // Physical-stat nudge alongside the XP — same shape as challenge XP.
      awardXp(milestone.xp, { physical: 1 });
      addActivity(
        `${MILESTONE_FEED_PREFIX}: ${milestone.label} Steps`,
        `Walked ${milestone.steps.toLocaleString()} steps today. +${milestone.xp} XP.`,
        milestone.xp,
      );
    }
  }, [state.today?.steps, state.today?.dateKey, state.today, awardXp, addActivity]);

  // Only these explicit commands own sensor registration. Serialized commands
  // plus a generation gate cover STOP during permission/start and StrictMode.
  const metricsRef = useRef<BodyMetrics>({});
  metricsRef.current = { ...bodyMetrics, ageYears };

  const syncNative = useCallback(
    (native: VjPedometerState) => {
      Object.assign(debugRef.current, {
        sensorAvailable: native.sensorAvailable,
        sensorStarted: native.sensorStarted,
        sensorMode: native.mode,
        selectedSensorMode: native.mode,
        trackingRequested: native.trackingRequested,
        trackingActive: native.trackingActive,
        listenerRegistered: native.listenerRegistered,
        listenerRemoved: native.listenerRemoved,
        sessionBaselineRaw: native.sessionBaselineRaw >= 0 ? native.sessionBaselineRaw : null,
        sessionSteps: native.sessionSteps,
        lastRawSteps: native.lastRaw >= 0 ? native.lastRaw : null,
        lastError: native.lastError || null,
      });
      refreshDebug();
    },
    [refreshDebug],
  );

  const removeOwnedListeners = useCallback(async () => {
    const handles = listenerCleanupsRef.current.splice(0);
    const results = await Promise.allSettled(handles.map((remove) => remove()));
    results.forEach((result, i) => {
      if (result.status === "rejected") listenerCleanupsRef.current.push(handles[i]);
    });
    debugRef.current.listenerConnected = listenerCleanupsRef.current.length > 0;
    if (debugRef.current.listenerConnected)
      throw new Error("Unable to remove the step event listener. Try STOP again.");
  }, []);

  const stopTracking = useCallback((): Promise<void> => {
    const wasStarting = requestedRef.current && !activeRef.current;
    const generation = ++generationRef.current;
    // Synchronous gate: queued native/bridge callbacks cannot change steps,
    // calories or XP while the actual native stop call is being processed.
    requestedRef.current = false;
    activeRef.current = false;
    rewardSessionRef.current = null;
    debugRef.current.trackingRequested = false;
    debugRef.current.trackingActive = false;
    if (mountedRef.current) setTrackingStatus("stopping");

    // Dispatch STOP immediately, even if a START bridge promise has not yet
    // resolved. A second stop after startup settles closes any late register.
    const stopSensor = async () => {
      if (Capacitor.getPlatform() === "android") return vjStopTracking();
      if (pluginRef.current) await pluginRef.current.stopMeasurementUpdates();
      return null;
    };
    const immediateStop = stopSensor().then(
      (native) => ({ native, error: null as unknown }),
      (error: unknown) => ({ native: null, error }),
    );

    const stop = async () => {
      let failure: unknown;
      try {
        const result = await immediateStop;
        const native = wasStarting ? await stopSensor() : result.native;
        if (!wasStarting && result.error) throw result.error;
        if (generation === generationRef.current && native) syncNative(native);
        else if (Capacitor.getPlatform() !== "android" && pluginRef.current) {
          debugRef.current.listenerRegistered = false;
          debugRef.current.listenerRemoved = true;
          debugRef.current.sensorStarted = false;
        }
      } catch (error) {
        failure = error;
        debugRef.current.listenerRemoved = false;
      } finally {
        try {
          await removeOwnedListeners();
        } catch (error) {
          failure ??= error;
        }
      }
      if (generation !== generationRef.current || !mountedRef.current) return;
      if (failure) {
        debugRef.current.lastError = String(failure);
        setTrackingStatus("error");
        setStatusMessage(
          "Tracking stopped accepting steps, but sensor cleanup failed. Retry STOP.",
        );
      } else {
        setTrackingStatus("stopped");
        setStatusMessage("Tracking stopped — press START TRACKING to begin.");
      }
      refreshDebug();
    };
    const task = queueRef.current.then(stop, stop);
    queueRef.current = task;
    return task;
  }, [removeOwnedListeners, syncNative, refreshDebug]);

  const getSensorInfo = useCallback(async (): Promise<VjSensorInfo | null> => {
    if (Capacitor.getPlatform() !== "android") return null;
    const generation = generationRef.current;
    const available = vjPluginAvailable();
    const info = available ? await vjGetSensorInfo() : null;
    const native = available ? await vjGetState() : null;
    if (generation !== generationRef.current || !mountedRef.current) return info;
    debugRef.current.pluginAvailable = available;
    if (info) {
      Object.assign(debugRef.current, {
        sensorMode: info.mode,
        selectedSensorMode: info.mode,
        sensorName: info.name || null,
        sensorVendor: info.vendor || null,
        sensorAvailable: info.available,
        permission: info.permission ?? "unknown",
      });
      if (info.debug === false) setShowDiagnostics(WEB_DEBUG_BUILD);
    }
    if (native) syncNative(native);
    if (activeRef.current && native && !native.trackingActive) void stopTracking();
    refreshDebug();
    return info;
  }, [syncNative, stopTracking, refreshDebug]);

  const startTracking = useCallback((): Promise<void> => {
    if (!userId || !mountedRef.current || requestedRef.current) return Promise.resolve();
    const generation = ++generationRef.current;
    const sessionId = `${Date.now()}-${generation}`;
    const current = () =>
      mountedRef.current && requestedRef.current && generation === generationRef.current;
    requestedRef.current = true;
    rewardSessionRef.current = null;
    setTrackingStatus("starting");
    setStatusMessage("Starting step tracking…");
    Object.assign(debugRef.current, {
      trackingRequested: true,
      trackingActive: false,
      sessionBaselineRaw: null,
      sessionSteps: 0,
      lastError: null,
    });
    refreshDebug();

    const acceptMeasurement = (steps: number, atMs: number, distanceMeters?: number) => {
      if (!current() || !activeRef.current || !Number.isFinite(atMs)) return;
      const metrics = metricsRef.current;
      if (steps > stateRef.current.sessionLastSteps) rewardSessionRef.current = generation;
      setState((prev) => {
        const next = applyTrackedMeasurement(prev, new Date(atMs), { steps, atMs, distanceMeters });
        if (!next.today || next.today.steps === prev.today?.steps) return next;
        const calories = estimateCalories(
          {
            steps: next.today.trackedSteps ?? 0,
            distanceMeters: next.today.trackedDistanceMeters ?? 0,
            activeSeconds: next.today.trackedActiveSeconds ?? 0,
          },
          metrics,
          new Date(atMs),
        );
        const prior = next.today.priorActiveKcal ?? 0;
        return {
          ...next,
          today: {
            ...next.today,
            activeKcal: prior + calories.activeKcal,
            totalKcal: prior + calories.totalKcal,
          },
        };
      });
    };
    const start = async () => {
      if (!current()) return;
      try {
        await removeOwnedListeners();
        if (!current()) return;
        const platform = Capacitor.getPlatform();
        let mode: ActivityStepSource = null;
        if (platform === "android") {
          debugRef.current.pluginAvailable = vjPluginAvailable();
          if (!debugRef.current.pluginAvailable)
            throw new Error("Native step bridge is unavailable in this build.");
          const info = await vjGetSensorInfo();
          if (!current()) return;
          if (!info?.available || info.mode === "none")
            throw new Error("No compatible step sensor found on this device.");
          mode = info.mode;
          Object.assign(debugRef.current, {
            sensorMode: mode,
            selectedSensorMode: mode,
            sensorAvailable: info.available,
            sensorName: info.name,
            sensorVendor: info.vendor,
          });
          if (info.debug === false) setShowDiagnostics(WEB_DEBUG_BUILD);
          let permission = await vjCheckPermissions();
          if (!current()) return;
          if (permission?.activityRecognition !== "granted")
            permission = await vjRequestPermissions();
          if (!current()) return;
          debugRef.current.permission = permission?.activityRecognition ?? "unknown";
          if (permission?.activityRecognition !== "granted")
            throw new Error(
              "Motion permission denied. Enable Activity Recognition to track steps.",
            );

          listenerCleanupsRef.current.push(
            await vjAddTrackingStateListener((native) => {
              if (!current() || native.sessionId !== sessionId) return;
              syncNative(native);
              if (!native.trackingActive) {
                void stopTracking();
                return;
              }
              activeRef.current = true;
            }),
          );
          if (!current()) return;
          listenerCleanupsRef.current.push(
            await vjAddMeasurementListener((event) => {
              if (
                !current() ||
                event.sessionId !== sessionId ||
                !event.trackingActive ||
                !event.trackingRequested ||
                !event.listenerRegistered
              )
                return;
              activeRef.current = true;
              Object.assign(debugRef.current, {
                lastMeasurementAtMs: event.timestamp,
                lastRawSteps: event.rawValue,
                lastDailySteps: event.steps,
                sessionBaselineRaw: event.sessionBaselineRaw >= 0 ? event.sessionBaselineRaw : null,
                sessionSteps: event.sessionSteps,
              });
              // Native sessionSteps already excludes pre-START and stopped motion.
              // Never import the device's raw counter or historical all-day total.
              acceptMeasurement(event.sessionSteps, event.timestamp);
              refreshDebug();
            }),
          );
          if (!current()) return;
          setState((prev) => startTrackedSession(prev, new Date()));
          const native = await vjStartTracking(sessionId);
          if (!current()) return;
          if (
            !native?.trackingActive ||
            !native.listenerRegistered ||
            native.sessionId !== sessionId
          ) {
            throw new Error(
              "The native sensor did not confirm this tracking session. Update the native bridge.",
            );
          }
          syncNative(native);
        } else if (platform === "ios") {
          const plugin = await loadPedometer();
          if (!current()) return;
          if (!plugin) throw new Error("Live step tracking is unavailable on this device.");
          pluginRef.current = plugin;
          let permission = await plugin.checkPermissions();
          if (!current()) return;
          if (permission.activityRecognition !== "granted")
            permission = await plugin.requestPermissions();
          if (!current()) return;
          debugRef.current.permission = permission.activityRecognition;
          if (permission.activityRecognition !== "granted")
            throw new Error("Motion permission denied.");
          const available = await plugin.isAvailable();
          if (!current()) return;
          if (!available.stepCounting)
            throw new Error("This device has no step-counting hardware.");
          setState((prev) => startTrackedSession(prev, new Date()));
          const listener = await plugin.addListener("measurement", (event) => {
            acceptMeasurement(Number(event.numberOfSteps), Date.now(), event.distance);
          });
          listenerCleanupsRef.current.push(() => listener.remove());
          if (!current()) return;
          activeRef.current = true;
          await plugin.startMeasurementUpdates();
          if (!current()) return;
          mode = "ios";
          Object.assign(debugRef.current, {
            listenerRegistered: true,
            listenerRemoved: false,
            trackingActive: true,
            sensorStarted: true,
          });
        } else {
          throw new Error("Live step tracking is available in the native app.");
        }
        activeRef.current = true;
        debugRef.current.listenerConnected = true;
        setStepSource(mode);
        setTrackingStatus("tracking");
        setStatusMessage(
          mode === "ios" ? "Tracking active." : androidStatusMessage(mode as VjSensorMode),
        );
        note("Tracking active — native session confirmed.");
      } catch (error) {
        if (!current()) return; // The queued STOP owns cleanup for cancelled starts.
        requestedRef.current = false;
        activeRef.current = false;
        rewardSessionRef.current = null;
        // A partial start must never leave a physical sensor or JS listener alive.
        let cleanupError: unknown;
        try {
          if (Capacitor.getPlatform() === "android") {
            const native = await vjStopTracking();
            if (native) syncNative(native);
          } else if (pluginRef.current) await pluginRef.current.stopMeasurementUpdates();
        } catch (failure) {
          cleanupError = failure;
        }
        try {
          await removeOwnedListeners();
        } catch (failure) {
          cleanupError ??= failure;
        }
        if (generation !== generationRef.current || !mountedRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        debugRef.current.lastError = cleanupError
          ? `${message}; cleanup: ${cleanupError}`
          : message;
        debugRef.current.trackingRequested = false;
        debugRef.current.trackingActive = false;
        setTrackingStatus(
          cleanupError ? "error" : /permission denied/i.test(message) ? "denied" : "unsupported",
        );
        setStatusMessage(`Tracking stopped — ${debugRef.current.lastError}`);
      } finally {
        refreshDebug();
      }
    };
    const task = queueRef.current.then(start, start);
    queueRef.current = task;
    return task;
  }, [userId, removeOwnedListeners, syncNative, stopTracking, note, refreshDebug]);

  useEffect(() => {
    mountedRef.current = true;
    // Clear any native registration left by a WebView reload. Mount, permission
    // grants, visibility changes and app resume never call START.
    void stopTracking().then(() => getSensorInfo());
    const visibility = () => {
      if (document.hidden) void stopTracking();
      else {
        setState((prev) => rollActivityDay(prev, new Date()).state);
        void getSensorInfo();
      }
    };
    const pagehide = () => {
      void stopTracking();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      void stopTracking();
    };
  }, [userId, stopTracking, getSensorInfo]);

  // One calendar-boundary timeout, not a polling loop or sensor query.
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(
      () => {
        setState((prev) => rollActivityDay(prev, new Date()).state);
      },
      Math.max(1, midnight.getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state.today?.dateKey]);

  // ── Calories: persist recomputed estimates into the day record ─────────
  const liveCalories = useMemo(() => {
    // Active calories change only with an accepted step event above. Resting
    // burn remains an estimate and can change without movement.
    const activeKcal = state.today?.activeKcal ?? 0;
    const resting = estimateCalories(
      { steps: 0, distanceMeters: 0, activeSeconds: 0 },
      { ...bodyMetrics, ageYears },
      new Date(),
    ).totalKcal;
    return { activeKcal, totalKcal: activeKcal + resting };
  }, [state.today, bodyMetrics, ageYears]);

  useEffect(() => {
    if (!state.today) return;
    const { activeKcal, totalKcal } = liveCalories;
    if (state.today.activeKcal === activeKcal && state.today.totalKcal === totalKcal) return;
    setState((prev) =>
      prev.today ? { ...prev, today: { ...prev.today, activeKcal, totalKcal } } : prev,
    );
  }, [liveCalories, state.today]);

  const history7 = useMemo(() => buildHistory(state, new Date(), 7), [state]);
  const history30 = useMemo(() => buildHistory(state, new Date(), 30), [state]);
  const summary7 = useMemo(() => summarizeHistory(history7), [history7]);
  const summary30 = useMemo(() => summarizeHistory(history30), [history30]);

  const todaySteps = state.today?.steps ?? 0;
  const stepPercent = Math.min(100, Math.round((todaySteps / STEP_GOAL) * 100));
  const remainingSteps = Math.max(0, STEP_GOAL - todaySteps);
  const kcalGoal = activeKcalGoal(bodyMetrics);
  const kcalPercent = Math.min(100, Math.round((liveCalories.activeKcal / kcalGoal) * 100));

  // `debugTick` keeps the diagnostics snapshot fresh without a polling loop.
  const debugSnapshot = useMemo<ActivityDebugInfo>(
    () => ({ ...debugRef.current, lastDailySteps: state.today?.steps ?? null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debugTick, state.today?.steps],
  );

  const value: ActivityContextValue = {
    todaySteps,
    stepGoal: STEP_GOAL,
    stepPercent,
    remainingSteps,
    xpEarnedToday: milestoneXpClaimed(state.today),
    milestoneSteps: state.today?.trackedSteps ?? 0,
    activeKcal: liveCalories.activeKcal,
    totalKcal: liveCalories.totalKcal,
    kcalGoal,
    kcalPercent,
    trackingStatus,
    trackingRequested: requestedRef.current,
    trackingActive: activeRef.current,
    startTracking,
    stopTracking,
    getSensorInfo,
    statusMessage,
    stepSource,
    lastSyncedAt: state.lastSyncedAt,
    history7,
    history30,
    summary7,
    summary30,
    bodyMetrics: { ...bodyMetrics, ageYears },
    debugInfo: showDiagnostics ? debugSnapshot : null,
  };

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityContextValue {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error("useActivity must be used within an ActivityProvider");
  }
  return context;
}

/** Null-safe variant for surfaces rendered with or without the provider. */
export function useActivityOptional(): ActivityContextValue | null {
  return useContext(ActivityContext);
}
