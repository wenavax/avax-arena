// ─── 64x64 Pixel Art Hero Generator ───
// Programmatic canvas-based hero NFT art generation

export type Element = 'fire' | 'water' | 'wind' | 'ice' | 'earth' | 'thunder' | 'shadow' | 'light';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const ELEMENTS: Element[] = ['fire', 'water', 'wind', 'ice', 'earth', 'thunder', 'shadow', 'light'];
export const ELEMENT_LABELS: Record<Element, string> = {
  fire: 'Fire', water: 'Water', wind: 'Wind', ice: 'Ice',
  earth: 'Earth', thunder: 'Thunder', shadow: 'Shadow', light: 'Light',
};
export const ELEMENT_ICONS: Record<Element, string> = {
  fire: '🔥', water: '💧', wind: '🍃', ice: '❄️',
  earth: '🪨', thunder: '⚡', shadow: '🌑', light: '✨',
};

// ── Color Palettes per Element ──
interface Palette {
  bg1: string; bg2: string; bg3: string;
  armor1: string; armor2: string; armor3: string;
  weapon: string; weaponHilt: string;
  aura: string; auraGlow: string;
  accent: string;
}

const PALETTES: Record<Element, Palette> = {
  fire:    { bg1: '#1a0800', bg2: '#331100', bg3: '#552200', armor1: '#cc3311', armor2: '#ff5522', armor3: '#882200', weapon: '#ff6622', weaponHilt: '#552200', aura: '#ff4400', auraGlow: '#ffaa00', accent: '#ff6622' },
  water:   { bg1: '#000818', bg2: '#001133', bg3: '#002255', armor1: '#2266bb', armor2: '#3388dd', armor3: '#114488', weapon: '#44aaff', weaponHilt: '#113366', aura: '#2288ff', auraGlow: '#66ccff', accent: '#2288ff' },
  wind:    { bg1: '#081808', bg2: '#113311', bg3: '#225522', armor1: '#44aa44', armor2: '#66cc66', armor3: '#226622', weapon: '#88ee44', weaponHilt: '#224411', aura: '#66dd44', auraGlow: '#aaff88', accent: '#66cc44' },
  ice:     { bg1: '#081018', bg2: '#102030', bg3: '#183050', armor1: '#55aacc', armor2: '#77ccee', armor3: '#337799', weapon: '#88ddff', weaponHilt: '#224455', aura: '#55ccff', auraGlow: '#aaeeff', accent: '#55ccff' },
  earth:   { bg1: '#181008', bg2: '#332211', bg3: '#554422', armor1: '#aa7733', armor2: '#cc9944', armor3: '#775522', weapon: '#ccaa44', weaponHilt: '#443311', aura: '#bb8833', auraGlow: '#ddcc66', accent: '#bb8833' },
  thunder: { bg1: '#181810', bg2: '#333318', bg3: '#555528', armor1: '#ccaa22', armor2: '#ffdd44', armor3: '#887711', weapon: '#ffee44', weaponHilt: '#554411', aura: '#ffdd00', auraGlow: '#ffff88', accent: '#ffdd00' },
  shadow:  { bg1: '#080818', bg2: '#111133', bg3: '#222255', armor1: '#6644aa', armor2: '#8866cc', armor3: '#442277', weapon: '#aa66ff', weaponHilt: '#331155', aura: '#8844cc', auraGlow: '#bb88ff', accent: '#8844cc' },
  light:   { bg1: '#181818', bg2: '#2a2a22', bg3: '#3a3a30', armor1: '#ccbb88', armor2: '#eedd99', armor3: '#998855', weapon: '#ffeeaa', weaponHilt: '#665533', aura: '#ffeeaa', auraGlow: '#ffffcc', accent: '#ffdd88' },
};

const SKIN_TONES = ['#ffddbb', '#f5c49c', '#d4a574', '#a67c52', '#6b4226', '#ffe0bd'];
const HAIR_COLORS = ['#443322', '#221100', '#aa6633', '#ddbb66', '#cc3322', '#ccccdd', '#222244', '#44aa66'];

interface HeroTraits {
  element: Element;
  rarity: Rarity;
  skinIndex: number;
  hairIndex: number;
  armorVariant: number;
  weaponVariant: number;
  eyeGlow: boolean;
  hasAura: boolean;
  hasCape: boolean;
}

export function generateHeroTraits(seed: number, element: Element): HeroTraits {
  const r = seededRandom(seed);
  const rarityRoll = r() * 10000;
  let rarity: Rarity = 'common';
  if (rarityRoll >= 9700) rarity = 'legendary';
  else if (rarityRoll >= 9200) rarity = 'epic';
  else if (rarityRoll >= 8000) rarity = 'rare';
  else if (rarityRoll >= 5500) rarity = 'uncommon';

  return {
    element,
    rarity,
    skinIndex: Math.floor(r() * SKIN_TONES.length),
    hairIndex: Math.floor(r() * HAIR_COLORS.length),
    armorVariant: Math.floor(r() * 4),
    weaponVariant: Math.floor(r() * 3),
    eyeGlow: rarity === 'epic' || rarity === 'legendary' || r() < 0.15,
    hasAura: rarity !== 'common',
    hasCape: r() < 0.3 || rarity === 'legendary',
  };
}

export interface DrawHeroOptions {
  /** If true, skip background, aura, and rarity border — for in-game sprite use */
  transparent?: boolean;
}

export function drawHero(canvas: HTMLCanvasElement, traits: HeroTraits, opts?: DrawHeroOptions): void {
  const ctx = canvas.getContext('2d')!;
  canvas.width = 64;
  canvas.height = 64;
  ctx.imageSmoothingEnabled = false;

  const pal = PALETTES[traits.element];
  const skin = SKIN_TONES[traits.skinIndex];
  const hair = HAIR_COLORS[traits.hairIndex];

  if (!opts?.transparent) {
    // ── Background ──
    drawBackground(ctx, pal, traits);

    // ── Aura (behind character) ──
    if (traits.hasAura) {
      drawAura(ctx, pal, traits.rarity);
    }
  } else {
    ctx.clearRect(0, 0, 64, 64);
  }

  // ── Cape ──
  if (traits.hasCape) {
    drawCape(ctx, pal);
  }

  // ── Body / Legs ──
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  fillEllipse(ctx, 32, 58, 14, 4);

  // Boots
  const bootColor = darken(pal.armor3, 0.7);
  px(ctx, 26, 52, 5, 4, bootColor);
  px(ctx, 33, 52, 5, 4, bootColor);

  // Legs
  px(ctx, 27, 46, 4, 7, darken(pal.armor1, 0.6));
  px(ctx, 33, 46, 4, 7, darken(pal.armor1, 0.6));

  // Body / Armor
  drawArmor(ctx, pal, traits.armorVariant);

  // ── Arms ──
  // Back arm
  px(ctx, 21, 28, 4, 12, darken(pal.armor2, 0.8));
  // Hand
  px(ctx, 21, 39, 3, 3, skin);

  // Front arm
  px(ctx, 39, 28, 4, 12, darken(pal.armor2, 0.9));
  // Hand
  px(ctx, 39, 39, 3, 3, skin);

  // ── Weapon (in front hand) ──
  drawWeapon(ctx, pal, traits.weaponVariant, traits.element);

  // ── Head ──
  // Neck
  px(ctx, 30, 24, 4, 3, skin);

  // Head (round)
  ctx.fillStyle = skin;
  fillCircle(ctx, 32, 19, 8);

  // Hair
  drawHair(ctx, hair, traits.hairIndex);

  // Eyes
  drawEyes(ctx, traits.eyeGlow, pal);

  // Mouth
  px(ctx, 31, 22, 3, 1, darken(skin, 0.75));

  // ── Helmet accent (element colored) ──
  if (traits.armorVariant > 1) {
    px(ctx, 27, 11, 10, 2, pal.armor2);
    px(ctx, 31, 9, 2, 3, pal.accent);
  }

  if (!opts?.transparent) {
    // ── Rarity border ──
    drawRarityBorder(ctx, traits.rarity);
  }
}

// ── Drawing helpers ──

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

function fillCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) {
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
}

function fillEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
}

function darken(hex: string, factor: number): string {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor(((c >> 16) & 0xff) * factor));
  const g = Math.max(0, Math.floor(((c >> 8) & 0xff) * factor));
  const b = Math.max(0, Math.floor((c & 0xff) * factor));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function lighten(hex: string, factor: number): string {
  const c = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor(((c >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((c >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((c & 0xff) * factor));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ── Background ──
function drawBackground(ctx: CanvasRenderingContext2D, pal: Palette, traits: HeroTraits): void {
  // Gradient background
  for (let y = 0; y < 64; y++) {
    const t = y / 64;
    ctx.fillStyle = y < 22 ? pal.bg1 : y < 44 ? pal.bg2 : pal.bg3;
    ctx.fillRect(0, y, 64, 1);
  }

  // Element-specific details
  switch (traits.element) {
    case 'fire':
      // Ember particles
      for (let i = 0; i < 8; i++) {
        const fx = (i * 17 + 5) % 60 + 2;
        const fy = (i * 23 + 10) % 50 + 5;
        px(ctx, fx, fy, 1, 1, i % 2 ? '#ff6622' : '#ffaa44');
      }
      // Lava floor
      for (let x = 0; x < 64; x += 3) { px(ctx, x, 59 + (x % 5 > 2 ? -1 : 0), 2, 1, '#cc3300'); }
      break;
    case 'water':
      // Bubbles
      for (let i = 0; i < 5; i++) {
        const bx = (i * 13 + 7) % 56 + 4;
        const by = (i * 19 + 3) % 40 + 10;
        px(ctx, bx, by, 2, 2, 'rgba(100,180,255,0.3)');
      }
      break;
    case 'ice':
      // Snowflakes
      for (let i = 0; i < 6; i++) {
        const sx = (i * 11 + 3) % 58 + 3;
        const sy = (i * 17 + 7) % 45 + 5;
        px(ctx, sx, sy, 1, 1, '#ccddff');
      }
      // Ice floor
      for (let x = 0; x < 64; x += 4) { px(ctx, x, 60, 3, 1, '#88bbdd'); }
      break;
    case 'thunder':
      // Lightning bolts
      px(ctx, 10, 5, 1, 3, '#ffee44');
      px(ctx, 11, 7, 1, 3, '#ffee44');
      px(ctx, 50, 8, 1, 4, '#ffdd00');
      px(ctx, 51, 11, 1, 3, '#ffdd00');
      break;
    case 'shadow':
      // Dark particles
      for (let i = 0; i < 7; i++) {
        const dx = (i * 9 + 5) % 56 + 4;
        const dy = (i * 13 + 11) % 48 + 8;
        px(ctx, dx, dy, 1, 1, '#6644aa');
      }
      break;
    case 'light':
      // Light rays
      ctx.fillStyle = 'rgba(255,238,170,0.08)';
      for (let i = 0; i < 3; i++) {
        const lx = 15 + i * 18;
        ctx.fillRect(lx, 0, 4, 64);
      }
      break;
    case 'wind':
      // Leaves
      for (let i = 0; i < 4; i++) {
        const lx = (i * 15 + 8) % 54 + 5;
        const ly = (i * 11 + 5) % 40 + 10;
        px(ctx, lx, ly, 2, 1, '#66aa44');
        px(ctx, lx + 1, ly + 1, 1, 1, '#44cc44');
      }
      break;
    case 'earth':
      // Rocks
      for (let i = 0; i < 3; i++) {
        const rx = (i * 20 + 5) % 50 + 7;
        px(ctx, rx, 57, 4, 3, '#665533');
        px(ctx, rx + 1, 56, 2, 1, '#776644');
      }
      break;
  }
}

// ── Aura ──
function drawAura(ctx: CanvasRenderingContext2D, pal: Palette, rarity: Rarity): void {
  const alpha = rarity === 'legendary' ? 0.25 : rarity === 'epic' ? 0.18 : rarity === 'rare' ? 0.12 : 0.08;
  ctx.fillStyle = pal.aura;
  ctx.globalAlpha = alpha;
  fillEllipse(ctx, 32, 36, 18, 22);
  ctx.globalAlpha = alpha * 0.5;
  fillEllipse(ctx, 32, 36, 22, 26);
  ctx.globalAlpha = 1;

  // Glow particles for epic+
  if (rarity === 'epic' || rarity === 'legendary') {
    const positions = [[22, 20], [42, 18], [20, 42], [44, 40], [32, 10], [26, 50], [38, 48]];
    for (const [gx, gy] of positions) {
      px(ctx, gx, gy, 1, 1, pal.auraGlow);
    }
  }
}

// ── Cape ──
function drawCape(ctx: CanvasRenderingContext2D, pal: Palette): void {
  // Cape behind body
  ctx.fillStyle = darken(pal.armor1, 0.5);
  // Left side
  for (let y = 26; y < 52; y++) {
    const width = Math.min(4, 1 + Math.floor((y - 26) * 0.15));
    px(ctx, 20 - width, y, width, 1, darken(pal.armor1, 0.45));
  }
  // Right side
  for (let y = 26; y < 52; y++) {
    const width = Math.min(4, 1 + Math.floor((y - 26) * 0.15));
    px(ctx, 44, y, width, 1, darken(pal.armor1, 0.5));
  }
}

// ── Armor variants ──
function drawArmor(ctx: CanvasRenderingContext2D, pal: Palette, variant: number): void {
  // Base body
  px(ctx, 25, 26, 14, 18, pal.armor1);

  // Chest plate highlight
  px(ctx, 27, 28, 10, 3, pal.armor2);

  // Belt
  px(ctx, 25, 42, 14, 2, darken(pal.armor3, 0.6));
  px(ctx, 31, 42, 2, 2, '#ccaa44'); // buckle

  switch (variant) {
    case 0: // Light armor — less coverage
      px(ctx, 26, 30, 2, 8, pal.armor2);
      px(ctx, 36, 30, 2, 8, pal.armor2);
      break;
    case 1: // Chain mail — cross pattern
      for (let y = 32; y < 42; y += 2) {
        for (let x = 26; x < 38; x += 2) {
          px(ctx, x, y, 1, 1, darken(pal.armor2, 0.85));
        }
      }
      break;
    case 2: // Plate armor — shoulder pads
      px(ctx, 22, 25, 6, 3, pal.armor2);
      px(ctx, 36, 25, 6, 3, pal.armor2);
      px(ctx, 23, 24, 4, 1, lighten(pal.armor2, 1.2));
      px(ctx, 37, 24, 4, 1, lighten(pal.armor2, 1.2));
      // Chest V
      px(ctx, 30, 28, 1, 5, pal.armor3);
      px(ctx, 33, 28, 1, 5, pal.armor3);
      break;
    case 3: // Royal armor — ornate
      px(ctx, 22, 25, 6, 4, pal.armor2);
      px(ctx, 36, 25, 6, 4, pal.armor2);
      // Gold trim
      px(ctx, 25, 26, 1, 16, '#ccaa44');
      px(ctx, 38, 26, 1, 16, '#ccaa44');
      px(ctx, 26, 34, 12, 1, '#ccaa44');
      // Gem center
      px(ctx, 31, 30, 2, 2, pal.accent);
      break;
  }
}

// ── Weapon variants ──
function drawWeapon(ctx: CanvasRenderingContext2D, pal: Palette, variant: number, element: Element): void {
  switch (variant) {
    case 0: // Sword
      px(ctx, 41, 20, 2, 18, pal.weapon);      // blade
      px(ctx, 40, 18, 4, 2, lighten(pal.weapon, 1.3)); // tip highlight
      px(ctx, 39, 37, 6, 2, pal.weaponHilt);    // guard
      px(ctx, 41, 39, 2, 4, darken(pal.weaponHilt, 0.7)); // grip
      break;
    case 1: // Staff
      px(ctx, 42, 14, 2, 28, pal.weaponHilt);   // shaft
      // Orb on top
      ctx.fillStyle = pal.weapon;
      fillCircle(ctx, 43, 12, 3);
      px(ctx, 43, 11, 1, 1, lighten(pal.weapon, 1.4)); // gleam
      break;
    case 2: // Axe
      px(ctx, 42, 18, 2, 22, pal.weaponHilt);   // handle
      // Axe head
      px(ctx, 39, 16, 3, 6, pal.weapon);
      px(ctx, 38, 17, 1, 4, pal.weapon);
      px(ctx, 44, 16, 3, 6, pal.weapon);
      px(ctx, 47, 17, 1, 4, pal.weapon);
      px(ctx, 40, 16, 1, 1, lighten(pal.weapon, 1.3)); // edge gleam
      break;
  }
}

// ── Hair ──
function drawHair(ctx: CanvasRenderingContext2D, color: string, index: number): void {
  const style = index % 4;
  switch (style) {
    case 0: // Short spiky
      ctx.fillStyle = color;
      fillCircle(ctx, 32, 15, 8);
      // Spikes
      px(ctx, 26, 10, 2, 3, color);
      px(ctx, 30, 8, 2, 4, color);
      px(ctx, 34, 9, 2, 3, color);
      px(ctx, 37, 11, 2, 2, color);
      break;
    case 1: // Long
      ctx.fillStyle = color;
      fillCircle(ctx, 32, 14, 9);
      // Long back
      px(ctx, 24, 18, 3, 12, color);
      px(ctx, 37, 18, 3, 12, color);
      break;
    case 2: // Mohawk
      ctx.fillStyle = color;
      for (let y = 7; y < 20; y++) {
        const w = y < 12 ? 4 : 6;
        px(ctx, 32 - w / 2, y, w, 1, color);
      }
      // Top spike
      px(ctx, 31, 5, 2, 3, lighten(color, 1.2));
      break;
    case 3: // Braided
      ctx.fillStyle = color;
      fillCircle(ctx, 32, 15, 8);
      // Braids down sides
      for (let y = 20; y < 34; y += 2) {
        px(ctx, 23, y, 2, 2, color);
        px(ctx, 39, y, 2, 2, color);
      }
      break;
  }
}

// ── Eyes ──
function drawEyes(ctx: CanvasRenderingContext2D, glow: boolean, pal: Palette): void {
  // White
  px(ctx, 28, 18, 3, 2, '#ffffff');
  px(ctx, 33, 18, 3, 2, '#ffffff');
  // Pupil
  const pupilColor = glow ? pal.accent : '#222222';
  px(ctx, 29, 18, 2, 2, pupilColor);
  px(ctx, 34, 18, 2, 2, pupilColor);

  if (glow) {
    // Glow effect around eyes
    ctx.globalAlpha = 0.3;
    px(ctx, 27, 17, 5, 4, pal.auraGlow);
    px(ctx, 32, 17, 5, 4, pal.auraGlow);
    ctx.globalAlpha = 1;
  }
}

// ── Rarity Border ──
function drawRarityBorder(ctx: CanvasRenderingContext2D, rarity: Rarity): void {
  const colors: Record<Rarity, string> = {
    common: '#555555',
    uncommon: '#44cc44',
    rare: '#4488ff',
    epic: '#cc44ff',
    legendary: '#ffaa00',
  };
  const c = colors[rarity];
  const w = rarity === 'legendary' ? 2 : 1;

  ctx.fillStyle = c;
  // Top
  ctx.fillRect(0, 0, 64, w);
  // Bottom
  ctx.fillRect(0, 64 - w, 64, w);
  // Left
  ctx.fillRect(0, 0, w, 64);
  // Right
  ctx.fillRect(64 - w, 0, w, 64);

  // Corner accents for rare+
  if (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary') {
    px(ctx, 1, 1, 3, 1, lighten(c, 1.4));
    px(ctx, 1, 1, 1, 3, lighten(c, 1.4));
    px(ctx, 60, 1, 3, 1, lighten(c, 1.4));
    px(ctx, 62, 1, 1, 3, lighten(c, 1.4));
    px(ctx, 1, 62, 3, 1, lighten(c, 1.4));
    px(ctx, 1, 61, 1, 3, lighten(c, 1.4));
    px(ctx, 60, 62, 3, 1, lighten(c, 1.4));
    px(ctx, 62, 61, 1, 3, lighten(c, 1.4));
  }
}

// ── Seeded Random ──
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Export utility: render to data URL ──
export function heroToDataURL(traits: HeroTraits, scale = 4): string {
  const canvas = document.createElement('canvas');
  drawHero(canvas, traits);

  if (scale > 1) {
    const scaled = document.createElement('canvas');
    scaled.width = 64 * scale;
    scaled.height = 64 * scale;
    const sctx = scaled.getContext('2d')!;
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(canvas, 0, 0, 64 * scale, 64 * scale);
    return scaled.toDataURL('image/png');
  }
  return canvas.toDataURL('image/png');
}
