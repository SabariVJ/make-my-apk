import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Flame,
  Crown,
  Zap,
  Shield,
  MessageSquare,
  Send,
  Heart,
  UserPlus,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { useSVJ } from "../context/SVJContext";
import { FeedActivity, ReactionType, LeaderboardEntry } from "../types";
import { FriendsPanel } from "../components/FriendsPanel";
import { AvatarImage } from "../components/AvatarImage";
import { SVJEmptyState } from "../components/ui-primitives/SVJEmptyState";
import { useFriends } from "../hooks/useFriends";
import {
  createRivalry,
  getRivalries,
  cancelRivalry,
  type RivalryData,
} from "@/lib/rivalry.functions";

/**
 * Tier is the one place the app earns an all-caps, premium-gold badge — tier
 * names are the achievement moment the token was reserved for.
 */
const TierBadge: React.FC<{ tier: string }> = ({ tier }) => (
  <span className="shrink-0 rounded-full border border-[#C9A227]/30 bg-[#C9A227]/[0.10] px-2 py-0.5 font-inter text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C9A227]">
    {tier}
  </span>
);

/**
 * ONE identity block for every member-shaped surface: activity posts, the
 * member directory, comments.
 *
 * Username + tier read as primary, XP and streaks as secondary. Previously each
 * surface invented its own version, and the feed joined them with a middle dot.
 */
const MemberIdentity: React.FC<{
  name: string;
  tier?: string | null;
  avatar?: string;
  avatarSize?: string;
  verified?: boolean;
  vip?: boolean;
  meta?: React.ReactNode;
  onOpen?: () => void;
}> = ({
  name,
  tier,
  avatar,
  avatarSize = "h-10 w-10",
  verified = false,
  vip = false,
  meta,
  onOpen,
}) => (
  <div
    className={`flex min-w-0 items-center gap-3 ${onOpen ? "group cursor-pointer" : ""}`}
    onClick={onOpen}
  >
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl border border-white/10 ${avatarSize} ${
        onOpen ? "transition-colors group-hover:border-[#C81E3A]" : ""
      }`}
    >
      <AvatarImage src={avatar} name={name} className="h-full w-full object-cover" />
    </div>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span
          className={`truncate font-inter text-sm font-semibold text-[#F4F2ED] ${
            onOpen ? "transition-colors group-hover:text-[#E62846]" : ""
          }`}
        >
          {name}
        </span>
        {verified && <Shield aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#C81E3A]" />}
        {vip && <Crown aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#C9A227]" />}
        {tier && <TierBadge tier={tier} />}
      </div>
      {meta && <div className="mt-0.5 min-w-0">{meta}</div>}
    </div>
  </div>
);

export const CommunityView: React.FC = () => {
  const {
    feed,
    toggleReaction,
    addComment,
    setSelectedMemberModal,
    setComparingMember,
    leaderboard,
    user,
  } = useSVJ();
  const [activeSubTab, setActiveSubTab] = useState<"feed" | "directory" | "friends">("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [rivalries, setRivalries] = useState<RivalryData[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  /** Rivalry feedback shown inline inside the Members tab (in-app, SVJ-styled). */
  const [rivalryFeedback, setRivalryFeedback] = useState<{
    kind: "success" | "error";
    text: string;
    retryId?: string;
  } | null>(null);
  const friendsApi = useFriends();

  const loadRivalries = useCallback(async () => {
    try {
      const res = await getRivalries();
      if (Array.isArray(res)) setRivalries(res);
    } catch {
      /* polling refresh — a transient failure must not blank the tab */
    }
  }, []);

  useEffect(() => {
    void loadRivalries();
  }, [loadRivalries]);

  /** Get rivalry state between current user and another member */
  const getRivalryState = (
    otherId: string,
  ): "none" | "outgoing_pending" | "incoming_pending" | "active" => {
    for (const r of rivalries) {
      if (
        r.status === "cancelled" ||
        r.status === "declined" ||
        r.status === "completed" ||
        r.status === "expired"
      )
        continue;
      const isChallenger = r.challengerId === user.id && r.opponentId === otherId;
      const isOpponent = r.opponentId === user.id && r.challengerId === otherId;
      if (isChallenger && r.status === "pending") return "outgoing_pending";
      if (isOpponent && r.status === "pending") return "incoming_pending";
      if ((isChallenger || isOpponent) && r.status === "active") return "active";
    }
    return "none";
  };

  const reactionEmojis: { type: ReactionType; emoji: string; label: string }[] = [
    { type: "fire", emoji: "🔥", label: "Fire" },
    { type: "crown", emoji: "👑", label: "Crown" },
    { type: "hundred", emoji: "💯", label: "Solid" },
    { type: "bolt", emoji: "⚡", label: "Energy" },
    { type: "wolf", emoji: "🐺", label: "Apex" },
  ];

  const directoryMembers: LeaderboardEntry[] = friendsApi.members.map((member) => ({
    id: member.id,
    username: member.username || member.display_name || "member",
    avatar: member.avatar_url || "",
    totalXP: member.total_xp,
    weeklyXP: 0,
    monthlyXP: 0,
    streak: member.current_streak,
    rank: member.rank,
    rankDelta: 0,
    tier: "Initiate",
    country: "",
    bio: "",
  }));
  const filteredMembers = directoryMembers.filter(
    (m) =>
      m.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tier.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleCommentSubmit = (activityId: string) => {
    const text = commentInputs[activityId];
    if (text) {
      addComment(activityId, text);
      setCommentInputs((prev) => ({ ...prev, [activityId]: "" }));
    }
  };

  const handleSendRivalry = async (opponentId: string) => {
    // Identity is resolved from the authenticated account id, never from
    // display names, handles or avatars. An obvious self-action makes no
    // network request at all.
    if (opponentId === user.id) {
      setRivalryFeedback({ kind: "error", text: "You cannot challenge your own account." });
      return;
    }
    // A single in-flight request per opponent: repeated taps are ignored
    // instead of creating duplicate requests.
    if (sendingId) return;
    setSendingId(opponentId);
    setRivalryFeedback(null);
    try {
      const res = await createRivalry({ data: { opponentId } });
      if (res?.error || !res?.ok) {
        setRivalryFeedback({
          kind: "error",
          text: res?.error || "Could not send the rivalry request. Please retry.",
          retryId: opponentId,
        });
      } else {
        if (res?.rivalry) {
          setRivalries((prev) => [res.rivalry!, ...prev]);
        } else {
          void loadRivalries();
        }
        const target = friendsApi.members.find((m) => m.id === opponentId);
        const handle =
          target?.username || target?.display_name
            ? `@${target.username || target.display_name}`
            : "that member";
        setRivalryFeedback({
          kind: "success",
          text: res?.existing
            ? `A request to ${handle} is already waiting for a response.`
            : `Request sent — waiting for ${handle}.`,
        });
      }
    } catch (err) {
      // A rejected request must never leave the button stuck or crash the view.
      setRivalryFeedback({
        kind: "error",
        text:
          err instanceof Error ? err.message : "Could not send the rivalry request. Please retry.",
        retryId: opponentId,
      });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header & Sub-tab Selector */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="font-anton text-2xl tracking-wide text-white sm:text-3xl">
            Guild community
          </h1>
          <p className="mt-1 font-inter text-xs text-[#8C8C90]">
            Connect, compete, and celebrate self-mastery with top 1% improvers.
          </p>
        </div>

        <div className="flex items-center rounded-xl border border-white/10 bg-[#17171A] p-1 font-inter text-xs">
          <button
            onClick={() => setActiveSubTab("feed")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeSubTab === "feed"
                ? "bg-[#C81E3A] text-white"
                : "text-[#8C8C90] hover:text-white"
            }`}
          >
            Activity Feed
          </button>
          <button
            onClick={() => setActiveSubTab("directory")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeSubTab === "directory"
                ? "bg-[#C81E3A] text-white"
                : "text-[#8C8C90] hover:text-white"
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveSubTab("friends")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer relative ${
              activeSubTab === "friends"
                ? "bg-[#C81E3A] text-white"
                : "text-[#8C8C90] hover:text-white"
            }`}
          >
            Friends
            {friendsApi.incoming.length > 0 && activeSubTab !== "friends" && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#C81E3A]" />
            )}
          </button>
        </div>
      </div>

      {activeSubTab === "friends" ? (
        <FriendsPanel friendsApi={friendsApi} />
      ) : activeSubTab === "feed" ? (
        /* ACTIVITY FEED TAB */
        <div className="space-y-4">
          {feed.length === 0 && (
            <SVJEmptyState
              icon={Inbox}
              title="The feed is quiet"
              description="Your verified SVJ activity and your friends' milestones show up here as they happen. Add a friend to fill it faster."
            />
          )}
          {feed.map((item, index) => {
            const userReaction = item.userReactions[user.id];

            return (
              <div
                key={`${item.id}-${index}`}
                className="svj-radius-card svj-elev-1 space-y-4 border border-white/[0.06] bg-[#17171A] p-4"
              >
                {/* Author Info Header */}
                <div className="flex items-start justify-between gap-3">
                  <MemberIdentity
                    name={item.username}
                    avatar={item.userAvatar}
                    tier={item.userTier}
                    verified={item.isVerified}
                    vip={item.isVIP}
                    onOpen={() => {
                      const found = leaderboard.find(
                        (l) => l.id === item.userId || l.username === item.username,
                      );
                      if (found) setSelectedMemberModal(found);
                    }}
                    meta={
                      <span className="font-inter text-[11px] text-[#8C8C90]">
                        {item.timestamp}
                      </span>
                    }
                  />

                  {item.xpEarned && (
                    <span className="shrink-0 rounded-full border border-[#C81E3A]/35 bg-[#C81E3A]/15 px-2.5 py-1 font-mono text-xs font-bold text-[#E62846]">
                      +{item.xpEarned} XP
                    </span>
                  )}
                </div>

                {/* Activity Detail */}
                <div className="svj-radius-row space-y-1 border border-white/[0.05] bg-[#0B0B0C] p-3">
                  <h3 className="font-inter font-bold text-sm text-white">{item.title}</h3>
                  <p className="text-xs text-[#8C8C90] font-inter leading-relaxed">
                    {item.details}
                  </p>
                </div>

                {/* Motivational Reactions Bar */}
                <div className="flex items-center gap-2 pt-1 overflow-x-auto pb-1">
                  {reactionEmojis.map((r) => {
                    const count = item.reactions[r.type] || 0;
                    const isSelected = userReaction === r.type;

                    return (
                      <button
                        key={r.type}
                        onClick={() => toggleReaction(item.id, r.type)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#C81E3A]/30 border border-[#C81E3A] text-white scale-105"
                            : "bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:text-white"
                        }`}
                      >
                        <span>{r.emoji}</span>
                        <span>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Comments Section */}
                <div className="border-t border-white/5 pt-3 space-y-3">
                  {item.comments.length > 0 && (
                    <div className="space-y-2">
                      {item.comments.map((c, cIdx) => (
                        <div
                          key={`${c.id}-${cIdx}`}
                          className="svj-radius-row flex items-start gap-2.5 border border-white/[0.05] bg-[#08080A] p-2.5"
                        >
                          <AvatarImage
                            src={c.avatar}
                            name={c.username}
                            className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-inter text-[11px] font-semibold text-white">
                                {c.username}
                              </span>
                              <span className="shrink-0 font-inter text-[10px] text-[#8C8C90]">
                                {c.createdAt}
                              </span>
                            </div>
                            <p className="mt-0.5 font-inter text-xs text-[#B8B8C0]">{c.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comment Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add motivational encouragement..."
                      value={commentInputs[item.id] || ""}
                      onChange={(e) =>
                        setCommentInputs({ ...commentInputs, [item.id]: e.target.value })
                      }
                      onKeyDown={(e) => e.key === "Enter" && handleCommentSubmit(item.id)}
                      className="svj-radius-row flex-1 border border-white/10 bg-[#0B0B0C] px-3.5 py-2 font-inter text-xs text-white placeholder:text-[#8C8C90] focus:border-[#C81E3A] focus:outline-none"
                    />
                    <button
                      onClick={() => handleCommentSubmit(item.id)}
                      className="rounded-xl bg-[#C81E3A] p-2 text-white transition-colors hover:bg-[#A0182E]"
                      aria-label="Post comment"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MEMBER DIRECTORY TAB */
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#8C8C90]" />
            <input
              type="text"
              placeholder="Search members by username or tier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#17171A] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#C81E3A]"
            />
          </div>

          {/* In-app rivalry feedback banner (SVJ-styled, replaces browser dialogs) */}
          {activeSubTab === "directory" && rivalryFeedback && (
            <div
              role={rivalryFeedback.kind === "error" ? "alert" : "status"}
              className={`flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs font-mono ${
                rivalryFeedback.kind === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              <span className="flex items-start gap-2">
                {rivalryFeedback.kind === "error" ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                {rivalryFeedback.text}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {rivalryFeedback.kind === "error" && rivalryFeedback.retryId && (
                  <button
                    type="button"
                    onClick={() => {
                      const retryId = rivalryFeedback.retryId;
                      setRivalryFeedback(null);
                      if (retryId) void handleSendRivalry(retryId);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-rose-500/40 px-2 py-1 text-[10px] font-bold uppercase hover:bg-rose-500/20"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRivalryFeedback(null)}
                  className="rounded-lg px-1.5 py-1 text-[10px] uppercase opacity-70 hover:opacity-100"
                  aria-label="Dismiss message"
                >
                  ✕
                </button>
              </span>
            </div>
          )}

          {filteredMembers.length === 0 && (
            <SVJEmptyState
              icon={Inbox}
              title={searchQuery ? "No member matches that search" : "The directory is just you"}
              description={
                searchQuery
                  ? "Try a shorter name, or clear the search to see everyone in the guild."
                  : "As real SVJ members join and appear in the directory, they show up here."
              }
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredMembers.map((m) => {
              const isSelf = m.id === user.id;
              const rivalryState = isSelf ? "none" : getRivalryState(m.id);

              return (
                <motion.div
                  key={m.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedMemberModal(m)}
                  className="svj-radius-card svj-elev-1 flex cursor-pointer items-start justify-between gap-3 border border-white/[0.06] bg-[#17171A] p-4 transition-colors hover:border-[#C81E3A]/40"
                >
                  <MemberIdentity
                    name={m.username}
                    avatar={m.avatar}
                    tier={m.tier}
                    verified={m.isVerified}
                    avatarSize="h-11 w-11"
                    meta={
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        <span className="font-mono text-[11px] text-[#F4F2ED]">
                          {m.totalXP.toLocaleString()} XP
                        </span>
                        <span className="inline-flex items-center gap-1 font-inter text-[11px] font-medium text-[#C9A227]">
                          <Flame aria-hidden className="h-3 w-3" />
                          {m.streak} day streak
                        </span>
                      </span>
                    }
                  />

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full border border-white/10 bg-[#0B0B0C] px-2.5 py-1 font-mono text-[11px] text-[#F4F2ED]">
                      #{m.rank}
                    </span>
                    {/* Self accounts never get opponent actions; stale clicks are
                        resolved against the authenticated id inside the handler. */}
                    {!isSelf && rivalryState === "none" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSendRivalry(m.id);
                        }}
                        disabled={sendingId === m.id || !!sendingId}
                        className="flex cursor-pointer items-center gap-1 rounded-full border border-[#C81E3A]/40 bg-[#C81E3A]/15 px-3 py-1.5 font-inter text-[10px] font-semibold text-[#E62846] transition-colors hover:bg-[#C81E3A]/25 disabled:opacity-50"
                      >
                        {sendingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Outperform
                      </button>
                    )}
                    {rivalryState === "outgoing_pending" && (
                      <span className="rounded-full border border-gold/40 bg-gold/15 px-3 py-1.5 font-inter text-[10px] font-semibold text-gold">
                        Request sent
                      </span>
                    )}
                    {rivalryState === "incoming_pending" && (
                      <span className="rounded-full border border-blue-500/40 bg-blue-500/15 px-3 py-1.5 font-inter text-[10px] font-semibold text-blue-400">
                        Wants to compete
                      </span>
                    )}
                    {rivalryState === "active" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setComparingMember(m);
                        }}
                        className="cursor-pointer rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 font-inter text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25"
                      >
                        View rivalry
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
