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
import { SVJSectionHeader } from "../components/ui-primitives/SVJSectionHeader";
import { SVJBadge } from "../components/ui-primitives/SVJBadge";
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
    <div className="space-y-4">
      {/* Profile Header */}
      <div className="svj-radius-card svj-lit-top svj-elev-1 relative overflow-hidden border border-white/[0.06] bg-[#17171A] p-4">
        <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:items-start sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:flex-row">
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
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h1 className="font-inter text-xl font-semibold tracking-tight text-[#F4F2ED] sm:text-2xl">
                  {user.name}
                </h1>
                {user.verifiedIcon && (
                  <Shield className="h-5 w-5 fill-[#C81E3A]/20 text-[#C81E3A]" />
                )}
                {user.isPremium && <Crown className="h-5 w-5 fill-gold/20 text-gold" />}
              </div>
              {/* Separate lines and a real badge instead of one middle-dotted
                  meta string: the handle is identity, the tier is a status. */}
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="font-inter text-xs text-[#8C8C90]">@{user.username}</span>
                <SVJBadge variant="crimson">{user.tier} tier</SVJBadge>
              </div>
              <p className="mt-1.5 font-inter text-xs italic text-[#F4F2ED]/80">{user.bio}</p>

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
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-[#08080A] px-4 py-2 font-inter text-xs font-semibold text-white transition-colors hover:bg-white/[0.06]"
          >
            <Edit3 className="h-3.5 w-3.5 text-[#C81E3A]" />
            <span>Edit profile</span>
          </button>
        </div>
      </div>
      {/* Digital Membership Card Section */}
      <MembershipCard user={user} />

      {/* Friends List — hidden on Android Play release */}
      {!isAndroid && friends.length > 0 && (
        <div className="svj-radius-card svj-lit-top space-y-3 border border-white/[0.06] bg-[#17171A] p-3.5">
          <SVJSectionHeader
            title="Friends"
            icon={Users}
            trailing={
              <span className="font-inter text-[10px] text-[#8C8C90]">
                {friends.length} connected
              </span>
            }
          />

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
                  className="svj-radius-row flex items-center gap-3 border border-white/[0.05] bg-[#08080A] p-3"
                >
                  <AvatarImage
                    src={f.avatar_url}
                    name={f.username ?? f.display_name}
                    className="h-10 w-10 rounded-full border border-white/10 object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-inter text-sm font-semibold text-white">
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
          <div className="svj-radius-card svj-lit-top relative space-y-4 overflow-hidden border border-white/[0.06] bg-[#17171A] p-4">
            <SVJSectionHeader
              title="Character attributes"
              icon={Sparkles}
              trailing={
                <div className="flex items-center gap-2">
                  {!isAndroid && (
                    <span className="font-inter text-[11px] text-[#8C8C90]">
                      {user.leagueRank || "Apprentice I"}
                    </span>
                  )}
                  <SVJBadge variant="emerald">Level {user.level || 1}</SVJBadge>
                </div>
              }
            />

            <p className="font-inter text-xs leading-relaxed text-[#8C8C90]">
              Every attribute grows from work you actually complete — challenges, habits and
              community goals.
            </p>

            {/* Radar Chart Component */}
            <HexagonRadarChart
              /* Real Character Matrix values only — the previous fallback drew
                 an invented 93/91/87 polygon for accounts with no stats yet. */
              stats={user.stats}
              level={user.level}
            />
          </div>

          {/* Key Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="svj-radius-row border border-white/[0.05] bg-[#08080A] p-3.5">
              <p className="mb-1 font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
                Streak
              </p>
              <p className="font-mono text-xl font-bold text-gold">{user.currentStreak} days</p>
              <p className="mt-0.5 font-inter text-[10px] text-[#8C8C90]">
                Best {user.bestStreak} days
              </p>
            </div>

            <div className="svj-radius-row border border-white/[0.05] bg-[#08080A] p-3.5">
              <p className="mb-1 font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
                Habit consistency
              </p>
              <p className="font-mono text-xl font-bold text-emerald-400">
                {user.habitCompletionRate}%
              </p>
              <p className="mt-0.5 font-inter text-[10px] text-[#8C8C90]">Last 30 days</p>
            </div>

            <div className="svj-radius-row border border-white/[0.05] bg-[#08080A] p-3.5">
              <p className="mb-1 font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
                Weekly XP
              </p>
              <p className="font-mono text-xl font-bold text-[#E62846]">+{user.weeklyXP}</p>
              <p className="mt-0.5 font-inter text-[10px] text-[#8C8C90]">
                Monthly +{user.monthlyXP}
              </p>
            </div>

            <div className="svj-radius-row border border-white/[0.05] bg-[#08080A] p-3.5">
              <p className="mb-1 font-inter text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8C8C90]">
                Total completed
              </p>
              <p className="font-mono text-xl font-bold text-[#F4F2ED]">
                {user.totalChallengesCompleted}
              </p>
              <p className="mt-0.5 font-inter text-[10px] text-[#8C8C90]">
                {user.daysActive} active days
              </p>
            </div>
          </div>

          {/* XP Weekly Bar Chart — real per-day XP for the current Mon–Sun week */}
          <div className="svj-radius-card svj-lit-top space-y-4 border border-white/[0.06] bg-[#17171A] p-4">
            <SVJSectionHeader
              title="This week's XP"
              icon={BarChart3}
              trailing={
                <span className="font-inter text-xs text-[#8C8C90]">
                  Avg {getWeekAverageXp(weekXp)} XP/day
                </span>
              }
            />

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
              className="svj-radius-card group flex cursor-pointer items-center justify-between border border-[#C81E3A]/35 bg-gradient-to-r from-[#C81E3A]/15 via-[#17171A] to-[#C9A227]/10 p-4"
            >
              <div className="flex items-center gap-3">
                <Crown className="h-6 w-6 shrink-0 text-[#C9A227]" />
                <div>
                  <h3 className="font-inter text-sm font-semibold text-[#F4F2ED]">
                    Upgrade to SVJ Plus
                  </h3>
                  <p className="font-inter text-xs text-[#8C8C90]">
                    Unlock aura frames, obsidian themes and the VIP badge.
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-lg bg-[#C81E3A] px-3 py-1.5 font-inter text-[11px] font-semibold text-white transition-colors group-hover:bg-[#A0182E]">
                See plans
              </span>
            </div>
          )}
        </div>
      )}
      {/* Trailing utility cards pair up on desktop width so Profile stops being
          one very long single column. DOM order is unchanged on mobile. */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {/* Transformation Report is the sole new personalization intelligence entry in Profile. */}
        <div className="svj-radius-card svj-lit-top space-y-3 border border-white/[0.06] bg-[#17171A] p-3.5">
          <SVJSectionHeader title="Your progress" />
          <button
            type="button"
            onClick={() => setShowTransformation(true)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#C9A227]/30 bg-[#C9A227]/10 py-3 font-inter text-xs font-semibold text-[#C9A227] transition-colors hover:bg-[#C9A227]/20"
          >
            <BarChart3 className="h-4 w-4" />
            Open transformation report
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
        <div className="svj-radius-card svj-lit-top space-y-3 border border-white/[0.06] bg-[#17171A] p-3.5">
          {isAndroid && (
            <button
              type="button"
              onClick={() => void showPrivacyChoices()}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 font-inter text-xs font-semibold text-[#8C8C90] transition-colors hover:text-white"
            >
              <Shield className="h-4 w-4" />
              Privacy choices
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSignOutError(null);
              setShowLogoutDialog(true);
            }}
            disabled={signingOut}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/10 py-3 font-inter text-xs font-semibold text-[#F4F2ED] transition-colors hover:bg-[#C81E3A]/20 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
          <button
            type="button"
            onClick={handleEmailSupport}
            disabled={supportState === "opening"}
            aria-busy={supportState === "opening"}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3 font-inter text-xs font-semibold text-[#8C8C90] transition-colors hover:text-white disabled:opacity-60"
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
                className="cursor-pointer rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 font-inter text-[11px] font-semibold text-white hover:bg-white/[0.08]"
              >
                {copiedEmail ? "Email copied" : "Copy email"}
              </button>
            </div>
          )}
          <p className="-mt-1 text-center text-[10px] font-mono text-[#8C8C90]">
            Opens a draft addressed to SVJ Support. You choose what to paste and send.
          </p>
          <div className="flex items-center justify-center gap-4 font-inter text-[10px] text-[#8C8C90]">
            <a href="/delete-account" className="text-[#E62846] hover:text-[#A0182E]">
              Delete account
            </a>
            <span aria-hidden className="h-3 w-px bg-white/10" />
            <a href="/privacy" className="hover:text-white">
              Privacy
            </a>
            <span aria-hidden className="h-3 w-px bg-white/10" />
            <a href="/terms" className="hover:text-white">
              Terms
            </a>
          </div>
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
            className="svj-radius-card svj-lit-top svj-elev-3 w-full max-w-sm border border-white/[0.06] bg-[#17171A] p-5"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg border border-[#C81E3A]/40 bg-[#C81E3A]/10 p-2">
                  <LogOut className="h-4 w-4 text-[#E62846]" />
                </div>
                <h2
                  id="logout-dialog-title"
                  className="font-inter text-base font-semibold tracking-tight text-[#F4F2ED]"
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
                className="flex-1 rounded-xl border border-white/[0.08] bg-[#08080A] py-2.5 font-inter text-xs font-semibold text-[#F4F2ED] transition-colors hover:bg-white/[0.06] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-2.5 font-inter text-xs font-semibold text-white shadow-lg shadow-[#C81E3A]/20 transition-colors hover:bg-[#A0182E] disabled:opacity-60"
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
