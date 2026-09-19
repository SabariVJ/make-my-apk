-- REVIEW ONLY: apply after the earned-plus schema passes disposable-account tests.
-- This opens server-timed earning while keeping claims disabled for the pilot.
-- Apply only to the intended Supabase project after an owner review.
BEGIN;

UPDATE public.reward_policies
SET enabled = true,
    claims_enabled = false,
    launched_at = COALESCE(launched_at, clock_timestamp()),
    updated_at = clock_timestamp()
WHERE campaign_id = 'earned-plus-launch-v1';

COMMIT;
