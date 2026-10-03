import { useEffect } from "react";

export const SUPPORT_TICKET_REFRESH_OPTIONS = {
  refetchInterval: 15_000,
  refetchIntervalInBackground: false,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;

// React Query handles visibility changes; also refresh when a visible window regains focus.
export function useSupportTicketWindowFocus(refetch: () => Promise<unknown>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refetch]);
}
