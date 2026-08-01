import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Zap, CheckCircle2, ArrowRight } from 'lucide-react';
import { useSVJ } from '../context/SVJContext';
import { TIERS } from '../data/initialData';

export const LevelUpModal: React.FC = () => {
  const { levelUpModalData, setLevelUpModalData } = useSVJ();

  if (!levelUpModalData) return null;

  const newTierInfo = TIERS.find(t => t.name === levelUpModalData.newTier) || TIERS[1];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 30 }}
          className="relative w-full max-w-sm bg-[#17171A] border-2 border-[#C81E3A] rounded-3xl p-6 text-center text-[#F4F2ED] shadow-2xl shadow-[#C81E3A]/30 overflow-hidden"
        >
          {/* Ambient Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#C81E3A]/30 via-transparent to-transparent pointer-events-none" />

          {/* Animated Tier Icon */}
          <motion.div
            animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#0B0B0C] border-2 border-[#C81E3A] flex items-center justify-center text-4xl shadow-xl shadow-[#C81E3A]/40"
          >
            {newTierInfo.icon}
          </motion.div>

          {/* Title */}
          <span className="px-3 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/40 text-[#C81E3A] text-xs font-mono font-bold uppercase tracking-widest inline-block mb-2">
            TIER LEVEL UP!
          </span>

          <h2 className="font-anton text-3xl tracking-wider uppercase text-white mb-1">
            {newTierInfo.name} Tier
          </h2>

          <p className="text-xs font-mono text-[#8C8C90] mb-6">
            {newTierInfo.description}
          </p>

          {/* Benefits Unlocked */}
          <div className="p-4 rounded-xl bg-[#0B0B0C] border border-white/10 text-left mb-6 space-y-2">
            <div className="text-[10px] font-mono text-[#C81E3A] uppercase font-bold tracking-wider mb-1">
              New Perks Unlocked:
            </div>
            {newTierInfo.benefits.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-inter text-zinc-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#C81E3A] shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </div>

          {/* Continue Action */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setLevelUpModalData(null)}
            className="w-full py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg shadow-[#C81E3A]/30 cursor-pointer"
          >
            <span>Claim Tier Honor</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
