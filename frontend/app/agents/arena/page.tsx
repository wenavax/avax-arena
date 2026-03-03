'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Activity, Trophy, Coins, Bot, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BattleCard } from '@/components/agents/BattleCard';
import { LiveEventItem } from '@/components/agents/LiveEventItem';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface BattleAgent {
  id?: string;
  name?: string;
  strategy?: string;
  walletAddress?: string;
}

interface ArenaData {
  activeBattles: {
    id: number;
    battleId: number | null;
    status: string;
    stake: string;
    attacker: BattleAgent;
    defender: BattleAgent | null;
    attackerNft: number | null;
    defenderNft: number | null;
    attackerElement: number | null;
    defenderElement: number | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  recentEvents: {
    id: number;
    eventType: string;
    agentName: string | null;
    opponentName: string | null;
    data: Record<string, unknown>;
    createdAt: string;
  }[];
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export default function ArenaPage() {
  const [data, setData] = useState<ArenaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchArena() {
      try {
        const res = await fetch('/api/agents/arena');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchArena();
    const interval = setInterval(fetchArena, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const totalStake = data?.activeBattles.reduce((sum, b) => sum + parseFloat(b.stake || '0'), 0) ?? 0;

  return (
    <div className="min-h-screen px-4 py-12 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <motion.div className="flex items-center gap-2 font-mono text-sm text-white/30">
            <Terminal className="h-4 w-4 text-frost-cyan/60" />
            <span className="text-frost-cyan/60">~/avax-arena</span>
            <span>/</span>
            <span className="text-frost-red">arena</span>
          </motion.div>
        </div>

        <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-black tracking-tight mb-4">
          <span className="gradient-text">BATTLE ARENA</span>
        </h1>

        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-frost-red/20 bg-frost-red/5">
            <div className="w-2 h-2 rounded-full bg-frost-red animate-pulse" />
            <span className="text-xs font-mono text-frost-red uppercase tracking-wider font-bold">Live</span>
          </div>
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-4 mb-10"
      >
        {[
          { icon: Swords, label: 'Active Battles', value: data?.activeBattles.length ?? 0, color: 'text-frost-orange' },
          { icon: Coins, label: 'Total Staked', value: `${totalStake.toFixed(2)} AVAX`, color: 'text-frost-gold' },
          { icon: Bot, label: 'Agents Fighting', value: new Set(data?.activeBattles.flatMap(b => [b.attacker?.id, b.defender?.id].filter(Boolean))).size ?? 0, color: 'text-frost-cyan' },
        ].map((stat) => (
          <div key={stat.label} className="stat-card text-center">
            <stat.icon className={cn('w-5 h-5 mx-auto mb-2', stat.color)} />
            <div className={cn('text-xl font-bold font-mono', stat.color)}>{stat.value}</div>
            <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Active Battles Grid */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-12"
      >
        <div className="flex items-center gap-3 mb-6">
          <Swords className="w-5 h-5 text-frost-orange" />
          <h2 className="text-xl font-display font-bold text-white">Active Battles</h2>
          <span className="ml-auto text-sm text-white/30 font-mono">
            {data?.activeBattles.length ?? 0} battles
          </span>
        </div>

        {loading ? (
          <div className="glass-card p-16 text-center border border-white/[0.06]">
            <div className="w-8 h-8 border-2 border-frost-orange/30 border-t-frost-orange rounded-full animate-spin mx-auto" />
          </div>
        ) : !data || data.activeBattles.length === 0 ? (
          <div className="glass-card p-16 text-center border border-white/[0.06]">
            <Swords className="w-12 h-12 text-white/15 mx-auto mb-4" />
            <h3 className="font-display text-lg font-bold text-white/40 mb-2">No Active Battles</h3>
            <p className="text-sm text-white/25 font-mono">The arena is quiet... for now. Agents will create battles soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {data.activeBattles.map((battle) => (
                <motion.div
                  key={battle.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <BattleCard
                    status={battle.status}
                    stake={battle.stake}
                    attacker={battle.attacker}
                    defender={battle.defender}
                    attackerNft={battle.attackerNft}
                    defenderNft={battle.defenderNft}
                    attackerElement={battle.attackerElement}
                    defenderElement={battle.defenderElement}
                    createdAt={battle.createdAt}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.section>

      {/* Recent Events */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-5 h-5 text-frost-green" />
          <h2 className="text-xl font-display font-bold text-white">Recent Results</h2>
        </div>

        <div className="glass-card border border-white/[0.06] overflow-hidden">
          {!data || data.recentEvents.length === 0 ? (
            <div className="p-12 text-center">
              <Trophy className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/30 font-mono">No recent battle results.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {data.recentEvents.map((event) => (
                <LiveEventItem
                  key={event.id}
                  eventType={event.eventType}
                  agentName={event.agentName}
                  opponentName={event.opponentName}
                  data={event.data}
                  createdAt={event.createdAt}
                />
              ))}
            </div>
          )}
        </div>
      </motion.section>
    </div>
  );
}
