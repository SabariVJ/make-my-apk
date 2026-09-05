import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260904180000_profile_avatar_rivalry_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const server = await readFile(new URL("../src/lib/rivalry.functions.ts", import.meta.url), "utf8");
const challengeServer = await readFile(
  new URL("../src/lib/challenge.functions.ts", import.meta.url),
  "utf8",
);
const verifiedActivityMigration = await readFile(
  new URL(
    "../supabase/migrations/20260904183000_verified_activity_and_rivalry_scoring.sql",
    import.meta.url,
  ),
  "utf8",
);

test("rivalry mutations use the audited database state machine", () => {
  assert.match(server, /svj_create_rivalry/);
  assert.match(server, /svj_respond_to_rivalry/);
  assert.match(server, /svj_cancel_rivalry/);
  assert.match(server, /svj_list_rivalries/);
  assert.doesNotMatch(server, /from\("rivalry_events"\)\.insert/);
});

test("the database prevents client-authored rivalry scores and duplicate live pairs", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.rivalries FROM authenticated/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON public\.rivalry_events FROM authenticated/,
  );
  assert.match(migration, /status IN \('pending', 'accepted', 'active'\)/);
  assert.match(migration, /SUM\(e\.xp_delta\)/);
  assert.match(migration, /winner_id = CASE/);
});

test("rivalry RPCs require an authenticated participant and a friend relationship", () => {
  assert.match(migration, /caller_id uuid := auth\.uid\(\)/);
  assert.match(migration, /Become friends before starting an Outperform rivalry/);
  assert.match(migration, /opponent_id = caller_id/);
  assert.match(migration, /challenger_id = caller_id/);
});

test("verified challenge activity is the only 60-Day XP and rivalry score writer", () => {
  assert.match(challengeServer, /svj_record_verified_60_day_completion/);
  assert.match(challengeServer, /missingVerifiedActivityRpc/);
  assert.match(verifiedActivityMigration, /ON CONFLICT \(user_id, event_key\) DO NOTHING/);
  assert.match(verifiedActivityMigration, /INSERT INTO public\.rivalry_events/);
  assert.match(verifiedActivityMigration, /status = 'active'/);
  assert.match(verifiedActivityMigration, /p_xp, 'challenge_complete', v_event_key/);
});

test("verified activity award is unavailable to browser roles", () => {
  assert.match(
    verifiedActivityMigration,
    /REVOKE ALL ON FUNCTION public\.svj_record_verified_60_day_completion/,
  );
  assert.match(verifiedActivityMigration, /FROM PUBLIC, anon, authenticated/);
  assert.match(
    verifiedActivityMigration,
    /GRANT EXECUTE ON FUNCTION public\.svj_record_verified_60_day_completion/,
  );
  assert.match(verifiedActivityMigration, /TO service_role/);
});
