import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Search,
  UserPlus,
  Check,
  X,
  Flame,
  Zap,
  Loader2,
  Clock,
  Users,
  Swords,
  Bell,
} from "lucide-react";
import { useFriends, SearchRow } from "../hooks/useFriends";
import { AvatarImage } from "./AvatarImage";
import { SVJEmptyState } from "./ui-primitives/SVJEmptyState";
import { SVJSectionHeader } from "./ui-primitives/SVJSectionHeader";
import {
  getRivalries,
  acceptRivalry,
  declineRivalry,
  cancelRivalry,
  getNotifications,
  markNotificationRead,
  RivalryData,
  NotificationData,
} from "@/lib/rivalry.functions";

const Avatar: React.FC<{ src: string | null; name: string }> = ({ src, name }) => (
  <AvatarImage
    src={src}
    name={name}
    className="w-11 h-11 rounded-full object-cover border border-white/10"
  />
);

const StatLine: React.FC<{ xp: number; streak: number }> = ({ xp, streak }) => (
  <div className="flex items-center gap-3 text-[10px] font-mono text-[#8C8C90] mt-0.5">
    <span className="flex items-center gap-1 text-[#C81E3A]">
      <Zap className="w-3 h-3" /> {xp.toLocaleString()} XP
    </span>
    <span className="flex items-center gap-1 text-gold">
      <Flame className="w-3 h-3" /> {streak}d
    </span>
  </div>
);

function remainingRivalryTime(expiresAt?: string): string {
  if (!expiresAt) return "No end time set";
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "Finishing now";
  const hours = Math.floor(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h remaining` : `${Math.max(hours, 1)}h remaining`;
}

export const FriendsPanel: React.FC<{ friendsApi: ReturnType<typeof useFriends> }> = ({
  friendsApi,
}) => {
  const {
    friends,
    incoming,
    outgoing,
    loading,
    error,
    busyId,
    userId,
    search,
    sendRequest,
    respond,
    removeFriend,
  } = friendsApi;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeSection, setActiveSection] = useState<"friends" | "rivalries" | "notifications">(
    "friends",
  );
  const [rivalries, setRivalries] = useState<RivalryData[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [rivalryBusy, setRivalryBusy] = useState<string | null>(null);
  const [rivalryError, setRivalryError] = useState<string | null>(null);
  const [selectedRivalry, setSelectedRivalry] = useState<RivalryData | null>(null);

  // These server-side reads are scoped to the current account. Polling only
  // while this panel is mounted avoids a broad profile subscription but still
  // delivers requests, acceptance and verified score changes without a reload.
  const refreshRivalryData = useCallback(async () => {
    const [rivalryRows, notificationRows] = await Promise.all([getRivalries(), getNotifications()]);
    if (Array.isArray(rivalryRows)) setRivalries(rivalryRows);
    if (Array.isArray(notificationRows)) setNotifications(notificationRows);
  }, []);

  useEffect(() => {
    void refreshRivalryData();
    const interval = window.setInterval(() => void refreshRivalryData(), 15_000);
    return () => window.clearInterval(interval);
  }, [refreshRivalryData]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const incomingRivalries = rivalries.filter(
    (r) => r.status === "pending" && r.opponentId === userId,
  );
  const outgoingRivalries = rivalries.filter(
    (r) => r.status === "pending" && r.challengerId === userId,
  );
  const activeRivalries = rivalries.filter((r) => r.status === "active");

  const handleAcceptRivalry = async (rivalryId: string) => {
    setRivalryBusy(rivalryId);
    setRivalryError(null);
    const result = await acceptRivalry({ data: { rivalryId } });
    if (result.ok && result.rivalry) await refreshRivalryData();
    else setRivalryError(result.error ?? "Could not accept that rivalry request.");
    setRivalryBusy(null);
  };

  const handleDeclineRivalry = async (rivalryId: string) => {
    setRivalryBusy(rivalryId);
    setRivalryError(null);
    const result = await declineRivalry({ data: { rivalryId } });
    if (result.ok && result.rivalry) await refreshRivalryData();
    else setRivalryError(result.error ?? "Could not decline that rivalry request.");
    setRivalryBusy(null);
  };

  const handleCancelRivalry = async (rivalryId: string) => {
    setRivalryBusy(rivalryId);
    setRivalryError(null);
    const result = await cancelRivalry({ data: { rivalryId } });
    if (result.ok && result.rivalry) await refreshRivalryData();
    else setRivalryError(result.error ?? "Could not cancel that rivalry request.");
    setRivalryBusy(null);
  };

  const handleMarkRead = async (notifId: string) => {
    await markNotificationRead({ data: { notificationId: notifId } });
    setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
  };

  const runSearch = async (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setResults(await search(value));
    setSearching(false);
  };

  const label = (r: { username: string | null; display_name: string | null }) =>
    r.username || r.display_name || "Voyager";

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#8C8C90]" />
          {searching && (
            <Loader2 className="absolute right-3.5 top-3 w-4 h-4 text-[#C81E3A] animate-spin" />
          )}
          <input
            type="text"
            placeholder="Search members by username to add as friend..."
            value={query}
            onChange={(e) => void runSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#17171A] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#C81E3A]"
          />
        </div>

        {query.trim() !== "" && (
          <div className="mt-3 space-y-2">
            {results.length === 0 && !searching && (
              <p className="text-xs font-mono text-[#8C8C90] px-1">
                No members match &quot;{query}&quot;.
              </p>
            )}
            {results.map((r) => (
              <div
                key={r.id}
                className="svj-radius-row flex items-center justify-between gap-3 border border-white/[0.07] bg-[#17171A] p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={r.avatar_url} name={label(r)} />
                  <div className="min-w-0">
                    <p className="truncate font-inter text-sm font-semibold text-white">
                      @{label(r)}
                    </p>
                    <StatLine xp={r.total_xp} streak={r.current_streak} />
                  </div>
                </div>
                {r.friendship_status === "accepted" ? (
                  <span className="text-[10px] font-mono text-emerald-400 shrink-0">Friends</span>
                ) : r.friendship_status === "pending" ? (
                  <span className="text-[10px] font-mono text-[#8C8C90] shrink-0">
                    {r.is_incoming ? "Wants to add you" : "Requested"}
                  </span>
                ) : (
                  <button
                    onClick={() => void sendRequest(r.id)}
                    disabled={busyId === r.id}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-[#C81E3A] hover:bg-[#A0182E] disabled:opacity-50 text-white text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                  >
                    {busyId === r.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(error || rivalryError) && (
        <p className="text-xs font-mono text-crimson px-1">{error ?? rivalryError}</p>
      )}

      {/* Section Tabs */}
      <div className="p-1 rounded-lg bg-[#17171A] border border-white/10 flex items-center text-xs font-mono">
        <button
          onClick={() => setActiveSection("friends")}
          className={`flex-1 py-1.5 rounded-2xl font-semibold transition-colors cursor-pointer ${
            activeSection === "friends"
              ? "bg-[#C81E3A] text-white"
              : "text-[#8C8C90] hover:text-white"
          }`}
        >
          Friends
        </button>
        <button
          onClick={() => setActiveSection("rivalries")}
          className={`flex-1 py-1.5 rounded-2xl font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
            activeSection === "rivalries"
              ? "bg-[#C81E3A] text-white"
              : "text-[#8C8C90] hover:text-white"
          }`}
        >
          <Swords className="w-3 h-3" /> Rivalries
          {incomingRivalries.length > 0 && activeSection !== "rivalries" && (
            <span className="w-2 h-2 rounded-full bg-[#C81E3A]" />
          )}
        </button>
        <button
          onClick={() => setActiveSection("notifications")}
          className={`flex-1 py-1.5 rounded-2xl font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
            activeSection === "notifications"
              ? "bg-[#C81E3A] text-white"
              : "text-[#8C8C90] hover:text-white"
          }`}
        >
          <Bell className="w-3 h-3" /> Alerts
          {unreadCount > 0 && activeSection !== "notifications" && (
            <span className="w-2 h-2 rounded-full bg-[#C81E3A]" />
          )}
        </button>
      </div>

      {/* Rivalries Section */}
      {activeSection === "rivalries" && (
        <div className="space-y-3">
          {incomingRivalries.length > 0 && (
            <section className="space-y-2">
              <SVJSectionHeader
                title="Incoming challenges"
                icon={Swords}
                trailing={
                  <span className="rounded-full bg-[#C81E3A] px-2 py-0.5 font-mono text-[10px] text-white">
                    {incomingRivalries.length}
                  </span>
                }
              />
              {incomingRivalries.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="svj-radius-card svj-elev-1 flex items-center justify-between gap-3 border border-[#C81E3A]/25 bg-[#17171A] p-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarImage
                      src={r.opponentAvatarUrl}
                      name={r.opponentUsername || r.opponentDisplayName}
                      className="h-11 w-11 shrink-0 rounded-2xl border border-white/10 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-inter text-sm font-semibold text-white">
                        {r.opponentUsername || r.opponentDisplayName || "A member"} challenged you
                      </p>
                      <p className="mt-0.5 font-inter text-[11px] text-[#8C8C90]">
                        Accept to start keeping score.
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => void handleAcceptRivalry(r.id)}
                      disabled={rivalryBusy === r.id}
                      className="cursor-pointer rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 font-inter text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {rivalryBusy === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Accept"
                      )}
                    </button>
                    <button
                      onClick={() => void handleDeclineRivalry(r.id)}
                      disabled={rivalryBusy === r.id}
                      className="cursor-pointer rounded-xl border border-white/10 bg-[#0B0B0C] px-3 py-1.5 font-inter text-xs text-[#8C8C90] transition-colors hover:text-white disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </motion.div>
              ))}
            </section>
          )}

          {outgoingRivalries.length > 0 && (
            <section className="space-y-2">
              <SVJSectionHeader title="Sent challenges" />
              {outgoingRivalries.map((r) => (
                <div
                  key={r.id}
                  className="svj-radius-row flex items-center justify-between gap-3 border border-white/[0.06] bg-[#17171A]/60 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarImage
                      src={r.opponentAvatarUrl}
                      name={r.opponentUsername || r.opponentDisplayName}
                      className="h-11 w-11 shrink-0 rounded-2xl border border-white/10 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-inter text-sm font-semibold text-white">
                        Request sent
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 font-inter text-[11px] text-[#8C8C90]">
                        <Clock aria-hidden className="h-3 w-3" /> Waiting for{" "}
                        {r.opponentUsername || r.opponentDisplayName
                          ? `@${r.opponentUsername || r.opponentDisplayName}`
                          : "a response"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleCancelRivalry(r.id)}
                    disabled={rivalryBusy === r.id}
                    className="shrink-0 cursor-pointer font-inter text-[11px] text-[#8C8C90] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </section>
          )}

          {activeRivalries.length > 0 && (
            <section className="space-y-2">
              <SVJSectionHeader title="Active rivalries" />
              {activeRivalries.map((r) => (
                <div
                  key={r.id}
                  className="svj-radius-card svj-elev-1 flex items-center justify-between gap-3 border border-emerald-500/25 bg-[#17171A] p-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarImage
                      src={r.opponentAvatarUrl}
                      name={r.opponentUsername || r.opponentDisplayName}
                      className="h-11 w-11 shrink-0 rounded-2xl border border-white/10 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-inter text-sm font-semibold text-emerald-400">
                        vs @{r.opponentUsername || r.opponentDisplayName || "member"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-[#F4F2ED]">
                        {r.myScore ?? 0} XP
                        <span className="text-[#8C8C90]"> vs </span>
                        {r.opponentScore ?? 0} XP
                      </p>
                      <p className="mt-0.5 font-inter text-[11px] text-[#8C8C90]">
                        {remainingRivalryTime(r.expiresAt)}
                      </p>
                      <p className="font-inter text-[11px] text-[#8C8C90]">
                        {r.myEvents ?? 0} vs {r.opponentEvents ?? 0} verified activities
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedRivalry(r)}
                    className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 font-inter text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25"
                  >
                    View rivalry
                  </button>
                </div>
              ))}
            </section>
          )}

          {incomingRivalries.length === 0 &&
            outgoingRivalries.length === 0 &&
            activeRivalries.length === 0 && (
              <SVJEmptyState
                icon={Swords}
                compact
                title="No rivalries yet"
                description="Open the Members tab and tap Outperform on someone to start a verified head-to-head."
              />
            )}
        </div>
      )}

      {/* Notifications Section */}
      {activeSection === "notifications" && (
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <SVJEmptyState
              icon={Bell}
              compact
              title="No alerts yet"
              description="Rivalry requests, acceptances and verified score changes land here."
            />
          ) : (
            notifications.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  if (!n.read) void handleMarkRead(n.id);
                }}
                whileTap={{ scale: 0.97 }}
                className={`svj-radius-row flex cursor-pointer items-start gap-3 border p-4 transition-colors ${
                  n.read
                    ? "border-white/[0.06] bg-[#17171A]/60"
                    : "border-[#C81E3A]/25 bg-[#17171A]"
                }`}
              >
                <div className="shrink-0 rounded-xl bg-[#0B0B0C] p-2">
                  {n.type === "rivalry_request" && (
                    <Swords aria-hidden className="h-4 w-4 text-[#C81E3A]" />
                  )}
                  {n.type === "rivalry_accepted" && (
                    <Check aria-hidden className="h-4 w-4 text-emerald-400" />
                  )}
                  {n.type === "rivalry_declined" && (
                    <X aria-hidden className="h-4 w-4 text-[#E62846]" />
                  )}
                  {!n.type.startsWith("rivalry") && (
                    <Bell aria-hidden className="h-4 w-4 text-[#8C8C90]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-inter text-sm font-semibold text-white">
                      {n.title}
                    </p>
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-[#C81E3A]" />}
                  </div>
                  <p className="mt-0.5 font-inter text-[11px] leading-relaxed text-[#8C8C90]">
                    {n.body}
                  </p>
                  {n.fromUserName && (
                    <p className="mt-1 font-inter text-[11px] font-semibold text-[#E62846]">
                      From @{n.fromUserName}
                    </p>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Friends Section */}
      {activeSection === "friends" && (
        <>
          <section className="space-y-2">
            <SVJSectionHeader
              title="Friend requests"
              trailing={
                incoming.length > 0 ? (
                  <span className="rounded-full bg-[#C81E3A] px-2 py-0.5 font-mono text-[10px] text-white">
                    {incoming.length}
                  </span>
                ) : undefined
              }
            />
            {incoming.length === 0 ? (
              <SVJEmptyState
                icon={UserPlus}
                compact
                title="No requests waiting"
                description="When another member asks to connect, their request appears here for you to accept or decline."
              />
            ) : (
              incoming.map((r) => (
                <motion.div
                  key={r.friendship_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="svj-radius-row flex items-center justify-between gap-3 border border-white/[0.07] bg-[#17171A] p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar src={r.avatar_url} name={label(r)} />
                    <div className="min-w-0">
                      <p className="truncate font-inter text-sm font-semibold text-white">
                        @{label(r)}
                      </p>
                      <StatLine xp={r.total_xp} streak={r.current_streak} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void respond(r.friendship_id, "accepted")}
                      disabled={busyId === r.friendship_id}
                      className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 cursor-pointer"
                      aria-label="Accept request"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => void respond(r.friendship_id, "declined")}
                      disabled={busyId === r.friendship_id}
                      className="p-2 rounded-lg bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:text-white disabled:opacity-50 cursor-pointer"
                      aria-label="Decline request"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}

            {outgoing.map((r) => (
              <div
                key={r.friendship_id}
                className="svj-radius-row flex items-center justify-between gap-3 border border-white/[0.06] bg-[#17171A]/60 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={r.avatar_url} name={label(r)} />
                  <div className="min-w-0">
                    <p className="truncate font-inter text-sm font-semibold text-white">
                      @{label(r)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 font-inter text-[11px] text-[#8C8C90]">
                      <Clock aria-hidden className="h-3 w-3" /> Request sent
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void removeFriend(r.friendship_id)}
                  disabled={busyId === r.friendship_id}
                  className="shrink-0 cursor-pointer font-inter text-[11px] text-[#8C8C90] hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <SVJSectionHeader title="Friends leaderboard" icon={Users} />
            {loading ? (
              <p className="flex items-center gap-2 px-1 font-inter text-xs text-[#8C8C90]">
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> Loading your friends…
              </p>
            ) : friends.length === 0 ? (
              <SVJEmptyState
                icon={Users}
                compact
                title="No friends added yet"
                description="Search a member above and send your first request. Their XP and streak then rank next to yours."
              />
            ) : (
              friends.map((f, i) => (
                <div
                  key={f.friendship_id}
                  className="svj-radius-row flex items-center justify-between gap-3 border border-white/[0.07] bg-[#17171A] p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-6 shrink-0 text-center font-anton text-sm text-[#8C8C90]">
                      #{i + 1}
                    </span>
                    <Avatar src={f.avatar_url} name={label(f)} />
                    <div className="min-w-0">
                      <p className="truncate font-inter text-sm font-semibold text-white">
                        @{label(f)}
                      </p>
                      <StatLine xp={f.total_xp} streak={f.current_streak} />
                    </div>
                  </div>
                  <button
                    onClick={() => void removeFriend(f.friendship_id)}
                    disabled={busyId === f.friendship_id}
                    className="shrink-0 cursor-pointer font-inter text-[11px] text-[#8C8C90] hover:text-[#E62846]"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {selectedRivalry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-[#17171A] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-inter text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                  Active rivalry
                </p>
                <h3 className="mt-1 font-anton text-xl text-white">
                  You vs @
                  {selectedRivalry.opponentUsername ||
                    selectedRivalry.opponentDisplayName ||
                    "Member"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRivalry(null)}
                className="rounded-full bg-white/5 p-2 text-white transition-colors hover:bg-white/10"
                aria-label="Close rivalry dashboard"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl border border-[#C81E3A]/30 bg-[#0B0B0C] p-4">
                <p className="text-[10px] font-mono uppercase text-[#8C8C90]">Your verified XP</p>
                <p className="mt-1 font-mono text-2xl font-bold text-[#C81E3A]">
                  +{selectedRivalry.myScore ?? 0}
                </p>
                <p className="mt-1 text-[10px] font-mono text-[#8C8C90]">
                  {selectedRivalry.myEvents ?? 0} activities
                </p>
              </div>
              <div className="rounded-2xl border border-gold/30 bg-[#0B0B0C] p-4">
                <p className="text-[10px] font-mono uppercase text-[#8C8C90]">
                  Opponent verified XP
                </p>
                <p className="mt-1 font-mono text-2xl font-bold text-gold">
                  +{selectedRivalry.opponentScore ?? 0}
                </p>
                <p className="mt-1 text-[10px] font-mono text-[#8C8C90]">
                  {selectedRivalry.opponentEvents ?? 0} activities
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-[#0B0B0C] p-3 text-xs font-mono text-[#B8B8C0]">
              {(selectedRivalry.myScore ?? 0) === (selectedRivalry.opponentScore ?? 0)
                ? "The rivalry is tied. Complete a verified SVJ activity to take the lead."
                : (selectedRivalry.myScore ?? 0) > (selectedRivalry.opponentScore ?? 0)
                  ? "You are leading. Scores include only verified activity completed during this rivalry."
                  : "Your opponent leads. Scores include only verified activity completed during this rivalry."}
              <span className="block mt-1 text-[#8C8C90]">
                {remainingRivalryTime(selectedRivalry.expiresAt)}. Lifetime XP is not used here.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
