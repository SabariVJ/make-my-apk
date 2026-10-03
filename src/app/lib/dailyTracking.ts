import { Capacitor, registerPlugin } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { healthConnectPlugin, requestHealthConnectPermissions, hasGranted } from "./healthConnect";
import { appStorage } from "./storage";

export interface DailyTrackingState {
  version: number;
  ownerId: string;
  enabled: boolean;
  available: boolean;
  listening: boolean;
  permission: string;
  dateKey: string;
  steps: number;
  raw: number | null;
  measurementAt: number | null;
  source: string;
  error: string | null;
}

interface DailyBridge {
  enableDailyTracking(options: { ownerId: string }): Promise<DailyTrackingState>;
  disableDailyTracking(): Promise<DailyTrackingState>;
  getDailyState(options: { ownerId: string }): Promise<DailyTrackingState>;
  openSettings(): Promise<void>;
}

export const DailyPedometer = registerPlugin<DailyBridge>("VjPedometer");

export function localDateKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function validateDailyState(raw: DailyTrackingState, ownerId: string): DailyTrackingState {
  if (
    raw.version !== 2 ||
    raw.ownerId !== ownerId ||
    !Number.isSafeInteger(raw.steps) ||
    raw.steps < 0 ||
    typeof raw.enabled !== "boolean" ||
    typeof raw.available !== "boolean" ||
    typeof raw.listening !== "boolean" ||
    !["granted", "denied", "prompt", "unavailable"].includes(raw.permission) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.dateKey) ||
    typeof raw.source !== "string" ||
    (raw.measurementAt != null && (!Number.isFinite(raw.measurementAt) || raw.measurementAt <= 0))
  )
    throw new Error("Update the SVJ app to enable reliable daily tracking.");
  return {
    ...raw,
    raw: raw.raw != null && Number.isFinite(raw.raw) && raw.raw >= 0 ? raw.raw : null,
  };
}

/** Mounted with the account provider, never with an individual tab. */
export function useDailyTracking(ownerId: string | null) {
  const [state, setState] = useState<DailyTrackingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const owner = useRef(ownerId);
  owner.current = ownerId;
  const enabledAt = useRef(0);
  const native = Capacitor.isNativePlatform();
  const refresh = useCallback(async () => {
    if (!native || !ownerId || document.hidden) return;
    try {
      const next = validateDailyState(await DailyPedometer.getDailyState({ ownerId }), ownerId);
      if (
        Capacitor.getPlatform() === "android" &&
        appStorage.getItem(`svj.steps.health.${ownerId}`) === "enabled" &&
        (!next.available ||
          !next.listening ||
          !next.measurementAt ||
          Date.now() - next.measurementAt > 60_000) &&
        (await hasGranted("steps"))
      ) {
        const aggregate = await healthConnectPlugin()?.readDailySteps?.();
        if (
          aggregate &&
          aggregate.dateKey === localDateKey() &&
          Number.isSafeInteger(aggregate.steps) &&
          aggregate.steps >= 0
        ) {
          Object.assign(next, {
            steps: aggregate.steps,
            source: "Health Connect daily total",
            available: true,
            enabled: true,
            listening: false,
            measurementAt: aggregate.measurementAt,
            raw: null,
            permission: "granted",
            error: null,
          });
        }
      }
      if (owner.current !== ownerId) return;
      setState(next);
      setError(next.error);
      setWaiting(next.enabled && !next.measurementAt && Date.now() - enabledAt.current >= 10_000);
    } catch {
      if (owner.current === ownerId)
        setError("Update the SVJ app to use daily tracking, then try again.");
    }
  }, [native, ownerId]);

  useEffect(() => {
    setState(null);
    setError(null);
    if (!native) return;
    if (!ownerId) {
      void DailyPedometer.disableDailyTracking().catch(() => undefined);
      return;
    }
    enabledAt.current = Date.now();
    void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(onVisible, 3000);
    document.addEventListener("visibilitychange", onVisible);
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void listener.then((h) => h.remove()).catch(() => undefined);
    };
  }, [native, ownerId, refresh]);

  const enable = useCallback(async () => {
    if (!ownerId) return;
    setError(null);
    enabledAt.current = Date.now();
    try {
      const next = validateDailyState(
        await DailyPedometer.enableDailyTracking({ ownerId }),
        ownerId,
      );
      if (owner.current === ownerId) setState(next);
    } catch {
      if (owner.current === ownerId)
        setError("Could not enable daily steps. Check Motion permission in Settings and retry.");
    }
  }, [ownerId]);
  const disable = useCallback(async () => {
    try {
      await DailyPedometer.disableDailyTracking();
      if (ownerId) {
        const removed = appStorage.removeItem(`svj.steps.health.${ownerId}`);
        if (!removed.ok) throw new Error(removed.error);
      }
      await refresh();
    } catch {
      setError("Could not confirm tracking stopped. Open SVJ and try again.");
    }
  }, [refresh, ownerId]);
  const enableHealthFallback = useCallback(async () => {
    if (!ownerId) return;
    try {
      const permission = await requestHealthConnectPermissions(["steps"]);
      if (permission.steps !== "granted") throw new Error("Permission required");
      const saved = appStorage.setItem(`svj.steps.health.${ownerId}`, "enabled");
      if (!saved.ok) throw new Error(saved.error);
      await refresh();
    } catch {
      setError(
        "Health Connect step history is unavailable. Connect a supported source and allow Steps permission.",
      );
    }
  }, [ownerId, refresh]);
  return { state, error, waiting, enable, disable, refresh, native, enableHealthFallback };
}
