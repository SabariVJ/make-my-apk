# SVJ Android Release-Hardening Sprint

## Android/iPhone tracking repair — 2026-10-04

Work branch: `codex/native-tracking-stability`, based on release commit
`68195d06d2baabf0565be3e10a847186ce75a6e2`. Native capability version: **2**.
Validation is in progress; the older sprint results below are historical.

| Known issue             | Repair and current evidence                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone daily steps      | App-owned Core Motion bridge queries today's history on enable/open/resume/day rollover. Daily totals do not become workout rewards. Device walk remains owner verification.                                                                                                                                                                                                                                                                   |
| Android automatic steps | Independent health foreground service, explicit Enable and notification Stop, per-account atomic counters/history, reboot and midnight handling. Java counter and persistence tests pass locally.                                                                                                                                                                                                                                              |
| Background GPS          | iPhone Core Location/background capability added; Android journal persists each point before WebView notification. Recreated UI replays sequences with the same workout identity. Android native tests/build pass; Mac native journal tests and unsigned arm64 device compilation passed in CI run 37150170570; final commit is revalidated before delivery.                                                                                   |
| Diagnostics/sync        | One readable Activity card, delayed-sensor status, measurement time and successful sync time. Offline/foreground retries use account-bound tokens and cancel on background/account changes. Live totals preserve the maximum across devices.                                                                                                                                                                                                   |
| Pending recordings      | GPS and strength queues retain every pending workout. Wrong-account/ambiguous legacy entries remain on the device. Native completed journals can reconstruct a lost browser queue. Failed storage/commands never report success.                                                                                                                                                                                                               |
| Live Share              | Starting sharing no longer finishes the workout. Additive RPC stores a recording reference independently of canonical activities/rewards. Stop confirmation errors remain visible.                                                                                                                                                                                                                                                             |
| Screen stability/layout | Tracking coordinators remain outside tab boundaries. Shared Retry boundary covers normal and restricted tabs. Chromium/WebKit geometry checks pass across 9 widths and 2 landscape sizes; admin has no horizontal scrolling.                                                                                                                                                                                                                   |
| Reported failing checks | Current full web suite: 1617 tests, 1615 passed, 0 failed, 2 pre-existing skips. iPhone regressions: 71 passed. Meaningful assertions retained; static import guards updated for lazy imports.                                                                                                                                                                                                                                                 |
| Plus/support/security   | New disposable local Supabase browser/API suite exercises real authenticated services, grants/claims, support replies, private reads and canonical retry behavior. Real authentication, step isolation, friendships, nutrition, challenge progress and ended sharing passed. Grant/support UI checks close first-signup assessment normally; full flow rerun and database lint pending. See SECURITY_TRACKING_REVIEW.md. No production writes. |
| Speed                   | Controlled cold Chromium runs at 390×844, 4× CPU and fixed network: median screen ready 4,550→4,095 ms; initial transfer 659→463 KB. Lossless icon compression 533,169→373,931 bytes with identical pixels. Evidence: performance-loading.json and performance-assets.json. Physical phone timing remains unverified.                                                                                                                          |

### Delivery gates and owner-only follow-ups

- `SVJ-validated-phone-artifacts` is uploaded only after web, database, browser,
  Android phone/watch/release and iPhone checks succeed for the same commit.
- Package contains APK, AAB, **unsigned IPA**, SHA256SUMS and build metadata.
  Android production upload identity is used only when existing credentials are
  available; an ephemeral validation identity is labeled and blocks Play release.
- No emulator or simulator smoke jobs run.
- The native wrappers still load `https://savaje-com.lovable.app`. Publish the
  new web revision separately in Lovable after validation; no hosted publish is
  performed by this work.
- Reconcile/apply the four new additive migrations using the normal production
  change process. Deployed-schema comparison requires owner database access;
  isolated migration/RLS evidence does not prove production schema parity.
- Physical verification: enable daily steps, walk 100 steps, lock during an
  outdoor workout, pause/resume, reopen, finish offline, reconnect, and compare
  website history. Send the Activity status screenshot if any reading fails.
- Google provider login/deep-link proof requires the configured provider and
  an installed signed wrapper. WhatsApp/email/payment handoffs are checked
  without sending messages or making payments; actual handoff is owner proof.

---

## Final Status

| Phase                             | Status  | Changed Files                                                                                     |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Phase 0: Baseline                 | ✅ DONE | —                                                                                                 |
| Phase 1: Runtime Security         | ✅ DONE | TrialGate.tsx, googleAuth.ts, package.json                                                        |
| Phase 2: Account Deletion + Pages | ✅ DONE | account.functions.ts, delete-account.tsx, privacy.tsx, terms.tsx, AuthScreen.tsx, ProfileView.tsx |
| Phase 3: Android Feature Limits   | ✅ DONE | Navigation.tsx, App.tsx                                                                           |
| Phase 4: Ads and Consent          | ✅ DONE | NativeBannerAd.tsx, ProfileView.tsx                                                               |
| Phase 5: Release Build Prep       | ✅ DONE | build.gradle, .gitignore                                                                          |
| Phase 6: Validation + Handoff     | ✅ DONE | PLAY_RELEASE_CHECKLIST.md, COMPLIANCE_BLOCKERS.md                                                 |

## Baseline

- Branch: `release/play-v1-compliance`
- Starting HEAD: `1b21bb9033fa0f5d0ee8413b65dc150374511b4d`
- Repository: `SabariVJ/make-my-apk`
- APK loads from: `https://savaje-com.lovable.app`

## Phase 1 — Runtime Security

### Changes

- Removed raw callback URL, authorization code, access token, and refresh token logging from TrialGate.tsx and googleAuth.ts
- Added `"test": "npx tsx --test src/integrations/supabase/client.server.test.ts"` script to package.json

### Evidence

- `rg` confirms no `console.log` references to raw tokens/URLs remain
- 40/40 server tests pass

## Phase 2 — Account Deletion + Public Pages

### Changes

- `src/lib/account.functions.ts` — Server-authorized account deletion using verified session identity
  - Requires authenticated user
  - Requires typing "DELETE" confirmation
  - Anonymizes friendships, clears redemption codes
  - Calls `supabaseAdmin.auth.admin.deleteUser()` as final step
  - Retry-safe and idempotent
- `src/routes/delete-account.tsx` — Public page accessible without authentication
- `src/routes/privacy.tsx` — Privacy policy covering Supabase, Google OAuth, AdMob, data retention, deletion
- `src/routes/terms.tsx` — Terms of service
- `src/app/components/AuthScreen.tsx` — Added Privacy and Terms links
- `src/app/views/ProfileView.tsx` — Added Delete Account, Privacy, Terms links

### Evidence

- TypeScript: ✅ PASS
- Build: ✅ PASS

### Schema Assumptions

- All user-owned tables use `ON DELETE CASCADE` from `auth.users`
- Friendship tables have `user_id` and `friend_id` columns
- Redemption codes have a nullable `redeemed_by` column

## Phase 3 — Android Feature Limits

### Changes

- `src/app/components/Navigation.tsx` — Community and Leaderboard tabs hidden on Android
- `src/app/App.tsx` — Stale activeTab reset on Android (useEffect), view guard for community/leaderboard
- Expected Android tabs: Challenges, Train, Fuel, 60 Day, Profile
- Expected expired non-Plus tabs: 60 Day, Redeem Code, Profile, Sign Out

### Evidence

- TypeScript: ✅ PASS
- Build: ✅ PASS

## Phase 4 — Ads and Consent

### Changes

- `src/app/components/NativeBannerAd.tsx` — Full UMP consent flow:
  1. Initialize AdMob
  2. `requestConsentInfo()` → check `canRequestAds`
  3. If `REQUIRED` and `isConsentFormAvailable` → `showConsentForm()`
  4. Only `showBanner()` if `canRequestAds === true`
  5. Exported `showPrivacyChoices()` for Profile button
- `src/app/views/ProfileView.tsx` — Privacy Choices button (Android only)

### Evidence

- TypeScript: ✅ PASS
- Build: ✅ PASS
- ESLint: 1 warning (react-refresh/only-export-components — expected for non-component exports)

### Unverified

- Consent form display — requires AdMob GDPR message configuration in dashboard
- Test ad IDs — requires AdMob dashboard or test device registration

## Phase 5 — Release Build Preparation

### Changes

- `android/app/build.gradle` — Added `signingConfigs.release` reading from:
  - `SVJ_KEYSTORE_PATH`, `SVJ_KEYSTORE_PASSWORD`, `SVJ_KEY_ALIAS`, `SVJ_KEY_PASSWORD`
- `android/.gitignore` — Enforced keystore exclusion (*.jks, *.keystore, *.pepk)

### SDK/Manifest Audit

| Item                   | Status                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| applicationId          | `app.lovable.svj` (unchanged, correct)                                                   |
| compileSdk / targetSdk | 36 (current)                                                                             |
| minSdk                 | 24                                                                                       |
| AdMob APPLICATION_ID   | In AndroidManifest via `@string/admob_app_id` = `ca-app-pub-1475355973043918~5474059195` |
| INTERNET permission    | Present                                                                                  |
| Deep link scheme       | `app.lovable.svj://auth/callback` (Google OAuth)                                         |
| server.url             | `https://savaje-com.lovable.app` (production URL, must keep for hosted server functions) |
| Upload keystore        | NOT in repo (correct)                                                                    |

### Unverified

- Native Android build (no local Android SDK in sprint environment)
- 16 KB page alignment (Android 15+)
- ProGuard/R8 minification (currently `minifyEnabled false`)

## Phase 6 — Historical Validation Results

| Check                   | Result                           |
| ----------------------- | -------------------------------- |
| `npm ci`                | ✅ PASS                          |
| `npx prettier --write`  | ✅ PASS                          |
| `npx eslint`            | ✅ 0 errors (1 expected warning) |
| `npx tsc --noEmit`      | ✅ PASS                          |
| `npm run build`         | ✅ PASS                          |
| `npx tsx --test`        | ✅ 40/40 PASS                    |
| `git diff --check`      | ✅ PASS                          |
| `npx cap sync android`  | NOT TESTED                       |
| Android lint            | NOT TESTED                       |
| Android unit tests      | NOT TESTED                       |
| `gradlew assembleDebug` | NOT TESTED                       |

## Phase 6 Blockers (superseded where noted)

1. **Upload keystore** — Must be obtained from original build environment or generated fresh
2. **AdMob GDPR consent message** — Must be configured in AdMob dashboard
3. **Native Android verification** — Automated CI is now green; physical phone/tablet verification remains
4. **Privacy policy content review** — Contact email, retention period should be verified by human
5. **12-testers-for-14-days** — If new Play Console developer account

## Final release-hardening continuation — 24 September 2026

| Phase                                      | Status               | Evidence                                                                                                                                              |
| ------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Activity graph removal                 | ✅ DONE              | Avg Steps / Best Day / Avg KCAL retained; two chart blocks removed; focused regression test                                                           |
| B — Android Train picker                   | ✅ DONE              | App-controlled dark date/time dialogs replace native WebView picker surfaces; focused interaction and source-guard tests                              |
| C — Native/security/legal/compliance audit | ✅ DONE              | Findings recorded in `COMPLIANCE_BLOCKERS.md` and `PLAY_RELEASE_CHECKLIST.md`                                                                         |
| D — Verified blocker/high fixes            | ✅ DONE              | Adult eligibility alignment, truthful Plus purchase copy, Play data-deletion route, cleartext disabled, backups disabled, privacy disclosure expanded |
| E — Final validation                       | ✅ BUILDS / ⚠ DEVICE | Full web suite, TypeScript, lint/format, phone/wear native CI, release AABs, and signing identity pass; physical-device verification remains          |

- Starting SHA for this continuation: `0862e0996101ef531ee1f2f532852207734770b8`.
- Validated implementation SHA: `07438d0155d8f318666de3e7f975926b2ad25522`.
- Implementation CI: [run 35964114638](https://github.com/SabariVJ/make-my-apk/actions/runs/35964114638) — all five jobs passed.

No database migrations were added or applied by this release-hardening work. Recovery, Train, and Activity data paths remain intact.

## Next Commands for Human Operator

```bash
# 1. Review all changes
git diff --stat
git diff

# 2. Run tests locally
npx tsx --test src/integrations/supabase/client.server.test.ts

# 3. Build Android (requires local Android SDK)
bun run cap:sync
cd android && ./gradlew assembleDebug

# 4. For release build (set signing vars first)
export SVJ_KEYSTORE_PATH=/path/to/upload-keystore.jks
export SVJ_KEYSTORE_PASSWORD=...
export SVJ_KEY_ALIAS=...
export SVJ_KEY_PASSWORD=...
cd android && ./gradlew bundleRelease

# 5. When ready, commit and push
git add -A
git commit -m "Release hardening: consent, deletion, limits, signing"
git push origin release/play-v1-compliance
```
