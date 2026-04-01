'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface XPPopupProps {
  /** XP amount to display */
  xp: number;
  /** Whether this is a win (+green) or loss (+dimmed) */
  isWin: boolean;
  /** Unique key to trigger re-animation */
  triggerId: string | number;
  /** Called when animation completes */
  onDone?: () => void;
}

export default function XPPopup({ xp, isWin, triggerId, onDone }: XPPopupProps) {
  return (
    <AnimatePresence mode="wait">
      {xp > 0 && (
        <motion.div
          key={triggerId}
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={{ opacity: 1, y: -30, scale: 1 }}
          exit={{ opacity: 0, y: -60, scale: 0.6 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          onAnimationComplete={onDone}
          className="pointer-events-none absolute z-10"
        >
          <span
            className={`
              font-pixel text-sm font-bold whitespace-nowrap
              ${isWin ? 'text-green-400' : 'text-red-400/70'}
            `}
            style={{
              textShadow: isWin
                ? '0 0 10px rgba(0,255,136,0.5), 0 0 30px rgba(0,255,136,0.2)'
                : '0 0 10px rgba(255,68,68,0.3)',
            }}
          >
            +{xp} XP
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
