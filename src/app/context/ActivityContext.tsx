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
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  vjValidateMeasurement,
  VjNativeUpdateRequiredError,
  VJ_NATIVE_UPDATE_MESSAGE,
  type VjPedometerState,
  type VjSensorInfo,
  type VjSensorMode,
} from "../lib/vj-pedometer";
import {
  saveServerActivity,
  listServerActivities,
  buildClientSessionId,
  type ServerActivity,
  type CompletedSessionPayload,
} from "../lib/serverActivities";
import { extractSaveExtras, type SaveExtras } from "../lib/goalsRecords";
import {
  processActivityRewards,
  rewardsRpcClient,
  fetchPersonalizedXpToday,
  type ActivityRewards,
} from "../lib/rewards";
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

/**
 * Developer diagnostics are strictly opt-in and never appear in production.
 * Production bundles never show the pedometer debug panel regardless of the
 * flag. Development/test bundles show it only when
 * VITE_PEDOMETER_DIAGNOSTICS="1" is explicitly set. Never derive this from
 * platform detection alone.
 */
export function shouldEnableDiagnostics(
  mode: string | undefined,
  flag: string | undefined,
): boolean {
  return mode !== "production" && flag === "1";
}
const DIAGNOSTICS_OPT_IN = shouldEnableDiagnostics(
  import.meta.env?.MODE as string | undefined,
  import.meta.env?.VITE_PEDOMETER_DIAGNOSTICS as string | undefined,
);

type PedometerPlugin = import("@capgo/capacitor-pedometer").CapacitorPedometerPlugin;

export type ActivityStepSource = VjSensorMode | "ios" | null;

export interface ActivityContextValue {
  todaySteps: number;
  stepGoal: number;
  stepPercent: number;
  remainingSteps: number;
  /** XP granted today by step milestones (feeds XP Today / Daily XP Goal). */
  xpEarnedToday: number;
  /** Server-confirmed activity XP earned today (Update 04, database clock). */
  serverActivityXpToday: number;
  /** Server-confirmed personalized-task XP earned today (ledger-backed). */
  personalizedXpToday: number;
  milestoneSteps: number;
  activeKcal: number;
  totalKcal: number;
  kcalGoal: number;
  kcalPercent: number;
  trackingStatus:
    | "stopped"
    | "starting"
    | "tracking"
    | "stopping"
    | "denied"
    | "unsupported"
    | "error"
    | "update-required";
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
  /** Developer-only diagnostics opt-in (off unless explicitly enabled). */
  showDiagnostics: boolean;
  /** Frozen summary of the most recent completed tracking session. */
  completedSession: CompletedSessionSummary | null;
  /** Dismiss the completion summary card. */
  dismissCompletedSession: () => void;
  /** Save the completed session as ONE canonical server activity. */
  saveCompletedSession: (activityType: ActivityTypeFromLib) => Promise<SaveActivityResultLike>;
  saveState: "idle" | "saving" | "error";
  lastSaveError: string | null;
  /** Server-reported records/goal progress from the most recent save. */
  lastSaveExtras: SaveExtras | null;
  /** Server-confirmed rewards from the most recent save (Update 04). */
  lastSaveRewards: ActivityRewards | null;
  /** Idempotent retry for the last failed save. */
  retrySaveCompletedSession: () => Promise<SaveActivityResultLike>;
  logManualActivity: (input: {
    activityType: ActivityTypeFromLib;
    startedAtMs: number;
    durationMinutes: number;
    perceivedEffort?: number;
    notes?: string;
  }) => Promise<SaveActivityResultLike>;
  manualSaveState: "idle" | "saving" | "error";
  manualSaveError: string | null;
}

// Re-exported lib types keep the context self-contained for consumers.
export type ActivityTypeFromLib =
  | "walking"
  | "running"
  | "strength"
  | "cycling"
  | "football"
  | "calisthenics"
  | "hiit"
  | "yoga"
  | "other";
export type SaveActivityResultLike = {
  ok: boolean;
  duplicate?: boolean;
  activity?: ServerActivity;
  error?: string;
  extras?: SaveExtras;
  /** Server-confirmed rewards (Update 04). Null when not eligible / offline. */
  rewards?: ActivityRewards | null;
};

export interface CompletedSessionSummary {
  clientSessionId: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  stepCount: number;
  distanceMeters?: number;
  caloriesEstimate?: number;
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
  const queryClient = useQueryClient();
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
  /** Never rely on import.meta.env.DEV: the WebView bundle is production-built
   * even inside a debug APK, so only the explicit VITE_PEDOMETER_DIAGNOSTICS
   * opt-in may surface diagnostics. */
  const [showDiagnostics, setShowDiagnostics] = useState(DIAGNOSTICS_OPT_IN);
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
  const updateRequiredRef = useRef(false);
  const generationRef = useRef(0);
  const rewardSessionRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const listenerCleanupsRef = useRef<Array<() => Promise<void>>>([]);

  // ── Server activity session bookkeeping (Update 01) ───────────────────
  /** When the current tracking session started (ms), or null while idle. */
  const sessionStartedAtRef = useRef<number | null>(null);
  /** Steps/distance recorded by THIS session (session-relative, already excludes pre-START). */
  const sessionStepsRef = useRef(0);
  const sessionDistanceRef = useRef(0);
  const [completedSession, setCompletedSession] = useState<CompletedSessionSummary | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [lastSaveExtras, setLastSaveExtras] = useState<SaveExtras | null>(null);
  // Update 04: server-confirmed rewards for the most recent canonical save.
  const [lastSaveRewards, setLastSaveRewards] = useState<ActivityRewards | null>(null);
  // Personalized-task XP today comes from the immutable ledger, refreshed
  // after completion events — never derived from local displayed tasks.
  const [personalizedXpToday, setPersonalizedXpToday] = useState(0);
  useEffect(() => {
    const client = rewardsRpcClient();
    if (!client) return;
    let cancelled = false;
    void fetchPersonalizedXpToday(client).then((v) => {
      if (!cancelled) setPersonalizedXpToday(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const lastPayloadRef = useRef<CompletedSessionPayload | null>(null);
  const [manualSaveState, setManualSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [manualSaveError, setManualSaveError] = useState<string | null>(null);

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
        listenerRemoved:
          native.listenerRemoved === true &&
          native.listenerRegistered === false &&
          native.sensorStarted === false,
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
    // Freeze the session summary for the completion card / canonical save.
    const frozenStart = sessionStartedAtRef.current;
    const frozenSteps = sessionStepsRef.current;
    const frozenDistance = sessionDistanceRef.current;
    const endedAt = Date.now();
    if (frozenStart != null && (frozenSteps > 0 || endedAt - frozenStart >= 60_000)) {
      setCompletedSession({
        clientSessionId: `svj-${frozenStart.toString(36)}-${generationRef.current}`,
        startedAtMs: frozenStart,
        endedAtMs: endedAt,
        durationSeconds: Math.max(1, Math.round((endedAt - frozenStart) / 1000)),
        stepCount: frozenSteps,
        ...(frozenDistance > 0 ? { distanceMeters: Math.round(frozenDistance * 100) / 100 } : {}),
      });
    }
    sessionStartedAtRef.current = null;
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
        if (generation === generationRef.current && native) {
          syncNative(native);
          if (native.requiresAppUpdate) updateRequiredRef.current = true;
        } else if (Capacitor.getPlatform() !== "android" && pluginRef.current) {
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
      if (failure instanceof VjNativeUpdateRequiredError) {
        updateRequiredRef.current = true;
        debugRef.current.lastError = failure.message;
        setTrackingStatus("update-required");
        setStatusMessage(VJ_NATIVE_UPDATE_MESSAGE);
      } else if (failure) {
        debugRef.current.lastError = String(failure);
        setTrackingStatus("error");
        const detail = failure instanceof Error ? failure.message : String(failure);
        setStatusMessage(
          `Tracking stopped accepting steps, but sensor cleanup failed: ${detail} Retry STOP.`,
        );
      } else if (updateRequiredRef.current) {
        setTrackingStatus("update-required");
        setStatusMessage(VJ_NATIVE_UPDATE_MESSAGE);
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
      if (info.debug === false) setShowDiagnostics(DIAGNOSTICS_OPT_IN);
    }
    if (native) syncNative(native);
    if (activeRef.current && native && !native.trackingActive) void stopTracking();
    refreshDebug();
    return info;
  }, [syncNative, stopTracking, refreshDebug]);

  const startTracking = useCallback((): Promise<void> => {
    if (!userId || !mountedRef.current || requestedRef.current || updateRequiredRef.current)
      return Promise.resolve();
    const generation = ++generationRef.current;
    const sessionId = `${Date.now()}-${generation}`;
    const current = () =>
      mountedRef.current && requestedRef.current && generation === generationRef.current;
    requestedRef.current = true;
    rewardSessionRef.current = null;
    sessionStepsRef.current = 0;
    sessionDistanceRef.current = 0;
    sessionStartedAtRef.current = Date.now();
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

    const acceptMeasurement = (rawSteps: unknown, atMs: unknown, rawDistance?: unknown) => {
      if (!current() || !activeRef.current) return false;
      if (
        typeof atMs !== "number" ||
        !Number.isSafeInteger(atMs) ||
        !Number.isFinite(new Date(atMs).getTime())
      )
        return false;
      let measurement;
      try {
        measurement = vjValidateMeasurement({ numberOfSteps: rawSteps, distance: rawDistance });
      } catch (error) {
        debugRef.current.lastError = error instanceof Error ? error.message : String(error);
        refreshDebug();
        return false;
      }
      const { numberOfSteps: steps, distance: distanceMeters } = measurement;
      if (stateRef.current.lastSyncedAt != null && atMs < stateRef.current.lastSyncedAt)
        return false;
      // Session-relative bookkeeping for the canonical server activity.
      if (steps > stateRef.current.sessionLastSteps)
        sessionStepsRef.current += steps - stateRef.current.sessionLastSteps;
      if (distanceMeters !== undefined && distanceMeters > stateRef.current.sessionLastDistance)
        sessionDistanceRef.current += distanceMeters - stateRef.current.sessionLastDistance;
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
      return true;
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
          if (info.debug === false) setShowDiagnostics(DIAGNOSTICS_OPT_IN);
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
              if (!current() || !native || native.sessionId !== sessionId) return;
              syncNative(native);
              if (native.trackingActive !== true) {
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
                !event ||
                event.sessionId !== sessionId ||
                event.trackingActive !== true ||
                event.trackingRequested !== true ||
                event.listenerRegistered !== true
              )
                return;
              activeRef.current = true;
              // Validate before diagnostics, persistence, calories or XP receive the payload.
              if (!acceptMeasurement(event.sessionSteps, event.timestamp)) return;
              Object.assign(debugRef.current, {
                lastMeasurementAtMs: event.timestamp,
                lastRawSteps: event.rawValue,
                lastDailySteps: event.steps,
                sessionBaselineRaw:
                  typeof event.sessionBaselineRaw === "number" &&
                  Number.isSafeInteger(event.sessionBaselineRaw) &&
                  event.sessionBaselineRaw >= 0
                    ? event.sessionBaselineRaw
                    : null,
                sessionSteps: event.sessionSteps,
              });
              // Native sessionSteps already excludes pre-START and stopped motion.
              // Never import the device's raw counter or historical all-day total.
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
            acceptMeasurement(
              event?.numberOfSteps,
              event?.endDate === undefined ? Date.now() : event.endDate,
              event?.distance,
            );
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
        if (
          error instanceof VjNativeUpdateRequiredError ||
          cleanupError instanceof VjNativeUpdateRequiredError
        )
          updateRequiredRef.current = true;
        const retryCleanup = cleanupError && !(cleanupError instanceof VjNativeUpdateRequiredError);
        setTrackingStatus(
          retryCleanup
            ? "error"
            : updateRequiredRef.current
              ? "update-required"
              : /permission denied/i.test(message)
                ? "denied"
                : "unsupported",
        );
        setStatusMessage(
          updateRequiredRef.current && !retryCleanup
            ? VJ_NATIVE_UPDATE_MESSAGE
            : `Tracking stopped — ${debugRef.current.lastError}`,
        );
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

  // ── Canonical server activity save (Update 01) ─────────────────────────
  const buildSessionPayload = useCallback(
    (activityType: ActivityTypeFromLib): CompletedSessionPayload | null => {
      const session = completedSession;
      if (!session) return null;
      return {
        clientSessionId: session.clientSessionId,
        activityType,
        startedAtMs: session.startedAtMs,
        endedAtMs: session.endedAtMs,
        durationSeconds: session.durationSeconds,
        stepCount: session.stepCount,
        ...(session.distanceMeters !== undefined ? { distanceMeters: session.distanceMeters } : {}),
        // Calories come from the existing estimator over this session's tracked
        // metrics — never fabricated per-step server writes.
        ...(session.stepCount > 0
          ? {
              caloriesEstimate: estimateCalories(
                {
                  steps: session.stepCount,
                  distanceMeters: session.distanceMeters ?? 0,
                  activeSeconds: session.durationSeconds,
                },
                metricsRef.current,
                new Date(session.endedAtMs),
              ).activeKcal,
            }
          : {}),
      };
    },
    [completedSession],
  );

  const rpcCall = useCallback(async (rpcPayload: Record<string, unknown>) => {
    // svj_save_activity is defined in a new migration and not yet in the
    // generated Database types — cast through the generic client.
    const client = supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc("svj_save_activity", rpcPayload);
    return { data, error };
  }, []);

  const persist = useCallback(
    async (payload: CompletedSessionPayload, source: "svj_native" | "manual") => {
      if (!hasSupabaseConfig() || !userId) {
        return { ok: false as const, error: "Sign in to save activities to your history." };
      }
      const result = await saveServerActivity(rpcCall, payload, Date.now(), { source });
      if (result.ok) {
        // Update 02: surface server-derived records + goal progress.
        const extras = extractSaveExtras(result.rawData);
        // Update 04: server-derived rewards. Only a NEW activity processes
        // rewards; an idempotent retry is a guaranteed zero-duplicate no-op
        // on the server, but skipping it avoids a pointless round-trip.
        let rewards: ActivityRewards | null = null;
        if (!result.duplicate && result.activity) {
          const client = rewardsRpcClient();
          if (client) {
            const processed = await processActivityRewards(client, result.activity.id);
            if (processed.ok) rewards = processed.rewards ?? null;
            // A rewards failure never fails the save — the activity is
            // canonical and can be re-processed safely at any time.
          }
          // Update 04: refresh Character Matrix + profile XP without a reload
          // once the server confirms progression for this save.
          if (rewards && (rewards.xpAwarded > 0 || Object.keys(rewards.statChanges).length > 0)) {
            void queryClient.invalidateQueries({ queryKey: ["user-stats"] });
          }
        }
        return { ...result, extras, rewards };
      }
      return result;
    },
    [userId, rpcCall, queryClient],
  );

  const runSave = useCallback(
    async (activityType: ActivityTypeFromLib) => {
      const payload = buildSessionPayload(activityType);
      if (!payload) return { ok: false, error: "No completed session to save." };
      lastPayloadRef.current = payload;
      setSaveState("saving");
      setLastSaveError(null);
      const result = await persist(payload, "svj_native");
      if (result.ok) {
        setSaveState("idle");
        lastPayloadRef.current = null;
        // Server-derived records + goal progress for this save (Update 02).
        setLastSaveExtras(result.extras ?? null);
        setLastSaveRewards(result.rewards ?? null);
      } else {
        setSaveState("error");
        setLastSaveError(result.error ?? "Couldn't save activity.");
      }
      return result;
    },
    [buildSessionPayload, persist],
  );

  const saveCompletedSession = useCallback(
    (activityType: ActivityTypeFromLib) => runSave(activityType),
    [runSave],
  );

  const retrySaveCompletedSession = useCallback(async () => {
    const payload = lastPayloadRef.current;
    if (!payload) return { ok: false, error: "Nothing to retry." };
    setSaveState("saving");
    setLastSaveError(null);
    // Same payload = same client_session_id → idempotent server-side retry.
    const result = await persist(payload, "svj_native");
    if (result.ok) {
      setSaveState("idle");
      lastPayloadRef.current = null;
      setLastSaveExtras(result.extras ?? null);
      setLastSaveRewards(result.rewards ?? null);
    } else {
      setSaveState("error");
      setLastSaveError(result.error ?? "Couldn't save activity.");
    }
    return result;
  }, [persist]);

  const logManualActivity = useCallback(
    async (input: {
      activityType: ActivityTypeFromLib;
      startedAtMs: number;
      durationMinutes: number;
      perceivedEffort?: number;
      notes?: string;
    }) => {
      setManualSaveState("saving");
      setManualSaveError(null);
      const endedAtMs = input.startedAtMs + Math.round(input.durationMinutes * 60_000);
      const result = await persist(
        {
          clientSessionId: buildClientSessionId(),
          activityType: input.activityType,
          startedAtMs: input.startedAtMs,
          endedAtMs,
          durationSeconds: Math.round(input.durationMinutes * 60),
          stepCount: 0,
          ...(input.perceivedEffort !== undefined
            ? { perceivedEffort: input.perceivedEffort }
            : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
        "manual",
      );
      if (result.ok) {
        setManualSaveState("idle");
      } else {
        setManualSaveState("error");
        setManualSaveError(result.error ?? "Couldn't save activity.");
      }
      return result;
    },
    [persist],
  );

  const value: ActivityContextValue = {
    todaySteps,
    stepGoal: STEP_GOAL,
    stepPercent,
    remainingSteps,
    xpEarnedToday: milestoneXpClaimed(state.today),
    // Update 04: latest server-confirmed activity-XP-today figure. Derived
    // from the server's own daily-cap arithmetic — never device-local math.
    serverActivityXpToday: lastSaveRewards
      ? Math.max(0, 100 - (lastSaveRewards.dailyActivityXpRemaining ?? 0))
      : 0,
    personalizedXpToday,
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
    showDiagnostics,
    completedSession,
    dismissCompletedSession: useCallback(() => setCompletedSession(null), []),
    saveCompletedSession,
    saveState,
    lastSaveError,
    lastSaveExtras,
    lastSaveRewards,
    retrySaveCompletedSession,
    logManualActivity,
    manualSaveState,
    manualSaveError,
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
