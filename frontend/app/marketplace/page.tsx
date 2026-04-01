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
  LayoutGrid,
  Grid2x2,
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
import { useOnContractEvent } from '@/hooks/useContractEvents';

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
type GridSize = 'small' | 'large';

type MarketItem =
  | { type: 'listing'; warrior: Warrior | null; listing: ListingData }
  | { type: 'auction'; warrior: Warrior | null; auction: AuctionData };

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
 * Sub-components: Collection Stats Bar (OpenSea-style)
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
    { label: 'Floor Price', value: floorPrice > BigInt(0) ? `${formatEther(floorPrice)}` : '--', suffix: 'AVAX' },
    { label: 'Total Volume', value: totalVolume > 0 ? `${totalVolume.toFixed(2)}` : '--', suffix: 'AVAX' },
    { label: 'Listed', value: `${totalListed}`, suffix: totalSupply > 0 ? `/ ${totalSupply}` : '' },
    { label: 'Auctions', value: activeAuctions.toString(), suffix: 'active' },
    { label: 'Supply', value: totalSupply > 0 ? totalSupply.toString() : '--', suffix: '' },
  ];

  return (
    <div className="border-b border-white/[0.06] bg-frost-surface/40 backdrop-blur-sm">
      <div className="px-4 sm:px-6">
        {/* Collection identity row */}
        <div className="flex items-center gap-4 pt-4 pb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-frost-cyan/20 to-frost-purple/20 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
            <Store className="h-6 w-6 text-frost-cyan" />
          </div>
          <div className="min-w-0">
            <h1 className="font-pixel text-sm sm:text-lg text-white leading-tight truncate">
              Frostbite Warriors
            </h1>
            <p className="text-[10px] text-white/40 mt-0.5">
              NFT Marketplace on Avalanche
            </p>
          </div>
        </div>

        {/* Stats row - OpenSea style horizontal boxes */}
        <div className="flex items-stretch gap-2 sm:gap-3 pb-4 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex-shrink-0 min-w-[100px] sm:min-w-[120px] px-3 sm:px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-colors"
            >
              <div className="text-[9px] sm:text-[10px] text-white/35 uppercase tracking-wider font-pixel mb-1">
                {s.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-pixel text-sm sm:text-base text-white font-bold leading-none">
                  {s.value}
                </span>
                {s.suffix && (
                  <span className="text-[9px] text-white/30 font-pixel">{s.suffix}</span>
                )}
              </div>
            </div>
          ))}
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
          <span className="text-white/30 text-xs">&mdash;</span>
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
          <span className="text-white/30 text-xs">&mdash;</span>
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
          <span className="text-white/30 text-xs">&mdash;</span>
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
 * Sub-components: Grid Size Toggle
 * ------------------------------------------------------------------------- */

function GridToggle({ gridSize, onChange }: { gridSize: GridSize; onChange: (v: GridSize) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-white/[0.08] overflow-hidden">
      <button
        onClick={() => onChange('large')}
        className={cn(
          'p-2 transition-all',
          gridSize === 'large'
            ? 'bg-frost-cyan/10 text-frost-cyan'
            : 'bg-white/[0.02] text-white/40 hover:text-white/60'
        )}
        title="Large grid"
      >
        <Grid2x2 className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-5 bg-white/[0.08]" />
      <button
        onClick={() => onChange('small')}
        className={cn(
          'p-2 transition-all',
          gridSize === 'small'
            ? 'bg-frost-cyan/10 text-frost-cyan'
            : 'bg-white/[0.02] text-white/40 hover:text-white/60'
        )}
        title="Small grid"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Sub-components: NFT Cards (OpenSea-inspired with hover overlays)
 * ------------------------------------------------------------------------- */

function NFTListingCard({
  warrior,
  listing,
  onBuy,
  onCancel,
  buying,
  connectedAddress,
  compact,
}: {
  warrior: Warrior | null;
  listing: ListingData;
  onBuy: (tokenId: number) => void;
  onCancel: (tokenId: number) => void;
  buying: boolean;
  connectedAddress?: string;
  compact?: boolean;
}) {
  const el = warrior ? getElement(warrior.element) : null;
  const tokenId = listing.tokenId;
  const isOwner = connectedAddress && listing.seller.toLowerCase() === connectedAddress.toLowerCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm hover:border-frost-cyan/30 transition-all duration-300 overflow-hidden hover:shadow-glow-cyan hover:-translate-y-1"
    >
      {/* Image */}
      <Link href={`/marketplace/${tokenId}`} className="block relative">
        <div className="relative aspect-square bg-gradient-to-br from-frost-bg to-frost-surface overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avalanche/api/metadata/${tokenId}/image${warrior ? `?element=${warrior.element}` : ''}`}
            alt={`Warrior #${tokenId}`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 warrior-idle"
            style={{ animationDelay: `${(tokenId % 5) * 0.3}s` }}
            loading="lazy"
          />
          {/* Top badges */}
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
            {el && (
              <span className={cn('text-[9px] px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 font-pixel flex items-center gap-1')}>
                <span>{el.emoji}</span>
                <span className="text-white/80">{el.name}</span>
              </span>
            )}
            {warrior && (
              <span className="text-[9px] px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 font-pixel text-frost-gold">
                PWR {warrior.powerScore}
              </span>
            )}
          </div>
          {/* Owner badge */}
          {isOwner && (
            <div className="absolute bottom-2 left-2">
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-frost-gold/20 backdrop-blur-sm border border-frost-gold/30 font-pixel text-frost-gold">
                Your Listing
              </span>
            </div>
          )}
          {/* Hover overlay with quick action */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
            {isOwner ? (
              <button
                onClick={(e) => { e.preventDefault(); onCancel(tokenId); }}
                disabled={buying}
                className="w-full py-2 rounded-lg text-[10px] font-pixel text-red-400 bg-red-400/10 border border-red-400/30 hover:bg-red-400/20 transition-all disabled:opacity-50 backdrop-blur-sm"
              >
                {buying ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Cancel Listing'}
              </button>
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); onBuy(tokenId); }}
                disabled={buying}
                className="w-full py-2 rounded-lg text-[10px] font-pixel text-frost-cyan bg-frost-cyan/10 border border-frost-cyan/30 hover:bg-frost-cyan/20 transition-all disabled:opacity-50 backdrop-blur-sm"
              >
                {buying ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Buy Now'}
              </button>
            )}
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className={compact ? 'p-2.5' : 'p-3'}>
        <div className="flex items-center justify-between">
          <Link href={`/marketplace/${tokenId}`}>
            <h3 className={cn('font-pixel text-white truncate hover:text-frost-cyan transition-colors', compact ? 'text-[10px]' : 'text-xs')}>
              #{tokenId}
            </h3>
          </Link>
          {warrior && !compact && (
            <span className="text-[9px] font-pixel text-white/30">
              Lv.{warrior.level}
            </span>
          )}
        </div>

        {/* Stats row */}
        {warrior && !compact && (
          <div className="flex items-center gap-2.5 mt-1.5 text-[9px] font-pixel text-white/50">
            <span className="text-red-400" title="Attack">{warrior.attack}</span>
            <span className="text-blue-400" title="Defense">{warrior.defense}</span>
            <span className="text-green-400" title="Speed">{warrior.speed}</span>
          </div>
        )}

        <div className={cn('flex items-center justify-between border-t border-white/[0.06]', compact ? 'mt-2 pt-2' : 'mt-2.5 pt-2.5')}>
          <div>
            <div className={cn('font-pixel text-frost-cyan font-bold', compact ? 'text-[11px]' : 'text-sm')}>
              {formatEther(listing.price)}
            </div>
            <div className="text-[8px] text-white/30 font-pixel">AVAX</div>
          </div>
          {/* Small inline button for non-hover devices */}
          <div className="sm:hidden">
            {isOwner ? (
              <button
                onClick={(e) => { e.preventDefault(); onCancel(tokenId); }}
                disabled={buying}
                className="px-2.5 py-1 text-[9px] font-pixel rounded-md text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-all disabled:opacity-50"
              >
                {buying ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cancel'}
              </button>
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); onBuy(tokenId); }}
                disabled={buying}
                className="px-2.5 py-1 text-[9px] font-pixel rounded-md bg-frost-cyan/10 text-frost-cyan border border-frost-cyan/30 hover:bg-frost-cyan/20 transition-all disabled:opacity-50"
              >
                {buying ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buy'}
              </button>
            )}
          </div>
          {/* Desktop: show arrow icon */}
          <div className="hidden sm:block">
            <ArrowUpRight className="h-3.5 w-3.5 text-white/20 group-hover:text-frost-cyan transition-colors" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function NFTAuctionCard({
  warrior,
  auction,
  onBid,
  onCancel,
  buying,
  connectedAddress,
  compact,
}: {
  warrior: Warrior | null;
  auction: AuctionData;
  onBid: (tokenId: number) => void;
  onCancel: (tokenId: number) => void;
  buying: boolean;
  connectedAddress?: string;
  compact?: boolean;
}) {
  const el = warrior ? getElement(warrior.element) : null;
  const tokenId = auction.tokenId;
  const isOwner = connectedAddress && auction.seller.toLowerCase() === connectedAddress.toLowerCase();
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
      <Link href={`/marketplace/${tokenId}`} className="block relative">
        <div className="relative aspect-square bg-gradient-to-br from-frost-bg to-frost-surface overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avalanche/api/metadata/${tokenId}/image${warrior ? `?element=${warrior.element}` : ''}`}
            alt={`Warrior #${tokenId}`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 warrior-idle"
            style={{ animationDelay: `${(tokenId % 5) * 0.3}s` }}
            loading="lazy"
          />
          {/* Top badges */}
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
            {el && (
              <span className={cn('text-[9px] px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 font-pixel flex items-center gap-1')}>
                <span>{el.emoji}</span>
                <span className="text-white/80">{el.name}</span>
              </span>
            )}
            {warrior && (
              <span className="text-[9px] px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 font-pixel text-frost-gold">
                PWR {warrior.powerScore}
              </span>
            )}
          </div>
          {/* Bottom badges row — timer + owner in same line */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1">
            {isOwner && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-frost-gold/20 backdrop-blur-sm border border-frost-gold/30 font-pixel text-frost-gold truncate">
                Your Auction
              </span>
            )}
            <span className={cn(
              'flex items-center gap-0.5 text-[9px] px-2 py-1 rounded-lg backdrop-blur-sm border font-pixel ml-auto',
              ended ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-frost-purple/20 border-frost-purple/30 text-frost-purple'
            )}>
              <Clock className="h-2.5 w-2.5" />
              {ended ? 'Ended' : countdown}
            </span>
          </div>
          {/* Hover overlay with quick action */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
            {isOwner ? (
              <button
                onClick={(e) => { e.preventDefault(); onCancel(tokenId); }}
                disabled={buying}
                className="w-full py-2 rounded-lg text-[10px] font-pixel text-red-400 bg-red-400/10 border border-red-400/30 hover:bg-red-400/20 transition-all disabled:opacity-50 backdrop-blur-sm"
              >
                {buying ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Cancel Auction'}
              </button>
            ) : !ended ? (
              <button
                onClick={(e) => { e.preventDefault(); onBid(tokenId); }}
                className="w-full py-2 rounded-lg text-[10px] font-pixel text-frost-purple bg-frost-purple/10 border border-frost-purple/30 hover:bg-frost-purple/20 transition-all backdrop-blur-sm"
              >
                Place Bid
              </button>
            ) : null}
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className={compact ? 'p-2.5' : 'p-3'}>
        <div className="flex items-center justify-between">
          <Link href={`/marketplace/${tokenId}`}>
            <h3 className={cn('font-pixel text-white truncate hover:text-frost-purple transition-colors', compact ? 'text-[10px]' : 'text-xs')}>
              #{tokenId}
            </h3>
          </Link>
          {warrior && !compact && (
            <span className="text-[9px] font-pixel text-white/30">
              Lv.{warrior.level}
            </span>
          )}
        </div>

        {/* Stats row */}
        {warrior && !compact && (
          <div className="flex items-center gap-2.5 mt-1.5 text-[9px] font-pixel text-white/50">
            <span className="text-red-400" title="Attack">{warrior.attack}</span>
            <span className="text-blue-400" title="Defense">{warrior.defense}</span>
            <span className="text-green-400" title="Speed">{warrior.speed}</span>
          </div>
        )}

        <div className={cn('flex items-center justify-between border-t border-white/[0.06]', compact ? 'mt-2 pt-2' : 'mt-2.5 pt-2.5')}>
          <div>
            <div className={cn('font-pixel text-frost-purple font-bold', compact ? 'text-[11px]' : 'text-sm')}>
              {formatEther(auction.highestBid > BigInt(0) ? auction.highestBid : auction.startPrice)}
            </div>
            <div className="text-[8px] text-white/30 font-pixel">
              {auction.highestBid > BigInt(0) ? 'Current Bid' : 'Start'} &middot; AVAX
            </div>
          </div>
          {/* Small inline button for non-hover devices */}
          <div className="sm:hidden">
            {isOwner ? (
              <button
                onClick={(e) => { e.preventDefault(); onCancel(tokenId); }}
                disabled={buying}
                className="px-2.5 py-1 text-[9px] font-pixel rounded-md text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-all disabled:opacity-50"
              >
                {buying ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Cancel'}
              </button>
            ) : !ended ? (
              <button
                onClick={(e) => { e.preventDefault(); onBid(tokenId); }}
                className="px-2.5 py-1 text-[9px] font-pixel rounded-md bg-frost-purple/10 text-frost-purple border border-frost-purple/30 hover:bg-frost-purple/20 transition-all"
              >
                Bid
              </button>
            ) : null}
          </div>
          {/* Desktop: show arrow icon */}
          <div className="hidden sm:block">
            <ArrowUpRight className="h-3.5 w-3.5 text-white/20 group-hover:text-frost-purple transition-colors" />
          </div>
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
        src={`/avalanche/api/metadata/${tokenId}/image?element=${element}`}
        alt={`#${tokenId}`}
        width={size}
        height={size}
        className="w-full h-full object-cover warrior-idle"
        style={{ animationDelay: `${(tokenId % 5) * 0.3}s` }}
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
        className="glass-card w-full max-w-md mx-4 sm:mx-auto p-6 rounded-2xl border border-white/[0.08]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-pixel text-sm font-bold gradient-text">List NFT for Sale</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-2">Select Warrior</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
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
        className="glass-card w-full max-w-md mx-4 sm:mx-auto p-6 rounded-2xl border border-white/[0.08]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-pixel text-sm font-bold gradient-text">Create Auction</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-2">Select Warrior</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
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
          <h3 className="font-pixel text-sm font-bold gradient-text">Place Bid &mdash; #{tokenId}</h3>
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
  const [gridSize, setGridSize] = useState<GridSize>('small');

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
  const [desktopSidebar, setDesktopSidebar] = useState(false);

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

      const results = await Promise.allSettled(
        tokenIds.map(async (tokenId) => {
          const [listingRaw, warrior] = await Promise.allSettled([
            publicClient.readContract({
              address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'getListing',
              args: [BigInt(tokenId)],
            }),
            fetchWarrior(tokenId),
          ]);
          if (listingRaw.status === 'fulfilled' && listingRaw.value) {
            newListings.set(tokenId, parseListingData(listingRaw.value as Record<string, unknown>, tokenId));
          }
          if (warrior.status === 'fulfilled' && warrior.value) {
            newWarriors.set(tokenId, warrior.value);
          }
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

      await Promise.allSettled(
        tokenIds.map(async (tokenId) => {
          const [auctionRaw, warrior] = await Promise.allSettled([
            publicClient.readContract({
              address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'getAuction',
              args: [BigInt(tokenId)],
            }),
            fetchWarrior(tokenId),
          ]);
          if (auctionRaw.status === 'fulfilled' && auctionRaw.value) {
            newAuctions.set(tokenId, parseAuctionData(auctionRaw.value as Record<string, unknown>, tokenId));
          }
          if (warrior.status === 'fulfilled' && warrior.value) {
            newWarriors.set(tokenId, warrior.value);
          }
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

      const results = await Promise.allSettled(
        ids.map(async (id) => fetchWarrior(Number(id)))
      );
      const warriors: Warrior[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) warriors.push(r.value);
      }
      setMyWarriors(warriors.sort((a, b) => b.powerScore - a.powerScore));
    } catch (err) {
      console.error('Failed to fetch user warriors:', err);
    }
  }, [publicClient, address, fetchWarrior]);

  const fetchActivity = useCallback(async () => {
    if (!publicClient) return;
    try {
      const marketAddr = CONTRACT_ADDRESSES.marketplace as `0x${string}`;
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock > 200000n ? currentBlock - 200000n : 0n;

      const CHUNK = 2000n;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventDefs: any[] = [
        { type: 'event', name: 'ItemSold', inputs: [
          { type: 'uint256', name: 'tokenId', indexed: true },
          { type: 'address', name: 'seller', indexed: true },
          { type: 'address', name: 'buyer', indexed: true },
          { type: 'uint256', name: 'price' },
        ]},
        { type: 'event', name: 'AuctionEnded', inputs: [
          { type: 'uint256', name: 'tokenId', indexed: true },
          { type: 'address', name: 'seller', indexed: true },
          { type: 'address', name: 'winner', indexed: true },
          { type: 'uint256', name: 'amount' },
        ]},
        { type: 'event', name: 'ItemListed', inputs: [
          { type: 'uint256', name: 'tokenId', indexed: true },
          { type: 'address', name: 'seller', indexed: true },
          { type: 'uint256', name: 'price' },
        ]},
      ];

      // Fetch logs in 2000-block chunks to avoid RPC limits
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allResults: any[][] = [[], [], []];
      for (let start = fromBlock; start <= currentBlock; start += CHUNK) {
        const end = start + CHUNK - 1n > currentBlock ? currentBlock : start + CHUNK - 1n;
        const chunkResults = await Promise.all(
          eventDefs.map(event =>
            publicClient.getLogs({ address: marketAddr, event, fromBlock: start, toBlock: end })
          )
        );
        chunkResults.forEach((logs, i) => allResults[i].push(...logs));
      }

      const [soldLogs, auctionLogs, listedLogs] = allResults;

      // Collect unique block numbers and fetch their timestamps
      const allLogs = [...soldLogs, ...auctionLogs, ...listedLogs];
      const uniqueBlocks = [...new Set(allLogs.map(l => l.blockNumber))];
      const blockTimestamps = new Map<bigint, number>();
      await Promise.all(
        uniqueBlocks.map(async (bn) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: bn });
            blockTimestamps.set(bn, Number(block.timestamp) * 1000); // ms
          } catch { /* fallback to now */ }
        })
      );
      const getTs = (bn: bigint) => blockTimestamps.get(bn) || Date.now();

      const sales: SaleRecord[] = [];
      let idCounter = 0;

      for (const log of soldLogs) {
        const args = log.args as { tokenId?: bigint; seller?: string; buyer?: string; price?: bigint };
        if (!args.tokenId || !args.seller || !args.buyer || !args.price) continue;
        sales.push({
          id: ++idCounter,
          tokenId: Number(args.tokenId),
          seller: args.seller,
          buyer: args.buyer,
          price: formatEther(args.price),
          type: 'sale',
          createdAt: getTs(log.blockNumber),
        });
      }

      for (const log of auctionLogs) {
        const args = log.args as { tokenId?: bigint; seller?: string; winner?: string; amount?: bigint };
        if (!args.tokenId || !args.seller || !args.winner || !args.amount) continue;
        sales.push({
          id: ++idCounter,
          tokenId: Number(args.tokenId),
          seller: args.seller,
          buyer: args.winner,
          price: formatEther(args.amount),
          type: 'auction',
          createdAt: getTs(log.blockNumber),
        });
      }

      for (const log of listedLogs) {
        const args = log.args as { tokenId?: bigint; seller?: string; price?: bigint };
        if (!args.tokenId || !args.seller || !args.price) continue;
        sales.push({
          id: ++idCounter,
          tokenId: Number(args.tokenId),
          seller: args.seller,
          buyer: '',
          price: formatEther(args.price),
          type: 'listing',
          createdAt: getTs(log.blockNumber),
        });
      }

      // Sort by block number descending
      sales.sort((a, b) => b.createdAt - a.createdAt);
      setActivityData(sales);

      const vol = sales
        .filter(s => s.type === 'sale' || s.type === 'auction')
        .reduce((sum, s) => sum + parseFloat(s.price || '0'), 0);
      setTotalVolume(vol);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }, [publicClient]);

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

  // Auto-refresh when marketplace events arrive from the chain
  useOnContractEvent(
    ['ItemListed', 'ListingCancelled', 'ItemSold', 'OfferMade', 'OfferAccepted', 'AuctionCreated', 'BidPlaced', 'AuctionEnded'],
    useCallback(() => {
      fetchListings();
      fetchAuctions();
      fetchActivity();
    }, [fetchListings, fetchAuctions, fetchActivity]),
  );

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

  const handleCancelAuction = async (tokenId: number) => {
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'cancelAuction',
        args: [BigInt(tokenId)],
      });
    } catch (err) {
      console.error('Cancel auction failed:', err);
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
        const warrior = warriorsData.get(tokenId) ?? null;
        const listing = listingsData.get(tokenId);
        if (listing) items.push({ type: 'listing', warrior, listing });
      }
    }

    if (statusFilter.has('auction')) {
      for (const tokenId of auctionTokenIds) {
        const warrior = warriorsData.get(tokenId) ?? null;
        const auction = auctionsData.get(tokenId);
        if (auction) items.push({ type: 'auction', warrior, auction });
      }
    }

    return items;
  }, [statusFilter, listingTokenIds, auctionTokenIds, warriorsData, listingsData, auctionsData]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const w = item.warrior;

      // Element filter
      if (elementFilter !== null && (!w || w.element !== elementFilter)) return false;

      // Price filter
      const price = item.type === 'listing' ? item.listing.price : item.auction.startPrice;
      const priceAvax = parseFloat(formatEther(price));
      if (priceMin && priceAvax < parseFloat(priceMin)) return false;
      if (priceMax && priceAvax > parseFloat(priceMax)) return false;

      // Level filter
      if (levelMin && (!w || w.level < parseInt(levelMin))) return false;
      if (levelMax && (!w || w.level > parseInt(levelMax))) return false;

      // Power filter
      if (powerMin && (!w || w.powerScore < parseInt(powerMin))) return false;
      if (powerMax && (!w || w.powerScore > parseInt(powerMax))) return false;

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
        return items.sort((a, b) => (b.warrior?.level ?? 0) - (a.warrior?.level ?? 0));
      case 'power-desc':
        return items.sort((a, b) => (b.warrior?.powerScore ?? 0) - (a.warrior?.powerScore ?? 0));
      case 'token-asc': {
        const tid = (it: MarketItem) => it.type === 'listing' ? it.listing.tokenId : it.auction.tokenId;
        return items.sort((a, b) => tid(a) - tid(b));
      }
      case 'recent':
      default:
        return items;
    }
  }, [filteredItems, sortBy]);

  const myListings = listingTokenIds.filter((tokenId) => {
    const l = listingsData.get(tokenId);
    return l && l.seller.toLowerCase() === address?.toLowerCase();
  });

  const myAuctions = auctionTokenIds.filter((tokenId) => {
    const a = auctionsData.get(tokenId);
    return a && a.seller.toLowerCase() === address?.toLowerCase();
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

  const isCompact = gridSize === 'small';

  // Grid class based on gridSize
  const gridClass = gridSize === 'large'
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5'
    : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4';

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

      <div className="px-4 sm:px-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
          {/* Left: Tabs + Action buttons */}
          <div className="flex items-center gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-full text-[10px] sm:text-[11px] font-pixel uppercase tracking-wider transition-all',
                    tab === t.id
                      ? 'text-frost-cyan bg-frost-cyan/10 border border-frost-cyan/20'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04] border border-transparent'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {t.id === 'my-listings' && (myListings.length + myAuctions.length) > 0 && (
                    <span className="text-[8px] bg-frost-cyan/20 text-frost-cyan px-1 py-0.5 rounded-full leading-none">
                      {myListings.length + myAuctions.length}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Divider */}
            {isConnected && <div className="w-px h-5 bg-white/[0.06] mx-1 hidden sm:block" />}

            {/* Action buttons */}
            {isConnected && (
              <>
                <button
                  onClick={() => setShowListModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] sm:text-[11px] font-pixel text-frost-cyan bg-frost-cyan/5 border border-frost-cyan/20 hover:bg-frost-cyan/10 transition-all"
                >
                  <Plus className="h-3 w-3" />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  onClick={() => setShowAuctionModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] sm:text-[11px] font-pixel text-frost-purple bg-frost-purple/5 border border-frost-purple/20 hover:bg-frost-purple/10 transition-all"
                >
                  <Gavel className="h-3 w-3" />
                  <span className="hidden sm:inline">Auction</span>
                </button>
              </>
            )}
          </div>

          {/* Right: Sort + Grid toggle + Filter toggle */}
          <div className="flex items-center gap-2">
            {tab === 'items' && (
              <>
                <SortDropdown value={sortBy} onChange={setSortBy} />
                <GridToggle gridSize={gridSize} onChange={setGridSize} />
                {/* Mobile filter toggle */}
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
                {/* Desktop filter sidebar toggle */}
                <button
                  onClick={() => setDesktopSidebar(p => !p)}
                  className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-pixel bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white transition-all"
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

        {/* Element quick-filter pills (only on items tab) */}
        {tab === 'items' && (
          <div className="flex items-center gap-1.5 py-3 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <button
              onClick={() => setElementFilter(null)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-pixel transition-all',
                elementFilter === null
                  ? 'bg-frost-cyan/15 text-frost-cyan border border-frost-cyan/30'
                  : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:border-white/[0.12] hover:text-white/60'
              )}
            >
              All
            </button>
            {ELEMENTS.map((el) => (
              <button
                key={el.id}
                onClick={() => setElementFilter(el.id === elementFilter ? null : el.id)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-pixel transition-all',
                  elementFilter === el.id
                    ? 'bg-frost-cyan/15 text-frost-cyan border border-frost-cyan/30'
                    : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:border-white/[0.12] hover:text-white/60'
                )}
              >
                <span>{el.emoji}</span>
                <span className="hidden sm:inline">{el.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Main Content: Sidebar + Grid */}
        <div className="flex gap-6 pb-16">
          {/* Sidebar — desktop, collapsible */}
          {tab === 'items' && desktopSidebar && (
            <aside className="w-[220px] flex-shrink-0 hidden lg:block">
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
                        {activeFilterCount > 0 && (
                          <button
                            onClick={clearAllFilters}
                            className="text-[10px] text-frost-cyan hover:underline font-pixel flex items-center gap-1"
                          >
                            <X className="h-3 w-3" />
                            Clear filters
                          </button>
                        )}
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
                        <div className={gridClass}>
                          {sortedItems.map((item) => {
                            const tid = item.type === 'listing' ? item.listing.tokenId : item.auction.tokenId;
                            return item.type === 'listing' ? (
                              <NFTListingCard
                                key={`l-${tid}`}
                                warrior={item.warrior}
                                listing={item.listing}
                                onBuy={handleBuy}
                                onCancel={handleCancelListing}
                                buying={pending}
                                connectedAddress={address}
                                compact={isCompact}
                              />
                            ) : (
                              <NFTAuctionCard
                                key={`a-${tid}`}
                                warrior={item.warrior}
                                auction={item.auction}
                                onBid={() => setBidModalToken(tid)}
                                onCancel={handleCancelAuction}
                                buying={pending}
                                connectedAddress={address}
                                compact={isCompact}
                              />
                            );
                          })}
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
                      ) : (myListings.length + myAuctions.length) === 0 ? (
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
                        <div className={gridClass}>
                          {myListings.map((tokenId) => {
                            const warrior = warriorsData.get(tokenId);
                            const listing = listingsData.get(tokenId);
                            if (!listing) return null;
                            const el = warrior ? getElement(warrior.element) : null;
                            return (
                              <motion.div
                                key={`listing-${tokenId}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm overflow-hidden"
                              >
                                <Link href={`/marketplace/${tokenId}`} className="block relative">
                                  <div className="relative aspect-square bg-gradient-to-br from-frost-bg to-frost-surface overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`/avalanche/api/metadata/${tokenId}/image${warrior ? `?element=${warrior.element}` : ''}`}
                                      alt={`Warrior #${tokenId}`}
                                      className="w-full h-full object-cover warrior-idle"
                                      style={{ animationDelay: `${(tokenId % 5) * 0.3}s` }}
                                      loading="lazy"
                                    />
                                    {el && (
                                      <div className="absolute top-1.5 left-1.5">
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 font-pixel">
                                          {el.emoji} {el.name}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </Link>
                                <div className="p-2.5">
                                  <h3 className="font-pixel text-[10px] text-white">#{tokenId}</h3>
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.06]">
                                    <span className="font-pixel text-[11px] text-frost-cyan font-bold">
                                      {formatEther(listing.price)} <span className="text-[8px] text-white/40">AVAX</span>
                                    </span>
                                    <button
                                      onClick={() => handleCancelListing(tokenId)}
                                      disabled={pending}
                                      className="text-[9px] font-pixel px-2.5 py-1 rounded-md text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                          {myAuctions.map((tokenId) => {
                            const warrior = warriorsData.get(tokenId);
                            const auction = auctionsData.get(tokenId);
                            if (!auction) return null;
                            const el = warrior ? getElement(warrior.element) : null;
                            return (
                              <motion.div
                                key={`auction-${tokenId}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-xl border border-white/[0.06] bg-frost-card/60 backdrop-blur-sm overflow-hidden"
                              >
                                <Link href={`/marketplace/${tokenId}`} className="block relative">
                                  <div className="relative aspect-square bg-gradient-to-br from-frost-bg to-frost-surface overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`/avalanche/api/metadata/${tokenId}/image${warrior ? `?element=${warrior.element}` : ''}`}
                                      alt={`Warrior #${tokenId}`}
                                      className="w-full h-full object-cover warrior-idle"
                                      style={{ animationDelay: `${(tokenId % 5) * 0.3}s` }}
                                      loading="lazy"
                                    />
                                    {el && (
                                      <div className="absolute top-1.5 left-1.5">
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm border border-white/10 font-pixel">
                                          {el.emoji} {el.name}
                                        </span>
                                      </div>
                                    )}
                                    <div className="absolute top-1.5 right-1.5">
                                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-frost-purple/60 backdrop-blur-sm border border-frost-purple/30 font-pixel text-white">
                                        Auction
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                                <div className="p-2.5">
                                  <h3 className="font-pixel text-[10px] text-white">#{tokenId}</h3>
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.06]">
                                    <div>
                                      <span className="font-pixel text-[11px] text-frost-purple font-bold">
                                        {formatEther(auction.highestBid > BigInt(0) ? auction.highestBid : auction.startPrice)} <span className="text-[8px] text-white/40">AVAX</span>
                                      </span>
                                      <div className="text-[8px] text-white/30 mt-0.5">
                                        <Clock className="inline h-2 w-2 mr-0.5" />{timeRemaining(auction.endTime)}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleCancelAuction(tokenId)}
                                      disabled={pending}
                                      className="text-[9px] font-pixel px-2.5 py-1 rounded-md text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-colors disabled:opacity-50"
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
                                          src={`/avalanche/api/metadata/${sale.tokenId}/image`}
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
                                      sale.type === 'auction' ? 'bg-frost-purple/20 text-frost-purple'
                                        : sale.type === 'listing' ? 'bg-frost-cyan/20 text-frost-cyan'
                                        : 'bg-frost-green/20 text-frost-green'
                                    )}>
                                      {sale.type === 'auction' ? 'Auction' : sale.type === 'listing' ? 'Listed' : 'Sale'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-pixel text-xs text-white">{sale.price} AVAX</td>
                                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell font-mono text-xs">{shortenAddress(sale.seller)}</td>
                                  <td className="px-4 py-3 text-white/40 hidden sm:table-cell font-mono text-xs">{sale.buyer ? shortenAddress(sale.buyer) : '\u2014'}</td>
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
              className="fixed left-0 top-0 bottom-0 w-[280px] sm:w-[300px] z-50 bg-frost-bg border-r border-white/[0.06] overflow-y-auto pt-4 lg:hidden"
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
