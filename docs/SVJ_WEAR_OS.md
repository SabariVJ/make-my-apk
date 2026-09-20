# SVJ Wear OS companion (Wearables V2)

The SVJ watch app ships from **this repository** as the Gradle module `:wear`
(`android/wear`). It is a native Kotlin Wear OS application — the web app is
never loaded on the watch — and it talks to the SVJ phone app over the Wear OS
**Data Layer**. No external fitness provider is involved anywhere.

```
        SVJ phone app (android/app, Capacitor)
                    ▲
                    │  Wear OS Data Layer
                    │  capability discovery + messages
                    ▼
        SVJ Wear OS app (android/wear, Kotlin)
                    │
        watch sensors (HR, step counter)
```

## Source layout

| Path | Purpose |
| --- | --- |
| `android/wear/` | Wear OS application module (registered in `android/settings.gradle`) |
| `android/wear/.../WearProtocol.kt` | Versioned phone ↔ watch contract + JSON writer |
| `android/wear/.../WearHeartRate.kt` | Heart-rate statistics from real samples only |
| `android/wear/.../WearWorkoutSession.kt` | Pure session state machine and payloads |
| `android/wear/.../WearSensors.kt` | Watch sensor access (heart rate, step counter) |
| `android/wear/.../WearWorkoutService.kt` | Foreground workout service + ongoing notification |
| `android/wear/.../WearDataLayer.kt` | Phone discovery, sending, durable outbox |
| `android/wear/.../WearCommandListenerService.kt` | Commands from the phone |
| `android/wear/.../MainActivity.kt` | Watch UI (home, activity picker, live, sensors, link) |
| `android/app/.../VjWearPlugin.java` | Phone-side Capacitor bridge |
| `android/app/.../VjWearListenerService.java` | Buffers watch messages while SVJ is closed |
| `android/app/.../WearInboxStore.java` | Durable inbox + watch status snapshot |
| `src/app/lib/wearOs.ts` | Protocol, validation, arbitration (shared contract) |
| `src/app/lib/wearCompanion.ts` | Phone controller: listeners, inbox drain, import |

## Communication

* The watch advertises the capability **`svj_wear_companion`**; the phone
  advertises **`svj_phone_app`**. Both sides discover each other through
  `CapabilityClient`, so the phone never Bluetooth-scans for the watch.
* Paths: `/svj/wear/handshake`, `/svj/wear/sample`, `/svj/wear/state`,
  `/svj/wear/summary`, and `/svj/wear/command` (phone → watch).
* The handshake carries `protocol: 1` plus the watch's *actually supported*
  capabilities. `distance` and `calories` are only advertised when the hardware
  measures them — today the watch advertises `heart_rate`, `steps`, `workout`.
* Live heart rate is throttled to one message per 3 s; steps to one per 15 s.
  The summary is a single message.

## Offline and reconnection

* Every message that cannot be delivered is queued (`WearSessionStore`, watch
  side) and flushed the moment the Data Layer reconnects. A workout recorded
  with the phone left at home is never lost, and the watch needs no internet.
* On the phone, `VjWearListenerService` persists incoming messages in
  `WearInboxStore` even when SVJ is not running; the app drains and
  acknowledges them on start and every 2 s while open.
* The active watch session is written to `SharedPreferences` on each
  transition. If the watch app is killed mid-workout it comes back **paused**,
  on the same session id, never as a second activity.

## Sensor arbitration

`chooseHeartRateSource()` in `src/app/lib/wearOs.ts` implements:

1. the explicitly selected source (Activity → Devices → Heart rate source)
   while it is healthy,
2. the direct BLE strap,
3. the SVJ Watch,
4. nothing.

Health Connect is never used as a live stream: it is delayed historical data.
Steps are never summed across sources — the watch counter is used while the
watch is the active source, otherwise the phone pedometer.

## Rewards and security

The watch supplies **evidence**, never rewards. A completed watch workout is
imported through the existing `svj_import_platform_activity` RPC with
`device_platform = 'wear_os'`, which stores `source = 'wear_os'`; duplicate
sessions, repeated external ids and type/time/duration overlaps all return the
original activity. XP, stats, Plus, Founder and membership stay entirely
server-authoritative. There is no `awardXp`-style client entry point anywhere in
the watch or bridge code.

## Permissions

* Watch: `BODY_SENSORS`, `ACTIVITY_RECOGNITION`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_HEALTH`, `POST_NOTIFICATIONS`, `WAKE_LOCK`.
  No background sensor permission is requested.
* Phone: no new runtime permission. The Data Layer needs none beyond the
  existing ones; the watch is reachable through Google Play services.
* Health Connect stays read-only and independent of the watch transport.

## Building

```bash
# Phone APK
bunx cap sync android && (cd android && ./gradlew :app:assembleDebug)
#   → android/app/build/outputs/apk/debug/app-debug.apk

# Watch APK
(cd android && ./gradlew :wear:assembleDebug)
#   → android/wear/build/outputs/apk/debug/wear-debug.apk
```

Unit tests:

```bash
(cd android && ./gradlew :app:testDebugUnitTest :wear:testDebugUnitTest)
```

CI (`.github/workflows/ci.yml`) produces two artifacts from the same commit:
**`svj-phone-debug-apk`** (job *Android Phone Build*) and
**`svj-wear-debug-apk`** (job *Wear OS Build*).

## Installing on real devices

Nothing here can be verified without watch hardware; the automated suite proves
the logic, not the sensors. To test on real hardware:

1. **Phone** — install the phone APK (the `svj-phone-debug-apk` CI artifact or
   the local `app-debug.apk`) with `adb install -r app-debug.apk`, or
   `adb -s <phone-serial> install -r app-debug.apk` when both devices are
   attached.
2. **Watch** — enable Developer options + ADB debugging on the watch (Watch
   settings → System → About → tap Build number), then either
   `adb connect <watch-ip>:5555` and `adb -s <watch-ip>:5555 install -r wear-debug.apk`,
   or install through the Wear OS companion app on the phone:
   `adb -s <phone-serial> install -r wear-debug.apk` is **not** sufficient by
   itself — the watch app must be installed on the watch, and ordinary
   Bluetooth pairing does **not** install anything.
3. On the phone, confirm **Activity → Devices → My devices** reports
   *SVJ Watch · Connected* with the expected capabilities. If it says
   *SVJ Wear OS app required*, the watch app is not installed on the watch.
4. Start a workout on the watch, then check the phone's Activity screen shows
   `SVJ Watch · live` heart rate, and that finishing the workout adds exactly
   one activity (source badge **SVJ Watch**).

Minimum versions: the watch module targets Android 26+ (`minSdk 26`) and is
built against API 36. Wear OS 3 (API 30) and newer is the practical target;
older Wear OS 2 devices are untested. Sensors depend on the hardware: heart
rate requires an HR sensor, steps require a step counter. Neither is required
for the app to run — a watch without them simply reports fewer capabilities.

## Known limitations

* Distance and calories are **not** produced by the watch today: no supported
  free API used here measures them, so they are omitted rather than estimated.
  `health-services-client` (ExerciseClient) would provide them and can be added
  later without changing the protocol.
* The watch UI uses framework views rather than Compose for Wear OS, to keep a
  second heavy UI toolchain out of a memory-constrained build and to keep the
  watch APK small (see the header comment in `android/wear/build.gradle`).
* No physical watch has been used by this environment: sensor readings,
  reconnection, and the Data Layer have been exercised by unit tests and by
  code review only.

## Play distribution (Wearables V3)

The watch app ships from the **same Play listing** as the phone app
(`app.lovable.svj`) — the Wear applicationId was aligned to the phone app
because the Data Layer requires identical package ID and signing certificate.
Form-factor version codes: phone `100100+`, wear `200100+`. Release artifacts
are upload-ready AABs (`svj-phone-release.aab`, `svj-wear-release.aab`) built
by CI's *Android Release Validation* job, which also proves both artifacts
share one signing certificate. Full guide and Play Console checklist:
`docs/SVJ_GOOGLE_PLAY_WEAR_RELEASE.md`.

The Devices screen no longer mentions adb: a missing watch companion shows
`INSTALL ON WATCH`, deep-linking to SVJ's Play Store page.
