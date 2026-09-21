/**
 * Update 03 — structured strength logging.
 *
 * Two layers are covered:
 *   1. The client library (validation, payload shape, volume, muscle summary,
 *      RPC wiring, normalisation) — a PR is only ever read back from the
 *      server envelope, never declared by the client.
 *   2. The additive migration's invariants: atomic single-transaction save,
 *      idempotency by (user_id, client_session_id), record evidence links,
 *      read-only client access, no XP and no fabricated metrics.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildStrengthPayload,
  computeDraftSummary,
  computeMuscleSummary,
  createExerciseDraft,
  createSetDraft,
  extractStrengthExtras,
  formatRecordValue,
  formatSetLabel,
  formatVolume,
  getExerciseHistory,
  getStrengthDetail,
  hasProtectedRecordEvidence,
  listExercises,
  listStrengthRecords,
  listStrengthSummaries,
  normalizeStrengthDetail,
  normalizeStrengthRecord,
  normalizeStrengthSummary,
  saveStrengthActivity,
  setVolume,
  validateStrengthDraft,
  type StrengthExerciseDraft,
  type StrengthExerciseOption,
} from "../src/app/lib/strength";

const repoRoot = resolve(import.meta.dirname ?? ".", "..");
const read = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");
const migration = read("supabase/migrations/20260918000000_strength_logging.sql");

const BENCH: StrengthExerciseOption = {
  id: "ex-bench",
  name: "Bench Press",
  slug: "bench_press",
  category: "chest",
  primaryMuscle: "chest",
  secondaryMuscles: ["triceps", "shoulders"],
  exerciseType: "weighted_reps",
  isCustom: false,
};

const PUSHUP: StrengthExerciseOption = {
  id: "ex-pushup",
  name: "Push-Up",
  slug: "push_up",
  category: "chest",
  primaryMuscle: "chest",
  secondaryMuscles: ["triceps", "shoulders"],
  exerciseType: "bodyweight_reps",
  isCustom: false,
};

const PLANK: StrengthExerciseOption = {
  id: "ex-plank",
  name: "Plank",
  slug: "plank",
  category: "core",
  primaryMuscle: "core",
  secondaryMuscles: [],
  exerciseType: "duration",
  isCustom: false,
};

let setCounter = 0;
const benchDraft = (
  sets: { reps: number | null; weightKg: number | null }[],
): StrengthExerciseDraft => ({
  ...createExerciseDraft(BENCH),
  id: `draft-bench-${(setCounter += 1)}`,
  sets: sets.map((s) => ({ ...createSetDraft(), ...s })),
});

const SESSION = {
  clientSessionId: "svj-session-abc123",
  startedAtMs: 1_700_000_000_000,
  endedAtMs: 1_700_000_000_000 + 52 * 60_000,
  durationSeconds: 52 * 60,
};

function activityRow(overrides: Record<string, unknown> = {}) {
  const started = new Date(SESSION.startedAtMs).toISOString();
  const ended = new Date(SESSION.endedAtMs).toISOString();
  return {
    id: "act-1",
    user_id: "user-1",
    client_session_id: SESSION.clientSessionId,
    activity_type: "strength",
    source: "strength_log",
    started_at: started,
    ended_at: ended,
    duration_seconds: SESSION.durationSeconds,
    step_count: 0,
    distance_meters: null,
    calories_estimate: null,
    perceived_effort: null,
    notes: null,
    visibility: "private",
    created_at: started,
    updated_at: ended,
    ...overrides,
  };
}

const envelope = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  duplicate: false,
  activity: activityRow(),
  summary: {
    exercise_count: 2,
    set_count: 6,
    total_reps: 63,
    volume_kg: 5000,
    muscles: [{ muscle: "chest", score: 3, level: "high" }],
  },
  strength_records: [
    {
      record_type: "heaviest_weight",
      exercise_id: "ex-bench",
      value: 60,
      previous_value: 57.5,
      set_id: "set-1",
    },
  ],
  new_records: [
    {
      record_type: "longest_activity_duration",
      value: SESSION.durationSeconds,
      previous_value: 1800,
    },
  ],
  goal_progress: [
    {
      id: "goal-1",
      metric: "workout_count",
      activity_type: null,
      target_value: 12,
      period_type: "monthly",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      status: "active",
      progress: 8,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-17T00:00:00Z",
    },
  ],
  ...overrides,
});

// ── Draft validation ───────────────────────────────────────────────────────

describe("strength draft validation", () => {
  it("requires at least one exercise with at least one set", () => {
    assert.match(validateStrengthDraft([]) ?? "", /at least one exercise/i);
    const empty = { ...createExerciseDraft(BENCH), sets: [] };
    assert.match(validateStrengthDraft([empty]) ?? "", /at least one set/i);
  });

  it("rejects missing, negative, fractional-invalid and absurd reps", () => {
    for (const reps of [null, 0, -5, 1001]) {
      const draft = benchDraft([{ reps, weightKg: 60 }]);
      assert.ok(validateStrengthDraft([draft]), `reps=${String(reps)} must be rejected`);
    }
    assert.equal(validateStrengthDraft([benchDraft([{ reps: 10, weightKg: 60 }])]), null);
  });

  it("rejects out-of-range weights and requires a weight for weighted exercises", () => {
    assert.ok(validateStrengthDraft([benchDraft([{ reps: 10, weightKg: null }])]));
    assert.ok(validateStrengthDraft([benchDraft([{ reps: 10, weightKg: -1 }])]));
    assert.ok(validateStrengthDraft([benchDraft([{ reps: 10, weightKg: 5000 }])]));
    // Bodyweight exercises legitimately have no external load.
    const pushup: StrengthExerciseDraft = {
      ...createExerciseDraft(PUSHUP),
      sets: [{ ...createSetDraft(), reps: 20 }],
    };
    assert.equal(validateStrengthDraft([pushup]), null);
    // …but an optional load is still validated when provided.
    const weighted: StrengthExerciseDraft = {
      ...createExerciseDraft(PUSHUP),
      sets: [{ ...createSetDraft(), reps: 8, weightKg: 5000 }],
    };
    assert.ok(validateStrengthDraft([weighted]));
  });

  it("requires a sane duration for time-based exercises", () => {
    const plank: StrengthExerciseDraft = {
      ...createExerciseDraft(PLANK),
      sets: [{ ...createSetDraft(), durationSeconds: 60 }],
    };
    assert.equal(validateStrengthDraft([plank]), null);
    for (const durationSeconds of [null, 0, -10, 14_401, 60.5]) {
      const bad: StrengthExerciseDraft = {
        ...createExerciseDraft(PLANK),
        sets: [{ ...createSetDraft(), durationSeconds }],
      };
      assert.ok(validateStrengthDraft([bad]), `duration=${String(durationSeconds)} must fail`);
    }
  });

  it("caps exercises, sets and note length", () => {
    const many = Array.from({ length: 21 }, () => benchDraft([{ reps: 10, weightKg: 60 }]));
    assert.match(validateStrengthDraft(many) ?? "", /20 exercises/i);
    const tooManySets = benchDraft(Array.from({ length: 31 }, () => ({ reps: 10, weightKg: 60 })));
    assert.match(validateStrengthDraft([tooManySets]) ?? "", /30 sets/i);
    const longNote = { ...benchDraft([{ reps: 10, weightKg: 60 }]), notes: "x".repeat(301) };
    assert.match(validateStrengthDraft([longNote]) ?? "", /300 characters/i);
  });

  it("prefills the previous weight but never the previous reps", () => {
    const next = createSetDraft({ id: "s1", reps: 12, weightKg: 60, durationSeconds: null });
    assert.equal(next.weightKg, 60);
    assert.equal(next.reps, null);
    assert.notEqual(next.id, "s1");
  });
});

// ── Payload, volume and muscle summary ─────────────────────────────────────

describe("strength payload and derived totals", () => {
  it("maps array order to position/set order and nulls irrelevant fields", () => {
    const payload = buildStrengthPayload([
      benchDraft([
        { reps: 10, weightKg: 60 },
        { reps: 9, weightKg: 60 },
        { reps: 11, weightKg: 55 },
      ]),
      {
        ...createExerciseDraft(PLANK),
        sets: [{ ...createSetDraft(), durationSeconds: 60 }],
      },
    ]);
    assert.equal(payload.length, 2);
    assert.equal(payload[0].exercise_id, BENCH.id);
    assert.deepEqual(
      payload[0].sets.map((s) => [s.weight_kg, s.reps]),
      [
        [60, 10],
        [60, 9],
        [55, 11],
      ],
    );
    assert.equal(payload[1].sets[0].duration_seconds, 60);
    assert.equal(payload[1].sets[0].reps, null);
    assert.equal(payload[1].sets[0].weight_kg, null);
  });

  it("counts only genuinely weighted sets toward training volume", () => {
    assert.equal(setVolume({ id: "s", reps: 10, weightKg: 60, durationSeconds: null }), 600);
    assert.equal(setVolume({ id: "s", reps: 20, weightKg: null, durationSeconds: null }), 0);
    assert.equal(setVolume({ id: "s", reps: null, weightKg: 60, durationSeconds: 60 }), 0);
    const pushup: StrengthExerciseDraft = {
      ...createExerciseDraft(PUSHUP),
      sets: [
        { id: "a", reps: 20, weightKg: null, durationSeconds: null },
        { id: "b", reps: 15, weightKg: null, durationSeconds: null },
      ],
    };
    const summary = computeDraftSummary([pushup]);
    assert.equal(summary.volumeKg, 0);
    assert.equal(summary.totalReps, 35);
    assert.equal(summary.setCount, 2);
    assert.equal(summary.exerciseCount, 1);
  });

  it("derives a deterministic muscle summary with primary above secondary", () => {
    const summary = computeDraftSummary([
      benchDraft([
        { reps: 10, weightKg: 60 },
        { reps: 9, weightKg: 60 },
        { reps: 11, weightKg: 55 },
      ]),
    ]);
    const chest = summary.muscles.find((m) => m.muscle === "chest");
    const triceps = summary.muscles.find((m) => m.muscle === "triceps");
    assert.ok(chest && triceps);
    assert.equal(chest.score, 3);
    assert.equal(triceps.score, 1.5);
    assert.equal(chest.level, "high");
    assert.equal(triceps.level, "medium");
    assert.ok(chest.score > triceps.score);
    // Deterministic ordering: strongest first.
    assert.equal(summary.muscles[0].muscle, "chest");
    assert.deepEqual(computeMuscleSummary([]), []);
  });

  it("renders sets honestly: no fabricated 0 kg for bodyweight work", () => {
    assert.equal(formatSetLabel({ reps: 10, weightKg: 60, durationSeconds: null }), "60 × 10");
    assert.equal(
      formatSetLabel({ reps: 12, weightKg: null, durationSeconds: null }),
      "Bodyweight × 12",
    );
    assert.equal(formatSetLabel({ reps: null, weightKg: null, durationSeconds: 60 }), "60 sec");
    assert.equal(formatVolume(6840), "6,840 kg");
    assert.equal(formatRecordValue("best_set_reps", 38), "38 reps");
    assert.equal(formatRecordValue("heaviest_weight", 60), "60 kg");
  });
});

// ── Save path ──────────────────────────────────────────────────────────────

describe("atomic strength save client", () => {
  it("sends one idempotent payload and reads back server-derived records", async () => {
    const calls: { fn: string; args?: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: envelope(), error: null };
    };
    const result = await saveStrengthActivity(
      rpc,
      {
        ...SESSION,
        drafts: [benchDraft([{ reps: 10, weightKg: 60 }])],
      },
      SESSION.endedAtMs + 1000,
    );
    assert.equal(result.ok, true);
    assert.equal(result.duplicate, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, "svj_save_strength_activity");
    assert.equal(calls[0].args?.p_client_session_id, SESSION.clientSessionId);
    assert.equal(result.summary?.setCount, 6);
    assert.equal(result.strengthRecords[0].recordType, "heaviest_weight");
    assert.equal(result.strengthRecords[0].previousValue, 57.5);
    assert.equal(result.universalRecords[0].recordType, "longest_activity_duration");
    assert.equal(result.goalProgress[0].progress, 8);
    assert.equal(result.activity?.source, "strength_log");
  });

  it("never lets the client declare a record — only server evidence counts", async () => {
    const rpc = async () => ({
      data: envelope({ strength_records: [], new_records: [] }),
      error: null,
    });
    const result = await saveStrengthActivity(
      rpc,
      {
        ...SESSION,
        // An absurd self-reported lift is still just a set the server stores;
        // it is the server that decides whether a record was established.
        drafts: [benchDraft([{ reps: 1, weightKg: 500 }])],
      },
      SESSION.endedAtMs + 1000,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.strengthRecords, []);
    assert.deepEqual(result.universalRecords, []);
  });

  it("reuses the same client session id on retry so duplicates cannot appear", async () => {
    const seen: unknown[] = [];
    let first = true;
    const rpc = async (_fn: string, args?: Record<string, unknown>) => {
      seen.push(args?.p_client_session_id);
      if (first) {
        first = false;
        return { data: null, error: { message: "network down" } };
      }
      return { data: envelope({ duplicate: true }), error: null };
    };
    const drafts = [benchDraft([{ reps: 10, weightKg: 60 }])];
    const failed = await saveStrengthActivity(
      rpc,
      { ...SESSION, drafts },
      SESSION.endedAtMs + 1000,
    );
    assert.equal(failed.ok, false);
    assert.match(failed.error ?? "", /network down/);
    const retried = await saveStrengthActivity(
      rpc,
      { ...SESSION, drafts },
      SESSION.endedAtMs + 1000,
    );
    assert.equal(retried.ok, true);
    assert.equal(retried.duplicate, true);
    assert.deepEqual(seen, [SESSION.clientSessionId, SESSION.clientSessionId]);
  });

  it("validates locally before touching the network", async () => {
    let calls = 0;
    const rpc = async () => {
      calls += 1;
      return { data: envelope(), error: null };
    };
    const invalid = await saveStrengthActivity(
      rpc,
      { ...SESSION, drafts: [benchDraft([{ reps: null, weightKg: 60 }])] },
      SESSION.endedAtMs + 1000,
    );
    assert.equal(invalid.ok, false);
    assert.equal(calls, 0);
    const noSession = await saveStrengthActivity(
      rpc,
      { ...SESSION, clientSessionId: "short", drafts: [benchDraft([{ reps: 10, weightKg: 60 }])] },
      SESSION.endedAtMs + 1000,
    );
    assert.equal(noSession.ok, false);
    assert.equal(calls, 0);
  });
});

// ── Reads ──────────────────────────────────────────────────────────────────

describe("strength reads", () => {
  it("normalises the catalog, rejecting malformed rows", async () => {
    const rpc = async () => ({
      data: {
        ok: true,
        exercises: [
          {
            id: "ex-bench",
            name: "Bench Press",
            slug: "bench_press",
            category: "chest",
            primary_muscle: "chest",
            secondary_muscles: ["triceps"],
            exercise_type: "weighted_reps",
            is_custom: false,
          },
          { id: "broken", name: "Broken", exercise_type: "nonsense" },
          null,
        ],
      },
      error: null,
    });
    const result = await listExercises(rpc);
    assert.equal(result.ok, true);
    assert.equal(result.exercises.length, 1);
    assert.deepEqual(result.exercises[0].secondaryMuscles, ["triceps"]);
  });

  it("maps strength summaries by activity id and fails soft", async () => {
    const ok = await listStrengthSummaries(async () => ({
      data: {
        ok: true,
        summaries: [
          { activity_id: "act-1", ...(envelope().summary as Record<string, unknown>) },
          { activity_id: null },
        ],
      },
      error: null,
    }));
    assert.equal(ok.ok, true);
    assert.equal(ok.summaries.get("act-1")?.setCount, 6);
    const bad = await listStrengthSummaries(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    assert.equal(bad.ok, false);
    assert.equal(bad.summaries.size, 0);
  });

  it("keeps activity detail and exercise history identity-bound and typed", async () => {
    const detail = await getStrengthDetail(
      async () => ({
        data: {
          ok: true,
          activity_id: "act-1",
          summary: envelope().summary,
          exercises: [
            {
              exercise_id: "ex-bench",
              name: "Bench Press",
              exercise_type: "weighted_reps",
              primary_muscle: "chest",
              position: 0,
              notes: null,
              sets: [
                { set_number: 1, reps: 10, weight_kg: 60, duration_seconds: null },
                { set_number: 2, reps: 9, weight_kg: 60, duration_seconds: null },
              ],
            },
          ],
          records: [
            {
              record_type: "heaviest_weight",
              exercise_id: "ex-bench",
              exercise_name: "Bench Press",
              value: 60,
              set_id: "set-1",
              achieved_at: new Date(SESSION.endedAtMs).toISOString(),
            },
          ],
          goal_contributions: [
            {
              goal_id: "goal-1",
              metric: "workout_count",
              activity_type: null,
              period_type: "monthly",
              period_start: "2026-09-01",
              period_end: "2026-09-30",
              target_value: 12,
              progress: 8,
              contribution: 1,
            },
          ],
        },
        error: null,
      }),
      "act-1",
    );
    assert.equal(detail.ok, true);
    assert.equal(detail.detail?.exercises[0].sets.length, 2);
    assert.equal(detail.detail?.records[0].recordType, "heaviest_weight");
    assert.equal(detail.detail?.goalContributions[0].contribution, 1);
    assert.equal(hasProtectedRecordEvidence(detail.detail!), true);

    const history = await getExerciseHistory(
      async () => ({
        data: {
          ok: true,
          exercise: {
            id: "ex-bench",
            name: "Bench Press",
            category: "chest",
            primary_muscle: "chest",
            secondary_muscles: [],
            exercise_type: "weighted_reps",
            is_custom: false,
          },
          records: [
            { record_type: "heaviest_weight", value: 60, activity_id: "act-1", set_id: "set-1" },
          ],
          sessions: [
            {
              activity_id: "act-1",
              performed_at: new Date(SESSION.endedAtMs).toISOString(),
              set_count: 2,
              total_reps: 19,
              volume_kg: 1140,
              best_weight: 60,
              best_reps: 10,
              sets: [{ set_number: 1, reps: 10, weight_kg: 60, duration_seconds: null }],
            },
          ],
        },
        error: null,
      }),
      "ex-bench",
    );
    assert.equal(history.ok, true);
    assert.equal(history.history?.sessions[0].volumeKg, 1140);
    assert.equal(history.history?.records[0].value, 60);
  });

  it("returns nulls instead of fake detail", async () => {
    assert.equal(
      (await getStrengthDetail(async () => ({ data: { ok: false }, error: null }), "act-1")).ok,
      false,
    );
    assert.equal(normalizeStrengthDetail({ ok: true, activity_id: "a", summary: null }), null);
    assert.equal(normalizeStrengthSummary({ exercise_count: "2" }), null);
    assert.equal(
      normalizeStrengthRecord({ record_type: "heaviest_weight", exercise_id: "x", value: null }),
      null,
    );
  });

  it("a manual activity with no stored sets can never claim a protected record", () => {
    const manualDetail = {
      activityId: "act-manual",
      summary: { exerciseCount: 0, setCount: 0, totalReps: 0, volumeKg: 0, muscles: [] },
      exercises: [],
      records: [],
      goalContributions: [],
    };
    assert.equal(hasProtectedRecordEvidence(manualDetail), false);
  });

  it("extracts only recognised strength records from a response envelope", () => {
    const extras = extractStrengthExtras({
      ok: true,
      strength_records: [
        { record_type: "not_a_record", exercise_id: "ex-1", value: 1 },
        { record_type: "best_set_reps", exercise_id: "ex-1", value: 38, previous_value: 32 },
      ],
      new_records: [],
      goal_progress: [],
    });
    assert.equal(extras.strengthRecords.length, 1);
    assert.equal(extras.strengthRecords[0].recordType, "best_set_reps");
    assert.equal(extras.strengthRecords[0].previousValue, 32);
    assert.deepEqual(extractStrengthExtras(null).strengthRecords, []);
  });

  it("reads strength records with evidence links", async () => {
    const records = await listStrengthRecords(async () => ({
      data: {
        ok: true,
        records: [
          {
            record_type: "best_set_reps",
            exercise_id: "ex-pushup",
            exercise_name: "Push-Up",
            exercise_type: "bodyweight_reps",
            primary_muscle: "chest",
            value: 38,
            activity_id: "act-1",
            set_id: "set-9",
            achieved_at: new Date(SESSION.endedAtMs).toISOString(),
          },
        ],
      },
      error: null,
    }));
    assert.equal(records.ok, true);
    assert.equal(records.records[0].activityId, "act-1");
    assert.equal(records.records[0].setId, "set-9");
  });
});

// ── Migration invariants ───────────────────────────────────────────────────

describe("strength migration structure", () => {
  it("creates the four additive objects with ownership RLS", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_exercises/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_activity_exercises/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_strength_sets/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.svj_personal_records/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /USING \(auth\.uid\(\) = user_id\)/);
    assert.match(migration, /owner_user_id IS NULL OR owner_user_id = auth\.uid\(\)/);
    // Additive migration wrapped in one transaction (all-or-nothing apply).
    assert.match(migration, /^BEGIN;/m);
    assert.match(migration, /COMMIT;\s*$/);
  });

  it("keeps every structured table read-only for clients", () => {
    for (const table of ["svj_activity_exercises", "svj_strength_sets", "svj_personal_records"]) {
      assert.match(
        migration,
        new RegExp(`GRANT SELECT ON public\\.${table} TO authenticated`),
        `${table} must grant SELECT`,
      );
      assert.doesNotMatch(
        migration,
        new RegExp(`GRANT [^;]*INSERT[^;]*ON public\\.${table}[^;]*authenticated`),
        `${table} must not grant INSERT to authenticated`,
      );
      assert.doesNotMatch(
        migration,
        new RegExp(`GRANT (UPDATE|DELETE)[^;]*public\\.${table}[^;]*authenticated`),
        `${table} must not grant UPDATE/DELETE to authenticated`,
      );
    }
    // The exercise catalog is user-insertable only through the definer RPC.
    assert.match(migration, /GRANT SELECT ON public\.svj_exercises TO authenticated/);
    assert.doesNotMatch(
      migration,
      /GRANT [^;]*INSERT[^;]*ON public\.svj_exercises[^;]*authenticated/,
    );
  });

  it("derives identity server-side and never accepts a user id parameter", () => {
    const save = migration.slice(migration.indexOf("svj_save_strength_activity"));
    assert.match(save, /v_user_id uuid := auth\.uid\(\)/);
    assert.doesNotMatch(save, /p_user_id/);
    assert.match(save, /IF v_user_id IS NULL THEN\s+RAISE EXCEPTION 'Authentication required'/);
  });

  it("saves the whole workout atomically under the Update 01 idempotency key", () => {
    const save = migration.slice(migration.indexOf("svj_save_strength_activity"));
    assert.match(save, /ON CONFLICT \(user_id, client_session_id\) DO NOTHING/);
    assert.match(save, /btrim\(p_client_session_id\), 'strength', 'strength_log'/);
    // activity → exercises → sets, in that order, before any record logic.
    const activityAt = save.indexOf("INSERT INTO public.svj_activities");
    const exerciseAt = save.indexOf("INSERT INTO public.svj_activity_exercises");
    const setAt = save.indexOf("INSERT INTO public.svj_strength_sets");
    const recordAt = save.indexOf("INSERT INTO public.svj_personal_records");
    assert.ok(activityAt > 0 && exerciseAt > activityAt && setAt > exerciseAt && recordAt > setAt);
    // Exactly one completion event, keyed to the canonical activity.
    assert.match(save, /'activity\.completed:' \|\| v_activity_id::text/);
    assert.match(save, /ON CONFLICT \(user_id, event_key\) DO NOTHING/);
  });

  it("never replaces a record with a lower value and never duplicates one", () => {
    assert.match(
      migration,
      /CONSTRAINT svj_personal_records_unique UNIQUE \(user_id, record_type, exercise_id\)/,
    );
    const guards = migration.match(/WHERE EXCLUDED\.value > pr\.value/g) ?? [];
    assert.equal(guards.length, 3, "each strength record type must guard on EXCLUDED.value");
    // Records stay evidence-linked to the canonical activity (and set).
    assert.match(migration, /activity_id uuid NOT NULL REFERENCES public\.svj_activities\(id\)/);
    assert.match(migration, /set_id uuid REFERENCES public\.svj_strength_sets\(id\)/);
    // Replay-guarded ledger events for achieved records.
    assert.match(migration, /'personal_record\.achieved:' \|\| v_activity_id::text/);
  });

  it("protected records can only come from stored sets of a structured workout", () => {
    // Detection reads real set rows joined through the activity's exercises.
    const bench = migration.slice(migration.indexOf("'heaviest_weight'"));
    assert.match(bench, /FROM public\.svj_activity_exercises ae/);
    assert.match(bench, /JOIN public\.svj_strength_sets s ON s\.activity_exercise_id = ae\.id/);
    // Volume ignores unloaded (bodyweight) sets entirely.
    assert.match(
      migration,
      /s\.weight_kg IS NOT NULL AND s\.reps IS NOT NULL AND s\.weight_kg > 0/,
    );
    // A manual activity carries no sets, so the manual source is never used to
    // establish a strength record.
    assert.doesNotMatch(bench, /'manual'/);
    // Custom exercises are owner-scoped and never mutate the global catalog.
    assert.match(migration, /owner_user_id IS NOT NULL AND is_custom = true/);
    assert.match(migration, /svj_exercises_owner_name_key/);
    assert.doesNotMatch(migration, /UPDATE public\.svj_exercises/);
  });

  it("adds no XP, no fabricated metrics and touches no other backend", () => {
    assert.doesNotMatch(migration, /lifetime_xp_delta|qualifying_xp_delta|stat_deltas/);
    assert.doesNotMatch(migration, /zdojqqilwnljzpqdshca/);
    assert.doesNotMatch(migration, /health_connect|estimated_1rm/i);
    // Duration sets carry real seconds; rep sets never store a fake 0 kg.
    assert.match(
      migration,
      /duration_seconds integer CHECK \(duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 14400\)/,
    );
    assert.match(migration, /weight_kg IS NULL OR \(weight_kg >= 0 AND weight_kg <= 2000\)/);
  });

  it("keeps goal progress derived from the canonical activity only", () => {
    const save = migration.slice(migration.indexOf("svj_save_strength_activity"));
    assert.match(save, /public\.svj_goal_with_progress\(g\)/);
    assert.match(save, /PERFORM public\.svj_refresh_goal_statuses\(v_user_id\)/);
    // Exactly one activity row is created per workout, so workout_count +1 —
    // never +exercises or +sets.
    const inserts = save.match(/INSERT INTO public\.svj_activities/g) ?? [];
    assert.equal(inserts.length, 1);
    // progress is never written from the client anywhere in this migration.
    assert.doesNotMatch(migration, /SET progress =/);
  });

  it("keeps the deferred features out of Update 03", () => {
    // No supersets/drop sets/circuits and no per-set RPE or tempo programming.
    assert.doesNotMatch(migration, /superset|drop_set|circuit|\brpe\b|\btempo\b/i);
    assert.doesNotMatch(migration, /readiness|fatigue|recovery_score/i);
  });
});

describe("strength UI wiring", () => {
  it("keeps the library network-free and routed through injected callers", () => {
    const lib = read("src/app/lib/strength.ts");
    assert.doesNotMatch(lib, /from "@\/integrations\/supabase\/client"/);
    assert.match(lib, /svj_save_strength_activity/);
    assert.match(lib, /svj_get_exercise_history/);
    assert.match(lib, /svj_list_strength_summaries/);
    assert.match(lib, /svj_create_custom_exercise/);
  });

  it("surfaces Structured Strength on Train without adding a bottom-nav tab", () => {
    const train = read("src/app/views/WorkoutView.tsx");
    assert.match(train, /import \{ TrainStrength[^}]*\} from "\.\/TrainStrength"/);
    assert.match(train, /<TrainStrength\s+prescription=\{prescription\}\s+onExit=/);
    assert.match(train, /<StructuredStrengthCard/);
    const card = read("src/app/components/StructuredStrengthCard.tsx");
    assert.match(card, /data-testid="structured-strength-start"/);

    // The entry point moved to Train; it must not be duplicated in Activity.
    const activity = read("src/app/views/ActivityView.tsx");
    assert.doesNotMatch(activity, /import \{ TrainStrength \} from "\.\/TrainStrength"/);
    assert.doesNotMatch(activity, /data-testid="open-strength"/);
  });

  it("preserves the Update 01 history RPC fix and the membership architecture", () => {
    const history = read("src/app/views/ActivityHistory.tsx");
    assert.match(history, /client\.rpc\("svj_list_activities", \{ p_limit: 100 \}\)/);
    const membership = read("src/lib/trial.functions.ts")
      // Doc comments describe the retired admin-key flow; only executable code
      // must remain free of it.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
      .join("\n");
    assert.match(membership, /svj_get_my_membership/);
    assert.doesNotMatch(membership, /requireAdminKey\(\)/);
  });
});
