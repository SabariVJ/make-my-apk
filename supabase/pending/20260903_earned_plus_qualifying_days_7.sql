-- Owner-approved policy change: lower required qualifying days from 21 to 7.
-- Campaign: earned-plus-launch-v1. Claims stay disabled.
-- Nothing else changes: no grants, wallets, ledgers, redemptions or memberships.
BEGIN;

UPDATE public.reward_policies
SET required_qualifying_days = 7,
    updated_at = clock_timestamp()
WHERE campaign_id = 'earned-plus-launch-v1'
  AND required_qualifying_days = 21
  AND required_account_age_days = 21
  AND reward_xp_cost = 3000
  AND claims_enabled = false;

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
