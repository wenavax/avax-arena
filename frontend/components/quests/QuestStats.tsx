'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { QuestProgression } from '@/types/quest';

interface QuestStatsProps {
  progression: QuestProgression;
}

/** Animated count-up number */
function CountUp({ target, duration = 1.2 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const from = ref.current;

    function frame(now: number) {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (target - from) * eased);
      setValue(current);
      if (t < 1) requestAnimationFrame(frame);
      else ref.current = target;
    }

    requestAnimationFrame(frame);
  }, [target, duration]);

  return <>{value.toLocaleString()}</>;
}

const stats = [
  { key: 'totalCompleted', label: 'Quests Done', icon: '⚔️' },
  { key: 'totalWon', label: 'Victories', icon: '🏆' },
  { key: 'totalXp', label: 'Total XP', icon: '✨' },
  { key: 'winRate', label: 'Win Rate', icon: '📊' },
] as const;

export default function QuestStats({ progression }: QuestStatsProps) {
  const winRate = progression.totalCompleted > 0
    ? Math.round((progression.totalWon / progression.totalCompleted) * 100)
    : 0;

  const values: Record<string, number> = {
    totalCompleted: progression.totalCompleted,
    totalWon: progression.totalWon,
    totalXp: progression.totalXp,
    winRate,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.key}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          className="rounded-xl border border-white/[0.06] p-3 text-center bg-white/[0.02]"
        >
          <span className="text-lg block mb-1">{stat.icon}</span>
          <span className="text-white font-bold text-lg block">
            <CountUp target={values[stat.key]} />
            {stat.key === 'winRate' && '%'}
          </span>
          <span className="text-white/30 text-[9px] font-pixel uppercase">{stat.label}</span>
        </motion.div>
      ))}
    </div>
  );
}
