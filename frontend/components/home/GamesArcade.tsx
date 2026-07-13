'use client';

/**
 * The Frostbite Arcade — a neon bento showcase of every game on the platform.
 * Each game owns an accent colour (breaking the single-red monotone), rendered
 * as a glowing card with procedural cover art (a per-game pattern + a ghosted
 * watermark icon), a status chip, hover lift + shine sweep. Three flagships
 * span wide; the rest tile a 4-column bento (2+2 / 2+1+1 / 1+1+1+1 — no holes).
 */
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Swords, Car, Map, Compass, Dices, Rocket, Gem, ArrowLeftRight, Store, ArrowRight, AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

type Status = 'LIVE' | 'TESTNET' | 'ALPHA' | 'BETA' | 'NEW';
type Pattern = 'diag' | 'lines' | 'grid' | 'dots' | 'rings';
interface Game {
  title: string; sub: string; href: string; icon: LucideIcon; acc: string;
  status: Status; pat: Pattern; feat?: boolean;
  /** Maturity warning shown on the card for non-production games. */
  warn?: string;
}

const GAMES: Game[] = [
  { title: 'Arena', sub: 'Mint warriors, stake AVAX in 1v1 & 3v3 PvP — winner takes the pot. Element advantages add strategy.', href: '/battle', icon: Swords, acc: '#ed2f39', status: 'LIVE', pat: 'diag', feat: true },
  { title: 'CAR(D) GAME', sub: 'Card-combo racing — scheduled 4-player races every 5 minutes, settled by on-chain escrow. Cross-chain entries via Avalanche ICM: coming soon.', href: '/cardgame', icon: Car, acc: '#f5c542', status: 'TESTNET', pat: 'lines', feat: true, warn: 'Fuji testnet — test AVAX only, no real funds' },
  { title: 'Avalanche World', sub: 'An isometric RPG — 18 zones, dungeons, multiplayer, NFT heroes.', href: '/world', icon: Map, acc: '#4dd0e1', status: 'TESTNET', pat: 'grid', feat: true, warn: 'Test phase — may change or reset' },
  { title: 'Adventures', sub: 'Idle NFT staking — stack Frost Shards.', href: '/world/adventures', icon: Compass, acc: '#6ee7a0', status: 'TESTNET', pat: 'dots', warn: 'Test phase — rewards not live yet' },
  { title: 'Expeditions', sub: 'Idle roguelike with AI-authored bosses.', href: '/expeditions', icon: Dices, acc: '#a78bfa', status: 'TESTNET', pat: 'rings', warn: 'Test phase — progress may reset' },
  { title: 'Launchpad', sub: 'Launch & trade tokens, pump-style.', href: '/launchpad', icon: Rocket, acc: '#f97316', status: 'LIVE', pat: 'dots' },
  { title: 'NFT Score', sub: 'Rate any wallet’s NFT portfolio.', href: '/nft-score', icon: Gem, acc: '#c084fc', status: 'BETA', pat: 'grid', warn: 'Beta — scores may change' },
  { title: 'Swap', sub: 'Trade tokens on Avalanche.', href: '/swap', icon: ArrowLeftRight, acc: '#2dd4bf', status: 'LIVE', pat: 'rings' },
  { title: 'Marketplace', sub: 'Buy & sell warrior NFTs.', href: '/marketplace', icon: Store, acc: '#fb7185', status: 'LIVE', pat: 'diag' },
];

const STATUS_STYLE: Record<Status, { dot: string; text: string; label: string }> = {
  LIVE: { dot: '#22c55e', text: '#4ade80', label: 'LIVE' },
  TESTNET: { dot: '#f97316', text: '#fb923c', label: 'TESTNET' },
  ALPHA: { dot: '#a78bfa', text: '#c4b5fd', label: 'ALPHA' },
  BETA: { dot: '#4dd0e1', text: '#67e8f9', label: 'BETA' },
  NEW: { dot: 'var(--acc)', text: 'var(--acc)', label: 'NEW' },
};

function GameCard({ g, i }: { g: Game; i: number }) {
  const reduce = useReducedMotion();
  const Icon = g.icon;
  const st = STATUS_STYLE[g.status];
  return (
    <motion.div
      className={g.feat ? 'col-span-2' : 'col-span-1'}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.4), ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Link href={g.href} className={`arcade-card group ${g.feat ? 'arcade-card--feat' : ''}`} style={{ '--acc': g.acc } as React.CSSProperties}>
        {/* procedural cover art: per-game pattern + ghosted watermark icon */}
        <span className={`arcade-pat arcade-pat--${g.pat}`} aria-hidden />
        <span className="arcade-mark" aria-hidden>
          <Icon className={g.feat ? 'h-36 w-36' : 'h-24 w-24'} strokeWidth={1.4} />
        </span>
        <span className="arcade-glow" aria-hidden />
        <span className="arcade-shine" aria-hidden />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <span className={`arcade-ico ${g.feat ? 'h-14 w-14' : 'h-11 w-11'}`}>
            <Icon className={g.feat ? 'h-7 w-7' : 'h-5 w-5'} strokeWidth={2} />
          </span>
          <span className="arcade-chip" style={{ '--dot': st.dot, '--ctext': st.text } as React.CSSProperties}>
            <i className="arcade-dot" /> {st.label}
          </span>
        </div>
        <div className="relative z-10 mt-auto pt-6">
          <h3 className={`arcade-title font-display font-bold text-white ${g.feat ? 'text-2xl sm:text-[28px]' : 'text-lg'}`}>{g.title}</h3>
          <p className={`text-white/50 leading-relaxed mt-1.5 ${g.feat ? 'text-sm max-w-md' : 'text-xs'}`}>{g.sub}</p>
          {g.warn && (
            <span className="arcade-warn">
              <AlertTriangle className="h-3 w-3 flex-none" strokeWidth={2.4} /> {g.warn}
            </span>
          )}
          <span className="arcade-cta mt-4">
            {g.feat ? 'Enter' : 'Play'} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

export default function GamesArcade() {
  const reduce = useReducedMotion();
  return (
    <section id="arcade" className="relative scroll-mt-16 px-4 py-20 sm:py-28">
      <div className="pointer-events-none absolute left-1/2 top-16 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-frost-primary/[0.05] blur-[130px]" />
      <div className="relative z-10 mx-auto max-w-6xl">
        <motion.div
          className="mb-12 text-center"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="mb-3 inline-block font-sans text-[10px] font-semibold uppercase tracking-[0.3em] text-frost-primary">Choose your game</span>
          <h2 className="font-stamp text-5xl uppercase leading-[0.9] tracking-tight text-white sm:text-6xl md:text-7xl">
            THE <span className="text-frost-primary">ARCADE</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-white/50">On-chain games and tools, one wallet. Jump into any of them below.</p>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {GAMES.map((g, i) => <GameCard key={g.title} g={g} i={i} />)}
        </div>
      </div>
    </section>
  );
}
