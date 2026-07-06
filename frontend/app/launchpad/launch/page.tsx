'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Rocket, Loader2, AlertTriangle, ShieldCheck, Flame, Droplets, Check } from 'lucide-react';
import { useAccount, useBalance, useReadContract, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { decodeEventLog, formatEther } from 'viem';
import { cn } from '@/lib/utils';
import { ACTIVE_CHAIN_ID, EXPLORER_URL } from '@/lib/constants';
import TokenAvatar from '@/components/launchpad/TokenAvatar';
import { LAUNCHPAD_FACTORY_ADDRESS, LAUNCHPAD_FACTORY_ABI, formatCompact } from '@/lib/launchpad';

export default function LaunchTokenPage() {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [newPool, setNewPool] = useState<string | null>(null);

  const { data: config } = useReadContract({
    address: LAUNCHPAD_FACTORY_ADDRESS,
    abi: LAUNCHPAD_FACTORY_ABI,
    functionName: 'config',
    chainId: 43114,
  });
  const { data: isPaused } = useReadContract({
    address: LAUNCHPAD_FACTORY_ADDRESS,
    abi: LAUNCHPAD_FACTORY_ABI,
    functionName: 'paused',
    chainId: 43114,
  });
  const { data: avaxBalance } = useBalance({ address, chainId: 43114 });

  const launchFee = config?.[0];
  const graduationThreshold = config?.[2];
  const totalSupply = config?.[5];
  const curveSupply = config?.[6];
  const lpReserve = config?.[7];
  const tradingFeeBps = config?.[1];

  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Decode TokenLaunched from the receipt → redirect to the new token page.
  useEffect(() => {
    if (!isSuccess || !receipt) return;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== LAUNCHPAD_FACTORY_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: LAUNCHPAD_FACTORY_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === 'TokenLaunched') {
          const pool = (decoded.args as { pool: `0x${string}` }).pool;
          setNewPool(pool);
          // Nudge the indexer so the description is cached before the list renders.
          fetch('/avalanche/api/launchpad/tokens').catch(() => {});
          const t = setTimeout(() => router.push(`/launchpad/${pool}`), 1600);
          return () => clearTimeout(t);
        }
      } catch {
        /* not TokenLaunched — skip */
      }
    }
  }, [isSuccess, receipt, router]);

  const nameOk = name.trim().length >= 2 && name.trim().length <= 32;
  const symbolOk = /^[A-Z0-9]{2,10}$/.test(symbol);
  const descOk = description.length <= 200;
  const hasFunds =
    launchFee !== undefined && avaxBalance !== undefined
      ? avaxBalance.value >= launchFee + 10_000_000_000_000_000n // fee + 0.01 gas headroom
      : true;

  const buttonState = useMemo(() => {
    if (newPool) return { label: 'Launched! Opening token page…', disabled: true, spinning: false };
    if (isConfirming) return { label: 'Confirming…', disabled: true, spinning: true };
    if (isSubmitting) return { label: 'Confirm in wallet…', disabled: true, spinning: true };
    if (!isConnected) return { label: 'Connect wallet to launch', disabled: true, spinning: false };
    if (isPaused) return { label: 'Launches are paused', disabled: true, spinning: false };
    if (!nameOk) return { label: 'Enter a name (2–32 chars)', disabled: true, spinning: false };
    if (!symbolOk) return { label: 'Enter a symbol (2–10, A–Z 0–9)', disabled: true, spinning: false };
    if (!descOk) return { label: 'Description too long', disabled: true, spinning: false };
    if (!hasFunds) return { label: 'Insufficient AVAX for launch fee', disabled: true, spinning: false };
    if (chainId !== ACTIVE_CHAIN_ID) return { label: 'Switch to Avalanche & Launch', disabled: false, spinning: false };
    return { label: `Launch for ${launchFee !== undefined ? formatEther(launchFee) : '…'} AVAX`, disabled: false, spinning: false };
  }, [newPool, isConfirming, isSubmitting, isConnected, isPaused, nameOk, symbolOk, descOk, hasFunds, chainId, launchFee]);

  async function handleLaunch() {
    setError('');
    if (buttonState.disabled || launchFee === undefined) return;

    if (chainId !== ACTIVE_CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });
      } catch {
        return; // user refused the switch
      }
    }

    setIsSubmitting(true);
    try {
      const hash = await writeContractAsync({
        address: LAUNCHPAD_FACTORY_ADDRESS,
        abi: LAUNCHPAD_FACTORY_ABI,
        functionName: 'createToken',
        args: [name.trim(), symbol, description.trim()],
        value: launchFee,
        chainId: 43114,
      });
      setTxHash(hash);
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      const msg = e.shortMessage || e.message || 'Launch failed';
      if (!/rejected|denied/i.test(msg)) setError(msg.slice(0, 140));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen flex flex-col items-center py-8 lg:py-12">
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Link
            href="/launchpad"
            className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Launchpad
          </Link>

          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-5">
              <TokenAvatar address={`0xpreview${name}${symbol}`} symbol={symbol || name} size={44} />
              <div>
                <h1 className="font-display text-xl font-bold text-white/90">Launch a Token</h1>
                <p className="text-xs text-white/40">Fair launch on the Frostbite bonding curve</p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">Name</label>
                <input
                  type="text"
                  placeholder="Frost Doge"
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder-white/20 outline-none focus:border-frost-primary/30 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">Symbol</label>
                <input
                  type="text"
                  placeholder="FDOGE"
                  value={symbol}
                  maxLength={10}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder-white/20 outline-none focus:border-frost-primary/30 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/30 font-pixel">
                  Description <span className="text-white/20 normal-case">(optional, stored on-chain)</span>
                </label>
                <textarea
                  placeholder="What is this token about?"
                  value={description}
                  maxLength={200}
                  rows={3}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder-white/20 outline-none focus:border-frost-primary/30 transition-colors resize-none"
                />
                <div className="text-right text-[10px] text-white/20">{description.length}/200</div>
              </div>
            </div>

            {/* Fair-launch guarantees */}
            <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-2 text-xs">
              <div className="flex items-center gap-2 text-white/60">
                <ShieldCheck className="w-3.5 h-3.5 text-frost-green flex-shrink-0" />
                Fixed supply of {totalSupply !== undefined ? formatCompact(Number(formatEther(totalSupply))) : '1B'} — no
                mint, no owner, no blacklist
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <Flame className="w-3.5 h-3.5 text-frost-orange flex-shrink-0" />
                {curveSupply !== undefined ? formatCompact(Number(formatEther(curveSupply))) : '800M'} sold on the curve ·{' '}
                {tradingFeeBps !== undefined ? Number(tradingFeeBps) / 100 : 1}% trading fee
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <Droplets className="w-3.5 h-3.5 text-frost-primary flex-shrink-0" />
                At {graduationThreshold !== undefined ? formatEther(graduationThreshold) : '60'} AVAX raised:{' '}
                {lpReserve !== undefined ? formatCompact(Number(formatEther(lpReserve))) : '200M'} + reserves become
                Trader Joe LP, burned forever
              </div>
            </div>

            {/* Launch button */}
            <button
              onClick={handleLaunch}
              disabled={buttonState.disabled}
              className={cn(
                'btn-3d w-full mt-4 py-4 text-sm inline-flex items-center justify-center gap-2',
                buttonState.disabled ? 'btn-3d-red opacity-40 cursor-not-allowed' : 'btn-3d-red'
              )}
            >
              {buttonState.spinning && <Loader2 className="w-4 h-4 animate-spin" />}
              {newPool && <Check className="w-4 h-4" />}
              {!buttonState.spinning && !newPool && <Rocket className="w-4 h-4" />}
              {buttonState.label}
            </button>

            {/* Success */}
            {txHash && (isConfirming || newPool) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-green-500/5 border border-green-500/10"
              >
                {newPool ? (
                  <Check className="w-4 h-4 text-frost-green flex-shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-frost-green animate-spin flex-shrink-0" />
                )}
                <span className="text-xs text-frost-green flex-1">
                  {newPool ? 'Token launched!' : 'Transaction submitted…'}
                </span>
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
          </div>
        </motion.div>
      </div>
    </div>
  );
}
