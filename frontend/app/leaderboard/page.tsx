'use client';

import { motion } from 'framer-motion';
import { Trophy, Medal, Crown, TrendingUp, Users, Gamepad2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const MOCK_PLAYERS = Array.from({ length: 20 }, (_, i) => ({
  rank: i + 1,
  address: `0x${(Math.random().toString(16).slice(2) + '0'.repeat(40)).slice(0, 40)}`,
  wins: Math.floor(Math.random() * 200) + (20 - i) * 10,
  totalGames: Math.floor(Math.random() * 300) + (20 - i) * 15,
  arenaEarned: Math.floor(Math.random() * 5000) + (20 - i) * 200,
}))
  .sort((a, b) => b.wins - a.wins)
  .map((p, i) => ({ ...p, rank: i + 1, winRate: Math.round((p.wins / p.totalGames) * 100) }));

const SEASONS = [
  { id: 1, label: 'Season 1', active: true },
  { id: 2, label: 'Season 2', active: false },
];

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const podiumColors = [
  { bg: 'from-yellow-500/20 to-amber-600/5', border: 'border-yellow-500/40', glow: 'shadow-glow-gold', icon: Crown, label: '1st' },
  { bg: 'from-gray-300/20 to-gray-400/5', border: 'border-gray-400/40', glow: '', icon: Medal, label: '2nd' },
  { bg: 'from-amber-700/20 to-orange-800/5', border: 'border-amber-700/40', glow: '', icon: Medal, label: '3rd' },
];

export default function LeaderboardPage() {
  const [selectedSeason, setSelectedSeason] = useState(1);
  const top3 = MOCK_PLAYERS.slice(0, 3);
  const rest = MOCK_PLAYERS.slice(3);

  return (
    <div className="min-h-screen px-4 py-12 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <Trophy className="w-10 h-10 text-arena-gold" />
          <h1 className="text-4xl md:text-5xl font-display font-bold gradient-text">
            LEADERBOARD
          </h1>
          <Trophy className="w-10 h-10 text-arena-gold" />
        </div>
        <p className="text-white/50 text-lg">Top warriors of the Arena</p>
      </motion.div>

      {/* Season Selector */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex justify-center gap-3 mb-12"
      >
        {SEASONS.map((season) => (
          <button
            key={season.id}
            onClick={() => setSelectedSeason(season.id)}
            className={cn(
              'px-6 py-3 rounded-xl font-semibold text-sm uppercase tracking-wider transition-all',
              selectedSeason === season.id
                ? 'bg-gradient-to-r from-arena-cyan/20 to-arena-purple/20 border border-arena-cyan/40 text-arena-cyan shadow-glow-cyan'
                : 'glass-card text-white/50 hover:text-white/80'
            )}
          >
            {season.label}
            {season.active && (
              <span className="ml-2 inline-block w-2 h-2 rounded-full bg-arena-green animate-pulse" />
            )}
          </button>
        ))}
      </motion.div>

      {/* Podium - Top 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-4xl mx-auto">
        {[1, 0, 2].map((idx, displayIdx) => {
          const player = top3[idx];
          const style = podiumColors[idx];
          const Icon = style.icon;
          const heights = ['h-64', 'h-72', 'h-56'];

          return (
            <motion.div
              key={player.rank}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + displayIdx * 0.15 }}
              className={cn(
                'glass-card p-6 flex flex-col items-center justify-end',
                heights[displayIdx],
                `bg-gradient-to-b ${style.bg}`,
                style.border,
                style.glow
              )}
            >
              <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center mb-3',
                idx === 0
                  ? 'bg-gradient-to-br from-yellow-400 to-amber-600'
                  : idx === 1
                  ? 'bg-gradient-to-br from-gray-300 to-gray-500'
                  : 'bg-gradient-to-br from-amber-600 to-orange-800'
              )}>
                <Icon className="w-8 h-8 text-white" />
              </div>

              <span className="text-2xl font-display font-bold text-white mb-1">
                #{player.rank}
              </span>

              <span className="text-sm font-mono text-arena-cyan mb-3">
                {shortenAddr(player.address)}
              </span>

              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="text-center">
                  <div className="text-lg font-bold text-white">{player.wins}</div>
                  <div className="text-xs text-white/40">Wins</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-arena-green">{player.winRate}%</div>
                  <div className="text-xs text-white/40">Win Rate</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
      >
        {[
          { icon: Users, label: 'Total Players', value: '2,847', color: 'text-arena-cyan' },
          { icon: Gamepad2, label: 'Games Played', value: '18,293', color: 'text-arena-purple' },
          { icon: TrendingUp, label: 'Avg Win Rate', value: '48.7%', color: 'text-arena-green' },
          { icon: Trophy, label: 'ARENA Distributed', value: '125,000', color: 'text-arena-gold' },
        ].map((stat, i) => (
          <div key={i} className="stat-card flex flex-col items-center gap-2">
            <stat.icon className={cn('w-6 h-6', stat.color)} />
            <span className={cn('text-xl font-bold font-mono', stat.color)}>{stat.value}</span>
            <span className="text-xs text-white/40">{stat.label}</span>
          </div>
        ))}
      </motion.div>

      {/* Full Leaderboard Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5">
          <h2 className="text-xl font-display font-bold text-white">All Rankings</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="arena-table">
            <thead>
              <tr>
                <th className="w-16">Rank</th>
                <th>Player</th>
                <th className="text-right">Wins</th>
                <th className="text-right">Games</th>
                <th className="text-right">Win Rate</th>
                <th className="text-right">ARENA Earned</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PLAYERS.map((player, i) => (
                <motion.tr
                  key={player.address}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + i * 0.03 }}
                >
                  <td>
                    <span className={cn(
                      'font-display font-bold text-lg',
                      player.rank === 1 && 'text-yellow-400',
                      player.rank === 2 && 'text-gray-300',
                      player.rank === 3 && 'text-amber-600',
                      player.rank > 3 && 'text-white/60'
                    )}>
                      {player.rank}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-full',
                        player.rank <= 3
                          ? 'bg-gradient-to-br from-arena-cyan to-arena-purple'
                          : 'bg-gradient-to-br from-white/10 to-white/5'
                      )} />
                      <span className="font-mono text-sm text-arena-cyan">
                        {shortenAddr(player.address)}
                      </span>
                    </div>
                  </td>
                  <td className="text-right font-mono font-bold text-white">{player.wins}</td>
                  <td className="text-right font-mono text-white/60">{player.totalGames}</td>
                  <td className="text-right">
                    <span className={cn(
                      'font-mono font-semibold',
                      player.winRate >= 60 ? 'text-arena-green' :
                      player.winRate >= 45 ? 'text-arena-cyan' :
                      'text-arena-red'
                    )}>
                      {player.winRate}%
                    </span>
                  </td>
                  <td className="text-right font-mono text-arena-gold">
                    {player.arenaEarned.toLocaleString()}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
