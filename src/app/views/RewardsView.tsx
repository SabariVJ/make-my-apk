import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Gift,
  Lock,
  Check,
  Sparkles,
  Zap,
  Copy,
  ArrowRight,
  ShieldCheck,
  X,
  BookOpen,
  Crown,
  ExternalLink,
  Sliders,
  Clock,
  RefreshCw,
  Calendar,
  Flame,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { RewardItem } from "../types";
import { RedeemPlusCodeForm } from "../components/RedeemPlusCodeForm";

export const RewardsView: React.FC = () => {
  const { rewards, redeemReward, user, updateUserProfile, triggerConfetti, setIsPaywallOpen } =
    useSVJ();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [activeModalReward, setActiveModalReward] = useState<RewardItem | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showNextWeekPreview, setShowNextWeekPreview] = useState(false);

  // Weekly Vault Countdown State
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({
    days: 3,
    hours: 14,
    minutes: 22,
    seconds: 45,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const nextSunday = new Date();
      nextSunday.setUTCDate(now.getUTCDate() + ((7 - now.getUTCDay()) % 7 || 7));
      nextSunday.setUTCHours(23, 59, 59, 999);

      const diff = nextSunday.getTime() - now.getTime();
      if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setTimeLeft({ days, hours, minutes, seconds });
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, []);

  const categories = ["All", "Cosmetic", "Guide", "VIP Perk"];

  const filteredRewards =
    selectedCategory === "All" ? rewards : rewards.filter((r) => r.category === selectedCategory);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Copied code: ${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const isFrameEquipped = (frameId?: string) => {
    if (!frameId) return false;
    return user.equippedFrame === frameId;
  };

  const handleToggleFrame = (frameId: string, title: string) => {
    if (user.equippedFrame === frameId) {
      updateUserProfile({ equippedFrame: "" });
      showToast(`Unequipped ${title}`);
    } else {
      updateUserProfile({ equippedFrame: frameId });
      showToast(`Equipped ${title} to Profile!`);
      triggerConfetti();
    }
  };

  const handleAccessReward = (item: RewardItem) => {
    if (item.category === "Cosmetic") {
      if (item.cosmeticId === "samurai" || item.cosmeticId === "theme-crimson-night") {
        const isThemeActive = user.evolutionTheme === "samurai";
        updateUserProfile({ evolutionTheme: isThemeActive ? "wolf" : "samurai" });
        showToast(isThemeActive ? "Switched to Default Theme" : "Equipped SVJ Obsidian Theme!");
        triggerConfetti();
      } else if (
        item.cosmeticId === "frame-crimson" ||
        item.cosmeticId === "frame-gold" ||
        item.cosmeticId === "frame-cyber"
      ) {
        handleToggleFrame(item.cosmeticId, item.title);
      } else {
        handleToggleFrame("frame-crimson", item.title);
      }
    } else {
      setActiveModalReward(item);
    }
  };

  return (
    <div className="space-y-6 pb-24 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 px-4 py-2.5 rounded-2xl bg-emerald-500 text-black font-mono text-xs font-bold shadow-2xl flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="relative rounded-3xl bg-[#17171A] border border-white/10 p-6 overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#C81E3A]/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#8C8C90] uppercase tracking-wider mb-1">
              <Gift className="w-3.5 h-3.5 text-[#C81E3A]" />
              <span>Rewards Vault</span>
              <span>•</span>
              <span className="text-[#C81E3A] font-bold">Earned Honor Perks</span>
            </div>
            <h1 className="font-anton text-3xl sm:text-4xl text-white uppercase tracking-wide">
              The SVJ Vault
            </h1>
            <p className="text-xs text-[#8C8C90] font-inter mt-1">
              Exchange your earned discipline XP for elite themes, guides, and steel membership
              perks.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/10 text-center shrink-0">
            <div className="text-[10px] font-mono text-[#8C8C90] uppercase">Available Balance</div>
            <div className="text-2xl font-anton text-[#C81E3A]">
              {user.totalXP.toLocaleString()} XP
            </div>
            <div className="text-[10px] font-mono text-emerald-400">Ready to Redeem</div>
          </div>
        </div>
      </div>

      {/* Weekly Rotation Timer Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#17171A] via-[#1F1216] to-[#17171A] border border-[#C81E3A]/30 p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C81E3A]/20 border border-[#C81E3A]/50 flex items-center justify-center text-[#C81E3A] shrink-0 animate-pulse">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-anton text-sm text-white uppercase tracking-wide">
                Weekly Vault Rotation (Season 14)
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold border border-amber-500/30 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> NEW REWARDS WEEKLY
              </span>
            </div>
            <p className="text-xs font-mono text-[#8C8C90] mt-0.5">
              Vault items rotate every Sunday. Claim current unlocked perks before reset!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-white/10">
          {/* Live Countdown Ticker */}
          <div className="flex items-center gap-1.5 font-mono">
            <div className="text-center px-2 py-1 rounded-lg bg-black/60 border border-white/10">
              <div className="text-xs font-bold text-white">
                {String(timeLeft.days).padStart(2, "0")}
              </div>
              <div className="text-[8px] text-[#8C8C90]">DAYS</div>
            </div>
            <span className="text-white font-bold">:</span>
            <div className="text-center px-2 py-1 rounded-lg bg-black/60 border border-white/10">
              <div className="text-xs font-bold text-white">
                {String(timeLeft.hours).padStart(2, "0")}
              </div>
              <div className="text-[8px] text-[#8C8C90]">HRS</div>
            </div>
            <span className="text-white font-bold">:</span>
            <div className="text-center px-2 py-1 rounded-lg bg-black/60 border border-white/10">
              <div className="text-xs font-bold text-white">
                {String(timeLeft.minutes).padStart(2, "0")}
              </div>
              <div className="text-[8px] text-[#8C8C90]">MIN</div>
            </div>
            <span className="text-white font-bold">:</span>
            <div className="text-center px-2 py-1 rounded-lg bg-black/60 border border-white/10">
              <div className="text-xs font-bold text-amber-400">
                {String(timeLeft.seconds).padStart(2, "0")}
              </div>
              <div className="text-[8px] text-[#8C8C90]">SEC</div>
            </div>
          </div>

          <button
            onClick={() => setShowNextWeekPreview(true)}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Next Batch Teaser</span>
          </button>
        </div>
      </div>

      {/* Redeem a 60-Day Challenge code */}
      <RedeemPlusCodeForm
        heading="Redeem a 60-Day Challenge code"
        description="Earned an SVJ-XXXX-XXXX code from the 60-Day Gauntlet? Enter it below to activate 2 months of SVJ Plus. Codes are single-use and locked to your account."
      />

      {/* Category Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-mono transition-all shrink-0 cursor-pointer ${
              selectedCategory === cat
                ? "bg-[#C81E3A] text-white font-bold shadow-lg shadow-[#C81E3A]/20"
                : "bg-[#17171A] text-[#8C8C90] hover:text-white border border-white/5"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Rewards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredRewards.map((item) => {
          const canAfford = user.totalXP >= item.xpCost;

          return (
            <motion.div
              key={item.id}
              whileHover={{ y: -2 }}
              className="rounded-2xl bg-[#17171A] border border-white/10 overflow-hidden flex flex-col justify-between shadow-xl"
            >
              <div>
                {/* Image & Badges */}
                <div className="relative h-40 overflow-hidden bg-[#0B0B0C]">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#17171A] via-transparent to-black/40" />

                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-full bg-black/80 backdrop-blur border border-white/10 text-[10px] font-mono text-white">
                      {item.category}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-[#C81E3A]/80 text-white text-[10px] font-mono font-bold">
                      {item.minTier} Tier
                    </span>
                  </div>

                  {item.isPremiumOnly && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-amber-500 text-black font-anton text-[9px] uppercase tracking-wider">
                      SVJ PLUS EXCLUSIVE
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-4 space-y-2">
                  <h3 className="font-anton text-lg text-white uppercase">{item.title}</h3>
                  <p className="text-xs text-[#8C8C90] font-inter leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Action Button Footer */}
              <div className="p-4 border-t border-white/5 flex items-center justify-between gap-3">
                <div className="text-sm font-mono font-bold text-[#C81E3A]">
                  {item.xpCost.toLocaleString()} XP
                </div>

                {item.unlocked ? (
                  item.category === "Cosmetic" ? (
                    (() => {
                      const isEquipped =
                        item.cosmeticId === "samurai"
                          ? user.evolutionTheme === "samurai"
                          : isFrameEquipped(item.cosmeticId);

                      return (
                        <button
                          onClick={() => handleAccessReward(item)}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-lg transition-all ${
                            isEquipped
                              ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-amber-500/20"
                              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
                          }`}
                        >
                          <Sparkles
                            className={`w-4 h-4 ${isEquipped ? "text-black" : "text-emerald-200"}`}
                          />
                          <span>
                            {isEquipped
                              ? "✓ EQUIPPED (ACTIVE)"
                              : `Equip ${item.title.split(" ")[0]}`}
                          </span>
                        </button>
                      );
                    })()
                  ) : (
                    <button
                      onClick={() => handleAccessReward(item)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-lg transition-all"
                    >
                      <Check className="w-4 h-4 text-emerald-200" />
                      <span>{item.actionLabel || "Access Reward"}</span>
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => redeemReward(item.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-anton tracking-wider uppercase flex items-center gap-1.5 cursor-pointer transition-all ${
                      canAfford
                        ? "bg-[#C81E3A] hover:bg-[#A0182E] text-white shadow-lg shadow-[#C81E3A]/20"
                        : "bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:text-white"
                    }`}
                  >
                    {!canAfford && <Lock className="w-3.5 h-3.5" />}
                    <span>{canAfford ? "Redeem Item" : "Lock & Save XP"}</span>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Reward Content Access Modal */}
      <AnimatePresence>
        {activeModalReward && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-3xl bg-[#121214] border border-white/10 p-6 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/40 flex items-center justify-center text-[#C81E3A]">
                    {activeModalReward.category === "Guide" ? (
                      <BookOpen className="w-4 h-4" />
                    ) : (
                      <Crown className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-anton text-lg text-white uppercase tracking-wide">
                      {activeModalReward.title}
                    </h2>
                    <p className="text-[10px] font-mono text-[#8C8C90]">
                      Unlocked Vault Asset • {activeModalReward.category}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveModalReward(null)}
                  className="p-2 rounded-full text-[#8C8C90] hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="py-4 overflow-y-auto space-y-4 flex-1">
                {activeModalReward.category === "Guide" ? (
                  <div className="space-y-4 font-inter">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-xs text-slate-200 leading-relaxed whitespace-pre-line font-mono">
                      {activeModalReward.guideContent || activeModalReward.description}
                    </div>

                    {activeModalReward.code && (
                      <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-mono text-emerald-400 uppercase">
                            Access Passkey
                          </div>
                          <div className="text-sm font-mono font-bold text-white">
                            {activeModalReward.code}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopyCode(activeModalReward.code!)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-400"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Passkey</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs leading-relaxed space-y-2">
                      <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
                        <Crown className="w-4 h-4" />
                        <span>VIP PERK DETAILS</span>
                      </div>
                      <p className="whitespace-pre-line">
                        {activeModalReward.perkDetails || activeModalReward.description}
                      </p>
                    </div>

                    {activeModalReward.code && (
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-mono text-[#8C8C90] uppercase">
                            Voucher Redemption Code
                          </div>
                          <div className="text-lg font-mono font-bold text-white">
                            {activeModalReward.code}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopyCode(activeModalReward.code!)}
                          className="px-4 py-2 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold flex items-center gap-2 cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                          <span>Copy Voucher Code</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => setActiveModalReward(null)}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-xs font-bold cursor-pointer transition-colors"
                >
                  Close Vault Item
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Next Week Batch Teaser Modal */}
      <AnimatePresence>
        {showNextWeekPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-xl rounded-3xl bg-[#121214] border border-amber-500/30 p-6 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-anton text-lg text-white uppercase tracking-wide">
                      Upcoming Week 15 Vault Drop
                    </h2>
                    <p className="text-[10px] font-mono text-amber-400">
                      Replaces Current Vault in {timeLeft.days}d {timeLeft.hours}h{" "}
                      {timeLeft.minutes}m
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNextWeekPreview(false)}
                  className="p-2 rounded-full text-[#8C8C90] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-3 font-mono">
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-purple-900/50 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold shrink-0">
                    ⚡
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      Cyber Neon Halo Frame
                    </div>
                    <p className="text-[10px] text-[#8C8C90]">
                      Cosmetic • Animated Pulsing Cyan/Violet Avatar Glow
                    </p>
                  </div>
                  <span className="ml-auto text-xs text-amber-400 font-bold">6,000 XP</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-900/50 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold shrink-0">
                    📖
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      Sovereign State Focus Manual Vol 2
                    </div>
                    <p className="text-[10px] text-[#8C8C90]">
                      Guide • Advanced Neuro-Acoustic Workstation Setup
                    </p>
                  </div>
                  <span className="ml-auto text-xs text-amber-400 font-bold">8,500 XP</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-900/50 border border-amber-500/30 flex items-center justify-center text-amber-300 font-bold shrink-0">
                    👑
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white uppercase">
                      SVJ Global Founder Summit Session #15
                    </div>
                    <p className="text-[10px] text-[#8C8C90]">
                      VIP Perk • Private AMA with Sabari & SVJ Athletics Team
                    </p>
                  </div>
                  <span className="ml-auto text-xs text-amber-400 font-bold">20,000 XP</span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#8C8C90]">
                  New Vault Drops Every Sunday 00:00 UTC
                </span>
                <button
                  onClick={() => setShowNextWeekPreview(false)}
                  className="px-4 py-2 rounded-xl bg-[#C81E3A] text-white font-mono text-xs font-bold cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
