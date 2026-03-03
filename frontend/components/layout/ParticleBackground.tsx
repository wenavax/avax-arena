'use client';

import { useMemo, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

interface ParticleConfig {
  id: number;
  left: string;
  size: number;
  colorIndex: number;
  animationDelay: string;
  animationDuration: string;
  opacity: number;
}

const DARK_COLORS = [
  '#ff2020',
  '#ff6b6b',
  '#ffffff',
  '#ff4444',
  '#ff8888',
  '#ffcccc',
];

const LIGHT_COLORS = [
  '#dc2626',
  '#ef4444',
  '#9ca3af',
  '#f87171',
  '#d1d5db',
  '#fca5a5',
];

export function ParticleBackground() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const colors = mounted && resolvedTheme === 'light' ? LIGHT_COLORS : DARK_COLORS;

  const particles = useMemo<ParticleConfig[]>(() => {
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 3 + Math.floor(Math.random() * 3),
      colorIndex: i % 6,
      animationDelay: `${Math.random() * 10}s`,
      animationDuration: `${5 + Math.random() * 8}s`,
      opacity: 0.3 + Math.random() * 0.5,
    }));
  }, []);

  return (
    <div className="particles" aria-hidden="true" style={{ opacity: 'var(--particle-opacity)' }}>
      {particles.map((p) => {
        const color = colors[p.colorIndex];
        return (
          <span
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: color,
              animationDelay: p.animationDelay,
              animationDuration: p.animationDuration,
              boxShadow: `0 0 ${p.size * 2}px ${color}`,
            }}
          />
        );
      })}
    </div>
  );
}
