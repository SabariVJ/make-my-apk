import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BatteryMedium, Clock, MapPin, Radio, Route as RouteIcon, ShieldCheck } from "lucide-react";
import { ActivityMap } from "../app/components/ActivityMap";
import { formatClock, formatDistance, GPS_ACTIVITY_LABELS, type TrackPoint } from "../app/lib/gpsActivity";
import {
  activityRpcClient,
  fetchPublicLiveShare,
  isLiveShareExpired,
  type LiveShare,
} from "../app/lib/activityPlatform";

const POLL_MS = 15_000;

export const Route = createFileRoute("/live/$token")({
  head: () => ({
    meta: [
      { title: "SVJ Live Share" },
      {
        name: "description",
        content: "Follow a live SVJ activity. No account or sign-in is required to view this link.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LiveSharePage,
});

type ViewState = "loading" | "active" | "ended";

function LiveSharePage() {
  const { token } = Route.useParams();
  const [view, setView] = useState<ViewState>("loading");
  const [share, setShare] = useState<LiveShare | null>(null);
  // Ticks locally so the elapsed time keeps moving between server polls.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const loadedAtRef = useRef(Date.now());

  useEffect(() => {
    const client = activityRpcClient();
    if (!client) {
      setView("ended");
      return;
    }
    let cancelled = false;

    const load = async () => {
      const next = await fetchPublicLiveShare(client, token);
      if (cancelled) return;
      if (!next.active || isLiveShareExpired(next)) {
        setShare(next);
        setView("ended");
        return;
      }
      setShare(next);
      loadedAtRef.current = Date.now();
      setView("active");
    };

    void load();
    const poll = window.setInterval(() => void load(), POLL_MS);
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [token]);

  const points: TrackPoint[] = useMemo(() => {
    if (share?.lastLat == null || share?.lastLng == null) return [];
    return [
      {
        lat: share.lastLat,
        lng: share.lastLng,
        t: 0,
        ele: null,
        accuracy: null,
        hr: null,
        cad: null,
        moving: true,
      },
    ];
  }, [share]);

  // Live elapsed = server value + time since this page last heard from it.
  const elapsedSeconds =
    view === "active" && share?.lastElapsedSeconds != null
      ? share.lastElapsedSeconds + Math.max(0, Math.round((nowMs - loadedAtRef.current) / 1000))
      : share?.lastElapsedSeconds ?? null;

  const label =
    share?.activityType && share.activityType in GPS_ACTIVITY_LABELS
      ? GPS_ACTIVITY_LABELS[share.activityType as keyof typeof GPS_ACTIVITY_LABELS]
      : "Activity";

  if (view === "loading") {
    return (
      <Shell>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#8C8C90]">
          Connecting to the live session…
        </p>
      </Shell>
    );
  }

  if (view === "ended") {
    return (
      <Shell>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#131316] p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <Radio className="h-6 w-6 text-[#8C8C90]" />
          </div>
          <h1 className="font-anton text-2xl uppercase tracking-wider text-[#F4F2ED]">
            Sharing has ended
          </h1>
          <p className="mt-3 font-mono text-xs leading-relaxed text-[#8C8C90]">
            This live share is finished, expired, or was stopped by the athlete. Nothing is being
            broadcast from this link anymore.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-md space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C81E3A] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#C81E3A]" />
            </span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[#C81E3A]">
              Live
            </span>
          </div>
          <span className="font-anton text-lg uppercase tracking-wider text-[#F4F2ED]">SVJ</span>
        </header>

        <section className="rounded-2xl border border-white/10 bg-[#131316] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#8C8C90]">Now</p>
          <h1 className="mt-1 font-anton text-3xl uppercase tracking-wide text-[#F4F2ED]">
            {share?.displayName?.trim() || label}
          </h1>
          {share?.displayName?.trim() ? (
            <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-[#8C8C90]">
              {label}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Elapsed">
              {formatClock(elapsedSeconds)}
            </Stat>
            <Stat icon={<RouteIcon className="h-3.5 w-3.5" />} label="Distance">
              {formatDistance(share?.lastDistanceMeters ?? null)}
            </Stat>
            <Stat icon={<MapPin className="h-3.5 w-3.5" />} label="Last fix">
              {relativeTime(share?.lastUpdateAt ?? null, nowMs)}
            </Stat>
            <Stat icon={<BatteryMedium className="h-3.5 w-3.5" />} label="Battery">
              {share?.batteryPercent != null ? `${share.batteryPercent}%` : "—"}
            </Stat>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#131316]">
          <ActivityMap
            points={points}
            height={220}
            variant="hero"
            showCurrentPosition
            emptyMessage="Waiting for the first location update."
          />
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#131316] p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8C8C90]" />
          <p className="font-mono text-[10px] leading-relaxed text-[#8C8C90]">
            Started {formatStarted(share?.startedAt)}. This link shows only a live position and
            expires {formatStarted(share?.expiresAt)}. It carries no account, sign-in or personal
            data, and the athlete can stop sharing at any moment.
          </p>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0B0C] px-5 py-10">
      {children}
    </div>
  );
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0B0B0C] p-3">
      <div className="flex items-center gap-1.5 text-[#8C8C90]">
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className="mt-1.5 font-anton text-xl tracking-wide text-[#F4F2ED]">{children}</p>
    </div>
  );
}

function relativeTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function formatStarted(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "—";
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
