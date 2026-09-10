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
  activeKcalGoal,
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
} from "../lib/activityTracker";

const STORAGE_KEY = "svj_activity_v1";
const MILESTONE_FEED_PREFIX = "Step Milestone";

type PedometerPlugin = import("@capgo/capacitor-pedometer").CapacitorPedometerPlugin;

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
  trackingStatus: "tracking" | "denied" | "unsupported" | "starting";
  statusMessage: string;
  lastSyncedAt: number | null;
  history7: DayPoint[];
  history30: DayPoint[];
  summary7: ReturnType<typeof summarizeHistory>;
  summary30: ReturnType<typeof summarizeHistory>;
  bodyMetrics: BodyMetrics;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

/** Safely import the native pedometer plugin (absent in some web bundles). */
async function loadPedometer(): Promise<PedometerPlugin | null> {
  try {
    const mod = await import("@capgo/capacitor-pedometer");
    return mod.CapacitorPedometer ?? null;
  } catch {
    return null;
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
    useState<ActivityContextValue["trackingStatus"]>("starting");
  const [statusMessage, setStatusMessage] = useState("Connecting to step sensor…");
  const pluginRef = useRef<PedometerPlugin | null>(null);
  /** StrictMode-safe guard: milestones already paid this instance, "dateKey:threshold". */
  const paidMilestonesRef = useRef<Set<string>>(new Set());

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
    const plugin = await loadPedometer();
    pluginRef.current = plugin;

    if (!plugin) {
      setTrackingStatus("unsupported");
      setStatusMessage(
        "Live step tracking is unavailable on this device — showing last synced values.",
      );
      return;
    }

    try {
      const perm = await plugin.checkPermissions();
      let status = perm.activityRecognition;
      if (status !== "granted") {
        const requested = await plugin.requestPermissions();
        status = requested.activityRecognition;
      }
      if (status === "denied") {
        setTrackingStatus("denied");
        setStatusMessage(
          "Motion permission denied — enable Activity Recognition in system settings to track steps.",
        );
        return;
      }

      const availability = await plugin.isAvailable();
      if (!availability.stepCounting) {
        setTrackingStatus("unsupported");
        setStatusMessage("This device has no step-counting hardware — showing last synced values.");
        return;
      }

      // Baseline = the day count before this sensor session. iOS can query the
      // true midnight→now total; Android sessions are relative to session start,
      // so the persisted last-synced value is the baseline.
      const isIos = Capacitor.getPlatform() === "ios";
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
          if (typeof measured.numberOfSteps === "number") queriedSteps = measured.numberOfSteps;
          if (typeof measured.distance === "number") queriedDistance = measured.distance;
        } catch {
          // Fall back to the persisted baseline when the query fails.
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
      await plugin.addListener("measurement", (event) => {
        const now = new Date();
        setState((prev) =>
          applyMeasurement(prev, now, {
            steps: event.numberOfSteps ?? 0,
            distanceMeters: event.distance,
            atMs: now.getTime(),
          }),
        );
      });
      await plugin.startMeasurementUpdates();

      setTrackingStatus("tracking");
      setStatusMessage("Live step tracking active.");
    } catch {
      setTrackingStatus("unsupported");
      setStatusMessage("Live step tracking is unavailable — showing last synced values.");
    }
  }, []);

  useEffect(() => {
    if (userId === null) return;
    void startTracking();
    return () => {
      const plugin = pluginRef.current;
      if (plugin) {
        void plugin.stopMeasurementUpdates().catch(() => {});
        void plugin.removeAllListeners().catch(() => {});
      }
      pluginRef.current = null;
    };
  }, [userId, startTracking]);

  // ── Midnight rollover ticker (also corrects the day after resume) ──────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setState((prev) => rollActivityDay(prev, now).state);
    };
    tick();
    const interval = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
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
    lastSyncedAt: state.lastSyncedAt,
    history7,
    history30,
    summary7,
    summary30,
    bodyMetrics: { ...bodyMetrics, ageYears },
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
