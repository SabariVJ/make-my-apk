# Earned Plus rollout checklist

Status: owner-approved earning pilot ACTIVE; Plus claims DISABLED, 2 September 2026.

Target project: `oltmnrkceodpyqznfhjb`
Target branch: `release/play-v1-compliance`
Campaign: `earned-plus-launch-v1`

## Live activation record

- Activated earning on 2 September 2026 at 16:51:48 UTC (22:21:48 Asia/Kolkata).
- Applied the reviewed schema to the existing SVJ Lovable Cloud database through project `33b1119f-3051-482e-90aa-488c5d0681b3`. No database was created, replaced, or migrated to the separate Supabase dashboard project.
- Active policy: `enabled = true`, `claims_enabled = false`; 3,000 Reward XP, 7 qualifying days, 21-day account age, 150 Reward XP daily cap, and a one-time 30-day Plus reward. Claims require a separate release decision.
- Amendment, 2 September 2026: `required_qualifying_days` lowered from 21 to 7 by the owner-approved guarded update in `supabase/pending/20260903_earned_plus_qualifying_days_7.sql`. The 21-day account age, the 3,000 Reward XP cost, the 150 Reward XP daily cap and `claims_enabled = false` are unchanged. A qualifying day still requires at least one completed server-timed mission; daily check-ins never count. Because of the daily cap, a real 3,000 Reward XP balance still takes at least 20 mission days, so the XP requirement — not the day count — is now the binding constraint.
- Source application commit: `577ad2ad30ccc2352a42408fe823c863d3261789`. Schema SHA-256: `24cdce2120f9492f7b813c8dc686d52d76f6dade8f4ec8d55ccc48799e0e6924`.
- The schema request returned a cancelled acknowledgement, but read-only reconciliation confirmed that the entire transaction committed. The schema was not resubmitted.
- Verified all nine reward tables have RLS, no anonymous table reads, no authenticated direct writes, and no anonymous/authenticated execution of the reward functions. Existing profile protection triggers were preserved.
- Before/after fingerprints matched for existing profile data (excluding the newly added counter), challenge progress/enrollments, redemption codes, and friendships. Existing XP and memberships were not reset or converted into Reward XP.
- A service-role read-only transaction returned `status = ready`, all three reward missions, and `canClaim = false`; the response passed the frontend's Zod schema validation. No test check-in, wallet, reward receipt, or Plus grant was created for an existing user.
- Requested a PostgREST schema-cache reload. The existing Earn Plus screen can now load the active progress state after **Refresh rewards**.

Remaining verification: sign in to the Lovable preview with a disposable verified account and smoke-test a real timed mission, refresh/resume, and daily check-in. Database readback and isolated tests are verified; a signed-in browser smoke test is not yet recorded. Do not enable Plus claims or publish as part of that check.

## What is ready

- `supabase/pending/20260902_earned_plus.sql` creates the server-only reward ledger, wallet, check-ins, immutable mission sessions, receipts, RLS policies and atomic redemption function.
- `supabase/pending/20260902_enable_earned_plus.sql` enables server-timed earning while leaving `claims_enabled = false`.
- The app has account-scoped server functions and an Earn Plus screen that never trusts browser XP, timestamps, membership dates or client-selected rewards.
- Personal tasks, workouts, meals, imports, welcome grants and historical Profile XP cannot mint Reward XP.
- Existing Founder/lifetime access is never shortened; timed Plus is extended from the later of the current valid expiry and server time.
- The 60-Day Challenge and its separate two-month code reward are unchanged.

## Verification already run

`npm test` passes 90 tests: 88 passed and two native-only concurrency checks are skipped when no local PostgreSQL service is available. The isolated PostgreSQL/WASM suite passes 18 functional/security checks, including disabled-by-default behavior, server-day time, idempotent check-ins, streaks, minimum mission time, daily caps, RLS, assignment freezing, claim requirements, ledger mismatch refusal, atomic rollback, verified-identity uniqueness, Founder preservation, timed extension and account-deletion cascades.

The native concurrency cases passed in CI against a disposable PostgreSQL 17 service (20/20 database checks, [run 33642924733](https://github.com/SabariVJ/make-my-apk/actions/runs/33642924733)). The activation preflight also reran the local isolated suite: 18 passed, with the two native-only checks skipped locally. These tests do not use Supabase or production credentials.

## Initial rollout / recovery procedure

The earning-only activation above is already complete. Do not repeat these steps or change backend connections merely because an older preview still shows a pending state. Confirm the current policy and refresh the preview first. Keep the source SQL under `supabase/pending/`; it must not become an automatic claims activation.

1. Confirm Lovable is connected to repository `SabariVJ/make-my-apk`, branch `release/play-v1-compliance`, and Supabase project `oltmnrkceodpyqznfhjb`.
2. Export or snapshot the project configuration and confirm the current service-role secret is valid. Never paste a secret into chat or commit it.
3. Apply `20260902_earned_plus.sql` in the intended project's SQL editor, after running the same file and the disposable-account test suite against a non-production database.
4. Verify the policy row is still `enabled = false, claims_enabled = false` and that no existing profile XP, Plus expiry, Founder flag or 60-Day data changed.
5. For a limited earning pilot, apply `20260902_enable_earned_plus.sql`. Claims remain disabled, so users can observe earning without spending or receiving Plus.
6. Test with a disposable verified account after Lovable rebuilds the preview: one check-in, one timed mission, refresh/resume, failed confirmation, daily cap and post-trial navigation. Do not use the Founder account for test mutations.
7. Only after reviewing abuse/ledger metrics and approving the promotion, change the policy row to `claims_enabled = true` in a separately reviewed SQL action. This is not included in the code push.

## Rollback and safety

If a problem appears, first set both policy flags to false. Do not drop the tables: receipts and deduplication history are needed to prevent replayed grants. Existing membership and profile data are independent of the reward wallet. Investigate failed receipts and restore the policy only after the native transaction tests and a disposable smoke test pass again.

The original code push did not activate the database. The separate, owner-approved action recorded above applied the reward schema and enabled earning only. No secrets, auth configuration, existing account data, Plus claims, or publication settings were changed.
