import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Zap,
  TrendingUp,
  Calendar,
  Clock,
  Trophy,
  Flame,
  Swords,
  ArrowRight,
} from "lucide-react";
import { LeaderboardEntry } from "../types";
import { useSVJ } from "../context/SVJContext";
import { createRivalry, getRivalries, type RivalryData } from "@/lib/rivalry.functions";
import { AvatarImage } from "./AvatarImage";
import { SVJProgress } from "./ui-primitives/SVJProgress";
import { SVJSectionHeader } from "./ui-primitives/SVJSectionHeader";

interface XPComparisonModalProps {
  member: LeaderboardEntry | null;
  onClose: () => void;
}

export const XPComparisonModal: React.FC<XPComparisonModalProps> = ({ member, onClose }) => {
  const { user, leaderboard } = useSVJ();
  const [rivalry, setRivalry] = useState<RivalryData | null>(null);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rivalryLookupFailed, setRivalryLookupFailed] = useState(false);
  const [showRivalry, setShowRivalry] = useState(false);

  // Identity is the authenticated account id. A stale modal or direct handler
  // invocation can never compare the user against their own account.
  const isSelf = member?.id === user.id;

  useEffect(() => {
    if (!member) return;
    setRivalryLookupFailed(false);
    const refreshRivalry = () =>
      void getRivalries()
        .then((items) => {
          const match = items.find(
            (item) =>
              (item.challengerId === user.id && item.opponentId === member.id) ||
              (item.challengerId === member.id && item.opponentId === user.id),
          );
          setRivalry(match ?? null);
        })
        .catch(() => {
          setRivalryLookupFailed(true);
        });
    setShowRivalry(false);
    refreshRivalry();
    const interval = window.setInterval(refreshRivalry, 15_000);
    return () => window.clearInterval(interval);
  }, [member, user.id]);

  if (!member) return null;

  const handleLockIn = async () => {
    if (isSelf) {
      setActionError("You cannot challenge your own account.");
      return;
    }
    if (sending) return; // repeated taps never send duplicate requests
    setSending(true);
    setActionError(null);
    try {
      const result = await createRivalry({ data: { opponentId: member.id } });
      if (result.ok && result.rivalry) setRivalry(result.rivalry);
      else setActionError(result.error || "Could not send the rivalry request. Please retry.");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not send the rivalry request. Please retry.",
      );
    } finally {
      // The loading state is always cleared, including on rejection.
      setSending(false);
    }
  };
  const actionLabel =
    rivalry?.status === "active"
      ? "View Rivalry"
      : rivalry?.status === "pending"
        ? rivalry.challengerId === user.id
          ? "Request Sent ✓"
          : "Respond in Community"
        : "Lock In & Outperform";

  // Rank is only displayed when a real ranked entry exists for the signed-in
  // account. There is no invented fallback number.
  const myRankEntry = leaderboard.find((entry) => entry.id === user.id);
  const myRankLabel = rivalryLookupFailed
    ? "—"
    : myRankEntry && Number.isFinite(myRankEntry.rank)
      ? `#${myRankEntry.rank}`
      : "—";
  const xpDiff = Math.abs(user.totalXP - member.totalXP);
  const isUserAhead = user.totalXP >= member.totalXP;

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
          role="dialog"
          aria-modal="true"
          aria-label="XP rivalry and analysis"
          className="svj-radius-card svj-lit-top svj-elev-3 relative max-h-[90dvh] w-full max-w-lg overflow-y-auto overflow-x-hidden border border-white/[0.06] bg-[#17171A] p-4 text-[#F4F2ED]"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <div className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-[#C81E3A]" />
              <h2 className="font-inter text-base font-semibold tracking-tight text-[#F4F2ED]">
                XP comparison
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close comparison"
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {isSelf ? (
            /* Self accounts never expose opponent actions. */
            <div className="py-8 text-center">
              <Swords className="mx-auto mb-3 h-8 w-8 text-[#8C8C90]" />
              <p className="font-inter text-sm font-semibold text-[#F4F2ED]">
                This is your own account
              </p>
              <p className="mx-auto mt-2 max-w-xs font-inter text-xs leading-relaxed text-[#8C8C90]">
                Rivalries compare your verified activity against another member. Open someone
                else&apos;s profile to compare and challenge.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-[#C81E3A] px-5 py-2.5 font-inter text-xs font-semibold text-white hover:bg-[#A0182E]"
              >
                Got it
              </button>
            </div>
          ) : (
            <>
              {/* Versus Card Header */}
              <div className="grid grid-cols-2 gap-3 my-6 relative">
                {/* VS Badge in center */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-[#C81E3A] border-2 border-[#17171A] flex items-center justify-center font-anton text-xs text-white shadow-lg">
                  VS
                </div>

                {/* YOU Box */}
                <div className="svj-radius-row flex flex-col items-center border border-[#C81E3A]/35 bg-[#08080A] p-4 text-center">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-[#C81E3A] mb-2">
                    <AvatarImage
                      src={user.avatar}
                      name={user.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="font-inter text-sm font-semibold text-[#F4F2ED]">
                    {user.name}
                  </span>
                  <span className="font-inter text-[10px] text-[#8C8C90]">Rank {myRankLabel}</span>
                  <div className="mt-2 font-mono text-lg font-bold text-[#E62846]">
                    {user.totalXP.toLocaleString()} XP
                  </div>
                </div>

                {/* TARGET MEMBER Box */}
                <div className="svj-radius-row flex flex-col items-center border border-white/[0.08] bg-[#08080A] p-4 text-center">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white/20 mb-2">
                    <AvatarImage
                      src={member.avatar}
                      name={member.username}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="font-inter text-sm font-semibold text-[#F4F2ED]">
                    {member.username}
                  </span>
                  <span className="font-inter text-[10px] text-[#8C8C90]">Rank #{member.rank}</span>
                  <div className="mt-2 font-mono text-lg font-bold text-gold">
                    {member.totalXP.toLocaleString()} XP
                  </div>
                </div>
              </div>

              {/* XP Difference & Estimated Catch-up */}
              <div className="svj-radius-row mb-6 border border-white/[0.06] bg-gradient-to-r from-[#C81E3A]/15 via-[#17171A] to-[#C9A227]/10 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-inter text-xs text-[#8C8C90]">
                    <Zap className="h-3.5 w-3.5 text-[#E62846]" />
                    Lifetime XP gap
                  </span>
                  <span className="font-mono text-sm font-bold text-[#F4F2ED]">
                    {xpDiff.toLocaleString()} XP
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-inter text-xs text-[#8C8C90]">
                    <Clock className="h-3.5 w-3.5 text-gold" />
                    Right now
                  </span>
                  <span className="text-right font-inter text-xs font-semibold text-emerald-400">
                    {isUserAhead
                      ? "You lead by " + xpDiff.toLocaleString() + " XP"
                      : `${member.username} leads by ${xpDiff.toLocaleString()} XP`}
                  </span>
                </div>
              </div>

              {/* Visual XP Progress Dual Bar */}
              <div className="space-y-4 mb-6">
                <div>
                  <div className="mb-1.5 flex justify-between font-inter text-xs">
                    <span className="text-[#F4F2ED]">You</span>
                    <span className="font-mono text-[#E62846]">
                      {user.totalXP.toLocaleString()} XP · {userPercent}%
                    </span>
                  </div>
                  <SVJProgress value={userPercent} color="crimson" height="h-2.5" />
                </div>

                <div>
                  <div className="mb-1.5 flex justify-between font-inter text-xs">
                    <span className="text-[#F4F2ED]">{member.username}</span>
                    <span className="font-mono text-gold">
                      {member.totalXP.toLocaleString()} XP · {memberPercent}%
                    </span>
                  </div>
                  <SVJProgress value={memberPercent} color="gold" height="h-2.5" />
                </div>
              </div>

              {/* Weekly & Monthly Comparison Table */}
              <div className="mb-6 space-y-3">
                <SVJSectionHeader title="Performance breakdown" />

                <div className="svj-radius-row grid grid-cols-3 gap-2 divide-x divide-white/[0.05] border border-white/[0.05] bg-[#08080A] py-3 text-center">
                  <div className="px-1">
                    <p className="mb-1 font-inter text-[10px] text-[#8C8C90]">Weekly XP</p>
                    <p className="font-mono text-sm font-bold text-[#F4F2ED]">
                      {user.weeklyXP}
                      <span className="text-[#8C8C90]"> vs </span>
                      {member.weeklyXP}
                    </p>
                  </div>
                  <div className="px-1">
                    <p className="mb-1 font-inter text-[10px] text-[#8C8C90]">Monthly XP</p>
                    <p className="font-mono text-sm font-bold text-[#F4F2ED]">
                      {user.monthlyXP}
                      <span className="text-[#8C8C90]"> vs </span>
                      {member.monthlyXP}
                    </p>
                  </div>
                  <div className="px-1">
                    <p className="mb-1 font-inter text-[10px] text-[#8C8C90]">Streak</p>
                    <p className="font-mono text-sm font-bold text-[#F4F2ED]">
                      {user.currentStreak}d<span className="text-[#8C8C90]"> vs </span>
                      {member.streak}d
                    </p>
                  </div>
                </div>
              </div>

              {showRivalry && rivalry?.status === "active" && (
                <div className="svj-radius-row mb-6 border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-inter text-sm font-semibold text-emerald-400">
                        Live rivalry score
                      </p>
                      <p className="mt-1 font-inter text-[10px] leading-relaxed text-[#8C8C90]">
                        Only verified SVJ activity recorded after the rivalry started counts here.
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-inter text-[10px] font-semibold text-emerald-400">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Live
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-2xl border border-[#C81E3A]/30 bg-[#0B0B0C] p-3">
                      <p className="text-[10px] font-mono uppercase text-[#8C8C90]">You</p>
                      <p className="mt-1 font-mono text-xl font-bold text-[#C81E3A]">
                        +{rivalry.myScore ?? 0}
                      </p>
                      <p className="text-[10px] font-mono text-[#8C8C90]">
                        {rivalry.myEvents ?? 0} activities
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gold/30 bg-[#0B0B0C] p-3">
                      <p className="text-[10px] font-mono uppercase text-[#8C8C90]">
                        {member.username}
                      </p>
                      <p className="mt-1 font-mono text-xl font-bold text-gold">
                        +{rivalry.opponentScore ?? 0}
                      </p>
                      <p className="text-[10px] font-mono text-[#8C8C90]">
                        {rivalry.opponentEvents ?? 0} activities
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-center text-[10px] font-mono text-[#8C8C90]">
                    {rivalry.expiresAt
                      ? `Ends ${new Date(rivalry.expiresAt).toLocaleString("en-IN")}`
                      : "End time is being set"}
                  </p>
                </div>
              )}

              {/* Action CTA */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (rivalry?.status === "active") setShowRivalry(true);
                  else void handleLockIn();
                }}
                disabled={sending || rivalry?.status === "pending"}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3 font-inter text-sm font-semibold text-white shadow-lg shadow-[#C81E3A]/20 transition-colors hover:bg-[#A0182E] disabled:opacity-60"
              >
                <span>{sending ? "Sending…" : actionLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
              {rivalry?.status === "pending" && rivalry.challengerId === user.id && (
                <p role="status" className="mt-2 text-center font-inter text-xs text-emerald-400">
                  Request sent — waiting for @{member.username}.
                </p>
              )}
              {actionError && (
                <div
                  role="alert"
                  className="mt-2 flex flex-col items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2"
                >
                  <p className="text-center text-xs font-mono text-rose-300">{actionError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      void handleLockIn();
                    }}
                    disabled={sending}
                    className="rounded-lg border border-rose-500/40 px-3 py-1 font-inter text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
