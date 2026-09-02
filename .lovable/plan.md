# Earn Plus: lower qualifying days from 21 to 7

## Current state (verified)

Live policy row `earned-plus-launch-v1`:

```text
enabled = true            claims_enabled = false
reward_xp_cost = 3000     required_qualifying_days = 21
required_account_age_days = 21   daily_reward_xp_cap = 150   plus_days = 30
```

The UI already reads the requirement from the server policy
(`active.policy.requiredQualifyingDays` in `src/app/views/EarnPlusView.tsx`,
lines 303 and 382) — no hardcoded "21 qualifying days" text exists in the app,
so it will display 7 automatically once the policy row changes.

The reward RPCs compare `wallet.qualifying_days < policy.required_qualifying_days`,
so no function logic changes. A qualifying day is still incremented only by the
first completed timed mission of the server day; check-ins never increment it.

## What changes

1. Database: one guarded `UPDATE` of the single policy row.
2. `docs/EARNED_PLUS_ROLLOUT.md` — the activation record line that states
   "21 qualifying days" becomes "7 qualifying days", with a dated amendment note;
   the 21-day account-age wording stays.
3. `tests/engagement-db.test.mjs` — eligibility seeding/assertions that use 21
   qualifying days move to 7 (`seedEligibility` default, the `tooFewXp` seed, and
   the `deepEqual` ledger check expecting `qualifying_days: 21` / `ledger_days: 21`).
   The insufficient-days rejection case keeps asserting
   `SVJ_REWARD_QUALIFYING_DAYS_REQUIRED` below the new threshold, and the
   account-age test keeps its 21-day expectation.
4. `supabase/pending/20260902_earned_plus.sql` stays byte-identical (it is the
   historical applied schema). A new review-only file
   `supabase/pending/20260903_earned_plus_qualifying_days_7.sql` records the SQL below.

No changes to auth, secrets, Capacitor, Android, publishing, memberships,
wallets, ledgers, or the separate Supabase dashboard project.

## Exact guarded SQL

```sql
BEGIN;

UPDATE public.reward_policies
SET required_qualifying_days = 7,
    updated_at = clock_timestamp()
WHERE campaign_id = 'earned-plus-launch-v1'
  AND required_qualifying_days = 21
  AND required_account_age_days = 21
  AND reward_xp_cost = 3000
  AND claims_enabled = false;

-- Guard: exactly one row must match, and claims must stay disabled.
DO $$
DECLARE r public.reward_policies;
BEGIN
  SELECT * INTO r FROM public.reward_policies WHERE campaign_id = 'earned-plus-launch-v1';
  IF r.required_qualifying_days <> 7
     OR r.required_account_age_days <> 21
     OR r.reward_xp_cost <> 3000
     OR r.claims_enabled <> false THEN
    RAISE EXCEPTION 'SVJ policy guard failed';
  END IF;
END $$;

COMMIT;
```

Nothing else is touched: no grants, no wallet or ledger rows, no `plus_expires_at`,
no backfill.

## Anti-abuse invariants (unchanged)

Fixed server-defined missions only; one timed mission at a time; server
timestamps for start/eligible/expiry; minimum reflection length (20–500 chars);
150 Reward XP daily cap; no Reward XP from custom tasks, workouts, meals,
welcome credits, or historical Profile XP.

## Verification steps

1. Read back the policy row and confirm the six fields above, `claims_enabled = false`.
2. Run `npm test` (isolated Postgres/WASM reward suite) — expect the updated
   7-day eligibility cases to pass and the account-age case to still require 21 days.
3. Load Earn Plus in the preview and confirm the target reads "7" in both the
   qualifying-days meter and the requirements line.
4. Confirm no user's wallet, ledger, or Plus expiry changed (row counts and
   `sum(reward_xp_delta)` unchanged before/after).

## Plus claims

`claims_enabled` stays `false`, asserted by the SQL guard and re-read in step 1.
No Plus is granted by this change.
