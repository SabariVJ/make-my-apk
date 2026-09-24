import React, { useMemo, useState } from "react";
import { Activity, Bell, Bluetooth, HeartPulse, MapPin } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useSVJ } from "../context/SVJContext";
import { appStorage } from "../lib/storage";
import { vjRequestPermissions } from "../lib/vj-pedometer";
import { requestNotificationPermission } from "../lib/notifications";
import { requestWorkoutPermissions } from "../lib/nativeWorkout";
import {
  DEFAULT_HEALTH_CONNECT_TYPES,
  requestHealthConnectPermissions,
} from "../lib/healthConnect";
import { isNativeWearableAvailable, VjWearable } from "../lib/wearable";

type PermissionResult = "granted" | "not_granted" | "unavailable";

interface PermissionStep {
  id: string;
  title: string;
  description: string;
  icon: typeof Activity;
  request: () => Promise<PermissionResult>;
}

const STORAGE_PREFIX = "svj_native_permission_setup_v1:";

export const NativePermissionSetup: React.FC = () => {
  const { user } = useSVJ();
  const nativeAndroid = Capacitor.getPlatform() === "android";
  const storageKey = STORAGE_PREFIX + user.id;
  const [open, setOpen] = useState(
    () => nativeAndroid && appStorage.getItem(storageKey) !== "complete",
  );
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const steps = useMemo<PermissionStep[]>(
    () => [
      {
        id: "activity",
        title: "Physical activity",
        description:
          "Allow SVJ to read the phone's step sensor while you deliberately track activity.",
        icon: Activity,
        request: async () => {
          const result = await vjRequestPermissions();
          return result?.activityRecognition === "granted" ? "granted" : "not_granted";
        },
      },
      {
        id: "notifications",
        title: "Notifications",
        description:
          "Allow reminders for training, recovery, progress, streaks and membership alerts.",
        icon: Bell,
        request: async () => ((await requestNotificationPermission()) ? "granted" : "not_granted"),
      },
      {
        id: "health",
        title: "Health & fitness",
        description:
          "Connect only the Health Connect record types SVJ uses for workouts and recovery.",
        icon: HeartPulse,
        request: async () => {
          const permissions = await requestHealthConnectPermissions(DEFAULT_HEALTH_CONNECT_TYPES);
          const values = DEFAULT_HEALTH_CONNECT_TYPES.map((type) => permissions[type]);
          if (values.every((value) => value === "unavailable")) return "unavailable";
          return values.some((value) => value === "granted") ? "granted" : "not_granted";
        },
      },
      {
        id: "location",
        title: "Location",
        description:
          "Allow foreground location for GPS workouts, route recording and distance tracking.",
        icon: MapPin,
        request: async () => {
          const permissions = await requestWorkoutPermissions();
          return permissions.location === "granted" ? "granted" : "not_granted";
        },
      },
      {
        id: "nearby",
        title: "Nearby devices & Bluetooth",
        description:
          "Allow SVJ to discover and connect compatible heart-rate sensors and wearable devices.",
        icon: Bluetooth,
        request: async () => {
          if (!isNativeWearableAvailable()) return "unavailable";
          try {
            const result = await VjWearable.requestPermissions();
            return result.granted ? "granted" : "not_granted";
          } catch {
            return "not_granted";
          }
        },
      },
    ],
    [],
  );

  if (!open || !nativeAndroid) return null;

  const step = steps[index];
  const Icon = step.icon;

  const finish = () => {
    appStorage.setItem(storageKey, "complete");
    setOpen(false);
  };

  const advance = () => {
    setMessage(null);
    if (index >= steps.length - 1) finish();
    else setIndex((current) => current + 1);
  };

  const allow = async () => {
    setBusy(true);
    setMessage(null);
    const result = await step.request();
    setBusy(false);
    if (result === "granted") {
      advance();
      return;
    }
    setMessage(
      result === "unavailable"
        ? "This capability is not available on this device. You can continue."
        : "Permission was not granted. You can enable it later when a feature needs it.",
    );
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="native-permission-title"
      data-testid="native-permission-setup"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17171A] p-5 shadow-2xl">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#C81E3A]/30 bg-[#C81E3A]/10">
            <Icon className="h-5 w-5 text-[#E62846]" />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#8C8C90]">
              Set up SVJ · {index + 1}/{steps.length}
            </p>
            <h2 id="native-permission-title" className="mt-1 text-lg font-semibold text-white">
              {step.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#A6A6AD]">{step.description}</p>
          </div>
        </div>

        {message && (
          <p role="status" className="mb-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-[#B8B8C0]">
            {message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={advance}
            className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-[#B8B8C0] disabled:opacity-50"
          >
            {message ? "Continue" : "Not now"}
          </button>
          {!message && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void allow()}
              className="min-h-[44px] flex-1 rounded-xl bg-[#C81E3A] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Requesting…" : "Allow"}
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-[10px] leading-relaxed text-[#707077]">
          Optional permissions can be granted later from the feature that needs them or Android settings.
        </p>
      </div>
    </div>
  );
};
