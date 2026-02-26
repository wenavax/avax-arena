'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Wallet,
  Shield,
  Swords,
  Key,
  Clock,
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Power,
  TrendingUp,
  Sparkles,
  Terminal,
  RefreshCw,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { ELEMENTS } from '@/lib/constants';
import { cn, shortenAddress } from '@/lib/utils';
import { useAccount } from 'wagmi';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface AgentWarrior {
  tokenId: number;
  element: number;
}

interface AgentData {
  id: string;
  name: string;
  walletAddress: string;
  apiKey: string;
  strategy: 'Aggressive' | 'Defensive' | 'Analytical' | 'Random';
  description: string;
  isActive: boolean;
  sessionExpiry: number; // unix timestamp
  balance: number; // AVAX
  dailySpendLimit: number;
  maxStakePerBattle: number;
  battles: number;
  wins: number;
  profit: number;
  warriors: AgentWarrior[];
  autoBattle: boolean;
}

interface LogEntry {
  timestamp: string;
  agentName: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface RecentBattle {
  id: number;
  opponent: string;
  result: 'win' | 'loss';
  stake: number;
  profit: number;
  timestamp: string;
}

/* ---------------------------------------------------------------------------
 * Mock Data
 * ------------------------------------------------------------------------- */

const MOCK_AGENTS: AgentData[] = [
  {
    id: 'agent-001',
    name: 'AlphaStrike',
    walletAddress: '0x7a3B...9f2E',
    apiKey: 'avx_ak_7f3a9c1e2d4b8f6a0e5c3d7b9a1f4e2d',
    strategy: 'Aggressive',
    description: 'High-risk, high-reward battle bot focused on Fire and Thunder warriors.',
    isActive: true,
    sessionExpiry: Date.now() + 4 * 60 * 60 * 1000, // 4 hours from now
    balance: 12.45,
    dailySpendLimit: 5.0,
    maxStakePerBattle: 0.5,
    battles: 87,
    wins: 54,
    profit: 3.82,
    warriors: [
      { tokenId: 12, element: 0 },
      { tokenId: 28, element: 5 },
      { tokenId: 41, element: 0 },
    ],
    autoBattle: true,
  },
  {
    id: 'agent-002',
    name: 'IronGuard',
    walletAddress: '0x3cFe...1a8D',
    apiKey: 'avx_ak_2b8d4f6a0c3e7a1d5f9b2e4c8a6d0f3b',
    strategy: 'Defensive',
    description: 'Conservative agent that prioritizes favorable matchups and low-risk battles.',
    isActive: false,
    sessionExpiry: Date.now() - 2 * 60 * 60 * 1000, // expired 2 hours ago
    balance: 4.21,
    dailySpendLimit: 2.0,
    maxStakePerBattle: 0.2,
    battles: 42,
    wins: 29,
    profit: 1.15,
    warriors: [
      { tokenId: 7, element: 3 },
      { tokenId: 19, element: 1 },
    ],
    autoBattle: false,
  },
];

const MOCK_RECENT_BATTLES: RecentBattle[] = [
  { id: 1, opponent: '0x9a2F...4c1D', result: 'win', stake: 0.25, profit: 0.24, timestamp: '2 min ago' },
  { id: 2, opponent: '0x4bE1...7f3A', result: 'win', stake: 0.30, profit: 0.29, timestamp: '8 min ago' },
  { id: 3, opponent: '0x1cD5...2e8B', result: 'loss', stake: 0.20, profit: -0.20, timestamp: '15 min ago' },
  { id: 4, opponent: '0x6fA3...9d4C', result: 'win', stake: 0.50, profit: 0.49, timestamp: '22 min ago' },
  { id: 5, opponent: '0x8e2B...5a7F', result: 'loss', stake: 0.15, profit: -0.15, timestamp: '31 min ago' },
];

const MOCK_LOG_ENTRIES: LogEntry[] = [
  { timestamp: '14:32:08', agentName: 'AlphaStrike', message: 'Battle won vs 0x9a2F...4c1D | +0.24 AVAX', type: 'success' },
  { timestamp: '14:31:55', agentName: 'AlphaStrike', message: 'Initiating battle with warrior #12 (Fire)', type: 'info' },
  { timestamp: '14:30:12', agentName: 'AlphaStrike', message: 'Found favorable matchup: Fire vs Wind opponent', type: 'info' },
  { timestamp: '14:28:45', agentName: 'AlphaStrike', message: 'Battle won vs 0x4bE1...7f3A | +0.29 AVAX', type: 'success' },
  { timestamp: '14:25:33', agentName: 'AlphaStrike', message: 'Battle lost vs 0x1cD5...2e8B | -0.20 AVAX', type: 'error' },
  { timestamp: '14:22:18', agentName: 'AlphaStrike', message: 'Scanning arena for opponents...', type: 'info' },
  { timestamp: '14:20:01', agentName: 'IronGuard', message: 'Session expired. Awaiting renewal.', type: 'warning' },
  { timestamp: '14:15:44', agentName: 'AlphaStrike', message: 'Battle won vs 0x6fA3...9d4C | +0.49 AVAX', type: 'success' },
  { timestamp: '14:12:09', agentName: 'AlphaStrike', message: 'Strategy evaluation: Aggressive mode engaged', type: 'info' },
  { timestamp: '14:10:00', agentName: 'IronGuard', message: 'Auto-battle disabled by owner', type: 'warning' },
  { timestamp: '14:08:22', agentName: 'AlphaStrike', message: 'Battle lost vs 0x8e2B...5a7F | -0.15 AVAX', type: 'error' },
  { timestamp: '14:05:11', agentName: 'AlphaStrike', message: 'Session renewed. Expires in 6h.', type: 'success' },
];

/* ---------------------------------------------------------------------------
 * Strategy Colors
 * ------------------------------------------------------------------------- */

const STRATEGY_COLORS: Record<string, string> = {
  Aggressive: 'bg-red-500/15 text-red-400 border-red-500/30',
  Defensive: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Analytical: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  Random: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
};

/* ---------------------------------------------------------------------------
 * Helper: format countdown
 * ------------------------------------------------------------------------- */

function formatCountdown(expiryMs: number): string {
  const diff = expiryMs - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/* ---------------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------------- */

function FundAgentModal({
  agentName,
  onClose,
  onFund,
}: {
  agentName: string;
  onClose: () => void;
  onFund: (amount: number) => void;
}) {
  const [amount, setAmount] = useState('');

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="glass-card p-8 w-full max-w-md mx-4"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{ transform: 'none' }}
      >
        <h3 className="font-display text-xl font-bold text-white mb-2">
          Fund {agentName}
        </h3>
        <p className="text-sm text-white/40 mb-6">
          Transfer AVAX to your agent&apos;s wallet
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
              Amount (AVAX)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/20 font-mono focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors"
            />
          </div>

          <div className="flex gap-2">
            {[0.5, 1, 2, 5].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className="flex-1 py-2 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                {preset} AVAX
              </button>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-display text-sm font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (Number(amount) > 0) onFund(Number(amount));
              }}
              className="flex-1 btn-neon btn-neon-cyan py-3 text-sm"
            >
              Fund Agent
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Agent Card
 * ------------------------------------------------------------------------- */

function AgentCard({
  agent,
  isSelected,
  onSelect,
  onFund,
  onRenewSession,
  onChangeStrategy,
  onEmergencyStop,
  onWithdraw,
}: {
  agent: AgentData;
  isSelected: boolean;
  onSelect: () => void;
  onFund: () => void;
  onRenewSession: () => void;
  onChangeStrategy: () => void;
  onEmergencyStop: () => void;
  onWithdraw: () => void;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(formatCountdown(agent.sessionExpiry));

  const winRate = agent.battles > 0 ? ((agent.wins / agent.battles) * 100).toFixed(1) : '0.0';
  const isExpired = agent.sessionExpiry <= Date.now();

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(agent.sessionExpiry));
    }, 1000);
    return () => clearInterval(interval);
  }, [agent.sessionExpiry]);

  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(agent.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [agent.walletAddress]);

  return (
    <motion.div
      className={cn(
        'glass-card p-6 cursor-pointer transition-all duration-300',
        isSelected && 'ring-1 ring-[var(--arena-cyan)]/50 shadow-[0_0_30px_rgba(0,240,255,0.1)]'
      )}
      style={{ transform: 'none' }}
      onClick={onSelect}
      whileHover={{ y: -2 }}
      layout
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--arena-cyan)]/20 to-[var(--arena-purple)]/20 border border-white/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-[var(--arena-cyan)]" />
            </div>
            {/* Active status dot */}
            <div
              className={cn(
                'absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[var(--arena-card)]',
                agent.isActive
                  ? 'bg-[var(--arena-green)] animate-pulse'
                  : 'bg-white/20'
              )}
            />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-white">{agent.name}</h3>
            <span
              className={cn(
                'text-xs font-medium',
                agent.isActive ? 'text-[var(--arena-green)]' : 'text-white/30'
              )}
            >
              {agent.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Strategy badge */}
        <span
          className={cn(
            'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border',
            STRATEGY_COLORS[agent.strategy]
          )}
        >
          {agent.strategy}
        </span>
      </div>

      {/* Wallet Address */}
      <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-black/30 border border-white/5">
        <Wallet className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-xs font-mono text-white/50 flex-1 truncate">
          {agent.walletAddress}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopyAddress();
          }}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Copy address"
        >
          <Copy className={cn('w-3.5 h-3.5', copied ? 'text-[var(--arena-green)]' : 'text-white/30')} />
        </button>
      </div>

      {/* API Key */}
      <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg bg-black/30 border border-white/5">
        <Key className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-xs font-mono text-white/50 flex-1 truncate">
          {showApiKey ? agent.apiKey : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowApiKey(!showApiKey);
          }}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title={showApiKey ? 'Hide API Key' : 'Show API Key'}
        >
          {showApiKey ? (
            <EyeOff className="w-3.5 h-3.5 text-white/30" />
          ) : (
            <Eye className="w-3.5 h-3.5 text-white/30" />
          )}
        </button>
      </div>

      {/* Session Key Status */}
      <div className="flex items-center gap-2 mb-4">
        <Clock className={cn('w-3.5 h-3.5', isExpired ? 'text-[var(--arena-red)]' : 'text-[var(--arena-cyan)]')} />
        <span className="text-xs text-white/40">Session:</span>
        <span
          className={cn(
            'text-xs font-mono font-bold',
            isExpired ? 'text-[var(--arena-red)]' : 'text-[var(--arena-green)]'
          )}
        >
          {countdown}
        </span>
      </div>

      {/* Balance */}
      <div className="flex items-center gap-2 mb-5 p-3 rounded-lg bg-gradient-to-r from-[var(--arena-cyan)]/5 to-transparent border border-[var(--arena-cyan)]/10">
        <span className="text-xs text-white/40">Balance:</span>
        <span className="font-display text-lg font-bold text-[var(--arena-cyan)] text-glow-cyan">
          {agent.balance.toFixed(2)} AVAX
        </span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Battles', value: agent.battles, color: 'text-white/80' },
          { label: 'Wins', value: agent.wins, color: 'text-[var(--arena-green)]' },
          { label: 'Win Rate', value: `${winRate}%`, color: 'text-[var(--arena-cyan)]' },
          {
            label: 'Profit',
            value: `${agent.profit >= 0 ? '+' : ''}${agent.profit.toFixed(2)}`,
            color: agent.profit >= 0 ? 'text-[var(--arena-green)]' : 'text-[var(--arena-red)]',
          },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">{stat.label}</p>
            <p className={cn('text-sm font-mono font-bold', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Warriors Owned */}
      <div className="flex items-center gap-2 mb-5">
        <Swords className="w-3.5 h-3.5 text-white/30" />
        <span className="text-xs text-white/40">Warriors:</span>
        <div className="flex items-center gap-1.5">
          {agent.warriors.map((w) => {
            const el = ELEMENTS[w.element];
            return (
              <span
                key={w.tokenId}
                className="text-sm"
                title={`#${w.tokenId} - ${el?.name ?? 'Unknown'}`}
              >
                {el?.emoji ?? '?'}
              </span>
            );
          })}
          <span className="text-xs font-mono text-white/30 ml-1">
            ({agent.warriors.length})
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onFund}
          className="btn-neon btn-neon-cyan py-2 text-xs flex items-center justify-center gap-1.5"
        >
          <Wallet className="w-3 h-3" />
          Fund Agent
        </button>
        <button
          onClick={onRenewSession}
          className="btn-neon btn-neon-purple py-2 text-xs flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3" />
          Renew Session
        </button>
        <button
          onClick={onChangeStrategy}
          className="btn-neon btn-neon-cyan py-2 text-xs flex items-center justify-center gap-1.5"
        >
          <Settings className="w-3 h-3" />
          Change Strategy
        </button>
        <button
          onClick={onEmergencyStop}
          className="py-2 text-xs flex items-center justify-center gap-1.5 rounded-xl font-semibold uppercase tracking-wider bg-[var(--arena-red)]/10 border border-[var(--arena-red)]/30 text-[var(--arena-red)] hover:bg-[var(--arena-red)]/20 transition-colors"
        >
          <Power className="w-3 h-3" />
          Emergency Stop
        </button>
        <button
          onClick={onWithdraw}
          className="col-span-2 btn-neon btn-neon-pink py-2 text-xs flex items-center justify-center gap-1.5"
        >
          <TrendingUp className="w-3 h-3" />
          Withdraw Funds
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Agent Controls Panel
 * ------------------------------------------------------------------------- */

type ControlTab = 'overview' | 'warriors' | 'battles' | 'chat' | 'settings';

function AgentControlsPanel({
  agent,
  recentBattles,
}: {
  agent: AgentData;
  recentBattles: RecentBattle[];
}) {
  const [activeTab, setActiveTab] = useState<ControlTab>('overview');
  const [settingsStrategy, setSettingsStrategy] = useState(agent.strategy);
  const [settingsSpendLimit, setSettingsSpendLimit] = useState(String(agent.dailySpendLimit));
  const [settingsMaxStake, setSettingsMaxStake] = useState(String(agent.maxStakePerBattle));
  const [settingsAutoBattle, setSettingsAutoBattle] = useState(agent.autoBattle);

  const tabs: { id: ControlTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'warriors', label: 'Warriors' },
    { id: 'battles', label: 'Battles' },
    { id: 'chat', label: 'Chat History' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <motion.div
      className="glass-card overflow-hidden"
      style={{ transform: 'none' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Tab Navigation */}
      <div className="flex border-b border-white/5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-5 py-3.5 text-xs font-display font-bold uppercase tracking-wider transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'text-[var(--arena-cyan)] border-b-2 border-[var(--arena-cyan)] bg-[var(--arena-cyan)]/5'
                : 'text-white/30 hover:text-white/60'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Profit Chart Placeholder */}
            <div>
              <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-3">
                Live Profit Chart
              </h4>
              <div className="h-48 rounded-xl bg-black/30 border border-white/5 flex items-center justify-center">
                <div className="text-center">
                  <TrendingUp className="w-8 h-8 text-[var(--arena-cyan)]/30 mx-auto mb-2" />
                  <p className="text-sm text-white/20 font-mono">Profit chart visualization</p>
                  <p className="text-xs text-white/10 mt-1">Real-time P&L tracking</p>
                </div>
              </div>
            </div>

            {/* Recent Battles */}
            <div>
              <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-3">
                Recent Battles
              </h4>
              <div className="space-y-2">
                {recentBattles.map((battle) => (
                  <div
                    key={battle.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          battle.result === 'win' ? 'bg-[var(--arena-green)]' : 'bg-[var(--arena-red)]'
                        )}
                      />
                      <span className="text-xs font-mono text-white/60">vs {battle.opponent}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-white/30">{battle.stake} AVAX</span>
                      <span
                        className={cn(
                          'text-xs font-mono font-bold',
                          battle.profit >= 0 ? 'text-[var(--arena-green)]' : 'text-[var(--arena-red)]'
                        )}
                      >
                        {battle.profit >= 0 ? '+' : ''}{battle.profit.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-white/20">{battle.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Current Session Info */}
            <div>
              <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-3">
                Current Session
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Strategy</p>
                  <p className="text-sm font-bold text-white/80">{agent.strategy}</p>
                </div>
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Daily Limit</p>
                  <p className="text-sm font-mono font-bold text-white/80">{agent.dailySpendLimit} AVAX</p>
                </div>
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Max Stake</p>
                  <p className="text-sm font-mono font-bold text-white/80">{agent.maxStakePerBattle} AVAX</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Warriors Tab */}
        {activeTab === 'warriors' && (
          <div>
            <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-4">
              Agent&apos;s Warriors
            </h4>
            {agent.warriors.length === 0 ? (
              <div className="text-center py-12">
                <Swords className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No warriors assigned to this agent</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {agent.warriors.map((warrior) => {
                  const el = ELEMENTS[warrior.element];
                  return (
                    <motion.div
                      key={warrior.tokenId}
                      className="relative rounded-xl overflow-hidden group"
                      whileHover={{ y: -4, scale: 1.02 }}
                    >
                      <div
                        className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: `linear-gradient(135deg, ${el?.glowColor ?? 'transparent'}, transparent, ${el?.glowColor ?? 'transparent'})`,
                        }}
                      />
                      <div className="relative bg-[var(--arena-card)]/80 backdrop-blur-lg border border-white/5 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div
                            className={cn(
                              'flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/5',
                              el ? `bg-gradient-to-r ${el.bgGradient}` : ''
                            )}
                          >
                            <span className="text-sm">{el?.emoji ?? '?'}</span>
                            <span className="text-xs font-bold text-white/70">{el?.name ?? 'Unknown'}</span>
                          </div>
                          <span className="text-xs font-mono text-white/30">#{warrior.tokenId}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-white/30">ATK</p>
                            <p className="text-xs font-mono font-bold text-red-400">{60 + Math.floor(Math.random() * 30)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/30">DEF</p>
                            <p className="text-xs font-mono font-bold text-blue-400">{50 + Math.floor(Math.random() * 35)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/30">SPD</p>
                            <p className="text-xs font-mono font-bold text-green-400">{55 + Math.floor(Math.random() * 30)}</p>
                          </div>
                        </div>
                        <div className="text-center pt-1 border-t border-white/5">
                          <p className="text-[10px] text-white/20">PWR</p>
                          <p className={cn('font-display text-lg font-bold bg-clip-text text-transparent', el ? `bg-gradient-to-r ${el.color}` : 'text-white')}>
                            {200 + Math.floor(Math.random() * 100)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Battles Tab */}
        {activeTab === 'battles' && (
          <div>
            <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-4">
              Battle History
            </h4>
            <div className="overflow-x-auto">
              <table className="arena-table w-full">
                <thead>
                  <tr>
                    <th>Opponent</th>
                    <th>Result</th>
                    <th>Stake</th>
                    <th>P&L</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBattles.map((battle) => (
                    <tr key={battle.id}>
                      <td>
                        <span className="text-xs font-mono text-white/60">{battle.opponent}</span>
                      </td>
                      <td>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                            battle.result === 'win'
                              ? 'bg-[var(--arena-green)]/15 text-[var(--arena-green)]'
                              : 'bg-[var(--arena-red)]/15 text-[var(--arena-red)]'
                          )}
                        >
                          {battle.result}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-mono text-white/50">{battle.stake} AVAX</span>
                      </td>
                      <td>
                        <span
                          className={cn(
                            'text-xs font-mono font-bold',
                            battle.profit >= 0 ? 'text-[var(--arena-green)]' : 'text-[var(--arena-red)]'
                          )}
                        >
                          {battle.profit >= 0 ? '+' : ''}{battle.profit.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <span className="text-[10px] text-white/30">{battle.timestamp}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Chat History Tab */}
        {activeTab === 'chat' && (
          <div>
            <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-4">
              Agent Chat History
            </h4>
            <div className="space-y-3">
              {[
                { from: 'agent', msg: 'Scanning arena for viable opponents with element disadvantage...', time: '14:32' },
                { from: 'system', msg: 'Match found: 0x9a2F...4c1D using Wind warrior (#34)', time: '14:31' },
                { from: 'agent', msg: 'Deploying warrior #12 (Fire) - element advantage confirmed. Staking 0.25 AVAX.', time: '14:31' },
                { from: 'system', msg: 'Battle resolved: VICTORY. +0.24 AVAX credited.', time: '14:32' },
                { from: 'agent', msg: 'Profit target 60% reached. Continuing aggressive scan pattern.', time: '14:33' },
              ].map((chat, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-3 p-3 rounded-lg',
                    chat.from === 'agent' ? 'bg-[var(--arena-cyan)]/5 border border-[var(--arena-cyan)]/10' : 'bg-white/[0.02] border border-white/5'
                  )}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0',
                    chat.from === 'agent' ? 'bg-[var(--arena-cyan)]/20' : 'bg-white/10'
                  )}>
                    {chat.from === 'agent' ? (
                      <Bot className="w-3.5 h-3.5 text-[var(--arena-cyan)]" />
                    ) : (
                      <Terminal className="w-3.5 h-3.5 text-white/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/60">{chat.msg}</p>
                    <p className="text-[10px] text-white/20 mt-1">{chat.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Update Strategy */}
            <div>
              <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                Strategy
              </label>
              <select
                value={settingsStrategy}
                onChange={(e) => setSettingsStrategy(e.target.value as AgentData['strategy'])}
                className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors appearance-none"
              >
                <option value="Aggressive">Aggressive</option>
                <option value="Defensive">Defensive</option>
                <option value="Analytical">Analytical</option>
                <option value="Random">Random</option>
              </select>
            </div>

            {/* Spend Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                  Daily Spend Limit (AVAX)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={settingsSpendLimit}
                  onChange={(e) => setSettingsSpendLimit(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                  Max Stake Per Battle (AVAX)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settingsMaxStake}
                  onChange={(e) => setSettingsMaxStake(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors"
                />
              </div>
            </div>

            {/* Toggle Auto-Battle */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-black/20 border border-white/5">
              <div>
                <p className="text-sm font-medium text-white/80">Auto-Battle</p>
                <p className="text-xs text-white/30">Agent will automatically find and enter battles</p>
              </div>
              <button
                onClick={() => setSettingsAutoBattle(!settingsAutoBattle)}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors duration-300',
                  settingsAutoBattle ? 'bg-[var(--arena-cyan)]/40' : 'bg-white/10'
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300',
                    settingsAutoBattle
                      ? 'left-[calc(100%-22px)] bg-[var(--arena-cyan)]'
                      : 'left-0.5 bg-white/40'
                  )}
                />
              </button>
            </div>

            {/* Save + Emergency Stop */}
            <div className="flex gap-3">
              <button className="flex-1 btn-primary py-3 text-sm">
                Save Settings
              </button>
              <button className="px-6 py-3 rounded-xl font-display text-sm font-bold uppercase tracking-wider bg-[var(--arena-red)]/10 border border-[var(--arena-red)]/30 text-[var(--arena-red)] hover:bg-[var(--arena-red)]/20 transition-colors flex items-center gap-2">
                <Power className="w-4 h-4" />
                Emergency Stop
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Activity Log
 * ------------------------------------------------------------------------- */

function ActivityLog({ entries }: { entries: LogEntry[] }) {
  const typeColors: Record<string, string> = {
    success: 'text-[var(--arena-green)]',
    error: 'text-[var(--arena-red)]',
    info: 'text-[var(--arena-cyan)]',
    warning: 'text-[var(--arena-orange)]',
  };

  return (
    <div className="rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/30">
        <Terminal className="w-4 h-4 text-[var(--arena-green)]" />
        <span className="text-xs font-display font-bold text-white/60 uppercase tracking-wider">
          Activity Log
        </span>
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--arena-red)]/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--arena-orange)]/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--arena-green)]/60" />
        </div>
      </div>

      {/* Log Entries */}
      <div className="p-4 max-h-80 overflow-y-auto space-y-1 font-mono text-xs">
        {entries.map((entry, i) => (
          <motion.div
            key={i}
            className="flex gap-2 leading-relaxed"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <span className="text-white/20 flex-shrink-0">[{entry.timestamp}]</span>
            <span className="text-[var(--arena-purple)]/70 flex-shrink-0">[{entry.agentName}]</span>
            <span className={typeColors[entry.type] ?? 'text-white/50'}>
              {entry.message}
            </span>
          </motion.div>
        ))}
        <div className="flex items-center gap-1 pt-2 text-[var(--arena-green)]/40">
          <span className="animate-pulse">_</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Dashboard Page
 * ------------------------------------------------------------------------- */

export default function AgentDashboardPage() {
  const { address, isConnected } = useAccount();

  /* --- Form state --- */
  const [formName, setFormName] = useState('');
  const [formStrategy, setFormStrategy] = useState<AgentData['strategy']>('Aggressive');
  const [formDescription, setFormDescription] = useState('');
  const [formSessionDuration, setFormSessionDuration] = useState('6h');
  const [formDailySpendLimit, setFormDailySpendLimit] = useState('');
  const [formMaxStake, setFormMaxStake] = useState('');

  /* --- Dashboard state --- */
  const [agents, setAgents] = useState<AgentData[]>(MOCK_AGENTS);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(MOCK_AGENTS[0].id);
  const [fundingAgentId, setFundingAgentId] = useState<string | null>(null);
  const [logEntries] = useState<LogEntry[]>(MOCK_LOG_ENTRIES);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;
  const fundingAgent = agents.find((a) => a.id === fundingAgentId) ?? null;

  /* --- Handlers --- */
  const handleRegister = useCallback(() => {
    if (!formName.trim()) return;

    const durationMap: Record<string, number> = {
      '1h': 1 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    };

    const newAgent: AgentData = {
      id: `agent-${Date.now()}`,
      name: formName.trim(),
      walletAddress: `0x${Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}...${Array.from({ length: 4 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      apiKey: `avx_ak_${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      strategy: formStrategy,
      description: formDescription,
      isActive: true,
      sessionExpiry: Date.now() + (durationMap[formSessionDuration] ?? durationMap['6h']),
      balance: 0,
      dailySpendLimit: Number(formDailySpendLimit) || 1.0,
      maxStakePerBattle: Number(formMaxStake) || 0.1,
      battles: 0,
      wins: 0,
      profit: 0,
      warriors: [],
      autoBattle: false,
    };

    setAgents((prev) => [...prev, newAgent]);
    setSelectedAgentId(newAgent.id);

    // Reset form
    setFormName('');
    setFormStrategy('Aggressive');
    setFormDescription('');
    setFormSessionDuration('6h');
    setFormDailySpendLimit('');
    setFormMaxStake('');
  }, [formName, formStrategy, formDescription, formSessionDuration, formDailySpendLimit, formMaxStake]);

  const handleFund = useCallback(
    (amount: number) => {
      if (!fundingAgentId) return;
      setAgents((prev) =>
        prev.map((a) =>
          a.id === fundingAgentId ? { ...a, balance: a.balance + amount } : a
        )
      );
      setFundingAgentId(null);
    },
    [fundingAgentId]
  );

  const handleEmergencyStop = useCallback((agentId: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId ? { ...a, isActive: false, autoBattle: false } : a
      )
    );
  }, []);

  const handleRenewSession = useCallback((agentId: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, sessionExpiry: Date.now() + 6 * 60 * 60 * 1000, isActive: true }
          : a
      )
    );
  }, []);

  return (
    <div className="min-h-screen relative">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="orb w-80 h-80 bg-[var(--arena-purple)] top-20 -left-20" />
        <div className="orb w-96 h-96 bg-[var(--arena-cyan)] top-60 -right-32" style={{ animationDelay: '2s' }} />
        <div className="orb w-72 h-72 bg-[var(--arena-pink)] bottom-20 left-1/4" style={{ animationDelay: '4s' }} />
      </div>

      {/* ============================================================
       * HEADER
       * ============================================================ */}
      <section className="relative pt-20 pb-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Bot className="w-8 h-8 text-[var(--arena-cyan)]" />
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-black gradient-text">
                AGENT DASHBOARD
              </h1>
              <Sparkles className="w-8 h-8 text-[var(--arena-pink)]" />
            </div>
            <p className="text-lg text-white/50 max-w-xl mx-auto">
              Manage your autonomous warriors
            </p>
          </motion.div>

          {/* Connect wallet prompt */}
          {!isConnected && (
            <motion.div
              className="mt-8 inline-flex flex-col items-center gap-3 p-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Wallet className="w-10 h-10 text-white/20" />
              <p className="text-white/50 text-sm">Connect your wallet to manage AI agents</p>
              <p className="text-white/25 text-xs">Avalanche C-Chain required</p>
            </motion.div>
          )}
        </div>
      </section>

      {isConnected && (
        <div className="max-w-7xl mx-auto px-4 pb-24 space-y-12">
          {/* ============================================================
           * REGISTER NEW AGENT
           * ============================================================ */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-5 h-5 text-[var(--arena-cyan)]" />
              <h2 className="font-display text-2xl font-bold text-white">
                Register New Agent
              </h2>
            </div>

            <div className="glass-card p-6 sm:p-8" style={{ transform: 'none' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Agent Name */}
                <div>
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. AlphaStrike"
                    className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors"
                  />
                </div>

                {/* Strategy */}
                <div>
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Strategy
                  </label>
                  <select
                    value={formStrategy}
                    onChange={(e) => setFormStrategy(e.target.value as AgentData['strategy'])}
                    className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors appearance-none"
                  >
                    <option value="Aggressive">Aggressive</option>
                    <option value="Defensive">Defensive</option>
                    <option value="Analytical">Analytical</option>
                    <option value="Random">Random</option>
                  </select>
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Describe your agent's purpose..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors resize-none"
                  />
                </div>

                {/* Session Duration */}
                <div>
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Session Duration
                  </label>
                  <select
                    value={formSessionDuration}
                    onChange={(e) => setFormSessionDuration(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors appearance-none"
                  >
                    <option value="1h">1 Hour</option>
                    <option value="6h">6 Hours</option>
                    <option value="12h">12 Hours</option>
                    <option value="24h">24 Hours</option>
                  </select>
                </div>

                {/* Daily Spend Limit */}
                <div>
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Daily Spend Limit (AVAX)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formDailySpendLimit}
                    onChange={(e) => setFormDailySpendLimit(e.target.value)}
                    placeholder="e.g. 5.0"
                    className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/20 text-sm font-mono focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors"
                  />
                </div>

                {/* Max Stake Per Battle */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                    Max Stake Per Battle (AVAX)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formMaxStake}
                    onChange={(e) => setFormMaxStake(e.target.value)}
                    placeholder="e.g. 0.5"
                    className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/20 text-sm font-mono focus:outline-none focus:border-[var(--arena-cyan)] focus:ring-1 focus:ring-[var(--arena-cyan)]/30 transition-colors"
                  />
                </div>
              </div>

              {/* Register Button + Info */}
              <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <motion.button
                  onClick={handleRegister}
                  className="btn-neon btn-neon-cyan py-3 px-8 text-sm flex items-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Bot className="w-4 h-4" />
                  Register Agent
                </motion.button>
                <div className="flex items-start gap-2 text-xs text-white/30">
                  <AlertTriangle className="w-4 h-4 text-[var(--arena-orange)] flex-shrink-0 mt-0.5" />
                  <span>A wallet will be auto-generated for your agent</span>
                </div>
              </div>
            </div>
          </motion.section>

          {/* ============================================================
           * MY AGENTS LIST
           * ============================================================ */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-[var(--arena-cyan)]" />
              <h2 className="font-display text-2xl font-bold text-white">
                My Agents
              </h2>
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-mono bg-[var(--arena-cyan)]/10 text-[var(--arena-cyan)] border border-[var(--arena-cyan)]/20">
                {agents.length}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgentId === agent.id}
                  onSelect={() => setSelectedAgentId(agent.id)}
                  onFund={() => setFundingAgentId(agent.id)}
                  onRenewSession={() => handleRenewSession(agent.id)}
                  onChangeStrategy={() => {
                    /* Would open strategy change modal */
                  }}
                  onEmergencyStop={() => handleEmergencyStop(agent.id)}
                  onWithdraw={() => {
                    /* Would open withdrawal flow */
                  }}
                />
              ))}
            </div>
          </motion.section>

          {/* ============================================================
           * AGENT CONTROLS PANEL
           * ============================================================ */}
          {selectedAgent && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex items-center gap-2 mb-6">
                <Settings className="w-5 h-5 text-[var(--arena-cyan)]" />
                <h2 className="font-display text-2xl font-bold text-white">
                  Agent Controls
                </h2>
                <ChevronRight className="w-4 h-4 text-white/20" />
                <span className="text-sm text-[var(--arena-cyan)] font-display font-bold">
                  {selectedAgent.name}
                </span>
              </div>

              <AgentControlsPanel
                agent={selectedAgent}
                recentBattles={MOCK_RECENT_BATTLES}
              />
            </motion.section>
          )}

          {/* ============================================================
           * ACTIVITY LOG
           * ============================================================ */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Terminal className="w-5 h-5 text-[var(--arena-green)]" />
              <h2 className="font-display text-2xl font-bold text-white">
                Activity Log
              </h2>
            </div>

            <ActivityLog entries={logEntries} />
          </motion.section>
        </div>
      )}

      {/* ============================================================
       * FUND AGENT MODAL
       * ============================================================ */}
      <AnimatePresence>
        {fundingAgent && (
          <FundAgentModal
            agentName={fundingAgent.name}
            onClose={() => setFundingAgentId(null)}
            onFund={handleFund}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
