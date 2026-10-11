# Repair native iPhone activity tracking

## Finding
The exact “Live step tracking is available in the native app.” message is thrown by `ActivityContext` when `Capacitor.getPlatform()` is neither `ios` nor `android`. The project already has a Core Motion bridge in `SVJTracking.swift`, registered in the iOS storyboard and included in the Xcode target. The Activity flow therefore falls back before calling that bridge when Capacitor reports the runtime as `web` or otherwise fails the platform branch.

## What will change
- Use Capacitor's native-runtime/platform APIs to distinguish an installed iPhone app from Safari/PWA, and log native platform, bridge availability, Motion availability, permission/query results, live readings, lifecycle changes, and sync failures without logging account identifiers.
- Repair and extend the existing `VjPedometer` Core Motion bridge rather than adding another pedometer integration. Query today's local-day total on Activity open and app resume; support historical date-range queries, distance, and available floor counts; make START request Motion permission and attach one live listener, and make STOP remove it.
- Persist the user's tracking choice and last synchronized day/step/timestamp locally. Keep app/web fallback behavior; resynchronize from Core Motion after foregrounding instead of relying on background JavaScript timers. Surface accurate permission, unsupported-device, unavailable-bridge, and retry/Settings states in the existing Activity styling.
- Merge native daily totals monotonically into today's record and history, refreshing calories and the existing goal/progress/record views without duplicate step deltas. Preserve existing XP milestones and persisted claims; only newly crossed eligible milestones can award, while remote live-step display remains display-only and never grants XP.
- Keep the current screen design and native build configuration, updating only the necessary iOS permission copy, bridge methods, platform flow, and tests.

## Verification
- Add regression coverage for the `web` fallback versus Capacitor-native iOS path, first-use permission and denial, listener de-duplication/cleanup, daily-history catch-up after resume, midnight/history merging, and no duplicate XP on repeated queries.
- Run the focused activity/iOS tests, TypeScript check, and app build; inspect the preview build log. A physical iPhone/AltStore IPA walk test cannot be performed in this environment, so that last device-only check will be clearly reported rather than claimed.

## Technical details
- Extend the existing Swift `VjPedometerPlugin` API and TypeScript bridge types; leave Android behavior and the unrelated legacy pedometer integration intact.
- Reuse the persisted `ActivityState` day/history and existing XP milestone claim list. Treat Core Motion's day query as an authoritative daily total and use max/monotonic merges to prevent double-counting.
- Core Motion does not require HealthKit or a HealthKit entitlement for basic pedometer queries. Motion permission still requires the existing `NSMotionUsageDescription`; no new paid capability is planned.
