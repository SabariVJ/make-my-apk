/**
 * SVJ PERFORMANCE OS — XP / level presentation math.
 *
 * Pure, dependency-free helpers for rendering XP as a journey toward the next
 * level. Presentation only: nothing in here reads or writes user state — the
 * authoritative XP number always comes from the ledger / server.
 */

/** The 500 XP band a level occupies (matches applyActivityXp / profile level). */
export const XP_PER_LEVEL = 500;

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated within the current level's band (0..XP_PER_LEVEL). */
  levelXp: number;
  /** Absolute lifetime XP threshold for the NEXT level. */
  nextLevelXp: number;
  /** Progress through the current band, 0–100. */
  pct: number;
  /** XP remaining until the next level. */
  remaining: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const xp = nonNegative(totalXp);
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelStart = (level - 1) * XP_PER_LEVEL;
  const levelXp = xp - levelStart;
  const pct = Math.max(0, Math.min(100, Math.round((levelXp / XP_PER_LEVEL) * 100)));
  return {
    level,
    levelXp,
    nextLevelXp: levelStart + XP_PER_LEVEL,
    pct,
    remaining: Math.max(0, levelStart + XP_PER_LEVEL - xp),
  };
}
