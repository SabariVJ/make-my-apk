// Shared Supabase RPC client for the Update 03 strength RPCs.
//
// Kept out of lib/strength.ts (which stays network-free and unit-testable) and
// out of the component files (so they only export components).
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";

export type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Null when the app has no backend configured (signed-out / web preview). */
export function strengthRpcClient(): RpcClient | null {
  if (!hasSupabaseConfig()) return null;
  // The Update 03 RPCs are not yet in the generated Database types.
  return supabase as unknown as RpcClient;
}
