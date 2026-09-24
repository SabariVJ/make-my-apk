import { useSyncExternalStore } from "react";

/**
 * SSR-safe media query hook (TanStack Start renders on the server, so we can
 * never touch window at module scope or during the first render).
 *
 * The server snapshot defaults to the desktop presentation; on phones the
 * components that use this render nothing until `open`, so there is no
 * visible hydration flash.
 */
export function useMediaQuery(query: string, serverFallback = true): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => serverFallback,
  );
}

/** True from 768px up — the cutoff between phone sheets and tablet dialogs. */
export function useIsTabletOrDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
