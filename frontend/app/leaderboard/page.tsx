'use client';

import { motion } from 'framer-motion';
import { Trophy, Medal, Crown, TrendingUp, Users, Gamepad2, Loader2, Wallet, Swords, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { cn, shortenAddress } from '@/lib/utils';
import { useAccount, usePublicClient } from 'wagmi';
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

/* ---------------------------------------------------------------------------
 * Podium styling
 * ------------------------------------------------------------------------- */

const podiumColors = [
  { bg: 'from-yellow-500/20 to-amber-600/5', border: 'border-yellow-500/40', glow: 'shadow-glow-gold', icon: Crown, label: '1st' },
  { bg: 'from-gray-300/20 to-gray-400/5', border: 'border-gray-400/40', glow: '', icon: Medal, label: '2nd' },
  { bg: 'from-amber-700/20 to-orange-800/5', border: 'border-amber-700/40', glow: '', icon: Medal, label: '3rd' },
];

/* ---------------------------------------------------------------------------
 * Page Component
 * ------------------------------------------------------------------------- */

export default function LeaderboardPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

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

      {/* Podium - Coming Soon */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-16"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[1, 0, 2].map((idx, displayIdx) => {
            const style = podiumColors[idx];
            const Icon = style.icon;
            const heights = ['h-64', 'h-72', 'h-56'];

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
                  'w-16 h-16 rounded-full flex items-center justify-center mb-3 opacity-40',
                  idx === 0
                    ? 'bg-gradient-to-br from-yellow-400 to-amber-600'
                    : idx === 1
                    ? 'bg-gradient-to-br from-gray-300 to-gray-500'
                    : 'bg-gradient-to-br from-amber-600 to-orange-800'
                )}>
                  <Icon className="w-8 h-8 text-white" />
                </div>

                <span className="text-2xl font-display font-bold text-white/30 mb-1">
                  #{idx + 1}
                </span>

                <span className="text-sm text-white/20 text-center">
                  Awaiting on-chain indexer
                </span>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Full Leaderboard Table - Coming Soon */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5">
          <h2 className="text-xl font-display font-bold text-white">All Rankings</h2>
        </div>

        <div className="p-12 text-center">
          <Trophy className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white/50 mb-2">
            On-Chain Leaderboard Coming Soon
          </h3>
          <p className="text-white/30 max-w-md mx-auto leading-relaxed">
            A full rankings table requires an on-chain indexer or subgraph to efficiently
            aggregate battle results across all players. This feature is under development.
          </p>
          {!isConnected && (
            <p className="text-frost-cyan/60 text-sm mt-4">
              Connect your wallet to view your personal battle stats above.
            </p>
          )}
          {totalBattles !== null && totalBattles > 0 && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-white/40 text-sm">
              <Gamepad2 className="w-4 h-4" />
              <span>
                {totalBattles.toLocaleString()} battle{totalBattles !== 1 ? 's' : ''} recorded on-chain so far
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
