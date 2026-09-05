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
export interface PublicMember extends FriendProfile {
  rank: number;
}

export function useFriends(enabled = true) {
  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<FriendRequestRow[]>([]);
  const [members, setMembers] = useState<PublicMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setFriends([]);
      setRequests([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setFriends([]);
      setRequests([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    const [f, r, m] = await Promise.all([
      supabase.rpc("get_friends"),
      supabase.rpc("get_friend_requests"),
      // Generated types are refreshed after the additive migration is applied.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("svj_list_public_profiles", {
        p_query: "",
        p_limit: 100,
        p_include_self: true,
      }),
    ]);
    if (f.error || r.error || m.error)
      setError(f.error?.message ?? r.error?.message ?? m.error?.message ?? null);
    else setError(null);
    setFriends((f.data as FriendRow[] | null) ?? []);
    setRequests((r.data as FriendRequestRow[] | null) ?? []);
    setMembers((m.data as PublicMember[] | null) ?? []);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Public member fields are always resolved from the canonical profiles source
  // through the RPC above. A small, account-scoped refetch keeps a friend's
  // renamed username/avatar current without subscribing every client to global
  // profile changes or requiring a browser reload.
  useEffect(() => {
    if (!enabled) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(refreshWhenVisible, 20_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, refresh]);

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
    members,
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
