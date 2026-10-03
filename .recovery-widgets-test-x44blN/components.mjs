// src/app/components/RecoveryView.tsx
import { useCallback as useCallback5, useRef as useRef2, useState as useState11 } from "react";
import { HeartPulse as HeartPulse4 } from "lucide-react";

// src/app/views/TrainRecovery.tsx
import { useCallback, useEffect as useEffect2, useMemo, useState as useState2 } from "react";
import { HeartPulse, Loader2, Moon, RefreshCw } from "lucide-react";

// mock:recovery
var getMyReadiness = async () => globalThis.__svjP3.readiness;
var saveMyRecoveryCheckin = async (i) => {
  if (globalThis.__svjP3.saveFails) return { ok: false, error: "Save failed" };
  globalThis.__svjP3.savedCheckins.push(i);
  return { ok: true, readiness: globalThis.__svjP3.readiness.readiness };
};
var listMyRecoveryHistory = async () => globalThis.__svjP3.history;
var listMyRecoveryRecords = async () => ({ ok: true, records: [] });

// mock:context
var useSVJ = () => ({ taskCompletions: globalThis.__svjP3.taskCompletions ?? [] });

// mock:storage
var readStoredJson = (k, f) => globalThis.__svjP3.localHistory ?? f;
var writeStoredJson = (k, v) => {
  globalThis.__svjP3.localHistory = v;
};

// src/app/lib/taskCompletions.ts
function localDayKey(date = /* @__PURE__ */ new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
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
function formatGoalProgress(metric, progress) {
  if (metric === "distance")
    return `${(progress / 1e3).toLocaleString(void 0, { maximumFractionDigits: 1 })} km`;
  return Math.round(progress).toLocaleString();
}
function unwrap(envelope, key, normalize) {
  if (!envelope || typeof envelope !== "object" || envelope.ok !== true)
    return { ok: false, error: "The server returned an unreadable response." };
  const raw = envelope[key];
  if (!Array.isArray(raw)) return { ok: false, error: "The server returned an unreadable list." };
  const items = raw.map(normalize).filter((x) => x !== null);
  return { ok: true, items };
}
async function listGoals(callRpc2, includeCompleted = true) {
  try {
    const { data, error } = await callRpc2("svj_list_goals", {
      p_include_completed: includeCompleted
    });
    if (error) return { ok: false, goals: [], error: error.message || "Couldn't load goals." };
    const result = unwrap(data, "goals", normalizeGoal);
    return result.ok ? { ok: true, goals: result.items } : { ok: false, goals: [], error: result.error };
  } catch (e) {
    return { ok: false, goals: [], error: e instanceof Error ? e.message : "Network error." };
  }
}
async function createGoal(callRpc2, input) {
  const invalid = validateGoalInput(input);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { data, error } = await callRpc2("svj_create_goal", {
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
async function updateGoal(callRpc2, goalId, targetValue) {
  const target = num(targetValue);
  if (!goalId || target === null || target <= 0)
    return { ok: false, error: "Invalid goal update." };
  try {
    const { data, error } = await callRpc2("svj_update_goal", {
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
async function cancelGoal(callRpc2, goalId) {
  if (!goalId) return { ok: false, error: "Invalid goal." };
  try {
    const { error } = await callRpc2("svj_cancel_goal", { p_goal_id: goalId });
    if (error) return { ok: false, error: error.message || "Couldn't cancel the goal." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

// src/app/lib/trainingProfile.ts
var EXPERIENCE_LEVELS = ["beginner", "intermediate", "veteran"];
var TRAINING_GOALS = ["muscle", "athletic", "strength", "general"];
var EQUIPMENT_OPTIONS = ["full_gym", "dumbbells", "bands", "bodyweight"];
var LOAD_CONVENTIONS = [
  "barbell_total",
  "dumbbell_per_hand",
  "machine_stack",
  "assisted",
  "cable",
  "bodyweight_added"
];
var TRAINING_PROFILE_VERSION = 2;
var isWeekday = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;
function emptyTrainingProfile() {
  return {
    version: TRAINING_PROFILE_VERSION,
    setupComplete: false,
    experience: "beginner",
    goal: "general",
    secondaryGoal: null,
    availableDays: [1, 3, 5],
    sessionsPerWeek: 3,
    sessionMinutes: 45,
    equipment: ["full_gym"],
    avoidMovements: [],
    familiarMovements: [],
    prefersMachines: false,
    units: "kg",
    loadConvention: "barbell_total",
    athlete: { sport: "", practiceDays: [], competitionDates: [], inSeason: false },
    updatedAt: ""
  };
}
var clampInt = (value, min, max, fallback) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
};
function normalizeTrainingProfile(raw) {
  const base = emptyTrainingProfile();
  if (!raw || typeof raw !== "object") return base;
  const r = raw;
  const experience = EXPERIENCE_LEVELS.includes(r.experience) ? r.experience : base.experience;
  const goal = TRAINING_GOALS.includes(r.goal) ? r.goal : base.goal;
  const secondaryGoal = r.secondaryGoal && TRAINING_GOALS.includes(r.secondaryGoal) ? r.secondaryGoal : null;
  const availableDays = Array.isArray(r.availableDays) ? [...new Set(r.availableDays.filter(isWeekday))].sort((a, b) => a - b).slice(0, 7) : base.availableDays;
  const days = availableDays.length > 0 ? availableDays : base.availableDays;
  const equipment = Array.isArray(r.equipment) ? [
    ...new Set(
      r.equipment.filter(
        (e) => EQUIPMENT_OPTIONS.includes(e)
      )
    )
  ] : base.equipment;
  const safeEquipment = equipment.length > 0 ? equipment : base.equipment;
  const loadConvention = LOAD_CONVENTIONS.includes(
    r.loadConvention
  ) ? r.loadConvention : base.loadConvention;
  const athleteRaw = r.athlete && typeof r.athlete === "object" ? r.athlete : {};
  const practiceDays = Array.isArray(athleteRaw.practiceDays) ? [...new Set(athleteRaw.practiceDays.filter(isWeekday))].sort((a, b) => a - b) : [];
  const competitionDates = Array.isArray(athleteRaw.competitionDates) ? athleteRaw.competitionDates.filter(
    (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
  ).slice(0, 20) : [];
  const cleanStrings = (value) => Array.isArray(value) ? value.filter((s) => typeof s === "string").map((s) => s.trim()).filter(Boolean).slice(0, 50) : [];
  return {
    version: TRAINING_PROFILE_VERSION,
    setupComplete: r.setupComplete === true,
    experience,
    goal,
    secondaryGoal: secondaryGoal && secondaryGoal !== goal ? secondaryGoal : null,
    availableDays: days,
    sessionsPerWeek: clampInt(r.sessionsPerWeek, 1, 6, Math.min(days.length || 3, 6)),
    sessionMinutes: clampInt(r.sessionMinutes, 20, 150, base.sessionMinutes),
    equipment: safeEquipment,
    avoidMovements: cleanStrings(r.avoidMovements),
    familiarMovements: cleanStrings(r.familiarMovements),
    prefersMachines: r.prefersMachines === true,
    units: r.units === "lb" ? "lb" : "kg",
    loadConvention,
    athlete: {
      sport: typeof athleteRaw.sport === "string" ? athleteRaw.sport.trim().slice(0, 40) : "",
      practiceDays,
      competitionDates,
      inSeason: athleteRaw.inSeason === true
    },
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : ""
  };
}

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

// src/app/lib/recoveryInsights.ts
var RECOVERY_METRICS = RECOVERY_GOAL_METRICS;
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
function formatClock(hoursFromMidnight) {
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
    bedtimeFrom: formatClock(wake - maxHours),
    bedtimeTo: formatClock(wake - minHours),
    loadAdjustmentMinutes,
    personalised,
    note: personalised ? `Based on your own logged sleep. Load adjustment: +${loadAdjustmentMinutes} min.` : "Log a few more nights to personalise this from your own sleep history."
  };
}
function recoveryCheckinStreak(serverDays, now = /* @__PURE__ */ new Date()) {
  const checkedDays = new Set(
    serverDays.filter((day) => !!day && typeof day.date === "string" && day.hasCheckin === true).map((day) => day.date)
  );
  if (checkedDays.size === 0) return 0;
  const cursor = new Date(now);
  while (!checkedDays.has(localDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (checkedDays.size === 0) return 0;
  }
  let streak = 0;
  while (checkedDays.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
var goalLabel = (trainingGoal) => ({
  muscle: "building muscle",
  athletic: "athletic performance",
  strength: "strength progress",
  general: "general fitness"
})[trainingGoal ?? "general"] ?? "general fitness";
function readinessEmphasis(readiness) {
  const band = readiness.band;
  const restDays = readiness.components.restDaysLast3;
  const score = readiness.score;
  if (score < 40 || band === "very_high" && restDays === 0) return "rest";
  if (score < 60 || band === "high" && restDays === 0) return "lighter";
  if (score >= 78 && (band === "low" || typeof restDays === "number" && restDays > 0)) {
    return "stronger";
  }
  return "normal";
}
function todaysFocus(input) {
  const { readiness, trainingGoal, activityGoal } = input;
  const band = readiness.band;
  const goal = goalLabel(trainingGoal);
  const score = readiness.score;
  const goalClause = trainingGoal && trainingGoal !== "general" ? ` while keeping your ${goal} goal on track` : "";
  const emphasis = readinessEmphasis(readiness);
  let headline;
  let detail;
  if (emphasis === "rest") {
    headline = "Prioritise recovery today";
    detail = `Readiness is ${score} with a ${band === "very_high" ? "very high" : "low"} training load$?
      goalClause
    }. Rest or keep movement very light so your body can catch up.`;
  } else if (emphasis === "lighter") {
    headline = "Keep it light today";
    detail = `Readiness is ${score} \u2014 a lighter session is the right call${goalClause}.`;
  } else if (emphasis === "stronger") {
    headline = "Green light for a strong session";
    detail = readiness.components.activityLoadPoints === 0 && readiness.components.taskLoadPoints === 0 ? `Readiness is ${score} and your week is light \u2014 a solid session would land well${goalClause}.` : `Readiness is ${score} with a ${band} load \u2014 a strong session fits${goalClause}.`;
  } else {
    headline = "Train normally today";
    detail = `Readiness is ${score} on a ${band} load \u2014 train normally${goalClause}.`;
  }
  if (activityGoal && activityGoal.targetValue > 0) {
    const metric = activityGoal.metric === "workout_count" ? "workout" : activityGoal.metric === "step_total" ? "step" : activityGoal.metric === "distance" ? "distance" : "active-minute";
    const percent = Math.min(
      99,
      Math.round(activityGoal.progress / activityGoal.targetValue * 100)
    );
    detail += ` You are ${percent}% into your weekly ${metric} goal.`;
  }
  return { emphasis, headline, detail };
}
function applicableActivityGoals(goals, now = /* @__PURE__ */ new Date()) {
  const today = localDayKey(now);
  for (const goal of goals) {
    if (goal.status !== "active") continue;
    if (RECOVERY_METRICS.includes(goal.metric ?? "")) continue;
    if (!goal.periodStart || !goal.periodEnd) continue;
    if (goal.periodStart > today || goal.periodEnd < today) continue;
    if (typeof goal.targetValue !== "number" || goal.targetValue <= 0) continue;
    return {
      metric: typeof goal.metric === "string" ? goal.metric : "workout_count",
      progress: Math.max(0, Number(goal.progress) || 0),
      targetValue: goal.targetValue
    };
  }
  return null;
}
var MUSCLE_RECOVERY_STATES = {
  fresh: "Fresh",
  moderate: "Moderate",
  high: "High",
  no_recent_data: "No recent data"
};
var muscleRecoveryStateLabel = (state) => MUSCLE_RECOVERY_STATES[state];
function estimateMuscleRecovery(rows, now = /* @__PURE__ */ new Date()) {
  const byMuscle = new Map(rows.map((row) => [row.muscle, row]));
  const entries = MUSCLE_GROUPS.map((muscle) => {
    const row = byMuscle.get(muscle);
    const label = MUSCLE_LABELS[muscle] ?? muscle;
    if (!row || row.lastTrainedDate === null || row.directSets === 0 && row.supportingSets === 0) {
      return {
        muscle,
        label,
        state: "no_recent_data",
        reason: "No logged training in the last 7 days."
      };
    }
    const [y, m, d] = row.lastTrainedDate.split("-").map(Number);
    const then = new Date(y, (m ?? 1) - 1, d ?? 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.floor((today.getTime() - then.getTime()) / 864e5);
    const direct = row.directSets;
    const supporting = row.supportingSets;
    const volume = Math.round(Number(row.directVolume) || 0);
    let state;
    if (days <= 1) state = "high";
    else if (days <= 3) state = "moderate";
    else state = "fresh";
    const daysLabel = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    const work = direct > 0 && supporting > 0 ? `${direct} direct + ${supporting} supporting sets` : direct > 0 ? `${direct} direct sets` : `${supporting} supporting sets`;
    const reason = `Last trained ${daysLabel} \u2014 ${work}${volume > 0 ? `, ${volume.toLocaleString()} kg volume` : ""}.`;
    return { muscle, label, state, reason };
  });
  return {
    entries,
    hasAnyData: entries.some((entry) => entry.state !== "no_recent_data")
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
function buildRecoveryHeatmap(serverDays, days = 35) {
  const byDate = /* @__PURE__ */ new Map();
  let newest = null;
  for (const row of serverDays) {
    if (typeof row.date !== "string" || row.date === "") continue;
    byDate.set(row.date, row);
    if (newest === null || row.date > newest) newest = row.date;
  }
  if (newest === null) return [];
  const cells = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = /* @__PURE__ */ new Date(`${newest}T12:00:00`);
    day.setDate(day.getDate() - offset);
    const key = localDayKey(day);
    const row = byDate.get(key);
    if (!row) {
      cells.push({
        date: key,
        state: "no_data",
        score: null,
        grade: null,
        band: null,
        hasCheckin: false,
        sleepHours: null
      });
      continue;
    }
    const score = typeof row.score === "number" && Number.isFinite(row.score) ? row.score : 0;
    cells.push({
      date: key,
      state: "scored",
      score,
      grade: gradeForScore(score),
      band: ["low", "moderate", "high", "very_high"].includes(row.trainingLoad) ? row.trainingLoad : "moderate",
      hasCheckin: row.hasCheckin === true,
      sleepHours: typeof row.sleepHours === "number" ? row.sleepHours : null
    });
  }
  return cells;
}
function heatCellDateLabel(date) {
  return (/* @__PURE__ */ new Date(`${date}T12:00:00`)).toLocaleDateString(void 0, {
    month: "long",
    day: "numeric"
  });
}
function heatCellBandLabel(grade) {
  if (!grade || grade === "unknown") return "no data";
  return grade;
}
var SLEEP_CORRELATION_MIN_SAMPLES = 5;
var SLEEP_CORRELATION_WEAK_THRESHOLD = 0.3;
function correlateSleepReadiness(serverDays) {
  const pairs = [];
  for (const row of serverDays) {
    const sleep = row.sleepHours;
    const score = row.score;
    if (typeof sleep !== "number" || !Number.isFinite(sleep) || sleep <= 0) continue;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0) continue;
    pairs.push({ sleep, score });
  }
  const insufficient = (samples) => ({
    strength: "insufficient_data",
    samples,
    r: null,
    summary: samples === 0 ? "No paired sleep and readiness days yet \u2014 save a check-in with your sleep hours to build this view." : `Not enough paired sleep and readiness days yet (${samples} of ${SLEEP_CORRELATION_MIN_SAMPLES} needed) \u2014 keep logging your check-ins.`
  });
  if (pairs.length < SLEEP_CORRELATION_MIN_SAMPLES) return insufficient(pairs.length);
  const n = pairs.length;
  const meanSleep = pairs.reduce((s, p) => s + p.sleep, 0) / n;
  const meanScore = pairs.reduce((s, p) => s + p.score, 0) / n;
  let cov = 0;
  let varSleep = 0;
  let varScore = 0;
  for (const p of pairs) {
    const ds = p.sleep - meanSleep;
    const dq = p.score - meanScore;
    cov += ds * dq;
    varSleep += ds * ds;
    varScore += dq * dq;
  }
  const denominator = Math.sqrt(varSleep * varScore);
  if (denominator <= 0 || !Number.isFinite(denominator) || !Number.isFinite(cov)) {
    return {
      strength: "no_clear_relationship",
      samples: n,
      r: null,
      summary: "Your logged nights are too similar (or too flat) to show a relationship with readiness yet."
    };
  }
  const r = cov / denominator;
  const clamped = Math.max(-1, Math.min(1, r));
  if (!Number.isFinite(clamped) || Math.abs(clamped) <= SLEEP_CORRELATION_WEAK_THRESHOLD) {
    return {
      strength: "no_clear_relationship",
      samples: n,
      r: Number.isFinite(clamped) ? clamped : null,
      summary: "Your recent data does not show a clear relationship between sleep and readiness yet."
    };
  }
  return clamped > 0 ? {
    strength: "higher_sleep_higher_readiness",
    samples: n,
    r: clamped,
    summary: "On days after longer reported sleep, your readiness scores have tended to be higher."
  } : {
    strength: "higher_sleep_lower_readiness",
    samples: n,
    r: clamped,
    summary: "On days after longer reported sleep, your readiness scores have tended to be lower."
  };
}
var VALID_LOAD_BANDS = ["low", "moderate", "high", "very_high"];
var WEEKLY_DIGEST_DAYS = 7;
var READINESS_TREND_MIN_DAYS = 4;
var READINESS_TREND_STABLE_BAND = 3;
var DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
function canonicalWindow(serverDays, days) {
  if (!Array.isArray(serverDays)) return [];
  return serverDays.filter((row) => !!row && typeof row.date === "string" && DAY_KEY.test(row.date)).slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-Math.max(1, days));
}
function daySpanInclusive(start, end) {
  const parts = (iso) => iso.split("-").map(Number);
  const [sy, sm, sd] = parts(start);
  const [ey, em, ed] = parts(end);
  const from = Date.UTC(sy, sm - 1, sd);
  const to = Date.UTC(ey, em - 1, ed);
  const span = Math.round((to - from) / 864e5) + 1;
  return Number.isFinite(span) && span > 0 ? span : 1;
}
function readinessTrendDirection(serverDays, days = WEEKLY_DIGEST_DAYS) {
  const scores = canonicalWindow(serverDays, days).map((row) => row.score).filter((score) => typeof score === "number" && Number.isFinite(score));
  if (scores.length < READINESS_TREND_MIN_DAYS) {
    return {
      direction: "insufficient_data",
      samples: scores.length,
      earlierAvg: null,
      recentAvg: null,
      delta: null
    };
  }
  const half = Math.floor(scores.length / 2);
  const earlier = scores.slice(0, half);
  const recent = scores.slice(half);
  const earlierAvg = earlier.reduce((sum, s) => sum + s, 0) / earlier.length;
  const recentAvg = recent.reduce((sum, s) => sum + s, 0) / recent.length;
  const delta = recentAvg - earlierAvg;
  const direction = delta > READINESS_TREND_STABLE_BAND ? "improving" : delta < -READINESS_TREND_STABLE_BAND ? "declining" : "stable";
  return {
    direction,
    samples: scores.length,
    earlierAvg: Math.round(earlierAvg),
    recentAvg: Math.round(recentAvg),
    delta: Math.round(delta * 10) / 10
  };
}
var EMPTY_TREND = {
  direction: "insufficient_data",
  samples: 0,
  earlierAvg: null,
  recentAvg: null,
  delta: null
};
function buildWeeklyRecoveryDigest(serverDays, days = WEEKLY_DIGEST_DAYS) {
  const window2 = canonicalWindow(serverDays, days);
  if (window2.length === 0) {
    return {
      state: "insufficient",
      windowDays: 0,
      windowStart: null,
      windowEnd: null,
      readinessDays: 0,
      averageReadiness: null,
      trend: EMPTY_TREND,
      checkinDays: 0,
      sleepDays: 0,
      restDaysLast3: null,
      loadBand: null
    };
  }
  const scores = window2.map((row) => row.score).filter((score) => typeof score === "number" && Number.isFinite(score));
  const readinessDays = scores.length;
  const averageReadiness = readinessDays ? Math.round(scores.reduce((sum, s) => sum + s, 0) / readinessDays) : null;
  const checkinDays = window2.filter((row) => row.hasCheckin === true).length;
  const sleepDays = window2.filter(
    (row) => typeof row.sleepHours === "number" && Number.isFinite(row.sleepHours) && row.sleepHours > 0
  ).length;
  const newest = window2[window2.length - 1];
  const restDaysLast3 = typeof newest.restDaysLast3 === "number" && Number.isFinite(newest.restDaysLast3) ? Math.max(0, Math.round(newest.restDaysLast3)) : null;
  const declaredBand = String(newest.trainingLoad ?? "");
  const loadBand = VALID_LOAD_BANDS.includes(declaredBand) ? declaredBand : null;
  const state = readinessDays === 0 ? "insufficient" : readinessDays >= days ? "complete" : "partial";
  return {
    state,
    windowDays: daySpanInclusive(window2[0].date, newest.date),
    windowStart: window2[0].date,
    windowEnd: newest.date,
    readinessDays,
    averageReadiness,
    trend: readinessTrendDirection(window2, days),
    checkinDays,
    sleepDays,
    restDaysLast3,
    loadBand
  };
}
function digestTrendSentence(trend) {
  switch (trend.direction) {
    case "improving":
      return "Your readiness has been trending upward across the last few recorded days.";
    case "declining":
      return "Your readiness has been trending downward across the last few recorded days.";
    case "stable":
      return "Your readiness has been holding steady across the last few recorded days.";
    case "insufficient_data":
      return "There are not enough recorded days this week to call a trend yet.";
  }
}
function restDayAlert(readiness) {
  if (readinessEmphasis(readiness) !== "rest") {
    return { active: false, headline: "", evidence: [], suggestion: "" };
  }
  const score = readiness.score;
  const band = readiness.band;
  const restDays = readiness.components.restDaysLast3;
  const evidence = [`Readiness is ${score} today.`];
  if (band === "high" || band === "very_high") {
    evidence.push(
      `Your recent training load is ${band === "very_high" ? "very high" : "high"} relative to your recovery.`
    );
  }
  if (restDays === 0) {
    evidence.push("You have not recorded a rest day in the last 3 days.");
  }
  return {
    active: true,
    headline: "Take a recovery-focused day",
    evidence,
    suggestion: "Prioritise sleep, hydration, mobility and low-intensity movement."
  };
}

// src/app/lib/readinessShared.ts
import { createContext, useContext } from "react";
var ReadinessHistoryContext = createContext(null);
function useTrainRecoveryShared() {
  return useContext(ReadinessHistoryContext);
}
function useTrainRecoveryPublisher() {
  const context = useContext(ReadinessHistoryContext);
  return context?.publish ?? null;
}

// src/app/components/ui-primitives/SVJScoreRing.tsx
import { useEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
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
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setDrawn(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const numeral = hasData ? display ?? String(Math.round(value)) : "\u2014";
  return /* @__PURE__ */ jsxs("div", { className: `flex flex-col items-center ${className}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "relative", style: { width: size, height: size }, children: [
      /* @__PURE__ */ jsxs(
        "svg",
        {
          width: size,
          height: size,
          viewBox: `0 0 ${size} ${size}`,
          role: "img",
          "aria-label": hasData ? `${label}: ${numeral} out of ${safeMax}` : `${label}: no data recorded yet`,
          className: "-rotate-90",
          children: [
            /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("linearGradient", { id: `svj-ring-${tone}`, x1: "0", y1: "0", x2: "1", y2: "1", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: color, stopOpacity: "0.55" }),
              /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: color, stopOpacity: "1" })
            ] }) }),
            /* @__PURE__ */ jsx(
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
            /* @__PURE__ */ jsx(
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
            hasData ? /* @__PURE__ */ jsx(
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
            ) : /* @__PURE__ */ jsx(
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
      /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center", children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            className: "font-anton leading-none tracking-tight text-[#F4F2ED]",
            style: { fontSize: Math.round(size * 0.26) },
            children: numeral
          }
        ),
        /* @__PURE__ */ jsx("span", { className: "mt-1 max-w-[80%] text-center text-[10px] font-inter font-semibold uppercase tracking-[0.14em] text-[#8C8C90]", children: label })
      ] })
    ] }),
    sublabel && /* @__PURE__ */ jsx("p", { className: "mt-2 max-w-[220px] text-center text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: sublabel })
  ] });
};

// src/app/views/TrainRecovery.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var LOAD_LABELS = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very High"
};
var SCORE_COLOR = (score) => score >= 78 ? "#34d399" : score >= 60 ? "#eab308" : score >= 40 ? "#fb923c" : "#f87171";
var ScaleInput = ({ label, value, onChange, low, high, testId }) => /* @__PURE__ */ jsxs2("div", { className: "rounded-2xl border border-white/5 bg-black/40 p-3", "data-testid": testId, children: [
  /* @__PURE__ */ jsxs2("div", { className: "mb-1 flex items-center justify-between", children: [
    /* @__PURE__ */ jsx2("span", { className: "text-[10px] font-mono font-bold uppercase tracking-widest text-white", children: label }),
    value !== null && /* @__PURE__ */ jsx2(
      "button",
      {
        type: "button",
        onClick: () => onChange(null),
        className: "text-[9px] font-mono text-[#8C8C90] hover:text-white",
        children: "clear"
      }
    )
  ] }),
  /* @__PURE__ */ jsx2("div", { className: "flex justify-between gap-1.5", children: [1, 2, 3, 4, 5].map((n) => /* @__PURE__ */ jsx2(
    "button",
    {
      type: "button",
      onClick: () => onChange(n),
      className: `h-8 flex-1 rounded-lg border text-xs font-mono font-bold transition-colors ${value === n ? "border-[#C81E3A]/60 bg-[#C81E3A]/25 text-white" : "border-white/10 bg-black/40 text-[#8C8C90] hover:text-white"}`,
      children: n
    },
    n
  )) }),
  /* @__PURE__ */ jsxs2("div", { className: "mt-1 flex justify-between text-[8px] font-mono uppercase text-[#8C8C90]", children: [
    /* @__PURE__ */ jsx2("span", { children: low }),
    /* @__PURE__ */ jsx2("span", { children: high })
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
  const { taskCompletions } = useSVJ();
  const [readiness, setReadiness] = useState2(null);
  const [history, setHistory] = useState2([]);
  const [dayHistory, setDayHistory] = useState2(
    () => normalizeHistory(readStoredJson(RECOVERY_HISTORY_STORAGE_KEY, []))
  );
  const [loading, setLoading] = useState2(true);
  const [saving, setSaving] = useState2(false);
  const [error, setError] = useState2(null);
  const [historyError, setHistoryError] = useState2(false);
  const [saved, setSaved] = useState2(false);
  const [sleepHours, setSleepHours] = useState2("");
  const [soreness, setSoreness] = useState2(null);
  const [energy, setEnergy] = useState2(null);
  const [perceived, setPerceived] = useState2(null);
  const checkinValues = useMemo(() => {
    const hours = sleepHours.trim() === "" ? null : Number(sleepHours);
    return {
      sleepHours: hours !== null && Number.isFinite(hours) ? hours : null,
      soreness,
      energy,
      perceivedRecovery: perceived
    };
  }, [sleepHours, soreness, energy, perceived]);
  const today = useMemo(
    () => combine(readiness, taskCompletions, checkinValues),
    [readiness, taskCompletions, checkinValues]
  );
  const persistToday = useCallback((record) => {
    setDayHistory((previous) => {
      const next = upsertDayRecord(previous, record);
      writeStoredJson(RECOVERY_HISTORY_STORAGE_KEY, next);
      return next;
    });
  }, []);
  const load = useCallback(async () => {
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
  useEffect2(() => {
    void load();
  }, [load]);
  useEffect2(() => {
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
  const sleep = useMemo(() => bestSleepRange(dayHistory), [dayHistory]);
  const window2 = useMemo(() => recomputeSleepWindow(sleep, today.band), [sleep, today.band]);
  const trend = useMemo(() => readinessTrend(dayHistory, 7), [dayHistory]);
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
  const publish = useTrainRecoveryPublisher();
  useEffect2(() => {
    if (!publish) return;
    publish({ dayHistory, historyPoints: history, today });
  }, [publish, dayHistory, history, today]);
  return /* @__PURE__ */ jsxs2(
    "div",
    {
      className: "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-5",
      "data-testid": "train-recovery",
      children: [
        /* @__PURE__ */ jsxs2("div", { className: "mb-3 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx2(HeartPulse, { className: "h-4 w-4 text-rose-400" }),
            /* @__PURE__ */ jsx2("span", { className: "text-xs font-mono font-bold uppercase tracking-widest text-white", children: "Recovery" })
          ] }),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              "aria-label": "Refresh recovery",
              className: "rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white",
              children: /* @__PURE__ */ jsx2(RefreshCw, { className: "h-3.5 w-3.5" })
            }
          )
        ] }),
        loading && /* @__PURE__ */ jsxs2("p", { className: "flex items-center justify-center gap-2 py-6 text-[11px] font-mono uppercase text-[#8C8C90]", children: [
          /* @__PURE__ */ jsx2(Loader2, { className: "h-3 w-3 animate-spin" }),
          " Loading readiness\u2026"
        ] }),
        error && /* @__PURE__ */ jsxs2("div", { className: "mb-3 rounded-2xl border border-crimson/30 bg-crimson/5 p-3 text-center", children: [
          /* @__PURE__ */ jsx2("p", { className: "mb-2 text-[11px] font-mono text-crimson", children: error }),
          /* @__PURE__ */ jsx2(
            "button",
            {
              type: "button",
              onClick: () => void load(),
              className: "rounded-lg border border-crimson/40 bg-crimson/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-crimson",
              children: "Retry"
            }
          )
        ] }),
        !loading && readiness && /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsxs2("div", { className: "mb-4 flex items-center gap-4 rounded-2xl border border-white/5 bg-black/40 p-4", children: [
            /* @__PURE__ */ jsx2(
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
            /* @__PURE__ */ jsxs2("div", { className: "min-w-0 flex-1 space-y-1.5", children: [
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Readiness" }),
                /* @__PURE__ */ jsxs2(
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
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Training Load" }),
                /* @__PURE__ */ jsx2("p", { className: "text-sm font-mono font-bold text-white", children: LOAD_LABELS[today.band] ?? today.band }),
                /* @__PURE__ */ jsxs2("p", { className: "text-[10px] font-inter text-[#8C8C90]", children: [
                  Math.round(today.components.totalLoadPoints),
                  " load points over the last 7 days"
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Recovery" }),
                /* @__PURE__ */ jsxs2("p", { className: "text-sm font-mono font-bold capitalize text-white", children: [
                  today.recovery === "unknown" ? "No check-in yet" : today.recovery,
                  today.recovery !== "unknown" && /* @__PURE__ */ jsx2("span", { className: "ml-1.5 text-[9px] uppercase text-[#8C8C90]", children: "your check-in" })
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2(
            "div",
            {
              className: "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3",
              "data-testid": "recovery-load-breakdown",
              children: [
                /* @__PURE__ */ jsxs2("div", { className: "rounded-xl border border-white/5 bg-black/40 p-3", children: [
                  /* @__PURE__ */ jsx2("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Recorded activity" }),
                  /* @__PURE__ */ jsxs2("p", { className: "font-mono text-lg font-bold text-white", children: [
                    Math.round(today.components.activityLoadPoints),
                    /* @__PURE__ */ jsx2("span", { className: "ml-1 text-[9px] uppercase text-[#8C8C90]", children: "pts / 7d" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs2(
                  "div",
                  {
                    className: "rounded-xl border border-white/5 bg-black/40 p-3",
                    "data-testid": "recovery-completed-tasks",
                    children: [
                      /* @__PURE__ */ jsx2("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Completed tasks" }),
                      /* @__PURE__ */ jsxs2("p", { className: "font-mono text-lg font-bold text-white", children: [
                        today.components.taskCount,
                        /* @__PURE__ */ jsx2("span", { className: "ml-1 text-[9px] uppercase text-[#8C8C90]", children: "tasks / 7d" })
                      ] })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs2(
                  "div",
                  {
                    className: "rounded-xl border border-white/5 bg-black/40 p-3",
                    "data-testid": "recovery-task-load",
                    children: [
                      /* @__PURE__ */ jsx2("p", { className: "text-[9px] font-mono uppercase tracking-widest text-[#8C8C90]", children: "Task load" }),
                      /* @__PURE__ */ jsxs2("p", { className: "font-mono text-lg font-bold text-white", children: [
                        Math.round(today.components.taskLoadPoints),
                        /* @__PURE__ */ jsx2("span", { className: "ml-1 text-[9px] uppercase text-[#8C8C90]", children: "pts / 7d" })
                      ] })
                    ]
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsxs2("p", { className: "mb-3 rounded-2xl border border-[#C81E3A]/25 bg-[#C81E3A]/10 px-3 py-2 text-xs font-mono text-white", children: [
            /* @__PURE__ */ jsx2("span", { className: "mr-1.5 font-bold uppercase text-[#C81E3A]", children: "Today" }),
            today.advice
          ] }),
          today.isLow && /* @__PURE__ */ jsxs2(
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
          /* @__PURE__ */ jsxs2("div", { className: "mb-3 rounded-2xl border border-white/5 bg-black/30 p-3", children: [
            /* @__PURE__ */ jsxs2("p", { className: "mb-2.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]", children: [
              "Daily check-in ",
              /* @__PURE__ */ jsx2("span", { className: "normal-case text-[#8C8C90]/70", children: "\u2014 30 seconds" })
            ] }),
            /* @__PURE__ */ jsxs2(
              "label",
              {
                className: "mb-2.5 block rounded-2xl border border-white/5 bg-black/40 p-3",
                "data-testid": "recovery-sleep",
                children: [
                  /* @__PURE__ */ jsx2("span", { className: "mb-1.5 block text-[10px] font-mono font-bold uppercase tracking-widest text-white", children: "Sleep (hours)" }),
                  /* @__PURE__ */ jsx2(
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
            /* @__PURE__ */ jsxs2("div", { className: "mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3", children: [
              /* @__PURE__ */ jsx2(
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
              /* @__PURE__ */ jsx2(
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
              /* @__PURE__ */ jsx2(
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
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                onClick: () => void submit(),
                disabled: saving,
                className: "mt-1 w-full rounded-xl border border-[#C81E3A]/60 bg-[#C81E3A]/15 px-4 py-2.5 text-xs font-mono font-bold tracking-widest text-white transition-colors hover:bg-[#C81E3A]/30 disabled:opacity-50",
                children: saving ? "SAVING\u2026" : "SAVE CHECK-IN"
              }
            ),
            saved && /* @__PURE__ */ jsx2(
              "p",
              {
                role: "status",
                className: "mt-2 text-center text-[10px] font-mono uppercase text-emerald-400",
                children: "Check-in saved \u2014 readiness updated"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs2(
            "div",
            {
              className: "mb-3 rounded-2xl border border-white/5 bg-black/30 p-3",
              "data-testid": "recovery-sleep-window",
              children: [
                /* @__PURE__ */ jsxs2("p", { className: "mb-1.5 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-[#8C8C90]", children: [
                  /* @__PURE__ */ jsx2(Moon, { className: "h-3 w-3 text-gold" }),
                  " Tonight's sleep window"
                ] }),
                /* @__PURE__ */ jsxs2("p", { className: "font-mono text-xl font-semibold tracking-tight text-white", children: [
                  window2.minHours,
                  "\u2013",
                  window2.maxHours,
                  " h"
                ] }),
                /* @__PURE__ */ jsxs2("p", { className: "mt-0.5 text-xs font-mono text-[#8C8C90]", children: [
                  "In bed ",
                  window2.bedtimeFrom,
                  "\u2013",
                  window2.bedtimeTo,
                  " ",
                  /* @__PURE__ */ jsxs2("span", { className: "text-[#8C8C90]/70", children: [
                    "(assuming a ",
                    String(DEFAULT_WAKE_HOUR).padStart(2, "0"),
                    ":00 wake-up)"
                  ] })
                ] }),
                window2.loadAdjustmentMinutes > 0 && /* @__PURE__ */ jsxs2("p", { className: "mt-1 text-[10px] font-mono uppercase text-gold", children: [
                  "+",
                  window2.loadAdjustmentMinutes,
                  " min added for a ",
                  LOAD_LABELS[today.band],
                  " load day"
                ] }),
                /* @__PURE__ */ jsx2("p", { className: "mt-1 text-[10px] font-mono text-[#8C8C90]", children: window2.note })
              ]
            }
          ),
          /* @__PURE__ */ jsxs2(
            "div",
            {
              className: "mb-3 rounded-xl border-l-2 border-l-emerald-400/50 bg-white/[0.02] px-3.5 py-3",
              "data-testid": "recovery-best-sleep",
              children: [
                /* @__PURE__ */ jsx2("p", { className: "mb-1.5 text-[11px] font-inter font-semibold text-[#F4F2ED]", children: "Your best sleep window" }),
                sleep.insufficientData ? /* @__PURE__ */ jsxs2("p", { className: "text-[11px] font-mono text-[#8C8C90]", children: [
                  "Not enough history yet (",
                  sleep.pairedDays,
                  " of 3 logged nights compared). Keep checking in and this becomes your own number \u2014 never a generic one."
                ] }) : /* @__PURE__ */ jsxs2(Fragment, { children: [
                  /* @__PURE__ */ jsx2("p", { className: "font-anton text-xl tracking-wide text-emerald-400", children: sleep.bestRangeLabel }),
                  /* @__PURE__ */ jsxs2("p", { className: "mt-0.5 text-xs font-inter text-[#8C8C90]", children: [
                    "Best next-day energy (",
                    sleep.best?.avgNextEnergy?.toFixed(1) ?? "\u2014",
                    "/5) across your last ",
                    sleep.pairedDays,
                    " logged nights."
                  ] }),
                  sleep.buckets.length > 1 && /* @__PURE__ */ jsx2("div", { className: "mt-2 space-y-1", children: sleep.buckets.map((bucket) => /* @__PURE__ */ jsxs2(
                    "div",
                    {
                      className: "flex items-center gap-2 text-[10px] font-mono text-[#8C8C90]",
                      children: [
                        /* @__PURE__ */ jsxs2("span", { className: "w-16 shrink-0", children: [
                          bucket.fromHour,
                          "\u2013",
                          bucket.toHour,
                          " h"
                        ] }),
                        /* @__PURE__ */ jsx2("span", { className: "flex-1", children: /* @__PURE__ */ jsx2(
                          "span",
                          {
                            className: "block h-1.5 rounded-full bg-[#C81E3A]",
                            style: { width: `${(bucket.avgNextEnergy ?? 0) / 5 * 100}%` }
                          }
                        ) }),
                        /* @__PURE__ */ jsx2("span", { className: "w-10 text-right", children: bucket.avgNextEnergy?.toFixed(1) ?? "\u2014" })
                      ]
                    },
                    bucket.fromHour
                  )) })
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxs2(
            "div",
            {
              className: "rounded-xl border-l-2 border-l-[#C81E3A]/45 bg-white/[0.02] px-3.5 py-3",
              "data-testid": "recovery-7day-trend",
              children: [
                /* @__PURE__ */ jsx2("p", { className: "mb-2 text-[11px] font-inter font-semibold text-[#F4F2ED]", children: "7-day readiness and sleep" }),
                /* @__PURE__ */ jsx2("div", { className: "flex items-end gap-2", style: { height: 56 }, children: trend.map((point) => /* @__PURE__ */ jsxs2("div", { className: "flex flex-1 flex-col items-center gap-1", children: [
                  /* @__PURE__ */ jsx2(
                    "span",
                    {
                      className: "text-[9px] font-mono",
                      style: { color: SCORE_COLOR(point.score) },
                      children: point.hasData ? point.score : ""
                    }
                  ),
                  /* @__PURE__ */ jsx2("div", { className: "flex h-full w-full items-end", children: /* @__PURE__ */ jsx2(
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
                  /* @__PURE__ */ jsx2("span", { className: "text-[9px] font-inter text-[#8C8C90]", children: point.label }),
                  /* @__PURE__ */ jsx2("span", { className: "text-[9px] font-mono text-gold", children: point.sleepHours !== null ? `${point.sleepHours}h` : "\xB7" })
                ] }, point.date)) }),
                /* @__PURE__ */ jsxs2("p", { className: "mt-1.5 text-[10px] font-inter text-[#8C8C90]", children: [
                  "Bars show readiness score, the gold number is hours slept (",
                  history.length,
                  " server days recorded)."
                ] }),
                historyError && /* @__PURE__ */ jsx2(
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

// src/app/lib/recoveryNav.ts
import { BatteryCharging, CalendarDays, ChartLine, HeartPulse as HeartPulse2, Target, Trophy } from "lucide-react";
var RECOVERY_SECTIONS = [
  { id: "overview", label: "Overview", icon: HeartPulse2 },
  { id: "history", label: "History", icon: CalendarDays },
  { id: "goals", label: "Goals", icon: Target },
  { id: "records", label: "Records", icon: Trophy },
  { id: "progress", label: "Progress", icon: ChartLine },
  { id: "devices", label: "Devices", icon: BatteryCharging }
];

// src/app/hooks/useRecoveryInsights.ts
import { useEffect as useEffect3, useState as useState3 } from "react";

// mock:trainingErrors
var sanitizeTrainingRpcError = (m) => {
  const raw = String(m ?? "");
  const deployment = raw.includes("Could not find the function") || raw.includes("PGRST202");
  return { userMessage: "unavailable", meta: { code: deployment ? "PGRST202" : "UNKNOWN", deploymentProblem: deployment } };
};

// mock:trainingClient
var trainingRpcClient = () => globalThis.__svjP3.rpc;
var getTrainingProfile = async (rpc) => globalThis.__svjP3.profile;
var recentMuscleHistory = async (rpc, days) => globalThis.__svjP3.muscles;

// mock:goalsRecords
var listGoals2 = async (callRpc2) => globalThis.__svjP3.goals;

// src/app/hooks/useRecoveryInsights.ts
var emptyProfile = normalizeTrainingProfile(null);
function useRecoveryInsights() {
  const [goals, setGoals] = useState3([]);
  const [trainingProfile, setTrainingProfile] = useState3(emptyProfile);
  const [muscleRows, setMuscleRows] = useState3([]);
  const [muscleAvailability, setMuscleAvailability] = useState3("loading");
  const [loading, setLoading] = useState3(true);
  const [attempt, setAttempt] = useState3(0);
  useEffect3(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const rpc = trainingRpcClient();
      if (!rpc) {
        if (!mounted) return;
        setGoals([]);
        setTrainingProfile(emptyProfile);
        setMuscleRows([]);
        setMuscleAvailability("error");
        setLoading(false);
        return;
      }
      const [goalResult, profileResult, muscleResult] = await Promise.all([
        listGoals2((fn, args) => rpc(fn, args), false),
        getTrainingProfile(rpc),
        recentMuscleHistory(rpc, 7)
      ]);
      if (!mounted) return;
      setGoals(goalResult.ok ? goalResult.goals : []);
      if (profileResult.ok) {
        setTrainingProfile(
          profileResult.profile ? normalizeTrainingProfile(profileResult.profile) : emptyProfile
        );
      }
      if (muscleResult.ok) {
        setMuscleRows(muscleResult.rows);
        setMuscleAvailability("ready");
      } else {
        const { meta } = sanitizeTrainingRpcError(muscleResult.error);
        setMuscleRows([]);
        setMuscleAvailability(meta.deploymentProblem ? "unavailable" : "error");
        if (meta.deploymentProblem) {
          console.warn("[SVJ recovery] svj_recent_muscle_history is not deployed", {
            code: meta.code
          });
        }
      }
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [attempt]);
  return {
    goals,
    trainingProfile,
    muscleRows,
    muscleAvailability,
    loading,
    reload: () => setAttempt((n) => n + 1)
  };
}

// src/app/components/recovery/RecoveryGoalsSection.tsx
import { useCallback as useCallback3, useEffect as useEffect5, useMemo as useMemo2, useState as useState5 } from "react";
import { Loader2 as Loader22, RefreshCw as RefreshCw2, Target as Target2, Trash2 } from "lucide-react";

// src/app/components/ui-primitives/SVJEmptyState.tsx
import { TriangleAlert, Sparkles } from "lucide-react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsxs3(
    "div",
    {
      "data-empty-variant": variant,
      className: `flex flex-col items-center justify-center text-center ${compact ? "px-4 py-5" : "px-5 py-8"} ${className}`,
      children: [
        /* @__PURE__ */ jsx3(
          "div",
          {
            className: `flex items-center justify-center rounded-2xl border ${t.tile} ${compact ? "mb-3 h-10 w-10" : "mb-4 h-12 w-12"}`,
            children: /* @__PURE__ */ jsx3(ResolvedIcon, { "aria-hidden": true, className: `${compact ? "h-4 w-4" : "h-5 w-5"} ${t.glyph}` })
          }
        ),
        t.label && /* @__PURE__ */ jsx3("p", { className: "mb-1 font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8C8C90]", children: t.label }),
        /* @__PURE__ */ jsx3("h4", { className: "font-inter text-sm font-semibold text-[#F4F2ED]", children: title }),
        /* @__PURE__ */ jsx3("p", { className: "mt-1.5 max-w-xs text-xs font-inter leading-relaxed text-[#8C8C90]", children: description }),
        action && /* @__PURE__ */ jsx3("div", { className: "mt-4", children: action })
      ]
    }
  );
};

// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js";

// src/integrations/supabase/previewAuthStorage.ts
function brokeredPreviewStorage() {
  if (typeof window === "undefined") return void 0;
  const host = location.hostname;
  const PREVIEW_ZONES = ["lovableproject.com", "lovableproject-dev.com", "lovable.app", "gpt-eng.com", "gptengineer.run"];
  const onPreviewZone = PREVIEW_ZONES.some((z) => host === z || host.endsWith("." + z));
  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const projectId = onPreviewZone ? host.match(new RegExp("^(?:id-preview(?:-[a-z0-9]+)?|project)--(" + UUID + ")(?:-dev)?(?=\\.|$)", "i"))?.[1] ?? host.match(new RegExp("^(" + UUID + ")(?=[.-])", "i"))?.[1] : void 0;
  const framed = window.parent && window.parent !== window;
  if (!projectId || !framed) return localStorage;
  const dev = host.endsWith(".lovableproject-dev.com") || host.endsWith(".gpt-eng.com");
  const EDITOR = dev ? /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$|^http:\/\/localhost:3000$/ : /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$/;
  const ancestor = location.ancestorOrigins && location.ancestorOrigins[0] || (document.referrer ? new URL(document.referrer).origin : "");
  const editorOrigins = ancestor && EDITOR.test(ancestor) ? [ancestor] : dev ? ["https://lovable.dev", "http://localhost:3000"] : ["https://lovable.dev"];
  const RESULT = "lovable-preview-auth:result";
  const TIMEOUT = 2e3;
  const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const request = (type, key, value) => new Promise((resolve) => {
    const requestId = newId();
    let done = false;
    let timer;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(r);
    };
    const onMessage = (e) => {
      if (editorOrigins.indexOf(e.origin) < 0) return;
      const d = e.data;
      if (d && d.type === RESULT && d.requestId === requestId) finish(d);
    };
    window.addEventListener("message", onMessage);
    const msg = { type, requestId, projectId, key };
    if (value !== void 0) msg["value"] = value;
    for (const origin of editorOrigins) window.parent.postMessage(msg, origin);
    timer = setTimeout(() => finish(null), TIMEOUT);
  });
  let firstGet = true;
  const RETRY_DELAY = 250;
  return {
    getItem: async (key) => {
      let res = await request("lovable-preview-auth:get", key);
      if (!res && firstGet) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
        res = await request("lovable-preview-auth:get", key);
      }
      firstGet = false;
      if (res && res.ok && typeof res.value === "string") {
        if (res.value === "") {
          localStorage.removeItem(key);
          return null;
        }
        return res.value;
      }
      return localStorage.getItem(key);
    },
    setItem: (key, value) => {
      localStorage.setItem(key, value);
      return request("lovable-preview-auth:set", key, value).then((res) => {
        if (res && res.ok && typeof res.value === "string" && localStorage.getItem(key) === value) {
          if (res.value === "") localStorage.removeItem(key);
          else localStorage.setItem(key, res.value);
        }
      });
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
      return request("lovable-preview-auth:remove", key).then(() => void 0);
    }
  };
}

// src/integrations/supabase/client.ts
function isNewSupabaseApiKey(value) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}
function createSupabaseFetch(supabaseKey) {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : void 0
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
function getSupabaseConfig() {
  return {
    url: import.meta.env["VITE_SUPABASE_URL"] || (typeof process !== "undefined" ? process.env["SUPABASE_URL"] : void 0),
    publishableKey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || (typeof process !== "undefined" ? process.env["SUPABASE_PUBLISHABLE_KEY"] : void 0)
  };
}
function getMissingSupabaseEnv() {
  const { url, publishableKey } = getSupabaseConfig();
  return [
    ...!url ? ["VITE_SUPABASE_URL"] : [],
    ...!publishableKey ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []
  ];
}
function hasSupabaseConfig() {
  return getMissingSupabaseEnv().length === 0;
}
function createSupabaseClient() {
  const { url: SUPABASE_URL, publishableKey: SUPABASE_PUBLISHABLE_KEY } = getSupabaseConfig();
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...!SUPABASE_URL ? ["SUPABASE_URL"] : [],
      ...!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect Supabase in Lovable Cloud.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY)
    },
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true
    }
  });
}
var _supabase;
var supabase = new Proxy({}, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  }
});

// src/app/lib/trainingErrors.ts
function sanitizeTrainingRpcError2(message) {
  const raw = (message ?? "").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("could not find the function") || lower.includes("pgrst202") || lower.includes("42883") || lower.includes("does not exist") || lower.includes("schema cache")) {
    return {
      userMessage: "Automated training is still rolling out to your account. Please update the app and try again later.",
      meta: { code: "TRAINING_RPC_NOT_DEPLOYED", deploymentProblem: true }
    };
  }
  if (lower.includes("authentication required") || lower.includes("jwt") || lower.includes("session")) {
    return {
      userMessage: "Your session has expired. Please sign in again.",
      meta: { code: "TRAINING_RPC_AUTH_REQUIRED", deploymentProblem: false }
    };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("offline") || lower.includes("connection")) {
    return {
      userMessage: "Couldn't reach the SVJ servers. Check your connection and try again.",
      meta: { code: "TRAINING_RPC_NETWORK", deploymentProblem: false }
    };
  }
  if (raw.length === 0) {
    return {
      userMessage: "Couldn't load your training profile. Please try again.",
      meta: { code: "TRAINING_RPC_UNKNOWN", deploymentProblem: false }
    };
  }
  return {
    userMessage: "Couldn't load your training profile. Please try again.",
    meta: { code: "TRAINING_RPC_UNKNOWN", deploymentProblem: false }
  };
}

// src/app/components/ui-primitives/SVJSelect.tsx
import { useCallback as useCallback2, useEffect as useEffect4, useId, useRef, useState as useState4 } from "react";
import { Check, ChevronDown } from "lucide-react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
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
  const [open, setOpen] = useState4(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState4(
    () => Math.max(
      0,
      options.findIndex((option) => option.value === value)
    )
  );
  useEffect4(() => {
    if (!open) return;
    const index = options.findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, options, value]);
  useEffect4(() => {
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
  const commit = useCallback2(
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
  return /* @__PURE__ */ jsxs4("div", { ref: rootRef, className: `relative ${className ?? ""}`, onKeyDown, children: [
    /* @__PURE__ */ jsxs4(
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
          /* @__PURE__ */ jsxs4("span", { id: listboxId, className: "text-[11px] font-inter text-[#8C8C90]", children: [
            label,
            /* @__PURE__ */ jsx4("span", { className: "sr-only", children: ": " }),
            /* @__PURE__ */ jsx4("span", { className: "ml-1 text-white", "data-testid": testId ? `${testId}-value` : void 0, children: labelFor(options, value) })
          ] }),
          /* @__PURE__ */ jsx4(
            ChevronDown,
            {
              className: `h-4 w-4 shrink-0 text-[#8C8C90] transition-transform ${open ? "rotate-180" : ""}`,
              "aria-hidden": true
            }
          )
        ]
      }
    ),
    open && /* @__PURE__ */ jsx4(
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
          return /* @__PURE__ */ jsx4("li", { role: "none", children: /* @__PURE__ */ jsxs4(
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
                /* @__PURE__ */ jsx4("span", { children: option.label }),
                selected && /* @__PURE__ */ jsx4(Check, { className: "h-4 w-4 shrink-0 text-[#C81E3A]", "aria-label": "Selected" })
              ]
            }
          ) }, String(option.value));
        })
      }
    )
  ] });
}

// src/app/components/recovery/RecoveryGoalsSection.tsx
import { Fragment as Fragment2, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function rpcClient() {
  if (!hasSupabaseConfig()) return null;
  return supabase;
}
var callRpc = (fn, args) => {
  const client = rpcClient();
  if (!client)
    return Promise.resolve({ data: null, error: { message: "Backend is not configured." } });
  return client.rpc(fn, args);
};
var CARD = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-3";
var SECTION_TITLE = "text-[11px] font-inter font-semibold text-[#8C8C90]";
var BUTTON = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A] disabled:cursor-not-allowed disabled:opacity-50";
var METRIC_HINTS = {
  recovery_checkin_count: "Days with a saved recovery check-in.",
  sleep_7h_day_count: "Check-in days where you reported 7+ hours of sleep.",
  rest_day_count: "Days with no recorded activity in the goal period.",
  readiness_60_day_count: "Days your readiness score reached 60 or higher."
};
var STATUS_LABEL = {
  active: "Active",
  completed: "Completed",
  expired: "Expired",
  cancelled: "Cancelled"
};
var GoalCard = ({ goal, onRetarget, onCancel, busy }) => {
  const percent = Math.min(100, Math.round(goal.progress / goal.targetValue * 100));
  const done = goal.status !== "active";
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      className: "rounded-xl border border-white/5 bg-black/30 p-3",
      "data-testid": `recovery-goal-card-${goal.id}`,
      children: [
        /* @__PURE__ */ jsxs5("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxs5("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx5("p", { className: "truncate text-xs font-inter font-semibold text-[#F4F2ED]", children: GOAL_METRIC_LABELS[goal.metric] }),
            /* @__PURE__ */ jsx5("p", { className: "mt-0.5 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]", children: periodLabel(goal) })
          ] }),
          /* @__PURE__ */ jsx5(
            "span",
            {
              className: `shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider ${goal.status === "completed" ? "border-emerald-400/30 text-emerald-300" : goal.status === "expired" ? "border-gold/30 text-gold" : goal.status === "cancelled" ? "border-white/10 text-[#8C8C90]" : "border-white/10 text-[#8C8C90]"}`,
              children: STATUS_LABEL[goal.status] ?? goal.status
            }
          )
        ] }),
        /* @__PURE__ */ jsx5(
          "div",
          {
            className: "mt-2 h-1.5 overflow-hidden rounded-full bg-white/5",
            role: "progressbar",
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": percent,
            "aria-label": `${GOAL_METRIC_LABELS[goal.metric]}: ${formatGoalProgress(goal.metric, goal.progress)} of ${formatGoalProgress(goal.metric, goal.targetValue)} days`,
            children: /* @__PURE__ */ jsx5(
              "div",
              {
                className: `h-full rounded-full ${goal.status === "completed" ? "bg-emerald-400" : "bg-gold"}`,
                style: { width: `${percent}%` }
              }
            )
          }
        ),
        /* @__PURE__ */ jsxs5("p", { className: "mt-1.5 text-[11px] font-inter text-[#F4F2ED]", children: [
          formatGoalProgress(goal.metric, goal.progress),
          " /",
          " ",
          formatGoalProgress(goal.metric, goal.targetValue),
          " days",
          /* @__PURE__ */ jsxs5("span", { className: "sr-only", children: [
            " ",
            "\u2014 ",
            percent,
            "% complete, ",
            STATUS_LABEL[goal.status] ?? goal.status
          ] })
        ] }),
        /* @__PURE__ */ jsx5("p", { className: "mt-1 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]", children: METRIC_HINTS[goal.metric] ?? "Derived by the server from your own data." }),
        !done && (onRetarget || onCancel) && /* @__PURE__ */ jsxs5("div", { className: "mt-2 flex gap-2", children: [
          onRetarget && /* @__PURE__ */ jsx5(
            "button",
            {
              type: "button",
              className: `${BUTTON} flex-1`,
              disabled: busy,
              onClick: () => {
                const next = Math.min(goal.targetValue + 1, 31);
                if (next !== goal.targetValue) onRetarget(next);
              },
              "data-testid": `recovery-goal-edit-${goal.id}`,
              children: "+1 day target"
            }
          ),
          onCancel && /* @__PURE__ */ jsxs5(
            "button",
            {
              type: "button",
              className: `${BUTTON} flex-1 border-[#C81E3A]/40 text-[#C81E3A]`,
              disabled: busy,
              onClick: onCancel,
              "data-testid": `recovery-goal-cancel-${goal.id}`,
              children: [
                /* @__PURE__ */ jsx5(Trash2, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                "Cancel"
              ]
            }
          )
        ] })
      ]
    }
  );
};
var RecoveryGoalsSection = () => {
  const [goals, setGoals] = useState5(null);
  const [error, setError] = useState5(null);
  const [deploymentIssue, setDeploymentIssue] = useState5(false);
  const [loading, setLoading] = useState5(true);
  const [attempt, setAttempt] = useState5(0);
  const [metric, setMetric] = useState5("recovery_checkin_count");
  const [target, setTarget] = useState5(5);
  const [period, setPeriod] = useState5("weekly");
  const [formError, setFormError] = useState5(null);
  const [busy, setBusy] = useState5(false);
  const load = useCallback3(async (signal) => {
    setLoading(true);
    setError(null);
    const result = await listGoals(callRpc, true);
    if (signal.cancelled) return;
    setGoals(result.ok ? result.goals : []);
    if (!result.ok) {
      const { meta } = sanitizeTrainingRpcError2(result.error ?? "");
      setDeploymentIssue(Boolean(meta.deploymentProblem));
      setError("recovery-goals-load-failed");
    } else {
      setDeploymentIssue(false);
    }
    setLoading(false);
  }, []);
  useEffect5(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load, attempt]);
  const periodBounds = useMemo2(
    () => period === "weekly" ? periodBoundsWeekly(/* @__PURE__ */ new Date()) : periodBoundsMonthly(/* @__PURE__ */ new Date()),
    [period]
  );
  const daysInPeriod = (Date.parse(`${periodBounds.periodEnd}T00:00:00`) - Date.parse(`${periodBounds.periodStart}T00:00:00`)) / 864e5 + 1;
  const maxTarget = period === "weekly" ? 7 : 31;
  const targetOptions = Array.from({ length: maxTarget }, (_, i) => i + 1).map((n) => ({
    value: n,
    label: `${n} day${n === 1 ? "" : "s"}`
  }));
  const effectiveTarget = Math.min(target, maxTarget);
  const submit = async () => {
    setFormError(null);
    const input = {
      metric,
      targetValue: effectiveTarget,
      periodType: period,
      periodStart: periodBounds.periodStart,
      periodEnd: periodBounds.periodEnd,
      activityType: null
    };
    const invalid = validateGoalInput(input);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setBusy(true);
    const result = await createGoal(callRpc, {
      metric: input.metric,
      targetValue: input.targetValue,
      periodType: period,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error ?? "Couldn't create the goal.");
      return;
    }
    setFormError(null);
    await load({ cancelled: false });
  };
  const retarget = async (goal, next) => {
    setBusy(true);
    await updateGoal(callRpc, goal.id, next);
    setBusy(false);
    await load({ cancelled: false });
  };
  const cancel = async (goal) => {
    setBusy(true);
    await cancelGoal(callRpc, goal.id);
    setBusy(false);
    await load({ cancelled: false });
  };
  if (loading && goals === null) {
    return /* @__PURE__ */ jsxs5(
      "div",
      {
        role: "tabpanel",
        id: "recovery-panel-goals",
        "aria-labelledby": "recovery-tab-goals",
        "data-testid": "recovery-section-goals",
        className: CARD,
        children: [
          /* @__PURE__ */ jsx5("h2", { className: "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]", children: "Recovery goals" }),
          /* @__PURE__ */ jsxs5(
            "p",
            {
              className: "mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]",
              "data-testid": "recovery-goals-loading",
              children: [
                /* @__PURE__ */ jsx5(Loader22, { "aria-hidden": true, className: "h-4 w-4 animate-spin" }),
                "Loading your goals\u2026"
              ]
            }
          )
        ]
      }
    );
  }
  return /* @__PURE__ */ jsx5(
    "div",
    {
      role: "tabpanel",
      id: "recovery-panel-goals",
      "aria-labelledby": "recovery-tab-goals",
      "data-testid": "recovery-section-goals",
      children: /* @__PURE__ */ jsxs5("div", { className: CARD, children: [
        /* @__PURE__ */ jsx5("h2", { className: "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]", children: "Recovery goals" }),
        /* @__PURE__ */ jsx5("p", { className: "mt-1 text-[11px] font-inter text-[#8C8C90]", children: "Progress is derived on the server from your own check-ins, recorded activity and readiness \u2014 never entered by hand." }),
        error ? /* @__PURE__ */ jsx5("div", { "data-testid": "recovery-goals-error", children: /* @__PURE__ */ jsx5(
          SVJEmptyState,
          {
            variant: "error",
            compact: true,
            title: deploymentIssue ? "Recovery goals aren't available on this deployment yet" : "Your recovery goals didn't load",
            description: deploymentIssue ? "The goal functions haven't been applied to this backend yet. Your check-ins and readiness are unaffected." : "Goals are measured on the server from your own check-ins and activity, so they need a connection to your account.",
            action: /* @__PURE__ */ jsxs5(
              "button",
              {
                type: "button",
                className: BUTTON,
                "data-testid": "recovery-goals-retry",
                onClick: () => setAttempt((n) => n + 1),
                children: [
                  /* @__PURE__ */ jsx5(RefreshCw2, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                  "Try again"
                ]
              }
            )
          }
        ) }) : /* @__PURE__ */ jsxs5(Fragment2, { children: [
          /* @__PURE__ */ jsxs5(
            "div",
            {
              className: "mt-3 rounded-xl border border-white/5 bg-black/30 p-3",
              "data-testid": "recovery-goal-form",
              children: [
                /* @__PURE__ */ jsx5("p", { className: SECTION_TITLE, children: "New goal" }),
                /* @__PURE__ */ jsxs5("div", { className: "mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3", children: [
                  /* @__PURE__ */ jsx5(
                    SVJSelect,
                    {
                      label: "Metric",
                      value: metric,
                      testId: "recovery-goal-metric",
                      options: RECOVERY_GOAL_METRICS.map((m) => ({
                        value: m,
                        label: GOAL_METRIC_LABELS[m]
                      })),
                      onChange: (next) => setMetric(next)
                    }
                  ),
                  /* @__PURE__ */ jsx5(
                    SVJSelect,
                    {
                      label: "Target",
                      value: effectiveTarget,
                      testId: "recovery-goal-target",
                      options: targetOptions,
                      onChange: (next) => setTarget(next)
                    }
                  ),
                  /* @__PURE__ */ jsx5(
                    SVJSelect,
                    {
                      label: "Period",
                      value: period,
                      testId: "recovery-goal-period",
                      options: [
                        { value: "weekly", label: "This week" },
                        { value: "monthly", label: "This month" }
                      ],
                      onChange: (next) => setPeriod(next)
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx5("p", { className: "mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]", children: METRIC_HINTS[metric] }),
                formError && /* @__PURE__ */ jsx5(
                  "p",
                  {
                    className: "mt-2 text-[11px] font-inter text-[#C81E3A]",
                    "data-testid": "recovery-goal-form-error",
                    role: "alert",
                    children: formError
                  }
                ),
                /* @__PURE__ */ jsxs5(
                  "button",
                  {
                    type: "button",
                    className: `${BUTTON} mt-2 w-full border-[#C81E3A]/50 bg-[#C81E3A]/15`,
                    disabled: busy,
                    onClick: submit,
                    "data-testid": "recovery-goal-create",
                    children: [
                      /* @__PURE__ */ jsx5(Target2, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                      "Create goal"
                    ]
                  }
                )
              ]
            }
          ),
          (goals ?? []).length === 0 ? /* @__PURE__ */ jsx5(
            "p",
            {
              className: "mt-4 text-center text-[11px] font-mono uppercase text-[#8C8C90]",
              "data-testid": "recovery-goals-empty",
              children: "No goals yet \u2014 create your first recovery goal above."
            }
          ) : /* @__PURE__ */ jsx5("div", { className: "mt-3 space-y-2", children: (goals ?? []).map((goal) => /* @__PURE__ */ jsx5(
            GoalCard,
            {
              goal,
              busy,
              onRetarget: goal.status === "active" ? (next) => void retarget(goal, next) : void 0,
              onCancel: goal.status === "active" ? () => void cancel(goal) : void 0
            },
            goal.id
          )) })
        ] })
      ] })
    }
  );
};
var RecoveryGoalsSection_default = RecoveryGoalsSection;

// src/app/components/recovery/RecoveryHistorySection.tsx
import React5, { useCallback as useCallback4, useMemo as useMemo3, useState as useState6 } from "react";
import { Loader2 as Loader23, Moon as Moon2, RefreshCw as RefreshCw3 } from "lucide-react";
import { Fragment as Fragment3, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var CARD2 = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 mb-3";
var HEADING = "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]";
var SECTION_TITLE2 = "font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8C8C90]";
var HISTORY_LIMIT = 35;
var GRADE_STYLE = {
  excellent: { bg: "bg-emerald-400/25", text: "text-emerald-300", swatch: "bg-emerald-400" },
  good: { bg: "bg-gold/25", text: "text-gold", swatch: "bg-gold" },
  fair: { bg: "bg-orange-400/25", text: "text-orange-300", swatch: "bg-orange-400" },
  poor: { bg: "bg-[#C81E3A]/30", text: "text-[#C81E3A]", swatch: "bg-[#C81E3A]" },
  unknown: { bg: "bg-white/5", text: "text-[#8C8C90]", swatch: "bg-white/10" }
};
var GRADE_GLYPH = {
  excellent: "\u25C6",
  good: "\u25C6",
  fair: "\u25C7",
  poor: "\u2715",
  unknown: ""
};
var cellStyle = (cell) => cell.state === "no_data" ? GRADE_STYLE.unknown : GRADE_STYLE[cell.grade ?? "unknown"];
var cellAria = (cell) => cell.state === "no_data" ? `${heatCellDateLabel(cell.date)}, no recovery data` : `${heatCellDateLabel(cell.date)}, readiness ${cell.score}, ${heatCellBandLabel(cell.grade)}, ${cell.hasCheckin ? "check-in completed" : "no check-in"}`;
var DayDetail = ({ cell }) => /* @__PURE__ */ jsxs6(
  "div",
  {
    className: `${CARD2} mb-0 border-[#C81E3A]/30`,
    role: "status",
    "data-testid": "recovery-history-day-detail",
    children: [
      /* @__PURE__ */ jsx6("p", { className: SECTION_TITLE2, children: heatCellDateLabel(cell.date) }),
      cell.state === "no_data" ? /* @__PURE__ */ jsx6("p", { className: "mt-1 text-xs font-inter text-[#8C8C90]", children: "No readiness data for this day \u2014 SVJ never fills gaps with estimates." }) : /* @__PURE__ */ jsxs6("dl", { className: "mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-inter text-[#F4F2ED]", children: [
        /* @__PURE__ */ jsxs6("div", { className: "flex justify-between gap-2", children: [
          /* @__PURE__ */ jsx6("dt", { className: "text-[#8C8C90]", children: "Readiness" }),
          /* @__PURE__ */ jsxs6("dd", { className: "font-mono", children: [
            cell.score,
            " \u2014 ",
            heatCellBandLabel(cell.grade)
          ] })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: "flex justify-between gap-2", children: [
          /* @__PURE__ */ jsx6("dt", { className: "text-[#8C8C90]", children: "Check-in" }),
          /* @__PURE__ */ jsx6("dd", { className: "font-mono", children: cell.hasCheckin ? "Completed" : "None" })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: "flex justify-between gap-2", children: [
          /* @__PURE__ */ jsx6("dt", { className: "text-[#8C8C90]", children: "Reported sleep" }),
          /* @__PURE__ */ jsx6("dd", { className: "font-mono", children: cell.sleepHours !== null ? `${cell.sleepHours} h` : "\u2014" })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: "flex justify-between gap-2", children: [
          /* @__PURE__ */ jsx6("dt", { className: "text-[#8C8C90]", children: "Activity load" }),
          /* @__PURE__ */ jsx6("dd", { className: "font-mono", children: cell.band ? cell.band.replace("_", " ") : "\u2014" })
        ] })
      ] })
    ]
  }
);
var RecoveryHistorySection = () => {
  const [history, setHistory] = useState6(null);
  const [loading, setLoading] = useState6(true);
  const [error, setError] = useState6(null);
  const [selected, setSelected] = useState6(null);
  const [attempt, setAttempt] = useState6(0);
  React5.useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const result = await listMyRecoveryHistory(HISTORY_LIMIT);
      if (!mounted) return;
      if (result.ok) {
        setHistory(result.history ?? []);
      } else {
        setError("Recovery history is unavailable right now.");
      }
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [attempt]);
  const cells = useMemo3(() => buildRecoveryHeatmap(history ?? [], HISTORY_LIMIT), [history]);
  const correlation = useMemo3(() => correlateSleepReadiness(history ?? []), [history]);
  const bestSleep = useMemo3(
    () => bestSleepRange(
      (history ?? []).map((row) => ({
        date: row.date,
        checkin: {
          sleepHours: row.sleepHours,
          soreness: row.soreness,
          energy: row.energy,
          perceivedRecovery: row.perceivedRecovery
        },
        activityLoadPoints: row.activityLoadPoints,
        taskLoadPoints: 0,
        totalLoadPoints: row.activityLoadPoints,
        band: "moderate",
        score: row.score,
        recovery: "unknown",
        taskCount: 0
      }))
    ),
    [history]
  );
  const selectedCell = cells.find((cell) => cell.date === selected) ?? null;
  const focusCell = useCallback4((cell) => {
    setSelected(cell.date);
  }, []);
  if (loading && history === null) {
    return /* @__PURE__ */ jsxs6(
      "div",
      {
        role: "tabpanel",
        id: "recovery-panel-history",
        "aria-labelledby": "recovery-tab-history",
        "data-testid": "recovery-section-history",
        className: CARD2,
        children: [
          /* @__PURE__ */ jsx6("h2", { className: HEADING, children: "Recovery history" }),
          /* @__PURE__ */ jsxs6(
            "p",
            {
              className: "mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]",
              "data-testid": "recovery-history-loading",
              children: [
                /* @__PURE__ */ jsx6(Loader23, { "aria-hidden": true, className: "h-4 w-4 animate-spin" }),
                "Loading your recovery history\u2026"
              ]
            }
          )
        ]
      }
    );
  }
  if (error) {
    return /* @__PURE__ */ jsxs6(
      "div",
      {
        role: "tabpanel",
        id: "recovery-panel-history",
        "aria-labelledby": "recovery-tab-history",
        "data-testid": "recovery-section-history",
        className: CARD2,
        children: [
          /* @__PURE__ */ jsx6("h2", { className: HEADING, children: "Recovery history" }),
          /* @__PURE__ */ jsx6("div", { "data-testid": "recovery-history-error", children: /* @__PURE__ */ jsx6(
            SVJEmptyState,
            {
              variant: "error",
              compact: true,
              title: "Your check-in history didn't load",
              description: "Your saved check-ins and readiness days couldn't be fetched from your account. Nothing has been lost, and no day is being filled in for you.",
              action: /* @__PURE__ */ jsxs6(
                "button",
                {
                  type: "button",
                  "data-testid": "recovery-history-retry",
                  onClick: () => setAttempt((n) => n + 1),
                  className: "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A]",
                  children: [
                    /* @__PURE__ */ jsx6(RefreshCw3, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                    "Try again"
                  ]
                }
              )
            }
          ) })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs6(
    "div",
    {
      role: "tabpanel",
      id: "recovery-panel-history",
      "aria-labelledby": "recovery-tab-history",
      "data-testid": "recovery-section-history",
      children: [
        /* @__PURE__ */ jsxs6("div", { className: CARD2, children: [
          /* @__PURE__ */ jsx6("h2", { className: HEADING, children: "Recovery history" }),
          /* @__PURE__ */ jsxs6("p", { className: "mt-1 text-[11px] font-inter text-[#8C8C90]", children: [
            "Your last ",
            HISTORY_LIMIT,
            " days, from your saved readiness on the server. Days without saved data stay empty \u2014 they are never counted as low readiness."
          ] }),
          cells.length === 0 ? /* @__PURE__ */ jsx6(
            "p",
            {
              className: "mt-4 text-center text-[11px] font-mono uppercase text-[#8C8C90]",
              "data-testid": "recovery-history-empty",
              children: "No recovery history yet \u2014 save a check-in on the Overview tab to start."
            }
          ) : /* @__PURE__ */ jsxs6(Fragment3, { children: [
            /* @__PURE__ */ jsx6(
              "ul",
              {
                className: "mt-3 grid grid-cols-7 gap-1.5",
                "data-testid": "recovery-history-grid",
                "aria-label": "Recovery history calendar",
                children: cells.map((cell) => {
                  const style = cellStyle(cell);
                  const isSelected = selected === cell.date;
                  return /* @__PURE__ */ jsx6("li", { children: /* @__PURE__ */ jsxs6(
                    "button",
                    {
                      type: "button",
                      "data-testid": `recovery-history-cell-${cell.date}`,
                      "aria-label": cellAria(cell),
                      "aria-pressed": isSelected,
                      onClick: () => focusCell(cell),
                      className: `flex h-10 w-full min-w-[44px] items-center justify-center rounded-lg border text-[10px] font-mono transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C81E3A] ${isSelected ? "border-[#C81E3A]" : "border-white/5"} ${style.bg}`,
                      children: [
                        /* @__PURE__ */ jsx6("span", { "aria-hidden": true, className: style.text, children: cell.state === "no_data" ? "\xB7" : GRADE_GLYPH[cell.grade ?? "unknown"] }),
                        /* @__PURE__ */ jsx6("span", { className: "sr-only", children: cellAria(cell) })
                      ]
                    }
                  ) }, cell.date);
                })
              }
            ),
            /* @__PURE__ */ jsx6(
              "ul",
              {
                className: "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5",
                "data-testid": "recovery-history-legend",
                children: [
                  ["excellent", "78+"],
                  ["good", "60\u201377"],
                  ["fair", "40\u201359"],
                  ["poor", "below 40"],
                  ["unknown", "no data"]
                ].map(([grade, range]) => /* @__PURE__ */ jsxs6(
                  "li",
                  {
                    className: "flex items-center gap-1.5 text-[10px] font-mono text-[#8C8C90]",
                    children: [
                      /* @__PURE__ */ jsx6(
                        "span",
                        {
                          "aria-hidden": true,
                          className: `flex h-4 w-4 items-center justify-center rounded ${GRADE_STYLE[grade].swatch} ${grade === "unknown" ? "" : "bg-opacity-40"}`,
                          children: GRADE_GLYPH[grade] || "\xB7"
                        }
                      ),
                      grade === "unknown" ? "No data" : `${grade[0].toUpperCase()}${grade.slice(1)} (${range})`
                    ]
                  },
                  grade
                ))
              }
            )
          ] })
        ] }),
        selectedCell && /* @__PURE__ */ jsx6(DayDetail, { cell: selectedCell }),
        /* @__PURE__ */ jsxs6("div", { className: CARD2, "data-testid": "recovery-sleep-correlation", children: [
          /* @__PURE__ */ jsx6("p", { className: SECTION_TITLE2, children: "Sleep vs readiness" }),
          /* @__PURE__ */ jsx6("p", { className: "mt-1 text-xs font-inter leading-relaxed text-[#F4F2ED]", children: correlation.summary }),
          /* @__PURE__ */ jsxs6("p", { className: "mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]", children: [
            correlation.samples,
            " paired day",
            correlation.samples === 1 ? "" : "s",
            " from your own check-ins \xB7 observed tendency only, not a cause"
          ] })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: CARD2, "data-testid": "recovery-best-sleep", children: [
          /* @__PURE__ */ jsx6("p", { className: SECTION_TITLE2, children: "Your best sleep" }),
          bestSleep.insufficientData || !bestSleep.bestRangeLabel ? /* @__PURE__ */ jsx6("p", { className: "mt-1 text-xs font-inter leading-relaxed text-[#8C8C90]", children: "Not enough logged nights yet \u2014 save check-ins with your sleep hours and SVJ will find the range that suits you." }) : /* @__PURE__ */ jsxs6(Fragment3, { children: [
            /* @__PURE__ */ jsxs6("p", { className: "mt-1 flex items-center gap-2 text-xs font-inter leading-relaxed text-[#F4F2ED]", children: [
              /* @__PURE__ */ jsx6(Moon2, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-gold" }),
              "On nights around ",
              bestSleep.bestRangeLabel,
              ", your next-day energy and readiness have been at their best."
            ] }),
            /* @__PURE__ */ jsx6("p", { className: "mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]", children: "From your own logged recovery history \u2014 not a clinical recommendation" })
          ] }),
          /* @__PURE__ */ jsxs6("p", { className: "mt-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]", children: [
            "Sleep insight needs ",
            SLEEP_CORRELATION_MIN_SAMPLES,
            "+ paired days before SVJ will interpret anything."
          ] })
        ] })
      ]
    }
  );
};
var RecoveryHistorySection_default = RecoveryHistorySection;

// src/app/components/recovery/RecoveryRecordsSection.tsx
import { useEffect as useEffect6, useMemo as useMemo4, useState as useState7 } from "react";
import { Loader2 as Loader24, RefreshCw as RefreshCw4, Trophy as Trophy2 } from "lucide-react";

// src/app/lib/recoveryRecords.ts
var RECOVERY_RECORD_TYPES = [
  "highest_readiness_score",
  "longest_checkin_streak",
  "longest_ready_streak",
  "best_7d_readiness_average"
];
var RECOVERY_RECORD_LABELS = {
  highest_readiness_score: "Highest Readiness",
  longest_checkin_streak: "Longest Check-in Streak",
  longest_ready_streak: "Longest Ready Streak",
  best_7d_readiness_average: "Best 7-Day Readiness"
};
var ISO_DATE2 = /^(\d{4})-(\d{2})-(\d{2})$/;
function calendarDate(iso) {
  const match = ISO_DATE2.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}
function orderRecoveryRecords(records) {
  const byType = new Map(records.map((record) => [record.recordType, record]));
  return RECOVERY_RECORD_TYPES.map((type) => byType.get(type)).filter(
    (record) => record !== void 0
  );
}
function formatRecoveryRecordValue(recordType, value) {
  switch (recordType) {
    case "highest_readiness_score":
      return `${Math.round(value)} / 100`;
    case "longest_checkin_streak":
    case "longest_ready_streak": {
      const days = Math.round(value);
      return `${days} ${days === 1 ? "day" : "days"}`;
    }
    case "best_7d_readiness_average":
      return `${Math.round(value)} avg`;
  }
}
function recoveryRecordValueSpoken(recordType, value) {
  switch (recordType) {
    case "highest_readiness_score":
      return `${Math.round(value)} out of 100`;
    case "longest_checkin_streak":
    case "longest_ready_streak": {
      const days = Math.round(value);
      return `${days} ${days === 1 ? "day" : "days"} in a row`;
    }
    case "best_7d_readiness_average":
      return `${Math.round(value)} average readiness`;
  }
}
function formatRecoveryRecordDate(iso) {
  const date = calendarDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function formatRecoveryRecordRange(startIso, endIso) {
  const start = calendarDate(startIso);
  const end = calendarDate(endIso);
  if (!start || !end) return "";
  const day = (date) => date.toLocaleDateString("en-GB", { day: "numeric" });
  const month = (date) => date.toLocaleDateString("en-GB", { month: "long" });
  const monthYear = (date) => date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth())
    return `${day(start)}\u2013${day(end)} ${monthYear(end)}`;
  if (start.getFullYear() === end.getFullYear())
    return `${day(start)} ${month(start)} \u2013 ${day(end)} ${monthYear(end)}`;
  return `${day(start)} ${monthYear(start)} \u2013 ${day(end)} ${monthYear(end)}`;
}
function recoveryRecordDateLabel(record) {
  const date = formatRecoveryRecordDate(record.achievedDate);
  if (!date) return "";
  return record.recordType === "highest_readiness_score" ? `Achieved ${date}` : `Ended ${date}`;
}
function recoveryRecordRangeLabel(record) {
  if (!record.startDate || record.startDate === record.achievedDate) return null;
  const range = formatRecoveryRecordRange(record.startDate, record.achievedDate);
  return range || null;
}

// src/app/components/recovery/RecoveryRecordsSection.tsx
import { Fragment as Fragment4, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var CARD3 = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4";
var HEADING2 = "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]";
var CAPTION = "text-[10px] font-inter text-[#8C8C90]";
var BUTTON2 = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A]";
var RECORD_EXPLANATIONS = {
  highest_readiness_score: "Your highest readiness score SVJ computed on a day with saved recovery data.",
  longest_checkin_streak: "Your longest run of back-to-back days with a saved recovery check-in.",
  longest_ready_streak: `Your longest run of back-to-back days at readiness ${LOW_READINESS_THRESHOLD} or above.`,
  best_7d_readiness_average: "Your highest average readiness across 7 straight days that all have saved readiness."
};
function emptyRecordMessage(recordType, readinessKnown) {
  switch (recordType) {
    case "highest_readiness_score":
      return "No readiness record yet.";
    case "longest_checkin_streak":
      return "No recovery check-in streak yet.";
    case "longest_ready_streak":
      return readinessKnown ? `No ${LOW_READINESS_THRESHOLD}+ readiness streak yet.` : "No readiness record yet.";
    case "best_7d_readiness_average":
      return "Not enough complete recovery history yet.";
  }
}
var RecordCard = ({ recordType, record, readinessKnown }) => {
  const label = RECOVERY_RECORD_LABELS[recordType];
  const range = record ? recoveryRecordRangeLabel(record) : null;
  return /* @__PURE__ */ jsx7(
    "li",
    {
      "data-testid": "recovery-record-card",
      "data-record-type": recordType,
      className: "rounded-xl border border-white/5 bg-black/30 p-3",
      children: /* @__PURE__ */ jsxs7("div", { className: "flex items-start gap-2", children: [
        /* @__PURE__ */ jsx7(Trophy2, { "aria-hidden": true, className: "mt-0.5 h-4 w-4 shrink-0 text-gold" }),
        /* @__PURE__ */ jsxs7("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx7("h3", { className: "text-xs font-inter font-semibold text-[#F4F2ED]", children: label }),
          record ? /* @__PURE__ */ jsxs7(Fragment4, { children: [
            /* @__PURE__ */ jsxs7("p", { className: "mt-0.5 font-mono text-xl font-bold text-[#E62846]", children: [
              /* @__PURE__ */ jsx7("span", { "aria-hidden": "true", children: formatRecoveryRecordValue(recordType, record.value) }),
              /* @__PURE__ */ jsx7("span", { className: "sr-only", children: recoveryRecordValueSpoken(recordType, record.value) })
            ] }),
            /* @__PURE__ */ jsxs7("p", { className: `mt-0.5 ${CAPTION}`, children: [
              recoveryRecordDateLabel(record),
              range ? ` \xB7 ${range}` : ""
            ] })
          ] }) : /* @__PURE__ */ jsx7(
            "p",
            {
              className: "mt-1 text-[11px] font-inter text-[#8C8C90]",
              "data-testid": "recovery-record-empty",
              children: emptyRecordMessage(recordType, readinessKnown)
            }
          ),
          /* @__PURE__ */ jsx7("p", { className: `mt-1 ${CAPTION}`, children: RECORD_EXPLANATIONS[recordType] })
        ] })
      ] })
    }
  );
};
var RecoveryRecordsSection = () => {
  const [records, setRecords] = useState7(null);
  const [error, setError] = useState7(null);
  const [attempt, setAttempt] = useState7(0);
  useEffect6(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      setRecords(null);
      const result = await listMyRecoveryRecords();
      if (cancelled) return;
      if (!result.ok) {
        setError("Recovery records are unavailable right now.");
        setRecords([]);
        return;
      }
      setRecords(result.records ?? []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const ordered = useMemo4(() => orderRecoveryRecords(records ?? []), [records]);
  const byType = useMemo4(
    () => new Map(ordered.map((record) => [record.recordType, record])),
    [ordered]
  );
  const readinessKnown = byType.has("highest_readiness_score");
  return /* @__PURE__ */ jsx7(
    "div",
    {
      role: "tabpanel",
      id: "recovery-panel-records",
      "aria-labelledby": "recovery-tab-records",
      "data-testid": "recovery-section-records",
      children: /* @__PURE__ */ jsxs7("div", { className: CARD3, children: [
        /* @__PURE__ */ jsx7("h2", { className: HEADING2, children: "Recovery records" }),
        /* @__PURE__ */ jsx7("p", { className: "mt-1 text-[11px] font-inter text-[#8C8C90]", children: "Your own historical bests, derived on the server from your saved check-ins and readiness days. They cannot be edited here and they change only when your own history does \u2014 they are not a ranking against other members." }),
        error ? /* @__PURE__ */ jsx7("div", { "data-testid": "recovery-records-error", children: /* @__PURE__ */ jsx7(
          SVJEmptyState,
          {
            variant: "error",
            compact: true,
            title: "Your records didn't load",
            description: "Recovery records are derived on the server from your own saved check-ins, so they can't be calculated without a connection.",
            action: /* @__PURE__ */ jsxs7(
              "button",
              {
                type: "button",
                className: BUTTON2,
                "data-testid": "recovery-records-retry",
                onClick: () => setAttempt((n) => n + 1),
                children: [
                  /* @__PURE__ */ jsx7(RefreshCw4, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                  "Retry"
                ]
              }
            )
          }
        ) }) : records === null ? /* @__PURE__ */ jsxs7(
          "p",
          {
            className: "mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]",
            "data-testid": "recovery-records-loading",
            children: [
              /* @__PURE__ */ jsx7(Loader24, { "aria-hidden": true, className: "h-4 w-4 animate-spin" }),
              "Loading your recovery records\u2026"
            ]
          }
        ) : /* @__PURE__ */ jsx7("ul", { className: "mt-3 space-y-2", "data-testid": "recovery-records-list", children: RECOVERY_RECORD_TYPES.map((recordType) => /* @__PURE__ */ jsx7(
          RecordCard,
          {
            recordType,
            record: byType.get(recordType) ?? null,
            readinessKnown
          },
          recordType
        )) }),
        !error && records !== null && /* @__PURE__ */ jsx7("p", { className: "mt-3 text-[10px] font-inter text-[#8C8C90]", children: "Server-derived. This screen grants no points, badges or streaks." })
      ] })
    }
  );
};
var RecoveryRecordsSection_default = RecoveryRecordsSection;

// src/app/components/recovery/RecoveryWeeklyDigest.tsx
import { useEffect as useEffect7, useMemo as useMemo5, useState as useState8 } from "react";
import {
  BedDouble,
  CalendarCheck,
  Dumbbell,
  Loader2 as Loader25,
  Minus,
  Moon as Moon3,
  RefreshCw as RefreshCw5,
  TrendingDown,
  TrendingUp as TrendingUp2
} from "lucide-react";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var CARD4 = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-4";
var HEADING3 = "font-inter text-[15px] font-semibold tracking-tight text-[#F4F2ED]";
var CAPTION2 = "text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]";
var ROW = "flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-black/30 px-3 py-2";
var BUTTON3 = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#17171A] px-4 text-xs font-inter font-semibold text-[#F4F2ED] transition-colors hover:bg-black/40 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A]";
var BAND_LABEL = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very high"
};
var TREND_ICON = {
  improving: TrendingUp2,
  declining: TrendingDown,
  stable: Minus,
  insufficient_data: Minus
};
var TrendIcon = ({ direction }) => {
  const Icon = TREND_ICON[direction];
  return /* @__PURE__ */ jsx8(Icon, { "aria-hidden": true, className: "mt-0.5 h-4 w-4 shrink-0 text-[#8C8C90]" });
};
var RecoveryWeeklyDigest = () => {
  const [history, setHistory] = useState8(null);
  const [error, setError] = useState8(null);
  const [attempt, setAttempt] = useState8(0);
  const { muscleRows, muscleAvailability } = useRecoveryInsights();
  useEffect7(() => {
    let cancelled = false;
    const load = async () => {
      setError(null);
      setHistory(null);
      const result = await listMyRecoveryHistory(14);
      if (cancelled) return;
      if (!result.ok) {
        setError("Your weekly recovery summary is unavailable right now.");
        setHistory([]);
        return;
      }
      setHistory(result.history ?? []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const digest = useMemo5(() => buildWeeklyRecoveryDigest(history ?? []), [history]);
  const muscleSummary = useMemo5(() => {
    if (muscleAvailability !== "ready") return null;
    const map = estimateMuscleRecovery(
      muscleRows.map((row) => ({
        muscle: row.muscle,
        directSets: row.directSets,
        supportingSets: row.supportingSets,
        directVolume: row.directVolume,
        lastTrainedDate: row.lastTrainedDate
      }))
    );
    const trained = map.entries.filter((entry) => entry.state !== "no_recent_data").length;
    return { trained, hasAnyData: map.hasAnyData };
  }, [muscleRows, muscleAvailability]);
  const hasMetrics = digest.state !== "insufficient" && digest.averageReadiness !== null && digest.windowDays > 0;
  return /* @__PURE__ */ jsx8(
    "div",
    {
      role: "tabpanel",
      id: "recovery-panel-progress",
      "aria-labelledby": "recovery-tab-progress",
      "data-testid": "recovery-section-progress",
      children: /* @__PURE__ */ jsxs8("div", { className: CARD4, children: [
        /* @__PURE__ */ jsx8("h2", { className: HEADING3, children: "Recovery this week" }),
        /* @__PURE__ */ jsx8("p", { className: "mt-1 text-[11px] font-inter text-[#8C8C90]", children: "A summary of your last seven recorded days, derived only from your own readiness, check-ins and training history. Missing days are never counted as zero." }),
        error ? /* @__PURE__ */ jsx8("div", { "data-testid": "recovery-weekly-error", children: /* @__PURE__ */ jsx8(
          SVJEmptyState,
          {
            variant: "error",
            compact: true,
            title: "Your weekly summary didn't load",
            description: "The digest is built from your last 14 days of check-ins and readiness, so it needs a connection to your account. Nothing is guessed in the meantime.",
            action: /* @__PURE__ */ jsxs8(
              "button",
              {
                type: "button",
                className: BUTTON3,
                "data-testid": "recovery-weekly-retry",
                onClick: () => setAttempt((n) => n + 1),
                children: [
                  /* @__PURE__ */ jsx8(RefreshCw5, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                  "Retry"
                ]
              }
            )
          }
        ) }) : history === null ? /* @__PURE__ */ jsxs8(
          "p",
          {
            role: "status",
            className: "mt-3 flex items-center gap-2 text-xs font-inter text-[#8C8C90]",
            "data-testid": "recovery-weekly-loading",
            children: [
              /* @__PURE__ */ jsx8(Loader25, { "aria-hidden": true, className: "h-4 w-4 animate-spin" }),
              "Loading your weekly recovery summary\u2026"
            ]
          }
        ) : !hasMetrics ? /* @__PURE__ */ jsx8(
          "p",
          {
            className: "mt-3 rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]",
            "data-testid": "recovery-weekly-insufficient",
            children: "Not enough recorded days yet to summarise this week. Save a recovery check-in on the Overview tab and your weekly picture will build from real data."
          }
        ) : /* @__PURE__ */ jsxs8("ul", { className: "mt-3 space-y-2", "data-testid": "recovery-weekly-metrics", children: [
          /* @__PURE__ */ jsxs8("li", { className: ROW, "data-testid": "recovery-weekly-average", children: [
            /* @__PURE__ */ jsx8("span", { className: "text-xs font-inter text-[#F4F2ED]", children: "Average readiness" }),
            /* @__PURE__ */ jsxs8("span", { className: "shrink-0 font-mono text-sm font-bold text-[#E62846]", children: [
              /* @__PURE__ */ jsxs8("span", { "aria-hidden": "true", children: [
                digest.averageReadiness,
                " / 100"
              ] }),
              /* @__PURE__ */ jsxs8("span", { className: "sr-only", children: [
                digest.averageReadiness,
                " out of 100"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs8("li", { className: ROW, "data-testid": "recovery-weekly-trend", children: [
            /* @__PURE__ */ jsxs8("span", { className: "flex items-start gap-2", children: [
              /* @__PURE__ */ jsx8(TrendIcon, { direction: digest.trend.direction }),
              /* @__PURE__ */ jsx8("span", { className: "text-xs font-inter text-[#F4F2ED]", children: digestTrendSentence(digest.trend) })
            ] }),
            digest.trend.samples > 0 && /* @__PURE__ */ jsxs8("span", { className: `${CAPTION2} shrink-0 text-right`, children: [
              digest.trend.samples,
              " recorded days"
            ] })
          ] }),
          /* @__PURE__ */ jsxs8("li", { className: ROW, "data-testid": "recovery-weekly-checkins", children: [
            /* @__PURE__ */ jsxs8("span", { className: "flex items-center gap-2 text-xs font-inter text-[#F4F2ED]", children: [
              /* @__PURE__ */ jsx8(CalendarCheck, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#8C8C90]" }),
              "Recovery check-ins"
            ] }),
            /* @__PURE__ */ jsxs8("span", { className: "shrink-0 font-mono text-sm text-[#F4F2ED]", children: [
              digest.checkinDays,
              " of ",
              digest.windowDays
            ] })
          ] }),
          /* @__PURE__ */ jsxs8("li", { className: ROW, "data-testid": "recovery-weekly-sleep", children: [
            /* @__PURE__ */ jsxs8("span", { className: "flex items-center gap-2 text-xs font-inter text-[#F4F2ED]", children: [
              /* @__PURE__ */ jsx8(BedDouble, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#8C8C90]" }),
              "Sleep logged"
            ] }),
            /* @__PURE__ */ jsx8("span", { className: "shrink-0 font-mono text-sm text-[#F4F2ED]", children: digest.sleepDays > 0 ? `${digest.sleepDays} ${digest.sleepDays === 1 ? "night" : "nights"}` : "No nights" })
          ] }),
          digest.restDaysLast3 !== null && /* @__PURE__ */ jsxs8("li", { className: ROW, "data-testid": "recovery-weekly-rest", children: [
            /* @__PURE__ */ jsxs8("span", { className: "flex items-center gap-2 text-xs font-inter text-[#F4F2ED]", children: [
              /* @__PURE__ */ jsx8(Moon3, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#8C8C90]" }),
              "Days without recorded training"
            ] }),
            /* @__PURE__ */ jsxs8("span", { className: "shrink-0 font-mono text-sm text-[#F4F2ED]", children: [
              digest.restDaysLast3,
              " of the last 3"
            ] })
          ] }),
          digest.loadBand !== null && /* @__PURE__ */ jsxs8("li", { className: ROW, "data-testid": "recovery-weekly-load", children: [
            /* @__PURE__ */ jsx8("span", { className: "text-xs font-inter text-[#F4F2ED]", children: "Training load" }),
            /* @__PURE__ */ jsx8("span", { className: "shrink-0 font-mono text-sm text-[#F4F2ED]", children: BAND_LABEL[digest.loadBand] })
          ] }),
          muscleSummary && /* @__PURE__ */ jsxs8("li", { className: ROW, "data-testid": "recovery-weekly-muscles", children: [
            /* @__PURE__ */ jsxs8("span", { className: "flex items-center gap-2 text-xs font-inter text-[#F4F2ED]", children: [
              /* @__PURE__ */ jsx8(Dumbbell, { "aria-hidden": true, className: "h-4 w-4 shrink-0 text-[#8C8C90]" }),
              "Strength training"
            ] }),
            /* @__PURE__ */ jsx8("span", { className: "shrink-0 font-mono text-sm text-[#F4F2ED]", children: muscleSummary.hasAnyData ? `${muscleSummary.trained} groups in 7 days` : "None in 7 days" })
          ] })
        ] }),
        !error && history !== null && hasMetrics && /* @__PURE__ */ jsx8("p", { className: "mt-3 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]", children: "Derived from your own recorded days \u2014 nothing is estimated or inferred." })
      ] })
    }
  );
};
var RecoveryWeeklyDigest_default = RecoveryWeeklyDigest;

// src/app/components/recovery/RestDayAlertCard.tsx
import { useState as useState9 } from "react";
import { HeartPulse as HeartPulse3, ShieldAlert, X } from "lucide-react";

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
function readStoredJson2(key, fallback) {
  const saved = appStorage.getItem(key);
  if (!saved) return fallback;
  try {
    return JSON.parse(saved);
  } catch {
    return fallback;
  }
}
function writeStoredJson2(key, value) {
  try {
    return appStorage.setItem(key, JSON.stringify(value));
  } catch {
    return { ok: false, error: STORAGE_ERROR };
  }
}

// src/app/components/recovery/RestDayAlertCard.tsx
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var REST_ALERT_DISMISS_KEY = "svj_recovery_rest_alert_dismissed_day";
var RestDayAlertCard = ({ readiness, onReviewPlan }) => {
  const today = dayKeyOffset(0);
  const [dismissedDay, setDismissedDay] = useState9(
    () => readStoredJson2(REST_ALERT_DISMISS_KEY, null)
  );
  const alert = restDayAlert(readiness);
  if (!alert.active || dismissedDay === today) return null;
  const handleDismiss = () => {
    setDismissedDay(today);
    writeStoredJson2(REST_ALERT_DISMISS_KEY, today);
  };
  return /* @__PURE__ */ jsxs9(
    "section",
    {
      role: "status",
      "aria-labelledby": "recovery-rest-alert-title",
      "data-testid": "recovery-rest-alert",
      className: "svj-radius-card svj-lit-top mb-3 border border-gold/40 bg-gradient-to-br from-[#2A1218] via-[#17171A] to-[#17171A] p-4",
      children: [
        /* @__PURE__ */ jsxs9("p", { className: "flex items-center gap-1.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-gold", children: [
          /* @__PURE__ */ jsx9(ShieldAlert, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
          "Recovery priority"
        ] }),
        /* @__PURE__ */ jsx9(
          "h2",
          {
            id: "recovery-rest-alert-title",
            className: "mt-1 font-inter text-base font-semibold tracking-tight text-[#F4F2ED]",
            children: alert.headline
          }
        ),
        /* @__PURE__ */ jsx9("ul", { className: "mt-2 space-y-1", "data-testid": "recovery-rest-alert-evidence", children: alert.evidence.map((line) => /* @__PURE__ */ jsxs9("li", { className: "flex gap-2 text-xs font-inter leading-relaxed text-[#B8B8C0]", children: [
          /* @__PURE__ */ jsx9("span", { "aria-hidden": true, className: "mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" }),
          /* @__PURE__ */ jsx9("span", { children: line })
        ] }, line)) }),
        /* @__PURE__ */ jsx9("p", { className: "mt-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]", children: alert.suggestion }),
        /* @__PURE__ */ jsxs9("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [
          onReviewPlan && /* @__PURE__ */ jsxs9(
            "button",
            {
              type: "button",
              onClick: onReviewPlan,
              "data-testid": "recovery-rest-alert-plan",
              className: "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 text-xs font-inter font-semibold text-gold transition-colors hover:bg-gold/20 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
              children: [
                /* @__PURE__ */ jsx9(HeartPulse3, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                "Review today's plan"
              ]
            }
          ),
          /* @__PURE__ */ jsxs9(
            "button",
            {
              type: "button",
              onClick: handleDismiss,
              "data-testid": "recovery-rest-alert-dismiss",
              "aria-label": "Dismiss the recovery priority alert for today",
              className: "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/10 px-4 text-xs font-inter font-semibold text-[#8C8C90] transition-colors hover:text-[#F4F2ED] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
              children: [
                /* @__PURE__ */ jsx9(X, { "aria-hidden": true, className: "h-3.5 w-3.5" }),
                "Dismiss"
              ]
            }
          )
        ] })
      ]
    }
  );
};

// src/app/components/ReadinessHistoryProvider.tsx
import { useMemo as useMemo6, useState as useState10 } from "react";
import { jsx as jsx10 } from "react/jsx-runtime";
var ReadinessHistoryProvider = ({ children }) => {
  const [shared, setShared] = useState10(null);
  const value = useMemo6(
    () => ({
      today: shared?.today,
      dayHistory: shared?.dayHistory,
      historyPoints: shared?.historyPoints,
      publish: setShared
    }),
    [shared]
  );
  return /* @__PURE__ */ jsx10(ReadinessHistoryContext.Provider, { value, children });
};

// src/app/components/recovery/RecoveryInsightsWidgets.tsx
import { Flame, RefreshCw as RefreshCw6, Sparkles as Sparkles2, TriangleAlert as TriangleAlert2 } from "lucide-react";

// src/app/components/recovery/MuscleBodyMap.tsx
import { jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
var STATE_FILL = {
  high: "#F43F5E",
  moderate: "#EAB308",
  fresh: "#10B981",
  no_recent_data: "#2A2A31"
};
var STATE_OPACITY = {
  high: 0.92,
  moderate: 0.8,
  fresh: 0.72,
  no_recent_data: 0.55
};
var FRONT_REGIONS = [
  { muscle: "shoulders", x: 22, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "shoulders", x: 82, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "chest", x: 40, y: 44, w: 40, h: 22, r: 9 },
  { muscle: "biceps", x: 20, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "biceps", x: 86, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "core", x: 42, y: 70, w: 36, h: 30, r: 8 },
  { muscle: "quads", x: 42, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "quads", x: 61, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "calves", x: 44, y: 160, w: 13, h: 34, r: 6 },
  { muscle: "calves", x: 63, y: 160, w: 13, h: 34, r: 6 }
];
var BACK_REGIONS = [
  { muscle: "shoulders", x: 22, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "shoulders", x: 82, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "back", x: 40, y: 44, w: 40, h: 24, r: 9 },
  { muscle: "triceps", x: 20, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "triceps", x: 86, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "back", x: 42, y: 70, w: 36, h: 14, r: 6 },
  { muscle: "glutes", x: 42, y: 88, w: 36, h: 18, r: 8 },
  { muscle: "hamstrings", x: 42, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "hamstrings", x: 61, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "calves", x: 44, y: 160, w: 13, h: 34, r: 6 },
  { muscle: "calves", x: 63, y: 160, w: 13, h: 34, r: 6 }
];
var Figure = ({ label, regions, stateFor }) => /* @__PURE__ */ jsxs10("div", { className: "flex flex-col items-center gap-1.5", children: [
  /* @__PURE__ */ jsxs10(
    "svg",
    {
      viewBox: "0 0 120 200",
      className: "h-44 w-auto",
      role: "presentation",
      "aria-hidden": "true",
      focusable: "false",
      children: [
        /* @__PURE__ */ jsxs10("g", { fill: "#1B1B20", stroke: "rgba(255,255,255,0.07)", strokeWidth: "1", children: [
          /* @__PURE__ */ jsx11("circle", { cx: "60", cy: "16", r: "12" }),
          /* @__PURE__ */ jsx11("rect", { x: "38", y: "32", width: "44", height: "52", rx: "13" }),
          /* @__PURE__ */ jsx11("rect", { x: "40", y: "84", width: "40", height: "22", rx: "9" }),
          /* @__PURE__ */ jsx11("rect", { x: "42", y: "106", width: "17", height: "48", rx: "8" }),
          /* @__PURE__ */ jsx11("rect", { x: "61", y: "106", width: "17", height: "48", rx: "8" }),
          /* @__PURE__ */ jsx11("rect", { x: "44", y: "158", width: "13", height: "36", rx: "6" }),
          /* @__PURE__ */ jsx11("rect", { x: "63", y: "158", width: "13", height: "36", rx: "6" }),
          /* @__PURE__ */ jsx11("rect", { x: "20", y: "40", width: "14", height: "50", rx: "7" }),
          /* @__PURE__ */ jsx11("rect", { x: "86", y: "40", width: "14", height: "50", rx: "7" })
        ] }),
        regions.map((region, index) => {
          const state = stateFor(region.muscle);
          const fill = state ? STATE_FILL[state] : "#24242B";
          const opacity = state ? STATE_OPACITY[state] : 0.9;
          return /* @__PURE__ */ jsx11(
            "rect",
            {
              x: region.x,
              y: region.y,
              width: region.w,
              height: region.h,
              rx: region.r ?? 6,
              fill,
              opacity,
              stroke: "rgba(255,255,255,0.10)",
              strokeWidth: "1"
            },
            `${region.muscle}-${index}`
          );
        })
      ]
    }
  ),
  /* @__PURE__ */ jsx11("span", { className: "font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]", children: label })
] });
var MuscleBodyMap = ({ entries, className = "" }) => {
  const byMuscle = new Map(entries.map((entry) => [entry.muscle, entry.state]));
  const stateFor = (muscle) => byMuscle.get(muscle) ?? null;
  const drawsOnBody = new Set([...FRONT_REGIONS, ...BACK_REGIONS].map((r) => r.muscle));
  const offBody = entries.filter((entry) => !drawsOnBody.has(entry.muscle));
  const legend = [
    { state: "high", text: "Trained recently" },
    { state: "moderate", text: "Still recovering" },
    { state: "fresh", text: "Recovered" },
    { state: "no_recent_data", text: "No logged training" }
  ];
  return /* @__PURE__ */ jsxs10("div", { className, children: [
    /* @__PURE__ */ jsxs10("div", { className: "flex items-start justify-center gap-4 sm:gap-8", children: [
      /* @__PURE__ */ jsx11(Figure, { label: "Front", regions: FRONT_REGIONS, stateFor }),
      /* @__PURE__ */ jsx11(Figure, { label: "Back", regions: BACK_REGIONS, stateFor })
    ] }),
    offBody.length > 0 && /* @__PURE__ */ jsx11("div", { className: "mt-3 flex flex-wrap justify-center gap-1.5", children: offBody.map((entry) => /* @__PURE__ */ jsxs10(
      "span",
      {
        className: "inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-inter text-[10px] text-[#8C8C90]",
        children: [
          /* @__PURE__ */ jsx11(
            "span",
            {
              "aria-hidden": true,
              className: "h-2 w-2 rounded-full",
              style: { background: STATE_FILL[entry.state] }
            }
          ),
          entry.label
        ]
      },
      entry.muscle
    )) }),
    /* @__PURE__ */ jsx11("div", { className: "mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5", children: legend.map((item) => /* @__PURE__ */ jsxs10(
      "span",
      {
        className: "inline-flex items-center gap-1.5 font-inter text-[10px] text-[#8C8C90]",
        children: [
          /* @__PURE__ */ jsx11(
            "span",
            {
              "aria-hidden": true,
              className: "h-2 w-2 rounded-full",
              style: { background: STATE_FILL[item.state] }
            }
          ),
          item.text
        ]
      },
      item.state
    )) })
  ] });
};

// src/app/components/recovery/RecoveryInsightsWidgets.tsx
import { Fragment as Fragment5, jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
var CARD5 = "rounded-2xl border border-white/5 bg-[#0B0B0C] p-3.5 mb-2.5";
var CARD_TITLE = "text-[11px] font-inter font-semibold text-[#8C8C90]";
var STATE_COLORS = {
  fresh: "text-emerald-400",
  moderate: "text-gold",
  high: "text-[#C81E3A]",
  no_recent_data: "text-[#8C8C90]"
};
var STATE_SWATCH = {
  fresh: "bg-emerald-400",
  moderate: "bg-gold",
  high: "bg-[#C81E3A]",
  no_recent_data: "bg-[#8C8C90]"
};
var FocusEmphasisStyles = {
  rest: "border-gold/30 bg-gold/10 text-gold",
  lighter: "border-gold/20 bg-gold/5 text-gold",
  normal: "border-white/10 bg-black/30 text-[#F4F2ED]",
  stronger: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
};
var TodaysFocusCard = ({ readiness, trainingGoal, goals }) => {
  const activityGoal = applicableActivityGoals(
    goals.map((g) => ({
      status: g.status,
      periodStart: g.periodStart,
      periodEnd: g.periodEnd,
      metric: g.metric,
      progress: g.progress,
      targetValue: g.targetValue
    }))
  );
  const focus = todaysFocus({ readiness, trainingGoal, activityGoal });
  return /* @__PURE__ */ jsxs11("div", { className: CARD5, "data-testid": "recovery-focus", children: [
    /* @__PURE__ */ jsxs11("p", { className: `mb-1.5 flex items-center gap-1.5 ${CARD_TITLE}`, children: [
      /* @__PURE__ */ jsx12(Sparkles2, { "aria-hidden": true, className: "h-3 w-3 text-[#C81E3A]" }),
      " Today's focus"
    ] }),
    /* @__PURE__ */ jsx12("h2", { className: "font-anton text-lg tracking-wide text-[#F4F2ED]", children: focus.headline }),
    /* @__PURE__ */ jsx12(
      "p",
      {
        className: `mt-1.5 rounded-xl border px-3 py-2 text-xs font-inter leading-relaxed ${FocusEmphasisStyles[focus.emphasis] ?? FocusEmphasisStyles.normal}`,
        children: focus.detail
      }
    )
  ] });
};
var RecoveryStreakCard = ({ history }) => {
  const streak = recoveryCheckinStreak(history);
  return /* @__PURE__ */ jsxs11("div", { className: CARD5, "data-testid": "recovery-streak", children: [
    /* @__PURE__ */ jsx12("p", { className: `mb-2 ${CARD_TITLE}`, children: "Check-in streak" }),
    /* @__PURE__ */ jsxs11("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxs11(
        "span",
        {
          "data-testid": "recovery-streak-count",
          className: "flex items-center gap-1.5 rounded-full border border-gold/20 bg-[#17171A] px-3 py-1.5 font-mono text-sm font-medium text-[#F4F2ED]",
          children: [
            /* @__PURE__ */ jsx12(Flame, { "aria-hidden": true, className: "h-4 w-4 text-gold fill-gold/30" }),
            streak,
            "d"
          ]
        }
      ),
      /* @__PURE__ */ jsx12("p", { className: "text-[11px] font-inter leading-snug text-[#8C8C90]", children: streak > 0 ? `Consecutive days with a saved recovery check-in. A missed day resets it.` : "No check-ins yet \u2014 save today's check-in to start your streak." })
    ] })
  ] });
};
var MuscleRecoveryCard = ({ rows, availability }) => {
  if (availability === "loading") {
    return /* @__PURE__ */ jsxs11("div", { className: CARD5, "data-testid": "recovery-muscles", children: [
      /* @__PURE__ */ jsx12(MuscleCardHeader, {}),
      /* @__PURE__ */ jsx12(
        "p",
        {
          role: "status",
          className: "py-4 text-center text-[11px] font-mono uppercase text-[#8C8C90]",
          children: "Loading muscle history\u2026"
        }
      )
    ] });
  }
  if (availability === "unavailable") {
    return /* @__PURE__ */ jsxs11("div", { className: CARD5, "data-testid": "recovery-muscles", children: [
      /* @__PURE__ */ jsx12(MuscleCardHeader, {}),
      /* @__PURE__ */ jsx12(
        "p",
        {
          role: "status",
          "data-testid": "recovery-muscles-unavailable",
          className: "rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] font-inter leading-relaxed text-[#8C8C90]",
          children: "Muscle recovery data isn't available on this deployment yet. Everything else in Recovery keeps working."
        }
      )
    ] });
  }
  if (availability === "error") {
    return /* @__PURE__ */ jsxs11("div", { className: CARD5, "data-testid": "recovery-muscles", children: [
      /* @__PURE__ */ jsx12(MuscleCardHeader, {}),
      /* @__PURE__ */ jsx12(
        "p",
        {
          role: "status",
          "data-testid": "recovery-muscles-error",
          className: "rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-[11px] font-inter text-gold",
          children: "Muscle history could not be loaded right now. Retry below \u2014 nothing here is estimated without data."
        }
      )
    ] });
  }
  const map = estimateMuscleRecovery(
    rows.map((row) => ({
      muscle: row.muscle,
      directSets: row.directSets,
      supportingSets: row.supportingSets,
      directVolume: row.directVolume,
      lastTrainedDate: row.lastTrainedDate
    }))
  );
  return /* @__PURE__ */ jsxs11("div", { className: CARD5, "data-testid": "recovery-muscles", children: [
    /* @__PURE__ */ jsx12(MuscleCardHeader, {}),
    !map.hasAnyData ? /* @__PURE__ */ jsx12("p", { className: "py-3 text-center text-[11px] font-inter text-[#8C8C90]", children: "No muscle data yet \u2014 complete a structured strength session." }) : /* @__PURE__ */ jsxs11(Fragment5, { children: [
      /* @__PURE__ */ jsx12(
        MuscleBodyMap,
        {
          entries: map.entries.map((entry) => ({
            muscle: entry.muscle,
            label: entry.label,
            state: entry.state
          })),
          className: "mb-3"
        }
      ),
      /* @__PURE__ */ jsx12("ul", { className: "grid grid-cols-1 gap-2 sm:grid-cols-2", "data-testid": "recovery-muscle-list", children: map.entries.map((entry) => /* @__PURE__ */ jsxs11(
        "li",
        {
          "data-testid": `muscle-${entry.muscle}`,
          className: "flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2",
          children: [
            /* @__PURE__ */ jsxs11("span", { className: "flex min-w-0 items-center gap-2", children: [
              /* @__PURE__ */ jsx12(
                "span",
                {
                  "aria-hidden": true,
                  className: `h-2.5 w-2.5 shrink-0 rounded-full ${STATE_SWATCH[entry.state]}`
                }
              ),
              /* @__PURE__ */ jsx12("span", { className: "truncate text-xs font-inter text-[#F4F2ED]", children: entry.label })
            ] }),
            /* @__PURE__ */ jsxs11(
              "span",
              {
                className: `shrink-0 font-inter text-[10px] font-semibold ${STATE_COLORS[entry.state] ?? "text-[#8C8C90]"}`,
                children: [
                  muscleRecoveryStateLabel(entry.state),
                  /* @__PURE__ */ jsxs11("span", { className: "sr-only", children: [
                    " \u2014 ",
                    entry.reason
                  ] })
                ]
              }
            )
          ]
        },
        entry.muscle
      )) })
    ] }),
    /* @__PURE__ */ jsx12("p", { className: "mt-2 text-[10px] font-inter text-[#8C8C90]", children: "Estimated from recent training history \u2014 not a medical or sensor measurement." }),
    map.hasAnyData && /* @__PURE__ */ jsx12("ul", { className: "sr-only", "data-testid": "recovery-muscle-text", children: map.entries.map((entry) => /* @__PURE__ */ jsxs11("li", { children: [
      entry.label,
      ": ",
      muscleRecoveryStateLabel(entry.state),
      ". ",
      entry.reason
    ] }, entry.muscle)) })
  ] });
};
var MuscleCardHeader = () => /* @__PURE__ */ jsx12("p", { className: `mb-2 ${CARD_TITLE}`, children: "Estimated muscle recovery" });

// src/app/components/RecoveryView.tsx
import { Fragment as Fragment6, jsx as jsx13, jsxs as jsxs12 } from "react/jsx-runtime";
var UpcomingSection = ({ section, title, summary, points }) => /* @__PURE__ */ jsxs12(
  "div",
  {
    role: "tabpanel",
    id: `recovery-panel-${section}`,
    "aria-labelledby": `recovery-tab-${section}`,
    "data-testid": `recovery-section-${section}`,
    className: "svj-radius-card svj-lit-top border border-white/[0.06] bg-[#17171A] p-5",
    children: [
      /* @__PURE__ */ jsx13("p", { className: "font-inter text-[11px] font-semibold text-[#8C8C90]", children: "Coming next" }),
      /* @__PURE__ */ jsx13("h2", { className: "mt-1 font-inter text-base font-semibold tracking-tight text-[#F4F2ED]", children: title }),
      /* @__PURE__ */ jsx13("p", { className: "mt-2 font-inter text-xs leading-relaxed text-[#8C8C90]", children: summary }),
      /* @__PURE__ */ jsx13("ul", { className: "mt-3 space-y-1.5", children: points.map((point) => /* @__PURE__ */ jsxs12("li", { className: "flex gap-2 font-inter text-[11px] text-[#A6A6AD]", children: [
        /* @__PURE__ */ jsx13("span", { "aria-hidden": true, className: "mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#C81E3A]" }),
        /* @__PURE__ */ jsx13("span", { children: point })
      ] }, point)) }),
      /* @__PURE__ */ jsx13("p", { className: "mt-4 svj-radius-row border border-white/[0.06] bg-[#08080A] px-3 py-2 font-inter text-[11px] leading-relaxed text-[#8C8C90]", children: "Nothing is shown here yet because SVJ only displays recovery data it can actually derive from your recorded activity, check-ins and completed tasks." })
    ]
  }
);
var OverviewWithInsights = ({ onOpenPlan }) => {
  const { goals, trainingProfile, muscleRows, muscleAvailability } = useRecoveryInsights();
  const shared = useTrainRecoveryShared();
  return /* @__PURE__ */ jsxs12(Fragment6, { children: [
    /* @__PURE__ */ jsxs12("div", { className: "grid items-start gap-x-3 xl:grid-cols-2", children: [
      shared?.today && /* @__PURE__ */ jsxs12(Fragment6, { children: [
        /* @__PURE__ */ jsx13(RestDayAlertCard, { readiness: shared.today, onReviewPlan: onOpenPlan }),
        /* @__PURE__ */ jsx13(
          TodaysFocusCard,
          {
            readiness: shared.today,
            trainingGoal: trainingProfile.goal,
            goals
          }
        )
      ] }),
      shared?.historyPoints && /* @__PURE__ */ jsx13(RecoveryStreakCard, { history: shared.historyPoints })
    ] }),
    /* @__PURE__ */ jsx13(TrainRecovery, {}),
    /* @__PURE__ */ jsx13(MuscleRecoveryCard, { rows: muscleRows, availability: muscleAvailability })
  ] });
};
var RecoveryView = ({ onOpenPlan }) => {
  const [section, setSection] = useState11("overview");
  const tabRefs = useRef2({});
  const handleKeyDown = useCallback5(
    (event) => {
      const ids = RECOVERY_SECTIONS.map((s) => s.id);
      const current = ids.indexOf(section);
      let next = -1;
      if (event.key === "ArrowRight") next = (current + 1) % ids.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + ids.length) % ids.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = ids.length - 1;
      else return;
      event.preventDefault();
      const target = ids[next];
      setSection(target);
      tabRefs.current[target]?.focus();
    },
    [section]
  );
  return /* @__PURE__ */ jsxs12("div", { className: "space-y-3", "data-testid": "recovery-view", children: [
    /* @__PURE__ */ jsx13("div", { className: "svj-radius-card svj-lit-top svj-elev-2 border border-white/[0.06] bg-[#17171A] p-3.5", children: /* @__PURE__ */ jsxs12("div", { className: "flex items-center gap-2.5", children: [
      /* @__PURE__ */ jsx13("div", { className: "flex h-9 w-9 shrink-0 items-center justify-center svj-radius-row border border-[#C81E3A]/40 bg-[#C81E3A]/15", children: /* @__PURE__ */ jsx13(HeartPulse4, { "aria-hidden": true, className: "h-4 w-4 text-[#E62846]" }) }),
      /* @__PURE__ */ jsxs12("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx13("h1", { className: "font-anton text-xl tracking-wide text-[#F4F2ED] sm:text-2xl", children: "Recovery" }),
        /* @__PURE__ */ jsx13("p", { className: "font-inter text-[11px] text-[#8C8C90]", children: "Readiness, sleep and training load, derived from your own data." })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx13(
      "div",
      {
        role: "tablist",
        "aria-label": "Recovery sections",
        onKeyDown: handleKeyDown,
        "data-testid": "recovery-sections",
        className: "flex gap-2 overflow-x-auto pb-1",
        children: RECOVERY_SECTIONS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return /* @__PURE__ */ jsxs12(
            "button",
            {
              ref: (node) => {
                tabRefs.current[item.id] = node;
              },
              type: "button",
              role: "tab",
              id: `recovery-tab-${item.id}`,
              "aria-selected": active,
              "aria-controls": `recovery-panel-${item.id}`,
              tabIndex: active ? 0 : -1,
              "data-testid": `recovery-section-tab-${item.id}`,
              onClick: () => setSection(item.id),
              className: `flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 svj-radius-row border px-2.5 py-2 font-inter text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C81E3A] lg:min-h-0 ${active ? "border-[#C81E3A]/50 bg-[#C81E3A]/15 text-[#F4F2ED]" : "border-white/[0.08] bg-[#17171A] text-[#8C8C90] hover:text-[#F4F2ED]"}`,
              children: [
                /* @__PURE__ */ jsx13(Icon, { "aria-hidden": true, className: "h-4 w-4" }),
                item.label,
                active && /* @__PURE__ */ jsx13("span", { className: "sr-only", children: "(selected)" })
              ]
            },
            item.id
          );
        })
      }
    ),
    section === "overview" && /* @__PURE__ */ jsx13(
      "div",
      {
        role: "tabpanel",
        id: "recovery-panel-overview",
        "aria-labelledby": "recovery-tab-overview",
        "data-testid": "recovery-section-overview",
        children: /* @__PURE__ */ jsx13(ReadinessHistoryProvider, { children: /* @__PURE__ */ jsx13(OverviewWithInsights, { onOpenPlan }) })
      }
    ),
    section === "history" && /* @__PURE__ */ jsx13(RecoveryHistorySection_default, {}),
    section === "goals" && /* @__PURE__ */ jsx13(RecoveryGoalsSection_default, {}),
    section === "records" && /* @__PURE__ */ jsx13(RecoveryRecordsSection_default, {}),
    section === "progress" && /* @__PURE__ */ jsx13(RecoveryWeeklyDigest_default, {}),
    section === "devices" && /* @__PURE__ */ jsxs12(
      "div",
      {
        role: "tabpanel",
        id: "recovery-panel-devices",
        "aria-labelledby": "recovery-tab-devices",
        className: "space-y-3",
        children: [
          /* @__PURE__ */ jsx13(
            UpcomingSection,
            {
              section: "devices",
              title: "Devices",
              summary: "Future recovery and sleep data sources. Nothing is connected yet, and SVJ will only report a device once it can genuinely read from it.",
              points: [
                "Android Health Connect \u2014 steps, sleep and heart rate",
                "Wear OS health data and companion apps",
                "Dedicated sleep trackers",
                "Heart rate / HRV sources for recovery signals"
              ]
            }
          ),
          /* @__PURE__ */ jsx13(
            "p",
            {
              role: "status",
              "data-testid": "recovery-devices-status",
              className: "svj-radius-row border border-white/[0.06] bg-[#08080A] px-4 py-3 font-inter text-[11px] text-[#8C8C90]",
              children: "No device is connected."
            }
          )
        ]
      }
    )
  ] });
};
export {
  RecoveryView,
  TrainRecovery
};
