'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Bot,
  Copy,
  Check,
  Swords,
  Trophy,
  TrendingUp,
  Coins,
  Shield,
  MessageCircle,
  Star,
  Clock,
  Brain,
  Loader2,
  AlertTriangle,
  Target,
  Crown,
  Calendar,
  Zap,
  Award,
  Gem,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentAvatar } from '@/components/agents/AgentAvatar';
import { PersonalityBadge } from '@/components/agents/PersonalityBadge';
import { DecisionCard } from '@/components/agents/DecisionCard';
import { ActionDistributionBar } from '@/components/agents/ActionDistributionBar';

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function shortenAddr(addr: string, chars = 4): string {
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ELO_TIER_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  Bronze: { text: 'text-amber-600', bg: 'bg-amber-600/10', border: 'border-amber-600/30' },
  Silver: { text: 'text-gray-300', bg: 'bg-gray-300/10', border: 'border-gray-300/30' },
  Gold: { text: 'text-frost-gold', bg: 'bg-frost-gold/10', border: 'border-frost-gold/30' },
  Platinum: { text: 'text-frost-cyan', bg: 'bg-frost-cyan/10', border: 'border-frost-cyan/30' },
  Diamond: { text: 'text-frost-purple', bg: 'bg-frost-purple/10', border: 'border-frost-purple/30' },
};

const RARITY_STYLES: Record<string, string> = {
  common: 'border-white/20 text-white/60',
  rare: 'border-blue-500/40 text-blue-400',
  epic: 'border-frost-purple/40 text-frost-purple',
  legendary: 'border-frost-gold/40 text-frost-gold',
};

const STRATEGY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Aggressive: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  Analytical: { bg: 'bg-frost-purple/15', text: 'text-frost-purple', border: 'border-frost-purple/30' },
  Defensive: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  Random: { bg: 'bg-frost-gold/15', text: 'text-frost-gold', border: 'border-frost-gold/30' },
};

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

interface AgentResponse {
  id: string;
  name: string;
  strategy: string;
  ownerAddress: string;
  description: string;
  walletAddress: string;
  createdAt: string;
  active: boolean;
  isOnline: boolean;
  stats: {
    battles: number;
    wins: number;
    losses: number;
    winRate: number;
    profit: string;
    messages: number;
    nftsMinted: number;
    currentStreak: number;
    bestStreak: number;
    totalDecisions: number;
    favoriteAction: string;
    elo: number;
    eloTier: string;
    xp: number;
    level: number;
    prestige: number;
    xpProgress: number;
    xpForNextLevel: number;
  };
  achievements?: {
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    rarity: string;
    unlockedAt: string;
  }[];
  personality: {
    bio: string;
    catchphrase: string;
    personalityType: string;
    avatarSeed: string;
    avatarGradient: string;
    tauntStyle: string;
    favoriteElement: string;
  } | null;
  recentDecisions: {
    id: number;
    action: string;
    reasoning: string;
    gameStateSummary: Record<string, unknown>;
    success: boolean;
    createdAt: string;
  }[];
  decisionStats: {
    actionBreakdown: Record<string, number>;
    successRate: number;
    totalDecisions: number;
  };
  recentActivity: {
    type: string;
    description: string;
    timestamp: number;
    txHash: string | null;
  }[];
  rival?: {
    name: string;
    element: string;
    winRate: number;
    lastEncounter: string;
    headToHead: { wins: number; losses: number };
  } | null;
  tournaments?: {
    id: number;
    name: string;
    status: string;
    score: number;
    wins: number;
    losses: number;
    prize_pool: string;
    winner_id: string | null;
  }[];
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export default function AgentProfilePage() {
  const params = useParams();
  const agentId = params.agentId as string;

  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copiedOwner, setCopiedOwner] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchAgent() {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load agent');
        }
        const data = await res.json();
        if (!cancelled) {
          setAgent(data.agent);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load agent');
          setLoading(false);
        }
      }
    }
    fetchAgent();
    return () => { cancelled = true; };
  }, [agentId]);

  const copyAddr = (addr: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(addr);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-frost-cyan animate-spin" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-frost-orange mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold text-white mb-2">Agent Not Found</h2>
          <p className="text-white/40 font-mono text-sm">{error || 'Could not load agent data.'}</p>
        </div>
      </div>
    );
  }

  const stratStyle = STRATEGY_STYLES[agent.strategy] ?? STRATEGY_STYLES.Analytical;
  const personality = agent.personality;

  return (
    <div className="min-h-screen px-4 py-12 max-w-7xl mx-auto">
      {/* ================================================================= */}
      {/* 1. AGENT HEADER                                                   */}
      {/* ================================================================= */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card p-8 rounded-2xl mb-10"
      >
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
          <AgentAvatar
            seed={personality?.avatarSeed ?? agent.name.slice(0, 2)}
            gradient={personality?.avatarGradient ?? 'from-frost-cyan to-frost-purple'}
            size="lg"
            isOnline={agent.isOnline}
          />

          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-display font-bold gradient-text mb-3">
              {agent.name}
            </h1>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
              <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border', stratStyle.bg, stratStyle.text, stratStyle.border)}>
                {agent.strategy}
              </span>
              {/* ELO Tier Badge */}
              {(() => {
                const tierStyle = ELO_TIER_STYLES[agent.stats.eloTier] ?? ELO_TIER_STYLES.Bronze;
                return (
                  <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border flex items-center gap-1.5', tierStyle.bg, tierStyle.text, tierStyle.border)}>
                    <Shield className="w-3 h-3" />
                    {agent.stats.eloTier} {agent.stats.elo}
                  </span>
                );
              })()}
              {/* Level Badge */}
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-frost-purple/30 bg-frost-purple/10 text-frost-purple flex items-center gap-1.5">
                <Star className="w-3 h-3" />
                Lvl {agent.stats.level}
                {agent.stats.prestige > 0 && (
                  <span className="text-frost-gold ml-1">P{agent.stats.prestige}</span>
                )}
              </span>
              {personality && (
                <PersonalityBadge personalityType={personality.personalityType} tauntStyle={personality.tauntStyle} showTaunt />
              )}
              <span className="flex items-center gap-1.5 text-sm">
                <span className={cn('w-2 h-2 rounded-full', agent.isOnline ? 'bg-frost-green' : 'bg-white/30')} />
                <span className={agent.isOnline ? 'text-frost-green' : 'text-white/40'}>
                  {agent.isOnline ? 'Online' : 'Offline'}
                </span>
              </span>
            </div>

            {/* Addresses */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-center md:justify-start gap-2 text-sm">
                <span className="text-white/40">Owner:</span>
                <span className="font-mono text-frost-cyan">{shortenAddr(agent.ownerAddress)}</span>
                <button onClick={() => copyAddr(agent.ownerAddress, setCopiedOwner)} className="p-1 rounded hover:bg-white/5 transition-colors">
                  {copiedOwner ? <Check className="w-3.5 h-3.5 text-frost-green" /> : <Copy className="w-3.5 h-3.5 text-white/30" />}
                </button>
              </div>
              <div className="flex items-center justify-center md:justify-start gap-2 text-sm">
                <span className="text-white/40">Agent Wallet:</span>
                <span className="font-mono text-frost-purple">{shortenAddr(agent.walletAddress)}</span>
                <button onClick={() => copyAddr(agent.walletAddress, setCopiedWallet)} className="p-1 rounded hover:bg-white/5 transition-colors">
                  {copiedWallet ? <Check className="w-3.5 h-3.5 text-frost-green" /> : <Copy className="w-3.5 h-3.5 text-white/30" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-white/30 mb-5">
              <Clock className="w-3.5 h-3.5" />
              <span>Joined {new Date(agent.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>

            {agent.description && (
              <p className="text-sm text-white/60 leading-relaxed max-w-2xl">{agent.description}</p>
            )}
          </div>
        </div>
      </motion.section>

      {/* ================================================================= */}
      {/* 2. PERSONALITY CARD                                               */}
      {/* ================================================================= */}
      {personality && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 rounded-2xl mb-10 border border-white/[0.06]"
        >
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-5 h-5 text-frost-purple" />
            <h2 className="text-lg font-display font-bold text-white">Personality</h2>
          </div>
          <p className="text-sm text-white/60 leading-relaxed mb-4 font-mono">{personality.bio}</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="px-4 py-2 rounded-xl bg-frost-cyan/5 border border-frost-cyan/15">
              <span className="text-frost-cyan font-mono text-sm italic">&ldquo;{personality.catchphrase}&rdquo;</span>
            </div>
            {personality.favoriteElement && (
              <span className="text-xs text-white/30 font-mono">
                Fav Element: {personality.favoriteElement}
              </span>
            )}
          </div>
        </motion.section>
      )}

      {/* ================================================================= */}
      {/* 3. STATS GRID                                                     */}
      {/* ================================================================= */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12"
      >
        {[
          { icon: Shield, label: 'ELO Rating', value: agent.stats.elo, color: 'text-frost-cyan' },
          { icon: Swords, label: 'Total Battles', value: agent.stats.battles, color: 'text-frost-cyan' },
          { icon: Trophy, label: 'Win Rate', value: `${agent.stats.winRate}%`, color: 'text-frost-green' },
          { icon: Coins, label: 'Profit', value: `${agent.stats.profit} AVAX`, color: 'text-frost-gold' },
          { icon: Zap, label: 'XP', value: agent.stats.xp.toLocaleString(), color: 'text-frost-purple' },
          { icon: Brain, label: 'AI Decisions', value: agent.stats.totalDecisions, color: 'text-frost-orange' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.05 }}
            className="stat-card"
          >
            <stat.icon className={cn('w-5 h-5 mx-auto mb-2', stat.color)} />
            <div className={cn('text-xl font-bold font-mono', stat.color)}>{stat.value}</div>
            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </motion.section>

      {/* ================================================================= */}
      {/* 3.5. XP PROGRESS BAR                                             */}
      {/* ================================================================= */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="glass-card p-5 rounded-2xl mb-12 border border-white/[0.06]"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-frost-purple" />
            <span className="text-sm font-mono text-white/60">
              Level {agent.stats.level}
              {agent.stats.prestige > 0 && <span className="text-frost-gold ml-2">Prestige {agent.stats.prestige}</span>}
            </span>
          </div>
          <span className="text-xs font-mono text-white/30">
            {agent.stats.xp.toLocaleString()} / {agent.stats.xpForNextLevel.toLocaleString()} XP
          </span>
        </div>
        <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${agent.stats.xpProgress}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-frost-purple to-frost-cyan rounded-full"
          />
        </div>
      </motion.section>

      {/* ================================================================= */}
      {/* 3.7. ACHIEVEMENTS                                                 */}
      {/* ================================================================= */}
      {agent.achievements && agent.achievements.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <Award className="w-5 h-5 text-frost-gold" />
            <h2 className="text-lg font-display font-bold text-white">Achievements</h2>
            <span className="ml-auto text-sm text-white/30 font-mono">{agent.achievements.length} unlocked</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {agent.achievements.map((ach) => (
              <div
                key={ach.id}
                className={cn(
                  'px-4 py-2 rounded-xl border text-sm font-mono flex items-center gap-2',
                  RARITY_STYLES[ach.rarity] ?? RARITY_STYLES.common,
                  'bg-white/[0.02]'
                )}
                title={`${ach.description} — Unlocked ${timeAgo(ach.unlockedAt)}`}
              >
                <Gem className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{ach.name}</span>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ================================================================= */}
      {/* 4. AI BRAIN PANEL — Decision History                              */}
      {/* ================================================================= */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-12"
      >
        <div className="flex items-center gap-3 mb-6">
          <Brain className="w-5 h-5 text-frost-cyan" />
          <h2 className="text-xl font-display font-bold text-white">AI Brain</h2>
          <span className="ml-auto text-sm text-white/30 font-mono">
            {agent.decisionStats.totalDecisions} total decisions
          </span>
        </div>

        {/* Action distribution */}
        {agent.decisionStats.totalDecisions > 0 && (
          <div className="glass-card p-5 rounded-2xl mb-4 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-mono text-white/50">Action Distribution</span>
              <span className="text-xs font-mono text-frost-green">
                {agent.decisionStats.successRate}% success rate
              </span>
            </div>
            <ActionDistributionBar breakdown={agent.decisionStats.actionBreakdown} />
          </div>
        )}

        {/* Recent decisions */}
        <div className="space-y-3">
          {agent.recentDecisions.length === 0 ? (
            <div className="glass-card p-8 rounded-2xl text-center border border-white/[0.06]">
              <Brain className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/30 font-mono">No decisions recorded yet. Start the agent loop to see AI reasoning.</p>
            </div>
          ) : (
            agent.recentDecisions.map((d) => (
              <DecisionCard
                key={d.id}
                action={d.action}
                reasoning={d.reasoning}
                gameStateSummary={d.gameStateSummary}
                success={d.success}
                createdAt={d.createdAt}
              />
            ))
          )}
        </div>
      </motion.section>

      {/* ================================================================= */}
      {/* 5. RIVAL CARD                                                     */}
      {/* ================================================================= */}
      {agent.rival && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-card p-6 rounded-2xl mb-12 border border-red-500/20"
        >
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-display font-bold text-white">Rival</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1">
              <p className="text-xl font-bold font-mono text-red-400 mb-1">{agent.rival.name}</p>
              <p className="text-sm text-white/40 font-mono">Element: {agent.rival.element} | Win Rate: {agent.rival.winRate}%</p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-lg font-bold font-mono text-frost-green">{agent.rival.headToHead.wins}</div>
                <div className="text-[11px] text-white/30 uppercase">Wins</div>
              </div>
              <div className="text-white/10 text-2xl font-light">vs</div>
              <div>
                <div className="text-lg font-bold font-mono text-red-400">{agent.rival.headToHead.losses}</div>
                <div className="text-[11px] text-white/30 uppercase">Losses</div>
              </div>
            </div>
          </div>
          {agent.rival.lastEncounter !== 'never' && (
            <p className="text-xs text-white/20 font-mono mt-3">Last encounter: {timeAgo(agent.rival.lastEncounter)}</p>
          )}
        </motion.section>
      )}

      {/* ================================================================= */}
      {/* 6. TOURNAMENT HISTORY                                             */}
      {/* ================================================================= */}
      {agent.tournaments && agent.tournaments.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.37 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-5 h-5 text-frost-gold" />
            <h2 className="text-lg font-display font-bold text-white">Tournament History</h2>
          </div>
          <div className="space-y-3">
            {agent.tournaments.map((t) => (
              <div key={t.id} className="glass-card p-4 rounded-xl border border-white/[0.06] flex items-center gap-4">
                <Calendar className="w-4 h-4 text-white/30 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-white/80 truncate">{t.name}</p>
                  <p className="text-xs text-white/30 font-mono">
                    {t.wins}W-{t.losses}L | Score: {t.score} | Prize: {t.prize_pool} AVAX
                  </p>
                </div>
                <span className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                  t.status === 'completed'
                    ? t.winner_id === agent.id ? 'bg-frost-gold/20 text-frost-gold' : 'bg-white/5 text-white/30'
                    : t.status === 'active' ? 'bg-frost-green/20 text-frost-green' : 'bg-frost-cyan/10 text-frost-cyan/50'
                )}>
                  {t.winner_id === agent.id ? 'WINNER' : t.status}
                </span>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ================================================================= */}
      {/* 7. RECENT ACTIVITY                                                */}
      {/* ================================================================= */}
      {agent.recentActivity.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-6 rounded-2xl mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-5 h-5 text-frost-orange" />
            <h2 className="text-xl font-display font-bold text-white">Recent Activity</h2>
          </div>

          <div className="space-y-3">
            {agent.recentActivity.map((act, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <div className="w-2 h-2 rounded-full bg-frost-cyan/40 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/60 font-mono">{act.description}</p>
                  <span className="text-[11px] text-white/25 font-mono">
                    {timeAgo(new Date(act.timestamp).toISOString())}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}
