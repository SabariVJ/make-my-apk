import React, { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useSVJ } from "../context/SVJContext";
import { useEngagement } from "../context/EngagementContext";
import {
  buildNotificationPlan,
  cancelNativeNotifications,
  loadNotificationPreferences,
  notificationPermission,
  replaceNativeNotificationSchedules,
  subscribeNotificationPreferences,
  type NotificationPreferences,
} from "../lib/notifications";

function sameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) && d.toDateString() === now.toDateString();
}

export const NotificationCoordinator: React.FC = () => {
  const { user, challenges, meals, workouts, plusExpiresAt } = useSVJ();
  const engagement = useEngagement();
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    loadNotificationPreferences(user.id),
  );

  useEffect(() => {
    setPrefs(loadNotificationPreferences(user.id));
    return subscribeNotificationPreferences(user.id, setPrefs);
  }, [user.id]);

  const signature = useMemo(() => {
    const now = new Date();
    const completedTasks = challenges.filter((item) => item.completed).length;
    const mealsLoggedToday = meals.filter((meal) => sameLocalDay(meal.date, now)).length;
    const lastWorkoutAt = workouts[0]?.date ?? null;
    const lastProgressAt =
      [...user.xpHistory]
        .filter((row) => row.xp > 0)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date ?? null;
    const active = engagement.state?.status === "ready" || engagement.state?.status === "disabled"
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
  ]);

  return null;
};
