import { useEffect, useState } from "react";

/**
 * Tracks connectivity using the browser's online/offline events.
 *
 * Defaults to online: the app must never show a blocking "No connection"
 * screen before the first real signal (SSR or a browser without the API).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
      ? true
      : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    // Re-sync: an event may have fired before this effect mounted.
    setOnline(navigator.onLine !== false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
