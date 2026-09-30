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
  HeartPulse,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { isFounderAccount } from "../lib/founderGate";

export type ActiveTab =
  | "challenges"
  | "activity"
  | "earn"
  | "workouts"
  | "recovery"
  | "nutrition"
  | "community"
  | "leaderboard"
  | "sixty"
  | "plus"
  | "redeem"
  | "signout"
  | "profile"
  | "plan"
  | "transform"
  | "admin";

interface PrimaryNavItem {
  id: ActiveTab;
  label: string;
  icon: typeof Flame;
  highlight?: boolean;
}

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
  const { user, profileLoaded } = useSVJ();

  // Primary destinations only. Community / Leaderboard / Profile moved to the
  // right-side utility rail (desktop) and utility drawer (mobile); 60-Day moved
  // into Challenges. Their routes, data and permissions are unchanged.
  const primaryNavItems: PrimaryNavItem[] = [
    { id: "challenges", label: "Challenges", icon: Flame },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "workouts", label: "Train", icon: Dumbbell },
    { id: "nutrition", label: "Fuel", icon: Apple },
    { id: "plus", label: "Plus", icon: Crown, highlight: !user.isPremium },
  ];

  // Recovery V2 is staged for the founder account only: Recovery becomes its
  // own destination directly after Train, and everyone else keeps the exact
  // five destinations they have today. The gate stays false until the real
  // server-backed profile has loaded, so a founder-only tab can never flash.
  const recoveryEnabled = isFounderAccount(user, profileLoaded);
  const recoveryItem: PrimaryNavItem = { id: "recovery", label: "Recovery", icon: HeartPulse };
  const allNavItems: PrimaryNavItem[] = recoveryEnabled
    ? [...primaryNavItems.slice(0, 3), recoveryItem, ...primaryNavItems.slice(3)]
    : primaryNavItems;

  // The free earning path must outlive the seven-day introductory trial, so the
  // restricted shell keeps its own (unchanged) set of destinations.
  const restrictedNavItems: PrimaryNavItem[] = [
    { id: "earn", label: "Earn Plus", icon: Gift },
    { id: "sixty", label: "60 Day", icon: CalendarCheck },
    { id: "redeem", label: "Redeem Code", icon: KeyRound },
    { id: "profile", label: "Profile", icon: User },
    { id: "signout", label: "Sign Out", icon: LogOut },
  ];
  const navItems = restricted ? restrictedNavItems : allNavItems;
  // Mobile dock columns follow the destination count, so the founder's sixth
  // destination stays on one readable row instead of wrapping.
  const dockColumns = navItems.length === 6 ? "grid grid-cols-6" : "grid grid-cols-5";

  return (
    <nav
      data-testid="primary-navigation"
      // Floating glass dock: inset from the edges, lifted off the bottom by
      // the existing env(safe-area-inset-bottom) pattern (the same one the
      // page container uses in App.tsx) so the gesture bar is always cleared
      // without a duplicate safe-area utility or negative offsets.
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
    >
      {/* Liquid Glass dock — one rounded translucent control. 320px fit is
          guaranteed by the fluid grid: equal columns always fit the width,
          padding shrinks slightly below 360px, labels truncate instead of
          clipping, and touch targets keep their 44px+ height. */}
      <div
        className={`svj-glass-dock mx-auto w-full max-w-md ${dockColumns} gap-0.5 px-1 py-1.5 sm:w-fit sm:rounded-2xl sm:px-1.5 sm:py-2 md:gap-1`}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || CLUSTERED_TABS[activeTab] === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? "page" : undefined}
              data-testid={`primary-nav-${item.id}`}
              className="svj-press relative flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors sm:px-3 md:min-w-[64px]"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="svj-dock-active absolute inset-0 rounded-xl"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors duration-150 ${
                    isActive ? "text-[#C81E3A] stroke-[2.5px]" : "text-[#8C8C90] stroke-[1.8px]"
                  }`}
                />
                {/* A static accent dot, not a perpetual ping — the app has one
                    deliberate motion moment (the level-up sequence) and this
                    is not it. */}
                {item.highlight && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-[#C81E3A] ring-2 ring-[#0B0B0C]"
                  />
                )}
              </div>

              <span
                className={`w-full truncate text-center text-[10px] leading-tight font-inter font-medium transition-colors sm:text-[11px] ${
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
