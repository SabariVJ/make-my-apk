import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, Sparkles, MapPin, Check, Shield, Flame, Target, Trophy } from "lucide-react";
import { useSVJ } from "../context/SVJContext";

const PRESET_AVATARS = [
  {
    id: "av-1",
    url: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80",
    label: "Atlas",
  },
  {
    id: "av-2",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    label: "Aura",
  },
  {
    id: "av-3",
    url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
    label: "Titan",
  },
  {
    id: "av-4",
    url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
    label: "Apex",
  },
  {
    id: "av-5",
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
    label: "Zenith",
  },
  {
    id: "av-6",
    url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
    label: "Vanguard",
  },
];

const FOCUS_GOALS = [
  "🏋️ Physical Strength",
  "🧊 Cold Discipline",
  "🧠 Deep Focus & Reading",
  "🧘 Daily Mindfulness",
];

export const FirstTimeOnboardingModal: React.FC = () => {
  const { isFirstTimeOnboardingOpen, completeOnboarding, user } = useSVJ();

  const [name, setName] = useState(user.name !== "New Voyager" ? user.name : "");
  const [username, setUsername] = useState(user.username !== "initiate_svj" ? user.username : "");
  const [bio, setBio] = useState("Obsessed with 1% daily compound growth.");
  const [location, setLocation] = useState("New York, USA");
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0].url);
  const [selectedGoal, setSelectedGoal] = useState(FOCUS_GOALS[0]);

  if (!isFirstTimeOnboardingOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || "Initiate Member";
    const finalUsername = (username.trim() || "voyager_svj").toLowerCase().replace(/\s+/g, "_");

    completeOnboarding({
      name: finalName,
      username: finalUsername,
      bio: `${selectedGoal} • ${bio.trim() || "Daily discipline over motivation."}`,
      location: location.trim() || "Earth",
      avatar: selectedAvatar,
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-[#17171A] border-2 border-[#C81E3A]/50 rounded-3xl p-6 sm:p-8 text-[#F4F2ED] shadow-2xl shadow-[#C81E3A]/20 my-auto overflow-hidden"
        >
          {/* Ambient Lighting */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#C81E3A]/20 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

          {/* Top Banner */}
          <div className="relative z-10 text-center mb-6 space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/50 text-[#C81E3A] text-xs font-mono font-bold uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Welcome to SVJ Guild</span>
            </div>
            <h1 className="font-anton text-3xl sm:text-4xl text-white uppercase tracking-wide">
              Initialize Your Identity
            </h1>
            <p className="text-xs text-[#8C8C90] font-inter max-w-sm mx-auto leading-relaxed">
              Set up your personal member profile to start tracking daily challenges, earning XP,
              and climbing the global leaderboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
            {/* Avatar Selector */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-2">
                Choose Avatar Identity
              </label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_AVATARS.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setSelectedAvatar(av.url)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      selectedAvatar === av.url
                        ? "border-[#C81E3A] scale-105 shadow-lg shadow-[#C81E3A]/40"
                        : "border-white/10 opacity-60 hover:opacity-100 hover:border-white/30"
                    }`}
                  >
                    <img src={av.url} alt={av.label} className="w-full h-full object-cover" />
                    {selectedAvatar === av.url && (
                      <div className="absolute inset-0 bg-[#C81E3A]/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Display Name & Username Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                  Full Name / Display Title
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4 h-4 text-[#8C8C90]" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Victor Archer"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-inter text-sm focus:outline-none focus:border-[#C81E3A] transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                  Unique Handle
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-mono text-[#8C8C90]">
                    @
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                    placeholder="e.g. victor_svj"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-[#C81E3A] transition-colors"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Primary Focus Goal */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1.5">
                Primary Discipline Goal
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FOCUS_GOALS.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => setSelectedGoal(goal)}
                    className={`px-3 py-2 rounded-xl text-xs font-mono font-medium transition-all text-left cursor-pointer border ${
                      selectedGoal === goal
                        ? "bg-[#C81E3A] text-white border-[#C81E3A] shadow-md"
                        : "bg-[#0B0B0C] text-[#8C8C90] border-white/10 hover:text-white"
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                Personal Bio & Motto
              </label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Obsessed with 1% compound progress daily."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-inter text-sm focus:outline-none focus:border-[#C81E3A]"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                Location / Base
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-[#8C8C90]" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. London, UK or Mumbai, India"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-inter text-sm focus:outline-none focus:border-[#C81E3A]"
                />
              </div>
            </div>

            {/* Welcome Bonus Notice */}
            <div className="p-3 rounded-xl bg-[#C81E3A]/10 border border-[#C81E3A]/30 flex items-center justify-between text-xs font-mono">
              <span className="text-[#F4F2ED]">🎁 Welcome Bonus Included:</span>
              <span className="font-bold text-[#C81E3A]">+100 Initiation XP</span>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#E62846] to-[#C81E3A] hover:from-[#C81E3A] hover:to-[#A0182E] text-white font-anton text-lg tracking-wider uppercase flex items-center justify-center gap-2 shadow-xl shadow-[#C81E3A]/30 transition-all cursor-pointer transform hover:scale-[1.01]"
              >
                <Trophy className="w-5 h-5" />
                <span>Initialize Profile & Claim +100 XP</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
