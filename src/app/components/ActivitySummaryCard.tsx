import React from "react";
import { motion } from "motion/react";
import { Activity as ActivityIcon, ChevronRight, Footprints, Flame } from "lucide-react";
import { useActivityOptional } from "../context/ActivityContext";

/**
 * Compact live Activity summary for the Challenges home screen.
 * Shows today's steps, estimated calories and step-goal progress; tapping it
 * opens the full Activity tab.
 */
export const ActivitySummaryCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const activity = useActivityOptional();
  const todaySteps = activity?.todaySteps ?? 0;
  const stepPercent = activity?.stepPercent ?? 0;
  const activeKcal = activity?.activeKcal ?? 0;
  const trackingStatus = activity?.trackingStatus;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left rounded-2xl border border-[#C81E3A]/25 bg-gradient-to-r from-[#C81E3A]/10 via-[#0B0B0C] to-[#0B0B0C] p-4 mb-4 cursor-pointer group transition-colors hover:border-[#C81E3A]/45"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#8C8C90] flex items-center gap-1.5">
          <ActivityIcon className="w-3.5 h-3.5 text-[#E62846]" />
          Today
        </span>
        <span className="flex items-center gap-1 text-[10px] font-mono uppercase text-[#8C8C90] group-hover:text-[#C81E3A] transition-colors">
          {trackingStatus === "tracking" && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
          View Activity
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Footprints className="w-5 h-5 text-[#E62846]" />
          <span className="font-mono text-2xl font-bold text-white tabular-nums">
            {todaySteps.toLocaleString()}
          </span>
          <span className="text-[10px] font-mono uppercase text-[#8C8C90]">Steps</span>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-lg font-bold text-amber-400 tabular-nums">
            {activeKcal.toLocaleString()}
          </span>
          <span className="text-[10px] font-mono uppercase text-[#8C8C90]">KCAL</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-black/60 border border-white/10 overflow-hidden p-0.5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${stepPercent}%` }}
            transition={{ duration: 0.8 }}
            className="h-full rounded-full bg-gradient-to-r from-[#E62846] to-[#C81E3A]"
          />
        </div>
        <span className="text-[10px] font-mono text-[#8C8C90]">{stepPercent}% OF STEP GOAL</span>
      </div>
    </motion.button>
  );
};
