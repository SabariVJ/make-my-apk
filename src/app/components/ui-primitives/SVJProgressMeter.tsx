import React from "react";
import { motion, useReducedMotion } from "motion/react";

const TONES: Record<string, string> = {
  crimson: "#C81E3A",
  gold: "#D4AF37",
  positive: "#34D399",
  warning: "#EAB308",
  caution: "#FB923C",
  critical: "#F87171",
  info: "#60A5FA",
  physical: "#10B981",
  ambition: "#A855F7",
  intellect: "#F59E0B",
  mental: "#EAB308",
  social: "#3B82F6",
  discipline: "#F43F5E",
};

/**
 * SVJ ProgressMeter — labeled linear meter with a monospace readout.
 *
 * Richer than SVJProgress (which stays for existing screens): header row with
 * label + value, tone mapped through the design-token palette, width-only
 * animation, reduced-motion safe.
 */
export const SVJProgressMeter: React.FC<{
  label?: string;
  value: number;
  max?: number;
  /** Displayed readout; defaults to "value/max" (or % when max=100). */
  readout?: string;
  tone?: keyof typeof TONES;
  height?: number;
  className?: string;
}> = ({ label, value, max = 100, readout, tone = "crimson", height = 6, className = "" }) => {
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(max, value));
  const pct = max > 0 ? (clamped / max) * 100 : 0;
  const text = readout ?? (max === 100 ? `${Math.round(pct)}%` : `${clamped}/${max}`);
  const color = TONES[tone] ?? TONES.crimson;

  return (
    <div className={className}>
      {(label || readout !== undefined) && (
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          {label && <span className="svj-label-xs uppercase tracking-[0.12em]">{label}</span>}
          <span className="font-mono text-[11px] text-svj-text tabular-nums">{text}</span>
        </div>
      )}
      <div
        className="w-full rounded-full bg-white/[0.04] overflow-hidden"
        style={{ height }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(clamped)}
        aria-label={label}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
};
