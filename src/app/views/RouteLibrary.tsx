import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { ActivityMap } from "../components/ActivityMap";
import {
  activityRpcClient,
  deleteRoute,
  fetchRoutes,
  formatRouteElevation,
  formatRouteTime,
  plannedRouteSummary,
  routeToPoints,
  updateRoute,
  type RpcClient,
  type SavedRoute,
} from "../lib/activityPlatform";
import { formatDistance } from "../lib/gpsActivity";

/** Decode a stored route polyline into points the map renderer can draw. */
export function routePoints(route: Pick<SavedRoute, "polyline">) {
  return routeToPoints(route.polyline);
}

export interface RouteLibraryProps {
  client?: RpcClient | null;
  onStartRoute?: (route: SavedRoute) => void;
}

export const RouteLibrary: React.FC<RouteLibraryProps> = ({ client: injected, onStartRoute }) => {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  const client = injected ?? activityRpcClient();

  const load = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchRoutes(client);
    if (result.ok) {
      setRoutes(result.routes);
      setError(null);
    } else {
      setError(result.error ?? "Couldn't load your routes.");
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFavorite = async (route: SavedRoute) => {
    if (!client) return;
    setBusy(true);
    try {
      const result = await updateRoute(client, route.id, { favorite: !route.favorite });
      if (!result.ok) setError(result.error ?? "Couldn't update this route.");
      else setRoutes((current) => current.map((r) => (r.id === route.id ? result.route! : r)));
    } finally {
      setBusy(false);
    }
  };

  const rename = async (route: SavedRoute) => {
    if (!client) return;
    const name = draftName.trim();
    if (!name || name === route.name) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      const result = await updateRoute(client, route.id, { name });
      if (!result.ok) setError(result.error ?? "Couldn't rename this route.");
      else {
        setRoutes((current) => current.map((r) => (r.id === route.id ? result.route! : r)));
        setEditing(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (route: SavedRoute) => {
    if (!client) return;
    setBusy(true);
    try {
      const result = await deleteRoute(client, route.id);
      if (!result.ok) setError(result.error ?? "Couldn't delete this route.");
      else setRoutes((current) => current.filter((r) => r.id !== route.id));
    } finally {
      setBusy(false);
    }
  };

  if (!client) {
    return (
      <p className="text-[11px] font-mono text-[#8C8C90]">
        Sign in to save and reuse your SVJ routes.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="route-library">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-[#E62846]" />
          <span className="text-xs font-mono uppercase tracking-widest text-white">
            Route Library
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh routes"
          className="rounded-lg border border-white/10 bg-black/40 p-1.5 text-[#8C8C90] hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-crimson/30 bg-crimson/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
          <p className="flex-1 text-[11px] font-mono text-crimson">{error}</p>
        </div>
      )}

      {loading && routes.length === 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-black/40 p-4 text-[11px] font-mono text-[#8C8C90]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading routes…
        </div>
      )}

      {!loading && routes.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-[#0B0B0C] p-4 text-center">
          <Bookmark className="mx-auto mb-2 h-5 w-5 text-[#8C8C90]" />
          <p className="text-[11px] font-mono text-[#8C8C90]">
            No saved routes yet. Record a workout, open it, and use “Save as route”.
          </p>
        </div>
      )}

      {routes.map((route) => (
        <div
          key={route.id}
          className="overflow-hidden rounded-2xl border border-white/5 bg-[#0B0B0C]"
          data-testid="route-card"
        >
          <div className="flex items-center gap-2 p-3">
            <button
              type="button"
              onClick={() => void toggleFavorite(route)}
              disabled={busy}
              aria-label={route.favorite ? "Remove from favourites" : "Add to favourites"}
              className={`rounded-lg border p-1.5 ${
                route.favorite
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-white/10 text-[#8C8C90] hover:text-white"
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${route.favorite ? "fill-gold" : ""}`} />
            </button>

            <div className="min-w-0 flex-1">
              {editing === route.id ? (
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void rename(route);
                    if (event.key === "Escape") setEditing(null);
                  }}
                  autoFocus
                  aria-label="Route name"
                  className="w-full rounded-lg border border-[#C81E3A]/50 bg-black/60 px-2 py-1 text-[11px] font-mono text-white focus:outline-none"
                />
              ) : (
                <div className="truncate text-[12px] font-mono font-bold text-white">
                  {route.name}
                </div>
              )}
              <div className="text-[10px] font-mono text-[#8C8C90]" data-testid="route-subtitle">
                {routeCardSubtitle(route)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setExpanded(expanded === route.id ? null : route.id)}
              aria-label="Toggle route details"
              className="rounded-lg border border-white/10 p-1.5 text-[#8C8C90] hover:text-white"
            >
              {expanded === route.id ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {expanded === route.id && (
            <div className="space-y-3 border-t border-white/5 p-3">
              <ActivityMap
                points={routePoints(route)}
                bounds={route.bounds}
                height={190}
                emptyMessage="This route has no geometry."
              />
              <div className="flex flex-wrap gap-2">
                {onStartRoute && (
                  <button
                    type="button"
                    onClick={() => onStartRoute(route)}
                    data-testid="start-from-route"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#C81E3A]/50 bg-[#C81E3A]/15 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start workout
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditing(route.id);
                    setDraftName(route.name);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(route)}
                  data-testid="delete-route"
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-[#8C8C90] disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default RouteLibrary;

/** Route-card helpers re-exported for reuse by the recorder's guide banner. */
export { plannedRouteSummary, formatRouteElevation, formatRouteTime };

/** Distance/elevation line shown on a collapsed route card. */
export function routeCardSubtitle(route: SavedRoute): string {
  const parts = [route.activityType, formatDistance(route.distanceMeters)];
  if (route.elevationGainMeters != null) {
    parts.push(`+${formatRouteElevation(route.elevationGainMeters)}`);
  }
  return parts.join(" · ");
}
