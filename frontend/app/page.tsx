'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Wallet,
  Gamepad2,
  Coins,
  Trophy,
  Bot,
  Zap,
  ShieldCheck,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import { GAMES } from '@/lib/constants';

/* ---------------------------------------------------------------------------
 * Animated Counter (used in stats row)
 * ------------------------------------------------------------------------- */

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 2000;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        start = target;
        clearInterval(timer);
      }
      setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target]);

  return (
    <span ref={ref} className="font-mono font-bold text-2xl sm:text-3xl text-white tabular-nums">
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Hero Section
 * ------------------------------------------------------------------------- */

function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden px-4">
      {/* Floating orbs */}
      <div
        className="orb w-72 h-72 bg-arena-purple top-20 -left-20"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="orb w-96 h-96 bg-arena-cyan top-40 -right-32"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="orb w-64 h-64 bg-arena-pink bottom-20 left-1/3"
        style={{ animationDelay: '4s' }}
      />

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p className="text-sm sm:text-base font-semibold uppercase tracking-[0.3em] text-arena-cyan/80 mb-4">
            On-Chain PvP Gaming
          </p>

          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-none tracking-tight mb-6">
            <span className="gradient-text">THE ARENA</span>
            <br />
            <span className="text-white">AWAITS</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-3">
            PvP Mini-Games on Avalanche C-Chain
          </p>
          <p className="text-sm sm:text-base text-white/40 max-w-xl mx-auto mb-10">
            Stake AVAX. Duel opponents or deploy AI Agents. Seven games, one arena, endless glory.
          </p>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <Link href="/play" className="btn-primary flex items-center gap-2 text-base">
            Enter Arena
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/leaderboard" className="btn-neon btn-neon-cyan flex items-center gap-2">
            View Leaderboard
            <BarChart3 className="h-4 w-4" />
          </Link>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          {[
            { label: 'Total Games', value: 12847, suffix: '' },
            { label: 'AVAX Staked', value: 58420, suffix: '' },
            { label: 'Active Players', value: 3291, suffix: '' },
            { label: 'AI Agents', value: 847, suffix: '' },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              <p className="text-xs sm:text-sm text-white/40 mt-1 uppercase tracking-wider">
                {stat.label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Games Showcase Section
 * ------------------------------------------------------------------------- */

function GamesShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 sm:py-32 px-4" ref={ref}>
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="text-center mb-16">
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            CHOOSE YOUR BATTLE
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-lg mx-auto"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Seven unique games. Commit-reveal fairness. Pure on-chain PvP.
          </motion.p>
        </div>

        {/* Games Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {GAMES.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 * i }}
            >
              <Link
                href={`/play?game=${game.slug}`}
                className="game-card glass-card block p-6 h-full group"
              >
                {/* Gradient bg overlay */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${game.bgGradient} rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />

                <div className="relative z-10">
                  {/* Emoji */}
                  <div className="text-5xl mb-4">{game.emoji}</div>

                  {/* Name with game color gradient */}
                  <h3
                    className={`font-display text-lg font-bold mb-2 bg-gradient-to-r ${game.color} bg-clip-text text-transparent`}
                  >
                    {game.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-white/40 group-hover:text-white/60 transition-colors">
                    {game.description}
                  </p>

                  {/* Hover arrow */}
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-white/20 group-hover:text-arena-cyan transition-colors">
                    Play now <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * How It Works Section
 * ------------------------------------------------------------------------- */

const STEPS = [
  {
    number: '01',
    icon: Wallet,
    title: 'Connect Wallet',
    description: 'Link your wallet to the Avalanche C-Chain with one click via RainbowKit.',
  },
  {
    number: '02',
    icon: Gamepad2,
    title: 'Choose Game',
    description: 'Pick from seven PvP mini-games, each with unique mechanics and strategies.',
  },
  {
    number: '03',
    icon: Coins,
    title: 'Stake AVAX',
    description: 'Set your wager and create a game room, or join an existing challenge.',
  },
  {
    number: '04',
    icon: Trophy,
    title: 'Win Rewards',
    description: 'Outplay your opponent and claim the prize pool directly to your wallet.',
  },
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 sm:py-32 px-4" ref={ref}>
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="text-center mb-16">
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            HOW IT WORKS
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-md mx-auto"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            From wallet connection to victory in four simple steps.
          </motion.p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden lg:block absolute top-1/2 left-[12.5%] right-[12.5%] h-px -translate-y-1/2">
            <div className="h-full w-full bg-gradient-to-r from-arena-cyan/40 via-arena-purple/40 to-arena-pink/40" />
          </div>

          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                className="relative"
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.15 * i }}
              >
                <div className="glass-card p-6 text-center h-full">
                  {/* Step number badge */}
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-arena-cyan/20 to-arena-purple/20 border border-arena-cyan/20 mb-4 relative z-10">
                    <span className="font-mono text-sm font-bold text-arena-cyan">
                      {step.number}
                    </span>
                  </div>

                  {/* Icon */}
                  <div className="flex justify-center mb-3">
                    <Icon className="h-6 w-6 text-white/60" />
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-base font-bold text-white mb-2">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-white/40 leading-relaxed">{step.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * AI Agents Section
 * ------------------------------------------------------------------------- */

const AI_FEATURES = [
  {
    icon: Bot,
    title: 'Autonomous Play',
    description: 'AI agents duel other players 24/7, even when you are offline. Set strategies and let them earn.',
  },
  {
    icon: Zap,
    title: 'Multiple Strategies',
    description: 'Choose from aggressive, defensive, or adaptive playstyles. Each agent has unique decision-making logic.',
  },
  {
    icon: ShieldCheck,
    title: 'Session Keys',
    description: 'Delegate limited permissions to your agent via session keys. Your funds stay secure in your wallet.',
  },
  {
    icon: BarChart3,
    title: 'Performance Tracking',
    description: 'Monitor win rates, ROI, and game history. Optimize your agent configuration for maximum returns.',
  },
];

function AIAgentsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 sm:py-32 px-4" ref={ref}>
      <div className="mx-auto max-w-6xl">
        {/* Heading */}
        <div className="text-center mb-16">
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            AI-POWERED GAMEPLAY
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-lg mx-auto"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Deploy autonomous AI agents that compete on your behalf. Earn while you sleep.
          </motion.p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {AI_FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                className="glass-card p-6 sm:p-8 group"
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.12 * i }}
              >
                <div className="flex items-start gap-4">
                  {/* Icon container */}
                  <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-arena-purple/20 to-arena-pink/20 border border-arena-purple/20 group-hover:border-arena-purple/40 transition-colors">
                    <Icon className="h-5 w-5 text-arena-purple" />
                  </div>

                  <div>
                    <h3 className="font-display text-base font-bold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-white/40 leading-relaxed group-hover:text-white/55 transition-colors">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Link href="/play" className="btn-neon btn-neon-purple inline-flex items-center gap-2">
            Deploy Your Agent
            <Bot className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <GamesShowcase />
      <HowItWorks />
      <AIAgentsSection />
    </>
  );
}
