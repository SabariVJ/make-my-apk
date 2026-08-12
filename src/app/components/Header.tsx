import React from "react";
import { motion } from "motion/react";
import { Flame, Zap, Crown, Shield, Mail } from "lucide-react";
import { useSVJ } from "../context/SVJContext";

export const Header: React.FC = () => {
  const { user, setIsPaywallOpen, setIsEditProfileOpen, setIsGoogleAuthModalOpen } = useSVJ();

  return (
    <header className="sticky top-0 z-40 bg-[#0B0B0C]/90 backdrop-blur-md border-b border-white/5 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setIsEditProfileOpen(true)}
        >
          <div className="relative group">
            <div className="w-10 h-10 rounded-xl bg-[#17171A] border border-white/10 flex items-center justify-center font-anton text-xl text-[#C81E3A] group-hover:border-[#C81E3A]/50 transition-colors shadow-lg shadow-black/50">
              SVJ
            </div>
            {user.isPremium && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center text-[10px] text-black font-bold">
                <Crown className="w-2.5 h-2.5" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-anton tracking-wider text-lg text-[#F4F2ED]">SVJ</span>
              {user.verifiedIcon && <Shield className="w-4 h-4 text-[#C81E3A] fill-[#C81E3A]/20" />}
              {user.isFounder && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-mono font-bold flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5" /> FOUNDER
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#8C8C90] font-mono tracking-tight uppercase">
              {user.isFounder ? "FOUNDER OWNER" : `${user.tier} Tier`} • #{user.memberId}
            </p>
          </div>
        </div>

        {/* Stats Pill & Upgrades */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Gmail / Google Account Pill */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsGoogleAuthModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-semibold cursor-pointer border transition-all ${
              user.isFounder
                ? "bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10"
                : user.email
                  ? "bg-white/5 border-emerald-500/30 text-emerald-400"
                  : "bg-white/5 border-white/10 hover:border-white/20 text-[#8C8C90] hover:text-white"
            }`}
            title="Google / Gmail Account Settings"
          >
            {user.isFounder ? (
              <>
                <Crown className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span className="hidden sm:inline text-[11px]">Owner Account</span>
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
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#17171A] border border-white/10 text-xs font-mono font-semibold"
          >
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500/30 animate-pulse" />
            <span className="text-[#F4F2ED]">{user.currentStreak}d</span>
          </motion.div>

          {/* XP Pill */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#17171A] border border-[#C81E3A]/30 text-xs font-mono font-semibold text-[#F4F2ED]"
          >
            <Zap className="w-4 h-4 text-[#C81E3A] fill-[#C81E3A]/20" />
            <span>{user.totalXP.toLocaleString()} XP</span>
          </motion.div>

          {/* SVJ Plus Upgrade Button */}
          {!user.isPremium ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsPaywallOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#C81E3A] hover:bg-[#A0182E] text-white text-xs font-semibold shadow-lg shadow-[#C81E3A]/20 transition-all cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Plus</span>
            </motion.button>
          ) : (
            <div className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-mono">
              <Crown className="w-3 h-3" />
              <span>{user.isFounder ? "FOUNDER" : "VIP ACTIVE"}</span>
            </div>
          )}

          {/* User Avatar */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsEditProfileOpen(true)}
            className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-[#C81E3A]/80 cursor-pointer shadow-md"
          >
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          </motion.button>
        </div>
      </div>
    </header>
  );
};
