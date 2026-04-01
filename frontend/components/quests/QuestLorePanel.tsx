'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { CurrentQuest } from '@/types/quest';
import { ZONE_ELEMENT_STYLES } from '@/types/quest';

interface QuestLorePanelProps {
  quest: CurrentQuest;
  isOpen: boolean;
  onClose: () => void;
}

export default function QuestLorePanel({ quest, isOpen, onClose }: QuestLorePanelProps) {
  const style = ZONE_ELEMENT_STYLES[quest.quest.zone_element] ?? ZONE_ELEMENT_STYLES.Fire;
  const q = quest.quest;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div
            className="relative rounded-xl border border-white/[0.06] p-4 mt-3 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${style.color}06, transparent)` }}
          >
            {/* Background glow */}
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 blur-3xl"
              style={{ background: style.color }}
            />

            {/* Header */}
            <div className="relative flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{style.icon}</span>
                <div>
                  <h4 className="font-display text-white text-[10px]">{q.zone_name}</h4>
                  <span className="text-white/30 text-[10px]">{q.zone_element} Zone</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/30 hover:text-white/60 transition-colors text-xs"
              >
                ✕
              </button>
            </div>

            {/* Enemy */}
            <div className="relative mb-3">
              <span className="text-white/40 text-[10px] font-pixel uppercase tracking-wider">Enemy</span>
              <p className="text-white text-sm font-medium mt-0.5" style={{ color: style.color }}>
                {q.enemy_name}
              </p>
            </div>

            {/* Lore text */}
            <div className="relative">
              <span className="text-white/40 text-[10px] font-pixel uppercase tracking-wider">Intel</span>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-white/60 text-xs leading-relaxed mt-1 italic"
              >
                {quest.status === 'completed'
                  ? quest.result === 'success'
                    ? q.lore_success
                    : q.lore_failure
                  : q.lore_intro}
              </motion.p>
            </div>

            {/* Quest details */}
            <div className="relative grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
              <div className="text-center">
                <span className="text-white/30 text-[9px] font-pixel block">Win XP</span>
                <span className="text-green-400 text-xs font-bold">+{q.win_xp}</span>
              </div>
              <div className="text-center">
                <span className="text-white/30 text-[9px] font-pixel block">Loss XP</span>
                <span className="text-red-400 text-xs font-bold">+{q.loss_xp}</span>
              </div>
              <div className="text-center">
                <span className="text-white/30 text-[9px] font-pixel block">Min Lvl</span>
                <span className="text-white/70 text-xs font-bold">{q.min_level}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
