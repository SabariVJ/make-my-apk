# SVJ fix-everything plan (detailed, stability first)

Goal: every known problem fixed or clearly handed off, before any new features. Work runs in the order below. Each step says what you will notice, what changes, and how it is checked.

---
## Step 1 - Known broken items (fix first)

| # | Problem | Fix | Checked by |
|---|---------|-----|-----------|
| 1.1 | Android tablet does not count steps on its own | Rewrite the phone step reader as SVJ's own code: reads the hardware step counter, remembers a starting point, handles restart, midnight and reboot, never double counts. Shows "Waiting for step sensor" if nothing arrives in 10 s. Health Connect used only as a backup, never added on top. | Code tests here; real proof needs you to install the new app and walk |
| 1.2 | Step diagnostics are hard to read | One "Step tracking status" card on Activity: permission, sensor found, listening, raw count, today's count, last error, with a "Fix" button for each problem | Screenshot check |
| 1.3 | Phone-to-website steps sync untested | Add "Synced 5s ago" label, retry when offline, stop syncing when the app closes | Test with a signed-in account; real phone check by you |
| 1.4 | Two failing checks (desktop width on Plus/Profile/Community/Leaderboard, support ticket screen) | Find why each fails, fix the screen or the outdated check | Full test suite green |
| 1.5 | Admin "Grant Plus" and "Claim Plus gift" never tried in the app | Run both with a real account, fix anything that breaks | Plus shows as active for the user |
| 1.6 | Blank screens after live preview refreshes ("must be used within ... provider") | Check every shared data source has the same protection already added to three of them; add a safety screen per tab so one crash never blanks the whole app | Force an error in each tab; only that tab shows "Something went wrong, retry" |

---
## Step 2 - Flows that were never tested end to end
Each is run signed in, with real data, and results written down:
- Sign in with Google (website and phone deep link), sign out, sign in again.
- 7-day trial: start, countdown, expiry screen, Plus unlock.
- UPI payment screen: QR shows, WhatsApp button, copy number, email fallback.
- Earn Plus: missions, XP progress, claim stays switched off as decided.
- Friends: send, accept, remove; rivalry create, cancel; notifications.
- Workouts: log, template, history, offline queue sends later.
- Nutrition: add meal, delete, daily totals, photo scan limit.
- 60-Day Challenge: complete a day, missed day, progress kept.
- Support ticket: create, admin replies, status updates.
- Live Share link: start, open link signed out, stop, link shows "Sharing has ended".

Anything broken here becomes a fix in this step.

---
## Step 3 - Reliability everywhere
- One shared "Could not load - Retry" message and loading placeholder on every tab.
- Phone storage safety for all saved data (same protection already used for the leaderboard).
- Visible "3 workouts waiting to sync" when offline.
- Clear, friendly messages instead of raw errors (no technical text shown to users).

---
## Step 4 - Security and data safety
- Run the security scan and database checks; fix or explain each finding.
- Confirm every table only lets people see their own private data.
- Admin powers checked only through the admin role list, never from the device.
- XP, rewards, memberships, friendships and rivalry history are never reset.

---
## Step 5 - Speed
- Load maps and charts only when opened.
- Shrink large pictures.
- Measure first open time before and after on a mid-range phone size.

---
## Step 6 - Hand-off for things only you can do
A short checklist for your computer: build the phone app, install on the tablet, walk 100 steps, send the status card screenshot and step log. Results decide whether 1.1 is fully done.

---
## What will not be done here
- Building the phone app file itself (needs Android tools on your computer).
- Real-phone walking tests.
- New features (step goals, weekly reports, coach, payments) wait until Steps 1-5 are green.

## Technical details
- 1.1: Capacitor plugin `VjPedometerPlugin` reworked around `SensorManager` `TYPE_STEP_COUNTER`, state in SharedPreferences (baseline, lastRaw, dateKey, bootCount), pure-Java state class with unit tests; `ActivityContext` uses it on Android, existing plugin kept for iOS.
- 1.3: `liveSteps.ts` exposes `updatedAt`; retry on reconnect; channel removed on unmount.
- 1.6: audit all React contexts for `globalThis` stabilization; per-tab error boundary in `App.tsx`.
- 2: Playwright with minted session; findings logged in `RELEASE_SPRINT_STATUS.md`.
- 4: security scan + linter; RLS/grant review on all `svj_*` tables including `svj_live_daily_steps`.
- Checks each step: `bunx tsgo --noEmit`, `bun run test`, build log.
