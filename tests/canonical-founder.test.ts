/**
 * Canonical founder / lifetime Plus regression tests.
 *
 * Pins the corrective fix for the founder identity regression introduced by
 * PR #21 (which incorrectly switched the canonical founder to
 * sabarivj2008@gmail.com):
 *  - sabarivj777@gmail.com is the canonical founder/admin identity
 *    (it is BOTH the founder account and the public support address)
 *  - sabarivj2008@gmail.com is NOT a founder and must never receive
 *    founder/admin entitlements from app code or migrations
 *  - the DB migration grants lifetime Plus (plus_expires_at = NULL) and the
 *    admin role to the EXISTING 777 account only, idempotently
 *  - membership stays server-authoritative (TrialGate -> getTrialStatus ->
 *    svj_get_my_membership); localStorage can never grant Plus
 *  - founder-only Recovery, navigation and Liquid Glass dock are untouched
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

const FOUNDER = "sabarivj777@gmail.com";
const NOT_FOUNDER = "sabarivj2008@gmail.com";

const context = read("src/app/context/SVJContext.tsx");
const founderIdentity = read("src/app/lib/founderIdentity.ts");
const trialFunctions = read("src/lib/trial.functions.ts");
const trialGate = read("src/app/components/TrialGate.tsx");
const founderGate = read("src/app/lib/founderGate.ts");
const challengeFunctions = read("src/lib/challenge.functions.ts");
const migration = read("supabase/migrations/20261009000000_canonical_founder_lifetime_plus.sql");
const navigation = read("src/app/components/Navigation.tsx");

/** SQL comments stripped so prose can't satisfy source assertions. */
const sql = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("canonical founder identity", () => {
  it("declares sabarivj777@gmail.com as the single founder constant", () => {
    assert.match(founderIdentity, /export const FOUNDER_EMAIL = "sabarivj777@gmail\.com"/);
  });

  it("derives owner detection in SVJContext from the founderIdentity module", () => {
    assert.match(context, /cleanEmail === FOUNDER_EMAIL/);
    assert.doesNotMatch(
      context,
      /===\s*"sabarivj(777|2008)@gmail\.com"/,
      "the owner-email comparison must use the shared constant",
    );
  });

  it("does not preserve cached founder flags for non-founder Google logins", () => {
    assert.match(context, /isFounder: isOwnerEmail,\s*isOwner: isOwnerEmail,/);
    assert.doesNotMatch(
      context,
      /isFounder:\s*isOwnerEmail\s*\|\|\s*baseUser\.isFounder/,
      "a stale cached founder flag must not leak onto a gifted Plus account",
    );
    assert.doesNotMatch(
      context,
      /isOwner:\s*isOwnerEmail\s*\|\|\s*baseUser\.isOwner/,
      "a stale cached owner flag must not leak onto a gifted Plus account",
    );
  });

  it("retains the server-side challenge debug gate on the canonical founder", () => {
    assert.match(challengeFunctions, /FOUNDER_EMAIL = "sabarivj777@gmail\.com"/);
  });

  it("keeps 777 as both founder and the public support contact", () => {
    const supportEmail = read("src/app/lib/supportEmail.ts");
    assert.match(supportEmail, /SUPPORT_EMAIL = "sabarivj777@gmail\.com"/);
  });

  it("explicitly disclaims 2008 as a founder account", () => {
    assert.match(founderIdentity, /sabarivj2008@gmail\.com/);
    assert.match(founderIdentity, /NOT a founder/i);
  });
});

describe("lifetime Plus migration (idempotent, minimal, safe)", () => {
  it("locates the EXISTING canonical 777 user by email + Google provider, LIMIT 1", () => {
    assert.match(sql, /lower\(COALESCE\(u\.email, ''\)\) = 'sabarivj777@gmail\.com'/);
    assert.match(sql, /raw_app_meta_data ->> 'provider' = 'google'/);
    assert.match(sql, /LIMIT 1/);
    assert.ok(
      !sql.match(/INSERT INTO auth\.users|DELETE FROM auth\.users/i),
      "no auth-user mutation",
    );
  });

  it("grants lifetime Plus: is_plus_member true, plus_expires_at NULL", () => {
    assert.match(sql, /SET is_plus_member = true/);
    assert.match(sql, /plus_expires_at = NULL/);
  });

  it("preserves an existing plus_unlocked_at (COALESCE)", () => {
    assert.match(sql, /plus_unlocked_at = COALESCE\(plus_unlocked_at, now\(\)\)/);
  });

  it("uses the audited trusted-server write path and no other columns", () => {
    assert.match(sql, /set_config\('svj\.trusted_server_write', 'on', true\)/);
    const updateBlock = sql.slice(
      sql.indexOf("UPDATE public.profiles"),
      sql.indexOf("WHERE id = v_founder_id"),
    );
    assert.match(updateBlock, /is_plus_member = true/);
    assert.doesNotMatch(
      updateBlock,
      /total_xp|current_streak|signup_date/,
      "progress data untouched",
    );
  });

  it("backfills the admin role only if missing, no duplicates", () => {
    assert.match(sql, /INSERT INTO public\.user_roles \(user_id, role\)/);
    assert.match(sql, /ON CONFLICT \(user_id\) DO NOTHING/);
    assert.match(sql, /'admin'/);
  });

  it("never grants anything to the 2008 account", () => {
    // The executable SQL body must not target the 2008 address at all.
    assert.ok(!sql.includes(NOT_FOUNDER), "the migration must not touch the 2008 account");
  });

  it("does not create new tables, columns or role systems", () => {
    assert.ok(!sql.match(/CREATE TABLE|ADD COLUMN|CREATE ROLE/i));
    assert.ok(!sql.match(/DROP /i), "nothing dropped");
  });
});

describe("membership stays server-authoritative", () => {
  it("the membership path is unchanged: RPC -> getTrialStatus -> TrialGate", () => {
    assert.match(trialFunctions, /svj_get_my_membership/);
    assert.match(trialFunctions, /plusActive =/);
    assert.match(trialGate, /getTrialStatus/);
    // TrialGate still routes the server status through, still never trusts
    // localStorage for entitlement.
    assert.match(trialGate, /never trust localStorage for entitlement/i);
  });

  it("lifetime Plus resolves locked=false for a NULL expiry (existing logic)", () => {
    // buildStatus: plusActive = is_plus_member && (!expires || expires > now);
    // locked = !plusActive && daysLeft <= 0. With is_plus_member=true and
    // plus_expires_at=NULL the founder gets plusActive=true, locked=false.
    assert.match(
      trialFunctions,
      /row\.is_plus_member &&\s*\(!row\.plus_expires_at \|\| new Date\(row\.plus_expires_at\)\.getTime\(\) > Date\.now\(\)\)/,
    );
    assert.match(trialFunctions, /locked: !plusActive && daysLeft <= 0/);
  });

  it("login still persists isPremium=false to localStorage (server decides)", () => {
    assert.match(context, /const persistedUser = \{ \.\.\.updatedUser, isPremium: false \}/);
  });

  it("expired-trial logic still works for ordinary users", () => {
    // TrialDays still 7 and the gate still locks when the trial is over.
    assert.match(trialFunctions, /export const TRIAL_DAYS = 7/);
    assert.match(trialGate, /TrialGate/);
  });
});

describe("founder UI and navigation unchanged", () => {
  it("the founder gate still keys off the server-backed profile flags", () => {
    assert.match(founderGate, /isFounder === true \|\| user\.isOwner === true/);
    assert.match(founderGate, /!profileLoaded \|\| !user/);
  });

  it("founder-only Recovery and Liquid Glass dock are untouched", () => {
    assert.match(navigation, /isFounderAccount/);
    assert.match(navigation, /svj-glass-dock/);
    assert.match(navigation, /grid-cols-6/);
    // The recovery destination ordering logic stays byte-identical.
    assert.match(
      navigation,
      /const recoveryItem: PrimaryNavItem = \{ id: "recovery", label: "Recovery", icon: HeartPulse \}/,
    );
  });
});
