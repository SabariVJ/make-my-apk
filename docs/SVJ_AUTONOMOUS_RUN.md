# SVJ AUTONOMOUS RUN — STATE CHECKPOINT

## MASTER ACTIVITY PLATFORM + STRAVA + EARN PLUS HARDENING

### Phase 1 — Earn Plus stale mission-session fix (DONE — commit d7f4096)

`supabase/migrations/20260921000000_earned_plus_stale_session_hardening.sql`
(additive, idempotent):

- Backfills `expired_at = expires_at` on every logically-open session whose
  `expires_at` has passed. Before this, such a row stayed covered by
  `reward_one_open_session_per_user` forever and the next start hit a raw 23505
  that the UI misreported as "This action has already been recorded…".
- `svj_start_daily_mission_impl` retires stale sessions before the open-session
  check (and before the INSERT), then raises the domain error
  `SVJ_REWARD_MISSION_ALREADY_RUNNING` for a genuinely live session.
- `svj_complete_daily_mission_impl` now stamps BOTH
  `reward_mission_assignments.completed_at` and
  `reward_mission_sessions.completed_at`, so a completed mission can no longer
  block the next start.
- Qualifying days are reconciled to one per distinct `mission_completion`
  policy day (the per-mission increment overcounted). Reward XP untouched.
- Reward economics, policy rows, the unique index, the reward service-role
  lockdown and the self-service entry points are unchanged.

Tests: `tests/earned-plus-self-service-db.test.mjs` — 37/37 pass, including new
real-PostgreSQL cases for stale-session recovery, completion stamping,
qualifying-day reconciliation, retry exactly-once and replayed request ids.

### Phase 2 — Strava integration (DONE — see docs/STRAVA_INTEGRATION.md)

`supabase/migrations/20260922000000_strava_integration.sql` (additive,
idempotent): `source = 'strava'` on `svj_activities`; server-only
`svj_strava_connections` + `svj_strava_oauth_states` (RLS-forced, no client
grants); six `service_role`-only RPCs; two `authenticated`-only owner RPCs; and
`svj_process_activity_rewards_impl(uuid, uuid)` — the existing reward body
extracted verbatim so the public `svj_process_activity_rewards(uuid)` keeps its
exact signature/grants and merely delegates. Reuses the existing activity + XP
pipeline: no second activity table, no duplicated reward math.

Code: `src/lib/strava.ts` (pure helpers), `src/lib/strava.server.ts` (OAuth +
sync, server-only), `src/lib/strava.functions.ts` (server functions),
`src/routes/strava.callback.tsx` (OAuth return),
`src/app/components/StravaConnectionCard.tsx` (Profile).

Tests: `tests/strava-db.test.mjs` 15/15 (grants, isolation, idempotent import,
rewards-refactor regression), `tests/strava.test.ts` 17/17 (pure helpers).

**ACTION REQUIRED before Strava can be used:** apply the migration, then set
`STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in Settings → Environment
(optionally `STRAVA_REDIRECT_URI`). No keys are present in this workspace, so
the Profile card currently shows the neutral "not enabled" note.

### Validation (this run)

- `bun tsc -b --noEmit` — PASS
- `bun run test` — 491 tests, **489 pass / 0 fail / 2 skipped** (the 2 skipped
  are the PGlite suites that self-skip under a polluted DOM; run them isolated)

---

CURRENT_REMOTE_SHA: b1ea348c887c597bdc06fa983d083fbe9f0e3a66
LAST_COMPLETED_UPDATE: Earn Plus production-upgrade safety (trigger upgrades inside 20260920000000) — commit b1ea348
NEXT_UPDATE: 09 — Profile + Avatar + Settings
MIGRATIONS_CREATED: 20260920000000_earned_plus_self_service.sql (corrected in place: internal _impl functions + two entry points; NOT yet deployed)
MIGRATIONS_APPLIED: (see MIGRATIONS_PENDING — live status not verified from this environment)
MIGRATIONS_PENDING: audit required on the oltmnrkceodpyqznfhjb runtime for 20260918*, 20260919* migrations
TEST_STATUS: baseline full suite = 427 pass / 25 fail (failures pre-existing on clean HEAD, proven via stash-run); TypeScript PASS; targeted suites (avatar, membership, xp-stats, strength, personalized) 116/116 PASS
KNOWN_BLOCKERS: no authenticated runtime DB access from this workspace for migration deployment verification; Android SDK unavailable for assembleDebug (gradle wrapper present)

## HOTFIX — Earn Plus admin-key removal (commit a8a0b43)

- Migration supabase/migrations/20260920000000_earned_plus_self_service.sql created:
  five authenticated self-service SECURITY DEFINER RPCs delegating to the existing
  reward logic. NOT YET LIVE — DB DEPLOYMENT REQUIRED on oltmnrkceodpyqznfhjb
  (run the file, then NOTIFY pgrst, 'reload schema';).
- engagement.server.ts/functions.ts now use the requireSupabaseAuth session client;
  requireAdminKey/supabaseAdmin removed from all normal reward flows.
- 16 new regression tests in tests/earned-plus-self-service.test.ts: all pass.
- Two stale tests that codified the old admin-gated engagement architecture updated;
  account deletion remains privileged and fail-closed.

## FINAL STATE (run complete)

- Updates 01–09 are complete and pushed. No Update 10/11/12 definitions exist in the
  controlling specification (docs/SVJ_MASTER_PROGRESS.md defines Phases 01–04, all complete;
  updates 05–08 landed via commits 34d8a19/23da1d7/bcfeba4/7b52993). Final hardening ran at
  commit 81f2526: TypeScript PASS, targeted suites 116/116 PASS, full suite 427 pass / 25 fail
  (identical failures proven pre-existing on clean HEAD), web build PASS, cap sync android PASS,
  git diff --check PASS, no secret leakage, project refs locked to oltmnrkceodpyqznfhjb.
- Full-repo ESLint shows ~1450 prettier formatting errors across the whole tree — pre-existing,
  not introduced by this run (touched files lint clean; fixes are mechanical `--fix` churn best
  done in a dedicated formatting commit).
- Migrations 20260918* and 20260919* (challenge self-service, strength logging, activity XP,
  personalized assignments, recovery) still need live deployment verification against
  oltmnrkceodpyqznfhjb — this workspace has no authenticated runtime DB access.
- Android assembleDebug NOT run: no Android SDK in this environment (cap sync verified).

## Update 09 — Profile + Avatar + Settings (DONE — commit 81f2526)

Audit findings (GitHub state 7b52993, branch release/play-v1-compliance):

ALREADY IMPLEMENTED (verified by inspection + tests):
- Profile: real persisted profile data via saveMyProfile server fn → save_my_profile RPC
  (validates avatar namespace, never accepts XP/entitlements). No requireAdminKey in
  src/lib/profile.functions.ts.
- Founder badge present (Crown chip in GoogleAuthModal + EditProfileModal). "Owner Account"
  wording already replaced by "Founder" in ProfileView pill ("Founder Account").
- Avatar: full pipeline exists — AvatarCropEditor (circular guide, drag, pinch, zoom slider,
  512px square WebP output), private `avatars` bucket + RLS (20260904180000), signed-URL
  hook with cache-busting (bumpAvatarRevision), bare object path persistence, old-object
  cleanup after successful save, remove flow, and resolveLoginAvatar() which NEVER lets a
  Google OAuth picture overwrite a custom avatar (server > cache > Google). 19 avatar
  regression tests PASS.
- Settings: Logout with confirmation dialog + actual signOut; Email Us is a mailto compose
  to sabarivj777@gmail.com with subject "SVJ Support / Account Verification" (no autosend);
  Delete Account / Privacy / Terms links preserved.
- Membership: self-service (svj_get_my_membership), no admin key for normal reads.

PENDING for Update 09 completion:
- Include the two pre-existing cosmetic edits (GoogleAuthModal.tsx, SVJContext.tsx:
  "Founder & Owner" → "Founder") — audited, match Profile/Account cleanup spec.
- Add regression test coverage for the login-avatar/OAuth-overwrite path already covered by
  tests/avatar.test.ts (complete) and the save_my_profile namespace guard (verify covered).
- Full validation gate + separate commit + push.
