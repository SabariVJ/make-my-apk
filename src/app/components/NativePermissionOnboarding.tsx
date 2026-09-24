import React, { useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Activity,
  Bell,
  Bluetooth,
  HeartPulse,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  DEFAULT_HEALTH_CONNECT_TYPES,
  healthConnectAvailable,
  requestHealthConnectPermissions,
} from "../lib/healthConnect";
import {
  checkWorkoutPermissions,
  requestWorkoutPermissions,
} from "../lib/nativeWorkout";
import {
  requestNotificationPermission,
} from "../lib/notifications";
import {
  vjCheckPermissions,
  vjRequestPermissions,
} from "../lib/vj-pedometer";
import {
  isNativeWearableAvailable,
  VjWearable,
} from "../lib/wearable";

const STORAGE_KEY = "svj_native_permission_onboarding_v1";

type StepKey = "activity" | "location" | "notifications" | "health" | "nearby";

interface Step {
  key: StepKey;
  title: string;
  body: string;
  action: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: Step[] = [
  {
    key: "activity",
    title: "Physical activity",
    body: "Allow SVJ to read motion activity so step tracking can use your phone's step sensor.",
    action: "Enable activity",
    icon: Activity,
  },
  {
    key: "location",
    title: "Location",
    body: "Used only when you start a GPS activity such as a run, walk, hike or cycle route.",
    action: "Enable location",
    icon: MapPin,
  },
  {
    key: "notifications",
    title: "Notifications",
    body: "Receive training, recovery, streak, progress and membership reminders you choose to enable.",
    action: "Enable notifications",
    icon: Bell,
  },
  {
    key: "health",
    title: "Health & fitness",
    body: "Connect selected Health Connect records for workouts, steps, distance, heart rate and recovery context.",
    action: "Connect Health",
    icon: HeartPulse,
  },
  {
    key: "nearby",
    title: "Nearby devices",
    body: "Allow Bluetooth access when you want to connect supported heart-rate sensors and nearby fitness devices.",
    action: "Enable nearby devices",
    icon: Bluetooth,
  },
];

function onboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

function markDone() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "done");
  } catch {
    // A storage failure must never trap the user in onboarding.
  }
}

/**
 * First-run Android permission education.
 *
 * The app explains one capability at a time and only opens the Android system
 * prompt after the user taps Enable. Every step has Not now; the feature that
 * later needs a permission still performs its own contextual check/request.
 */
export const NativePermissionOnboarding: React.FC = () => {
  const nativeAndroid = Capacitor.getPlatform() === "android";
  const [open, setOpen] = useState(() => nativeAndroid && !onboardingDone());
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const step = useMemo(() => STEPS[index] ?? STEPS[STEPS.length - 1], [index]);

  if (!nativeAndroid || !open) return null;

  const finishStep = () => {
    setNotice(null);
    if (index >= STEPS.length - 1) {
      markDone();
      setOpen(false);
      return;
    }
    setIndex((value) => value + 1);
  };

  const requestCurrent = async () => {
    setBusy(true);
    setNotice(null);
    try {
      switch (step.key) {
        case "activity": {
          const current = await vjCheckPermissions();
          if (current?.activityRecognition !== "granted") {
            await vjRequestPermissions();
          }
          break;
        }
        case "location": {
          const current = await checkWorkoutPermissions();
          // Avoid the workout plugin's secondary notification request here:
          // on a first prompt location is missing, so the plugin requests only
          // location. If location was already granted, there is nothing to ask.
          if (current.location !== "granted") {
            await requestWorkoutPermissions();
          }
          break;
        }
        case "notifications":
          await requestNotificationPermission();
          break;
        case "health":
          if (healthConnectAvailable()) {
            await requestHealthConnectPermissions(DEFAULT_HEALTH_CONNECT_TYPES);
          } else {
            setNotice("Health Connect is not available on this device yet.");
            setBusy(false);
            return;
          }
          break;
        case "nearby":
          if (isNativeWearableAvailable()) {
            await VjWearable.requestPermissions();
          } else {
            setNotice("Nearby fitness-device support is not available on this device.");
            setBusy(false);
            return;
          }
          break;
      }
      finishStep();
    } catch {
      // Permission denial/errors stay non-blocking. The user can continue and
      // the relevant feature will ask again contextually when they use it.
      setNotice("That permission was not enabled. You can continue and turn it on later.");
    } finally {
      setBusy(false);
    }
  };

  const Icon = step.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="native-permission-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121214] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-[11px] font-mono text-[#8C8C90]">
            Setup {index + 1} / {STEPS.length}
          </span>
          <div className="flex gap-1" aria-hidden="true">
            {STEPS.map((item, itemIndex) => (
              <span
                key={item.key}
                className={`h-1.5 w-6 rounded-full ${
                  itemIndex <= index ? "bg-[#C81E3A]" : "bg-white/10"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C81E3A]/30 bg-[#C81E3A]/10">
          <Icon className="h-6 w-6 text-[#E62846]" />
        </div>

        <h2
          id="native-permission-title"
          className="text-xl font-semibold text-white"
        >
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#A6A6AA]">{step.body}</p>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-[11px] leading-relaxed text-[#8C8C90]">
            SVJ asks only when needed. Choosing Not now will not block the app,
            and the relevant feature can ask again when you use it.
          </p>
        </div>

        {notice && (
          <p role="status" className="mt-3 text-xs text-amber-300">
            {notice}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={finishStep}
            disabled={busy}
            className="min-h-12 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-[#C7C7CA] disabled:opacity-50"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void requestCurrent()}
            disabled={busy}
            className="min-h-12 rounded-xl bg-[#C81E3A] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Checking…" : step.action}
          </button>
        </div>
      </div>
    </div>
  );
};
