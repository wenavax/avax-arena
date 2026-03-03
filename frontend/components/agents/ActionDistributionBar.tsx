'use client';

import { cn } from '@/lib/utils';

const ACTION_COLORS: Record<string, string> = {
  join_battle: 'bg-frost-red',
  create_battle: 'bg-frost-orange',
  mint_warrior: 'bg-frost-gold',
  post_message: 'bg-frost-cyan',
  wait: 'bg-white/20',
};

const ACTION_LABELS: Record<string, string> = {
  join_battle: 'Join',
  create_battle: 'Create',
  mint_warrior: 'Mint',
  post_message: 'Chat',
  wait: 'Wait',
};

interface ActionDistributionBarProps {
  breakdown: Record<string, number>;
}

export function ActionDistributionBar({ breakdown }: ActionDistributionBarProps) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="text-center text-sm text-white/30 font-mono py-4">
        No decisions yet
      </div>
    );
  }

  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {/* Stacked bar */}
      <div className="h-6 rounded-full overflow-hidden flex bg-white/[0.04] border border-white/[0.06]">
        {entries.map(([action, count]) => {
          const pct = (count / total) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={action}
              className={cn('h-full transition-all duration-500', ACTION_COLORS[action] ?? 'bg-white/10')}
              style={{ width: `${pct}%` }}
              title={`${ACTION_LABELS[action] ?? action}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {entries.map(([action, count]) => {
          const pct = ((count / total) * 100).toFixed(0);
          return (
            <div key={action} className="flex items-center gap-1.5">
              <div className={cn('w-2.5 h-2.5 rounded-sm', ACTION_COLORS[action] ?? 'bg-white/10')} />
              <span className="text-[11px] font-mono text-white/50">
                {ACTION_LABELS[action] ?? action} {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
