# Android-native step counting

## Scope
Replace only the Android step-reading path. Keep the current Activity screen, persisted activity history, calorie estimates, XP milestones, and iOS pedometer behavior intact.

## Implementation
- Add an Android Capacitor plugin backed directly by `SensorManager` and `Sensor.TYPE_STEP_COUNTER`.
- Register the plugin from the existing Android activity and add `ACTIVITY_RECOGNITION` permission handling.
- Persist native raw-counter state, local-day state, and timestamps so app restarts, duplicate readings, midnight rollover, and device counter resets remain monotonic and do not double-count.
- Emit a Capacitor event containing the raw cumulative value, calculated daily steps, source, timestamp, and full diagnostic state.
- Add detailed Android logs for manager/sensor discovery, permission, listener registration, first and subsequent readings, daily deltas, rollover, and counter resets.
- Use the native Android source from `ActivityContext`; retain the existing plugin only for iOS. Add a bounded startup timeout that changes the UI to “Waiting for Android step sensor”.
- Expose an Activity diagnostics section showing sensor availability, permission, listener connection, started state, raw value, daily value, timestamp, source, and last error.
- Add Health Connect as a secondary synchronization source when available and authorized. It will read today’s steps, identify itself as the source, merge monotonically, and never add its total on top of SensorManager totals.
- After Android no longer imports it, remove the generated Android dependency on `@capgo/capacitor-pedometer` while retaining the package for iOS.

## Tests and verification
- Add pure/native coverage for cumulative readings, restart, midnight rollover, reset/reboot, duplicate events, unavailable sensor, denied permission, and positive raw values.
- Run the requested TypeScript check, full tests, production build, and Android Capacitor sync.
- Build a fresh debug APK and provide it as an artifact if the Android toolchain succeeds.
- Do not claim physical-device success. Final confirmation requires installing that APK on the tablet and recording diagnostics showing available/granted/connected/started plus positive raw and daily values after walking. If the tablet reports no step-counter sensor, report that result without fabricating steps.

## Files expected to change
- Android manifest, main activity, app Gradle dependencies, and new native plugin/state/test files.
- Activity context and Activity diagnostics presentation.
- Activity regression tests and package/generated Capacitor Android dependency wiring as needed.
