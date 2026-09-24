import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { evaluateCompletionFlash, type CompletionFlashEvent } from "../lib/completionFlash";
import { ATTRIBUTE_META, categoryAttribute } from "../lib/challengeUI";
import { ATTRIBUTE_COLORS } from "../lib/designTokens";
import type { ChallengeCategory } from "../types";

/**
 * Signature challenge-completion moment.
 *
 * One concise, non-blocking banner (NOT a modal): check transition, +XP delta,
 * and — only when a real 500-XP level threshold was crossed — a brief
 * "level up" treatment. Total motion stays under ~2s and is auto-dismissed.
 *
 * Authority contract (see src/app/lib/completionFlash.ts):
 *  - Level-up compares the level of a REAL previous total with the level of a
 *    REAL new total, supplied by the caller (ledger-confirmed for local
 *    toggles) — never relative to this banner's own first event.
 *  - Personalized completions pass `previousTotalXp: null` + `deferLevelUp:
 *    true`: the server RPC returns no authoritative lifetime total, so the
 *    banner shows the awarded XP WITHOUT fabricating a level-up.
 *  - XP is NEVER mutated here.
 */

/** Re-exported for callers that build completion events (single contract). */
export type { CompletionFlashEvent };

interface CompletionFlash extends CompletionFlashEvent {
  /** Level of the real previous total (0 when deferred). */
  levelBefore: number;
  /** Level of the real new total. */
  levelAfter: number;
  /** A real 500-XP threshold was crossed (never for deferred events). */
  levelUp: boolean;
}

interface InternalFlash extends CompletionFlash {
  key: string;
}

const BANNER_MS = 2200;

export interface ChallengeCompletionController {
  /** Show a concise completion banner fed with authoritative figures. */
  display: (event: CompletionFlashEvent) => void;
}

/**
 * Stateful controller for the completion moment. Because several flows
 * (local toggle, personalized RPC) can complete challenges, this hook owns a
 * small FIFO so fast successive completions never stack banners on top of
 * each other.
 *
 * The previous-total baseline updates from each real event, so even the FIRST
 * completion after opening Challenges correctly shows a level-up when its own
 * previousTotalXp vs newTotalXp crosses a threshold. A personalized event
 * without an authoritative total never updates the baseline (nothing real to
 * compare against) and never shows a level-up.
 */
export function useChallengeCompletion(): ChallengeCompletionController & {
  active: InternalFlash | null;
  clear: () => void;
} {
  const [active, setActive] = useState<InternalFlash | null>(null);
  const queueRef = useRef<InternalFlash[]>([]);
  const timerRef = useRef<number | null>(null);
  const baselineRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setTimeout(() => {
      setActive(null);
      const next = queueRef.current.shift();
      if (next) {
        setActive(next);
        startTimer();
      }
    }, BANNER_MS);
  }, [stopTimer]);

  const clear = useCallback(() => {
    stopTimer();
    queueRef.current = [];
    baselineRef.current = null;
    setActive(null);
  }, [stopTimer]);

  const display = useCallback(
    (event: CompletionFlashEvent) => {
      const { evaluation, nextBaseline } = evaluateCompletionFlash(event, baselineRef.current);
      const flash: InternalFlash = {
        ...event,
        key: event.id,
        ...evaluation,
      };

      // Advance the real baseline to the new authoritative total (a deferred
      // personalized event leaves the baseline untouched — nothing real to
      // compare against).
      baselineRef.current = nextBaseline;

      if (active || queueRef.current.length > 0) {
        queueRef.current.push(flash);
      } else {
        setActive(flash);
        startTimer();
      }
    },
    [active, startTimer],
  );

  // Clean up on unmount.
  useEffect(() => () => stopTimer(), [stopTimer]);

  return { display, active, clear };
}

export const ChallengeCompletionBanner: React.FC<{
  flash: InternalFlash | null;
}> = ({ flash }) => {
  const reduce = useReducedMotion();
  const levelUp = flash !== null && flash.levelUp;
  // Attribute attribution uses the category's canonical matrix attribute —
  // determined by business logic, never invented client-side.
  const attributed = flash && flash.category ? categoryAttribute(flash.category) : null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 left-1/2 z-40 w-[min(92vw,360px)] -translate-x-1/2"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {flash && (
          <motion.div
            key={flash.key}
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
            className={`overflow-hidden rounded-2xl border bg-svj-surface-raised shadow-svj-3 ${
              levelUp ? "border-gold/40" : "border-svj-crimson/30"
            }`}
            data-testid="completion-banner"
          >
            <div className="flex items-start gap-3 p-3.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                  levelUp
                    ? "border-gold/30 bg-gold/10 text-gold"
                    : "border-svj-crimson/30 bg-svj-crimson/10 text-svj-crimson"
                }`}
              >
                <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-inter text-[10px] font-bold uppercase tracking-[0.14em] text-svj-secondary">
                  {flash.reused ? "Completed again" : "Mission complete"}
                </p>
                <p className="truncate font-inter text-sm font-semibold text-svj-text">
                  {flash.title}
                </p>

                {levelUp && (
                  <p
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide text-gold"
                    data-testid="level-up-treatment"
                  >
                    Level up — {flash.levelAfter}
                  </p>
                )}

                {attributed && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-svj-text">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: ATTRIBUTE_COLORS[attributed] }}
                        aria-hidden="true"
                      />
                      {ATTRIBUTE_META[attributed].label} growing with this challenge
                    </span>
                  </div>
                )}
              </div>

              <span className="shrink-0 font-mono text-base font-bold tabular-nums text-svj-crimson">
                +{flash.xpAwarded}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
