import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FriendProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_xp: number;
  current_streak: number;
}

export interface FriendRow extends FriendProfile {
  friendship_id: string;
  since?: string;
}

export interface FriendRequestRow extends FriendProfile {
  friendship_id: string;
  direction: "incoming" | "outgoing";
  created_at: string;
}

export interface SearchRow extends FriendProfile {
  friendship_status: "pending" | "accepted" | "declined" | null;
  is_incoming: boolean;
}

interface SyncInput {
  username: string;
  displayName: string;
  avatar: string;
  totalXP: number;
  currentStreak: number;
}

export function useFriends(sync?: SyncInput) {
  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<FriendRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setFriends([]);
      setRequests([]);
      setLoading(false);
      return;
    }
    const [f, r] = await Promise.all([
      supabase.rpc("get_friends"),
      supabase.rpc("get_friend_requests"),
    ]);
    if (f.error || r.error) setError(f.error?.message ?? r.error?.message ?? null);
    else setError(null);
    setFriends((f.data as FriendRow[] | null) ?? []);
    setRequests((r.data as FriendRequestRow[] | null) ?? []);
    setLoading(false);
  }, []);

  // Keep the signed-in user's public card (username / xp / streak) up to date so
  // other members can find them and see live stats.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled || !sync) return;
      await supabase
        .from("profiles")
        .update({
          username: sync.username,
          display_name: sync.displayName,
          avatar_url: sync.avatar,
          total_xp: sync.totalXP,
          current_streak: sync.currentStreak,
        })
        .eq("id", uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [sync?.username, sync?.displayName, sync?.avatar, sync?.totalXP, sync?.currentStreak]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const search = useCallback(async (query: string): Promise<SearchRow[]> => {
    const q = query.trim();
    if (!q) return [];
    const { data, error: err } = await supabase.rpc("search_profiles", { _q: q });
    if (err) {
      setError(err.message);
      return [];
    }
    return (data as SearchRow[] | null) ?? [];
  }, []);

  const sendRequest = useCallback(
    async (addresseeId: string) => {
      setBusyId(addresseeId);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) {
        const { error: err } = await supabase
          .from("friendships")
          .insert({ requester_id: uid, addressee_id: addresseeId, status: "pending" });
        if (err) setError(err.message);
      }
      await refresh();
      setBusyId(null);
    },
    [refresh],
  );

  const respond = useCallback(
    async (friendshipId: string, status: "accepted" | "declined") => {
      setBusyId(friendshipId);
      const { error: err } = await supabase
        .from("friendships")
        .update({ status })
        .eq("id", friendshipId);
      if (err) setError(err.message);
      await refresh();
      setBusyId(null);
    },
    [refresh],
  );

  const removeFriend = useCallback(
    async (friendshipId: string) => {
      setBusyId(friendshipId);
      const { error: err } = await supabase.from("friendships").delete().eq("id", friendshipId);
      if (err) setError(err.message);
      await refresh();
      setBusyId(null);
    },
    [refresh],
  );

  return {
    userId,
    friends,
    requests,
    incoming: requests.filter((r) => r.direction === "incoming"),
    outgoing: requests.filter((r) => r.direction === "outgoing"),
    loading,
    error,
    busyId,
    refresh,
    search,
    sendRequest,
    respond,
    removeFriend,
  };
}
