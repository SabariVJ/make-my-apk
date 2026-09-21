// ============================================================================
// SVJ Automated Training — reviewed workout template catalog.
//
// This is a real, hand-reviewed library of session families (not generated per
// user, not AI-authored). Templates reference STABLE exercise slugs from the
// canonical `svj_exercises` catalog, so a completed session always resolves to
// the same exercise identity the strength logger and muscle history use.
//
// The planner (trainingPlan.ts) selects WHICH template applies to a plan slot;
// the logger renders TARGET vs ACTUAL from a template's prescription; nothing
// here marks a set performed.
// ============================================================================

import type { MuscleGroup } from "./strength";
import type { EquipmentId, ExperienceLevel, TrainingGoal } from "./trainingProfile";

export const SESSION_FAMILIES = [
  "full_body",
  "upper",
  "lower",
  "push",
  "pull",
  "legs",
  "athletic_full_body",
] as const;
export type SessionFamily = (typeof SESSION_FAMILIES)[number];

export const SESSION_FAMILY_LABELS: Record<SessionFamily, string> = {
  full_body: "Full Body",
  upper: "Upper",
  lower: "Lower",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  athletic_full_body: "Athletic Full Body",
};

export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "isolation_push",
  "isolation_pull",
  "core",
  "conditioning",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

/** How progress is expressed for an exercise — drives trainingProgression.ts. */
export const LOAD_TYPES = ["weighted", "bodyweight", "assisted", "duration", "power"] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export interface TemplateExercise {
  /** Stable identity — matches svj_exercises.slug (global catalog). */
  slug: string;
  name: string;
  /** Primary muscle, mirroring the catalog metadata. */
  muscle: MuscleGroup;
  secondary: MuscleGroup[];
  pattern: MovementPattern;
  loadType: LoadType;
  workSets: number;
  /** Rep range for rep-based work (repMin ≤ reps ≤ repMax). */
  repMin: number;
  repMax: number;
  /** Duration work (planks/holds) uses seconds instead of reps. */
  durationSeconds: number | null;
  restSeconds: number;
  /** Target effort (RPE). Never a prescription of failure for power work. */
  rpe: number;
  /** Estimated warm-up sets (separate from work sets, never counted as volume). */
  warmupSets: number;
  equipment: EquipmentId[];
  /** Alternate slugs a user can swap in — validated to exist in the catalog. */
  substitutions: string[];
  /** Optional work trimmed first when the session must fit a shorter slot. */
  optional?: boolean;
}

export interface WorkoutTemplate {
  /** Stable catalog identity, e.g. "full_body_a". */
  id: string;
  family: SessionFamily;
  variant: "A" | "B";
  name: string;
  /** Experience levels this template is appropriate for. */
  experience: ExperienceLevel[];
  goals: TrainingGoal[];
  muscles: MuscleGroup[];
  estimatedMinutes: number;
  warmup: string;
  progressionPolicy: string;
  exercises: TemplateExercise[];
}

const GYM: EquipmentId[] = ["full_gym"];
const GYM_DB: EquipmentId[] = ["full_gym", "dumbbells"];
const DB: EquipmentId[] = ["dumbbells"];
const BW: EquipmentId[] = ["bodyweight"];
const BANDS: EquipmentId[] = ["bands"];

const ex = (e: TemplateExercise): TemplateExercise => e;

// ── Full Body ──────────────────────────────────────────────────────────────
const FULL_BODY_A: WorkoutTemplate = {
  id: "full_body_a",
  family: "full_body",
  variant: "A",
  name: "Full Body A",
  experience: ["beginner", "intermediate", "veteran"],
  goals: ["muscle", "strength", "general", "athletic"],
  muscles: ["chest", "back", "quads", "core"],
  estimatedMinutes: 45,
  warmup: "5 min easy movement + 2 ramp-up sets on the first lift.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "squat",
      name: "Squat",
      muscle: "quads",
      secondary: ["glutes", "hamstrings"],
      pattern: "squat",
      loadType: "weighted",
      workSets: 3,
      repMin: 6,
      repMax: 10,
      durationSeconds: null,
      restSeconds: 150,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["leg_press", "bulgarian_split_squat"],
    }),
    ex({
      slug: "bench_press",
      name: "Bench Press",
      muscle: "chest",
      secondary: ["triceps", "shoulders"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["dumbbell_bench_press", "chest_press", "push_up"],
    }),
    ex({
      slug: "barbell_row",
      name: "Barbell Row",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "horizontal_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["dumbbell_row", "seated_cable_row"],
    }),
    ex({
      slug: "overhead_press",
      name: "Overhead Press",
      muscle: "shoulders",
      secondary: ["triceps"],
      pattern: "vertical_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM_DB,
      substitutions: ["dumbbell_shoulder_press"],
    }),
    ex({
      slug: "plank",
      name: "Plank",
      muscle: "core",
      secondary: [],
      pattern: "core",
      loadType: "duration",
      workSets: 3,
      repMin: 0,
      repMax: 0,
      durationSeconds: 45,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["crunch", "leg_raise"],
      optional: true,
    }),
  ],
};

const FULL_BODY_B: WorkoutTemplate = {
  id: "full_body_b",
  family: "full_body",
  variant: "B",
  name: "Full Body B",
  experience: ["beginner", "intermediate", "veteran"],
  goals: ["muscle", "strength", "general", "athletic"],
  muscles: ["hamstrings", "back", "shoulders", "core"],
  estimatedMinutes: 45,
  warmup: "5 min easy movement + 2 ramp-up sets on the first lift.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "romanian_deadlift",
      name: "Romanian Deadlift",
      muscle: "hamstrings",
      secondary: ["glutes", "back"],
      pattern: "hinge",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 150,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["leg_curl"],
    }),
    ex({
      slug: "lat_pulldown",
      name: "Lat Pulldown",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "vertical_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM_DB,
      substitutions: ["pull_up", "seated_cable_row"],
    }),
    ex({
      slug: "dumbbell_bench_press",
      name: "Dumbbell Bench Press",
      muscle: "chest",
      secondary: ["triceps", "shoulders"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM_DB,
      substitutions: ["push_up", "chest_press"],
    }),
    ex({
      slug: "lateral_raise",
      name: "Lateral Raise",
      muscle: "shoulders",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 12,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM_DB,
      substitutions: [],
    }),
    ex({
      slug: "leg_raise",
      name: "Leg Raise",
      muscle: "core",
      secondary: [],
      pattern: "core",
      loadType: "bodyweight",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["crunch"],
      optional: true,
    }),
  ],
};

// ── Upper / Lower ──────────────────────────────────────────────────────────
const UPPER_A: WorkoutTemplate = {
  id: "upper_a",
  family: "upper",
  variant: "A",
  name: "Upper A",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength", "athletic"],
  muscles: ["chest", "back", "shoulders", "triceps"],
  estimatedMinutes: 50,
  warmup: "5 min upper-body movement + 2 ramp-up sets on the first press.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "bench_press",
      name: "Bench Press",
      muscle: "chest",
      secondary: ["triceps", "shoulders"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 4,
      repMin: 6,
      repMax: 10,
      durationSeconds: null,
      restSeconds: 150,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["dumbbell_bench_press"],
    }),
    ex({
      slug: "barbell_row",
      name: "Barbell Row",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "horizontal_pull",
      loadType: "weighted",
      workSets: 4,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["seated_cable_row"],
    }),
    ex({
      slug: "overhead_press",
      name: "Overhead Press",
      muscle: "shoulders",
      secondary: ["triceps"],
      pattern: "vertical_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["dumbbell_shoulder_press"],
    }),
    ex({
      slug: "lat_pulldown",
      name: "Lat Pulldown",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "vertical_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: ["pull_up"],
    }),
    ex({
      slug: "tricep_pushdown",
      name: "Tricep Pushdown",
      muscle: "triceps",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: ["overhead_tricep_extension", "dips"],
      optional: true,
    }),
  ],
};

const UPPER_B: WorkoutTemplate = {
  id: "upper_b",
  family: "upper",
  variant: "B",
  name: "Upper B",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength", "athletic"],
  muscles: ["chest", "back", "shoulders", "biceps"],
  estimatedMinutes: 50,
  warmup: "5 min upper-body movement + 2 ramp-up sets on the first pull.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "pull_up",
      name: "Pull-Up",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "vertical_pull",
      loadType: "bodyweight",
      workSets: 4,
      repMin: 5,
      repMax: 10,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM_DB,
      substitutions: ["lat_pulldown"],
    }),
    ex({
      slug: "incline_bench_press",
      name: "Incline Bench Press",
      muscle: "chest",
      secondary: ["shoulders", "triceps"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 4,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["dumbbell_bench_press", "push_up"],
    }),
    ex({
      slug: "seated_cable_row",
      name: "Seated Cable Row",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "horizontal_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: ["dumbbell_row"],
    }),
    ex({
      slug: "dumbbell_shoulder_press",
      name: "Dumbbell Shoulder Press",
      muscle: "shoulders",
      secondary: ["triceps"],
      pattern: "vertical_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 1,
      equipment: DB,
      substitutions: ["overhead_press"],
    }),
    ex({
      slug: "bicep_curl",
      name: "Bicep Curl",
      muscle: "biceps",
      secondary: [],
      pattern: "isolation_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: DB,
      substitutions: ["hammer_curl"],
      optional: true,
    }),
  ],
};

const LOWER_A: WorkoutTemplate = {
  id: "lower_a",
  family: "lower",
  variant: "A",
  name: "Lower A",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength", "athletic"],
  muscles: ["quads", "glutes", "core"],
  estimatedMinutes: 50,
  warmup: "5 min easy movement + 2 ramp-up sets on the squat.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "squat",
      name: "Squat",
      muscle: "quads",
      secondary: ["glutes", "hamstrings"],
      pattern: "squat",
      loadType: "weighted",
      workSets: 4,
      repMin: 5,
      repMax: 8,
      durationSeconds: null,
      restSeconds: 180,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["leg_press"],
    }),
    ex({
      slug: "romanian_deadlift",
      name: "Romanian Deadlift",
      muscle: "hamstrings",
      secondary: ["glutes", "back"],
      pattern: "hinge",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 150,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM_DB,
      substitutions: ["leg_curl"],
    }),
    ex({
      slug: "leg_press",
      name: "Leg Press",
      muscle: "quads",
      secondary: ["glutes"],
      pattern: "squat",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["bulgarian_split_squat", "lunges"],
    }),
    ex({
      slug: "calf_raise",
      name: "Calf Raise",
      muscle: "calves",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 4,
      repMin: 12,
      repMax: 20,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM_DB,
      substitutions: [],
    }),
    ex({
      slug: "plank",
      name: "Plank",
      muscle: "core",
      secondary: [],
      pattern: "core",
      loadType: "duration",
      workSets: 3,
      repMin: 0,
      repMax: 0,
      durationSeconds: 50,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["leg_raise"],
      optional: true,
    }),
  ],
};

const LOWER_B: WorkoutTemplate = {
  id: "lower_b",
  family: "lower",
  variant: "B",
  name: "Lower B",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength", "athletic"],
  muscles: ["hamstrings", "glutes", "quads"],
  estimatedMinutes: 50,
  warmup: "5 min easy movement + 2 ramp-up sets on the deadlift.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "deadlift",
      name: "Deadlift",
      muscle: "hamstrings",
      secondary: ["glutes", "back"],
      pattern: "hinge",
      loadType: "weighted",
      workSets: 3,
      repMin: 4,
      repMax: 6,
      durationSeconds: null,
      restSeconds: 210,
      rpe: 8,
      warmupSets: 3,
      equipment: GYM,
      substitutions: ["romanian_deadlift"],
    }),
    ex({
      slug: "bulgarian_split_squat",
      name: "Bulgarian Split Squat",
      muscle: "quads",
      secondary: ["glutes"],
      pattern: "lunge",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: DB,
      substitutions: ["lunges", "leg_press"],
    }),
    ex({
      slug: "leg_curl",
      name: "Leg Curl",
      muscle: "hamstrings",
      secondary: [],
      pattern: "isolation_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: [],
    }),
    ex({
      slug: "leg_extension",
      name: "Leg Extension",
      muscle: "quads",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 12,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: [],
      optional: true,
    }),
    ex({
      slug: "russian_twist",
      name: "Russian Twist",
      muscle: "core",
      secondary: [],
      pattern: "core",
      loadType: "bodyweight",
      workSets: 3,
      repMin: 16,
      repMax: 24,
      durationSeconds: null,
      restSeconds: 45,
      rpe: 7,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["crunch"],
      optional: true,
    }),
  ],
};

// ── Push / Pull / Legs ─────────────────────────────────────────────────────
const PUSH_A: WorkoutTemplate = {
  id: "push_a",
  family: "push",
  variant: "A",
  name: "Push A",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength"],
  muscles: ["chest", "shoulders", "triceps"],
  estimatedMinutes: 50,
  warmup: "5 min upper-body movement + 2 ramp-up sets on the bench.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "bench_press",
      name: "Bench Press",
      muscle: "chest",
      secondary: ["triceps", "shoulders"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 4,
      repMin: 6,
      repMax: 10,
      durationSeconds: null,
      restSeconds: 150,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["dumbbell_bench_press"],
    }),
    ex({
      slug: "overhead_press",
      name: "Overhead Press",
      muscle: "shoulders",
      secondary: ["triceps"],
      pattern: "vertical_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["dumbbell_shoulder_press"],
    }),
    ex({
      slug: "incline_bench_press",
      name: "Incline Bench Press",
      muscle: "chest",
      secondary: ["shoulders", "triceps"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM_DB,
      substitutions: ["dumbbell_bench_press", "push_up"],
    }),
    ex({
      slug: "lateral_raise",
      name: "Lateral Raise",
      muscle: "shoulders",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 12,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: DB,
      substitutions: [],
    }),
    ex({
      slug: "tricep_pushdown",
      name: "Tricep Pushdown",
      muscle: "triceps",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: ["overhead_tricep_extension"],
      optional: true,
    }),
  ],
};

const PUSH_B: WorkoutTemplate = {
  id: "push_b",
  family: "push",
  variant: "B",
  name: "Push B",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength"],
  muscles: ["shoulders", "chest", "triceps"],
  estimatedMinutes: 50,
  warmup: "5 min upper-body movement + 2 ramp-up sets on the press.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "dumbbell_shoulder_press",
      name: "Dumbbell Shoulder Press",
      muscle: "shoulders",
      secondary: ["triceps"],
      pattern: "vertical_push",
      loadType: "weighted",
      workSets: 4,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 2,
      equipment: DB,
      substitutions: ["overhead_press"],
    }),
    ex({
      slug: "dumbbell_bench_press",
      name: "Dumbbell Bench Press",
      muscle: "chest",
      secondary: ["triceps", "shoulders"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 4,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: DB,
      substitutions: ["chest_press"],
    }),
    ex({
      slug: "chest_fly",
      name: "Chest Fly",
      muscle: "chest",
      secondary: ["shoulders"],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 12,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM_DB,
      substitutions: [],
    }),
    ex({
      slug: "overhead_tricep_extension",
      name: "Overhead Tricep Extension",
      muscle: "triceps",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: DB,
      substitutions: ["tricep_pushdown"],
      optional: true,
    }),
  ],
};

const PULL_A: WorkoutTemplate = {
  id: "pull_a",
  family: "pull",
  variant: "A",
  name: "Pull A",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength"],
  muscles: ["back", "biceps", "core"],
  estimatedMinutes: 50,
  warmup: "5 min upper-body movement + 2 ramp-up sets on the row.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "pull_up",
      name: "Pull-Up",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "vertical_pull",
      loadType: "bodyweight",
      workSets: 4,
      repMin: 5,
      repMax: 10,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM_DB,
      substitutions: ["lat_pulldown"],
    }),
    ex({
      slug: "barbell_row",
      name: "Barbell Row",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "horizontal_pull",
      loadType: "weighted",
      workSets: 4,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["dumbbell_row", "seated_cable_row"],
    }),
    ex({
      slug: "rear_delt_fly",
      name: "Rear Delt Fly",
      muscle: "shoulders",
      secondary: ["back"],
      pattern: "horizontal_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 12,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: DB,
      substitutions: [],
    }),
    ex({
      slug: "bicep_curl",
      name: "Bicep Curl",
      muscle: "biceps",
      secondary: [],
      pattern: "isolation_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: DB,
      substitutions: ["hammer_curl"],
    }),
    ex({
      slug: "crunch",
      name: "Crunch",
      muscle: "core",
      secondary: [],
      pattern: "core",
      loadType: "bodyweight",
      workSets: 3,
      repMin: 12,
      repMax: 20,
      durationSeconds: null,
      restSeconds: 45,
      rpe: 7,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["leg_raise"],
      optional: true,
    }),
  ],
};

const PULL_B: WorkoutTemplate = {
  id: "pull_b",
  family: "pull",
  variant: "B",
  name: "Pull B",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength"],
  muscles: ["back", "biceps", "shoulders"],
  estimatedMinutes: 50,
  warmup: "5 min upper-body movement + 2 ramp-up sets on the pulldown.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "lat_pulldown",
      name: "Lat Pulldown",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "vertical_pull",
      loadType: "weighted",
      workSets: 4,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 2,
      equipment: GYM,
      substitutions: ["pull_up"],
    }),
    ex({
      slug: "seated_cable_row",
      name: "Seated Cable Row",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "horizontal_pull",
      loadType: "weighted",
      workSets: 4,
      repMin: 10,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["dumbbell_row"],
    }),
    ex({
      slug: "rear_delt_fly",
      name: "Rear Delt Fly",
      muscle: "shoulders",
      secondary: ["back"],
      pattern: "isolation_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 12,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: DB,
      substitutions: ["face_pull"],
    }),
    ex({
      slug: "hammer_curl",
      name: "Hammer Curl",
      muscle: "biceps",
      secondary: [],
      pattern: "isolation_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: DB,
      substitutions: ["bicep_curl"],
      optional: true,
    }),
  ],
};

const LEGS_A: WorkoutTemplate = {
  id: "legs_a",
  family: "legs",
  variant: "A",
  name: "Legs A",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength"],
  muscles: ["quads", "glutes", "calves"],
  estimatedMinutes: 50,
  warmup: "5 min easy movement + 2 ramp-up sets on the squat.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "squat",
      name: "Squat",
      muscle: "quads",
      secondary: ["glutes", "hamstrings"],
      pattern: "squat",
      loadType: "weighted",
      workSets: 4,
      repMin: 5,
      repMax: 8,
      durationSeconds: null,
      restSeconds: 180,
      rpe: 8,
      warmupSets: 3,
      equipment: GYM_DB,
      substitutions: ["leg_press"],
    }),
    ex({
      slug: "leg_press",
      name: "Leg Press",
      muscle: "quads",
      secondary: ["glutes"],
      pattern: "squat",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["bulgarian_split_squat"],
    }),
    ex({
      slug: "leg_curl",
      name: "Leg Curl",
      muscle: "hamstrings",
      secondary: [],
      pattern: "isolation_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 10,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: [],
    }),
    ex({
      slug: "calf_raise",
      name: "Calf Raise",
      muscle: "calves",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 4,
      repMin: 12,
      repMax: 20,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM_DB,
      substitutions: [],
    }),
  ],
};

const LEGS_B: WorkoutTemplate = {
  id: "legs_b",
  family: "legs",
  variant: "B",
  name: "Legs B",
  experience: ["intermediate", "veteran"],
  goals: ["muscle", "strength"],
  muscles: ["hamstrings", "glutes", "quads"],
  estimatedMinutes: 50,
  warmup: "5 min easy movement + 2 ramp-up sets on the deadlift.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "deadlift",
      name: "Deadlift",
      muscle: "hamstrings",
      secondary: ["glutes", "back"],
      pattern: "hinge",
      loadType: "weighted",
      workSets: 3,
      repMin: 4,
      repMax: 6,
      durationSeconds: null,
      restSeconds: 210,
      rpe: 8,
      warmupSets: 3,
      equipment: GYM,
      substitutions: ["romanian_deadlift"],
    }),
    ex({
      slug: "bulgarian_split_squat",
      name: "Bulgarian Split Squat",
      muscle: "quads",
      secondary: ["glutes"],
      pattern: "lunge",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 8,
      warmupSets: 1,
      equipment: DB,
      substitutions: ["lunges"],
    }),
    ex({
      slug: "leg_extension",
      name: "Leg Extension",
      muscle: "quads",
      secondary: [],
      pattern: "isolation_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 12,
      repMax: 15,
      durationSeconds: null,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: GYM,
      substitutions: [],
    }),
    ex({
      slug: "plank",
      name: "Plank",
      muscle: "core",
      secondary: [],
      pattern: "core",
      loadType: "duration",
      workSets: 3,
      repMin: 0,
      repMax: 0,
      durationSeconds: 50,
      restSeconds: 60,
      rpe: 8,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["leg_raise"],
      optional: true,
    }),
  ],
};

// ── Athletic Full Body ─────────────────────────────────────────────────────
const ATHLETIC_FULL_BODY_A: WorkoutTemplate = {
  id: "athletic_full_body_a",
  family: "athletic_full_body",
  variant: "A",
  name: "Athletic Full Body A",
  experience: ["intermediate", "veteran"],
  goals: ["athletic", "general"],
  muscles: ["quads", "back", "shoulders", "core"],
  estimatedMinutes: 45,
  warmup: "8 min dynamic mobility + 2 ramp-up sets on the primary lift.",
  progressionPolicy: "double_progression_v1",
  exercises: [
    ex({
      slug: "squat",
      name: "Squat",
      muscle: "quads",
      secondary: ["glutes", "hamstrings"],
      pattern: "squat",
      loadType: "weighted",
      workSets: 3,
      repMin: 5,
      repMax: 8,
      durationSeconds: null,
      restSeconds: 180,
      rpe: 7,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["leg_press"],
    }),
    ex({
      slug: "bench_press",
      name: "Bench Press",
      muscle: "chest",
      secondary: ["triceps", "shoulders"],
      pattern: "horizontal_push",
      loadType: "weighted",
      workSets: 3,
      repMin: 6,
      repMax: 10,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 7,
      warmupSets: 2,
      equipment: GYM_DB,
      substitutions: ["dumbbell_bench_press"],
    }),
    ex({
      slug: "barbell_row",
      name: "Barbell Row",
      muscle: "back",
      secondary: ["biceps"],
      pattern: "horizontal_pull",
      loadType: "weighted",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 120,
      rpe: 7,
      warmupSets: 1,
      equipment: GYM,
      substitutions: ["dumbbell_row"],
    }),
    ex({
      slug: "burpee",
      name: "Burpee",
      muscle: "full_body",
      secondary: ["chest", "quads"],
      pattern: "conditioning",
      loadType: "power",
      workSets: 3,
      repMin: 8,
      repMax: 12,
      durationSeconds: null,
      restSeconds: 90,
      rpe: 7,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["kettlebell_swing"],
    }),
    ex({
      slug: "plank",
      name: "Plank",
      muscle: "core",
      secondary: [],
      pattern: "core",
      loadType: "duration",
      workSets: 3,
      repMin: 0,
      repMax: 0,
      durationSeconds: 40,
      restSeconds: 60,
      rpe: 7,
      warmupSets: 0,
      equipment: BW,
      substitutions: ["leg_raise"],
      optional: true,
    }),
  ],
};

/**
 * The reviewed system catalog. Deliberately small and reusable: the planner
 * maps a split slot (family + variant) onto one of these, and every entry
 * references stable global exercise slugs rather than duplicating exercises.
 */
export const WORKOUT_TEMPLATE_CATALOG: WorkoutTemplate[] = [
  FULL_BODY_A,
  FULL_BODY_B,
  UPPER_A,
  UPPER_B,
  LOWER_A,
  LOWER_B,
  PUSH_A,
  PUSH_B,
  PULL_A,
  PULL_B,
  LEGS_A,
  LEGS_B,
  ATHLETIC_FULL_BODY_A,
];

export function getTemplate(id: string): WorkoutTemplate | null {
  return WORKOUT_TEMPLATE_CATALOG.find((t) => t.id === id) ?? null;
}

/** Resolve a family + variant to a catalog template, falling back to variant A. */
export function templateForSlot(family: SessionFamily, variant: "A" | "B"): WorkoutTemplate | null {
  return (
    WORKOUT_TEMPLATE_CATALOG.find((t) => t.family === family && t.variant === variant) ??
    WORKOUT_TEMPLATE_CATALOG.find((t) => t.family === family && t.variant === "A") ??
    null
  );
}

export interface TemplateFilter {
  experience?: ExperienceLevel;
  goal?: TrainingGoal;
  /** Muscle groups requested (any-match on primary + secondary). */
  muscles?: MuscleGroup[];
  /** Session families requested. */
  families?: SessionFamily[];
  equipment?: EquipmentId[];
  /** Maximum session length in minutes (templates longer than this are dropped). */
  maxMinutes?: number;
}

/** A template is feasible when every REQUIRED exercise is available. */
export function templateIsFeasible(template: WorkoutTemplate, equipment: EquipmentId[]): boolean {
  if (equipment.length === 0) return true;
  return template.exercises.every(
    (e) => e.optional === true || e.equipment.some((need) => equipment.includes(need)),
  );
}

/**
 * Filter the catalog. Every criterion is optional; the result keeps catalog
 * order so browsing is stable. A "Legs" muscle filter groups lower-body muscles
 * for browsing while exercise-level muscle metadata stays individual.
 */
export function filterTemplates(
  catalog: WorkoutTemplate[] = WORKOUT_TEMPLATE_CATALOG,
  filter: TemplateFilter = {},
): WorkoutTemplate[] {
  const muscleSet = new Set(filter.muscles ?? []);
  const familySet = new Set(filter.families ?? []);
  return catalog.filter((template) => {
    if (filter.experience && !template.experience.includes(filter.experience)) return false;
    if (filter.goal && !template.goals.includes(filter.goal)) return false;
    if (familySet.size > 0 && !familySet.has(template.family)) return false;
    if (muscleSet.size > 0 && !template.muscles.some((m) => muscleSet.has(m))) return false;
    if (filter.equipment && !templateIsFeasible(template, filter.equipment)) return false;
    if (filter.maxMinutes && template.estimatedMinutes > filter.maxMinutes) return false;
    return true;
  });
}

/** Estimated work sets in a template (excludes warm-ups). */
export function templateWorkSetCount(template: WorkoutTemplate): number {
  return template.exercises.reduce((sum, e) => sum + e.workSets, 0);
}

/** Distinct muscles a template trains (primary ∪ secondary). */
export function templateMuscles(template: WorkoutTemplate): MuscleGroup[] {
  const set = new Set<MuscleGroup>();
  for (const e of template.exercises) {
    set.add(e.muscle);
    for (const s of e.secondary) set.add(s);
  }
  return [...set];
}

/**
 * Trim a template to fit a shorter session by dropping optional work first,
 * then the last accessory. Returns a NEW template object; the catalog is never
 * mutated. Never reduces primary compound work below one exercise.
 */
export function fitTemplateToMinutes(
  template: WorkoutTemplate,
  maxMinutes: number,
): WorkoutTemplate {
  if (template.estimatedMinutes <= maxMinutes) return template;
  const kept = [...template.exercises];
  const estimateMinutes = (exercises: TemplateExercise[]): number =>
    exercises.reduce(
      (sum, e) => sum + (e.warmupSets * 1.5 + e.workSets * (e.restSeconds / 60 + 0.75)) + 1.5,
      0,
    );
  while (kept.length > 1) {
    const optionalIndex = [...kept].reverse().findIndex((e) => e.optional === true);
    const dropIndex = optionalIndex >= 0 ? kept.length - 1 - optionalIndex : kept.length - 1;
    kept.splice(dropIndex, 1);
    if (estimateMinutes(kept) <= maxMinutes) break;
  }
  return { ...template, exercises: kept };
}

/**
 * Substitute an avoided/unavailable movement using the template's reviewed
 * alternates. Returns the replacement slug, or null when none is safe.
 */
export function substituteExercise(
  exercise: TemplateExercise,
  opts: { avoid?: string[]; equipment?: EquipmentId[] } = {},
): string | null {
  const avoid = new Set(opts.avoid ?? []);
  for (const candidate of exercise.substitutions) {
    if (!avoid.has(candidate)) return candidate;
  }
  return null;
}

/** Map a muscle browsing group ("legs") to the individual muscles it covers. */
export const MUSCLE_BROWSE_GROUPS: Record<string, MuscleGroup[]> = {
  chest: ["chest"],
  back: ["back"],
  shoulders: ["shoulders"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  quads: ["quads"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  calves: ["calves"],
  core: ["core"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
};
