'use client';

import { motion } from 'framer-motion';
import { Trophy, Medal, Crown, TrendingUp, Users, Gamepad2, Loader2, Wallet, Swords, AlertTriangle, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { cn, shortenAddress } from '@/lib/utils';
import { useAccount, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACT_ADDRESSES } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI } from '@/lib/contracts';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface UserStats {
  address: string;
  totalBattles: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface BattleInfo {
  id: number;
  player1: string;
  player2: string;
  nft1: number;
  nft2: number;
  stake: bigint;
  winner: string;
  resolved: boolean;
  createdAt: number;
  resolvedAt: number;
}

interface LeaderboardEntry {
  address: string;
  wins: number;
  losses: number;
  winRate: number;
  totalStakeWon: number;
}

/* ---------------------------------------------------------------------------
 * useLeaderboard — aggregate rankings from on-chain battle data
 * ------------------------------------------------------------------------- */

function useLeaderboard(publicClient: ReturnType<typeof usePublicClient>) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!publicClient) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const countRaw = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'battleCounter',
      });
      const count = Number(countRaw);
      if (count === 0) { setEntries([]); setLoading(false); return; }

      // Fetch last 200 battles in batches of 25
      const start = Math.max(1, count - 199);
      const ids = Array.from({ length: count - start + 1 }, (_, i) => start + i);
      const BATCH = 25;
      const allBattles: BattleInfo[] = [];

      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((id) =>
            publicClient.readContract({
              address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
              abi: BATTLE_ENGINE_ABI,
              functionName: 'getBattle',
              args: [BigInt(id)],
            })
          )
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            const b = r.value as unknown as BattleInfo;
            if (b.resolved) allBattles.push(b);
          }
        }
      }

      // Aggregate
      const map = new Map<string, { wins: number; losses: number; stakeWon: bigint }>();
      for (const b of allBattles) {
        const winner = b.winner.toLowerCase();
        const p1 = b.player1.toLowerCase();
        const p2 = b.player2.toLowerCase();
        const loser = winner === p1 ? p2 : p1;

        if (!map.has(winner)) map.set(winner, { wins: 0, losses: 0, stakeWon: BigInt(0) });
        if (!map.has(loser)) map.set(loser, { wins: 0, losses: 0, stakeWon: BigInt(0) });

        const w = map.get(winner)!;
        w.wins++;
        w.stakeWon += b.stake;
        map.set(winner, w);

        const l = map.get(loser)!;
        l.losses++;
        map.set(loser, l);
      }

      const ranked: LeaderboardEntry[] = Array.from(map.entries())
        .map(([addr, s]) => ({
          address: addr,
          wins: s.wins,
          losses: s.losses,
          winRate: s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 100) : 0,
          totalStakeWon: parseFloat(Number(formatEther(s.stakeWon)).toFixed(4)),
        }))
        .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
        .slice(0, 20);

      setEntries(ranked);
    } catch (err) {
      console.error('Leaderboard fetch error:', err);
      setError('Failed to load leaderboard data.');
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => { fetch(); }, [fetch]);

  return { entries, loading, error, refetch: fetch };
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
  const publicClient = usePublicClient();

  // Leaderboard data
  const { entries: leaderboard, loading: lbLoading, error: lbError, refetch: refetchLeaderboard } = useLeaderboard(publicClient);

  // On-chain stats
  const [totalWarriors, setTotalWarriors] = useState<number | null>(null);
  const [totalBattles, setTotalBattles] = useState<number | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLoading, setUserLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* -----------------------------------------------------------------------
   * Fetch global on-chain stats
   * --------------------------------------------------------------------- */
  const fetchGlobalStats = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    setError(null);

    try {
      const [supplyResult, battleCountResult] = await Promise.allSettled([
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'totalSupply',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'battleCounter',
        }),
      ]);

      if (supplyResult.status === 'fulfilled') {
        setTotalWarriors(Number(supplyResult.value));
      }
      if (battleCountResult.status === 'fulfilled') {
        setTotalBattles(Number(battleCountResult.value));
      }
    } catch (err) {
      console.error('Failed to fetch global stats:', err);
      setError('Failed to load on-chain data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  /* -----------------------------------------------------------------------
   * Fetch connected user's battle history and compute stats
   * --------------------------------------------------------------------- */
  const fetchUserStats = useCallback(async () => {
    if (!publicClient || !address) return;
    setUserLoading(true);

    try {
      // Get battle IDs for the connected user
      const battleIds = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'getBattleHistory',
        args: [address],
      }) as bigint[];

      if (!battleIds || battleIds.length === 0) {
        setUserStats({
          address,
          totalBattles: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        });
        return;
      }

      // Fetch details for each battle (limit to most recent 50 for performance)
      const recentIds = battleIds.slice(-50);
      const battleDetails = await Promise.all(
        recentIds.map((id) =>
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
            abi: BATTLE_ENGINE_ABI,
            functionName: 'getBattle',
            args: [id],
          })
        )
      );

      let wins = 0;
      let losses = 0;

      for (const raw of battleDetails) {
        const battle = raw as unknown as BattleInfo;
        if (!battle.resolved) continue;
        if (battle.winner.toLowerCase() === address.toLowerCase()) {
          wins++;
        } else {
          losses++;
        }
      }

      const total = wins + losses;
      setUserStats({
        address,
        totalBattles: battleIds.length,
        wins,
        losses,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      });
    } catch (err) {
      console.error('Failed to fetch user stats:', err);
      setUserStats(null);
    } finally {
      setUserLoading(false);
    }
  }, [publicClient, address]);

  /* -----------------------------------------------------------------------
   * Effects
   * --------------------------------------------------------------------- */
  useEffect(() => {
    fetchGlobalStats();
  }, [fetchGlobalStats]);

  useEffect(() => {
    if (isConnected && address) {
      fetchUserStats();
    } else {
      setUserStats(null);
    }
  }, [isConnected, address, fetchUserStats]);

  /* -----------------------------------------------------------------------
   * Render
   * --------------------------------------------------------------------- */
  return (
    <div className="min-h-screen px-4 py-12 max-w-7xl mx-auto">
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
        <p className="text-white/50 text-lg">Top warriors of Frostbite</p>
      </motion.div>

      {/* On-Chain Stats Row */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
      >
        {[
          {
            icon: Users,
            label: 'Total Warriors',
            value: loading ? null : totalWarriors !== null ? totalWarriors.toLocaleString() : '--',
            color: 'text-frost-cyan',
          },
          {
            icon: Gamepad2,
            label: 'Battles Fought',
            value: loading ? null : totalBattles !== null ? totalBattles.toLocaleString() : '--',
            color: 'text-frost-purple',
          },
          {
            icon: TrendingUp,
            label: 'Your Win Rate',
            value: !isConnected ? 'N/A' : userLoading ? null : userStats ? `${userStats.winRate}%` : '--',
            color: 'text-frost-green',
          },
          {
            icon: Trophy,
            label: 'Your Wins',
            value: !isConnected ? 'N/A' : userLoading ? null : userStats ? userStats.wins.toString() : '--',
            color: 'text-frost-gold',
          },
        ].map((stat, i) => (
          <div key={i} className="stat-card flex flex-col items-center gap-2">
            <stat.icon className={cn('w-6 h-6', stat.color)} />
            {stat.value === null ? (
              <Loader2 className={cn('w-5 h-5 animate-spin', stat.color)} />
            ) : (
              <span className={cn('text-xl font-bold font-mono', stat.color)}>{stat.value}</span>
            )}
            <span className="text-xs text-white/40">{stat.label}</span>
          </div>
        ))}
      </motion.div>

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
            onClick={fetchGlobalStats}
            className="px-4 py-2 text-sm rounded-lg bg-frost-red/20 text-frost-red hover:bg-frost-red/30 transition-colors"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* Connected User's Stats Card */}
      {isConnected && address && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-12"
        >
          <h2 className="text-xl font-display font-bold text-white mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-frost-cyan" />
            Your Battle Record
          </h2>
          <div className="glass-card p-6 bg-gradient-to-r from-frost-cyan/5 to-frost-purple/5 border border-frost-cyan/20">
            {userLoading ? (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="w-6 h-6 animate-spin text-frost-cyan" />
                <span className="text-white/60">Loading your battle history from chain...</span>
              </div>
            ) : userStats ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                <div className="col-span-2 md:col-span-1 flex flex-col items-center md:items-start">
                  <span className="text-xs text-white/40 mb-1">Address</span>
                  <span className="font-mono text-sm text-frost-cyan">
                    {shortenAddress(userStats.address)}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-white/40 block mb-1">Total Battles</span>
                  <span className="text-2xl font-bold font-mono text-white">
                    {userStats.totalBattles}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-white/40 block mb-1">Wins</span>
                  <span className="text-2xl font-bold font-mono text-frost-green">
                    {userStats.wins}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-white/40 block mb-1">Losses</span>
                  <span className="text-2xl font-bold font-mono text-frost-red">
                    {userStats.losses}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs text-white/40 block mb-1">Win Rate</span>
                  <span className={cn(
                    'text-2xl font-bold font-mono',
                    userStats.winRate >= 60 ? 'text-frost-green' :
                    userStats.winRate >= 45 ? 'text-frost-cyan' :
                    'text-frost-red'
                  )}>
                    {userStats.winRate}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Swords className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No battles found for your address.</p>
                <p className="text-white/30 text-sm mt-1">Mint a warrior and start battling to see your stats here.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Podium */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-16"
      >
        {lbLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-frost-gold" />
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
                  transition={{ delay: 0.5 + displayIdx * 0.15 }}
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
                        {shortenAddress(entry.address)}
                      </span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-frost-green font-bold">{entry.wins}W</span>
                        <span className="text-white/20">/</span>
                        <span className="text-frost-red font-bold">{entry.losses}L</span>
                        <span className="text-white/20">|</span>
                        <span className="text-frost-gold font-bold">{entry.winRate}%</span>
                      </div>
                      {entry.totalStakeWon > 0 && (
                        <span className="text-[10px] text-white/30 mt-1 font-mono">
                          {entry.totalStakeWon} AVAX won
                        </span>
                      )}
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
        transition={{ delay: 0.6 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-white">All Rankings</h2>
          <button
            onClick={refetchLeaderboard}
            disabled={lbLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-frost-cyan hover:bg-frost-cyan/5 border border-white/10 hover:border-frost-cyan/30 transition-all"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', lbLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {lbLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-frost-cyan" />
          </div>
        ) : lbError ? (
          <div className="p-12 text-center">
            <AlertTriangle className="w-8 h-8 text-frost-red mx-auto mb-3" />
            <p className="text-frost-red text-sm">{lbError}</p>
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
                  <th className="font-pixel text-[10px]">RANK</th>
                  <th className="font-pixel text-[10px]">PLAYER</th>
                  <th className="font-pixel text-[10px]">WINS</th>
                  <th className="font-pixel text-[10px]">LOSSES</th>
                  <th className="font-pixel text-[10px]">WIN RATE</th>
                  <th className="font-pixel text-[10px]">AVAX WON</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(3).map((entry, i) => (
                  <tr key={entry.address}>
                    <td className="font-mono text-sm text-white/50">#{i + 4}</td>
                    <td className="font-mono text-sm text-frost-cyan">
                      {shortenAddress(entry.address)}
                    </td>
                    <td className="font-mono text-sm text-frost-green font-bold">{entry.wins}</td>
                    <td className="font-mono text-sm text-frost-red font-bold">{entry.losses}</td>
                    <td className={cn(
                      'font-mono text-sm font-bold',
                      entry.winRate >= 60 ? 'text-frost-green' :
                      entry.winRate >= 45 ? 'text-frost-cyan' :
                      'text-frost-red'
                    )}>
                      {entry.winRate}%
                    </td>
                    <td className="font-mono text-sm text-frost-gold">{entry.totalStakeWon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalBattles !== null && totalBattles > 0 && (
          <div className="p-4 border-t border-white/5 text-center">
            <span className="inline-flex items-center gap-2 text-xs text-white/30">
              <Gamepad2 className="w-3.5 h-3.5" />
              {totalBattles.toLocaleString()} battle{totalBattles !== 1 ? 's' : ''} recorded on-chain
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
