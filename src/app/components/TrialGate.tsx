import React, { useEffect, useRef, useState } from "react";
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
import { StatusScreen } from "./StatusScreen";
import {
  consumeIntentionalSignOut,
  isSessionExpiredError,
  markIntentionalSignOut,
  notifySessionExpired,
} from "@/app/lib/sessionExpired";
import { LogIn, RotateCw, ShieldAlert } from "lucide-react";

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
  // True once a real session has been seen, so an involuntary drop (expired
  // refresh token) can be told apart from a cold start with no session.
  const hadSession = useRef(false);
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
      // Sanitized: never log raw OAuth URLs which contain codes/tokens
      console.log("[SVJ] appUrlOpen fired");

      if (!url.includes("app.lovable.svj://auth/callback")) {
        console.warn("[SVJ] appUrlOpen URL did not match callback scheme/path");
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
        console.warn("[SVJ] OAuth provider returned an error");
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
          console.error("[SVJ] exchangeCodeForSession failed:", error?.message ?? "unknown");
          emitOAuthError(error.message);
        } else {
          console.info("[SVJ] PKCE exchange succeeded");
        }
      } else {
        // Legacy implicit flow fallback: tokens in the URL fragment.
        const access_token = fragParams.get("access_token");
        const refresh_token = fragParams.get("refresh_token");
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        } else {
          console.warn("[SVJ] OAuth deep link carried no code or tokens");
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
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // A session disappearing without the user asking is an expired/invalid
      // session, not a normal sign-out — raise the branded Session Expired
      // screen instead of silently dropping the user onto the login form.
      if (event === "SIGNED_OUT" && !nextSession && !consumeIntentionalSignOut()) {
        if (hadSession.current) notifySessionExpired();
      }
      if (nextSession) hadSession.current = true;
      setSession(nextSession);
      setSessionReady(true);
      queryClient.invalidateQueries({ queryKey: ["trial-status"] });
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) hadSession.current = true;
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
    // An expired/invalid session is not a server fault: route it to the
    // dedicated Session Expired screen with a single "Log in again" action.
    if (isSessionExpiredError(statusQuery.error)) {
      return (
        <StatusScreen
          testId="session-expired-screen"
          icon={LogIn}
          eyebrow="Session"
          title="Session Expired"
          message="Your signed-in session is no longer valid. Log in again to continue where you left off."
          primaryAction={{
            label: "Log in again",
            icon: LogIn,
            onClick: () => {
              void (async () => {
                markIntentionalSignOut();
                queryClient.clear();
                await supabase.auth.signOut().catch(() => undefined);
              })();
            },
          }}
        />
      );
    }

    return (
      <StatusScreen
        testId="membership-check-screen"
        icon={ShieldAlert}
        eyebrow="Membership"
        title="Could not verify your membership"
        message={
          statusQuery.error instanceof Error
            ? statusQuery.error.message
            : "Something went wrong while checking your account. Please retry."
        }
        primaryAction={{ label: "Retry", icon: RotateCw, onClick: () => statusQuery.refetch() }}
        secondaryAction={{
          label: "Sign out",
          onClick: () => {
            void (async () => {
              markIntentionalSignOut();
              queryClient.clear();
              await supabase.auth.signOut();
            })();
          },
        }}
      />
    );
  }

  const status = statusQuery.data;

  // Always pass the server-checked status to children so the app can mirror the
  // authoritative Plus state and conditionally render a restricted shell when
  // locked — never trust localStorage for entitlement.
  return <>{typeof children === "function" ? children(status) : children}</>;
};
