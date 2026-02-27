'use client';

import { motion } from 'framer-motion';
import {
  Copy, ExternalLink, Trophy, Swords, TrendingUp,
  Zap, Bot, Shield, Target, BarChart3, Sparkles, Loader2
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ELEMENTS, CONTRACT_ADDRESSES } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI, AGENT_REGISTRY_ABI } from '@/lib/contracts';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface Warrior {
  tokenId: number;
  attack: number;
  defense: number;
  speed: number;
  element: number;
  specialPower: number;
  level: number;
  experience: number;
  battleWins: number;
  battleLosses: number;
  powerScore: number;
}

interface Battle {
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

interface AgentInfo {
  id: number;
  owner: string;
  agentWallet: string;
  name: string;
  strategy: number;
  wins: number;
  losses: number;
  totalGames: number;
  totalTxGenerated: number;
  createdAt: number;
  active: boolean;
  sessionKeyExpiry: number;
  dailySpendLimit: bigint;
  dailySpent: bigint;
  lastSpendReset: number;
  maxStakePerGame: bigint;
  totalDeposited: bigint;
  profitWithdrawn: bigint;
}

interface ProfileStats {
  totalBattles: number;
  wins: number;
  winRate: number;
  avaxEarned: number;
  warriorCount: number;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getElement(id: number) {
  return ELEMENTS[id] ?? ELEMENTS[0];
}

function formatDate(timestamp: number): string {
  if (timestamp === 0) return '—';
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function parseWarriorData(raw: Record<string, unknown>, tokenId: number): Warrior {
  return {
    tokenId,
    attack: Number(raw.attack ?? raw[0] ?? 0),
    defense: Number(raw.defense ?? raw[1] ?? 0),
    speed: Number(raw.speed ?? raw[2] ?? 0),
    element: Number(raw.element ?? raw[3] ?? 0),
    specialPower: Number(raw.specialPower ?? raw[4] ?? 0),
    level: Number(raw.level ?? raw[5] ?? 0),
    experience: Number(raw.experience ?? raw[6] ?? 0),
    battleWins: Number(raw.battleWins ?? raw[7] ?? 0),
    battleLosses: Number(raw.battleLosses ?? raw[8] ?? 0),
    powerScore: Number(raw.powerScore ?? raw[9] ?? 0),
  };
}

function parseBattleData(raw: Record<string, unknown>): Battle {
  return {
    id: Number(raw.id ?? raw[0] ?? 0),
    player1: String(raw.player1 ?? raw[1] ?? ''),
    player2: String(raw.player2 ?? raw[2] ?? ''),
    nft1: Number(raw.nft1 ?? raw[3] ?? 0),
    nft2: Number(raw.nft2 ?? raw[4] ?? 0),
    stake: BigInt(String(raw.stake ?? raw[5] ?? 0)),
    winner: String(raw.winner ?? raw[6] ?? ''),
    resolved: Boolean(raw.resolved ?? raw[7] ?? false),
    createdAt: Number(raw.createdAt ?? raw[8] ?? 0),
    resolvedAt: Number(raw.resolvedAt ?? raw[9] ?? 0),
  };
}

function parseAgentData(raw: Record<string, unknown>): AgentInfo {
  return {
    id: Number(raw.id ?? raw[0] ?? 0),
    owner: String(raw.owner ?? raw[1] ?? ''),
    agentWallet: String(raw.agentWallet ?? raw[2] ?? ''),
    name: String(raw.name ?? raw[3] ?? ''),
    strategy: Number(raw.strategy ?? raw[4] ?? 0),
    wins: Number(raw.wins ?? raw[5] ?? 0),
    losses: Number(raw.losses ?? raw[6] ?? 0),
    totalGames: Number(raw.totalGames ?? raw[7] ?? 0),
    totalTxGenerated: Number(raw.totalTxGenerated ?? raw[8] ?? 0),
    createdAt: Number(raw.createdAt ?? raw[9] ?? 0),
    active: Boolean(raw.active ?? raw[10] ?? false),
    sessionKeyExpiry: Number(raw.sessionKeyExpiry ?? raw[11] ?? 0),
    dailySpendLimit: BigInt(String(raw.dailySpendLimit ?? raw[12] ?? 0)),
    dailySpent: BigInt(String(raw.dailySpent ?? raw[13] ?? 0)),
    lastSpendReset: Number(raw.lastSpendReset ?? raw[14] ?? 0),
    maxStakePerGame: BigInt(String(raw.maxStakePerGame ?? raw[15] ?? 0)),
    totalDeposited: BigInt(String(raw.totalDeposited ?? raw[16] ?? 0)),
    profitWithdrawn: BigInt(String(raw.profitWithdrawn ?? raw[17] ?? 0)),
  };
}

const STRATEGY_NAMES: Record<number, string> = {
  0: 'Aggressive',
  1: 'Defensive',
  2: 'Balanced',
  3: 'Analytical',
  4: 'Random',
};

/* ---------------------------------------------------------------------------
 * WarriorImage Component
 * ------------------------------------------------------------------------- */

function WarriorImage({ tokenId, element, size }: { tokenId: number; element: number; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/metadata/${tokenId}/image?element=${element}`}
      alt={`Warrior #${tokenId}`}
      width={size}
      height={size}
      className="w-full h-full object-cover rounded-lg"
      loading="lazy"
    />
  );
}

/* ---------------------------------------------------------------------------
 * Loading Spinner
 * ------------------------------------------------------------------------- */

function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
      {label && <span className="text-xs text-white/40">{label}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Empty State
 * ------------------------------------------------------------------------- */

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Icon className="w-8 h-8 text-white/20" />
      <span className="text-sm text-white/40">{message}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Constants
 * ------------------------------------------------------------------------- */

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/* ---------------------------------------------------------------------------
 * Profile Page
 * ------------------------------------------------------------------------- */

export default function ProfilePage() {
  const params = useParams();
  const rawAddress = (params.address as string) || '';
  const isValidAddress = ETH_ADDRESS_REGEX.test(rawAddress);
  const address = isValidAddress ? rawAddress : '0x0000000000000000000000000000000000000000';
  const [copied, setCopied] = useState(false);

  const publicClient = usePublicClient();

  // Data state
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [battleHistory, setBattleHistory] = useState<Battle[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [stats, setStats] = useState<ProfileStats>({
    totalBattles: 0,
    wins: 0,
    winRate: 0,
    avaxEarned: 0,
    warriorCount: 0,
  });

  // Loading state
  const [loadingWarriors, setLoadingWarriors] = useState(true);
  const [loadingBattles, setLoadingBattles] = useState(true);
  const [loadingAgent, setLoadingAgent] = useState(true);

  // Warrior element distribution (computed)
  const elementDistribution = ELEMENTS.map((el, i) => ({
    name: el.name,
    emoji: el.emoji,
    count: warriors.filter((w) => w.element === i).length,
    color: `bg-gradient-to-r ${el.color}`,
  }));
  const maxCount = Math.max(...elementDistribution.map((g) => g.count), 1);

  /* -------------------------------------------------------------------------
   * Data Fetching
   * ----------------------------------------------------------------------- */

  // Fetch warriors
  useEffect(() => {
    if (!publicClient || !isValidAddress) {
      setLoadingWarriors(false);
      return;
    }
    let cancelled = false;

    async function fetchWarriors() {
      setLoadingWarriors(true);
      try {
        const ids = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarriorsByOwner',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (cancelled) return;
        if (!ids || ids.length === 0) {
          setWarriors([]);
          setLoadingWarriors(false);
          return;
        }

        const details = await Promise.all(
          ids.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'getWarrior',
              args: [id],
            })
          )
        );

        if (cancelled) return;
        setWarriors(
          details.map((raw, i) => parseWarriorData(raw as Record<string, unknown>, Number(ids[i])))
        );
      } catch (err) {
        console.error('[profile] Failed to fetch warriors:', err);
        if (!cancelled) setWarriors([]);
      } finally {
        if (!cancelled) setLoadingWarriors(false);
      }
    }

    fetchWarriors();
    return () => { cancelled = true; };
  }, [publicClient, address, isValidAddress]);

  // Fetch battle history
  useEffect(() => {
    if (!publicClient || !isValidAddress) {
      setLoadingBattles(false);
      return;
    }
    let cancelled = false;

    async function fetchBattles() {
      setLoadingBattles(true);
      try {
        const battleIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'getBattleHistory',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (cancelled) return;
        if (!battleIds || battleIds.length === 0) {
          setBattleHistory([]);
          setLoadingBattles(false);
          return;
        }

        // Get last 10 battles (most recent)
        const recentIds = battleIds.slice(-10).reverse();

        const battleDetails = await Promise.all(
          recentIds.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
              abi: BATTLE_ENGINE_ABI,
              functionName: 'getBattle',
              args: [id],
            })
          )
        );

        if (cancelled) return;

        const parsed = battleDetails.map((raw) =>
          parseBattleData(raw as Record<string, unknown>)
        );

        setBattleHistory(parsed);

        // Compute stats from ALL battle IDs (not just last 10)
        // For full stats, fetch all battles
        const allBattleDetails = battleIds.length <= 10
          ? battleDetails
          : await Promise.all(
              battleIds.map((id) =>
                publicClient!.readContract({
                  address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
                  abi: BATTLE_ENGINE_ABI,
                  functionName: 'getBattle',
                  args: [id],
                })
              )
            );

        if (cancelled) return;

        const allBattles = allBattleDetails.map((raw) =>
          parseBattleData(raw as Record<string, unknown>)
        );

        const totalBattles = allBattles.length;
        const wins = allBattles.filter(
          (b) => b.winner.toLowerCase() === address.toLowerCase()
        ).length;
        const winRate = totalBattles > 0 ? (wins / totalBattles) * 100 : 0;

        // AVAX earned = sum of stakes for battles won
        let avaxEarned = BigInt(0);
        for (const b of allBattles) {
          if (b.winner.toLowerCase() === address.toLowerCase()) {
            avaxEarned += b.stake;
          }
        }

        setStats((prev) => ({
          ...prev,
          totalBattles,
          wins,
          winRate: Math.round(winRate * 10) / 10,
          avaxEarned: parseFloat(formatEther(avaxEarned)),
        }));
      } catch (err) {
        console.error('[profile] Failed to fetch battle history:', err);
        if (!cancelled) setBattleHistory([]);
      } finally {
        if (!cancelled) setLoadingBattles(false);
      }
    }

    fetchBattles();
    return () => { cancelled = true; };
  }, [publicClient, address, isValidAddress]);

  // Update warrior count in stats when warriors change
  useEffect(() => {
    setStats((prev) => ({ ...prev, warriorCount: warriors.length }));
  }, [warriors]);

  // Fetch agent info
  useEffect(() => {
    if (!publicClient || !isValidAddress) {
      setLoadingAgent(false);
      return;
    }
    let cancelled = false;

    async function fetchAgent() {
      setLoadingAgent(true);
      try {
        const raw = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.agentRegistry as `0x${string}`,
          abi: AGENT_REGISTRY_ABI,
          functionName: 'getAgentByWallet',
          args: [address as `0x${string}`],
        });

        if (cancelled) return;
        const agent = parseAgentData(raw as Record<string, unknown>);

        // If agent ID is 0 and name is empty, likely no agent registered
        if (agent.id === 0 && agent.name === '') {
          setAgentInfo(null);
        } else {
          setAgentInfo(agent);
        }
      } catch (err) {
        console.error('[profile] Failed to fetch agent info:', err);
        if (!cancelled) setAgentInfo(null);
      } finally {
        if (!cancelled) setLoadingAgent(false);
      }
    }

    fetchAgent();
    return () => { cancelled = true; };
  }, [publicClient, address, isValidAddress]);

  /* -------------------------------------------------------------------------
   * Handlers
   * ----------------------------------------------------------------------- */

  const handleCopy = () => {
    if (!isValidAddress) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* -------------------------------------------------------------------------
   * Session key time remaining
   * ----------------------------------------------------------------------- */

  function getSessionKeyTimeLeft(expiry: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = expiry - now;
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    return `${hours}h ${minutes}m left`;
  }

  /* -------------------------------------------------------------------------
   * Render
   * ----------------------------------------------------------------------- */

  if (!isValidAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-12 text-center max-w-md">
          <Shield className="w-12 h-12 text-frost-red mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold text-white mb-2">Invalid Address</h2>
          <p className="text-white/40 text-sm">The provided wallet address is not valid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12 max-w-7xl mx-auto">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-center gap-6 mb-12"
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-frost-cyan via-frost-purple to-frost-pink p-[2px]">
          <div className="w-full h-full rounded-full bg-frost-surface flex items-center justify-center">
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
            <span className="font-mono text-frost-cyan text-lg">{shortenAddr(address)}</span>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <Copy className={cn('w-4 h-4', copied ? 'text-frost-green' : 'text-white/40')} />
            </button>
            <a
              href={`https://testnet.snowtrace.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-white/40 hover:text-frost-cyan" />
            </a>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12"
      >
        {loadingBattles ? (
          <div className="col-span-full">
            <LoadingSpinner label="Loading stats..." />
          </div>
        ) : (
          [
            { icon: Swords, label: 'Total Battles', value: stats.totalBattles, color: 'text-frost-cyan' },
            { icon: Trophy, label: 'Wins', value: stats.wins, color: 'text-frost-green' },
            { icon: TrendingUp, label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-frost-purple' },
            { icon: Zap, label: 'AVAX Earned', value: stats.avaxEarned.toFixed(3), color: 'text-frost-gold' },
            { icon: Target, label: 'Warriors', value: stats.warriorCount, color: 'text-frost-pink' },
          ].map((stat, i) => (
            <div key={i} className="stat-card">
              <stat.icon className={cn('w-5 h-5 mx-auto mb-2', stat.color)} />
              <div className={cn('text-xl font-bold font-mono', stat.color)}>{stat.value}</div>
              <div className="text-xs text-white/40 mt-1">{stat.label}</div>
            </div>
          ))
        )}
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
            <Sparkles className="w-5 h-5 text-frost-cyan" />
            <h2 className="text-lg font-display font-bold text-white">My Warriors</h2>
            <span className="ml-auto text-sm text-white/40">
              {loadingWarriors ? '...' : `${warriors.length} NFTs`}
            </span>
          </div>

          {loadingWarriors ? (
            <LoadingSpinner label="Loading warriors..." />
          ) : warriors.length === 0 ? (
            <EmptyState icon={Shield} message="No warriors found" />
          ) : (
            <div className="space-y-3">
              {warriors.map((w) => {
                const el = ELEMENTS[w.element] ?? ELEMENTS[0];
                return (
                  <div key={w.tokenId} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-frost-cyan/30 transition-colors">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden">
                        <WarriorImage tokenId={w.tokenId} element={w.element} size={48} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-semibold text-sm">#{w.tokenId}</span>
                            <span className="text-white/40 text-xs">{el.name}</span>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-frost-gold/20 text-frost-gold border border-frost-gold/30">
                            Lv.{w.level}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div><span className="text-white/40">ATK</span> <span className="text-red-400 font-mono">{w.attack}</span></div>
                      <div><span className="text-white/40">DEF</span> <span className="text-blue-400 font-mono">{w.defense}</span></div>
                      <div><span className="text-white/40">SPD</span> <span className="text-green-400 font-mono">{w.speed}</span></div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/40">Power: <span className="text-frost-cyan font-mono font-bold">{w.powerScore}</span></span>
                      <span className="text-white/40">{w.battleWins}W / {w.battleLosses}L</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* AI Agent Info + Element Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 rounded-2xl lg:col-span-2"
        >
          <div className="flex items-center gap-2 mb-6">
            <Bot className="w-5 h-5 text-frost-purple" />
            <h2 className="text-lg font-display font-bold text-white">AI Agent</h2>
            {loadingAgent ? (
              <Loader2 className="ml-auto w-4 h-4 text-white/40 animate-spin" />
            ) : agentInfo ? (
              <span className={cn(
                'ml-auto px-3 py-1 rounded-full text-xs font-semibold border',
                agentInfo.active
                  ? 'bg-frost-green/20 text-frost-green border-frost-green/30'
                  : 'bg-frost-red/20 text-frost-red border-frost-red/30'
              )}>
                {agentInfo.active ? 'Active' : 'Inactive'}
              </span>
            ) : null}
          </div>

          {loadingAgent ? (
            <LoadingSpinner label="Loading agent info..." />
          ) : !agentInfo ? (
            <div className="mb-6">
              <EmptyState icon={Bot} message="No agent registered for this address" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <div className="text-xs text-white/40 mb-1">Agent Name</div>
                  <div className="text-white font-semibold">{agentInfo.name || 'Unnamed'}</div>
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-1">Strategy</div>
                  <div className="text-frost-purple font-semibold">
                    {STRATEGY_NAMES[agentInfo.strategy] ?? `Type ${agentInfo.strategy}`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-1">Session Key</div>
                  <div className="text-frost-green font-mono text-sm">
                    {getSessionKeyTimeLeft(agentInfo.sessionKeyExpiry)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/40 mb-1">Agent Wallet</div>
                  <div className="text-frost-cyan font-mono text-sm">
                    {shortenAddr(agentInfo.agentWallet)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="stat-card">
                  <div className="text-lg font-bold font-mono text-frost-cyan">{agentInfo.totalGames}</div>
                  <div className="text-xs text-white/40">Agent Battles</div>
                </div>
                <div className="stat-card">
                  <div className="text-lg font-bold font-mono text-frost-green">
                    {agentInfo.totalGames > 0
                      ? `${((agentInfo.wins / agentInfo.totalGames) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                  <div className="text-xs text-white/40">Agent Win Rate</div>
                </div>
                <div className="stat-card">
                  <div className="text-lg font-bold font-mono text-frost-gold">
                    {parseFloat(formatEther(agentInfo.totalDeposited > agentInfo.profitWithdrawn
                      ? agentInfo.totalDeposited - agentInfo.profitWithdrawn
                      : BigInt(0))).toFixed(3)} AVAX
                  </div>
                  <div className="text-xs text-white/40">Agent Balance</div>
                </div>
              </div>
            </>
          )}

          {/* Element Distribution (from warriors) */}
          <div className="border-t border-white/5 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-frost-cyan" />
              <h3 className="text-sm font-display font-bold text-white">Warrior Element Distribution</h3>
            </div>
            {loadingWarriors ? (
              <LoadingSpinner label="Loading distribution..." />
            ) : warriors.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-4">No warriors to display distribution</p>
            ) : (
              <div className="space-y-2">
                {elementDistribution.map((el, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/70">{el.emoji} {el.name}</span>
                      <span className="font-mono text-white/50">{el.count}</span>
                    </div>
                    <div className="progress-bar">
                      <motion.div
                        className="progress-bar-fill bg-gradient-to-r from-frost-cyan to-frost-purple"
                        initial={{ width: 0 }}
                        animate={{ width: `${(el.count / maxCount) * 100}%` }}
                        transition={{ delay: 0.3 + i * 0.05, duration: 0.6 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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

        {loadingBattles ? (
          <LoadingSpinner label="Loading battle history..." />
        ) : battleHistory.length === 0 ? (
          <EmptyState icon={Swords} message="No battles yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="frost-table">
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
                {battleHistory.map((battle, i) => {
                  const isPlayer1 = battle.player1.toLowerCase() === address.toLowerCase();
                  const myNft = isPlayer1 ? battle.nft1 : battle.nft2;
                  const opponentNft = isPlayer1 ? battle.nft2 : battle.nft1;
                  const opponent = isPlayer1 ? battle.player2 : battle.player1;
                  const isWin = battle.winner.toLowerCase() === address.toLowerCase();
                  const isResolved = battle.resolved;

                  // Try to find warrior data for element info
                  const myWarrior = warriors.find((w) => w.tokenId === myNft);
                  const myElement = myWarrior ? myWarrior.element : 0;

                  return (
                    <motion.tr
                      key={battle.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.05 }}
                    >
                      <td className="text-white/50 text-sm">{formatDate(battle.createdAt)}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          {myWarrior ? (
                            <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0">
                              <WarriorImage tokenId={myNft} element={myElement} size={24} />
                            </div>
                          ) : (
                            <span>{getElement(myElement).emoji}</span>
                          )}
                          <span className="text-white text-sm">#{myNft}</span>
                        </span>
                      </td>
                      <td className="text-white/20 text-center">vs</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="text-white/60 text-sm">#{opponentNft}</span>
                          <span className="font-mono text-xs text-white/30">{shortenAddr(opponent)}</span>
                        </span>
                      </td>
                      <td className="text-right font-mono text-white">
                        {parseFloat(formatEther(battle.stake)).toFixed(3)} AVAX
                      </td>
                      <td className="text-center">
                        {isResolved ? (
                          <span className={cn(
                            'px-3 py-1 rounded-full text-xs font-bold uppercase',
                            isWin && 'bg-frost-green/20 text-frost-green border border-frost-green/30',
                            !isWin && 'bg-frost-red/20 text-frost-red border border-frost-red/30',
                          )}>
                            {isWin ? 'win' : 'loss'}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-white/10 text-white/50 border border-white/10">
                            pending
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
