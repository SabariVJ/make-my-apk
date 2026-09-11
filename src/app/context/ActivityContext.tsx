import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getBodyProfile } from '@/lib/personalization.functions';
import { useSVJ } from './SVJContext';
import { readStoredJson, writeStoredJson } from '../lib/storage';
import {
  vjCheckPermissions,
  vjRequestPermissions,
  vjStartUpdates,
  vjStopUpdates,
  vjGetState,
  vjGetSensorInfo,
  vjPluginAvailable,
  vjAddMeasurementListener,
  type VjSensorMode,
} from '../lib/vj-pedometer';
import {
  activeKcalGoal,
  applyDailyTotal,
  applyMeasurement,
  buildHistory,
  claimMilestone,
  dateKeyOf,
  emptyActivityState,
  estimateCalories,
  milestoneXpClaimed,
  normalizeActivityState,
  pendingMilestones,
  rollActivityDay,
  startSession,
  summarizeHistory,
  STEP_GOAL,
  type ActivityState,
  type BodyMetrics,
  type DayPoint,
} from '../lib/activityTracker';

const STORAGE_KEY = 'svj_activity_v1';
const MILESTONE_FEED_PREFIX = 'Step Milestone';

/** Android needs its own runtime path (native VjPedometer bridge). */
const ANDROID_PLATFORM = Capacitor.getPlatform() === 'android';
/** Web/dev builds keep the diagnostics panel even without a native flag. */
const WEB_DEBUG_BUILD = import.meta.env?.MODE !== 'production';
/** How long the Activity screen may stay on "Connecting…" before it explains itself. */
const STARTUP_WINDOW_MS = 8_000;

type PedometerPlugin = import('@capgo/capacitor-pedometer').CapacitorPedometerPlugin;

export type ActivityStepSource = VjSensorMode | 'ios' | null;

interface ActivityContextValue {
  todaySteps: number;
  stepGoal: number;
  stepPercent: number;
  remainingSteps: number;
  /** XP granted today by step milestones (feeds XP Today / Daily XP Goal). */
  xpEarnedToday: number;
  activeKcal: number;
  totalKcal: number;
  kcalGoal: number;
  kcalPercent: number;
  trackingStatus: 'tracking' | 'denied' | 'unsupported' | 'starting';
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
    const mod = await import('@capgo/capacitor-pedometer');
    return mod.CapacitorPedometer ?? null;
  } catch {
    return null;
  }
}

/** Activity status line per selected Android sensor mode. */
function androidStatusMessage(mode: VjSensorMode): string {
  switch (mode) {
    case 'counter':
      return 'Step tracking active — hardware counter.';
    case 'detector':
      return 'Step tracking active — step detector.';
    case 'accelerometer':
      return 'Step tracking active — motion estimate (steps are estimated from accelerometer motion).';
    default:
      return 'No compatible step sensor found on this device.';
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

  const [state, setState] = useState<ActivityState>(() =>
    normalizeActivityState(readStoredJson<unknown>(STORAGE_KEY, null)),
  );
  const [trackingStatus, setTrackingStatus] =
    useState<ActivityContextValue['trackingStatus']>('starting');
  const [statusMessage, setStatusMessage] = useState('Connecting to step sensor…');
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

  const note = useCallback((message: string) => {
    debugRef.current.notes = [message, ...debugRef.current.notes].slice(0, 40);
    setDebugTick((t) => t + 1);
  }, []);

  const refreshDebug = useCallback(() => setDebugTick((t) => t + 1), []);

  // ── Persistence ────────────────────────────────────────────────────────
  useEffect(() => {
    writeStoredJson(STORAGE_KEY, state);
  }, [state]);

  // ── Body metrics for calorie estimation ────────────────────────────────
  const bodyProfileQuery = useQuery({
    queryKey: ['activity-body-profile'],
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
    if (!today) return;
    for (const milestone of pendingMilestones(today)) {
      const key = `${today.dateKey}:${milestone.steps}`;
      if (paidMilestonesRef.current.has(key)) continue;
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

  // ── Sensor session ─────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    const platform = Capacitor.getPlatform();

    if (platform === 'android') {
      setStepSource(null);
      return startAndroidTracking();
    }

    const plugin = await loadPedometer();
    pluginRef.current = plugin;

    if (!plugin) {
      setTrackingStatus('unsupported');
      setStatusMessage(
        'Live step tracking is unavailable on this device — showing last synced values.',
      );
      return;
    }

    try {
      const perm = await plugin.checkPermissions();
      const permStatus = String(perm.activityRecognition ?? 'unknown');
      note(`checkPermissions.activityRecognition: ${permStatus}`);

      let status = permStatus;
      if (status !== 'granted') {
        const requested = await plugin.requestPermissions();
        status = String(requested.activityRecognition ?? 'unknown');
        note(`requestPermissions.activityRecognition: ${status}`);
      }

      if (status === 'denied') {
        setTrackingStatus('denied');
        setStatusMessage(
          'Motion permission denied — enable Activity Recognition in system settings to track steps.',
        );
        return;
      }

      const availability = await plugin.isAvailable();
      const stepCounting = Boolean(availability.stepCounting);
      note(`isAvailable.stepCounting: ${stepCounting}`);

      if (!stepCounting) {
        setTrackingStatus('unsupported');
        setStatusMessage(
          'This device has no step-counting hardware — showing last synced values.',
        );
        return;
      }

      // Baseline = the day count before this sensor session. iOS can query the
      // true midnight→now total; Android sessions are relative to session start,
      // so the persisted last-synced value is the baseline.
      const isIos = platform === 'ios';
      let queriedSteps: number | null = null;
      let queriedDistance: number | null = null;
      if (isIos) {
        try {
          const midnight = new Date();
          midnight.setHours(0, 0, 0, 0);
          const measured = await plugin.getMeasurement({
            start: midnight.getTime(),
            end: Date.now(),
          });
          if (typeof measured.numberOfSteps === 'number') queriedSteps = measured.numberOfSteps;
          if (typeof measured.distance === 'number') queriedDistance = measured.distance;
          note(`iOS midnight query: steps=${queriedSteps}, distance=${queriedDistance}`);
        } catch (err) {
          note(`iOS midnight query failed: ${err}`);
        }
      }

      setState((prev) => {
        const now = new Date();
        const { state: rolled } = rollActivityDay(prev, now);
        const persistedSteps = rolled.today?.steps ?? 0;
        const persistedDistance = rolled.today?.distanceMeters ?? 0;
        const baseSteps = isIos ? Math.max(persistedSteps, queriedSteps ?? 0) : persistedSteps;
        const baseDistance = isIos
          ? Math.max(persistedDistance, queriedDistance ?? 0)
          : persistedDistance;
        return startSession(rolled, now, baseSteps, baseDistance);
      });

      await plugin.removeAllListeners();

      let listenerAdded = false;
      try {
        await plugin.addListener('measurement', (event) => {
          const now = new Date();
          const rawSteps = Number(event.numberOfSteps ?? 0);
          debugRef.current.lastMeasurementAtMs = now.getTime();
          debugRef.current.lastRawSteps = rawSteps;
          note(
            `measurement: numberOfSteps=${rawSteps}, distance=${event.distance}, startDate=${event.startDate}, endDate=${event.endDate}`,
          );
          setState((prev) =>
            applyMeasurement(prev, now, {
              steps: rawSteps,
              distanceMeters: event.distance,
              atMs: now.getTime(),
            }),
          );
        });
        listenerAdded = true;
        debugRef.current.listenerConnected = true;
        note("listener registered for 'measurement' events");
      } catch (err) {
        debugRef.current.lastError = `addListener failed: ${err}`;
        note(`listener registration failed: ${err}`);
      }

      let startOk = false;
      try {
        await plugin.startMeasurementUpdates();
        startOk = true;
        debugRef.current.sensorStarted = true;
        note('startMeasurementUpdates ok');
      } catch (err) {
        debugRef.current.lastError = `startMeasurementUpdates failed: ${err}`;
        note(`startMeasurementUpdates failed: ${err}`);
      }

      if (startOk && listenerAdded) {
        setTrackingStatus('tracking');
        setStatusMessage('Live step tracking active.');
        if (isIos) setStepSource('ios');
      } else {
        setTrackingStatus('unsupported');
        setStatusMessage('Live step tracking is unavailable — showing last synced values.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setTrackingStatus('unsupported');
      setStatusMessage('Live step tracking is unavailable — showing last synced values.');
      debugRef.current.lastError = message;
      note(`unexpected error during setup: ${message}`);
    }
  }, [note]);

  useEffect(() => {
    if (userId === null) return;
    void startTracking();
    return () => {
      const plugin = pluginRef.current;
      if (plugin) {
        void plugin.stopMeasurementUpdates().catch(() => {});
        void plugin.removeAllListeners().catch(() => {});
      }
      if (Capacitor.getPlatform() === 'android') {
        void vjStopUpdates().catch(() => {});
      }
      pluginRef.current = null;
    };
  }, [userId, startTracking]);

  async function startAndroidTracking() {
    setTrackingStatus('starting');
    setStatusMessage('Connecting to step sensor…');
    debugRef.current = { ...EMPTY_DEBUG, notes: [] };
    refreshDebug();

    let selectedMode: VjSensorMode = 'none';
    let startupOk = false;

    try {
      const pluginAvailable = vjPluginAvailable();
      debugRef.current.pluginAvailable = pluginAvailable;
      note(`VjPedometer plugin available: ${pluginAvailable}`);

      if (!pluginAvailable) {
        debugRef.current.lastError =
          'VjPedometer is not registered in the Capacitor native bridge for this build.';
        setTrackingStatus('unsupported');
        setStatusMessage(
          'Native step bridge is unavailable in this build — install a build that registers VjPedometer.',
        );
        return;
      }

      // 1. Which sensor did the native layer select? (counter → detector → accelerometer)
      const info = await vjGetSensorInfo();
      if (info) {
        selectedMode = info.mode;
        debugRef.current.sensorMode = info.mode;
        debugRef.current.sensorName = info.name || null;
        debugRef.current.sensorVendor = info.vendor || null;
        debugRef.current.sensorAvailable = info.available;
        if (info.debug === false) setShowDiagnostics(WEB_DEBUG_BUILD);
        note(
          `sensorInfo: mode=${info.mode}, available=${info.available}, name=${info.name}, vendor=${info.vendor}, type=${info.type}, debuggable=${info.debug}`,
        );
      } else {
        debugRef.current.lastError = 'getSensorInfo() returned nothing.';
        note('sensorInfo unavailable');
      }

      if (!info || !info.available || info.mode === 'none') {
        setTrackingStatus('unsupported');
        setStatusMessage('No compatible step sensor found on this device.');
        debugRef.current.lastError =
          debugRef.current.lastError ?? 'No compatible step sensor found on this device.';
        return;
      }

      // 2. Permission before any listener is registered.
      const perm = await vjCheckPermissions();
      const permStatus = perm?.activityRecognition ?? 'unknown';
      debugRef.current.permission = permStatus;
      note(`ACTIVITY_RECOGNITION permission: ${permStatus}`);

      if (permStatus !== 'granted') {
        const requested = await vjRequestPermissions();
        const afterStatus = requested?.activityRecognition ?? 'unknown';
        debugRef.current.permission = afterStatus;
        note(`requestPermissions.activityRecognition: ${afterStatus}`);
        if (afterStatus !== 'granted') {
          setTrackingStatus('denied');
          setStatusMessage(
            'Motion permission denied — enable Activity Recognition in system settings to track steps.',
          );
          return;
        }
      }

      // 3. Capacitor event listener BEFORE the sensor is started.
      let listenerAdded = false;
      try {
        await vjAddMeasurementListener((event) => {
          const now = new Date();
          debugRef.current.listenerConnected = true;
          debugRef.current.sensorStarted = true;
          debugRef.current.lastMeasurementAtMs = now.getTime();
          debugRef.current.lastRawSteps = event.rawValue;
          debugRef.current.lastDailySteps = event.steps;
          debugRef.current.sensorMode = event.mode;
          note(
            `measurement: mode=${event.mode}, raw=${event.rawValue}, steps=${event.steps}, ts=${event.timestamp}`,
          );
          // The native layer normalized its sensor data into today's total
          // steps (counter minus its baseline; detector/accelerometer counts),
          // so this is merged as a monotonic daily total — never as a delta,
          // which would double-count.
          setState((prev) => applyDailyTotal(prev, now, event.steps, now.getTime()));
        });
        listenerAdded = true;
        debugRef.current.listenerConnected = true;
        note("listener registered for 'measurement' events");
      } catch (err) {
        debugRef.current.lastError = `addListener failed: ${err}`;
        note(`listener registration failed: ${err}`);
      }

      // 4. Start the native sensor. registerListener results are reported by the
      //    plugin, and a rejection is surfaced instead of being swallowed.
      let startOk = false;
      try {
        await vjStartUpdates();
        startOk = true;
        note('startUpdates() resolved');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        debugRef.current.lastError = message;
        note(`startUpdates() rejected: ${message}`);
      }

      const native = await vjGetState();
      if (native) {
        debugRef.current.sensorAvailable = native.sensorAvailable;
        debugRef.current.listenerConnected =
          debugRef.current.listenerConnected || native.listenerRegistered;
        debugRef.current.sensorStarted = debugRef.current.sensorStarted || native.sensorStarted;
        debugRef.current.sensorMode = native.mode;
        selectedMode = native.mode;
        if (native.lastError) debugRef.current.lastError = native.lastError;
        note(
          `nativeState: mode=${native.mode}, available=${native.sensorAvailable}, listener=${native.listenerRegistered}, started=${native.sensorStarted}, dailySteps=${native.dailySteps}, firstRaw=${native.firstRaw}, lastRaw=${native.lastRaw}, error=${native.lastError ?? ''}`,
        );
      }

      startupOk = startOk && listenerAdded;
      if (startupOk) {
        setStepSource(selectedMode);
        setTrackingStatus('tracking');
        setStatusMessage(androidStatusMessage(selectedMode));
      } else {
        setTrackingStatus('unsupported');
        setStatusMessage(
          debugRef.current.lastError ??
            'Unable to start the Android step sensor listener on this device.',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      debugRef.current.lastError = message;
      setTrackingStatus('unsupported');
      setStatusMessage('Android step tracking failed to start — showing last synced values.');
      note(`unexpected error during Android setup: ${message}`);
    } finally {
      refreshDebug();
    }

    // 5. Never leave the screen on "Connecting…": if startup succeeded but no
    //    measurement has arrived yet, say exactly what we are waiting for.
    if (startupOk) {
      void (async () => {
        await new Promise((r) => setTimeout(r, STARTUP_WINDOW_MS));
        if (debugRef.current.lastMeasurementAtMs != null) return;
        if (!debugRef.current.sensorStarted && !debugRef.current.listenerConnected) return;
        if (selectedMode === 'accelerometer') {
          setStatusMessage(
            'Step tracking active — motion estimate. Start walking to see estimated steps.',
          );
        } else if (selectedMode === 'counter') {
          setStatusMessage('Waiting for Android step counter events — walk a few steps.');
        } else if (selectedMode === 'detector') {
          setStatusMessage('Waiting for Android step detector events — walk a few steps.');
        }
        note(`startup window (${STARTUP_WINDOW_MS}ms): no measurement event yet`);
      })();
    }
  }

  // ── Midnight rollover ticker (also corrects the day after resume) ──────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setState((prev) => rollActivityDay(prev, now).state);
    };
    tick();
    const interval = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  // ── Calories: persist recomputed estimates into the day record ─────────
  const liveCalories = useMemo(
    () =>
      estimateCalories(
        {
          steps: state.today?.steps ?? 0,
          distanceMeters: state.today?.distanceMeters ?? 0,
          activeSeconds: state.today?.activeSeconds ?? 0,
        },
        { ...bodyMetrics, ageYears },
        new Date(),
      ),
    [
      state.today?.steps,
      state.today?.distanceMeters,
      state.today?.activeSeconds,
      bodyMetrics,
      ageYears,
    ],
  );

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
    activeKcal: liveCalories.activeKcal,
    totalKcal: liveCalories.totalKcal,
    kcalGoal,
    kcalPercent,
    trackingStatus,
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
    throw new Error('useActivity must be used within an ActivityProvider');
  }
  return context;
}

/** Null-safe variant for surfaces rendered with or without the provider. */
export function useActivityOptional(): ActivityContextValue | null {
  return useContext(ActivityContext);
}
