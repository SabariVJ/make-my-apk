import React from "react";
import { Capacitor } from "@capacitor/core";
import { motion, AnimatePresence } from "motion/react";
import { Trophy, User, Users, X } from "lucide-react";
import type { ActiveTab } from "./Navigation";
import { visibleUtilityItems } from "../lib/utilityNav";

/** Rail/drawer icons, keyed by the shared utility-nav ids. */
const UTILITY_ICONS: Record<string, typeof Users> = {
  community: Users,
  leaderboard: Trophy,
  profile: User,
};

const isActiveUtility = (itemId: ActiveTab, activeTab: ActiveTab) => activeTab === itemId;

const railButtonClass = (active: boolean) =>
  `relative flex w-full flex-col items-center gap-1 rounded-xl px-2 py-3 transition-colors ${
    active
      ? "bg-[#C81E3A]/15 text-[#F4F2ED]"
      : "text-[#8C8C90] hover:bg-white/5 hover:text-[#F4F2ED]"
  }`;

/**
 * Right-side vertical utility rail (desktop/tablet only).
 *
 * It is `fixed` and vertically centred so it never collides with the sticky
 * header or the bottom navigation, and the page container reserves matching
 * right padding (`lg:pr-28`) so it can never cover content.
 */
export const UtilityRail: React.FC<{
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}> = ({ activeTab, setActiveTab }) => {
  const isAndroid = Capacitor.getPlatform() === "android";
  const items = visibleUtilityItems(isAndroid);

  return (
    <nav
      data-testid="utility-rail"
      aria-label="Utility navigation"
      className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1 rounded-l-2xl border border-r-0 border-white/10 bg-[#0B0B0C]/90 p-2 backdrop-blur-xl lg:flex"
    >
      {items.map((item) => {
        const Icon = UTILITY_ICONS[item.id] ?? Users;
        const active = isActiveUtility(item.id, activeTab);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            aria-current={active ? "page" : undefined}
            data-testid={`utility-rail-${item.id}`}
            className={railButtonClass(active)}
          >
            {active && (
              <span className="absolute right-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-[#C81E3A]" />
            )}
            <Icon
              className={`h-5 w-5 ${active ? "stroke-[2.5px] text-[#C81E3A]" : "stroke-[1.8px]"}`}
            />
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wider">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

/**
 * Compact utility drawer for narrow screens. Same three destinations, so no
 * important surface is ever unreachable on a phone.
 */
export const UtilityDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}> = ({ open, onClose, activeTab, setActiveTab }) => {
  const isAndroid = Capacitor.getPlatform() === "android";
  const items = visibleUtilityItems(isAndroid);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="SVJ menu"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="absolute right-0 top-0 h-full w-64 max-w-[80vw] border-l border-white/10 bg-[#0B0B0C] p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-anton text-sm uppercase tracking-widest text-[#F4F2ED]">
                SVJ
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-lg border border-white/10 p-1.5 text-[#8C8C90] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {items.map((item) => {
                const Icon = UTILITY_ICONS[item.id] ?? Users;
                const active = isActiveUtility(item.id, activeTab);
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`utility-drawer-${item.id}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      setActiveTab(item.id);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                      active
                        ? "border-[#C81E3A]/40 bg-[#C81E3A]/15 text-[#F4F2ED]"
                        : "border-transparent text-[#8C8C90] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? "text-[#C81E3A]" : "stroke-[1.8px]"}`} />
                    <span className="font-inter text-sm font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
