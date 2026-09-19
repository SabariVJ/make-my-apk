# SVJ Native Activity Platform

Continuation of `f9c8e34` (GPS recorder, route library, records, heatmap, personal
segments). This document covers the **native Android + public Live Share +
recovery** remainder. Nothing here touches external fitness providers — SVJ owns
its own data end to end.

---

## 1. Android native plugins

Both plugins are **app-local**: they live in `android/app/src/main/java/app/lovable/svj/`
and are registered in `MainActivity.onCreate()` **before** `super.onCreate()`.
`cap sync` never lists app-local plugins in `capacitor.plugins.json`, so
registration in `MainActivity` is what exposes them to JavaScript.

### 1.1 `VjWorkout` — foreground workout service

| File | Role |
|---|---|
| `VjWorkoutService.java` | The real Android foreground service (type `location`). Owns all location collection. |
| `VjWorkoutPlugin.java` | Capacitor bridge: control + `location` / `workoutState` events. |
| `res/drawable/ic_stat_workout.xml` | Monochrome status-bar icon. |

Plugin methods: `isAvailable`, `checkPermissions`, `requestPermissions`,
`startWorkout`, `pauseWorkout`, `resumeWorkout`, `stopWorkout`, `getState`,
`getBattery`, `clearWorkout` — matching the existing `src/app/lib/nativeWorkout.ts`
contract exactly.

Behaviour:

- **Persistent notification** — `SVJ is recording your activity` (plus
  `Paused — tap to resume in SVJ` while paused). Tapping it reopens the app.
- **Survives** screen lock, app backgrounding and WebView recreation because it
  is a foreground service, not a WebView watcher.
- **State is mirrored to `SharedPreferences`** (`svj_workout`), so a service
  restarted by the OS (`START_STICKY`) resumes the *same* activity id instead of
  inventing a new one, and a reattached WebView can read it via `getState()`.
- **Repeat `startWorkout` with the same activity id is idempotent** — it cannot
  reset the workout or its counter.
- `startWorkout` **rejects** without foreground location permission; the JS
  bridge degrades to the browser geolocation adapter when the plugin is absent.

Location is collected **only** between an explicit start and an explicit stop.
`onFix` returns immediately unless `active && !paused`. There is no passive or
background collection anywhere in SVJ.

### 1.2 Location permissions

Declared in the manifest: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`.

**`ACCESS_BACKGROUND_LOCATION` is deliberately NOT declared and never
requested.** A foreground service of type `location` is sufficient to keep
recording through a locked screen, and the prompt tells users exactly which
permissions to grant.

### 1.3 `VjHealthConnect` — on-device health store

`VjHealthConnectPlugin.kt` matches the `src/app/lib/healthConnect.ts` contract:
availability detection, permission checks, permission requests (via the Health
Connect permission contract), per-type record reads, and a settings launcher.

Supported reads (only these, nothing more): `steps`, `distance`,
`exerciseSessions`, `heartRate`, `restingHeartRate`, `sleep`, `calories`,
`weight`.

Guarantees:

- The grant is **re-read before every single read**, so revoking a type in
  Health Connect stops SVJ immediately.
- SVJ never writes to Health Connect and never reads an ungranted type.
- Imports still go through the existing server path
  (`svj_import_platform_activity`), which deduplicates against native SVJ
  workouts and refuses to create a second activity or a second XP grant.

Health Connect is an Android 8.0+ (API 26) platform component whose client
library declares `minSdk 26`. SVJ keeps `minSdk 24`, so:

- the manifest carries
  `<uses-sdk tools:overrideLibrary="androidx.health.connect.client" />`, and
- `MainActivity` registers `VjHealthConnectPlugin` **only on API 26+**, so older
  devices never touch its classes (and never required the dependency at runtime).

### 1.4 Build changes

- `android/build.gradle`: Kotlin Gradle plugin `2.1.20` on the buildscript
  classpath (needed only for the Health Connect bridge, whose read API is
  coroutine-based).
- `android/variables.gradle`: `healthConnectVersion = '1.1.0'`,
  `kotlinxCoroutinesVersion = '1.8.1'`.
- `android/app/build.gradle`: `org.jetbrains.kotlin.android`,
  `androidx.health.connect:connect-client`, `kotlinx-coroutines-android`, and
  Kotlin `jvmTarget = "21"` to match the module's existing Java 21 target.

---

## 2. Native samples feed the existing recorder (no second recorder)

`createDefaultLocationAdapter()` already preferred the native adapter, so no
recorder fork was needed. Samples from the foreground service are validated by
`normalizeNativeSample` and pushed through the **existing** `ingest()` path, which
keeps:

GPS spike/accuracy rejection, auto-pause, splits, offline queue, the stable
activity UUID created at start, and server-authoritative distance/XP.

One real bug was fixed: the adapter treated **any** `workoutState` payload with
`active: false` as "the workout service stopped unexpectedly". A normal stop
(which the recorder itself initiates) would therefore have raised a phantom
error. State events are now informational, and native/local disagreement is
detected explicitly at recovery instead.

---

## 3. Native process/session recovery

`reconcileNativeWorkout(localActivityId)` (pure rule:
`reconcileWorkoutStates`) compares the Android service with the locally persisted
session on every app start:

| Native | Local | Result |
|---|---|---|
| active, same activity id | restored | **matched** — "Recovered the active workout… tap Resume." (stays paused) |
| active, different/missing id | anything | **orphaned** — the service is stopped and the user is told a recording couldn't be matched, so no duplicate activity is created |
| inactive | anything | nothing to do |

A recovered workout always comes back **paused**: collecting location requires an
explicit user action.

---

## 4. SVJ Live Share — public `/live/$token`

`src/routes/live.$token.tsx` renders the public share link.

- Calls **only** `svj_get_public_live_share` (`anon`-granted). It never calls the
  owner RPCs (`svj_get_my_live_share`, `svj_update_live_share`,
  `svj_stop_live_share`) and never touches `supabase.auth` or any session.
- Shows only: display name (if the sharer set one), activity type, elapsed time
  (ticking locally between 15 s polls), distance, last-fix recency, battery, and
  a live-position map marker.
- Expired, revoked, malformed and unknown tokens all render the same neutral
  **"Sharing has ended"** state, so the endpoint can't be probed for valid
  tokens.
- No account, email, token echo or auth material is ever exposed.

The token itself remains 256 bits of database CSPRNG entropy, auto-expiring
(5–720 min) and instantly revocable — see
`20260923020000_native_activity_live_share.sql`.

---

## 5. Required live migration order

Apply **in this exact order** to the SVJ Lovable Cloud database, then reload the
PostgREST schema (`NOTIFY pgrst, 'reload schema';`):

```
supabase/migrations/20260921000000_earned_plus_stale_session_hardening.sql
supabase/migrations/20260923000000_native_activity_track_storage.sql
supabase/migrations/20260923010000_native_activity_rpcs.sql
supabase/migrations/20260923020000_native_activity_live_share.sql
```

- `20260921000000` is the Earn Plus stale-session prerequisite (must precede or
  accompany the native work; it is already reviewed).
- `20260923000000` adds track storage, routes, segments, heatmap and records
  objects plus RLS.
- `20260923010000` adds the activity RPCs (save GPS workout, track fetch, routes,
  segments, heatmap, records).
- `20260923020000` adds SVJ Live Share and the Health Connect import path.

No historical migration needs editing, and no other migration needs rewriting.

### Recovery / Readiness

`public.svj_get_my_readiness()` is defined in
`supabase/migrations/20260919120000_recovery_readiness.sql` (with the standard
`REVOKE … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated` pair). It is
**not** part of the four migrations above.

- If the live database already reports `svj_get_my_readiness` resolving, nothing
  more is needed.
- If it reports "function does not exist", that single migration
  (`20260919120000_recovery_readiness.sql`) is what fixes it.

Nothing was applied to any database by this change.

---

## 6. Validation status

| Check | Result |
|---|---|
| `bun tsc -b --noEmit` | **PASS** |
| `bun run test` | **PASS** — 602 tests, 600 pass, 0 fail, 2 skipped (the two PGlite suites self-skip under the combined run's DOM; run isolated they pass) |
| `bun run build` | **PASS** |
| `bunx cap sync android` | **PASS** (4 Capacitor plugins synced; app-local plugins are registered in `MainActivity`) |
| `git diff --check` | **PASS** |
| Android unit tests | **NOT RUN** — no JDK and no Android SDK in this environment |
| `gradlew assembleDebug` | **NOT RUN** — no JDK and no Android SDK in this environment |
| Native plugin registration reachable from Capacitor | Verified statically (registration before `super.onCreate()`), not executed |

New regression coverage: `tests/native-workout-bridge.test.ts` (18 tests:
sample/state/permission normalization, reconciliation rules) and
`tests/provider-free.test.mjs` (11 tests: no external provider integration
anywhere in runtime source, plus positive assertions that the native platform is
wired and Live Share is identity-free).

The Android build must be run where a JDK 21 + Android SDK exist:

```bash
bunx cap sync android
cd android && ./gradlew assembleDebug
```
