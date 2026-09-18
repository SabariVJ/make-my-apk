/**
 * Update 05 — Recovery / Training Load / Readiness contracts.
 *
 * The readiness score is deterministic and server-side. These tests pin:
 *   - the additive migration's tables, RPC surface and lockdown
 *   - identity = auth.uid() only (no admin key, no user_id params)
 *   - check-in validation bounds and one-per-day idempotency
 *   - transparent scoring: only recorded activity + explicit check-ins
 *   - no fake wearable data (no HRV / resting-HR inputs)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260919120000_recovery_readiness.sql", import.meta.url),
  "utf8",
);
const recoveryLib = readFileSync(new URL("../src/app/lib/recovery.ts", import.meta.url), "utf8");
const activityView = readFileSync(
  new URL("../src/app/views/ActivityView.tsx", import.meta.url),
  "utf8",
);

describe("recovery schema + security", () => {
  test("check-in and readiness tables exist with RLS", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_recovery_checkins/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_readiness_daily/);
    assert.match(migration, /FORCE ROW LEVEL SECURITY/);
    assert.match(migration, /USING \(auth\.uid\(\) = user_id\)/);
  });

  test("one check-in per user per day (database clock)", () => {
    assert.match(
      migration,
      /CONSTRAINT svj_recovery_checkins_identity UNIQUE \(user_id, checkin_date\)/,
    );
    assert.match(migration, /DEFAULT \(now\(\) AT TIME ZONE 'utc'\)::date/);
  });

  test("clients can only read readiness; check-ins via own-row policy", () => {
    assert.match(migration, /GRANT SELECT ON public\.svj_readiness_daily TO authenticated/);
    assert.doesNotMatch(
      migration.slice(migration.indexOf("svj_readiness_daily ENABLE")),
      /GRANT (INSERT|UPDATE) ON public\.svj_readiness_daily TO authenticated/,
      "readiness rows are server-derived only",
    );
  });

  test("self-service RPCs derive auth.uid(), no admin key, no user_id param", () => {
    assert.match(migration, /svj_save_my_recovery_checkin/);
    assert.match(migration, /svj_get_my_readiness/);
    assert.match(migration, /svj_list_my_recovery_history/);
    assert.match(migration, /v_caller uuid := auth\.uid\(\)/);
    // Only internal definer helpers may take a user id; the RPCs exposed to
    // clients take none.
    assert.doesNotMatch(migration, /svj_save_my_recovery_checkin\([\s\S]*?p_user_id/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.svj_get_my_readiness\(\)\s+FROM PUBLIC, anon, authenticated/,
    );
  });
});

describe("deterministic scoring policy", () => {
  test("load weights are transparent and duration is capped", () => {
    assert.match(migration, /FUNCTION public\.svj_activity_load_points/);
    assert.match(migration, /LEAST\(p_duration_seconds, 10800\)/, "3h cap per activity");
    assert.match(migration, /WHEN 'strength' THEN 1\.3/);
    assert.match(migration, /WHEN 'walking' THEN 0\.6/);
  });

  test("load bands are bounded", () => {
    assert.match(migration, /FUNCTION public\.svj_load_band/);
    assert.match(migration, /'low', 'moderate', 'high', 'very_high'/);
  });

  test("check-in inputs are bounded 1–5 / 0–24h", () => {
    assert.match(migration, /CHECK \(sleep_hours BETWEEN 0 AND 24\)/);
    assert.match(migration, /CHECK \(soreness BETWEEN 1 AND 5\)/);
    assert.match(migration, /CHECK \(energy BETWEEN 1 AND 5\)/);
    assert.match(migration, /CHECK \(perceived_recovery BETWEEN 1 AND 5\)/);
    // Server-side revalidation inside the RPC.
    assert.match(migration, /Invalid sleep hours/);
    assert.match(migration, /At least one check-in value is required/);
  });

  test("score clamped 0–100 and persisted per day", () => {
    assert.match(migration, /v_score := GREATEST\(0, LEAST\(100, v_score\)\)/);
    assert.match(migration, /CHECK \(score BETWEEN 0 AND 100\)/);
    assert.match(migration, /ON CONFLICT \(user_id, readiness_date\) DO UPDATE/);
  });

  test("no fake wearable data anywhere", () => {
    const body = migration.slice(migration.indexOf("svj_recovery_checkins"));
    assert.doesNotMatch(body, /hrv|heart_rate|resting_hr/i);
    assert.doesNotMatch(recoveryLib, /hrv|heart_rate|resting_hr/i);
  });

  test("data sources are labeled honestly", () => {
    assert.match(migration, /'recorded_activity'/);
    assert.match(migration, /'user_checkin'/);
  });
});

describe("client wiring", () => {
  test("recovery lib targets the self-service RPCs with typed payloads", () => {
    assert.match(recoveryLib, /svj_save_my_recovery_checkin/);
    assert.match(recoveryLib, /svj_get_my_readiness/);
    assert.match(recoveryLib, /svj_list_my_recovery_history[\s\S]{0,200}p_limit/);
  });

  test("Train exposes a RECOVERY section without a new bottom tab", () => {
    assert.match(
      activityView,
      /TrainSection = "activity" \| "history" \| "goals" \| "progress" \| "recovery"/,
    );
    assert.match(activityView, /\{ id: "recovery", label: "Recovery" \}/);
    assert.match(activityView, /section === "recovery" && <TrainRecovery \/>/);
  });
});
