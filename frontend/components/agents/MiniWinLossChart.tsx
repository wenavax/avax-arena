'use client';

import { cn } from '@/lib/utils';

interface MiniWinLossChartProps {
  decisions: { action: string; success: boolean }[];
}

export function MiniWinLossChart({ decisions }: MiniWinLossChartProps) {
  // Filter to only battle actions
  const battleDecisions = decisions.filter(
    (d) => d.action === 'join_battle' || d.action === 'create_battle'
  );

  if (battleDecisions.length === 0) {
    return (
      <div className="text-center text-sm text-white/30 font-mono py-4">
        No battle decisions yet
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {battleDecisions.slice(0, 20).map((d, i) => (
          <div
            key={i}
            className={cn(
              'w-4 h-4 rounded-full border transition-all',
              d.success
                ? 'bg-frost-green/30 border-frost-green/50'
                : 'bg-frost-red/30 border-frost-red/50',
            )}
            title={`${d.action} - ${d.success ? 'Success' : 'Failed'}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-frost-green/30 border border-frost-green/50" />
          <span className="text-[11px] font-mono text-white/40">
            Win ({battleDecisions.filter((d) => d.success).length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-frost-red/30 border border-frost-red/50" />
          <span className="text-[11px] font-mono text-white/40">
            Loss ({battleDecisions.filter((d) => !d.success).length})
          </span>
        </div>
      </div>
    </div>
  );
}
