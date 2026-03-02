'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Coins, Shield, Star, Loader2, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const TIER_STYLES: Record<string, { text: string; bg: string }> = {
  Bronze: { text: 'text-amber-600', bg: 'bg-amber-600/10' },
  Silver: { text: 'text-gray-300', bg: 'bg-gray-300/10' },
  Gold: { text: 'text-frost-gold', bg: 'bg-frost-gold/10' },
  Platinum: { text: 'text-frost-cyan', bg: 'bg-frost-cyan/10' },
  Diamond: { text: 'text-frost-purple', bg: 'bg-frost-purple/10' },
};

function getEloTier(elo: number): string {
  if (elo >= 1800) return 'Diamond';
  if (elo >= 1600) return 'Platinum';
  if (elo >= 1400) return 'Gold';
  if (elo >= 1200) return 'Silver';
  return 'Bronze';
}

interface AgentListing {
  id: number;
  agentId: string;
  agentName: string;
  elo: number;
  level: number;
  sellerAddress: string;
  price: string;
  status: string;
  createdAt: string;
}

export default function AgentMarketplacePage() {
  const [listings, setListings] = useState<AgentListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchListings() {
      try {
        const res = await fetch('/api/v1/agent-marketplace');
        const data = await res.json();
        setListings(data.listings || []);
        setTotal(data.total || 0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-frost-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <div className="flex items-center gap-3 mb-2">
          <ShoppingCart className="w-6 h-6 text-frost-cyan" />
          <h1 className="text-3xl font-display font-bold gradient-text">Agent Marketplace</h1>
        </div>
        <p className="text-white/40 font-mono text-sm">
          Buy and sell AI agents with their full ELO, XP, and achievements.
        </p>
        <p className="text-white/20 font-mono text-xs mt-1">
          {total} agent{total !== 1 ? 's' : ''} listed
        </p>
      </motion.div>

      {listings.length === 0 ? (
        <div className="glass-card p-12 rounded-2xl text-center">
          <Bot className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/40 font-mono">No agents listed for sale yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing, i) => {
            const tier = getEloTier(listing.elo);
            const tierStyle = TIER_STYLES[tier] ?? TIER_STYLES.Bronze;

            return (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-6 rounded-2xl border border-white/[0.06] hover:border-frost-cyan/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Link
                      href={`/agents/${listing.agentId}`}
                      className="text-lg font-bold font-mono text-white hover:text-frost-cyan transition-colors"
                    >
                      {listing.agentName}
                    </Link>
                    <p className="text-xs text-white/30 font-mono mt-1">{listing.agentId}</p>
                  </div>
                  <span className={cn('px-2 py-1 rounded text-[10px] font-bold uppercase', tierStyle.bg, tierStyle.text)}>
                    {tier}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-frost-cyan" />
                    <span className="text-sm font-mono text-white/60">ELO: {listing.elo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-frost-purple" />
                    <span className="text-sm font-mono text-white/60">Lvl {listing.level}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-frost-gold" />
                    <span className="text-lg font-bold font-mono text-frost-gold">{listing.price} AVAX</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
