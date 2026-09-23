import React from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

type Tone = "crimson" | "gold" | "neutral";

export interface StatusAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

export interface StatusScreenProps {
  /** Lucide icon shown in the tile above the title. */
  icon: LucideIcon;
  /** Short uppercase label above the title (optional). */
  eyebrow?: string;
  title: string;
  message: string;
  /** Accent used by the icon tile and primary button. Defaults to crimson. */
  tone?: Tone;
  /** Primary call to action — omit for informational-only states. */
  primaryAction?: StatusAction;
  /** Optional lower-emphasis action rendered underneath the primary one. */
  secondaryAction?: StatusAction;
  /** Free-form content below the actions (details, hints, footnotes). */
  children?: React.ReactNode;
  /** Extra classes for the card. */
  className?: string;
  testId?: string;
}

const TONE_STYLES: Record<
  Tone,
  { tile: string; icon: string; button: string; shadow: string; eyebrow: string }
> = {
  crimson: {
    tile: "bg-[#C81E3A]/15 border-[#C81E3A]/30",
    icon: "text-[#C81E3A]",
    button: "bg-[#C81E3A] hover:bg-[#A0182E] shadow-[#C81E3A]/30",
    shadow: "shadow-[#C81E3A]/20",
    eyebrow: "text-[#C81E3A]",
  },
  gold: {
    tile: "bg-gold/15 border-gold/30",
    icon: "text-gold",
    button: "bg-gold hover:brightness-110 shadow-gold/25",
    shadow: "shadow-gold/20",
    eyebrow: "text-gold",
  },
  neutral: {
    tile: "bg-white/[0.06] border-white/12",
    icon: "text-[#F4F2ED]",
    button: "bg-[#C81E3A] hover:bg-[#A0182E] shadow-[#C81E3A]/30",
    shadow: "shadow-black/40",
    eyebrow: "text-[#8C8C90]",
  },
};

/**
 * One branded blocking state for the whole app: 404, crash, offline, session
 * expiry. Obsidian shell, charcoal card, Anton headings, Inter body, crimson
 * primary action — the same visual language as TrialExpiredScreen.
 */
export const StatusScreen: React.FC<StatusScreenProps> = ({
  icon: Icon,
  eyebrow,
  title,
  message,
  tone = "crimson",
  primaryAction,
  secondaryAction,
  children,
  className = "",
  testId = "status-screen",
}) => {
  const styles = TONE_STYLES[tone];

  return (
    <div
      data-testid={testId}
      role="alert"
      className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] font-inter flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className={`w-full max-w-md rounded-2xl bg-[#121214] border border-white/10 p-4 shadow-2xl ${styles.shadow} space-y-4 text-center ${className}`}
      >
        <div className="space-y-1">
          <div
            className={`w-12 h-12 mx-auto rounded-2xl border flex items-center justify-center ${styles.tile}`}
          >
            <Icon className={`w-6 h-6 ${styles.icon}`} />
          </div>
          {eyebrow && (
            <p className={`pt-3 text-[10px] font-mono uppercase tracking-widest ${styles.eyebrow}`}>
              {eyebrow}
            </p>
          )}
          <h1 className="font-anton text-xl uppercase tracking-wider text-white pt-1">{title}</h1>
          <p className="text-xs text-[#8C8C90] leading-relaxed max-w-sm mx-auto">{message}</p>
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="space-y-2">
            {primaryAction && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={primaryAction.onClick}
                className={`w-full py-3 rounded-xl text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors ${styles.button}`}
              >
                {primaryAction.icon && <primaryAction.icon className="w-4 h-4" />}
                <span>{primaryAction.label}</span>
              </motion.button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="w-full py-3 rounded-xl border border-white/15 text-[#8C8C90] hover:text-white hover:border-white/25 transition-colors font-mono text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                {secondaryAction.icon && <secondaryAction.icon className="w-3.5 h-3.5" />}
                <span>{secondaryAction.label}</span>
              </button>
            )}
          </div>
        )}

        {children}
      </motion.div>
    </div>
  );
};
