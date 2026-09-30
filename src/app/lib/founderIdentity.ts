/**
 * Canonical SVJ founder identity — single source of truth.
 *
 * The canonical founder/admin account is sabarivj2008@gmail.com. The legacy
 * sabarivj777@gmail.com address remains the SUPPORT contact only (it is the
 * public business/support address shown in the UI) — it is no longer the
 * canonical owner identity used by the founder gate, founder UI, or admin
 * debug flag.
 *
 * This module exists so every consumer that previously hard-coded the legacy
 * owner email derives from one constant. Database-backed role checks
 * (user_roles / adminRole.ts) are unaffected: they read the DB, never this
 * constant. The constant only decides which account is presented as
 * founder/owner in the client and which legacy account the server-side
 * challenge debug flag referenced.
 */
export const FOUNDER_EMAIL = "sabarivj2008@gmail.com";
