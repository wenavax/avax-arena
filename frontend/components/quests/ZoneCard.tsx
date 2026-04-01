'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import type { QuestZone } from '@/types/quest';
import { ZONE_ELEMENT_STYLES } from '@/types/quest';

interface ZoneCardProps {
  zone: QuestZone;
  isActive: boolean;
  isLocked?: boolean;
  questCount?: number;
  onClick: () => void;
  index: number;
}

export default function ZoneCard({ zone, isActive, isLocked, questCount = 0, onClick, index }: ZoneCardProps) {
  const style = ZONE_ELEMENT_STYLES[zone.element] ?? ZONE_ELEMENT_STYLES.Fire;
  // Only animate on first mount, not on every parent re-render
  const hasAnimated = useRef(false);
  const shouldAnimate = !hasAnimated.current;
  if (shouldAnimate) hasAnimated.current = true;

  return (
    <motion.button
      initial={shouldAnimate ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldAnimate ? { delay: index * 0.06, duration: 0.4 } : { duration: 0 }}
      onClick={onClick}
      disabled={isLocked}
      className={`
        relative group w-full text-left rounded-2xl p-4 sm:p-5 overflow-hidden
        transition-all duration-300 cursor-pointer
        border backdrop-blur-md
        ${isActive
          ? 'border-white/20 ring-1'
          : 'border-white/[0.06] hover:border-white/15'
        }
        ${isLocked ? 'opacity-40 cursor-not-allowed' : ''}
      `}
      style={{
        background: isActive
          ? `linear-gradient(135deg, ${style.color}15, ${style.color}05)`
          : 'var(--glass-card-bg)',
        ...(isActive ? { ringColor: style.color, boxShadow: `0 0 30px ${style.glowColor}, 0 4px 20px rgba(0,0,0,0.3)` } : {}),
      }}
      whileHover={!isLocked ? { y: -4, transition: { duration: 0.2 } } : undefined}
      whileTap={!isLocked ? { scale: 0.98 } : undefined}
    >
      {/* Element glow orb (background) */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: style.color }}
      />

      {/* Top row: icon + element badge */}
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-2xl">{style.icon}</span>
        <span
          className="text-[10px] font-pixel uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{
            color: style.color,
            borderColor: `${style.color}40`,
            background: `${style.color}10`,
          }}
        >
          {zone.element}
        </span>
      </div>

      {/* Zone name */}
      <h3
        className="relative font-display text-white text-sm leading-snug mb-1.5 transition-colors"
        style={isActive ? { color: style.color } : undefined}
      >
        {zone.name}
      </h3>

      {/* Description */}
      <p className="relative text-white/40 text-xs leading-relaxed line-clamp-2 mb-3">
        {zone.description}
      </p>

      {/* Bottom: quest count or locked */}
      <div className="relative flex items-center justify-between">
        {isLocked ? (
          <span className="text-white/20 text-[10px] font-pixel uppercase">Locked</span>
        ) : (
          <>
            {questCount > 0 && (
              <span
                className="text-[10px] font-pixel"
                style={{ color: style.color }}
              >
                {questCount} quest{questCount > 1 ? 's' : ''}
              </span>
            )}
          </>
        )}

        {/* Arrow indicator */}
        {isActive ? (
          <motion.span
            className="text-white/50 text-sm"
            animate={{ x: [0, 4, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            →
          </motion.span>
        ) : (
          <span className="text-white/20 text-sm group-hover:text-white/50 transition-colors">→</span>
        )}
      </div>

      {/* Active indicator line */}
      {isActive && (
        <motion.div
          layoutId="zone-active-indicator"
          className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
          style={{ background: style.color }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
}
