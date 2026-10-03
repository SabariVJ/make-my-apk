// Display-only daily mirror. Never used by reward or XP processing.
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase, hasSupabaseConfig } from "@/integrations/supabase/client";
import { dateKeyOf } from "./activityTracker";

export interface LiveSteps {
  steps: number;
  distanceMeters: number;
  updatedAt: string;
}

export function usePublishLiveSteps(
  userId: string | null,
  dateKey: string | null,
  steps: number,
  distanceMeters: number,
): number | null {
  const latest = useRef({ userId, dateKey, steps, distanceMeters });
  latest.current = { userId, dateKey, steps, distanceMeters };
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<number | null>(null);
  useEffect(() => {
    setLastSuccessfulSyncAt(null);
    if (!userId || !dateKey || !Capacitor.isNativePlatform() || !hasSupabaseConfig()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let sent = "";
    let attempts = 0;
    const schedule = (delay = 3000) => {
      if (cancelled || document.hidden || navigator.onLine === false || timer || controller) return;
      timer = setTimeout(() => {
        timer = null;
        void publish();
      }, delay);
    };
    const publish = async () => {
      const v = latest.current;
      if (
        cancelled ||
        document.hidden ||
        navigator.onLine === false ||
        v.userId !== userId ||
        v.dateKey !== dateKey
      )
        return;
      const key = `${userId}:${dateKey}:${v.steps}:${v.distanceMeters}`;
      if (key === sent) return;
      controller = new AbortController();
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user.id !== userId || cancelled || document.hidden) return;
        const { error } = await supabase
          .from("svj_live_daily_steps")
          .upsert({
            user_id: userId,
            date_key: dateKey,
            steps: Math.max(0, Math.min(200000, Math.round(v.steps))),
            distance_meters: Math.max(0, v.distanceMeters),
            source: Capacitor.getPlatform(),
            updated_at: new Date().toISOString(),
          })
          .setHeader("Authorization", `Bearer ${data.session.access_token}`)
          .abortSignal(controller.signal);
        if (error) throw error;
        if (!cancelled) {
          sent = key;
          attempts = 0;
          setLastSuccessfulSyncAt(Date.now());
        }
      } catch {
        attempts = Math.min(5, attempts + 1);
      } finally {
        controller = null;
        schedule(Math.min(60000, 3000 * 2 ** attempts));
      }
    };
    const wake = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
        controller?.abort();
      } else schedule(0);
    };
    const poll = setInterval(() => schedule(), 3000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [userId, dateKey]);
  return lastSuccessfulSyncAt;
}

export function useRemoteLiveSteps(userId: string | null): LiveSteps | null {
  const [live, setLive] = useState<LiveSteps | null>(null);
  const [day, setDay] = useState(() => dateKeyOf(new Date()));
  useEffect(() => {
    const checkDay = () => setDay(dateKeyOf(new Date()));
    const timer = setInterval(checkDay, 10000);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, []);
  useEffect(() => {
    setLive(null);
    if (!userId || Capacitor.getPlatform() !== "web" || !hasSupabaseConfig()) return;
    let cancelled = false;
    const apply = (
      row: { date_key: string; steps: number; distance_meters: number; updated_at: string } | null,
    ) => {
      if (cancelled || !row || row.date_key !== day) return;
      setLive({
        steps: Number(row.steps) || 0,
        distanceMeters: Number(row.distance_meters) || 0,
        updatedAt: row.updated_at,
      });
    };
    const read = () => {
      void supabase
        .from("svj_live_daily_steps")
        .select("date_key, steps, distance_meters, updated_at")
        .eq("user_id", userId)
        .eq("date_key", day)
        .maybeSingle()
        .then(
          ({ data }) => apply(data),
          () => undefined,
        );
    };
    const wake = () => {
      if (!document.hidden) read();
    };
    read();
    const channel = supabase
      .channel(`live-steps-${userId}-${day}`)
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
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [userId, day]);
  return live;
}
