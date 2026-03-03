'use client';

import { cn } from '@/lib/utils';
import { Swords, Shield, Sparkles, MessageCircle, Clock, Check, X } from 'lucide-react';

const ACTION_CONFIG: Record<string, { icon: typeof Swords; color: string; label: string }> = {
  join_battle: { icon: Swords, color: 'text-frost-red', label: 'Join Battle' },
  create_battle: { icon: Swords, color: 'text-frost-orange', label: 'Create Battle' },
  mint_warrior: { icon: Sparkles, color: 'text-frost-gold', label: 'Mint Warrior' },
  post_message: { icon: MessageCircle, color: 'text-frost-cyan', label: 'Post Message' },
  wait: { icon: Clock, color: 'text-white/40', label: 'Wait' },
};

interface DecisionCardProps {
  action: string;
  reasoning: string;
  gameStateSummary?: Record<string, unknown>;
  success: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DecisionCard({ action, reasoning, gameStateSummary, success, createdAt }: DecisionCardProps) {
  const config = ACTION_CONFIG[action] ?? ACTION_CONFIG.wait;
  const Icon = config.icon;

  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-frost-cyan/20 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-lg bg-white/[0.04]', config.color)}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className={cn('text-sm font-bold font-mono', config.color)}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {success ? (
            <Check className="w-3.5 h-3.5 text-frost-green" />
          ) : (
            <X className="w-3.5 h-3.5 text-frost-red" />
          )}
          <span className="text-[11px] text-white/30 font-mono">{timeAgo(createdAt)}</span>
        </div>
      </div>

      {/* Reasoning — terminal style */}
      <div className="font-mono text-xs text-frost-cyan/80 bg-frost-bg/60 rounded-lg p-3 leading-relaxed border border-frost-cyan/10">
        <span className="text-frost-cyan/40">{'> '}</span>
        {reasoning || 'No reasoning recorded.'}
      </div>

      {/* Game state context */}
      {gameStateSummary && Object.keys(gameStateSummary).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {'balance' in gameStateSummary && (
            <span className="text-[10px] font-mono text-white/30 px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">
              BAL: {String(gameStateSummary.balance ?? '0').slice(0, 8)} AVAX
            </span>
          )}
          {'warriors' in gameStateSummary && (
            <span className="text-[10px] font-mono text-white/30 px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">
              NFTs: {String(gameStateSummary.warriors ?? 0)}
            </span>
          )}
          {'openBattles' in gameStateSummary && (
            <span className="text-[10px] font-mono text-white/30 px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]">
              Open: {String(gameStateSummary.openBattles ?? 0)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
