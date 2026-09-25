import React from "react";
import { motion } from "motion/react";
import { Activity as ActivityIcon, ChevronRight, Footprints, Flame } from "lucide-react";
import { useActivityOptional } from "../context/ActivityContext";
import { SVJProgress } from "./ui-primitives/SVJProgress";

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
      className="svj-radius-card svj-lit-top group mb-4 w-full cursor-pointer border border-[#C81E3A]/25 bg-gradient-to-r from-[#C81E3A]/10 via-[#17171A] to-[#17171A] p-4 text-left transition-colors hover:border-[#C81E3A]/45"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8C8C90]">
          <ActivityIcon className="h-3.5 w-3.5 text-[#E62846]" />
          Today
        </span>
        <span className="flex items-center gap-1 font-inter text-[11px] font-semibold text-[#8C8C90] transition-colors group-hover:text-[#E62846]">
          {trackingStatus === "tracking" && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
          )}
          Open Activity
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-2">
          <Footprints className="h-5 w-5 self-center text-[#E62846]" />
          <span className="font-mono text-2xl font-bold tabular-nums text-[#F4F2ED]">
            {todaySteps.toLocaleString()}
          </span>
          <span className="font-inter text-[11px] text-[#8C8C90]">steps</span>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div className="flex items-baseline gap-2">
          <Flame className="h-4 w-4 self-center text-gold" />
          <span className="font-mono text-lg font-bold tabular-nums text-gold">
            {activeKcal.toLocaleString()}
          </span>
          <span className="font-inter text-[11px] text-[#8C8C90]">kcal</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <SVJProgress value={stepPercent} color="crimson" height="h-1.5" className="flex-1" />
        <span className="font-inter text-[10px] text-[#8C8C90]">{stepPercent}% of step goal</span>
      </div>
    </motion.button>
  );
};
