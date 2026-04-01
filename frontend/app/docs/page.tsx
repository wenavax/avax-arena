'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  BookOpen, Zap, Shield, Swords, Sparkles, Flame, Droplets, Wind, Snowflake,
  Mountain, CloudLightning, Moon, Sun, ChevronRight, Copy, Check, Search,
  Menu, X, Map, ShoppingCart, GitMerge, Coins, FileCode, HelpCircle,
  ExternalLink, Users, Trophy, Target, Layers, ArrowRight, Star, Clock,
  Wallet, Gavel, Tag, Activity, Heart, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  IS_MAINNET, ACTIVE_CHAIN_ID, ACTIVE_NETWORK_NAME, EXPLORER_URL,
  MINT_PRICE, MERGE_PRICE, MIN_BATTLE_STAKE, MIN_TEAM_BATTLE_STAKE,
  PLATFORM_FEE_PERCENT, ELEMENTS, ELEMENT_ADVANTAGES,
} from '@/lib/constants';

/* ===========================================================================
 * Navigation structure
 * =========================================================================== */

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { id: 'welcome', label: 'Welcome', icon: BookOpen },
      { id: 'getting-started', label: 'Getting Started', icon: Zap },
    ],
  },
  {
    title: 'Gameplay',
    items: [
      { id: 'warriors', label: 'Warriors & NFTs', icon: Shield },
      { id: 'battle-system', label: 'Battle System (1v1)', icon: Swords },
      { id: 'team-battles', label: 'Team Battles (3v3)', icon: Users },
      { id: 'quest-system', label: 'Quest System', icon: Map },
      { id: 'warrior-fusion', label: 'Warrior Fusion', icon: GitMerge },
      { id: 'marketplace', label: 'Marketplace', icon: ShoppingCart },
    ],
  },
  {
    title: 'Economy',
    items: [
      { id: 'tokenomics', label: 'AVAX Tokenomics', icon: Coins },
      { id: 'rewards', label: 'Rewards & Fees', icon: Trophy },
    ],
  },
  {
    title: 'Smart Contracts',
    items: [
      { id: 'contracts', label: 'Contract Addresses', icon: FileCode },
    ],
  },
  {
    title: 'Community',
    items: [
      { id: 'faq', label: 'FAQ', icon: HelpCircle },
      { id: 'links', label: 'Links & Socials', icon: ExternalLink },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/* ===========================================================================
 * Contract data
 * =========================================================================== */

const CONTRACTS = [
  { name: 'ArenaWarrior (ERC-721)', address: '0x958d7b064224453BB5134279777e5d907B405dE2', desc: 'Warrior NFT minting & stats' },
  { name: 'BattleEngine', address: '0x617fd0B23C35b4bA7fCf76c47F919ddd9a506f62', desc: '1v1 PvP battle creation & resolution' },
  { name: 'TeamBattleEngine', address: '0x522d57c8b594Ddd56Ab8660E77fA9e0BA7548c27', desc: '3v3 team battle resolution' },
  { name: 'FrostbiteToken (FSB)', address: '0x96D9fB6BD38f1E0D9b1A9a9f763595F928B56214', desc: 'Platform reward token' },
  { name: 'Marketplace', address: '0x716ECe04F80b3986D180c0d8Ff25424a6Ea69039', desc: 'NFT listings, auctions & offers' },
  { name: 'QuestEngine', address: '0x5699dea2Be233777C8E64A979386E3CD789187e0', desc: 'Quest system — 8 zones, 32 quests' },
  { name: 'Tournament', address: '0xABbde81f4B5D6A7968e0C216Abddefe4398E22Ab', desc: 'Tournament brackets' },
  { name: 'Leaderboard', address: '0x9E6108ea6d0a43c9622f581498E2bBfe53971a46', desc: 'On-chain rankings' },
  { name: 'RewardVault', address: '0xEa620F3772d66927979D90BC039936500fa1363A', desc: 'Reward distribution' },
  { name: 'BatchMinter', address: '0xCA2329461C2C9360fda690850773E5321fa74eB9', desc: 'Bulk warrior minting' },
];

/* ===========================================================================
 * Element data
 * =========================================================================== */

const ELEMENT_DATA = [
  { name: 'Fire', icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10', beats: 'Wind' },
  { name: 'Water', icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-500/10', beats: 'Fire' },
  { name: 'Wind', icon: Wind, color: 'text-emerald-400', bg: 'bg-emerald-500/10', beats: 'Ice' },
  { name: 'Ice', icon: Snowflake, color: 'text-cyan-400', bg: 'bg-cyan-500/10', beats: 'Water' },
  { name: 'Earth', icon: Mountain, color: 'text-amber-400', bg: 'bg-amber-500/10', beats: 'Thunder' },
  { name: 'Thunder', icon: CloudLightning, color: 'text-yellow-400', bg: 'bg-yellow-500/10', beats: 'Shadow' },
  { name: 'Shadow', icon: Moon, color: 'text-purple-400', bg: 'bg-purple-500/10', beats: 'Light' },
  { name: 'Light', icon: Sun, color: 'text-yellow-200', bg: 'bg-yellow-200/10', beats: 'Earth' },
];

/* ===========================================================================
 * FAQ data
 * =========================================================================== */

const FAQ_ITEMS = [
  {
    q: 'What wallet do I need?',
    a: 'Any Avalanche-compatible wallet works — MetaMask, Core Wallet, Rabby, or Coinbase Wallet. Make sure you are on the Avalanche C-Chain network (Chain ID 43114).',
  },
  {
    q: 'How much AVAX do I need to get started?',
    a: 'You need at least 0.01 AVAX to mint your first warrior, plus a small amount for gas fees. For battling, the minimum stake is 0.005 AVAX for 1v1 or 0.01 AVAX for 3v3.',
  },
  {
    q: 'Can I lose my warrior in battle?',
    a: 'No. Your warrior NFT is never at risk. You only stake AVAX, not your warrior. Win or lose, your warrior stays in your wallet.',
  },
  {
    q: 'How is battle outcome determined?',
    a: 'Combat resolution considers each warrior\'s Attack, Defense, and Speed stats, plus element advantages. The attacker with an element advantage deals 1.5x damage. All results are recorded on-chain and are final.',
  },
  {
    q: 'What happens to my AVAX when I create a battle?',
    a: 'Your staked AVAX is held in the BattleEngine smart contract. If you win, you receive the combined stake minus the 2.5% platform fee. If you lose, your opponent claims the pot. You can also cancel an open battle to reclaim your stake.',
  },
  {
    q: 'How does the pull-payment pattern work?',
    a: 'Winnings are not sent automatically. After a battle resolves, the winner must call withdrawPayout() to claim their AVAX. This pull-payment design prevents reentrancy attacks and is considered a security best practice.',
  },
  {
    q: 'What is Warrior Fusion?',
    a: 'Fusion merges two warriors into a stronger one. The resulting warrior receives a +20% stat bonus on top of the averaged stats. It costs 0.005 AVAX per merge. One of the two input warriors is burned.',
  },
  {
    q: 'How does the Quest System work?',
    a: 'Send your warriors on quests across 8 elemental zones. Each zone has 4 quests per tier with increasing difficulty. Warriors earn XP on completion. The system uses on-chain tier progression — complete enough quests in a tier to advance.',
  },
  {
    q: 'Are the contracts audited?',
    a: 'The contracts have been internally reviewed and follow Solidity best practices including pull-payment patterns, reentrancy guards, and access controls. A formal third-party audit is planned for a future milestone.',
  },
  {
    q: 'Can I trade warriors?',
    a: 'Yes. The Marketplace supports fixed-price listings, timed auctions, and direct offers. You can also transfer warriors directly to any wallet address.',
  },
];

/* ===========================================================================
 * Page Component
 * =========================================================================== */

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('welcome');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  /* ---- Intersection Observer for active section tracking ---- */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    const ids = ALL_ITEMS.map((i) => i.id);
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        sectionRefs.current[id] = el;
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  /* ---- Hash-based navigation ---- */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && ALL_ITEMS.some((i) => i.id === hash)) {
      setActiveSection(hash);
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
    window.history.replaceState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  /* ---- Filtered nav groups based on search ---- */
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return NAV_GROUPS;
    const q = searchQuery.toLowerCase();
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [searchQuery]);

  /* ---- Sidebar content (shared between desktop and mobile) ---- */
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
          <input
            type="text"
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70 placeholder-white/20 focus:outline-none focus:border-frost-cyan/30 focus:ring-1 focus:ring-frost-cyan/20 transition-colors"
          />
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-6 space-y-5 scrollbar-thin">
        {filteredGroups.map((group) => (
          <div key={group.title}>
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.12em] mb-1.5 px-3 font-pixel">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className={cn(
                      'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] transition-all duration-200 text-left',
                      isActive
                        ? 'text-frost-cyan bg-frost-cyan/[0.08] border-l-2 border-frost-cyan font-semibold'
                        : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04] border-l-2 border-transparent',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="relative min-h-screen">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-20 left-4 z-50">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-frost-surface/90 backdrop-blur-md border border-white/[0.08] text-white/60 hover:text-white/90 transition-colors"
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          <span className="text-xs font-semibold">Docs</span>
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-frost-bg/95 backdrop-blur-xl border-r border-white/[0.06] pt-16 overflow-hidden">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-0 lg:gap-8">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-hidden rounded-xl bg-white/[0.02] border border-white/[0.06]">
              {sidebarContent}
            </div>
          </aside>

          {/* Center content */}
          <main className="flex-1 min-w-0 max-w-3xl mx-auto space-y-20 pt-4 lg:pt-0">

            {/* ============================================================
             * WELCOME
             * ============================================================ */}
            <DocSection id="welcome">
              <SectionHeader icon={BookOpen} title="Welcome to Frostbite" />
              <p className="text-white/60 text-base leading-relaxed">
                Frostbite is a fully on-chain GameFi PvP battle platform built on the
                Avalanche C-Chain. Mint unique warrior NFTs, stake AVAX in player-vs-player
                battles, complete quests, trade on the marketplace, and climb the leaderboard
                — all powered by verifiable smart contracts.
              </p>

              <div className="mt-6 p-5 rounded-xl border border-frost-cyan/20 bg-frost-cyan/[0.04]">
                <h4 className="text-sm font-semibold text-frost-cyan mb-3 font-pixel tracking-wider">Key Features</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { icon: Shield, text: 'Unique warrior NFTs with randomized stats' },
                    { icon: Flame, text: '8-element system with strategic advantages' },
                    { icon: Swords, text: '1v1 and 3v3 PvP battles with AVAX stakes' },
                    { icon: Map, text: '8 quest zones with tier-based progression' },
                    { icon: GitMerge, text: 'Warrior fusion for +20% stat bonus' },
                    { icon: ShoppingCart, text: 'Full marketplace: listings, auctions, offers' },
                    { icon: Trophy, text: 'On-chain leaderboard and rankings' },
                    { icon: Coins, text: 'Pull-payment security pattern for winnings' },
                  ].map(({ icon: FIcon, text }) => (
                    <div key={text} className="flex items-start gap-2.5">
                      <FIcon className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                      <span className="text-sm text-white/50">{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <StatCard label="Network" value="Avalanche C-Chain" sub={`Chain ID ${ACTIVE_CHAIN_ID}`} />
                <StatCard label="Mint Price" value={`${MINT_PRICE} AVAX`} sub="Per warrior NFT" />
                <StatCard label="Min Stake" value={`${MIN_BATTLE_STAKE} AVAX`} sub="Per 1v1 battle" />
                <StatCard label="Platform Fee" value={`${PLATFORM_FEE_PERCENT}%`} sub="On battle winnings" />
              </div>
            </DocSection>

            {/* ============================================================
             * GETTING STARTED
             * ============================================================ */}
            <DocSection id="getting-started">
              <SectionHeader icon={Zap} title="Getting Started" />
              <p className="text-white/60 text-sm mb-6 leading-relaxed">
                Get from zero to your first battle in under five minutes. Here is everything you need to know.
              </p>

              <div className="space-y-6">
                <Step number={1} title="Connect Your Wallet">
                  <p className="text-sm text-white/50">
                    Click the <InlineCode>Connect Wallet</InlineCode> button in the sidebar. Frostbite supports MetaMask,
                    Core Wallet, Rabby, Coinbase Wallet, and any WalletConnect-compatible wallet. Make sure you are on the
                    <span className="text-frost-cyan font-semibold"> Avalanche C-Chain</span> (Chain ID {ACTIVE_CHAIN_ID}).
                    If you are on the wrong network, the app will prompt you to switch automatically.
                  </p>
                </Step>

                <Step number={2} title="Fund Your Wallet with AVAX">
                  <p className="text-sm text-white/50">
                    You need AVAX for minting, battling, and gas fees. You can purchase AVAX on major exchanges
                    (Binance, Coinbase, KuCoin) and bridge to C-Chain, or use the Avalanche Bridge directly.
                    A minimum of <InlineCode>0.05 AVAX</InlineCode> is recommended to get started comfortably.
                  </p>
                </Step>

                <Step number={3} title="Mint Your First Warrior">
                  <p className="text-sm text-white/50">
                    Navigate to the <span className="text-frost-cyan font-semibold">Mint</span> page and click
                    mint. Each warrior costs <InlineCode>{MINT_PRICE} AVAX</InlineCode> and receives fully randomized
                    stats (Attack, Defense, Speed, Special Power) plus one of 8 elements. Use the Batch Minter to
                    mint multiple warriors in a single transaction.
                  </p>
                </Step>

                <Step number={4} title="Enter the Arena">
                  <p className="text-sm text-white/50">
                    Go to the <span className="text-frost-cyan font-semibold">Battle</span> page. Create a new battle
                    by selecting your warrior and staking AVAX, or join an existing open battle. The winner takes
                    the combined stake minus the {PLATFORM_FEE_PERCENT}% platform fee.
                  </p>
                </Step>

                <Step number={5} title="Explore the Platform">
                  <p className="text-sm text-white/50">
                    Trade warriors on the <span className="text-frost-cyan font-semibold">Marketplace</span>, send
                    them on <span className="text-frost-cyan font-semibold">Quests</span> to earn XP, or
                    <span className="text-frost-cyan font-semibold"> Merge</span> two warriors into a stronger one.
                    Check the <span className="text-frost-cyan font-semibold">Leaderboard</span> to see top players.
                  </p>
                </Step>
              </div>
            </DocSection>

            {/* ============================================================
             * WARRIORS & NFTs
             * ============================================================ */}
            <DocSection id="warriors">
              <SectionHeader icon={Shield} title="Warriors & NFTs" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Warriors are ERC-721 NFTs on the Avalanche C-Chain. Each warrior is minted with
                fully randomized combat attributes determined at mint time by on-chain randomness.
                No two warriors are alike.
              </p>

              {/* Stats breakdown */}
              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Warrior Stats</h3>
              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-white/80 mb-3">Core Attributes</h4>
                  <ul className="text-sm text-white/50 space-y-2">
                    <li><span className="text-red-400 font-mono">Attack (ATK)</span> — Offensive power, determines base damage dealt. Range: 1-255</li>
                    <li><span className="text-blue-400 font-mono">Defense (DEF)</span> — Damage mitigation, reduces incoming damage. Range: 1-255</li>
                    <li><span className="text-emerald-400 font-mono">Speed (SPD)</span> — Turn priority and dodge chance. Range: 1-255</li>
                    <li><span className="text-purple-400 font-mono">Special Power (SP)</span> — Unique elemental ability strength. Range: 1-255</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-white/80 mb-3">Derived Stats</h4>
                  <ul className="text-sm text-white/50 space-y-2">
                    <li><span className="text-yellow-400 font-mono">Power Score</span> — Overall combat rating calculated as: <InlineCode>ATK*3 + DEF*2 + SPD*2 + SP*5</InlineCode></li>
                    <li><span className="text-cyan-400 font-mono">Level</span> — Increases with XP earned from quests and battles</li>
                    <li><span className="text-amber-400 font-mono">Experience (XP)</span> — Accumulated from quest completions</li>
                    <li><span className="text-white/70 font-mono">Win/Loss Record</span> — Battle history tracked on-chain</li>
                  </ul>
                </div>
              </div>

              {/* Element system */}
              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Element System</h3>
              <p className="text-white/50 text-sm mb-4">
                Each warrior has one of 8 elements. Attackers with an element advantage deal
                <span className="text-frost-cyan font-semibold"> 1.5x damage</span>. Elements are
                organized in two advantage cycles.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {ELEMENT_DATA.map((el) => {
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
                  <div className="flex items-center gap-2 text-sm text-white/50 flex-wrap">
                    <span className="text-red-400">Fire</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-emerald-400">Wind</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-cyan-400">Ice</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-blue-400">Water</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-red-400">Fire</span>
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-amber-400 mb-2">Cycle B</h4>
                  <div className="flex items-center gap-2 text-sm text-white/50 flex-wrap">
                    <span className="text-amber-400">Earth</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-yellow-400">Thunder</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-purple-400">Shadow</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-yellow-200">Light</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    <span className="text-amber-400">Earth</span>
                  </div>
                </div>
              </div>
            </DocSection>

            {/* ============================================================
             * BATTLE SYSTEM (1v1)
             * ============================================================ */}
            <DocSection id="battle-system">
              <SectionHeader icon={Swords} title="Battle System (1v1)" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                The core gameplay loop. Stake AVAX, pick your warrior, and fight. All battles are
                resolved on-chain through the BattleEngine smart contract using deterministic combat
                formulas.
              </p>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">How It Works</h3>
              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <InfoCard icon={Plus} title="1. Create Battle" desc={`Stake at least ${MIN_BATTLE_STAKE} AVAX and select your warrior. Your battle appears in the open battles list.`} />
                <InfoCard icon={Swords} title="2. Opponent Joins" desc="Another player matches your stake amount and selects their warrior. Combat begins immediately." />
                <InfoCard icon={Trophy} title="3. Resolution" desc={`Winner gets the combined stake minus ${PLATFORM_FEE_PERCENT}% platform fee. Winnings are claimable via withdrawPayout().`} />
              </div>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Combat Resolution</h3>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] mb-6">
                <ul className="text-sm text-white/50 space-y-2">
                  <li className="flex items-start gap-2">
                    <Target className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <span><span className="text-white/70 font-semibold">Damage</span> — Calculated from the attacker&apos;s ATK minus a portion of the defender&apos;s DEF</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span><span className="text-white/70 font-semibold">Speed</span> — Higher SPD warrior attacks first, gaining a tactical advantage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Flame className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span><span className="text-white/70 font-semibold">Element Advantage</span> — 1.5x damage multiplier when attacker&apos;s element beats defender&apos;s</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                    <span><span className="text-white/70 font-semibold">Special Power</span> — Factors into the final damage calculation as an elemental modifier</span>
                  </li>
                </ul>
              </div>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Battle Rules</h3>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <ul className="text-sm text-white/50 space-y-1.5 list-disc pl-5">
                  <li>Minimum stake: <InlineCode>{MIN_BATTLE_STAKE} AVAX</InlineCode></li>
                  <li>No maximum stake — choose your risk level strategically</li>
                  <li>Creators can cancel open battles to reclaim their stake</li>
                  <li>All results are final and recorded on-chain</li>
                  <li>Pull-payment pattern: winners must call <InlineCode>withdrawPayout()</InlineCode> to claim</li>
                  <li>A warrior can only be in one active battle at a time</li>
                </ul>
              </div>
            </DocSection>

            {/* ============================================================
             * TEAM BATTLES (3v3)
             * ============================================================ */}
            <DocSection id="team-battles">
              <SectionHeader icon={Users} title="Team Battles (3v3)" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Assemble a team of three warriors and battle another player&apos;s team. Team battles
                offer higher stakes and deeper strategic possibilities through team composition and
                element coverage.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-white/80 mb-3">Team Composition</h4>
                  <ul className="text-sm text-white/50 space-y-2">
                    <li className="flex items-start gap-2">
                      <Users className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                      <span>Select exactly 3 warriors from your collection</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Layers className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                      <span>Warriors are matched 1v1 in three separate rounds</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Trophy className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                      <span>Best of 3 rounds determines the overall winner</span>
                    </li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-white/80 mb-3">Stakes & Rewards</h4>
                  <ul className="text-sm text-white/50 space-y-2">
                    <li className="flex items-start gap-2">
                      <Coins className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                      <span>Minimum stake: <InlineCode>{MIN_TEAM_BATTLE_STAKE} AVAX</InlineCode></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Coins className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                      <span>Same {PLATFORM_FEE_PERCENT}% fee on winnings</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                      <span>Resolved via TeamBattleEngine contract</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-frost-cyan/20 bg-frost-cyan/[0.04]">
                <h4 className="text-sm font-semibold text-frost-cyan mb-2">Strategy Tip</h4>
                <p className="text-sm text-white/50">
                  Diversify your team&apos;s elements to cover more matchups. A team with Fire, Water,
                  and Earth covers both advantage cycles. Watch the opponent&apos;s team composition
                  in open battles and counter-pick accordingly.
                </p>
              </div>
            </DocSection>

            {/* ============================================================
             * QUEST SYSTEM
             * ============================================================ */}
            <DocSection id="quest-system">
              <SectionHeader icon={Map} title="Quest System" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Send your warriors on quests across 8 elemental zones to earn XP and level up.
                The quest system uses an on-chain tier progression model — complete quests in
                your current tier to unlock harder, more rewarding challenges.
              </p>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">The 8 Elemental Zones</h3>
              <p className="text-white/50 text-sm mb-4">
                Each zone is themed around one of the 8 elements. Warriors matching the zone&apos;s
                element may have a natural affinity advantage during quest resolution.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {[
                  { name: 'Ember Peaks', element: 'Fire', icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10' },
                  { name: 'Abyssal Depths', element: 'Water', icon: Droplets, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { name: 'Gale Reaches', element: 'Wind', icon: Wind, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  { name: 'Frost Hollows', element: 'Ice', icon: Snowflake, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                  { name: 'Stone Bastion', element: 'Earth', icon: Mountain, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                  { name: 'Storm Citadel', element: 'Thunder', icon: CloudLightning, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                  { name: 'Void Sanctum', element: 'Shadow', icon: Moon, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                  { name: 'Radiant Spire', element: 'Light', icon: Sun, color: 'text-yellow-200', bg: 'bg-yellow-200/10' },
                ].map((zone) => {
                  const ZIcon = zone.icon;
                  return (
                    <div key={zone.name} className={cn('p-3 rounded-xl border border-white/[0.06]', zone.bg)}>
                      <ZIcon className={cn('h-5 w-5 mb-1', zone.color)} />
                      <p className={cn('text-xs font-semibold', zone.color)}>{zone.name}</p>
                      <p className="text-[10px] text-white/30">{zone.element} Zone</p>
                    </div>
                  );
                })}
              </div>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Tier Progression</h3>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] mb-6">
                <ul className="text-sm text-white/50 space-y-2">
                  <li className="flex items-start gap-2">
                    <Layers className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                    <span>Each tier presents 2 quest slots with deterministically generated quests</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ArrowRight className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                    <span>Complete enough quests in a tier to advance to the next one</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Star className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                    <span>Higher tiers have harder quests but offer more XP rewards</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                    <span>Quest duration varies by difficulty: Easy, Medium, Hard, and Boss</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <FileCode className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                    <span>Tier progression is tracked on-chain via the QuestEngine contract</span>
                  </li>
                </ul>
              </div>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Difficulty Levels</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { name: 'Easy', color: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-500/10', desc: 'Low risk, moderate XP' },
                  { name: 'Medium', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10', desc: 'Balanced challenge' },
                  { name: 'Hard', color: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10', desc: 'High risk, high XP' },
                  { name: 'Boss', color: 'text-fuchsia-400', border: 'border-fuchsia-500/30', bg: 'bg-fuchsia-500/10', desc: 'Elite challenge' },
                ].map((d) => (
                  <div key={d.name} className={cn('p-3 rounded-xl border', d.border, d.bg)}>
                    <p className={cn('text-sm font-semibold', d.color)}>{d.name}</p>
                    <p className="text-[10px] text-white/30 mt-1">{d.desc}</p>
                  </div>
                ))}
              </div>
            </DocSection>

            {/* ============================================================
             * WARRIOR FUSION
             * ============================================================ */}
            <DocSection id="warrior-fusion">
              <SectionHeader icon={GitMerge} title="Warrior Fusion" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Combine two warriors into one stronger warrior. Fusion averages the stats of both
                input warriors, then applies a <span className="text-frost-cyan font-semibold">+20% bonus</span> to
                all resulting stats. One warrior is consumed (burned) in the process.
              </p>

              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <InfoCard icon={Shield} title="Select Two Warriors" desc="Pick any two warriors from your collection. Both must be owned by you and not locked in an active battle or quest." />
                <InfoCard icon={GitMerge} title="Fuse" desc={`Pay ${MERGE_PRICE} AVAX. Stats are averaged and boosted by +20%. The second warrior is burned.`} />
                <InfoCard icon={Sparkles} title="Stronger Warrior" desc="The surviving warrior receives enhanced stats. Element is inherited from the primary (first) warrior." />
              </div>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Fusion Formula</h3>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <CodeBlock language="formula" code={`New ATK = floor((Warrior_A.ATK + Warrior_B.ATK) / 2 * 1.20)
New DEF = floor((Warrior_A.DEF + Warrior_B.DEF) / 2 * 1.20)
New SPD = floor((Warrior_A.SPD + Warrior_B.SPD) / 2 * 1.20)
New SP  = floor((Warrior_A.SP  + Warrior_B.SP)  / 2 * 1.20)

Cost: ${MERGE_PRICE} AVAX per fusion
Result: Warrior A keeps enhanced stats, Warrior B is burned`} />
              </div>

              <div className="mt-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
                <h4 className="text-sm font-semibold text-amber-400 mb-2">Important Notes</h4>
                <ul className="text-sm text-white/50 space-y-1.5 list-disc pl-5">
                  <li>Fusion is irreversible — the burned warrior is gone permanently</li>
                  <li>The element of the first (primary) warrior is kept</li>
                  <li>Level, XP, and battle record of the primary warrior are preserved</li>
                  <li>Warriors in active battles or quests cannot be fused</li>
                </ul>
              </div>
            </DocSection>

            {/* ============================================================
             * MARKETPLACE
             * ============================================================ */}
            <DocSection id="marketplace">
              <SectionHeader icon={ShoppingCart} title="Marketplace" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                The Frostbite Marketplace is a fully on-chain NFT marketplace where players can buy,
                sell, and trade warrior NFTs. All transactions go through the Marketplace smart contract
                on Avalanche C-Chain.
              </p>

              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <Tag className="h-5 w-5 text-frost-cyan mb-2" />
                  <h4 className="text-sm font-semibold text-white/80 mb-1">Fixed Price Listings</h4>
                  <p className="text-xs text-white/40">Set a price in AVAX and list your warrior. Anyone can buy it instantly at the listed price.</p>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <Gavel className="h-5 w-5 text-frost-cyan mb-2" />
                  <h4 className="text-sm font-semibold text-white/80 mb-1">Auctions</h4>
                  <p className="text-xs text-white/40">Start a timed auction with a starting price. Highest bidder wins when the timer expires.</p>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <Heart className="h-5 w-5 text-frost-cyan mb-2" />
                  <h4 className="text-sm font-semibold text-white/80 mb-1">Offers</h4>
                  <p className="text-xs text-white/40">Make an offer on any warrior, even if it is not listed. The owner can accept or decline.</p>
                </div>
              </div>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Marketplace Rules</h3>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <ul className="text-sm text-white/50 space-y-1.5 list-disc pl-5">
                  <li>Warriors in active battles or quests cannot be listed</li>
                  <li>Sellers can cancel listings at any time before purchase</li>
                  <li>Auction bids are locked until outbid or auction ends</li>
                  <li>Offers lock the offered AVAX until accepted, declined, or withdrawn</li>
                  <li>All marketplace transactions are recorded on-chain</li>
                </ul>
              </div>
            </DocSection>

            {/* ============================================================
             * AVAX TOKENOMICS
             * ============================================================ */}
            <DocSection id="tokenomics">
              <SectionHeader icon={Coins} title="AVAX Tokenomics" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Frostbite operates entirely on AVAX — the native token of the Avalanche network.
                There are no additional tokens required to play. All fees, stakes, and rewards are
                denominated in AVAX.
              </p>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">Price Structure</h3>
              <div className="overflow-x-auto mb-6">
                <table className="frost-table w-full">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Cost</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-sm text-white/70 font-semibold">Mint Warrior</td>
                      <td className="text-sm font-mono text-frost-cyan">{MINT_PRICE} AVAX</td>
                      <td className="text-sm text-white/40">Per warrior. Batch minting available.</td>
                    </tr>
                    <tr>
                      <td className="text-sm text-white/70 font-semibold">Warrior Fusion</td>
                      <td className="text-sm font-mono text-frost-cyan">{MERGE_PRICE} AVAX</td>
                      <td className="text-sm text-white/40">Combines two warriors into one.</td>
                    </tr>
                    <tr>
                      <td className="text-sm text-white/70 font-semibold">1v1 Battle (min)</td>
                      <td className="text-sm font-mono text-frost-cyan">{MIN_BATTLE_STAKE} AVAX</td>
                      <td className="text-sm text-white/40">Minimum stake per battle.</td>
                    </tr>
                    <tr>
                      <td className="text-sm text-white/70 font-semibold">3v3 Battle (min)</td>
                      <td className="text-sm font-mono text-frost-cyan">{MIN_TEAM_BATTLE_STAKE} AVAX</td>
                      <td className="text-sm text-white/40">Minimum stake for team battles.</td>
                    </tr>
                    <tr>
                      <td className="text-sm text-white/70 font-semibold">Platform Fee</td>
                      <td className="text-sm font-mono text-frost-cyan">{PLATFORM_FEE_PERCENT}%</td>
                      <td className="text-sm text-white/40">Deducted from winner&apos;s payout.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-frost-cyan text-sm font-semibold mb-3">FSB Token</h3>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <p className="text-sm text-white/50">
                  FrostbiteToken (FSB) is the platform&apos;s native reward token. It is distributed
                  through the RewardVault contract for leaderboard placements, tournament prizes,
                  and special events. FSB is an ERC-20 token on Avalanche C-Chain.
                </p>
              </div>
            </DocSection>

            {/* ============================================================
             * REWARDS & FEES
             * ============================================================ */}
            <DocSection id="rewards">
              <SectionHeader icon={Trophy} title="Rewards & Fees" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Frostbite uses a transparent fee structure. All fees are enforced at the smart
                contract level — no hidden charges.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-white/80 mb-3">Battle Rewards</h4>
                  <ul className="text-sm text-white/50 space-y-2">
                    <li className="flex items-start gap-2">
                      <Coins className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                      <span>Winner receives: <InlineCode>(Stake A + Stake B) * 0.975</InlineCode></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Activity className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                      <span>Platform fee: <InlineCode>{PLATFORM_FEE_PERCENT}%</InlineCode> of total pot</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Wallet className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Pull-payment: call <InlineCode>withdrawPayout()</InlineCode> to claim</span>
                    </li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <h4 className="text-sm font-semibold text-white/80 mb-3">Quest Rewards</h4>
                  <ul className="text-sm text-white/50 space-y-2">
                    <li className="flex items-start gap-2">
                      <Star className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                      <span>XP awarded on quest completion (win or lose)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 text-frost-cyan shrink-0 mt-0.5" />
                      <span>Successful quests award significantly more XP</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Layers className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>Higher tiers = harder quests with better rewards</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-frost-cyan/20 bg-frost-cyan/[0.04]">
                <h4 className="text-sm font-semibold text-frost-cyan mb-2">Pull-Payment Security</h4>
                <p className="text-sm text-white/50">
                  Frostbite uses the pull-payment pattern for all payouts. Instead of automatically sending
                  AVAX to winners, winnings are recorded in a <InlineCode>pendingPayouts</InlineCode> mapping.
                  Winners must call <InlineCode>withdrawPayout()</InlineCode> to transfer funds to their wallet.
                  This prevents reentrancy attacks and is a widely adopted security best practice in Solidity.
                </p>
              </div>
            </DocSection>

            {/* ============================================================
             * CONTRACT ADDRESSES
             * ============================================================ */}
            <DocSection id="contracts">
              <SectionHeader icon={FileCode} title="Contract Addresses" />
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
            </DocSection>

            {/* ============================================================
             * FAQ
             * ============================================================ */}
            <DocSection id="faq">
              <SectionHeader icon={HelpCircle} title="Frequently Asked Questions" />
              <div className="space-y-3">
                {FAQ_ITEMS.map((item, idx) => (
                  <FaqItem key={idx} question={item.q} answer={item.a} />
                ))}
              </div>
            </DocSection>

            {/* ============================================================
             * LINKS & SOCIALS
             * ============================================================ */}
            <DocSection id="links">
              <SectionHeader icon={ExternalLink} title="Links & Socials" />
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Stay connected with the Frostbite community and follow the latest updates.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <a
                  href="https://frostbite.pro"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-frost-cyan/30 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/80 group-hover:text-frost-cyan transition-colors">Frostbite Website</p>
                      <p className="text-xs text-white/30">frostbite.pro</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-white/20 group-hover:text-frost-cyan/50 transition-colors" />
                  </div>
                </a>
                <a
                  href="https://x.com/frostbiteprol1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-frost-cyan/30 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/80 group-hover:text-frost-cyan transition-colors">X (Twitter)</p>
                      <p className="text-xs text-white/30">@frostbiteprol1</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-white/20 group-hover:text-frost-cyan/50 transition-colors" />
                  </div>
                </a>
                <a
                  href={`${EXPLORER_URL}/address/${CONTRACTS[0].address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-frost-cyan/30 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/80 group-hover:text-frost-cyan transition-colors">Snowtrace Explorer</p>
                      <p className="text-xs text-white/30">View contracts on-chain</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-white/20 group-hover:text-frost-cyan/50 transition-colors" />
                  </div>
                </a>
                <a
                  href="https://github.com/wenavax/avax-arena"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-frost-cyan/30 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/80 group-hover:text-frost-cyan transition-colors">GitHub</p>
                      <p className="text-xs text-white/30">wenavax/avax-arena</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-white/20 group-hover:text-frost-cyan/50 transition-colors" />
                  </div>
                </a>
              </div>
            </DocSection>

            {/* Bottom spacer */}
            <div className="h-20" />
          </main>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================================
 * Sub-components
 * =========================================================================== */

function DocSection({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      {children}
    </section>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-frost-cyan/10">
        <Icon className="h-5 w-5 text-frost-cyan" />
      </div>
      <h2 className="font-display text-xl font-bold gradient-text">{title}</h2>
    </div>
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

function InfoCard({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <Icon className="h-5 w-5 text-frost-cyan mb-2" />
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
      <div className="flex-1 space-y-2">
        <h4 className="text-sm font-semibold text-white/80">{title}</h4>
        {children}
      </div>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-xs font-mono text-frost-cyan/80">
      {children}
    </code>
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

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-white/80">{question}</span>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-white/30 shrink-0 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 -mt-1">
          <p className="text-sm text-white/50 leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}
