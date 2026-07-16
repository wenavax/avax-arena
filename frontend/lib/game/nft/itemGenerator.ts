// ─── 64x64 Pixel Art Item Generator ───
// Programmatic canvas-based item NFT art generation

import { Element, ELEMENTS } from './heroGenerator';

export type ItemCategory = 'weapon' | 'armor' | 'helmet' | 'shield' | 'ring';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const ITEM_CATEGORIES: ItemCategory[] = ['weapon', 'armor', 'helmet', 'shield', 'ring'];
export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: 'Weapon', armor: 'Armor', helmet: 'Helmet', shield: 'Shield', ring: 'Ring',
};
export const CATEGORY_ICONS: Record<ItemCategory, string> = {
  weapon: '⚔️', armor: '🛡️', helmet: '⛑️', shield: '🔰', ring: '💍',
};

interface ElementColors {
  primary: string;
  secondary: string;
  glow: string;
  dark: string;
  bg: string;
}

const ELEMENT_COLORS: Record<Element, ElementColors> = {
  fire:    { primary: '#ff5522', secondary: '#cc3311', glow: '#ffaa44', dark: '#882200', bg: '#1a0800' },
  water:   { primary: '#3388dd', secondary: '#2266bb', glow: '#66ccff', dark: '#114488', bg: '#000818' },
  wind:    { primary: '#66cc66', secondary: '#44aa44', glow: '#aaff88', dark: '#226622', bg: '#081808' },
  ice:     { primary: '#77ccee', secondary: '#55aacc', glow: '#aaeeff', dark: '#337799', bg: '#081018' },
  earth:   { primary: '#cc9944', secondary: '#aa7733', glow: '#ddcc66', dark: '#775522', bg: '#181008' },
  thunder: { primary: '#ffdd44', secondary: '#ccaa22', glow: '#ffff88', dark: '#887711', bg: '#181810' },
  shadow:  { primary: '#8866cc', secondary: '#6644aa', glow: '#bb88ff', dark: '#442277', bg: '#080818' },
  light:   { primary: '#eedd99', secondary: '#ccbb88', glow: '#ffffcc', dark: '#998855', bg: '#181818' },
};

export interface ItemTraits {
  category: ItemCategory;
  element: Element;
  rarity: Rarity;
  variant: number;
}

export function generateItemTraits(seed: number, category: ItemCategory, element: Element): ItemTraits {
  const r = seededRandom(seed);
  const rarityRoll = r() * 10000;
  let rarity: Rarity = 'common';
  if (rarityRoll >= 9700) rarity = 'legendary';
  else if (rarityRoll >= 9000) rarity = 'epic';
  else if (rarityRoll >= 7500) rarity = 'rare';
  else if (rarityRoll >= 5000) rarity = 'uncommon';

  return {
    category,
    element,
    rarity,
    variant: Math.floor(r() * 3),
  };
}

export function drawItem(canvas: HTMLCanvasElement, traits: ItemTraits): void {
  const ctx = canvas.getContext('2d')!;
  canvas.width = 64;
  canvas.height = 64;
  ctx.imageSmoothingEnabled = false;

  const ec = ELEMENT_COLORS[traits.element];

  // Background
  ctx.fillStyle = ec.bg;
  ctx.fillRect(0, 0, 64, 64);

  // Subtle radial glow
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = ec.glow;
  fillEllipse(ctx, 32, 32, 20, 20);
  ctx.globalAlpha = 1;

  switch (traits.category) {
    case 'weapon': drawWeapon(ctx, ec, traits); break;
    case 'armor': drawArmorItem(ctx, ec, traits); break;
    case 'helmet': drawHelmet(ctx, ec, traits); break;
    case 'shield': drawShield(ctx, ec, traits); break;
    case 'ring': drawRing(ctx, ec, traits); break;
  }

  // Rarity border
  drawRarityBorder(ctx, traits.rarity);

  // Rarity glow
  if (traits.rarity === 'epic' || traits.rarity === 'legendary') {
    drawRarityGlow(ctx, traits.rarity);
  }
}

// ── Weapon ──
function drawWeapon(ctx: CanvasRenderingContext2D, ec: ElementColors, traits: ItemTraits): void {
  switch (traits.variant) {
    case 0: // Longsword
      // Blade
      px(ctx, 30, 8, 4, 32, ec.primary);
      px(ctx, 31, 8, 2, 32, lighten(ec.primary, 1.2)); // highlight
      // Tip
      px(ctx, 31, 6, 2, 3, ec.glow);
      // Guard
      px(ctx, 26, 40, 12, 3, ec.dark);
      px(ctx, 27, 39, 10, 1, ec.secondary);
      // Grip
      px(ctx, 30, 43, 4, 10, '#443322');
      px(ctx, 31, 43, 2, 10, '#554433');
      // Pommel
      px(ctx, 30, 53, 4, 3, ec.secondary);
      px(ctx, 31, 54, 2, 1, ec.glow);
      break;
    case 1: // Battle Axe
      // Handle
      px(ctx, 31, 14, 2, 36, '#554433');
      px(ctx, 32, 14, 1, 36, '#665544');
      // Axe head left
      px(ctx, 22, 12, 10, 2, ec.primary);
      px(ctx, 20, 14, 12, 4, ec.primary);
      px(ctx, 22, 18, 10, 2, ec.primary);
      px(ctx, 21, 13, 2, 6, ec.secondary);
      // Axe head right
      px(ctx, 33, 12, 10, 2, ec.primary);
      px(ctx, 33, 14, 12, 4, ec.primary);
      px(ctx, 33, 18, 10, 2, ec.primary);
      px(ctx, 42, 13, 2, 6, ec.secondary);
      // Edge highlights
      px(ctx, 20, 15, 1, 2, ec.glow);
      px(ctx, 44, 15, 1, 2, ec.glow);
      break;
    case 2: // Magic Staff
      // Shaft
      px(ctx, 31, 18, 2, 34, '#665544');
      px(ctx, 32, 18, 1, 34, '#776655');
      // Orb
      ctx.fillStyle = ec.primary;
      fillCircle(ctx, 32, 14, 6);
      ctx.fillStyle = ec.glow;
      fillCircle(ctx, 32, 14, 3);
      px(ctx, 30, 12, 2, 2, '#ffffff'); // gleam
      // Prongs
      px(ctx, 27, 16, 2, 6, ec.dark);
      px(ctx, 35, 16, 2, 6, ec.dark);
      px(ctx, 28, 15, 1, 2, ec.secondary);
      px(ctx, 35, 15, 1, 2, ec.secondary);
      break;
  }
}

// ── Armor ──
function drawArmorItem(ctx: CanvasRenderingContext2D, ec: ElementColors, traits: ItemTraits): void {
  // Body shape
  px(ctx, 20, 16, 24, 30, ec.primary);
  // Chest plate
  px(ctx, 22, 18, 20, 8, ec.secondary);
  px(ctx, 24, 20, 16, 4, lighten(ec.primary, 1.1));
  // Collar
  px(ctx, 24, 14, 16, 3, ec.dark);
  px(ctx, 30, 12, 4, 3, ec.dark);
  // Waist
  px(ctx, 20, 40, 24, 2, ec.dark);
  px(ctx, 30, 40, 4, 2, '#ccaa44');
  // Skirt
  px(ctx, 20, 42, 10, 8, darken(ec.primary, 0.8));
  px(ctx, 34, 42, 10, 8, darken(ec.primary, 0.8));
  px(ctx, 22, 42, 20, 6, ec.primary);
  // Shoulder guards
  px(ctx, 16, 16, 6, 5, ec.secondary);
  px(ctx, 42, 16, 6, 5, ec.secondary);
  px(ctx, 17, 15, 4, 1, ec.glow);
  px(ctx, 43, 15, 4, 1, ec.glow);
  // Gem center
  if (traits.rarity !== 'common') {
    px(ctx, 30, 22, 4, 4, ec.glow);
    px(ctx, 31, 23, 2, 2, '#ffffff');
  }
}

// ── Helmet ──
function drawHelmet(ctx: CanvasRenderingContext2D, ec: ElementColors, traits: ItemTraits): void {
  // Main dome
  ctx.fillStyle = ec.primary;
  fillCircle(ctx, 32, 28, 14);
  // Darker inner
  ctx.fillStyle = ec.secondary;
  fillCircle(ctx, 32, 30, 12);
  // Face opening
  ctx.fillStyle = '#0a0a0a';
  fillEllipse(ctx, 32, 34, 8, 6);
  // Visor
  px(ctx, 24, 32, 16, 2, ec.dark);
  // Crest on top
  px(ctx, 30, 12, 4, 8, ec.glow);
  px(ctx, 31, 10, 2, 4, lighten(ec.glow, 1.2));
  // Side wings
  if (traits.variant > 0) {
    px(ctx, 14, 24, 6, 3, ec.secondary);
    px(ctx, 44, 24, 6, 3, ec.secondary);
    px(ctx, 12, 22, 4, 3, ec.primary);
    px(ctx, 48, 22, 4, 3, ec.primary);
  }
  // Brow accent
  px(ctx, 22, 28, 20, 1, ec.glow);
  // Cheek guards
  px(ctx, 20, 32, 3, 8, ec.primary);
  px(ctx, 41, 32, 3, 8, ec.primary);
  // Nose guard
  px(ctx, 31, 30, 2, 6, ec.dark);
}

// ── Shield ──
function drawShield(ctx: CanvasRenderingContext2D, ec: ElementColors, traits: ItemTraits): void {
  // Shield body (heater shape)
  for (let y = 10; y < 54; y++) {
    const progress = (y - 10) / 44;
    const halfW = Math.floor(18 * (1 - progress * progress * 0.6));
    px(ctx, 32 - halfW, y, halfW * 2, 1, ec.primary);
  }
  // Border
  for (let y = 10; y < 54; y++) {
    const progress = (y - 10) / 44;
    const halfW = Math.floor(18 * (1 - progress * progress * 0.6));
    px(ctx, 32 - halfW, y, 2, 1, ec.dark);
    px(ctx, 32 + halfW - 2, y, 2, 1, ec.dark);
  }
  px(ctx, 14, 10, 36, 2, ec.dark);
  // Cross pattern
  px(ctx, 31, 14, 2, 36, ec.secondary);
  px(ctx, 18, 28, 28, 2, ec.secondary);
  // Center boss
  ctx.fillStyle = ec.glow;
  fillCircle(ctx, 32, 28, 4);
  ctx.fillStyle = '#ffffff';
  fillCircle(ctx, 32, 28, 2);
  // Rivets
  px(ctx, 20, 16, 2, 2, ec.dark);
  px(ctx, 42, 16, 2, 2, ec.dark);
  px(ctx, 20, 38, 2, 2, ec.dark);
  px(ctx, 42, 38, 2, 2, ec.dark);
}

// ── Ring ──
function drawRing(ctx: CanvasRenderingContext2D, ec: ElementColors, traits: ItemTraits): void {
  // Ring band (thick circle)
  ctx.fillStyle = ec.secondary;
  for (let angle = 0; angle < 360; angle += 2) {
    const rad = angle * Math.PI / 180;
    const x = 32 + Math.cos(rad) * 12;
    const y = 34 + Math.sin(rad) * 12;
    ctx.fillRect(Math.floor(x), Math.floor(y), 3, 3);
  }
  // Inner empty
  ctx.fillStyle = ec.bg;
  fillCircle(ctx, 32, 34, 9);

  // Band highlight
  ctx.fillStyle = ec.glow;
  for (let angle = 200; angle < 280; angle += 3) {
    const rad = angle * Math.PI / 180;
    const x = 32 + Math.cos(rad) * 12;
    const y = 34 + Math.sin(rad) * 12;
    ctx.fillRect(Math.floor(x), Math.floor(y), 2, 2);
  }

  // Gemstone on top
  const gemSize = traits.rarity === 'legendary' ? 6 : traits.rarity === 'epic' ? 5 : 4;
  ctx.fillStyle = ec.dark;
  fillCircle(ctx, 32, 20, gemSize + 1);
  ctx.fillStyle = ec.primary;
  fillCircle(ctx, 32, 20, gemSize);
  ctx.fillStyle = ec.glow;
  fillCircle(ctx, 32, 19, gemSize - 2);
  // Gleam
  px(ctx, 30, 17, 2, 2, '#ffffff');

  // Side prongs
  px(ctx, 26, 22, 2, 4, ec.secondary);
  px(ctx, 36, 22, 2, 4, ec.secondary);
}

// ── Helpers ──
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

function drawRarityBorder(ctx: CanvasRenderingContext2D, rarity: Rarity): void {
  const colors: Record<Rarity, string> = {
    common: '#555555', uncommon: '#44cc44', rare: '#4488ff', epic: '#cc44ff', legendary: '#ffaa00',
  };
  const c = colors[rarity];
  const w = rarity === 'legendary' ? 2 : 1;
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 64, w);
  ctx.fillRect(0, 64 - w, 64, w);
  ctx.fillRect(0, 0, w, 64);
  ctx.fillRect(64 - w, 0, w, 64);
}

function drawRarityGlow(ctx: CanvasRenderingContext2D, rarity: Rarity): void {
  const color = rarity === 'legendary' ? '#ffaa00' : '#cc44ff';
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.globalAlpha = 1;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function itemToDataURL(traits: ItemTraits, scale = 4): string {
  const canvas = document.createElement('canvas');
  drawItem(canvas, traits);
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
