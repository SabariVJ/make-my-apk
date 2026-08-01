# Building the SVJ Android APK

Lovable can't compile an APK in the browser, but the project is Capacitor-ready.
Run these once on your own machine (needs Node + Android Studio / JDK 17):

1. Export the project to GitHub (top-right in Lovable) and `git clone` it.
2. `npm install`
3. `npx cap add android`
4. `npx cap sync android`
5. `npx cap open android`  → in Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Notes
- `capacitor.config.ts` currently points `server.url` at the Lovable preview URL,
  so the app always shows the latest build. After publishing, swap it for your
  published `.lovable.app` (or custom) domain.
- To ship a fully offline/bundled build instead, remove the `server` block and
  run `npm run build` before `npx cap sync android`.
- App id: `app.lovable.svj` — change it before uploading to Play Store.
