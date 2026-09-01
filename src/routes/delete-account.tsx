import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount, requestDeletionChallenge } from "@/lib/account.functions";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete Account — SVJ" },
      { name: "description", content: "Permanently delete your SVJ account and data." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"check" | "login" | "confirm">("check");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  // On mount, check session and request a challenge token if signed in.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // Request a deletion challenge from the server (proves recent auth)
        try {
          const res = await requestDeletionChallenge();
          setChallengeToken(res.challengeToken);
          setStep("confirm");
        } catch {
          // Challenge failed — show login instead
          setStep("login");
        }
      } else {
        setStep("login");
      }
    })();
  }, []);

  const handleReauthEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setResult({ ok: false, message: "Invalid email or password. Please try again." });
        return;
      }

      // After successful reauth, request a fresh challenge token
      try {
        const res = await requestDeletionChallenge();
        setChallengeToken(res.challengeToken);
        setStep("confirm");
      } catch {
        setResult({ ok: false, message: "Failed to verify session. Please try again." });
      }
    } catch {
      setResult({ ok: false, message: "Connection error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleReauthGoogle = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/delete-account",
        },
      });
      if (error) {
        setResult({ ok: false, message: error.message || "Google sign-in failed." });
        setLoading(false);
      }
      // On success the browser redirects to Google and back;
      // the mount useEffect will detect the session and request a challenge.
    } catch {
      setResult({ ok: false, message: "Google sign-in failed. Please try again." });
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) {
      setResult({ ok: false, message: "Missing challenge token. Please refresh and try again." });
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const res = await deleteAccount({ data: { confirmation, challengeToken } });
      setResult(res);

      if (res.ok) {
        await supabase.auth.signOut();
      }
    } catch {
      setResult({ ok: false, message: "Connection error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  if (result?.ok) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Trash2 className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="font-anton text-2xl uppercase tracking-wider">Account Deleted</h1>
        <p className="text-sm text-[#8C8C90] max-w-sm font-mono">
          Your account and all associated data have been removed.
        </p>
        <a
          href="/"
          className="mt-4 px-6 py-3 rounded-xl bg-[#C81E3A] text-white font-mono text-xs font-bold uppercase tracking-wider"
        >
          Return to Home
        </a>
      </div>
    );
  }

  if (step === "check") {
    return (
      <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#C81E3A]" />
        <p className="text-[11px] font-mono text-[#8C8C90] uppercase tracking-wider">
          Checking session…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-4 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-[#C81E3A]/20 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-[#C81E3A]" />
          </div>
          <h1 className="font-anton text-2xl uppercase tracking-wider">Delete Account</h1>
          <p className="text-xs text-[#8C8C90] font-mono leading-relaxed">
            This action is permanent. All your data, including profile, challenge progress, XP, and
            rewards will be removed. Some data may persist briefly in automated backups before being
            purged.
          </p>
        </div>

        {step === "login" ? (
          <>
            <form onSubmit={handleReauthEmail} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-xl bg-[#17171A] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#C81E3A]"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#8C8C90] uppercase mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded-xl bg-[#17171A] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[#C81E3A]"
                  placeholder="••••••••"
                />
              </div>

              {result && !result.ok && (
                <p className="text-xs text-[#C81E3A] font-mono">{result.message}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Continue
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#0B0B0C] px-3 text-[#8C8C90] font-mono">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleReauthGoogle()}
              disabled={loading}
              className="w-full py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Continue with Google
            </button>

            <a
              href="/"
              className="block text-center text-xs text-[#8C8C90] hover:text-white font-mono"
            >
              Cancel
            </a>
          </>
        ) : (
          <form onSubmit={handleDelete} className="space-y-4">
            <div className="p-4 rounded-xl bg-[#C81E3A]/10 border border-[#C81E3A]/30">
              <p className="text-xs text-[#C81E3A] font-mono font-bold uppercase">
                Type DELETE to confirm
              </p>
              <p className="text-[10px] text-[#8C8C90] font-mono mt-1">
                This is your final confirmation. Your account will be permanently erased.
              </p>
            </div>

            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-[#17171A] border border-[#C81E3A]/30 text-white text-sm font-mono text-center tracking-widest uppercase focus:outline-none focus:border-[#C81E3A]"
              placeholder="DELETE"
            />

            {result && !result.ok && (
              <p className="text-xs text-[#C81E3A] font-mono">{result.message}</p>
            )}

            <button
              type="submit"
              disabled={loading || confirmation.toUpperCase() !== "DELETE" || !challengeToken}
              className="w-full py-3 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Permanently Delete Account
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("login");
                setConfirmation("");
                setResult(null);
                setChallengeToken(null);
              }}
              className="w-full text-center text-xs text-[#8C8C90] hover:text-white font-mono"
            >
              Go back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
