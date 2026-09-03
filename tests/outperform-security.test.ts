// ============================================================================
// Security regression tests — Outperform rivalry + notification system
//
// These verify structural invariants in the code and migration, not live DB
// behavior. They ensure the server functions enforce authorization and that
// the migration does not grant privileges an attacker could exploit.
//
// Architecture: rivalry functions use the authenticated user's Supabase client
// (context.supabase) with RLS. Notification creation goes through a SECURITY
// DEFINER RPC that validates the caller is a rivalry participant.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Helpers ────────────────────────────────────────────────────────────────

const MIGRATION_PATH = "supabase/migrations/20260903000000_personalization_body_rivalry.sql";

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf-8");
}

function readRivalryFunctions(): string {
  return readFileSync("src/lib/rivalry.functions.ts", "utf-8");
}

// ── Migration: in_app_notifications security ────────────────────────────────

describe("Migration: in_app_notifications", () => {
  const sql = readMigration();

  it("does not grant INSERT to authenticated (server-only creation via RPC)", () => {
    const grants = sql.match(
      /GRANT\s+[\w,\s]+ON\s+public\.in_app_notifications\s+TO\s+authenticated/gi,
    );
    assert.ok(grants, "should have at least one GRANT to authenticated");
    for (const grant of grants) {
      assert.ok(!/\bINSERT\b/i.test(grant), `authenticated must not have INSERT: ${grant}`);
    }
  });

  it("grants SELECT and UPDATE to authenticated (read + mark-read only)", () => {
    const grants = sql.match(
      /GRANT\s+([\w,\s]+)ON\s+public\.in_app_notifications\s+TO\s+authenticated/gi,
    );
    assert.ok(grants, "should have at least one GRANT to authenticated");
    const allGranted = grants.map((g) => g.replace(/GRANT\s+/i, "").replace(/\s+ON[\s\S]*/i, ""));
    const joined = allGranted.join(", ");
    assert.ok(/\bSELECT\b/.test(joined), "should grant SELECT");
    assert.ok(/\bUPDATE\b/.test(joined), "should grant UPDATE");
    assert.ok(!/\bDELETE\b/.test(joined), "must not grant DELETE");
  });

  it("grants ALL to service_role (needed by SECURITY DEFINER RPC owner)", () => {
    assert.ok(
      /GRANT ALL ON public\.in_app_notifications TO service_role/.test(sql),
      "service_role must have ALL",
    );
  });

  it("has RLS enabled", () => {
    assert.ok(
      /ALTER TABLE public\.in_app_notifications ENABLE ROW LEVEL SECURITY/.test(sql),
      "RLS must be enabled",
    );
  });

  it("SELECT policy restricts to own notifications", () => {
    assert.ok(
      /FOR SELECT TO authenticated\s+USING\s*\(auth\.uid\(\)\s*=\s*user_id\)/.test(sql),
      "SELECT policy must use auth.uid() = user_id",
    );
  });

  it("UPDATE policy prevents user_id change via WITH CHECK", () => {
    assert.ok(
      /FOR UPDATE TO authenticated\s+USING\s*\(auth\.uid\(\)\s*=\s*user_id\)\s+WITH CHECK\s*\(auth\.uid\(\)\s*=\s*user_id\)/.test(
        sql,
      ),
      "UPDATE policy must enforce user_id = auth.uid() in both USING and WITH CHECK",
    );
  });

  it("has no INSERT policy for authenticated in the notifications section", () => {
    const notifSection = sql.substring(sql.indexOf("11) IN-APP NOTIFICATIONS"));
    const notifInsertPolicies = notifSection.match(/FOR INSERT TO authenticated/gi);
    assert.ok(
      !notifInsertPolicies || notifInsertPolicies.length === 0,
      "must not have INSERT policy for authenticated on in_app_notifications",
    );
  });
});

// ── Migration: SECURITY DEFINER RPC ────────────────────────────────────────

describe("Migration: SECURITY DEFINER RPC create_rivalry_notification", () => {
  const sql = readMigration();

  it("defines create_rivalry_notification as SECURITY DEFINER", () => {
    assert.ok(
      /CREATE OR REPLACE FUNCTION public\.create_rivalry_notification/.test(sql),
      "must define create_rivalry_notification RPC",
    );
    assert.ok(/SECURITY DEFINER/.test(sql), "RPC must be SECURITY DEFINER");
  });

  it("validates caller is authenticated (auth.uid() not null)", () => {
    assert.ok(
      /IF caller_id IS NULL/i.test(sql) || /auth\.uid\(\)\s+IS\s+NULL/i.test(sql),
      "RPC must check that caller_id is not null",
    );
  });

  it("validates notification type against a whitelist", () => {
    assert.ok(
      /p_notification_type NOT IN\s*\(/.test(sql),
      "RPC must whitelist allowed notification types",
    );
    assert.ok(
      /'rivalry_request'/.test(sql) &&
        /'rivalry_accepted'/.test(sql) &&
        /'rivalry_declined'/.test(sql),
      "whitelist must include rivalry_request, rivalry_accepted, rivalry_declined",
    );
  });

  it("verifies caller is a rivalry participant before inserting", () => {
    assert.ok(/is_participant/i.test(sql), "RPC must check is_participant");
    assert.ok(
      /challenger_id = caller_id OR opponent_id = caller_id/.test(sql),
      "participant check must compare against both challenger_id and opponent_id",
    );
  });

  it("resolves recipient from the rivalry table (not caller-supplied)", () => {
    assert.ok(/recipient_id/.test(sql), "RPC must resolve recipient_id from rivalry table");
    assert.ok(
      /WHEN challenger_id = caller_id THEN opponent_id/.test(sql),
      "RPC must set recipient to the OTHER participant",
    );
  });

  it("grants EXECUTE to authenticated (not PUBLIC)", () => {
    assert.ok(
      /REVOKE ALL ON FUNCTION public\.create_rivalry_notification.*FROM PUBLIC/.test(sql),
      "must REVOKE from PUBLIC",
    );
    assert.ok(
      /GRANT EXECUTE ON FUNCTION public\.create_rivalry_notification.*TO authenticated/.test(sql),
      "must GRANT EXECUTE to authenticated",
    );
  });
});

// ── Migration: rivalry constraints ─────────────────────────────────────────

describe("Migration: rivalries constraints", () => {
  const sql = readMigration();

  it("has self-challenge CHECK constraint", () => {
    assert.ok(
      /CONSTRAINT rivalries_not_self CHECK \(challenger_id\s*<>\s*opponent_id\)/.test(sql),
      "must have rivalries_not_self CHECK constraint",
    );
  });

  it("uses canonical unordered pair partial unique index (LEAST/GREATEST)", () => {
    // Prevents A->B AND B->A from existing simultaneously
    assert.ok(
      /CREATE UNIQUE INDEX.*rivalries_no_live_pair_dupes/i.test(sql),
      "must have partial unique index rivalries_no_live_pair_dupes",
    );
    assert.ok(
      /LEAST\(challenger_id,\s*opponent_id\)/.test(sql),
      "index must use LEAST(challenger_id, opponent_id)",
    );
    assert.ok(
      /GREATEST\(challenger_id,\s*opponent_id\)/.test(sql),
      "index must use GREATEST(challenger_id, opponent_id)",
    );
    assert.ok(
      /WHERE status IN \('pending',\s*'accepted',\s*'active'\)/.test(sql),
      "partial index must only apply to pending/accepted/active",
    );
  });

  it("drops the old directional index if it exists", () => {
    assert.ok(
      /DROP INDEX IF EXISTS rivalries_no_pending_or_active_dupes/i.test(sql),
      "must drop the old directional index",
    );
  });

  it("drops the old unconditional unique constraint if it exists", () => {
    assert.ok(
      /DROP CONSTRAINT IF EXISTS rivalries_unique_active/i.test(sql),
      "must drop the old rivalries_unique_active constraint",
    );
  });
});

// ── Server function security ───────────────────────────────────────────────

describe("Server functions: rivalry security (authenticated client + RPC)", () => {
  const code = readRivalryFunctions();

  it("createRivalry derives challengerId from context.userId (server session)", () => {
    assert.ok(
      /const challengerId\s*=\s*context\.userId/.test(code),
      "challengerId must come from context.userId",
    );
  });

  it("createRivalry does NOT trust client-supplied challenger identity", () => {
    // The function must not destructure challengerId from input data
    assert.ok(
      !/data.*challengerId|challengerId.*data\.challenger/.test(code),
      "must not read challengerId from data input",
    );
  });

  it("createRivalry checks self-challenge", () => {
    assert.ok(
      /challengerId\s*===\s*opponentId/.test(code) || /opponentId\s*===\s*challengerId/.test(code),
      "must check challengerId === opponentId",
    );
  });

  it("createRivalry checks for existing pending/active rivalries", () => {
    assert.ok(
      /\.in\("status",\s*\["pending".*"active"\]\)/.test(code) ||
        /\.in\(\s*"status"\s*,\s*\[\s*"pending".*"active"\s*\]\)/.test(code),
      "must check for existing pending/active rivalries",
    );
  });

  it("createRivalry uses the authenticated client (context.supabase), not supabaseAdmin", () => {
    assert.ok(
      /const client\s*=\s*context\.supabase/.test(code),
      "must use context.supabase for rivalry CRUD",
    );
  });

  it("createRivalry calls SECURITY DEFINER RPC for notification", () => {
    assert.ok(
      /\.rpc\("create_rivalry_notification"/.test(code),
      "must call create_rivalry_notification RPC",
    );
  });

  it("acceptRivalry validates opponent_id matches authenticated user", () => {
    assert.ok(
      /\.eq\("opponent_id",\s*context\.userId\)/.test(code),
      "acceptRivalry must filter by opponent_id = context.userId",
    );
  });

  it("acceptRivalry validates status is pending", () => {
    assert.ok(
      /\.eq\("status",\s*"pending"\)/.test(code),
      "acceptRivalry must check status = pending",
    );
  });

  it("declineRivalry validates opponent_id matches authenticated user", () => {
    assert.ok(
      /\.eq\("opponent_id",\s*context\.userId\)/.test(code),
      "declineRivalry must filter by opponent_id = context.userId",
    );
  });

  it("cancelRivalry validates challenger_id matches authenticated user", () => {
    assert.ok(
      /\.eq\("challenger_id",\s*context\.userId\)/.test(code),
      "cancelRivalry must filter by challenger_id = context.userId",
    );
  });

  it("cancelRivalry validates status is pending", () => {
    assert.ok(
      /\.eq\("status",\s*"pending"\)/.test(code),
      "cancelRivalry must check status = pending",
    );
  });

  it("all functions use context.supabase (authenticated client)", () => {
    const functions = [
      "createRivalry",
      "cancelRivalry",
      "acceptRivalry",
      "declineRivalry",
      "getRivalries",
    ];
    for (const fn of functions) {
      assert.ok(code.includes(`export const ${fn}`), `function ${fn} must exist`);
    }
    // Strip comments to check only executable code
    const codeOnly = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // All functions use context.supabase, NOT supabaseAdmin or getClient
    assert.ok(!/async function getClient\(\)/.test(codeOnly), "must not have getClient function");
    assert.ok(!/supabaseAdmin/.test(codeOnly), "must not reference supabaseAdmin directly");
  });

  it("markNotificationRead only sets read = true", () => {
    assert.ok(
      /\.update\(\{\s*read:\s*true\s*\}\)/.test(code),
      "markNotificationRead must only update { read: true }",
    );
  });

  it("markNotificationRead validates user_id matches authenticated user", () => {
    assert.ok(
      /\.eq\("user_id",\s*context\.userId\)/.test(code),
      "markNotificationRead must filter by user_id = context.userId",
    );
  });

  it("all notification bodies use server-resolved names (not client input)", () => {
    assert.ok(
      /challengerName|acceptorName|declinerName/.test(code),
      "notification bodies must use server-resolved names",
    );
    assert.ok(/from\("profiles"\)/.test(code), "must query profiles table to resolve names");
  });

  it("does not require admin key for rivalry operations", () => {
    // Strip comments to avoid false positives
    const codeOnly = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(
      !/requireAdminKey/.test(codeOnly),
      "rivalry functions must not call requireAdminKey (comments only are acceptable)",
    );
  });
});

// ── WhatsApp verification ──────────────────────────────────────────────────

describe("WhatsApp: security", () => {
  const whatsappCode = readFileSync("src/lib/whatsapp.ts", "utf-8");

  it("uses the correct founder number 917639662008", () => {
    assert.ok(/917639662008/.test(whatsappCode), "must use number 917639662008");
  });

  it("does not use api.whatsapp.com in URL construction", () => {
    const codeOnly = whatsappCode.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/api\.whatsapp\.com/.test(codeOnly), "must not use api.whatsapp.com in code");
  });

  it("uses wa.me format", () => {
    assert.ok(/wa\.me/.test(whatsappCode), "must use wa.me format");
  });

  it("encodes message with encodeURIComponent", () => {
    assert.ok(/encodeURIComponent/.test(whatsappCode), "must URL-encode the message");
  });

  it("no hardcoded old number 919790833416 in any src/ file", () => {
    const files = [
      "src/lib/whatsapp.ts",
      "src/app/components/PaywallModal.tsx",
      "src/app/components/UPIPaymentModal.tsx",
      "src/app/components/TrialExpiredScreen.tsx",
    ];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      assert.ok(!/919790833416/.test(content), `${file} must not contain old number 919790833416`);
    }
  });

  it("no api.whatsapp.com in any src/ component file", () => {
    const files = [
      "src/app/components/PaywallModal.tsx",
      "src/app/components/UPIPaymentModal.tsx",
      "src/app/components/TrialExpiredScreen.tsx",
    ];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      assert.ok(!/api\.whatsapp\.com/.test(content), `${file} must not use api.whatsapp.com`);
    }
  });
});

// ── Client-side authorization ──────────────────────────────────────────────

describe("Client: Outperform UX authorization", () => {
  const communityCode = readFileSync("src/app/views/CommunityView.tsx", "utf-8");

  it("hides OUTPERFORM button when viewing own profile", () => {
    assert.ok(
      /isSelf/.test(communityCode) && /!isSelf/.test(communityCode),
      "must check isSelf to hide OUTPERFORM for own profile",
    );
  });

  it("has REQUEST SENT state for outgoing pending rivalries", () => {
    assert.ok(/REQUEST SENT/.test(communityCode), "must show REQUEST SENT for outgoing pending");
  });

  it("has COMPETITION ACTIVE state", () => {
    assert.ok(
      /COMPETITION ACTIVE/.test(communityCode),
      "must show COMPETITION ACTIVE for active rivalries",
    );
  });

  it("does not show OUTPERFORM button when rivalry is active", () => {
    assert.ok(
      /rivalryState\s*===\s*"none"/.test(communityCode),
      "OUTPERFORM button must only render when rivalryState is none",
    );
  });
});

// ── Reverse-direction attack resistance ─────────────────────────────────────

describe("Attack: reverse-direction rivalry creation", () => {
  const code = readRivalryFunctions();
  const sql = readMigration();

  it("database index uses canonical unordered pair (LEAST/GREATEST)", () => {
    // The index itself prevents A->B AND B->A, regardless of application code
    assert.ok(
      /LEAST\(challenger_id,\s*opponent_id\)/.test(sql) &&
        /GREATEST\(challenger_id,\s*opponent_id\)/.test(sql),
      "canonical pair index must use both LEAST and GREATEST",
    );
  });

  it("server-side bidirectional check queries both directions", () => {
    // createRivalry must check for existing rivalry in BOTH directions:
    // (A->B) OR (B->A)
    assert.ok(
      /\.or\(.*challenger_id\.eq.*opponent_id\.eq/.test(code),
      "server must query both directions for existing rivalry",
    );
  });

  it("handles unique violation (23505) with clean error message", () => {
    // When the canonical index catches a race, return a clean message
    assert.ok(/23505/.test(code), "must handle PostgreSQL unique violation code 23505");
    assert.ok(
      /rivalry request already exists/.test(code) || /active rivalry already exists/.test(code),
      "must return a clean user-facing message on duplicate",
    );
  });

  it("self-challenge prevented before any database access", () => {
    // The self-check must happen before the bidirectional lookup
    const selfCheckIdx =
      code.indexOf("challengerId === opponentId") ?? code.indexOf("opponentId === challengerId");
    const bidirectionalIdx = code.indexOf("challenger_id.eq");
    assert.ok(selfCheckIdx >= 0, "must have self-challenge check");
    assert.ok(
      bidirectionalIdx < 0 || selfCheckIdx < bidirectionalIdx,
      "self-challenge check must precede bidirectional database lookup",
    );
  });
});

// ── SECURITY DEFINER RPC deep hardening ────────────────────────────────────

describe("RPC: deep hardening verification", () => {
  const sql = readMigration();

  it("has secure search_path = public", () => {
    assert.ok(
      /SET search_path\s*=\s*public/.test(sql),
      "RPC must set search_path = public to prevent search path injection",
    );
  });

  it("does not accept arbitrary user_id from caller", () => {
    // The RPC must NOT have a p_user_id parameter
    // Recipient is resolved from the rivalry table, not caller input
    const rpcMatch = sql.match(
      /CREATE OR REPLACE FUNCTION public\.create_rivalry_notification\(([\s\S]*?)\)/,
    );
    assert.ok(rpcMatch, "must find RPC definition");
    const params = rpcMatch![1];
    assert.ok(
      !/p_user_id|p_recipient|p_target_user/.test(params),
      "RPC must NOT accept user_id/recipient/target_user parameter",
    );
  });

  it("REVOKE ALL from PUBLIC before GRANT to authenticated", () => {
    // Must revoke before grant to prevent PUBLIC access
    const rpcEnd = sql.lastIndexOf("COMMIT");
    const rpcSection = sql.substring(sql.indexOf("create_rivalry_notification"), rpcEnd);
    assert.ok(
      /REVOKE ALL ON FUNCTION.*FROM PUBLIC/.test(rpcSection),
      "must REVOKE ALL from PUBLIC",
    );
    assert.ok(
      /GRANT EXECUTE ON FUNCTION.*TO authenticated/.test(rpcSection),
      "must GRANT EXECUTE to authenticated",
    );
  });

  it("sender identity comes from auth.uid(), not client input", () => {
    assert.ok(
      /caller_id\s*:=\s*auth\.uid\(\)/.test(sql) || /caller_id uuid := auth\.uid\(\)/.test(sql),
      "caller_id must be assigned from auth.uid()",
    );
  });
});

// ── createRivalry application-level bidirectional check ────────────────────

describe("Server: createRivalry bidirectional safety", () => {
  const code = readRivalryFunctions();

  it("queries both (A->B) AND (B->A) directions before insert", () => {
    // The .or() filter must include both directions
    assert.ok(
      /challenger_id\.eq/.test(code) && /opponent_id\.eq/.test(code),
      "must reference both challenger_id and opponent_id in query",
    );
  });

  it("filters on pending/accepted/active status only", () => {
    assert.ok(
      /\.in\("status",\s*\[.*"pending".*"active".*\]\)/.test(code),
      "must filter on live statuses",
    );
  });

  it("returns early if existing live rivalry found (pre-database race)", () => {
    // Application-level check provides clean UX before the DB constraint fires
    assert.ok(
      /existing.*return|if \(existing\)/.test(code),
      "must return early if existing rivalry detected",
    );
  });
});
