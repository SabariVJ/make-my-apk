import React from "react";
import { ArrowRight, Dumbbell, Timer } from "lucide-react";

/**
 * Structured Strength — the headline entry point on Train.
 *
 * SVJ has no invented "program/split" model, so this card states only what is
 * true: one canonical strength session, logged exercise by exercise, and the
 * athlete's real last-session date when one exists. It opens the EXISTING
 * structured strength logger; nothing is re-implemented here.
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
      className="rounded-2xl bg-gradient-to-br from-[#1e1114] via-[#17171A] to-[#17171A] border border-[#C81E3A]/15 p-4"
    >
      <div className="relative">
        <p className="mb-2 flex items-center gap-1.5 font-inter text-[11px] uppercase tracking-wider text-[#C81E3A]">
          <Dumbbell className="h-3.5 w-3.5" /> Structured Strength
        </p>

        <h2 className="font-anton text-2xl uppercase leading-none text-white">
          Train with
          <span className="block text-[#C81E3A]">structure</span>
        </h2>

        <p className="mt-2 max-w-md text-xs font-inter leading-relaxed text-[#B8B8C0]">
          Log exercises, sets, reps and weight into one canonical activity. Every session feeds your
          Physical stat through the server-authoritative pipeline.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
          {lastSessionLabel ? (
            <p className="flex items-center gap-1.5 font-inter text-[11px] text-[#8C8C90]">
              <Timer className="h-3.5 w-3.5" />
              Last session
              <span className="text-[#F4F2ED] font-medium">{lastSessionLabel}</span>
            </p>
          ) : (
            <p className="font-inter text-[11px] text-[#8C8C90]">No sessions logged yet</p>
          )}

          <button
            type="button"
            onClick={onStart}
            data-testid="structured-strength-start"
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#C81E3A] px-4 py-2.5 font-anton text-xs uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] svj-press"
          >
            {lastSessionLabel ? "Continue" : "Start workout"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
