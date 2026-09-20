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
      className="relative overflow-hidden rounded-3xl border border-[#C81E3A]/30 bg-gradient-to-br from-[#251319] via-[#17171A] to-[#17171A] p-5"
    >
      <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-[#C81E3A]/15 blur-3xl" />

      <div className="relative">
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-rose-300">
          <Dumbbell className="h-3.5 w-3.5" /> Structured Strength
        </p>

        <h2 className="font-anton text-2xl uppercase leading-none text-white">
          Train with
          <span className="block text-[#C81E3A]">structure</span>
        </h2>

        <p className="mt-2 max-w-md text-xs leading-relaxed text-[#B8B8C0]">
          Log exercises, sets, reps and weight into one canonical activity. Every session feeds your
          Physical stat through the server-authoritative pipeline.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          {lastSessionLabel ? (
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[#8C8C90]">
              <Timer className="h-3.5 w-3.5" />
              Last session
              <span className="text-[#F4F2ED]">{lastSessionLabel}</span>
            </p>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#8C8C90]">
              No sessions logged yet
            </p>
          )}

          <button
            type="button"
            onClick={onStart}
            data-testid="structured-strength-start"
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#C81E3A] px-4 py-2.5 font-anton text-xs uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] focus-visible:outline-2 focus-visible:outline-rose-400"
          >
            {lastSessionLabel ? "Continue" : "Start workout"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
