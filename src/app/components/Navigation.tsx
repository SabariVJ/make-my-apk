import React from "react";
import { motion } from "motion/react";
import { Flame, Dumbbell, Apple, Users, Trophy, Gift, Crown, User } from "lucide-react";
import { useSVJ } from "../context/SVJContext";

export type ActiveTab =
  | "challenges"
  | "workouts"
  | "nutrition"
  | "community"
  | "leaderboard"
  | "rewards"
  | "plus"
  | "profile";

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const { user } = useSVJ();

  const navItems = [
    { id: "challenges", label: "Challenges", icon: Flame },
    { id: "workouts", label: "Train", icon: Dumbbell },
    { id: "nutrition", label: "Fuel", icon: Apple },
    { id: "community", label: "Community", icon: Users },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
    { id: "rewards", label: "Rewards", icon: Gift },
    { id: "plus", label: "Plus", icon: Crown, highlight: !user.isPremium },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B0B0C]/95 backdrop-blur-xl border-t border-white/10 px-1 py-2 sm:py-3">
      <div className="max-w-2xl mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as ActiveTab)}
              className="relative flex flex-col items-center gap-1 py-1 px-1.5 sm:px-3 rounded-xl transition-all cursor-pointer group"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-0 bg-[#C81E3A]/15 rounded-xl border border-[#C81E3A]/40"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? "text-[#C81E3A] stroke-[2.5px]" : "text-[#8C8C90] stroke-[1.8px]"
                  }`}
                />
                {item.highlight && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-[#C81E3A] animate-ping" />
                )}
              </div>

              <span
                className={`text-[11px] font-inter font-medium transition-colors ${
                  isActive ? "text-[#F4F2ED] font-semibold" : "text-[#8C8C90]"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
