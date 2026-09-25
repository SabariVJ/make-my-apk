// SVJ Recovery V2 — Phase 7: the recovery note inside MY SVJ PLAN.
//
// This is PRESENTATION ONLY. It reuses the single authoritative emphasis
// (readinessEmphasis via todaysFocus), so MY SVJ PLAN never carries a competing
// set of thresholds. It never deletes a completed mission, edits historical
// activity, alters earned XP, rewrites a past plan, awards XP or changes
// entitlement — it only reframes today's session using real readiness.
import React from "react";
import { Activity, HeartPulse, Sparkles, Zap } from "lucide-react";
import { readinessEmphasis, todaysFocus, type ReadinessResult } from "../../lib/recoveryInsights";

const SHELL = "svj-radius-card svj-lit-top border p-4";

const STYLES: Record<
  ReturnType<typeof readinessEmphasis>,
  { shell: string; eyebrow: string; icon: React.FC<{ className?: string }> }
> = {
  rest: {
    shell: `${SHELL} border-gold/40 bg-gradient-to-br from-[#2A1218] via-[#17171A] to-[#17171A]`,
    eyebrow: "text-gold",
    icon: HeartPulse,
  },
  lighter: {
    shell: `${SHELL} border-gold/25 bg-[#17171A]`,
    eyebrow: "text-gold",
    icon: Activity,
  },
  stronger: {
    shell: `${SHELL} border-emerald-400/30 bg-[#17171A]`,
    eyebrow: "text-emerald-400",
    icon: Zap,
  },
  normal: {
    shell: `${SHELL} border-white/[0.06] bg-[#17171A]`,
    eyebrow: "text-[#8C8C90]",
    icon: Sparkles,
  },
};

/**
 * Shows the plan's recovery context for the current authoritative emphasis.
 * `trainingGoal` is optional and only refines wording — it can never change the
 * emphasis.
 */
export const PlanRecoveryCard: React.FC<{
  readiness: ReadinessResult;
  trainingGoal?: string | null;
}> = ({ readiness, trainingGoal = null }) => {
  const emphasis = readinessEmphasis(readiness);
  const focus = todaysFocus({ readiness, trainingGoal, activityGoal: null });
  const style = STYLES[emphasis];
  const Icon = style.icon;

  return (
    <section
      data-testid="plan-recovery-check"
      data-emphasis={emphasis}
      aria-labelledby="plan-recovery-check-title"
      className={style.shell}
    >
      <p
        className={`flex items-center gap-1.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] ${style.eyebrow}`}
      >
        <Icon aria-hidden className="h-3.5 w-3.5" />
        Recovery check
      </p>
      <h3
        id="plan-recovery-check-title"
        className="mt-1 font-inter text-sm font-semibold tracking-tight text-[#F4F2ED]"
      >
        {focus.headline}
      </h3>
      <p className="mt-1 text-xs font-inter leading-relaxed text-[#B8B8C0]">{focus.detail}</p>

      {emphasis === "stronger" && (
        <p className="mt-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]">
          Progressive overload still follows your existing training plan — today&apos;s readiness is
          context, not an automatic increase.
        </p>
      )}
      {(emphasis === "rest" || emphasis === "lighter") && (
        <p className="mt-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]">
          Today&apos;s planned missions stay exactly as they are — nothing is deleted or reduced for
          you.
        </p>
      )}
    </section>
  );
};

export default PlanRecoveryCard;
