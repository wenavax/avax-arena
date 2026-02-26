'use client';

import { motion } from 'framer-motion';
import {
  Copy, ExternalLink, Trophy, Swords, TrendingUp,
  Zap, Bot, Shield, Target, BarChart3, Sparkles
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ELEMENTS } from '@/lib/constants';

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const MOCK_STATS = {
  totalBattles: 147,
  wins: 89,
  winRate: 60.5,
  avaxEarned: 12.847,
  arenaBalance: 4250,
  bestStreak: 8,
};

const MOCK_WARRIORS = [
  { tokenId: 12, element: 0, attack: 78, defense: 65, speed: 82, specialPower: 34, level: 5, powerScore: 634, wins: 23, losses: 9 },
  { tokenId: 47, element: 3, attack: 55, defense: 91, speed: 44, specialPower: 42, level: 3, powerScore: 553, wins: 14, losses: 11 },
  { tokenId: 103, element: 6, attack: 92, defense: 48, speed: 77, specialPower: 28, level: 7, powerScore: 666, wins: 31, losses: 12 },
];

const MOCK_HISTORY = [
  { date: '2026-02-26', myNft: 12, opponentNft: 88, opponent: '0xab12...ef34', stake: '0.5', result: 'win' as const, myElement: 0, opElement: 2 },
  { date: '2026-02-26', myNft: 47, opponentNft: 201, opponent: '0xcd56...gh78', stake: '1.0', result: 'loss' as const, myElement: 3, opElement: 1 },
  { date: '2026-02-25', myNft: 103, opponentNft: 55, opponent: '0xij90...kl12', stake: '0.1', result: 'win' as const, myElement: 6, opElement: 7 },
  { date: '2026-02-25', myNft: 12, opponentNft: 140, opponent: '0xmn34...op56', stake: '0.25', result: 'win' as const, myElement: 0, opElement: 2 },
  { date: '2026-02-24', myNft: 47, opponentNft: 67, opponent: '0xqr78...st90', stake: '2.0', result: 'loss' as const, myElement: 3, opElement: 0 },
  { date: '2026-02-24', myNft: 103, opponentNft: 310, opponent: '0xuv12...wx34', stake: '0.5', result: 'win' as const, myElement: 6, opElement: 7 },
];

const ELEMENT_DISTRIBUTION = ELEMENTS.map((el, i) => ({
  name: el.name,
  emoji: el.emoji,
  count: [32, 18, 14, 25, 10, 20, 28, 12][i],
  color: `bg-gradient-to-r ${el.color}`,
}));

const maxCount = Math.max(...ELEMENT_DISTRIBUTION.map((g) => g.count));

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
            Warrior Profile
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
          { icon: Swords, label: 'Total Battles', value: MOCK_STATS.totalBattles, color: 'text-arena-cyan' },
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

      {/* Warriors Collection + AI Agent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* My Warriors */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 rounded-2xl"
        >
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-arena-cyan" />
            <h2 className="text-lg font-display font-bold text-white">My Warriors</h2>
            <span className="ml-auto text-sm text-white/40">{MOCK_WARRIORS.length} NFTs</span>
          </div>
          <div className="space-y-3">
            {MOCK_WARRIORS.map((w) => {
              const el = ELEMENTS[w.element];
              return (
                <div key={w.tokenId} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-arena-cyan/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{el.emoji}</span>
                      <span className="text-white font-semibold text-sm">#{w.tokenId}</span>
                      <span className="text-white/40 text-xs">{el.name}</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-arena-gold/20 text-arena-gold border border-arena-gold/30">
                      Lv.{w.level}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div><span className="text-white/40">ATK</span> <span className="text-red-400 font-mono">{w.attack}</span></div>
                    <div><span className="text-white/40">DEF</span> <span className="text-blue-400 font-mono">{w.defense}</span></div>
                    <div><span className="text-white/40">SPD</span> <span className="text-green-400 font-mono">{w.speed}</span></div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40">Power: <span className="text-arena-cyan font-mono font-bold">{w.powerScore}</span></span>
                    <span className="text-white/40">{w.wins}W / {w.losses}L</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* AI Agent Info + Element Distribution */}
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

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="stat-card">
              <div className="text-lg font-bold font-mono text-arena-cyan">62</div>
              <div className="text-xs text-white/40">Agent Battles</div>
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

          {/* Element Battle Distribution */}
          <div className="border-t border-white/5 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-arena-cyan" />
              <h3 className="text-sm font-display font-bold text-white">Battle Element Distribution</h3>
            </div>
            <div className="space-y-2">
              {ELEMENT_DISTRIBUTION.map((el, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/70">{el.emoji} {el.name}</span>
                    <span className="font-mono text-white/50">{el.count}</span>
                  </div>
                  <div className="progress-bar">
                    <motion.div
                      className="progress-bar-fill bg-gradient-to-r from-arena-cyan to-arena-purple"
                      initial={{ width: 0 }}
                      animate={{ width: `${(el.count / maxCount) * 100}%` }}
                      transition={{ delay: 0.3 + i * 0.05, duration: 0.6 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Battle History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/5">
          <h2 className="text-xl font-display font-bold text-white">Battle History</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="arena-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>My Warrior</th>
                <th>VS</th>
                <th>Opponent</th>
                <th className="text-right">Stake</th>
                <th className="text-center">Result</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_HISTORY.map((battle, i) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                >
                  <td className="text-white/50 text-sm">{battle.date}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span>{ELEMENTS[battle.myElement].emoji}</span>
                      <span className="text-white text-sm">#{battle.myNft}</span>
                    </span>
                  </td>
                  <td className="text-white/20 text-center">vs</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span>{ELEMENTS[battle.opElement].emoji}</span>
                      <span className="text-white/60 text-sm">#{battle.opponentNft}</span>
                      <span className="font-mono text-xs text-white/30">{battle.opponent}</span>
                    </span>
                  </td>
                  <td className="text-right font-mono text-white">{battle.stake} AVAX</td>
                  <td className="text-center">
                    <span className={cn(
                      'px-3 py-1 rounded-full text-xs font-bold uppercase',
                      battle.result === 'win' && 'bg-arena-green/20 text-arena-green border border-arena-green/30',
                      battle.result === 'loss' && 'bg-arena-red/20 text-arena-red border border-arena-red/30',
                    )}>
                      {battle.result}
                    </span>
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
