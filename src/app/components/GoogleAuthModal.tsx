import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, ShieldCheck, Mail, Crown, LogOut, Loader2 } from 'lucide-react';
import { useSVJ } from '../context/SVJContext';
import { signInWithGoogle } from '@/lib/googleAuth';
import { supabase } from '@/integrations/supabase/client';

export const GoogleAuthModal: React.FC = () => {
  const { user, isGoogleAuthModalOpen, setIsGoogleAuthModalOpen, loginWithGmail, logoutGmail } =
    useSVJ();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [succeeded, setSucceeded] = useState(false);

  // Listen for Supabase auth state while the modal is open so we can react
  // when the OAuth callback completes (both native deep-link and web redirect).
  useEffect(() => {
    if (!isGoogleAuthModalOpen) return;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user?.email) {
        loginWithGmail(
          session.user.email,
          session.user.user_metadata?.full_name as string | undefined,
          session.user.user_metadata?.avatar_url as string | undefined,
        );
        setBusy(false);
        setSucceeded(true);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [isGoogleAuthModalOpen, loginWithGmail]);

  // Reset transient state whenever the modal closes
  useEffect(() => {
    if (!isGoogleAuthModalOpen) {
      setBusy(false);
      setError('');
      setSucceeded(false);
    }
  }, [isGoogleAuthModalOpen]);

  if (!isGoogleAuthModalOpen) return null;

  const handleConnect = async () => {
    setError('');
    setBusy(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setError(result.error.message || 'Google sign-in failed');
      setBusy(false);
    }
    // On native: busy stays true until the deep-link fires and onAuthStateChange above resolves it.
    // On web: the page navigates away immediately — no further action needed here.
  };

  const googleIcon = (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );

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
                {googleIcon}
              </div>
              <div>
                <h2 className="font-anton text-base text-white uppercase tracking-wide">
                  Sign in with Google
                </h2>
                <p className="text-[10px] font-mono text-[#8C8C90]">accounts.google.com</p>
              </div>
            </div>
            <button
              onClick={() => setIsGoogleAuthModalOpen(false)}
              className="p-2 rounded-full text-[#8C8C90] hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="py-4">
            {/* ── Already signed in ── */}
            {user.email ? (
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
                    onClick={logoutGmail}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    Sign Out / Switch Account
                  </button>
                  <button
                    onClick={() => setIsGoogleAuthModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : succeeded ? (
              /* ── OAuth just succeeded ── */
              <div className="py-4 text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-anton text-lg text-white uppercase tracking-wide">
                    Authentication Successful
                  </h3>
                  <p className="text-xs text-emerald-400 font-mono mt-1">
                    Google Account verified & cloud profile synced
                  </p>
                </div>
                <button
                  onClick={() => setIsGoogleAuthModalOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold transition-colors cursor-pointer"
                >
                  Return to Application
                </button>
              </div>
            ) : (
              /* ── Connect prompt ── */
              <div className="space-y-4">
                <p className="text-xs text-[#8C8C90] leading-relaxed">
                  Tap below to open a secure Google sign-in page. After you approve access, you'll be
                  brought straight back to SVJ with your account linked.
                </p>

                {error && (
                  <p className="text-[11px] text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  onClick={handleConnect}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-white text-black hover:bg-slate-200 font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Opening Google…
                    </>
                  ) : (
                    <>
                      {googleIcon}
                      Continue with Google
                    </>
                  )}
                </button>

                <p className="text-[10px] text-center font-mono text-[#8C8C90]">
                  You'll be redirected to Google's secure login page.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
