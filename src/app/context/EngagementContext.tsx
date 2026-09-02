import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getEngagementState,
  claimDailyCheckin,
  startDailyMission,
  completeDailyMission,
  redeemEarnedPlus,
} from "@/lib/engagement.functions";
import {
  isActiveEngagement,
  type EngagementState,
  type EngagementReply,
  type RewardMutation,
  type RewardReceipt,
} from "@/lib/engagement";
import { useSVJ } from "./SVJContext";

type Action =
  | { kind: "checkin" }
  | { kind: "start"; missionKey: string }
  | { kind: "complete"; assignmentId: string; confirmation: string }
  | { kind: "redeem" };

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5");
  }
  throw new Error("Secure request IDs are not available in this browser.");
}

interface EngagementContextValue {
  state: EngagementState | undefined;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  actionError: string | null;
  pending: string | null;
  notice: string | null;
  serverNowMs: number;
  refresh: () => void;
  checkIn: () => Promise<boolean>;
  startMission: (key: string) => Promise<boolean>;
  completeMission: (assignmentId: string, confirmation: string) => Promise<boolean>;
  redeemPlus: () => Promise<boolean>;
}
const EngagementContext = createContext<EngagementContextValue | null>(null);

function receiptNotice(receipt: RewardReceipt, replayed: boolean): string {
  if (replayed) return "Your existing receipt is confirmed. No duplicate XP was awarded.";
  if (receipt.action === "checkin")
    return "Daily check-in saved: +" + receipt.profileXpAwarded + " Profile XP.";
  if (receipt.action === "start_mission")
    return "Mission started. Your session is saved on the server.";
  if (receipt.action === "complete_mission")
    return "Mission saved: +" + receipt.rewardXpAwarded + " Reward XP.";
  return "Plus confirmed until " + new Date(receipt.plusExpiresAt).toLocaleDateString() + ".";
}

export function EngagementProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const { user, profileLoaded, syncEngagementProfile } = useSVJ();
  const queryClient = useQueryClient();
  const read = useServerFn(getEngagementState);
  const checkin = useServerFn(claimDailyCheckin);
  const start = useServerFn(startDailyMission);
  const complete = useServerFn(completeDailyMission);
  const redeem = useServerFn(redeemEarnedPlus);
  const calls = useRef({ checkin, start, complete, redeem });
  calls.current = { checkin, start, complete, redeem };
  const currentAccount = useRef(userId);
  currentAccount.current = userId;
  const query = useQuery({
    queryKey: ["engagement", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const result = await read({});
      if (!result.ok) throw new Error(result.error);
      if (result.value.userId !== userId)
        throw new Error("Your sign-in changed. Refresh to load this account.");
      return result.value;
    },
    staleTime: 30_000,
    retry: 1,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  // Never keep another account's wallet visible while its replacement loads.
  const state = query.data?.userId === userId ? query.data : undefined;
  const active = isActiveEngagement(state) ? state : undefined;
  const latestState = useRef(state);
  latestState.current = state;
  const busy = useRef(false);
  const requests = useRef(new Map<string, string>());
  const attemptedCheckins = useRef(new Set<string>());
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (!active) return;
    const anchor = Date.parse(active.serverNow);
    const monotonicStart = performance.now();
    setClock(anchor);
    const timer = setInterval(
      () => setClock(anchor + Math.max(0, performance.now() - monotonicStart)),
      1000,
    );
    return () => clearInterval(timer);
  }, [active, userId]);

  useEffect(() => {
    if (!active || !profileLoaded) return;
    syncEngagementProfile(active.userId, active.wallet.profileXpEarned, active.serverNow);
  }, [
    active,
    user.id,
    user.engagementProfileXp,
    user.engagementXpUserId,
    profileLoaded,
    syncEngagementProfile,
  ]);

  const perform = useCallback(
    async (action: Action): Promise<boolean> => {
      if (!userId || busy.current) return false;
      const snapshot = latestState.current;
      if (
        !isActiveEngagement(snapshot) ||
        snapshot.userId !== userId ||
        snapshot.status !== "ready"
      )
        return false;
      const source =
        action.kind === "start"
          ? snapshot.policyDay + ":" + action.missionKey
          : action.kind === "complete"
            ? action.assignmentId
            : action.kind === "checkin"
              ? snapshot.policyDay
              : "launch";
      const key = action.kind + ":" + source;
      let requestId: string;
      try {
        requestId = requests.current.get(key) ?? newRequestId();
      } catch {
        setActionError("Secure request IDs are unavailable in this browser. Refresh and retry.");
        return false;
      }
      requests.current.set(key, requestId);
      busy.current = true;
      setPending(key);
      setActionError(null);
      setNotice(null);
      try {
        let result: EngagementReply<RewardMutation>;
        switch (action.kind) {
          case "checkin":
            result = await calls.current.checkin({ data: { requestId } });
            break;
          case "start":
            result = await calls.current.start({
              data: { requestId, missionKey: action.missionKey },
            });
            break;
          case "complete":
            result = await calls.current.complete({
              data: {
                requestId,
                assignmentId: action.assignmentId,
                confirmation: action.confirmation,
              },
            });
            break;
          case "redeem":
            result = await calls.current.redeem({ data: { requestId } });
            break;
        }
        if (currentAccount.current !== userId) return false;
        if (!result.ok) {
          setActionError(result.error);
          return false;
        }
        if (result.value.state.userId !== userId) {
          setActionError("Your sign-in changed. Refresh before continuing.");
          return false;
        }
        queryClient.setQueryData(["engagement", userId], result.value.state);
        syncEngagementProfile(
          userId,
          result.value.state.wallet.profileXpEarned,
          result.value.state.serverNow,
        );
        setNotice(receiptNotice(result.value.receipt, result.value.replayed));
        requests.current.delete(key);
        if (action.kind === "redeem") {
          // Membership remains server-derived. Never set isPremium optimistically.
          await queryClient.invalidateQueries({ queryKey: ["trial-status", userId] });
        }
        return true;
      } catch {
        if (currentAccount.current === userId) {
          setActionError(
            "Could not confirm the save. Retry safely—your request will not award twice.",
          );
        }
        return false;
      } finally {
        busy.current = false;
        if (currentAccount.current === userId) setPending(null);
      }
    },
    [userId, queryClient, syncEngagementProfile],
  );

  useEffect(() => {
    if (
      !active ||
      active.status !== "ready" ||
      !active.account.verified ||
      active.wallet.checkedInToday
    )
      return;
    const key = active.userId + ":" + active.policyDay;
    if (attemptedCheckins.current.has(key) || busy.current) return;
    attemptedCheckins.current.add(key);
    void perform({ kind: "checkin" });
  }, [active, perform]);

  const resetRefresh = useRef<string | null>(null);
  useEffect(() => {
    if (
      !active ||
      clock < Date.parse(active.nextResetAt) ||
      resetRefresh.current === active.policyDay
    )
      return;
    resetRefresh.current = active.policyDay;
    void queryClient.invalidateQueries({ queryKey: ["engagement", userId] });
  }, [active, clock, queryClient, userId]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["engagement", userId] });
  }, [queryClient, userId]);

  return (
    <EngagementContext.Provider
      value={{
        state,
        loading: query.isPending && Boolean(userId),
        refreshing: query.isFetching,
        error: query.error instanceof Error ? query.error.message : null,
        actionError,
        pending,
        notice,
        serverNowMs: clock || (active ? Date.parse(active.serverNow) : 0),
        refresh,
        checkIn: () => perform({ kind: "checkin" }),
        startMission: (missionKey) => perform({ kind: "start", missionKey }),
        completeMission: (assignmentId, confirmation) =>
          perform({ kind: "complete", assignmentId, confirmation }),
        redeemPlus: () => perform({ kind: "redeem" }),
      }}
    >
      {children}
    </EngagementContext.Provider>
  );
}

export function useEngagement() {
  const value = useContext(EngagementContext);
  if (!value) throw new Error("Earn Plus must be rendered inside its account-scoped provider.");
  return value;
}
