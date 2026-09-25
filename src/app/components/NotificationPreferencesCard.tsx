import React from "react";
import { Bell } from "lucide-react";

/**
 * Kept as a compatibility component for older routes/builds.
 *
 * SVJ no longer exposes granular notification toggles in-app. Android's
 * notification permission is requested once during first-time onboarding and
 * the user controls future delivery from the phone's App Info settings.
 */
export const NotificationPreferencesCard: React.FC = () => (
  <section className="rounded-2xl border border-white/10 bg-[#17171A] p-4">
    <div className="flex items-start gap-3">
      <Bell className="mt-0.5 h-4 w-4 shrink-0 text-[#C81E3A]" />
      <div>
        <h3 className="font-inter text-[15px] font-semibold text-white">Notifications</h3>
        <p className="mt-1 text-xs leading-relaxed text-[#8C8C90]">
          SVJ asks for notification permission once during account setup. To turn notifications on
          or off later, use this app&apos;s notification controls in your phone settings.
        </p>
      </div>
    </div>
  </section>
);
