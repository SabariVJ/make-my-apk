import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, TrendingUp, Calendar, Clock, Trophy, Flame, Swords, ArrowRight } from 'lucide-react';
import { LeaderboardEntry } from '../types';
import { useSVJ } from '../context/SVJContext';

interface XPComparisonModalProps {
  member: LeaderboardEntry | null;
  onClose: () => void;
}

export const XPComparisonModal: React.FC<XPComparisonModalProps> = ({ member, onClose }) => {
  const { user } = useSVJ();

  if (!member) return null;

  const xpDiff = Math.abs(user.totalXP - member.totalXP);
  const isUserAhead = user.totalXP >= member.totalXP;
  
  // Daily average XP rate estimated from history or default ~380 XP
  const dailyRate = 380;
  const daysToCatchUp = xpDiff > 0 ? Math.ceil(xpDiff / dailyRate) : 0;

  const userMax = Math.max(user.totalXP, member.totalXP, 1);
  const userPercent = Math.round((user.totalXP / userMax) * 100);
  const memberPercent = Math.round((member.totalXP / userMax) * 100);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-[#17171A] border border-white/10 rounded-2xl p-6 text-[#F4F2ED] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-[#C81E3A]" />
              <h2 className="font-anton text-xl tracking-wide uppercase text-white">
                XP Rivalry & Analysis
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Versus Card Header */}
          <div className="grid grid-cols-2 gap-3 my-6 relative">
            
            {/* VS Badge in center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-[#C81E3A] border-2 border-[#17171A] flex items-center justify-center font-anton text-xs text-white shadow-lg">
              VS
            </div>

            {/* YOU Box */}
            <div className="p-4 rounded-xl bg-[#0B0B0C] border border-[#C81E3A]/40 flex flex-col items-center text-center">
              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#C81E3A] mb-2">
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              </div>
              <span className="font-anton text-sm text-white uppercase">{user.name}</span>
              <span className="text-[10px] font-mono text-[#8C8C90]">You (Rank #{user.xpHistory ? 47 : 47})</span>
              <div className="mt-2 text-lg font-mono font-bold text-[#C81E3A]">
                {user.totalXP.toLocaleString()} XP
              </div>
            </div>

            {/* TARGET MEMBER Box */}
            <div className="p-4 rounded-xl bg-[#0B0B0C] border border-white/10 flex flex-col items-center text-center">
              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 mb-2">
                <img src={member.avatar} alt={member.username} className="w-full h-full object-cover" />
              </div>
              <span className="font-anton text-sm text-white uppercase">{member.username}</span>
              <span className="text-[10px] font-mono text-[#8C8C90]">Rank #{member.rank}</span>
              <div className="mt-2 text-lg font-mono font-bold text-amber-400">
                {member.totalXP.toLocaleString()} XP
              </div>
            </div>
          </div>

          {/* XP Difference & Estimated Catch-up */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#C81E3A]/20 via-[#17171A] to-amber-500/10 border border-white/10 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-[#8C8C90] uppercase flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-[#C81E3A]" />
                XP Gap Difference
              </span>
              <span className="font-mono font-bold text-sm text-white">
                {xpDiff.toLocaleString()} XP
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#8C8C90] uppercase flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Est. Catch-up Pace
              </span>
              <span className="font-mono font-bold text-xs text-emerald-400">
                {isUserAhead
                  ? 'You lead by ' + xpDiff.toLocaleString() + ' XP'
                  : `~${daysToCatchUp} Days at average pace`}
              </span>
            </div>
          </div>

          {/* Visual XP Progress Dual Bar */}
          <div className="space-y-4 mb-6">
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-white">Your Progress</span>
                <span className="text-[#C81E3A]">{user.totalXP.toLocaleString()} XP ({userPercent}%)</span>
              </div>
              <div className="w-full h-3 rounded-full bg-[#0B0B0C] overflow-hidden p-0.5 border border-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${userPercent}%` }}
                  transition={{ duration: 1 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#E62846] to-[#C81E3A]"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-[#8C8C90]">{member.username}'s Progress</span>
                <span className="text-amber-400">{member.totalXP.toLocaleString()} XP ({memberPercent}%)</span>
              </div>
              <div className="w-full h-3 rounded-full bg-[#0B0B0C] overflow-hidden p-0.5 border border-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${memberPercent}%` }}
                  transition={{ duration: 1 }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                />
              </div>
            </div>
          </div>

          {/* Weekly & Monthly Comparison Table */}
          <div className="space-y-3 mb-6">
            <h3 className="font-anton text-sm tracking-wide text-[#8C8C90] uppercase">
              Performance Breakdown
            </h3>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-[#0B0B0C] border border-white/5">
                <div className="text-[10px] text-[#8C8C90] uppercase mb-1">Weekly XP</div>
                <div className="text-white font-bold">{user.weeklyXP} vs {member.weeklyXP}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0B0B0C] border border-white/5">
                <div className="text-[10px] text-[#8C8C90] uppercase mb-1">Monthly XP</div>
                <div className="text-white font-bold">{user.monthlyXP} vs {member.monthlyXP}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0B0B0C] border border-white/5">
                <div className="text-[10px] text-[#8C8C90] uppercase mb-1">Active Streak</div>
                <div className="text-white font-bold">{user.currentStreak}d vs {member.streak}d</div>
              </div>
            </div>
          </div>

          {/* Action CTA */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-[#C81E3A]/20 cursor-pointer"
          >
            <span>Lock In & Outperform</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
