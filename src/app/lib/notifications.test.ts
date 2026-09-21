import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  buildNotificationPlan,
  type NotificationPlannerInput,
} from "./notifications";

function base(now = new Date("2026-09-21T12:00:00")): NotificationPlannerInput {
  return {
    now,
    firstName: "Sabari",
    completedTasks: 2,
    totalTasks: 5,
    currentStreak: 4,
    weeklyXp: 420,
    mealsLoggedToday: 0,
    lastWorkoutAt: "2026-09-20T10:00:00",
    lastProgressAt: "2026-09-21T09:00:00",
    plusExpiresAt: "2026-10-05T12:00:00Z",
    earnPlus: {
      qualifyingDays: 3,
      requiredQualifyingDays: 7,
      rewardXp: 900,
      rewardXpCost: 3000,
    },
  };
}

test("disabled notifications schedule nothing", () => {
  assert.equal(
    buildNotificationPlan(base(), { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: false }).length,
    0,
  );
});

test("daily plan and evening coach are dynamic and repeat daily", () => {
  const plan = buildNotificationPlan(base(), {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: true,
  });
  const morning = plan.find((item) => item.id === 101);
  const evening = plan.find((item) => item.id === 102);
  assert.equal(morning?.repeatDays, 1);
  assert.match(morning?.body ?? "", /5 tasks/);
  assert.equal(evening?.repeatDays, 1);
  assert.match(evening?.body ?? "", /4-day streak/);
});

test("evening reminder disappears when every task is complete", () => {
  const plan = buildNotificationPlan(
    { ...base(), completedTasks: 5 },
    { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true },
  );
  assert.equal(plan.some((item) => item.id === 102), false);
});

test("Plus expiry schedules 7, 3, 1 day warnings and expiry", () => {
  const plan = buildNotificationPlan(base(), {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: true,
  });
  for (const id of [207, 203, 201, 200]) {
    assert.equal(plan.some((item) => item.id === id), true);
  }
});

test("lifetime/founder-style membership with no expiry creates no expiry alerts", () => {
  const plan = buildNotificationPlan(
    { ...base(), plusExpiresAt: null },
    { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true },
  );
  assert.equal(plan.some((item) => item.id >= 200 && item.id <= 207), false);
});

test("weekly recap repeats every seven days", () => {
  const plan = buildNotificationPlan(base(), {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: true,
  });
  assert.equal(plan.find((item) => item.id === 105)?.repeatDays, 7);
});

test("notification plan is chronological", () => {
  const plan = buildNotificationPlan(base(), {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: true,
    nutrition: true,
    training: true,
  });
  for (let i = 1; i < plan.length; i += 1) {
    assert.ok(plan[i - 1].triggerAt <= plan[i].triggerAt);
  }
});
