import React from "react";
import { motion } from "motion/react";
import {
  Dumbbell,
  Brain,
  Users,
  BookOpen,
  Flame,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { UserStats } from "../types";

interface HexagonRadarChartProps {
  stats: UserStats;
  level?: number;
  className?: string;
  onStatClick?: (statKey: keyof UserStats) => void;
}

export const HexagonRadarChart: React.FC<HexagonRadarChartProps> = ({
  stats,
  level = 1,
  className = "",
  onStatClick,
}) => {
  // Ensure default fallback values for each attribute
  const safeStats = {
    physical: Math.min(100, Math.max(0, stats?.physical ?? 12)),
    ambition: Math.min(100, Math.max(0, stats?.ambition ?? 20)),
    intellect: Math.min(100, Math.max(0, stats?.intellect ?? 12)),
    mental: Math.min(100, Math.max(0, stats?.mental ?? 14)),
    social: Math.min(100, Math.max(0, stats?.social ?? 10)),
    discipline: Math.min(100, Math.max(0, stats?.discipline ?? 15)),
  };

  // Calculate Overall Rating (OVR)
  const ovrRating = Math.round(
    (safeStats.physical +
      safeStats.ambition +
      safeStats.intellect +
      safeStats.mental +
      safeStats.social +
      safeStats.discipline) /
      6,
  );

  // 6 dimensions configuration arranged clockwise starting from Top (Physical)
  const dimensions: {
    key: keyof UserStats;
    label: string;
    angle: number; // in degrees: -90 is Top
    color: string;
    hexColor: string;
    bgGlow: string;
    icon: string;
  }[] = [
    {
      key: "physical",
      label: "Physical",
      angle: -90, // Top
      color: "text-emerald-400",
      hexColor: "#10B981",
      bgGlow: "rgba(16,185,129,0.15)",
      icon: "💪",
    },
    {
      key: "ambition",
      label: "Ambition",
      angle: -30, // Top Right
      color: "text-purple-400",
      hexColor: "#A855F7",
      bgGlow: "rgba(168,85,247,0.15)",
      icon: "👑",
    },
    {
      key: "intellect",
      label: "Intellect",
      angle: 30, // Bottom Right
      color: "text-amber-400",
      hexColor: "#F59E0B",
      bgGlow: "rgba(245,158,11,0.15)",
      icon: "📖",
    },
    {
      key: "mental",
      label: "Mental",
      angle: 90, // Bottom
      color: "text-yellow-400",
      hexColor: "#EAB308",
      bgGlow: "rgba(234,179,8,0.15)",
      icon: "🧠",
    },
    {
      key: "social",
      label: "Social",
      angle: 150, // Bottom Left
      color: "text-blue-400",
      hexColor: "#3B82F6",
      bgGlow: "rgba(59,130,246,0.15)",
      icon: "👥",
    },
    {
      key: "discipline",
      label: "Discipline",
      angle: 210, // Top Left
      color: "text-rose-500",
      hexColor: "#F43F5E",
      bgGlow: "rgba(244,63,94,0.15)",
      icon: "⚔️",
    },
  ];

  // SVG Geometry Constants
  const size = 320;
  const center = size / 2;
  const maxRadius = 112; // Max radius for 100 stat value
  const minRadius = 46; // Safe min radius so dots never overlap central OVR badge (box size ~35px radius)

  // Helper function to get XY coordinates from angle and distance
  const getCoordinates = (angleInDegrees: number, valueRadius: number) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180;
    const x = center + valueRadius * Math.cos(angleInRadians);
    const y = center + valueRadius * Math.sin(angleInRadians);
    return { x, y };
  };

  // Generate concentric hexagon grid lines (25%, 50%, 75%, 100%)
  const gridRings = [0.25, 0.5, 0.75, 1.0];
  const gridHexagons = gridRings.map((ringRatio) => {
    const r = minRadius + ringRatio * (maxRadius - minRadius);
    const points = dimensions
      .map((d) => {
        const { x, y } = getCoordinates(d.angle, r);
        return `${x},${y}`;
      })
      .join(" ");
    return { points, ratio: ringRatio };
  });

  // Calculate actual user stat polygon points
  const userPolygonPoints = dimensions
    .map((d) => {
      const val = safeStats[d.key];
      const effectiveRadius = minRadius + (val / 100) * (maxRadius - minRadius);
      const { x, y } = getCoordinates(d.angle, effectiveRadius);
      return `${x},${y}`;
    })
    .join(" ");

  // Coordinates for vertex dots
  const vertexPoints = dimensions.map((d) => {
    const val = safeStats[d.key];
    const effectiveRadius = minRadius + (val / 100) * (maxRadius - minRadius);
    const coords = getCoordinates(d.angle, effectiveRadius);
    return { ...coords, ...d, val };
  });

  // Coordinates for outer labels
  const labelPoints = dimensions.map((d) => {
    const labelRadius = maxRadius + 24;
    const coords = getCoordinates(d.angle, labelRadius);
    return { ...coords, ...d };
  });

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Hexagon Radar Chart Canvas */}
      <div className="relative w-full max-w-[340px] aspect-square flex items-center justify-center select-none">
        {/* Ambient Backlight Glow */}
        <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-[#C81E3A]/20 via-purple-600/10 to-blue-600/20 blur-2xl pointer-events-none" />

        {/* SVG Hexagon System */}
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.08)] overflow-visible"
        >
          <defs>
            {/* Dynamic Polygon Gradient */}
            <radialGradient id="radarFillGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#C81E3A" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#17171A" stopOpacity="0.1" />
            </radialGradient>

            {/* Glowing Hexagon Line Filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Concentric Web Grid Lines */}
          {gridHexagons.map((ring, idx) => (
            <polygon
              key={idx}
              points={ring.points}
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth={idx === gridHexagons.length - 1 ? "1.5" : "1"}
              strokeDasharray={idx < gridHexagons.length - 1 ? "3 3" : "none"}
            />
          ))}

          {/* Axis Spokes from center to outer vertices */}
          {dimensions.map((d, idx) => {
            const { x, y } = getCoordinates(d.angle, maxRadius);
            return (
              <line
                key={idx}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
              />
            );
          })}

          {/* Dynamic User Attribute Polygon */}
          <motion.polygon
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            points={userPolygonPoints}
            fill="url(#radarFillGrad)"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            filter="url(#glow)"
            className="transition-all duration-500 ease-out"
          />

          {/* Vertex Glowing Points & Stat Value Badges */}
          {vertexPoints.map((v, idx) => (
            <g key={idx} className="transition-all duration-500">
              <circle
                cx={v.x}
                cy={v.y}
                r="6"
                fill={v.hexColor}
                stroke="#FFFFFF"
                strokeWidth="1.5"
                className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              />
              {/* Stat numerical value near dot */}
              <text
                x={v.x}
                y={v.y < center ? v.y - 10 : v.y + 14}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#FFFFFF"
                className="text-[10px] font-mono font-extrabold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] select-none pointer-events-none"
              >
                {v.val}
              </text>
            </g>
          ))}

          {/* Outer Vertex Labels */}
          {labelPoints.map((l, idx) => (
            <text
              key={idx}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={l.hexColor}
              className="text-[11px] font-mono font-bold uppercase tracking-wider drop-shadow-md select-none pointer-events-none"
            >
              {l.label}
            </text>
          ))}
        </svg>

        {/* Center OVR RATING Hexagon Badge */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-10 pointer-events-none">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative px-5 py-3 rounded-2xl bg-[#0B0B0D]/90 border border-white/20 shadow-[0_0_25px_rgba(0,0,0,0.8)] backdrop-blur-md flex flex-col items-center justify-center text-center border-t-white/40"
          >
            <div className="font-anton text-3xl text-white tracking-tight leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              {ovrRating}
            </div>
            <div className="text-[9px] font-mono font-bold tracking-widest text-[#A0A0A5] uppercase mt-0.5">
              OVR RATING
            </div>
          </motion.div>
        </div>
      </div>

      {/* 6 Individual Stat Attribute Cards Grid matching uploaded image style */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2 font-mono">
        {dimensions.map((d) => {
          const val = safeStats[d.key];
          return (
            <div
              key={d.key}
              onClick={() => onStatClick && onStatClick(d.key)}
              className={`p-3 rounded-2xl bg-[#121214] border border-white/10 hover:border-white/20 flex items-center justify-between transition-all group ${
                onStatClick ? "cursor-pointer hover:bg-white/5" : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                {/* Hexagon shape icon container */}
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm border shadow-sm shrink-0"
                  style={{
                    backgroundColor: d.bgGlow,
                    borderColor: `${d.hexColor}50`,
                    color: d.hexColor,
                  }}
                >
                  <span>{d.icon}</span>
                </div>
                <div>
                  <div className={`text-xs font-bold ${d.color} leading-none`}>{d.label}</div>
                  <div className="text-[9px] text-[#8C8C90] mt-0.5">
                    LEVEL {Math.floor(val / 10) + 1}
                  </div>
                </div>
              </div>

              {/* Numeric Rating */}
              <div className="font-anton text-xl text-white tracking-tight">{val}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
