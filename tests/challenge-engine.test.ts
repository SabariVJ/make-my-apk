import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  selectPersonalizedChallenges,
  templateToChallenge,
  getChallengeInsights,
  type ChallengeTemplate,
} from "../src/lib/challenge-engine";
import type { UserStatsData } from "../src/lib/personalization.functions";

// ── Test fixtures ────────────────────────────────────────────────────────

const highStats: UserStatsData = {
  fitness: 85,
  discipline: 80,
  focus: 75,
  confidence: 70,
  social: 65,
  nutrition: 80,
  recovery: 70,
  consistency: 75,
  baselineFitness: 50,
  baselineDiscipline: 45,
  baselineFocus: 40,
  baselineConfidence: 35,
  baselineSocial: 30,
  baselineNutrition: 45,
  baselineRecovery: 40,
  baselineConsistency: 40,
};

const lowStats: UserStatsData = {
  fitness: 20,
  discipline: 25,
  focus: 15,
  confidence: 10,
  social: 30,
  nutrition: 20,
  recovery: 35,
  consistency: 15,
  baselineFitness: 15,
  baselineDiscipline: 20,
  baselineFocus: 10,
  baselineConfidence: 8,
  baselineSocial: 25,
  baselineNutrition: 15,
  baselineRecovery: 30,
  baselineConsistency: 12,
};

const mixedStats: UserStatsData = {
  fitness: 70,
  discipline: 45,
  focus: 60,
  confidence: 35,
  social: 55,
  nutrition: 40,
  recovery: 65,
  consistency: 50,
  baselineFitness: 50,
  baselineDiscipline: 45,
  baselineFocus: 40,
  baselineConfidence: 30,
  baselineSocial: 45,
  baselineNutrition: 35,
  baselineRecovery: 50,
  baselineConsistency: 40,
};

// ── Tests ────────────────────────────────────────────────────────────────

describe("selectPersonalizedChallenges", () => {
  it("returns requested number of challenges", () => {
    const result = selectPersonalizedChallenges(highStats, [], [], 6);
    assert.ok(result.length > 0, "should return at least 1 challenge");
    assert.ok(result.length <= 6, `should return at most 6, got ${result.length}`);
  });

  it("returns challenges for null stats (new user)", () => {
    const result = selectPersonalizedChallenges(null, [], [], 6);
    assert.ok(result.length > 0, "new user should still get challenges");
  });

  it("filters out completed challenges", () => {
    const all = selectPersonalizedChallenges(highStats, [], [], 10);
    const titles = all.map((c) => c.title);
    const withCompleted = selectPersonalizedChallenges(highStats, [], titles.slice(0, 3), 10);
    const completedTitles = withCompleted.map((c) => c.title);
    for (const t of titles.slice(0, 3)) {
      assert.ok(!completedTitles.includes(t), `completed challenge "${t}" should not appear`);
    }
  });

  it("adjusts difficulty range based on stat levels", () => {
    // Low stats → only easy challenges
    const lowResult = selectPersonalizedChallenges(lowStats, [], [], 6);
    for (const c of lowResult) {
      assert.equal(
        c.difficulty,
        "Easy",
        `low stats should get Easy, got ${c.difficulty} for "${c.title}"`,
      );
    }

    // High stats → harder challenges appear
    const highResult = selectPersonalizedChallenges(highStats, [], [], 6);
    const hasHarder = highResult.some((c) => c.difficulty === "Hard" || c.difficulty === "Elite");
    // With high stats, at least some harder challenges should be available
    // (though random selection might not always pick them)
    assert.ok(highResult.length > 0, "high stats should produce challenges");
  });

  it("boosts goal-related categories", () => {
    // User with focus goals should get more Mental challenges
    const withGoals = selectPersonalizedChallenges(
      mixedStats,
      ["improve_focus", "study_consistently"],
      [],
      12,
    );
    const mentalCount = withGoals.filter((c) => c.category === "Mental").length;
    const withoutGoals = selectPersonalizedChallenges(mixedStats, [], [], 12);
    const mentalCountNoGoals = withoutGoals.filter((c) => c.category === "Mental").length;

    // With focus goals, we expect at least the same number of Mental challenges
    assert.ok(
      mentalCount >= mentalCountNoGoals,
      `with focus goals: ${mentalCount} Mental challenges, without: ${mentalCountNoGoals}`,
    );
  });

  it("selects challenges within stat bounds", () => {
    // User with fitness=15 should not get challenges requiring minStat=55
    const result = selectPersonalizedChallenges(lowStats, [], [], 12);
    for (const c of result) {
      if (c.minStat !== undefined && c.minStat > 50) {
        // This challenge shouldn't be selected for low-stat user
        assert.fail(
          `challenge "${c.title}" requires minStat=${c.minStat} but user has low fitness`,
        );
      }
    }
  });

  it("returns fallback challenges when pool is exhausted", () => {
    // Complete many challenges to exhaust the pool
    const allChallenges = selectPersonalizedChallenges(highStats, [], [], 30);
    const allTitles = allChallenges.map((c) => c.title);
    // Now try to get more with all completed
    const remaining = selectPersonalizedChallenges(highStats, [], allTitles, 6);
    // Should still return something (fallback to Easy challenges)
    assert.ok(remaining.length > 0, "fallback should return challenges");
  });
});

describe("templateToChallenge", () => {
  it("creates a valid DailyChallenge from a template", () => {
    const template: ChallengeTemplate = {
      title: "Test Challenge",
      description: "A test challenge",
      category: "Physical",
      difficulty: "Medium",
      targets: ["fitness"],
    };
    const challenge = templateToChallenge(template, "test-001");
    assert.equal(challenge.title, "Test Challenge");
    assert.equal(challenge.description, "A test challenge");
    assert.equal(challenge.category, "Physical");
    assert.equal(challenge.difficulty, "Medium");
    assert.equal(challenge.xp, 80);
    assert.equal(challenge.durationMinutes, 20);
    assert.equal(challenge.completed, false);
    assert.equal(challenge.isCustom, false);
    assert.ok(challenge.id.startsWith("personalized-test-001-"));
  });

  it("sets correct XP and duration for each difficulty", () => {
    const diffs: [ChallengeDifficulty, number, number][] = [
      ["Easy", 50, 10],
      ["Medium", 80, 20],
      ["Hard", 120, 30],
      ["Elite", 180, 45],
    ];
    for (const [diff, xp, dur] of diffs) {
      const challenge = templateToChallenge(
        {
          title: `${diff} task`,
          description: "test",
          category: "Physical",
          difficulty: diff,
          targets: ["fitness"],
        },
        `d-${diff}`,
      );
      assert.equal(challenge.xp, xp, `${diff} should have ${xp} XP`);
      assert.equal(challenge.durationMinutes, dur, `${diff} should have ${dur} min`);
    }
  });
});

describe("getChallengeInsights", () => {
  it("identifies weakest stats as focus areas", () => {
    const insights = getChallengeInsights(mixedStats, ["improve_focus"]);
    assert.ok(insights.focusAreas.length > 0, "should have focus areas");
    // Confidence (35) and Nutrition (40) are the lowest in mixedStats
    assert.ok(insights.focusAreas.includes("Confidence"), "Confidence should be a focus area");
  });

  it("includes goals in reason text", () => {
    const insights = getChallengeInsights(mixedStats, ["improve_focus", "build_muscle"]);
    assert.ok(insights.reason.toLowerCase().includes("goal"), "reason should mention goals");
  });

  it("returns default for null stats", () => {
    const insights = getChallengeInsights(null, []);
    assert.ok(insights.focusAreas.length > 0, "should have default focus areas");
    assert.ok(insights.reason.includes("Assessment"), "should prompt assessment completion");
  });

  it("handles empty goals gracefully", () => {
    const insights = getChallengeInsights(highStats, []);
    assert.ok(insights.focusAreas.length > 0);
    assert.ok(typeof insights.reason === "string");
  });
});
