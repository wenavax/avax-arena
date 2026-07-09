'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Search, Loader2, AlertTriangle, Snowflake, Sparkles, Trophy, Share2, ImageIcon, Check, Link2 } from 'lucide-react';
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseAbi } from 'viem';
import { cn } from '@/lib/utils';

const ATTEST_ADDRESS = '0xEFB0409A5698bB04EB11262D8915CfD2c68B68d5' as `0x${string}`;
const ATTEST_ABI = parseAbi(['function attest(uint256 score, bytes32 ref) external']);
const ZERO_REF = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
import { badgeFor, BADGES, type WalletScore, type NftTier } from '@/lib/nftScore';
import { shortAddr } from '@/lib/launchpad';
import GameStageBanner from '@/components/GameStageBanner';

const TIER_COLORS: Record<NftTier, string> = {
  FROST: 'text-frost-primary border-frost-primary/30 bg-frost-primary/10',
  S: 'text-frost-gold border-frost-gold/30 bg-frost-gold/10',
  A: 'text-frost-green border-frost-green/30 bg-frost-green/10',
  B: 'text-white/60 border-white/15 bg-white/[0.06]',
  C: 'text-white/35 border-white/10 bg-white/[0.03]',
};

interface LeaderRow {
  wallet: string;
  score: number;
  badge: string;
  totalNfts: number;
}

export default function NftScorePage() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [attestTx, setAttestTx] = useState<`0x${string}` | undefined>();
  const [attesting, setAttesting] = useState(false);
  const { isSuccess: attestConfirmed } = useWaitForTransactionReceipt({ hash: attestTx });
  const [input, setInput] = useState('');
  const [result, setResult] = useState<WalletScore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);

  const loadLeaderboard = useCallback(() => {
    fetch('/avalanche/api/nft-score?leaderboard=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.leaderboard && setLeaders(d.leaderboard))
      .catch(() => {});
  }, []);
  useEffect(loadLeaderboard, [loadLeaderboard]);

  const check = useCallback(
    async (wallet: string) => {
      const w = wallet.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(w)) {
        setError('Enter a valid Avalanche address (0x…)');
        return;
      }
      setError('');
      setIsLoading(true);
      setResult(null);
      try {
        const res = await fetch(`/avalanche/api/nft-score?wallet=${w}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'failed to fetch score');
        setResult(d as WalletScore);
        loadLeaderboard();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch score — try again');
      } finally {
        setIsLoading(false);
      }
    },
    [loadLeaderboard]
  );

  async function attestOnChain() {
    if (!result) return;
    if (chainId !== 43114) {
      try {
        await switchChainAsync({ chainId: 43114 });
      } catch {
        return;
      }
    }
    setAttesting(true);
    try {
      const hash = await writeContractAsync({
        address: ATTEST_ADDRESS,
        abi: ATTEST_ABI,
        functionName: 'attest',
        args: [BigInt(result.score), ZERO_REF],
        chainId: 43114,
      });
      setAttestTx(hash);
    } catch {
      /* user rejected / failed — silent */
    } finally {
      setAttesting(false);
    }
  }

  const badge = result ? badgeFor(result.score) : null;
  const ownWallet = !!address && !!result && result.wallet.toLowerCase() === address.toLowerCase();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen py-8 lg:py-12 max-w-4xl mx-auto w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <GameStageBanner
          stage="BETA"
          message="Beta — the scoring formula is still being tuned; scores, tiers and ranks may change."
        />
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3">
            <Award className="w-7 h-7 text-frost-primary" />
            <h1 className="font-display text-3xl lg:text-4xl font-bold gradient-text">NFT Score</h1>
          </div>
          <p className="mt-2 text-sm text-white/50 max-w-lg mx-auto">
            Rate any Avalanche wallet across 450+ verified collections — floor price × holding age ×
            original-mint bonus, plus Frostbite &amp; diversity multipliers. Verified via Joepegs, no connection needed.
          </p>
        </div>

        {/* Input */}
        <div className="glass-card rounded-2xl p-4 max-w-xl mx-auto">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="0x… wallet address"
                value={input}
                onChange={(e) => setInput(e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && check(input)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 placeholder-white/20 outline-none focus:border-frost-primary/30 transition-colors font-mono"
              />
            </div>
            <button
              onClick={() => check(input)}
              disabled={isLoading}
              className={cn('btn-3d btn-3d-red px-5 text-sm inline-flex items-center gap-2', isLoading && 'opacity-50')}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Score
            </button>
          </div>
          {address && (
            <button
              onClick={() => { setInput(address); check(address); }}
              className="mt-2 text-xs text-frost-primary/70 hover:text-frost-primary transition-colors"
            >
              → Score my connected wallet ({shortAddr(address)})
            </button>
          )}
          {error && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Result */}
        <AnimatePresence>
          {result && badge && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="mt-6 max-w-xl mx-auto"
            >
              <div className="glass-card rounded-2xl p-6 text-center relative overflow-hidden">
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-frost-primary/10 blur-[80px] pointer-events-none" />
                <div className="text-5xl mb-1">{badge.icon}</div>
                <div className="font-display text-lg text-white/60">{badge.label}</div>
                <div className="font-mono text-6xl font-bold gradient-text my-2">{result.score}</div>
                <div className="text-xs text-white/40 font-mono">{shortAddr(result.wallet)} · {result.totalNfts} scored NFTs</div>
                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-white/40 flex-wrap">
                  {result.frostBonus && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-frost-primary/10 text-frost-primary border border-frost-primary/25">
                      <Snowflake className="w-3 h-3" /> Frost bonus ×1.2
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                    diversity ×{result.diversityMult}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                    base {result.basePoints}p
                  </span>
                </div>

                {/* Share */}
                {(() => {
                  const ogUrl = `/avalanche/api/nft-score/og?w=${encodeURIComponent(shortAddr(result.wallet))}&s=${result.score}&n=${result.totalNfts}&t=${encodeURIComponent(result.breakdown[0]?.name || '')}&frost=${result.frostBonus ? '1' : '0'}`;
                  const text = `My Frostbite NFT Score: ${result.score} ${badge.icon} ${badge.label} on Avalanche ❄`;
                  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://frostbite.pro/avalanche/nft-score')}`;
                  return (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <a
                        href={tweet}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-frost-primary/15 border border-frost-primary/30 text-frost-primary text-xs hover:bg-frost-primary/25 transition-all"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Share on X
                      </a>
                      <a
                        href={ogUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 text-xs hover:bg-white/[0.08] transition-all"
                      >
                        <ImageIcon className="w-3.5 h-3.5" /> View card
                      </a>
                      {ownWallet && (
                        <button
                          onClick={attestOnChain}
                          disabled={attesting || attestConfirmed}
                          className={cn(
                            'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs transition-all border',
                            attestConfirmed
                              ? 'bg-frost-green/15 border-frost-green/30 text-frost-green'
                              : 'bg-frost-gold/15 border-frost-gold/30 text-frost-gold hover:bg-frost-gold/25'
                          )}
                          title="Record your score on Avalanche (1 tx)"
                        >
                          {attestConfirmed ? (
                            <><Check className="w-3.5 h-3.5" /> Attested on-chain</>
                          ) : attesting ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Attesting…</>
                          ) : (
                            <><Link2 className="w-3.5 h-3.5" /> Attest on-chain</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* Breakdown */}
                {result.breakdown.length > 0 ? (
                  <div className="mt-5 space-y-1.5 text-left">
                    {result.breakdown.map((b) => (
                      <div
                        key={b.address}
                        className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs"
                      >
                        <span className={cn('px-1.5 py-0.5 rounded-md border text-[10px] font-bold w-14 text-center', TIER_COLORS[b.tier])}>
                          {b.tier}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-white/80 truncate block">{b.name}</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {b.floorAvax ? (
                              <span className="text-[9px] text-white/30">◈ {b.floorAvax} AVAX floor</span>
                            ) : null}
                            {b.avgAgeDays !== undefined && (
                              <span className={cn('text-[9px]', b.avgAgeDays >= 365 ? 'text-frost-gold' : b.avgAgeDays < 7 ? 'text-white/25' : 'text-white/40')}>
                                ⏳ held {b.avgAgeDays >= 365 ? `${(b.avgAgeDays / 365).toFixed(1)}y` : `${b.avgAgeDays}d`}
                              </span>
                            )}
                            {b.minterRatio ? (
                              <span className="text-[9px] text-frost-primary">
                                ⛏ {b.minterRatio >= 0.999 ? 'original mint' : `${Math.round(b.minterRatio * 100)}% minted`}
                              </span>
                            ) : null}
                            {b.avgRarity !== undefined && b.avgRarity > 0 ? (
                              <span className="text-[9px] text-frost-gold">
                                ✦ avg rarity {['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][Math.round(b.avgRarity)]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-white/40 font-mono">×{b.count}</span>
                        <span className="text-frost-green font-mono w-16 text-right">+{b.points}p</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-xs text-white/40">
                    No scored collections in this wallet — mint a Frostbite Hero to get started ❄
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Badge ladder */}
        <div className="mt-8 max-w-xl mx-auto flex flex-wrap justify-center gap-2 text-[11px]">
          {[...BADGES].reverse().map((b) => (
            <span key={b.label} className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/50">
              {b.icon} {b.label} {b.min > 0 && <span className="text-white/25">{b.min}+</span>}
            </span>
          ))}
        </div>

        {/* Leaderboard */}
        {leaders.length > 0 && (
          <div className="mt-10 max-w-xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-frost-gold" />
              <h2 className="font-display text-lg text-white/80">Leaderboard</h2>
              <span className="text-[10px] text-white/30">(queried wallets)</span>
            </div>
            <div className="glass-card rounded-2xl p-3 space-y-1">
              {leaders.map((l, i) => (
                <button
                  key={l.wallet}
                  onClick={() => { setInput(l.wallet); check(l.wallet); }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.04] transition-colors text-xs text-left"
                >
                  <span className={cn('w-6 text-center font-mono', i < 3 ? 'text-frost-gold' : 'text-white/30')}>
                    {i + 1}
                  </span>
                  <span className="font-mono text-white/70 flex-1">{shortAddr(l.wallet)}</span>
                  <span className="text-white/40">{badgeFor(l.score).icon} {l.badge}</span>
                  <span className="font-mono text-frost-green w-16 text-right">{l.score}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
