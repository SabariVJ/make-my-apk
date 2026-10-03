# SVJ detailed upgrade roadmap (stability first, long-term vision)

Existing surfaces reviewed: Activity (steps, GPS, routes, history), Train (strength, goals, recovery, plan, templates, records), Fuel (nutrition), Community (friends, rivalry, leaderboard, challenges), 60-Day Challenge, Rewards/Earn Plus, Profile/Body profile, Connected Devices, Wear OS, Admin, Support, Trial/Plus/UPI.

Each item lists: what the user sees, what changes behind it, effort (S=1-2 days, M=3-5, L=1-2 weeks), and done-when.

---
## PHASE 0 - Stability (weeks 1-2)

| # | Item | Detail | Effort | Done when |
|---|------|--------|--------|-----------|
| 0.1 | App-owned Android step plugin | Native step-counter reader with saved baseline, reboot/midnight/duplicate handling, timeout message "Waiting for step sensor", Activity diagnostics card (permission, sensor, listener, raw, daily, last error). Health Connect as secondary source, never added on top. iOS keeps current plugin. | L | Real tablet shows positive steps after walking. Needs user's Android toolchain. |
| 0.2 | Live step sync verification | Add "Synced 5s ago" label and offline retry on the website; confirm phone-to-web within 3s on a real phone. Display only, never XP. | S | Walk with phone, web count rises without reload |
| 0.3 | Fix 2 failing tests | Desktop-width test (Plus/Profile/Community/Leaderboard) and support ticket UI test. | S | Test suite fully green |
| 0.4 | End-to-end checks of untested flows | Admin grant Plus, Plus gift claim, trial expiry gate, UPI/WhatsApp fallback, Earn Plus mission flow (claims stay off). | M | Each flow run with a real account, results logged |
| 0.5 | Error and loading consistency | One shared "could not load, retry" and skeleton pattern for every tab; per-tab error boundary so one crash never blanks the app; audit leftover context-crash risk. | M | No tab can blank the whole app |
| 0.6 | Storage and offline safety | Extend the quota-safe cache to all local state; workout queue retry status visible ("3 sessions waiting to sync"). | S | No storage quota errors |
| 0.7 | Security pass | Security scan, database linter, RLS and grants review on all svj_* tables (including live steps), admin checks always via role lookup. | S | Scan clean or findings justified |
| 0.8 | Performance | Lazy-load heavy views (maps, charts), image sizes for hero assets, measure first-load time. | M | Faster first open on mid-range Android |

---
## PHASE 1 - Upgrade existing features (weeks 3-8)

### A. Activity and steps
- A1 Step goal and ring (S): daily goal (default 8,000, adjustable), progress ring on Home/Activity, goal-hit celebration, 7-day streak. Needs a goal field on the profile.
- A2 Weekly report (M): Monday summary card: steps, active minutes, distance, best day vs. last week.
- A3 GPS recording polish (M): auto-pause, lap/split times, pace and elevation chart, screen-off reliability tips.
- A4 Route sharing and segments (L): share a route to friends, segment leaderboards (tables already exist).
- A5 Wear OS heart rate (M): show live heart rate and zones on phone during a workout; post-workout zone summary.
- A6 Device hub (S): Connected Devices shows each source, last sync, and a one-tap fix for permission issues.

### B. Training
- B1 Progressive overload (L): after each session suggest next weight/reps from last performance and effort rating; explain why ("you hit all reps at RPE 7"). Builds on the existing deterministic engine, no AI.
- B2 Deload and recovery link (M): auto-suggest a lighter week when readiness is low for several days.
- B3 Workout-in-progress tools (M): rest timer with vibration, plate calculator, superset grouping, per-exercise notes.
- B4 PR celebrations (S): confetti and share card on a new personal record; PR timeline on Records.
- B5 Plan flexibility (M): swap exercise for equipment at hand, move/skip a session with reason, reschedule missed sessions.
- B6 Exercise guidance (M): short cue text and muscle diagram per exercise; optional video links.

### C. Nutrition
- C1 Fast logging (M): recent and favorite foods, "copy yesterday", meal presets.
- C2 Barcode scan (M): scan packaged food via camera, look up an open food database.
- C3 Macros and water (M): protein/carbs/fat targets, water tracker, weekly trend vs. target.
- C4 Training-aware targets (S): higher calorie/protein suggestion on heavy training days.
- C5 Scan quota clarity (S): show remaining daily photo scans and what Plus unlocks.

### D. Recovery and body
- D1 Readiness on Today (S): one score with top reason ("sleep low, soreness high").
- D2 10-second check-in (S): sleep, soreness, mood sliders with reminders.
- D3 Body progress (M): weight and measurement trends, progress photos (private), before/after compare inside the Transformation report.

### E. Social and motivation
- E1 Friend activity feed (M): workouts, PRs, streaks with reactions.
- E2 Rivalry upgrades (M): head-to-head history, rematch button, lead-change notifications.
- E3 Group challenges (L): create a challenge with friends (steps, workouts, XP), live board, winner badge.
- E4 Weekly leagues (M): leaderboard tiers with promotion and relegation each week.
- E5 60-Day Challenge polish (S): daily recap, missed-day recovery rules, finish certificate card.
- E6 Reward clarity (S): one "How XP works" screen, XP history by source.

---
## PHASE 2 - Growth and monetization (weeks 9-14)
- G1 Guided onboarding (M): 60-second setup (goal, experience, days, equipment, step goal) ending in a personalized first-week plan and first task.
- G2 Trial journey (M): day 1, 3, 6 in-app cards showing achievements so far and the Plus benefits; expiry reminder.
- G3 Plus value page (S): clear comparison, real feature previews, Earn Plus path shown as an alternative.
- G4 Automated payment (L): replace manual UPI + WhatsApp activation with a payment provider so Plus activates automatically. Provider choice needed at build time (Razorpay for India vs. Stripe/Paddle).
- G5 Referral program (M): invite link, both get Plus days after friend completes first workout; abuse limits server-side.
- G6 Smart notifications (M): usual-workout-time reminders, streak-at-risk, friend/rivalry events, quiet hours (builds on existing notification system).
- G7 Admin analytics (M): funnel (install, signup, trial, activation, paid), retention, support queue, Plus grants log.
- G8 Support (S): in-app FAQ, ticket status push.

---
## PHASE 3 - Long-term vision (months 4-8)
- V1 AI coach (L): weekly plain-language review from training, nutrition, sleep and steps; ask-a-question chat; server-side with Lovable AI; never changes XP.
- V2 Food photo logging with AI estimate and user correction (L).
- V3 Health platform sync (L): Apple Health and Health Connect two-way; Garmin/Fitbit import.
- V4 Clubs (L): communities with coach programs, events, club leaderboards.
- V5 Coach marketplace / paid programs (L).
- V6 Localization (M): Hindi, Tamil, others; unit and currency settings.
- V7 Public shareable profile and progress cards (M).
- V8 Full offline-first mode with background sync (L).

---
## Order of delivery
```text
Phase 0 (all) -> A1,B4,D1,C1 (quick wins) -> B1,B2,A2 -> E1-E2 -> G1,G2,G6 -> G4,G5 -> E3,E4 -> Phase 3
```

## Rules for every item
- XP, rewards, memberships, friendships, rivalry history are never reset; database changes are additive.
- XP and rewards stay server-authoritative; synced display data never feeds rewards.
- Each item ships with tests and a flag or safe fallback where it changes existing behavior.

## Technical notes
- Native Java/Kotlin work (0.1, A5, V3) cannot be built in this sandbox; user builds with `bun run build`, `bunx cap sync android`, `./gradlew assembleDebug`, `adb logcat`.
- New server logic via `createServerFn`; every new table gets grants and RLS in the same migration; realtime channels cleaned up on unmount.
- Payment (G4) and AI (V1, V2) need provider decisions when started.

## On approval
Begin Phase 0 items 0.3-0.8 (buildable here) and write the native plugin code for 0.1 for the user to build and test; then quick wins A1, B4, D1, C1.
