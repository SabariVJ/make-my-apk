import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { TIERS } from "../data/initialData";
import { FramerLevelUp } from "./FramerLevelUp";

const NativeLevelUp: React.FC<{ level: number }> = ({ level }) => {
  const reducedMotion = useReducedMotion();
  const digits = String(level).length;
  return (
    <motion.div
      data-testid="level-up-fallback"
      initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.4 }}
      className="flex h-full flex-col items-center justify-center text-center"
      aria-hidden="true"
    >
      <p className="font-anton text-[56px] leading-none text-[#F5F5F5]">LEVEL UP</p>
      <p
        className="mt-3 max-w-full font-anton leading-none text-[#C81E3A]"
        style={{ fontSize: Math.min(144, Math.floor(260 / (digits * 0.65))) }}
      >
        {level}
      </p>
      <p className="mt-8 text-sm text-[#A4A4AA]">New rewards unlocked.</p>
    </motion.div>
  );
};

export const LevelUpModal: React.FC = () => {
  const { levelUpModalData, setLevelUpModalData } = useSVJ();
  const tier =
    levelUpModalData && levelUpModalData.newTier !== levelUpModalData.oldTier
      ? TIERS.find((entry) => entry.name === levelUpModalData.newTier)
      : undefined;
  const close = () => setLevelUpModalData(null);

  return (
    <Dialog.Root open={Boolean(levelUpModalData)} onOpenChange={(open) => !open && close()}>
      {levelUpModalData && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/90" />
          <Dialog.Content
            className="fixed inset-0 z-[60] overflow-y-auto bg-[#0B0B0C] font-inter text-[#F5F5F5] outline-none"
            style={{ letterSpacing: 0 }}
          >
            <Dialog.Title className="sr-only">
              Level {levelUpModalData.newLevel} reached
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              You advanced from level {levelUpModalData.oldLevel} to level{" "}
              {levelUpModalData.newLevel}.
              {tier ? ` ${tier.name} tier unlocked.` : " New rewards unlocked."}
            </Dialog.Description>
            <Dialog.Close
              aria-label="Close level-up celebration"
              title="Close level-up celebration"
              className="fixed right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-[#A4A4AA] hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
            <div
              className="mx-auto flex min-h-full w-full max-w-[440px] flex-col justify-center px-6 pt-16"
              style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
            >
              <div className="relative h-[min(55dvh,460px)] min-h-[280px] w-full">
                <FramerLevelUp
                  key={levelUpModalData.newLevel}
                  level={levelUpModalData.newLevel}
                  fallback={<NativeLevelUp level={levelUpModalData.newLevel} />}
                />
              </div>
              <p className="mb-6 text-center text-sm font-semibold text-[#A4A4AA]">
                Level {levelUpModalData.newLevel}
              </p>
              {tier && (
                <section className="mb-6 border-t border-white/10 pt-5" aria-label="New tier perks">
                  <h3 className="font-anton text-xl text-[#D4AF37]">{tier.name} Tier</h3>
                  <p className="mt-1 text-sm text-[#A4A4AA]">{tier.description}</p>
                  <ul className="mt-4 space-y-2">
                    {tier.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2 text-sm">
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]"
                          aria-hidden="true"
                        />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <button
                onClick={close}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#C81E3A] px-4 py-3 text-sm font-semibold text-white hover:bg-[#A0182E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
};
