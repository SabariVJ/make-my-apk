import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Crown, User, MapPin, Camera, Upload, Trash2, Mail, ShieldCheck } from 'lucide-react';
import { useSVJ } from '../context/SVJContext';

export const EditProfileModal: React.FC = () => {
  const { user, isEditProfileOpen, setIsEditProfileOpen, updateUserProfile, setIsGoogleAuthModalOpen } = useSVJ();

  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [bio, setBio] = useState(user.bio);
  const [location, setLocation] = useState(user.location || '');
  const [avatar, setAvatar] = useState(user.avatar);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isEditProfileOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size should be less than 10MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setAvatar(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile({
      name,
      username,
      bio,
      location,
      avatar
    });
    setIsEditProfileOpen(false);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-[#17171A] border border-white/10 rounded-2xl p-6 text-[#F4F2ED] shadow-2xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-[#C81E3A]" />
              <h2 className="font-anton text-xl tracking-wide uppercase text-white">
                Setup Profile
              </h2>
            </div>
            <button
              onClick={() => setIsEditProfileOpen(false)}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#8C8C90] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Profile Picture Upload Section */}
            <div className="flex flex-col items-center justify-center pb-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#C81E3A] p-0.5 bg-[#0B0B0C] shadow-lg shadow-[#C81E3A]/20">
                  <img
                    src={avatar}
                    alt="Profile Avatar"
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                >
                  <Camera className="w-6 h-6 text-[#C81E3A]" />
                  <span className="text-[10px] font-mono uppercase font-bold">Change</span>
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#C81E3A]" />
                  <span>Upload Photo from Device</span>
                </button>
                {avatar !== user.avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar(user.avatar)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                    title="Reset photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-inter text-sm focus:outline-none focus:border-[#C81E3A] transition-colors"
                required
              />
            </div>

            {/* Handle / Username */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                Handle / Username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-mono text-[#8C8C90]">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-[#C81E3A] transition-colors"
                  required
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                Bio & Motivation
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-inter text-sm focus:outline-none focus:border-[#C81E3A] transition-colors resize-none"
              />
            </div>

            {/* Equipped Aura Frame Selector */}
            <div className="p-3.5 rounded-xl bg-[#0B0B0C] border border-white/10 space-y-2">
              <label className="block text-[10px] font-mono text-[#8C8C90] uppercase flex items-center justify-between">
                <span>Profile Aura Frame</span>
                <span className="text-amber-400 font-bold">
                  {user.equippedFrame ? user.equippedFrame.replace('frame-', '').toUpperCase() : 'DEFAULT'}
                </span>
              </label>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: '', label: 'None', color: 'border-white/20' },
                  { id: 'frame-crimson', label: 'Crimson', color: 'border-[#C81E3A]' },
                  { id: 'frame-gold', label: 'Gold', color: 'border-amber-400' },
                  { id: 'frame-cyber', label: 'Cyber', color: 'border-cyan-400' },
                ].map(f => {
                  const isSelected = (user.equippedFrame || '') === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => updateUserProfile({ equippedFrame: f.id })}
                      className={`py-2 px-1 rounded-lg border text-[10px] font-mono font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                        isSelected
                          ? `${f.color} bg-white/10 text-white ring-1 ring-white/50`
                          : 'border-white/10 text-[#8C8C90] hover:text-white hover:border-white/30'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full border ${f.color}`} />
                      <span>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-mono text-[#8C8C90] uppercase mb-1">
                Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-[#8C8C90]" />
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Mumbai, India"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0B0B0C] border border-white/10 text-white font-inter text-sm focus:outline-none focus:border-[#C81E3A] transition-colors"
                />
              </div>
            </div>

            {/* Linked Gmail / Google Account Card */}
            <div className="p-3.5 rounded-xl bg-[#0B0B0C] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-[#8C8C90] flex items-center gap-1">
                  <Mail className="w-3 h-3 text-[#C81E3A]" />
                  Google / Gmail Cloud Account
                </span>
                {user.isFounder && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-mono font-bold flex items-center gap-1 border border-amber-500/30">
                    <Crown className="w-2.5 h-2.5" /> Founder Owner
                  </span>
                )}
              </div>

              {user.email ? (
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-white font-bold truncate">{user.email}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditProfileOpen(false);
                      setIsGoogleAuthModalOpen(true);
                    }}
                    className="text-[10px] text-[#C81E3A] hover:underline cursor-pointer"
                  >
                    Manage
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditProfileOpen(false);
                    setIsGoogleAuthModalOpen(true);
                  }}
                  className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Link Gmail for Cloud Sync</span>
                </button>
              )}
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-anton tracking-wider uppercase flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#C81E3A]/20 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
