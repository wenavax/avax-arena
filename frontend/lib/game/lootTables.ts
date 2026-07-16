// ─── Monster Loot Drop Tables ───
import { InventoryItem } from './PlayerState';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xcccccc,
  uncommon: 0x44cc44,
  rare: 0x4488ff,
  epic: 0xcc44ff,
  legendary: 0xffaa00,
};

interface LootEntry {
  chance: number; // 0-1
  item: InventoryItem;
  rarity: Rarity;
}

// All droppable items
const ITEMS = {
  // Materials
  bone_shard: { id: 'bone_shard', name: 'Bone Shard', sprite: 'material', type: 'quest' as const, stackable: true, count: 1 },
  slime_gel: { id: 'slime_gel', name: 'Slime Gel', sprite: 'material', type: 'quest' as const, stackable: true, count: 1 },
  spider_silk_mat: { id: 'spider_silk_mat', name: 'Spider Silk', sprite: 'material', type: 'quest' as const, stackable: true, count: 1 },
  ectoplasm: { id: 'ectoplasm', name: 'Ectoplasm', sprite: 'material', type: 'quest' as const, stackable: true, count: 1 },
  bat_wing: { id: 'bat_wing', name: 'Bat Wing', sprite: 'material', type: 'quest' as const, stackable: true, count: 1 },
  demon_horn: { id: 'demon_horn', name: 'Demon Horn', sprite: 'material', type: 'quest' as const, stackable: true, count: 1 },
  ogre_hide: { id: 'ogre_hide', name: 'Ogre Hide', sprite: 'material', type: 'quest' as const, stackable: true, count: 1 },

  // Potions
  potion_hp: { id: 'potion_hp', name: 'Health Potion', sprite: 'potion', type: 'potion' as const, stat: { hp: 40 }, stackable: true, count: 1 },
  potion_mp: { id: 'potion_mp', name: 'Mana Potion', sprite: 'potion', type: 'potion' as const, stat: { mp: 20 }, stackable: true, count: 1 },
  speed_tonic: { id: 'speed_tonic', name: 'Speed Tonic', sprite: 'potion', type: 'potion' as const, stat: { spd: 3 }, stackable: true, count: 1 },

  // Weapons
  iron_sword: { id: 'iron_sword', name: 'Iron Sword', sprite: 'weapon', type: 'weapon' as const, stat: { atk: 5 }, stackable: false, count: 1 },
  flame_sword: { id: 'flame_sword', name: 'Flame Sword', sprite: 'weapon', type: 'weapon' as const, stat: { atk: 15 }, stackable: false, count: 1 },
  ice_blade: { id: 'ice_blade', name: 'Ice Blade', sprite: 'weapon', type: 'weapon' as const, stat: { atk: 18 }, stackable: false, count: 1 },
  shadow_dagger: { id: 'shadow_dagger', name: 'Shadow Dagger', sprite: 'weapon', type: 'weapon' as const, stat: { atk: 10 }, stackable: false, count: 1 },

  // Armor
  leather_armor: { id: 'leather_armor', name: 'Leather Armor', sprite: 'armor', type: 'armor' as const, stat: { def: 4 }, stackable: false, count: 1 },
  spider_silk_armor: { id: 'spider_silk_armor', name: 'Spider Silk Armor', sprite: 'armor', type: 'armor' as const, stat: { def: 10 }, stackable: false, count: 1 },
  heavy_armor: { id: 'heavy_armor', name: 'Heavy Plate', sprite: 'armor', type: 'armor' as const, stat: { def: 20 }, stackable: false, count: 1 },
  dragon_scale: { id: 'dragon_scale', name: 'Dragon Scale Armor', sprite: 'armor', type: 'armor' as const, stat: { def: 16 }, stackable: false, count: 1 },

  // Accessories
  ghost_cloak: { id: 'ghost_cloak', name: 'Ghost Cloak', sprite: 'accessory', type: 'accessory' as const, stat: { spd: 5 }, stackable: false, count: 1 },
  fire_amulet: { id: 'fire_amulet', name: 'Fire Amulet', sprite: 'accessory', type: 'accessory' as const, stat: { atk: 3 }, stackable: false, count: 1 },
  frost_pendant: { id: 'frost_pendant', name: 'Frost Pendant', sprite: 'accessory', type: 'accessory' as const, stat: { def: 4, spd: 2 }, stackable: false, count: 1 },
  shadow_cape: { id: 'shadow_cape', name: 'Shadow Cape', sprite: 'accessory', type: 'accessory' as const, stat: { spd: 8 }, stackable: false, count: 1 },

  // Rings
  ring_vitality: { id: 'ring_vitality', name: 'Ring of Vitality', sprite: 'ring', type: 'ring' as const, stat: { hp: 30 }, stackable: false, count: 1 },
  ring_power: { id: 'ring_power', name: 'Ring of Power', sprite: 'ring', type: 'ring' as const, stat: { atk: 5 }, stackable: false, count: 1 },
  ring_speed: { id: 'ring_speed', name: 'Ring of Speed', sprite: 'ring', type: 'ring' as const, stat: { spd: 5 }, stackable: false, count: 1 },
  ring_elements: { id: 'ring_elements', name: 'Elemental Ring', sprite: 'ring', type: 'ring' as const, stat: { atk: 3, def: 3, spd: 3 }, stackable: false, count: 1 },

  // Legendary items
  excalibur: { id: 'excalibur', name: 'Excalibur', sprite: 'weapon', type: 'weapon' as const, stat: { atk: 25 }, stackable: false, count: 1 },
  aegis_shield: { id: 'aegis_shield', name: 'Aegis Armor', sprite: 'armor', type: 'armor' as const, stat: { def: 25 }, stackable: false, count: 1 },
  ancient_amulet: { id: 'ancient_amulet', name: 'Ancient Amulet', sprite: 'accessory', type: 'accessory' as const, stat: { atk: 5, def: 5, spd: 5 }, stackable: false, count: 1 },
  dragon_ring: { id: 'dragon_ring', name: 'Dragon Soul Ring', sprite: 'ring', type: 'ring' as const, stat: { atk: 8, spd: 4 }, stackable: false, count: 1 },
};

const LOOT_TABLES: Record<string, LootEntry[]> = {
  skeleton: [
    { chance: 0.20, item: ITEMS.bone_shard, rarity: 'common' },
    { chance: 0.10, item: ITEMS.iron_sword, rarity: 'uncommon' },
    { chance: 0.05, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  slime: [
    { chance: 0.25, item: ITEMS.slime_gel, rarity: 'common' },
    { chance: 0.10, item: ITEMS.potion_hp, rarity: 'common' },
    { chance: 0.05, item: ITEMS.speed_tonic, rarity: 'uncommon' },
  ],
  spider: [
    { chance: 0.20, item: ITEMS.spider_silk_mat, rarity: 'common' },
    { chance: 0.10, item: ITEMS.leather_armor, rarity: 'uncommon' },
    { chance: 0.05, item: ITEMS.spider_silk_armor, rarity: 'rare' },
  ],
  ghost: [
    { chance: 0.15, item: ITEMS.ectoplasm, rarity: 'common' },
    { chance: 0.08, item: ITEMS.shadow_dagger, rarity: 'rare' },
    { chance: 0.05, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.04, item: ITEMS.ghost_cloak, rarity: 'rare' },
  ],
  bat: [
    { chance: 0.20, item: ITEMS.bat_wing, rarity: 'common' },
    { chance: 0.10, item: ITEMS.potion_hp, rarity: 'common' },
    { chance: 0.05, item: ITEMS.speed_tonic, rarity: 'uncommon' },
  ],
  demon: [
    { chance: 0.15, item: ITEMS.demon_horn, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.05, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.04, item: ITEMS.fire_amulet, rarity: 'rare' },
  ],
  ogre: [
    { chance: 0.15, item: ITEMS.ogre_hide, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.05, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  dragon: [
    { chance: 0.50, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.potion_mp, rarity: 'uncommon' },
  ],
  frost_dragon: [
    { chance: 0.50, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.potion_mp, rarity: 'uncommon' },
  ],
  boss_frost: [
    { chance: 0.50, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.potion_mp, rarity: 'uncommon' },
  ],
  boss_frost_v2: [
    { chance: 0.65, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.40, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.30, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.20, item: ITEMS.potion_mp, rarity: 'uncommon' },
  ],
  wolf: [
    { chance: 0.15, item: ITEMS.leather_armor, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  treant: [
    { chance: 0.15, item: ITEMS.potion_hp, rarity: 'common' },
    { chance: 0.10, item: ITEMS.potion_mp, rarity: 'uncommon' },
  ],
  // Ice Cavern monsters
  ice_golem: [
    { chance: 0.15, item: ITEMS.ice_blade, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.heavy_armor, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  frost_sprite: [
    { chance: 0.12, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.speed_tonic, rarity: 'uncommon' },
  ],
  yeti: [
    { chance: 0.20, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.ice_blade, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  crystal_wyrm: [
    { chance: 0.60, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.40, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.frost_pendant, rarity: 'epic' },
    { chance: 0.08, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.05, item: ITEMS.ring_elements, rarity: 'legendary' },
  ],
  // Volcano monsters
  fire_elemental: [
    { chance: 0.15, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.potion_mp, rarity: 'uncommon' },
  ],
  lava_slime: [
    { chance: 0.12, item: ITEMS.potion_hp, rarity: 'common' },
    { chance: 0.08, item: ITEMS.leather_armor, rarity: 'uncommon' },
  ],
  magma_golem: [
    { chance: 0.20, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.15, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  infernal_dragon: [
    { chance: 0.70, item: ITEMS.flame_sword, rarity: 'epic' },
    { chance: 0.50, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.35, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.20, item: ITEMS.fire_amulet, rarity: 'epic' },
    { chance: 0.10, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.08, item: ITEMS.dragon_ring, rarity: 'legendary' },
    { chance: 0.05, item: ITEMS.aegis_shield, rarity: 'legendary' },
  ],
  // New monster types
  necromancer: [
    { chance: 0.20, item: ITEMS.ectoplasm, rarity: 'uncommon' },
    { chance: 0.12, item: ITEMS.shadow_dagger, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.05, item: ITEMS.shadow_cape, rarity: 'rare' },
    { chance: 0.03, item: ITEMS.ancient_amulet, rarity: 'legendary' },
  ],
  mimic: [
    { chance: 0.40, item: ITEMS.potion_hp, rarity: 'common' },
    { chance: 0.25, item: ITEMS.iron_sword, rarity: 'uncommon' },
    { chance: 0.15, item: ITEMS.leather_armor, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.flame_sword, rarity: 'rare' },
  ],
  phoenix: [
    { chance: 0.18, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.speed_tonic, rarity: 'uncommon' },
    { chance: 0.06, item: ITEMS.fire_amulet, rarity: 'rare' },
    { chance: 0.03, item: ITEMS.dragon_ring, rarity: 'legendary' },
  ],
  crystal_golem: [
    { chance: 0.18, item: ITEMS.ice_blade, rarity: 'rare' },
    { chance: 0.15, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.dragon_scale, rarity: 'epic' },
  ],
  venomous_hydra: [
    { chance: 0.20, item: ITEMS.spider_silk_armor, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.potion_hp, rarity: 'common' },
    { chance: 0.08, item: ITEMS.speed_tonic, rarity: 'uncommon' },
  ],
  storm_hawk: [
    { chance: 0.15, item: ITEMS.speed_tonic, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.shadow_dagger, rarity: 'rare' },
  ],
  shadow_assassin: [
    { chance: 0.20, item: ITEMS.shadow_dagger, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.ectoplasm, rarity: 'uncommon' },
    { chance: 0.05, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.06, item: ITEMS.shadow_cape, rarity: 'rare' },
    { chance: 0.03, item: ITEMS.ring_speed, rarity: 'rare' },
  ],
  lava_worm: [
    { chance: 0.15, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.demon_horn, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.potion_hp, rarity: 'common' },
  ],

  // ─── Crypt of Shadows (Easy Lv 5-12) ───
  wraith: [
    { chance: 0.15, item: ITEMS.ectoplasm, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.shadow_dagger, rarity: 'uncommon' },
    { chance: 0.05, item: ITEMS.potion_mp, rarity: 'common' },
  ],
  skeleton_warrior: [
    { chance: 0.20, item: ITEMS.bone_shard, rarity: 'uncommon' },
    { chance: 0.12, item: ITEMS.iron_sword, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.leather_armor, rarity: 'uncommon' },
  ],
  dark_knight: [
    { chance: 0.18, item: ITEMS.iron_sword, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.shadow_cape, rarity: 'rare' },
  ],
  shadow_lord: [
    { chance: 0.60, item: ITEMS.shadow_dagger, rarity: 'epic' },
    { chance: 0.45, item: ITEMS.shadow_cape, rarity: 'epic' },
    { chance: 0.30, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.20, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.ancient_amulet, rarity: 'legendary' },
  ],

  // ─── Abyssal Depths (Medium Lv 15-25) ───
  water_elemental: [
    { chance: 0.15, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.frost_pendant, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.speed_tonic, rarity: 'uncommon' },
  ],
  sea_serpent: [
    { chance: 0.18, item: ITEMS.ice_blade, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.spider_silk_armor, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  deep_lurker: [
    { chance: 0.15, item: ITEMS.shadow_dagger, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.ghost_cloak, rarity: 'rare' },
  ],
  arcane_wisp: [
    { chance: 0.20, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.ring_elements, rarity: 'rare' },
  ],
  deep_horror: [
    { chance: 0.20, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.15, item: ITEMS.shadow_cape, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.ring_power, rarity: 'rare' },
  ],
  crystal_sentinel: [
    { chance: 0.20, item: ITEMS.ice_blade, rarity: 'rare' },
    { chance: 0.15, item: ITEMS.dragon_scale, rarity: 'rare' },
    { chance: 0.08, item: ITEMS.frost_pendant, rarity: 'rare' },
  ],
  tidal_guardian: [
    { chance: 0.22, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.frost_pendant, rarity: 'epic' },
    { chance: 0.10, item: ITEMS.ring_vitality, rarity: 'rare' },
  ],
  abyssal_leviathan: [
    { chance: 0.70, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.55, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.40, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.30, item: ITEMS.frost_pendant, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.10, item: ITEMS.aegis_shield, rarity: 'legendary' },
    { chance: 0.08, item: ITEMS.ring_elements, rarity: 'legendary' },
  ],

  // ─── Dragon's Sanctum (Hard Lv 30-50) ───
  flame_sentry: [
    { chance: 0.15, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.fire_amulet, rarity: 'rare' },
  ],
  obsidian_guard: [
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.demon_horn, rarity: 'uncommon' },
  ],
  fire_drake: [
    { chance: 0.20, item: ITEMS.flame_sword, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.dragon_scale, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.fire_amulet, rarity: 'rare' },
  ],
  forge_golem: [
    { chance: 0.22, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.iron_sword, rarity: 'rare' },
  ],
  dragon_priest: [
    { chance: 0.25, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.18, item: ITEMS.fire_amulet, rarity: 'epic' },
    { chance: 0.12, item: ITEMS.ancient_amulet, rarity: 'epic' },
  ],
  young_dragon: [
    { chance: 0.30, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.20, item: ITEMS.flame_sword, rarity: 'epic' },
    { chance: 0.10, item: ITEMS.dragon_ring, rarity: 'epic' },
  ],
  mimic_lord: [
    { chance: 0.50, item: ITEMS.potion_hp, rarity: 'uncommon' },
    { chance: 0.35, item: ITEMS.flame_sword, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.excalibur, rarity: 'legendary' },
  ],
  golden_golem: [
    { chance: 0.30, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.20, item: ITEMS.ring_power, rarity: 'epic' },
    { chance: 0.12, item: ITEMS.aegis_shield, rarity: 'legendary' },
  ],
  undead_dragon: [
    { chance: 0.35, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.excalibur, rarity: 'legendary' },
  ],
  death_knight: [
    { chance: 0.30, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.20, item: ITEMS.shadow_dagger, rarity: 'epic' },
    { chance: 0.10, item: ITEMS.aegis_shield, rarity: 'legendary' },
  ],
  elder_wyrm: [
    { chance: 0.40, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.30, item: ITEMS.flame_sword, rarity: 'epic' },
    { chance: 0.20, item: ITEMS.dragon_ring, rarity: 'legendary' },
    { chance: 0.12, item: ITEMS.excalibur, rarity: 'legendary' },
  ],
  flame_archon: [
    { chance: 0.35, item: ITEMS.flame_sword, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.fire_amulet, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.ancient_amulet, rarity: 'legendary' },
  ],
  // ─── Haunted Swamp (Lv 8-15) ───
  bog_crawler: [
    { chance: 0.15, item: ITEMS.slime_gel, rarity: 'common' },
    { chance: 0.08, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  poison_toad: [
    { chance: 0.15, item: ITEMS.speed_tonic, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  swamp_wraith: [
    { chance: 0.15, item: ITEMS.ectoplasm, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.shadow_dagger, rarity: 'uncommon' },
  ],
  fungal_beast: [
    { chance: 0.18, item: ITEMS.leather_armor, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  swamp_hag: [
    { chance: 0.55, item: ITEMS.shadow_cape, rarity: 'epic' },
    { chance: 0.40, item: ITEMS.spider_silk_armor, rarity: 'epic' },
    { chance: 0.25, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.ancient_amulet, rarity: 'legendary' },
  ],

  // ─── Crystal Mines (Lv 10-18) ───
  mine_rat: [
    { chance: 0.12, item: ITEMS.bone_shard, rarity: 'common' },
    { chance: 0.08, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  rock_golem: [
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.iron_sword, rarity: 'uncommon' },
  ],
  gem_beetle: [
    { chance: 0.20, item: ITEMS.ring_vitality, rarity: 'uncommon' },
    { chance: 0.10, item: ITEMS.speed_tonic, rarity: 'uncommon' },
  ],
  cave_troll: [
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.iron_sword, rarity: 'rare' },
  ],
  crystal_colossus: [
    { chance: 0.60, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.45, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.30, item: ITEMS.ring_elements, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.excalibur, rarity: 'legendary' },
  ],

  // ─── Sky Citadel (Lv 12-20) ───
  wind_spirit: [
    { chance: 0.15, item: ITEMS.speed_tonic, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.ghost_cloak, rarity: 'uncommon' },
  ],
  lightning_elemental: [
    { chance: 0.15, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.ring_speed, rarity: 'rare' },
  ],
  sky_sentinel: [
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.frost_pendant, rarity: 'rare' },
  ],
  storm_titan: [
    { chance: 0.60, item: ITEMS.excalibur, rarity: 'epic' },
    { chance: 0.50, item: ITEMS.aegis_shield, rarity: 'epic' },
    { chance: 0.35, item: ITEMS.ring_speed, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.ancient_amulet, rarity: 'legendary' },
  ],

  // ─── Necropolis (Lv 20-30) ───
  skeleton_lord: [
    { chance: 0.20, item: ITEMS.bone_shard, rarity: 'rare' },
    { chance: 0.15, item: ITEMS.heavy_armor, rarity: 'rare' },
  ],
  plague_zombie: [
    { chance: 0.12, item: ITEMS.leather_armor, rarity: 'uncommon' },
    { chance: 0.08, item: ITEMS.potion_hp, rarity: 'common' },
  ],
  bone_dragon: [
    { chance: 0.25, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.ice_blade, rarity: 'rare' },
  ],
  soul_reaper: [
    { chance: 0.20, item: ITEMS.shadow_dagger, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.shadow_cape, rarity: 'epic' },
  ],
  lich_king: [
    { chance: 0.70, item: ITEMS.shadow_dagger, rarity: 'legendary' },
    { chance: 0.55, item: ITEMS.aegis_shield, rarity: 'epic' },
    { chance: 0.40, item: ITEMS.ancient_amulet, rarity: 'legendary' },
    { chance: 0.25, item: ITEMS.dragon_ring, rarity: 'legendary' },
  ],

  // ─── Frost Wastes (Lv 22-32) ───
  frost_giant: [
    { chance: 0.20, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.15, item: ITEMS.ice_blade, rarity: 'rare' },
  ],
  blizzard_wolf: [
    { chance: 0.15, item: ITEMS.frost_pendant, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.speed_tonic, rarity: 'uncommon' },
  ],
  glacier_golem: [
    { chance: 0.22, item: ITEMS.ice_blade, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.heavy_armor, rarity: 'epic' },
  ],
  frost_emperor: [
    { chance: 0.70, item: ITEMS.ice_blade, rarity: 'legendary' },
    { chance: 0.55, item: ITEMS.aegis_shield, rarity: 'epic' },
    { chance: 0.40, item: ITEMS.frost_pendant, rarity: 'legendary' },
    { chance: 0.20, item: ITEMS.ring_elements, rarity: 'legendary' },
  ],

  // ─── Demon's Gate (Lv 25-35) ───
  hell_hound: [
    { chance: 0.15, item: ITEMS.flame_sword, rarity: 'rare' },
    { chance: 0.10, item: ITEMS.fire_amulet, rarity: 'rare' },
  ],
  lesser_demon: [
    { chance: 0.18, item: ITEMS.demon_horn, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.flame_sword, rarity: 'rare' },
  ],
  pit_fiend: [
    { chance: 0.22, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.flame_sword, rarity: 'epic' },
  ],
  demon_lord: [
    { chance: 0.75, item: ITEMS.flame_sword, rarity: 'legendary' },
    { chance: 0.60, item: ITEMS.dragon_scale, rarity: 'legendary' },
    { chance: 0.40, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.25, item: ITEMS.dragon_ring, rarity: 'legendary' },
  ],

  // ─── Ancient Ruins (Lv 28-38) ───
  stone_sentinel: [
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'rare' },
    { chance: 0.12, item: ITEMS.ring_power, rarity: 'rare' },
  ],
  arcane_construct: [
    { chance: 0.20, item: ITEMS.potion_mp, rarity: 'uncommon' },
    { chance: 0.15, item: ITEMS.ring_elements, rarity: 'rare' },
  ],
  enchanted_armor: [
    { chance: 0.25, item: ITEMS.aegis_shield, rarity: 'epic' },
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'epic' },
  ],
  ancient_guardian: [
    { chance: 0.70, item: ITEMS.aegis_shield, rarity: 'legendary' },
    { chance: 0.55, item: ITEMS.ancient_amulet, rarity: 'legendary' },
    { chance: 0.40, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.25, item: ITEMS.ring_elements, rarity: 'legendary' },
  ],

  // ─── Void Realm (Lv 35-45) ───
  void_stalker: [
    { chance: 0.18, item: ITEMS.shadow_dagger, rarity: 'epic' },
    { chance: 0.12, item: ITEMS.shadow_cape, rarity: 'epic' },
  ],
  shadow_fiend: [
    { chance: 0.20, item: ITEMS.shadow_cape, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.ring_speed, rarity: 'epic' },
  ],
  nightmare_beast: [
    { chance: 0.22, item: ITEMS.dragon_scale, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.ancient_amulet, rarity: 'epic' },
  ],
  void_sovereign: [
    { chance: 0.80, item: ITEMS.shadow_cape, rarity: 'legendary' },
    { chance: 0.65, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.50, item: ITEMS.aegis_shield, rarity: 'legendary' },
    { chance: 0.35, item: ITEMS.ancient_amulet, rarity: 'legendary' },
    { chance: 0.20, item: ITEMS.dragon_ring, rarity: 'legendary' },
  ],

  // ─── Titan's Forge (Lv 40-50) ───
  forge_automaton: [
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'epic' },
    { chance: 0.12, item: ITEMS.iron_sword, rarity: 'epic' },
  ],
  molten_giant: [
    { chance: 0.22, item: ITEMS.flame_sword, rarity: 'epic' },
    { chance: 0.15, item: ITEMS.dragon_scale, rarity: 'epic' },
  ],
  steel_golem: [
    { chance: 0.25, item: ITEMS.aegis_shield, rarity: 'epic' },
    { chance: 0.18, item: ITEMS.heavy_armor, rarity: 'epic' },
  ],
  titan_forgemaster: [
    { chance: 0.85, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.70, item: ITEMS.aegis_shield, rarity: 'legendary' },
    { chance: 0.55, item: ITEMS.dragon_ring, rarity: 'legendary' },
    { chance: 0.40, item: ITEMS.ancient_amulet, rarity: 'legendary' },
    { chance: 0.30, item: ITEMS.ring_elements, rarity: 'legendary' },
  ],

  // ─── Eternal Abyss (Lv 45-60) ───
  abyssal_terror: [
    { chance: 0.22, item: ITEMS.shadow_dagger, rarity: 'epic' },
    { chance: 0.18, item: ITEMS.dragon_scale, rarity: 'epic' },
  ],
  dread_lord: [
    { chance: 0.25, item: ITEMS.excalibur, rarity: 'epic' },
    { chance: 0.20, item: ITEMS.aegis_shield, rarity: 'epic' },
  ],
  doom_knight: [
    { chance: 0.28, item: ITEMS.heavy_armor, rarity: 'legendary' },
    { chance: 0.20, item: ITEMS.dragon_ring, rarity: 'epic' },
  ],
  world_eater: [
    { chance: 0.30, item: ITEMS.dragon_scale, rarity: 'legendary' },
    { chance: 0.22, item: ITEMS.ancient_amulet, rarity: 'legendary' },
  ],
  abyssal_overlord: [
    { chance: 0.90, item: ITEMS.dragon_scale, rarity: 'legendary' },
    { chance: 0.80, item: ITEMS.flame_sword, rarity: 'legendary' },
    { chance: 0.70, item: ITEMS.excalibur, rarity: 'legendary' },
    { chance: 0.60, item: ITEMS.aegis_shield, rarity: 'legendary' },
    { chance: 0.50, item: ITEMS.dragon_ring, rarity: 'legendary' },
    { chance: 0.40, item: ITEMS.ancient_amulet, rarity: 'legendary' },
    { chance: 0.30, item: ITEMS.ring_elements, rarity: 'legendary' },
  ],
};

export interface LootResult {
  item: InventoryItem;
  rarity: Rarity;
}

export function rollLoot(monsterType: string, isElite: boolean = false): LootResult[] {
  // Elite monsters use base type's loot table but with 2x drop chance + guaranteed rare+
  const baseType = monsterType.replace(/^elite_/, '');
  const table = LOOT_TABLES[baseType] || LOOT_TABLES[monsterType];
  if (!table) return [];

  const drops: LootResult[] = [];
  const chanceMultiplier = isElite ? 2.0 : 1.0;
  for (const entry of table) {
    if (Math.random() < entry.chance * chanceMultiplier) {
      // Elites upgrade rarity by 1 tier
      let rarity = entry.rarity;
      if (isElite) {
        const upgrade: Record<string, Rarity> = { common: 'uncommon', uncommon: 'rare', rare: 'epic', epic: 'legendary' };
        rarity = upgrade[rarity] || rarity;
      }
      drops.push({ item: { ...entry.item, count: 1 }, rarity });
    }
  }
  return drops;
}
