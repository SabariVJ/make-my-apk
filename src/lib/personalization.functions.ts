// ============================================================================
// Personalization, Body Profile, and Stats — server-side functions.
//
// SECURITY MODEL
//   * All writes go through TanStack Start server functions behind
//     requireSupabaseAuth and use the service_role admin client.
//   * User ID comes from the verified session, never from client input.
//   * Stats can only be modified by server-controlled progression.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdminKey } from "@/integrations/supabase/client.server";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PersonalizationData {
  assessmentCompleted: boolean;
  goalsSelected: boolean;
  goals: string[];
  // Social
  socialComfortNewPeople?: number;
  socialComfortConversations?: number;
  socialComfortGroups?: number;
  socialAvoidanceFrequency?: number;
  socialSelfDescription?: string;
  // Confidence
  confidenceGeneral?: number;
  confidenceInitiative?: number;
  confidenceUnfamiliar?: number;
  confidenceSetbacks?: number;
  confidenceSpeakingUp?: number;
  confidenceGoals?: number;
  // Discipline
  disciplineTaskCompletion?: number;
  disciplineProcrastination?: number;
  disciplineRoutine?: number;
  disciplineCommitments?: number;
  disciplineDistractibility?: number;
  disciplineHabits?: number;
  // Focus
  focusPhoneResistance?: number;
  focusStudyConsistency?: number;
  focusTimeManagement?: number;
  focusDeepWork?: number;
  focusDistractionFrequency?: number;
  focusPlannedCompletion?: number;
  // Fitness
  fitnessActivityLevel?: string;
  fitnessDaysPerWeek?: number;
  fitnessConfidence?: number;
  fitnessPrimaryGoal?: string;
  fitnessConsistency?: number;
  // Recovery
  recoverySleepHours?: number;
  recoverySleepConsistency?: number;
  recoveryMorningEnergy?: number;
  recoveryPerception?: number;
  // Nutrition
  nutritionDietaryPreference?: string;
  nutritionAllergies?: string[];
  nutritionEatingSchedule?: number;
  nutritionFoodQuality?: number;
  nutritionProteinConsistency?: number;
}

export interface UserStatsData {
  fitness: number;
  discipline: number;
  focus: number;
  confidence: number;
  social: number;
  nutrition: number;
  recovery: number;
  consistency: number;
  baselineFitness?: number;
  baselineDiscipline?: number;
  baselineFocus?: number;
  baselineConfidence?: number;
  baselineSocial?: number;
  baselineNutrition?: number;
  baselineRecovery?: number;
  baselineConsistency?: number;
}

export interface BodyProfileData {
  dateOfBirth?: string;
  sex?: string;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: string;
  bodyGoal?: string;
  targetWeightKg?: number;
  bmi?: number;
  bmiCategory?: string;
  bmr?: number;
  tdee?: number;
  dailyCalorieTarget?: number;
}

// ── BMI/BMR/TDEE Calculations ─────────────────────────────────────────────

function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

function calculateBMR(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  sex: string,
): number {
  // Mifflin-St Jeor
  if (sex === "male") {
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + 5);
  }
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears - 161);
}

function activityMultiplier(level: string): number {
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "active":
      return 1.725;
    case "very_active":
      return 1.9;
    default:
      return 1.55;
  }
}

function calculateTDEE(bmr: number, activityLevel: string): number {
  return Math.round(bmr * activityMultiplier(activityLevel));
}

function calorieTarget(tdee: number, goal: string): number {
  switch (goal) {
    case "lose_fat":
      return Math.round(tdee * 0.8); // 20% deficit
    case "gain_muscle":
      return Math.round(tdee * 1.1); // 10% surplus
    case "improve_fitness":
      return Math.round(tdee * 1.0); // maintenance
    default:
      return tdee; // maintain
  }
}

// ── Compute baseline stats from assessment ──────────────────────────────────

export function computeBaselineStats(p: PersonalizationData): UserStatsData {
  // Social: average of comfort scores (inverted — low comfort = low stat)
  const socialAvg = avg([
    p.socialComfortNewPeople,
    p.socialComfortConversations,
    p.socialComfortGroups,
    p.socialAvoidanceFrequency ? 6 - p.socialAvoidanceFrequency : undefined,
  ]);
  // Confidence: average of confidence scores
  const confidenceAvg = avg([
    p.confidenceGeneral,
    p.confidenceInitiative,
    p.confidenceUnfamiliar,
    p.confidenceSetbacks,
    p.confidenceSpeakingUp,
    p.confidenceGoals,
  ]);
  // Discipline: average of discipline scores
  const disciplineAvg = avg([
    p.disciplineTaskCompletion,
    p.disciplineProcrastination ? 6 - p.disciplineProcrastination : undefined,
    p.disciplineRoutine,
    p.disciplineCommitments,
    p.disciplineDistractibility ? 6 - p.disciplineDistractibility : undefined,
    p.disciplineHabits,
  ]);
  // Focus: average of focus scores
  const focusAvg = avg([
    p.focusPhoneResistance,
    p.focusStudyConsistency,
    p.focusTimeManagement,
    p.focusDeepWork,
    p.focusDistractionFrequency ? 6 - p.focusDistractionFrequency : undefined,
    p.focusPlannedCompletion,
  ]);
  // Fitness: based on activity level + days + confidence (already 0-100 scaled)
  const fitnessBase = activityLevelToScore(p.fitnessActivityLevel);
  const fitnessDaysScore = ((p.fitnessDaysPerWeek ?? 3) / 7) * 100;
  const fitnessConf = ((p.fitnessConfidence ?? 3) / 5) * 100;
  const fitnessConsistency = ((p.fitnessConsistency ?? 3) / 5) * 100;
  const fitnessAvg = simpleAvg([fitnessBase, fitnessDaysScore, fitnessConf, fitnessConsistency]);
  // Recovery: based on sleep + energy (sleepHoursToScore returns 0-100, Likert needs scaling)
  const recoveryScores = [
    sleepHoursToScore(p.recoverySleepHours),
    p.recoverySleepConsistency ? likertTo100(p.recoverySleepConsistency) : undefined,
    p.recoveryMorningEnergy ? likertTo100(p.recoveryMorningEnergy) : undefined,
    p.recoveryPerception ? likertTo100(p.recoveryPerception) : undefined,
  ];
  const recoveryAvg = simpleAvg(recoveryScores.filter((v): v is number => v !== undefined));
  // Nutrition: based on schedule + quality + protein (all Likert 1-5)
  const nutritionScores = [
    p.nutritionEatingSchedule ? likertTo100(p.nutritionEatingSchedule) : undefined,
    p.nutritionFoodQuality ? likertTo100(p.nutritionFoodQuality) : undefined,
    p.nutritionProteinConsistency ? likertTo100(p.nutritionProteinConsistency) : undefined,
  ];
  const nutritionAvg = simpleAvg(nutritionScores.filter((v): v is number => v !== undefined));
  // Consistency: average of routine + habits + study consistency
  const consistencyAvg = avg([
    p.disciplineRoutine,
    p.disciplineHabits,
    p.focusStudyConsistency,
    p.fitnessConsistency,
  ]);

  const scale = (v: number) => clamp(Math.round(v), 1, 100);

  return {
    fitness: scale(fitnessAvg),
    discipline: scale(disciplineAvg),
    focus: scale(focusAvg),
    confidence: scale(confidenceAvg),
    social: scale(socialAvg),
    nutrition: scale(nutritionAvg),
    recovery: scale(recoveryAvg),
    consistency: scale(consistencyAvg),
    baselineFitness: scale(fitnessAvg),
    baselineDiscipline: scale(disciplineAvg),
    baselineFocus: scale(focusAvg),
    baselineConfidence: scale(confidenceAvg),
    baselineSocial: scale(socialAvg),
    baselineNutrition: scale(nutritionAvg),
    baselineRecovery: scale(recoveryAvg),
    baselineConsistency: scale(consistencyAvg),
  };
}

function avg(values: (number | undefined)[]): number {
  const valid = values.filter((v): v is number => v !== undefined && v !== null);
  if (valid.length === 0) return 50; // default baseline
  // Scale 1-5 Likert → 1-100 range: (avg - 1) / 4 * 99 + 1
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  return Math.round(((mean - 1) / 4) * 99 + 1);
}

/** Simple average of 0-100 values (no Likert scaling). */
function simpleAvg(values: number[]): number {
  if (values.length === 0) return 50;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Convert 1-5 Likert to 0-100 scale. */
function likertTo100(v: number): number {
  return Math.round(((Math.max(1, Math.min(5, v)) - 1) / 4) * 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function activityLevelToScore(level?: string): number {
  switch (level) {
    case "sedentary":
      return 20;
    case "light":
      return 40;
    case "moderate":
      return 60;
    case "active":
      return 80;
    case "very_active":
      return 95;
    default:
      return 50;
  }
}

function sleepHoursToScore(hours?: number): number {
  if (!hours) return 50;
  if (hours >= 7 && hours <= 9) return 90;
  if (hours >= 6 && hours < 7) return 60;
  if (hours > 9) return 70;
  return 30;
}

// ── Server Functions ───────────────────────────────────────────────────────

/** Read personalization data */
export const getPersonalization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersonalizationData | null> => {
    requireAdminKey();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseAdmin as any;
    const { data, error } = await client
      .from("user_personalization")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      assessmentCompleted: data.assessment_completed,
      goalsSelected: data.goals_selected,
      goals: data.goals ?? [],
      socialComfortNewPeople: data.social_comfort_new_people,
      socialComfortConversations: data.social_comfort_conversations,
      socialComfortGroups: data.social_comfort_groups,
      socialAvoidanceFrequency: data.social_avoidance_frequency,
      socialSelfDescription: data.social_self_description,
      confidenceGeneral: data.confidence_general,
      confidenceInitiative: data.confidence_initiative,
      confidenceUnfamiliar: data.confidence_unfamiliar,
      confidenceSetbacks: data.confidence_setbacks,
      confidenceSpeakingUp: data.confidence_speaking_up,
      confidenceGoals: data.confidence_goals,
      disciplineTaskCompletion: data.discipline_task_completion,
      disciplineProcrastination: data.discipline_procrastination,
      disciplineRoutine: data.discipline_routine,
      disciplineCommitments: data.discipline_commitments,
      disciplineDistractibility: data.discipline_distractibility,
      disciplineHabits: data.discipline_habits,
      focusPhoneResistance: data.focus_phone_resistance,
      focusStudyConsistency: data.focus_study_consistency,
      focusTimeManagement: data.focus_time_management,
      focusDeepWork: data.focus_deep_work,
      focusDistractionFrequency: data.focus_distraction_frequency,
      focusPlannedCompletion: data.focus_planned_completion,
      fitnessActivityLevel: data.fitness_activity_level,
      fitnessDaysPerWeek: data.fitness_days_per_week,
      fitnessConfidence: data.fitness_confidence,
      fitnessPrimaryGoal: data.fitness_primary_goal,
      fitnessConsistency: data.fitness_consistency,
      recoverySleepHours: data.recovery_sleep_hours,
      recoverySleepConsistency: data.recovery_sleep_consistency,
      recoveryMorningEnergy: data.recovery_morning_energy,
      recoveryPerception: data.recovery_perception,
      nutritionDietaryPreference: data.nutrition_dietary_preference,
      nutritionAllergies: data.nutrition_allergies ?? [],
      nutritionEatingSchedule: data.nutrition_eating_schedule,
      nutritionFoodQuality: data.nutrition_food_quality,
      nutritionProteinConsistency: data.nutrition_protein_consistency,
    };
  });

/** Save personalization data and compute baseline stats */
export const savePersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PersonalizationData) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; stats?: UserStatsData }> => {
    requireAdminKey();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Upsert personalization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseAdmin as any;
    const { error } = await client
      .from("user_personalization")
      .upsert(
        {
          user_id: context.userId,
          assessment_completed: data.assessmentCompleted,
          goals_selected: data.goalsSelected,
          goals: data.goals,
          social_comfort_new_people: data.socialComfortNewPeople,
          social_comfort_conversations: data.socialComfortConversations,
          social_comfort_groups: data.socialComfortGroups,
          social_avoidance_frequency: data.socialAvoidanceFrequency,
          social_self_description: data.socialSelfDescription,
          confidence_general: data.confidenceGeneral,
          confidence_initiative: data.confidenceInitiative,
          confidence_unfamiliar: data.confidenceUnfamiliar,
          confidence_setbacks: data.confidenceSetbacks,
          confidence_speaking_up: data.confidenceSpeakingUp,
          confidence_goals: data.confidenceGoals,
          discipline_task_completion: data.disciplineTaskCompletion,
          discipline_procrastination: data.disciplineProcrastination,
          discipline_routine: data.disciplineRoutine,
          discipline_commitments: data.disciplineCommitments,
          discipline_distractibility: data.disciplineDistractibility,
          discipline_habits: data.disciplineHabits,
          focus_phone_resistance: data.focusPhoneResistance,
          focus_study_consistency: data.focusStudyConsistency,
          focus_time_management: data.focusTimeManagement,
          focus_deep_work: data.focusDeepWork,
          focus_distraction_frequency: data.focusDistractionFrequency,
          focus_planned_completion: data.focusPlannedCompletion,
          fitness_activity_level: data.fitnessActivityLevel,
          fitness_days_per_week: data.fitnessDaysPerWeek,
          fitness_confidence: data.fitnessConfidence,
          fitness_primary_goal: data.fitnessPrimaryGoal,
          fitness_consistency: data.fitnessConsistency,
          recovery_sleep_hours: data.recoverySleepHours,
          recovery_sleep_consistency: data.recoverySleepConsistency,
          recovery_morning_energy: data.recoveryMorningEnergy,
          recovery_perception: data.recoveryPerception,
          nutrition_dietary_preference: data.nutritionDietaryPreference,
          nutrition_allergies: data.nutritionAllergies,
          nutrition_eating_schedule: data.nutritionEatingSchedule,
          nutrition_food_quality: data.nutritionFoodQuality,
          nutrition_protein_consistency: data.nutritionProteinConsistency,
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;

    // Compute and save baseline stats
    if (data.assessmentCompleted) {
      const stats = computeBaselineStats(data);
      const { error: statsError } = await client
        .from("user_stats")
        .upsert(
          {
            user_id: context.userId,
            fitness: stats.fitness,
            discipline: stats.discipline,
            focus: stats.focus,
            confidence: stats.confidence,
            social: stats.social,
            nutrition: stats.nutrition,
            recovery: stats.recovery,
            consistency: stats.consistency,
            baseline_fitness: stats.baselineFitness,
            baseline_discipline: stats.baselineDiscipline,
            baseline_focus: stats.baselineFocus,
            baseline_confidence: stats.baselineConfidence,
            baseline_social: stats.baselineSocial,
            baseline_nutrition: stats.baselineNutrition,
            baseline_recovery: stats.baselineRecovery,
            baseline_consistency: stats.baselineConsistency,
          },
          { onConflict: "user_id" },
        );
      if (statsError) throw statsError;
      return { ok: true, stats };
    }
    return { ok: true };
  });

/** Read user stats */
export const getUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserStatsData | null> => {
    requireAdminKey();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseAdmin as any;
    const { data, error } = await client
      .from("user_stats")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      fitness: data.fitness,
      discipline: data.discipline,
      focus: data.focus,
      confidence: data.confidence,
      social: data.social,
      nutrition: data.nutrition,
      recovery: data.recovery,
      consistency: data.consistency,
      baselineFitness: data.baseline_fitness,
      baselineDiscipline: data.baseline_discipline,
      baselineFocus: data.baseline_focus,
      baselineConfidence: data.baseline_confidence,
      baselineSocial: data.baseline_social,
      baselineNutrition: data.baseline_nutrition,
      baselineRecovery: data.baseline_recovery,
      baselineConsistency: data.baseline_consistency,
    };
  });

/** Save/update body profile with computed BMI/BMR/TDEE */
export const saveBodyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: BodyProfileData) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; profile: BodyProfileData }> => {
    requireAdminKey();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let bmi: number | undefined;
    let bmiCategory: string | undefined;
    let bmr: number | undefined;
    let tdee: number | undefined;
    let dailyCalorieTarget: number | undefined;

    if (data.heightCm && data.weightKg) {
      bmi = calculateBMI(data.weightKg, data.heightCm);
      bmiCategory = getBMICategory(bmi);
    }

    if (data.weightKg && data.heightCm && data.dateOfBirth && data.sex) {
      const age = Math.floor(
        (Date.now() - new Date(data.dateOfBirth).getTime()) / (365.25 * 86400000),
      );
      bmr = calculateBMR(data.weightKg, data.heightCm, age, data.sex);
      if (data.activityLevel) {
        tdee = calculateTDEE(bmr, data.activityLevel);
        if (data.bodyGoal && tdee) {
          dailyCalorieTarget = calorieTarget(tdee, data.bodyGoal);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseAdmin as any;
    const { error } = await client
      .from("user_body_profiles")
      .upsert(
        {
          user_id: context.userId,
          date_of_birth: data.dateOfBirth,
          sex: data.sex,
          height_cm: data.heightCm,
          weight_kg: data.weightKg,
          activity_level: data.activityLevel,
          body_goal: data.bodyGoal,
          target_weight_kg: data.targetWeightKg,
          bmi,
          bmi_category: bmiCategory,
          bmr,
          tdee,
          daily_calorie_target: dailyCalorieTarget,
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;

    return {
      ok: true,
      profile: {
        ...data,
        bmi,
        bmiCategory,
        bmr,
        tdee,
        dailyCalorieTarget,
      },
    };
  });

/** Read body profile */
export const getBodyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BodyProfileData | null> => {
    requireAdminKey();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabaseAdmin as any;
    const { data, error } = await client
      .from("user_body_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      dateOfBirth: data.date_of_birth,
      sex: data.sex,
      heightCm: data.height_cm,
      weightKg: data.weight_kg,
      activityLevel: data.activity_level,
      bodyGoal: data.body_goal,
      targetWeightKg: data.target_weight_kg,
      bmi: data.bmi,
      bmiCategory: data.bmi_category,
      bmr: data.bmr,
      tdee: data.tdee,
      dailyCalorieTarget: data.daily_calorie_target,
    };
  });
