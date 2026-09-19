# SVJ × Strava Integration

Imports a user's Strava activities into the **existing** activity system. There
is no second activity table, no second XP system and no client-side reward math:
an imported activity is stored in `public.svj_activities` with `source = 'strava'`
and credited by the same `svj_process_activity_rewards` policy used for in-app
sessions (base XP, duration bonus, PR bonus, daily caps, stat gains).

## What was added

| Object | Purpose |
| --- | --- |
| `svj_activities.source = 'strava'` | New accepted provenance value (additive). |
| `public.svj_strava_connections` | One OAuth token set per SVJ user. RLS-forced, **zero** privileges for `anon`/`authenticated`. |
| `public.svj_strava_oauth_states` | Single-use, 10-minute CSRF state bound to the initiating user. |
| `svj_strava_begin_connect` / `svj_strava_consume_state` / `svj_strava_save_connection` / `svj_strava_read_connection` / `svj_strava_mark_synced` / `svj_strava_import_activities` | Server-only (`service_role`) flows. |
| `svj_get_my_strava_status()` / `svj_disconnect_my_strava()` | Owner-facing; identity from `auth.uid()`. Granted to `authenticated` only. |
| `svj_process_activity_rewards_impl(uuid, uuid)` | The one authoritative activity-reward implementation, extracted from `svj_process_activity_rewards` with a single change: the target user id is passed in rather than read from `auth.uid()`. |

Migration: `supabase/migrations/20260922000000_strava_integration.sql` (additive, idempotent).

### Why `svj_process_activity_rewards` was refactored

The public `svj_process_activity_rewards(uuid)` keeps its exact signature and
grants, and now asserts the caller then delegates to the implementation. This is
the same "one implementation, two secure entry points" shape used by the Earn
Plus `*_impl` functions: the authenticated RPC derives its own user id, and the
service-role import path receives a **server-verified** user id. The
implementation is revoked from `PUBLIC`, `anon` and `authenticated`, so no
client role can name a target user.

## Security model

- **Tokens never reach the browser.** Access/refresh tokens are written and read
  only through `service_role` RPCs. `svj_get_my_strava_status()` returns the
  athlete name, timestamps and an imported-activity count — never token material.
- **No client-supplied identity.** No server function accepts a user id; the
  browser supplies only the OAuth `code`/`state`. `p_user_id` is always the
  session user verified by `requireSupabaseAuth`.
- **CSRF-safe linking.** The completing session must be the same user that
  initiated the connection; this is checked *before* any token is stored.
- **No duplicate linkages.** A Strava athlete id is unique, so one real-world
  Strava account cannot feed two SVJ accounts.
- **Idempotent by construction.** Imports key on `(user_id, client_session_id)`
  with `client_session_id = 'strava:<activity id>'`, and rewards key on the
  immutable `activity_events` ledger keys. Re-syncing can never duplicate an
  activity or double-credit XP/stats.
- **No fabrication.** Strava's summary endpoint returns no step count or
  calories, so those are stored as `0` / `NULL` rather than estimated. Cardio
  eligibility then relies on Strava's measured distance, exactly as the existing
  evidence rule requires.

## Required configuration

Set these in **Settings → Environment** (they are server-only; never expose them
as `VITE_*`):

| Key | Required | Notes |
| --- | --- | --- |
| `STRAVA_CLIENT_ID` | Yes | From the Strava API application. |
| `STRAVA_CLIENT_SECRET` | Yes | From the Strava API application. |
| `STRAVA_REDIRECT_URI` | No | Defaults to `<request origin>/strava/callback`. Set it explicitly if the app is served from a different public origin than the browser uses (proxies, custom domains, native shells). |

Until `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` are present the Profile card
renders a neutral "Strava is not enabled on this deployment yet" note — it is an
optional integration and never blocks Earn Plus, activities or XP.

### Strava application settings

1. Create an API application at <https://www.strava.com/settings/api>.
2. Set **Authorization Callback Domain** to the app's host (e.g. `savaje-com.lovable.app`).
   The full redirect URI is `https://<host>/strava/callback`.
3. Copy the Client ID and Client Secret into the environment keys above.

## Runbook

1. Apply `supabase/migrations/20260922000000_strava_integration.sql`, then
   `NOTIFY pgrst, 'reload schema';` (the migration already issues the notify).
2. Set `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` (and `STRAVA_REDIRECT_URI`
   if needed), then reload the app.
3. Profile → **Strava** → *Connect Strava* → approve on Strava.
4. The callback stores the tokens and runs an initial sync covering the last 30
   days; later syncs resume from the last successful sync with one day of overlap
   to catch late uploads.

## Verification

```bash
bun run test:strava:db   # real-PostgreSQL grants, isolation and idempotency
node --import tsx --test tests/strava.test.ts
bun tsc -b --noEmit
```

The DB suite proves, as actual PostgreSQL roles: the token store is unreadable by
`anon`/`authenticated`, every server-only RPC is denied to client roles, the
owner RPCs work for `authenticated` and are denied to `anon`, a re-import is a
no-op, and the original authenticated reward RPC still behaves exactly as before
the refactor.

## Known limitation

The callback is a web URL (`/strava/callback`). On the Capacitor Android shell
the Strava authorize page opens in the system browser, so the return trip lands
in the browser rather than back in the app. Completing the flow in the web app is
unaffected. A native deep-link return (`app.lovable.svj://strava/callback`) is a
follow-up if Strava-on-Android connect is needed.
