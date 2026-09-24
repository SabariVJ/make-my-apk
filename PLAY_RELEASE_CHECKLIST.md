# Play Console Release Checklist — SVJ (app.lovable.svj)

## 1. Pre-Submission Code Checks (✅ Completed)

| Check                                                               | Result                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| `bun install --frozen-lockfile`                                     | ✅ PASS                                               |
| `bunx tsc --noEmit`                                                 | ✅ PASS                                               |
| `bun run build` (web)                                               | ✅ PASS                                               |
| `bun run test`                                                      | ✅ 1,348 tests: 1,346 pass, 0 fail, 2 skipped         |
| `bunx eslint <changed files>`                                       | ✅ PASS — 0 errors, 0 warnings                        |
| `bunx prettier --check <changed files>`                             | ✅ PASS                                               |
| `git diff --check`                                                  | ✅ PASS                                               |
| `python3 scripts/test_android_themes.py`                            | ✅ 8/8 PASS                                           |
| `bun run cap:sync`                                                  | ✅ PASS — configuration/plugins synchronized          |
| GitHub Actions Android phone/wear lint, unit tests and debug builds | ✅ PASS in CI                                         |
| GitHub Actions release bundle validation                            | ✅ PASS — phone/wear AABs and shared signing identity |

**Verdict:** CODE + CI CHECKS PASS; physical-device verification remains

## 2. Signing Configuration

| Item            | Status                              |
| --------------- | ----------------------------------- |
| applicationId   | `app.lovable.svj` (unchanged)       |
| compileSdk      | 36                                  |
| targetSdk       | 36                                  |
| minSdk          | 24                                  |
| Release signing | Configured via env vars (see below) |
| Upload keystore | NOT present — operator must supply  |

### Environment Variables Required for Signed Release

```bash
export SVJ_KEYSTORE_PATH=/path/to/upload-keystore.jks
export SVJ_KEYSTORE_PASSWORD=<password>
export SVJ_KEY_ALIAS=<alias>
export SVJ_KEY_PASSWORD=<key-password>
```

The `android/app/build.gradle` reads these at build time. If any value is missing, the release signing config is inactive and Gradle will use debug signing.

**⚠ Do NOT generate or commit a new keystore.** Use the existing upload key from Play Console.

## 3. Play Console Data Safety Declaration

### Data Collection

| Data Type                                   | Usage                                   | Required      |
| ------------------------------------------- | --------------------------------------- | ------------- |
| Account info (email, display name)          | App functionality                       | Yes           |
| Profile photo                               | App functionality                       | No (optional) |
| Fitness, training, recovery and health data | App functionality, history and insights | Yes           |
| Precise/approx location and activity routes | GPS/activity recording                  | Yes           |
| Notifications and notification preferences  | Reminders and workout alerts            | Yes           |
| Device identifiers (Advertising ID)         | Ads, subject to UMP consent             | Yes           |

### Data Sharing

| Shared with  | Purpose                   |
| ------------ | ------------------------- |
| Google AdMob | Advertising               |
| Supabase     | Authentication & database |

### Data Security

| Declaration                | Value                              |
| -------------------------- | ---------------------------------- |
| Encrypted in transit       | ✅ Yes (HTTPS)                     |
| Deletion request supported | ✅ Yes (in-app + `/data-deletion`) |

## 4. App Content Declarations

- [ ] **Content Rating:** Complete IARC questionnaire (fitness/app — likely "Everyone")
- [ ] **Target Audience:** Select **18+** to match the signup attestation and Terms; no parental-consent flow exists
- [ ] **Data Safety form:** Fill per declarations above
- [ ] **Ads declaration:** Yes, app contains ads
- [ ] **Advertising ID:** Yes, app uses Advertising ID
- [ ] **Fitness/Health:** Declare if challenged during IARC — "Tracks physical activity progress"

## 5. Privacy & Legal URLs

| URL                            | Path              | Status                                                                             |
| ------------------------------ | ----------------- | ---------------------------------------------------------------------------------- |
| Privacy Policy                 | `/privacy`        | ✅ Implemented                                                                     |
| Terms of Service               | `/terms`          | ✅ Implemented                                                                     |
| Account Deletion               | `/delete-account` | ✅ Implemented                                                                     |
| Play Console Data Deletion URL | `/data-deletion`  | ✅ Same verified deletion flow; set `https://savaje-com.lovable.app/data-deletion` |

## 6. AdMob / UMP Consent

| Item                                                    | Status                                      |
| ------------------------------------------------------- | ------------------------------------------- |
| AdMob initialized after auth gate                       | ✅ Done                                     |
| UMP consent flow (requestConsentInfo → showConsentForm) | ✅ Done                                     |
| Privacy options form (showPrivacyOptionsForm)           | ✅ Done (Profile → Privacy Choices)         |
| Test ad devices configured                              | ⚠ Must set in AdMob dashboard or env var    |
| Consent form configured                                 | ⚠ Must create GDPR message in AdMob console |

**⚠ BLOCKER:** The AdMob consent message must be configured in the AdMob dashboard (EU User Consent policy). Without it, `isConsentFormAvailable` will be `false` and the consent form will not show, but the SDK will still block ads in EEA regions.

## 7. Reviewer Access

- [ ] Create a test account with email/password (not Google-only)
- [ ] Ensure the test account can complete onboarding
- [ ] Provide credentials in Play Console "Advanced settings → Account access details"

## 8. Listing Assets

- [ ] Hi-res icon (512×512)
- [ ] Feature graphic (1024×500)
- [ ] Screenshots (min 2, phone)
- [ ] Short description (80 chars)
- [ ] Full description (4000 chars)

## 9. Build Commands

```bash
# Local web build (validates TypeScript + bundle)
bun install --frozen-lockfile && bun run build

# Android sync (requires Java and Android SDK)
bun run cap:sync

# Debug build (no signing required)
cd android && ./gradlew assembleDebug

# Release build (requires signing env vars)
cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## 10. Known Limitations

1. **No automated Android build in CI** — native build must be done locally or in a CI with Java and Android SDK
2. **AdMob consent dashboard** — GDPR message must be configured before ads work in EEA
3. **12-testers-for-14-days** — New developer accounts require 12 closed testers for 14 days before production access
4. **Upload keystore** — Must be obtained from original Lovable build or a new one generated (and backed up securely)
5. **server.url in capacitor.config.ts** — Points to production `https://savaje-com.lovable.app`; cleartext traffic is disabled and removing the URL would break hosted server functions
6. **Privacy/legal review** — A qualified owner must review the public policy, retention language, Data Safety form, and support/refund process before publication
