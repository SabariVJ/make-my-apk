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
 * expiry. Obsidian shell, lit charcoal card, Inter throughout, crimson primary
 * action — the same visual language as TrialExpiredScreen.
 *
 * The title is sentence case on purpose: a blocking state is not a badge, and
 * caps stopped carrying meaning once it was applied to every heading in the app.
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
      className="flex min-h-[100dvh] items-center justify-center bg-[#0B0B0C] p-4 font-inter text-[#F4F2ED]"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className={`svj-radius-card svj-lit-top svj-elev-3 w-full max-w-md border border-white/[0.06] bg-[#17171A] p-5 text-center space-y-4 ${styles.shadow} ${className}`}
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
          <h1 className="pt-1 font-inter text-xl font-semibold tracking-tight text-[#F4F2ED]">
            {title}
          </h1>
          <p className="mx-auto max-w-sm text-xs font-inter leading-relaxed text-[#8C8C90]">
            {message}
          </p>
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="space-y-2">
            {primaryAction && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={primaryAction.onClick}
                className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 font-inter text-sm font-semibold text-white shadow-lg transition-colors ${styles.button}`}
              >
                {primaryAction.icon && <primaryAction.icon className="w-4 h-4" />}
                <span>{primaryAction.label}</span>
              </motion.button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/12 py-3 font-inter text-xs font-semibold text-[#8C8C90] transition-colors hover:border-white/25 hover:text-white"
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
