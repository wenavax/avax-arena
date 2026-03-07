import { pickIndex } from './seed';

export interface WarriorStats {
  tokenId: number;
  attack: number;
  defense: number;
  speed: number;
  element: number;
  specialPower: number;
  level: number;
  powerScore: number;
}

export interface WarriorTraits {
  bodyType: number;      // 0-3: slim, medium, muscular, heavy
  torsoTier: number;     // 0-4: cloth, leather, chain, plate, legendary
  torsoVariant: number;  // 0-1 within tier
  legTier: number;       // 0-4: same as torso
  legVariant: number;    // 0-1 within tier
  helmet: number;        // 0-7
  weapon: number;        // 0-7
  cape: number;          // 0-4 (4 = no cape)
  shield: number;        // 0-4 (4 = no shield)
  skinTone: number;      // 0-5
  faceVariant: number;   // 0-3
  eyeColor: number;      // element index
  frameTier: string;     // bronze, silver, gold
}

export const BODY_NAMES = ['slim', 'medium', 'muscular', 'heavy'] as const;
export const ARMOR_TIER_NAMES = ['cloth', 'leather', 'chain', 'plate', 'legendary'] as const;
export const HELMET_NAMES = ['hood', 'helm', 'crown', 'horns', 'wings', 'halo', 'mask', 'crystal'] as const;
export const WEAPON_NAMES = ['sword', 'axe', 'staff', 'bow', 'scythe', 'hammer', 'daggers', 'trident'] as const;
export const CAPE_NAMES = ['short', 'long', 'tattered', 'royal', 'none'] as const;
export const SHIELD_NAMES = ['buckler', 'kite', 'tower', 'orb', 'none'] as const;

/** Element weapon biases — each element prefers certain weapon indices */
const ELEMENT_WEAPON_BIAS: Record<number, number[]> = {
  0: [0, 1, 5],    // Fire: sword, axe, hammer
  1: [7, 2, 3],    // Water: trident, staff, bow
  2: [6, 3, 0],    // Wind: daggers, bow, sword
  3: [2, 0, 7],    // Ice: staff, sword, trident
  4: [5, 1, 0],    // Earth: hammer, axe, sword
  5: [2, 5, 1],    // Thunder: staff, hammer, axe
  6: [4, 6, 2],    // Shadow: scythe, daggers, staff
  7: [2, 0, 3],    // Light: staff, sword, bow
};

/** Element helmet biases for high specialPower */
const ELEMENT_HELMET: Record<number, number> = {
  0: 3, // Fire: horns
  1: 2, // Water: crown
  2: 4, // Wind: wings
  3: 7, // Ice: crystal
  4: 1, // Earth: helm
  5: 3, // Thunder: horns
  6: 6, // Shadow: mask
  7: 5, // Light: halo
};

export function resolveTraits(stats: WarriorStats, rng: () => number): WarriorTraits {
  // Body type from speed
  const bodyType = stats.speed >= 75 ? 0 : stats.speed >= 50 ? 1 : stats.speed >= 25 ? 2 : 3;

  // Armor tier from defense
  const armorTier = stats.defense >= 80 ? 4 : stats.defense >= 60 ? 3 : stats.defense >= 40 ? 2 : stats.defense >= 20 ? 1 : 0;

  // Variants from PRNG
  const torsoVariant = pickIndex(rng, 2);
  const legVariant = pickIndex(rng, 2);

  // Helmet: high specialPower → element legendary, otherwise PRNG
  const helmet = stats.specialPower > 35
    ? ELEMENT_HELMET[stats.element] ?? 0
    : pickIndex(rng, 8);

  // Weapon: element bias + attack tier
  const biasPool = ELEMENT_WEAPON_BIAS[stats.element] ?? [0, 1, 2];
  let weapon: number;
  if (stats.attack >= 70) {
    weapon = biasPool[0]; // primary element weapon
  } else if (stats.attack >= 40) {
    weapon = biasPool[pickIndex(rng, 2)]; // top 2 element weapons
  } else {
    // Low attack: pick from all with slight element bias
    weapon = rng() < 0.4 ? biasPool[pickIndex(rng, biasPool.length)] : pickIndex(rng, 8);
  }

  // Cape from defense
  const cape = stats.defense >= 80 ? 3 : stats.defense >= 60 ? 1 : stats.defense >= 40 ? 2 : stats.defense >= 20 ? 0 : 4;

  // Shield from defense
  const shield = stats.defense >= 80 ? 2 : stats.defense >= 60 ? 1 : stats.defense >= 40 ? 0 : stats.defense >= 20 ? 3 : 4;

  // Skin tone from tokenId
  const skinTone = stats.tokenId % 6;

  // Face variant from PRNG
  const faceVariant = pickIndex(rng, 4);

  // Frame from powerScore
  const frameTier = stats.powerScore >= 500 ? 'gold' : stats.powerScore >= 300 ? 'silver' : 'bronze';

  return {
    bodyType,
    torsoTier: armorTier,
    torsoVariant,
    legTier: armorTier,
    legVariant,
    helmet,
    weapon,
    cape,
    shield,
    skinTone,
    faceVariant,
    eyeColor: stats.element,
    frameTier,
  };
}
