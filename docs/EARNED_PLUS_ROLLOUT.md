# Earned Plus rollout checklist

Status: code and disposable-database checks complete; live activation pending owner approval, 2 September 2026.

Target project: `oltmnrkceodpyqznfhjb`
Target branch: `release/play-v1-compliance`
Campaign: `earned-plus-launch-v1`

## What is ready

- `supabase/pending/20260902_earned_plus.sql` creates the server-only reward ledger, wallet, check-ins, immutable mission sessions, receipts, RLS policies and atomic redemption function.
- `supabase/pending/20260902_enable_earned_plus.sql` enables server-timed earning while leaving `claims_enabled = false`.
- The app has account-scoped server functions and an Earn Plus screen that never trusts browser XP, timestamps, membership dates or client-selected rewards.
- Personal tasks, workouts, meals, imports, welcome grants and historical Profile XP cannot mint Reward XP.
- Existing Founder/lifetime access is never shortened; timed Plus is extended from the later of the current valid expiry and server time.
- The 60-Day Challenge and its separate two-month code reward are unchanged.

## Verification already run

`npm test` passes 90 tests: 88 passed and two native-only concurrency checks are skipped when no local PostgreSQL service is available. The isolated PostgreSQL/WASM suite passes 18 functional/security checks, including disabled-by-default behavior, server-day time, idempotent check-ins, streaks, minimum mission time, daily caps, RLS, assignment freezing, claim requirements, ledger mismatch refusal, atomic rollback, verified-identity uniqueness, Founder preservation, timed extension and account-deletion cascades.

The native concurrency cases run in CI against a disposable PostgreSQL 17 service. They are not run against Supabase or any production credential.

## Apply only after review

1. Confirm Lovable is connected to repository `SabariVJ/make-my-apk`, branch `release/play-v1-compliance`, and Supabase project `oltmnrkceodpyqznfhjb`.
2. Export or snapshot the project configuration and confirm the current service-role secret is valid. Never paste a secret into chat or commit it.
3. Apply `20260902_earned_plus.sql` in the intended project's SQL editor, after running the same file and the disposable-account test suite against a non-production database.
4. Verify the policy row is still `enabled = false, claims_enabled = false` and that no existing profile XP, Plus expiry, Founder flag or 60-Day data changed.
5. For a limited earning pilot, apply `20260902_enable_earned_plus.sql`. Claims remain disabled, so users can observe earning without spending or receiving Plus.
6. Test with a disposable verified account after Lovable rebuilds the preview: one check-in, one timed mission, refresh/resume, failed confirmation, daily cap and post-trial navigation. Do not use the Founder account for test mutations.
7. Only after reviewing abuse/ledger metrics and approving the promotion, change the policy row to `claims_enabled = true` in a separately reviewed SQL action. This is not included in the code push.

## Rollback and safety

If a problem appears, first set both policy flags to false. Do not drop the tables: receipts and deduplication history are needed to prevent replayed grants. Existing membership and profile data are independent of the reward wallet. Investigate failed receipts and restore the policy only after the native transaction tests and a disposable smoke test pass again.

No live schema, live data, account, secret or publication was changed as part of this implementation. The staged files are intentionally review-only until the owner performs the steps above.
