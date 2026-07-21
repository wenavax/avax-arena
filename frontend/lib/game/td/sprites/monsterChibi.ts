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
function drawBiped(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72), L = shade(C, 1.25);
  px(cx - 4, 0, 8, 2, C); px(cx - 5, 1, 10, 5, C);            // iri kafa
  px(cx - 3, 2, 2, 2, EYE); px(cx + 1, 2, 2, 2, EYE);
  px(cx - 5, 5, 10, 1, D);
  px(cx - 4, 6, 8, H - 12, C); px(cx - 4, 6, 1, H - 12, D); px(cx + 3, 6, 1, H - 12, D); // gövde
  px(cx - 5, 7, 1, 3, L); px(cx + 4, 7, 1, 3, L);              // omuz vurgusu
  if (f === 0) { px(cx - 3, H - 4, 2, 4, D); px(cx + 1, H - 4, 2, 4, D); }
  else { px(cx - 3, H - 4, 2, 3, D); px(cx + 1, H - 5, 2, 5, D); }
}
function drawBeast(px: Px, f: number, C: string, W: number, H: number): void {
  const D = shade(C, 0.72);
  px(2, H - 9, W - 6, 6, C); px(2, H - 4, W - 6, 1, D);        // yatay gövde
  px(W - 7, H - 12, 6, 6, C); px(W - 5, H - 11, 2, 2, EYE);    // baş sağda
  px(W - 8, H - 13, 2, 2, C); px(W - 3, H - 13, 2, 2, C);      // kulaklar
  px(0, H - 8, 3, 2, D);                                        // kuyruk
  if (f === 0) { px(4, H - 3, 2, 3, D); px(W - 8, H - 3, 2, 3, D); }
  else { px(6, H - 3, 2, 3, D); px(W - 10, H - 3, 2, 3, D); }
}
function drawBlob(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72), L = shade(C, 1.3);
  const squish = f === 0 ? 0 : 1;
  px(cx - 6, 4 + squish, 12, H - 6 - squish, C);
  px(cx - 7, 7 + squish, 14, H - 9 - squish, C);
  px(cx - 5, 5 + squish, 3, 2, L);                              // parlama
  px(cx - 7, H - 4, 14, 2, D);
  px(cx - 3, 8 + squish, 2, 2, EYE); px(cx + 1, 8 + squish, 2, 2, EYE);
}
function drawFlying(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.72);
  const wing = f === 0 ? 0 : -2;
  px(cx - 8, 6 + wing, 5, 3, D); px(cx + 3, 6 + wing, 5, 3, D); // kanatlar
  px(cx - 4, 3, 8, 8, C);                                       // gövde
  px(cx - 2, 5, 2, 2, EYE); px(cx + 1, 5, 2, 2, EYE);
  px(cx - 3, 11, 2, 3, C); px(cx + 1, 11, 2, 2, C);             // hayalet kuyruk saçağı
}
function drawSerpent(px: Px, f: number, C: string, W: number, H: number): void {
  const D = shade(C, 0.72), s = f === 0 ? 0 : 1;
  px(2, H - 5, W - 8, 3, C); px(4 + s, H - 8, W - 12, 3, C);    // kıvrım
  px(W - 8, H - 13, 6, 7, C);                                   // dik baş
  px(W - 6, H - 11, 2, 2, EYE);
  px(W - 9, H - 6, 2, 1, D); px(2, H - 3, W - 8, 1, D);
}
function drawBoss(px: Px, f: number, C: string, W: number, H: number): void {
  const cx = W >> 1, D = shade(C, 0.7), L = shade(C, 1.3);
  px(cx - 7, 0, 14, 3, C); px(cx - 9, 2, 18, 8, C);             // dev kafa
  px(cx - 9, 0, 3, 4, L); px(cx + 6, 0, 3, 4, L);               // boynuz
  px(cx - 5, 4, 3, 3, EYE); px(cx + 2, 4, 3, 3, EYE);
  px(cx - 2, 8, 4, 1, '#ffffff');                               // diş
  px(cx - 8, 10, 16, H - 16, C); px(cx - 8, 10, 2, H - 16, D); px(cx + 6, 10, 2, H - 16, D);
  px(cx - 11, 11, 3, 5, C); px(cx + 8, 11, 3, 5, C);            // pençe kollar
  if (f === 0) { px(cx - 5, H - 6, 4, 6, D); px(cx + 1, H - 6, 4, 6, D); }
  else { px(cx - 5, H - 6, 4, 5, D); px(cx + 1, H - 7, 4, 7, D); }
}

const DRAW: Record<PlanKey, (px: Px, f: number, C: string, W: number, H: number) => void> = {
  biped: drawBiped, beast: drawBeast, blob: drawBlob, flying: drawFlying, serpent: drawSerpent, boss: drawBoss,
};
/** Plan → taban boyut (small overworld / big battle ×~2). */
const SIZE: Record<PlanKey, [number, number]> = {
  biped: [14, 18], beast: [18, 14], blob: [16, 15], flying: [18, 15], serpent: [18, 15], boss: [26, 26],
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
