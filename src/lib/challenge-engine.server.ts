// ============================================================================
// Personalized Challenge Engine — server function.
//
// Separated from challenge-engine.ts to avoid pulling @tanstack/react-start
// into test bundles. Pure selection logic lives in challenge-engine.ts.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChallengeDifficulty } from "../app/types";
import type { UserStatsData } from "./personalization.functions";
import { selectPersonalizedChallenges, getChallengeInsights } from "./challenge-engine";

const REFRESH_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between refreshes

interface PersonalizedResult {
  challenges: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    xp: number;
    durationMinutes: number;
  }>;
  focusAreas: string[];
  reason: string;
}

/**
 * Read the authenticated user's personalization + stats. Gated on assessment
 * completion: users who have not completed the SVJ Assessment receive an
 * empty set with a clear unlock reason. The server is the authority — the
 * client never decides whether personalized tasks exist.
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
 * Build the final challenge array from selected templates.
 */
function buildChallenges(
  templates: ReturnType<typeof selectPersonalizedChallenges>,
  userId: string,
): PersonalizedResult["challenges"] {
  const xpMap: Record<ChallengeDifficulty, number> = {
    Easy: 50,
    Medium: 80,
    Hard: 120,
    Elite: 180,
  };
  const durMap: Record<ChallengeDifficulty, number> = {
    Easy: 10,
    Medium: 20,
    Hard: 30,
    Elite: 45,
  };

  return templates.map((t, i) => ({
    id: `personalized-${userId.slice(0, 8)}-${Date.now()}-${i}`,
    title: t.title,
    description: t.description,
    category: t.category,
    difficulty: t.difficulty,
    xp: xpMap[t.difficulty],
    durationMinutes: durMap[t.difficulty],
  }));
}

/**
 * Server function: returns personalized challenges for the authenticated user.
 *
 * Gated on assessment completion. Users who have not completed the SVJ
 * Assessment receive an empty challenge set with an unlock reason — the
 * server refuses to generate personalized tasks until the one-time assessment
 * is done.
 */
export const getPersonalizedChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      challenges: Array<{
        id: string;
        title: string;
        description: string;
        category: string;
        difficulty: string;
        xp: number;
        durationMinutes: number;
      }>;
      focusAreas: string[];
      reason: string;
    }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = context.supabase as any;

      const { assessmentCompleted, goals, stats } = await readPersonalization(
        client,
        context.userId,
      );

      // One-time assessment gate: no personalized tasks until the user has
      // completed the SVJ Assessment. The database column is the authority,
      // so logout/login, device change, and page refresh cannot bypass it.
      if (!assessmentCompleted) {
        return {
          challenges: [],
          focusAreas: [],
          reason: "Complete your SVJ Assessment to unlock personalized challenges.",
        };
      }

      const selected = selectPersonalizedChallenges(stats, goals, [], 6);
      const insights = getChallengeInsights(stats, goals);

      return {
        challenges: buildChallenges(selected, context.userId),
        focusAreas: insights.focusAreas,
        reason: insights.reason,
      };
    },
  );

/**
 * Server function: refresh the authenticated user's personalized task set.
 *
 * Protected by a server-enforced 30-minute cooldown. The cooldown is checked
 * against the database column `user_personalization.last_personalized_refresh_at`
 * so it cannot be bypassed by page reload, logout/login, client state changes,
 * or rapid clicking.
 *
 * This function does NOT award XP — generating tasks is not a reward event.
 * XP is only awarded when the user legitimately completes a task.
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
          error: "Complete your SVJ Assessment to unlock personalized challenges.",
        };
      }

      // Atomic cooldown reservation via RPC.
      // Requires migration 20260905_add_atomic_refresh_rpc; falls back to a
      // two-step approach (not atomic) when the RPC is not yet deployed, which
      // is safe until that migration is applied.
      let cooldownRemainingMs = 0;
      let reserved = false;

      const { data: reserveResult, error: reserveError } = await client.rpc(
        "svj_reserve_personalized_refresh",
      );

      if (reserveError) {
        const missingRpc =
          reserveError.code === "PGRST202" ||
          /svj_reserve_personalized_refresh|could not find the function/i.test(
            String(reserveError.message ?? ""),
          );
        if (!missingRpc) throw reserveError;

        // Fallback: two-step cooldown check (migration not applied yet).
        const { data: refreshRow } = await client
          .from("user_personalization")
          .select("last_personalized_refresh_at")
          .eq("user_id", context.userId)
          .maybeSingle();

        const lastRefresh = refreshRow?.last_personalized_refresh_at;
        const now = new Date();

        if (lastRefresh) {
          const elapsed = now.getTime() - new Date(lastRefresh).getTime();
          if (elapsed < REFRESH_COOLDOWN_MS) {
            cooldownRemainingMs = REFRESH_COOLDOWN_MS - elapsed;
            return {
              ok: false,
              cooldownRemainingMs,
              error: "Personalized tasks are on a cooldown. Try again later.",
            };
          }
        }

        await client
          .from("user_personalization")
          .update({ last_personalized_refresh_at: now.toISOString() })
          .eq("user_id", context.userId);
        reserved = true;
      } else if (!reserveResult?.ok) {
        cooldownRemainingMs = reserveResult.cooldownRemainingMs ?? 0;
        return {
          ok: false,
          cooldownRemainingMs,
          error: reserveResult.error ?? "Personalized tasks are on a cooldown. Try again later.",
        };
      } else {
        reserved = true;
      }

      // Generate a fresh, non-duplicate set. The selection function considers
      // the user's current stats and goals; newly generated IDs differ from any
      // previous set, and duplicate-title prevention happens at the challenge
      // merge layer in the client.
      const selected = selectPersonalizedChallenges(stats, goals, [], 6);
      const insights = getChallengeInsights(stats, goals);

      return {
        ok: true,
        cooldownRemainingMs: 0,
        challenges: buildChallenges(selected, context.userId),
        focusAreas: insights.focusAreas,
        reason: insights.reason,
      };
    },
  );
