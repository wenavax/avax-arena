'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { QuestCompleteResponse } from '@/types/quest';
import { ZONE_ELEMENT_STYLES } from '@/types/quest';
import XPPopup from './XPPopup';

interface QuestCompleteOverlayProps {
  result: QuestCompleteResponse | null;
  zoneElement?: string;
  onClose: () => void;
}

export default function QuestCompleteOverlay({
  result,
  zoneElement = 'Fire',
  onClose,
}: QuestCompleteOverlayProps) {
  const [showXP, setShowXP] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const style = ZONE_ELEMENT_STYLES[zoneElement] ?? ZONE_ELEMENT_STYLES.Fire;
  const isWin = result?.result === 'success';
  const isAbandoned = result?.result === 'abandoned';

  // Stagger animations
  useEffect(() => {
    if (!result) return;
    const t1 = setTimeout(() => setShowXP(true), 800);
    const t2 = setTimeout(() => setShowDetails(true), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [result]);

  // Reset on close
  useEffect(() => {
    if (!result) {
      setShowXP(false);
      setShowDetails(false);
    }
  }, [result]);

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            initial={{ backdropFilter: 'blur(0px)' }}
            animate={{ backdropFilter: 'blur(12px)' }}
            style={{ background: 'rgba(0,0,0,0.7)' }}
          />

          {/* Content */}
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
            className="relative max-w-md w-full"
          >
            {/* Result icon */}
            <motion.div
              className="text-center mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.3 }}
            >
              <span className="text-6xl block mb-2">
                {isAbandoned ? '🏳️' : isWin ? '⚔️' : '💀'}
              </span>
              <motion.h2
                className={`font-display text-xl ${
                  isAbandoned ? 'text-white/40' : isWin ? 'text-green-400' : 'text-red-400'
                }`}
                style={
                  !isAbandoned
                    ? {
                        textShadow: isWin
                          ? '0 0 20px rgba(0,255,136,0.4)'
                          : '0 0 20px rgba(255,68,68,0.4)',
                      }
                    : undefined
                }
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {isAbandoned ? 'Quest Abandoned' : isWin ? 'Victory!' : 'Defeat'}
              </motion.h2>
            </motion.div>

            {/* XP popup */}
            <div className="flex justify-center mb-4 relative h-8">
              {showXP && !isAbandoned && (
                <XPPopup
                  xp={result.xpGained}
                  isWin={isWin}
                  triggerId={`overlay-${Date.now()}`}
                />
              )}
              {/* Static XP after popup */}
              <AnimatePresence>
                {showXP && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className={`font-pixel text-lg font-bold ${isWin ? 'text-green-400' : 'text-red-400/70'}`}
                  >
                    {isAbandoned ? 'No XP' : `+${result.xpGained} XP`}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Details card */}
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-2xl border border-white/[0.06] p-5 overflow-hidden"
                  style={{
                    background: 'var(--glass-card-bg)',
                  }}
                >
                  {/* Quest name + enemy */}
                  <div className="mb-4">
                    <h3 className="text-white font-display text-xs mb-1">{result.questName}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{style.icon}</span>
                      <span className="text-white/40 text-xs">vs {result.enemyName}</span>
                    </div>
                  </div>

                  {/* Lore */}
                  <p className="text-white/50 text-xs leading-relaxed italic mb-4">
                    {result.lore}
                  </p>

                  {/* Tier advancement */}
                  {result.tierAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-4 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5"
                    >
                      <div className="flex items-center gap-2">
                        <motion.span
                          className="text-lg"
                          animate={{ rotate: [0, 10, -10, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          🏆
                        </motion.span>
                        <div>
                          <span className="text-amber-400 text-xs font-bold font-pixel">Tier Advanced!</span>
                          <span className="text-white/40 text-[10px] block">
                            Now Tier {result.newTier} — New quests unlocked
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Close button */}
                  <button
                    onClick={onClose}
                    className="w-full btn-3d btn-3d-red text-[10px] py-2.5"
                  >
                    Continue
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Particles / sparkles for win */}
            {isWin && !isAbandoned && (
              <>
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1 h-1 rounded-full"
                    style={{
                      background: i % 2 === 0 ? '#ffd700' : style.color,
                      left: '50%',
                      top: '30%',
                    }}
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{
                      x: (Math.random() - 0.5) * 300,
                      y: (Math.random() - 0.5) * 200 - 50,
                      opacity: 0,
                      scale: [1, 1.5, 0],
                    }}
                    transition={{
                      duration: 1.5 + Math.random(),
                      delay: 0.3 + Math.random() * 0.3,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
