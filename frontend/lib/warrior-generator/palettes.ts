/** Element color palettes — 5 colors each: primary, secondary, dark, highlight, background */
export const ELEMENT_PALETTES: Record<number, {
  primary: string; secondary: string; dark: string; highlight: string; bg: string;
}> = {
  0: { primary: '#FF4400', secondary: '#FF8800', dark: '#CC2200', highlight: '#FFD700', bg: '#1A0500' }, // Fire
  1: { primary: '#0096FF', secondary: '#00D4FF', dark: '#004488', highlight: '#88EEFF', bg: '#000A1A' }, // Water
  2: { primary: '#00FF88', secondary: '#88FFCC', dark: '#006644', highlight: '#CCFFEE', bg: '#001A0A' }, // Wind
  3: { primary: '#00E5FF', secondary: '#AAE0FF', dark: '#0088AA', highlight: '#FFFFFF', bg: '#000A1A' }, // Ice
  4: { primary: '#B47800', secondary: '#DDAA44', dark: '#664400', highlight: '#FFCC66', bg: '#1A0F00' }, // Earth
  5: { primary: '#FFD700', secondary: '#AA00FF', dark: '#886600', highlight: '#FFFF88', bg: '#0A0A1A' }, // Thunder
  6: { primary: '#8800CC', secondary: '#CC0044', dark: '#440066', highlight: '#DD66FF', bg: '#0A001A' }, // Shadow
  7: { primary: '#FFE066', secondary: '#FFFFFF', dark: '#AA8800', highlight: '#FFFFCC', bg: '#1A1A0A' }, // Light
};

/** Armor tier color sets */
export const ARMOR_COLORS: Record<string, { primary: string; secondary: string; dark: string }> = {
  cloth:     { primary: '#8B7355', secondary: '#A0522D', dark: '#6B4226' },
  leather:   { primary: '#6B4226', secondary: '#8B6914', dark: '#4A3728' },
  chain:     { primary: '#808080', secondary: '#A0A0A0', dark: '#606060' },
  plate:     { primary: '#696969', secondary: '#8A8A8A', dark: '#4A4A4A' },
};

/** Skin tones — indexed by tokenId % 6 */
export const SKIN_TONES = [
  '#FFE0BD', '#F5C7A1', '#D4A76A', '#A67B5B', '#8B6340', '#5C3D2E',
];

/** Frame colors by tier */
export const FRAME_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  bronze: { primary: '#CD7F32', secondary: '#A0522D', accent: '#8B4513' },
  silver: { primary: '#C0C0C0', secondary: '#A8A8A8', accent: '#808080' },
  gold:   { primary: '#FFD700', secondary: '#FFA500', accent: '#DAA520' },
};

export const ELEMENT_NAMES = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];

/** Blend two hex colors */
export function blendColors(c1: string, c2: string, ratio: number): string {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Get armor colors — legendary tier blends element primary with gold */
export function getArmorColors(tier: string, element: number): { primary: string; secondary: string; dark: string } {
  if (tier === 'legendary') {
    const ep = ELEMENT_PALETTES[element] ?? ELEMENT_PALETTES[0];
    return {
      primary: blendColors(ep.primary, '#FFD700', 0.4),
      secondary: blendColors(ep.secondary, '#FFA500', 0.3),
      dark: blendColors(ep.dark, '#8B6914', 0.3),
    };
  }
  return ARMOR_COLORS[tier] ?? ARMOR_COLORS.cloth;
}
