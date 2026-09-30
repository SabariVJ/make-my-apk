// Founder admin-access regression tests.
//
// Structural (no live database): they pin the two database-side defects that
// stopped the founder (Google / sabarivj777@gmail.com) from seeing the existing
// Admin Dashboard, the idempotency/scope of the backfill, and the fact that
// admin access is still decided server-side.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const readSrc = async (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
const readMigration = async (name) =>
  readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

const base = await readMigration("20261006000000_admin_roles_support_tickets.sql");
const fixRaw = await readMigration("20261007000000_founder_admin_access.sql");

/** Strip `--` comment lines so assertions target SQL, not documentation prose. */
const stripComments = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

const fix = stripComments(fixRaw);

const adminFunctions = await readSrc("lib/admin.functions.ts");
const supportFunctions = await readSrc("lib/support.functions.ts");
const adminRoleHook = await readSrc("app/lib/adminRole.ts");
const utilityNav = await readSrc("app/lib/utilityNav.ts");
const app = await readSrc("app/App.tsx");
const profileView = await readSrc("app/views/ProfileView.tsx");

const FOUNDER_EMAIL = "sabarivj777@gmail.com";

/** Client-side sources that must never contain a founder email allow-list. */
const CLIENT_SOURCES = {
  "app/App.tsx": app,
  "app/lib/adminRole.ts": adminRoleHook,
  "app/lib/utilityNav.ts": utilityNav,
};

describe("root cause: user_roles was unreadable by its own owner", () => {
  it("the original migration revoked SELECT along with every other privilege", () => {
    // REVOKE ALL covers SELECT, which is what broke the row-level read the
    // client gate and the admin ticket functions depend on.
    assert.match(base, /REVOKE ALL ON public\.user_roles FROM anon, authenticated/);
  });

  it("the fix restores SELECT for authenticated so the RLS policy can apply", () => {
    assert.match(fix, /GRANT SELECT ON public\.user_roles TO authenticated/);
    // Row visibility is still the existing own-row policy.
    assert.match(
      base,
      /CREATE POLICY "Users can view their own role"[\s\S]*?USING \(user_id = auth\.uid\(\)\)/,
    );
  });

  it("keeps every write privilege and all anon access revoked", () => {
    assert.match(
      fix,
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.user_roles FROM anon, authenticated/,
    );
    assert.match(fix, /REVOKE ALL ON public\.user_roles FROM anon/);
    // The fix never grants a write privilege.
    assert.doesNotMatch(fix, /GRANT (INSERT|UPDATE|DELETE|ALL)/i);
  });
});

describe("root cause: pre-existing founder account had no role row", () => {
  it("the signup trigger can only ever grant at signup (AFTER INSERT on auth.users)", () => {
    assert.match(base, /AFTER INSERT ON auth\.users/);
    assert.match(base, /INSERT INTO public\.user_roles \(user_id, role\)/);
  });

  it("the fix backfills the existing account from auth.users into user_roles", () => {
    assert.match(fix, /INSERT INTO public\.user_roles \(user_id, role\)/);
    assert.match(fix, /FROM auth\.users u/);
  });

  it("uses the same non-client-supplied identity source as the trigger", () => {
    assert.match(fix, /lower\(COALESCE\(u\.email, ''\)\) = 'sabarivj777@gmail\.com'/);
    assert.doesNotMatch(fix, /auth\.uid\(\)/, "the grant must not depend on the caller");
  });

  it("is idempotent and cannot create a second admin row", () => {
    assert.match(fix, /ON CONFLICT \(user_id\) DO NOTHING/);
    assert.match(fix, /LIMIT 1/);
    // No destructive statements: re-running only ever adds the missing row.
    assert.doesNotMatch(fix, /\bDROP\b/i);
    assert.doesNotMatch(fix, /\bDELETE FROM\b/i);
    assert.doesNotMatch(fix, /TRUNCATE (TABLE|public\.)/i);
  });

  it("leaves the existing signup grant untouched", () => {
    // The fix must not redefine the signup function or its trigger.
    assert.doesNotMatch(fix, /CREATE OR REPLACE FUNCTION public\.handle_new_user/);
    assert.doesNotMatch(fix, /CREATE TRIGGER on_auth_user_created/);
    assert.doesNotMatch(fix, /is_admin_or_mod/);
  });
});

describe("grant is restricted to founder email AND the Google provider", () => {
  it("requires the Google provider claim alongside the email", () => {
    assert.match(fix, /u\.raw_app_meta_data ->> 'provider' = 'google'/);
    // Both conditions must be ANDed to the email predicate.
    const predicate = fix.slice(fix.indexOf("WHERE lower(COALESCE(u.email"));
    assert.match(predicate, /AND\s*\(/);
  });

  it("ignores a same-address account with a non-Google provider", () => {
    // A password/other-provider row for this address fails the provider check,
    // so the SELECT returns no candidate and nothing is inserted.
    assert.doesNotMatch(fix, /providers' \? 'email'/);
    assert.doesNotMatch(fix, /'email' =/);
  });

  it("does not grant admin to any other address", () => {
    const emails = new Set(
      (fixRaw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()),
    );
    // Only the founder address appears — and only inside a lower(email) equality.
    assert.deepEqual([...emails], [FOUNDER_EMAIL]);
    assert.match(fix, /lower\(COALESCE\(u\.email, ''\)\) = 'sabarivj777@gmail\.com'/);
    assert.doesNotMatch(fix, /email\s*(LIKE|ILIKE|~)/i);
  });
});

describe("navigation: founder-admin gate is database-backed, never client-side", () => {
  it("no client source contains a founder email allow-list", () => {
    for (const [file, source] of Object.entries(CLIENT_SOURCES)) {
      assert.ok(
        !source.includes(FOUNDER_EMAIL),
        `${file} must not hard-code the founder email for admin access`,
      );
      assert.ok(
        !source.includes(FOUNDER_EMAIL.split("@")[0]),
        `${file} must not match on the founder local-part`,
      );
    }
    assert.doesNotMatch(adminRoleHook, /email/i);
  });

  it("normal users never see an admin entry: the base list has no admin id", () => {
    const baseList = utilityNav.split("const ADMIN_NAV_ITEM")[0];
    assert.doesNotMatch(baseList, /"admin"/);
    assert.match(utilityNav, /isAdmin \? \[\.\.\.items, ADMIN_NAV_ITEM\] : items/);
  });

  it("the admin entry is rendered only from the resolved role state", () => {
    assert.match(adminRoleHook, /from\("user_roles"\)/);
    assert.match(adminRoleHook, /\.eq\("role", "admin"\)/);
    assert.match(app, /const adminRole = useAdminRole\(\)/);
    assert.match(app, /const isAdmin = adminRole\.status === "admin"/);
    assert.match(app, /isAdmin=\{isAdmin\}/);
    // Founders/admins reach the dashboard view, and it is gated on isAdmin.
    assert.match(app, /isAdmin && activeTab === "admin" && <AdminDashboardView \/>/);
  });

  it("admin is never derived from the client-side founder/owner identity", () => {
    // The Recovery founder gate (isFounderAccount) stays a Recovery-only
    // concern; it must not become an admin source.
    assert.match(app, /const isAdmin = adminRole\.status === "admin"/);
    assert.doesNotMatch(app, /const isAdmin = [^;]*(isFounderAccount|isOwner|isFounder)/);
  });

  it("a failed role read resolves to 'none' (fails closed)", () => {
    assert.match(adminRoleHook, /status: "none"/);
    assert.match(adminRoleHook, /data && !error \? \{ status: "admin" \} : \{ status: "none" \}/);
  });
});

describe("founder keeps the support-ticket flow", () => {
  it("Profile still exposes the ticket form and list, not email support", () => {
    assert.match(profileView, /<RaiseTicketForm \/>/);
    assert.match(profileView, /<MyTicketsList \/>/);
    assert.doesNotMatch(profileView, /Email Us|mailto/);
  });

  it("the ticket flow is not gated behind the admin role", () => {
    assert.doesNotMatch(profileView, /isAdmin/);
    assert.match(supportFunctions, /createSupportTicket/);
    assert.match(supportFunctions, /listMySupportTickets/);
  });
});

describe("admin authorization stays server-side", () => {
  it("every privileged admin function verifies the role via requireAdminUserId", () => {
    const handlers = adminFunctions.match(/\.handler\(/g) ?? [];
    const checks = adminFunctions.match(/await requireAdminUserId\(context\.userId\)/g) ?? [];
    assert.ok(handlers.length >= 5, `expected >=5 privileged handlers, saw ${handlers.length}`);
    assert.equal(
      checks.length,
      handlers.length,
      "every privileged admin handler must call requireAdminUserId(context.userId)",
    );
    assert.match(adminFunctions, /Forbidden: admin role required/);
  });

  it("derives the uid from the verified session, never from request input", () => {
    assert.match(adminFunctions, /requireSupabaseAuth/);
    assert.doesNotMatch(adminFunctions, /data\.userId/);
    assert.doesNotMatch(adminFunctions, /data\.email/);
    assert.doesNotMatch(adminFunctions, /data\.role/);
    // Validators only accept target ids / paging / expiry — no identity claims.
    assert.doesNotMatch(adminFunctions, /validator\([^)]*email/);
  });

  it("admin ticket functions re-check the role before serving other users' data", () => {
    const roleChecks = supportFunctions.match(/Forbidden: admin role required/g) ?? [];
    assert.ok(roleChecks.length >= 2, "admin ticket list/update must both re-check the role");
    assert.match(supportFunctions, /requireSupabaseAuth/);
  });

  it("does not export the service-role client to the client bundle", () => {
    assert.match(adminFunctions, /await import\("@\/integrations\/supabase\/client\.server"\)/);
    assert.doesNotMatch(adminFunctions, /^export .*supabaseAdmin/m);
  });
});
