'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, ExternalLink, Trophy, Swords, TrendingUp,
  Zap, Shield, Target, BarChart3, Sparkles, Loader2,
  ChevronDown, SlidersHorizontal, ArrowUpDown, X,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ELEMENTS, CONTRACT_ADDRESSES, EXPLORER_URL } from '@/lib/constants';
import { FROSTBITE_WARRIOR_ABI, BATTLE_ENGINE_ABI } from '@/lib/contracts';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface Warrior {
  tokenId: number;
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

interface Battle {
  id: number;
  player1: string;
  player2: string;
  nft1: number;
  nft2: number;
  stake: bigint;
  winner: string;
  resolved: boolean;
  createdAt: number;
  resolvedAt: number;
}

interface ProfileStats {
  totalBattles: number;
  wins: number;
  winRate: number;
  avaxEarned: number;
  warriorCount: number;
  totalXP: number;
  avgLevel: number;
}

type ProfileTab = 'collection' | 'activity';
type SortOption = 'power-desc' | 'level-desc' | 'token-asc' | 'attack-desc' | 'defense-desc' | 'speed-desc';

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getElement(id: number) {
  return ELEMENTS[id] ?? ELEMENTS[0];
}

function formatDate(timestamp: number): string {
  if (timestamp === 0) return '—';
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function parseWarriorData(raw: Record<string, unknown>, tokenId: number): Warrior {
  return {
    tokenId,
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

function parseBattleData(raw: Record<string, unknown>): Battle {
  return {
    id: Number(raw.id ?? raw[0] ?? 0),
    player1: String(raw.player1 ?? raw[1] ?? ''),
    player2: String(raw.player2 ?? raw[2] ?? ''),
    nft1: Number(raw.nft1 ?? raw[3] ?? 0),
    nft2: Number(raw.nft2 ?? raw[4] ?? 0),
    stake: BigInt(String(raw.stake ?? raw[5] ?? 0)),
    winner: String(raw.winner ?? raw[6] ?? ''),
    resolved: Boolean(raw.resolved ?? raw[7] ?? false),
    createdAt: Number(raw.createdAt ?? raw[8] ?? 0),
    resolvedAt: Number(raw.resolvedAt ?? raw[9] ?? 0),
  };
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'power-desc', label: 'Power: High → Low' },
  { value: 'level-desc', label: 'Level: High → Low' },
  { value: 'token-asc', label: 'Token ID' },
  { value: 'attack-desc', label: 'Attack: High → Low' },
  { value: 'defense-desc', label: 'Defense: High → Low' },
  { value: 'speed-desc', label: 'Speed: High → Low' },
];

const PROFILE_TABS: { id: ProfileTab; label: string; icon: typeof Sparkles }[] = [
  { id: 'collection', label: 'Collection', icon: Sparkles },
  { id: 'activity', label: 'Activity', icon: Swords },
];

/* ---------------------------------------------------------------------------
 * WarriorImage Component
 * ------------------------------------------------------------------------- */

function WarriorImage({ tokenId, element, size }: { tokenId: number; element: number; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/metadata/${tokenId}/image?element=${element}`}
      alt={`Warrior #${tokenId}`}
      width={size}
      height={size}
      className="w-full h-full object-cover"
      loading="lazy"
    />
  );
}

/* ---------------------------------------------------------------------------
 * Loading Spinner
 * ------------------------------------------------------------------------- */

function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Loader2 className="w-6 h-6 text-frost-cyan animate-spin" />
      {label && <span className="text-xs text-white/40">{label}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Empty State
 * ------------------------------------------------------------------------- */

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Icon className="w-10 h-10 text-white/15" />
      <span className="text-sm text-white/40">{message}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: FilterSection (adapted from marketplace)
 * ------------------------------------------------------------------------- */

function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3 px-4 text-sm font-medium text-white/70 hover:text-white transition-colors"
      >
        <span className="font-pixel text-[10px] uppercase tracking-wider">{title}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-4 pb-4"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: Profile Filter Sidebar
 * ------------------------------------------------------------------------- */

function ProfileFilterSidebar({
  elementFilter,
  setElementFilter,
  levelMin,
  setLevelMin,
  levelMax,
  setLevelMax,
  powerMin,
  setPowerMin,
  powerMax,
  setPowerMax,
  onClearAll,
}: {
  elementFilter: number | null;
  setElementFilter: (e: number | null) => void;
  levelMin: string;
  setLevelMin: (v: string) => void;
  levelMax: string;
  setLevelMax: (v: string) => void;
  powerMin: string;
  setPowerMin: (v: string) => void;
  powerMax: string;
  setPowerMax: (v: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="sticky top-24 rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm overflow-hidden max-h-[calc(100vh-120px)] overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="font-pixel text-[10px] text-white/60 uppercase tracking-wider">Filters</span>
        <button onClick={onClearAll} className="text-[10px] text-frost-cyan hover:underline">
          Clear All
        </button>
      </div>

      {/* Element */}
      <FilterSection title="Element">
        <div className="space-y-1">
          <button
            onClick={() => setElementFilter(null)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all',
              elementFilter === null
                ? 'bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/20'
                : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04] border border-transparent'
            )}
          >
            <span className="w-5 text-center">✦</span>
            All Elements
          </button>
          {ELEMENTS.map((el) => (
            <button
              key={el.id}
              onClick={() => setElementFilter(el.id === elementFilter ? null : el.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all',
                elementFilter === el.id
                  ? 'bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/20'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04] border border-transparent'
              )}
            >
              <span className="w-5 text-center">{el.emoji}</span>
              {el.name}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Level Range */}
      <FilterSection title="Level" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            placeholder="Min"
            value={levelMin}
            onChange={(e) => setLevelMin(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/40"
          />
          <span className="text-white/30 text-xs">—</span>
          <input
            type="number"
            min="1"
            placeholder="Max"
            value={levelMax}
            onChange={(e) => setLevelMax(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/40"
          />
        </div>
      </FilterSection>

      {/* Power Score */}
      <FilterSection title="Power Score" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            value={powerMin}
            onChange={(e) => setPowerMin(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/40"
          />
          <span className="text-white/30 text-xs">—</span>
          <input
            type="number"
            min="0"
            placeholder="Max"
            value={powerMax}
            onChange={(e) => setPowerMax(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/40"
          />
        </div>
      </FilterSection>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: Sort Dropdown (adapted from marketplace)
 * ------------------------------------------------------------------------- */

function ProfileSortDropdown({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  const [open, setOpen] = useState(false);
  const selected = SORT_OPTIONS.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-pixel bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:border-white/20 transition-all"
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{selected?.label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-52 rounded-lg bg-frost-surface border border-white/[0.08] shadow-xl z-20 py-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full text-left px-4 py-2 text-xs font-pixel transition-colors',
                  opt.value === value ? 'text-frost-cyan bg-frost-cyan/5' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: Warrior NFT Card (adapted from marketplace NFTListingCard)
 * ------------------------------------------------------------------------- */

function WarriorNFTCard({ warrior }: { warrior: Warrior }) {
  const el = getElement(warrior.element);
  const maxStat = Math.max(warrior.attack, warrior.defense, warrior.speed, 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm hover:border-frost-cyan/30 transition-all duration-300 overflow-hidden hover:shadow-glow-cyan hover:-translate-y-1"
    >
      {/* Image */}
      <div className="relative aspect-square bg-gradient-to-br from-frost-bg to-frost-surface overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/metadata/${warrior.tokenId}/image?element=${warrior.element}`}
          alt={`Warrior #${warrior.tokenId}`}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {/* Badges */}
        <div className="absolute top-2.5 left-2.5">
          <span className="text-[10px] px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 font-pixel">
            {el.emoji} {el.name}
          </span>
        </div>
        <div className="absolute top-2.5 right-2.5">
          <span className="text-[10px] px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 font-pixel text-white/80">
            Lv.{warrior.level}
          </span>
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
            <span className="text-[10px] text-white/80 font-pixel">Power {warrior.powerScore}</span>
            <span className="text-[10px] text-white/60 font-pixel">{warrior.battleWins}W / {warrior.battleLosses}L</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5">
        <h3 className="font-pixel text-xs text-white truncate">
          Warrior #{warrior.tokenId}
        </h3>

        {/* Stat bars */}
        <div className="mt-2.5 space-y-1.5">
          {[
            { label: 'ATK', value: warrior.attack, color: 'bg-red-400' },
            { label: 'DEF', value: warrior.defense, color: 'bg-blue-400' },
            { label: 'SPD', value: warrior.speed, color: 'bg-green-400' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-[9px] text-white/40 w-6 font-pixel">{s.label}</span>
              <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', s.color)}
                  style={{ width: `${(s.value / maxStat) * 100}%` }}
                />
              </div>
              <span className="text-[9px] text-white/50 font-mono w-6 text-right">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Power Score */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
          <div>
            <div className="text-[9px] text-white/40 uppercase tracking-wider font-pixel">Power</div>
            <div className="font-pixel text-sm text-frost-cyan font-bold">{warrior.powerScore}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-white/40 uppercase tracking-wider font-pixel">Record</div>
            <div className="font-pixel text-xs text-white/70">
              <span className="text-frost-green">{warrior.battleWins}W</span>
              {' / '}
              <span className="text-frost-red">{warrior.battleLosses}L</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: Profile Banner
 * ------------------------------------------------------------------------- */

function ProfileBanner({
  address,
  stats,
  warriors,
  loadingBattles,
  copied,
  onCopy,
}: {
  address: string;
  stats: ProfileStats;
  warriors: Warrior[];
  loadingBattles: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  // Pick strongest warrior's element for banner gradient
  const strongest = warriors.length > 0
    ? warriors.reduce((a, b) => (a.powerScore >= b.powerScore ? a : b))
    : null;
  const bannerEl = strongest ? getElement(strongest.element) : null;
  const maxPower = strongest?.powerScore ?? 0;

  const statItems = [
    { icon: Target, label: 'Warriors', value: stats.warriorCount, color: 'text-frost-pink' },
    { icon: Swords, label: 'Battles', value: stats.totalBattles, color: 'text-frost-cyan' },
    { icon: TrendingUp, label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-frost-purple' },
    { icon: Zap, label: 'AVAX Earned', value: stats.avaxEarned.toFixed(3), color: 'text-frost-gold' },
    { icon: Sparkles, label: 'Top Power', value: maxPower, color: 'text-frost-cyan' },
    { icon: BarChart3, label: 'Total XP', value: stats.totalXP.toLocaleString(), color: 'text-frost-green' },
    { icon: Shield, label: 'Avg Level', value: stats.avgLevel, color: 'text-frost-orange' },
  ];

  return (
    <div className="relative mb-8 rounded-2xl overflow-hidden">
      {/* Gradient Banner */}
      <div
        className={cn(
          'h-32 sm:h-40 w-full bg-gradient-to-r',
          bannerEl ? bannerEl.color : 'from-frost-cyan/40 to-frost-purple/40'
        )}
        style={{ opacity: 0.3 }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-frost-bg via-frost-bg/60 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gradient-to-br from-frost-cyan via-frost-purple to-frost-pink p-[2px] flex-shrink-0">
            <div className="w-full h-full rounded-[10px] bg-frost-surface flex items-center justify-center">
              <span className="text-xl sm:text-2xl font-display font-bold gradient-text">
                {address.slice(2, 4).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Address + Actions */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-frost-cyan text-sm sm:text-base">{shortenAddr(address)}</span>
              <button
                onClick={onCopy}
                className="p-1 rounded-md hover:bg-white/10 transition-colors"
              >
                <Copy className={cn('w-3.5 h-3.5', copied ? 'text-frost-green' : 'text-white/40')} />
              </button>
              <a
                href={`${EXPLORER_URL}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded-md hover:bg-white/10 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-white/40 hover:text-frost-cyan" />
              </a>
            </div>

            {/* Stat chips */}
            {loadingBattles ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-white/30 animate-spin" />
                <span className="text-xs text-white/30">Loading stats...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {statItems.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] backdrop-blur-sm"
                  >
                    <s.icon className={cn('w-3 h-3', s.color)} />
                    <span className="font-pixel text-[10px] text-white/80">{s.value}</span>
                    <span className="text-[9px] text-white/40 hidden sm:inline">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: Profile Tabs
 * ------------------------------------------------------------------------- */

function ProfileTabs({
  activeTab,
  onTabChange,
  warriorCount,
  battleCount,
}: {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  warriorCount: number;
  battleCount: number;
}) {
  const counts: Record<ProfileTab, number | null> = {
    collection: warriorCount,
    activity: battleCount,
  };

  return (
    <div className="border-b border-white/[0.06] mb-6">
      <div className="flex items-center gap-1">
        {PROFILE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-xs font-pixel uppercase tracking-wider border-b-2 transition-all',
              activeTab === tab.id
                ? 'text-frost-cyan border-frost-cyan'
                : 'text-white/40 border-transparent hover:text-white/60 hover:border-white/10'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {counts[tab.id] != null && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-[9px] font-mono',
                activeTab === tab.id ? 'bg-frost-cyan/15 text-frost-cyan' : 'bg-white/[0.06] text-white/30'
              )}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Constants
 * ------------------------------------------------------------------------- */

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/* ---------------------------------------------------------------------------
 * Profile Page
 * ------------------------------------------------------------------------- */

export default function ProfilePage() {
  const params = useParams();
  const rawAddress = (params.address as string) || '';
  const isValidAddress = ETH_ADDRESS_REGEX.test(rawAddress);
  const address = isValidAddress ? rawAddress : '0x0000000000000000000000000000000000000000';
  const [copied, setCopied] = useState(false);

  const publicClient = usePublicClient();

  // Data state
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [battleHistory, setBattleHistory] = useState<Battle[]>([]);
  const [stats, setStats] = useState<ProfileStats>({
    totalBattles: 0,
    wins: 0,
    winRate: 0,
    avaxEarned: 0,
    warriorCount: 0,
    totalXP: 0,
    avgLevel: 0,
  });

  // Loading state
  const [loadingWarriors, setLoadingWarriors] = useState(true);
  const [loadingBattles, setLoadingBattles] = useState(true);
  // UI state
  const [activeTab, setActiveTab] = useState<ProfileTab>('collection');
  const [elementFilter, setElementFilter] = useState<number | null>(null);
  const [levelMin, setLevelMin] = useState('');
  const [levelMax, setLevelMax] = useState('');
  const [powerMin, setPowerMin] = useState('');
  const [powerMax, setPowerMax] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('power-desc');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Warrior element distribution (computed)
  const elementDistribution = ELEMENTS.map((el, i) => ({
    name: el.name,
    emoji: el.emoji,
    count: warriors.filter((w) => w.element === i).length,
    color: `bg-gradient-to-r ${el.color}`,
  }));
  const maxCount = Math.max(...elementDistribution.map((g) => g.count), 1);

  /* -------------------------------------------------------------------------
   * Data Fetching
   * ----------------------------------------------------------------------- */

  // Fetch warriors
  useEffect(() => {
    if (!publicClient || !isValidAddress) {
      setLoadingWarriors(false);
      return;
    }
    let cancelled = false;

    async function fetchWarriors() {
      setLoadingWarriors(true);
      try {
        const ids = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarriorsByOwner',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (cancelled) return;
        if (!ids || ids.length === 0) {
          setWarriors([]);
          setLoadingWarriors(false);
          return;
        }

        const details = await Promise.all(
          ids.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
              abi: FROSTBITE_WARRIOR_ABI,
              functionName: 'getWarrior',
              args: [id],
            })
          )
        );

        if (cancelled) return;
        setWarriors(
          details
            .map((raw, i) => parseWarriorData(raw as Record<string, unknown>, Number(ids[i])))
            .sort((a, b) => b.powerScore - a.powerScore)
        );
      } catch (err) {
        console.error('[profile] Failed to fetch warriors:', err);
        if (!cancelled) setWarriors([]);
      } finally {
        if (!cancelled) setLoadingWarriors(false);
      }
    }

    fetchWarriors();
    return () => { cancelled = true; };
  }, [publicClient, address, isValidAddress]);

  // Fetch battle history
  useEffect(() => {
    if (!publicClient || !isValidAddress) {
      setLoadingBattles(false);
      return;
    }
    let cancelled = false;

    async function fetchBattles() {
      setLoadingBattles(true);
      try {
        const battleIds = await publicClient!.readContract({
          address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
          abi: BATTLE_ENGINE_ABI,
          functionName: 'getBattleHistory',
          args: [address as `0x${string}`],
        }) as bigint[];

        if (cancelled) return;
        if (!battleIds || battleIds.length === 0) {
          setBattleHistory([]);
          setLoadingBattles(false);
          return;
        }

        // Get last 20 battles (most recent)
        const recentIds = battleIds.slice(-20).reverse();

        const battleDetails = await Promise.all(
          recentIds.map((id) =>
            publicClient!.readContract({
              address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
              abi: BATTLE_ENGINE_ABI,
              functionName: 'getBattle',
              args: [id],
            })
          )
        );

        if (cancelled) return;

        const parsed = battleDetails.map((raw) =>
          parseBattleData(raw as Record<string, unknown>)
        );

        setBattleHistory(parsed);

        // Compute stats from ALL battle IDs
        const allBattleDetails = battleIds.length <= 20
          ? battleDetails
          : await Promise.all(
              battleIds.map((id) =>
                publicClient!.readContract({
                  address: CONTRACT_ADDRESSES.battleEngine as `0x${string}`,
                  abi: BATTLE_ENGINE_ABI,
                  functionName: 'getBattle',
                  args: [id],
                })
              )
            );

        if (cancelled) return;

        const allBattles = allBattleDetails.map((raw) =>
          parseBattleData(raw as Record<string, unknown>)
        );

        const totalBattles = allBattles.length;
        const wins = allBattles.filter(
          (b) => b.winner.toLowerCase() === address.toLowerCase()
        ).length;
        const winRate = totalBattles > 0 ? (wins / totalBattles) * 100 : 0;

        let avaxEarned = BigInt(0);
        for (const b of allBattles) {
          if (b.winner.toLowerCase() === address.toLowerCase()) {
            avaxEarned += b.stake;
          }
        }

        setStats((prev) => ({
          ...prev,
          totalBattles,
          wins,
          winRate: Math.round(winRate * 10) / 10,
          avaxEarned: parseFloat(formatEther(avaxEarned)),
        }));
      } catch (err) {
        console.error('[profile] Failed to fetch battle history:', err);
        if (!cancelled) setBattleHistory([]);
      } finally {
        if (!cancelled) setLoadingBattles(false);
      }
    }

    fetchBattles();
    return () => { cancelled = true; };
  }, [publicClient, address, isValidAddress]);

  // Update warrior-derived stats when warriors change
  useEffect(() => {
    const totalXP = warriors.reduce((sum, w) => sum + w.experience, 0);
    const avgLevel = warriors.length > 0 ? Math.round(warriors.reduce((sum, w) => sum + w.level, 0) / warriors.length * 10) / 10 : 0;
    setStats((prev) => ({ ...prev, warriorCount: warriors.length, totalXP, avgLevel }));
  }, [warriors]);

  /* -------------------------------------------------------------------------
   * Handlers
   * ----------------------------------------------------------------------- */

  const handleCopy = () => {
    if (!isValidAddress) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearFilters = () => {
    setElementFilter(null);
    setLevelMin('');
    setLevelMax('');
    setPowerMin('');
    setPowerMax('');
  };

  /* -------------------------------------------------------------------------
   * Filtered + sorted warriors
   * ----------------------------------------------------------------------- */

  const filteredWarriors = useMemo(() => {
    let result = [...warriors];

    // Element filter
    if (elementFilter !== null) {
      result = result.filter((w) => w.element === elementFilter);
    }

    // Level filter
    if (levelMin) {
      const min = parseInt(levelMin, 10);
      if (!isNaN(min)) result = result.filter((w) => w.level >= min);
    }
    if (levelMax) {
      const max = parseInt(levelMax, 10);
      if (!isNaN(max)) result = result.filter((w) => w.level <= max);
    }

    // Power filter
    if (powerMin) {
      const min = parseInt(powerMin, 10);
      if (!isNaN(min)) result = result.filter((w) => w.powerScore >= min);
    }
    if (powerMax) {
      const max = parseInt(powerMax, 10);
      if (!isNaN(max)) result = result.filter((w) => w.powerScore <= max);
    }

    // Sort
    switch (sortBy) {
      case 'power-desc':
        result.sort((a, b) => b.powerScore - a.powerScore);
        break;
      case 'level-desc':
        result.sort((a, b) => b.level - a.level);
        break;
      case 'token-asc':
        result.sort((a, b) => a.tokenId - b.tokenId);
        break;
      case 'attack-desc':
        result.sort((a, b) => b.attack - a.attack);
        break;
      case 'defense-desc':
        result.sort((a, b) => b.defense - a.defense);
        break;
      case 'speed-desc':
        result.sort((a, b) => b.speed - a.speed);
        break;
    }

    return result;
  }, [warriors, elementFilter, levelMin, levelMax, powerMin, powerMax, sortBy]);

  /* -------------------------------------------------------------------------
   * Render
   * ----------------------------------------------------------------------- */

  if (!isValidAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-12 text-center max-w-md">
          <Shield className="w-12 h-12 text-frost-red mx-auto mb-4" />
          <h2 className="font-display text-xl font-bold text-white mb-2">Invalid Address</h2>
          <p className="text-white/40 text-sm">The provided wallet address is not valid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-6 pb-12">
        {/* Banner + Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ProfileBanner
            address={address}
            stats={stats}
            warriors={warriors}
            loadingBattles={loadingBattles}
            copied={copied}
            onCopy={handleCopy}
          />
        </motion.div>

        {/* Tab Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <ProfileTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            warriorCount={warriors.length}
            battleCount={battleHistory.length}
          />
        </motion.div>

        {/* ===== COLLECTION TAB ===== */}
        {activeTab === 'collection' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            {loadingWarriors ? (
              <LoadingSpinner label="Loading warriors..." />
            ) : warriors.length === 0 ? (
              <EmptyState icon={Shield} message="No warriors found" />
            ) : (
              <div className="flex gap-6">
                {/* Desktop Sidebar */}
                <div className="hidden lg:block w-[240px] flex-shrink-0">
                  <ProfileFilterSidebar
                    elementFilter={elementFilter}
                    setElementFilter={setElementFilter}
                    levelMin={levelMin}
                    setLevelMin={setLevelMin}
                    levelMax={levelMax}
                    setLevelMax={setLevelMax}
                    powerMin={powerMin}
                    setPowerMin={setPowerMin}
                    powerMax={powerMax}
                    setPowerMax={setPowerMax}
                    onClearAll={handleClearFilters}
                  />
                </div>

                {/* Main Grid Area */}
                <div className="flex-1 min-w-0">
                  {/* Top bar: count + filter toggle + sort */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {/* Mobile filter toggle */}
                      <button
                        onClick={() => setMobileFilterOpen(true)}
                        className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-pixel bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white transition-all"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Filters
                      </button>
                      <span className="font-pixel text-[10px] text-white/40 uppercase tracking-wider">
                        {filteredWarriors.length} Warrior{filteredWarriors.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ProfileSortDropdown value={sortBy} onChange={setSortBy} />
                  </div>

                  {/* Grid */}
                  {filteredWarriors.length === 0 ? (
                    <EmptyState icon={Shield} message="No warriors match your filters" />
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredWarriors.map((w) => (
                        <WarriorNFTCard key={w.tokenId} warrior={w} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Mobile Sidebar Overlay */}
                <AnimatePresence>
                  {mobileFilterOpen && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                        onClick={() => setMobileFilterOpen(false)}
                      />
                      <motion.div
                        initial={{ x: -300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -300, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed top-0 left-0 bottom-0 w-[280px] bg-frost-bg z-50 overflow-y-auto lg:hidden"
                      >
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                          <span className="font-pixel text-xs text-white">Filters</span>
                          <button
                            onClick={() => setMobileFilterOpen(false)}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          >
                            <X className="w-4 h-4 text-white/60" />
                          </button>
                        </div>
                        <ProfileFilterSidebar
                          elementFilter={elementFilter}
                          setElementFilter={setElementFilter}
                          levelMin={levelMin}
                          setLevelMin={setLevelMin}
                          levelMax={levelMax}
                          setLevelMax={setLevelMax}
                          powerMin={powerMin}
                          setPowerMin={setPowerMin}
                          powerMax={powerMax}
                          setPowerMax={setPowerMax}
                          onClearAll={handleClearFilters}
                        />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* ===== ACTIVITY TAB ===== */}
        {activeTab === 'activity' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            {loadingBattles ? (
              <LoadingSpinner label="Loading battle history..." />
            ) : battleHistory.length === 0 ? (
              <EmptyState icon={Swords} message="No battles yet" />
            ) : (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="frost-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>My Warrior</th>
                        <th className="text-center">VS</th>
                        <th>Opponent</th>
                        <th className="text-right">Stake</th>
                        <th className="text-center">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {battleHistory.map((battle, i) => {
                        const isPlayer1 = battle.player1.toLowerCase() === address.toLowerCase();
                        const myNft = isPlayer1 ? battle.nft1 : battle.nft2;
                        const opponentNft = isPlayer1 ? battle.nft2 : battle.nft1;
                        const opponent = isPlayer1 ? battle.player2 : battle.player1;
                        const isWin = battle.winner.toLowerCase() === address.toLowerCase();
                        const isResolved = battle.resolved;
                        const myWarrior = warriors.find((w) => w.tokenId === myNft);
                        const myElement = myWarrior ? myWarrior.element : 0;

                        return (
                          <motion.tr
                            key={battle.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.05 + i * 0.03 }}
                          >
                            <td className="text-white/50 text-sm">{formatDate(battle.createdAt)}</td>
                            <td>
                              <span className="flex items-center gap-2">
                                {myWarrior ? (
                                  <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                                    <WarriorImage tokenId={myNft} element={myElement} size={32} />
                                  </div>
                                ) : (
                                  <span>{getElement(myElement).emoji}</span>
                                )}
                                <span className="text-white font-pixel text-xs">#{myNft}</span>
                              </span>
                            </td>
                            <td className="text-white/20 text-center font-pixel text-[10px]">vs</td>
                            <td>
                              <span className="flex items-center gap-2">
                                <span className="text-white/60 font-pixel text-xs">#{opponentNft}</span>
                                <span className="font-mono text-[10px] text-white/30">{shortenAddr(opponent)}</span>
                              </span>
                            </td>
                            <td className="text-right font-mono text-white text-sm">
                              {parseFloat(formatEther(battle.stake)).toFixed(3)} AVAX
                            </td>
                            <td className="text-center">
                              {isResolved ? (
                                <span className={cn(
                                  'px-3 py-1 rounded-full text-[10px] font-pixel font-bold uppercase',
                                  isWin && 'bg-frost-green/20 text-frost-green border border-frost-green/30',
                                  !isWin && 'bg-frost-red/20 text-frost-red border border-frost-red/30',
                                )}>
                                  {isWin ? 'win' : 'loss'}
                                </span>
                              ) : (
                                <span className="px-3 py-1 rounded-full text-[10px] font-pixel font-bold uppercase bg-white/10 text-white/50 border border-white/10">
                                  pending
                                </span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ===== ELEMENT DISTRIBUTION ===== */}
        {activeTab === 'collection' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="max-w-4xl mt-6"
          >
            {/* Element Distribution */}
            <div className="glass-card p-6 rounded-2xl">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-frost-cyan" />
                <h3 className="text-sm font-display font-bold text-white">Warrior Element Distribution</h3>
              </div>
              {loadingWarriors ? (
                <LoadingSpinner label="Loading distribution..." />
              ) : warriors.length === 0 ? (
                <p className="text-sm text-white/40 text-center py-4">No warriors to display distribution</p>
              ) : (
                <div className="space-y-2">
                  {elementDistribution.map((el, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/70">{el.emoji} {el.name}</span>
                        <span className="font-mono text-white/50">{el.count}</span>
                      </div>
                      <div className="progress-bar">
                        <motion.div
                          className="progress-bar-fill bg-gradient-to-r from-frost-cyan to-frost-purple"
                          initial={{ width: 0 }}
                          animate={{ width: `${(el.count / maxCount) * 100}%` }}
                          transition={{ delay: 0.3 + i * 0.05, duration: 0.6 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
