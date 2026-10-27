import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

export type AnimationConcept = "precision-reveal" | "energy-formation" | "cinematic-transformation";

interface StartupAnimationProps {
  onComplete: () => void;
  concept?: AnimationConcept;
  forceShow?: boolean;
}

export const StartupAnimation: React.FC<StartupAnimationProps> = ({
  onComplete,
  concept = "precision-reveal",
  forceShow = false,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "assemble" | "pulse" | "wordmark" | "exit">("intro");

  useEffect(() => {
    // If reduced motion is preferred and not forced preview, complete immediately
    if (shouldReduceMotion && !forceShow) {
      onComplete();
      return;
    }

    // High precision sequence timing (Total ~2.4 seconds)
    const t1 = setTimeout(() => setPhase("assemble"), 200);
    const t2 = setTimeout(() => setPhase("pulse"), 900);
    const t3 = setTimeout(() => setPhase("wordmark"), 1400);
    const t4 = setTimeout(() => setPhase("exit"), 2200);
    const t5 = setTimeout(() => onComplete(), 2600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [shouldReduceMotion, forceShow, onComplete]);

  if (shouldReduceMotion && !forceShow) {
    return null;
  }

  return (
    <AnimatePresence>
      {phase !== "exit" && (
        <motion.div
          key="zenexis-startup-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, filter: "blur(6px)" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090A0D] text-[#ECEEF2] select-none overflow-hidden"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {/* Ambient Background Glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{
              opacity: phase === "pulse" ? 0.45 : phase === "wordmark" ? 0.3 : 0.15,
              scale: phase === "pulse" ? 1.25 : 1,
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute w-[360px] h-[360px] rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(200, 30, 58,0.22) 0%, rgba(200, 30, 58,0.04) 50%, transparent 70%)",
            }}
          />

          {/* Subtly Animated Laser Coordinate Lines (Concept B: Precision Reveal) */}
          {concept === "precision-reveal" && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="laserLine" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#C81E3A" stopOpacity="0" />
                  <stop offset="50%" stopColor="#C81E3A" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#C81E3A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.line
                x1="10%"
                y1="35%"
                x2="90%"
                y2="65%"
                stroke="url(#laserLine)"
                strokeWidth="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: phase === "intro" ? 0 : 1, opacity: 0.4 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
              <motion.line
                x1="90%"
                y1="35%"
                x2="10%"
                y2="65%"
                stroke="url(#laserLine)"
                strokeWidth="1"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: phase === "intro" ? 0 : 1, opacity: 0.4 }}
                transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
          )}

          {/* Converging Energy Particles (Concept A: Energy Formation) */}
          {concept === "energy-formation" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, idx) => (
                <motion.div
                  key={idx}
                  initial={{
                    x: Math.cos((angle * Math.PI) / 180) * 160,
                    y: Math.sin((angle * Math.PI) / 180) * 160,
                    opacity: 0,
                    scale: 0.2,
                  }}
                  animate={{
                    x: phase === "intro" ? Math.cos((angle * Math.PI) / 180) * 160 : 0,
                    y: phase === "intro" ? Math.sin((angle * Math.PI) / 180) * 160 : 0,
                    opacity: phase === "intro" ? 0 : phase === "assemble" ? 0.9 : 0,
                    scale: phase === "assemble" ? 1 : 0.4,
                  }}
                  transition={{ duration: 0.65, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute w-2 h-2 rounded-full bg-[#C81E3A] shadow-[0_0_10px_#C81E3A]"
                />
              ))}
            </div>
          )}

          {/* Central Logo Container */}
          <div className="relative flex flex-col items-center">
            {/* Vector Dual-Chevron Apex Symbol */}
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: 15 }}
              animate={{
                scale: phase === "intro" ? 0.75 : phase === "pulse" ? 1.05 : 1,
                opacity: phase === "intro" ? 0 : 1,
                y: phase === "intro" ? 15 : 0,
              }}
              transition={{
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center"
            >
              <svg
                viewBox="0 0 512 512"
                className="w-full h-full filter drop-shadow-[0_8px_24px_rgba(0,0,0,0.8)]"
              >
                <defs>
                  <linearGradient
                    id="animUpLeft"
                    x1="122"
                    y1="100"
                    x2="256"
                    y2="242"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="35%" stopColor="#E2E8F0" />
                    <stop offset="70%" stopColor="#C81E3A" />
                    <stop offset="100%" stopColor="#A0182E" />
                  </linearGradient>
                  <linearGradient
                    id="animUpRight"
                    x1="390"
                    y1="100"
                    x2="256"
                    y2="242"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#C81E3A" />
                    <stop offset="50%" stopColor="#A0182E" />
                    <stop offset="100%" stopColor="#7F1325" />
                  </linearGradient>
                  <linearGradient
                    id="animDownLeft"
                    x1="122"
                    y1="204"
                    x2="256"
                    y2="346"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#F1F5F9" />
                    <stop offset="40%" stopColor="#CBD5E1" />
                    <stop offset="80%" stopColor="#C81E3A" />
                    <stop offset="100%" stopColor="#7F1325" />
                  </linearGradient>
                  <linearGradient
                    id="animDownRight"
                    x1="390"
                    y1="204"
                    x2="256"
                    y2="346"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#C81E3A" />
                    <stop offset="50%" stopColor="#7F1325" />
                    <stop offset="100%" stopColor="#560D19" />
                  </linearGradient>
                </defs>

                {/* UPPER CHEVRON */}
                <motion.g
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: phase === "intro" ? -20 : 0, opacity: phase === "intro" ? 0 : 1 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <path d="M 256 100 L 122 210 L 162 242 L 256 166 Z" fill="url(#animUpLeft)" />
                  <path d="M 256 100 L 390 210 L 350 242 L 256 166 Z" fill="url(#animUpRight)" />
                  <path
                    d="M 256 100 L 256 166"
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.8"
                  />
                  <path
                    d="M 256 100 L 122 210"
                    stroke="#FFFFFF"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    opacity="0.9"
                  />
                </motion.g>

                {/* LOWER CHEVRON */}
                <motion.g
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: phase === "intro" ? 20 : 0, opacity: phase === "intro" ? 0 : 1 }}
                  transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                >
                  <path d="M 256 204 L 122 314 L 162 346 L 256 270 Z" fill="url(#animDownLeft)" />
                  <path d="M 256 204 L 390 314 L 350 346 L 256 270 Z" fill="url(#animDownRight)" />
                  <path
                    d="M 256 204 L 256 270"
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                  <path
                    d="M 256 204 L 122 314"
                    stroke="#FFFFFF"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                </motion.g>
              </svg>

              {/* Specular Glint Pulse on Peak */}
              {phase === "pulse" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.4, 2, 2.5] }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="absolute top-4 w-4 h-4 rounded-full bg-white shadow-[0_0_16px_#C81E3A]"
                />
              )}
            </motion.div>

            {/* Wordmark & Tagline Reveal */}
            <div className="mt-5 text-center overflow-hidden">
              <motion.h1
                initial={{ y: 24, opacity: 0, letterSpacing: "0.2em" }}
                animate={{
                  y: phase === "wordmark" ? 0 : 24,
                  opacity: phase === "wordmark" ? 1 : 0,
                  letterSpacing: phase === "wordmark" ? "0.32em" : "0.2em",
                }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="text-2xl sm:text-3xl font-extrabold tracking-[0.32em] text-[#ECEEF2] uppercase pl-[0.32em]"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                ZENEXIS
              </motion.h1>

              <motion.p
                initial={{ y: 12, opacity: 0, letterSpacing: "0.25em" }}
                animate={{
                  y: phase === "wordmark" ? 0 : 12,
                  opacity: phase === "wordmark" ? 0.85 : 0,
                }}
                transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="mt-2 text-[10px] sm:text-[11px] font-semibold text-[#C81E3A] uppercase tracking-[0.3em] pl-[0.3em]"
              >
                ASCEND TO YOUR APEX
              </motion.p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
