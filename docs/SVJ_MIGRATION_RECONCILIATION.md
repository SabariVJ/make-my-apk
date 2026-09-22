# SVJ Migration Reconciliation — Automated Training Deployment

Produced **before** any migration was applied to production. Nothing in this
file has been executed against a remote database; applying the chain is blocked
on credentials (see **Blockers**).

## 1. PRODUCTION LAST MIGRATION

```
20260815010000_protect_plus_expires_at.sql
```

Reported by the deployment audit. It could **not** be re-verified from this
environment (no Supabase CLI, no `SUPABASE_ACCESS_TOKEN`, no database URL in the
repo or CI). Note the repo also contains test comments asserting production
already has `supabase/pending/*` Earn Plus and `20260920000000_*` — so the anchor
must be confirmed first:

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
SELECT to_regclass('public.reward_policies') IS NOT NULL AS has_pending_earned_plus;
```

## 2. REQUIRED MIGRATIONS (dependency order)

Everything below is idempotent, so applying a step production already has is a
no-op. The order mirrors the DB test bootstrap, which replays it end-to-end.

### Step A — 21 migrations after the anchor, before the Earn Plus boundary

```
20260903000000_personalization_body_rivalry.sql
20260904010000_activity_ledger.sql
20260904020000_assessment_resume.sql
20260904130235_fc2c277a-8662-4c3e-8160-e1ed6e131d5c.sql
20260904130322_b637e473-0d40-4f81-80dd-cd2b8211f0e1.sql
20260904130350_ae1584b3-bea2-4ed1-b557-13b14a21e2d7.sql
20260904180000_profile_avatar_rivalry_hardening.sql
20260904183000_verified_activity_and_rivalry_scoring.sql
20260905_add_atomic_refresh_rpc.sql
20260905_add_personalized_refresh_cooldown.sql
20260905111202_19b6224e-38e9-4039-bb35-9b5dbba4a93e.sql
20260914000000_avatar_object_path_normalization.sql
20260916000000_server_activities.sql
20260916200000_goals_and_records.sql
20260917000000_my_membership_rpc.sql
20260917010000_fix_membership_rpc_ambiguity.sql
20260918000000_challenge_self_service.sql
20260918000000_strength_logging.sql
20260919000000_activity_xp_stats.sql
20260919010000_personalized_task_assignments.sql
20260919120000_recovery_readiness.sql
```

### Step B — 3 pending Earn Plus scripts (required by Step C)

```
supabase/pending/20260902_earned_plus.sql
supabase/pending/20260902_enable_earned_plus.sql
supabase/pending/20260903_earned_plus_qualifying_days_7.sql
```

Only needed when `reward_policies` does not exist yet. They create the
`reward_*` schema that every migration ≥ `20260920000000` builds on.

### Step C — 7 migrations ≥ `20260920000000`, before Automated Training

```
20260920000000_earned_plus_self_service.sql
20260921000000_earned_plus_stale_session_hardening.sql
20260923000000_native_activity_track_storage.sql
20260923010000_native_activity_rpcs.sql
20260923020000_native_activity_live_share.sql
20260924000000_wear_os_activity_source.sql
20260925000000_personalized_completion_xp_report.sql
```

## 3. AUTOMATED TRAINING MIGRATIONS (7)

```
20260926000000_automated_training.sql   profile, templates, plans, plan sessions,
                                         context, decisions + RLS + RPCs
20260927000000_training_warmup.sql       svj_strength_sets.is_warmup + history/muscle
                                         RPCs exclude warm-ups
20260928000000_training_progress.sql     svj_exercises.load_convention + progression reads
20260929000000_training_multidevice.sql  cross-device plan/session sync
20260930000000_training_plan_controls.sql slot ordering / rest-day controls
20260930100000_legacy_template_import.sql svj_import_legacy_template
20261001000000_training_history_effort.sql svj_get_exercise_history also returns
                                           perceived_effort
```

Dependency: each file reads the tables/RPCs of the previous one; `20261001000000`
`CREATE OR REPLACE`s only `svj_get_exercise_history`. They must run **after**
Step A–C, never in isolation.

## 4. Safety audit (35 repo migrations + 3 pending, all post-anchor)

| Check | Result |
|---|---|
| Destructive statements | None. Only `DROP TABLE IF EXISTS svj_tmp_track` (a scratch table inside `20260923010000_native_activity_rpcs.sql`). |
| Re-run safety | All `CREATE TABLE` use `IF NOT EXISTS`, all functions `CREATE OR REPLACE`, all `ADD COLUMN` `IF NOT EXISTS`, policies/triggers `IF EXISTS`. The one index that lacks `IF NOT EXISTS` (`20260921000000:16`) appears only inside a comment quoting the pre-existing definition. |
| Duplicate objects | Three near-identical pairs exist (`20260903000000` ≡ `20260904130235`, `20260904010000` ≡ `20260904130322`, `20260904020000` ≡ `20260904130350`). Diff shows only two extra `DROP … IF EXISTS` lines in one of them — second application is a no-op. |
| Same-timestamp pair | `20260918000000_challenge_self_service.sql` and `20260918000000_strength_logging.sql` share a timestamp; filename sort is deterministic. |
| RLS | Every new user table gets `ENABLE`/`FORCE ROW LEVEL SECURITY`. No `INSERT/UPDATE/DELETE` grant to `authenticated` outside `SECURITY DEFINER` RPCs. The only `anon` grant is `svj_get_public_live_share` (intentional). |
| RPC conflicts | `20260917010000_fix_membership_rpc_ambiguity.sql` resolves an overload ambiguity; full-chain replay is green. |
| Reward/XP authority | Automated Training migrations never touch `reward_*` or grant XP; asserted by tests. |
| Atomicity | 27 of 35 files carry `BEGIN/COMMIT`; the other 8 are single statements or must be applied through the Supabase CLI, which wraps each migration. |

**Verification that this ordering works:** 6 DB test suites replay the exact
chain (pre-`20260920000000` → `supabase/pending` → `≥20260920000000`) in isolated
PGlite, and CI repeats it on native PostgreSQL 17. Production parity for the
older trigger bodies is simulated with `tests/fixtures/pre-hotfix-triggers.sql`,
which proves the amended historical files and the older applied versions converge.

## 5. Blockers

Applying anything above needs credentials that are not present in this
environment:

- no Supabase CLI installed, no `SUPABASE_ACCESS_TOKEN`;
- no `.env` / database URL in the repo (only CI's throwaway local Postgres);
- migrations require owner/`postgres` rights, which the app's anon key cannot
  provide.

Recommended apply order once authorized: confirm the Step-0 queries → one
maintenance window → `supabase db push` (or `psql` per file, in the order above)
→ re-run `bun run test` including the DB suites against the migrated database.
