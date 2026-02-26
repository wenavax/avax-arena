'use client';

import { motion } from 'framer-motion';
import {
  Copy, ExternalLink, Trophy, Gamepad2, TrendingUp,
  Zap, Bot, Shield, Target, BarChart3
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { GAMES } from '@/lib/constants';

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const MOCK_STATS = {
  totalGames: 147,
  wins: 89,
  winRate: 60.5,
  avaxEarned: 12.847,
  arenaBalance: 4250,
  bestStreak: 8,
};

const MOCK_HISTORY = [
  { date: '2026-02-26', gameType: 2, opponent: '0xab12...ef34', stake: '0.5', result: 'win', txHash: '0xabc...' },
  { date: '2026-02-26', gameType: 4, opponent: '0xcd56...gh78', stake: '1.0', result: 'loss', txHash: '0xdef...' },
  { date: '2026-02-25', gameType: 0, opponent: '0xij90...kl12', stake: '0.1', result: 'win', txHash: '0xghi...' },
  { date: '2026-02-25', gameType: 5, opponent: '0xmn34...op56', stake: '0.25', result: 'draw', txHash: '0xjkl...' },
  { date: '2026-02-24', gameType: 6, opponent: '0xqr78...st90', stake: '2.0', result: 'win', txHash: '0xmno...' },
  { date: '2026-02-24', gameType: 1, opponent: '0xuv12...wx34', stake: '0.5', result: 'win', txHash: '0xpqr...' },
  { date: '2026-02-23', gameType: 3, opponent: '0xyz56...ab78', stake: '0.1', result: 'loss', txHash: '0xstu...' },
  { date: '2026-02-23', gameType: 2, opponent: '0xcd90...ef12', stake: '1.0', result: 'win', txHash: '0xvwx...' },
];

const GAME_DISTRIBUTION = [
  { name: 'Coin Flip', count: 32, color: 'bg-yellow-500' },
  { name: 'Dice Duel', count: 25, color: 'bg-red-500' },
  { name: 'RPS', count: 28, color: 'bg-blue-500' },
  { name: 'Number Guess', count: 18, color: 'bg-emerald-500' },
  { name: 'Dragon Tiger', count: 20, color: 'bg-purple-500' },
  { name: 'Elemental', count: 14, color: 'bg-cyan-500' },
  { name: 'Crash Dice', count: 10, color: 'bg-pink-500' },
];

const maxCount = Math.max(...GAME_DISTRIBUTION.map((g) => g.count));

export default function ProfilePage() {
  const params = useParams();
  const address = (params.address as string) || '0x0000...0000';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen px-4 py-12 max-w-7xl mx-auto">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-center gap-6 mb-12"
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-arena-cyan via-arena-purple to-arena-pink p-[2px]">
          <div className="w-full h-full rounded-full bg-arena-surface flex items-center justify-center">
            <span className="text-3xl font-display font-bold gradient-text">
              {address.slice(2, 4).toUpperCase()}
            </span>
          </div>
        </div>

        <div className="text-center md:text-left">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2">
            Player Profile
          </h1>
          <div className="flex items-center gap-2">
            <span className="font-mono text-arena-cyan text-lg">{shortenAddr(address)}</span>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <Copy className={cn('w-4 h-4', copied ? 'text-arena-green' : 'text-white/40')} />
            </button>
            <a
              href={`https://snowtrace.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-white/40 hover:text-arena-cyan" />
            </a>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12"
      >
        {[
          { icon: Gamepad2, label: 'Total Games', value: MOCK_STATS.totalGames, color: 'text-arena-cyan' },
          { icon: Trophy, label: 'Wins', value: MOCK_STATS.wins, color: 'text-arena-green' },
          { icon: TrendingUp, label: 'Win Rate', value: `${MOCK_STATS.winRate}%`, color: 'text-arena-purple' },
          { icon: Zap, label: 'AVAX Earned', value: MOCK_STATS.avaxEarned, color: 'text-arena-gold' },
          { icon: Target, label: 'ARENA Balance', value: MOCK_STATS.arenaBalance.toLocaleString(), color: 'text-arena-pink' },
          { icon: Shield, label: 'Best Streak', value: MOCK_STATS.bestStreak, color: 'text-arena-orange' },
        ].map((stat, i) => (
          <div key={i} className="stat-card">
            <stat.icon className={cn('w-5 h-5 mx-auto mb-2', stat.color)} />
            <div className={cn('text-xl font-bold font-mono', stat.color)}>{stat.value}</div>
            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Favorite Games Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 rounded-2xl"
        >
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-arena-cyan" />
            <h2 className="text-lg font-display font-bold text-white">Favorite Games</h2>
          </div>
          <div className="space-y-3">
            {GAME_DISTRIBUTION.map((game, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/70">{game.name}</span>
                  <span className="font-mono text-white/50">{game.count}</span>
                </div>
                <div className="progress-bar">
                  <motion.div
                    className={cn('progress-bar-fill', game.color)}
                    initial={{ width: 0 }}
                    animate={{ width: `${(game.count / maxCount) * 100}%` }}
                    transition={{ delay: 0.3 + i * 0.05, duration: 0.6 }}
                    style={{ background: undefined }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* AI Agent Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 rounded-2xl lg:col-span-2"
        >
          <div className="flex items-center gap-2 mb-6">
            <Bot className="w-5 h-5 text-arena-purple" />
            <h2 className="text-lg font-display font-bold text-white">AI Agent</h2>
            <span className="ml-auto px-3 py-1 rounded-full text-xs font-semibold bg-arena-green/20 text-arena-green border border-arena-green/30">
              Active
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-xs text-white/40 mb-1">Agent Name</div>
              <div className="text-white font-semibold">AlphaBot v2</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Strategy</div>
              <div className="text-arena-purple font-semibold">Analytical</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Session Key</div>
              <div className="text-arena-green font-mono text-sm">23h 14m left</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Agent Wallet</div>
              <div className="text-arena-cyan font-mono text-sm">0x9f2a...b1c3</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card">
              <div className="text-lg font-bold font-mono text-arena-cyan">62</div>
              <div className="text-xs text-white/40">Agent Games</div>
            </div>
            <div className="stat-card">
              <div className="text-lg font-bold font-mono text-arena-green">67.7%</div>
              <div className="text-xs text-white/40">Agent Win Rate</div>
            </div>
            <div className="stat-card">
              <div className="text-lg font-bold font-mono text-arena-gold">3.2 AVAX</div>
              <div className="text-xs text-white/40">Agent Profit</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Game History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5">
          <h2 className="text-xl font-display font-bold text-white">Game History</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="arena-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Game</th>
                <th>Opponent</th>
                <th className="text-right">Stake</th>
                <th className="text-center">Result</th>
                <th className="text-right">TX</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_HISTORY.map((game, i) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                >
                  <td className="text-white/50 text-sm">{game.date}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span>{GAMES[game.gameType]?.emoji}</span>
                      <span className="text-white text-sm">{GAMES[game.gameType]?.name}</span>
                    </span>
                  </td>
                  <td className="font-mono text-sm text-arena-cyan">{game.opponent}</td>
                  <td className="text-right font-mono text-white">{game.stake} AVAX</td>
                  <td className="text-center">
                    <span className={cn(
                      'px-3 py-1 rounded-full text-xs font-bold uppercase',
                      game.result === 'win' && 'bg-arena-green/20 text-arena-green border border-arena-green/30',
                      game.result === 'loss' && 'bg-arena-red/20 text-arena-red border border-arena-red/30',
                      game.result === 'draw' && 'bg-arena-gold/20 text-arena-gold border border-arena-gold/30'
                    )}>
                      {game.result}
                    </span>
                  </td>
                  <td className="text-right">
                    <a
                      href={`https://snowtrace.io/tx/${game.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/30 hover:text-arena-cyan transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 inline" />
                    </a>
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
