import React, { useEffect, useState } from "react";

export type ScoreTone =
  | "crimson"
  | "premium"
  | "physical"
  | "ambition"
  | "intellect"
  | "mental"
  | "social"
  | "discipline";

/**
 * SVJ ScoreRing — THE single visual treatment for "a value out of a maximum".
 *
 * Every place the app shows a score/percentage (recovery readiness, step-goal
 * progress, calorie goal, XP goals, training attendance) renders this instead
 * of a bespoke ring, a bare digit, or a plain bar. Keeping one component means
 * the pattern can never drift into three different looks again.
 *
 * Honest by default: when `value` is null the ring renders a dashed empty track
 * labelled "No data" rather than a 0 that would read as a real measurement.
 */
export const SVJScoreRing: React.FC<{
  /** 0 – `max`. Pass `null` when there is genuinely no data yet. */
  value: number | null;
  max?: number;
  /** Large numeral in the middle. Defaults to the rounded value. */
  display?: string;
  /** Small caption under the numeral (e.g. "Readiness", "Steps"). */
  label: string;
  /** Secondary line under the ring. */
  sublabel?: string;
  size?: number;
  thickness?: number;
  tone?: ScoreTone;
  className?: string;
}> = ({
  value,
  max = 100,
  display,
  label,
  sublabel,
  size = 168,
  thickness = 12,
  tone = "crimson",
  className = "",
}) => {
  const tones: Record<ScoreTone, string> = {
    crimson: "#C81E3A",
    premium: "#C9A227",
    physical: "#10B981",
    ambition: "#A855F7",
    intellect: "#F59E0B",
    mental: "#EAB308",
    social: "#3B82F6",
    discipline: "#F43F5E",
  };
  const color = tones[tone];
  const hasData = value !== null && Number.isFinite(value);
  const safeMax = max > 0 ? max : 100;
  const ratio = hasData ? Math.max(0, Math.min(1, (value as number) / safeMax)) : 0;

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const center = size / 2;

  // Animate the arc with a CSS transition rather than a runtime animation
  // library: it stays on the compositor, needs no SVG globals, and the global
  // prefers-reduced-motion rule already collapses the duration.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    // setTimeout (not rAF) so this also works in test/JSDOM-style environments.
    const id = window.setTimeout(() => setDrawn(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  const numeral = hasData ? (display ?? String(Math.round(value as number))) : "—";

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={
            hasData ? `${label}: ${numeral} out of ${safeMax}` : `${label}: no data recorded yet`
          }
          className="-rotate-90"
        >
          <defs>
            <linearGradient id={`svj-ring-${tone}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Track — a sunken well, not a flat line. */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.055)"
            strokeWidth={thickness}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={Math.max(1, thickness - 6)}
          />

          {hasData ? (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={`url(#svj-ring-${tone})`}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={drawn ? dashOffset : circumference}
              style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)" }}
            />
          ) : (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray="2 8"
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-anton leading-none tracking-tight text-[#F4F2ED]"
            style={{ fontSize: Math.round(size * 0.26) }}
          >
            {numeral}
          </span>
          <span className="mt-1 max-w-[80%] text-center text-[10px] font-inter font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
            {label}
          </span>
        </div>
      </div>

      {sublabel && (
        <p className="mt-2 max-w-[220px] text-center text-[11px] font-inter leading-relaxed text-[#8C8C90]">
          {sublabel}
        </p>
      )}
    </div>
  );
};
