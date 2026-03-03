'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sword,
  Swords,
  Shield,
  Zap,
  Sparkles,
  Trophy,
  Clock,
  ArrowRight,
  Loader2,
  XCircle,
  ChevronDown,
  Wallet,
} from 'lucide-react';
import { ELEMENTS, MIN_BATTLE_STAKE, MIN_TEAM_BATTLE_STAKE, ELEMENT_ADVANTAGES, CONTRACT_ADDRESSES, FUJI_CHAIN_ID } from '@/lib/constants';
import { BATTLE_ENGINE_ABI, TEAM_BATTLE_ABI, FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import { Users } from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { cn, shortenAddress } from '@/lib/utils';

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

interface TeamBattle {
  id: number;
  player1: string;
  player2: string;
  team1: [number, number, number];
  team2: [number, number, number];
  stake: bigint;
  score1: number;
  score2: number;
  matchups: [number, number, number];
  winner: string;
  resolved: boolean;
  createdAt: number;
  resolvedAt: number;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function getElement(id: number) {
  return ELEMENTS[id] ?? ELEMENTS[0];
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function hasElementAdvantage(attackerElement: number, defenderElement: number): boolean {
  return ELEMENT_ADVANTAGES[attackerElement] === defenderElement;
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

function parseTeamBattleData(raw: readonly unknown[]): TeamBattle {
  const team1Raw = raw[3] as readonly bigint[];
  const team2Raw = raw[4] as readonly bigint[];
  const matchupsRaw = raw[8] as readonly number[];
  return {
    id: Number(raw[0]),
    player1: String(raw[1]),
    player2: String(raw[2]),
    team1: [Number(team1Raw[0]), Number(team1Raw[1]), Number(team1Raw[2])],
    team2: [Number(team2Raw[0]), Number(team2Raw[1]), Number(team2Raw[2])],
    stake: BigInt(String(raw[5])),
    score1: Number(raw[6]),
    score2: Number(raw[7]),
    matchups: [Number(matchupsRaw[0]), Number(matchupsRaw[1]), Number(matchupsRaw[2])],
    winner: String(raw[9]),
    resolved: Boolean(raw[10]),
    createdAt: Number(raw[11]),
    resolvedAt: Number(raw[12]),
  };
}

/**
 * Warrior NFT image component.
 * Uses the metadata image endpoint which returns AI-generated art or SVG fallback.
 */
function WarriorImage({
  tokenId,
  element,
  size = 48,
  className = '',
}: {
  tokenId: number;
  element: number;
  size?: number;
  className?: string;
}) {
  const el = getElement(element);
  return (
    <div
      className={cn('relative rounded-lg overflow-hidden flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/metadata/${tokenId}/image?element=${element}`}
        alt={`Warrior #${tokenId}`}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <span
        className="absolute bottom-0 right-0 text-[10px] leading-none bg-black/60 rounded-tl px-0.5"
        title={el.name}
      >
        {el.emoji}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Data Fetching Hook
 * ------------------------------------------------------------------------- */

function useBattleData(address: string | undefined, isConnected: boolean) {
  const publicClient = usePublicClient();
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [openBattles, setOpenBattles] = useState<(Battle & { creatorWarrior: Warrior })[]>([]);
  const [battleHistory, setBattleHistory] = useState<(Battle & { myWarrior: Warrior; theirWarrior: Warrior })[]>([]);
  const [isLoadingWarriors, setIsLoadingWarriors] = useState(false);
  const [isLoadingBattles, setIsLoadingBattles] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [fetchCounter, setFetchCounter] = useState(0);

  const refetch = useCallback(() => setFetchCounter((c) => c + 1), []);

  // Fetch user's warriors
  useEffect(() => {
    if (!publicClient || !address || !isConnected) {
      setWarriors([]);
      return;
    }
    let cancelled = false;
    async function fetch() {
      setIsLoadingWarriors(true);
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
          setIsLoadingWarriors(false);
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
        console.error('[battle] Failed to fetch warriors:', err);
        if (!cancelled) setWarriors([]);
      } finally {
        if (!cancelled) setIsLoadingWarriors(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [publicClient, address, isConnected, fetchCounter]);

  // Fetch open battles
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    async function fetch() {
      setIsLoadingBattles(true);
      try {
        const battleIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'getOpenBattles',
          args: [0n, 50n],
        }) as bigint[];

        if (cancelled) return;
        if (!battleIds || battleIds.length === 0) {
          setOpenBattles([]);
          setIsLoadingBattles(false);
          return;
        }

        // Fetch battle details
        const battleDetails = await Promise.all(
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
        const battles = battleDetails.map((raw) => parseBattleData(raw as Record<string, unknown>));

        // Fetch warrior data for each battle creator
        const warriorDetails = await Promise.all(
          battles.map((b) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'getWarrior',
              args: [BigInt(b.nft1)],
            })
          )
        );

        if (cancelled) return;
        setOpenBattles(
          battles.map((b, i) => ({
            ...b,
            creatorWarrior: parseWarriorData(warriorDetails[i] as Record<string, unknown>, b.nft1),
          }))
        );
      } catch (err) {
        console.error('[battle] Failed to fetch open battles:', err);
        if (!cancelled) setOpenBattles([]);
      } finally {
        if (!cancelled) setIsLoadingBattles(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [publicClient, fetchCounter]);

  // Fetch battle history
  useEffect(() => {
    if (!publicClient || !address || !isConnected) {
      setBattleHistory([]);
      return;
    }
    let cancelled = false;
    async function fetch() {
      setIsLoadingHistory(true);
      try {
        const historyIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'getBattleHistory',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (cancelled) return;
        if (!historyIds || historyIds.length === 0) {
          setBattleHistory([]);
          setIsLoadingHistory(false);
          return;
        }

        // Get last 20 battles (most recent first)
        const recentIds = historyIds.slice(-20).reverse();

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
        const battles = battleDetails.map((raw) => parseBattleData(raw as Record<string, unknown>));

        // Collect all unique NFT IDs to fetch warrior data
        const nftIds = new Set<number>();
        battles.forEach((b) => {
          if (b.nft1 > 0) nftIds.add(b.nft1);
          if (b.nft2 > 0) nftIds.add(b.nft2);
        });

        const nftIdArray = Array.from(nftIds);
        const warriorResults = await Promise.all(
          nftIdArray.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'getWarrior',
              args: [BigInt(id)],
            })
          )
        );

        if (cancelled) return;
        const warriorMap = new Map<number, Warrior>();
        nftIdArray.forEach((id, i) => {
          warriorMap.set(id, parseWarriorData(warriorResults[i] as Record<string, unknown>, id));
        });

        const defaultWarrior: Warrior = {
          tokenId: 0, attack: 0, defense: 0, speed: 0, element: 0,
          specialPower: 0, level: 0, experience: 0, battleWins: 0, battleLosses: 0, powerScore: 0,
        };

        setBattleHistory(
          battles
            .filter((b) => b.resolved)
            .map((b) => {
              const isPlayer1 = b.player1.toLowerCase() === address!.toLowerCase();
              return {
                ...b,
                myWarrior: warriorMap.get(isPlayer1 ? b.nft1 : b.nft2) ?? defaultWarrior,
                theirWarrior: warriorMap.get(isPlayer1 ? b.nft2 : b.nft1) ?? defaultWarrior,
              };
            })
        );
      } catch (err) {
        console.error('[battle] Failed to fetch battle history:', err);
        if (!cancelled) setBattleHistory([]);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [publicClient, address, isConnected, fetchCounter]);

  return {
    warriors,
    openBattles,
    battleHistory,
    isLoadingWarriors,
    isLoadingBattles,
    isLoadingHistory,
    refetch,
  };
}

/* ---------------------------------------------------------------------------
 * Team Battle Data Hook
 * ------------------------------------------------------------------------- */

function useTeamBattleData(address: string | undefined, isConnected: boolean) {
  const publicClient = usePublicClient();
  const [openTeamBattles, setOpenTeamBattles] = useState<(TeamBattle & { creatorWarriors: Warrior[] })[]>([]);
  const [teamBattleHistory, setTeamBattleHistory] = useState<(TeamBattle & { myWarriors: Warrior[]; theirWarriors: Warrior[] })[]>([]);
  const [isLoadingTeamBattles, setIsLoadingTeamBattles] = useState(false);
  const [isLoadingTeamHistory, setIsLoadingTeamHistory] = useState(false);
  const [fetchCounter, setFetchCounter] = useState(0);

  const refetch = useCallback(() => setFetchCounter((c) => c + 1), []);

  // Fetch open team battles
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    async function fetch() {
      setIsLoadingTeamBattles(true);
      try {
        const battleIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
          abi: TEAM_BATTLE_ABI,
          functionName: 'getOpenTeamBattles',
          args: [0n, 50n],
        }) as bigint[];

        if (cancelled) return;
        if (!battleIds || battleIds.length === 0) {
          setOpenTeamBattles([]);
          setIsLoadingTeamBattles(false);
          return;
        }

        const battleDetails = await Promise.all(
          battleIds.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
              abi: TEAM_BATTLE_ABI,
              functionName: 'getTeamBattle',
              args: [id],
            })
          )
        );

        if (cancelled) return;
        const battles = battleDetails.map((raw) => parseTeamBattleData(raw as readonly unknown[]));

        // Fetch warrior data for each battle's team1
        const allNftIds = new Set<number>();
        battles.forEach((b) => b.team1.forEach((id) => { if (id > 0) allNftIds.add(id); }));

        const nftIdArray = Array.from(allNftIds);
        const warriorResults = await Promise.all(
          nftIdArray.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'getWarrior',
              args: [BigInt(id)],
            })
          )
        );

        if (cancelled) return;
        const warriorMap = new Map<number, Warrior>();
        nftIdArray.forEach((id, i) => {
          warriorMap.set(id, parseWarriorData(warriorResults[i] as Record<string, unknown>, id));
        });

        const defaultW: Warrior = { tokenId: 0, attack: 0, defense: 0, speed: 0, element: 0, specialPower: 0, level: 0, experience: 0, battleWins: 0, battleLosses: 0, powerScore: 0 };

        setOpenTeamBattles(
          battles.map((b) => ({
            ...b,
            creatorWarriors: b.team1.map((id) => warriorMap.get(id) ?? defaultW),
          }))
        );
      } catch (err) {
        console.error('[team-battle] Failed to fetch open team battles:', err);
        if (!cancelled) setOpenTeamBattles([]);
      } finally {
        if (!cancelled) setIsLoadingTeamBattles(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [publicClient, fetchCounter]);

  // Fetch team battle history
  useEffect(() => {
    if (!publicClient || !address || !isConnected) {
      setTeamBattleHistory([]);
      return;
    }
    let cancelled = false;
    async function fetch() {
      setIsLoadingTeamHistory(true);
      try {
        const historyIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
          abi: TEAM_BATTLE_ABI,
          functionName: 'getTeamBattleHistory',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (cancelled) return;
        if (!historyIds || historyIds.length === 0) {
          setTeamBattleHistory([]);
          setIsLoadingTeamHistory(false);
          return;
        }

        const recentIds = historyIds.slice(-20).reverse();

        const battleDetails = await Promise.all(
          recentIds.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
              abi: TEAM_BATTLE_ABI,
              functionName: 'getTeamBattle',
              args: [id],
            })
          )
        );

        if (cancelled) return;
        const battles = battleDetails.map((raw) => parseTeamBattleData(raw as readonly unknown[]));

        // Collect all NFT IDs
        const nftIds = new Set<number>();
        battles.forEach((b) => {
          b.team1.forEach((id) => { if (id > 0) nftIds.add(id); });
          b.team2.forEach((id) => { if (id > 0) nftIds.add(id); });
        });

        const nftIdArray = Array.from(nftIds);
        const warriorResults = await Promise.all(
          nftIdArray.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'getWarrior',
              args: [BigInt(id)],
            })
          )
        );

        if (cancelled) return;
        const warriorMap = new Map<number, Warrior>();
        nftIdArray.forEach((id, i) => {
          warriorMap.set(id, parseWarriorData(warriorResults[i] as Record<string, unknown>, id));
        });

        const defaultW: Warrior = { tokenId: 0, attack: 0, defense: 0, speed: 0, element: 0, specialPower: 0, level: 0, experience: 0, battleWins: 0, battleLosses: 0, powerScore: 0 };

        setTeamBattleHistory(
          battles
            .filter((b) => b.resolved)
            .map((b) => {
              const isPlayer1 = b.player1.toLowerCase() === address!.toLowerCase();
              return {
                ...b,
                myWarriors: (isPlayer1 ? b.team1 : b.team2).map((id) => warriorMap.get(id) ?? defaultW),
                theirWarriors: (isPlayer1 ? b.team2 : b.team1).map((id) => warriorMap.get(id) ?? defaultW),
              };
            })
        );
      } catch (err) {
        console.error('[team-battle] Failed to fetch team battle history:', err);
        if (!cancelled) setTeamBattleHistory([]);
      } finally {
        if (!cancelled) setIsLoadingTeamHistory(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [publicClient, address, isConnected, fetchCounter]);

  return {
    openTeamBattles,
    teamBattleHistory,
    isLoadingTeamBattles,
    isLoadingTeamHistory,
    refetch,
  };
}

/* ---------------------------------------------------------------------------
 * Warrior Mini Card
 * ------------------------------------------------------------------------- */

function WarriorMiniCard({
  warrior,
  selected,
  onClick,
  size = 'normal',
}: {
  warrior: Warrior;
  selected?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
}) {
  const element = getElement(warrior.element);
  const isSmall = size === 'small';

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        'relative rounded-xl text-left transition-all overflow-hidden',
        isSmall ? 'p-2.5' : 'p-3',
        selected
          ? 'ring-2 ring-frost-cyan shadow-glow-primary'
          : 'ring-1 ring-white/10 hover:ring-white/20',
        'bg-gradient-to-br from-white/[0.04] to-transparent',
      )}
      style={{
        borderLeft: `3px solid ${element.glowColor.replace('0.3', '0.8')}`,
      }}
    >
      <div className="flex items-center gap-2">
        <WarriorImage
          tokenId={warrior.tokenId}
          element={warrior.element}
          size={isSmall ? 32 : 40}
          className={isSmall ? 'rounded-md' : 'rounded-lg'}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'font-mono font-bold text-white',
              isSmall ? 'text-xs' : 'text-sm',
            )}>
              #{warrior.tokenId}
            </span>
            <span className={cn(
              'font-semibold bg-gradient-to-r bg-clip-text text-transparent',
              element.color,
              isSmall ? 'text-[10px]' : 'text-xs',
            )}>
              {element.name}
            </span>
          </div>
          <div className={cn(
            'flex items-center gap-2 text-white/50 font-mono',
            isSmall ? 'text-[10px] gap-1.5' : 'text-xs',
          )}>
            <span className="flex items-center gap-0.5">
              <Zap className={isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
              {warrior.powerScore}
            </span>
            <span>Lv.{warrior.level}</span>
          </div>
        </div>
      </div>

      {selected && (
        <motion.div
          layoutId="warrior-selected"
          className="absolute inset-0 rounded-xl ring-2 ring-frost-cyan pointer-events-none"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

/* ---------------------------------------------------------------------------
 * Warrior Stats Preview
 * ------------------------------------------------------------------------- */

function WarriorStatsPreview({ warrior }: { warrior: Warrior }) {
  const element = getElement(warrior.element);
  const stats = [
    { label: 'ATK', value: warrior.attack, color: 'bg-red-500' },
    { label: 'DEF', value: warrior.defense, color: 'bg-blue-500' },
    { label: 'SPD', value: warrior.speed, color: 'bg-green-500' },
    { label: 'SPC', value: warrior.specialPower, color: 'bg-purple-500' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 mt-4"
      style={{ boxShadow: `0 0 40px ${element.glowColor}` }}
    >
      <div className="flex items-center gap-3 mb-4">
        <WarriorImage
          tokenId={warrior.tokenId}
          element={warrior.element}
          size={56}
          className="rounded-xl ring-1 ring-white/10"
        />
        <div>
          <h4 className="font-display font-bold text-white">
            Warrior #{warrior.tokenId}
          </h4>
          <span className={cn(
            'text-xs font-semibold bg-gradient-to-r bg-clip-text text-transparent',
            element.color,
          )}>
            {element.name} Element
          </span>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xl font-mono font-bold text-frost-cyan">
            {warrior.powerScore}
          </div>
          <div className="text-[10px] uppercase text-white/40 tracking-wider">Power Score</div>
        </div>
      </div>

      <div className="space-y-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-white/40 w-8">{stat.label}</span>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', stat.color)}
                initial={{ width: 0 }}
                animate={{ width: `${stat.value}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <span className="text-xs font-mono text-white/60 w-7 text-right">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5 text-xs text-white/40">
        <span>Level {warrior.level}</span>
        <span>{warrior.battleWins}W / {warrior.battleLosses}L</span>
        <span>{warrior.experience} XP</span>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Battle Result Modal
 * ------------------------------------------------------------------------- */

function BattleResultModal({
  isOpen,
  onClose,
  myWarrior,
  theirWarrior,
  isWinner,
  stakeAmount,
}: {
  isOpen: boolean;
  onClose: () => void;
  myWarrior: Warrior;
  theirWarrior: Warrior;
  isWinner: boolean;
  stakeAmount: string;
}) {
  const myElement = getElement(myWarrior.element);
  const theirElement = getElement(theirWarrior.element);
  const iHaveAdvantage = hasElementAdvantage(myWarrior.element, theirWarrior.element);
  const theyHaveAdvantage = hasElementAdvantage(theirWarrior.element, myWarrior.element);

  const myBaseScore = myWarrior.attack + myWarrior.defense + myWarrior.speed + myWarrior.specialPower;
  const theirBaseScore = theirWarrior.attack + theirWarrior.defense + theirWarrior.speed + theirWarrior.specialPower;
  const myBonus = iHaveAdvantage ? Math.round(myBaseScore * 0.15) : 0;
  const theirBonus = theyHaveAdvantage ? Math.round(theirBaseScore * 0.15) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative w-full max-w-2xl glass-card p-6 sm:p-8 overflow-hidden"
            initial={{ scale: 0.8, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {isWinner && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      background: ['#ff2020', '#ff6b6b', '#ffffff', '#ffd700', '#00ff88'][i % 5],
                      left: `${Math.random() * 100}%`,
                      top: `-5%`,
                    }}
                    animate={{
                      y: ['0vh', `${60 + Math.random() * 40}vh`],
                      x: [0, (Math.random() - 0.5) * 200],
                      rotate: [0, Math.random() * 720],
                      opacity: [1, 0],
                    }}
                    transition={{
                      duration: 2 + Math.random() * 2,
                      delay: Math.random() * 0.8,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Result Header */}
            <motion.div
              className="text-center mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
            >
              {isWinner ? (
                <>
                  <Trophy className="w-12 h-12 text-frost-gold mx-auto mb-2" />
                  <h2 className="font-pixel text-3xl sm:text-4xl font-black text-frost-gold text-glow-green">
                    VICTORY!
                  </h2>
                  <p className="text-frost-green text-sm mt-1 font-semibold">
                    +{stakeAmount} AVAX earned
                  </p>
                </>
              ) : (
                <>
                  <Shield className="w-12 h-12 text-frost-red mx-auto mb-2" />
                  <h2 className="font-pixel text-3xl sm:text-4xl font-black text-frost-red">
                    DEFEAT
                  </h2>
                  <p className="text-white/40 text-sm mt-1">
                    -{stakeAmount} AVAX
                  </p>
                </>
              )}
            </motion.div>

            {/* VS Screen */}
            <div className="flex items-center gap-4 sm:gap-6 justify-center mb-6">
              <motion.div
                className={cn(
                  'flex-1 glass-card p-4 text-center',
                  isWinner ? 'ring-2 ring-frost-green/50' : 'ring-1 ring-frost-red/30 opacity-70',
                )}
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring' }}
                style={{ boxShadow: isWinner ? `0 0 30px ${myElement.glowColor}` : 'none' }}
              >
                <div className="flex justify-center mb-2">
                  <WarriorImage
                    tokenId={myWarrior.tokenId}
                    element={myWarrior.element}
                    size={80}
                    className="rounded-xl ring-2 ring-white/10"
                  />
                </div>
                <span className="text-xs font-mono text-frost-cyan">#{myWarrior.tokenId}</span>
                <div className={cn(
                  'text-xs font-semibold mt-1 bg-gradient-to-r bg-clip-text text-transparent',
                  myElement.color,
                )}>
                  {myElement.name}
                </div>
                <div className="text-lg font-mono font-bold text-white mt-1">{myWarrior.powerScore}</div>
                <div className="text-[10px] text-white/30 uppercase">Power</div>
              </motion.div>

              <motion.div
                className="flex-shrink-0"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.4, type: 'spring', stiffness: 300 }}
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-frost-pink to-frost-purple flex items-center justify-center">
                  <span className="font-pixel font-black text-white text-lg sm:text-xl">VS</span>
                </div>
              </motion.div>

              <motion.div
                className={cn(
                  'flex-1 glass-card p-4 text-center',
                  !isWinner ? 'ring-2 ring-frost-green/50' : 'ring-1 ring-frost-red/30 opacity-70',
                )}
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring' }}
                style={{ boxShadow: !isWinner ? `0 0 30px ${theirElement.glowColor}` : 'none' }}
              >
                <div className="flex justify-center mb-2">
                  <WarriorImage
                    tokenId={theirWarrior.tokenId}
                    element={theirWarrior.element}
                    size={80}
                    className="rounded-xl ring-2 ring-white/10"
                  />
                </div>
                <span className="text-xs font-mono text-white/60">#{theirWarrior.tokenId}</span>
                <div className={cn(
                  'text-xs font-semibold mt-1 bg-gradient-to-r bg-clip-text text-transparent',
                  theirElement.color,
                )}>
                  {theirElement.name}
                </div>
                <div className="text-lg font-mono font-bold text-white mt-1">{theirWarrior.powerScore}</div>
                <div className="text-[10px] text-white/30 uppercase">Power</div>
              </motion.div>
            </div>

            {/* Combat Score Breakdown */}
            <motion.div
              className="bg-white/[0.03] rounded-xl p-4 mb-6 border border-white/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <h4 className="font-pixel text-xs uppercase tracking-wider text-white/40 mb-3">
                Combat Breakdown
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-white/40 text-xs mb-1">Your Score</div>
                  <div className="font-mono">
                    <span className="text-white font-bold">{myBaseScore}</span>
                    {myBonus > 0 && (
                      <span className="text-frost-green ml-1">+{myBonus}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white/40 text-xs mb-1">Opponent Score</div>
                  <div className="font-mono">
                    <span className="text-white font-bold">{theirBaseScore}</span>
                    {theirBonus > 0 && (
                      <span className="text-frost-green ml-1">+{theirBonus}</span>
                    )}
                  </div>
                </div>
              </div>

              {(iHaveAdvantage || theyHaveAdvantage) && (
                <div className={cn(
                  'mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs',
                  iHaveAdvantage ? 'text-frost-green' : 'text-frost-red',
                )}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {iHaveAdvantage
                    ? `${myElement.name} has advantage over ${theirElement.name}! (+15% bonus)`
                    : `${theirElement.name} has advantage over ${myElement.name}! (+15% bonus)`
                  }
                </div>
              )}
            </motion.div>

            <motion.button
              onClick={onClose}
              className="w-full btn-primary text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isWinner ? 'Claim Victory' : 'Return to Frostbite'}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Arena Background (decorative)
 * ------------------------------------------------------------------------- */

function ArenaBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Center frost glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,32,32,0.03) 0%, transparent 70%)',
          filter: 'blur(120px)',
        }}
      />
      {/* Top-left purple aurora */}
      <div
        className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,107,107,0.04) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }}
      />
      {/* Bottom-right pink aurora */}
      <div
        className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }}
      />
      {/* Decorative diamonds */}
      <div
        className="absolute top-20 right-20 w-16 h-16 rotate-45 border border-frost-cyan/5 rounded-sm"
      />
      <div
        className="absolute bottom-32 left-16 w-12 h-12 rotate-45 border border-frost-purple/5 rounded-sm"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Arena Stats Bar
 * ------------------------------------------------------------------------- */

function ArenaStatsBar({
  openBattles,
  battleHistory,
  currentAddress,
}: {
  openBattles: (Battle & { creatorWarrior: Warrior })[];
  battleHistory: (Battle & { myWarrior: Warrior; theirWarrior: Warrior })[];
  currentAddress?: string;
}) {
  const stats = useMemo(() => {
    const wins = currentAddress
      ? battleHistory.filter((b) => b.winner.toLowerCase() === currentAddress.toLowerCase()).length
      : 0;
    const losses = battleHistory.length - wins;
    const biggestWin = battleHistory.reduce((max, b) => {
      const isWin = currentAddress && b.winner.toLowerCase() === currentAddress.toLowerCase();
      if (isWin) {
        const val = parseFloat(formatEther(b.stake));
        return val > max ? val : max;
      }
      return max;
    }, 0);
    const totalVolume = battleHistory.reduce(
      (sum, b) => sum + parseFloat(formatEther(b.stake)),
      0,
    );

    return [
      { icon: Zap, value: String(openBattles.length), label: 'OPEN DUELS', color: 'text-frost-cyan' },
      { icon: Sword, value: String(battleHistory.length), label: 'TOTAL BATTLES', color: 'text-frost-purple' },
      { icon: Trophy, value: biggestWin > 0 ? `${biggestWin.toFixed(3)}` : '—', label: 'BIGGEST WIN', color: 'text-frost-gold' },
      { icon: Sparkles, value: totalVolume > 0 ? `${totalVolume.toFixed(2)}` : '0', label: 'VOLUME (AVAX)', color: 'text-frost-pink' },
      { icon: Shield, value: `${wins}/${losses}`, label: 'W/L', color: 'text-frost-green' },
    ];
  }, [openBattles, battleHistory, currentAddress]);

  return (
    <div className="h-12 bg-frost-surface/80 backdrop-blur-md border-b border-white/[0.06] flex items-center overflow-x-auto">
      <div className="flex items-center gap-0 px-4 min-w-max">
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex items-center">
            {i > 0 && <div className="stat-divider mx-4" />}
            <div className="flex items-center gap-2">
              <stat.icon className={cn('w-3.5 h-3.5', stat.color)} />
              <div className="flex flex-col">
                <span className="font-pixel text-xs text-white leading-none">{stat.value}</span>
                <span className="font-pixel text-[8px] text-white/30 leading-none mt-0.5">{stat.label}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Battle Feed Sidebar
 * ------------------------------------------------------------------------- */

interface FeedEvent {
  id: string;
  type: 'win' | 'loss' | 'new';
  message: string;
  time: string;
}

function BattleFeedSidebar({
  openBattles,
  battleHistory,
  currentAddress,
}: {
  openBattles: (Battle & { creatorWarrior: Warrior })[];
  battleHistory: (Battle & { myWarrior: Warrior; theirWarrior: Warrior })[];
  currentAddress?: string;
}) {
  const events = useMemo<FeedEvent[]>(() => {
    const items: FeedEvent[] = [];

    // Battle history events
    battleHistory.slice(0, 15).forEach((b) => {
      const isWin = currentAddress && b.winner.toLowerCase() === currentAddress.toLowerCase();
      const winnerAddr = shortenAddress(b.winner);
      items.push({
        id: `h-${b.id}`,
        type: isWin ? 'win' : 'loss',
        message: `${winnerAddr} won ${formatEther(b.stake)} AVAX with #${isWin ? b.myWarrior.tokenId : b.theirWarrior.tokenId}`,
        time: timeAgo(b.resolvedAt),
      });
    });

    // Open battles events
    openBattles.forEach((b) => {
      items.push({
        id: `o-${b.id}`,
        type: 'new',
        message: `New duel: ${shortenAddress(b.player1)} wagered ${formatEther(b.stake)} AVAX`,
        time: timeAgo(b.createdAt),
      });
    });

    // Sort by recency (newer first based on the time string heuristic — not perfect but close enough)
    return items.slice(0, 20);
  }, [openBattles, battleHistory, currentAddress]);

  const dotColor = { win: 'bg-frost-green', loss: 'bg-frost-red', new: 'bg-frost-cyan' };

  return (
    <div className="w-[280px] hidden lg:flex flex-col bg-frost-surface/60 backdrop-blur-sm border-r border-white/[0.06]">
      {/* Header */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0">
        <Zap className="w-3.5 h-3.5 text-frost-cyan" />
        <span className="font-pixel text-xs text-white/60 uppercase">Battle Feed</span>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto feed-scroll p-3 space-y-2">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Loader2 className="w-5 h-5 text-frost-cyan/40 animate-spin mb-2" />
            <span className="text-[10px] text-white/20 font-pixel">Waiting for battles...</span>
          </div>
        ) : (
          events.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors"
            >
              <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', dotColor[event.type])} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-white/50 leading-snug break-words">{event.message}</p>
                <span className="text-[9px] text-white/20">{event.time}</span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Arena Table
 * ------------------------------------------------------------------------- */

function ArenaTable({
  battles,
  isLoading,
  isConnected,
  currentAddress,
  onCreateClick,
  onFightClick,
  onCancelBattle,
  isCancelPending,
}: {
  battles: (Battle & { creatorWarrior: Warrior })[];
  isLoading: boolean;
  isConnected: boolean;
  currentAddress?: string;
  onCreateClick: () => void;
  onFightClick: (battle: Battle & { creatorWarrior: Warrior }) => void;
  onCancelBattle: (battleId: number) => void;
  isCancelPending: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-pixel text-sm sm:text-base text-white uppercase">Frost Arena</h2>
          <span className="px-2 py-0.5 rounded-full bg-frost-cyan/10 text-frost-cyan text-[10px] font-pixel font-bold">
            {battles.length} OPEN
          </span>
        </div>
        <motion.button
          onClick={onCreateClick}
          disabled={!isConnected}
          className={cn(
            'px-4 py-2 rounded-lg font-pixel text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5',
            isConnected
              ? 'btn-primary'
              : 'bg-white/5 text-white/20 cursor-not-allowed',
          )}
          whileHover={isConnected ? { scale: 1.03 } : {}}
          whileTap={isConnected ? { scale: 0.97 } : {}}
        >
          <Sword className="w-3 h-3" />
          Create Battle
        </motion.button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
          </div>
        ) : battles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sword className="w-8 h-8 text-white/10 mb-3" />
            <p className="text-white/25 text-sm font-pixel">No open battles</p>
            <p className="text-white/15 text-xs mt-1">Be the first to create one!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="frost-table arena-table w-full">
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>WARRIOR</th>
                  <th className="hidden sm:table-cell">POWER</th>
                  <th>STAKE</th>
                  <th className="hidden sm:table-cell">TIME</th>
                  <th className="text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {battles.map((battle, i) => {
                  const element = getElement(battle.creatorWarrior.element);
                  const stakeFormatted = formatEther(battle.stake);
                  const isMyBattle = currentAddress && battle.player1.toLowerCase() === currentAddress.toLowerCase();

                  return (
                    <motion.tr
                      key={battle.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="group"
                    >
                      <td style={{ borderLeft: `3px solid ${element.glowColor.replace('0.3', '0.6')}` }}>
                        <div className="flex items-center gap-2">
                          <WarriorImage
                            tokenId={battle.creatorWarrior.tokenId}
                            element={battle.creatorWarrior.element}
                            size={28}
                            className="rounded-md"
                          />
                          <span className={cn(
                            'font-mono text-xs',
                            isMyBattle ? 'text-frost-cyan font-bold' : 'text-white/60',
                          )}>
                            {isMyBattle ? 'You' : shortenAddress(battle.player1)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-white font-bold">#{battle.creatorWarrior.tokenId}</span>
                          <span className="text-sm">{element.emoji}</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="font-mono text-xs text-white/70">{battle.creatorWarrior.powerScore}</span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-frost-gold font-semibold">{stakeFormatted}</span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-[10px] text-white/30">{timeAgo(battle.createdAt)}</span>
                      </td>
                      <td className="text-right">
                        {isMyBattle ? (
                          <motion.button
                            onClick={() => onCancelBattle(battle.id)}
                            disabled={isCancelPending}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase transition-all inline-flex items-center gap-1',
                              !isCancelPending
                                ? 'bg-frost-red/10 text-frost-red border border-frost-red/20 hover:bg-frost-red/20'
                                : 'bg-white/5 text-white/20 cursor-not-allowed',
                            )}
                            whileHover={!isCancelPending ? { scale: 1.05 } : {}}
                            whileTap={!isCancelPending ? { scale: 0.95 } : {}}
                          >
                            {isCancelPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            Cancel
                          </motion.button>
                        ) : (
                          <motion.button
                            onClick={() => onFightClick(battle)}
                            disabled={!isConnected}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase transition-all inline-flex items-center gap-1',
                              isConnected
                                ? 'bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/20 hover:bg-frost-cyan/20'
                                : 'bg-white/5 text-white/20 cursor-not-allowed',
                            )}
                            whileHover={isConnected ? { scale: 1.05 } : {}}
                            whileTap={isConnected ? { scale: 0.95 } : {}}
                          >
                            <Sword className="w-3 h-3" />
                            Fight
                          </motion.button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Compact Battle History
 * ------------------------------------------------------------------------- */

function CompactBattleHistory({
  history,
  isConnected,
  isLoading,
  onViewResult,
  currentAddress,
}: {
  history: (Battle & { myWarrior: Warrior; theirWarrior: Warrior })[];
  isConnected: boolean;
  isLoading: boolean;
  onViewResult: (battle: Battle & { myWarrior: Warrior; theirWarrior: Warrior }) => void;
  currentAddress?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!isConnected) return null;

  return (
    <div className="px-4 sm:px-6 pb-4 flex-shrink-0">
      {/* Toggle Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-2 text-left group"
      >
        <Trophy className="w-3.5 h-3.5 text-frost-gold" />
        <span className="font-pixel text-[10px] text-white/50 uppercase">
          Your History ({history.length})
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-white/30 transition-transform ml-auto',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-frost-cyan animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-white/20 text-xs font-pixel">No battles yet</p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <table className="frost-table arena-table w-full">
                  <thead>
                    <tr>
                      <th>Battle</th>
                      <th>Opponent</th>
                      <th>My NFT</th>
                      <th>Their NFT</th>
                      <th className="text-right">Stake</th>
                      <th className="text-center">Result</th>
                      <th className="text-right">Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((battle, i) => {
                      const isWinner = currentAddress
                        ? battle.winner.toLowerCase() === currentAddress.toLowerCase()
                        : false;
                      const isPlayer1 = currentAddress
                        ? battle.player1.toLowerCase() === currentAddress.toLowerCase()
                        : true;
                      const opponent = isPlayer1 ? battle.player2 : battle.player1;

                      return (
                        <motion.tr
                          key={battle.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.03 * i }}
                          className="cursor-pointer"
                          onClick={() => onViewResult(battle)}
                        >
                          <td>
                            <span className="font-mono text-xs text-frost-cyan font-bold">
                              #{battle.id}
                            </span>
                          </td>
                          <td>
                            <span className="font-mono text-xs text-white/60">
                              {shortenAddress(opponent)}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <WarriorImage
                                tokenId={battle.myWarrior.tokenId}
                                element={battle.myWarrior.element}
                                size={24}
                                className="rounded-md"
                              />
                              <span className="font-mono text-[10px] text-white/80">
                                #{battle.myWarrior.tokenId}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <WarriorImage
                                tokenId={battle.theirWarrior.tokenId}
                                element={battle.theirWarrior.element}
                                size={24}
                                className="rounded-md"
                              />
                              <span className="font-mono text-[10px] text-white/80">
                                #{battle.theirWarrior.tokenId}
                              </span>
                            </div>
                          </td>
                          <td className="text-right">
                            <span className="font-mono text-xs text-frost-gold font-semibold">
                              {formatEther(battle.stake)}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                              isWinner
                                ? 'bg-frost-green/10 text-frost-green ring-1 ring-frost-green/20'
                                : 'bg-frost-red/10 text-frost-red ring-1 ring-frost-red/20',
                            )}>
                              {isWinner ? (
                                <>
                                  <Trophy className="w-2.5 h-2.5" />
                                  Win
                                </>
                              ) : (
                                <>
                                  <Shield className="w-2.5 h-2.5" />
                                  Loss
                                </>
                              )}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="text-[10px] text-white/40 font-mono">
                              {formatDate(battle.resolvedAt)}
                            </span>
                          </td>
                          <td>
                            <ArrowRight className="w-3 h-3 text-white/20" />
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Warrior Selection Drawer
 * ------------------------------------------------------------------------- */

function WarriorSelectionDrawer({
  isOpen,
  mode,
  targetBattle,
  warriors,
  isLoadingWarriors,
  onClose,
  onCreateBattle,
  onJoinBattle,
  isWorking,
  isPending,
}: {
  isOpen: boolean;
  mode: 'create' | 'join';
  targetBattle: (Battle & { creatorWarrior: Warrior }) | null;
  warriors: Warrior[];
  isLoadingWarriors: boolean;
  onClose: () => void;
  onCreateBattle: (warrior: Warrior, stake: string) => void;
  onJoinBattle: (warrior: Warrior, battle: Battle & { creatorWarrior: Warrior }) => void;
  isWorking: boolean;
  isPending: boolean;
}) {
  const [selectedWarrior, setSelectedWarrior] = useState<Warrior | null>(null);
  const [stakeAmount, setStakeAmount] = useState(MIN_BATTLE_STAKE);

  // Reset state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSelectedWarrior(null);
      setStakeAmount(MIN_BATTLE_STAKE);
    }
  }, [isOpen]);

  const isValidStake = useMemo(() => {
    const amount = parseFloat(stakeAmount);
    return !isNaN(amount) && amount >= parseFloat(MIN_BATTLE_STAKE);
  }, [stakeAmount]);

  const handleConfirm = useCallback(() => {
    if (!selectedWarrior) return;
    if (mode === 'create') {
      if (!isValidStake) return;
      onCreateBattle(selectedWarrior, stakeAmount);
    } else if (targetBattle) {
      onJoinBattle(selectedWarrior, targetBattle);
    }
  }, [selectedWarrior, mode, stakeAmount, isValidStake, targetBattle, onCreateBattle, onJoinBattle]);

  const stakeDisplay = mode === 'join' && targetBattle
    ? formatEther(targetBattle.stake)
    : stakeAmount;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Panel */}
          <motion.div
            className="relative w-full bg-frost-surface/95 backdrop-blur-xl border-t border-frost-cyan/20 rounded-t-2xl max-h-[70vh] drawer-shadow flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/10" />
            </div>

            {/* Title */}
            <div className="px-6 pb-3 border-b border-white/[0.06] flex-shrink-0">
              <h3 className="font-pixel text-sm text-white uppercase">
                {mode === 'create' ? 'Create Battle' : 'Choose Your Fighter'}
              </h3>
              {mode === 'join' && targetBattle && (
                <p className="text-[10px] text-white/30 mt-1">
                  vs {shortenAddress(targetBattle.player1)} — #{targetBattle.creatorWarrior.tokenId} {getElement(targetBattle.creatorWarrior.element).emoji} — {formatEther(targetBattle.stake)} AVAX
                </p>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingWarriors ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
                </div>
              ) : warriors.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-10 h-10 text-white/15 mx-auto mb-3" />
                  <p className="text-white/30 text-sm font-pixel">No Warriors Found</p>
                  <p className="text-white/20 text-xs mt-1">Mint a warrior first!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Warrior Grid */}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-pixel mb-3 block">
                      Select Your Warrior
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[35vh] overflow-y-auto pr-1">
                      {warriors.map((w) => (
                        <WarriorMiniCard
                          key={w.tokenId}
                          warrior={w}
                          selected={selectedWarrior?.tokenId === w.tokenId}
                          onClick={() => setSelectedWarrior(w)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Right: Preview + Stake + Confirm */}
                  <div className="flex flex-col">
                    {/* Stake Input (create mode only) */}
                    {mode === 'create' && (
                      <div className="mb-4">
                        <label className="text-[10px] uppercase tracking-wider text-white/40 font-pixel mb-2 block">
                          Stake Amount (AVAX)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={stakeAmount}
                            onChange={(e) => setStakeAmount(e.target.value)}
                            step="0.001"
                            min={MIN_BATTLE_STAKE}
                            className={cn(
                              'w-full bg-white/[0.04] border rounded-xl px-4 py-3 font-mono text-white text-sm',
                              'focus:outline-none focus:ring-2 transition-all',
                              isValidStake
                                ? 'border-white/10 focus:ring-frost-cyan/40 focus:border-frost-cyan/40'
                                : 'border-frost-red/30 focus:ring-frost-red/40',
                            )}
                            placeholder={MIN_BATTLE_STAKE}
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-mono">
                            AVAX
                          </span>
                        </div>
                        <p className="text-[9px] text-white/25 mt-1">
                          Min: {MIN_BATTLE_STAKE} AVAX
                        </p>

                        {/* Quick Stake Buttons */}
                        <div className="flex gap-2 mt-2">
                          {['0.005', '0.01', '0.05', '0.1'].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setStakeAmount(amount)}
                              className={cn(
                                'flex-1 py-1.5 rounded-lg text-[10px] font-mono transition-all',
                                stakeAmount === amount
                                  ? 'bg-frost-cyan/20 text-frost-cyan border border-frost-cyan/30'
                                  : 'bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06] hover:text-white/60',
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected warrior preview */}
                    {selectedWarrior ? (
                      <WarriorStatsPreview warrior={selectedWarrior} />
                    ) : (
                      <div className="glass-card p-6 mt-4 flex items-center justify-center h-[160px]">
                        <p className="text-white/20 text-xs text-center font-pixel">
                          Select a warrior to see stats
                        </p>
                      </div>
                    )}

                    {/* Confirm Button */}
                    <motion.button
                      onClick={handleConfirm}
                      disabled={!selectedWarrior || (mode === 'create' && !isValidStake) || isWorking}
                      className={cn(
                        'mt-4 w-full py-3.5 rounded-xl font-pixel font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2',
                        selectedWarrior && (mode === 'join' || isValidStake) && !isWorking
                          ? 'btn-primary'
                          : 'bg-white/5 text-white/20 cursor-not-allowed',
                      )}
                      whileHover={selectedWarrior && !isWorking ? { scale: 1.02 } : {}}
                      whileTap={selectedWarrior && !isWorking ? { scale: 0.98 } : {}}
                    >
                      {isWorking ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {isPending ? 'Confirm in Wallet...' : mode === 'create' ? 'Creating Battle...' : 'Joining Battle...'}
                        </>
                      ) : (
                        <>
                          <Sword className="w-4 h-4" />
                          {mode === 'create'
                            ? `Create Battle (${stakeDisplay} AVAX)`
                            : `Fight (${stakeDisplay} AVAX)`
                          }
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Team Arena Table (3v3)
 * ------------------------------------------------------------------------- */

function TeamArenaTable({
  battles,
  isLoading,
  isConnected,
  currentAddress,
  onCreateClick,
  onFightClick,
  onCancelBattle,
  isCancelPending,
}: {
  battles: (TeamBattle & { creatorWarriors: Warrior[] })[];
  isLoading: boolean;
  isConnected: boolean;
  currentAddress?: string;
  onCreateClick: () => void;
  onFightClick: (battle: TeamBattle & { creatorWarriors: Warrior[] }) => void;
  onCancelBattle: (battleId: number) => void;
  isCancelPending: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-pixel text-sm sm:text-base text-white uppercase">Team Arena</h2>
          <span className="px-2 py-0.5 rounded-full bg-frost-purple/10 text-frost-purple text-[10px] font-pixel font-bold">
            {battles.length} OPEN
          </span>
        </div>
        <motion.button
          onClick={onCreateClick}
          disabled={!isConnected}
          className={cn(
            'px-4 py-2 rounded-lg font-pixel text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5',
            isConnected
              ? 'btn-primary'
              : 'bg-white/5 text-white/20 cursor-not-allowed',
          )}
          whileHover={isConnected ? { scale: 1.03 } : {}}
          whileTap={isConnected ? { scale: 0.97 } : {}}
        >
          <Users className="w-3 h-3" />
          Create 3v3
        </motion.button>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
          </div>
        ) : battles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-8 h-8 text-white/10 mb-3" />
            <p className="text-white/25 text-sm font-pixel">No open team battles</p>
            <p className="text-white/15 text-xs mt-1">Create a 3v3 battle with your best team!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="frost-table arena-table w-full">
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>TEAM</th>
                  <th className="hidden sm:table-cell">AVG POWER</th>
                  <th>STAKE</th>
                  <th className="hidden sm:table-cell">TIME</th>
                  <th className="text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {battles.map((battle, i) => {
                  const avgPower = Math.round(
                    battle.creatorWarriors.reduce((sum, w) => sum + w.powerScore, 0) / 3
                  );
                  const stakeFormatted = formatEther(battle.stake);
                  const isMyBattle = currentAddress && battle.player1.toLowerCase() === currentAddress.toLowerCase();

                  return (
                    <motion.tr
                      key={battle.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="group"
                    >
                      <td>
                        <span className={cn(
                          'font-mono text-xs',
                          isMyBattle ? 'text-frost-cyan font-bold' : 'text-white/60',
                        )}>
                          {isMyBattle ? 'You' : shortenAddress(battle.player1)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {battle.creatorWarriors.map((w) => (
                            <WarriorImage
                              key={w.tokenId}
                              tokenId={w.tokenId}
                              element={w.element}
                              size={24}
                              className="rounded-md"
                            />
                          ))}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="font-mono text-xs text-white/70">{avgPower}</span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-frost-gold font-semibold">{stakeFormatted}</span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-[10px] text-white/30">{timeAgo(battle.createdAt)}</span>
                      </td>
                      <td className="text-right">
                        {isMyBattle ? (
                          <motion.button
                            onClick={() => onCancelBattle(battle.id)}
                            disabled={isCancelPending}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase transition-all inline-flex items-center gap-1',
                              !isCancelPending
                                ? 'bg-frost-red/10 text-frost-red border border-frost-red/20 hover:bg-frost-red/20'
                                : 'bg-white/5 text-white/20 cursor-not-allowed',
                            )}
                            whileHover={!isCancelPending ? { scale: 1.05 } : {}}
                            whileTap={!isCancelPending ? { scale: 0.95 } : {}}
                          >
                            {isCancelPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            Cancel
                          </motion.button>
                        ) : (
                          <motion.button
                            onClick={() => onFightClick(battle)}
                            disabled={!isConnected}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase transition-all inline-flex items-center gap-1',
                              isConnected
                                ? 'bg-frost-purple/10 text-frost-purple border border-frost-purple/20 hover:bg-frost-purple/20'
                                : 'bg-white/5 text-white/20 cursor-not-allowed',
                            )}
                            whileHover={isConnected ? { scale: 1.05 } : {}}
                            whileTap={isConnected ? { scale: 0.95 } : {}}
                          >
                            <Users className="w-3 h-3" />
                            Fight
                          </motion.button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Team Warrior Selection Drawer (3v3 multi-select)
 * ------------------------------------------------------------------------- */

function TeamWarriorSelectionDrawer({
  isOpen,
  mode,
  targetBattle,
  warriors,
  isLoadingWarriors,
  onClose,
  onCreateBattle,
  onJoinBattle,
  isWorking,
  isPending,
}: {
  isOpen: boolean;
  mode: 'create' | 'join';
  targetBattle: (TeamBattle & { creatorWarriors: Warrior[] }) | null;
  warriors: Warrior[];
  isLoadingWarriors: boolean;
  onClose: () => void;
  onCreateBattle: (team: Warrior[], stake: string) => void;
  onJoinBattle: (team: Warrior[], battle: TeamBattle & { creatorWarriors: Warrior[] }) => void;
  isWorking: boolean;
  isPending: boolean;
}) {
  const [selectedWarriors, setSelectedWarriors] = useState<Warrior[]>([]);
  const [stakeAmount, setStakeAmount] = useState(MIN_TEAM_BATTLE_STAKE);

  useEffect(() => {
    if (isOpen) {
      setSelectedWarriors([]);
      setStakeAmount(MIN_TEAM_BATTLE_STAKE);
    }
  }, [isOpen]);

  const toggleWarrior = useCallback((warrior: Warrior) => {
    setSelectedWarriors((prev) => {
      const exists = prev.find((w) => w.tokenId === warrior.tokenId);
      if (exists) return prev.filter((w) => w.tokenId !== warrior.tokenId);
      if (prev.length >= 3) return prev;
      return [...prev, warrior];
    });
  }, []);

  const isValidStake = useMemo(() => {
    const amount = parseFloat(stakeAmount);
    return !isNaN(amount) && amount >= parseFloat(MIN_TEAM_BATTLE_STAKE);
  }, [stakeAmount]);

  const teamReady = selectedWarriors.length === 3;

  const handleConfirm = useCallback(() => {
    if (!teamReady) return;
    if (mode === 'create') {
      if (!isValidStake) return;
      onCreateBattle(selectedWarriors, stakeAmount);
    } else if (targetBattle) {
      onJoinBattle(selectedWarriors, targetBattle);
    }
  }, [selectedWarriors, teamReady, mode, stakeAmount, isValidStake, targetBattle, onCreateBattle, onJoinBattle]);

  const stakeDisplay = mode === 'join' && targetBattle
    ? formatEther(targetBattle.stake)
    : stakeAmount;

  const avgPower = teamReady
    ? Math.round(selectedWarriors.reduce((sum, w) => sum + w.powerScore, 0) / 3)
    : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative w-full bg-frost-surface/95 backdrop-blur-xl border-t border-frost-purple/20 rounded-t-2xl max-h-[75vh] drawer-shadow flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/10" />
            </div>

            <div className="px-6 pb-3 border-b border-white/[0.06] flex-shrink-0">
              <h3 className="font-pixel text-sm text-white uppercase flex items-center gap-2">
                <Users className="w-4 h-4 text-frost-purple" />
                {mode === 'create' ? 'Create 3v3 Battle' : 'Choose Your Team'}
              </h3>
              <p className="text-[10px] text-white/30 mt-1">
                {mode === 'create'
                  ? `Select 3 warriors for your team (${selectedWarriors.length}/3)`
                  : targetBattle
                    ? `vs ${shortenAddress(targetBattle.player1)} — ${formatEther(targetBattle.stake)} AVAX`
                    : `Select 3 warriors (${selectedWarriors.length}/3)`
                }
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingWarriors ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
                </div>
              ) : warriors.length < 3 ? (
                <div className="text-center py-12">
                  <Shield className="w-10 h-10 text-white/15 mx-auto mb-3" />
                  <p className="text-white/30 text-sm font-pixel">Need at least 3 Warriors</p>
                  <p className="text-white/20 text-xs mt-1">Mint more warriors to create a team!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-pixel mb-3 block">
                      Select 3 Warriors ({selectedWarriors.length}/3)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[35vh] overflow-y-auto pr-1">
                      {warriors.map((w) => (
                        <WarriorMiniCard
                          key={w.tokenId}
                          warrior={w}
                          selected={!!selectedWarriors.find((sw) => sw.tokenId === w.tokenId)}
                          onClick={() => toggleWarrior(w)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col">
                    {mode === 'create' && (
                      <div className="mb-4">
                        <label className="text-[10px] uppercase tracking-wider text-white/40 font-pixel mb-2 block">
                          Stake Amount (AVAX)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={stakeAmount}
                            onChange={(e) => setStakeAmount(e.target.value)}
                            step="0.001"
                            min={MIN_TEAM_BATTLE_STAKE}
                            className={cn(
                              'w-full bg-white/[0.04] border rounded-xl px-4 py-3 font-mono text-white text-sm',
                              'focus:outline-none focus:ring-2 transition-all',
                              isValidStake
                                ? 'border-white/10 focus:ring-frost-purple/40 focus:border-frost-purple/40'
                                : 'border-frost-red/30 focus:ring-frost-red/40',
                            )}
                            placeholder={MIN_TEAM_BATTLE_STAKE}
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-mono">AVAX</span>
                        </div>
                        <p className="text-[9px] text-white/25 mt-1">Min: {MIN_TEAM_BATTLE_STAKE} AVAX</p>
                        <div className="flex gap-2 mt-2">
                          {['0.01', '0.05', '0.1', '0.5'].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setStakeAmount(amount)}
                              className={cn(
                                'flex-1 py-1.5 rounded-lg text-[10px] font-mono transition-all',
                                stakeAmount === amount
                                  ? 'bg-frost-purple/20 text-frost-purple border border-frost-purple/30'
                                  : 'bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06] hover:text-white/60',
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Team preview */}
                    {teamReady ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-4 mt-2"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-pixel text-xs text-white/60 uppercase">Your Team</span>
                          <span className="text-xs font-mono text-frost-purple">
                            Avg Power: {avgPower}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {selectedWarriors.map((w) => {
                            const el = getElement(w.element);
                            return (
                              <div key={w.tokenId} className="flex-1 text-center">
                                <WarriorImage
                                  tokenId={w.tokenId}
                                  element={w.element}
                                  size={48}
                                  className="rounded-lg mx-auto ring-1 ring-white/10"
                                />
                                <div className="text-[10px] font-mono text-white mt-1">#{w.tokenId}</div>
                                <div className={cn('text-[9px] font-semibold bg-gradient-to-r bg-clip-text text-transparent', el.color)}>
                                  {el.name}
                                </div>
                                <div className="text-[10px] font-mono text-white/50">{w.powerScore}</div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    ) : (
                      <div className="glass-card p-6 mt-2 flex items-center justify-center h-[120px]">
                        <p className="text-white/20 text-xs text-center font-pixel">
                          Select 3 warriors to see team preview
                        </p>
                      </div>
                    )}

                    <motion.button
                      onClick={handleConfirm}
                      disabled={!teamReady || (mode === 'create' && !isValidStake) || isWorking}
                      className={cn(
                        'mt-4 w-full py-3.5 rounded-xl font-pixel font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2',
                        teamReady && (mode === 'join' || isValidStake) && !isWorking
                          ? 'bg-gradient-to-r from-frost-purple to-frost-pink text-white shadow-lg hover:shadow-frost-purple/20'
                          : 'bg-white/5 text-white/20 cursor-not-allowed',
                      )}
                      whileHover={teamReady && !isWorking ? { scale: 1.02 } : {}}
                      whileTap={teamReady && !isWorking ? { scale: 0.98 } : {}}
                    >
                      {isWorking ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {isPending ? 'Confirm in Wallet...' : mode === 'create' ? 'Creating 3v3...' : 'Joining 3v3...'}
                        </>
                      ) : (
                        <>
                          <Users className="w-4 h-4" />
                          {mode === 'create'
                            ? `Create 3v3 (${stakeDisplay} AVAX)`
                            : `Fight 3v3 (${stakeDisplay} AVAX)`
                          }
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Team Battle Result Modal (3v3)
 * ------------------------------------------------------------------------- */

function TeamBattleResultModal({
  isOpen,
  onClose,
  battle,
  myWarriors,
  theirWarriors,
  isWinner,
}: {
  isOpen: boolean;
  onClose: () => void;
  battle: TeamBattle;
  myWarriors: Warrior[];
  theirWarriors: Warrior[];
  isWinner: boolean;
}) {
  const stakeAmount = formatEther(battle.stake);
  const isPlayer1 = battle.winner === battle.player1 ? isWinner : !isWinner;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative w-full max-w-2xl glass-card p-6 sm:p-8 overflow-hidden"
            initial={{ scale: 0.8, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {isWinner && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      background: ['#ff2020', '#ff6b6b', '#ffffff', '#ffd700', '#00ff88'][i % 5],
                      left: `${Math.random() * 100}%`,
                      top: `-5%`,
                    }}
                    animate={{
                      y: ['0vh', `${60 + Math.random() * 40}vh`],
                      x: [0, (Math.random() - 0.5) * 200],
                      rotate: [0, Math.random() * 720],
                      opacity: [1, 0],
                    }}
                    transition={{
                      duration: 2 + Math.random() * 2,
                      delay: Math.random() * 0.8,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </div>
            )}

            <motion.div
              className="text-center mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
            >
              {isWinner ? (
                <>
                  <Trophy className="w-12 h-12 text-frost-gold mx-auto mb-2" />
                  <h2 className="font-pixel text-3xl sm:text-4xl font-black text-frost-gold text-glow-green">
                    TEAM VICTORY!
                  </h2>
                  <p className="text-frost-green text-sm mt-1 font-semibold">
                    +{stakeAmount} AVAX earned
                  </p>
                </>
              ) : (
                <>
                  <Shield className="w-12 h-12 text-frost-red mx-auto mb-2" />
                  <h2 className="font-pixel text-3xl sm:text-4xl font-black text-frost-red">
                    TEAM DEFEAT
                  </h2>
                  <p className="text-white/40 text-sm mt-1">-{stakeAmount} AVAX</p>
                </>
              )}
            </motion.div>

            {/* Score */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <span className={cn(
                'font-pixel text-4xl font-black',
                (isPlayer1 ? battle.score1 >= battle.score2 : battle.score2 >= battle.score1) ? 'text-frost-green' : 'text-frost-red',
              )}>
                {isPlayer1 ? battle.score1 : battle.score2}
              </span>
              <span className="font-pixel text-xl text-white/30">—</span>
              <span className={cn(
                'font-pixel text-4xl font-black',
                (isPlayer1 ? battle.score2 >= battle.score1 : battle.score1 >= battle.score2) ? 'text-frost-green' : 'text-frost-red',
              )}>
                {isPlayer1 ? battle.score2 : battle.score1}
              </span>
            </div>

            {/* Round Matchups */}
            <motion.div
              className="bg-white/[0.03] rounded-xl p-4 mb-6 border border-white/5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <h4 className="font-pixel text-xs uppercase tracking-wider text-white/40 mb-3">
                Round Matchups
              </h4>
              <div className="space-y-3">
                {battle.matchups.map((team2Idx, round) => {
                  const myW = myWarriors[round];
                  const theirW = theirWarriors[team2Idx];
                  if (!myW || !theirW) return null;
                  const myEl = getElement(myW.element);
                  const theirEl = getElement(theirW.element);

                  return (
                    <div key={round} className="flex items-center gap-3 text-xs">
                      <span className="text-white/30 font-pixel w-12">R{round + 1}</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        <WarriorImage tokenId={myW.tokenId} element={myW.element} size={24} className="rounded-md" />
                        <span className="font-mono text-white">#{myW.tokenId}</span>
                        <span className={cn('text-[9px] bg-gradient-to-r bg-clip-text text-transparent', myEl.color)}>
                          {myEl.name}
                        </span>
                      </div>
                      <span className="text-white/20 font-pixel">VS</span>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <span className={cn('text-[9px] bg-gradient-to-r bg-clip-text text-transparent', theirEl.color)}>
                          {theirEl.name}
                        </span>
                        <span className="font-mono text-white">#{theirW.tokenId}</span>
                        <WarriorImage tokenId={theirW.tokenId} element={theirW.element} size={24} className="rounded-md" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            <motion.button
              onClick={onClose}
              className="w-full btn-primary text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isWinner ? 'Claim Victory' : 'Return to Frostbite'}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------
 * Compact Team Battle History
 * ------------------------------------------------------------------------- */

function CompactTeamBattleHistory({
  history,
  isConnected,
  isLoading,
  onViewResult,
  currentAddress,
}: {
  history: (TeamBattle & { myWarriors: Warrior[]; theirWarriors: Warrior[] })[];
  isConnected: boolean;
  isLoading: boolean;
  onViewResult: (battle: TeamBattle & { myWarriors: Warrior[]; theirWarriors: Warrior[] }) => void;
  currentAddress?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!isConnected) return null;

  return (
    <div className="px-4 sm:px-6 pb-4 flex-shrink-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-2 text-left group"
      >
        <Trophy className="w-3.5 h-3.5 text-frost-purple" />
        <span className="font-pixel text-[10px] text-white/50 uppercase">
          Team History ({history.length})
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-white/30 transition-transform ml-auto',
            expanded && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-frost-cyan animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-white/20 text-xs font-pixel">No team battles yet</p>
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <table className="frost-table arena-table w-full">
                  <thead>
                    <tr>
                      <th>Battle</th>
                      <th>Opponent</th>
                      <th>Score</th>
                      <th className="text-right">Stake</th>
                      <th className="text-center">Result</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((battle, i) => {
                      const isWinner = currentAddress
                        ? battle.winner.toLowerCase() === currentAddress.toLowerCase()
                        : false;
                      const isPlayer1 = currentAddress
                        ? battle.player1.toLowerCase() === currentAddress.toLowerCase()
                        : true;
                      const opponent = isPlayer1 ? battle.player2 : battle.player1;
                      const myScore = isPlayer1 ? battle.score1 : battle.score2;
                      const theirScore = isPlayer1 ? battle.score2 : battle.score1;

                      return (
                        <motion.tr
                          key={battle.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.03 * i }}
                          className="cursor-pointer"
                          onClick={() => onViewResult(battle)}
                        >
                          <td>
                            <span className="font-mono text-xs text-frost-purple font-bold">#{battle.id}</span>
                          </td>
                          <td>
                            <span className="font-mono text-xs text-white/60">{shortenAddress(opponent)}</span>
                          </td>
                          <td>
                            <span className="font-mono text-xs text-white font-bold">
                              {myScore}—{theirScore}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="font-mono text-xs text-frost-gold font-semibold">
                              {formatEther(battle.stake)}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                              isWinner
                                ? 'bg-frost-green/10 text-frost-green ring-1 ring-frost-green/20'
                                : 'bg-frost-red/10 text-frost-red ring-1 ring-frost-red/20',
                            )}>
                              {isWinner ? (
                                <><Trophy className="w-2.5 h-2.5" /> Win</>
                              ) : (
                                <><Shield className="w-2.5 h-2.5" /> Loss</>
                              )}
                            </span>
                          </td>
                          <td>
                            <ArrowRight className="w-3 h-3 text-white/20" />
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Page Component
 * ------------------------------------------------------------------------- */

export default function BattlePage() {
  const { address, isConnected } = useAccount();

  // Tab state
  const [activeTab, setActiveTab] = useState<'1v1' | '3v3'>('1v1');

  // 1v1 Modal state
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedBattleResult, setSelectedBattleResult] = useState<
    (Battle & { myWarrior: Warrior; theirWarrior: Warrior }) | null
  >(null);

  // 1v1 Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'join'>('create');
  const [targetBattle, setTargetBattle] = useState<(Battle & { creatorWarrior: Warrior }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 3v3 state
  const [teamDrawerOpen, setTeamDrawerOpen] = useState(false);
  const [teamDrawerMode, setTeamDrawerMode] = useState<'create' | 'join'>('create');
  const [targetTeamBattle, setTargetTeamBattle] = useState<(TeamBattle & { creatorWarriors: Warrior[] }) | null>(null);
  const [showTeamResultModal, setShowTeamResultModal] = useState(false);
  const [selectedTeamBattleResult, setSelectedTeamBattleResult] = useState<
    (TeamBattle & { myWarriors: Warrior[]; theirWarriors: Warrior[] }) | null
  >(null);

  // Data
  const {
    warriors,
    openBattles,
    battleHistory,
    isLoadingWarriors,
    isLoadingBattles,
    isLoadingHistory,
    refetch,
  } = useBattleData(address, isConnected);

  const {
    openTeamBattles,
    teamBattleHistory,
    isLoadingTeamBattles,
    isLoadingTeamHistory,
    refetch: refetchTeam,
  } = useTeamBattleData(address, isConnected);

  // 1v1 Contract writes
  const {
    writeContract: createBattle,
    data: createTxHash,
    isPending: isCreatePending,
    error: createError,
    reset: resetCreate,
  } = useWriteContract();

  const {
    writeContract: joinBattle,
    data: joinTxHash,
    isPending: isJoinPending,
    error: joinError,
    reset: resetJoin,
  } = useWriteContract();

  const {
    writeContract: cancelBattleContract,
    data: cancelTxHash,
    isPending: isCancelPending,
    error: cancelError,
    reset: resetCancel,
  } = useWriteContract();

  // 3v3 Contract writes
  const {
    writeContract: createTeamBattle,
    data: createTeamTxHash,
    isPending: isCreateTeamPending,
    error: createTeamError,
    reset: resetCreateTeam,
  } = useWriteContract();

  const {
    writeContract: joinTeamBattle,
    data: joinTeamTxHash,
    isPending: isJoinTeamPending,
    error: joinTeamError,
    reset: resetJoinTeam,
  } = useWriteContract();

  const {
    writeContract: cancelTeamBattleContract,
    data: cancelTeamTxHash,
    isPending: isCancelTeamPending,
    error: cancelTeamError,
    reset: resetCancelTeam,
  } = useWriteContract();

  const { isLoading: isCreateConfirming, isSuccess: isCreateSuccess } =
    useWaitForTransactionReceipt({ hash: createTxHash });

  const { isLoading: isJoinConfirming, isSuccess: isJoinSuccess } =
    useWaitForTransactionReceipt({ hash: joinTxHash });

  const { isLoading: isCancelConfirming, isSuccess: isCancelSuccess } =
    useWaitForTransactionReceipt({ hash: cancelTxHash });

  const { isLoading: isCreateTeamConfirming, isSuccess: isCreateTeamSuccess } =
    useWaitForTransactionReceipt({ hash: createTeamTxHash });

  const { isLoading: isJoinTeamConfirming, isSuccess: isJoinTeamSuccess } =
    useWaitForTransactionReceipt({ hash: joinTeamTxHash });

  const { isLoading: isCancelTeamConfirming, isSuccess: isCancelTeamSuccess } =
    useWaitForTransactionReceipt({ hash: cancelTeamTxHash });

  // 1v1 Success handlers
  useEffect(() => {
    if (isCreateSuccess) {
      setDrawerOpen(false);
      setError(null);
      resetCreate();
      setTimeout(() => refetch(), 2000);
    }
  }, [isCreateSuccess, resetCreate, refetch]);

  useEffect(() => {
    if (isJoinSuccess) {
      setDrawerOpen(false);
      setTargetBattle(null);
      setError(null);
      resetJoin();
      setTimeout(() => refetch(), 2000);
    }
  }, [isJoinSuccess, resetJoin, refetch]);

  useEffect(() => {
    if (isCancelSuccess) {
      setError(null);
      resetCancel();
      setTimeout(() => refetch(), 2000);
    }
  }, [isCancelSuccess, resetCancel, refetch]);

  // 3v3 Success handlers
  useEffect(() => {
    if (isCreateTeamSuccess) {
      setTeamDrawerOpen(false);
      setError(null);
      resetCreateTeam();
      setTimeout(() => refetchTeam(), 2000);
    }
  }, [isCreateTeamSuccess, resetCreateTeam, refetchTeam]);

  useEffect(() => {
    if (isJoinTeamSuccess) {
      setTeamDrawerOpen(false);
      setTargetTeamBattle(null);
      setError(null);
      resetJoinTeam();
      setTimeout(() => refetchTeam(), 2000);
    }
  }, [isJoinTeamSuccess, resetJoinTeam, refetchTeam]);

  useEffect(() => {
    if (isCancelTeamSuccess) {
      setError(null);
      resetCancelTeam();
      setTimeout(() => refetchTeam(), 2000);
    }
  }, [isCancelTeamSuccess, resetCancelTeam, refetchTeam]);

  // Error handlers
  useEffect(() => {
    const err = createError || joinError || cancelError || createTeamError || joinTeamError || cancelTeamError;
    if (err) {
      const msg = err.message || 'Transaction failed';
      if (msg.includes('InsufficientStake')) {
        setError(`Minimum stake is ${activeTab === '3v3' ? MIN_TEAM_BATTLE_STAKE : MIN_BATTLE_STAKE} AVAX`);
      } else if (msg.includes('NotWarriorOwner') || msg.includes('NotOwner') || msg.includes('NotNFTOwner')) {
        setError('You do not own this warrior');
      } else if (msg.includes('DuplicateTokenIds')) {
        setError('All 3 warriors must be different');
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) {
        setError('Insufficient AVAX balance');
      } else if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction cancelled');
      } else {
        const short = (err as { shortMessage?: string }).shortMessage;
        setError(short || 'Failed — please try again');
      }
    }
  }, [createError, joinError, cancelError, createTeamError, joinTeamError, cancelTeamError, activeTab]);

  // 1v1 Handlers
  const handleViewResult = useCallback(
    (battle: Battle & { myWarrior: Warrior; theirWarrior: Warrior }) => {
      setSelectedBattleResult(battle);
      setShowResultModal(true);
    },
    [],
  );

  const handleCreateClick = useCallback(() => {
    setDrawerMode('create');
    setTargetBattle(null);
    setError(null);
    setDrawerOpen(true);
  }, []);

  const handleFightClick = useCallback((battle: Battle & { creatorWarrior: Warrior }) => {
    setDrawerMode('join');
    setTargetBattle(battle);
    setError(null);
    setDrawerOpen(true);
  }, []);

  const handleCreateBattle = useCallback(
    (warrior: Warrior, stake: string) => {
      setError(null);
      createBattle({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'createBattle',
        args: [BigInt(warrior.tokenId), '0x' as `0x${string}`],
        value: parseEther(stake),
        chainId: FUJI_CHAIN_ID,
      });
    },
    [createBattle],
  );

  const handleJoinBattle = useCallback(
    (warrior: Warrior, battle: Battle & { creatorWarrior: Warrior }) => {
      setError(null);
      joinBattle({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'joinBattle',
        args: [BigInt(battle.id), BigInt(warrior.tokenId), '0x' as `0x${string}`],
        value: battle.stake,
        chainId: FUJI_CHAIN_ID,
      });
    },
    [joinBattle],
  );

  const handleCancelBattle = useCallback(
    (battleId: number) => {
      setError(null);
      cancelBattleContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'cancelBattle',
        args: [BigInt(battleId)],
        chainId: FUJI_CHAIN_ID,
      });
    },
    [cancelBattleContract],
  );

  // 3v3 Handlers
  const handleTeamCreateClick = useCallback(() => {
    setTeamDrawerMode('create');
    setTargetTeamBattle(null);
    setError(null);
    setTeamDrawerOpen(true);
  }, []);

  const handleTeamFightClick = useCallback((battle: TeamBattle & { creatorWarriors: Warrior[] }) => {
    setTeamDrawerMode('join');
    setTargetTeamBattle(battle);
    setError(null);
    setTeamDrawerOpen(true);
  }, []);

  const handleCreateTeamBattle = useCallback(
    (team: Warrior[], stake: string) => {
      setError(null);
      const tokenIds = team.map((w) => BigInt(w.tokenId)) as [bigint, bigint, bigint];
      createTeamBattle({
        address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
        abi: TEAM_BATTLE_ABI,
        functionName: 'createTeamBattle',
        args: [tokenIds, '0x' as `0x${string}`],
        value: parseEther(stake),
        chainId: FUJI_CHAIN_ID,
      });
    },
    [createTeamBattle],
  );

  const handleJoinTeamBattle = useCallback(
    (team: Warrior[], battle: TeamBattle & { creatorWarriors: Warrior[] }) => {
      setError(null);
      const tokenIds = team.map((w) => BigInt(w.tokenId)) as [bigint, bigint, bigint];
      joinTeamBattle({
        address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
        abi: TEAM_BATTLE_ABI,
        functionName: 'joinTeamBattle',
        args: [BigInt(battle.id), tokenIds, '0x' as `0x${string}`],
        value: battle.stake,
        chainId: FUJI_CHAIN_ID,
      });
    },
    [joinTeamBattle],
  );

  const handleCancelTeamBattle = useCallback(
    (battleId: number) => {
      setError(null);
      cancelTeamBattleContract({
        address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
        abi: TEAM_BATTLE_ABI,
        functionName: 'cancelTeamBattle',
        args: [BigInt(battleId)],
        chainId: FUJI_CHAIN_ID,
      });
    },
    [cancelTeamBattleContract],
  );

  const handleViewTeamResult = useCallback(
    (battle: TeamBattle & { myWarriors: Warrior[]; theirWarriors: Warrior[] }) => {
      setSelectedTeamBattleResult(battle);
      setShowTeamResultModal(true);
    },
    [],
  );

  const isWorking = isCreatePending || isCreateConfirming || isJoinPending || isJoinConfirming;
  const isTeamWorking = isCreateTeamPending || isCreateTeamConfirming || isJoinTeamPending || isJoinTeamConfirming;

  if (!isConnected) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <ArenaBackground />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center max-w-md"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-frost-cyan/20 to-frost-purple/20 border border-frost-cyan/20 flex items-center justify-center">
            <Swords className="w-10 h-10 text-frost-cyan" />
          </div>
          <h2 className="font-pixel text-2xl text-white mb-3">FROST ARENA</h2>
          <p className="text-white/40 text-sm mb-8 leading-relaxed">
            Connect your wallet to enter the arena. Battle other warriors, stake AVAX, and climb the leaderboard.
          </p>
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-frost-cyan/10 border border-frost-cyan/30 text-frost-cyan font-pixel text-sm">
            <Wallet className="w-4 h-4" />
            Connect Wallet Above to Enter
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-white/20 text-xs font-pixel mb-1">BATTLES</div>
              <div className="text-white/30 font-mono text-lg">---</div>
            </div>
            <div className="text-center">
              <div className="text-white/20 text-xs font-pixel mb-1">WARRIORS</div>
              <div className="text-white/30 font-mono text-lg">---</div>
            </div>
            <div className="text-center">
              <div className="text-white/20 text-xs font-pixel mb-1">VOLUME</div>
              <div className="text-white/30 font-mono text-lg">---</div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col relative overflow-hidden">
      <ArenaBackground />

      {/* Stats Bar */}
      <ArenaStatsBar
        openBattles={openBattles}
        battleHistory={battleHistory}
        currentAddress={address}
      />

      {/* Tab Selector */}
      <div className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b border-white/[0.06] flex-shrink-0 relative z-10">
        <button
          onClick={() => setActiveTab('1v1')}
          className={cn(
            'px-4 py-1.5 rounded-lg font-pixel text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5',
            activeTab === '1v1'
              ? 'bg-frost-cyan/15 text-frost-cyan border border-frost-cyan/30'
              : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]',
          )}
        >
          <Sword className="w-3 h-3" />
          1v1 Duel
        </button>
        <button
          onClick={() => setActiveTab('3v3')}
          className={cn(
            'px-4 py-1.5 rounded-lg font-pixel text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5',
            activeTab === '3v3'
              ? 'bg-frost-purple/15 text-frost-purple border border-frost-purple/30'
              : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]',
          )}
        >
          <Users className="w-3 h-3" />
          3v3 Team
        </button>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 text-frost-red text-xs bg-frost-red/10 backdrop-blur-sm border border-frost-red/20 rounded-lg px-4 py-2"
          >
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 text-white/40 hover:text-white/60">
              <XCircle className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content: Sidebar + Arena */}
      <div className="flex-1 flex min-h-0 relative z-10">
        {/* Battle Feed Sidebar (desktop only) */}
        <BattleFeedSidebar
          openBattles={openBattles}
          battleHistory={battleHistory}
          currentAddress={address}
        />

        {/* Center Arena */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeTab === '1v1' ? (
            <>
              <ArenaTable
                battles={openBattles}
                isLoading={isLoadingBattles}
                isConnected={isConnected}
                currentAddress={address}
                onCreateClick={handleCreateClick}
                onFightClick={handleFightClick}
                onCancelBattle={handleCancelBattle}
                isCancelPending={isCancelPending || isCancelConfirming}
              />
              <CompactBattleHistory
                history={battleHistory}
                isConnected={isConnected}
                isLoading={isLoadingHistory}
                onViewResult={handleViewResult}
                currentAddress={address}
              />
            </>
          ) : (
            <>
              <TeamArenaTable
                battles={openTeamBattles}
                isLoading={isLoadingTeamBattles}
                isConnected={isConnected}
                currentAddress={address}
                onCreateClick={handleTeamCreateClick}
                onFightClick={handleTeamFightClick}
                onCancelBattle={handleCancelTeamBattle}
                isCancelPending={isCancelTeamPending || isCancelTeamConfirming}
              />
              <CompactTeamBattleHistory
                history={teamBattleHistory}
                isConnected={isConnected}
                isLoading={isLoadingTeamHistory}
                onViewResult={handleViewTeamResult}
                currentAddress={address}
              />
            </>
          )}
        </div>
      </div>

      {/* 1v1 Warrior Selection Drawer */}
      <WarriorSelectionDrawer
        isOpen={drawerOpen}
        mode={drawerMode}
        targetBattle={targetBattle}
        warriors={warriors}
        isLoadingWarriors={isLoadingWarriors}
        onClose={() => {
          setDrawerOpen(false);
          setTargetBattle(null);
        }}
        onCreateBattle={handleCreateBattle}
        onJoinBattle={handleJoinBattle}
        isWorking={isWorking}
        isPending={isCreatePending || isJoinPending}
      />

      {/* 3v3 Team Warrior Selection Drawer */}
      <TeamWarriorSelectionDrawer
        isOpen={teamDrawerOpen}
        mode={teamDrawerMode}
        targetBattle={targetTeamBattle}
        warriors={warriors}
        isLoadingWarriors={isLoadingWarriors}
        onClose={() => {
          setTeamDrawerOpen(false);
          setTargetTeamBattle(null);
        }}
        onCreateBattle={handleCreateTeamBattle}
        onJoinBattle={handleJoinTeamBattle}
        isWorking={isTeamWorking}
        isPending={isCreateTeamPending || isJoinTeamPending}
      />

      {/* 1v1 Battle Result Modal */}
      {selectedBattleResult && (
        <BattleResultModal
          isOpen={showResultModal}
          onClose={() => {
            setShowResultModal(false);
            setSelectedBattleResult(null);
          }}
          myWarrior={selectedBattleResult.myWarrior}
          theirWarrior={selectedBattleResult.theirWarrior}
          isWinner={
            address
              ? selectedBattleResult.winner.toLowerCase() === address.toLowerCase()
              : false
          }
          stakeAmount={formatEther(selectedBattleResult.stake)}
        />
      )}

      {/* 3v3 Team Battle Result Modal */}
      {selectedTeamBattleResult && (
        <TeamBattleResultModal
          isOpen={showTeamResultModal}
          onClose={() => {
            setShowTeamResultModal(false);
            setSelectedTeamBattleResult(null);
          }}
          battle={selectedTeamBattleResult}
          myWarriors={selectedTeamBattleResult.myWarriors}
          theirWarriors={selectedTeamBattleResult.theirWarriors}
          isWinner={
            address
              ? selectedTeamBattleResult.winner.toLowerCase() === address.toLowerCase()
              : false
          }
        />
      )}
    </div>
  );
}
