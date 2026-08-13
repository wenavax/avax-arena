// frontend/lib/game/td/worldProps.ts
// ─── Deterministik prop yerleşimi (saf; DOM yok) ───
// Kasaba binaları HUB_GAMES'ten türetilir (tek doğruluk kaynağı korunur).
// salt sözlüğü: 3=yerleşim(ağaç), 4=varyant, 5=kaya, 6=çalı, 11=portal,
// 12=süs yerleşimi, 13=süs tipi (bkz tdCore.hash2d).
import { CHUNK, MAP_W, MAP_H, hash2d } from './tdCore';
import { getTile, regionAt, REGIONS, TOWN_SPAWN, ROAD_Y } from './worldMap';
import { HUB_GAMES } from '../hub/hubGames';
import { NPCS } from './npcs';

export type PropKind = 'tree' | 'rock' | 'bush' | 'campfire' | 'building' | 'house' | 'door_dungeon' | 'farm_plot' | 'portal' | 'sign' | 'npc' | 'deco';

export const DECO_KINDS = ['mushroom', 'fallen_log', 'flowers', 'tall_grass', 'reeds', 'ice_crystal', 'frozen_bones', 'gravestone', 'bone_pile', 'broken_pillar', 'rubble', 'mine_cart', 'timber_support', 'obsidian_shard', 'lava_crack', 'void_spike', 'rune_stone', 'brazier', 'lamp_post', 'well', 'barrel', 'crate', 'bench', 'fence', 'snowman', 'stall', 'firewood', 'banner_pole', 'noticeboard'] as const;
export type DecoKind = typeof DECO_KINDS[number];
export interface TdProp {
  kind: PropKind;
  x: number; y: number;                    // dünya px (taban/ayak noktası)
  v?: number;                              // sprite varyantı
  solid?: { x: number; y: number; w: number; h: number };
  data?: { id?: string; name?: string; icon?: string; url?: string; accent?: string; wTiles?: number; hTiles?: number; region?: string; plotIndex?: number; deco?: DecoKind; interiorId?: string };
}

/** Tarla parseli grid'i — kasaba güneybatısında, TOWN_SPAWN'ın ~6-11 tile güneyi.
 * 4×3 = 12 parsel, 2-tile pitch (1 tile aralık); salt 9 = tarla yerleşimi (sabit grid, hash gerekmez). */
const FARM_ORIGIN = { tx: 192, ty: 209 };
const FARM_COLS = 4, FARM_ROWS = 3, FARM_PITCH = 2;

function farmPlots(): TdProp[] {
  const out: TdProp[] = [];
  let i = 0;
  for (let row = 0; row < FARM_ROWS; row++) {
    for (let col = 0; col < FARM_COLS; col++) {
      const tx = FARM_ORIGIN.tx + col * FARM_PITCH;
      const ty = FARM_ORIGIN.ty + row * FARM_PITCH;
      out.push({
        kind: 'farm_plot', x: tx * 16 + 8, y: ty * 16 + 14,
        data: { plotIndex: i },
      });
      i++;
    }
  }
  return out;
}
let FARM_CACHE: TdProp[] | null = null;
export function allFarmPlots(): TdProp[] { return FARM_CACHE ?? (FARM_CACHE = farmPlots()); }

/** hubGames yerel tile koordinatlarının dünya ofseti — kasaba kuzeybatısı.
 * NOT: plan taslağındaki (174,168) HUB_GAMES döşemesini chunk (3,3)/(4,3)'e
 * düşürüyordu (test 'town-buildings-in-chunk' ile çelişki) — (192,192) ile
 * tüm kapı+rect'ler chunk (4,4) içine (TOWN_SPAWN'a bitişik) oturuyor. */
export const TOWN_ORIGIN = { tx: 192, ty: 192 };

// biome → ağaç yoğunluğu (‰, tile başına)
// Faz 5.6: orman yoğunluğu artırıldı; Faz 5.8: kasaba İÇİ rastgele yerleşim SIFIR
// (düzenli köy — süs ağaçları townProps'ta sabit ve simetrik)
const TREE_DENS: Record<string, number> = {
  forest: 160, grass: 38, town: 0, swamp: 70, frostwastes: 45, sanctum: 50,
  necropolis: 24, ruins: 16, mines: 10, citadel: 14, volcano: 6, crypt: 16,
  abyss: 8, forge: 6, demongate: 6, voidrealm: 5, eternal: 8, water: 0, path: 0,
};
const ROCK_DENS: Record<string, number> = {
  mines: 30, volcano: 26, forge: 20, ruins: 18, frostwastes: 14, abyss: 14,
  town: 0, water: 0, path: 0,
};
const BUSH_DENS: Record<string, number> = { forest: 14, grass: 12, town: 2, swamp: 10, water: 0, path: 0 };

// ── Faz 8: BİYOM SÜSLERİ — 18 bölge ağaç/kaya/çalıdan ibaretti, hepsi birbirine
// benziyordu. Her biyoma 2-4 imza nesnesi; salt 12 = yerleşim, 13 = tip seçimi.
// Yerleşim zincirin SONUNDA (ağaç/kaya/çalı'nın hiçbirini kapmadığı tile'lar) →
// mevcut prop koordinatları bit-bit KORUNUR (eski testler kırılmaz).
// Kasaba (town) LİSTE DIŞI: sokak mobilyası elle yerleştirilir (townProps), rastgele değil.
export const DECO_BY_BIOME: Record<string, readonly DecoKind[]> = {
  forest: ['mushroom', 'fallen_log', 'flowers', 'tall_grass'],
  grass: ['flowers', 'tall_grass', 'mushroom'],
  swamp: ['reeds', 'mushroom', 'fallen_log', 'tall_grass'],
  frostwastes: ['ice_crystal', 'frozen_bones', 'rubble'],
  sanctum: ['rune_stone', 'brazier', 'flowers'],
  necropolis: ['gravestone', 'bone_pile', 'rubble'],
  ruins: ['broken_pillar', 'rubble', 'gravestone'],
  mines: ['mine_cart', 'timber_support', 'rubble'],
  citadel: ['broken_pillar', 'brazier', 'rubble'],
  crypt: ['gravestone', 'broken_pillar', 'bone_pile'],
  volcano: ['obsidian_shard', 'lava_crack', 'rubble'],
  abyss: ['void_spike', 'frozen_bones', 'bone_pile'],
  forge: ['brazier', 'obsidian_shard', 'rubble', 'lava_crack'],
  demongate: ['void_spike', 'bone_pile', 'obsidian_shard'],
  voidrealm: ['void_spike', 'rune_stone'],
  eternal: ['ice_crystal', 'rune_stone', 'void_spike'],
};
const DECO_DENS: Record<string, number> = {
  forest: 26, grass: 22, swamp: 34, frostwastes: 26, sanctum: 20, necropolis: 30,
  ruins: 30, mines: 26, citadel: 22, crypt: 28, volcano: 30, abyss: 26,
  forge: 26, demongate: 26, voidrealm: 24, eternal: 24, town: 0, water: 0, path: 0,
};
/** Gövdesi olan süsler — içinden geçilmez (ağaç solid'iyle aynı dar kutu; yolu tıkamaz).
 * Geri kalan her süs DEKORATİFTİR: solid YOK, üstünden yürünür → yol bulma riski sıfır. */
const DECO_SOLID: ReadonlySet<DecoKind> = new Set<DecoKind>(['fallen_log', 'broken_pillar', 'mine_cart', 'timber_support', 'well', 'stall']);

// ── Faz 5.8: DÜZENLİ KÖY — HUB_GAMES liste/kimlik tek kaynak kalır (id/isim/url/accent),
// GEOMETRİ TD'ye ait: ana caddenin (ROAD_Y=192, rel ty -1..0) kuzeyinde 5 bina sırası
// (kapılar caddeye bakar), merkez plaza (kamp ateşi + spawn), güneyinde 4 bina sırası,
// altta tarla. hubGames.ts'teki izo koordinatları KULLANILMAZ (izo/testleri bozmamak
// için dosyasına dokunulmadı; izo silinince orası da sadeleşir).
// Kapı = bina alt-orta tile'ı (TOWN_ORIGIN'e göre rel).
const TD_TOWN_DOORS: Record<string, { tx: number; ty: number }> = {
  arena: { tx: -12, ty: -2 }, cardgame: { tx: -6, ty: -2 }, swap: { tx: 0, ty: -2 },
  marketplace: { tx: 6, ty: -2 }, nftscore: { tx: 12, ty: -2 },
  battleroyale: { tx: -9, ty: 10 }, expeditions: { tx: -3, ty: 10 },
  adventures: { tx: 3, ty: 10 }, launchpad: { tx: 9, ty: 10 },
};

// ── Faz 11.1: İÇ MEKÂNLI EVLER — kind 'house' (BİLEREK 'building' DEĞİL: td-props-test
// `buildings-count === HUB_GAMES.length` çapası kırılmasın). Geometri sözleşmesi building
// ile birebir: kapı = alt-orta tile, solid rect kapıdan türetilir. `id` aynı zamanda
// interiors.ts INTERIORS anahtarıdır (td-interior-test eşleşmeyi assert eder).
// KONUM: kuzey sıranın batı/doğu kanadı, kapılar ana cadde bandına (ty:-2) bakar.
// inn -19: batı kanat — c0 rel -21 (abs 171..175), arena (abs 178..181) ile 2-tile boşluk
//   (kuzey sıranın kendi bina aralığıyla aynı ritim); flood-fill kutusu x≥170 içinde kalır.
// archive 18: doğu kanat — c0 rel 16 (abs 208..211), nftscore (abs 203..205) ile 2-tile
//   boşluk; town bölge yarıçapı (r=28, merkez 192) içinde → zemin kasaba biyomu.
export interface TdHouse {
  id: string; name: string; icon: string; accent: string;
  door: { tx: number; ty: number };            // TOWN_ORIGIN'e göre rel (TD_TOWN_DOORS dili)
  size: { w: number; h: number };
}
export const TD_HOUSES: TdHouse[] = [
  { id: 'inn', name: 'The Frosted Hearth', icon: '🍺', accent: '#e8944a', door: { tx: -19, ty: -2 }, size: { w: 5, h: 5 } },
  { id: 'archive', name: "Scribe's Archive", icon: '📜', accent: '#8fb8d8', door: { tx: 18, ty: -2 }, size: { w: 4, h: 5 } },
];

function townProps(): TdProp[] {
  const out: TdProp[] = [];
  for (const g of HUB_GAMES) {
    const d = TD_TOWN_DOORS[g.id] ?? g.door;
    const doorTx = TOWN_ORIGIN.tx + d.tx, doorTy = TOWN_ORIGIN.ty + d.ty;
    const c0 = doorTx - Math.floor(g.size.w / 2), r0 = doorTy - g.size.h + 1;
    out.push({
      kind: 'building', x: doorTx * 16 + 8, y: doorTy * 16 + 15,
      solid: { x: c0 * 16, y: r0 * 16, w: g.size.w * 16, h: g.size.h * 16 - 6 },
      data: { id: g.id, name: g.name, icon: g.icon, url: g.url, accent: g.accent, wTiles: g.size.w, hTiles: g.size.h },
    });
  }
  // Faz 11.1: evler — building döngüsüyle aynı geometri (kapı alt-orta, solid rect).
  // Solid'leri reserved()'a otomatik girer → çevrelerine rastgele ağaç/kaya serpilmez.
  for (const hDef of TD_HOUSES) {
    const doorTx = TOWN_ORIGIN.tx + hDef.door.tx, doorTy = TOWN_ORIGIN.ty + hDef.door.ty;
    const c0 = doorTx - Math.floor(hDef.size.w / 2), r0 = doorTy - hDef.size.h + 1;
    out.push({
      kind: 'house', x: doorTx * 16 + 8, y: doorTy * 16 + 15,
      solid: { x: c0 * 16, y: r0 * 16, w: hDef.size.w * 16, h: hDef.size.h * 16 - 6 },
      data: { id: hDef.id, name: hDef.name, icon: hDef.icon, accent: hDef.accent, interiorId: hDef.id, wTiles: hDef.size.w, hTiles: hDef.size.h },
    });
  }
  // meydan kamp ateşi (spawn'ın 3 tile kuzeyi)
  out.push({
    kind: 'campfire', x: TOWN_SPAWN.tx * 16 + 8, y: (TOWN_SPAWN.ty - 3) * 16 + 10,
    solid: { x: TOWN_SPAWN.tx * 16 + 2, y: (TOWN_SPAWN.ty - 3) * 16 + 4, w: 12, h: 6 },
  });
  // plaza köşelerine 4 simetrik süs ağacı (kasaba içi rastgele ağaç artık YOK — düzen);
  // ±5: güney sıra binaları (rel tx -4..4 bandında) ile çakışmasın
  for (const [rtx, rty] of [[-5, 2], [5, 2], [-5, 8], [5, 8]] as const) {
    const ttx = TOWN_ORIGIN.tx + rtx, tty = TOWN_ORIGIN.ty + rty;
    out.push({
      kind: 'tree', x: ttx * 16 + 8, y: tty * 16 + 14, v: 0,
      solid: { x: ttx * 16 + 3, y: tty * 16 + 10, w: 10, h: 6 },
    });
  }
  out.push(...townStreetProps());
  out.push(...allFarmPlots());
  return out;
}

/** Süs prop'u kurucusu — ayak noktası diğer prop'larla aynı hizada (ty*16+14 →
 * floor(y/16) === ty). Solid yalnız DECO_SOLID tiplerinde, ağaç kutusuyla birebir. */
function deco(kind: DecoKind, tx: number, ty: number): TdProp {
  const p: TdProp = { kind: 'deco', x: tx * 16 + 8, y: ty * 16 + 14, data: { deco: kind } };
  if (DECO_SOLID.has(kind)) p.solid = { x: tx * 16 + 3, y: ty * 16 + 10, w: 10, h: 6 };
  return p;
}

// ── Faz 8: KASABA SOKAK MOBİLYASI — elle yerleştirilmiş (hash YOK, deterministik).
// Referans geometri: cadde ty 191-192 · kuzey binalar ty 188-190 · güney binalar ty 200-202 ·
// plaza ty 193-199 · spawn (192,198) · kamp ateşi (192,195) · plaza ağaçları (187/197, 194/200) ·
// tarla tx 192-198 / ty 209-213. NPC tile'ları npcs.ts'te.
// KURAL: hiçbir mobilya bina rect'i, NPC tile'ı, ateş, ağaç, spawn ya da tarla parseli
// üstüne düşmez ve hiçbir yeri MÜHÜRLEMEZ — td-props-test flood-fill ile assert eder.
function townStreetProps(): TdProp[] {
  const out: TdProp[] = [];
  // caddenin güney kenarında fener sırası (4 tile pitch) + plaza güney köşeleri
  for (const tx of [182, 186, 190, 194, 198, 202]) out.push(deco('lamp_post', tx, 193));
  out.push(deco('lamp_post', 186, 199), deco('lamp_post', 198, 199));
  out.push(deco('well', 185, 195));                                   // plaza kuyusu
  out.push(deco('bench', 190, 196), deco('bench', 194, 196));         // ateşin iki yanı
  out.push(deco('snowman', 183, 196));
  out.push(deco('stall', 200, 194));                                  // marketplace önü pazar tezgâhı
  out.push(deco('barrel', 202, 195), deco('barrel', 185, 198));
  out.push(deco('crate', 201, 196), deco('crate', 184, 197));
  // tarla çiti — kuzeyde 3 tile'lık kapı boşluğu (194-196, çiftçi bu yönden gelir).
  // Çit DEKORATİF (DECO_SOLID'de değil): üstünden geçilir, parselleri asla hapsedemez.
  for (let tx = 191; tx <= 199; tx++) { if (tx >= 194 && tx <= 196) continue; out.push(deco('fence', tx, 208)); }
  for (let tx = 191; tx <= 199; tx++) out.push(deco('fence', tx, 214));
  for (let ty = 209; ty <= 213; ty++) out.push(deco('fence', 190, ty), deco('fence', 200, ty));
  // ── Faz 11.5: BİNA ÇEVRESİ SÜSLERİ — hepsi SOLID'SİZ (DECO_SOLID'e girmez → flood-fill
  // çapaları riske girmez). Kapı önü tile'ları (kapı tx ±1) bilerek boş bırakıldı.
  // Referans: inn 171-175 (kapı 173) · arena 178-181 (180) · marketplace 197-199 (198) ·
  // nftscore 203-205 (204) · archive 208-211 (210) — hepsi ty 190 bandı;
  // battleroyale 182-184 (183) · expeditions 188-190 (189) — ty 202 bandı.
  out.push(deco('firewood', 170, 188), deco('barrel', 170, 189), deco('crate', 170, 190)); // inn batı duvarı dibi
  out.push(deco('noticeboard', 212, 190));                                                  // archive kapı yanı (doğu)
  out.push(deco('banner_pole', 177, 190), deco('banner_pole', 183, 190));                   // arena önü iki yan
  out.push(deco('crate', 200, 190), deco('barrel', 201, 190), deco('crate', 201, 189));     // marketplace yanı küme
  out.push(deco('banner_pole', 181, 202));                                                  // battleroyale önü
  out.push(deco('firewood', 186, 202));                                                     // expeditions yanı
  return out;
}
// Modül-seviye cache güvenli: girdiler (HUB_GAMES/REGIONS) statik sabit.
let TOWN_CACHE: TdProp[] | null = null;
export function allTownProps(): TdProp[] { return TOWN_CACHE ?? (TOWN_CACHE = townProps()); }

// Modül-seviye cache güvenli: girdiler (HUB_GAMES/REGIONS) statik sabit.
let DOORS_CACHE: TdProp[] | null = null;
/** Kasaba/çayır/orman DIŞI 14 bölgenin merkezine zindan kapısı. */
export function dungeonDoors(): TdProp[] {
  return DOORS_CACHE ?? (DOORS_CACHE = REGIONS.filter(r => !['town', 'forest', 'grassE', 'grassS'].includes(r.key)).map(r => ({
    kind: 'door_dungeon' as const, x: r.cx * 16 + 8, y: r.cy * 16 + 14,
    solid: { x: r.cx * 16 - 8, y: r.cy * 16 - 2, w: 32, h: 14 },
    data: { id: r.key, name: r.key.toUpperCase(), region: r.key },
  })));
}

// ── Faz 5.6: KASABA PORTALLARI — kasaba dışı her bölgeye 1 portal, merkezden
// hash'li (salt 11) rastgele-görünümlü ofsette; collision'lı/su tile'ına denk gelirse
// doğuya doğru ilk yürünebilir tile'a kaydırılır. E → TOWN_SPAWN ışınlaması (sahne).
let PORTAL_CACHE: TdProp[] | null = null;
export function townPortals(): TdProp[] {
  if (PORTAL_CACHE) return PORTAL_CACHE;
  const out: TdProp[] = [];
  for (const rg of REGIONS) {
    if (rg.key === 'town') continue;
    const h = hash2d(rg.cx, rg.cy, 11);
    const ang = (h % 360) * Math.PI / 180;
    const rad = 10 + ((h >> 5) % Math.max(4, rg.r - 16));
    let tx = Math.max(4, Math.min(MAP_W - 5, Math.round(rg.cx + Math.cos(ang) * rad)));
    const ty = Math.max(4, Math.min(MAP_H - 5, Math.round(rg.cy + Math.sin(ang) * rad)));
    for (let i = 0; i < 12; i++) {                     // yürünebilir tile ara (doğuya kaydır)
      const t = getTile(tx, ty);
      if (!t.collision && t.biome !== 'water') break;
      tx = Math.min(MAP_W - 5, tx + 1);
    }
    out.push({
      kind: 'portal', x: tx * 16 + 8, y: ty * 16 + 14,
      data: { id: `portal-${rg.key}`, name: 'Town Portal', region: rg.key },
    });
  }
  return (PORTAL_CACHE = out);
}

// ── Faz 5.11: YOL TABELALARI — ana cadde × bölge sapağı kavşaklarına, sapağın işaret
// ettiği bölgenin adı + yön okuyla. Deterministik (bölge listesinden türetilir).
let SIGN_CACHE: TdProp[] | null = null;
export function roadSigns(): TdProp[] {
  if (SIGN_CACHE) return SIGN_CACHE;
  const out: TdProp[] = [];
  for (const rg of REGIONS) {
    if (rg.key === 'town') continue;
    const dir = rg.cy < ROAD_Y ? '↑' : '↓';
    const tx = rg.cx + 2, ty = ROAD_Y - 2;                     // kavşağın hemen kuzey-doğusu
    out.push({
      kind: 'sign', x: tx * 16 + 8, y: ty * 16 + 14,
      data: { id: `sign-${rg.key}`, name: `${dir} ${rg.key.toUpperCase()}`, region: rg.key },
    });
  }
  return (SIGN_CACHE = out);
}

// ── Faz 7: KASABA NPC'LERİ — npcs.ts elle yerleştirilmiş liste, hash YOK (deterministik).
// Ayak noktası diğer prop'larla aynı hizada (ty*16+14 → floor(y/16) === ty), solid kutusu
// ağaçlarınkiyle birebir: yolu tıkamaz ama içinden geçilmez.
let NPC_CACHE: TdProp[] | null = null;
export function npcProps(): TdProp[] {
  return NPC_CACHE ?? (NPC_CACHE = NPCS.map(n => ({
    kind: 'npc' as const, x: n.tx * 16 + 8, y: n.ty * 16 + 14,
    solid: { x: n.tx * 16 + 3, y: n.ty * 16 + 10, w: 10, h: 6 },
    data: { id: n.id, name: n.name },
  })));
}

// otomatik yerleşime kapalı: bina rect'leri (x ±1 tile, üst 1 / alt 2 tile pay — kapı önü), spawn ±3, kapı ±2 tile, portal ±2 tile
function reserved(tx: number, ty: number): boolean {
  if (Math.abs(tx - TOWN_SPAWN.tx) <= 3 && Math.abs(ty - TOWN_SPAWN.ty) <= 3) return true;
  for (const p of allTownProps()) {
    if (!p.solid) continue;
    const s = p.solid;
    if (tx * 16 + 8 >= s.x - 16 && tx * 16 + 8 < s.x + s.w + 16 && ty * 16 + 8 >= s.y - 16 && ty * 16 + 8 < s.y + s.h + 32) return true;
  }
  for (const d of dungeonDoors()) {
    if (Math.abs(tx * 16 + 8 - d.x) <= 32 && Math.abs(ty * 16 + 8 - d.y) <= 32) return true;
  }
  for (const p of townPortals()) {
    if (Math.abs(tx * 16 + 8 - p.x) <= 32 && Math.abs(ty * 16 + 8 - p.y) <= 32) return true;
  }
  // tarla grid alanı: otomatik ağaç/kaya/çalı yerleşmesin (parseller üstünde yürünür ama boş kalmalı)
  if (tx >= FARM_ORIGIN.tx - 1 && tx <= FARM_ORIGIN.tx + (FARM_COLS - 1) * FARM_PITCH + 1 &&
      ty >= FARM_ORIGIN.ty - 1 && ty <= FARM_ORIGIN.ty + (FARM_ROWS - 1) * FARM_PITCH + 1) return true;
  return false;
}

/** Chunk'ın deterministik prop listesi (kasaba sabitleri + kapılar dahil, koordinata filtreli). */
export function propsForChunk(cx: number, cy: number): TdProp[] {
  const out: TdProp[] = [];
  const bx = cx * CHUNK, by = cy * CHUNK;
  const inChunk = (p: TdProp) => p.x >= bx * 16 && p.x < (bx + CHUNK) * 16 && p.y >= by * 16 && p.y < (by + CHUNK) * 16;
  for (const p of allTownProps()) if (inChunk(p)) out.push(p);
  for (const d of dungeonDoors()) if (inChunk(d)) out.push(d);
  for (const p of townPortals()) if (inChunk(p)) out.push(p);
  for (const s of roadSigns()) if (inChunk(s)) out.push(s);
  for (const n of npcProps()) if (inChunk(n)) out.push(n);
  for (let ty = by; ty < by + CHUNK; ty++) for (let tx = bx; tx < bx + CHUNK; tx++) {
    const t = getTile(tx, ty);
    if (t.collision || t.biome === 'water') continue;
    if (reserved(tx, ty)) continue;
    const rgKey = regionAt(tx, ty).key;
    const hT = hash2d(tx, ty, 3);
    if (hT % 1000 < (TREE_DENS[t.biome] ?? 12)) {
      out.push({ kind: 'tree', x: tx * 16 + 8, y: ty * 16 + 14, v: hash2d(tx, ty, 4) % 4,
        solid: { x: tx * 16 + 3, y: ty * 16 + 10, w: 10, h: 6 }, data: { region: rgKey } });
      continue;
    }
    if (hash2d(tx, ty, 5) % 1000 < (ROCK_DENS[t.biome] ?? 6)) {
      out.push({ kind: 'rock', x: tx * 16 + 8, y: ty * 16 + 12, v: hash2d(tx, ty, 4) % 2,
        solid: { x: tx * 16 + 2, y: ty * 16 + 8, w: 12, h: 6 }, data: { region: rgKey } });
      continue;
    }
    if (hash2d(tx, ty, 6) % 1000 < (BUSH_DENS[t.biome] ?? 4)) {
      out.push({ kind: 'bush', x: tx * 16 + 8, y: ty * 16 + 13, v: hash2d(tx, ty, 4) % 2, data: { region: rgKey } });
      continue;
    }
    // Faz 8: biyom süsü — zincirin SONUNDA, yalnız boş kalan tile'larda (yukarıdaki
    // ağaç/kaya/çalı koordinatları değişmez). Tip, tile'a bağlı hash ile seçilir.
    const pool = DECO_BY_BIOME[t.biome];
    if (pool && pool.length && hash2d(tx, ty, 12) % 1000 < (DECO_DENS[t.biome] ?? 0)) {
      const d = deco(pool[hash2d(tx, ty, 13) % pool.length], tx, ty);
      d.data!.region = rgKey;
      out.push(d);
    }
  }
  return out;
}
