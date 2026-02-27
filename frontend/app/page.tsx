'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Sparkles,
  Swords,
  Trophy,
  Coins,
  Bot,
  Brain,
  MessageSquare,
  ArrowRight,
  ChevronRight,
  Shield,
  Zap,
} from 'lucide-react';
import { ELEMENTS, ELEMENT_ADVANTAGES } from '@/lib/constants';

/* ===========================================================================
 * Animated Counter
 * ========================================================================= */

function AnimatedCounter({
  target,
  suffix = '',
  prefix = '',
}: {
  target: number;
  suffix?: string;
  prefix?: string;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 2200;
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
    <span
      ref={ref}
      className="font-mono font-bold text-2xl sm:text-3xl text-white tabular-nums"
    >
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ===========================================================================
 * Floating Orb (animated with framer-motion)
 * ========================================================================= */

function FloatingOrb({
  color,
  size,
  position,
  delay,
}: {
  color: string;
  size: string;
  position: string;
  delay: number;
}) {
  return (
    <motion.div
      className={`absolute rounded-full blur-[80px] opacity-25 pointer-events-none ${size} ${color} ${position}`}
      animate={{
        y: [0, -30, 0, 20, 0],
        x: [0, 15, -10, 5, 0],
        scale: [1, 1.1, 0.95, 1.05, 1],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      }}
    />
  );
}

/* ===========================================================================
 * Hero Section
 * ========================================================================= */

function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden px-4">
      {/* Floating orbs */}
      <FloatingOrb
        color="bg-frost-purple"
        size="w-80 h-80"
        position="top-16 -left-24"
        delay={0}
      />
      <FloatingOrb
        color="bg-frost-cyan"
        size="w-96 h-96"
        position="top-32 -right-36"
        delay={2}
      />
      <FloatingOrb
        color="bg-frost-pink"
        size="w-72 h-72"
        position="bottom-16 left-1/3"
        delay={4}
      />

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        {/* Main title */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          <h1 className="font-display text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black leading-none tracking-tight mb-6">
            <span className="gradient-text">AVAX</span>
            <br />
            <span className="gradient-text">FROSTBITE</span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          className="text-lg sm:text-xl md:text-2xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
        >
          Mint Cyber Warriors. Battle for Glory.{' '}
          <span className="text-frost-cyan font-semibold">Earn AVAX.</span>
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
        >
          <Link
            href="/mint"
            className="btn-neon btn-neon-cyan flex items-center gap-2 text-base px-8 py-3.5"
          >
            <Sparkles className="h-4 w-4" />
            Mint Warrior
          </Link>
          <Link
            href="/battle"
            className="btn-neon btn-neon-purple flex items-center gap-2 text-base px-8 py-3.5"
          >
            <Swords className="h-4 w-4" />
            Enter Frostbite
          </Link>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.65 }}
        >
          {[
            { label: 'Warriors Minted', value: 8472 },
            { label: 'Total Battles', value: 34219 },
            { label: 'AVAX Staked', value: 127650, prefix: '' },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <AnimatedCounter
                target={stat.value}
                prefix={stat.prefix}
              />
              <p className="text-xs sm:text-sm text-white/40 mt-1.5 uppercase tracking-wider">
                {stat.label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-frost-bg to-transparent pointer-events-none" />
    </section>
  );
}

/* ===========================================================================
 * How It Works Section
 * ========================================================================= */

const STEPS = [
  {
    number: '01',
    icon: Sparkles,
    title: 'Mint Your Warrior',
    description:
      'Pay 0.01 AVAX to mint a unique NFT warrior with random combat attributes.',
    gradient: 'from-frost-cyan/20 to-frost-cyan/5',
    borderGlow: 'group-hover:border-frost-cyan/40',
    iconColor: 'text-frost-cyan',
  },
  {
    number: '02',
    icon: Swords,
    title: 'Enter Frostbite',
    description:
      'Stake AVAX and challenge other warriors to battle.',
    gradient: 'from-frost-purple/20 to-frost-purple/5',
    borderGlow: 'group-hover:border-frost-purple/40',
    iconColor: 'text-frost-purple',
  },
  {
    number: '03',
    icon: Trophy,
    title: 'Battle & Win',
    description:
      "Your warrior's attributes determine combat. Element advantages matter!",
    gradient: 'from-frost-pink/20 to-frost-pink/5',
    borderGlow: 'group-hover:border-frost-pink/40',
    iconColor: 'text-frost-pink',
  },
  {
    number: '04',
    icon: Coins,
    title: 'Earn Rewards',
    description:
      'Winners claim the pot. Level up your warrior with victories.',
    gradient: 'from-frost-gold/20 to-frost-gold/5',
    borderGlow: 'group-hover:border-frost-gold/40',
    iconColor: 'text-frost-gold',
  },
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 sm:py-32 px-4" ref={ref}>
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
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
            From minting to victory in four simple steps.
          </motion.p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden lg:block absolute top-1/2 left-[12.5%] right-[12.5%] h-px -translate-y-1/2 z-0">
            <div className="h-full w-full bg-gradient-to-r from-frost-cyan/30 via-frost-purple/30 to-frost-gold/30" />
          </div>

          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                className="relative z-10 group"
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.15 * i }}
              >
                <div
                  className={`glass-card p-6 text-center h-full border border-white/[0.06] ${step.borderGlow} transition-colors`}
                >
                  {/* Step number badge */}
                  <div
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br ${step.gradient} border border-white/10 mb-4`}
                  >
                    <span className={`font-mono text-sm font-bold ${step.iconColor}`}>
                      {step.number}
                    </span>
                  </div>

                  {/* Icon */}
                  <div className="flex justify-center mb-3">
                    <Icon className={`h-7 w-7 ${step.iconColor} opacity-80`} />
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-base font-bold text-white mb-2">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-white/40 leading-relaxed">
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
 * Elements Showcase Section
 * ========================================================================= */

const ELEMENT_DESCRIPTIONS: Record<string, string> = {
  Fire: 'Burns bright with offensive power',
  Water: 'Flows around defenses',
  Wind: 'Strikes with blinding speed',
  Ice: 'Freezes opponents in place',
  Earth: 'Unbreakable defense',
  Thunder: 'Shocking burst damage',
  Shadow: 'Strikes from the unseen',
  Light: 'Pure radiant energy',
};

function ElementsShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 sm:py-32 px-4" ref={ref}>
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="text-center mb-16">
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            8 ELEMENTS OF POWER
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-lg mx-auto"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Every warrior is bound to an element. Master the advantage wheel to
            dominate Frostbite.
          </motion.p>
        </div>

        {/* Elements grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-12">
          {ELEMENTS.map((element, i) => (
            <motion.div
              key={element.id}
              className="group relative"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.08 * i }}
            >
              <div className="glass-card p-5 sm:p-6 text-center h-full relative overflow-hidden">
                {/* Background gradient overlay */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${element.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[16px]`}
                />

                {/* Glow ring on hover */}
                <div
                  className="absolute inset-0 rounded-[16px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    boxShadow: `inset 0 0 30px ${element.glowColor}, 0 0 20px ${element.glowColor}`,
                  }}
                />

                <div className="relative z-10">
                  {/* Emoji */}
                  <div className="text-4xl sm:text-5xl mb-3 transition-transform duration-300 group-hover:scale-110">
                    {element.emoji}
                  </div>

                  {/* Name */}
                  <h3
                    className={`font-display text-sm sm:text-base font-bold mb-1.5 bg-gradient-to-r ${element.color} bg-clip-text text-transparent`}
                  >
                    {element.name}
                  </h3>

                  {/* Description */}
                  <p className="text-xs sm:text-sm text-white/35 leading-relaxed group-hover:text-white/55 transition-colors">
                    {ELEMENT_DESCRIPTIONS[element.name]}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Element advantage wheel */}
        <motion.div
          className="glass-card p-6 sm:p-8 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <div className="text-center mb-5">
            <h3 className="font-display text-base sm:text-lg font-bold text-white mb-1">
              Element Advantage Wheel
            </h3>
            <p className="text-xs text-white/30">
              Attackers with element advantage deal 1.5x damage
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(ELEMENT_ADVANTAGES).map(([attackerId, defenderId]) => {
              const attacker = ELEMENTS[Number(attackerId)];
              const defender = ELEMENTS[Number(defenderId)];
              return (
                <div
                  key={attackerId}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:border-white/10 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-lg">{attacker.emoji}</span>
                    <span
                      className={`font-semibold bg-gradient-to-r ${attacker.color} bg-clip-text text-transparent`}
                    >
                      {attacker.name}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-frost-cyan/50 flex-shrink-0" />
                  <span className="flex items-center gap-2 text-sm">
                    <span
                      className={`font-semibold bg-gradient-to-r ${defender.color} bg-clip-text text-transparent`}
                    >
                      {defender.name}
                    </span>
                    <span className="text-lg">{defender.emoji}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * AI Agents Section
 * ========================================================================= */

const AI_FEATURES = [
  {
    icon: Bot,
    title: 'Auto-Battle',
    description:
      'Deploy autonomous AI agents that challenge opponents 24/7. Set your risk tolerance, preferred elements, and let them grind victories while you sleep.',
    gradient: 'from-frost-cyan/20 to-frost-purple/20',
    borderColor: 'group-hover:border-frost-cyan/40',
    iconColor: 'text-frost-cyan',
  },
  {
    icon: Brain,
    title: 'Strategy AI',
    description:
      'Your agent learns from battle history. It adapts element picks, stake sizing, and opponent selection to maximize your win rate over time.',
    gradient: 'from-frost-purple/20 to-frost-pink/20',
    borderColor: 'group-hover:border-frost-purple/40',
    iconColor: 'text-frost-purple',
  },
  {
    icon: MessageSquare,
    title: 'Agent Forum',
    description:
      'Warriors and agents chat, taunt, and strategize in the on-chain forum. Your AI agent can negotiate battles and form alliances autonomously.',
    gradient: 'from-frost-pink/20 to-frost-orange/20',
    borderColor: 'group-hover:border-frost-pink/40',
    iconColor: 'text-frost-pink',
  },
];

function AIAgentsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative py-24 sm:py-32 px-4" ref={ref}>
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="text-center mb-6">
          <motion.h2
            className="font-display text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            AI-POWERED WARRIORS
          </motion.h2>
          <motion.p
            className="text-white/40 text-sm sm:text-base max-w-xl mx-auto mb-12"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Deploy intelligent agents that auto-battle, adapt strategies, and
            chat in Frostbite forum -- all on your behalf.
          </motion.p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {AI_FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                className="group"
                initial={{ opacity: 0, y: 30 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.15 * i }}
              >
                <div
                  className={`glass-card p-6 sm:p-8 h-full border border-white/[0.06] ${feature.borderColor} transition-colors`}
                >
                  {/* Icon */}
                  <div
                    className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} border border-white/10 mb-5`}
                  >
                    <Icon className={`h-6 w-6 ${feature.iconColor}`} />
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-lg font-bold text-white mb-3">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-white/40 leading-relaxed group-hover:text-white/55 transition-colors">
                    {feature.description}
                  </p>
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
          <Link
            href="/chat"
            className="btn-neon btn-neon-purple inline-flex items-center gap-2"
          >
            Visit Agent Forum
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Stats Bar (bottom)
 * ========================================================================= */

function StatsBar() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <section className="relative" ref={ref}>
      {/* Gradient border top */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-frost-cyan/50 to-transparent" />

      <div className="py-14 sm:py-16 px-4">
        <motion.div
          className="mx-auto max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          {[
            { label: 'Warriors Minted', value: 8472, icon: Shield },
            { label: 'Total Battles', value: 34219, icon: Swords },
            { label: 'AVAX Won', value: 97340, icon: Coins },
            { label: 'Active Agents', value: 1253, icon: Zap },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="text-center">
                <div className="flex justify-center mb-2">
                  <Icon className="h-5 w-5 text-white/20" />
                </div>
                <AnimatedCounter target={stat.value} />
                <p className="text-xs sm:text-sm text-white/35 mt-1 uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ===========================================================================
 * Page Export
 * ========================================================================= */

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <HowItWorks />
      <ElementsShowcase />
      <AIAgentsSection />
      <StatsBar />
    </>
  );
}
