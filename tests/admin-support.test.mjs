// Admin dashboard + support ticket regression tests.
// Structural: pins the migration's security model (RLS, grants, trigger
// grant logic, predicate lockdown) and the frontend integration contracts.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261006000000_admin_roles_support_tickets.sql", import.meta.url),
  "utf8",
);
// Follow-up migrations that make the admin surface correct on the real
// production project (founder provisioning + the profiles embed FK).
const founderMigration = await readFile(
  new URL("../supabase/migrations/20261007000000_founder_admin_access.sql", import.meta.url),
  "utf8",
);
const profilesFkMigration = await readFile(
  new URL("../supabase/migrations/20261008000000_support_tickets_profiles_fk.sql", import.meta.url),
  "utf8",
);
// Per-table slices so "no X policy" assertions can't leak across sections.
const userRolesSection = migration.split(
  "-- ============================================================================\n-- 2)",
)[0];
const ticketsSection = migration.split("-- 4) support_tickets")[1] ?? "";
const readSrc = async (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

const adminFunctions = await readSrc("lib/admin.functions.ts");
const supportFunctions = await readSrc("lib/support.functions.ts");
const adminRoleHook = await readSrc("app/lib/adminRole.ts");
const utilityNav = await readSrc("app/lib/utilityNav.ts");
const profileView = await readSrc("app/views/ProfileView.tsx");
const supportTickets = await readSrc("app/components/SupportTickets.tsx");
const adminDashboard = await readSrc("app/views/AdminDashboardView.tsx");
/** The follow-up migration with `--` comment lines stripped (assert on SQL, not prose). */
const profilesFkSql = profilesFkMigration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const supabaseTypes = await readSrc("integrations/supabase/types.ts");
const appEntry = await readSrc("app/App.tsx");

describe("user_roles table security model", () => {
  it("creates user_roles with uuid pk, unique user_id FK, admin-only role check", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_roles \(/);
    assert.match(
      migration,
      /user_id uuid NOT NULL UNIQUE REFERENCES auth\.users \(id\) ON DELETE CASCADE/,
    );
    assert.match(migration, /role text NOT NULL DEFAULT 'admin' CHECK \(role IN \('admin'\)\)/);
    assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it("enables RLS and scopes SELECT to the owner only", () => {
    assert.match(migration, /ALTER TABLE public\.user_roles ENABLE ROW LEVEL SECURITY/);
    assert.match(
      migration,
      /CREATE POLICY "Users can view their own role"[\s\S]*?FOR SELECT[\s\S]*?TO authenticated[\s\S]*?USING \(user_id = auth\.uid\(\)\)/,
    );
  });

  it("blocks all writes for anon and authenticated via grants and missing policies", () => {
    assert.match(migration, /REVOKE ALL ON public\.user_roles FROM anon, authenticated/);
    // No INSERT/UPDATE/DELETE policies exist for user_roles.
    assert.doesNotMatch(userRolesSection, /FOR (INSERT|UPDATE|DELETE)/);
  });
});

describe("signup trigger grants admin to exactly one Google account", () => {
  it("checks email case-insensitively AND requires the google provider", () => {
    assert.match(migration, /lower\(COALESCE\(NEW\.email, ''\)\) = 'sabarivj777@gmail\.com'/);
    assert.match(migration, /NEW\.raw_app_meta_data ->> 'provider' = 'google'/);
  });

  it("inserts the admin role on conflict nothing", () => {
    assert.match(
      migration,
      /INSERT INTO public\.user_roles \(user_id, role\)[\s\S]*?ON CONFLICT \(user_id\) DO NOTHING/,
    );
  });

  it("keeps the original profile-creation behavior in the same trigger", () => {
    assert.match(
      migration,
      /INSERT INTO public\.profiles \(id, email, display_name, signup_date\)/,
    );
    assert.match(
      migration,
      /CREATE TRIGGER on_auth_user_created[\s\S]*?EXECUTE FUNCTION public\.handle_new_user\(\)/,
    );
  });
});

describe("is_admin_or_mod predicate", () => {
  it("is a security definer checking user_roles, executable by authenticated only", () => {
    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION public\.is_admin_or_mod\(uid uuid\)[\s\S]*?SECURITY DEFINER/,
    );
    assert.match(
      migration,
      /SELECT EXISTS \(SELECT 1 FROM public\.user_roles WHERE user_id = uid\)/,
    );
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.is_admin_or_mod\(uuid\) FROM PUBLIC, anon/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.is_admin_or_mod\(uuid\) TO authenticated/,
    );
  });
});

describe("support_tickets table and RLS", () => {
  it("creates the table with category/status constraints and timestamps", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.support_tickets \(/);
    assert.match(
      migration,
      /category text NOT NULL CHECK \(category IN \('payment', 'bug', 'account', 'other'\)\)/,
    );
    assert.match(
      migration,
      /status text NOT NULL DEFAULT 'open' CHECK \(status IN \('open', 'in_progress', 'resolved'\)\)/,
    );
    assert.match(migration, /admin_response text,/);
    assert.match(migration, /resolved_at timestamptz/);
  });

  it("lets users insert and select only their own tickets", () => {
    assert.match(
      migration,
      /CREATE POLICY "Users can create their own tickets"[\s\S]*?WITH CHECK \(user_id = auth\.uid\(\)\)/,
    );
    assert.match(
      migration,
      /CREATE POLICY "Users can view their own tickets"[\s\S]*?USING \(user_id = auth\.uid\(\)\)/,
    );
  });

  it("gives admins select-all and update via is_admin_or_mod", () => {
    assert.match(
      migration,
      /CREATE POLICY "Admins can view all tickets"[\s\S]*?USING \(public\.is_admin_or_mod\(auth\.uid\(\)\)\)/,
    );
    assert.match(
      migration,
      /CREATE POLICY "Admins can update tickets"[\s\S]*?USING \(public\.is_admin_or_mod\(auth\.uid\(\)\)\)[\s\S]*?WITH CHECK \(public\.is_admin_or_mod\(auth\.uid\(\)\)\)/,
    );
  });

  it("denies regular users any update via missing owner UPDATE policy + column grants", () => {
    // The only UPDATE policy in the tickets section is the admin one.
    const updatePolicies = ticketsSection.match(/CREATE POLICY "[^"]*"[\s\S]*?FOR UPDATE/g) ?? [];
    assert.equal(updatePolicies.length, 1);
    assert.match(updatePolicies[0], /Admins can update tickets/);
    assert.match(migration, /REVOKE UPDATE ON public\.support_tickets FROM authenticated/);
    assert.match(
      migration,
      /GRANT UPDATE \(status, admin_response, resolved_at, updated_at\)[\s\S]*?ON public\.support_tickets TO authenticated/,
    );
  });

  it("revokes anon access entirely and keeps updated_at fresh", () => {
    assert.match(migration, /REVOKE ALL ON public\.support_tickets FROM anon/);
    assert.match(migration, /CREATE TRIGGER support_tickets_set_updated_at/);
  });

  it("does not touch the profiles table schema", () => {
    assert.doesNotMatch(migration, /ALTER TABLE public\.profiles/);
  });
});

describe("admin server functions verify role server-side", () => {
  it("every privileged function resolves the caller's uid from the verified session", () => {
    assert.match(adminFunctions, /context\.userId/);
    // The role check queries user_roles with role = admin.
    assert.match(adminFunctions, /\.eq\("user_id", userId\)[\s\S]*?\.eq\("role", "admin"/);
    assert.match(adminFunctions, /Forbidden: admin role required/);
  });

  it("uses the service-role client for privileged writes and never exports it", () => {
    assert.match(adminFunctions, /supabaseAdmin\.auth\.admin\.deleteUser\(targetUserId\)/);
    assert.match(
      adminFunctions,
      /supabaseAdmin[\s\S]*?from\("profiles"\)[\s\S]*?update\(\{ is_plus_member: true/,
    );
    assert.match(adminFunctions, /is_plus_member: false, plus_expires_at: null/);
  });

  it("validates uuid inputs and refuses self-deletion", () => {
    assert.match(adminFunctions, /\^\[0-9a-f-\]\{36\}\$\/i/);
    assert.match(adminFunctions, /Refusing to delete your own account/);
  });

  it("provides dashboard stats incl. new signups and open tickets", () => {
    assert.match(adminFunctions, /newSignupsLast7Days/);
    assert.match(adminFunctions, /\.eq\("status", "open"\)/);
    assert.match(adminFunctions, /gte\("created_at", sevenDaysAgo\)/);
  });

  it("sanitizes the search term before the ilike filter", () => {
    assert.ok(adminFunctions.includes('replace(/[%,()]/g, "")'), "search term must be sanitized");
  });
});

describe("support ticket functions", () => {
  it("creates tickets for the session user only (RLS-backed)", () => {
    assert.match(supportFunctions, /\.insert\(\{ user_id: userId, category, message \}\)/);
    assert.match(supportFunctions, /Message must be between 1 and 5000 characters/);
  });

  it("admin ticket updates use the authenticated client with status + response only", () => {
    assert.match(supportFunctions, /adminUpdateSupportTicket/);
    assert.match(supportFunctions, /Forbidden: admin role required/);
  });
});

describe("frontend integration", () => {
  it("checks role silently via a user_roles select and exposes a tri-state gate", () => {
    assert.match(adminRoleHook, /from\("user_roles"\)/);
    assert.match(adminRoleHook, /status: "admin"/);
    assert.match(adminRoleHook, /status: "none"/);
  });

  it("shows the Admin entry only for admins and nothing for everyone else", () => {
    assert.match(utilityNav, /isAdmin \? \[\.\.\.items, ADMIN_NAV_ITEM\] : items/);
    // The base rail/drawer list must not contain an admin entry, so non-admins
    // never see (or are told about) the surface.
    const baseList = utilityNav.split("const ADMIN_NAV_ITEM")[0];
    assert.doesNotMatch(baseList, /"admin"/);
    assert.match(baseList, /UTILITY_NAV_ITEMS: UtilityNavItem\[\] = \[/);
  });

  it("renders the dashboard only when admin and includes both sections", () => {
    assert.match(adminDashboard, /admin-users-section/);
    assert.match(adminDashboard, /admin-tickets-section/);
    assert.match(adminDashboard, /Grant Plus/);
    assert.match(adminDashboard, /Revoke Plus/);
    assert.match(adminDashboard, /Confirm delete/);
    assert.match(adminDashboard, /type="date"/);
    assert.match(adminDashboard, /Admin response/);
  });

  it("replaces the Email Us action with the ticket flow in Profile", () => {
    assert.match(profileView, /<RaiseTicketForm \/>/);
    assert.match(profileView, /<MyTicketsList \/>/);
    assert.doesNotMatch(profileView, /Email Us|handleEmailSupport|mailto/);
  });

  it("ticket form submits category + message and lists tickets with status badges", () => {
    assert.match(supportTickets, /createSupportTicket/);
    assert.match(supportTickets, /Payment issue/);
    assert.match(supportTickets, /In Progress/);
    assert.match(supportTickets, /SVJ Support/); // admin response block
    assert.match(supportTickets, /my-tickets-list/);
  });
});

describe("support_tickets -> profiles embed (admin ticket list)", () => {
  it("keeps the auth.users ownership FK exactly as is", () => {
    assert.match(
      migration,
      /user_id uuid NOT NULL UNIQUE REFERENCES auth\.users \(id\) ON DELETE CASCADE|user_id uuid NOT NULL REFERENCES auth\.users \(id\) ON DELETE CASCADE/,
    );
    // The follow-up never drops, replaces or alters the ownership FK.
    assert.doesNotMatch(profilesFkSql, /DROP CONSTRAINT/);
    assert.doesNotMatch(profilesFkSql, /ALTER COLUMN user_id/);
  });

  it("adds an explicitly named FK from support_tickets.user_id to public.profiles(id)", () => {
    assert.match(profilesFkMigration, /ADD CONSTRAINT support_tickets_user_id_profiles_fkey/);
    assert.match(
      profilesFkMigration,
      /FOREIGN KEY \(user_id\) REFERENCES public\.profiles \(id\) ON DELETE CASCADE/,
    );
  });

  it("is idempotent and cannot fail on pre-existing data", () => {
    assert.match(profilesFkMigration, /FROM pg_constraint/);
    assert.match(profilesFkMigration, /conname = 'support_tickets_user_id_profiles_fkey'/);
    assert.match(profilesFkSql, /IF EXISTS \([\s\S]*?RETURN;/);
    // Orphan rows downgrade the constraint instead of failing the migration.
    assert.match(profilesFkMigration, /NOT VALID/);
    assert.match(profilesFkMigration, /LEFT JOIN public\.profiles p ON p\.id = t\.user_id/);
    assert.doesNotMatch(profilesFkSql, /DELETE FROM|TRUNCATE/i);
  });

  it("changes no policy, grant or provisioning rule", () => {
    assert.doesNotMatch(
      profilesFkSql,
      /CREATE POLICY|GRANT |REVOKE |handle_new_user|is_admin_or_mod/,
    );
  });

  it("the admin query embeds profiles through the explicit constraint name", () => {
    assert.match(
      supportFunctions,
      /profiles!support_tickets_user_id_profiles_fkey\(username, email\)/,
    );
    assert.doesNotMatch(supportFunctions, /profiles!support_tickets_user_id_fkey\(/);
  });

  it("generated types describe the same relationship", () => {
    assert.match(supabaseTypes, /foreignKeyName: "support_tickets_user_id_profiles_fkey"/);
    assert.match(supabaseTypes, /referencedRelation: "profiles"/);
    assert.match(supabaseTypes, /referencedColumns: \["id"\]/);
    assert.doesNotMatch(supabaseTypes, /foreignKeyName: "support_tickets_user_id_fkey"/);
  });
});

describe("founder provisioning and role reads (20261007)", () => {
  it("keeps the founder rule narrow: one email AND the Google provider", () => {
    assert.match(founderMigration, /lower\(COALESCE\(u\.email, ''\)\) = 'sabarivj777@gmail\.com'/);
    assert.match(founderMigration, /u\.raw_app_meta_data ->> 'provider' = 'google'/);
    assert.match(founderMigration, /LIMIT 1/);
    assert.match(founderMigration, /ON CONFLICT \(user_id\) DO NOTHING/);
    const emailMatches = founderMigration.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    const emails = new Set(emailMatches.map((address) => address.toLowerCase()));
    assert.deepEqual([...emails], ["sabarivj777@gmail.com"]);
  });

  it("restores the own-row read the admin gate depends on", () => {
    assert.match(founderMigration, /GRANT SELECT ON public\.user_roles TO authenticated/);
    assert.match(adminRoleHook, /\.eq\("user_id", uid\)/);
    assert.match(adminRoleHook, /\.eq\("role", "admin"\)/);
    // The gate never keys off an email or a profile field.
    assert.doesNotMatch(adminRoleHook, /sabarivj777/);
    assert.doesNotMatch(adminRoleHook, /isOwner|isFounder|display_name|username/);
  });

  it("a normal user is not admin and cannot reach the admin destination", () => {
    assert.match(appEntry, /const isAdmin = adminRole\.status === "admin"/);
    const baseList = utilityNav.split("const ADMIN_NAV_ITEM")[0];
    assert.doesNotMatch(baseList, /"admin"/);
  });

  it("admin-only surfaces stay behind the DB predicate", () => {
    // Listing every ticket and updating one are both gated by the admin policy.
    assert.match(
      migration,
      /CREATE POLICY "Admins can view all tickets"[\s\S]*?USING \(public\.is_admin_or_mod\(auth\.uid\(\)\)\)/,
    );
    assert.match(
      migration,
      /CREATE POLICY "Admins can update tickets"[\s\S]*?USING \(public\.is_admin_or_mod\(auth\.uid\(\)\)\)/,
    );
    // And the column-scoped grant still limits what an admin may write.
    assert.match(migration, /GRANT UPDATE \(status, admin_response, resolved_at, updated_at\)/);
    // The server-side re-checks remain in place for both admin ticket calls.
    const forbidden = supportFunctions.match(/Forbidden: admin role required/g) ?? [];
    assert.ok(forbidden.length >= 2);
  });
});
