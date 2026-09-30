// Silent admin-role gate.
//
// The dashboard entry point exists in the UI only when the current user has a
// row in public.user_roles (RLS: users can read their own row; no one can read
// anyone else's). This is a cleanliness feature — RLS and the server-side
// role checks are the actual security boundary.
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AdminRoleState = { status: "loading" } | { status: "none" } | { status: "admin" };

/** True when the current session's user has an admin role row. */
export function useAdminRole(): AdminRoleState {
  const [state, setState] = useState<AdminRoleState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) {
        if (!cancelled) setState({ status: "none" });
        return;
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (cancelled) return;
      setState(data && !error ? { status: "admin" } : { status: "none" });
    };

    void check();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      setState({ status: "loading" });
      void check();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
