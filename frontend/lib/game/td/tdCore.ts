// frontend/lib/game/td/tdCore.ts
// ─── TD çekirdeği: grid matematiği + determinizm ───
// İzo core'un aksine projeksiyon birebir: ekran = tile × TILE.

export const TILE = 16;          // px / tile
export const CHUNK = 48;         // tile / chunk kenarı (48×48 tile = 768×768 px canvas)
export const VIEW_W = 384;       // iç çözünürlük (24 tile) — Larvy zoom ölçümü (spec §3)
export const VIEW_H = 256;       // 16 tile
export const MAP_W = 384;        // dünya: 384×384 tile (spec §2)
export const MAP_H = 384;

export function toScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE, y: ty * TILE };
}
export function toTile(sx: number, sy: number): { tx: number; ty: number } {
  return { tx: Math.floor(sx / TILE), ty: Math.floor(sy / TILE) };
}
/** y-sort: alt kenarı (feet) büyük olan üste çizilir. x kırıcı olarak eklenir. */
export function depth(x: number, footY: number): number {
  return footY * 10 + (x % 10) / 10;
}
export function chunkOf(tx: number, ty: number): { cx: number; cy: number } {
  return { cx: Math.floor(tx / CHUNK), cy: Math.floor(ty / CHUNK) };
}
/** Kamera merkezine göre görünür + 1 halka chunk listesi (LRU stream için). */
export function chunksInView(camCenterX: number, camCenterY: number): { cx: number; cy: number }[] {
  const { cx, cy } = chunkOf(Math.floor(camCenterX / TILE), Math.floor(camCenterY / TILE));
  const out: { cx: number; cy: number }[] = [];
  const maxC = Math.ceil(MAP_W / CHUNK) - 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx > maxC || ny > maxC) continue;
    out.push({ cx: nx, cy: ny });
  }
  return out;
}
/**
 * Deterministik 2B hash — harita/deko üretiminin tek rastgelelik kaynağı.
 * SALT SÖZLÜĞÜ (çakışma yasak): 0=serbest, 1=bölge blend (worldMap),
 * 2=tile deko (tiles), 3=prop yerleşim, 4=prop varyant, 5=kaya, 6=çalı, 7=canavar yerleşim, 8=zindan üretimi, 9=tarla yerleşimi.
 * Yeni tüketici buraya kayıt düşmeden salt alamaz.
 */
export function hash2d(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}
