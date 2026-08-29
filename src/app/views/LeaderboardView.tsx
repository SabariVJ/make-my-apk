import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Trophy,
  Crown,
  Swords,
  ArrowUpRight,
  Flame,
  Shield,
  TrendingUp,
  Zap,
  Sparkles,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { LeaderboardEntry } from "../types";
import { AvatarFrame } from "../components/AvatarFrame";

export const LeaderboardView: React.FC = () => {
  const { leaderboard, user, setComparingMember, setSelectedMemberModal } = useSVJ();
  const [filter, setFilter] = useState<"total" | "weekly" | "monthly" | "streak">("total");

  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    if (filter === "weekly") return b.weeklyXP - a.weeklyXP;
    if (filter === "monthly") return b.monthlyXP - a.monthlyXP;
    if (filter === "streak") return b.streak - a.streak;
    return b.totalXP - a.totalXP;
  });

  const top3 = sortedLeaderboard.slice(0, 3);
  const rest = sortedLeaderboard.slice(3);

  const myIndexInSorted = sortedLeaderboard.findIndex(
    (l) => l.id === user.id || l.id === "user-me",
  );
  const myRank = myIndexInSorted !== -1 ? myIndexInSorted + 1 : sortedLeaderboard.length;

  const myEntry = sortedLeaderboard.find((l) => l.id === user.id || l.id === "user-me") || {
    rank: myRank,
    rankDelta: 0,
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    tier: user.tier,
    totalXP: user.totalXP,
    weeklyXP: user.weeklyXP,
    monthlyXP: user.monthlyXP,
    streak: user.currentStreak,
    country: "US",
    bio: user.bio,
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Motivation Header */}
      <div className="relative rounded-3xl bg-gradient-to-r from-[#17171A] via-[#1B1B20] to-[#0B0B0C] border border-[#C81E3A]/40 p-6 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#C81E3A]/15 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#8C8C90] uppercase tracking-wider mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Global Standings</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">Live SVJ Ranks</span>
            </div>
            <h1 className="font-anton text-3xl sm:text-4xl text-white uppercase tracking-wide">
              Global Hall of Mastery
            </h1>
            <p className="text-xs text-[#8C8C90] font-inter mt-1">
              Complete daily challenges to earn XP, maintain streaks, and climb past global
              improvers.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/10 text-center shrink-0">
            <div className="text-[10px] font-mono text-[#8C8C90] uppercase">Your Placement</div>
            <div className="text-2xl font-anton text-[#C81E3A]">Rank #{myRank}</div>
            <div className="text-[10px] font-mono text-emerald-400">{user.totalXP} Total XP</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="p-1 rounded-2xl bg-[#17171A] border border-white/10 flex items-center justify-around text-xs font-mono">
        {(["total", "weekly", "monthly", "streak"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-2 rounded-xl uppercase font-semibold transition-all cursor-pointer ${
              filter === tab
                ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/30"
                : "text-[#8C8C90] hover:text-white"
            }`}
          >
            {tab === "total" ? "All Time" : tab}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {sortedLeaderboard.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Trophy className="w-10 h-10 text-[#8C8C90] mx-auto" />
          <p className="text-sm font-inter text-[#8C8C90]">
            No leaderboard entries yet. Complete challenges to become the first.
          </p>
        </div>
      )}

      {/* PODIUM TOP 3 */}
      {sortedLeaderboard.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 pb-2">
          {/* 2nd Place */}
          {top3[1] && (
            <motion.div
              whileHover={{ y: -4 }}
              onClick={() => setComparingMember(top3[1])}
              className="p-3 sm:p-4 rounded-2xl bg-[#17171A] border border-slate-500/40 text-center relative cursor-pointer shadow-xl"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-700 text-slate-200 text-xs font-anton flex items-center justify-center border border-slate-400">
                2
              </div>
              <div className="mx-auto my-2 relative flex justify-center">
                <AvatarFrame
                  src={top3[1].avatar}
                  alt={top3[1].username}
                  frameId={top3[1].id === user.id ? user.equippedFrame : top3[1].equippedFrame}
                  size="lg"
                  isFounder={top3[1].id === user.id && user.isFounder}
                />
              </div>
              <div className="font-anton text-xs sm:text-sm text-white uppercase truncate">
                {top3[1].username}
              </div>
              <div className="text-[10px] font-mono text-slate-300 font-bold mt-0.5">
                {filter === "weekly"
                  ? `${top3[1].weeklyXP} XP`
                  : `${top3[1].totalXP.toLocaleString()} XP`}
              </div>
              <span className="text-[9px] font-mono text-[#8C8C90] uppercase block mt-1">
                {top3[1].tier}
              </span>
            </motion.div>
          )}

          {/* 1st Place (Crown Champion) */}
          {top3[0] && (
            <motion.div
              whileHover={{ y: -4 }}
              onClick={() => setComparingMember(top3[0])}
              className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#1E1A0F] to-[#17171A] border-2 border-amber-400 text-center relative cursor-pointer shadow-2xl shadow-amber-500/20 -translate-y-2"
            >
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-amber-400 text-black text-sm font-anton flex items-center justify-center border-2 border-amber-300 shadow-lg">
                <Crown className="w-5 h-5 text-black fill-black" />
              </div>
              <div className="mx-auto my-2 relative flex justify-center">
                <AvatarFrame
                  src={top3[0].avatar}
                  alt={top3[0].username}
                  frameId={
                    top3[0].id === user.id
                      ? user.equippedFrame
                      : top3[0].equippedFrame || "frame-gold"
                  }
                  size="xl"
                  isFounder={top3[0].id === user.id && user.isFounder}
                />
              </div>
              <div className="font-anton text-sm sm:text-base text-amber-300 uppercase truncate">
                {top3[0].username}
              </div>
              <div className="text-xs sm:text-sm font-mono text-amber-400 font-extrabold mt-0.5">
                {filter === "weekly"
                  ? `${top3[0].weeklyXP} XP`
                  : `${top3[0].totalXP.toLocaleString()} XP`}
              </div>
              <span className="text-[9px] font-mono text-amber-200/80 uppercase block mt-1 font-bold">
                {top3[0].tier} Legend
              </span>
            </motion.div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <motion.div
              whileHover={{ y: -4 }}
              onClick={() => setComparingMember(top3[2])}
              className="p-3 sm:p-4 rounded-2xl bg-[#17171A] border border-amber-800/50 text-center relative cursor-pointer shadow-xl"
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-amber-900 text-amber-300 text-xs font-anton flex items-center justify-center border border-amber-700">
                3
              </div>
              <div className="mx-auto my-2 relative flex justify-center">
                <AvatarFrame
                  src={top3[2].avatar}
                  alt={top3[2].username}
                  frameId={top3[2].id === user.id ? user.equippedFrame : top3[2].equippedFrame}
                  size="lg"
                  isFounder={top3[2].id === user.id && user.isFounder}
                />
              </div>
              <div className="font-anton text-xs sm:text-sm text-white uppercase truncate">
                {top3[2].username}
              </div>
              <div className="text-[10px] font-mono text-amber-400 font-bold mt-0.5">
                {filter === "weekly"
                  ? `${top3[2].weeklyXP} XP`
                  : `${top3[2].totalXP.toLocaleString()} XP`}
              </div>
              <span className="text-[9px] font-mono text-[#8C8C90] uppercase block mt-1">
                {top3[2].tier}
              </span>
            </motion.div>
          )}
        </div>
      )}

      {/* Rankings List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-4 text-[10px] font-mono text-[#8C8C90] uppercase tracking-wider">
          <span>Rank & Member</span>
          <span>XP & Streak</span>
        </div>

        {rest.map((entry, idx) => {
          const rankNum = idx + 4;
          const isMe = entry.id === user.id || entry.id === "user-me";

          return (
            <motion.div
              key={entry.id}
              whileHover={{ scale: 1.01 }}
              onClick={() => setComparingMember(entry)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                isMe
                  ? "bg-[#C81E3A]/20 border-[#C81E3A] shadow-lg shadow-[#C81E3A]/20"
                  : "bg-[#17171A] border-white/5 hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 font-anton text-sm text-[#8C8C90] text-center">
                  #{rankNum}
                </span>

                <AvatarFrame
                  src={entry.avatar}
                  alt={entry.username}
                  frameId={entry.id === user.id ? user.equippedFrame : entry.equippedFrame}
                  size="sm"
                  isFounder={entry.id === user.id && user.isFounder}
                />

                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-anton text-sm text-white uppercase">
                      {entry.username}
                    </span>
                    {entry.isVerified && <Shield className="w-3.5 h-3.5 text-[#C81E3A]" />}
                  </div>
                  <div className="text-[10px] font-mono text-[#8C8C90]">
                    {entry.tier} Tier • 🔥 {entry.streak}d
                  </div>
                </div>
              </div>

              <div className="text-right flex items-center gap-3">
                <div>
                  <div className="font-mono text-xs font-bold text-white">
                    {filter === "weekly"
                      ? `${entry.weeklyXP} XP`
                      : filter === "monthly"
                        ? `${entry.monthlyXP} XP`
                        : `${entry.totalXP.toLocaleString()} XP`}
                  </div>
                  <div className="text-[9px] font-mono text-emerald-400">
                    ▲ {entry.rankDelta || 2}
                  </div>
                </div>

                <div className="p-1.5 rounded-lg bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:text-white">
                  <Swords className="w-3.5 h-3.5 text-[#C81E3A]" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
