# Compliance Blockers — SVJ Android Release

## Active Blockers

### 1. Upload Keystore Missing ⛔

**Impact:** Cannot produce a signed release AAB for Play Console upload.

**Resolution:**
- The original Lovable build environment may have generated an upload keystore
- If lost, generate a new one (note: you will need to enroll in Play App Signing and upload the new key)
- Set environment variables: `SVJ_KEYSTORE_PATH`, `SVJ_KEYSTORE_PASSWORD`, `SVJ_KEY_ALIAS`, `SVJ_KEY_PASSWORD`
- **Never commit keystores to Git**

### 2. AdMob Consent Message Not Configured ⛔

**Impact:** Ads will not serve in EEA/UK regions without the required UMP consent form.

**Resolution:**
1. Go to [AdMob Console](https://apps.admob.com) → Privacy & messaging
2. Create a GDPR consent message
3. Configure it to match the app's data usage declarations
4. The message must be activated before ads will request/show consent forms
5. Without this, `isConsentFormAvailable` returns `false` and the SDK falls back to not serving ads in regulated regions

### 3. Native Android Build Not Verified ⛔

**Impact:** The web build passes but the native Android APK has not been tested in this sprint environment.

**Resolution:**
- Run `npx cap sync android` then `cd android && ./gradlew assembleDebug` locally
- Install the debug APK on a test device
- Verify all 5 tabs render on Android (Challenges, Train, Fuel, 60 Day, Profile)
- Verify Community and Leaderboard are hidden
- Verify trial-expired modal appears for locked users
- Verify AdMob consent flow and banner display
- Verify Privacy Choices button in Profile

### 4. Play Console 12-Testers Requirement ⚠

**Impact:** New developer accounts require 12 closed testers opted in for 14 consecutive days before production release is allowed.

**Resolution:**
- Register 12 test accounts in Play Console → Testing → Closed testing
- Create a release track and upload the signed AAB
- Ensure all 12 testers are opted in for 14 days before requesting production

## Schema Assumptions (Account Deletion)

The account deletion implementation (`src/lib/account.functions.ts`) assumes:

| Table | Assumption | Risk |
|---|---|---|
| `profiles` | Has `id` column matching `auth.users.id` | Low — standard Supabase pattern |
| `challenge_enrollments` | Has `user_id` column | Low — visible in migrations |
| `challenge_day_progress` | Has `user_id` column | Low — visible in migrations |
| `redemption_codes` | Has `redeemed_by` column (nullable) | Low — standard pattern |
| `friendships` | Has `user_id` and `friend_id` columns | Medium — naming not verified in production |
| `friend_requests` | Has `sender_id` and `receiver_id` columns | Medium — naming not verified in production |

**All tables use `ON DELETE CASCADE` from `auth.users`**, meaning Supabase will automatically cascade-delete owned rows when the Auth user is deleted. The deletion function additionally:
1. Anonymizes friendships (sets both sides to null)
2. Clears redemption code ownership
3. Calls `supabaseAdmin.auth.admin.deleteUser()` as the final step

**⚠ Unverified:** Production may use legacy table names (e.g., `program_enrollments` vs `challenge_enrollments`). The deletion code handles this gracefully by catching table-not-found errors and continuing.

## What Was Completed

### Commit 1: Harden Supabase administrator key selection
- `normalizeKey()` with `.trim()` + `||` for whitespace-safe fallback
- Priority: `SVJ_SUPABASE_SECRET_KEY` > `SUPABASE_SERVICE_ROLE_KEY`
- 20+ tests for key selection, fallback, and rejection

### Commit 2: Enforce admin-key guard on privileged server operations
- `requireAdminKey()` guard exported from `client.server.ts`
- All 6 server functions that use `supabaseAdmin` now check for a valid admin key before database access
- 40 total tests

### Commit 3: Release hardening (this sprint)
Files changed:
- `src/app/components/NativeBannerAd.tsx` — UMP consent flow + privacy options
- `src/app/views/ProfileView.tsx` — Privacy Choices button (Android) + delete account link
- `src/app/components/Navigation.tsx` — Hide Community/Leaderboard on Android
- `src/app/App.tsx` — Stale tab reset on Android + view guards
- `src/app/components/TrialGate.tsx` — Remove token logging
- `src/app/components/AuthScreen.tsx` — Privacy/terms links
- `src/lib/googleAuth.ts` — Remove token logging
- `android/app/build.gradle` — Release signing config from env vars
- `android/.gitignore` — Enforce keystore exclusion
- `src/routes/privacy.tsx` — Public privacy policy page
- `src/routes/terms.tsx` — Public terms of service page
- `src/routes/delete-account.tsx` — Public account deletion page
- `src/lib/account.functions.ts` — Server-authorized account deletion
- `src/routeTree.gen.ts` — Regenerated route tree

## Owner Action Items

1. **Generate/upload signing keystore** and set `SVJ_KEYSTORE_*` env vars
2. **Configure AdMob GDPR consent message** in the AdMob console
3. **Run native Android build** and test on a real device
4. **Fill Play Console Data Safety form** per the declarations in `PLAY_RELEASE_CHECKLIST.md`
5. **Create listing assets** (screenshots, icon, descriptions)
6. **Set up 12 closed testers** if this is a new developer account
7. **Verify privacy/terms content** — contact email, retention period, and any legal details should be reviewed by a human
