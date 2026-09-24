/**
 * SVJ PERFORMANCE OS — completion flash evaluation.
 *
 * Pure, dependency-free level-up math for the challenge completion moment.
 * It decides whether a 500-XP level threshold was REALLY crossed, given a
 * completion event whose before/after totals come from an authoritative
 * source (the reversible ledger for local toggles) and a running baseline.
 *
 * Authority contract:
 *  - Level-up is `level(newTotalXp) > level(previousTotalXp)`, where the
 *    previous total is the event's own real `previousTotalXp` (falling back
 *    to the running baseline). It is NEVER derived from the event's new total
 *    pretending to be the starting point — so even the FIRST completion after
 *    opening Challenges can show a level-up.
 *  - `deferLevelUp: true` (personalized completions, whose RPC returns no
 *    authoritative lifetime total) skips the comparison entirely: no
 *    fabricated level-up, and the baseline is left untouched.
 *  - Nothing here reads or writes user state. This is display math only.
 */
import { levelProgress } from "./xp";
import type { ChallengeCategory } from "../types";

export interface CompletionFlashEvent {
  /** Unique per event — drives AnimatePresence keys. */
  id: string;
  title: string;
  /** Category of the completed challenge (drives attribute attribution). */
  category?: ChallengeCategory;
  /** Server/ledger XP actually awarded for THIS completion. */
  xpAwarded: number;
  /**
   * Real lifetime total BEFORE the completion, or null when the authoritative
   * total is not yet available (personalized completions defer level-up).
   */
  previousTotalXp: number | null;
  /** Real lifetime total AFTER the completion. */
  newTotalXp: number;
  /** True when a previous row's payout was reused (re-completion). */
  reused?: boolean;
  /** True when level-up must be skipped (no authoritative total available). */
  deferLevelUp?: boolean;
}

export interface CompletionFlashEvaluation {
  /** Level of the real previous total (0 when deferred). */
  levelBefore: number;
  /** Level of the real new total (0 when deferred). */
  levelAfter: number;
  /** A real 500-XP threshold was crossed by a real before/after pair. */
  levelUp: boolean;
}

export function evaluateCompletionFlash(
  event: CompletionFlashEvent,
  baseline: number | null,
): { evaluation: CompletionFlashEvaluation; nextBaseline: number | null } {
  const defer = !!event.deferLevelUp;
  const previousTotalXp = event.previousTotalXp ?? baseline ?? event.newTotalXp;

  let levelBefore = 0;
  let levelAfter = 0;
  if (!defer) {
    levelBefore = levelProgress(previousTotalXp).level;
    levelAfter = levelProgress(event.newTotalXp).level;
  }

  return {
    evaluation: {
      levelBefore,
      levelAfter,
      levelUp: !defer && levelAfter > levelBefore,
    },
    // Only structurally real (non-deferred) events advance the baseline.
    nextBaseline: defer ? baseline : event.newTotalXp,
  };
}
