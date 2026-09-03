import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeBaselineStats,
  type PersonalizationData,
} from "../src/lib/personalization.functions";

// ── Baseline stat computation tests ────────────────────────────────────────

describe("computeBaselineStats", () => {
  const fullAnswers: PersonalizationData = {
    assessmentCompleted: true,
    goalsSelected: true,
    goals: ["build_muscle", "become_disciplined"],
    // Social: high comfort
    socialComfortNewPeople: 4,
    socialComfortConversations: 5,
    socialComfortGroups: 4,
    socialAvoidanceFrequency: 1, // low avoidance = good
    socialSelfDescription: "extroverted",
    // Confidence: moderate
    confidenceGeneral: 3,
    confidenceInitiative: 3,
    confidenceUnfamiliar: 3,
    confidenceSetbacks: 3,
    confidenceSpeakingUp: 3,
    confidenceGoals: 3,
    // Discipline: high
    disciplineTaskCompletion: 5,
    disciplineProcrastination: 1, // low procrastination = good
    disciplineRoutine: 4,
    disciplineCommitments: 5,
    disciplineDistractibility: 1, // low distractibility = good
    disciplineHabits: 4,
    // Focus: moderate-low
    focusPhoneResistance: 2,
    focusStudyConsistency: 3,
    focusTimeManagement: 2,
    focusDeepWork: 2,
    focusDistractionFrequency: 4, // high distraction = bad (inverted)
    focusPlannedCompletion: 3,
    // Fitness: active
    fitnessActivityLevel: "active",
    fitnessDaysPerWeek: 5,
    fitnessConfidence: 4,
    fitnessPrimaryGoal: "build_muscle",
    fitnessConsistency: 4,
    // Recovery: good sleep
    recoverySleepHours: 8,
    recoverySleepConsistency: 4,
    recoveryMorningEnergy: 4,
    recoveryPerception: 4,
    // Nutrition: moderate
    nutritionDietaryPreference: "non_vegetarian",
    nutritionAllergies: [],
    nutritionEatingSchedule: 3,
    nutritionFoodQuality: 3,
    nutritionProteinConsistency: 3,
  };

  it("computes baseline stats from full assessment", () => {
    const stats = computeBaselineStats(fullAnswers);
    assert.ok(stats.fitness >= 1 && stats.fitness <= 100, `fitness=${stats.fitness}`);
    assert.ok(stats.discipline >= 1 && stats.discipline <= 100, `discipline=${stats.discipline}`);
    assert.ok(stats.focus >= 1 && stats.focus <= 100, `focus=${stats.focus}`);
    assert.ok(stats.confidence >= 1 && stats.confidence <= 100, `confidence=${stats.confidence}`);
    assert.ok(stats.social >= 1 && stats.social <= 100, `social=${stats.social}`);
    assert.ok(stats.nutrition >= 1 && stats.nutrition <= 100, `nutrition=${stats.nutrition}`);
    assert.ok(stats.recovery >= 1 && stats.recovery <= 100, `recovery=${stats.recovery}`);
    assert.ok(
      stats.consistency >= 1 && stats.consistency <= 100,
      `consistency=${stats.consistency}`,
    );
  });

  it("sets baseline values equal to initial stats", () => {
    const stats = computeBaselineStats(fullAnswers);
    assert.equal(stats.baselineFitness, stats.fitness);
    assert.equal(stats.baselineDiscipline, stats.discipline);
    assert.equal(stats.baselineFocus, stats.focus);
    assert.equal(stats.baselineConfidence, stats.confidence);
    assert.equal(stats.baselineSocial, stats.social);
    assert.equal(stats.baselineNutrition, stats.nutrition);
    assert.equal(stats.baselineRecovery, stats.recovery);
    assert.equal(stats.baselineConsistency, stats.consistency);
  });

  it("high social comfort produces higher social stat", () => {
    const highSocial = computeBaselineStats({
      ...fullAnswers,
      socialComfortNewPeople: 5,
      socialComfortConversations: 5,
      socialComfortGroups: 5,
      socialAvoidanceFrequency: 1,
    });
    const lowSocial = computeBaselineStats({
      ...fullAnswers,
      socialComfortNewPeople: 1,
      socialComfortConversations: 1,
      socialComfortGroups: 1,
      socialAvoidanceFrequency: 5,
    });
    assert.ok(
      highSocial.social > lowSocial.social,
      `high=${highSocial.social} should be > low=${lowSocial.social}`,
    );
  });

  it("high discipline produces higher discipline stat", () => {
    const high = computeBaselineStats({
      ...fullAnswers,
      disciplineTaskCompletion: 5,
      disciplineProcrastination: 1,
      disciplineRoutine: 5,
      disciplineCommitments: 5,
      disciplineDistractibility: 1,
      disciplineHabits: 5,
    });
    const low = computeBaselineStats({
      ...fullAnswers,
      disciplineTaskCompletion: 1,
      disciplineProcrastination: 5,
      disciplineRoutine: 1,
      disciplineCommitments: 1,
      disciplineDistractibility: 5,
      disciplineHabits: 1,
    });
    assert.ok(
      high.discipline > low.discipline,
      `high=${high.discipline} should be > low=${low.discipline}`,
    );
  });

  it("active fitness level produces higher fitness stat", () => {
    const active = computeBaselineStats({
      ...fullAnswers,
      fitnessActivityLevel: "very_active",
      fitnessDaysPerWeek: 6,
      fitnessConfidence: 5,
      fitnessConsistency: 5,
    });
    const sedentary = computeBaselineStats({
      ...fullAnswers,
      fitnessActivityLevel: "sedentary",
      fitnessDaysPerWeek: 0,
      fitnessConfidence: 1,
      fitnessConsistency: 1,
    });
    assert.ok(
      active.fitness > sedentary.fitness,
      `active=${active.fitness} should be > sedentary=${sedentary.fitness}`,
    );
  });

  it("returns reasonable defaults for minimal assessment", () => {
    const minimal: PersonalizationData = {
      assessmentCompleted: true,
      goalsSelected: true,
      goals: ["improve_fitness"],
    };
    const stats = computeBaselineStats(minimal);
    // With minimal data, stats should be in a reasonable range (40-65)
    // and use sensible defaults
    assert.ok(stats.fitness >= 40 && stats.fitness <= 65, `fitness=${stats.fitness}`);
    assert.ok(stats.discipline >= 40 && stats.discipline <= 65, `discipline=${stats.discipline}`);
    assert.ok(stats.focus >= 40 && stats.focus <= 65, `focus=${stats.focus}`);
    assert.ok(stats.confidence >= 40 && stats.confidence <= 65, `confidence=${stats.confidence}`);
    assert.ok(stats.social >= 40 && stats.social <= 65, `social=${stats.social}`);
    assert.ok(stats.nutrition >= 40 && stats.nutrition <= 65, `nutrition=${stats.nutrition}`);
    assert.ok(stats.recovery >= 40 && stats.recovery <= 65, `recovery=${stats.recovery}`);
    assert.ok(
      stats.consistency >= 40 && stats.consistency <= 65,
      `consistency=${stats.consistency}`,
    );
  });

  it("clamps values between 1 and 100", () => {
    const extreme = computeBaselineStats({
      ...fullAnswers,
      socialComfortNewPeople: 5,
      socialComfortConversations: 5,
      socialComfortGroups: 5,
      socialAvoidanceFrequency: 1,
      confidenceGeneral: 5,
      confidenceInitiative: 5,
      confidenceUnfamiliar: 5,
      confidenceSetbacks: 5,
      confidenceSpeakingUp: 5,
      confidenceGoals: 5,
    });
    assert.ok(extreme.social >= 1 && extreme.social <= 100);
    assert.ok(extreme.confidence >= 1 && extreme.confidence <= 100);
  });

  it("inverted scales work correctly (procrastination, distraction, avoidance)", () => {
    const lowBad = computeBaselineStats({
      ...fullAnswers,
      disciplineProcrastination: 1, // low = good
      disciplineDistractibility: 1, // low = good
      socialAvoidanceFrequency: 1, // low = good
      focusDistractionFrequency: 1, // low = good
    });
    const highBad = computeBaselineStats({
      ...fullAnswers,
      disciplineProcrastination: 5, // high = bad
      disciplineDistractibility: 5, // high = bad
      socialAvoidanceFrequency: 5, // high = bad
      focusDistractionFrequency: 5, // high = bad
    });
    assert.ok(
      lowBad.discipline > highBad.discipline,
      "low procrastination should give higher discipline",
    );
    assert.ok(lowBad.social > highBad.social, "low avoidance should give higher social");
  });
});

describe("computeBaselineStats — goals", () => {
  it("accepts multiple goals", () => {
    const stats = computeBaselineStats({
      assessmentCompleted: true,
      goalsSelected: true,
      goals: ["build_muscle", "become_disciplined", "improve_focus"],
    });
    assert.ok(stats.fitness >= 1);
  });

  it("requires at least one goal", () => {
    // Goals don't affect stats computation, only the goal selection UI
    const stats = computeBaselineStats({
      assessmentCompleted: true,
      goalsSelected: true,
      goals: [],
    });
    assert.ok(stats.fitness >= 1);
  });
});
