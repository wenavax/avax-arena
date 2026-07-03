// ─── Element Advantage System ───
// 8 elements with Pokemon-style type matchups

export type Element = 'fire' | 'water' | 'wind' | 'ice' | 'earth' | 'thunder' | 'shadow' | 'light';

export const ELEMENT_COLORS: Record<Element, number> = {
  fire: 0xff4422,
  water: 0x2288ff,
  wind: 0x88dd44,
  ice: 0x55ccff,
  earth: 0xbb8833,
  thunder: 0xffdd00,
  shadow: 0x8844cc,
  light: 0xffeeaa,
};

export const ELEMENT_ICONS: Record<Element, string> = {
  fire: '🔥', water: '💧', wind: '🍃', ice: '❄️',
  earth: '🪨', thunder: '⚡', shadow: '🌑', light: '✨',
};

// Advantage table: key beats values
const ADVANTAGES: Record<Element, Element[]> = {
  fire:    ['ice', 'wind'],
  water:   ['fire', 'earth'],
  wind:    ['water', 'earth'],
  ice:     ['wind', 'thunder'],
  earth:   ['thunder', 'fire'],
  thunder: ['water', 'ice'],
  shadow:  ['light', 'thunder'],
  light:   ['shadow', 'ice'],
};

export function getElementMultiplier(attacker: Element, defender: Element): number {
  if (ADVANTAGES[attacker]?.includes(defender)) return 1.5;
  if (ADVANTAGES[defender]?.includes(attacker)) return 0.67;
  return 1.0;
}

export function getEffectivenessText(mult: number): string {
  if (mult > 1) return 'Super effective!';
  if (mult < 1) return 'Not very effective...';
  return '';
}

// Monster type → element mapping
export const MONSTER_ELEMENTS: Record<string, Element> = {
  skeleton: 'shadow',
  ghost: 'shadow',
  demon: 'fire',
  spider: 'earth',
  bat: 'wind',
  slime: 'water',
  wolf: 'earth',
  treant: 'earth',
  dragon: 'ice',
  frost_dragon: 'ice',
  boss_frost: 'ice',
  boss_frost_v2: 'ice',
  ogre: 'earth',
  // Ice Cavern
  ice_golem: 'ice',
  frost_sprite: 'ice',
  yeti: 'ice',
  crystal_wyrm: 'ice',
  // Volcano
  fire_elemental: 'fire',
  lava_slime: 'fire',
  magma_golem: 'fire',
  infernal_dragon: 'fire',
  // New monster types
  necromancer: 'shadow',
  mimic: 'earth',
  phoenix: 'fire',
  crystal_golem: 'ice',
  venomous_hydra: 'water',
  storm_hawk: 'thunder',
  shadow_assassin: 'shadow',
  lava_worm: 'fire',
};

// Class → default element
export const CLASS_ELEMENTS: Record<string, Element> = {
  knight: 'earth',
  mage: 'fire',
  archer: 'wind',
};
