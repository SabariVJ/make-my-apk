// ============================================================================
// SVJ Automated Training — training profile.
//
// The persisted, resumable description of how a person wants to train. It is
// deliberately INDEPENDENT of account age, XP, streak or membership: a veteran
// who selects two days still gets a legitimate two-day program, and BMI never
// selects a split (see trainingPlan.ts).
//
// Pure data + validation here; persistence lives in trainingClient.ts and the
// server tables. Body & Nutrition fields (height/weight/body-fat) are reused
// from the existing profile, never duplicated into this record.
// ============================================================================

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "veteran"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const TRAINING_GOALS = ["muscle", "athletic", "strength", "general"] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const EQUIPMENT_OPTIONS = ["full_gym", "dumbbells", "bands", "bodyweight"] as const;
export type EquipmentId = (typeof EQUIPMENT_OPTIONS)[number];

export const LOAD_CONVENTIONS = [
  "barbell_total",
  "dumbbell_per_hand",
  "machine_stack",
  "assisted",
  "cable",
  "bodyweight_added",
] as const;
export type LoadConvention = (typeof LOAD_CONVENTIONS)[number];

/** 0 = Sunday … 6 = Saturday (JS Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  veteran: "Veteran",
};

export const GOAL_LABELS: Record<TrainingGoal, string> = {
  muscle: "Build muscle",
  athletic: "Athletic performance",
  strength: "Strength",
  general: "General fitness",
};

export const EQUIPMENT_LABELS: Record<EquipmentId, string> = {
  full_gym: "Full gym",
  dumbbells: "Dumbbells",
  bands: "Bands",
  bodyweight: "Bodyweight",
};

export const LOAD_CONVENTION_LABELS: Record<LoadConvention, string> = {
  barbell_total: "Barbell (total)",
  dumbbell_per_hand: "Dumbbell (per hand)",
  machine_stack: "Machine stack",
  assisted: "Assisted",
  cable: "Cable",
  bodyweight_added: "Bodyweight + added",
};

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

/** Athlete context is optional; only used when the goal is athletic. */
export interface AthleteContext {
  sport: string;
  /** Local weekday numbers the athlete typically practises on. */
  practiceDays: Weekday[];
  /** Known competition dates (ISO yyyy-mm-dd) announced by the user. */
  competitionDates: string[];
  inSeason: boolean;
}

export interface TrainingProfile {
  /** Schema version of this record; unknown versions are re-normalized. */
  version: number;
  setupComplete: boolean;
  experience: ExperienceLevel;
  goal: TrainingGoal;
  /** Optional secondary goal; never the primary split selector. */
  secondaryGoal: TrainingGoal | null;
  /** Weekdays the user can realistically train. */
  availableDays: Weekday[];
  /** Preferred number of sessions per week (1–6). */
  sessionsPerWeek: number;
  /** Minutes available per session. */
  sessionMinutes: number;
  equipment: EquipmentId[];
  /** Movements to avoid (catalog slugs or free-text names). */
  avoidMovements: string[];
  /** Movements the user knows well (catalog slugs when known). */
  familiarMovements: string[];
  /** Preference flags. */
  prefersMachines: boolean;
  /** kg (default) or lb — display only; storage stays kg. */
  units: "kg" | "lb";
  /** Optional explicit load convention override per profile. */
  loadConvention: LoadConvention;
  athlete: AthleteContext;
  /** ISO timestamp of the last edit (server owns the authoritative value). */
  updatedAt: string;
}

export const TRAINING_PROFILE_VERSION = 2;

const isWeekday = (v: unknown): v is Weekday =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6;

export function emptyTrainingProfile(): TrainingProfile {
  return {
    version: TRAINING_PROFILE_VERSION,
    setupComplete: false,
    experience: "beginner",
    goal: "general",
    secondaryGoal: null,
    availableDays: [1, 3, 5],
    sessionsPerWeek: 3,
    sessionMinutes: 45,
    equipment: ["full_gym"],
    avoidMovements: [],
    familiarMovements: [],
    prefersMachines: false,
    units: "kg",
    loadConvention: "barbell_total",
    athlete: { sport: "", practiceDays: [], competitionDates: [], inSeason: false },
    updatedAt: "",
  };
}

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Normalize an untrusted record (stored JSON or server row) into a profile. */
export function normalizeTrainingProfile(raw: unknown): TrainingProfile {
  const base = emptyTrainingProfile();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const experience = (EXPERIENCE_LEVELS as readonly string[]).includes(r.experience as string)
    ? (r.experience as ExperienceLevel)
    : base.experience;
  const goal = (TRAINING_GOALS as readonly string[]).includes(r.goal as string)
    ? (r.goal as TrainingGoal)
    : base.goal;
  const secondaryGoal =
    r.secondaryGoal && (TRAINING_GOALS as readonly string[]).includes(r.secondaryGoal as string)
      ? (r.secondaryGoal as TrainingGoal)
      : null;

  const availableDays = Array.isArray(r.availableDays)
    ? [...new Set(r.availableDays.filter(isWeekday))].sort((a, b) => a - b).slice(0, 7)
    : base.availableDays;
  const days = availableDays.length > 0 ? availableDays : base.availableDays;

  const equipment = Array.isArray(r.equipment)
    ? ([
        ...new Set(
          r.equipment.filter((e): e is EquipmentId =>
            (EQUIPMENT_OPTIONS as readonly string[]).includes(e as string),
          ),
        ),
      ] as EquipmentId[])
    : base.equipment;
  const safeEquipment = equipment.length > 0 ? equipment : base.equipment;

  const loadConvention = (LOAD_CONVENTIONS as readonly string[]).includes(
    r.loadConvention as string,
  )
    ? (r.loadConvention as LoadConvention)
    : base.loadConvention;

  const athleteRaw =
    r.athlete && typeof r.athlete === "object" ? (r.athlete as Record<string, unknown>) : {};
  const practiceDays = Array.isArray(athleteRaw.practiceDays)
    ? [...new Set(athleteRaw.practiceDays.filter(isWeekday))].sort((a, b) => a - b)
    : [];
  const competitionDates = Array.isArray(athleteRaw.competitionDates)
    ? (
        athleteRaw.competitionDates.filter(
          (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
        ) as string[]
      ).slice(0, 20)
    : [];

  const cleanStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];

  return {
    version: TRAINING_PROFILE_VERSION,
    setupComplete: r.setupComplete === true,
    experience,
    goal,
    secondaryGoal: secondaryGoal && secondaryGoal !== goal ? secondaryGoal : null,
    availableDays: days,
    sessionsPerWeek: clampInt(r.sessionsPerWeek, 1, 6, Math.min(days.length || 3, 6)),
    sessionMinutes: clampInt(r.sessionMinutes, 20, 150, base.sessionMinutes),
    equipment: safeEquipment,
    avoidMovements: cleanStrings(r.avoidMovements),
    familiarMovements: cleanStrings(r.familiarMovements),
    prefersMachines: r.prefersMachines === true,
    units: r.units === "lb" ? "lb" : "kg",
    loadConvention,
    athlete: {
      sport: typeof athleteRaw.sport === "string" ? athleteRaw.sport.trim().slice(0, 40) : "",
      practiceDays,
      competitionDates,
      inSeason: athleteRaw.inSeason === true,
    },
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
  };
}

/** A profile is usable for planning only when the required setup is present. */
export function isProfileReady(profile: TrainingProfile): boolean {
  return profile.setupComplete && profile.availableDays.length > 0 && profile.equipment.length > 0;
}

/** User-facing validation. Returns an error string, or null when valid. */
export function validateTrainingProfile(profile: TrainingProfile): string | null {
  if (profile.availableDays.length === 0) return "Choose at least one training day.";
  if (profile.sessionsPerWeek < 1 || profile.sessionsPerWeek > 6)
    return "Choose between 1 and 6 sessions per week.";
  if (profile.sessionMinutes < 20 || profile.sessionMinutes > 150)
    return "Session length must be between 20 and 150 minutes.";
  if (profile.equipment.length === 0) return "Choose at least one equipment option.";
  if (profile.goal === "athletic" && !profile.athlete.sport.trim())
    return "Add your sport so the plan can be scheduled around practices and competition.";
  return null;
}

/** Number of lifting days the planner will actually schedule. */
export function effectiveWeeklySessions(profile: TrainingProfile): number {
  return Math.min(profile.sessionsPerWeek, Math.max(1, profile.availableDays.length), 6);
}

export function hasEquipment(profile: TrainingProfile, equipment: EquipmentId[]): boolean {
  return equipment.some((e) => profile.equipment.includes(e));
}
