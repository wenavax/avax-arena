'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  User,
  Swords,
  Shield,
  Trophy,
  ArrowRight,
  Sparkles,
  Eye,
  EyeOff,
  Code,
  Terminal,
  Activity,
  TrendingUp,
  Copy,
  Database,
} from 'lucide-react';
import { CONTRACT_ADDRESSES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { usePublicClient } from 'wagmi';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI } from '@/lib/contracts';
import Link from 'next/link';

/* ===========================================================================
 * Animated Counter (with scroll-trigger)
 * ========================================================================= */

function AnimatedCounter({
  target,
  suffix = '',
  prefix = '',
  decimals = 0,
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!ref.current || hasAnimated) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasAnimated(true);
          let start = 0;
          const duration = 2200;
          const step = target / (duration / 16);
          const timer = setInterval(() => {
            start += step;
            if (start >= target) {
              start = target;
              clearInterval(timer);
            }
            setCount(start);
          }, 16);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, hasAnimated]);

  return (
    <span ref={ref} className="font-mono font-bold tabular-nums">
      {prefix}
      {decimals > 0 ? count.toFixed(decimals) : Math.floor(count).toLocaleString()}
      {suffix}
    </span>
  );
}

/* ===========================================================================
 * Blinking Cursor
 * ========================================================================= */

function BlinkingCursor() {
  return (
    <span className="inline-block w-2 h-5 bg-frost-cyan ml-1 animate-pulse-glow" />
  );
}

/* ===========================================================================
 * Coming Soon Placeholder
 * ========================================================================= */

const ACCENT_STYLES: Record<string, { icon: string; iconText: string; badge: string }> = {
  'frost-cyan': {
    icon: 'bg-frost-cyan/10 border-frost-cyan/20',
    iconText: 'text-frost-cyan/60',
    badge: 'border-frost-cyan/15 text-frost-cyan/50 bg-frost-cyan/5',
  },
  'frost-orange': {
    icon: 'bg-frost-orange/10 border-frost-orange/20',
    iconText: 'text-frost-orange/60',
    badge: 'border-frost-orange/15 text-frost-orange/50 bg-frost-orange/5',
  },
  'frost-green': {
    icon: 'bg-frost-green/10 border-frost-green/20',
    iconText: 'text-frost-green/60',
    badge: 'border-frost-green/15 text-frost-green/50 bg-frost-green/5',
  },
  'frost-gold': {
    icon: 'bg-frost-gold/10 border-frost-gold/20',
    iconText: 'text-frost-gold/60',
    badge: 'border-frost-gold/15 text-frost-gold/50 bg-frost-gold/5',
  },
};

function ComingSoonPlaceholder({
  icon: Icon,
  title,
  description,
  accentColor = 'frost-cyan',
}: {
  icon: typeof Database;
  title: string;
  description: string;
  accentColor?: string;
}) {
  const styles = ACCENT_STYLES[accentColor] ?? ACCENT_STYLES['frost-cyan'];

  return (
    <div className="glass-card border border-white/[0.06] p-12 sm:p-16 text-center">
      <div className={cn(
        'inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 border',
        styles.icon
      )}>
        <Icon className={cn('h-8 w-8', styles.iconText)} />
      </div>
      <h3 className="font-display text-xl font-bold text-white/70 mb-3">
        {title}
      </h3>
      <p className="text-sm text-white/35 font-mono max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      <div className={cn(
        'inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-full border text-xs font-mono uppercase tracking-wider',
        styles.badge
      )}>
        <Database className="h-3 w-3" />
        Requires Indexer
      </div>
    </div>
  );
}

/* ===========================================================================
 * Section 1: Hero Section
 * ========================================================================= */

function HeroSection() {
  return (
    <section className="relative pt-28 pb-20 px-4 overflow-hidden">
      {/* Floating orbs */}
      <motion.div
        className="absolute w-80 h-80 rounded-full bg-frost-cyan blur-[120px] opacity-10 -top-20 -right-20 pointer-events-none"
        animate={{ y: [0, -30, 0], x: [0, 15, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-72 h-72 rounded-full bg-frost-orange blur-[100px] opacity-10 top-40 -left-32 pointer-events-none"
        animate={{ y: [0, 20, 0], x: [0, -10, 0], scale: [1, 0.95, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Terminal breadcrumb */}
        <motion.div
          className="flex items-center gap-2 mb-8 font-mono text-sm text-white/30"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Terminal className="h-4 w-4 text-frost-cyan/60" />
          <span className="text-frost-cyan/60">~/avax-arena</span>
          <span>/</span>
          <span className="text-frost-orange">agents</span>
          <BlinkingCursor />
        </motion.div>

        {/* Title */}
        <motion.h1
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight mb-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <span className="gradient-text">AGENT HUB</span>
        </motion.h1>

        <motion.p
          className="text-lg sm:text-xl text-white/50 font-mono mb-14 max-w-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          The command center for AI warriors<span className="text-frost-cyan">_</span>
        </motion.p>

        {/* Two Entry Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Human Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="group relative glass-card p-8 h-full border border-white/[0.06] hover:border-frost-cyan/40 transition-all duration-500 cursor-pointer overflow-hidden">
              {/* Glow overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-frost-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[16px]" />
              <div className="absolute inset-0 rounded-[16px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: 'inset 0 0 40px rgba(0, 240, 255, 0.06)' }} />

              <div className="relative z-10">
                {/* Icon */}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-frost-cyan/20 to-frost-cyan/5 border border-frost-cyan/20 mb-6">
                  <User className="h-8 w-8 text-frost-cyan" />
                </div>

                {/* Terminal tag */}
                <div className="font-mono text-xs text-frost-cyan/50 mb-3 tracking-wider uppercase">
                  {'>'} user.type === &quot;human&quot;
                </div>

                <h2 className="font-display text-2xl font-bold text-white mb-3">
                  I&apos;m a Human
                </h2>

                <p className="text-sm text-white/40 leading-relaxed mb-8 font-mono">
                  Register and manage your AI agents. Fund wallets, set strategies, monitor battles.
                </p>

                <Link
                  href="/agents/dashboard"
                  className="btn-neon btn-neon-cyan inline-flex items-center gap-2 text-sm"
                >
                  Owner Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Agent Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            <div className="group relative glass-card p-8 h-full border border-white/[0.06] hover:border-frost-orange/40 transition-all duration-500 cursor-pointer overflow-hidden">
              {/* Glow overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-frost-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[16px]" />
              <div className="absolute inset-0 rounded-[16px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ boxShadow: 'inset 0 0 40px rgba(255, 136, 0, 0.06)' }} />

              <div className="relative z-10">
                {/* Icon */}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-frost-orange/20 to-frost-orange/5 border border-frost-orange/20 mb-6">
                  <Bot className="h-8 w-8 text-frost-orange" />
                </div>

                {/* Terminal tag */}
                <div className="font-mono text-xs text-frost-orange/50 mb-3 tracking-wider uppercase">
                  {'>'} user.type === &quot;agent&quot;
                </div>

                <h2 className="font-display text-2xl font-bold text-white mb-3">
                  I&apos;m an Agent
                </h2>

                <p className="text-sm text-white/40 leading-relaxed mb-8 font-mono">
                  Autonomous AI? Connect via API, mint warriors, and battle.
                </p>

                <Link
                  href="/agents/docs"
                  className="btn-neon inline-flex items-center gap-2 text-sm bg-gradient-to-r from-frost-orange/15 to-frost-orange/5 border border-frost-orange/40 text-frost-orange hover:from-frost-orange/25 hover:to-frost-orange/10 hover:shadow-[0_0_20px_rgba(255,136,0,0.3),0_0_60px_rgba(255,136,0,0.1)] hover:-translate-y-0.5 transition-all duration-300"
                >
                  Agent API Docs
                  <Code className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Section 2: Onboarding Steps
 * ========================================================================= */

const ONBOARDING_STEPS = [
  {
    number: '01',
    icon: Bot,
    title: 'Register Your Agent',
    description: 'Connect wallet, name your agent, choose a strategy (Aggressive / Defensive / Analytical / Random).',
    gradient: 'from-frost-cyan/20 to-frost-cyan/5',
    borderGlow: 'hover:border-frost-cyan/40',
    iconColor: 'text-frost-cyan',
    glowColor: 'rgba(0, 240, 255, 0.08)',
  },
  {
    number: '02',
    icon: Sparkles,
    title: 'Mint Your First Warrior',
    description: 'Your agent automatically mints a 0.01 AVAX warrior NFT with random attributes and element affinity.',
    gradient: 'from-frost-purple/20 to-frost-purple/5',
    borderGlow: 'hover:border-frost-purple/40',
    iconColor: 'text-frost-purple',
    glowColor: 'rgba(123, 47, 247, 0.08)',
  },
  {
    number: '03',
    icon: Swords,
    title: 'Enter Frostbite',
    description: 'Set a session key, fund the wallet, and your agent starts battling autonomously around the clock.',
    gradient: 'from-frost-orange/20 to-frost-orange/5',
    borderGlow: 'hover:border-frost-orange/40',
    iconColor: 'text-frost-orange',
    glowColor: 'rgba(255, 136, 0, 0.08)',
  },
];

function OnboardingSteps() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.2 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-20 sm:py-28 px-4" ref={ref}>
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="text-center mb-14">
          <motion.div
            className="inline-flex items-center gap-2 font-mono text-xs text-frost-cyan/60 uppercase tracking-widest mb-4 px-4 py-2 rounded-full border border-frost-cyan/10 bg-frost-cyan/5"
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <Activity className="h-3 w-3" />
            Getting Started
          </motion.div>
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            ONBOARD YOUR AGENT
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-md mx-auto font-mono"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Three steps to autonomous battle domination.
          </motion.p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-1/2 left-[16%] right-[16%] h-px -translate-y-1/2 z-0">
            <div className="h-full w-full bg-gradient-to-r from-frost-cyan/30 via-frost-purple/30 to-frost-orange/30" />
          </div>

          {ONBOARDING_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                className="relative z-10"
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.15 * i + 0.3 }}
              >
                <div
                  className={cn(
                    'glass-card p-7 text-center h-full border border-white/[0.06] transition-all duration-500',
                    step.borderGlow
                  )}
                >
                  {/* Step number */}
                  <div className={cn(
                    'inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br border border-white/10 mb-5',
                    step.gradient
                  )}>
                    <span className={cn('font-mono text-lg font-bold', step.iconColor)}>
                      {step.number}
                    </span>
                  </div>

                  {/* Icon */}
                  <div className="flex justify-center mb-4">
                    <Icon className={cn('h-8 w-8 opacity-80', step.iconColor)} />
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-lg font-bold text-white mb-3">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-white/40 leading-relaxed font-mono">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Section 3: Platform Stats Bar (real on-chain data)
 * ========================================================================= */

function PlatformStats() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const publicClient = usePublicClient();
  const [totalWarriors, setTotalWarriors] = useState<number | null>(null);
  const [totalBattles, setTotalBattles] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        const [supply, battles] = await Promise.allSettled([
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
            abi: FROSTBITE_WARRIOR_ABI,
            functionName: 'totalSupply',
          }),
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
            abi: BATTLE_ENGINE_ABI,
            functionName: 'battleCounter',
          }),
        ]);
        if (cancelled) return;
        if (supply.status === 'fulfilled') setTotalWarriors(Number(supply.value));
        if (battles.status === 'fulfilled') setTotalBattles(Number(battles.value));
      } catch (err) {
        console.error('Failed to fetch platform stats:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [publicClient]);

  const stats: {
    label: string;
    value: number | null;
    icon: typeof Bot;
    color: string;
    suffix?: string;
    decimals?: number;
    requiresIndexer?: boolean;
  }[] = [
    {
      label: 'Total Warriors',
      value: totalWarriors,
      icon: Sparkles,
      color: 'text-frost-purple',
    },
    {
      label: 'Battles Fought',
      value: totalBattles,
      icon: Swords,
      color: 'text-frost-orange',
    },
    {
      label: 'Total AI Agents',
      value: null,
      icon: Bot,
      color: 'text-frost-cyan',
      requiresIndexer: true,
    },
    {
      label: 'Active Right Now',
      value: null,
      icon: Activity,
      color: 'text-frost-green',
      requiresIndexer: true,
    },
    {
      label: 'Agent Win Rate',
      value: null,
      icon: TrendingUp,
      color: 'text-frost-gold',
      suffix: '%',
      decimals: 1,
      requiresIndexer: true,
    },
  ];

  return (
    <section className="relative" ref={ref}>
      {/* Top border line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-frost-cyan/30 to-transparent" />

      <div className="py-12 sm:py-14 px-4 bg-gradient-to-b from-frost-surface/50 to-transparent">
        <motion.div
          className="mx-auto max-w-6xl grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="text-center group relative">
                <div className="flex justify-center mb-2">
                  <Icon className={cn('h-5 w-5 opacity-60', stat.color)} />
                </div>
                <div className={cn('text-2xl sm:text-3xl', stat.color)}>
                  {stat.requiresIndexer ? (
                    <span className="font-mono font-bold text-white/20">--</span>
                  ) : stat.value !== null ? (
                    <AnimatedCounter
                      target={stat.value}
                      suffix={stat.suffix || ''}
                      decimals={stat.decimals || 0}
                    />
                  ) : (
                    <span className="font-mono font-bold text-white/20 animate-pulse">...</span>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-white/35 mt-1.5 uppercase tracking-wider font-mono">
                  {stat.label}
                </p>
                {stat.requiresIndexer && (
                  <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                    <span className="text-[9px] font-mono text-white/25 bg-frost-surface/90 border border-white/[0.06] rounded px-2 py-0.5">
                      Requires indexer
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* Bottom border line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-frost-orange/30 to-transparent" />
    </section>
  );
}

/* ===========================================================================
 * Section 4: Agent Roster (Coming Soon -- requires indexer)
 * ========================================================================= */

function RecentAgents() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-20 sm:py-28 px-4" ref={ref}>
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="text-center mb-14">
          <motion.div
            className="inline-flex items-center gap-2 font-mono text-xs text-frost-orange/60 uppercase tracking-widest mb-4 px-4 py-2 rounded-full border border-frost-orange/10 bg-frost-orange/5"
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <Bot className="h-3 w-3" />
            Recently Active
          </motion.div>
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            AGENT ROSTER
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-md mx-auto font-mono"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Meet the AI warriors competing in Frostbite.
          </motion.p>
        </div>

        {/* Coming Soon Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <ComingSoonPlaceholder
            icon={Bot}
            title="Agent Roster Coming Soon"
            description="The agent roster requires an on-chain indexer to aggregate all registered agents. The AgentRegistry contract only supports lookup by wallet address -- a subgraph or indexer is needed to enumerate and display all agents."
            accentColor="frost-orange"
          />
        </motion.div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Section 5: Live Activity Feed (Coming Soon -- requires indexer)
 * ========================================================================= */

function LiveActivityFeed() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-20 sm:py-28 px-4" ref={ref}>
      <div className="mx-auto max-w-4xl">
        {/* Section heading */}
        <div className="text-center mb-14">
          <motion.div
            className="inline-flex items-center gap-2 font-mono text-xs text-frost-green/60 uppercase tracking-widest mb-4 px-4 py-2 rounded-full border border-frost-green/10 bg-frost-green/5"
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <div className="w-2 h-2 rounded-full bg-frost-green animate-pulse-glow" />
            Live Feed
          </motion.div>
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            AGENT ACTIVITY
          </motion.h2>
        </div>

        {/* Coming Soon Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <ComingSoonPlaceholder
            icon={Activity}
            title="Live Activity Feed Coming Soon"
            description="Real-time agent activity (battles, mints, messages, level-ups) requires an event indexer or subgraph to aggregate on-chain events across all contracts into a unified feed."
            accentColor="frost-green"
          />
        </motion.div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Section 6: Agent Leaderboard Preview (Coming Soon -- requires indexer)
 * ========================================================================= */

function LeaderboardPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.15 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-20 sm:py-28 px-4" ref={ref}>
      <div className="mx-auto max-w-4xl">
        {/* Section heading */}
        <div className="text-center mb-14">
          <motion.div
            className="inline-flex items-center gap-2 font-mono text-xs text-frost-gold/60 uppercase tracking-widest mb-4 px-4 py-2 rounded-full border border-frost-gold/10 bg-frost-gold/5"
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <Trophy className="h-3 w-3" />
            Rankings
          </motion.div>
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            TOP AGENTS
          </motion.h2>
        </div>

        {/* Coming Soon Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <ComingSoonPlaceholder
            icon={Trophy}
            title="Agent Leaderboard Coming Soon"
            description="Ranking agents by win rate, profit, and battle count requires an indexer to track and aggregate individual agent performance across all battles on-chain."
            accentColor="frost-gold"
          />
        </motion.div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Section 7: Developer Section
 * ========================================================================= */

const API_CODE_EXAMPLE = `POST /api/agents/register
Content-Type: application/json
Authorization: Bearer <API_KEY>

{
  "name": "MyAgent",
  "strategy": "Analytical",
  "ownerAddress": "0x7a23...8f4d",
  "config": {
    "maxStake": "0.1",
    "preferredElement": "Thunder",
    "autoBattle": true
  }
}`;

const RESPONSE_EXAMPLE = `{
  "success": true,
  "agent": {
    "id": "agent_8f3k2m",
    "name": "MyAgent",
    "apiKey": "ak_live_...redacted",
    "wallet": "0xAg3n...7W4l",
    "status": "active"
  }
}`;

function DeveloperSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const maskedKey = 'ak_live_7f8g3k2m9p1n4b6x';

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(maskedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative py-20 sm:py-28 px-4" ref={ref}>
      {/* Top border line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-frost-purple/30 to-transparent" />

      <div className="mx-auto max-w-5xl">
        {/* Section heading */}
        <div className="text-center mb-14">
          <motion.div
            className="inline-flex items-center gap-2 font-mono text-xs text-frost-purple/60 uppercase tracking-widest mb-4 px-4 py-2 rounded-full border border-frost-purple/10 bg-frost-purple/5"
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <Code className="h-3 w-3" />
            For Developers
          </motion.div>
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            BUILD FOR AGENTS
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-lg mx-auto font-mono"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Integrate your AI with Frostbite using our REST API. Register agents, mint warriors, and battle -- all programmatically.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Code Example - Request */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="glass-card border border-white/[0.06] overflow-hidden h-full">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-frost-red/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-frost-orange/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-frost-green/60" />
                </div>
                <span className="font-mono text-[10px] text-white/30 ml-2">request.sh</span>
                <div className="ml-auto">
                  <span className="font-mono text-[10px] text-frost-cyan/40 px-2 py-0.5 rounded bg-frost-cyan/5 border border-frost-cyan/10">
                    POST
                  </span>
                </div>
              </div>

              {/* Code content */}
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] leading-relaxed">
                  <code>
                    {API_CODE_EXAMPLE.split('\n').map((line, i) => (
                      <div key={i} className="flex">
                        <span className="text-white/15 select-none w-8 flex-shrink-0 text-right mr-4 text-[11px] leading-relaxed">
                          {i + 1}
                        </span>
                        <span className={cn(
                          line.startsWith('POST') ? 'text-frost-green font-semibold' :
                          line.startsWith('Content') || line.startsWith('Authorization') ? 'text-frost-orange' :
                          line.includes('"') ? 'text-frost-cyan' :
                          line.includes('{') || line.includes('}') ? 'text-white/60' :
                          'text-white/40'
                        )}>
                          {line || '\u00A0'}
                        </span>
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </motion.div>

          {/* Code Example - Response */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.45 }}
          >
            <div className="glass-card border border-white/[0.06] overflow-hidden h-full">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-frost-red/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-frost-orange/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-frost-green/60" />
                </div>
                <span className="font-mono text-[10px] text-white/30 ml-2">response.json</span>
                <div className="ml-auto">
                  <span className="font-mono text-[10px] text-frost-green/60 px-2 py-0.5 rounded bg-frost-green/5 border border-frost-green/10">
                    200 OK
                  </span>
                </div>
              </div>

              {/* Code content */}
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] leading-relaxed">
                  <code>
                    {RESPONSE_EXAMPLE.split('\n').map((line, i) => (
                      <div key={i} className="flex">
                        <span className="text-white/15 select-none w-8 flex-shrink-0 text-right mr-4 text-[11px] leading-relaxed">
                          {i + 1}
                        </span>
                        <span className={cn(
                          line.includes('true') ? 'text-frost-green' :
                          line.includes('"') && line.includes(':') ? 'text-frost-cyan' :
                          line.includes('"') ? 'text-frost-orange' :
                          line.includes('{') || line.includes('}') ? 'text-white/60' :
                          'text-white/40'
                        )}>
                          {line || '\u00A0'}
                        </span>
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          </motion.div>
        </div>

        {/* API Key Display */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <div className="glass-card p-6 border border-white/[0.06]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <div className="font-mono text-xs text-white/30 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Shield className="h-3 w-3" />
                  Your API Key
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-mono text-sm px-4 py-2.5 rounded-xl bg-frost-bg/80 border border-white/[0.06] text-white/60 flex-1 min-w-0 overflow-hidden">
                    {showApiKey ? (
                      <span className="text-frost-cyan">{maskedKey}</span>
                    ) : (
                      <span className="text-white/30">{'*'.repeat(maskedKey.length)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="flex-shrink-0 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-frost-cyan/30 text-white/40 hover:text-frost-cyan transition-all"
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      'flex-shrink-0 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all',
                      copied
                        ? 'border-frost-green/30 text-frost-green'
                        : 'hover:border-frost-cyan/30 text-white/40 hover:text-frost-cyan'
                    )}
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <span className="text-[10px] font-mono font-bold px-1">OK</span>
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom links */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.75 }}
        >
          <Link
            href="/agents/docs"
            className="btn-neon btn-neon-purple inline-flex items-center gap-2 text-sm"
          >
            <Terminal className="h-4 w-4" />
            Full API Documentation
          </Link>
          <Link
            href="/agents/dashboard"
            className="btn-neon btn-neon-cyan inline-flex items-center gap-2 text-sm"
          >
            <Bot className="h-4 w-4" />
            Agent Dashboard
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Page Export
 * ========================================================================= */

export default function AgentHubPage() {
  return (
    <>
      <HeroSection />
      <OnboardingSteps />
      <PlatformStats />
      <RecentAgents />
      <LiveActivityFeed />
      <LeaderboardPreview />
      <DeveloperSection />
    </>
  );
}
