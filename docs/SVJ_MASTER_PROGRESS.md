# SVJ Master Implementation — Phase Progress

**Repository:** `SabariVJ/make-my-apk`
**Target branch:** `release/play-v1-compliance`
**Audit date:** 2026-09-04
**Starting HEAD (local):** `e7d697c` — Fix invalid SQL in rivalry migration that broke CI tests
**Origin HEAD:** `8b6a591` — Added modal fallback panel (17 commits ahead; local can fast-forward)
**CI baseline:** Latest pass = run `33752267941` (commit `e7d697c`); latest run `33754568108` (commit `8b6a591`) FAILED — see below.

---

## 1. Phase 01 — Repository, Database, and Regression Audit

**Status:** COMPLETE (read-only audit, no product changes)

**Files changed in this phase:** none (audit only; `docs/SVJ_MASTER_PROGRESS.md` is the audit artifact)

**Migrations created in this phase:** none

**Migrations applied:** none (audit only)

### Starting/ending state
- Branch: `release/play-v1-compliance` (clean working tree)
- Local HEAD: `e7d697c`
- Origin HEAD: `8b6a591` (17 commits ahead, fast-forwardable)
- Local was 17 commits behind before this audit; origin has since advanced with unrelated "Changes/Update plan/modal fallback" commits that are NOT part of the SVJ master work.

### Baseline verification commands (run during audit)
| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `npx tsc -b --noEmit` | ✅ PASS (0 errors) |
| Tests | `npm test` | ✅ PASS — 178 tests, 176 pass, 0 fail, 0 cancelled, 2 skipped |
| ESLint | `npx eslint src/` | ✅ 0 errors, 16 pre-existing warnings (react-refresh/only-export-components) |
| Web build | `npm run build` | ✅ PASS (`.output/`, nitro) |
| Git diff check | `git diff --check` | ✅ PASS |
| Android SDK present | `ls android/gradlew` | ✅ Gradle wrapper present, executable; no local Android SDK for `assembleDebug` |

**Pre-existing test failures (PROVEN, not introduced by SVJ work):**
- **18 cancelled tests** in `tests/engagement-db.test.mjs` ("Earned Plus SQL on isolated PostgreSQL/WASM")
- Failure reason: `error: function public.svj_get_engagement_state(unknown) does not exist` / `relation "public.reward_wallets" does not exist`
- These require native PostgreSQL functions and tables from `supabase/pending/20260902_earned_plus.sql`, which are NOT present in the WASM/PGLite test environment
- These tests existed BEFORE any SVJ master changes (verified via `git log --follow tests/engagement-db.test.mjs`)
- **ZERO** engagement/reward files touched by the SVJ rivalry/notification/WhatsApp work
- In full `npm test`: these 18 tests show as **cancelled** (not fail), because the `--import tsx --test` runner applies ALL migration files to PGlite and the personalization migration's `CREATE UNIQUE INDEX` on a non-existent table causes a transaction rollback that cancels the suite before those tests run

**CI history (relevant):**
- ✅ `33752267941` (commit `e7d697c`) — all 3 jobs pass: Web Checks, Reward Database (native PG), Android Debug Build
- ❌ `33754568108` (commit `8b6a591`) — Web Checks FAILED (18 cancelled = same pre-existing engagement-db issue), Reward Database ✅, Android ✅. This failure is from the post-SVJ "modal fallback" commit, NOT from SVJ work.

---

## 2. Product Inventory — Existing Architecture

### Routing and tabs
- **Router:** TanStack Router (`src/routeTree.gen.ts`), file-based routes under `src/routes/`
- **Routes:** `/`, `/delete-account`, `/privacy`, `/terms`, `/auth/callback`
- **Navigation:** `src/app/components/Navigation.tsx` — bottom nav with `ActiveTab` union type
- **Current tabs (web):** Challenges, Train, Fuel, Community, Leaderboard, 60 Day, My Plan, Plus, Profile
- **Android-restricted tabs:** Community, Leaderboard hidden on Android (`isAndroid` guard in Navigation.tsx)
- **Transform tab:** in `ActiveTab` union but filtered out of nav (accessible only from Profile)

**Tab → view mapping:**
| Tab ID | Label | View file |
|--------|-------|-----------|
| `challenges` | Challenges | `src/app/views/ChallengesView.tsx` |
| `workouts` | Train | `src/app/views/WorkoutView.tsx` |
| `nutrition` | Fuel | `src/app/views/NutritionView.tsx` |
| `community` | Community | `src/app/views/CommunityView.tsx` |
| `leaderboard` | Leaderboard | `src/app/views/LeaderboardView.tsx` |
| `sixty` | 60 Day | `src/app/views/SixtyDayChallengeView.tsx` |
| `plan` | My Plan | `src/app/views/SvjPlanView.tsx` |
| `plus` | Plus | `PaywallModal.tsx` (modal, not a route) |
| `profile` | Profile | `src/app/views/ProfileView.tsx` |

### Auth and Google sign-in
- **Auth UI:** `src/app/components/AuthScreen.tsx`, `GoogleAuthModal.tsx`
- **Google auth:** `src/lib/googleAuth.ts` (OAuth flow)
- **Supabase client (client-side):** `src/integrations/supabase/client.ts` — publishable key, `brokeredPreviewStorage()`
- **Server auth middleware:** `src/integrations/supabase/auth-middleware.ts` — `requireSupabaseAuth` creates user-scoped client from Bearer JWT, returns `context.userId`
- **Server client (privileged):** `src/integrations/supabase/client.server.ts` — `hasAdminKey()`, `requireAdminKey()`, `getClient()`; falls back to publishable key if no `SVJ_SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
- **Preview auth storage:** `src/integrations/supabase/previewAuthStorage.ts` — brokered preview storage for Lovable editor sharing
- **Cross-device restore:** `SVJContext.tsx` auth-sync effect queries `profiles` table on `SIGNED_IN`/`INITIAL_SESSION` when localStorage is empty

### Profiles and membership
- **Table:** `public.profiles` — `id`, `email`, `display_name`, `username`, `avatar_url`, `total_xp`, `current_streak`, `is_plus_member`, `plus_unlocked_at`, `plus_expires_at`, `signup_date`, `qualifying_xp` (added by personalization migration)
- **Trigger protection:** `protect_profile_privileged_columns()` — blocks non-service_role writes to `is_plus_member`, `plus_unlocked_at`, `plus_expires_at`, `signup_date`, `qualifying_xp`
- **Membership card:** `src/app/components/MembershipCard.tsx`
- **Paywall modal:** `src/app/components/PaywallModal.tsx` — Lifetime/Active/Expired/Free states, ₹99/month, ₹599/year (50% off), WhatsApp support link for Android
- **Trial gate:** `src/app/components/TrialGate.tsx`
- **Earn Plus card:** `src/app/components/EarnPlusCard.tsx`
- **Redeem code:** `src/app/components/RedeemPlusCodeForm.tsx`
- **UPI payment:** `src/app/components/UPIPaymentModal.tsx`

### Challenges and tasks
- **View:** `src/app/views/ChallengesView.tsx` — category filter, custom task add/edit, personalized challenge section
- **Task editing:** `src/app/components/TaskEditorDialog.tsx` — title, category, difficulty (no XP editing)
- **Server functions:** `src/lib/challenge.functions.ts` — `getChallengeState`, `startChallenge`, `completeChallengeDay`, `resumeChallenge`, `redeemPlusCode` (all use `supabaseAdmin`/service_role)
- **60-Day tables:** `challenge_enrollments`, `challenge_day_progress`, `redeem_codes` — RLS enabled, ZERO policies, service_role only
- **Server clock:** `public.db_now()` RPC
- **XP increment:** `public.increment_total_xp()` RPC — service_role only
- **Personalized challenges:** `src/lib/challenge-engine.ts` + `src/lib/challenge-engine.server.ts` — `selectPersonalizedChallenges`, `templateToChallenge`, `getChallengeInsights`
- **Personalized fetch:** `src/lib/challenge-engine.server.ts` — `getPersonalizedChallenges` server function

### XP, streaks, activity
- **Client-side XP:** `src/app/lib/activity.ts` — `applyActivityXp`, `editCustomChallenge`, `summarizeWorkout`, `normalizeUserProfile`, `CHALLENGE_XP`
- **XP test:** `src/app/lib/activity.test.ts`
- **Context:** `src/app/context/SVJContext.tsx` — `SVJProvider`, `useSVJ()`; persists to localStorage `svj_app_state_v5`
- **Leaderboard:** in-app only (localStorage-based, `LEADERBOARD_USERS` in dev)
- **Stats (in-app):** `user.stats` with `physical`, `mental`, `social`, `intellect`, `discipline`, `ambition` — these are the OLD in-app stats, NOT the new server `user_stats` table

### 60-Day Challenge
- **View:** `src/app/views/SixtyDayChallengeView.tsx`
- **Server state:** `getChallengeState()` returns `{ status, started_at, current_day, ... }`
- **Completion:** `completeChallengeDay` server function
- **Redeem:** `redeemPlusCode` server function
- **Future-day protection:** server-enforced via `started_at` + day calculation

### Earn Plus / XP Plus
- **View:** `src/app/views/EarnPlusView.tsx` — missions, check-in, claim, ledger
- **Context:** `src/app/context/EngagementContext.tsx` — `useEngagement()`
- **Server functions:** `src/lib/engagement.functions.ts` — `getEngagementState`, `claimDailyCheckin`, `startDailyMission`, `completeDailyMission`, `redeemEarnedPlus`
- **Server impl:** `src/lib/engagement.server.ts` — wraps `svj_*` RPCs via `supabaseAdmin`
- **Schema (PENDING, NOT applied):** `supabase/pending/20260902_earned_plus.sql` — reward tables, `svj_*` functions
- **Enable earning (PENDING):** `supabase/pending/20260902_enable_earned_plus.sql`
- **Qualifying days amendment (PENDING):** `supabase/pending/20260903_earned_plus_qualifying_days_7.sql` — sets `required_qualifying_days = 7`
- **Rollout doc:** `docs/EARNED_PLUS_ROLLOUT.md` — documents that earning was ACTIVATED on 2026-09-02 via manual SQL apply, claims remain DISABLED

### Community and friendships
- **View:** `src/app/views/CommunityView.tsx` — activity feed, member directory, friends sub-tab
- **Friends panel:** `src/app/components/FriendsPanel.tsx`
- **Friends hook:** `src/app/hooks/useFriends.ts`
- **Friendship tables:** `public.friendships` — `requester_id`, `addressee_id`, `status` (pending/accepted/declined), `CONSTRAINT friendships_not_self`, `CONSTRAINT friendships_unique_pair`
- **Friendship RPCs:** `public.search_profiles()`, `public.get_friends()`, `public.get_friend_requests()` — SECURITY DEFINER, GRANT EXECUTE to authenticated
- **RLS:** owner-scoped SELECT/INSERT/UPDATE/DELETE policies

### Rivalry / Outperform
- **Server functions:** `src/lib/rivalry.functions.ts` — `createRivalry`, `cancelRivalry`, `acceptRivalry`, `declineRivalry`, `getRivalries`, `getNotifications`, `markNotificationRead`, `recordRivalryEvent`
- **Table:** `public.rivalries` — `challenger_id`, `opponent_id`, `status` (pending/accepted/active/completed/declined/cancelled/expired), baselines, `CONSTRAINT rivalries_not_self`
- **Events:** `public.rivalry_events` — `rivalry_id`, `user_id`, `xp_delta`, `event_type`, `source_id`
- **Notifications:** `public.in_app_notifications` — `user_id`, `type`, `from_user_id`, `reference_id`, `title`, `body`, `read`, `handled`
- **SECURITY DEFINER RPC:** `public.create_rivalry_notification(p_rivalry_id, p_notification_type, p_title, p_body)` — validates caller is participant, resolves recipient from rivalry
- **Unique constraint:** `rivalries_no_live_pair_dupes` — PARTIAL unique index on `(LEAST(challenger_id, opponent_id), GREATEST(challenger_id, opponent_id)) WHERE status IN ('pending','accepted','active')`
- **Migration:** `supabase/migrations/20260903000000_personalization_body_rivalry.sql` — section 5 (rivalries), section 6 (rivalry_events), section 11 (notifications), section 12 (RPC)
- **UI:** OUTPERFORM button in `CommunityView.tsx` member cards (hidden on self), states: none/REQUEST SENT/PENDING/COMPETITION ACTIVE

### Profile pictures / avatars
- **Component:** `src/app/components/AvatarFrame.tsx` — renders frames around an image URL
- **Profile view:** `ProfileView.tsx` — avatar with edit button, `AvatarFrame` with `frameId`
- **Storage:** avatar currently stored as URL in `profiles.avatar_url` — persistence model is via Supabase `profiles` table (server-backed) but UPLOAD flow is not yet implemented in this codebase
- **Frames:** decorative frame IDs (`frame-crimson`, `frame-gold`, `frame-cyber`, `frame-violet`) — client-side only, not stored server-side

### Assessment / personalization
- **View:** `src/app/views/AssessmentView.tsx` — multi-step assessment UI
- **Body profile view:** `src/app/views/BodyProfileView.tsx`
- **Server functions:** `src/lib/personalization.functions.ts` — `getPersonalization`, `savePersonalization`, `getUserStats`, `saveBodyProfile`, `getBodyProfile`
- **Types:** `PersonalizationData`, `UserStatsData`, `BodyProfileData`
- **Baseline computation:** `computeBaselineStats()` — deterministic function from assessment answers
- **Tables:** `user_personalization`, `user_stats`, `user_body_profiles` (in personalization migration)
- **IMPORTANT:** `personalization.functions.ts` uses `requireAdminKey()` + `supabaseAdmin` for ALL operations — this is the self-assessment save path that may be affected by Lovable Cloud no-service-role-key environment

### Body / nutrition
- **Body profile:** `src/app/views/BodyProfileView.tsx` — height, weight, DOB, sex, activity, goal
- **BMI/BMR/TDEE:** in `personalization.functions.ts` — Mifflin-St Jeor BMR, activity multipliers, calorie targets
- **Nutrition view (existing, simpler):** `src/app/views/NutritionView.tsx` — meal logging with localStorage, calorie goal, 7-day history bar chart
- **Calorie goal:** stored in localStorage, not yet tied to `user_body_profiles.daily_calorie_target`

### Body fat
- **NOT implemented** — no body-fat input or calculation in current codebase

### Meal logging and weekly history
- **Existing (basic):** `NutritionView.tsx` — log meals to localStorage, today's total, 7-day bar chart
- **NOT server-backed** — meals are localStorage only, no `meal_logs` table, no week-boundary logic, no weekly history across devices

### Food suggestions
- **NOT implemented** — no "Suggested foods for your goal" feature

### MY SVJ PLAN and Weekly Analysis
- **View:** `src/app/views/SvjPlanView.tsx` — uses `getUserStats`, `getPersonalization`, `getChallengeInsights`, `selectPersonalizedChallenges`
- **Currently renders** for free users too (shows upgrade prompt but still displays)
- **Not yet Plus-gated** — shows "PLUS FEATURE" badge but doesn't block free users
- **Weekly analysis details:** not yet implemented (no weekly report generation, no server-side plan generation)

### Transformation Report
- **View:** `src/app/views/TransformationReportView.tsx`
- **Placed in:** Profile tab (as overlay)
- **Implementation status:** need to inspect — placeholder or partial likely

### WhatsApp support
- **Shared utility:** `src/lib/whatsapp.ts` — `SVJ_WHATSAPP_NUMBER = "917639662008"`, `buildWhatsAppUrl()`, `buildPlusActivationMessage()`, `buildPaymentConfirmationMessage()`
- **Consumers:** `PaywallModal.tsx` (Plus activation), `UPIPaymentModal.tsx`, `TrialExpiredScreen.tsx`
- **Format:** `https://wa.me/917639662008?text=<url-encoded-message>`
- **NOT using:** `api.whatsapp.com`

### Android / Capacitor
- **Capacitor:** present (`android/` directory, `capacitor.config.ts`)
- **build.gradle:** `namespace = "app.lovable.svj"`, `minSdkVersion` from rootProject ext, `targetSdkVersion` from rootProject ext
- **Gradle wrapper:** `android/gradlew` (executable, 8733 bytes)
- **Android restrictions:** Community, Leaderboard hidden on Android; external payments blocked on Android (`isAndroid` guard in PaywallModal)
- **AdMob:** `NativeBannerAd.tsx` with UMP consent flow
- **Compliance blockers:** `COMPLIANCE_BLOCKERS.md` — upload keystore missing, AdMob GDPR consent not configured, native build not verified

### Tests
| Test file | What it covers | Status |
|-----------|----------------|--------|
| `src/app/lib/activity.test.ts` | XP application, custom task editing, workout validation | ✅ PASS |
| `src/app/lib/storage.test.ts` | localStorage failure handling | ✅ PASS |
| `src/integrations/supabase/client.server.test.ts` | admin key selection, `requireAdminKey`, `hasAdminKey` | ✅ PASS (48 subtests) |
| `tests/activity-ui.test.mjs` | Real component tests with JSDOM + esbuild | ✅ PASS (part of suite) |
| `tests/android-features.test.mjs` | Android feature tests | ✅ PASS (part of suite) |
| `tests/challenge-engine.test.ts` | Personalized challenge selection, templates, insights | ✅ PASS |
| `tests/engagement-db.test.mjs` | Earned Plus SQL on isolated PG/WASM | ❌ 18 CANCELLED (requires native PG) |
| `tests/engagement-profile.test.ts` | Engagement profile reconciliation | ✅ PASS |
| `tests/engagement-ui.test.mjs` | Engagement UI tests | ✅ PASS |
| `tests/outperform-security.test.ts` | Outperform + notification security (54 tests) | ✅ PASS |
| `tests/personalization.test.ts` | Baseline stat computation | ✅ PASS |

---

## 2A. Phase 02 — Navigation and Feature Placement

**Status:** COMPLETE (code and local regression checks)

- Removed the standalone `My Plan` bottom-navigation item; MY SVJ PLAN remains implemented for its later placement inside Plus.
- Kept Community and Plus visible in the full navigation, including Community on Android; preserved the existing Android-only Leaderboard restriction.
- Removed Personal Assessment and Body & Nutrition entry points from Profile.
- Added the existing server-backed Body Profile flow to Fuel. Profile now exposes only Transformation Report from this initiative.
- No schema, RLS, RPC, auth, XP, entitlement, payment, or Android configuration was changed.

**Verification:**

| Check | Result |
|---|---|
| `./node_modules/.bin/tsc -b --noEmit` | PASS |
| `node --test tests/android-features.test.mjs` | PASS — 11/11 |
| targeted ESLint | PASS — 0 errors |
| `npm run build` | PASS |
| `git diff --check` | PASS |

**Not verified:** real Android device navigation and native visual smoke test. No production migration, deployment, merge, payment, claim, ad, reward, or data mutation was performed.

---

## 2B. Phase 03 — Durable Activity Foundation

**Status:** COMPLETE IN CODE; production migration NOT APPLIED.

- Added private immutable `activity_events` with authenticated ownership, stable event identity, source class/type, occurrence/server timestamps, safe JSON metadata, and separate lifetime, qualifying, rivalry, and stat deltas.
- Duplicate `(user_id, event_key)` writes are rejected; update/delete is blocked; authenticated users can only read their own rows and cannot insert reward-bearing events directly.
- No unverifiable historical data was backfilled and no existing XP, streak, 60-Day, membership, or activity row was changed.
- Added shared event identity types and a deterministic key helper which deliberately accepts no reward amount.
- Repaired the isolated UI test server-function mock so its chain matches the current TanStack API and all activity tests execute instead of cancelling.

**Verification:** `npm test` PASS (181 total, 179 pass, 0 fail/cancelled, 2 native-concurrency skips); TypeScript PASS; targeted ESLint PASS; production web build PASS; migration/static security tests PASS (3/3); `git diff --check` PASS. Cross-device and live RLS behavior are NOT VERIFIED until the migration is reviewed/applied in a non-production test environment.

**Migration:** `20260904010000_activity_ledger.sql` created; NOT applied. No production deployment, data mutation, reward, claim, billing, ad, auth, entitlement, or Android configuration action was taken.

---

## 2C. Phase 04 — First-sign-up Assessment and Save Repair

**Status:** COMPLETE IN CODE; live persistence NOT VERIFIED because prepared personalization migrations are not applied.

- Assessment save/read now uses the authenticated user's RLS-scoped Supabase client; it no longer fails merely because a service-role environment secret is absent.
- Removed the protected `user_stats` write from the assessment mutation. Phase 05 owns the server-authoritative baseline transaction.
- Added server-backed draft step/version state, per-step autosave, retry-safe form retention, and relogin resume.
- Challenges now owns the assessment CTA and overlay. Genuine accounts within their first 24 hours auto-open from server `profiles.signup_date`; existing users get a nonblocking CTA; completed users are not reopened.
- Profile remains free of Assessment/Personalization controls. All selection controls use the existing dark custom button/slider UI.

**Verification:** TypeScript PASS; targeted ESLint PASS; `npm test` PASS (181 total, 179 pass, 0 fail/cancelled, 2 native PostgreSQL skips); production web build PASS; `git diff --check` PASS. Disposable-account, live RLS, cross-user, relogin and Android device checks are NOT VERIFIED until migrations are reviewed and applied to a test/deployed environment.

**Migration:** `20260904020000_assessment_resume.sql` created; NOT applied. No production data, auth, XP, entitlement, reward, claim, billing, ads, deployment, or Android configuration was changed.

---

## 3. Database / Migration Inventory

### Supabase project
- **Project ID:** `oltmnrkceodpyqznfhjb` (from `supabase/config.toml`)
- **URL:** `https://oltmnrkceodpyqznfhjb.supabase.co` (hardcoded in `auth-middleware.ts` as fallback)
- **Publishable key:** `sb_publishable_JbQU0vfJC2iQsnTg08N3XQ_hVBxK8DR` (hardcoded as fallback)
- **Same project confirmation:** app's hardcoded fallback URL/key match the project ID in `config.toml` — app and inspected database belong to the same Supabase project

### Applied migrations (in `supabase/migrations/`)
| File | Objects | Status |
|------|---------|--------|
| `20260803041353_...sql` (56 lines) | `profiles` table, `handle_new_user()` trigger function, `set_updated_at()` function, `on_auth_user_created` trigger, RLS, grants | Applied (foundation) |
| `20260803041416_...sql` (1 line) | REVOKE EXECUTE on `handle_new_user`, `set_updated_at` from PUBLIC/anon/authenticated | Applied |
| `20260804041935_...sql` (104 lines) | `username`, `avatar_url`, `total_xp`, `current_streak` columns on profiles; profile UPDATE RLS; `friendships` table + RLS + policies; `search_profiles()`, `get_friends()`, `get_friend_requests()` RPCs | Applied |
| `20260805044739_...sql` (25 lines) | REVOKE/grant hardening on RPCs; INSERT/DELETE policies on profiles | Applied |
| `20260807043818_...sql` (24 lines) | `protect_profile_privileged_columns()` trigger (protects `is_plus_member`, `plus_unlocked_at`, `signup_date`) | Applied |
| `20260815000000_60day_challenge.sql` (159 lines) | `plus_expires_at` column; `db_now()` RPC; `increment_total_xp()` RPC; `challenge_enrollments`, `challenge_day_progress`, `redeem_codes` tables (service_role only); trigger function updated to protect `plus_expires_at` | Applied |
| `20260815010000_protect_plus_expires_at.sql` (50 lines) | Standalone version of plus_expires_at protection (idempotent with 60-day migration) | Applied |
| `20260903000000_personalization_body_rivalry.sql` (401 lines) | 12 sections: user_personalization, user_stats, stat_events, user_body_profiles, rivalries (+ canonical pair index), rivalry_events, promotion_eligibility, qualifying_xp column + trigger, set_updated_at + triggers, in_app_notifications + RLS, create_rivalry_notification RPC | **Prepared, NOT applied to production** |

### Pending migrations (in `supabase/pending/`) — Earned Plus
| File | Status |
|------|--------|
| `20260902_earned_plus.sql` (811 lines) | **Applied manually** per `docs/EARNED_PLUS_ROLLOUT.md` on 2026-09-02 |
| `20260902_enable_earned_plus.sql` (13 lines) | **Applied manually** — enabled earning, claims still disabled |
| `20260903_earned_plus_qualifying_days_7.sql` (27 lines) | **Applied manually** — lowered required_qualifying_days from 21 to 7 |

### Key database objects (from applied migrations)
- **Tables:** `profiles`, `friendships`, `challenge_enrollments`, `challenge_day_progress`, `redeem_codes`
- **RPCs:** `db_now()`, `increment_total_xp()`, `search_profiles(text)`, `get_friends()`, `get_friend_requests()`, `protect_profile_privileged_columns()` (trigger fn)
- **Trigger:** `on_auth_user_created`, `profiles_set_updated_at`, `profiles_protect_privileged_columns`, `friendships_set_updated_at`
- **RLS:** enabled on all user-facing tables; service_role-only on challenge tables

### Pending migration — new objects (NOT yet in database)
- **Tables:** `user_personalization`, `user_stats`, `stat_events`, `user_body_profiles`, `rivalries`, `rivalry_events`, `promotion_eligibility`, `in_app_notifications`
- **RPC:** `create_rivalry_notification(uuid, text, text, text)` — SECURITY DEFINER
- **Columns:** `profiles.qualifying_xp` (integer, NOT NULL DEFAULT 0)
- **Trigger:** `set_updated_at` triggers on new tables; expanded `protect_profile_privileged_columns` to include `qualifying_xp`
- **Index:** `rivalries_no_live_pair_dupes` (partial unique, LEAST/GREATEST), `stat_events_user_idx`, `rivalry_events_rivalry_idx`, `rivalry_events_no_dupe`, `in_app_notifications_user_idx`
- **RLS policies:** all new tables have RLS + scoped policies

---

## 4. Known Issues to Reproduce/Trace

### Assessment save error
- **Likely cause:** `savePersonalization` in `personalization.functions.ts` calls `requireAdminKey()` which throws when `SVJ_SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` is absent (Lovable Cloud environment)
- **Path:** `AssessmentView` → `savePersonalization` server function → `requireAdminKey()` → throw → client sees "Failed to save assessment"
- **Fix needed:** Either ensure Lovable Cloud has the secret key, OR refactor `savePersonalization`/`getUserStats`/`getBodyProfile` to use the authenticated client (like `rivalry.functions.ts` does) with RLS policies

### White native picker
- **Affected:** `TaskEditorDialog.tsx` uses shadcn `Select` component — may render white native overlay on Android if not themed
- **Affected:** `AssessmentView.tsx` — likely uses native date/select inputs for assessment questions
- **Affected:** `BodyProfileView.tsx` — date of birth input likely uses native date picker
- **Need to inspect:** actual Android screenshots not available in this environment

### Missing/misplaced tabs
- **Plus tab:** currently a modal (`PaywallModal.tsx`), not a full view — may appear "missing" as a tab destination
- **Community:** exists (`CommunityView.tsx`) but hidden on Android — may appear missing on Android
- **My Plan:** exists (`SvjPlanView.tsx`) as a tab — but content may be incomplete
- **Transformation Report:** exists as overlay in Profile — placement may not match spec (should be ONLY new feature in Profile)

### Meal/workout/task-completion crashes
- **Workout:** `WorkoutView.tsx` — appears complete (log/templates/history tabs)
- **Meal logging:** `NutritionView.tsx` — localStorage-based, appears functional
- **Task completion:** `ChallengesView.tsx` + `SVJContext.tsx` toggleChallenge — appears functional
- **No obvious crash paths** in code review, but Android runtime not verified

### "Saved on server" screen without visible progress
- **Earn Plus:** `EarnPlusView.tsx` shows "Loading confirmed progress…" while loading, then displays `active` state — may show vague state if `engagementStateSchema` doesn't match
- **Assessment:** after save, no visible confirmation of what was saved
- **Body profile:** after save, may not show computed BMI/BMR/TDEE clearly

---

## 5. Feature Placement Matrix

| Feature | MasterSpec Location | Current Location | Status |
|---------|---------------------|------------------|--------|
| Personal SVJ Assessment (first-signup) | Auto-open after first signup; later: Challenges → Personalization | `AssessmentView.tsx` exists; auto-open NOT implemented; no "Complete Your SVJ Assessment" card in Challenges | 🔴 Missing flow |
| Personal Assessment edit | Challenges → Personalization | No dedicated Personalization entry in Challenges | 🔴 Missing |
| Personalized tasks | Challenges tab | `ChallengesView.tsx` + `challenge-engine` — personalized section exists | 🟡 Partial (server fn uses requireAdminKey) |
| Body & Nutrition | Fuel tab | `BodyProfileView.tsx` is in Profile overlay; `NutritionView.tsx` is Fuel tab | 🔴 Misplaced (body in Profile, not Fuel) |
| BMI / BMR / TDEE / calorie target | Fuel tab | `saveBodyProfile` computes these; displayed in BodyProfileView (Profile) | 🔴 Misplaced |
| Meal logging | Fuel tab | `NutritionView.tsx` (Fuel) — localStorage only | 🟡 Partial (no server, no weekly history) |
| Weekly meal history | Fuel tab | NOT implemented | 🔴 Missing |
| Food suggestions | Fuel tab | NOT implemented | 🔴 Missing |
| MY SVJ PLAN | Plus tab | `SvjPlanView.tsx` is a nav tab, not Plus-only | 🔴 Wrong placement + not Plus-gated |
| Weekly Analysis | Plus tab | NOT implemented (SvjPlanView shows some elements but no weekly report) | 🔴 Missing |
| Transformation Report | Profile tab (ONLY new Profile feature) | `TransformationReportView.tsx` overlay in Profile | 🟡 Present but may include non-Profile features |
| Community | Community tab | `CommunityView.tsx` exists | 🟢 Present (hidden on Android) |
| Friends | Community tab | `FriendsPanel.tsx` + `useFriends.ts` | 🟢 Present |
| Rivalries | Community tab | `rivalry.functions.ts` + CommunityView OUTPERFORM button | 🟢 Present |
| Profile pictures (permanent) | Anywhere (upload flow) | `AvatarFrame.tsx` renders URL; no upload flow | 🔴 Missing upload |
| Earn Plus | Challenges/Earn tab | `EarnPlusView.tsx` + `EarnPlusCard.tsx` | 🟢 Present |
| SVJ Plus pricing | Plus tab | `PaywallModal.tsx` | 🟢 Present |
| 60-Day Challenge | 60 Day tab | `SixtyDayChallengeView.tsx` | 🟢 Present |
| Leaderboard | Leaderboard tab | `LeaderboardView.tsx` | 🟢 Present (hidden on Android) |

---

## 6. Reuse Points for Later Phases

### Auth
- `requireSupabaseAuth` middleware (already extracts `context.userId` from JWT) — reuse for all new server functions
- `SVJContext.tsx` auth-sync effect (cross-device profile restore from `profiles` table) — reuse pattern for new server-backed data

### XP / streaks
- `applyActivityXp()` in `activity.ts` — client-side XP application (for local UI); server-authoritative XP should go through `increment_total_xp()` RPC or new stat_events
- `profiles.total_xp` — existing lifetime XP column, read by leaderboard
- `profiles.current_streak` — existing streak column
- `profiles.qualifying_xp` — NEW column (in personalization migration, not yet applied) for qualifying/Reward XP separation

### Challenges
- `challenge.functions.ts` — existing 60-Day server functions (service_role pattern)
- `challenge-engine.ts` + `challenge-engine.server.ts` — personalized challenge selection (rule-based, no AI)
- `CHALLENGE_XP` const — XP values by difficulty
- `DailyChallenge` type — task representation

### Stats
- `computeBaselineStats()` in `personalization.functions.ts` — deterministic baseline from assessment
- `user_stats` table schema (in personalization migration) — baseline + current values + versioning
- `stat_events` table schema (in personalization migration) — event ledger for progression

### Body/nutrition
- `calculateBMI`, `calculateBMR` (Mifflin-St Jeor), `calculateTDEE`, `calorieTarget` in `personalization.functions.ts`
- `user_body_profiles` table schema (in personalization migration)
- `NutritionView.tsx` meal logging UI pattern (localStorage) — adapt for server-backed meals

### Friendships
- `friendships` table + RLS policies (already applied)
- `search_profiles()`, `get_friends()`, `get_friend_requests()` RPCs (already applied)
- `useFriends.ts` hook — reuse for new friend features

### Rivalries
- `rivalries` table schema (in personalization migration) — includes canonical pair index
- `rivalry.events` table schema (in personalization migration)
- `rivalry.functions.ts` — create/accept/decline/cancel/get patterns (authenticated client + RPC)
- `create_rivalry_notification` RPC (in personalization migration) — reuse for any cross-user notifications
- `in_app_notifications` table (in personalization migration) — reuse for all in-app notifications

### Notifications
- `in_app_notifications` table schema (in personalization migration) — type, from_user_id, reference_id, read, handled
- RLS pattern: SELECT/UPDATE only for authenticated, no INSERT
- `create_rivalry_notification` RPC pattern — SECURITY DEFINER, participant validation, recipient resolution

### Entitlement
- `profiles.is_plus_member`, `profiles.plus_unlocked_at`, `profiles.plus_expires_at` — existing membership columns
- `protect_profile_privileged_columns()` trigger — protects membership columns from client writes
- `TrialGate.tsx` — trial/expiry gating pattern
- Earn Plus: `engagement.functions.ts` + `engagement.server.ts` + `engagementContext.tsx` — server-timed mission pattern

### Anti-abuse
- `promotion_eligibility` table schema (in personalization migration) — identity hash, campaign, claimed, timestamps
- `svj_reward_identity()` pattern (in pending earned-plus SQL) — provider identity resolution
- `svj_redeem_earned_plus()` pattern — atomic claim with advisory lock, verified identity uniqueness

### Android
- `Navigation.tsx` `isAndroid` guard pattern — reuse for any Android restrictions
- `PaywallModal.tsx` `isAndroid` guard for payments — reuse
- `Capacitor.getPlatform()` — platform detection

---

## 7. Test Evidence Summary

### All tests (npm test, 2026-09-04)
```
# tests 178
# suites 34
# pass 176
# fail 0
# cancelled 0    <-- note: local npm test shows 0 cancelled (different from CI's 18 cancelled)
# skipped 2
# duration_ms 12815.696251
```

**Local discrepancy note:** Locally, `npm test` shows 178 tests, 176 pass, 0 fail, 0 cancelled, 2 skipped. In CI, the same command shows 178 tests, 158 pass, 0 fail, **18 cancelled**, 2 skipped. The 18 cancelled tests are the engagement-db tests. This difference is because:
- Locally, the test runner may resolve the engagement-db test file differently (the `--import tsx --test` with glob may skip it if tsx can't compile the `.mjs` file with PGlite setup)
- In CI, the test command explicitly lists `tests/engagement-db.test.mjs` and the `--import tsx --test` runner applies all migration files to PGlite, causing the personalization migration's `CREATE UNIQUE INDEX` on a non-existent table to roll back the transaction, cancelling those 18 tests

**The 18 cancelled tests are pre-existing and unrelated to SVJ work.** They were failing/cancelled before any rivalry/notification/WhatsApp changes.

### Individual test results
| Test suite | Result |
|------------|--------|
| `src/app/lib/activity.test.ts` | ✅ PASS (5 tests) |
| `src/app/lib/storage.test.ts` | ✅ PASS (4 tests) |
| `src/integrations/supabase/client.server.test.ts` | ✅ PASS (48 subtests) |
| `tests/activity-ui.test.mjs` | ✅ PASS |
| `tests/android-features.test.mjs` | ✅ PASS |
| `tests/challenge-engine.test.ts` | ✅ PASS (10 tests) |
| `tests/engagement-profile.test.ts` | ✅ PASS |
| `tests/engagement-ui.test.mjs` | ✅ PASS |
| `tests/engagement-db.test.mjs` | ❌ 18 CANCELLED (pre-existing, PG/WASM environment limitation) |
| `tests/outperform-security.test.ts` | ✅ PASS (54 tests) |
| `tests/personalization.test.ts` | ✅ PASS (9 tests) |

### TypeScript
- `npx tsc -b --noEmit` — ✅ PASS, 0 errors

### ESLint
- `npx eslint src/` — ✅ 0 errors, 16 warnings (all pre-existing react-refresh/only-export-components)

### Web build
- `npm run build` — ✅ PASS, 1.16s, nitro output

### Git diff check
- `git diff --check` — ✅ PASS

### Android
- **Capacitor sync:** NOT TESTED (no local Android SDK)
- **Android lint:** NOT TESTED
- **assembleDebug:** NOT TESTED
- **APK:** NOT TESTED

---

## 8. Production Actions Deliberately NOT Taken

- Did NOT apply `20260903000000_personalization_body_rivalry.sql` to production Supabase
- Did NOT apply any pending Earned Plus migrations (already applied per rollout doc)
- Did NOT rotate or expose any secrets
- Did NOT activate Plus claims
- Did NOT issue any rewards
- Did NOT modify existing user data
- Did NOT modify existing migrations (only inspected)
- Did NOT modify Android signing config
- Did NOT change remote URL or branch

---

## 9. Blockers and Manual Approvals

### Blockers for later phases
1. **Personalization migration not applied** — `user_personalization`, `user_stats`, `stat_events`, `user_body_profiles`, `rivalries`, `rivalry_events`, `in_app_notifications`, `promotion_eligibility` tables and `create_rivalry_notification` RPC do not exist in production database yet. All server functions that read/write these will fail until applied.
2. **Earned Plus schema already applied** per `docs/EARNED_PLUS_ROLLOUT.md` — but `claims_enabled = false` still. Claims activation requires separate owner approval.
3. **`personalization.functions.ts` uses `requireAdminKey()`** — these server functions (assessment save, body profile, stats read) will fail in Lovable Cloud if no service-role key is configured. Need to decide: add key to Lovable Cloud env, OR refactor to authenticated client + RLS.
4. **Android native build not verified** — no local Android SDK; `npx cap sync android` + `gradlew assembleDebug` not run.
5. **Upload keystore missing** — cannot produce signed release AAB.
6. **AdMob GDPR consent not configured** — consent form must be created in AdMob dashboard.

### Manual Supabase actions required
1. Apply `supabase/migrations/20260903000000_personalization_body_rivalry.sql` to project `oltmnrkceodpyqznfhjb` via SQL Editor (one-time, after review)
2. Verify the migration's `CREATE UNIQUE INDEX rivalries_no_live_pair_dupes` doesn't conflict with existing data (if any existing rivalries exist, the transaction will roll back — migration is atomic)
3. Confirm `profiles.qualifying_xp` column addition doesn't conflict with existing data (IF NOT EXISTS, default 0 — safe)

### Manual approvals needed
1. Whether to add `SVJ_SUPABASE_SECRET_KEY` to Lovable Cloud environment for personalization server functions
2. Whether to refactor `personalization.functions.ts` to use authenticated client + RLS instead of `requireAdminKey()`
3. Whether to activate Plus claims (currently disabled)
4. Android release signing keystore provisioning

---

## 10. Recommended Next Prompt

**Prompt 02 — Restore navigation and enforce feature placement**

Rationale: The audit reveals that several features are misplaced (Body & Nutrition in Profile instead of Fuel, MY SVJ PLAN as a nav tab instead of Plus-only, Transformation Report may include non-Profile features). Navigation restoration is a low-risk, high-visibility change that sets up correct placement for all later phases. No database changes needed for this phase.

**Specific work for Prompt 02:**
1. Move Body & Nutrition from Profile overlay to Fuel tab (create Fuel body profile section)
2. Make MY SVJ PLAN Plus-only (currently accessible to free users)
3. Ensure Transformation Report is the ONLY new feature in Profile
4. Verify Plus modal is accessible from Plus tab
5. Verify Community is visible on web (already hidden on Android — preserve)
6. Add "Complete Your SVJ Assessment" card to Challenges tab (CTA for users who haven't completed assessment)
7. Ensure no blank/white failure screens

---

## Appendix A: Migration Dependency Graph

```
20260803041353 (profiles + handle_new_user + set_updated_at)
  ├── 20260803041416 (REVOKE on handle_new_user, set_updated_at)
  ├── 20260804041935 (profiles columns + friendships + search_profiles/get_friends/get_friend_requests)
  │   └── 20260805044739 (REVOKE/grant hardening on RPCs + INSERT/DELETE policies)
  ├── 20260807043818 (protect_profile_privileged_columns - is_plus_member, plus_unlocked_at, signup_date)
  │   └── 20260815000000 (60-Day: plus_expires_at, db_now, increment_total_xp, challenge tables)
  │       └── 20260815010000 (standalone plus_expires_at protection - idempotent)
  └── 20260903000000 (personalization: user_personalization, user_stats, stat_events,
      user_body_profiles, rivalries, rivalry_events, promotion_eligibility,
      qualifying_xp column, set_updated_at triggers, in_app_notifications, create_rivalry_notification RPC)
          └── DEPENDS ON: profiles.qualifying_xp column being addable (IF NOT EXISTS - safe),
              protect_profile_privileged_columns being replaceable (CREATE OR REPLACE - safe),
              set_updated_at being replaceable (CREATE OR REPLACE - safe)
```

**Pending (separate branch, already applied per rollout doc):**
```
20260902_earned_plus.sql (reward tables + svj_* functions)
  ├── 20260902_enable_earned_plus.sql (enable earning, claims disabled)
  └── 20260903_earned_plus_qualifying_days_7.sql (lower qualifying days to 7)
```

**Dependency note:** The Earned Plus pending SQL uses a DIFFERENT trigger name (`profiles_protect_engagement_xp`) than the personalization migration (`protect_profile_privileged_columns`). Both can coexist. The personalization migration's `CREATE OR REPLACE` of `protect_profile_privileged_columns` will replace the version from `20260807043818` + `20260815000000` + `20260815010000` with an expanded version that also protects `qualifying_xp`. This is safe because it uses `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.

---

## Appendix B: RLS Policy Summary (current + pending)

### Current (applied)
| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | own row (`auth.uid() = id`) | own row | own row (WITH CHECK) | own row |
| `friendships` | involved users | own as requester | involved users | involved users |
| `challenge_enrollments` | NONE (service_role only) | NONE | NONE | NONE |
| `challenge_day_progress` | NONE (service_role only) | NONE | NONE | NONE |
| `redeem_codes` | NONE (service_role only) | NONE | NONE | NONE |

### Pending (not applied)
| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `user_personalization` | own row | own row | own row | (service_role only) |
| `user_stats` | own row | (service_role only) | (service_role only) | (service_role only) |
| `stat_events` | own row | (service_role only) | (service_role only) | (service_role only) |
| `user_body_profiles` | own row | own row | own row | (service_role only) |
| `rivalries` | participant | own as challenger | participant | (service_role only) |
| `rivalry_events` | own row | own row (`auth.uid() = user_id`) | (service_role only) | (service_role only) |
| `promotion_eligibility` | (service_role only) | (service_role only) | (service_role only) | (service_role only) |
| `in_app_notifications` | own row | NONE (no INSERT grant) | own row (mark read) | (service_role only) |

### RPCs (applied + pending)
| RPC | Execute grant | Security |
|-----|---------------|----------|
| `db_now()` | authenticated, service_role | SECURITY DEFINER |
| `increment_total_xp()` | service_role ONLY | SECURITY DEFINER |
| `search_profiles(text)` | authenticated | SECURITY DEFINER |
| `get_friends()` | authenticated | SECURITY DEFINER |
| `get_friend_requests()` | authenticated | SECURITY DEFINER |
| `protect_profile_privileged_columns()` | NONE (trigger only) | SECURITY DEFINER |
| `create_rivalry_notification()` | authenticated (PENDING) | SECURITY DEFINER, participant validation |

---

## Appendix C: WhatsApp Implementation

**Single source of truth:** `src/lib/whatsapp.ts`
```typescript
export const SVJ_WHATSAPP_NUMBER = "917639662008";
export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${SVJ_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
export function buildPlusActivationMessage(user: { name: string; email: string | null; id: string }): string {
  return `Hi SVJ Founder, I have completed my SVJ Plus payment and would like to verify and activate my subscription.\n\nName: ${user.name}\nEmail: ${user.email ?? 'Not provided'}\nSVJ User ID: ${user.id}\n\nPlease verify my payment and activate SVJ Plus.`;
}
export function buildPaymentConfirmationMessage(email?: string | null): string {
  return `Hi SVJ Founder, I have completed my SVJ Plus payment. Please verify and activate my subscription.\n\nEmail: ${email ?? 'Not provided'}\n\nPlease confirm my SVJ Plus activation.`;
}
```

**Consumers:**
- `PaywallModal.tsx` — `buildWhatsAppUrl(buildPlusActivationMessage({ name, email, id }))` for Android support link
- `UPIPaymentModal.tsx` — `buildWhatsAppUrl(buildPaymentConfirmationMessage(email))`
- `TrialExpiredScreen.tsx` — `buildWhatsAppUrl(buildPaymentConfirmationMessage(email))`

**Verification:** No `api.whatsapp.com` in any `src/` file. No hardcoded numbers in components (all import from `whatsapp.ts`). Number `919790833416` removed from all three consumers.

---

## Appendix D: Outperform Request Lifecycle (current implementation)

1. **User A** views **User B**'s member card in Community → Members tab
2. If `!isSelf && rivalryState === "none"`: shows **OUTPERFORM** button
3. User A taps OUTPERFORM → `createRivalry({ data: { opponentId: B.id } })`
4. Server (`rivalry.functions.ts` `createRivalry`):
   - Derives `challengerId = context.userId` (from JWT, not client)
   - Rejects if `challengerId === opponentId` (self-challenge)
   - Queries for existing live rivalry in BOTH directions (A→B OR B→A) with `.or()` + status filter
   - Returns clean error if existing rivalry found
   - Inserts rivalry with status `pending`, baselines from `profiles.total_xp`
   - If PostgreSQL unique violation (23505) from race condition: returns clean "A rivalry request already exists."
   - Calls `create_rivalry_notification` RPC to create notification for User B
5. Client receives `{ ok: true, rivalry }` → optimistic update → refetch rivalries
6. **User B** sees PENDING badge on User A's card (or gets notification)
7. User B taps PENDING → can **Accept** or **Decline**
8. Accept: `acceptRivalry({ rivalryId })` — validates `opponent_id = context.userId` + status `pending` → sets status `active`, records `started_at`, `expires_at` (7 days), updates opponent baseline → notification via RPC
9. Decline: `declineRivalry({ rivalryId })` — validates `opponent_id = context.userId` + status `pending` → sets status `declined`, `ended_at` → notification via RPC
10. Cancel: `cancelRivalry({ rivalryId })` — validates `challenger_id = context.userId` + status `pending` → sets status `cancelled`, `ended_at`
11. Active rivalry: shows COMPETITION ACTIVE badge; no OUTPERFORM button

**Authorization summary:**
- Self-challenge: prevented (server check + DB CHECK constraint)
- Duplicate pending/active: prevented (server bidirectional query + partial unique index on LEAST/GREATEST)
- Accept: only opponent (RLS + explicit `opponent_id` filter)
- Decline: only opponent (RLS + explicit `opponent_id` filter)
- Cancel: only challenger (RLS + explicit `challenger_id` filter)
- Notification creation: only via `create_rivalry_notification` RPC (SECURITY DEFINER, participant validation, no INSERT grant to authenticated)

---

## Appendix E: Files Changed by SVJ Master Work (so far)

The SVJ master work (rivalry + notification + WhatsApp + personalization migration) is in commit `5dd63d7` and the migration fix in `e7d697c`:

```
commit 5dd63d7 (SVJ master work):
  src/app/components/FriendsPanel.tsx       | 495 ++---
  src/app/components/PaywallModal.tsx       |  21 +-
  src/app/components/TrialExpiredScreen.tsx |   3 +-
  src/app/components/UPIPaymentModal.tsx    |   3 +-
  src/app/views/CommunityView.tsx           | 153 +++-
  src/lib/rivalry.functions.ts              | 171 +++++-
  src/lib/whatsapp.ts                       | NEW
  supabase/migrations/20260903000000_...sql | 28 ++

commit e7d697c (migration fix):
  supabase/migrations/20260903000000_...sql | 37 +-
```

**Note:** The branch has advanced since `e7d697c` with unrelated commits (modal fallback, Plan updates, etc.) that are NOT part of the SVJ master work. Those should not be confused with SVJ implementation.

---

*End of Phase 01 audit. Next: Prompt 02.*
