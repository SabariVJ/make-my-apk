/**
 * Automated Training — runtime rollback flag, stale-prescription
 * reconciliation and plan-day merging.
 */
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FEATURE_FLAGS,
  FEATURE_FLAGS_STORAGE_KEY,
  readFeatureFlagOverrides,
  readUrlFlagOverride,
  resolveFeatureFlag,
  writeFeatureFlagOverride,
} from "../src/app/lib/featureFlags";
import { buildWeeklyPlan, mergeServerPlan, selectSplit } from "../src/app/lib/trainingPlan";
import {
  emptyTrainingProfile,
  normalizeTrainingProfile,
  type TrainingProfile,
} from "../src/app/lib/trainingProfile";

before(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
});

describe("automated training feature flag", () => {
  it("defaults on so the shipped experience is the guided one", () => {
    assert.equal(resolveFeatureFlag(FEATURE_FLAGS.automatedTrainingV1, { overrides: {} }), true);
  });

  it("honours a stored local override", () => {
    writeFeatureFlagOverride(FEATURE_FLAGS.automatedTrainingV1, false);
    assert.equal(
      resolveFeatureFlag(FEATURE_FLAGS.automatedTrainingV1, {
        overrides: readFeatureFlagOverrides(),
      }),
      false,
    );
    writeFeatureFlagOverride(FEATURE_FLAGS.automatedTrainingV1, true);
    assert.equal(
      resolveFeatureFlag(FEATURE_FLAGS.automatedTrainingV1, {
        overrides: readFeatureFlagOverrides(),
      }),
      true,
    );
    localStorage.removeItem(FEATURE_FLAGS_STORAGE_KEY);
  });

  it("lets a URL override outrank the stored value (instant rollback)", () => {
    writeFeatureFlagOverride(FEATURE_FLAGS.automatedTrainingV1, true);
    assert.equal(
      resolveFeatureFlag(FEATURE_FLAGS.automatedTrainingV1, {
        overrides: readFeatureFlagOverrides(),
        search: "?automated_training_v1=0",
      }),
      false,
    );
    assert.equal(
      readUrlFlagOverride(FEATURE_FLAGS.automatedTrainingV1, "?automated_training_v1=1"),
      true,
    );
    assert.equal(readUrlFlagOverride(FEATURE_FLAGS.automatedTrainingV1, "?other=1"), null);
    localStorage.removeItem(FEATURE_FLAGS_STORAGE_KEY);
  });

  it("ignores a corrupt or foreign stored value", () => {
    localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, "{not json");
    assert.deepEqual(readFeatureFlagOverrides(), {});
    localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify({ unknown_flag: false, n: 3 }));
    assert.deepEqual(readFeatureFlagOverrides(), {});
    localStorage.removeItem(FEATURE_FLAGS_STORAGE_KEY);
  });

  it("gates presentation only — the rollback never deletes stored training data", () => {
    const train = readFileSync("src/app/views/WorkoutView.tsx", "utf8");
    assert.match(train, /writeFeatureFlagOverride\(FEATURE_FLAGS\.automatedTrainingV1, next\)/);
    // The previous flow stays reachable when the flag is off.
    assert.match(
      train,
      /allTabs\.filter\(\(t\) => t\.id === "log" \|\| t\.id === "history" \|\| t\.id === "templates"\)/,
    );
    assert.match(train, /data-testid="train-guided-toggle"/);
    // Training data is still loaded regardless of the flag.
    assert.match(train, /useTrainingPlan\(\)/);
    assert.ok(
      !/clearWorkoutDraft|removeItem\(|DELETE FROM/.test(train),
      "rollback must not remove stored training data",
    );
  });

  it("keeps the guided entry points hidden only while the flag is off", () => {
    const train = readFileSync("src/app/views/WorkoutView.tsx", "utf8");
    assert.match(train, /\{guided && tab === "today" && \(/);
    assert.match(train, /\{guided && tab === "progress" && \(/);
  });
});

describe("stale prescription reconciliation", () => {
  const profile = (over: Partial<TrainingProfile> = {}): TrainingProfile =>
    normalizeTrainingProfile({ ...emptyTrainingProfile(), setupComplete: true, ...over });
  const NOW = new Date(2026, 8, 21, 9, 0, 0);

  const plan = () => {
    const p = profile({ availableDays: [1, 3, 5], sessionsPerWeek: 3 });
    return buildWeeklyPlan(p, selectSplit({ profile: p }), NOW);
  };

  it("keeps the last valid plan when a refresh fails", () => {
    const existing = plan();
    assert.equal(mergeServerPlan(existing, null), existing);
    assert.equal(mergeServerPlan(existing, []), existing);
  });

  it("adopts a server-side move and a skip", () => {
    const existing = plan();
    const merged = mergeServerPlan(existing, [
      {
        slotIndex: 0,
        scheduledDate: "2026-09-24",
        status: "moved",
        completedActivityId: null,
      },
      { slotIndex: 1, scheduledDate: "2026-09-23", status: "skipped", completedActivityId: null },
    ]);
    assert.equal(merged.sessions[0].scheduledDate, "2026-09-24");
    assert.equal(merged.sessions[0].status, "moved");
    assert.equal(merged.sessions[1].status, "skipped");
  });

  it("keeps a completed slot completed with its activity", () => {
    const existing = plan();
    const merged = mergeServerPlan(existing, [
      {
        slotIndex: 0,
        scheduledDate: "2026-09-21",
        status: "completed",
        completedActivityId: "act-9",
      },
    ]);
    assert.equal(merged.sessions[0].status, "completed");
    assert.equal(merged.sessions[0].completedActivityId, "act-9");
    // Untouched slots are left alone.
    assert.equal(merged.sessions[1].status, existing.sessions[1].status);
  });

  it("leaves a still-scheduled slot on its locally rolled-forward date", () => {
    const existing = plan();
    const stale = { ...existing, sessions: existing.sessions.map((s) => ({ ...s })) };
    stale.sessions[0].scheduledDate = "2026-09-01";
    const merged = mergeServerPlan(stale, [
      { slotIndex: 0, scheduledDate: "2026-09-01", status: "scheduled", completedActivityId: null },
    ]);
    assert.equal(merged.sessions[0].scheduledDate, "2026-09-01");
    assert.equal(merged.sessions[0].status, "scheduled");
  });

  it("never rewrites an active workout's started prescription", () => {
    const train = readFileSync("src/app/views/WorkoutView.tsx", "utf8");
    // The prescription is only ever set when a session is started.
    assert.match(train, /const startPlanSession = \(session: PlanSession\) => \{/);
    assert.match(train, /setPrescription\(\{/);
    assert.ok(
      !/useEffect\([\s\S]{0,400}setPrescription/.test(train),
      "no effect may overwrite a running workout's prescription",
    );
    // A refresh failure keeps the previous plan instead of blanking it.
    const hook = readFileSync("src/app/hooks/useTrainingPlan.ts", "utf8");
    assert.match(hook, /if \(planResult\.ok\) setServerPlan\(planResult\.plan\)/);
  });
});
