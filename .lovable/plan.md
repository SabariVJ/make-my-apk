# SVJ long-term roadmap: stability first, then growth

Goal: make what exists trustworthy, then add features in phases. Covers Activity, Training, Nutrition, Social, Growth/Monetization.

## Phase 0 - Stability (first, ~2 weeks)
1. Step counting on Android: build the app-owned native step plugin (SensorManager step counter, persisted baseline, reboot/midnight handling, diagnostics panel, Health Connect as secondary source without double counting). Already designed; not yet built. Needs a real-device test on the user's machine.
2. Verify the new live step sync (phone to website) on a real phone; add a "last synced" indicator and offline retry.
3. Fix the two long-failing tests (desktop width layout, active support ticket UI) so CI is fully green.
4. Test end-to-end the untested flows: admin grant Plus, Plus gift claim, Earn Plus claims (currently `claims_enabled=false`), WhatsApp/UPI activation fallback.
5. Reliability hardening: error boundaries per tab, consistent loading/empty states, storage-quota safety for all cached data, and a single "something went wrong, retry" pattern.
6. Security pass: re-run security scan, review RLS on the new live-steps table and all `svj_*` tables, confirm no secrets on the client.

## Phase 1 - Upgrade existing features (~1-2 months)
Activity
- Daily/weekly step goals with streaks, ring progress, and a weekly summary.
- GPS activity polish: auto-pause, split times, route sharing, segment leaderboards.
- Wear OS: live heart rate on the phone screen during workouts.

Training
- Progressive overload suggestions after each session (weight/rep targets), deload weeks when recovery is low.
- Rest timer, plate calculator, superset support, exercise video/cue notes.
- Personal-record celebrations and a PR history timeline.

Nutrition
- Faster logging: recent/favorite foods, copy yesterday, barcode scan.
- Macro and water tracking, weekly nutrition trend vs. target.
- Link intake to training load (suggest calories on heavy days).

Recovery
- Daily readiness score shown on Today; sleep and soreness check-in in under 10 seconds.

Social
- Friend activity feed with reactions, group challenges, weekly league resets.
- Rivalry upgrades: head-to-head history, rematches, notifications on lead changes.

## Phase 2 - Growth and monetization (~2-3 months)
- Onboarding: 60-second guided setup that ends with a personalized first-week plan (shortens time to first workout).
- Trial journey: day 1/3/6 in-app messages showing what the user achieved, soft paywall preview of Plus benefits.
- Plus: clear benefit list, automated payment confirmation (replace manual UPI + WhatsApp activation with a payment provider), referral rewards (friend joins, both get Plus days).
- Smart notifications: workout reminders at the user's usual time, streak-at-risk nudges, respecting quiet hours.
- Admin dashboard: funnel metrics (signup, trial start, activation, conversion, retention) and support-ticket queue.

## Phase 3 - Long-term vision (3-6+ months)
- AI coach: weekly review in plain language from training, nutrition, sleep and steps data (via Lovable AI, server-side).
- Food photo logging with AI estimate (extend existing scan feature).
- Apple Health / Health Connect two-way sync, Garmin/Fitbit import.
- Clubs/communities with coach-led programs and events.
- Coach marketplace or paid programs.
- Localization (Hindi, Tamil, others) and offline-first mode.
- Public profile pages and shareable progress/transformation cards.

## Working rules
- Each phase ships in small releases, each with tests, no regressions to XP, memberships, friendships, or rivalry history.
- XP and rewards stay server-authoritative; synced display data never feeds rewards.
- Database changes are additive only.

## Technical notes
- Native work (Java/Kotlin) cannot be built or run in this sandbox; it needs the user's Android toolchain (`bun run build`, `bunx cap sync android`, `./gradlew assembleDebug`, `adb logcat`).
- New server logic uses `createServerFn`; new tables need grants plus RLS in the same migration.
- Payment automation and AI coach need provider choices at implementation time.

## Proposed next step on approval
Start Phase 0 items 3, 4, 5 and 6 (buildable here), and prepare item 1's native plugin code for the user to build and test.
