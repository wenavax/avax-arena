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

function getThemeColors(theme: string | undefined): string[] {
  if (theme === 'light') {
    return [
      'rgb(var(--frost-primary))',
      'rgb(var(--frost-secondary))',
      'rgb(var(--frost-accent) / 0.4)',
      'rgb(var(--frost-primary) / 0.7)',
      'rgb(var(--frost-accent) / 0.3)',
      'rgb(var(--frost-secondary) / 0.5)',
    ];
  }
  return [
    'rgb(var(--frost-primary))',
    'rgb(var(--frost-secondary))',
    'rgb(var(--frost-accent))',
    'rgb(var(--frost-primary) / 0.7)',
    'rgb(var(--frost-secondary) / 0.6)',
    'rgb(var(--frost-accent) / 0.5)',
  ];
}

export function ParticleBackground() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const colors = mounted ? getThemeColors(resolvedTheme) : getThemeColors('dark');

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
