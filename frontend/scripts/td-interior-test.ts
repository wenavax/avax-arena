// Faz 11.1: iç mekân veri tutarlılığı — interiors.ts SAF, Node'da koşar.
// Sahne (TdInteriorScene.canMove) ile AYNI interiorWalkable kullanılır: burada geçen
// flood-fill, oyunda da hiçbir hücrenin mühürlenmediği anlamına gelir.
import { INTERIORS, FURN_SIZE, FURN_SOLID, interiorWalkable, type InteriorDef, type FurnKind } from '../lib/game/td/interiors';
import { INTERIOR_FURN_SPEC } from '../lib/game/td/sprites/interiorProps';
import { TD_HOUSES } from '../lib/game/td/worldProps';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('FAIL ' + n); } };

const ids = Object.keys(INTERIORS);
console.log('interiors:', ids.join(', '));
ok('at-least-two-interiors', ids.length >= 2);

// ── TD_HOUSES ↔ INTERIORS eşleşmesi (iki yönlü — kapısız oda / odasız kapı olmasın) ──
const houseIds = TD_HOUSES.map(h => h.id);
ok('houses-have-interiors', houseIds.every(id => !!INTERIORS[id]));
ok('interiors-have-houses', ids.every(id => houseIds.includes(id)));
ok('house-ids-unique', new Set(houseIds).size === houseIds.length);

// ── FURN spec'leri: her FurnKind için pozitif boyut (Record tipi eksik anahtarı derlemede
// yakalar; boyut sıfır/negatif olmasın diye runtime'da da bakılır) ──
const kinds = Object.keys(FURN_SIZE) as FurnKind[];
ok('furn-size-positive', kinds.every(k => FURN_SIZE[k].w > 0 && FURN_SIZE[k].h > 0));
ok('furn-spec-positive', kinds.every(k => INTERIOR_FURN_SPEC[k].w > 0 && INTERIOR_FURN_SPEC[k].h > 0));
ok('furn-spec-draw-fn', kinds.every(k => typeof INTERIOR_FURN_SPEC[k].draw === 'function'));

for (const def of Object.values(INTERIORS) as InteriorDef[]) {
  const { w, h } = def.room;
  const P = (n: string) => `${def.id}:${n}`;
  ok(P('id-matches-key'), INTERIORS[def.id] === def);
  ok(P('room-dims'), w >= 8 && h >= 6 && w <= 24 && h <= 16);

  // mobilya oda içinde (taban alanı dahil taşma yok)
  ok(P('furniture-in-bounds'), def.furniture.every(f => {
    const s = FURN_SIZE[f.kind];
    return f.tx >= 0 && f.ty >= 0 && f.tx + s.w <= w && f.ty + s.h <= h;
  }));
  // solid mobilyalar birbiriyle çakışmaz (üst üste iki yatak = veri hatası)
  const cellsOf = (f: { kind: FurnKind; tx: number; ty: number }) => {
    const s = FURN_SIZE[f.kind]; const out: string[] = [];
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) out.push(`${f.tx + dx},${f.ty + dy}`);
    return out;
  };
  const solidCells = def.furniture.filter(f => FURN_SOLID.has(f.kind)).flatMap(cellsOf);
  ok(P('solid-furniture-no-overlap'), new Set(solidCells).size === solidCells.length);

  // exitPad: oda içinde, alt sırada, yürünebilir; spawn hücresi (pad'in 1 üstü) de açık
  ok(P('exitpad-bottom-row'), def.exitPad.ty === h - 1);
  ok(P('exitpad-walkable'), interiorWalkable(def, def.exitPad.tx, def.exitPad.ty));
  ok(P('spawn-walkable'), interiorWalkable(def, def.exitPad.tx, def.exitPad.ty - 1));

  // npc (varsa) yürünebilir hücrede durur — 11.2 sahneye bağlarken hazır olsun
  if (def.npc) ok(P('npc-walkable'), interiorWalkable(def, def.npc.tx, def.npc.ty));

  // 🔒 MÜHÜRLEME ÇAPASI: kapıdan (exitPad) flood-fill — her yürünebilir hücre erişilebilir
  // (solid mobilya odayı iki parçaya bölemez).
  let walkableTotal = 0;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) if (interiorWalkable(def, tx, ty)) walkableTotal++;
  const seen = new Set<string>([`${def.exitPad.tx},${def.exitPad.ty}`]);
  const queue: [number, number][] = [[def.exitPad.tx, def.exitPad.ty]];
  while (queue.length) {
    const [tx, ty] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tx + dx, ny = ty + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !interiorWalkable(def, nx, ny)) continue;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  console.log(`${def.id}: ${w}x${h}, furniture ${def.furniture.length}, walkable ${walkableTotal}, reachable ${seen.size}`);
  ok(P('all-walkable-reachable'), seen.size === walkableTotal);
  ok(P('room-mostly-open'), walkableTotal >= (w * h) * 0.6);  // mobilya odayı boğmasın
}

console.log(`td-interior: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
