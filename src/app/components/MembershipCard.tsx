import React, { useState } from "react";
import { motion } from "motion/react";
import { Shield, Crown, Sparkles, QrCode, RefreshCw, Share2, Check } from "lucide-react";
import { UserProfile } from "../types";

interface MembershipCardProps {
  user: UserProfile;
}

export const MembershipCard: React.FC<MembershipCardProps> = ({ user }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(
      `SVJ Member Card: ${user.name} (@${user.username}) | Tier: ${user.tier} | Member ID: ${user.memberId}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-md mx-auto my-6 perspective-1000">
      <div className="relative flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#C9A227]" />
          <div className="leading-tight">
            <span className="block font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C9A227]">
              Membership
            </span>
            <span className="block font-inter text-sm font-semibold text-[#F4F2ED]">
              Your SVJ digital card
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg bg-[#17171A] hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1 border border-white/10"
            title="Share Card"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            <span className="text-[11px]">{copied ? "Copied" : "Share"}</span>
          </button>
          <button
            onClick={() => setIsFlipped(!isFlipped)}
            className="p-1.5 rounded-lg bg-[#17171A] hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer text-xs flex items-center gap-1 border border-white/10"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="text-[11px]">Flip</span>
          </button>
        </div>
      </div>

      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden cursor-pointer shadow-2xl shadow-black/80 border border-white/15 group"
        onClick={() => setIsFlipped(!isFlipped)}
        whileTap={{ scale: 0.97 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* CARD FRONT */}
        <div
          className="absolute inset-0 p-4 flex flex-col justify-between bg-gradient-to-br from-[#1B1B20] via-[#111114] to-[#0A0A0C] text-[#F4F2ED]"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Premium treatment: brushed-metal base, a bronze-to-gold foil
              band, and a soft top light. This is the app's one "wallet card"
              moment, so it is deliberately richer than an ordinary surface. */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,#1B1B20_0%,#101013_38%,#17171B_62%,#0A0A0C_100%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.22] bg-[repeating-linear-gradient(105deg,rgba(255,255,255,0.06)_0px,rgba(255,255,255,0.06)_1px,transparent_1px,transparent_4px)]" />
          <div className="pointer-events-none absolute -left-1/3 top-0 h-full w-2/3 rotate-12 bg-[linear-gradient(90deg,transparent_0%,rgba(201,162,39,0.16)_35%,rgba(240,220,150,0.26)_50%,rgba(201,162,39,0.16)_65%,transparent_100%)] blur-[1px]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#C81E3A]/16 via-transparent to-transparent" />
          <div className="pointer-events-none absolute inset-0 border border-[#C9A227]/15" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          {/* Top Row */}
          <div className="relative z-10 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#C81E3A] flex items-center justify-center font-anton text-lg text-white shadow-md shadow-[#C81E3A]/30">
                SVJ
              </div>
              <div>
                <span className="font-anton tracking-widest text-lg block leading-none text-white">
                  SVJ MEMBER
                </span>
                <span className="text-[9px] font-mono text-[#8C8C90] uppercase tracking-wider">
                  Self-Improvement Guild
                </span>
              </div>
            </div>

            {/* Chip & Tier Badge */}
            <div className="flex items-center gap-2">
              <div className="w-9 h-7 rounded-2xl bg-gradient-to-br from-gold via-gold to-gold p-[1px] shadow-sm opacity-90">
                <div className="w-full h-full bg-[#121215] rounded-[3px] flex items-center justify-center">
                  <div className="w-5 h-4 border border-gold/40 rounded-[2px]" />
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/50 text-[#C81E3A] text-[10px] font-anton tracking-wider uppercase flex items-center gap-1">
                <Crown className="w-3 h-3" />
                {user.tier}
              </div>
            </div>
          </div>

          {/* Center Member Name & ID */}
          <div className="relative z-10 my-auto">
            <div className="text-[10px] font-mono text-[#8C8C90] uppercase tracking-widest mb-0.5">
              Cardholder Name
            </div>
            <div className="font-anton text-2xl tracking-wider text-white uppercase flex items-center gap-2">
              {user.name}
              {user.verifiedIcon && <Shield className="w-4 h-4 text-[#C81E3A] fill-[#C81E3A]/30" />}
            </div>
            <div className="text-xs font-mono text-[#8C8C90] mt-0.5">@{user.username}</div>
          </div>

          {/* Bottom Card Footer */}
          <div className="relative z-10 flex items-end justify-between border-t border-white/10 pt-3">
            <div>
              <div className="text-[8px] font-mono text-[#8C8C90] uppercase">Member Serial</div>
              <div className="text-xs font-mono font-bold tracking-widest text-white">
                {user.memberId}
              </div>
            </div>
            <div>
              <div className="text-[8px] font-mono text-[#8C8C90] uppercase">Total XP</div>
              <div className="text-xs font-mono font-bold text-[#C81E3A]">
                {user.totalXP.toLocaleString()} XP
              </div>
            </div>
            <div>
              <div className="text-[8px] font-mono text-[#8C8C90] uppercase">Since</div>
              <div className="text-xs font-mono text-white">{user.joinDate}</div>
            </div>
          </div>
        </div>

        {/* CARD BACK */}
        <div
          className="absolute inset-0 p-4 flex flex-col justify-between bg-gradient-to-br from-[#0F0F12] via-[#17171C] to-[#0A0A0C] text-[#F4F2ED]"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {/* Magnetic Strip */}
          <div className="w-full h-8 bg-black/90 -mx-5 px-5 flex items-center justify-end text-[9px] font-mono text-zinc-600">
            MAGNETIC ENCODED 882193-SVJ
          </div>

          <div className="flex items-center justify-between gap-4 my-2">
            <div className="flex-1">
              <div className="text-[9px] font-mono text-[#8C8C90] uppercase mb-1">
                Authorized Signature
              </div>
              <div className="h-8 bg-zinc-900 border border-white/10 rounded-2xl px-3 flex items-center font-serif italic text-sm text-zinc-300">
                {user.name}
              </div>
              <p className="text-[9px] font-mono text-zinc-500 mt-2 leading-relaxed">
                This digital card certifies active membership in the SVJ Self-Improvement Guild.
                Non-transferable.
              </p>
            </div>

            {/* QR Code Verification */}
            <div className="flex flex-col items-center justify-center p-1 rounded-lg bg-white text-black shadow-md">
              <img
                src="/qr-code.png"
                alt="Member QR Verification"
                className="w-12 h-12 object-contain"
                referrerPolicy="no-referrer"
              />
              <span className="text-[8px] font-mono font-bold text-black tracking-tight">
                VERIFIED
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] font-mono text-[#8C8C90]">
            <span>STREAK: {user.currentStreak} DAYS</span>
            <span className="text-[#C81E3A]">SVJ GUILD OFFICIAL</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
