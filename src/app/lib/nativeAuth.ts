import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";
import { emitOAuthError } from "@/lib/googleAuth";

/** Handles both a running app and an OAuth callback that launches the app. */
export function installNativeAuthCallbacks(): () => void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("App")) return () => {};
  let disposed = false;
  const handled = new Set<string>();
  const receive = async ({ url }: { url: string }) => {
    if (disposed || handled.has(url)) return;
    let callback: URL;
    try {
      callback = new URL(url);
    } catch {
      return;
    }
    if (
      callback.protocol !== "app.lovable.svj:" ||
      callback.hostname !== "auth" ||
      callback.pathname !== "/callback"
    )
      return;
    handled.add(url);
    const query = callback.searchParams;
    const fragment = new URLSearchParams(callback.hash.slice(1));
    try {
      const providerError =
        query.get("error_description") ||
        query.get("error") ||
        fragment.get("error_description") ||
        fragment.get("error");
      if (providerError) throw new Error(providerError);
      const code = query.get("code") ?? fragment.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else {
        const access_token = fragment.get("access_token");
        const refresh_token = fragment.get("refresh_token");
        if (!access_token || !refresh_token) {
          throw new Error("Google sign-in did not return a session. Please try again.");
        }
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
      }
    } catch (error) {
      if (!disposed)
        emitOAuthError(error instanceof Error ? error.message : "Sign-in failed. Please retry.");
    } finally {
      if (Capacitor.isPluginAvailable("Browser")) await Browser.close().catch(() => undefined);
    }
  };
  const listener = App.addListener("appUrlOpen", (event) => {
    void receive(event);
  });
  // Register first so a callback arriving while launch information is read is
  // not lost. The URL is deduplicated before exchanging its single-use code.
  void listener
    .then(async () => {
      if (disposed) return;
      const launch = await App.getLaunchUrl();
      if (launch) await receive(launch);
    })
    .catch(() => undefined);
  return () => {
    disposed = true;
    void listener.then((handle) => handle.remove()).catch(() => undefined);
  };
}
