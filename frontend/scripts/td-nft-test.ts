// frontend/scripts/td-nft-test.ts
// Faz 6: syncNftItems / nftItemToInventoryItem — item NFT import + otomatik kuşanma.
// Çalıştır: npx tsx scripts/td-nft-test.ts
import { nftItemToInventoryItem, syncNftItems, equipTier, type RawNftItem } from '../lib/game/nft/onchain';
import { PlayerState } from '../lib/game/PlayerState';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

const ps = PlayerState.get();
function reset() {
  ps.inventory = [];
  ps.equipped = { weapon: null, armor: null, accessory: null, ring: null };
  ps.level = 1; ps.nftStatLevel = 1;
  ps.baseAtk = 15; ps.baseDef = 8; ps.baseSpd = 10;
  ps.recalcStats();
}

const raw = (tokenId: number, category: number, over: Partial<RawNftItem> = {}): RawNftItem =>
  ({ tokenId, category, element: 0, rarity: 2, atk: 5, def: 0, spd: 0, ...over });

// ── nftItemToInventoryItem: kategori→slot eşlemesi (izo paritesi) + ad kompozisyonu ──
eq('cat-weapon', nftItemToInventoryItem(raw(1, 0)).type, 'weapon');
eq('cat-armor', nftItemToInventoryItem(raw(2, 1)).type, 'armor');
eq('cat-helmet-to-accessory', nftItemToInventoryItem(raw(3, 2)).type, 'accessory');
eq('cat-shield-to-armor', nftItemToInventoryItem(raw(4, 3)).type, 'armor');
eq('cat-ring', nftItemToInventoryItem(raw(5, 4)).type, 'ring');
eq('item-id', nftItemToInventoryItem(raw(42, 0)).id, 'nft_item_42');
eq('item-name', nftItemToInventoryItem(raw(1, 0, { element: 3, rarity: 4 })).name, 'Legendary Ice NFT Weapon');
eq('item-stat-zero-dropped', nftItemToInventoryItem(raw(1, 0, { atk: 3, def: 0, spd: 0 })).stat, { atk: 3 });
eq('item-unstackable', nftItemToInventoryItem(raw(1, 0)).stackable, false);

// ── boş/eksik girdi: no-op (cüzdansız smoke garantisi) ──
reset();
eq('sync-undefined', syncNftItems(ps, undefined), { imported: 0, equipped: [] });
eq('sync-empty', syncNftItems(ps, []), { imported: 0, equipped: [] });
eq('sync-noop-inventory', ps.inventory.length, 0);

// ── temel import + boş slota otomatik kuşanma + recalcStats etkisi ──
reset();
const r1 = syncNftItems(ps, [raw(10, 0, { atk: 7 })]);
eq('import-1', r1.imported, 1);
eq('equip-weapon', r1.equipped, ['weapon']);
eq('equipped-slot', ps.equipped.weapon?.id, 'nft_item_10');
eq('equip-removed-from-inv', ps.inventory.some(i => i.id === 'nft_item_10'), false);
eq('atk-recalced', ps.atk, 15 + 7);

// ── dedup: aynı liste ikinci kez → 0 import (kuşanılmış item da dedup'a girer — izo bug fix) ──
const r2 = syncNftItems(ps, [raw(10, 0, { atk: 7 })]);
eq('dedup-equipped', r2.imported, 0);
eq('dedup-no-dup-inv', ps.inventory.filter(i => i.id === 'nft_item_10').length, 0);

// ── daha iyi item mevcut ekipmanı değiştirir; zayıfı değiştirmez ──
reset();
syncNftItems(ps, [raw(20, 0, { atk: 5 })]);
const r3 = syncNftItems(ps, [raw(21, 0, { atk: 9 })]);
eq('upgrade-equips', r3.equipped, ['weapon']);
eq('upgrade-slot', ps.equipped.weapon?.id, 'nft_item_21');
eq('old-back-in-inv', ps.inventory.some(i => i.id === 'nft_item_20'), true);
const r4 = syncNftItems(ps, [raw(22, 0, { atk: 2 })]);
eq('weaker-imported', r4.imported, 1);
eq('weaker-not-equipped', r4.equipped, []);
eq('weaker-slot-unchanged', ps.equipped.weapon?.id, 'nft_item_21');

// ── 4 slot birden: weapon+armor+helmet(accessory)+ring ──
reset();
const r5 = syncNftItems(ps, [
  raw(30, 0, { atk: 6 }), raw(31, 1, { atk: 0, def: 6 }),
  raw(32, 2, { atk: 0, spd: 4 }), raw(33, 4, { atk: 1, def: 1, spd: 1 }),
]);
eq('multi-import', r5.imported, 4);
eq('multi-equip', r5.equipped.sort(), ['accessory', 'armor', 'ring', 'weapon']);
eq('multi-stats', [ps.atk, ps.def, ps.spd], [15 + 6 + 1, 8 + 6 + 1, 10 + 4 + 1]);

// ── shield (cat 3) armor slotuna yarışır: shield > armor ise onu kuşanır ──
reset();
const r6 = syncNftItems(ps, [raw(40, 1, { atk: 0, def: 3 }), raw(41, 3, { atk: 0, def: 8 })]);
eq('shield-wins-armor-slot', ps.equipped.armor?.id, 'nft_item_41');
eq('shield-equip-list', r6.equipped, ['armor']);

// ── NFT olmayan mevcut ekipman: yalnız daha iyi NFT değiştirir ──
reset();
ps.equipped.weapon = { id: 'iron_sword', name: 'Iron Sword', sprite: 'weapon', type: 'weapon', stat: { atk: 10 }, stackable: false, count: 1 };
ps.recalcStats();
const r7 = syncNftItems(ps, [raw(50, 0, { atk: 4 })]);
eq('nonft-kept', ps.equipped.weapon?.id, 'iron_sword');
eq('nonft-nft-in-inv', ps.inventory.some(i => i.id === 'nft_item_50'), true);
const r8 = syncNftItems(ps, [raw(51, 0, { atk: 12 })]);
eq('nonft-replaced-by-better', ps.equipped.weapon?.id, 'nft_item_51');
void r7; void r8;

// ── equipTier sınırları (saveProgressToChain'in tier hesabı) ──
eq('tier-0', equipTier(null), 0);
eq('tier-1', equipTier({ stat: { atk: 1 } }), 1);
eq('tier-3', equipTier({ stat: { atk: 4, def: 3 } }), 3);
eq('tier-5', equipTier({ stat: { atk: 10, def: 6 } }), 5);

console.log(`td-nft: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
