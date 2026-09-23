import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVITY_TYPES,
  buildClientSessionId,
  formatActivityDate,
  formatDurationLabel,
  isValidActivityType,
  listServerActivities,
  normalizeServerActivity,
  saveServerActivity,
  validateCompletedSession,
  validateManualActivity,
} from "../src/app/lib/serverActivities";

const migration = readFileSync(
  new URL("../supabase/migrations/20260916000000_server_activities.sql", import.meta.url),
  "utf8",
);

test("migration creates canonical activities with strict ownership RLS", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_activities/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /USING \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /WITH CHECK \(auth\.uid\(\) = user_id\)/);
  // Ownership derived from the authenticated identity, never a client field.
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  // No client UPDATE/DELETE: history cannot be rewritten or removed by users.
  assert.match(migration, /GRANT SELECT, INSERT ON public\.svj_activities TO authenticated/);
  assert.doesNotMatch(migration, /GRANT UPDATE[^;]*svj_activities[^;]*authenticated/);
  assert.doesNotMatch(migration, /GRANT DELETE[^;]*svj_activities[^;]*authenticated/);
});

test("migration enforces idempotency and single completion event", () => {
  assert.match(
    migration,
    /CONSTRAINT svj_activities_session_identity UNIQUE \(user_id, client_session_id\)/,
  );
  assert.match(migration, /ON CONFLICT \(user_id, client_session_id\) DO NOTHING/);
  // The completion ledger event is keyed to the canonical activity id and
  // protected by the existing (user_id, event_key) unique constraint.
  assert.match(migration, /'activity\.completed:' \|\| v_activity_id::text/);
  assert.match(migration, /ON CONFLICT \(user_id, event_key\) DO NOTHING/);
  // Sources start at native + manual; no health_connect yet.
  assert.match(migration, /source text NOT NULL CHECK \(source IN \('svj_native', 'manual'\)\)/);
  // Conservative visibility default.
  assert.match(migration, /DEFAULT 'private'/);
  // List RPC is invoker-security and identity-bound.
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /WHERE user_id = auth\.uid\(\)/);
});

test("migration rejects fabricated metrics", () => {
  assert.match(
    migration,
    /p_source = 'manual' AND p_step_count > 0 AND p_distance_meters IS NOT NULL/,
  );
  assert.match(migration, /p_ended_at > now\(\) \+ interval '5 minutes'/);
  assert.match(migration, /p_duration_seconds > EXTRACT\(EPOCH FROM/);
});

test("activity type catalogue matches the Update 01 set", () => {
  assert.deepEqual(
    [...ACTIVITY_TYPES],
    [
      "walking",
      "running",
      "strength",
      "cycling",
      "football",
      "calisthenics",
      "hiit",
      "yoga",
      "other",
    ],
  );
  assert.equal(isValidActivityType("walking"), true);
  assert.equal(isValidActivityType("swimming"), false);
  assert.equal(isValidActivityType(42), false);
});

const NOW = Date.now();
const validSession = {
  clientSessionId: "svj-abc12345",
  activityType: "running" as const,
  startedAtMs: NOW - 31 * 60_000,
  endedAtMs: NOW - 60_000,
  durationSeconds: 1800,
  stepCount: 6842,
  distanceMeters: 5100,
  caloriesEstimate: 240,
};

test("valid completed session passes validation", () => {
  assert.equal(validateCompletedSession(validSession, NOW), null);
});

test("completed session validation rejects bad payloads", () => {
  assert.match(
    validateCompletedSession({ ...validSession, clientSessionId: "short" }) ?? "",
    /session/i,
  );
  assert.match(
    validateCompletedSession({ ...validSession, activityType: "swimming" as never }) ?? "",
    /activity type/i,
  );
  assert.match(
    validateCompletedSession({ ...validSession, endedAtMs: validSession.startedAtMs }) ?? "",
    /after/i,
  );
  assert.match(
    validateCompletedSession({ ...validSession, durationSeconds: 0 }) ?? "",
    /duration/i,
  );
  assert.match(validateCompletedSession({ ...validSession, stepCount: -5 }) ?? "", /step/i);
  assert.match(
    validateCompletedSession({ ...validSession, distanceMeters: -1 }) ?? "",
    /distance/i,
  );
  assert.match(
    validateCompletedSession({ ...validSession, caloriesEstimate: 999999 }) ?? "",
    /calorie/i,
  );
});

test("manual validation requires duration and bounds effort/notes", () => {
  const manual = {
    clientSessionId: "svj-manual01",
    activityType: "strength" as const,
    startedAtMs: NOW - 60 * 60_000,
    endedAtMs: NOW - 15 * 60_000,
    durationSeconds: 2700,
  };
  assert.equal(validateManualActivity(manual, NOW), null);
  assert.match(validateManualActivity({ ...manual, durationSeconds: 0 }) ?? "", /duration/i);
  assert.match(validateManualActivity({ ...manual, perceivedEffort: 11 }) ?? "", /effort/i);
  assert.match(validateManualActivity({ ...manual, notes: "x".repeat(501) }) ?? "", /notes/i);
});

const row = {
  id: "a1",
  user_id: "u1",
  client_session_id: "svj-abc12345",
  activity_type: "running",
  source: "svj_native",
  started_at: "2026-09-16T08:00:00Z",
  ended_at: "2026-09-16T08:31:42Z",
  duration_seconds: 1902,
  step_count: 6842,
  distance_meters: 5100,
  calories_estimate: 240,
  perceived_effort: null,
  notes: null,
  visibility: "private",
  created_at: "2026-09-16T08:32:00Z",
  updated_at: "2026-09-16T08:32:00Z",
};

test("normalizeServerActivity maps rows and drops malformed ones", () => {
  const normalized = normalizeServerActivity(row);
  assert.ok(normalized);
  assert.equal(normalized.activityType, "running");
  assert.equal(normalized.source, "svj_native");
  assert.equal(normalized.stepCount, 6842);
  assert.equal(normalized.visibility, "private");
  assert.equal(normalizeServerActivity({ ...row, activity_type: "swimming" }), null);
  assert.equal(normalizeServerActivity({ ...row, user_id: 7 }), null);
  assert.equal(normalizeServerActivity(null), null);
});

test("save is idempotent: the same session id returns the original row", async () => {
  let calls = 0;
  const stored = new Map<string, unknown>();
  const callRpc = async (payload: Record<string, unknown>) => {
    calls += 1;
    const key = String(payload.p_client_session_id);
    if (stored.has(key)) {
      return {
        data: { ok: true, duplicate: true, activity: stored.get(key) },
        error: null,
      };
    }
    const activity = { ...row, id: `id-${calls}`, client_session_id: key };
    stored.set(key, activity);
    return { data: { ok: true, duplicate: false, activity }, error: null };
  };

  const payload = { ...validSession };
  const first = await saveServerActivity(callRpc, payload);
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  const retry = await saveServerActivity(callRpc, payload);
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(calls, 2);
  // Same canonical id on retry — one activity, one completion event server-side.
  assert.equal(retry.activity?.id, first.activity?.id);
});

test("save surfaces server failure and keeps the payload retryable", async () => {
  let fail = true;
  const callRpc = async () =>
    fail
      ? { data: null, error: { message: "network down" } }
      : { data: { ok: true, duplicate: false, activity: row }, error: null };
  const result = await saveServerActivity(callRpc, validSession);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /network down/);
  fail = false;
  const retry = await saveServerActivity(callRpc, validSession);
  assert.equal(retry.ok, true);
});

test("list returns newest-first normalized activities and maps errors", async () => {
  const newer = { ...row, id: "new", ended_at: "2026-09-17T08:00:00Z" };
  const older = { ...row, id: "old", ended_at: "2026-09-15T08:00:00Z" };
  const ok = await listServerActivities(async () => ({ data: [newer, older], error: null }));
  assert.equal(ok.ok, true);
  assert.deepEqual(
    ok.activities.map((a) => a.id),
    ["new", "old"],
  );
  const bad = await listServerActivities(async () => ({
    data: null,
    error: { message: "permission denied" },
  }));
  assert.equal(bad.ok, false);
  assert.match(bad.error ?? "", /permission denied/);
});

test("display helpers show only real values", () => {
  assert.equal(formatDurationLabel(1902), "31 min");
  assert.equal(formatDurationLabel(3661), "1:01 hr");
  assert.equal(formatDurationLabel(0), "0 min");
  const now = new Date("2026-09-16T12:00:00Z");
  assert.equal(formatActivityDate("2026-09-16T08:00:00Z", now), "Today");
  assert.equal(formatActivityDate("2026-09-15T08:00:00Z", now), "Yesterday");
  assert.equal(formatActivityDate("2026-09-01T08:00:00Z", now), "1 Sept");
  assert.equal(formatActivityDate("not-a-date", now), "Unknown date");
});

test("buildClientSessionId is stable-shaped and long enough", () => {
  const id = buildClientSessionId(new Date(0), 0.5);
  assert.ok(id.startsWith("svj-"));
  assert.ok(id.length >= 8);
  assert.notEqual(buildClientSessionId(new Date(0), 0.9), id);
});
