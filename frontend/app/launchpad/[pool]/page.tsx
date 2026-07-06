'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Loader2, AlertTriangle, Check, GraduationCap, ExternalLink, Copy,
  TrendingUp, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  useAccount, useBalance, usePublicClient, useReadContracts, useSwitchChain,
  useWaitForTransactionReceipt, useWriteContract,
} from 'wagmi';
import { erc20Abi, formatEther, parseEther } from 'viem';
import { cn } from '@/lib/utils';
import { ACTIVE_CHAIN_ID, EXPLORER_URL } from '@/lib/constants';
import TokenAvatar from '@/components/launchpad/TokenAvatar';
import {
  BONDING_POOL_ABI, POOL_STATE_GRADUATED,
  quoteBuy, quoteSell, spotPrice, curveExhaustionAvax, graduationProgressPct,
  formatCompact, formatPrice, shortAddr, traderJoeUrl, type LaunchMeta,
} from '@/lib/launchpad';

const SLIPPAGE_OPTIONS = [50, 100, 200, 500] as const; // bps
const DEADLINE_SECONDS = 300;

interface Trade {
  type: 'buy' | 'sell';
  account: string;
  avax: bigint;
  tokens: bigint;
  txHash: string;
  blockNumber: bigint;
}

export default function TokenDetailPage() {
  const params = useParams<{ pool: string }>();
  const pool = (params?.pool || '') as `0x${string}`;
  const validPool = /^0x[0-9a-fA-F]{40}$/.test(pool);

  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: 43114 });

  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'idle' | 'approving' | 'signing'>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [meta, setMeta] = useState<LaunchMeta | null>(null);
  const [copied, setCopied] = useState(false);

  /* ------------------------------- Pool reads ------------------------------ */
  const poolReads = useMemo(
    () =>
      validPool
        ? (['token', 'state', 'realAvax', 'tokensSold', 'graduationThreshold', 'vAvax0', 'y0', 'tradingFeeBps', 'curveSupply'] as const).map(
            (functionName) => ({ address: pool, abi: BONDING_POOL_ABI, functionName, chainId: 43114 as const })
          )
        : [],
    [pool, validPool]
  );
  const { data: poolData, isLoading: poolLoading, refetch: refetchPool } = useReadContracts({
    contracts: poolReads,
    query: { enabled: poolReads.length > 0, refetchInterval: 10_000 },
  });

  const pd = useMemo(() => {
    if (!poolData || poolData.some((r) => r.status !== 'success')) return null;
    return {
      token: poolData[0].result as `0x${string}`,
      state: poolData[1].result as number,
      realAvax: poolData[2].result as bigint,
      tokensSold: poolData[3].result as bigint,
      graduationThreshold: poolData[4].result as bigint,
      vAvax0: poolData[5].result as bigint,
      y0: poolData[6].result as bigint,
      tradingFeeBps: BigInt(poolData[7].result as number),
      curveSupply: poolData[8].result as bigint,
    };
  }, [poolData]);

  const tokenReads = useMemo(
    () =>
      pd
        ? [
            { address: pd.token, abi: erc20Abi, functionName: 'name' as const, chainId: 43114 as const },
            { address: pd.token, abi: erc20Abi, functionName: 'symbol' as const, chainId: 43114 as const },
            { address: pd.token, abi: erc20Abi, functionName: 'totalSupply' as const, chainId: 43114 as const },
            ...(address
              ? [
                  { address: pd.token, abi: erc20Abi, functionName: 'balanceOf' as const, args: [address] as const, chainId: 43114 as const },
                  { address: pd.token, abi: erc20Abi, functionName: 'allowance' as const, args: [address, pool] as const, chainId: 43114 as const },
                ]
              : []),
          ]
        : [],
    [pd, address, pool]
  );
  const { data: tokenData, refetch: refetchToken } = useReadContracts({
    contracts: tokenReads,
    query: { enabled: tokenReads.length > 0, refetchInterval: 10_000 },
  });

  const td = useMemo(() => {
    if (!tokenData || tokenData.length < 3 || tokenData.slice(0, 3).some((r) => r.status !== 'success')) return null;
    return {
      name: tokenData[0].result as string,
      symbol: tokenData[1].result as string,
      totalSupply: tokenData[2].result as bigint,
      balance: tokenData[3]?.status === 'success' ? (tokenData[3].result as bigint) : 0n,
      allowance: tokenData[4]?.status === 'success' ? (tokenData[4].result as bigint) : 0n,
    };
  }, [tokenData]);

  const { data: avaxBalance, refetch: refetchAvax } = useBalance({ address, chainId: 43114 });

  /* ------------------------- Metadata + trades feed ------------------------ */
  useEffect(() => {
    if (!validPool) return;
    fetch('/avalanche/api/launchpad/tokens')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const row = (d?.tokens as LaunchMeta[] | undefined)?.find((t) => t.pool.toLowerCase() === pool.toLowerCase());
        if (row) setMeta(row);
      })
      .catch(() => {});
  }, [pool, validPool]);

  const loadTrades = useCallback(async () => {
    if (!publicClient || !validPool) return;
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > 2000n ? latest - 2000n : 0n;
      const logs = await publicClient.getLogs({
        address: pool,
        events: BONDING_POOL_ABI.filter((i) => i.type === 'event' && (i.name === 'Buy' || i.name === 'Sell')),
        fromBlock,
        toBlock: latest,
      });
      const parsed: Trade[] = logs
        .map((log) => {
          const l = log as unknown as {
            eventName: string;
            args: Record<string, unknown>;
            transactionHash: string;
            blockNumber: bigint;
          };
          if (l.eventName === 'Buy') {
            return {
              type: 'buy' as const,
              account: l.args.buyer as string,
              avax: l.args.avaxIn as bigint,
              tokens: l.args.tokensOut as bigint,
              txHash: l.transactionHash,
              blockNumber: l.blockNumber,
            };
          }
          return {
            type: 'sell' as const,
            account: l.args.seller as string,
            avax: l.args.avaxOut as bigint,
            tokens: l.args.tokensIn as bigint,
            txHash: l.transactionHash,
            blockNumber: l.blockNumber,
          };
        })
        .reverse()
        .slice(0, 25);
      setTrades(parsed);
    } catch {
      /* recent-trades feed is best-effort */
    }
  }, [publicClient, pool, validPool]);

  useEffect(() => {
    loadTrades();
    const t = setInterval(loadTrades, 20_000);
    return () => clearInterval(t);
  }, [loadTrades]);

  /* --------------------------------- Quote --------------------------------- */
  const graduated = pd?.state === POOL_STATE_GRADUATED;
  const price = pd ? spotPrice(pd.vAvax0, pd.y0, pd.realAvax) : 0;
  const progressPct = pd ? graduationProgressPct(pd.realAvax, pd.graduationThreshold) : 0;

  const amountWei = useMemo(() => {
    try {
      return amount ? parseEther(amount as `${number}`) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const quote = useMemo(() => {
    if (!pd || amountWei <= 0n || graduated) return null;
    const p = { vAvax0: pd.vAvax0, y0: pd.y0, realAvax: pd.realAvax, feeBps: pd.tradingFeeBps };
    if (tab === 'buy') {
      const { tokensOut, fee } = quoteBuy(amountWei, p);
      const exceedsCurve = pd.tokensSold + tokensOut > pd.curveSupply;
      const minOut = (tokensOut * BigInt(10_000 - slippageBps)) / 10_000n;
      const execPrice = tokensOut > 0n ? Number(formatEther(amountWei - fee)) / Number(formatEther(tokensOut)) : 0;
      const impactPct = price > 0 && execPrice > 0 ? (execPrice / price - 1) * 100 : 0;
      return { out: tokensOut, fee, minOut, impactPct, exceedsCurve, exceedsSold: false };
    }
    const { net, fee } = quoteSell(amountWei, p);
    const exceedsSold = amountWei > pd.tokensSold;
    const minOut = (net * BigInt(10_000 - slippageBps)) / 10_000n;
    const execPrice = amountWei > 0n ? Number(formatEther(net + fee)) / Number(formatEther(amountWei)) : 0;
    const impactPct = price > 0 && execPrice > 0 ? (execPrice / price - 1) * 100 : 0;
    return { out: net, fee, minOut, impactPct, exceedsCurve: false, exceedsSold };
  }, [pd, amountWei, tab, slippageBps, graduated, price]);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!isConfirmed) return;
    setAmount('');
    refetchPool();
    refetchToken();
    refetchAvax();
    loadTrades();
    const t = setTimeout(() => setTxHash(undefined), 6000);
    return () => clearTimeout(t);
  }, [isConfirmed, refetchPool, refetchToken, refetchAvax, loadTrades]);

  const needsApproval = tab === 'sell' && td !== null && amountWei > 0n && td.allowance < amountWei;

  const buttonState = useMemo(() => {
    if (graduated) return { label: 'Trading moved to Trader Joe', disabled: true, spinning: false };
    if (step === 'approving') return { label: `Approving ${td?.symbol ?? ''}…`, disabled: true, spinning: true };
    if (step === 'signing') return { label: 'Confirm in wallet…', disabled: true, spinning: true };
    if (isConfirming) return { label: 'Confirming…', disabled: true, spinning: true };
    if (!isConnected) return { label: 'Connect wallet to trade', disabled: true, spinning: false };
    if (amountWei <= 0n) return { label: 'Enter an amount', disabled: true, spinning: false };
    if (tab === 'buy' && avaxBalance !== undefined && amountWei > avaxBalance.value)
      return { label: 'Insufficient AVAX balance', disabled: true, spinning: false };
    if (tab === 'sell' && td !== null && amountWei > td.balance)
      return { label: `Insufficient ${td.symbol} balance`, disabled: true, spinning: false };
    if (quote?.exceedsCurve) return { label: 'Amount exceeds remaining curve supply', disabled: true, spinning: false };
    if (quote?.exceedsSold) return { label: 'Amount exceeds tokens sold on curve', disabled: true, spinning: false };
    if (chainId !== ACTIVE_CHAIN_ID) return { label: 'Switch to Avalanche & Trade', disabled: false, spinning: false };
    if (needsApproval) return { label: `Approve & ${tab === 'buy' ? 'Buy' : 'Sell'}`, disabled: false, spinning: false };
    return { label: tab === 'buy' ? `Buy ${td?.symbol ?? ''}` : `Sell ${td?.symbol ?? ''}`, disabled: false, spinning: false };
  }, [graduated, step, isConfirming, isConnected, amountWei, tab, avaxBalance, td, quote, chainId, needsApproval]);

  async function handleTrade() {
    setError('');
    if (buttonState.disabled || !pd || !quote || amountWei <= 0n) return;

    if (chainId !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return;
      }
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
    try {
      if (tab === 'sell' && needsApproval && publicClient) {
        setStep('approving');
        const approveHash = await writeContractAsync({
          address: pd.token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [pool, amountWei],
          chainId: 43114,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setStep('signing');
      const hash =
        tab === 'buy'
          ? await writeContractAsync({
              address: pool,
              abi: BONDING_POOL_ABI,
              functionName: 'buy',
              args: [quote.minOut, deadline],
              value: amountWei,
              chainId: 43114,
            })
          : await writeContractAsync({
              address: pool,
              abi: BONDING_POOL_ABI,
              functionName: 'sell',
              args: [amountWei, quote.minOut, deadline],
              chainId: 43114,
            });
      setTxHash(hash);
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      const msg = e.shortMessage || e.message || 'Transaction failed';
      if (!/rejected|denied/i.test(msg)) {
        if (/Slippage/i.test(msg)) setError('Price moved beyond your slippage tolerance — try again.');
        else if (/Expired/i.test(msg)) setError('Transaction deadline passed — try again.');
        else if (/NotTrading/i.test(msg)) setError('This token has graduated — trade on Trader Joe.');
        else setError(msg.slice(0, 140));
      }
    } finally {
      setStep('idle');
    }
  }

  function setMax() {
    if (tab === 'buy') {
      if (avaxBalance === undefined) return;
      const headroom = parseEther('0.02');
      const max = avaxBalance.value > headroom ? avaxBalance.value - headroom : 0n;
      setAmount(formatEther(max));
    } else if (td) {
      setAmount(formatEther(td.balance));
    }
  }

  function copyAddress() {
    if (!pd) return;
    navigator.clipboard?.writeText(pd.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  /* ------------------------------ Curve chart ------------------------------ */
  const chart = useMemo(() => {
    if (!pd) return null;
    const exhaustion = curveExhaustionAvax(pd.vAvax0, pd.y0, pd.curveSupply);
    const xMaxWei = pd.graduationThreshold < exhaustion ? (pd.graduationThreshold * 115n) / 100n : exhaustion;
    const xMax = Number(formatEther(xMaxWei));
    if (xMax <= 0) return null;
    const priceAt = (x: number) => {
      const v = Number(formatEther(pd.vAvax0));
      const y = Number(formatEther(pd.y0));
      return (v + x) ** 2 / (v * y);
    };
    const N = 64;
    const pts = Array.from({ length: N + 1 }, (_, i) => {
      const x = (xMax * i) / N;
      return { x, p: priceAt(x) };
    });
    const pMax = pts[N].p;
    const W = 100;
    const H = 40;
    const toSvg = (pt: { x: number; p: number }) => `${(pt.x / xMax) * W},${H - (pt.p / pMax) * (H - 4) - 2}`;
    const cur = Number(formatEther(pd.realAvax));
    const curClamped = Math.min(cur, xMax);
    const gradX = (Number(formatEther(pd.graduationThreshold)) / xMax) * W;
    return {
      line: pts.map(toSvg).join(' '),
      fill: `0,${H} ${pts.filter((pt) => pt.x <= curClamped).map(toSvg).join(' ')} ${(curClamped / xMax) * W},${H}`,
      curX: (curClamped / xMax) * W,
      curY: H - (priceAt(curClamped) / pMax) * (H - 4) - 2,
      gradX: Math.min(gradX, W),
      W,
      H,
    };
  }, [pd]);

  /* --------------------------------- Render -------------------------------- */
  if (!validPool) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-white/40 text-sm gap-4">
        Invalid pool address.
        <Link href="/launchpad" className="text-frost-primary hover:underline">← Back to Launchpad</Link>
      </div>
    );
  }

  if (poolLoading || !pd || !td) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-white/40">
        <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading token…
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen py-8 lg:py-12 max-w-5xl mx-auto w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link
          href="/launchpad"
          className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Launchpad
        </Link>

        {/* Header */}
        <div className="glass-card rounded-2xl p-5 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <TokenAvatar address={pd.token} symbol={td.symbol} size={52} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-2xl font-bold text-white/90 truncate">{td.name}</h1>
                  <span className="text-sm font-mono text-white/40">${td.symbol}</span>
                  {graduated && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-frost-gold/10 text-frost-gold border border-frost-gold/20">
                      <GraduationCap className="w-3 h-3" /> Graduated
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                  <button onClick={copyAddress} className="flex items-center gap-1 hover:text-white/70 transition-colors font-mono">
                    {shortAddr(pd.token)} {copied ? <Check className="w-3 h-3 text-frost-green" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <a
                    href={`${EXPLORER_URL}/address/${pd.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-white/70 transition-colors"
                  >
                    Snowtrace <ExternalLink className="w-3 h-3" />
                  </a>
                  {meta && <span className="hidden sm:inline">· by {shortAddr(meta.creator)}</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">Price</div>
                <div className="font-mono text-sm text-white/90">{formatPrice(price)}</div>
                <div className="text-[10px] text-white/30">AVAX</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">MCap</div>
                <div className="font-mono text-sm text-white/90">{formatCompact(price * (Number(td.totalSupply) / 1e18))}</div>
                <div className="text-[10px] text-white/30">AVAX</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">Raised</div>
                <div className="font-mono text-sm text-white/90">{formatCompact(Number(formatEther(pd.realAvax)))}</div>
                <div className="text-[10px] text-white/30">AVAX</div>
              </div>
            </div>
          </div>

          {meta?.metadata && <p className="mt-3 text-sm text-white/50">{meta.metadata}</p>}

          {/* Graduation progress */}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-white/40 mb-1">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {graduated
                  ? 'Graduated — liquidity locked on Trader Joe forever'
                  : `Graduation at ${formatEther(pd.graduationThreshold)} AVAX`}
              </span>
              <span className="font-mono">{graduated ? '100%' : `${progressPct.toFixed(1)}%`}</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  graduated
                    ? 'bg-gradient-to-r from-frost-gold to-yellow-300'
                    : 'bg-gradient-to-r from-frost-primary to-frost-secondary'
                )}
                style={{ width: `${graduated ? 100 : Math.max(progressPct, 1)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: chart + trades */}
          <div className="lg:col-span-3 space-y-4">
            {/* Bonding curve chart */}
            {chart && (
              <div className="glass-card rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel mb-3">Bonding Curve</div>
                <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full h-40" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(237,47,57)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="rgb(237,47,57)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <polygon points={chart.fill} fill="url(#curveFill)" />
                  <polyline points={chart.line} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
                  <line
                    x1={chart.gradX} y1="0" x2={chart.gradX} y2={chart.H}
                    stroke="rgba(245,197,66,0.5)" strokeWidth="0.4" strokeDasharray="1.5,1.5"
                  />
                  <circle cx={chart.curX} cy={chart.curY} r="1.6" fill="rgb(237,47,57)">
                    <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                </svg>
                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                  <span>0 AVAX</span>
                  <span className="text-frost-gold/70">graduation ▲</span>
                  <span>price ↑ along curve</span>
                </div>
              </div>
            )}

            {/* Recent trades */}
            <div className="glass-card rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/30 font-pixel mb-3">Recent Trades</div>
              {trades.length === 0 ? (
                <div className="text-xs text-white/30 py-6 text-center">No trades in the recent window yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
                  {trades.map((t) => (
                    <a
                      key={`${t.txHash}-${t.type}-${t.tokens}`}
                      href={`${EXPLORER_URL}/tx/${t.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.03] hover:border-white/[0.1] transition-colors text-xs"
                    >
                      {t.type === 'buy' ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-frost-green flex-shrink-0" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      )}
                      <span className={cn('font-semibold w-8', t.type === 'buy' ? 'text-frost-green' : 'text-red-400')}>
                        {t.type === 'buy' ? 'Buy' : 'Sell'}
                      </span>
                      <span className="font-mono text-white/70">{formatCompact(Number(formatEther(t.tokens)))} {td.symbol}</span>
                      <span className="text-white/30 flex-1 text-right font-mono">{Number(formatEther(t.avax)).toFixed(4)} AVAX</span>
                      <span className="text-white/30 font-mono hidden sm:inline">{shortAddr(t.account)}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: trade panel */}
          <div className="lg:col-span-2">
            <div className="glass-card rounded-2xl p-4 sticky top-4">
              {graduated ? (
                <div className="text-center py-6">
                  <GraduationCap className="w-10 h-10 text-frost-gold mx-auto mb-3" />
                  <div className="font-display text-lg text-white/90 mb-1">Graduated!</div>
                  <p className="text-xs text-white/40 mb-5 px-2">
                    The bonding curve is complete. Liquidity is permanently locked on Trader Joe — trade there.
                  </p>
                  <a
                    href={traderJoeUrl(pd.token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-3d btn-3d-gold w-full py-3.5 text-sm inline-flex items-center justify-center gap-2"
                  >
                    Trade on Trader Joe <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ) : (
                <>
                  {/* Buy / Sell tabs */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {(['buy', 'sell'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTab(t); setAmount(''); setError(''); }}
                        className={cn(
                          'py-2.5 rounded-xl text-sm font-semibold uppercase tracking-wide transition-all border',
                          tab === t
                            ? t === 'buy'
                              ? 'bg-frost-green/15 text-frost-green border-frost-green/30'
                              : 'bg-red-500/15 text-red-400 border-red-500/30'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-white/[0.08]'
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Amount input */}
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <div className="flex justify-between text-[10px] text-white/30 mb-2">
                      <span>{tab === 'buy' ? 'You pay (AVAX)' : `You sell (${td.symbol})`}</span>
                      <button onClick={setMax} className="text-frost-primary/70 hover:text-frost-primary transition-colors uppercase">
                        Max ·{' '}
                        {tab === 'buy'
                          ? formatCompact(avaxBalance ? Number(formatEther(avaxBalance.value)) : 0)
                          : formatCompact(Number(formatEther(td.balance)))}
                      </button>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        if (val.split('.').length <= 2) setAmount(val);
                      }}
                      className="w-full bg-transparent text-2xl font-semibold text-white/90 outline-none placeholder-white/20 font-mono"
                    />
                  </div>

                  {/* Quote */}
                  <AnimatePresence>
                    {quote && amountWei > 0n && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-white/40">{tab === 'buy' ? 'You receive' : 'You receive'}</span>
                            <span className="font-mono text-white/80">
                              {formatCompact(Number(formatEther(quote.out)))} {tab === 'buy' ? td.symbol : 'AVAX'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/40">Fee ({Number(pd.tradingFeeBps) / 100}%)</span>
                            <span className="font-mono text-white/60">{Number(formatEther(quote.fee)).toFixed(5)} AVAX</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/40">Price impact</span>
                            <span className={cn('font-mono', Math.abs(quote.impactPct) > 5 ? 'text-frost-orange' : 'text-white/60')}>
                              {quote.impactPct >= 0 ? '+' : ''}{quote.impactPct.toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/40">Min received ({(slippageBps / 100).toFixed(1)}% slip)</span>
                            <span className="font-mono text-white/60">
                              {formatCompact(Number(formatEther(quote.minOut)))} {tab === 'buy' ? td.symbol : 'AVAX'}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Slippage */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] text-white/30 uppercase tracking-wider">Slippage</span>
                    {SLIPPAGE_OPTIONS.map((bps) => (
                      <button
                        key={bps}
                        onClick={() => setSlippageBps(bps)}
                        className={cn(
                          'px-2 py-1 rounded-lg text-[11px] font-mono transition-all border',
                          slippageBps === bps
                            ? 'bg-frost-primary/20 text-frost-primary border-frost-primary/30'
                            : 'bg-white/[0.04] text-white/40 border-white/[0.06] hover:bg-white/[0.08]'
                        )}
                      >
                        {(bps / 100).toFixed(1)}%
                      </button>
                    ))}
                  </div>

                  {/* Trade button */}
                  <button
                    onClick={handleTrade}
                    disabled={buttonState.disabled}
                    className={cn(
                      'btn-3d w-full mt-4 py-4 text-sm inline-flex items-center justify-center gap-2',
                      buttonState.disabled
                        ? 'btn-3d-red opacity-40 cursor-not-allowed'
                        : tab === 'buy'
                          ? 'btn-3d-green'
                          : 'btn-3d-red'
                    )}
                  >
                    {buttonState.spinning && <Loader2 className="w-4 h-4 animate-spin" />}
                    {buttonState.label}
                  </button>

                  {/* Success */}
                  <AnimatePresence>
                    {txHash && isConfirmed && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-green-500/5 border border-green-500/10"
                      >
                        <Check className="w-4 h-4 text-frost-green flex-shrink-0" />
                        <span className="text-xs text-frost-green flex-1">Trade successful!</span>
                        <a
                          href={`${EXPLORER_URL}/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-white/40 hover:text-white/70 underline"
                        >
                          Snowtrace
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Error */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs"
                    >
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{error}</span>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
