import { TierInfo, DailyChallenge, Achievement, Badge, RewardItem, UserProfile, LeaderboardEntry, FeedActivity } from '../types';

export const TIERS: TierInfo[] = [
  {
    name: 'Initiate',
    minXP: 0,
    color: '#8C8C90',
    badgeBg: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    icon: '⚡',
    description: 'The journey of self-mastery begins here.',
    benefits: ['Daily Challenge Access', 'Basic Stats Tracking', 'Community Access']
  },
  {
    name: 'Bronze',
    minXP: 2500,
    color: '#CD7F32',
    badgeBg: 'bg-amber-950/80 text-amber-400 border-amber-800',
    icon: '🥉',
    description: 'Discipline is taking root. Your foundation is solid.',
    benefits: ['Unlock Tier 2 Rewards', 'Custom Daily Challenge slot', 'Bronze Profile Border']
  },
  {
    name: 'Silver',
    minXP: 6000,
    color: '#C0C0C0',
    badgeBg: 'bg-slate-800 text-slate-200 border-slate-600',
    icon: '🥈',
    description: 'Unshakable consistency. You are rising above average.',
    benefits: ['Unlock Silver Perks', 'Streak Saver (1/mo)', 'Silver Identity Badge']
  },
  {
    name: 'Gold',
    minXP: 12000,
    color: '#D4AF37',
    badgeBg: 'bg-yellow-950/80 text-yellow-300 border-yellow-700',
    icon: '🥇',
    description: 'A force to be reckoned with. Elite discipline established.',
    benefits: ['Global Leaderboard Highlight', 'Gold VIP Badge', 'Exclusive Vault Guides']
  },
  {
    name: 'Platinum',
    minXP: 20000,
    color: '#E5E4E2',
    badgeBg: 'bg-teal-950/80 text-teal-200 border-teal-600',
    icon: '💎',
    description: 'Mastery in execution. Top 5% of all SVJ members.',
    benefits: ['Platinum Animated Aura', 'Custom Theme unlock', 'Priority Community Status']
  },
  {
    name: 'Diamond',
    minXP: 35000,
    color: '#00F0FF',
    badgeBg: 'bg-cyan-950/80 text-cyan-300 border-cyan-600',
    icon: '💠',
    description: 'An unstoppable phenomenon. Mind and body forged in iron.',
    benefits: ['Diamond Profile Crown', 'Exclusive Diamond Vault', 'Direct Founder Line']
  },
  {
    name: 'Obsidian',
    minXP: 60000,
    color: '#C81E3A',
    badgeBg: 'bg-rose-950/90 text-rose-300 border-rose-700',
    icon: '👑',
    description: 'Apex Predator. Legendary status attained.',
    benefits: ['Obsidian Legend Frame', 'Global Top 1% Hall of Fame', 'All SVJ Perks Unlocked']
  }
];

export const INITIAL_CHALLENGES: DailyChallenge[] = [
  {
    id: 'ch-1',
    title: '100 Push-Ups',
    category: 'Physical',
    difficulty: 'Hard',
    xp: 120,
    durationMinutes: 20,
    description: 'Complete 100 push-ups throughout the day in minimal sets.',
    completed: false
  },
  {
    id: 'ch-2',
    title: 'Cold Shower — 3 Minutes',
    category: 'Discipline',
    difficulty: 'Medium',
    xp: 80,
    durationMinutes: 5,
    description: 'Turn the tap to cold and endure for 3 unbroken minutes.',
    completed: false
  },
  {
    id: 'ch-3',
    title: 'Read 20 Pages',
    category: 'Mental',
    difficulty: 'Easy',
    xp: 60,
    durationMinutes: 30,
    description: 'Engage with non-fiction, philosophy, or personal growth books.',
    completed: false
  },
  {
    id: 'ch-4',
    title: 'No Sugar Today',
    category: 'Nutrition',
    difficulty: 'Medium',
    xp: 80,
    durationMinutes: 1440,
    description: 'Zero processed sugars or sweetened beverages for 24 hours.',
    completed: false
  },
  {
    id: 'ch-5',
    title: '10-Minute Meditation',
    category: 'Mindset',
    difficulty: 'Easy',
    xp: 50,
    durationMinutes: 10,
    description: 'Silent breath awareness without phone or distractions.',
    completed: false
  },
  {
    id: 'ch-6',
    title: '5km Run',
    category: 'Physical',
    difficulty: 'Hard',
    xp: 150,
    durationMinutes: 35,
    description: 'Pace run to build cardiovascular capacity and mental endurance.',
    completed: false
  }
];

export const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-1',
    title: 'Iron Will',
    description: 'Maintain a 14-day daily streak without missing a challenge.',
    icon: '⚔️',
    unlocked: false,
    xpReward: 500,
    rarity: 'Epic'
  },
  {
    id: 'ach-2',
    title: 'Streak Warrior',
    description: 'Reach a 30-day streak in the SVJ platform.',
    icon: '🔥',
    unlocked: false,
    xpReward: 1000,
    rarity: 'Rare'
  },
  {
    id: 'ach-3',
    title: 'First Blood',
    description: 'Complete your very first daily challenge.',
    icon: '🩸',
    unlocked: false,
    xpReward: 100,
    rarity: 'Common'
  },
  {
    id: 'ach-4',
    title: 'Top 50 Global',
    description: 'Break into the Top 50 on the Global SVJ Leaderboard.',
    icon: '🏆',
    unlocked: false,
    xpReward: 1200,
    rarity: 'Epic'
  },
  {
    id: 'ach-5',
    title: 'Cold Blooded',
    description: 'Complete 10 cold shower challenges in a single month.',
    icon: '🧊',
    unlocked: false,
    xpReward: 400,
    rarity: 'Rare'
  },
  {
    id: 'ach-6',
    title: 'Mind Over Matter',
    description: 'Log 1,000 total minutes of mindfulness & mental growth.',
    icon: '🧠',
    unlocked: false,
    xpReward: 1500,
    rarity: 'Legendary'
  }
];

export const INITIAL_BADGES: Badge[] = [
  {
    id: 'bdg-early',
    name: 'Initiate Adopter',
    description: 'Joined the SVJ Genesis Self-Improvement Guild.',
    icon: '🌟',
    unlocked: true
  },
  {
    id: 'bdg-consistent',
    name: 'Consistent',
    description: 'Complete 50+ daily challenges.',
    icon: '📅',
    unlocked: false
  },
  {
    id: 'bdg-warrior',
    name: 'Warrior',
    description: 'Reach Gold Tier status.',
    icon: '⚔️',
    unlocked: false
  },
  {
    id: 'bdg-iron',
    name: 'Iron',
    description: 'Master physical challenges for 30 consecutive days.',
    icon: '🦾',
    unlocked: false
  },
  {
    id: 'bdg-verified',
    name: 'Verified',
    description: 'SVJ Plus verified profile badge.',
    icon: '☑️',
    unlocked: false,
    isPremium: true
  },
  {
    id: 'bdg-top1',
    name: 'Top 1%',
    description: 'Ranked in the top percentile of global self-improvers.',
    icon: '👑',
    unlocked: false,
    isPremium: true
  },
  {
    id: 'bdg-vip',
    name: 'VIP Member',
    description: 'Exclusive SVJ Plus patron status.',
    icon: '⚜️',
    unlocked: false,
    isPremium: true
  },
  {
    id: 'bdg-obsidian',
    name: 'Obsidian',
    description: 'Unlocked the legendary Crimson Night dark theme.',
    icon: '⬛',
    unlocked: false,
    isPremium: true
  }
];

export const INITIAL_REWARDS: RewardItem[] = [
  {
    id: 'rew-1',
    title: 'SVJ Obsidian Theme',
    category: 'Cosmetic',
    xpCost: 2500,
    minTier: 'Bronze',
    description: 'Deep obsidian dark theme with crimson glow accents for your entire app layout.',
    unlocked: false,
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
    cosmeticId: 'samurai',
    actionLabel: 'Equip Theme'
  },
  {
    id: 'rew-2',
    title: 'Apex Discipline Protocol Guide',
    category: 'Guide',
    xpCost: 5000,
    minTier: 'Silver',
    description: 'A comprehensive 45-page blueprint on dopamine regulation, sleep optimization, and deep focus rituals.',
    unlocked: false,
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    code: 'GUIDE-APEX-2026',
    actionLabel: 'Read Full Blueprint Guide',
    guideContent: `# The Apex Discipline Protocol Blueprint (2026 Edition)

## Module 1: Dopamine Fasting & Receptor Reset
- **Morning Protocol**: Zero phone usage for 60 minutes after waking up. Sunlight exposure within 15 minutes.
- **Micro-dosing Cold Exposure**: 2-minute cold shower at 10-12°C triggers a 250% baseline increase in dopamine lasting 4+ hours.
- **Digital Fasting**: No infinite-scroll social feeds after 8:00 PM.

## Module 2: Deep Work & Flow State Induction
- **90-Minute Focus Cycles**: Work uninterrupted in 90-minute blocks with total notification blocking.
- **Binaural Beats**: 40Hz Gamma wave audio during intense problem-solving sessions.
- **Physical Environment**: Clear desk, single monitor focus, hydration with electrolytes.

## Module 3: Sleep Architecture & Hormonal Mastery
- **Magnesium L-Threonate + Apigenin**: Taken 45 minutes prior to sleep.
- **Thermal Drop**: Keep bedroom temperature at 18°C (64°F) to accelerate slow-wave sleep.
- **3-2-1 Rule**: No food 3 hours before sleep, no liquids 2 hours before, no blue screens 1 hour before.`
  },
  {
    id: 'rew-3',
    title: 'Crimson Aura Profile Frame',
    category: 'Cosmetic',
    xpCost: 8000,
    minTier: 'Gold',
    description: 'Animated glowing crimson ring surrounding your avatar in community feed & leaderboards.',
    unlocked: false,
    image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80',
    isPremiumOnly: true,
    cosmeticId: 'frame-crimson',
    actionLabel: 'Equip Crimson Frame'
  },
  {
    id: 'rew-4',
    title: 'SVJ Metal Card Physical Discount',
    category: 'VIP Perk',
    xpCost: 15000,
    minTier: 'Platinum',
    description: '50% off order voucher for your customized laser-engraved steel SVJ Membership Card.',
    unlocked: false,
    image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
    code: 'STEEL-SVJ-50',
    actionLabel: 'Access Metal Card Voucher',
    perkDetails: 'Voucher Code: STEEL-SVJ-50\nUse this code at checkout to claim your 50% discount on the laser-engraved heavy stainless steel SVJ Genesis Membership Card. Includes custom QR code linking directly to your verified SVJ profile.'
  },
  {
    id: 'rew-5',
    title: 'Private Founder Mastermind Access',
    category: 'VIP Perk',
    xpCost: 30000,
    minTier: 'Diamond',
    description: 'Monthly live voice session with high-performing SVJ founders & athletes.',
    unlocked: false,
    image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=600&q=80',
    actionLabel: 'Access Private Channel',
    perkDetails: 'VIP Mastermind Pass Active!\nJoin Sabari and elite SVJ athletes every first Sunday at 18:00 UTC. Voice channel: #founder-mastermind (Verified SVJ VIPs only).'
  }
];

export const INITIAL_USER: UserProfile = {
  id: 'user-me',
  name: 'New Voyager',
  username: 'initiate_svj',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
  coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
  tier: 'Initiate',
  totalXP: 0,
  weeklyXP: 0,
  monthlyXP: 0,
  currentStreak: 0,
  bestStreak: 0,
  joinDate: 'July 2026',
  daysActive: 1,
  totalChallengesCompleted: 0,
  bio: 'Starting my daily journey of discipline and focus.',
  location: 'Earth',
  isPremium: false,
  verifiedIcon: false,
  vipIcon: false,
  memberId: 'SVJ-1001-A',
  level: 1,
  leagueRank: 'APPRENTICE I',
  evolutionTheme: 'wolf',
  stats: {
    physical: 12,
    social: 10,
    discipline: 8,
    mental: 15,
    intellect: 14,
    ambition: 20
  },
  assessmentCompleted: false,
  habitCompletionRate: 0,
  xpHistory: [
    { date: '25 Jul', xp: 0 },
    { date: '27 Jul', xp: 0 },
    { date: '29 Jul', xp: 0 },
    { date: '31 Jul', xp: 0 }
  ],
  weeklyHistory: [
    { week: 'W1', xp: 0 }
  ],
  achievements: INITIAL_ACHIEVEMENTS,
  badges: INITIAL_BADGES
};

export const LEADERBOARD_USERS: LeaderboardEntry[] = [
  {
    rank: 1,
    rankDelta: 0,
    id: 'user-1',
    username: 'vikram_elite',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    tier: 'Obsidian',
    totalXP: 28400,
    weeklyXP: 1420,
    monthlyXP: 5800,
    streak: 64,
    country: 'IN',
    isVerified: true,
    isVIP: true,
    equippedFrame: 'frame-crimson',
    bio: 'Relentless execution. Standard set at 100%.',
    joinDate: 'January 2026'
  },
  {
    rank: 2,
    rankDelta: 1,
    id: 'user-2',
    username: 'ryu_mastery',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    tier: 'Diamond',
    totalXP: 24100,
    weeklyXP: 1280,
    monthlyXP: 5100,
    streak: 52,
    country: 'JP',
    isVerified: true,
    equippedFrame: 'frame-gold',
    bio: 'Kaizen every second. Unbroken focus.'
  },
  {
    rank: 3,
    rankDelta: -1,
    id: 'user-3',
    username: 'marcus_iron',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80',
    tier: 'Platinum',
    totalXP: 21800,
    weeklyXP: 1150,
    monthlyXP: 4600,
    streak: 45,
    country: 'US',
    isVerified: true,
    isVIP: true,
    equippedFrame: 'frame-cyber',
    bio: 'No excuses. Only daily habits.'
  },
  {
    rank: 4,
    rankDelta: 0,
    id: 'user-4',
    username: 'priya_apex',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    tier: 'Platinum',
    totalXP: 18500,
    weeklyXP: 980,
    monthlyXP: 4200,
    streak: 38,
    country: 'IN',
    isVerified: true,
    bio: 'Triathlete & Tech Founder. Daily habits.'
  },
  {
    rank: 5,
    rankDelta: 2,
    id: 'user-5',
    username: 'alex_titan',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
    tier: 'Gold',
    totalXP: 16200,
    weeklyXP: 890,
    monthlyXP: 3700,
    streak: 31,
    country: 'UK',
    isVerified: true,
    isVIP: true,
    bio: 'Building consistency every morning.'
  },
  {
    rank: 6,
    rankDelta: -1,
    id: 'user-6',
    username: 'karan_shield',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
    tier: 'Gold',
    totalXP: 14100,
    weeklyXP: 820,
    monthlyXP: 3400,
    streak: 28,
    country: 'IN',
    bio: 'Early rising. Cold water. Mind clear.'
  },
  {
    rank: 7,
    rankDelta: 1,
    id: 'user-7',
    username: 'sophia_vanguard',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    tier: 'Gold',
    totalXP: 12400,
    weeklyXP: 750,
    monthlyXP: 3100,
    streak: 24,
    country: 'DE',
    isVerified: true,
    bio: 'Focus is currency.'
  },
  {
    rank: 8,
    rankDelta: -1,
    id: 'user-8',
    username: 'liam_forge',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80',
    tier: 'Silver',
    totalXP: 9800,
    weeklyXP: 610,
    monthlyXP: 2500,
    streak: 19,
    country: 'IE',
    bio: 'Building strength in silence.'
  },
  {
    rank: 9,
    rankDelta: 2,
    id: 'user-9',
    username: 'dev_warrior',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    tier: 'Silver',
    totalXP: 7500,
    weeklyXP: 520,
    monthlyXP: 2100,
    streak: 15,
    country: 'IN',
    bio: 'Software & Discipline.'
  },
  {
    rank: 10,
    rankDelta: -2,
    id: 'user-10',
    username: 'rafael_steel',
    avatar: 'https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?auto=format&fit=crop&w=400&q=80',
    tier: 'Bronze',
    totalXP: 5200,
    weeklyXP: 410,
    monthlyXP: 1700,
    streak: 11,
    country: 'BR',
    bio: 'Mastering the daily grind.'
  },
  {
    rank: 152,
    rankDelta: 0,
    id: 'user-me',
    username: 'initiate_svj',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
    tier: 'Initiate',
    totalXP: 0,
    weeklyXP: 0,
    monthlyXP: 0,
    streak: 0,
    country: 'US',
    bio: 'Starting my daily journey of discipline and focus.'
  }
];

export const INITIAL_FEED: FeedActivity[] = [
  {
    id: 'feed-1',
    userId: 'user-1',
    username: 'vikram_elite',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    userTier: 'Obsidian',
    isVerified: true,
    isVIP: true,
    actionType: 'streak_milestone',
    title: '🔥 Unstoppable 60-Day Streak Reached!',
    details: 'Completed daily challenges for 60 consecutive days. Discipline is now second nature.',
    xpEarned: 500,
    timestamp: '12 mins ago',
    reactions: { fire: 22, crown: 8, hundred: 19, bolt: 14, wolf: 11 },
    userReactions: {},
    comments: [
      {
        id: 'c-1',
        userId: 'user-3',
        username: 'marcus_iron',
        avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80',
        text: 'Insane consistency brother. Crown well earned 👑',
        createdAt: '8 mins ago',
        tier: 'Platinum'
      }
    ]
  },
  {
    id: 'feed-2',
    userId: 'user-5',
    username: 'alex_titan',
    userAvatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
    userTier: 'Gold',
    isVerified: true,
    isVIP: true,
    actionType: 'unlocked_achievement',
    title: '🏆 Completed Daily Cold Shower & 5km Run',
    details: 'Morning training session completed before 07:00 AM.',
    xpEarned: 230,
    timestamp: '45 mins ago',
    reactions: { fire: 14, crown: 4, hundred: 10, bolt: 12, wolf: 9 },
    userReactions: {},
    comments: []
  },
  {
    id: 'feed-3',
    userId: 'user-4',
    username: 'priya_apex',
    userAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    userTier: 'Platinum',
    isVerified: true,
    actionType: 'completed_challenge',
    title: '⚡ Completed Elite Challenge: 100 Push-ups & Meditation',
    details: 'Daily focus block locked in.',
    xpEarned: 170,
    timestamp: '2 hours ago',
    reactions: { fire: 18, crown: 6, hundred: 14, bolt: 11, wolf: 17 },
    userReactions: {},
    comments: [
      {
        id: 'c-3',
        userId: 'user-7',
        username: 'sophia_vanguard',
        avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
        text: 'Great pace! Keeping the momentum going ⚡',
        createdAt: '1 hour ago',
        tier: 'Gold'
      }
    ]
  }
];

