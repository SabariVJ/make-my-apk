import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { DailyPedometer } from "./dailyTracking";
import { stopNativeWorkout } from "./nativeWorkout";
import { activityRpcClient, stopLiveShare } from "./activityPlatform";

export async function stopTrackingBeforeSignOut(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await stopNativeWorkout();
    if (Capacitor.isPluginAvailable("VjPedometer")) {
      try {
        await DailyPedometer.disableDailyTracking();
      } catch (error) {
        if ((error as { code?: string })?.code !== "UNIMPLEMENTED") throw error;
      }
    }
  }
  const client = activityRpcClient();
  if (client && typeof navigator !== "undefined" && navigator.onLine) {
    const stopped = await stopLiveShare(client);
    if (!stopped.ok) throw new Error("Could not confirm sharing stopped.");
  }
}

/** App-level lifecycle; a tab crash or navigation never controls collection. */
export function installTrackingAccountWatcher(): () => void {
  if (!Capacitor.isNativePlatform() || !supabase?.auth) return () => {};
  let owner: string | null = null;
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const next = session?.user.id ?? null;
    if (
      event === "SIGNED_OUT" ||
      (event === "INITIAL_SESSION" && !next) ||
      (owner && owner !== next)
    ) {
      // Keep both journals/history; stop collection before another account opens.
      void Promise.allSettled([stopNativeWorkout(), DailyPedometer.disableDailyTracking()]);
    }
    owner = next;
  });
  return () => data.subscription.unsubscribe();
}
