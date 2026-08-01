import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, Sparkles, Star, CheckCircle2
} from 'lucide-react';
import { useSVJ } from '../context/SVJContext';

// 8 Evolution Themes Spec
export const EVOLUTION_THEMES = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'FROM CHIHUAHUA TO WOLF',
    icon: '🐺',
    accent: '#C81E3A',
    image: 'https://images.unsplash.com/photo-1561731216-c3a4d99437d5?auto=format&fit=crop&w=600&q=80',
    desc: 'Unbroken predatory discipline. Pure instinct and relentless stamina.'
  },
  {
    id: 'anime',
    name: 'Anime Hero',
    tagline: 'FROM LOW-RANK TO MAIN CHARACTER',
    icon: '⚡',
    accent: '#3B82F6',
    image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80',
    desc: 'The classic zero-to-god arc. Overcoming impossible odds with fiery resolve.'
  },
  {
    id: 'fighter',
    name: 'Fighter',
    tagline: 'FROM STREET FIGHTER TO CHAMPION',
    icon: '🥊',
    accent: '#EF4444',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80',
    desc: 'Gritty physical grit. Every punch honed through thousands of grueling rounds.'
  },
  {
    id: 'samurai',
    name: 'Samurai',
    tagline: 'FROM APPRENTICE TO BLADEMASTER',
    icon: '⚔️',
    accent: '#10B981',
    image: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?auto=format&fit=crop&w=600&q=80',
    desc: 'Stoic mental precision and razor-sharp clarity. Zero wasted movement.'
  },
  {
    id: 'cyber',
    name: 'Cyber Agent',
    tagline: 'FROM INITIATE TO DIGITAL SINGULARITY',
    icon: '🦾',
    accent: '#06B6D4',
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80',
    desc: 'Hyper-intellect and system optimization. Upgrade your neural output.'
  },
  {
    id: 'knight',
    name: 'Fallen Knight',
    tagline: 'FROM FALLEN TO ETERNAL KING',
    icon: '🛡️',
    accent: '#8B5CF6',
    image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80',
    desc: 'Rise from dishonor and hardship into absolute unwavering sovereignty.'
  },
  {
    id: 'gladiator',
    name: 'Gladiator',
    tagline: 'FROM CHAINS TO ARENA LEGEND',
    icon: '🏛️',
    accent: '#F59E0B',
    image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=600&q=80',
    desc: 'Conquer the arena of life. Turn crowd skepticism into roaring applause.'
  },
  {
    id: 'valkyrie',
    name: 'Valkyrie',
    tagline: 'FROM SHIELD MAIDEN TO GODDESS OF WAR',
    icon: '🦅',
    accent: '#EC4899',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    desc: 'Divine martial focus. Soar above mental clutter with unstoppable force.'
  }
];

// SVG Metallic 3D rendered floating objects
const FloatingHourglassSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)]">
    <path d="M25 15 H75 V22 L56 45 L75 68 V75 H25 V68 L44 45 L25 22 Z" fill="url(#silverGrad)" stroke="#E2E8F0" strokeWidth="2.5" />
    <path d="M30 18 H70 M30 72 H70" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="50" cy="62" rx="14" ry="6" fill="#A0A0A0" opacity="0.6" />
    <defs>
      <linearGradient id="silverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="50%" stopColor="#A0A0A0" />
        <stop offset="100%" stopColor="#4A4A4A" />
      </linearGradient>
    </defs>
  </svg>
);

const FloatingPhoneSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)] transform -rotate-12">
    <rect x="28" y="15" width="44" height="70" rx="8" fill="url(#phoneGrad)" stroke="#E2E8F0" strokeWidth="2" />
    <rect x="32" y="22" width="36" height="52" rx="3" fill="#121215" />
    <line x1="42" y1="18" x2="58" y2="18" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
    <circle cx="50" cy="79" r="2.5" fill="#D1D5DB" />
    <defs>
      <linearGradient id="phoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#6B7280" />
      </linearGradient>
    </defs>
  </svg>
);

const FloatingCompassSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)] transform rotate-12">
    <circle cx="50" cy="50" r="35" fill="url(#compassGrad)" stroke="#E2E8F0" strokeWidth="3" />
    <circle cx="50" cy="50" r="28" fill="#18181B" stroke="#4B5563" strokeWidth="1" />
    <polygon points="50,26 56,50 50,46" fill="#F87171" />
    <polygon points="50,74 44,50 50,54" fill="#9CA3AF" />
    <circle cx="50" cy="50" r="3" fill="#FFFFFF" />
    <defs>
      <linearGradient id="compassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#374151" />
      </linearGradient>
    </defs>
  </svg>
);

const FloatingBustSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)]">
    <path d="M35 75 H65 V80 H35 Z M38 65 L42 75 H58 L62 65 Z" fill="#D1D5DB" />
    <path d="M50 20 C40 20 32 28 32 38 C32 46 36 50 40 56 L44 65 H56 L60 56 C64 50 68 46 68 38 C68 28 60 20 50 20 Z" fill="url(#bustGrad)" stroke="#F3F4F6" strokeWidth="1.5" />
    <path d="M42 28 C45 25 55 25 58 28 M40 38 Q50 35 60 38" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
    <defs>
      <linearGradient id="bustGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#4B5563" />
      </linearGradient>
    </defs>
  </svg>
);

const FloatingCubeSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)]">
    <path d="M50 15 L82 32 L50 49 L18 32 Z" fill="#E5E7EB" stroke="#374151" strokeWidth="1.5" />
    <path d="M18 32 L50 49 V83 L18 66 Z" fill="url(#cubeLeft)" stroke="#374151" strokeWidth="1.5" />
    <path d="M82 32 L50 49 V83 L82 66 Z" fill="url(#cubeRight)" stroke="#374151" strokeWidth="1.5" />
    {/* Grid lines */}
    <line x1="39" y1="21" x2="71" y2="38" stroke="#9CA3AF" strokeWidth="1" />
    <line x1="29" y1="27" x2="61" y2="44" stroke="#9CA3AF" strokeWidth="1" />
    <line x1="29" y1="38" x2="29" y2="72" stroke="#6B7280" strokeWidth="1" />
    <line x1="39" y1="43" x2="39" y2="78" stroke="#6B7280" strokeWidth="1" />
    <defs>
      <linearGradient id="cubeLeft" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9CA3AF" />
        <stop offset="100%" stopColor="#1F2937" />
      </linearGradient>
      <linearGradient id="cubeRight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D1D5DB" />
        <stop offset="100%" stopColor="#374151" />
      </linearGradient>
    </defs>
  </svg>
);

const FloatingRookSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)]">
    <path d="M30 20 H38 V28 H46 V20 H54 V28 H62 V20 H70 V32 H30 Z" fill="#F3F4F6" />
    <path d="M34 32 L38 68 H62 L66 32 Z" fill="url(#rookGrad)" stroke="#E5E7EB" strokeWidth="1.5" />
    <rect x="26" y="68" width="48" height="12" rx="2" fill="#9CA3AF" stroke="#374151" strokeWidth="1.5" />
    <defs>
      <linearGradient id="rookGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#4B5563" />
      </linearGradient>
    </defs>
  </svg>
);

const FloatingPuzzleSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)] transform -rotate-12">
    <path d="M30 30 H42 C42 36 48 40 54 40 C60 40 66 36 66 30 H70 V42 C64 42 60 48 60 54 C60 60 64 66 70 66 V70 H58 C58 64 52 60 46 60 C40 60 34 64 34 70 H30 V58 C36 58 40 52 40 46 C40 40 36 34 30 34 Z" fill="url(#puzzleGrad)" stroke="#FFFFFF" strokeWidth="2" />
    <defs>
      <linearGradient id="puzzleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#6B7280" />
      </linearGradient>
    </defs>
  </svg>
);

const FloatingDartSVG = () => (
  <svg width="72" height="72" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_10px_20px_rgba(255,255,255,0.3)] transform rotate-45">
    <polygon points="50,15 54,35 50,30 46,35" fill="#E5E7EB" />
    <rect x="48" y="30" width="4" height="35" fill="#9CA3AF" />
    <polygon points="50,65 65,85 50,78 35,85" fill="url(#dartGrad)" />
    <defs>
      <linearGradient id="dartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#4B5563" />
      </linearGradient>
    </defs>
  </svg>
);

const WolfAvatarSVG = () => (
  <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
    <svg width="120" height="120" viewBox="0 0 100 100" fill="none" className="drop-shadow-[0_0_25px_rgba(200,30,58,0.5)]">
      {/* Wolf Head Polygon Silhouette */}
      <polygon points="50,10 20,40 25,75 50,95 75,75 80,40" fill="#1C1C21" stroke="#3A3A42" strokeWidth="2" />
      <polygon points="50,10 20,40 35,50 50,35 65,50 80,40" fill="#282830" />
      {/* Ears */}
      <polygon points="20,40 10,15 32,28" fill="#121215" stroke="#3A3A42" strokeWidth="1" />
      <polygon points="80,40 90,15 68,28" fill="#121215" stroke="#3A3A42" strokeWidth="1" />
      {/* Glowing Yellow Eyes */}
      <polygon points="35,48 44,50 38,54" fill="#FBBF24" className="drop-shadow-[0_0_8px_#FBBF24]" />
      <polygon points="65,48 56,50 62,54" fill="#FBBF24" className="drop-shadow-[0_0_8px_#FBBF24]" />
      {/* Snout */}
      <polygon points="50,60 42,75 50,85 58,75" fill="#0A0A0C" />
    </svg>
  </div>
);

export const DarkCinematicOnboardingModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose
}) => {
  const { updateUserProfile, triggerConfetti, setIsEditProfileOpen } = useSVJ();

  const [step, setStep] = useState(1);
  const totalSteps = 19;

  // Answers State
  const [age, setAge] = useState('23-29');
  const [screenTime, setScreenTime] = useState('5-8 hours per day');
  const [futureOutlook, setFutureOutlook] = useState('A little');
  const [emotionalState, setEmotionalState] = useState('Few times a week');
  const [learningHabit, setLearningHabit] = useState('Sometimes');
  const [changeReason, setChangeReason] = useState('I need to be successful');
  const [prideTime, setPrideTime] = useState('Last week');
  const [dream, setDream] = useState('I want to make a lot of money');
  const [selectedThemeIndex, setSelectedThemeIndex] = useState(0);

  if (!isOpen) return null;

  const nextStep = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      // Save results
      localStorage.setItem('svj_app_state_v5_has_dark_onboarded', 'true');
      localStorage.setItem('svj_app_state_v5_has_onboarded', 'true');
      updateUserProfile({
        evolutionTheme: EVOLUTION_THEMES[selectedThemeIndex]!.id as 'samurai',
        level: 1,
        leagueRank: 'APPRENTICE I',
        stats: {
          physical: 18,
          social: 15,
          discipline: 20,
          mental: 16,
          intellect: 19,
          ambition: 25
        }
      });
      triggerConfetti();
      onClose();
      setIsEditProfileOpen(true);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050507] text-white overflow-y-auto flex flex-col font-sans selection:bg-red-500/30">
      
      {/* Atmospheric Background Scene */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Subtle dark gradient overlay */}
        <div className="absolute inset-0 bg-radial from-[#121218] via-[#050507] to-[#020203] opacity-90" />
        
        {/* Central Vertical Lightning Strike */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-[2px] bg-gradient-to-b from-white/80 via-white/40 to-transparent blur-[1px] opacity-25" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-[200px] bg-white/5 blur-3xl opacity-10" />

        {/* Bottom Surfer/Cliff Silhouette */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black via-black/80 to-transparent flex items-end justify-center">
          <svg className="w-full h-24 opacity-30" viewBox="0 0 1000 100" preserveAspectRatio="none">
            <path d="M0,80 Q250,60 500,85 T1000,70 L1000,100 L0,100 Z" fill="#0A0A0E" />
            <circle cx="500" cy="70" r="12" fill="#000000" />
            <path d="M492,82 L508,82 L500,60 Z" fill="#000000" />
          </svg>
        </div>
      </div>

      {/* Top Fixed Header with Thin Progress Bar & Back Arrow */}
      <div className="relative z-10 w-full max-w-xl mx-auto px-4 pt-4 flex items-center justify-between">
        {step > 1 ? (
          <button
            type="button"
            onClick={prevStep}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-8" />
        )}

        {/* Thin Sleek Progress Bar */}
        <div className="flex-1 mx-4 h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/90 transition-all duration-300 ease-out"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>

        <div className="w-8" />
      </div>

      {/* Main Content View Container */}
      <div className="relative z-10 flex-1 flex flex-col justify-between max-w-xl w-full mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="my-auto w-full"
          >

            {/* SCREEN 1: Welcome Greeting */}
            {step === 1 && (
              <div className="text-center space-y-6 my-12" onClick={nextStep}>
                <h1 className="font-serif text-2xl sm:text-3xl text-white font-normal tracking-wide">
                  Welcome to SVJ.
                </h1>
                <p className="font-serif text-sm sm:text-base text-white/70 max-w-sm mx-auto leading-relaxed">
                  You just made the first step towards becoming the best version of yourself.
                </p>
                <div className="pt-24 text-[11px] font-mono tracking-widest text-white/40 uppercase animate-pulse cursor-pointer">
                  TAP TO CONTINUE
                </div>
              </div>
            )}

            {/* SCREEN 2: Age Question */}
            {step === 2 && (
              <div className="space-y-8 text-center">
                <FloatingHourglassSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal">
                  How old are you?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {['18-22', '23-29', '30-39', '40+'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAge(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        age === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 3: Screen Time Question */}
            {step === 3 && (
              <div className="space-y-8 text-center">
                <FloatingPhoneSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal">
                  What's your current screen time?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {['0-2 hour per day', '2-4 hours per day', '5-8 hours per day', '8+ hours per day'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setScreenTime(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        screenTime === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 4: Stat Shock #1 (Hours Wasted) */}
            {step === 4 && (
              <div className="space-y-8 text-center my-4">
                <div>
                  <p className="text-sm font-sans text-white/80 mb-2">You're currently on track to waste</p>
                  <h1 className="font-sans font-bold text-4xl sm:text-5xl text-[#FF3B30] tracking-tight drop-shadow-[0_0_25px_rgba(255,59,48,0.6)]">
                    2,33,600
                  </h1>
                  <p className="text-sm font-sans text-white/80 mt-1">hours of your life</p>
                </div>

                {/* Comparative Bar Chart */}
                <div className="flex items-end justify-center gap-8 h-48 py-4">
                  <div className="flex flex-col items-center gap-2 h-full justify-end">
                    <div className="w-12 h-36 rounded-2xl bg-gradient-to-t from-[#800000] to-[#FF3B30] border-2 border-[#FF3B30] shadow-[0_0_20px_rgba(255,59,48,0.5)]" />
                    <span className="text-[10px] font-mono text-[#FF3B30] uppercase font-bold tracking-wider">CURRENT YOU</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 h-full justify-end">
                    <div className="w-12 h-16 rounded-2xl bg-white/20 border-2 border-white/60 shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
                    <span className="text-[10px] font-mono text-white/60 uppercase font-bold tracking-wider">WITH SVJ</span>
                  </div>
                </div>

                <p className="text-xs text-white/80 max-w-sm mx-auto leading-relaxed">
                  SVJ users can decrease their screen time <span className="text-[#FF3B30] font-bold">by 110%</span> in the first 2 weeks.
                </p>
              </div>
            )}

            {/* SCREEN 5: Future Outlook Question */}
            {step === 5 && (
              <div className="space-y-8 text-center">
                <FloatingCompassSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal max-w-sm mx-auto leading-tight">
                  How excited do you feel about your life and future?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {['Not at all', 'A little', 'Pretty solid', 'Life is great'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setFutureOutlook(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        futureOutlook === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 6: Emotional Check Question */}
            {step === 6 && (
              <div className="space-y-8 text-center">
                <FloatingBustSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal">
                  How often do you feel anxious or sad?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {['Never', 'Few times a week', 'Everyday', 'I am a mess'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEmotionalState(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        emotionalState === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 7: Learning Habit Question */}
            {step === 7 && (
              <div className="space-y-8 text-center">
                <FloatingCubeSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal">
                  How often do you learn new things?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {['Never', 'Sometimes', 'Few times a week', 'Always learning'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setLearningHabit(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        learningHabit === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 8: Reason for Change Question */}
            {step === 8 && (
              <div className="space-y-8 text-center">
                <FloatingRookSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal max-w-sm mx-auto leading-tight">
                  What's the main reason you want to make a change?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {[
                    'I want to feel more confident',
                    "I'm not happy with my life",
                    'I need to be successful',
                    'I want to prove the world wrong'
                  ].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setChangeReason(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        changeReason === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 9: Stat Shock #2 (60 Days Projection Graph) */}
            {step === 9 && (
              <div className="space-y-8 text-center my-4">
                <div>
                  <p className="text-sm font-sans text-white/80 mb-1">You'll see real change in the first</p>
                  <h1 className="font-sans font-bold text-4xl sm:text-5xl text-[#A855F7] tracking-tight drop-shadow-[0_0_25px_rgba(168,85,247,0.6)]">
                    60 days
                  </h1>
                </div>

                {/* Line Graph Visualization */}
                <div className="relative w-full max-w-xs mx-auto h-44 py-2">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 300 150" fill="none">
                    {/* Grid line */}
                    <line x1="0" y1="120" x2="300" y2="120" stroke="#333" strokeDasharray="3 3" />
                    {/* WITHOUT SVJ line */}
                    <path d="M10 115 Q150 110 290 115" stroke="#6B7280" strokeWidth="2" />
                    <text x="210" y="105" fill="#6B7280" fontSize="8" fontFamily="monospace">WITHOUT SVJ</text>

                    {/* WITH SVJ curve area */}
                    <path
                      d="M10 115 C60 80 120 40 170 40 L240 10 L290 5 L290 120 L10 120 Z"
                      fill="url(#purpleGlow)"
                      opacity="0.4"
                    />
                    <path
                      d="M10 115 C60 80 120 40 170 40 L240 10 L290 5"
                      stroke="#A855F7"
                      strokeWidth="3.5"
                      className="drop-shadow-[0_0_10px_#A855F7]"
                    />
                    <text x="175" y="30" fill="#A855F7" fontSize="8" fontFamily="monospace" fontWeight="bold">WITH SVJ</text>
                    
                    {/* Vertical dashed marker */}
                    <line x1="170" y1="40" x2="170" y2="120" stroke="#A855F7" strokeWidth="2" strokeDasharray="4 4" />
                    <text x="155" y="132" fill="#A855F7" fontSize="7" fontFamily="monospace">MONTH 2</text>

                    <defs>
                      <linearGradient id="purpleGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#A855F7" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>

                <p className="text-xs text-white/80 max-w-sm mx-auto leading-relaxed">
                  SVJ users see up to <span className="text-[#A855F7] font-bold">200% improvement</span> in their habits within 2 months.
                </p>
              </div>
            )}

            {/* SCREEN 10: Pride Check Question */}
            {step === 10 && (
              <div className="space-y-8 text-center">
                <FloatingPuzzleSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal max-w-sm mx-auto leading-tight">
                  When was the last time you felt proud of yourself?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {['Last week', 'Last month', 'Last year', 'Never'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPrideTime(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        prideTime === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 11: Long Term Dream Question */}
            {step === 11 && (
              <div className="space-y-8 text-center">
                <FloatingDartSVG />
                <h2 className="font-serif text-xl sm:text-2xl text-white font-normal">
                  What's your long-term dream in life?
                </h2>
                <div className="space-y-3 max-w-md mx-auto">
                  {[
                    'I want to make a lot of money',
                    'I want to impact the world',
                    'I want to provide for my family',
                    'I want to be happy and healthy'
                  ].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setDream(opt)}
                      className={`w-full py-4 px-6 rounded-2xl text-sm font-medium transition-all cursor-pointer ${
                        dream === opt
                          ? 'bg-[#3A3A40]/80 border-2 border-white/90 text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                          : 'bg-[#121215]/60 border border-white/5 text-white/40 hover:text-white/70 hover:bg-[#1A1A1E]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 12: Science Credibility */}
            {step === 12 && (
              <div className="space-y-6 text-center my-2">
                <h2 className="font-sans text-lg sm:text-xl text-white font-medium">
                  SVJ is built on <span className="font-bold">real science</span>
                </h2>

                <div className="space-y-3.5 max-w-md mx-auto text-left">
                  {/* Card 1 */}
                  <div className="p-4 rounded-2xl bg-[#121215]/90 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)] flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-500/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-red-400">
                      Stanford
                    </div>
                    <div>
                      <p className="text-xs text-white/90 font-sans leading-relaxed">
                        "Small changes in behavior repeated consistently create <span className="text-red-400 font-bold">lasting transformation</span> through neuroplasticity."
                      </p>
                      <span className="text-[10px] font-mono text-white/40 mt-1 block">
                        Fogg, BJ (2019), Tiny Habits: Stanford Behavior Design Lab.
                      </span>
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div className="p-4 rounded-2xl bg-[#121215]/90 border border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)] flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-500/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-purple-400">
                      UCL
                    </div>
                    <div>
                      <p className="text-xs text-white/90 font-sans leading-relaxed">
                        "On average, it takes more than 2 months before a new behavior becomes automatic - <span className="text-purple-400 font-bold">66 days to be exact</span>."
                      </p>
                      <span className="text-[10px] font-mono text-white/40 mt-1 block">
                        Lally, P., et al. (2009), European Journal of Social Psychology.
                      </span>
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div className="p-4 rounded-2xl bg-[#121215]/90 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)] flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-amber-400">
                      Atomic
                    </div>
                    <div>
                      <p className="text-xs text-white/90 font-sans leading-relaxed">
                        "If you get one percent better each day for one year, you'll end up <span className="text-amber-400 font-bold">thirty-seven times better</span>."
                      </p>
                      <span className="text-[10px] font-mono text-white/40 mt-1 block">
                        Clear, J. (2018), Atomic Habits.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN 13: Choose Evolution Theme (Interactive Carousel) */}
            {step === 13 && (
              <div className="space-y-6 text-center my-2">
                <div>
                  <h2 className="font-sans text-xl sm:text-2xl text-white font-normal">
                    Choose your evolution theme
                  </h2>
                  <p className="text-xs text-white/40 font-sans mt-1">
                    This is purely cosmetic and you can always change it later
                  </p>
                </div>

                {/* Theme Art Floating Character Cutout (Matches Reference Screenshots) */}
                <div className="relative w-full max-w-sm mx-auto h-64 flex items-center justify-center">
                  {/* Subtle aura accent glow */}
                  <div
                    className="absolute w-44 h-44 rounded-full blur-3xl opacity-25 transition-all duration-500"
                    style={{ backgroundColor: EVOLUTION_THEMES[selectedThemeIndex].accent }}
                  />

                  {/* Floating character illustration without hard box border */}
                  <div className="relative w-56 h-56 flex items-center justify-center">
                    <img
                      src={EVOLUTION_THEMES[selectedThemeIndex].image}
                      alt={EVOLUTION_THEMES[selectedThemeIndex].name}
                      className="w-full h-full object-cover rounded-full filter drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)] transition-all duration-300"
                      style={{
                        maskImage: 'radial-gradient(circle at center, black 50%, transparent 92%)',
                        WebkitMaskImage: 'radial-gradient(circle at center, black 50%, transparent 92%)'
                      }}
                    />
                  </div>
                </div>

                {/* Title & Tagline */}
                <div>
                  <h3 className="font-serif text-2xl sm:text-3xl text-white tracking-wide">
                    {EVOLUTION_THEMES[selectedThemeIndex].name}
                  </h3>
                  <p className="text-[10px] font-mono uppercase font-bold tracking-widest text-white/60 mt-1">
                    {EVOLUTION_THEMES[selectedThemeIndex].tagline}
                  </p>
                </div>

                {/* Dot Pagination Selector */}
                <div className="flex items-center justify-center gap-2 pt-1">
                  {EVOLUTION_THEMES.map((t, idx) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedThemeIndex(idx)}
                      className={`transition-all cursor-pointer ${
                        selectedThemeIndex === idx
                          ? 'w-3 h-3 rounded-full bg-white ring-2 ring-white/50 scale-110 shadow-[0_0_10px_rgba(255,255,255,0.8)]'
                          : 'w-2 h-2 rounded-full bg-white/20 hover:bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SCREEN 14: Roadmap / Program Ready Preview */}
            {step === 14 && (
              <div className="space-y-6 text-center my-2">
                <h2 className="font-sans text-xl text-white font-normal">
                  Become unrecognizable in the next 60 days
                </h2>

                {/* Phone Mockup Card */}
                <div className="p-5 rounded-3xl bg-[#0D0D10] border border-white/10 shadow-2xl max-w-xs mx-auto space-y-4">
                  <div className="text-sm font-sans text-white/90 font-medium">
                    Your <span className="font-bold text-white">60-Day program</span> is ready
                  </div>

                  {/* Day 1 Hexagon Wheel */}
                  <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-black/80 border border-white/20 flex items-center justify-center font-bold text-sm text-white">
                      Day 1
                    </div>
                    {/* 6 Peripheral Hex Nodes */}
                    {['bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-orange-500'].map((color, i) => (
                      <div
                        key={i}
                        className={`absolute w-4 h-4 rounded-md ${color} opacity-80`}
                        style={{
                          transform: `rotate(${i * 60}deg) translate(50px) rotate(-${i * 60}deg)`
                        }}
                      />
                    ))}
                  </div>

                  {/* Week Tabs */}
                  <div className="flex justify-center gap-2 text-[10px] font-mono text-white/40">
                    <span className="px-2.5 py-1 rounded-full bg-white/10 text-white font-bold">Week 1</span>
                    <span>Week 2</span>
                    <span>Week 3</span>
                    <span>Week 4</span>
                  </div>

                  {/* Date Subtitle */}
                  <div className="text-[10px] font-mono text-white/50 text-left">
                    Week 1: Jan 24 - Jan 31
                  </div>

                  {/* Task List Items */}
                  <div className="space-y-2 text-left text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-[#121216] border border-green-500/30 flex items-center justify-between text-green-300">
                      <span>Work out for 1 hour</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#121216] border border-blue-500/30 flex items-center justify-between text-blue-300">
                      <span>Wake up at 7:45AM</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#121216] border border-red-500/30 flex items-center justify-between text-red-300">
                      <span>Less than 4 hours of social media</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-red-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN 15: Member Count Social Proof */}
            {step === 15 && (
              <div className="space-y-8 text-center my-6">
                <div>
                  <p className="text-sm font-sans text-white/80 mb-1">Join the</p>
                  <h1 className="font-sans font-bold text-4xl sm:text-5xl text-white tracking-tight drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                    3,48,674
                  </h1>
                  <p className="text-xs font-sans text-white/60 mt-1">
                    members making <span className="font-bold text-white">real progress</span> with SVJ
                  </p>
                </div>

                {/* Avatar Circles Row */}
                <div className="flex justify-center -space-x-3">
                  {['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
                    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
                    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&q=80',
                    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&q=80',
                    'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=100&q=80'
                  ].map((url, i) => (
                    <img key={i} src={url} alt="member" className="w-10 h-10 rounded-full border-2 border-black object-cover" />
                  ))}
                </div>

                {/* Peeking Testimonial Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div className="p-4 rounded-2xl bg-[#121215] border border-white/10 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">dylan m</span>
                      <div className="flex text-amber-400"><Star className="w-3 h-3 fill-amber-400" /> 5.0</div>
                    </div>
                    <span className="text-[10px] text-white/40 font-mono">25M in California</span>
                    <p className="text-xs text-white/80 pt-1 font-sans">
                      "Completely changed my life. Built healthy productive habits into my daily routine."
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#121215] border border-white/10 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">michael h</span>
                      <div className="flex text-amber-400"><Star className="w-3 h-3 fill-amber-400" /> 5.0</div>
                    </div>
                    <span className="text-[10px] text-white/40 font-mono">23M in New York</span>
                    <p className="text-xs text-white/80 pt-1 font-sans">
                      "This app helped me build discipline to get me out of my slump. Definitely download!"
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN 16: Video Game Framing */}
            {step === 16 && (
              <div className="space-y-6 text-center my-2">
                <h2 className="font-sans text-xl text-white font-normal">
                  Turn self-improvement into a video game
                </h2>

                {/* Game Card Interface Preview */}
                <div className="p-5 rounded-3xl bg-[#0B0B0E] border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.2)] max-w-xs mx-auto space-y-3 text-left font-mono">
                  <div className="font-serif text-xl text-white">Home.</div>
                  <div className="relative rounded-2xl overflow-hidden h-36 bg-slate-900 border border-white/10">
                    <img
                      src="https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80"
                      alt="character"
                      className="w-full h-full object-cover opacity-80"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end p-3 text-center">
                      <span className="text-xs text-blue-400 font-bold">Awakened Hunter</span>
                      <span className="font-serif text-lg text-white font-bold">Level 72</span>
                      <span className="text-[10px] text-cyan-300 font-bold uppercase">DIAMOND IV</span>
                    </div>
                  </div>

                  {/* Level XP Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-white/40">
                      <span>LVL 19</span>
                      <span>8.0 XP TO NEXT LEVEL</span>
                      <span>LVL 20</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 w-3/4" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN 17: Reach Your Full Potential (Level 100 Reveal) */}
            {step === 17 && (
              <div className="space-y-6 text-center my-2">
                <h2 className="font-sans text-xl text-white font-normal">
                  Reach your <span className="font-bold">full potential</span>
                </h2>

                <WolfAvatarSVG />

                <div>
                  <div className="font-serif text-xl text-white">Wolf</div>
                  <div className="font-sans font-bold text-2xl text-white">Level 100</div>
                  <div className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">
                    ASCENDANT I
                  </div>
                </div>

                {/* Level 100 Slider */}
                <div className="space-y-1 max-w-sm mx-auto">
                  <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden border border-white/40">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 w-full" />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-white/40">
                    <span>LV. 1</span>
                    <span>LV. 100</span>
                  </div>
                </div>

                {/* 6 Stat Badges Grid */}
                <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto font-mono text-xs">
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-green-500/40">
                    <div className="font-bold text-lg text-white">100</div>
                    <div className="text-[10px] text-green-400">Physical</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-blue-500/40">
                    <div className="font-bold text-lg text-white">100</div>
                    <div className="text-[10px] text-blue-400">Social</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-red-500/40">
                    <div className="font-bold text-lg text-white">100</div>
                    <div className="text-[10px] text-red-400">Discipline</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-amber-500/40">
                    <div className="font-bold text-lg text-white">100</div>
                    <div className="text-[10px] text-amber-400">Mental</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-orange-500/40">
                    <div className="font-bold text-lg text-white">100</div>
                    <div className="text-[10px] text-orange-400">Intellect</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-purple-500/40">
                    <div className="font-bold text-lg text-white">100</div>
                    <div className="text-[10px] text-purple-400">Ambition</div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN 18: Where You'll Be in 30 Days (Level 60 Reveal) */}
            {step === 18 && (
              <div className="space-y-6 text-center my-2">
                <h2 className="font-sans text-xl text-white font-normal">
                  Where you'll be in <span className="font-bold">30 days</span>
                </h2>

                <WolfAvatarSVG />

                <div>
                  <div className="font-serif text-xl text-white">German Shepherd</div>
                  <div className="font-sans font-bold text-2xl text-white">Level 60</div>
                  <div className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase">
                    DIAMOND I
                  </div>
                </div>

                {/* Level 60 Slider */}
                <div className="space-y-1 max-w-sm mx-auto">
                  <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden border border-white/40">
                    <div className="h-full bg-cyan-400 w-[60%]" />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-white/40">
                    <span>LV. 1</span>
                    <span>LV. 100</span>
                  </div>
                </div>

                {/* 6 Stat Badges Grid */}
                <div className="grid grid-cols-3 gap-2 max-w-sm mx-auto font-mono text-xs">
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-green-500/30">
                    <div className="font-bold text-lg text-white">58</div>
                    <div className="text-[10px] text-green-400">Physical</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-blue-500/30">
                    <div className="font-bold text-lg text-white">62</div>
                    <div className="text-[10px] text-blue-400">Social</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-red-500/30">
                    <div className="font-bold text-lg text-white">60</div>
                    <div className="text-[10px] text-red-400">Discipline</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-amber-500/30">
                    <div className="font-bold text-lg text-white">61</div>
                    <div className="text-[10px] text-amber-400">Mental</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-orange-500/30">
                    <div className="font-bold text-lg text-white">59</div>
                    <div className="text-[10px] text-orange-400">Intellect</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#0F1115] border border-purple-500/30">
                    <div className="font-bold text-lg text-white">60</div>
                    <div className="text-[10px] text-purple-400">Ambition</div>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN 19: Support Us with a Rating */}
            {step === 19 && (
              <div className="space-y-6 text-center my-2">
                <h2 className="font-serif text-2xl text-white">
                  Support us with a rating
                </h2>

                {/* Rating Laurel Wreath */}
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-2 text-2xl font-bold font-sans text-white">
                    <span>4.8</span>
                    <div className="flex text-white">★★★★★</div>
                  </div>
                  <span className="text-[10px] font-mono tracking-widest text-white/50 uppercase">
                    300K+ MEMBERS
                  </span>
                </div>

                <p className="text-xs text-white/70 font-sans">
                  SVJ was made for <span className="font-bold text-white">people just like you</span>
                </p>

                {/* Avatar Circles Row */}
                <div className="flex justify-center -space-x-2">
                  {['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
                    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
                    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&q=80',
                    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&q=80',
                    'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=100&q=80'
                  ].map((url, i) => (
                    <img key={i} src={url} alt="member" className="w-8 h-8 rounded-full border border-black object-cover" />
                  ))}
                </div>

                <div className="space-y-2.5 max-w-sm mx-auto text-left font-sans">
                  <div className="p-3.5 rounded-2xl bg-[#121215] border border-white/10 space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">dylan m</span>
                      <div className="flex text-amber-400 text-xs">★★★★★</div>
                    </div>
                    <span className="text-[10px] text-white/40 font-mono">25M in California</span>
                    <p className="text-xs text-white/80 pt-1">
                      "I used to waste a lot of time on my phone and never take action towards my goals but with SVJ I built healthy habits."
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#121215] border border-white/10 space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">michael h</span>
                      <div className="flex text-amber-400 text-xs">★★★★★</div>
                    </div>
                    <span className="text-[10px] text-white/40 font-mono">23M in New York</span>
                    <p className="text-xs text-white/80 pt-1">
                      "This app helped me build healthy and productive habits to get me out of my slump. Definitely download!"
                    </p>
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Full-width Glassy Bottom CONTINUE Button (Hidden on Step 1 since it's TAP TO CONTINUE) */}
        {step > 1 && (
          <div className="w-full max-w-md mx-auto pt-4 pb-2">
            <button
              type="button"
              onClick={nextStep}
              className="w-full py-3.5 rounded-2xl border-2 border-white/40 bg-white/10 hover:bg-white/20 active:scale-[0.99] text-white text-xs font-mono font-bold tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] cursor-pointer text-center"
            >
              {step === totalSteps ? 'FINISH & START PROGRAM' : 'CONTINUE'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
