import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261010000000_admin_plus_gifts.sql", import.meta.url),
  "utf8",
);
const adminFunctions = await readFile(
  new URL("../src/lib/admin.functions.ts", import.meta.url),
  "utf8",
);
const adminDashboard = await readFile(
  new URL("../src/app/views/AdminDashboardView.tsx", import.meta.url),
  "utf8",
);
const plusGiftFunctions = await readFile(
  new URL("../src/lib/plusGift.functions.ts", import.meta.url),
  "utf8",
);
const claimModal = await readFile(
  new URL("../src/app/components/PlusGiftClaimModal.tsx", import.meta.url),
  "utf8",
);
const trialGate = await readFile(
  new URL("../src/app/components/TrialGate.tsx", import.meta.url),
  "utf8",
);

test("admin Plus grants use a trusted service-role RPC and record a recipient gift", () => {
  assert.match(adminFunctions, /svj_admin_grant_plus/);
  assert.match(adminFunctions, /targetUserId/);
  assert.match(adminFunctions, /durationValue/);
  assert.match(adminFunctions, /durationUnit/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.plus_gifts/);
  assert.match(migration, /set_config\('svj\.trusted_server_write', 'on', true\)/);
  assert.match(migration, /is_plus_member = true/);
  assert.match(migration, /expires_at/);
});

test("gift duration supports weeks, months, and lifetime", () => {
  assert.match(migration, /duration_unit IN \('week', 'month', 'lifetime'\)/);
  assert.match(migration, /make_interval\(weeks => p_duration_value\)/);
  assert.match(migration, /make_interval\(months => p_duration_value\)/);
  assert.match(adminDashboard, /Weeks/);
  assert.match(adminDashboard, /Months/);
  assert.match(adminDashboard, /Lifetime/);
});

test("claim is recipient-scoped and server-authoritative", () => {
  assert.match(migration, /recipient_user_id = auth\.uid\(\)/);
  assert.match(migration, /svj_claim_plus_gift/);
  assert.match(plusGiftFunctions, /svj_claim_plus_gift/);
  assert.match(claimModal, /Claim Plus/);
  assert.match(trialGate, /PlusGiftClaimModal/);
});

test("founder grants are labeled Founder without changing the permission boundary", () => {
  assert.match(adminFunctions, /FOUNDER_EMAIL/);
  assert.match(adminFunctions, /senderLabel/);
  assert.match(claimModal, /sent you/);
});
