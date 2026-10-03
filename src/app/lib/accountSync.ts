import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "./rewards";

/** Bind every request in a drain to one JWT; never borrow the next account's token. */
export async function withAccountRpcClient<T>(
  ownerId: string,
  work: (client: RpcClient) => Promise<T>,
  allowed: () => boolean = () => true,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const config = getSupabaseConfig();
  if (session?.user.id !== ownerId || !config.url || !config.publishableKey || !allowed())
    throw new Error("Sign in to the original account to sync.");
  const controller = new AbortController();
  const abortIfHidden = () => {
    if (document.hidden || !navigator.onLine) controller.abort();
  };
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
    if (next?.user.id !== ownerId) controller.abort();
  });
  document.addEventListener("visibilitychange", abortIfHidden);
  window.addEventListener("offline", abortIfHidden);
  try {
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${session.access_token}` },
        fetch: (input, init) => {
          if (!allowed() || document.hidden || !navigator.onLine || controller.signal.aborted)
            return Promise.reject(new Error("Sync paused. Your workout is retained."));
          return fetch(input, { ...init, signal: controller.signal });
        },
      },
    });
    return await work(client as unknown as RpcClient);
  } finally {
    controller.abort();
    subscription.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", abortIfHidden);
    window.removeEventListener("offline", abortIfHidden);
  }
}
