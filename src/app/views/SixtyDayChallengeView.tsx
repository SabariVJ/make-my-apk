import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarCheck,
  Lock,
  CheckCircle2,
  Flame,
  Copy,
  Check,
  Play,
  RotateCcw,
  Target,
  Zap,
  Timer,
  PenLine,
  AlertTriangle,
  Crown,
  Loader2,
  Medal,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { CHALLENGE_DAYS, TOTAL_DAYS, getDayDef } from "@/lib/challengeDays";
import {
  getChallengeState,
  startChallenge,
  completeChallengeDay,
  resumeChallenge,
  adminDebugCompleteChallenge,
  type ChallengeState,
  type CompleteDayInput,
} from "@/lib/challenge.functions";

const BANNER_COPY =
  "Complete all 60 days to earn a redeem code for 2 months of SVJ Plus, free. One unique code per finisher. Locked to your account, single use, not transferable.";

const FOCUS_COLORS: Record<string, string> = {
  Physical: "text-[#C81E3A] border-[#C81E3A]/40 bg-[#C81E3A]/10",
  Discipline: "text-orange-400 border-orange-400/40 bg-orange-400/10",
  Mental: "text-violet-400 border-violet-400/40 bg-violet-400/10",
  Nutrition: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  Mindset: "text-amber-400 border-amber-400/40 bg-amber-400/10",
};

function formatRemaining(msLeft: number): string {
  if (msLeft <= 0) return "unlocked";
  const totalH = Math.floor(msLeft / 3_600_000);
  const h = totalH % 24;
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  if (totalH >= 24) return `~${Math.floor(totalH / 24)}d ${h}h`;
  return h > 0 ? `~${h}h ${m}m` : `~${m}m`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export const SixtyDayChallengeView: React.FC = () => {
  const { triggerConfetti, awardXp } = useSVJ();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState("");
  const [reflection, setReflection] = useState("");
  const [copied, setCopied] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);
  const [, forceTick] = useState(0);

  const callGetState = useServerFn(getChallengeState);
  const callStart = useServerFn(startChallenge);
  const callComplete = useServerFn(completeChallengeDay);
  const callResume = useServerFn(resumeChallenge);
  const callDebug = useServerFn(adminDebugCompleteChallenge);

  const stateQuery = useQuery({
    queryKey: ["sixty-challenge"],
    queryFn: () => callGetState({}) as Promise<ChallengeState>,
    // staleTime 0 keeps server state authoritative (unlock clock lives server-side);
    // a non-zero gcTime keeps previously loaded state in the cache so re-opening
    // the tab paints instantly and refreshes in the background instead of
    // remounting a blank loader every time.
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Cosmetically tick a countdown every 30s while a day is waiting to unlock.
  useEffect(() => {
    if (stateQuery.data?.status !== "active" || stateQuery.data?.currentUnlocked) return;
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [stateQuery.data?.status, stateQuery.data?.currentUnlocked]);

  const startMutation = useMutation({
    mutationFn: () => callStart({}),
    onSuccess: () => {
      triggerConfetti();
      queryClient.invalidateQueries({ queryKey: ["sixty-challenge"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => callResume({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sixty-challenge"] }),
  });

  const completeMutation = useMutation({
    mutationFn: (input: CompleteDayInput) => callComplete({ data: input }),
    onSuccess: (next) => {
      setChecked(new Set());
      setDuration("");
      setReflection("");
      setSelectedDay(null);
      queryClient.invalidateQueries({ queryKey: ["sixty-challenge"] });
      // XP is only applied client-side when the SERVER confirms it granted XP
      // for this completion (lastGrantedXp > 0). Replays/double-clicks return 0
      // and never touch the XP counters — exactly-once by construction.
      if ((next.lastGrantedXp ?? 0) > 0) {
        awardXp(next.lastGrantedXp);
      }
      if (next.status === "completed") {
        triggerConfetti();
        setTimeout(triggerConfetti, 700);
        setTimeout(triggerConfetti, 1400);
      } else {
        triggerConfetti();
      }
    },
  });

  const state = stateQuery.data;

  const handleDebug = async () => {
    setDebugBusy(true);
    try {
      await callDebug({});
      queryClient.invalidateQueries({ queryKey: ["sixty-challenge"] });
    } finally {
      setDebugBusy(false);
    }
  };

  const handleCopy = async (code: string) => {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (stateQuery.isPending) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#C81E3A]" />
        <p className="text-[11px] font-mono text-[#8C8C90] uppercase tracking-wider">
          Loading the 60-Day Challenge
        </p>
      </div>
    );
  }

  if (stateQuery.isError || !state) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-[#C81E3A]" />
        <p className="font-anton uppercase tracking-wider text-white">
          Could not load the challenge
        </p>
        <p className="text-[11px] font-mono text-[#8C8C90] max-w-xs">
          {stateQuery.error instanceof Error ? stateQuery.error.message : "Something went wrong."}
        </p>
        <button
          onClick={() => stateQuery.refetch()}
          className="px-4 py-2 rounded-xl bg-[#C81E3A] text-white font-mono text-xs cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const currentDef = getDayDef(state.currentDay);
  const selectedDef = selectedDay ? getDayDef(selectedDay) : null;
  const selectedStatus = selectedDay
    ? (state.days.find((d) => d.day === selectedDay)?.status ?? "locked")
    : null;
  const allChecked =
    currentDef != null &&
    currentDef.tasks.length > 0 &&
    currentDef.tasks.every((_, i) => checked.has(String(i)));
  const canComplete =
    state.status === "active" &&
    state.currentUnlocked &&
    allChecked &&
    Number(duration) >= 1 &&
    reflection.trim().length >= 5;

  return (
    <div className="space-y-5 pb-28">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-[#17171A] border border-white/10 p-6 shadow-2xl">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-[#C81E3A]/15 blur-3xl animate-crimson-pulse pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#8C8C90] uppercase tracking-wider mb-1">
              <CalendarCheck className="w-4 h-4 text-[#C81E3A]" />
              <span>60-Day Program</span>
              <span>•</span>
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <Crown className="w-3.5 h-3.5" /> 2 Months SVJ Plus Reward
              </span>
            </div>
            <h1 className="font-anton text-3xl sm:text-4xl text-white uppercase tracking-wide">
              The 60-Day <span className="text-[#C81E3A]">Gauntlet</span>
            </h1>
            <p className="text-xs text-[#8C8C90] font-inter mt-1">
              One day at a time. Each day unlocks 24h after the last. Finish all 60 and your redeem
              code is generated server-side, automatically.
            </p>
          </div>

          {state.status !== "not_started" && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-xs font-mono flex items-center gap-1.5 text-orange-400">
                <Flame className="w-4 h-4 fill-orange-500/20" />
                <span>{state.currentStreak} streak</span>
              </div>
              {state.status === "completed" && (
                <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs font-mono flex items-center gap-1.5 text-amber-400 font-bold">
                  <Medal className="w-4 h-4" /> FINISHED
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Reward banner (always visible, upfront) ─────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-950/40 via-[#1F1711] to-[#17171A] border border-amber-500/30 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-anton text-amber-400 uppercase tracking-wide mb-0.5">
            The Reward — read this before you start
          </div>
          <p className="text-xs text-amber-100/90 font-inter leading-relaxed">{BANNER_COPY}</p>
        </div>
      </div>

      {/* ── Not started: intro + start ──────────────────────────────────── */}
      {state.status === "not_started" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-[#17171A] border border-white/10 p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#8C8C90] uppercase tracking-wider">
            <Target className="w-4 h-4 text-[#C81E3A]" />
            <span>How it works</span>
          </div>
          <ul className="space-y-2 text-sm font-inter text-[#F4F2ED]/90">
            <li className="flex items-start gap-2">
              <span className="text-[#C81E3A] font-mono mt-0.5">01</span>
              Day 1 unlocks the moment you start. Day N unlocks exactly 24h × (N−1) later — the
              clock is server-recorded, so device tricks don't work.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#C81E3A] font-mono mt-0.5">02</span>
              Every day has a themed focus, an XP value, and specific tasks you check off — plus a
              required daily check-in (duration + reflection) before the day counts.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#C81E3A] font-mono mt-0.5">03</span>
              Miss a day? The program pauses. Resume whenever you're ready — your streak and
              completed-day history are preserved.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#C81E3A] font-mono mt-0.5">04</span>
              Finish all 60 days and the server verifies the run, then generates one unique
              <span className="font-mono text-amber-400"> SVJ-XXXX-XXXX </span>
              redeem code for you. Single use, locked to your account.
            </li>
          </ul>

          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="w-full py-3.5 rounded-2xl bg-[#C81E3A] hover:bg-[#A0182E] disabled:opacity-60 text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-2xl shadow-[#C81E3A]/30"
          >
            {startMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            <span>Start Day 1 — Ignition</span>
          </button>
        </motion.div>
      )}

      {/* ── In progress / paused: stats + day grid + work panel ─────────── */}
      {(state.status === "active" || state.status === "paused") && (
        <>
          {/* Stats + progress bar */}
          <div className="rounded-3xl bg-[#17171A] border border-white/10 p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5">
                <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1 flex items-center gap-1">
                  <CalendarCheck className="w-3 h-3 text-[#C81E3A]" /> Current Day
                </div>
                <div className="font-mono text-lg font-bold text-white">
                  Day {Math.min(state.currentDay, TOTAL_DAYS)}/{TOTAL_DAYS}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5">
                <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Completed
                </div>
                <div className="font-mono text-lg font-bold text-white">{state.daysCompleted}</div>
              </div>
              <div className="p-3 rounded-2xl bg-[#0B0B0C] border border-white/5">
                <div className="text-[10px] font-mono text-[#8C8C90] uppercase mb-1 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-orange-400" /> Streak
                </div>
                <div className="font-mono text-lg font-bold text-orange-400">
                  {state.currentStreak}d
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-[#8C8C90]">
                <span>Progress</span>
                <span>
                  {state.daysCompleted} / {TOTAL_DAYS} days
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#0B0B0C] overflow-hidden p-0.5 border border-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((state.daysCompleted / TOTAL_DAYS) * 100)}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#E62846] to-[#C81E3A]"
                />
              </div>
            </div>
          </div>

          {/* Missed / paused callout */}
          {state.status === "paused" && (
            <div className="rounded-2xl bg-[#1F1416] border border-amber-500/40 p-4 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              <div className="flex-1">
                <div className="text-xs font-anton text-amber-400 uppercase tracking-wide">
                  Day {state.currentDay} was missed — program paused
                </div>
                <p className="text-[11px] text-[#8C8C90] font-inter mt-0.5">
                  Your streak ({state.currentStreak}d) and all completed days are preserved. Resume
                  when ready; the next day unlocks immediately after.
                </p>
              </div>
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resume
              </button>
            </div>
          )}

          {/* Day grid */}
          <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
            {state.days.map((d) => {
              const def = getDayDef(d.day);
              const isSelected = selectedDay === d.day;
              return (
                <button
                  key={d.day}
                  onClick={() => {
                    if (d.status === "completed" || d.status === "current") {
                      setSelectedDay(d.day === selectedDay ? null : d.day);
                    }
                  }}
                  title={d.status === "locked" ? `Day ${d.day} — locked` : def?.title}
                  className={`relative aspect-square rounded-xl border flex items-center justify-center font-mono text-xs transition-all cursor-pointer ${
                    d.status === "completed"
                      ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-400"
                      : d.status === "current"
                        ? state.currentUnlocked
                          ? "bg-[#C81E3A] border-[#C81E3A] text-white font-bold shadow-lg shadow-[#C81E3A]/30"
                          : "bg-[#C81E3A]/25 border-[#C81E3A]/60 text-[#F4F2ED] font-bold"
                        : d.status === "missed"
                          ? "bg-amber-950/40 border-amber-500/40 text-amber-400"
                          : "bg-[#0B0B0C] border-white/8 text-[#8C8C90]/60"
                  } ${isSelected ? "ring-2 ring-white/40" : ""}`}
                >
                  {d.status === "completed" ? (
                    <Check className="w-4 h-4" />
                  ) : d.status === "locked" ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : d.status === "missed" ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : (
                    d.day
                  )}
                </button>
              );
            })}
          </div>

          {/* Work panel: current day (or selected completed day) */}
          <AnimatePresence mode="wait">
            {selectedDef && (selectedStatus === "completed" || selectedStatus === "current") ? (
              <motion.div
                key={`detail-${selectedDef.day}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-3xl bg-[#17171A] border border-white/10 p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono text-[#8C8C90] uppercase tracking-wider mb-1">
                      {selectedStatus === "current" ? "Your current day" : "Completed day"}
                    </div>
                    <h2 className="font-anton text-xl text-white uppercase tracking-wide">
                      {selectedDef.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border ${FOCUS_COLORS[selectedDef.focus]}`}
                    >
                      {selectedDef.focus}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#0B0B0C] border border-white/10 text-[10px] font-mono font-bold text-[#C81E3A]">
                      +{selectedDef.xp} XP
                    </span>
                  </div>
                </div>

                {selectedStatus === "completed" ? (
                  <div className="space-y-2">
                    {selectedDef.tasks.map((t, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-[#0B0B0C] border border-white/5 flex items-center gap-3"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-xs text-[#8C8C90] font-inter">{t}</span>
                      </div>
                    ))}
                  </div>
                ) : !state.currentUnlocked ? (
                  <div className="p-4 rounded-2xl bg-[#0B0B0C] border border-white/10 flex items-center gap-3">
                    <Lock className="w-5 h-5 text-[#8C8C90]" />
                    <div>
                      <div className="text-xs font-mono text-[#F4F2ED] font-bold">
                        Unlocks{" "}
                        {state.currentUnlockAt
                          ? formatRemaining(
                              new Date(state.currentUnlockAt).getTime() -
                                new Date(state.serverNow).getTime(),
                            )
                          : "soon"}
                      </div>
                      <div className="text-[11px] text-[#8C8C90] font-inter mt-0.5">
                        Task details stay hidden until the day unlocks. Day {selectedDef.day}{" "}
                        unlocks at{" "}
                        {state.currentUnlockAt
                          ? new Date(state.currentUnlockAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                        .
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Tasks */}
                    <div className="space-y-2">
                      {selectedDef.tasks.map((t, i) => {
                        const isChecked = checked.has(String(i));
                        return (
                          <button
                            key={i}
                            onClick={() =>
                              setChecked((prev) => {
                                const next = new Set(prev);
                                if (next.has(String(i))) next.delete(String(i));
                                else next.add(String(i));
                                return next;
                              })
                            }
                            className={`w-full p-3 rounded-xl border flex items-center gap-3 text-left transition-all cursor-pointer ${
                              isChecked
                                ? "bg-[#C81E3A]/10 border-[#C81E3A]/50"
                                : "bg-[#0B0B0C] border-white/10 hover:border-white/25"
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isChecked
                                  ? "bg-[#C81E3A] border-[#C81E3A] text-white"
                                  : "border-white/25 text-transparent"
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </div>
                            <span
                              className={`text-xs font-inter ${
                                isChecked
                                  ? "text-[#F4F2ED] line-through opacity-80"
                                  : "text-[#F4F2ED]"
                              }`}
                            >
                              {t}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Daily check-in */}
                    <div className="p-4 rounded-2xl bg-[#0B0B0C] border border-white/10 space-y-3">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-[#8C8C90] uppercase tracking-wider">
                        <PenLine className="w-3.5 h-3.5 text-amber-400" />
                        Daily check-in — required to complete this day
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 flex-1">
                          <Timer className="w-4 h-4 text-[#8C8C90]" />
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            placeholder="Session duration"
                            className="w-full bg-[#17171A] svj-border rounded-lg px-3 py-2 text-sm font-mono text-[#F4F2ED] placeholder:text-[#8C8C90]/60 focus:outline-none focus:border-[#C81E3A]/60"
                          />
                          <span className="text-[10px] font-mono text-[#8C8C90]">min</span>
                        </div>
                      </div>
                      <textarea
                        value={reflection}
                        onChange={(e) => setReflection(e.target.value)}
                        rows={3}
                        placeholder={selectedDef.checkin}
                        className="w-full bg-[#17171A] svj-border rounded-xl px-3 py-2.5 text-sm font-inter text-[#F4F2ED] placeholder:text-[#8C8C90]/60 focus:outline-none focus:border-[#C81E3A]/60 resize-none"
                      />
                    </div>

                    {completeMutation.isError && (
                      <div className="p-3 rounded-xl bg-[#3A1218] border border-[#C81E3A]/40 text-xs text-rose-200 font-inter">
                        {completeMutation.error instanceof Error
                          ? completeMutation.error.message
                          : "Could not complete the day. Please retry."}
                      </div>
                    )}

                    <button
                      onClick={() =>
                        completeMutation.mutate({
                          taskIds: Array.from(checked),
                          durationMinutes: Math.round(Number(duration)) || 0,
                          reflection: reflection.trim(),
                        })
                      }
                      disabled={!canComplete || completeMutation.isPending}
                      className="w-full py-3.5 rounded-2xl bg-[#C81E3A] hover:bg-[#A0182E] disabled:opacity-40 text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-[#C81E3A]/25"
                    >
                      {completeMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5" />
                      )}
                      <span>
                        {selectedDef.day === TOTAL_DAYS
                          ? "Finish the 60-Day Gauntlet"
                          : `Complete Day ${selectedDef.day}`}
                      </span>
                    </button>
                    {!canComplete && (
                      <p className="text-center text-[10px] font-mono text-[#8C8C90]">
                        Check all tasks, add a duration, and write a reflection to complete this
                        day.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl bg-[#17171A] border border-white/10 p-4 text-center"
              >
                <p className="text-[11px] font-mono text-[#8C8C90]">
                  {state.currentUnlocked
                    ? `Day ${state.currentDay} is waiting — tap it to start.`
                    : `Day ${state.currentDay} unlocks soon — tap it to see the countdown.`}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── Completed: celebration + code ───────────────────────────────── */}
      {state.status === "completed" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#2A1F10] via-[#17171A] to-[#0B0B0C] border border-amber-500/40 p-8 text-center shadow-2xl"
        >
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

          <div className="relative space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-mono font-bold tracking-widest uppercase">
              <Medal className="w-4 h-4" /> 60 / 60 Champion
            </div>
            <h1 className="font-anton text-3xl sm:text-4xl text-white uppercase tracking-wide">
              You finished the <span className="text-amber-400">Gauntlet</span>
            </h1>
            <p className="text-xs text-[#8C8C90] font-inter max-w-md mx-auto leading-relaxed">
              Every day completed, in order, verified by the server. You earned it — here is your
              one-of-a-kind redeem code.
            </p>

            {state.code ? (
              <div className="max-w-md mx-auto space-y-3">
                <div className="p-5 rounded-2xl bg-[#0B0B0C] border border-amber-500/30 svj-card-glow">
                  <div className="text-[10px] font-mono text-[#8C8C90] uppercase tracking-widest mb-2">
                    Your redeem code — locked to your account
                  </div>
                  <div className="font-mono text-2xl sm:text-3xl font-bold tracking-[0.15em] text-amber-400 break-all">
                    {state.code}
                  </div>
                  <button
                    onClick={() => handleCopy(state.code!)}
                    className="mt-4 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold flex items-center gap-2 mx-auto cursor-pointer transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy code"}
                  </button>
                </div>
                <p className="text-[11px] font-mono text-[#8C8C90]">
                  {state.codeRedeemed
                    ? "Redeemed — SVJ Plus is active on this account. Single use, non-transferable."
                    : "Redeem it in Rewards → Redeem code for 2 months of SVJ Plus. Single use, non-transferable."}
                </p>
              </div>
            ) : (
              <p className="text-xs font-mono text-amber-300/80">
                Verifying your run… your code is being generated.
              </p>
            )}

            <div className="pt-2 flex items-center justify-center gap-2 text-[11px] font-mono text-[#8C8C90]">
              <Zap className="w-3.5 h-3.5 text-[#C81E3A]" />
              <span>{state.daysCompleted} days completed</span>
              <span>•</span>
              <span>Best streak: {state.bestStreak}d</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── DEBUG (founder only) — REMOVE BEFORE PLAY STORE ─────────────── */}
      {state.debugIsAdmin && (
        <div className="rounded-2xl bg-[#17171A] border border-dashed border-[#C81E3A]/50 p-4">
          <div className="text-[10px] font-mono text-[#C81E3A] uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            DEBUG — Founder only — remove before Play Store
          </div>
          <button
            onClick={handleDebug}
            disabled={debugBusy}
            className="px-4 py-2 rounded-xl bg-[#C81E3A]/20 hover:bg-[#C81E3A]/40 border border-[#C81E3A]/50 text-[#C81E3A] font-mono text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center gap-2"
          >
            {debugBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            DEBUG: Auto-complete all 60 days (real verification + code generation)
          </button>
          <p className="text-[10px] font-mono text-[#8C8C90] mt-2">
            Calls the real completion-verification and code-generation paths. Generates a real
            redeem code for sabarivj777@gmail.com.
          </p>
        </div>
      )}
    </div>
  );
};
