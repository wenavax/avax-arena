// frontend/lib/game/td/sprites/monsterChibi.ts
// ─── Canavar chibi fabrikası: 6 gövde planı × arketip eşleme × tint ───
// Veri kaynağı iso/monsterSprites (SADECE import — dokunulmaz).
// Client-only çizim; monsterPlanFor/ARCH_TO_PLAN saf (Node-testli).
import { spr, outline, type Px } from './chibi';
import { MONSTER_VISUALS } from '../../iso/monsterSprites';

export type PlanKey = 'biped' | 'beast' | 'blob' | 'flying' | 'serpent' | 'boss';
export const PLANS: Record<PlanKey, true> = { biped: true, beast: true, blob: true, flying: true, serpent: true, boss: true };

export const ARCH_TO_PLAN: Record<string, PlanKey> = {
  skeleton: 'biped', zombie: 'biped', wraith: 'biped', demon: 'biped', imp: 'biped',
  knight: 'biped', mage: 'biped', golem: 'biped',
  beast: 'beast', rat: 'beast', spider: 'beast', insect: 'beast',
  blob: 'blob', plant: 'blob', elemental: 'blob', octopus: 'blob',
  ghost: 'flying', bird: 'flying',
  snake: 'serpent', dragon: 'serpent',
};

/** Tip → plan (saf). Bilinmeyen/null (boss) → 'boss'. */
export function monsterPlanFor(type: string): PlanKey {
  const vis = MONSTER_VISUALS[type];
  if (!vis) return 'boss';
  return ARCH_TO_PLAN[vis.arch] ?? 'biped';
}

const EYE = '#20242c';
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function shade(c: string, f: number): string {
  const n = parseInt(c.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Her plan: 2 kare (idle/step) çizer. body = ana renk (tint'ten), boyut small/big.
// Faz 5.11: kahraman detay yükseltmesinin (chibi 5.9) canavar eşleniği — boyutlar
// büyüdü, gölgeleme 2-ton, göz parıltıları, plan-imzası detaylar (boynuz/diş/kanat
// zarı/çıngırak/göğüs rünü vb.) eklendi.
function drawBiped(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72), L = shade(C, 1.25);
  px(cx - 6, 0, 2, 2, D); px(cx + 4, 0, 2, 2, D);               // kulak/boynuz uçları
  px(cx - 5, 1, 10, 2, C); px(cx - 6, 3, 12, 5, C);             // iri kafa
  px(cx - 4, 2, 3, 1, L);                                        // tepe parlaması
  px(cx - 4, 4, 2, 2, EYE); px(cx + 2, 4, 2, 2, EYE);
  px(cx - 4, 4, 1, 1, '#ffffff'); px(cx + 2, 4, 1, 1, '#ffffff'); // göz parıltısı
  px(cx - 2, 7, 4, 1, D); px(cx - 1, 7, 1, 1, '#ffffff'); px(cx + 1, 7, 1, 1, '#ffffff'); // dişli ağız
  px(cx - 6, 8, 12, 1, D);                                       // çene gölgesi
  px(cx - 5, 9, 10, H - 15, C);                                  // gövde
  px(cx - 5, 9, 1, H - 15, L); px(cx + 3, 9, 2, H - 15, D);      // 2-ton
  px(cx - 2, 11, 4, 3, shade(C, 1.12));                          // göbek yaması
  const sw = f === 0 ? 0 : 1;
  px(cx - 7, 9 + sw, 2, 4, D); px(cx + 5, 10 - sw, 2, 4, D);     // kollar (salınım)
  if (f === 0) { px(cx - 4, H - 6, 3, 4, D); px(cx + 1, H - 6, 3, 4, D); }
  else { px(cx - 4, H - 6, 3, 3, D); px(cx + 1, H - 7, 3, 5, D); }
  px(cx - 4, H - 2, 3, 2, shade(C, 0.5)); px(cx + 1, H - 2, 3, 2, shade(C, 0.5)); // ayaklar
}
function drawBeast(px: Px, f: number, C: string, W: number, H: number): void {
  const D = shade(C, 0.72), L = shade(C, 1.25);
  px(3, H - 11, W - 9, 8, C);                                    // yatay gövde
  px(3, H - 11, W - 9, 2, D);                                    // sırt şeridi
  px(3, H - 5, W - 9, 2, shade(C, 0.85));                        // karın alt tonu
  px(4, H - 9, 3, 3, L);                                         // göğüs postu
  px(0, H - 13, 3, 3, C); px(1, H - 15, 2, 3, D);                // kıvrık kuyruk + ucu
  px(W - 8, H - 14, 7, 7, C);                                    // baş sağda
  px(W - 9, H - 16, 3, 3, C); px(W - 4, H - 16, 3, 3, C);        // kulaklar
  px(W - 8, H - 15, 1, 1, D); px(W - 3, H - 15, 1, 1, D);        // kulak içi
  px(W - 6, H - 12, 2, 2, EYE); px(W - 6, H - 12, 1, 1, '#ffffff');
  px(W - 2, H - 10, 2, 2, D); px(W - 1, H - 10, 1, 1, '#20242c'); // burun/burun deliği
  const st = f === 0 ? 0 : 2;
  px(4 + st, H - 3, 2, 3, D); px(W - 9 - st, H - 3, 2, 3, D);    // çapraz bacak çifti 1
  px(8 - (st >> 1), H - 3, 2, 3, shade(C, 0.6)); px(W - 13 + (st >> 1), H - 3, 2, 3, shade(C, 0.6)); // çift 2
}
function drawBlob(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72), L = shade(C, 1.3);
  const squish = f === 0 ? 0 : 1;
  px(cx - 6, 3 + squish, 12, H - 5 - squish, C);
  px(cx - 8, 6 + squish, 16, H - 8 - squish, C);
  px(cx - 6, 4 + squish, 4, 2, L); px(cx - 7, 8 + squish, 2, 3, L); // büyük gloss + yan parlama
  px(cx + 5, 7 + squish, 2, 2, L);                               // kabarcık
  px(cx + 3, 3 + squish, 2, 2, C);                               // tepe damlası
  px(cx - 8, H - 4, 16, 2, D);                                   // taban gölgesi
  if (f === 1) px(cx - 9, H - 6, 2, 3, D);                       // yana taşan damla (squish)
  px(cx - 4, 7 + squish, 2, 2, EYE); px(cx + 1, 7 + squish, 2, 2, EYE);
  px(cx - 4, 7 + squish, 1, 1, '#ffffff'); px(cx + 1, 7 + squish, 1, 1, '#ffffff');
  px(cx - 2, 11 + squish, 4, 1, D);                              // dalgalı ağız
}
function drawFlying(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72), L = shade(C, 1.25);
  const wing = f === 0 ? 0 : -3;
  px(cx - 10, 6 + wing, 6, 4, D); px(cx + 4, 6 + wing, 6, 4, D); // kanatlar
  px(cx - 10, 6 + wing, 6, 1, shade(C, 0.5)); px(cx + 4, 6 + wing, 6, 1, shade(C, 0.5)); // kanat kemiği
  px(cx - 9, 8 + wing, 1, 2, shade(C, 0.5)); px(cx - 7, 8 + wing, 1, 2, shade(C, 0.5)); // zar çizgileri
  px(cx + 5, 8 + wing, 1, 2, shade(C, 0.5)); px(cx + 7, 8 + wing, 1, 2, shade(C, 0.5));
  px(cx - 5, 2, 10, 10, C);                                      // gövde
  px(cx - 4, 3, 3, 2, L);                                        // tepe parlaması
  px(cx - 3, 5, 2, 2, EYE); px(cx + 1, 5, 2, 2, EYE);
  px(cx - 3, 5, 1, 1, '#ffffff'); px(cx + 1, 5, 1, 1, '#ffffff');
  px(cx - 2, 9, 1, 2, '#ffffff'); px(cx + 1, 9, 1, 2, '#ffffff'); // sivri dişler
  px(cx - 4, 12, 2, 3, C); px(cx - 1, 12, 2, 4, C); px(cx + 2, 12, 2, 3, C); // saçak
  px(cx - 1, H - 1, 2, 1, D);                                    // kuyruk fısıltısı
}
function drawSerpent(px: Px, f: number, C: string, W: number, H: number): void {
  const D = shade(C, 0.72), L = shade(C, 1.25), s = f === 0 ? 0 : 1;
  px(1, H - 5, W - 8, 3, C); px(1, H - 3, W - 8, 1, D);          // alt kıvrım
  px(4 + s, H - 9, W - 13, 3, C); px(4 + s, H - 7, W - 13, 1, D); // üst kıvrım
  px(3, H - 5, 3, 2, D); px(2, H - 6, 2, 2, shade(C, 0.55)); px(0, H - 5, 2, 2, shade(C, 0.55)); // çıngırak halkaları
  px(W - 9, H - 15, 8, 8, C);                                    // baş + hood
  px(W - 10, H - 13, 2, 5, C); px(W - 1, H - 13, 1, 5, C);       // hood kanatları
  px(W - 8, H - 14, 4, 1, L);                                    // baş parlaması
  px(W - 6, H - 13, 2, 2, EYE); px(W - 6, H - 13, 1, 1, '#ffffff');
  px(W - 10, H - 9 + s, 2, 1, '#e84142'); px(W - 11, H - 10 + s, 1, 1, '#e84142'); // çatal dil
  px(2, H - 4, W - 10, 1, shade(C, 1.1));                        // karın pulu vurgusu
}
function drawBoss(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.7), L = shade(C, 1.3);
  px(cx - 11, 0, 4, 5, L); px(cx + 7, 0, 4, 5, L);               // boynuzlar
  px(cx - 12, 0, 2, 2, '#ffffff'); px(cx + 10, 0, 2, 2, '#ffffff'); // boynuz uçları
  px(cx - 8, 1, 16, 3, C); px(cx - 10, 3, 20, 9, C);             // dev kafa
  px(cx - 6, 2, 5, 1, L);
  px(cx - 6, 5, 3, 3, '#ffe08a'); px(cx + 3, 5, 3, 3, '#ffe08a'); // közlenen gözler
  px(cx - 5, 6, 1, 1, '#ffffff'); px(cx + 4, 6, 1, 1, '#ffffff');
  px(cx - 3, 9, 6, 2, D);                                        // ağız
  px(cx - 3, 9, 1, 1, '#ffffff'); px(cx, 9, 1, 1, '#ffffff'); px(cx + 2, 9, 1, 1, '#ffffff'); // dişler
  px(cx - 9, 12, 18, H - 19, C);                                 // gövde
  px(cx - 9, 12, 2, H - 19, L); px(cx + 7, 12, 2, H - 19, D);
  px(cx - 12, 11, 3, 3, C); px(cx + 9, 11, 3, 3, C);             // omuz dikenleri
  px(cx - 12, 10, 2, 2, L); px(cx + 10, 10, 2, 2, L);
  px(cx - 1, 15, 3, 3, '#ffe08a'); px(cx, 14, 1, 1, '#ffffff');  // göğüs rünü
  const sw = f === 0 ? 0 : 1;
  px(cx - 13, 13 + sw, 3, 6, D); px(cx + 10, 14 - sw, 3, 6, D);  // pençe kollar
  px(cx - 14, 18 + sw, 2, 2, '#ffffff'); px(cx + 12, 19 - sw, 2, 2, '#ffffff'); // pençeler
  if (f === 0) { px(cx - 6, H - 7, 5, 7, D); px(cx + 1, H - 7, 5, 7, D); }
  else { px(cx - 6, H - 7, 5, 6, D); px(cx + 1, H - 8, 5, 8, D); }
  px(cx - 6, H - 2, 5, 2, shade(C, 0.5)); px(cx + 1, H - 2, 5, 2, shade(C, 0.5));
}

const DRAW: Record<PlanKey, (px: Px, f: number, C: string, W: number, H: number) => void> = {
  biped: drawBiped, beast: drawBeast, blob: drawBlob, flying: drawFlying, serpent: drawSerpent, boss: drawBoss,
};
/** Plan → taban boyut (small overworld / big battle ×~2). Faz 5.11: detay için büyüdü. */
const SIZE: Record<PlanKey, [number, number]> = {
  biped: [16, 22], beast: [22, 16], blob: [18, 16], flying: [20, 17], serpent: [22, 16], boss: [30, 30],
};

/** Canavar chibi 2-kare seti. big=savaş boyu (×2). Tint MONSTER_VISUALS'tan; boss default kızıl. */
export function mkMonsterChibi(type: string, big = false): { frames: HTMLCanvasElement[]; ox: number; oy: number } {
  const plan = monsterPlanFor(type);
  const vis = MONSTER_VISUALS[type];
  const base = vis?.tint !== undefined ? hex(vis.tint) : plan === 'boss' ? '#b03038' : '#9aa4b0';
  const [w, h] = SIZE[plan];
  const mult = big ? 2 : 1;
  const frames = [0, 1].map(f => {
    const raw = spr(w, h, (px) => DRAW[plan](px, f, base, w, h));
    const o = outline(raw);
    if (mult === 1) return o;
    const c = document.createElement('canvas');
    c.width = o.width * mult; c.height = o.height * mult;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(o, 0, 0, c.width, c.height);
    return c;
  });
  return { frames, ox: frames[0].width >> 1, oy: frames[0].height - 2 };
}
