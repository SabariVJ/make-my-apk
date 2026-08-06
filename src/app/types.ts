export type TierLevel = 'Initiate' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Obsidian';

export interface TierInfo {
  name: TierLevel;
  minXP: number;
  color: string;
  badgeBg: string;
  icon: string;
  description: string;
  benefits: string[];
}

export type ChallengeCategory = 'Physical' | 'Discipline' | 'Mental' | 'Mindset' | 'Nutrition';
export type ChallengeDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Elite';

export interface DailyChallenge {
  id: string;
  title: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  xp: number;
  durationMinutes: number;
  description: string;
  completed: boolean;
  completedAt?: string;
  isCustom?: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  xpReward: number;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  isPremiumExclusive?: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  isPremium?: boolean;
  rarity?: string;
}

export interface RewardItem {
  id: string;
  title: string;
  category: 'Cosmetic' | 'Digital Asset' | 'Guide' | 'VIP Perk';
  xpCost: number;
  minTier: TierLevel;
  description: string;
  unlocked: boolean;
  image: string;
  isPremiumOnly?: boolean;
  code?: string;
  guideContent?: string;
  perkDetails?: string;
  cosmeticId?: string;
  actionLabel?: string;
}

export interface Comment {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  text: string;
  createdAt: string;
  tier: TierLevel;
}

export interface ReactionCount {
  fire: number;
  crown: number;
  hundred: number;
  bolt: number;
  wolf: number;
}

export type ReactionType = 'fire' | 'crown' | 'hundred' | 'bolt' | 'wolf';

export interface FeedActivity {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  userTier: TierLevel;
  isVerified?: boolean;
  isVIP?: boolean;
  actionType: 'completed_challenge' | 'unlocked_achievement' | 'reached_tier' | 'streak_milestone';
  title: string;
  details: string;
  xpEarned?: number;
  timestamp: string;
  reactions: ReactionCount;
  userReactions: Record<string, ReactionType>; // userId -> reaction
  comments: Comment[];
}

export interface UserStats {
  physical: number;
  social: number;
  discipline: number;
  mental: number;
  intellect: number;
  ambition: number;
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
  coverImage?: string;
  tier: TierLevel;
  totalXP: number;
  weeklyXP: number;
  monthlyXP: number;
  currentStreak: number;
  bestStreak: number;
  joinDate: string;
  daysActive: number;
  totalChallengesCompleted: number;
  bio: string;
  location?: string;
  email?: string;
  isFounder?: boolean;
  isOwner?: boolean;
  isPremium: boolean;
  verifiedIcon: boolean;
  vipIcon: boolean;
  equippedFrame?: string;
  equippedTheme?: string;
  equippedBadge?: string;
  memberId: string;

  // Dark Gamification System additions
  level: number;
  leagueRank: string;
  evolutionTheme: 'wolf' | 'anime' | 'fighter' | 'samurai' | 'cyber' | 'knight' | 'gladiator' | 'valkyrie';
  stats: UserStats;
  screenTimeHrs?: number;
  wastedHoursOnTrack?: number;
  assessmentCompleted?: boolean;
  
  // Stats breakdown
  habitCompletionRate: number; // e.g. 92%
  xpHistory: { date: string; xp: number }[]; // 30 day history
  weeklyHistory: { week: string; xp: number }[];
  
  achievements: Achievement[];
  badges: Badge[];
}

export interface LeaderboardEntry {
  rank: number;
  rankDelta: number; // e.g. +12, -3, 0
  id: string;
  username: string;
  avatar: string;
  tier: TierLevel;
  totalXP: number;
  weeklyXP: number;
  monthlyXP: number;
  streak: number;
  country: string;
  isVerified?: boolean;
  isVIP?: boolean;
  isFounder?: boolean;
  isOwner?: boolean;
  equippedFrame?: string;
  bio?: string;
  joinDate?: string;
}

export interface ExerciseSet {
  reps: number;
  weight: number;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
}

export interface WorkoutEntry {
  id: string;
  name: string;
  date: string; // ISO string
  exercises: WorkoutExercise[];
  totalVolume: number;
  xpEarned: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
  createdAt: string;
}
