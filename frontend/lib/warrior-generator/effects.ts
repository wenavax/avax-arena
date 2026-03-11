/**
 * Background, aura, and scanline SVG effects
 */

/** Background pattern — element-themed grid with subtle dots (uses SVG pattern for efficiency) */
export function renderBackground(
  size: number,
  bgColor: string,
  elementColor: string,
): string {
  return `<defs>
    <pattern id="bgDots" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
      <rect width="2" height="2" fill="${elementColor}" opacity="0.05"/>
    </pattern>
    <pattern id="bgLines" x="0" y="0" width="96" height="96" patternUnits="userSpaceOnUse" patternTransform="skewX(-45)">
      <line x1="0" y1="0" x2="0" y2="96" stroke="${elementColor}" stroke-width="1" opacity="0.03"/>
    </pattern>
  </defs>
  <rect width="${size}" height="${size}" fill="${bgColor}"/>
  <rect width="${size}" height="${size}" fill="#0a0a0f" opacity="0.6"/>
  <rect width="${size}" height="${size}" fill="url(#bgDots)"/>
  <rect width="${size}" height="${size}" fill="url(#bgLines)"/>`;
}

/** Aura glow around warrior — element-colored, intensity by level */
export function renderAura(
  cx: number,
  cy: number,
  elementColor: string,
  level: number,
): string {
  const intensity = Math.min(0.4, 0.05 + level * 0.03);
  const r1 = 160;
  const r2 = 240;

  return `<defs>
    <radialGradient id="aura" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="${elementColor}" stop-opacity="${intensity}"/>
      <stop offset="60%" stop-color="${elementColor}" stop-opacity="${intensity * 0.4}"/>
      <stop offset="100%" stop-color="${elementColor}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${cx}" cy="${cy}" rx="${r2}" ry="${r2}" fill="url(#aura)"/>`;
}

/** Scanline overlay for retro feel (uses SVG pattern for efficiency) */
export function renderScanlines(size: number): string {
  return `<defs>
    <pattern id="scanlines" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="4" height="1" fill="#000" opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#scanlines)"/>`;
}

/** Floating particles around warrior */
export function renderParticles(
  elementColor: string,
  rng: () => number,
  count: number,
  bounds: { x: number; y: number; w: number; h: number },
): string {
  let svg = '';
  for (let i = 0; i < count; i++) {
    const x = bounds.x + rng() * bounds.w;
    const y = bounds.y + rng() * bounds.h;
    const s = 2 + rng() * 4;
    const op = 0.1 + rng() * 0.3;
    svg += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${elementColor}" opacity="${op.toFixed(2)}"/>`;
  }
  return svg;
}
