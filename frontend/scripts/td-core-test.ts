// frontend/scripts/td-core-test.ts
import { TILE, CHUNK, VIEW_W, VIEW_H, toScreen, toTile, depth, chunkOf, chunksInView, hash2d, computeTdView } from '../lib/game/td/tdCore';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

eq('TILE', TILE, 16); eq('CHUNK', CHUNK, 48); eq('VIEW', [VIEW_W, VIEW_H], [384, 256]);
eq('toScreen', toScreen(3, 5), { x: 48, y: 80 });
eq('toTile', toTile(48, 80), { tx: 3, ty: 5 });
eq('toTile-neg-floor', toTile(-1, -1), { tx: -1, ty: -1 });
eq('depth-y-sort', depth(10, 200) > depth(10, 100), true);
eq('chunkOf', chunkOf(49, 95), { cx: 1, cy: 1 });
eq('chunksInView-center', chunksInView(3072, 3072).length, 9); // harita ortası (tile 192 → chunk 4) → 3×3 halka
eq('chunksInView-corner', chunksInView(100, 100).length, 4);   // köşe chunk (0,0) → 2×2 kırpılır
eq('hash2d-det', hash2d(12, 34) === hash2d(12, 34), true);
eq('hash2d-diff', hash2d(12, 34) !== hash2d(34, 12), true);
eq('hash2d-salt-differs', hash2d(12, 34, 1) !== hash2d(12, 34), true);
eq('hash2d-salt-det', hash2d(12, 34, 7) === hash2d(12, 34, 7), true);
eq('depth-x-tiebreak', depth(3, 100) !== depth(7, 100), true);
eq('depth-y-dominates', depth(9, 101) > depth(0, 100), true);

// ── Faz 5.1: computeTdView (adaptif tam-doldurma) ──
eq('view-1080p', computeTdView(1920, 1080), { k: 4, w: 480, h: 270 });     // FIT oranı 4.21 → k=4
eq('view-768p-laptop', computeTdView(1366, 768), { k: 3, w: 456, h: 256 }); // min oran 3.0
eq('view-1440p', computeTdView(2560, 1440), { k: 6, w: 427, h: 240 });      // 5.625 → k=6
eq('view-phone-portrait', computeTdView(390, 844), { k: 2, w: 195, h: 422 }); // oran ~1 → alt kıskaç 2
eq('view-4k-cap', computeTdView(7680, 4320), { k: 8, w: 960, h: 540 });     // üst kıskaç 8
eq('view-preview-box', computeTdView(1024, 683), { k: 3, w: 342, h: 228 }); // max-w-5xl 3:2 kutusu
eq('view-zero-fallback', computeTdView(0, 0), { k: 1, w: VIEW_W, h: VIEW_H });
// mantıksal boyut × k viewport'u DOLDURMALI (bant yok) — tüm örneklerde w*k ≥ vw, h*k ≥ vh
for (const [vw, vh] of [[1920, 1080], [1366, 768], [2560, 1440], [390, 844], [1024, 683]] as const) {
  const v = computeTdView(vw, vh);
  eq(`view-fills-${vw}x${vh}`, v.w * v.k >= vw && v.h * v.k >= vh, true);
  eq(`view-crop-max-${vw}x${vh}`, v.w * v.k - vw < v.k && v.h * v.k - vh < v.k, true);
}

console.log(`td-core: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
