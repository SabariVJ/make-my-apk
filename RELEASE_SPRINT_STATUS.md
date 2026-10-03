# SVJ stability and native tracking release

## Android/iPhone tracking repair — 2026-10-04

Fix branch: `codex/native-tracking-stability`, from release commit
`68195d06d2baabf0565be3e10a847186ce75a6e2`. Merge target:
`release/play-v1-compliance`. Native capability version: **2**.

Implementation validation at `111648e6fd444af036e3a23572cba61e3a6f7fc4`:
[all required CI jobs passed](https://github.com/SabariVJ/make-my-apk/actions/runs/37153044886).
That PR run compiled merge-preview revision
`bad462c34d142ea06669a544a716b52e80860e0a`, recorded in its artifact metadata.
The final test-runtime configuration and release merge each rerun the same gates.
Native sensor accuracy and production rollout remain the explicit owner checks below.

| Known issue               | Repair and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone daily steps        | App-owned Core Motion bridge queries today's history on enable/open/resume/day rollover. Permission, sensor availability, read time and errors are exposed. Daily totals stay separate from workout rewards.                                                                                                                                                                                                                                                                                                                       |
| Android automatic steps   | Independent health foreground service with explicit Enable, ongoing notification Stop, per-account atomic counter/history, restart/reboot and midnight handling. Ambiguous cross-day/clock-change deltas are preserved without assigning them to today. Health Connect supplies an aggregate fallback, never an added overlapping source. Counter and journal tests pass.                                                                                                                                                          |
| Background GPS            | Core Location/background capability added on iPhone. Android preserves every journal point before WebView notification. Native pause/resume/end events, account/workout identity and replay sequences survive UI recreation. Android debug/release tests and builds, Mac journal tests and unsigned arm64 compilation passed. Force-terminated recordings recover paused. Physical locked-screen proof is pending.                                                                                                                 |
| Diagnostics/sync          | One Activity status card reports permission, source, listening, daily total, latest reading, successful sync and recovery actions. Delayed readings show Waiting; unsupported hardware is identified. Account-bound retries cancel on background/account changes. Server acknowledgments set sync time; totals use the maximum across devices.                                                                                                                                                                                     |
| Pending recordings        | GPS/strength queues retain all unsynced entries, separate accounts and preserve ambiguous legacy entries. Failed starts clear only confirmed empty recordings; Finish enables Save. Storage failures are visible. Completed native journals reconstruct a missing browser queue; reward evaluation is acknowledged before removal. Duplicate saves create one activity.                                                                                                                                                            |
| Live Share                | Recording references are independent from canonical activities. Start does not finish a workout; confirmed Finish/Discard/sign-out stops GPS. Share-stop failures remain visible. Anonymous ended-link check passed.                                                                                                                                                                                                                                                                                                               |
| Blank screens/layout      | Stabilized shared provider identities and per-tab Retry boundaries preserve recording coordinators. Injected failures/retries cover 13 tabs. Chromium/WebKit geometry checks passed at nine widths and two landscape sizes; admin data remains free of horizontal scrolling.                                                                                                                                                                                                                                                       |
| Reported failures         | Full web suite: **1626 tests, 1624 passed, 0 failed, 2 existing skips**. iOS web regressions: 71 passed. TypeScript, formatting and lint passed with 0 lint errors and 41 existing warnings. Meaningful assertions retained.                                                                                                                                                                                                                                                                                                       |
| Previously untested flows | **13 authenticated browser/API flows passed against disposable Supabase**, including sign-out/relogin, trial expiry, admin Give Plus, recipient Claim Plus, support create/reply/status, payment controls, templates/strength retry, GPS retry, daily-step isolation, friendships/rivalries, nutrition/quota, challenge completion/missed-day/resume, missions with claiming disabled, and ended sharing. External messages/payments were not sent.                                                                                |
| Database/security         | Function lint passed with no errors. Five additive migrations repair Live Share, monotonic step sync, challenge completion, private RPC grants, and function integrity. Missing cooldown column, membership recovery ambiguity, scoped personalized XP return, completion-code generation and GPS millisecond/second conversion are repaired. Real SQL regression tests passed. Inventory: 55 tables, 69 policies, 119 SVJ functions; 127 public client files scanned for privileged secrets. No production writes or data resets. |
| Speed                     | Controlled cold Chromium 390×844 runs, 4× CPU and fixed network: median screen ready 4,550→4,095 ms; initial transfer 659→463 KB. Icon compression 533,169→373,931 bytes with identical pixels. Evidence: performance-loading.json and performance-assets.json. Physical phone timing is unverified.                                                                                                                                                                                                                               |

## Validated downloads

- [Validated implementation package: APK, AAB and unsigned IPA](https://github.com/SabariVJ/make-my-apk/actions/runs/37153044886/artifacts/11284143881).
- [Release branch builds](https://github.com/SabariVJ/make-my-apk/actions/workflows/ci.yml?query=branch%3Arelease%2Fplay-v1-compliance): select the successful run for the desired release commit, then **SVJ-validated-phone-artifacts**.
- Each package includes SHA256SUMS, build-metadata.json, exact build revision,
  expected hosted web revision, native capability version and signing report.
  The gate requires web, backend authorization, reward transactions, browser
  geometry, Android phone/watch/release and iOS native/device checks for that build.
- **IPA is unsigned** and must be signed using the existing sideload service.
- **Android uses an ephemeral validation identity** because GitHub has no
  production release key configured. APK is installable as a validation build;
  APK/AAB cannot update a differently signed installation or publish to Play.
  Preserve installed app data and supply the existing key for a normal upgrade.
- No simulator/emulator smoke jobs run. Production website publishing was not performed.

## Owner rollout and physical verification

1. Reconcile the deployed schema and grants, then apply the five additive
   `20261012…` migrations through the normal production process. Historical
   migration files remain unchanged; no production reset is needed. CI's
   temporary migration versions and credentials belong only to its disposable backend.
2. Publish the merged web revision separately in Lovable. Native wrappers still
   load `https://savaje-com.lovable.app`; installing the new wrapper alone does
   not publish web changes. Keep old pending recordings intact.
3. Configure the existing Android release keystore in the established GitHub
   secrets for an upgrade/Play-ready package. Sign the IPA with the existing service.
4. On both platforms, enable daily steps and walk 100 steps. Check permission,
   sensor/source, count, latest reading and successful website sync in Activity.
   Verify hardware-free devices report unsupported or use permitted history backup.
5. Start an outdoor workout in the foreground, lock the screen, walk, pause/resume,
   reopen, Finish, Save offline, reconnect and confirm one activity on the website.
   Repeat with daily steps enabled to check the independent controls. Sign-out
   must stop both collectors; a terminated recording must return paused with its route.
6. Verify configured Google provider login and phone deep links, real cross-device
   notification delivery, actual hosted QR image loading, external app handoffs,
   photo recognition with the configured AI service, and real-phone loading time.
   Local checks cover payment URLs/copy/QR element and scan quotas without sending
   WhatsApp/email, making payments or invoking paid recognition.

Deployed-schema parity, production authorization configuration, external provider
handoffs and physical sensors cannot be proven by isolated CI. These are explicit
owner follow-ups, not claims of completed hardware testing. See SECURITY_TRACKING_REVIEW.md.

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
