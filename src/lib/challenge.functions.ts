// ============================================================================
// 60-Day Challenge — server-side functions.
//
// SECURITY MODEL
//   * Every write goes through these TanStack Start server functions, which
//     run behind requireSupabaseAuth and use the service_role admin client.
//   * The challenge tables (challenge_enrollments, challenge_day_progress,
//     redeem_codes) have RLS enabled with zero policies and no authenticated
//     grants, so direct client writes are impossible at the database level.
//   * "now" always comes from the DATABASE clock (public.db_now()), never the
//     device clock. Day N unlocks at anchor + (N - 1) * 24h where anchor is the
//     server-recorded start time.
//   * The completion path is verified server-side in strictly sequential order
//     and the redeem code is generated here, never on the client.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHALLENGE_DAYS, TOTAL_DAYS, DAY_MS, getDayDef } from "./challengeDays";

const FOUNDER_EMAIL = "sabarivj777@gmail.com";

// No 0/O/1/I/L — avoids visually ambiguous characters in the code.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PLUS_MONTHS = 2;

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
  { ok: true; message: string; plusExpiresAt: string } | { ok: false; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

interface EnrollmentRow {
  id: string;
  user_id: string;
  status: string;
  started_at: string;
  paused_at: string | null;
  completed_at: string | null;
  code_granted: boolean;
  current_streak: number;
  best_streak: number;
}

interface ProgressRow {
  id: string;
  enrollment_id: string;
  day_number: number;
  status: string;
  completed_at: string | null;
  checkin_duration_minutes: number | null;
  checkin_reflection: string | null;
}

interface RedeemCodeRow {
  id: string;
  code: string;
  user_id: string;
  redeemed: boolean;
  redeemed_at: string | null;
}

// ── Database helpers ─────────────────────────────────────────────────────────

async function getDbNow(admin: Admin): Promise<Date> {
  const { data, error } = await admin.rpc("db_now");
  if (error || !data) {
    console.error("[SVJ][60Day] db_now failed:", error);
    throw new Error("Could not read the server clock. Please retry.");
  }
  return new Date(data as string);
}

async function getEnrollment(admin: Admin, userId: string): Promise<EnrollmentRow | null> {
  const { data, error } = await admin
    .from("challenge_enrollments")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as EnrollmentRow | null) ?? null;
}

async function getProgress(admin: Admin, enrollmentId: string): Promise<ProgressRow[]> {
  const { data, error } = await admin
    .from("challenge_day_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .order("day_number", { ascending: true });
  if (error) throw error;
  return (data as ProgressRow[] | null) ?? [];
}

async function getRedeemCode(admin: Admin, userId: string): Promise<RedeemCodeRow | null> {
  const { data, error } = await admin
    .from("redeem_codes")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as RedeemCodeRow | null) ?? null;
}

// ── State computation (pure) ─────────────────────────────────────────────────

interface ComputedRun {
  completedSet: Set<number>;
  daysCompleted: number;
  nextDay: number; // 1..60, or 61 when finished
  unlockAtMs: number | null;
  isMissed: boolean; // nextDay's window elapsed while active
  effectiveStatus: ChallengeRunStatus;
}

function computeRun(
  enrollment: EnrollmentRow | null,
  progress: ProgressRow[],
  nowMs: number,
): ComputedRun {
  if (!enrollment) {
    return {
      completedSet: new Set(),
      daysCompleted: 0,
      nextDay: 1,
      unlockAtMs: null,
      isMissed: false,
      effectiveStatus: "not_started",
    };
  }

  const completedSet = new Set<number>();
  for (const row of progress) if (row.status === "completed") completedSet.add(row.day_number);

  const daysCompleted = completedSet.size;
  const nextDay = daysCompleted + 1;

  if (nextDay > TOTAL_DAYS) {
    return {
      completedSet,
      daysCompleted,
      nextDay,
      unlockAtMs: null,
      isMissed: false,
      effectiveStatus: "completed",
    };
  }

  const anchorMs = new Date(enrollment.started_at).getTime();
  const unlockAtMs = anchorMs + (nextDay - 1) * DAY_MS;
  const windowElapsed = nowMs > unlockAtMs + DAY_MS;

  if (enrollment.status === "paused" || windowElapsed) {
    return {
      completedSet,
      daysCompleted,
      nextDay,
      unlockAtMs,
      isMissed: true,
      effectiveStatus: "paused",
    };
  }

  return {
    completedSet,
    daysCompleted,
    nextDay,
    unlockAtMs,
    isMissed: false,
    effectiveStatus: "active",
  };
}

function buildState(
  enrollment: EnrollmentRow | null,
  progress: ProgressRow[],
  now: Date,
  code: RedeemCodeRow | null,
  debugIsAdmin: boolean,
): ChallengeState {
  const nowMs = now.getTime();
  const run = computeRun(enrollment, progress, nowMs);

  const days: ChallengeDayState[] = [];
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    let status: ChallengeDayStatus = "locked";
    if (run.completedSet.has(d)) {
      status = "completed";
    } else if (d === run.nextDay && run.effectiveStatus === "paused") {
      status = "missed";
    } else if (d === run.nextDay) {
      status = "current"; // active: waiting for unlock (details hidden until unlocked) or unlocked now
    }
    const done = progress.find((p) => p.day_number === d && p.status === "completed");
    days.push(
      status === "completed"
        ? { day: d, status, completedAt: done?.completed_at ?? undefined }
        : { day: d, status },
    );
  }

  return {
    status: run.effectiveStatus,
    startedAt: enrollment ? enrollment.started_at : null,
    pausedAt: enrollment?.paused_at ?? null,
    completedAt: enrollment?.completed_at ?? null,
    currentDay: run.nextDay,
    daysCompleted: run.daysCompleted,
    currentStreak: enrollment?.current_streak ?? 0,
    bestStreak: enrollment?.best_streak ?? 0,
    currentUnlockAt: run.unlockAtMs ? new Date(run.unlockAtMs).toISOString() : null,
    currentUnlocked:
      run.effectiveStatus === "active" && run.unlockAtMs !== null && nowMs >= run.unlockAtMs,
    days,
    serverNow: now.toISOString(),
    code: code?.code ?? null,
    codeRedeemed: code?.redeemed ?? false,
    debugIsAdmin,
    lastGrantedXp: 0,
  };
}

async function loadState(admin: Admin, userId: string, now: Date): Promise<ChallengeState> {
  const enrollment = await getEnrollment(admin, userId);
  const progress = enrollment ? await getProgress(admin, enrollment.id) : [];
  const code = await getRedeemCode(admin, userId);
  return buildState(enrollment, progress, now, code, false);
}

// ── Verification + code generation (the real, non-mock paths) ───────────────

/**
 * REAL completion verification. Returns true only when every day 1..60 has a
 * completed row and the rows are exactly sequential (no gaps, no skips).
 * Used by completeChallengeDay's final step AND by the founder debug action —
 * there is no separate mock path.
 */
async function verifyCompletion(
  admin: Admin,
  userId: string,
  enrollment: EnrollmentRow,
  progress: ProgressRow[],
  now: Date,
): Promise<boolean> {
  const completed = new Set(
    progress.filter((p) => p.status === "completed").map((p) => p.day_number),
  );
  if (completed.size !== TOTAL_DAYS) return false;
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    if (!completed.has(d)) return false;
  }
  return true;
}

function randomSegment(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function generateCodeString(): string {
  return `SVJ-${randomSegment(4)}-${randomSegment(4)}`;
}

/**
 * REAL code generation. Generates one unique SVJ-XXXX-XXXX code per finisher,
 * server-side only, stored in redeem_codes. Idempotent: a finisher who already
 * has a code gets the same one back.
 */
async function grantCompletionCode(
  admin: Admin,
  userId: string,
  enrollmentId: string,
  now: Date,
): Promise<string> {
  const existing = await getRedeemCode(admin, userId);
  if (existing) {
    // Ensure the enrollment flag matches (defensive; keeps idempotency).
    if (!existing.redeemed) {
      await admin
        .from("challenge_enrollments")
        .update({ code_granted: true })
        .eq("id", enrollmentId);
    }
    return existing.code;
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCodeString();
    const { error } = await admin.from("redeem_codes").insert({
      code,
      user_id: userId,
      redeemed: false,
    });
    if (!error) {
      await admin
        .from("challenge_enrollments")
        .update({ code_granted: true })
        .eq("id", enrollmentId);
      return code;
    }
    // Unique collision — retry with a fresh code.
    if (
      String(error?.message ?? "")
        .toLowerCase()
        .includes("duplicate")
    )
      continue;
    throw error;
  }
  throw new Error("Could not generate a unique redeem code. Please retry.");
}

// ── Public server functions ──────────────────────────────────────────────────

/** Read-only state for the current user (also lazily persists a missed-day pause). */
export const getChallengeState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;
    const now = await getDbNow(admin);
    const email = ((context.claims["email"] as string | undefined) ?? "").toLowerCase();

    // Lazily persist a missed day: window elapsed without completion -> paused.
    const enrollment = await getEnrollment(admin, context.userId);
    if (enrollment) {
      const progress = await getProgress(admin, enrollment.id);
      const run = computeRun(enrollment, progress, now.getTime());
      if (run.effectiveStatus === "paused" && enrollment.status !== "paused") {
        await admin
          .from("challenge_enrollments")
          .update({ status: "paused", paused_at: now.toISOString() })
          .eq("id", enrollment.id);
        enrollment.status = "paused";
        enrollment.paused_at = now.toISOString();
      }
    }

    const state = await loadState(admin, context.userId, now);
    return { ...state, debugIsAdmin: email === FOUNDER_EMAIL };
  });

/** Start the 60-day program (server records the start time / unlock clock). */
export const startChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;
    const now = await getDbNow(admin);

    const existing = await getEnrollment(admin, context.userId);
    if (!existing) {
      const { error } = await admin.from("challenge_enrollments").insert({
        user_id: context.userId,
        status: "active",
        started_at: now.toISOString(),
      });
      if (error) throw error;
    }

    return loadState(admin, context.userId, now);
  });

/**
 * Complete the current day. Server-side validation only:
 *  - auth + enrollment + not paused/completed
 *  - strictly sequential (day must be daysCompleted + 1)
 *  - unlock time from the DB clock (anchor + (day-1)*24h)
 *  - ALL of the day's tasks checked (validated against the shared program)
 *  - required check-in (duration + reflection)
 * Finishing day 60 triggers the real verification + code grant.
 */
export const completeChallengeDay = createServerFn({ method: "POST" })
  .validator((input: CompleteDayInput) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ChallengeState> => {
    const input = data as CompleteDayInput;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;
    const now = await getDbNow(admin);
    const nowMs = now.getTime();

    const enrollment = await getEnrollment(admin, context.userId);
    if (!enrollment) throw new Error("Start the 60-Day Challenge before completing days.");
    if (enrollment.status === "completed")
      throw new Error("The 60-Day Challenge is already complete.");

    const progress = await getProgress(admin, enrollment.id);
    const run = computeRun(enrollment, progress, nowMs);
    if (run.effectiveStatus === "paused") {
      throw new Error("This day was missed. Resume the challenge to continue.");
    }
    if (run.effectiveStatus === "completed") {
      throw new Error("The 60-Day Challenge is already complete.");
    }

    const day = run.nextDay;
    if (run.unlockAtMs === null || nowMs < run.unlockAtMs) {
      throw new Error(
        `Day ${day} is not unlocked yet. It unlocks ${run.unlockAtMs ? new Date(run.unlockAtMs).toISOString() : "later"}.`,
      );
    }

    const def = getDayDef(day);
    if (!def) throw new Error("Unknown day definition.");

    // Sequential + full task validation against the server-side program content.
    const taskIds = Array.isArray(input?.taskIds) ? input.taskIds : [];
    const required = new Set(def.tasks.map((_, i) => String(i)));
    const submitted = new Set(taskIds.map(String));
    const allTasksDone =
      required.size > 0 &&
      required.size === submitted.size &&
      [...required].every((t) => submitted.has(t));
    if (!allTasksDone) {
      throw new Error("Check off every task for this day before completing it.");
    }

    // Required daily check-in: duration (minutes) + reflection text.
    const durationMinutes = Math.round(Number(input?.durationMinutes) || 0);
    const reflection = typeof input?.reflection === "string" ? input.reflection.trim() : "";
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
      throw new Error("Add a valid check-in duration (1–600 minutes).");
    }
    if (reflection.length < 5) {
      throw new Error("Write a short check-in reflection before finishing the day.");
    }

    const isFinalDay = day === TOTAL_DAYS;

    // Exactly-once completion: ON CONFLICT DO NOTHING (ignoreDuplicates) means a
    // replayed/double-clicked completion of an already-stored day matches zero
    // rows, so `.select("id")` returns an entry ONLY when this call created the
    // day row for the first time. That single atomic statement is the guard that
    // makes the XP award below exactly-once even under concurrent requests.
    const { data: inserted, error: progressError } = await admin
      .from("challenge_day_progress")
      .upsert(
        {
          enrollment_id: enrollment.id,
          day_number: day,
          status: "completed",
          completed_at: now.toISOString(),
          checkin_duration_minutes: durationMinutes,
          checkin_reflection: reflection.slice(0, 2000),
          tasks_completed: JSON.stringify(def.tasks),
        },
        { onConflict: "enrollment_id,day_number", ignoreDuplicates: true },
      )
      .select("id");
    if (progressError) throw progressError;

    // XP is awarded only for a genuinely new completion, server-side, via the
    // atomic increment_total_xp RPC on the existing profiles.total_xp column.
    // Replays return lastGrantedXp = 0 so the client can never double-apply XP.
    const isNewCompletion = (inserted?.length ?? 0) > 0;
    let lastGrantedXp = 0;
    if (isNewCompletion) {
      const { error: xpError } = await admin.rpc("increment_total_xp", {
        target_user: context.userId,
        amount: def.xp,
      });
      if (xpError) throw xpError;
      lastGrantedXp = def.xp;
    }

    const nextStreak = Math.max(enrollment.current_streak, day);
    const update: Record<string, unknown> = {
      current_streak: nextStreak,
      best_streak: Math.max(enrollment.best_streak, nextStreak),
    };
    if (isFinalDay) {
      update.status = "completed";
      update.completed_at = now.toISOString();
    }
    const { error: enrollmentError } = await admin
      .from("challenge_enrollments")
      .update(update)
      .eq("id", enrollment.id);
    if (enrollmentError) throw enrollmentError;

    if (isFinalDay) {
      const fresh = await getEnrollment(admin, context.userId);
      const freshProgress = await getProgress(admin, enrollment.id);
      if (!fresh) throw new Error("Enrollment missing after completion.");
      const verified = await verifyCompletion(admin, context.userId, fresh, freshProgress, now);
      if (verified) {
        await grantCompletionCode(admin, context.userId, enrollment.id, now);
      }
    }

    const state = await loadState(admin, context.userId, now);
    return { ...state, lastGrantedXp };
  });

/** Resume after a missed day: re-anchor the unlock clock, keep streak + history. */
export const resumeChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;
    const now = await getDbNow(admin);
    const nowMs = now.getTime();

    const enrollment = await getEnrollment(admin, context.userId);
    if (!enrollment) throw new Error("Start the 60-Day Challenge before resuming.");
    if (enrollment.status === "completed") return loadState(admin, context.userId, now);

    const progress = await getProgress(admin, enrollment.id);
    const run = computeRun(enrollment, progress, nowMs);
    if (run.effectiveStatus !== "paused") {
      return loadState(admin, context.userId, now); // nothing to resume
    }

    // Re-anchor so the pending day unlocks immediately; streak/history preserved.
    const reAnchor = new Date(nowMs - (run.nextDay - 1) * DAY_MS).toISOString();
    const { error } = await admin
      .from("challenge_enrollments")
      .update({ status: "active", paused_at: null, started_at: reAnchor })
      .eq("id", enrollment.id);
    if (error) throw error;

    return loadState(admin, context.userId, now);
  });

/**
 * Redeem an earned SVJ-XXXX-XXXX code. Validates server-side:
 *  - code exists and is unredeemed
 *  - code belongs to the redeeming account (locked to the finisher, non-transferable)
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
    if (!raw) return { ok: false, message: "This code is invalid or has already been redeemed." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;
    const now = await getDbNow(admin);

    const { data: codeRow, error } = await admin
      .from("redeem_codes")
      .select("*")
      .eq("code", raw)
      .maybeSingle();
    if (error) throw error;

    const genericError: RedeemResult = {
      ok: false,
      message: "This code is invalid or has already been redeemed.",
    };
    if (!codeRow || codeRow.redeemed || codeRow.user_id !== context.userId) return genericError;

    // Atomic claim: only one redemption can flip redeemed=false -> true.
    // The `.eq("redeemed", false)` guard means a concurrent second attempt
    // matches zero rows — we verify the flip actually happened before granting.
    const { data: claimed, error: claimError } = await admin
      .from("redeem_codes")
      .update({ redeemed: true, redeemed_at: now.toISOString() })
      .eq("id", codeRow.id)
      .eq("redeemed", false)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return genericError; // lost the race — already redeemed elsewhere

    // Exactly 2 calendar months from the server-recorded redemption time.
    const expires = new Date(now.getTime());
    expires.setMonth(expires.getMonth() + PLUS_MONTHS);
    const expiresAt = expires.toISOString();
    const plusPatch = {
      is_plus_member: true,
      plus_unlocked_at: now.toISOString(),
      plus_expires_at: expiresAt,
    };

    const { error: profileError } = await admin
      .from("profiles")
      .update(plusPatch)
      .eq("id", context.userId);
    if (profileError) throw profileError;

    // Keep any sibling accounts (same email, other provider) in sync, like unlockPlus does.
    const email = ((context.claims["email"] as string | undefined) ?? "").toLowerCase();
    if (email) {
      await admin.from("profiles").update(plusPatch).ilike("email", email);
    }

    return {
      ok: true,
      message: "SVJ Plus activated for 2 months. Locked to your account — single use.",
      plusExpiresAt: expiresAt,
    };
  });

/**
 * ─── TEMPORARY DEBUG ACTION — REMOVE BEFORE PLAY STORE ───────────────────────
 * Founder-only (sabarivj777@gmail.com) test hook that exercises the REAL
 * completion-verification and code-generation paths end-to-end without waiting
 * 60 real days. It writes real rows to challenge_day_progress via the same
 * table/columns the normal flow uses, then calls the real verifyCompletion()
 * and grantCompletionCode() — there is no separate mock path.
 *
 * TO REMOVE: delete this export, its matching button in
 * src/app/views/SixtyDayChallengeView.tsx (search "DEBUG"), and nothing else —
 * the normal flow does not depend on it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const adminDebugCompleteChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeState> => {
    const email = ((context.claims["email"] as string | undefined) ?? "").toLowerCase();
    if (email !== FOUNDER_EMAIL) {
      throw new Error("This debug action is restricted to the app owner.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Admin;
    const now = await getDbNow(admin);
    const nowIso = now.toISOString();

    let enrollment = await getEnrollment(admin, context.userId);
    if (!enrollment) {
      const { data, error } = await admin
        .from("challenge_enrollments")
        .insert({ user_id: context.userId, status: "active", started_at: nowIso })
        .select("*")
        .single();
      if (error) throw error;
      enrollment = data as EnrollmentRow;
    }

    const progress = await getProgress(admin, enrollment.id);
    const existingDays = new Set(
      progress.filter((p) => p.status === "completed").map((p) => p.day_number),
    );

    const rows = CHALLENGE_DAYS.filter((d) => !existingDays.has(d.day)).map((d) => ({
      enrollment_id: enrollment!.id,
      day_number: d.day,
      status: "completed" as const,
      completed_at: new Date(now.getTime() - (TOTAL_DAYS - d.day) * DAY_MS).toISOString(),
      checkin_duration_minutes: 30,
      checkin_reflection: "[DEBUG] Auto-completed via founder test action.",
      tasks_completed: JSON.stringify(d.tasks),
    }));

    if (rows.length > 0) {
      const { error } = await admin.from("challenge_day_progress").insert(rows);
      if (error) throw error;
    }

    await admin
      .from("challenge_enrollments")
      .update({ status: "completed", completed_at: nowIso, paused_at: null })
      .eq("id", enrollment.id);

    const freshEnrollment = await getEnrollment(admin, context.userId);
    const freshProgress = await getProgress(admin, enrollment.id);
    if (!freshEnrollment) throw new Error("Enrollment missing after debug completion.");

    const verified = await verifyCompletion(
      admin,
      context.userId,
      freshEnrollment,
      freshProgress,
      now,
    );
    if (verified) {
      await grantCompletionCode(admin, context.userId, enrollment.id, now);
    }

    return loadState(admin, context.userId, now);
  });
