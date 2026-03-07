/**
 * Background, aura, and scanline SVG effects
 */

/** Background pattern — element-themed grid with subtle dots */
export function renderBackground(
  size: number,
  bgColor: string,
  elementColor: string,
): string {
  let svg = `<rect width="${size}" height="${size}" fill="${bgColor}"/>`;
  svg += `<rect width="${size}" height="${size}" fill="#0a0a0f" opacity="0.6"/>`;

  // Pixel grid dots
  for (let y = 0; y < size; y += 48) {
    for (let x = 0; x < size; x += 48) {
      svg += `<rect x="${x}" y="${y}" width="2" height="2" fill="${elementColor}" opacity="0.05"/>`;
    }
  }

  // Diagonal lines pattern
  for (let i = 0; i < size * 2; i += 96) {
    svg += `<line x1="${i}" y1="0" x2="${i - size}" y2="${size}" stroke="${elementColor}" stroke-width="1" opacity="0.03"/>`;
  }

  return svg;
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

/** Scanline overlay for retro feel */
export function renderScanlines(size: number): string {
  let svg = '';
  for (let y = 0; y < size; y += 4) {
    svg += `<rect x="0" y="${y}" width="${size}" height="1" fill="#000" opacity="0.08"/>`;
  }
  return svg;
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
