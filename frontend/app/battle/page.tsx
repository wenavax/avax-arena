'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sword,
  Shield,
  Zap,
  Sparkles,
  Trophy,
  Clock,
  ArrowRight,
  Loader2,
  XCircle,
} from 'lucide-react';
import { ELEMENTS, MIN_BATTLE_STAKE, ELEMENT_ADVANTAGES, CONTRACT_ADDRESSES, FUJI_CHAIN_ID } from '@/lib/constants';
import { BATTLE_ENGINE_ABI, FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
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
          ? 'ring-2 ring-frost-cyan shadow-[0_0_20px_rgba(0,240,255,0.2)]'
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
                      background: ['#00f0ff', '#7b2ff7', '#ff2d87', '#ffd700', '#00ff88'][i % 5],
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
                  <h2 className="font-display text-3xl sm:text-4xl font-black text-frost-gold text-glow-green">
                    VICTORY!
                  </h2>
                  <p className="text-frost-green text-sm mt-1 font-semibold">
                    +{stakeAmount} AVAX earned
                  </p>
                </>
              ) : (
                <>
                  <Shield className="w-12 h-12 text-frost-red mx-auto mb-2" />
                  <h2 className="font-display text-3xl sm:text-4xl font-black text-frost-red">
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
                  <span className="font-display font-black text-white text-lg sm:text-xl">VS</span>
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
              <h4 className="text-xs uppercase tracking-wider text-white/40 mb-3 font-semibold">
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
 * Sections
 * ------------------------------------------------------------------------- */

function HeroSection({ battleCount, openCount }: { battleCount: number; openCount: number }) {
  return (
    <section className="relative text-center py-16 sm:py-20 px-4 overflow-hidden">
      <div className="orb w-80 h-80 bg-frost-pink top-0 -left-32 opacity-20" />
      <div className="orb w-96 h-96 bg-frost-purple -top-20 -right-40 opacity-20" style={{ animationDelay: '3s' }} />

      <motion.div
        className="relative z-10 max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <Sword className="w-8 h-8 text-frost-pink" />
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black">
            <span className="gradient-text">FROSTBITE BATTLE</span>
          </h1>
          <Sword className="w-8 h-8 text-frost-pink transform scale-x-[-1]" />
        </div>

        <p className="text-lg sm:text-xl text-white/50 mb-8 font-medium">
          Stake AVAX. Battle NFTs. Claim Victory.
        </p>

        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          {[
            { label: 'Open Battles', value: String(openCount), icon: Zap },
            { label: 'Your Battles', value: String(battleCount), icon: Trophy },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="stat-card"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <stat.icon className="w-5 h-5 text-frost-cyan mx-auto mb-1.5" />
              <div className="text-lg sm:text-xl font-mono font-bold text-white">{stat.value}</div>
              <div className="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider mt-0.5">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Create Battle Section
 * ------------------------------------------------------------------------- */

function CreateBattleSection({
  warriors,
  isConnected,
  isLoading,
  onSuccess,
}: {
  warriors: Warrior[];
  isConnected: boolean;
  isLoading: boolean;
  onSuccess: () => void;
}) {
  const [selectedWarrior, setSelectedWarrior] = useState<Warrior | null>(null);
  const [stakeAmount, setStakeAmount] = useState(MIN_BATTLE_STAKE);
  const [error, setError] = useState<string | null>(null);

  const {
    writeContract: createBattle,
    data: createTxHash,
    isPending: isCreatePending,
    error: createError,
    reset: resetCreate,
  } = useWriteContract();

  const { isLoading: isCreateConfirming, isSuccess: isCreateSuccess } =
    useWaitForTransactionReceipt({ hash: createTxHash });

  // Handle success
  useEffect(() => {
    if (isCreateSuccess) {
      setSelectedWarrior(null);
      setStakeAmount(MIN_BATTLE_STAKE);
      setError(null);
      resetCreate();
      onSuccess();
    }
  }, [isCreateSuccess, onSuccess, resetCreate]);

  // Handle error
  useEffect(() => {
    if (createError) {
      const msg = createError.message || 'Transaction failed';
      if (msg.includes('InsufficientStake')) {
        setError(`Minimum stake is ${MIN_BATTLE_STAKE} AVAX`);
      } else if (msg.includes('NotWarriorOwner') || msg.includes('NotOwner')) {
        setError('You do not own this warrior');
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) {
        setError('Insufficient AVAX balance');
      } else if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction cancelled');
      } else {
        const short = (createError as { shortMessage?: string }).shortMessage;
        setError(short || 'Failed to create battle');
      }
    }
  }, [createError]);

  const isValidStake = useMemo(() => {
    const amount = parseFloat(stakeAmount);
    return !isNaN(amount) && amount >= parseFloat(MIN_BATTLE_STAKE);
  }, [stakeAmount]);

  const isWorking = isCreatePending || isCreateConfirming;

  const handleCreate = useCallback(() => {
    if (!selectedWarrior || !isValidStake) return;
    setError(null);
    createBattle({
      address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
      abi: BATTLE_ENGINE_ABI,
      functionName: 'createBattle',
      args: [BigInt(selectedWarrior.tokenId)],
      value: parseEther(stakeAmount),
      chainId: FUJI_CHAIN_ID,
    });
  }, [selectedWarrior, isValidStake, stakeAmount, createBattle]);

  return (
    <section className="px-4 pb-16">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Sword className="w-5 h-5 text-frost-cyan" />
            <h2 className="font-display text-2xl font-bold text-white">Create Battle</h2>
          </div>

          <div className="glass-card p-6">
            {!isConnected ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 text-lg font-semibold mb-2">Wallet Not Connected</p>
                <p className="text-white/25 text-sm">Connect your wallet to create battles and stake AVAX</p>
              </div>
            ) : isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-frost-cyan mx-auto mb-3 animate-spin" />
                <p className="text-white/40 text-sm">Loading your warriors...</p>
              </div>
            ) : warriors.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 text-lg font-semibold mb-2">No Warriors Found</p>
                <p className="text-white/25 text-sm">Mint a warrior first to enter Frostbite!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Warrior Selection */}
                <div>
                  <label className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-3 block">
                    Select Your Warrior
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

                {/* Right: Stake & Action */}
                <div className="flex flex-col">
                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-wider text-white/40 font-semibold mb-2 block">
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
                          'w-full bg-white/[0.04] border rounded-xl px-4 py-3 font-mono text-white',
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
                    <p className="text-[10px] text-white/30 mt-1.5">
                      Minimum stake: {MIN_BATTLE_STAKE} AVAX
                    </p>
                  </div>

                  {/* Quick Stake Buttons */}
                  <div className="flex gap-2 mb-4">
                    {['0.005', '0.01', '0.05', '0.1'].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setStakeAmount(amount)}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg text-xs font-mono transition-all',
                          stakeAmount === amount
                            ? 'bg-frost-cyan/20 text-frost-cyan border border-frost-cyan/30'
                            : 'bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06] hover:text-white/60',
                        )}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>

                  {/* Selected warrior preview */}
                  <div className="flex-1">
                    {selectedWarrior ? (
                      <WarriorStatsPreview warrior={selectedWarrior} />
                    ) : (
                      <div className="glass-card p-6 mt-4 flex items-center justify-center h-[180px]">
                        <p className="text-white/20 text-sm text-center">
                          Select a warrior to see stats
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Error display */}
                  {error && (
                    <div className="mt-3 flex items-center gap-2 text-frost-red text-xs bg-frost-red/10 rounded-lg px-3 py-2">
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Create Button */}
                  <motion.button
                    onClick={handleCreate}
                    disabled={!selectedWarrior || !isValidStake || isWorking}
                    className={cn(
                      'mt-4 w-full py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2',
                      selectedWarrior && isValidStake && !isWorking
                        ? 'btn-primary'
                        : 'bg-white/5 text-white/20 cursor-not-allowed',
                    )}
                    whileHover={selectedWarrior && isValidStake && !isWorking ? { scale: 1.02 } : {}}
                    whileTap={selectedWarrior && isValidStake && !isWorking ? { scale: 0.98 } : {}}
                  >
                    {isWorking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {isCreatePending ? 'Confirm in Wallet...' : 'Creating Battle...'}
                      </>
                    ) : (
                      <>
                        <Sword className="w-4 h-4" />
                        Create Battle ({stakeAmount} AVAX)
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Open Battles Section
 * ------------------------------------------------------------------------- */

function OpenBattlesSection({
  battles,
  warriors,
  isConnected,
  isLoading,
  onSuccess,
  currentAddress,
}: {
  battles: (Battle & { creatorWarrior: Warrior })[];
  warriors: Warrior[];
  isConnected: boolean;
  isLoading: boolean;
  onSuccess: () => void;
  currentAddress?: string;
}) {
  const [joiningBattleId, setJoiningBattleId] = useState<number | null>(null);
  const [selectedJoinWarrior, setSelectedJoinWarrior] = useState<Warrior | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    writeContract: joinBattle,
    data: joinTxHash,
    isPending: isJoinPending,
    error: joinError,
    reset: resetJoin,
  } = useWriteContract();

  const {
    writeContract: cancelBattle,
    data: cancelTxHash,
    isPending: isCancelPending,
    error: cancelError,
    reset: resetCancel,
  } = useWriteContract();

  const { isLoading: isJoinConfirming, isSuccess: isJoinSuccess } =
    useWaitForTransactionReceipt({ hash: joinTxHash });

  const { isLoading: isCancelConfirming, isSuccess: isCancelSuccess } =
    useWaitForTransactionReceipt({ hash: cancelTxHash });

  // Handle join success
  useEffect(() => {
    if (isJoinSuccess) {
      setJoiningBattleId(null);
      setSelectedJoinWarrior(null);
      setError(null);
      resetJoin();
      onSuccess();
    }
  }, [isJoinSuccess, onSuccess, resetJoin]);

  // Handle cancel success
  useEffect(() => {
    if (isCancelSuccess) {
      setError(null);
      resetCancel();
      onSuccess();
    }
  }, [isCancelSuccess, onSuccess, resetCancel]);

  // Handle errors
  useEffect(() => {
    const err = joinError || cancelError;
    if (err) {
      const msg = err.message || '';
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Transaction cancelled');
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) {
        setError('Insufficient AVAX balance');
      } else {
        const short = (err as { shortMessage?: string }).shortMessage;
        setError(short || 'Transaction failed');
      }
    }
  }, [joinError, cancelError]);

  const handleJoin = useCallback((battle: Battle) => {
    if (!selectedJoinWarrior) return;
    setError(null);
    joinBattle({
      address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
      abi: BATTLE_ENGINE_ABI,
      functionName: 'joinBattle',
      args: [BigInt(battle.id), BigInt(selectedJoinWarrior.tokenId)],
      value: battle.stake,
      chainId: FUJI_CHAIN_ID,
    });
  }, [selectedJoinWarrior, joinBattle]);

  const handleCancel = useCallback((battleId: number) => {
    setError(null);
    cancelBattle({
      address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
      abi: BATTLE_ENGINE_ABI,
      functionName: 'cancelBattle',
      args: [BigInt(battleId)],
      chainId: FUJI_CHAIN_ID,
    });
  }, [cancelBattle]);

  const isWorking = isJoinPending || isJoinConfirming || isCancelPending || isCancelConfirming;

  return (
    <section className="px-4 pb-16">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-frost-purple" />
            <h2 className="font-display text-2xl font-bold text-white">Open Battles</h2>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-frost-green/10 text-frost-green text-xs font-mono font-bold">
              {battles.length} available
            </span>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 text-frost-red text-xs bg-frost-red/10 rounded-lg px-3 py-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-white/40 hover:text-white/60">
                <XCircle className="w-3 h-3" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="glass-card p-12 text-center">
              <Loader2 className="w-8 h-8 text-frost-cyan mx-auto mb-3 animate-spin" />
              <p className="text-white/30">Loading open battles...</p>
            </div>
          ) : battles.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Sword className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-white/30">No open battles. Be the first to create one!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {battles.map((battle, i) => {
                const element = getElement(battle.creatorWarrior.element);
                const stakeFormatted = formatEther(battle.stake);
                const isJoining = joiningBattleId === battle.id;
                const isMyBattle = currentAddress && battle.player1.toLowerCase() === currentAddress.toLowerCase();

                return (
                  <motion.div
                    key={battle.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="glass-card p-5 flex flex-col relative overflow-hidden group"
                    style={{
                      borderTop: `3px solid ${element.glowColor.replace('0.3', '0.6')}`,
                    }}
                  >
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{
                        background: `radial-gradient(ellipse at top, ${element.glowColor}, transparent 70%)`,
                      }}
                    />

                    <div className="relative z-10">
                      {/* Creator info */}
                      <div className="flex items-center gap-2 mb-3">
                        <WarriorImage
                          tokenId={battle.creatorWarrior.tokenId}
                          element={battle.creatorWarrior.element}
                          size={40}
                          className="rounded-lg ring-1 ring-white/10"
                        />
                        <div className="min-w-0 flex-1">
                          <span className={cn(
                            'text-xs font-semibold bg-gradient-to-r bg-clip-text text-transparent',
                            element.color,
                          )}>
                            {element.name}
                          </span>
                          <div className="text-[10px] text-white/30 font-mono truncate">
                            {isMyBattle ? 'You' : shortenAddress(battle.player1)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-frost-cyan text-sm">
                            #{battle.creatorWarrior.tokenId}
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-white/[0.03] rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-white/30 uppercase">Power</div>
                          <div className="font-mono font-bold text-white text-xs">
                            {battle.creatorWarrior.powerScore}
                          </div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-white/30 uppercase">Level</div>
                          <div className="font-mono font-bold text-white text-xs">
                            {battle.creatorWarrior.level}
                          </div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] text-white/30 uppercase">W/L</div>
                          <div className="font-mono font-bold text-white text-xs">
                            {battle.creatorWarrior.battleWins}/{battle.creatorWarrior.battleLosses}
                          </div>
                        </div>
                      </div>

                      {/* Stake & Time */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-frost-gold" />
                          <span className="font-mono font-bold text-frost-gold text-sm">
                            {stakeFormatted} AVAX
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-white/30 text-[10px]">
                          <Clock className="w-3 h-3" />
                          {timeAgo(battle.createdAt)}
                        </div>
                      </div>

                      {/* Actions */}
                      <AnimatePresence mode="wait">
                        {isMyBattle ? (
                          <motion.button
                            key="cancel-btn"
                            onClick={() => handleCancel(battle.id)}
                            disabled={isWorking}
                            className={cn(
                              'w-full py-2.5 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                              !isWorking
                                ? 'bg-frost-red/10 text-frost-red border border-frost-red/20 hover:bg-frost-red/20'
                                : 'bg-white/5 text-white/20 cursor-not-allowed',
                            )}
                            whileHover={!isWorking ? { scale: 1.03 } : {}}
                            whileTap={!isWorking ? { scale: 0.97 } : {}}
                          >
                            {isCancelPending || isCancelConfirming ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            Cancel Battle
                          </motion.button>
                        ) : isJoining ? (
                          <motion.div
                            key="joining"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-2"
                          >
                            <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold block">
                              Choose Your Warrior
                            </label>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                              {warriors.map((w) => (
                                <WarriorMiniCard
                                  key={w.tokenId}
                                  warrior={w}
                                  selected={selectedJoinWarrior?.tokenId === w.tokenId}
                                  onClick={() => setSelectedJoinWarrior(w)}
                                  size="small"
                                />
                              ))}
                              {warriors.length === 0 && (
                                <p className="text-white/30 text-xs text-center py-2">No warriors to fight with</p>
                              )}
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => {
                                  setJoiningBattleId(null);
                                  setSelectedJoinWarrior(null);
                                }}
                                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white/5 text-white/40 hover:bg-white/10 transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleJoin(battle)}
                                disabled={!selectedJoinWarrior || isWorking}
                                className={cn(
                                  'flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1',
                                  selectedJoinWarrior && !isWorking
                                    ? 'bg-gradient-to-r from-frost-cyan to-frost-purple text-white'
                                    : 'bg-white/5 text-white/20 cursor-not-allowed',
                                )}
                              >
                                {isJoinPending || isJoinConfirming ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sword className="w-3 h-3" />
                                )}
                                Fight! ({stakeFormatted} AVAX)
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.button
                            key="join-btn"
                            onClick={() => {
                              if (!isConnected) return;
                              setJoiningBattleId(battle.id);
                            }}
                            className={cn(
                              'w-full py-2.5 rounded-xl font-semibold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5',
                              isConnected
                                ? 'btn-neon btn-neon-cyan'
                                : 'bg-white/5 text-white/20 cursor-not-allowed',
                            )}
                            whileHover={isConnected ? { scale: 1.03 } : {}}
                            whileTap={isConnected ? { scale: 0.97 } : {}}
                          >
                            <Sword className="w-3.5 h-3.5" />
                            {isConnected ? 'Join Battle' : 'Connect Wallet'}
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Battle History Section
 * ------------------------------------------------------------------------- */

function BattleHistorySection({
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
  if (!isConnected) {
    return (
      <section className="px-4 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-frost-gold" />
            <h2 className="font-display text-2xl font-bold text-white">Battle History</h2>
          </div>
          <div className="glass-card p-12 text-center">
            <Clock className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-white/30">Connect wallet to view your battle history</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-16">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-frost-gold" />
            <h2 className="font-display text-2xl font-bold text-white">Battle History</h2>
          </div>

          {isLoading ? (
            <div className="glass-card p-12 text-center">
              <Loader2 className="w-8 h-8 text-frost-cyan mx-auto mb-3 animate-spin" />
              <p className="text-white/30">Loading battle history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <Sword className="w-8 h-8 text-white/10 mx-auto mb-2" />
              <p className="text-white/25 text-sm">No battles yet. Enter Frostbite!</p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="frost-table">
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
                          transition={{ delay: 0.05 * i }}
                          className="cursor-pointer"
                          onClick={() => onViewResult(battle)}
                        >
                          <td>
                            <span className="font-mono text-sm text-frost-cyan font-bold">
                              #{battle.id}
                            </span>
                          </td>
                          <td>
                            <span className="font-mono text-sm text-white/60">
                              {shortenAddress(opponent)}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <WarriorImage
                                tokenId={battle.myWarrior.tokenId}
                                element={battle.myWarrior.element}
                                size={28}
                                className="rounded-md"
                              />
                              <span className="font-mono text-xs text-white/80">
                                #{battle.myWarrior.tokenId}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <WarriorImage
                                tokenId={battle.theirWarrior.tokenId}
                                element={battle.theirWarrior.element}
                                size={28}
                                className="rounded-md"
                              />
                              <span className="font-mono text-xs text-white/80">
                                #{battle.theirWarrior.tokenId}
                              </span>
                            </div>
                          </td>
                          <td className="text-right">
                            <span className="font-mono text-sm text-frost-gold font-semibold">
                              {formatEther(battle.stake)}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase',
                              isWinner
                                ? 'bg-frost-green/10 text-frost-green ring-1 ring-frost-green/20'
                                : 'bg-frost-red/10 text-frost-red ring-1 ring-frost-red/20',
                            )}>
                              {isWinner ? (
                                <>
                                  <Trophy className="w-3 h-3" />
                                  Win
                                </>
                              ) : (
                                <>
                                  <Shield className="w-3 h-3" />
                                  Loss
                                </>
                              )}
                            </span>
                          </td>
                          <td className="text-right">
                            <span className="text-xs text-white/40 font-mono">
                              {formatDate(battle.resolvedAt)}
                            </span>
                          </td>
                          <td>
                            <ArrowRight className="w-4 h-4 text-white/20" />
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Page Component
 * ------------------------------------------------------------------------- */

export default function BattlePage() {
  const { address, isConnected } = useAccount();
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedBattleResult, setSelectedBattleResult] = useState<
    (Battle & { myWarrior: Warrior; theirWarrior: Warrior }) | null
  >(null);

  const {
    warriors,
    openBattles,
    battleHistory,
    isLoadingWarriors,
    isLoadingBattles,
    isLoadingHistory,
    refetch,
  } = useBattleData(address, isConnected);

  const handleViewResult = useCallback(
    (battle: Battle & { myWarrior: Warrior; theirWarrior: Warrior }) => {
      setSelectedBattleResult(battle);
      setShowResultModal(true);
    },
    [],
  );

  // Refetch on success with a short delay
  const handleSuccess = useCallback(() => {
    setTimeout(() => refetch(), 2000);
  }, [refetch]);

  return (
    <div className="min-h-screen">
      <HeroSection
        battleCount={battleHistory.length}
        openCount={openBattles.length}
      />

      <CreateBattleSection
        warriors={warriors}
        isConnected={isConnected}
        isLoading={isLoadingWarriors}
        onSuccess={handleSuccess}
      />

      <OpenBattlesSection
        battles={openBattles}
        warriors={warriors}
        isConnected={isConnected}
        isLoading={isLoadingBattles}
        onSuccess={handleSuccess}
        currentAddress={address}
      />

      <BattleHistorySection
        history={battleHistory}
        isConnected={isConnected}
        isLoading={isLoadingHistory}
        onViewResult={handleViewResult}
        currentAddress={address}
      />

      {/* Battle Result Modal */}
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
    </div>
  );
}
