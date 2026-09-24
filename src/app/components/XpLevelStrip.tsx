import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Zap } from "lucide-react";
import { getTierForXP } from "../lib/activity";
import { MOTION } from "../lib/designTokens";

/**
 * XpLevelStrip — one premium XP / level progression treatment.
 *
 * The single place XP is presented as a journey toward the next level: total
 * (mono), tier name, and a meter that spans the CURRENT level's XP band.
 * Totals render instantly; the meter animates transform/width only, once per
 * real value change, and settles instantly under prefers-reduced-motion.
 * This is READ-ONLY: XP itself is never mutated here.
 */

/** The 500 XP band a level occupies (matches applyActivityXp / profile level). */
export const XP_PER_LEVEL = 500;

export function levelProgress(totalXp: number): {
  level: number;
  levelXp: number;
  nextLevelXp: number;
  pct: number;
  remaining: number;
} {
  const level = Math.max(1, Math.floor(nonNegative(totalXp) / XP_PER_LEVEL) + 1);
  const levelStart = (level - 1) * XP_PER_LEVEL;
  const levelXp = nonNegative(totalXp) - levelStart;
  const pct = Math.max(0, Math.min(100, Math.round((levelXp / XP_PER_LEVEL) * 100)));
  return {
    level,
    levelXp,
    nextLevelXp: levelStart + XP_PER_LEVEL,
    pct,
    remaining: Math.max(0, levelStart + XP_PER_LEVEL - nonNegative(totalXp)),
  };
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export const XpLevelStrip: React.FC<{
  totalXp: number;
  /** Today's XP readout ("+120") — display only, authoritative total stays totalXp. */
  todayXp?: number;
  level?: number;
  className?: string;
}> = ({ totalXp, todayXp, level, className = "" }) => {
  const reduce = useReducedMotion();
  const prog = levelProgress(totalXp);
  const tier = getTierForXP(totalXp);
  const displayLevel = level ?? prog.level;

  const [width, setWidth] = useState(reduce ? prog.pct : 0);
  const prevPct = useRef(prog.pct);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      setWidth(reduce ? prog.pct : prog.pct);
      return;
    }
    if (reduce) {
      setWidth(prog.pct);
      return;
    }
    // Only animate when the value actually changed (never on unrelated renders).
    const previous = prevPct.current;
    prevPct.current = prog.pct;
    if (previous === prog.pct) return;
    setWidth(0);
    const id = window.setTimeout(() => setWidth(prog.pct), MOTION.fast);
    return () => window.clearTimeout(id);
  }, [prog.pct, reduce]);

  return (
    <div className={className} data-testid="xp-level-strip">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-anton text-xs uppercase tracking-wider text-svj-text">
            Level {displayLevel}
          </span>
          <span className="truncate rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-px font-inter text-[10px] font-semibold uppercase tracking-wide text-svj-secondary">
            {tier}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums text-svj-secondary">
          <Zap className="h-3.5 w-3.5 text-svj-crimson" aria-hidden="true" />
          {prog.levelXp.toLocaleString()}
          <span className="text-svj-muted">/ {prog.nextLevelXp.toLocaleString()}</span>
          {typeof todayXp === "number" && (
            <span className="font-mono text-[11px] font-semibold tabular-nums text-svj-crimson">
              +{todayXp} today
            </span>
          )}
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={XP_PER_LEVEL}
        aria-valuenow={prog.levelXp}
        aria-label={`Level ${displayLevel} progress`}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]"
        data-testid="xp-level-meter"
        data-remaining={prog.remaining}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-svj-crimson-hover to-svj-crimson transition-[width] ease-out"
          style={{
            width: `${width}%`,
            transitionDuration: reduce ? "0ms" : `${MOTION.progress}ms`,
          }}
        />
      </div>

      <p className="mt-1.5 font-inter text-[10px] leading-relaxed text-svj-muted">
        {prog.remaining > 0
          ? `${prog.remaining.toLocaleString()} XP to Level ${displayLevel + 1}`
          : `Level ${displayLevel} reached`}
      </p>
    </div>
  );
};
