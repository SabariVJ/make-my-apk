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
import {
  selectPersonalizedChallenges,
  getChallengeInsights,
} from "./challenge-engine";

/**
 * Server function: reads the user's personalization + stats and returns
 * personalized challenges. Falls back to default selection for users
 * without assessment data.
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabaseAdmin as any;

      // Read personalization
      const { data: persData } = await client
        .from("user_personalization")
        .select("goals, assessment_completed")
        .eq("user_id", context.userId)
        .maybeSingle();

      // Read stats
      const { data: statsData } = await client
        .from("user_stats")
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle();

      const goals: string[] = persData?.goals ?? [];
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

      const selected = selectPersonalizedChallenges(stats, goals, [], 6);
      const insights = getChallengeInsights(stats, goals);

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

      return {
        challenges: selected.map((t, i) => ({
          id: `personalized-${context.userId.slice(0, 8)}-${Date.now()}-${i}`,
          title: t.title,
          description: t.description,
          category: t.category,
          difficulty: t.difficulty,
          xp: xpMap[t.difficulty],
          durationMinutes: durMap[t.difficulty],
        })),
        focusAreas: insights.focusAreas,
        reason: insights.reason,
      };
    },
  );
