/**
 * Main entry — generateWarriorSVG()
 * Deterministic procedural pixel art warrior generator
 */

import { createRng } from './seed';
import { resolveTraits, type WarriorStats } from './traits';
import { ELEMENT_PALETTES, ELEMENT_NAMES } from './palettes';
import { renderWarrior } from './renderer';
import { renderBackground, renderAura, renderScanlines, renderParticles } from './effects';
import { renderFrame } from './frame';

export type { WarriorStats } from './traits';

/**
 * Generate a complete SVG warrior card.
 * Deterministic: same stats + tokenId → always same output.
 */
export function generateWarriorSVG(stats: WarriorStats): string {
  const rng = createRng(stats.tokenId);
  const traits = resolveTraits(stats, rng);
  const ep = ELEMENT_PALETTES[stats.element] ?? ELEMENT_PALETTES[0];
  const elementName = ELEMENT_NAMES[stats.element] ?? 'Unknown';
  const size = 1024;

  // 1. Background
  const background = renderBackground(size, ep.bg, ep.primary);

  // 2. Aura (centered on warrior)
  const aura = renderAura(size / 2, size / 2 - 40, ep.primary, stats.level);

  // 3. Warrior pixel art
  const warrior = renderWarrior(traits, stats);

  // 4. Particles
  const particles = renderParticles(ep.secondary, rng, 12, {
    x: 100, y: 100, w: size - 200, h: size - 200,
  });

  // 5. Frame
  const frame = renderFrame(size, traits.frameTier);

  // 6. Scanlines
  const scanlines = renderScanlines(size);

  // 7. Stat bars + Power Score overlay (bottom area)
  const barX = 80;
  const barW = size - 160;
  const barH = 14;
  const barGap = 32;
  const statsStartY = size - 280;
  const statBars = [
    { label: 'ATK', value: stats.attack, max: 100, color: '#ef4444' },
    { label: 'DEF', value: stats.defense, max: 100, color: '#3b82f6' },
    { label: 'SPD', value: stats.speed, max: 100, color: '#22c55e' },
    { label: 'SPC', value: stats.specialPower, max: 50, color: '#a855f7' },
  ];

  const statsSvg = statBars.map((s, i) => {
    const y = statsStartY + i * barGap;
    const fillW = Math.round((s.value / s.max) * barW);
    return `
      <text x="${barX}" y="${y - 4}" font-family="monospace" font-size="18" fill="${s.color}" font-weight="bold" opacity="0.8">${s.label}</text>
      <text x="${barX + barW}" y="${y - 4}" text-anchor="end" font-family="monospace" font-size="18" fill="white" opacity="0.6">${s.value}</text>
      <rect x="${barX}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="white" opacity="0.08"/>
      <rect x="${barX}" y="${y}" width="${fillW}" height="${barH}" rx="4" fill="${s.color}" opacity="0.7"/>`;
  }).join('');

  // Power Score badge
  const pwrY = statsStartY + statBars.length * barGap + 10;
  const pwrBadge = `
    <rect x="${barX}" y="${pwrY}" width="${barW}" height="46" rx="8" fill="white" opacity="0.04"/>
    <text x="${barX + 16}" y="${pwrY + 30}" font-family="monospace" font-size="20" fill="white" opacity="0.4" font-weight="bold">PWR</text>
    <text x="${barX + barW - 16}" y="${pwrY + 32}" text-anchor="end" font-family="monospace" font-size="32" fill="${ep.primary}" font-weight="bold">${stats.powerScore}</text>`;

  // 8. Text labels
  const textY = pwrY + 70;
  const text = `
    ${statsSvg}
    ${pwrBadge}
    <text x="${size / 2}" y="${textY}" text-anchor="middle" font-family="monospace" font-size="56" fill="${ep.primary}" font-weight="bold" letter-spacing="4">${elementName.toUpperCase()}</text>
    <text x="${size / 2}" y="${textY + 60}" text-anchor="middle" font-family="monospace" font-size="80" fill="white" font-weight="bold" opacity="0.9">#${stats.tokenId}</text>
    <text x="${size / 2}" y="${size - 20}" text-anchor="middle" font-family="monospace" font-size="24" fill="${ep.secondary}" opacity="0.4" letter-spacing="8">FROSTBITE</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="image-rendering:pixelated">
${background}
${aura}
${warrior}
${particles}
${frame}
${scanlines}
${text}
</svg>`;
}

/**
 * Simple fallback when stats are unavailable — element + tokenId only.
 * Uses default stats with only element set.
 */
export function generateFallbackSVG(tokenId: number, element: number): string {
  return generateWarriorSVG({
    tokenId,
    attack: 50,
    defense: 50,
    speed: 50,
    element: Math.min(7, Math.max(0, element)),
    specialPower: 25,
    level: 1,
    powerScore: 250,
  });
}
