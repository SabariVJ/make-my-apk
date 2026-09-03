// ============================================================================
// Personalized Challenge Engine — rule-based, no AI dependency.
//
// Selects daily challenges from user's stats, goals, and assessment data.
// Lower-scoring areas get more challenges and easier difficulty levels.
// Progressively increases difficulty as stats improve.
// ============================================================================

import type { ChallengeCategory, ChallengeDifficulty, DailyChallenge } from "../app/types";
import type { UserStatsData } from "./personalization.functions";

// ── Challenge templates by category and difficulty ────────────────────────

export interface ChallengeTemplate {
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  /** Stat keys this challenge primarily targets */
  targets: (keyof UserStatsData)[];
  /** Minimum stat value to show this challenge (0 = always) */
  minStat?: number;
  /** Maximum stat value to show this challenge (100 = always) */
  maxStat?: number;
}

const CHALLENGE_BANK: ChallengeTemplate[] = [
  // ── Physical ────────────────────────────────────────────────────────────
  {
    title: "10 Push-ups",
    description: "Complete 10 push-ups with proper form.",
    category: "Physical",
    difficulty: "Easy",
    targets: ["fitness", "discipline"],
    maxStat: 50,
  },
  {
    title: "20 Push-ups",
    description: "Complete 20 push-ups with controlled breathing.",
    category: "Physical",
    difficulty: "Medium",
    targets: ["fitness", "discipline"],
    minStat: 40,
    maxStat: 75,
  },
  {
    title: "50 Push-ups",
    description: "Complete 50 push-ups in sets. Maintain form throughout.",
    category: "Physical",
    difficulty: "Hard",
    targets: ["fitness", "discipline"],
    minStat: 65,
  },
  {
    title: "5-Minute Walk",
    description: "Take a brisk 5-minute walk outside. Focus on posture.",
    category: "Physical",
    difficulty: "Easy",
    targets: ["fitness", "recovery"],
    maxStat: 45,
  },
  {
    title: "15-Minute Walk",
    description: "Take a brisk 15-minute walk. Notice your surroundings.",
    category: "Physical",
    difficulty: "Medium",
    targets: ["fitness", "recovery", "consistency"],
    minStat: 35,
  },
  {
    title: "20-Minute Jog",
    description: "Jog for 20 minutes at a comfortable pace.",
    category: "Physical",
    difficulty: "Hard",
    targets: ["fitness", "discipline", "consistency"],
    minStat: 55,
  },
  {
    title: "10 Squats",
    description: "Complete 10 bodyweight squats with good depth.",
    category: "Physical",
    difficulty: "Easy",
    targets: ["fitness"],
    maxStat: 55,
  },
  {
    title: "25 Squats",
    description: "Complete 25 squats, pausing at the bottom for 2 seconds.",
    category: "Physical",
    difficulty: "Medium",
    targets: ["fitness", "discipline"],
    minStat: 45,
  },
  {
    title: "30 Burpees",
    description: "Complete 30 burpees. Modify if needed but keep moving.",
    category: "Physical",
    difficulty: "Elite",
    targets: ["fitness", "discipline", "consistency"],
    minStat: 70,
  },
  {
    title: "1-Minute Plank",
    description: "Hold a plank position for 60 seconds.",
    category: "Physical",
    difficulty: "Easy",
    targets: ["fitness", "discipline"],
    maxStat: 50,
  },
  {
    title: "2-Minute Plank",
    description: "Hold a plank for 2 minutes. Breathe steadily.",
    category: "Physical",
    difficulty: "Medium",
    targets: ["fitness", "discipline", "focus"],
    minStat: 45,
  },
  {
    title: "Stretch Routine",
    description: "10-minute full-body stretch focusing on tight areas.",
    category: "Physical",
    difficulty: "Easy",
    targets: ["recovery", "fitness"],
    maxStat: 60,
  },

  // ── Discipline ──────────────────────────────────────────────────────────
  {
    title: "Make Your Bed",
    description: "Make your bed immediately after waking up.",
    category: "Discipline",
    difficulty: "Easy",
    targets: ["discipline", "consistency"],
    maxStat: 50,
  },
  {
    title: "No Phone for 1 Hour",
    description: "Put your phone away for 1 full hour. No exceptions.",
    category: "Discipline",
    difficulty: "Medium",
    targets: ["focus", "discipline"],
    minStat: 35,
    maxStat: 75,
  },
  {
    title: "No Phone for 2 Hours",
    description: "Put your phone away for 2 hours. Focus on a task.",
    category: "Discipline",
    difficulty: "Hard",
    targets: ["focus", "discipline"],
    minStat: 60,
  },
  {
    title: "Plan Tomorrow Tonight",
    description: "Write down your top 3 priorities for tomorrow before sleeping.",
    category: "Discipline",
    difficulty: "Easy",
    targets: ["discipline", "focus"],
    maxStat: 55,
  },
  {
    title: "Complete 1 Scheduled Task",
    description: "Do one task you've been putting off. Start now.",
    category: "Discipline",
    difficulty: "Medium",
    targets: ["discipline", "confidence"],
    minStat: 35,
  },
  {
    title: "Complete 3 Scheduled Tasks",
    description: "Finish three tasks you had planned. Track completion.",
    category: "Discipline",
    difficulty: "Hard",
    targets: ["discipline", "consistency"],
    minStat: 55,
  },
  {
    title: "Wake Up at Target Time",
    description: "Set an alarm and get up at the planned time. No snooze.",
    category: "Discipline",
    difficulty: "Easy",
    targets: ["discipline", "consistency"],
    maxStat: 60,
  },
  {
    title: "Follow Your Routine",
    description: "Stick to your planned daily routine from start to finish.",
    category: "Discipline",
    difficulty: "Hard",
    targets: ["discipline", "consistency"],
    minStat: 50,
  },

  // ── Mental ──────────────────────────────────────────────────────────────
  {
    title: "5-Minute Meditation",
    description: "Sit quietly and focus on your breathing for 5 minutes.",
    category: "Mental",
    difficulty: "Easy",
    targets: ["focus", "recovery"],
    maxStat: 55,
  },
  {
    title: "10-Minute Meditation",
    description: "Meditate for 10 minutes. When thoughts come, let them pass.",
    category: "Mental",
    difficulty: "Medium",
    targets: ["focus", "recovery"],
    minStat: 40,
  },
  {
    title: "15-Minute Deep Work",
    description: "Work on one task with zero distractions for 15 minutes.",
    category: "Mental",
    difficulty: "Medium",
    targets: ["focus", "discipline"],
    minStat: 35,
    maxStat: 75,
  },
  {
    title: "30-Minute Deep Work",
    description: "Work with complete focus for 30 minutes. No phone, no tabs.",
    category: "Mental",
    difficulty: "Hard",
    targets: ["focus", "discipline"],
    minStat: 55,
  },
  {
    title: "Journal for 5 Minutes",
    description: "Write freely for 5 minutes. Capture your thoughts honestly.",
    category: "Mental",
    difficulty: "Easy",
    targets: ["confidence", "recovery"],
    maxStat: 60,
  },
  {
    title: "Gratitude List",
    description: "Write 3 things you are genuinely grateful for today.",
    category: "Mental",
    difficulty: "Easy",
    targets: ["confidence", "recovery"],
    maxStat: 65,
  },
  {
    title: "Cold Shower",
    description: "End your shower with 30 seconds of cold water.",
    category: "Mental",
    difficulty: "Medium",
    targets: ["discipline", "confidence"],
    minStat: 40,
    maxStat: 80,
  },
  {
    title: "1-Hour Study Session",
    description: "Study or learn something new for 1 full hour.",
    category: "Mental",
    difficulty: "Hard",
    targets: ["focus", "discipline"],
    minStat: 50,
  },

  // ── Mindset ─────────────────────────────────────────────────────────────
  {
    title: "Say Hello to Someone New",
    description: "Greet someone you don't normally talk to.",
    category: "Mindset",
    difficulty: "Easy",
    targets: ["social", "confidence"],
    maxStat: 55,
  },
  {
    title: "Start a Conversation",
    description: "Have a genuine 2-minute conversation with someone.",
    category: "Mindset",
    difficulty: "Medium",
    targets: ["social", "confidence"],
    minStat: 40,
    maxStat: 75,
  },
  {
    title: "Join a Group Activity",
    description: "Join a group conversation or activity. Listen and contribute.",
    category: "Mindset",
    difficulty: "Hard",
    targets: ["social", "confidence"],
    minStat: 55,
  },
  {
    title: "Give a Genuine Compliment",
    description: "Compliment someone sincerely on something specific.",
    category: "Mindset",
    difficulty: "Easy",
    targets: ["social", "confidence"],
    maxStat: 60,
  },
  {
    title: "Share an Idea Out Loud",
    description: "Voice an idea or opinion in a group setting.",
    category: "Mindset",
    difficulty: "Hard",
    targets: ["social", "confidence", "discipline"],
    minStat: 50,
  },
  {
    title: "Do Something Uncomfortable",
    description: "Choose one small thing outside your comfort zone and do it.",
    category: "Mindset",
    difficulty: "Medium",
    targets: ["confidence", "discipline"],
    minStat: 35,
  },
  {
    title: "Help Someone Today",
    description: "Offer genuine help to someone who needs it.",
    category: "Mindset",
    difficulty: "Easy",
    targets: ["social", "consistency"],
    maxStat: 70,
  },
  {
    title: "Positive Affirmation",
    description: "Look in the mirror and say 3 affirmations aloud.",
    category: "Mindset",
    difficulty: "Easy",
    targets: ["confidence"],
    maxStat: 50,
  },
  {
    title: "Face a Fear",
    description: "Identify one fear and take a small step toward overcoming it.",
    category: "Mindset",
    difficulty: "Elite",
    targets: ["confidence", "social"],
    minStat: 60,
  },

  // ── Nutrition ───────────────────────────────────────────────────────────
  {
    title: "Drink 8 Glasses of Water",
    description: "Track and drink at least 8 glasses of water today.",
    category: "Nutrition",
    difficulty: "Easy",
    targets: ["nutrition", "consistency"],
    maxStat: 55,
  },
  {
    title: "Eat a Balanced Breakfast",
    description: "Have a nutritious breakfast with protein and fiber.",
    category: "Nutrition",
    difficulty: "Easy",
    targets: ["nutrition"],
    maxStat: 50,
  },
  {
    title: "No Junk Food Today",
    description: "Avoid processed snacks and fast food for the full day.",
    category: "Nutrition",
    difficulty: "Medium",
    targets: ["nutrition", "discipline"],
    minStat: 35,
    maxStat: 75,
  },
  {
    title: "Cook a Healthy Meal",
    description: "Prepare a balanced meal from scratch. Include protein and vegetables.",
    category: "Nutrition",
    difficulty: "Medium",
    targets: ["nutrition", "discipline"],
    minStat: 40,
  },
  {
    title: "Track Your Meals",
    description: "Log everything you eat today. Be honest.",
    category: "Nutrition",
    difficulty: "Easy",
    targets: ["nutrition", "consistency"],
    maxStat: 60,
  },
  {
    title: "10,000 Steps",
    description: "Walk or move enough to reach 10,000 steps today.",
    category: "Nutrition",
    difficulty: "Hard",
    targets: ["fitness", "nutrition"],
    minStat: 50,
  },
  {
    title: "Protein at Every Meal",
    description: "Include a protein source in each meal today.",
    category: "Nutrition",
    difficulty: "Medium",
    targets: ["nutrition", "discipline"],
    minStat: 40,
  },
  {
    title: "Eat Mindfully",
    description: "Eat one meal without screens. Focus on taste and satiety.",
    category: "Nutrition",
    difficulty: "Easy",
    targets: ["nutrition", "focus"],
    maxStat: 65,
  },
];

// ── Engine logic ──────────────────────────────────────────────────────────

/** Map stat keys to challenge categories for priority weighting */
const STAT_TO_CATEGORY: Record<string, ChallengeCategory> = {
  fitness: "Physical",
  discipline: "Discipline",
  focus: "Mental",
  confidence: "Mindset",
  social: "Mindset",
  nutrition: "Nutrition",
  recovery: "Physical",
  consistency: "Discipline",
};

/** Goal IDs to stat keys for priority boosting */
const GOAL_TO_STATS: Record<string, string[]> = {
  build_muscle: ["fitness"],
  lose_fat: ["fitness", "nutrition"],
  improve_fitness: ["fitness"],
  become_disciplined: ["discipline", "consistency"],
  become_confident: ["confidence"],
  become_social: ["social", "confidence"],
  improve_focus: ["focus"],
  study_consistently: ["focus", "discipline"],
  reduce_procrastination: ["discipline", "focus"],
  improve_productivity: ["focus", "discipline"],
  improve_sleep: ["recovery"],
  build_better_habits: ["discipline", "consistency"],
  improve_nutrition: ["nutrition"],
  become_consistent: ["consistency"],
};

/**
 * Compute category priority weights based on user stats and goals.
 * Lower-scoring areas get higher weights. Goal-selected areas get a boost.
 */
function computeCategoryWeights(
  stats: UserStatsData | null,
  goals: string[],
): Record<ChallengeCategory, number> {
  const weights: Record<ChallengeCategory, number> = {
    Physical: 1,
    Discipline: 1,
    Mental: 1,
    Mindset: 1,
    Nutrition: 1,
  };

  if (!stats) return weights;

  // Weight by stat deficiency: lower stat = higher weight
  const statKeys: (keyof UserStatsData)[] = [
    "fitness",
    "discipline",
    "focus",
    "confidence",
    "social",
    "nutrition",
    "recovery",
    "consistency",
  ];

  for (const key of statKeys) {
    const val = stats[key] ?? 50;
    const deficiency = Math.max(0, 100 - val); // 0-100 scale, higher = more deficient
    const weight = 1 + (deficiency / 100) * 2; // range: 1.0 to 3.0
    const cat = STAT_TO_CATEGORY[key];
    if (cat) {
      weights[cat] = Math.max(weights[cat], weight);
    }
  }

  // Boost weights for goal-selected areas
  for (const goalId of goals) {
    const targetStats = GOAL_TO_STATS[goalId];
    if (targetStats) {
      for (const statKey of targetStats) {
        const cat = STAT_TO_CATEGORY[statKey as keyof typeof STAT_TO_CATEGORY];
        if (cat) {
          weights[cat] = Math.min(3.5, weights[cat] * 1.3);
        }
      }
    }
  }

  return weights;
}

/**
 * Determine appropriate difficulty range based on stat levels.
 * Returns [minDifficulty, maxDifficulty] as numeric indices.
 */
function difficultyRange(stats: UserStatsData | null): { min: number; max: number } {
  if (!stats) return { min: 0, max: 1 }; // Easy + Medium for new users

  const avgStat =
    (stats.fitness +
      stats.discipline +
      stats.focus +
      stats.confidence +
      stats.social +
      stats.nutrition +
      stats.recovery +
      stats.consistency) /
    8;

  if (avgStat < 30) return { min: 0, max: 0 }; // Easy only
  if (avgStat < 45) return { min: 0, max: 1 }; // Easy + Medium
  if (avgStat < 60) return { min: 0, max: 2 }; // Easy + Medium + Hard
  if (avgStat < 75) return { min: 1, max: 2 }; // Medium + Hard
  return { min: 1, max: 3 }; // Medium + Hard + Elite
}

const DIFFICULTY_INDEX: Record<ChallengeDifficulty, number> = {
  Easy: 0,
  Medium: 1,
  Hard: 2,
  Elite: 3,
};

/**
 * Select personalized daily challenges.
 *
 * @param stats - User's current 8-attribute stats (from assessment/server)
 * @param goals - User's selected goal IDs
 * @param completedToday - Titles of already-completed challenges today
 * @param count - Number of challenges to return (default 6)
 * @returns Array of selected challenge templates
 */
export function selectPersonalizedChallenges(
  stats: UserStatsData | null,
  goals: string[] = [],
  completedToday: string[] = [],
  count: number = 6,
): ChallengeTemplate[] {
  const weights = computeCategoryWeights(stats, goals);
  const diffRange = difficultyRange(stats);

  // Weighted random selection
  const available = CHALLENGE_BANK.filter((t) => {
    // Skip already completed
    if (completedToday.includes(t.title)) return false;

    // Check difficulty range
    const diffIdx = DIFFICULTY_INDEX[t.difficulty];
    if (diffIdx < diffRange.min || diffIdx > diffRange.max) return false;

    // Check stat bounds for the challenge
    if (stats && t.minStat !== undefined) {
      const relevantStats = t.targets.map((k) => stats[k] ?? 50);
      const avgRelevant = relevantStats.reduce((a, b) => a + b, 0) / relevantStats.length;
      if (avgRelevant < t.minStat) return false;
    }
    if (stats && t.maxStat !== undefined) {
      const relevantStats = t.targets.map((k) => stats[k] ?? 50);
      const avgRelevant = relevantStats.reduce((a, b) => a + b, 0) / relevantStats.length;
      if (avgRelevant > t.maxStat) return false;
    }

    return true;
  });

  if (available.length === 0) {
    // Fallback: return any easy challenges
    return CHALLENGE_BANK.filter((t) => t.difficulty === "Easy").slice(0, count);
  }

  // Weighted shuffle: categories with higher weight have more selection probability
  const scored = available.map((t) => {
    const catWeight = weights[t.category] ?? 1;
    const diffBonus =
      t.difficulty === "Easy"
        ? 0.8
        : t.difficulty === "Medium"
          ? 1.0
          : t.difficulty === "Hard"
            ? 1.1
            : 0.9;
    const score = catWeight * diffBonus * (0.8 + Math.random() * 0.4); // slight randomness
    return { template: t, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Ensure category diversity: pick at most 2 from same category
  const selected: ChallengeTemplate[] = [];
  const categoryCount: Record<string, number> = {};

  for (const { template } of scored) {
    if (selected.length >= count) break;
    const catCount = categoryCount[template.category] ?? 0;
    if (catCount >= 2 && count > 4) continue; // allow overflow for small counts
    selected.push(template);
    categoryCount[template.category] = catCount + 1;
  }

  // If we didn't fill enough, relax the constraint
  if (selected.length < count) {
    for (const { template } of scored) {
      if (selected.length >= count) break;
      if (!selected.includes(template)) {
        selected.push(template);
      }
    }
  }

  return selected.slice(0, count);
}

/**
 * Convert a ChallengeTemplate into a DailyChallenge with generated ID.
 */
export function templateToChallenge(template: ChallengeTemplate, idSuffix: string): DailyChallenge {
  const xpMap: Record<ChallengeDifficulty, number> = {
    Easy: 50,
    Medium: 80,
    Hard: 120,
    Elite: 180,
  };

  return {
    id: `personalized-${idSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: template.title,
    description: template.description,
    category: template.category,
    difficulty: template.difficulty,
    xp: xpMap[template.difficulty],
    durationMinutes:
      template.difficulty === "Easy"
        ? 10
        : template.difficulty === "Medium"
          ? 20
          : template.difficulty === "Hard"
            ? 30
            : 45,
    completed: false,
    isCustom: false,
  };
}

/**
 * Get a brief explanation of why the engine chose certain challenge categories.
 */
export function getChallengeInsights(
  stats: UserStatsData | null,
  goals: string[],
): { focusAreas: string[]; reason: string } {
  if (!stats) {
    return {
      focusAreas: ["Physical", "Discipline"],
      reason: "Complete your SVJ Assessment to unlock personalized challenges.",
    };
  }

  const statEntries: [string, number][] = [
    ["Fitness", stats.fitness],
    ["Discipline", stats.discipline],
    ["Focus", stats.focus],
    ["Confidence", stats.confidence],
    ["Social", stats.social],
    ["Nutrition", stats.nutrition],
    ["Recovery", stats.recovery],
    ["Consistency", stats.consistency],
  ];

  // Sort by score ascending (weakest first)
  statEntries.sort((a, b) => a[1] - b[1]);

  const weakest = statEntries.slice(0, 2).map(([name]) => name);
  const goalNames = goals.map((g) => g.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));

  const reasons: string[] = [];
  if (weakest.length > 0) {
    reasons.push(
      `${weakest.join(" and ")} ${weakest.length > 1 ? "are" : "is"} your current growth area${weakest.length > 1 ? "s" : ""}`,
    );
  }
  if (goalNames.length > 0) {
    reasons.push(`aligned with your goals: ${goalNames.slice(0, 3).join(", ")}`);
  }

  return {
    focusAreas: weakest,
    reason:
      reasons.length > 0 ? reasons.join(". ") + "." : "Balanced challenge mix across all areas.",
  };
}
