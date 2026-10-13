import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Play, Sparkles, Shield, Compass, Palette, Layers, Smartphone } from "lucide-react";
import { StartupAnimation, AnimationConcept } from "./StartupAnimation";

interface BrandShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrandShowcaseModal: React.FC<BrandShowcaseModalProps> = ({ isOpen, onClose }) => {
  const [activeAnimation, setActiveAnimation] = useState<AnimationConcept | null>(null);

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        {activeAnimation && (
          <StartupAnimation
            concept={activeAnimation}
            forceShow={true}
            onComplete={() => setActiveAnimation(null)}
          />
        )}
      </AnimatePresence>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0D0E12] border border-white/10 p-6 shadow-2xl text-[#ECEEF2]"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#13151A] border border-[#00F59B]/40 p-2 flex items-center justify-center">
                <img src="/brand/zenexis-symbol.svg" alt="ZENEXIS" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="font-inter font-black text-lg tracking-[0.15em] text-white uppercase">
                  ZENEXIS Identity Lab
                </h2>
                <p className="text-xs text-[#00F59B] font-mono tracking-wider">
                  ASCEND TO YOUR APEX — BRAND SPECIFICATION
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#8C8C90] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Section: Startup Animation Previews */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Play className="w-4 h-4 text-[#00F59B]" />
              <h3 className="text-xs font-mono font-bold tracking-wider text-[#8C8C90] uppercase">
                Interactive Startup Animation Previews
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Concept B */}
              <button
                onClick={() => setActiveAnimation("precision-reveal")}
                className="group p-4 rounded-2xl bg-[#14161C] border border-white/5 hover:border-[#00F59B]/40 text-left transition-all hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#00F59B]/10 text-[#00F59B] font-bold">
                    ACTIVE DEFAULT
                  </span>
                  <Play className="w-3.5 h-3.5 text-[#00F59B] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h4 className="font-inter font-bold text-sm text-white">Precision Reveal</h4>
                <p className="text-[11px] text-[#8C8C90] mt-1 leading-relaxed">
                  Fine geometric lines assemble with spring damping, specular rim glint, and typography unmask.
                </p>
              </button>

              {/* Concept A */}
              <button
                onClick={() => setActiveAnimation("energy-formation")}
                className="group p-4 rounded-2xl bg-[#14161C] border border-white/5 hover:border-[#00F59B]/40 text-left transition-all hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-[#8C8C90]">
                    CONCEPT A
                  </span>
                  <Play className="w-3.5 h-3.5 text-[#00F59B] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h4 className="font-inter font-bold text-sm text-white">Energy Formation</h4>
                <p className="text-[11px] text-[#8C8C90] mt-1 leading-relaxed">
                  Abstract emerald energy particles converge radially into the dual-chevron with shockwave light pulse.
                </p>
              </button>

              {/* Concept C */}
              <button
                onClick={() => setActiveAnimation("cinematic-transformation")}
                className="group p-4 rounded-2xl bg-[#14161C] border border-white/5 hover:border-[#00F59B]/40 text-left transition-all hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-[#8C8C90]">
                    CONCEPT C
                  </span>
                  <Play className="w-3.5 h-3.5 text-[#00F59B] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h4 className="font-inter font-bold text-sm text-white">Transformation</h4>
                <p className="text-[11px] text-[#8C8C90] mt-1 leading-relaxed">
                  Fluid energy aura transforms into the sharp aerodynamic chevrons with high-contrast finish.
                </p>
              </button>
            </div>
          </div>

          {/* Section: Vector Asset Suite */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-[#00F59B]" />
              <h3 className="text-xs font-mono font-bold tracking-wider text-[#8C8C90] uppercase">
                Production Vector Asset Suite
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-[#14161C] border border-white/5 flex flex-col items-center text-center">
                <div className="w-16 h-16 p-2 flex items-center justify-center">
                  <img src="/brand/zenexis-symbol.svg" alt="Primary Symbol" className="w-full h-full object-contain" />
                </div>
                <span className="text-[11px] font-mono text-[#8C8C90] mt-2">Symbol (Dark)</span>
                <span className="text-[9px] text-[#00F59B] font-mono">SVG • Vector</span>
              </div>

              <div className="p-3 rounded-2xl bg-[#14161C] border border-white/5 flex flex-col items-center text-center">
                <div className="w-16 h-16 p-2 flex items-center justify-center">
                  <img src="/brand/zenexis-symbol-monochrome.svg" alt="Monochrome" className="w-full h-full object-contain" />
                </div>
                <span className="text-[11px] font-mono text-[#8C8C90] mt-2">Monochrome</span>
                <span className="text-[9px] text-[#00F59B] font-mono">SVG • Clean</span>
              </div>

              <div className="p-3 rounded-2xl bg-[#14161C] border border-white/5 flex flex-col items-center text-center">
                <div className="w-16 h-16 p-1 flex items-center justify-center">
                  <img src="/brand/zenexis-app-icon.svg" alt="App Icon" className="w-full h-full object-contain rounded-2xl" />
                </div>
                <span className="text-[11px] font-mono text-[#8C8C90] mt-2">App Icon</span>
                <span className="text-[9px] text-[#00F59B] font-mono">iOS & Android</span>
              </div>

              <div className="p-3 rounded-2xl bg-[#14161C] border border-white/5 flex flex-col items-center text-center">
                <div className="w-16 h-16 p-2 flex items-center justify-center">
                  <img src="/brand/zenexis-wordmark.svg" alt="Wordmark" className="w-full h-full object-contain" />
                </div>
                <span className="text-[11px] font-mono text-[#8C8C90] mt-2">Wordmark</span>
                <span className="text-[9px] text-[#00F59B] font-mono">SVG • 640×140</span>
              </div>
            </div>
          </div>

          {/* Section: Color Palette Tokens */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-[#00F59B]" />
              <h3 className="text-xs font-mono font-bold tracking-wider text-[#8C8C90] uppercase">
                Brand Palette Tokens
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-[#14161C] border border-white/5 flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#00F59B] shadow-[0_0_8px_#00F59B]" />
                <div>
                  <div className="text-[11px] font-bold text-white">Laser Emerald</div>
                  <div className="text-[10px] font-mono text-[#8C8C90]">#00F59B</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#14161C] border border-white/5 flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#059669]" />
                <div>
                  <div className="text-[11px] font-bold text-white">Deep Teal</div>
                  <div className="text-[10px] font-mono text-[#8C8C90]">#059669</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#14161C] border border-white/5 flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#ECEEF2]" />
                <div>
                  <div className="text-[11px] font-bold text-white">Titanium</div>
                  <div className="text-[10px] font-mono text-[#8C8C90]">#ECEEF2</div>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#14161C] border border-white/5 flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-[#090A0D] border border-white/20" />
                <div>
                  <div className="text-[11px] font-bold text-white">Deep Onyx</div>
                  <div className="text-[10px] font-mono text-[#8C8C90]">#090A0D</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-[#8C8C90]">
            <span>60 FPS Motion Config • Reduced-Motion Protected</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-full bg-[#00F59B] text-black font-bold font-inter text-xs hover:bg-[#00D485] transition-colors"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
};
