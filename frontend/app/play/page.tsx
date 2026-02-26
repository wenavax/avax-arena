'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Swords,
  Plus,
  X,
  Loader2,
  Dices,
  Spade,
  Brain,
  Gamepad2,
  ArrowRight,
  Search,
} from 'lucide-react';
import GameCard from '@/components/games/GameCard';
import { GAMES } from '@/lib/constants';
import { cn, shortenAddress } from '@/lib/utils';

// Filter categories
const FILTERS = [
  { id: 'all', label: 'All Games', icon: Gamepad2 },
  { id: 'card', label: 'Card Games', icon: Spade },
  { id: 'dice', label: 'Dice Games', icon: Dices },
  { id: 'strategy', label: 'Strategy Games', icon: Brain },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

// Map game slugs to categories
const GAME_CATEGORIES: Record<string, FilterId[]> = {
  'coin-flip': ['dice'],
  'dice-duel': ['dice'],
  rps: ['strategy'],
  'number-guess': ['strategy'],
  'dragon-tiger': ['card'],
  'elemental-clash': ['strategy'],
  'crash-dice': ['dice'],
};

// Mock open games for the lobby
interface OpenGame {
  id: bigint;
  gameType: number;
  creator: string;
  stake: string;
  createdAt: string;
}

const MOCK_OPEN_GAMES: OpenGame[] = [
  {
    id: BigInt(42),
    gameType: 0,
    creator: '0x1234567890abcdef1234567890abcdef12345678',
    stake: '0.5',
    createdAt: '2 min ago',
  },
  {
    id: BigInt(43),
    gameType: 2,
    creator: '0xabcdef1234567890abcdef1234567890abcdef12',
    stake: '1.0',
    createdAt: '5 min ago',
  },
  {
    id: BigInt(44),
    gameType: 5,
    creator: '0x9876543210fedcba9876543210fedcba98765432',
    stake: '2.5',
    createdAt: '8 min ago',
  },
  {
    id: BigInt(45),
    gameType: 1,
    creator: '0xfedcba9876543210fedcba9876543210fedcba98',
    stake: '0.25',
    createdAt: '12 min ago',
  },
];

// Mock active players per game
const MOCK_ACTIVE_PLAYERS: Record<string, number> = {
  'coin-flip': 24,
  'dice-duel': 18,
  rps: 31,
  'number-guess': 12,
  'dragon-tiger': 15,
  'elemental-clash': 22,
  'crash-dice': 9,
};

const MOCK_TOTAL_GAMES: Record<string, number> = {
  'coin-flip': 12450,
  'dice-duel': 8320,
  rps: 15680,
  'number-guess': 5430,
  'dragon-tiger': 7290,
  'elemental-clash': 9870,
  'crash-dice': 3210,
};

export default function PlayPage() {
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGameType, setSelectedGameType] = useState(0);
  const [stakeAmount, setStakeAmount] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const filteredGames = useMemo(() => {
    if (activeFilter === 'all') return GAMES;
    return GAMES.filter((game) =>
      GAME_CATEGORIES[game.slug]?.includes(activeFilter)
    );
  }, [activeFilter]);

  const handleCreateGame = () => {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) return;
    setIsCreating(true);
    // Simulated -- in production, call useGameEngine().createGame
    setTimeout(() => {
      setIsCreating(false);
      setShowCreateModal(false);
      setStakeAmount('');
    }, 2000);
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 sm:mb-14"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full border border-arena-cyan/20 bg-arena-cyan/5">
            <Swords className="w-4 h-4 text-arena-cyan" />
            <span className="text-xs font-semibold uppercase tracking-wider text-arena-cyan">
              Game Lobby
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4">
            <span className="gradient-text">CHOOSE YOUR BATTLE</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Select a game, stake your AVAX, and duel opponents on-chain.
            Every move is committed, every result is provably fair.
          </p>
        </motion.div>

        {/* Filter Bar + Create Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8"
        >
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((filter) => {
              const Icon = filter.icon;
              const isActive = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-arena-cyan/15 text-arena-cyan border border-arena-cyan/30 shadow-glow-cyan'
                      : 'bg-white/[0.03] text-gray-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.06]'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {filter.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Create Game
          </button>
        </motion.div>

        {/* Game Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          <AnimatePresence mode="popLayout">
            {filteredGames.map((game, index) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{
                  delay: index * 0.08,
                  duration: 0.4,
                  ease: 'easeOut',
                }}
                layout
              >
                <GameCard
                  name={game.name}
                  emoji={game.emoji}
                  description={game.description}
                  color={game.color}
                  glowColor={game.glowColor}
                  slug={game.slug}
                  activePlayers={MOCK_ACTIVE_PLAYERS[game.slug] ?? 0}
                  totalGames={MOCK_TOTAL_GAMES[game.slug] ?? 0}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Open Games / Active Lobby */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-arena-green/10">
                <Search className="w-4 h-4 text-arena-green" />
              </div>
              <h2 className="font-display text-2xl font-bold text-white tracking-wide">
                Open Games
              </h2>
              <span className="flex items-center gap-1.5 text-xs text-arena-green">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-arena-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-arena-green" />
                </span>
                {MOCK_OPEN_GAMES.length} waiting
              </span>
            </div>
          </div>

          {MOCK_OPEN_GAMES.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Gamepad2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-2">No open games</p>
              <p className="text-gray-500 text-sm mb-6">
                Be the first to create a game and challenge the arena!
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-neon btn-neon-cyan"
              >
                Create a Game
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {MOCK_OPEN_GAMES.map((game, index) => {
                const gameInfo = GAMES[game.gameType];
                return (
                  <motion.div
                    key={game.id.toString()}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
                    className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      {/* Game emoji */}
                      <div
                        className={cn(
                          'flex h-12 w-12 items-center justify-center rounded-xl text-2xl',
                          'bg-gradient-to-br',
                          gameInfo.bgGradient
                        )}
                      >
                        {gameInfo.emoji}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-display text-sm font-bold text-white tracking-wide">
                            {gameInfo.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-arena-cyan/10 text-arena-cyan text-xs font-mono">
                            #{game.id.toString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>
                            by{' '}
                            <span className="text-gray-300 font-mono">
                              {shortenAddress(game.creator)}
                            </span>
                          </span>
                          <span className="text-gray-600">|</span>
                          <span>{game.createdAt}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      {/* Stake amount */}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-arena-gold/5 border border-arena-gold/20">
                        <span className="text-arena-gold font-mono font-bold text-sm">
                          {game.stake}
                        </span>
                        <span className="text-arena-gold/60 text-xs font-semibold">
                          AVAX
                        </span>
                      </div>

                      {/* Join button */}
                      <button className="btn-neon btn-neon-cyan flex items-center gap-2 flex-1 sm:flex-initial justify-center">
                        <span>Join</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* Create Game Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowCreateModal(false)}
              />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative w-full max-w-lg gradient-border p-6 sm:p-8 z-10"
              >
                {/* Close button */}
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <h2 className="font-display text-2xl font-bold gradient-text mb-6">
                  Create Game
                </h2>

                {/* Game Type Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Game Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {GAMES.map((game) => (
                      <button
                        key={game.id}
                        onClick={() => setSelectedGameType(game.id)}
                        className={cn(
                          'flex items-center gap-2 p-3 rounded-xl text-left transition-all duration-200',
                          selectedGameType === game.id
                            ? 'bg-arena-cyan/10 border border-arena-cyan/30 text-white'
                            : 'bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
                        )}
                      >
                        <span className="text-xl">{game.emoji}</span>
                        <span className="text-sm font-medium truncate">
                          {game.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stake Amount */}
                <div className="mb-8">
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Stake Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className={cn(
                        'w-full bg-arena-surface border border-arena-border rounded-xl px-4 py-3 pr-20',
                        'text-white font-mono text-lg placeholder-gray-600',
                        'focus:outline-none focus:border-arena-cyan/50 focus:ring-1 focus:ring-arena-cyan/20',
                        'transition-all duration-200'
                      )}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-arena-card">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-red-500 to-red-700" />
                      <span className="text-sm font-semibold text-gray-300">
                        AVAX
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {['0.1', '0.5', '1', '5'].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setStakeAmount(amount)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-mono font-medium bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:text-arena-cyan hover:border-arena-cyan/30 transition-colors"
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Create Button */}
                <button
                  onClick={handleCreateGame}
                  disabled={isCreating || !stakeAmount || parseFloat(stakeAmount) <= 0}
                  className={cn(
                    'btn-primary w-full flex items-center justify-center gap-2',
                    (isCreating || !stakeAmount || parseFloat(stakeAmount) <= 0) &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Swords className="w-5 h-5" />
                      <span>
                        Create {GAMES[selectedGameType].name} for{' '}
                        {stakeAmount || '0'} AVAX
                      </span>
                    </>
                  )}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
