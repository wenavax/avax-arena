'use client';

import { motion } from 'framer-motion';
import type { TierHistoryEntry } from '@/types/quest';

interface QuestHistoryProps {
  history: TierHistoryEntry[];
  currentTier: number;
}

function resultIcon(result: string | null): string {
  if (result === 'success') return '✅';
  if (result === 'failure') return '❌';
  return '⬜';
}

function resultColor(result: string | null): string {
  if (result === 'success') return 'border-green-500/30 bg-green-500/5';
  if (result === 'failure') return 'border-red-500/30 bg-red-500/5';
  return 'border-white/[0.06] bg-white/[0.02]';
}

export default function QuestHistory({ history, currentTier }: QuestHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-white/20 text-xs font-pixel">No quest history yet</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-display text-white text-sm uppercase tracking-wider">History</h3>
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-white/30 text-[10px] font-pixel">
          Last {history.length} tiers
        </span>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {history.map((entry, i) => (
          <motion.div
            key={entry.tier}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3"
          >
            {/* Tier number */}
            <span className="text-white/20 text-[10px] font-pixel w-12 text-right flex-shrink-0">
              Tier {entry.tier}
            </span>

            {/* Timeline dot + line */}
            <div className="relative flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${
                entry.slot0_result === 'success' && entry.slot1_result === 'success'
                  ? 'bg-green-400'
                  : entry.slot0_result === 'failure' || entry.slot1_result === 'failure'
                    ? 'bg-red-400'
                    : 'bg-white/20'
              }`} />
              {i < history.length - 1 && (
                <div className="absolute top-2 left-1/2 w-px h-4 -translate-x-1/2 bg-white/[0.06]" />
              )}
            </div>

            {/* Slot results */}
            <div className="flex items-center gap-1.5 flex-1">
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] ${resultColor(entry.slot0_result)}`}>
                <span className="text-xs">{resultIcon(entry.slot0_result)}</span>
                <span className="text-white/40 font-pixel">Q1</span>
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] ${resultColor(entry.slot1_result)}`}>
                <span className="text-xs">{resultIcon(entry.slot1_result)}</span>
                <span className="text-white/40 font-pixel">Q2</span>
              </div>

              {/* Both success = tier cleared */}
              {entry.slot0_result === 'success' && entry.slot1_result === 'success' && (
                <span className="text-green-400/60 text-[8px] font-pixel ml-1">CLEARED</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
