'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sword,
  Shield,
  Zap,
  Sparkles,
  Flame,
  Droplets,
  Wind,
  Snowflake,
  Mountain,
  CloudLightning,
  Moon,
  Sun,
  Loader2,
  Wallet,
  Hash,
  Trophy,
  Skull,
  Minus,
  Plus,
  Layers,
} from 'lucide-react';
import Image from 'next/image';
import { ELEMENTS, MINT_PRICE } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATCH_MINTER_ABI } from '@/lib/contracts';
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { CONTRACT_ADDRESSES } from '@/lib/constants';

/* ---------------------------------------------------------------------------
 * Element Icon Mapping
 * ------------------------------------------------------------------------- */

const ELEMENT_ICONS: Record<number, React.ElementType> = {
  0: Flame,       // Fire
  1: Droplets,    // Water
  2: Wind,        // Wind
  3: Snowflake,   // Ice
  4: Mountain,    // Earth
  5: CloudLightning, // Thunder
  6: Moon,        // Shadow
  7: Sun,         // Light
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

/* ---------------------------------------------------------------------------
 * Animated Stat Bar
 * ------------------------------------------------------------------------- */

function StatBar({
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
      className="space-y-1.5"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${colors.text}`} />
          <span className="text-sm font-medium text-white/70 uppercase tracking-wide">
            {label}
          </span>
        </div>
        <span className={`text-sm font-mono font-bold ${colors.text}`}>
          {value}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-white/5 overflow-hidden relative">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${colors.bar} ${colors.glow}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, delay: delay + 0.3, ease: 'easeOut' }}
        />
        {/* Shimmer overlay */}
        <div className="absolute inset-0 shimmer opacity-30 rounded-full" />
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Mystery Card (pre-mint placeholder)
 * ------------------------------------------------------------------------- */

function MysteryCard() {
  return (
    <motion.div
      className="relative w-full max-w-sm mx-auto aspect-[3/4] rounded-2xl overflow-hidden"
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Outer glow */}
      <div className="absolute -inset-1 bg-gradient-to-br from-frost-cyan via-frost-purple to-frost-pink rounded-2xl opacity-60 blur-lg animate-pulse-glow" />

      {/* Card body */}
      <div className="relative h-full w-full rounded-2xl bg-frost-card border border-white/10 flex flex-col items-center justify-center gap-6 overflow-hidden">
        {/* Animated mesh background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-40 h-40 bg-frost-cyan rounded-full filter blur-[80px] animate-float" />
          <div
            className="absolute bottom-0 right-0 w-40 h-40 bg-frost-purple rounded-full filter blur-[80px] animate-float"
            style={{ animationDelay: '2s' }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-frost-pink rounded-full filter blur-[60px] animate-float"
            style={{ animationDelay: '4s' }}
          />
        </div>

        {/* Grid lines */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,32,32,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,32,32,0.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        {/* Question mark */}
        <motion.div
          className="relative z-10"
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          <span className="text-8xl font-display font-black gradient-text select-none">
            ?
          </span>
        </motion.div>

        <div className="relative z-10 text-center px-6">
          <p className="text-white/40 text-sm font-medium uppercase tracking-widest">
            Unknown Warrior
          </p>
          <p className="text-white/20 text-xs mt-1">
            Mint to reveal stats & element
          </p>
        </div>

        {/* Sparkles scattered */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: `${15 + Math.random() * 70}%`,
              left: `${10 + Math.random() * 80}%`,
            }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.4,
            }}
          >
            <Sparkles className="w-4 h-4 text-frost-cyan/40" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Warrior Card (post-mint)
 * ------------------------------------------------------------------------- */

function WarriorCard({
  warrior,
  tokenId,
  imageUrl,
  isGeneratingImage,
}: {
  warrior: WarriorStats;
  tokenId: number;
  imageUrl?: string | null;
  isGeneratingImage?: boolean;
}) {
  const element = ELEMENTS[warrior.element] ?? ELEMENTS[0];
  const ElementIcon = ELEMENT_ICONS[warrior.element] ?? Sparkles;
  const wins = Number(warrior.battleWins);
  const losses = Number(warrior.battleLosses);
  const powerScore = Number(warrior.powerScore);

  return (
    <motion.div
      className="relative w-full max-w-sm mx-auto rounded-2xl overflow-hidden"
      initial={{ scale: 0.8, opacity: 0, rotateY: 180 }}
      animate={{ scale: 1, opacity: 1, rotateY: 0 }}
      transition={{ duration: 0.8, type: 'spring', bounce: 0.3 }}
    >
      {/* Gradient border glow */}
      <div
        className="absolute -inset-0.5 rounded-2xl opacity-80"
        style={{
          background: `linear-gradient(135deg, ${element.glowColor}, transparent, ${element.glowColor})`,
          filter: 'blur(8px)',
        }}
      />

      {/* Card body */}
      <div className="relative rounded-2xl bg-frost-card/95 backdrop-blur-xl border border-white/10 p-6 space-y-5">
        {/* AI Generated Image */}
        <motion.div
          className="relative w-full aspect-square rounded-xl overflow-hidden bg-white/[0.02] border border-white/5"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={`Frostbite Warrior #${tokenId}`}
              fill
              className="object-cover"
              unoptimized
            />
          ) : isGeneratingImage ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-frost-cyan animate-spin" />
              <p className="text-xs text-white/40 uppercase tracking-wider">Generating AI Art...</p>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <span className="text-5xl">{element.emoji}</span>
              <p className="text-xs text-white/30">#{tokenId}</p>
            </div>
          )}
        </motion.div>

        {/* Header: Element badge + Token ID */}
        <div className="flex items-center justify-between">
          <motion.div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${element.bgGradient} border border-white/10`}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <ElementIcon className="w-4 h-4" />
            <span
              className={`text-sm font-display font-bold bg-gradient-to-r ${element.color} bg-clip-text text-transparent`}
            >
              {element.emoji} {element.name}
            </span>
          </motion.div>

          <motion.div
            className="flex items-center gap-1.5 text-white/40 text-xs font-mono"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <Hash className="w-3 h-3" />
            {tokenId}
          </motion.div>
        </div>

        {/* Level badge */}
        <motion.div
          className="text-center"
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-xs uppercase tracking-widest text-white/30 mb-1">Level</p>
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-frost-gold/30 bg-frost-gold/5">
            <Sparkles className="w-3.5 h-3.5 text-frost-gold" />
            <span className="font-display text-lg font-bold text-frost-gold text-glow-gold">
              {warrior.level}
            </span>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="space-y-3">
          <StatBar
            label="Attack"
            value={warrior.attack}
            statKey="attack"
            icon={Sword}
            delay={0.5}
          />
          <StatBar
            label="Defense"
            value={warrior.defense}
            statKey="defense"
            icon={Shield}
            delay={0.6}
          />
          <StatBar
            label="Speed"
            value={warrior.speed}
            statKey="speed"
            icon={Zap}
            delay={0.7}
          />
          <StatBar
            label="Special Power"
            value={warrior.specialPower}
            statKey="specialPower"
            icon={Sparkles}
            delay={0.8}
          />
        </div>

        {/* Power Score */}
        <motion.div
          className="text-center py-4 rounded-xl bg-white/[0.02] border border-white/5"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1, type: 'spring' }}
        >
          <p className="text-xs uppercase tracking-widest text-white/30 mb-2">
            Power Score
          </p>
          <p className="font-display text-4xl font-black gradient-text text-glow-cyan">
            {powerScore}
          </p>
        </motion.div>

        {/* Battle Record */}
        <motion.div
          className="flex items-center justify-center gap-6 pt-2"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.1 }}
        >
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-frost-green" />
            <span className="font-mono text-sm text-frost-green font-bold">
              {wins}W
            </span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <Skull className="w-4 h-4 text-frost-red" />
            <span className="font-mono text-sm text-frost-red font-bold">
              {losses}L
            </span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Gallery Warrior Mini Card
 * ------------------------------------------------------------------------- */

function GalleryWarriorCard({
  tokenId,
  index,
}: {
  tokenId: number;
  index: number;
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
      <motion.div
        className="glass-card p-4 animate-pulse"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <div className="h-32 rounded-lg bg-white/5" />
      </motion.div>
    );
  }

  const element = ELEMENTS[warrior.element] ?? ELEMENTS[0];
  const ElementIcon = ELEMENT_ICONS[warrior.element] ?? Sparkles;
  const powerScore = Number(warrior.powerScore);

  return (
    <motion.div
      className="relative group rounded-xl overflow-hidden cursor-pointer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -4, scale: 1.02 }}
    >
      {/* Gradient border on hover */}
      <div
        className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `linear-gradient(135deg, ${element.glowColor}, transparent, ${element.glowColor})`,
        }}
      />

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
          {/* Element badge overlay */}
          <div className="absolute top-2 left-2">
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10`}
            >
              <ElementIcon className="w-3 h-3" />
              <span className="text-[10px] font-bold">
                {element.emoji}
              </span>
            </div>
          </div>
          <span className="absolute top-2 right-2 text-[10px] font-mono text-white/60 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
            #{tokenId}
          </span>
        </div>

        {/* Stats below image */}
        <div className="p-3 space-y-2">
          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <Sword className="w-3 h-3 mx-auto text-red-400/60 mb-0.5" />
              <p className="text-xs font-mono font-bold text-white/80">{warrior.attack}</p>
            </div>
            <div>
              <Shield className="w-3 h-3 mx-auto text-blue-400/60 mb-0.5" />
              <p className="text-xs font-mono font-bold text-white/80">{warrior.defense}</p>
            </div>
            <div>
              <Zap className="w-3 h-3 mx-auto text-green-400/60 mb-0.5" />
              <p className="text-xs font-mono font-bold text-white/80">{warrior.speed}</p>
            </div>
          </div>

          {/* Power Score */}
          <div className="text-center pt-1 border-t border-white/5">
            <p className="text-[10px] uppercase tracking-widest text-white/20">PWR</p>
            <p
              className={`font-display text-lg font-bold bg-gradient-to-r ${element.color} bg-clip-text text-transparent`}
            >
              {powerScore}
            </p>
          </div>

          {/* Level */}
          <div className="flex items-center justify-between text-[10px] text-white/30">
            <span>Lv.{warrior.level}</span>
            <span>
              {Number(warrior.battleWins)}W/{Number(warrior.battleLosses)}L
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Quantity Selector
 * ------------------------------------------------------------------------- */

function QuantitySelector({
  quantity,
  setQuantity,
  disabled,
}: {
  quantity: number;
  setQuantity: (q: number) => void;
  disabled: boolean;
}) {
  const quickSelects = [1, 5, 10, 20];
  const totalCost = (quantity * 0.01).toFixed(2);

  return (
    <div className="glass-card p-5 space-y-4" style={{ transform: 'none' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-white/60 uppercase tracking-wider">
          Quantity
        </h3>
        <div className="flex items-center gap-1 text-xs text-white/30">
          <Layers className="w-3.5 h-3.5" />
          <span>Max 20 per TX</span>
        </div>
      </div>

      {/* +/- controls */}
      <div className="flex items-center justify-center gap-4">
        <motion.button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          disabled={disabled || quantity <= 1}
          className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          whileTap={{ scale: 0.9 }}
        >
          <Minus className="w-4 h-4" />
        </motion.button>

        <div className="w-20 text-center">
          <span className="font-display text-3xl font-black text-frost-cyan text-glow-cyan">
            {quantity}
          </span>
        </div>

        <motion.button
          onClick={() => setQuantity(Math.min(20, quantity + 1))}
          disabled={disabled || quantity >= 20}
          className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          whileTap={{ scale: 0.9 }}
        >
          <Plus className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Quick select */}
      <div className="flex items-center justify-center gap-2">
        {quickSelects.map((q) => (
          <motion.button
            key={q}
            onClick={() => setQuantity(q)}
            disabled={disabled}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              quantity === q
                ? 'bg-frost-cyan/20 border border-frost-cyan/40 text-frost-cyan'
                : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            whileTap={{ scale: 0.95 }}
          >
            {q}x
          </motion.button>
        ))}
      </div>

      {/* Total cost */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <span className="text-sm text-white/50">Total Cost</span>
        <span className="font-display text-lg font-bold text-frost-cyan text-glow-cyan">
          {totalCost} AVAX
        </span>
      </div>

      {/* Batch note */}
      {quantity > 1 && (
        <motion.p
          className="text-[11px] text-white/30 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Batch mint via helper contract (single TX)
        </motion.p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Mint Page
 * ------------------------------------------------------------------------- */

export default function MintPage() {
  const { address, isConnected } = useAccount();
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);
  const [showWarrior, setShowWarrior] = useState(false);
  const [warriorImageUrl, setWarriorImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [batchMintedTokenIds, setBatchMintedTokenIds] = useState<number[]>([]);

  /* ---- Contract Writes ---- */
  const {
    writeContract: mint,
    data: mintTxHash,
    isPending: isMintPending,
    error: mintError,
    reset: resetMint,
  } = useWriteContract();

  const { isLoading: isTxConfirming, isSuccess: isTxSuccess, data: txReceipt } =
    useWaitForTransactionReceipt({
      hash: mintTxHash,
    });

  /* ---- Contract Reads ---- */
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'totalSupply',
  });

  const { data: ownedTokenIds, refetch: refetchOwned } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarriorsByOwner',
    args: address ? [address] : undefined,
  });

  const latestTokenId = mintedTokenId ?? (
    ownedTokenIds && (ownedTokenIds as bigint[]).length > 0
      ? Number((ownedTokenIds as bigint[])[(ownedTokenIds as bigint[]).length - 1])
      : null
  );

  const { data: warriorData, refetch: refetchWarrior } = useReadContract({
    address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
    abi: FROSTBITE_WARRIOR_ABI,
    functionName: 'getWarrior',
    args: latestTokenId !== null ? [BigInt(latestTokenId)] : undefined,
  });

  /* ---- Handle mint success ---- */
  useEffect(() => {
    if (isTxSuccess && txReceipt) {
      // Parse Transfer events to extract minted token IDs
      const transferEventSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const mintedIds: number[] = [];

      for (const log of txReceipt.logs) {
        if (
          log.address.toLowerCase() === CONTRACT_ADDRESSES.frostbiteWarrior.toLowerCase() &&
          log.topics[0] === transferEventSig &&
          log.topics[2]?.toLowerCase() === `0x${address?.toLowerCase().slice(2).padStart(64, '0')}`
        ) {
          const tokenId = parseInt(log.topics[3]!, 16);
          mintedIds.push(tokenId);
        }
      }

      if (mintedIds.length > 1) {
        // Batch mint result
        setBatchMintedTokenIds(mintedIds);
        setMintedTokenId(null);
        setShowWarrior(false);
      } else if (mintedIds.length === 1) {
        // Single mint result
        setMintedTokenId(mintedIds[0]);
        setShowWarrior(true);
        setBatchMintedTokenIds([]);
      } else {
        // Fallback: use totalSupply
        const newTokenId = Number(totalSupply);
        setMintedTokenId(newTokenId);
        setShowWarrior(true);
        setBatchMintedTokenIds([]);
      }

      setWarriorImageUrl(null);
      refetchSupply();
      refetchOwned();
      refetchWarrior();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxSuccess, txReceipt]);

  const isMinting = isMintPending || isTxConfirming;
  const warrior = warriorData ? parseWarrior(warriorData) : undefined;
  const supply = totalSupply !== undefined ? Number(totalSupply) : '---';
  const tokenIds = (ownedTokenIds as bigint[] | undefined) ?? [];
  const totalCost = (quantity * 0.01).toFixed(2);

  /* ---- Generate AI image after warrior data is available (single mint only) ---- */
  useEffect(() => {
    if (!showWarrior || !warrior || mintedTokenId === null || warriorImageUrl || isGeneratingImage) return;

    async function generateImage() {
      setIsGeneratingImage(true);
      try {
        const res = await fetch('/api/metadata/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenId: mintedTokenId,
            element: warrior!.element,
            attack: warrior!.attack,
            defense: warrior!.defense,
            speed: warrior!.speed,
            specialPower: warrior!.specialPower,
            level: warrior!.level,
          }),
        });
        const data = await res.json();
        if (data.imageUrl) {
          setWarriorImageUrl(data.imageUrl);
        }
      } catch (err) {
        console.error('Image generation failed:', err);
      } finally {
        setIsGeneratingImage(false);
      }
    }

    generateImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWarrior, warrior, mintedTokenId]);

  /* ---- Mint Handler ---- */
  function handleMint() {
    if (!isConnected) return;

    // Reset previous state
    resetMint();
    setBatchMintedTokenIds([]);
    setMintedTokenId(null);
    setShowWarrior(false);
    setWarriorImageUrl(null);

    if (quantity === 1) {
      // Single mint: direct ArenaWarrior.mint() (cheaper gas)
      mint({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'mint',
        value: parseEther(MINT_PRICE),
        chainId: 43113,
      });
    } else {
      // Batch mint: BatchMinter.batchMint(quantity)
      mint({
        address: CONTRACT_ADDRESSES.batchMinter as `0x${string}`,
        abi: BATCH_MINTER_ABI,
        functionName: 'batchMint',
        args: [BigInt(quantity)],
        value: parseEther(totalCost),
        chainId: 43113,
      });
    }
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

      {/* ============================================================
       * HERO SECTION
       * ============================================================ */}
      <section className="relative pt-20 pb-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <Sword className="w-8 h-8 text-frost-cyan" />
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-black gradient-text">
                MINT YOUR FROSTBITE WARRIOR
              </h1>
              <Shield className="w-8 h-8 text-frost-pink" />
            </div>

            <p className="text-lg text-white/50 max-w-2xl mx-auto mb-4">
              Forge a unique warrior with randomized stats, element affinities,
              and special powers. Each warrior is one-of-a-kind on the
              Avalanche C-Chain.
            </p>

            {/* Mint price badge */}
            <motion.div
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass-card border-frost-cyan/20"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 }}
              style={{ transform: 'none' }} // prevent glass-card hover transform
              whileHover={{ scale: 1.05 }}
            >
              <div className="w-2 h-2 rounded-full bg-frost-green animate-pulse" />
              <span className="text-sm font-mono text-white/70">Mint Price:</span>
              <span className="font-display text-lg font-bold text-frost-cyan text-glow-cyan">
                {MINT_PRICE} AVAX
              </span>
            </motion.div>
          </motion.div>

          {/* Total Supply + Network Badge */}
          <motion.div
            className="mt-6 flex items-center justify-center gap-3 text-white/30 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-frost-orange/10 border border-frost-orange/20">
              <span className="w-1.5 h-1.5 rounded-full bg-frost-orange animate-pulse" />
              <span className="text-[10px] font-pixel text-frost-orange/80">FUJI</span>
            </span>
            <span className="font-mono flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Total Minted:{' '}
              {supply === '---' ? (
                <Loader2 className="w-3 h-3 animate-spin text-frost-cyan inline" />
              ) : (
                <span className="text-frost-cyan font-bold">{supply}</span>
              )}
            </span>
          </motion.div>
        </div>
      </section>

      {/* ============================================================
       * MINT AREA
       * ============================================================ */}
      <section className="relative px-4 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Preview / Warrior Card / Batch Result */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <AnimatePresence mode="wait">
                {/* Batch mint result grid */}
                {batchMintedTokenIds.length > 1 ? (
                  <motion.div
                    key="batch-result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <div className="text-center">
                      <motion.div
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-frost-green/10 border border-frost-green/20"
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                      >
                        <Layers className="w-4 h-4 text-frost-green" />
                        <span className="text-sm font-bold text-frost-green">
                          {batchMintedTokenIds.length} Warriors Minted!
                        </span>
                      </motion.div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
                      {batchMintedTokenIds.map((id, index) => (
                        <GalleryWarriorCard
                          key={id}
                          tokenId={id}
                          index={index}
                        />
                      ))}
                    </div>
                  </motion.div>
                ) : showWarrior && warrior && latestTokenId !== null ? (
                  <motion.div
                    key="warrior"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <WarriorCard warrior={warrior} tokenId={latestTokenId} imageUrl={warriorImageUrl} isGeneratingImage={isGeneratingImage} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="mystery"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.8, rotateY: 90 }}
                    transition={{ duration: 0.4 }}
                  >
                    <MysteryCard />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Right: Mint Controls */}
            <motion.div
              className="space-y-8"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {/* Info card */}
              <div className="glass-card p-6 space-y-4" style={{ transform: 'none' }}>
                <h2 className="font-display text-xl font-bold text-white">
                  What You Get
                </h2>
                <div className="space-y-3">
                  {[
                    {
                      icon: Sword,
                      label: 'Randomized Stats',
                      desc: 'Attack, Defense, Speed (1-100)',
                      color: 'text-red-400',
                    },
                    {
                      icon: Sparkles,
                      label: 'Element Affinity',
                      desc: 'One of 8 elements with combat advantages',
                      color: 'text-frost-purple',
                    },
                    {
                      icon: Zap,
                      label: 'Special Power',
                      desc: 'Unique ability score for battle bonuses',
                      color: 'text-frost-cyan',
                    },
                    {
                      icon: Trophy,
                      label: 'Battle Ready',
                      desc: 'Immediately usable in Frostbite PvP battles',
                      color: 'text-frost-gold',
                    },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      className="flex items-start gap-3"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <item.icon className={`w-4 h-4 ${item.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white/80">
                          {item.label}
                        </p>
                        <p className="text-xs text-white/40">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Element showcase */}
              <div className="glass-card p-6" style={{ transform: 'none' }}>
                <h3 className="font-display text-sm font-bold text-white/60 uppercase tracking-wider mb-3">
                  Possible Elements
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {ELEMENTS.map((el) => {
                    const ElIcon = ELEMENT_ICONS[el.id] ?? Sparkles;
                    return (
                      <motion.div
                        key={el.id}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg bg-gradient-to-b ${el.bgGradient} border border-white/5 hover:border-white/20 transition-colors cursor-default`}
                        whileHover={{ scale: 1.08, y: -2 }}
                      >
                        <span className="text-lg">{el.emoji}</span>
                        <span className="text-[10px] text-white/50 font-medium">
                          {el.name}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Mint button / Connect wallet */}
              {!isConnected ? (
                <motion.div
                  className="text-center p-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  <Wallet className="w-10 h-10 mx-auto text-white/20 mb-3" />
                  <p className="text-white/50 text-sm mb-1">
                    Connect your wallet to mint
                  </p>
                  <p className="text-white/25 text-xs">
                    Avalanche C-Chain required
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {/* Quantity selector */}
                  <QuantitySelector
                    quantity={quantity}
                    setQuantity={setQuantity}
                    disabled={isMinting}
                  />

                  {/* Mint button */}
                  <motion.button
                    onClick={handleMint}
                    disabled={isMinting}
                    className="w-full relative group overflow-hidden rounded-xl font-display text-lg font-bold uppercase tracking-wider py-4 px-8 transition-all duration-300 disabled:cursor-not-allowed"
                    whileHover={!isMinting ? { scale: 1.02 } : {}}
                    whileTap={!isMinting ? { scale: 0.98 } : {}}
                  >
                    {/* Button background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-frost-cyan via-frost-purple to-frost-pink opacity-90 group-hover:opacity-100 transition-opacity" />

                    {/* Shimmer effect */}
                    <div className="absolute inset-0 shimmer" />

                    {/* Glow on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-frost-cyan/20 via-frost-purple/20 to-frost-pink/20 blur-xl" />

                    {/* Content */}
                    <span className="relative z-10 flex items-center justify-center gap-3 text-white">
                      {isMinting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {isMintPending
                            ? 'Confirm in Wallet...'
                            : quantity > 1
                            ? `Minting ${quantity} Warriors...`
                            : 'Minting Warrior...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          {quantity > 1
                            ? `Mint ${quantity} Warriors - ${totalCost} AVAX`
                            : `Mint Warrior - ${MINT_PRICE} AVAX`}
                        </>
                      )}
                    </span>
                  </motion.button>

                  {/* Error display */}
                  <AnimatePresence>
                    {mintError && (
                      <motion.div
                        className="p-3 rounded-lg bg-frost-red/10 border border-frost-red/20 text-frost-red text-sm text-center"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        {mintError.message.includes('User rejected')
                          ? 'Transaction rejected by user'
                          : mintError.message.includes('InsufficientPayment')
                          ? `Insufficient AVAX. Mint costs ${totalCost} AVAX.`
                          : mintError.message.includes('insufficient funds')
                          ? 'Not enough AVAX in your wallet.'
                          : mintError.message.includes('chain')
                          ? 'Please switch to Avalanche Fuji Testnet.'
                          : `Mint failed: ${'shortMessage' in mintError ? (mintError as any).shortMessage : mintError.message}`}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Success message */}
                  <AnimatePresence>
                    {isTxSuccess && (
                      <motion.div
                        className="p-3 rounded-lg bg-frost-green/10 border border-frost-green/20 text-frost-green text-sm text-center font-medium"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        {batchMintedTokenIds.length > 1
                          ? `${batchMintedTokenIds.length} warriors minted successfully!`
                          : 'Warrior minted successfully! Welcome to Frostbite.'}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================================================
       * YOUR WARRIORS GALLERY
       * ============================================================ */}
      {isConnected && tokenIds.length > 0 && (
        <section className="relative px-4 pb-24">
          <div className="max-w-6xl mx-auto">
            {/* Section header */}
            <motion.div
              className="text-center mb-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
            >
              <h2 className="font-display text-3xl sm:text-4xl font-bold gradient-text mb-3">
                YOUR WARRIORS
              </h2>
              <p className="text-white/40 text-sm">
                You own{' '}
                <span className="text-frost-cyan font-bold font-mono">
                  {tokenIds.length}
                </span>{' '}
                {tokenIds.length === 1 ? 'warrior' : 'warriors'}
              </p>
            </motion.div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {tokenIds.map((id, index) => (
                <GalleryWarriorCard
                  key={Number(id)}
                  tokenId={Number(id)}
                  index={index}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Empty state for connected but no warriors */}
      {isConnected && tokenIds.length === 0 && !showWarrior && batchMintedTokenIds.length === 0 && (
        <section className="relative px-4 pb-24">
          <div className="max-w-md mx-auto text-center">
            <motion.div
              className="glass-card p-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ transform: 'none' }}
            >
              <div className="text-5xl mb-4">
                <Sword className="w-12 h-12 mx-auto text-white/10" />
              </div>
              <h3 className="font-display text-lg font-bold text-white/50 mb-2">
                No Warriors Yet
              </h3>
              <p className="text-sm text-white/30">
                Mint your first warrior above to begin your Frostbite journey.
              </p>
            </motion.div>
          </div>
        </section>
      )}
    </div>
  );
}
