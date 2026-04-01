'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  GitMerge,
  Sword,
  Shield,
  Zap,
  Sparkles,
  Loader2,
  Wallet,
  Check,
  Plus,
  ArrowRight,
  ArrowUpDown,
  X,
  Flame,
  Droplets,
  Wind,
  Snowflake,
  Mountain,
  CloudLightning,
  Moon,
  Sun,
  Hash,
  Trophy,
  Skull,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { ELEMENTS, MERGE_PRICE, CONTRACT_ADDRESSES, ACTIVE_CHAIN_ID } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI, TEAM_BATTLE_ABI, QUEST_ENGINE_ABI, MARKETPLACE_ABI, FROSTBITE_ACCOUNT_ABI } from '@/lib/contracts';
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { parseEther, decodeEventLog, formatEther, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { getWarriorTBAAddress, isAccountDeployed, getAccountBalance } from '@/lib/tba';

/* ---------------------------------------------------------------------------
 * Element Icon Mapping
 * ------------------------------------------------------------------------- */

const ELEMENT_ICONS: Record<number, React.ElementType> = {
  0: Flame,
  1: Droplets,
  2: Wind,
  3: Snowflake,
  4: Mountain,
  5: CloudLightning,
  6: Moon,
  7: Sun,
};

/* ---------------------------------------------------------------------------
 * Stat Color Mapping
 * ------------------------------------------------------------------------- */

const STAT_COLORS: Record<string, { bar: string; text: string; glow: string }> = {
  attack: {
    bar: 'from-red-500 to-orange-500',
    text: 'text-red-400',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.4)]',
  },
  defense: {
    bar: 'from-blue-500 to-cyan-500',
    text: 'text-blue-400',
    glow: 'shadow-[0_0_12px_rgba(59,130,246,0.4)]',
  },
  speed: {
    bar: 'from-green-500 to-emerald-500',
    text: 'text-green-400',
    glow: 'shadow-[0_0_12px_rgba(34,197,94,0.4)]',
  },
  specialPower: {
    bar: 'from-purple-500 to-pink-500',
    text: 'text-purple-400',
    glow: 'shadow-[0_0_12px_rgba(168,85,247,0.4)]',
  },
};

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface WarriorStats {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWarrior(raw: any): WarriorStats {
  return {
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

interface MergedStats {
  attack: number;
  defense: number;
  speed: number;
  specialPower: number;
  level: number;
}

/* ---------------------------------------------------------------------------
 * Utility: Calculate Merged Stats
 * ------------------------------------------------------------------------- */

function calculateMergedStats(w1: WarriorStats, w2: WarriorStats): MergedStats {
  // Matches Solidity: (stat1 + stat2) * 6 / 10, integer truncation
  const merge = (s1: number, s2: number, cap: number) =>
    Math.min(cap, Math.floor(((s1 + s2) * 6) / 10));
  return {
    attack: merge(w1.attack, w2.attack, 100),
    defense: merge(w1.defense, w2.defense, 100),
    speed: merge(w1.speed, w2.speed, 100),
    specialPower: merge(w1.specialPower, w2.specialPower, 50),
    level: Math.max(w1.level, w2.level) + 1,
  };
}

/** Matches Solidity: attack*3 + defense*2 + speed*2 + specialPower*5 */
function calculatePowerScore(m: MergedStats): number {
  return m.attack * 3 + m.defense * 2 + m.speed * 2 + m.specialPower * 5;
}

/* ---------------------------------------------------------------------------
 * Mini Stat Bar (for result preview)
 * ------------------------------------------------------------------------- */

function MiniStatBar({
  label,
  value,
  maxValue = 100,
  statKey,
  icon: Icon,
  delay = 0,
}: {
  label: string;
  value: number;
  maxValue?: number;
  statKey: string;
  icon: React.ElementType;
  delay?: number;
}) {
  const colors = STAT_COLORS[statKey] ?? STAT_COLORS.attack;
  const percentage = Math.min((value / maxValue) * 100, 100);

  return (
    <motion.div
      className="space-y-1"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3 h-3 ${colors.text}`} />
          <span className="text-[11px] font-medium text-white/60 uppercase tracking-wide">
            {label}
          </span>
        </div>
        <span className={`text-[11px] font-mono font-bold ${colors.text}`}>
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden relative">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${colors.bar} relative`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: 1.0,
            delay: delay + 0.2,
            ease: [0.175, 0.885, 0.32, 1.275], // elastic-like cubic bezier
          }}
        >
          {/* Glow flash at the tip when bar reaches target */}
          <motion.div
            className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
            style={{
              background: `radial-gradient(circle, ${
                statKey === 'attack' ? 'rgba(239,68,68,0.8)' :
                statKey === 'defense' ? 'rgba(59,130,246,0.8)' :
                statKey === 'speed' ? 'rgba(34,197,94,0.8)' :
                'rgba(168,85,247,0.8)'
              }, transparent)`,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 2.5, 0] }}
            transition={{
              duration: 0.6,
              delay: delay + 1.0,
              ease: 'easeOut',
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Power Score Counter (count-up animation for celebration)
 * ------------------------------------------------------------------------- */

function PowerScoreCounter({
  targetValue,
  colorClass,
  delay = 0,
}: {
  targetValue: number;
  colorClass: string;
  delay?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay * 1000);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!started || targetValue === 0) return;

    const duration = 1200; // ms
    const steps = 30;
    const stepTime = duration / steps;
    let current = 0;
    const increment = targetValue / steps;

    const interval = setInterval(() => {
      current += increment;
      if (current >= targetValue) {
        setDisplayValue(targetValue);
        clearInterval(interval);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, stepTime);

    return () => clearInterval(interval);
  }, [started, targetValue]);

  return (
    <motion.p
      className={colorClass}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: started && displayValue === targetValue ? [1, 1.15, 1] : 1 }}
      transition={{
        opacity: { delay, duration: 0.3 },
        scale: { delay: delay + 1.3, duration: 0.4, type: 'spring', bounce: 0.5 },
      }}
    >
      {displayValue}
    </motion.p>
  );
}

/* ---------------------------------------------------------------------------
 * Warrior Select Card (in the selection grid)
 * ------------------------------------------------------------------------- */

function WarriorSelectCard({
  tokenId,
  selected,
  slotNumber,
  onClick,
  disabled,
}: {
  tokenId: number;
  selected: boolean;
  slotNumber: number | null;
  onClick: () => void;
  disabled: boolean;
}) {
  const { data: warriorData } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarrior',
    args: [BigInt(tokenId)],
  });

  const warrior = warriorData ? parseWarrior(warriorData) : undefined;

  if (!warrior) {
    return (
      <div className="glass-card p-3 animate-pulse">
        <div className="aspect-square rounded-lg bg-white/5 mb-2" />
        <div className="h-3 rounded bg-white/5 w-2/3 mx-auto" />
      </div>
    );
  }

  const element = ELEMENTS[warrior.element] ?? ELEMENTS[0];
  const ElementIcon = ELEMENT_ICONS[warrior.element] ?? Sparkles;
  const powerScore = Number(warrior.powerScore);

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled && !selected}
      className={`relative group rounded-xl overflow-hidden text-left transition-all duration-200 w-full ${
        selected
          ? 'ring-2 ring-frost-cyan shadow-glow-cyan'
          : disabled && !selected
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:ring-1 hover:ring-white/20 cursor-pointer'
      }`}
      whileHover={!disabled || selected ? { y: -2, scale: 1.02 } : {}}
      whileTap={!disabled || selected ? { scale: 0.98 } : {}}
    >
      {/* Slot label overlay */}
      <AnimatePresence>
        {selected && slotNumber !== null && (
          <motion.div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="px-3 py-1 rounded-full bg-frost-cyan/20 border border-frost-cyan/40">
                <span className="font-display text-xs font-bold text-frost-cyan">
                  SLOT {slotNumber}
                </span>
              </div>
              <span className="text-[10px] text-white/40">Click to remove</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative bg-frost-card/80 backdrop-blur-lg border border-white/5 rounded-xl overflow-hidden">
        {/* Warrior Image */}
        <div className="relative w-full aspect-square bg-white/[0.02]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avalanche/api/metadata/${tokenId}/image?element=${warrior.element}`}
            alt={`Warrior #${tokenId}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Element badge */}
          <div className="absolute top-1.5 left-1.5">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
              <ElementIcon className="w-2.5 h-2.5" />
              <span className="text-[9px] font-bold">{element.emoji}</span>
            </div>
          </div>
          <span className="absolute top-1.5 right-1.5 text-[9px] font-mono text-white/60 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
            #{tokenId}
          </span>
        </div>

        {/* Stats */}
        <div className="p-2.5 space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div>
              <Sword className="w-2.5 h-2.5 mx-auto text-red-400/60 mb-0.5" />
              <p className="text-[10px] font-mono font-bold text-white/80">{warrior.attack}</p>
            </div>
            <div>
              <Shield className="w-2.5 h-2.5 mx-auto text-blue-400/60 mb-0.5" />
              <p className="text-[10px] font-mono font-bold text-white/80">{warrior.defense}</p>
            </div>
            <div>
              <Zap className="w-2.5 h-2.5 mx-auto text-green-400/60 mb-0.5" />
              <p className="text-[10px] font-mono font-bold text-white/80">{warrior.speed}</p>
            </div>
          </div>

          {/* Power Score */}
          <div className="text-center pt-1 border-t border-white/5">
            <p className="text-[9px] uppercase tracking-widest text-white/20">PWR</p>
            <p className={`font-display text-sm font-bold text-frost-cyan`}>
              {powerScore}
            </p>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

/* ---------------------------------------------------------------------------
 * Selected Warrior Slot (large, in the 3-column layout)
 * ------------------------------------------------------------------------- */

function SelectedWarriorSlot({
  tokenId,
  slotLabel,
  onClear,
}: {
  tokenId: number | null;
  slotLabel: string;
  onClear: () => void;
}) {
  const { data: warriorData } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarrior',
    args: tokenId !== null ? [BigInt(tokenId)] : undefined,
  });

  const warrior = tokenId !== null && warriorData ? parseWarrior(warriorData) : undefined;

  // Empty slot
  if (tokenId === null) {
    return (
      <motion.div
        className="relative w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-3"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Plus className="w-10 h-10 text-white/15" />
        </motion.div>
        <div className="text-center">
          <p className="font-display text-sm font-bold text-white/30">{slotLabel}</p>
          <p className="text-[10px] text-white/15 mt-1">Select from your warriors</p>
        </div>
      </motion.div>
    );
  }

  // Loading state
  if (!warrior) {
    return (
      <div className="relative w-full aspect-[3/4] rounded-2xl bg-frost-card/50 border border-white/5 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
      </div>
    );
  }

  const element = ELEMENTS[warrior.element] ?? ELEMENTS[0];
  const ElementIcon = ELEMENT_ICONS[warrior.element] ?? Sparkles;
  const powerScore = Number(warrior.powerScore);

  return (
    <motion.div
      className="relative w-full rounded-2xl overflow-hidden"
      initial={{ opacity: 0, scale: 0.8, rotateY: -30 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{ duration: 0.5, type: 'spring', bounce: 0.2 }}
    >
      {/* Glow border */}
      <div
        className="absolute -inset-0.5 rounded-2xl opacity-60"
        style={{
          background: `linear-gradient(135deg, ${element.glowColor}, transparent, ${element.glowColor})`,
          filter: 'blur(6px)',
        }}
      />

      <div className="relative bg-frost-card/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 space-y-3">
        {/* Clear button */}
        <button
          onClick={onClear}
          className="absolute top-2 right-2 z-10 p-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 hover:border-frost-red/40 hover:bg-frost-red/10 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white/50 hover:text-frost-red" />
        </button>

        {/* Slot label */}
        <div className="text-center">
          <span className="px-2.5 py-0.5 rounded-full bg-frost-cyan/10 border border-frost-cyan/20 text-[10px] font-display font-bold text-frost-cyan uppercase">
            {slotLabel}
          </span>
        </div>

        {/* Warrior Image */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white/[0.02] border border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avalanche/api/metadata/${tokenId}/image?element=${warrior.element}`}
            alt={`Warrior #${tokenId}`}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Element + ID */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full bg-gradient-to-r ${element.bgGradient} border border-white/10`}>
            <ElementIcon className="w-3 h-3" />
            <span className={`text-[10px] font-display font-bold text-frost-cyan`}>
              {element.emoji} {element.name}
            </span>
          </div>
          <span className="text-[10px] font-mono text-white/40 flex items-center gap-1">
            <Hash className="w-2.5 h-2.5" />
            {tokenId}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Sword className="w-3 h-3 mx-auto text-red-400/70 mb-0.5" />
            <p className="text-xs font-mono font-bold text-white/90">{warrior.attack}</p>
            <p className="text-[8px] text-white/30 uppercase">ATK</p>
          </div>
          <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Shield className="w-3 h-3 mx-auto text-blue-400/70 mb-0.5" />
            <p className="text-xs font-mono font-bold text-white/90">{warrior.defense}</p>
            <p className="text-[8px] text-white/30 uppercase">DEF</p>
          </div>
          <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Zap className="w-3 h-3 mx-auto text-green-400/70 mb-0.5" />
            <p className="text-xs font-mono font-bold text-white/90">{warrior.speed}</p>
            <p className="text-[8px] text-white/30 uppercase">SPD</p>
          </div>
        </div>

        {/* Power Score */}
        <div className="text-center py-2 rounded-xl bg-white/[0.02] border border-white/5">
          <p className="text-[8px] uppercase tracking-widest text-white/25 mb-0.5">Power Score</p>
          <p className={`font-display text-xl font-black text-frost-cyan`}>
            {powerScore}
          </p>
        </div>

        {/* Battle Record */}
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1">
            <Trophy className="w-3 h-3 text-frost-green" />
            <span className="font-mono text-[10px] text-frost-green font-bold">
              {Number(warrior.battleWins)}W
            </span>
          </div>
          <div className="w-px h-3 bg-white/10" />
          <div className="flex items-center gap-1">
            <Skull className="w-3 h-3 text-frost-red" />
            <span className="font-mono text-[10px] text-frost-red font-bold">
              {Number(warrior.battleLosses)}L
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Merge Result Preview (center column)
 * ------------------------------------------------------------------------- */

function MergeResultPreview({
  warrior1Data,
  warrior2Data,
  tokenId1,
  tokenId2,
  isMerging,
  mergeSuccess,
  resultTokenId,
}: {
  warrior1Data: WarriorStats | null;
  warrior2Data: WarriorStats | null;
  tokenId1: number | null;
  tokenId2: number | null;
  isMerging: boolean;
  mergeSuccess: boolean;
  resultTokenId: number | null;
}) {
  const bothSelected = warrior1Data !== null && warrior2Data !== null;
  const merged = bothSelected ? calculateMergedStats(warrior1Data, warrior2Data) : null;
  const el1 = warrior1Data ? ELEMENTS[warrior1Data.element] ?? ELEMENTS[0] : null;
  const el2 = warrior2Data ? ELEMENTS[warrior2Data.element] ?? ELEMENTS[0] : null;

  // Fetch new warrior data after merge
  const { data: resultWarriorData } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarrior',
    args: mergeSuccess && resultTokenId !== null ? [BigInt(resultTokenId)] : undefined,
  });
  const resultWarrior = resultWarriorData ? parseWarrior(resultWarriorData) : undefined;

  // Success state — show new warrior image + stats
  if (mergeSuccess && resultTokenId !== null) {
    const rElement = resultWarrior ? ELEMENTS[resultWarrior.element] ?? ELEMENTS[0] : null;
    const RElementIcon = resultWarrior ? ELEMENT_ICONS[resultWarrior.element] ?? Sparkles : Sparkles;
    const rPowerScore = resultWarrior ? Number(resultWarrior.powerScore) : 0;

    // Confetti particle config
    const confettiColors = [
      'bg-frost-cyan', 'bg-frost-purple', 'bg-frost-pink',
      'bg-frost-green', 'bg-frost-gold', 'bg-yellow-400',
      'bg-red-400', 'bg-blue-400', 'bg-emerald-400', 'bg-orange-400',
    ];
    const confettiParticles = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: Math.random() * 200 - 100, // -100 to 100
      delay: Math.random() * 0.8,
      duration: 1.5 + Math.random() * 1.5,
      size: 3 + Math.random() * 5,
      color: confettiColors[i % confettiColors.length],
      drift: (Math.random() - 0.5) * 80,
    }));

    return (
      <motion.div
        className="w-full space-y-4 relative"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.3 }}
      >
        {/* Confetti particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -top-10" style={{ height: '120%' }}>
          {confettiParticles.map((p) => (
            <motion.div
              key={`confetti-${p.id}`}
              className={`absolute rounded-sm ${p.color}`}
              style={{
                width: p.size,
                height: p.size,
                left: `calc(50% + ${p.x}px)`,
                top: -10,
              }}
              initial={{ y: -10, opacity: 1, rotate: 0 }}
              animate={{
                y: [0, 300 + Math.random() * 100],
                x: [0, p.drift],
                opacity: [1, 1, 0],
                rotate: [0, 360 + Math.random() * 360],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: 'easeIn',
              }}
            />
          ))}
        </div>

        {/* Success header */}
        <div className="text-center">
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-frost-green/10 border border-frost-green/20"
            animate={{ boxShadow: ['0 0 0px rgba(34,197,94,0)', '0 0 20px rgba(34,197,94,0.3)', '0 0 0px rgba(34,197,94,0)'] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <motion.div
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
            >
              <Check className="w-4 h-4 text-frost-green" />
            </motion.div>
            <span className="font-display text-xs font-bold text-frost-green uppercase">
              Fusion Complete
            </span>
          </motion.div>
        </div>

        {/* Warrior image - dramatic flip + zoom entrance */}
        <motion.div
          className="relative w-full max-w-[200px] mx-auto aspect-square rounded-xl overflow-hidden border-2 border-frost-green/30"
          style={{ perspective: 800 }}
          initial={{ rotateY: -180, scale: 0.3, opacity: 0 }}
          animate={{ rotateY: 0, scale: 1, opacity: 1 }}
          transition={{
            duration: 0.8,
            delay: 0.3,
            type: 'spring',
            bounce: 0.35,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avalanche/api/metadata/${resultTokenId}/image?element=${resultWarrior?.element ?? 0}`}
            alt={`Warrior #${resultTokenId}`}
            className="w-full h-full object-cover"
          />
          {/* Glow overlay */}
          {rElement && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: [0.5, 0.15] }}
              transition={{ duration: 1.0, delay: 0.3 }}
              style={{ background: `radial-gradient(circle, ${rElement.glowColor}, transparent 70%)` }}
            />
          )}
          {/* Flash overlay on entrance */}
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          />
          {/* Token ID badge */}
          <span className="absolute top-2 right-2 text-[10px] font-mono text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
            #{resultTokenId}
          </span>
        </motion.div>

        {/* Element + Power Score */}
        {resultWarrior && rElement && (
          <motion.div
            className="rounded-xl bg-frost-card/80 backdrop-blur-lg border border-frost-green/20 p-4 space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {/* Element badge */}
            <div className="flex items-center justify-center">
              <motion.div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r ${rElement.bgGradient} border border-white/10`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.4, delay: 0.7 }}
              >
                <RElementIcon className="w-3.5 h-3.5" />
                <span className={`text-xs font-display font-bold bg-gradient-to-r ${rElement.color} bg-clip-text text-transparent`}>
                  {rElement.emoji} {rElement.name}
                </span>
              </motion.div>
            </div>

            {/* Stats */}
            <MiniStatBar label="Attack" value={resultWarrior.attack} statKey="attack" icon={Sword} delay={0.1} />
            <MiniStatBar label="Defense" value={resultWarrior.defense} statKey="defense" icon={Shield} delay={0.2} />
            <MiniStatBar label="Speed" value={resultWarrior.speed} statKey="speed" icon={Zap} delay={0.3} />
            <MiniStatBar label="Special" value={resultWarrior.specialPower} maxValue={50} statKey="specialPower" icon={Sparkles} delay={0.4} />

            {/* Power Score with count-up animation */}
            <div className="text-center pt-2 border-t border-white/5">
              <p className="text-[8px] uppercase tracking-widest text-white/20 mb-1">Power Score</p>
              <PowerScoreCounter
                targetValue={rPowerScore}
                colorClass={`font-display text-2xl font-black bg-gradient-to-r ${rElement.color} bg-clip-text text-transparent`}
                delay={0.6}
              />
            </div>

            {/* Level */}
            <div className="text-center">
              <span className="text-[10px] font-mono text-white/40">
                Level {resultWarrior.level}
              </span>
            </div>
          </motion.div>
        )}

        {/* Loading state while warrior data fetches */}
        {!resultWarrior && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
          </div>
        )}
      </motion.div>
    );
  }

  // Merging state
  if (isMerging) {
    const orbitColors = [
      'bg-frost-cyan',
      'bg-frost-purple',
      'bg-frost-pink',
      'bg-frost-green',
      'bg-frost-gold',
      'bg-frost-cyan',
    ];
    const mergeElementColors = [
      'text-frost-cyan',
      'text-frost-purple',
      'text-frost-pink',
      'text-frost-green',
      'text-frost-gold',
    ];
    return (
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="relative w-32 h-32 flex items-center justify-center">
          {/* Expanding light ring pulses */}
          {[0, 1].map((ringIdx) => (
            <motion.div
              key={`ring-${ringIdx}`}
              className="absolute inset-0 rounded-full border-2 border-frost-cyan/40"
              initial={{ scale: 0.5, opacity: 0.8 }}
              animate={{ scale: [0.5, 2.0], opacity: [0.8, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: ringIdx * 1.0,
                ease: 'easeOut',
              }}
            />
          ))}

          {/* Orbiting energy particles */}
          {orbitColors.map((color, i) => (
            <motion.div
              key={`orbit-${i}`}
              className="absolute"
              style={{
                width: '100%',
                height: '100%',
              }}
              animate={{ rotate: 360 }}
              transition={{
                duration: 2.5 + i * 0.3,
                repeat: Infinity,
                ease: 'linear',
                delay: i * 0.15,
              }}
            >
              <motion.div
                className={`absolute w-2.5 h-2.5 rounded-full ${color}`}
                style={{
                  top: '0%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: `0 0 8px currentColor`,
                }}
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            </motion.div>
          ))}

          {/* Central icon with color shift */}
          <motion.div
            className="relative z-10"
            animate={{ rotate: 360, scale: [1, 1.15, 1] }}
            transition={{
              rotate: { duration: 3, repeat: Infinity, ease: 'linear' },
              scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <motion.div
              animate={{
                color: [
                  'rgb(var(--frost-primary, 0 240 255))',
                  'rgb(168 85 247)',
                  'rgb(236 72 153)',
                  'rgb(34 197 94)',
                  'rgb(234 179 8)',
                  'rgb(var(--frost-primary, 0 240 255))',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <GitMerge className="w-14 h-14" />
            </motion.div>
            {/* Core glow */}
            <motion.div
              className="absolute -inset-3 rounded-full"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(0,240,255,0.4)',
                  '0 0 35px rgba(168,85,247,0.5)',
                  '0 0 20px rgba(236,72,153,0.4)',
                  '0 0 35px rgba(34,197,94,0.5)',
                  '0 0 20px rgba(0,240,255,0.4)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>
        </div>

        <motion.p
          className="font-display text-sm font-bold uppercase tracking-wider"
          animate={{
            color: [
              'rgb(0 240 255)',
              'rgb(168 85 247)',
              'rgb(236 72 153)',
              'rgb(0 240 255)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            FUSING WARRIORS...
          </motion.span>
        </motion.p>
      </motion.div>
    );
  }

  // Not both selected: show question mark
  if (!bothSelected || !merged) {
    return (
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="relative"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <div className="w-24 h-24 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center relative">
            <motion.span
              className="text-5xl font-display font-black gradient-text select-none"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              ?
            </motion.span>
            {/* Animated ring */}
            <div className="absolute -inset-1 rounded-full border border-frost-cyan/20 animate-pulse-glow" />
          </div>
          {/* Scattered sparkles */}
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                top: `${10 + i * 20}%`,
                left: `${i % 2 === 0 ? -10 : 90}%`,
              }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
            >
              <Sparkles className="w-3 h-3 text-frost-cyan/30" />
            </motion.div>
          ))}
        </motion.div>
        <div className="text-center">
          <p className="font-display text-sm font-bold text-white/30">FUSION RESULT</p>
          <p className="text-[10px] text-white/15 mt-1">Select two warriors to preview</p>
        </div>
      </motion.div>
    );
  }

  // Both selected: show estimated stats
  return (
    <motion.div
      className="w-full space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Result header */}
      <div className="text-center">
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-frost-cyan/10 border border-frost-cyan/20"
          animate={{ boxShadow: ['0 0 0px rgba(0,240,255,0)', '0 0 20px rgba(0,240,255,0.2)', '0 0 0px rgba(0,240,255,0)'] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <GitMerge className="w-4 h-4 text-frost-cyan" />
          <span className="font-display text-xs font-bold text-frost-cyan uppercase">
            Fusion Preview
          </span>
        </motion.div>
      </div>

      {/* Parent elements */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-lg">{el1?.emoji}</span>
        <Plus className="w-4 h-4 text-white/30" />
        <span className="text-lg">{el2?.emoji}</span>
        <ArrowRight className="w-4 h-4 text-white/30 mx-1" />
        <motion.span
          className="text-lg"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {(Number(warrior1Data!.powerScore) >= Number(warrior2Data!.powerScore) ? el1 : el2)?.emoji}
        </motion.span>
      </div>

      {/* Estimated stats card */}
      <motion.div
        className="rounded-xl bg-frost-card/80 backdrop-blur-lg border border-frost-cyan/20 p-4 space-y-3"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <p className="text-[9px] uppercase tracking-widest text-white/25 text-center">
          Estimated Stats (+20% Bonus)
        </p>

        <MiniStatBar
          label="Attack"
          value={merged.attack}
          statKey="attack"
          icon={Sword}
          delay={0.1}
        />
        <MiniStatBar
          label="Defense"
          value={merged.defense}
          statKey="defense"
          icon={Shield}
          delay={0.2}
        />
        <MiniStatBar
          label="Speed"
          value={merged.speed}
          statKey="speed"
          icon={Zap}
          delay={0.3}
        />
        <MiniStatBar
          label="Special"
          value={merged.specialPower}
          maxValue={50}
          statKey="specialPower"
          icon={Sparkles}
          delay={0.4}
        />

        {/* Estimated power score & level */}
        <div className="text-center pt-2 border-t border-white/5">
          <div className="flex items-center justify-center gap-4 mb-2">
            <div>
              <p className="text-[8px] uppercase tracking-widest text-white/20 mb-1">Level</p>
              <motion.p
                className="font-display text-lg font-bold text-frost-cyan"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                Lv.{merged.level}
              </motion.p>
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-widest text-white/20 mb-1">Est. Power Score</p>
              <motion.p
                className="font-display text-2xl font-black gradient-text"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 }}
              >
                ~{calculatePowerScore(merged)}
              </motion.p>
            </div>
          </div>
        </div>

        {/* Element note */}
        <div className="text-center pt-1">
          <p className="text-[9px] text-white/20 italic">
            Element inherited from the stronger parent
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Hook: Read warrior data for a given tokenId
 * ------------------------------------------------------------------------- */

function useWarriorData(tokenId: number | null): WarriorStats | null {
  const { data } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarrior',
    args: tokenId !== null ? [BigInt(tokenId)] : undefined,
  });

  return tokenId !== null && data ? parseWarrior(data) : null;
}

/* ---------------------------------------------------------------------------
 * Main Merge Page
 * ------------------------------------------------------------------------- */

export default function MergePage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  // Selection state
  const [slot1TokenId, setSlot1TokenId] = useState<number | null>(null);
  const [slot2TokenId, setSlot2TokenId] = useState<number | null>(null);

  // Merge flow state
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [resultTokenId, setResultTokenId] = useState<number | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isPostingApi, setIsPostingApi] = useState(false);

  // TBA fusion warning state
  const [fusionWarning, setFusionWarning] = useState<{
    tba1: { addr: Address; balance: bigint; tokenId: number };
    tba2: { addr: Address; balance: bigint; tokenId: number };
    mode: 'single' | 'batch';
    batchPairIndex?: number;
  } | null>(null);
  const [isSweepingTBA, setIsSweepingTBA] = useState(false);
  const [isCheckingTBA, setIsCheckingTBA] = useState(false);

  // Read owned warriors
  const { data: ownedTokenIds, refetch: refetchOwned } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarriorsByOwner',
    args: address ? [address] : undefined,
  });

  const tokenIds = useMemo(
    () => ((ownedTokenIds as bigint[] | undefined) ?? []).map((id) => Number(id)),
    [ownedTokenIds]
  );

  // Cross-filter: exclude warriors locked in battles, quests, or marketplace
  const [lockedTokenIds, setLockedTokenIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!publicClient || !address || tokenIds.length === 0) {
      setLockedTokenIds(new Set());
      return;
    }
    let cancelled = false;

    async function checkLocked() {
      const locked = new Set<number>();

      try {
        // Check open 1v1 battles
        const battleIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'getOpenBattles',
          args: [0n, 50n],
        }) as bigint[];

        if (battleIds && battleIds.length > 0) {
          const battles = await Promise.allSettled(
            battleIds.map((id) =>
              publicClient!.readContract({
                address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
                abi: BATTLE_ENGINE_ABI,
                functionName: 'getBattle',
                args: [id],
              })
            )
          );
          for (const r of battles) {
            if (r.status !== 'fulfilled') continue;
            const b = r.value as Record<string, unknown>;
            const p1 = String(b.player1 ?? b[1] ?? '').toLowerCase();
            if (p1 === address!.toLowerCase()) {
              const nft1 = Number(b.nft1 ?? b[3] ?? 0);
              if (nft1 > 0) locked.add(nft1);
            }
          }
        }
      } catch { /* ignore */ }

      try {
        // Check open 3v3 battles
        const teamIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
          abi: TEAM_BATTLE_ABI,
          functionName: 'getOpenTeamBattles',
          args: [0n, 50n],
        }) as bigint[];

        if (teamIds && teamIds.length > 0) {
          const teams = await Promise.allSettled(
            teamIds.map((id) =>
              publicClient!.readContract({
                address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`,
                abi: TEAM_BATTLE_ABI,
                functionName: 'getTeamBattle',
                args: [id],
              })
            )
          );
          for (const r of teams) {
            if (r.status !== 'fulfilled') continue;
            const raw = r.value as readonly unknown[];
            const p1 = String(raw[1] ?? '').toLowerCase();
            if (p1 === address!.toLowerCase()) {
              const team1 = Array.isArray(raw[3]) ? raw[3] : [];
              team1.forEach((id: unknown) => { const n = Number(id); if (n > 0) locked.add(n); });
            }
          }
        }
      } catch { /* ignore */ }

      // Check quests and marketplace for each warrior (individually, ignore errors)
      for (const id of tokenIds) {
        // Quest check
        try {
          const onQuest = await publicClient!.readContract({
            address: CONTRACT_ADDRESSES.questEngine as `0x${string}`,
            abi: QUEST_ENGINE_ABI,
            functionName: 'isWarriorOnQuest',
            args: [BigInt(id)],
          });
          if (onQuest) locked.add(id);
        } catch { /* quest contract may not exist or warrior not registered */ }

        // Marketplace listing check
        try {
          const listing = await publicClient!.readContract({
            address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'getListing',
            args: [BigInt(id)],
          });
          const l = listing as Record<string, unknown>;
          const active = Boolean(l.active ?? l[2] ?? false);
          if (active) locked.add(id);
        } catch { /* listing may not exist */ }
      }

      if (!cancelled) setLockedTokenIds(locked);
    }

    checkLocked();
    return () => { cancelled = true; };
  }, [publicClient, address, tokenIds]);

  // Filter available warriors for fusion
  const availableTokenIds = useMemo(
    () => tokenIds.filter((id) => !lockedTokenIds.has(id)),
    [tokenIds, lockedTokenIds]
  );

  // Fetch warrior power scores for sorting
  const [warriorPowerScores, setWarriorPowerScores] = useState<Map<number, number>>(new Map());
  const [pwrSortOrder, setPwrSortOrder] = useState<'desc' | 'asc' | null>(null);

  const fetchPowerScores = useCallback(async () => {
    if (!publicClient || tokenIds.length === 0) return;
    const results = await Promise.allSettled(
      tokenIds.map(async (id) => {
        const raw = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarrior',
          args: [BigInt(id)],
        });
        const w = parseWarrior(raw);
        return { id, powerScore: Number(w.powerScore) };
      })
    );
    const map = new Map<number, number>();
    for (const r of results) {
      if (r.status === 'fulfilled') map.set(r.value.id, r.value.powerScore);
    }
    setWarriorPowerScores(map);
  }, [publicClient, tokenIds]);

  useEffect(() => { fetchPowerScores(); }, [fetchPowerScores]);

  const sortedTokenIds = useMemo(() => {
    if (!pwrSortOrder) return tokenIds;
    return [...tokenIds].sort((a, b) => {
      const pa = warriorPowerScores.get(a) ?? 0;
      const pb = warriorPowerScores.get(b) ?? 0;
      return pwrSortOrder === 'desc' ? pb - pa : pa - pb;
    });
  }, [tokenIds, pwrSortOrder, warriorPowerScores]);

  // Read warrior data for selected slots
  const warrior1Data = useWarriorData(slot1TokenId);
  const warrior2Data = useWarriorData(slot2TokenId);

  // Contract write: mergeWarriors()
  const {
    writeContract: fuseMerge,
    data: fuseTxHash,
    isPending: isFusePending,
    error: fuseError,
    reset: resetFuse,
  } = useWriteContract();

  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({ hash: fuseTxHash });

  const isMerging = isFusePending || isTxConfirming || isPostingApi;

  // Handle warrior selection
  function handleWarriorClick(tokenId: number) {
    // If already selected in slot 1, deselect
    if (slot1TokenId === tokenId) {
      setSlot1TokenId(null);
      return;
    }
    // If already selected in slot 2, deselect
    if (slot2TokenId === tokenId) {
      setSlot2TokenId(null);
      return;
    }
    // Fill slot 1 first, then slot 2
    if (slot1TokenId === null) {
      setSlot1TokenId(tokenId);
    } else if (slot2TokenId === null) {
      setSlot2TokenId(tokenId);
    }
  }

  function getSlotNumber(tokenId: number): number | null {
    if (slot1TokenId === tokenId) return 1;
    if (slot2TokenId === tokenId) return 2;
    return null;
  }

  // Both slots filled check
  const bothSlotsFilled = slot1TokenId !== null && slot2TokenId !== null;

  // Check TBA balances for a pair of warriors
  async function checkTBABalances(tokenId1: number, tokenId2: number): Promise<{
    tba1: { addr: Address; balance: bigint };
    tba2: { addr: Address; balance: bigint };
    hasBalance: boolean;
  } | null> {
    if (!publicClient) return null;
    try {
      const [tba1Addr, tba2Addr] = await Promise.all([
        getWarriorTBAAddress(publicClient, tokenId1),
        getWarriorTBAAddress(publicClient, tokenId2),
      ]);
      const [deployed1, deployed2] = await Promise.all([
        isAccountDeployed(publicClient, tba1Addr),
        isAccountDeployed(publicClient, tba2Addr),
      ]);

      let tba1Balance = 0n, tba2Balance = 0n;
      if (deployed1) tba1Balance = (await getAccountBalance(publicClient, tba1Addr)).raw;
      if (deployed2) tba2Balance = (await getAccountBalance(publicClient, tba2Addr)).raw;

      return {
        tba1: { addr: tba1Addr, balance: tba1Balance },
        tba2: { addr: tba2Addr, balance: tba2Balance },
        hasBalance: tba1Balance > 0n || tba2Balance > 0n,
      };
    } catch (err) {
      console.error('TBA balance check failed:', err);
      return null;
    }
  }

  // Execute single fusion (called after TBA check passes or user confirms)
  function executeSingleFuse() {
    fuseMerge({
      address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
      abi: FROSTBITE_WARRIOR_ABI,
      functionName: 'mergeWarriors',
      args: [BigInt(slot1TokenId!), BigInt(slot2TokenId!)],
      value: parseEther(MERGE_PRICE),
    });
  }

  // Handle fuse button click
  async function handleFuse() {
    if (!isConnected || !bothSlotsFilled) return;
    if (chain?.id !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return;
      }
    }
    setMergeSuccess(false);
    setResultTokenId(null);
    setApiError(null);

    // Check TBA balances before merge
    setIsCheckingTBA(true);
    const tbaResult = await checkTBABalances(slot1TokenId!, slot2TokenId!);
    setIsCheckingTBA(false);

    if (tbaResult && tbaResult.hasBalance) {
      setFusionWarning({
        tba1: { ...tbaResult.tba1, tokenId: slot1TokenId! },
        tba2: { ...tbaResult.tba2, tokenId: slot2TokenId! },
        mode: 'single',
      });
      return; // Block — user must withdraw or confirm
    }

    executeSingleFuse();
  }

  // Sweep TBA funds and then proceed with fusion
  async function handleSweepAndFuse() {
    if (!walletClient || !address || !fusionWarning) return;

    setIsSweepingTBA(true);
    try {
      const sweepPromises: Promise<any>[] = [];

      if (fusionWarning.tba1.balance > 0n) {
        sweepPromises.push(
          walletClient.writeContract({
            address: fusionWarning.tba1.addr,
            abi: FROSTBITE_ACCOUNT_ABI,
            functionName: 'execute',
            args: [address, fusionWarning.tba1.balance, '0x' as `0x${string}`, 0],
            chain: walletClient.chain,
            account: walletClient.account,
          }).then((hash) => publicClient!.waitForTransactionReceipt({ hash }))
        );
      }

      if (fusionWarning.tba2.balance > 0n) {
        sweepPromises.push(
          walletClient.writeContract({
            address: fusionWarning.tba2.addr,
            abi: FROSTBITE_ACCOUNT_ABI,
            functionName: 'execute',
            args: [address, fusionWarning.tba2.balance, '0x' as `0x${string}`, 0],
            chain: walletClient.chain,
            account: walletClient.account,
          }).then((hash) => publicClient!.waitForTransactionReceipt({ hash }))
        );
      }

      await Promise.all(sweepPromises);

      // Close warning and proceed with fusion
      const mode = fusionWarning.mode;
      setFusionWarning(null);
      setIsSweepingTBA(false);

      if (mode === 'single') {
        executeSingleFuse();
      } else {
        // For batch, restart batch fuse (funds are now swept)
        handleBatchFuseInternal();
      }
    } catch (err: any) {
      console.error('TBA sweep failed:', err);
      setIsSweepingTBA(false);
      // Don't close modal — let user retry or cancel
    }
  }

  // After tx success, parse WarriorsMerged event and post to /api/v1/merge
  useEffect(() => {
    if (!isTxSuccess || !fuseTxHash || mergeSuccess || isPostingApi) return;
    if (!warrior1Data || !warrior2Data) return;
    if (slot1TokenId === null || slot2TokenId === null) return;
    if (!publicClient) return;

    async function postMerge() {
      setIsPostingApi(true);
      try {
        // Get tx receipt and parse WarriorsMerged event
        const receipt = await publicClient!.getTransactionReceipt({ hash: fuseTxHash! });
        if (!receipt) throw new Error('Transaction receipt not found');

        let newTokenId: number | null = null;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: FROSTBITE_WARRIOR_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'WarriorsMerged') {
              newTokenId = Number((decoded.args as any).resultTokenId);
              break;
            }
          } catch {
            // Not our event, skip
          }
        }

        setResultTokenId(newTokenId);

        const res = await fetch('/avalanche/api/v1/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            tokenId1: slot1TokenId,
            tokenId2: slot2TokenId,
            resultTokenId: newTokenId,
            txHash: fuseTxHash,
            element1: warrior1Data!.element,
            element2: warrior2Data!.element,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `API error: ${res.status}`);
        }

        setMergeSuccess(true);
        refetchOwned();
        // Record fusion points
        if (address) {
          fetch('/avalanche/api/v1/points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: address, activity: 'fusion' }),
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error('Merge API failed:', err);
        setApiError(err.message || 'Failed to record merge.');
        // Still mark as success since the on-chain merge went through
        setMergeSuccess(true);
        refetchOwned();
      } finally {
        setIsPostingApi(false);
      }
    }

    postMerge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxSuccess]);

  // ================================================================
  // BATCH FUSION STATE
  // ================================================================
  const [fusionMode, setFusionMode] = useState<'single' | 'batch'>('single');
  const { data: walletClient } = useWalletClient();
  const [batchSelected, setBatchSelected] = useState<Set<number>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchComplete, setBatchComplete] = useState(false);
  const [batchResults, setBatchResults] = useState<number[]>([]);
  const BATCH_POWER_THRESHOLD = 700;

  const batchPairs = useMemo(() => {
    const sorted = [...batchSelected].sort((a, b) => {
      const pa = warriorPowerScores.get(a) ?? 0;
      const pb = warriorPowerScores.get(b) ?? 0;
      return pa - pb;
    });
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      pairs.push([sorted[i], sorted[i + 1]]);
    }
    return pairs;
  }, [batchSelected, warriorPowerScores]);

  const batchTotalCost = useMemo(() => {
    return (batchPairs.length * parseFloat(MERGE_PRICE)).toFixed(4);
  }, [batchPairs]);

  function handleBatchToggle(tokenId: number) {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tokenId)) {
        next.delete(tokenId);
      } else {
        next.add(tokenId);
      }
      return next;
    });
  }

  function handleSelectByPower(threshold: number) {
    const filtered = availableTokenIds.filter((id) => {
      const pwr = warriorPowerScores.get(id) ?? 0;
      return pwr > 0 && pwr < threshold;
    });
    if (filtered.length % 2 !== 0) filtered.pop();
    setBatchSelected(new Set(filtered));
  }

  function handleSelectAll() {
    const all = [...availableTokenIds];
    if (all.length % 2 !== 0) all.pop();
    setBatchSelected(new Set(all));
  }

  function handleBatchClearSelection() {
    setBatchSelected(new Set());
  }

  async function handleBatchFuse() {
    if (!walletClient || !publicClient || batchPairs.length === 0) return;
    if (!isConnected) return;

    if (chain?.id !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return;
      }
    }

    // Check TBA balances for all batch pairs before starting
    setIsCheckingTBA(true);
    for (let i = 0; i < batchPairs.length; i++) {
      const pair = batchPairs[i];
      const tbaResult = await checkTBABalances(pair[0], pair[1]);
      if (tbaResult && tbaResult.hasBalance) {
        setIsCheckingTBA(false);
        setFusionWarning({
          tba1: { ...tbaResult.tba1, tokenId: pair[0] },
          tba2: { ...tbaResult.tba2, tokenId: pair[1] },
          mode: 'batch',
          batchPairIndex: i,
        });
        return; // Block — user must withdraw or confirm
      }
    }
    setIsCheckingTBA(false);

    handleBatchFuseInternal();
  }

  async function handleBatchFuseInternal() {
    if (!walletClient || !publicClient || batchPairs.length === 0) return;

    setBatchError(null);
    setBatchComplete(false);
    setBatchResults([]);
    const newTokenIds: number[] = [];

    for (let i = 0; i < batchPairs.length; i++) {
      const pair = batchPairs[i];
      setBatchProgress({ current: i + 1, total: batchPairs.length });

      try {
        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'mergeWarriors',
          args: [BigInt(pair[0]), BigInt(pair[1])],
          value: parseEther(MERGE_PRICE),
          account: walletClient.account,
        });
        const hash = await walletClient.writeContract(request);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Parse WarriorsMerged event
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: FROSTBITE_WARRIOR_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'WarriorsMerged') {
              const newId = Number((decoded.args as any).resultTokenId);
              newTokenIds.push(newId);

              // Post to API
              try {
                await fetch('/avalanche/api/v1/merge', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    walletAddress: address,
                    tokenId1: pair[0],
                    tokenId2: pair[1],
                    resultTokenId: newId,
                    txHash: hash,
                  }),
                });
              } catch { /* non-critical */ }
              break;
            }
          } catch { /* not our event */ }
        }
      } catch (err: any) {
        const msg = err?.message?.includes('User rejected')
          ? 'Transaction rejected by user'
          : err?.shortMessage || err?.message || 'Transaction failed';
        setBatchError(`Pair ${i + 1} failed: ${msg}`);
        break;
      }
    }

    setBatchProgress(null);
    setBatchResults(newTokenIds);
    setBatchComplete(true);
    setBatchSelected(new Set());
    refetchOwned();
    fetchPowerScores();
  }

  function handleBatchReset() {
    setBatchSelected(new Set());
    setBatchProgress(null);
    setBatchError(null);
    setBatchComplete(false);
    setBatchResults([]);
  }

  // Reset function
  function handleReset() {
    setSlot1TokenId(null);
    setSlot2TokenId(null);
    setMergeSuccess(false);
    setResultTokenId(null);
    setApiError(null);
    resetFuse();
  }

  return (
    <div className="min-h-screen relative">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="orb w-80 h-80 bg-frost-purple top-20 -left-20" />
        <div
          className="orb w-96 h-96 bg-frost-cyan top-60 -right-32"
          style={{ animationDelay: '2s' }}
        />
        <div
          className="orb w-72 h-72 bg-frost-pink bottom-20 left-1/4"
          style={{ animationDelay: '4s' }}
        />
      </div>

      {/* ================================================================
       * COMPACT HEADER
       * ================================================================ */}
      <section className="relative pt-16 pb-6 px-4">
        <div className="max-w-lg mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="relative flex items-center gap-1">
                <motion.div
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles className="w-4 h-4 text-frost-cyan" />
                </motion.div>
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3], y: [2, -3, 2] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: 0.6 }}
                >
                  <GitMerge className="w-5 h-5 text-frost-cyan/60" />
                </motion.div>
              </div>

              <Image
                src="/avalanche/logo.png"
                alt="Frostbite"
                width={44}
                height={44}
                className="rounded-lg"
              />
              <h1 className="font-display text-3xl sm:text-4xl font-black gradient-text">
                FUSION
              </h1>

              <div className="relative flex items-center gap-1">
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3], y: [-2, 3, -2] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: 0.3 }}
                >
                  <Layers className="w-5 h-5 text-frost-pink/60" />
                </motion.div>
                <motion.div
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.9 }}
                >
                  <Sparkles className="w-4 h-4 text-frost-pink" />
                </motion.div>
              </div>
            </div>

            <p className="text-sm text-white/40 mb-4">
              Combine two warriors to forge a stronger one. Averaged stats with +20% bonus.
            </p>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-frost-cyan/10 border border-frost-cyan/20 text-xs font-mono text-frost-cyan">
                <div className="w-1.5 h-1.5 rounded-full bg-frost-cyan animate-pulse" />
                {MERGE_PRICE} AVAX
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-frost-green/10 border border-frost-green/20">
                <span className="w-1.5 h-1.5 rounded-full bg-frost-green animate-pulse" />
                <span className="text-[10px] font-pixel text-frost-green/80">MAINNET</span>
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================
       * FUSION MODE TABS
       * ================================================================ */}
      {isConnected && tokenIds.length >= 2 && (
        <section className="relative px-4 pb-6">
          <div className="max-w-md mx-auto">
            <motion.div
              className="flex rounded-xl bg-frost-card/60 backdrop-blur-lg border border-white/10 p-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <button
                onClick={() => { setFusionMode('single'); handleBatchReset(); }}
                className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-display font-bold uppercase tracking-wider transition-all duration-200 ${
                  fusionMode === 'single'
                    ? 'text-white'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {fusionMode === 'single' && (
                  <motion.div
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-frost-cyan/20 to-frost-purple/20 border border-frost-cyan/30"
                    layoutId="fusionModeTab"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <GitMerge className="w-4 h-4 relative z-10" />
                <span className="relative z-10">Single Fusion</span>
              </button>
              <button
                onClick={() => { setFusionMode('batch'); handleReset(); }}
                className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-display font-bold uppercase tracking-wider transition-all duration-200 ${
                  fusionMode === 'batch'
                    ? 'text-white'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {fusionMode === 'batch' && (
                  <motion.div
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-frost-purple/20 to-frost-pink/20 border border-frost-purple/30"
                    layoutId="fusionModeTab"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <Layers className="w-4 h-4 relative z-10" />
                <span className="relative z-10">Batch Fusion</span>
              </button>
            </motion.div>
          </div>
        </section>
      )}

      {/* ================================================================
       * WALLET NOT CONNECTED
       * ================================================================ */}
      {!isConnected && (
        <section className="relative px-4 pb-20">
          <div className="max-w-md mx-auto">
            <motion.div
              className="text-center p-10 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Wallet className="w-12 h-12 mx-auto text-white/20 mb-4" />
              <p className="font-display text-lg font-bold text-white/40 mb-2">
                Connect Your Wallet
              </p>
              <p className="text-sm text-white/25">
                Connect your wallet to access warrior fusion.
              </p>
            </motion.div>
          </div>
        </section>
      )}

      {/* ================================================================
       * NOT ENOUGH WARRIORS
       * ================================================================ */}
      {isConnected && tokenIds.length < 2 && (
        <section className="relative px-4 pb-20">
          <div className="max-w-md mx-auto">
            <motion.div
              className="glass-card p-10 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{ transform: 'none' }}
            >
              <Sword className="w-12 h-12 mx-auto text-white/10 mb-4" />
              <h3 className="font-display text-lg font-bold text-white/50 mb-2">
                Not Enough Warriors
              </h3>
              <p className="text-sm text-white/30 mb-1">
                You need at least <span className="text-frost-cyan font-bold">2 warriors</span> to fuse.
              </p>
              <p className="text-xs text-white/20">
                You currently own{' '}
                <span className="text-frost-cyan font-mono font-bold">{tokenIds.length}</span>{' '}
                {tokenIds.length === 1 ? 'warrior' : 'warriors'}.
              </p>
              <motion.a
                href="/mint"
                className="inline-flex items-center gap-2 mt-6 px-6 py-2.5 rounded-xl bg-gradient-to-r from-frost-cyan to-frost-purple text-white font-display text-sm font-bold uppercase"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles className="w-4 h-4" />
                Mint Warriors
              </motion.a>
            </motion.div>
          </div>
        </section>
      )}

      {/* ================================================================
       * FUSION ARENA (main area, when wallet connected and >= 2 warriors)
       * ================================================================ */}
      {isConnected && tokenIds.length >= 2 && fusionMode === 'single' && (
        <>
          {/* Three-column fusion layout */}
          <section className="relative px-4 pb-8">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 lg:gap-6 items-start">
                {/* Slot 1 */}
                <motion.div
                  className="max-w-[260px] mx-auto w-full"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <SelectedWarriorSlot
                    tokenId={slot1TokenId}
                    slotLabel="Warrior 1"
                    onClear={() => setSlot1TokenId(null)}
                  />
                </motion.div>

                {/* Center column: merge icon + result preview */}
                <motion.div
                  className="flex flex-col items-center justify-center gap-4 py-6 lg:py-0 lg:min-w-[220px] lg:max-w-[260px]"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  {/* Plus icon between slots (visible on large screens) */}
                  <div className="hidden lg:flex items-center gap-2 text-white/20 mb-2">
                    <div className="w-8 h-px bg-white/10" />
                    <motion.div
                      animate={{ rotate: [0, 90, 180, 270, 360] }}
                      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    >
                      <Plus className="w-5 h-5" />
                    </motion.div>
                    <div className="w-8 h-px bg-white/10" />
                  </div>

                  {/* Result preview */}
                  <MergeResultPreview
                    warrior1Data={warrior1Data}
                    warrior2Data={warrior2Data}
                    tokenId1={slot1TokenId}
                    tokenId2={slot2TokenId}
                    isMerging={isMerging}
                    mergeSuccess={mergeSuccess}
                    resultTokenId={resultTokenId}
                  />

                  {/* Equals icon (visible on large screens) */}
                  {bothSlotsFilled && !mergeSuccess && !isMerging && (
                    <div className="hidden lg:flex items-center gap-2 text-white/20 mt-2">
                      <div className="w-8 h-px bg-white/10" />
                      <span className="text-lg font-bold">=</span>
                      <div className="w-8 h-px bg-white/10" />
                    </div>
                  )}
                </motion.div>

                {/* Slot 2 */}
                <motion.div
                  className="max-w-[260px] mx-auto w-full"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  <SelectedWarriorSlot
                    tokenId={slot2TokenId}
                    slotLabel="Warrior 2"
                    onClear={() => setSlot2TokenId(null)}
                  />
                </motion.div>
              </div>
            </div>
          </section>

          {/* Fuse button */}
          <section className="relative px-4 pb-8">
            <div className="max-w-md mx-auto space-y-4">
              {!mergeSuccess ? (
                <motion.button
                  onClick={handleFuse}
                  disabled={!bothSlotsFilled || isMerging || isCheckingTBA}
                  className="w-full relative group overflow-hidden rounded-xl font-display text-lg font-bold uppercase tracking-wider py-4 px-8 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
                  whileHover={bothSlotsFilled && !isMerging && !isCheckingTBA ? { scale: 1.03, boxShadow: '0 0 30px rgba(0,240,255,0.3)' } : {}}
                  whileTap={bothSlotsFilled && !isMerging && !isCheckingTBA ? { scale: 0.98 } : {}}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  {/* Animated gradient rotation background when both slots filled */}
                  {bothSlotsFilled ? (
                    <motion.div
                      className="absolute -inset-[2px]"
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      style={{
                        background: 'conic-gradient(from 0deg, #00f0ff, #a855f7, #ec4899, #22c55e, #eab308, #00f0ff)',
                        borderRadius: '0.75rem',
                      }}
                    >
                      <div className="absolute inset-[2px] bg-frost-surface rounded-[0.65rem]" />
                    </motion.div>
                  ) : null}

                  {/* Button background */}
                  <div className={`absolute inset-0 rounded-xl transition-opacity ${
                    bothSlotsFilled
                      ? 'bg-gradient-to-r from-frost-cyan via-frost-purple to-frost-pink opacity-90 group-hover:opacity-100'
                      : 'bg-white/5 opacity-100'
                  }`} />

                  {/* Shimmer */}
                  {bothSlotsFilled && <div className="absolute inset-0 shimmer" />}

                  {/* Hover pulse glow */}
                  {bothSlotsFilled && (
                    <motion.div
                      className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      animate={{
                        boxShadow: [
                          '0 0 10px rgba(0,240,255,0.2)',
                          '0 0 25px rgba(168,85,247,0.3)',
                          '0 0 10px rgba(236,72,153,0.2)',
                          '0 0 25px rgba(0,240,255,0.2)',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}

                  {/* Glow */}
                  {bothSlotsFilled && (
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-frost-cyan/20 via-frost-purple/20 to-frost-pink/20 blur-xl" />
                  )}

                  {/* Content */}
                  <span className="relative z-10 flex items-center justify-center gap-3 text-white">
                    {isCheckingTBA ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Checking Wallets...
                      </>
                    ) : isMerging ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {isFusePending
                          ? 'Confirm in Wallet...'
                          : isTxConfirming
                          ? 'Merging Warriors...'
                          : 'Recording Fusion...'}
                      </>
                    ) : (
                      <>
                        <motion.div
                          animate={bothSlotsFilled ? { rotate: [0, 10, -10, 0] } : {}}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <GitMerge className="w-5 h-5" />
                        </motion.div>
                        Fuse Warriors - {MERGE_PRICE} AVAX
                      </>
                    )}
                  </span>
                </motion.button>
              ) : (
                <motion.button
                  onClick={handleReset}
                  className="w-full relative group overflow-hidden rounded-xl font-display text-lg font-bold uppercase tracking-wider py-4 px-8 transition-all duration-300"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-frost-green/80 to-frost-cyan/80 opacity-90 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 shimmer" />
                  <span className="relative z-10 flex items-center justify-center gap-3 text-white">
                    <Sparkles className="w-5 h-5" />
                    Fuse Again
                  </span>
                </motion.button>
              )}

              {/* Error display */}
              <AnimatePresence>
                {fuseError && (
                  <motion.div
                    className="p-3 rounded-lg bg-frost-red/10 border border-frost-red/20 text-frost-red text-sm text-center"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {fuseError.message.includes('User rejected')
                      ? 'Transaction rejected by user'
                      : fuseError.message.includes('MergeInsufficientPayment')
                      ? `Insufficient AVAX. Fusion costs ${MERGE_PRICE} AVAX.`
                      : fuseError.message.includes('NotOwnerOfToken')
                      ? 'You do not own one of the selected warriors.'
                      : fuseError.message.includes('CannotMergeSameToken')
                      ? 'Cannot merge a warrior with itself.'
                      : fuseError.message.includes('insufficient funds')
                      ? 'Not enough AVAX in your wallet.'
                      : `Fusion failed: ${'shortMessage' in fuseError ? (fuseError as any).shortMessage : fuseError.message}`}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* API error (non-critical) */}
              <AnimatePresence>
                {apiError && (
                  <motion.div
                    className="p-3 rounded-lg bg-frost-orange/10 border border-frost-orange/20 text-frost-orange text-sm text-center"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    Note: {apiError} (On-chain mint was successful)
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success message */}
              <AnimatePresence>
                {mergeSuccess && (
                  <motion.div
                    className="p-3 rounded-lg bg-frost-green/10 border border-frost-green/20 text-frost-green text-sm text-center font-medium"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    Fusion complete! Your new warrior{resultTokenId ? ` #${resultTokenId}` : ''} has been forged.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* ================================================================
           * WARRIOR SELECTION GRID
           * ================================================================ */}
          <section className="relative px-4 pb-24">
            <div className="max-w-6xl mx-auto">
              {/* Section header */}
              <motion.div
                className="text-center mb-8"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
              >
                <h2 className="font-display text-lg font-bold text-white/70 mb-1">
                  Select Warriors
                </h2>
                <p className="text-white/30 text-xs">
                  Choose two warriors to fuse —{' '}
                  <span className="text-frost-cyan font-bold font-mono">{tokenIds.length}</span>{' '}
                  {tokenIds.length === 1 ? 'warrior' : 'warriors'} owned
                </p>
                {/* Sort + legend */}
                <div className="flex items-center justify-center gap-3 mt-3">
                  <button
                    onClick={() => setPwrSortOrder((prev) => prev === 'desc' ? 'asc' : 'desc')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase tracking-wider transition-all ${
                      pwrSortOrder
                        ? 'bg-frost-cyan/15 border border-frost-cyan/30 text-frost-cyan'
                        : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60'
                    }`}
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    PWR {pwrSortOrder === 'asc' ? '↑' : pwrSortOrder === 'desc' ? '↓' : ''}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm border-2 border-frost-cyan bg-frost-cyan/20" />
                    <span className="text-[10px] text-white/30">Selected</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm border border-white/10 bg-white/5" />
                    <span className="text-[10px] text-white/30">Available</span>
                  </div>
                </div>
              </motion.div>

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {sortedTokenIds.map((id) => {
                  const isSelected = slot1TokenId === id || slot2TokenId === id;
                  const slotsAreFull = slot1TokenId !== null && slot2TokenId !== null;
                  const isLocked = lockedTokenIds.has(id);
                  return (
                    <div key={id} className="relative">
                      <WarriorSelectCard
                        tokenId={id}
                        selected={isSelected}
                        slotNumber={getSlotNumber(id)}
                        onClick={() => !isLocked && handleWarriorClick(id)}
                        disabled={(slotsAreFull && !isSelected) || isLocked}
                      />
                      {isLocked && (
                        <div className="absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center pointer-events-none">
                          <span className="text-[9px] font-pixel text-white/50 uppercase tracking-wider">In Use</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}

      {/* ================================================================
       * BATCH FUSION MODE
       * ================================================================ */}
      {isConnected && tokenIds.length >= 2 && fusionMode === 'batch' && (
        <>
          {/* Batch progress / completion */}
          <section className="relative px-4 pb-6">
            <div className="max-w-4xl mx-auto space-y-6">

              {/* Batch progress overlay */}
              <AnimatePresence>
                {batchProgress && (
                  <motion.div
                    className="glass-card p-8 text-center space-y-4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ transform: 'none' }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <GitMerge className="w-12 h-12 text-frost-purple mx-auto" />
                    </motion.div>
                    <p className="font-display text-lg font-bold text-white">
                      Merging pair {batchProgress.current}/{batchProgress.total}...
                    </p>
                    <p className="text-sm text-white/40">
                      Please confirm each transaction in your wallet
                    </p>
                    {/* Progress bar */}
                    <div className="w-full max-w-xs mx-auto h-2 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-frost-purple to-frost-pink"
                        initial={{ width: 0 }}
                        animate={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-[10px] font-mono text-white/25">
                      {batchProgress.current} of {batchProgress.total} pairs
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Batch complete */}
              <AnimatePresence>
                {batchComplete && !batchProgress && (
                  <motion.div
                    className="glass-card p-8 text-center space-y-4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ transform: 'none' }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.5 }}
                    >
                      <CheckCircle2 className="w-14 h-14 text-frost-green mx-auto" />
                    </motion.div>
                    <p className="font-display text-xl font-bold text-frost-green">
                      Batch Fusion Complete!
                    </p>
                    {batchResults.length > 0 && (
                      <p className="text-sm text-white/50">
                        New warriors created:{' '}
                        {batchResults.map((id) => `#${id}`).join(', ')}
                      </p>
                    )}
                    <motion.button
                      onClick={handleBatchReset}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-frost-green/80 to-frost-cyan/80 text-white font-display text-sm font-bold uppercase"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Sparkles className="w-4 h-4" />
                      Fuse More
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Batch error */}
              <AnimatePresence>
                {batchError && (
                  <motion.div
                    className="p-3 rounded-lg bg-frost-red/10 border border-frost-red/20 text-frost-red text-sm text-center"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    {batchError}
                    {batchResults.length > 0 && (
                      <span className="block mt-1 text-frost-green text-xs">
                        {batchResults.length} pair(s) were successfully fused before the error.
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Pair preview + controls */}
          {!batchProgress && !batchComplete && (
            <>
              {/* Pairs preview */}
              {batchPairs.length > 0 && (
                <section className="relative px-4 pb-6">
                  <div className="max-w-4xl mx-auto">
                    <motion.div
                      className="glass-card p-6 space-y-4"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ transform: 'none' }}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-sm font-bold text-white/70 uppercase tracking-wider">
                          Auto-Paired by Power Score (lowest first)
                        </h3>
                        <span className="text-[10px] font-mono text-white/30">
                          {batchSelected.size % 2 !== 0 && (
                            <span className="text-frost-orange mr-2">1 warrior unpaired</span>
                          )}
                          {batchPairs.length} {batchPairs.length === 1 ? 'pair' : 'pairs'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {batchPairs.map((pair, idx) => (
                          <motion.div
                            key={`pair-${pair[0]}-${pair[1]}`}
                            className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-purple-500/20"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            {/* Pair badge */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                              <span className="text-[10px] font-display font-bold text-purple-400">
                                {idx + 1}
                              </span>
                            </div>

                            {/* Warrior 1 */}
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/avalanche/api/metadata/${pair[0]}/image`}
                                  alt={`#${pair[0]}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-mono text-white/70 truncate">#{pair[0]}</p>
                                <p className="text-[9px] font-mono text-white/30">PWR {warriorPowerScores.get(pair[0]) ?? '?'}</p>
                              </div>
                            </div>

                            <Plus className="w-3 h-3 text-white/20 flex-shrink-0" />

                            {/* Warrior 2 */}
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/avalanche/api/metadata/${pair[1]}/image`}
                                  alt={`#${pair[1]}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-mono text-white/70 truncate">#{pair[1]}</p>
                                <p className="text-[9px] font-mono text-white/30">PWR {warriorPowerScores.get(pair[1]) ?? '?'}</p>
                              </div>
                            </div>

                            <ArrowRight className="w-3 h-3 text-purple-400/50 flex-shrink-0" />
                            <Sparkles className="w-4 h-4 text-purple-400/40 flex-shrink-0" />
                          </motion.div>
                        ))}
                      </div>

                      {/* Cost summary */}
                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        <span className="text-xs text-white/40">
                          {batchPairs.length} {batchPairs.length === 1 ? 'pair' : 'pairs'} x {MERGE_PRICE} AVAX
                        </span>
                        <span className="font-display text-lg font-bold text-frost-cyan text-glow-cyan">
                          {batchTotalCost} AVAX
                        </span>
                      </div>
                    </motion.div>
                  </div>
                </section>
              )}

              {/* Batch fuse button */}
              <section className="relative px-4 pb-6">
                <div className="max-w-md mx-auto">
                  <motion.button
                    onClick={handleBatchFuse}
                    disabled={batchPairs.length === 0 || !!batchProgress || isCheckingTBA}
                    className="w-full relative group overflow-hidden rounded-xl font-display text-lg font-bold uppercase tracking-wider py-4 px-8 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
                    whileHover={batchPairs.length > 0 && !isCheckingTBA ? { scale: 1.03, boxShadow: '0 0 30px rgba(168,85,247,0.3)' } : {}}
                    whileTap={batchPairs.length > 0 && !isCheckingTBA ? { scale: 0.98 } : {}}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    {batchPairs.length > 0 ? (
                      <motion.div
                        className="absolute -inset-[2px]"
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                        style={{
                          background: 'conic-gradient(from 0deg, #a855f7, #ec4899, #00f0ff, #a855f7)',
                          borderRadius: '0.75rem',
                        }}
                      >
                        <div className="absolute inset-[2px] bg-frost-surface rounded-[0.65rem]" />
                      </motion.div>
                    ) : null}
                    <div className={`absolute inset-0 rounded-xl transition-opacity ${
                      batchPairs.length > 0
                        ? 'bg-gradient-to-r from-frost-purple via-frost-pink to-frost-cyan opacity-90 group-hover:opacity-100'
                        : 'bg-white/5 opacity-100'
                    }`} />
                    {batchPairs.length > 0 && <div className="absolute inset-0 shimmer" />}
                    <span className="relative z-10 flex items-center justify-center gap-3 text-white">
                      {isCheckingTBA ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Checking Wallets...
                        </>
                      ) : (
                        <>
                          <Layers className="w-5 h-5" />
                          {batchPairs.length > 0
                            ? `Batch Fuse (${batchPairs.length} ${batchPairs.length === 1 ? 'pair' : 'pairs'}) - ${batchTotalCost} AVAX`
                            : 'Select Warriors to Batch Fuse'}
                        </>
                      )}
                    </span>
                  </motion.button>
                </div>
              </section>
            </>
          )}

          {/* ================================================================
           * BATCH WARRIOR SELECTION GRID
           * ================================================================ */}
          {!batchProgress && !batchComplete && (
            <section className="relative px-4 pb-24">
              <div className="max-w-6xl mx-auto">
                {/* Section header */}
                <motion.div
                  className="text-center mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                >
                  <h2 className="font-display text-lg font-bold text-white/70 mb-1">
                    Batch Fusion
                  </h2>
                  <p className="text-white/30 text-xs">
                    Auto-paired by lowest power score —{' '}
                    <span className="text-frost-cyan font-bold font-mono">{batchSelected.size}</span>{' '}
                    selected / <span className="text-frost-cyan font-bold font-mono">{availableTokenIds.length}</span>{' '}
                    available
                  </p>

                  {/* Action buttons + legend */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase tracking-wider bg-frost-cyan/15 border border-frost-cyan/30 text-frost-cyan hover:bg-frost-cyan/25 transition-all"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Select All
                    </button>
                    {[700, 800, 900].map((threshold) => (
                      <button
                        key={threshold}
                        onClick={() => handleSelectByPower(threshold)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase tracking-wider bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 transition-all"
                      >
                        <Zap className="w-3 h-3" />
                        &lt;{threshold}
                      </button>
                    ))}
                    <button
                      onClick={handleBatchClearSelection}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase tracking-wider bg-white/5 border border-white/10 text-white/40 hover:text-white/60 transition-all"
                    >
                      <X className="w-3 h-3" />
                      Clear Selection
                    </button>
                    <button
                      onClick={() => setPwrSortOrder((prev) => prev === 'desc' ? 'asc' : 'desc')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-pixel uppercase tracking-wider transition-all ${
                        pwrSortOrder
                          ? 'bg-frost-cyan/15 border border-frost-cyan/30 text-frost-cyan'
                          : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60'
                      }`}
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      PWR {pwrSortOrder === 'asc' ? '↑' : pwrSortOrder === 'desc' ? '↓' : ''}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm border-2 border-purple-500 bg-purple-500/20" />
                      <span className="text-[10px] text-white/30">Selected</span>
                    </div>
                  </div>
                </motion.div>

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {sortedTokenIds.map((id) => {
                    const isAvailable = availableTokenIds.includes(id);
                    const isSelected = batchSelected.has(id);
                    const isLocked = lockedTokenIds.has(id);

                    // Find pair number for this warrior
                    let pairNumber: number | null = null;
                    if (isSelected) {
                      for (let pi = 0; pi < batchPairs.length; pi++) {
                        if (batchPairs[pi][0] === id || batchPairs[pi][1] === id) {
                          pairNumber = pi + 1;
                          break;
                        }
                      }
                    }

                    return (
                      <div key={id} className="relative">
                        <motion.button
                          onClick={() => isAvailable && !isLocked && handleBatchToggle(id)}
                          disabled={!isAvailable || isLocked}
                          className={`relative group rounded-xl overflow-hidden text-left transition-all duration-200 w-full ${
                            isSelected
                              ? 'ring-2 ring-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                              : !isAvailable || isLocked
                              ? 'opacity-40 cursor-not-allowed'
                              : 'hover:ring-1 hover:ring-white/20 cursor-pointer'
                          }`}
                          whileHover={isAvailable && !isLocked ? { y: -2, scale: 1.02 } : {}}
                          whileTap={isAvailable && !isLocked ? { scale: 0.98 } : {}}
                        >
                          {/* Pair number badge overlay */}
                          <AnimatePresence>
                            {isSelected && pairNumber !== null && (
                              <motion.div
                                className="absolute top-1.5 left-1.5 z-20"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                              >
                                <div className="px-2 py-0.5 rounded-full bg-purple-500/80 backdrop-blur-sm border border-purple-400/50">
                                  <span className="font-display text-[9px] font-bold text-white">
                                    Pair {pairNumber}
                                  </span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Selected check overlay */}
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                className="absolute top-1.5 right-1.5 z-20"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                              >
                                <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className="relative bg-frost-card/80 backdrop-blur-lg border border-white/5 rounded-xl overflow-hidden">
                            {/* Warrior Image */}
                            <div className="relative w-full aspect-square bg-white/[0.02]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/avalanche/api/metadata/${id}/image`}
                                alt={`Warrior #${id}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <span className="absolute bottom-1.5 right-1.5 text-[9px] font-mono text-white/60 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                                #{id}
                              </span>
                            </div>

                            {/* Power Score */}
                            <div className="p-2 text-center border-t border-white/5">
                              <p className="text-[8px] uppercase tracking-widest text-white/20">PWR</p>
                              <p className="font-display text-sm font-bold text-frost-cyan">
                                {warriorPowerScores.get(id) ?? '...'}
                              </p>
                            </div>
                          </div>
                        </motion.button>

                        {isLocked && (
                          <div className="absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center pointer-events-none">
                            <span className="text-[9px] font-pixel text-white/50 uppercase tracking-wider">In Use</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ================================================================
       * TBA FUSION WARNING MODAL
       * ================================================================ */}
      <AnimatePresence>
        {fusionWarning && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!isSweepingTBA) setFusionWarning(null); }}
          >
            <motion.div
              className="relative w-full max-w-md bg-gradient-to-b from-[#1a1028] to-[#0d0a14] border border-amber-500/30 rounded-2xl p-6 shadow-[0_0_40px_rgba(245,158,11,0.15)]"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-amber-400">
                    Warrior Wallet Warning
                  </h3>
                  <p className="text-xs text-white/40">Pre-fusion balance detected</p>
                </div>
                {!isSweepingTBA && (
                  <button
                    onClick={() => setFusionWarning(null)}
                    className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Balance Info */}
              <div className="space-y-3 mb-5">
                {fusionWarning.tba1.balance > 0n && (
                  <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                    <span className="text-sm text-white/70">
                      Warrior <span className="font-mono font-bold text-white">#{fusionWarning.tba1.tokenId}</span>
                    </span>
                    <span className="font-mono font-bold text-amber-400">
                      {parseFloat(formatEther(fusionWarning.tba1.balance)).toFixed(4)} AVAX
                    </span>
                  </div>
                )}
                {fusionWarning.tba2.balance > 0n && (
                  <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                    <span className="text-sm text-white/70">
                      Warrior <span className="font-mono font-bold text-white">#{fusionWarning.tba2.tokenId}</span>
                    </span>
                    <span className="font-mono font-bold text-amber-400">
                      {parseFloat(formatEther(fusionWarning.tba2.balance)).toFixed(4)} AVAX
                    </span>
                  </div>
                )}
              </div>

              {/* Warning Message */}
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
                <p className="text-sm text-red-300/90 leading-relaxed">
                  These funds will be <span className="font-bold text-red-400">PERMANENTLY LOCKED</span> if you fuse these warriors. Withdraw funds first, or proceed at your own risk.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleSweepAndFuse}
                  disabled={isSweepingTBA}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-sm hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSweepingTBA ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Withdrawing...
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      Withdraw & Continue
                    </>
                  )}
                </button>
                <button
                  onClick={() => setFusionWarning(null)}
                  disabled={isSweepingTBA}
                  className="px-4 py-3 rounded-xl border border-white/10 text-white/60 font-medium text-sm hover:bg-white/5 hover:text-white/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
