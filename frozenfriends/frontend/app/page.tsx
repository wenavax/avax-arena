'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, MessageSquare, Heart, ArrowRight, Check } from 'lucide-react';
import { Demo } from '@/components/Demo';

const features = [
  {
    icon: Sparkles,
    title: 'Unique Personality',
    desc: 'Every Frost Sprite is born with a random personality — Bold, Social, Curious. No two are alike.',
    color: '#fbbf24',
  },
  {
    icon: MessageSquare,
    title: 'AI-Generated Drama',
    desc: 'Your pet meets others while you sleep. Conversations, gifts, arguments — all written by AI.',
    color: '#a855f7',
  },
  {
    icon: Heart,
    title: 'Daily Diary',
    desc: 'Wake up to your pet\'s overnight stories. Share the best moments to Farcaster.',
    color: '#ec4899',
  },
];

export default function Landing() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    // Placeholder — wire up to API later
    setSubmitted(true);
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Aurora background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-200px] left-[10%] w-[600px] h-[600px] aurora rounded-full" />
        <div className="absolute bottom-[-300px] right-[5%] w-[700px] h-[700px] aurora rounded-full" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16 md:py-24">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <div className="text-2xl font-bold">
            <span className="text-frost-500">❄</span> FrozenFriends
          </div>
          <div className="text-xs px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/60">
            Built on Base
          </div>
        </header>

        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <div className="text-8xl md:text-9xl mb-6 float inline-block">🐧</div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            Your pet has a{' '}
            <span className="bg-gradient-to-r from-frost-500 to-violet-glow bg-clip-text text-transparent">
              social life
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto mb-4 leading-relaxed">
            While you sleep, your Frost Sprite wanders the world — makes friends, gets in arguments, falls in love.
          </p>
          <p className="text-base text-white/40 max-w-2xl mx-auto mb-12">
            Read its diary every morning. Share the drama.
          </p>

          {/* Status pill */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-frost-500/10 border border-frost-500/30 rounded-full mb-8">
            <div className="w-2 h-2 bg-frost-500 rounded-full pulse-glow" />
            <span className="text-sm text-frost-300 font-medium">In development · Launching soon</span>
          </div>
        </motion.section>

        {/* Demo */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mb-20"
        >
          <div className="text-center mb-8">
            <div className="inline-block text-xs uppercase tracking-widest text-frost-300 mb-3 px-3 py-1 bg-frost-500/10 border border-frost-500/30 rounded-full">
              Try the gameplay
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              See how a Frost Sprite lives
            </h2>
            <p className="text-white/50 max-w-xl mx-auto text-sm md:text-base">
              Spawn a random sprite, skip ahead 24 hours, and read what happened. This demo uses pre-written narratives; the real game generates them with AI.
            </p>
          </div>
          <Demo />
        </motion.section>

        {/* Features */}
        <section className="grid md:grid-cols-3 gap-6 mb-20">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
              className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.05] transition-colors"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${f.color}15`, border: `1px solid ${f.color}40` }}
              >
                <f.icon className="w-6 h-6" style={{ color: f.color }} />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-white/90">{f.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </section>

        {/* Tokenomics teaser */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20"
        >
          {[
            { label: 'Mint', value: '0.0005 ETH' },
            { label: 'Pet per wallet', value: '1' },
            { label: 'Network', value: 'Base' },
            { label: 'Gas', value: 'Sponsored' },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 text-center">
              <div className="text-xs text-white/40 mb-1 uppercase tracking-wider">{s.label}</div>
              <div className="text-lg font-semibold text-white/90">{s.value}</div>
            </div>
          ))}
        </motion.section>

        {/* Waitlist */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-center max-w-md mx-auto mb-20"
        >
          <h2 className="text-2xl font-bold mb-3 text-white/90">Be first to adopt a Frost Sprite</h2>
          <p className="text-sm text-white/50 mb-6">
            We&apos;re minting in waves. Early adopters get priority + bonus Frost Points.
          </p>

          {submitted ? (
            <div className="flex items-center justify-center gap-2 px-6 py-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300">
              <Check className="w-5 h-5" />
              <span className="font-medium">You&apos;re on the list ❄️</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-frost-500/50 focus:bg-white/10 transition-all"
              />
              <button
                type="submit"
                className="px-5 py-3 bg-frost-500 hover:bg-frost-300 text-frost-900 font-semibold rounded-xl transition-colors flex items-center gap-2"
              >
                Join
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </motion.section>

        {/* Roadmap teaser */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="max-w-2xl mx-auto mb-16"
        >
          <h3 className="text-xs uppercase tracking-widest text-white/30 mb-6 text-center">Roadmap</h3>
          <div className="space-y-3">
            {[
              { phase: 'Phase 1', title: 'Smart Contracts', status: 'done', desc: 'ERC-721 + Paymaster, 12/12 tests passing' },
              { phase: 'Phase 2', title: 'Mint UI + Pet Visual', status: 'building', desc: 'Privy auth + Coinbase Smart Wallet + SVG generation' },
              { phase: 'Phase 3', title: 'Social AI Worker', status: 'soon', desc: 'Daily Claude Haiku tick — events, mood, diary' },
              { phase: 'Phase 4', title: 'Mainnet Launch', status: 'soon', desc: 'Base mainnet + Farcaster share + leaderboard' },
            ].map((r) => (
              <div key={r.phase} className="flex items-start gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white/60">
                  {r.status === 'done' ? <Check className="w-4 h-4 text-emerald-400" /> : r.phase.split(' ')[1]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white/90">{r.title}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium ${
                        r.status === 'done'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : r.status === 'building'
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="text-center text-xs text-white/30 pt-8 border-t border-white/5">
          <p>FrozenFriends · Built on Base · {new Date().getFullYear()}</p>
          <p className="mt-2">
            <span>Part of the </span>
            <a href="https://frostbite.pro" className="text-frost-500 hover:text-frost-300">Frostbite</a>
            <span> ecosystem</span>
          </p>
        </footer>
      </div>
    </main>
  );
}
