// frontend/lib/game/td/dungeonGen.ts
// ─── Saf, deterministik prosedürel zindan üretici (Node-testli) ───
// id (dungeonId, worldMap REGIONS key'i) → 48×40 tile'lık oda+koridor layout.
// Rastgelelik KAYNAĞI: id'nin karakter kodlarından türetilen mulberry32 PRNG —
// tdCore.hash2d KULLANILMAZ (bu üretici 2B koordinat değil, 1B sıralı adım akışı
// gerektirir; salt 8 yalnız JSDoc'a kayıt için — ADR'de gelecek 2B ihtiyaç için ayrılmıştır).

export const DUNGEON_W = 48;
export const DUNGEON_H = 40;

export interface DungeonGen {
  w: number;
  h: number;
  tiles: Uint8Array;               // 0=duvar, 1=zemin (row-major: y*w+x)
  entry: { x: number; y: number };
  boss: { x: number; y: number };
  spawns: { x: number; y: number }[];
}

interface Room { x: number; y: number; w: number; h: number }
function roomCenter(r: Room): { x: number; y: number } {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
}

/** id → 32-bit seed (karakter kodlarının hash'i). Saf, deterministik. */
function seedFromId(id: string): number {
  let h = 2166136261 >>> 0; // FNV-1a başlangıcı — id string'inden stabil 32-bit çıkarım
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: hızlı, deterministik, saf 32-bit PRNG (Math.random YOK). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function carveRoom(tiles: Uint8Array, w: number, r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = 1;
}

function carveHCorridor(tiles: Uint8Array, w: number, x0: number, x1: number, y: number): void {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  for (let x = lo; x <= hi; x++) tiles[y * w + x] = 1;
}
function carveVCorridor(tiles: Uint8Array, w: number, y0: number, y1: number, x: number): void {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  for (let y = lo; y <= hi; y++) tiles[y * w + x] = 1;
}

/**
 * Deterministik prosedürel zindan (48×40). id=dungeonId (REGIONS key).
 * 6-8 oda (rastgele dikdörtgen 6-10 tile) yerleştirme sırasına göre L-koridorlarla
 * bağlanır. entry = en güneydeki (y en büyük) odanın alt-orta noktası. boss = entry'den
 * öklid mesafesi en uzak odanın merkezi. spawns = diğer odaların merkezleri + büyük
 * odalar (w*h >= 72) için bir ekstra nokta (oda içi ikinci köşe, taşma korumalı).
 */
export function genDungeon(id: string): DungeonGen {
  const w = DUNGEON_W, h = DUNGEON_H;
  const tiles = new Uint8Array(w * h); // 0 = duvar (varsayılan)
  const rnd = mulberry32(seedFromId(id));

  const roomCount = 6 + Math.floor(rnd() * 3); // 6..8
  const rooms: Room[] = [];
  const MARGIN = 2; // dünya kenarı duvar bandı (border-intact testine uyum)
  for (let i = 0; i < roomCount; i++) {
    let placed: Room | null = null;
    for (let tr = 0; tr < 40 && !placed; tr++) {
      const rw = 6 + Math.floor(rnd() * 5); // 6..10
      const rh = 6 + Math.floor(rnd() * 5); // 6..10
      const rx = MARGIN + Math.floor(rnd() * (w - rw - MARGIN * 2));
      const ry = MARGIN + Math.floor(rnd() * (h - rh - MARGIN * 2));
      const cand: Room = { x: rx, y: ry, w: rw, h: rh };
      // hafif çakışma toleranslı: merkezler çok yakın değilse kabul (basit disk-örnekleme)
      const c = roomCenter(cand);
      let ok = true;
      for (const other of rooms) {
        const oc = roomCenter(other);
        if (Math.hypot(c.x - oc.x, c.y - oc.y) < 8) { ok = false; break; }
      }
      if (ok) placed = cand;
    }
    if (placed) rooms.push(placed);
  }
  // en az 1 oda garantisi (aşırı nadir başarısızlık durumunda merkez oda)
  if (rooms.length === 0) rooms.push({ x: Math.floor(w / 2) - 4, y: Math.floor(h / 2) - 4, w: 8, h: 8 });

  for (const r of rooms) carveRoom(tiles, w, r);

  // Yerleşim sırasına göre L-koridor zinciri (i → i+1): merkezden merkeze, yatay-sonra-dikey.
  for (let i = 1; i < rooms.length; i++) {
    const a = roomCenter(rooms[i - 1]);
    const b = roomCenter(rooms[i]);
    carveHCorridor(tiles, w, a.x, b.x, a.y);
    carveVCorridor(tiles, w, a.y, b.y, b.x);
  }

  // entry = en güneydeki (y en büyük merkez) odanın alt-orta noktası
  const withCenters = rooms.map(r => ({ r, c: roomCenter(r) }));
  const entryRoom = [...withCenters].sort((a, b) => b.c.y - a.c.y)[0];
  const entry = { x: entryRoom.c.x, y: Math.min(entryRoom.r.y + entryRoom.r.h - 1, h - MARGIN - 1) };

  // boss = entry'den öklid mesafesi en uzak oda merkezi
  let bossRoom = withCenters[0];
  let bestDist = -1;
  for (const rc of withCenters) {
    const d = Math.hypot(rc.c.x - entry.x, rc.c.y - entry.y);
    if (d > bestDist) { bestDist = d; bossRoom = rc; }
  }
  const boss = { x: bossRoom.c.x, y: bossRoom.c.y };

  // spawns = entry/boss dışındaki odaların merkezleri + büyük odalara (>=72 tile) 1 ekstra nokta
  const spawns: { x: number; y: number }[] = [];
  for (const rc of withCenters) {
    if (rc.r === entryRoom.r || rc.r === bossRoom.r) continue;
    spawns.push({ x: rc.c.x, y: rc.c.y });
    if (rc.r.w * rc.r.h >= 72) {
      const ex = Math.min(rc.r.x + rc.r.w - 2, w - MARGIN - 1);
      const ey = Math.min(rc.r.y + rc.r.h - 2, h - MARGIN - 1);
      spawns.push({ x: Math.max(rc.r.x + 1, ex), y: Math.max(rc.r.y + 1, ey) });
    }
  }
  // eğer yalnız 1 oda üretilmişse (aşırı nadir), en az 1 spawn garantile (entry noktasının kendisi)
  if (spawns.length === 0) spawns.push({ x: entry.x, y: Math.max(MARGIN, entry.y - 2) });

  return { w, h, tiles, entry, boss, spawns };
}
