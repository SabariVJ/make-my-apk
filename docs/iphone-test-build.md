# SVJ on your iPhone (Windows, free Apple account)

This is a native personal test build, not an App Store release. GitHub builds it
on a Mac runner; AltStore Classic signs and installs it locally from Windows.
No Apple password, signing certificate, or paid membership belongs in GitHub.

## Download your build

1. Open [iPhone Test Build in GitHub Actions](https://github.com/SabariVJ/make-my-apk/actions/workflows/ios-test.yml).
2. Select a successful run for `release/play-v1-compliance`. Relevant pushes
   build automatically. Open an existing run and choose **Re-run all jobs** to
   rebuild the same commit manually.
3. While signed into GitHub, download the **SVJ-ios-test** artifact at the bottom
   of the run. Extract its ZIP on Windows; inside is `SVJ-ios-test.ipa`.
4. Transfer the IPA to the iPhone's Files app, for example through iCloud Drive.
   Do not extract the IPA itself.

The workflow also declares **Run workflow**, but GitHub only enables that
button when the workflow file exists on the default branch (`main`). This work
does not modify `main`; until that workflow is merged there, use automatic
release-branch builds or **Re-run all jobs**. Once it is present on `main`, select
`release/play-v1-compliance` in **Run workflow**. See
[GitHub's manual-run prerequisite](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

Standard hosted Mac runners are free for public repositories. The workflow
uses Xcode 26+, Swift Package Manager and iOS 15+. It verifies the arm64 device
binary and IPA layout before uploading the artifact. It does not sign, publish,
or distribute an App Store app.

## Install from Windows

Follow the [official AltStore Windows instructions](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows)
for the current installers and Windows prerequisites.

1. Install the required Apple versions of iTunes and iCloud, not their Microsoft
   Store versions, then install and start AltServer Classic on your PC.
2. Connect your unlocked iPhone by USB, choose **Trust** on the phone, and enable
   Wi-Fi sync for it in iTunes. Keep AltServer running.
3. From AltServer's tray menu, select **Install AltStore** and your iPhone.
   Enter your Apple account details only in AltServer/AltStore locally.
4. On your iPhone, open **Settings > General > VPN & Device Management**, select
   your developer profile and trust it. On iOS 16 or newer, also enable
   **Settings > Privacy & Security > Developer Mode**, restart, and confirm.
5. Open AltStore, sign in if prompted, then use **My Apps > +** to select
   `SVJ-ios-test.ipa` from Files. Keep the phone connected to AltServer during
   signing and installation. Open SVJ from your home screen.

This unsigned IPA cannot be installed directly by tapping a download link.
AltStore supplies your personal signing profile. If an entitlement-removal
prompt appears, allow unsupported entitlements to be removed; this build does
not depend on Associated Domains, push notifications or HealthKit.

## Refresh every week

A free-account signature expires after seven days. Before expiry, connect to
your PC/AltServer (USB, or the same Wi-Fi with sync enabled), open AltStore's
**My Apps**, and refresh both **SVJ** and **AltStore**. Check the expiry dates;
do not rely on automatic refreshing while your PC is off. Free accounts allow
three active sideloaded apps, including AltStore. See
[AltStore's limits and refresh guide](https://faq.altstore.io/altstore-classic/your-altstore).

## What this first version includes

| Feature                                                                   | iPhone test build                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Existing screens, account, Plus, challenges, training, nutrition, support | Shared hosted app/backend; internet required                                                 |
| Password and Google login                                                 | Existing HTTPS callback forwards to `app.lovable.svj://auth/callback`; no Associated Domains |
| Real steps                                                                | Core Motion; explicitly start/stop sessions on a physical iPhone                             |
| Activity rewards                                                          | Existing validation; no historical step imports or fabricated rewards                        |
| Continuous/background tracking                                            | Not included; backgrounding stops the session, returning does not auto-start                 |
| GPS route recording                                                       | Unavailable in this version                                                                  |
| Native reminders, Bluetooth, Apple Health, watch companion                | Deferred; unavailable native bridges are not invoked                                         |
| Advertising                                                               | Disabled on iOS                                                                              |

When asked, allow **Motion & Fitness** for step tracking. If denied, SVJ stays
stopped; enable access in iPhone Settings and explicitly start again. A simulator
cannot verify walking measurements. Google sign-in uses the already-configured
`https://savaje-com.lovable.app/auth/callback` redirect. If it is rejected, verify
that URL remains allowed in the existing Supabase/Google configuration; do not
put a client secret into the app.

The native shell always opens the hosted URL, so app-screen updates must also
be live there. Installing a new IPA alone does not deploy web changes. Signing
updates can preserve app data; deleting the app removes its local session data.

## Verify on your phone

- Install and launch; check both login methods and account persistence after closing/reopening.
- Navigate challenges, Plus, training, nutrition and support; verify normal account permissions.
- With Motion denied, confirm a clear stopped state and no counted steps.
- With Motion allowed, start, walk, stop; check real counts and that stopped walking adds nothing.
- Start twice quickly; check only one session is active. Background the app and return;
  check it remains stopped until you start again.
- Switch accounts; check the other account does not inherit the previous session/counts.
- Confirm unavailable GPS/device controls cannot start fake sessions and no ads are requested.
- Refresh SVJ and AltStore before seven days and confirm both still launch.

Automated TypeScript/web tests and a successful GitHub native build do not prove
installation, Apple-account signing, login redirects or sensor behavior on your
phone. Record those results separately during personal testing.

## Development

On Windows: `bun install --frozen-lockfile`, `bun run test:ios`,
`bunx tsc -b --noEmit`, `bun run build`, then `bun run cap:sync:ios`.
Commit the iOS project and SPM manifest, not generated web assets, build output,
Apple credentials or provisioning profiles. The Mac workflow re-syncs dependencies
before compiling. A local Mac with Xcode 26+ can use `bun run cap:open:ios`.

References: [Capacitor iOS requirements](https://capacitorjs.com/docs/ios),
[GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
