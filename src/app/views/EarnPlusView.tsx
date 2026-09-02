import React, { useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Flame,
  Gift,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formatRewardDuration,
  isActiveEngagement,
  rewardSecondsRemaining,
  type RewardMission,
} from "@/lib/engagement";
import { useEngagement } from "../context/EngagementContext";

const primaryButton =
  "rounded-xl bg-[#C81E3A] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A0182E] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400";
const secondaryButton =
  "rounded-xl border border-white/15 px-4 py-2 text-xs text-white hover:bg-white/5 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-rose-400";

function ProgressMeter({ label, value, target }: { label: string; value: number; target: number }) {
  const percent = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-[#B8B8C0]">{label}</span>
        <span className="font-mono text-white">
          {value.toLocaleString()} / {target.toLocaleString()}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(value, target)}
        className="h-2 overflow-hidden rounded-full bg-black/40"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#C81E3A] to-rose-400"
          style={{ width: String(percent) + "%" }}
        />
      </div>
    </div>
  );
}

function MissionCard({
  mission,
  anotherRunning,
  paused,
}: {
  mission: RewardMission;
  anotherRunning: boolean;
  paused: boolean;
}) {
  const { serverNowMs, pending, startMission, completeMission } = useEngagement();
  const [confirmation, setConfirmation] = useState("");
  const remaining = rewardSecondsRemaining(mission.eligibleAt, serverNowMs);
  const expired =
    mission.status === "expired" ||
    (mission.status !== "completed" &&
      Boolean(mission.expiresAt) &&
      rewardSecondsRemaining(mission.expiresAt, serverNowMs) === 0);
  const completed = mission.status === "completed";
  const started = Boolean(mission.assignmentId) && !completed;
  const ready = started && !expired && remaining === 0;
  const disabled = Boolean(pending) || paused;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!mission.assignmentId || !ready || disabled) return;
    if (await completeMission(mission.assignmentId, confirmation)) setConfirmation("");
  }

  return (
    <article
      className={
        "rounded-2xl border p-5 " +
        (completed ? "border-emerald-400/25 bg-emerald-950/10" : "border-white/10 bg-[#17171A]")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#A1A1AA]">
            {mission.category} · {mission.minimumMinutes} min
          </p>
          <h3 className="mt-1 font-anton text-xl uppercase text-white">{mission.title}</h3>
        </div>
        <span className="shrink-0 rounded-lg border border-rose-400/20 bg-rose-400/5 px-2 py-1 font-mono text-xs text-rose-300">
          +{mission.rewardXp} Reward XP
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#B8B8C0]">{mission.description}</p>
      {completed ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
          <Check className="h-4 w-4" /> Saved and credited
        </p>
      ) : expired ? (
        <p className="mt-4 text-sm text-amber-200">
          This session has expired. New missions unlock after the daily reset.
        </p>
      ) : !started ? (
        <div className="mt-4">
          <button
            type="button"
            disabled={disabled || anotherRunning}
            className={primaryButton}
            onClick={() => {
              void startMission(mission.key);
            }}
          >
            {pending?.startsWith("start:") ? "Starting…" : "Start " + mission.title}
          </button>
          {anotherRunning && (
            <p className="mt-2 text-xs text-[#A1A1AA]">Finish your active mission first.</p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="flex items-center gap-2 font-mono text-sm text-rose-200">
            <Clock3 className="h-4 w-4" />
            {ready
              ? "Time met — confirm your activity"
              : formatRewardDuration(remaining) + " remaining"}
          </p>
          <p className="text-xs text-[#A1A1AA]">
            Your server-timed session can be resumed after a refresh or on another device.
          </p>
          <label
            className="block text-xs font-medium text-white"
            htmlFor={"reflection-" + mission.key}
          >
            What did you complete?
          </label>
          <textarea
            id={"reflection-" + mission.key}
            value={confirmation}
            maxLength={500}
            onChange={(event) => setConfirmation(event.target.value)}
            rows={3}
            aria-describedby={"reflection-help-" + mission.key}
            className="w-full resize-y rounded-xl border border-white/15 bg-[#0B0B0C] px-3 py-2 text-sm text-white outline-none placeholder:text-[#777780] focus:border-rose-400"
            placeholder="Describe the activity and your next useful step."
          />
          <p id={"reflection-help-" + mission.key} className="text-[11px] text-[#A1A1AA]">
            {confirmation.trim().length} / 500 characters · at least 20
          </p>
          <button
            type="submit"
            className={primaryButton}
            disabled={disabled || !ready || confirmation.trim().length < 20}
          >
            {pending?.startsWith("complete:") ? "Confirming…" : "Confirm " + mission.title}
          </button>
        </form>
      )}
    </article>
  );
}

export function EarnPlusView({ onBack }: { onBack: () => void }) {
  const {
    state,
    loading,
    refreshing,
    error,
    actionError,
    pending,
    notice,
    serverNowMs,
    refresh,
    checkIn,
    redeemPlus,
  } = useEngagement();
  const [confirmClaim, setConfirmClaim] = useState(false);
  const active = isActiveEngagement(state) ? state : undefined;
  const dayEnded = Boolean(active && serverNowMs >= Date.parse(active.nextResetAt));
  const paused =
    !active || active.status !== "ready" || !active.account.verified || dayEnded || Boolean(error);
  const running = active?.missions.find(
    (mission) =>
      (mission.status === "running" || mission.status === "ready") &&
      rewardSecondsRemaining(mission.expiresAt, serverNowMs) > 0,
  );

  return (
    <div className="space-y-5 pb-28">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 py-2 text-sm text-[#B8B8C0] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button type="button" onClick={refresh} disabled={refreshing} className={secondaryButton}>
          <RefreshCw className={"mr-1 inline h-3.5 w-3.5 " + (refreshing ? "animate-spin" : "")} />{" "}
          Refresh rewards
        </button>
      </div>
      <header className="relative overflow-hidden rounded-3xl border border-[#C81E3A]/30 bg-gradient-to-br from-[#30121B] via-[#17171A] to-[#121214] p-6 sm:p-8">
        <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-rose-300">
          <ShieldCheck className="h-4 w-4" /> Earned, not purchased
        </p>
        <h1 className="font-anton text-4xl uppercase tracking-wide text-white">Earn Plus</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#C4C4CC]">
          Build consistency with daily missions. Your Reward XP is verified and saved on the server,
          separately from your profile level.
        </p>
        {active && (
          <p className="mt-3 font-mono text-xs text-rose-200">
            {active.policy.plusDays} days of Plus · one-time launch reward · no automatic charge
          </p>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-950/20 p-4 text-sm text-rose-200"
        >
          {error}
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-950/20 p-4 text-sm text-rose-200"
        >
          {actionError}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-400/20 bg-emerald-950/15 p-3 text-sm text-emerald-200"
        >
          {notice}
        </p>
      )}
      {loading && !state && (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-[#B8B8C0]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading confirmed progress…
        </p>
      )}
      {state?.status === "setup_required" && (
        <section className="rounded-2xl border border-amber-300/20 bg-[#17171A] p-6">
          <h2 className="font-anton text-xl uppercase text-white">Database activation pending</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#B8B8C0]">{state.message}</p>
          <p className="mt-3 text-xs text-[#A1A1AA]">
            Existing XP and memberships are unchanged. Earning and claiming stay disabled until
            server setup is complete.
          </p>
        </section>
      )}
      {active && (
        <>
          {active.status === "disabled" && (
            <p className="rounded-xl border border-amber-300/20 p-4 text-sm text-amber-200">
              Earn Plus is not active yet. These are your last confirmed balances; no new rewards
              are being issued.
            </p>
          )}
          {!active.account.verified && (
            <p className="rounded-xl border border-amber-300/20 p-4 text-sm text-amber-200">
              Verify your email or phone number before starting reward missions.
            </p>
          )}
          {dayEnded && (
            <p className="rounded-xl border border-amber-300/20 p-4 text-sm text-amber-200">
              A new reward day has begun. Refresh to load today's missions.
            </p>
          )}

          <section className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
            <div className="space-y-5 rounded-2xl border border-white/10 bg-[#17171A] p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Gift className="h-4 w-4 text-rose-300" /> Your reward progress
              </h2>
              <ProgressMeter
                label="Reward XP"
                value={active.wallet.rewardXp}
                target={active.policy.rewardXpCost}
              />
              <ProgressMeter
                label="Qualifying days"
                value={active.wallet.qualifyingDays}
                target={active.policy.requiredQualifyingDays}
              />
              <p className="text-xs leading-relaxed text-[#A1A1AA]">
                A qualifying day needs at least one completed reward mission. Check-ins alone do not
                count.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#17171A] p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Flame className="h-4 w-4 text-orange-300" /> Daily login streak
              </h2>
              <p className="mt-4 font-mono text-3xl font-bold text-white">
                {active.wallet.currentLoginStreak}
                <span className="ml-2 text-sm font-normal text-[#A1A1AA]">days</span>
              </p>
              <p className="mt-1 text-xs text-[#A1A1AA]">
                Best: {active.wallet.bestLoginStreak} days
              </p>
              <p className="mt-3 text-xs leading-relaxed text-[#B8B8C0]">
                +{active.policy.checkinProfileXp} Profile XP daily, plus{" "}
                {active.policy.milestoneProfileXp} every {active.policy.milestoneDays} consecutive
                days. Login XP is not redeemable.
              </p>
              {active.wallet.checkedInToday ? (
                <p className="mt-4 flex items-center gap-1.5 text-xs text-emerald-300">
                  <Check className="h-4 w-4" /> Today's check-in saved
                </p>
              ) : (
                <button
                  type="button"
                  className={secondaryButton + " mt-4"}
                  disabled={paused || Boolean(pending)}
                  onClick={() => {
                    void checkIn();
                  }}
                >
                  {pending?.startsWith("checkin:") ? "Saving check-in…" : "Check in today"}
                </button>
              )}
            </div>
          </section>

          <section aria-label="Today's reward missions" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-anton text-2xl uppercase text-white">
                  Today's reward missions
                </h2>
                <p className="mt-1 text-xs text-[#A1A1AA]">
                  {active.wallet.missionsCompletedToday} / {active.missions.length} completed ·{" "}
                  {active.wallet.rewardXpToday} / {active.policy.dailyRewardXpCap} Reward XP today
                </p>
              </div>
              <p className="flex items-center gap-1.5 font-mono text-xs text-[#B8B8C0]">
                <Clock3 className="h-3.5 w-3.5" /> Reset in{" "}
                {formatRewardDuration(rewardSecondsRemaining(active.nextResetAt, serverNowMs))}
              </p>
            </div>
            {active.missions.map((mission) => (
              <MissionCard
                key={active.policyDay + ":" + mission.key}
                mission={mission}
                paused={paused}
                anotherRunning={Boolean(running && running.key !== mission.key)}
              />
            ))}
            <p className="text-xs leading-relaxed text-[#A1A1AA]">
              One timed mission at a time. Server checks prevent instant completion and repeat
              grants; your activity reflection is self-reported. Personal tasks, manual logs, and
              old XP never add Reward XP.
            </p>
          </section>

          <section className="rounded-2xl border border-rose-400/20 bg-[#17171A] p-5">
            <h2 className="font-anton text-2xl uppercase text-white">
              Claim your {active.policy.plusDays} days
            </h2>
            <p className="mt-2 text-sm text-[#B8B8C0]">
              {active.policy.rewardXpCost.toLocaleString()} Reward XP ·{" "}
              {active.policy.requiredQualifyingDays} qualifying days · account age{" "}
              {active.account.ageDays} / {active.policy.requiredAccountAgeDays} days
            </p>
            {active.account.lifetimeAccess ? (
              <p className="mt-4 text-sm text-amber-200">
                Lifetime access already active. Your membership will not be shortened and no XP will
                be spent.
              </p>
            ) : (
              <>
                {active.eligibility.reasons.length > 0 && (
                  <ul className="mt-4 list-inside list-disc space-y-1 text-xs text-[#B8B8C0]">
                    {active.eligibility.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className={primaryButton + " mt-4 w-full sm:w-auto"}
                  disabled={!active.eligibility.canClaim || Boolean(pending) || paused}
                  onClick={() => setConfirmClaim(true)}
                >
                  {active.account.alreadyRedeemed
                    ? "Launch reward already claimed"
                    : "Redeem for " + active.policy.plusDays + " days"}
                </button>
              </>
            )}
            <p className="mt-3 text-xs text-[#A1A1AA]">
              Your Profile XP stays intact. Active timed Plus is extended; no payment method or
              automatic billing is added.
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#17171A] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Zap className="h-4 w-4 text-rose-300" /> Recent confirmed receipts
            </h2>
            {active.ledger.length === 0 ? (
              <p className="mt-4 text-sm text-[#A1A1AA]">
                Your confirmed check-ins and mission receipts will appear here.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-white/5">
                {active.ledger.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 py-3 text-xs"
                  >
                    <div>
                      <p className="capitalize text-[#D0D0D5]">{entry.kind.replaceAll("_", " ")}</p>
                      <p className="mt-1 font-mono text-[10px] text-[#A1A1AA]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono">
                      {entry.rewardXpDelta !== 0 && (
                        <p className="text-rose-300">
                          {entry.rewardXpDelta > 0 ? "+" : ""}
                          {entry.rewardXpDelta} Reward XP
                        </p>
                      )}
                      {entry.profileXpDelta !== 0 && (
                        <p className="text-[#B8B8C0]">+{entry.profileXpDelta} Profile XP</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-center text-xs text-[#A1A1AA]">
            The 60-Day Challenge and its two-month reward remain separate.
          </p>

          <AlertDialog
            open={confirmClaim}
            onOpenChange={(open) => {
              if (!pending) setConfirmClaim(open);
            }}
          >
            <AlertDialogContent className="border-white/15 bg-[#17171A] text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Spend {active.policy.rewardXpCost.toLocaleString()} Reward XP?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[#B8B8C0]">
                  Claim {active.policy.plusDays} days of Plus once. Your Profile XP stays unchanged.
                  There is no automatic charge.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {actionError && <p className="text-sm text-rose-200">{actionError}</p>}
              <AlertDialogFooter>
                <AlertDialogCancel
                  className="border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white"
                  disabled={Boolean(pending)}
                >
                  Keep earning
                </AlertDialogCancel>
                <button
                  type="button"
                  className={primaryButton}
                  disabled={Boolean(pending) || !active.eligibility.canClaim}
                  onClick={() => {
                    void redeemPlus().then((ok) => {
                      if (ok) setConfirmClaim(false);
                    });
                  }}
                >
                  {pending ? "Confirming…" : "Claim " + active.policy.plusDays + "-day Plus"}
                </button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
