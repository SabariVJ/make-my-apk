// ============================================================================
// 60-Day program progress summary.
//
// Pure, network-free helper shared by the Challenges card (and its tests).
// Every number is DERIVED from the real program definition and the real
// server-reported progress — nothing here invents progress the athlete has not
// actually earned. The card must never claim a day or mission that is not in
// the authoritative ChallengeState.
// ============================================================================

import { CHALLENGE_DAYS } from "./challengeDays";

/** Real mission count across the whole program (days carry a variable number). */
export const TOTAL_MISSIONS: number = CHALLENGE_DAYS.reduce(
  (total, day) => total + day.tasks.length,
  0,
);

/** Missions belonging to the first `days` days (days unlock sequentially). */
export function missionsForDays(days: number): number {
  const safe = Number.isFinite(days) ? Math.max(0, Math.min(days, CHALLENGE_DAYS.length)) : 0;
  return CHALLENGE_DAYS.filter((day) => day.day <= safe).reduce(
    (total, day) => total + day.tasks.length,
    0,
  );
}

export type ChallengeProgramStatus = "not_started" | "active" | "paused" | "completed";

/** The subset of the server's ChallengeState this summary actually needs. */
export interface ChallengeProgressInput {
  status: ChallengeProgramStatus;
  currentDay: number;
  daysCompleted: number;
  currentStreak: number;
}

export interface SixtyDayProgramSummary {
  status: ChallengeProgramStatus;
  /** Day the athlete is working on now (1..60). */
  currentDay: number;
  daysCompleted: number;
  totalDays: number;
  missionsCompleted: number;
  totalMissions: number;
  currentStreak: number;
  /** Whole-percent completion of the program, clamped to 0..100. */
  percent: number;
}

/**
 * Summarises real program progress. A missing/unknown state resolves to a
 * not-started program rather than a fabricated in-progress one.
 */
export function summarizeSixtyDayProgram(
  state: ChallengeProgressInput | null | undefined,
): SixtyDayProgramSummary {
  const totalDays = CHALLENGE_DAYS.length;
  if (!state) {
    return {
      status: "not_started",
      currentDay: 1,
      daysCompleted: 0,
      totalDays,
      missionsCompleted: 0,
      totalMissions: TOTAL_MISSIONS,
      currentStreak: 0,
      percent: 0,
    };
  }

  const daysCompleted = Number.isFinite(state.daysCompleted)
    ? Math.max(0, Math.min(Math.round(state.daysCompleted), totalDays))
    : 0;
  const currentDay = Number.isFinite(state.currentDay)
    ? Math.max(1, Math.min(Math.round(state.currentDay), totalDays))
    : Math.min(daysCompleted + 1, totalDays);
  const currentStreak = Number.isFinite(state.currentStreak)
    ? Math.max(0, Math.round(state.currentStreak))
    : 0;

  // "completed" is the server's own verdict — never inferred from progress.
  const status: ChallengeProgramStatus = state.status;

  return {
    status,
    currentDay,
    daysCompleted,
    totalDays,
    missionsCompleted: missionsForDays(daysCompleted),
    totalMissions: TOTAL_MISSIONS,
    currentStreak,
    percent: Math.max(0, Math.min(100, Math.round((daysCompleted / totalDays) * 100))),
  };
}
