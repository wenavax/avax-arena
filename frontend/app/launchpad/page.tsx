'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Rocket, Search, Flame, GraduationCap, Plus, Loader2, TrendingUp, Clock, BarChart3 } from 'lucide-react';
import { useReadContract, useReadContracts } from 'wagmi';
import { erc20Abi, formatEther } from 'viem';
import { cn } from '@/lib/utils';
import TokenAvatar from '@/components/launchpad/TokenAvatar';
import {
  LAUNCHPAD_FACTORY_ADDRESS,
  LAUNCHPAD_FACTORY_ABI,
  BONDING_POOL_ABI,
  POOL_STATE_GRADUATED,
  spotPrice,
  graduationProgressPct,
  formatCompact,
  formatPrice,
  shortAddr,
  type LaunchMeta,
  LAUNCHPAD_CHAIN_ID, LAUNCHPAD_EXPLORER,
} from '@/lib/launchpad';

const MAX_LISTED = 60;
const READS_PER_LAUNCH = 8;

interface TokenRow {
  id: number;
  token: `0x${string}`;
  pool: `0x${string}`;
  creator: `0x${string}`;
  name: string;
  symbol: string;
  graduated: boolean;
  priceAvax: number;
  fdvAvax: number;
  raisedAvax: number;
  progressPct: number;
  description: string;
  vol24h: number;
}

export default function LaunchpadPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'live' | 'graduated'>('all');
  const [sort, setSort] = useState<'new' | 'trending' | 'mcap'>('new');
  const [meta, setMeta] = useState<Record<string, LaunchMeta>>({});

  const { data: launchCount, isLoading: countLoading } = useReadContract({
    address: LAUNCHPAD_FACTORY_ADDRESS,
    abi: LAUNCHPAD_FACTORY_ABI,
    functionName: 'launchCount',
    chainId: LAUNCHPAD_CHAIN_ID,
    query: { refetchInterval: 15_000 },
  });

  // Launch descriptions live only in TokenLaunched events — served by our indexer API.
  useEffect(() => {
    fetch('/avalanche/api/launchpad/tokens')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.tokens) return;
        const byPool: Record<string, LaunchMeta> = {};
        for (const t of d.tokens as LaunchMeta[]) byPool[t.pool.toLowerCase()] = t;
        setMeta(byPool);
      })
      .catch(() => {});
  }, [launchCount]);

  const total = launchCount !== undefined ? Number(launchCount) : 0;
  const listed = Math.min(total, MAX_LISTED);

  const launchContracts = useMemo(
    () =>
      Array.from({ length: listed }, (_, k) => ({
        address: LAUNCHPAD_FACTORY_ADDRESS,
        abi: LAUNCHPAD_FACTORY_ABI,
        functionName: 'launches' as const,
        args: [BigInt(total - 1 - k)] as const, // newest first
        chainId: LAUNCHPAD_CHAIN_ID,
      })),
    [total, listed]
  );

  const { data: launchResults } = useReadContracts({
    contracts: launchContracts,
    query: { enabled: launchContracts.length > 0 },
  });

  const launches = useMemo(() => {
    if (!launchResults) return [];
    return launchResults
      .map((r, k) => {
        if (r.status !== 'success' || !r.result) return null;
        const [token, pool, creator] = r.result as readonly [`0x${string}`, `0x${string}`, `0x${string}`];
        return { id: total - 1 - k, token, pool, creator };
      })
      .filter(Boolean) as { id: number; token: `0x${string}`; pool: `0x${string}`; creator: `0x${string}` }[];
  }, [launchResults, total]);

  const statContracts = useMemo(
    () =>
      launches.flatMap((l) => [
        { address: l.pool, abi: BONDING_POOL_ABI, functionName: 'state' as const, chainId: LAUNCHPAD_CHAIN_ID },
        { address: l.pool, abi: BONDING_POOL_ABI, functionName: 'realAvax' as const, chainId: LAUNCHPAD_CHAIN_ID },
        { address: l.pool, abi: BONDING_POOL_ABI, functionName: 'graduationThreshold' as const, chainId: LAUNCHPAD_CHAIN_ID },
        { address: l.pool, abi: BONDING_POOL_ABI, functionName: 'vAvax0' as const, chainId: LAUNCHPAD_CHAIN_ID },
        { address: l.pool, abi: BONDING_POOL_ABI, functionName: 'y0' as const, chainId: LAUNCHPAD_CHAIN_ID },
        { address: l.token, abi: erc20Abi, functionName: 'name' as const, chainId: LAUNCHPAD_CHAIN_ID },
        { address: l.token, abi: erc20Abi, functionName: 'symbol' as const, chainId: LAUNCHPAD_CHAIN_ID },
        { address: l.token, abi: erc20Abi, functionName: 'totalSupply' as const, chainId: LAUNCHPAD_CHAIN_ID },
      ]),
    [launches]
  );

  const { data: statResults, isLoading: statsLoading } = useReadContracts({
    contracts: statContracts,
    query: { enabled: statContracts.length > 0, refetchInterval: 15_000 },
  });

  const rows = useMemo<TokenRow[]>(() => {
    if (!statResults) return [];
    return launches
      .map((l, i) => {
        const base = i * READS_PER_LAUNCH;
        const get = (j: number) => {
          const r = statResults[base + j];
          return r?.status === 'success' ? r.result : undefined;
        };
        const state = get(0) as number | undefined;
        const realAvax = get(1) as bigint | undefined;
        const threshold = get(2) as bigint | undefined;
        const vAvax0 = get(3) as bigint | undefined;
        const y0 = get(4) as bigint | undefined;
        const name = get(5) as string | undefined;
        const symbol = get(6) as string | undefined;
        const totalSupply = get(7) as bigint | undefined;
        if (
          state === undefined || realAvax === undefined || threshold === undefined ||
          vAvax0 === undefined || y0 === undefined || !name || !symbol || totalSupply === undefined
        ) {
          return null;
        }
        const price = spotPrice(vAvax0, y0, realAvax);
        return {
          id: l.id,
          token: l.token,
          pool: l.pool,
          creator: l.creator,
          name,
          symbol,
          graduated: state === POOL_STATE_GRADUATED,
          priceAvax: price,
          fdvAvax: price * (Number(totalSupply) / 1e18),
          raisedAvax: Number(formatEther(realAvax)),
          progressPct: graduationProgressPct(realAvax, threshold),
          description: meta[l.pool.toLowerCase()]?.metadata || '',
          vol24h: meta[l.pool.toLowerCase()]?.vol24h ?? 0,
        };
      })
      .filter(Boolean) as TokenRow[];
  }, [launches, statResults, meta]);

  const visible = rows
    .filter((r) => {
      if (filter === 'live' && r.graduated) return false;
      if (filter === 'graduated' && !r.graduated) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q) || r.token.toLowerCase() === q;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'trending') return b.vol24h - a.vol24h || b.id - a.id;
      if (sort === 'mcap') return b.fdvAvax - a.fdvAvax;
      return b.id - a.id;
    });

  const isLoading = countLoading || (total > 0 && statsLoading && rows.length === 0);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen py-8 lg:py-12 max-w-5xl mx-auto w-full">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Rocket className="w-7 h-7 text-frost-primary" />
              <h1 className="font-display text-3xl lg:text-4xl font-bold gradient-text">Launchpad</h1>
            </div>
            <p className="mt-2 text-sm text-white/50 max-w-lg">
              Launch a token on a fair bonding curve. No presale, no team allocation — when the curve
              raises its target, liquidity graduates to Trader Joe and is burned forever.
            </p>
          </div>
          <Link
            href="/launchpad/launch"
            className="btn-3d btn-3d-red px-6 py-3 text-sm inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Launch Token
          </Link>
        </div>

        {/* Stats strip */}
        <div className="mt-6 grid grid-cols-3 gap-3 max-w-md">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">Launches</div>
            <div className="font-mono text-lg text-white/90">{countLoading ? '…' : total}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">Live</div>
            <div className="font-mono text-lg text-frost-green">{rows.filter((r) => !r.graduated).length}</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">Graduated</div>
            <div className="font-mono text-lg text-frost-gold">{rows.filter((r) => r.graduated).length}</div>
          </div>
        </div>
      </motion.div>

      {/* Search + filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-3 mb-6"
      >
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, symbol or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder-white/20 outline-none focus:border-frost-primary/30 transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { key: 'all', label: 'All', icon: null },
              { key: 'live', label: 'Live', icon: Flame },
              { key: 'graduated', label: 'Graduated', icon: GraduationCap },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all border',
                filter === f.key
                  ? 'bg-frost-primary/20 text-frost-primary border-frost-primary/30'
                  : 'bg-white/[0.04] text-white/50 border-white/[0.06] hover:bg-white/[0.08]'
              )}
            >
              {f.icon && <f.icon className="w-3.5 h-3.5" />}
              {f.label}
            </button>
          ))}
          <div className="w-px bg-white/[0.08] mx-1 hidden sm:block" />
          {(
            [
              { key: 'new', label: 'New', icon: Clock },
              { key: 'trending', label: 'Trending', icon: TrendingUp },
              { key: 'mcap', label: 'MCap', icon: BarChart3 },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all border',
                sort === s.key
                  ? 'bg-frost-green/15 text-frost-green border-frost-green/30'
                  : 'bg-white/[0.04] text-white/50 border-white/[0.06] hover:bg-white/[0.08]'
              )}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Token grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading launches…
        </div>
      ) : visible.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card rounded-2xl p-12 text-center"
        >
          <Rocket className="w-10 h-10 text-white/20 mx-auto mb-4" />
          <div className="font-display text-lg text-white/70 mb-1">
            {total === 0 ? 'No tokens launched yet' : 'Nothing matches your filters'}
          </div>
          {total === 0 && (
            <>
              <p className="text-sm text-white/40 mb-6">Be the first to launch on the Frostbite curve.</p>
              <Link href="/launchpad/launch" className="btn-3d btn-3d-red px-6 py-3 text-sm inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> Launch the first token
              </Link>
            </>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((r, i) => (
            <motion.div
              key={r.pool}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.4) }}
            >
              <Link
                href={`/launchpad/${r.pool}`}
                className="glass-card rounded-2xl p-4 block hover:border-frost-primary/30 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <TokenAvatar address={r.token} symbol={r.symbol} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-white/90 truncate group-hover:text-frost-primary transition-colors">
                        {r.name}
                      </span>
                      {r.graduated && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-frost-gold/10 text-frost-gold border border-frost-gold/20 flex-shrink-0">
                          <GraduationCap className="w-3 h-3" /> DEX
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 font-mono">
                      ${r.symbol} · by {shortAddr(r.creator)}
                    </div>
                  </div>
                </div>

                {r.description && (
                  <p className="mt-3 text-xs text-white/40 line-clamp-2">{r.description}</p>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="text-white/30 text-[10px]">Price</div>
                    <div className="font-mono text-white/80 truncate">{formatPrice(r.priceAvax)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="text-white/30 text-[10px]">MCap</div>
                    <div className="font-mono text-white/80 truncate">{formatCompact(r.fdvAvax)}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="text-white/30 text-[10px]">24h Vol</div>
                    <div className={cn('font-mono truncate', r.vol24h > 0 ? 'text-frost-green' : 'text-white/40')}>
                      {r.vol24h > 0 ? formatCompact(r.vol24h) : '—'}
                    </div>
                  </div>
                </div>

                {/* Graduation progress */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-white/30 mb-1">
                    <span>{r.graduated ? 'Graduated to Trader Joe' : `${formatCompact(r.raisedAvax)} AVAX raised`}</span>
                    <span>{r.graduated ? '100%' : `${r.progressPct.toFixed(1)}%`}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-700',
                        r.graduated
                          ? 'bg-gradient-to-r from-frost-gold to-yellow-300'
                          : 'bg-gradient-to-r from-frost-primary to-frost-secondary'
                      )}
                      style={{ width: `${r.graduated ? 100 : Math.max(r.progressPct, 2)}%` }}
                    />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
