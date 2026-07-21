// frontend/lib/game/td/monsterData.ts
// İzo sahne tablolarından damıtıldı (kaynak: Iso*Scene.ts monster tabloları, 2026-07-22). El ile güncellenir; izo dosyaları değişirse yeniden damıt.
//
// REGION_MONSTERS: bölge başına 4-6 temsilci canavar (düşük/orta/yüksek level yayılımı).
// type/name/hp/atk/def izo tablosundan birebir alınır; level, yeni dünyanın bölgesel
// level-gate aralığına (worldMap.REGIONS[key].level) oturacak şekilde yeniden ölçeklenir
// (izo sahnelerin kendi iç level numaralandırması farklı bir ölçekte tasarlanmıştı).
//
// DUNGEON_ROSTERS: 14 kapı bölge-key'i (town/forest/grassE/grassS hariç tüm REGIONS).
// pool = bölge havuzundan türetilmiş 3-5 giriş (biraz yüksek level); boss = kaynak
// sahnenin BOSS_DATA'sı birebir (hp/atk/def/level aynı — "kontrat birebir").
// IsoDungeonScene + IsoIceCaveScene ayrı REGIONS anahtarına sahip değil; roster'ları
// sırasıyla mines ve frostwastes'i zenginleştirmek için kullanıldı (plan notu).

export interface MonsterEntry { type: string; name: string; level: number; hp: number; atk: number; def: number; isBoss?: boolean }

export const REGION_MONSTERS: Record<string, MonsterEntry[]> = {
  // ─── Forest (izo IsoForestScene, region level [1,8]) ──────────────────
  forest: [
    { type: 'skeleton', name: 'Skeleton', level: 2, hp: 35, atk: 8, def: 3 },
    { type: 'wolf', name: 'Shadow Wolf', level: 3, hp: 40, atk: 12, def: 3 },
    { type: 'spider', name: 'Forest Spider', level: 4, hp: 48, atk: 13, def: 4 },
    { type: 'treant', name: 'Dark Treant', level: 5, hp: 70, atk: 14, def: 8 },
    { type: 'storm_hawk', name: 'Storm Hawk', level: 6, hp: 55, atk: 16, def: 4 },
    { type: 'shadow_assassin', name: 'Shadow Lurker', level: 8, hp: 65, atk: 22, def: 5 },
  ],
  // ─── grassE (IsoForest alt kümesi, region level [1,10]) ──────────────
  grassE: [
    { type: 'skeleton', name: 'Skeleton', level: 2, hp: 35, atk: 8, def: 3 },
    { type: 'wolf', name: 'Shadow Wolf', level: 4, hp: 50, atk: 14, def: 4 },
    { type: 'spider', name: 'Venom Spider', level: 6, hp: 58, atk: 15, def: 5 },
    { type: 'mimic', name: 'Mimic Chest', level: 8, hp: 80, atk: 18, def: 12 },
    { type: 'shadow_assassin', name: 'Shadow Lurker', level: 10, hp: 65, atk: 22, def: 5 },
  ],
  // ─── grassS (IsoForest düşük level, region level [3,12]) ─────────────
  grassS: [
    { type: 'skeleton', name: 'Skeleton', level: 4, hp: 45, atk: 10, def: 4 },
    { type: 'wolf', name: 'Shadow Wolf', level: 6, hp: 55, atk: 16, def: 5 },
    { type: 'spider', name: 'Forest Spider', level: 8, hp: 48, atk: 13, def: 4 },
    { type: 'treant', name: 'Dark Treant', level: 10, hp: 70, atk: 14, def: 8 },
    { type: 'storm_hawk', name: 'Storm Hawk', level: 12, hp: 55, atk: 16, def: 4 },
  ],
  // ─── Swamp (IsoSwampScene, region level [12,22]) ──────────────────────
  swamp: [
    { type: 'poison_toad', name: 'Poison Toad', level: 12, hp: 60, atk: 15, def: 5 },
    { type: 'bog_crawler', name: 'Bog Crawler', level: 14, hp: 70, atk: 14, def: 6 },
    { type: 'swamp_wraith', name: 'Swamp Wraith', level: 16, hp: 90, atk: 18, def: 6 },
    { type: 'witch_apprentice', name: 'Witch Apprentice', level: 18, hp: 95, atk: 19, def: 7 },
    { type: 'fungal_beast', name: 'Giant Fungal Beast', level: 20, hp: 130, atk: 19, def: 10 },
    { type: 'witch_apprentice', name: 'Coven Initiate', level: 22, hp: 120, atk: 20, def: 8 },
  ],
  // ─── Mines (IsoMinesScene, region level [15,25]) ──────────────────────
  mines: [
    { type: 'mine_rat', name: 'Mine Rat', level: 15, hp: 75, atk: 15, def: 5 },
    { type: 'rock_golem', name: 'Rock Golem', level: 17, hp: 100, atk: 16, def: 10 },
    { type: 'gem_beetle', name: 'Gem Beetle', level: 19, hp: 95, atk: 18, def: 8 },
    { type: 'crystal_spider', name: 'Crystal Spider', level: 21, hp: 110, atk: 20, def: 9 },
    { type: 'cave_troll', name: 'Cave Troll', level: 23, hp: 160, atk: 23, def: 12 },
    { type: 'crystal_spider', name: 'Prism Spider', level: 25, hp: 150, atk: 24, def: 11 },
  ],
  // ─── Ruins (IsoRuinsScene, region level [18,28]) ──────────────────────
  ruins: [
    { type: 'vine_crawler', name: 'Vine Crawler', level: 18, hp: 310, atk: 36, def: 18 },
    { type: 'stone_sentinel', name: 'Stone Sentinel', level: 20, hp: 350, atk: 38, def: 24 },
    { type: 'ruin_ghost', name: 'Ruin Ghost', level: 22, hp: 320, atk: 42, def: 18 },
    { type: 'enchanted_armor', name: 'Enchanted Armor', level: 24, hp: 420, atk: 42, def: 28 },
    { type: 'arcane_construct', name: 'Arcane Construct', level: 26, hp: 400, atk: 44, def: 24 },
    { type: 'time_wraith', name: 'Time Wraith', level: 28, hp: 420, atk: 50, def: 23 },
  ],
  // ─── Citadel (IsoCitadelScene, region level [25,35]) ──────────────────
  citadel: [
    { type: 'cloud_wisp', name: 'Cloud Wisp', level: 25, hp: 80, atk: 19, def: 5 },
    { type: 'wind_spirit', name: 'Wind Spirit', level: 27, hp: 95, atk: 18, def: 7 },
    { type: 'storm_hawk', name: 'Storm Hawk', level: 29, hp: 120, atk: 22, def: 8 },
    { type: 'lightning_elemental', name: 'Lightning Elemental', level: 31, hp: 135, atk: 25, def: 8 },
    { type: 'sky_sentinel', name: 'Thunder Sentinel', level: 33, hp: 175, atk: 26, def: 13 },
    { type: 'lightning_elemental', name: 'Arc Elemental', level: 35, hp: 160, atk: 27, def: 9 },
  ],
  // ─── Sanctum (IsoSanctumScene, region level [20,30]) ──────────────────
  sanctum: [
    { type: 'flame_sentry', name: 'Flame Sentry', level: 20, hp: 380, atk: 40, def: 22 },
    { type: 'fire_drake', name: 'Fire Drake', level: 22, hp: 400, atk: 44, def: 22 },
    { type: 'magma_hound', name: 'Magma Hound', level: 24, hp: 360, atk: 46, def: 20 },
    { type: 'molten_smith', name: 'Molten Smith', level: 26, hp: 440, atk: 45, def: 24 },
    { type: 'dragon_priest', name: 'Dragon Priest', level: 28, hp: 480, atk: 50, def: 26 },
    { type: 'young_dragon', name: 'Young Dragon', level: 30, hp: 520, atk: 52, def: 26 },
  ],
  // ─── Crypt (IsoCryptScene, region level [22,32]) ──────────────────────
  crypt: [
    { type: 'skeleton', name: 'Skeleton', level: 22, hp: 50, atk: 12, def: 4 },
    { type: 'ghost', name: 'Crypt Ghost', level: 24, hp: 45, atk: 13, def: 3 },
    { type: 'wraith', name: 'Wraith', level: 26, hp: 70, atk: 16, def: 5 },
    { type: 'necromancer', name: 'Necromancer', level: 28, hp: 85, atk: 18, def: 7 },
    { type: 'skeleton_warrior', name: 'Skeleton Warrior', level: 30, hp: 95, atk: 19, def: 8 },
    { type: 'shadow_assassin', name: 'Shadow Assassin', level: 32, hp: 100, atk: 22, def: 7 },
  ],
  // ─── FrostWastes (IsoFrostWastesScene, region level [40,50]) ──────────
  frostwastes: [
    { type: 'frost_giant', name: 'Frost Giant', level: 40, hp: 250, atk: 30, def: 18 },
    { type: 'blizzard_wolf', name: 'Storm Wolf', level: 42, hp: 230, atk: 34, def: 15 },
    { type: 'glacier_golem', name: 'Glacier Golem', level: 44, hp: 320, atk: 34, def: 22 },
    { type: 'aurora_spirit', name: 'Aurora Spirit', level: 46, hp: 270, atk: 38, def: 14 },
    { type: 'permafrost_wyrm', name: 'Permafrost Wyrm', level: 48, hp: 400, atk: 40, def: 23 },
    { type: 'permafrost_wyrm', name: 'Elder Wyrm', level: 50, hp: 450, atk: 45, def: 24 },
  ],
  // ─── Necropolis (IsoNecropolisScene, region level [35,45]) ────────────
  necropolis: [
    { type: 'skeleton_lord', name: 'Skeleton Lord', level: 35, hp: 200, atk: 28, def: 14 },
    { type: 'plague_zombie', name: 'Plague Hulk', level: 37, hp: 280, atk: 30, def: 18 },
    { type: 'soul_reaper', name: 'Soul Reaper', level: 39, hp: 250, atk: 35, def: 14 },
    { type: 'bone_dragon', name: 'Bone Dragon', level: 41, hp: 350, atk: 36, def: 20 },
    { type: 'lich_acolyte', name: 'Lich Acolyte', level: 43, hp: 280, atk: 37, def: 16 },
    { type: 'bone_dragon', name: 'Elder Wyrm', level: 45, hp: 400, atk: 42, def: 23 },
  ],
  // ─── Volcano (IsoVolcanoScene, region level [45,55]) ──────────────────
  volcano: [
    { type: 'lava_slime', name: 'Lava Slime', level: 45, hp: 160, atk: 25, def: 10 },
    { type: 'fire_elemental', name: 'Fire Elemental', level: 47, hp: 220, atk: 30, def: 12 },
    { type: 'lava_worm', name: 'Lava Worm', level: 49, hp: 240, atk: 30, def: 10 },
    { type: 'magma_golem', name: 'Magma Golem', level: 51, hp: 350, atk: 40, def: 24 },
    { type: 'phoenix', name: 'Phoenix', level: 53, hp: 280, atk: 36, def: 14 },
    { type: 'magma_golem', name: 'Obsidian Golem', level: 55, hp: 400, atk: 45, def: 28 },
  ],
  // ─── Abyss (IsoAbyssScene, region level [40,50]) ──────────────────────
  abyss: [
    { type: 'deep_slime', name: 'Deep Slime', level: 40, hp: 160, atk: 22, def: 10 },
    { type: 'water_elemental', name: 'Water Elemental', level: 42, hp: 180, atk: 24, def: 12 },
    { type: 'jellyfish', name: 'Jellyfish', level: 44, hp: 150, atk: 28, def: 8 },
    { type: 'deep_horror', name: 'Deep Horror', level: 46, hp: 260, atk: 32, def: 16 },
    { type: 'gem_golem', name: 'Gem Golem', level: 48, hp: 320, atk: 33, def: 22 },
    { type: 'tidal_guardian', name: 'Tidal Guardian', level: 50, hp: 340, atk: 35, def: 20 },
  ],
  // ─── Forge (IsoForgeScene, region level [42,52]) ──────────────────────
  forge: [
    { type: 'forge_automaton', name: 'Forge Automaton', level: 42, hp: 550, atk: 52, def: 30 },
    { type: 'molten_giant', name: 'Molten Giant', level: 44, hp: 600, atk: 55, def: 28 },
    { type: 'steel_golem', name: 'Steel Golem', level: 46, hp: 620, atk: 54, def: 34 },
    { type: 'hammer_sentinel', name: 'Hammer Sentinel', level: 48, hp: 600, atk: 58, def: 32 },
    { type: 'magma_smith', name: 'Magma Smith', level: 50, hp: 620, atk: 62, def: 28 },
    { type: 'titan_guard', name: 'Titan Guard', level: 52, hp: 720, atk: 64, def: 36 },
  ],
  // ─── DemonGate (IsoDemonGateScene, region level [55,65]) ──────────────
  demongate: [
    { type: 'hell_hound', name: 'Hell Hound', level: 55, hp: 280, atk: 35, def: 16 },
    { type: 'lesser_demon', name: 'Lesser Demon', level: 57, hp: 310, atk: 37, def: 18 },
    { type: 'succubus', name: 'Succubus', level: 59, hp: 290, atk: 40, def: 16 },
    { type: 'pit_fiend', name: 'Pit Fiend', level: 61, hp: 370, atk: 42, def: 22 },
    { type: 'blood_knight', name: 'Blood Knight', level: 63, hp: 400, atk: 43, def: 24 },
    { type: 'infernal_mage', name: 'Infernal Mage', level: 65, hp: 400, atk: 50, def: 22 },
  ],
  // ─── VoidRealm (IsoVoidScene, region level [55,69]) ────────────────────
  voidrealm: [
    { type: 'void_stalker', name: 'Void Stalker', level: 55, hp: 420, atk: 45, def: 22 },
    { type: 'shadow_fiend', name: 'Shadow Fiend', level: 58, hp: 440, atk: 48, def: 20 },
    { type: 'chaos_sprite', name: 'Chaos Sprite', level: 61, hp: 390, atk: 50, def: 18 },
    { type: 'nightmare_beast', name: 'Nightmare Beast', level: 64, hp: 500, atk: 50, def: 26 },
    { type: 'dark_seraphim', name: 'Dark Seraphim', level: 67, hp: 500, atk: 56, def: 25 },
    { type: 'entropy_demon', name: 'Entropy Demon', level: 69, hp: 560, atk: 57, def: 28 },
  ],
  // ─── Eternal (IsoEternalScene, region level [60,69]) ───────────────────
  eternal: [
    { type: 'abyssal_terror', name: 'Abyssal Terror', level: 60, hp: 650, atk: 60, def: 30 },
    { type: 'dread_lord', name: 'Dread Lord', level: 62, hp: 700, atk: 62, def: 34 },
    { type: 'primordial_beast', name: 'Primordial Beast', level: 64, hp: 750, atk: 64, def: 32 },
    { type: 'doom_knight', name: 'Doom Knight', level: 66, hp: 780, atk: 66, def: 36 },
    { type: 'eternal_flame', name: 'Eternal Flame', level: 68, hp: 700, atk: 68, def: 28 },
    { type: 'world_eater', name: 'World Eater', level: 69, hp: 880, atk: 72, def: 36 },
  ],
};

export const DUNGEON_ROSTERS: Record<string, { pool: MonsterEntry[]; boss: MonsterEntry }> = {
  // ─── Swamp (boss: IsoSwampScene BOSS_DATA — swamp_hag, birebir) ───────
  swamp: {
    pool: [
      { type: 'swamp_wraith', name: 'Dark Swamp Wraith', level: 23, hp: 95, atk: 18, def: 7 },
      { type: 'fungal_beast', name: 'Fungal Beast', level: 24, hp: 110, atk: 17, def: 9 },
      { type: 'bog_crawler', name: 'Marsh Crawler', level: 24, hp: 105, atk: 18, def: 8 },
    ],
    boss: { type: 'swamp_hag', name: 'Swamp Hag', level: 15, hp: 350, atk: 22, def: 12, isBoss: true },
  },
  // ─── Mines (boss: IsoMinesScene BOSS_DATA — crystal_colossus, birebir;
  //     pool zenginleştirilmiş IsoDungeonScene canavarlarıyla) ──────────
  mines: {
    pool: [
      { type: 'cave_troll', name: 'Gem Troll', level: 26, hp: 175, atk: 25, def: 14 },
      { type: 'rock_golem', name: 'Iron Golem', level: 24, hp: 140, atk: 21, def: 13 },
      { type: 'ghost', name: 'Dungeon Ghost', level: 20, hp: 42, atk: 12, def: 3 },
      { type: 'necromancer', name: 'Necromancer', level: 22, hp: 75, atk: 16, def: 6 },
    ],
    boss: { type: 'crystal_colossus', name: 'Crystal Colossus', level: 18, hp: 400, atk: 28, def: 18, isBoss: true },
  },
  // ─── Ruins (boss: IsoRuinsScene BOSS_DATA — ancient_guardian, birebir) ─
  ruins: {
    pool: [
      { type: 'arcane_construct', name: 'Arcane Construct', level: 30, hp: 440, atk: 48, def: 26 },
      { type: 'time_wraith', name: 'Time Wraith', level: 31, hp: 420, atk: 50, def: 23 },
      { type: 'enchanted_armor', name: 'Enchanted Armor', level: 32, hp: 490, atk: 52, def: 30 },
    ],
    boss: { type: 'ancient_guardian', name: 'Ancient Guardian', level: 38, hp: 1100, atk: 58, def: 32, isBoss: true },
  },
  // ─── Citadel (boss: IsoCitadelScene BOSS_DATA — storm_titan, birebir) ─
  citadel: {
    pool: [
      { type: 'sky_sentinel', name: 'Sky Sentinel', level: 32, hp: 155, atk: 24, def: 12 },
      { type: 'cloud_wisp', name: 'Storm Wisp', level: 34, hp: 150, atk: 26, def: 8 },
      { type: 'storm_hawk', name: 'Tempest Hawk', level: 34, hp: 170, atk: 28, def: 10 },
    ],
    boss: { type: 'storm_titan', name: 'Storm Titan', level: 20, hp: 500, atk: 32, def: 16, isBoss: true },
  },
  // ─── Sanctum (boss: IsoSanctumScene BOSS_DATA — ancient_dragon_king, birebir) ─
  sanctum: {
    pool: [
      { type: 'undead_dragon', name: 'Undead Dragon', level: 42, hp: 650, atk: 55, def: 28 },
      { type: 'elder_wyrm', name: 'Elder Wyrm', level: 45, hp: 750, atk: 60, def: 32 },
      { type: 'golden_golem', name: 'Golden Golem', level: 40, hp: 600, atk: 48, def: 35 },
      { type: 'mimic_lord', name: 'Mimic Lord', level: 40, hp: 500, atk: 55, def: 24 },
    ],
    boss: { type: 'ancient_dragon_king', name: 'Ancient Dragon King', level: 50, hp: 1500, atk: 70, def: 40, isBoss: true },
  },
  // ─── Crypt (boss: IsoCryptScene BOSS_DATA — shadow_lord, birebir) ─────
  crypt: {
    pool: [
      { type: 'dark_knight', name: 'Dark Knight', level: 10, hp: 120, atk: 20, def: 10 },
      { type: 'skeleton', name: 'Bone Sentry', level: 9, hp: 90, atk: 18, def: 7 },
      { type: 'wraith', name: 'Dark Wraith', level: 8, hp: 72, atk: 16, def: 5 },
    ],
    boss: { type: 'shadow_lord', name: 'Shadow Lord', level: 12, hp: 300, atk: 25, def: 14, isBoss: true },
  },
  // ─── FrostWastes (boss: IsoFrostWastesScene BOSS_DATA — frost_emperor,
  //     birebir; pool zenginleştirilmiş IsoIceCaveScene canavarlarıyla) ──
  frostwastes: {
    pool: [
      { type: 'permafrost_wyrm', name: 'Elder Wyrm', level: 31, hp: 450, atk: 45, def: 24 },
      { type: 'ice_golem', name: 'Ice Golem', level: 17, hp: 210, atk: 28, def: 20 },
      { type: 'yeti', name: 'Snow Yeti', level: 20, hp: 300, atk: 35, def: 18 },
      { type: 'crystal_golem', name: 'Crystal Golem', level: 20, hp: 350, atk: 30, def: 28 },
    ],
    boss: { type: 'frost_emperor', name: 'Frost Emperor', level: 32, hp: 900, atk: 48, def: 28, isBoss: true },
  },
  // ─── Necropolis (boss: IsoNecropolisScene BOSS_DATA — lich_king, birebir) ─
  necropolis: {
    pool: [
      { type: 'soul_reaper', name: 'Dark Reaper', level: 26, hp: 270, atk: 38, def: 15 },
      { type: 'bone_dragon', name: 'Frost Dragon', level: 27, hp: 380, atk: 38, def: 21 },
      { type: 'lich_acolyte', name: 'Forge Magus', level: 28, hp: 310, atk: 40, def: 17 },
    ],
    boss: { type: 'lich_king', name: 'Lich King', level: 30, hp: 800, atk: 45, def: 25, isBoss: true },
  },
  // ─── Volcano (boss: IsoVolcanoScene BOSS_DATA — infernal_dragon, birebir) ─
  volcano: {
    pool: [
      { type: 'magma_golem', name: 'Obsidian Golem', level: 28, hp: 400, atk: 45, def: 28 },
      { type: 'fire_elemental', name: 'Inferno', level: 25, hp: 280, atk: 38, def: 16 },
      { type: 'phoenix', name: 'Phoenix', level: 24, hp: 280, atk: 36, def: 14 },
    ],
    boss: { type: 'infernal_dragon', name: 'Infernal Dragon', level: 40, hp: 800, atk: 55, def: 30, isBoss: true },
  },
  // ─── Abyss (boss: IsoAbyssScene BOSS_DATA — abyssal_leviathan, birebir) ─
  abyss: {
    pool: [
      { type: 'crystal_sentinel', name: 'Crystal Sentinel', level: 21, hp: 290, atk: 31, def: 20 },
      { type: 'maelstrom_spirit', name: 'Maelstrom Spirit', level: 22, hp: 300, atk: 34, def: 17 },
      { type: 'tidal_guardian', name: 'Tidal Guardian', level: 23, hp: 340, atk: 35, def: 20 },
    ],
    boss: { type: 'abyssal_leviathan', name: 'Abyssal Leviathan', level: 25, hp: 600, atk: 38, def: 20, isBoss: true },
  },
  // ─── Forge (boss: IsoForgeScene BOSS_DATA — titan_forgemaster, birebir) ─
  forge: {
    pool: [
      { type: 'titan_guard', name: 'Titan Guard', level: 48, hp: 800, atk: 68, def: 40 },
      { type: 'steel_golem', name: 'Steel Golem', level: 47, hp: 750, atk: 64, def: 40 },
      { type: 'molten_giant', name: 'Molten Giant', level: 46, hp: 730, atk: 64, def: 34 },
    ],
    boss: { type: 'titan_forgemaster', name: 'Titan Forgemaster', level: 50, hp: 1500, atk: 72, def: 38, isBoss: true },
  },
  // ─── DemonGate (boss: IsoDemonGateScene BOSS_DATA — demon_lord, birebir) ─
  demongate: {
    pool: [
      { type: 'pit_fiend', name: 'Pit Fiend', level: 32, hp: 460, atk: 48, def: 26 },
      { type: 'blood_knight', name: 'Blood Knight', level: 33, hp: 470, atk: 50, def: 27 },
      { type: 'infernal_mage', name: 'Infernal Mage', level: 33, hp: 400, atk: 50, def: 22 },
    ],
    boss: { type: 'demon_lord', name: 'Demon Lord', level: 35, hp: 1000, atk: 55, def: 30, isBoss: true },
  },
  // ─── VoidRealm (boss: IsoVoidScene BOSS_DATA — void_sovereign, birebir) ─
  voidrealm: {
    pool: [
      { type: 'dark_seraphim', name: 'Dark Seraphim', level: 43, hp: 580, atk: 62, def: 30 },
      { type: 'entropy_demon', name: 'Entropy Demon', level: 43, hp: 600, atk: 61, def: 30 },
      { type: 'nightmare_beast', name: 'Nightmare Beast', level: 42, hp: 590, atk: 58, def: 30 },
    ],
    boss: { type: 'void_sovereign', name: 'Void Sovereign', level: 45, hp: 1300, atk: 65, def: 35, isBoss: true },
  },
  // ─── Eternal (boss: IsoEternalScene BOSS_DATA — abyssal_overlord, birebir) ─
  eternal: {
    pool: [
      { type: 'world_eater', name: 'World Eater', level: 55, hp: 980, atk: 80, def: 40 },
      { type: 'primordial_beast', name: 'Primordial Beast', level: 55, hp: 940, atk: 78, def: 42 },
      { type: 'dread_lord', name: 'Dread Lord', level: 53, hp: 880, atk: 74, def: 40 },
    ],
    boss: { type: 'abyssal_overlord', name: 'Abyssal Overlord', level: 60, hp: 2000, atk: 85, def: 45, isBoss: true },
  },
};
