import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Shield, Crown, Flame, Zap, Swords, Award } from "lucide-react";
import { LeaderboardEntry } from "../types";
import { useSVJ } from "../context/SVJContext";
import { isSelfEntry } from "../lib/memberDirectory";
import { AvatarImage } from "./AvatarImage";

interface MemberProfileModalProps {
  member: LeaderboardEntry | null;
  onClose: () => void;
  onCompare: (member: LeaderboardEntry) => void;
}

export const MemberProfileModal: React.FC<MemberProfileModalProps> = ({
  member,
  onClose,
  onCompare,
}) => {
  const { user } = useSVJ();

  if (!member) return null;

  // Identity authority is the authenticated account id — never display names,
  // handles or avatars. Own profile shows information only: no opponent actions.
  const isSelf = isSelfEntry(member.id, user.id);

  return (
    <AnimatePresence>
      <div className="svj-modal-safe fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative max-h-[90dvh] min-w-0 w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#17171A] text-[#F4F2ED] shadow-2xl"
        >
          {/* Cover Header */}
          <div className="h-28 bg-gradient-to-r from-[#C81E3A]/40 via-[#17171A] to-gold/20 relative p-4 flex justify-between items-start">
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
                <AvatarImage
                  src={member.avatar}
                  name={member.username}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center gap-2">
                {!isSelf && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      onClose();
                      onCompare(member);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#C81E3A] hover:bg-[#A0182E] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-[#C81E3A]/20"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    <span>Compare XP</span>
                  </motion.button>
                )}
              </div>
            </div>

            {/* Name & Handles */}
            <div className="mb-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="min-w-0 break-words font-inter text-xl font-semibold tracking-tight text-[#F4F2ED]">
                  {member.username}
                </h2>
                {member.isVerified && (
                  <Shield className="w-4 h-4 text-[#C81E3A] fill-[#C81E3A]/20" />
                )}
                {member.isVIP && <Crown className="w-4 h-4 text-gold fill-gold/20" />}
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs font-mono text-[#8C8C90]">
                <span className="break-all">@{member.username}</span>
                <span>•</span>
                <span className="text-[#C81E3A] font-semibold">{member.tier} Tier</span>
              </div>
              {/* Only the member's own bio is shown. The previous fallback
                  attributed a fabricated quote to every member who had not
                  written one. */}
              {member.bio ? (
                <p className="text-xs text-[#F4F2ED]/80 mt-2 font-inter leading-relaxed italic">
                  &ldquo;{member.bio}&rdquo;
                </p>
              ) : null}
            </div>

            {/* Stats Overview Grid */}
            <div className="grid grid-cols-3 gap-2 my-4">
              <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 text-center">
                <Zap className="w-4 h-4 text-[#C81E3A] mx-auto mb-1" />
                <div className="text-xs font-mono font-bold text-white">
                  {member.totalXP.toLocaleString()}
                </div>
                <div className="text-[9px] font-mono text-[#8C8C90] uppercase mt-0.5">Total XP</div>
              </div>

              <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 text-center">
                <Flame className="w-4 h-4 text-gold mx-auto mb-1" />
                <div className="text-xs font-mono font-bold text-white">{member.streak} Days</div>
                <div className="text-[9px] font-mono text-[#8C8C90] uppercase mt-0.5">Streak</div>
              </div>

              <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 text-center">
                <Award className="w-4 h-4 text-gold mx-auto mb-1" />
                <div className="text-xs font-mono font-bold text-white">#{member.rank}</div>
                <div className="text-[9px] font-mono text-[#8C8C90] uppercase mt-0.5">
                  Global Rank
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
