import React from "react";
import { ArrowUpRight, Flame, ShieldCheck } from "lucide-react";
import { useEngagement } from "../context/EngagementContext";
import { isActiveEngagement } from "@/lib/engagement";

export function EarnPlusCard({ onOpen }: { onOpen: () => void }) {
  const { state, loading, error } = useEngagement();
  const active = isActiveEngagement(state) ? state : undefined;
  return (
    <section
      aria-label="Earn Plus"
      className="rounded-3xl border border-[#C81E3A]/30 bg-gradient-to-br from-[#251319] via-[#17171A] to-[#17171A] p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-rose-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Server-validated rewards
          </p>
          <h2 className="font-anton text-2xl uppercase text-white">Earn Plus</h2>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-[#B8B8C0]">
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
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/15 px-3 py-2 text-xs text-white hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-rose-400"
        >
          Open Earn Plus <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
      {active ? (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <div>
            <p className="font-mono text-[10px] text-[#A1A1AA]">REWARD XP</p>
            <p className="mt-1 font-mono text-base font-bold text-rose-300">
              {active.wallet.rewardXp.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] text-[#A1A1AA]">
              of {active.policy.rewardXpCost.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-[#A1A1AA]">QUALIFYING DAYS</p>
            <p className="mt-1 font-mono text-base font-bold text-white">
              {active.wallet.qualifyingDays} / {active.policy.requiredQualifyingDays}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-[#A1A1AA]">LOGIN STREAK</p>
            <p className="mt-1 flex items-center gap-1 font-mono text-base font-bold text-orange-300">
              <Flame className="h-4 w-4" /> {active.wallet.currentLoginStreak}d
            </p>
          </div>
          {active.status === "disabled" && (
            <p className="col-span-3 mt-2 text-xs text-amber-200">
              Activation pending. No rewards are being issued yet.
            </p>
          )}
        </div>
      ) : (
        <p
          className="mt-4 border-t border-white/10 pt-3 text-xs text-[#B8B8C0]"
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
