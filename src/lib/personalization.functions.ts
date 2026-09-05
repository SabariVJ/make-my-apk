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

// ── Types ──────────────────────────────────────────────────────────────────

export interface PersonalizationData {
  assessmentCompleted: boolean;
  goalsSelected: boolean;
  goals: string[];
  assessmentStep?: number;
  assessmentVersion?: number;
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

export interface AssessmentEntryState {
  personalization: PersonalizationData | null;
  shouldAutoOpen: boolean;
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

function calculateBMR(weightKg: number, heightCm: number, ageYears: number, sex: string): number {
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
  let target: number;
  switch (goal) {
    case "lose_fat":
      target = Math.round(tdee * 0.8); // conservative 20% deficit
      break;
    case "gain_muscle":
      target = Math.round(tdee * 1.1); // modest 10% surplus
      break;
    case "improve_fitness":
      target = Math.round(tdee); // maintenance
      break;
    default:
      target = tdee; // maintain
  }
  // This is an estimate, not a prescription. Do not surface an extreme target
  // from a low or malformed input profile.
  return Math.max(1200, target);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUserStats(row: any): UserStatsData {
  return {
    fitness: row.fitness,
    discipline: row.discipline,
    focus: row.focus,
    confidence: row.confidence,
    social: row.social,
    nutrition: row.nutrition,
    recovery: row.recovery,
    consistency: row.consistency,
    baselineFitness: row.baseline_fitness,
    baselineDiscipline: row.baseline_discipline,
    baselineFocus: row.baseline_focus,
    baselineConfidence: row.baseline_confidence,
    baselineSocial: row.baseline_social,
    baselineNutrition: row.baseline_nutrition,
    baselineRecovery: row.baseline_recovery,
    baselineConsistency: row.baseline_consistency,
  };
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
    // Generated database types are updated after the prepared migration is applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
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
      assessmentStep: data.assessment_step ?? 0,
      assessmentVersion: data.assessment_version ?? 1,
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

/** Decide first-signup presentation from server rows, never device storage. */
export const getAssessmentEntryState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssessmentEntryState> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const [{ data: personalization, error: personalizationError }, { data: profile }] =
      await Promise.all([
        client.from("user_personalization").select("*").eq("user_id", context.userId).maybeSingle(),
        client.from("profiles").select("signup_date").eq("id", context.userId).maybeSingle(),
      ]);
    if (personalizationError) throw personalizationError;

    const mapped = personalization
      ? ({
          assessmentCompleted: personalization.assessment_completed,
          goalsSelected: personalization.goals_selected,
          goals: personalization.goals ?? [],
          assessmentStep: personalization.assessment_step ?? 0,
          assessmentVersion: personalization.assessment_version ?? 1,
        } as PersonalizationData)
      : null;
    const signupMs = profile?.signup_date ? new Date(profile.signup_date).getTime() : Number.NaN;
    const isGenuineFirstSignup =
      Number.isFinite(signupMs) &&
      Date.now() - signupMs >= 0 &&
      Date.now() - signupMs <= 24 * 60 * 60 * 1000;

    return {
      personalization: mapped,
      shouldAutoOpen:
        !mapped?.assessmentCompleted && (isGenuineFirstSignup || (mapped?.assessmentStep ?? 0) > 0),
    };
  });

/** Save private assessment answers and finalize the first server baseline. */
export const savePersonalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PersonalizationData) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; stats?: UserStatsData }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { error } = await client.from("user_personalization").upsert(
      {
        user_id: context.userId,
        assessment_completed: data.assessmentCompleted,
        goals_selected: data.goalsSelected,
        goals: data.goals,
        assessment_step: Math.max(0, Math.min(20, data.assessmentStep ?? 0)),
        assessment_version: Math.max(1, data.assessmentVersion ?? 1),
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

    if (data.assessmentCompleted) {
      const { data: rows, error: baselineError } = await client.rpc(
        "svj_finalize_assessment_baseline",
      );
      if (baselineError) throw baselineError;
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { ok: true, stats: row ? mapUserStats(row) : undefined };
    }
    return { ok: true };
  });

/** Read user stats */
export const getUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserStatsData | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data, error } = await client
      .from("user_stats")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !data) return null;
    return mapUserStats(data);
  });

/** Save/update body profile with computed BMI/BMR/TDEE */
export const saveBodyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: BodyProfileData) => input)
  .handler(async ({ context, data }): Promise<{ ok: boolean; profile: BodyProfileData }> => {
    if (
      data.heightCm !== undefined &&
      (!Number.isFinite(data.heightCm) || data.heightCm < 100 || data.heightCm > 250)
    ) {
      throw new Error("Enter a height between 100 and 250 cm.");
    }
    if (
      data.weightKg !== undefined &&
      (!Number.isFinite(data.weightKg) || data.weightKg < 25 || data.weightKg > 400)
    ) {
      throw new Error("Enter a weight between 25 and 400 kg.");
    }
    if (
      data.targetWeightKg !== undefined &&
      (!Number.isFinite(data.targetWeightKg) ||
        data.targetWeightKg < 25 ||
        data.targetWeightKg > 400)
    ) {
      throw new Error("Enter a target weight between 25 and 400 kg.");
    }
    if (
      data.activityLevel &&
      !["sedentary", "light", "moderate", "active", "very_active"].includes(data.activityLevel)
    ) {
      throw new Error("Choose a valid activity level.");
    }
    if (
      data.bodyGoal &&
      !["lose_fat", "maintain", "gain_muscle", "improve_fitness"].includes(data.bodyGoal)
    ) {
      throw new Error("Choose a valid body goal.");
    }
    if (data.sex && !["male", "female", "other"].includes(data.sex)) {
      throw new Error("Choose a valid sex value.");
    }

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
      const birthMs = new Date(data.dateOfBirth).getTime();
      const age = Math.floor((Date.now() - birthMs) / (365.25 * 86400000));
      if (!Number.isFinite(birthMs) || age < 13 || age > 120) {
        throw new Error("Enter a valid date of birth for an adult/teen profile.");
      }
      bmr = calculateBMR(data.weightKg, data.heightCm, age, data.sex);
      if (data.activityLevel) {
        tdee = calculateTDEE(bmr, data.activityLevel);
        if (data.bodyGoal && tdee) {
          dailyCalorieTarget = calorieTarget(tdee, data.bodyGoal);
        }
      }
    }

    // Own-row RLS allows this authenticated persistence; calorie/BMR fields are
    // calculated here, not accepted from the client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { error } = await client.from("user_body_profiles").upsert(
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
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
