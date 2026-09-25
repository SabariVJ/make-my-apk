import React from "react";
import { ArrowUpRight, ChevronRight, Flame, ShieldCheck } from "lucide-react";
import { useEngagement } from "../context/EngagementContext";
import { isActiveEngagement } from "@/lib/engagement";

export function EarnPlusCard({
  onOpen,
  /**
   * Compact status chip. The Challenges home uses this so the hero card stops
   * competing with today's actual tasks for the same scroll; the full card is
   * still used on the dedicated Earn Plus destination.
   */
  compact = false,
}: {
  onOpen: () => void;
  compact?: boolean;
}) {
  const { state, loading, error } = useEngagement();
  const active = isActiveEngagement(state) ? state : undefined;

  if (compact) {
    const summary = active?.account.lifetimeAccess
      ? "Lifetime access active"
      : active
        ? `${active.wallet.qualifyingDays} of ${active.policy.requiredQualifyingDays} qualifying days`
        : loading
          ? "Checking your reward status…"
          : (error ?? "A separate reward balance for daily missions");

    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open Earn Plus"
        className="flex w-full items-center gap-3 rounded-xl border border-[#C81E3A]/20 bg-[#17171A] px-3.5 py-3 text-left transition-colors hover:border-[#C81E3A]/40 svj-press"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#C81E3A]/30 bg-[#C81E3A]/12 text-[#E62846]">
          <ShieldCheck aria-hidden className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-inter font-semibold text-[#F4F2ED]">
            Earn Plus
          </span>
          <span className="block truncate text-[11px] font-inter text-[#8C8C90]">{summary}</span>
        </span>
        {active && (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-[#E62846]">
            {active.wallet.rewardXp.toLocaleString()} XP
          </span>
        )}
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#5C5C60]" />
      </button>
    );
  }

  return (
    <section
      aria-label="Earn Plus"
      className="rounded-2xl bg-gradient-to-br from-[#1e1114] via-[#17171A] to-[#17171A] border border-[#C81E3A]/15 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-inter text-[11px] uppercase tracking-wider text-[#C81E3A]">
            <ShieldCheck className="h-3.5 w-3.5" /> Server-validated rewards
          </p>
          <h2 className="font-anton text-2xl tracking-wide text-white">Earn Plus</h2>
          <p className="mt-1 max-w-md text-xs font-inter leading-relaxed text-[#B8B8C0]">
            {active?.account.lifetimeAccess
              ? "Lifetime access already active. Your membership stays untouched."
              : active
                ? String(active.policy.plusDays) +
                  " days of Plus. Earned through consistent daily missions."
                : "A separate reward balance for consistent daily missions."}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-inter font-medium text-white hover:bg-white/[0.10] svj-press"
        >
          Open Earn Plus <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
      {active ? (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4">
          <div>
            <p className="font-inter text-[11px] text-[#8C8C90]">Reward XP</p>
            <p className="mt-1 font-mono text-base font-bold text-[#C81E3A]">
              {active.wallet.rewardXp.toLocaleString()}
            </p>
            <p className="font-inter text-[10px] text-[#8C8C90]">
              of {active.policy.rewardXpCost.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="font-inter text-[11px] text-[#8C8C90]">Qualifying Days</p>
            <p className="mt-1 font-mono text-base font-bold text-white">
              {active.wallet.qualifyingDays} / {active.policy.requiredQualifyingDays}
            </p>
          </div>
          <div>
            <p className="font-inter text-[11px] text-[#8C8C90]">Login Streak</p>
            <p className="mt-1 flex items-center gap-1 font-mono text-base font-bold text-gold">
              <Flame className="h-4 w-4" /> {active.wallet.currentLoginStreak}d
            </p>
          </div>
          {active.status === "disabled" && (
            <p className="col-span-3 mt-2 text-xs text-gold">
              Activation pending. No rewards are being issued yet.
            </p>
          )}
        </div>
      ) : (
        <p
          className="mt-4 border-t border-white/[0.06] pt-3 text-xs font-inter text-[#B8B8C0]"
          role={error ? "alert" : undefined}
        >
          {loading
            ? "Loading your reward status…"
            : (error ??
              (state?.status === "setup_required"
                ? state.message
                : "Sign in to see your reward status."))}
        </p>
      )}
    </section>
  );
}
