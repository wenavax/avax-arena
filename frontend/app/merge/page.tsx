'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { ELEMENTS, MERGE_PRICE, CONTRACT_ADDRESSES } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { usePublicClient } from 'wagmi';

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
  };
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
            src={`/api/metadata/${tokenId}/image?element=${warrior.element}`}
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
            <p className={`font-display text-sm font-bold bg-gradient-to-r ${element.color} bg-clip-text text-transparent`}>
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
            src={`/api/metadata/${tokenId}/image?element=${warrior.element}`}
            alt={`Warrior #${tokenId}`}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Element + ID */}
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full bg-gradient-to-r ${element.bgGradient} border border-white/10`}>
            <ElementIcon className="w-3 h-3" />
            <span className={`text-[10px] font-display font-bold bg-gradient-to-r ${element.color} bg-clip-text text-transparent`}>
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
          <p className={`font-display text-xl font-black bg-gradient-to-r ${element.color} bg-clip-text text-transparent`}>
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
            src={`/api/metadata/${resultTokenId}/image?element=${resultWarrior?.element ?? 0}`}
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

        {/* Estimated power score */}
        <div className="text-center pt-2 border-t border-white/5">
          <p className="text-[8px] uppercase tracking-widest text-white/20 mb-1">Est. Power Score</p>
          <motion.p
            className="font-display text-2xl font-black gradient-text"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
          >
            ~{merged.attack + merged.defense + merged.speed + merged.specialPower}
          </motion.p>
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
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Selection state
  const [slot1TokenId, setSlot1TokenId] = useState<number | null>(null);
  const [slot2TokenId, setSlot2TokenId] = useState<number | null>(null);

  // Merge flow state
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [resultTokenId, setResultTokenId] = useState<number | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isPostingApi, setIsPostingApi] = useState(false);

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

  // Handle fuse button click
  function handleFuse() {
    if (!isConnected || !bothSlotsFilled) return;
    setMergeSuccess(false);
    setResultTokenId(null);
    setApiError(null);

    fuseMerge({
      address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
      abi: FROSTBITE_WARRIOR_ABI,
      functionName: 'mergeWarriors',
      args: [BigInt(slot1TokenId!), BigInt(slot2TokenId!)],
      value: parseEther(MERGE_PRICE),
      chainId: 43113,
    });
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

        const res = await fetch('/api/v1/merge', {
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
       * HERO SECTION
       * ================================================================ */}
      <section className="relative pt-20 pb-8 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <GitMerge className="w-8 h-8 text-frost-cyan" />
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-black gradient-text">
                WARRIOR FUSION
              </h1>
              <Sparkles className="w-8 h-8 text-frost-pink" />
            </div>

            <p className="text-lg text-white/50 max-w-2xl mx-auto mb-4">
              Combine two warriors to forge a new, more powerful warrior.
              The fusion inherits averaged stats with a +20% bonus.
            </p>

            {/* Cost badge */}
            <motion.div
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass-card border-frost-cyan/20"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.05 }}
            >
              <div className="w-2 h-2 rounded-full bg-frost-green animate-pulse" />
              <span className="text-sm font-mono text-white/70">Fusion Cost:</span>
              <span className="font-display text-lg font-bold text-frost-cyan text-glow-cyan">
                {MERGE_PRICE} AVAX
              </span>
            </motion.div>
          </motion.div>

          {/* Network badge */}
          <motion.div
            className="mt-4 flex items-center justify-center gap-3 text-white/30 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-frost-orange/10 border border-frost-orange/20">
              <span className="w-1.5 h-1.5 rounded-full bg-frost-orange animate-pulse" />
              <span className="text-[10px] font-pixel text-frost-orange/80">FUJI</span>
            </span>
          </motion.div>
        </div>
      </section>

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
      {isConnected && tokenIds.length >= 2 && (
        <>
          {/* Three-column fusion layout */}
          <section className="relative px-4 pb-8">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 lg:gap-6 items-start">
                {/* Slot 1 */}
                <motion.div
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
                  disabled={!bothSlotsFilled || isMerging}
                  className="w-full relative group overflow-hidden rounded-xl font-display text-lg font-bold uppercase tracking-wider py-4 px-8 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
                  whileHover={bothSlotsFilled && !isMerging ? { scale: 1.03, boxShadow: '0 0 30px rgba(0,240,255,0.3)' } : {}}
                  whileTap={bothSlotsFilled && !isMerging ? { scale: 0.98 } : {}}
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
                    {isMerging ? (
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
                      : fuseError.message.includes('chain')
                      ? 'Please switch to Avalanche Fuji Testnet.'
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
                <h2 className="font-display text-2xl sm:text-3xl font-bold gradient-text mb-2">
                  SELECT WARRIORS
                </h2>
                <p className="text-white/40 text-sm">
                  Choose two warriors from your collection to fuse.
                  You own{' '}
                  <span className="text-frost-cyan font-bold font-mono">{tokenIds.length}</span>{' '}
                  {tokenIds.length === 1 ? 'warrior' : 'warriors'}.
                </p>
                {/* Selection hint */}
                <div className="flex items-center justify-center gap-4 mt-3">
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
                {tokenIds.map((id) => {
                  const isSelected = slot1TokenId === id || slot2TokenId === id;
                  const slotsAreFull = slot1TokenId !== null && slot2TokenId !== null;
                  return (
                    <WarriorSelectCard
                      key={id}
                      tokenId={id}
                      selected={isSelected}
                      slotNumber={getSlotNumber(id)}
                      onClick={() => handleWarriorClick(id)}
                      disabled={slotsAreFull && !isSelected}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
