/**
 * Automated Training — client adapters, migration safety and Train wiring.
 *
 * Asserts real invariants: payloads never carry ownership/XP, one active plan,
 * additive idempotent migrations, and that the Train surface launches the
 * EXISTING canonical logger (no second workout ledger).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPlanPayload,
  normalizeServerPlan,
  prescribedTargetsForTemplate,
  profileToPayload,
  resolveTargetsToProps,
} from "../src/app/lib/trainingClient";
import { buildWeeklyPlan, selectSplit } from "../src/app/lib/trainingPlan";
import {
  emptyTrainingProfile,
  normalizeTrainingProfile,
  type TrainingProfile,
} from "../src/app/lib/trainingProfile";
import { getTemplate } from "../src/app/lib/trainingTemplates";

const read = (p: string) => readFileSync(p, "utf8");

const profile = (over: Partial<TrainingProfile> = {}): TrainingProfile =>
  normalizeTrainingProfile({ ...emptyTrainingProfile(), setupComplete: true, ...over });

describe("plan payload", () => {
  const p = profile({ experience: "intermediate", goal: "muscle", availableDays: [1, 2, 4, 5] });
  const decision = selectSplit({ profile: p });
  const weekly = buildWeeklyPlan(p, decision, new Date(2026, 8, 21));

  it("snapshots real template versions and validates targets", () => {
    const payload = buildPlanPayload(decision, weekly, { policyVersion: "test-1" });
    assert.equal(payload.policy_version, "test-1");
    assert.ok(payload.templates.length > 0);
    for (const template of payload.templates) {
      assert.ok(template.id.length > 0);
      assert.equal(template.version, 1);
      assert.ok(Array.isArray((template.payload as { exercises?: unknown[] }).exercises));
    }
    assert.equal(payload.sessions.length, weekly.sessions.length);
    for (const session of payload.sessions) {
      assert.ok(session.targets.length > 0);
      for (const target of session.targets) {
        assert.ok(target.exerciseSlug.length > 0);
        assert.ok(target.workSets >= 1);
      }
    }
  });

  it("never carries ownership or XP — the server derives identity from auth.uid()", () => {
    const payload = buildPlanPayload(decision, weekly, { policyVersion: "test-1" });
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /user_id|userId|xp|XP/);
  });

  it("only prefills a load from real history, never inventing one", () => {
    const payload = buildPlanPayload(decision, weekly, {
      policyVersion: "test-1",
      previousLoadKg: (slug) => (slug === "bench_press" ? 50 : null),
    });
    const allTargets = payload.sessions.flatMap((s) => s.targets);
    const bench = allTargets.find((t) => t.exerciseSlug === "bench_press");
    const squat = allTargets.find((t) => t.exerciseSlug === "squat");
    assert.equal(bench?.loadKg, 50);
    assert.equal(squat?.loadKg, null);
  });
});

describe("server plan normalization", () => {
  it("reads the snake/camel plan envelope and drops malformed sessions", () => {
    const plan = normalizeServerPlan({
      id: "plan-1",
      policyVersion: "v1",
      splitId: "upper_lower",
      splitName: "Upper / Lower",
      blockStart: "2026-09-21",
      blockEnd: "2026-10-18",
      sessions: [
        {
          id: "s1",
          slotIndex: 0,
          templateId: "upper_a",
          templateVersion: 1,
          scheduledDate: "2026-09-21",
          status: "scheduled",
          targets: [
            {
              exerciseSlug: "bench_press",
              workSets: 4,
              repMin: 6,
              repMax: 10,
              loadKg: 60,
            },
          ],
        },
        { slotIndex: 1 }, // missing id/template → dropped
      ],
    });
    assert.equal(plan?.id, "plan-1");
    assert.equal(plan?.sessions.length, 1);
    assert.equal(plan?.sessions[0].targets[0].exerciseSlug, "bench_press");
    assert.equal(plan?.sessions[0].status, "scheduled");
  });
});

describe("template → logger targets", () => {
  it("maps every reviewed exercise to a target", () => {
    const template = getTemplate("upper_a")!;
    const targets = prescribedTargetsForTemplate(template);
    assert.equal(targets.length, template.exercises.length);
    assert.ok(targets.every((t) => t.exerciseSlug && t.workSets >= 1));
  });

  it("reports unresolved slugs instead of guessing an exercise", () => {
    const { resolved, unresolved } = resolveTargetsToProps(
      [
        {
          exerciseSlug: "bench_press",
          exerciseName: "Bench Press",
          loadType: "weighted",
          loadConvention: "barbell_total",
          equipmentKey: "full_gym",
          workSets: 3,
          repMin: 8,
          repMax: 12,
          durationSeconds: null,
          loadKg: null,
          targetRpe: 8,
        },
        {
          exerciseSlug: "made_up_movement",
          exerciseName: "Made Up",
          loadType: "weighted",
          loadConvention: "barbell_total",
          equipmentKey: "full_gym",
          workSets: 3,
          repMin: 8,
          repMax: 12,
          durationSeconds: null,
          loadKg: null,
          targetRpe: 8,
        },
      ],
      new Map([["bench_press", { id: "ex-1", name: "Bench Press" }]]),
    );
    assert.equal(resolved.length, 1);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].exerciseSlug, "made_up_movement");
  });
});

describe("profile payload", () => {
  it("sends the domain fields but no user id", () => {
    const payload = profileToPayload(profile({ experience: "veteran", goal: "strength" }));
    assert.equal(payload.experience, "veteran");
    assert.equal(payload.goal, "strength");
    assert.ok(!("userId" in payload) && !("user_id" in payload));
  });
});

describe("migration safety (20260926000000_automated_training.sql)", () => {
  const sql = read("supabase/migrations/20260926000000_automated_training.sql");

  it("is additive only — no destructive statements", () => {
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /DROP COLUMN/i);
    assert.doesNotMatch(sql, /TRUNCATE/i);
    assert.doesNotMatch(
      sql,
      /DELETE FROM public\.svj_(activities|strength_sets|personal_records)/i,
    );
    assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
  });

  it("enforces one active plan per user and one finalized activity per slot", () => {
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS svj_training_plans_one_active/);
    assert.match(sql, /WHERE status = 'active'/);
    assert.match(
      sql,
      /CONSTRAINT svj_training_plan_sessions_slot_unique UNIQUE \(plan_id, slot_index\)/,
    );
  });

  it("keeps user tables read-only to clients and enables RLS", () => {
    for (const table of [
      "svj_training_profiles",
      "svj_user_template_library",
      "svj_training_plans",
      "svj_training_plan_sessions",
      "svj_activity_training_context",
      "svj_training_decisions",
    ]) {
      assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      assert.match(sql, new RegExp(`GRANT SELECT ON public\\.${table} TO authenticated`));
    }
    // No INSERT/UPDATE/DELETE grant to authenticated anywhere.
    assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/i);
  });

  it("derives identity from auth.uid() and never trusts a client user id", () => {
    assert.match(sql, /auth\.uid\(\)/);
    assert.doesNotMatch(sql, /p_user_id/);
  });

  it("finalizes a plan slot idempotently and leaves XP authority untouched", () => {
    assert.match(sql, /ON CONFLICT \(activity_id\) DO NOTHING/);
    assert.match(sql, /AND status <> 'completed'/);
    assert.doesNotMatch(sql, /xp_awarded|svj_award|GRANT[^;]*xp/i);
  });

  it("computes muscle history from completed sets and excludes warm-ups", () => {
    assert.match(sql, /svj_recent_muscle_history/);
    assert.match(sql, /s\.is_warmup = false/);
  });
});

describe("Train wiring", () => {
  const train = read("src/app/views/WorkoutView.tsx");
  const logger = read("src/app/views/TrainStrength.tsx");

  it("adds Today as the default Train surface without adding a bottom-nav tab", () => {
    assert.match(train, /useState<Tab>\("today"\)/);
    assert.match(train, /import \{ TrainingToday \}/);
    assert.match(train, /import \{ TemplateBrowser \}/);
    assert.match(train, /<TrainingToday/);
  });

  it("launches the EXISTING canonical logger with plan targets", () => {
    assert.match(train, /startPlanSession/);
    assert.match(train, /prescribedTargetsForTemplate/);
    assert.match(train, /<TrainStrength prescription=\{prescription\} onExit=/);
    // No second workout ledger is introduced.
    assert.doesNotMatch(train, /svj_save_[a-z_]*plan[a-z_]*activity/);
  });

  it("shows target vs actual and never marks a set complete from a target", () => {
    assert.match(logger, /formatTarget/);
    assert.match(logger, /data-testid="strength-target"/);
    // Prefilling a target must not fabricate reps.
    assert.match(logger, /createSetDraft\(\)/);
  });

  it("records the plan context only after the canonical activity saves", () => {
    const saveIdx = logger.indexOf("saveStrengthActivity(");
    const contextIdx = logger.indexOf("recordTrainingContext(");
    assert.ok(saveIdx > -1 && contextIdx > -1);
    assert.ok(contextIdx > saveIdx, "context must be recorded after the workout is saved");
    assert.match(logger, /!result\.duplicate && prescription/);
  });
});
