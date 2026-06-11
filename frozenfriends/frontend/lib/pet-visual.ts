/**
 * FrozenFriends pet visual + personality generator.
 * Deterministic from a numeric seed — same seed always produces same pet.
 */

const COLOR_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#06b6d4', '#0e7490', '#67e8f9'], // Cyan ice
  ['#a855f7', '#7e22ce', '#d8b4fe'], // Violet frost
  ['#10b981', '#047857', '#6ee7b7'], // Emerald
  ['#f59e0b', '#b45309', '#fcd34d'], // Amber
  ['#ef4444', '#7f1d1d', '#fca5a5'], // Crimson
  ['#3b82f6', '#1e40af', '#93c5fd'], // Sapphire
  ['#fbbf24', '#92400e', '#fde68a'], // Gold
  ['#ec4899', '#831843', '#fbcfe8'], // Rose
];

const PATTERNS = ['plain', 'dots', 'stripes', 'sparkles'] as const;
const EYE_SHAPES = ['round', 'oval', 'sleepy', 'star'] as const;

const FIRST_NAMES = [
  'Pip', 'Mira', 'Zuko', 'Lumi', 'Frosty', 'Nyx', 'Vex', 'Yumi',
  'Kai', 'Bubu', 'Nori', 'Sage', 'Tofu', 'Pixie', 'Rune', 'Misty',
  'Echo', 'Snowy', 'Berry', 'Wisp', 'Cinder', 'Glace', 'Pebble', 'Aspen',
];

const ADJECTIVES = ['Bold', 'Cozy', 'Sneaky', 'Curious', 'Loyal', 'Wild', 'Wise', 'Sleepy'];

export type Pattern = (typeof PATTERNS)[number];
export type EyeShape = (typeof EYE_SHAPES)[number];

export type Pet = {
  id: string;
  seed: number;
  name: string;
  palette: readonly [string, string, string];
  pattern: Pattern;
  eyeShape: EyeShape;
  bold: number;
  social: number;
  curious: number;
  mood: number;
};

/**
 * Linear congruential PRNG for reproducible randomness.
 */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function petFromSeed(seed: number): Pet {
  const rng = makeRng(seed);
  const paletteIdx = Math.floor(rng() * COLOR_PALETTES.length);
  const patternIdx = Math.floor(rng() * PATTERNS.length);
  const eyeIdx = Math.floor(rng() * EYE_SHAPES.length);
  const bold = Math.floor(rng() * 101);
  const social = Math.floor(rng() * 101);
  const curious = Math.floor(rng() * 101);
  const adjIdx = Math.floor(rng() * ADJECTIVES.length);
  const nameIdx = Math.floor(rng() * FIRST_NAMES.length);

  return {
    id: String(seed),
    seed,
    name: `${ADJECTIVES[adjIdx]} ${FIRST_NAMES[nameIdx]}`,
    palette: COLOR_PALETTES[paletteIdx],
    pattern: PATTERNS[patternIdx],
    eyeShape: EYE_SHAPES[eyeIdx],
    bold,
    social,
    curious,
    mood: 70 + Math.floor(rng() * 20),
  };
}

export function randomPet(): Pet {
  return petFromSeed(Math.floor(Math.random() * 0x7fffffff));
}

export function applyMoodDelta(pet: Pet, delta: number): Pet {
  return { ...pet, mood: Math.max(0, Math.min(100, pet.mood + delta)) };
}

/**
 * Personality summary for UI display.
 */
export function personalityLabel(pet: Pet): string {
  const traits: string[] = [];
  if (pet.bold > 70) traits.push('Brave');
  else if (pet.bold < 30) traits.push('Timid');
  if (pet.social > 70) traits.push('Sociable');
  else if (pet.social < 30) traits.push('Loner');
  if (pet.curious > 70) traits.push('Adventurous');
  else if (pet.curious < 30) traits.push('Lazy');
  return traits.length > 0 ? traits.join(' · ') : 'Balanced';
}
