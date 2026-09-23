# SVJ — Google Play Production Distribution (Wearables V3)

Status: **release-ready, nothing published**. Everything below the "Manual Play
Console actions" heading requires explicit human action in Play Console.

## Package identity

| Module | applicationId | namespace | versionCode | versionName |
|---|---|---|---|---|
| Phone (`:app`) | `app.lovable.svj` | `app.lovable.svj` | `100100` | `1.0` |
| Wear (`:wear`) | `app.lovable.svj` | `app.lovable.svj.wear` | `200100` | `1.0` |

The phone application ID was **not** changed. The Wear module's **applicationId
was corrected from `app.lovable.svj.wear` to `app.lovable.svj`**: the Wear OS
Data Layer only routes messages between nodes whose apps share the same package
ID *and* signing certificate. The Kotlin namespace stays `app.lovable.svj.wear`
(source organization only — not a Play identity). One Play listing now serves
both form factors.

## Version code scheme

Form-factor bands, `MAJOR*10000 + MINOR*100 + PATCH` added to the band base:

- Phone: `100000 + …` → 1.0 → **100100**; every phone release increments within the band.
- Wear: `200000 + …` → 1.0 → **200100**; never collides with phone.

Existing Play users upgrade cleanly (both codes are above any earlier
`versionCode 1` build); no downgrade path is created.

## Signing architecture

- **No keystores, passwords, or base64 secrets are committed.** Release signing
  in both `android/app/build.gradle` and `android/wear/build.gradle` reads only
  `SVJ_KEYSTORE_PATH`, `SVJ_KEYSTORE_PASSWORD`, `SVJ_KEY_ALIAS`,
  `SVJ_KEY_PASSWORD` (from CI secrets). If any is missing, the
  `bundleRelease`/`assembleRelease` tasks **fail with an explicit error** — an
  unsigned or debug-signed release is never silently produced. Debug builds
  keep normal Android debug signing.
- **Upload key vs App Signing key**: SVJ's keystore is the *upload key*. With
  **Google Play App Signing** enabled (Play Console → Setup → App signing),
  Google re-signs what users actually download with the *app signing key*.
  Store the upload key safely; losing it is recoverable only while App Signing
  is active. **Do not rotate keys automatically.**
- Phone and Wear artifacts **must be signed with the same upload key** — CI's
  *Android Release Validation* job extracts both SHA-256 certificate
  fingerprints with `keytool -printcert -jarfile` and fails the job if they
  differ. Only fingerprints are logged, never key material.
- CI without production secrets generates a 1-day **ephemeral validation
  keystore** (`svj-validation-only`); those AABs are structurally valid but are
  explicitly *not* release-signable and must never be uploaded to Play.

## Release artifacts

- `:app:bundleRelease` → `svj-phone-release.aab` (Play mobile track)
- `:wear:bundleRelease` → `svj-wear-release.aab` (Wear OS dedicated track)
- Debug APKs (`svj-phone-debug-apk`, `svj-wear-debug-apk`) remain for device QA only.

## Minification / R8

`minifyEnabled` is **off** in both modules. Capacitor reflection, Data Layer
listener services, the BLE/Health Connect/Wear plugins, and Supabase/OAuth all
remain reachable by construction; shrinking is not disabled to hide a problem —
it was never enabled. If R8 is adopted later, keep rules are required for:
`VjWearListenerService`, `WearCommandListenerService`, `VjWearPlugin`,
`VjWearablePlugin`, `VjWorkoutPlugin`/`VjWorkoutService`, `VjHealthConnectPlugin`,
`VjPedometerPlugin` (all manifest-referenced or Capacitor-registered).

## 64-bit / 16 KB page size

Both release bundles were inspected: **neither contains native `.so`
libraries** (phone Capacitor app and watch app are Java/Kotlin only). The
64-bit and 16 KB page-size requirements are therefore satisfied with no ABI
configuration needed. Re-verify if a native dependency is ever added:
`unzip -l app.aab | grep '\.so'`.

## Manifest targeting (wear)

- `<uses-feature android:name="android.hardware.type.watch" />` — **required**
  (no `required="false"`): the app is only offered on watches, never as a
  normal phone APK.
- `com.google.android.wearable.standalone` = **`false`** — honest declaration:
  watch workouts record offline and queue, but accounts, activity sync, XP and
  rewards run through the companion phone app and SVJ backend.

## Play Console setup (form-factor model)

1. Play Console → **SVJ** (`app.lovable.svj`)
2. **Test and release → Advanced settings → Form factors → Add form factor → Wear OS**
3. Opt in to Wear OS distribution; a **dedicated Wear OS track** is created
4. Upload `svj-wear-release.aab` to the Wear OS track, `svj-phone-release.aab`
   to the mobile track — **same listing, same package ID**
5. Do **not** create a separate public "SVJ Wear" listing

Google reviews the Wear experience separately; expect an extra review cycle.

## Closed testing first (do not skip)

1. Mobile internal/closed testing: phone login, Supabase auth, OAuth in release
   build, Health Connect in release build
2. Wear OS dedicated closed testing: watch install via Play on the watch
   (NOT adb — this is the test), Data Layer connect, real HR, screen-off
   workout, phone disconnect → continue → reconnect → finish, exactly one
   canonical activity, History/Records/badge/XP validation
3. Only after both: consider production rollout

## Store listing checklist (Wear OS)

- [ ] Round-screen screenshot from the actual watch UI (no phone screenshots, no mockups)
- [ ] Additional round screenshots: live workout, sensors, connection screens
- [ ] Accurate feature description (heart rate, steps, workout sync — nothing more)
- [ ] Listing mentions Wear OS companion
- [ ] Data Safety / health-permission declarations accurate (BODY_SENSORS, ACTIVITY_RECOGNITION only; reads, no writes)
- [ ] Privacy policy link valid

## Release checklist

- [ ] Google Play App Signing configured
- [ ] Upload key safely stored (and backed up)
- [ ] Wear OS form factor enabled
- [ ] Wear dedicated closed testing track created
- [ ] Watch AAB uploaded (Wear track)
- [ ] Phone AAB uploaded (mobile track)
- [ ] Wear screenshots uploaded
- [ ] Store listing mentions Wear OS
- [ ] Privacy/Data Safety updated
- [ ] Health permissions accurately declared (read-only)
- [ ] Closed-test watch install successful (via Play, no adb)
- [ ] Data Layer connection successful
- [ ] Real heart rate confirmed
- [ ] Offline workout sync confirmed
- [ ] Duplicate activity protection confirmed
- [ ] Release-build OAuth confirmed
- [ ] Release-build Supabase auth confirmed
- [ ] Release-build Health Connect confirmed
- [ ] Play pre-launch report reviewed
- [ ] Wear review accepted

**No item above is pre-checked** — they are manual Play Console actions.

## Consumer install flow

Install SVJ from Play on the phone → Activity → **Devices** → SVJ Watch →
**INSTALL ON WATCH** → Play offers SVJ on the paired watch (same package ID)
→ grant watch permissions on first launch → phone auto-detects the
`svj_wear_companion` capability → `CONNECTED`. No adb, no APK sideloading, no
Developer Options.

## Migrations

None added, none applied. The previously documented native-platform migration
order is unchanged.
