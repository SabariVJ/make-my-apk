import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, RefreshCw, Unlink } from "lucide-react";
import {
  disconnectStrava,
  getStravaSettings,
  startStravaConnect,
  syncStrava,
} from "@/lib/strava.functions";
import {
  DISCONNECTED_STRAVA_STATUS,
  normalizeStravaSync,
  type StravaStatus,
} from "@/lib/strava";

/**
 * Strava connection card.
 *
 * Only non-secret connection state is ever fetched: tokens live exclusively in
 * the server-side connection table. Sync is idempotent in the database, so a
 * retry after a network failure can never duplicate an activity or an XP award.
 */
export default function StravaConnectionCard() {
  const loadSettings = useServerFn(getStravaSettings);
  const connect = useServerFn(startStravaConnect);
  const sync = useServerFn(syncStrava);
  const disconnect = useServerFn(disconnectStrava);

  const [status, setStatus] = useState<StravaStatus>(DISCONNECTED_STRAVA_STATUS);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await loadSettings();
        if (cancelled) return;
        setConfigured(settings.configured);
        setStatus(settings.status);
      } catch {
        if (!cancelled) setError("Could not read your Strava connection.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  const onConnect = useCallback(async () => {
    setBusy("connect");
    setError(null);
    setNotice(null);
    try {
      const result = await connect();
      if ("url" in result && result.url) {
        window.location.href = result.url;
        return;
      }
      setError("error" in result && result.error ? result.error : "Could not start Strava.");
    } catch {
      setError("Could not start Strava. Please try again.");
    }
    setBusy(null);
  }, [connect]);

  const onSync = useCallback(async () => {
    setBusy("sync");
    setError(null);
    setNotice(null);
    try {
      const result = await sync();
      if ("error" in result && result.error) {
        setError(result.error);
        if (result.status) setStatus(result.status);
        return;
      }
      if (result.status) setStatus(result.status);
      const summary = normalizeStravaSync(result.summary);
      if (summary) {
        const added = summary.imported;
        setNotice(
          added > 0
            ? `${added} new ${added === 1 ? "activity" : "activities"} imported${
                summary.xpAwarded > 0 ? ` · ${summary.xpAwarded} XP` : ""
              }.`
            : "You are up to date — no new activities.",
        );
      }
    } catch {
      setError("Strava could not be reached. Your saved activities are unaffected.");
    }
    setBusy(null);
  }, [sync]);

  const onDisconnect = useCallback(async () => {
    setBusy("disconnect");
    setError(null);
    setNotice(null);
    try {
      const result = await disconnect();
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setStatus(DISCONNECTED_STRAVA_STATUS);
      setNotice("Strava disconnected. Your imported activities and XP are kept.");
    } catch {
      setError("Could not disconnect Strava. Please try again.");
    }
    setBusy(null);
  }, [disconnect]);

  return (
    <div className="rounded-3xl bg-[#17171A] border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-anton text-sm text-white uppercase tracking-wide flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[#FC4C02]" />
          Strava
        </h3>
        {status.connected && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
            Connected
          </span>
        )}
      </div>

      {!configured ? (
        <p className="text-xs text-[#8C8C90] leading-relaxed">
          Strava is not enabled on this deployment yet.
        </p>
      ) : status.connected ? (
        <>
          <div className="rounded-2xl bg-black/30 border border-white/5 p-3 space-y-1">
            <p className="text-sm text-white truncate">
              {status.athleteName ? status.athleteName : "Strava athlete"}
            </p>
            <p className="text-[10px] font-mono text-[#8C8C90]">
              {status.importedActivities} imported{" "}
              {status.importedActivities === 1 ? "activity" : "activities"}
              {status.lastSyncedAt
                ? ` · last sync ${new Date(status.lastSyncedAt).toLocaleDateString("en-GB")}`
                : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onSync()}
              disabled={busy !== null}
              className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[#F4F2ED] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} />
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              onClick={() => void onDisconnect()}
              disabled={busy !== null}
              className="py-3 px-4 rounded-xl border border-[#C81E3A]/40 bg-[#C81E3A]/10 hover:bg-[#C81E3A]/20 text-[#F4F2ED] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Unlink className="w-4 h-4" />
              {busy === "disconnect" ? "…" : "Disconnect"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-[#8C8C90] leading-relaxed">
            Import your Strava runs, rides and walks. Imported activities use the same
            server-verified XP and stat rules as in-app sessions.
          </p>
          <button
            type="button"
            onClick={() => void onConnect()}
            disabled={busy !== null}
            className="w-full py-3 rounded-xl bg-[#FC4C02] hover:bg-[#E04402] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Link2 className="w-4 h-4" />
            {busy === "connect" ? "Opening Strava…" : "Connect Strava"}
          </button>
        </>
      )}

      {error && (
        <p className="text-[10px] font-mono text-[#C81E3A]" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="text-[10px] font-mono text-[#8C8C90]">{notice}</p>}
    </div>
  );
}
