var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// mock:@capgo/capacitor-pedometer
var capacitor_pedometer_exports = {};
__export(capacitor_pedometer_exports, {
  CapacitorPedometer: () => CapacitorPedometer
});
var CapacitorPedometer;
var init_capacitor_pedometer = __esm({
  "mock:@capgo/capacitor-pedometer"() {
    CapacitorPedometer = new Proxy({}, { get: (_, key) => globalThis.__svjTracking.native[key] });
  }
});

// src/app/context/ActivityContext.tsx
import {
  createContext,
  useCallback as useCallback2,
  useContext,
  useEffect as useEffect3,
  useMemo,
  useRef as useRef3,
  useState as useState3
} from "react";

// mock:@capacitor/core
var Capacitor = { getPlatform: () => globalThis.__svjTracking?.platform ?? "android", isNativePlatform: () => globalThis.__svjTracking.platform !== "web", isPluginAvailable: (name) => globalThis.__svjTracking.available && (name !== "VjPedometer" || globalThis.__svjTracking.platform !== "ios" || globalThis.__svjTracking.iosVjBridge) };
var registerPlugin = () => new Proxy({}, { get: (_, key) => globalThis.__svjTracking.native[key] });

// mock:@capacitor/app
var App = { addListener: async (_, fn) => {
  globalThis.__svjTracking.appHandlers.add(fn);
  return { remove: async () => globalThis.__svjTracking.appHandlers.delete(fn) };
} };

// mock:@/integrations/supabase/client
var supabase = { rpc: (...a) => globalThis.__svjTracking.supabase.rpc(...a) };
var hasSupabaseConfig = () => globalThis.__svjTracking.supabase != null;
var getSupabaseConfig = () => ({});

// src/app/context/ActivityContext.tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";

// mock:@tanstack/react-start
var useServerFn = (fn) => fn;

// mock:@/lib/personalization.functions
var getBodyProfile = async () => globalThis.__svjTracking.profile;

// mock:./SVJContext
var awardXp = (xp) => globalThis.__svjTracking.xp.push(xp);
var addActivity = (...args) => globalThis.__svjTracking.feed.push(args);
var useSVJ = () => ({ awardXp, addActivity });

// src/app/lib/storage.ts
var STORAGE_ERROR = "Could not save on this device. Storage may be full or unavailable. Free some space, then try again.";
var appStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return { ok: true };
    } catch {
      return { ok: false, error: STORAGE_ERROR };
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      return { ok: true };
    } catch {
      return { ok: false, error: STORAGE_ERROR };
    }
  }
};
function readStoredJson(key, fallback) {
  const saved = appStorage.getItem(key);
  if (!saved) return fallback;
  try {
    return JSON.parse(saved);
  } catch {
    return fallback;
  }
}
function writeStoredJson(key, value) {
  try {
    return appStorage.setItem(key, JSON.stringify(value));
  } catch {
    return { ok: false, error: STORAGE_ERROR };
  }
}

// src/app/lib/liveSteps.ts
import { useEffect, useRef, useState } from "react";

// src/app/lib/activityTracker.ts
var STEP_GOAL = 1e4;
var STEP_MILESTONES = [
  { steps: 2500, xp: 40, label: "2.5K" },
  { steps: 5e3, xp: 60, label: "5K" },
  { steps: 7500, xp: 80, label: "7.5K" },
  { steps: 1e4, xp: 120, label: "10K" }
];
var ACTIVE_KCAL_GOAL_DEFAULT = 500;
var ACTIVITY_HISTORY_CAP = 60;
function dateKeyOf(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}
var nonNegative = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
function emptyActivityState() {
  return {
    version: 1,
    days: [],
    today: null,
    sessionRefSteps: 0,
    sessionRefDistance: 0,
    sessionLastSteps: 0,
    sessionLastDistance: 0,
    lastSyncedAt: null
  };
}
function normalizeActivityState(value) {
  const base = emptyActivityState();
  if (!value || typeof value !== "object") return base;
  const saved = value;
  const days = Array.isArray(saved.days) ? saved.days.filter((d) => !!d && typeof d.dateKey === "string").map((d) => ({
    dateKey: d.dateKey,
    steps: nonNegative(d.steps),
    trackedSteps: nonNegative(d.trackedSteps),
    trackedDistanceMeters: nonNegative(d.trackedDistanceMeters),
    trackedActiveSeconds: nonNegative(d.trackedActiveSeconds),
    priorActiveKcal: nonNegative(
      d.priorActiveKcal,
      d.trackedSteps == null ? nonNegative(d.activeKcal) : 0
    ),
    distanceMeters: nonNegative(d.distanceMeters),
    activeSeconds: nonNegative(d.activeSeconds),
    activeKcal: nonNegative(d.activeKcal),
    totalKcal: nonNegative(d.totalKcal),
    xpMilestones: Array.isArray(d.xpMilestones) ? d.xpMilestones.filter((m) => typeof m === "number") : []
  })).slice(-ACTIVITY_HISTORY_CAP) : [];
  const today = saved.today && typeof saved.today.dateKey === "string" ? {
    dateKey: saved.today.dateKey,
    steps: nonNegative(saved.today.steps),
    trackedSteps: nonNegative(saved.today.trackedSteps),
    trackedDistanceMeters: nonNegative(saved.today.trackedDistanceMeters),
    trackedActiveSeconds: nonNegative(saved.today.trackedActiveSeconds),
    priorActiveKcal: nonNegative(
      saved.today.priorActiveKcal,
      saved.today.trackedSteps == null ? nonNegative(saved.today.activeKcal) : 0
    ),
    distanceMeters: nonNegative(saved.today.distanceMeters),
    activeSeconds: nonNegative(saved.today.activeSeconds),
    activeKcal: nonNegative(saved.today.activeKcal),
    totalKcal: nonNegative(saved.today.totalKcal),
    xpMilestones: Array.isArray(saved.today.xpMilestones) ? saved.today.xpMilestones.filter((m) => typeof m === "number") : []
  } : null;
  return {
    version: 1,
    days,
    today,
    sessionRefSteps: nonNegative(saved.sessionRefSteps),
    sessionRefDistance: nonNegative(saved.sessionRefDistance),
    sessionLastSteps: nonNegative(saved.sessionLastSteps),
    sessionLastDistance: nonNegative(saved.sessionLastDistance),
    lastSyncedAt: typeof saved.lastSyncedAt === "number" ? saved.lastSyncedAt : null
  };
}
function rollActivityDay(state, now) {
  const key = dateKeyOf(now);
  if (state.today && state.today.dateKey === key) return { state, rolled: false };
  const days = state.today ? [...state.days, state.today].slice(-ACTIVITY_HISTORY_CAP) : state.days;
  const refSteps = nonNegative(state.sessionLastSteps);
  const refDistance = nonNegative(state.sessionLastDistance);
  return {
    state: {
      ...state,
      days,
      today: freshDayRecord(key),
      sessionRefSteps: refSteps,
      sessionRefDistance: refDistance
    },
    rolled: true
  };
}
function freshDayRecord(dateKey) {
  return {
    dateKey,
    steps: 0,
    trackedSteps: 0,
    trackedDistanceMeters: 0,
    trackedActiveSeconds: 0,
    priorActiveKcal: 0,
    distanceMeters: 0,
    activeSeconds: 0,
    activeKcal: 0,
    totalKcal: 0,
    xpMilestones: []
  };
}
function applyMeasurement(state, now, measurement) {
  const { state: rolled } = rollActivityDay(state, now);
  const today = rolled.today ?? freshDayRecord(dateKeyOf(now));
  const reading = nonNegative(measurement.steps);
  const lastReading = nonNegative(rolled.sessionLastSteps);
  const deltaSteps = Math.max(0, reading - lastReading);
  const steps = today.steps + deltaSteps;
  const distance = measurement.distanceMeters != null ? today.distanceMeters + Math.max(
    0,
    nonNegative(measurement.distanceMeters) - nonNegative(rolled.sessionLastDistance)
  ) : today.distanceMeters;
  const atMs = measurement.atMs ?? now.getTime();
  const elapsedSinceSync = rolled.lastSyncedAt ? Math.min((atMs - rolled.lastSyncedAt) / 1e3, 120) : 0;
  const activeSeconds = deltaSteps > 0 ? today.activeSeconds + Math.max(0, elapsedSinceSync) : today.activeSeconds;
  const nextToday = { ...today, steps, distanceMeters: distance, activeSeconds };
  return {
    ...rolled,
    today: nextToday,
    sessionLastSteps: reading,
    sessionLastDistance: measurement.distanceMeters != null ? nonNegative(measurement.distanceMeters) : rolled.sessionLastDistance,
    lastSyncedAt: atMs
  };
}
function startSession(state, now, baselineSteps, baselineDistance = 0) {
  const { state: rolled } = rollActivityDay(state, now);
  const today = rolled.today ?? freshDayRecord(dateKeyOf(now));
  const steps = Math.max(today.steps, nonNegative(baselineSteps));
  const distance = Math.max(today.distanceMeters, nonNegative(baselineDistance));
  return {
    ...rolled,
    today: steps !== today.steps || distance !== today.distanceMeters ? { ...today, steps, distanceMeters: distance } : today,
    sessionRefSteps: steps,
    sessionRefDistance: distance,
    sessionLastSteps: 0,
    sessionLastDistance: 0
  };
}
function startTrackedSession(state, now) {
  return { ...startSession(state, now, 0), lastSyncedAt: now.getTime() };
}
function applyTrackedMeasurement(state, now, measurement) {
  const atMs = measurement.atMs === void 0 ? now.getTime() : measurement.atMs;
  if (!Number.isSafeInteger(measurement.steps) || measurement.steps < 0 || measurement.steps < state.sessionLastSteps || measurement.distanceMeters !== void 0 && (!Number.isFinite(measurement.distanceMeters) || measurement.distanceMeters < 0) || !Number.isSafeInteger(atMs) || !Number.isFinite(now.getTime()) || !Number.isFinite(new Date(atMs).getTime()) || state.lastSyncedAt != null && atMs < state.lastSyncedAt) {
    return state;
  }
  const delta = measurement.steps - state.sessionLastSteps;
  const rolled = rollActivityDay(state, now).state;
  const next = applyMeasurement(rolled, now, {
    ...measurement,
    distanceMeters: measurement.distanceMeters == null ? void 0 : Math.max(state.sessionLastDistance, nonNegative(measurement.distanceMeters))
  });
  if (!next.today) return next;
  return {
    ...next,
    today: {
      ...next.today,
      trackedSteps: (rolled.today?.trackedSteps ?? 0) + delta,
      trackedDistanceMeters: (rolled.today?.trackedDistanceMeters ?? 0) + next.today.distanceMeters - (rolled.today?.distanceMeters ?? 0),
      trackedActiveSeconds: (rolled.today?.trackedActiveSeconds ?? 0) + next.today.activeSeconds - (rolled.today?.activeSeconds ?? 0)
    }
  };
}
function pendingTrackedMilestones(record) {
  return pendingMilestones(record ? { ...record, steps: record.trackedSteps ?? 0 } : null);
}
function pendingMilestones(record) {
  if (!record) return [];
  const claimed = new Set(record.xpMilestones);
  return STEP_MILESTONES.filter((m) => !claimed.has(m.steps) && record.steps >= m.steps);
}
function claimMilestone(state, now, threshold) {
  const key = dateKeyOf(now);
  const today = state.today?.dateKey === key ? state.today : freshDayRecord(key);
  if (today.xpMilestones.includes(threshold)) return state;
  return { ...state, today: { ...today, xpMilestones: [...today.xpMilestones, threshold] } };
}
function milestoneXpClaimed(record) {
  if (!record) return 0;
  const xpBySteps = new Map(STEP_MILESTONES.map((m) => [m.steps, m.xp]));
  return record.xpMilestones.reduce((sum, steps) => sum + (xpBySteps.get(steps) ?? 0), 0);
}
function estimateBmr(metrics) {
  if (metrics.bmr && metrics.bmr > 0) return Math.round(metrics.bmr);
  const weight = nonNegative(metrics.weightKg, 70);
  const height = nonNegative(metrics.heightCm, 170);
  const age = nonNegative(metrics.ageYears, 25);
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(metrics.sex?.toLowerCase() === "male" ? base + 5 : base - 161);
}
function estimateStrideMeters(metrics) {
  const height = nonNegative(metrics.heightCm, 0);
  return height > 0 ? height * 414e-5 : 0.71;
}
function estimateCalories(day, metrics, now) {
  const steps = nonNegative(day.steps);
  if (steps === 0) {
    const bmr2 = estimateBmr(metrics);
    const hoursElapsed2 = now.getHours() + now.getMinutes() / 60 || 1;
    return { activeKcal: 0, totalKcal: Math.round(bmr2 / 24 * hoursElapsed2) };
  }
  const weight = nonNegative(metrics.weightKg, 70);
  const stride = estimateStrideMeters(metrics);
  const walkedMeters = day.distanceMeters > 0 ? day.distanceMeters : steps * stride;
  const activeHours = Math.max(0, nonNegative(day.activeSeconds) / 3600);
  let activeKcal;
  if (activeHours > 1 / 60 && walkedMeters > 0) {
    const speed = walkedMeters / activeHours / 3600;
    const met = Math.min(6, Math.max(2.8, 2.2 + speed * 1.1));
    activeKcal = met * weight * activeHours;
  } else {
    activeKcal = walkedMeters / 1e3 * weight * 0.53;
  }
  const bmr = estimateBmr(metrics);
  const hoursElapsed = now.getHours() + now.getMinutes() / 60 || 1;
  const totalKcal = activeKcal + bmr / 24 * hoursElapsed;
  return { activeKcal: Math.round(activeKcal), totalKcal: Math.round(totalKcal) };
}
function activeKcalGoal(metrics) {
  const target = nonNegative(metrics.dailyCalorieTarget, 0);
  return target > 0 ? Math.max(250, Math.round(target * 0.25)) : ACTIVE_KCAL_GOAL_DEFAULT;
}
function buildHistory(state, now, count) {
  const today = state.today ?? freshDayRecord(dateKeyOf(now));
  const live = {
    dateKey: today.dateKey,
    label: today.dateKey.slice(5),
    steps: today.steps,
    activeKcal: today.activeKcal,
    totalKcal: today.totalKcal
  };
  const archived = state.days.filter((d) => d.dateKey !== today.dateKey).slice(-Math.max(0, count - 1)).map((d) => ({
    dateKey: d.dateKey,
    label: d.dateKey.slice(5),
    steps: d.steps,
    activeKcal: d.activeKcal,
    totalKcal: d.totalKcal
  }));
  return [...archived, live].slice(-count);
}
function summarizeHistory(history) {
  if (history.length === 0) return { averageSteps: 0, bestDay: null, averageActiveKcal: 0 };
  const totalSteps = history.reduce((sum, d) => sum + d.steps, 0);
  const totalKcal = history.reduce((sum, d) => sum + d.activeKcal, 0);
  const bestDay = history.reduce(
    (best, d) => !best || d.steps > best.steps ? d : best,
    null
  );
  return {
    averageSteps: Math.round(totalSteps / history.length),
    bestDay,
    averageActiveKcal: Math.round(totalKcal / history.length)
  };
}

// src/app/lib/liveSteps.ts
function usePublishLiveSteps(userId, dateKey, steps, distanceMeters) {
  const latest = useRef({ userId, dateKey, steps, distanceMeters });
  latest.current = { userId, dateKey, steps, distanceMeters };
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState(null);
  useEffect(() => {
    setLastSuccessfulSyncAt(null);
    if (!userId || !dateKey || !Capacitor.isNativePlatform() || !hasSupabaseConfig()) return;
    let cancelled = false;
    let timer = null;
    let controller = null;
    let sent = "";
    let attempts = 0;
    const schedule = (delay = 3e3) => {
      if (cancelled || document.hidden || navigator.onLine === false || timer || controller) return;
      timer = setTimeout(() => {
        timer = null;
        void publish2();
      }, delay);
    };
    const publish2 = async () => {
      const v = latest.current;
      if (cancelled || document.hidden || navigator.onLine === false || v.userId !== userId || v.dateKey !== dateKey)
        return;
      const key = `${userId}:${dateKey}:${v.steps}:${v.distanceMeters}`;
      if (key === sent) return;
      controller = new AbortController();
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user.id !== userId || cancelled || document.hidden) return;
        const { error } = await supabase.from("svj_live_daily_steps").upsert({
          user_id: userId,
          date_key: dateKey,
          steps: Math.max(0, Math.min(2e5, Math.round(v.steps))),
          distance_meters: Math.max(0, v.distanceMeters),
          source: Capacitor.getPlatform(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).setHeader("Authorization", `Bearer ${data.session.access_token}`).abortSignal(controller.signal);
        if (error) throw error;
        if (!cancelled) {
          sent = key;
          attempts = 0;
          setLastSuccessfulSyncAt(Date.now());
        }
      } catch {
        attempts = Math.min(5, attempts + 1);
      } finally {
        controller = null;
        schedule(Math.min(6e4, 3e3 * 2 ** attempts));
      }
    };
    const wake = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
        controller?.abort();
      } else schedule(0);
    };
    const poll = setInterval(() => schedule(), 3e3);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [userId, dateKey]);
  return lastSuccessfulSyncAt;
}
function useRemoteLiveSteps(userId) {
  const [live, setLive] = useState(null);
  const [day, setDay] = useState(() => dateKeyOf(/* @__PURE__ */ new Date()));
  useEffect(() => {
    const checkDay = () => setDay(dateKeyOf(/* @__PURE__ */ new Date()));
    const timer = setInterval(checkDay, 1e4);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, []);
  useEffect(() => {
    setLive(null);
    if (!userId || Capacitor.getPlatform() !== "web" || !hasSupabaseConfig()) return;
    let cancelled = false;
    const apply = (row) => {
      if (cancelled || !row || row.date_key !== day) return;
      setLive({
        steps: Number(row.steps) || 0,
        distanceMeters: Number(row.distance_meters) || 0,
        updatedAt: row.updated_at
      });
    };
    const read = () => {
      void supabase.from("svj_live_daily_steps").select("date_key, steps, distance_meters, updated_at").eq("user_id", userId).eq("date_key", day).maybeSingle().then(
        ({ data }) => apply(data),
        () => void 0
      );
    };
    const wake = () => {
      if (!document.hidden) read();
    };
    read();
    const channel = supabase.channel(`live-steps-${userId}-${day}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "svj_live_daily_steps",
        filter: `user_id=eq.${userId}`
      },
      (payload) => apply(payload.new)
    ).subscribe();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [userId, day]);
  return live;
}

// src/app/lib/dailyTracking.ts
import { useCallback, useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";

// src/app/lib/healthConnect.ts
var HEALTH_CONNECT_PLUGIN_NAME = "VjHealthConnect";
var HEALTH_CONNECT_TYPES = [
  "steps",
  "distance",
  "exerciseSessions",
  "heartRate",
  "restingHeartRate",
  "sleep",
  "calories",
  "weight"
];
var DEFAULT_HEALTH_CONNECT_TYPES = [
  "exerciseSessions",
  "steps",
  "distance",
  "heartRate",
  "calories"
];
function healthConnectPlugin() {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(HEALTH_CONNECT_PLUGIN_NAME))
    return null;
  try {
    return registerPlugin(HEALTH_CONNECT_PLUGIN_NAME);
  } catch {
    return null;
  }
}
function healthConnectAvailable() {
  const plugin = healthConnectPlugin();
  return Boolean(plugin && typeof plugin.readRecords === "function");
}
function normalizePermission(value) {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  if (value === "prompt" || value === "prompt-with-rationale") return "prompt";
  return "unavailable";
}
function normalizeHealthConnectPermissions(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = {};
  for (const type of HEALTH_CONNECT_TYPES) {
    result[type] = normalizePermission(source[type]);
  }
  return result;
}
async function checkHealthConnectPermissions(types = DEFAULT_HEALTH_CONNECT_TYPES) {
  const plugin = healthConnectPlugin();
  if (!plugin?.checkPermissions) return normalizeHealthConnectPermissions({});
  try {
    return normalizeHealthConnectPermissions(await plugin.checkPermissions({ types: [...types] }));
  } catch {
    return normalizeHealthConnectPermissions({});
  }
}
async function requestHealthConnectPermissions(types = DEFAULT_HEALTH_CONNECT_TYPES) {
  const plugin = healthConnectPlugin();
  if (!plugin?.requestPermissions) return checkHealthConnectPermissions(types);
  try {
    return normalizeHealthConnectPermissions(
      await plugin.requestPermissions({ types: [...types] })
    );
  } catch {
    return checkHealthConnectPermissions(types);
  }
}
async function hasGranted(type) {
  const permissions = await checkHealthConnectPermissions([type]);
  return permissions[type] === "granted";
}

// src/app/lib/dailyTracking.ts
var DailyPedometer = registerPlugin("VjPedometer");
function localDateKey(now = /* @__PURE__ */ new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function validateDailyState(raw, ownerId) {
  if (raw.version !== 2 || raw.ownerId !== ownerId || !Number.isSafeInteger(raw.steps) || raw.steps < 0 || typeof raw.enabled !== "boolean" || typeof raw.available !== "boolean" || typeof raw.listening !== "boolean" || !["granted", "denied", "prompt", "unavailable"].includes(raw.permission) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.dateKey) || typeof raw.source !== "string" || raw.measurementAt != null && (!Number.isFinite(raw.measurementAt) || raw.measurementAt <= 0))
    throw new Error("Update the SVJ app to enable reliable daily tracking.");
  return {
    ...raw,
    raw: raw.raw != null && Number.isFinite(raw.raw) && raw.raw >= 0 ? raw.raw : null
  };
}
function useDailyTracking(ownerId) {
  const [state, setState] = useState2(null);
  const [error, setError] = useState2(null);
  const [waiting, setWaiting] = useState2(false);
  const owner = useRef2(ownerId);
  owner.current = ownerId;
  const enabledAt = useRef2(0);
  const native = Capacitor.isNativePlatform();
  const refresh = useCallback(async () => {
    if (!native || !ownerId || document.hidden) return;
    try {
      const next = validateDailyState(await DailyPedometer.getDailyState({ ownerId }), ownerId);
      try {
        if (Capacitor.getPlatform() === "android" && appStorage.getItem(`svj.steps.health.${ownerId}`) === "enabled" && (!next.available || !next.listening || !next.measurementAt || Date.now() - next.measurementAt > 6e4) && await hasGranted("steps")) {
          const aggregate = await healthConnectPlugin()?.readDailySteps?.();
          if (aggregate && aggregate.dateKey === localDateKey() && Number.isSafeInteger(aggregate.steps) && aggregate.steps >= 0) {
            Object.assign(next, {
              steps: aggregate.steps,
              source: "Health Connect daily total",
              available: true,
              enabled: true,
              listening: false,
              measurementAt: aggregate.measurementAt,
              raw: null,
              permission: "granted",
              error: null
            });
          }
        }
      } catch {
        next.error ??= "Step history backup is unavailable. Retry or check Health Connect permission.";
      }
      if (owner.current !== ownerId) return;
      setState(next);
      setError(next.error);
      setWaiting(next.enabled && !next.measurementAt && Date.now() - enabledAt.current >= 1e4);
    } catch {
      if (owner.current === ownerId)
        setError("Update the SVJ app to use daily tracking, then try again.");
    }
  }, [native, ownerId]);
  useEffect2(() => {
    setState(null);
    setError(null);
    if (!native) return;
    if (!ownerId) {
      void DailyPedometer.disableDailyTracking().catch(() => void 0);
      return;
    }
    enabledAt.current = Date.now();
    void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(onVisible, 3e3);
    document.addEventListener("visibilitychange", onVisible);
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void listener.then((h) => h.remove()).catch(() => void 0);
    };
  }, [native, ownerId, refresh]);
  const enable = useCallback(async () => {
    if (!ownerId) return;
    setError(null);
    enabledAt.current = Date.now();
    try {
      const next = validateDailyState(
        await DailyPedometer.enableDailyTracking({ ownerId }),
        ownerId
      );
      if (owner.current === ownerId) setState(next);
    } catch {
      if (owner.current === ownerId)
        setError("Could not enable daily steps. Check Motion permission in Settings and retry.");
    }
  }, [ownerId]);
  const disable = useCallback(async () => {
    try {
      await DailyPedometer.disableDailyTracking();
      if (ownerId) {
        const removed = appStorage.removeItem(`svj.steps.health.${ownerId}`);
        if (!removed.ok) throw new Error(removed.error);
      }
      await refresh();
    } catch {
      setError("Could not confirm tracking stopped. Open SVJ and try again.");
    }
  }, [refresh, ownerId]);
  const enableHealthFallback = useCallback(async () => {
    if (!ownerId) return;
    try {
      const permission = await requestHealthConnectPermissions(["steps"]);
      if (permission.steps !== "granted") throw new Error("Permission required");
      const saved = appStorage.setItem(`svj.steps.health.${ownerId}`, "enabled");
      if (!saved.ok) throw new Error(saved.error);
      await refresh();
    } catch {
      setError(
        "Health Connect step history is unavailable. Connect a supported source and allow Steps permission."
      );
    }
  }, [ownerId, refresh]);
  return { state, error, waiting, enable, disable, refresh, native, enableHealthFallback };
}

// src/app/lib/vj-pedometer.ts
function vjValidateMeasurement(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid pedometer measurement: expected an object.");
  const { numberOfSteps, distance } = value;
  if (typeof numberOfSteps !== "number" || !Number.isSafeInteger(numberOfSteps) || numberOfSteps < 0)
    throw new TypeError("Invalid numberOfSteps: expected a non-negative safe integer.");
  if (distance !== void 0 && (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0))
    throw new TypeError("Invalid distance: expected a finite non-negative number.");
  return distance === void 0 ? { numberOfSteps } : { numberOfSteps, distance };
}
var VjPedometer = registerPlugin("VjPedometer");
var VJ_NATIVE_UPDATE_MESSAGE = "Close SVJ and install the latest Android app to use step tracking.";
var VjNativeUpdateRequiredError = class extends Error {
  constructor() {
    super(VJ_NATIVE_UPDATE_MESSAGE);
    this.name = "VjNativeUpdateRequiredError";
  }
};
function isMissingNativeMethod(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "UNIMPLEMENTED";
}
async function vjStartTracking(sessionId) {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  try {
    return await VjPedometer.startTracking({ sessionId });
  } catch (error) {
    if (isMissingNativeMethod(error)) throw new VjNativeUpdateRequiredError();
    throw error;
  }
}
async function vjStopTracking() {
  if (!vjPluginAvailable()) return null;
  try {
    return requireStoppedState(await VjPedometer.stopTracking());
  } catch (error) {
    if (!isMissingNativeMethod(error)) throw error;
  }
  try {
    await VjPedometer.stopUpdates();
    const state = requireStoppedState(await VjPedometer.getState(), true);
    return { ...state, requiresAppUpdate: true };
  } catch (error) {
    if (isMissingNativeMethod(error)) throw new VjNativeUpdateRequiredError();
    throw error;
  }
}
function requireStoppedState(state, legacy = false) {
  if (!state || state.listenerRegistered !== false || state.sensorStarted !== false || state.trackingRequested === true || state.trackingActive === true || !legacy && (state.listenerRemoved !== true || state.trackingRequested !== false || state.trackingActive !== false)) {
    throw new Error("The native sensor did not confirm that its listener was removed.");
  }
  return state;
}
function vjPluginAvailable() {
  return Capacitor.isPluginAvailable("VjPedometer");
}
async function vjCheckPermissions() {
  if (!vjPluginAvailable()) return null;
  try {
    return await VjPedometer.checkPermissions();
  } catch (err) {
    console.warn("[SVJ.VjPedometer] checkPermissions error:", err);
    return null;
  }
}
async function vjRequestPermissions() {
  if (!vjPluginAvailable()) return null;
  try {
    return await VjPedometer.requestPermissions();
  } catch (err) {
    console.warn("[SVJ.VjPedometer] requestPermissions error:", err);
    return null;
  }
}
async function vjGetState() {
  if (!vjPluginAvailable()) return null;
  try {
    return await VjPedometer.getState();
  } catch (err) {
    console.warn("[SVJ.VjPedometer] getState error:", err);
    return null;
  }
}
async function vjGetSensorInfo() {
  if (!vjPluginAvailable()) return null;
  try {
    return await VjPedometer.getSensorInfo();
  } catch (err) {
    console.warn("[SVJ.VjPedometer] getSensorInfo error:", err);
    return null;
  }
}
async function vjAddMeasurementListener(handler) {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  const handle = await VjPedometer.addListener("measurement", handler);
  return ownedCleanup(handle);
}
async function vjAddTrackingStateListener(handler) {
  if (!vjPluginAvailable()) throw new Error("VjPedometer plugin unavailable");
  return ownedCleanup(await VjPedometer.addListener("trackingStateChanged", handler));
}
function ownedCleanup(handle) {
  let removed = false;
  return async () => {
    if (removed) return;
    await handle.remove();
    removed = true;
  };
}

// src/app/lib/serverActivities.ts
var ACTIVITY_TYPES = [
  "walking",
  "running",
  "strength",
  "cycling",
  "football",
  "calisthenics",
  "hiit",
  "yoga",
  "other"
];
var ACTIVITY_SOURCES = [
  "svj_native",
  "manual",
  "strength_log",
  "health_connect",
  "wear_os"
];
var ACTIVITY_TYPE_LABELS = {
  walking: "Walking",
  running: "Running",
  strength: "Strength",
  cycling: "Cycling",
  football: "Football",
  calisthenics: "Calisthenics",
  hiit: "HIIT",
  yoga: "Yoga",
  other: "Other"
};
var MIN_SESSION_ID_LENGTH = 8;
var MAX_SESSION_ID_LENGTH = 100;
function buildClientSessionId(now = /* @__PURE__ */ new Date(), entropy = Math.random()) {
  const stamp = now.getTime().toString(36);
  const rand = Math.floor(entropy * 4294967295).toString(36).padStart(7, "0");
  return `svj-${stamp}-${rand}`;
}
function clampInt(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.round(value);
  return int >= min && int <= max ? int : null;
}
function isValidActivityType(value) {
  return typeof value === "string" && ACTIVITY_TYPES.includes(value);
}
function validateCompletedSession(payload, nowMs = Date.now()) {
  const session = typeof payload.clientSessionId === "string" ? payload.clientSessionId.trim() : "";
  if (session.length < MIN_SESSION_ID_LENGTH || session.length > MAX_SESSION_ID_LENGTH)
    return "This session cannot be saved. Start a new activity.";
  if (!isValidActivityType(payload.activityType)) return "Choose an activity type.";
  if (!Number.isFinite(payload.startedAtMs) || !Number.isFinite(payload.endedAtMs))
    return "Activity times are invalid.";
  if (payload.endedAtMs <= payload.startedAtMs) return "Activity end must be after its start.";
  if (payload.endedAtMs > nowMs + 5 * 6e4) return "Activity end time cannot be in the future.";
  if (clampInt(payload.durationSeconds, 1, 86400) === null)
    return "Activity duration is out of range.";
  const elapsed = Math.round((payload.endedAtMs - payload.startedAtMs) / 1e3);
  if (payload.durationSeconds > elapsed + 120) return "Activity duration exceeds its time span.";
  if (clampInt(payload.stepCount, 0, 5e5) === null) return "Step count is out of range.";
  if (payload.distanceMeters !== void 0 && (typeof payload.distanceMeters !== "number" || !Number.isFinite(payload.distanceMeters) || payload.distanceMeters < 0 || payload.distanceMeters > 5e5))
    return "Distance value is invalid.";
  if (payload.caloriesEstimate !== void 0 && (typeof payload.caloriesEstimate !== "number" || !Number.isFinite(payload.caloriesEstimate) || payload.caloriesEstimate < 0 || payload.caloriesEstimate > 2e4))
    return "Calorie value is invalid.";
  return null;
}
function validateManualActivity(payload, nowMs = Date.now()) {
  const session = typeof payload.clientSessionId === "string" ? payload.clientSessionId.trim() : "";
  if (session.length < MIN_SESSION_ID_LENGTH || session.length > MAX_SESSION_ID_LENGTH)
    return "Could not generate a stable session id.";
  if (!isValidActivityType(payload.activityType)) return "Choose an activity type.";
  if (!Number.isFinite(payload.startedAtMs) || !Number.isFinite(payload.endedAtMs))
    return "Activity times are invalid.";
  if (payload.endedAtMs <= payload.startedAtMs) return "End must be after start.";
  if (payload.endedAtMs > nowMs + 5 * 6e4) return "End time cannot be in the future.";
  if (clampInt(payload.durationSeconds, 1, 86400) === null)
    return "Duration must be between 1 minute and 24 hours (in seconds).";
  const elapsed = Math.round((payload.endedAtMs - payload.startedAtMs) / 1e3);
  if (payload.durationSeconds > elapsed + 120) return "Duration exceeds the time span.";
  if (payload.perceivedEffort !== void 0 && clampInt(payload.perceivedEffort, 1, 10) === null)
    return "Perceived effort must be 1\u201310.";
  if (payload.notes != null && (typeof payload.notes !== "string" || payload.notes.length > 500))
    return "Notes are limited to 500 characters.";
  return null;
}
function normalizeServerActivity(value) {
  if (!value || typeof value !== "object") return null;
  const row = value;
  const id = typeof row.id === "string" ? row.id : null;
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  const session = typeof row.client_session_id === "string" ? row.client_session_id : null;
  if (!id || !userId || !session) return null;
  if (!isValidActivityType(row.activity_type)) return null;
  if (typeof row.source !== "string" || !ACTIVITY_SOURCES.includes(row.source))
    return null;
  if (typeof row.started_at !== "string" || typeof row.ended_at !== "string") return null;
  if (typeof row.duration_seconds !== "number") return null;
  const num4 = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    id,
    userId,
    clientSessionId: session,
    activityType: row.activity_type,
    source: row.source,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    stepCount: num4(row.step_count) ?? 0,
    distanceMeters: num4(row.distance_meters),
    caloriesEstimate: num4(row.calories_estimate),
    perceivedEffort: num4(row.perceived_effort),
    notes: typeof row.notes === "string" && row.notes.length > 0 ? row.notes : null,
    visibility: row.visibility === "friends" || row.visibility === "community" ? row.visibility : "private",
    createdAt: typeof row.created_at === "string" ? row.created_at : row.ended_at,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.ended_at
  };
}
async function saveServerActivity(callRpc, payload, nowMs = Date.now(), options = {}) {
  const isManual = options.source === "manual" || !("stepCount" in payload) && !("distanceMeters" in payload) && !("caloriesEstimate" in payload);
  const validationError = isManual ? validateManualActivity(payload, nowMs) : validateCompletedSession(payload, nowMs);
  if (validationError) return { ok: false, error: validationError };
  const common = {
    p_client_session_id: payload.clientSessionId.trim(),
    p_activity_type: payload.activityType,
    p_started_at: new Date(payload.startedAtMs).toISOString(),
    p_ended_at: new Date(payload.endedAtMs).toISOString(),
    p_duration_seconds: Math.round(payload.durationSeconds)
  };
  const rpcPayload = isManual ? {
    ...common,
    p_source: "manual",
    p_step_count: 0,
    p_distance_meters: null,
    p_calories_estimate: null,
    p_perceived_effort: payload.perceivedEffort ?? null,
    p_notes: payload.notes?.trim() ? payload.notes.trim() : null
  } : {
    ...common,
    p_source: "svj_native",
    p_step_count: Math.round(payload.stepCount),
    p_distance_meters: payload.distanceMeters ?? null,
    p_calories_estimate: payload.caloriesEstimate ?? null
  };
  try {
    const { data, error } = await callRpc(rpcPayload);
    if (error) return { ok: false, error: error.message || "Couldn't save activity." };
    const envelope = data;
    if (!envelope || envelope.ok !== true || typeof envelope.activity !== "object")
      return { ok: false, error: "The server rejected this activity." };
    const activity = normalizeServerActivity(envelope.activity);
    if (!activity) return { ok: false, error: "The server returned an unreadable activity." };
    return { ok: true, duplicate: envelope.duplicate === true, activity, rawData: data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error while saving."
    };
  }
}
async function listServerActivities(callRpc) {
  try {
    const { data, error } = await callRpc();
    if (error)
      return { ok: false, activities: [], error: error.message || "Couldn't load history." };
    if (!Array.isArray(data))
      return { ok: false, activities: [], error: "Unexpected history response." };
    const activities = data.map((row) => normalizeServerActivity(row)).filter((a) => a !== null);
    return { ok: true, activities };
  } catch (error) {
    return {
      ok: false,
      activities: [],
      error: error instanceof Error ? error.message : "Network error while loading history."
    };
  }
}
function formatDurationLabel(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor(safe % 3600 / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} hr`;
  return `${m} min`;
}
function formatActivityDate(iso, now = /* @__PURE__ */ new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const todayKey = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === todayKey) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// src/app/lib/goalsRecords.ts
var ACTIVITY_GOAL_METRICS = [
  "workout_count",
  "step_total",
  "active_minutes",
  "distance"
];
var RECOVERY_GOAL_METRICS = [
  "recovery_checkin_count",
  "sleep_7h_day_count",
  "rest_day_count",
  "readiness_60_day_count"
];
var GOAL_METRICS = [...ACTIVITY_GOAL_METRICS, ...RECOVERY_GOAL_METRICS];
var GOAL_PERIODS = ["weekly", "monthly"];
var TRAINING_RECORD_TYPES = [
  "most_steps_in_activity",
  "longest_activity_duration",
  "longest_distance"
];
var GOAL_METRIC_LABELS = {
  workout_count: "Workouts",
  step_total: "Steps",
  active_minutes: "Active Minutes",
  distance: "Distance",
  recovery_checkin_count: "Recovery Check-ins",
  sleep_7h_day_count: "7h+ Sleep Days",
  rest_day_count: "Rest Days",
  readiness_60_day_count: "Ready Days (60+)"
};
var TRAINING_RECORD_LABELS = {
  most_steps_in_activity: "Most Steps",
  longest_activity_duration: "Longest Activity",
  longest_distance: "Longest Distance"
};
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
function periodBoundsWeekly(anchor) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { periodStart: isoDateOf(start), periodEnd: isoDateOf(end) };
}
function periodBoundsMonthly(anchor) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { periodStart: isoDateOf(start), periodEnd: isoDateOf(end) };
}
function isoDateOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function periodLabel(goal) {
  if (goal.periodType === "weekly") return "This Week";
  const month = /* @__PURE__ */ new Date(`${goal.periodStart}T00:00:00`);
  if (Number.isNaN(month.getTime())) return goal.periodStart;
  return month.toLocaleDateString("en-GB", { month: "long" });
}
function validateGoalInput(input) {
  if (typeof input.metric !== "string" || !GOAL_METRICS.includes(input.metric))
    return "Choose a goal metric.";
  const target = num(input.targetValue);
  if (target === null || target <= 0 || target > 1e7)
    return "Target must be a positive number.";
  if (typeof input.periodType !== "string" || !GOAL_PERIODS.includes(input.periodType))
    return "Choose a weekly or monthly goal.";
  if (typeof input.periodStart !== "string" || !ISO_DATE.test(input.periodStart))
    return "Invalid start date.";
  if (typeof input.periodEnd !== "string" || !ISO_DATE.test(input.periodEnd))
    return "Invalid end date.";
  const days = (Date.parse(`${input.periodEnd}T00:00:00`) - Date.parse(`${input.periodStart}T00:00:00`)) / 864e5;
  if (!Number.isFinite(days) || days < 0) return "End date must be on or after the start date.";
  if (input.periodType === "weekly" && days > 7) return "Weekly goals span at most 7 days.";
  if (input.periodType === "monthly" && days > 31) return "Monthly goals span at most 31 days.";
  if (RECOVERY_GOAL_METRICS.includes(input.metric)) {
    const target2 = num(input.targetValue);
    if (target2 === null || target2 !== Math.floor(target2))
      return "Recovery goal targets are whole days.";
    if (target2 > days + 1) return "Target cannot exceed the days in this period.";
  }
  if (input.activityType != null && (typeof input.activityType !== "string" || input.activityType.length === 0))
    return "Invalid activity type filter.";
  return null;
}
function normalizeGoal(value) {
  if (!value || typeof value !== "object") return null;
  const g = value;
  const id = typeof g.id === "string" ? g.id : null;
  const metric = typeof g.metric === "string" && GOAL_METRICS.includes(g.metric) ? g.metric : null;
  const periodType = typeof g.period_type === "string" && GOAL_PERIODS.includes(g.period_type) ? g.period_type : null;
  const status = typeof g.status === "string" && ["active", "completed", "expired", "cancelled"].includes(g.status) ? g.status : null;
  const progress = num(g.progress);
  const target = num(g.target_value);
  if (!id || !metric || !periodType || !status || progress === null || target === null) return null;
  if (typeof g.period_start !== "string" || typeof g.period_end !== "string") return null;
  return {
    id,
    metric,
    activityType: typeof g.activity_type === "string" ? g.activity_type : null,
    targetValue: target,
    periodType,
    periodStart: g.period_start,
    periodEnd: g.period_end,
    status,
    progress,
    createdAt: typeof g.created_at === "string" ? g.created_at : g.period_start,
    updatedAt: typeof g.updated_at === "string" ? g.updated_at : g.period_start
  };
}
function normalizeNewRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const r = raw;
    if (typeof r.record_type !== "string" || !TRAINING_RECORD_TYPES.includes(r.record_type))
      return null;
    const value2 = num(r.value);
    if (value2 === null) return null;
    const previous = num(r.previous_value);
    return {
      recordType: r.record_type,
      value: value2,
      previousValue: previous
    };
  }).filter((r) => r !== null);
}
function normalizeRecord(value) {
  if (!value || typeof value !== "object") return null;
  const r = value;
  if (typeof r.record_type !== "string" || !TRAINING_RECORD_TYPES.includes(r.record_type))
    return null;
  const v = num(r.value);
  if (v === null || typeof r.activity_id !== "string") return null;
  return {
    recordType: r.record_type,
    value: v,
    activityId: r.activity_id,
    activityType: typeof r.activity_type === "string" ? r.activity_type : "other",
    source: typeof r.source === "string" ? r.source : "svj_native",
    achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : ""
  };
}
function formatGoalProgress(metric, progress) {
  if (metric === "distance")
    return `${(progress / 1e3).toLocaleString(void 0, { maximumFractionDigits: 1 })} km`;
  return Math.round(progress).toLocaleString();
}
function formatRecordValue(recordType, value) {
  switch (recordType) {
    case "most_steps_in_activity":
      return Math.round(value).toLocaleString();
    case "longest_activity_duration": {
      const minutes = Math.round(value / 60);
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    case "longest_distance":
      return `${(value / 1e3).toLocaleString(void 0, { maximumFractionDigits: 2 })} km`;
  }
}
function unwrap(envelope, key, normalize) {
  if (!envelope || typeof envelope !== "object" || envelope.ok !== true)
    return { ok: false, error: "The server returned an unreadable response." };
  const raw = envelope[key];
  if (!Array.isArray(raw)) return { ok: false, error: "The server returned an unreadable list." };
  const items = raw.map(normalize).filter((x) => x !== null);
  return { ok: true, items };
}
async function listGoals(callRpc, includeCompleted = true) {
  try {
    const { data, error } = await callRpc("svj_list_goals", {
      p_include_completed: includeCompleted
    });
    if (error) return { ok: false, goals: [], error: error.message || "Couldn't load goals." };
    const result = unwrap(data, "goals", normalizeGoal);
    return result.ok ? { ok: true, goals: result.items } : { ok: false, goals: [], error: result.error };
  } catch (e) {
    return { ok: false, goals: [], error: e instanceof Error ? e.message : "Network error." };
  }
}
async function createGoal(callRpc, input) {
  const invalid = validateGoalInput(input);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { data, error } = await callRpc("svj_create_goal", {
      p_metric: input.metric,
      p_target_value: input.targetValue,
      p_period_type: input.periodType,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_activity_type: input.activityType ?? null
    });
    if (error) return { ok: false, error: error.message || "Couldn't create the goal." };
    const env = data;
    const goal = env && env.ok === true ? normalizeGoal(env.goal) : null;
    if (!goal) return { ok: false, error: "The server rejected this goal." };
    return { ok: true, goal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function updateGoal(callRpc, goalId, targetValue) {
  const target = num(targetValue);
  if (!goalId || target === null || target <= 0)
    return { ok: false, error: "Invalid goal update." };
  try {
    const { data, error } = await callRpc("svj_update_goal", {
      p_goal_id: goalId,
      p_target_value: target
    });
    if (error) return { ok: false, error: error.message || "Couldn't update the goal." };
    const env = data;
    const goal = env && env.ok === true ? normalizeGoal(env.goal) : null;
    if (!goal) return { ok: false, error: "The server rejected this update." };
    return { ok: true, goal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function cancelGoal(callRpc, goalId) {
  if (!goalId) return { ok: false, error: "Invalid goal." };
  try {
    const { error } = await callRpc("svj_cancel_goal", { p_goal_id: goalId });
    if (error) return { ok: false, error: error.message || "Couldn't cancel the goal." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function listRecords(callRpc) {
  try {
    const { data, error } = await callRpc("svj_list_records");
    if (error) return { ok: false, records: [], error: error.message || "Couldn't load records." };
    const env = data;
    if (!env || env.ok !== true || !Array.isArray(env.records))
      return { ok: false, records: [], error: "The server returned an unreadable response." };
    const records = env.records.map(normalizeRecord).filter((r) => r !== null);
    return { ok: true, records };
  } catch (e) {
    return { ok: false, records: [], error: e instanceof Error ? e.message : "Network error." };
  }
}
function extractSaveExtras(data) {
  if (!data || typeof data !== "object") return { newRecords: [], goalProgress: [] };
  const env = data;
  const goals = Array.isArray(env.goal_progress) ? env.goal_progress.map(normalizeGoal).filter((g) => g !== null) : [];
  return { newRecords: normalizeNewRecords(env.new_records), goalProgress: goals };
}

// src/app/lib/rewards.ts
function rewardsRpcClient() {
  try {
    if (!hasSupabaseConfig()) return null;
    return supabase;
  } catch {
    return null;
  }
}
function normalizeRewards(raw) {
  if (!raw || typeof raw !== "object") return null;
  const env = raw;
  if (env.ok !== true) return null;
  const num4 = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const statChanges = {};
  if (env.statChanges && typeof env.statChanges === "object") {
    for (const [k, v] of Object.entries(env.statChanges)) {
      const n = num4(v);
      if (n > 0) statChanges[k] = n;
    }
  }
  return {
    eligible: env.eligible === true,
    reason: typeof env.reason === "string" ? env.reason : void 0,
    xpAwarded: num4(env.xpAwarded),
    prBonusAwarded: num4(env.prBonusAwarded),
    statChanges,
    dailyActivityXpRemaining: num4(env.dailyActivityXpRemaining)
  };
}
async function processActivityRewards(client, activityId) {
  if (!activityId) return { ok: false, error: "Missing activity." };
  try {
    const { data, error } = await client.rpc("svj_process_activity_rewards", {
      p_activity_id: activityId
    });
    if (error) return { ok: false, error: error.message || "Rewards failed." };
    const rewards = normalizeRewards(data);
    if (!rewards) return { ok: false, error: "Unreadable reward response." };
    return { ok: true, rewards };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function fetchPersonalizedXpToday(client) {
  try {
    const { data, error } = await client.from("activity_events").select("lifetime_xp_delta").eq("source_class", "svj_personalized").gte("created_at", (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
    if (error || !Array.isArray(data)) return 0;
    return data.reduce(
      (acc, row) => acc + (typeof row.lifetime_xp_delta === "number" && Number.isFinite(row.lifetime_xp_delta) && row.lifetime_xp_delta > 0 ? row.lifetime_xp_delta : 0),
      0
    );
  } catch {
    return 0;
  }
}

// src/app/context/ActivityContext.tsx
import { jsx } from "react/jsx-runtime";
var STORAGE_KEY_PREFIX = "svj_activity_v1";
function activityStorageKey(userId) {
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : STORAGE_KEY_PREFIX;
}
var MILESTONE_FEED_PREFIX = "Step Milestone";
var ActivityContext = globalThis.__svjActivityContext ??= createContext(
  null
);
async function loadPedometer() {
  if (!Capacitor.isPluginAvailable("CapacitorPedometer")) return null;
  try {
    const mod = await Promise.resolve().then(() => (init_capacitor_pedometer(), capacitor_pedometer_exports));
    return mod.CapacitorPedometer ?? null;
  } catch {
    return null;
  }
}
function androidStatusMessage(mode) {
  switch (mode) {
    case "counter":
      return "Step tracking active \u2014 hardware counter.";
    case "detector":
      return "Step tracking active \u2014 step detector.";
    case "accelerometer":
      return "Step tracking active \u2014 motion estimate (steps are estimated from accelerometer motion).";
    default:
      return "No compatible step sensor found on this device.";
  }
}
function ActivityProvider({
  children,
  userId
}) {
  return /* @__PURE__ */ jsx(AccountActivityProvider, { userId, children }, userId ?? "signed-out");
}
function AccountActivityProvider({
  children,
  userId
}) {
  const { awardXp: awardXp2, addActivity: addActivity2 } = useSVJ();
  const queryClient = useQueryClient();
  const callGetBodyProfile = useServerFn(getBodyProfile);
  const storageKey = activityStorageKey(userId);
  const dailyTracking = useDailyTracking(userId);
  const [state, setState] = useState3(
    () => rollActivityDay(normalizeActivityState(readStoredJson(storageKey, null)), /* @__PURE__ */ new Date()).state
  );
  const [trackingStatus, setTrackingStatus] = useState3("stopped");
  const [statusMessage, setStatusMessage] = useState3(
    "Tracking stopped \u2014 press START TRACKING to begin."
  );
  const [stepSource, setStepSource] = useState3(null);
  const pluginRef = useRef3(null);
  const paidMilestonesRef = useRef3(/* @__PURE__ */ new Set());
  const stateRef = useRef3(state);
  stateRef.current = state;
  const mountedRef = useRef3(false);
  const requestedRef = useRef3(false);
  const activeRef = useRef3(false);
  const updateRequiredRef = useRef3(false);
  const generationRef = useRef3(0);
  const rewardSessionRef = useRef3(null);
  const queueRef = useRef3(Promise.resolve());
  const listenerCleanupsRef = useRef3([]);
  const sessionStartedAtRef = useRef3(null);
  const sessionStepsRef = useRef3(0);
  const sessionDistanceRef = useRef3(0);
  const [completedSession, setCompletedSession] = useState3(null);
  const [saveState, setSaveState] = useState3("idle");
  const [lastSaveError, setLastSaveError] = useState3(null);
  const [lastSaveExtras, setLastSaveExtras] = useState3(null);
  const [lastSaveRewards, setLastSaveRewards] = useState3(null);
  const [personalizedXpToday, setPersonalizedXpToday] = useState3(0);
  useEffect3(() => {
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
  const lastPayloadRef = useRef3(null);
  const [manualSaveState, setManualSaveState] = useState3("idle");
  const [manualSaveError, setManualSaveError] = useState3(null);
  useEffect3(() => {
    writeStoredJson(storageKey, state);
  }, [storageKey, state]);
  const bodyProfileQuery = useQuery({
    queryKey: ["activity-body-profile", userId],
    enabled: Boolean(userId),
    staleTime: 10 * 6e4,
    retry: 1,
    queryFn: async () => callGetBodyProfile({})
  });
  const { bodyMetrics, ageYears } = useMemo(() => {
    const profile = bodyProfileQuery.data;
    let age;
    const dob = profile?.dateOfBirth;
    if (dob) {
      const birth = new Date(dob);
      if (!Number.isNaN(birth.getTime())) {
        const now = /* @__PURE__ */ new Date();
        age = now.getFullYear() - birth.getFullYear();
        const beforeBirthday = now.getMonth() < birth.getMonth() || now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate();
        if (beforeBirthday) age -= 1;
        if (age <= 0 || age >= 120) age = void 0;
      }
    }
    return {
      bodyMetrics: {
        weightKg: profile?.weightKg ?? void 0,
        heightCm: profile?.heightCm ?? void 0,
        sex: profile?.sex ?? void 0,
        bmr: profile?.bmr ?? void 0,
        dailyCalorieTarget: profile?.dailyCalorieTarget ?? void 0
      },
      ageYears: age
    };
  }, [bodyProfileQuery.data]);
  useEffect3(() => {
    const daily = dailyTracking.state;
    if (!daily || daily.ownerId !== userId || daily.dateKey !== localDateKey()) return;
    setState((previous) => {
      const rolled = rollActivityDay(previous, /* @__PURE__ */ new Date()).state;
      if (!rolled.today || rolled.today.steps >= daily.steps) return rolled;
      return { ...rolled, today: { ...rolled.today, steps: daily.steps } };
    });
  }, [dailyTracking.state, userId]);
  useEffect3(() => {
    const today = state.today;
    if (!today || !activeRef.current || rewardSessionRef.current !== generationRef.current) return;
    let claimed = stateRef.current;
    for (const milestone of pendingTrackedMilestones(today)) {
      const key = `${today.dateKey}:${milestone.steps}`;
      if (paidMilestonesRef.current.has(key)) continue;
      const next = claimMilestone(claimed, /* @__PURE__ */ new Date(), milestone.steps);
      if (!writeStoredJson(storageKey, next).ok) continue;
      claimed = next;
      paidMilestonesRef.current.add(key);
      setState((prev) => claimMilestone(prev, /* @__PURE__ */ new Date(), milestone.steps));
      awardXp2(milestone.xp, { physical: 1 });
      addActivity2(
        `${MILESTONE_FEED_PREFIX}: ${milestone.label} Steps`,
        `Walked ${milestone.steps.toLocaleString()} steps today. +${milestone.xp} XP.`,
        milestone.xp
      );
    }
  }, [state.today?.steps, state.today?.dateKey, state.today, storageKey, awardXp2, addActivity2]);
  const metricsRef = useRef3({});
  metricsRef.current = { ...bodyMetrics, ageYears };
  const removeOwnedListeners = useCallback2(async () => {
    const handles = listenerCleanupsRef.current.splice(0);
    const results = await Promise.allSettled(handles.map((remove) => remove()));
    results.forEach((result, i) => {
      if (result.status === "rejected") listenerCleanupsRef.current.push(handles[i]);
    });
    if (listenerCleanupsRef.current.length > 0)
      throw new Error("Unable to remove the step event listener. Try STOP again.");
  }, []);
  const stopTracking = useCallback2(() => {
    const wasStarting = requestedRef.current && !activeRef.current;
    const generation = ++generationRef.current;
    requestedRef.current = false;
    activeRef.current = false;
    rewardSessionRef.current = null;
    const frozenStart = sessionStartedAtRef.current;
    const frozenSteps = sessionStepsRef.current;
    const frozenDistance = sessionDistanceRef.current;
    const endedAt = Date.now();
    if (frozenStart != null && (frozenSteps > 0 || endedAt - frozenStart >= 6e4)) {
      setCompletedSession({
        clientSessionId: `svj-${frozenStart.toString(36)}-${generationRef.current}`,
        startedAtMs: frozenStart,
        endedAtMs: endedAt,
        durationSeconds: Math.max(1, Math.round((endedAt - frozenStart) / 1e3)),
        stepCount: frozenSteps,
        ...frozenDistance > 0 ? { distanceMeters: Math.round(frozenDistance * 100) / 100 } : {}
      });
    }
    sessionStartedAtRef.current = null;
    if (mountedRef.current) setTrackingStatus("stopping");
    const stopSensor = async () => {
      if (Capacitor.getPlatform() === "android" || vjPluginAvailable()) return vjStopTracking();
      if (pluginRef.current) await pluginRef.current.stopMeasurementUpdates();
      return null;
    };
    const immediateStop = stopSensor().then(
      (native) => ({ native, error: null }),
      (error) => ({ native: null, error })
    );
    const stop = async () => {
      let failure;
      try {
        const result = await immediateStop;
        const native = wasStarting ? await stopSensor() : result.native;
        if (!wasStarting && result.error) throw result.error;
        if (generation === generationRef.current && native) {
          if (native.requiresAppUpdate) updateRequiredRef.current = true;
        }
      } catch (error) {
        failure = error;
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
        setTrackingStatus("update-required");
        setStatusMessage(VJ_NATIVE_UPDATE_MESSAGE);
      } else if (failure) {
        setTrackingStatus("error");
        const detail = failure instanceof Error ? failure.message : String(failure);
        setStatusMessage(
          `Tracking stopped accepting steps, but sensor cleanup failed: ${detail} Retry STOP.`
        );
      } else if (updateRequiredRef.current) {
        setTrackingStatus("update-required");
        setStatusMessage(VJ_NATIVE_UPDATE_MESSAGE);
      } else {
        setTrackingStatus("stopped");
        setStatusMessage("Tracking stopped \u2014 press START TRACKING to begin.");
      }
    };
    const task = queueRef.current.then(stop, stop);
    queueRef.current = task;
    return task;
  }, [removeOwnedListeners]);
  const getSensorInfo = useCallback2(async () => {
    if (Capacitor.getPlatform() !== "android" && !vjPluginAvailable()) return null;
    const generation = generationRef.current;
    const available = vjPluginAvailable();
    const info = available ? await vjGetSensorInfo() : null;
    const native = available ? await vjGetState() : null;
    if (generation !== generationRef.current || !mountedRef.current) return info;
    if (activeRef.current && native && !native.trackingActive) void stopTracking();
    return info;
  }, [stopTracking]);
  const startTracking = useCallback2(() => {
    if (!userId || !mountedRef.current || requestedRef.current || updateRequiredRef.current)
      return Promise.resolve();
    const generation = ++generationRef.current;
    const sessionId = `${Date.now()}-${generation}`;
    const current = () => mountedRef.current && requestedRef.current && generation === generationRef.current;
    requestedRef.current = true;
    rewardSessionRef.current = null;
    sessionStepsRef.current = 0;
    sessionDistanceRef.current = 0;
    sessionStartedAtRef.current = Date.now();
    setTrackingStatus("starting");
    setStatusMessage("Starting step tracking\u2026");
    const acceptMeasurement = (rawSteps, atMs, rawDistance) => {
      if (!current() || !activeRef.current) return false;
      if (typeof atMs !== "number" || !Number.isSafeInteger(atMs) || !Number.isFinite(new Date(atMs).getTime()))
        return false;
      let measurement;
      try {
        measurement = vjValidateMeasurement({ numberOfSteps: rawSteps, distance: rawDistance });
      } catch {
        return false;
      }
      const { numberOfSteps: steps, distance: distanceMeters } = measurement;
      if (stateRef.current.lastSyncedAt != null && atMs < stateRef.current.lastSyncedAt)
        return false;
      if (steps > stateRef.current.sessionLastSteps)
        sessionStepsRef.current += steps - stateRef.current.sessionLastSteps;
      if (distanceMeters !== void 0 && distanceMeters > stateRef.current.sessionLastDistance)
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
            activeSeconds: next.today.trackedActiveSeconds ?? 0
          },
          metrics,
          new Date(atMs)
        );
        const prior = next.today.priorActiveKcal ?? 0;
        return {
          ...next,
          today: {
            ...next.today,
            activeKcal: prior + calories.activeKcal,
            totalKcal: prior + calories.totalKcal
          }
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
        let mode = null;
        if (platform === "android" || platform === "ios" && vjPluginAvailable()) {
          if (!vjPluginAvailable())
            throw new Error("Native step bridge is unavailable in this build.");
          const info = await vjGetSensorInfo();
          if (!current()) return;
          if (!info?.available || info.mode === "none")
            throw new Error("No compatible step sensor found on this device.");
          mode = info.mode;
          let permission = await vjCheckPermissions();
          if (!current()) return;
          if (permission?.activityRecognition !== "granted")
            permission = await vjRequestPermissions();
          if (!current()) return;
          if (permission?.activityRecognition !== "granted")
            throw new Error(
              "Motion permission denied. Enable Activity Recognition to track steps."
            );
          listenerCleanupsRef.current.push(
            await vjAddTrackingStateListener((native2) => {
              if (!current() || !native2 || native2.sessionId !== sessionId) return;
              if (native2.trackingActive !== true) {
                void stopTracking();
                return;
              }
              activeRef.current = true;
            })
          );
          if (!current()) return;
          listenerCleanupsRef.current.push(
            await vjAddMeasurementListener((event) => {
              if (!current() || !event || event.sessionId !== sessionId || event.trackingActive !== true || event.trackingRequested !== true || event.listenerRegistered !== true)
                return;
              activeRef.current = true;
              if (!acceptMeasurement(event.sessionSteps, event.timestamp)) return;
            })
          );
          if (!current()) return;
          setState((prev) => startTrackedSession(prev, /* @__PURE__ */ new Date()));
          const native = await vjStartTracking(sessionId);
          if (!current()) return;
          if (!native?.trackingActive || !native.listenerRegistered || native.sessionId !== sessionId) {
            throw new Error(
              "The native sensor did not confirm this tracking session. Update the native bridge."
            );
          }
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
          if (permission.activityRecognition !== "granted")
            throw new Error("Motion permission denied.");
          const available = await plugin.isAvailable();
          if (!current()) return;
          if (!available.stepCounting)
            throw new Error("This device has no step-counting hardware.");
          setState((prev) => startTrackedSession(prev, /* @__PURE__ */ new Date()));
          const listener = await plugin.addListener("measurement", (event) => {
            acceptMeasurement(
              event?.numberOfSteps,
              event?.endDate === void 0 ? Date.now() : event.endDate,
              event?.distance
            );
          });
          listenerCleanupsRef.current.push(() => listener.remove());
          if (!current()) return;
          activeRef.current = true;
          await plugin.startMeasurementUpdates();
          if (!current()) return;
          mode = "ios";
        } else {
          throw new Error("Live step tracking is available in the native app.");
        }
        activeRef.current = true;
        setStepSource(mode);
        setTrackingStatus("tracking");
        setStatusMessage(
          mode === "ios" ? "Tracking active." : androidStatusMessage(mode)
        );
      } catch (error) {
        if (!current()) return;
        requestedRef.current = false;
        activeRef.current = false;
        rewardSessionRef.current = null;
        let cleanupError;
        try {
          if (Capacitor.getPlatform() === "android" || vjPluginAvailable()) {
            await vjStopTracking();
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
        const detail = cleanupError ? `${message}; cleanup: ${cleanupError}` : message;
        if (error instanceof VjNativeUpdateRequiredError || cleanupError instanceof VjNativeUpdateRequiredError)
          updateRequiredRef.current = true;
        const retryCleanup = cleanupError && !(cleanupError instanceof VjNativeUpdateRequiredError);
        setTrackingStatus(
          retryCleanup ? "error" : updateRequiredRef.current ? "update-required" : /permission denied/i.test(message) ? "denied" : "unsupported"
        );
        setStatusMessage(
          updateRequiredRef.current && !retryCleanup ? VJ_NATIVE_UPDATE_MESSAGE : `Tracking stopped \u2014 ${detail}`
        );
      }
    };
    const task = queueRef.current.then(start, start);
    queueRef.current = task;
    return task;
  }, [userId, removeOwnedListeners, stopTracking]);
  useEffect3(() => {
    mountedRef.current = true;
    void stopTracking().then(() => getSensorInfo());
    const visibility = () => {
      if (document.hidden) void stopTracking();
      else {
        setState((prev) => rollActivityDay(prev, /* @__PURE__ */ new Date()).state);
        void getSensorInfo();
      }
    };
    const pagehide = () => {
      void stopTracking();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    const appListener = Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("App") ? App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) void stopTracking();
    }) : null;
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      void appListener?.then((handle) => handle.remove()).catch(() => void 0);
      void stopTracking();
    };
  }, [userId, stopTracking, getSensorInfo]);
  useEffect3(() => {
    const midnight = /* @__PURE__ */ new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(
      () => {
        setState((prev) => rollActivityDay(prev, /* @__PURE__ */ new Date()).state);
      },
      Math.max(1, midnight.getTime() - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [state.today?.dateKey]);
  const liveCalories = useMemo(() => {
    const activeKcal = state.today?.activeKcal ?? 0;
    const resting = estimateCalories(
      { steps: 0, distanceMeters: 0, activeSeconds: 0 },
      { ...bodyMetrics, ageYears },
      /* @__PURE__ */ new Date()
    ).totalKcal;
    return { activeKcal, totalKcal: activeKcal + resting };
  }, [state.today, bodyMetrics, ageYears]);
  useEffect3(() => {
    if (!state.today) return;
    const { activeKcal, totalKcal } = liveCalories;
    if (state.today.activeKcal === activeKcal && state.today.totalKcal === totalKcal) return;
    setState(
      (prev) => prev.today ? { ...prev, today: { ...prev.today, activeKcal, totalKcal } } : prev
    );
  }, [liveCalories, state.today]);
  const history7 = useMemo(() => buildHistory(state, /* @__PURE__ */ new Date(), 7), [state]);
  const history30 = useMemo(() => buildHistory(state, /* @__PURE__ */ new Date(), 30), [state]);
  const summary7 = useMemo(() => summarizeHistory(history7), [history7]);
  const summary30 = useMemo(() => summarizeHistory(history30), [history30]);
  const dailySteps = dailyTracking.state?.dateKey === localDateKey() ? dailyTracking.state.steps : 0;
  const successfulSyncAt = usePublishLiveSteps(
    userId,
    state.today?.dateKey ?? null,
    Math.max(state.today?.steps ?? 0, dailySteps),
    state.today?.distanceMeters ?? 0
  );
  const remoteLive = useRemoteLiveSteps(userId);
  const todaySteps = Math.max(state.today?.steps ?? 0, dailySteps, remoteLive?.steps ?? 0);
  const stepPercent = Math.min(100, Math.round(todaySteps / STEP_GOAL * 100));
  const remainingSteps = Math.max(0, STEP_GOAL - todaySteps);
  const kcalGoal = activeKcalGoal(bodyMetrics);
  const kcalPercent = Math.min(100, Math.round(liveCalories.activeKcal / kcalGoal * 100));
  const buildSessionPayload = useCallback2(
    (activityType) => {
      const session = completedSession;
      if (!session) return null;
      return {
        clientSessionId: session.clientSessionId,
        activityType,
        startedAtMs: session.startedAtMs,
        endedAtMs: session.endedAtMs,
        durationSeconds: session.durationSeconds,
        stepCount: session.stepCount,
        ...session.distanceMeters !== void 0 ? { distanceMeters: session.distanceMeters } : {},
        // Calories come from the existing estimator over this session's tracked
        // metrics — never fabricated per-step server writes.
        ...session.stepCount > 0 ? {
          caloriesEstimate: estimateCalories(
            {
              steps: session.stepCount,
              distanceMeters: session.distanceMeters ?? 0,
              activeSeconds: session.durationSeconds
            },
            metricsRef.current,
            new Date(session.endedAtMs)
          ).activeKcal
        } : {}
      };
    },
    [completedSession]
  );
  const rpcCall = useCallback2(async (rpcPayload) => {
    const client = supabase;
    const { data, error } = await client.rpc("svj_save_activity", rpcPayload);
    return { data, error };
  }, []);
  const persist = useCallback2(
    async (payload, source) => {
      if (!hasSupabaseConfig() || !userId) {
        return { ok: false, error: "Sign in to save activities to your history." };
      }
      const result = await saveServerActivity(rpcCall, payload, Date.now(), { source });
      if (result.ok) {
        const extras = extractSaveExtras(result.rawData);
        let rewards = null;
        if (!result.duplicate && result.activity) {
          const client = rewardsRpcClient();
          if (client) {
            const processed = await processActivityRewards(client, result.activity.id);
            if (processed.ok) rewards = processed.rewards ?? null;
          }
          if (rewards && (rewards.xpAwarded > 0 || Object.keys(rewards.statChanges).length > 0)) {
            void queryClient.invalidateQueries({ queryKey: ["user-stats"] });
          }
        }
        return { ...result, extras, rewards };
      }
      return result;
    },
    [userId, rpcCall, queryClient]
  );
  const runSave = useCallback2(
    async (activityType) => {
      const payload = buildSessionPayload(activityType);
      if (!payload) return { ok: false, error: "No completed session to save." };
      lastPayloadRef.current = payload;
      setSaveState("saving");
      setLastSaveError(null);
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
    },
    [buildSessionPayload, persist]
  );
  const saveCompletedSession = useCallback2(
    (activityType) => runSave(activityType),
    [runSave]
  );
  const retrySaveCompletedSession = useCallback2(async () => {
    const payload = lastPayloadRef.current;
    if (!payload) return { ok: false, error: "Nothing to retry." };
    setSaveState("saving");
    setLastSaveError(null);
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
  const logManualActivity = useCallback2(
    async (input) => {
      setManualSaveState("saving");
      setManualSaveError(null);
      const endedAtMs = input.startedAtMs + Math.round(input.durationMinutes * 6e4);
      const result = await persist(
        {
          clientSessionId: buildClientSessionId(),
          activityType: input.activityType,
          startedAtMs: input.startedAtMs,
          endedAtMs,
          durationSeconds: Math.round(input.durationMinutes * 60),
          stepCount: 0,
          ...input.perceivedEffort !== void 0 ? { perceivedEffort: input.perceivedEffort } : {},
          ...input.notes ? { notes: input.notes } : {}
        },
        "manual"
      );
      if (result.ok) {
        setManualSaveState("idle");
      } else {
        setManualSaveState("error");
        setManualSaveError(result.error ?? "Couldn't save activity.");
      }
      return result;
    },
    [persist]
  );
  const value = {
    dailyTracking,
    todaySteps,
    stepGoal: STEP_GOAL,
    stepPercent,
    remainingSteps,
    xpEarnedToday: milestoneXpClaimed(state.today),
    // Update 04: latest server-confirmed activity-XP-today figure. Derived
    // from the server's own daily-cap arithmetic — never device-local math.
    serverActivityXpToday: lastSaveRewards ? Math.max(0, 100 - (lastSaveRewards.dailyActivityXpRemaining ?? 0)) : 0,
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
    lastSyncedAt: Capacitor.isNativePlatform() ? successfulSyncAt : remoteLive ? Date.parse(remoteLive.updatedAt) : null,
    history7,
    history30,
    summary7,
    summary30,
    bodyMetrics: { ...bodyMetrics, ageYears },
    completedSession,
    dismissCompletedSession: useCallback2(() => setCompletedSession(null), []),
    saveCompletedSession,
    saveState,
    lastSaveError,
    lastSaveExtras,
    lastSaveRewards,
    retrySaveCompletedSession,
    logManualActivity,
    manualSaveState,
    manualSaveError
  };
  return /* @__PURE__ */ jsx(ActivityContext.Provider, { value, children });
}
function useActivity() {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error("useActivity must be used within an ActivityProvider");
  }
  return context;
}
function useActivityOptional() {
  return useContext(ActivityContext);
}

// src/app/views/ActivityView.tsx
import { useEffect as useEffect20, useRef as useRef12, useState as useState20 } from "react";

// src/app/components/StepTrackingStatus.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function StepTrackingStatus() {
  const activity = useActivityOptional();
  const daily = activity?.dailyTracking;
  if (!daily?.native) return null;
  const state = daily.state;
  return /* @__PURE__ */ jsxs(
    "section",
    {
      className: "min-w-0 rounded-2xl border border-white/10 bg-[#17171A] p-4 mb-4",
      "aria-label": "Step tracking status",
      children: [
        /* @__PURE__ */ jsx2("h2", { className: "font-semibold", children: "Step tracking status" }),
        /* @__PURE__ */ jsx2("p", { className: "text-sm text-white/65 break-words", role: "status", children: daily.error ?? (daily.waiting ? "Waiting for step sensor" : state?.enabled ? "Daily tracking enabled" : "Enable automatic daily steps") }),
        /* @__PURE__ */ jsxs("dl", { className: "grid grid-cols-2 gap-2 text-sm my-3 min-w-0", children: [
          /* @__PURE__ */ jsx2("dt", { children: "Permission" }),
          /* @__PURE__ */ jsx2("dd", { className: "break-words", children: state?.permission ?? "Not checked" }),
          /* @__PURE__ */ jsx2("dt", { children: "Sensor" }),
          /* @__PURE__ */ jsx2("dd", { className: "break-words", children: state?.available ? state.source : "Unavailable" }),
          /* @__PURE__ */ jsx2("dt", { children: "Listening" }),
          /* @__PURE__ */ jsx2("dd", { children: state?.listening ? "Yes" : "No" }),
          /* @__PURE__ */ jsx2("dt", { children: "Today" }),
          /* @__PURE__ */ jsxs("dd", { children: [
            activity?.todaySteps.toLocaleString() ?? "\u2014",
            " steps"
          ] }),
          /* @__PURE__ */ jsx2("dt", { children: "Latest reading" }),
          /* @__PURE__ */ jsx2("dd", { children: state?.measurementAt ? new Date(state.measurementAt).toLocaleTimeString() : "Waiting" }),
          /* @__PURE__ */ jsx2("dt", { children: "Website sync" }),
          /* @__PURE__ */ jsx2("dd", { children: activity?.lastSyncedAt ? `Synced ${Math.max(0, Math.floor((Date.now() - activity.lastSyncedAt) / 1e3))}s ago` : "Not synced yet" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: "rounded-xl border border-white/20 px-3 py-2",
              onClick: () => void (state?.enabled ? daily.disable() : daily.enable()),
              children: state?.enabled ? "Disable daily steps" : "Enable daily steps"
            }
          ),
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: "rounded-xl border border-white/20 px-3 py-2",
              onClick: () => void daily.refresh(),
              children: "Retry"
            }
          ),
          Capacitor.getPlatform() === "android" && /* @__PURE__ */ jsx2(
            "button",
            {
              className: "rounded-xl border border-white/20 px-3 py-2",
              onClick: () => void daily.enableHealthFallback(),
              children: "Connect step history backup"
            }
          ),
          /* @__PURE__ */ jsx2(
            "button",
            {
              className: "rounded-xl border border-white/20 px-3 py-2",
              onClick: () => void DailyPedometer.openSettings().catch(() => void 0),
              children: "Permissions"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("details", { className: "mt-3 text-xs text-white/60", children: [
          /* @__PURE__ */ jsx2("summary", { children: "Sensor details" }),
          /* @__PURE__ */ jsxs("p", { children: [
            "Raw count: ",
            state?.raw ?? "Not available"
          ] })
        ] })
      ]
    }
  );
}

// mock:motion/react
import React2 from "react";
var cache = {};
var motion = new Proxy({}, { get: (_, tag) => cache[tag] ??= (props) => {
  const { children, initial, animate, transition, whileHover, ...rest } = props;
  return React2.createElement(tag, rest, children);
} });

// src/app/views/ActivityView.tsx
import {
  Activity as ActivityIcon,
  Footprints as Footprints3,
  Flame as Flame2,
  TrendingUp as TrendingUp2,
  Trophy as Trophy5,
  Watch as Watch3,
  ActivitySquare,
  BarChart3
} from "lucide-react";

// src/app/views/ActivityHistory.tsx
import { useCallback as useCallback7, useEffect as useEffect10, useState as useState10 } from "react";
import {
  History as HistoryIcon,
  ChevronLeft as ChevronLeft3,
  Save,
  RefreshCw as RefreshCw2,
  Plus,
  X,
  AlertCircle as AlertCircle2,
  CheckCircle2,
  Loader2 as Loader23,
  Trophy as Trophy2,
  Target
} from "lucide-react";

// src/app/views/GpsActivityDetail.tsx
import { useEffect as useEffect5, useMemo as useMemo3, useState as useState5 } from "react";

// mock:recharts
var Bar = () => null;
var CartesianGrid = Bar;
var Tooltip = Bar;
var XAxis = Bar;
var YAxis = Bar;
var Line = Bar;
var LineChart = Bar;
var Area = Bar;
var AreaChart = Bar;
var ResponsiveContainer = ({ children }) => children;

// src/app/views/GpsActivityDetail.tsx
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Flag,
  Footprints,
  Heart,
  Loader2,
  Mountain,
  Route as RouteIcon,
  Satellite,
  Timer,
  Watch
} from "lucide-react";

// src/app/components/ActivityMap.tsx
import { useEffect as useEffect4, useMemo as useMemo2, useRef as useRef4, useState as useState4 } from "react";
import { Crosshair, Maximize2, MapPin, Minimize2, Navigation, ZoomIn, ZoomOut } from "lucide-react";
import { Fragment, jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var SVJ_STREET_TILES = {
  id: "openstreetmap",
  urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "\xA9 OpenStreetMap contributors"
};
function buildPath(projected) {
  if (projected.length === 0) return "";
  if (projected.length === 1) return `M ${projected[0].x} ${projected[0].y}`;
  return projected.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}
var TILE_SIZE = 256;
function mercatorWorld(lat, lng, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin(safeLat * Math.PI / 180);
  return {
    x: (lng + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  };
}
function createTileViewportAtZoom(centerLat, centerLng, zoom, width, height, offsetXPx = 0, offsetYPx = 0) {
  const center = mercatorWorld(centerLat, centerLng, zoom);
  const originX = center.x - width / 2 - offsetXPx;
  const originY = center.y - height / 2 - offsetYPx;
  const count = 2 ** zoom;
  const tiles = [];
  const minTileX = Math.floor(originX / TILE_SIZE);
  const maxTileX = Math.floor((originX + width) / TILE_SIZE);
  const minTileY = Math.floor(originY / TILE_SIZE);
  const maxTileY = Math.floor((originY + height) / TILE_SIZE);
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= count) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = (tileX % count + count) % count;
      tiles.push({
        z: zoom,
        x: wrappedX,
        y: tileY,
        left: tileX * TILE_SIZE - originX,
        top: tileY * TILE_SIZE - originY
      });
    }
  }
  return {
    zoom,
    centerLat,
    centerLng,
    tiles,
    project(lat, lng) {
      const world = mercatorWorld(lat, lng, zoom);
      return { x: world.x - originX, y: world.y - originY };
    }
  };
}
function createTileViewport(points, width, height) {
  const valid = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  const centerLat = valid.length ? valid.reduce((sum, point) => sum + point.lat, 0) / valid.length : 20.5937;
  const centerLng = valid.length ? valid.reduce((sum, point) => sum + point.lng, 0) / valid.length : 78.9629;
  let zoom = valid.length ? 16 : 4;
  if (valid.length > 1) {
    for (; zoom > 3; zoom -= 1) {
      const world = valid.map((point) => mercatorWorld(point.lat, point.lng, zoom));
      const spanX = Math.max(...world.map((point) => point.x)) - Math.min(...world.map((point) => point.x));
      const spanY = Math.max(...world.map((point) => point.y)) - Math.min(...world.map((point) => point.y));
      if (spanX <= width - 56 && spanY <= height - 56) break;
    }
  }
  const center = mercatorWorld(centerLat, centerLng, zoom);
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;
  const count = 2 ** zoom;
  const tiles = [];
  const minTileX = Math.floor(originX / TILE_SIZE);
  const maxTileX = Math.floor((originX + width) / TILE_SIZE);
  const minTileY = Math.floor(originY / TILE_SIZE);
  const maxTileY = Math.floor((originY + height) / TILE_SIZE);
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= count) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedX = (tileX % count + count) % count;
      tiles.push({
        z: zoom,
        x: wrappedX,
        y: tileY,
        left: tileX * TILE_SIZE - originX,
        top: tileY * TILE_SIZE - originY
      });
    }
  }
  return {
    zoom,
    centerLat,
    centerLng,
    tiles,
    project(lat, lng) {
      const world = mercatorWorld(lat, lng, zoom);
      return { x: world.x - originX, y: world.y - originY };
    }
  };
}
var ActivityMap = ({
  points,
  bounds,
  height = 220,
  variant = "preview",
  showStartFinish = true,
  showCurrentPosition = false,
  tileProvider = SVJ_STREET_TILES,
  guidePoints,
  className,
  emptyMessage = "No route recorded"
}) => {
  const [fullscreen, setFullscreen] = useState4(false);
  const [viewportWidth, setViewportWidth] = useState4(400);
  const viewportHeight = fullscreen ? 620 : height;
  const [userZoom, setUserZoom] = useState4(null);
  const [userPan, setUserPan] = useState4({ x: 0, y: 0 });
  const [followGps, setFollowGps] = useState4(true);
  const [manualCenter, setManualCenter] = useState4(null);
  const containerRef = useRef4(null);
  const width = viewportWidth;
  useEffect4(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const measured = Math.round(node.getBoundingClientRect().width);
      if (measured > 0) setViewportWidth(measured);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [fullscreen]);
  const mouseDrag = useRef4(null);
  const gesture = useRef4({ mode: "none", lastX: 0, lastY: 0, startDistance: 0, startZoom: 16 });
  const pinchDistance = (touches) => {
    if (touches.length < 2) return null;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const onTouchStart = (event) => {
    if (event.touches.length >= 2) {
      const distance = pinchDistance(event.touches);
      if (distance != null) {
        gesture.current = {
          mode: "pinch",
          lastX: 0,
          lastY: 0,
          startDistance: distance,
          startZoom: userZoom ?? mapViewport.zoom
        };
      }
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      gesture.current = {
        mode: "pan",
        lastX: touch.clientX,
        lastY: touch.clientY,
        startDistance: 0,
        startZoom: 16
      };
    }
  };
  const onTouchMove = (event) => {
    const mode = gesture.current.mode;
    if (mode === "pinch") {
      const distance = pinchDistance(event.touches);
      if (distance != null && gesture.current.startDistance > 0) {
        const scale = distance / gesture.current.startDistance;
        const next = Math.min(
          19,
          Math.max(3, Math.round(gesture.current.startZoom + Math.log2(scale)))
        );
        setManualCenter(
          (current) => current ?? { lat: mapViewport.centerLat, lng: mapViewport.centerLng }
        );
        setUserZoom(next);
        setFollowGps(false);
      }
    } else if (mode === "pan" && event.touches.length === 1) {
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.current.lastX;
      const dy = touch.clientY - gesture.current.lastY;
      gesture.current.lastX = touch.clientX;
      gesture.current.lastY = touch.clientY;
      setManualCenter(
        (current) => current ?? { lat: mapViewport.centerLat, lng: mapViewport.centerLng }
      );
      setUserPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
      setFollowGps(false);
    }
  };
  const onTouchEnd = () => {
    gesture.current.mode = "none";
  };
  const recenter = () => {
    setUserZoom(null);
    setUserPan({ x: 0, y: 0 });
    setManualCenter(null);
    setFollowGps(true);
  };
  const mapPoints = useMemo2(
    () => [
      ...points,
      ...(guidePoints ?? []).map((point, index) => ({ ...point, t: index })),
      ...bounds ? [
        { lat: bounds.minLat, lng: bounds.minLng, t: 0 },
        { lat: bounds.maxLat, lng: bounds.maxLng, t: 1 }
      ] : []
    ],
    [points, guidePoints, bounds]
  );
  const fitViewport = useMemo2(
    () => createTileViewport(mapPoints, width, viewportHeight),
    [mapPoints, viewportHeight]
  );
  const mapViewport = useMemo2(() => {
    const zoom = userZoom ?? fitViewport.zoom;
    if (followGps && userZoom == null && userPan.x === 0 && userPan.y === 0) {
      const latest = points[points.length - 1];
      if (showCurrentPosition && latest) {
        return createTileViewportAtZoom(
          latest.lat,
          latest.lng,
          Math.max(15, fitViewport.zoom),
          width,
          viewportHeight
        );
      }
      return fitViewport;
    }
    const center = !followGps && manualCenter ? manualCenter : { lat: fitViewport.centerLat, lng: fitViewport.centerLng };
    return createTileViewportAtZoom(
      center.lat,
      center.lng,
      zoom,
      width,
      viewportHeight,
      userPan.x,
      userPan.y
    );
  }, [
    fitViewport,
    followGps,
    manualCenter,
    points,
    showCurrentPosition,
    userZoom,
    userPan,
    viewportHeight,
    width
  ]);
  const changeZoom = (delta) => {
    setManualCenter(
      (current) => current ?? { lat: mapViewport.centerLat, lng: mapViewport.centerLng }
    );
    setUserZoom(
      (current) => Math.min(19, Math.max(3, Math.round(current ?? mapViewport.zoom) + delta))
    );
    setFollowGps(false);
  };
  const projected = useMemo2(
    () => points.map((point) => mapViewport.project(point.lat, point.lng)),
    [points, mapViewport]
  );
  const path = useMemo2(() => buildPath(projected), [projected]);
  const start = projected[0];
  const end = projected[projected.length - 1];
  const hasFraming = mapPoints.length > 0;
  const guidePath = useMemo2(() => {
    if (!guidePoints || guidePoints.length < 2) return "";
    return buildPath(guidePoints.map((point) => mapViewport.project(point.lat, point.lng)));
  }, [guidePoints, mapViewport]);
  const body = /* @__PURE__ */ jsxs2(
    "div",
    {
      ref: containerRef,
      className: "relative touch-none overflow-hidden",
      style: { height: viewportHeight },
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      onPointerDown: (event) => {
        if (event.pointerType !== "mouse") return;
        mouseDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event) => {
        const drag = mouseDrag.current;
        if (event.pointerType !== "mouse" || !drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        setManualCenter(
          (current) => current ?? { lat: mapViewport.centerLat, lng: mapViewport.centerLng }
        );
        setUserPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
        setFollowGps(false);
      },
      onPointerUp: (event) => {
        if (mouseDrag.current?.pointerId === event.pointerId) mouseDrag.current = null;
      },
      onPointerCancel: () => {
        mouseDrag.current = null;
      },
      "data-testid": "activity-map-surface",
      children: [
        hasFraming && tileProvider.urlTemplate && mapViewport.tiles.map((tile) => /* @__PURE__ */ jsx3(
          "img",
          {
            src: tileProvider.urlTemplate.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y)),
            alt: "",
            "aria-hidden": "true",
            draggable: false,
            className: "pointer-events-none absolute max-w-none select-none",
            style: { left: tile.left, top: tile.top, width: 256, height: 256 }
          },
          `${tile.z}/${tile.x}/${tile.y}`
        )),
        /* @__PURE__ */ jsxs2(
          "svg",
          {
            viewBox: `0 0 ${width} ${viewportHeight}`,
            preserveAspectRatio: "xMidYMid meet",
            className: "absolute inset-0 w-full",
            style: { height: viewportHeight },
            role: "img",
            "aria-label": "SVJ recorded route",
            "data-testid": "activity-map",
            children: [
              /* @__PURE__ */ jsxs2("defs", { children: [
                /* @__PURE__ */ jsxs2("linearGradient", { id: "svj-route-glow", x1: "0", y1: "0", x2: "1", y2: "0", children: [
                  /* @__PURE__ */ jsx3("stop", { offset: "0%", stopColor: "#E62846" }),
                  /* @__PURE__ */ jsx3("stop", { offset: "100%", stopColor: "#FF6B4A" })
                ] }),
                /* @__PURE__ */ jsx3("filter", { id: "svj-route-blur", x: "-30%", y: "-30%", width: "160%", height: "160%", children: /* @__PURE__ */ jsx3("feGaussianBlur", { stdDeviation: "4" }) })
              ] }),
              !tileProvider.urlTemplate && /* @__PURE__ */ jsxs2(Fragment, { children: [
                Array.from({ length: 7 }, (_, i) => /* @__PURE__ */ jsx3(
                  "line",
                  {
                    x1: 0,
                    x2: width,
                    y1: viewportHeight / 6 * i,
                    y2: viewportHeight / 6 * i,
                    stroke: "rgba(255,255,255,0.035)",
                    strokeWidth: 0.6
                  },
                  `h${i}`
                )),
                Array.from({ length: 6 }, (_, i) => /* @__PURE__ */ jsx3(
                  "line",
                  {
                    y1: 0,
                    y2: viewportHeight,
                    x1: width / 5 * i,
                    x2: width / 5 * i,
                    stroke: "rgba(255,255,255,0.035)",
                    strokeWidth: 0.6
                  },
                  `v${i}`
                ))
              ] }),
              guidePath && /* @__PURE__ */ jsx3(
                "path",
                {
                  d: guidePath,
                  fill: "none",
                  stroke: "rgba(255,255,255,0.35)",
                  strokeWidth: 2,
                  strokeDasharray: "4 4",
                  strokeLinecap: "round",
                  "data-testid": "map-guide-route"
                }
              ),
              /* @__PURE__ */ jsx3(
                "path",
                {
                  d: path,
                  fill: "none",
                  stroke: "#E62846",
                  strokeWidth: 7,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  opacity: 0.28,
                  filter: "url(#svj-route-blur)"
                }
              ),
              /* @__PURE__ */ jsx3(
                "path",
                {
                  d: path,
                  fill: "none",
                  stroke: "url(#svj-route-glow)",
                  strokeWidth: 3,
                  strokeLinecap: "round",
                  strokeLinejoin: "round"
                }
              ),
              showStartFinish && start && /* @__PURE__ */ jsxs2("g", { "data-testid": "map-start", children: [
                /* @__PURE__ */ jsx3(
                  "circle",
                  {
                    cx: start.x,
                    cy: start.y,
                    r: 6,
                    fill: "#0B0B0C",
                    stroke: "#22C55E",
                    strokeWidth: 2.5
                  }
                ),
                /* @__PURE__ */ jsx3("circle", { cx: start.x, cy: start.y, r: 2, fill: "#22C55E" })
              ] }),
              showStartFinish && end && /* @__PURE__ */ jsxs2("g", { "data-testid": "map-finish", children: [
                /* @__PURE__ */ jsx3("circle", { cx: end.x, cy: end.y, r: 6, fill: "#0B0B0C", stroke: "#E62846", strokeWidth: 2.5 }),
                /* @__PURE__ */ jsx3("circle", { cx: end.x, cy: end.y, r: 2, fill: "#E62846" })
              ] }),
              showCurrentPosition && end && /* @__PURE__ */ jsxs2(
                "circle",
                {
                  cx: end.x,
                  cy: end.y,
                  r: 11,
                  fill: "none",
                  stroke: "#E62846",
                  strokeWidth: 1,
                  opacity: 0.5,
                  children: [
                    /* @__PURE__ */ jsx3("animate", { attributeName: "r", values: "8;14;8", dur: "2.4s", repeatCount: "indefinite" }),
                    /* @__PURE__ */ jsx3(
                      "animate",
                      {
                        attributeName: "opacity",
                        values: "0.55;0;0.55",
                        dur: "2.4s",
                        repeatCount: "indefinite"
                      }
                    )
                  ]
                }
              )
            ]
          }
        ),
        !hasFraming && /* @__PURE__ */ jsxs2(
          "div",
          {
            className: "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0B0B0C] px-6 text-center",
            "data-testid": "activity-map-empty",
            children: [
              /* @__PURE__ */ jsx3("span", { className: "flex h-11 w-11 items-center justify-center rounded-2xl border border-[#C81E3A]/25 bg-[#C81E3A]/10", children: /* @__PURE__ */ jsx3(Crosshair, { "aria-hidden": true, className: "h-5 w-5 text-[#E62846]" }) }),
              /* @__PURE__ */ jsx3("p", { className: "font-inter text-sm font-semibold text-[#F4F2ED]", children: "Your route starts at your position" }),
              /* @__PURE__ */ jsx3("p", { className: "max-w-[250px] font-inter text-[11px] leading-relaxed text-[#8C8C90]", children: emptyMessage })
            ]
          }
        ),
        hasFraming && projected.length < 2 && /* @__PURE__ */ jsxs2(
          "div",
          {
            className: "absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/20 text-center",
            "data-testid": "activity-map-empty",
            children: [
              /* @__PURE__ */ jsx3(MapPin, { "aria-hidden": true, className: "h-5 w-5 text-white/80" }),
              /* @__PURE__ */ jsx3("p", { className: "rounded-2xl bg-black/65 px-3 py-1.5 font-inter text-[11px] text-white/80", children: emptyMessage })
            ]
          }
        )
      ]
    }
  );
  const chrome = /* @__PURE__ */ jsxs2(Fragment, { children: [
    /* @__PURE__ */ jsxs2("div", { className: "pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 backdrop-blur", children: [
      /* @__PURE__ */ jsx3(Navigation, { className: "h-3 w-3 text-[#E62846]" }),
      /* @__PURE__ */ jsx3("span", { className: "font-inter text-[10px] font-semibold text-white", children: "Route map" })
    ] }),
    /* @__PURE__ */ jsx3(
      "button",
      {
        type: "button",
        onClick: () => setFullscreen((value) => !value),
        "aria-label": fullscreen ? "Exit fullscreen map" : "Open fullscreen map",
        "data-testid": "map-fullscreen-toggle",
        className: "absolute right-3 top-3 rounded-lg border border-white/10 bg-black/60 p-1.5 text-[#8C8C90] backdrop-blur transition-colors hover:text-white",
        children: fullscreen ? /* @__PURE__ */ jsx3(Minimize2, { className: "h-3.5 w-3.5" }) : /* @__PURE__ */ jsx3(Maximize2, { className: "h-3.5 w-3.5" })
      }
    ),
    /* @__PURE__ */ jsxs2("div", { className: "absolute right-3 top-12 flex flex-col gap-1", "aria-label": "Map zoom controls", children: [
      /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          onClick: () => changeZoom(1),
          "aria-label": "Zoom map in",
          "data-testid": "map-zoom-in",
          className: "rounded-lg border border-white/10 bg-black/60 p-1.5 text-[#8C8C90] backdrop-blur transition-colors hover:text-white",
          children: /* @__PURE__ */ jsx3(ZoomIn, { className: "h-3.5 w-3.5" })
        }
      ),
      /* @__PURE__ */ jsx3(
        "button",
        {
          type: "button",
          onClick: () => changeZoom(-1),
          "aria-label": "Zoom map out",
          "data-testid": "map-zoom-out",
          className: "rounded-lg border border-white/10 bg-black/60 p-1.5 text-[#8C8C90] backdrop-blur transition-colors hover:text-white",
          children: /* @__PURE__ */ jsx3(ZoomOut, { className: "h-3.5 w-3.5" })
        }
      )
    ] }),
    !followGps && /* @__PURE__ */ jsx3(
      "button",
      {
        type: "button",
        onClick: recenter,
        "aria-label": "Recenter map on your position",
        "data-testid": "map-recenter",
        className: "absolute bottom-8 right-3 rounded-lg border border-white/10 bg-black/60 p-1.5 text-[#8C8C90] backdrop-blur transition-colors hover:text-white",
        children: /* @__PURE__ */ jsx3(Crosshair, { className: "h-3.5 w-3.5" })
      }
    ),
    tileProvider.attribution && /* @__PURE__ */ jsx3("span", { className: "absolute bottom-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-mono text-[#8C8C90]", children: tileProvider.attribution })
  ] });
  if (fullscreen) {
    return /* @__PURE__ */ jsx3(
      "div",
      {
        className: "svj-modal-safe fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur",
        "data-testid": "map-fullscreen",
        children: /* @__PURE__ */ jsxs2("div", { className: "relative w-full max-w-3xl overflow-hidden rounded-2xl border border-[#C81E3A]/30 bg-[#0B0B0C]", children: [
          body,
          chrome
        ] })
      }
    );
  }
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      className: `relative overflow-hidden rounded-2xl border border-white/8 bg-[#08080A] ${variant === "hero" ? "border-[#C81E3A]/25" : ""} ${className ?? ""}`,
      "data-testid": "activity-map-frame",
      children: [
        body,
        chrome
      ]
    }
  );
};

// src/app/lib/gpsActivity.ts
var GPS_ACTIVITY_TYPES = ["running", "walking", "hiking", "cycling"];
var GPS_ACTIVITY_LABELS = {
  running: "Run",
  walking: "Walk",
  hiking: "Hike",
  cycling: "Cycle"
};
var EARTH_RADIUS_M = 63710088e-1;
function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
function decodePolyline(encoded, precision = 5) {
  const factor = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const latResult = decodeSigned(encoded, index);
    if (latResult == null) break;
    index = latResult.index;
    lat += latResult.value;
    const lngResult = decodeSigned(encoded, index);
    if (lngResult == null) break;
    index = lngResult.index;
    lng += lngResult.value;
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}
function decodeSigned(encoded, start) {
  let index = start;
  let result = 0;
  let shift = 0;
  let byte;
  do {
    if (index >= encoded.length) return null;
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 31) << shift;
    shift += 5;
  } while (byte >= 32);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, index };
}
var GPS_QUALITY_LABELS = {
  searching: "Searching",
  weak: "Weak",
  good: "Good",
  excellent: "Excellent"
};
function currentPaceSecondsPerKm(points, windowSeconds = 30, options = {}) {
  const minWindowSeconds = options.minWindowSeconds ?? 20;
  const minDistanceMeters = options.minDistanceMeters ?? 40;
  const maxAccuracyMeters = options.maxAccuracyMeters ?? 30;
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const cutoff = last.t - windowSeconds * 1e3;
  let startIndex = points.length - 1;
  while (startIndex > 0 && points[startIndex - 1].t >= cutoff) startIndex -= 1;
  const first = points[startIndex];
  if (first === last) return null;
  const elapsedSeconds = (last.t - first.t) / 1e3;
  if (elapsedSeconds < minWindowSeconds) return null;
  let distanceMeters = 0;
  let movingSecondsInWindow = 0;
  for (let i = startIndex + 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a.moving === false || b.moving === false) continue;
    if (a.accuracy != null && a.accuracy > maxAccuracyMeters || b.accuracy != null && b.accuracy > maxAccuracyMeters) {
      continue;
    }
    const seconds = (b.t - a.t) / 1e3;
    if (!(seconds > 0)) continue;
    distanceMeters += haversineMeters(a.lat, a.lng, b.lat, b.lng);
    movingSecondsInWindow += seconds;
  }
  if (distanceMeters < minDistanceMeters || movingSecondsInWindow < Math.min(minWindowSeconds, 10)) {
    return null;
  }
  return Math.round(movingSecondsInWindow / (distanceMeters / 1e3));
}
function formatDistance(meters, unit = "km") {
  if (meters == null || !Number.isFinite(meters)) return "\u2014";
  if (unit === "mi") {
    const miles = meters / 1609.344;
    return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(2)} mi`;
  }
  return meters < 1e3 ? `${Math.round(meters)} m` : `${(meters / 1e3).toFixed(2)} km`;
}
function formatPace(secondsPerKm, unit = "km") {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "\u2014";
  const adjusted = unit === "mi" ? secondsPerKm * 1.609344 : secondsPerKm;
  const total = Math.round(adjusted);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /${unit}`;
}
function formatSpeed(mps, unit = "km") {
  if (mps == null || !Number.isFinite(mps) || mps <= 0) return "\u2014";
  const perHour = mps * 3.6;
  return unit === "mi" ? `${(perHour / 1.609344).toFixed(1)} mph` : `${perHour.toFixed(1)} km/h`;
}
function formatClock(seconds) {
  const safe = seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor(safe % 3600 / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// src/app/lib/activityPlatform.ts
function activityRpcClient() {
  return rewardsRpcClient();
}
async function call(client, fn, args) {
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) return { ok: false, error: error.message || "Request failed." };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error." };
  }
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object";
}
function num2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function str(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function normalizeActivityTrack(raw) {
  if (!isRecord(raw)) return null;
  const activityId = str(raw.activityId);
  if (!activityId) return null;
  const points = [];
  if (Array.isArray(raw.points)) {
    for (const entry of raw.points) {
      if (!isRecord(entry)) continue;
      const lat = num2(entry.lat);
      const lng = num2(entry.lng);
      const t = num2(entry.t);
      if (lat == null || lng == null || t == null) continue;
      points.push({
        lat,
        lng,
        t,
        ele: num2(entry.ele),
        hr: num2(entry.hr),
        moving: entry.moving !== false
      });
    }
  }
  const boundsRaw = raw.bounds;
  const bounds = isRecord(boundsRaw) && num2(boundsRaw.minLat) != null && num2(boundsRaw.minLng) != null && num2(boundsRaw.maxLat) != null && num2(boundsRaw.maxLng) != null ? {
    minLat: num2(boundsRaw.minLat),
    minLng: num2(boundsRaw.minLng),
    maxLat: num2(boundsRaw.maxLat),
    maxLng: num2(boundsRaw.maxLng)
  } : null;
  return {
    activityId,
    activityType: str(raw.activityType) ?? "other",
    polyline: str(raw.polyline),
    bounds,
    pointCount: num2(raw.pointCount) ?? points.length,
    points
  };
}
async function fetchActivityTrack(client, activityId, maxPoints = 600) {
  const result = await call(client, "svj_get_activity_track", {
    p_activity_id: activityId,
    p_max_points: maxPoints
  });
  if (!result.ok) return { ok: false, error: result.error };
  const track = normalizeActivityTrack(result.data);
  if (!track) return { ok: false, error: "No recorded route for this activity." };
  return { ok: true, track };
}
var GPS_RECORD_LABELS = {
  fastest_1km: "Fastest 1 km",
  fastest_5km: "Fastest 5 km",
  fastest_5km_cycle: "Fastest 5 km ride",
  longest_run: "Longest run",
  longest_walk: "Longest walk",
  longest_ride: "Longest ride",
  best_avg_pace: "Best average pace",
  best_avg_speed: "Best average speed",
  longest_duration: "Longest moving time"
};
function gpsRecordFormat(type) {
  if (type === "fastest_1km" || type === "fastest_5km" || type === "fastest_5km_cycle")
    return "duration";
  if (type === "best_avg_pace") return "pace";
  if (type === "best_avg_speed") return "speed";
  if (type === "longest_duration") return "duration";
  return "distance";
}
function normalizeGpsRecords(raw) {
  if (!Array.isArray(raw)) return [];
  const records = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const recordType = str(entry.recordType);
    const activityId = str(entry.activityId);
    const value = num2(entry.value);
    if (!recordType || !activityId || value == null || value <= 0) continue;
    records.push({
      recordType,
      activityType: str(entry.activityType) ?? "other",
      value,
      activityId,
      achievedAt: str(entry.achievedAt) ?? ""
    });
  }
  return records;
}
async function fetchGpsRecords(client) {
  const result = await call(client, "svj_list_gps_records");
  if (!result.ok) return { ok: false, records: [], error: result.error };
  return { ok: true, records: normalizeGpsRecords(result.data) };
}
var HEATMAP_RANGES = ["all", "year", "90d"];
var HEATMAP_RANGE_LABELS = {
  all: "All time",
  year: "This year",
  "90d": "Last 90 days"
};
function heatmapSinceMs(range, nowMs = Date.now()) {
  if (range === "all") return null;
  if (range === "90d") return nowMs - 90 * 24 * 60 * 60 * 1e3;
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), 0, 1);
}
function normalizeHeatmap(raw) {
  if (!Array.isArray(raw)) return [];
  const cells = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const lat = num2(entry.lat);
    const lng = num2(entry.lng);
    const weight = num2(entry.weight);
    if (lat == null || lng == null || weight == null || weight <= 0) continue;
    cells.push({ lat, lng, weight });
  }
  return cells;
}
async function fetchActivityHeatmap(client, options = {}) {
  const since = heatmapSinceMs(options.range ?? "all", options.nowMs);
  const result = await call(client, "svj_get_activity_heatmap", {
    p_since: since == null ? null : new Date(since).toISOString(),
    p_activity_type: options.activityType ?? null,
    p_max_cells: 4e3
  });
  if (!result.ok) return { ok: false, cells: [], error: result.error };
  return { ok: true, cells: normalizeHeatmap(result.data) };
}
function normalizeRoute(raw) {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const polyline = str(raw.polyline);
  if (!id || !name || !polyline) return null;
  const boundsRaw = raw.bounds;
  return {
    id,
    name,
    activityType: str(raw.activity_type) ?? str(raw.activityType) ?? "other",
    polyline,
    bounds: isRecord(boundsRaw) ? {
      minLat: num2(boundsRaw.minLat) ?? 0,
      minLng: num2(boundsRaw.minLng) ?? 0,
      maxLat: num2(boundsRaw.maxLat) ?? 0,
      maxLng: num2(boundsRaw.maxLng) ?? 0
    } : null,
    distanceMeters: num2(raw.distance_meters),
    elevationGainMeters: num2(raw.elevation_gain_meters),
    sourceActivityId: str(raw.source_activity_id),
    favorite: raw.favorite === true,
    updatedAt: str(raw.updated_at) ?? str(raw.created_at) ?? ""
  };
}
function routeToPoints(polyline) {
  if (!polyline) return [];
  return decodePolyline(polyline).map((point, index) => ({
    lat: point.lat,
    lng: point.lng,
    t: index
  }));
}
function plannedRouteSummary(route) {
  const distance = formatDistance(route.distanceMeters);
  return route.elevationGainMeters != null ? `${distance} with ${Math.round(route.elevationGainMeters)} m of climb` : distance;
}
function formatRouteElevation(meters) {
  return meters == null || !Number.isFinite(meters) ? "\u2014" : `${Math.round(meters)} m`;
}
async function saveRouteFromActivity(client, activityId, name, favorite = false) {
  const result = await call(client, "svj_save_route_from_activity", {
    p_activity_id: activityId,
    p_name: name,
    p_favorite: favorite
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (!isRecord(result.data) || result.data.ok !== true) {
    return { ok: false, error: "The server rejected this route." };
  }
  const route = normalizeRoute(result.data.route);
  if (!route) return { ok: false, error: "Unreadable route response." };
  return { ok: true, route };
}
async function fetchRoutes(client) {
  const result = await call(client, "svj_list_routes");
  if (!result.ok) return { ok: false, routes: [], error: result.error };
  if (!Array.isArray(result.data)) return { ok: true, routes: [] };
  const routes = result.data.map((row) => normalizeRoute(row)).filter((r) => r != null).sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt)
  );
  return { ok: true, routes };
}
async function updateRoute(client, routeId, patch) {
  const result = await call(client, "svj_update_route", {
    p_route_id: routeId,
    p_name: patch.name ?? null,
    p_favorite: patch.favorite ?? null
  });
  if (!result.ok) return { ok: false, error: result.error };
  const route = isRecord(result.data) ? normalizeRoute(result.data.route) : null;
  if (!route) return { ok: false, error: "Unreadable route response." };
  return { ok: true, route };
}
async function deleteRoute(client, routeId) {
  const result = await call(client, "svj_delete_route", { p_route_id: routeId });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
function normalizeSegment(raw) {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return null;
  const attempts = [];
  if (Array.isArray(raw.recentAttempts)) {
    for (const entry of raw.recentAttempts) {
      if (!isRecord(entry)) continue;
      const activityId = str(entry.activityId);
      const duration = num2(entry.durationSeconds);
      if (!activityId || duration == null || duration <= 0) continue;
      attempts.push({
        activityId,
        durationSeconds: duration,
        startedAt: str(entry.startedAt) ?? ""
      });
    }
  }
  return {
    id,
    name,
    activityType: str(raw.activityType) ?? "other",
    startLat: num2(raw.startLat) ?? 0,
    startLng: num2(raw.startLng) ?? 0,
    endLat: num2(raw.endLat) ?? 0,
    endLng: num2(raw.endLng) ?? 0,
    toleranceMeters: num2(raw.toleranceMeters) ?? 30,
    attemptCount: num2(raw.attemptCount) ?? attempts.length,
    bestDurationSeconds: num2(raw.bestDurationSeconds),
    lastDurationSeconds: num2(raw.lastDurationSeconds),
    improvementSeconds: num2(raw.improvementSeconds),
    recentAttempts: attempts
  };
}
async function createSegment(client, input) {
  const result = await call(client, "svj_create_segment", {
    p_name: input.name,
    p_activity_id: input.activityId,
    p_start_lat: input.startLat,
    p_start_lng: input.startLng,
    p_end_lat: input.endLat,
    p_end_lng: input.endLng,
    p_activity_type: input.activityType ?? null,
    p_tolerance_meters: input.toleranceMeters ?? 30
  });
  if (!result.ok) return { ok: false, error: result.error };
  const segment = isRecord(result.data) ? normalizeSegment(result.data.segment) : null;
  if (!segment) return { ok: false, error: "The server rejected this segment." };
  return { ok: true, segment };
}
async function fetchSegments(client) {
  const result = await call(client, "svj_list_segments");
  if (!result.ok) return { ok: false, segments: [], error: result.error };
  if (!Array.isArray(result.data)) return { ok: true, segments: [] };
  const segments = result.data.map((row) => normalizeSegment(row)).filter((s) => s != null);
  return { ok: true, segments };
}
async function deleteSegment(client, segmentId) {
  const result = await call(client, "svj_delete_segment", { p_segment_id: segmentId });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
function liveShareUrl(token, origin) {
  const base = origin ?? (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://savaje-com.lovable.app");
  return `${base}/live/${token}`;
}
async function importPlatformActivity(client, input) {
  const result = await call(client, "svj_import_platform_activity", {
    p_client_session_id: input.clientSessionId,
    p_external_id: input.externalId,
    p_activity_type: input.activityType,
    p_started_at: new Date(input.startedAtMs).toISOString(),
    p_ended_at: new Date(input.endedAtMs).toISOString(),
    p_duration_seconds: Math.round(input.durationSeconds),
    p_step_count: Math.max(0, Math.round(input.stepCount ?? 0)),
    p_distance_meters: input.distanceMeters ?? null,
    p_calories_estimate: input.caloriesEstimate ?? null,
    p_avg_heart_rate: input.avgHeartRate ?? null,
    p_device_platform: input.devicePlatform ?? "health_connect"
  });
  if (!result.ok) return { ok: false, error: result.error };
  if (!isRecord(result.data) || result.data.ok !== true) {
    return { ok: false, error: "The server rejected this import." };
  }
  const activityId = isRecord(result.data.activity) ? str(result.data.activity.id) : null;
  if (!activityId) return { ok: false, error: "Unreadable import response." };
  const duplicate = result.data.duplicate === true;
  if (!duplicate) await processActivityRewards(client, activityId);
  return { ok: true, duplicate, activityId };
}

// src/app/views/GpsActivityDetail.tsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var SOURCE_LABELS = {
  svj_native: "Recorded by SVJ",
  manual: "Logged manually",
  strength_log: "Structured strength",
  health_connect: "Health Connect",
  wear_os: "SVJ Watch"
};
function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? "SVJ activity";
}
var SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Map" },
  { id: "splits", label: "Splits" },
  { id: "performance", label: "Performance" },
  { id: "heart", label: "Heart Rate" },
  { id: "elevation", label: "Elevation" },
  { id: "source", label: "Source" }
];
function chartTooltip() {
  return {
    contentStyle: {
      background: "#141116",
      border: "1px solid rgba(230,40,70,0.35)",
      borderRadius: 12,
      fontFamily: "monospace",
      fontSize: 11
    },
    labelStyle: { color: "#F4F2ED" },
    itemStyle: { color: "#E62846" }
  };
}
function paceSeries(track, windowSeconds = 30) {
  const points = track.points;
  const series = [];
  let startIndex = 0;
  for (let i = 1; i < points.length; i += 1) {
    while (startIndex < i && points[i].t - points[startIndex].t > windowSeconds * 1e3) {
      startIndex += 1;
    }
    let distance = 0;
    for (let j = startIndex + 1; j <= i; j += 1) {
      const a = points[j - 1];
      const b = points[j];
      if (a.moving === false || b.moving === false) continue;
      distance += haversineMeters(a.lat, a.lng, b.lat, b.lng);
    }
    const seconds = (points[i].t - points[startIndex].t) / 1e3;
    const speed = seconds > 0 && distance > 5 ? distance / seconds : null;
    series.push({
      t: points[i].t,
      label: formatClock(Math.round(points[i].t / 1e3)),
      pace: speed != null ? Math.round(1e3 / speed) : null,
      speed: speed != null ? Math.round(speed * 100) / 100 : null
    });
  }
  const stride = Math.max(1, Math.ceil(series.length / 220));
  return series.filter((_, index) => index % stride === 0);
}
function elevationSeries(track) {
  const stride = Math.max(1, Math.ceil(track.points.length / 220));
  return track.points.filter((_, index) => index % stride === 0).filter((point) => point.ele != null).map((point) => ({
    label: formatClock(Math.round(point.t / 1e3)),
    elevation: Math.round(point.ele)
  }));
}
function heartRateSeries(track) {
  const stride = Math.max(1, Math.ceil(track.points.length / 220));
  return track.points.filter((_, index) => index % stride === 0).filter((point) => point.hr != null).map((point) => ({
    label: formatClock(Math.round(point.t / 1e3)),
    hr: Math.round(point.hr)
  }));
}
var GpsActivityDetail = ({
  activity,
  embedded = false,
  onBack,
  client: injectedClient
}) => {
  const [section, setSection] = useState5("overview");
  const [track, setTrack] = useState5(null);
  const [loadingTrack, setLoadingTrack] = useState5(false);
  const [trackError, setTrackError] = useState5(null);
  const [notice, setNotice] = useState5(null);
  const [error, setError] = useState5(null);
  const [busy, setBusy] = useState5(false);
  const [routeName, setRouteName] = useState5("");
  const [segmentName, setSegmentName] = useState5("");
  const [segmentStart, setSegmentStart] = useState5("0");
  const [segmentEnd, setSegmentEnd] = useState5("");
  const client = injectedClient ?? activityRpcClient();
  const isGpsRecorded = activity.source === "svj_native";
  const unit = activity.splitUnit === "mi" ? "mi" : "km";
  const splits = activity.splits ?? [];
  useEffect5(() => {
    if (!isGpsRecorded || !client) return;
    let cancelled = false;
    setLoadingTrack(true);
    void fetchActivityTrack(client, activity.id).then((result) => {
      if (cancelled) return;
      if (result.ok && result.track) setTrack(result.track);
      else setTrackError(result.error ?? "Couldn't load the recorded route.");
      setLoadingTrack(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activity.id, client, isGpsRecorded]);
  const paceData = useMemo3(() => track ? paceSeries(track) : [], [track]);
  const elevationData = useMemo3(() => track ? elevationSeries(track) : [], [track]);
  const heartData = useMemo3(() => track ? heartRateSeries(track) : [], [track]);
  const fastest = useMemo3(() => {
    const complete = splits.filter((split) => !split.partial && split.durationSeconds > 0);
    if (complete.length === 0) return null;
    return complete.reduce(
      (best, split) => split.durationSeconds < best.durationSeconds ? split : best
    );
  }, [splits]);
  const saveRoute = async () => {
    if (!client) return;
    const name = routeName.trim() || `${sourceLabel(activity.source)} route`;
    setBusy(true);
    setError(null);
    try {
      const result = await saveRouteFromActivity(client, activity.id, name);
      if (!result.ok) setError(result.error ?? "Couldn't save this route.");
      else setNotice(`Saved "${name}" to your route library.`);
    } finally {
      setBusy(false);
    }
  };
  const makeSegment = async () => {
    if (!client || !track || track.points.length < 2) return;
    const name = segmentName.trim();
    if (!name) {
      setError("Give the segment a name.");
      return;
    }
    const startIndex = Math.max(0, Math.min(Number(segmentStart) || 0, track.points.length - 2));
    const endIndex = Math.max(
      startIndex + 1,
      Math.min(Number(segmentEnd) || track.points.length - 1, track.points.length - 1)
    );
    const start = track.points[startIndex];
    const end = track.points[endIndex];
    setBusy(true);
    setError(null);
    try {
      const result = await createSegment(client, {
        name,
        activityId: activity.id,
        startLat: start.lat,
        startLng: start.lng,
        endLat: end.lat,
        endLng: end.lng,
        activityType: activity.activityType
      });
      if (!result.ok) setError(result.error ?? "Couldn't create this segment.");
      else {
        setNotice(`Segment "${name}" saved. Future workouts will be matched against it.`);
        setSegmentName("");
      }
    } finally {
      setBusy(false);
    }
  };
  const metrics = [
    {
      label: "Distance",
      value: formatDistance(activity.distanceMeters, unit),
      icon: /* @__PURE__ */ jsx4(RouteIcon, { className: "h-3 w-3 text-[#8C8C90]" })
    },
    {
      label: "Moving time",
      value: formatClock(activity.movingSeconds ?? activity.durationSeconds),
      icon: /* @__PURE__ */ jsx4(Timer, { className: "h-3 w-3 text-[#8C8C90]" })
    },
    {
      label: "Elapsed",
      value: formatDurationLabel(activity.durationSeconds),
      icon: /* @__PURE__ */ jsx4(Watch, { className: "h-3 w-3 text-[#8C8C90]" })
    },
    { label: "Average pace", value: formatPace(activity.avgPaceSecondsPerKm ?? null, unit) },
    { label: "Average speed", value: formatSpeed(activity.avgSpeedMps ?? null, unit) },
    {
      label: "Elevation gain",
      value: activity.elevationGainMeters != null ? `${Math.round(activity.elevationGainMeters)} m` : "\u2014",
      icon: /* @__PURE__ */ jsx4(Mountain, { className: "h-3 w-3 text-[#8C8C90]" })
    },
    {
      label: "Steps",
      value: activity.stepCount.toLocaleString(),
      icon: /* @__PURE__ */ jsx4(Footprints, { className: "h-3 w-3 text-[#8C8C90]" })
    },
    {
      label: "Heart rate",
      value: activity.avgHeartRate != null ? `${activity.avgHeartRate} bpm` : "\u2014",
      icon: /* @__PURE__ */ jsx4(Heart, { className: "h-3 w-3 text-[#8C8C90]" }),
      hint: activity.maxHeartRate != null ? `max ${activity.maxHeartRate} bpm` : void 0
    }
  ];
  return /* @__PURE__ */ jsxs3("div", { className: embedded ? "space-y-3" : "space-y-4 pb-8", "data-testid": "gps-activity-detail", children: [
    /* @__PURE__ */ jsxs3("div", { className: `flex items-center gap-3 ${embedded ? "hidden" : ""}`, children: [
      onBack && /* @__PURE__ */ jsx4(
        "button",
        {
          type: "button",
          onClick: onBack,
          "aria-label": "Back to history",
          "data-testid": "detail-back",
          className: "rounded-lg border border-white/10 bg-black/40 p-2 text-[#8C8C90] hover:text-white",
          children: /* @__PURE__ */ jsx4(ArrowLeft, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs3("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsx4("h2", { className: "truncate font-anton text-xl tracking-wider text-white", children: activity.activityType }),
        /* @__PURE__ */ jsxs3("div", { className: "mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-inter text-[11px] text-[#8C8C90]", children: [
          /* @__PURE__ */ jsx4("span", { children: formatActivityDate(activity.startedAt) }),
          /* @__PURE__ */ jsx4("span", { children: sourceLabel(activity.source) }),
          activity.gpsQuality && /* @__PURE__ */ jsxs3("span", { className: "inline-flex items-center gap-1", children: [
            /* @__PURE__ */ jsx4(Satellite, { "aria-hidden": true, className: "h-3 w-3" }),
            " GPS ",
            activity.gpsQuality
          ] })
        ] })
      ] })
    ] }),
    error && /* @__PURE__ */ jsxs3("div", { className: "flex items-start gap-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3", children: [
      /* @__PURE__ */ jsx4(AlertCircle, { className: "mt-0.5 h-4 w-4 shrink-0 text-crimson" }),
      /* @__PURE__ */ jsx4("p", { className: "flex-1 text-[11px] font-mono text-crimson", children: error })
    ] }),
    notice && /* @__PURE__ */ jsx4("div", { className: "rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-[11px] font-mono text-emerald-200", children: notice }),
    /* @__PURE__ */ jsx4("div", { className: "flex flex-wrap gap-1.5 pb-1", "data-testid": "detail-sections", children: SECTIONS.map((entry) => /* @__PURE__ */ jsx4(
      "button",
      {
        type: "button",
        onClick: () => setSection(entry.id),
        className: `max-w-full rounded-full border px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${section === entry.id ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white" : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"}`,
        children: entry.label
      },
      entry.id
    )) }),
    (section === "overview" || section === "map") && /* @__PURE__ */ jsx4(
      ActivityMap,
      {
        points: track?.points ?? [],
        bounds: track?.bounds ?? null,
        variant: "hero",
        height: section === "map" ? 320 : 230,
        emptyMessage: loadingTrack ? "Loading your SVJ route\u2026" : isGpsRecorded ? "Route could not be loaded." : "This activity has no GPS route (manual or sensor-only)."
      }
    ),
    section === "overview" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
      /* @__PURE__ */ jsx4("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-4", children: metrics.map((metric) => /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-white/5 bg-black/40 p-3", children: [
        /* @__PURE__ */ jsxs3("div", { className: "mb-1 flex items-center gap-1.5", children: [
          metric.icon,
          /* @__PURE__ */ jsx4("span", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: metric.label })
        ] }),
        /* @__PURE__ */ jsx4("div", { className: "font-mono text-base font-bold text-white", children: metric.value }),
        metric.hint && /* @__PURE__ */ jsx4("div", { className: "mt-0.5 text-[9px] font-mono text-[#8C8C90]", children: metric.hint })
      ] }, metric.label)) }),
      fastest && /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-[#C81E3A]/25 bg-[#0B0B0C] p-4", children: [
        /* @__PURE__ */ jsxs3("div", { className: "mb-1 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx4(Flag, { className: "h-4 w-4 text-[#E62846]" }),
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Fastest split" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5", children: [
          /* @__PURE__ */ jsx4("span", { className: "font-mono text-lg font-bold text-white", children: formatClock(fastest.durationSeconds) }),
          /* @__PURE__ */ jsx4("span", { className: "font-mono text-xs text-[#8C8C90]", children: formatPace(
            Math.round(fastest.durationSeconds / (fastest.distanceMeters / 1e3)),
            unit
          ) }),
          /* @__PURE__ */ jsxs3("span", { className: "font-inter text-[11px] text-[#8C8C90]", children: [
            "Split ",
            fastest.index
          ] })
        ] })
      ] })
    ] }),
    section === "splits" && /* @__PURE__ */ jsx4("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: splits.length === 0 ? /* @__PURE__ */ jsx4("p", { className: "text-[11px] font-mono text-[#8C8C90]", children: "No splits for this activity. Splits are computed for GPS-recorded workouts." }) : /* @__PURE__ */ jsx4("div", { className: "space-y-1", children: splits.map((split) => /* @__PURE__ */ jsxs3(
      "div",
      {
        className: `flex items-center gap-3 rounded-lg border px-2.5 py-1.5 ${split.index === fastest?.index ? "border-[#C81E3A]/40 bg-[#C81E3A]/8" : "border-white/5 bg-black/30"}`,
        children: [
          /* @__PURE__ */ jsx4("span", { className: "w-10 text-[10px] font-mono uppercase text-[#8C8C90]", children: split.partial ? "\u2026" : `#${split.index}` }),
          /* @__PURE__ */ jsx4("span", { className: "flex-1 text-[11px] font-mono text-white", children: formatDistance(split.distanceMeters, unit) }),
          /* @__PURE__ */ jsx4("span", { className: "text-[11px] font-mono text-white", children: formatClock(split.durationSeconds) }),
          /* @__PURE__ */ jsx4("span", { className: "w-16 text-right text-[10px] font-mono text-[#8C8C90]", children: split.elevationGainMeters != null ? `+${Math.round(split.elevationGainMeters)} m` : "\u2014" }),
          /* @__PURE__ */ jsx4("span", { className: "w-20 text-right text-[10px] font-mono text-[#8C8C90]", children: formatPace(
            Math.round(split.durationSeconds / (split.distanceMeters / 1e3)),
            unit
          ) })
        ]
      },
      split.index
    )) }) }),
    section === "performance" && /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
      /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]", children: unit === "mi" ? "Speed over time" : "Pace over time" }),
      paceData.length < 2 ? /* @__PURE__ */ jsx4("p", { className: "mt-2 text-[11px] font-mono text-[#8C8C90]", children: "Not enough track data." }) : /* @__PURE__ */ jsx4(ResponsiveContainer, { width: "100%", height: 190, children: /* @__PURE__ */ jsxs3(LineChart, { data: paceData, margin: { top: 10, right: 6, left: -20, bottom: 0 }, children: [
        /* @__PURE__ */ jsx4(CartesianGrid, { stroke: "rgba(255,255,255,0.05)", vertical: false }),
        /* @__PURE__ */ jsx4(
          XAxis,
          {
            dataKey: "label",
            tick: { fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" },
            tickLine: false,
            axisLine: { stroke: "rgba(255,255,255,0.1)" },
            interval: "preserveStartEnd"
          }
        ),
        /* @__PURE__ */ jsx4(
          YAxis,
          {
            tick: { fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" },
            axisLine: false,
            tickLine: false,
            tickFormatter: (v) => formatClock(v)
          }
        ),
        /* @__PURE__ */ jsx4(Tooltip, { ...chartTooltip(), formatter: (value) => formatClock(value) }),
        /* @__PURE__ */ jsx4(
          Line,
          {
            type: "monotone",
            dataKey: "pace",
            stroke: "#E62846",
            strokeWidth: 2,
            dot: false,
            connectNulls: true
          }
        )
      ] }) })
    ] }),
    section === "heart" && /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
      /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Heart rate" }),
      heartData.length < 2 ? /* @__PURE__ */ jsx4("p", { className: "mt-2 text-[11px] font-mono text-[#8C8C90]", children: "No heart-rate samples were recorded for this workout." }) : /* @__PURE__ */ jsx4(ResponsiveContainer, { width: "100%", height: 190, children: /* @__PURE__ */ jsxs3(LineChart, { data: heartData, margin: { top: 10, right: 6, left: -20, bottom: 0 }, children: [
        /* @__PURE__ */ jsx4(CartesianGrid, { stroke: "rgba(255,255,255,0.05)", vertical: false }),
        /* @__PURE__ */ jsx4(
          XAxis,
          {
            dataKey: "label",
            tick: { fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" },
            tickLine: false,
            axisLine: { stroke: "rgba(255,255,255,0.1)" },
            interval: "preserveStartEnd"
          }
        ),
        /* @__PURE__ */ jsx4(
          YAxis,
          {
            tick: { fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" },
            axisLine: false,
            tickLine: false,
            domain: ["dataMin - 10", "dataMax + 10"]
          }
        ),
        /* @__PURE__ */ jsx4(Tooltip, { ...chartTooltip() }),
        /* @__PURE__ */ jsx4(Line, { type: "monotone", dataKey: "hr", stroke: "#F59E0B", strokeWidth: 2, dot: false })
      ] }) })
    ] }),
    section === "elevation" && /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
      /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Elevation profile" }),
      elevationData.length < 2 ? /* @__PURE__ */ jsx4("p", { className: "mt-2 text-[11px] font-mono text-[#8C8C90]", children: "No elevation samples were recorded for this workout." }) : /* @__PURE__ */ jsx4(ResponsiveContainer, { width: "100%", height: 190, children: /* @__PURE__ */ jsxs3(AreaChart, { data: elevationData, margin: { top: 10, right: 6, left: -20, bottom: 0 }, children: [
        /* @__PURE__ */ jsx4("defs", { children: /* @__PURE__ */ jsxs3("linearGradient", { id: "svj-elevation", x1: "0", y1: "0", x2: "0", y2: "1", children: [
          /* @__PURE__ */ jsx4("stop", { offset: "0%", stopColor: "#E62846", stopOpacity: 0.45 }),
          /* @__PURE__ */ jsx4("stop", { offset: "100%", stopColor: "#E62846", stopOpacity: 0.02 })
        ] }) }),
        /* @__PURE__ */ jsx4(CartesianGrid, { stroke: "rgba(255,255,255,0.05)", vertical: false }),
        /* @__PURE__ */ jsx4(
          XAxis,
          {
            dataKey: "label",
            tick: { fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" },
            tickLine: false,
            axisLine: { stroke: "rgba(255,255,255,0.1)" },
            interval: "preserveStartEnd"
          }
        ),
        /* @__PURE__ */ jsx4(
          YAxis,
          {
            tick: { fill: "#8C8C90", fontSize: 9, fontFamily: "monospace" },
            axisLine: false,
            tickLine: false,
            domain: ["dataMin - 10", "dataMax + 10"]
          }
        ),
        /* @__PURE__ */ jsx4(Tooltip, { ...chartTooltip() }),
        /* @__PURE__ */ jsx4(
          Area,
          {
            type: "monotone",
            dataKey: "elevation",
            stroke: "#E62846",
            fill: "url(#svj-elevation)",
            strokeWidth: 2
          }
        )
      ] }) })
    ] }),
    section === "source" && /* @__PURE__ */ jsxs3("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
        /* @__PURE__ */ jsx4("div", { className: "mb-3 text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Provenance" }),
        /* @__PURE__ */ jsx4("dl", { className: "space-y-1.5 text-[11px] font-mono", children: [
          ["Source", sourceLabel(activity.source)],
          ["Provenance key", activity.source],
          ["Device platform", activity.devicePlatform ?? "\u2014"],
          ["GPS quality", activity.gpsQuality ?? "\u2014"],
          ["Track points", (activity.trackPointCount ?? 0).toLocaleString()],
          ["Auto-pause used", activity.autoPaused ? "Yes" : "No"],
          ["Started", new Date(activity.startedAt).toLocaleString()],
          ["Ended", new Date(activity.endedAt).toLocaleString()]
        ].map(([label, value]) => /* @__PURE__ */ jsxs3("div", { className: "flex justify-between gap-4", children: [
          /* @__PURE__ */ jsx4("dt", { className: "text-[#8C8C90]", children: label }),
          /* @__PURE__ */ jsx4("dd", { className: "text-right text-white", children: value })
        ] }, label)) }),
        /* @__PURE__ */ jsx4("p", { className: "mt-3 text-[10px] font-mono leading-relaxed text-[#8C8C90]", children: "Distance, moving time, elevation and splits for this workout were computed on the SVJ server from the recorded GPS points. XP is granted only by the server reward engine." })
      ] }),
      isGpsRecorded && client && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
          /* @__PURE__ */ jsxs3("div", { className: "mb-2 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx4(Bookmark, { className: "h-4 w-4 text-[#E62846]" }),
            /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-mono uppercase tracking-widest text-white", children: "Save as route" })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx4(
              "input",
              {
                value: routeName,
                onChange: (event) => setRouteName(event.target.value),
                placeholder: "Route name",
                "aria-label": "Route name",
                className: "flex-1 rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white placeholder:text-[#8C8C90] focus:border-[#C81E3A]/60 focus:outline-none"
              }
            ),
            /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                disabled: busy,
                onClick: () => void saveRoute(),
                "data-testid": "save-route",
                className: "rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50",
                children: busy ? /* @__PURE__ */ jsx4(Loader2, { className: "h-3.5 w-3.5 animate-spin" }) : "Save"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
          /* @__PURE__ */ jsxs3("div", { className: "mb-2 flex items-center gap-2", children: [
            /* @__PURE__ */ jsx4(Flag, { className: "h-4 w-4 text-[#E62846]" }),
            /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-mono uppercase tracking-widest text-white", children: "Create a personal segment" })
          ] }),
          /* @__PURE__ */ jsx4("p", { className: "mb-3 text-[10px] font-mono leading-relaxed text-[#8C8C90]", children: "Segments are private to you: SVJ matches them against your own future workouts to show your best time and your improvement. There are no public leaderboards." }),
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(
              "input",
              {
                value: segmentName,
                onChange: (event) => setSegmentName(event.target.value),
                placeholder: "Segment name",
                "aria-label": "Segment name",
                className: "w-full rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white placeholder:text-[#8C8C90] focus:border-[#C81E3A]/60 focus:outline-none"
              }
            ),
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxs3("label", { className: "flex-1 text-[10px] font-mono text-[#8C8C90]", children: [
                "Start point",
                /* @__PURE__ */ jsx4(
                  "input",
                  {
                    value: segmentStart,
                    onChange: (event) => setSegmentStart(event.target.value),
                    inputMode: "numeric",
                    "aria-label": "Segment start point index",
                    className: "mt-1 w-full rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white focus:border-[#C81E3A]/60 focus:outline-none"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs3("label", { className: "flex-1 text-[10px] font-mono text-[#8C8C90]", children: [
                "End point",
                /* @__PURE__ */ jsx4(
                  "input",
                  {
                    value: segmentEnd,
                    onChange: (event) => setSegmentEnd(event.target.value),
                    inputMode: "numeric",
                    placeholder: String(track?.points.length ? track.points.length - 1 : ""),
                    "aria-label": "Segment end point index",
                    className: "mt-1 w-full rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[11px] font-mono text-white placeholder:text-[#8C8C90] focus:border-[#C81E3A]/60 focus:outline-none"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                disabled: busy || !track,
                onClick: () => void makeSegment(),
                "data-testid": "create-segment",
                className: "w-full rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50",
                children: "Create segment"
              }
            )
          ] })
        ] })
      ] }),
      trackError && /* @__PURE__ */ jsx4("p", { className: "text-[10px] font-mono text-[#8C8C90]", children: trackError })
    ] })
  ] });
};

// src/app/components/ui-primitives/SVJEmptyState.tsx
import { TriangleAlert, Sparkles } from "lucide-react";
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var SVJEmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  variant = "empty",
  compact = false,
  className = ""
}) => {
  const ResolvedIcon = Icon ?? (variant === "error" ? TriangleAlert : Sparkles);
  const tone = {
    empty: {
      tile: "border-white/8 bg-[#1E1E22]",
      glyph: "text-[#8C8C90]"
    },
    error: {
      tile: "border-[#C81E3A]/25 bg-[#C81E3A]/10",
      glyph: "text-[#E62846]",
      label: "Couldn't load"
    },
    "coming-soon": {
      tile: "border-[#C9A227]/25 bg-[#C9A227]/10",
      glyph: "text-[#C9A227]",
      label: "Coming next"
    }
  };
  const t = tone[variant];
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      "data-empty-variant": variant,
      className: `flex flex-col items-center justify-center text-center ${compact ? "px-4 py-5" : "px-5 py-8"} ${className}`,
      children: [
        /* @__PURE__ */ jsx5(
          "div",
          {
            className: `flex items-center justify-center rounded-2xl border ${t.tile} ${compact ? "mb-3 h-10 w-10" : "mb-4 h-12 w-12"}`,
            children: /* @__PURE__ */ jsx5(ResolvedIcon, { "aria-hidden": true, className: `${compact ? "h-4 w-4" : "h-5 w-5"} ${t.glyph}` })
          }
        ),
        t.label && /* @__PURE__ */ jsx5("p", { className: "mb-1 font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8C8C90]", children: t.label }),
        /* @__PURE__ */ jsx5("h4", { className: "font-inter text-sm font-semibold text-[#F4F2ED]", children: title }),
        /* @__PURE__ */ jsx5("p", { className: "mt-1.5 max-w-xs text-xs font-inter leading-relaxed text-[#8C8C90]", children: description }),
        action && /* @__PURE__ */ jsx5("div", { className: "mt-4", children: action })
      ]
    }
  );
};

// src/app/components/ui-primitives/SVJSectionHeader.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var SVJSectionHeader = ({ title, icon: Icon, eyebrow, trailing, variant = "default", className = "" }) => /* @__PURE__ */ jsxs5("div", { className: `flex items-end justify-between gap-3 ${className}`, children: [
  /* @__PURE__ */ jsxs5("div", { className: "min-w-0", children: [
    eyebrow && /* @__PURE__ */ jsx6("p", { className: "mb-0.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8C8C90]", children: eyebrow }),
    /* @__PURE__ */ jsxs5("div", { className: "flex items-center gap-2", children: [
      variant === "default" ? /* @__PURE__ */ jsx6("span", { "aria-hidden": true, className: "h-3.5 w-1 shrink-0 rounded-full bg-[#C81E3A]" }) : Icon && /* @__PURE__ */ jsx6(Icon, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#C9A227]" }),
      /* @__PURE__ */ jsx6(
        "h3",
        {
          className: variant === "badge" ? "font-anton text-sm uppercase tracking-wider text-[#F4F2ED]" : "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]",
          children: title
        }
      ),
      variant === "default" && Icon && /* @__PURE__ */ jsx6(Icon, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#8C8C90]" })
    ] })
  ] }),
  trailing && /* @__PURE__ */ jsx6("div", { className: "shrink-0", children: trailing })
] });

// src/app/components/ui-primitives/SVJSelect.tsx
import { useCallback as useCallback3, useEffect as useEffect6, useId, useRef as useRef5, useState as useState6 } from "react";
import { Check, ChevronDown } from "lucide-react";
import { jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label ?? String(value);
}
function SVJSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
  testId
}) {
  const [open, setOpen] = useState6(false);
  const rootRef = useRef5(null);
  const buttonRef = useRef5(null);
  const listRef = useRef5(null);
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState6(
    () => Math.max(
      0,
      options.findIndex((option) => option.value === value)
    )
  );
  useEffect6(() => {
    if (!open) return;
    const index = options.findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, options, value]);
  useEffect6(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onFocusIn = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown2 = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown2);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown2);
    };
  }, [open]);
  const commit = useCallback3(
    (option) => {
      onChange(option.value);
      setOpen(false);
      buttonRef.current?.focus();
    },
    [onChange]
  );
  const onKeyDown = (event) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (open) setActiveIndex((i) => Math.max(0, i - 1));
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (!open) setOpen(true);
        else if (options[activeIndex]) commit(options[activeIndex]);
        break;
      }
      case "Tab": {
        setOpen(false);
        break;
      }
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
    }
  };
  const focusActive = () => {
    requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      const node = list.querySelector('[data-active="true"]');
      node?.focus();
    });
  };
  const activeId = `${listboxId}-opt-${activeIndex}`;
  return /* @__PURE__ */ jsxs6("div", { ref: rootRef, className: `relative ${className ?? ""}`, onKeyDown, children: [
    /* @__PURE__ */ jsxs6(
      "button",
      {
        ref: buttonRef,
        type: "button",
        disabled,
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        "aria-labelledby": listboxId,
        "data-testid": testId ? `${testId}-trigger` : void 0,
        onClick: () => {
          if (disabled) return;
          const next = !open;
          setOpen(next);
          if (next) focusActive();
        },
        className: "flex w-full min-h-[44px] items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0B0B0C] px-3 py-2 text-left text-xs font-mono text-white hover:border-white/20 disabled:opacity-40",
        children: [
          /* @__PURE__ */ jsxs6("span", { id: listboxId, className: "text-[11px] font-inter text-[#8C8C90]", children: [
            label,
            /* @__PURE__ */ jsx7("span", { className: "sr-only", children: ": " }),
            /* @__PURE__ */ jsx7("span", { className: "ml-1 text-white", "data-testid": testId ? `${testId}-value` : void 0, children: labelFor(options, value) })
          ] }),
          /* @__PURE__ */ jsx7(
            ChevronDown,
            {
              className: `h-4 w-4 shrink-0 text-[#8C8C90] transition-transform ${open ? "rotate-180" : ""}`,
              "aria-hidden": true
            }
          )
        ]
      }
    ),
    open && /* @__PURE__ */ jsx7(
      "ul",
      {
        ref: listRef,
        role: "listbox",
        "aria-labelledby": listboxId,
        tabIndex: -1,
        "data-testid": testId ? `${testId}-listbox` : void 0,
        className: "absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#17171A] py-1 shadow-xl shadow-black/60",
        children: options.map((option, index) => {
          const selected = option.value === value;
          const active = index === activeIndex;
          return /* @__PURE__ */ jsx7("li", { role: "none", children: /* @__PURE__ */ jsxs6(
            "div",
            {
              role: "option",
              "aria-selected": selected,
              "data-active": active,
              tabIndex: -1,
              "data-testid": testId ? `${testId}-option-${option.value}` : void 0,
              onClick: () => commit(option),
              onKeyDown: (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  commit(option);
                }
              },
              className: `flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs font-mono ${active ? "bg-white/[0.06]" : ""} ${selected ? "text-[#F4F2ED]" : "text-[#B8B8C0]"}`,
              children: [
                /* @__PURE__ */ jsx7("span", { children: option.label }),
                selected && /* @__PURE__ */ jsx7(Check, { className: "h-4 w-4 shrink-0 text-[#C81E3A]", "aria-label": "Selected" })
              ]
            }
          ) }, String(option.value));
        })
      }
    )
  ] });
}

// src/app/components/ui-primitives/SVJDatePicker.tsx
import { useCallback as useCallback4, useEffect as useEffect7, useMemo as useMemo4, useRef as useRef6, useState as useState7 } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// src/app/components/ui-primitives/datePickerUtils.ts
var MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
var ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
function pad2(value) {
  return String(value).padStart(2, "0");
}
function toDateValue(year, month, day) {
  return `${String(year).padStart(4, "0")}-${pad2(month + 1)}-${pad2(day)}`;
}
function parseDateValue(value) {
  if (!value) return null;
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1) return null;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (day > daysInMonth) return null;
  return { year, month, day, inMonth: true };
}
function addMonths(year, month, delta) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: (total % 12 + 12) % 12 };
}
function buildMonthMatrix(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previous = addMonths(year, month, -1);
  const daysInPrevious = new Date(previous.year, previous.month + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const offset = index - firstWeekday + 1;
    if (offset < 1) {
      cells.push({
        year: previous.year,
        month: previous.month,
        day: daysInPrevious + offset,
        inMonth: false
      });
    } else if (offset > daysInMonth) {
      const next = addMonths(year, month, 1);
      cells.push({ year: next.year, month: next.month, day: offset - daysInMonth, inMonth: false });
    } else {
      cells.push({ year, month, day: offset, inMonth: true });
    }
  }
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}
function formatLongDate(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return new Date(parsed.year, parsed.month, parsed.day, 12).toLocaleDateString(void 0, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}
function formatDayLabel(year, month, day) {
  return new Date(year, month, day, 12).toLocaleDateString(void 0, {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}
function todayDateValue() {
  const now = /* @__PURE__ */ new Date();
  return toDateValue(now.getFullYear(), now.getMonth(), now.getDate());
}
function isOutsideRange(value, min, max) {
  if (!value) return false;
  if (min && value < min) return true;
  if (max && value > max) return true;
  return false;
}
function monthLabel(month) {
  return MONTH_LABELS[month] ?? "";
}

// src/app/components/ui-primitives/SVJDatePicker.tsx
import { Fragment as Fragment3, jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function SVJDatePicker({
  label,
  value,
  onChange,
  disabled = false,
  min,
  max,
  className,
  testId
}) {
  const [open, setOpen] = useState7(false);
  const parsedValue = useMemo4(() => parseDateValue(value), [value]);
  const today = todayDateValue();
  const [view, setView] = useState7(() => {
    const seed = parsedValue ?? parseDateValue(today);
    return { year: seed.year, month: seed.month };
  });
  const [draft, setDraft] = useState7(() => value || "");
  const triggerRef = useRef6(null);
  const dialogRef = useRef6(null);
  const close = useCallback4((restoreFocus) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);
  const openDialog = useCallback4(() => {
    const seed = parseDateValue(value) ?? parseDateValue(todayDateValue());
    setView({ year: seed.year, month: seed.month });
    setDraft(value || "");
    setOpen(true);
  }, [value]);
  useEffect7(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = node.querySelectorAll(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    const onPointerDown = (event) => {
      if (node && !node.contains(event.target)) close(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [close, open]);
  const weeks = useMemo4(() => buildMonthMatrix(view.year, view.month), [view.year, view.month]);
  const display = formatLongDate(value);
  const shiftMonth = (delta) => setView((current) => addMonths(current.year, current.month, delta));
  const confirm = () => {
    if (!draft || isOutsideRange(draft, min, max)) return;
    onChange(draft);
    close(true);
  };
  const selectDay = (cell) => {
    const cellValue = toDateValue(cell.year, cell.month, cell.day);
    if (isOutsideRange(cellValue, min, max)) return;
    setDraft(cellValue);
    if (!cell.inMonth) setView({ year: cell.year, month: cell.month });
  };
  const moveFocusByDays = (delta) => {
    const start = parseDateValue(draft) ?? parseDateValue(today);
    const step = delta < 0 ? -1 : 1;
    let cursor = new Date(start.year, start.month, start.day, 12);
    for (let taken = 0; taken < Math.abs(delta); taken += 1) {
      const candidate = new Date(cursor.getTime());
      candidate.setDate(candidate.getDate() + step);
      const candidateValue = toDateValue(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate()
      );
      if (isOutsideRange(candidateValue, min, max)) break;
      cursor = candidate;
    }
    const nextValue = toDateValue(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    setDraft(nextValue);
    setView({ year: cursor.getFullYear(), month: cursor.getMonth() });
    const target = dialogRef.current?.querySelector(
      `[data-day-value="${nextValue}"][data-in-month="true"]`
    );
    target?.focus();
  };
  return /* @__PURE__ */ jsxs7(Fragment3, { children: [
    /* @__PURE__ */ jsxs7(
      "button",
      {
        ref: triggerRef,
        type: "button",
        disabled,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "aria-label": `${label}: ${display || "no date selected"}`,
        "data-testid": testId ? `${testId}-trigger` : void 0,
        onClick: () => open ? close(false) : openDialog(),
        className: `flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0B0B0C] px-3 py-2 text-left text-xs hover:border-white/20 disabled:opacity-40 ${className ?? ""}`,
        children: [
          /* @__PURE__ */ jsxs7("span", { className: "flex min-w-0 flex-col", children: [
            /* @__PURE__ */ jsx8("span", { className: "text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]", children: label }),
            /* @__PURE__ */ jsx8(
              "span",
              {
                className: "truncate font-mono text-[11px] text-white",
                "data-testid": testId ? `${testId}-value` : void 0,
                children: display || "Select a date"
              }
            )
          ] }),
          /* @__PURE__ */ jsx8(CalendarDays, { className: "h-4 w-4 shrink-0 text-[#8C8C90]", "aria-hidden": true })
        ]
      }
    ),
    open && /* @__PURE__ */ jsx8(
      "div",
      {
        className: "svj-modal-safe fixed inset-0 z-[100] flex items-center justify-center bg-black/70",
        "data-testid": testId ? `${testId}-overlay` : void 0,
        children: /* @__PURE__ */ jsxs7(
          "div",
          {
            ref: dialogRef,
            role: "dialog",
            "aria-modal": "true",
            "aria-label": label,
            tabIndex: -1,
            "data-testid": testId ? `${testId}-dialog` : void 0,
            className: "flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17171A] shadow-2xl shadow-black/70 outline-none",
            children: [
              /* @__PURE__ */ jsxs7("div", { className: "flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5", children: [
                /* @__PURE__ */ jsx8(
                  "button",
                  {
                    type: "button",
                    "aria-label": "Previous month",
                    "data-testid": testId ? `${testId}-prev-month` : void 0,
                    onClick: () => shiftMonth(-1),
                    className: "flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#B8B8C0] hover:text-white",
                    children: /* @__PURE__ */ jsx8(ChevronLeft, { className: "h-4 w-4", "aria-hidden": true })
                  }
                ),
                /* @__PURE__ */ jsxs7(
                  "p",
                  {
                    "aria-live": "polite",
                    className: "font-anton text-sm uppercase tracking-wide text-[#F4F2ED]",
                    children: [
                      monthLabel(view.month),
                      " ",
                      view.year
                    ]
                  }
                ),
                /* @__PURE__ */ jsx8(
                  "button",
                  {
                    type: "button",
                    "aria-label": "Next month",
                    "data-testid": testId ? `${testId}-next-month` : void 0,
                    onClick: () => shiftMonth(1),
                    className: "flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-[#B8B8C0] hover:text-white",
                    children: /* @__PURE__ */ jsx8(ChevronRight, { className: "h-4 w-4", "aria-hidden": true })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs7("div", { className: "min-h-0 overflow-y-auto px-3 py-3", children: [
                /* @__PURE__ */ jsx8("div", { className: "grid grid-cols-7 gap-1 pb-1", children: WEEKDAY_LABELS.map((day, index) => /* @__PURE__ */ jsx8(
                  "span",
                  {
                    "aria-hidden": true,
                    className: "text-center text-[10px] font-mono uppercase text-[#8C8C90]",
                    children: day
                  },
                  `${day}-${index}`
                )) }),
                weeks.map((week, weekIndex) => /* @__PURE__ */ jsx8("div", { className: "grid grid-cols-7 gap-1", children: week.map((cell) => {
                  const cellValue = toDateValue(cell.year, cell.month, cell.day);
                  const selected = draft === cellValue;
                  const isToday = today === cellValue;
                  const blocked = isOutsideRange(cellValue, min, max);
                  return /* @__PURE__ */ jsx8(
                    "button",
                    {
                      type: "button",
                      disabled: blocked,
                      "aria-selected": selected,
                      "aria-disabled": blocked || void 0,
                      "aria-current": isToday ? "date" : void 0,
                      "aria-label": formatDayLabel(cell.year, cell.month, cell.day),
                      "data-testid": testId ? `${testId}-day-${cellValue}` : void 0,
                      "data-day-value": cellValue,
                      "data-in-month": cell.inMonth ? "true" : "false",
                      onClick: () => selectDay(cell),
                      onKeyDown: (event) => {
                        if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          moveFocusByDays(-1);
                        } else if (event.key === "ArrowRight") {
                          event.preventDefault();
                          moveFocusByDays(1);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          moveFocusByDays(-7);
                        } else if (event.key === "ArrowDown") {
                          event.preventDefault();
                          moveFocusByDays(7);
                        } else if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectDay(cell);
                        }
                      },
                      className: `flex min-h-[44px] items-center justify-center rounded-lg text-xs font-mono transition-colors ${cell.inMonth ? "text-[#F4F2ED]" : "text-[#8C8C90]/60"} ${selected ? "bg-[#C81E3A]/25 font-bold ring-2 ring-[#E62846]" : "hover:bg-white/[0.06]"} ${isToday && !selected ? "border border-[#D4AF37]/60" : ""} ${blocked ? "cursor-not-allowed opacity-30" : ""}`,
                      children: cell.day
                    },
                    cellValue
                  );
                }) }, weekIndex))
              ] }),
              /* @__PURE__ */ jsxs7("div", { className: "flex shrink-0 items-center justify-end gap-2 border-t border-white/5 px-3 py-2.5", children: [
                /* @__PURE__ */ jsx8(
                  "button",
                  {
                    type: "button",
                    "data-testid": testId ? `${testId}-cancel` : void 0,
                    onClick: () => close(true),
                    className: "min-h-[44px] rounded-lg border border-white/10 bg-black/30 px-3 text-[11px] font-inter uppercase tracking-wider text-[#8C8C90] hover:text-white",
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ jsx8(
                  "button",
                  {
                    type: "button",
                    disabled: !draft || isOutsideRange(draft, min, max),
                    "data-testid": testId ? `${testId}-confirm` : void 0,
                    onClick: confirm,
                    className: "min-h-[44px] rounded-lg bg-[#C81E3A] px-4 text-[11px] font-anton uppercase tracking-wider text-white hover:bg-[#A0182E] disabled:opacity-40",
                    children: "Set"
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
}

// src/app/components/ui-primitives/SVJTimePicker.tsx
import { useCallback as useCallback5, useEffect as useEffect8, useMemo as useMemo5, useRef as useRef7, useState as useState8 } from "react";
import { Clock } from "lucide-react";

// src/app/components/ui-primitives/timePickerUtils.ts
var HOURS = Array.from(
  { length: 24 },
  (_, hour) => String(hour).padStart(2, "0")
);
var MINUTES = Array.from(
  { length: 60 },
  (_, minute) => String(minute).padStart(2, "0")
);
function parseTimeValue(value) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour: String(hour).padStart(2, "0"), minute: String(minute).padStart(2, "0") };
}
function toTimeValue(hour, minute) {
  return `${hour}:${minute}`;
}
function formatTimeLabel(value) {
  const parsed = parseTimeValue(value);
  if (!parsed) return "";
  const asDate = new Date(2e3, 0, 1, Number(parsed.hour), Number(parsed.minute), 0, 0);
  const twelveHour = asDate.toLocaleTimeString(void 0, {
    hour: "numeric",
    minute: "2-digit"
  });
  return `${parsed.hour}:${parsed.minute} (${twelveHour})`;
}

// src/app/components/ui-primitives/SVJTimePicker.tsx
import { Fragment as Fragment4, jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
function SVJTimePicker({
  label,
  value,
  onChange,
  disabled = false,
  className,
  testId
}) {
  const [open, setOpen] = useState8(false);
  const display = formatTimeLabel(value);
  const [draftHour, setDraftHour] = useState8("00");
  const [draftMinute, setDraftMinute] = useState8("00");
  const triggerRef = useRef7(null);
  const dialogRef = useRef7(null);
  const hourRef = useRef7(null);
  const minuteRef = useRef7(null);
  const draftValue = useMemo5(() => toTimeValue(draftHour, draftMinute), [draftHour, draftMinute]);
  const close = useCallback5((restoreFocus) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);
  const openDialog = useCallback5(() => {
    const seed = parseTimeValue(value) ?? { hour: "00", minute: "00" };
    setDraftHour(seed.hour);
    setDraftMinute(seed.minute);
    setOpen(true);
  }, [value]);
  useEffect8(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.focus();
    requestAnimationFrame(() => {
      for (const [ref, selected] of [
        [hourRef, draftHour],
        [minuteRef, draftMinute]
      ]) {
        const target = ref.current?.querySelector(`[data-value="${selected}"]`);
        target?.scrollIntoView({ block: "center" });
      }
    });
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const focusable = node.querySelectorAll(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    const onPointerDown = (event) => {
      if (node && !node.contains(event.target)) close(true);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [close, draftHour, draftMinute, open]);
  const shift = (part, delta) => {
    const [setter, list, current] = part === "hour" ? [setDraftHour, HOURS, draftHour] : [setDraftMinute, MINUTES, draftMinute];
    const index = list.indexOf(current);
    const next = Math.min(list.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta));
    setter(list[next]);
    const target = (part === "hour" ? hourRef : minuteRef).current?.querySelector(
      `[data-value="${list[next]}"]`
    );
    target?.focus();
  };
  const confirm = () => {
    onChange(draftValue);
    close(true);
  };
  const columnKeyDown = (part) => (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      shift(part, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      shift(part, 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      shift(part, -60);
    } else if (event.key === "End") {
      event.preventDefault();
      shift(part, 60);
    }
  };
  return /* @__PURE__ */ jsxs8(Fragment4, { children: [
    /* @__PURE__ */ jsxs8(
      "button",
      {
        ref: triggerRef,
        type: "button",
        disabled,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "aria-label": `${label}: ${display || "no time selected"}`,
        "data-testid": testId ? `${testId}-trigger` : void 0,
        onClick: () => open ? close(false) : openDialog(),
        className: `flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0B0B0C] px-3 py-2 text-left text-xs hover:border-white/20 disabled:opacity-40 ${className ?? ""}`,
        children: [
          /* @__PURE__ */ jsxs8("span", { className: "flex min-w-0 flex-col", children: [
            /* @__PURE__ */ jsx9("span", { className: "text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]", children: label }),
            /* @__PURE__ */ jsx9(
              "span",
              {
                className: "truncate font-mono text-[11px] text-white",
                "data-testid": testId ? `${testId}-value` : void 0,
                children: display || "Select a time"
              }
            )
          ] }),
          /* @__PURE__ */ jsx9(Clock, { className: "h-4 w-4 shrink-0 text-[#8C8C90]", "aria-hidden": true })
        ]
      }
    ),
    open && /* @__PURE__ */ jsx9(
      "div",
      {
        className: "svj-modal-safe fixed inset-0 z-[100] flex items-center justify-center bg-black/70",
        "data-testid": testId ? `${testId}-overlay` : void 0,
        children: /* @__PURE__ */ jsxs8(
          "div",
          {
            ref: dialogRef,
            role: "dialog",
            "aria-modal": "true",
            "aria-label": label,
            tabIndex: -1,
            "data-testid": testId ? `${testId}-dialog` : void 0,
            className: "flex max-h-[85vh] w-full max-w-xs flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17171A] shadow-2xl shadow-black/70 outline-none",
            children: [
              /* @__PURE__ */ jsxs8("div", { className: "shrink-0 border-b border-white/5 px-3 py-2.5 text-center", children: [
                /* @__PURE__ */ jsx9("p", { className: "text-[10px] font-inter uppercase tracking-wider text-[#8C8C90]", children: label }),
                /* @__PURE__ */ jsx9(
                  "p",
                  {
                    "aria-live": "polite",
                    className: "font-anton text-2xl uppercase tracking-wide text-[#F4F2ED]",
                    children: draftValue
                  }
                )
              ] }),
              /* @__PURE__ */ jsx9("div", { className: "min-h-0 flex-1 overflow-y-auto px-3 py-3", children: /* @__PURE__ */ jsxs8("div", { className: "grid grid-cols-2 gap-2", children: [
                /* @__PURE__ */ jsxs8("div", { children: [
                  /* @__PURE__ */ jsx9("p", { className: "pb-1 text-center text-[10px] font-mono uppercase text-[#8C8C90]", children: "Hour" }),
                  /* @__PURE__ */ jsx9(
                    "div",
                    {
                      ref: hourRef,
                      role: "listbox",
                      "aria-label": `${label} hour`,
                      tabIndex: -1,
                      onKeyDown: columnKeyDown("hour"),
                      className: "max-h-56 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-1",
                      children: HOURS.map((hour) => /* @__PURE__ */ jsx9(
                        "button",
                        {
                          type: "button",
                          role: "option",
                          "aria-selected": draftHour === hour,
                          "data-value": hour,
                          "data-testid": testId ? `${testId}-hour-${hour}` : void 0,
                          onClick: () => setDraftHour(hour),
                          className: `flex min-h-[40px] w-full items-center justify-center rounded-2xl font-mono text-xs ${draftHour === hour ? "bg-[#C81E3A]/25 font-bold text-white ring-2 ring-[#E62846]" : "text-[#B8B8C0] hover:bg-white/[0.06]"}`,
                          children: hour
                        },
                        hour
                      ))
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs8("div", { children: [
                  /* @__PURE__ */ jsx9("p", { className: "pb-1 text-center text-[10px] font-mono uppercase text-[#8C8C90]", children: "Minute" }),
                  /* @__PURE__ */ jsx9(
                    "div",
                    {
                      ref: minuteRef,
                      role: "listbox",
                      "aria-label": `${label} minute`,
                      tabIndex: -1,
                      onKeyDown: columnKeyDown("minute"),
                      className: "max-h-56 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-1",
                      children: MINUTES.map((minute) => /* @__PURE__ */ jsx9(
                        "button",
                        {
                          type: "button",
                          role: "option",
                          "aria-selected": draftMinute === minute,
                          "data-value": minute,
                          "data-testid": testId ? `${testId}-minute-${minute}` : void 0,
                          onClick: () => setDraftMinute(minute),
                          className: `flex min-h-[40px] w-full items-center justify-center rounded-2xl font-mono text-xs ${draftMinute === minute ? "bg-[#C81E3A]/25 font-bold text-white ring-2 ring-[#E62846]" : "text-[#B8B8C0] hover:bg-white/[0.06]"}`,
                          children: minute
                        },
                        minute
                      ))
                    }
                  )
                ] })
              ] }) }),
              /* @__PURE__ */ jsxs8("div", { className: "flex shrink-0 items-center justify-end gap-2 border-t border-white/5 px-3 py-2.5", children: [
                /* @__PURE__ */ jsx9(
                  "button",
                  {
                    type: "button",
                    "data-testid": testId ? `${testId}-cancel` : void 0,
                    onClick: () => close(true),
                    className: "min-h-[44px] rounded-lg border border-white/10 bg-black/30 px-3 text-[11px] font-inter uppercase tracking-wider text-[#8C8C90] hover:text-white",
                    children: "Cancel"
                  }
                ),
                /* @__PURE__ */ jsx9(
                  "button",
                  {
                    type: "button",
                    "data-testid": testId ? `${testId}-confirm` : void 0,
                    onClick: confirm,
                    className: "min-h-[44px] rounded-lg bg-[#C81E3A] px-4 text-[11px] font-anton uppercase tracking-wider text-white hover:bg-[#A0182E]",
                    children: "Set"
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
}

// src/app/lib/trainingProfile.ts
var LOAD_CONVENTIONS = [
  "barbell_total",
  "dumbbell_per_hand",
  "machine_stack",
  "assisted",
  "cable",
  "bodyweight_added"
];

// src/app/lib/strength.ts
var MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "full_body",
  "other"
];
var MUSCLE_LABELS = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  full_body: "Full Body",
  other: "Other"
};
var EXERCISE_CATEGORIES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "legs",
  "core",
  "conditioning",
  "full_body",
  "other"
];
var CATEGORY_LABELS = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  legs: "Legs",
  core: "Core",
  conditioning: "Conditioning",
  full_body: "Full Body",
  other: "Other"
};
var EXERCISE_TYPES = ["weighted_reps", "bodyweight_reps", "duration"];
var STRENGTH_RECORD_TYPES = [
  "heaviest_weight",
  "best_set_reps",
  "best_exercise_volume"
];
var STRENGTH_RECORD_LABELS = {
  heaviest_weight: "Heaviest Weight",
  best_set_reps: "Most Reps in a Set",
  best_exercise_volume: "Best Session Volume"
};
var num3 = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
var draftCounter = 0;
function newDraftId(prefix = "draft") {
  draftCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${draftCounter}`;
}
function createSetDraft(previous) {
  return {
    id: newDraftId("set"),
    reps: null,
    weightKg: previous?.weightKg ?? null,
    durationSeconds: null,
    isWarmup: false
  };
}
function createExerciseDraft(option) {
  return {
    id: newDraftId("ex"),
    exerciseId: option.id,
    name: option.name,
    exerciseType: option.exerciseType,
    primaryMuscle: option.primaryMuscle,
    secondaryMuscles: option.secondaryMuscles.filter((m) => m !== option.primaryMuscle),
    sets: [createSetDraft()]
  };
}
function validateReps(value) {
  if (value === null || !Number.isFinite(value)) return "Enter reps for every set.";
  if (!Number.isInteger(value) || value < 1 || value > 1e3)
    return "Reps must be a whole number between 1 and 1000.";
  return null;
}
function validateWeight(value, required) {
  if (value === null) return required ? "Enter a weight for weighted exercises." : null;
  if (!Number.isFinite(value) || value < 0 || value > 2e3)
    return "Weight must be between 0 and 2000 kg.";
  return null;
}
function validateStrengthDraft(drafts) {
  if (drafts.length < 1) return "Add at least one exercise before saving.";
  if (drafts.length > 20) return "A workout supports up to 20 exercises.";
  for (const draft of drafts) {
    if (!draft.exerciseId) return "Choose an exercise.";
    if (draft.notes != null && draft.notes.length > 300)
      return "Exercise notes are limited to 300 characters.";
    if (draft.sets.length < 1) return `Add at least one set to ${draft.name}.`;
    if (draft.sets.length > 30) return `${draft.name} supports up to 30 sets.`;
    for (const set of draft.sets) {
      if (draft.exerciseType === "duration") {
        if (set.durationSeconds === null || !Number.isFinite(set.durationSeconds) || !Number.isInteger(set.durationSeconds) || set.durationSeconds < 1 || set.durationSeconds > 14400)
          return `Enter a duration between 1 second and 4 hours for ${draft.name}.`;
        continue;
      }
      const repsError = validateReps(set.reps);
      if (repsError) return `${repsError} (${draft.name})`;
      const weightError = validateWeight(set.weightKg, draft.exerciseType === "weighted_reps");
      if (weightError) return `${weightError} (${draft.name})`;
    }
  }
  return null;
}
function buildStrengthPayload(drafts) {
  return drafts.map((draft) => ({
    exercise_id: draft.exerciseId,
    notes: draft.notes?.trim() ? draft.notes.trim() : null,
    sets: draft.sets.map((set) => ({
      reps: draft.exerciseType === "duration" ? null : set.reps ?? null,
      weight_kg: draft.exerciseType === "duration" ? null : set.weightKg ?? null,
      duration_seconds: draft.exerciseType === "duration" ? set.durationSeconds ?? null : null,
      is_warmup: set.isWarmup === true
    }))
  }));
}
function setVolume(set) {
  if (set.weightKg === null || set.reps === null) return 0;
  if (!Number.isFinite(set.weightKg) || !Number.isFinite(set.reps)) return 0;
  if (set.weightKg <= 0 || set.reps <= 0) return 0;
  return set.weightKg * set.reps;
}
function computeMuscleSummary(drafts) {
  const scores = /* @__PURE__ */ new Map();
  for (const draft of drafts) {
    const sets = draft.sets.filter((set) => set.isWarmup !== true).length;
    if (sets === 0) continue;
    scores.set(draft.primaryMuscle, (scores.get(draft.primaryMuscle) ?? 0) + sets * 1);
    for (const secondary of draft.secondaryMuscles) {
      if (secondary === draft.primaryMuscle) continue;
      scores.set(secondary, (scores.get(secondary) ?? 0) + sets * 0.5);
    }
  }
  if (scores.size === 0) return [];
  const top = Math.max(...scores.values());
  return [...scores.entries()].map(([muscle, score]) => ({
    muscle,
    score: Math.round(score * 100) / 100,
    level: score >= top * 0.66 ? "high" : score >= top * 0.33 ? "medium" : "low"
  })).sort((a, b) => b.score - a.score || a.muscle.localeCompare(b.muscle));
}
function computeDraftSummary(drafts) {
  let setCount = 0;
  let totalReps = 0;
  let volumeKg = 0;
  for (const draft of drafts) {
    setCount += draft.sets.length;
    for (const set of draft.sets) {
      if (set.reps !== null && Number.isFinite(set.reps)) totalReps += set.reps;
      volumeKg += setVolume(set);
    }
  }
  return {
    exerciseCount: drafts.length,
    setCount,
    totalReps,
    volumeKg: Math.round(volumeKg * 100) / 100,
    muscles: computeMuscleSummary(drafts)
  };
}
function formatWeight(weightKg) {
  if (weightKg === null || !Number.isFinite(weightKg)) return null;
  const rounded = Math.round(weightKg * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}
function formatSetLabel(set) {
  if (set.durationSeconds !== null && set.durationSeconds > 0) return `${set.durationSeconds} sec`;
  const weightLabel = set.weightKg === null ? null : formatWeight(set.weightKg);
  if (weightLabel !== null && Number(weightLabel) > 0) return `${weightLabel} \xD7 ${set.reps ?? 0}`;
  return `Bodyweight \xD7 ${set.reps ?? 0}`;
}
function formatVolume(volumeKg) {
  const value = Number.isFinite(volumeKg) ? volumeKg : 0;
  return `${Math.round(value).toLocaleString()} kg`;
}
function formatRecordValue2(recordType, value) {
  if (recordType === "best_set_reps") return `${Math.round(value)} reps`;
  if (recordType === "best_exercise_volume") return formatVolume(value);
  return `${formatWeight(value)} kg`;
}
function formatSessionDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function normalizeExerciseOption(value) {
  if (!value || typeof value !== "object") return null;
  const e = value;
  const id = typeof e.id === "string" ? e.id : null;
  const name = typeof e.name === "string" ? e.name : null;
  if (!id || !name) return null;
  if (!EXERCISE_TYPES.includes(e.exercise_type)) return null;
  const primary = MUSCLE_GROUPS.includes(e.primary_muscle) ? e.primary_muscle : "other";
  const secondary = Array.isArray(e.secondary_muscles) ? e.secondary_muscles.filter((m) => MUSCLE_GROUPS.includes(m)) : [];
  return {
    id,
    name,
    slug: typeof e.slug === "string" ? e.slug : "",
    category: typeof e.category === "string" ? e.category : "other",
    primaryMuscle: primary,
    secondaryMuscles: secondary,
    exerciseType: e.exercise_type,
    isCustom: e.is_custom === true,
    loadConvention: LOAD_CONVENTIONS.includes(e.load_convention) ? e.load_convention : null
  };
}
function normalizeSet(value) {
  if (!value || typeof value !== "object") return null;
  const s = value;
  const setNumber = num3(s.set_number);
  if (setNumber === null) return null;
  if (s.reps === null && s.duration_seconds === null) return null;
  return {
    setNumber,
    reps: num3(s.reps),
    weightKg: num3(s.weight_kg),
    durationSeconds: num3(s.duration_seconds),
    isWarmup: s.is_warmup === true
  };
}
function normalizeMuscles(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const m = raw;
    if (!MUSCLE_GROUPS.includes(m.muscle)) return null;
    const score = num3(m.score) ?? 0;
    const level = m.level === "high" || m.level === "medium" || m.level === "low" ? m.level : "low";
    return { muscle: m.muscle, score, level };
  }).filter((m) => m !== null);
}
function normalizeStrengthSummary(value) {
  if (!value || typeof value !== "object") return null;
  const s = value;
  const exerciseCount = num3(s.exercise_count);
  const setCount = num3(s.set_count);
  if (exerciseCount === null || setCount === null) return null;
  return {
    exerciseCount,
    setCount,
    totalReps: num3(s.total_reps) ?? 0,
    volumeKg: num3(s.volume_kg) ?? 0,
    muscles: normalizeMuscles(s.muscles)
  };
}
function normalizeAchievedRecord(value, names) {
  if (!value || typeof value !== "object") return null;
  const r = value;
  if (!STRENGTH_RECORD_TYPES.includes(r.record_type)) return null;
  const exerciseId = typeof r.exercise_id === "string" ? r.exercise_id : null;
  const recordValue = num3(r.value);
  if (!exerciseId || recordValue === null) return null;
  return {
    recordType: r.record_type,
    exerciseId,
    exerciseName: names.get(exerciseId) ?? null,
    value: recordValue,
    previousValue: num3(r.previous_value),
    setId: typeof r.set_id === "string" ? r.set_id : null
  };
}
function normalizeStrengthRecord(value) {
  if (!value || typeof value !== "object") return null;
  const r = value;
  if (!STRENGTH_RECORD_TYPES.includes(r.record_type)) return null;
  const exerciseId = typeof r.exercise_id === "string" ? r.exercise_id : null;
  const activityId = typeof r.activity_id === "string" ? r.activity_id : null;
  const recordValue = num3(r.value);
  if (!exerciseId || !activityId || recordValue === null) return null;
  return {
    recordType: r.record_type,
    exerciseId,
    exerciseName: typeof r.exercise_name === "string" ? r.exercise_name : "Exercise",
    exerciseType: EXERCISE_TYPES.includes(r.exercise_type) ? r.exercise_type : "weighted_reps",
    primaryMuscle: MUSCLE_GROUPS.includes(r.primary_muscle) ? r.primary_muscle : "other",
    value: recordValue,
    activityId,
    setId: typeof r.set_id === "string" ? r.set_id : null,
    achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : ""
  };
}
function normalizeGoalContribution(value) {
  if (!value || typeof value !== "object") return null;
  const g = value;
  const goalId = typeof g.goal_id === "string" ? g.goal_id : null;
  const metric = g.metric;
  if (!goalId) return null;
  if (!["workout_count", "step_total", "active_minutes", "distance"].includes(metric))
    return null;
  const targetValue = num3(g.target_value);
  const progress = num3(g.progress);
  const contribution = num3(g.contribution);
  if (targetValue === null || progress === null || contribution === null) return null;
  if (typeof g.period_start !== "string" || typeof g.period_end !== "string") return null;
  return {
    goalId,
    metric,
    activityType: typeof g.activity_type === "string" ? g.activity_type : null,
    periodType: g.period_type === "weekly" ? "weekly" : "monthly",
    periodStart: g.period_start,
    periodEnd: g.period_end,
    targetValue,
    progress,
    contribution
  };
}
function normalizeStrengthDetail(value) {
  if (!value || typeof value !== "object") return null;
  const d = value;
  if (d.ok !== true || typeof d.activity_id !== "string") return null;
  const summary = normalizeStrengthSummary(d.summary);
  if (!summary) return null;
  const exercises = [];
  if (Array.isArray(d.exercises)) {
    for (const raw of d.exercises) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw;
      if (typeof e.exercise_id !== "string" || typeof e.name !== "string") continue;
      const sets = Array.isArray(e.sets) ? e.sets.map(normalizeSet).filter((s) => s !== null) : [];
      exercises.push({
        exerciseId: e.exercise_id,
        name: e.name,
        exerciseType: EXERCISE_TYPES.includes(e.exercise_type) ? e.exercise_type : "weighted_reps",
        primaryMuscle: MUSCLE_GROUPS.includes(e.primary_muscle) ? e.primary_muscle : "other",
        position: num3(e.position) ?? exercises.length,
        notes: typeof e.notes === "string" && e.notes.length > 0 ? e.notes : null,
        sets
      });
    }
  }
  const records = Array.isArray(d.records) ? d.records.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const r = raw;
    if (!STRENGTH_RECORD_TYPES.includes(r.record_type))
      return null;
    const recordValue = num3(r.value);
    if (recordValue === null || typeof r.exercise_id !== "string") return null;
    return {
      recordType: r.record_type,
      exerciseId: r.exercise_id,
      exerciseName: typeof r.exercise_name === "string" ? r.exercise_name : "Exercise",
      value: recordValue,
      setId: typeof r.set_id === "string" ? r.set_id : null,
      achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : ""
    };
  }).filter((r) => r !== null) : [];
  const goalContributions = Array.isArray(d.goal_contributions) ? d.goal_contributions.map(normalizeGoalContribution).filter((g) => g !== null) : [];
  return {
    activityId: d.activity_id,
    summary,
    exercises,
    records,
    goalContributions
  };
}
function normalizeExerciseHistory(value) {
  if (!value || typeof value !== "object") return null;
  const h = value;
  if (h.ok !== true) return null;
  const exercise = normalizeExerciseOption(h.exercise);
  if (!exercise) return null;
  const sessions = [];
  if (Array.isArray(h.sessions)) {
    for (const raw of h.sessions) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw;
      if (typeof s.activity_id !== "string") continue;
      sessions.push({
        activityId: s.activity_id,
        performedAt: typeof s.performed_at === "string" ? s.performed_at : "",
        setCount: num3(s.set_count) ?? 0,
        totalReps: num3(s.total_reps) ?? 0,
        volumeKg: num3(s.volume_kg) ?? 0,
        bestWeight: num3(s.best_weight),
        bestReps: num3(s.best_reps),
        totalSeconds: num3(s.totals_seconds) ?? 0,
        perceivedEffort: num3(s.perceived_effort),
        sets: Array.isArray(s.sets) ? s.sets.map(normalizeSet).filter((x) => x !== null) : []
      });
    }
  }
  const records = Array.isArray(h.records) ? h.records.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const r = raw;
    if (!STRENGTH_RECORD_TYPES.includes(r.record_type))
      return null;
    const recordValue = num3(r.value);
    if (recordValue === null) return null;
    return {
      recordType: r.record_type,
      value: recordValue,
      activityId: typeof r.activity_id === "string" ? r.activity_id : "",
      setId: typeof r.set_id === "string" ? r.set_id : null,
      achievedAt: typeof r.achieved_at === "string" ? r.achieved_at : ""
    };
  }).filter((r) => r !== null) : [];
  return { exercise, records, sessions };
}
function extractStrengthExtras(data, names = /* @__PURE__ */ new Map()) {
  const universal = extractSaveExtras(data);
  if (!data || typeof data !== "object")
    return { strengthRecords: [], universalRecords: [], goalProgress: [] };
  const env = data;
  const strengthRecords = Array.isArray(env.strength_records) ? env.strength_records.map((raw) => normalizeAchievedRecord(raw, names)).filter((r) => r !== null) : [];
  return {
    summary: normalizeStrengthSummary(env.summary) ?? void 0,
    strengthRecords,
    universalRecords: universal.newRecords,
    goalProgress: universal.goalProgress
  };
}
async function listExercises(callRpc) {
  try {
    const { data, error } = await callRpc("svj_list_exercises");
    if (error)
      return { ok: false, exercises: [], error: error.message || "Couldn't load exercises." };
    const env = data;
    if (!env || env.ok !== true || !Array.isArray(env.exercises))
      return { ok: false, exercises: [], error: "The server returned an unreadable catalog." };
    const exercises = env.exercises.map(normalizeExerciseOption).filter((e) => e !== null);
    return { ok: true, exercises };
  } catch (e) {
    return { ok: false, exercises: [], error: e instanceof Error ? e.message : "Network error." };
  }
}
async function createCustomExercise(callRpc, input) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60)
    return { ok: false, error: "Exercise names are between 2 and 60 characters." };
  if (!MUSCLE_GROUPS.includes(input.primaryMuscle))
    return { ok: false, error: "Choose a primary muscle group." };
  try {
    const { data, error } = await callRpc("svj_create_custom_exercise", {
      p_name: name,
      p_primary_muscle: input.primaryMuscle,
      p_secondary_muscles: (input.secondaryMuscles ?? []).filter((m) => m !== input.primaryMuscle),
      p_exercise_type: input.exerciseType
    });
    if (error) return { ok: false, error: error.message || "Couldn't create the exercise." };
    const env = data;
    const exercise = env && env.ok === true ? normalizeExerciseOption(env.exercise) : null;
    if (!exercise) return { ok: false, error: "The server rejected this exercise." };
    return { ok: true, exercise };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function saveStrengthActivity(callRpc, input, nowMs = Date.now()) {
  const empty = {
    ok: false,
    strengthRecords: [],
    universalRecords: [],
    goalProgress: []
  };
  const sessionId = input.clientSessionId?.trim() ?? "";
  if (sessionId.length < 8 || sessionId.length > 100)
    return { ...empty, error: "This workout cannot be saved. Start a new workout." };
  const invalid = validateStrengthDraft(input.drafts);
  if (invalid) return { ...empty, error: invalid };
  if (!Number.isFinite(input.startedAtMs) || !Number.isFinite(input.endedAtMs))
    return { ...empty, error: "Workout times are invalid." };
  if (input.endedAtMs <= input.startedAtMs)
    return { ...empty, error: "Workout end must be after its start." };
  if (input.endedAtMs > nowMs + 5 * 6e4)
    return { ...empty, error: "Workout end time cannot be in the future." };
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 86400)
    return { ...empty, error: "Workout duration is out of range." };
  const names = new Map(input.drafts.map((d) => [d.exerciseId, d.name]));
  try {
    const { data, error } = await callRpc("svj_save_strength_activity", {
      p_client_session_id: sessionId,
      p_started_at: new Date(input.startedAtMs).toISOString(),
      p_ended_at: new Date(input.endedAtMs).toISOString(),
      p_duration_seconds: Math.round(input.durationSeconds),
      p_exercises: buildStrengthPayload(input.drafts),
      p_perceived_effort: input.perceivedEffort ?? null,
      p_notes: input.notes?.trim() ? input.notes.trim() : null
    });
    if (error) return { ...empty, error: error.message || "Couldn't save the workout." };
    const env = data;
    if (!env || env.ok !== true || typeof env.activity !== "object")
      return { ...empty, error: "The server rejected this workout." };
    const activity = normalizeServerActivity(env.activity);
    if (!activity) return { ...empty, error: "The server returned an unreadable workout." };
    return {
      ok: true,
      duplicate: env.duplicate === true,
      activity,
      ...extractStrengthExtras(data, names)
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function getStrengthDetail(callRpc, activityId) {
  if (!activityId) return { ok: false, error: "Missing workout." };
  try {
    const { data, error } = await callRpc("svj_get_strength_detail", {
      p_activity_id: activityId
    });
    if (error) return { ok: false, error: error.message || "Couldn't load the workout." };
    const detail = normalizeStrengthDetail(data);
    if (!detail) return { ok: false, error: "The server returned an unreadable workout." };
    return { ok: true, detail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function listStrengthSummaries(callRpc, limit = 100) {
  try {
    const { data, error } = await callRpc("svj_list_strength_summaries", { p_limit: limit });
    if (error) return { ok: false, summaries: /* @__PURE__ */ new Map(), error: error.message };
    const env = data;
    if (!env || env.ok !== true || !Array.isArray(env.summaries))
      return { ok: false, summaries: /* @__PURE__ */ new Map(), error: "Unexpected strength summary response." };
    const summaries = /* @__PURE__ */ new Map();
    for (const raw of env.summaries) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw;
      const activityId = typeof row.activity_id === "string" ? row.activity_id : null;
      const summary = normalizeStrengthSummary(row);
      if (activityId && summary) summaries.set(activityId, summary);
    }
    return { ok: true, summaries };
  } catch (e) {
    return {
      ok: false,
      summaries: /* @__PURE__ */ new Map(),
      error: e instanceof Error ? e.message : "Network error."
    };
  }
}
async function getExerciseHistory(callRpc, exerciseId, limit = 20) {
  if (!exerciseId) return { ok: false, error: "Missing exercise." };
  try {
    const { data, error } = await callRpc("svj_get_exercise_history", {
      p_exercise_id: exerciseId,
      p_limit: limit
    });
    if (error) return { ok: false, error: error.message || "Couldn't load exercise history." };
    const history = normalizeExerciseHistory(data);
    if (!history) return { ok: false, error: "The server returned unreadable history." };
    return { ok: true, history };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function listStrengthRecords(callRpc) {
  try {
    const { data, error } = await callRpc("svj_list_strength_records");
    if (error) return { ok: false, records: [], error: error.message || "Couldn't load records." };
    const env = data;
    if (!env || env.ok !== true || !Array.isArray(env.records))
      return { ok: false, records: [], error: "The server returned an unreadable response." };
    return {
      ok: true,
      records: env.records.map(normalizeStrengthRecord).filter((r) => r !== null)
    };
  } catch (e) {
    return { ok: false, records: [], error: e instanceof Error ? e.message : "Network error." };
  }
}

// src/app/components/StrengthDetails.tsx
import { useCallback as useCallback6, useEffect as useEffect9, useState as useState9 } from "react";
import { ChevronLeft as ChevronLeft2, History, Loader2 as Loader22, RefreshCw, Trophy } from "lucide-react";

// src/app/lib/strengthClient.ts
function strengthRpcClient() {
  if (!hasSupabaseConfig()) return null;
  return supabase;
}

// src/app/components/StrengthDetails.tsx
import { Fragment as Fragment5, jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
var LEVEL_STYLES = {
  high: "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-[#F4F2ED]",
  medium: "border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]",
  low: "border-white/10 bg-[#08080A] text-[#8C8C90]"
};
var LEVEL_LABELS = {
  high: "High",
  medium: "Moderate",
  low: "Light"
};
var MuscleTrainedList = ({ muscles }) => {
  if (muscles.length === 0) return null;
  return /* @__PURE__ */ jsxs9("div", { "data-testid": "muscles-trained", children: [
    /* @__PURE__ */ jsx10("div", { className: "mb-1.5 font-inter text-[11px] font-semibold text-[#8C8C90]", children: "Muscles trained" }),
    /* @__PURE__ */ jsx10("div", { className: "flex flex-wrap gap-1.5", children: muscles.map((muscle) => /* @__PURE__ */ jsxs9(
      "span",
      {
        className: `svj-radius-row border px-2 py-1 font-inter text-[11px] font-medium ${LEVEL_STYLES[muscle.level]}`,
        children: [
          MUSCLE_LABELS[muscle.muscle],
          /* @__PURE__ */ jsx10("span", { className: "ml-1.5 text-[10px] opacity-80", children: LEVEL_LABELS[muscle.level] })
        ]
      },
      muscle.muscle
    )) })
  ] });
};
var StrengthSetsList = ({ exercises, onSelectExercise }) => /* @__PURE__ */ jsx10("div", { className: "space-y-3", "data-testid": "strength-sets", children: exercises.map((exercise) => {
  const volume = exercise.sets.reduce(
    (total, set) => total + (set.weightKg !== null && set.reps !== null ? set.weightKg * set.reps : 0),
    0
  );
  return /* @__PURE__ */ jsxs9(
    "div",
    {
      className: "svj-radius-card svj-lit-top border border-white/[0.06] bg-[#17171A] p-3",
      children: [
        /* @__PURE__ */ jsxs9("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsx10(
            "button",
            {
              type: "button",
              disabled: !onSelectExercise,
              onClick: () => onSelectExercise?.(exercise.exerciseId, exercise.name),
              className: "text-left font-inter text-sm font-semibold text-[#F4F2ED] disabled:cursor-default",
              children: exercise.name
            }
          ),
          /* @__PURE__ */ jsx10("span", { className: "font-inter text-[11px] text-[#8C8C90]", children: MUSCLE_LABELS[exercise.primaryMuscle] })
        ] }),
        /* @__PURE__ */ jsx10("ul", { className: "mt-2 space-y-1", children: exercise.sets.map((set) => /* @__PURE__ */ jsxs9(
          "li",
          {
            className: "flex items-center justify-between font-inter text-[12px]",
            children: [
              /* @__PURE__ */ jsxs9("span", { className: "text-[#8C8C90]", children: [
                "Set ",
                set.setNumber
              ] }),
              /* @__PURE__ */ jsx10("span", { className: "font-mono text-[#F4F2ED]", children: formatSetLabel(set) })
            ]
          },
          set.setNumber
        )) }),
        volume > 0 && /* @__PURE__ */ jsxs9("p", { className: "mt-1.5 font-inter text-[11px] text-[#8C8C90]", children: [
          "Volume ",
          /* @__PURE__ */ jsx10("span", { className: "font-mono text-[#F4F2ED]", children: formatVolume(volume) })
        ] }),
        exercise.notes && /* @__PURE__ */ jsx10("p", { className: "mt-1.5 font-inter text-[11px] text-[#F4F2ED]", children: exercise.notes })
      ]
    },
    `${exercise.exerciseId}-${exercise.position}`
  );
}) });
var ExerciseHistoryPanel = ({ exerciseId, exerciseName, onClose }) => {
  const [history, setHistory] = useState9(null);
  const [error, setError] = useState9(null);
  const [loading, setLoading] = useState9(true);
  const load = useCallback6(async () => {
    setLoading(true);
    setError(null);
    const client = strengthRpcClient();
    if (!client) {
      setError("Backend is not configured.");
      setLoading(false);
      return;
    }
    const result = await getExerciseHistory((fn, args) => client.rpc(fn, args), exerciseId, 20);
    if (result.ok && result.history) setHistory(result.history);
    else setError(result.error ?? "Couldn't load exercise history.");
    setLoading(false);
  }, [exerciseId]);
  useEffect9(() => {
    void load();
  }, [load]);
  return /* @__PURE__ */ jsxs9(
    "div",
    {
      className: "svj-radius-card svj-lit-top border border-white/[0.06] bg-[#17171A] p-3",
      "data-testid": "exercise-history",
      children: [
        /* @__PURE__ */ jsxs9("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs9(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "flex items-center gap-1 font-inter text-[11px] font-medium text-[#8C8C90] transition-colors hover:text-[#F4F2ED]",
              children: [
                /* @__PURE__ */ jsx10(ChevronLeft2, { className: "h-3.5 w-3.5" }),
                " Back"
              ]
            }
          ),
          /* @__PURE__ */ jsx10(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              "aria-label": "Refresh exercise history",
              className: "svj-radius-row border border-white/10 bg-[#08080A] p-1.5 text-[#8C8C90] transition-colors hover:text-[#F4F2ED]",
              children: /* @__PURE__ */ jsx10(RefreshCw, { className: "h-3 w-3" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "mt-2 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx10(History, { className: "h-3.5 w-3.5 text-[#E62846]" }),
          /* @__PURE__ */ jsx10("span", { className: "font-inter text-sm font-semibold text-[#F4F2ED]", children: history?.exercise.name ?? exerciseName })
        ] }),
        loading && /* @__PURE__ */ jsxs9("p", { className: "flex items-center justify-center gap-2 py-5 font-inter text-[11px] text-[#8C8C90]", children: [
          /* @__PURE__ */ jsx10(Loader22, { className: "h-3 w-3 animate-spin" }),
          " Loading history\u2026"
        ] }),
        !loading && error && /* @__PURE__ */ jsx10(
          SVJEmptyState,
          {
            compact: true,
            variant: "error",
            title: "History unavailable",
            description: error,
            action: /* @__PURE__ */ jsx10(
              "button",
              {
                type: "button",
                onClick: () => void load(),
                className: "svj-radius-row border border-[#C81E3A]/40 bg-[#C81E3A]/10 px-3 py-1.5 font-inter text-[11px] font-semibold text-[#E62846]",
                children: "Retry"
              }
            )
          }
        ),
        !loading && !error && history && history.sessions.length === 0 && /* @__PURE__ */ jsx10(
          SVJEmptyState,
          {
            compact: true,
            title: "No sessions yet",
            description: `Complete your first ${history.exercise.name} workout to start tracking progress.`
          }
        ),
        !loading && !error && history && history.sessions.length > 0 && /* @__PURE__ */ jsxs9(Fragment5, { children: [
          history.records.length > 0 && /* @__PURE__ */ jsxs9("div", { className: "mt-2 svj-radius-row border border-[#C9A227]/25 bg-[#C9A227]/5 p-2.5", children: [
            /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-1.5 font-inter text-[11px] font-semibold text-[#C9A227]", children: [
              /* @__PURE__ */ jsx10(Trophy, { className: "h-3 w-3" }),
              " Personal bests"
            ] }),
            /* @__PURE__ */ jsx10("ul", { className: "mt-1.5 space-y-1", children: history.records.map((record) => /* @__PURE__ */ jsxs9(
              "li",
              {
                className: "flex items-center justify-between font-inter text-[11px]",
                children: [
                  /* @__PURE__ */ jsx10("span", { className: "text-[#8C8C90]", children: STRENGTH_RECORD_LABELS[record.recordType] }),
                  /* @__PURE__ */ jsx10("span", { className: "font-mono text-[#F4F2ED]", children: formatRecordValue2(record.recordType, record.value) })
                ]
              },
              record.recordType
            )) })
          ] }),
          /* @__PURE__ */ jsxs9("div", { className: "mt-3 space-y-2", "data-testid": "exercise-history-sessions", children: [
            /* @__PURE__ */ jsx10("div", { className: "font-inter text-[11px] font-semibold text-[#8C8C90]", children: "Recent workouts" }),
            history.sessions.map((session) => /* @__PURE__ */ jsxs9(
              "div",
              {
                className: "svj-radius-row border border-white/[0.06] bg-[#08080A] p-2.5",
                children: [
                  /* @__PURE__ */ jsxs9("div", { className: "flex items-center justify-between font-inter text-[11px]", children: [
                    /* @__PURE__ */ jsx10("span", { className: "font-medium text-[#F4F2ED]", children: formatSessionDate(session.performedAt) }),
                    /* @__PURE__ */ jsxs9("span", { className: "text-[#8C8C90]", children: [
                      session.setCount,
                      " ",
                      session.setCount === 1 ? "set" : "sets",
                      session.volumeKg > 0 ? ` \xB7 ${formatVolume(session.volumeKg)}` : ""
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx10("ul", { className: "mt-1 space-y-0.5", children: session.sets.map((set) => /* @__PURE__ */ jsxs9(
                    "li",
                    {
                      className: "flex items-center justify-between font-inter text-[12px]",
                      children: [
                        /* @__PURE__ */ jsx10("span", { className: "text-[#8C8C90]", children: set.setNumber }),
                        /* @__PURE__ */ jsx10("span", { className: "font-mono text-[#F4F2ED]", children: formatSetLabel(set) })
                      ]
                    },
                    set.setNumber
                  )) })
                ]
              },
              session.activityId
            ))
          ] })
        ] })
      ]
    }
  );
};

// src/app/views/ActivityHistory.tsx
import { jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
var CompletedSessionCard = () => {
  const activity = useActivityOptional();
  const [type, setType] = useState10("walking");
  const [saved, setSaved] = useState10(false);
  const [duplicate, setDuplicate] = useState10(false);
  if (!activity || !activity.completedSession) return null;
  const session = activity.completedSession;
  const rewards = saved ? activity.lastSaveRewards : null;
  const save = async () => {
    const result = await activity.saveCompletedSession(type);
    if (result.ok) {
      setSaved(true);
      setDuplicate(result.duplicate === true);
    }
  };
  return /* @__PURE__ */ jsxs10(
    motion.div,
    {
      initial: { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      className: "mb-3 rounded-2xl border border-[#C81E3A]/30 bg-gradient-to-b from-[#C81E3A]/10 to-[#0B0B0C] p-3.5",
      "data-testid": "workout-complete",
      children: [
        /* @__PURE__ */ jsx11("p", { className: "font-anton text-lg uppercase tracking-wider text-white", children: "WORKOUT COMPLETE" }),
        /* @__PURE__ */ jsx11("p", { className: "mt-0.5 text-[10px] font-mono uppercase tracking-widest text-[#E62846]", children: ACTIVITY_TYPE_LABELS[type] }),
        /* @__PURE__ */ jsxs10("div", { className: "mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4", children: [
          /* @__PURE__ */ jsxs10("div", { className: "rounded-2xl bg-black/40 border border-white/5 p-3", children: [
            /* @__PURE__ */ jsx11("div", { className: "text-[9px] font-mono uppercase text-[#8C8C90]", children: "Duration" }),
            /* @__PURE__ */ jsx11("div", { className: "font-mono text-xl font-bold text-white", children: formatDurationLabel(session.durationSeconds) })
          ] }),
          /* @__PURE__ */ jsxs10("div", { className: "rounded-2xl bg-black/40 border border-white/5 p-3", children: [
            /* @__PURE__ */ jsx11("div", { className: "text-[9px] font-mono uppercase text-[#8C8C90]", children: "Steps" }),
            /* @__PURE__ */ jsx11("div", { className: "font-mono text-xl font-bold text-white", children: session.stepCount.toLocaleString() })
          ] })
        ] }),
        session.distanceMeters != null && session.distanceMeters > 0 && /* @__PURE__ */ jsxs10("p", { className: "mt-2 text-[10px] font-mono text-[#8C8C90]", children: [
          "Distance (measured): ",
          (session.distanceMeters / 1e3).toFixed(2),
          " km"
        ] }),
        /* @__PURE__ */ jsxs10("div", { className: "mt-4 flex items-center gap-2", children: [
          /* @__PURE__ */ jsx11(
            SVJSelect,
            {
              label: "Activity type",
              testId: "saved-activity-type",
              className: "flex-1",
              value: type,
              options: TYPE_OPTIONS,
              onChange: (next) => setType(next)
            }
          ),
          /* @__PURE__ */ jsxs10(
            "button",
            {
              type: "button",
              onClick: () => void save(),
              disabled: activity.saveState === "saving" || saved,
              className: "flex items-center gap-1.5 rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50",
              children: [
                /* @__PURE__ */ jsx11(Save, { className: "w-3.5 h-3.5" }),
                activity.saveState === "saving" ? "Saving\u2026" : saved ? "Saved" : "Save Activity"
              ]
            }
          )
        ] }),
        saved && /* @__PURE__ */ jsxs10(
          "p",
          {
            role: "status",
            className: "mt-2 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400",
            children: [
              /* @__PURE__ */ jsx11(CheckCircle2, { className: "w-3.5 h-3.5" }),
              duplicate ? "Already saved \u2014 no duplicate created." : "Saved to your activity history."
            ]
          }
        ),
        saved && !duplicate && rewards && (rewards.xpAwarded > 0 || Object.keys(rewards.statChanges).length > 0) && /* @__PURE__ */ jsxs10(
          "div",
          {
            "data-testid": "activity-rewards",
            className: "mt-2 rounded-full border border-[#C81E3A]/30 bg-black/40 px-3 py-2",
            children: [
              rewards.xpAwarded > 0 && /* @__PURE__ */ jsxs10("p", { className: "text-[11px] font-mono font-bold text-[#C81E3A]", children: [
                "+",
                rewards.xpAwarded,
                " XP"
              ] }),
              Object.entries(REWARD_STAT_LABELS).map(([key, label]) => {
                const gain = rewards.statChanges[key];
                if (!gain) return null;
                return /* @__PURE__ */ jsxs10("p", { className: "text-[10px] font-mono text-[#8C8C90]", children: [
                  label,
                  " +",
                  gain
                ] }, key);
              }),
              rewards.prBonusAwarded > 0 && /* @__PURE__ */ jsx11("p", { className: "mt-0.5 text-[10px] font-mono text-gold", children: "NEW PR \u{1F525}" })
            ]
          }
        ),
        activity.saveState === "error" && activity.lastSaveError && /* @__PURE__ */ jsxs10("div", { className: "mt-3 rounded-2xl border border-crimson/30 bg-crimson/5 p-3", children: [
          /* @__PURE__ */ jsxs10("p", { role: "alert", className: "flex items-start gap-1.5 text-[11px] font-mono text-crimson", children: [
            /* @__PURE__ */ jsx11(AlertCircle2, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }),
            "COULDN'T SAVE ACTIVITY \u2014 ",
            activity.lastSaveError
          ] }),
          /* @__PURE__ */ jsx11(
            "button",
            {
              type: "button",
              onClick: () => void activity.retrySaveCompletedSession(),
              className: "mt-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-crimson",
              children: "Retry"
            }
          )
        ] }),
        /* @__PURE__ */ jsx11(
          "button",
          {
            type: "button",
            onClick: () => activity.dismissCompletedSession(),
            className: "mt-3 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white",
            children: "Dismiss"
          }
        )
      ]
    }
  );
};
var TYPE_OPTIONS = ACTIVITY_TYPES.map((t) => ({
  value: t,
  label: ACTIVITY_TYPE_LABELS[t]
}));
var REWARD_STAT_LABELS = {
  fitness: "PHYSICAL",
  discipline: "DISCIPLINE",
  focus: "MENTAL"
};
var ActivityHistory = () => {
  const activity = useActivityOptional();
  const [state, setState] = useState10("loading");
  const [items, setItems] = useState10([]);
  const [error, setError] = useState10(null);
  const [selected, setSelected] = useState10(null);
  const [showManual, setShowManual] = useState10(false);
  const [summaries, setSummaries] = useState10(/* @__PURE__ */ new Map());
  const load = useCallback7(async () => {
    setState("loading");
    setError(null);
    if (!hasSupabaseConfig()) {
      setState("error");
      setError("Backend is not configured.");
      return;
    }
    const client = supabase;
    const result = await listServerActivities(
      () => client.rpc("svj_list_activities", { p_limit: 100 })
    );
    if (result.ok) {
      setItems(result.activities);
      setState("loaded");
      if (result.activities.some((a) => a.activityType === "strength")) {
        const extras = await listStrengthSummaries((fn, args) => client.rpc(fn, args), 100);
        if (extras.ok) setSummaries(extras.summaries);
      }
    } else {
      setError(result.error ?? "Couldn't load history.");
      setState("error");
    }
  }, []);
  useEffect10(() => {
    void load();
  }, [load]);
  const summaryFor = (item) => summaries.get(item.id);
  if (selected) {
    return /* @__PURE__ */ jsx11(
      ActivityDetail,
      {
        activity: selected,
        summary: summaries.get(selected.id),
        onBack: () => setSelected(null)
      }
    );
  }
  return /* @__PURE__ */ jsxs10(
    "div",
    {
      className: "svj-radius-card svj-lit-top mb-3 border border-white/[0.06] bg-[#17171A] p-3.5",
      "data-testid": "activity-history",
      children: [
        /* @__PURE__ */ jsx11(
          SVJSectionHeader,
          {
            title: "Activity history",
            icon: HistoryIcon,
            className: "mb-3",
            trailing: /* @__PURE__ */ jsxs10("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxs10(
                "button",
                {
                  type: "button",
                  onClick: () => setShowManual((v) => !v),
                  className: "flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#08080A] px-2.5 py-1.5 font-inter text-[11px] font-semibold text-[#8C8C90] hover:text-[#F4F2ED]",
                  children: [
                    /* @__PURE__ */ jsx11(Plus, { className: "h-3 w-3" }),
                    " Log"
                  ]
                }
              ),
              /* @__PURE__ */ jsx11(
                "button",
                {
                  type: "button",
                  onClick: () => void load(),
                  "aria-label": "Refresh history",
                  className: "rounded-lg border border-white/[0.08] bg-[#08080A] p-1.5 text-[#8C8C90] hover:text-[#F4F2ED]",
                  children: /* @__PURE__ */ jsx11(RefreshCw2, { className: "h-3.5 w-3.5" })
                }
              )
            ] })
          }
        ),
        showManual && activity && /* @__PURE__ */ jsx11(
          ManualActivityForm,
          {
            onClose: () => setShowManual(false),
            onSubmit: async (input) => {
              const result = await activity.logManualActivity(input);
              if (result.ok) {
                setShowManual(false);
                void load();
              }
              return result;
            },
            saving: activity.manualSaveState === "saving",
            error: activity.manualSaveError
          }
        ),
        state === "loading" && /* @__PURE__ */ jsx11("p", { className: "py-6 text-center font-inter text-[11px] text-[#8C8C90]", children: "Loading history\u2026" }),
        state === "error" && /* @__PURE__ */ jsxs10("div", { className: "svj-radius-row border border-crimson/30 bg-crimson/[0.06] p-3 text-center", children: [
          /* @__PURE__ */ jsx11("p", { className: "mb-2 font-inter text-[11px] leading-relaxed text-crimson", children: error }),
          /* @__PURE__ */ jsx11(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              className: "rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 font-inter text-[11px] font-semibold text-crimson",
              children: "Retry"
            }
          )
        ] }),
        state === "loaded" && items.length === 0 && /* @__PURE__ */ jsx11(
          SVJEmptyState,
          {
            icon: HistoryIcon,
            title: "No activities yet",
            description: "Recorded walks, runs, rides and logged workouts appear here with their real distance, pace and effort.",
            compact: true
          }
        ),
        state === "loaded" && items.length > 0 && /* @__PURE__ */ jsx11("ul", { className: "space-y-2", children: items.map((item) => /* @__PURE__ */ jsx11("li", { children: /* @__PURE__ */ jsxs10(
          "button",
          {
            type: "button",
            onClick: () => setSelected(item),
            className: "w-full rounded-2xl border border-white/5 bg-black/40 p-3 text-left transition-colors hover:border-[#C81E3A]/40",
            children: [
              /* @__PURE__ */ jsxs10("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ jsx11("span", { className: "font-mono text-xs font-bold uppercase tracking-wider text-white", children: ACTIVITY_TYPE_LABELS[item.activityType] }),
                /* @__PURE__ */ jsx11("span", { className: "text-[10px] font-mono text-[#8C8C90]", children: formatActivityDate(item.startedAt) })
              ] }),
              /* @__PURE__ */ jsxs10("div", { className: "mt-1.5 flex flex-wrap items-center gap-2 font-inter text-[10px] text-[#8C8C90]", children: [
                /* @__PURE__ */ jsx11("span", { children: formatDurationLabel(item.durationSeconds) }),
                item.stepCount > 0 && /* @__PURE__ */ jsxs10("span", { children: [
                  item.stepCount.toLocaleString(),
                  " steps"
                ] }),
                (summaryFor(item)?.exerciseCount ?? 0) > 0 && /* @__PURE__ */ jsxs10("span", { children: [
                  summaryFor(item).exerciseCount,
                  " ",
                  summaryFor(item).exerciseCount === 1 ? "exercise" : "exercises",
                  ",",
                  " ",
                  summaryFor(item).setCount,
                  " ",
                  summaryFor(item).setCount === 1 ? "set" : "sets"
                ] }),
                (summaryFor(item)?.volumeKg ?? 0) > 0 && /* @__PURE__ */ jsxs10("span", { children: [
                  formatVolume(summaryFor(item).volumeKg),
                  " volume"
                ] }),
                /* @__PURE__ */ jsx11(
                  "span",
                  {
                    className: `rounded border px-1.5 py-0.5 text-[9px] font-semibold ${item.source === "manual" ? "border-white/12 text-[#8C8C90]" : "border-[#C81E3A]/40 text-[#E62846]"}`,
                    children: item.source === "svj_native" ? "Tracked" : item.source === "strength_log" ? "Strength log" : "Manual"
                  }
                )
              ] })
            ]
          }
        ) }, item.id)) })
      ]
    }
  );
};
var ActivityDetail = ({ activity, summary, onBack }) => {
  const isStrength = activity.activityType === "strength";
  const [detail, setDetail] = useState10(null);
  const [detailError, setDetailError] = useState10(null);
  const [activeExercise, setActiveExercise] = useState10(null);
  useEffect10(() => {
    if (!isStrength) return;
    let cancelled = false;
    const client = strengthRpcClient();
    if (!client) {
      setDetailError("Backend is not configured.");
      return;
    }
    void (async () => {
      const result = await getStrengthDetail((fn, args) => client.rpc(fn, args), activity.id);
      if (cancelled) return;
      if (result.ok && result.detail) setDetail(result.detail);
      else setDetailError(result.error ?? "Couldn't load workout detail.");
    })();
    return () => {
      cancelled = true;
    };
  }, [isStrength, activity.id]);
  const strengthSummary = detail?.summary ?? summary;
  return /* @__PURE__ */ jsxs10("div", { className: "mb-3 rounded-2xl border border-white/5 bg-[#0B0B0C] p-3.5", children: [
    /* @__PURE__ */ jsxs10(
      "button",
      {
        type: "button",
        onClick: onBack,
        className: "mb-3 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white",
        children: [
          /* @__PURE__ */ jsx11(ChevronLeft3, { className: "w-3.5 h-3.5" }),
          " Back to history"
        ]
      }
    ),
    /* @__PURE__ */ jsx11("h3", { className: "font-inter text-lg font-semibold tracking-tight text-[#F4F2ED]", children: ACTIVITY_TYPE_LABELS[activity.activityType] }),
    /* @__PURE__ */ jsxs10("p", { className: "mt-1 flex flex-wrap items-center gap-x-2 font-inter text-[11px] text-[#8C8C90]", children: [
      /* @__PURE__ */ jsx11("span", { children: formatActivityDate(activity.startedAt) }),
      /* @__PURE__ */ jsx11("span", { "aria-hidden": true, className: "h-2.5 w-px bg-white/12" }),
      /* @__PURE__ */ jsxs10("span", { children: [
        new Date(activity.startedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        " \u2013 ",
        new Date(activity.endedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })
      ] })
    ] }),
    /* @__PURE__ */ jsxs10("dl", { className: "mt-3 space-y-1.5 text-[11px] font-mono", children: [
      /* @__PURE__ */ jsxs10("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx11("dt", { className: "text-[#8C8C90]", children: "Duration" }),
        /* @__PURE__ */ jsx11("dd", { className: "text-white", children: formatDurationLabel(activity.durationSeconds) })
      ] }),
      activity.stepCount > 0 && /* @__PURE__ */ jsxs10("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx11("dt", { className: "text-[#8C8C90]", children: "Steps" }),
        /* @__PURE__ */ jsx11("dd", { className: "text-white", children: activity.stepCount.toLocaleString() })
      ] }),
      activity.distanceMeters != null && /* @__PURE__ */ jsxs10("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx11("dt", { className: "text-[#8C8C90]", children: "Distance (measured)" }),
        /* @__PURE__ */ jsxs10("dd", { className: "text-white", children: [
          (activity.distanceMeters / 1e3).toFixed(2),
          " km"
        ] })
      ] }),
      activity.caloriesEstimate != null && /* @__PURE__ */ jsxs10("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx11("dt", { className: "text-[#8C8C90]", children: "Calories (est.)" }),
        /* @__PURE__ */ jsxs10("dd", { className: "text-white", children: [
          Math.round(activity.caloriesEstimate),
          " kcal"
        ] })
      ] }),
      activity.perceivedEffort != null && /* @__PURE__ */ jsxs10("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx11("dt", { className: "text-[#8C8C90]", children: "Perceived effort" }),
        /* @__PURE__ */ jsxs10("dd", { className: "text-white", children: [
          activity.perceivedEffort,
          "/10"
        ] })
      ] }),
      /* @__PURE__ */ jsxs10("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ jsx11("dt", { className: "text-[#8C8C90]", children: "Source" }),
        /* @__PURE__ */ jsx11("dd", { className: "text-white", children: activity.source === "svj_native" ? "Device tracking" : activity.source === "strength_log" ? "Structured strength log" : "Manual entry" })
      ] }),
      activity.notes && /* @__PURE__ */ jsxs10("div", { className: "pt-1", children: [
        /* @__PURE__ */ jsx11("dt", { className: "text-[#8C8C90]", children: "Notes" }),
        /* @__PURE__ */ jsx11("dd", { className: "mt-0.5 text-[#F4F2ED]", children: activity.notes })
      ] })
    ] }),
    activity.source === "svj_native" && /* @__PURE__ */ jsx11("div", { className: "mt-4 border-t border-white/5 pt-4", children: /* @__PURE__ */ jsx11(GpsActivityDetail, { activity, embedded: true }) }),
    isStrength && /* @__PURE__ */ jsxs10("div", { className: "mt-4 space-y-3", "data-testid": "strength-detail", children: [
      strengthSummary && strengthSummary.exerciseCount > 0 && /* @__PURE__ */ jsxs10("div", { className: "grid grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsx11(DetailStat, { label: "Exercises", value: String(strengthSummary.exerciseCount) }),
        /* @__PURE__ */ jsx11(DetailStat, { label: "Sets", value: String(strengthSummary.setCount) }),
        /* @__PURE__ */ jsx11(DetailStat, { label: "Volume", value: formatVolume(strengthSummary.volumeKg) })
      ] }),
      detail && detail.records.length > 0 && /* @__PURE__ */ jsxs10(
        "div",
        {
          className: "rounded-2xl border border-gold/40 bg-gold/5 p-3",
          "data-testid": "strength-detail-pr",
          children: [
            /* @__PURE__ */ jsxs10("p", { className: "flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-gold", children: [
              /* @__PURE__ */ jsx11(Trophy2, { className: "h-3.5 w-3.5" }),
              " Personal Record"
            ] }),
            /* @__PURE__ */ jsx11("ul", { className: "mt-1.5 space-y-1", children: detail.records.map((record) => /* @__PURE__ */ jsxs10(
              "li",
              {
                className: "flex items-center justify-between text-[11px] font-mono",
                children: [
                  /* @__PURE__ */ jsx11("span", { className: "text-[#F4F2ED]", children: record.exerciseName }),
                  /* @__PURE__ */ jsxs10("span", { className: "text-white", children: [
                    STRENGTH_RECORD_LABELS[record.recordType],
                    " \xB7 ",
                    formatRecordValue2(record.recordType, record.value)
                  ] })
                ]
              },
              `${record.recordType}-${record.exerciseId}`
            )) })
          ]
        }
      ),
      detail && detail.exercises.length === 0 && /* @__PURE__ */ jsx11("p", { className: "rounded-2xl border border-white/5 bg-black/40 p-3 text-center text-[10px] font-mono text-[#8C8C90]", children: "Logged without structured sets \u2014 no exercise history or protected records." }),
      activeExercise ? /* @__PURE__ */ jsx11(
        ExerciseHistoryPanel,
        {
          exerciseId: activeExercise.id,
          exerciseName: activeExercise.name,
          onClose: () => setActiveExercise(null)
        }
      ) : detail && detail.exercises.length > 0 && /* @__PURE__ */ jsx11(
        StrengthSetsList,
        {
          exercises: detail.exercises,
          onSelectExercise: (id, name) => setActiveExercise({ id, name })
        }
      ),
      detail && /* @__PURE__ */ jsx11(MuscleTrainedList, { muscles: detail.summary.muscles }),
      detail && detail.goalContributions.length > 0 && /* @__PURE__ */ jsxs10(
        "div",
        {
          className: "rounded-2xl border border-[#C81E3A]/25 bg-black/40 p-3",
          "data-testid": "strength-detail-goals",
          children: [
            /* @__PURE__ */ jsxs10("p", { className: "flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white", children: [
              /* @__PURE__ */ jsx11(Target, { className: "h-3.5 w-3.5 text-[#E62846]" }),
              " Goals Contributed To"
            ] }),
            /* @__PURE__ */ jsx11("ul", { className: "mt-1.5 space-y-1", children: detail.goalContributions.map((goal) => /* @__PURE__ */ jsxs10(
              "li",
              {
                className: "flex items-center justify-between text-[11px] font-mono",
                children: [
                  /* @__PURE__ */ jsx11("span", { className: "text-[#8C8C90]", children: goalLabel(goal) }),
                  /* @__PURE__ */ jsxs10("span", { className: "text-emerald-400", children: [
                    "+",
                    formatContribution(goal)
                  ] })
                ]
              },
              goal.goalId
            )) })
          ]
        }
      ),
      isStrength && !detail && !detailError && /* @__PURE__ */ jsxs10("p", { className: "flex items-center justify-center gap-2 py-3 text-[10px] font-mono uppercase text-[#8C8C90]", children: [
        /* @__PURE__ */ jsx11(Loader23, { className: "h-3 w-3 animate-spin" }),
        " Loading workout\u2026"
      ] }),
      detailError && /* @__PURE__ */ jsx11("p", { className: "text-[10px] font-mono text-crimson", children: detailError })
    ] })
  ] });
};
var DetailStat = ({ label, value }) => /* @__PURE__ */ jsxs10("div", { className: "rounded-full border border-white/5 bg-black/40 p-2 text-center", children: [
  /* @__PURE__ */ jsx11("div", { className: "text-[9px] font-mono uppercase text-[#8C8C90]", children: label }),
  /* @__PURE__ */ jsx11("div", { className: "font-mono text-sm font-bold text-white", children: value })
] });
var GOAL_METRIC_SHORT = {
  workout_count: "Workouts",
  step_total: "Steps",
  active_minutes: "Active Minutes",
  distance: "Distance"
};
function goalLabel(goal) {
  const period = goal.periodType === "monthly" ? (/* @__PURE__ */ new Date(`${goal.periodStart}T00:00:00`)).toLocaleDateString("en-GB", { month: "long" }) : "Weekly";
  return `${period} ${GOAL_METRIC_SHORT[goal.metric] ?? "Goal"}`;
}
function formatContribution(goal) {
  if (goal.metric === "distance") return `${(goal.contribution / 1e3).toFixed(2)} km`;
  if (goal.metric === "active_minutes") return `${Math.round(goal.contribution)} min`;
  return Math.round(goal.contribution).toLocaleString();
}
var ManualActivityForm = ({ onClose, onSubmit, saving, error }) => {
  const [type, setType] = useState10("strength");
  const [date, setDate] = useState10(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
  const [time, setTime] = useState10(() => (/* @__PURE__ */ new Date()).toTimeString().slice(0, 5));
  const [duration, setDuration] = useState10("30");
  const [effort, setEffort] = useState10("");
  const [notes, setNotes] = useState10("");
  const submit = async (e) => {
    e.preventDefault();
    const started2 = /* @__PURE__ */ new Date(`${date}T${time || "00:00"}`);
    if (Number.isNaN(started2.getTime())) return;
    const minutes = Number(duration);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) return;
    await onSubmit({
      activityType: type,
      startedAtMs: started2.getTime(),
      durationMinutes: minutes,
      perceivedEffort: effort ? Number(effort) : void 0,
      notes: notes.trim() || void 0
    });
  };
  return /* @__PURE__ */ jsxs10(
    "form",
    {
      onSubmit: (e) => void submit(e),
      className: "mb-3 space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3",
      "data-testid": "manual-activity-form",
      children: [
        /* @__PURE__ */ jsxs10("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx11("span", { className: "text-[10px] font-mono uppercase tracking-wider text-white", children: "Log an activity" }),
          /* @__PURE__ */ jsx11("button", { type: "button", onClick: onClose, "aria-label": "Close form", children: /* @__PURE__ */ jsx11(X, { className: "w-3.5 h-3.5 text-[#8C8C90]" }) })
        ] }),
        /* @__PURE__ */ jsx11(
          SVJSelect,
          {
            label: "Activity type",
            testId: "log-activity-type",
            value: type,
            options: TYPE_OPTIONS,
            onChange: (next) => setType(next)
          }
        ),
        /* @__PURE__ */ jsxs10("div", { className: "grid grid-cols-1 gap-2 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsx11(
            SVJDatePicker,
            {
              label: "Date",
              testId: "log-activity-date",
              value: date,
              max: todayDateValue(),
              onChange: setDate
            }
          ),
          /* @__PURE__ */ jsx11(SVJTimePicker, { label: "Time", testId: "log-activity-time", value: time, onChange: setTime })
        ] }),
        /* @__PURE__ */ jsxs10("div", { className: "grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxs10("label", { className: "text-[9px] font-mono uppercase text-[#8C8C90]", children: [
            "Duration (min)",
            /* @__PURE__ */ jsx11(
              "input",
              {
                type: "number",
                min: 1,
                max: 1440,
                value: duration,
                onChange: (e) => setDuration(e.target.value),
                className: "mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs10("label", { className: "text-[9px] font-mono uppercase text-[#8C8C90]", children: [
            "Effort (1\u201310, optional)",
            /* @__PURE__ */ jsx11(
              "input",
              {
                type: "number",
                min: 1,
                max: 10,
                value: effort,
                onChange: (e) => setEffort(e.target.value),
                className: "mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx11(
          "textarea",
          {
            value: notes,
            onChange: (e) => setNotes(e.target.value),
            maxLength: 500,
            placeholder: "Notes (optional)",
            rows: 2,
            className: "w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white placeholder:text-[#8C8C90]/60"
          }
        ),
        error && /* @__PURE__ */ jsx11("p", { role: "alert", className: "text-[10px] font-mono text-crimson", children: error }),
        /* @__PURE__ */ jsx11(
          "button",
          {
            type: "submit",
            disabled: saving,
            className: "w-full rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50",
            children: saving ? "Saving\u2026" : "Save activity"
          }
        )
      ]
    }
  );
};

// src/app/views/TrainGoals.tsx
import { useCallback as useCallback8, useEffect as useEffect11, useState as useState11 } from "react";
import {
  Target as Target2,
  Trophy as Trophy3,
  Plus as Plus2,
  X as X2,
  RefreshCw as RefreshCw3,
  ChevronLeft as ChevronLeft4,
  CheckCircle2 as CheckCircle22,
  Loader2 as Loader24
} from "lucide-react";
import { jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
function rpcClient() {
  if (!hasSupabaseConfig()) return null;
  return supabase;
}
var ProgressBar = ({ percent }) => /* @__PURE__ */ jsx12("div", { className: "h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/60 p-0.5", children: /* @__PURE__ */ jsx12(
  "div",
  {
    className: "h-full rounded-full bg-gradient-to-r from-[#C81E3A] to-[#E62846]",
    style: { width: `${Math.min(100, Math.max(0, percent))}%` }
  }
) });
var TrainGoals = () => {
  const [goals, setGoals] = useState11(null);
  const [error, setError] = useState11(null);
  const [showCreate, setShowCreate] = useState11(false);
  const [tab, setTab] = useState11("active");
  const load = useCallback8(async () => {
    setError(null);
    const client = rpcClient();
    if (!client) {
      setError("Backend is not configured.");
      setGoals([]);
      return;
    }
    const result = await listGoals((fn, args) => client.rpc(fn, args), true);
    if (result.ok) setGoals(result.goals);
    else {
      setError(result.error ?? "Couldn't load goals.");
      setGoals([]);
    }
  }, []);
  useEffect11(() => {
    void load();
  }, [load]);
  const visible = (goals ?? []).filter(
    (g) => tab === "active" ? g.status === "active" : g.status === "completed"
  );
  return /* @__PURE__ */ jsxs11(
    "div",
    {
      className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5",
      "data-testid": "train-goals",
      children: [
        /* @__PURE__ */ jsxs11("div", { className: "mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx12(Target2, { className: "h-4 w-4 text-[#C81E3A]" }),
            /* @__PURE__ */ jsx12("span", { className: "font-inter text-[13px] font-semibold tracking-tight text-[#F4F2ED]", children: "My Goals" })
          ] }),
          /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs11(
              "button",
              {
                type: "button",
                onClick: () => setShowCreate((v) => !v),
                className: "flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#08080A] px-2.5 py-1.5 font-inter text-[11px] font-semibold text-[#8C8C90] hover:text-[#F4F2ED]",
                children: [
                  /* @__PURE__ */ jsx12(Plus2, { className: "h-3 w-3" }),
                  " Create"
                ]
              }
            ),
            /* @__PURE__ */ jsx12(
              "button",
              {
                type: "button",
                onClick: () => void load(),
                "aria-label": "Refresh goals",
                className: "rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white",
                children: /* @__PURE__ */ jsx12(RefreshCw3, { className: "h-3.5 w-3.5" })
              }
            )
          ] })
        ] }),
        showCreate && /* @__PURE__ */ jsx12(
          CreateGoalForm,
          {
            onClose: () => setShowCreate(false),
            onCreated: () => {
              setShowCreate(false);
              void load();
            }
          }
        ),
        /* @__PURE__ */ jsx12("div", { className: "mb-3 flex gap-2", children: ["active", "completed"].map((t) => /* @__PURE__ */ jsx12(
          "button",
          {
            type: "button",
            onClick: () => setTab(t),
            className: `flex-1 rounded-lg border px-2.5 py-1.5 font-inter text-[11px] font-semibold transition-colors ${tab === t ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white" : "border-white/10 bg-black/40 text-[#8C8C90]"}`,
            children: t
          },
          t
        )) }),
        goals === null && /* @__PURE__ */ jsx12("p", { className: "py-6 text-center font-inter text-[11px] text-[#8C8C90]", children: "Loading goals\u2026" }),
        error && /* @__PURE__ */ jsxs11("div", { className: "rounded-2xl border border-crimson/30 bg-crimson/5 p-3 text-center", children: [
          /* @__PURE__ */ jsx12("p", { className: "mb-2 text-[11px] font-mono text-crimson", children: error }),
          /* @__PURE__ */ jsx12(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              className: "rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 font-inter text-[11px] font-semibold text-crimson",
              children: "Retry"
            }
          )
        ] }),
        !error && goals !== null && visible.length === 0 && /* @__PURE__ */ jsx12("p", { className: "py-6 text-center text-[11px] font-mono text-[#8C8C90]", children: tab === "active" ? "No active goals yet \u2014 create one to start tracking." : "No completed goals yet." }),
        /* @__PURE__ */ jsx12("ul", { className: "space-y-2", children: visible.map((goal) => /* @__PURE__ */ jsx12(GoalCard, { goal, onChanged: () => void load() }, goal.id)) })
      ]
    }
  );
};
var GoalCard = ({ goal, onChanged }) => {
  const percent = Math.min(100, Math.round(goal.progress / goal.targetValue * 100));
  const completed = goal.status === "completed" || goal.progress >= goal.targetValue;
  const [editing, setEditing] = useState11(false);
  const [newTarget, setNewTarget] = useState11(String(goal.targetValue));
  const [busy, setBusy] = useState11(false);
  const [error, setError] = useState11(null);
  const saveEdit = async () => {
    const client = rpcClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    const result = await updateGoal((fn, args) => client.rpc(fn, args), goal.id, Number(newTarget));
    setBusy(false);
    if (result.ok) {
      setEditing(false);
      onChanged();
    } else setError(result.error ?? "Couldn't update the goal.");
  };
  const cancel = async () => {
    const client = rpcClient();
    if (!client) return;
    setBusy(true);
    const result = await cancelGoal((fn, args) => client.rpc(fn, args), goal.id);
    setBusy(false);
    if (result.ok) onChanged();
    else setError(result.error ?? "Couldn't cancel the goal.");
  };
  return /* @__PURE__ */ jsxs11("li", { className: "rounded-2xl border border-white/5 bg-black/40 p-3", children: [
    /* @__PURE__ */ jsxs11("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs11("span", { className: "font-mono text-xs font-bold uppercase tracking-wider text-white", children: [
        GOAL_METRIC_LABELS[goal.metric],
        goal.activityType ? ` \xB7 ${goal.activityType}` : ""
      ] }),
      /* @__PURE__ */ jsx12(
        "span",
        {
          className: `rounded border px-1.5 py-0.5 font-inter text-[9px] font-semibold ${completed ? "border-emerald-500/40 text-emerald-400" : "border-white/15 text-[#8C8C90]"}`,
          children: periodLabel(goal)
        }
      )
    ] }),
    /* @__PURE__ */ jsxs11("div", { className: "mt-1 flex items-baseline justify-between", children: [
      /* @__PURE__ */ jsxs11("span", { className: "font-mono text-lg font-bold text-white", children: [
        formatGoalProgress(goal.metric, goal.progress),
        /* @__PURE__ */ jsxs11("span", { className: "text-sm text-[#8C8C90]", children: [
          " / ",
          formatGoalProgress(goal.metric, goal.targetValue)
        ] })
      ] }),
      /* @__PURE__ */ jsxs11("span", { className: "font-mono text-sm font-bold text-[#E62846]", children: [
        percent,
        "%"
      ] })
    ] }),
    /* @__PURE__ */ jsx12("div", { className: "mt-1.5", children: /* @__PURE__ */ jsx12(ProgressBar, { percent }) }),
    completed && /* @__PURE__ */ jsxs11("p", { className: "mt-2 flex items-center gap-1.5 font-inter text-[10px] font-semibold text-emerald-400", children: [
      /* @__PURE__ */ jsx12(CheckCircle22, { className: "h-3.5 w-3.5" }),
      " GOAL COMPLETE"
    ] }),
    goal.status === "active" && !editing && /* @__PURE__ */ jsxs11("div", { className: "mt-2 flex gap-2", children: [
      /* @__PURE__ */ jsx12(
        "button",
        {
          type: "button",
          onClick: () => setEditing(true),
          className: "font-inter text-[10px] font-semibold text-[#8C8C90] hover:text-[#F4F2ED]",
          children: "Edit target"
        }
      ),
      /* @__PURE__ */ jsx12(
        "button",
        {
          type: "button",
          onClick: () => void cancel(),
          disabled: busy,
          className: "font-inter text-[10px] font-semibold text-[#8C8C90] hover:text-crimson",
          children: "Cancel goal"
        }
      )
    ] }),
    editing && /* @__PURE__ */ jsxs11("div", { className: "mt-2 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx12(
        "input",
        {
          type: "number",
          min: 1,
          value: newTarget,
          onChange: (e) => setNewTarget(e.target.value),
          className: "w-24 rounded-lg border border-white/10 bg-[#17171A] px-2 py-1.5 text-xs text-white"
        }
      ),
      /* @__PURE__ */ jsx12(
        "button",
        {
          type: "button",
          onClick: () => void saveEdit(),
          disabled: busy,
          className: "rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-2.5 py-1.5 font-inter text-[10px] font-semibold text-[#F4F2ED]",
          children: "Save"
        }
      ),
      /* @__PURE__ */ jsx12(
        "button",
        {
          type: "button",
          onClick: () => setEditing(false),
          className: "font-inter text-[10px] text-[#8C8C90]",
          children: "Cancel"
        }
      )
    ] }),
    error && /* @__PURE__ */ jsx12("p", { role: "alert", className: "mt-1.5 text-[10px] font-mono text-crimson", children: error })
  ] });
};
var CreateGoalForm = ({
  onClose,
  onCreated
}) => {
  const [metric, setMetric] = useState11("workout_count");
  const [periodType, setPeriodType] = useState11("monthly");
  const [target, setTarget] = useState11("12");
  const [activityType, setActivityType] = useState11("");
  const [busy, setBusy] = useState11(false);
  const [error, setError] = useState11(null);
  const submit = async (e) => {
    e.preventDefault();
    const bounds = periodType === "weekly" ? periodBoundsWeekly(/* @__PURE__ */ new Date()) : periodBoundsMonthly(/* @__PURE__ */ new Date());
    const input = {
      metric,
      targetValue: Number(target),
      periodType,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      activityType: activityType || null
    };
    const invalid = validateGoalInput(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    const client = rpcClient();
    if (!client) {
      setError("Backend is not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createGoal((fn, args) => client.rpc(fn, args), input);
    setBusy(false);
    if (result.ok) onCreated();
    else setError(result.error ?? "Couldn't create the goal.");
  };
  return /* @__PURE__ */ jsxs11(
    "form",
    {
      onSubmit: (e) => void submit(e),
      className: "mb-3 space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3",
      "data-testid": "create-goal-form",
      children: [
        /* @__PURE__ */ jsxs11("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx12("span", { className: "font-inter text-[11px] font-semibold text-[#F4F2ED]", children: "Create goal" }),
          /* @__PURE__ */ jsx12("button", { type: "button", onClick: onClose, "aria-label": "Close form", children: /* @__PURE__ */ jsx12(X2, { className: "h-3.5 w-3.5 text-[#8C8C90]" }) })
        ] }),
        /* @__PURE__ */ jsxs11("div", { className: "grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxs11("label", { className: "font-inter text-[10px] font-semibold text-[#8C8C90]", children: [
            "Metric",
            /* @__PURE__ */ jsx12(
              "select",
              {
                value: metric,
                onChange: (e) => setMetric(e.target.value),
                className: "mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white",
                children: GOAL_METRICS.map((m) => /* @__PURE__ */ jsx12("option", { value: m, children: GOAL_METRIC_LABELS[m] }, m))
              }
            )
          ] }),
          /* @__PURE__ */ jsxs11("label", { className: "font-inter text-[10px] font-semibold text-[#8C8C90]", children: [
            "Period",
            /* @__PURE__ */ jsxs11(
              "select",
              {
                value: periodType,
                onChange: (e) => setPeriodType(e.target.value),
                className: "mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white",
                children: [
                  /* @__PURE__ */ jsx12("option", { value: "weekly", children: "Weekly" }),
                  /* @__PURE__ */ jsx12("option", { value: "monthly", children: "Monthly" })
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs11("div", { className: "grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxs11("label", { className: "font-inter text-[10px] font-semibold text-[#8C8C90]", children: [
            "Target",
            /* @__PURE__ */ jsx12(
              "input",
              {
                type: "number",
                min: 1,
                value: target,
                onChange: (e) => setTarget(e.target.value),
                className: "mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs11("label", { className: "font-inter text-[10px] font-semibold text-[#8C8C90]", children: [
            "Activity type (optional)",
            /* @__PURE__ */ jsxs11(
              "select",
              {
                value: activityType,
                onChange: (e) => setActivityType(e.target.value),
                className: "mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs text-white",
                children: [
                  /* @__PURE__ */ jsx12("option", { value: "", children: "Any" }),
                  ["walking", "running", "cycling", "strength", "yoga"].map((t) => /* @__PURE__ */ jsx12("option", { value: t, children: t }, t))
                ]
              }
            )
          ] })
        ] }),
        error && /* @__PURE__ */ jsx12("p", { role: "alert", className: "text-[10px] font-mono text-crimson", children: error }),
        /* @__PURE__ */ jsx12(
          "button",
          {
            type: "submit",
            disabled: busy,
            className: "w-full rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50",
            children: busy ? "Creating\u2026" : "Create goal"
          }
        )
      ]
    }
  );
};
var TrainProgress = () => {
  const [records, setRecords] = useState11(null);
  const [strengthRecords, setStrengthRecords] = useState11(null);
  const [error, setError] = useState11(null);
  const [historyExercise, setHistoryExercise] = useState11(null);
  const load = useCallback8(async () => {
    setError(null);
    const client = rpcClient();
    if (!client) {
      setError("Backend is not configured.");
      setRecords([]);
      setStrengthRecords([]);
      return;
    }
    const result = await listRecords((fn, args) => client.rpc(fn, args));
    if (result.ok) setRecords(result.records);
    else {
      setError(result.error ?? "Couldn't load records.");
      setRecords([]);
    }
    const strength = await listStrengthRecords((fn, args) => client.rpc(fn, args));
    setStrengthRecords(strength.ok ? strength.records : []);
  }, []);
  useEffect11(() => {
    void load();
  }, [load]);
  return /* @__PURE__ */ jsxs11(
    "div",
    {
      className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5",
      "data-testid": "train-progress",
      children: [
        /* @__PURE__ */ jsxs11("div", { className: "mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx12(Trophy3, { className: "h-4 w-4 text-gold" }),
            /* @__PURE__ */ jsx12("span", { className: "font-inter text-[13px] font-semibold tracking-tight text-[#F4F2ED]", children: "Personal Records" })
          ] }),
          /* @__PURE__ */ jsx12(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              "aria-label": "Refresh records",
              className: "rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white",
              children: /* @__PURE__ */ jsx12(RefreshCw3, { className: "h-3.5 w-3.5" })
            }
          )
        ] }),
        records === null && /* @__PURE__ */ jsxs11("p", { className: "flex items-center justify-center gap-2 py-6 font-inter text-[11px] text-[#8C8C90]", children: [
          /* @__PURE__ */ jsx12(Loader24, { className: "h-3 w-3 animate-spin" }),
          " Loading records\u2026"
        ] }),
        error && /* @__PURE__ */ jsxs11("div", { className: "rounded-2xl border border-crimson/30 bg-crimson/5 p-3 text-center", children: [
          /* @__PURE__ */ jsx12("p", { className: "mb-2 text-[11px] font-mono text-crimson", children: error }),
          /* @__PURE__ */ jsx12(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              className: "rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 font-inter text-[11px] font-semibold text-crimson",
              children: "Retry"
            }
          )
        ] }),
        !error && records !== null && /* @__PURE__ */ jsx12("ul", { className: "space-y-2", children: TRAINING_RECORD_LABELS && Object.keys(TRAINING_RECORD_LABELS).map(
          (type) => {
            const record = records.find((r) => r.recordType === type);
            return /* @__PURE__ */ jsxs11(
              "li",
              {
                className: "flex items-center justify-between rounded-2xl border border-white/5 bg-black/40 p-3",
                children: [
                  /* @__PURE__ */ jsx12("span", { className: "font-mono text-xs font-bold uppercase tracking-wider text-white", children: TRAINING_RECORD_LABELS[type] }),
                  record ? /* @__PURE__ */ jsx12("span", { className: "font-mono text-sm font-bold text-[#E62846]", children: formatRecordValue(record.recordType, record.value) }) : /* @__PURE__ */ jsx12("span", { className: "font-inter text-[10px] text-[#8C8C90]", children: "Complete more activities to set this record" })
                ]
              },
              type
            );
          }
        ) }),
        historyExercise && /* @__PURE__ */ jsx12("div", { className: "mt-3", children: /* @__PURE__ */ jsx12(
          ExerciseHistoryPanel,
          {
            exerciseId: historyExercise.id,
            exerciseName: historyExercise.name,
            onClose: () => setHistoryExercise(null)
          }
        ) }),
        /* @__PURE__ */ jsxs11("div", { className: "mt-3", "data-testid": "train-strength-records", children: [
          /* @__PURE__ */ jsx12("p", { className: "mb-1.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8C8C90]", children: "Strength Records" }),
          strengthRecords !== null && strengthRecords.length === 0 && /* @__PURE__ */ jsx12("p", { className: "rounded-xl border border-white/[0.05] bg-[#08080A] p-3 text-center font-inter text-[10px] text-[#8C8C90]", children: "Complete a structured strength workout to set this record" }),
          strengthRecords !== null && strengthRecords.length > 0 && /* @__PURE__ */ jsx12("ul", { className: "space-y-2", children: strengthRecords.map((record) => /* @__PURE__ */ jsx12("li", { children: /* @__PURE__ */ jsxs11(
            "button",
            {
              type: "button",
              onClick: () => setHistoryExercise({ id: record.exerciseId, name: record.exerciseName }),
              className: "flex w-full items-center justify-between rounded-2xl border border-white/5 bg-black/40 p-3 text-left hover:border-[#C81E3A]/40",
              children: [
                /* @__PURE__ */ jsxs11("span", { className: "font-mono text-xs font-bold uppercase tracking-wider text-white", children: [
                  record.exerciseName,
                  /* @__PURE__ */ jsx12("span", { className: "ml-1.5 text-[9px] font-normal text-[#8C8C90]", children: STRENGTH_RECORD_LABELS[record.recordType] })
                ] }),
                /* @__PURE__ */ jsx12("span", { className: "font-mono text-sm font-bold text-[#E62846]", children: formatRecordValue2(record.recordType, record.value) })
              ]
            }
          ) }, `${record.recordType}-${record.exerciseId}`)) })
        ] }),
        !error && records !== null && records.length > 0 && /* @__PURE__ */ jsxs11("div", { className: "mt-3", children: [
          /* @__PURE__ */ jsx12("p", { className: "mb-1.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8C8C90]", children: "Recent records" }),
          /* @__PURE__ */ jsx12("ul", { className: "space-y-1", children: [...records].sort((a, b) => a.achievedAt < b.achievedAt ? 1 : -1).slice(0, 4).map((r) => /* @__PURE__ */ jsxs11(
            "li",
            {
              className: "flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5",
              children: [
                /* @__PURE__ */ jsx12("span", { className: "text-[10px] font-mono text-[#8C8C90]", children: new Date(r.achievedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short"
                }) }),
                /* @__PURE__ */ jsxs11("span", { className: "text-[10px] font-mono text-white", children: [
                  TRAINING_RECORD_LABELS[r.recordType],
                  " \xB7",
                  " ",
                  /* @__PURE__ */ jsx12("span", { className: "text-[#E62846]", children: formatRecordValue(r.recordType, r.value) })
                ] })
              ]
            },
            `${r.recordType}-${r.activityId}`
          )) })
        ] })
      ]
    }
  );
};

// src/app/views/TrainRecovery.tsx
import { useCallback as useCallback10, useEffect as useEffect14, useMemo as useMemo6, useState as useState14 } from "react";
import { HeartPulse, Loader2 as Loader25, Moon, RefreshCw as RefreshCw4 } from "lucide-react";

// src/app/lib/recovery.ts
function numericOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function normalizeReadiness(raw) {
  if (!raw || typeof raw !== "object") return null;
  const env = raw;
  if (typeof env.score !== "number") return null;
  const components = env.components && typeof env.components === "object" ? env.components : {};
  return {
    score: env.score,
    trainingLoad: env.trainingLoad ?? "moderate",
    recovery: env.recovery ?? "unknown",
    todayAdvice: typeof env.todayAdvice === "string" ? env.todayAdvice : "Train normally.",
    components
  };
}
async function getMyReadiness() {
  const client = rewardsRpcClient();
  if (!client) return { ok: false, error: "Backend is not configured." };
  try {
    const { data, error } = await client.rpc("svj_get_my_readiness");
    if (error) return { ok: false, error: error.message || "Readiness failed." };
    const readiness = normalizeReadiness(data);
    if (!readiness) return { ok: false, error: "Unreadable readiness response." };
    return { ok: true, readiness };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function saveMyRecoveryCheckin(input) {
  const client = rewardsRpcClient();
  if (!client) return { ok: false, error: "Backend is not configured." };
  if (input.sleepHours === null && input.soreness === null && input.energy === null && input.perceivedRecovery === null) {
    return { ok: false, error: "Fill at least one field." };
  }
  try {
    const { data, error } = await client.rpc("svj_save_my_recovery_checkin", {
      p_sleep_hours: input.sleepHours,
      p_soreness: input.soreness,
      p_energy: input.energy,
      p_perceived_recovery: input.perceivedRecovery
    });
    if (error) return { ok: false, error: error.message || "Check-in failed." };
    const readiness = normalizeReadiness(data);
    if (!readiness) return { ok: false, error: "Unreadable readiness response." };
    return { ok: true, readiness };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function listMyRecoveryHistory(limit = 30) {
  const client = rewardsRpcClient();
  if (!client) return { ok: false, error: "Backend is not configured." };
  try {
    const { data, error } = await client.rpc("svj_list_my_recovery_history", {
      p_limit: limit
    });
    if (error) return { ok: false, error: error.message || "History failed." };
    const history = Array.isArray(data) ? data.map((row) => {
      const r = row;
      return {
        date: String(r.date ?? ""),
        score: typeof r.score === "number" ? r.score : 0,
        trainingLoad: String(r.trainingLoad ?? "moderate"),
        recovery: String(r.recovery ?? "unknown"),
        hasCheckin: r.hasCheckin === true,
        sleepHours: numericOrNull(r.sleepHours),
        soreness: numericOrNull(r.soreness),
        energy: numericOrNull(r.energy),
        perceivedRecovery: numericOrNull(r.perceivedRecovery),
        activityLoadPoints: numericOrNull(r.loadPoints7d) ?? 0,
        restDaysLast3: numericOrNull(r.restDaysLast3)
      };
    }).filter((p) => p.date !== "") : [];
    return { ok: true, history };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

// src/app/context/SVJContext.tsx
import { createContext as createContext2, useContext as useContext2, useState as useState12, useEffect as useEffect12, useRef as useRef8, useCallback as useCallback9 } from "react";
import confetti from "canvas-confetti";

// src/app/lib/taskCompletions.ts
function localDayKey(date = /* @__PURE__ */ new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

// src/app/context/SVJContext.tsx
import { jsx as jsx13 } from "react/jsx-runtime";
var svjGlobal = globalThis;
var SVJContext = svjGlobal.__svjContext ?? (svjGlobal.__svjContext = createContext2(void 0));
var useSVJ2 = () => {
  const context = useContext2(SVJContext);
  if (!context) {
    throw new Error("useSVJ must be used within an SVJProvider");
  }
  return context;
};

// src/app/lib/recoveryInsights.ts
var TASK_LOAD_WEIGHTS = {
  Physical: 6,
  Discipline: 6,
  Nutrition: 4,
  Mental: 3,
  Mindset: 3
};
var DEFAULT_TASK_LOAD_WEIGHT = 3;
var LOAD_BAND_THRESHOLDS = { low: 120, moderate: 300, high: 520 };
var LOW_READINESS_THRESHOLD = 60;
var DEFAULT_WAKE_HOUR = 7;
var RECOVERY_HISTORY_DAYS = 60;
var RECOVERY_HISTORY_STORAGE_KEY = "svj_app_state_v5_recovery_history";
function dayKeyOffset(days, from = /* @__PURE__ */ new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDayKey(d);
}
function lastNDayKeys(days, from = /* @__PURE__ */ new Date()) {
  return Array.from({ length: days }, (_, i) => dayKeyOffset(-i, from));
}
function bandForLoad(points) {
  if (points <= LOAD_BAND_THRESHOLDS.low) return "low";
  if (points <= LOAD_BAND_THRESHOLDS.moderate) return "moderate";
  if (points <= LOAD_BAND_THRESHOLDS.high) return "high";
  return "very_high";
}
function gradeForScore(score) {
  if (score >= 78) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}
function taskLoadWeight(category) {
  return TASK_LOAD_WEIGHTS[category] ?? DEFAULT_TASK_LOAD_WEIGHT;
}
function taskLoadForDay(rows, dayKey) {
  return rows.filter((row) => row.dayKey === dayKey).reduce((sum, row) => sum + taskLoadWeight(row.category), 0);
}
function taskLoadPoints(ledgerRows, days = 7, from = /* @__PURE__ */ new Date()) {
  const window2 = new Set(lastNDayKeys(days, from));
  const inWindow = ledgerRows.filter((row) => !row.undoneAt && window2.has(row.dayKey));
  return {
    points: inWindow.reduce((sum, row) => sum + taskLoadWeight(row.category), 0),
    taskCount: inWindow.length
  };
}
function readinessAdvice(score) {
  return score >= 78 ? "Train normally \u2014 push if you feel good." : score >= 60 ? "Train normally." : score >= 40 ? "Light session recommended." : "Rest or very light movement today.";
}
function computeReadiness(input) {
  const activity = Math.max(0, Number(input.activityLoadPoints) || 0);
  const task = Math.max(0, Number(input.taskLoadPoints) || 0);
  const total = activity + task;
  const band = bandForLoad(total);
  const restDays = typeof input.restDays === "number" ? input.restDays : null;
  let penalty = 0;
  if (band === "high" && restDays === 0) penalty = 12;
  if (band === "very_high") penalty = 20;
  if (band === "very_high" && restDays === 0) penalty = 28;
  let score = 70 - penalty;
  let recovery = "unknown";
  const checkin = input.checkin ?? null;
  const hasCheckin = !!checkin && (checkin.sleepHours !== null || checkin.soreness !== null || checkin.energy !== null || checkin.perceivedRecovery !== null);
  if (hasCheckin) {
    const sleepPoints = Math.min(20, Math.max(0, (Number(checkin.sleepHours ?? 7) - 5) / 3 * 20));
    const sorenessPoints = (6 - Number(checkin.soreness ?? 3)) * 5;
    const energyPoints = Number(checkin.energy ?? 3) * 4;
    const checkinPoints = Math.min(
      100,
      Math.max(0, (sleepPoints + sorenessPoints + energyPoints) / 60 * 100)
    );
    score = Math.round(score * 0.5 + checkinPoints * 0.5);
    if (checkin.perceivedRecovery === 5) score += 5;
    if (checkin.perceivedRecovery === 1) score -= 5;
    recovery = gradeForScore(Math.max(0, Math.min(100, score)));
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const sources = [];
  if (activity > 0) sources.push("recorded_activity");
  if (task > 0) sources.push("completed_tasks");
  if (hasCheckin) sources.push("user_checkin");
  return {
    score,
    band,
    recovery,
    components: {
      activityLoadPoints: activity,
      taskLoadPoints: task,
      totalLoadPoints: total,
      loadPenalty: penalty,
      taskCount: Math.max(0, Math.round(Number(input.taskCount) || 0)),
      restDaysLast3: restDays,
      sources
    },
    advice: readinessAdvice(score),
    isLow: score < LOW_READINESS_THRESHOLD
  };
}
function emptyDayRecord(date) {
  return {
    date,
    checkin: { sleepHours: null, soreness: null, energy: null, perceivedRecovery: null },
    activityLoadPoints: 0,
    taskLoadPoints: 0,
    totalLoadPoints: 0,
    band: "low",
    score: 0,
    recovery: "unknown",
    taskCount: 0
  };
}
function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row) => !!row && typeof row === "object" && typeof row.date === "string"
  ).map((row) => ({
    ...emptyDayRecord(row.date),
    ...row,
    checkin: { ...emptyDayRecord(row.date).checkin, ...row.checkin ?? {} }
  })).sort((a, b) => a.date.localeCompare(b.date)).slice(-RECOVERY_HISTORY_DAYS);
}
function upsertDayRecord(history, record) {
  const next = history.filter((row) => row.date !== record.date);
  next.push(record);
  return next.sort((a, b) => a.date.localeCompare(b.date)).slice(-RECOVERY_HISTORY_DAYS);
}
function trailingRecords(history, days = 7, now = /* @__PURE__ */ new Date()) {
  const byDate = new Map(history.map((row) => [row.date, row]));
  return lastNDayKeys(days, now).reverse().map((date) => byDate.get(date) ?? emptyDayRecord(date));
}
function mergeServerHistory(history, serverDays) {
  let merged = history;
  const locallyScored = new Set(history.filter((row) => row.score > 0).map((row) => row.date));
  for (const day of serverDays) {
    if (!day || typeof day.date !== "string" || day.date === "") continue;
    const existing = merged.find((row) => row.date === day.date);
    const base = existing ?? emptyDayRecord(day.date);
    const serverCheckin = {};
    if (day.hasCheckin) {
      if (typeof day.sleepHours === "number") serverCheckin.sleepHours = day.sleepHours;
      if (typeof day.soreness === "number") serverCheckin.soreness = day.soreness;
      if (typeof day.energy === "number") serverCheckin.energy = day.energy;
      if (typeof day.perceivedRecovery === "number") {
        serverCheckin.perceivedRecovery = day.perceivedRecovery;
      }
    }
    const checkin = { ...base.checkin, ...serverCheckin };
    const serverLoad = Math.max(0, Number(day.activityLoadPoints) || 0);
    const keepLocalScore = locallyScored.has(day.date);
    const record = keepLocalScore ? {
      ...base,
      date: day.date,
      checkin,
      activityLoadPoints: base.activityLoadPoints > 0 ? base.activityLoadPoints : serverLoad
    } : {
      ...base,
      date: day.date,
      checkin,
      activityLoadPoints: serverLoad,
      totalLoadPoints: base.totalLoadPoints > 0 ? base.totalLoadPoints : serverLoad,
      score: Math.max(0, Math.min(100, Number(day.score) || 0)),
      band: day.band ?? base.band,
      recovery: day.recovery ?? base.recovery
    };
    merged = upsertDayRecord(merged, record);
  }
  return merged;
}
var hoursLabel = (fromHour, toHour) => `${fromHour.toFixed(1).replace(/\.0$/, "")}\u2013${toHour.toFixed(1).replace(/\.0$/, "")} h`;
function bestSleepRange(history, minPairs = 3) {
  const byDate = new Map(history.map((row) => [row.date, row]));
  const buckets = /* @__PURE__ */ new Map();
  let pairedDays = 0;
  for (const row of history) {
    const sleep = row.checkin.sleepHours;
    if (typeof sleep !== "number" || !Number.isFinite(sleep) || sleep <= 0 || sleep > 24) continue;
    const nextDate = dayKeyOffset(1, /* @__PURE__ */ new Date(`${row.date}T12:00:00`));
    const next = byDate.get(nextDate);
    if (!next) continue;
    const energy = next.checkin.energy;
    const hasScore = next.score > 0;
    if (typeof energy !== "number" && !hasScore) continue;
    pairedDays += 1;
    const bucketKey = Math.floor(sleep * 2) / 2;
    const bucket = buckets.get(bucketKey) ?? { energy: [], score: [] };
    if (typeof energy === "number") bucket.energy.push(energy);
    if (hasScore) bucket.score.push(next.score);
    buckets.set(bucketKey, bucket);
  }
  const list = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([fromHour, values]) => ({
    fromHour,
    toHour: fromHour + 0.5,
    samples: Math.max(values.energy.length, values.score.length),
    avgNextEnergy: values.energy.length ? values.energy.reduce((a, b) => a + b, 0) / values.energy.length : null,
    avgNextScore: values.score.length ? values.score.reduce((a, b) => a + b, 0) / values.score.length : null
  }));
  const eligible = list.filter((bucket) => bucket.samples >= 2);
  const insufficientData = pairedDays < minPairs || eligible.length === 0;
  let best = null;
  if (!insufficientData) {
    best = eligible.reduce(
      (champion, bucket) => {
        const value = (b) => (b.avgNextEnergy ?? 0) * 25 + (b.avgNextScore ?? 0);
        if (!champion) return bucket;
        return value(bucket) > value(champion) ? bucket : champion;
      },
      null
    );
  }
  return {
    buckets: list,
    best,
    pairedDays,
    bestRangeLabel: best ? hoursLabel(best.fromHour, best.toHour) : null,
    insufficientData
  };
}
var FALLBACK_SLEEP_HOURS = 8;
var MIN_SLEEP_HOURS = 6;
function formatClock2(hoursFromMidnight) {
  const wrapped = (hoursFromMidnight % 24 + 24) % 24;
  const h = Math.floor(wrapped);
  const m = Math.round((wrapped - h) * 60);
  const hh = m === 60 ? (h + 1) % 24 : h;
  const mm = m === 60 ? 0 : m;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function recomputeSleepWindow(best, band, options = {}) {
  const loadAdjustmentMinutes = band === "very_high" ? 45 : band === "high" ? 30 : band === "moderate" ? 15 : 0;
  const personalised = !!best.best;
  const baseMin = personalised ? best.best.fromHour : FALLBACK_SLEEP_HOURS - 0.5;
  const baseMax = personalised ? best.best.toHour : FALLBACK_SLEEP_HOURS + 0.5;
  const minHours = Math.max(
    MIN_SLEEP_HOURS,
    Number((baseMin + loadAdjustmentMinutes / 60).toFixed(2))
  );
  const maxHours = Math.max(minHours, Number((baseMax + loadAdjustmentMinutes / 60).toFixed(2)));
  const wakeHour = options.wakeHour ?? DEFAULT_WAKE_HOUR;
  const wakeMinute = options.wakeMinute ?? 0;
  const wake = wakeHour + wakeMinute / 60;
  return {
    minHours,
    maxHours,
    bedtimeFrom: formatClock2(wake - maxHours),
    bedtimeTo: formatClock2(wake - minHours),
    loadAdjustmentMinutes,
    personalised,
    note: personalised ? `Based on your own logged sleep. Load adjustment: +${loadAdjustmentMinutes} min.` : "Log a few more nights to personalise this from your own sleep history."
  };
}
function readinessTrend(history, days = 7, now = /* @__PURE__ */ new Date()) {
  return trailingRecords(history, days, now).map((row) => {
    const parsed = /* @__PURE__ */ new Date(`${row.date}T12:00:00`);
    return {
      date: row.date,
      label: parsed.toLocaleDateString(void 0, { weekday: "short" }).slice(0, 2),
      score: row.score,
      sleepHours: row.checkin.sleepHours ?? null,
      band: row.band,
      hasData: row.score > 0 || row.checkin.sleepHours !== null
    };
  });
}

// src/app/lib/readinessShared.ts
import { createContext as createContext3, useContext as useContext3 } from "react";
var ReadinessHistoryContext = createContext3(null);
function useTrainRecoveryPublisher() {
  const context = useContext3(ReadinessHistoryContext);
  return context?.publish ?? null;
}

// src/app/components/ui-primitives/SVJScoreRing.tsx
import { useEffect as useEffect13, useState as useState13 } from "react";
import { jsx as jsx14, jsxs as jsxs12 } from "react/jsx-runtime";
var SVJScoreRing = ({
  value,
  max = 100,
  display,
  label,
  sublabel,
  size = 168,
  thickness = 12,
  tone = "crimson",
  className = ""
}) => {
  const tones = {
    crimson: "#C81E3A",
    premium: "#C9A227",
    physical: "#10B981",
    ambition: "#A855F7",
    intellect: "#F59E0B",
    mental: "#EAB308",
    social: "#3B82F6",
    discipline: "#F43F5E"
  };
  const color = tones[tone];
  const hasData = value !== null && Number.isFinite(value);
  const safeMax = max > 0 ? max : 100;
  const ratio = hasData ? Math.max(0, Math.min(1, value / safeMax)) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const center = size / 2;
  const [drawn, setDrawn] = useState13(false);
  useEffect13(() => {
    const id = window.setTimeout(() => setDrawn(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const numeral = hasData ? display ?? String(Math.round(value)) : "\u2014";
  return /* @__PURE__ */ jsxs12("div", { className: `flex flex-col items-center ${className}`, children: [
    /* @__PURE__ */ jsxs12("div", { className: "relative", style: { width: size, height: size }, children: [
      /* @__PURE__ */ jsxs12(
        "svg",
        {
          width: size,
          height: size,
          viewBox: `0 0 ${size} ${size}`,
          role: "img",
          "aria-label": hasData ? `${label}: ${numeral} out of ${safeMax}` : `${label}: no data recorded yet`,
          className: "-rotate-90",
          children: [
            /* @__PURE__ */ jsx14("defs", { children: /* @__PURE__ */ jsxs12("linearGradient", { id: `svj-ring-${tone}`, x1: "0", y1: "0", x2: "1", y2: "1", children: [
              /* @__PURE__ */ jsx14("stop", { offset: "0%", stopColor: color, stopOpacity: "0.55" }),
              /* @__PURE__ */ jsx14("stop", { offset: "100%", stopColor: color, stopOpacity: "1" })
            ] }) }),
            /* @__PURE__ */ jsx14(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: "rgba(255,255,255,0.055)",
                strokeWidth: thickness
              }
            ),
            /* @__PURE__ */ jsx14(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: "rgba(0,0,0,0.45)",
                strokeWidth: Math.max(1, thickness - 6)
              }
            ),
            hasData ? /* @__PURE__ */ jsx14(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: `url(#svj-ring-${tone})`,
                strokeWidth: thickness,
                strokeLinecap: "round",
                strokeDasharray: circumference,
                strokeDashoffset: drawn ? dashOffset : circumference,
                style: { transition: "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)" }
              }
            ) : /* @__PURE__ */ jsx14(
              "circle",
              {
                cx: center,
                cy: center,
                r: radius,
                fill: "none",
                stroke: "rgba(255,255,255,0.14)",
                strokeWidth: thickness,
                strokeLinecap: "round",
                strokeDasharray: "2 8"
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxs12("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
        /* @__PURE__ */ jsx14(
          "span",
          {
            className: "font-anton leading-none tracking-tight text-[#F4F2ED]",
            style: { fontSize: Math.round(size * 0.26) },
            children: numeral
          }
        ),
        /* @__PURE__ */ jsx14("span", { className: "mt-1 max-w-[80%] text-center text-[10px] font-inter font-semibold uppercase tracking-[0.14em] text-[#8C8C90]", children: label })
      ] })
    ] }),
    sublabel && /* @__PURE__ */ jsx14("p", { className: "mt-2 max-w-[220px] text-center text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: sublabel })
  ] });
};

// src/app/views/TrainRecovery.tsx
import { Fragment as Fragment6, jsx as jsx15, jsxs as jsxs13 } from "react/jsx-runtime";
var LOAD_LABELS = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very High"
};
var SCORE_COLOR = (score) => score >= 78 ? "#34d399" : score >= 60 ? "#eab308" : score >= 40 ? "#fb923c" : "#f87171";
var ScaleInput = ({ label, value, onChange, low, high, testId }) => /* @__PURE__ */ jsxs13("div", { className: "rounded-2xl border border-white/5 bg-black/40 p-3", "data-testid": testId, children: [
  /* @__PURE__ */ jsxs13("div", { className: "mb-1 flex items-center justify-between", children: [
    /* @__PURE__ */ jsx15("span", { className: "text-[10px] font-mono font-bold uppercase tracking-widest text-white", children: label }),
    value !== null && /* @__PURE__ */ jsx15(
      "button",
      {
        type: "button",
        onClick: () => onChange(null),
        className: "text-[9px] font-mono text-[#8C8C90] hover:text-white",
        children: "clear"
      }
    )
  ] }),
  /* @__PURE__ */ jsx15("div", { className: "flex justify-between gap-1.5", children: [1, 2, 3, 4, 5].map((n) => /* @__PURE__ */ jsx15(
    "button",
    {
      type: "button",
      onClick: () => onChange(n),
      className: `h-8 flex-1 rounded-lg border text-xs font-mono font-bold transition-colors ${value === n ? "border-[#C81E3A]/60 bg-[#C81E3A]/25 text-white" : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"}`,
      children: n
    },
    n
  )) }),
  /* @__PURE__ */ jsxs13("div", { className: "mt-1 flex justify-between text-[8px] font-mono uppercase text-[#8C8C90]", children: [
    /* @__PURE__ */ jsx15("span", { children: low }),
    /* @__PURE__ */ jsx15("span", { children: high })
  ] })
] });
function combine(serverReadiness, rows, checkin) {
  const task = taskLoadPoints(rows);
  return computeReadiness({
    activityLoadPoints: serverReadiness?.components.loadPoints7d ?? 0,
    taskLoadPoints: task.points,
    taskCount: task.taskCount,
    checkin,
    restDays: serverReadiness?.components.restDaysLast3 ?? null
  });
}
var serverDay = (point) => ({
  date: point.date,
  score: point.score,
  band: point.trainingLoad,
  recovery: point.recovery,
  hasCheckin: point.hasCheckin,
  sleepHours: point.sleepHours,
  soreness: point.soreness,
  energy: point.energy,
  perceivedRecovery: point.perceivedRecovery,
  activityLoadPoints: point.activityLoadPoints,
  restDaysLast3: point.restDaysLast3
});
var TrainRecovery = () => {
  const { taskCompletions } = useSVJ2();
  const [readiness, setReadiness] = useState14(null);
  const [history, setHistory] = useState14([]);
  const [dayHistory, setDayHistory] = useState14(
    () => normalizeHistory(readStoredJson(RECOVERY_HISTORY_STORAGE_KEY, []))
  );
  const [loading, setLoading] = useState14(true);
  const [saving, setSaving] = useState14(false);
  const [error, setError] = useState14(null);
  const [historyError, setHistoryError] = useState14(false);
  const [saved, setSaved] = useState14(false);
  const [sleepHours, setSleepHours] = useState14("");
  const [soreness, setSoreness] = useState14(null);
  const [energy, setEnergy] = useState14(null);
  const [perceived, setPerceived] = useState14(null);
  const checkinValues = useMemo6(() => {
    const hours = sleepHours.trim() === "" ? null : Number(sleepHours);
    return {
      sleepHours: hours !== null && Number.isFinite(hours) ? hours : null,
      soreness,
      energy,
      perceivedRecovery: perceived
    };
  }, [sleepHours, soreness, energy, perceived]);
  const today = useMemo6(
    () => combine(readiness, taskCompletions, checkinValues),
    [readiness, taskCompletions, checkinValues]
  );
  const persistToday = useCallback10((record) => {
    setDayHistory((previous) => {
      const next = upsertDayRecord(previous, record);
      writeStoredJson(RECOVERY_HISTORY_STORAGE_KEY, next);
      return next;
    });
  }, []);
  const load = useCallback10(async () => {
    setLoading(true);
    setError(null);
    setHistoryError(false);
    const stored = normalizeHistory(readStoredJson(RECOVERY_HISTORY_STORAGE_KEY, []));
    const r = await getMyReadiness();
    if (r.ok && r.readiness) {
      setReadiness(r.readiness);
      setSleepHours(
        r.readiness.components.sleepHours != null ? String(r.readiness.components.sleepHours) : ""
      );
      setSoreness(r.readiness.components.soreness ?? null);
      setEnergy(r.readiness.components.energy ?? null);
      setPerceived(r.readiness.components.perceivedRecovery ?? null);
    } else {
      setError(r.error ?? "Could not load readiness.");
    }
    const h = await listMyRecoveryHistory(14);
    setHistoryError(!h.ok);
    if (h.ok) setHistory(h.history ?? []);
    const merged = mergeServerHistory(stored, (h.history ?? []).map(serverDay));
    writeStoredJson(RECOVERY_HISTORY_STORAGE_KEY, merged);
    setDayHistory(merged);
    setLoading(false);
  }, []);
  useEffect14(() => {
    void load();
  }, [load]);
  useEffect14(() => {
    if (loading) return;
    const task = taskLoadPoints(taskCompletions);
    persistToday({
      date: localDayKey(),
      checkin: checkinValues,
      activityLoadPoints: readiness?.components.loadPoints7d ?? 0,
      taskLoadPoints: task.points,
      totalLoadPoints: today.components.totalLoadPoints,
      band: today.band,
      score: today.score,
      recovery: today.recovery,
      taskCount: task.taskCount
    });
  }, [loading, readiness, taskCompletions, checkinValues, today, persistToday]);
  const sleep = useMemo6(() => bestSleepRange(dayHistory), [dayHistory]);
  const window2 = useMemo6(() => recomputeSleepWindow(sleep, today.band), [sleep, today.band]);
  const trend = useMemo6(() => readinessTrend(dayHistory, 7), [dayHistory]);
  const todayTaskLoad = taskLoadForDay(
    taskCompletions.filter((row) => !row.undoneAt),
    localDayKey()
  );
  const submit = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    const hours = sleepHours.trim() === "" ? null : Number(sleepHours);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) {
      setError("Sleep hours must be between 0 and 24.");
      setSaving(false);
      return;
    }
    const result = await saveMyRecoveryCheckin({
      sleepHours: hours,
      soreness,
      energy,
      perceivedRecovery: perceived
    });
    if (result.ok && result.readiness) {
      setReadiness(result.readiness);
      setSaved(true);
      const h = await listMyRecoveryHistory(14);
      if (h.ok) setHistory(h.history ?? []);
      const task = taskLoadPoints(taskCompletions);
      const combined = computeReadiness({
        activityLoadPoints: result.readiness.components.loadPoints7d ?? 0,
        taskLoadPoints: task.points,
        taskCount: task.taskCount,
        checkin: {
          sleepHours: hours,
          soreness,
          energy,
          perceivedRecovery: perceived
        },
        restDays: result.readiness.components.restDaysLast3 ?? null
      });
      persistToday({
        date: localDayKey(),
        checkin: { sleepHours: hours, soreness, energy, perceivedRecovery: perceived },
        activityLoadPoints: result.readiness.components.loadPoints7d ?? 0,
        taskLoadPoints: task.points,
        totalLoadPoints: combined.components.totalLoadPoints,
        band: combined.band,
        score: combined.score,
        recovery: combined.recovery,
        taskCount: task.taskCount
      });
    } else {
      setError(result.error ?? "Check-in failed.");
    }
    setSaving(false);
  };
  const publish2 = useTrainRecoveryPublisher();
  useEffect14(() => {
    if (!publish2) return;
    publish2({ dayHistory, historyPoints: history, today });
  }, [publish2, dayHistory, history, today]);
  return /* @__PURE__ */ jsxs13(
    "div",
    {
      className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5",
      "data-testid": "train-recovery",
      children: [
        /* @__PURE__ */ jsxs13("div", { className: "mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs13("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx15(HeartPulse, { className: "h-4 w-4 text-rose-400" }),
            /* @__PURE__ */ jsx15("span", { className: "text-xs font-mono font-bold uppercase tracking-widest text-white", children: "Recovery" })
          ] }),
          /* @__PURE__ */ jsx15(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              "aria-label": "Refresh recovery",
              className: "rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white",
              children: /* @__PURE__ */ jsx15(RefreshCw4, { className: "h-3.5 w-3.5" })
            }
          )
        ] }),
        loading && /* @__PURE__ */ jsxs13("p", { className: "flex items-center justify-center gap-2 py-6 text-[11px] font-mono uppercase text-[#8C8C90]", children: [
          /* @__PURE__ */ jsx15(Loader25, { className: "h-3 w-3 animate-spin" }),
          " Loading readiness\u2026"
        ] }),
        error && /* @__PURE__ */ jsxs13("div", { className: "mb-3 rounded-2xl border border-crimson/30 bg-crimson/5 p-3 text-center", children: [
          /* @__PURE__ */ jsx15("p", { className: "mb-2 text-[11px] font-mono text-crimson", children: error }),
          /* @__PURE__ */ jsx15(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              className: "rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-crimson",
              children: "Retry"
            }
          )
        ] }),
        !loading && readiness && /* @__PURE__ */ jsxs13(Fragment6, { children: [
          /* @__PURE__ */ jsxs13("div", { className: "mb-4 flex items-center gap-4 rounded-2xl border border-white/5 bg-black/40 p-4", children: [
            /* @__PURE__ */ jsx15(
              SVJScoreRing,
              {
                value: today.score,
                max: 100,
                label: "Readiness",
                tone: today.score >= 78 ? "physical" : today.score >= 60 ? "mental" : "crimson",
                size: 132,
                thickness: 10
              }
            ),
            /* @__PURE__ */ jsxs13("div", { className: "min-w-0 flex-1 space-y-1.5", children: [
              /* @__PURE__ */ jsxs13("div", { children: [
                /* @__PURE__ */ jsx15("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Readiness" }),
                /* @__PURE__ */ jsxs13(
                  "p",
                  {
                    "data-testid": "recovery-score",
                    className: "font-anton text-xl tracking-wide",
                    style: { color: SCORE_COLOR(today.score) },
                    children: [
                      today.score,
                      " / 100"
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs13("div", { children: [
                /* @__PURE__ */ jsx15("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Training Load" }),
                /* @__PURE__ */ jsx15("p", { className: "text-sm font-mono font-bold text-white", children: LOAD_LABELS[today.band] ?? today.band }),
                /* @__PURE__ */ jsxs13("p", { className: "text-[10px] font-inter text-[#8C8C90]", children: [
                  Math.round(today.components.totalLoadPoints),
                  " load points over the last 7 days"
                ] })
              ] }),
              /* @__PURE__ */ jsxs13("div", { children: [
                /* @__PURE__ */ jsx15("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Recovery" }),
                /* @__PURE__ */ jsxs13("p", { className: "text-sm font-mono font-bold capitalize text-white", children: [
                  today.recovery === "unknown" ? "No check-in yet" : today.recovery,
                  today.recovery !== "unknown" && /* @__PURE__ */ jsx15("span", { className: "ml-1.5 text-[9px] uppercase text-[#8C8C90]", children: "your check-in" })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs13(
            "div",
            {
              className: "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3",
              "data-testid": "recovery-load-breakdown",
              children: [
                /* @__PURE__ */ jsxs13("div", { className: "rounded-xl border border-white/5 bg-black/40 p-3", children: [
                  /* @__PURE__ */ jsx15("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Recorded activity" }),
                  /* @__PURE__ */ jsxs13("p", { className: "font-mono text-lg font-bold text-white", children: [
                    Math.round(today.components.activityLoadPoints),
                    /* @__PURE__ */ jsx15("span", { className: "ml-1 text-[9px] uppercase text-[#8C8C90]", children: "pts / 7d" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs13(
                  "div",
                  {
                    className: "rounded-xl border border-white/5 bg-black/40 p-3",
                    "data-testid": "recovery-completed-tasks",
                    children: [
                      /* @__PURE__ */ jsx15("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Completed tasks" }),
                      /* @__PURE__ */ jsxs13("p", { className: "font-mono text-lg font-bold text-white", children: [
                        today.components.taskCount,
                        /* @__PURE__ */ jsx15("span", { className: "ml-1 text-[9px] uppercase text-[#8C8C90]", children: "tasks / 7d" })
                      ] })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs13(
                  "div",
                  {
                    className: "rounded-xl border border-white/5 bg-black/40 p-3",
                    "data-testid": "recovery-task-load",
                    children: [
                      /* @__PURE__ */ jsx15("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Task load" }),
                      /* @__PURE__ */ jsxs13("p", { className: "font-mono text-lg font-bold text-white", children: [
                        Math.round(today.components.taskLoadPoints),
                        /* @__PURE__ */ jsx15("span", { className: "ml-1 text-[9px] uppercase text-[#8C8C90]", children: "pts / 7d" })
                      ] })
                    ]
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsxs13("p", { className: "mb-3 rounded-2xl border border-[#C81E3A]/25 bg-[#C81E3A]/10 px-3 py-2 text-xs font-mono text-white", children: [
            /* @__PURE__ */ jsx15("span", { className: "mr-1.5 font-bold uppercase text-[#C81E3A]", children: "Today" }),
            today.advice
          ] }),
          today.isLow && /* @__PURE__ */ jsxs13(
            "p",
            {
              role: "status",
              "data-testid": "recovery-low-flag",
              className: "mb-4 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2 text-[11px] font-mono text-gold",
              children: [
                "Readiness is low (",
                today.score,
                ") \u2014 tomorrow's personalized tasks are capped at Medium difficulty so you can recover."
              ]
            }
          ),
          /* @__PURE__ */ jsxs13("div", { className: "mb-3 rounded-2xl border border-white/5 bg-black/30 p-3", children: [
            /* @__PURE__ */ jsxs13("p", { className: "mb-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]", children: [
              "Daily check-in ",
              /* @__PURE__ */ jsx15("span", { className: "normal-case text-[#8C8C90]/70", children: "\u2014 30 seconds" })
            ] }),
            /* @__PURE__ */ jsxs13(
              "label",
              {
                className: "mb-2.5 block rounded-2xl border border-white/5 bg-black/40 p-3",
                "data-testid": "recovery-sleep",
                children: [
                  /* @__PURE__ */ jsx15("span", { className: "mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-widest text-white", children: "Sleep (hours)" }),
                  /* @__PURE__ */ jsx15(
                    "input",
                    {
                      type: "number",
                      inputMode: "decimal",
                      min: 0,
                      max: 24,
                      step: 0.5,
                      value: sleepHours,
                      onChange: (e) => setSleepHours(e.target.value),
                      placeholder: "e.g. 7.5",
                      className: "w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm font-mono text-white placeholder:text-[#8C8C90]/50 focus:border-[#C81E3A]/50 focus:outline-none"
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ jsxs13("div", { className: "mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3", children: [
              /* @__PURE__ */ jsx15(
                ScaleInput,
                {
                  label: "Soreness",
                  value: soreness,
                  onChange: setSoreness,
                  low: "None",
                  high: "Severe",
                  testId: "recovery-soreness"
                }
              ),
              /* @__PURE__ */ jsx15(
                ScaleInput,
                {
                  label: "Energy",
                  value: energy,
                  onChange: setEnergy,
                  low: "Drained",
                  high: "Full",
                  testId: "recovery-energy"
                }
              ),
              /* @__PURE__ */ jsx15(
                ScaleInput,
                {
                  label: "Recovery",
                  value: perceived,
                  onChange: setPerceived,
                  low: "Rough",
                  high: "Fresh",
                  testId: "recovery-perceived"
                }
              )
            ] }),
            /* @__PURE__ */ jsx15(
              "button",
              {
                type: "button",
                onClick: () => void submit(),
                disabled: saving,
                className: "mt-1 w-full rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2.5 text-xs font-mono font-bold tracking-widest text-white transition-colors hover:bg-[#C81E3A]/30 disabled:opacity-50",
                children: saving ? "SAVING\u2026" : "SAVE CHECK-IN"
              }
            ),
            saved && /* @__PURE__ */ jsx15(
              "p",
              {
                role: "status",
                className: "mt-2 text-center text-[10px] font-mono uppercase text-emerald-400",
                children: "Check-in saved \u2014 readiness updated"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs13(
            "div",
            {
              className: "mb-3 rounded-2xl border border-white/5 bg-black/30 p-3",
              "data-testid": "recovery-sleep-window",
              children: [
                /* @__PURE__ */ jsxs13("p", { className: "mb-1.5 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]", children: [
                  /* @__PURE__ */ jsx15(Moon, { className: "h-3 w-3 text-gold" }),
                  " Tonight's sleep window"
                ] }),
                /* @__PURE__ */ jsxs13("p", { className: "font-mono text-xl font-semibold tracking-tight text-white", children: [
                  window2.minHours,
                  "\u2013",
                  window2.maxHours,
                  " h"
                ] }),
                /* @__PURE__ */ jsxs13("p", { className: "mt-0.5 text-xs font-mono text-[#8C8C90]", children: [
                  "In bed ",
                  window2.bedtimeFrom,
                  "\u2013",
                  window2.bedtimeTo,
                  " ",
                  /* @__PURE__ */ jsxs13("span", { className: "text-[#8C8C90]/70", children: [
                    "(assuming a ",
                    String(DEFAULT_WAKE_HOUR).padStart(2, "0"),
                    ":00 wake-up)"
                  ] })
                ] }),
                window2.loadAdjustmentMinutes > 0 && /* @__PURE__ */ jsxs13("p", { className: "mt-1 text-[10px] font-mono uppercase text-gold", children: [
                  "+",
                  window2.loadAdjustmentMinutes,
                  " min added for a ",
                  LOAD_LABELS[today.band],
                  " load day"
                ] }),
                /* @__PURE__ */ jsx15("p", { className: "mt-1 text-[10px] font-mono text-[#8C8C90]", children: window2.note })
              ]
            }
          ),
          /* @__PURE__ */ jsxs13(
            "div",
            {
              className: "mb-3 rounded-xl border-l-2 border-l-emerald-400/50 bg-white/[0.02] px-3.5 py-3",
              "data-testid": "recovery-best-sleep",
              children: [
                /* @__PURE__ */ jsx15("p", { className: "mb-1.5 text-[11px] font-inter font-semibold text-[#F4F2ED]", children: "Your best sleep window" }),
                sleep.insufficientData ? /* @__PURE__ */ jsxs13("p", { className: "text-[11px] font-mono text-[#8C8C90]", children: [
                  "Not enough history yet (",
                  sleep.pairedDays,
                  " of 3 logged nights compared). Keep checking in and this becomes your own number \u2014 never a generic one."
                ] }) : /* @__PURE__ */ jsxs13(Fragment6, { children: [
                  /* @__PURE__ */ jsx15("p", { className: "font-anton text-xl tracking-wide text-emerald-400", children: sleep.bestRangeLabel }),
                  /* @__PURE__ */ jsxs13("p", { className: "mt-0.5 text-xs font-inter text-[#8C8C90]", children: [
                    "Best next-day energy (",
                    sleep.best?.avgNextEnergy?.toFixed(1) ?? "\u2014",
                    "/5) across your last ",
                    sleep.pairedDays,
                    " logged nights."
                  ] }),
                  sleep.buckets.length > 1 && /* @__PURE__ */ jsx15("div", { className: "mt-2 space-y-1", children: sleep.buckets.map((bucket) => /* @__PURE__ */ jsxs13(
                    "div",
                    {
                      className: "flex items-center gap-2 text-[10px] font-mono text-[#8C8C90]",
                      children: [
                        /* @__PURE__ */ jsxs13("span", { className: "w-16 shrink-0", children: [
                          bucket.fromHour,
                          "\u2013",
                          bucket.toHour,
                          " h"
                        ] }),
                        /* @__PURE__ */ jsx15("span", { className: "flex-1", children: /* @__PURE__ */ jsx15(
                          "span",
                          {
                            className: "block h-1.5 rounded-full bg-[#C81E3A]",
                            style: { width: `${(bucket.avgNextEnergy ?? 0) / 5 * 100}%` }
                          }
                        ) }),
                        /* @__PURE__ */ jsx15("span", { className: "w-10 text-right", children: bucket.avgNextEnergy?.toFixed(1) ?? "\u2014" })
                      ]
                    },
                    bucket.fromHour
                  )) })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxs13(
            "div",
            {
              className: "rounded-xl border-l-2 border-l-[#C81E3A]/45 bg-white/[0.02] px-3.5 py-3",
              "data-testid": "recovery-7day-trend",
              children: [
                /* @__PURE__ */ jsx15("p", { className: "mb-2 text-[11px] font-inter font-semibold text-[#F4F2ED]", children: "7-day readiness and sleep" }),
                /* @__PURE__ */ jsx15("div", { className: "flex items-end gap-2", style: { height: 56 }, children: trend.map((point) => /* @__PURE__ */ jsxs13("div", { className: "flex flex-1 flex-col items-center gap-1", children: [
                  /* @__PURE__ */ jsx15(
                    "span",
                    {
                      className: "text-[9px] font-mono",
                      style: { color: SCORE_COLOR(point.score) },
                      children: point.hasData ? point.score : ""
                    }
                  ),
                  /* @__PURE__ */ jsx15("div", { className: "flex h-full w-full items-end", children: /* @__PURE__ */ jsx15(
                    "div",
                    {
                      title: `${point.date}: readiness ${point.score}, sleep ${point.sleepHours ?? "\u2014"} h`,
                      className: "w-full rounded-t-sm",
                      style: {
                        height: `${point.hasData ? Math.max(6, point.score) : 0}%`,
                        backgroundColor: SCORE_COLOR(point.score),
                        opacity: point.hasData ? 0.85 : 0.25
                      }
                    }
                  ) }),
                  /* @__PURE__ */ jsx15("span", { className: "text-[9px] font-inter text-[#8C8C90]", children: point.label }),
                  /* @__PURE__ */ jsx15("span", { className: "text-[9px] font-mono text-gold", children: point.sleepHours !== null ? `${point.sleepHours}h` : "\xB7" })
                ] }, point.date)) }),
                /* @__PURE__ */ jsxs13("p", { className: "mt-1.5 text-[10px] font-inter text-[#8C8C90]", children: [
                  "Bars show readiness score, the gold number is hours slept (",
                  history.length,
                  " server days recorded)."
                ] }),
                historyError && /* @__PURE__ */ jsx15(
                  "p",
                  {
                    role: "status",
                    "data-testid": "recovery-history-note",
                    className: "mt-1.5 text-[10px] font-inter text-[#C9A227]",
                    children: "Your server history couldn't be reached \u2014 showing only the days this device recorded. Nothing is invented."
                  }
                )
              ]
            }
          )
        ] })
      ]
    }
  );
};

// src/app/views/RouteLibrary.tsx
import { useCallback as useCallback11, useEffect as useEffect15, useState as useState15 } from "react";
import {
  AlertCircle as AlertCircle3,
  Bookmark as Bookmark2,
  ChevronDown as ChevronDown2,
  ChevronUp,
  Loader2 as Loader26,
  Pencil,
  Play,
  RefreshCw as RefreshCw5,
  Star,
  Trash2
} from "lucide-react";
import { jsx as jsx16, jsxs as jsxs14 } from "react/jsx-runtime";
function routePoints(route) {
  return routeToPoints(route.polyline);
}
var RouteLibrary = ({ client: injected, onStartRoute }) => {
  const [routes, setRoutes] = useState15([]);
  const [loading, setLoading] = useState15(true);
  const [error, setError] = useState15(null);
  const [expanded, setExpanded] = useState15(null);
  const [editing, setEditing] = useState15(null);
  const [draftName, setDraftName] = useState15("");
  const [busy, setBusy] = useState15(false);
  const client = injected ?? activityRpcClient();
  const load = useCallback11(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchRoutes(client);
    if (result.ok) {
      setRoutes(result.routes);
      setError(null);
    } else {
      setError(result.error ?? "Couldn't load your routes.");
    }
    setLoading(false);
  }, [client]);
  useEffect15(() => {
    void load();
  }, [load]);
  const toggleFavorite = async (route) => {
    if (!client) return;
    setBusy(true);
    try {
      const result = await updateRoute(client, route.id, { favorite: !route.favorite });
      if (!result.ok) setError(result.error ?? "Couldn't update this route.");
      else setRoutes((current) => current.map((r) => r.id === route.id ? result.route : r));
    } finally {
      setBusy(false);
    }
  };
  const rename = async (route) => {
    if (!client) return;
    const name = draftName.trim();
    if (!name || name === route.name) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      const result = await updateRoute(client, route.id, { name });
      if (!result.ok) setError(result.error ?? "Couldn't rename this route.");
      else {
        setRoutes((current) => current.map((r) => r.id === route.id ? result.route : r));
        setEditing(null);
      }
    } finally {
      setBusy(false);
    }
  };
  const remove = async (route) => {
    if (!client) return;
    setBusy(true);
    try {
      const result = await deleteRoute(client, route.id);
      if (!result.ok) setError(result.error ?? "Couldn't delete this route.");
      else setRoutes((current) => current.filter((r) => r.id !== route.id));
    } finally {
      setBusy(false);
    }
  };
  if (!client) {
    return /* @__PURE__ */ jsx16("p", { className: "text-[11px] font-mono text-[#8C8C90]", children: "Sign in to save and reuse your SVJ routes." });
  }
  return /* @__PURE__ */ jsxs14("div", { className: "space-y-3", "data-testid": "route-library", children: [
    /* @__PURE__ */ jsxs14("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs14("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx16(Bookmark2, { className: "h-4 w-4 text-[#E62846]" }),
        /* @__PURE__ */ jsx16("span", { className: "font-inter text-[13px] font-semibold tracking-tight text-[#F4F2ED]", children: "Route library" })
      ] }),
      /* @__PURE__ */ jsx16(
        "button",
        {
          type: "button",
          onClick: () => void load(),
          "aria-label": "Refresh routes",
          className: "rounded-lg border border-white/[0.08] bg-[#08080A] p-1.5 text-[#8C8C90] hover:text-[#F4F2ED]",
          children: /* @__PURE__ */ jsx16(RefreshCw5, { className: `h-3.5 w-3.5 ${loading ? "animate-spin" : ""}` })
        }
      )
    ] }),
    error && /* @__PURE__ */ jsxs14("div", { className: "svj-radius-row flex items-start gap-2 border border-crimson/30 bg-crimson/[0.06] p-3", children: [
      /* @__PURE__ */ jsx16(AlertCircle3, { className: "mt-0.5 h-4 w-4 shrink-0 text-crimson" }),
      /* @__PURE__ */ jsx16("p", { className: "flex-1 font-inter text-[11px] leading-relaxed text-crimson", children: error })
    ] }),
    loading && routes.length === 0 && /* @__PURE__ */ jsxs14("div", { className: "flex items-center gap-2 rounded-2xl border border-white/5 bg-black/40 p-4 text-[11px] font-mono text-[#8C8C90]", children: [
      /* @__PURE__ */ jsx16(Loader26, { className: "h-4 w-4 animate-spin" }),
      " Loading routes\u2026"
    ] }),
    !loading && routes.length === 0 && /* @__PURE__ */ jsxs14("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 text-center", children: [
      /* @__PURE__ */ jsx16(Bookmark2, { className: "mx-auto mb-2 h-5 w-5 text-[#8C8C90]" }),
      /* @__PURE__ */ jsx16("p", { className: "text-[11px] font-mono text-[#8C8C90]", children: "No saved routes yet. Record a workout, open it, and use \u201CSave as route\u201D." })
    ] }),
    routes.map((route) => /* @__PURE__ */ jsxs14(
      "div",
      {
        className: "overflow-hidden rounded-2xl border border-white/5 bg-[#0B0B0C]",
        "data-testid": "route-card",
        children: [
          /* @__PURE__ */ jsxs14("div", { className: "flex items-center gap-2 p-3", children: [
            /* @__PURE__ */ jsx16(
              "button",
              {
                type: "button",
                onClick: () => void toggleFavorite(route),
                disabled: busy,
                "aria-label": route.favorite ? "Remove from favourites" : "Add to favourites",
                className: `rounded-lg border p-1.5 ${route.favorite ? "border-gold/40 bg-gold/10 text-gold" : "border-white/10 text-[#8C8C90] hover:text-white"}`,
                children: /* @__PURE__ */ jsx16(Star, { className: `h-3.5 w-3.5 ${route.favorite ? "fill-gold" : ""}` })
              }
            ),
            /* @__PURE__ */ jsxs14("div", { className: "min-w-0 flex-1", children: [
              editing === route.id ? /* @__PURE__ */ jsx16(
                "input",
                {
                  value: draftName,
                  onChange: (event) => setDraftName(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") void rename(route);
                    if (event.key === "Escape") setEditing(null);
                  },
                  autoFocus: true,
                  "aria-label": "Route name",
                  className: "w-full rounded-lg border border-[#C81E3A]/50 bg-black/60 px-2 py-1 text-[11px] font-mono text-white focus:outline-none"
                }
              ) : /* @__PURE__ */ jsx16("div", { className: "truncate text-[12px] font-mono font-bold text-white", children: route.name }),
              /* @__PURE__ */ jsx16("div", { className: "text-[10px] font-mono text-[#8C8C90]", "data-testid": "route-subtitle", children: routeCardSubtitle(route) })
            ] }),
            /* @__PURE__ */ jsx16(
              "button",
              {
                type: "button",
                onClick: () => setExpanded(expanded === route.id ? null : route.id),
                "aria-label": "Toggle route details",
                className: "rounded-lg border border-white/10 p-1.5 text-[#8C8C90] hover:text-white",
                children: expanded === route.id ? /* @__PURE__ */ jsx16(ChevronUp, { className: "h-3.5 w-3.5" }) : /* @__PURE__ */ jsx16(ChevronDown2, { className: "h-3.5 w-3.5" })
              }
            )
          ] }),
          expanded === route.id && /* @__PURE__ */ jsxs14("div", { className: "space-y-3 border-t border-white/5 p-3", children: [
            /* @__PURE__ */ jsx16(
              ActivityMap,
              {
                points: routePoints(route),
                bounds: route.bounds,
                height: 190,
                emptyMessage: "This route has no geometry."
              }
            ),
            /* @__PURE__ */ jsxs14("div", { className: "flex flex-wrap gap-2", children: [
              onStartRoute && /* @__PURE__ */ jsxs14(
                "button",
                {
                  type: "button",
                  onClick: () => onStartRoute(route),
                  "data-testid": "start-from-route",
                  className: "flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 font-inter text-[11px] font-semibold text-[#F4F2ED]",
                  children: [
                    /* @__PURE__ */ jsx16(Play, { className: "h-3.5 w-3.5" }),
                    "Start workout"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs14(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    setEditing(route.id);
                    setDraftName(route.name);
                  },
                  className: "flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#08080A] px-3 py-2 font-inter text-[11px] font-semibold text-[#F4F2ED]",
                  children: [
                    /* @__PURE__ */ jsx16(Pencil, { className: "h-3.5 w-3.5" }),
                    "Rename"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs14(
                "button",
                {
                  type: "button",
                  disabled: busy,
                  onClick: () => void remove(route),
                  "data-testid": "delete-route",
                  className: "flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#08080A] px-3 py-2 font-inter text-[11px] font-semibold text-[#8C8C90] disabled:opacity-50",
                  children: [
                    /* @__PURE__ */ jsx16(Trash2, { className: "h-3.5 w-3.5" }),
                    "Delete"
                  ]
                }
              )
            ] })
          ] })
        ]
      },
      route.id
    ))
  ] });
};
function routeCardSubtitle(route) {
  const parts = [route.activityType, formatDistance(route.distanceMeters)];
  if (route.elevationGainMeters != null) {
    parts.push(`+${formatRouteElevation(route.elevationGainMeters)}`);
  }
  return parts.join(" \xB7 ");
}

// src/app/views/RecordsView.tsx
import { useCallback as useCallback12, useEffect as useEffect16, useMemo as useMemo7, useRef as useRef9, useState as useState16 } from "react";
import {
  AlertCircle as AlertCircle4,
  Crosshair as Crosshair2,
  Flame,
  Flag as Flag2,
  Loader2 as Loader27,
  RefreshCw as RefreshCw6,
  Trash2 as Trash22,
  Trophy as Trophy4,
  ZoomIn as ZoomIn2,
  ZoomOut as ZoomOut2
} from "lucide-react";
import { jsx as jsx17, jsxs as jsxs15 } from "react/jsx-runtime";
function formatRecordValue3(record) {
  switch (gpsRecordFormat(record.recordType)) {
    case "duration":
      return formatClock(record.value);
    case "pace":
      return formatPace(record.value);
    case "speed":
      return formatSpeed(record.value);
    default:
      return formatDistance(record.value);
  }
}
function recordLabel(recordType) {
  return GPS_RECORD_LABELS[recordType] ?? recordType;
}
var HeatmapCanvas = ({
  cells,
  height = 260
}) => {
  const surfaceRef = useRef9(null);
  const [width, setWidth] = useState16(400);
  const mapPoints = useMemo7(() => cells.map((cell) => ({ lat: cell.lat, lng: cell.lng })), [cells]);
  useEffect16(() => {
    const node = surfaceRef.current;
    if (!node) return;
    const update = () => {
      const measured = Math.round(node.getBoundingClientRect().width);
      if (measured > 0) setWidth(measured);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [cells.length]);
  const fitViewport = useMemo7(
    () => createTileViewport(mapPoints, width, height),
    [mapPoints, height]
  );
  const [zoom, setZoom] = useState16(null);
  const [pan, setPan] = useState16({ x: 0, y: 0 });
  const dragRef = useRef9(null);
  useEffect16(() => {
    setZoom(null);
    setPan({ x: 0, y: 0 });
  }, [cells]);
  const viewport = useMemo7(() => {
    if (zoom == null && pan.x === 0 && pan.y === 0) return fitViewport;
    return createTileViewportAtZoom(
      fitViewport.centerLat,
      fitViewport.centerLng,
      zoom ?? fitViewport.zoom,
      width,
      height,
      pan.x,
      pan.y
    );
  }, [fitViewport, height, pan, zoom]);
  const maxWeight = useMemo7(
    () => cells.reduce((max, cell) => Math.max(max, cell.weight), 0),
    [cells]
  );
  const projected = useMemo7(
    () => cells.map((cell) => viewport.project(cell.lat, cell.lng)),
    [cells, viewport]
  );
  const changeZoom = (delta) => {
    setZoom(
      (current) => Math.min(19, Math.max(3, Math.round(current ?? fitViewport.zoom) + delta))
    );
  };
  const resetView = () => {
    setZoom(null);
    setPan({ x: 0, y: 0 });
  };
  if (cells.length === 0) {
    return /* @__PURE__ */ jsxs15(
      "div",
      {
        className: "flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/8 bg-[#08080A]",
        style: { height },
        "data-testid": "heatmap-empty",
        children: [
          /* @__PURE__ */ jsx17(Flame, { className: "h-5 w-5 text-[#8C8C90]" }),
          /* @__PURE__ */ jsx17("p", { className: "px-6 text-center text-[11px] font-mono text-[#8C8C90]", children: "No GPS activity matches this filter yet." })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs15(
    "div",
    {
      ref: surfaceRef,
      className: "relative touch-none overflow-hidden rounded-2xl border border-white/8 bg-[#08080A]",
      style: { height },
      "data-testid": "heatmap",
      onPointerDown: (event) => {
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
      },
      onPointerUp: (event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      },
      onPointerCancel: () => {
        dragRef.current = null;
      },
      children: [
        SVJ_STREET_TILES.urlTemplate && viewport.tiles.map((tile) => /* @__PURE__ */ jsx17(
          "img",
          {
            src: SVJ_STREET_TILES.urlTemplate.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y)),
            alt: "",
            "aria-hidden": "true",
            draggable: false,
            className: "pointer-events-none absolute max-w-none select-none",
            style: { left: tile.left, top: tile.top, width: 256, height: 256 }
          },
          `${tile.z}/${tile.x}/${tile.y}`
        )),
        /* @__PURE__ */ jsx17(
          "svg",
          {
            viewBox: `0 0 ${width} ${height}`,
            className: "pointer-events-none absolute inset-0 w-full",
            style: { height },
            role: "img",
            "aria-label": "Personal activity heatmap",
            children: projected.map((point, index) => {
              const weight = cells[index]?.weight ?? 1;
              const intensity = maxWeight > 0 ? weight / maxWeight : 0;
              return /* @__PURE__ */ jsx17(
                "circle",
                {
                  cx: point.x,
                  cy: point.y,
                  r: 2.2 + intensity * 5.5,
                  fill: "#E62846",
                  opacity: 0.16 + intensity * 0.62
                },
                index
              );
            })
          }
        ),
        /* @__PURE__ */ jsxs15(
          "div",
          {
            className: "absolute left-2 top-2 flex flex-col gap-1",
            "aria-label": "Heatmap controls",
            "data-testid": "heatmap-controls",
            children: [
              /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: () => changeZoom(1),
                  "aria-label": "Zoom heatmap in",
                  className: "flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/75 text-white",
                  children: /* @__PURE__ */ jsx17(ZoomIn2, { className: "h-4 w-4" })
                }
              ),
              /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: () => changeZoom(-1),
                  "aria-label": "Zoom heatmap out",
                  className: "flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/75 text-white",
                  children: /* @__PURE__ */ jsx17(ZoomOut2, { className: "h-4 w-4" })
                }
              ),
              /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  onClick: resetView,
                  "aria-label": "Reset heatmap view",
                  className: "flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/75 text-white",
                  children: /* @__PURE__ */ jsx17(Crosshair2, { className: "h-4 w-4" })
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ jsxs15("span", { className: "absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 font-inter text-[9px] text-[#B8B8C0]", children: [
          /* @__PURE__ */ jsx17("span", { children: "Drag to pan" }),
          /* @__PURE__ */ jsx17("span", { "aria-hidden": true, className: "h-2.5 w-px bg-white/20" }),
          /* @__PURE__ */ jsxs15("span", { children: [
            "Zoom ",
            viewport.zoom
          ] })
        ] }),
        SVJ_STREET_TILES.attribution && /* @__PURE__ */ jsx17("span", { className: "absolute bottom-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-mono text-[#8C8C90]", children: SVJ_STREET_TILES.attribution })
      ]
    }
  );
};
var RecordsView = ({ client: injected }) => {
  const [section, setSection] = useState16("records");
  const [records, setRecords] = useState16([]);
  const [segments, setSegments] = useState16([]);
  const [cells, setCells] = useState16([]);
  const [heatmapLoading, setHeatmapLoading] = useState16(false);
  const [heatmapError, setHeatmapError] = useState16(null);
  const [range, setRange] = useState16("all");
  const [heatType, setHeatType] = useState16(null);
  const [loading, setLoading] = useState16(true);
  const [error, setError] = useState16(null);
  const [busy, setBusy] = useState16(false);
  const client = injected ?? activityRpcClient();
  const load = useCallback12(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [recordsResult, segmentsResult] = await Promise.all([
      fetchGpsRecords(client),
      fetchSegments(client)
    ]);
    if (recordsResult.ok) setRecords(recordsResult.records);
    if (segmentsResult.ok) setSegments(segmentsResult.segments);
    if (!recordsResult.ok && !segmentsResult.ok) {
      setError(recordsResult.error ?? segmentsResult.error ?? "Couldn't load your records.");
    } else {
      setError(null);
    }
    setLoading(false);
  }, [client]);
  useEffect16(() => {
    void load();
  }, [load]);
  const loadHeatmap = useCallback12(async () => {
    if (!client) return;
    setHeatmapLoading(true);
    const result = await fetchActivityHeatmap(client, { range, activityType: heatType });
    if (result.ok) {
      setCells(result.cells);
      setHeatmapError(null);
    } else {
      setHeatmapError(result.error ?? "Couldn't build your heatmap.");
    }
    setHeatmapLoading(false);
  }, [client, heatType, range]);
  useEffect16(() => {
    if (section !== "heatmap") return;
    void loadHeatmap();
  }, [loadHeatmap, section]);
  const removeSegment = async (segment) => {
    if (!client) return;
    setBusy(true);
    try {
      const result = await deleteSegment(client, segment.id);
      if (!result.ok) setError(result.error ?? "Couldn't delete this segment.");
      else setSegments((current) => current.filter((item) => item.id !== segment.id));
    } finally {
      setBusy(false);
    }
  };
  if (!client) {
    return /* @__PURE__ */ jsx17("p", { className: "text-[11px] font-mono text-[#8C8C90]", children: "Sign in to see your SVJ records, heatmap and personal segments." });
  }
  return /* @__PURE__ */ jsxs15("div", { className: "space-y-3", "data-testid": "records-view", children: [
    /* @__PURE__ */ jsx17("div", { className: "flex gap-1.5", "data-testid": "records-sections", children: [
      { id: "records", label: "Records", icon: Trophy4 },
      { id: "heatmap", label: "Heatmap", icon: Flame },
      { id: "segments", label: "Segments", icon: Flag2 }
    ].map((entry) => /* @__PURE__ */ jsxs15(
      "button",
      {
        type: "button",
        onClick: () => setSection(entry.id),
        className: `flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${section === entry.id ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white" : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"}`,
        children: [
          /* @__PURE__ */ jsx17(entry.icon, { className: "h-3.5 w-3.5" }),
          entry.label
        ]
      },
      entry.id
    )) }),
    error && /* @__PURE__ */ jsxs15("div", { className: "flex items-start gap-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3", children: [
      /* @__PURE__ */ jsx17(AlertCircle4, { className: "mt-0.5 h-4 w-4 shrink-0 text-crimson" }),
      /* @__PURE__ */ jsx17("p", { className: "flex-1 text-[11px] font-mono text-crimson", children: error })
    ] }),
    loading && records.length === 0 && segments.length === 0 && /* @__PURE__ */ jsxs15("div", { className: "flex items-center gap-2 rounded-2xl border border-white/[0.05] bg-[#08080A] p-3 font-inter text-[11px] text-[#8C8C90]", children: [
      /* @__PURE__ */ jsx17(Loader27, { className: "h-4 w-4 animate-spin" }),
      " Loading\u2026"
    ] }),
    section === "records" && /* @__PURE__ */ jsxs15("div", { className: "svj-radius-card svj-lit-top border border-white/[0.06] bg-[#17171A] p-3.5", children: [
      /* @__PURE__ */ jsx17(
        SVJSectionHeader,
        {
          title: "Personal bests",
          className: "mb-3",
          trailing: /* @__PURE__ */ jsx17(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              "aria-label": "Refresh records",
              className: "rounded-lg border border-white/[0.08] bg-[#08080A] p-1.5 text-[#8C8C90] hover:text-[#F4F2ED]",
              children: /* @__PURE__ */ jsx17(RefreshCw6, { className: "h-3.5 w-3.5" })
            }
          )
        }
      ),
      records.length === 0 ? /* @__PURE__ */ jsx17("p", { className: "font-inter text-[11px] leading-relaxed text-[#8C8C90]", children: "No GPS records yet. Record a run, walk or ride to set your first bests." }) : /* @__PURE__ */ jsx17("div", { className: "grid grid-cols-2 gap-2", children: records.map((record) => /* @__PURE__ */ jsxs15(
        "div",
        {
          className: "svj-radius-row border border-white/[0.05] bg-[#08080A] p-3",
          "data-testid": "record-card",
          children: [
            /* @__PURE__ */ jsx17("div", { className: "font-inter text-[10px] font-semibold text-[#8C8C90]", children: recordLabel(record.recordType) }),
            /* @__PURE__ */ jsx17("div", { className: "mt-1 font-mono text-base font-bold text-[#E62846]", children: formatRecordValue3(record) }),
            /* @__PURE__ */ jsxs15("div", { className: "mt-1 font-inter text-[10px] text-[#8C8C90]", children: [
              record.activityType,
              record.achievedAt && /* @__PURE__ */ jsx17("span", { className: "mt-0.5 block", children: new Date(record.achievedAt).toLocaleDateString() })
            ] })
          ]
        },
        record.recordType
      )) })
    ] }),
    section === "heatmap" && /* @__PURE__ */ jsxs15("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx17("div", { className: "flex flex-wrap gap-1.5", children: HEATMAP_RANGES.map((entry) => /* @__PURE__ */ jsx17(
        "button",
        {
          type: "button",
          onClick: () => setRange(entry),
          "data-testid": `heatmap-range-${entry}`,
          className: `rounded-lg border px-2.5 py-1.5 font-inter text-[11px] font-semibold transition-colors ${range === entry ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-[#F4F2ED]" : "border-white/[0.08] bg-[#08080A] text-[#8C8C90]"}`,
          children: HEATMAP_RANGE_LABELS[entry]
        },
        entry
      )) }),
      /* @__PURE__ */ jsxs15("div", { className: "flex flex-wrap gap-1.5", children: [
        /* @__PURE__ */ jsx17(
          "button",
          {
            type: "button",
            onClick: () => setHeatType(null),
            className: `rounded-lg border px-2.5 py-1.5 font-inter text-[11px] font-semibold transition-colors ${heatType == null ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-[#F4F2ED]" : "border-white/[0.08] bg-[#08080A] text-[#8C8C90]"}`,
            children: "All"
          }
        ),
        GPS_ACTIVITY_TYPES.map((type) => /* @__PURE__ */ jsx17(
          "button",
          {
            type: "button",
            onClick: () => setHeatType(type),
            "data-testid": `heatmap-type-${type}`,
            className: `rounded-lg border px-2.5 py-1.5 font-inter text-[11px] font-semibold capitalize transition-colors ${heatType === type ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-[#F4F2ED]" : "border-white/[0.08] bg-[#08080A] text-[#8C8C90]"}`,
            children: type
          },
          type
        ))
      ] }),
      heatmapLoading && /* @__PURE__ */ jsx17(
        "div",
        {
          className: "flex items-center justify-center rounded-2xl border border-white/8 bg-[#08080A]",
          style: { height: 260 },
          "data-testid": "heatmap-loading",
          children: /* @__PURE__ */ jsx17(Loader27, { className: "h-5 w-5 animate-spin text-[#8C8C90]" })
        }
      ),
      !heatmapLoading && heatmapError && /* @__PURE__ */ jsxs15(
        "div",
        {
          className: "flex flex-col items-center justify-center gap-2 rounded-2xl border border-crimson/30 bg-crimson/5",
          style: { height: 260 },
          "data-testid": "heatmap-error",
          children: [
            /* @__PURE__ */ jsx17(Flame, { className: "h-5 w-5 text-crimson" }),
            /* @__PURE__ */ jsx17("p", { className: "px-6 text-center font-inter text-[11px] leading-relaxed text-crimson", children: heatmapError }),
            /* @__PURE__ */ jsx17(
              "button",
              {
                type: "button",
                onClick: () => void loadHeatmap(),
                "data-testid": "heatmap-retry",
                className: "rounded-lg border border-white/12 bg-[#08080A] px-3 py-1.5 font-inter text-[11px] font-semibold text-[#F4F2ED]",
                children: "Retry"
              }
            )
          ]
        }
      ),
      !heatmapLoading && !heatmapError && /* @__PURE__ */ jsx17(HeatmapCanvas, { cells }),
      /* @__PURE__ */ jsx17("p", { className: "font-inter text-[10px] leading-relaxed text-[#8C8C90]", children: "Your heatmap is private and built only from workouts SVJ recorded on your own device. It is never shared with other members or used for ranking." })
    ] }),
    section === "segments" && /* @__PURE__ */ jsxs15("div", { className: "space-y-3", children: [
      segments.length === 0 && /* @__PURE__ */ jsxs15("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-3.5 text-center", children: [
        /* @__PURE__ */ jsx17(Flag2, { className: "mx-auto mb-2 h-5 w-5 text-[#8C8C90]" }),
        /* @__PURE__ */ jsx17("p", { className: "text-[11px] font-mono text-[#8C8C90]", children: "No personal segments yet. Open a saved GPS workout and create one from its route." })
      ] }),
      segments.map((segment) => /* @__PURE__ */ jsxs15(
        "div",
        {
          className: "svj-radius-card border border-white/[0.06] bg-[#17171A] p-3.5",
          "data-testid": "segment-card",
          children: [
            /* @__PURE__ */ jsxs15("div", { className: "flex items-start gap-2", children: [
              /* @__PURE__ */ jsxs15("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsx17("div", { className: "truncate font-inter text-[13px] font-semibold text-[#F4F2ED]", children: segment.name }),
                /* @__PURE__ */ jsxs15("div", { className: "mt-0.5 flex items-center gap-2 font-inter text-[10px] text-[#8C8C90]", children: [
                  /* @__PURE__ */ jsx17("span", { className: "capitalize", children: segment.activityType }),
                  /* @__PURE__ */ jsx17("span", { "aria-hidden": true, className: "h-2.5 w-px bg-white/10" }),
                  /* @__PURE__ */ jsxs15("span", { children: [
                    segment.attemptCount,
                    " attempt",
                    segment.attemptCount === 1 ? "" : "s"
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx17(
                "button",
                {
                  type: "button",
                  disabled: busy,
                  onClick: () => void removeSegment(segment),
                  "aria-label": `Delete ${segment.name}`,
                  className: "rounded-lg border border-white/10 p-1.5 text-[#8C8C90] hover:text-white disabled:opacity-50",
                  children: /* @__PURE__ */ jsx17(Trash22, { className: "h-3.5 w-3.5" })
                }
              )
            ] }),
            /* @__PURE__ */ jsxs15("div", { className: "mt-3 grid grid-cols-3 gap-2", children: [
              /* @__PURE__ */ jsxs15("div", { className: "svj-radius-row border border-white/[0.05] bg-[#08080A] p-2.5", children: [
                /* @__PURE__ */ jsx17("div", { className: "font-inter text-[10px] text-[#8C8C90]", children: "Best" }),
                /* @__PURE__ */ jsx17("div", { className: "font-mono text-sm font-bold text-[#E62846]", children: formatClock(segment.bestDurationSeconds) })
              ] }),
              /* @__PURE__ */ jsxs15("div", { className: "svj-radius-row border border-white/[0.05] bg-[#08080A] p-2.5", children: [
                /* @__PURE__ */ jsx17("div", { className: "font-inter text-[10px] text-[#8C8C90]", children: "Latest" }),
                /* @__PURE__ */ jsx17("div", { className: "font-mono text-sm font-bold text-[#F4F2ED]", children: formatClock(segment.lastDurationSeconds) })
              ] }),
              /* @__PURE__ */ jsxs15("div", { className: "svj-radius-row border border-white/[0.05] bg-[#08080A] p-2.5", children: [
                /* @__PURE__ */ jsx17("div", { className: "font-inter text-[10px] text-[#8C8C90]", children: "Change" }),
                /* @__PURE__ */ jsx17(
                  "div",
                  {
                    className: `font-mono text-sm font-bold ${(segment.improvementSeconds ?? 0) <= 0 ? "text-emerald-400" : "text-white"}`,
                    children: segment.improvementSeconds == null ? "\u2014" : segment.improvementSeconds <= 0 ? `\u2212${formatClock(Math.abs(segment.improvementSeconds))}` : `+${formatClock(segment.improvementSeconds)}`
                  }
                )
              ] })
            ] }),
            segment.recentAttempts.length > 0 && /* @__PURE__ */ jsx17("div", { className: "mt-3 space-y-1", children: segment.recentAttempts.slice(0, 5).map((attempt) => /* @__PURE__ */ jsxs15(
              "div",
              {
                className: "flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5",
                children: [
                  /* @__PURE__ */ jsx17("span", { className: "text-[10px] font-mono text-[#8C8C90]", children: attempt.startedAt ? new Date(attempt.startedAt).toLocaleDateString() : "\u2014" }),
                  /* @__PURE__ */ jsx17("span", { className: "text-[11px] font-mono text-white", children: formatClock(attempt.durationSeconds) })
                ]
              },
              attempt.activityId
            )) })
          ]
        },
        segment.id
      ))
    ] })
  ] });
};

// src/app/views/ConnectedDevicesView.tsx
import {
  useCallback as useCallback13,
  useEffect as useEffect17,
  useMemo as useMemo8,
  useReducer,
  useState as useState17,
  useSyncExternalStore
} from "react";
import {
  Activity,
  BatteryMedium,
  Bluetooth,
  HeartPulse as HeartPulse2,
  Loader2 as Loader28,
  Search,
  ShieldCheck,
  Watch as Watch2,
  Trash2 as Trash23,
  Unlink
} from "lucide-react";

// src/app/lib/bleHeartRate.ts
var HR_FORMAT_16BIT = 1;
var SENSOR_CONTACT_UNSUPPORTED = 4;
var SENSOR_CONTACT_SUPPORTED = 8;
var CONTACT_DETECTED = 2;
var ENERGY_PRESENT = 16;
var RR_PRESENT = 32;
function parseHeartRateMeasurement(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 2) return null;
  const flags = bytes[0];
  const wide = (flags & HR_FORMAT_16BIT) !== 0;
  if (wide && bytes.length < 3) return null;
  const bpm = wide ? bytes[1] | bytes[2] << 8 : bytes[1];
  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 250) return null;
  const measurement = {
    bpm,
    sensorContact: sensorContactState(flags)
  };
  let offset = wide ? 3 : 2;
  if ((flags & ENERGY_PRESENT) !== 0) {
    if (bytes.length < offset + 2) return null;
    const energy = bytes[offset] | bytes[offset + 1] << 8;
    if (energy > 0) measurement.energyExpendedJoules = energy;
    offset += 2;
  }
  if ((flags & RR_PRESENT) !== 0) {
    const intervals = [];
    for (; offset + 1 < bytes.length + 1 && offset + 1 <= bytes.length - 1; offset += 2) {
      const raw = bytes[offset] | bytes[offset + 1] << 8;
      if (raw === 0) continue;
      const ms = Math.round(raw * 1e3 / 1024);
      if (ms >= 250 && ms <= 2e3) intervals.push(ms);
    }
    if ((flags & RR_PRESENT) !== 0 && bytes.length < offset && intervals.length === 0) return null;
    if (intervals.length > 0) measurement.rrIntervalsMs = intervals;
  }
  return measurement;
}
function sensorContactState(flags) {
  if ((flags & SENSOR_CONTACT_SUPPORTED) !== 0) {
    return (flags & CONTACT_DETECTED) !== 0 ? "supported_contact" : "supported_no_contact";
  }
  if ((flags & SENSOR_CONTACT_UNSUPPORTED) !== 0) return "not_supported_or_no_contact";
  return "unsupported";
}
var HR_STALE_MS = 12e3;
function isHeartRateFresh(reading, nowMs, staleMs = HR_STALE_MS) {
  return reading != null && Number.isFinite(reading.bpm) && nowMs - reading.timestampMs <= staleMs;
}

// src/app/lib/wearable.ts
var VjWearable = registerPlugin("VjWearable");
function isNativeWearableAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("VjWearable");
}
function normalizeWearableHeartRate(raw, nowMs) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw;
  const measurement = parseHeartRateMeasurement(
    value.data instanceof Uint8Array || value.data instanceof ArrayBuffer ? value.data : new Uint8Array(0)
  );
  if (!measurement) return null;
  const timestampMs = typeof value.timestamp === "number" && Number.isFinite(value.timestamp) ? value.timestamp : nowMs;
  return {
    bpm: measurement.bpm,
    timestampMs,
    source: "ble",
    deviceName: typeof value.deviceName === "string" ? value.deviceName : void 0,
    deviceId: typeof value.deviceId === "string" ? value.deviceId : void 0,
    sensorContact: measurement.sensorContact
  };
}
function normalizeBatteryLevel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const percent = raw.level;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100)
    return null;
  return Math.round(percent);
}
function reduceWearableEvent(state, event, nowMs) {
  switch (event.type) {
    case "scan_started":
      return {
        ...state,
        scanning: true,
        discovered: [],
        connection: state.connection === "connected" ? state.connection : "scanning",
        error: null
      };
    case "scan_stopped":
      return {
        ...state,
        scanning: false,
        connection: state.device ? "connected" : state.connection === "scanning" ? "disconnected" : state.connection
      };
    case "devices_discovered":
      return { ...state, discovered: event.devices };
    case "connecting":
      return { ...state, scanning: false, connection: "connecting" };
    case "connected":
      return {
        ...state,
        scanning: false,
        connection: "connected",
        device: event.device,
        error: null
      };
    case "disconnected":
      return {
        ...state,
        connection: "disconnected",
        device: null,
        heartRate: null,
        batteryPercent: null
      };
    case "permission_denied":
      return {
        ...state,
        scanning: false,
        connection: "permission_denied",
        error: "Bluetooth permission denied"
      };
    case "bluetooth_unavailable":
      return {
        ...state,
        scanning: false,
        connection: "bluetooth_unavailable",
        error: "Bluetooth is off or unavailable"
      };
    case "heart_rate":
      return { ...state, heartRate: event.reading };
    case "battery":
      return { ...state, batteryPercent: event.percent };
    case "error":
      return { ...state, error: event.message };
    default:
      return state;
  }
}

// src/app/lib/wearOs.ts
var WEAR_PATHS = {
  handshake: "/svj/wear/handshake",
  command: "/svj/wear/command",
  sample: "/svj/wear/sample",
  state: "/svj/wear/state",
  summary: "/svj/wear/summary"
};
var WEAR_LISTENED_PATHS = [
  WEAR_PATHS.handshake,
  WEAR_PATHS.sample,
  WEAR_PATHS.state,
  WEAR_PATHS.summary
];
var WEAR_CAPABILITIES = [
  "heart_rate",
  "steps",
  "workout",
  "distance",
  "calories"
];
var WEAR_CAPABILITY_LABELS = {
  heart_rate: "Heart rate",
  steps: "Steps",
  workout: "Workout",
  distance: "Distance",
  calories: "Calories"
};
var WEAR_MEASUREMENT_TYPES = [
  "heart_rate",
  "steps",
  "distance",
  "calories",
  "cadence"
];
var WEAR_WORKOUT_STATES = ["idle", "running", "paused", "finished"];
var NO_WEAR_CAPABILITIES = {
  heart_rate: false,
  steps: false,
  workout: false,
  distance: false,
  calories: false
};
function normalizeWearCapabilities(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const result = { ...NO_WEAR_CAPABILITIES };
  for (const key of WEAR_CAPABILITIES) {
    result[key] = source[key] === true;
  }
  return result;
}
function describeWearCapabilities(capabilities) {
  return WEAR_CAPABILITIES.filter((key) => capabilities[key]);
}
var WEAR_CONNECTION_LABELS = {
  unavailable: "Not available on this device",
  companion_missing: "SVJ Wear OS app required",
  disconnected: "Not connected",
  connected: "Connected",
  reconnecting: "Reconnecting\u2026"
};
var EMPTY_WEAR_STATUS = {
  installed: false,
  connected: false,
  available: false,
  nodeName: null,
  protocol: null,
  capabilities: { ...NO_WEAR_CAPABILITIES },
  lastSeenMs: null,
  lastSeenAgeMs: null,
  activeSessionId: null
};
var WEAR_LIVE_WINDOW_MS = 3e4;
function wearConnectionState(status, nowMs) {
  if (!status.available) return "unavailable";
  if (status.connected) return "connected";
  if (!status.installed) return "companion_missing";
  const seenRecently = status.lastSeenMs != null && nowMs - status.lastSeenMs <= WEAR_LIVE_WINDOW_MS;
  return seenRecently ? "reconnecting" : "disconnected";
}
function normalizeWearCompanionStatus(raw, nowMs) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_WEAR_STATUS };
  const value = raw;
  const lastSeenMs = typeof value.lastSeenMs === "number" && Number.isFinite(value.lastSeenMs) && value.lastSeenMs > 0 ? value.lastSeenMs : null;
  const protocol = typeof value.protocol === "number" && Number.isFinite(value.protocol) ? value.protocol : null;
  return {
    installed: value.installed === true,
    connected: value.connected === true,
    available: value.available !== false,
    nodeName: typeof value.nodeName === "string" && value.nodeName.length > 0 ? value.nodeName : null,
    protocol,
    capabilities: normalizeWearCapabilities(value.capabilities),
    lastSeenMs,
    lastSeenAgeMs: lastSeenMs == null ? null : Math.max(0, nowMs - lastSeenMs),
    activeSessionId: typeof value.activeSessionId === "string" && value.activeSessionId.length > 0 ? value.activeSessionId : null
  };
}
var MEASUREMENT_BOUNDS = {
  heart_rate: { min: 20, max: 250 },
  steps: { min: 0, max: 2e5 },
  distance: { min: 0, max: 5e5 },
  calories: { min: 0, max: 2e4 },
  cadence: { min: 0, max: 300 }
};
var WEAR_MAX_SAMPLE_AGE_MS = 12e4;
var WEAR_MAX_FUTURE_SKEW_MS = 5 * 6e4;
function isWearMeasurementType(value) {
  return typeof value === "string" && WEAR_MEASUREMENT_TYPES.includes(value);
}
function normalizeWearMeasurement(raw, nowMs) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw;
  if (!isWearMeasurementType(value.type)) return null;
  const numeric2 = typeof value.value === "number" ? value.value : Number.NaN;
  if (!Number.isFinite(numeric2)) return null;
  const bounds = MEASUREMENT_BOUNDS[value.type];
  if (numeric2 < bounds.min || numeric2 > bounds.max) return null;
  const timestampMs = typeof value.timestamp === "number" && Number.isFinite(value.timestamp) ? value.timestamp : nowMs;
  if (timestampMs > nowMs + WEAR_MAX_FUTURE_SKEW_MS) return null;
  if (nowMs - timestampMs > WEAR_MAX_SAMPLE_AGE_MS) return null;
  return {
    type: value.type,
    value: value.type === "heart_rate" ? Math.round(numeric2) : numeric2,
    timestampMs,
    source: "wear_os",
    deviceId: typeof value.deviceId === "string" ? value.deviceId : void 0,
    deviceName: typeof value.deviceName === "string" && value.deviceName.length > 0 ? value.deviceName : "SVJ Watch",
    sessionId: typeof value.sessionId === "string" ? value.sessionId : void 0
  };
}
var EMPTY_HEART_RATE_STATS = {
  current: null,
  average: null,
  maximum: null,
  sampleCount: 0
};
function accumulateHeartRate(stats, bpm, maxSamples = 7200) {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 250) return stats;
  const sampleCount = stats.sampleCount + 1;
  const total = (stats.average ?? 0) * stats.sampleCount + bpm;
  const bounded = Math.min(sampleCount, maxSamples);
  const divisor = Math.max(1, Math.min(sampleCount, maxSamples));
  return {
    current: Math.round(bpm),
    average: Math.round(total / divisor),
    maximum: Math.max(stats.maximum ?? 0, Math.round(bpm)),
    sampleCount: bounded
  };
}
var WEAR_ACTIVITY_TYPES = [
  "running",
  "walking",
  "cycling",
  "strength",
  "football",
  "other"
];
function isWearActivityType(value) {
  return typeof value === "string" && WEAR_ACTIVITY_TYPES.includes(value);
}
function normalizeWearSummary(raw, nowMs, samples = []) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  if (sessionId.length < 8 || sessionId.length > 100) return null;
  if (!isWearActivityType(value.activityType)) return null;
  const startedAtMs = numericOrNull2(value.startedAtMs);
  const endedAtMs = numericOrNull2(value.endedAtMs);
  if (startedAtMs == null || endedAtMs == null) return null;
  if (endedAtMs <= startedAtMs) return null;
  if (endedAtMs > nowMs + 5 * 6e4) return null;
  const durationSeconds = Math.round((endedAtMs - startedAtMs) / 1e3);
  if (durationSeconds < 30 || durationSeconds > 86400) return null;
  const stats = samples.filter((sample) => sample.type === "heart_rate" && sample.sessionId === sessionId).reduce((acc, sample) => accumulateHeartRate(acc, sample.value), {
    ...EMPTY_HEART_RATE_STATS
  });
  const watchAverage = numericOrNull2(value.avgHeartRate);
  const watchMaximum = numericOrNull2(value.maxHeartRate);
  const avgHeartRate = stats.sampleCount > 0 ? stats.average : watchAverage != null && watchAverage >= 20 && watchAverage <= 250 ? Math.round(watchAverage) : null;
  const maxHeartRate = stats.sampleCount > 0 ? stats.maximum : watchMaximum != null && watchMaximum >= 20 && watchMaximum <= 250 ? Math.round(watchMaximum) : null;
  const movingSeconds = numericOrNull2(value.movingSeconds);
  const stepCount = numericOrNull2(value.stepCount);
  const distanceMeters = numericOrNull2(value.distanceMeters ?? value.lastDistanceMeters);
  const calories = numericOrNull2(value.caloriesEstimate ?? value.lastCalories);
  return {
    sessionId,
    activityType: value.activityType,
    startedAtMs,
    endedAtMs,
    durationSeconds,
    movingSeconds: movingSeconds != null && movingSeconds >= 0 && movingSeconds <= durationSeconds + 60 ? Math.round(movingSeconds) : null,
    // Steps the watch actually counted — never the phone's steps added in.
    stepCount: stepCount != null && stepCount >= 0 && stepCount <= 2e5 ? Math.round(stepCount) : 0,
    distanceMeters: distanceMeters != null && distanceMeters >= 0 && distanceMeters <= 5e5 ? distanceMeters : null,
    caloriesEstimate: calories != null && calories >= 0 && calories <= 2e4 ? calories : null,
    avgHeartRate,
    maxHeartRate,
    heartRateSampleCount: stats.sampleCount,
    source: "wear_os"
  };
}
function numericOrNull2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function wearExternalId(sessionId) {
  const cleaned = sessionId.replace(/[^a-zA-Z0-9]/g, "");
  return `wear-${cleaned.slice(0, 60)}`;
}
function wearClientSessionId(sessionId) {
  const cleaned = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  return `svj-wear-${cleaned.slice(0, 60)}`.padEnd(12, "0");
}
var HR_PREFERENCE_KEY = "svj.hrSourcePreference";
function readPreference() {
  try {
    const stored = window.localStorage.getItem(HR_PREFERENCE_KEY);
    if (stored === "ble" || stored === "wear_os" || stored === "auto") return stored;
  } catch {
  }
  return "auto";
}
var preference = typeof window === "undefined" ? "auto" : readPreference();
var preferenceListeners = /* @__PURE__ */ new Set();
function getHeartRateSourcePreference() {
  return preference;
}
function setHeartRateSourcePreference(next) {
  preference = next;
  try {
    window.localStorage.setItem(HR_PREFERENCE_KEY, next);
  } catch {
  }
  for (const listener of preferenceListeners) listener();
}
function subscribeHeartRateSourcePreference(listener) {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}
var VjWear = registerPlugin("VjWear");
function isNativeWearAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("VjWear");
}
function normalizeNativeWearEvent(raw, nowMs) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw;
  const type = value.type;
  if (type !== "sample" && type !== "state" && type !== "summary" && type !== "handshake")
    return null;
  const id = typeof value.id === "string" && value.id.length > 0 ? value.id : null;
  if (!id) return null;
  const payload = parseWearPayload(value.payload);
  if (payload == null) return null;
  return {
    type,
    id,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : void 0,
    payload,
    receivedAtMs: numericOrNull2(value.receivedAtMs) ?? nowMs
  };
}
function normalizeNativeWearEvents(raw, nowMs) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeNativeWearEvent(entry, nowMs)).filter((entry) => entry != null);
}
function parseWearPayload(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}
function normalizeWearStateMessage(raw) {
  const value = parseWearPayload(raw);
  if (!value) return null;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId.trim() : "";
  if (sessionId.length < 8) return null;
  const state = value.state;
  if (typeof state !== "string" || !WEAR_WORKOUT_STATES.includes(state)) {
    return null;
  }
  const heartRate = numericOrNull2(value.heartRate);
  return {
    sessionId,
    state,
    activityType: typeof value.activityType === "string" ? value.activityType : null,
    elapsedSeconds: numericOrNull2(value.elapsedSeconds),
    stepCount: numericOrNull2(value.stepCount),
    heartRate: heartRate != null && heartRate >= 20 && heartRate <= 250 ? Math.round(heartRate) : null
  };
}
function normalizeWearHandshake(raw) {
  const value = parseWearPayload(raw);
  if (!value) return null;
  const protocol = numericOrNull2(value.protocol);
  if (protocol == null) return null;
  const state = value.state;
  return {
    protocol: Math.round(protocol),
    capabilities: normalizeWearCapabilities(value.capabilities),
    sessionId: typeof value.sessionId === "string" && value.sessionId.length > 0 ? value.sessionId : null,
    state: typeof state === "string" && WEAR_WORKOUT_STATES.includes(state) ? state : null
  };
}

// src/app/lib/wearCompanion.ts
var IMPORTED_SESSIONS_KEY = "svj.wear.importedSessions";
var MAX_TRACKED_SESSIONS = 200;
var snapshot = {
  status: { ...EMPTY_WEAR_STATUS },
  connection: "unavailable",
  workout: null,
  lastMeasurement: null,
  lastHeartRate: null,
  importNotice: null
};
var subscribers = /* @__PURE__ */ new Set();
var heartRateSubscribers = /* @__PURE__ */ new Set();
var summarySubscribers = /* @__PURE__ */ new Set();
var started = false;
var ticker = null;
var listeners = [];
function getWearCompanionSnapshot() {
  return snapshot;
}
function subscribeWearCompanion(listener) {
  startWearCompanion();
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
function publish(patch) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of subscribers) listener();
}
function readImportedSessions() {
  try {
    const raw = window.localStorage.getItem(IMPORTED_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}
function rememberImportedSession(sessionId) {
  try {
    const next = [sessionId, ...readImportedSessions().filter((id) => id !== sessionId)].slice(
      0,
      MAX_TRACKED_SESSIONS
    );
    window.localStorage.setItem(IMPORTED_SESSIONS_KEY, JSON.stringify(next));
  } catch {
  }
}
function hasImportedWearSession(sessionId) {
  return readImportedSessions().includes(sessionId);
}
function shouldImportWearSummary(sessionId) {
  return !hasImportedWearSession(sessionId);
}
function planWearImportSummary(summary) {
  return {
    clientSessionId: wearClientSessionId(summary.sessionId),
    externalId: wearExternalId(summary.sessionId),
    activityType: summary.activityType,
    startedAtMs: summary.startedAtMs,
    endedAtMs: summary.endedAtMs,
    durationSeconds: summary.durationSeconds,
    stepCount: summary.stepCount,
    distanceMeters: summary.distanceMeters,
    caloriesEstimate: summary.caloriesEstimate,
    avgHeartRate: summary.avgHeartRate,
    devicePlatform: "wear_os"
  };
}
function startWearCompanion() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!isNativeWearAvailable()) {
    publish({
      status: { ...EMPTY_WEAR_STATUS, available: false },
      connection: "unavailable"
    });
    return;
  }
  void refreshStatus();
  void drainInbox();
  void VjWear.addListener?.("wearEvent", (event) => {
    const normalized = normalizeNativeWearEvents([event], Date.now())[0];
    if (normalized) void handleEvent(normalized, { acknowledge: true });
  }).then((handle) => {
    if (handle) listeners.push(handle);
  });
  void VjWear.addListener?.("wearConnection", () => void refreshStatus()).then((handle) => {
    if (handle) listeners.push(handle);
  });
  void VjWear.addListener?.("wearCapabilities", (event) => {
    const handshake = normalizeWearHandshake(event);
    if (!handshake) return;
    publish({
      status: {
        ...snapshot.status,
        installed: true,
        protocol: handshake.protocol,
        capabilities: handshake.capabilities,
        lastSeenMs: Date.now(),
        lastSeenAgeMs: 0
      }
    });
  }).then((handle) => {
    if (handle) listeners.push(handle);
  });
  ticker = window.setInterval(() => {
    void refreshStatus();
    const lastSeen = snapshot.status.lastSeenMs;
    if (snapshot.workout && lastSeen != null && Date.now() - lastSeen > 9e4) {
      publish({ connection: wearConnectionState(snapshot.status, Date.now()) });
    }
  }, 2e3);
}
async function refreshStatus() {
  try {
    const raw = await VjWear.getCompanionStatus?.();
    const status = normalizeWearCompanionStatus(raw, Date.now());
    publish({ status, connection: wearConnectionState(status, Date.now()) });
  } catch {
    publish({ status: { ...EMPTY_WEAR_STATUS }, connection: "unavailable" });
  }
}
async function drainInbox() {
  let events = [];
  try {
    const raw = await VjWear.getPendingEvents?.();
    const envelope = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.events ?? raw : raw;
    events = normalizeNativeWearEvents(envelope, Date.now());
  } catch {
    return 0;
  }
  if (events.length === 0) return 0;
  for (const event of events) await handleEvent(event, { acknowledge: false });
  await acknowledge(events.map((event) => event.id));
  return events.length;
}
async function acknowledge(ids) {
  if (ids.length === 0) return;
  try {
    await VjWear.acknowledgeEvents?.({ ids });
  } catch {
  }
}
async function handleEvent(event, options = { acknowledge: false }) {
  const nowMs = Date.now();
  if (options.acknowledge) await acknowledge([event.id]);
  const touch = (patch = {}) => publish({
    ...patch,
    status: { ...snapshot.status, lastSeenMs: nowMs, lastSeenAgeMs: 0, installed: true },
    connection: "connected"
  });
  if (event.type === "handshake") {
    const handshake = normalizeWearHandshake(event.payload);
    if (!handshake) return;
    touch({
      status: {
        ...snapshot.status,
        installed: true,
        protocol: handshake.protocol,
        capabilities: handshake.capabilities,
        lastSeenMs: nowMs,
        lastSeenAgeMs: 0,
        activeSessionId: handshake.sessionId
      }
    });
    return;
  }
  if (event.type === "sample") {
    const measurement = normalizeWearMeasurement(event.payload, nowMs);
    if (!measurement) return;
    touch({
      lastMeasurement: measurement,
      lastHeartRate: measurement.type === "heart_rate" ? measurement : snapshot.lastHeartRate
    });
    if (measurement.type === "heart_rate") {
      for (const listener of heartRateSubscribers) listener(measurement);
    }
    return;
  }
  if (event.type === "state") {
    const state = normalizeWearStateMessage(event.payload);
    if (!state) return;
    touch({
      workout: state.state === "finished" ? null : {
        sessionId: state.sessionId,
        state: state.state,
        activityType: state.activityType,
        elapsedSeconds: state.elapsedSeconds,
        stepCount: state.stepCount,
        heartRate: state.heartRate,
        updatedAtMs: nowMs
      },
      status: {
        ...snapshot.status,
        activeSessionId: state.state === "finished" ? null : state.sessionId
      }
    });
    return;
  }
  if (event.type === "summary") {
    const summary = normalizeWearSummary(event.payload, nowMs);
    if (!summary) return;
    touch({ workout: null, status: { ...snapshot.status, activeSessionId: null } });
    await importWearSummary(summary);
  }
}
async function importWearSummary(summary) {
  const client = activityRpcClient();
  if (!client) {
    publish({ importNotice: "Sign in to save this watch workout." });
    return { ok: false, error: "Sign in to save this watch workout." };
  }
  if (!shouldImportWearSummary(summary.sessionId)) {
    for (const listener of summarySubscribers) listener(summary, true);
    publish({ importNotice: "This watch workout is already in your SVJ history." });
    return { ok: true, duplicate: true };
  }
  const result = await importPlatformActivity(client, planWearImportSummary(summary));
  if (!result.ok) {
    publish({ importNotice: result.error ?? "Couldn't save this watch workout." });
    return result;
  }
  rememberImportedSession(summary.sessionId);
  for (const listener of summarySubscribers) listener(summary, result.duplicate === true);
  publish({
    importNotice: result.duplicate ? "This watch workout matches an activity already in SVJ \u2014 nothing was duplicated." : "Watch workout saved to your SVJ activity history."
  });
  return result;
}

// src/app/views/ConnectedDevicesView.tsx
import { Fragment as Fragment7, jsx as jsx18, jsxs as jsxs16 } from "react/jsx-runtime";
var initialState = {
  connection: "disconnected",
  scanning: false,
  discovered: [],
  device: null,
  heartRate: null,
  batteryPercent: null,
  error: null
};
var CONNECTION_LABELS = {
  disconnected: "No sensor connected",
  scanning: "Scanning\u2026",
  connecting: "Connecting\u2026",
  connected: "Connected",
  reconnecting: "Reconnecting\u2026",
  permission_denied: "Bluetooth permission denied",
  bluetooth_unavailable: "Bluetooth is off"
};
var ConnectedDevicesView = () => {
  const nativeAvailable = useMemo8(() => isNativeWearableAvailable(), []);
  const [state, dispatchUi] = useReducer(
    (state2, event) => reduceWearableEvent(state2, event, Date.now()),
    initialState
  );
  useEffect17(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 2e3);
    return () => window.clearInterval(timer);
  }, []);
  const [now, setNow] = useState17(() => Date.now());
  useEffect17(() => {
    if (!nativeAvailable) return;
    const hrHandle = VjWearable.addListener("heartRateMeasurement", (event) => {
      const reading = normalizeWearableHeartRate(event, Date.now());
      if (reading) dispatchUi({ type: "heart_rate", reading });
    });
    const batteryHandle = VjWearable.addListener("batteryLevelChanged", (event) => {
      const level = normalizeBatteryLevel(event);
      if (level != null) dispatchUi({ type: "battery", percent: level });
    });
    const errorHandle = VjWearable.addListener("sensorError", (event) => {
      if (event && typeof event === "object") {
        const code = event.code;
        if (code === "permission_denied") dispatchUi({ type: "permission_denied" });
        else if (code === "bluetooth_unavailable") dispatchUi({ type: "bluetooth_unavailable" });
      }
    });
    const stateHandle = VjWearable.addListener("connectionStateChanged", (event) => {
      const value = event;
      if (value.state === "connected" && typeof value.deviceId === "string") {
        dispatchUi({
          type: "connected",
          device: {
            deviceId: value.deviceId,
            name: typeof value.name === "string" ? value.name : "BLE sensor"
          }
        });
      } else if (value.state === "disconnected") {
        dispatchUi({ type: "disconnected" });
      }
    });
    return () => {
      void hrHandle.then((h) => h.remove());
      void batteryHandle.then((h) => h.remove());
      void errorHandle.then((h) => h.remove());
      void stateHandle.then((h) => h.remove());
    };
  }, [nativeAvailable]);
  const checkBluetooth = useCallback13(async () => {
    if (!nativeAvailable) return;
    const support = await VjWearable.isSupported();
    if (!support.supported || !support.bluetoothEnabled) {
      dispatchUi({ type: "bluetooth_unavailable" });
    }
  }, [nativeAvailable]);
  useEffect17(() => {
    void checkBluetooth();
  }, [checkBluetooth]);
  const scan = useCallback13(async () => {
    if (!nativeAvailable) return;
    const permissions = await VjWearable.checkPermissions();
    if (!permissions.granted) {
      const request = await VjWearable.requestPermissions();
      if (!request.granted) {
        dispatchUi({ type: "permission_denied" });
        return;
      }
    }
    const support = await VjWearable.isSupported();
    if (!support.supported || !support.bluetoothEnabled) {
      dispatchUi({ type: "bluetooth_unavailable" });
      return;
    }
    dispatchUi({ type: "scan_started" });
    try {
      await VjWearable.startScan();
      const result = await VjWearable.getDiscoveredDevices();
      dispatchUi({ type: "devices_discovered", devices: result.devices });
      dispatchUi({ type: "scan_stopped" });
    } catch {
      dispatchUi({ type: "scan_stopped" });
      dispatchUi({ type: "error", message: "Scan failed. Check Bluetooth and permissions." });
    }
  }, [nativeAvailable]);
  const connect = useCallback13(async (deviceId) => {
    dispatchUi({ type: "connecting", deviceId });
    try {
      const result = await VjWearable.connect({ deviceId });
      dispatchUi({ type: "connected", device: result.device });
    } catch (error) {
      dispatchUi({
        type: "error",
        message: error instanceof Error ? error.message : "Connection failed"
      });
      dispatchUi({ type: "disconnected" });
    }
  }, []);
  const disconnect = useCallback13(async () => {
    if (!state.device) return;
    await VjWearable.disconnect({ deviceId: state.device.deviceId }).catch(() => void 0);
    dispatchUi({ type: "disconnected" });
  }, [state.device]);
  const forget = useCallback13(async () => {
    if (!state.device) return;
    await VjWearable.forgetDevice({ deviceId: state.device.deviceId }).catch(() => void 0);
    dispatchUi({ type: "disconnected" });
  }, [state.device]);
  const hrFresh = isHeartRateFresh(state.heartRate, now);
  const hr = hrFresh ? state.heartRate : null;
  return /* @__PURE__ */ jsxs16("div", { className: "space-y-5", "data-testid": "connected-devices", children: [
    /* @__PURE__ */ jsx18("section", { className: "svj-radius-card svj-elev-1 svj-lit-top border border-white/[0.06] bg-[#17171A] p-4", children: /* @__PURE__ */ jsxs16("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsx18(
        "span",
        {
          className: `mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${nativeAvailable ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-[#1E1E22] text-[#8C8C90]"}`,
          children: /* @__PURE__ */ jsx18(Bluetooth, { "aria-hidden": true, className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs16("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx18("p", { className: "font-inter text-sm font-semibold text-[#F4F2ED]", children: nativeAvailable ? "Sensors are live on this device" : "Bluetooth sensors unavailable" }),
        /* @__PURE__ */ jsx18("p", { className: "mt-1 text-xs font-inter leading-relaxed text-[#8C8C90]", children: nativeAvailable ? "Pair a BLE heart-rate strap or band and SVJ reads your pulse straight from the sensor while you record." : "Bluetooth heart-rate pairing is not available in this version." })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx18(WearDevicesSection, { now }),
    /* @__PURE__ */ jsxs16("div", { className: "svj-radius-card svj-elev-1 svj-inset rounded-2xl p-4", children: [
      /* @__PURE__ */ jsx18(SVJSectionHeader, { title: "Heart rate", icon: HeartPulse2 }),
      /* @__PURE__ */ jsxs16("div", { className: "mt-3 flex items-end gap-3", children: [
        /* @__PURE__ */ jsx18(
          "span",
          {
            className: `font-mono text-4xl font-bold leading-none ${hr ? "text-[#F4F2ED]" : "text-[#5C5C60]"}`,
            "data-testid": "wearable-hr-value",
            children: hr ? hr.bpm : "\u2014"
          }
        ),
        hr && /* @__PURE__ */ jsx18("span", { className: "mb-0.5 font-mono text-xs text-[#8C8C90]", children: "BPM" }),
        hr && /* @__PURE__ */ jsxs16("span", { className: "mb-0.5 ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-inter text-[10px] font-semibold text-emerald-400", children: [
          /* @__PURE__ */ jsx18("span", { "aria-hidden": true, className: "h-1.5 w-1.5 rounded-full bg-emerald-400" }),
          "Live"
        ] })
      ] }),
      /* @__PURE__ */ jsx18("p", { className: "mt-2 text-[11px] font-inter text-[#8C8C90]", "data-testid": "wearable-hr-status", children: !hr && state.heartRate ? "The sensor went quiet \u2014 the last reading has expired rather than showing a stale number." : hr ? hr.deviceName ? `Direct Bluetooth sensor \u2014 ${hr.deviceName}` : "Direct Bluetooth sensor" : CONNECTION_LABELS[state.connection] ?? "No sensor connected" }),
      state.batteryPercent != null && /* @__PURE__ */ jsxs16("p", { className: "mt-1 flex items-center gap-1.5 font-mono text-[10px] text-[#8C8C90]", children: [
        /* @__PURE__ */ jsx18(BatteryMedium, { "aria-hidden": true, className: "h-3 w-3" }),
        " ",
        state.batteryPercent,
        "% battery"
      ] })
    ] }),
    state.device && /* @__PURE__ */ jsxs16(
      "div",
      {
        className: "rounded-2xl border border-[#C81E3A]/30 bg-[#C81E3A]/8 p-4",
        "data-testid": "connected-device",
        children: [
          /* @__PURE__ */ jsxs16("div", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxs16("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx18(Bluetooth, { className: "h-4 w-4 text-[#E62846]" }),
              /* @__PURE__ */ jsxs16("div", { children: [
                /* @__PURE__ */ jsx18("p", { className: "text-xs font-bold text-white", children: state.device.name }),
                /* @__PURE__ */ jsxs16("p", { className: "text-[11px] font-inter text-[#8C8C90]", children: [
                  "Direct Bluetooth sensor",
                  state.device.bodySensorLocation ? ` \u2014 worn on the ${state.device.bodySensorLocation}` : ""
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsx18("span", { className: "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-inter font-semibold text-emerald-400", children: "Connected" })
          ] }),
          /* @__PURE__ */ jsxs16("div", { className: "mt-3 flex gap-2", children: [
            /* @__PURE__ */ jsxs16(
              "button",
              {
                type: "button",
                onClick: () => void disconnect(),
                "data-testid": "wearable-disconnect",
                className: "flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] transition-colors hover:text-white",
                children: [
                  /* @__PURE__ */ jsx18(Unlink, { className: "h-3 w-3" }),
                  " Disconnect"
                ]
              }
            ),
            /* @__PURE__ */ jsxs16(
              "button",
              {
                type: "button",
                onClick: () => void forget(),
                "data-testid": "wearable-forget",
                className: "flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] transition-colors hover:text-white",
                children: [
                  /* @__PURE__ */ jsx18(Trash23, { className: "h-3 w-3" }),
                  " Forget"
                ]
              }
            )
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs16("div", { className: "svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-4", children: [
      /* @__PURE__ */ jsx18(
        SVJSectionHeader,
        {
          title: "Bluetooth sensors",
          icon: Watch2,
          trailing: /* @__PURE__ */ jsx18(
            "button",
            {
              type: "button",
              onClick: () => void scan(),
              disabled: state.scanning || !nativeAvailable,
              "data-testid": "wearable-scan",
              className: "flex items-center gap-1.5 rounded-full border border-[#C81E3A]/40 bg-[#C81E3A]/15 px-3 py-1.5 text-[10px] font-inter font-semibold text-white transition-colors hover:bg-[#C81E3A]/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-[#5C5C60]",
              children: state.scanning ? /* @__PURE__ */ jsxs16(Fragment7, { children: [
                /* @__PURE__ */ jsx18(Loader28, { "aria-hidden": true, className: "h-3 w-3 animate-spin" }),
                " Scanning\u2026"
              ] }) : /* @__PURE__ */ jsxs16(Fragment7, { children: [
                /* @__PURE__ */ jsx18(Search, { "aria-hidden": true, className: "h-3 w-3" }),
                " Scan"
              ] })
            }
          )
        }
      ),
      !nativeAvailable ? /* @__PURE__ */ jsx18(
        SVJEmptyState,
        {
          compact: true,
          variant: "coming-soon",
          icon: Bluetooth,
          title: "Bluetooth pairing unavailable",
          description: "This version cannot connect to Bluetooth heart-rate sensors."
        }
      ) : /* @__PURE__ */ jsxs16("div", { className: "mt-3", children: [
        state.error && /* @__PURE__ */ jsx18(
          "p",
          {
            className: "mb-2 rounded-xl border border-[#C81E3A]/30 bg-[#C81E3A]/10 px-2.5 py-2 text-[11px] font-inter text-[#E62846]",
            "data-testid": "wearable-error",
            children: state.error
          }
        ),
        state.scanning && state.discovered.length === 0 && /* @__PURE__ */ jsx18("p", { className: "py-3 text-center text-[11px] font-inter text-[#8C8C90]", children: "Scanning for heart-rate sensors\u2026 put your strap in pairing mode." }),
        !state.scanning && state.discovered.length === 0 && !state.error && /* @__PURE__ */ jsx18("p", { className: "py-3 text-center text-[11px] font-inter text-[#8C8C90]", children: "No sensors found yet. Tap Scan with your strap awake." }),
        state.discovered.map((device) => /* @__PURE__ */ jsxs16(
          "div",
          {
            className: "svj-radius-row mb-2 flex items-center justify-between border border-white/[0.07] bg-[#0B0B0C] p-3",
            "data-testid": `wearable-device-${device.deviceId}`,
            children: [
              /* @__PURE__ */ jsxs16("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx18(Bluetooth, { "aria-hidden": true, className: "h-4 w-4 text-[#8C8C90]" }),
                /* @__PURE__ */ jsxs16("div", { children: [
                  /* @__PURE__ */ jsx18("p", { className: "text-xs font-semibold text-white", children: device.name }),
                  /* @__PURE__ */ jsxs16("p", { className: "text-[10px] font-inter text-[#8C8C90]", children: [
                    device.hasHeartRateService ? "Heart Rate Service" : "BLE device",
                    device.rssi != null && /* @__PURE__ */ jsxs16("span", { className: "ml-1.5 font-mono", children: [
                      device.rssi,
                      " dBm"
                    ] })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx18(
                "button",
                {
                  type: "button",
                  onClick: () => void connect(device.deviceId),
                  "data-testid": `wearable-connect-${device.deviceId}`,
                  className: "rounded-full border border-[#C81E3A]/40 bg-[#C81E3A]/15 px-3 py-1.5 text-[10px] font-inter font-semibold text-white",
                  children: "Connect"
                }
              )
            ]
          },
          device.deviceId
        ))
      ] })
    ] }),
    healthConnectAvailable() && /* @__PURE__ */ jsxs16("div", { className: "svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-4", children: [
      /* @__PURE__ */ jsx18(SVJSectionHeader, { title: "Health Connect", icon: Watch2 }),
      /* @__PURE__ */ jsxs16("p", { className: "mt-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: [
        "Syncs authorized workouts, heart rate, steps and distance from supported Android health and watch apps into SVJ \u2014 through Android's Health Connect, with the exact permissions you grant. Manage it in",
        " ",
        /* @__PURE__ */ jsx18("span", { className: "text-white", children: "Profile \u2192 Settings \u2192 Integrations" }),
        "."
      ] })
    ] }),
    /* @__PURE__ */ jsxs16("div", { className: "svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-4", children: [
      /* @__PURE__ */ jsx18(SVJSectionHeader, { title: "Device compatibility", icon: ShieldCheck }),
      /* @__PURE__ */ jsxs16("ul", { className: "mt-3 space-y-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: [
        /* @__PURE__ */ jsxs16("li", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx18(Bluetooth, { className: "mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" }),
          /* @__PURE__ */ jsxs16("span", { children: [
            /* @__PURE__ */ jsx18("span", { className: "text-white", children: "Direct Bluetooth" }),
            " \u2014 works with compatible BLE heart-rate sensors that expose the standard Heart Rate Service (most chest straps and many bands)."
          ] })
        ] }),
        /* @__PURE__ */ jsxs16("li", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx18(Watch2, { className: "mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" }),
          /* @__PURE__ */ jsxs16("span", { children: [
            /* @__PURE__ */ jsx18("span", { className: "text-white", children: "Health Connect" }),
            " \u2014 syncs authorized health information from supported Android health/watch apps."
          ] })
        ] }),
        /* @__PURE__ */ jsxs16("li", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx18(Activity, { className: "mt-0.5 h-3 w-3 shrink-0 text-[#E62846]" }),
          /* @__PURE__ */ jsxs16("span", { children: [
            /* @__PURE__ */ jsx18("span", { className: "text-white", children: "Other watches" }),
            " \u2014 may require the manufacturer's health app/SDK and may not support direct real-time heart-rate streaming."
          ] })
        ] })
      ] })
    ] })
  ] });
};
var HEART_RATE_SOURCE_OPTIONS = [
  { value: "auto", label: "Automatic", hint: "Bluetooth strap first, then SVJ Watch" },
  { value: "ble", label: "Bluetooth sensor", hint: "Always prefer the chest strap" },
  { value: "wear_os", label: "SVJ Watch", hint: "Always prefer the watch" }
];
function lastSeenLabel(ageMs) {
  if (ageMs == null) return "Never";
  const seconds = Math.round(ageMs / 1e3);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}
var WearDevicesSection = ({ now }) => {
  const companion = useSyncExternalStore(subscribeWearCompanion, getWearCompanionSnapshot);
  const preference2 = useSyncExternalStore(
    subscribeHeartRateSourcePreference,
    getHeartRateSourcePreference
  );
  const nativeWear = useMemo8(() => isNativeWearAvailable(), []);
  const connection = wearConnectionState(companion.status, now);
  const capabilities = describeWearCapabilities(companion.status.capabilities);
  const workout = companion.workout;
  const stopWatchWorkout = useCallback13(async () => {
    await VjWear.sendCommand?.({ type: "finish", sessionId: workout?.sessionId }).catch(
      () => void 0
    );
  }, [workout?.sessionId]);
  return /* @__PURE__ */ jsxs16(
    "div",
    {
      className: "svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-4",
      "data-testid": "wear-devices",
      children: [
        /* @__PURE__ */ jsx18(
          SVJSectionHeader,
          {
            title: "My devices",
            icon: Watch2,
            trailing: /* @__PURE__ */ jsxs16(
              "span",
              {
                className: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-inter text-[10px] font-semibold ${connection === "connected" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-white/[0.04] text-[#8C8C90]"}`,
                "data-testid": "wear-connection",
                children: [
                  /* @__PURE__ */ jsx18(
                    "span",
                    {
                      "aria-hidden": true,
                      className: `h-1.5 w-1.5 rounded-full ${connection === "connected" ? "bg-emerald-400" : "bg-[#5C5C60]"}`
                    }
                  ),
                  WEAR_CONNECTION_LABELS[connection]
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ jsxs16(
          "div",
          {
            className: "svj-radius-row mt-3 border border-white/[0.07] bg-[#0B0B0C] p-3",
            "data-testid": "wear-watch-card",
            children: [
              /* @__PURE__ */ jsxs16("div", { className: "flex items-start justify-between gap-2", children: [
                /* @__PURE__ */ jsxs16("div", { children: [
                  /* @__PURE__ */ jsx18("p", { className: "text-xs font-semibold text-white", children: "SVJ Watch" }),
                  /* @__PURE__ */ jsx18("p", { className: "text-[11px] font-inter text-[#8C8C90]", children: "Wear OS companion" })
                ] }),
                connection === "connected" && /* @__PURE__ */ jsx18("span", { className: "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-inter font-semibold text-emerald-400", children: "Live" })
              ] }),
              /* @__PURE__ */ jsxs16("dl", { className: "mt-3 space-y-1.5 text-[11px] font-inter text-[#8C8C90]", children: [
                /* @__PURE__ */ jsxs16("div", { className: "flex justify-between gap-2", children: [
                  /* @__PURE__ */ jsx18("dt", { children: "Capabilities" }),
                  /* @__PURE__ */ jsx18("dd", { className: "text-right text-white", children: capabilities.length > 0 ? capabilities.map((key) => WEAR_CAPABILITY_LABELS[key]).join(", ") : "None reported" })
                ] }),
                /* @__PURE__ */ jsxs16("div", { className: "flex justify-between gap-2", children: [
                  /* @__PURE__ */ jsx18("dt", { children: "Last seen" }),
                  /* @__PURE__ */ jsx18("dd", { className: "text-right text-white", children: lastSeenLabel(companion.status.lastSeenAgeMs) })
                ] }),
                /* @__PURE__ */ jsxs16("div", { className: "flex justify-between gap-2", children: [
                  /* @__PURE__ */ jsx18("dt", { children: "Workout" }),
                  /* @__PURE__ */ jsx18("dd", { className: "text-right text-white", "data-testid": "wear-workout-state", children: workout ? `${workout.state}${workout.heartRate != null ? ` \u2014 ${workout.heartRate} bpm` : ""}` : "No active watch workout" })
                ] })
              ] }),
              workout && /* @__PURE__ */ jsx18(
                "button",
                {
                  type: "button",
                  onClick: () => void stopWatchWorkout(),
                  "data-testid": "wear-stop-workout",
                  className: "mt-3 w-full rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[11px] font-inter font-semibold text-[#8C8C90] transition-colors hover:text-white",
                  children: "Finish watch workout"
                }
              ),
              connection === "companion_missing" && /* @__PURE__ */ jsxs16("div", { className: "svj-radius-row mt-3 border border-white/10 bg-black/40 px-3 py-2.5 text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: [
                /* @__PURE__ */ jsx18("p", { "data-testid": "wear-companion-missing", children: "SVJ is not installed on your watch." }),
                /* @__PURE__ */ jsx18(
                  "a",
                  {
                    href: "https://play.google.com/store/apps/details?id=app.lovable.svj",
                    target: "_blank",
                    rel: "noopener noreferrer",
                    "data-testid": "wear-install-on-watch",
                    className: "mt-2 inline-flex w-full items-center justify-center rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#FF4D6D] transition-colors hover:bg-[#C81E3A]/25",
                    children: "Install on watch"
                  }
                ),
                /* @__PURE__ */ jsx18("p", { className: "mt-1.5", children: "On a paired Wear OS watch the Play Store offers SVJ for the watch automatically. Pairing over Bluetooth alone is not enough." })
              ] }),
              connection === "unavailable" && /* @__PURE__ */ jsx18("p", { className: "svj-radius-row mt-3 border border-white/10 bg-black/40 px-3 py-2.5 text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: nativeWear ? "Wear OS is not available on this device." : "The SVJ Watch bridge runs in the SVJ Android app. Open SVJ on your phone to connect your watch." }),
              connection === "reconnecting" && /* @__PURE__ */ jsx18("p", { className: "svj-radius-row mt-3 border border-gold/30 bg-gold/10 px-3 py-2.5 text-[11px] font-inter leading-relaxed text-gold", children: "The watch is out of range. A running watch workout keeps recording on the watch and syncs when it reconnects." })
            ]
          }
        ),
        /* @__PURE__ */ jsxs16("div", { className: "mt-4", children: [
          /* @__PURE__ */ jsx18("p", { className: "mb-2 font-inter text-[11px] font-semibold text-[#F4F2ED]", children: "Heart rate source" }),
          /* @__PURE__ */ jsx18("div", { className: "space-y-1.5", role: "radiogroup", "aria-label": "Heart rate source", children: HEART_RATE_SOURCE_OPTIONS.map((option) => {
            const selected = preference2 === option.value;
            return /* @__PURE__ */ jsxs16(
              "button",
              {
                type: "button",
                role: "radio",
                "aria-checked": selected,
                "data-testid": `hr-source-${option.value}`,
                onClick: () => setHeartRateSourcePreference(option.value),
                className: `svj-radius-row flex w-full items-center gap-2 border px-3 py-2 text-left transition-colors ${selected ? "border-[#C81E3A]/50 bg-[#C81E3A]/15" : "border-white/[0.07] bg-black/40 hover:border-white/20"}`,
                children: [
                  /* @__PURE__ */ jsx18(
                    "span",
                    {
                      className: `h-2.5 w-2.5 shrink-0 rounded-full ${selected ? "bg-[#E62846]" : "border border-white/30"}`
                    }
                  ),
                  /* @__PURE__ */ jsxs16("span", { className: "flex-1", children: [
                    /* @__PURE__ */ jsx18("span", { className: "block text-xs font-semibold text-white", children: option.label }),
                    /* @__PURE__ */ jsx18("span", { className: "block text-[11px] font-inter text-[#8C8C90]", children: option.hint })
                  ] })
                ]
              },
              option.value
            );
          }) })
        ] })
      ]
    }
  );
};

// src/app/views/WorkoutRecorder.tsx
import React17, { useMemo as useMemo10 } from "react";
import {
  AlertCircle as AlertCircle5,
  CheckCircle2 as CheckCircle23,
  CloudOff,
  Footprints as Footprints2,
  Heart as Heart2,
  Link2,
  Loader2 as Loader29,
  Mountain as Mountain2,
  Pause,
  Play as Play2,
  Radio,
  Save as Save2,
  Square,
  Trash2 as Trash24,
  Zap
} from "lucide-react";

// src/app/hooks/useWorkoutRecorder.ts
import {
  createContext as createContext4,
  createElement,
  useContext as useContext4,
  useCallback as useCallback14,
  useEffect as useEffect18,
  useMemo as useMemo9,
  useRef as useRef10,
  useState as useState18
} from "react";

// src/app/lib/accountSync.ts
import { createClient } from "@supabase/supabase-js";
async function withAccountRpcClient(ownerId, work, allowed = () => true) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const config = getSupabaseConfig();
  if (session?.user.id !== ownerId || !config.url || !config.publishableKey || !allowed())
    throw new Error("Sign in to the original account to sync.");
  const controller = new AbortController();
  const abortIfHidden = () => {
    if (document.hidden || !navigator.onLine) controller.abort();
  };
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
    if (next?.user.id !== ownerId) controller.abort();
  });
  document.addEventListener("visibilitychange", abortIfHidden);
  window.addEventListener("offline", abortIfHidden);
  try {
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${session.access_token}` },
        fetch: (input, init) => {
          if (!allowed() || document.hidden || !navigator.onLine || controller.signal.aborted)
            return Promise.reject(new Error("Sync paused. Your workout is retained."));
          return fetch(input, { ...init, signal: controller.signal });
        }
      }
    });
    return await work(client);
  } finally {
    controller.abort();
    subscription.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", abortIfHidden);
    window.removeEventListener("offline", abortIfHidden);
  }
}

// src/app/hooks/useWorkoutRecorder.ts
var RecorderContext = createContext4(null);
function useWorkoutRecorder() {
  const value = useContext4(RecorderContext);
  if (!value) throw new Error("Workout recording is unavailable. Please reopen SVJ.");
  return value;
}

// src/app/views/WorkoutRecorder.tsx
import { Fragment as Fragment8, jsx as jsx19, jsxs as jsxs17 } from "react/jsx-runtime";
var QUALITY_STYLES = {
  searching: "border-white/10 bg-black/40 text-[#8C8C90]",
  weak: "border-gold/40 bg-gold/10 text-gold",
  good: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  excellent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
};
var Metric = ({ label, value, hint, icon }) => /* @__PURE__ */ jsxs17("div", { className: "svj-radius-row border border-white/[0.06] bg-[#08080A] p-3", children: [
  /* @__PURE__ */ jsxs17("div", { className: "mb-1 flex items-center gap-1.5", children: [
    icon,
    /* @__PURE__ */ jsx19("span", { className: "font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]", children: label })
  ] }),
  /* @__PURE__ */ jsx19(
    "div",
    {
      className: "font-mono text-lg font-bold text-[#F4F2ED]",
      "data-testid": `metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      children: value
    }
  ),
  hint && /* @__PURE__ */ jsx19("div", { className: "mt-1 font-inter text-[10px] leading-snug text-[#8C8C90]", children: hint })
] });
var WorkoutRecorder = ({
  plannedRoute = null,
  onClearPlannedRoute
}) => {
  const {
    session,
    summary,
    liveHeartRate,
    points,
    pendingSync,
    busy,
    error,
    notice,
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
    shareLive,
    stopSharing,
    dismissError,
    dismissNotice
  } = useWorkoutRecorder();
  const [activityType, setActivityType] = React17.useState("running");
  const [splitUnit, setSplitUnit] = React17.useState("km");
  const guide = useMemo10(
    () => plannedRoute ? routeToPoints(plannedRoute.polyline) : void 0,
    [plannedRoute]
  );
  React17.useEffect(() => {
    if (!plannedRoute) return;
    const match = ["running", "walking", "hiking", "cycling"].find(
      (type) => type === plannedRoute.activityType
    );
    if (match) setActivityType(match);
  }, [plannedRoute]);
  const currentPace = useMemo10(() => currentPaceSecondsPerKm(points), [points]);
  const state = session?.state ?? "idle";
  const active = state === "recording" || state === "paused";
  const finished = state === "stopping";
  if (Capacitor.getPlatform() === "ios" && !nativeRecording) {
    return /* @__PURE__ */ jsx19(
      SVJEmptyState,
      {
        compact: true,
        icon: Mountain2,
        title: "GPS recording unavailable",
        description: "Outdoor route recording is not available in this iPhone version."
      }
    );
  }
  return /* @__PURE__ */ jsxs17("div", { className: "space-y-4 pb-6", children: [
    error && /* @__PURE__ */ jsxs17("div", { className: "flex items-start gap-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3", children: [
      /* @__PURE__ */ jsx19(AlertCircle5, { className: "mt-0.5 h-4 w-4 shrink-0 text-crimson" }),
      /* @__PURE__ */ jsx19("p", { className: "flex-1 text-[11px] font-mono text-crimson", children: error }),
      /* @__PURE__ */ jsx19(
        "button",
        {
          type: "button",
          onClick: dismissError,
          className: "text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white",
          children: "Dismiss"
        }
      )
    ] }),
    notice && /* @__PURE__ */ jsxs17("div", { className: "flex items-start gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3", children: [
      /* @__PURE__ */ jsx19(CheckCircle23, { className: "mt-0.5 h-4 w-4 shrink-0 text-emerald-400" }),
      /* @__PURE__ */ jsx19("p", { className: "flex-1 text-[11px] font-mono text-emerald-200", children: notice }),
      /* @__PURE__ */ jsx19(
        "button",
        {
          type: "button",
          onClick: dismissNotice,
          className: "text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white",
          children: "Dismiss"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs17("div", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsxs17(
        "div",
        {
          className: `flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-mono uppercase ${active ? state === "paused" ? "border-gold/40 bg-gold/10 text-gold" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-black/40 text-[#8C8C90]"}`,
          "data-testid": "recorder-state",
          children: [
            /* @__PURE__ */ jsx19(Radio, { className: "h-3.5 w-3.5" }),
            state === "recording" ? "Recording" : state === "paused" ? "Paused" : state === "stopping" ? "Finished" : "Idle"
          ]
        }
      ),
      /* @__PURE__ */ jsxs17(
        "div",
        {
          className: `flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-mono uppercase ${QUALITY_STYLES[session?.gpsQuality ?? "searching"]}`,
          "data-testid": "gps-quality",
          children: [
            /* @__PURE__ */ jsx19(Zap, { className: "h-3.5 w-3.5" }),
            "GPS ",
            GPS_QUALITY_LABELS[session?.gpsQuality ?? "searching"]
          ]
        }
      ),
      nativeRecording && /* @__PURE__ */ jsx19("div", { className: "flex items-center gap-1.5 rounded-full border border-[#C81E3A]/30 bg-[#C81E3A]/10 px-2.5 py-1.5 text-[10px] font-mono uppercase text-[#E62846]", children: "SVJ foreground service" }),
      pendingSync > 0 && /* @__PURE__ */ jsxs17(
        "div",
        {
          className: "flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10px] font-mono uppercase text-gold",
          "data-testid": "pending-sync",
          children: [
            /* @__PURE__ */ jsx19(CloudOff, { className: "h-3.5 w-3.5" }),
            pendingSync,
            " waiting to sync"
          ]
        }
      )
    ] }),
    !active && !finished && /* @__PURE__ */ jsxs17("div", { className: "space-y-2.5 rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
      /* @__PURE__ */ jsx19("div", { className: "text-[10px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Choose activity" }),
      /* @__PURE__ */ jsx19("div", { className: "grid grid-cols-4 gap-2", "data-testid": "activity-type-picker", children: GPS_ACTIVITY_TYPES.map((type) => /* @__PURE__ */ jsx19(
        "button",
        {
          type: "button",
          onClick: () => setActivityType(type),
          "data-testid": `pick-${type}`,
          className: `rounded-full border px-2 py-3 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${activityType === type ? "border-[#C81E3A]/60 bg-[#C81E3A]/15 text-white" : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"}`,
          children: GPS_ACTIVITY_LABELS[type]
        },
        type
      )) }),
      /* @__PURE__ */ jsxs17("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx19("span", { className: "text-[10px] font-mono uppercase text-[#8C8C90]", children: "Splits" }),
        ["km", "mi"].map((unit) => /* @__PURE__ */ jsx19(
          "button",
          {
            type: "button",
            onClick: () => setSplitUnit(unit),
            "data-testid": `split-unit-${unit}`,
            className: `rounded-lg border px-2 py-1 text-[10px] font-mono uppercase ${splitUnit === unit ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white" : "border-white/10 text-[#8C8C90]"}`,
            children: unit === "km" ? "1 km" : "1 mile"
          },
          unit
        ))
      ] })
    ] }),
    /* @__PURE__ */ jsx19("div", { className: "svj-radius-card svj-elev-1 svj-lit-top border border-white/[0.06] bg-[#17171A] px-4 py-3.5", children: /* @__PURE__ */ jsxs17("div", { className: "flex items-end justify-between gap-4", children: [
      /* @__PURE__ */ jsxs17("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx19("p", { className: "font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8C8C90]", children: "Elapsed" }),
        /* @__PURE__ */ jsx19(
          "p",
          {
            className: `mt-1 font-anton text-[42px] leading-none tracking-tight ${state === "paused" ? "text-gold" : "text-[#F4F2ED]"}`,
            "data-testid": "metric-elapsed",
            children: formatClock(session?.durationSeconds ?? 0)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs17("div", { className: "min-w-0 text-right", children: [
        /* @__PURE__ */ jsx19("p", { className: "font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8C8C90]", children: "Distance" }),
        /* @__PURE__ */ jsx19(
          "p",
          {
            className: "mt-1 font-mono text-2xl font-bold leading-none text-[#F4F2ED]",
            "data-testid": "metric-distance",
            children: formatDistance(summary?.distanceMeters ?? 0, splitUnit)
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs17("div", { className: "grid grid-cols-3 gap-2", children: [
      /* @__PURE__ */ jsx19(
        Metric,
        {
          label: activityType === "cycling" ? "Current speed" : "Current pace",
          value: activityType === "cycling" ? formatSpeed(currentPace ? 1e3 / currentPace : null, splitUnit) : formatPace(currentPace, splitUnit)
        }
      ),
      /* @__PURE__ */ jsx19(
        Metric,
        {
          label: activityType === "cycling" ? "Average speed" : "Average pace",
          value: activityType === "cycling" ? formatSpeed(summary?.avgSpeedMps, splitUnit) : formatPace(summary?.avgPaceSecondsPerKm, splitUnit)
        }
      ),
      /* @__PURE__ */ jsx19(
        Metric,
        {
          label: "Moving time",
          value: formatClock(summary?.movingSeconds ?? 0),
          hint: session?.autoPaused ? "Auto-paused" : void 0
        }
      ),
      /* @__PURE__ */ jsx19(
        Metric,
        {
          label: "Elevation",
          value: summary?.elevationGainMeters != null ? `${Math.round(summary.elevationGainMeters)} m` : "\u2014",
          icon: /* @__PURE__ */ jsx19(Mountain2, { className: "h-3 w-3 text-[#8C8C90]" }),
          hint: "From GPS elevation"
        }
      ),
      activityType === "cycling" ? /* @__PURE__ */ jsx19(
        Metric,
        {
          label: "Cadence",
          value: summary?.avgCadence != null ? `${summary.avgCadence} rpm` : "\u2014",
          hint: "Sensor data only"
        }
      ) : /* @__PURE__ */ jsx19(
        Metric,
        {
          label: "Max speed",
          value: formatSpeed(summary?.maxSpeedMps, splitUnit),
          icon: /* @__PURE__ */ jsx19(Footprints2, { className: "h-3 w-3 text-[#8C8C90]" }),
          hint: "From accepted GPS segments"
        }
      ),
      /* @__PURE__ */ jsx19(
        Metric,
        {
          label: "Heart rate",
          value: liveHeartRate ? `${liveHeartRate.bpm}` : summary?.avgHeartRate != null ? `${summary.avgHeartRate} bpm` : "\u2014",
          icon: /* @__PURE__ */ jsx19(Heart2, { className: "h-3 w-3 text-[#E62846]" }),
          hint: liveHeartRate ? /* @__PURE__ */ jsxs17("span", { className: "block", children: [
            liveHeartRate.deviceName ?? (liveHeartRate.source === "wear_os" ? "SVJ Watch" : "Chest sensor"),
            /* @__PURE__ */ jsx19(
              "span",
              {
                className: `mt-0.5 block font-semibold ${liveHeartRate.status === "reconnecting" ? "text-gold" : "text-emerald-400"}`,
                children: liveHeartRate.status === "reconnecting" ? "Reconnecting" : "Live now"
              }
            )
          ] }) : summary?.maxHeartRate != null ? `Average ${summary.avgHeartRate ?? "\u2014"}, peak ${summary.maxHeartRate} bpm` : "No sensor connected"
        }
      )
    ] }),
    plannedRoute && /* @__PURE__ */ jsxs17("div", { className: "svj-radius-row flex items-center gap-2 border border-[#C81E3A]/25 bg-[#C81E3A]/[0.08] px-3 py-2.5", children: [
      /* @__PURE__ */ jsx19(Link2, { "aria-hidden": true, className: "h-3.5 w-3.5 shrink-0 text-[#E62846]" }),
      /* @__PURE__ */ jsxs17("span", { className: "min-w-0 flex-1 font-inter text-[11px] text-white", children: [
        "Following ",
        /* @__PURE__ */ jsx19("span", { className: "font-semibold text-[#E62846]", children: plannedRoute.name }),
        /* @__PURE__ */ jsx19("span", { className: "mt-0.5 block text-[10px] text-[#8C8C90]", children: plannedRouteSummary(plannedRoute) })
      ] }),
      onClearPlannedRoute && /* @__PURE__ */ jsx19(
        "button",
        {
          type: "button",
          onClick: onClearPlannedRoute,
          "data-testid": "clear-planned-route",
          className: "shrink-0 text-[11px] font-inter font-semibold text-[#8C8C90] hover:text-white",
          children: "Clear"
        }
      )
    ] }),
    /* @__PURE__ */ jsx19(
      ActivityMap,
      {
        points,
        guidePoints: guide,
        variant: "hero",
        height: 230,
        showCurrentPosition: state === "recording" && points.length > 1,
        emptyMessage: active ? "Searching for GPS \u2014 the map frames your position the moment a fix lands, then draws as you move." : "Start recording and this map centres on you, then draws your route as you move."
      }
    ),
    /* @__PURE__ */ jsxs17("div", { className: "flex gap-2", children: [
      !active && !finished && /* @__PURE__ */ jsxs17(
        "button",
        {
          type: "button",
          disabled: busy,
          onClick: () => void start(activityType, splitUnit),
          "data-testid": "recorder-start",
          className: "flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/20 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#C81E3A]/35 disabled:opacity-50",
          children: [
            busy ? /* @__PURE__ */ jsx19(Loader29, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsx19(Play2, { className: "h-4 w-4" }),
            "Start ",
            GPS_ACTIVITY_LABELS[activityType]
          ]
        }
      ),
      state === "recording" && /* @__PURE__ */ jsxs17(
        "button",
        {
          type: "button",
          onClick: pause,
          "data-testid": "recorder-pause",
          className: "flex flex-1 items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/15 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-gold",
          children: [
            /* @__PURE__ */ jsx19(Pause, { className: "h-4 w-4" }),
            "Pause"
          ]
        }
      ),
      state === "paused" && /* @__PURE__ */ jsxs17(
        "button",
        {
          type: "button",
          onClick: resume,
          "data-testid": "recorder-resume",
          className: "flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-emerald-200",
          children: [
            /* @__PURE__ */ jsx19(Play2, { className: "h-4 w-4" }),
            "Resume"
          ]
        }
      ),
      active && /* @__PURE__ */ jsxs17(
        "button",
        {
          type: "button",
          disabled: busy,
          onClick: () => void finish(),
          "data-testid": "recorder-finish",
          className: "flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/50 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-white disabled:opacity-50",
          children: [
            /* @__PURE__ */ jsx19(Square, { className: "h-4 w-4" }),
            "Finish"
          ]
        }
      ),
      finished && /* @__PURE__ */ jsxs17(Fragment8, { children: [
        /* @__PURE__ */ jsxs17(
          "button",
          {
            type: "button",
            disabled: busy || !canSave,
            onClick: () => void save(),
            "data-testid": "recorder-save",
            className: "flex flex-[2] items-center justify-center gap-2 rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/20 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-white disabled:opacity-50",
            children: [
              busy ? /* @__PURE__ */ jsx19(Loader29, { className: "h-4 w-4 animate-spin" }) : /* @__PURE__ */ jsx19(Save2, { className: "h-4 w-4" }),
              "Save workout"
            ]
          }
        ),
        /* @__PURE__ */ jsxs17(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: () => void discard(),
            "data-testid": "recorder-discard",
            className: "flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-widest text-[#8C8C90] disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx19(Trash24, { className: "h-4 w-4" }),
              "Discard"
            ]
          }
        )
      ] })
    ] }),
    (summary?.splits.length ?? 0) > 0 && /* @__PURE__ */ jsxs17("div", { className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4", children: [
      /* @__PURE__ */ jsxs17("div", { className: "mb-2 flex items-center justify-between", children: [
        /* @__PURE__ */ jsx19("span", { className: "text-xs font-mono uppercase tracking-widest text-white", children: "Splits" }),
        summary?.fastestSplitIndex != null && /* @__PURE__ */ jsxs17("span", { className: "text-[10px] font-mono text-[#E62846]", children: [
          "Fastest: split ",
          summary.fastestSplitIndex
        ] })
      ] }),
      /* @__PURE__ */ jsx19("div", { className: "space-y-1", children: summary.splits.map((split) => /* @__PURE__ */ jsxs17(
        "div",
        {
          className: `flex items-center gap-3 rounded-lg border px-2.5 py-1.5 ${split.index === summary.fastestSplitIndex ? "border-[#C81E3A]/40 bg-[#C81E3A]/8" : "border-white/5 bg-black/30"}`,
          children: [
            /* @__PURE__ */ jsx19("span", { className: "w-12 text-[10px] font-mono uppercase text-[#8C8C90]", children: split.partial ? "\u2026" : `${split.index}` }),
            /* @__PURE__ */ jsx19("span", { className: "flex-1 text-[11px] font-mono text-white", children: formatDistance(split.distanceMeters, splitUnit) }),
            /* @__PURE__ */ jsx19("span", { className: "text-[11px] font-mono text-white", children: formatClock(split.durationSeconds) }),
            /* @__PURE__ */ jsx19("span", { className: "w-20 text-right text-[10px] font-mono text-[#8C8C90]", children: formatPace(
              Math.round(split.durationSeconds / (split.distanceMeters / 1e3)),
              splitUnit
            ) })
          ]
        },
        split.index
      )) })
    ] }),
    (active || finished) && /* @__PURE__ */ jsxs17("div", { className: "rounded-2xl border border-[#C81E3A]/25 bg-[#0B0B0C] p-4", children: [
      /* @__PURE__ */ jsxs17("div", { className: "mb-2 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx19(Link2, { className: "h-4 w-4 text-[#E62846]" }),
        /* @__PURE__ */ jsx19("span", { className: "text-xs font-mono font-bold uppercase tracking-widest text-white", children: "SVJ Live Share" })
      ] }),
      /* @__PURE__ */ jsx19("p", { className: "mb-3 text-[10px] font-mono leading-relaxed text-[#8C8C90]", children: "Share your live position with a private link. The link expires and stops working the moment you stop sharing. It never exposes your account." }),
      liveShare?.token ? /* @__PURE__ */ jsxs17("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs17("div", { className: "flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-3 py-2", children: [
          /* @__PURE__ */ jsx19(
            motion.span,
            {
              animate: { opacity: [1, 0.35, 1] },
              transition: { duration: 1.8, repeat: Infinity },
              className: "h-2 w-2 rounded-full bg-emerald-400"
            }
          ),
          /* @__PURE__ */ jsx19("span", { className: "text-[11px] font-mono text-emerald-300", children: "Sharing live" })
        ] }),
        /* @__PURE__ */ jsx19("div", { className: "break-all rounded-full border border-white/10 bg-black/50 px-3 py-2 text-[10px] font-mono text-[#8C8C90]", children: liveShareUrl(liveShare.token) }),
        /* @__PURE__ */ jsxs17("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx19(
            "button",
            {
              type: "button",
              onClick: () => void navigator.clipboard?.writeText(liveShareUrl(liveShare.token)).catch(() => {
              }),
              "data-testid": "copy-live-link",
              className: "flex-1 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white",
              children: "Copy link"
            }
          ),
          /* @__PURE__ */ jsx19(
            "button",
            {
              type: "button",
              disabled: liveShareBusy,
              onClick: () => void stopSharing(),
              "data-testid": "stop-live-share",
              className: "flex-1 rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50",
              children: "Stop sharing"
            }
          )
        ] })
      ] }) : /* @__PURE__ */ jsx19(
        "button",
        {
          type: "button",
          disabled: liveShareBusy || points.length < 2,
          onClick: () => void shareLive(),
          "data-testid": "start-live-share",
          className: "w-full rounded-full border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-50",
          children: liveShareBusy ? "Preparing\u2026" : "Start live sharing"
        }
      )
    ] }),
    !active && !finished && /* @__PURE__ */ jsx19("p", { className: "text-[10px] font-mono leading-relaxed text-[#8C8C90]", children: "SVJ records location only while you have an outdoor workout started. On Android the recording runs in a foreground service so it survives a locked screen, and a workout you pause or lose signal during is kept on the device until it syncs." })
  ] });
};

// src/components/ScreenHero.tsx
import { useEffect as useEffect19, useRef as useRef11, useState as useState19 } from "react";

// src/lib/heroAssets.ts
var HERO_ASSETS = {
  activity: {
    src: "/assets/svj-premium/activity/hero.webp",
    alt: "Cyclist riding through the city at night",
    focal: "50% 40%"
  },
  challenges: {
    src: "/assets/svj-premium/challenges/hero.webp",
    alt: "Hiker overlooking a mountain lake at sunset",
    focal: "50% 32%"
  },
  onboarding: {
    src: "/assets/svj-premium/onboarding/hero.webp",
    alt: "Dark engraved hexagon texture",
    focal: "50% 50%"
  },
  plus: {
    src: "/assets/svj-premium/plus/hero.webp",
    alt: "SVJ Plus premium hero",
    focal: "70% 16%"
  },
  profile: {
    src: "/assets/svj-premium/profile/hero.webp",
    alt: "Athlete at rest in a dark gym",
    focal: "30% 35%"
  },
  rivalry: {
    src: "/assets/svj-premium/rivalry/hero.webp",
    alt: "Two athletes facing off in a dark training space",
    focal: "50% 35%"
  },
  train: {
    src: "/assets/svj-premium/train/hero.webp",
    alt: "Athlete and barbell in a dark gym",
    focal: "22% 40%"
  },
  transformation: {
    src: "/assets/svj-premium/transformation/hero.webp",
    alt: "Athlete recovering after a hard session",
    focal: "26% 38%"
  },
  fuel: {
    src: "/assets/svj-premium/fuel/hero.webp",
    alt: "Plated high-protein meal on a dark table",
    focal: "26% 42%"
  }
};

// src/components/ScreenHero.tsx
import { jsx as jsx20, jsxs as jsxs18 } from "react/jsx-runtime";
var HEIGHT_CLASSES = {
  sm: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-40 sm:max-h-48 lg:max-h-56",
  md: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-52 sm:max-h-64 lg:max-h-80",
  lg: "aspect-[21/9] sm:aspect-[16/9] lg:aspect-[3/2] max-h-64 sm:max-h-80 lg:max-h-96"
};
var ScreenHero = ({
  screen,
  title,
  subtitle,
  height = "md",
  priority = false,
  safeArea = false
}) => {
  const asset = HERO_ASSETS[screen];
  const imgRef = useRef11(null);
  const [state, setState] = useState19("loading");
  useEffect19(() => {
    const node = imgRef.current;
    if (!node?.complete) return;
    setState(node.naturalWidth > 0 ? "ready" : "failed");
  }, []);
  const decorative = !title && !subtitle;
  if (decorative && state === "failed") return null;
  return /* @__PURE__ */ jsxs18(
    "section",
    {
      "data-testid": "screen-hero-" + screen,
      "aria-hidden": decorative ? "true" : void 0,
      style: safeArea ? { marginTop: "env(safe-area-inset-top)" } : void 0,
      className: "relative z-0 w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0B0B0C] " + HEIGHT_CLASSES[height],
      children: [
        state === "failed" ? /* @__PURE__ */ jsx20(
          "div",
          {
            "aria-hidden": "true",
            className: "pointer-events-none absolute inset-0 bg-gradient-to-br from-[#2A0E14] via-[#0B0B0C] to-[#0B0B0C]",
            children: /* @__PURE__ */ jsx20("div", { className: "absolute inset-0 bg-[radial-gradient(120%_140%_at_20%_0%,rgba(200,30,58,0.35),transparent_62%)]" })
          }
        ) : /* @__PURE__ */ jsx20(
          "img",
          {
            ref: imgRef,
            src: asset.src,
            alt: decorative ? asset.alt : "",
            style: { objectPosition: asset.focal },
            loading: priority ? "eager" : "lazy",
            decoding: priority ? "sync" : "async",
            fetchPriority: priority ? "high" : "auto",
            onLoad: () => setState("ready"),
            onError: () => setState("failed"),
            className: "block h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-700 " + (state === "ready" ? "opacity-100" : "opacity-0")
          }
        ),
        /* @__PURE__ */ jsx20("div", { className: "pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/55 to-[#0B0B0C]/5" }),
        /* @__PURE__ */ jsx20("div", { className: "pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B0B0C]/55 via-transparent to-[#0B0B0C]/35" }),
        (title || subtitle) && /* @__PURE__ */ jsxs18("div", { className: "absolute inset-x-0 bottom-0 p-4 sm:p-5", children: [
          title && /* @__PURE__ */ jsx20("h2", { className: "font-anton text-2xl tracking-wide text-white sm:text-3xl", children: title }),
          subtitle && /* @__PURE__ */ jsx20("p", { className: "mt-1.5 max-w-xl font-inter text-sm leading-relaxed text-[#C4C4CC]", children: subtitle })
        ] })
      ]
    }
  );
};

// src/app/views/ActivityView.tsx
import { Fragment as Fragment9, jsx as jsx21, jsxs as jsxs19 } from "react/jsx-runtime";
var LiveNumber = ({ value, className }) => {
  const [bump, setBump] = useState20(false);
  const prev = useRef12(value);
  useEffect20(() => {
    if (value <= prev.current) {
      prev.current = value;
      return;
    }
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 450);
    prev.current = value;
    return () => window.clearTimeout(t);
  }, [value]);
  return /* @__PURE__ */ jsx21(
    motion.span,
    {
      initial: bump ? { scale: 1.12 } : false,
      animate: { scale: 1 },
      transition: { type: "spring", stiffness: 400, damping: 18 },
      className: `inline-block ${className ?? ""}`,
      children: value.toLocaleString()
    },
    value
  );
};
var HistoryPanel = ({ title, summary }) => /* @__PURE__ */ jsxs19(
  "div",
  {
    "data-testid": "activity-period-summary",
    className: "svj-radius-card svj-elev-1 svj-lit-top border border-white/[0.06] bg-[#17171A] p-4 mb-3",
    children: [
      /* @__PURE__ */ jsx21(SVJSectionHeader, { title, icon: BarChart3, className: "mb-3" }),
      /* @__PURE__ */ jsxs19("div", { className: "grid grid-cols-3 gap-2", children: [
        /* @__PURE__ */ jsxs19("div", { className: "svj-stat p-2.5 text-center", children: [
          /* @__PURE__ */ jsx21("div", { className: "text-[11px] font-inter text-[#8C8C90] mb-0.5", children: "Avg Steps" }),
          /* @__PURE__ */ jsx21("div", { className: "font-mono text-sm font-bold text-white", children: summary.averageSteps.toLocaleString() })
        ] }),
        /* @__PURE__ */ jsxs19("div", { className: "svj-stat p-2.5 text-center", children: [
          /* @__PURE__ */ jsx21("div", { className: "text-[11px] font-inter text-[#8C8C90] mb-0.5", children: "Best Day" }),
          /* @__PURE__ */ jsx21("div", { className: "font-mono text-sm font-bold text-[#C81E3A]", children: summary.bestDay ? summary.bestDay.steps.toLocaleString() : "\u2014" }),
          summary.bestDay && /* @__PURE__ */ jsx21("div", { className: "text-[10px] font-inter text-[#8C8C90]", children: summary.bestDay.label })
        ] }),
        /* @__PURE__ */ jsxs19("div", { className: "svj-stat p-2.5 text-center", children: [
          /* @__PURE__ */ jsx21("div", { className: "text-[11px] font-inter text-[#8C8C90] mb-0.5", children: "Avg KCAL" }),
          /* @__PURE__ */ jsx21("div", { className: "font-mono text-sm font-bold text-gold", children: summary.averageActiveKcal.toLocaleString() })
        ] })
      ] })
    ]
  }
);
var ActivityView = ({
  hideRecoverySection = false
}) => {
  const activity = useActivityOptional();
  if (!activity) {
    return /* @__PURE__ */ jsxs19("div", { className: "rounded-2xl bg-[#17171A] border border-white/[0.06] p-4 text-center space-y-2", children: [
      /* @__PURE__ */ jsx21("p", { className: "font-anton text-lg tracking-wide text-white", children: "Activity Unavailable" }),
      /* @__PURE__ */ jsx21("p", { className: "text-xs font-inter text-[#8C8C90]", children: "Reload the app to reconnect step tracking." })
    ] });
  }
  return /* @__PURE__ */ jsx21(ActivityViewContent, { activity, hideRecoverySection });
};
var ActivityViewContent = ({ activity, hideRecoverySection = false }) => {
  const {
    todaySteps,
    milestoneSteps,
    stepGoal,
    stepPercent,
    remainingSteps,
    activeKcal,
    totalKcal,
    kcalGoal,
    kcalPercent,
    trackingStatus,
    trackingRequested,
    trackingActive,
    startTracking,
    stopTracking,
    statusMessage,
    stepSource,
    summary7,
    summary30
  } = activity;
  useEffect20(
    () => () => {
      void stopTracking();
    },
    [stopTracking]
  );
  const [section, setSection] = useState20("activity");
  const [plannedRoute, setPlannedRoute] = useState20(null);
  const nextMilestone = [2500, 5e3, 7500, 1e4].find((m) => milestoneSteps < m) ?? 1e4;
  return /* @__PURE__ */ jsxs19("div", { className: "w-full", children: [
    /* @__PURE__ */ jsx21(ScreenHero, { screen: "activity", height: "md", priority: true }),
    /* @__PURE__ */ jsxs19("div", { className: "mb-3 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs19("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx21("div", { className: "w-9 h-9 rounded-2xl bg-[#C81E3A]/15 border border-[#C81E3A]/40 flex items-center justify-center", children: /* @__PURE__ */ jsx21(ActivityIcon, { className: "w-5 h-5 text-[#E62846]" }) }),
        /* @__PURE__ */ jsx21("h1", { className: "font-anton text-2xl tracking-wide text-white", children: "Activity" })
      ] }),
      activity.dailyTracking?.state?.version !== 2 && /* @__PURE__ */ jsxs19(
        "div",
        {
          className: `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-inter font-medium ${trackingStatus === "tracking" ? "bg-emerald-500/10 text-emerald-400" : trackingStatus === "starting" ? "bg-gold/10 text-gold" : "bg-white/[0.04] text-[#8C8C90]"}`,
          children: [
            trackingStatus === "tracking" ? /* @__PURE__ */ jsx21(Watch3, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ jsx21(ActivitySquare, { className: "w-3.5 h-3.5" }),
            trackingActive ? "Tracking active" : "Tracking stopped"
          ]
        }
      )
    ] }),
    activity.dailyTracking?.state?.version !== 2 && /* @__PURE__ */ jsxs19(Fragment9, { children: [
      /* @__PURE__ */ jsx21(
        "p",
        {
          role: "status",
          className: "mb-3 rounded-lg bg-[#0b0b0c] border border-white/[0.04] px-3 py-2 text-[11px] font-inter text-[#8C8C90]",
          children: statusMessage
        }
      ),
      /* @__PURE__ */ jsx21(
        "button",
        {
          type: "button",
          disabled: trackingStatus === "stopping" || trackingStatus === "update-required",
          onClick: () => {
            if (trackingRequested || trackingActive || trackingStatus === "error")
              void stopTracking();
            else void startTracking();
          },
          className: "mb-3 w-full rounded-xl bg-[#C81E3A] px-4 py-3 text-xs font-anton uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] disabled:opacity-50 svj-press",
          children: trackingStatus === "update-required" ? "APP UPDATE REQUIRED" : trackingStatus === "error" ? "RETRY STOP" : trackingRequested || trackingActive ? "STOP TRACKING" : "START TRACKING"
        }
      )
    ] }),
    /* @__PURE__ */ jsx21(StepTrackingStatus, {}),
    /* @__PURE__ */ jsx21("div", { className: "mb-3 flex flex-wrap gap-2 pb-1", "data-testid": "train-sections", children: [
      { id: "activity", label: "Overview" },
      { id: "record", label: "Record" },
      { id: "history", label: "History" },
      { id: "routes", label: "Routes" },
      { id: "records", label: "Records" },
      { id: "devices", label: "Devices" },
      { id: "goals", label: "Goals" },
      { id: "progress", label: "Progress" },
      { id: "recovery", label: "Recovery" }
    ].filter((s) => !hideRecoverySection || s.id !== "recovery").map((s) => /* @__PURE__ */ jsx21(
      "button",
      {
        type: "button",
        onClick: () => setSection(s.id),
        className: `min-w-0 max-w-full rounded-lg px-2.5 py-1.5 text-center text-[11px] font-inter font-medium transition-colors ${section === s.id ? "bg-[#C81E3A]/15 text-white" : "bg-white/[0.04] text-[#8C8C90] hover:text-white"}`,
        children: s.label
      },
      s.id
    )) }),
    section === "goals" && /* @__PURE__ */ jsx21(TrainGoals, {}),
    section === "progress" && /* @__PURE__ */ jsx21(TrainProgress, {}),
    section === "recovery" && /* @__PURE__ */ jsx21(TrainRecovery, {}),
    section === "record" && /* @__PURE__ */ jsx21(
      WorkoutRecorder,
      {
        plannedRoute,
        onClearPlannedRoute: () => setPlannedRoute(null)
      }
    ),
    section === "routes" && /* @__PURE__ */ jsx21(
      RouteLibrary,
      {
        onStartRoute: (route) => {
          setPlannedRoute(route);
          setSection("record");
        }
      }
    ),
    section === "records" && /* @__PURE__ */ jsx21(RecordsView, {}),
    section === "devices" && /* @__PURE__ */ jsx21(ConnectedDevicesView, {}),
    section === "activity" && /* @__PURE__ */ jsxs19("div", { className: "mb-3 grid items-start gap-3 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsxs19("div", { className: "svj-radius-card svj-elev-2 svj-lit-top border border-white/[0.06] bg-[#17171A] p-3.5", children: [
        /* @__PURE__ */ jsx21(SVJSectionHeader, { title: "Today's activity", icon: Footprints3, className: "mb-1" }),
        /* @__PURE__ */ jsxs19("div", { className: "flex flex-col items-center", children: [
          /* @__PURE__ */ jsx21(
            SVJScoreRing,
            {
              value: todaySteps,
              max: stepGoal,
              display: todaySteps.toLocaleString(),
              label: "Steps",
              sublabel: remainingSteps > 0 ? `of ${stepGoal.toLocaleString()} steps (${stepPercent}%) \u2014 ${remainingSteps.toLocaleString()} to go` : `of ${stepGoal.toLocaleString()} steps \u2014 daily goal complete`
            }
          ),
          stepSource === "accelerometer" && /* @__PURE__ */ jsx21("div", { className: "mt-2 rounded-lg border border-gold/25 bg-gold/5 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-gold", children: "Estimated steps \u2014 accelerometer motion detection" }),
          stepSource === "detector" && /* @__PURE__ */ jsx21("div", { className: "mt-2 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]", children: "Source: step detector" }),
          stepSource === "counter" && /* @__PURE__ */ jsx21("div", { className: "mt-2 text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]", children: "Source: hardware step counter" }),
          /* @__PURE__ */ jsxs19("div", { className: "mt-3 text-[10px] font-mono text-[#8C8C90] text-center", children: [
            "Next milestone:",
            " ",
            /* @__PURE__ */ jsxs19("span", { className: "text-white", children: [
              nextMilestone.toLocaleString(),
              " steps"
            ] }),
            " \u2014 XP awarded automatically at 2.5K / 5K / 7.5K / 10K"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs19("div", { className: "svj-radius-card svj-elev-2 svj-lit-top border border-white/[0.06] bg-[#17171A] p-3.5", children: [
        /* @__PURE__ */ jsx21(
          SVJSectionHeader,
          {
            title: "Calories burned",
            icon: Flame2,
            trailing: /* @__PURE__ */ jsx21("span", { className: "text-[10px] font-inter text-[#8C8C90]", children: "Estimate" }),
            className: "mb-1"
          }
        ),
        /* @__PURE__ */ jsxs19("div", { className: "flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8", children: [
          /* @__PURE__ */ jsx21(
            SVJScoreRing,
            {
              value: activeKcal,
              max: kcalGoal,
              display: activeKcal.toLocaleString(),
              label: "Active kcal",
              tone: "premium",
              size: 148,
              sublabel: `of ${kcalGoal.toLocaleString()} active kcal goal (${kcalPercent}%)`
            }
          ),
          /* @__PURE__ */ jsxs19("div", { className: "grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-1", children: [
            /* @__PURE__ */ jsxs19("div", { className: "svj-stat p-3", children: [
              /* @__PURE__ */ jsx21("div", { className: "text-[11px] font-inter text-[#8C8C90]", children: "Active Calories" }),
              /* @__PURE__ */ jsx21(
                LiveNumber,
                {
                  value: activeKcal,
                  className: "font-mono text-xl font-bold text-[#C9A227]"
                }
              ),
              /* @__PURE__ */ jsx21("div", { className: "text-[10px] font-inter text-[#8C8C90] mt-0.5", children: "From movement" })
            ] }),
            /* @__PURE__ */ jsxs19("div", { className: "svj-stat p-3", children: [
              /* @__PURE__ */ jsx21("div", { className: "text-[11px] font-inter text-[#8C8C90]", children: "Total Calories" }),
              /* @__PURE__ */ jsx21(
                LiveNumber,
                {
                  value: totalKcal,
                  className: "font-mono text-xl font-bold text-white"
                }
              ),
              /* @__PURE__ */ jsx21("div", { className: "text-[10px] font-inter text-[#8C8C90] mt-0.5", children: "Including resting burn" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx21("p", { className: "mt-3 text-[10px] font-inter leading-relaxed text-[#8C8C90]", children: "Estimates from steps, distance and your body profile \u2014 not medical measurements." })
      ] })
    ] }),
    /* @__PURE__ */ jsx21(CompletedSessionCard, {}),
    section === "history" && /* @__PURE__ */ jsx21(ActivityHistory, {}),
    section === "activity" && /* @__PURE__ */ jsxs19("div", { className: "grid items-start gap-3 lg:grid-cols-2", children: [
      /* @__PURE__ */ jsx21(HistoryPanel, { title: "Last 7 Days", summary: summary7 }),
      /* @__PURE__ */ jsx21(HistoryPanel, { title: "Last 30 Days", summary: summary30 })
    ] }),
    section === "activity" && /* @__PURE__ */ jsxs19("div", { className: "svj-radius-card svj-elev-1 border border-white/[0.06] bg-[#17171A] p-3.5 mb-3", children: [
      /* @__PURE__ */ jsx21(SVJSectionHeader, { title: "Step XP milestones", icon: Trophy5, className: "mb-3" }),
      /* @__PURE__ */ jsx21("div", { className: "grid grid-cols-4 gap-2", children: [
        { steps: 2500, xp: 40 },
        { steps: 5e3, xp: 60 },
        { steps: 7500, xp: 80 },
        { steps: 1e4, xp: 120 }
      ].map((m) => {
        const reached = milestoneSteps >= m.steps;
        return /* @__PURE__ */ jsxs19(
          "div",
          {
            className: `rounded-lg p-2 text-center ${reached ? "bg-[#C81E3A]/10" : "bg-[#0b0b0c]"}`,
            children: [
              /* @__PURE__ */ jsxs19(
                "div",
                {
                  className: `font-mono text-sm font-bold ${reached ? "text-[#C81E3A]" : "text-[#8C8C90]"}`,
                  children: [
                    (m.steps / 1e3).toFixed(1),
                    "K"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs19(
                "div",
                {
                  className: `text-[10px] font-inter ${reached ? "text-emerald-400" : "text-[#8C8C90]"}`,
                  children: [
                    "+",
                    m.xp,
                    " XP"
                  ]
                }
              )
            ]
          },
          m.steps
        );
      }) }),
      /* @__PURE__ */ jsxs19("div", { className: "mt-3 flex items-center gap-1.5 text-[10px] font-inter text-[#8C8C90]", children: [
        /* @__PURE__ */ jsx21(TrendingUp2, { className: "w-3 h-3" }),
        "XP is granted once per milestone per day and counts toward your streak."
      ] })
    ] })
  ] });
};

// src/app/views/TrainStrength.tsx
import { useCallback as useCallback16, useEffect as useEffect22, useMemo as useMemo11, useRef as useRef14, useState as useState22 } from "react";
import { useQueryClient as useQueryClient3 } from "@tanstack/react-query";
import {
  Dumbbell,
  Plus as Plus3,
  Trash2 as Trash25,
  X as X3,
  Check as Check2,
  Clock as Clock2,
  Loader2 as Loader210,
  AlertCircle as AlertCircle6,
  CheckCircle2 as CheckCircle24,
  Trophy as Trophy6,
  Search as Search2,
  ArrowLeft as ArrowLeft2,
  Target as Target3
} from "lucide-react";

// src/app/hooks/useWorkoutQueue.ts
import { useCallback as useCallback15, useEffect as useEffect21, useRef as useRef13, useState as useState21 } from "react";
import { useQueryClient as useQueryClient2 } from "@tanstack/react-query";

// src/app/lib/trainingClient.ts
function trainingRpcClient() {
  if (!hasSupabaseConfig()) return null;
  return (fn, args) => {
    const typed = supabase;
    return typed.rpc(fn, args);
  };
}
var str2 = (v) => typeof v === "string" ? v : null;
async function recordTrainingContext(callRpc, clientSessionId, context) {
  try {
    const { data, error } = await callRpc("svj_record_training_context", {
      p_client_session_id: clientSessionId,
      p_context: {
        plan_id: context.planId ?? null,
        plan_session_id: context.planSessionId ?? null,
        template_id: context.templateId ?? null,
        template_version: context.templateVersion ?? null,
        targets: context.targets ?? [],
        feedback: context.feedback ?? {}
      }
    });
    if (error) return { ok: false, error: error.message };
    const env = data;
    if (!env || env.ok !== true) return { ok: false, error: "Couldn't record training context." };
    return {
      ok: true,
      duplicate: env.duplicate === true,
      slotAlreadyFinalized: env.slot_already_finalized === true,
      slotStatus: str2(env.slot_status) ?? void 0
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
async function recordTrainingDecision(callRpc, input) {
  try {
    const { data, error } = await callRpc("svj_record_training_decision", {
      p_payload: {
        exercise_slug: input.exerciseSlug,
        action: input.action,
        rationale: input.rationale,
        payload: input.payload ?? {},
        policy_version: input.policyVersion,
        activity_id: input.activityId ?? null
      }
    });
    if (error) return { ok: false, error: error.message };
    return data?.ok === true ? { ok: true } : { ok: false, error: "Couldn't record the decision." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}
function resolveTargetsToProps(targets, catalogBySlug) {
  const resolved = [];
  const unresolved = [];
  for (const target of targets) {
    const found = catalogBySlug.get(target.exerciseSlug);
    if (found) resolved.push({ target, exerciseId: found.id, name: found.name });
    else unresolved.push(target);
  }
  return { resolved, unresolved };
}

// src/app/lib/trainingPolicy.ts
var TRAINING_POLICY_VERSION = "svj-training-2026-09-1";
var PROGRESSION_WINDOW_DAYS = 28;
var RE_ENTRY_GAP_DAYS = 14;
var QUALIFYING_SESSIONS_REQUIRED = 2;
var MAX_INCREASE_FRACTION = 0.05;
var INCREMENTS_KG = {
  barbell_total: 2.5,
  dumbbell_per_hand: 1,
  machine_stack: 2.5,
  assisted: 2.5,
  cable: 2.5,
  bodyweight_added: 1.25
};
var FALLBACK_INCREMENT_KG = 1;
var BODYWEIGHT_REP_STEP = 2;
var TIMED_HOLD_STEP_SECONDS = 5;
var DELOAD_STREAK = 2;

// src/app/lib/trainingProgression.ts
var MS_PER_DAY = 864e5;
function daysBetween(iso, now) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / MS_PER_DAY);
}
function filterEvidenceWindow(history, now = /* @__PURE__ */ new Date(), windowDays = PROGRESSION_WINDOW_DAYS) {
  return history.filter((s) => {
    const gap = daysBetween(s.performedAt, now);
    return gap !== null && gap >= 0 && gap <= windowDays;
  }).sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt));
}
function isComparableSession(session, target) {
  return session.target.loadConvention === target.loadConvention && session.target.equipmentKey === target.equipmentKey && session.target.exerciseSlug === target.exerciseSlug;
}
function workingSets(session) {
  return session.sets.filter((s) => !s.isWarmup && !s.skipped);
}
function topOfRange(set, target) {
  if (target.durationSeconds !== null) {
    return set.durationSeconds !== null && set.durationSeconds >= target.durationSeconds;
  }
  return set.reps !== null && set.reps >= target.repMax;
}
function belowRange(set, target) {
  if (target.durationSeconds !== null) {
    return set.durationSeconds === null || set.durationSeconds < target.durationSeconds;
  }
  return set.reps === null || set.reps < target.repMin;
}
function hasPain(session) {
  return session.sets.some((s) => s.pain === true) || session.controlledTechnique === false;
}
function hasEffortEvidence(session) {
  return session.sets.some((s) => !s.isWarmup && s.rir !== null) || session.perceivedEffort !== null;
}
function isGrinder(session) {
  const failureSet = session.sets.some((s) => !s.isWarmup && s.rir !== null && s.rir <= 0);
  return failureSet || session.perceivedEffort !== null && session.perceivedEffort >= 9;
}
function sessionQualifies(session, target) {
  const work = workingSets(session);
  if (work.length < target.workSets) return false;
  if (!work.every((s) => topOfRange(s, target))) return false;
  if (hasPain(session)) return false;
  if (!hasEffortEvidence(session)) return false;
  if (isGrinder(session)) return false;
  return true;
}
function belowRangeStreak(recent, target) {
  let streak = 0;
  for (const session of recent) {
    const work = workingSets(session);
    const missed = work.some((s) => belowRange(s, target));
    if (!missed) break;
    streak += 1;
  }
  return streak;
}
function incrementFor(convention) {
  return INCREMENTS_KG[convention] ?? FALLBACK_INCREMENT_KG;
}
function suggestedDuration(target) {
  return (target.durationSeconds ?? 0) + TIMED_HOLD_STEP_SECONDS;
}
function holdDecision(target, rationale, evidence, action = "hold", extra = {}) {
  return {
    action,
    exerciseSlug: target.exerciseSlug,
    currentLoadKg: target.loadKg,
    suggestedLoadKg: null,
    suggestedReps: null,
    suggestedSets: null,
    suggestedDurationSeconds: null,
    rationale,
    evidence,
    policyVersion: TRAINING_POLICY_VERSION,
    ...extra
  };
}
function decideProgression(target, history, now = /* @__PURE__ */ new Date()) {
  const related = history.filter((s) => s.target.exerciseSlug === target.exerciseSlug).sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt));
  if (related.length === 0) {
    return holdDecision(
      target,
      "No completed sets for this movement yet.",
      {
        comparableSessions: 0,
        qualifyingSessions: 0,
        windowDays: PROGRESSION_WINDOW_DAYS,
        lastPerformedAt: null,
        gapDays: null
      },
      "new_baseline"
    );
  }
  const latestAny = related[0];
  const overallGap = daysBetween(latestAny.performedAt, now);
  if (hasPain(latestAny)) {
    return holdDecision(
      target,
      "Pain or uncontrolled technique was reported last session. Progression is paused for this movement \u2014 seek advice before loading it again.",
      {
        comparableSessions: related.filter((s) => isComparableSession(s, target)).length,
        qualifyingSessions: 0,
        windowDays: PROGRESSION_WINDOW_DAYS,
        lastPerformedAt: latestAny.performedAt,
        gapDays: overallGap
      },
      "stop_pain"
    );
  }
  if (overallGap !== null && overallGap >= RE_ENTRY_GAP_DAYS) {
    return holdDecision(
      target,
      `It has been ${overallGap} days since this movement. Re-enter lighter and rebuild before progressing.`,
      {
        comparableSessions: 0,
        qualifyingSessions: 0,
        windowDays: PROGRESSION_WINDOW_DAYS,
        lastPerformedAt: latestAny.performedAt,
        gapDays: overallGap
      },
      "reentry",
      {
        suggestedLoadKg: target.loadKg !== null ? Number((target.loadKg * 0.9).toFixed(2)) : null,
        suggestedSets: Math.max(1, target.workSets - 1)
      }
    );
  }
  const recent = filterEvidenceWindow(related, now);
  if (recent.length === 0) {
    return holdDecision(target, "No recent completed sets in the evidence window.", {
      comparableSessions: 0,
      qualifyingSessions: 0,
      windowDays: PROGRESSION_WINDOW_DAYS,
      lastPerformedAt: latestAny.performedAt,
      gapDays: overallGap
    });
  }
  const latest = recent[0];
  const gapDays = daysBetween(latest.performedAt, now);
  const comparable = recent.filter((s) => isComparableSession(s, target));
  const evidence = {
    comparableSessions: comparable.length,
    qualifyingSessions: comparable.filter((s) => sessionQualifies(s, target)).length,
    windowDays: PROGRESSION_WINDOW_DAYS,
    lastPerformedAt: latest.performedAt,
    gapDays
  };
  void gapDays;
  void latest;
  if (comparable.length === 0) {
    return holdDecision(
      target,
      "Recent work used different equipment or a different load convention, so it isn't comparable. Keep collecting evidence on this setup.",
      evidence
    );
  }
  const streak = belowRangeStreak(comparable, target);
  if (streak >= DELOAD_STREAK) {
    return reduceDecision(target, evidence, streak);
  }
  if (!comparable.some((s) => hasEffortEvidence(s))) {
    return holdDecision(
      target,
      "Log reps-in-reserve (or effort) so a load increase can be justified.",
      evidence
    );
  }
  if (comparable.some((s) => isGrinder(s))) {
    return holdDecision(
      target,
      "The last comparable session was ground out to failure. Hold this load and collect a controlled session.",
      evidence
    );
  }
  const requiredForPower = 3;
  const required = target.loadType === "power" ? requiredForPower : QUALIFYING_SESSIONS_REQUIRED;
  if (evidence.qualifyingSessions < required) {
    return holdDecision(
      target,
      evidence.qualifyingSessions === 0 ? "Work toward the top of the prescribed rep range before adding load." : `One qualifying session logged. Hold this load and repeat it once more before progressing.`,
      evidence
    );
  }
  return increaseDecision(target, evidence);
}
function reduceDecision(target, evidence, streak) {
  const summary = `${streak} recent sessions stayed below the prescribed range at high effort.`;
  if (target.loadType === "weighted" && target.loadKg !== null) {
    const inc = incrementFor(target.loadConvention);
    return holdDecision(target, `${summary} Reduce load by one increment.`, evidence, "reduce", {
      suggestedLoadKg: Math.max(0, target.loadKg - inc)
    });
  }
  if (target.loadType === "assisted" && target.loadKg !== null) {
    const inc = incrementFor(target.loadConvention);
    return holdDecision(target, `${summary} Use more assistance.`, evidence, "reduce", {
      suggestedLoadKg: target.loadKg + inc
    });
  }
  return holdDecision(target, `${summary} Drop one work set.`, evidence, "reduce", {
    suggestedSets: Math.max(1, target.workSets - 1)
  });
}
function increaseDecision(target, evidence) {
  const reason = `${evidence.qualifyingSessions} qualifying comparable sessions reached the top of range with controlled effort.`;
  if (target.loadType === "duration") {
    return holdDecision(target, `${reason} Extend the hold.`, evidence, "increase", {
      suggestedDurationSeconds: suggestedDuration(target)
    });
  }
  if (target.loadType === "bodyweight") {
    return holdDecision(
      target,
      `${reason} Add repetitions before moving to a harder variation.`,
      evidence,
      "increase",
      {
        suggestedReps: { min: target.repMin, max: target.repMax + BODYWEIGHT_REP_STEP }
      }
    );
  }
  if (target.loadType === "power") {
    return holdDecision(
      target,
      `${reason} Explosive work keeps quality first \u2014 a small load increase is permitted, never failure training.`,
      evidence,
      "increase",
      { suggestedLoadKg: target.loadKg }
    );
  }
  if (target.loadKg === null) {
    return holdDecision(
      target,
      "No working load recorded yet \u2014 establish a baseline.",
      evidence,
      "new_baseline"
    );
  }
  const inc = incrementFor(target.loadConvention);
  const maxBump = target.loadKg * MAX_INCREASE_FRACTION;
  if (target.loadType !== "assisted" && inc > maxBump) {
    return holdDecision(
      target,
      `${reason} The smallest available load jump is too large for this weight \u2014 add reps before adding load.`,
      evidence,
      "increase",
      { suggestedReps: { min: target.repMin, max: target.repMax + 2 } }
    );
  }
  const delta = target.loadType === "assisted" ? -inc : inc;
  const next = target.loadType === "assisted" ? Math.max(0, target.loadKg + delta) : target.loadKg + delta;
  return holdDecision(
    target,
    target.loadType === "assisted" ? `${reason} Reduce assistance by ${inc} kg.` : `${reason} Add ${inc} kg next session.`,
    evidence,
    "increase",
    { suggestedLoadKg: Number(next.toFixed(2)) }
  );
}

// src/app/lib/trainingDecisionSync.ts
function evidenceFromHistory(history, target) {
  return history.sessions.filter((session) => Boolean(session.performedAt)).map((session) => ({
    activityId: session.activityId,
    performedAt: session.performedAt,
    target,
    sets: session.sets.map((set, index) => ({
      setNumber: set.setNumber || index + 1,
      reps: set.reps,
      weightKg: set.weightKg,
      durationSeconds: set.durationSeconds,
      isWarmup: set.isWarmup === true,
      rir: null,
      pain: null,
      skipped: false
    })),
    controlledTechnique: null,
    perceivedEffort: session.perceivedEffort ?? null
  }));
}
async function syncTrainingDecisions(input) {
  const result = { recorded: 0, skipped: 0, failed: 0 };
  if (input.exercises.length === 0 || !input.activityId) return result;
  const now = input.now ?? /* @__PURE__ */ new Date();
  for (const exercise of input.exercises) {
    try {
      const history = await getExerciseHistory(input.strengthCall, exercise.exerciseId, 30);
      if (!history.ok || !history.history) {
        result.skipped += 1;
        continue;
      }
      const evidence = evidenceFromHistory(history.history, exercise.target);
      if (evidence.length === 0) {
        result.skipped += 1;
        continue;
      }
      const decision = decideProgression(exercise.target, evidence, now);
      const recorded = await recordTrainingDecision(input.trainingClient, {
        exerciseSlug: exercise.target.exerciseSlug,
        action: decision.action,
        rationale: decision.rationale,
        payload: {
          currentLoadKg: decision.currentLoadKg,
          suggestedLoadKg: decision.suggestedLoadKg,
          suggestedReps: decision.suggestedReps,
          suggestedSets: decision.suggestedSets,
          suggestedDurationSeconds: decision.suggestedDurationSeconds,
          evidence: decision.evidence
        },
        policyVersion: decision.policyVersion,
        activityId: input.activityId
      });
      if (recorded.ok) result.recorded += 1;
      else result.failed += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

// src/app/lib/workoutQueue.ts
var WORKOUT_QUEUE_VERSION = 1;
var WORKOUT_QUEUE_KEY_PREFIX = "svj_app_state_v5_workout_queue:";
var WORKOUT_DRAFT_KEY_PREFIX = "svj_app_state_v5_workout_draft:";
function workoutQueueKey(userId) {
  return `${WORKOUT_QUEUE_KEY_PREFIX}${userId}`;
}
function workoutDraftKey(userId) {
  return `${WORKOUT_DRAFT_KEY_PREFIX}${userId}`;
}
var isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
function isSetDraft(value) {
  if (!value || typeof value !== "object") return false;
  const set = value;
  if (typeof set.id !== "string" || set.id.length === 0) return false;
  if (set.reps !== null && !isFiniteNumber(set.reps)) return false;
  if (set.weightKg !== null && !isFiniteNumber(set.weightKg)) return false;
  if (set.durationSeconds !== null && !isFiniteNumber(set.durationSeconds)) return false;
  return true;
}
function isExerciseDraft(value) {
  if (!value || typeof value !== "object") return false;
  const draft = value;
  if (typeof draft.id !== "string" || typeof draft.exerciseId !== "string") return false;
  if (!Array.isArray(draft.sets) || draft.sets.length === 0) return false;
  return draft.sets.every(isSetDraft);
}
function normalizeContext(value) {
  if (!value || typeof value !== "object") return null;
  const context = value;
  return {
    planId: typeof context.planId === "string" ? context.planId : null,
    planSessionId: typeof context.planSessionId === "string" ? context.planSessionId : null,
    templateId: typeof context.templateId === "string" ? context.templateId : null,
    templateVersion: isFiniteNumber(context.templateVersion) ? context.templateVersion : null
  };
}
function normalizeTargets(value) {
  return Array.isArray(value) ? value.filter((t) => t && typeof t === "object") : [];
}
function normalizeSlugMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const map = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry) map[key] = entry;
  }
  return Object.keys(map).length > 0 ? map : void 0;
}
function normalizeQueuedWorkout(raw, userId) {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw;
  if (entry.userId !== userId) return null;
  if (typeof entry.clientSessionId !== "string" || entry.clientSessionId.length < 8) return null;
  if (!isFiniteNumber(entry.startedAtMs) || !isFiniteNumber(entry.endedAtMs)) return null;
  if (entry.endedAtMs <= entry.startedAtMs) return null;
  if (!Array.isArray(entry.drafts) || entry.drafts.length === 0) return null;
  if (!entry.drafts.every(isExerciseDraft)) return null;
  const status = entry.status;
  return {
    version: WORKOUT_QUEUE_VERSION,
    userId,
    clientSessionId: entry.clientSessionId,
    startedAtMs: entry.startedAtMs,
    endedAtMs: entry.endedAtMs,
    durationSeconds: isFiniteNumber(entry.durationSeconds) ? entry.durationSeconds : Math.max(1, Math.round((entry.endedAtMs - entry.startedAtMs) / 1e3)),
    drafts: entry.drafts,
    perceivedEffort: isFiniteNumber(entry.perceivedEffort) ? entry.perceivedEffort : void 0,
    notes: typeof entry.notes === "string" ? entry.notes : void 0,
    context: normalizeContext(entry.context),
    targets: normalizeTargets(entry.targets),
    slugByExerciseId: normalizeSlugMap(entry.slugByExerciseId),
    status: status === "syncing" || status === "failed" ? status : "pending",
    attempts: isFiniteNumber(entry.attempts) ? Math.max(0, Math.floor(entry.attempts)) : 0,
    lastAttemptAt: typeof entry.lastAttemptAt === "string" ? entry.lastAttemptAt : null,
    lastError: typeof entry.lastError === "string" ? entry.lastError : null,
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : (/* @__PURE__ */ new Date()).toISOString()
  };
}
function readWorkoutQueue(userId) {
  if (!userId) return [];
  const stored = appStorage.getItem(workoutQueueKey(userId));
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => normalizeQueuedWorkout(entry, userId)).filter((entry) => entry !== null);
  } catch {
    return [];
  }
}
function writeWorkoutQueue(userId, entries) {
  if (!userId) return { ok: false, error: "No signed-in account." };
  try {
    const previous = appStorage.getItem(workoutQueueKey(userId));
    const parsed = previous ? JSON.parse(previous) : [];
    if (!Array.isArray(parsed))
      return { ok: false, error: "Saved workouts need recovery. Your original queue is retained." };
    const unknown = parsed.filter((entry) => normalizeQueuedWorkout(entry, userId) == null);
    return writeStoredJson(workoutQueueKey(userId), [...entries, ...unknown]);
  } catch {
    return { ok: false, error: "Saved workouts need recovery. Your original queue is retained." };
  }
}
function enqueueWorkout(queue, entry) {
  return [entry, ...queue.filter((e) => e.clientSessionId !== entry.clientSessionId)];
}
function dequeueWorkout(queue, clientSessionId) {
  return queue.filter((entry) => entry.clientSessionId !== clientSessionId);
}
function markWorkoutAttempt(queue, clientSessionId, result) {
  return queue.map(
    (entry) => entry.clientSessionId !== clientSessionId ? entry : {
      ...entry,
      status: result.ok ? "pending" : "failed",
      attempts: entry.attempts + 1,
      lastAttemptAt: result.at ?? (/* @__PURE__ */ new Date()).toISOString(),
      lastError: result.ok ? null : result.error ?? "Couldn't reach the server."
    }
  );
}
function pendingWorkoutsFor(queue, userId) {
  return queue.filter((entry) => entry.userId === userId && entry.status !== "syncing");
}
function isRetryableFailure(error) {
  if (!error) return true;
  const message = error.toLowerCase();
  return message.includes("network") || message.includes("timeout") || message.includes("timed out") || message.includes("fetch") || message.includes("offline") || message.includes("failed to load") || message.includes("connection") || message.includes("502") || message.includes("503") || message.includes("504");
}
function readWorkoutDraft(userId) {
  if (!userId) return null;
  const stored = appStorage.getItem(workoutDraftKey(userId));
  if (!stored) return null;
  try {
    const raw = JSON.parse(stored);
    if (!raw || typeof raw !== "object" || raw.userId !== userId) return null;
    if (typeof raw.clientSessionId !== "string" || raw.clientSessionId.length < 8) return null;
    if (!isFiniteNumber(raw.startedAtMs)) return null;
    if (!Array.isArray(raw.drafts) || !raw.drafts.every(isExerciseDraft)) return null;
    return {
      version: WORKOUT_QUEUE_VERSION,
      userId,
      clientSessionId: raw.clientSessionId,
      startedAtMs: raw.startedAtMs,
      drafts: raw.drafts,
      context: normalizeContext(raw.context),
      targets: normalizeTargets(raw.targets),
      note: typeof raw.note === "string" ? raw.note : null,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch {
    return null;
  }
}
function writeWorkoutDraft(userId, draft) {
  if (!userId) return { ok: false, error: "No signed-in account." };
  return writeStoredJson(workoutDraftKey(userId), {
    ...draft,
    version: WORKOUT_QUEUE_VERSION,
    userId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function clearWorkoutDraft(userId) {
  if (!userId) return;
  appStorage.removeItem(workoutDraftKey(userId));
}

// src/app/hooks/useWorkoutQueue.ts
var activeDrains = /* @__PURE__ */ new Set();
function persistQueue(userId, queue) {
  const saved = writeWorkoutQueue(userId, queue);
  if (!saved.ok) throw new Error(saved.error);
  window.dispatchEvent(new Event("svj-workout-queue"));
}
function useAuthUserId() {
  const [userId, setUserId] = useState21(null);
  useEffect21(() => {
    let active = true;
    const auth = supabase?.auth;
    if (!auth) return;
    void auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user?.id ?? null);
    }).catch(() => {
      if (active) setUserId(null);
    });
    const { data: subscription } = auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);
  return userId;
}
function useWorkoutQueue() {
  const userId = useAuthUserId();
  const queryClient = useQueryClient2();
  const [pending, setPending] = useState21([]);
  const [syncing, setSyncing] = useState21(false);
  const [lastError, setLastError] = useState21(null);
  const [lastSyncedAt, setLastSyncedAt] = useState21(null);
  const syncingRef = useRef13(false);
  const owner = useRef13(userId);
  owner.current = userId;
  const refresh = useCallback15(() => {
    setPending(userId ? pendingWorkoutsFor(readWorkoutQueue(userId), userId) : []);
  }, [userId]);
  useEffect21(() => {
    refresh();
    window.addEventListener("svj-workout-queue", refresh);
    return () => window.removeEventListener("svj-workout-queue", refresh);
  }, [refresh]);
  const enqueueNow = useCallback15(
    (input) => {
      if (!userId) return;
      const queue = readWorkoutQueue(userId);
      const next = enqueueWorkout(queue, {
        ...input,
        version: 1,
        userId,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      try {
        persistQueue(userId, next);
      } catch {
        setLastError("Could not keep this workout on your device. Free storage and retry.");
        throw new Error("Workout has not been saved. Check device storage.");
      }
      setPending(pendingWorkoutsFor(next, userId));
    },
    [userId]
  );
  const discard = useCallback15(
    (clientSessionId) => {
      if (!userId) return;
      const next = dequeueWorkout(readWorkoutQueue(userId), clientSessionId);
      persistQueue(userId, next);
      setPending(pendingWorkoutsFor(next, userId));
    },
    [userId]
  );
  const sync = useCallback15(async () => {
    if (!userId || syncingRef.current || activeDrains.has(userId) || document.hidden)
      return { synced: 0, failed: 0 };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { synced: 0, failed: 0 };
    }
    const queued = pendingWorkoutsFor(readWorkoutQueue(userId), userId);
    if (queued.length === 0) return { synced: 0, failed: 0 };
    const auth = supabase?.auth;
    if (!auth) return { synced: 0, failed: 0 };
    activeDrains.add(userId);
    syncingRef.current = true;
    setSyncing(true);
    setLastError(null);
    let synced = 0;
    let failed = 0;
    try {
      for (const entry of queued) {
        const { data: sessionData } = await auth.getSession();
        if (owner.current !== userId || sessionData.session?.user.id !== userId || document.hidden)
          break;
        await withAccountRpcClient(
          userId,
          async (client) => {
            const result = await saveStrengthActivity(
              (fn, args) => client.rpc(fn, args),
              {
                clientSessionId: entry.clientSessionId,
                startedAtMs: entry.startedAtMs,
                endedAtMs: entry.endedAtMs,
                durationSeconds: entry.durationSeconds,
                drafts: entry.drafts,
                perceivedEffort: entry.perceivedEffort,
                notes: entry.notes
              }
            );
            if (owner.current !== userId) return;
            if (result.ok) {
              synced += 1;
              const trainingClient = (fn, args) => client.rpc(fn, args);
              if (entry.context && (entry.context.planSessionId || entry.context.templateId)) {
                await recordTrainingContext(trainingClient, entry.clientSessionId, {
                  ...entry.context,
                  targets: entry.targets
                });
              }
              if (entry.targets.length > 0 && result.activity) {
                const idBySlug = new Map(
                  Object.entries(entry.slugByExerciseId ?? {}).map(([id, slug]) => [slug, id])
                );
                const exercises = entry.targets.map((target) => {
                  const exerciseId = idBySlug.get(target.exerciseSlug) ?? entry.drafts.find((draft) => draft.name === target.exerciseName)?.exerciseId ?? null;
                  return exerciseId ? { target, exerciseId } : null;
                }).filter(
                  (item) => item !== null
                );
                if (exercises.length > 0) {
                  await syncTrainingDecisions({
                    trainingClient,
                    strengthCall: (fn, args) => client.rpc(fn, args),
                    exercises,
                    activityId: result.activity.id,
                    policyVersion: TRAINING_POLICY_VERSION
                  });
                }
              }
              if (!result.duplicate && result.activity) {
                const rewards = client;
                if (rewards) {
                  const processed = await processActivityRewards(rewards, result.activity.id);
                  if (processed.ok && processed.rewards) {
                    if (processed.rewards.xpAwarded > 0 || Object.keys(processed.rewards.statChanges).length > 0) {
                      void queryClient.invalidateQueries({ queryKey: ["user-stats"] });
                    }
                  }
                }
              }
              const remaining = dequeueWorkout(readWorkoutQueue(userId), entry.clientSessionId);
              persistQueue(userId, remaining);
              setPending(pendingWorkoutsFor(remaining, userId));
              setLastSyncedAt((/* @__PURE__ */ new Date()).toISOString());
            } else {
              failed += 1;
              setLastError(result.error ?? null);
              const marked = markWorkoutAttempt(readWorkoutQueue(userId), entry.clientSessionId, {
                ok: false,
                error: result.error ?? null
              });
              persistQueue(userId, marked);
              setPending(pendingWorkoutsFor(marked, userId));
            }
          },
          () => owner.current === userId
        );
      }
    } catch {
      failed += 1;
      setLastError(
        "Could not sync workouts. Your pending recordings are retained. Retry when connected and device storage is available."
      );
    } finally {
      activeDrains.delete(userId);
      syncingRef.current = false;
      setSyncing(false);
      if (owner.current === userId) refresh();
    }
    return { synced, failed };
  }, [userId, queryClient, refresh]);
  useEffect21(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onOnline);
    };
  }, [sync]);
  useEffect21(() => {
    if (!userId || pending.length === 0) return;
    void sync();
    const timer = setInterval(() => {
      if (!syncingRef.current) void sync();
    }, 45e3);
    return () => clearInterval(timer);
  }, [userId, pending.length, sync]);
  return {
    pending,
    pendingCount: pending.length,
    syncing,
    lastError,
    lastSyncedAt,
    enqueueNow,
    sync,
    discard,
    refresh
  };
}

// src/app/views/TrainStrength.tsx
import { Fragment as Fragment10, jsx as jsx22, jsxs as jsxs20 } from "react/jsx-runtime";
var EXERCISE_TYPE_LABELS = {
  weighted_reps: "Weighted reps",
  bodyweight_reps: "Bodyweight reps",
  duration: "Time based"
};
var REWARD_STAT_LABELS2 = {
  fitness: "PHYSICAL",
  discipline: "DISCIPLINE",
  focus: "MENTAL"
};
function formatTarget(target) {
  if (target.durationSeconds !== null) {
    return `${target.workSets} \xD7 ${target.durationSeconds} sec`;
  }
  const range = target.repMin === target.repMax ? `${target.repMax}` : `${target.repMin}\u2013${target.repMax}`;
  const load = target.loadKg !== null && target.loadKg > 0 ? ` @ ${target.loadKg} kg` : "";
  return `${target.workSets} \xD7 ${range}${load}`;
}
var numeric = (raw) => {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
var Field = ({ label, value, onChange, placeholder, step, testId }) => /* @__PURE__ */ jsxs20("label", { className: "flex-1", children: [
  /* @__PURE__ */ jsx22("span", { className: "text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]", children: label }),
  /* @__PURE__ */ jsx22(
    "input",
    {
      type: "number",
      inputMode: "decimal",
      step: step ?? 1,
      min: 0,
      value: value ?? "",
      placeholder,
      "data-testid": testId,
      onChange: (e) => onChange(numeric(e.target.value)),
      className: "mt-1 w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-center text-sm font-mono text-white placeholder:text-[#8C8C90]/50"
    }
  )
] });
var TrainStrength = ({ onExit, prescription = null }) => {
  const queryClient = useQueryClient3();
  const [catalog, setCatalog] = useState22([]);
  const [catalogError, setCatalogError] = useState22(null);
  const [catalogLoading, setCatalogLoading] = useState22(true);
  const [phase, setPhase] = useState22("idle");
  const [drafts, setDrafts] = useState22([]);
  const [startedAtMs, setStartedAtMs] = useState22(null);
  const [endedAtMs, setEndedAtMs] = useState22(null);
  const [pickerOpen, setPickerOpen] = useState22(false);
  const [draftError, setDraftError] = useState22(null);
  const [saving, setSaving] = useState22(false);
  const [saveError, setSaveError] = useState22(null);
  const [outcome, setOutcome] = useState22(null);
  const [rewards, setRewards] = useState22(null);
  const [targetByExerciseId, setTargetByExerciseId] = useState22(
    /* @__PURE__ */ new Map()
  );
  const [prescriptionNote, setPrescriptionNote] = useState22(null);
  const [pendingSync, setPendingSync] = useState22(false);
  const [resumable, setResumable] = useState22(null);
  const [perceivedEffort, setPerceivedEffort] = useState22(null);
  const sessionIdRef = useRef14("");
  const userId = useAuthUserId();
  const queue = useWorkoutQueue();
  useEffect22(() => {
    if (phase === "idle" && sessionIdRef.current === "") {
      setResumable(readWorkoutDraft(userId));
    }
  }, [phase, userId]);
  useEffect22(() => {
    if (phase !== "logging" || startedAtMs === null || sessionIdRef.current === "") return;
    writeWorkoutDraft(userId, {
      clientSessionId: sessionIdRef.current,
      startedAtMs,
      drafts,
      context: prescription?.context ?? null,
      targets: prescription?.targets ?? [],
      note: prescriptionNote
    });
  }, [phase, startedAtMs, drafts, prescription, prescriptionNote, userId]);
  useEffect22(() => {
    if (queue.pendingCount > 0) void queue.sync();
  }, [queue.pendingCount]);
  const loadCatalog = useCallback16(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    const client = strengthRpcClient();
    if (!client) {
      setCatalogError("Backend is not configured.");
      setCatalogLoading(false);
      return;
    }
    const result = await listExercises((fn, args) => client.rpc(fn, args));
    if (result.ok) setCatalog(result.exercises);
    else setCatalogError(result.error ?? "Couldn't load exercises.");
    setCatalogLoading(false);
  }, []);
  useEffect22(() => {
    void loadCatalog();
  }, [loadCatalog]);
  const summary = useMemo11(() => computeDraftSummary(drafts), [drafts]);
  const start = () => {
    sessionIdRef.current = buildClientSessionId();
    setOutcome(null);
    setRewards(null);
    setSaveError(null);
    setDraftError(null);
    setPendingSync(false);
    setPerceivedEffort(null);
    setEndedAtMs(null);
    setStartedAtMs(Date.now());
    if (prescription && prescription.targets.length > 0 && catalog.length > 0) {
      const bySlug = new Map(catalog.map((option) => [option.slug, option]));
      const { resolved, unresolved } = resolveTargetsToProps(prescription.targets, bySlug);
      const targetMap = /* @__PURE__ */ new Map();
      const prefilled = [];
      for (const item of resolved) {
        const option = bySlug.get(item.target.exerciseSlug);
        if (!option) continue;
        const draft = createExerciseDraft(option);
        const sets = Array.from({ length: Math.max(1, item.target.workSets) }, () => ({
          ...createSetDraft(),
          weightKg: item.target.loadKg ?? null
        }));
        targetMap.set(option.id, item.target);
        prefilled.push({ ...draft, sets });
      }
      setTargetByExerciseId(targetMap);
      setDrafts(prefilled);
      setPrescriptionNote(
        unresolved.length > 0 ? `${unresolved.length} planned movement${unresolved.length === 1 ? "" : "s"} need a catalog match \u2014 add ${unresolved.length === 1 ? "it" : "them"} from the picker.` : prescription.note ?? null
      );
    } else {
      setTargetByExerciseId(/* @__PURE__ */ new Map());
      setPrescriptionNote(prescription?.note ?? null);
      setDrafts([]);
    }
    setPhase("logging");
  };
  const reset = () => {
    clearWorkoutDraft(userId);
    sessionIdRef.current = "";
    setDrafts([]);
    setOutcome(null);
    setSaveError(null);
    setDraftError(null);
    setPendingSync(false);
    setPerceivedEffort(null);
    setTargetByExerciseId(/* @__PURE__ */ new Map());
    setPrescriptionNote(null);
    setStartedAtMs(null);
    setEndedAtMs(null);
    setPhase("idle");
  };
  const resumeDraft = (draft) => {
    sessionIdRef.current = draft.clientSessionId;
    setDrafts(draft.drafts);
    setStartedAtMs(draft.startedAtMs);
    setEndedAtMs(null);
    setPrescriptionNote(draft.note);
    setOutcome(null);
    setSaveError(null);
    setPendingSync(false);
    setResumable(null);
    setPhase("logging");
  };
  const addExercise = (option) => {
    setDrafts((prev) => [...prev, createExerciseDraft(option)]);
    setPickerOpen(false);
    setDraftError(null);
  };
  const updateSet = (exerciseId, setId, patch) => {
    setDrafts(
      (prev) => prev.map(
        (draft) => draft.id !== exerciseId ? draft : {
          ...draft,
          sets: draft.sets.map((set) => set.id === setId ? { ...set, ...patch } : set)
        }
      )
    );
  };
  const addSet = (exerciseId) => {
    setDrafts(
      (prev) => prev.map(
        (draft) => draft.id !== exerciseId ? draft : { ...draft, sets: [...draft.sets, createSetDraft(draft.sets[draft.sets.length - 1])] }
      )
    );
  };
  const removeSet = (exerciseId, setId) => {
    setDrafts(
      (prev) => prev.map(
        (draft) => draft.id !== exerciseId || draft.sets.length <= 1 ? draft : { ...draft, sets: draft.sets.filter((set) => set.id !== setId) }
      )
    );
  };
  const removeExercise = (exerciseId) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== exerciseId));
  };
  const moveExercise = (exerciseId, direction) => {
    setDrafts((prev) => {
      const index = prev.findIndex((draft) => draft.id === exerciseId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };
  const setNotes = (exerciseId, notes) => {
    setDrafts(
      (prev) => prev.map((draft) => draft.id === exerciseId ? { ...draft, notes } : draft)
    );
  };
  const finish = () => {
    const invalid = validateStrengthDraft(drafts);
    if (invalid) {
      setDraftError(invalid);
      return;
    }
    setDraftError(null);
    const now = Date.now();
    setEndedAtMs(now);
    setPhase("summary");
  };
  const save = async () => {
    if (startedAtMs === null || endedAtMs === null) return;
    setSaving(true);
    setSaveError(null);
    const client = strengthRpcClient();
    if (!client) {
      setSaving(false);
      setSaveError("Backend is not configured.");
      return;
    }
    const result = await saveStrengthActivity((fn, args) => client.rpc(fn, args), {
      clientSessionId: sessionIdRef.current,
      startedAtMs,
      endedAtMs,
      durationSeconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1e3)),
      drafts,
      perceivedEffort: perceivedEffort ?? void 0
    });
    setSaving(false);
    if (result.ok) {
      clearWorkoutDraft(userId);
      setOutcome(result);
      setPhase("saved");
      if (!result.duplicate && prescription) {
        const trpc = trainingRpcClient();
        if (trpc) {
          void recordTrainingContext(trpc, sessionIdRef.current, {
            ...prescription.context,
            targets: prescription.targets
          });
        }
      }
      if (!result.duplicate && result.activity && targetByExerciseId.size > 0) {
        const trpc = trainingRpcClient();
        if (trpc) {
          const exercises = [...targetByExerciseId.entries()].map(([exerciseId, target]) => ({
            exerciseId,
            target
          }));
          void syncTrainingDecisions({
            trainingClient: trpc,
            strengthCall: (fn, args) => client.rpc(fn, args),
            exercises,
            activityId: result.activity.id,
            policyVersion: TRAINING_POLICY_VERSION
          });
        }
      }
      if (!result.duplicate && result.activity) {
        const rpc = rewardsRpcClient();
        if (rpc) {
          const processed = await processActivityRewards(rpc, result.activity.id);
          if (processed.ok) setRewards(processed.rewards ?? null);
          if (processed.ok && processed.rewards && (processed.rewards.xpAwarded > 0 || Object.keys(processed.rewards.statChanges).length > 0)) {
            void queryClient.invalidateQueries({ queryKey: ["user-stats"] });
          }
        }
      }
    } else if (isRetryableFailure(result.error)) {
      queue.enqueueNow({
        clientSessionId: sessionIdRef.current,
        startedAtMs,
        endedAtMs,
        durationSeconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1e3)),
        drafts,
        perceivedEffort: perceivedEffort ?? void 0,
        context: prescription?.context ?? null,
        targets: prescription?.targets ?? [],
        slugByExerciseId: Object.fromEntries(
          [...targetByExerciseId.entries()].map(([id, target]) => [id, target.exerciseSlug])
        )
      });
      setPendingSync(true);
      setSaveError(result.error ?? "Couldn't save the workout.");
    } else {
      setPendingSync(false);
      setSaveError(result.error ?? "Couldn't save the workout.");
    }
  };
  const durationSeconds = startedAtMs !== null && endedAtMs !== null ? Math.max(1, Math.round((endedAtMs - startedAtMs) / 1e3)) : 0;
  return /* @__PURE__ */ jsxs20(
    "div",
    {
      className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5",
      "data-testid": "strength-logger",
      children: [
        /* @__PURE__ */ jsxs20("div", { className: "mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs20("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx22(Dumbbell, { className: "h-4 w-4 text-[#C81E3A]" }),
            /* @__PURE__ */ jsx22("span", { className: "text-xs font-mono font-bold uppercase tracking-widest text-white", children: "Strength Workout" })
          ] }),
          /* @__PURE__ */ jsxs20(
            "button",
            {
              type: "button",
              onClick: () => {
                reset();
                onExit();
              },
              className: "flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white",
              children: [
                /* @__PURE__ */ jsx22(ArrowLeft2, { className: "h-3 w-3" }),
                " Activity"
              ]
            }
          )
        ] }),
        prescriptionNote && phase !== "saved" && /* @__PURE__ */ jsx22(
          "p",
          {
            "data-testid": "strength-prescription-note",
            className: "mb-2 whitespace-pre-line rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-3 py-2 text-[11px] font-inter text-[#E8D9A0]",
            children: prescriptionNote
          }
        ),
        phase === "idle" && /* @__PURE__ */ jsxs20("div", { className: "py-6 text-center", children: [
          /* @__PURE__ */ jsx22("p", { className: "font-anton text-lg tracking-wide text-white", children: prescription?.title ?? "Structured strength" }),
          /* @__PURE__ */ jsx22("p", { className: "mx-auto mt-1 max-w-xs text-[11px] font-mono text-[#8C8C90]", children: "Log exercises, sets, reps and weight. One workout is saved as a single canonical activity with its full exercise history." }),
          resumable && /* @__PURE__ */ jsxs20(
            "div",
            {
              "data-testid": "strength-resume-draft",
              className: "mx-auto mt-4 max-w-sm rounded-2xl border border-white/10 bg-black/40 p-3 text-left",
              children: [
                /* @__PURE__ */ jsx22("p", { className: "text-[11px] font-mono uppercase tracking-wider text-white", children: "Unfinished workout on this device" }),
                /* @__PURE__ */ jsxs20("p", { className: "mt-1 text-[10px] font-mono text-[#8C8C90]", children: [
                  resumable.drafts.length,
                  " exercise",
                  resumable.drafts.length === 1 ? "" : "s",
                  " logged \u2014 pick up where you left off, or discard it."
                ] }),
                /* @__PURE__ */ jsxs20("div", { className: "mt-2 flex gap-2", children: [
                  /* @__PURE__ */ jsx22(
                    "button",
                    {
                      type: "button",
                      onClick: () => resumeDraft(resumable),
                      className: "flex-1 rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white",
                      children: "Resume workout"
                    }
                  ),
                  /* @__PURE__ */ jsx22(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        clearWorkoutDraft(userId);
                        setResumable(null);
                      },
                      className: "rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]",
                      children: "Discard"
                    }
                  )
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsx22(
            "button",
            {
              type: "button",
              onClick: start,
              "data-testid": "strength-start",
              className: "mt-4 rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-5 py-3 text-xs font-mono font-bold uppercase tracking-widest text-white hover:bg-[#C81E3A]/30",
              children: resumable ? "START A NEW WORKOUT" : "START WORKOUT"
            }
          ),
          queue.pendingCount > 0 && /* @__PURE__ */ jsxs20(
            "p",
            {
              "data-testid": "strength-queue-count",
              className: "mt-3 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37]",
              children: [
                queue.pendingCount,
                " workout",
                queue.pendingCount === 1 ? "" : "s",
                " waiting to sync"
              ]
            }
          )
        ] }),
        phase === "logging" && /* @__PURE__ */ jsxs20(Fragment10, { children: [
          drafts.length === 0 && /* @__PURE__ */ jsxs20("div", { className: "rounded-2xl border border-white/5 bg-black/40 p-4 text-center", children: [
            /* @__PURE__ */ jsx22("p", { className: "font-inter text-sm font-semibold text-[#F4F2ED]", children: "No exercises yet" }),
            /* @__PURE__ */ jsx22("p", { className: "mt-1 text-[11px] font-mono text-[#8C8C90]", children: "Add your first exercise to start logging sets." })
          ] }),
          /* @__PURE__ */ jsx22("div", { className: "space-y-3", children: drafts.map((draft, index) => /* @__PURE__ */ jsxs20(
            "div",
            {
              "data-testid": "strength-exercise",
              className: "rounded-2xl border border-white/10 bg-black/40 p-3",
              children: [
                /* @__PURE__ */ jsxs20("div", { className: "flex items-start justify-between gap-2", children: [
                  /* @__PURE__ */ jsxs20("div", { children: [
                    /* @__PURE__ */ jsx22("p", { className: "text-xs font-mono font-bold uppercase tracking-wider text-white", children: draft.name }),
                    /* @__PURE__ */ jsxs20("div", { className: "mt-0.5 flex flex-wrap items-center gap-1.5", children: [
                      /* @__PURE__ */ jsx22("span", { className: "rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-inter text-[10px] text-[#8C8C90]", children: MUSCLE_LABELS[draft.primaryMuscle] }),
                      /* @__PURE__ */ jsx22("span", { className: "font-inter text-[10px] text-[#8C8C90]", children: EXERCISE_TYPE_LABELS[draft.exerciseType] })
                    ] }),
                    targetByExerciseId.get(draft.exerciseId) && /* @__PURE__ */ jsxs20(
                      "p",
                      {
                        "data-testid": "strength-target",
                        className: "mt-0.5 text-[10px] font-mono text-[#D4AF37]",
                        children: [
                          "Target ",
                          formatTarget(targetByExerciseId.get(draft.exerciseId))
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs20("div", { className: "flex items-center gap-1", children: [
                    /* @__PURE__ */ jsx22(
                      "button",
                      {
                        type: "button",
                        "aria-label": `Move ${draft.name} up`,
                        disabled: index === 0,
                        onClick: () => moveExercise(draft.id, -1),
                        className: "rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-[#8C8C90] disabled:opacity-30",
                        children: "\u2191"
                      }
                    ),
                    /* @__PURE__ */ jsx22(
                      "button",
                      {
                        type: "button",
                        "aria-label": `Move ${draft.name} down`,
                        disabled: index === drafts.length - 1,
                        onClick: () => moveExercise(draft.id, 1),
                        className: "rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-[#8C8C90] disabled:opacity-30",
                        children: "\u2193"
                      }
                    ),
                    /* @__PURE__ */ jsx22(
                      "button",
                      {
                        type: "button",
                        "aria-label": `Remove ${draft.name}`,
                        onClick: () => removeExercise(draft.id),
                        className: "rounded-lg border border-white/10 p-1 text-[#8C8C90] hover:text-crimson",
                        children: /* @__PURE__ */ jsx22(Trash25, { className: "h-3 w-3" })
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsx22("div", { className: "mt-2.5 space-y-2", children: draft.sets.map((set, setIndex) => /* @__PURE__ */ jsxs20("div", { className: "flex items-end gap-2", "data-testid": "strength-set", children: [
                  /* @__PURE__ */ jsxs20("span", { className: "w-10 pb-2 text-[9px] font-mono uppercase text-[#8C8C90]", children: [
                    "#",
                    setIndex + 1
                  ] }),
                  draft.exerciseType === "duration" ? /* @__PURE__ */ jsx22(
                    Field,
                    {
                      label: "Seconds",
                      value: set.durationSeconds,
                      placeholder: "60",
                      testId: "strength-set-duration",
                      onChange: (durationSeconds2) => updateSet(draft.id, set.id, { durationSeconds: durationSeconds2 })
                    }
                  ) : /* @__PURE__ */ jsxs20(Fragment10, { children: [
                    /* @__PURE__ */ jsx22(
                      Field,
                      {
                        label: "Reps",
                        value: set.reps,
                        placeholder: "10",
                        testId: "strength-set-reps",
                        onChange: (reps) => updateSet(draft.id, set.id, { reps })
                      }
                    ),
                    /* @__PURE__ */ jsx22(
                      Field,
                      {
                        label: draft.exerciseType === "weighted_reps" ? "Kg" : "Kg (opt)",
                        value: set.weightKg,
                        placeholder: draft.exerciseType === "weighted_reps" ? "60" : "\u2014",
                        step: 0.5,
                        testId: "strength-set-weight",
                        onChange: (weightKg) => updateSet(draft.id, set.id, { weightKg })
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsx22(
                    "button",
                    {
                      type: "button",
                      "aria-pressed": set.isWarmup === true,
                      "aria-label": set.isWarmup ? `Set ${setIndex + 1} is a warm-up set. Mark as working set` : `Mark set ${setIndex + 1} as a warm-up set`,
                      title: "Warm-up set \u2014 shown in history but never counts as working volume",
                      onClick: () => updateSet(draft.id, set.id, { isWarmup: set.isWarmup !== true }),
                      "data-testid": "strength-set-warmup",
                      className: `mb-1.5 rounded-md border px-1.5 py-1 text-[9px] font-mono uppercase tracking-wider ${set.isWarmup ? "border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]" : "border-white/10 text-[#8C8C90] hover:text-white"}`,
                      children: "WU"
                    }
                  ),
                  /* @__PURE__ */ jsx22(
                    "button",
                    {
                      type: "button",
                      "aria-label": `Remove set ${setIndex + 1}`,
                      onClick: () => removeSet(draft.id, set.id),
                      disabled: draft.sets.length <= 1,
                      className: "pb-2 text-[#8C8C90] disabled:opacity-30 hover:text-crimson",
                      children: /* @__PURE__ */ jsx22(X3, { className: "h-3.5 w-3.5" })
                    }
                  )
                ] }, set.id)) }),
                /* @__PURE__ */ jsxs20("div", { className: "mt-2 flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxs20(
                    "button",
                    {
                      type: "button",
                      onClick: () => addSet(draft.id),
                      "data-testid": "strength-add-set",
                      className: "flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-mono uppercase text-[#8C8C90] hover:text-white",
                      children: [
                        /* @__PURE__ */ jsx22(Plus3, { className: "h-3 w-3" }),
                        " Set"
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx22(
                    "input",
                    {
                      value: draft.notes ?? "",
                      onChange: (e) => setNotes(draft.id, e.target.value),
                      "aria-label": `Note for ${draft.name}`,
                      maxLength: 300,
                      placeholder: "Note (optional)",
                      className: "flex-1 rounded-lg border border-white/10 bg-[#17171A] px-2 py-1.5 text-[11px] font-mono text-white placeholder:text-[#8C8C90]/50"
                    }
                  )
                ] })
              ]
            },
            draft.id
          )) }),
          /* @__PURE__ */ jsxs20("div", { className: "mt-3 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxs20(
              "button",
              {
                type: "button",
                onClick: () => setPickerOpen(true),
                "data-testid": "strength-add-exercise",
                className: "flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white",
                children: [
                  /* @__PURE__ */ jsx22(Plus3, { className: "h-3 w-3" }),
                  " Add Exercise"
                ]
              }
            ),
            /* @__PURE__ */ jsx22(
              "button",
              {
                type: "button",
                onClick: finish,
                "data-testid": "strength-finish",
                disabled: drafts.length === 0,
                className: "ml-auto rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white disabled:opacity-40",
                children: "FINISH WORKOUT"
              }
            )
          ] }),
          draftError && /* @__PURE__ */ jsxs20(
            "p",
            {
              role: "alert",
              className: "mt-2 flex items-start gap-1.5 text-[10px] font-mono text-crimson",
              children: [
                /* @__PURE__ */ jsx22(AlertCircle6, { className: "mt-0.5 h-3 w-3 shrink-0" }),
                draftError
              ]
            }
          ),
          pickerOpen && /* @__PURE__ */ jsx22(
            ExercisePicker,
            {
              catalog,
              loading: catalogLoading,
              error: catalogError,
              onRetry: () => void loadCatalog(),
              onSelect: addExercise,
              onClose: () => setPickerOpen(false),
              onCreated: (option) => {
                setCatalog((prev) => [...prev, option]);
                addExercise(option);
              }
            }
          )
        ] }),
        (phase === "summary" || phase === "saved") && /* @__PURE__ */ jsxs20(
          motion.div,
          {
            initial: { opacity: 0, y: 12 },
            animate: { opacity: 1, y: 0 },
            "data-testid": "strength-summary",
            children: [
              /* @__PURE__ */ jsx22("p", { className: "font-anton text-lg uppercase tracking-wider text-white", children: "STRENGTH COMPLETE" }),
              /* @__PURE__ */ jsxs20("div", { className: "mt-3 grid grid-cols-2 gap-2", children: [
                /* @__PURE__ */ jsx22(Stat, { label: "Duration", value: formatDurationLabel(durationSeconds) }),
                /* @__PURE__ */ jsx22(Stat, { label: "Exercises", value: String(summary.exerciseCount) }),
                /* @__PURE__ */ jsx22(Stat, { label: "Sets", value: String(summary.setCount) }),
                /* @__PURE__ */ jsx22(Stat, { label: "Total Reps", value: String(summary.totalReps) })
              ] }),
              summary.volumeKg > 0 && /* @__PURE__ */ jsxs20("div", { className: "mt-2 rounded-2xl border border-white/5 bg-black/40 p-3", children: [
                /* @__PURE__ */ jsx22("div", { className: "text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]", children: "Training Volume" }),
                /* @__PURE__ */ jsx22("div", { className: "font-mono text-xl font-bold text-white", children: formatVolume(summary.volumeKg) }),
                /* @__PURE__ */ jsx22("p", { className: "mt-0.5 text-[9px] font-mono text-[#8C8C90]", children: "Weighted sets only \u2014 bodyweight sets add no load." })
              ] }),
              /* @__PURE__ */ jsx22("div", { className: "mt-3", children: /* @__PURE__ */ jsx22(MuscleTrainedList, { muscles: summary.muscles }) }),
              /* @__PURE__ */ jsx22("div", { className: "mt-3 space-y-2", children: drafts.map((draft) => /* @__PURE__ */ jsxs20("div", { className: "rounded-full border border-white/5 bg-black/40 p-2.5", children: [
                /* @__PURE__ */ jsx22("p", { className: "text-[11px] font-mono font-bold uppercase tracking-wider text-white", children: draft.name }),
                /* @__PURE__ */ jsx22("ul", { className: "mt-1 space-y-0.5", children: draft.sets.map((set, index) => /* @__PURE__ */ jsxs20("li", { className: "flex justify-between text-[11px] font-mono", children: [
                  /* @__PURE__ */ jsx22("span", { className: "text-[#8C8C90]", children: set.isWarmup ? `WARM-UP ${index + 1}` : `SET ${index + 1}` }),
                  /* @__PURE__ */ jsx22("span", { className: set.isWarmup ? "text-[#8C8C90]" : "text-white", children: formatSetLabel(set) })
                ] }, set.id)) })
              ] }, draft.id)) }),
              phase === "summary" && /* @__PURE__ */ jsxs20(Fragment10, { children: [
                /* @__PURE__ */ jsxs20("div", { className: "mt-4", "data-testid": "strength-effort", children: [
                  /* @__PURE__ */ jsx22(
                    "p",
                    {
                      id: "strength-effort-label",
                      className: "text-[9px] font-mono uppercase tracking-wider text-[#8C8C90]",
                      children: "How hard was it? (1\u201310)"
                    }
                  ),
                  /* @__PURE__ */ jsx22(
                    "div",
                    {
                      role: "group",
                      "aria-labelledby": "strength-effort-label",
                      className: "mt-1.5 flex flex-wrap gap-1",
                      children: Array.from({ length: 10 }, (_, index) => index + 1).map((value) => /* @__PURE__ */ jsx22(
                        "button",
                        {
                          type: "button",
                          "aria-pressed": perceivedEffort === value,
                          "aria-label": `Effort ${value} of 10`,
                          onClick: () => setPerceivedEffort((prev) => prev === value ? null : value),
                          className: `h-8 w-8 rounded-lg border font-mono text-[11px] ${perceivedEffort === value ? "border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]" : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"}`,
                          children: value
                        },
                        value
                      ))
                    }
                  ),
                  /* @__PURE__ */ jsx22("p", { className: "mt-1 text-[9px] font-mono text-[#8C8C90]", children: "Optional \u2014 effort is real evidence for future load decisions, never a score." })
                ] }),
                pendingSync ? /* @__PURE__ */ jsxs20(
                  "div",
                  {
                    "data-testid": "strength-pending-sync",
                    className: "mt-4 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 p-3",
                    children: [
                      /* @__PURE__ */ jsxs20("p", { className: "flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-[#D4AF37]", children: [
                        /* @__PURE__ */ jsx22(Clock2, { className: "h-3.5 w-3.5" }),
                        " Pending sync"
                      ] }),
                      /* @__PURE__ */ jsxs20("p", { role: "alert", className: "mt-1 text-[11px] font-inter text-[#B8B8C0]", children: [
                        "COULDN'T SAVE WORKOUT \u2014 ",
                        saveError ?? "the server could not be reached",
                        ". It is kept on this device and will sync automatically when you're back online; nothing is counted until the server confirms it."
                      ] }),
                      /* @__PURE__ */ jsx22(
                        "button",
                        {
                          type: "button",
                          onClick: () => void save(),
                          disabled: saving,
                          "data-testid": "strength-retry",
                          className: "mt-2 rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#D4AF37] disabled:opacity-40",
                          children: saving ? "Syncing\u2026" : "Retry"
                        }
                      )
                    ]
                  }
                ) : /* @__PURE__ */ jsx22(
                  "button",
                  {
                    type: "button",
                    onClick: () => void save(),
                    disabled: saving,
                    "data-testid": "strength-save",
                    className: "mt-4 w-full rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-3 text-xs font-mono font-bold uppercase tracking-widest text-white disabled:opacity-50",
                    children: saving ? "SAVING\u2026" : "SAVE ACTIVITY"
                  }
                ),
                saveError && !pendingSync && /* @__PURE__ */ jsxs20("div", { className: "mt-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3", children: [
                  /* @__PURE__ */ jsxs20(
                    "p",
                    {
                      role: "alert",
                      className: "flex items-start gap-1.5 text-[11px] font-mono text-crimson",
                      children: [
                        /* @__PURE__ */ jsx22(AlertCircle6, { className: "mt-0.5 h-3.5 w-3.5 shrink-0" }),
                        "COULDN'T SAVE WORKOUT \u2014 ",
                        saveError
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx22(
                    "button",
                    {
                      type: "button",
                      onClick: () => void save(),
                      "data-testid": "strength-retry",
                      className: "mt-2 rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-crimson",
                      children: "Retry"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx22(
                  "button",
                  {
                    type: "button",
                    onClick: reset,
                    className: "mt-3 w-full text-[9px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white",
                    children: "Discard workout"
                  }
                )
              ] }),
              phase === "saved" && outcome && /* @__PURE__ */ jsxs20(Fragment10, { children: [
                /* @__PURE__ */ jsxs20(
                  "p",
                  {
                    role: "status",
                    className: "mt-3 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400",
                    children: [
                      /* @__PURE__ */ jsx22(CheckCircle24, { className: "h-3.5 w-3.5" }),
                      outcome.duplicate ? "Already saved \u2014 no duplicate workout created." : "Saved to your activity history."
                    ]
                  }
                ),
                !outcome.duplicate && rewards && (rewards.xpAwarded > 0 || Object.keys(rewards.statChanges).length > 0) && /* @__PURE__ */ jsxs20(
                  "div",
                  {
                    "data-testid": "strength-rewards",
                    className: "mt-3 rounded-2xl border border-[#C81E3A]/30 bg-black/40 px-3 py-2",
                    children: [
                      rewards.xpAwarded > 0 && /* @__PURE__ */ jsxs20("p", { className: "text-[11px] font-mono font-bold text-[#C81E3A]", children: [
                        "+",
                        rewards.xpAwarded,
                        " XP"
                      ] }),
                      Object.entries(REWARD_STAT_LABELS2).map(([key, label]) => {
                        const gain = rewards.statChanges[key];
                        if (!gain) return null;
                        return /* @__PURE__ */ jsxs20("p", { className: "text-[10px] font-mono text-[#8C8C90]", children: [
                          label,
                          " +",
                          gain
                        ] }, key);
                      }),
                      rewards.prBonusAwarded > 0 && /* @__PURE__ */ jsx22("p", { className: "mt-0.5 text-[10px] font-mono text-gold", children: "NEW PR \u{1F525}" })
                    ]
                  }
                ),
                !outcome.duplicate && outcome.strengthRecords.length > 0 && /* @__PURE__ */ jsxs20(
                  "div",
                  {
                    "data-testid": "strength-new-pr",
                    className: "mt-3 rounded-2xl border border-gold/40 bg-gold/5 p-3",
                    children: [
                      /* @__PURE__ */ jsxs20("p", { className: "flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-gold", children: [
                        /* @__PURE__ */ jsx22(Trophy6, { className: "h-3.5 w-3.5" }),
                        " NEW PERSONAL RECORD"
                      ] }),
                      /* @__PURE__ */ jsx22("ul", { className: "mt-2 space-y-2", children: outcome.strengthRecords.map((record) => /* @__PURE__ */ jsxs20(
                        "li",
                        {
                          className: "text-[11px] font-mono",
                          children: [
                            /* @__PURE__ */ jsxs20("div", { className: "text-white", children: [
                              record.exerciseName ?? "Exercise",
                              " \u2014",
                              " ",
                              STRENGTH_RECORD_LABELS[record.recordType]
                            ] }),
                            /* @__PURE__ */ jsxs20("div", { className: "text-gold", children: [
                              formatRecordValue2(record.recordType, record.value),
                              record.previousValue !== null && /* @__PURE__ */ jsxs20("span", { className: "ml-2 text-[#8C8C90]", children: [
                                "previous ",
                                formatRecordValue2(record.recordType, record.previousValue)
                              ] })
                            ] })
                          ]
                        },
                        `${record.recordType}-${record.exerciseId}`
                      )) })
                    ]
                  }
                ),
                outcome.goalProgress.length > 0 && /* @__PURE__ */ jsxs20(
                  "div",
                  {
                    "data-testid": "strength-goal-progress",
                    className: "mt-3 rounded-2xl border border-[#C81E3A]/30 bg-black/40 p-3",
                    children: [
                      /* @__PURE__ */ jsxs20("p", { className: "flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white", children: [
                        /* @__PURE__ */ jsx22(Target3, { className: "h-3.5 w-3.5 text-[#E62846]" }),
                        " GOAL PROGRESS"
                      ] }),
                      /* @__PURE__ */ jsx22("ul", { className: "mt-2 space-y-1", children: outcome.goalProgress.map((goal) => /* @__PURE__ */ jsxs20(
                        "li",
                        {
                          className: "flex items-center justify-between text-[11px] font-mono",
                          children: [
                            /* @__PURE__ */ jsxs20("span", { className: "text-[#8C8C90]", children: [
                              goal.periodType === "monthly" ? "Monthly" : "Weekly",
                              goal.activityType ? ` ${goal.activityType}` : ""
                            ] }),
                            /* @__PURE__ */ jsxs20("span", { className: "text-white", children: [
                              Math.round(goal.progress).toLocaleString(),
                              " /",
                              " ",
                              Math.round(goal.targetValue).toLocaleString()
                            ] })
                          ]
                        },
                        goal.id
                      )) })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs20("div", { className: "mt-4 flex gap-2", children: [
                  /* @__PURE__ */ jsx22(
                    "button",
                    {
                      type: "button",
                      onClick: reset,
                      className: "flex-1 rounded-full border border-white/10 bg-black/40 px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90] hover:text-white",
                      children: "Log another"
                    }
                  ),
                  /* @__PURE__ */ jsx22(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        reset();
                        onExit();
                      },
                      className: "flex-1 rounded-full border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white",
                      children: "Done"
                    }
                  )
                ] })
              ] })
            ]
          }
        )
      ]
    }
  );
};
var Stat = ({ label, value }) => /* @__PURE__ */ jsxs20("div", { className: "rounded-2xl border border-white/5 bg-black/40 p-3", children: [
  /* @__PURE__ */ jsx22("div", { className: "text-[9px] font-mono uppercase text-[#8C8C90]", children: label }),
  /* @__PURE__ */ jsx22("div", { className: "font-mono text-xl font-bold text-white", children: value })
] });
var ExercisePicker = ({ catalog, loading, error, onRetry, onSelect, onClose, onCreated }) => {
  const [query, setQuery] = useState22("");
  const [category, setCategory] = useState22("all");
  const [creating, setCreating] = useState22(false);
  const [customName, setCustomName] = useState22("");
  const [customMuscle, setCustomMuscle] = useState22("chest");
  const [customType, setCustomType] = useState22("weighted_reps");
  const [customError, setCustomError] = useState22(null);
  const [customSaving, setCustomSaving] = useState22(false);
  const filtered = catalog.filter((option) => {
    if (category !== "all" && option.category !== category) return false;
    if (!query.trim()) return true;
    return option.name.toLowerCase().includes(query.trim().toLowerCase());
  });
  const create = async () => {
    setCustomSaving(true);
    setCustomError(null);
    const client = strengthRpcClient();
    if (!client) {
      setCustomSaving(false);
      setCustomError("Backend is not configured.");
      return;
    }
    const result = await createCustomExercise((fn, args) => client.rpc(fn, args), {
      name: customName,
      primaryMuscle: customMuscle,
      exerciseType: customType
    });
    setCustomSaving(false);
    if (result.ok && result.exercise) {
      onCreated(result.exercise);
    } else {
      setCustomError(result.error ?? "Couldn't create the exercise.");
    }
  };
  return /* @__PURE__ */ jsxs20(
    "div",
    {
      className: "mt-3 rounded-2xl border border-white/10 bg-black/60 p-3",
      "data-testid": "strength-exercise-picker",
      children: [
        /* @__PURE__ */ jsxs20("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx22("span", { className: "text-[10px] font-mono uppercase tracking-wider text-white", children: "Add exercise" }),
          /* @__PURE__ */ jsx22("button", { type: "button", onClick: onClose, "aria-label": "Close exercise picker", children: /* @__PURE__ */ jsx22(X3, { className: "h-3.5 w-3.5 text-[#8C8C90]" }) })
        ] }),
        /* @__PURE__ */ jsxs20("div", { className: "mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-[#17171A] px-2", children: [
          /* @__PURE__ */ jsx22(Search2, { className: "h-3.5 w-3.5 text-[#8C8C90]" }),
          /* @__PURE__ */ jsx22(
            "input",
            {
              value: query,
              onChange: (e) => setQuery(e.target.value),
              "aria-label": "Search exercises",
              placeholder: "Search exercises",
              className: "w-full bg-transparent py-2 text-xs font-mono text-white placeholder:text-[#8C8C90]/60 focus:outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsx22("div", { className: "mt-2 flex flex-wrap gap-1.5 pb-1", children: ["all", ...EXERCISE_CATEGORIES].map((id) => /* @__PURE__ */ jsx22(
          "button",
          {
            type: "button",
            onClick: () => setCategory(id),
            className: `max-w-full rounded-lg border px-2 py-1 text-[9px] font-mono uppercase tracking-wider ${category === id ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-white" : "border-white/10 bg-black/40 text-[#8C8C90]"}`,
            children: id === "all" ? "All" : CATEGORY_LABELS[id] ?? id
          },
          id
        )) }),
        loading && /* @__PURE__ */ jsxs20("p", { className: "flex items-center justify-center gap-2 py-4 text-[10px] font-mono uppercase text-[#8C8C90]", children: [
          /* @__PURE__ */ jsx22(Loader210, { className: "h-3 w-3 animate-spin" }),
          " Loading catalog\u2026"
        ] }),
        !loading && error && /* @__PURE__ */ jsxs20("div", { className: "mt-2 rounded-lg border border-crimson/30 bg-crimson/5 p-2.5 text-center", children: [
          /* @__PURE__ */ jsx22("p", { className: "text-[10px] font-mono text-crimson", children: error }),
          /* @__PURE__ */ jsx22(
            "button",
            {
              type: "button",
              onClick: onRetry,
              className: "mt-1.5 rounded-lg border border-crimson/40 bg-crimson/10 px-2.5 py-1 text-[9px] font-mono uppercase text-crimson",
              children: "Retry"
            }
          )
        ] }),
        !loading && !error && /* @__PURE__ */ jsxs20("ul", { className: "mt-2 max-h-56 space-y-1 overflow-y-auto", children: [
          filtered.map((option) => /* @__PURE__ */ jsx22("li", { children: /* @__PURE__ */ jsxs20(
            "button",
            {
              type: "button",
              onClick: () => onSelect(option),
              "data-testid": "strength-exercise-option",
              className: "flex w-full items-center justify-between rounded-lg border border-white/5 bg-black/40 px-2.5 py-2 text-left hover:border-[#C81E3A]/40",
              children: [
                /* @__PURE__ */ jsx22("span", { className: "text-[11px] font-mono text-white", children: option.name }),
                /* @__PURE__ */ jsxs20("span", { className: "flex items-center gap-1.5 font-inter text-[10px] text-[#8C8C90]", children: [
                  MUSCLE_LABELS[option.primaryMuscle],
                  option.isCustom && /* @__PURE__ */ jsx22("span", { className: "rounded-full border border-[#C9A227]/30 bg-[#C9A227]/10 px-1.5 py-0.5 font-inter text-[9px] font-semibold uppercase tracking-[0.1em] text-[#C9A227]", children: "Custom" })
                ] })
              ]
            }
          ) }, option.id)),
          filtered.length === 0 && /* @__PURE__ */ jsx22("li", { className: "py-3 text-center text-[10px] font-mono text-[#8C8C90]", children: "No match. Create a custom exercise below." })
        ] }),
        !creating && /* @__PURE__ */ jsxs20(
          "button",
          {
            type: "button",
            onClick: () => setCreating(true),
            "data-testid": "strength-create-custom",
            className: "mt-2 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#E62846]",
            children: [
              /* @__PURE__ */ jsx22(Plus3, { className: "h-3 w-3" }),
              " Create custom exercise"
            ]
          }
        ),
        creating && /* @__PURE__ */ jsxs20("div", { className: "mt-2 space-y-2 rounded-lg border border-white/10 bg-black/40 p-2.5", children: [
          /* @__PURE__ */ jsx22(
            "input",
            {
              value: customName,
              onChange: (e) => setCustomName(e.target.value),
              maxLength: 60,
              placeholder: "Exercise name",
              className: "w-full rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs font-mono text-white placeholder:text-[#8C8C90]/50"
            }
          ),
          /* @__PURE__ */ jsxs20("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsx22(
              "select",
              {
                value: customMuscle,
                onChange: (e) => setCustomMuscle(e.target.value),
                className: "rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs font-mono text-white",
                children: MUSCLE_GROUPS.map((muscle) => /* @__PURE__ */ jsx22("option", { value: muscle, children: MUSCLE_LABELS[muscle] }, muscle))
              }
            ),
            /* @__PURE__ */ jsx22(
              "select",
              {
                value: customType,
                onChange: (e) => setCustomType(e.target.value),
                className: "rounded-lg border border-white/10 bg-[#17171A] px-2 py-2 text-xs font-mono text-white",
                children: EXERCISE_TYPES.map((type) => /* @__PURE__ */ jsx22("option", { value: type, children: EXERCISE_TYPE_LABELS[type] }, type))
              }
            )
          ] }),
          customError && /* @__PURE__ */ jsx22("p", { role: "alert", className: "text-[10px] font-mono text-crimson", children: customError }),
          /* @__PURE__ */ jsxs20("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxs20(
              "button",
              {
                type: "button",
                onClick: () => void create(),
                disabled: customSaving || customName.trim().length < 2,
                "data-testid": "strength-save-custom",
                className: "flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-white disabled:opacity-40",
                children: [
                  customSaving ? /* @__PURE__ */ jsx22(Loader210, { className: "h-3 w-3 animate-spin" }) : /* @__PURE__ */ jsx22(Check2, { className: "h-3 w-3" }),
                  "Create"
                ]
              }
            ),
            /* @__PURE__ */ jsx22(
              "button",
              {
                type: "button",
                onClick: () => {
                  setCreating(false);
                  setCustomError(null);
                },
                className: "rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]",
                children: "Cancel"
              }
            )
          ] }),
          /* @__PURE__ */ jsx22("p", { className: "text-[9px] font-mono text-[#8C8C90]", children: "Custom exercises belong to your account only and never change the shared catalog." })
        ] })
      ]
    }
  );
};
export {
  ActivityProvider,
  ActivityView,
  TrainStrength,
  useActivity,
  vjAddMeasurementListener,
  vjStartTracking,
  vjStopTracking
};
