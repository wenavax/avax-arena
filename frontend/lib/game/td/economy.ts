// frontend/lib/game/td/economy.ts
// Faz 10 — Ekonomi paketi: fiyatlandırma + ekipman yükseltme SAF mantığı.
//
// Neden ayrı dosya: burada Phaser, `window` ya da sahne dokunuşu YOK — böylece
// `npx tsx scripts/td-economy-test.ts` ile Node'da doğrudan çalışır (quests.ts /
// killStats.ts / groundLoot.ts ile aynı sözleşme). Sahne yalnız çağırır.
//
// ── Ekonominin çerçevesi ──────────────────────────────────────────────────
// Faz 10 öncesi altın TEK YÖNLÜ idi: gelir bol (kill/hammadde/görev, ~2.000 g/s),
// tek çıkış boss'ta ölünce %10 yanması (TdBattleScene.ts). Gelir formülüne
// DOKUNULMADI (kullanıcı kararı) — denge yalnız buradaki fiyatlarla kuruluyor.
//
// ── Değişmezler (td-economy-test.ts bunları çapalıyor) ────────────────────
// 1. Alış > satış (BUY_MULT = 3) → al-sat arbitrajı yapısal olarak imkânsız.
// 2. Yükseltmenin satış kazancı < yükseltmenin altın maliyeti → "yükselt ve sat"
//    her seviyede zararlı, yani yükseltme gerçek bir sink, para basma aracı değil.
// 3. `item.stat` HER ZAMAN efektif stat'tır; yükseltme yerinde yazılır ve her
//    hesap KATALOG TABANINDAN yapılır (statAt), mevcut stat'tan değil. Böylece
//    tekrarlı yükseltmede sürüklenme (drift) olmaz ve recalcStats/statTotal/
//    equipTier ile NFT çift-ölçekleme mantığı (PlayerState.ts) hiç değişmez.
import { ITEMS, SELL_PRICES } from '../lootTables';
import type { InventoryItem } from '../PlayerState';

/** Dükkân alış fiyatı = taban değer × 3. Makas, al-sat döngüsünü kapatır. */
export const BUY_MULT = 3;
/** Çantadan (Vess'e uğramadan) satış: tam değerin %60'ı. Dükkâna gitmek ödüllü. */
export const FIELD_SELL_MULT = 0.6;
/** type:'quest' materyallerin taban değeri — SELL_PRICES onları kapsamıyor. */
export const MATERIAL_SELL = 5;

export const UPGRADE_MAX = 3;
/** index = hedef seviye. Alt sınır `taban + up` monotonluğu garantiler. */
export const UPGRADE_STAT_MULT = [1, 1.25, 1.5, 1.75] as const;
/** index = hedef seviye; maliyet = katsayı × taban değer. */
export const UPGRADE_GOLD_MULT = [0, 1, 2, 3] as const;
export const UPGRADE_ORE = [0, 3, 6, 12] as const;
export const UPGRADE_STONE = [0, 5, 10, 20] as const;
/** Yükseltilmiş eşyanın satış çarpanı: 1 + 0.4 × up (+3 → 2.2×). */
export const UPGRADE_SELL_BONUS = 0.4;

/** Kuşanılabilir (dolayısıyla yükseltilebilir) tipler. */
const EQUIP_TYPES = new Set<InventoryItem['type']>(['weapon', 'armor', 'accessory', 'ring']);
/** recalcStats() yalnız bunları sayar — hp/mp bonusları fiilen ölü (PlayerState.ts). */
const COMBAT_STATS = ['atk', 'def', 'spd'] as const;

/**
 * Dükkâna özel stok gövdeleri. Bu 4 id SELL_PRICES'ta fiyatlı ama HİÇBİR loot
 * tablosunda yok (yetim çapalar) — düşmedikleri için dükkânın kendi malı olmaları
 * doğal. potion_hp_large'ı TdBattleScene zaten tanıyor (stat.hp okuyor).
 */
export const SHOP_ONLY_ITEMS: Record<string, InventoryItem> = {
  potion_hp_large: { id: 'potion_hp_large', name: 'Large Health Potion', sprite: 'potion', type: 'potion', stat: { hp: 100 }, stackable: true, count: 1 },
  steel_sword: { id: 'steel_sword', name: 'Steel Sword', sprite: 'weapon', type: 'weapon', stat: { atk: 9 }, stackable: false, count: 1 },
  iron_shield: { id: 'iron_shield', name: 'Iron Shield', sprite: 'armor', type: 'armor', stat: { def: 5 }, stackable: false, count: 1 },
  chain_armor: { id: 'chain_armor', name: 'Chain Armor', sprite: 'armor', type: 'armor', stat: { def: 8 }, stackable: false, count: 1 },
};

/** Trader Vess'in raf sırası (ucuzdan pahalıya, sarf malzemesi önce). */
export const SHOP_STOCK: readonly string[] = [
  'potion_hp', 'potion_mp', 'speed_tonic', 'potion_hp_large',
  'iron_sword', 'leather_armor', 'iron_shield', 'chain_armor', 'steel_sword',
];

const CATALOG = ITEMS as unknown as Record<string, InventoryItem>;

/** Zincirden gelen ERC-1155 eşyaları: statları on-chain otoritede. */
export function isNftItem(item: { id: string }): boolean {
  return item.id.startsWith('nft_item_');
}

/** Katalog şablonu (dükkân malı önce). Yükseltme hep BU tabandan hesaplanır. */
export function itemTemplate(id: string): InventoryItem | null {
  return SHOP_ONLY_ITEMS[id] ?? CATALOG[id] ?? null;
}

/** Yükseltilmemiş taban değer (gold). Bilinmeyen/fiyatsız eşya → 0. */
export function baseValue(id: string): number {
  const priced = SELL_PRICES[id];
  if (priced !== undefined) return priced;
  const tpl = itemTemplate(id);
  return tpl && tpl.type === 'quest' ? MATERIAL_SELL : 0;
}

export function upLevel(item: { up?: number }): number {
  // Eski kayıtlarda alan yok → +0 (save v:1 geriye dönük uyumu).
  return Math.min(UPGRADE_MAX, Math.max(0, Math.floor(item.up ?? 0)));
}

/** Tek adedin satış değeri. NFT/anahtar/fiyatsız için çağrılmadan önce isSellable'a bak. */
export function unitSellValue(item: InventoryItem, mult = 1): number {
  const base = baseValue(item.id);
  if (base <= 0) return 0;
  const withUp = Math.round(base * (1 + UPGRADE_SELL_BONUS * upLevel(item)));
  return Math.max(1, Math.round(withUp * mult));
}

/** Yığının tamamının satış değeri (count kadar). */
export function sellValue(item: InventoryItem, mult = 1): number {
  if (baseValue(item.id) <= 0) return 0;
  return unitSellValue(item, mult) * Math.max(1, item.count || 1);
}

export function buyPrice(id: string): number {
  const base = baseValue(id);
  return base <= 0 ? 0 : Math.round(base * BUY_MULT);
}

/**
 * Satılabilirlik. NFT eşyası satılamaz: yerel satış zincirdeki token'ı yakmadan
 * envanterden siler, yani oyuncunun on-chain varlığını görünmez kılar.
 */
export function isSellable(item: InventoryItem): boolean {
  if (isNftItem(item)) return false;
  if (item.type === 'key') return false;
  return baseValue(item.id) > 0;
}

export type UpgradeBlock =
  | 'ok'
  | 'max'      // +3 tavanında
  | 'nft'      // statları zincirden geliyor
  | 'unknown'  // katalog şablonu yok → taban bilinmiyor
  | 'type'     // kuşanılabilir değil
  | 'nostat';  // yalnız hp/mp veriyor → recalcStats saymıyor, yükseltmek para yakmak olur

export function upgradeState(item: InventoryItem): UpgradeBlock {
  if (isNftItem(item)) return 'nft';
  if (!EQUIP_TYPES.has(item.type)) return 'type';
  const tpl = itemTemplate(item.id);
  if (!tpl || baseValue(item.id) <= 0) return 'unknown';
  if (!COMBAT_STATS.some(k => (tpl.stat?.[k] ?? 0) > 0)) return 'nostat';
  if (upLevel(item) >= UPGRADE_MAX) return 'max';
  return 'ok';
}

export function canUpgrade(item: InventoryItem): boolean {
  return upgradeState(item) === 'ok';
}

/** Bir sonraki seviyenin maliyeti; yükseltilemiyorsa null. */
export function upgradeCost(item: InventoryItem): { gold: number; ore: number; stone: number } | null {
  if (!canUpgrade(item)) return null;
  const next = upLevel(item) + 1;
  return {
    gold: Math.round(baseValue(item.id) * UPGRADE_GOLD_MULT[next]),
    ore: UPGRADE_ORE[next],
    stone: UPGRADE_STONE[next],
  };
}

/** `up` seviyesindeki stat — KATALOG TABANINDAN, mevcut stat'tan değil (drift yok). */
export function statAt(id: string, up: number): InventoryItem['stat'] {
  const base = itemTemplate(id)?.stat;
  if (!base) return undefined;
  const lvl = Math.min(UPGRADE_MAX, Math.max(0, Math.floor(up)));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) {
    if (typeof v !== 'number' || v === 0) continue;
    // Alt sınır `v + lvl`: küçük sayılarda yuvarlama katsayıyı yutup statı düz
    // bırakabilir (4 × 1.25 = 5 ama 2 × 1.25 = 2.5 → 3 yerine 2 olurdu).
    out[k] = Math.max(v + lvl, Math.round(v * UPGRADE_STAT_MULT[lvl]));
  }
  return out as InventoryItem['stat'];
}

/** Yükseltme sonrası stat (bir sonraki seviye). */
export function upgradedStat(item: InventoryItem): InventoryItem['stat'] {
  return statAt(item.id, upLevel(item) + 1);
}

/**
 * Yükseltmeyi eşyaya YERİNDE uygular (stat + up). Ön koşulları sağlamıyorsa
 * hiçbir şeye dokunmadan false döner — altın/kaynak düşümü çağıranın işi.
 */
export function applyUpgrade(item: InventoryItem): boolean {
  if (!canUpgrade(item)) return false;
  const next = upLevel(item) + 1;
  const stat = statAt(item.id, next);
  if (!stat) return false;
  item.stat = stat;
  item.up = next;
  return true;
}

/** UI etiketi: "Steel Sword +2" (yükseltilmemişte sade ad). */
export function displayName(item: InventoryItem): string {
  const up = upLevel(item);
  return up > 0 ? `${item.name} +${up}` : item.name;
}

/** UI özeti: "ATK 14  DEF 3" — yalnız savaşta sayılan statlar. */
export function statLabel(stat: InventoryItem['stat']): string {
  if (!stat) return '';
  return COMBAT_STATS
    .filter(k => (stat[k] ?? 0) > 0)
    .map(k => `${k.toUpperCase()} ${stat[k]}`)
    .join('  ');
}
