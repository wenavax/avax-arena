'use client';

import { useMemo } from 'react';

interface ParticleConfig {
  id: number;
  left: string;
  size: number;
  color: string;
  animationDelay: string;
  animationDuration: string;
  opacity: number;
}

const PARTICLE_COLORS = [
  'var(--arena-cyan)',
  'var(--arena-purple)',
  'var(--arena-pink)',
];

export function ParticleBackground() {
  const particles = useMemo<ParticleConfig[]>(() => {
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 1 + Math.random() * 2,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      animationDelay: `${Math.random() * 8}s`,
      animationDuration: `${4 + Math.random() * 6}s`,
      opacity: 0.2 + Math.random() * 0.4,
    }));
  }, []);

  return (
    <div className="particles" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            animationDelay: p.animationDelay,
            animationDuration: p.animationDuration,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}
