import React from "react";
import { motion } from "motion/react";
import {
  Flame,
  Dumbbell,
  Apple,
  Crown,
  User,
  CalendarCheck,
  KeyRound,
  LogOut,
  Gift,
  Activity,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";

export type ActiveTab =
  | "challenges"
  | "activity"
  | "earn"
  | "workouts"
  | "nutrition"
  | "community"
  | "leaderboard"
  | "sixty"
  | "plus"
  | "redeem"
  | "signout"
  | "profile"
  | "plan"
  | "transform";

interface NavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  /** When true, only show tabs allowed in the post-trial restricted shell. */
  restricted?: boolean;
}

/**
 * Tabs that live INSIDE one of the five primary destinations. Mapping them here
 * keeps the parent destination highlighted (60-Day under Challenges, Earn Plus
 * and the plan/report under Challenges too) instead of dropping the athlete's
 * sense of place.
 */
const CLUSTERED_TABS: Partial<Record<ActiveTab, ActiveTab>> = {
  sixty: "challenges",
  earn: "challenges",
  plan: "challenges",
  transform: "challenges",
};

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  restricted = false,
}) => {
  const { user } = useSVJ();

  // Primary destinations only. Community / Leaderboard / Profile moved to the
  // right-side utility rail (desktop) and utility drawer (mobile); 60-Day moved
  // into Challenges. Their routes, data and permissions are unchanged.
  const allNavItems = [
    { id: "challenges", label: "Challenges", icon: Flame },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "workouts", label: "Train", icon: Dumbbell },
    { id: "nutrition", label: "Fuel", icon: Apple },
    { id: "plus", label: "Plus", icon: Crown, highlight: !user.isPremium },
  ];

  // The free earning path must outlive the seven-day introductory trial, so the
  // restricted shell keeps its own (unchanged) set of destinations.
  const restrictedNavItems: typeof allNavItems = [
    { id: "earn", label: "Earn Plus", icon: Gift },
    { id: "sixty", label: "60 Day", icon: CalendarCheck },
    { id: "redeem", label: "Redeem Code", icon: KeyRound },
    { id: "profile", label: "Profile", icon: User },
    { id: "signout", label: "Sign Out", icon: LogOut },
  ];
  const navItems = restricted ? restrictedNavItems : allNavItems;

  return (
    <nav
      data-testid="primary-navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B0B0C]/95 backdrop-blur-xl border-t border-white/[0.06] py-2 sm:py-3"
    >
      {/* Compact centered dock — w-fit + gap keeps tabs grouped as one
          control instead of spreading across the viewport. Mobile uses
          full-width grid-cols-5 for maximum touch-target size. */}
      <div className="mx-auto w-fit grid grid-cols-5 gap-1 sm:flex sm:w-fit sm:justify-center sm:gap-1.5 md:gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || CLUSTERED_TABS[activeTab] === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as ActiveTab)}
              aria-current={isActive ? "page" : undefined}
              data-testid={`primary-nav-${item.id}`}
              className="relative flex flex-col items-center gap-0.5 py-1.5 px-2 sm:px-3 rounded-2xl transition-colors cursor-pointer group min-w-[64px] md:min-w-[74px] svj-press"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-0 bg-[#C81E3A]/15 rounded-2xl border border-[#C81E3A]/40"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors duration-150 ${
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
