'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Wallet,
  Trophy,
  Sparkles,
  Loader2,
  Copy,
  CheckCircle,
  Send,
  ArrowDownToLine,
  Shield,
  Sword,
  Zap,
  Star,
  Users,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Flame,
  Droplets,
  Wind,
  Snowflake,
  Mountain,
  CloudLightning,
  Moon,
  Sun,
  ChevronRight,
  X,
  Import,
  RefreshCw,
  Target,
  Crosshair,
} from 'lucide-react';
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useWalletClient } from 'wagmi';
import { formatEther, parseEther, type Address } from 'viem';
import { ELEMENTS, CONTRACT_ADDRESSES, AVALANCHE_CHAIN_ID, EXPLORER_URL, ELEMENT_ADVANTAGES } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI, ERC6551_REGISTRY_ABI, FROSTBITE_ACCOUNT_ABI, IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI } from '@/lib/contracts';
import { getWarriorTBAAddress, isAccountDeployed, getAccountBalance } from '@/lib/tba';
import { cn, shortenAddress } from '@/lib/utils';

/* ---------------------------------------------------------------------------
 * Constants & Helpers
 * ------------------------------------------------------------------------- */

const ELEMENT_ICONS: Record<number, React.ElementType> = {
  0: Flame, 1: Droplets, 2: Wind, 3: Snowflake,
  4: Mountain, 5: CloudLightning, 6: Moon, 7: Sun,
};

const TABS = [
  { id: 'warriors', label: 'My Warriors', icon: Sword },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'automode', label: 'Auto-Mode', icon: Bot },
] as const;

type TabId = (typeof TABS)[number]['id'];

function scoreColor(score: number): string {
  if (score < 400) return 'text-red-400';
  if (score < 700) return 'text-amber-400';
  return 'text-green-400';
}

function scoreGlow(score: number): string {
  if (score < 400) return 'shadow-[0_0_20px_rgba(239,68,68,0.3)]';
  if (score < 700) return 'shadow-[0_0_20px_rgba(245,158,11,0.3)]';
  return 'shadow-[0_0_20px_rgba(34,197,94,0.3)]';
}

function scoreBg(score: number): string {
  if (score < 400) return 'from-red-500/20 to-red-600/5';
  if (score < 700) return 'from-amber-500/20 to-amber-600/5';
  return 'from-green-500/20 to-green-600/5';
}

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
  experience: bigint;
  battleWins: bigint;
  battleLosses: bigint;
  powerScore: bigint;
}

interface TBAInfo {
  address: Address;
  deployed: boolean;
  balance: string;
}

interface AgentInfo {
  agentId: bigint;
  tokenId: bigint;
  tbaAddress: Address;
  metadataURI: string;
  registeredAt: bigint;
  autoMode: boolean;
}

interface Reputation {
  totalBattles: bigint;
  wins: bigint;
  losses: bigint;
  totalQuests: bigint;
  questsCompleted: bigint;
  questsFailed: bigint;
  totalXpEarned: bigint;
  totalAvaxEarned: bigint;
  totalAvaxLost: bigint;
  elementWins: readonly bigint[];
  lastActive: bigint;
  overallScore: bigint;
}

/* ---------------------------------------------------------------------------
 * Toast Component
 * ------------------------------------------------------------------------- */

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: 'border-green-500/30 bg-green-500/10 text-green-400',
    error: 'border-red-500/30 bg-red-500/10 text-red-400',
    info: 'border-frost-cyan/30 bg-frost-cyan/10 text-frost-cyan',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn('fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border text-sm font-pixel', colors[type])}
    >
      {message}
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Page Component
 * ------------------------------------------------------------------------- */

export default function AgentsPage() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, data: txHash, isPending: isTxPending } = useWriteContract();
  const { isLoading: isTxConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  // UI State
  const [activeTab, setActiveTab] = useState<TabId>('warriors');
  const [selectedWarriorId, setSelectedWarriorId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Data State
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [tbaInfoMap, setTbaInfoMap] = useState<Record<number, TBAInfo>>({});
  const [agentInfoMap, setAgentInfoMap] = useState<Record<number, AgentInfo | null>>({});
  const [reputationMap, setReputationMap] = useState<Record<number, Reputation | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isActionPending, setIsActionPending] = useState(false);

  // Leaderboard & Auto-Mode
  const [leaderboard, setLeaderboard] = useState<{ tokenId: number; score: number }[]>([]);
  const [autoModeAgents, setAutoModeAgents] = useState<number[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);
  const [autoModeCount, setAutoModeCount] = useState(0);

  // Send AVAX form
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [copied, setCopied] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  }, []);

  // Ensure chain
  const ensureChain = useCallback(async () => {
    if (chainId !== AVALANCHE_CHAIN_ID) {
      await switchChainAsync({ chainId: AVALANCHE_CHAIN_ID });
    }
  }, [chainId, switchChainAsync]);

  /* ---- Fetch Warriors ---- */
  const fetchWarriors = useCallback(async () => {
    if (!publicClient || !address) return;
    setIsLoading(true);
    try {
      const tokenIds = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as Address,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'getWarriorsByOwner',
        args: [address],
      }) as bigint[];

      // Phase 1: Fetch all warrior stats in PARALLEL
      const warriorResults = await Promise.allSettled(
        tokenIds.map(id =>
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.frostbiteWarrior as Address,
            abi: FROSTBITE_WARRIOR_ABI,
            functionName: 'getWarrior',
            args: [id],
          })
        )
      );

      const warriorList: Warrior[] = [];
      for (let i = 0; i < tokenIds.length; i++) {
        const r = warriorResults[i];
        if (r.status !== 'fulfilled') continue;
        const data = r.value as any;
        warriorList.push({
          tokenId: Number(tokenIds[i]),
          attack: Number(data.attack),
          defense: Number(data.defense),
          speed: Number(data.speed),
          element: Number(data.element),
          specialPower: Number(data.specialPower),
          level: Number(data.level),
          experience: data.experience,
          battleWins: data.battleWins,
          battleLosses: data.battleLosses,
          powerScore: data.powerScore,
        });
      }
      // Show warriors immediately while TBA/agent data loads
      setWarriors(warriorList);
      setIsLoading(false);

      // Phase 2: Fetch TBA + Agent + Reputation in PARALLEL per warrior
      const tbaMap: Record<number, TBAInfo> = {};
      const agentMap: Record<number, AgentInfo | null> = {};
      const repMap: Record<number, Reputation | null> = {};

      await Promise.allSettled(
        warriorList.map(async (w) => {
          // TBA info
          try {
            const tbaAddr = await getWarriorTBAAddress(publicClient, w.tokenId);
            const [deployedRes, balRes] = await Promise.allSettled([
              isAccountDeployed(publicClient, tbaAddr),
              getAccountBalance(publicClient, tbaAddr),
            ]);
            const deployed = deployedRes.status === 'fulfilled' ? deployedRes.value : false;
            const balance = deployed && balRes.status === 'fulfilled' ? balRes.value.formatted : '0';
            tbaMap[w.tokenId] = { address: tbaAddr, deployed, balance };
          } catch {
            tbaMap[w.tokenId] = { address: '0x0000000000000000000000000000000000000000' as Address, deployed: false, balance: '0' };
          }

          // Agent + Reputation in parallel
          try {
            const registered = await publicClient.readContract({
              address: CONTRACT_ADDRESSES.identityRegistry as Address,
              abi: IDENTITY_REGISTRY_ABI,
              functionName: 'isRegistered',
              args: [BigInt(w.tokenId)],
            }) as boolean;

            if (registered) {
              const [agentRes, repRes] = await Promise.allSettled([
                publicClient.readContract({
                  address: CONTRACT_ADDRESSES.identityRegistry as Address,
                  abi: IDENTITY_REGISTRY_ABI,
                  functionName: 'getAgent',
                  args: [BigInt(w.tokenId)],
                }),
                publicClient.readContract({
                  address: CONTRACT_ADDRESSES.reputationRegistry as Address,
                  abi: REPUTATION_REGISTRY_ABI,
                  functionName: 'getReputation',
                  args: [BigInt(w.tokenId)],
                }),
              ]);

              if (agentRes.status === 'fulfilled') {
                const agent = agentRes.value as any;
                agentMap[w.tokenId] = {
                  agentId: agent.agentId,
                  tokenId: agent.tokenId,
                  tbaAddress: agent.tbaAddress,
                  metadataURI: agent.metadataURI,
                  registeredAt: agent.registeredAt,
                  autoMode: agent.autoMode,
                };
              }

              if (repRes.status === 'fulfilled') {
                const rep = repRes.value as any;
                repMap[w.tokenId] = {
                  totalBattles: rep.totalBattles,
                  wins: rep.wins,
                  losses: rep.losses,
                  totalQuests: rep.totalQuests,
                  questsCompleted: rep.questsCompleted,
                  questsFailed: rep.questsFailed,
                  totalXpEarned: rep.totalXpEarned,
                  totalAvaxEarned: rep.totalAvaxEarned,
                  totalAvaxLost: rep.totalAvaxLost,
                  elementWins: rep.elementWins,
                  lastActive: rep.lastActive,
                  overallScore: rep.overallScore,
              };
            }
          } else {
            agentMap[w.tokenId] = null;
          }
        } catch {
          agentMap[w.tokenId] = null;
        }
      })
      );

      setTbaInfoMap(tbaMap);
      setAgentInfoMap(agentMap);
      setReputationMap(repMap);
    } catch (err) {
      console.error('[agents] Fetch warriors error:', err);
      showToast('Failed to load warriors', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, address, showToast]);

  /* ---- Fetch Global Stats ---- */
  const fetchGlobalStats = useCallback(async () => {
    if (!publicClient) return;
    try {
      const [total, autoCount] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.identityRegistry as Address,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'totalAgents',
        }) as Promise<bigint>,
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.identityRegistry as Address,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getAutoModeAgentCount',
        }) as Promise<bigint>,
      ]);
      setTotalAgents(Number(total));
      setAutoModeCount(Number(autoCount));
    } catch {
      // silently fail for stats
    }
  }, [publicClient]);

  /* ---- Fetch Leaderboard ---- */
  const fetchLeaderboard = useCallback(async () => {
    if (!publicClient) return;
    try {
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.reputationRegistry as Address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getTopAgents',
        args: [BigInt(50)],
      }) as [bigint[], bigint[]];

      const [tokenIds, scores] = result;
      const lb = tokenIds.map((id, i) => ({
        tokenId: Number(id),
        score: Number(scores[i]),
      })).filter(x => x.tokenId > 0);
      setLeaderboard(lb);
    } catch {
      setLeaderboard([]);
    }
  }, [publicClient]);

  /* ---- Fetch Auto-Mode Agents ---- */
  const fetchAutoModeAgents = useCallback(async () => {
    if (!publicClient) return;
    try {
      const ids = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.identityRegistry as Address,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getAutoModeAgents',
      }) as bigint[];
      setAutoModeAgents(ids.map(Number).filter(x => x > 0));
    } catch {
      setAutoModeAgents([]);
    }
  }, [publicClient]);

  /* ---- Effects ---- */
  useEffect(() => {
    if (isConnected && address) {
      fetchWarriors();
      fetchGlobalStats();
    }
  }, [isConnected, address, fetchWarriors, fetchGlobalStats]);

  useEffect(() => {
    if (activeTab === 'leaderboard') fetchLeaderboard();
    if (activeTab === 'automode') fetchAutoModeAgents();
  }, [activeTab, fetchLeaderboard, fetchAutoModeAgents]);

  /* ---- Actions ---- */

  const handleCreateWallet = useCallback(async (tokenId: number) => {
    setIsActionPending(true);
    try {
      await ensureChain();
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.erc6551Registry as Address,
        abi: ERC6551_REGISTRY_ABI,
        functionName: 'createAccount',
        args: [
          CONTRACT_ADDRESSES.frostbiteAccount as Address,
          '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
          BigInt(AVALANCHE_CHAIN_ID),
          CONTRACT_ADDRESSES.frostbiteWarrior as Address,
          BigInt(tokenId),
        ],
      });
      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      showToast(`Wallet created for Warrior #${tokenId}`, 'success');
      await fetchWarriors();
    } catch (err: any) {
      console.error('[agents] Create wallet error:', err);
      showToast(err?.shortMessage || 'Failed to create wallet', 'error');
    } finally {
      setIsActionPending(false);
    }
  }, [ensureChain, writeContractAsync, publicClient, showToast, fetchWarriors]);

  const handleSendAvax = useCallback(async (tokenId: number) => {
    if (!sendTo || !sendAmount) return;
    const tba = tbaInfoMap[tokenId];
    if (!tba?.deployed) return;

    setIsActionPending(true);
    try {
      await ensureChain();
      const hash = await writeContractAsync({
        address: tba.address,
        abi: FROSTBITE_ACCOUNT_ABI,
        functionName: 'execute',
        args: [sendTo as Address, parseEther(sendAmount), '0x' as `0x${string}`, 0],
      });
      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      showToast(`Sent ${sendAmount} AVAX from Warrior #${tokenId}`, 'success');
      setSendTo('');
      setSendAmount('');
      await fetchWarriors();
    } catch (err: any) {
      console.error('[agents] Send AVAX error:', err);
      showToast(err?.shortMessage || 'Failed to send AVAX', 'error');
    } finally {
      setIsActionPending(false);
    }
  }, [sendTo, sendAmount, tbaInfoMap, ensureChain, writeContractAsync, publicClient, showToast, fetchWarriors]);

  const handleDepositAvax = useCallback(async (tokenId: number) => {
    if (!depositAmount || !address) return;
    const tba = tbaInfoMap[tokenId];
    if (!tba?.deployed) return;

    setIsActionPending(true);
    try {
      await ensureChain();
      const tx = await (window as any).ethereum?.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: tba.address,
          value: '0x' + parseEther(depositAmount).toString(16),
        }],
      });
      if (publicClient && tx) {
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }
      showToast(`Deposited ${depositAmount} AVAX to Warrior #${tokenId}`, 'success');
      setDepositAmount('');
      await fetchWarriors();
    } catch (err: any) {
      console.error('[agents] Deposit error:', err);
      showToast(err?.shortMessage || err?.message || 'Failed to deposit', 'error');
    } finally {
      setIsActionPending(false);
    }
  }, [depositAmount, tbaInfoMap, ensureChain, publicClient, showToast, fetchWarriors, address]);

  const handleRegisterAgent = useCallback(async (tokenId: number) => {
    setIsActionPending(true);
    try {
      await ensureChain();
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.identityRegistry as Address,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'registerAgent',
        args: [BigInt(tokenId), `https://frostbite.pro/avalanche/api/metadata/${tokenId}`],
      });
      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      showToast(`Warrior #${tokenId} registered as Agent`, 'success');
      await fetchWarriors();
      await fetchGlobalStats();
    } catch (err: any) {
      console.error('[agents] Register agent error:', err);
      showToast(err?.shortMessage || 'Failed to register agent', 'error');
    } finally {
      setIsActionPending(false);
    }
  }, [ensureChain, writeContractAsync, publicClient, showToast, fetchWarriors, fetchGlobalStats]);

  const handleToggleAutoMode = useCallback(async (tokenId: number, currentAutoMode: boolean) => {
    setIsActionPending(true);
    try {
      await ensureChain();
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.identityRegistry as Address,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'setAutoMode',
        args: [BigInt(tokenId), !currentAutoMode],
      });
      if (publicClient && hash) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      showToast(`Auto-Mode ${!currentAutoMode ? 'enabled' : 'disabled'} for Warrior #${tokenId}`, 'success');
      await fetchWarriors();
    } catch (err: any) {
      console.error('[agents] Toggle auto-mode error:', err);
      showToast(err?.shortMessage || 'Failed to toggle auto-mode', 'error');
    } finally {
      setIsActionPending(false);
    }
  }, [ensureChain, writeContractAsync, publicClient, showToast, fetchWarriors]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Selected warrior data
  const selectedWarrior = useMemo(() => warriors.find(w => w.tokenId === selectedWarriorId), [warriors, selectedWarriorId]);
  const selectedTBA = selectedWarriorId ? tbaInfoMap[selectedWarriorId] : null;
  const selectedAgent = selectedWarriorId ? agentInfoMap[selectedWarriorId] : null;
  const selectedReputation = selectedWarriorId ? reputationMap[selectedWarriorId] : null;

  /* ---- Not Connected ---- */
  if (!isConnected) {
    return (
      <div className="min-h-screen px-4 py-6 sm:py-12">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Bot className="w-8 h-8 text-frost-cyan" />
            <h1 className="text-3xl md:text-4xl font-display font-bold gradient-text">AGENTS</h1>
          </div>
          <p className="text-white/40 text-sm mb-8">Connect your wallet to manage warrior agents</p>
          <div className="glass-card inline-block p-8 text-center">
            <span className="text-4xl block mb-3">
              <Bot className="w-12 h-12 mx-auto text-white/20" />
            </span>
            <p className="text-white/30 text-xs font-pixel">Warrior Wallets &bull; Agent Identity &bull; Reputation</p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Loading ---- */
  if (isLoading && warriors.length === 0) {
    return (
      <div className="min-h-screen px-4 py-6 sm:py-12 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-frost-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/30 text-xs font-pixel">Loading agent data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="max-w-7xl mx-auto">

        {/* Toast */}
        <AnimatePresence>
          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </AnimatePresence>

        {/* ---- Header ---- */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bot className="w-7 h-7 text-frost-cyan" />
              <Sparkles className="w-3 h-3 text-frost-cyan/60 absolute -top-1 -right-1 animate-pulse" />
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold gradient-text">AGENTS</h1>
            <div className="flex items-center gap-2 ml-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-pixel bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/20">
                {totalAgents} Agents
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-pixel bg-green-500/10 text-green-400 border border-green-500/20">
                {autoModeCount} Auto
              </span>
            </div>
          </div>
          <p className="text-white/30 text-xs font-pixel">Warrior Wallets &bull; Agent Identity &bull; Reputation</p>
        </div>

        {/* ---- Tabs ---- */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedWarriorId(null); }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-pixel transition-all',
                  isActive
                    ? 'bg-frost-cyan/15 text-frost-cyan border border-frost-cyan/20'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04] border border-transparent'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ---- Tab Content ---- */}
        <AnimatePresence mode="wait">
          {activeTab === 'warriors' && (
            <motion.div
              key="warriors"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {warriors.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-white/[0.04] bg-white/[0.01]">
                  <Sword className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-xs font-pixel mb-1">No warriors found</p>
                  <p className="text-white/20 text-[10px] font-pixel">Mint warriors to create agents</p>
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Warrior Grid */}
                  <div className={cn(
                    'grid gap-4 flex-1',
                    selectedWarriorId
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
                  )}>
                    {warriors.map((w, i) => (
                      <WarriorCard
                        key={w.tokenId}
                        warrior={w}
                        tba={tbaInfoMap[w.tokenId]}
                        agent={agentInfoMap[w.tokenId]}
                        reputation={reputationMap[w.tokenId]}
                        isSelected={selectedWarriorId === w.tokenId}
                        onClick={() => setSelectedWarriorId(selectedWarriorId === w.tokenId ? null : w.tokenId)}
                        index={i}
                      />
                    ))}
                  </div>

                  {/* Detail Panel */}
                  <AnimatePresence>
                    {selectedWarrior && selectedTBA && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.25 }}
                        className="lg:w-[420px] flex-shrink-0"
                      >
                        <WarriorDetailPanel
                          warrior={selectedWarrior}
                          tba={selectedTBA}
                          agent={selectedAgent ?? null}
                          reputation={selectedReputation ?? null}
                          isActionPending={isActionPending || isTxPending || isTxConfirming}
                          onCreateWallet={handleCreateWallet}
                          onSendAvax={handleSendAvax}
                          onDepositAvax={handleDepositAvax}
                          onRegisterAgent={handleRegisterAgent}
                          onToggleAutoMode={handleToggleAutoMode}
                          sendTo={sendTo}
                          setSendTo={setSendTo}
                          sendAmount={sendAmount}
                          setSendAmount={setSendAmount}
                          depositAmount={depositAmount}
                          setDepositAmount={setDepositAmount}
                          onCopy={copyToClipboard}
                          copied={copied}
                          onClose={() => setSelectedWarriorId(null)}
                          userAddress={address as Address}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <LeaderboardTab
                leaderboard={leaderboard}
                onSelectWarrior={(id) => { setActiveTab('warriors'); setSelectedWarriorId(id); }}
              />
            </motion.div>
          )}

          {activeTab === 'automode' && (
            <motion.div
              key="automode"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <AutoModeTab
                agents={autoModeAgents}
                onSelectWarrior={(id) => { setActiveTab('warriors'); setSelectedWarriorId(id); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ===========================================================================
 * Warrior Card
 * =========================================================================== */

function WarriorCard({
  warrior: w,
  tba,
  agent,
  reputation,
  isSelected,
  onClick,
  index,
}: {
  warrior: Warrior;
  tba?: TBAInfo;
  agent?: AgentInfo | null;
  reputation?: Reputation | null;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}) {
  const el = ELEMENTS[w.element] || ELEMENTS[0];
  const ElIcon = ELEMENT_ICONS[w.element] || Flame;
  const score = reputation ? Number(reputation.overallScore) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onClick={onClick}
      className={cn(
        'glass-card p-3 cursor-pointer group relative overflow-hidden',
        isSelected && 'ring-1 ring-frost-cyan/40 !border-frost-cyan/30'
      )}
    >
      {/* Warrior Image */}
      <div className="relative aspect-square rounded-xl overflow-hidden mb-3 bg-white/[0.03]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/avalanche/api/metadata/${w.tokenId}/image?element=${w.element}`}
          alt={`Warrior #${w.tokenId}`}
          width={256}
          height={256}
          className="w-full h-full object-cover"
          loading={index < 8 ? 'eager' : 'lazy'}
        />
        {/* Level badge */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] font-pixel text-white/80 flex items-center gap-1">
          <Star className="w-2.5 h-2.5 text-amber-400" />
          Lv.{w.level}
        </div>
        {/* Element badge */}
        <div className={cn('absolute top-2 right-2 p-1 rounded-md bg-black/60')}>
          <ElIcon className="w-3.5 h-3.5" style={{ color: el.glowColor.replace('0.3', '1') }} />
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-pixel text-white/80">#{w.tokenId}</span>
          <span className="text-[10px] font-pixel text-white/40">
            <Zap className="w-3 h-3 inline mr-0.5 text-amber-400" />
            {Number(w.powerScore)}
          </span>
        </div>

        {/* Status indicators */}
        <div className="flex flex-wrap gap-1">
          {/* TBA Status */}
          {tba?.deployed ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-pixel bg-green-500/10 text-green-400 border border-green-500/20">
              <Wallet className="w-2.5 h-2.5 inline mr-0.5" />Wallet
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-pixel bg-white/5 text-white/30 border border-white/10">
              No Wallet
            </span>
          )}

          {/* Agent Status */}
          {agent ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-pixel bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/20">
              <Bot className="w-2.5 h-2.5 inline mr-0.5" />Agent
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-pixel bg-white/5 text-white/30 border border-white/10">
              Not Registered
            </span>
          )}

          {/* Auto-Mode */}
          {agent?.autoMode && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-pixel bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Auto
            </span>
          )}
        </div>

        {/* TBA Balance */}
        {tba?.deployed && parseFloat(tba.balance) > 0 && (
          <div className="text-[10px] font-pixel text-white/40">
            <Wallet className="w-2.5 h-2.5 inline mr-0.5" />
            {parseFloat(tba.balance).toFixed(4)} AVAX
          </div>
        )}

        {/* Reputation Score */}
        {reputation && Number(reputation.overallScore) > 0 && (
          <div className={cn('text-[10px] font-pixel', scoreColor(score))}>
            <Trophy className="w-2.5 h-2.5 inline mr-0.5" />
            Score: {score}
          </div>
        )}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute inset-0 rounded-2xl ring-2 ring-frost-cyan/30 pointer-events-none" />
      )}
    </motion.div>
  );
}

/* ===========================================================================
 * Warrior Detail Panel
 * =========================================================================== */

/* ---------------------------------------------------------------------------
 * Battle Recommendation Types & Helpers
 * ------------------------------------------------------------------------- */

interface BattleRec {
  battleId: number;
  opponentWallet: string;
  opponentTokenId: number;
  opponentElement: number;
  opponentPowerScore: number;
  stake: bigint;
  score: number; // match score 0-100
  advantageText: string | null;
  createdAt: number;
}

function hasElementAdvantage(attackerElement: number, defenderElement: number): boolean {
  return ELEMENT_ADVANTAGES[attackerElement] === defenderElement;
}

function calcMatchScore(
  myElement: number,
  myPower: number,
  oppElement: number,
  oppPower: number,
  stake: bigint,
): { score: number; advantageText: string | null } {
  let score = 0;
  let advantageText: string | null = null;

  // Element advantage check (+30)
  if (hasElementAdvantage(myElement, oppElement)) {
    score += 30;
    const myEl = ELEMENTS[myElement] || ELEMENTS[0];
    const oppEl = ELEMENTS[oppElement] || ELEMENTS[0];
    advantageText = `${myEl.emoji} beats ${oppEl.emoji}`;
  } else if (hasElementAdvantage(oppElement, myElement)) {
    // They have advantage over us — penalty
    score -= 15;
  }

  // Power comparison (+20 if stronger, +10 if equal-ish)
  if (myPower > oppPower) {
    score += 20;
  } else if (myPower >= oppPower * 0.9) {
    score += 10;
  }

  // Stake size — prefer smaller stakes for safety (+10 for < 0.01 AVAX)
  const stakeAvax = Number(formatEther(stake));
  if (stakeAvax < 0.01) {
    score += 10;
  } else if (stakeAvax < 0.05) {
    score += 5;
  }

  // Base score — all battles start at 40 so even neutral matches show as medium
  score += 40;

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));

  return { score, advantageText };
}

function recScoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-red-400';
}

function recScoreBorder(score: number): string {
  if (score >= 70) return 'border-green-500/20';
  if (score >= 45) return 'border-amber-500/20';
  return 'border-red-500/20';
}

function recScoreGlow(score: number): string {
  if (score >= 70) return 'shadow-[0_0_12px_rgba(34,197,94,0.15)]';
  if (score >= 45) return 'shadow-[0_0_12px_rgba(245,158,11,0.15)]';
  return 'shadow-[0_0_12px_rgba(239,68,68,0.15)]';
}

/* ---------------------------------------------------------------------------
 * BattleRecommendations Component
 * ------------------------------------------------------------------------- */

function BattleRecommendations({
  warrior,
  userAddress,
}: {
  warrior: Warrior;
  userAddress: Address;
}) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { chainId } = useAccount();

  const [recommendations, setRecommendations] = useState<BattleRec[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [joiningBattleId, setJoiningBattleId] = useState<number | null>(null);
  const [recToast, setRecToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchRecommendations = useCallback(async () => {
    if (!publicClient) return;
    setIsScanning(true);
    try {
      const battleEngineAddr = CONTRACT_ADDRESSES.battleEngine as `0x${string}`;
      const warriorAddr = CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`;

      // Fetch open battle IDs
      const openBattleIds = await publicClient.readContract({
        address: battleEngineAddr,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'getOpenBattles',
        args: [0n, 50n],
      }) as bigint[];

      if (!openBattleIds || openBattleIds.length === 0) {
        setRecommendations([]);
        setIsScanning(false);
        return;
      }

      const recs: BattleRec[] = [];

      for (const bid of openBattleIds) {
        try {
          const battleRaw = await publicClient.readContract({
            address: battleEngineAddr,
            abi: BATTLE_ENGINE_ABI,
            functionName: 'getBattle',
            args: [bid],
          }) as any;

          const player1 = String(battleRaw.player1 ?? battleRaw[1] ?? '').toLowerCase();
          const nft1 = Number(battleRaw.nft1 ?? battleRaw[3] ?? 0);
          const stake = BigInt(String(battleRaw.stake ?? battleRaw[5] ?? 0));
          const createdAt = Number(battleRaw.createdAt ?? battleRaw[8] ?? 0);

          // Skip own battles
          if (player1 === userAddress.toLowerCase()) continue;

          // Fetch opponent warrior stats
          const oppRaw = await publicClient.readContract({
            address: warriorAddr,
            abi: FROSTBITE_WARRIOR_ABI,
            functionName: 'getWarrior',
            args: [BigInt(nft1)],
          }) as any;

          const oppElement = Number(oppRaw.element ?? oppRaw[3] ?? 0);
          const oppPower = Number(oppRaw.powerScore ?? oppRaw[9] ?? 0);

          const { score, advantageText } = calcMatchScore(
            warrior.element,
            Number(warrior.powerScore),
            oppElement,
            oppPower,
            stake,
          );

          recs.push({
            battleId: Number(bid),
            opponentWallet: player1,
            opponentTokenId: nft1,
            opponentElement: oppElement,
            opponentPowerScore: oppPower,
            stake,
            score,
            advantageText,
            createdAt,
          });
        } catch {
          // Skip unreadable battles
        }
      }

      // Sort by score descending, take top 5
      recs.sort((a, b) => b.score - a.score);
      setRecommendations(recs.slice(0, 5));
    } catch {
      setRecommendations([]);
    } finally {
      setIsScanning(false);
    }
  }, [publicClient, warrior, userAddress]);

  // Auto-fetch on mount
  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Clear toast
  useEffect(() => {
    if (!recToast) return;
    const t = setTimeout(() => setRecToast(null), 4000);
    return () => clearTimeout(t);
  }, [recToast]);

  const handleJoinBattle = useCallback(async (rec: BattleRec) => {
    if (!publicClient || !walletClient || !userAddress) return;
    setJoiningBattleId(rec.battleId);
    try {
      // Ensure correct chain
      if (chainId !== AVALANCHE_CHAIN_ID) {
        await switchChainAsync({ chainId: AVALANCHE_CHAIN_ID });
      }

      const battleEngineAddr = CONTRACT_ADDRESSES.battleEngine as `0x${string}`;
      const warriorAddr = CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`;

      // Ensure NFT approval
      const approved = await publicClient.readContract({
        address: warriorAddr,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'isApprovedForAll',
        args: [userAddress, battleEngineAddr],
      });
      if (!approved) {
        const approvalHash = await walletClient.writeContract({
          address: warriorAddr,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'setApprovalForAll',
          args: [battleEngineAddr, true],
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      // Join battle with empty signature
      const joinHash = await walletClient.writeContract({
        address: battleEngineAddr,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'joinBattle',
        args: [BigInt(rec.battleId), BigInt(warrior.tokenId), '0x' as `0x${string}`],
        value: rec.stake,
      });
      await publicClient.waitForTransactionReceipt({ hash: joinHash });

      setRecToast({ message: `Battle #${rec.battleId} joined! Awaiting resolution...`, type: 'success' });
      // Refresh after join
      fetchRecommendations();
    } catch (err: unknown) {
      const short = (err as { shortMessage?: string }).shortMessage;
      setRecToast({ message: short || 'Failed to join battle', type: 'error' });
    } finally {
      setJoiningBattleId(null);
    }
  }, [publicClient, walletClient, userAddress, warrior, chainId, switchChainAsync, fetchRecommendations]);

  const timeAgo = (ts: number): string => {
    const seconds = Math.floor(Date.now() / 1000) - ts;
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3 relative">
      {/* Toast overlay */}
      <AnimatePresence>
        {recToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              'absolute -top-2 left-2 right-2 z-10 px-3 py-2 rounded-xl border text-[10px] font-pixel',
              recToast.type === 'success'
                ? 'border-green-500/30 bg-green-500/10 text-green-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            )}
          >
            {recToast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-frost-cyan" />
          <span className="text-xs font-display text-white/70 uppercase">Battle Recommendations</span>
        </div>
        <button
          onClick={fetchRecommendations}
          disabled={isScanning}
          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-frost-cyan transition-colors disabled:opacity-40"
          title="Refresh recommendations"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isScanning && 'animate-spin')} />
        </button>
      </div>

      {/* Loading State */}
      {isScanning && (
        <div className="flex items-center justify-center py-6 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-frost-cyan" />
          <span className="text-[10px] font-pixel text-white/40">Scanning open battles...</span>
        </div>
      )}

      {/* No Recommendations */}
      {!isScanning && recommendations.length === 0 && (
        <div className="text-center py-6">
          <Target className="w-8 h-8 mx-auto text-white/10 mb-2" />
          <p className="text-white/30 text-[10px] font-pixel">No recommended battles right now.</p>
          <p className="text-white/20 text-[9px] font-pixel mt-1">Check back soon.</p>
        </div>
      )}

      {/* Recommendation Cards */}
      {!isScanning && recommendations.length > 0 && (
        <div className="space-y-2">
          {recommendations.map((rec, idx) => {
            const oppEl = ELEMENTS[rec.opponentElement] || ELEMENTS[0];
            const OppIcon = ELEMENT_ICONS[rec.opponentElement] || Flame;
            const stakeAvax = Number(formatEther(rec.stake)).toFixed(4);
            const isJoining = joiningBattleId === rec.battleId;

            return (
              <motion.div
                key={rec.battleId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  'rounded-xl border bg-white/[0.02] p-3 space-y-2',
                  recScoreBorder(rec.score),
                  recScoreGlow(rec.score),
                )}
              >
                {/* Top row: opponent info + score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-white/[0.08] bg-white/[0.04] flex-shrink-0">
                      <img
                        src={`/avalanche/api/metadata/${rec.opponentTokenId}/image?element=${rec.opponentElement}`}
                        alt={`Warrior #${rec.opponentTokenId}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-pixel text-white/70">#{rec.opponentTokenId}</span>
                        <OppIcon className="w-3 h-3" style={{ color: oppEl.glowColor.replace('0.3', '0.8') }} />
                        <span className="text-[9px] font-pixel text-white/30">{oppEl.name}</span>
                      </div>
                      <span className="text-[9px] font-pixel text-white/30">PWR {rec.opponentPowerScore}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn('text-sm font-display font-bold', recScoreColor(rec.score))}>
                      {rec.score}
                    </span>
                    <span className="block text-[8px] font-pixel text-white/30">match</span>
                  </div>
                </div>

                {/* Middle row: stake + advantage */}
                <div className="flex items-center justify-between text-[9px] font-pixel">
                  <div className="flex items-center gap-2">
                    <span className="text-white/40">Stake:</span>
                    <span className="text-white/60">{stakeAvax} AVAX</span>
                  </div>
                  {rec.advantageText && (
                    <span className="text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                      {rec.advantageText}
                    </span>
                  )}
                  {!rec.advantageText && hasElementAdvantage(rec.opponentElement, warrior.element) && (
                    <span className="text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                      Disadvantage
                    </span>
                  )}
                </div>

                {/* Bottom row: time + join button */}
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-pixel text-white/20">{timeAgo(rec.createdAt)}</span>
                  <button
                    onClick={() => handleJoinBattle(rec)}
                    disabled={isJoining || joiningBattleId !== null}
                    className="btn-3d btn-3d-cyan !px-3 !py-1.5 !text-[9px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isJoining ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Sword className="w-3 h-3" />
                        Join Battle
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * WarriorDetailPanel
 * ------------------------------------------------------------------------- */

function WarriorDetailPanel({
  warrior: w,
  tba,
  agent,
  reputation,
  isActionPending,
  onCreateWallet,
  onSendAvax,
  onDepositAvax,
  onRegisterAgent,
  onToggleAutoMode,
  sendTo,
  setSendTo,
  sendAmount,
  setSendAmount,
  depositAmount,
  setDepositAmount,
  onCopy,
  copied,
  onClose,
  userAddress,
}: {
  warrior: Warrior;
  tba: TBAInfo;
  agent: AgentInfo | null;
  reputation: Reputation | null;
  isActionPending: boolean;
  onCreateWallet: (tokenId: number) => void;
  onSendAvax: (tokenId: number) => void;
  onDepositAvax: (tokenId: number) => void;
  onRegisterAgent: (tokenId: number) => void;
  onToggleAutoMode: (tokenId: number, current: boolean) => void;
  sendTo: string;
  setSendTo: (v: string) => void;
  sendAmount: string;
  setSendAmount: (v: string) => void;
  depositAmount: string;
  setDepositAmount: (v: string) => void;
  onCopy: (text: string) => void;
  copied: boolean;
  onClose: () => void;
  userAddress: Address;
}) {
  const el = ELEMENTS[w.element] || ELEMENTS[0];
  const score = reputation ? Number(reputation.overallScore) : 0;

  return (
    <div className="space-y-4 sticky top-6">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display text-white/80">Warrior #{w.tokenId}</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Section A: Warrior Wallet */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-4 h-4 text-frost-cyan" />
          <span className="text-xs font-display text-white/70 uppercase">Warrior Wallet</span>
        </div>

        {tba.deployed ? (
          <>
            {/* TBA Address */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-white/50 flex-1 truncate">{tba.address}</span>
              <button
                onClick={() => onCopy(tba.address)}
                className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <a
                href={`${EXPLORER_URL}/address/${tba.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Balance */}
            <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <span className="text-[10px] font-pixel text-white/40">Balance</span>
              <span className="text-sm font-pixel text-white/80">{parseFloat(tba.balance).toFixed(4)} AVAX</span>
            </div>

            {/* Deposit AVAX — Coming Soon */}
            <div className="px-3 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] opacity-60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-pixel text-white/30 flex items-center gap-1.5">
                  <ArrowDownToLine className="w-3 h-3" /> Deposit AVAX
                </span>
                <span className="text-[8px] font-pixel text-frost-cyan/50 bg-frost-cyan/10 px-1.5 py-0.5 rounded-full">
                  Coming Soon
                </span>
              </div>
            </div>

            {/* Send Form */}
            <div className="space-y-2">
              <span className="text-[10px] font-pixel text-white/40 flex items-center gap-1">
                <Send className="w-3 h-3" /> Send AVAX
              </span>
              <input
                type="text"
                placeholder="0x... recipient address"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/80 placeholder-white/20 focus:outline-none focus:border-frost-cyan/30"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Amount"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/80 placeholder-white/20 focus:outline-none focus:border-frost-cyan/30"
                />
                <button
                  onClick={() => onSendAvax(w.tokenId)}
                  disabled={isActionPending || !sendTo || !sendAmount}
                  className="btn-3d btn-3d-cyan !px-4 !py-2 !text-[10px] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isActionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <Wallet className="w-8 h-8 mx-auto text-white/10 mb-2" />
            <p className="text-white/30 text-[10px] font-pixel mb-3">No wallet deployed yet</p>
            <button
              onClick={() => onCreateWallet(w.tokenId)}
              disabled={isActionPending}
              className="btn-3d btn-3d-cyan !text-[10px] disabled:opacity-40"
            >
              {isActionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create Wallet'}
            </button>
          </div>
        )}
      </div>

      {/* Section B: Agent Identity */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-frost-cyan" />
          <span className="text-xs font-display text-white/70 uppercase">Agent Identity</span>
        </div>

        {agent ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <span className="text-[9px] font-pixel text-white/30 block">Agent ID</span>
                <span className="text-xs font-pixel text-white/70">#{Number(agent.agentId)}</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <span className="text-[9px] font-pixel text-white/30 block">Registered</span>
                <span className="text-xs font-pixel text-white/70">
                  {new Date(Number(agent.registeredAt) * 1000).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Metadata URI */}
            {agent.metadataURI && (
              <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <span className="text-[9px] font-pixel text-white/30 block mb-0.5">Metadata URI</span>
                <span className="text-[10px] font-mono text-white/40 break-all">{agent.metadataURI || 'None set'}</span>
              </div>
            )}

            {/* Auto-Mode Toggle */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
              <div>
                <span className="text-xs font-pixel text-white/60 block">Auto-Mode</span>
                <span className="text-[9px] font-pixel text-white/30">
                  {agent.autoMode ? 'Agent battles automatically' : 'Manual control only'}
                </span>
              </div>
              <button
                onClick={() => onToggleAutoMode(w.tokenId, agent.autoMode)}
                disabled={isActionPending}
                className="p-1 transition-colors disabled:opacity-40"
              >
                {agent.autoMode ? (
                  <ToggleRight className="w-8 h-8 text-green-400" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-white/20" />
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <Bot className="w-8 h-8 mx-auto text-white/10 mb-2" />
            <p className="text-white/30 text-[10px] font-pixel mb-3">Not registered as agent</p>
            <button
              onClick={() => onRegisterAgent(w.tokenId)}
              disabled={isActionPending}
              className="btn-3d btn-3d-green !text-[10px] disabled:opacity-40"
            >
              {isActionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Register as Agent'}
            </button>
          </div>
        )}
      </div>

      {/* Section C: Reputation */}
      {agent && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-frost-cyan" />
            <span className="text-xs font-display text-white/70 uppercase">Reputation</span>
          </div>

          {reputation && Number(reputation.overallScore) > 0 ? (
            <>
              {/* Overall Score */}
              <div className={cn(
                'text-center py-4 rounded-xl bg-gradient-to-br border border-white/[0.06]',
                scoreBg(score)
              )}>
                <span className={cn('text-3xl font-display font-bold', scoreColor(score), scoreGlow(score))}>
                  {score}
                </span>
                <span className="block text-[9px] font-pixel text-white/30 mt-1">Overall Score</span>
              </div>

              {/* Win Rate */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-pixel">
                  <span className="text-white/40">Win Rate</span>
                  <span className="text-white/60">
                    {Number(reputation.totalBattles) > 0
                      ? ((Number(reputation.wins) / Number(reputation.totalBattles)) * 100).toFixed(1)
                      : '0'}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-frost-cyan to-green-400 transition-all"
                    style={{
                      width: `${Number(reputation.totalBattles) > 0
                        ? (Number(reputation.wins) / Number(reputation.totalBattles)) * 100
                        : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Quest Completion */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-pixel">
                  <span className="text-white/40">Quest Completion</span>
                  <span className="text-white/60">
                    {Number(reputation.totalQuests) > 0
                      ? ((Number(reputation.questsCompleted) / Number(reputation.totalQuests)) * 100).toFixed(1)
                      : '0'}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all"
                    style={{
                      width: `${Number(reputation.totalQuests) > 0
                        ? (Number(reputation.questsCompleted) / Number(reputation.totalQuests)) * 100
                        : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Element Mastery */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-pixel text-white/40">Element Mastery</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {ELEMENTS.map((el, i) => {
                    const ElIcon = ELEMENT_ICONS[i] || Flame;
                    const wins = Number(reputation.elementWins[i] || 0n);
                    const maxWins = Math.max(1, ...reputation.elementWins.map(v => Number(v)));
                    return (
                      <div key={i} className="text-center px-1 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                        <ElIcon className="w-3 h-3 mx-auto mb-0.5" style={{ color: el.glowColor.replace('0.3', '0.8') }} />
                        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden mx-0.5 mb-0.5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-frost-cyan to-frost-purple transition-all"
                            style={{ width: `${(wins / maxWins) * 100}%` }}
                          />
                        </div>
                        <span className="text-[8px] font-pixel text-white/30">{wins}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Battles', value: Number(reputation.totalBattles) },
                  { label: 'Wins', value: Number(reputation.wins) },
                  { label: 'Losses', value: Number(reputation.losses) },
                  { label: 'Quests', value: Number(reputation.questsCompleted) },
                  { label: 'XP', value: Number(reputation.totalXpEarned) },
                  {
                    label: 'Net AVAX',
                    value: (
                      (Number(reputation.totalAvaxEarned) - Number(reputation.totalAvaxLost)) / 1e18
                    ).toFixed(3),
                  },
                ].map(stat => (
                  <div key={stat.label} className="text-center px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <span className="text-[9px] font-pixel text-white/30 block">{stat.label}</span>
                    <span className="text-xs font-pixel text-white/60">{stat.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <Trophy className="w-8 h-8 mx-auto text-white/10 mb-2" />
              <p className="text-white/30 text-[10px] font-pixel">No reputation data yet</p>
              <p className="text-white/20 text-[9px] font-pixel mt-1">Battle or quest to build reputation</p>
            </div>
          )}
        </div>
      )}

      {/* Section D: Battle Recommendations — only when autoMode is ON */}
      {agent?.autoMode && (
        <BattleRecommendations warrior={w} userAddress={userAddress} />
      )}
    </div>
  );
}

/* ===========================================================================
 * Leaderboard Tab
 * =========================================================================== */

function LeaderboardTab({
  leaderboard,
  onSelectWarrior,
}: {
  leaderboard: { tokenId: number; score: number }[];
  onSelectWarrior: (id: number) => void;
}) {
  if (leaderboard.length === 0) {
    return (
      <div className="text-center py-16 rounded-2xl border border-white/[0.04] bg-white/[0.01]">
        <Trophy className="w-10 h-10 mx-auto text-white/10 mb-3" />
        <p className="text-white/30 text-xs font-pixel">No leaderboard data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <table className="frost-table arena-table w-full">
        <thead>
          <tr>
            <th className="w-12">Rank</th>
            <th>Warrior</th>
            <th className="text-right">Score</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry, i) => {
            const rankEmoji = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}`;
            return (
              <motion.tr
                key={entry.tokenId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="cursor-pointer"
                onClick={() => onSelectWarrior(entry.tokenId)}
              >
                <td>
                  <span className={cn(
                    'text-xs font-pixel',
                    i < 3 ? 'text-amber-400' : 'text-white/40'
                  )}>
                    {rankEmoji}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/[0.04] flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/avalanche/api/metadata/${entry.tokenId}/image?element=0`}
                        alt={`#${entry.tokenId}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-xs font-pixel text-white/70">#{entry.tokenId}</span>
                  </div>
                </td>
                <td className="text-right">
                  <span className={cn('text-sm font-pixel font-bold', scoreColor(entry.score))}>
                    {entry.score}
                  </span>
                </td>
                <td>
                  <ChevronRight className="w-3.5 h-3.5 text-white/20" />
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ===========================================================================
 * Auto-Mode Tab
 * =========================================================================== */

function AutoModeTab({
  agents,
  onSelectWarrior,
}: {
  agents: number[];
  onSelectWarrior: (id: number) => void;
}) {
  if (agents.length === 0) {
    return (
      <div className="text-center py-16 rounded-2xl border border-white/[0.04] bg-white/[0.01]">
        <Bot className="w-10 h-10 mx-auto text-white/10 mb-3" />
        <p className="text-white/30 text-xs font-pixel">No auto-mode agents active</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {agents.map((tokenId, i) => (
        <motion.div
          key={tokenId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => onSelectWarrior(tokenId)}
          className="glass-card p-3 cursor-pointer group"
        >
          <div className="relative aspect-square rounded-xl overflow-hidden mb-2 bg-white/[0.03]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/avalanche/api/metadata/${tokenId}/image?element=0`}
              alt={`Warrior #${tokenId}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-green-500/20 border border-green-500/30 text-[9px] font-pixel text-green-400 flex items-center gap-1">
              <Bot className="w-2.5 h-2.5" />
              Auto
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-pixel text-white/70">#{tokenId}</span>
            <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
