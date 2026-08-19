import React, { useState } from "react";
import { motion } from "motion/react";
import {
  User,
  Flame,
  Zap,
  Shield,
  Crown,
  Award,
  Calendar,
  BarChart3,
  Settings,
  Edit3,
  Lock,
  CheckCircle2,
  Sparkles,
  Mail,
  Dumbbell,
  Brain,
  Users,
  BookOpen,
  X,
  LogOut,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSVJ } from "../context/SVJContext";
import { MembershipCard } from "../components/MembershipCard";
import { EVOLUTION_THEMES } from "../components/DarkCinematicOnboardingModal";
import { AvatarFrame } from "../components/AvatarFrame";
import { HexagonRadarChart } from "../components/HexagonRadarChart";
import { UserStats } from "../types";
import { useFriends } from "../hooks/useFriends";
import { Loader2 } from "lucide-react";

export const ProfileView: React.FC = () => {
  const { user, setIsEditProfileOpen, setIsPaywallOpen, setIsGoogleAuthModalOpen } = useSVJ();
  const [activeTab, setActiveTab] = useState<"analytics" | "badges" | "achievements">("analytics");
  const { friends, loading: friendsLoading } = useFriends();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      localStorage.removeItem("svj_app_state_v5_active_email");
      if (user.email) localStorage.removeItem(`svj_user_account_${user.email.toLowerCase()}`);
      await supabase.auth.signOut();
      // TrialGate listens to onAuthStateChange and swaps in the login screen.
    } finally {
      setSigningOut(false);
    }
  };

  const currentTheme =
    EVOLUTION_THEMES.find((t) => t.id === user.evolutionTheme) || EVOLUTION_THEMES[0];

  return (
    <div className="space-y-6 pb-24">
      {/* Profile Header */}
      <div className="relative rounded-3xl bg-[#17171A] border border-white/10 p-6 overflow-hidden shadow-2xl">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div
              className="relative group cursor-pointer"
              onClick={() => setIsEditProfileOpen(true)}
              title="Click to edit profile photo"
            >
              <AvatarFrame
                src={user.avatar}
                alt={user.name}
                frameId={user.equippedFrame}
                size="xl"
                showBadge
                isFounder={user.isFounder}
              />
              <div className="absolute inset-0 bg-black/50 rounded-3xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20">
                <Edit3 className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <h1 className="font-anton text-2xl sm:text-3xl text-white uppercase tracking-wide">
                  {user.name}
                </h1>
                {user.verifiedIcon && (
                  <Shield className="w-5 h-5 text-[#C81E3A] fill-[#C81E3A]/20" />
                )}
                {user.isPremium && <Crown className="w-5 h-5 text-amber-400 fill-amber-400/20" />}
              </div>
              <p className="text-xs font-mono text-[#8C8C90]">
                @{user.username} •{" "}
                <span className="text-[#C81E3A] font-bold">{user.tier} Tier</span>
              </p>
              <p className="text-xs text-[#F4F2ED]/80 font-inter mt-1.5 italic">"{user.bio}"</p>

              {/* Linked Gmail pill */}
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsGoogleAuthModalOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    user.isFounder
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : user.email
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-white/5 border-white/10 hover:border-white/20 text-[#8C8C90] hover:text-white"
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>
                    {user.isFounder
                      ? "sabarivj777@gmail.com (Founder)"
                      : user.email || "Link Gmail Account"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsEditProfileOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#0B0B0C] hover:bg-white/10 border border-white/10 text-white text-xs font-mono font-semibold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#C81E3A]" />
            <span>Edit Profile</span>
          </button>
        </div>
      </div>

      {/* Digital Membership Card Section */}
      <MembershipCard user={user} />

      {/* Friends List */}
      <div className="rounded-3xl bg-[#17171A] border border-white/10 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-anton text-lg text-white uppercase tracking-wide flex items-center gap-2">
            <Users className="w-4 h-4 text-[#C81E3A]" /> Friends
          </h2>
          <span className="text-[10px] font-mono text-[#8C8C90]">{friends.length} connected</span>
        </div>

        {friendsLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-[#C81E3A]" />
        ) : friends.length === 0 ? (
          <p className="text-xs font-mono text-[#8C8C90]">
            No friends yet — head to Community → Friends to search members and send requests.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {friends.map((f) => (
              <div
                key={f.friendship_id}
                className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5 flex items-center gap-3"
              >
                {f.avatar_url ? (
                  <img
                    src={f.avatar_url}
                    alt={f.username ?? "friend"}
                    className="w-10 h-10 rounded-xl object-cover border border-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#17171A] border border-white/10 flex items-center justify-center font-anton text-white uppercase">
                    {(f.username ?? f.display_name ?? "V").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-anton text-sm text-white uppercase truncate">
                    @{f.username ?? f.display_name ?? "Voyager"}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] font-mono mt-0.5">
                    <span className="text-[#C81E3A] flex items-center gap-1">
                      <Zap className="w-3 h-3" /> {f.total_xp.toLocaleString()} XP
                    </span>
                    <span className="text-orange-400 flex items-center gap-1">
                      <Flame className="w-3 h-3" /> {f.current_streak}d
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="p-1 rounded-2xl bg-[#17171A] border border-white/10 flex items-center justify-around text-xs font-mono">
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex-1 py-2 rounded-xl font-semibold transition-all cursor-pointer ${
            activeTab === "analytics"
              ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/20"
              : "text-[#8C8C90] hover:text-white"
          }`}
        >
          XP Analytics
        </button>
        <button
          onClick={() => setActiveTab("badges")}
          className={`flex-1 py-2 rounded-xl font-semibold transition-all cursor-pointer ${
            activeTab === "badges"
              ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/20"
              : "text-[#8C8C90] hover:text-white"
          }`}
        >
          Badges ({user.badges.filter((b) => b.unlocked).length})
        </button>
        <button
          onClick={() => setActiveTab("achievements")}
          className={`flex-1 py-2 rounded-xl font-semibold transition-all cursor-pointer ${
            activeTab === "achievements"
              ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/20"
              : "text-[#8C8C90] hover:text-white"
          }`}
        >
          Achievements
        </button>
      </div>

      {activeTab === "analytics" && (
        /* ANALYTICS TAB */
        <div className="space-y-4">
          {/* Evolution Theme Banner Card */}
          <div className="relative rounded-3xl bg-[#17171A] border border-white/10 p-5 overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-[#C81E3A] flex-shrink-0">
                <img
                  src={currentTheme.image}
                  alt={currentTheme.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{currentTheme.icon}</span>
                  <span className="font-anton text-xl text-white uppercase tracking-wider">
                    {currentTheme.name}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-[#C81E3A] uppercase font-bold tracking-wider">
                  {currentTheme.tagline}
                </div>
                <p className="text-xs text-[#8C8C90] mt-1 font-inter italic">
                  "{currentTheme.desc}"
                </p>
              </div>
            </div>
          </div>

          {/* 6 Dynamic Character Stat Attributes Hexagon Radar */}
          <div className="p-6 rounded-3xl bg-[#17171A] border border-white/10 space-y-4 shadow-2xl overflow-hidden relative">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Character Attribute Hexagon
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/30">
                  DYNAMIC OVR
                </span>
              </div>
              <span className="text-[#C81E3A] font-bold">
                LEVEL {user.level || 1} ({user.leagueRank || "APPRENTICE I"})
              </span>
            </div>

            <p className="text-xs font-mono text-[#8C8C90]">
              Your attribute polygon dynamically expands as you complete daily challenges, habits,
              and community goals.
            </p>

            {/* Radar Chart Component */}
            <HexagonRadarChart
              stats={
                user.stats || {
                  physical: 93,
                  mental: 91,
                  social: 87,
                  intellect: 84,
                  discipline: 93,
                  ambition: 95,
                }
              }
              level={user.level}
            />
          </div>

          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[#17171A] border border-white/5">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                Current Streak
              </div>
              <div className="text-xl font-mono font-bold text-orange-400">
                🔥 {user.currentStreak} Days
              </div>
              <div className="text-[10px] font-mono text-[#8C8C90] mt-0.5">
                Best: {user.bestStreak} Days
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#17171A] border border-white/5">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                Habit Consistency
              </div>
              <div className="text-xl font-mono font-bold text-emerald-400">
                {user.habitCompletionRate}%
              </div>
              <div className="text-[10px] font-mono text-[#8C8C90] mt-0.5">Last 30 days</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#17171A] border border-white/5">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">Weekly XP</div>
              <div className="text-xl font-mono font-bold text-[#C81E3A]">+{user.weeklyXP}</div>
              <div className="text-[10px] font-mono text-[#8C8C90] mt-0.5">
                Monthly: +{user.monthlyXP}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#17171A] border border-white/5">
              <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                Total Completed
              </div>
              <div className="text-xl font-mono font-bold text-white">
                {user.totalChallengesCompleted}
              </div>
              <div className="text-[10px] font-mono text-[#8C8C90] mt-0.5">
                {user.daysActive} Active Days
              </div>
            </div>
          </div>

          {/* XP History Sparkline Bar Visualizer */}
          <div className="p-5 rounded-2xl bg-[#17171A] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#C81E3A]" />
                <h3 className="font-anton text-sm text-white uppercase tracking-wide">
                  30-Day XP Growth Trend
                </h3>
              </div>
              <span className="text-xs font-mono text-[#8C8C90]">Avg 380 XP/day</span>
            </div>

            <div className="h-32 flex items-end justify-between gap-1 pt-4 px-1">
              {user.xpHistory.map((item, idx) => {
                const maxVal = Math.max(...user.xpHistory.map((h) => h.xp), 600);
                const barHeight = Math.round((item.xp / maxVal) * 100);

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-8 bg-black text-[#C81E3A] text-[9px] font-mono px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10">
                      {item.xp} XP
                    </div>

                    <div className="w-full h-full flex items-end">
                      <div
                        style={{ height: `${barHeight}%` }}
                        className="w-full rounded-t bg-gradient-to-t from-[#C81E3A]/40 to-[#C81E3A] group-hover:to-rose-400 transition-all"
                      />
                    </div>
                    <span className="text-[8px] font-mono text-[#8C8C90] truncate max-w-[20px]">
                      {item.date.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upgrade Banner */}
          {!user.isPremium && (
            <div
              onClick={() => setIsPaywallOpen(true)}
              className="p-5 rounded-2xl bg-gradient-to-r from-[#C81E3A]/20 via-[#17171A] to-amber-500/10 border border-[#C81E3A]/40 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6 text-amber-400 shrink-0" />
                <div>
                  <h3 className="font-anton text-sm text-white uppercase">Upgrade to SVJ Plus</h3>
                  <p className="text-xs text-[#8C8C90]">
                    Unlock animated aura frames, dark obsidian themes & VIP badge.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-[#C81E3A] text-white text-xs font-anton tracking-wider uppercase group-hover:bg-[#A0182E] transition-colors">
                7-Day Trial
              </span>
            </div>
          )}
        </div>
      )}

      {activeTab === "badges" && (
        /* BADGES TAB */
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {user.badges.map((badge) => (
            <div
              key={badge.id}
              className={`p-4 rounded-2xl border text-center space-y-2 ${
                badge.unlocked
                  ? "bg-[#17171A] border-white/10"
                  : "bg-[#17171A]/40 border-white/5 opacity-50"
              }`}
            >
              <div className="text-3xl">{badge.icon}</div>
              <div className="font-anton text-sm text-white uppercase">{badge.name}</div>
              <p className="text-[10px] text-[#8C8C90] font-inter line-clamp-2">
                {badge.description}
              </p>
              <span
                className={`inline-block px-2 py-0.5 rounded text-[9px] font-mono ${
                  badge.unlocked
                    ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                    : "bg-zinc-900 text-zinc-500"
                }`}
              >
                {badge.unlocked ? "Unlocked" : "Locked"}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "achievements" && (
        /* ACHIEVEMENTS TAB */
        <div className="space-y-3">
          {user.achievements.map((ach) => (
            <div
              key={ach.id}
              className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                ach.unlocked
                  ? "bg-[#17171A] border-white/10"
                  : "bg-[#17171A]/40 border-white/5 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl p-2.5 rounded-xl bg-[#0B0B0C] border border-white/10">
                  {ach.icon}
                </div>
                <div>
                  <h3 className="font-anton text-sm text-white uppercase">{ach.title}</h3>
                  <p className="text-xs text-[#8C8C90] font-inter">{ach.description}</p>
                  {ach.unlockedAt && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      Unlocked on {ach.unlockedAt}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono text-xs font-bold text-[#C81E3A]">
                  +{ach.xpReward} XP
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Account actions */}
      <div className="rounded-3xl bg-[#17171A] border border-white/10 p-4">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full py-3 rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/10 hover:bg-[#C81E3A]/20 text-[#F4F2ED] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
        >
          <LogOut className="w-4 h-4" />
          {signingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </div>
  );
};
