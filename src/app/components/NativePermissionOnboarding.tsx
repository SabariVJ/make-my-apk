import React, { useEffect, useMemo, useState } from "react";
import { Activity, Bell, Bluetooth, HeartPulse, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useSVJ } from "../context/SVJContext";
import { vjRequestPermissions } from "../lib/vj-pedometer";
import {
  loadNotificationPreferences,
  requestNotificationPermission,
  saveNotificationPreferences,
} from "../lib/notifications";
import { requestHealthConnectPermissions } from "../lib/healthConnect";
import { requestWorkoutPermissions } from "../lib/nativeWorkout";
import { isNativeWearableAvailable, VjWearable } from "../lib/wearable";

type PermissionStep = "activity" | "notifications" | "health" | "location" | "nearby";

const STEP_COPY: Record<
  PermissionStep,
  {
    title: string;
    description: string;
    detail: string;
    Icon: typeof Activity;
  }
> = {
  activity: {
    title: "Physical activity",
    description: "Track real steps and movement with your device sensors.",
    detail:
      "Used by Activity tracking and progress. SVJ only counts while its tracking flow is active.",
    Icon: Activity,
  },
  notifications: {
    title: "Notifications",
    description: "Receive training, recovery, progress and membership reminders.",
    detail: "You control every notification category and can pause them later.",
    Icon: Bell,
  },
  health: {
    title: "Health & fitness",
    description: "Connect selected Health Connect fitness records to SVJ.",
    detail: "SVJ requests only the supported read-only fitness record types used by the app.",
    Icon: HeartPulse,
  },
  location: {
    title: "Location",
    description: "Record GPS routes, distance and outdoor activity.",
    detail: "Location is collected only when you explicitly start a GPS workout.",
    Icon: MapPin,
  },
  nearby: {
    title: "Nearby devices",
    description: "Connect Bluetooth heart-rate sensors and supported wearables.",
    detail: "Used only when scanning for or connecting to a nearby fitness device.",
    Icon: Bluetooth,
  },
};

const STEPS: PermissionStep[] = ["activity", "notifications", "health", "location", "nearby"];

function storageKey(userId: string) {
  return "svj_native_permission_onboarding_v1:" + (userId || "anonymous");
}

export const NativePermissionOnboarding: React.FC = () => {
  const { user } = useSVJ();
  const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!nativeAndroid || !user.id || typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey(user.id)) !== "done") {
        setOpen(true);
        setIndex(0);
        setResult(null);
      }
    } catch {
      setOpen(true);
    }
  }, [nativeAndroid, user.id]);

  const step = STEPS[index] ?? STEPS[STEPS.length - 1];
  const copy = STEP_COPY[step];
  const Icon = copy.Icon;
  const progress = useMemo(
    () => String(Math.min(index + 1, STEPS.length)) + " / " + String(STEPS.length),
    [index],
  );

  if (!nativeAndroid || !open) return null;

  const finish = () => {
    try {
      window.localStorage.setItem(storageKey(user.id), "done");
    } catch {
      // Best effort only.
    }
    setOpen(false);
  };

  const advance = () => {
    setResult(null);
    if (index >= STEPS.length - 1) finish();
    else setIndex((current) => current + 1);
  };

  const requestCurrent = async () => {
    setBusy(true);
    setResult(null);
    let granted = false;
    try {
      if (step === "activity") {
        granted = (await vjRequestPermissions())?.activityRecognition === "granted";
      } else if (step === "notifications") {
        granted = await requestNotificationPermission();
        if (granted) {
          const current = loadNotificationPreferences(user.id);
          saveNotificationPreferences(user.id, { ...current, enabled: true });
        }
      } else if (step === "health") {
        const permissions = await requestHealthConnectPermissions();
        granted = Object.values(permissions).some((value) => value === "granted");
      } else if (step === "location") {
        granted = (await requestWorkoutPermissions()).location === "granted";
      } else if (step === "nearby") {
        granted = isNativeWearableAvailable()
          ? Boolean((await VjWearable.requestPermissions()).granted)
          : false;
      }
    } catch {
      granted = false;
    } finally {
      setBusy(false);
    }

    setResult(
      granted ? "Allowed" : "Not allowed — you can enable it later when the feature needs it.",
    );
    window.setTimeout(() => advance(), 550);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="native-permission-title"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#17171A] p-5 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
            <ShieldCheck className="h-4 w-4 text-[#C81E3A]" />
            Set up SVJ
          </div>
          <span className="text-[10px] font-mono text-[#8C8C90]">{progress}</span>
        </div>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[#C81E3A]/30 bg-[#C81E3A]/10">
          <Icon className="h-6 w-6 text-[#E62846]" />
        </div>

        <h2 id="native-permission-title" className="font-anton text-2xl text-white">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#D0CED2]">{copy.description}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#8C8C90]">{copy.detail}</p>

        {result && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-[#B8B8C0]"
          >
            {result}
          </p>
        )}

        <div className="mt-6 space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void requestCurrent()}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#C81E3A] px-4 font-anton text-sm uppercase tracking-wide text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Allow
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={advance}
            className="min-h-[44px] w-full rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-[#B8B8C0] disabled:opacity-60"
          >
            Not now
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-[#6F6F75]">
          Skipping does not block SVJ. The relevant feature can request permission again when you
          use it.
        </p>
      </section>
    </div>
  );
};
