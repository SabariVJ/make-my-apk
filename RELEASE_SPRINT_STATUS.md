# SVJ Android Release-Hardening Sprint

## Final Status

| Phase | Status | Changed Files |
|-------|--------|--------------|
| Phase 0: Baseline | ✅ DONE | — |
| Phase 1: Runtime Security | ✅ DONE | TrialGate.tsx, googleAuth.ts, package.json |
| Phase 2: Account Deletion + Pages | ✅ DONE | account.functions.ts, delete-account.tsx, privacy.tsx, terms.tsx, AuthScreen.tsx, ProfileView.tsx |
| Phase 3: Android Feature Limits | ✅ DONE | Navigation.tsx, App.tsx |
| Phase 4: Ads and Consent | ✅ DONE | NativeBannerAd.tsx, ProfileView.tsx |
| Phase 5: Release Build Prep | ✅ DONE | build.gradle, .gitignore |
| Phase 6: Validation + Handoff | ✅ DONE | PLAY_RELEASE_CHECKLIST.md, COMPLIANCE_BLOCKERS.md |

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
| Item | Status |
|---|---|
| applicationId | `app.lovable.svj` (unchanged, correct) |
| compileSdk / targetSdk | 36 (current) |
| minSdk | 24 |
| AdMob APPLICATION_ID | In AndroidManifest via `@string/admob_app_id` = `ca-app-pub-1475355973043918~5474059195` |
| INTERNET permission | Present |
| Deep link scheme | `app.lovable.svj://auth/callback` (Google OAuth) |
| server.url | `https://savaje-com.lovable.app` (production URL, must keep for hosted server functions) |
| Upload keystore | NOT in repo (correct) |

### Unverified
- Native Android build (no local Android SDK in sprint environment)
- 16 KB page alignment (Android 15+)
- ProGuard/R8 minification (currently `minifyEnabled false`)

## Phase 6 — Validation Results

| Check | Result |
|---|---|
| `npm ci` | ✅ PASS |
| `npx prettier --write` | ✅ PASS |
| `npx eslint` | ✅ 0 errors (1 expected warning) |
| `npx tsc --noEmit` | ✅ PASS |
| `npm run build` | ✅ PASS |
| `npx tsx --test` | ✅ 40/40 PASS |
| `git diff --check` | ✅ PASS |
| `npx cap sync android` | NOT TESTED |
| Android lint | NOT TESTED |
| Android unit tests | NOT TESTED |
| `gradlew assembleDebug` | NOT TESTED |

## Unresolved Blockers

1. **Upload keystore** — Must be obtained from original build environment or generated fresh
2. **AdMob GDPR consent message** — Must be configured in AdMob dashboard
3. **Native Android build verification** — Must be tested locally or in CI
4. **Privacy policy content review** — Contact email, retention period should be verified by human
5. **12-testers-for-14-days** — If new Play Console developer account

## Next Commands for Human Operator

```bash
# 1. Review all changes
git diff --stat
git diff

# 2. Run tests locally
npx tsx --test src/integrations/supabase/client.server.test.ts

# 3. Build Android (requires local Android SDK)
npx cap sync android
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
