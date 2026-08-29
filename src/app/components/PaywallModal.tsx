import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Crown, Check, ShieldCheck, Sparkles, ArrowRight, Zap, Flame, Lock } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { RedeemPlusCodeForm } from "./RedeemPlusCodeForm";

/** Format an ISO timestamp to a friendly locale string. Returns null on failure. */
function safeFormatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return null;
  }
}

export const PaywallModal: React.FC = () => {
  const { user, isPlusMember, plusExpiresAt, isPaywallOpen, setIsPaywallOpen, setIsUPIModalOpen } =
    useSVJ();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  if (!isPaywallOpen) return null;

  // ── Server-authoritative membership classification (display only) ──────────
  const hasActivePlus = user.isPremium === true;
  const hasLifetimePlus = hasActivePlus && isPlusMember === true && plusExpiresAt === null;
  const hasActiveTimedPlus = hasActivePlus && isPlusMember === true && plusExpiresAt !== null;
  const hasExpiredTimedPlus = !hasActivePlus && isPlusMember === true && plusExpiresAt !== null;

  const formattedExpiry = safeFormatDate(plusExpiresAt);

  const benefits = [
    {
      title: "Animated Profile Frames",
      icon: Sparkles,
      desc: "Glow Crimson, Cyber Violet, Golden Majesty",
    },
    {
      title: "Exclusive Themes",
      icon: Flame,
      desc: "Unlock rare dark themes — Obsidian, Void, Crimson Night",
    },
    {
      title: "Premium Badges",
      icon: ShieldCheck,
      desc: "Verified icon, VIP badge, rare achievement badges & animated avatars",
    },
    {
      title: "Advanced Analytics",
      icon: Zap,
      desc: "Deep XP insights, habit completion trends & performance breakdowns",
    },
    {
      title: "Leaderboard Insights",
      icon: Crown,
      desc: "See exactly who to beat, gap analysis & rank trajectory forecasts",
    },
    {
      title: "Early Access",
      icon: Lock,
      desc: "First access to new challenges, features & exclusive community drops",
    },
  ];

  const handleStartTrial = () => {
    setIsPaywallOpen(false);
    setIsUPIModalOpen(true);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-xl bg-[#0B0B0C] border border-[#C81E3A]/40 rounded-3xl p-6 sm:p-8 text-[#F4F2ED] shadow-2xl overflow-hidden my-auto"
        >
          {/* Ambient Lighting Background */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#C81E3A]/15 blur-3xl rounded-full pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={() => setIsPaywallOpen(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ACTIVE LIFETIME PLUS (Founder or non-Founder lifetime)         */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {hasLifetimePlus && (
            <div className="relative z-10 space-y-6">
              {/* Hero Branding */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/50 text-[#C81E3A] text-xs font-mono font-bold tracking-widest uppercase">
                  <Crown className="w-3.5 h-3.5" />
                  <span>SVJ PLUS</span>
                </div>

                <h1 className="font-anton text-3xl sm:text-4xl tracking-wide uppercase text-white leading-tight">
                  {user.isFounder ? "Founder — Lifetime" : "Lifetime"}{" "}
                  <span className="text-[#C81E3A]">SVJ Plus Active</span>
                </h1>

                <p className="text-xs sm:text-sm text-[#8C8C90] font-inter max-w-md mx-auto leading-relaxed">
                  {user.isFounder
                    ? "Your Founder account includes lifetime SVJ Plus. No payment or renewal is required."
                    : "SVJ Plus is permanently active on this account. No payment or renewal is required."}
                </p>
              </div>

              {/* Active Status Banner */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-mono text-sm font-bold">
                  <Check className="w-5 h-5" />
                  Lifetime SVJ Plus Active
                </div>
                <p className="text-[11px] font-mono text-emerald-300/70">
                  Your membership is permanent. No expiry date.
                </p>
              </div>

              {/* Benefits as "Your Benefits" */}
              <div className="relative z-10 space-y-3">
                <h3 className="text-xs font-mono text-[#8C8C90] uppercase tracking-wider text-center">
                  Your Benefits
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {benefits.map((b, i) => {
                    const Icon = b.icon;
                    return (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-[#17171A] border border-white/5 flex items-start gap-3"
                      >
                        <div className="p-2 rounded-lg bg-[#0B0B0C] text-[#C81E3A] shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-inter font-bold text-white">{b.title}</div>
                          <div className="text-[11px] font-inter text-[#8C8C90] leading-tight mt-0.5">
                            {b.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ACTIVE TIMED PLUS                                               */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {hasActiveTimedPlus && (
            <div className="relative z-10 space-y-6">
              {/* Hero Branding */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/50 text-[#C81E3A] text-xs font-mono font-bold tracking-widest uppercase">
                  <Crown className="w-3.5 h-3.5" />
                  <span>SVJ PLUS</span>
                </div>

                <h1 className="font-anton text-3xl sm:text-4xl tracking-wide uppercase text-white leading-tight">
                  <span className="text-[#C81E3A]">SVJ Plus Active</span>
                </h1>
              </div>

              {/* Active Status with Expiry */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-mono text-sm font-bold">
                  <Check className="w-5 h-5" />
                  SVJ Plus Active
                </div>
                <p className="text-[11px] font-mono text-emerald-300/70">
                  {formattedExpiry
                    ? `Your membership is active until ${formattedExpiry}.`
                    : "SVJ Plus is currently active."}
                </p>
              </div>

              {/* Redeem Code to Extend */}
              <div className="space-y-3">
                <p className="text-xs font-mono text-[#8C8C90] text-center">
                  Have another reward code? Redeem it to extend your membership.
                </p>
                <RedeemPlusCodeForm />
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* EXPIRED TIMED PLUS  /  FREE / TRIAL                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {!hasLifetimePlus && !hasActiveTimedPlus && (
            <div className="relative z-10 space-y-6">
              {/* Hero Branding */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/50 text-[#C81E3A] text-xs font-mono font-bold tracking-widest uppercase">
                  <Crown className="w-3.5 h-3.5" />
                  <span>SVJ PLUS</span>
                </div>

                <h1 className="font-anton text-3xl sm:text-4xl tracking-wide uppercase text-white leading-tight">
                  Become the <span className="text-[#C81E3A]">Strongest</span> Version
                </h1>

                <p className="text-xs sm:text-sm text-[#8C8C90] font-inter max-w-md mx-auto leading-relaxed">
                  Unlock the full SVJ experience. Premium cosmetics, deep analytics, and exclusive
                  community access.
                </p>
              </div>

              {/* Expired timed Plus banner */}
              {hasExpiredTimedPlus && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-1">
                  <p className="text-xs font-mono font-bold text-amber-400">
                    Your previous SVJ Plus membership has expired.
                  </p>
                  {formattedExpiry && (
                    <p className="text-[11px] font-mono text-amber-300/70">
                      Expired on {formattedExpiry}.
                    </p>
                  )}
                </div>
              )}

              {/* Plan Selector Toggle */}
              <div className="p-1 rounded-2xl bg-[#17171A] border border-white/10 max-w-xs mx-auto grid grid-cols-2 text-xs font-mono">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={`py-2.5 rounded-xl font-semibold transition-all cursor-pointer ${
                    billingCycle === "monthly"
                      ? "bg-[#0B0B0C] text-white shadow"
                      : "text-[#8C8C90] hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle("yearly")}
                  className={`relative py-2.5 rounded-xl font-semibold transition-all cursor-pointer ${
                    billingCycle === "yearly"
                      ? "bg-[#C81E3A] text-white shadow-lg shadow-[#C81E3A]/30"
                      : "text-[#8C8C90] hover:text-white"
                  }`}
                >
                  Yearly
                  <span className="absolute -top-2 -right-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-[9px] font-bold text-black uppercase">
                    Save 58%
                  </span>
                </button>
              </div>

              {/* Pricing Display Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {/* Monthly Card */}
                <div
                  onClick={() => setBillingCycle("monthly")}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    billingCycle === "monthly"
                      ? "bg-[#17171A] border-[#C81E3A]"
                      : "bg-[#17171A]/50 border-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="text-xs font-mono text-[#8C8C90] font-bold uppercase mb-1">
                    Monthly
                  </div>
                  <div className="text-2xl font-anton text-white">
                    ₹149
                    <span className="text-xs font-mono text-[#8C8C90] font-normal"> / month</span>
                  </div>
                  <p className="text-[10px] font-mono text-[#8C8C90] mt-1">Billed every month</p>
                </div>

                {/* Yearly Card (Best Value) */}
                <div
                  onClick={() => setBillingCycle("yearly")}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${
                    billingCycle === "yearly"
                      ? "bg-[#17171A] border-[#C81E3A] shadow-xl shadow-[#C81E3A]/10"
                      : "bg-[#17171A]/50 border-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="absolute -top-2.5 left-4 px-2 py-0.5 rounded bg-[#C81E3A] text-[9px] font-anton text-white uppercase tracking-wider">
                    BEST VALUE
                  </div>
                  <div className="text-xs font-mono text-[#8C8C90] font-bold uppercase mb-1">
                    Yearly
                  </div>
                  <div className="text-2xl font-anton text-white flex items-baseline gap-1">
                    ₹999
                    <span className="text-xs font-mono text-[#8C8C90] font-normal"> / year</span>
                  </div>
                  <p className="text-[10px] font-mono text-emerald-400 mt-1 font-semibold">
                    Save ₹689 vs monthly
                  </p>
                </div>
              </div>

              {/* Features Grid */}
              <div className="space-y-3 mb-8">
                <h3 className="text-xs font-mono text-[#8C8C90] uppercase tracking-wider text-center">
                  What You Get
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {benefits.map((b, i) => {
                    const Icon = b.icon;
                    return (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-[#17171A] border border-white/5 flex items-start gap-3"
                      >
                        <div className="p-2 rounded-lg bg-[#0B0B0C] text-[#C81E3A] shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-inter font-bold text-white">{b.title}</div>
                          <div className="text-[11px] font-inter text-[#8C8C90] leading-tight mt-0.5">
                            {b.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CTA & Guarantees */}
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStartTrial}
                  className="w-full py-4 rounded-2xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton text-lg tracking-wider uppercase flex items-center justify-center gap-2 shadow-2xl shadow-[#C81E3A]/40 cursor-pointer"
                >
                  <span>Upgrade to SVJ Plus</span>
                  <ArrowRight className="w-5 h-5" />
                </motion.button>

                <div className="flex items-center justify-center gap-4 text-[10px] font-mono text-[#8C8C90]">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Secure Payment
                  </span>
                  <span>•</span>
                  <span>Instant Access</span>
                  <span>•</span>
                  <span>Cancel Anytime</span>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
