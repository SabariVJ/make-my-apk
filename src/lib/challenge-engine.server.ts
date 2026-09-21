// ============================================================================
// Personalized Challenge Engine — server function.
//
// HOTFIX: personalized tasks are now first-class SERVER-BACKED assignments.
// Selection still runs here (stats/goals/focus reasoning preserved), but the
// chosen tasks are persisted via svj_get_or_create_my_personalized_tasks /
// svj_refresh_my_personalized_tasks, which assign STABLE database IDs
// (unique per user/day/template). The client never decides task identity,
// XP, or completion — see svj_complete_my_personalized_task.
//
// Pure selection logic lives in challenge-engine.ts.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChallengeDifficulty } from "../app/types";
import type { UserStatsData } from "./personalization.functions";
import {
  selectPersonalizedChallenges,
  getChallengeInsights,
  LOW_READINESS_SCORE,
} from "./challenge-engine";

interface PersonalizedResult {
  challenges: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    xp: number;
    durationMinutes: number;
    /** Server assignment status ('active' | 'completed' | ...). */
    status: string;
    /** Server completion state — the ONLY source the UI trusts. */
    completed: boolean;
    /** ISO timestamp of server completion, when it exists. */
    completedAt: string | null;
  }>;
  focusAreas: string[];
  reason: string;
  /** Set when low readiness softened today's difficulty; null otherwise. */
  readinessNote: string | null;
}

/**
 * Server refresh cooldown. Enforced AUTHORITATIVELY by the database via the
 * atomic svj_reserve_personalized_refresh / svj_refresh_my_personalized_tasks
 * RPCs (30-minute window); this mirror exists for the legacy two-step
 * fallback only and can never override the server's own decision.
 */
const REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

/** Server-stored XP per difficulty — mirrors the persisted assignment values. */
const XP_MAP: Record<ChallengeDifficulty, number> = {
  Easy: 50,
  Medium: 80,
  Hard: 120,
  Elite: 180,
};
const DURATION_MAP: Record<ChallengeDifficulty, number> = {
  Easy: 10,
  Medium: 20,
  Hard: 30,
  Elite: 45,
};

interface AssignmentRow {
  id: string;
  templateKey: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  xp: number;
  durationMinutes: number | null;
  status: string;
  completed: boolean;
  completedAt: string | null;
}

/**
 * Read the authenticated user's personalization + stats. Gated on assessment
 * completion: users who have not completed the SVJ Assessment receive an
 * empty set with a clear unlock reason.
 */
async function readPersonalization(
  client: Record<string, unknown>,
  userId: string,
): Promise<{
  assessmentCompleted: boolean;
  goals: string[];
  stats: UserStatsData | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseClient = client as any;
  const { data: persData } = await supabaseClient
    .from("user_personalization")
    .select("goals, assessment_completed")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: statsData } = await supabaseClient
    .from("user_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  let stats: UserStatsData | null = null;
  if (statsData) {
    stats = {
      fitness: statsData.fitness,
      discipline: statsData.discipline,
      focus: statsData.focus,
      confidence: statsData.confidence,
      social: statsData.social,
      nutrition: statsData.nutrition,
      recovery: statsData.recovery,
      consistency: statsData.consistency,
    };
  }

  return {
    assessmentCompleted: persData?.assessment_completed ?? false,
    goals: persData?.goals ?? [],
    stats,
  };
}

/**
 * The user's own latest readiness snapshot (RLS-scoped to their session).
 * Used to soften suggested difficulty on depleted days — never to award or
 * remove XP. Absent/unreadable readiness simply means "no adjustment".
 */
async function readReadiness(
  client: Record<string, unknown>,
  userId: string,
): Promise<{ score: number; isLow: boolean } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (client as any)
      .from("svj_readiness_daily")
      .select("score, readiness_date")
      .eq("user_id", userId)
      .order("readiness_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const score = Number(data?.score);
    if (!Number.isFinite(score)) return null;
    return { score, isLow: score < LOW_READINESS_SCORE };
  } catch {
    return null;
  }
}

/** Serialize a template into the server RPC payload (server → server only). */
function templatePayload(templates: ReturnType<typeof selectPersonalizedChallenges>) {
  return templates.map((t) => ({
    template_key: `${t.category}:${t.title}`.toLowerCase().replace(/\s+/g, "-"),
    title: t.title,
    description: t.description,
    category: t.category,
    difficulty: t.difficulty,
    xp: XP_MAP[t.difficulty],
    durationMinutes: DURATION_MAP[t.difficulty],
  }));
}

function toResult(assignments: AssignmentRow[]): PersonalizedResult["challenges"] {
  return assignments.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.category,
    difficulty: a.difficulty,
    xp: a.xp,
    durationMinutes: a.durationMinutes ?? DURATION_MAP[a.difficulty as ChallengeDifficulty] ?? 20,
    // Completion state MUST survive serialization — dropping it made the UI
    // re-render completed assignments as unchecked after every refetch.
    status: a.status,
    completed: a.completed,
    completedAt: a.completedAt,
  }));
}

const ASSESSMENT_REASON = "Complete your SVJ Assessment to unlock personalized challenges.";

/**
 * Server function: returns the user's persisted personalized assignments.
 *
 * First call of the day creates the assignment set server-side; every
 * subsequent call (refresh, logout/login, new device) returns THE SAME rows
 * and IDs. Completion state comes from the server.
 */
export const getPersonalizedChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PersonalizedResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = context.supabase as any;

    const { assessmentCompleted, goals, stats } = await readPersonalization(client, context.userId);

    if (!assessmentCompleted) {
      return { challenges: [], focusAreas: [], reason: ASSESSMENT_REASON, readinessNote: null };
    }

    // Low readiness softens the suggested difficulty (never XP authority).
    const readiness = await readReadiness(client, context.userId);
    const selected = selectPersonalizedChallenges(stats, goals, [], 6, readiness);
    const insights = getChallengeInsights(stats, goals);

    const { data, error } = await client.rpc("svj_get_or_create_my_personalized_tasks", {
      p_templates: templatePayload(selected),
    });
    if (error) throw error;

    const result = data as {
      assigned: boolean;
      reason?: string;
      assignments: AssignmentRow[];
    };

    return {
      challenges: toResult(result.assignments ?? []),
      focusAreas: insights.focusAreas,
      reason: result.assigned ? insights.reason : (result.reason ?? insights.reason),
      readinessNote: readiness?.isLow
        ? "Recovery is low — today's suggestions are capped at Medium difficulty."
        : null,
    };
  });

/**
 * Server function: refresh the personalized task set (30-minute cooldown,
 * enforced atomically in the database). Uncompleted assignments are marked
 * replaced; completed assignments are never silently undone. Refresh never
 * mints XP — only legitimate completion does.
 */
export const refreshPersonalizedChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      ok: boolean;
      cooldownRemainingMs: number;
      challenges?: PersonalizedResult["challenges"];
      focusAreas?: string[];
      reason?: string;
      readinessNote?: string | null;
      error?: string;
    }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = context.supabase as any;

      const { assessmentCompleted, goals, stats } = await readPersonalization(
        client,
        context.userId,
      );

      if (!assessmentCompleted) {
        return {
          ok: false,
          cooldownRemainingMs: 0,
          error: ASSESSMENT_REASON,
        };
      }

      const readiness = await readReadiness(client, context.userId);
      const selected = selectPersonalizedChallenges(stats, goals, [], 6, readiness);
      const insights = getChallengeInsights(stats, goals);

      // The RPC reserves the atomic cooldown AND swaps the set in one
      // server-authoritative step. If the RPC is not yet deployed we fall
      // back to the legacy two-step reservation so the UI stays functional.
      const { data, error } = await client.rpc("svj_refresh_my_personalized_tasks", {
        p_templates: templatePayload(selected),
      });

      if (error) {
        const missingRpc =
          error.code === "PGRST202" ||
          /svj_refresh_my_personalized_tasks|could not find the function/i.test(
            String(error.message ?? ""),
          );
        if (!missingRpc) throw error;

        const { data: reserveResult, error: reserveError } = await client.rpc(
          "svj_reserve_personalized_refresh",
        );
        if (reserveError) throw reserveError;
        if (!reserveResult?.ok) {
          return {
            ok: false,
            cooldownRemainingMs: reserveResult.cooldownRemainingMs ?? 0,
            error: reserveResult.error ?? "Personalized tasks are on a cooldown.",
          };
        }
        return {
          ok: true,
          cooldownRemainingMs: 0,
          challenges: toResult(
            // Legacy path without persistence: selection only.
            (selected as ReturnType<typeof selectPersonalizedChallenges>)
              .map((t) => ({
                id: `${t.category}:${t.title}`,
                title: t.title,
                description: t.description,
                category: t.category,
                difficulty: t.difficulty,
                xp: XP_MAP[t.difficulty],
                durationMinutes: DURATION_MAP[t.difficulty],
              }))
              .map((t) => ({
                ...t,
                status: "active",
                completed: false,
                completedAt: null,
                templateKey: t.id,
                description: t.description,
              })) as AssignmentRow[],
          ),
          focusAreas: insights.focusAreas,
          reason: insights.reason,
          readinessNote: readiness?.isLow
            ? "Recovery is low — today's suggestions are capped at Medium difficulty."
            : null,
        };
      }

      const result = data as {
        ok: boolean;
        cooldownRemainingMs: number;
        error?: string;
        assignments?: AssignmentRow[];
      };

      if (!result.ok) {
        return {
          ok: false,
          cooldownRemainingMs: result.cooldownRemainingMs ?? 0,
          error: result.error ?? "Personalized tasks are on a cooldown.",
        };
      }

      return {
        ok: true,
        cooldownRemainingMs: 0,
        challenges: toResult(result.assignments ?? []),
        focusAreas: insights.focusAreas,
        reason: insights.reason,
        readinessNote: readiness?.isLow
          ? "Recovery is low — today's suggestions are capped at Medium difficulty."
          : null,
      };
    },
  );

/**
 * Server function: complete a personalized assignment.
 *
 * Identity and validation live entirely in the database
 * (svj_complete_my_personalized_task): ownership via auth.uid(), active
 * status, currency, and idempotent exactly-once XP/stat rewards from the
 * SERVER-STORED xp_reward. The client sends only the assignment id.
 */
export const completePersonalizedTask = createServerFn({ method: "POST" })
  .validator((input: { assignmentId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      ok: boolean;
      alreadyCompleted?: boolean;
      xpAwarded?: number;
      statChanges?: Record<string, number>;
      error?: string;
    }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = context.supabase as any;

      // Only the assignment id leaves the client. XP, identity and status
      // transitions are decided exclusively inside the SECURITY DEFINER RPC.
      const { data: result, error } = await client.rpc("svj_complete_my_personalized_task", {
        p_assignment_id: data.assignmentId,
      });
      if (error) throw error;

      return {
        ok: result?.ok ?? false,
        alreadyCompleted: result?.alreadyCompleted ?? false,
        xpAwarded: result?.xpAwarded ?? 0,
        statChanges: result?.statChanges ?? {},
        error: result?.error,
      };
    },
  );
