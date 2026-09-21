import React from "react";
import { Capacitor } from "@capacitor/core";
import { motion } from "motion/react";
import { Flame, Zap, Crown, Shield, Mail, Menu } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { AvatarImage } from "./AvatarImage";

export const Header: React.FC<{
  /**
   * Opens the mobile utility drawer (Community / Leaderboard / Profile).
   * Desktop/tablet reach the same destinations through the right-side rail, so
   * the trigger is only rendered below the `lg` breakpoint. Omitted entirely in
   * the restricted post-trial shell.
   */
  onOpenUtilityMenu?: () => void;
}> = ({ onOpenUtilityMenu }) => {
  const { user, setIsPaywallOpen, setIsEditProfileOpen, setIsGoogleAuthModalOpen } = useSVJ();
  const isAndroid = Capacitor.getPlatform() === "android";

  return (
    <header className="sticky top-0 z-40 bg-[#0B0B0C]/92 backdrop-blur-md border-b border-white/[0.05] px-4 py-2.5 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setIsEditProfileOpen(true)}
        >
          <div className="relative group">
            <div className="w-9 h-9 rounded-2xl bg-[#17171A] border border-white/[0.08] flex items-center justify-center font-anton text-lg text-[#C81E3A] group-hover:border-[#C81E3A]/40 transition-colors">
              SVJ
            </div>
            {user.isPremium && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold flex items-center justify-center text-[10px] text-black font-bold">
                <Crown className="w-2.5 h-2.5" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-anton tracking-wider text-base text-[#F4F2ED]">SVJ</span>
              {user.verifiedIcon && <Shield className="w-4 h-4 text-[#C81E3A] fill-[#C81E3A]/20" />}
              {user.isFounder && (
                <span className="px-1.5 py-0.2 rounded-full bg-gold/20 text-gold border border-gold/30 text-[9px] font-mono font-bold flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5" /> FOUNDER
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#8C8C90] font-inter tracking-wide uppercase">
              {user.isFounder ? "FOUNDER" : `${user.tier} Tier`} · #{user.memberId}
            </p>
          </div>
        </div>

        {/* Stats Pill & Upgrades */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Gmail / Google Account Pill */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsGoogleAuthModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-inter font-medium cursor-pointer transition-colors ${
              user.email
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-white/[0.04] hover:bg-white/[0.06] text-[#8C8C90] hover:text-white"
            }`}
            title="Google / Gmail Account Settings"
          >
            {user.isFounder ? (
              <>
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline text-[11px]">Account</span>
              </>
            ) : user.email ? (
              <>
                <Mail className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline text-[11px] truncate max-w-[100px]">
                  {user.email}
                </span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="hidden sm:inline text-[11px]">Link Gmail</span>
              </>
            )}
          </motion.button>

          {/* Streak Counter */}
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#17171A] border border-gold/20 text-[11px] font-mono font-medium"
          >
            <Flame className="w-4 h-4 text-gold fill-gold/30" />
            <span className="text-[#F4F2ED]">{user.currentStreak}d</span>
          </motion.div>

          {/* XP Pill */}
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#17171A] border border-[#C81E3A]/20 text-[11px] font-mono font-medium text-[#F4F2ED]"
          >
            <Zap className="w-4 h-4 text-[#C81E3A] fill-[#C81E3A]/20" />
            <span>{user.totalXP.toLocaleString()} XP</span>
          </motion.div>

          {/* SVJ Plus Upgrade Button */}
          {!user.isPremium && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setIsPaywallOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#C81E3A] hover:bg-[#A0182E] text-white text-[11px] font-inter font-semibold transition-colors cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Plus</span>
            </motion.button>
          )}
          {user.isPremium && (
            <div className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full bg-[#d4af37]/10 text-[#d4af37] text-[11px] font-inter font-medium">
              <Crown className="w-3 h-3" />
              <span>{user.isFounder ? "FOUNDER" : "VIP ACTIVE"}</span>
            </div>
          )}

          {/* Utility menu — phones get Community / Leaderboard / Profile here. */}
          {onOpenUtilityMenu && (
            <button
              type="button"
              onClick={onOpenUtilityMenu}
              aria-label="Open SVJ menu"
              data-testid="utility-menu-trigger"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#17171A] text-[#8C8C90] transition-colors hover:text-white lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          {/* User Avatar */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsEditProfileOpen(true)}
            className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-[#C81E3A]/60 cursor-pointer"
          >
            <AvatarImage
              src={user.avatar}
              name={user.name}
              className="w-full h-full object-cover"
            />
          </motion.button>
        </div>
      </div>
    </header>
  );
};
