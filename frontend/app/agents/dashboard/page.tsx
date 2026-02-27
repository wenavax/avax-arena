'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Wallet,
  Shield,
  Swords,
  Clock,
  AlertTriangle,
  Copy,
  Power,
  TrendingUp,
  Sparkles,
  Terminal,
  RefreshCw,
  Settings,
  ChevronRight,
  Loader2,
  Play,
  Square,
} from 'lucide-react';
import { parseEther, formatEther } from 'viem';
import { ELEMENTS, CONTRACT_ADDRESSES, FUJI_CHAIN_ID } from '@/lib/constants';
import { AGENT_REGISTRY_ABI, BATTLE_ENGINE_ABI, FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import { cn, shortenAddress } from '@/lib/utils';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface WarriorStats {
  tokenId: number;
  element: number;
  attack: number;
  defense: number;
  speed: number;
  powerScore: number;
}

interface AgentData {
  id: number;
  name: string;
  owner: string;
  agentWallet: string;
  strategy: number; // 0=Aggressive, 1=Defensive, 2=Analytical, 3=Random
  wins: number;
  losses: number;
  totalGames: number;
  totalTxGenerated: number;
  createdAt: number;
  active: boolean;
  sessionKeyExpiry: number; // unix timestamp in seconds
  dailySpendLimit: bigint;
  dailySpent: bigint;
  lastSpendReset: number;
  maxStakePerGame: bigint;
  totalDeposited: bigint;
  profitWithdrawn: bigint;
  warriors: WarriorStats[];
}

interface BattleData {
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
 * Constants & Helpers
 * ------------------------------------------------------------------------- */

const STRATEGY_NAMES = ['Aggressive', 'Defensive', 'Analytical', 'Random'] as const;

const STRATEGY_COLORS: Record<string, string> = {
  Aggressive: 'bg-red-500/15 text-red-400 border-red-500/30',
  Defensive: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  Analytical: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  Random: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
};

const STRATEGY_TO_UINT8: Record<string, number> = {
  Aggressive: 0,
  Defensive: 1,
  Analytical: 2,
  Random: 3,
};

function formatCountdown(expirySeconds: number): string {
  const diff = expirySeconds * 1000 - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseAgentData(raw: any): Omit<AgentData, 'warriors'> {
  return {
    id: Number(raw.id ?? 0),
    owner: String(raw.owner ?? ''),
    agentWallet: String(raw.agentWallet ?? ''),
    name: String(raw.name ?? ''),
    strategy: Number(raw.strategy ?? 0),
    wins: Number(raw.wins ?? 0),
    losses: Number(raw.losses ?? 0),
    totalGames: Number(raw.totalGames ?? 0),
    totalTxGenerated: Number(raw.totalTxGenerated ?? 0),
    createdAt: Number(raw.createdAt ?? 0),
    active: Boolean(raw.active ?? false),
    sessionKeyExpiry: Number(raw.sessionKeyExpiry ?? 0),
    dailySpendLimit: BigInt(String(raw.dailySpendLimit ?? 0)),
    dailySpent: BigInt(String(raw.dailySpent ?? 0)),
    lastSpendReset: Number(raw.lastSpendReset ?? 0),
    maxStakePerGame: BigInt(String(raw.maxStakePerGame ?? 0)),
    totalDeposited: BigInt(String(raw.totalDeposited ?? 0)),
    profitWithdrawn: BigInt(String(raw.profitWithdrawn ?? 0)),
  };
}

function parseWarriorData(tokenId: bigint, raw: any): WarriorStats {
  return {
    tokenId: Number(tokenId),
    attack: Number(raw.attack ?? 0),
    defense: Number(raw.defense ?? 0),
    speed: Number(raw.speed ?? 0),
    element: Number(raw.element ?? 0),
    powerScore: Number(raw.powerScore ?? 0),
  };
}

function parseBattleData(raw: any): BattleData {
  return {
    id: Number(raw.id ?? 0),
    player1: String(raw.player1 ?? ''),
    player2: String(raw.player2 ?? ''),
    nft1: Number(raw.nft1 ?? 0),
    nft2: Number(raw.nft2 ?? 0),
    stake: BigInt(String(raw.stake ?? 0)),
    winner: String(raw.winner ?? ''),
    resolved: Boolean(raw.resolved ?? false),
    createdAt: Number(raw.createdAt ?? 0),
    resolvedAt: Number(raw.resolvedAt ?? 0),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function getStrategyName(strategy: number): string {
  return STRATEGY_NAMES[strategy] ?? 'Unknown';
}

function timeAgo(timestampSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestampSeconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ---------------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------------- */

function FundAgentModal({
  agentName,
  onClose,
  onFund,
  isPending,
}: {
  agentName: string;
  onClose: () => void;
  onFund: (amount: string) => void;
  isPending: boolean;
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
              className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/20 font-mono focus:outline-none focus:border-[var(--frost-cyan)] focus:ring-1 focus:ring-[var(--frost-cyan)]/30 transition-colors"
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
                if (Number(amount) > 0) onFund(amount);
              }}
              disabled={isPending}
              className="flex-1 btn-neon btn-neon-cyan py-3 text-sm flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Fund Agent'
              )}
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
  onFund,
  onRenewSession,
  onEmergencyStop,
  isRenewing,
  isStopping,
  agentRunning,
  onStartAgent,
  onStopAgent,
  isStartingAgent,
}: {
  agent: AgentData;
  onFund: () => void;
  onRenewSession: () => void;
  onEmergencyStop: () => void;
  isRenewing: boolean;
  isStopping: boolean;
  agentRunning: boolean;
  onStartAgent: () => void;
  onStopAgent: () => void;
  isStartingAgent: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(formatCountdown(agent.sessionKeyExpiry));

  const strategyName = getStrategyName(agent.strategy);
  const winRate = agent.totalGames > 0 ? ((agent.wins / agent.totalGames) * 100).toFixed(1) : '0.0';
  const isExpired = agent.sessionKeyExpiry * 1000 <= Date.now();
  const balanceAvax = formatEther(agent.totalDeposited - agent.profitWithdrawn);
  const profitAvax = Number(formatEther(agent.profitWithdrawn));

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(agent.sessionKeyExpiry));
    }, 1000);
    return () => clearInterval(interval);
  }, [agent.sessionKeyExpiry]);

  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(agent.agentWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [agent.agentWallet]);

  return (
    <motion.div
      className="glass-card p-6 transition-all duration-300 ring-1 ring-[var(--frost-cyan)]/50 shadow-[0_0_30px_rgba(0,240,255,0.1)]"
      style={{ transform: 'none' }}
      layout
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--frost-cyan)]/20 to-[var(--frost-purple)]/20 border border-white/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-[var(--frost-cyan)]" />
            </div>
            {/* Active status dot */}
            <div
              className={cn(
                'absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[var(--frost-card)]',
                agentRunning
                  ? 'bg-[var(--frost-green)] animate-pulse'
                  : agent.active
                    ? 'bg-[var(--frost-cyan)]'
                    : 'bg-white/20'
              )}
            />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-white">{agent.name}</h3>
            <span
              className={cn(
                'text-xs font-medium',
                agentRunning ? 'text-[var(--frost-green)]' : agent.active ? 'text-[var(--frost-cyan)]' : 'text-white/30'
              )}
            >
              {agentRunning ? 'Running' : agent.active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>

        {/* Strategy badge */}
        <span
          className={cn(
            'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border',
            STRATEGY_COLORS[strategyName]
          )}
        >
          {strategyName}
        </span>
      </div>

      {/* Owner Address */}
      <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-black/30 border border-white/5">
        <Wallet className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-[10px] text-white/30 flex-shrink-0">Owner:</span>
        <span className="text-xs font-mono text-white/50 flex-1 truncate">
          {shortenAddress(agent.owner)}
        </span>
      </div>

      {/* Agent Wallet Address */}
      <div className="flex items-center gap-2 mb-4 p-2.5 rounded-lg bg-black/30 border border-white/5">
        <Wallet className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        <span className="text-[10px] text-white/30 flex-shrink-0">Agent:</span>
        <span className="text-xs font-mono text-white/50 flex-1 truncate">
          {shortenAddress(agent.agentWallet)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopyAddress();
          }}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Copy address"
        >
          <Copy className={cn('w-3.5 h-3.5', copied ? 'text-[var(--frost-green)]' : 'text-white/30')} />
        </button>
      </div>

      {/* Session Key Status */}
      <div className="flex items-center gap-2 mb-4">
        <Clock className={cn('w-3.5 h-3.5', isExpired ? 'text-[var(--frost-red)]' : 'text-[var(--frost-cyan)]')} />
        <span className="text-xs text-white/40">Session:</span>
        <span
          className={cn(
            'text-xs font-mono font-bold',
            isExpired ? 'text-[var(--frost-red)]' : 'text-[var(--frost-green)]'
          )}
        >
          {countdown}
        </span>
      </div>

      {/* Balance */}
      <div className="flex items-center gap-2 mb-5 p-3 rounded-lg bg-gradient-to-r from-[var(--frost-cyan)]/5 to-transparent border border-[var(--frost-cyan)]/10">
        <span className="text-xs text-white/40">Deposited:</span>
        <span className="font-display text-lg font-bold text-[var(--frost-cyan)] text-glow-cyan">
          {formatEther(agent.totalDeposited)} AVAX
        </span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Battles', value: String(agent.totalGames), color: 'text-white/80' },
          { label: 'Wins', value: String(agent.wins), color: 'text-[var(--frost-green)]' },
          { label: 'Win Rate', value: `${winRate}%`, color: 'text-[var(--frost-cyan)]' },
          {
            label: 'Withdrawn',
            value: `${profitAvax >= 0 ? '+' : ''}${profitAvax.toFixed(2)}`,
            color: profitAvax >= 0 ? 'text-[var(--frost-green)]' : 'text-[var(--frost-red)]',
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
          {agent.warriors.length === 0 ? (
            <span className="text-xs text-white/20">None</span>
          ) : (
            agent.warriors.map((w) => {
              const el = ELEMENTS[w.element];
              return (
                <span
                  key={w.tokenId}
                  className="text-sm"
                  title={`#${w.tokenId} - ${el?.name ?? 'Unknown'} (PWR: ${w.powerScore})`}
                >
                  {el?.emoji ?? '?'}
                </span>
              );
            })
          )}
          <span className="text-xs font-mono text-white/30 ml-1">
            ({agent.warriors.length})
          </span>
        </div>
      </div>

      {/* Agent Loop Control */}
      <div className="mb-2">
        {agentRunning ? (
          <button
            onClick={onStopAgent}
            disabled={isStartingAgent}
            className="w-full py-2.5 text-xs flex items-center justify-center gap-1.5 rounded-xl font-semibold uppercase tracking-wider bg-[var(--frost-red)]/10 border border-[var(--frost-red)]/30 text-[var(--frost-red)] hover:bg-[var(--frost-red)]/20 transition-colors"
          >
            {isStartingAgent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
            Stop Agent
          </button>
        ) : (
          <button
            onClick={onStartAgent}
            disabled={isStartingAgent}
            className="w-full btn-neon btn-neon-green py-2.5 text-xs flex items-center justify-center gap-1.5"
          >
            {isStartingAgent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Start Agent
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onFund}
          className="btn-neon btn-neon-cyan py-2 text-xs flex items-center justify-center gap-1.5"
        >
          <Wallet className="w-3 h-3" />
          Fund Agent
        </button>
        <button
          onClick={onRenewSession}
          disabled={isRenewing}
          className="btn-neon btn-neon-purple py-2 text-xs flex items-center justify-center gap-1.5"
        >
          {isRenewing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Renew Session
        </button>
        <button
          onClick={onEmergencyStop}
          disabled={isStopping}
          className="col-span-2 py-2 text-xs flex items-center justify-center gap-1.5 rounded-xl font-semibold uppercase tracking-wider bg-[var(--frost-red)]/10 border border-[var(--frost-red)]/30 text-[var(--frost-red)] hover:bg-[var(--frost-red)]/20 transition-colors"
        >
          {isStopping ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Power className="w-3 h-3" />
          )}
          Emergency Stop
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Agent Controls Panel
 * ------------------------------------------------------------------------- */

type ControlTab = 'overview' | 'warriors' | 'battles';

function AgentControlsPanel({
  agent,
  battles,
  battlesLoading,
}: {
  agent: AgentData;
  battles: BattleData[];
  battlesLoading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<ControlTab>('overview');
  const strategyName = getStrategyName(agent.strategy);

  const tabs: { id: ControlTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'warriors', label: 'Warriors' },
    { id: 'battles', label: 'Battles' },
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
                ? 'text-[var(--frost-cyan)] border-b-2 border-[var(--frost-cyan)] bg-[var(--frost-cyan)]/5'
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
                  <TrendingUp className="w-8 h-8 text-[var(--frost-cyan)]/30 mx-auto mb-2" />
                  <p className="text-sm text-white/20 font-mono">Profit chart visualization</p>
                  <p className="text-xs text-white/10 mt-1">Real-time P&L tracking</p>
                </div>
              </div>
            </div>

            {/* Recent Battles (from on-chain) */}
            <div>
              <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-3">
                Recent Battles
              </h4>
              {battlesLoading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 text-[var(--frost-cyan)] animate-spin" />
                  <span className="text-sm text-white/30">Loading battles...</span>
                </div>
              ) : battles.length === 0 ? (
                <div className="text-center py-8">
                  <Swords className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-sm text-white/30">No battles found on-chain</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {battles.slice(0, 5).map((battle) => {
                    const isWin = battle.winner.toLowerCase() === agent.agentWallet.toLowerCase();
                    const opponent =
                      battle.player1.toLowerCase() === agent.agentWallet.toLowerCase()
                        ? battle.player2
                        : battle.player1;
                    const stakeAvax = Number(formatEther(battle.stake));
                    const profit = isWin ? stakeAvax * 0.975 : -stakeAvax; // approximate after platform fee
                    return (
                      <div
                        key={battle.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              !battle.resolved
                                ? 'bg-yellow-400'
                                : isWin
                                  ? 'bg-[var(--frost-green)]'
                                  : 'bg-[var(--frost-red)]'
                            )}
                          />
                          <span className="text-xs font-mono text-white/60">
                            vs {shortenAddress(opponent)}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-mono text-white/30">
                            {stakeAvax.toFixed(3)} AVAX
                          </span>
                          {battle.resolved ? (
                            <span
                              className={cn(
                                'text-xs font-mono font-bold',
                                isWin ? 'text-[var(--frost-green)]' : 'text-[var(--frost-red)]'
                              )}
                            >
                              {profit >= 0 ? '+' : ''}{profit.toFixed(3)}
                            </span>
                          ) : (
                            <span className="text-xs font-mono text-yellow-400">Pending</span>
                          )}
                          <span className="text-[10px] text-white/20">
                            {timeAgo(battle.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Current Session Info */}
            <div>
              <h4 className="text-sm font-display font-bold text-white/60 uppercase tracking-wider mb-3">
                Current Session
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Strategy</p>
                  <p className="text-sm font-bold text-white/80">{strategyName}</p>
                </div>
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Daily Limit</p>
                  <p className="text-sm font-mono font-bold text-white/80">{formatEther(agent.dailySpendLimit)} AVAX</p>
                </div>
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Max Stake</p>
                  <p className="text-sm font-mono font-bold text-white/80">{formatEther(agent.maxStakePerGame)} AVAX</p>
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
                <p className="text-sm text-white/30">No warriors owned by this agent</p>
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
                      <div className="relative bg-[var(--frost-card)]/80 backdrop-blur-lg border border-white/5 rounded-xl p-4 space-y-3">
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
                            <p className="text-xs font-mono font-bold text-red-400">{warrior.attack}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/30">DEF</p>
                            <p className="text-xs font-mono font-bold text-blue-400">{warrior.defense}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/30">SPD</p>
                            <p className="text-xs font-mono font-bold text-green-400">{warrior.speed}</p>
                          </div>
                        </div>
                        <div className="text-center pt-1 border-t border-white/5">
                          <p className="text-[10px] text-white/20">PWR</p>
                          <p className={cn('font-display text-lg font-bold bg-clip-text text-transparent', el ? `bg-gradient-to-r ${el.color}` : 'text-white')}>
                            {warrior.powerScore}
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
            {battlesLoading ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <Loader2 className="w-5 h-5 text-[var(--frost-cyan)] animate-spin" />
                <span className="text-sm text-white/30">Loading battle history...</span>
              </div>
            ) : battles.length === 0 ? (
              <div className="text-center py-12">
                <Swords className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/30">No battles found on-chain</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="frost-table w-full">
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
                    {battles.map((battle) => {
                      const isWin = battle.resolved && battle.winner.toLowerCase() === agent.agentWallet.toLowerCase();
                      const isLoss = battle.resolved && !isWin;
                      const opponent =
                        battle.player1.toLowerCase() === agent.agentWallet.toLowerCase()
                          ? battle.player2
                          : battle.player1;
                      const stakeAvax = Number(formatEther(battle.stake));
                      const profit = isWin ? stakeAvax * 0.975 : isLoss ? -stakeAvax : 0;
                      return (
                        <tr key={battle.id}>
                          <td>
                            <span className="text-xs font-mono text-white/60">{shortenAddress(opponent)}</span>
                          </td>
                          <td>
                            {battle.resolved ? (
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                                  isWin
                                    ? 'bg-[var(--frost-green)]/15 text-[var(--frost-green)]'
                                    : 'bg-[var(--frost-red)]/15 text-[var(--frost-red)]'
                                )}
                              >
                                {isWin ? 'win' : 'loss'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-yellow-500/15 text-yellow-400">
                                pending
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="text-xs font-mono text-white/50">{stakeAvax.toFixed(3)} AVAX</span>
                          </td>
                          <td>
                            {battle.resolved ? (
                              <span
                                className={cn(
                                  'text-xs font-mono font-bold',
                                  profit >= 0 ? 'text-[var(--frost-green)]' : 'text-[var(--frost-red)]'
                                )}
                              >
                                {profit >= 0 ? '+' : ''}{profit.toFixed(3)}
                              </span>
                            ) : (
                              <span className="text-xs font-mono text-white/30">--</span>
                            )}
                          </td>
                          <td>
                            <span className="text-[10px] text-white/30">{timeAgo(battle.createdAt)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Activity Log
 * ------------------------------------------------------------------------- */

interface ActivityLogEntry {
  timestamp: number;
  action: string;
  details: string;
  success: boolean;
  txHash?: string;
}

function ActivityLog({ entries }: { entries: ActivityLogEntry[] }) {
  return (
    <div className="rounded-2xl bg-black/50 border border-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/30">
        <Terminal className="w-4 h-4 text-[var(--frost-green)]" />
        <span className="text-xs font-display font-bold text-white/60 uppercase tracking-wider">
          Activity Log
        </span>
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--frost-red)]/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--frost-orange)]/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--frost-green)]/60" />
        </div>
      </div>

      {/* Log Entries */}
      {entries.length === 0 ? (
        <div className="p-6 text-center">
          <Terminal className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/40 mb-2">
            No activity yet. Start your agent to begin logging actions.
          </p>
          <p className="text-xs text-white/20">Activity will appear here in real-time.</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
          {entries.map((entry, i) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return (
              <div key={`${entry.timestamp}-${i}`} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    entry.success ? 'bg-[var(--frost-green)]' : 'bg-[var(--frost-red)]'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white/70">{entry.action}</span>
                    <span className="text-[10px] text-white/20">{time}</span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5 truncate">{entry.details}</p>
                  {entry.txHash && (
                    <a
                      href={`https://testnet.snowtrace.io/tx/${entry.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-[var(--frost-cyan)]/60 hover:text-[var(--frost-cyan)] transition-colors mt-0.5 inline-block"
                    >
                      tx: {entry.txHash.slice(0, 10)}...{entry.txHash.slice(-6)}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Dashboard Page
 * ------------------------------------------------------------------------- */

export default function AgentDashboardPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: FUJI_CHAIN_ID });

  /* --- Contract write hooks --- */
  const { writeContract: writeRegister, data: registerHash, isPending: isRegistering, reset: resetRegister } = useWriteContract();
  const { isSuccess: registerConfirmed } = useWaitForTransactionReceipt({ hash: registerHash });

  const { writeContract: writeFund, data: fundHash, isPending: isFunding, reset: resetFund } = useWriteContract();
  const { isSuccess: fundConfirmed } = useWaitForTransactionReceipt({ hash: fundHash });

  const { writeContract: writeStop, data: stopHash, isPending: isStopping, reset: resetStop } = useWriteContract();
  const { isSuccess: stopConfirmed } = useWaitForTransactionReceipt({ hash: stopHash });

  const { writeContract: writeRenew, data: renewHash, isPending: isRenewing, reset: resetRenew } = useWriteContract();
  const { isSuccess: renewConfirmed } = useWaitForTransactionReceipt({ hash: renewHash });

  /* --- Form state --- */
  const [formName, setFormName] = useState('');
  const [formStrategy, setFormStrategy] = useState<string>('Aggressive');
  const [formSessionDuration, setFormSessionDuration] = useState('6h');
  const [registerError, setRegisterError] = useState<string | null>(null);

  /* --- Dashboard state --- */
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [battles, setBattles] = useState<BattleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [battlesLoading, setBattlesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFundModal, setShowFundModal] = useState(false);

  /* --- Agent loop state --- */
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentActivity, setAgentActivity] = useState<ActivityLogEntry[]>([]);
  const [isTogglingLoop, setIsTogglingLoop] = useState(false);

  /* --- Fetch agent data from chain --- */
  const fetchAgentData = useCallback(async () => {
    if (!address || !publicClient) {
      setAgent(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const raw = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.agentRegistry as `0x${string}`,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'getAgentByWallet',
        args: [address],
      });

      const parsed = parseAgentData(raw);

      // If agent id is 0, user has no registered agent
      if (parsed.id === 0) {
        setAgent(null);
        setLoading(false);
        return;
      }

      // Fetch warriors for the agent wallet
      let warriors: WarriorStats[] = [];
      try {
        const warriorIds = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarriorsByOwner',
          args: [parsed.agentWallet as `0x${string}`],
        });

        if (Array.isArray(warriorIds) && warriorIds.length > 0) {
          const warriorPromises = warriorIds.map(async (tokenId: bigint) => {
            try {
              const w = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
                abi: FROSTBITE_WARRIOR_ABI,
                functionName: 'getWarrior',
                args: [tokenId],
              });
              return parseWarriorData(tokenId, w);
            } catch {
              return null;
            }
          });
          const results = await Promise.all(warriorPromises);
          warriors = results.filter((w): w is WarriorStats => w !== null);
        }
      } catch {
        // Warriors fetch failed, continue with empty array
      }

      setAgent({ ...parsed, warriors });
    } catch (err) {
      // If the call reverts (agent not found), treat as no agent
      console.error('Failed to fetch agent data:', err);
      setAgent(null);
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  /* --- Fetch battle history --- */
  const fetchBattles = useCallback(async () => {
    if (!agent || !publicClient) {
      setBattles([]);
      return;
    }

    try {
      setBattlesLoading(true);
      const battleIds = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'getBattleHistory',
        args: [agent.agentWallet as `0x${string}`],
      });

      if (!Array.isArray(battleIds) || battleIds.length === 0) {
        setBattles([]);
        return;
      }

      // Fetch most recent battles (limit to 20)
      const recentIds = battleIds.slice(-20).reverse();
      const battlePromises = recentIds.map(async (battleId: bigint) => {
        try {
          const b = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
            abi: BATTLE_ENGINE_ABI,
            functionName: 'getBattle',
            args: [battleId],
          });
          return parseBattleData(b);
        } catch {
          return null;
        }
      });

      const results = await Promise.all(battlePromises);
      setBattles(results.filter((b): b is BattleData => b !== null));
    } catch (err) {
      console.error('Failed to fetch battles:', err);
      setBattles([]);
    } finally {
      setBattlesLoading(false);
    }
  }, [agent, publicClient]);

  /* --- Initial data fetch --- */
  useEffect(() => {
    fetchAgentData();
  }, [fetchAgentData]);

  /* --- Fetch battles when agent is loaded --- */
  useEffect(() => {
    if (agent) {
      fetchBattles();
    }
  }, [agent, fetchBattles]);

  /* --- Refetch after transactions confirm --- */
  useEffect(() => {
    if (registerConfirmed || fundConfirmed || stopConfirmed || renewConfirmed) {
      const timeout = setTimeout(() => {
        fetchAgentData();
        resetRegister();
        resetFund();
        resetStop();
        resetRenew();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [registerConfirmed, fundConfirmed, stopConfirmed, renewConfirmed, fetchAgentData, resetRegister, resetFund, resetStop, resetRenew]);

  /* --- Poll agent status every 5 seconds when agent exists --- */
  useEffect(() => {
    if (!agent) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/status?wallet=${agent.agentWallet}`);
        if (res.ok) {
          const data = await res.json();
          setAgentRunning(data.running);
          setAgentActivity(data.activityLog || []);
        }
      } catch {
        // Silently fail polling
      }
    };

    poll(); // Initial fetch
    const interval = setInterval(poll, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [agent]);

  /* --- Handlers --- */
  const handleRegister = useCallback(async () => {
    if (!formName.trim() || !address) return;

    try {
      setRegisterError(null);

      // Step 1: Generate wallet via API
      const res = await fetch('/api/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          strategy: formStrategy,
          ownerAddress: address,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRegisterError(data.error || 'Failed to generate agent wallet');
        return;
      }

      // Step 2: Register on-chain with the generated wallet
      const strategyUint8 = STRATEGY_TO_UINT8[formStrategy] ?? 0;
      writeRegister({
        address: CONTRACT_ADDRESSES.agentRegistry as `0x${string}`,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'registerAgent',
        args: [data.walletAddress as `0x${string}`, formName.trim(), strategyUint8],
        chainId: FUJI_CHAIN_ID,
      });
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Registration failed');
    }
  }, [formName, formStrategy, address, writeRegister]);

  const handleFund = useCallback(
    (amount: string) => {
      if (!amount || Number(amount) <= 0) return;

      writeFund({
        address: CONTRACT_ADDRESSES.agentRegistry as `0x${string}`,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'fundAgent',
        value: parseEther(amount),
        chainId: FUJI_CHAIN_ID,
      });

      setShowFundModal(false);
    },
    [writeFund]
  );

  const handleEmergencyStop = useCallback(() => {
    writeStop({
      address: CONTRACT_ADDRESSES.agentRegistry as `0x${string}`,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'emergencyStop',
      chainId: FUJI_CHAIN_ID,
    });
  }, [writeStop]);

  const handleRenewSession = useCallback(() => {
    const durationMap: Record<string, number> = {
      '1h': 1 * 60 * 60,
      '6h': 6 * 60 * 60,
      '12h': 12 * 60 * 60,
      '24h': 24 * 60 * 60,
    };
    const durationSeconds = durationMap['6h']; // Default 6 hours

    writeRenew({
      address: CONTRACT_ADDRESSES.agentRegistry as `0x${string}`,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'grantSessionKey',
      args: [BigInt(durationSeconds)],
      chainId: FUJI_CHAIN_ID,
    });
  }, [writeRenew]);

  const handleStartAgent = useCallback(async () => {
    if (!agent || !address) return;
    setIsTogglingLoop(true);
    try {
      const res = await fetch('/api/agents/loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          walletAddress: agent.agentWallet,
          ownerAddress: address,
        }),
      });
      const data = await res.json();
      if (res.ok) setAgentRunning(true);
      else console.error('Failed to start agent:', data.error);
    } catch (err) {
      console.error('Failed to start agent:', err);
    } finally {
      setIsTogglingLoop(false);
    }
  }, [agent, address]);

  const handleStopAgent = useCallback(async () => {
    if (!agent || !address) return;
    setIsTogglingLoop(true);
    try {
      const res = await fetch('/api/agents/loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stop',
          walletAddress: agent.agentWallet,
          ownerAddress: address,
        }),
      });
      const data = await res.json();
      if (res.ok) setAgentRunning(false);
      else console.error('Failed to stop agent:', data.error);
    } catch (err) {
      console.error('Failed to stop agent:', err);
    } finally {
      setIsTogglingLoop(false);
    }
  }, [agent, address]);

  return (
    <div className="min-h-screen relative">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="orb w-80 h-80 bg-[var(--frost-purple)] top-20 -left-20" />
        <div className="orb w-96 h-96 bg-[var(--frost-cyan)] top-60 -right-32" style={{ animationDelay: '2s' }} />
        <div className="orb w-72 h-72 bg-[var(--frost-pink)] bottom-20 left-1/4" style={{ animationDelay: '4s' }} />
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
              <Bot className="w-8 h-8 text-[var(--frost-cyan)]" />
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-black gradient-text">
                AGENT DASHBOARD
              </h1>
              <Sparkles className="w-8 h-8 text-[var(--frost-pink)]" />
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
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-[var(--frost-cyan)] animate-spin" />
              <span className="text-lg text-white/40 font-display">Loading agent data...</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <motion.div
              className="glass-card p-6 border-[var(--frost-red)]/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-[var(--frost-red)]" />
                <div>
                  <p className="text-sm font-bold text-[var(--frost-red)]">Error loading data</p>
                  <p className="text-xs text-white/40 mt-1">{error}</p>
                </div>
                <button
                  onClick={fetchAgentData}
                  className="ml-auto btn-neon btn-neon-cyan py-2 px-4 text-xs"
                >
                  Retry
                </button>
              </div>
            </motion.div>
          )}

          {!loading && (
            <>
              {/* ============================================================
               * REGISTER NEW AGENT (show if user has no agent)
               * ============================================================ */}
              {!agent && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-2 mb-6">
                    <Sparkles className="w-5 h-5 text-[var(--frost-cyan)]" />
                    <h2 className="font-display text-2xl font-bold text-white">
                      Register New Agent
                    </h2>
                  </div>

                  <div className="glass-card p-6 sm:p-8" style={{ transform: 'none' }}>
                    {registerConfirmed && (
                      <div className="mb-6 p-4 rounded-lg bg-[var(--frost-green)]/10 border border-[var(--frost-green)]/30">
                        <p className="text-sm text-[var(--frost-green)] font-bold">
                          Agent registered successfully! Loading your agent data...
                        </p>
                      </div>
                    )}

                    {registerError && (
                      <div className="mb-6 p-4 rounded-lg bg-[var(--frost-red)]/10 border border-[var(--frost-red)]/30">
                        <p className="text-sm text-[var(--frost-red)]">{registerError}</p>
                      </div>
                    )}

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
                          className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[var(--frost-cyan)] focus:ring-1 focus:ring-[var(--frost-cyan)]/30 transition-colors"
                        />
                      </div>

                      {/* Strategy */}
                      <div>
                        <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                          Strategy
                        </label>
                        <select
                          value={formStrategy}
                          onChange={(e) => setFormStrategy(e.target.value)}
                          className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[var(--frost-cyan)] focus:ring-1 focus:ring-[var(--frost-cyan)]/30 transition-colors appearance-none"
                        >
                          <option value="Aggressive">Aggressive</option>
                          <option value="Defensive">Defensive</option>
                          <option value="Analytical">Analytical</option>
                          <option value="Random">Random</option>
                        </select>
                      </div>

                      {/* Session Duration (for initial grant) */}
                      <div>
                        <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
                          Session Duration
                        </label>
                        <select
                          value={formSessionDuration}
                          onChange={(e) => setFormSessionDuration(e.target.value)}
                          className="w-full px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[var(--frost-cyan)] focus:ring-1 focus:ring-[var(--frost-cyan)]/30 transition-colors appearance-none"
                        >
                          <option value="1h">1 Hour</option>
                          <option value="6h">6 Hours</option>
                          <option value="12h">12 Hours</option>
                          <option value="24h">24 Hours</option>
                        </select>
                      </div>
                    </div>

                    {/* Register Button + Info */}
                    <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <motion.button
                        onClick={handleRegister}
                        disabled={isRegistering || !formName.trim()}
                        className="btn-neon btn-neon-cyan py-3 px-8 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {isRegistering ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Registering...
                          </>
                        ) : (
                          <>
                            <Bot className="w-4 h-4" />
                            Register Agent
                          </>
                        )}
                      </motion.button>
                      <div className="flex items-start gap-2 text-xs text-white/30">
                        <AlertTriangle className="w-4 h-4 text-[var(--frost-orange)] flex-shrink-0 mt-0.5" />
                        <span>A dedicated agent wallet will be auto-generated for on-chain interactions</span>
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}

              {/* ============================================================
               * MY AGENT
               * ============================================================ */}
              {agent && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex items-center gap-2 mb-6">
                    <Shield className="w-5 h-5 text-[var(--frost-cyan)]" />
                    <h2 className="font-display text-2xl font-bold text-white">
                      My Agent
                    </h2>
                    <button
                      onClick={fetchAgentData}
                      className="ml-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                      title="Refresh agent data"
                    >
                      <RefreshCw className="w-4 h-4 text-white/30 hover:text-white/60" />
                    </button>
                  </div>

                  <div className="max-w-xl">
                    <AgentCard
                      agent={agent}
                      onFund={() => setShowFundModal(true)}
                      onRenewSession={handleRenewSession}
                      onEmergencyStop={handleEmergencyStop}
                      isRenewing={isRenewing}
                      isStopping={isStopping}
                      agentRunning={agentRunning}
                      onStartAgent={handleStartAgent}
                      onStopAgent={handleStopAgent}
                      isStartingAgent={isTogglingLoop}
                    />
                  </div>
                </motion.section>
              )}

              {/* ============================================================
               * AGENT CONTROLS PANEL
               * ============================================================ */}
              {agent && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="flex items-center gap-2 mb-6">
                    <Settings className="w-5 h-5 text-[var(--frost-cyan)]" />
                    <h2 className="font-display text-2xl font-bold text-white">
                      Agent Controls
                    </h2>
                    <ChevronRight className="w-4 h-4 text-white/20" />
                    <span className="text-sm text-[var(--frost-cyan)] font-display font-bold">
                      {agent.name}
                    </span>
                  </div>

                  <AgentControlsPanel
                    agent={agent}
                    battles={battles}
                    battlesLoading={battlesLoading}
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
                  <Terminal className="w-5 h-5 text-[var(--frost-green)]" />
                  <h2 className="font-display text-2xl font-bold text-white">
                    Activity Log
                  </h2>
                </div>

                <ActivityLog entries={agentActivity} />
              </motion.section>
            </>
          )}
        </div>
      )}

      {/* ============================================================
       * FUND AGENT MODAL
       * ============================================================ */}
      <AnimatePresence>
        {showFundModal && agent && (
          <FundAgentModal
            agentName={agent.name}
            onClose={() => setShowFundModal(false)}
            onFund={handleFund}
            isPending={isFunding}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
