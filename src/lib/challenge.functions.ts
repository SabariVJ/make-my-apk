// ============================================================================
// 60-Day Challenge — server-side functions.
//
// SECURITY MODEL (emergency backend stabilization — no admin key required)
//   * Every call is authenticated: requireSupabaseAuth validates the caller's
//     own JWT and provides a publishable-key client carrying the user's own
//     bearer token. All reads/writes go through self-service SECURITY DEFINER
//     database RPCs that derive identity from auth.uid() — never from a
//     caller-supplied user_id. No requireAdminKey / service-role client is
//     involved anywhere in these flows.
//   * The challenge tables keep RLS enabled with zero policies and no
//     authenticated grants: direct client writes remain impossible.
//   * "now" always comes from the DATABASE clock (now() inside the RPCs),
//     never the device clock. Day N unlocks at anchor + (N - 1) * 24h where
//     anchor is the server-recorded start time.
//   * Day content (XP / focus / tasks) lives server-side in
//     challenge_day_definitions; a caller cannot choose their own XP.
//   * The completion path is verified server-side in strictly sequential order
//     and the redeem code is generated server-side, never on the client.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TOTAL_DAYS, DAY_MS, getDayDef } from "./challengeDays";

const FOUNDER_EMAIL = "sabarivj777@gmail.com";

export type ChallengeRunStatus = "not_started" | "active" | "paused" | "completed";
export type ChallengeDayStatus = "completed" | "current" | "locked" | "missed";

export interface ChallengeDayState {
  day: number;
  status: ChallengeDayStatus;
  completedAt?: string;
}

export interface ChallengeState {
  status: ChallengeRunStatus;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  /** Next day to complete (1..60), or 61 when the program is finished. */
  currentDay: number;
  daysCompleted: number;
  currentStreak: number;
  bestStreak: number;
  currentUnlockAt: string | null;
  currentUnlocked: boolean;
  days: ChallengeDayState[];
  serverNow: string;
  code: string | null;
  codeRedeemed: boolean;
  debugIsAdmin: boolean;
  /** XP awarded by the LAST write call (0 for reads / replayed completions). */
  lastGrantedXp: number;
}

export interface CompleteDayInput {
  taskIds: string[];
  durationMinutes: number;
  reflection: string;
}

export type RedeemResult =
  { ok: true; message: string; plusExpiresAt: string | null } | { ok: false; message: string };

// ── RPC result parsing ───────────────────────────────────────────────────────

interface RawChallengeState {
  status?: string;
  startedAt?: string | null;
  pausedAt?: string | null;
  completedAt?: string | null;
  currentDay?: number;
  daysCompleted?: number;
  currentStreak?: number;
  bestStreak?: number;
  currentUnlockAt?: string | null;
  currentUnlocked?: boolean;
  dayKeys?: number[];
  dayStates?: Record<string, { status?: string; completedAt?: string | null }>;
  code?: string | null;
  codeRedeemed?: boolean;
  serverNow?: string;
  lastGrantedXp?: number;
}

/** Normalizes the RPC's JSON shape into the client-facing ChallengeState. */
function parseChallengeState(raw: unknown): ChallengeState {
  const r = (raw ?? {}) as RawChallengeState;
  const dayKeys = Array.isArray(r.dayKeys) ? r.dayKeys : [];
  const dayStates = r.dayStates ?? {};

  const days: ChallengeDayState[] = dayKeys.map((d) => {
    const s = dayStates[String(d)] ?? {};
    const status =
      s.status === "completed" || s.status === "current" || s.status === "missed"
        ? s.status
        : "locked";
    return status === "completed" && s.completedAt
      ? { day: d, status, completedAt: s.completedAt }
      : { day: d, status };
  });

  return {
    status: (r.status ?? "not_started") as ChallengeState["status"],
    startedAt: r.startedAt ?? null,
    pausedAt: r.pausedAt ?? null,
    completedAt: r.completedAt ?? null,
    currentDay: Number(r.currentDay ?? 1),
    daysCompleted: Number(r.daysCompleted ?? 0),
    currentStreak: Number(r.currentStreak ?? 0),
    bestStreak: Number(r.bestStreak ?? 0),
    currentUnlockAt: r.currentUnlockAt ?? null,
    currentUnlocked: Boolean(r.currentUnlocked),
    days,
    serverNow: r.serverNow ?? new Date().toISOString(),
    code: r.code ?? null,
    codeRedeemed: Boolean(r.codeRedeemed),
    debugIsAdmin: false,
    lastGrantedXp: Number(r.lastGrantedXp ?? 0),
  };
}

// ── Local mirror of the server-side run math (fast, friendly client errors) ──

interface ComputedRun {
  daysCompleted: number;
  nextDay: number; // 1..60, or 61 when finished
  unlockAtMs: number | null;
  effectiveStatus: ChallengeRunStatus;
}

function computeRun(
  enrollment: { startedAt: string; status: string } | null,
  daysCompleted: number,
  nowMs: number,
): ComputedRun {
  if (!enrollment) {
    return { daysCompleted: 0, nextDay: 1, unlockAtMs: null, effectiveStatus: "not_started" };
  }

  const nextDay = daysCompleted + 1;
  if (nextDay > TOTAL_DAYS) {
    return { daysCompleted, nextDay, unlockAtMs: null, effectiveStatus: "completed" };
  }

  const anchorMs = new Date(enrollment.startedAt).getTime();
  const unlockAtMs = anchorMs + (nextDay - 1) * DAY_MS;
  const windowElapsed = nowMs > unlockAtMs + DAY_MS;

  if (enrollment.status === "paused" || windowElapsed) {
    return { daysCompleted, nextDay, unlockAtMs, effectiveStatus: "paused" };
  }
  return { daysCompleted, nextDay, unlockAtMs, effectiveStatus: "active" };
}

/**
 * Authoritative state fetch for the current user (identity = auth.uid() inside
 * the RPC). Used by completeChallengeDay for pre-flight error parity.
 */
async function fetchMyChallengeState(supabase: unknown): Promise<ChallengeState> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data, error } = await client.rpc("svj_get_my_challenge_state");
  if (error) throw new Error(error.message);
  return parseChallengeState(data);
}

// ── Public server functions ──────────────────────────────────────────────────

/** Read-only state for the current user (the RPC lazily persists a missed-day pause). */
export const getChallengeState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeState> => {
    // context.supabase is the publishable-key client carrying the caller's own
    // bearer token. The generated types intentionally lag additive SQL
    // migrations; these RPCs have fixed, audited JSON shapes and are cast
    // locally — the same approach as the membership RPC in trial.functions.ts.
    const state = await fetchMyChallengeState(context.supabase);
    const email = ((context.claims["email"] as string | undefined) ?? "").toLowerCase();
    return { ...state, debugIsAdmin: email === FOUNDER_EMAIL };
  });

/** Start the 60-day program (the RPC records the server start time / unlock clock). */
export const startChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeState> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data, error } = await client.rpc("svj_start_my_challenge");
    if (error) throw new Error(error.message);
    return parseChallengeState(data);
  });

/**
 * Complete the current day. The RPC enforces the full validation contract:
 *  - auth + enrollment + not paused/completed
 *  - strictly sequential (day must be daysCompleted + 1)
 *  - unlock time from the DB clock (anchor + (day-1)*24h)
 *  - ALL of the day's tasks checked (validated against server-side definitions)
 *  - required check-in (duration + reflection)
 *  - XP/focus from the server-side definition table via the existing verified
 *    activity RPC (exactly-once XP, stats, rivalry)
 * Finishing day 60 triggers full verification + the code grant.
 */
export const completeChallengeDay = createServerFn({ method: "POST" })
  .validator((input: CompleteDayInput) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ChallengeState> => {
    const input = data as CompleteDayInput;
    const taskIds = Array.isArray(input?.taskIds) ? input.taskIds : [];
    const durationMinutes = Math.round(Number(input?.durationMinutes) || 0);
    const reflection = typeof input?.reflection === "string" ? input.reflection : "";

    // Fast, friendly pre-flight using the caller's own server state. The RPC
    // re-validates everything authoritatively — including the unlock window on
    // the database clock — so this mirror can never widen the contract.
    const state = await fetchMyChallengeState(context.supabase);
    const run = computeRun(
      state.startedAt ? { startedAt: state.startedAt, status: state.status } : null,
      state.daysCompleted,
      new Date(state.serverNow).getTime(),
    );

    if (run.effectiveStatus === "not_started") {
      throw new Error("Start the 60-Day Challenge before completing days.");
    }
    if (run.effectiveStatus === "paused") {
      throw new Error("This day was missed. Resume the challenge to continue.");
    }
    if (run.effectiveStatus === "completed") {
      throw new Error("The 60-Day Challenge is already complete.");
    }
    const day = run.nextDay;
    if (run.unlockAtMs === null || new Date(state.serverNow).getTime() < run.unlockAtMs) {
      throw new Error(
        `Day ${day} is not unlocked yet. It unlocks ${
          run.unlockAtMs ? new Date(run.unlockAtMs).toISOString() : "later"
        }.`,
      );
    }
    const dayDef = getDayDef(day);
    if (!dayDef) throw new Error("Unknown day definition.");

    const required = new Set(dayDef.tasks.map((_, i) => String(i)));
    const submitted = new Set(taskIds.map(String));
    const allTasksDone =
      required.size > 0 &&
      required.size === submitted.size &&
      [...required].every((t) => submitted.has(t));
    if (!allTasksDone) {
      throw new Error("Check off every task for this day before completing it.");
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
      throw new Error("Add a valid check-in duration (1–600 minutes).");
    }
    if (reflection.trim().length < 5) {
      throw new Error("Write a short check-in reflection before finishing the day.");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: award, error } = await (context.supabase as any).rpc(
      "svj_complete_my_challenge_day",
      {
        p_task_ids: JSON.stringify(taskIds),
        p_duration_minutes: durationMinutes,
        p_reflection: reflection,
      },
    );
    if (error) throw new Error(error.message);

    return parseChallengeState(award);
  });

/** Resume after a missed day: the RPC re-anchors the unlock clock, keeping streak + history. */
export const resumeChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeState> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;
    const { data, error } = await client.rpc("svj_resume_my_challenge");
    if (error) throw new Error(error.message);
    return parseChallengeState(data);
  });

/**
 * Redeem an earned SVJ-XXXX-XXXX code. The RPC validates server-side:
 *  - code exists and is unredeemed
 *  - code belongs to the redeeming account (locked to the finisher,
 *    non-transferable) — identity is auth.uid(), never a client user_id
 *  - on success: permanently marks the code redeemed (single use, even for the
 *    original account) and grants Plus for exactly 2 months from redemption.
 * Errors are deliberately generic so we never reveal whether a code exists but
 * was used vs. never existed (makes codes unguessable).
 */
export const redeemPlusCode = createServerFn({ method: "POST" })
  .validator((input: { code: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<RedeemResult> => {
    const input = data as { code?: string };
    const raw = typeof input?.code === "string" ? input.code.trim().toUpperCase() : "";
    const genericMessage = "This code is invalid or has already been redeemed.";
    if (!raw) return { ok: false, message: genericMessage };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (context.supabase as any).rpc("svj_redeem_my_plus_code", {
      p_code: raw,
    });
    if (error) {
      // The RPC returns structured results for all code-level outcomes; a
      // thrown error here is infrastructure-level. Stay generic either way.
      return { ok: false, message: genericMessage };
    }

    const payload = (result ?? {}) as {
      ok?: boolean;
      message?: string;
      plusExpiresAt?: string | null;
    };
    if (payload.ok === true) {
      return {
        ok: true,
        message:
          payload.message ??
          "SVJ Plus activated for 2 months. Locked to your account — single use.",
        plusExpiresAt: payload.plusExpiresAt ?? null,
      };
    }
    return { ok: false, message: payload.message ?? genericMessage };
  });
