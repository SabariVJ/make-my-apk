# SVJ Final Release Hardening Report

**Date:** 24 September 2026  
**Branch:** `release/play-v1-compliance`  
**Starting SHA:** `0862e0996101ef531ee1f2f532852207734770b8`

## Scope completed

### Phase A — Activity graph removal

- Removed the Activity period visualizations titled **Daily Steps** and **Daily Calories Burned (est.)** from the real `ActivityView` surface.
- Preserved the provider's history and aggregation pipeline and the **Avg Steps**, **Best Day**, and **Avg KCAL** summaries.
- Tightened both period cards so no empty chart container remains.
- Added `tests/activity-summary.test.mjs`, which renders the shipped view with a controlled Activity provider and guards both the visible summaries and the absence of the removed graphs.

### Phase B — Android Train picker fix

- Replaced the Train Move flow's native HTML date field with the app-controlled `SVJDatePicker`.
- Added `SVJTimePicker` and migrated related Android-sensitive manual Activity, notification-preference, and body-profile date/time controls.
- Both dialogs use the dark SVJ palette, fixed viewport-safe dimensions, internal scrolling, explicit Cancel/Set actions, focus restoration/trapping, Escape handling, and keyboard day/time navigation.
- Calendar values use local year/month/day components and never round-trip through UTC, preventing timezone day shifts.
- Added `tests/train-picker.test.mjs` for date maths, dialog behavior, cancellation, keyboard controls, and source guards preventing native picker fields from returning to Train.

### Phase C — Release/native/security/legal/compliance audit

- Audited Activity, Train scheduling, authentication, purchase copy, Capacitor transport, Android manifest/backup behavior, generated routes, account deletion, existing privacy/terms pages, Play packaging, and release documentation.
- Preserved Recovery V2, automated training, activity history/tracking, native sensors, RLS/RPC architecture, and all existing server-authoritative data flows.
- No duplicate Recovery, training, notification, or payment system was introduced.

### Phase D — Verified blocker/high fixes

- Signup and Google signup now require an explicit 18+ self-attestation; Terms and the Play target-audience checklist use the same adult-only eligibility.
- Corrected the seven-day offer language so it does not imply a charge or automatic conversion.
- Described SVJ Plus truthfully as a one-time, manually activated purchase with no recurring subscription or auto-renewal.
- Added `/data-deletion` as the Play Console data-deletion URL while rendering the existing authenticated account-deletion flow; no second deletion implementation exists.
- Disabled Capacitor cleartext traffic while retaining the production HTTPS `server.url`.
- Disabled Android application-data backup so local authenticated/offline application data is not copied into platform backups.
- Expanded the privacy disclosure to cover training, recovery, GPS/routes, Health Connect, notifications, support data, and adult-only eligibility.
- Added `tests/release-hardening.test.mjs` to guard the verified release decisions.
- Upgraded CI to current Node 24 action runtimes (`checkout@v7`, `cache@v6`, `setup-java@v6`, `upload-artifact@v7`) and made phone/wear Android lint failures block CI instead of being ignored.

## Database changes

- **Migrations added:** none
- **Migrations applied:** none
- No production database or RLS state was changed by this work.

## Validation evidence

| Check                                        | Result                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Focused Activity/Train/release tests         | PASS                                                                                                              |
| Full `bun run test`                          | PASS — 1,348 tests: 1,346 passed, 0 failed, 2 skipped                                                             |
| `bunx tsc --noEmit`                          | PASS                                                                                                              |
| Focused ESLint                               | PASS — 0 errors, 0 warnings                                                                                       |
| Prettier check for changed source/tests/docs | PASS                                                                                                              |
| `bun run build`                              | PASS                                                                                                              |
| `python3 scripts/test_android_themes.py`     | PASS — 8/8                                                                                                        |
| `bun run cap:sync`                           | PASS — Capacitor configuration/plugins synchronized; hosted `server.url` correctly skips copying local web assets |
| GitHub Actions phone/wear Android CI         | PASS — theme tests, native unit tests, blocking lint, debug APK builds, release AABs, and shared signing identity |
| Real-device Android verification             | NOT RUN — no device/emulator is attached                                                                          |

## Release decision

**Web and repository validation: ready. Production Play release: blocked by external release operations.**

The following require the repository owner and cannot be completed or truthfully verified from this workspace:

1. Configure the Play upload keystore and provide `SVJ_KEYSTORE_PATH`, `SVJ_KEYSTORE_PASSWORD`, `SVJ_KEY_ALIAS`, and `SVJ_KEY_PASSWORD` outside Git.
2. Download and inspect the CI phone/wear APK and AAB artifacts, then repeat the native build with the production upload key on a controlled Java/Android SDK 36 machine.
3. Install the signed build on a physical Android phone/tablet and verify the Train Move picker, manual activity controls, activity summaries, recovery/training flows, notifications, AdMob UMP, Health Connect, and account deletion.
4. Configure and verify the AdMob EEA/UK GDPR consent message in the AdMob console.
5. Complete the Play Data Safety form using the documented fitness, recovery, health, location, notification, and advertising disclosures.
6. Have a qualified owner review the Privacy Policy, Terms, refund process, retention statement, support contact, and target-audience choice before publication.
7. Complete Play reviewer credentials, listing assets, content rating, and closed testing/production-access requirements.
