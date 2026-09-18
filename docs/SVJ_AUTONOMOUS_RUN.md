# SVJ AUTONOMOUS RUN — STATE CHECKPOINT

CURRENT_REMOTE_SHA: 7b52993 (at start of Update 09)
LAST_COMPLETED_UPDATE: 08 (Plus + MY SVJ PLAN weekly analysis — commit 7b52993, already pushed)
NEXT_UPDATE: 09 — Profile + Avatar + Settings
MIGRATIONS_CREATED: none by this run so far (Updates 01–08 own their migrations; see supabase/migrations)
MIGRATIONS_APPLIED: (see MIGRATIONS_PENDING — live status not verified from this environment)
MIGRATIONS_PENDING: audit required on the oltmnrkceodpyqznfhjb runtime for 20260918*, 20260919* migrations
TEST_STATUS: baseline full suite = 427 pass / 25 fail (failures pre-existing on clean HEAD, proven via stash-run); TypeScript PASS; targeted suites (avatar, membership, xp-stats, strength, personalized) 116/116 PASS
KNOWN_BLOCKERS: no authenticated runtime DB access from this workspace for migration deployment verification; Android SDK unavailable for assembleDebug (gradle wrapper present)

## Update 09 — Profile + Avatar + Settings (in progress)

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
