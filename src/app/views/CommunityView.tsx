import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Flame, Crown, Zap, Shield, MessageSquare, Send, Heart, UserPlus, Filter } from 'lucide-react';
import { useSVJ } from '../context/SVJContext';
import { FeedActivity, ReactionType, LeaderboardEntry } from '../types';
import { FriendsPanel } from '../components/FriendsPanel';
import { useFriends } from '../hooks/useFriends';

export const CommunityView: React.FC = () => {
  const { feed, toggleReaction, addComment, setSelectedMemberModal, leaderboard, user } = useSVJ();
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'directory' | 'friends'>('feed');
  const [searchQuery, setSearchQuery] = useState('');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const friendsApi = useFriends({
    username: user.username,
    displayName: user.name,
    avatar: user.avatar,
    totalXP: user.totalXP,
    currentStreak: user.currentStreak,
  });

  const reactionEmojis: { type: ReactionType; emoji: string; label: string }[] = [
    { type: 'fire', emoji: '🔥', label: 'Fire' },
    { type: 'crown', emoji: '👑', label: 'Crown' },
    { type: 'hundred', emoji: '💯', label: 'Solid' },
    { type: 'bolt', emoji: '⚡', label: 'Energy' },
    { type: 'wolf', emoji: '🐺', label: 'Apex' },
  ];

  const filteredMembers = leaderboard.filter(
    m =>
      m.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCommentSubmit = (activityId: string) => {
    const text = commentInputs[activityId];
    if (text) {
      addComment(activityId, text);
      setCommentInputs(prev => ({ ...prev, [activityId]: '' }));
    }
  };

  return (
    <div className="space-y-6 pb-24">
      
      {/* Header & Sub-tab Selector */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="font-anton text-3xl text-white uppercase tracking-wide">
            Guild Community
          </h1>
          <p className="text-xs text-[#8C8C90] font-inter">
            Connect, compete, and celebrate self-mastery with top 1% improvers.
          </p>
        </div>

        <div className="p-1 rounded-2xl bg-[#17171A] border border-white/10 flex items-center text-xs font-mono">
          <button
            onClick={() => setActiveSubTab('feed')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'feed'
                ? 'bg-[#C81E3A] text-white'
                : 'text-[#8C8C90] hover:text-white'
            }`}
          >
            Activity Feed
          </button>
          <button
            onClick={() => setActiveSubTab('directory')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'directory'
                ? 'bg-[#C81E3A] text-white'
                : 'text-[#8C8C90] hover:text-white'
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setActiveSubTab('friends')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer relative ${
              activeSubTab === 'friends'
                ? 'bg-[#C81E3A] text-white'
                : 'text-[#8C8C90] hover:text-white'
            }`}
          >
            Friends
            {friendsApi.incoming.length > 0 && activeSubTab !== 'friends' && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#C81E3A]" />
            )}
          </button>
        </div>
      </div>

      {activeSubTab === 'friends' ? (
        <FriendsPanel friendsApi={friendsApi} />
      ) : activeSubTab === 'feed' ? (
        /* ACTIVITY FEED TAB */
        <div className="space-y-4">
          {feed.map((item, index) => {
            const userReaction = item.userReactions[user.id];

            return (
              <motion.div
                key={`${item.id}-${index}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-2xl bg-[#17171A] border border-white/10 space-y-4 shadow-xl"
              >
                {/* Author Info Header */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => {
                      const found = leaderboard.find(l => l.id === item.userId || l.username === item.username);
                      if (found) setSelectedMemberModal(found);
                    }}
                  >
                    <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-white/10 group-hover:border-[#C81E3A] transition-colors">
                      <img src={item.userAvatar} alt={item.username} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-anton text-sm text-white uppercase group-hover:text-[#C81E3A] transition-colors">
                          {item.username}
                        </span>
                        {item.isVerified && <Shield className="w-3.5 h-3.5 text-[#C81E3A] fill-[#C81E3A]/20" />}
                        {item.isVIP && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />}
                      </div>
                      <div className="text-[10px] font-mono text-[#8C8C90]">
                        {item.userTier} Tier • {item.timestamp}
                      </div>
                    </div>
                  </div>

                  {item.xpEarned && (
                    <span className="px-2.5 py-1 rounded-full bg-[#C81E3A]/20 border border-[#C81E3A]/40 text-[#C81E3A] text-xs font-mono font-bold">
                      +{item.xpEarned} XP
                    </span>
                  )}
                </div>

                {/* Activity Detail */}
                <div className="p-3.5 rounded-xl bg-[#0B0B0C] border border-white/5 space-y-1">
                  <h3 className="font-inter font-bold text-sm text-white">{item.title}</h3>
                  <p className="text-xs text-[#8C8C90] font-inter leading-relaxed">{item.details}</p>
                </div>

                {/* Motivational Reactions Bar */}
                <div className="flex items-center gap-2 pt-1 overflow-x-auto pb-1">
                  {reactionEmojis.map(r => {
                    const count = item.reactions[r.type] || 0;
                    const isSelected = userReaction === r.type;

                    return (
                      <button
                        key={r.type}
                        onClick={() => toggleReaction(item.id, r.type)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#C81E3A]/30 border border-[#C81E3A] text-white scale-105'
                            : 'bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:text-white'
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
                        <div key={`${c.id}-${cIdx}`} className="p-2.5 rounded-xl bg-[#0B0B0C]/60 text-xs flex items-start gap-2.5">
                          <img src={c.avatar} alt={c.username} className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-anton text-white uppercase text-[11px]">{c.username}</span>
                              <span className="text-[9px] font-mono text-[#8C8C90]">{c.createdAt}</span>
                            </div>
                            <p className="text-zinc-300 font-inter text-xs mt-0.5">{c.text}</p>
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
                      value={commentInputs[item.id] || ''}
                      onChange={e =>
                        setCommentInputs({ ...commentInputs, [item.id]: e.target.value })
                      }
                      onKeyDown={e => e.key === 'Enter' && handleCommentSubmit(item.id)}
                      className="flex-1 px-3.5 py-2 rounded-xl bg-[#0B0B0C] border border-white/10 text-xs text-white placeholder:text-[#8C8C90] focus:outline-none focus:border-[#C81E3A]"
                    />
                    <button
                      onClick={() => handleCommentSubmit(item.id)}
                      className="p-2 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] text-white cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </motion.div>
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
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#17171A] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#C81E3A]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredMembers.map(m => (
              <motion.div
                key={m.id}
                whileHover={{ scale: 1.02 }}
                onClick={() => setSelectedMemberModal(m)}
                className="p-4 rounded-2xl bg-[#17171A] border border-white/10 hover:border-[#C81E3A]/50 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/10">
                    <img src={m.avatar} alt={m.username} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-anton text-sm text-white uppercase">{m.username}</span>
                      {m.isVerified && <Shield className="w-3.5 h-3.5 text-[#C81E3A]" />}
                    </div>
                    <div className="text-[10px] font-mono text-[#8C8C90]">
                      {m.tier} • {m.totalXP.toLocaleString()} XP
                    </div>
                    <div className="text-[10px] font-mono text-orange-400 mt-0.5">
                      🔥 {m.streak} day streak
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-full bg-[#0B0B0C] border border-white/10 text-xs font-mono text-white">
                    Rank #{m.rank}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
