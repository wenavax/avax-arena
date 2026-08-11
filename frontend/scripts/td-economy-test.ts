// frontend/scripts/td-economy-test.ts
// Faz 10 — economy.ts saf mantık testi (Node: `npx tsx scripts/td-economy-test.ts`).
// Biçim emsali: td-quest-test.ts (elle yazılmış eq/ok, pass/fail sayacı, exit(1)).
// Bu suite aynı zamanda R8 kanaryasıdır: economy.ts Phaser ya da çıplak `window`
// dokunuşu kazanırsa bu dosya Node'da import aşamasında patlar.
//
// Çapaladığı ekonomik değişmezler:
//  (A) alış > satış                → al-sat arbitrajı imkânsız
//  (B) yükseltme kazancı < maliyet → "yükselt ve sat" her seviyede zararlı
//  (C) stat monotonluğu            → her seviye gerçekten daha iyi
//  (D) save round-trip             → `up` diskten dönüyor, alanı yoksa +0
import {
  BUY_MULT, FIELD_SELL_MULT, MATERIAL_SELL, UPGRADE_MAX, SHOP_STOCK, SHOP_ONLY_ITEMS,
  itemTemplate, baseValue, upLevel, unitSellValue, sellValue, buyPrice, isSellable,
  upgradeState, canUpgrade, upgradeCost, statAt, upgradedStat, applyUpgrade,
  displayName, statLabel, isNftItem,
} from '../lib/game/td/economy';
import { ITEMS, SELL_PRICES } from '../lib/game/lootTables';
import { PlayerState, type InventoryItem } from '../lib/game/PlayerState';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } };
const eq = (name: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  if (c) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const CATALOG = ITEMS as unknown as Record<string, InventoryItem>;
const clone = (id: string, up = 0, count = 1): InventoryItem => {
  const tpl = itemTemplate(id);
  if (!tpl) throw new Error('no template: ' + id);
  const c: InventoryItem = JSON.parse(JSON.stringify(tpl));
  c.count = count;
  for (let i = 0; i < up; i++) applyUpgrade(c);
  return c;
};
const EQUIPPABLE = Object.values(CATALOG)
  .concat(Object.values(SHOP_ONLY_ITEMS))
  .filter(i => canUpgrade({ ...i, up: 0 }));

// ─── (1) Bütünlük: stok fiyatlı + şablonlu ───
ok('stock-has-template', SHOP_STOCK.every(id => !!itemTemplate(id)));
ok('stock-has-price', SHOP_STOCK.every(id => baseValue(id) > 0));
ok('stock-ids-unique', new Set(SHOP_STOCK).size === SHOP_STOCK.length);
ok('shop-only-ids-match-key', Object.entries(SHOP_ONLY_ITEMS).every(([k, v]) => k === v.id));
ok('shop-only-priced', Object.keys(SHOP_ONLY_ITEMS).every(id => SELL_PRICES[id] !== undefined));
ok('sell-prices-resolve', Object.keys(SELL_PRICES).every(id => !!itemTemplate(id)));

// ─── (2) İngilizce-only bekçisi: oyuncuya görünen yeni metinler ASCII ───
const ASCII = /^[\x20-\x7E]*$/;
eq('all-text-ascii', Object.values(SHOP_ONLY_ITEMS).filter(i => !ASCII.test(i.name)).map(i => i.id), []);

// ─── (3) Fiyatlandırma ───
eq('buy-is-3x', buyPrice('iron_sword'), SELL_PRICES.iron_sword * BUY_MULT);
eq('buy-potion', buyPrice('potion_hp'), 30);
eq('buy-steel-sword', buyPrice('steel_sword'), 180);
eq('buy-unknown-is-0', buyPrice('no_such_item'), 0);
eq('material-base', baseValue('bone_shard'), MATERIAL_SELL);
eq('materials-priced', sellValue(clone('bone_shard', 0, 7)), MATERIAL_SELL * 7);
eq('field-sell-is-60pct', unitSellValue(clone('iron_sword'), FIELD_SELL_MULT), Math.round(25 * 0.6));
eq('stack-sell-multiplies', sellValue(clone('potion_hp', 0, 5)), 50);
eq('unit-sell-ignores-count', unitSellValue(clone('potion_hp', 0, 5)), 10);

// (A) alış > satış — her stok kaleminde, hem tam hem tarla fiyatında
const arbBuy = SHOP_STOCK.filter(id => buyPrice(id) <= unitSellValue(clone(id), 1));
eq('no-arbitrage-buy-sell', arbBuy, []);

// ─── (4) Yükseltme: stat ───
eq('stat-at-0-is-base', statAt('iron_sword', 0), { atk: 5 });
eq('iron-sword-ladder', [1, 2, 3].map(u => statAt('iron_sword', u)!.atk), [6, 8, 9]);
eq('steel-sword-ladder', [1, 2, 3].map(u => statAt('steel_sword', u)!.atk), [11, 14, 16]);
eq('chain-armor-ladder', [1, 2, 3].map(u => statAt('chain_armor', u)!.def), [10, 12, 14]);
eq('multistat-ladder', statAt('ring_elements', 3), { atk: 6, def: 6, spd: 6 });

// (C) monotonluk: her ekipmanda, her stat anahtarında kesin artış
const notMonotone: string[] = [];
for (const tpl of EQUIPPABLE) {
  for (let u = 0; u < UPGRADE_MAX; u++) {
    const a = statAt(tpl.id, u)!, b = statAt(tpl.id, u + 1)!;
    for (const k of Object.keys(a)) {
      if (!((b as Record<string, number>)[k] > (a as Record<string, number>)[k])) notMonotone.push(`${tpl.id}.${k}@${u}`);
    }
  }
}
eq('upgrade-stat-monotone', notMonotone, []);

// ─── (5) Yükseltme: maliyet + kapılar ───
eq('cost-plus1-iron-sword', upgradeCost(clone('iron_sword')), { gold: 25, ore: 3, stone: 5 });
eq('cost-plus3-steel-sword', upgradeCost(clone('steel_sword', 2)), { gold: 180, ore: 12, stone: 20 });
eq('total-gold-to-plus3', [0, 1, 2].reduce((s, u) => s + upgradeCost(clone('steel_sword', u))!.gold, 0), 6 * 60);
eq('upgrade-max-blocked', upgradeState(clone('iron_sword', UPGRADE_MAX)), 'max');
eq('upgrade-max-cost-null', upgradeCost(clone('iron_sword', UPGRADE_MAX)), null);
eq('upgrade-material-blocked', upgradeState(clone('bone_shard')), 'type');
eq('upgrade-potion-blocked', upgradeState(clone('potion_hp')), 'type');
eq('upgrade-hp-only-ring-blocked', upgradeState(clone('ring_vitality')), 'nostat');
eq('upgrade-unknown-blocked', upgradeState({ id: 'ghost_id', name: 'X', sprite: 'weapon', type: 'weapon', stackable: false, count: 1 }), 'unknown');

// (B) yükselt-ve-sat her seviyede zararlı
const arbUp: string[] = [];
for (const tpl of EQUIPPABLE) {
  for (let u = 0; u < UPGRADE_MAX; u++) {
    const before = clone(tpl.id, u), after = clone(tpl.id, u + 1);
    const gain = unitSellValue(after) - unitSellValue(before);
    const cost = upgradeCost(before)!.gold;
    if (gain >= cost) arbUp.push(`${tpl.id}@${u}: gain ${gain} >= cost ${cost}`);
  }
}
eq('no-arbitrage-upgrade', arbUp, []);

// applyUpgrade: yerinde, tekrarda drift yok, tavanda reddeder
const forged = clone('iron_sword');
ok('apply-upgrade-true', applyUpgrade(forged));
eq('apply-upgrade-sets-up', forged.up, 1);
eq('apply-upgrade-sets-stat', forged.stat, statAt('iron_sword', 1));
applyUpgrade(forged); applyUpgrade(forged);
eq('apply-upgrade-no-drift', forged.stat, statAt('iron_sword', 3));
eq('apply-upgrade-at-max-false', applyUpgrade(forged), false);
eq('apply-upgrade-max-stays', forged.up, 3);
eq('upgraded-stat-is-next', upgradedStat(clone('iron_sword', 1)), statAt('iron_sword', 2));

// ─── (6) NFT ve satılamazlar ───
const nft: InventoryItem = { id: 'nft_item_7', name: 'NFT Blade', sprite: 'weapon', type: 'weapon', stat: { atk: 30 }, stackable: false, count: 1 };
ok('nft-detected', isNftItem(nft));
eq('nft-not-sellable', isSellable(nft), false);
eq('nft-not-upgradable', upgradeState(nft), 'nft');
eq('nft-cost-null', upgradeCost(nft), null);
eq('key-not-sellable', isSellable({ id: 'rusty_key', name: 'Rusty Key', sprite: 'key', type: 'key', stackable: false, count: 1 }), false);
eq('unpriced-not-sellable', isSellable({ id: 'ghost_id', name: 'X', sprite: 'weapon', type: 'weapon', stackable: false, count: 1 }), false);
ok('normal-item-sellable', isSellable(clone('iron_sword')));
ok('material-sellable', isSellable(clone('bone_shard')));

// ─── (7) Etiketler ───
eq('display-name-plain', displayName(clone('iron_sword')), 'Iron Sword');
eq('display-name-upgraded', displayName(clone('iron_sword', 2)), 'Iron Sword +2');
eq('stat-label', statLabel(statAt('ring_elements', 0)), 'ATK 3  DEF 3  SPD 3');
eq('stat-label-hides-hp', statLabel(statAt('ring_vitality', 0)), '');

// ─── (8) Save round-trip (D): `up` diske gidip geliyor, alansız satır +0 ───
const roundTrip: InventoryItem = JSON.parse(JSON.stringify(clone('steel_sword', 2)));
eq('save-roundtrip-up', roundTrip.up, 2);
eq('save-roundtrip-stat', roundTrip.stat, statAt('steel_sword', 2));
eq('save-roundtrip-value', unitSellValue(roundTrip), Math.round(60 * 1.8));
const legacy = clone('iron_sword');
delete legacy.up; // Faz 10 öncesi kayıt satırı
eq('legacy-item-is-plus0', upLevel(legacy), 0);
eq('legacy-item-sells-base', unitSellValue(legacy), 25);
eq('legacy-item-upgradable', canUpgrade(legacy), true);

// ─── (9) equip(): doğru kopyayı siler (Faz 10 duplikasyon bug'ı çaparı) ───
// PlayerState singleton; localStorage yok (Node) → save()/load() sessizce no-op.
const ps = PlayerState.get();
ps.inventory = [clone('iron_sword', 0), clone('iron_sword', 3)];
ps.equipped = { weapon: null, armor: null, accessory: null, ring: null };
const plus3 = ps.inventory[1];
eq('equip-returns-slot', ps.equip(plus3), 'weapon');
eq('equip-equipped-the-plus3', ps.equipped.weapon?.up, 3);
eq('equip-removes-right-copy', ps.inventory.map(i => `${i.id}+${upLevel(i)}`), ['iron_sword+0']);
// Takas: kuşanılı +3 çantaya döner, +0 kuşanılır
eq('equip-swap-returns-slot', ps.equip(ps.inventory[0]), 'weapon');
eq('equip-swap-equipped-plus0', ps.equipped.weapon?.up ?? 0, 0);
eq('equip-swap-bag', ps.inventory.map(i => `${i.id}+${upLevel(i)}`), ['iron_sword+3']);
eq('equip-recalc-uses-upgraded-stat', (() => {
  ps.equipped = { weapon: null, armor: null, accessory: null, ring: null };
  ps.inventory = [clone('iron_sword', 3)];
  ps.recalcStats(); // slotları elle boşalttık; türetilmiş statı tazelemeden ölçüm yanıltır
  const before = ps.atk;
  ps.equip(ps.inventory[0]);
  return ps.atk - before;
})(), statAt('iron_sword', 3)!.atk);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
