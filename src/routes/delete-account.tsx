import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount } from "@/lib/account.functions";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { markIntentionalSignOut } from "@/app/lib/sessionExpired";

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

/**
 * Exported so `/data-deletion` can render the identical flow. Play Console asks
 * for a "data deletion" URL while the app links to `/delete-account`; both paths
 * must reach the same deliberate, re-authenticated deletion screen.
 */
export function DeleteAccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"check" | "login" | "confirm">("check");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // On mount, check if the user has an active session.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setStep("confirm");
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

      setStep("confirm");
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
      // the mount useEffect will detect the session.
    } catch {
      setResult({ ok: false, message: "Google sign-in failed. Please try again." });
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await deleteAccount({ data: { confirmation } });
      setResult(res);

      if (res.ok) {
        markIntentionalSignOut();
        await supabase.auth.signOut();
      }
    } catch {
      setResult({ ok: false, message: "Connection error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const fieldLabel = "block font-inter text-[11px] font-medium text-[#8C8C90] mb-1.5";

  if (result?.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0B0B0C] p-6 text-center text-[#F4F2ED]">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
          <Trash2 className="h-8 w-8 text-emerald-400" />
        </div>
        <h1 className="font-inter text-2xl font-semibold tracking-tight">Account deleted</h1>
        <p className="max-w-sm font-inter text-sm text-[#8C8C90]">
          Your account has been removed. Some data may persist briefly in automated backups before
          being purged.
        </p>
        <a
          href="/"
          className="mt-4 svj-radius-row bg-[#C81E3A] px-6 py-3 font-inter text-xs font-semibold text-white transition-colors hover:bg-[#A0182E]"
        >
          Return home
        </a>
      </div>
    );
  }

  if (step === "check") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0B0B0C] text-[#F4F2ED]">
        <Loader2 className="h-6 w-6 animate-spin text-[#C81E3A]" />
        <p className="font-inter text-[11px] text-[#8C8C90]">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0B0B0C] p-6 text-[#F4F2ED]">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#C81E3A]/20">
            <AlertTriangle className="h-8 w-8 text-[#C81E3A]" />
          </div>
          <h1 className="font-inter text-2xl font-semibold tracking-tight">Delete account</h1>
          <p className="font-inter text-xs leading-relaxed text-[#8C8C90]">
            This action is permanent. All your data, including profile, challenge progress, XP, and
            rewards will be removed.
          </p>
        </div>

        {step === "login" ? (
          <>
            <form onSubmit={handleReauthEmail} className="space-y-4">
              <div>
                <label htmlFor="delete-email" className={fieldLabel}>
                  Email
                </label>
                <input
                  id="delete-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full svj-radius-row border border-white/10 bg-[#17171A] px-4 py-3 font-inter text-sm text-[#F4F2ED] focus:border-[#C81E3A] focus:outline-none"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label htmlFor="delete-password" className={fieldLabel}>
                  Password
                </label>
                <input
                  id="delete-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full svj-radius-row border border-white/10 bg-[#17171A] px-4 py-3 font-inter text-sm text-[#F4F2ED] focus:border-[#C81E3A] focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              {result && !result.ok && (
                <p className="font-inter text-xs text-[#E62846]">{result.message}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="flex w-full cursor-pointer items-center justify-center gap-2 svj-radius-row bg-[#C81E3A] py-3 font-inter text-xs font-semibold text-white transition-colors hover:bg-[#A0182E] disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#0B0B0C] px-3 font-inter text-[#8C8C90]">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleReauthGoogle()}
              disabled={loading}
              className="flex w-full cursor-pointer items-center justify-center gap-2 svj-radius-row border border-white/15 bg-white/5 py-3 font-inter text-xs font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue with Google
            </button>

            <a
              href="/"
              className="block text-center font-inter text-xs text-[#8C8C90] transition-colors hover:text-[#F4F2ED]"
            >
              Cancel
            </a>
          </>
        ) : (
          <form onSubmit={handleDelete} className="space-y-4">
            <div className="svj-radius-row border border-[#C81E3A]/30 bg-[#C81E3A]/10 p-4">
              <p className="font-inter text-xs font-semibold text-[#E62846]">
                Type DELETE to confirm
              </p>
              <p className="mt-1 font-inter text-[11px] text-[#8C8C90]">
                This is your final confirmation. Your account will be permanently erased.
              </p>
            </div>

            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              aria-label="Type DELETE to confirm"
              className="w-full svj-radius-row border border-[#C81E3A]/30 bg-[#17171A] px-4 py-3 text-center font-mono text-sm tracking-widest text-[#F4F2ED] uppercase focus:border-[#C81E3A] focus:outline-none"
              placeholder="DELETE"
            />

            {result && !result.ok && (
              <p className="font-inter text-xs text-[#E62846]">{result.message}</p>
            )}

            <button
              type="submit"
              disabled={loading || confirmation.toUpperCase() !== "DELETE"}
              className="flex w-full cursor-pointer items-center justify-center gap-2 svj-radius-row bg-[#C81E3A] py-3 font-inter text-xs font-semibold text-white transition-colors hover:bg-[#A0182E] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Permanently delete account
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("login");
                setConfirmation("");
                setResult(null);
              }}
              className="w-full text-center font-inter text-xs text-[#8C8C90] transition-colors hover:text-[#F4F2ED]"
            >
              Go back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
