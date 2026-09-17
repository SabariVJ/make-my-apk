/**
 * 60-Day challenge self-service hotfix — regression tests.
 *
 * Failure class being guarded against:
 *   Normal 60-Day flows (state read, start, complete day, resume, redeem own
 *   code) previously called requireAdminKey() + supabaseAdmin, so they failed
 *   with "Privileged operation requires SVJ_SUPABASE_SECRET_KEY or
 *   SUPABASE_SERVICE_ROLE_KEY" — surfacing to users as the misleading
 *   "Could not read the server clock. Please retry." because getDbNow() went
 *   through the admin client.
 *
 * Invariants under test:
 *   1. challenge.functions.ts has NO admin-key dependency and NO admin-client
 *      access — all flows go through the authenticated middleware and the
 *      self-service RPCs only.
 *   2. The migration's RPC contract: identity from auth.uid(), no p_user_id
 *      parameters, database clock via now(), safe search_path, revoked from
 *      PUBLIC/anon, granted to authenticated.
 *   3. The verified 60-Day completion RPC stays service_role-only and remains
 *      the only XP/rivalry writer on the completion path.
 *   4. Privileged operations elsewhere (account, engagement) still fail closed.
 *   5. Day content (XP/focus/tasks) is seeded server-side — the client cannot
 *      choose its own XP.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");

function readSource(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

function stripComments(src: string): string {
  return src
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
}

describe("60-Day flows do not require an admin key", () => {
  const src = readSource("src/lib/challenge.functions.ts");
  const code = stripComments(src);

  it("challenge.functions.ts has no requireAdminKey / admin-client dependency", () => {
    assert.ok(
      !code.includes("requireAdminKey"),
      "challenge.functions.ts must not call requireAdminKey for normal user flows",
    );
    assert.ok(
      !code.includes("supabaseAdmin"),
      "challenge.functions.ts must not use the admin client",
    );
    assert.ok(
      !code.includes("SVJ_SUPABASE_SECRET_KEY") && !code.includes("SUPABASE_SERVICE_ROLE_KEY"),
      "challenge.functions.ts must not reference admin key env vars",
    );
    assert.ok(
      !code.includes("getDbNow"),
      "the DB clock must come from the RPCs (now()), not the admin-client db_now helper",
    );
  });

  it("all flows run behind the authenticated middleware and self-service RPCs", () => {
    assert.ok(
      src.includes("requireSupabaseAuth"),
      "every server function must run behind requireSupabaseAuth",
    );
    for (const rpc of [
      "svj_get_my_challenge_state",
      "svj_start_my_challenge",
      "svj_complete_my_challenge_day",
      "svj_resume_my_challenge",
      "svj_redeem_my_plus_code",
    ]) {
      assert.ok(src.includes(`"${rpc}"`), `challenge.functions.ts must use the ${rpc} RPC`);
    }
  });

  it("never forwards a caller-controlled user id to any RPC", () => {
    assert.ok(!code.includes("p_user_id"), "the self-service RPCs take no user_id parameter");
    assert.ok(
      !code.includes("context.userId"),
      "identity must be derived by auth.uid() inside the RPCs, not passed from the client",
    );
  });

  it("redeem errors stay generic so codes remain unguessable", () => {
    assert.ok(
      src.includes("This code is invalid or has already been redeemed."),
      "redemption failures must use the generic message",
    );
  });
});

describe("self-service migration contract", () => {
  const migration = readSource("supabase/migrations/20260918000000_challenge_self_service.sql");

  it("derives identity from auth.uid() and takes no user_id parameter", () => {
    const uidCount = (migration.match(/auth\.uid\(\)/g) ?? []).length;
    assert.ok(uidCount >= 5, "every self-service RPC must derive identity from auth.uid()");
    // challenge_day_definitions seeding legitimately uses day_number keys; a
    // caller-identity parameter would show up as p_user_id.
    assert.ok(!migration.includes("p_user_id"), "no RPC may take a p_user_id parameter");
  });

  it("uses the database clock, not the device clock", () => {
    const nowCount = (migration.match(/v_now timestamptz := now\(\)/g) ?? []).length;
    assert.ok(nowCount >= 4, "RPCs must read the database clock (now())");
    assert.ok(
      !migration.includes("db_now()"),
      "unlock timing must use now() directly; the old db_now admin-client path is gone",
    );
  });

  it("is SECURITY DEFINER with a safe search_path", () => {
    const definerCount = (migration.match(/SECURITY DEFINER/g) ?? []).length;
    assert.ok(definerCount >= 5, "self-service RPCs must be SECURITY DEFINER");
    const searchPaths = (migration.match(/SET search_path = public/g) ?? []).length;
    assert.ok(searchPaths >= 6, "every function must pin search_path to public");
  });

  it("revokes PUBLIC/anon and grants authenticated only", () => {
    const revokes = (
      migration.match(
        /REVOKE ALL ON FUNCTION public\.svj_[a-z_]+\([^)]*\)\s*\n?\s*FROM PUBLIC, anon, authenticated/g,
      ) ?? []
    ).length;
    assert.ok(revokes >= 6, "each RPC must be revoked from PUBLIC, anon and authenticated");
    const grants = (
      migration.match(/GRANT EXECUTE ON FUNCTION public\.svj_[a-z_]+\([^)]*\) TO authenticated/g) ??
      []
    ).length;
    assert.ok(grants >= 5, "each caller-facing RPC must be granted to authenticated");
    // The computation helper is internal-only and must not be callable directly.
    assert.ok(
      !/GRANT EXECUTE ON FUNCTION public\.svj_compute_challenge_run\([^)]*\) TO (authenticated|anon|PUBLIC)/.test(
        migration,
      ),
      "svj_compute_challenge_run is an internal helper and must not be granted to callers",
    );
  });

  it("seeds day definitions server-side so callers cannot choose their XP", () => {
    assert.ok(
      migration.includes("CREATE TABLE IF NOT EXISTS public.challenge_day_definitions"),
      "day definitions must live server-side",
    );
    assert.ok(
      /'60','Ascension','Mindset',225/.test(migration),
      "the full 60-day program must be seeded",
    );
    assert.ok(
      migration.includes("v_def.xp") && migration.includes("v_def.focus"),
      "completion must use the server-side definition's xp/focus",
    );
    assert.ok(
      !migration.includes("p_xp") || !/p_xp integer/.test(migration),
      "the self-service completion RPC must not accept a client XP parameter",
    );
    // No authenticated grant on the definition table either.
    assert.ok(
      migration.includes(
        "REVOKE ALL ON public.challenge_day_definitions FROM PUBLIC, anon, authenticated",
      ),
      "day definitions must not be readable/writable by browser roles",
    );
  });

  it("keeps the existing exactly-once verified completion path", () => {
    assert.ok(
      migration.includes("svj_record_verified_60_day_completion"),
      "completion must award XP through the existing verified activity RPC",
    );
    assert.ok(
      migration.includes("ON CONFLICT (enrollment_id, day_number) DO NOTHING"),
      "the day row insert must stay replay-safe",
    );
    assert.ok(
      migration.includes("svj_grant_my_completion_code"),
      "finishing day 60 must still grant the completion code server-side",
    );
  });

  it("preserves the redeem-code entitlement safety rules", () => {
    assert.ok(
      migration.includes("code_row.user_id <> caller_id"),
      "a code may only be redeemed by its owner",
    );
    assert.ok(
      migration.includes("WHERE id = code_row.id AND redeemed = false"),
      "redemption must be an atomic claim of an unredeemed code",
    );
    assert.ok(
      migration.includes("profile_row.plus_expires_at IS NULL"),
      "lifetime Plus must keep the superior entitlement",
    );
    assert.ok(migration.includes("interval '2 months'"), "code redemption grants exactly 2 months");
  });
});

describe("privileged boundaries stay intact", () => {
  it("the verified 60-Day completion RPC remains service_role-only", () => {
    const verified = readSource(
      "supabase/migrations/20260904183000_verified_activity_and_rivalry_scoring.sql",
    );
    assert.ok(
      verified.includes("REVOKE ALL ON FUNCTION public.svj_record_verified_60_day_completion"),
      "the verified completion RPC must stay unavailable to browser roles",
    );
    assert.ok(verified.includes("TO service_role"));
  });

  it("account deletion and engagement writes still fail closed without an admin key", () => {
    assert.ok(
      readSource("src/lib/account.functions.ts").includes("requireAdminKey()"),
      "account deletion must keep its admin gate",
    );
    assert.ok(
      readSource("src/lib/engagement.server.ts").includes("requireAdminKey()"),
      "engagement writes must keep their admin gate",
    );
  });

  it("challenge tables keep their zero-policy lockdown", () => {
    const base = readSource("supabase/migrations/20260815000000_60day_challenge.sql");
    assert.ok(
      base.includes("REVOKE ALL ON public.challenge_enrollments FROM PUBLIC, anon, authenticated"),
      "challenge_enrollments must stay denied to direct client access",
    );
    assert.ok(
      base.includes("REVOKE ALL ON public.redeem_codes FROM PUBLIC, anon, authenticated"),
      "redeem_codes must stay denied to direct client access",
    );
  });
});
