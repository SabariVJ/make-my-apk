import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Crown, CheckCircle2, ArrowRight } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { TIERS } from "../data/initialData";

/**
 * THE signature motion moment.
 *
 * SVJ gets exactly one deliberate, choreographed animation and this is it: a
 * level-up sequence built as staged beats (emblem → tier name → perks →
 * action). Everything else in the app stays a short functional transition, so
 * the reward moment never competes with ordinary UI motion.
 *
 * Respects reduced motion through MotionConfig's `reducedMotion="user"` at the
 * app root, which collapses the variant transitions to instant state changes.
 */
export const LevelUpModal: React.FC = () => {
  const { levelUpModalData, setLevelUpModalData } = useSVJ();

  if (!levelUpModalData) return null;

  const newTierInfo = TIERS.find((t) => t.name === levelUpModalData.newTier) || TIERS[1];

  // Staged reveal: each beat waits for the previous one.
  const beat = (index: number) => ({
    delay: 0.12 + index * 0.11,
    duration: 0.42,
    ease: "easeOut" as const,
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="svj-radius-card svj-elev-3 relative w-full max-w-sm overflow-hidden border border-[#C9A227]/35 bg-gradient-to-b from-[#1C1710] via-[#141416] to-[#101012] p-5 text-center text-[#F4F2ED]"
        >
          {/* Premium-only ambience: a bronze halo + a single emissive ring. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#C9A227] opacity-20 blur-3xl"
          />

          <div className="relative">
            {/* Beat 1 — emblem lands, ring expands once, then settles. */}
            <div className="relative mx-auto mb-5 h-24 w-24">
              <motion.span
                aria-hidden
                initial={{ opacity: 0.55, scale: 0.6 }}
                animate={{ opacity: 0, scale: 1.5 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border border-[#C9A227]/50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
                className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[#C9A227]/50 bg-[#0B0B0C] text-4xl shadow-[0_0_34px_-8px_rgba(201,162,39,0.55)]"
              >
                {newTierInfo.icon}
                <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#C9A227]/50 bg-[#17171A]">
                  <Crown aria-hidden className="h-3.5 w-3.5 text-[#C9A227]" />
                </span>
              </motion.div>
            </div>

            {/* Beat 2 — the tier is named. */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={beat(1)}
            >
              <span className="inline-block rounded-full border border-[#C9A227]/35 bg-[#C9A227]/12 px-3 py-1 font-inter text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C9A227]">
                Tier reached
              </span>
              <h2 className="mt-2 font-anton text-3xl leading-none tracking-wide text-white">
                {newTierInfo.name} Tier
              </h2>
              <p className="mt-1.5 text-xs font-inter text-[#8C8C90]">{newTierInfo.description}</p>
            </motion.div>

            {/* Beat 3 — perks arrive one after another. */}
            <div className="mt-5 space-y-2 rounded-2xl border border-white/[0.06] bg-[#0B0B0C] p-4 text-left">
              <p className="font-inter text-[11px] font-semibold text-[#F4F2ED]">
                New perks unlocked
              </p>
              {newTierInfo.benefits.map((benefit, index) => (
                <motion.div
                  key={benefit}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={beat(2 + index)}
                  className="flex items-center gap-2 text-xs font-inter text-zinc-200"
                >
                  <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#C9A227]" />
                  <span>{benefit}</span>
                </motion.div>
              ))}
            </div>

            {/* Beat 4 — the single call to action. */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={beat(3)}
              whileTap={{ scale: 0.98 }}
              onClick={() => setLevelUpModalData(null)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C81E3A] py-3 font-anton uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] svj-press"
            >
              <span>Claim tier honour</span>
              <ArrowRight aria-hidden className="h-4 w-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
