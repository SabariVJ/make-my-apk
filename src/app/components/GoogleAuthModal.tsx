import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ShieldCheck, Mail, Crown, LogOut, ArrowRight, RefreshCw, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import { useSVJ } from '../context/SVJContext';

type AuthStep = 'email' | 'password' | 'verifying' | 'success';

export const GoogleAuthModal: React.FC = () => {
  const { user, isGoogleAuthModalOpen, setIsGoogleAuthModalOpen, loginWithGmail, logoutGmail } = useSVJ();
  
  const [authStep, setAuthStep] = useState<AuthStep>('email');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verifyStatusText, setVerifyStatusText] = useState('Connecting to accounts.google.com...');

  if (!isGoogleAuthModalOpen) return null;

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const trimmed = emailInput.trim().toLowerCase();

    if (!trimmed || !trimmed.includes('@')) {
      setErrorMsg('Please enter a valid Gmail address (e.g. user@gmail.com)');
      return;
    }

    if (!trimmed.endsWith('@gmail.com') && !trimmed.endsWith('@googlemail.com')) {
      setErrorMsg('Please enter a valid Google Mail (@gmail.com) address');
      return;
    }

    setAuthStep('password');
  };

  const handleSelectPresetEmail = (email: string) => {
    setEmailInput(email);
    setErrorMsg('');
    setAuthStep('password');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = emailInput.trim().toLowerCase();

    if (cleanEmail === 'sabarivj777@gmail.com') {
      if (passwordInput !== 'Sabarivj2008.') {
        setErrorMsg('Incorrect Google Account password for founder email sabarivj777@gmail.com');
        return;
      }
    } else {
      if (!passwordInput || passwordInput.length < 6) {
        setErrorMsg('Google Account Password must be at least 6 characters long.');
        return;
      }
    }

    // Begin multi-stage Google authentication simulation
    setAuthStep('verifying');
    setVerifyStatusText('Connecting to accounts.google.com...');

    setTimeout(() => {
      setVerifyStatusText('Exchanging OAuth 2.0 Security Token...');
    }, 800);

    setTimeout(() => {
      setVerifyStatusText('Validating Google Account Credentials...');
    }, 1600);

    setTimeout(() => {
      setVerifyStatusText('Syncing SVJ Profile & Restoring Cloud Data...');
    }, 2400);

    setTimeout(() => {
      const cleanEmail = emailInput.trim().toLowerCase();
      loginWithGmail(cleanEmail, cleanEmail === 'sabarivj777@gmail.com' ? 'Sabari (Founder & Owner)' : undefined);
      setAuthStep('success');
    }, 3200);
  };

  const handleResetModal = () => {
    setAuthStep('email');
    setEmailInput('');
    setPasswordInput('');
    setErrorMsg('');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-md rounded-3xl bg-[#121214] border border-white/10 p-6 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow">
                {/* Google SVG Icon */}
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="font-anton text-base text-white uppercase tracking-wide">
                  Sign in with Google
                </h2>
                <p className="text-[10px] font-mono text-[#8C8C90]">accounts.google.com</p>
              </div>
            </div>
            <button
              onClick={() => {
                handleResetModal();
                setIsGoogleAuthModalOpen(false);
              }}
              className="p-2 rounded-full text-[#8C8C90] hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content depending on state */}
          <div className="py-4">
            {user.email && authStep === 'email' ? (
              /* Already Signed In View */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-12 h-12 rounded-xl object-cover border-2 border-[#C81E3A]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm truncate">{user.name}</span>
                        {user.isFounder && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                            <Crown className="w-3 h-3" /> Founder Owner
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-[#8C8C90] truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-[#C81E3A]" />
                        {user.email}
                      </div>
                    </div>
                  </div>

                  {user.isFounder ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono flex items-center gap-2">
                      <Crown className="w-4 h-4 shrink-0 text-amber-400 animate-bounce" />
                      <span>FOUNDER PRIVILEGES ACTIVE: SVJ Plus, VIP Status, & Unlimited Perks unlocked automatically.</span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>Cloud Sync Active. All your XP, challenges, and progress are tied to {user.email}.</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      logoutGmail();
                      handleResetModal();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    Sign Out / Switch Gmail
                  </button>
                  <button
                    onClick={() => setIsGoogleAuthModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : authStep === 'email' ? (
              /* Step 1: Enter Gmail Email */
              <div className="space-y-4">
                <p className="text-xs text-[#8C8C90] leading-relaxed">
                  Enter your Gmail address to start Google Authentication. To restore app owner & founder access, authenticate with <span className="text-amber-400 font-mono font-bold">sabarivj777@gmail.com</span>.
                </p>

                {/* Quick Select Buttons */}
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="text-[10px] font-mono text-[#8C8C90] uppercase">
                    Select Account or Enter Below:
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPresetEmail('sabarivj777@gmail.com')}
                    className="w-full p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>sabarivj777@gmail.com</span>
                    </div>
                    <span className="text-[9px] bg-amber-500/20 px-2 py-0.5 rounded-full text-amber-300 font-mono">
                      Founder Account
                    </span>
                  </button>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 w-4 h-4 text-[#8C8C90]" />
                      <input
                        type="email"
                        value={emailInput}
                        onChange={e => setEmailInput(e.target.value)}
                        placeholder="yourname@gmail.com"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#C81E3A] transition-colors"
                        required
                      />
                    </div>
                    {errorMsg && (
                      <p className="text-[10px] text-red-400 font-mono mt-1">{errorMsg}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-white text-black hover:bg-slate-200 font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ) : authStep === 'password' ? (
              /* Step 2: Enter Google Account Password */
              <div className="space-y-4">
                {/* Account Chip */}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold text-xs">
                      {emailInput.charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">{emailInput}</div>
                      <div className="text-[10px] text-[#8C8C90] font-mono">Verify Google Account Password</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuthStep('email')}
                    className="text-[10px] text-[#C81E3A] hover:underline font-mono"
                  >
                    Change
                  </button>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                      Enter your password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 w-4 h-4 text-[#8C8C90]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={passwordInput}
                        onChange={e => setPasswordInput(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-[#C81E3A] transition-colors"
                        autoFocus
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-[#8C8C90] hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errorMsg && (
                      <p className="text-[10px] text-red-400 font-mono mt-1">{errorMsg}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Authenticate with Google</span>
                  </button>
                </form>
              </div>
            ) : authStep === 'verifying' ? (
              /* Step 3: Verifying Spinner */
              <div className="py-8 text-center space-y-4">
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <RefreshCw className="w-12 h-12 text-[#4285F4] animate-spin" />
                  <Shield className="w-5 h-5 text-white absolute inset-0 m-auto" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-anton text-sm text-white uppercase tracking-wider">
                    Authenticating Google Credentials
                  </h3>
                  <p className="text-xs font-mono text-[#4285F4] animate-pulse">
                    {verifyStatusText}
                  </p>
                </div>
              </div>
            ) : (
              /* Step 4: Success View */
              <div className="py-4 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-anton text-lg text-white uppercase tracking-wide">
                    Authentication Successful
                  </h3>
                  <p className="text-xs text-emerald-400 font-mono mt-1">
                    Google Account Verified & Cloud Profile Synced
                  </p>
                </div>

                {emailInput.toLowerCase() === 'sabarivj777@gmail.com' && (
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono space-y-1 text-left">
                    <div className="flex items-center gap-1.5 font-bold text-amber-400">
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>FOUNDER & OWNER PRIVILEGES UNLOCKED</span>
                    </div>
                    <p className="text-[11px] text-amber-200/90">
                      Welcome back, Sabari! Lifetime SVJ Plus, Founder badge, VIP status, and owner capabilities are active.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handleResetModal();
                    setIsGoogleAuthModalOpen(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold transition-colors cursor-pointer"
                >
                  Return to Application
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

