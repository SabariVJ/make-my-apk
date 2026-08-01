import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Crown, Flame, Zap, Swords, Calendar, Award, ThumbsUp, Heart } from 'lucide-react';
import { LeaderboardEntry } from '../types';
import { useSVJ } from '../context/SVJContext';

interface MemberProfileModalProps {
  member: LeaderboardEntry | null;
  onClose: () => void;
  onCompare: (member: LeaderboardEntry) => void;
}

export const MemberProfileModal: React.FC<MemberProfileModalProps> = ({ member, onClose, onCompare }) => {
  const { triggerConfetti } = useSVJ();

  if (!member) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md bg-[#17171A] border border-white/10 rounded-2xl overflow-hidden text-[#F4F2ED] shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Cover Header */}
          <div className="h-28 bg-gradient-to-r from-[#C81E3A]/40 via-[#17171A] to-amber-500/20 relative p-4 flex justify-between items-start">
            <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/10 text-[10px] font-mono text-zinc-300">
              SVJ MEMBER PROFILE
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-black/60 backdrop-blur text-[#8C8C90] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Avatar & Basic Info */}
          <div className="px-6 pb-6 relative">
            <div className="-mt-14 mb-3 flex items-end justify-between">
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-4 border-[#17171A] bg-[#0B0B0C] shadow-xl">
                <img src={member.avatar} alt={member.username} className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    onClose();
                    onCompare(member);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-[#C81E3A]/20"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Compare XP</span>
                </motion.button>
              </div>
            </div>

            {/* Name & Handles */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-anton text-2xl tracking-wide uppercase text-white">
                  {member.username}
                </h2>
                {member.isVerified && <Shield className="w-4 h-4 text-[#C81E3A] fill-[#C81E3A]/20" />}
                {member.isVIP && <Crown className="w-4 h-4 text-amber-400 fill-amber-400/20" />}
              </div>
              <div className="text-xs font-mono text-[#8C8C90] flex items-center gap-2 mt-0.5">
                <span>@{member.username}</span>
                <span>•</span>
                <span className="text-[#C81E3A] font-semibold">{member.tier} Tier</span>
              </div>
              <p className="text-xs text-[#F4F2ED]/80 mt-2 font-inter leading-relaxed italic">
                "{member.bio || 'Discipline is doing what needs to be done, even when you don\'t feel like it.'}"
              </p>
            </div>

            {/* Stats Overview Grid */}
            <div className="grid grid-cols-3 gap-2.5 my-4">
              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5 text-center">
                <Zap className="w-4 h-4 text-[#C81E3A] mx-auto mb-1" />
                <div className="text-xs font-mono font-bold text-white">{member.totalXP.toLocaleString()}</div>
                <div className="text-[9px] font-mono text-[#8C8C90] uppercase mt-0.5">Total XP</div>
              </div>

              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5 text-center">
                <Flame className="w-4 h-4 text-orange-500 mx-auto mb-1" />
                <div className="text-xs font-mono font-bold text-white">{member.streak} Days</div>
                <div className="text-[9px] font-mono text-[#8C8C90] uppercase mt-0.5">Streak</div>
              </div>

              <div className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5 text-center">
                <Award className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <div className="text-xs font-mono font-bold text-white">#{member.rank}</div>
                <div className="text-[9px] font-mono text-[#8C8C90] uppercase mt-0.5">Global Rank</div>
              </div>
            </div>

            {/* Badges & Achievements */}
            <div className="space-y-3 my-4">
              <h3 className="font-anton text-sm tracking-wide text-[#8C8C90] uppercase">
                Member Badges
              </h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-[#0B0B0C] border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                  <span>⚔️</span> Iron Will
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#0B0B0C] border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                  <span>🔥</span> Streak Master
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#0B0B0C] border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                  <span>👑</span> Top 100 Elite
                </span>
              </div>
            </div>

            {/* Quick Celebrate Action */}
            <div className="pt-2">
              <button
                onClick={() => {
                  triggerConfetti();
                }}
                className="w-full py-2.5 rounded-xl bg-[#0B0B0C] hover:bg-white/5 border border-white/10 text-white font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Heart className="w-4 h-4 text-rose-500 fill-rose-500/20" />
                <span>Send Respect & Celebration 🔥</span>
              </button>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
