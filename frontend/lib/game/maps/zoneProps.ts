// frontend/lib/game/maps/zoneProps.ts
// Zone → görsel prop yerleşimi. SADECE görsel: collision/interact'e dokunmaz.
// allowWalkable=true olan prop'lar küçük zemin detayıdır (üstünden yürünebilir
// görünmesi doğal); büyük prop'lar yalnız collision tile'larına yerleşir.
//
// NOT: biome listeleri, ilgili sahnelerin GERÇEKTEN ürettiği biome'larla
// eşlenmiştir (her Iso*Scene tile'ları elle kuruyor; terrainGen kullanılmıyor).
// Plandaki bazı biome adları (obsidian@DemonGate, snow@Citadel/FrostWastes,
// volcanic_rock@DemonGate/Forge, sand@Ruins, water/stone_dark@Abyss) o
// sahnelerde hiç üretilmiyordu; prop'ların görünmesi için o zone'un asıl
// biome'larıyla değiştirildi/ genişletildi.
export interface ZonePropDef {
  deco: string;          // drawDecoration case anahtarı
  density: number;       // 0-1, tile başına olasılık (seeded)
  biomes: string[];      // yalnız bu biome'lara yerleşir
  allowWalkable: boolean;
}

export const ZONE_PROPS: Record<string, ZonePropDef[]> = {
  Forest:      [{ deco: 'mushroom_cluster', density: 0.020, biomes: ['grass', 'dark_grass'], allowWalkable: true },
                { deco: 'fallen_log',       density: 0.012, biomes: ['dark_grass'],          allowWalkable: false }],
  Crypt:       [{ deco: 'gravestone', density: 0.030, biomes: ['stone_dark', 'dirt', 'stone'], allowWalkable: false },
                { deco: 'bones',      density: 0.020, biomes: ['stone_dark', 'dirt', 'stone', 'cobble'], allowWalkable: true }],
  Necropolis:  [{ deco: 'gravestone', density: 0.040, biomes: ['stone_dark', 'obsidian', 'stone'], allowWalkable: false },
                { deco: 'bones',      density: 0.030, biomes: ['stone_dark', 'stone', 'cobble'], allowWalkable: true }],
  Volcano:     [{ deco: 'lava_rock',  density: 0.030, biomes: ['volcanic', 'volcanic_rock'], allowWalkable: false },
                { deco: 'ember_vent', density: 0.015, biomes: ['magma', 'volcanic'],         allowWalkable: true }],
  Sanctum:     [{ deco: 'lava_rock',  density: 0.020, biomes: ['volcanic_rock', 'obsidian', 'volcanic'], allowWalkable: false }],
  DemonGate:   [{ deco: 'lava_rock',  density: 0.025, biomes: ['volcanic', 'stone'], allowWalkable: false },
                { deco: 'bones',      density: 0.020, biomes: ['volcanic'],          allowWalkable: true }],
  IceCave:     [{ deco: 'ice_shard',  density: 0.030, biomes: ['ice', 'ice_dark'], allowWalkable: false }],
  Citadel:     [{ deco: 'ice_shard',  density: 0.020, biomes: ['snow', 'ice', 'stone'], allowWalkable: false }],
  FrostWastes: [{ deco: 'ice_shard',  density: 0.025, biomes: ['snow', 'ice'],     allowWalkable: false },
                { deco: 'bones',      density: 0.012, biomes: ['snow', 'stone'],   allowWalkable: true }],
  Swamp:       [{ deco: 'mushroom_cluster', density: 0.035, biomes: ['dark_grass', 'dirt'], allowWalkable: true },
                { deco: 'swamp_reed',       density: 0.025, biomes: ['water', 'dark_grass'], allowWalkable: true }],
  Mines:       [{ deco: 'crystal_small', density: 0.025, biomes: ['stone', 'stone_dark'], allowWalkable: false },
                { deco: 'pebbles',       density: 0.020, biomes: ['dirt', 'stone'],       allowWalkable: true }],
  Ruins:       [{ deco: 'ruin_pillar', density: 0.015, biomes: ['stone', 'sand'], allowWalkable: false },
                { deco: 'pebbles',     density: 0.025, biomes: ['stone', 'sand'], allowWalkable: true }],
  VoidRealm:   [{ deco: 'void_wisp', density: 0.020, biomes: ['obsidian', 'stone_dark'], allowWalkable: true }],
  Eternal:     [{ deco: 'void_wisp', density: 0.025, biomes: ['obsidian', 'stone_dark'], allowWalkable: true },
                { deco: 'bones',     density: 0.015, biomes: ['obsidian', 'stone_dark'], allowWalkable: true }],
  Forge:       [{ deco: 'anvil_scrap', density: 0.018, biomes: ['stone_dark', 'volcanic_rock', 'stone', 'volcanic'], allowWalkable: true }],
  Abyss:       [{ deco: 'coral',  density: 0.020, biomes: ['water', 'stone_dark', 'frozen_water', 'stone'], allowWalkable: false }],
  Dungeon:     [{ deco: 'bones',   density: 0.018, biomes: ['stone_dark', 'cobble', 'stone'], allowWalkable: true },
                { deco: 'pebbles', density: 0.020, biomes: ['stone_dark', 'stone'],           allowWalkable: true }],
  // Town bilinçli boş: hub binaları + mevcut tema dekorları yeterli, çakışma riski alma
};
