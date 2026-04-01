'use client';

import { motion } from 'framer-motion';
import type { Difficulty } from '@/types/quest';
import { DIFFICULTY_STYLES } from '@/types/quest';

interface DifficultyBadgeProps {
  difficulty: Difficulty;
  size?: 'sm' | 'md';
  showPulse?: boolean;
}

export default function DifficultyBadge({ difficulty, size = 'sm', showPulse = false }: DifficultyBadgeProps) {
  const style = DIFFICULTY_STYLES[difficulty];

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-pixel uppercase tracking-wider
        rounded-full border
        ${style.bgColor} ${style.borderColor} ${style.textColor}
        ${size === 'sm' ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-2.5 py-1'}
      `}
    >
      {showPulse && difficulty === 'Boss' && (
        <motion.span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: style.color }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
      )}
      {style.label}
    </span>
  );
}
