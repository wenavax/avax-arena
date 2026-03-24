'use client';

import { useMemo, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';

type ParticleDirection = 'down' | 'up' | 'float';

interface PageParticleConfig {
  colors: string[];
  count: number;
  direction: ParticleDirection;
  speed: [number, number];
}

const PAGE_CONFIGS: Record<string, PageParticleConfig> = {
  '/battle': {
    colors: ['#ff4400', '#ff6600', '#ff2200', '#ff8800'],
    count: 60,
    direction: 'up',
    speed: [6, 14],
  },
  '/quests': {
    colors: ['#00ff88', '#88ffcc', '#00aa44', '#44ffaa'],
    count: 40,
    direction: 'float',
    speed: [8, 16],
  },
  '/mint': {
    colors: ['#ff8800', '#ffaa00', '#ff4400', '#ffd700'],
    count: 45,
    direction: 'up',
    speed: [4, 10],
  },
  '/marketplace': {
    colors: ['#8800cc', '#cc44ff', '#aa00ff', '#dd66ff'],
    count: 35,
    direction: 'down',
    speed: [7, 15],
  },
  '/leaderboard': {
    colors: ['#ffd700', '#ffaa00', '#ffcc44', '#ffffff'],
    count: 30,
    direction: 'down',
    speed: [6, 12],
  },
};

const DIRECTION_ANIMATION: Record<ParticleDirection, string> = {
  down: 'pixel-fall',
  up: 'ember-rise',
  float: 'leaf-float',
};

function getPageConfig(pathname: string): PageParticleConfig | null {
  let bestMatch: string | null = null;
  for (const key of Object.keys(PAGE_CONFIGS)) {
    if (pathname === key || pathname.startsWith(key + '/')) {
      if (!bestMatch || key.length > bestMatch.length) {
        bestMatch = key;
      }
    }
  }
  return bestMatch ? PAGE_CONFIGS[bestMatch] : null;
}

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
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const pageConfig = getPageConfig(pathname);
  const themeColors = mounted ? getThemeColors(resolvedTheme) : getThemeColors('dark');
  const particleColors = pageConfig ? pageConfig.colors : themeColors;
  const particleCount = pageConfig ? pageConfig.count : 50;
  const animationName = pageConfig ? DIRECTION_ANIMATION[pageConfig.direction] : 'pixel-fall';
  const speedRange = pageConfig ? pageConfig.speed : [5, 8];

  const particles = useMemo<ParticleConfig[]>(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 3 + Math.floor(Math.random() * 3),
      colorIndex: i % particleColors.length,
      animationDelay: `${Math.random() * 10}s`,
      animationDuration: `${speedRange[0] + Math.random() * (speedRange[1] - speedRange[0])}s`,
      opacity: 0.3 + Math.random() * 0.5,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particleCount, pathname]);

  return (
    <div className="particles" aria-hidden="true" style={{ opacity: 'var(--particle-opacity)' }}>
      {particles.map((p) => {
        const color = particleColors[p.colorIndex % particleColors.length];
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
              animationName,
              boxShadow: `0 0 ${p.size * 2}px ${color}`,
            }}
          />
        );
      })}
    </div>
  );
}
