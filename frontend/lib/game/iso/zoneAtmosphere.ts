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
  Sanctum:     { tint: 0xff8844, tintAlpha: 0.08, fogColor: 0x883322, fogAlpha: 0.16 },
  Swamp:       { tint: 0x557744, tintAlpha: 0.09, fogColor: 0x445533, fogAlpha: 0.20 },
  Mines:       { tint: 0x8899bb, tintAlpha: 0.07, fogColor: 0x445566, fogAlpha: 0.16 },
  Citadel:     { tint: 0xaaccff, tintAlpha: 0.06, fogColor: 0xcce0ff, fogAlpha: 0.14 },
  Necropolis:  { tint: 0x443355, tintAlpha: 0.11, fogColor: 0x221133, fogAlpha: 0.22 },
  FrostWastes: { tint: 0x99ccee, tintAlpha: 0.08, fogColor: 0xddeeff, fogAlpha: 0.18 },
  DemonGate:   { tint: 0xcc2200, tintAlpha: 0.08, fogColor: 0x551100, fogAlpha: 0.18 },
  Ruins:       { tint: 0xbbaa77, tintAlpha: 0.06, fogColor: 0x887755, fogAlpha: 0.14 },
  VoidRealm:   { tint: 0x442266, tintAlpha: 0.12, fogColor: 0x220044, fogAlpha: 0.24 },
  Forge:       { tint: 0xdd6600, tintAlpha: 0.07, fogColor: 0x663300, fogAlpha: 0.16 },
  Eternal:     { tint: 0x330055, tintAlpha: 0.12, fogColor: 0x110022, fogAlpha: 0.24 },
};
