'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Users,
  Clock,
  Coins,
  Flame,
  Crown,
  ArrowRight,
  Zap,
  Shield,
} from 'lucide-react';
import { cn, shortenAddress } from '@/lib/utils';

// Tournament status type
type TournamentStatus = 'registering' | 'in_progress' | 'completed';

interface Tournament {
  id: number;
  name: string;
  description: string;
  prizePool: string;
  entryFee: string;
  playerCount: number;
  maxPlayers: number;
  startTime: string;
  endTime: string;
  status: TournamentStatus;
  gameType: string;
  emoji: string;
}

// Mock tournament data
const MOCK_TOURNAMENTS: Tournament[] = [
  {
    id: 1,
    name: 'Avalanche Grand Slam',
    description: 'The ultimate multi-game tournament',
    prizePool: '100',
    entryFee: '2.0',
    playerCount: 48,
    maxPlayers: 64,
    startTime: 'Mar 1, 2026 20:00 UTC',
    endTime: 'Mar 1, 2026 23:00 UTC',
    status: 'registering',
    gameType: 'Mixed',
    emoji: '\u{1F3C6}',
  },
  {
    id: 2,
    name: 'Coin Flip Championship',
    description: 'Heads or Tails -- pure luck, high stakes',
    prizePool: '50',
    entryFee: '1.0',
    playerCount: 32,
    maxPlayers: 32,
    startTime: 'Feb 27, 2026 18:00 UTC',
    endTime: 'Feb 27, 2026 20:00 UTC',
    status: 'in_progress',
    gameType: 'Coin Flip',
    emoji: '\u{1FA99}',
  },
  {
    id: 3,
    name: 'RPS Masters League',
    description: 'Rock Paper Scissors for the elite strategists',
    prizePool: '75',
    entryFee: '1.5',
    playerCount: 56,
    maxPlayers: 64,
    startTime: 'Mar 3, 2026 19:00 UTC',
    endTime: 'Mar 3, 2026 22:00 UTC',
    status: 'registering',
    gameType: 'Rock Paper Scissors',
    emoji: '\u270A',
  },
  {
    id: 4,
    name: 'Dragon Tiger Showdown',
    description: 'Card duel -- draw the highest card to advance',
    prizePool: '40',
    entryFee: '0.5',
    playerCount: 16,
    maxPlayers: 16,
    startTime: 'Feb 25, 2026 15:00 UTC',
    endTime: 'Feb 25, 2026 17:00 UTC',
    status: 'completed',
    gameType: 'Dragon Tiger',
    emoji: '\u{1F409}',
  },
  {
    id: 5,
    name: 'Elemental Clash Arena',
    description: '5-element battle with bracket elimination',
    prizePool: '120',
    entryFee: '3.0',
    playerCount: 24,
    maxPlayers: 128,
    startTime: 'Mar 5, 2026 20:00 UTC',
    endTime: 'Mar 5, 2026 23:59 UTC',
    status: 'registering',
    gameType: 'Elemental Clash',
    emoji: '\u26A1',
  },
  {
    id: 6,
    name: 'Crash Dice Mayhem',
    description: 'D20 death roll tournament -- highest rolls advance',
    prizePool: '30',
    entryFee: '0.5',
    playerCount: 32,
    maxPlayers: 32,
    startTime: 'Feb 26, 2026 21:00 UTC',
    endTime: 'Feb 26, 2026 23:00 UTC',
    status: 'in_progress',
    gameType: 'Crash Dice',
    emoji: '\u{1F480}',
  },
];

// Mock leaderboard for the active tournament
const MOCK_LEADERBOARD = [
  { rank: 1, address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', wins: 5, score: 1500 },
  { rank: 2, address: '0x1234567890abcdef1234567890abcdef12345678', wins: 4, score: 1200 },
  { rank: 3, address: '0xabcdef1234567890abcdef1234567890abcdef12', wins: 4, score: 1150 },
  { rank: 4, address: '0x9876543210fedcba9876543210fedcba98765432', wins: 3, score: 900 },
  { rank: 5, address: '0xfedcba9876543210fedcba9876543210fedcba98', wins: 3, score: 850 },
];

const STATUS_CONFIG: Record<
  TournamentStatus,
  { label: string; color: string; bgColor: string; borderColor: string; icon: typeof Flame }
> = {
  registering: {
    label: 'Registering',
    color: 'text-arena-green',
    bgColor: 'bg-arena-green/10',
    borderColor: 'border-arena-green/30',
    icon: Users,
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-arena-orange',
    bgColor: 'bg-arena-orange/10',
    borderColor: 'border-arena-orange/30',
    icon: Flame,
  },
  completed: {
    label: 'Completed',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/30',
    icon: Trophy,
  },
};

type TabId = 'active' | 'upcoming';

export default function TournamentsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('active');

  const activeTournaments = MOCK_TOURNAMENTS.filter(
    (t) => t.status === 'in_progress' || t.status === 'registering'
  );
  const upcomingTournaments = MOCK_TOURNAMENTS.filter(
    (t) => t.status === 'registering'
  );
  const displayedTournaments =
    activeTab === 'active' ? activeTournaments : upcomingTournaments;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 sm:mb-14"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full border border-arena-purple/20 bg-arena-purple/5">
            <Trophy className="w-4 h-4 text-arena-purple" />
            <span className="text-xs font-semibold uppercase tracking-wider text-arena-purple">
              Compete & Win
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4">
            <span className="gradient-text">TOURNAMENTS</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Enter bracketed tournaments, compete against top players, and claim
            massive prize pools on Avalanche.
          </p>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="flex items-center gap-2 mb-8"
        >
          {([
            { id: 'active' as TabId, label: 'Active', count: activeTournaments.length },
            { id: 'upcoming' as TabId, label: 'Upcoming', count: upcomingTournaments.length },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-arena-purple/15 text-arena-purple border border-arena-purple/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'ml-2 px-1.5 py-0.5 rounded-md text-xs font-mono',
                  activeTab === tab.id
                    ? 'bg-arena-purple/20 text-arena-purple'
                    : 'bg-white/[0.06] text-gray-500'
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </motion.div>

        {/* Tournament Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <AnimatePresence mode="popLayout">
            {displayedTournaments.map((tournament, index) => {
              const statusConfig = STATUS_CONFIG[tournament.status];
              const StatusIcon = statusConfig.icon;
              const progress =
                (tournament.playerCount / tournament.maxPlayers) * 100;

              return (
                <motion.div
                  key={tournament.id}
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{
                    delay: index * 0.1,
                    duration: 0.4,
                    ease: 'easeOut',
                  }}
                  layout
                  className="gradient-border p-6 flex flex-col"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{tournament.emoji}</span>
                      <div>
                        <h3 className="font-display text-lg font-bold text-white tracking-wide leading-tight">
                          {tournament.name}
                        </h3>
                        <span className="text-xs text-gray-500">
                          {tournament.gameType}
                        </span>
                      </div>
                    </div>
                    {/* Status badge */}
                    <div
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border',
                        statusConfig.bgColor,
                        statusConfig.color,
                        statusConfig.borderColor
                      )}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {statusConfig.label}
                    </div>
                  </div>

                  <p className="text-sm text-gray-400 mb-5 leading-relaxed">
                    {tournament.description}
                  </p>

                  {/* Prize + Entry */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="stat-card">
                      <div className="flex items-center gap-1.5 justify-center mb-1">
                        <Coins className="w-3.5 h-3.5 text-arena-gold" />
                        <span className="text-xs text-gray-500 uppercase font-semibold">
                          Prize Pool
                        </span>
                      </div>
                      <span className="font-mono text-lg font-bold text-arena-gold">
                        {tournament.prizePool}
                      </span>
                      <span className="text-xs text-arena-gold/60 ml-1">
                        AVAX
                      </span>
                    </div>
                    <div className="stat-card">
                      <div className="flex items-center gap-1.5 justify-center mb-1">
                        <Zap className="w-3.5 h-3.5 text-arena-cyan" />
                        <span className="text-xs text-gray-500 uppercase font-semibold">
                          Entry Fee
                        </span>
                      </div>
                      <span className="font-mono text-lg font-bold text-arena-cyan">
                        {tournament.entryFee}
                      </span>
                      <span className="text-xs text-arena-cyan/60 ml-1">
                        AVAX
                      </span>
                    </div>
                  </div>

                  {/* Player Count + Progress */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="flex items-center gap-1.5 text-gray-400">
                        <Users className="w-3.5 h-3.5" />
                        Players
                      </span>
                      <span className="font-mono text-gray-300">
                        {tournament.playerCount}/{tournament.maxPlayers}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <motion.div
                        className="progress-bar-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ delay: index * 0.1 + 0.3, duration: 0.8 }}
                      />
                    </div>
                  </div>

                  {/* Times */}
                  <div className="space-y-2 mb-5 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Start: {tournament.startTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      <span>End: {tournament.endTime}</span>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="mt-auto">
                    {tournament.status === 'registering' ? (
                      <button className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                        <Shield className="w-4 h-4" />
                        Join Tournament
                      </button>
                    ) : tournament.status === 'in_progress' ? (
                      <button className="btn-neon btn-neon-cyan w-full flex items-center justify-center gap-2 text-sm">
                        <Flame className="w-4 h-4" />
                        View Matches
                      </button>
                    ) : (
                      <button className="btn-neon btn-neon-purple w-full flex items-center justify-center gap-2 text-sm">
                        <Trophy className="w-4 h-4" />
                        View Results
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Active Tournament Leaderboard */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-arena-gold/10">
              <Crown className="w-4 h-4 text-arena-gold" />
            </div>
            <h2 className="font-display text-2xl font-bold text-white tracking-wide">
              Active Tournament Leaders
            </h2>
            <span className="text-xs text-gray-500 px-2 py-0.5 rounded-md bg-white/[0.04]">
              Coin Flip Championship
            </span>
          </div>

          <div className="glass-card overflow-hidden">
            <table className="arena-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Wins</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_LEADERBOARD.map((player, index) => (
                  <motion.tr
                    key={player.address}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + index * 0.08, duration: 0.4 }}
                  >
                    <td>
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-8 h-8 rounded-full font-mono font-bold text-sm',
                          player.rank === 1 &&
                            'bg-arena-gold/20 text-arena-gold',
                          player.rank === 2 &&
                            'bg-gray-400/20 text-gray-300',
                          player.rank === 3 &&
                            'bg-orange-500/20 text-orange-400',
                          player.rank > 3 && 'bg-white/[0.04] text-gray-500'
                        )}
                      >
                        {player.rank}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-sm text-gray-300">
                        {shortenAddress(player.address)}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-sm text-arena-green font-medium">
                        {player.wins}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-sm text-arena-cyan font-bold">
                        {player.score.toLocaleString()}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
