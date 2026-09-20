import React from "react";
import { motion } from "motion/react";

/**
 * Animated progress bar. Animates only when `value` changes.
 * Supports reduced-motion through the CSS media query.
 */
export const SVJProgress: React.FC<{
  value: number; // 0-100
  color?: "crimson" | "amber" | "emerald" | "gold";
  height?: string;
  className?: string;
}> = ({ value, color = "crimson", height = "h-2", className = "" }) => {
  const clamped = Math.max(0, Math.min(100, value));

  const gradients: Record<string, string> = {
    crimson: "from-[#8C1327] to-[#C81E3A]",
    amber: "from-amber-600 to-amber-400",
    emerald: "from-emerald-600 to-emerald-400",
    gold: "from-[#997a15] to-[#d4af37]",
  };

  return (
    <div
      className={`w-full ${height} rounded-full bg-white/[0.04] overflow-hidden ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`h-full rounded-full bg-gradient-to-r ${gradients[color]}`}
      />
    </div>
  );
};
