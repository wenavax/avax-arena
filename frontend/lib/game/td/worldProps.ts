// frontend/lib/game/td/worldProps.ts
// ─── Deterministik prop yerleşimi (saf; DOM yok) ───
// Kasaba binaları HUB_GAMES'ten türetilir (tek doğruluk kaynağı korunur).
// salt sözlüğü: 3=yerleşim(ağaç), 4=varyant, 5=kaya, 6=çalı (bkz tdCore.hash2d).
import { CHUNK, hash2d } from './tdCore';
import { getTile, regionAt, REGIONS, TOWN_SPAWN } from './worldMap';
import { HUB_GAMES, buildingRect } from '../hub/hubGames';

export type PropKind = 'tree' | 'rock' | 'bush' | 'campfire' | 'building' | 'door_dungeon' | 'farm_plot';
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
const TREE_DENS: Record<string, number> = {
  forest: 90, grass: 25, town: 6, swamp: 45, frostwastes: 30, sanctum: 35,
  necropolis: 18, ruins: 14, mines: 10, citadel: 12, volcano: 6, crypt: 12,
  abyss: 8, forge: 6, demongate: 6, voidrealm: 5, eternal: 8, water: 0, path: 0,
};
const ROCK_DENS: Record<string, number> = {
  mines: 30, volcano: 26, forge: 20, ruins: 18, frostwastes: 14, abyss: 14,
  town: 2, water: 0, path: 0,
};
const BUSH_DENS: Record<string, number> = { forest: 14, grass: 12, town: 6, swamp: 10, water: 0, path: 0 };

function townProps(): TdProp[] {
  const out: TdProp[] = [];
  for (const g of HUB_GAMES) {
    const r = buildingRect(g);
    const doorTx = TOWN_ORIGIN.tx + g.door.tx, doorTy = TOWN_ORIGIN.ty + g.door.ty;
    out.push({
      kind: 'building', x: doorTx * 16 + 8, y: doorTy * 16 + 15,
      solid: { x: (TOWN_ORIGIN.tx + r.c0) * 16, y: (TOWN_ORIGIN.ty + r.r0) * 16, w: g.size.w * 16, h: g.size.h * 16 - 6 },
      data: { id: g.id, name: g.name, icon: g.icon, url: g.url, accent: g.accent, wTiles: g.size.w, hTiles: g.size.h },
    });
  }
  // meydan kamp ateşi (spawn'ın 3 tile kuzeyi)
  out.push({
    kind: 'campfire', x: TOWN_SPAWN.tx * 16 + 8, y: (TOWN_SPAWN.ty - 3) * 16 + 10,
    solid: { x: TOWN_SPAWN.tx * 16 + 2, y: (TOWN_SPAWN.ty - 3) * 16 + 4, w: 12, h: 6 },
  });
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

// otomatik yerleşime kapalı: bina rect'leri (x ±1 tile, üst 1 / alt 2 tile pay — kapı önü), spawn ±3, kapı ±2 tile
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
