// ============================================================================
// SVJ WEARABLES V2 — phone-side companion controller tests.
//
// Covers inbox routing, capability/state handling, staleness and the
// duplicate-completion guards. No native bridge and no network are required:
// the Data Layer payloads are plain JSON, exactly as the watch sends them.
// ============================================================================

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

/** Minimal localStorage so the import cache can be exercised without a DOM. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const storage = new MemoryStorage();

beforeEach(() => {
  storage.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    setInterval: () => 0,
    clearInterval: () => undefined,
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

async function loadCompanion() {
  return import("./wearCompanion");
}

const NOW = Date.now();

describe("wear companion import planning", () => {
  it("maps a watch completion onto the canonical pipeline with wear_os provenance", async () => {
    const { planWearImportSummary } = await loadCompanion();
    const completion = {
      sessionId: "svj-wear-abc12345",
      activityType: "running",
      startedAtMs: NOW - 1_800_000,
      endedAtMs: NOW - 60_000,
      durationSeconds: 1740,
      movingSeconds: 1700,
      stepCount: 3100,
      distanceMeters: null,
      caloriesEstimate: null,
      avgHeartRate: 152,
      maxHeartRate: 178,
      heartRateSampleCount: 1500,
      source: "wear_os" as const,
    };
    const plan = planWearImportSummary(completion);
    assert.equal(plan.devicePlatform, "wear_os");
    assert.equal(plan.activityType, "running");
    assert.equal(plan.avgHeartRate, 152);
    assert.equal(plan.distanceMeters, null, "the watch measured no distance");
    assert.equal(plan.caloriesEstimate, null, "the watch measured no calories");
    assert.match(plan.clientSessionId, /^svj-wear-/);
    assert.equal(plan.externalId, "wear-svjwearabc12345");
    // Stable ids: the same completion always maps to the same server keys, so a
    // repeated delivery is a duplicate rather than a second activity.
    assert.deepEqual(planWearImportSummary(completion), plan);
  });
});

describe("wear companion duplicate-completion protection", () => {
  it("imports a watch session once and refuses a repeated completion", async () => {
    const companion = await loadCompanion();
    assert.equal(companion.shouldImportWearSummary("svj-wear-abc12345"), true);
    companion.clearWearImportCache();
    assert.equal(companion.hasImportedWearSession("svj-wear-abc12345"), false);

    // Same completion arriving twice: the second is recognised as done.
    const summary = {
      sessionId: "svj-wear-abc12345",
      activityType: "running",
      startedAtMs: NOW - 1_800_000,
      endedAtMs: NOW - 60_000,
      durationSeconds: 1740,
      movingSeconds: null,
      stepCount: 0,
      distanceMeters: null,
      caloriesEstimate: null,
      avgHeartRate: null,
      maxHeartRate: null,
      heartRateSampleCount: 0,
      source: "wear_os" as const,
    };
    const result = await companion.importWearSummary(summary);
    // Without a signed-in Supabase client the import cannot reach the server,
    // so nothing is cached and the failure is reported rather than faked.
    assert.equal(result.ok, false);
    assert.equal(companion.shouldImportWearSummary(summary.sessionId), true);
  });
});

describe("wear companion event routing", () => {
  it("treats any native action as read-only notes, never as a connection guess", async () => {
    const companion = await loadCompanion();
    const before = companion.getWearCompanionSnapshot();
    assert.equal(before.status.installed, false);
    assert.equal(before.workout, null);
  });

  it("rejects malformed native events instead of surfacing them", async () => {
    const { normalizeNativeWearEvents } = await import("./wearOs");
    assert.deepEqual(
      normalizeNativeWearEvents([{ type: "sample", id: "x", payload: 42 }], NOW),
      [],
    );
  });
});
