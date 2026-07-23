// frontend/lib/game/td/worldProps.ts
// ─── Deterministik prop yerleşimi (saf; DOM yok) ───
// Kasaba binaları HUB_GAMES'ten türetilir (tek doğruluk kaynağı korunur).
// salt sözlüğü: 3=yerleşim(ağaç), 4=varyant, 5=kaya, 6=çalı, 11=portal (bkz tdCore.hash2d).
import { CHUNK, MAP_W, MAP_H, hash2d } from './tdCore';
import { getTile, regionAt, REGIONS, TOWN_SPAWN, ROAD_Y } from './worldMap';
import { HUB_GAMES } from '../hub/hubGames';

export type PropKind = 'tree' | 'rock' | 'bush' | 'campfire' | 'building' | 'door_dungeon' | 'farm_plot' | 'portal' | 'sign';
export interface TdProp {
  kind: PropKind;
  x: number; y: number;                    // dünya px (taban/ayak noktası)
  v?: number;                              // sprite varyantı
  solid?: { x: number; y: number; w: number; h: number };
  data?: { id?: string; name?: string; icon?: string; url?: string; accent?: string; wTiles?: number; hTiles?: number; region?: string; plotIndex?: number };
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
  out.push(...allFarmPlots());
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
    }
  }
  return out;
}
