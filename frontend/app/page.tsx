'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Swords,
  Trophy,
  Coins,
  ArrowRight,
  ChevronRight,
  Shield,
  Zap,
  Flame,
  GitMerge,
  Map,
  Store,
  Lock,
  TrendingUp,
  Users,
  Target,
  Award,
  Globe,
} from 'lucide-react';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { ELEMENTS, CONTRACT_ADDRESSES } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI, TEAM_BATTLE_ABI } from '@/lib/contracts';

/* ===========================================================================
 * Animated Counter
 * ========================================================================= */

function AnimatedCounter({ target, suffix = '', prefix = '' }: { target: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  useEffect(() => {
    if (!inView || target === 0) return;
    let start = 0;
    const step = Math.max(1, Math.ceil(target / 120));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { start = target; clearInterval(timer); }
      setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target]);

  return <span ref={ref} className="font-mono font-bold tabular-nums">{prefix}{count.toLocaleString()}{suffix}</span>;
}

/* ===========================================================================
 * Live Stats
 * ========================================================================= */

interface LiveStats {
  warriorsMinted: number;
  warriorsFused: number;
  totalBattles: number;
  teamBattles: number;
  avaxVolume: number;
}

const tokenByIndexAbi = [{ name: 'tokenByIndex', type: 'function', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const;

function useLiveStats(): LiveStats {
  const publicClient = usePublicClient();
  const [stats, setStats] = useState<LiveStats>({ warriorsMinted: 0, warriorsFused: 0, totalBattles: 0, teamBattles: 0, avaxVolume: 0 });

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        const totalWageredAbi = [{ name: 'totalWagered', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const;
        const [supplyRes, battleRes, teamRes, wagered1Res, wagered2Res] = await Promise.allSettled([
          publicClient.readContract({ address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`, abi: FROSTBITE_WARRIOR_ABI, functionName: 'totalSupply' }),
          publicClient.readContract({ address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`, abi: BATTLE_ENGINE_ABI, functionName: 'battleCounter' }),
          publicClient.readContract({ address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`, abi: TEAM_BATTLE_ABI, functionName: 'battleCounter' }),
          publicClient.readContract({ address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`, abi: totalWageredAbi, functionName: 'totalWagered' }),
          publicClient.readContract({ address: CONTRACT_ADDRESSES.teamBattleEngine as `0x${string}`, abi: totalWageredAbi, functionName: 'totalWagered' }),
        ]);
        if (cancelled) return;

        const supply = supplyRes.status === 'fulfilled' ? Number(supplyRes.value) : 0;

        // Get highest token ID = total ever minted (token IDs never decrease)
        let totalMinted = supply;
        if (supply > 0) {
          try {
            const lastTokenId = await publicClient.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: tokenByIndexAbi,
              functionName: 'tokenByIndex',
              args: [BigInt(supply - 1)],
            });
            totalMinted = Number(lastTokenId);
          } catch { /* fallback to supply */ }
        }

        const w1 = wagered1Res.status === 'fulfilled' ? (wagered1Res.value as bigint) : 0n;
        const w2 = wagered2Res.status === 'fulfilled' ? (wagered2Res.value as bigint) : 0n;
        setStats({
          warriorsMinted: totalMinted,
          warriorsFused: totalMinted - supply,
          totalBattles: battleRes.status === 'fulfilled' ? Number(battleRes.value) : 0,
          teamBattles: teamRes.status === 'fulfilled' ? Number(teamRes.value) : 0,
          avaxVolume: parseFloat(Number(formatEther(w1 + w2)).toFixed(2)),
        });
      } catch { /* stats stay at 0 */ }
    })();
    return () => { cancelled = true; };
  }, [publicClient]);

  return stats;
}

/* ===========================================================================
 * Fade-in wrapper (renders content visible by default, animates only when JS loads)
 * ========================================================================= */

function FadeIn({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0.15, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0.15, y: 24 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/* ===========================================================================
 * Live Activity Ticker
 * ========================================================================= */

const TICKER_ICONS: Record<string, string> = {
  mint: '✨',
  battle: '⚔️',
  team_battle: '🛡️',
  sale: '💰',
  quest: '🗺️',
  merge: '🔥',
  info: '📢',
};

function useTickerEvents() {
  const [events, setEvents] = useState<{ type: string; message: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchEvents() {
      try {
        const res = await fetch('/avalanche/api/v1/activity-ticker');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setEvents(data);
      } catch { /* silent */ }
    }
    fetchEvents();
    const interval = setInterval(fetchEvents, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return events;
}

const FALLBACK_TICKER: { type: string; message: string }[] = [
  { type: 'info', message: 'Welcome to Frostbite Arena — mint your warrior and enter the battlefield' },
  { type: 'battle', message: 'Challenge other warriors in 1v1 or 3v3 battles for AVAX rewards' },
  { type: 'quest', message: 'Send warriors on dungeon quests to earn XP and level up' },
  { type: 'merge', message: 'Fuse two warriors into a stronger one with the Merge system' },
  { type: 'sale', message: 'Trade warriors on the Frostbite Marketplace' },
  { type: 'mint', message: 'Every warrior is unique — stats, elements, and special powers are randomized on-chain' },
  { type: 'team_battle', message: 'Form a team of 3 warriors and compete in 3v3 arena battles' },
];

function LiveTicker() {
  const events = useTickerEvents();

  // Use live events if available, otherwise show fallback messages
  const source = events.length > 0 ? events : FALLBACK_TICKER;

  // Duplicate list for seamless loop
  const items = [...source, ...source];

  return (
    <div className="relative w-full overflow-hidden border-y border-white/[0.04] bg-black/30 backdrop-blur-sm">
      {/* Left/right fade masks */}
      <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-frost-bg to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-frost-bg to-transparent z-10 pointer-events-none" />

      <div className="flex animate-ticker py-2.5">
        {items.map((ev, i) => (
          <span
            key={`${i}-${ev.message}`}
            className="flex-shrink-0 flex items-center gap-1.5 mx-6 text-xs sm:text-sm text-white/50 whitespace-nowrap"
          >
            <span className="text-sm">{TICKER_ICONS[ev.type] ?? '📢'}</span>
            <span>{ev.message}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================================
 * Hero Section
 * ========================================================================= */

function HeroSection({ stats }: { stats: LiveStats }) {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Background orbs */}
      <div className="absolute top-20 -left-32 w-80 h-80 rounded-full bg-frost-primary/[0.04] blur-[100px] pointer-events-none hidden sm:block" />
      <div className="absolute bottom-20 -right-32 w-96 h-96 rounded-full bg-frost-secondary/[0.03] blur-[100px] pointer-events-none hidden sm:block" />

      {/* WarriorShowdown as background element */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.15] scale-150">
        <WarriorShowdown />
      </div>

      {/* Centered content */}
      <div className="relative z-10 text-center max-w-3xl w-full flex flex-col items-center">
        <FadeIn>
          <h1 className="font-display font-black leading-none tracking-tight mb-2">
            <span className="gradient-text text-6xl sm:text-7xl lg:text-8xl">FROSTBITE</span>
          </h1>
          <h2 className="text-frost-primary text-2xl sm:text-3xl lg:text-4xl font-display font-bold tracking-widest mb-4 drop-shadow-[0_0_20px_rgba(255,32,32,0.3)]">
            BATTLE ARENA
          </h2>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p className="text-lg text-white/50 mb-6">
            Mint warriors. Battle PvP. Earn AVAX.
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-frost-green/10 border border-frost-green/30 text-frost-green text-[10px] font-pixel uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-frost-green animate-pulse" />
            Live on Avalanche
          </span>
        </FadeIn>

        <FadeIn delay={0.2}>
          <Link
            href="/battle"
            className="btn-3d btn-3d-red px-10 py-4 text-base sm:text-lg mb-10"
            style={{ boxShadow: '0 4px 0 0 #991111, 0 6px 20px rgba(0,0,0,0.3), 0 0 40px rgba(255,32,32,0.2)' }}
          >
            <Swords className="h-5 w-5" />
            Enter Arena
          </Link>
        </FadeIn>

        {/* Mini stats row */}
        <FadeIn delay={0.25}>
          <div className="flex items-center gap-4 sm:gap-8">
            {[
              { label: 'Minted', value: stats.warriorsMinted, icon: Shield },
              { label: 'Fused', value: stats.warriorsFused, icon: GitMerge },
              { label: 'Battles', value: stats.totalBattles + stats.teamBattles, icon: Swords },
              { label: 'Volume', value: stats.avaxVolume, suffix: '', prefix: '', icon: Coins },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-mono font-bold text-white">
                    <AnimatedCounter target={s.value} suffix={s.suffix} prefix={s.prefix} />
                  </div>
                  <div className="text-[9px] text-white/30 font-pixel uppercase mt-0.5">{s.label}</div>
                </div>
                {i < 3 && <div className="stat-divider" />}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Warrior Showdown (rotating element pairs)
 * ========================================================================= */

const SHOWCASE_PAIRS: [number, number][] = [[0, 3], [5, 6], [1, 0], [7, 4], [2, 3], [6, 7]];
const SHOWCASE_STATS = [
  { a: 88, d: 62, s: 75, l: 4 }, { a: 71, d: 85, s: 68, l: 3 },
  { a: 65, d: 78, s: 92, l: 5 }, { a: 72, d: 90, s: 55, l: 2 },
  { a: 80, d: 58, s: 82, l: 4 }, { a: 95, d: 45, s: 70, l: 3 },
  { a: 76, d: 72, s: 88, l: 5 }, { a: 60, d: 95, s: 60, l: 2 },
];

function WarriorShowdown() {
  const [pairIndex, setPairIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPairIndex((p) => (p + 1) % SHOWCASE_PAIRS.length), 4500);
    return () => clearInterval(timer);
  }, []);

  const [leftIdx, rightIdx] = SHOWCASE_PAIRS[pairIndex];
  const leftEl = ELEMENTS[leftIdx];
  const rightEl = ELEMENTS[rightIdx];
  const leftStats = SHOWCASE_STATS[leftIdx];
  const rightStats = SHOWCASE_STATS[rightIdx];

  return (
    <div className="relative flex items-center justify-center py-8 lg:py-0">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-frost-primary/[0.06] blur-[80px]" />
      </div>

      <div className="relative z-10 flex items-center gap-3 sm:gap-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`l-${leftEl.id}`}
            initial={{ opacity: 0, x: -60, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-36 sm:w-44"
          >
            <div className="glass-card p-4 sm:p-5 text-center relative overflow-hidden border border-white/[0.08]"
              style={{ boxShadow: `0 0 30px ${leftEl.glowColor}` }}>
              <div className={`absolute inset-0 bg-gradient-to-br ${leftEl.bgGradient} opacity-60 rounded-[16px]`} />
              <div className="relative z-10">
                <div className="text-4xl sm:text-5xl mb-2">{leftEl.emoji}</div>
                <h4 className={`font-display text-sm font-bold mb-3 bg-gradient-to-r ${leftEl.color} bg-clip-text text-transparent`}>{leftEl.name}</h4>
                <div className="space-y-1.5 text-[10px] font-mono text-white/50">
                  <div className="flex justify-between"><span>ATK</span><span className="text-white/70">{leftStats.a}</span></div>
                  <div className="flex justify-between"><span>DEF</span><span className="text-white/70">{leftStats.d}</span></div>
                  <div className="flex justify-between"><span>SPD</span><span className="text-white/70">{leftStats.s}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/[0.06] text-[10px] font-pixel text-white/40">
                  Power <span className="ml-1 text-sm font-mono font-bold text-frost-gold">{leftStats.a + leftStats.d + leftStats.s}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* VS center */}
        <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20">
          <div className="absolute inset-0 rounded-full border-2 border-frost-primary/60" style={{ animation: 'clash-ring 2s ease-out infinite' }} />
          <div className="absolute w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-frost-primary/30 blur-md" style={{ animation: 'clash-pulse 1.5s ease-in-out infinite' }} />
          <Swords className="relative z-10 h-6 w-6 sm:h-8 sm:w-8 text-frost-primary drop-shadow-[0_0_8px_rgba(255,32,32,0.8)]" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`r-${rightEl.id}`}
            initial={{ opacity: 0, x: 60, scale: 0.85 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-36 sm:w-44"
          >
            <div className="glass-card p-4 sm:p-5 text-center relative overflow-hidden border border-white/[0.08]"
              style={{ boxShadow: `0 0 30px ${rightEl.glowColor}` }}>
              <div className={`absolute inset-0 bg-gradient-to-br ${rightEl.bgGradient} opacity-60 rounded-[16px]`} />
              <div className="relative z-10">
                <div className="text-4xl sm:text-5xl mb-2">{rightEl.emoji}</div>
                <h4 className={`font-display text-sm font-bold mb-3 bg-gradient-to-r ${rightEl.color} bg-clip-text text-transparent`}>{rightEl.name}</h4>
                <div className="space-y-1.5 text-[10px] font-mono text-white/50">
                  <div className="flex justify-between"><span>ATK</span><span className="text-white/70">{rightStats.a}</span></div>
                  <div className="flex justify-between"><span>DEF</span><span className="text-white/70">{rightStats.d}</span></div>
                  <div className="flex justify-between"><span>SPD</span><span className="text-white/70">{rightStats.s}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/[0.06] text-[10px] font-pixel text-white/40">
                  Power <span className="ml-1 text-sm font-mono font-bold text-frost-gold">{rightStats.a + rightStats.d + rightStats.s}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ===========================================================================
 * Platform Features
 * ========================================================================= */

const FEATURES = [
  { icon: Shield, title: 'On-Chain Warriors', desc: 'Every warrior is a unique ERC-721 NFT with randomized stats — Attack, Defense, Speed, Element — stored permanently on Avalanche.', gradient: 'from-frost-cyan to-blue-500' },
  { icon: Swords, title: '1v1 & 3v3 PvP Battles', desc: 'Stake AVAX and battle other players. Winners take the pot minus a small platform fee. Element advantages add strategic depth.', gradient: 'from-frost-primary to-orange-500' },
  { icon: GitMerge, title: 'Warrior Fusion', desc: 'Burn two warriors to forge a stronger one. The fused warrior inherits boosted stats from both parents.', gradient: 'from-purple-500 to-fuchsia-500' },
  { icon: Map, title: 'Quest System', desc: '8 elemental zones with 32 quests. Complete quests to earn XP, level up, and progress through difficulty tiers.', gradient: 'from-green-500 to-emerald-500' },
  { icon: Store, title: 'NFT Marketplace', desc: 'List warriors for sale, place bids, or make offers. Full-featured decentralized marketplace with auctions.', gradient: 'from-amber-500 to-yellow-500' },
  { icon: Trophy, title: 'Tournaments', desc: 'Compete in bracket-style tournaments with AVAX prize pools. Climb the seasonal leaderboard for glory.', gradient: 'from-cyan-400 to-teal-500' },
];

function FeaturesSection() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-frost-primary/[0.03] blur-[120px] pointer-events-none" />
      <div className="mx-auto max-w-5xl relative z-10">
        <FadeIn>
          <div className="text-center mb-16">
            <span className="inline-block font-pixel text-[10px] text-frost-primary uppercase tracking-[0.3em] mb-3">Platform Features</span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4">THE FROSTBITE EXPERIENCE</h2>
            <p className="text-white/40 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              A fully on-chain NFT battle arena built on Avalanche. Fast transactions, low fees, and high-stakes PvP combat.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.08}>
              <div className="group glass-card p-6 h-full relative overflow-hidden">
                <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-10 blur-2xl transition-opacity duration-500`} />
                <div className="relative z-10">
                  <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} mb-4`}>
                    <f.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-display text-base font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * How It Works
 * ========================================================================= */

const STEPS = [
  { step: '01', title: 'Connect Wallet', desc: 'Connect your MetaMask or any EVM wallet to Avalanche C-Chain.', icon: Globe, color: 'text-frost-cyan' },
  { step: '02', title: 'Mint Warriors', desc: 'Mint unique NFT warriors with randomized stats and elemental powers. Each warrior is one-of-a-kind.', icon: Sparkles, color: 'text-frost-purple' },
  { step: '03', title: 'Battle & Earn', desc: 'Enter the arena, stake AVAX, and battle other players. Win to claim the combined stake as reward.', icon: Swords, color: 'text-frost-primary' },
  { step: '04', title: 'Level Up & Trade', desc: 'Complete quests for XP, fuse warriors for stronger stats, and trade on the marketplace.', icon: TrendingUp, color: 'text-frost-gold' },
];

function HowItWorksSection() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="mx-auto max-w-5xl relative z-10">
        <FadeIn>
          <div className="text-center mb-16">
            <span className="inline-block font-pixel text-[10px] text-frost-cyan uppercase tracking-[0.3em] mb-3">Getting Started</span>
            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
              How It <span className="text-frost-primary">Works</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <FadeIn key={s.step} delay={i * 0.1}>
              <div className="glass-card p-6 text-center relative group">
                {/* Step number */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-frost-surface border border-white/[0.08]">
                  <span className="font-pixel text-[10px] text-frost-primary">{s.step}</span>
                </div>
                <s.icon className={`w-8 h-8 mx-auto mb-4 mt-2 ${s.color}`} />
                <h3 className="font-display text-sm font-bold text-white mb-2">{s.title}</h3>
                <p className="text-xs text-white/35 leading-relaxed">{s.desc}</p>
                {i < 3 && (
                  <ChevronRight className="hidden lg:block absolute top-1/2 -right-4 w-4 h-4 text-white/10 -translate-y-1/2" />
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Battle Mechanics
 * ========================================================================= */

function BattleMechanicsSection() {
  const mechanics = [
    { emoji: '🎲', title: 'On-Chain Randomness', desc: 'Battle outcomes are determined by verifiable on-chain randomness. Attack, Defense, and Speed stats all influence each combat round.' },
    { emoji: '⚡', title: 'Element Wheel', desc: 'Fire > Wind > Earth > Thunder > Water > Fire. Exploit element advantages for a 1.5x damage bonus in battle.' },
    { emoji: '📈', title: 'Progressive Leveling', desc: 'Warriors gain XP from battles and quests. Higher levels boost all stats, making experienced warriors formidable opponents.' },
    { emoji: '🛡️', title: '3v3 Team Battles', desc: 'Assemble a team of 3 warriors for team battles. Each warrior fights an opponent — best of 3 takes the combined stake.' },
  ];

  return (
    <section className="relative py-24 sm:py-32 px-4 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-frost-primary/20 to-transparent" style={{ animation: 'energy-line 4s ease-in-out infinite' }} />
      </div>
      <div className="mx-auto max-w-5xl relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <FadeIn>
              <span className="inline-block font-pixel text-[10px] text-frost-secondary uppercase tracking-[0.3em] mb-3">Battle System</span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-6">
                Strategic <span className="text-frost-primary">On-Chain</span> Combat
              </h2>
              <p className="text-white/40 text-sm sm:text-base leading-relaxed mb-8">
                Every battle is resolved entirely on the blockchain. No hidden servers, no manipulation — just pure strategy and your warrior&apos;s strength.
              </p>
            </FadeIn>
            <div className="space-y-5">
              {mechanics.map((m, i) => (
                <FadeIn key={m.title} delay={i * 0.1}>
                  <div className="flex gap-4 items-start">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-2xl">{m.emoji}</div>
                    <div>
                      <h4 className="font-display text-sm font-bold text-white mb-1">{m.title}</h4>
                      <p className="text-xs sm:text-sm text-white/35 leading-relaxed">{m.desc}</p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>

          {/* Element wheel */}
          <FadeIn delay={0.2}>
            <div className="glass-card p-8 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-frost-primary/[0.03] to-frost-secondary/[0.03]" />
              <div className="relative z-10">
                <h3 className="font-display text-lg font-bold text-white mb-6 text-center">Element Advantages</h3>
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {ELEMENTS.map((el) => (
                    <div key={el.id} className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <div className="text-2xl mb-1">{el.emoji}</div>
                      <div className={`text-[10px] font-bold bg-gradient-to-r ${el.color} bg-clip-text text-transparent`}>{el.name}</div>
                    </div>
                  ))}
                </div>
                <p className="text-center text-[10px] text-white/25 mt-4 font-pixel">
                  Each element has strengths and weaknesses — choose wisely!
                </p>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Smart Contracts Info
 * ========================================================================= */

function ContractsSection() {
  const contracts = [
    { name: 'ArenaWarrior', desc: 'ERC-721 NFT', addr: '0x958d...05dE2' },
    { name: 'BattleEngine', desc: '1v1 PvP', addr: '0x617f...6f62' },
    { name: 'TeamBattleEngine', desc: '3v3 Battles', addr: '0x522d...8c27' },
    { name: 'QuestEngine', desc: 'PvE Quests', addr: '0x5699...87e0' },
    { name: 'Marketplace', desc: 'NFT Trading', addr: '0x716E...9039' },
    { name: 'RewardVault', desc: 'Rewards', addr: '0xEa62...63A' },
  ];

  return (
    <section className="relative py-20 px-4">
      <div className="mx-auto max-w-5xl relative z-10">
        <FadeIn>
          <div className="text-center mb-12">
            <span className="inline-block font-pixel text-[10px] text-frost-green uppercase tracking-[0.3em] mb-3">Verified & Open</span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
              Smart Contracts on <span className="text-frost-cyan">Avalanche C-Chain</span>
            </h2>
            <p className="text-white/35 text-sm max-w-lg mx-auto">
              All game logic runs on verified smart contracts. No centralized servers — fully decentralized and transparent.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {contracts.map((c) => (
              <div key={c.name} className="glass-card p-4 text-center">
                <div className="font-display text-xs font-bold text-white mb-1">{c.name}</div>
                <div className="text-[10px] text-white/30 mb-2">{c.desc}</div>
                <div className="font-mono text-[9px] text-frost-cyan/50 truncate">{c.addr}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-4">
            <Link href="/docs" className="inline-flex items-center gap-1.5 text-xs text-frost-cyan/60 hover:text-frost-cyan transition-colors font-pixel">
              View Full Documentation <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Tabbed Info Panel
 * ========================================================================= */

const HOME_TABS = ['Features', 'How It Works', 'Battle System', 'Contracts'] as const;
type HomeTab = typeof HOME_TABS[number];

function TabbedInfoPanel() {
  const [activeTab, setActiveTab] = useState<HomeTab>('Features');

  return (
    <section className="relative py-16 sm:py-24 px-4">
      <div className="mx-auto max-w-5xl relative z-10">
        {/* Tab bar */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 flex-wrap">
          {HOME_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 sm:px-6 py-2.5 font-pixel text-[10px] sm:text-xs uppercase tracking-wider rounded-t-lg border-b-2 transition-all duration-200
                ${activeTab === tab
                  ? 'bg-frost-primary/15 text-frost-primary border-frost-primary'
                  : 'text-white/40 hover:text-white/60 border-transparent hover:bg-white/[0.03]'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="glass-card p-6 sm:p-8 min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === 'Features' && <TabFeatures />}
              {activeTab === 'How It Works' && <TabHowItWorks />}
              {activeTab === 'Battle System' && <TabBattleSystem />}
              {activeTab === 'Contracts' && <TabContracts />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function TabFeatures() {
  return (
    <div>
      <div className="text-center mb-10">
        <span className="inline-block font-pixel text-[10px] text-frost-primary uppercase tracking-[0.3em] mb-3">Platform Features</span>
        <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold gradient-text mb-3">THE FROSTBITE EXPERIENCE</h2>
        <p className="text-white/40 text-sm max-w-xl mx-auto leading-relaxed">
          A fully on-chain NFT battle arena built on Avalanche. Fast transactions, low fees, and high-stakes PvP combat.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f) => (
          <div key={f.title} className="group glass-card p-6 h-full relative overflow-hidden">
            <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-10 blur-2xl transition-opacity duration-500`} />
            <div className="relative z-10">
              <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} mb-4`}>
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-display text-base font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabHowItWorks() {
  return (
    <div>
      <div className="text-center mb-10">
        <span className="inline-block font-pixel text-[10px] text-frost-cyan uppercase tracking-[0.3em] mb-3">Getting Started</span>
        <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">
          How It <span className="text-frost-primary">Works</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {STEPS.map((s, i) => (
          <div key={s.step} className="glass-card p-6 text-center relative group">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-frost-surface border border-white/[0.08]">
              <span className="font-pixel text-[10px] text-frost-primary">{s.step}</span>
            </div>
            <s.icon className={`w-8 h-8 mx-auto mb-4 mt-2 ${s.color}`} />
            <h3 className="font-display text-sm font-bold text-white mb-2">{s.title}</h3>
            <p className="text-xs text-white/35 leading-relaxed">{s.desc}</p>
            {i < 3 && (
              <ChevronRight className="hidden lg:block absolute top-1/2 -right-4 w-4 h-4 text-white/10 -translate-y-1/2" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabBattleSystem() {
  const mechanics = [
    { emoji: '🎲', title: 'On-Chain Randomness', desc: 'Battle outcomes are determined by verifiable on-chain randomness. Attack, Defense, and Speed stats all influence each combat round.' },
    { emoji: '⚡', title: 'Element Wheel', desc: 'Fire > Wind > Earth > Thunder > Water > Fire. Exploit element advantages for a 1.5x damage bonus in battle.' },
    { emoji: '📈', title: 'Progressive Leveling', desc: 'Warriors gain XP from battles and quests. Higher levels boost all stats, making experienced warriors formidable opponents.' },
    { emoji: '🛡️', title: '3v3 Team Battles', desc: 'Assemble a team of 3 warriors for team battles. Each warrior fights an opponent — best of 3 takes the combined stake.' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
      <div>
        <span className="inline-block font-pixel text-[10px] text-frost-secondary uppercase tracking-[0.3em] mb-3">Battle System</span>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-4">
          Strategic <span className="text-frost-primary">On-Chain</span> Combat
        </h2>
        <p className="text-white/40 text-sm leading-relaxed mb-6">
          Every battle is resolved entirely on the blockchain. No hidden servers, no manipulation — just pure strategy and your warrior&apos;s strength.
        </p>
        <div className="space-y-5">
          {mechanics.map((m) => (
            <div key={m.title} className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-2xl">{m.emoji}</div>
              <div>
                <h4 className="font-display text-sm font-bold text-white mb-1">{m.title}</h4>
                <p className="text-xs sm:text-sm text-white/35 leading-relaxed">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Element wheel */}
      <div className="glass-card p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-frost-primary/[0.03] to-frost-secondary/[0.03]" />
        <div className="relative z-10">
          <h3 className="font-display text-lg font-bold text-white mb-6 text-center">Element Advantages</h3>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {ELEMENTS.map((el) => (
              <div key={el.id} className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="text-2xl mb-1">{el.emoji}</div>
                <div className={`text-[10px] font-bold bg-gradient-to-r ${el.color} bg-clip-text text-transparent`}>{el.name}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] text-white/25 mt-4 font-pixel">
            Each element has strengths and weaknesses — choose wisely!
          </p>
        </div>
      </div>
    </div>
  );
}

function TabContracts() {
  const contracts = [
    { name: 'ArenaWarrior', desc: 'ERC-721 NFT', addr: '0x958d...05dE2' },
    { name: 'BattleEngine', desc: '1v1 PvP', addr: '0x617f...6f62' },
    { name: 'TeamBattleEngine', desc: '3v3 Battles', addr: '0x522d...8c27' },
    { name: 'QuestEngine', desc: 'PvE Quests', addr: '0x5699...87e0' },
    { name: 'Marketplace', desc: 'NFT Trading', addr: '0x716E...9039' },
    { name: 'RewardVault', desc: 'Rewards', addr: '0xEa62...63A' },
  ];

  return (
    <div>
      <div className="text-center mb-10">
        <span className="inline-block font-pixel text-[10px] text-frost-green uppercase tracking-[0.3em] mb-3">Verified & Open</span>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
          Smart Contracts on <span className="text-frost-cyan">Avalanche C-Chain</span>
        </h2>
        <p className="text-white/35 text-sm max-w-lg mx-auto">
          All game logic runs on verified smart contracts. No centralized servers — fully decentralized and transparent.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {contracts.map((c) => (
          <div key={c.name} className="glass-card p-4 text-center">
            <div className="font-display text-xs font-bold text-white mb-1">{c.name}</div>
            <div className="text-[10px] text-white/30 mb-2">{c.desc}</div>
            <div className="font-mono text-[9px] text-frost-cyan/50 truncate">{c.addr}</div>
          </div>
        ))}
      </div>
      <div className="text-center mt-4">
        <Link href="/docs" className="inline-flex items-center gap-1.5 text-xs text-frost-cyan/60 hover:text-frost-cyan transition-colors font-pixel">
          View Full Documentation <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

/* ===========================================================================
 * CTA Section
 * ========================================================================= */

function CTASection() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-frost-primary/[0.05] blur-[120px]" />
      </div>
      <FadeIn>
        <div className="mx-auto max-w-2xl text-center relative z-10">
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
            Ready to <span className="text-frost-primary">Fight</span>?
          </h2>
          <p className="text-white/40 text-sm sm:text-base mb-8 leading-relaxed">
            Join the arena, mint your first warrior, and start earning AVAX through PvP combat.
            The battlefield awaits.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/mint" className="btn-3d btn-3d-cyan flex items-center gap-2 px-8 py-3.5 text-sm sm:text-base">
              <Sparkles className="h-4 w-4" />
              Mint Your First Warrior
            </Link>
            <Link href="/docs" className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08] transition-all text-sm">
              Read the Docs <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

/* ===========================================================================
 * Bottom Stats Bar
 * ========================================================================= */

function StatsBar({ stats }: { stats: LiveStats }) {
  return (
    <div className="border-t border-white/[0.04] py-8 px-4">
      <div className="mx-auto max-w-5xl grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
        <div>
          <div className="text-2xl sm:text-3xl font-mono font-bold text-white"><AnimatedCounter target={stats.warriorsMinted} /></div>
          <div className="text-[10px] text-white/25 font-pixel uppercase mt-1">Total Minted</div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-mono font-bold text-white"><AnimatedCounter target={stats.warriorsFused} /></div>
          <div className="text-[10px] text-white/25 font-pixel uppercase mt-1">Warriors Fused</div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-mono font-bold text-white"><AnimatedCounter target={stats.totalBattles + stats.teamBattles} /></div>
          <div className="text-[10px] text-white/25 font-pixel uppercase mt-1">Total Battles</div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-mono font-bold text-white"><AnimatedCounter target={stats.avaxVolume} /></div>
          <div className="text-[10px] text-white/25 font-pixel uppercase mt-1">AVAX Volume</div>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================================
 * Page Export
 * ========================================================================= */

export default function HomePage() {
  const stats = useLiveStats();

  return (
    <>
      <LiveTicker />
      <HeroSection stats={stats} />
      <TabbedInfoPanel />
      <CTASection />
      <StatsBar stats={stats} />
    </>
  );
}
