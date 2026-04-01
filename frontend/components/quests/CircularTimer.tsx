'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface CircularTimerProps {
  /** Total duration in seconds */
  totalDuration: number;
  /** Start timestamp (ISO string or epoch ms) */
  startedAt: string | number;
  /** Color of the progress ring */
  color?: string;
  /** Size in px */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Called when timer reaches 0 */
  onComplete?: () => void;
  /** Called every tick with remaining seconds */
  onTick?: (remaining: number) => void;
}

function parseTime(t: string | number): number {
  if (typeof t === 'number') return t;
  // SQLite datetime('now') stores UTC but without 'Z' suffix — add it to parse correctly
  const str = t.endsWith('Z') ? t : t + 'Z';
  const ms = Date.parse(str);
  return isNaN(ms) ? Date.now() : ms;
}

export default function CircularTimer({
  totalDuration,
  startedAt,
  color = '#ff2020',
  size = 80,
  strokeWidth = 4,
  onComplete,
  onTick,
}: CircularTimerProps) {
  const [remaining, setRemaining] = useState(totalDuration);
  const [hasCompleted, setHasCompleted] = useState(false);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, 1 - remaining / totalDuration));
  const dashOffset = circumference * (1 - progress);

  useEffect(() => {
    const startMs = parseTime(startedAt);
    const endMs = startMs + totalDuration * 1000;

    function tick() {
      const now = Date.now();
      const rem = Math.max(0, Math.ceil((endMs - now) / 1000));
      setRemaining(rem);
      onTick?.(rem);

      if (rem <= 0 && !hasCompleted) {
        setHasCompleted(true);
        onComplete?.();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, totalDuration, onComplete, onTick, hasCompleted]);

  const isReady = remaining <= 0;

  // Format display
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const display = isReady
    ? '✓'
    : h > 0
      ? `${h}:${String(m).padStart(2, '0')}`
      : m > 0
        ? `${m}:${String(s).padStart(2, '0')}`
        : `${s}s`;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isReady ? '#00ff88' : color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className={`font-pixel text-center leading-none ${isReady ? 'text-green-400' : 'text-white/80'}`}
          style={{ fontSize: size < 60 ? 9 : size < 100 ? 11 : 14 }}
          animate={isReady ? { scale: [1, 1.1, 1] } : {}}
          transition={isReady ? { repeat: Infinity, duration: 1.5 } : {}}
        >
          {display}
        </motion.span>
        {!isReady && h > 0 && (
          <span className="text-white/20 font-pixel mt-0.5" style={{ fontSize: 7 }}>
            {String(s).padStart(2, '0')}s
          </span>
        )}
      </div>

      {/* Pulse glow when ready */}
      {isReady && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 20px rgba(0,255,136,0.3)' }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
      )}
    </div>
  );
}
