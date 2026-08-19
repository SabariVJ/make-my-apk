import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

/**
 * The custom URL scheme registered in capacitor.config.ts (appId: "app.lovable.svj").
 * Supabase will redirect here after Google OAuth completes on native.
 */
const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(
  /\/$/,
  "",
);

/** Broadcast channel used by the native deep-link handler to report OAuth failures. */
export const OAUTH_ERROR_EVENT = "svj:oauth-error";

export type GoogleAuthOutcome =
  | { status: "success" }
  | { status: "redirecting" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export function emitOAuthError(message: string) {
  window.dispatchEvent(new CustomEvent(OAUTH_ERROR_EVENT, { detail: message }));
}

function friendly(message?: string | null): string {
  const raw = (message ?? "").toLowerCase();
  if (!raw) return "Google sign-in did not complete. Please try again.";
  if (raw.includes("access_denied") || raw.includes("denied") || raw.includes("cancel")) {
    return "You cancelled Google sign-in. Try again when you are ready.";
  }
  if (raw.includes("network") || raw.includes("fetch")) {
    return "Network issue while contacting Google. Check your connection and retry.";
  }
  if (raw.includes("popup")) {
    return "The Google window was blocked or closed. Allow popups and try again.";
  }
  return message ?? "Google sign-in failed. Please try again.";
}

/**
 * Trigger Google OAuth.
 *
 * - Native (Android/iOS via Capacitor): uses skipBrowserRedirect + Capacitor Browser plugin
 *   so the system browser opens, completes OAuth, then deep-links back to the app.
 *   If the user dismisses the browser without finishing, we resolve as `cancelled`.
 * - Web: standard managed OAuth broker / redirect handled by Supabase.
 */
export async function signInWithGoogle(): Promise<GoogleAuthOutcome> {
  try {
    if (Capacitor.isNativePlatform()) {
      if (!PUBLIC_APP_URL || !PUBLIC_APP_URL.startsWith("https://")) {
        return {
          status: "error",
          message:
            "Native Google sign-in requires VITE_PUBLIC_APP_URL to be the final HTTPS production origin.",
        };
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          skipBrowserRedirect: true,
          redirectTo: `${PUBLIC_APP_URL}/auth/callback`,
        },
      });

      if (error) return { status: "error", message: friendly(error.message) };
      if (!data?.url) return { status: "error", message: friendly(null) };

      await Browser.open({ url: data.url, windowName: "_self" });

      // Wait for one of: session established, deep-link error, or the user
      // closing the in-app browser (= cancelled).
      return await new Promise<GoogleAuthOutcome>((resolve) => {
        let settled = false;
        const finish = (outcome: GoogleAuthOutcome) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(outcome);
        };

        const onError = (e: Event) => {
          finish({ status: "error", message: friendly((e as CustomEvent<string>).detail) });
        };
        window.addEventListener(OAUTH_ERROR_EVENT, onError);

        const finishedListener = Browser.addListener("browserFinished", () => {
          // The custom tab closed. That happens in two very different cases:
          //   1) The deep link landed and the appUrlOpen handler is STILL
          //      exchanging the PKCE code (a network round trip that routinely
          //      takes >600ms) — must NOT be reported as a cancellation.
          //   2) The user dismissed the tab without completing OAuth.
          // Poll getSession() over a generous window instead of a single
          // 600ms check, and only settle as "cancelled" if no session arrives
          // before the window closes.
          console.log("[SVJ] browserFinished — custom tab closed; polling for session…");
          const POLL_MS = 250;
          const WINDOW_MS = 10000;
          const deadline = Date.now() + WINDOW_MS;
          const poll = async () => {
            const { data: s } = await supabase.auth.getSession();
            if (s.session) {
              finish({ status: "success" });
              return;
            }
            if (Date.now() > deadline) {
              console.log(
                "[SVJ] browserFinished — no session within " +
                  WINDOW_MS +
                  "ms; treating as cancelled",
              );
              finish({ status: "cancelled" });
              return;
            }
            setTimeout(poll, POLL_MS);
          };
          void poll();
        });

        const cleanup = () => {
          window.removeEventListener(OAUTH_ERROR_EVENT, onError);
          finishedListener.then((l) => l.remove()).catch(() => {});
        };
      });
    }

    // Web: use the managed OAuth broker (works inside the preview iframe too).
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      return { status: "error", message: friendly((result.error as Error).message) };
    }
    if ((result as { redirected?: boolean }).redirected) return { status: "redirecting" };
    return { status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // Popup closed by the user surfaces as a thrown error in the web broker.
    if (/closed|cancel|abort/i.test(message)) return { status: "cancelled" };
    return { status: "error", message: friendly(message) };
  }
}
