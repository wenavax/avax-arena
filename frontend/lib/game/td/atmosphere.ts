// frontend/lib/game/td/atmosphere.ts
// ─── Bölge → renk banyosu (iso zoneAtmosphere değerlerinin TD portu) ───
export interface TdAtmo { tint: number; tintAlpha: number; fogColor: number; fogAlpha: number }

const ATMO: Record<string, TdAtmo> = {
  Town:        { tint: 0x88bbff, tintAlpha: 0.04, fogColor: 0xbbddff, fogAlpha: 0.10 },
  Forest:      { tint: 0x66cc88, tintAlpha: 0.05, fogColor: 0x88ccaa, fogAlpha: 0.12 },
  IceCave:     { tint: 0x66bbee, tintAlpha: 0.08, fogColor: 0xaaddff, fogAlpha: 0.16 },
  Volcano:     { tint: 0xff6633, tintAlpha: 0.07, fogColor: 0x662211, fogAlpha: 0.18 },
  Crypt:       { tint: 0x554477, tintAlpha: 0.10, fogColor: 0x332244, fogAlpha: 0.20 },
  Abyss:       { tint: 0x2266aa, tintAlpha: 0.10, fogColor: 0x113355, fogAlpha: 0.22 },
  Sanctum:     { tint: 0xffb84d, tintAlpha: 0.08, fogColor: 0x8a5a1e, fogAlpha: 0.15 },
  Swamp:       { tint: 0x6b7a2e, tintAlpha: 0.10, fogColor: 0x3d4a1f, fogAlpha: 0.21 },
  Mines:       { tint: 0x8899bb, tintAlpha: 0.07, fogColor: 0x445566, fogAlpha: 0.16 },
  Citadel:     { tint: 0xb0c4ff, tintAlpha: 0.06, fogColor: 0xd4defc, fogAlpha: 0.13 },
  Necropolis:  { tint: 0x443355, tintAlpha: 0.11, fogColor: 0x221133, fogAlpha: 0.22 },
  FrostWastes: { tint: 0xcfeaff, tintAlpha: 0.08, fogColor: 0xeef6ff, fogAlpha: 0.18 },
  DemonGate:   { tint: 0xcc2200, tintAlpha: 0.08, fogColor: 0x551100, fogAlpha: 0.18 },
  Ruins:       { tint: 0xbbaa77, tintAlpha: 0.06, fogColor: 0x887755, fogAlpha: 0.14 },
  VoidRealm:   { tint: 0x5a2e8f, tintAlpha: 0.12, fogColor: 0x1e0a3a, fogAlpha: 0.24 },
  Forge:       { tint: 0xdd6600, tintAlpha: 0.07, fogColor: 0x663300, fogAlpha: 0.16 },
  Eternal:     { tint: 0x330055, tintAlpha: 0.12, fogColor: 0x110022, fogAlpha: 0.24 },
};

const REGION_TO_ATMO: Record<string, string> = {
  town: 'Town', forest: 'Forest', grassE: 'Forest', grassS: 'Town',
  swamp: 'Swamp', mines: 'Mines', ruins: 'Ruins', citadel: 'Citadel',
  sanctum: 'Sanctum', crypt: 'Crypt', frostwastes: 'FrostWastes',
  necropolis: 'Necropolis', volcano: 'Volcano', abyss: 'Abyss',
  forge: 'Forge', demongate: 'DemonGate', voidrealm: 'VoidRealm', eternal: 'Eternal',
};

export function atmoForRegion(regionKey: string): TdAtmo {
  return ATMO[REGION_TO_ATMO[regionKey] ?? 'Town'] ?? ATMO.Town;
}

/**
 * Faz 9B.1: bölge anahtarı → KANONİK zone adı. `achievements.ts`'in `zonesVisited`
 * kümesi bu büyük-harfli adlarla karşılaştırıyor ('Volcano', 'IceCave'), bölge
 * anahtarları ise küçük harf ('volcano') — eşleme olmadan keşif başarımları HİÇ açılmazdı.
 *
 * Tablo yeniden yazılmadı, REGION_TO_ATMO tekrar kullanıldı: iki eşleme birbirinden
 * ayrılırsa (yeni bölge birine eklenip diğerine eklenmezse) sessiz sapma olurdu.
 */
export function zoneNameForRegion(regionKey: string): string {
  return REGION_TO_ATMO[regionKey] ?? 'Town';
}
