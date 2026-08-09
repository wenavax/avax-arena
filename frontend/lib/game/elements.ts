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
  // ─── Faz 9A.3: TD dünyası/zindanı kapsaması ───────────────────────────
  // Tablo yalnız 28 tip taşıyordu; monsterData.ts'in 106 tipinin 88'i 'earth'
  // fallback'ine düşüyordu (bölge teması ne olursa olsun). Ekleme YALNIZ EKLEMEDİR —
  // yukarıdaki hiçbir giriş değiştirilmedi. Yan etki: TdBattleScene'de zindan
  // boss'ları da artık gerçek elementleriyle dövüşüyor (14 boss'un 13'ü 'earth'tü).
  // Swamp
  poison_toad: 'water',
  bog_crawler: 'earth',
  swamp_wraith: 'shadow',
  witch_apprentice: 'shadow',
  fungal_beast: 'earth',
  swamp_hag: 'shadow',
  // Mines
  mine_rat: 'earth',
  rock_golem: 'earth',
  gem_beetle: 'earth',
  crystal_spider: 'ice',
  cave_troll: 'earth',
  crystal_colossus: 'ice',
  // Ruins
  vine_crawler: 'earth',
  stone_sentinel: 'earth',
  ruin_ghost: 'shadow',
  enchanted_armor: 'earth',
  arcane_construct: 'light',
  time_wraith: 'shadow',
  ancient_guardian: 'earth',
  // Citadel (gökyüzü)
  cloud_wisp: 'wind',
  wind_spirit: 'wind',
  lightning_elemental: 'thunder',
  sky_sentinel: 'thunder',
  storm_titan: 'thunder',
  // Sanctum (ejderha)
  flame_sentry: 'fire',
  fire_drake: 'fire',
  magma_hound: 'fire',
  molten_smith: 'fire',
  dragon_priest: 'fire',
  young_dragon: 'fire',
  undead_dragon: 'shadow',
  elder_wyrm: 'fire',
  golden_golem: 'light',
  mimic_lord: 'earth',
  ancient_dragon_king: 'fire',
  // Crypt
  wraith: 'shadow',
  skeleton_warrior: 'shadow',
  dark_knight: 'shadow',
  shadow_lord: 'shadow',
  // Frostwastes
  frost_giant: 'ice',
  blizzard_wolf: 'ice',
  glacier_golem: 'ice',
  aurora_spirit: 'light',
  permafrost_wyrm: 'ice',
  frost_emperor: 'ice',
  // Necropolis
  skeleton_lord: 'shadow',
  plague_zombie: 'shadow',
  soul_reaper: 'shadow',
  bone_dragon: 'shadow',
  lich_acolyte: 'shadow',
  lich_king: 'shadow',
  // Abyss (derin su)
  deep_slime: 'water',
  water_elemental: 'water',
  jellyfish: 'water',
  deep_horror: 'shadow',
  gem_golem: 'earth',
  tidal_guardian: 'water',
  crystal_sentinel: 'ice',
  maelstrom_spirit: 'water',
  abyssal_leviathan: 'water',
  // Forge
  forge_automaton: 'fire',
  molten_giant: 'fire',
  steel_golem: 'earth',
  hammer_sentinel: 'earth',
  magma_smith: 'fire',
  titan_guard: 'earth',
  titan_forgemaster: 'fire',
  // Demongate
  hell_hound: 'fire',
  lesser_demon: 'fire',
  succubus: 'shadow',
  pit_fiend: 'fire',
  blood_knight: 'shadow',
  infernal_mage: 'fire',
  demon_lord: 'fire',
  // Voidrealm
  void_stalker: 'shadow',
  shadow_fiend: 'shadow',
  chaos_sprite: 'thunder',
  nightmare_beast: 'shadow',
  dark_seraphim: 'shadow',
  entropy_demon: 'shadow',
  void_sovereign: 'shadow',
  // Eternal
  abyssal_terror: 'shadow',
  dread_lord: 'shadow',
  primordial_beast: 'earth',
  doom_knight: 'shadow',
  eternal_flame: 'fire',
  world_eater: 'earth',
  abyssal_overlord: 'shadow',
};

// Class → default element
export const CLASS_ELEMENTS: Record<string, Element> = {
  knight: 'earth',
  mage: 'fire',
  archer: 'wind',
};
