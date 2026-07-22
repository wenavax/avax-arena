// frontend/lib/game/td/cozy/rules.ts
// ─── Cozy katmanı: TEK sabit kaynağı (enerji, fiyat, tarla) ───
// Spec §6.1 ile birebir kilitli değerler NOT değiştirilmeden burada tutulur.
// tdState.ts ve sahne (TdWorldScene) bu dosyadan tüketir — sabit çakışması yok.

/** Aksiyon başına TOPLAM enerji maliyeti (spec §6.1 birebir). */
export const COSTS = {
  chop: 15,    // ağaç kesme (3 vuruş × 5)
  mine: 21,    // kaya kazma (3 vuruş × 7)
  fish: 25,    // balık tutma (tek aksiyon, sayaçlı)
  plant: 5,    // tarlaya ekim
  harvest: 5,  // tarla hasadı
} as const;

/** Sahne toplama vuruş-başına enerji maliyeti (COSTS ile toplamda tutarlı olmalı — testte kilitli). */
export const PER_HIT = {
  chop: 5, // × 3 vuruş = COSTS.chop
  mine: 7, // × 3 vuruş = COSTS.mine
} as const;

/** Pasif enerji rejenerasyonu. */
export const REGEN = {
  perSec: 6,       // saniyede +6 (kamp ateşi dışında)
  campfireMult: 4, // kamp ateşi ≤48px yakınında ×4
} as const;

/** Marketplace satış fiyatları (gold / birim). Tasarım: taş < odun*1.5, cevher en değerli ham madde. */
export const PRICES = {
  wood: 2,
  stone: 3,
  ore: 8,
  fish: 6,
  frostberry: 4,
} as const;

/** Tarla büyüme durum makinesi. stage: 0 boş, 1..growthStages büyüme, growthStages+1 olgun. */
export const FARM = {
  stageDurationSec: 30, // her büyüme aşaması 30sn (toplam olgunlaşma = growthStages × 30sn)
  growthStages: 2,      // 1 (fide) -> 2 (büyüyor) -> 3 (olgun, hasat edilebilir)
  plotCount: 12,
} as const;

export type TdResourceKind = 'wood' | 'stone' | 'ore' | 'fish' | 'frostberry';

/** Kaynak → aksiyon eşlemesi (gather maliyetini COSTS'tan çözmek için). */
export const RESOURCE_ACTION: Record<TdResourceKind, keyof typeof COSTS> = {
  wood: 'chop',
  stone: 'mine',
  ore: 'mine',
  fish: 'fish',
  frostberry: 'harvest', // not: bush tek-vuruşluk toplama fish/chop gibi değil, ama sahnede ayrı ele alınır
};
