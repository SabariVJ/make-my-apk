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
  | "transform";

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
      // Floating wrapper: full-bleed, transparent and non-interactive, so the
      // gutter around the dock never swallows taps meant for the content
      // behind it. Safe-area clearance lives here (`.svj-safe-bottom`), and the
      // dock's own bottom margin is what visually lifts it off the edge —
      // deliberately not a `pb-*` utility, which would race the safe-area
      // padding in the same cascade layer.
      className="svj-safe-bottom fixed bottom-0 left-0 right-0 z-40 pointer-events-none px-2 sm:px-4"
    >
      {/* Liquid Glass dock — the one frosted surface in the app (optics live
          in `.svj-glass-dock`, docs/SVJ_PERFORMANCE_OS_DESIGN_SYSTEM.md →
          "Liquid Glass dock"). Mobile fills the width so every touch target
          stays finger-sized, six founder destinations included; from sm+ it
          settles into a centred w-fit pill. Geometry only: colours, blur and
          depth come from the shared class so the dock stays tunable in one
          place. This div must remain the nav's ONLY element child — the
          Recovery V2 DOM test resolves the dock as `firstElementChild`. */}
      <div
        className={`svj-glass-dock pointer-events-auto relative mx-auto mb-2 w-full max-w-md ${dockColumns} gap-1 rounded-3xl p-1 sm:mb-3 sm:flex sm:w-fit sm:max-w-none sm:justify-center sm:gap-1.5 sm:p-2 md:gap-2`}
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
              // Radius stays on the house rule for buttons (rounded-xl, not the
              // panel radius) — see tests/challenge-completion-ui.test.ts.
              // min-w is sm+ only: the founder's sixth destination must still
              // fit a 360px phone instead of overflowing the dock.
              className="svj-press group relative flex min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 py-1.5 px-1 sm:px-3 rounded-xl transition-colors sm:min-w-[68px]"
            >
              {/* Frosted crimson pill. Deliberately NO backdrop-filter of its
                  own: the pill slides between tabs with a layout animation and
                  animating a backdrop-filter is banned by the motion system
                  (docs/SVJ_UI_MOTION_SYSTEM.md → Performance Rules). The dock's
                  static blur already sits behind it. */}
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-0 rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_4px_14px_-6px_rgba(200,30,58,0.6)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative">
                <Icon
                  className={`h-5 w-5 transition-colors duration-150 ${
                    isActive
                      ? "stroke-[2.5px] text-svj-crimson-bright"
                      : "stroke-[1.8px] text-[#8C8C90] group-hover:text-[#F4F2ED]"
                  }`}
                />
                {item.highlight && (
                  <span className="absolute -top-1 -right-1.5 h-2 w-2 animate-ping rounded-full bg-[#C81E3A]" />
                )}
              </div>

              {/* 10px on phones only: the dock is an equal-width row there, and
                  six 10-character labels would otherwise bleed into their
                  neighbours on a 360px screen. Back to the house 11px at sm+,
                  where the dock sizes to its content again. */}
              <span
                className={`font-inter text-[10px] leading-tight transition-colors sm:text-[11px] ${
                  isActive
                    ? "font-semibold text-svj-crimson-bright"
                    : "font-medium text-[#8C8C90] group-hover:text-[#F4F2ED]"
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
