/**
 * SVJ PERFORMANCE OS — challenge presentation helpers.
 *
 * Pure, screen-agnostic mapping for the Challenges redesign. These functions
 * only describe how EXISTING challenge data is displayed (state, category
 * colors, matrix view model). No XP math, completion, generation, or reward
 * logic lives here — that stays in the challenge engine / server RPCs and the
 * task-completion ledger, which are untouched.
 */

import { ATTRIBUTE_COLORS, type AttributeKey } from "./designTokens";
import { CHALLENGE_XP } from "./activity";
import type { ChallengeCategory, DailyChallenge, UserStats } from "../types";

/**
 * Server-stat → Character Matrix attribute mapping.
 *
 * This is the relationship the data tables define and the PRE-Phase-2
 * ChallengesView used to build its radar:
 *
 *   physical   ← fitness
 *   discipline ← discipline
 *   mental     ← focus
 *   social     ← social
 *   ambition   ← confidence
 *   intellect  ← consistency
 *
 * A UI redesign must not redefine what the six attributes MEAN, so this map
 * stays authoritative even though it differs from the marketing "domain"
 * label shown on the CharacterMatrix detail drawer.
 */
export const SERVER_STAT_MATRIX_MAP: Record<string, AttributeKey> = {
  fitness: "physical",
  discipline: "discipline",
  focus: "mental",
  social: "social",
  confidence: "ambition",
  consistency: "intellect",
};

/**
 * Visual state of a challenge row. Derived from the exact fields the business
 * logic already produces — no invented "locked"/"failed"/"expired" states:
 *
 *  - available    → plain challenge, ready to complete
 *  - completing   → completion RPC in flight (server-authoritative)
 *  - completed    → completed today, reversible
 *  - locked       → completed on an earlier day (read-only history)
 */
export type ChallengeVisualState = "available" | "completing" | "completed" | "locked";

/**
 * Derive the visual state. `completionLocked` is the view's existing
 * `completionLocked()` predicate (completed + not reversible today).
 */
export function getChallengeVisualState(
  challenge: DailyChallenge,
  pending: boolean,
  completionLocked: boolean,
): ChallengeVisualState {
  if (pending) return "completing";
  if (challenge.completed) return completionLocked ? "locked" : "completed";
  return "available";
}

/**
 * The Character Matrix attribute a challenge category feeds. Derived from the
 * SAME server-stat → attribute relationship the data tables define (see
 * SERVER_STAT_MATRIX_MAP), so the color and the "growing with this challenge"
 * attribution agree with the original radar identity. The challenge engine's
 * 5 coarse stat buckets (Physical/Nutrition → physical, etc.) are used only
 * for balancing daily challenge rows.
 */
export function categoryAttribute(category: ChallengeCategory): AttributeKey {
  switch (category) {
    case "Physical":
      return "physical";
    case "Discipline":
      return "discipline";
    case "Mental":
    case "Mindset":
      return "mental";
    case "Nutrition":
      return "intellect";
  }
}

/** Attribute color for a challenge category — no ad-hoc category colors. */
export function categoryColor(category: ChallengeCategory): string {
  return ATTRIBUTE_COLORS[categoryAttribute(category)];
}

export interface AttributeDatum {
  key: AttributeKey;
  label: string;
  value: number;
  /** Signed change vs the previous snapshot, when one is provided. */
  delta?: number;
  /** Real, ledger-derived contributions. Empty means "nothing recorded". */
  contributions: string[];
}

export interface AttributeContribution {
  /** Row statCategory from the completion ledger (real data). */
  statCategory: AttributeKey;
  statPoints: number;
}

/** All six Character Matrix attributes, in display order. */
export const ATTRIBUTE_META: Record<AttributeKey, { label: string; domain: string }> = {
  physical: { label: "Physical", domain: "Body · Activity" },
  discipline: { label: "Discipline", domain: "Training · Discipline" },
  mental: { label: "Mental", domain: "Recovery · Mind" },
  intellect: { label: "Intellect", domain: "Nutrition · Fuel" },
  ambition: { label: "Ambition", domain: "Progression · XP" },
  social: { label: "Social", domain: "Competition · Community" },
};

/** Canonical attribute order: Physical at top, reading clockwise. */
export const ATTRIBUTE_ORDER: AttributeKey[] = [
  "physical",
  "ambition",
  "intellect",
  "mental",
  "social",
  "discipline",
];

/** Clamp a raw stat value into the 0–100 matrix domain. */
export function clampStat(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** OVR = mean of the six attributes (existing identity, kept). */
export function attributeOvr(stats: Record<AttributeKey, number>): number {
  return Math.round(ATTRIBUTE_ORDER.reduce((sum, key) => sum + stats[key], 0) / 6);
}

export interface CharacterMatrixInput {
  /** Current attribute values (0–100 per attribute). */
  stats: UserStats;
  /**
   * Previous snapshot used to draw the subtle "previous ring" and per-attribute
   * deltas. Optional — when absent only current values render (no invented
   * provenance).
   */
  previousStats?: UserStats;
  /**
   * Today's active completion rows (already ledger-derived). Contribution copy
   * is built ONLY from these real rows.
   */
  contributions?: AttributeContribution[];
}

export interface CharacterMatrixModel {
  attributes: AttributeDatum[];
  ovr: number;
}

/** Build the matrix view model (clamped values + real evidence only). */
export function buildCharacterMatrix(input: CharacterMatrixInput): CharacterMatrixModel {
  const contributionTotals = new Map<AttributeKey, number>();
  for (const row of input.contributions ?? []) {
    if (!row || !Number.isFinite(row.statPoints)) continue;
    contributionTotals.set(
      row.statCategory,
      (contributionTotals.get(row.statCategory) ?? 0) + Math.max(0, row.statPoints),
    );
  }

  const attributes: AttributeDatum[] = ATTRIBUTE_ORDER.map((key) => {
    const value = clampStat(input.stats[key] ?? 0);
    const prev = input.previousStats ? clampStat(input.previousStats[key] ?? 0) : undefined;
    const contributions: string[] = [];
    if (prev !== undefined && prev !== value) {
      contributions.push(
        prev < value
          ? `Up ${value - prev} vs last snapshot`
          : `Down ${prev - value} vs last snapshot`,
      );
    }
    const points = contributionTotals.get(key) ?? 0;
    if (points > 0) {
      contributions.push(`+${points} from tasks completed today`);
    }
    return {
      key,
      label: ATTRIBUTE_META[key].label,
      value,
      delta: prev === undefined ? undefined : value - prev,
      contributions,
    };
  });

  const statsMap = Object.fromEntries(attributes.map((a) => [a.key, a.value])) as Record<
    AttributeKey,
    number
  >;

  return { attributes, ovr: attributeOvr(statsMap) };
}

/** The next meaningful threshold band (next multiple of 10) for an attribute. */
export function nextAttributeThreshold(value: number): number {
  return Math.min(100, Math.ceil(clampStat(value) / 10) * 10);
}

/** Progress (0–100) into the current 10-point threshold band. */
export function attributeThresholdProgress(value: number): number {
  const v = clampStat(value);
  const floor = Math.floor(v / 10) * 10;
  return v >= 100 ? 100 : ((v - floor) / 10) * 100;
}

/**
 * Difficulty meta for a challenge row — bounded, one row high, no pill pile.
 * Easy/Medium/Hard/Elite only, per `ChallengeDifficulty`.
 */
export function difficultyMeta(difficulty: DailyChallenge["difficulty"]): {
  label: string;
  text: string;
  tile: string;
} {
  switch (difficulty) {
    case "Easy":
      return {
        label: "Easy",
        text: "text-state-positive",
        tile: "border-state-positive/20 bg-state-positive/10",
      };
    case "Medium":
      return {
        label: "Medium",
        text: "text-gold",
        tile: "border-gold/20 bg-gold/10",
      };
    case "Hard":
      return {
        label: "Hard",
        text: "text-attr-discipline",
        tile: "border-attr-discipline/20 bg-attr-discipline/10",
      };
    case "Elite":
      return {
        label: "Elite",
        text: "text-attr-ambition",
        tile: "border-attr-ambition/20 bg-attr-ambition/10",
      };
  }
}

/** Nominal XP for a difficulty tier — display only (payouts stay ledger/RPC). */
export function difficultyNominalXp(difficulty: DailyChallenge["difficulty"]): number {
  return CHALLENGE_XP[difficulty] ?? 0;
}
