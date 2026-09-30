/**
 * Canonical SVJ founder identity — single source of truth.
 *
 * The canonical founder/admin account is sabarivj777@gmail.com. This is the
 * actual production founder/admin account, and it is ALSO the public
 * SUPPORT contact address (see src/app/lib/supportEmail.ts) — both roles
 * belong to the same account and both are retained.
 *
 * The sabarivj2008@gmail.com address is NOT a founder account and must not
 * be granted founder/admin entitlements by application code or migrations.
 *
 * This module exists so every consumer that previously hard-coded the owner
 * email derives from one constant. Database-backed role checks
 * (user_roles / adminRole.ts) are unaffected: they read the DB, never this
 * constant. The constant only decides which account is presented as
 * founder/owner in the client and which account the server-side challenge
 * debug flag recognizes.
 */
export const FOUNDER_EMAIL = "sabarivj777@gmail.com";
