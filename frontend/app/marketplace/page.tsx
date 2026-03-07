'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Store,
  Gavel,
  Tag,
  Activity,
  Loader2,
  Clock,
  ArrowUpRight,
  Plus,
  X,
  ChevronDown,
  SlidersHorizontal,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react';
import { ELEMENTS, CONTRACT_ADDRESSES, PLATFORM_FEE_PERCENT } from '@/lib/constants';
import { MARKETPLACE_ABI, FROSTBITE_WARRIOR_ABI } from '@/lib/contracts';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { cn, shortenAddress } from '@/lib/utils';

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
  powerScore: number;
}

interface ListingData {
  tokenId: number;
  seller: string;
  price: bigint;
  active: boolean;
}

interface AuctionData {
  tokenId: number;
  seller: string;
  startPrice: bigint;
  highestBid: bigint;
  highestBidder: string;
  startTime: number;
  endTime: number;
  active: boolean;
  settled: boolean;
}

type Tab = 'items' | 'my-listings' | 'activity';
type SortOption = 'recent' | 'price-asc' | 'price-desc' | 'level-desc' | 'power-desc' | 'token-asc';

type MarketItem =
  | { type: 'listing'; warrior: Warrior; listing: ListingData }
  | { type: 'auction'; warrior: Warrior; auction: AuctionData };

interface SaleRecord {
  id: number;
  tokenId: number;
  seller: string;
  buyer: string;
  price: string;
  type: string;
  createdAt: number;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function getElement(id: number) {
  return ELEMENTS[id] ?? ELEMENTS[0];
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
    powerScore: Number(raw.powerScore ?? raw[9] ?? 0),
  };
}

function parseListingData(raw: Record<string, unknown>, tokenId: number): ListingData {
  return {
    tokenId,
    seller: String(raw.seller ?? raw[0] ?? ''),
    price: BigInt(String(raw.price ?? raw[1] ?? 0)),
    active: Boolean(raw.active ?? raw[2] ?? false),
  };
}

function parseAuctionData(raw: Record<string, unknown>, tokenId: number): AuctionData {
  return {
    tokenId,
    seller: String(raw.seller ?? raw[0] ?? ''),
    startPrice: BigInt(String(raw.startPrice ?? raw[1] ?? 0)),
    highestBid: BigInt(String(raw.highestBid ?? raw[2] ?? 0)),
    highestBidder: String(raw.highestBidder ?? raw[3] ?? ''),
    startTime: Number(raw.startTime ?? raw[4] ?? 0),
    endTime: Number(raw.endTime ?? raw[5] ?? 0),
    active: Boolean(raw.active ?? raw[6] ?? false),
    settled: Boolean(raw.settled ?? raw[7] ?? false),
  };
}

function timeRemaining(endTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = endTime - now;
  if (diff <= 0) return 'Ended';
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Recently Listed' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'level-desc', label: 'Level: High to Low' },
  { value: 'power-desc', label: 'Power: High to Low' },
  { value: 'token-asc', label: 'Token ID' },
];

const TABS: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: 'items', label: 'Items', icon: Store },
  { id: 'my-listings', label: 'My Listings', icon: Tag },
  { id: 'activity', label: 'Activity', icon: Activity },
];

/* ---------------------------------------------------------------------------
 * Sub-components: Collection Stats Bar
 * ------------------------------------------------------------------------- */

function CollectionStatsBar({
  floorPrice,
  totalListed,
  activeAuctions,
  totalSupply,
  totalVolume,
}: {
  floorPrice: bigint;
  totalListed: number;
  activeAuctions: number;
  totalSupply: number;
  totalVolume: number;
}) {
  const stats = [
    { label: 'Floor', value: floorPrice > BigInt(0) ? `${formatEther(floorPrice)} AVAX` : '--' },
    { label: 'Listed', value: totalListed.toString() },
    { label: 'Auctions', value: activeAuctions.toString() },
    { label: 'Supply', value: totalSupply > 0 ? totalSupply.toString() : '--' },
    { label: 'Volume', value: totalVolume > 0 ? `${totalVolume.toFixed(2)} AVAX` : '--' },
  ];

  return (
    <div className="border-b border-white/[0.06] bg-frost-surface/40 backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between py-4">
          {/* Left: Collection identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-frost-cyan/20 to-frost-purple/20 border border-white/[0.08] flex items-center justify-center">
              <Store className="h-5 w-5 text-frost-cyan" />
            </div>
            <div>
              <h1 className="font-pixel text-sm sm:text-lg text-white leading-tight">Frostbite Warriors</h1>
              <p className="text-[10px] text-white/40 hidden sm:block">Marketplace</p>
            </div>
          </div>

          {/* Right: Stats */}
          <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto">
            {stats.map((s) => (
              <div key={s.label} className="text-center flex-shrink-0">
                <div className="font-pixel text-xs sm:text-sm text-frost-cyan">{s.value}</div>
                <div className="text-[9px] sm:text-[10px] text-white/40 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: Filter Sidebar
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

function FilterSidebar({
  statusFilter,
  setStatusFilter,
  elementFilter,
  setElementFilter,
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
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
  statusFilter: Set<string>;
  setStatusFilter: (s: Set<string>) => void;
  elementFilter: number | null;
  setElementFilter: (e: number | null) => void;
  priceMin: string;
  setPriceMin: (v: string) => void;
  priceMax: string;
  setPriceMax: (v: string) => void;
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
  const toggleStatus = (key: string) => {
    const next = new Set(statusFilter);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setStatusFilter(next);
  };

  return (
    <div className="sticky top-24 rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm overflow-hidden max-h-[calc(100vh-120px)] overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="font-pixel text-[10px] text-white/60 uppercase tracking-wider">Filters</span>
        <button onClick={onClearAll} className="text-[10px] text-frost-cyan hover:underline">
          Clear All
        </button>
      </div>

      {/* Status */}
      <FilterSection title="Status">
        <div className="space-y-2">
          {[
            { key: 'listing', label: 'Buy Now', icon: Tag },
            { key: 'auction', label: 'On Auction', icon: Gavel },
          ].map(({ key, label, icon: Icon }) => (
            <label
              key={key}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <div
                className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center transition-all',
                  statusFilter.has(key)
                    ? 'bg-frost-cyan/20 border-frost-cyan/50'
                    : 'border-white/20 group-hover:border-white/40'
                )}
              >
                {statusFilter.has(key) && <div className="w-2 h-2 rounded-sm bg-frost-cyan" />}
              </div>
              <Icon className="h-3 w-3 text-white/40" />
              <span className="text-xs text-white/60 group-hover:text-white/80 transition-colors">{label}</span>
              <input
                type="checkbox"
                checked={statusFilter.has(key)}
                onChange={() => toggleStatus(key)}
                className="sr-only"
              />
            </label>
          ))}
        </div>
      </FilterSection>

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

      {/* Price Range */}
      <FilterSection title="Price (AVAX)" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Min"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/40"
          />
          <span className="text-white/30 text-xs">—</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/40"
          />
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
 * Sub-components: Sort Dropdown
 * ------------------------------------------------------------------------- */

function SortDropdown({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
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
 * Sub-components: NFT Cards (image-dominant, Salvor style)
 * ------------------------------------------------------------------------- */

function NFTListingCard({
  warrior,
  listing,
  onBuy,
  buying,
}: {
  warrior: Warrior;
  listing: ListingData;
  onBuy: (tokenId: number) => void;
  buying: boolean;
}) {
  const el = getElement(warrior.element);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm hover:border-frost-cyan/30 transition-all duration-300 overflow-hidden hover:shadow-glow-cyan hover:-translate-y-1"
    >
      {/* Image */}
      <Link href={`/marketplace/${warrior.tokenId}`} className="block relative">
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
            <span className={cn('text-[10px] px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 font-pixel')}>
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
              <ArrowUpRight className="h-3.5 w-3.5 text-white/60" />
            </div>
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3.5">
        <Link href={`/marketplace/${warrior.tokenId}`}>
          <h3 className="font-pixel text-xs text-white truncate hover:text-frost-cyan transition-colors">
            Warrior #{warrior.tokenId}
          </h3>
        </Link>

        {/* Stats row */}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-3 text-[10px] font-pixel text-white/50">
            <span className="text-red-400">{warrior.attack} ATK</span>
            <span className="text-blue-400">{warrior.defense} DEF</span>
            <span className="text-green-400">{warrior.speed} SPD</span>
          </div>
          <div className="font-pixel text-xs text-frost-cyan font-bold">{warrior.powerScore}</div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
          <div>
            <div className="text-[9px] text-white/40 uppercase tracking-wider font-pixel">Price</div>
            <div className="font-pixel text-sm text-frost-cyan font-bold">
              {formatEther(listing.price)} <span className="text-[10px] text-white/40">AVAX</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.preventDefault(); onBuy(warrior.tokenId); }}
            disabled={buying}
            className="px-4 py-2 text-[10px] font-pixel rounded-lg bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/30 hover:bg-frost-cyan/20 transition-all disabled:opacity-50"
          >
            {buying ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buy'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function NFTAuctionCard({
  warrior,
  auction,
  onBid,
}: {
  warrior: Warrior;
  auction: AuctionData;
  onBid: (tokenId: number) => void;
}) {
  const el = getElement(warrior.element);
  const [countdown, setCountdown] = useState(timeRemaining(auction.endTime));

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(timeRemaining(auction.endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction.endTime]);

  const ended = auction.endTime <= Math.floor(Date.now() / 1000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm hover:border-frost-purple/30 transition-all duration-300 overflow-hidden hover:shadow-glow-purple hover:-translate-y-1"
    >
      {/* Image */}
      <Link href={`/marketplace/${warrior.tokenId}`} className="block relative">
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
            <span className={cn('text-[10px] px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 font-pixel')}>
              {el.emoji} {el.name}
            </span>
          </div>
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            <span className="text-[10px] px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 font-pixel text-white/80">
              Lv.{warrior.level}
            </span>
          </div>
          {/* Auction timer badge */}
          <div className="absolute bottom-2.5 right-2.5">
            <span className={cn(
              'flex items-center gap-1 text-[10px] px-2 py-1 rounded-md backdrop-blur-sm border font-pixel',
              ended ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-frost-purple/20 border-frost-purple/30 text-frost-purple'
            )}>
              <Clock className="h-3 w-3" />
              {ended ? 'Ended' : countdown}
            </span>
          </div>
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute bottom-2.5 left-3">
              <span className="text-[10px] text-white/80 font-pixel">Power {warrior.powerScore}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3.5">
        <Link href={`/marketplace/${warrior.tokenId}`}>
          <h3 className="font-pixel text-xs text-white truncate hover:text-frost-purple transition-colors">
            Warrior #{warrior.tokenId}
          </h3>
        </Link>

        {/* Stats row */}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-3 text-[10px] font-pixel text-white/50">
            <span className="text-red-400">{warrior.attack} ATK</span>
            <span className="text-blue-400">{warrior.defense} DEF</span>
            <span className="text-green-400">{warrior.speed} SPD</span>
          </div>
          <div className="font-pixel text-xs text-frost-purple font-bold">{warrior.powerScore}</div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
          <div>
            <div className="text-[9px] text-white/40 uppercase tracking-wider font-pixel">
              {auction.highestBid > BigInt(0) ? 'Top Bid' : 'Start'}
            </div>
            <div className="font-pixel text-sm text-frost-purple font-bold">
              {formatEther(auction.highestBid > BigInt(0) ? auction.highestBid : auction.startPrice)}{' '}
              <span className="text-[10px] text-white/40">AVAX</span>
            </div>
          </div>
          {!ended && (
            <button
              onClick={(e) => { e.preventDefault(); onBid(warrior.tokenId); }}
              className="px-4 py-2 text-[10px] font-pixel rounded-lg bg-frost-purple/10 text-frost-purple border border-frost-purple/30 hover:bg-frost-purple/20 transition-all"
            >
              Bid
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: Modals (preserved from original)
 * ------------------------------------------------------------------------- */

function WarriorThumb({ tokenId, element, size = 36 }: { tokenId: number; element: number; size?: number }) {
  const el = getElement(element);
  return (
    <div className="relative rounded-lg overflow-hidden flex-shrink-0 mx-auto mb-1" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/metadata/${tokenId}/image?element=${element}`}
        alt={`#${tokenId}`}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <span className="absolute bottom-0 right-0 text-[8px] leading-none bg-black/60 rounded-tl px-0.5">{el.emoji}</span>
    </div>
  );
}

function ListItemModal({
  warriors,
  onClose,
  onList,
  pending,
}: {
  warriors: Warrior[];
  onClose: () => void;
  onList: (tokenId: number, price: string) => void;
  pending: boolean;
}) {
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [price, setPrice] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-md p-6 rounded-2xl border border-white/[0.08]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-pixel text-sm font-bold gradient-text">List NFT for Sale</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-2">Select Warrior</label>
            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {warriors.map((w) => (
                <button
                  key={w.tokenId}
                  onClick={() => setSelectedToken(w.tokenId)}
                  className={cn(
                    'p-2 rounded-lg border text-center text-sm transition-all',
                    selectedToken === w.tokenId
                      ? 'border-frost-cyan bg-frost-cyan/10 text-frost-cyan'
                      : 'border-white/[0.06] text-white/60 hover:border-white/20'
                  )}
                >
                  <WarriorThumb tokenId={w.tokenId} element={w.element} />
                  <span className="font-pixel text-[10px]">#{w.tokenId}</span>
                </button>
              ))}
              {warriors.length === 0 && (
                <p className="col-span-4 text-sm text-white/40 text-center py-4">No warriors found</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Price (AVAX)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.1"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/50"
            />
            {price && (
              <p className="text-[10px] text-white/30 mt-1">
                Platform fee: {PLATFORM_FEE_PERCENT}% &middot; You receive: {(parseFloat(price) * (1 - PLATFORM_FEE_PERCENT / 100)).toFixed(4)} AVAX
              </p>
            )}
          </div>

          <button
            onClick={() => selectedToken !== null && price && onList(selectedToken, price)}
            disabled={selectedToken === null || !price || pending}
            className="w-full py-3 rounded-lg font-pixel text-xs bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/30 hover:bg-frost-cyan/20 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'List for Sale'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CreateAuctionModal({
  warriors,
  onClose,
  onCreateAuction,
  pending,
}: {
  warriors: Warrior[];
  onClose: () => void;
  onCreateAuction: (tokenId: number, startPrice: string, duration: number) => void;
  pending: boolean;
}) {
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [startPrice, setStartPrice] = useState('');
  const [durationHours, setDurationHours] = useState('24');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-md p-6 rounded-2xl border border-white/[0.08]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-pixel text-sm font-bold gradient-text">Create Auction</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-2">Select Warrior</label>
            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {warriors.map((w) => (
                <button
                  key={w.tokenId}
                  onClick={() => setSelectedToken(w.tokenId)}
                  className={cn(
                    'p-2 rounded-lg border text-center text-sm transition-all',
                    selectedToken === w.tokenId
                      ? 'border-frost-purple bg-frost-purple/10 text-frost-purple'
                      : 'border-white/[0.06] text-white/60 hover:border-white/20'
                  )}
                >
                  <WarriorThumb tokenId={w.tokenId} element={w.element} />
                  <span className="font-pixel text-[10px]">#{w.tokenId}</span>
                </button>
              ))}
              {warriors.length === 0 && (
                <p className="col-span-4 text-sm text-white/40 text-center py-4">No warriors found</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Starting Price (AVAX)</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={startPrice}
              onChange={(e) => setStartPrice(e.target.value)}
              placeholder="0.05"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-purple/50"
            />
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Duration</label>
            <select
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white focus:outline-none focus:border-frost-purple/50"
            >
              <option value="1">1 hour</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
            </select>
          </div>

          <button
            onClick={() =>
              selectedToken !== null &&
              startPrice &&
              onCreateAuction(selectedToken, startPrice, parseInt(durationHours) * 3600)
            }
            disabled={selectedToken === null || !startPrice || pending}
            className="w-full py-3 rounded-lg font-pixel text-xs bg-frost-purple/10 text-frost-purple border border-frost-purple/30 hover:bg-frost-purple/20 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Start Auction'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function BidModal({
  tokenId,
  auction,
  onClose,
  onPlaceBid,
  pending,
}: {
  tokenId: number;
  auction: AuctionData;
  onClose: () => void;
  onPlaceBid: (tokenId: number, amount: string) => void;
  pending: boolean;
}) {
  const minBid = auction.highestBid > BigInt(0)
    ? auction.highestBid + (auction.highestBid * BigInt(500)) / BigInt(10000)
    : auction.startPrice;
  const [amount, setAmount] = useState(formatEther(minBid));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-sm p-6 rounded-2xl border border-white/[0.08]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-pixel text-sm font-bold gradient-text">Place Bid — #{tokenId}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Current Bid</span>
            <span className="text-white font-medium">
              {auction.highestBid > BigInt(0) ? `${formatEther(auction.highestBid)} AVAX` : 'No bids yet'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">Min Bid</span>
            <span className="text-frost-cyan font-medium">{formatEther(minBid)} AVAX</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-white/40 block mb-1">Your Bid (AVAX)</label>
          <input
            type="number"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-purple/50"
          />
        </div>

        <button
          onClick={() => onPlaceBid(tokenId, amount)}
          disabled={!amount || pending}
          className="w-full py-3 rounded-lg font-pixel text-xs bg-frost-purple/10 text-frost-purple border border-frost-purple/30 hover:bg-frost-purple/20 transition-colors disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Place Bid'}
        </button>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Main Page
 * ------------------------------------------------------------------------- */

export default function MarketplacePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const [tab, setTab] = useState<Tab>('items');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  // Data
  const [listingTokenIds, setListingTokenIds] = useState<number[]>([]);
  const [auctionTokenIds, setAuctionTokenIds] = useState<number[]>([]);
  const [listingsData, setListingsData] = useState<Map<number, ListingData>>(new Map());
  const [auctionsData, setAuctionsData] = useState<Map<number, AuctionData>>(new Map());
  const [warriorsData, setWarriorsData] = useState<Map<number, Warrior>>(new Map());
  const [myWarriors, setMyWarriors] = useState<Warrior[]>([]);
  const [activityData, setActivityData] = useState<SaleRecord[]>([]);
  const [totalSupply, setTotalSupply] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);

  // Modals
  const [showListModal, setShowListModal] = useState(false);
  const [showAuctionModal, setShowAuctionModal] = useState(false);
  const [bidModalToken, setBidModalToken] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['listing', 'auction']));
  const [elementFilter, setElementFilter] = useState<number | null>(null);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [levelMin, setLevelMin] = useState('');
  const [levelMax, setLevelMax] = useState('');
  const [powerMin, setPowerMin] = useState('');
  const [powerMax, setPowerMax] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ------ Fetch on-chain data ------

  const fetchWarrior = useCallback(
    async (tokenId: number): Promise<Warrior | null> => {
      if (!publicClient) return null;
      try {
        const raw = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarrior',
          args: [BigInt(tokenId)],
        });
        return parseWarriorData(raw as Record<string, unknown>, tokenId);
      } catch {
        return null;
      }
    },
    [publicClient]
  );

  const fetchListings = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    try {
      const count = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getActiveListingCount',
      })) as bigint;

      if (count === BigInt(0)) {
        setListingTokenIds([]);
        setLoading(false);
        return;
      }

      const ids = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getActiveListings',
        args: [BigInt(0), count],
      })) as bigint[];

      const tokenIds = ids.map((id) => Number(id));
      setListingTokenIds(tokenIds);

      const newListings = new Map<number, ListingData>();
      const newWarriors = new Map(warriorsData);

      await Promise.all(
        tokenIds.map(async (tokenId) => {
          const [listingRaw, warrior] = await Promise.all([
            publicClient.readContract({
              address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'getListing',
              args: [BigInt(tokenId)],
            }),
            fetchWarrior(tokenId),
          ]);
          newListings.set(tokenId, parseListingData(listingRaw as Record<string, unknown>, tokenId));
          if (warrior) newWarriors.set(tokenId, warrior);
        })
      );

      setListingsData(newListings);
      setWarriorsData(newWarriors);
    } catch (err) {
      console.error('Failed to fetch listings:', err);
    }
    setLoading(false);
  }, [publicClient, fetchWarrior, warriorsData]);

  const fetchAuctions = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    try {
      const count = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getActiveAuctionCount',
      })) as bigint;

      if (count === BigInt(0)) {
        setAuctionTokenIds([]);
        setLoading(false);
        return;
      }

      const ids = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'getActiveAuctions',
        args: [BigInt(0), count],
      })) as bigint[];

      const tokenIds = ids.map((id) => Number(id));
      setAuctionTokenIds(tokenIds);

      const newAuctions = new Map<number, AuctionData>();
      const newWarriors = new Map(warriorsData);

      await Promise.all(
        tokenIds.map(async (tokenId) => {
          const [auctionRaw, warrior] = await Promise.all([
            publicClient.readContract({
              address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'getAuction',
              args: [BigInt(tokenId)],
            }),
            fetchWarrior(tokenId),
          ]);
          newAuctions.set(tokenId, parseAuctionData(auctionRaw as Record<string, unknown>, tokenId));
          if (warrior) newWarriors.set(tokenId, warrior);
        })
      );

      setAuctionsData(newAuctions);
      setWarriorsData(newWarriors);
    } catch (err) {
      console.error('Failed to fetch auctions:', err);
    }
    setLoading(false);
  }, [publicClient, fetchWarrior, warriorsData]);

  const fetchMyWarriors = useCallback(async () => {
    if (!publicClient || !address) return;
    try {
      const ids = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'getWarriorsByOwner',
        args: [address],
      })) as bigint[];

      const warriors = await Promise.all(
        ids.map(async (id) => {
          const w = await fetchWarrior(Number(id));
          return w;
        })
      );
      setMyWarriors(warriors.filter(Boolean) as Warrior[]);
    } catch (err) {
      console.error('Failed to fetch user warriors:', err);
    }
  }, [publicClient, address, fetchWarrior]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/marketplace/activity?limit=50');
      const data = await res.json();
      const sales = data.sales ?? [];
      setActivityData(sales);
      // Compute volume
      const vol = sales.reduce((sum: number, s: SaleRecord) => sum + parseFloat(s.price || '0'), 0);
      setTotalVolume(vol);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }, []);

  const fetchTotalSupply = useCallback(async () => {
    if (!publicClient) return;
    try {
      const supply = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'totalSupply',
      })) as bigint;
      setTotalSupply(Number(supply));
    } catch (err) {
      console.error('totalSupply error:', err);
    }
  }, [publicClient]);

  // Initial load
  useEffect(() => {
    fetchListings();
    fetchAuctions();
    fetchTotalSupply();
    fetchActivity();
  }, [publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isConnected) fetchMyWarriors();
  }, [isConnected, address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh after tx
  useEffect(() => {
    if (txConfirmed) {
      fetchListings();
      fetchAuctions();
      fetchMyWarriors();
      fetchActivity();
      setPending(false);
    }
  }, [txConfirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------ Actions ------

  const handleApproveAndList = async (tokenId: number, priceStr: string) => {
    if (!address) return;
    setPending(true);
    try {
      const isApproved = await publicClient!.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'isApprovedForAll',
        args: [address, CONTRACT_ADDRESSES.marketplace as `0x${string}`],
      });

      if (!isApproved) {
        const approveTx = await writeContractAsync({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'setApprovalForAll',
          args: [CONTRACT_ADDRESSES.marketplace as `0x${string}`, true],
        });
        await publicClient!.waitForTransactionReceipt({ hash: approveTx });
      }

      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'listItem',
        args: [BigInt(tokenId), parseEther(priceStr)],
      });

      setShowListModal(false);
    } catch (err) {
      console.error('List failed:', err);
      setPending(false);
    }
  };

  const handleBuy = async (tokenId: number) => {
    const listing = listingsData.get(tokenId);
    if (!listing) return;
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'buyItem',
        args: [BigInt(tokenId)],
        value: listing.price,
      });
    } catch (err) {
      console.error('Buy failed:', err);
      setPending(false);
    }
  };

  const handleCreateAuction = async (tokenId: number, startPriceStr: string, duration: number) => {
    if (!address) return;
    setPending(true);
    try {
      const isApproved = await publicClient!.readContract({
        address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
        abi: FROSTBITE_WARRIOR_ABI,
        functionName: 'isApprovedForAll',
        args: [address, CONTRACT_ADDRESSES.marketplace as `0x${string}`],
      });

      if (!isApproved) {
        const approveTx = await writeContractAsync({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'setApprovalForAll',
          args: [CONTRACT_ADDRESSES.marketplace as `0x${string}`, true],
        });
        await publicClient!.waitForTransactionReceipt({ hash: approveTx });
      }

      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'createAuction',
        args: [BigInt(tokenId), parseEther(startPriceStr), BigInt(duration)],
      });

      setShowAuctionModal(false);
    } catch (err) {
      console.error('Create auction failed:', err);
      setPending(false);
    }
  };

  const handlePlaceBid = async (tokenId: number, amountStr: string) => {
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'placeBid',
        args: [BigInt(tokenId)],
        value: parseEther(amountStr),
      });
      setBidModalToken(null);
    } catch (err) {
      console.error('Bid failed:', err);
      setPending(false);
    }
  };

  const handleCancelListing = async (tokenId: number) => {
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'cancelListing',
        args: [BigInt(tokenId)],
      });
    } catch (err) {
      console.error('Cancel failed:', err);
      setPending(false);
    }
  };

  // ------ Computed: floor price ------

  const floorPrice = useMemo(() => {
    const prices = Array.from(listingsData.values())
      .filter((l) => l.active)
      .map((l) => l.price);
    if (prices.length === 0) return BigInt(0);
    return prices.reduce((min, p) => (p < min ? p : min), prices[0]);
  }, [listingsData]);

  // ------ Computed: filtered + sorted items ------

  const allItems = useMemo((): MarketItem[] => {
    const items: MarketItem[] = [];

    if (statusFilter.has('listing')) {
      for (const tokenId of listingTokenIds) {
        const warrior = warriorsData.get(tokenId);
        const listing = listingsData.get(tokenId);
        if (warrior && listing) items.push({ type: 'listing', warrior, listing });
      }
    }

    if (statusFilter.has('auction')) {
      for (const tokenId of auctionTokenIds) {
        const warrior = warriorsData.get(tokenId);
        const auction = auctionsData.get(tokenId);
        if (warrior && auction) items.push({ type: 'auction', warrior, auction });
      }
    }

    return items;
  }, [statusFilter, listingTokenIds, auctionTokenIds, warriorsData, listingsData, auctionsData]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const w = item.warrior;

      // Element filter
      if (elementFilter !== null && w.element !== elementFilter) return false;

      // Price filter
      const price = item.type === 'listing' ? item.listing.price : item.auction.startPrice;
      const priceAvax = parseFloat(formatEther(price));
      if (priceMin && priceAvax < parseFloat(priceMin)) return false;
      if (priceMax && priceAvax > parseFloat(priceMax)) return false;

      // Level filter
      if (levelMin && w.level < parseInt(levelMin)) return false;
      if (levelMax && w.level > parseInt(levelMax)) return false;

      // Power filter
      if (powerMin && w.powerScore < parseInt(powerMin)) return false;
      if (powerMax && w.powerScore > parseInt(powerMax)) return false;

      return true;
    });
  }, [allItems, elementFilter, priceMin, priceMax, levelMin, levelMax, powerMin, powerMax]);

  const sortedItems = useMemo(() => {
    const items = [...filteredItems];
    switch (sortBy) {
      case 'price-asc':
        return items.sort((a, b) => {
          const pa = a.type === 'listing' ? a.listing.price : a.auction.startPrice;
          const pb = b.type === 'listing' ? b.listing.price : b.auction.startPrice;
          return Number(pa - pb);
        });
      case 'price-desc':
        return items.sort((a, b) => {
          const pa = a.type === 'listing' ? a.listing.price : a.auction.startPrice;
          const pb = b.type === 'listing' ? b.listing.price : b.auction.startPrice;
          return Number(pb - pa);
        });
      case 'level-desc':
        return items.sort((a, b) => b.warrior.level - a.warrior.level);
      case 'power-desc':
        return items.sort((a, b) => b.warrior.powerScore - a.warrior.powerScore);
      case 'token-asc':
        return items.sort((a, b) => a.warrior.tokenId - b.warrior.tokenId);
      case 'recent':
      default:
        return items;
    }
  }, [filteredItems, sortBy]);

  const myListings = listingTokenIds.filter((tokenId) => {
    const l = listingsData.get(tokenId);
    return l && l.seller.toLowerCase() === address?.toLowerCase();
  });

  const activeFilterCount = [
    elementFilter !== null,
    priceMin !== '',
    priceMax !== '',
    levelMin !== '',
    levelMax !== '',
    powerMin !== '',
    powerMax !== '',
    !statusFilter.has('listing') || !statusFilter.has('auction'),
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStatusFilter(new Set(['listing', 'auction']));
    setElementFilter(null);
    setPriceMin('');
    setPriceMax('');
    setLevelMin('');
    setLevelMax('');
    setPowerMin('');
    setPowerMax('');
  };

  // ------ Render ------

  return (
    <main className="min-h-screen pt-20">
      {/* Stats Bar */}
      <CollectionStatsBar
        floorPrice={floorPrice}
        totalListed={listingTokenIds.length}
        activeAuctions={auctionTokenIds.length}
        totalSupply={totalSupply}
        totalVolume={totalVolume}
      />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between py-4 border-b border-white/[0.06]">
          {/* Left: Tabs + Action buttons */}
          <div className="flex items-center gap-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-pixel uppercase tracking-wider transition-all',
                    tab === t.id
                      ? 'text-frost-cyan bg-frost-cyan/10 border border-frost-cyan/20'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04] border border-transparent'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {t.id === 'my-listings' && myListings.length > 0 && (
                    <span className="text-[9px] bg-frost-cyan/20 text-frost-cyan px-1.5 py-0.5 rounded-full">
                      {myListings.length}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Action buttons */}
            {isConnected && (
              <>
                <div className="w-px h-6 bg-white/[0.06] mx-1 hidden sm:block" />
                <button
                  onClick={() => setShowListModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] sm:text-xs font-pixel text-frost-cyan bg-frost-cyan/5 border border-frost-cyan/20 hover:bg-frost-cyan/10 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  onClick={() => setShowAuctionModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] sm:text-xs font-pixel text-frost-purple bg-frost-purple/5 border border-frost-purple/20 hover:bg-frost-purple/10 transition-all"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Auction</span>
                </button>
              </>
            )}
          </div>

          {/* Right: Sort + Filter toggle */}
          <div className="flex items-center gap-2">
            {tab === 'items' && (
              <>
                <SortDropdown value={sortBy} onChange={setSortBy} />
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-pixel bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white transition-all"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {activeFilterCount > 0 && (
                    <span className="bg-frost-cyan/20 text-frost-cyan text-[9px] px-1.5 py-0.5 rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Main Content: Sidebar + Grid */}
        <div className="flex gap-6 pt-6 pb-16">
          {/* Sidebar — desktop only */}
          {tab === 'items' && (
            <aside className="w-[280px] flex-shrink-0 hidden lg:block">
              <FilterSidebar
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                elementFilter={elementFilter}
                setElementFilter={setElementFilter}
                priceMin={priceMin}
                setPriceMin={setPriceMin}
                priceMax={priceMax}
                setPriceMax={setPriceMax}
                levelMin={levelMin}
                setLevelMin={setLevelMin}
                levelMax={levelMax}
                setLevelMax={setLevelMax}
                powerMin={powerMin}
                setPowerMin={setPowerMin}
                powerMax={powerMax}
                setPowerMax={setPowerMax}
                onClearAll={clearAllFilters}
              />
            </aside>
          )}

          {/* Grid area */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center py-20"
                >
                  <Loader2 className="h-8 w-8 animate-spin text-frost-cyan" />
                </motion.div>
              ) : (
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {/* Items Tab */}
                  {tab === 'items' && (
                    <>
                      {/* Results count */}
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs text-white/40 font-pixel">
                          {sortedItems.length} {sortedItems.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      {sortedItems.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="col-span-full flex flex-col items-center justify-center py-20"
                        >
                          <motion.div
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="mb-6"
                          >
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-frost-cyan/10 to-frost-purple/10 border border-white/[0.06] flex items-center justify-center">
                              <Store className="w-10 h-10 text-frost-cyan/30" />
                            </div>
                          </motion.div>
                          <h3 className="font-pixel text-lg text-white/50 mb-2">NO LISTINGS YET</h3>
                          <p className="text-white/25 text-sm max-w-sm text-center mb-6 leading-relaxed">
                            The marketplace is empty. Mint warriors and list them for sale, or try adjusting your filters.
                          </p>
                          <Link href="/mint" className="btn-neon btn-neon-cyan inline-flex items-center gap-2 text-sm">
                            <Sparkles className="w-4 h-4" />
                            Mint Warrior
                          </Link>
                        </motion.div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                          {sortedItems.map((item) =>
                            item.type === 'listing' ? (
                              <NFTListingCard
                                key={`l-${item.warrior.tokenId}`}
                                warrior={item.warrior}
                                listing={item.listing}
                                onBuy={handleBuy}
                                buying={pending}
                              />
                            ) : (
                              <NFTAuctionCard
                                key={`a-${item.warrior.tokenId}`}
                                warrior={item.warrior}
                                auction={item.auction}
                                onBid={() => setBidModalToken(item.warrior.tokenId)}
                              />
                            )
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* My Listings Tab */}
                  {tab === 'my-listings' && (
                    <>
                      {!isConnected ? (
                        <div className="text-center py-20">
                          <p className="text-white/40 font-pixel text-xs">Connect your wallet to see your listings</p>
                        </div>
                      ) : myListings.length === 0 ? (
                        <div className="text-center py-20">
                          <Tag className="h-12 w-12 text-white/20 mx-auto mb-3" />
                          <p className="text-white/40 font-pixel text-xs mb-3">You have no active listings</p>
                          <button
                            onClick={() => setShowListModal(true)}
                            className="px-5 py-2 rounded-lg text-xs font-pixel flex items-center gap-2 mx-auto bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/30 hover:bg-frost-cyan/20 transition-all"
                          >
                            <Plus className="h-3.5 w-3.5" /> List an NFT
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                          {myListings.map((tokenId) => {
                            const warrior = warriorsData.get(tokenId);
                            const listing = listingsData.get(tokenId);
                            if (!warrior || !listing) return null;
                            const el = getElement(warrior.element);
                            return (
                              <motion.div
                                key={tokenId}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm overflow-hidden"
                              >
                                <Link href={`/marketplace/${tokenId}`} className="block relative">
                                  <div className="relative aspect-square bg-gradient-to-br from-frost-bg to-frost-surface overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`/api/metadata/${tokenId}/image?element=${warrior.element}`}
                                      alt={`Warrior #${tokenId}`}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                    <div className="absolute top-2.5 left-2.5">
                                      <span className="text-[10px] px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 font-pixel">
                                        {el.emoji} {el.name}
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                                <div className="p-3.5">
                                  <h3 className="font-pixel text-xs text-white">Warrior #{tokenId}</h3>
                                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                                    <span className="font-pixel text-sm text-frost-cyan font-bold">
                                      {formatEther(listing.price)} <span className="text-[10px] text-white/40">AVAX</span>
                                    </span>
                                    <button
                                      onClick={() => handleCancelListing(tokenId)}
                                      disabled={pending}
                                      className="text-[10px] font-pixel px-3 py-1.5 rounded-lg text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* Activity Tab */}
                  {tab === 'activity' && (
                    <>
                      {activityData.length === 0 ? (
                        <div className="text-center py-20">
                          <Activity className="h-12 w-12 text-white/20 mx-auto mb-3" />
                          <p className="text-white/40 font-pixel text-xs">No marketplace activity yet</p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/[0.06] bg-frost-card/40 backdrop-blur-sm overflow-hidden overflow-x-auto">
                          <table className="frost-table w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/[0.06]">
                                <th className="text-left px-4 py-3 font-pixel text-[10px] uppercase tracking-wider text-white/40">Item</th>
                                <th className="text-left px-4 py-3 font-pixel text-[10px] uppercase tracking-wider text-white/40">Event</th>
                                <th className="text-left px-4 py-3 font-pixel text-[10px] uppercase tracking-wider text-white/40">Price</th>
                                <th className="text-left px-4 py-3 font-pixel text-[10px] uppercase tracking-wider text-white/40 hidden sm:table-cell">From</th>
                                <th className="text-left px-4 py-3 font-pixel text-[10px] uppercase tracking-wider text-white/40 hidden sm:table-cell">To</th>
                                <th className="text-right px-4 py-3 font-pixel text-[10px] uppercase tracking-wider text-white/40">Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activityData.map((sale) => (
                                <tr key={sale.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/marketplace/${sale.tokenId}`}
                                      className="flex items-center gap-2 text-frost-cyan hover:underline"
                                    >
                                      <div className="w-8 h-8 rounded-lg bg-frost-surface overflow-hidden flex-shrink-0">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={`/api/metadata/${sale.tokenId}/image`}
                                          alt={`#${sale.tokenId}`}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                        />
                                      </div>
                                      <span className="font-pixel text-xs">#{sale.tokenId}</span>
                                    </Link>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={cn(
                                      'text-[10px] px-2 py-0.5 rounded font-pixel',
                                      sale.type === 'auction' ? 'bg-frost-purple/20 text-frost-purple' : 'bg-frost-green/20 text-frost-green'
                                    )}>
                                      {sale.type === 'auction' ? 'Auction' : 'Sale'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-pixel text-xs text-white">{sale.price} AVAX</td>
                                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell font-mono text-xs">{shortenAddress(sale.seller)}</td>
                                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell font-mono text-xs">{shortenAddress(sale.buyer)}</td>
                                  <td className="px-4 py-3 text-right text-white/40 text-xs">{timeAgo(sale.createdAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-[300px] z-50 bg-frost-bg border-r border-white/[0.06] overflow-y-auto pt-4 lg:hidden"
            >
              <div className="px-4 pb-3 flex items-center justify-between border-b border-white/[0.06]">
                <span className="font-pixel text-sm text-white">Filters</span>
                <button onClick={() => setSidebarOpen(false)} className="text-white/40 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <FilterSidebar
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                elementFilter={elementFilter}
                setElementFilter={setElementFilter}
                priceMin={priceMin}
                setPriceMin={setPriceMin}
                priceMax={priceMax}
                setPriceMax={setPriceMax}
                levelMin={levelMin}
                setLevelMin={setLevelMin}
                levelMax={levelMax}
                setLevelMax={setLevelMax}
                powerMin={powerMin}
                setPowerMin={setPowerMin}
                powerMax={powerMax}
                setPowerMax={setPowerMax}
                onClearAll={clearAllFilters}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modals */}
      {showListModal && (
        <ListItemModal
          warriors={myWarriors}
          onClose={() => setShowListModal(false)}
          onList={handleApproveAndList}
          pending={pending}
        />
      )}
      {showAuctionModal && (
        <CreateAuctionModal
          warriors={myWarriors}
          onClose={() => setShowAuctionModal(false)}
          onCreateAuction={handleCreateAuction}
          pending={pending}
        />
      )}
      {bidModalToken !== null && auctionsData.get(bidModalToken) && (
        <BidModal
          tokenId={bidModalToken}
          auction={auctionsData.get(bidModalToken)!}
          onClose={() => setBidModalToken(null)}
          onPlaceBid={handlePlaceBid}
          pending={pending}
        />
      )}
    </main>
  );
}
