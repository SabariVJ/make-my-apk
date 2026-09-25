import React, { useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";
import { useSVJ } from "../context/SVJContext";
import { useEngagement } from "../context/EngagementContext";
import { isAutomatedTrainingEnabled } from "../lib/featureFlags";
import { getMyTrainingPlan, trainingRpcClient } from "../lib/trainingClient";
import {
  buildNotificationPlan,
  cancelNativeNotifications,
  loadNotificationPreferences,
  notificationPermission,
  notificationTargetFromUrl,
  replaceNativeNotificationSchedules,
  subscribeNotificationPreferences,
  type NotificationPreferences,
  type NotificationTarget,
} from "../lib/notifications";

function sameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) && d.toDateString() === now.toDateString();
}

/** Local YYYY-MM-DD for a date (schedule keys are local, never UTC). */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export const NotificationCoordinator: React.FC<{
  onNavigate?: (target: NotificationTarget) => void;
}> = ({ onNavigate }) => {
  const { user, challenges, meals, workouts, plusExpiresAt } = useSVJ();
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const engagement = useEngagement();
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    loadNotificationPreferences(user.id),
  );
  const [permissionRefresh, setPermissionRefresh] = useState(0);

  useEffect(() => {
    setPrefs(loadNotificationPreferences(user.id));
    return subscribeNotificationPreferences(user.id, setPrefs);
  }, [user.id]);

  // Notification taps use the app's existing custom URL scheme, so cold-start
  // and warm-start behavior are identical. Only SVJ notification URLs are
  // handled here; OAuth and other app links keep their existing listeners.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let urlListener: { remove: () => Promise<void> } | null = null;
    let stateListener: { remove: () => Promise<void> } | null = null;

    const open = (url?: string | null) => {
      const target = notificationTargetFromUrl(url);
      if (target) navigateRef.current?.(target);
    };

    void CapacitorApp.getLaunchUrl().then((launch) => {
      if (!disposed) open(launch?.url);
    });
    void CapacitorApp.addListener("appUrlOpen", (event) => open(event.url)).then((handle) => {
      if (disposed) void handle.remove();
      else urlListener = handle;
    });
    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !disposed) {
        // Re-check Android's system permission after returning from App Info.
        // This never opens a permission sheet; it only follows the OS setting.
        setPermissionRefresh((value) => value + 1);
      }
    }).then((handle) => {
      if (disposed) void handle.remove();
      else stateListener = handle;
    });

    return () => {
      disposed = true;
      if (urlListener) void urlListener.remove();
      if (stateListener) void stateListener.remove();
    };
  }, []);

  // Server-driven plan, only while the automated-training flag is on. The
  // query feeds session DAYS to the planner; it never marks anything done.
  const trainingEnabled = isAutomatedTrainingEnabled();
  const planQuery = useQuery({
    queryKey: ["training-plan", "notification-days"],
    queryFn: async () => {
      const client = trainingRpcClient();
      if (!client) return null;
      const result = await getMyTrainingPlan(client);
      return result.ok ? result.plan : null;
    },
    enabled: trainingEnabled && prefs.enabled,
    staleTime: 15 * 60_000,
    retry: false,
  });

  /** Upcoming scheduled plan days in the next 7 local days. */
  const trainingPlanDays = useMemo(() => {
    const plan = planQuery.data;
    if (!plan) return null;
    const today = new Date();
    const todayKey = localDayKey(today);
    const horizon = new Date(today.getTime() + 7 * 86_400_000);
    const horizonKey = localDayKey(horizon);
    const seen = new Set<string>();
    const days: { date: string; title: null }[] = [];
    for (const session of plan.sessions) {
      if (session.status !== "scheduled") continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(session.scheduledDate)) continue;
      if (session.scheduledDate < todayKey || session.scheduledDate > horizonKey) continue;
      if (seen.has(session.scheduledDate)) continue;
      seen.add(session.scheduledDate);
      days.push({ date: session.scheduledDate, title: null });
    }
    return days;
  }, [planQuery.data]);

  const signature = useMemo(() => {
    const now = new Date();
    const completedTasks = challenges.filter((item) => item.completed).length;
    const mealsLoggedToday = meals.filter((meal) => sameLocalDay(meal.date, now)).length;
    const lastWorkoutAt = workouts[0]?.date ?? null;
    const lastProgressAt =
      [...user.xpHistory]
        .filter((row) => row.xp > 0)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date ?? null;
    const active =
      engagement.state?.status === "ready" || engagement.state?.status === "disabled"
        ? engagement.state
        : null;
    return {
      completedTasks,
      totalTasks: challenges.length,
      mealsLoggedToday,
      lastWorkoutAt,
      lastProgressAt,
      earnPlus: active
        ? {
            qualifyingDays: active.wallet.qualifyingDays,
            requiredQualifyingDays: active.policy.requiredQualifyingDays,
            rewardXp: active.wallet.rewardXp,
            rewardXpCost: active.policy.rewardXpCost,
          }
        : null,
    };
  }, [challenges, meals, workouts, user.xpHistory, engagement.state]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let cancelled = false;
    void (async () => {
      if (!prefs.enabled) {
        await cancelNativeNotifications();
        return;
      }
      if (!(await notificationPermission())) return;
      const plan = buildNotificationPlan(
        {
          now: new Date(),
          firstName: user.name.split(/\s+/)[0] ?? user.name,
          completedTasks: signature.completedTasks,
          totalTasks: signature.totalTasks,
          currentStreak: user.currentStreak,
          weeklyXp: user.weeklyXP,
          mealsLoggedToday: signature.mealsLoggedToday,
          lastWorkoutAt: signature.lastWorkoutAt,
          lastProgressAt: signature.lastProgressAt,
          plusExpiresAt,
          trainingPlanDays: trainingEnabled ? trainingPlanDays : null,
          earnPlus: signature.earnPlus,
        },
        prefs,
      );
      if (!cancelled) await replaceNativeNotificationSchedules(plan);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    prefs,
    signature,
    plusExpiresAt,
    user.name,
    user.currentStreak,
    user.weeklyXP,
    trainingPlanDays,
    trainingEnabled,
    permissionRefresh,
  ]);

  return null;
};
