import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { getTrialStatus, type TrialStatus } from "@/lib/trial.functions";
import { emitOAuthError } from "@/lib/googleAuth";
import { AuthScreen } from "./AuthScreen";

const Splash: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-6 h-6 animate-spin text-[#C81E3A]" />
    <p className="text-[11px] font-mono text-[#8C8C90] uppercase tracking-wider">{label}</p>
  </div>
);

const TRIAL_CHECK_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out while checking your membership. Please retry.")),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export const TrialGate: React.FC<{
  children: React.ReactNode | ((status: TrialStatus) => React.ReactNode);
}> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const queryClient = useQueryClient();

  const fetchStatus = useServerFn(getTrialStatus);

  // ── Native deep-link handler ──────────────────────────────────────────────
  // When Google OAuth completes on Android/iOS it redirects to:
  //   app.lovable.svj://auth/callback?code=...&state=...   (PKCE, default)
  //   app.lovable.svj://auth/callback#access_token=...      (legacy implicit)
  // We extract the PKCE `code` and exchange it on the SAME `supabase` client
  // that started signInWithOAuth (so the stored PKCE code_verifier matches),
  // then close the in-app browser opened by the Capacitor Browser plugin.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      console.log("[SVJ] deep-link effect skipped (not a native platform)");
      return;
    }
    console.log("[SVJ] deep-link effect mounted; registering appUrlOpen listener (native)");

    const listener = CapApp.addListener("appUrlOpen", async ({ url }) => {
      console.log("[SVJ] appUrlOpen fired — raw URL:", url);

      if (!url.includes("app.lovable.svj://auth/callback")) {
        console.warn("[SVJ] appUrlOpen URL did not match callback scheme/path:", url);
        return;
      }

      // Provider/Supabase errors come back as query or fragment params.
      const query = new URLSearchParams(url.split("?")[1]?.split("#")[0] ?? "");
      const fragParams = new URLSearchParams(url.split("#")[1] ?? "");
      const oauthError =
        query.get("error_description") ||
        query.get("error") ||
        fragParams.get("error_description") ||
        fragParams.get("error");

      if (oauthError) {
        console.warn("[SVJ] OAuth provider returned an error:", oauthError);
        emitOAuthError(oauthError);
        await Browser.close();
        return;
      }

      // PKCE: the code can arrive in the query (hosted /auth/callback forwards
      // window.location.search) or in the fragment — check both.
      const code = query.get("code") ?? fragParams.get("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // Log the REAL error object (PKCE verifier mismatch, invalid grant, …)
          // so native logcat shows the actual failure, not just the UI message.
          console.error("[SVJ] exchangeCodeForSession failed:", error);
          emitOAuthError(error.message);
        } else {
          console.info("[SVJ] PKCE exchange succeeded for user:", data.user?.id);
        }
      } else {
        // Legacy implicit flow fallback: tokens in the URL fragment.
        const access_token = fragParams.get("access_token");
        const refresh_token = fragParams.get("refresh_token");
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        } else {
          const keys = Array.from(new Set([...query.keys(), ...fragParams.keys()]));
          console.warn(
            `[SVJ] OAuth deep link carried no code or tokens (params: ${keys.join(", ") || "none"})`,
          );
          emitOAuthError("Google sign-in did not return a session. Please try again.");
        }
      }

      // Dismiss the in-app browser window
      await Browser.close();
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, []);

  // ── Supabase auth state ───────────────────────────────────────────────────
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionReady(true);
      queryClient.invalidateQueries({ queryKey: ["trial-status"] });
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setSessionReady(true);
      })
      .catch(() => setSessionReady(true));

    // Never hang on the splash if Supabase never answers.
    const failsafe = setTimeout(() => setSessionReady(true), TRIAL_CHECK_TIMEOUT_MS);

    return () => {
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id ?? null;

  const statusQuery = useQuery({
    queryKey: ["trial-status", userId],
    queryFn: () =>
      withTimeout(
        fetchStatus({}) as Promise<Awaited<ReturnType<typeof fetchStatus>>>,
        TRIAL_CHECK_TIMEOUT_MS,
      ),
    enabled: Boolean(userId),
    // Re-checked on every app open, tab focus and reconnect — never cached stale.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });

  if (!sessionReady) return <Splash label="Loading SVJ" />;
  if (!session) return <AuthScreen />;
  if (statusQuery.isPending) return <Splash label="Checking your trial" />;

  if (statusQuery.isError) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] text-[#F4F2ED] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-anton uppercase tracking-wider">Could not verify your membership</p>
        <p className="text-[11px] font-mono text-[#8C8C90] max-w-xs">
          {statusQuery.error instanceof Error ? statusQuery.error.message : "Something went wrong."}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => statusQuery.refetch()}
            className="px-4 py-2 rounded-xl bg-[#C81E3A] text-white font-mono text-xs cursor-pointer"
          >
            Retry
          </button>
          <button
            onClick={async () => {
              queryClient.clear();
              await supabase.auth.signOut();
            }}
            className="px-4 py-2 rounded-xl border border-white/15 text-white font-mono text-xs cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const status = statusQuery.data;

  // Always pass the server-checked status to children so the app can mirror the
  // authoritative Plus state and conditionally render a restricted shell when
  // locked — never trust localStorage for entitlement.
  return <>{typeof children === "function" ? children(status) : children}</>;
};
