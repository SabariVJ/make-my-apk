import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, CheckCircle2, ShieldCheck, Mail, Crown, LogOut, Loader2 } from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { signInWithGoogle } from "@/lib/googleAuth";
import { AvatarImage } from "./AvatarImage";

export const GoogleAuthModal: React.FC = () => {
  const { user, isGoogleAuthModalOpen, setIsGoogleAuthModalOpen, logoutGmail } = useSVJ();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [succeeded, setSucceeded] = useState(false);

  // ── Auth sync is handled centrally by SVJContext's unified onAuthStateChange
  // listener, which calls loginWithGmail for EVERY sign-in path (AuthScreen,
  // GoogleAuthModal, session restore). No per-modal listener is needed.

  // Reset transient state whenever the modal closes
  useEffect(() => {
    if (!isGoogleAuthModalOpen) {
      setBusy(false);
      setError("");
      setSucceeded(false);
    }
  }, [isGoogleAuthModalOpen]);

  if (!isGoogleAuthModalOpen) return null;

  const handleConnect = async () => {
    setError("");
    setBusy(true);
    const outcome = await signInWithGoogle();
    if (outcome.status === "redirecting") return; // page navigating away
    if (outcome.status === "cancelled") {
      setError("Google sign-in was cancelled. No problem — you can try again.");
      setBusy(false);
      return;
    }
    if (outcome.status === "error") {
      setError(outcome.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    // On native: busy stays true until the deep-link fires and onAuthStateChange above resolves it.
    // On web: the page navigates away immediately — no further action needed here.
  };

  const googleIcon = (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="svj-radius-card svj-elev-3 svj-lit-top relative w-full max-w-md overflow-hidden border border-white/10 bg-[#17171A] p-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow">
                {googleIcon}
              </div>
              <div>
                <h2 className="font-inter text-base font-semibold tracking-tight text-[#F4F2ED]">
                  Sign in with Google
                </h2>
                <p className="font-inter text-[11px] text-[#8C8C90]">accounts.google.com</p>
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
                    <AvatarImage
                      src={user.avatar}
                      name={user.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-[#C81E3A]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-inter text-sm font-semibold text-[#F4F2ED] truncate">
                          {user.name}
                        </span>
                        {user.isFounder && (
                          <span className="flex items-center gap-1 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/15 px-2 py-0.5 font-inter text-[10px] font-semibold text-[#C9A227]">
                            <Crown className="w-3 h-3" /> Founder
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 font-inter text-xs text-[#8C8C90] truncate">
                        <Mail className="w-3 h-3 shrink-0 text-[#E62846]" />
                        {user.email}
                      </div>
                    </div>
                  </div>

                  {user.isFounder ? (
                    <div className="flex items-center gap-2 svj-radius-row border border-[#C9A227]/20 bg-[#C9A227]/10 p-3 font-inter text-xs text-[#C9A227]">
                      <Crown className="w-4 h-4 shrink-0" />
                      <span>
                        Founder privileges are active — SVJ Plus, VIP status and unlimited perks are
                        unlocked automatically.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 svj-radius-row border border-emerald-500/20 bg-emerald-500/10 p-3 font-inter text-xs text-emerald-400">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>
                        Cloud sync is active. Your XP, challenges and progress are tied to{" "}
                        {user.email}.
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={logoutGmail}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 svj-radius-row border border-white/10 bg-white/5 py-2.5 font-inter text-xs font-semibold text-[#F4F2ED] transition-colors hover:bg-white/10"
                  >
                    <LogOut className="w-4 h-4 text-[#E62846]" />
                    Sign out / switch account
                  </button>
                  <button
                    onClick={() => setIsGoogleAuthModalOpen(false)}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 svj-radius-row bg-[#C81E3A] py-2.5 font-inter text-xs font-semibold text-white transition-colors hover:bg-[#A0182E]"
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
                  <h3 className="font-inter text-base font-semibold tracking-tight text-[#F4F2ED]">
                    Authentication successful
                  </h3>
                  <p className="mt-1 font-inter text-xs text-emerald-400">
                    Google account verified and cloud profile synced.
                  </p>
                </div>
                <button
                  onClick={() => setIsGoogleAuthModalOpen(false)}
                  className="w-full svj-radius-row cursor-pointer bg-[#C81E3A] py-2.5 font-inter text-xs font-semibold text-white transition-colors hover:bg-[#A0182E]"
                >
                  Return to the app
                </button>
              </div>
            ) : (
              /* ── Connect prompt ── */
              <div className="space-y-4">
                <p className="font-inter text-xs leading-relaxed text-[#8C8C90]">
                  Tap below to open a secure Google sign-in page. After you approve access, you'll
                  be brought straight back to SVJ with your account linked.
                </p>

                {error && (
                  <div className="space-y-2 svj-radius-row border border-[#C81E3A]/25 bg-[#C81E3A]/10 px-3 py-2">
                    <p className="font-inter text-[11px] text-[#E62846]">{error}</p>
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={busy}
                      className="cursor-pointer font-inter text-[11px] font-semibold text-[#F4F2ED] underline underline-offset-2 hover:text-[#E62846] disabled:opacity-60"
                    >
                      Try again
                    </button>
                  </div>
                )}

                <button
                  onClick={handleConnect}
                  disabled={busy}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 svj-radius-row bg-white py-3 font-inter text-xs font-semibold text-black transition-colors hover:bg-slate-200 disabled:opacity-60"
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

                <p className="text-center font-inter text-[11px] text-[#8C8C90]">
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
