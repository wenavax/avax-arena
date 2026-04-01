'use client';

import { motion } from 'framer-motion';
import type { QuestProgression, CurrentQuest } from '@/types/quest';

interface TierProgressBarProps {
  progression: QuestProgression;
  currentQuests: CurrentQuest[];
}

/** Tier → difficulty label for display */
function tierLabel(tier: number): string {
  if (tier < 5) return 'Easy';
  if (tier < 8) return 'Easy → Medium';
  if (tier < 15) return 'Medium';
  if (tier < 18) return 'Medium → Hard';
  if (tier < 25) return 'Hard';
  if (tier < 28) return 'Hard → Boss';
  return 'Boss';
}

function tierColor(tier: number): string {
  if (tier < 5) return '#00ff88';
  if (tier < 15) return '#ffaa00';
  if (tier < 25) return '#ff4444';
  return '#c026d3';
}

export default function TierProgressBar({ progression, currentQuests }: TierProgressBarProps) {
  const completedInTier = currentQuests.filter(q => q.status === 'completed').length;
  const progress = completedInTier / 2; // 0, 0.5, or 1
  const color = tierColor(progression.currentTier);

  return (
    <div className="w-full">
      {/* Top row: tier + difficulty */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="font-pixel text-sm font-bold"
            style={{ color }}
          >
            Tier {progression.currentTier}
          </span>
          <span className="text-white/20 text-[10px] font-pixel">
            {tierLabel(progression.currentTier)}
          </span>
        </div>
        <span className="text-white/30 text-[10px] font-pixel">
          {completedInTier}/2 quests
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            boxShadow: `0 0 10px ${color}40`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        />

        {/* Halfway marker */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10" />
      </div>

      {/* Bottom row: XP + stats */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          <span className="text-white/30 text-[10px]">
            <span className="text-white/60 font-bold">{progression.totalXp.toLocaleString()}</span> XP
          </span>
          <span className="text-white/10">|</span>
          <span className="text-white/30 text-[10px]">
            <span className="text-white/60 font-bold">{progression.totalCompleted}</span> completed
          </span>
        </div>
        <span className="text-white/30 text-[10px]">
          Win rate: <span className="text-white/60 font-bold">
            {progression.totalCompleted > 0
              ? Math.round((progression.totalWon / progression.totalCompleted) * 100)
              : 0}%
          </span>
        </span>
      </div>
    </div>
  );
}
