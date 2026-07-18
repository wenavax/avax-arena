// frontend/lib/game/iso/zoneAtmosphere.ts
// Zone → ekran renk banyosu + alt sis bandı. scrollFactor 0, depth 1500-1501
// (dünyanın üstü ~900, diyalog 2000'in ALTI — diyaloglar boyanmaz).
export interface ZoneAtmo {
  tint: number;      // üst renk banyosu
  tintAlpha: number; // 0.04-0.12 arası tut — oynanışı karartma
  fogColor: number;  // alt sis rengi
  fogAlpha: number;  // 0.10-0.25
}

export const ZONE_ATMOSPHERE: Record<string, ZoneAtmo> = {
  Town:        { tint: 0x88bbff, tintAlpha: 0.04, fogColor: 0xbbddff, fogAlpha: 0.10 },
  Forest:      { tint: 0x66cc88, tintAlpha: 0.05, fogColor: 0x88ccaa, fogAlpha: 0.12 },
  Dungeon:     { tint: 0x334466, tintAlpha: 0.10, fogColor: 0x222244, fogAlpha: 0.20 },
  IceCave:     { tint: 0x66bbee, tintAlpha: 0.08, fogColor: 0xaaddff, fogAlpha: 0.16 },
  Volcano:     { tint: 0xff6633, tintAlpha: 0.07, fogColor: 0x662211, fogAlpha: 0.18 },
  Crypt:       { tint: 0x554477, tintAlpha: 0.10, fogColor: 0x332244, fogAlpha: 0.20 },
  Abyss:       { tint: 0x2266aa, tintAlpha: 0.10, fogColor: 0x113355, fogAlpha: 0.22 },
  // Sanctum: Volcano ile ayrışsın diye kızıl-turuncudan altın-amber'e kaydırıldı
  // (kutsal ejder tapınağı hissi, ham lav değil).
  Sanctum:     { tint: 0xffb84d, tintAlpha: 0.08, fogColor: 0x8a5a1e, fogAlpha: 0.15 },
  // Swamp: Forest yeşilinden ayrışsın diye daha bulanık zeytin/sarı-yeşile çekildi.
  Swamp:       { tint: 0x6b7a2e, tintAlpha: 0.10, fogColor: 0x3d4a1f, fogAlpha: 0.21 },
  Mines:       { tint: 0x8899bb, tintAlpha: 0.07, fogColor: 0x445566, fogAlpha: 0.16 },
  // Citadel: buz üçlüsünde (IceCave/Citadel/FrostWastes) ortadaki ton —
  // gökyüzü/lavanta-mavi, FrostWastes'in beyazından ve IceCave camgöbeğinden farklı.
  Citadel:     { tint: 0xb0c4ff, tintAlpha: 0.06, fogColor: 0xd4defc, fogAlpha: 0.13 },
  Necropolis:  { tint: 0x443355, tintAlpha: 0.11, fogColor: 0x221133, fogAlpha: 0.22 },
  // FrostWastes: buz üçlüsünün en beyaz/soğuk ucu (kar fırtınası), Abyss'in derin
  // mavisinden ve Citadel'in lavantasından ayrık.
  FrostWastes: { tint: 0xcfeaff, tintAlpha: 0.08, fogColor: 0xeef6ff, fogAlpha: 0.18 },
  DemonGate:   { tint: 0xcc2200, tintAlpha: 0.08, fogColor: 0x551100, fogAlpha: 0.18 },
  Ruins:       { tint: 0xbbaa77, tintAlpha: 0.06, fogColor: 0x887755, fogAlpha: 0.14 },
  // VoidRealm: Necropolis'in gri-morundan ayrışsın diye daha doygun menekşe.
  VoidRealm:   { tint: 0x5a2e8f, tintAlpha: 0.12, fogColor: 0x1e0a3a, fogAlpha: 0.24 },
  Forge:       { tint: 0xdd6600, tintAlpha: 0.07, fogColor: 0x663300, fogAlpha: 0.16 },
  Eternal:     { tint: 0x330055, tintAlpha: 0.12, fogColor: 0x110022, fogAlpha: 0.24 },
};
