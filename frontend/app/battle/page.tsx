'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  CheckCircle,
  Coins,
  RefreshCw,
  Users,
  Layers,
} from 'lucide-react';
import { ELEMENTS, MIN_BATTLE_STAKE, MIN_TEAM_BATTLE_STAKE, ELEMENT_ADVANTAGES, CONTRACT_ADDRESSES, ACTIVE_CHAIN_ID } from '@/lib/constants';
import { BATTLE_ENGINE_ABI, TEAM_BATTLE_ABI, FROSTBITE_WARRIOR_ABI, QUEST_ENGINE_ABI, MARKETPLACE_ABI } from '@/lib/contracts';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { cn, shortenAddress } from '@/lib/utils';
import { useOnContractEvent } from '@/hooks/useContractEvents';

const BATTLE_TAUNTS = [
  'Ready to rumble!',
  'Seeking glory',
  'Bring it on!',
  'No mercy',
  'Born to fight',
  'Unstoppable',
  'Fear me',
  'Victory awaits',
  'Let\'s dance',
  'Come at me',
  'Full power',
  'All in',
  'To the death',
  'Show me what you got',
  'Feeling lucky?',
  'Warrior spirit',
  'Blood & ice',
  'Frost fury',
  'Locked & loaded',
  'Challenge accepted',
];

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

// Neon color mapping for battle animation — bright saturated colors per element
const NEON_COLORS: Record<number, string> = {
  0: '#ff4400', // Fire - neon orange-red
  1: '#00aaff', // Water - neon blue
  2: '#00ff88', // Wind - neon green
  3: '#00f0ff', // Ice - neon cyan
  4: '#ffaa00', // Earth - neon amber
  5: '#ffe600', // Thunder - neon yellow
  6: '#dd00ff', // Shadow - neon purple
  7: '#ffcc00', // Light - neon gold
};
function getNeonColor(elementId: number) {
  return NEON_COLORS[elementId] ?? '#00d4ff';
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
  const team1Raw = Array.isArray(raw[3]) ? raw[3] : [];
  const team2Raw = Array.isArray(raw[4]) ? raw[4] : [];
  const matchupsRaw = Array.isArray(raw[8]) ? raw[8] : [];
  return {
    id: Number(raw[0] ?? 0),
    player1: String(raw[1] ?? ''),
    player2: String(raw[2] ?? ''),
    team1: [Number(team1Raw[0] ?? 0), Number(team1Raw[1] ?? 0), Number(team1Raw[2] ?? 0)],
    team2: [Number(team2Raw[0] ?? 0), Number(team2Raw[1] ?? 0), Number(team2Raw[2] ?? 0)],
    stake: BigInt(String(raw[5] ?? 0)),
    score1: Number(raw[6] ?? 0),
    score2: Number(raw[7] ?? 0),
    matchups: [Number(matchupsRaw[0] ?? 0), Number(matchupsRaw[1] ?? 0), Number(matchupsRaw[2] ?? 0)],
    winner: String(raw[9] ?? ''),
    resolved: Boolean(raw[10] ?? false),
    createdAt: Number(raw[11] ?? 0),
    resolvedAt: Number(raw[12] ?? 0),
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
        className="w-full h-full object-cover warrior-idle"
        style={{ animationDelay: `${(tokenId % 5) * 0.3}s` }}
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

        const results = await Promise.allSettled(
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
        const parsed: Warrior[] = [];
        for (let i = 0; i < results.length; i++) {
          if (results[i].status === 'fulfilled') {
            parsed.push(parseWarriorData((results[i] as PromiseFulfilledResult<unknown>).value as Record<string, unknown>, Number(ids[i])));
          }
        }
        setWarriors(parsed.sort((a, b) => b.powerScore - a.powerScore));
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
        const battleResults = await Promise.allSettled(
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
        const battles: ReturnType<typeof parseBattleData>[] = [];
        for (const r of battleResults) {
          if (r.status === 'fulfilled') {
            battles.push(parseBattleData(r.value as Record<string, unknown>));
          }
        }

        // Fetch warrior data for each battle creator
        const defaultW: Warrior = { tokenId: 0, attack: 0, defense: 0, speed: 0, element: 0, specialPower: 0, level: 0, experience: 0, battleWins: 0, battleLosses: 0, powerScore: 0 };
        const warriorDetails = await Promise.allSettled(
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

        // Validate NFT ownership — filter out stale battles where player1 no longer owns the NFT
        const ownerChecks = await Promise.allSettled(
          battles.map((b) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'ownerOf',
              args: [BigInt(b.nft1)],
            })
          )
        );

        if (cancelled) return;
        const validBattles: typeof battles = [];
        const validWarriorDetails: typeof warriorDetails = [];
        battles.forEach((b, i) => {
          const ownerResult = ownerChecks[i];
          if (ownerResult.status === 'fulfilled' && (ownerResult.value as string).toLowerCase() === b.player1.toLowerCase()) {
            validBattles.push(b);
            validWarriorDetails.push(warriorDetails[i]);
          }
        });

        setOpenBattles(
          validBattles.map((b, i) => ({
            ...b,
            creatorWarrior: validWarriorDetails[i].status === 'fulfilled'
              ? parseWarriorData((validWarriorDetails[i] as PromiseFulfilledResult<unknown>).value as Record<string, unknown>, b.nft1)
              : { ...defaultW, tokenId: b.nft1 },
          })).sort((a, b) => b.createdAt - a.createdAt)
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

        const battleResults = await Promise.allSettled(
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
        const battles: ReturnType<typeof parseBattleData>[] = [];
        for (const r of battleResults) {
          if (r.status === 'fulfilled') battles.push(parseBattleData(r.value as Record<string, unknown>));
        }

        // Collect all unique NFT IDs to fetch warrior data
        const nftIds = new Set<number>();
        battles.forEach((b) => {
          if (b.nft1 > 0) nftIds.add(b.nft1);
          if (b.nft2 > 0) nftIds.add(b.nft2);
        });

        const nftIdArray = Array.from(nftIds);
        const warriorResults = await Promise.allSettled(
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
        const defaultWarrior: Warrior = {
          tokenId: 0, attack: 0, defense: 0, speed: 0, element: 0,
          specialPower: 0, level: 0, experience: 0, battleWins: 0, battleLosses: 0, powerScore: 0,
        };
        const warriorMap = new Map<number, Warrior>();
        nftIdArray.forEach((id, i) => {
          const r = warriorResults[i];
          if (r.status === 'fulfilled') {
            warriorMap.set(id, parseWarriorData(r.value as Record<string, unknown>, id));
          }
        });

        setBattleHistory(
          battles
            .filter((b) => b.resolved)
            .map((b) => {
              const isPlayer1 = b.player1.toLowerCase() === address!.toLowerCase();
              return {
                ...b,
                myWarrior: warriorMap.get(isPlayer1 ? b.nft1 : b.nft2) ?? { ...defaultWarrior, tokenId: isPlayer1 ? b.nft1 : b.nft2 },
                theirWarrior: warriorMap.get(isPlayer1 ? b.nft2 : b.nft1) ?? { ...defaultWarrior, tokenId: isPlayer1 ? b.nft2 : b.nft1 },
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

  // Auto-refetch when battle events arrive from the chain
  useOnContractEvent(
    ['BattleCreated', 'BattleJoined', 'BattleResolved', 'BattleCancelled'],
    refetch,
  );

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

        const teamBattleResults = await Promise.allSettled(
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
        const battles: ReturnType<typeof parseTeamBattleData>[] = [];
        for (const r of teamBattleResults) {
          if (r.status === 'fulfilled') {
            battles.push(parseTeamBattleData(r.value as readonly unknown[]));
          }
        }

        // Fetch warrior data for each battle's team1
        const allNftIds = new Set<number>();
        battles.forEach((b) => b.team1.forEach((id) => { if (id > 0) allNftIds.add(id); }));

        const nftIdArray = Array.from(allNftIds);
        const warriorResults = await Promise.allSettled(
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
        const defaultW: Warrior = { tokenId: 0, attack: 0, defense: 0, speed: 0, element: 0, specialPower: 0, level: 0, experience: 0, battleWins: 0, battleLosses: 0, powerScore: 0 };
        const warriorMap = new Map<number, Warrior>();
        nftIdArray.forEach((id, i) => {
          const r = warriorResults[i];
          if (r.status === 'fulfilled') {
            warriorMap.set(id, parseWarriorData(r.value as Record<string, unknown>, id));
          }
        });

        // Validate NFT ownership — filter out stale battles where player1 no longer owns team NFTs
        const ownershipChecks = await Promise.allSettled(
          nftIdArray.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'ownerOf',
              args: [BigInt(id)],
            })
          )
        );

        if (cancelled) return;
        const ownerMap = new Map<number, string>();
        nftIdArray.forEach((id, i) => {
          const r = ownershipChecks[i];
          if (r.status === 'fulfilled') {
            ownerMap.set(id, (r.value as string).toLowerCase());
          }
        });

        const validBattles = battles.filter((b) =>
          b.team1.every((id) => id === 0 || ownerMap.get(id) === b.player1.toLowerCase())
        );

        setOpenTeamBattles(
          validBattles.map((b) => ({
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

        const battleResults = await Promise.allSettled(
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
        const battles: ReturnType<typeof parseTeamBattleData>[] = [];
        for (const r of battleResults) {
          if (r.status === 'fulfilled') battles.push(parseTeamBattleData(r.value as readonly unknown[]));
        }

        // Collect all NFT IDs
        const nftIds = new Set<number>();
        battles.forEach((b) => {
          b.team1.forEach((id) => { if (id > 0) nftIds.add(id); });
          b.team2.forEach((id) => { if (id > 0) nftIds.add(id); });
        });

        const nftIdArray = Array.from(nftIds);
        const warriorResults = await Promise.allSettled(
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
        const defaultW: Warrior = { tokenId: 0, attack: 0, defense: 0, speed: 0, element: 0, specialPower: 0, level: 0, experience: 0, battleWins: 0, battleLosses: 0, powerScore: 0 };
        const warriorMap = new Map<number, Warrior>();
        nftIdArray.forEach((id, i) => {
          const r = warriorResults[i];
          if (r.status === 'fulfilled') {
            warriorMap.set(id, parseWarriorData(r.value as Record<string, unknown>, id));
          }
        });

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

  // Auto-refetch when team battle events arrive from the chain
  useOnContractEvent(
    ['TeamBattleCreated', 'TeamBattleJoined', 'TeamBattleResolved', 'TeamBattleCancelled'],
    refetch,
  );

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
  animationDelay = 0,
}: {
  warrior: Warrior;
  selected?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
  animationDelay?: number;
}) {
  const element = getElement(warrior.element);
  const isSmall = size === 'small';

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 15, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: animationDelay,
        duration: 0.3,
        ease: 'easeOut',
      }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        'relative rounded-xl text-left transition-all overflow-hidden',
        isSmall ? 'p-2.5' : 'p-3',
        selected
          ? 'ring-2 ring-frost-cyan shadow-glow-cyan'
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
        <>
          <motion.div
            layoutId="warrior-selected"
            className="absolute inset-0 rounded-xl ring-2 ring-frost-cyan pointer-events-none"
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
          {/* Pulsing glow ring on selected warrior */}
          <motion.div
            className="absolute inset-0 rounded-xl pointer-events-none"
            animate={{
              boxShadow: [
                '0 0 8px rgba(0,255,255,0.2), inset 0 0 8px rgba(0,255,255,0.05)',
                '0 0 20px rgba(0,255,255,0.4), inset 0 0 15px rgba(0,255,255,0.1)',
                '0 0 8px rgba(0,255,255,0.2), inset 0 0 8px rgba(0,255,255,0.05)',
              ],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </>
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
  onClaimPayout,
  isClaiming,
  isClaimSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  myWarrior: Warrior;
  theirWarrior: Warrior;
  isWinner: boolean;
  stakeAmount: string;
  onClaimPayout?: () => void;
  isClaiming?: boolean;
  isClaimSuccess?: boolean;
}) {
  const payoutAmount = (parseFloat(stakeAmount) * 2 * 0.975).toFixed(4);
  const myElement = getElement(myWarrior.element);
  const theirElement = getElement(theirWarrior.element);
  const iHaveAdvantage = hasElementAdvantage(myWarrior.element, theirWarrior.element);
  const theyHaveAdvantage = hasElementAdvantage(theirWarrior.element, myWarrior.element);

  const myBaseScore = myWarrior.attack + myWarrior.defense + myWarrior.speed + myWarrior.specialPower;
  const theirBaseScore = theirWarrior.attack + theirWarrior.defense + theirWarrior.speed + theirWarrior.specialPower;
  const myBonus = iHaveAdvantage ? Math.round(myBaseScore * 0.15) : 0;
  const theirBonus = theyHaveAdvantage ? Math.round(theirBaseScore * 0.15) : 0;

  // Animated score counter for the result modal
  const [animatedMyScore, setAnimatedMyScore] = useState(0);
  const [animatedTheirScore, setAnimatedTheirScore] = useState(0);
  const [animatedMyBonus, setAnimatedMyBonus] = useState(0);
  const [animatedTheirBonus, setAnimatedTheirBonus] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setAnimatedMyScore(0);
      setAnimatedTheirScore(0);
      setAnimatedMyBonus(0);
      setAnimatedTheirBonus(0);
      return;
    }

    // Start counting after 0.8s delay
    const timeout = setTimeout(() => {
      const duration = 1200;
      const startTime = performance.now();
      let rafId: number;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        setAnimatedMyScore(Math.round(myBaseScore * eased));
        setAnimatedTheirScore(Math.round(theirBaseScore * eased));
        setAnimatedMyBonus(Math.round(myBonus * eased));
        setAnimatedTheirBonus(Math.round(theirBonus * eased));

        if (progress < 1) {
          rafId = requestAnimationFrame(animate);
        }
      };
      rafId = requestAnimationFrame(animate);

      return () => cancelAnimationFrame(rafId);
    }, 800);

    return () => clearTimeout(timeout);
  }, [isOpen, myBaseScore, theirBaseScore, myBonus, theirBonus]);

  // Confetti shapes for sparkle variety
  const confettiShapes = useMemo(() => {
    return Array.from({ length: 50 }).map((_, i) => ({
      isSparkle: i % 4 === 0, // every 4th particle is a sparkle
      color: ['#ff2020', '#ff6b6b', '#ffffff', '#ffd700', '#00ff88', '#00ffff', '#ff69b4'][i % 7],
      left: `${Math.random() * 100}%`,
      endY: `${60 + Math.random() * 40}vh`,
      endX: (Math.random() - 0.5) * 250,
      rotation: Math.random() * 720,
      duration: 2 + Math.random() * 2.5,
      delay: Math.random() * 1,
      size: i % 4 === 0 ? 3 : 2,
    }));
  }, []);

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

          {/* Outer wrapper for screen shake on defeat */}
          <motion.div
            className="relative w-full max-w-2xl"
            animate={
              !isWinner
                ? {
                    x: [0, -5, 5, -5, 5, -3, 3, 0],
                    transition: { duration: 0.5, delay: 0.3, ease: 'easeInOut' },
                  }
                : {}
            }
          >
            <motion.div
              className="relative w-full glass-card p-6 sm:p-8 overflow-hidden"
              initial={{ scale: 0.8, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              {isWinner && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {confettiShapes.map((particle, i) => (
                    <motion.div
                      key={i}
                      className="absolute"
                      style={{
                        background: particle.color,
                        left: particle.left,
                        top: `-5%`,
                        width: particle.size,
                        height: particle.size,
                        borderRadius: particle.isSparkle ? '0' : '50%',
                        clipPath: particle.isSparkle
                          ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
                          : 'none',
                        boxShadow: particle.isSparkle
                          ? `0 0 4px ${particle.color}, 0 0 8px ${particle.color}`
                          : 'none',
                      }}
                      animate={{
                        y: ['0vh', particle.endY],
                        x: [0, particle.endX],
                        rotate: [0, particle.rotation],
                        opacity: [1, 0],
                        scale: particle.isSparkle ? [1, 1.5, 0.5] : [1, 1],
                      }}
                      transition={{
                        duration: particle.duration,
                        delay: particle.delay,
                        ease: 'easeOut',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Defeat red flash overlay */}
              {!isWinner && (
                <motion.div
                  className="absolute inset-0 pointer-events-none rounded-xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.15, 0] }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  style={{ background: 'radial-gradient(circle, rgba(255,32,32,0.3), transparent)' }}
                />
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
                      <span className="text-white font-bold">{animatedMyScore}</span>
                      {myBonus > 0 && (
                        <span className="text-frost-green ml-1">+{animatedMyBonus}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/40 text-xs mb-1">Opponent Score</div>
                    <div className="font-mono">
                      <span className="text-white font-bold">{animatedTheirScore}</span>
                      {theirBonus > 0 && (
                        <span className="text-frost-green ml-1">+{animatedTheirBonus}</span>
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

              {/* Payout info for winner */}
              {isWinner && (
                <motion.div
                  className="flex items-center justify-between p-3 rounded-lg bg-frost-gold/10 border border-frost-gold/20 text-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  <span className="text-white/50 flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-frost-gold" />
                    Payout
                  </span>
                  <span className="font-mono font-bold text-frost-gold">{payoutAmount} AVAX</span>
                </motion.div>
              )}

              {isWinner && onClaimPayout && !isClaimSuccess ? (
                <motion.button
                  onClick={onClaimPayout}
                  disabled={isClaiming}
                  className="w-full btn-primary text-center disabled:opacity-50 flex items-center justify-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  whileHover={{ scale: isClaiming ? 1 : 1.02 }}
                  whileTap={{ scale: isClaiming ? 1 : 0.98 }}
                >
                  {isClaiming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4" />
                      Claim Rewards
                    </>
                  )}
                </motion.button>
              ) : (
                <motion.button
                  onClick={onClose}
                  className="w-full btn-primary text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isClaimSuccess ? 'Close' : 'Return to Frostbite'}
                </motion.button>
              )}
            </motion.div>
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

/**
 * Animated counter that counts from 0 to a target value over ~1.5s.
 * Handles both integer and decimal string values (e.g. "12", "0.530", "3/5").
 */
function AnimatedStatValue({ value, className }: { value: string; className?: string }) {
  const [displayed, setDisplayed] = useState(value);
  const prevValueRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    // If value contains "/" (win/loss format), animate each part separately
    if (value.includes('/')) {
      const parts = value.split('/');
      const target1 = parseInt(parts[0], 10);
      const target2 = parseInt(parts[1], 10);
      if (isNaN(target1) || isNaN(target2)) {
        setDisplayed(value);
        return;
      }
      const duration = 1500;
      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const cur1 = Math.round(target1 * eased);
        const cur2 = Math.round(target2 * eased);
        setDisplayed(`${cur1}/${cur2}`);
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        }
      };
      frameRef.current = requestAnimationFrame(animate);
      prevValueRef.current = value;
      return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
    }

    // If value is "—" or non-numeric, just set it directly
    const target = parseFloat(value);
    if (isNaN(target) || value === '—') {
      setDisplayed(value);
      prevValueRef.current = value;
      return;
    }

    // Determine decimal places to preserve formatting
    const decimalMatch = value.match(/\.(\d+)/);
    const decimals = decimalMatch ? decimalMatch[1].length : 0;

    const duration = 1500;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = target * eased;
      setDisplayed(decimals > 0 ? current.toFixed(decimals) : String(Math.round(current)));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    prevValueRef.current = value;

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  return <span className={className}>{displayed}</span>;
}

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
      { icon: Sword, value: String(battleHistory.length), label: 'MY BATTLES', color: 'text-frost-purple' },
      { icon: Trophy, value: biggestWin > 0 ? `${biggestWin.toFixed(3)}` : '—', label: 'BEST WIN', color: 'text-frost-gold' },
      { icon: Sparkles, value: totalVolume > 0 ? `${totalVolume.toFixed(2)}` : '0', label: 'MY VOLUME', color: 'text-frost-pink' },
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
                <AnimatedStatValue
                  value={stat.value}
                  className="font-pixel text-xs text-white leading-none"
                />
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
  // Fetch global battle feed from on-chain events
  const publicClient = usePublicClient();
  const [globalFeed, setGlobalFeed] = useState<FeedEvent[]>([]);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

    async function fetchGlobalFeed() {
      try {
        const battleAddr = CONTRACT_ADDRESSES.battleEngine as `0x${string}`;
        const teamAddr = CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`;
        const currentBlock = await publicClient!.getBlockNumber();
        const fromBlock = currentBlock > 5000n ? currentBlock - 5000n : 0n;

        const [resolvedLogs, teamResolvedLogs] = await Promise.all([
          publicClient!.getLogs({
            address: battleAddr,
            event: {
              type: 'event',
              name: 'BattleResolved',
              inputs: [
                { type: 'uint256', name: 'battleId', indexed: true },
                { type: 'address', name: 'winner', indexed: true },
                { type: 'uint256', name: 'payout' },
              ],
            },
            fromBlock,
          }),
          publicClient!.getLogs({
            address: teamAddr,
            event: {
              type: 'event',
              name: 'TeamBattleResolved',
              inputs: [
                { type: 'uint256', name: 'battleId', indexed: true },
                { type: 'address', name: 'winner', indexed: true },
                { type: 'uint256', name: 'payout' },
              ],
            },
            fromBlock,
          }),
        ]);

        if (cancelled) return;

        const items: FeedEvent[] = [];

        for (const log of resolvedLogs) {
          const args = log.args as { battleId?: bigint; winner?: string; payout?: bigint };
          if (!args.winner || !args.payout) continue;
          items.push({
            id: `g1v1-${Number(args.battleId)}`,
            type: 'win',
            message: `${shortenAddress(args.winner)} won ${parseFloat(formatEther(args.payout)).toFixed(4)} AVAX (1v1)`,
            time: `Block ${Number(log.blockNumber)}`,
          });
        }

        for (const log of teamResolvedLogs) {
          const args = log.args as { battleId?: bigint; winner?: string; payout?: bigint };
          if (!args.winner || !args.payout) continue;
          items.push({
            id: `g3v3-${Number(args.battleId)}`,
            type: 'win',
            message: `${shortenAddress(args.winner)} won ${parseFloat(formatEther(args.payout)).toFixed(4)} AVAX (3v3)`,
            time: `Block ${Number(log.blockNumber)}`,
          });
        }

        // Reverse so newest first
        items.reverse();
        setGlobalFeed(items.slice(0, 20));
      } catch (err) {
        console.error('[feed] Failed to fetch global feed:', err);
      }
    }

    fetchGlobalFeed();
    const interval = setInterval(fetchGlobalFeed, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [publicClient]);

  const events = useMemo<FeedEvent[]>(() => {
    const items: FeedEvent[] = [];

    // Open battles events
    openBattles.forEach((b) => {
      items.push({
        id: `o-${b.id}`,
        type: 'new',
        message: `New duel: ${shortenAddress(b.player1)} wagered ${formatEther(b.stake)} AVAX`,
        time: timeAgo(b.createdAt),
      });
    });

    // User's own history
    battleHistory.slice(0, 5).forEach((b) => {
      const isWin = currentAddress && b.winner.toLowerCase() === currentAddress.toLowerCase();
      items.push({
        id: `h-${b.id}`,
        type: isWin ? 'win' : 'loss',
        message: `${shortenAddress(b.winner)} won ${formatEther(b.stake)} AVAX with #${isWin ? b.myWarrior.tokenId : b.theirWarrior.tokenId}`,
        time: timeAgo(b.resolvedAt),
      });
    });

    // Global feed (deduplicated)
    const existingIds = new Set(items.map(i => i.id));
    globalFeed.forEach((e) => {
      if (!existingIds.has(e.id)) items.push(e);
    });

    return items.slice(0, 25);
  }, [openBattles, battleHistory, currentAddress, globalFeed]);

  const dotColor = { win: 'bg-frost-green', loss: 'bg-frost-red', new: 'bg-frost-cyan' };
  const glowColor = { win: 'shadow-[0_0_12px_rgba(0,255,136,0.15)]', loss: 'shadow-none', new: 'shadow-none' };

  // Identify feed items that are the user's own battles (wins)
  const isOwnBattle = useCallback(
    (event: FeedEvent) => {
      if (!currentAddress) return false;
      // win events where the shortened address matches
      return event.type === 'win';
    },
    [currentAddress],
  );

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
          events.map((event, index) => {
            const isOwn = isOwnBattle(event);
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.05 * index,
                  duration: 0.35,
                  ease: 'easeOut',
                }}
                className={cn(
                  'flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors',
                  isOwn && 'bg-frost-cyan/[0.04] border border-frost-cyan/10',
                  isOwn && glowColor[event.type],
                )}
              >
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0',
                  dotColor[event.type],
                  isOwn && 'animate-pulse',
                )} />
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'text-[11px] leading-snug break-words',
                    isOwn ? 'text-frost-cyan/70' : 'text-white/50',
                  )}>
                    {event.message}
                  </p>
                  <span className="text-[9px] text-white/20">{event.time}</span>
                </div>
                {isOwn && (
                  <motion.div
                    className="w-1 h-1 rounded-full bg-frost-cyan flex-shrink-0 mt-2"
                    animate={{
                      boxShadow: [
                        '0 0 2px rgba(0,255,255,0.3)',
                        '0 0 8px rgba(0,255,255,0.6)',
                        '0 0 2px rgba(0,255,255,0.3)',
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </motion.div>
            );
          })
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
  claimButtons,
}: {
  battles: (Battle & { creatorWarrior: Warrior })[];
  isLoading: boolean;
  isConnected: boolean;
  currentAddress?: string;
  onCreateClick: () => void;
  onFightClick: (battle: Battle & { creatorWarrior: Warrior }) => void;
  onCancelBattle: (battleId: number) => void;
  isCancelPending: boolean;
  claimButtons?: React.ReactNode;
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
        <div className="flex items-center gap-2">
          {/* Claim buttons inline */}
          {claimButtons}
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
                  <th className="hidden sm:table-cell">STATUS</th>
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
                        <span className="text-xs text-white/50 italic">{BATTLE_TAUNTS[battle.id % BATTLE_TAUNTS.length]}</span>
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
  onCreateMultiBattle,
  onJoinBattle,
  isWorking,
  isPending,
  multiProgress,
}: {
  isOpen: boolean;
  mode: 'create' | 'join';
  targetBattle: (Battle & { creatorWarrior: Warrior }) | null;
  warriors: Warrior[];
  isLoadingWarriors: boolean;
  onClose: () => void;
  onCreateBattle: (warrior: Warrior, stake: string) => void;
  onCreateMultiBattle: (warriors: Warrior[], stake: string) => void;
  onJoinBattle: (warrior: Warrior, battle: Battle & { creatorWarrior: Warrior }) => void;
  isWorking: boolean;
  isPending: boolean;
  multiProgress: { current: number; total: number } | null;
}) {
  const [selectedWarrior, setSelectedWarrior] = useState<Warrior | null>(null);
  const [selectedWarriors, setSelectedWarriors] = useState<Warrior[]>([]);
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(MIN_BATTLE_STAKE);

  // Reset state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSelectedWarrior(null);
      setSelectedWarriors([]);
      setIsMultiMode(false);
      setStakeAmount(MIN_BATTLE_STAKE);
    }
  }, [isOpen]);

  const isValidStake = useMemo(() => {
    const amount = parseFloat(stakeAmount);
    return !isNaN(amount) && amount >= parseFloat(MIN_BATTLE_STAKE);
  }, [stakeAmount]);

  const toggleMultiWarrior = useCallback((w: Warrior) => {
    setSelectedWarriors((prev) => {
      const exists = prev.find((p) => p.tokenId === w.tokenId);
      if (exists) return prev.filter((p) => p.tokenId !== w.tokenId);
      return [...prev, w];
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (mode === 'create') {
      if (!isValidStake) return;
      if (isMultiMode) {
        if (selectedWarriors.length === 0) return;
        onCreateMultiBattle(selectedWarriors, stakeAmount);
      } else {
        if (!selectedWarrior) return;
        onCreateBattle(selectedWarrior, stakeAmount);
      }
    } else if (targetBattle && selectedWarrior) {
      onJoinBattle(selectedWarrior, targetBattle);
    }
  }, [selectedWarrior, selectedWarriors, isMultiMode, mode, stakeAmount, isValidStake, targetBattle, onCreateBattle, onCreateMultiBattle, onJoinBattle]);

  const totalStake = useMemo(() => {
    if (!isMultiMode || selectedWarriors.length === 0) return stakeAmount;
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount)) return '0';
    return (amount * selectedWarriors.length).toFixed(4).replace(/\.?0+$/, '');
  }, [isMultiMode, selectedWarriors.length, stakeAmount]);

  const stakeDisplay = mode === 'join' && targetBattle
    ? formatEther(targetBattle.stake)
    : stakeAmount;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-4xl mx-2 sm:mx-auto bg-frost-bg/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  {mode === 'create' ? 'Create Battle' : 'Choose Your Fighter'}
                </h3>
                {mode === 'join' && targetBattle && (
                  <p className="text-xs text-white/40 mt-0.5 flex items-center gap-2">
                    <span>vs {shortenAddress(targetBattle.player1)}</span>
                    <span className="text-white/20">•</span>
                    <span>{getElement(targetBattle.creatorWarrior.element).emoji} #{targetBattle.creatorWarrior.tokenId}</span>
                    <span className="text-white/20">•</span>
                    <span className="text-frost-gold font-mono">{formatEther(targetBattle.stake)} AVAX</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {mode === 'create' && !isWorking && (
                  <button
                    onClick={() => {
                      setIsMultiMode(!isMultiMode);
                      setSelectedWarrior(null);
                      setSelectedWarriors([]);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase tracking-wider transition-all border',
                      isMultiMode
                        ? 'bg-frost-primary/15 text-frost-primary border-frost-primary/30'
                        : 'bg-white/[0.04] text-white/40 border-white/10 hover:bg-white/[0.08] hover:text-white/60',
                    )}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Multi
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Multi-battle progress */}
            {multiProgress && (
              <div className="px-4 sm:px-6 py-3 border-b border-white/[0.06] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-frost-cyan animate-spin flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/60">Creating battles...</span>
                      <span className="text-xs font-mono text-frost-cyan">{multiProgress.current}/{multiProgress.total}</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-frost-primary to-frost-cyan rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(multiProgress.current / multiProgress.total) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {isLoadingWarriors ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-frost-cyan animate-spin" />
                </div>
              ) : warriors.length === 0 ? (
                <div className="text-center py-20">
                  <Shield className="w-12 h-12 text-white/10 mx-auto mb-4" />
                  <p className="text-white/40 text-sm font-display font-bold">No Warriors Found</p>
                  <p className="text-white/25 text-xs mt-1">Mint a warrior to enter the arena</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 h-full">
                  {/* Left: Warrior List (3/5 width) */}
                  <div className="lg:col-span-3 border-r border-white/[0.04] flex flex-col">
                    <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-pixel">
                        {isMultiMode
                          ? `Select Warriors (${selectedWarriors.length} selected)`
                          : `Your Warriors (${warriors.length})`}
                      </span>
                      {isMultiMode && warriors.length > 0 && (
                        <button
                          onClick={() =>
                            setSelectedWarriors(selectedWarriors.length === warriors.length ? [] : [...warriors])
                          }
                          className="text-[10px] font-pixel text-frost-cyan/60 hover:text-frost-cyan transition-colors"
                        >
                          {selectedWarriors.length === warriors.length ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 auto-rows-min content-start scrollbar-thin">
                      {warriors.map((w, idx) => {
                        const el = getElement(w.element);
                        const isSelected = isMultiMode
                          ? selectedWarriors.some((s) => s.tokenId === w.tokenId)
                          : selectedWarrior?.tokenId === w.tokenId;
                        return (
                          <motion.button
                            key={w.tokenId}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.02 * idx, duration: 0.25 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => isMultiMode ? toggleMultiWarrior(w) : setSelectedWarrior(w)}
                            className={cn(
                              'relative flex items-center gap-3 p-3 rounded-xl text-left transition-all',
                              isSelected
                                ? 'bg-frost-primary/10 ring-2 ring-frost-primary/50 shadow-[0_0_20px_rgba(255,32,32,0.15)]'
                                : 'bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:bg-white/[0.05]',
                            )}
                          >
                            <WarriorImage
                              tokenId={w.tokenId}
                              element={w.element}
                              size={44}
                              className="rounded-lg flex-shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-sm text-white">
                                  #{w.tokenId}
                                </span>
                                <span className={cn('text-xs font-semibold bg-gradient-to-r bg-clip-text text-transparent', el.color)}>
                                  {el.emoji} {el.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-white/40 font-mono">
                                <span>PWR {w.powerScore}</span>
                                <span>Lv.{w.level}</span>
                                <span>{w.battleWins}W/{w.battleLosses}L</span>
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle className="h-5 w-5 text-frost-primary flex-shrink-0" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Preview + Config (2/5 width) */}
                  <div className="lg:col-span-2 flex flex-col p-5 overflow-y-auto">
                    {/* Selected warrior preview */}
                    {isMultiMode ? (
                      selectedWarriors.length > 0 ? (
                        <div className="flex-1">
                          <div className="text-[10px] uppercase tracking-wider text-white/40 font-pixel mb-3">
                            {selectedWarriors.length} Warriors Selected
                          </div>
                          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
                            {selectedWarriors.map((w) => {
                              const el = getElement(w.element);
                              return (
                                <div key={w.tokenId} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
                                  <WarriorImage tokenId={w.tokenId} element={w.element} size={28} className="rounded flex-shrink-0" />
                                  <span className="font-mono text-xs text-white">#{w.tokenId}</span>
                                  <span className={cn('text-[10px] bg-gradient-to-r bg-clip-text text-transparent', el.color)}>{el.emoji}</span>
                                  <span className="text-[10px] text-white/30 font-mono ml-auto">PWR {w.powerScore}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="text-center">
                            <Layers className="w-10 h-10 text-white/10 mx-auto mb-3" />
                            <p className="text-white/25 text-xs font-pixel">
                              Select warriors for multi-battle
                            </p>
                          </div>
                        </div>
                      )
                    ) : selectedWarrior ? (
                      <WarriorStatsPreview warrior={selectedWarrior} />
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                          <Sword className="w-10 h-10 text-white/10 mx-auto mb-3" />
                          <p className="text-white/25 text-xs font-pixel">
                            Select a warrior
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Stake Input (create mode only) */}
                    {mode === 'create' && (
                      <div className="mt-5">
                        <label className="text-[10px] uppercase tracking-wider text-white/40 font-pixel mb-2 block">
                          Stake Per Battle
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

                        {/* Quick Stake Buttons */}
                        <div className="flex gap-1.5 mt-2">
                          {['0.005', '0.01', '0.05', '0.1'].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setStakeAmount(amount)}
                              className={cn(
                                'flex-1 py-1.5 rounded-lg text-[10px] font-mono transition-all',
                                stakeAmount === amount
                                  ? 'bg-frost-primary/20 text-frost-primary border border-frost-primary/30'
                                  : 'bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06]',
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Join mode stake display */}
                    {mode === 'join' && targetBattle && (
                      <div className="mt-5 flex items-center justify-between p-3 rounded-xl bg-frost-gold/10 border border-frost-gold/20">
                        <span className="text-xs text-white/50">Required Stake</span>
                        <span className="font-mono font-bold text-frost-gold text-sm">
                          {formatEther(targetBattle.stake)} AVAX
                        </span>
                      </div>
                    )}

                    {/* Total cost indicator for multi mode */}
                    {isMultiMode && selectedWarriors.length > 1 && isValidStake && (
                      <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-frost-cyan/5 border border-frost-cyan/15">
                        <span className="text-xs text-white/50">Total Cost ({selectedWarriors.length} battles)</span>
                        <span className="font-mono font-bold text-frost-cyan text-sm">
                          {totalStake} AVAX
                        </span>
                      </div>
                    )}

                    {/* Confirm Button */}
                    {(() => {
                      const hasSelection = isMultiMode ? selectedWarriors.length > 0 : !!selectedWarrior;
                      const canConfirm = hasSelection && (mode === 'join' || isValidStake) && !isWorking;
                      return (
                        <motion.button
                          onClick={handleConfirm}
                          disabled={!canConfirm}
                          className={cn(
                            'mt-4 w-full py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2',
                            canConfirm ? 'btn-primary' : 'bg-white/5 text-white/20 cursor-not-allowed',
                          )}
                          whileHover={canConfirm ? { scale: 1.02 } : {}}
                          whileTap={canConfirm ? { scale: 0.98 } : {}}
                        >
                          {isWorking ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {isPending ? 'Confirm in Wallet...' : mode === 'create' ? 'Creating...' : 'Joining...'}
                            </>
                          ) : (
                            <>
                              <Swords className="w-4 h-4" />
                              {mode === 'create'
                                ? isMultiMode && selectedWarriors.length > 1
                                  ? `Create ${selectedWarriors.length} Battles (${totalStake} AVAX)`
                                  : `Create Battle (${stakeDisplay} AVAX)`
                                : `Fight (${stakeDisplay} AVAX)`
                              }
                            </>
                          )}
                        </motion.button>
                      );
                    })()}
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
                  <th className="hidden sm:table-cell">STATUS</th>
                  <th>STAKE</th>
                  <th className="hidden sm:table-cell">TIME</th>
                  <th className="text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {battles.map((battle, i) => {
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
                        <span className="text-xs text-white/50 italic">{BATTLE_TAUNTS[battle.id % BATTLE_TAUNTS.length]}</span>
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
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-5xl mx-2 sm:mx-auto bg-frost-bg/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
              <div>
                <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-frost-purple" />
                  {mode === 'create' ? 'Create 3v3 Battle' : 'Choose Your Team'}
                </h3>
                <p className="text-xs text-white/40 mt-0.5">
                  {mode === 'create'
                    ? `Select 3 warriors for your team (${selectedWarriors.length}/3)`
                    : targetBattle
                      ? <>vs {shortenAddress(targetBattle.player1)} <span className="text-white/20">•</span> <span className="text-frost-gold font-mono">{formatEther(targetBattle.stake)} AVAX</span></>
                      : `Select 3 warriors (${selectedWarriors.length}/3)`
                  }
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            {/* Slot indicators */}
            <div className="px-4 sm:px-6 py-3 border-b border-white/[0.04] flex-shrink-0">
              <div className="flex items-center gap-3">
                {[0, 1, 2].map((i) => {
                  const w = selectedWarriors[i];
                  const el = w ? getElement(w.element) : null;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl flex-1 transition-all',
                        w
                          ? 'bg-frost-purple/10 border border-frost-purple/30'
                          : 'bg-white/[0.02] border border-dashed border-white/10',
                      )}
                    >
                      {w ? (
                        <>
                          <WarriorImage tokenId={w.tokenId} element={w.element} size={28} className="rounded-md flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-mono font-bold text-white">#{w.tokenId}</span>
                            <span className={cn('ml-1.5 text-[10px] font-semibold bg-gradient-to-r bg-clip-text text-transparent', el!.color)}>
                              {el!.emoji}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleWarrior(w)}
                            className="ml-auto text-white/30 hover:text-frost-red transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-white/20 font-pixel w-full text-center">
                          Slot {i + 1}
                        </span>
                      )}
                    </div>
                  );
                })}
                {teamReady && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-mono text-frost-purple font-bold">{avgPower}</div>
                    <div className="text-[9px] text-white/30 uppercase">Avg PWR</div>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {isLoadingWarriors ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-frost-purple animate-spin" />
                </div>
              ) : warriors.length < 3 ? (
                <div className="text-center py-20">
                  <Shield className="w-12 h-12 text-white/10 mx-auto mb-4" />
                  <p className="text-white/40 text-sm font-display font-bold">Need at least 3 Warriors</p>
                  <p className="text-white/25 text-xs mt-1">Mint more warriors to create a team</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 h-full">
                  {/* Left: Warrior List (3/5) */}
                  <div className="lg:col-span-3 border-r border-white/[0.04] flex flex-col">
                    <div className="px-5 py-3 border-b border-white/[0.04] flex-shrink-0">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-pixel">
                        Your Warriors ({warriors.length})
                      </span>
                    </div>
                    <div className="max-h-[45vh] overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 auto-rows-min content-start scrollbar-thin">
                      {warriors.map((w, idx) => {
                        const el = getElement(w.element);
                        const isSelected = !!selectedWarriors.find((sw) => sw.tokenId === w.tokenId);
                        const isMaxed = selectedWarriors.length >= 3 && !isSelected;
                        return (
                          <motion.button
                            key={w.tokenId}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.02 * idx, duration: 0.25 }}
                            whileHover={!isMaxed ? { scale: 1.02 } : {}}
                            whileTap={!isMaxed ? { scale: 0.98 } : {}}
                            onClick={() => !isMaxed && toggleWarrior(w)}
                            className={cn(
                              'relative flex items-center gap-3 p-3 rounded-xl text-left transition-all',
                              isSelected
                                ? 'bg-frost-purple/10 ring-2 ring-frost-purple/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
                                : isMaxed
                                  ? 'bg-white/[0.02] ring-1 ring-white/[0.04] opacity-40 cursor-not-allowed'
                                  : 'bg-white/[0.03] ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:bg-white/[0.05]',
                            )}
                          >
                            <WarriorImage
                              tokenId={w.tokenId}
                              element={w.element}
                              size={44}
                              className="rounded-lg flex-shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-sm text-white">
                                  #{w.tokenId}
                                </span>
                                <span className={cn('text-xs font-semibold bg-gradient-to-r bg-clip-text text-transparent', el.color)}>
                                  {el.emoji} {el.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-white/40 font-mono">
                                <span>PWR {w.powerScore}</span>
                                <span>Lv.{w.level}</span>
                                <span>{w.battleWins}W/{w.battleLosses}L</span>
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle className="h-5 w-5 text-frost-purple flex-shrink-0" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Config + Confirm (2/5) */}
                  <div className="lg:col-span-2 flex flex-col p-5 overflow-y-auto">
                    {/* Team preview */}
                    {teamReady ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-pixel text-xs text-white/60 uppercase">Your Team</span>
                          <span className="text-xs font-mono text-frost-purple font-bold">
                            Avg Power: {avgPower}
                          </span>
                        </div>
                        <div className="flex gap-3">
                          {selectedWarriors.map((w) => {
                            const el = getElement(w.element);
                            return (
                              <div key={w.tokenId} className="flex-1 text-center">
                                <WarriorImage
                                  tokenId={w.tokenId}
                                  element={w.element}
                                  size={52}
                                  className="rounded-lg mx-auto ring-1 ring-white/10"
                                />
                                <div className="text-[10px] font-mono text-white mt-1.5">#{w.tokenId}</div>
                                <div className={cn('text-[9px] font-semibold bg-gradient-to-r bg-clip-text text-transparent', el.color)}>
                                  {el.emoji} {el.name}
                                </div>
                                <div className="text-[10px] font-mono text-white/50 mt-0.5">{w.powerScore}</div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center min-h-[140px]">
                        <div className="text-center">
                          <Users className="w-10 h-10 text-white/10 mx-auto mb-3" />
                          <p className="text-white/25 text-xs font-pixel">
                            Select 3 warriors
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Stake Input (create mode) */}
                    {mode === 'create' && (
                      <div className="mt-5">
                        <label className="text-[10px] uppercase tracking-wider text-white/40 font-pixel mb-2 block">
                          Stake Amount
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
                        <div className="flex gap-1.5 mt-2">
                          {['0.01', '0.05', '0.1', '0.5'].map((amount) => (
                            <button
                              key={amount}
                              onClick={() => setStakeAmount(amount)}
                              className={cn(
                                'flex-1 py-1.5 rounded-lg text-[10px] font-mono transition-all',
                                stakeAmount === amount
                                  ? 'bg-frost-purple/20 text-frost-purple border border-frost-purple/30'
                                  : 'bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06]',
                              )}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Join mode stake display */}
                    {mode === 'join' && targetBattle && (
                      <div className="mt-5 flex items-center justify-between p-3 rounded-xl bg-frost-gold/10 border border-frost-gold/20">
                        <span className="text-xs text-white/50">Required Stake</span>
                        <span className="font-mono font-bold text-frost-gold text-sm">
                          {formatEther(targetBattle.stake)} AVAX
                        </span>
                      </div>
                    )}

                    {/* Confirm Button */}
                    <motion.button
                      onClick={handleConfirm}
                      disabled={!teamReady || (mode === 'create' && !isValidStake) || isWorking}
                      className={cn(
                        'mt-4 w-full py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2',
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
  onClaimPayout,
  isClaiming,
  isClaimSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  battle: TeamBattle;
  myWarriors: Warrior[];
  theirWarriors: Warrior[];
  isWinner: boolean;
  onClaimPayout?: () => void;
  isClaiming?: boolean;
  isClaimSuccess?: boolean;
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

            {/* Payout info for winner */}
            {isWinner && (
              <motion.div
                className="flex items-center justify-between p-3 rounded-lg bg-frost-gold/10 border border-frost-gold/20 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <span className="text-white/50 flex items-center gap-1.5">
                  <Coins className="h-4 w-4 text-frost-gold" />
                  Payout
                </span>
                <span className="font-mono font-bold text-frost-gold">
                  {(parseFloat(stakeAmount) * 2 * 0.975).toFixed(4)} AVAX
                </span>
              </motion.div>
            )}

            {isWinner && onClaimPayout && !isClaimSuccess ? (
              <motion.button
                onClick={onClaimPayout}
                disabled={isClaiming}
                className="w-full btn-primary text-center disabled:opacity-50 flex items-center justify-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                whileHover={{ scale: isClaiming ? 1 : 1.02 }}
                whileTap={{ scale: isClaiming ? 1 : 0.98 }}
              >
                {isClaiming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4" />
                    Claim Rewards
                  </>
                )}
              </motion.button>
            ) : (
              <motion.button
                onClick={onClose}
                className="w-full btn-primary text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isClaimSuccess ? 'Close' : 'Return to Frostbite'}
              </motion.button>
            )}
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
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

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

  // Battle animation state
  const [battleAnimating, setBattleAnimating] = useState(false);
  const [battleResult, setBattleResult] = useState<'won' | 'lost' | null>(null);
  const [battleAnimData, setBattleAnimData] = useState<{
    type: '1v1' | '3v3';
    myWarriors: Warrior[];
    opponentWarriors: Warrior[];
  } | null>(null);
  const pendingBattleRef = useRef<{ id: number; type: '1v1' | '3v3' } | null>(null);

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

  // Manual refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch();
    refetchTeam();
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [refetch, refetchTeam]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      refetchTeam();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch, refetchTeam]);

  // Pending payouts from won battles
  const publicClient = usePublicClient();
  const [pendingPayout1v1, setPendingPayout1v1] = useState(0n);
  const [pendingPayout3v3, setPendingPayout3v3] = useState(0n);

  const fetchPayouts = useCallback(async () => {
    if (!publicClient || !address) {
      setPendingPayout1v1(0n);
      setPendingPayout3v3(0n);
      return;
    }
    try {
      const [p1, p3] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'pendingPayouts',
          args: [address as `0x${string}`],
        }).catch(() => 0n) as Promise<bigint>,
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
          abi: TEAM_BATTLE_ABI,
          functionName: 'pendingPayouts',
          args: [address as `0x${string}`],
        }).catch(() => 0n) as Promise<bigint>,
      ]);
      setPendingPayout1v1(p1);
      setPendingPayout3v3(p3);
    } catch {}
  }, [publicClient, address]);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  // Auto-refresh payouts every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchPayouts, 15000);
    return () => clearInterval(interval);
  }, [fetchPayouts]);

  const totalPending = pendingPayout1v1 + pendingPayout3v3;

  // Check which warriors are on quest or listed on marketplace
  const [lockedOnQuestOrListed, setLockedOnQuestOrListed] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!publicClient || warriors.length === 0) {
      setLockedOnQuestOrListed(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [questChecks, listingChecks] = await Promise.all([
          Promise.all(
            warriors.map((w) =>
              publicClient.readContract({
                address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
                abi: QUEST_ENGINE_ABI,
                functionName: 'isWarriorOnQuest',
                args: [BigInt(w.tokenId)],
              }).catch(() => false)
            )
          ),
          Promise.all(
            warriors.map((w) =>
              publicClient.readContract({
                address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'getListing',
                args: [BigInt(w.tokenId)],
              }).then((r: any) => Boolean(r?.active ?? r?.[2])).catch(() => false)
            )
          ),
        ]);
        if (cancelled) return;
        const locked = new Set<number>();
        warriors.forEach((w, i) => {
          if (questChecks[i] || listingChecks[i]) locked.add(w.tokenId);
        });
        setLockedOnQuestOrListed(locked);
      } catch {
        if (!cancelled) setLockedOnQuestOrListed(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [publicClient, warriors]);

  // Cross-filter: warriors locked in 1v1 battles excluded from 3v3, and vice versa
  const lockedIn1v1 = useMemo(() => {
    if (!address) return new Set<number>();
    const ids = new Set<number>();
    openBattles.forEach((b) => {
      if (b.player1.toLowerCase() === address.toLowerCase()) ids.add(b.nft1);
    });
    return ids;
  }, [openBattles, address]);

  const lockedIn3v3 = useMemo(() => {
    if (!address) return new Set<number>();
    const ids = new Set<number>();
    openTeamBattles.forEach((b) => {
      if (b.player1.toLowerCase() === address.toLowerCase()) {
        b.team1.forEach((id) => { if (id > 0) ids.add(id); });
      }
    });
    return ids;
  }, [openTeamBattles, address]);

  const warriors1v1 = useMemo(
    () => warriors.filter((w) => !lockedIn3v3.has(w.tokenId) && !lockedOnQuestOrListed.has(w.tokenId)),
    [warriors, lockedIn3v3, lockedOnQuestOrListed],
  );

  const warriors3v3 = useMemo(
    () => warriors.filter((w) => !lockedIn1v1.has(w.tokenId) && !lockedOnQuestOrListed.has(w.tokenId)),
    [warriors, lockedIn1v1, lockedOnQuestOrListed],
  );

  // Multi-battle state
  const [multiProgress, setMultiProgress] = useState<{ current: number; total: number } | null>(null);
  const [isMultiBattling, setIsMultiBattling] = useState(false);

  // 1v1 Contract writes
  const {
    writeContract: createBattle,
    writeContractAsync: createBattleAsync,
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

  // Claim payout (withdrawPayout)
  const {
    writeContract: claimPayout,
    data: claimTxHash,
    isPending: isClaimPending,
  } = useWriteContract();

  const { isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimTxHash });

  // Toast state for claim success
  const [claimToast, setClaimToast] = useState<{ txHash: string } | null>(null);

  useEffect(() => {
    if (isClaimSuccess && claimTxHash) {
      setClaimToast({ txHash: claimTxHash });
      // Auto-dismiss after 6 seconds
      const timer = setTimeout(() => setClaimToast(null), 6000);
      // Refetch pending payouts
      setTimeout(() => fetchPayouts(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isClaimSuccess, claimTxHash, fetchPayouts]);

  const handleClaimPayout = useCallback(
    async (contractAddress: string, abi: readonly unknown[]) => {
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      claimPayout({
        address: contractAddress as `0x${string}`,
        abi: abi as any,
        functionName: 'withdrawPayout',
      });
    },
    [claimPayout, chain, switchChainAsync],
  );

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
      refetch();
      setTimeout(() => { refetch(); refetchTeam(); }, 3000);
    }
  }, [isCreateSuccess, resetCreate, refetch, refetchTeam]);

  useEffect(() => {
    if (isJoinSuccess) {
      const battleId = targetBattle?.id;
      setDrawerOpen(false);
      setTargetBattle(null);
      setError(null);
      resetJoin();
      if (battleId) pendingBattleRef.current = { id: battleId, type: '1v1' };
      setBattleAnimating(true);
      setBattleResult(null);
      setTimeout(async () => {
        // Fetch resolved battle to determine win/loss
        if (battleId && publicClient && address) {
          try {
            const raw = await publicClient.readContract({
              address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
              abi: BATTLE_ENGINE_ABI,
              functionName: 'getBattle',
              args: [BigInt(battleId)],
            });
            const battle = parseBattleData(raw as Record<string, unknown>);
            setBattleResult(battle.winner.toLowerCase() === address.toLowerCase() ? 'won' : 'lost');
          } catch {
            setBattleAnimating(false);
          }
        } else {
          setBattleAnimating(false);
        }
        refetch();
        refetchTeam();
      }, 5000);
    }
  }, [isJoinSuccess, resetJoin, refetch, refetchTeam, targetBattle, publicClient, address]);

  useEffect(() => {
    if (isCancelSuccess) {
      setError(null);
      resetCancel();
      refetch();
      setTimeout(() => { refetch(); refetchTeam(); }, 3000);
    }
  }, [isCancelSuccess, resetCancel, refetch, refetchTeam]);

  // 3v3 Success handlers
  useEffect(() => {
    if (isCreateTeamSuccess) {
      setTeamDrawerOpen(false);
      setError(null);
      resetCreateTeam();
      // Refetch immediately + delayed to catch pending tx
      refetchTeam();
      setTimeout(() => { refetchTeam(); refetch(); }, 3000);
    }
  }, [isCreateTeamSuccess, resetCreateTeam, refetchTeam, refetch]);

  useEffect(() => {
    if (isJoinTeamSuccess) {
      const battleId = targetTeamBattle?.id;
      setTeamDrawerOpen(false);
      setTargetTeamBattle(null);
      setError(null);
      resetJoinTeam();
      if (battleId) pendingBattleRef.current = { id: battleId, type: '3v3' };
      setBattleAnimating(true);
      setBattleResult(null);
      setTimeout(async () => {
        // Fetch resolved battle to determine win/loss
        if (battleId && publicClient && address) {
          try {
            const raw = await publicClient.readContract({
              address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
              abi: TEAM_BATTLE_ABI,
              functionName: 'getTeamBattle',
              args: [BigInt(battleId)],
            });
            const battle = parseTeamBattleData(raw as readonly unknown[]);
            setBattleResult(battle.winner.toLowerCase() === address.toLowerCase() ? 'won' : 'lost');
          } catch {
            setBattleAnimating(false);
          }
        } else {
          setBattleAnimating(false);
        }
        refetchTeam();
        refetch();
      }, 5000);
    }
  }, [isJoinTeamSuccess, resetJoinTeam, refetchTeam, refetch, targetTeamBattle, publicClient, address]);

  useEffect(() => {
    if (isCancelTeamSuccess) {
      setError(null);
      resetCancelTeam();
      refetchTeam();
      setTimeout(() => { refetchTeam(); refetch(); }, 3000);
    }
  }, [isCancelTeamSuccess, resetCancelTeam, refetchTeam, refetch]);

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

  // Ensure NFT approval for battle contracts
  const ensureApproval = useCallback(
    async (operator: string) => {
      if (!publicClient || !address || !walletClient) return;
      const approved = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'isApprovedForAll',
        args: [address as `0x${string}`, operator as `0x${string}`],
      });
      if (approved) return;
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'setApprovalForAll',
        args: [operator as `0x${string}`, true],
      });
      await publicClient.waitForTransactionReceipt({ hash });
    },
    [publicClient, address, walletClient],
  );

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
    async (warrior: Warrior, stake: string) => {
      setError(null);
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      try {
        await ensureApproval(CONTRACT_ADDRESSES.battleEngine);
      } catch {
        setError('NFT approval failed');
        return;
      }
      createBattle({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'createBattle',
        args: [BigInt(warrior.tokenId), '0x' as `0x${string}`],
        value: parseEther(stake),
      });
    },
    [createBattle, chain, switchChainAsync, ensureApproval],
  );

  const handleCreateMultiBattle = useCallback(
    async (selectedWarriors: Warrior[], stake: string) => {
      setError(null);
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      try {
        await ensureApproval(CONTRACT_ADDRESSES.battleEngine);
      } catch {
        setError('NFT approval failed');
        return;
      }

      setIsMultiBattling(true);
      setMultiProgress({ current: 0, total: selectedWarriors.length });
      let created = 0;

      for (const warrior of selectedWarriors) {
        try {
          const hash = await createBattleAsync({
            address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
            abi: BATTLE_ENGINE_ABI,
            functionName: 'createBattle',
            args: [BigInt(warrior.tokenId), '0x' as `0x${string}`],
            value: parseEther(stake),
          });
          if (hash && publicClient) {
            await publicClient.waitForTransactionReceipt({ hash });
          }
          created++;
          setMultiProgress({ current: created, total: selectedWarriors.length });
        } catch (err) {
          console.error(`[multi-battle] Failed for #${warrior.tokenId}:`, err);
          setError(`Battle #${warrior.tokenId} failed. ${created}/${selectedWarriors.length} created.`);
          break;
        }
      }

      setIsMultiBattling(false);
      setMultiProgress(null);
      if (created > 0) {
        setDrawerOpen(false);
        refetch();
        setTimeout(() => { refetch(); refetchTeam(); }, 3000);
      }
    },
    [createBattleAsync, publicClient, chain, switchChainAsync, ensureApproval, refetch, refetchTeam],
  );

  const handleJoinBattle = useCallback(
    async (warrior: Warrior, battle: Battle & { creatorWarrior: Warrior }) => {
      setError(null);
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      try {
        await ensureApproval(CONTRACT_ADDRESSES.battleEngine);
      } catch {
        setError('NFT approval failed');
        return;
      }
      setBattleAnimData({
        type: '1v1',
        myWarriors: [warrior],
        opponentWarriors: [battle.creatorWarrior],
      });
      joinBattle({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'joinBattle',
        args: [BigInt(battle.id), BigInt(warrior.tokenId), '0x' as `0x${string}`],
        value: battle.stake,
      });
    },
    [joinBattle, chain, switchChainAsync, ensureApproval],
  );

  const handleCancelBattle = useCallback(
    async (battleId: number) => {
      setError(null);
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      cancelBattleContract({
        address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
        abi: BATTLE_ENGINE_ABI,
        functionName: 'cancelBattle',
        args: [BigInt(battleId)],
      });
    },
    [cancelBattleContract, chain, switchChainAsync],
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
    async (team: Warrior[], stake: string) => {
      setError(null);
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      try {
        await ensureApproval(CONTRACT_ADDRESSES.teamBattleEngine);
      } catch {
        setError('NFT approval failed');
        return;
      }
      const tokenIds = team.map((w) => BigInt(w.tokenId)) as [bigint, bigint, bigint];
      createTeamBattle({
        address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
        abi: TEAM_BATTLE_ABI,
        functionName: 'createTeamBattle',
        args: [tokenIds, '0x' as `0x${string}`],
        value: parseEther(stake),
      });
    },
    [createTeamBattle, chain, switchChainAsync, ensureApproval],
  );

  const handleJoinTeamBattle = useCallback(
    async (team: Warrior[], battle: TeamBattle & { creatorWarriors: Warrior[] }) => {
      setError(null);
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      // Pre-flight: verify creator still owns their team NFTs (burned/transferred NFTs cause revert)
      if (publicClient) {
        try {
          const ownerChecks = await Promise.allSettled(
            battle.team1.filter((id) => id > 0).map((id) =>
              publicClient.readContract({
                address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
                abi: FROSTBITE_WARRIOR_ABI,
                functionName: 'ownerOf',
                args: [BigInt(id)],
              })
            )
          );
          const allValid = ownerChecks.every(
            (r) => r.status === 'fulfilled' && (r.value as string).toLowerCase() === battle.player1.toLowerCase()
          );
          if (!allValid) {
            setError('This battle is invalid — opponent no longer owns their warriors. Refreshing...');
            setTimeout(() => refetchTeam(), 1000);
            return;
          }
        } catch {
          // Continue anyway if check fails
        }
      }
      try {
        await ensureApproval(CONTRACT_ADDRESSES.teamBattleEngine);
      } catch {
        setError('NFT approval failed');
        return;
      }
      setBattleAnimData({
        type: '3v3',
        myWarriors: team,
        opponentWarriors: battle.creatorWarriors,
      });
      const tokenIds = team.map((w) => BigInt(w.tokenId)) as [bigint, bigint, bigint];
      joinTeamBattle({
        address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
        abi: TEAM_BATTLE_ABI,
        functionName: 'joinTeamBattle',
        args: [BigInt(battle.id), tokenIds, '0x' as `0x${string}`],
        value: battle.stake,
      });
    },
    [joinTeamBattle, chain, switchChainAsync, ensureApproval, publicClient, refetchTeam],
  );

  const handleCancelTeamBattle = useCallback(
    async (battleId: number) => {
      setError(null);
      if (chain?.id !== ACTIVE_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
        } catch {
          return;
        }
      }
      cancelTeamBattleContract({
        address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
        abi: TEAM_BATTLE_ABI,
        functionName: 'cancelTeamBattle',
        args: [BigInt(battleId)],
      });
    },
    [cancelTeamBattleContract, chain, switchChainAsync],
  );

  const handleViewTeamResult = useCallback(
    (battle: TeamBattle & { myWarriors: Warrior[]; theirWarriors: Warrior[] }) => {
      setSelectedTeamBattleResult(battle);
      setShowTeamResultModal(true);
    },
    [],
  );

  const isWorking = isCreatePending || isCreateConfirming || isJoinPending || isJoinConfirming || isMultiBattling;
  const isTeamWorking = isCreateTeamPending || isCreateTeamConfirming || isJoinTeamPending || isJoinTeamConfirming;

  if (!isConnected) {
    return (
      <div className="h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <ArenaBackground />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center max-w-md mx-4 sm:mx-auto"
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
    <div className="h-[calc(100vh-64px)] flex flex-col relative overflow-y-auto overflow-x-hidden">
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
          onClick={() => { setActiveTab('1v1'); refetch(); }}
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
          onClick={() => { setActiveTab('3v3'); refetchTeam(); }}
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

        <div className="ml-auto">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all disabled:opacity-50"
            title="Refresh battles"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          </button>
        </div>
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
                claimButtons={isConnected && totalPending > 0n ? (
                  <>
                    {pendingPayout1v1 > 0n && (
                      <motion.button
                        onClick={() => handleClaimPayout(CONTRACT_ADDRESSES.battleEngine, BATTLE_ENGINE_ABI)}
                        disabled={isClaimPending}
                        className="px-3 py-1.5 rounded-lg bg-frost-gold/20 hover:bg-frost-gold/30 border border-frost-gold/40 text-frost-gold font-pixel text-[9px] uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {isClaimPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Coins className="w-2.5 h-2.5" />}
                        Claim {parseFloat(formatEther(pendingPayout1v1)).toFixed(3)}
                      </motion.button>
                    )}
                    {pendingPayout3v3 > 0n && (
                      <motion.button
                        onClick={() => handleClaimPayout(CONTRACT_ADDRESSES.teamBattleEngine, TEAM_BATTLE_ABI)}
                        disabled={isClaimPending}
                        className="px-3 py-1.5 rounded-lg bg-frost-gold/20 hover:bg-frost-gold/30 border border-frost-gold/40 text-frost-gold font-pixel text-[9px] uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {isClaimPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Coins className="w-2.5 h-2.5" />}
                        Claim 3v3 {parseFloat(formatEther(pendingPayout3v3)).toFixed(3)}
                      </motion.button>
                    )}
                  </>
                ) : undefined}
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
        warriors={warriors1v1}
        isLoadingWarriors={isLoadingWarriors}
        onClose={() => {
          setDrawerOpen(false);
          setTargetBattle(null);
        }}
        onCreateBattle={handleCreateBattle}
        onCreateMultiBattle={handleCreateMultiBattle}
        onJoinBattle={handleJoinBattle}
        isWorking={isWorking}
        isPending={isCreatePending || isJoinPending}
        multiProgress={multiProgress}
      />

      {/* 3v3 Team Warrior Selection Drawer */}
      <TeamWarriorSelectionDrawer
        isOpen={teamDrawerOpen}
        mode={teamDrawerMode}
        targetBattle={targetTeamBattle}
        warriors={warriors3v3}
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
          onClaimPayout={() => handleClaimPayout(CONTRACT_ADDRESSES.battleEngine, BATTLE_ENGINE_ABI)}
          isClaiming={isClaimPending}
          isClaimSuccess={isClaimSuccess}
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
          onClaimPayout={() => handleClaimPayout(CONTRACT_ADDRESSES.teamBattleEngine, TEAM_BATTLE_ABI)}
          isClaiming={isClaimPending}
          isClaimSuccess={isClaimSuccess}
        />
      )}

      {/* Claim Success Toast */}
      <AnimatePresence>
        {claimToast && (
          <motion.div
            className="fixed bottom-6 right-6 z-[200] max-w-sm"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <div className="glass-card p-4 border border-frost-green/30 shadow-[0_0_30px_rgba(0,255,136,0.15)]">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-frost-green/20 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-frost-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-display text-sm font-bold text-white mb-0.5">
                    Claim Successful!
                  </h4>
                  <p className="text-frost-green font-mono text-sm font-bold">
                    Rewards sent to your wallet
                  </p>
                  <a
                    href={`https://snowtrace.io/tx/${claimToast.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-white/40 hover:text-white/60 font-mono mt-1 inline-block"
                  >
                    View on Snowtrace &rarr;
                  </a>
                </div>
                <button
                  onClick={() => setClaimToast(null)}
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-0.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full bg-frost-green/50 rounded-full"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 6, ease: 'linear' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Battle Animation Overlay — Neon Edition */}
      <AnimatePresence>
        {(battleAnimating || battleResult) && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Dark backdrop with subtle radial neon wash */}
            <div className="absolute inset-0 bg-black/95 pointer-events-none" />
            <div
              className="absolute inset-0 pointer-events-none opacity-30"
              style={{
                background: `radial-gradient(ellipse at 25% 50%, ${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 0)}22 0%, transparent 50%), radial-gradient(ellipse at 75% 50%, ${getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0)}22 0%, transparent 50%)`,
              }}
            />

            {/* Neon grid floor lines */}
            <div className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none overflow-hidden opacity-20" style={{ perspective: '400px' }}>
              <div
                className="w-full h-full"
                style={{
                  transform: 'rotateX(60deg)',
                  backgroundImage: `linear-gradient(${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3)}44 1px, transparent 1px), linear-gradient(90deg, ${getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0)}44 1px, transparent 1px)`,
                  backgroundSize: '60px 60px',
                }}
              />
            </div>

            {/* Floating neon particles */}
            {!battleResult && Array.from({ length: 16 }).map((_, i) => {
              const isLeft = i < 8;
              const neon = isLeft
                ? getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 0)
                : getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0);
              return (
                <motion.div
                  key={`np-${i}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 2 + (i % 3),
                    height: 2 + (i % 3),
                    background: neon,
                    boxShadow: `0 0 6px ${neon}, 0 0 12px ${neon}`,
                    left: isLeft ? `${3 + (i % 8) * 5}%` : `${58 + (i % 8) * 5}%`,
                    top: `${10 + (i * 5) % 80}%`,
                  }}
                  animate={{ opacity: [0, 1, 0], y: [0, -60 - (i % 4) * 15], x: [(i % 2 === 0 ? -1 : 1) * 10] }}
                  transition={{ duration: 2 + (i % 3) * 0.4, delay: (i % 6) * 0.5, repeat: Infinity }}
                />
              );
            })}

            {/* Horizontal neon scan line */}
            {!battleResult && (
              <motion.div
                className="absolute left-0 right-0 h-[1px] pointer-events-none"
                style={{ background: `linear-gradient(90deg, transparent, ${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3)}, transparent)`, boxShadow: `0 0 10px ${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3)}` }}
                initial={{ top: '15%', opacity: 0 }}
                animate={{ top: ['15%', '85%', '15%'], opacity: [0, 0.5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}

            <AnimatePresence mode="wait">
              {!battleResult ? (
                /* ============ FIGHTING PHASE ============ */
                <motion.div
                  key="fighting"
                  className="relative flex flex-col items-center z-10 w-full px-4"
                  exit={{ opacity: 0, scale: 0.8, filter: 'blur(12px)' }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="flex items-center justify-center gap-4 sm:gap-8 md:gap-16 w-full max-w-4xl relative">
                    {/* ===== NEON BEAM ATTACKS ===== */}
                    {(() => {
                      const myNeon = getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3);
                      const oppNeon = getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0);
                      const beamCount = battleAnimData?.type === '3v3' ? 3 : 1;
                      return (
                        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
                          {/* Left→Right beams (my warriors attacking) */}
                          {Array.from({ length: beamCount }).map((_, bi) => {
                            const yPos = beamCount === 1 ? 50 : 20 + bi * 30;
                            return (
                              <motion.div
                                key={`beam-lr-${bi}`}
                                className="absolute"
                                style={{
                                  left: '10%',
                                  top: `${yPos}%`,
                                  width: '80%',
                                  height: '3px',
                                  transformOrigin: 'left center',
                                }}
                                initial={{ scaleX: 0, opacity: 0 }}
                                animate={{
                                  scaleX: [0, 1, 1, 0],
                                  opacity: [0, 1, 0.8, 0],
                                  x: ['0%', '0%', '0%', '20%'],
                                }}
                                transition={{
                                  duration: 1.2,
                                  delay: 0.8 + bi * 0.15,
                                  repeat: Infinity,
                                  repeatDelay: 2.5,
                                  ease: 'easeOut',
                                  times: [0, 0.3, 0.7, 1],
                                }}
                              >
                                {/* Beam core */}
                                <div
                                  className="absolute inset-0 rounded-full"
                                  style={{ background: `linear-gradient(90deg, transparent 0%, ${myNeon} 20%, #fff 50%, ${myNeon} 80%, transparent 100%)`, boxShadow: `0 0 8px ${myNeon}, 0 0 20px ${myNeon}, 0 0 40px ${myNeon}88` }}
                                />
                                {/* Beam glow (wider) */}
                                <div
                                  className="absolute -inset-y-2 inset-x-0 rounded-full"
                                  style={{ background: `linear-gradient(90deg, transparent 0%, ${myNeon}44 20%, ${myNeon}66 50%, ${myNeon}44 80%, transparent 100%)`, filter: 'blur(4px)' }}
                                />
                                {/* Beam tip (energy ball) */}
                                <motion.div
                                  className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                                  style={{ background: '#fff', boxShadow: `0 0 8px #fff, 0 0 15px ${myNeon}, 0 0 30px ${myNeon}` }}
                                  animate={{ scale: [1, 1.4, 1] }}
                                  transition={{ duration: 0.3, repeat: Infinity }}
                                />
                              </motion.div>
                            );
                          })}

                          {/* Right→Left beams (opponent attacking) */}
                          {Array.from({ length: beamCount }).map((_, bi) => {
                            const yPos = beamCount === 1 ? 50 : 20 + bi * 30;
                            return (
                              <motion.div
                                key={`beam-rl-${bi}`}
                                className="absolute"
                                style={{
                                  right: '10%',
                                  top: `${yPos + (beamCount === 1 ? 5 : 3)}%`,
                                  width: '80%',
                                  height: '3px',
                                  transformOrigin: 'right center',
                                }}
                                initial={{ scaleX: 0, opacity: 0 }}
                                animate={{
                                  scaleX: [0, 1, 1, 0],
                                  opacity: [0, 1, 0.8, 0],
                                  x: ['0%', '0%', '0%', '-20%'],
                                }}
                                transition={{
                                  duration: 1.2,
                                  delay: 2.0 + bi * 0.15,
                                  repeat: Infinity,
                                  repeatDelay: 2.5,
                                  ease: 'easeOut',
                                  times: [0, 0.3, 0.7, 1],
                                }}
                              >
                                {/* Beam core */}
                                <div
                                  className="absolute inset-0 rounded-full"
                                  style={{ background: `linear-gradient(90deg, transparent 0%, ${oppNeon} 20%, #fff 50%, ${oppNeon} 80%, transparent 100%)`, boxShadow: `0 0 8px ${oppNeon}, 0 0 20px ${oppNeon}, 0 0 40px ${oppNeon}88` }}
                                />
                                {/* Beam glow */}
                                <div
                                  className="absolute -inset-y-2 inset-x-0 rounded-full"
                                  style={{ background: `linear-gradient(90deg, transparent 0%, ${oppNeon}44 20%, ${oppNeon}66 50%, ${oppNeon}44 80%, transparent 100%)`, filter: 'blur(4px)' }}
                                />
                                {/* Beam tip */}
                                <motion.div
                                  className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                                  style={{ background: '#fff', boxShadow: `0 0 8px #fff, 0 0 15px ${oppNeon}, 0 0 30px ${oppNeon}` }}
                                  animate={{ scale: [1, 1.4, 1] }}
                                  transition={{ duration: 0.3, repeat: Infinity }}
                                />
                              </motion.div>
                            );
                          })}

                          {/* Impact flashes when beams hit */}
                          {Array.from({ length: beamCount }).map((_, bi) => {
                            const yPos = beamCount === 1 ? 50 : 20 + bi * 30;
                            return [
                              <motion.div
                                key={`hit-r-${bi}`}
                                className="absolute w-6 h-6 rounded-full"
                                style={{ right: '12%', top: `${yPos}%`, transform: 'translate(50%, -50%)', background: myNeon, boxShadow: `0 0 15px ${myNeon}, 0 0 30px ${myNeon}` }}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: [0, 2, 0], opacity: [0, 0.8, 0] }}
                                transition={{ duration: 0.4, delay: 1.7 + bi * 0.15, repeat: Infinity, repeatDelay: 3.3 }}
                              />,
                              <motion.div
                                key={`hit-l-${bi}`}
                                className="absolute w-6 h-6 rounded-full"
                                style={{ left: '12%', top: `${yPos + (beamCount === 1 ? 5 : 3)}%`, transform: 'translate(-50%, -50%)', background: oppNeon, boxShadow: `0 0 15px ${oppNeon}, 0 0 30px ${oppNeon}` }}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: [0, 2, 0], opacity: [0, 0.8, 0] }}
                                transition={{ duration: 0.4, delay: 2.9 + bi * 0.15, repeat: Infinity, repeatDelay: 3.3 }}
                              />,
                            ];
                          })}
                        </div>
                      );
                    })()}

                    {/* MY WARRIORS (Left) */}
                    <motion.div
                      className={cn('flex gap-4', battleAnimData?.type === '3v3' ? 'flex-col' : '')}
                      initial={{ x: -200, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    >
                      {(battleAnimData?.myWarriors ?? []).map((w, i) => {
                        const neon = getNeonColor(w.element);
                        const el = getElement(w.element);
                        const imgSize = battleAnimData?.type === '3v3' ? 90 : 140;
                        return (
                          <motion.div
                            key={w.tokenId}
                            className="relative flex flex-col items-center"
                            initial={{ x: -100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.1 + i * 0.15, type: 'spring', stiffness: 200, damping: 18 }}
                          >
                            {/* Neon outer glow */}
                            <motion.div
                              className="absolute -inset-3 rounded-2xl pointer-events-none"
                              style={{ boxShadow: `0 0 20px ${neon}66, 0 0 40px ${neon}33, inset 0 0 20px ${neon}22` }}
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            {/* Neon background bloom */}
                            <motion.div
                              className="absolute inset-0 rounded-2xl blur-3xl pointer-events-none"
                              style={{ background: neon }}
                              animate={{ scale: [1, 1.4, 1], opacity: [0.15, 0.35, 0.15] }}
                              transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            {/* Attack lunge */}
                            <motion.div
                              animate={{
                                x: [0, 25, 0, 0, 25, 0, 0, 25, 0],
                                rotate: [0, 3, 0, 0, -2, 0, 0, 3, 0],
                              }}
                              transition={{
                                duration: 4.5,
                                times: [0, 0.08, 0.15, 0.33, 0.41, 0.48, 0.66, 0.74, 0.81],
                                ease: 'easeInOut',
                                repeat: Infinity,
                                delay: i * 0.4,
                              }}
                            >
                              <div
                                className="rounded-2xl overflow-hidden relative z-10"
                                style={{ boxShadow: `0 0 15px ${neon}88, 0 0 30px ${neon}44, 0 4px 20px rgba(0,0,0,0.5)`, border: `2px solid ${neon}88` }}
                              >
                                <WarriorImage tokenId={w.tokenId} element={w.element} size={imgSize} className="" />
                              </div>
                            </motion.div>
                            {/* Neon name badge */}
                            <motion.div
                              className="mt-2 text-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.5 + i * 0.1 }}
                            >
                              <span className="text-xs font-mono font-bold" style={{ color: neon, textShadow: `0 0 8px ${neon}` }}>#{w.tokenId}</span>
                              <span className="ml-1 text-[10px]">{el.emoji}</span>
                              <div className="text-[9px] font-pixel" style={{ color: `${neon}aa`, textShadow: `0 0 4px ${neon}` }}>PWR {w.powerScore}</div>
                            </motion.div>
                          </motion.div>
                        );
                      })}
                    </motion.div>

                    {/* CENTER - VS + Neon Clash */}
                    <div className="relative flex flex-col items-center gap-4 flex-shrink-0">
                      {/* Neon rotating rings */}
                      <motion.div
                        className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full pointer-events-none"
                        style={{ boxShadow: `0 0 15px ${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3)}44` , border: `1px solid ${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3)}66` }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      />
                      <motion.div
                        className="absolute w-28 h-28 sm:w-36 sm:h-36 rounded-full pointer-events-none"
                        style={{ boxShadow: `0 0 15px ${getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0)}44`, border: `1px solid ${getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0)}66` }}
                        animate={{ rotate: -360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      />
                      {/* Crossed swords with neon glow */}
                      <div className="relative w-20 h-20 flex items-center justify-center">
                        <motion.div
                          className="absolute"
                          animate={{ x: [-20, 0, -20], rotate: [-45, -15, -45] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <Sword className="w-10 h-10" style={{ color: getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3), filter: `drop-shadow(0 0 12px ${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3)})` }} />
                        </motion.div>
                        <motion.div
                          className="absolute"
                          style={{ scaleX: -1 }}
                          animate={{ x: [20, 0, 20], rotate: [45, 15, 45] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <Sword className="w-10 h-10" style={{ color: getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0), filter: `drop-shadow(0 0 12px ${getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0)})` }} />
                        </motion.div>
                        {/* Neon clash burst */}
                        <motion.div
                          className="absolute w-8 h-8 rounded-full pointer-events-none"
                          style={{ background: '#fff', boxShadow: '0 0 20px #fff, 0 0 40px #00d4ff' }}
                          animate={{ scale: [0.3, 1.5, 0.3], opacity: [0, 0.9, 0] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      </div>
                      {/* Neon VS text */}
                      <motion.div
                        className="font-display text-3xl sm:text-4xl font-black relative"
                        style={{ color: '#fff', textShadow: '0 0 10px #00d4ff, 0 0 20px #00d4ff, 0 0 40px #00d4ff, 0 0 80px #0066ff' }}
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        VS
                      </motion.div>
                      {/* Status */}
                      <motion.div
                        className="text-xs font-pixel flex items-center gap-1.5"
                        style={{ color: '#00d4ffcc', textShadow: '0 0 6px #00d4ff' }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Resolving...
                      </motion.div>
                      {/* Neon progress bar */}
                      <div className="w-36 sm:w-48 h-1.5 rounded-full bg-white/5 overflow-hidden relative" style={{ boxShadow: '0 0 5px rgba(0,212,255,0.2)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${getNeonColor(battleAnimData?.myWarriors[0]?.element ?? 3)}, #a855f7, ${getNeonColor(battleAnimData?.opponentWarriors[0]?.element ?? 0)})`, boxShadow: '0 0 10px rgba(168,85,247,0.5)' }}
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 5, ease: 'easeInOut' }}
                        />
                      </div>
                    </div>

                    {/* OPPONENT WARRIORS (Right) */}
                    <motion.div
                      className={cn('flex gap-4', battleAnimData?.type === '3v3' ? 'flex-col' : '')}
                      initial={{ x: 200, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    >
                      {(battleAnimData?.opponentWarriors ?? []).map((w, i) => {
                        const neon = getNeonColor(w.element);
                        const el = getElement(w.element);
                        const imgSize = battleAnimData?.type === '3v3' ? 90 : 140;
                        return (
                          <motion.div
                            key={w.tokenId}
                            className="relative flex flex-col items-center"
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.1 + i * 0.15, type: 'spring', stiffness: 200, damping: 18 }}
                          >
                            {/* Neon outer glow */}
                            <motion.div
                              className="absolute -inset-3 rounded-2xl pointer-events-none"
                              style={{ boxShadow: `0 0 20px ${neon}66, 0 0 40px ${neon}33, inset 0 0 20px ${neon}22` }}
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.5, delay: i * 0.3 + 0.2, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            {/* Neon background bloom */}
                            <motion.div
                              className="absolute inset-0 rounded-2xl blur-3xl pointer-events-none"
                              style={{ background: neon }}
                              animate={{ scale: [1, 1.4, 1], opacity: [0.15, 0.35, 0.15] }}
                              transition={{ duration: 1.5, delay: i * 0.3 + 0.2, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            {/* Attack lunge (opposite direction) */}
                            <motion.div
                              animate={{
                                x: [0, -25, 0, 0, -25, 0, 0, -25, 0],
                                rotate: [0, -3, 0, 0, 2, 0, 0, -3, 0],
                              }}
                              transition={{
                                duration: 4.5,
                                times: [0, 0.08, 0.15, 0.33, 0.41, 0.48, 0.66, 0.74, 0.81],
                                ease: 'easeInOut',
                                repeat: Infinity,
                                delay: i * 0.4,
                              }}
                            >
                              <div
                                className="rounded-2xl overflow-hidden relative z-10"
                                style={{ boxShadow: `0 0 15px ${neon}88, 0 0 30px ${neon}44, 0 4px 20px rgba(0,0,0,0.5)`, border: `2px solid ${neon}88` }}
                              >
                                <WarriorImage tokenId={w.tokenId} element={w.element} size={imgSize} className="" />
                              </div>
                            </motion.div>
                            {/* Neon name badge */}
                            <motion.div
                              className="mt-2 text-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.5 + i * 0.1 }}
                            >
                              <span className="text-xs font-mono font-bold" style={{ color: neon, textShadow: `0 0 8px ${neon}` }}>#{w.tokenId}</span>
                              <span className="ml-1 text-[10px]">{el.emoji}</span>
                              <div className="text-[9px] font-pixel" style={{ color: `${neon}aa`, textShadow: `0 0 4px ${neon}` }}>PWR {w.powerScore}</div>
                            </motion.div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                /* ============ RESULT PHASE — NEON ============ */
                <motion.div
                  key="result"
                  className="relative flex flex-col items-center z-10 w-full px-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {/* Neon explosion rings */}
                  {[0, 1].map((ri) => (
                    <motion.div
                      key={`er-${ri}`}
                      className="absolute rounded-full pointer-events-none"
                      style={{
                        border: `2px solid ${battleResult === 'won' ? '#ffd700' : '#ff3366'}`,
                        boxShadow: `0 0 20px ${battleResult === 'won' ? '#ffd70066' : '#ff336666'}`,
                      }}
                      initial={{ width: 0, height: 0, opacity: 1 }}
                      animate={{ width: 400 + ri * 200, height: 400 + ri * 200, opacity: 0 }}
                      transition={{ duration: 1 + ri * 0.3, delay: ri * 0.2, ease: 'easeOut' }}
                    />
                  ))}

                  <div className="flex items-center justify-center gap-6 sm:gap-10 md:gap-16 w-full max-w-4xl mb-8">
                    {/* My warriors — result */}
                    <motion.div
                      className={cn('flex gap-3', battleAnimData?.type === '3v3' ? 'flex-col' : '')}
                      initial={{ x: -50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      {(battleAnimData?.myWarriors ?? []).map((w, i) => {
                        const neon = getNeonColor(w.element);
                        const el = getElement(w.element);
                        const imgSize = battleAnimData?.type === '3v3' ? 80 : 120;
                        const isWinner = battleResult === 'won';
                        const glowNeon = isWinner ? '#ffd700' : neon;
                        return (
                          <motion.div
                            key={w.tokenId}
                            className="relative flex flex-col items-center"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                              scale: isWinner ? [0.8, 1.1, 1.05] : [0.8, 0.85],
                              opacity: isWinner ? 1 : 0.35,
                              filter: isWinner ? 'grayscale(0%) brightness(1.1)' : 'grayscale(80%) brightness(0.5)',
                            }}
                            transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
                          >
                            {/* Winner neon halo */}
                            {isWinner && (
                              <motion.div
                                className="absolute -inset-4 rounded-2xl pointer-events-none"
                                style={{ boxShadow: `0 0 25px ${glowNeon}88, 0 0 50px ${glowNeon}44, 0 0 80px ${glowNeon}22` }}
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                              />
                            )}
                            <div
                              className="rounded-2xl overflow-hidden relative z-10"
                              style={{
                                boxShadow: isWinner ? `0 0 20px ${glowNeon}88, 0 0 40px ${glowNeon}44` : 'none',
                                border: isWinner ? `2px solid ${glowNeon}aa` : '2px solid rgba(255,255,255,0.08)',
                              }}
                            >
                              <WarriorImage tokenId={w.tokenId} element={w.element} size={imgSize} className="" />
                            </div>
                            <div className="mt-1.5 text-center">
                              <span className="text-[10px] font-mono font-bold" style={{ color: isWinner ? glowNeon : '#ffffff55', textShadow: isWinner ? `0 0 6px ${glowNeon}` : 'none' }}>#{w.tokenId}</span>
                              <span className="ml-1 text-[9px]">{el.emoji}</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>

                    {/* Center Result — Neon */}
                    <motion.div
                      className="flex flex-col items-center gap-3 flex-shrink-0"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
                    >
                      <motion.div
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center relative"
                        style={{
                          background: battleResult === 'won' ? 'rgba(255,215,0,0.1)' : 'rgba(255,51,102,0.1)',
                          boxShadow: battleResult === 'won'
                            ? '0 0 30px rgba(255,215,0,0.3), 0 0 60px rgba(255,215,0,0.15), inset 0 0 30px rgba(255,215,0,0.1)'
                            : '0 0 30px rgba(255,51,102,0.3), 0 0 60px rgba(255,51,102,0.15), inset 0 0 30px rgba(255,51,102,0.1)',
                          border: `2px solid ${battleResult === 'won' ? 'rgba(255,215,0,0.5)' : 'rgba(255,51,102,0.5)'}`,
                        }}
                        initial={{ rotate: -180 }}
                        animate={{ rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                      >
                        <motion.div
                          className="absolute inset-0 rounded-full blur-2xl pointer-events-none"
                          style={{ background: battleResult === 'won' ? '#ffd700' : '#ff3366' }}
                          animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.5, 0.2] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        {battleResult === 'won' ? (
                          <Trophy className="w-12 h-12 sm:w-14 sm:h-14 relative z-10" style={{ color: '#ffd700', filter: 'drop-shadow(0 0 15px rgba(255,215,0,0.7))' }} />
                        ) : (
                          <Shield className="w-12 h-12 sm:w-14 sm:h-14 relative z-10" style={{ color: '#ff3366', filter: 'drop-shadow(0 0 15px rgba(255,51,102,0.7))' }} />
                        )}
                      </motion.div>

                      <motion.h2
                        className="font-display text-3xl sm:text-4xl font-bold"
                        style={{
                          color: battleResult === 'won' ? '#ffd700' : '#ff3366',
                          textShadow: battleResult === 'won'
                            ? '0 0 10px #ffd700, 0 0 20px #ffd700, 0 0 40px #ff8800'
                            : '0 0 10px #ff3366, 0 0 20px #ff3366, 0 0 40px #ff0044',
                        }}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: [0.5, 1.15, 1], opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                      >
                        {battleResult === 'won' ? 'Victory!' : 'Defeat'}
                      </motion.h2>

                      <motion.p
                        className="text-white/50 text-xs sm:text-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        {battleResult === 'won'
                          ? (battleAnimData?.type === '3v3' ? 'Your team dominated the arena!' : 'Your warrior has triumphed!')
                          : 'Better luck next time, warrior.'}
                      </motion.p>

                      <motion.button
                        className="relative z-20 mt-2 px-10 py-3 rounded-xl font-display text-sm font-bold text-white transition-colors cursor-pointer"
                        style={{
                          background: battleResult === 'won' ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${battleResult === 'won' ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.15)'}`,
                          boxShadow: battleResult === 'won' ? '0 0 15px rgba(255,215,0,0.15)' : '0 0 10px rgba(255,255,255,0.05)',
                        }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        onClick={() => {
                          setBattleAnimating(false);
                          setBattleResult(null);
                          setBattleAnimData(null);
                          pendingBattleRef.current = null;
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Continue
                      </motion.button>
                    </motion.div>

                    {/* Opponent warriors — result */}
                    <motion.div
                      className={cn('flex gap-3', battleAnimData?.type === '3v3' ? 'flex-col' : '')}
                      initial={{ x: 50, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      {(battleAnimData?.opponentWarriors ?? []).map((w, i) => {
                        const neon = getNeonColor(w.element);
                        const el = getElement(w.element);
                        const imgSize = battleAnimData?.type === '3v3' ? 80 : 120;
                        const isWinner = battleResult === 'lost';
                        const glowNeon = isWinner ? '#ffd700' : neon;
                        return (
                          <motion.div
                            key={w.tokenId}
                            className="relative flex flex-col items-center"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                              scale: isWinner ? [0.8, 1.1, 1.05] : [0.8, 0.85],
                              opacity: isWinner ? 1 : 0.35,
                              filter: isWinner ? 'grayscale(0%) brightness(1.1)' : 'grayscale(80%) brightness(0.5)',
                            }}
                            transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
                          >
                            {isWinner && (
                              <motion.div
                                className="absolute -inset-4 rounded-2xl pointer-events-none"
                                style={{ boxShadow: `0 0 25px ${glowNeon}88, 0 0 50px ${glowNeon}44, 0 0 80px ${glowNeon}22` }}
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                              />
                            )}
                            <div
                              className="rounded-2xl overflow-hidden relative z-10"
                              style={{
                                boxShadow: isWinner ? `0 0 20px ${glowNeon}88, 0 0 40px ${glowNeon}44` : 'none',
                                border: isWinner ? `2px solid ${glowNeon}aa` : '2px solid rgba(255,255,255,0.08)',
                              }}
                            >
                              <WarriorImage tokenId={w.tokenId} element={w.element} size={imgSize} className="" />
                            </div>
                            <div className="mt-1.5 text-center">
                              <span className="text-[10px] font-mono font-bold" style={{ color: isWinner ? glowNeon : '#ffffff55', textShadow: isWinner ? `0 0 6px ${glowNeon}` : 'none' }}>#{w.tokenId}</span>
                              <span className="ml-1 text-[9px]">{el.emoji}</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
