import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { finishStravaConnection } from "@/lib/strava.functions";

// Strava redirects the browser here with ?code=...&state=... after the user
// approves (or ?error=access_denied when they decline).
//
// The exchange runs through an authenticated server function rather than this
// page, so the client secret and the returned tokens never reach the browser
// and the database derives identity from the signed-in session.
export const Route = createFileRoute("/strava/callback")({
  head: () => ({
    meta: [
      { title: "Connecting Strava — SVJ" },
      { name: "description", content: "Completing your Strava connection." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StravaCallback,
});

function StravaCallback() {
  const [message, setMessage] = useState("Connecting your Strava account…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const denied = params.get("error");

    if (denied || !code || !state) {
      window.location.replace("/?strava=denied");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const result = await finishStravaConnection({ data: { code, state } });
        if (cancelled) return;
        if (result.error) {
          setMessage(result.error);
          window.setTimeout(() => window.location.replace("/?strava=error"), 2000);
          return;
        }
        window.location.replace("/?strava=connected");
      } catch {
        if (cancelled) return;
        setMessage("We could not finish connecting Strava. Please try again.");
        window.setTimeout(() => window.location.replace("/?strava=error"), 2000);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center px-6">
      <p className="text-center text-sm text-[#8892A8]" role="status">
        {message}
      </p>
    </div>
  );
}
