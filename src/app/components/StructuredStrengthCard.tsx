import React from "react";
import { ArrowRight, Dumbbell, Timer } from "lucide-react";

/**
 * Structured Strength — the headline entry point on Train.
 *
 * SVJ has no invented "program/split" model, so this card states only what is
 * true: one canonical strength session, logged exercise by exercise, and the
 * athlete's real last-session date when one exists. It opens the EXISTING
 * structured strength logger; nothing is re-implemented here.
 *
 * Density: this is a persistent working screen, not a landing page, so the card
 * is a compact dashboard header — promise on the left, real status and the
 * primary action on the right once there is desktop width to use. The same
 * content stacks on phones without shrinking the touch target.
 */
export function StructuredStrengthCard({
  onStart,
  lastSessionLabel,
}: {
  onStart: () => void;
  /** Real, formatted date of the last strength session — omitted when none. */
  lastSessionLabel?: string | null;
}) {
  return (
    <section
      aria-label="Structured Strength"
      data-testid="structured-strength-card"
      className="svj-radius-card svj-lit-top svj-elev-2 border border-[#C81E3A]/15 bg-gradient-to-br from-[#1E1114] via-[#17171A] to-[#17171A] p-3.5 sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E62846]">
            <Dumbbell className="h-3.5 w-3.5" aria-hidden /> Structured strength
          </p>

          <h2 className="mt-1 font-anton text-xl leading-none tracking-tight text-white sm:text-2xl">
            Train with <span className="text-[#E62846]">structure</span>
          </h2>

          <p className="mt-1.5 max-w-xl font-inter text-[11px] leading-relaxed text-[#A6A6AD]">
            Log exercises, sets, reps and weight into one canonical activity. Every session feeds
            your Physical stat through the server-authoritative pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-col lg:items-end">
          {lastSessionLabel ? (
            <p className="flex items-center gap-1.5 font-inter text-[11px] text-[#8C8C90]">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              Last session
              <span className="font-medium text-[#F4F2ED]">{lastSessionLabel}</span>
            </p>
          ) : (
            <p className="font-inter text-[11px] text-[#8C8C90]">No sessions logged yet</p>
          )}

          <button
            type="button"
            onClick={onStart}
            data-testid="structured-strength-start"
            className="inline-flex items-center gap-2 svj-radius-row bg-[#C81E3A] px-4 py-2.5 font-inter text-xs font-semibold text-white transition-colors hover:bg-[#A0182E] svj-press"
          >
            {lastSessionLabel ? "Continue" : "Start workout"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
