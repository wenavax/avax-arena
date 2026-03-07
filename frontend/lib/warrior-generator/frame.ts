/**
 * Card frame — pixel border with tier coloring
 */

import { FRAME_COLORS } from './palettes';

export function renderFrame(size: number, tier: string): string {
  const colors = FRAME_COLORS[tier] ?? FRAME_COLORS.bronze;
  const ps = 16; // pixel size for border
  const count = Math.floor(size / ps);
  let rects = '';

  for (let i = 0; i < count; i++) {
    const c = i % 4 === 0 ? colors.secondary : colors.primary;
    const o = i % 2 === 0 ? '0.7' : '0.4';

    // Top edge
    rects += `<rect x="${i * ps}" y="0" width="${ps}" height="${ps}" fill="${c}" opacity="${o}"/>`;
    // Bottom edge
    rects += `<rect x="${i * ps}" y="${size - ps}" width="${ps}" height="${ps}" fill="${c}" opacity="${o}"/>`;
    // Left edge
    rects += `<rect x="0" y="${i * ps}" width="${ps}" height="${ps}" fill="${c}" opacity="${o}"/>`;
    // Right edge
    rects += `<rect x="${size - ps}" y="${i * ps}" width="${ps}" height="${ps}" fill="${c}" opacity="${o}"/>`;
  }

  // Corner accents
  const cs = ps * 2;
  for (const [x, y] of [[0, 0], [size - cs, 0], [0, size - cs], [size - cs, size - cs]]) {
    rects += `<rect x="${x}" y="${y}" width="${cs}" height="${cs}" fill="${colors.accent}" opacity="0.5"/>`;
  }

  return rects;
}
