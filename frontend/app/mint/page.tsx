'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Copy,
  CheckCircle,
  Users,
  Gift,
  Share2,
} from 'lucide-react';
import Image from 'next/image';
import { ELEMENTS, MINT_PRICE } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATCH_MINTER_ABI } from '@/lib/contracts';
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi';
import { parseEther } from 'viem';
import { CONTRACT_ADDRESSES, ACTIVE_CHAIN_ID } from '@/lib/constants';
import { useOnContractEvent } from '@/hooks/useContractEvents';
import { MintRevealOverlay } from '@/components/mint/MintRevealOverlay';

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

/** 50 random token IDs for rotating NFT showcase */
const SHOWCASE_TOKENS = Array.from({ length: 50 }, (_, i) => {
  // Deterministic pseudo-random spread across minted range (1-700)
  return ((i * 13 + 7) % 700) + 1;
});

function MysteryCard() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % SHOWCASE_TOKENS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const tokenId = SHOWCASE_TOKENS[activeIdx];

  return (
    <motion.div
      className="relative w-full max-w-[280px] mx-auto aspect-square rounded-2xl overflow-hidden"
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Outer glow */}
      <div className="absolute -inset-1 bg-gradient-to-br from-frost-cyan via-frost-purple to-frost-pink rounded-2xl opacity-50 blur-md animate-pulse-glow" />

      {/* Card body */}
      <div className="relative h-full w-full rounded-2xl bg-frost-card border border-white/10 flex flex-col items-center justify-center gap-3 overflow-hidden">
        {/* Subtle mesh background */}
        <div className="absolute inset-0 opacity-15">
          <div className="absolute top-0 left-0 w-28 h-28 bg-frost-cyan rounded-full filter blur-[60px] animate-float" />
          <div
            className="absolute bottom-0 right-0 w-28 h-28 bg-frost-purple rounded-full filter blur-[60px] animate-float"
            style={{ animationDelay: '2s' }}
          />
        </div>

        {/* Rotating NFT images */}
        <div className="relative z-10 w-36 h-36">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/avalanche/api/metadata/${tokenId}/image?element=${tokenId % 8}`}
                alt="Mystery warrior"
                className="w-32 h-32 object-cover rounded-xl border border-white/5"
                loading="eager"
              />
            </motion.div>
          </AnimatePresence>

          {/* "?" badge overlay */}
          <div className="absolute -bottom-1 -right-1 z-20 w-8 h-8 rounded-full bg-frost-card border border-white/10 flex items-center justify-center">
            <span className="text-sm font-display font-black gradient-text">?</span>
          </div>
        </div>

        {/* Text */}
        <div className="relative z-10 text-center">
          <p className="text-white/50 text-[11px] font-display uppercase tracking-widest">
            Unknown Warrior
          </p>
          <p className="text-white/25 text-[10px] mt-0.5">
            Mint to reveal stats & element
          </p>
        </div>
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
            src={`/avalanche/api/metadata/${tokenId}/image?element=${warrior.element}`}
            alt={`Warrior #${tokenId}`}
            className="w-full h-full object-cover warrior-idle"
            style={{ animationDelay: `${(tokenId % 5) * 0.3}s` }}
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
            <p className="font-display text-lg font-bold text-frost-cyan">
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
  const { address, isConnected, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);
  const [showWarrior, setShowWarrior] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [warriorImageUrl, setWarriorImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [batchMintedTokenIds, setBatchMintedTokenIds] = useState<number[]>([]);

  // Referral state
  const [refCode, setRefCode] = useState('');
  const [refApplied, setRefApplied] = useState(false);
  const [refError, setRefError] = useState('');
  const [myReferralCode, setMyReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState<{ totalReferrals: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Load ref code from cookie on mount
  useEffect(() => {
    const cookie = document.cookie.split('; ').find(c => c.startsWith('ref_code='));
    if (cookie) {
      const code = cookie.split('=')[1];
      if (code) setRefCode(code);
    }
  }, []);

  // Fetch own referral code + stats when connected
  const fetchReferralData = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/avalanche/api/v1/wallet-referrals?wallet=${address}`);
      if (res.ok) {
        const data = await res.json();
        setMyReferralCode(data.referralCode);
        setReferralStats({ totalReferrals: data.totalReferrals });
        if (data.referredBy) setRefApplied(true);
      }
    } catch { /* ignore */ }
  }, [address]);

  useEffect(() => { fetchReferralData(); }, [fetchReferralData]);

  // Apply referral code after first mint
  const applyReferral = useCallback(async () => {
    if (!address || !refCode || refApplied) return;
    try {
      const res = await fetch('/avalanche/api/v1/wallet-referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, referralCode: refCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setRefApplied(true);
        setRefError('');
        // Clear cookie
        document.cookie = 'ref_code=; max-age=0; path=/';
      } else {
        if (data.error === 'Already referred') setRefApplied(true);
        else setRefError(data.error || 'Failed to apply referral');
      }
    } catch { /* ignore */ }
  }, [address, refCode, refApplied]);

  const copyReferralLink = useCallback(() => {
    if (!myReferralCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/avalanche/mint?ref=${myReferralCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [myReferralCode]);

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
        setShowReveal(true);
        setBatchMintedTokenIds([]);
      } else {
        // Fallback: use totalSupply
        const newTokenId = Number(totalSupply);
        setMintedTokenId(newTokenId);
        setShowReveal(true);
        setBatchMintedTokenIds([]);
      }

      setWarriorImageUrl(null);
      refetchSupply();
      refetchOwned();
      refetchWarrior();

      // Apply referral code if present
      if (refCode && !refApplied) applyReferral();
      // Refresh own referral data
      fetchReferralData();

      // Record mint points
      if (address && mintedIds.length > 0) {
        fetch('/avalanche/api/v1/points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address, activity: 'mint', count: mintedIds.length }),
        }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxSuccess, txReceipt]);

  // Auto-refresh supply counter when anyone mints
  useOnContractEvent(['WarriorMinted', 'BatchMinted'], () => {
    refetchSupply();
  });

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
        const res = await fetch('/avalanche/api/metadata/generate', {
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
  async function handleMint() {
    if (!isConnected) return;

    // Switch to correct chain if needed
    if (chain?.id !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return; // user rejected chain switch
      }
    }

    // Reset previous state
    resetMint();
    setBatchMintedTokenIds([]);
    setMintedTokenId(null);
    setShowWarrior(false);
    setWarriorImageUrl(null);

    if (quantity === 1) {
      mint({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'mint',
        value: parseEther(MINT_PRICE),
      });
    } else {
      mint({
        address: CONTRACT_ADDRESSES.batchMinter as `0x${string}`,
        abi: BATCH_MINTER_ABI,
        functionName: 'batchMint',
        args: [BigInt(quantity)],
        value: parseEther(totalCost),
      });
    }
  }

  return (
    <div className="min-h-screen relative">
      {/* ============================================================
       * COMPACT HEADER
       * ============================================================ */}
      <section className="relative pt-16 pb-6 px-4">
        <div className="max-w-lg mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              {/* Left sparkle effects */}
              <div className="relative flex items-center gap-1">
                <motion.div
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                >
                  <Sparkles className="w-4 h-4 text-frost-cyan" />
                </motion.div>
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3], y: [2, -3, 2] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: 0.6 }}
                >
                  <Sword className="w-5 h-5 text-frost-cyan/60" />
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
                MINT WARRIOR
              </h1>

              {/* Right sparkle effects */}
              <div className="relative flex items-center gap-1">
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3], y: [-2, 3, -2] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: 0.3 }}
                >
                  <Shield className="w-5 h-5 text-frost-pink/60" />
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
              Forge a unique warrior with randomized stats and element affinities on Avalanche.
            </p>

            {/* Inline badges row */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-frost-cyan/10 border border-frost-cyan/20 text-xs font-mono text-frost-cyan">
                <div className="w-1.5 h-1.5 rounded-full bg-frost-cyan animate-pulse" />
                {MINT_PRICE} AVAX
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-frost-green/10 border border-frost-green/20">
                <span className="w-1.5 h-1.5 rounded-full bg-frost-green animate-pulse" />
                <span className="text-[10px] font-pixel text-frost-green/80">MAINNET</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/40">
                <Sparkles className="w-3 h-3" />
                {supply === '---' ? (
                  <Loader2 className="w-3 h-3 animate-spin text-frost-cyan" />
                ) : (
                  <span className="text-frost-cyan font-bold">{supply}</span>
                )}
                <span>minted</span>
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ============================================================
       * MINT AREA — 2 Column: Card Left + Controls Right
       * ============================================================ */}
      <section className="relative px-4 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">

            {/* Left: Card Preview */}
            <div>
              <AnimatePresence mode="wait">
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
                        <GalleryWarriorCard key={id} tokenId={id} index={index} />
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
            </div>

            {/* Right: Mint Controls — single unified card */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-md overflow-hidden">
              {/* Features + Elements header band */}
              <div className="p-4 border-b border-white/[0.04]">
                {/* Inline feature chips */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {[
                    { icon: Sword, label: 'Random Stats', color: 'text-red-400', bg: 'bg-red-500/8' },
                    { icon: Sparkles, label: '8 Elements', color: 'text-frost-purple', bg: 'bg-purple-500/8' },
                    { icon: Zap, label: 'Special Power', color: 'text-frost-cyan', bg: 'bg-cyan-500/8' },
                    { icon: Trophy, label: 'Battle Ready', color: 'text-frost-gold', bg: 'bg-amber-500/8' },
                  ].map((item) => (
                    <div key={item.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${item.bg} border border-white/[0.04]`}>
                      <item.icon className={`w-3 h-3 ${item.color}`} />
                      <span className="text-[10px] text-white/50 font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>

                {/* Element row */}
                <div className="flex items-center gap-1">
                  {ELEMENTS.map((el) => (
                    <div
                      key={el.id}
                      className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-default"
                      title={el.name}
                    >
                      <span className="text-sm">{el.emoji}</span>
                      <span className="text-[8px] text-white/30 hidden sm:block">{el.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mint controls area */}
              <div className="p-4 space-y-4">
                {!isConnected ? (
                  <div className="text-center py-8">
                    <Wallet className="w-8 h-8 mx-auto text-white/15 mb-2" />
                    <p className="text-white/40 text-sm mb-1">Connect your wallet to mint</p>
                    <p className="text-white/20 text-xs">Avalanche C-Chain required</p>
                  </div>
                ) : (
                  <>
                    {/* Referral */}
                    {!refApplied && (
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Gift className="w-3 h-3 text-white/30" />
                          <input
                            type="text"
                            value={refCode}
                            onChange={(e) => { setRefCode(e.target.value.trim()); setRefError(''); }}
                            placeholder="Referral code (optional)"
                            disabled={isMinting}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white text-xs font-mono placeholder:text-white/20 focus:outline-none focus:border-frost-cyan/30 transition-colors disabled:opacity-50"
                          />
                        </div>
                        {refError && <p className="text-frost-red text-[10px] ml-5">{refError}</p>}
                      </div>
                    )}
                    {refApplied && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-frost-green/10 border border-frost-green/20 text-frost-green text-[11px]">
                        <CheckCircle className="w-3 h-3 flex-shrink-0" />
                        Referral applied
                      </div>
                    )}

                    {/* Quantity — compact inline */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        {[1, 5, 10, 20].map((q) => (
                          <button
                            key={q}
                            onClick={() => setQuantity(q)}
                            disabled={isMinting}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                              quantity === q
                                ? 'bg-frost-cyan/20 border border-frost-cyan/40 text-frost-cyan'
                                : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.05]'
                            } disabled:opacity-30`}
                          >
                            {q}x
                          </button>
                        ))}
                      </div>
                      <div className="flex-1" />
                      <div className="text-right">
                        <span className="text-white/30 text-[10px] block">Total</span>
                        <span className="font-display text-sm font-bold text-frost-cyan">
                          {totalCost} AVAX
                        </span>
                      </div>
                    </div>

                    {/* Mint button */}
                    <motion.button
                      onClick={handleMint}
                      disabled={isMinting}
                      className="w-full relative group overflow-hidden rounded-xl font-display text-base font-bold uppercase tracking-wider py-3.5 transition-all duration-300 disabled:cursor-not-allowed"
                      whileHover={!isMinting ? { scale: 1.02 } : {}}
                      whileTap={!isMinting ? { scale: 0.98 } : {}}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-frost-cyan via-frost-purple to-frost-pink opacity-90 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 shimmer" />
                      <span className="relative z-10 flex items-center justify-center gap-2.5 text-white">
                        {isMinting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {isMintPending ? 'Confirm in Wallet...' : quantity > 1 ? `Minting ${quantity}...` : 'Minting...'}
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            {quantity > 1 ? `Mint ${quantity} Warriors — ${totalCost} AVAX` : `Mint Warrior — ${MINT_PRICE} AVAX`}
                          </>
                        )}
                      </span>
                    </motion.button>

                    {/* Error / Success */}
                    <AnimatePresence>
                      {mintError && (
                        <motion.div
                          className="p-2.5 rounded-lg bg-frost-red/10 border border-frost-red/20 text-frost-red text-xs text-center"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          {mintError.message.includes('User rejected') || mintError.message.includes('user rejected')
                            ? 'Transaction rejected by user'
                            : mintError.message.includes('InsufficientPayment')
                            ? `Insufficient AVAX. Mint costs ${totalCost} AVAX.`
                            : mintError.message.includes('insufficient funds')
                            ? 'Not enough AVAX in your wallet.'
                            : `Mint failed: ${'shortMessage' in mintError ? (mintError as any).shortMessage : mintError.message}`}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <AnimatePresence>
                      {isTxSuccess && (
                        <motion.div
                          className="p-2.5 rounded-lg bg-frost-green/10 border border-frost-green/20 text-frost-green text-xs text-center font-medium"
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
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
       * YOUR WARRIORS GALLERY
       * ============================================================ */}
      {isConnected && tokenIds.length > 0 && (
        <section className="relative px-4 pb-24">
          <div className="max-w-5xl mx-auto">
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

      {/* Referral Sharing Section */}
      {isConnected && myReferralCode && (
        <section className="relative px-4 pb-12">
          <div className="max-w-xl mx-auto">
            <motion.div
              className="glass-card p-6"
              initial={{ opacity: 0.15, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-frost-purple/20 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-frost-purple" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-white">
                    Invite Friends
                  </h3>
                  <p className="text-[11px] text-white/40">
                    Share your link and grow the Frostbite community
                  </p>
                </div>
              </div>

              {/* Referral link */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] font-mono text-xs text-white/60 truncate">
                  {typeof window !== 'undefined' ? `${window.location.origin}/avalanche/mint?ref=${myReferralCode}` : `frostbite.gg/mint?ref=${myReferralCode}`}
                </div>
                <motion.button
                  onClick={copyReferralLink}
                  className="px-3 py-2.5 rounded-lg bg-frost-cyan/15 border border-frost-cyan/30 text-frost-cyan text-xs font-bold flex items-center gap-1.5 hover:bg-frost-cyan/25 transition-colors flex-shrink-0"
                  whileTap={{ scale: 0.95 }}
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </motion.button>
              </div>

              {/* Stats */}
              {referralStats && (
                <div className="flex items-center gap-4 pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-xs text-white/40">
                    <Users className="w-3.5 h-3.5" />
                    <span className="font-mono font-bold text-white/70">{referralStats.totalReferrals}</span>
                    {referralStats.totalReferrals === 1 ? 'referral' : 'referrals'}
                  </div>
                  <div className="text-[10px] text-white/25 font-mono uppercase tracking-wider">
                    Code: {myReferralCode}
                  </div>
                </div>
              )}
            </motion.div>
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

      {/* Mint Reveal Animation Overlay */}
      <AnimatePresence>
        {showReveal && (
          <MintRevealOverlay
            isOpen={showReveal}
            element={warrior?.element ?? 0}
            onComplete={() => {
              setShowReveal(false);
              setShowWarrior(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
