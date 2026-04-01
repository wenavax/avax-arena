'use client';

import { motion } from 'framer-motion';
import { Trophy, Medal, Crown, TrendingUp, Gamepad2, Loader2, Wallet, Swords, AlertTriangle, RefreshCw, Star } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { cn, shortenAddress } from '@/lib/utils';
import { useAccount } from 'wagmi';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface LeaderboardEntry {
  rank: number;
  wallet: string;
  fsbPoints: number;
  totalPoints: number;
  totalBattles: number;
  wins: number;
  losses: number;
  wins3v3: number;
  quests: number;
  mints: number;
  fusions: number;
  winRate: number;
  avaxWon: number;
}

interface PrevMonthEntry {
  rank: number;
  wallet: string;
  points: number;
  wins: number;
  wins3v3: number;
  mints: number;
  fusions: number;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  total: number;
  monthEnd?: string;
  previousMonth?: {
    monthKey: string;
    top10: PrevMonthEntry[];
  } | null;
}

/* ---------------------------------------------------------------------------
 * Podium styling
 * ------------------------------------------------------------------------- */

const podiumColors = [
  { bg: 'from-frost-gold/20 to-frost-gold/5', border: 'border-frost-gold/40', glow: 'shadow-glow-gold', icon: Crown, label: '1st' },
  { bg: 'from-white/10 to-white/[0.02]', border: 'border-white/20', glow: '', icon: Medal, label: '2nd' },
  { bg: 'from-frost-orange/20 to-frost-orange/5', border: 'border-frost-orange/30', glow: '', icon: Medal, label: '3rd' },
];

/* ---------------------------------------------------------------------------
 * Page Component
 * ------------------------------------------------------------------------- */

export default function LeaderboardPage() {
  const { address, isConnected } = useAccount();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [myStats, setMyStats] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [monthEnd, setMonthEnd] = useState<string | null>(null);
  const [previousMonth, setPreviousMonth] = useState<{ monthKey: string; top10: PrevMonthEntry[] } | null>(null);
  const [countdown, setCountdown] = useState('');
  const PAGE_SIZE = 20;

  /* -----------------------------------------------------------------------
   * Countdown timer
   * --------------------------------------------------------------------- */
  useEffect(() => {
    if (!monthEnd) return;
    const timer = setInterval(() => {
      const now = Date.now();
      const end = new Date(monthEnd).getTime();
      const diff = end - now;
      if (diff <= 0) { setCountdown('Season ended!'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${d}d ${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, [monthEnd]);

  /* -----------------------------------------------------------------------
   * Sync on-chain events then fetch leaderboard
   * --------------------------------------------------------------------- */
  const syncAndFetch = useCallback(async () => {
    setLoading(true);
    setSyncing(true);
    setError(null);

    try {
      // 1) Sync on-chain battle events to DB
      await fetch('/avalanche/api/v1/leaderboard/sync', { method: 'POST' });
      setSyncing(false);

      // 2) Fetch leaderboard
      const res = await fetch('/avalanche/api/v1/leaderboard?limit=100');
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      const data: LeaderboardResponse = await res.json();
      setLeaderboard(data.leaderboard);
      setTotalPlayers(data.total);
      if (data.monthEnd) setMonthEnd(data.monthEnd);
      if (data.previousMonth) setPreviousMonth(data.previousMonth);
    } catch (err) {
      console.error('Leaderboard error:', err);
      setError('Failed to load leaderboard data.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  /* -----------------------------------------------------------------------
   * Fetch connected user's stats
   * --------------------------------------------------------------------- */
  const fetchMyStats = useCallback(async () => {
    if (!address) { setMyStats(null); return; }
    try {
      const res = await fetch(`/avalanche/api/v1/leaderboard?wallet=${address}`);
      if (!res.ok) { setMyStats(null); return; }
      const data: LeaderboardResponse = await res.json();
      if (data.leaderboard && data.leaderboard.length > 0) {
        setMyStats(data.leaderboard[0]);
      } else {
        setMyStats(null);
      }
    } catch {
      setMyStats(null);
    }
  }, [address]);

  /* -----------------------------------------------------------------------
   * Effects
   * --------------------------------------------------------------------- */
  useEffect(() => {
    syncAndFetch();
  }, [syncAndFetch]);

  useEffect(() => {
    if (isConnected && address) {
      fetchMyStats();
    } else {
      setMyStats(null);
    }
  }, [isConnected, address, fetchMyStats]);

  /* -----------------------------------------------------------------------
   * Refresh handler
   * --------------------------------------------------------------------- */
  const handleRefresh = async () => {
    await syncAndFetch();
    if (isConnected && address) {
      await fetchMyStats();
    }
  };

  /* -----------------------------------------------------------------------
   * Helpers
   * --------------------------------------------------------------------- */
  const winRateColor = (rate: number) =>
    rate >= 60 ? 'text-frost-green' : rate >= 40 ? 'text-yellow-400' : 'text-frost-red';

  /* -----------------------------------------------------------------------
   * Render
   * --------------------------------------------------------------------- */
  return (
    <div className="min-h-screen px-4 py-6 sm:py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <Trophy className="w-10 h-10 text-frost-gold" />
          <h1 className="text-4xl md:text-5xl font-display font-bold gradient-text">
            LEADERBOARD
          </h1>
          <Trophy className="w-10 h-10 text-frost-gold" />
        </div>
        <p className="text-white/50 text-lg">Monthly Season — ranked by Activity Points</p>
        {countdown && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-frost-red/10 border border-frost-red/20">
            <span className="text-xs text-white/40 font-pixel">SEASON ENDS IN</span>
            <span className="text-sm font-mono text-frost-red font-bold">{countdown}</span>
          </div>
        )}
      </motion.div>

      {/* Previous Month Top 10 */}
      {previousMonth && previousMonth.top10.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12 max-w-2xl mx-auto"
        >
          <h2 className="text-lg font-display font-bold text-white mb-3 flex items-center gap-2">
            <Star className="w-5 h-5 text-frost-gold" />
            Previous Season ({previousMonth.monthKey})
          </h2>
          <div className="glass-card p-4 border border-frost-gold/10">
            <div className="space-y-2">
              {previousMonth.top10.map((p, i) => (
                <div key={p.wallet} className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-sm',
                  i === 0 ? 'bg-frost-gold/10 border border-frost-gold/20' :
                  i === 1 ? 'bg-white/[0.04] border border-white/10' :
                  i === 2 ? 'bg-frost-orange/5 border border-frost-orange/10' :
                  'bg-white/[0.02]'
                )}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-6 text-center font-bold text-xs',
                      i === 0 ? 'text-frost-gold' : i === 1 ? 'text-white/60' : i === 2 ? 'text-frost-orange' : 'text-white/30'
                    )}>
                      {i === 0 ? '\u{1F451}' : `#${p.rank}`}
                    </span>
                    <span className="font-mono text-white/70 text-xs">{shortenAddress(p.wallet)}</span>
                  </div>
                  <span className="font-mono text-frost-cyan font-bold text-xs">{p.points.toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Your Stats Card */}
      {isConnected && address && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <h2 className="text-xl font-display font-bold text-white mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-frost-cyan" />
            Your Stats
          </h2>
          <div className="glass-card p-6 bg-gradient-to-r from-frost-cyan/5 to-frost-purple/5 border border-frost-cyan/20">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="w-6 h-6 animate-spin text-frost-cyan" />
                <span className="text-white/60">Loading your stats...</span>
              </div>
            ) : myStats ? (
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <span className="text-xs text-white/40 block mb-1">Rank</span>
                  <span className="text-3xl font-bold font-mono text-white">
                    #{myStats.rank}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-white/40 block mb-1">FSB Points</span>
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-frost-gold" />
                    <span className="text-3xl font-bold font-mono text-frost-gold">
                      {myStats.fsbPoints.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 py-4">
                <Star className="w-5 h-5 text-frost-gold/30" />
                <span className="text-white/40 text-sm">0 FSB — Battle to earn points!</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 mb-12 border border-frost-red/30 text-center"
        >
          <AlertTriangle className="w-8 h-8 text-frost-red mx-auto mb-3" />
          <p className="text-frost-red font-semibold mb-2">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 text-sm rounded-lg bg-frost-red/20 text-frost-red hover:bg-frost-red/30 transition-colors"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* Podium */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-16"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-frost-gold" />
            {syncing && <span className="text-xs text-white/40">Syncing on-chain events...</span>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[1, 0, 2].map((idx, displayIdx) => {
              const style = podiumColors[idx];
              const Icon = style.icon;
              const heights = ['h-64', 'h-72', 'h-56'];
              const entry = leaderboard[idx];

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + displayIdx * 0.15 }}
                  className={cn(
                    'glass-card p-6 flex flex-col items-center justify-center',
                    heights[displayIdx],
                    `bg-gradient-to-b ${style.bg}`,
                    style.border,
                    style.glow
                  )}
                >
                  <div className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center mb-3',
                    entry ? 'opacity-80' : 'opacity-40',
                    idx === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-amber-600'
                      : idx === 1
                      ? 'bg-gradient-to-br from-gray-300 to-gray-500'
                      : 'bg-gradient-to-br from-amber-600 to-orange-800'
                  )}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  <span className="text-2xl font-display font-bold text-white/60 mb-1">
                    #{idx + 1}
                  </span>

                  {entry ? (
                    <>
                      <span className="font-mono text-sm text-frost-cyan mb-2">
                        {shortenAddress(entry.wallet)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-frost-gold" />
                        <span className="text-xl font-bold font-mono text-frost-gold">
                          {entry.fsbPoints.toLocaleString()} FSB
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-white/20 text-center">---</span>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Full Leaderboard Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-white">All Rankings</h2>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-frost-cyan hover:bg-frost-cyan/5 border border-white/10 hover:border-frost-cyan/30 transition-all"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            {syncing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-frost-cyan" />
            {syncing && <span className="text-xs text-white/40">Syncing on-chain battle events...</span>}
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <AlertTriangle className="w-8 h-8 text-frost-red mx-auto mb-3" />
            <p className="text-frost-red text-sm">{error}</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="p-12 text-center">
            <Trophy className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white/50 mb-2">
              No battles recorded yet
            </h3>
            <p className="text-white/30 max-w-md mx-auto leading-relaxed">
              Rankings will appear after battles are fought on-chain. Be the first to battle!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="frost-table w-full">
              <thead>
                <tr>
                  <th className="font-pixel text-[10px] w-20 text-left">RANK</th>
                  <th className="font-pixel text-[10px] text-left">PLAYER</th>
                  <th className="font-pixel text-[10px] w-32 text-right">FSB POINTS</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((entry) => (
                  <tr
                    key={entry.wallet}
                    className={cn(
                      isConnected && address && entry.wallet.toLowerCase() === address.toLowerCase()
                        ? 'bg-frost-cyan/5 border-l-2 border-l-frost-cyan'
                        : ''
                    )}
                  >
                    <td className="font-mono text-sm text-white/50 text-left">#{entry.rank}</td>
                    <td className="font-mono text-sm text-frost-cyan text-left">
                      {shortenAddress(entry.wallet)}
                    </td>
                    <td className="font-mono text-sm text-frost-gold font-bold text-right">
                      {entry.fsbPoints.toLocaleString()} FSB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {leaderboard.length > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-2 py-4 border-t border-white/[0.04]">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-pixel bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.ceil(leaderboard.length / PAGE_SIZE) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-[10px] font-pixel transition-all',
                      page === i
                        ? 'bg-frost-cyan/20 border border-frost-cyan/40 text-frost-cyan'
                        : 'bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/70'
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(Math.ceil(leaderboard.length / PAGE_SIZE) - 1, p + 1))}
                  disabled={page >= Math.ceil(leaderboard.length / PAGE_SIZE) - 1}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-pixel bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {totalPlayers > 0 && (
          <div className="p-4 border-t border-white/5 text-center">
            <span className="inline-flex items-center gap-2 text-xs text-white/30">
              <Gamepad2 className="w-3.5 h-3.5" />
              {totalPlayers.toLocaleString()} player{totalPlayers !== 1 ? 's' : ''} ranked
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
