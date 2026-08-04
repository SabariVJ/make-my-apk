import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, UserPlus, Check, X, Flame, Zap, Loader2, Clock, Users } from 'lucide-react';
import { useFriends, SearchRow } from '../hooks/useFriends';

const Avatar: React.FC<{ src: string | null; name: string }> = ({ src, name }) =>
  src ? (
    <img src={src} alt={name} className="w-11 h-11 rounded-xl object-cover border border-white/10" />
  ) : (
    <div className="w-11 h-11 rounded-xl bg-[#0B0B0C] border border-white/10 flex items-center justify-center font-anton text-white uppercase">
      {name.slice(0, 1)}
    </div>
  );

const StatLine: React.FC<{ xp: number; streak: number }> = ({ xp, streak }) => (
  <div className="flex items-center gap-3 text-[10px] font-mono text-[#8C8C90] mt-0.5">
    <span className="flex items-center gap-1 text-[#C81E3A]">
      <Zap className="w-3 h-3" /> {xp.toLocaleString()} XP
    </span>
    <span className="flex items-center gap-1 text-orange-400">
      <Flame className="w-3 h-3" /> {streak}d
    </span>
  </div>
);

export const FriendsPanel: React.FC<{ friendsApi: ReturnType<typeof useFriends> }> = ({
  friendsApi,
}) => {
  const { friends, incoming, outgoing, loading, error, busyId, search, sendRequest, respond, removeFriend } =
    friendsApi;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);

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
    r.username || r.display_name || 'Voyager';

  return (
    <div className="space-y-6">
      {/* Search */}
      <div>
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#8C8C90]" />
          {searching && <Loader2 className="absolute right-3.5 top-3 w-4 h-4 text-[#C81E3A] animate-spin" />}
          <input
            type="text"
            placeholder="Search members by username to add as friend..."
            value={query}
            onChange={e => void runSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#17171A] border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#C81E3A]"
          />
        </div>

        {query.trim() !== '' && (
          <div className="mt-3 space-y-2">
            {results.length === 0 && !searching && (
              <p className="text-xs font-mono text-[#8C8C90] px-1">No members match "{query}".</p>
            )}
            {results.map(r => (
              <div
                key={r.id}
                className="p-3 rounded-2xl bg-[#17171A] border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={r.avatar_url} name={label(r)} />
                  <div className="min-w-0">
                    <p className="font-anton text-sm text-white uppercase truncate">@{label(r)}</p>
                    <StatLine xp={r.total_xp} streak={r.current_streak} />
                  </div>
                </div>
                {r.friendship_status === 'accepted' ? (
                  <span className="text-[10px] font-mono text-emerald-400 shrink-0">Friends</span>
                ) : r.friendship_status === 'pending' ? (
                  <span className="text-[10px] font-mono text-[#8C8C90] shrink-0">
                    {r.is_incoming ? 'Wants to add you' : 'Requested'}
                  </span>
                ) : (
                  <button
                    onClick={() => void sendRequest(r.id)}
                    disabled={busyId === r.id}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-[#C81E3A] hover:bg-[#A0182E] disabled:opacity-50 text-white text-xs font-mono flex items-center gap-1.5 cursor-pointer"
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

      {error && (
        <p className="text-xs font-mono text-red-400 px-1">{error}</p>
      )}

      {/* Incoming requests */}
      <section className="space-y-2">
        <h2 className="font-anton text-sm text-white uppercase tracking-wide flex items-center gap-2">
          Friend Requests
          {incoming.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-[#C81E3A] text-white text-[10px] font-mono">
              {incoming.length}
            </span>
          )}
        </h2>
        {incoming.length === 0 ? (
          <p className="text-xs font-mono text-[#8C8C90]">No pending requests.</p>
        ) : (
          incoming.map(r => (
            <motion.div
              key={r.friendship_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-2xl bg-[#17171A] border border-white/10 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar src={r.avatar_url} name={label(r)} />
                <div className="min-w-0">
                  <p className="font-anton text-sm text-white uppercase truncate">@{label(r)}</p>
                  <StatLine xp={r.total_xp} streak={r.current_streak} />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => void respond(r.friendship_id, 'accepted')}
                  disabled={busyId === r.friendship_id}
                  className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 cursor-pointer"
                  aria-label="Accept request"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => void respond(r.friendship_id, 'declined')}
                  disabled={busyId === r.friendship_id}
                  className="p-2 rounded-xl bg-[#0B0B0C] border border-white/10 text-[#8C8C90] hover:text-white disabled:opacity-50 cursor-pointer"
                  aria-label="Decline request"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}

        {outgoing.map(r => (
          <div
            key={r.friendship_id}
            className="p-3 rounded-2xl bg-[#17171A]/60 border border-white/5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar src={r.avatar_url} name={label(r)} />
              <div className="min-w-0">
                <p className="font-anton text-sm text-white uppercase truncate">@{label(r)}</p>
                <p className="text-[10px] font-mono text-[#8C8C90] flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" /> Request sent
                </p>
              </div>
            </div>
            <button
              onClick={() => void removeFriend(r.friendship_id)}
              disabled={busyId === r.friendship_id}
              className="text-[10px] font-mono text-[#8C8C90] hover:text-white shrink-0 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ))}
      </section>

      {/* Friends mini-leaderboard */}
      <section className="space-y-2">
        <h2 className="font-anton text-sm text-white uppercase tracking-wide flex items-center gap-2">
          <Users className="w-4 h-4 text-[#C81E3A]" /> Friends Leaderboard
        </h2>
        {loading ? (
          <p className="text-xs font-mono text-[#8C8C90]">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="text-xs font-mono text-[#8C8C90]">
            No friends yet — search above to send your first request.
          </p>
        ) : (
          friends.map((f, i) => (
            <div
              key={f.friendship_id}
              className="p-3 rounded-2xl bg-[#17171A] border border-white/10 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 text-center font-mono text-xs text-[#8C8C90]">#{i + 1}</span>
                <Avatar src={f.avatar_url} name={label(f)} />
                <div className="min-w-0">
                  <p className="font-anton text-sm text-white uppercase truncate">@{label(f)}</p>
                  <StatLine xp={f.total_xp} streak={f.current_streak} />
                </div>
              </div>
              <button
                onClick={() => void removeFriend(f.friendship_id)}
                disabled={busyId === f.friendship_id}
                className="text-[10px] font-mono text-[#8C8C90] hover:text-red-400 shrink-0 cursor-pointer"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
};