import { Capacitor, registerPlugin } from "@capacitor/core";
import { appStorage } from "./storage";

export type NotificationChannel = "progress" | "coach" | "membership";
export type NotificationTarget = "challenges" | "activity" | "nutrition" | "profile" | "earn";

export interface NotificationPreferences {
  enabled: boolean;
  dailyPlan: boolean;
  eveningCoach: boolean;
  streakRisk: boolean;
  earnPlus: boolean;
  recovery: boolean;
  nutrition: boolean;
  training: boolean;
  /** Server-driven plan session reminders (one per scheduled day). */
  trainingSession: boolean;
  /** "HH:mm" local time for the plan session reminder. */
  trainingTime: string;
  inactivity: boolean;
  membership: boolean;
  weeklyRecap: boolean;
  morningTime: string;
  eveningTime: string;
  recoveryTime: string;
  nutritionTime: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  dailyPlan: true,
  eveningCoach: true,
  streakRisk: true,
  earnPlus: true,
  recovery: true,
  nutrition: false,
  training: false,
  trainingSession: true,
  trainingTime: "17:30",
  inactivity: true,
  membership: true,
  weeklyRecap: true,
  morningTime: "08:00",
  eveningTime: "19:30",
  recoveryTime: "21:30",
  nutritionTime: "13:30",
};

/** Quiet hours: no notification may be delivered in this window. */
export const QUIET_HOURS_START_HOUR = 22;
export const QUIET_HOURS_END_HOUR = 7;

/** True when the given local time falls inside the quiet-hours window. */
export function isWithinQuietHours(date: Date): boolean {
  const hour = date.getHours();
  return hour >= QUIET_HOURS_START_HOUR || hour < QUIET_HOURS_END_HOUR;
}

/**
 * Clamp a preferred "HH:mm" to the first allowed minute outside quiet hours.
 * A 23:00 preference therefore delivers at 07:00, never during the night.
 */
export function clampOutOfQuietHours(hhmm: string): { hour: number; minute: number } {
  const [hour, minute] = hhmm.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return { hour: 17, minute: 30 };
  }
  if (hour >= QUIET_HOURS_START_HOUR || hour < QUIET_HOURS_END_HOUR) {
    return { hour: QUIET_HOURS_END_HOUR, minute: 0 };
  }
  return { hour, minute };
}

export interface NativeNotificationSchedule {
  id: number;
  title: string;
  body: string;
  triggerAt: number;
  repeatDays?: number;
  channel: NotificationChannel;
  target: NotificationTarget;
}

export interface TrainingPlanDay {
  /** ISO local date (YYYY-MM-DD) the session is scheduled for. */
  date: string;
  /** Session title when the caller has one; never invented here. */
  title?: string | null;
}

export interface NotificationPlannerInput {
  now: Date;
  firstName: string;
  completedTasks: number;
  totalTasks: number;
  currentStreak: number;
  weeklyXp: number;
  mealsLoggedToday: number;
  lastWorkoutAt?: string | null;
  lastProgressAt?: string | null;
  plusExpiresAt?: string | null;
  /** Upcoming server-driven plan days (null when no plan is loaded). */
  trainingPlanDays?: TrainingPlanDay[] | null;
  earnPlus?: {
    qualifyingDays: number;
    requiredQualifyingDays: number;
    rewardXp: number;
    rewardXpCost: number;
  } | null;
}

interface VjNotificationsPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  openSettings(): Promise<void>;
  replaceSchedules(options: {
    schedules: NativeNotificationSchedule[];
  }): Promise<{ scheduled: number }>;
  cancelAll(): Promise<void>;
  notifyNow(options: {
    id: number;
    title: string;
    body: string;
    channel: NotificationChannel;
    target: NotificationTarget;
  }): Promise<void>;
}

const VjNotifications = registerPlugin<VjNotificationsPlugin>("VjNotifications");
const PREFS_PREFIX = "svj_notification_preferences_v1:";
const EVENT_NAME = "svj-notification-preferences";

function preferenceKey(userId: string) {
  return PREFS_PREFIX + (userId || "anonymous");
}

function validTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return fallback;
  return value;
}

export function loadNotificationPreferences(userId: string): NotificationPreferences {
  const raw = appStorage.getItem(preferenceKey(userId));
  if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parsed,
      morningTime: validTime(parsed.morningTime, DEFAULT_NOTIFICATION_PREFERENCES.morningTime),
      eveningTime: validTime(parsed.eveningTime, DEFAULT_NOTIFICATION_PREFERENCES.eveningTime),
      recoveryTime: validTime(parsed.recoveryTime, DEFAULT_NOTIFICATION_PREFERENCES.recoveryTime),
      nutritionTime: validTime(
        parsed.nutritionTime,
        DEFAULT_NOTIFICATION_PREFERENCES.nutritionTime,
      ),
      trainingTime: validTime(parsed.trainingTime, DEFAULT_NOTIFICATION_PREFERENCES.trainingTime),
      trainingSession:
        typeof parsed.trainingSession === "boolean"
          ? parsed.trainingSession
          : DEFAULT_NOTIFICATION_PREFERENCES.trainingSession,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function saveNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): boolean {
  const result = appStorage.setItem(preferenceKey(userId), JSON.stringify(preferences));
  if (!result.ok) return false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { userId, preferences } }));
  }
  return true;
}

export function subscribeNotificationPreferences(
  userId: string,
  listener: (preferences: NotificationPreferences) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      { userId?: string; preferences?: NotificationPreferences } | undefined;
    if (detail?.userId === userId && detail.preferences) listener(detail.preferences);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

function nextTime(now: Date, hhmm: string): Date {
  const [hour, minute] = hhmm.split(":").map(Number);
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}

function nextWeekday(now: Date, weekday: number, hour: number, minute: number): Date {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  let add = (weekday - target.getDay() + 7) % 7;
  if (add === 0 && target.getTime() <= now.getTime()) add = 7;
  target.setDate(target.getDate() + add);
  return target;
}

function beforeExpiry(expiry: Date, daysBefore: number, now: Date): Date | null {
  const target = new Date(expiry.getTime() - daysBefore * 86_400_000);
  target.setHours(10, 0, 0, 0);
  return target.getTime() > now.getTime() ? target : null;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function latestDateFromDayKey(value?: string | null): Date | null {
  const d = parseDate(value);
  if (d) return d;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function buildNotificationPlan(
  input: NotificationPlannerInput,
  prefs: NotificationPreferences,
): NativeNotificationSchedule[] {
  if (!prefs.enabled) return [];
  const now = input.now;
  const schedules: NativeNotificationSchedule[] = [];
  const remaining = Math.max(0, input.totalTasks - input.completedTasks);
  const name = input.firstName.trim() || "Voyager";

  if (prefs.dailyPlan) {
    schedules.push({
      id: 101,
      title: `Your day is ready, ${name}`,
      body:
        input.totalTasks > 0
          ? `${input.totalTasks} tasks are ready. Start with one clear win.`
          : "Open SVJ and set one meaningful target for today.",
      triggerAt: nextTime(now, prefs.morningTime).getTime(),
      repeatDays: 1,
      channel: "coach",
      target: "challenges",
    });
  }

  if (prefs.eveningCoach && remaining > 0) {
    let body = `${input.completedTasks}/${input.totalTasks} tasks complete — ${remaining} left today.`;
    if (prefs.streakRisk && input.currentStreak > 0) {
      body = `Your ${input.currentStreak}-day streak is still alive. ${remaining} task${remaining === 1 ? "" : "s"} left today.`;
    } else if (
      prefs.earnPlus &&
      input.earnPlus &&
      input.earnPlus.qualifyingDays < input.earnPlus.requiredQualifyingDays
    ) {
      body = `Earn Plus: ${input.earnPlus.qualifyingDays}/${input.earnPlus.requiredQualifyingDays} qualifying days. Finish a meaningful mission today.`;
    }
    schedules.push({
      id: 102,
      title: "Finish the day strong",
      body,
      triggerAt: nextTime(now, prefs.eveningTime).getTime(),
      repeatDays: 1,
      channel: "coach",
      target: "challenges",
    });
  }

  if (prefs.recovery) {
    schedules.push({
      id: 103,
      title: "30-second recovery check-in",
      body: "Log sleep, energy and soreness so tomorrow's training advice stays personal.",
      triggerAt: nextTime(now, prefs.recoveryTime).getTime(),
      repeatDays: 1,
      channel: "coach",
      target: "activity",
    });
  }

  if (prefs.nutrition && input.mealsLoggedToday === 0) {
    schedules.push({
      id: 104,
      title: "Fuel check",
      body: "Nothing logged yet today. Add your first meal so your nutrition picture stays accurate.",
      triggerAt: nextTime(now, prefs.nutritionTime).getTime(),
      repeatDays: 1,
      channel: "coach",
      target: "nutrition",
    });
  }

  if (prefs.weeklyRecap) {
    schedules.push({
      id: 105,
      title: "Your SVJ week",
      body: `You have ${input.weeklyXp.toLocaleString()} XP this week. Review what moved and set the next priority.`,
      triggerAt: nextWeekday(now, 0, 18, 0).getTime(),
      repeatDays: 7,
      channel: "progress",
      target: "profile",
    });
  }

  if (prefs.inactivity) {
    const last = latestDateFromDayKey(input.lastProgressAt);
    if (last) {
      const at = new Date(last.getTime() + 48 * 60 * 60 * 1000);
      at.setHours(18, 30, 0, 0);
      if (at.getTime() > now.getTime()) {
        schedules.push({
          id: 106,
          title: "Don't let momentum disappear",
          body: "Two quiet days can become a week quickly. Log one real action and keep your progress current.",
          triggerAt: at.getTime(),
          channel: "progress",
          target: "challenges",
        });
      }
    }
  }

  if (prefs.training) {
    const last = parseDate(input.lastWorkoutAt);
    if (last) {
      const at = new Date(last.getTime() + 72 * 60 * 60 * 1000);
      at.setHours(17, 30, 0, 0);
      if (at.getTime() > now.getTime()) {
        schedules.push({
          id: 107,
          title: "Training gap detected",
          body: "No strength session has been logged for 3 days. Train if recovery and your plan allow it.",
          triggerAt: at.getTime(),
          channel: "coach",
          target: "activity",
        });
      }
    }
  }

  // 108: automated training session day reminder — one per scheduled plan
  // day, at the preferred time, never inside quiet hours, only while a plan
  // is actually loaded. A notification is only a reminder: it never marks a
  // workout performed or finalizes a plan slot.
  if (prefs.trainingSession && Array.isArray(input.trainingPlanDays)) {
    const preferred = clampOutOfQuietHours(prefs.trainingTime);
    const seenDays = new Set<string>();
    for (const day of input.trainingPlanDays) {
      if (!day || typeof day.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue;
      if (seenDays.has(day.date)) continue; // deduplicated: one per session day
      seenDays.add(day.date);
      const triggerAt = new Date(
        Date.parse(
          `${day.date}T${String(preferred.hour).padStart(2, "0")}:${String(preferred.minute).padStart(2, "0")}:00`,
        ),
      );
      if (Number.isNaN(triggerAt.getTime())) continue;
      if (triggerAt.getTime() <= now.getTime()) continue; // already past today
      if (isWithinQuietHours(triggerAt)) continue; // never deliver at night
      schedules.push({
        id: 108,
        title: "Training session today",
        body: day.title
          ? `${day.title} is scheduled for today.`
          : "Your scheduled training session is today.",
        triggerAt: triggerAt.getTime(),
        channel: "coach",
        target: "activity",
      });
    }
  }

  if (prefs.membership) {
    const expiry = parseDate(input.plusExpiresAt);
    if (expiry) {
      for (const days of [7, 3, 1]) {
        const at = beforeExpiry(expiry, days, now);
        if (!at) continue;
        schedules.push({
          id: 200 + days,
          title: `SVJ Plus ends in ${days} day${days === 1 ? "" : "s"}`,
          body: "Review your membership before access changes.",
          triggerAt: at.getTime(),
          channel: "membership",
          target: "profile",
        });
      }
      if (expiry.getTime() > now.getTime()) {
        schedules.push({
          id: 200,
          title: "Your SVJ Plus period has ended",
          body: "Your free features remain available. Open SVJ to review membership options.",
          triggerAt: expiry.getTime(),
          channel: "membership",
          target: "profile",
        });
      }
    }
  }

  return schedules.sort((a, b) => a.triggerAt - b.triggerAt);
}

export async function notificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await VjNotifications.checkPermission()).granted;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await VjNotifications.requestPermission()).granted;
  } catch {
    return false;
  }
}

export async function openNotificationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await VjNotifications.openSettings();
  } catch {
    // Settings fallback is best-effort.
  }
}

export async function replaceNativeNotificationSchedules(
  schedules: NativeNotificationSchedule[],
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await VjNotifications.replaceSchedules({ schedules });
    return true;
  } catch {
    return false;
  }
}

export async function cancelNativeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await VjNotifications.cancelAll();
  } catch {
    // Notification cleanup is best-effort and must never crash the app.
  }
}

export async function sendTestNotification(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await VjNotifications.notifyNow({
      id: 9991,
      title: "SVJ notifications are on",
      body: "Progress, reminders and membership alerts can now reach you.",
      channel: "progress",
      target: "profile",
    });
    return true;
  } catch {
    return false;
  }
}
