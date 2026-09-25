import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  buildNotificationPlan,
  notificationTargetFromUrl,
  trainingSessionNotificationId,
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
  assert.equal(
    plan.some((item) => item.id === 102),
    false,
  );
});

test("Plus expiry schedules 7, 3, 1 day warnings and expiry", () => {
  const plan = buildNotificationPlan(base(), {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: true,
  });
  for (const id of [207, 203, 201, 200]) {
    assert.equal(
      plan.some((item) => item.id === id),
      true,
    );
  }
});

test("lifetime/founder-style membership with no expiry creates no expiry alerts", () => {
  const plan = buildNotificationPlan(
    { ...base(), plusExpiresAt: null },
    { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true },
  );
  assert.equal(
    plan.some((item) => item.id >= 200 && item.id <= 207),
    false,
  );
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

test("all user-selected reminder times are clamped outside quiet hours", () => {
  const plan = buildNotificationPlan(base(), {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: true,
    nutrition: true,
    morningTime: "23:15",
    eveningTime: "23:20",
    recoveryTime: "23:25",
    nutritionTime: "23:30",
  });
  for (const id of [101, 102, 103, 104]) {
    const reminder = plan.find((item) => item.id === id);
    assert.ok(reminder);
    const at = new Date(reminder.triggerAt);
    assert.equal(at.getHours(), 7);
    assert.equal(at.getMinutes(), 0);
  }
});

test("an already-overdue inactivity threshold still schedules the next useful nudge", () => {
  const now = new Date("2026-09-21T12:00:00");
  const plan = buildNotificationPlan(
    { ...base(now), lastProgressAt: "2026-09-10T09:00:00" },
    { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true },
  );
  const reminder = plan.find((item) => item.id === 106);
  assert.ok(reminder);
  assert.ok(reminder.triggerAt > now.getTime());
});

test("membership expiry itself never fires during quiet hours", () => {
  const now = new Date("2026-09-21T12:00:00");
  const plan = buildNotificationPlan(
    { ...base(now), plusExpiresAt: "2026-09-25T23:30:00" },
    { ...DEFAULT_NOTIFICATION_PREFERENCES, enabled: true },
  );
  const expiry = plan.find((item) => item.id === 200);
  assert.ok(expiry);
  const at = new Date(expiry.triggerAt);
  assert.equal(at.getDate(), 26);
  assert.equal(at.getHours(), 7);
  assert.equal(at.getMinutes(), 0);
});

test("notification deep links accept only known SVJ destinations", () => {
  assert.equal(notificationTargetFromUrl("app.lovable.svj://notification/workouts"), "workouts");
  assert.equal(notificationTargetFromUrl("app.lovable.svj://notification/nutrition"), "nutrition");
  assert.equal(notificationTargetFromUrl("https://example.com/workouts"), null);
  assert.equal(notificationTargetFromUrl("app.lovable.svj://notification/admin"), null);
});

test("training session notification ids are stable and unique per local day", () => {
  const first = trainingSessionNotificationId("2026-09-22");
  assert.equal(first, trainingSessionNotificationId("2026-09-22"));
  assert.notEqual(first, trainingSessionNotificationId("2026-09-23"));
  assert.ok(Number.isSafeInteger(first));
});

// ── Automated training scheduling ───────────────────────────────────────────

const trainingOn = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled: true,
  training: true,
  trainingSession: true,
  trainingTime: "17:30",
};

test("training session reminders schedule one entry per scheduled plan day", () => {
  const plan = buildNotificationPlan(
    {
      ...base(),
      trainingPlanDays: [
        { date: "2026-09-22", title: "Upper A" },
        { date: "2026-09-22", title: "Upper A (duplicate)" },
        { date: "2026-09-24", title: null },
      ],
    },
    trainingOn,
  );
  const reminders = plan.filter((item) => item.title === "Training session today");
  assert.equal(reminders.length, 2, "one reminder per DISTINCT scheduled day");
  assert.notEqual(reminders[0].id, reminders[1].id, "distinct days need distinct native alarm ids");
  assert.equal(reminders[0].title, "Training session today");
  assert.match(reminders[0].body, /Upper A is scheduled for today/);
  assert.match(reminders[1].body, /Your scheduled training session is today/);
  for (const reminder of reminders) {
    const at = new Date(reminder.triggerAt);
    assert.equal(at.getHours(), 17);
    assert.equal(at.getMinutes(), 30, "the preferred training time is honored");
    assert.equal(reminder.channel, "coach");
    assert.equal(reminder.target, "workouts");
  }
  // A reminder is only a reminder: it never claims work was performed.
  assert.doesNotMatch(reminders.map((r) => r.body).join(" "), /completed|done|logged/i);
});

test("training session reminders honor the preference, quiet hours and a missing plan", () => {
  const day = [{ date: "2026-09-22", title: null }];
  const byPreference = buildNotificationPlan(
    { ...base(), trainingPlanDays: day },
    { ...trainingOn, trainingSession: false },
  );
  assert.equal(
    byPreference.some((item) => item.title === "Training session today"),
    false,
    "the preference can turn session reminders off",
  );

  const withoutPlan = buildNotificationPlan(
    { ...base(), trainingPlanDays: null },
    { ...trainingOn, trainingSession: true },
  );
  assert.equal(
    withoutPlan.some((item) => item.title === "Training session today"),
    false,
    "no plan loaded → no session reminders",
  );

  const quietPreference = buildNotificationPlan(
    { ...base(), trainingPlanDays: day },
    { ...trainingOn, trainingTime: "23:30" },
  );
  const clamped = quietPreference.find((item) => item.title === "Training session today");
  assert.ok(clamped, "a quiet-hours preference still delivers — outside quiet hours");
  const at = new Date(clamped.triggerAt);
  assert.equal(at.getHours(), 7, "23:30 is clamped out of the 22:00–07:00 quiet window");
  assert.equal(at.getMinutes(), 0);
});

test("a training-gap reminder follows the last real workout and can be off", () => {
  const plan = buildNotificationPlan(
    { ...base(), lastWorkoutAt: "2026-09-20T10:00:00" },
    trainingOn,
  );
  const gap = plan.find((item) => item.id === 107);
  assert.ok(gap, "training reminders surface a 3-day gap after the last workout");
  const at = new Date(gap.triggerAt);
  assert.equal(at.getDate(), 23, "last workout + 72 hours");
  assert.equal(at.getHours(), 17);
  assert.equal(at.getMinutes(), 30);
  assert.match(gap.body, /No strength session has been logged for 3 days/);
  assert.equal(gap.target, "workouts");

  const noWorkout = buildNotificationPlan({ ...base(), lastWorkoutAt: null }, trainingOn);
  assert.equal(
    noWorkout.some((item) => item.id === 107),
    false,
    "without a real workout timestamp there is no gap to report",
  );

  const preferenceOff = buildNotificationPlan(
    { ...base(), lastWorkoutAt: "2026-09-20T10:00:00" },
    { ...trainingOn, training: false },
  );
  assert.equal(
    preferenceOff.some((item) => item.id === 107),
    false,
    "the training preference gates the gap reminder",
  );
});
