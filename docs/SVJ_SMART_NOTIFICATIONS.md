# SVJ Smart Notifications

## Status

Implemented on `release/play-v1-compliance` as an additive Android/local-notification system. No database migration or external push provider is required for this phase.

## Architecture

- `NotificationCoordinator.tsx` builds a user-specific schedule from real SVJ state: tasks, streak, Earn Plus, meals, workouts, weekly XP, membership expiry and automated-training plan days.
- `notifications.ts` owns the default planner policy, quiet hours, one-time permission marker and notification deep-link targets.
- `VjNotificationsPlugin.java` owns Android permission, channels, durable AlarmManager schedules, immediate test delivery and cancellation.
- `VjNotificationReceiver.java` delivers alarms and restores schedules after reboot, timezone/clock changes and app replacement.
- Notification taps use `app.lovable.svj://notification/<target>`; the existing Capacitor App bridge routes the user to the relevant SVJ destination.

## Safety / anti-spam rules

- Android notification permission is requested once during first-time onboarding.
- SVJ does not re-prompt inside the app after that onboarding attempt.
- Delivery is controlled globally from Android App Info / notification settings.
- Planner categories use SVJ defaults rather than separate in-app permission toggles.
- Reminder times are clamped outside 22:00–07:00 quiet hours.
- No exact-alarm permission is requested.
- The native layer rejects duplicate IDs and caps one replacement plan to 64 schedules.
- Automated-training reminders get stable unique IDs per local day.
- Completing/logging work causes the coordinator to replace obsolete pending reminders.
- Membership warnings are scheduled for 7, 3 and 1 day before expiry, plus the expiry event itself; expiry delivery is moved out of quiet hours when required.

## Android channels

- `svj_progress` — momentum and recap.
- `svj_coach` — daily, training, nutrition and recovery coaching.
- `svj_membership` — membership/Plus expiry.

## Verification

CI covers the TypeScript planner and Android source contracts. Final physical-device verification should include the one-time onboarding permission sheet, a scheduled reminder, notification-tap navigation, reboot persistence, and disabling/re-enabling notifications from Android App Info without any SVJ re-prompt.
