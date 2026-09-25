import React, { useState } from "react";
import { motion } from "motion/react";
import { svjStaggerContainer, svjStaggerItem, svjSpringSoft, svjWhileTap } from "../lib/motion";
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
import { useFriends } from "../hooks/useFriends";

export const LeaderboardView: React.FC = () => {
  const { user, setComparingMember, setSelectedMemberModal } = useSVJ();
  const { members } = useFriends();
  const [filter, setFilter] = useState<"total" | "weekly" | "monthly" | "streak">("total");

  const serverLeaderboard: LeaderboardEntry[] = members.map((member) => ({
    id: member.id,
    username: member.username || member.display_name || "member",
    avatar: member.avatar_url || "",
    totalXP: member.total_xp,
    weeklyXP: 0,
    monthlyXP: 0,
    streak: member.current_streak,
    rank: member.rank,
    rankDelta: 0,
    tier: "Initiate",
    country: "",
    bio: "",
  }));
  const sortedLeaderboard = [...serverLeaderboard].sort((a, b) => {
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
    <div className="space-y-4">
      {/* Motivation Header */}
      <div className="relative rounded-2xl bg-gradient-to-r from-[#17171A] via-[#1B1B20] to-[#0B0B0C] border border-[#C81E3A]/40 p-4 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#C81E3A]/15 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#8C8C90] uppercase tracking-wider mb-1">
              <Trophy className="w-3.5 h-3.5 text-gold" />
              <span>Global Standings</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">Live SVJ Ranks</span>
            </div>
            <h1 className="font-anton text-3xl tracking-wide text-white sm:text-4xl">
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
      <div className="p-1 rounded-lg bg-[#17171A] border border-white/10 flex items-center justify-around text-xs font-mono">
        {(["total", "weekly", "monthly", "streak"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-2 rounded-2xl uppercase font-semibold transition-all cursor-pointer ${
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
        <div className="space-y-3 py-8 text-center">
          <Trophy className="w-10 h-10 text-[#8C8C90] mx-auto" />
          <p className="text-sm font-inter text-[#8C8C90]">
            No leaderboard entries yet. Complete challenges to become the first.
          </p>
        </div>
      )}

      {/* PODIUM TOP 3 — the medals follow a real metal hierarchy
          (champion gold / silver / bronze) instead of an extra plain card. */}
      {sortedLeaderboard.length > 0 && (
        <div className="grid grid-cols-3 items-end gap-2 pb-2 pt-4 sm:gap-4">
          {/* 2nd Place — silver */}
          {top3[1] && (
            <motion.div
              onClick={() => setComparingMember(top3[1])}
              whileTap={{ scale: 0.97 }}
              className="svj-radius-card svj-elev-2 relative cursor-pointer border border-[#C7CBD1]/30 bg-gradient-to-b from-[#1B1D20] to-[#141416] p-3 text-center sm:p-4"
            >
              <div className="absolute -top-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[#C7CBD1]/50 bg-[#2A2E33] font-anton text-xs text-[#E3E6EA]">
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
              <div className="truncate font-anton text-xs text-white sm:text-sm">
                {top3[1].username}
              </div>
              <div className="text-[10px] font-mono text-slate-300 font-bold mt-0.5">
                {filter === "weekly"
                  ? `${top3[1].weeklyXP} XP`
                  : `${top3[1].totalXP.toLocaleString()} XP`}
              </div>
              <span className="mt-1 block font-inter text-[10px] text-[#8C8C90]">
                {top3[1].tier}
              </span>
            </motion.div>
          )}

          {/* 1st Place (Crown Champion) */}
          {top3[0] && (
            <motion.div
              onClick={() => setComparingMember(top3[0])}
              whileTap={{ scale: 0.97 }}
              className="svj-radius-card svj-elev-3 relative -translate-y-2 cursor-pointer border-2 border-[#C9A227] bg-gradient-to-b from-[#241D0C] to-[#15130E] p-4 text-center sm:p-5"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-8 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full bg-[#C9A227] opacity-25 blur-2xl"
              />
              <div className="absolute -top-5 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#C9A227] bg-[#C9A227] shadow-[0_0_22px_-4px_rgba(201,162,39,0.8)]">
                <Crown aria-hidden className="h-5 w-5 fill-black text-black" />
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
              <div className="truncate font-anton text-sm text-gold sm:text-base">
                {top3[0].username}
              </div>
              <div className="mt-0.5 font-mono text-xs font-extrabold text-gold sm:text-sm">
                {filter === "weekly"
                  ? `${top3[0].weeklyXP} XP`
                  : `${top3[0].totalXP.toLocaleString()} XP`}
              </div>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#C9A227]/40 bg-[#C9A227]/[0.14] px-2 py-0.5 font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C9A227]">
                <Crown aria-hidden className="h-3 w-3" />
                Champion
              </span>
              <span className="mt-1 block font-inter text-[10px] text-[#C9A227]/75">
                {top3[0].tier} tier
              </span>
            </motion.div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <motion.div
              onClick={() => setComparingMember(top3[2])}
              whileTap={{ scale: 0.97 }}
              className="svj-radius-card svj-elev-2 relative cursor-pointer border border-[#B0713A]/35 bg-gradient-to-b from-[#1F1813] to-[#141416] p-3 text-center sm:p-4"
            >
              <div className="absolute -top-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-[#B0713A]/60 bg-[#3A2415] font-anton text-xs text-[#E3A76B]">
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
              <div className="truncate font-anton text-xs text-white sm:text-sm">
                {top3[2].username}
              </div>
              <div className="mt-0.5 font-mono text-[10px] font-bold text-gold">
                {filter === "weekly"
                  ? `${top3[2].weeklyXP} XP`
                  : `${top3[2].totalXP.toLocaleString()} XP`}
              </div>
              <span className="mt-1 block font-inter text-[10px] text-[#8C8C90]">
                {top3[2].tier} tier
              </span>
            </motion.div>
          )}
        </div>
      )}

      {/* Rankings List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
          <span>Rank and member</span>
          <span>XP and streak</span>
        </div>

        <motion.div
          variants={svjStaggerContainer}
          initial="hidden"
          animate="show"
          className="grid gap-2 lg:grid-cols-2"
        >
          {rest.map((entry, idx) => {
            const rankNum = idx + 4;
            const isMe = entry.id === user.id || entry.id === "user-me";

            return (
              <motion.div
                key={entry.id}
                variants={svjStaggerItem}
                whileTap={svjWhileTap}
                onClick={() => setComparingMember(entry)}
                className={`svj-radius-row flex cursor-pointer items-center justify-between gap-3 border p-3 transition-colors ${
                  isMe
                    ? "border-[#C81E3A]/60 bg-[#C81E3A]/15"
                    : "border-white/[0.06] bg-[#17171A] hover:border-white/20"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-7 shrink-0 text-center font-anton text-sm text-[#8C8C90]">
                    #{rankNum}
                  </span>

                  <AvatarFrame
                    src={entry.avatar}
                    alt={entry.username}
                    frameId={entry.id === user.id ? user.equippedFrame : entry.equippedFrame}
                    size="sm"
                    isFounder={entry.id === user.id && user.isFounder}
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-inter text-sm font-semibold text-white">
                        {entry.username}
                      </span>
                      {entry.isVerified && (
                        <Shield aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#C81E3A]" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="rounded-full border border-[#C9A227]/30 bg-[#C9A227]/[0.10] px-1.5 py-0.5 font-inter text-[9px] font-semibold uppercase tracking-[0.12em] text-[#C9A227]">
                        {entry.tier}
                      </span>
                      <span className="inline-flex items-center gap-1 font-inter text-[10px] text-[#C9A227]">
                        <Flame aria-hidden className="h-3 w-3" />
                        {entry.streak} day streak
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-white">
                      {filter === "weekly"
                        ? `${entry.weeklyXP} XP`
                        : filter === "monthly"
                          ? `${entry.monthlyXP} XP`
                          : `${entry.totalXP.toLocaleString()} XP`}
                    </div>
                    {/* Only a real, measured movement is ever shown. */}
                    {entry.rankDelta !== 0 && (
                      <div
                        className={`font-mono text-[10px] ${
                          entry.rankDelta > 0 ? "text-emerald-400" : "text-[#E62846]"
                        }`}
                      >
                        {entry.rankDelta > 0 ? "▲" : "▼"} {Math.abs(entry.rankDelta)}
                      </div>
                    )}
                  </div>

                  <span className="rounded-lg border border-white/10 bg-[#0B0B0C] p-1.5 text-[#8C8C90]">
                    <Swords aria-hidden className="h-3.5 w-3.5 text-[#C81E3A]" />
                  </span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
};
