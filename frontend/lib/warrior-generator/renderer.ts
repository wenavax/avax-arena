/**
 * Katman compositing + SVG render
 * Takes selected layers, colors them, composites into final pixel grid, renders as SVG rects
 */

import { ELEMENT_PALETTES, SKIN_TONES, getArmorColors } from './palettes';
import { ARMOR_TIER_NAMES, type WarriorTraits, type WarriorStats } from './traits';
import { BODIES } from './layers/bodies';
import { TORSOS } from './layers/torsos';
import { LEGS } from './layers/legs';
import { HELMETS } from './layers/helmets';
import { WEAPONS } from './layers/weapons';
import { CAPES } from './layers/capes';
import { SHIELDS } from './layers/shields';
import { FACES } from './layers/faces';

const GRID_W = 24;
const GRID_H = 32;

interface ColoredPixel {
  color: string;
  opacity: number;
}

type CompositeGrid = (ColoredPixel | null)[][];

function emptyComposite(): CompositeGrid {
  return Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(null));
}

/** Color a layer grid using a 4-color palette */
function colorLayer(
  grid: number[][],
  palette: { c1: string; c2: string; c3: string; c4: string },
): CompositeGrid {
  const result = emptyComposite();
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const v = grid[r]?.[c] ?? 0;
      if (v === 0) continue;
      const color = v === 1 ? palette.c1 : v === 2 ? palette.c2 : v === 3 ? palette.c3 : palette.c4;
      result[r][c] = { color, opacity: 1 };
    }
  }
  return result;
}

/** Composite src layer on top of dst (src overwrites non-null pixels) */
function compositeOn(dst: CompositeGrid, src: CompositeGrid): void {
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      if (src[r][c] !== null) {
        dst[r][c] = src[r][c];
      }
    }
  }
}

/** Render composite grid to SVG rect elements */
function renderGrid(grid: CompositeGrid, offsetX: number, offsetY: number, pixelSize: number): string {
  let rects = '';
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const px = grid[r][c];
      if (!px) continue;
      const x = offsetX + c * pixelSize;
      const y = offsetY + r * pixelSize;
      rects += `<rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="${px.color}"`;
      if (px.opacity < 1) rects += ` opacity="${px.opacity}"`;
      rects += '/>';
    }
  }
  return rects;
}

export function renderWarrior(
  traits: WarriorTraits,
  stats: WarriorStats,
): string {
  const ep = ELEMENT_PALETTES[stats.element] ?? ELEMENT_PALETTES[0];
  const skin = SKIN_TONES[traits.skinTone] ?? SKIN_TONES[0];
  const armorTierName = ARMOR_TIER_NAMES[traits.torsoTier] ?? 'cloth';
  const armorC = getArmorColors(armorTierName, stats.element);

  // Color palettes for each layer type
  const skinPalette = { c1: skin, c2: darken(skin, 0.15), c3: lighten(skin, 0.15), c4: skin };
  const armorPalette = { c1: armorC.primary, c2: armorC.secondary, c3: armorC.dark, c4: blendHL(armorC.primary) };
  const elementPalette = { c1: ep.primary, c2: ep.secondary, c3: ep.dark, c4: ep.highlight };
  const facePalette = { c1: skin, c2: darken(skin, 0.2), c3: '#1a1a2e', c4: ep.primary }; // eyes = element color

  // Build composite — back to front ordering
  const composite = emptyComposite();

  // 1. Cape (behind body)
  if (traits.cape < 4) {
    compositeOn(composite, colorLayer(CAPES[traits.cape], elementPalette));
  }

  // 2. Body (skin)
  compositeOn(composite, colorLayer(BODIES[traits.bodyType], skinPalette));

  // 3. Legs
  const legIdx = traits.legTier * 2 + traits.legVariant;
  compositeOn(composite, colorLayer(LEGS[legIdx], armorPalette));

  // 4. Torso armor
  const torsoIdx = traits.torsoTier * 2 + traits.torsoVariant;
  compositeOn(composite, colorLayer(TORSOS[torsoIdx], armorPalette));

  // 5. Face
  compositeOn(composite, colorLayer(FACES[traits.faceVariant], facePalette));

  // 6. Helmet
  compositeOn(composite, colorLayer(HELMETS[traits.helmet], elementPalette));

  // 7. Shield (left hand)
  if (traits.shield < 4) {
    compositeOn(composite, colorLayer(SHIELDS[traits.shield], elementPalette));
  }

  // 8. Weapon (right hand, on top)
  compositeOn(composite, colorLayer(WEAPONS[traits.weapon], {
    c1: '#C0C0C0', // blade metal
    c2: '#6B4226', // handle wood
    c3: '#404040', // edge dark
    c4: '#FFFFFF', // shine
  }));

  // Render to SVG — upscale 24x32 → centered in 1024x1024
  const size = 1024;
  const pixelSize = Math.floor(size / GRID_H); // 32px per pixel
  const gridPixelW = GRID_W * pixelSize;
  const gridPixelH = GRID_H * pixelSize;
  const offsetX = Math.floor((size - gridPixelW) / 2);
  const offsetY = Math.floor((size - gridPixelH) / 2) - 40;

  return renderGrid(composite, offsetX, offsetY, pixelSize);
}

// Utility: darken a hex color
function darken(hex: string, amount: number): string {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Utility: lighten a hex color
function lighten(hex: string, amount: number): string {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * (1 + amount)));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * (1 + amount)));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * (1 + amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Utility: blend with white for highlight
function blendHL(hex: string): string {
  return lighten(hex, 0.5);
}

export { GRID_W, GRID_H };
