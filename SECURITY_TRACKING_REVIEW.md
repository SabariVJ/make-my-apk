# Tracking stability security review

Scope: checked-in migrations and disposable local Supabase services. Production
schema and hosting credentials were not accessed or modified.

The first isolated inventory contains 55 public tables, 69 public/storage RLS
policies and 119 SVJ functions. The final CI artifact retains the exact inventory
and migration content hashes for its commit.

## Repairs

- Revoke anonymous/public execution of SVJ security-definer functions, except
  the explicit token-based `svj_get_public_live_share` endpoint.
- Restrict `svj_training_load_points` and `svj_activity_xp_earned_today` to
  trusted server calls. Both take a user ID and previously bypassed private-data
  isolation through default function grants.
- Preserve service-only admin grants and verified challenge reward writes.
  Account-role insertion by an ordinary account must fail.
- Bind workout retry requests to the originating account's token, cancel them
  on sign-out/backgrounding, and retain recordings until server acknowledgments.
- Scan generated public JavaScript/HTML for privileged keys and service-role
  JWTs. No test credential or server secret belongs in client assets.

## Explicit public data and exceptions

- Published workout templates and the shared exercise catalog are readable by
  signed-in users. Private templates, training context and workouts remain
  owner-scoped.
- Community and leaderboard data are exposed through existing curated RPCs;
  raw profiles, private assessments and body profiles remain owner-scoped.
- Avatars are intentionally public. Upload/update/delete storage policies require
  the caller's own folder. Private recordings are not stored in this bucket.
- Live Share exposes the limited active location only to an unguessable token;
  stopped/expired links return an ended state. It creates no canonical workout
  or reward by itself.
- `challenge_day_definitions` and `svj_activity_reward_policy` contain global
  server configuration, not personal data. They have no direct authenticated
  table grant; all remaining personal-data tables require RLS.

## Required owner follow-up

Compare deployed schema and grants to this reviewed migration chain, then apply
only the five additive `20261012…` repairs through the normal database change
process. Hosted asset delivery, Google OAuth/deep links and physical tracking
require the published site and installed signed app. The isolated evidence does
not prove production parity or real-device sensor accuracy.
