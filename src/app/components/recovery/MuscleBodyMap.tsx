import React from "react";

export type MuscleMapState = "fresh" | "moderate" | "high" | "no_recent_data";

/**
 * Estimated muscle recovery, drawn.
 *
 * The Muscle Coverage content was always asking for a diagram — eleven rows of
 * "No logged training · 0 direct · 0 supporting" carry no hierarchy at all. The
 * silhouette shows which regions were trained recently and which are recovered.
 *
 * Honesty rules:
 *  - "no recent data" is a distinct, neutral treatment (dim + outline), never
 *    painted as if it were a low value.
 *  - The map is a summary of logged training, not a physiological or sensor
 *    measurement; the caption and the caller's text list say so.
 *
 * The visual is aria-hidden and each caller renders the accessible text list
 * alongside it, so nothing here is the only way to get the information.
 */
const STATE_FILL: Record<MuscleMapState, string> = {
  high: "#F43F5E",
  moderate: "#EAB308",
  fresh: "#10B981",
  no_recent_data: "#2A2A31",
};

const STATE_OPACITY: Record<MuscleMapState, number> = {
  high: 0.92,
  moderate: 0.8,
  fresh: 0.72,
  no_recent_data: 0.55,
};

/** Regions per view, keyed to the strength MUSCLE_GROUPS taxonomy. */
type Region = {
  muscle: string;
  /** Simple shape drawn inside the figure's coordinate space. */
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
};

const FRONT_REGIONS: Region[] = [
  { muscle: "shoulders", x: 22, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "shoulders", x: 82, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "chest", x: 40, y: 44, w: 40, h: 22, r: 9 },
  { muscle: "biceps", x: 20, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "biceps", x: 86, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "core", x: 42, y: 70, w: 36, h: 30, r: 8 },
  { muscle: "quads", x: 42, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "quads", x: 61, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "calves", x: 44, y: 160, w: 13, h: 34, r: 6 },
  { muscle: "calves", x: 63, y: 160, w: 13, h: 34, r: 6 },
];

const BACK_REGIONS: Region[] = [
  { muscle: "shoulders", x: 22, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "shoulders", x: 82, y: 44, w: 16, h: 14, r: 7 },
  { muscle: "back", x: 40, y: 44, w: 40, h: 24, r: 9 },
  { muscle: "triceps", x: 20, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "triceps", x: 86, y: 62, w: 14, h: 26, r: 6 },
  { muscle: "back", x: 42, y: 70, w: 36, h: 14, r: 6 },
  { muscle: "glutes", x: 42, y: 88, w: 36, h: 18, r: 8 },
  { muscle: "hamstrings", x: 42, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "hamstrings", x: 61, y: 108, w: 17, h: 46, r: 8 },
  { muscle: "calves", x: 44, y: 160, w: 13, h: 34, r: 6 },
  { muscle: "calves", x: 63, y: 160, w: 13, h: 34, r: 6 },
];

const Figure: React.FC<{
  label: string;
  regions: Region[];
  stateFor: (muscle: string) => MuscleMapState | null;
}> = ({ label, regions, stateFor }) => (
  <div className="flex flex-col items-center gap-1.5">
    <svg
      viewBox="0 0 120 200"
      className="h-44 w-auto"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* Silhouette base — a dim outline so untrained regions still read as body */}
      <g fill="#1B1B20" stroke="rgba(255,255,255,0.07)" strokeWidth="1">
        <circle cx="60" cy="16" r="12" />
        <rect x="38" y="32" width="44" height="52" rx="13" />
        <rect x="40" y="84" width="40" height="22" rx="9" />
        <rect x="42" y="106" width="17" height="48" rx="8" />
        <rect x="61" y="106" width="17" height="48" rx="8" />
        <rect x="44" y="158" width="13" height="36" rx="6" />
        <rect x="63" y="158" width="13" height="36" rx="6" />
        <rect x="20" y="40" width="14" height="50" rx="7" />
        <rect x="86" y="40" width="14" height="50" rx="7" />
      </g>

      {regions.map((region, index) => {
        const state = stateFor(region.muscle);
        const fill = state ? STATE_FILL[state] : "#24242B";
        const opacity = state ? STATE_OPACITY[state] : 0.9;
        return (
          <rect
            key={`${region.muscle}-${index}`}
            x={region.x}
            y={region.y}
            width={region.w}
            height={region.h}
            rx={region.r ?? 6}
            fill={fill}
            opacity={opacity}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1"
          />
        );
      })}
    </svg>
    <span className="font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
      {label}
    </span>
  </div>
);

export const MuscleBodyMap: React.FC<{
  entries: { muscle: string; label: string; state: MuscleMapState }[];
  className?: string;
}> = ({ entries, className = "" }) => {
  const byMuscle = new Map(entries.map((entry) => [entry.muscle, entry.state]));
  const stateFor = (muscle: string): MuscleMapState | null => byMuscle.get(muscle) ?? null;

  const drawsOnBody = new Set([...FRONT_REGIONS, ...BACK_REGIONS].map((r) => r.muscle));
  const offBody = entries.filter((entry) => !drawsOnBody.has(entry.muscle));

  const legend: { state: MuscleMapState; text: string }[] = [
    { state: "high", text: "Trained recently" },
    { state: "moderate", text: "Still recovering" },
    { state: "fresh", text: "Recovered" },
    { state: "no_recent_data", text: "No logged training" },
  ];

  return (
    <div className={className}>
      <div className="flex items-start justify-center gap-4 sm:gap-8">
        <Figure label="Front" regions={FRONT_REGIONS} stateFor={stateFor} />
        <Figure label="Back" regions={BACK_REGIONS} stateFor={stateFor} />
      </div>

      {offBody.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {offBody.map((entry) => (
            <span
              key={entry.muscle}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 font-inter text-[10px] text-[#8C8C90]"
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: STATE_FILL[entry.state] }}
              />
              {entry.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {legend.map((item) => (
          <span
            key={item.state}
            className="inline-flex items-center gap-1.5 font-inter text-[10px] text-[#8C8C90]"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: STATE_FILL[item.state] }}
            />
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
};

export default MuscleBodyMap;
