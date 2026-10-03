import { useActivityOptional } from "../context/ActivityContext";
import { DailyPedometer } from "../lib/dailyTracking";
import { Capacitor } from "@capacitor/core";

export function StepTrackingStatus() {
  const activity = useActivityOptional();
  const daily = activity?.dailyTracking;
  if (!daily?.native) return null;
  const state = daily.state;
  return (
    <section
      className="min-w-0 rounded-2xl border border-white/10 bg-[#17171A] p-4 mb-4"
      aria-label="Step tracking status"
    >
      <h2 className="font-semibold">Step tracking status</h2>
      <p className="text-sm text-white/65 break-words" role="status">
        {daily.error ??
          (daily.waiting
            ? "Waiting for step sensor"
            : state?.enabled
              ? "Daily tracking enabled"
              : "Enable automatic daily steps")}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm my-3 min-w-0">
        <dt>Motion permission</dt>
        <dd className="break-words">{state?.permission ?? "Not checked"}</dd>
        <dt>Sensor</dt>
        <dd className="break-words">{state?.available ? state.source : "Unavailable"}</dd>
        <dt>Listening</dt>
        <dd>{state?.listening ? "Yes" : "No"}</dd>
        <dt>Today</dt>
        <dd>{activity?.todaySteps.toLocaleString() ?? "—"} steps</dd>
        <dt>Latest reading</dt>
        <dd>
          {state?.measurementAt ? new Date(state.measurementAt).toLocaleTimeString() : "Waiting"}
        </dd>
        <dt>Website sync</dt>
        <dd>
          {activity?.lastSyncedAt
            ? `Synced ${Math.max(0, Math.floor((Date.now() - activity.lastSyncedAt) / 1000))}s ago`
            : "Not synced yet"}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-xl border border-white/20 px-3 py-2"
          onClick={() => void (state?.enabled ? daily.disable() : daily.enable())}
        >
          {state?.enabled ? "Disable daily steps" : "Enable daily steps"}
        </button>
        <button
          className="rounded-xl border border-white/20 px-3 py-2"
          onClick={() => void daily.refresh()}
        >
          Retry
        </button>
        {Capacitor.getPlatform() === "android" && (
          <button
            className="rounded-xl border border-white/20 px-3 py-2"
            onClick={() => void daily.enableHealthFallback()}
          >
            Connect step history backup
          </button>
        )}
        <button
          className="rounded-xl border border-white/20 px-3 py-2"
          onClick={() => void DailyPedometer.openSettings().catch(() => undefined)}
        >
          Permissions
        </button>
      </div>
      <details className="mt-3 text-xs text-white/60">
        <summary>Sensor details</summary>
        <p>Raw count: {state?.raw ?? "Not available"}</p>
      </details>
    </section>
  );
}
