import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { showPrivacyChoices } from "../components/NativeBannerAd";
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
  AlertCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSVJ } from "../context/SVJContext";
import { MembershipCard } from "../components/MembershipCard";
import { AvatarFrame } from "../components/AvatarFrame";
import { AvatarImage } from "../components/AvatarImage";
import { HexagonRadarChart } from "../components/HexagonRadarChart";
import { UserStats } from "../types";
import { useFriends } from "../hooks/useFriends";
import { TransformationReportView } from "./TransformationReportView";
import { Loader2 } from "lucide-react";
import {
  SUPPORT_EMAIL,
  SUPPORT_SUBJECT,
  copySupportEmail,
  openSupportEmail,
} from "../lib/supportEmail";
import { getCurrentWeekXp, getWeekAverageXp } from "../lib/weeklyXp";
import { markIntentionalSignOut } from "../lib/sessionExpired";

export const ProfileView: React.FC = () => {
  const [supportState, setSupportState] = useState<"idle" | "opening" | "fallback">("idle");
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleEmailSupport = async () => {
    setCopiedEmail(false);
    setSupportState("opening");
    const result = await openSupportEmail(SUPPORT_SUBJECT);
    if (result.ok && result.method !== "copied") {
      setSupportState("idle");
    } else {
      // Popup blocked / no email app / copy attempted — surface the fallback.
      setSupportState("fallback");
    }
  };

  const handleCopySupportEmail = async () => {
    const ok = await copySupportEmail();
    if (ok) {
      setCopiedEmail(true);
      window.setTimeout(() => setCopiedEmail(false), 2500);
    }
  };
  const { user, setIsEditProfileOpen, setIsPaywallOpen, setIsGoogleAuthModalOpen } = useSVJ();
  const weekXp = getCurrentWeekXp(user.xpHistory);
  const [activeTab, setActiveTab] = useState<"analytics">("analytics");
  const [showTransformation, setShowTransformation] = useState(false);
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const isAndroid = Capacitor.getPlatform() === "android";
  const { friends, loading: friendsLoading } = useFriends(!isAndroid);

  const handleSignOut = async () => {
    if (signingOut) return; // a second click must never submit twice
    setSigningOut(true);
    setSignOutError(null);
    try {
      markIntentionalSignOut();
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      // TrialGate listens to onAuthStateChange and swaps in the login screen.
      setShowLogoutDialog(false);
    } catch (err) {
      // Failure keeps the session: surface a readable message with retry.
      setSignOutError(
        err instanceof Error
          ? err.message
          : "Could not sign out. Check your connection and try again.",
      );
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Profile Header */}
      <div className="relative rounded-2xl bg-[#17171A] border border-white/10 p-4 overflow-hidden shadow-2xl">
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
              <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20">
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
                {user.isPremium && <Crown className="w-5 h-5 text-gold fill-gold/20" />}
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
                      ? "bg-gold/15 border-gold/40 text-gold"
                      : user.email
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-white/5 border-white/10 hover:border-white/20 text-[#8C8C90] hover:text-white"
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>
                    {user.isFounder ? "Founder Account" : user.email || "Link Gmail Account"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsEditProfileOpen(true)}
            className="px-4 py-2 rounded-lg bg-[#0B0B0C] hover:bg-white/10 border border-white/10 text-white text-xs font-mono font-semibold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#C81E3A]" />
            <span>Edit Profile</span>
          </button>
        </div>
      </div>
      {/* Digital Membership Card Section */}
      <MembershipCard user={user} /> {/* Friends List — hidden on Android Play release */}
      {!isAndroid && friends.length > 0 && (
        <div className="rounded-2xl bg-[#17171A] border border-white/10 p-4 space-y-3">
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
                  <AvatarImage
                    src={f.avatar_url}
                    name={f.username ?? f.display_name}
                    className="w-10 h-10 rounded-full object-cover border border-white/10"
                  />
                  <div className="min-w-0">
                    <p className="font-anton text-sm text-white uppercase truncate">
                      @{f.username ?? f.display_name ?? "Voyager"}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] font-mono mt-0.5">
                      <span className="text-[#C81E3A] flex items-center gap-1">
                        <Zap className="w-3 h-3" /> {f.total_xp.toLocaleString()} XP
                      </span>
                      <span className="text-gold flex items-center gap-1">
                        <Flame className="w-3 h-3" /> {f.current_streak}d
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab === "analytics" && (
        /* ANALYTICS TAB — the fabricated emoji badge grid and achievement list
            that lived beside it were removed with their tabs. */
        <div className="space-y-4">
          {/* 6 Dynamic Character Stat Attributes Hexagon Radar */}
          <div className="p-4 rounded-2xl bg-[#17171A] border border-white/10 space-y-4 shadow-2xl overflow-hidden relative">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-gold" />
                  Character Attribute Hexagon
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/30">
                  DYNAMIC OVR
                </span>
              </div>
              <span className="text-[#C81E3A] font-bold">
                LEVEL {user.level || 1}
                {!isAndroid && <> ({user.leagueRank || "APPRENTICE I"})</>}
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
              <div className="text-xl font-mono font-bold text-gold">
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

          {/* XP Weekly Bar Chart — real per-day XP for the current Mon–Sun week */}
          <div className="p-4 rounded-2xl bg-[#17171A] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#C81E3A]" />
                <h3 className="font-anton text-sm text-white uppercase tracking-wide">
                  This Week's XP
                </h3>
              </div>
              <span className="text-xs font-mono text-[#8C8C90]">
                Avg {getWeekAverageXp(weekXp)} XP/day
              </span>
            </div>

            <div className="h-32 flex items-end justify-between gap-2 pt-4 px-1">
              {weekXp.map((item) => {
                // Real data only: scale by the week's actual max (never an
                // artificial floor), so any non-zero day renders visibly.
                const maxVal = Math.max(...weekXp.map((d) => d.xp));
                const barHeight =
                  maxVal > 0 ? Math.max(4, Math.round((item.xp / maxVal) * 100)) : 0;

                return (
                  <div
                    key={item.dayKey}
                    className="flex-1 flex flex-col items-center gap-1 group relative"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute -top-8 bg-black text-[#C81E3A] text-[9px] font-mono px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10">
                      {item.xp} XP
                    </div>

                    <div className="w-full h-full flex items-end">
                      <div
                        style={{ height: `${barHeight}%` }}
                        className={
                          barHeight > 0
                            ? `w-full rounded-t bg-gradient-to-t from-[#C81E3A]/40 to-[#C81E3A] transition-all ${item.isToday ? "ring-1 ring-[#C81E3A]/50" : ""}`
                            : "w-full rounded-t bg-white/5"
                        }
                      />
                    </div>
                    <span
                      className={`text-[8px] font-mono truncate max-w-[24px] ${item.isToday ? "text-white font-bold" : "text-[#8C8C90]"}`}
                    >
                      {item.day}
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
              className="p-4 rounded-2xl bg-gradient-to-r from-[#C81E3A]/20 via-[#17171A] to-gold/10 border border-[#C81E3A]/40 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6 text-gold shrink-0" />
                <div>
                  <h3 className="font-anton text-sm text-white uppercase">Upgrade to SVJ Plus</h3>
                  <p className="text-xs text-[#8C8C90]">
                    Unlock animated aura frames, dark obsidian themes & VIP badge.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-[#C81E3A] text-white text-xs font-anton tracking-wider uppercase group-hover:bg-[#A0182E] transition-colors">
                7-Day Trial
              </span>
            </div>
          )}
        </div>
      )}
      {/* Transformation Report is the sole new personalization intelligence entry in Profile. */}
      <div className="rounded-2xl bg-[#17171A] border border-white/10 p-4 space-y-3">
        <h3 className="font-anton text-sm text-white uppercase tracking-wide">Your Progress</h3>
        <button
          type="button"
          onClick={() => setShowTransformation(true)}
          className="w-full py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <BarChart3 className="w-4 h-4" />
          Transformation Report
        </button>
      </div>
      {/* Transformation Report overlay */}
      {showTransformation && (
        <div className="fixed inset-0 z-50 bg-[#0B0B0C] overflow-y-auto">
          <TransformationReportView />
          <button
            type="button"
            onClick={() => setShowTransformation(false)}
            className="fixed top-4 right-4 z-50 p-2 rounded-full bg-white/10 text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
      {/* Account actions */}
      <div className="rounded-2xl bg-[#17171A] border border-white/10 p-4 space-y-3">
        {isAndroid && (
          <button
            type="button"
            onClick={() => void showPrivacyChoices()}
            className="w-full py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Shield className="w-4 h-4" />
            Privacy Choices
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setSignOutError(null);
            setShowLogoutDialog(true);
          }}
          disabled={signingOut}
          className="w-full py-3 rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/10 hover:bg-[#C81E3A]/20 text-[#F4F2ED] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
        <button
          type="button"
          onClick={handleEmailSupport}
          disabled={supportState === "opening"}
          aria-busy={supportState === "opening"}
          className="w-full py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
        >
          {supportState === "opening" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          {supportState === "opening"
            ? "Opening email..."
            : supportState === "fallback"
              ? "Copy support email"
              : "Email Us"}
        </button>
        {supportState === "fallback" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
            <p className="text-xs text-[#8C8C90]">Couldn't open an email app. Reach us at:</p>
            <p className="my-1 font-mono text-sm text-white">sabarivj777@gmail.com</p>
            <button
              type="button"
              onClick={handleCopySupportEmail}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:bg-white/10 cursor-pointer"
            >
              {copiedEmail ? "Email copied" : "Copy email"}
            </button>
          </div>
        )}
        <p className="-mt-1 text-center text-[10px] font-mono text-[#8C8C90]">
          Opens a draft addressed to SVJ Support. You choose what to paste and send.
        </p>
        <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-[#8C8C90]">
          <a href="/delete-account" className="text-[#C81E3A] hover:text-[#A0182E]">
            Delete Account
          </a>
          <span>•</span>
          <a href="/privacy" className="hover:text-white">
            Privacy
          </a>
          <span>•</span>
          <a href="/terms" className="hover:text-white">
            Terms
          </a>
        </div>
      </div>
      {/* Log out confirmation dialog (in-app, SVJ-styled) */}
      {showLogoutDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#17171A] p-4 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg border border-[#C81E3A]/40 bg-[#C81E3A]/10 p-2">
                  <LogOut className="h-4 w-4 text-[#E62846]" />
                </div>
                <h2
                  id="logout-dialog-title"
                  className="font-anton text-lg uppercase tracking-wide text-white"
                >
                  Log out of SVJ?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutDialog(false)}
                disabled={signingOut}
                aria-label="Cancel logout"
                className="rounded-full bg-white/5 p-1.5 text-[#8C8C90] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs font-inter leading-relaxed text-[#B8B8C0]">
              You will be signed out of SVJ on this device. Your account, cloud progress and profile
              photo remain safe — nothing is deleted. Sign back in anytime to continue where you
              left off.
            </p>
            {signOutError && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-mono text-rose-300"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{signOutError}</span>
              </div>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutDialog(false)}
                disabled={signingOut}
                className="flex-1 rounded-2xl border border-white/10 bg-[#0B0B0C] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="flex-1 rounded-2xl bg-[#C81E3A] py-2.5 font-anton text-xs uppercase tracking-wider text-white shadow-lg shadow-[#C81E3A]/20 transition-colors hover:bg-[#A0182E] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {signingOut && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {signingOut ? "Signing out…" : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
