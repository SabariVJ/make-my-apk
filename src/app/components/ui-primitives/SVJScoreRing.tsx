import React from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * SVJ ScoreRing — a circular score/progress gauge.
 *
 * The shared replacement for hand-rolled readiness rings. Animates only when
 * the value changes (state transition), renders instantly under reduced
 * motion, and always exposes progressbar semantics.
 */
export const SVJScoreRing: React.FC<{
  /** 0-100. */
  value: number;
  /** Diameter in px. */
  size?: number;
  /** Stroke width in px. */
  strokeWidth?: number;
  /** Stroke color — pass a token hex (readinessColor, ATTRIBUTE_COLORS…). */
  color?: string;
  /** Track color behind the arc. */
  trackColor?: string;
  /** Center content: big mono number, grade letter, icon. */
  children?: React.ReactNode;
  label?: string;
  className?: string;
}> = ({
  value,
  size = 96,
  strokeWidth = 8,
  color = "#C81E3A",
  trackColor = "rgba(255,255,255,0.08)",
  children,
  label = "Progress",
  className = "",
}) => {
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={label}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          initial={reducedMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      )}
    </div>
  );
};
