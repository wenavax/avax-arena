'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Tag,
  Gavel,
  Clock,
  Send,
  X,
  Shield,
  Sword,
  Zap,
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
  experience: number;
  battleWins: number;
  battleLosses: number;
  powerScore: number;
}

interface ListingData {
  seller: string;
  price: bigint;
  active: boolean;
}

interface AuctionData {
  seller: string;
  startPrice: bigint;
  highestBid: bigint;
  highestBidder: string;
  startTime: number;
  endTime: number;
  active: boolean;
  settled: boolean;
}

interface OfferData {
  offerer: string;
  amount: bigint;
  timestamp: number;
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
    experience: Number(raw.experience ?? raw[6] ?? 0),
    battleWins: Number(raw.battleWins ?? raw[7] ?? 0),
    battleLosses: Number(raw.battleLosses ?? raw[8] ?? 0),
    powerScore: Number(raw.powerScore ?? raw[9] ?? 0),
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

function StatBar({
  label,
  value,
  max,
  icon: Icon,
}: {
  label: string;
  value: number;
  max: number;
  icon: typeof Sword;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-white/30 flex-shrink-0" />
      <span className="w-20 text-xs text-white/50 font-pixel">{label}</span>
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
          className="h-full bg-gradient-to-r from-frost-cyan to-frost-purple rounded-full"
        />
      </div>
      <span className="w-8 text-right text-sm font-medium text-white/70">{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export default function NFTDetailPage() {
  const params = useParams();
  const tokenId = parseInt(params.tokenId as string, 10);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [warrior, setWarrior] = useState<Warrior | null>(null);
  const [owner, setOwner] = useState<string>('');
  const [listing, setListing] = useState<ListingData | null>(null);
  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [countdown, setCountdown] = useState('');

  // Offer form
  const [offerAmount, setOfferAmount] = useState('');
  const [bidAmount, setBidAmount] = useState('');

  const fetchData = useCallback(async () => {
    if (!publicClient || isNaN(tokenId)) return;
    setLoading(true);
    try {
      const [warriorRaw, ownerAddr, listingRaw, auctionRaw, offersRaw] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'getWarrior',
          args: [BigInt(tokenId)],
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.frostbiteWarrior as `0x${string}`,
          abi: FROSTBITE_WARRIOR_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'getListing',
          args: [BigInt(tokenId)],
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'getAuction',
          args: [BigInt(tokenId)],
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'getOffers',
          args: [BigInt(tokenId)],
        }),
      ]);

      setWarrior(parseWarriorData(warriorRaw as Record<string, unknown>, tokenId));
      setOwner(String(ownerAddr));

      const l = listingRaw as Record<string, unknown>;
      const listingParsed: ListingData = {
        seller: String(l.seller ?? l[0] ?? ''),
        price: BigInt(String(l.price ?? l[1] ?? 0)),
        active: Boolean(l.active ?? l[2] ?? false),
      };
      setListing(listingParsed.active ? listingParsed : null);

      const a = auctionRaw as Record<string, unknown>;
      const auctionParsed: AuctionData = {
        seller: String(a.seller ?? a[0] ?? ''),
        startPrice: BigInt(String(a.startPrice ?? a[1] ?? 0)),
        highestBid: BigInt(String(a.highestBid ?? a[2] ?? 0)),
        highestBidder: String(a.highestBidder ?? a[3] ?? ''),
        startTime: Number(a.startTime ?? a[4] ?? 0),
        endTime: Number(a.endTime ?? a[5] ?? 0),
        active: Boolean(a.active ?? a[6] ?? false),
        settled: Boolean(a.settled ?? a[7] ?? false),
      };
      setAuction(auctionParsed.active ? auctionParsed : null);

      if (auctionParsed.active) {
        const minBid = auctionParsed.highestBid > BigInt(0)
          ? auctionParsed.highestBid + (auctionParsed.highestBid * BigInt(500)) / BigInt(10000)
          : auctionParsed.startPrice;
        setBidAmount(formatEther(minBid));
      }

      const rawOffers = offersRaw as unknown as Array<Record<string, unknown>>;
      setOffers(
        rawOffers.map((o) => ({
          offerer: String(o.offerer ?? o[0] ?? ''),
          amount: BigInt(String(o.amount ?? o[1] ?? 0)),
          timestamp: Number(o.timestamp ?? o[2] ?? 0),
        }))
      );
    } catch (err) {
      console.error('Failed to fetch NFT data:', err);
    }
    setLoading(false);
  }, [publicClient, tokenId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auction countdown
  useEffect(() => {
    if (!auction) return;
    const interval = setInterval(() => {
      setCountdown(timeRemaining(auction.endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction]);

  // Refresh after tx
  useEffect(() => {
    if (txConfirmed) {
      fetchData();
      setPending(false);
    }
  }, [txConfirmed, fetchData]);

  // ------ Actions ------

  const handleBuy = async () => {
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

  const handleMakeOffer = async () => {
    if (!offerAmount) return;
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'makeOffer',
        args: [BigInt(tokenId)],
        value: parseEther(offerAmount),
      });
      setOfferAmount('');
    } catch (err) {
      console.error('Offer failed:', err);
      setPending(false);
    }
  };

  const handleAcceptOffer = async (offerer: string) => {
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'acceptOffer',
        args: [BigInt(tokenId), offerer as `0x${string}`],
      });
    } catch (err) {
      console.error('Accept offer failed:', err);
      setPending(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!bidAmount) return;
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'placeBid',
        args: [BigInt(tokenId)],
        value: parseEther(bidAmount),
      });
    } catch (err) {
      console.error('Bid failed:', err);
      setPending(false);
    }
  };

  const handleEndAuction = async () => {
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'endAuction',
        args: [BigInt(tokenId)],
      });
    } catch (err) {
      console.error('End auction failed:', err);
      setPending(false);
    }
  };

  const handleCancelListing = async () => {
    setPending(true);
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESSES.marketplace as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'cancelListing',
        args: [BigInt(tokenId)],
      });
    } catch (err) {
      console.error('Cancel listing failed:', err);
      setPending(false);
    }
  };

  const handleCancelAuction = async () => {
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

  // Ownership checks
  const isOwner =
    (listing && listing.seller.toLowerCase() === address?.toLowerCase()) ||
    (auction && auction.seller.toLowerCase() === address?.toLowerCase()) ||
    owner.toLowerCase() === address?.toLowerCase();
  const auctionEnded = auction ? auction.endTime <= Math.floor(Date.now() / 1000) : false;

  if (loading) {
    return (
      <main className="min-h-screen pt-20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-frost-cyan" />
      </main>
    );
  }

  if (!warrior) {
    return (
      <main className="min-h-screen pt-20 flex flex-col items-center justify-center">
        <p className="text-white/40 mb-4">Warrior not found</p>
        <Link href="/marketplace" className="text-frost-cyan hover:underline">
          Back to Marketplace
        </Link>
      </main>
    );
  }

  const el = getElement(warrior.element);

  return (
    <main className="min-h-screen pt-20 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs mb-6">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-frost-cyan transition-colors font-pixel"
          >
            <ArrowLeft className="h-3 w-3" /> Marketplace
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-white/60 font-pixel">Warrior #{tokenId}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: NFT Image + Stats */}
          <div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-2xl overflow-hidden border border-white/[0.06]"
            >
              {/* Image */}
              <div className="relative aspect-square bg-gradient-to-br from-frost-bg to-gray-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/metadata/${tokenId}/image?element=${warrior.element}`}
                  alt={`Warrior #${tokenId}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className={cn('text-sm px-3 py-1 rounded-full bg-gradient-to-r font-medium', el.color)}>
                    {el.emoji} {el.name}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-black/60 text-white/70">
                    Lv.{warrior.level}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="p-6 space-y-3">
                <h2 className="font-pixel text-lg font-bold text-white mb-4">
                  Warrior #{tokenId}
                </h2>
                <StatBar label="Attack" value={warrior.attack} max={100} icon={Sword} />
                <StatBar label="Defense" value={warrior.defense} max={100} icon={Shield} />
                <StatBar label="Speed" value={warrior.speed} max={100} icon={Zap} />
                <StatBar label="Special" value={warrior.specialPower} max={50} icon={Sparkles} />

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/[0.06]">
                  <div className="text-center">
                    <div className="text-lg font-pixel font-bold text-frost-cyan">{warrior.powerScore}</div>
                    <div className="text-[9px] text-white/40 font-pixel uppercase">Power</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-pixel font-bold text-green-400">{warrior.battleWins}</div>
                    <div className="text-[9px] text-white/40 font-pixel uppercase">Wins</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-pixel font-bold text-red-400">{warrior.battleLosses}</div>
                    <div className="text-[9px] text-white/40 font-pixel uppercase">Losses</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right: Listing/Auction/Offers */}
          <div className="space-y-6">
            {/* Owner info */}
            <div className="glass-card p-4 rounded-xl border border-white/[0.06]">
              <div className="text-xs text-white/40 mb-1">Owner</div>
              <div className="text-sm text-white font-mono">
                {listing ? shortenAddress(listing.seller) : auction ? shortenAddress(auction.seller) : shortenAddress(owner)}
              </div>
            </div>

            {/* Fixed-price listing */}
            {listing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6 rounded-xl border border-frost-cyan/20"
              >
                <div className="flex items-center gap-2 text-xs text-white/40 mb-2">
                  <Tag className="h-3 w-3" /> Fixed Price Listing
                </div>
                <div className="font-display text-3xl font-bold text-frost-cyan mb-4">
                  {formatEther(listing.price)} <span className="text-lg text-white/40">AVAX</span>
                </div>

                {isOwner ? (
                  <button
                    onClick={handleCancelListing}
                    disabled={pending}
                    className="w-full py-3 rounded-lg text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Cancel Listing'}
                  </button>
                ) : (
                  <button
                    onClick={handleBuy}
                    disabled={pending || !isConnected}
                    className="w-full btn-neon py-3 rounded-lg font-medium disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Buy Now'}
                  </button>
                )}
              </motion.div>
            )}

            {/* Auction */}
            {auction && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6 rounded-xl border border-frost-purple/20"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Gavel className="h-3 w-3" /> Auction
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <Clock className="h-3 w-3 text-white/40" />
                    <span className={cn(auctionEnded ? 'text-red-400' : 'text-frost-gold')}>
                      {countdown || timeRemaining(auction.endTime)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-xs text-white/40">Starting Price</div>
                    <div className="font-display font-bold text-white">{formatEther(auction.startPrice)} AVAX</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Highest Bid</div>
                    <div className="font-display font-bold text-frost-purple">
                      {auction.highestBid > BigInt(0) ? `${formatEther(auction.highestBid)} AVAX` : 'No bids'}
                    </div>
                  </div>
                </div>

                {auction.highestBidder !== '0x0000000000000000000000000000000000000000' && (
                  <div className="text-xs text-white/40 mb-4">
                    Top bidder: <span className="text-white/60">{shortenAddress(auction.highestBidder)}</span>
                  </div>
                )}

                {auctionEnded ? (
                  <button
                    onClick={handleEndAuction}
                    disabled={pending}
                    className="w-full py-3 rounded-lg font-medium bg-frost-gold/20 text-frost-gold border border-frost-gold/30 hover:bg-frost-gold/30 transition-colors disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Settle Auction'}
                  </button>
                ) : isOwner && auction.highestBidder === '0x0000000000000000000000000000000000000000' ? (
                  <button
                    onClick={handleCancelAuction}
                    disabled={pending}
                    className="w-full py-3 rounded-lg text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Cancel Auction'}
                  </button>
                ) : !isOwner && isConnected ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-white/40 block mb-1">Bid Amount (AVAX)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-purple/50"
                      />
                    </div>
                    <button
                      onClick={handlePlaceBid}
                      disabled={pending || !bidAmount}
                      className="w-full py-3 rounded-lg font-medium bg-frost-purple/20 text-frost-purple border border-frost-purple/30 hover:bg-frost-purple/30 transition-colors disabled:opacity-50"
                    >
                      {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Place Bid'}
                    </button>
                  </div>
                ) : null}
              </motion.div>
            )}

            {/* Make Offer */}
            {!listing && !auction && isConnected && !isOwner && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6 rounded-xl border border-white/[0.06]"
              >
                <h3 className="text-sm font-medium text-white/60 mb-3">Make an Offer</h3>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    placeholder="Amount in AVAX"
                    className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-frost-cyan/50"
                  />
                  <button
                    onClick={handleMakeOffer}
                    disabled={pending || !offerAmount}
                    className="btn-neon px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
                  >
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Offer</>}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Offers list */}
            {offers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6 rounded-xl border border-white/[0.06]"
              >
                <h3 className="text-sm font-medium text-white/60 mb-3">
                  Offers ({offers.length})
                </h3>
                <div className="space-y-2">
                  {offers.map((offer, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0"
                    >
                      <div>
                        <span className="text-sm font-medium text-frost-cyan">
                          {formatEther(offer.amount)} AVAX
                        </span>
                        <span className="text-xs text-white/30 ml-2">
                          from {shortenAddress(offer.offerer)}
                        </span>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => handleAcceptOffer(offer.offerer)}
                          disabled={pending}
                          className="text-xs px-3 py-1 rounded-lg bg-green-500/20 text-green-400 border border-green-500/20 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                        >
                          Accept
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Not listed message */}
            {!listing && !auction && offers.length === 0 && (
              <div className="glass-card p-6 rounded-xl border border-white/[0.06] text-center">
                <p className="text-white/40 text-sm">This warrior is not currently listed for sale.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
