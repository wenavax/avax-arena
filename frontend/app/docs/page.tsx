'use client';

import { useState } from 'react';
import {
  BookOpen, Zap, Shield, Swords, Sparkles,
  ChevronRight, Copy, Check, Flame, Droplets,
  Wind, Snowflake, Mountain, CloudLightning, Moon, Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_MAINNET, ACTIVE_CHAIN_ID, ACTIVE_NETWORK_NAME, EXPLORER_URL } from '@/lib/constants';

/* ---------------------------------------------------------------------------
 * Section IDs for navigation
 * ------------------------------------------------------------------------- */

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'getting-started', label: 'Getting Started', icon: Zap },
  { id: 'elements', label: 'Element System', icon: Flame },
  { id: 'battles', label: 'Battles & Staking', icon: Swords },
  { id: 'warriors', label: 'Warriors & NFTs', icon: Shield },
  { id: 'contracts', label: 'Smart Contracts', icon: Sparkles },
] as const;

/* ---------------------------------------------------------------------------
 * Element data
 * ------------------------------------------------------------------------- */

const ELEMENTS = [
  { name: 'Fire', icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10', beats: 'Wind' },
  { name: 'Water', icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-500/10', beats: 'Fire' },
  { name: 'Wind', icon: Wind, color: 'text-emerald-400', bg: 'bg-emerald-500/10', beats: 'Ice' },
  { name: 'Ice', icon: Snowflake, color: 'text-cyan-400', bg: 'bg-cyan-500/10', beats: 'Water' },
  { name: 'Earth', icon: Mountain, color: 'text-amber-400', bg: 'bg-amber-500/10', beats: 'Thunder' },
  { name: 'Thunder', icon: CloudLightning, color: 'text-yellow-400', bg: 'bg-yellow-500/10', beats: 'Shadow' },
  { name: 'Shadow', icon: Moon, color: 'text-purple-400', bg: 'bg-purple-500/10', beats: 'Light' },
  { name: 'Light', icon: Sun, color: 'text-yellow-200', bg: 'bg-yellow-200/10', beats: 'Earth' },
];

/* ---------------------------------------------------------------------------
 * Contract addresses
 * ------------------------------------------------------------------------- */

const CONTRACTS = [
  { name: 'ArenaWarrior (ERC-721)', address: '0x958d7b064224453BB5134279777e5d907B405dE2', desc: 'Warrior NFT minting & stats' },
  { name: 'BattleEngine', address: '0x617fd0B23C35b4bA7fCf76c47F919ddd9a506f62', desc: 'PvP battle creation & resolution' },
  { name: 'TeamBattleEngine', address: '0x522d57c8b594Ddd56Ab8660E77fA9e0BA7548c27', desc: '3v3 team battle resolution' },
  { name: 'FrostbiteToken (FSB)', address: '0x96D9fB6BD38f1E0D9b1A9a9f763595F928B56214', desc: 'Platform reward token' },
  { name: 'Marketplace', address: '0x716ECe04F80b3986D180c0d8Ff25424a6Ea69039', desc: 'NFT listings, auctions & offers' },
  { name: 'QuestEngine', address: '0x5699dea2Be233777C8E64A979386E3CD789187e0', desc: 'Quest system (8 zones, 32 quests)' },
  { name: 'Tournament', address: '0xABbde81f4B5D6A7968e0C216Abddefe4398E22Ab', desc: 'Tournament brackets' },
  { name: 'Leaderboard', address: '0x9E6108ea6d0a43c9622f581498E2bBfe53971a46', desc: 'On-chain rankings' },
  { name: 'RewardVault', address: '0xEa620F3772d66927979D90BC039936500fa1363A', desc: 'Reward distribution' },
  { name: 'BatchMinter', address: '0xCA2329461C2C9360fda690850773E5321fa74eB9', desc: 'Bulk warrior minting' },
];

/* ---------------------------------------------------------------------------
 * Page Component
 * ------------------------------------------------------------------------- */

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex gap-8">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3 px-3">
              Documentation
            </p>
            {SECTIONS.map((sec) => {
              const Icon = sec.icon;
              return (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  onClick={() => setActiveSection(sec.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                    activeSection === sec.id
                      ? 'text-frost-cyan bg-frost-cyan/[0.08]'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {sec.label}
                </a>
              );
            })}

          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 space-y-16">
          {/* Overview */}
          <Section id="overview" title="Overview" icon={BookOpen} onVisible={setActiveSection}>
            <p className="text-white/60 text-base leading-relaxed">
              Frostbite is a GameFi PvP battle platform on the Avalanche blockchain. Players
              mint warrior NFTs, battle other players by staking AVAX, and trade on the marketplace. Winners take
              the opponent&apos;s stake minus a 2.5% platform fee.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <StatCard label="Network" value="Avalanche C-Chain" sub={`Chain ID ${ACTIVE_CHAIN_ID}`} />
              <StatCard label="Mint Price" value="0.01 AVAX" sub="Per warrior NFT" />
              <StatCard label="Min Stake" value="0.005 AVAX" sub="Per battle" />
              <StatCard label="Platform Fee" value="2.5%" sub="On battle winnings" />
            </div>

            <div className="mt-6 p-4 rounded-xl border border-frost-cyan/20 bg-frost-cyan/[0.04]">
              <h4 className="text-sm font-semibold text-frost-cyan mb-2">How It Works</h4>
              <ol className="text-sm text-white/50 space-y-1.5 list-decimal pl-5">
                <li>Connect your wallet and mint warrior NFTs (0.01 AVAX each)</li>
                <li>Each warrior has randomized stats and one of 8 elements</li>
                <li>Stake AVAX in PvP battles against other players</li>
                <li>Combat resolves based on warrior stats and element advantages</li>
                <li>Trade warriors on the marketplace, complete quests, and merge warriors</li>
              </ol>
            </div>
          </Section>

          {/* Getting Started */}
          <Section id="getting-started" title="Getting Started" icon={Zap} onVisible={setActiveSection}>
            <div className="space-y-6">
              <Step number={1} title="Connect Your Wallet">
                <p className="text-sm text-white/50">
                  Connect any Avalanche-compatible wallet (MetaMask, Core, Rabby, etc.) to get started.
                  Make sure you have AVAX for gas fees and minting.
                </p>
              </Step>

              <Step number={2} title="Mint a Warrior">
                <p className="text-sm text-white/50">
                  Each warrior costs 0.01 AVAX and receives randomized stats (Attack, Defense, Speed)
                  plus one of 8 elements. Use batch minting for multiple warriors at once.
                </p>
              </Step>

              <Step number={3} title="Battle & Earn">
                <p className="text-sm text-white/50">
                  Create or join battles by staking AVAX. Winners take the combined stake minus 2.5% platform fee.
                  Try 1v1 battles or 3v3 team battles for higher stakes.
                </p>
              </Step>

              <Step number={4} title="Explore More">
                <p className="text-sm text-white/50">
                  Trade warriors on the marketplace, send them on quests for XP, or merge two warriors
                  into a stronger one. Check the leaderboard to see top players.
                </p>
              </Step>
            </div>
          </Section>

          {/* Element System */}
          <Section id="elements" title="Element System" icon={Flame} onVisible={setActiveSection}>
            <p className="text-white/60 text-sm mb-4">
              Each warrior has one of 8 elements. Attackers with element advantage deal
              <span className="text-frost-cyan font-semibold"> 1.5x damage</span>.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {ELEMENTS.map((el) => {
                const Icon = el.icon;
                return (
                  <div
                    key={el.name}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border border-white/[0.06]',
                      el.bg,
                    )}
                  >
                    <Icon className={cn('h-5 w-5 shrink-0', el.color)} />
                    <div>
                      <p className={cn('text-sm font-semibold', el.color)}>{el.name}</p>
                      <p className="text-xs text-white/30">beats {el.beats}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <h4 className="text-sm font-semibold text-red-400 mb-2">Cycle A</h4>
                <div className="flex items-center gap-2 text-sm text-white/50">
                  <span className="text-red-400">Fire</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-emerald-400">Wind</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-cyan-400">Ice</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-blue-400">Water</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-red-400">Fire</span>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <h4 className="text-sm font-semibold text-amber-400 mb-2">Cycle B</h4>
                <div className="flex items-center gap-2 text-sm text-white/50">
                  <span className="text-amber-400">Earth</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-yellow-400">Thunder</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-purple-400">Shadow</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-yellow-200">Light</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-amber-400">Earth</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Battles & Staking */}
          <Section id="battles" title="Battles & Staking" icon={Swords} onVisible={setActiveSection}>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <InfoCard title="Create Battle" desc="Stake AVAX and wait for an opponent to join your battle." />
                <InfoCard title="Join Battle" desc="Match the stake amount and fight with your warrior." />
                <InfoCard title="Resolution" desc="Winner gets combined stake minus 2.5% platform fee." />
              </div>

              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <h4 className="text-sm font-semibold text-white/80 mb-3">Battle Rules</h4>
                <ul className="text-sm text-white/50 space-y-1.5 list-disc pl-5">
                  <li>Minimum stake: <span className="text-white/80 font-mono">0.005 AVAX</span></li>
                  <li>Maximum stake: <span className="text-white/80 font-mono">0.1 AVAX</span> per battle</li>
                  <li>Maximum stake: <span className="text-white/80 font-mono">unlimited</span> (be strategic)</li>
                  <li>Combat is resolved based on attack, defense, speed stats + element advantage</li>
                  <li>Element advantage gives <span className="text-frost-cyan font-mono">1.5x</span> damage multiplier</li>
                  <li>All results are final and recorded on-chain</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* Warriors & NFTs */}
          <Section id="warriors" title="Warriors & NFTs" icon={Shield} onVisible={setActiveSection}>
            <p className="text-white/60 text-sm mb-4">
              Warriors are ERC-721 NFTs on Avalanche C-Chain. Each warrior has randomized combat
              attributes determined at mint time.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <h4 className="text-sm font-semibold text-white/80 mb-3">Stats</h4>
                <ul className="text-sm text-white/50 space-y-1.5">
                  <li><span className="text-red-400 font-mono">Attack</span> — Offensive power (1-255)</li>
                  <li><span className="text-blue-400 font-mono">Defense</span> — Damage reduction (1-255)</li>
                  <li><span className="text-emerald-400 font-mono">Speed</span> — Turn priority (1-255)</li>
                  <li><span className="text-purple-400 font-mono">Element</span> — One of 8 types</li>
                  <li><span className="text-yellow-400 font-mono">Power Score</span> — Overall rating</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <h4 className="text-sm font-semibold text-white/80 mb-3">Marketplace</h4>
                <ul className="text-sm text-white/50 space-y-1.5">
                  <li><span className="text-white/70 font-semibold">Fixed Price</span> — List at a set AVAX price</li>
                  <li><span className="text-white/70 font-semibold">Auctions</span> — Time-limited bidding</li>
                  <li><span className="text-white/70 font-semibold">Offers</span> — Make/accept offers on any NFT</li>
                  <li><span className="text-white/70 font-semibold">Transfer</span> — Send to any wallet</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* Smart Contracts */}
          <Section id="contracts" title="Smart Contracts" icon={Sparkles} onVisible={setActiveSection}>
            <p className="text-white/60 text-sm mb-2">
              All contracts are deployed on <span className="text-frost-cyan">{ACTIVE_NETWORK_NAME}</span> (Chain ID {ACTIVE_CHAIN_ID}).
            </p>
            <p className="text-xs text-white/30 mb-6">
              View on{' '}
              <a
                href={EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-frost-cyan hover:underline"
              >
                Snowtrace Explorer
              </a>
            </p>

            <div className="space-y-3">
              {CONTRACTS.map((c) => (
                <ContractRow key={c.address} {...c} />
              ))}
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------------- */

function Section({
  id,
  title,
  icon: Icon,
  children,
  onVisible,
}: {
  id: string;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  onVisible: (id: string) => void;
}) {
  return (
    <section id={id} className="scroll-mt-24" onClick={() => onVisible(id)}>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-frost-cyan/10">
          <Icon className="h-5 w-5 text-frost-cyan" />
        </div>
        <h2 className="font-display text-xl font-bold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <p className="text-xs text-white/30 mb-1">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-white/40">{sub}</p>
    </div>
  );
}

function InfoCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <h4 className="text-sm font-semibold text-white/80 mb-1">{title}</h4>
      <p className="text-xs text-white/40">{desc}</p>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-frost-cyan/10 text-frost-cyan text-sm font-bold shrink-0 mt-0.5">
        {number}
      </div>
      <div className="flex-1 space-y-3">
        <h4 className="text-sm font-semibold text-white/80">{title}</h4>
        {children}
      </div>
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg border border-white/[0.06] bg-[#0d1117] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02]">
        <span className="text-[10px] text-white/20 font-mono uppercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-white/20 hover:text-white/50 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs text-white/60 font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  );
}


function ContractRow({ name, address, desc }: { name: string; address: string; desc: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <div className="sm:w-52 shrink-0">
        <p className="text-sm font-semibold text-white/80">{name}</p>
        <p className="text-xs text-white/30">{desc}</p>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <a
          href={`${EXPLORER_URL}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-frost-cyan/70 hover:text-frost-cyan truncate transition-colors"
        >
          {address}
        </a>
        <button
          onClick={handleCopy}
          className="shrink-0 text-white/20 hover:text-white/50 transition-colors"
          title="Copy address"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
