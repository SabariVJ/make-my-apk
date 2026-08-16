// ============================================================================
// 60-Day Challenge — program content.
//
// This file is shared by:
//   * the client view (src/app/views/SixtyDayChallengeView.tsx), and
//   * the server functions (src/lib/challenge.functions.ts), which validate
//     task lists / day counts against THESE definitions — the client can
//     never submit days or tasks that don't exist here.
//
// Day N unlocks 24h × (N-1) after the server-recorded start time; content in
// this file is static by design (the DB only stores progress, not content).
// ============================================================================

export type ChallengeFocus = "Physical" | "Discipline" | "Mental" | "Nutrition" | "Mindset";

export interface ChallengeDayDef {
  day: number;
  title: string; // e.g. "Ignition · Day 1 · Base Build"
  focus: ChallengeFocus;
  xp: number;
  tasks: string[];
  checkin: string; // daily reflection prompt required before the day can complete
}

export const TOTAL_DAYS = 60;
export const DAY_MS = 24 * 60 * 60 * 1000;

const FOCUS_CYCLE: ChallengeFocus[] = ["Physical", "Discipline", "Mental", "Nutrition", "Mindset"];

interface DaySeed {
  n: number;
  title: string;
  tasks: string[];
}

const PHASES: { name: string; xp: number; checkin: string; days: DaySeed[] }[] = [
  {
    name: "Ignition",
    xp: 100,
    checkin: "What was the hardest part of today, and what did you actually do about it?",
    days: [
      {
        n: 1,
        title: "Base Build",
        tasks: [
          "45 min strength session",
          "20 min conditioning finisher",
          "10 min mobility cooldown",
          "Log your session in SVJ",
        ],
      },
      {
        n: 2,
        title: "Wake Protocol",
        tasks: [
          "No phone for the first 30 min awake",
          "10 min sunlight or outdoor walk",
          "Make your bed",
          "2L of water before noon",
        ],
      },
      {
        n: 3,
        title: "Breath & Focus",
        tasks: [
          "10 min box breathing",
          "60 min single deep-work block",
          "Write 3 priorities for the day",
          "No social media until priority #1 is done",
        ],
      },
      {
        n: 4,
        title: "Fuel Reset",
        tasks: [
          "No sugar before 12pm",
          "Protein at every meal",
          "Cook one meal from scratch",
          "Track every calorie you eat",
        ],
      },
      {
        n: 5,
        title: "Iron Basics",
        tasks: [
          "30 min full-body strength",
          "100 push-ups in any sets",
          "5 min plank total",
          "10 min stretch",
        ],
      },
      {
        n: 6,
        title: "Unbroken Day",
        tasks: [
          "No skipped planned task",
          "Screen time under 4 hours",
          "60 second cold shower",
          "Journal tonight before bed",
        ],
      },
      {
        n: 7,
        title: "Reading Hour",
        tasks: [
          "Read 30 pages",
          "Summarize what you read in 5 bullets",
          "30 min focus session",
          "Evening brain dump",
        ],
      },
      {
        n: 8,
        title: "Hydration & Sleep",
        tasks: ["3L of water", "No caffeine after 2pm", "In bed by 11pm", "7.5h+ of sleep target"],
      },
      {
        n: 9,
        title: "Move Daily",
        tasks: ["10k steps", "20 min zone 2 cardio", "10 min mobility", "Walk after dinner"],
      },
      {
        n: 10,
        title: "First Summit",
        tasks: [
          "Review your week in writing",
          "Set one audacious 30-day goal",
          "Send one encouraging message",
          "Plan tomorrow tonight",
        ],
      },
    ],
  },
  {
    name: "Compound",
    xp: 125,
    checkin: "Rate your energy today 1–10. What moved it — and what would move it more?",
    days: [
      {
        n: 11,
        title: "Heavy Foundation",
        tasks: [
          "45 min squat + hinge base session",
          "Farmers carry 3×40m",
          "10 min core circuit",
          "Log your lifts with PRs",
        ],
      },
      {
        n: 12,
        title: "Sprint Day",
        tasks: [
          "6×40m sprints",
          "10 min jump rope",
          "10 min cooldown stretch",
          "No screens for 1h after dinner",
        ],
      },
      {
        n: 13,
        title: "Deep Work",
        tasks: [
          "2×90 min focus blocks",
          "Phone in another room",
          "Tackle the hardest task first",
          "Night reflection in journal",
        ],
      },
      {
        n: 14,
        title: "Protein Baseline",
        tasks: [
          "160g+ of protein",
          "Meal-prep tomorrow's lunch",
          "No fried food today",
          "3L of water",
        ],
      },
      {
        n: 15,
        title: "Loaded Carry",
        tasks: [
          "Heavy carry session 30 min",
          "20 min ruck or incline walk",
          "10 min grip work",
          "10 min mobility",
        ],
      },
      {
        n: 16,
        title: "Night Discipline",
        tasks: [
          "Sleep by 10:30pm",
          "No screens after 10pm",
          "Plan tomorrow's morning routine",
          "Journal 3 wins",
        ],
      },
      {
        n: 17,
        title: "Zone 2 Engine",
        tasks: ["45 min zone 2 cardio", "10 min mobility", "Read 20 pages", "Phone-free lunch"],
      },
      {
        n: 18,
        title: "Mind Sweep",
        tasks: [
          "Write out every open loop",
          "Do one dreaded task",
          "15 min meditation",
          "Plan tomorrow",
        ],
      },
      {
        n: 19,
        title: "Grip & Grind",
        tasks: [
          "Dead hangs 5×30s",
          "Kettlebell or dumbbell session 30 min",
          "20 min conditioning",
          "10 min cooldown",
        ],
      },
      {
        n: 20,
        title: "Ten-Day Review",
        tasks: [
          "Review all 10 days in writing",
          "Recompute your 30-day goal",
          "Active recovery only",
          "Plan the next 10 days",
        ],
      },
    ],
  },
  {
    name: "Overload",
    xp: 150,
    checkin: "What did you prove to yourself today that you doubted yesterday?",
    days: [
      {
        n: 21,
        title: "Threshold",
        tasks: [
          "5×800m or 5×3 min threshold intervals",
          "10 min cooldown",
          "3 rounds of breathwork",
          "Log your effort",
        ],
      },
      {
        n: 22,
        title: "Volume Spike",
        tasks: [
          "High-volume push session",
          "100 pull-ups in any sets",
          "20 min finisher",
          "Full-body stretch session",
        ],
      },
      {
        n: 23,
        title: "Calorie Audit",
        tasks: [
          "Track every bite",
          "Cut 200 kcal from baseline",
          "No liquid calories",
          "Protein first at every meal",
        ],
      },
      {
        n: 24,
        title: "Silence Hour",
        tasks: ["60 min phone-free", "20 min meditation", "Write 1 page longhand", "No news today"],
      },
      {
        n: 25,
        title: "Iron Marathon",
        tasks: [
          "90 min strength session",
          "30 min zone 2 cardio",
          "15 min mobility",
          "Eat within 30 min of finishing",
        ],
      },
      {
        n: 26,
        title: "Explosive Day",
        tasks: [
          "45 min power technique work",
          "15 min plyometrics",
          "8×30m sprints",
          "Cold or contrast therapy",
        ],
      },
      {
        n: 27,
        title: "Sleep Depth",
        tasks: [
          "8h+ of sleep",
          "Blackout the room",
          "No caffeine after 12pm",
          "45 min wind-down routine",
        ],
      },
      {
        n: 28,
        title: "Read & Apply",
        tasks: [
          "Read 40 pages",
          "Apply 1 idea from the book today",
          "Teach the idea to someone",
          "Journal the result",
        ],
      },
      {
        n: 29,
        title: "Density Block",
        tasks: [
          "3×30 min AMRAP blocks",
          "Log every round",
          "Rest 10 min between blocks",
          "3.5L of water",
        ],
      },
      {
        n: 30,
        title: "Thirty Stretch",
        tasks: [
          "30 min full mobility session",
          "Review the month in writing",
          "Name 1 weakness to attack next",
          "Plan a rest day",
        ],
      },
    ],
  },
  {
    name: "Mastery",
    xp: 175,
    checkin: "What skill improved most today, and what exact cue or habit caused it?",
    days: [
      {
        n: 31,
        title: "Skill Day",
        tasks: [
          "45 min intent practice on one lift",
          "Film and review 3 sets",
          "20 min skill drilling",
          "Journal the cue that clicked",
        ],
      },
      {
        n: 32,
        title: "Pacing Trial",
        tasks: [
          "5k or 30 min steady run",
          "Negative splits",
          "10 min cooldown",
          "Evening reflection",
        ],
      },
      {
        n: 33,
        title: "Macro Precision",
        tasks: [
          "Hit exact macros for the day",
          "Prep all meals ahead",
          "No restaurants",
          "Track sleep vs. recovery",
        ],
      },
      {
        n: 34,
        title: "Mind Palace",
        tasks: [
          "20 min focus drill",
          "3h of deep work",
          "Zero multitasking",
          "Write tomorrow's map",
        ],
      },
      {
        n: 35,
        title: "Grit Circuit",
        tasks: [
          "20 min hard circuit",
          "20 min zone 2 cardio",
          "10 min core",
          "90 second cold shower",
        ],
      },
      {
        n: 36,
        title: "Fasting Window",
        tasks: ["14h overnight fast", "High-protein first meal", "No snacking", "3L of water"],
      },
      {
        n: 37,
        title: "Compound King",
        tasks: [
          "Squat / deadlift / bench focus session",
          "5×3 heavy singles",
          "20 min back work",
          "15 min mobility",
        ],
      },
      {
        n: 38,
        title: "Journal Depth",
        tasks: [
          "Write 2 pages",
          "Review every past reflection",
          "Define 1 core standard",
          "Plan the week",
        ],
      },
      {
        n: 39,
        title: "Recovery Ice",
        tasks: [
          "3 min ice bath or cold shower",
          "20 min foam rolling",
          "9h sleep target",
          "Zero training today",
        ],
      },
      {
        n: 40,
        title: "Forty Fortress",
        tasks: [
          "Review all 40 days in writing",
          "Audit habits vs. streak",
          "Write the final 20-day war plan",
          "Rest tonight",
        ],
      },
    ],
  },
  {
    name: "War",
    xp: 200,
    checkin: "Describe the exact moment you wanted to quit today — and why you didn't.",
    days: [
      {
        n: 41,
        title: "Heavy Singles",
        tasks: ["5×1 heavy singles", "15 min finisher", "10 min cooldown", "Log every set"],
      },
      {
        n: 42,
        title: "Oxygen Debt",
        tasks: [
          "10×1 min hard intervals",
          "10 min jog recovery",
          "10 min breathing drill",
          "Hydrate aggressively",
        ],
      },
      {
        n: 43,
        title: "Clean Kitchen",
        tasks: ["Zero junk food", "Every meal home-cooked", "170g+ protein", "No sugar"],
      },
      {
        n: 44,
        title: "Iron Focus",
        tasks: [
          "90 min strength session",
          "No phone during the session",
          "30 min zone 2",
          "Journal effort vs. output",
        ],
      },
      {
        n: 45,
        title: "Grind Hour",
        tasks: [
          "60 min of your hardest work",
          "No breaks allowed",
          "Cold shower",
          "Write what it felt like",
        ],
      },
      {
        n: 46,
        title: "Low-Carb Day",
        tasks: [
          "Under 100g carbs",
          "Fat and protein focus",
          "3L water + electrolytes",
          "Light cardio only",
        ],
      },
      {
        n: 47,
        title: "Power Clean Day",
        tasks: ["45 min power movements", "10 hill sprints", "15 min plyometrics", "Full stretch"],
      },
      {
        n: 48,
        title: "Silence Protocol",
        tasks: [
          "60 min total phone time",
          "30 min meditation",
          "Write 1 page",
          "Slow speech, full eye contact",
        ],
      },
      {
        n: 49,
        title: "Marathon Prep",
        tasks: ["60 min long cardio", "Test your fuel plan", "20 min mobility", "Sleep by 10pm"],
      },
      {
        n: 50,
        title: "Fifty Fortress",
        tasks: [
          "Review all 50 days in writing",
          "Confirm the final 10-day assault",
          "Write your finish line",
          "Visualize Day 60",
        ],
      },
    ],
  },
  {
    name: "Ascension",
    xp: 225,
    checkin: "Write one line to your 60-day-finisher self. What did you become?",
    days: [
      {
        n: 51,
        title: "Peak Week",
        tasks: ["Peak strength session", "Light conditioning", "Full mobility", "Early sleep"],
      },
      {
        n: 52,
        title: "Final Push",
        tasks: [
          "2×90 min deep work",
          "Zero distractions",
          "High-protein day",
          "Evening reflection",
        ],
      },
      {
        n: 53,
        title: "Iron Ritual",
        tasks: [
          "60 min signature session",
          "20 min finisher",
          "2 min cold shower",
          "Journal the ritual",
        ],
      },
      {
        n: 54,
        title: "Deep Water",
        tasks: ["75 min long zone 2", "15 min breathwork", "15 min heat exposure", "4L of water"],
      },
      {
        n: 55,
        title: "Summit Sprint",
        tasks: [
          "Final threshold intervals",
          "8×40m sprints",
          "10 min cooldown",
          "Visualize Day 60",
        ],
      },
      {
        n: 56,
        title: "Total Reset",
        tasks: [
          "9h of sleep",
          "No screens after 8pm",
          "60 min nature walk",
          "Write a gratitude list",
        ],
      },
      {
        n: 57,
        title: "Warrior Day",
        tasks: [
          "Full-body warrior session",
          "Carry + core circuit",
          "Cold exposure",
          "Write your war cry",
        ],
      },
      {
        n: 58,
        title: "Legend Journal",
        tasks: [
          "Write your 60-day story",
          "Letter to your future self",
          "Thank your past self",
          "Read your oldest reflections",
        ],
      },
      {
        n: 59,
        title: "Final Countdown",
        tasks: [
          "Light training only",
          "Clean meal prep",
          "Sleep by 9:30pm",
          "Plan your Day 60 ritual",
        ],
      },
      {
        n: 60,
        title: "60/60 Champion",
        tasks: [
          "60 min victory session",
          "Full mobility",
          "Write your finisher reflection",
          "Claim your redeem code",
        ],
      },
    ],
  },
];

export const CHALLENGE_DAYS: ChallengeDayDef[] = PHASES.flatMap((phase) =>
  phase.days.map((seed) => ({
    day: seed.n,
    title: `${phase.name} · Day ${seed.n} · ${seed.title}`,
    focus: FOCUS_CYCLE[(seed.n - 1) % FOCUS_CYCLE.length],
    xp: phase.xp,
    tasks: seed.tasks,
    checkin: phase.checkin,
  })),
);

export function getDayDef(day: number): ChallengeDayDef | undefined {
  return CHALLENGE_DAYS.find((d) => d.day === day);
}
