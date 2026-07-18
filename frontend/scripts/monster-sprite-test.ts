// frontend/scripts/monster-sprite-test.ts
// Çalıştır: npx tsx scripts/monster-sprite-test.ts
// Sahneleri tarayıp tüm monster tiplerini çıkarır; her tipin MONSTER_VISUALS'ta
// kaydı olduğunu, her arketipin frame'lerinin sheet sınırında olduğunu ve
// doldurulmamış (-1) frame kalmadığını doğrular.
// Not: paket CJS (package.json'da "type":"module" yok) → tsx bu dosyayı CJS
// olarak çalıştırır, __dirname doğrudan kullanılabilir.
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ARCHETYPES, MONSTER_VISUALS, SHEET_SPECS } from '../lib/game/iso/monsterSprites';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { cond ? pass++ : (fail++, console.log('✗', msg)); };

// 1) Sahnelerden tip envanteri
const dir = join(__dirname, '../lib/game/scenes');
const types = new Set<string>();
for (const f of readdirSync(dir).filter(f => f.startsWith('Iso') && f.endsWith('.ts'))) {
  const src = readFileSync(join(dir, f), 'utf8');
  for (const m of src.matchAll(/type: '([a-z0-9_]+)'/g)) types.add(m[1]);
}
// pickup/item'lar monster değil ('armor' = IsoTownScene sandık eşyası)
['potion', 'xp', 'quest', 'armor'].forEach(t => types.delete(t));
ok(types.size >= 100, `en az 100 tip bulunmalı (bulunan: ${types.size})`);

// 2) Her tipin kaydı var (null = bilinçli prosedürel, örn. boss)
for (const t of types) {
  ok(t in MONSTER_VISUALS, `eşleme eksik: '${t}' — MONSTER_VISUALS'a ekle (arketip+tint ya da null)`);
}

// 3) Arketip frame'leri sheet sınırında ve doldurulmuş
for (const [name, a] of Object.entries(ARCHETYPES)) {
  const spec = SHEET_SPECS[a.sheet];
  ok(!!spec, `arketip '${name}': bilinmeyen sheet '${a.sheet}'`);
  if (!spec) continue;
  const max = spec.cols * spec.rows;
  ok(a.frame >= 0, `arketip '${name}': frame doldurulmamış (-1) — kontakt sheet'ten seç`);
  ok(a.frame < max, `arketip '${name}': frame ${a.frame} sınır dışı (max ${max})`);
  if (a.frame2 !== undefined) ok(a.frame2 >= 0 && a.frame2 < max, `arketip '${name}': frame2 sınır dışı`);
}

// 4) Her non-null eşlemenin arketipi tanımlı
for (const [t, v] of Object.entries(MONSTER_VISUALS)) {
  if (v) ok(v.arch in ARCHETYPES, `'${t}' bilinmeyen arketip '${v.arch}'`);
}

console.log(`monster-sprite-test: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
