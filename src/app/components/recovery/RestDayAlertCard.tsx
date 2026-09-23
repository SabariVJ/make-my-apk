// SVJ Recovery V2 — Phase 7: the Rest-Day alert card.
//
// It renders ONLY when the single authoritative recovery emphasis is "rest"
// (restDayAlert consumes readinessEmphasis) so the threshold is never copied
// into a component. Every evidence line comes from the real readiness reading
// the Overview already renders — the score, a genuinely high load band, and an
// actually-zero recent rest count. Nothing renders when the rule does not fire,
// so this can never become a generic warning banner.
import React from "react";
import { HeartPulse, ShieldAlert } from "lucide-react";
import { restDayAlert, type ReadinessResult } from "../../lib/recoveryInsights";

export const RestDayAlertCard: React.FC<{
  readiness: ReadinessResult;
  /** Supplied only when a real navigation target exists (never a dead button). */
  onReviewPlan?: () => void;
}> = ({ readiness, onReviewPlan }) => {
  const alert = restDayAlert(readiness);
  if (!alert.active) return null;

  return (
    <section
      role="status"
      aria-labelledby="recovery-rest-alert-title"
      data-testid="recovery-rest-alert"
      className="mb-3 rounded-2xl border border-gold/40 bg-gradient-to-br from-[#2A1218] via-[#17171A] to-[#17171A] p-4"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-gold">
        <ShieldAlert aria-hidden className="h-3.5 w-3.5" />
        Recovery priority
      </p>
      <h2
        id="recovery-rest-alert-title"
        className="mt-1 font-anton text-lg uppercase tracking-wide text-[#F4F2ED]"
      >
        {alert.headline}
      </h2>

      <ul className="mt-2 space-y-1" data-testid="recovery-rest-alert-evidence">
        {alert.evidence.map((line) => (
          <li key={line} className="flex gap-2 text-xs font-inter leading-relaxed text-[#B8B8C0]">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] font-inter leading-relaxed text-[#8C8C90]">
        {alert.suggestion}
      </p>

      {onReviewPlan && (
        <button
          type="button"
          onClick={onReviewPlan}
          data-testid="recovery-rest-alert-plan"
          className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 text-xs font-inter font-semibold text-gold transition-colors hover:bg-gold/20 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <HeartPulse aria-hidden className="h-3.5 w-3.5" />
          Review today&apos;s plan
        </button>
      )}
    </section>
  );
};
