# Diagnosis: "Could not verify your membership"

## What the logs show

Failing call: `GET /_serverFn/a3378302…` = `getTrialStatus` (`src/lib/trial.functions.ts`).

- Transport HTTP status: **200** (TanStack serialises the thrown error into the body), so this is not a network or auth-middleware failure.
- Serialised server error: `{"message":"Invalid API key","hint":"Double check your Supabase anon or service_role API key."}` — repeated at 08:58, 09:02, 09:03 (each Retry).
- That message/hint shape comes from the Data API, not from app code, so the request reached the database layer and was rejected on the key.

Failing location: `getTrialStatus` handler, the `supabaseAdmin.from("profiles").select(...)` read (trial.functions.ts:64-68). The auth middleware succeeded — a bad bearer token would have thrown `Unauthorized: …` instead, and `requireAdminKey()` passed because a key *is* set.

## Secret presence in the executing server environment (presence only)

- `SVJ_SUPABASE_SECRET_KEY`: PRESENT
- `SUPABASE_SERVICE_ROLE_KEY`: PRESENT
- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`: PRESENT

So the screenshot's "missing secret" theory is wrong. Both admin candidates exist.

## Actual root cause (verified, read-only)

I probed the Data API once per key with a harmless `select id limit 1` on `profiles`:

- `SVJ_SUPABASE_SECRET_KEY` → **401 Invalid API key** (it is an old legacy JWT-format key that is no longer accepted)
- `SUPABASE_SERVICE_ROLE_KEY` → **200 OK** (current `sb_secret_…` format key, valid)
- `SUPABASE_PUBLISHABLE_KEY` → 200 OK

`src/integrations/supabase/client.server.ts` (lines 49-51) resolves the admin key as
`SVJ_SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY` — it prefers the dead legacy key, so every privileged read/write in the app (trial status, Plus grants, account deletion) fails with "Invalid API key".

## Smallest evidence-backed fix

Preferred, no code change: **delete the stale `SVJ_SUPABASE_SECRET_KEY` secret** (or overwrite it with the current secret key). The existing fallback then picks the valid `SUPABASE_SERVICE_ROLE_KEY` and the gate resolves.

If the custom secret must stay for other reasons, the alternative one-line change is to validate/order the candidates so a non-`sb_secret_`/legacy key is not preferred over `SUPABASE_SERVICE_ROLE_KEY`.

Nothing else in the trial path needs to change; middleware, RLS, grants, and the trigger protections are all fine.

## Not done (per your instructions)

No code, secret, branch, or data changes were made. The only calls issued were read-only: reading log files and one `select id limit 1` on `profiles` per key.
