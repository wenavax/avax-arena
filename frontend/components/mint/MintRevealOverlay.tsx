'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ELEMENTS_COLORS: Record<number, { primary: string; secondary: string; glow: string }> = {
  0: { primary: '#FF4400', secondary: '#FF8800', glow: 'rgba(255,68,0,0.4)' },    // Fire
  1: { primary: '#0096FF', secondary: '#00D4FF', glow: 'rgba(0,150,255,0.4)' },    // Water
  2: { primary: '#00FF88', secondary: '#88FFCC', glow: 'rgba(0,255,136,0.4)' },    // Wind
  3: { primary: '#00E5FF', secondary: '#AAE0FF', glow: 'rgba(0,229,255,0.4)' },    // Ice
  4: { primary: '#B47800', secondary: '#DDAA44', glow: 'rgba(180,120,0,0.4)' },    // Earth
  5: { primary: '#FFD700', secondary: '#AA00FF', glow: 'rgba(255,215,0,0.4)' },    // Thunder
  6: { primary: '#8800CC', secondary: '#CC0044', glow: 'rgba(136,0,204,0.4)' },    // Shadow
  7: { primary: '#FFE066', secondary: '#FFFFFF', glow: 'rgba(255,224,102,0.4)' },  // Light
};

interface Props {
  isOpen: boolean;
  element: number;
  onComplete: () => void;
}

export function MintRevealOverlay({ isOpen, element, onComplete }: Props) {
  const [phase, setPhase] = useState<'glow' | 'shake' | 'burst' | 'done'>('glow');
  const colors = ELEMENTS_COLORS[element] || ELEMENTS_COLORS[0];

  // Generate burst particles
  const particles = useMemo(() =>
    Array.from({ length: 36 }, (_, i) => {
      const angle = (i / 36) * Math.PI * 2;
      const distance = 150 + Math.random() * 200;
      return {
        id: i,
        endX: Math.cos(angle) * distance,
        endY: Math.sin(angle) * distance,
        size: 3 + Math.random() * 6,
        delay: Math.random() * 0.15,
      };
    }), []
  );

  useEffect(() => {
    if (!isOpen) { setPhase('glow'); return; }
    const t1 = setTimeout(() => setPhase('shake'), 1200);
    const t2 = setTimeout(() => setPhase('burst'), 2400);
    const t3 = setTimeout(() => { setPhase('done'); onComplete(); }, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isOpen, onComplete]);

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Glow box */}
      {phase !== 'done' && (
        <motion.div
          className="relative w-48 h-64 rounded-2xl border-2"
          style={{
            borderColor: colors.primary,
            boxShadow: `0 0 40px ${colors.glow}, 0 0 80px ${colors.glow}, inset 0 0 30px ${colors.glow}`,
            background: `radial-gradient(ellipse at center, ${colors.glow}, rgba(0,0,0,0.8))`,
          }}
          animate={
            phase === 'glow'
              ? { scale: [1, 1.03, 1], opacity: [0.8, 1, 0.8] }
              : phase === 'shake'
              ? { x: [0, -8, 8, -6, 6, -4, 4, -2, 2, 0], scale: [1, 1.05, 1.05, 1.05, 1.08] }
              : { scale: [1.08, 2], opacity: [1, 0] }
          }
          transition={
            phase === 'glow'
              ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
              : phase === 'shake'
              ? { duration: 1.2, ease: 'easeInOut' }
              : { duration: 0.4, ease: 'easeOut' }
          }
        >
          {/* Inner shimmer */}
          <div className="absolute inset-0 rounded-2xl overflow-hidden">
            <motion.div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(45deg, transparent 30%, ${colors.secondary}33 50%, transparent 70%)`,
              }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>

          {/* Question mark */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span
              className="text-5xl font-display font-bold"
              style={{ color: colors.primary, textShadow: `0 0 20px ${colors.glow}` }}
              animate={phase === 'shake' ? { scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] } : {}}
              transition={{ duration: 0.4, repeat: phase === 'shake' ? Infinity : 0 }}
            >
              ?
            </motion.span>
          </div>
        </motion.div>
      )}

      {/* Burst particles */}
      {phase === 'burst' && particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: p.id % 2 === 0 ? colors.primary : colors.secondary,
            boxShadow: `0 0 ${p.size * 2}px ${colors.glow}`,
          }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: p.endX, y: p.endY, scale: 0, opacity: 0 }}
          transition={{ duration: 0.6, delay: p.delay, ease: 'easeOut' }}
        />
      ))}

      {/* White flash */}
      {phase === 'burst' && (
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 0.5 }}
        />
      )}
    </motion.div>
  );
}
