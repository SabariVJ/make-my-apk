// ============================================================================
// SVJ Automated Training — deterministic plan engine.
//
// Given a training profile, this selects a split, lays the sessions onto real
// calendar days, coordinates athlete practice/competition and reconciles missed
// sessions — all with explainable, versioned rules and no LLM, no randomness.
//
// BMI is NEVER an input: split selection is driven by safety/limitation rules,
// available days, session duration, equipment, movement familiarity, purpose,
// sport schedule, experience, performance, recovery and preference — in that
// order of precedence.
// ============================================================================

import { SESSION_FAMILY_LABELS, templateForSlot, type SessionFamily } from "./trainingTemplates";
import {
  BEGINNER_START_DAYS,
  COMPETITION_LOWER_BODY_BUFFER_DAYS,
  PLAN_BLOCK_WEEKS,
  TRAINING_POLICY_VERSION,
} from "./trainingPolicy";
import {
  effectiveWeeklySessions,
  WEEKDAY_LABELS,
  type TrainingProfile,
  type Weekday,
} from "./trainingProfile";

export interface PlanSlot {
  /** 0-based order within the week. */
  index: number;
  family: SessionFamily;
  variant: "A" | "B";
  templateId: string;
  label: string;
}

export interface SplitDecision {
  splitId: string;
  splitName: string;
  /** Number of lifting sessions actually scheduled this week. */
  days: number;
  slots: PlanSlot[];
  explanation: string;
  /** Transparent reasons, surfaced in "Why this session?". */
  reasons: string[];
  /** Set when the planner reduced the requested days (e.g. beginner cap). */
  cappedFrom?: number;
}

const variantSequence: ("A" | "B")[] = ["A", "B", "A", "B", "A", "B"];

function makeSlots(families: SessionFamily[]): PlanSlot[] {
  return families.map((family, index) => {
    const variant = variantSequence[index % 2];
    const template = templateForSlot(family, variant);
    return {
      index,
      family,
      variant,
      templateId: template?.id ?? `${family}_${variant.toLowerCase()}`,
      label: `${SESSION_FAMILY_LABELS[family]} ${variant}`,
    };
  });
}

/** Split structural templates by requested day count + experience + goal. */
function splitRecipe(
  experience: TrainingProfile["experience"],
  days: number,
  goal: TrainingProfile["goal"],
): { id: string; name: string; families: SessionFamily[] } {
  if (goal === "athletic") {
    if (days <= 2)
      return {
        id: "athletic_full_body_ab",
        name: "Athletic Full Body",
        families: ["athletic_full_body", "full_body"],
      };
    if (days === 3)
      return {
        id: "athletic_full_body_3",
        name: "Athletic Full Body",
        families: ["athletic_full_body", "full_body", "athletic_full_body"],
      };
    return {
      id: "athletic_upper_lower",
      name: "Athletic Upper / Lower",
      families: ["upper", "lower", "upper", "lower"],
    };
  }

  if (days <= 1) return { id: "single_full_body", name: "Full Body", families: ["full_body"] };

  if (experience === "beginner") {
    if (days === 2)
      return { id: "full_body_ab", name: "Full Body A/B", families: ["full_body", "full_body"] };
    return {
      id: "full_body_alternating",
      name: "Alternating Full Body",
      families: ["full_body", "full_body", "full_body"],
    };
  }

  if (days === 2)
    return { id: "full_body_ab", name: "Full Body A/B", families: ["full_body", "full_body"] };
  if (days === 3)
    return goal === "muscle"
      ? {
          id: "full_upper_lower",
          name: "Full Body / Upper / Lower",
          families: ["full_body", "upper", "lower"],
        }
      : {
          id: "full_body_alternating",
          name: "Alternating Full Body",
          families: ["full_body", "full_body", "full_body"],
        };
  if (days === 4)
    return {
      id: "upper_lower",
      name: "Upper / Lower",
      families: ["upper", "lower", "upper", "lower"],
    };
  if (days === 5)
    return {
      id: "upper_lower_ppl",
      name: "Upper / Lower + Push / Pull / Legs",
      families: ["upper", "lower", "push", "pull", "legs"],
    };
  return {
    id: "ppl_x2",
    name: "Push / Pull / Legs ×2",
    families: ["push", "pull", "legs", "push", "pull", "legs"],
  };
}

export interface PlanInput {
  profile: TrainingProfile;
  /** Allow a beginner who selected 4+ days to train 4 (default: cap at 3). */
  beginnerFourDay?: boolean;
}

/**
 * Deterministic split selection. The user's requested weekly sessions are
 * intersected with their available days; beginners are gently capped so a
 * first program is not overwhelming, and a veteran who chooses two days still
 * receives a legitimate two-day program.
 */
export function selectSplit(input: PlanInput): SplitDecision {
  const { profile } = input;
  const requested = effectiveWeeklySessions(profile);
  const reasons: string[] = [];

  let days = requested;
  let cappedFrom: number | undefined;
  if (
    profile.experience === "beginner" &&
    requested > BEGINNER_START_DAYS &&
    !input.beginnerFourDay
  ) {
    days = BEGINNER_START_DAYS;
    cappedFrom = requested;
    reasons.push(
      `Beginning with ${BEGINNER_START_DAYS} lifting days this block; ${requested} stays available once the routine is established.`,
    );
  }
  if (profile.goal === "athletic" && days > 4) {
    days = 4;
    cappedFrom = requested;
    reasons.push(
      "Athlete schedules use 2–4 lifting days to leave room for practice and competition.",
    );
  }

  const recipe = splitRecipe(profile.experience, days, profile.goal);
  const slots = makeSlots(recipe.families).map((slot, index) => ({ ...slot, index }));

  reasons.push(
    `${profile.experience} · ${days} day${days === 1 ? "" : "s"} per week · ${profile.sessionMinutes} min sessions`,
  );
  if (profile.equipment.length > 0) {
    reasons.push(`Equipment: ${profile.equipment.join(", ").replace(/_/g, " ")}`);
  }

  return {
    splitId: recipe.id,
    splitName: recipe.name,
    days,
    slots,
    explanation: `Your plan uses ${recipe.name} across ${days} day${days === 1 ? "" : "s"} per week.`,
    reasons,
    cappedFrom,
  };
}

// ── Calendar helpers ───────────────────────────────────────────────────────
// Local dates only (the athlete's calendar). UTC timestamps are preserved
// separately on the server; this is for scheduling.

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The date of a given weekday within the week that contains `from` (week starts Monday). */
export function dateForWeekday(weekday: Weekday, from: Date): Date {
  const base = new Date(from);
  // Monday = 0 offset in our week grid.
  const jsDay = base.getDay();
  const mondayOffset = (jsDay + 6) % 7;
  const monday = addDays(base, -mondayOffset);
  const targetOffset = (weekday + 6) % 7;
  return addDays(monday, targetOffset);
}

export interface PlanSession {
  slotIndex: number;
  dayOfWeek: Weekday;
  scheduledDate: string;
  family: SessionFamily;
  variant: "A" | "B";
  templateId: string;
  label: string;
  status: "scheduled" | "completed" | "skipped" | "moved";
  /** Set when the server finalizes the linked canonical activity. */
  completedActivityId?: string | null;
}

/**
 * Choose which available weekdays carry a session. Spreads sessions evenly
 * (never two on the same day) and prefers days the athlete does not practise.
 */
export function assignTrainingDays(
  profile: TrainingProfile,
  days: number,
  from: Date = new Date(),
): Weekday[] {
  const available = [...profile.availableDays].sort((a, b) => a - b);
  if (days >= available.length) return available;

  const practice = new Set(profile.athlete.practiceDays);
  const preferred = available.filter((d) => !practice.has(d));
  const pool = preferred.length >= days ? preferred : available;

  if (days === 1) {
    const mid = pool[Math.floor(pool.length / 2)];
    return [mid];
  }
  const picked: Weekday[] = [];
  for (let i = 0; i < days; i += 1) {
    const idx = Math.round((i * (pool.length - 1)) / (days - 1));
    const day = pool[idx];
    if (!picked.includes(day)) picked.push(day);
  }
  // Fill any collision from remaining available days.
  for (const day of pool) {
    if (picked.length >= days) break;
    if (!picked.includes(day)) picked.push(day);
  }
  void from;
  return picked.sort((a, b) => a - b).slice(0, days);
}

const LOWER_FAMILIES = new Set<SessionFamily>(["lower", "legs"]);

/** Shift or swap a demanding lower-body session away from competition day. */
export function adjustForAthleteSchedule(
  profile: TrainingProfile,
  decision: SplitDecision,
  days: Weekday[],
  from: Date = new Date(),
): { days: Weekday[]; notes: string[] } {
  if (profile.goal !== "athletic" || profile.athlete.competitionDates.length === 0) {
    return { days, notes: [] };
  }
  const competitionDates = new Set(profile.athlete.competitionDates);
  const notes: string[] = [];
  const result = [...days];

  const hasCompetitionWithinBuffer = (day: Weekday): boolean => {
    const sessionDate = toLocalIsoDate(dateForWeekday(day, from));
    for (let b = 0; b <= COMPETITION_LOWER_BODY_BUFFER_DAYS; b += 1) {
      if (competitionDates.has(toLocalIsoDate(addDays(new Date(`${sessionDate}T12:00:00`), b)))) {
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < result.length; i += 1) {
    const slot = decision.slots[i];
    if (!slot || !LOWER_FAMILIES.has(slot.family)) continue;
    if (!hasCompetitionWithinBuffer(result[i])) continue;

    // Prefer a non-lower slot that itself sits clear of the buffer.
    const safeSwap = result.findIndex(
      (day, j) =>
        j !== i &&
        decision.slots[j] &&
        !LOWER_FAMILIES.has(decision.slots[j].family) &&
        !hasCompetitionWithinBuffer(day),
    );
    if (safeSwap >= 0) {
      [result[i], result[safeSwap]] = [result[safeSwap], result[i]];
      notes.push("Moved lower-body work clear of competition day.");
      continue;
    }

    // No fully safe day exists in this week's availability. Move the lower
    // session as far from competition as possible and say so honestly.
    const fallback = result.findIndex(
      (_, j) => j !== i && decision.slots[j] && !LOWER_FAMILIES.has(decision.slots[j].family),
    );
    if (fallback >= 0) {
      [result[i], result[fallback]] = [result[fallback], result[i]];
      notes.push(
        "Lower-body work could not be fully cleared of the competition buffer with these available days.",
      );
    }
  }
  return { days: result, notes };
}

export interface WeeklyPlan {
  policyVersion: string;
  splitId: string;
  splitName: string;
  blockStart: string;
  blockEnd: string;
  sessions: PlanSession[];
  explanation: string;
  reasons: string[];
}

/** Build the current week's ordered plan from a split decision. */
export function buildWeeklyPlan(
  profile: TrainingProfile,
  decision: SplitDecision,
  from: Date = new Date(),
): WeeklyPlan {
  const baseDays = assignTrainingDays(profile, decision.slots.length, from);
  const { days, notes } = adjustForAthleteSchedule(profile, decision, baseDays, from);

  const sessions: PlanSession[] = days.map((day, index) => {
    const slot = decision.slots[index] ?? decision.slots[decision.slots.length - 1];
    return {
      slotIndex: index,
      dayOfWeek: day,
      scheduledDate: toLocalIsoDate(dateForWeekday(day, from)),
      family: slot.family,
      variant: slot.variant,
      templateId: slot.templateId,
      label: slot.label,
      status: "scheduled",
      completedActivityId: null,
    };
  });

  return {
    policyVersion: TRAINING_POLICY_VERSION,
    splitId: decision.splitId,
    splitName: decision.splitName,
    blockStart: toLocalIsoDate(dateForWeekday(1, from)),
    blockEnd: toLocalIsoDate(addDays(dateForWeekday(1, from), PLAN_BLOCK_WEEKS * 7 - 1)),
    sessions,
    explanation: decision.explanation,
    reasons: [...decision.reasons, ...notes],
  };
}

/** Today's (or the next scheduled) session for the Today surface. */
export function currentSession(plan: WeeklyPlan, today: Date = new Date()): PlanSession | null {
  const todayIso = toLocalIsoDate(today);
  const upcoming = plan.sessions.find(
    (s) => s.status === "scheduled" && s.scheduledDate >= todayIso,
  );
  return upcoming ?? plan.sessions.find((s) => s.status === "scheduled") ?? null;
}

/**
 * Reconcile missed sessions: a session dated before today that was never
 * completed rolls forward to the next suitable day — but never stacks two
 * demanding sessions on the same day purely to repair the calendar. Completed
 * sessions are preserved untouched.
 */
export function reconcileMissedSessions(
  profile: TrainingProfile,
  plan: WeeklyPlan,
  today: Date = new Date(),
): { plan: WeeklyPlan; rolledForward: number; notes: string[] } {
  const todayIso = toLocalIsoDate(today);
  const notes: string[] = [];
  const available = [...profile.availableDays].sort((a, b) => a - b);
  const sessions = plan.sessions.map((s) => ({ ...s }));
  let rolledForward = 0;

  const occupied = new Set(
    sessions.filter((s) => s.status !== "skipped").map((s) => s.scheduledDate),
  );

  for (const session of sessions) {
    if (session.status !== "scheduled") continue;
    if (session.scheduledDate >= todayIso) continue;

    // Find the next available day at/after today not already carrying a session.
    let candidate = new Date(today);
    let assigned: Date | null = null;
    for (let i = 0; i < 21; i += 1) {
      if (available.includes(candidate.getDay() as Weekday)) {
        const iso = toLocalIsoDate(candidate);
        if (!occupied.has(iso)) {
          assigned = new Date(candidate);
          break;
        }
      }
      candidate = addDays(candidate, 1);
    }
    if (!assigned) {
      session.status = "skipped";
      notes.push(`Could not reschedule ${session.label}; it stays omitted rather than stacking.`);
      continue;
    }
    occupied.add(toLocalIsoDate(assigned));
    session.status = "moved";
    session.scheduledDate = toLocalIsoDate(assigned);
    session.dayOfWeek = assigned.getDay() as Weekday;
    rolledForward += 1;
  }

  if (rolledForward > 0) {
    notes.push(
      `${rolledForward} missed session${rolledForward === 1 ? "" : "s"} moved forward instead of stacking.`,
    );
  }

  return {
    plan: { ...plan, sessions, reasons: [...plan.reasons, ...notes] },
    rolledForward,
    notes,
  };
}

/**
 * A short, human explanation of the next prescription for a session — never
 * developer jargon ("canonical activity", "RPC"—) and never a fake claim.
 */
export function explainSession(
  plan: WeeklyPlan,
  session: PlanSession,
  targetNote?: string | null,
): string {
  const template = templateForSlot(session.family, session.variant);
  const muscles = template
    ? [...new Set(template.exercises.map((e) => e.muscle))].slice(0, 4).join(" · ")
    : "";
  const base = `${session.label}${template ? ` · ~${template.estimatedMinutes} min` : ""}${
    muscles ? `\n${muscles}` : ""
  }`;
  if (targetNote) return `${base}\n${targetNote}`;
  const reason = plan.reasons[0] ?? "Matches your split and available days.";
  return `${base}\n${reason}`;
}

export { PLAN_BLOCK_WEEKS };
