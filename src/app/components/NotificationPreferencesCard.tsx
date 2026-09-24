import React, { useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2, Send } from "lucide-react";
import { SVJTimePicker } from "./ui-primitives/SVJTimePicker";
import { Capacitor } from "@capacitor/core";
import { useSVJ } from "../context/SVJContext";
import {
  loadNotificationPreferences,
  notificationPermission,
  requestNotificationPermission,
  openNotificationSettings,
  saveNotificationPreferences,
  sendTestNotification,
  type NotificationPreferences,
} from "../lib/notifications";

const ToggleRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 py-2.5">
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-white">{label}</span>
      <span className="block text-[11px] text-[#8C8C90]">{description}</span>
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 accent-[#C81E3A]"
    />
  </label>
);

export const NotificationPreferencesCard: React.FC = () => {
  const { user } = useSVJ();
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    loadNotificationPreferences(user.id),
  );
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const nativeAndroid = Capacitor.getPlatform() === "android";

  useEffect(() => {
    setPrefs(loadNotificationPreferences(user.id));
    if (nativeAndroid) void notificationPermission().then(setPermissionGranted);
  }, [user.id, nativeAndroid]);

  const persist = (next: NotificationPreferences) => {
    setPrefs(next);
    if (!saveNotificationPreferences(user.id, next)) {
      setNotice("Could not save notification settings on this device.");
    }
  };

  const enable = async () => {
    if (!nativeAndroid) {
      setNotice("System notifications are available in the Android app.");
      return;
    }
    setBusy(true);
    const granted = await requestNotificationPermission();
    setPermissionGranted(granted);
    setPermissionDenied(!granted);
    if (granted) {
      persist({ ...prefs, enabled: true });
      setNotice("Notifications enabled.");
    } else {
      persist({ ...prefs, enabled: false });
      setNotice("Notification permission was not granted.");
    }
    setBusy(false);
  };

  const disable = () => {
    persist({ ...prefs, enabled: false });
    setNotice("Notifications paused.");
  };

  const patch = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => persist({ ...prefs, [key]: value });

  const testNotification = async () => {
    setBusy(true);
    const ok = await sendTestNotification();
    setNotice(ok ? "Test notification sent." : "Could not send a test notification.");
    setBusy(false);
  };

  return (
    <section className="rounded-2xl bg-[#17171A] border border-white/10 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-anton text-sm text-white uppercase tracking-wide flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#C81E3A]" />
            Notifications
          </h3>
          <p className="mt-1 text-xs text-[#8C8C90]">
            Personal reminders for progress, recovery and membership. You control every category.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void (prefs.enabled ? disable() : enable())}
          disabled={busy}
          className={`shrink-0 rounded-lg border px-3 py-2 text-[10px] font-mono font-bold uppercase transition-colors disabled:opacity-50 ${
            prefs.enabled
              ? "border-[#C81E3A]/40 bg-[#C81E3A]/10 text-white"
              : "border-white/10 bg-white/5 text-[#8C8C90]"
          }`}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : prefs.enabled ? (
            "Enabled"
          ) : (
            "Enable"
          )}
        </button>
      </div>

      {!nativeAndroid && (
        <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-[#8C8C90]">
          Preview mode: these preferences apply to the Android app, where SVJ can post system
          notifications.
        </p>
      )}

      {nativeAndroid && permissionDenied && !permissionGranted && (
        <div className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
          <p className="text-[11px] text-gold">
            Android notification permission is off. If Android no longer shows the prompt, open app settings and allow Notifications.
          </p>
          <button
            type="button"
            onClick={() => void openNotificationSettings()}
            className="mt-2 rounded-lg border border-gold/30 bg-black/20 px-3 py-2 text-[10px] font-mono font-bold uppercase text-gold"
          >
            Open Android settings
          </button>
        </div>
      )}

      <div className="divide-y divide-white/5">
        <ToggleRow
          label="Morning plan"
          description="A quick view of today's tasks."
          checked={prefs.dailyPlan}
          onChange={(value) => patch("dailyPlan", value)}
        />
        <ToggleRow
          label="Evening coach"
          description="Reminds you only when meaningful work is still left."
          checked={prefs.eveningCoach}
          onChange={(value) => patch("eveningCoach", value)}
        />
        <ToggleRow
          label="Streak at risk"
          description="Uses the evening coach to protect an active streak."
          checked={prefs.streakRisk}
          onChange={(value) => patch("streakRisk", value)}
        />
        <ToggleRow
          label="Earn Plus progress"
          description="Includes qualifying-day progress when it is useful."
          checked={prefs.earnPlus}
          onChange={(value) => patch("earnPlus", value)}
        />
        <ToggleRow
          label="Recovery"
          description="Daily recovery check-in reminder."
          checked={prefs.recovery}
          onChange={(value) => patch("recovery", value)}
        />
        <ToggleRow
          label="Nutrition"
          description="Remind me when no meal has been logged."
          checked={prefs.nutrition}
          onChange={(value) => patch("nutrition", value)}
        />
        <ToggleRow
          label="Training gap"
          description="Nudge me after three days without a strength session."
          checked={prefs.training}
          onChange={(value) => patch("training", value)}
        />
        <ToggleRow
          label="Training sessions"
          description="Remind me on the days my plan schedules a session."
          checked={prefs.trainingSession}
          onChange={(value) => patch("trainingSession", value)}
        />
        <ToggleRow
          label="Momentum"
          description="Nudge me after two quiet days without progress."
          checked={prefs.inactivity}
          onChange={(value) => patch("inactivity", value)}
        />
        <ToggleRow
          label="Membership"
          description="Warn 7, 3 and 1 day before timed Plus ends."
          checked={prefs.membership}
          onChange={(value) => patch("membership", value)}
        />
        <ToggleRow
          label="Weekly recap"
          description="Sunday progress summary."
          checked={prefs.weeklyRecap}
          onChange={(value) => patch("weeklyRecap", value)}
        />
      </div>

      {/* Dark in-app time dialog per slot — a native time field opens the
          Android system TimePicker dialog, which is a white sheet. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Morning", "morningTime"],
          ["Evening", "eveningTime"],
          ["Recovery", "recoveryTime"],
          ["Nutrition", "nutritionTime"],
          ["Session", "trainingTime"],
        ].map(([label, key]) => (
          <SVJTimePicker
            key={key}
            label={label}
            testId={`notify-${key}`}
            value={prefs[key as keyof NotificationPreferences] as string}
            onChange={(next) => patch(key as keyof NotificationPreferences, next as never)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {nativeAndroid && prefs.enabled && permissionGranted && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void testNotification()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-mono font-bold uppercase text-white disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Send test
          </button>
        )}
        {prefs.enabled && (
          <button
            type="button"
            onClick={disable}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono font-bold uppercase text-[#8C8C90]"
          >
            <BellOff className="h-3.5 w-3.5" />
            Pause all
          </button>
        )}
        {notice && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400"
          >
            <Check className="h-3.5 w-3.5" />
            {notice}
          </span>
        )}
      </div>
    </section>
  );
};
