import React from "react";
import { ArrowRight, CalendarCheck, Flame, ShieldCheck, Trophy } from "lucide-react";
import { summarizeSixtyDayProgram, type ChallengeProgressInput } from "@/lib/challengeProgress";

/**
 * 60-Day Transformation — premium program card shown inside Challenges.
 *
 * It is the *entry point* only: every figure comes from the server's
 * authoritative ChallengeState, and the CTA opens the EXISTING 60-Day route.
 * No 60-Day state is duplicated or re-implemented here.
 */
export function SixtyDayProgramCard({
  state,
  loading = false,
  onOpen,
}: {
  state: ChallengeProgressInput | null;
  loading?: boolean;
  onOpen: () => void;
}) {
  const summary = summarizeSixtyDayProgram(state);
  const notStarted = summary.status === "not_started";
  const completed = summary.status === "completed";

  return (
    <section
      aria-label="60 Day Transformation"
      data-testid="sixty-day-program-card"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B1B1F] via-[#141417] to-[#17171A] border border-white/[0.06] p-4"
    >
      <div className="relative">
        <p className="mb-2 flex items-center gap-1.5 font-inter text-[11px] uppercase tracking-wider text-[#8C8C90]">
          <CalendarCheck className="h-3.5 w-3.5 text-[#C81E3A]" />
          Discipline program
        </p>

        <div className="flex items-start justify-between gap-4">
          <h2 className="font-anton text-2xl uppercase leading-none text-white">
            60 Day
            <span className="block text-[#C81E3A]">Transformation</span>
          </h2>
          {completed && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2 py-1 font-mono text-[10px] font-bold uppercase text-gold">
              <Trophy className="h-3 w-3" /> Complete
            </span>
          )}
        </div>

        {notStarted ? (
          <>
            <p className="mt-2 max-w-md text-xs font-inter leading-relaxed text-[#B8B8C0]">
              60 days. Daily missions. One transformation. Miss a day and the program pauses — your
              progress is never lost.
            </p>
            <button
              type="button"
              onClick={onOpen}
              data-testid="sixty-day-open"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#C81E3A] px-4 py-2.5 font-anton text-xs uppercase tracking-wider text-white transition-colors hover:bg-[#A0182E] svj-press"
            >
              Start 60 Day <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : completed ? (
          <>
            <p className="mt-2 max-w-md text-xs font-inter leading-relaxed text-[#B8B8C0]">
              All {summary.totalDays} days cleared. Your transformation report and reward code are
              ready.
            </p>
            <button
              type="button"
              onClick={onOpen}
              data-testid="sixty-day-open"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white/[0.06] px-4 py-2.5 font-anton text-xs uppercase tracking-wider text-white transition-colors hover:bg-white/[0.10] svj-press"
            >
              View transformation <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-inter text-[11px] uppercase tracking-wider">
              <span className="text-[#F4F2ED]">
                Day {summary.currentDay} / {summary.totalDays}
              </span>
              {summary.status === "paused" && (
                <span className="rounded-2xl border border-gold/40 bg-gold/10 px-1.5 py-0.5 font-bold text-gold">
                  Paused
                </span>
              )}
            </p>

            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.04]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={summary.percent}
              aria-label="60 Day Transformation progress"
            >
              <div
                className="h-full rounded-full bg-[#C81E3A] transition-[width] duration-500"
                style={{ width: `${summary.percent}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
              <div>
                <p className="font-inter text-[11px] text-[#8C8C90]">Missions</p>
                <p className="mt-1 font-mono text-base font-bold text-white">
                  {summary.missionsCompleted}
                  <span className="text-xs text-[#8C8C90]"> / {summary.totalMissions}</span>
                </p>
              </div>
              <div>
                <p className="font-inter text-[11px] text-[#8C8C90]">Current streak</p>
                <p className="mt-1 flex items-center gap-1 font-mono text-base font-bold text-gold">
                  <Flame className="h-4 w-4" /> {summary.currentStreak}d
                </p>
              </div>
              <div>
                <p className="font-inter text-[11px] text-[#8C8C90]">Days cleared</p>
                <p className="mt-1 font-mono text-base font-bold text-white">
                  {summary.daysCompleted}
                  <span className="text-xs text-[#8C8C90]"> / {summary.totalDays}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpen}
              data-testid="sixty-day-open"
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#C81E3A]/15 text-[#C81E3A] px-4 py-2.5 font-anton text-xs uppercase tracking-wider transition-colors hover:bg-[#C81E3A]/25 svj-press"
            >
              Continue program <ArrowRight className="h-4 w-4" />
            </button>
          </>
        )}

        {loading && (
          <p className="mt-3 flex items-center gap-1.5 font-inter text-[11px] text-[#8C8C90]">
            <ShieldCheck className="h-3.5 w-3.5" /> Syncing progress…
          </p>
        )}
      </div>
    </section>
  );
}
