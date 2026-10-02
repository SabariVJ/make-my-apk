// Live step mirror: the Android app publishes today's step count, and any
// web session for the same account receives it instantly over Realtime.
// Display-only — XP and rewards never read this table.
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import { dateKeyOf } from "./activityTracker";

export interface LiveSteps {
  steps: number;
  distanceMeters: number;
  updatedAt: string;
}

const PUBLISH_INTERVAL_MS = 3000;

/** True when the client supports table writes and Realtime (absent in some test doubles). */
function liveClientReady(): boolean {
  const client = supabase as unknown as Record<string, unknown> | null;
  return (
    hasSupabaseConfig() &&
    !!client &&
    typeof client["from"] === "function" &&
    typeof client["channel"] === "function"
  );
}

/** Phone side: push today's total (throttled) whenever it changes. */
export function usePublishLiveSteps(
  userId: string | null,
  dateKey: string | null,
  steps: number,
  distanceMeters: number,
) {
  const lastSent = useRef<{ key: string; steps: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ dateKey, steps, distanceMeters });
  latest.current = { dateKey, steps, distanceMeters };

  useEffect(() => {
    if (!userId || !dateKey || !Capacitor.isNativePlatform() || !liveClientReady()) return;
    const sent = lastSent.current;
    if (sent && sent.key === dateKey && sent.steps === steps) return;
    if (timer.current) return; // a send is already scheduled; it reads the latest values
    timer.current = setTimeout(async () => {
      timer.current = null;
      const v = latest.current;
      if (!v.dateKey) return;
      try {
        const { error } = await supabase.from("svj_live_daily_steps").upsert({
          user_id: userId,
          date_key: v.dateKey,
          steps: Math.max(0, Math.round(v.steps)),
          distance_meters: Math.max(0, v.distanceMeters),
          source: Capacitor.getPlatform(),
          updated_at: new Date().toISOString(),
        });
        if (!error) lastSent.current = { key: v.dateKey, steps: v.steps };
      } catch {
        // Display-only mirror: a failed publish is retried on the next change.
      }
    }, PUBLISH_INTERVAL_MS);
  }, [userId, dateKey, steps, distanceMeters]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}

/** Web side: today's live total from the phone, updated in real time. */
export function useRemoteLiveSteps(userId: string | null): LiveSteps | null {
  const [live, setLive] = useState<LiveSteps | null>(null);

  useEffect(() => {
    if (!userId || Capacitor.isNativePlatform() || !liveClientReady()) return;
    let cancelled = false;
    const today = () => dateKeyOf(new Date());
    const apply = (
      row: { date_key: string; steps: number; distance_meters: number; updated_at: string } | null,
    ) => {
      if (cancelled || !row || row.date_key !== today()) return;
      setLive({
        steps: Number(row.steps) || 0,
        distanceMeters: Number(row.distance_meters) || 0,
        updatedAt: row.updated_at,
      });
    };

    void supabase
      .from("svj_live_daily_steps")
      .select("date_key, steps, distance_meters, updated_at")
      .eq("user_id", userId)
      .eq("date_key", today())
      .maybeSingle()
      .then(({ data }) => apply(data));

    const channel = supabase
      .channel(`live-steps-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svj_live_daily_steps",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => apply(payload.new as Parameters<typeof apply>[0]),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return live;
}
