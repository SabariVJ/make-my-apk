# Building SVJ for Android

SVJ is configured as `app.lovable.svj` and uses the compiled files in `dist/client` by default.
This avoids coupling production APKs to a preview URL.

## Requirements

- Node.js 22
- JDK 17
- Android SDK / Android Studio
- A production Supabase publishable key

## Build and sync

```bash
npm ci
VITE_SUPABASE_URL=https://zzsxemupbdrhzmkwfdoy.supabase.co \
VITE_SUPABASE_PROJECT_ID=zzsxemupbdrhzmkwfdoy \
VITE_SUPABASE_PUBLISHABLE_KEY='<publishable-key>' \
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk` and must not be committed.

## Optional hosted shell

Set `VITE_PUBLIC_APP_URL` only to the final HTTPS production origin if the native app should load hosted assets. The default is safer: no `server` block and no cleartext traffic. Never use localhost or a preview-only URL for a release.

## OAuth callback

The native callback is `app.lovable.svj://auth/callback`. Add it to the Supabase redirect allow-list. Google Cloud's OAuth redirect URI remains the Supabase callback:
`https://zzsxemupbdrhzmkwfdoy.supabase.co/auth/v1/callback`.

Release signing credentials belong in CI secrets or an untracked local Gradle properties file; never commit keys or passwords.
