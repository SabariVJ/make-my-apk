import React, { useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Activity, Brain, Crown, Dumbbell, Lightbulb, Shield, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserStats } from "../types";
import {
  ATTRIBUTE_META,
  ATTRIBUTE_ORDER,
  attributeThresholdProgress,
  buildCharacterMatrix,
  clampStat,
  nextAttributeThreshold,
  type AttributeContribution,
} from "../lib/challengeUI";
import { ATTRIBUTE_COLORS, MOTION, type AttributeKey } from "../lib/designTokens";

/**
 * Character Matrix — SVJ's signature six-axis radar.
 *
 * SVG architecture (viewBox 0 0 400 332):
 *   defs            → per-attribute radial gradients (one per axis color)
 *   #grid           → concentric hexagon rings + spokes (shared stroke)
 *   #previous       → last snapshot ring (only when a real delta exists)
 *   #value          → current six-axis polygon
 *   #nodes          → current-value vertices (per-attribute color)
 *   #axis-labels    → OUTSIDE the plot area in the padded viewBox (no clipping)
 *   #center         → OVR readout (HTML overlay with progressbar semantics)
 *
 * The plot itself is a pure function of the six values, so the polygon only
 * re-renders when data changes; vertex stroke animation runs solely on a
 * real value change (keyed by the value string) and collapses under
 * prefers-reduced-motion.
 */
interface CharacterMatrixProps {
  /** Six attribute values (0–100). */
  stats: UserStats;
  /** Previous snapshot — draws the subtle delta ring when provided. */
  previousStats?: UserStats;
  /** Today's active completion rows (already ledger-derived). */
  contributions?: AttributeContribution[];
  /** Makes each axis a disclosure trigger (default false for static surfaces). */
  interactive?: boolean;
  /** Selected attribute (highlight ring + fills detail drawer). */
  selected?: AttributeKey | null;
  onSelect?: (key: AttributeKey | null) => void;
  className?: string;
}

/* Geometry — pure viewBox coordinates, no hardcoded device pixels. */
const W = 400;
const H = 332;
const CX = W / 2;
const CY = 152;
const MAX_R = 88; // outer grid ring radius
const LABEL_R = MAX_R + 34; // labels live well inside the padded viewBox
const RINGS = [0.25, 0.5, 0.75, 1];
const NODE_R = 5;

const RAD = (deg: number) => (deg * Math.PI) / 180;
const pt = (angleDeg: number, radius: number) => ({
  x: CX + radius * Math.cos(RAD(angleDeg)),
  y: CY + radius * Math.sin(RAD(angleDeg)),
});

/** Top at -90°, clockwise. */
const ANGLES: Record<AttributeKey, number> = {
  physical: -90,
  ambition: -30,
  intellect: 30,
  mental: 90,
  social: 150,
  discipline: 210,
};

/** Lucide glyph per attribute — vector iconography, no emoji. */
const ICONS: Record<AttributeKey, LucideIcon> = {
  physical: Activity,
  discipline: Dumbbell,
  mental: Brain,
  intellect: Lightbulb,
  ambition: Crown,
  social: Users,
};

const pointsFor = (values: Record<AttributeKey, number>, scale: "value" | "prev") =>
  ATTRIBUTE_ORDER.map((key) => {
    const v = clampStat(values[key] ?? 0);
    const r = (v / 100) * MAX_R;
    const p = pt(ANGLES[key], r);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" ");

/** Accessible text equivalent — rendered once alongside the figure. */
function ariaSummary(values: Record<AttributeKey, number>) {
  return ATTRIBUTE_ORDER.map(
    (key) => `${ATTRIBUTE_META[key].label} ${clampStat(values[key] ?? 0)} out of 100`,
  ).join("; ");
}

/** Per-axis label anchor that never clips at the viewBox edges. */
function labelAnchor(
  angleDeg: number,
  radius: number,
): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const p = pt(angleDeg, radius);
  const cos = Math.cos(RAD(angleDeg));
  const anchor: "start" | "middle" | "end" =
    Math.abs(cos) < 0.34 ? "middle" : cos > 0 ? "start" : "end";
  return { x: Math.round(p.x), y: Math.round(p.y), anchor };
}

export const CharacterMatrix: React.FC<CharacterMatrixProps> = ({
  stats,
  previousStats,
  contributions,
  interactive = false,
  selected = null,
  onSelect,
  className = "",
}) => {
  const reduce = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  const [detailKey, setDetailKey] = useState<AttributeKey | null>(selected);

  const model = buildCharacterMatrix({
    stats,
    previousStats,
    contributions,
  });
  const values = Object.fromEntries(model.attributes.map((a) => [a.key, a.value])) as Record<
    AttributeKey,
    number
  >;

  const prevValues = previousStats
    ? (Object.fromEntries(
        ATTRIBUTE_ORDER.map((key) => [key, clampStat(previousStats[key] ?? 0)]),
      ) as Record<AttributeKey, number>)
    : null;

  const hasMeaningfulChange =
    prevValues !== null && ATTRIBUTE_ORDER.some((k) => prevValues[k] !== values[k]);

  const valuePoints = pointsFor(values, "value");
  const prevPoints = prevValues ? pointsFor(prevValues, "prev") : null;
  const ovr = model.ovr;

  const activeKey = interactive ? (selected ?? detailKey) : null;
  const activeDatum = model.attributes.find((a) => a.key === activeKey) ?? null;

  const handleAxis = (key: AttributeKey) => {
    if (!interactive) return;
    setDetailKey(key);
    onSelect?.(key);
  };

  return (
    <div className={`w-full ${className}`}>
      <div
        role="group"
        aria-label="Character Matrix"
        className="relative mx-auto w-full max-w-[340px]"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          aria-labelledby={`${titleId} ${descId}`}
          role="img"
        >
          <title id={titleId}>Character Matrix — six attribute radar</title>
          <desc id={descId}>{ariaSummary(values)}</desc>

          <defs>
            {/* One neutral fill gradient, plus per-attribute tints for the
                selected-detail state. */}
            <radialGradient id="matrix-fill-neutral" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F4F2ED" stopOpacity="0.1" />
              <stop offset="70%" stopColor="#F4F2ED" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#F4F2ED" stopOpacity="0.005" />
            </radialGradient>
            {(Object.keys(ATTRIBUTE_COLORS) as AttributeKey[]).map((key) => (
              <radialGradient key={key} id={`matrix-fill-${key}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={ATTRIBUTE_COLORS[key]} stopOpacity="0.16" />
                <stop offset="70%" stopColor={ATTRIBUTE_COLORS[key]} stopOpacity="0.05" />
                <stop offset="100%" stopColor={ATTRIBUTE_COLORS[key]} stopOpacity="0.01" />
              </radialGradient>
            ))}
          </defs>

          {/* ── Grid: concentric rings + spokes (shared, restful stroke) ── */}
          <g id="grid" stroke="rgba(255,255,255,0.09)" strokeWidth="1" fill="none">
            {RINGS.map((ratio) => {
              const pts = ATTRIBUTE_ORDER.map((key) => {
                const p = pt(ANGLES[key], MAX_R * ratio);
                return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
              }).join(" ");
              return <polygon key={ratio} points={pts} />;
            })}
            {ATTRIBUTE_ORDER.map((key) => {
              const p = pt(ANGLES[key], MAX_R);
              return <line key={key} x1={CX} y1={CY} x2={p.x} y2={p.y} strokeOpacity="0.5" />;
            })}
          </g>

          {/* ── Previous ring (only when a real delta exists) ── */}
          {hasMeaningfulChange && prevPoints && (
            <polygon
              id="previous"
              points={prevPoints}
              fill="none"
              stroke="rgba(244,242,237,0.18)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          )}

          {/* ── Current value polygon (white signal; neutral fill until an
               attribute is selected, then tinted to that axis color) ── */}
          <motion.polygon
            id="value"
            key={hasMeaningfulChange ? valuePoints : "static-value"}
            points={valuePoints}
            fill={activeKey ? `url(#matrix-fill-${activeKey})` : "url(#matrix-fill-neutral)"}
            stroke="rgba(244,242,237,0.85)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            initial={reduce || !hasMeaningfulChange ? false : { opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: MOTION.progress / 1000, ease: "easeOut" }}
          />

          {/* ── Value nodes ── */}
          <g id="nodes">
            {ATTRIBUTE_ORDER.map((key) => {
              const p = pt(ANGLES[key], (clampStat(values[key] ?? 0) / 100) * MAX_R);
              const isActive = activeKey === key;
              return (
                <motion.circle
                  key={key}
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? NODE_R + 2 : NODE_R}
                  fill={isActive ? ATTRIBUTE_COLORS[key] : "#0B0B0C"}
                  stroke={ATTRIBUTE_COLORS[key]}
                  strokeWidth={isActive ? 2.5 : 2}
                  initial={reduce || !hasMeaningfulChange ? false : { strokeWidth: 1.2 }}
                  animate={{ strokeWidth: isActive ? 2.5 : 2 }}
                  transition={{ duration: MOTION.fast / 1000 }}
                  className={interactive ? "cursor-pointer" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? "button" : undefined}
                  aria-label={
                    interactive
                      ? `${ATTRIBUTE_META[key].label}: ${clampStat(values[key] ?? 0)} out of 100`
                      : undefined
                  }
                  onClick={interactive ? () => handleAxis(key) : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAxis(key);
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
          </g>

          {/* ── Axis labels OUTSIDE the plot (padded viewBox → never clipped) ── */}
          <g id="axis-labels" fill="rgba(140,140,144,1)" fontFamily="Inter, system-ui, sans-serif">
            {ATTRIBUTE_ORDER.map((key) => {
              const { x, y, anchor } = labelAnchor(ANGLES[key], LABEL_R);
              const value = clampStat(values[key] ?? 0);
              return (
                <g key={key}>
                  {interactive ? (
                    <text
                      x={x}
                      y={y}
                      textAnchor={anchor}
                      fontSize="12"
                      fontWeight={activeKey === key ? 700 : 500}
                      letterSpacing="0.6"
                      fill={ATTRIBUTE_COLORS[key]}
                      className="cursor-pointer"
                      onClick={() => handleAxis(key)}
                    >
                      {ATTRIBUTE_META[key].label}
                    </text>
                  ) : (
                    <text
                      x={x}
                      y={y}
                      textAnchor={anchor}
                      fontSize="12"
                      fontWeight="500"
                      letterSpacing="0.6"
                      fill={ATTRIBUTE_COLORS[key]}
                    >
                      {ATTRIBUTE_META[key].label}
                    </text>
                  )}
                  <text
                    x={x}
                    y={y + 13}
                    textAnchor={anchor}
                    fontSize="11"
                    fontFamily="'IBM Plex Mono', monospace"
                    fill="rgba(244,242,237,0.9)"
                  >
                    {value}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── Center OVR readout (HTML overlay + progressbar semantics) ── */}
        <div
          className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center justify-center text-center"
          style={{ top: (CY / H) * 100 + "%", transform: "translate(-50%, -50%)" }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ovr}
          aria-label={`Overall rating ${ovr} out of 100`}
        >
          <span className="font-anton text-[26px] leading-none tracking-tight text-white">
            {ovr}
          </span>
          <span className="mt-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#8C8C90]">
            OVR
          </span>
        </div>
      </div>

      {/* ── Detail drawer: only data the matrix actually supports ── */}
      {interactive && activeDatum && (
        <div
          className="mt-3 rounded-xl border bg-svj-surface p-3"
          role="region"
          aria-label={`${activeDatum.label} detail`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white/[0.04]">
                {(() => {
                  const Icon = ICONS[activeDatum.key] ?? Shield;
                  return (
                    <Icon
                      className="h-4 w-4"
                      style={{ color: ATTRIBUTE_COLORS[activeDatum.key] }}
                      aria-hidden="true"
                    />
                  );
                })()}
              </span>
              <div>
                <p className="font-inter text-[13px] font-semibold text-svj-text">
                  {activeDatum.label}
                </p>
                <p className="font-inter text-[10px] uppercase tracking-[0.1em] text-svj-secondary">
                  {ATTRIBUTE_META[activeDatum.key].domain}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-xl font-semibold tabular-nums text-svj-text">
                {activeDatum.value}
              </span>
              <span className="ml-1 text-[10px] text-svj-secondary">/ 100</span>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.05]"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${attributeThresholdProgress(activeDatum.value)}%`,
                  backgroundColor: ATTRIBUTE_COLORS[activeDatum.key],
                }}
              />
            </div>
            <span className="font-mono text-[10px] tabular-nums text-svj-secondary">
              → {nextAttributeThreshold(activeDatum.value)}
            </span>
          </div>

          {activeDatum.contributions.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {activeDatum.contributions.map((line, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 font-inter text-[11px] leading-relaxed text-svj-secondary"
                >
                  <span
                    className="mt-[5px] h-1 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: ATTRIBUTE_COLORS[activeDatum.key] }}
                    aria-hidden="true"
                  />
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 font-inter text-[11px] leading-relaxed text-svj-secondary">
              No recent task data for this attribute yet. Complete challenges matching this domain
              to grow it.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
