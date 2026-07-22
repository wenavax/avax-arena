// frontend/lib/game/td/sprites/battleHero.ts
// ─── Detaylı savaş-boyu kahraman chibi'si (Faz 5.3 savaş görsel paketi) ───
// Overworld chibiHumanoid (14×20) savaş sahnesinde yetersiz kalıyordu; eski çözüm
// (Graphics vektör bloklar, ~125px) hem detaysız hem canavar pixel-art'ıyla uyumsuzdu.
// Bu fabrika 26×34 art-px (kontur DAHİL 28×36) çizer: sınıf teçhizatı (knight/mage/
// archer), yüz, kemer/atkı, silah; 2-kare idle nefes. Sahne P× (tam-sayı) ölçekler.
// Client-only: canvas kullanır — SSR'da ÇAĞIRMA (import güvenli).
import { spr, outline, type Px } from './chibi';

export const BATTLE_HERO_W = 28;  // kontur dahil çıktı boyutu
export const BATTLE_HERO_H = 36;

export interface BattleHeroOpts {
  cls: 'knight' | 'mage' | 'archer';
  skin: number;         // PlayerState.skinColor
  hair: number;         // PlayerState.hairColor
  body: number;         // sınıf ana rengi (TdBattleScene bodyColor haritası)
  weaponTint?: number;  // kuşanılan silah efekt rengi (flame/ice/shadow/steel); yoksa default çelik
}

function hex(n: number): string { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
function shade(n: number, f: number): string {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return hex((r << 16) | (g << 8) | b);
}

/** 2-kare (idle nefes) detaylı savaş kahramanı. Deterministik — aynı opts aynı çıktı. */
export function mkBattleHero(o: BattleHeroOpts): { frames: HTMLCanvasElement[] } {
  const W = 26, H = 34, cx = 13;
  const SKIN = hex(o.skin), SKIND = shade(o.skin, 0.8);
  const HAIR = hex(o.hair), HAIRD = shade(o.hair, 0.75);
  const BODY = hex(o.body), BODYD = shade(o.body, 0.7), BODYL = shade(o.body, 1.25);
  const LEG = '#2c3540', BOOT = '#1d242c', BELT = '#241d14', GOLD = '#e8b23f';
  const ACCENT = '#e84142', ACCENTD = '#b32f30'; // Frostbite atkısı
  const WPN = o.weaponTint !== undefined ? hex(o.weaponTint) : '#cdd6e0';
  const WPNL = o.weaponTint !== undefined ? shade(o.weaponTint, 1.35) : '#eef4fa';
  const WOOD = '#6e4e30', WOODD = '#54391f';

  const frames = [0, 1].map(f => {
    const b = f; // nefes: kafa/gövde 1px iner, silah 1px oynar
    const raw = spr(W, H, (px) => {
      // ── sınıf sırt teçhizatı (gövdenin ARKASINA çizilir) ──
      if (o.cls === 'knight') {
        // kalkan (sol kolda, hafif dışa taşar)
        px(cx - 12, 15 + b, 6, 9, BODYD); px(cx - 11, 16 + b, 4, 7, shade(o.body, 0.9));
        px(cx - 10, 18 + b, 2, 2, ACCENT);                       // amblem
        px(cx - 12, 15 + b, 6, 1, BODYL);                        // üst kenar vurgusu
      } else if (o.cls === 'archer') {
        // sadak (sırtta, sağ omuz üstü) + 3 ok ucu
        px(cx + 6, 8 + b, 4, 8, WOOD); px(cx + 6, 8 + b, 1, 8, WOODD);
        px(cx + 6, 6 + b, 1, 2, '#c8d2dc'); px(cx + 8, 6 + b, 1, 2, '#c8d2dc'); px(cx + 7, 5 + b, 1, 2, '#c8d2dc');
      }

      // ── bacaklar + botlar ──
      px(cx - 5, 25, 4, 6, LEG); px(cx + 1, 25, 4, 6, LEG);
      px(cx - 3, 25, 1, 6, shade(0x2c3540, 0.75)); px(cx + 3, 25, 1, 6, shade(0x2c3540, 0.75));
      px(cx - 6, 30, 5, 3, BOOT); px(cx + 1, 30, 5, 3, BOOT);
      px(cx - 6, 30, 5, 1, shade(0x1d242c, 1.5)); px(cx + 1, 30, 5, 1, shade(0x1d242c, 1.5));

      // ── gövde (tunik): 2-ton gölgeleme + kemer/toka ──
      px(cx - 6, 14 + b, 12, 11 - b, BODY);
      px(cx + 3, 14 + b, 3, 11 - b, BODYD);                      // sağ gölge kolonu
      px(cx - 6, 14 + b, 1, 11 - b, BODYL);                      // sol ışık şeridi
      px(cx - 6, 23, 12, 2, BELT); px(cx - 1, 23, 2, 2, GOLD);   // kemer + toka

      // ── atkı (Frostbite kimliği) ──
      px(cx - 6, 13 + b, 12, 2, ACCENT); px(cx - 6, 14 + b, 12, 1, ACCENTD);
      px(cx - 7, 15 + b, 2, 4, ACCENT); px(cx - 7, 18 + b, 2, 1, ACCENTD); // uçuşan uç

      // ── kollar: sol serbest (el skin), sağ silah tutar ──
      px(cx - 8, 15 + b, 2, 7, BODYD); px(cx - 8, 21 + b, 2, 2, SKIN);
      px(cx + 6, 15 + b, 2, 7, BODYD); px(cx + 6, 21 + b, 2, 2, SKIN);

      // ── kafa: saç + yüz ──
      px(cx - 6, 3 + b, 12, 10, SKIN);
      px(cx - 6, 11 + b, 12, 2, SKIND);                          // çene gölgesi
      px(cx - 6, 2 + b, 12, 3, HAIR); px(cx - 7, 4 + b, 2, 5, HAIR); px(cx + 5, 4 + b, 2, 5, HAIR);
      px(cx - 4, 5 + b, 2, 1, HAIRD); px(cx + 1, 5 + b, 3, 1, HAIRD); // perçem çentikleri
      px(cx - 3, 7 + b, 2, 2, '#243141'); px(cx + 2, 7 + b, 2, 2, '#243141'); // gözler
      px(cx - 3, 7 + b, 1, 1, '#ffffff'); px(cx + 2, 7 + b, 1, 1, '#ffffff'); // parlama
      px(cx - 5, 9 + b, 1, 1, '#e8a08a'); px(cx + 5, 9 + b, 1, 1, '#e8a08a'); // allık
      px(cx, 10 + b, 2, 1, SKIND);                               // ağız

      // ── sınıf başlık + silah (öne çizilir) ──
      if (o.cls === 'knight') {
        px(cx - 6, 1 + b, 12, 3, '#8fa6bd'); px(cx - 6, 1 + b, 12, 1, '#b9c9da'); // miğfer bandı
        px(cx - 1, 0 + b, 2, 2, ACCENT);                          // sorguç
        // kılıç: sağ elde dikey
        px(cx + 8, 20 + b, 2, 3, WOOD);                           // kabza
        px(cx + 6, 19 + b, 6, 1, GOLD);                           // siper
        px(cx + 8, 6 - b, 2, 13 + b, WPN); px(cx + 8, 6 - b, 1, 13 + b, WPNL); // namlu
        px(cx + 8, 4 - b, 2, 2, WPNL);                            // uç
      } else if (o.cls === 'mage') {
        px(cx - 7, 2 + b, 14, 2, BODYD);                          // şapka kenarı
        px(cx - 4, 0 + b, 8, 2, BODY); px(cx - 2, 0 + b, 3, 1, BODYL); // şapka gövdesi (alçak koni)
        px(cx + 4, 0 + b, 2, 2, GOLD);                            // yıldız
        // asa: sağ elde, tepede küre
        px(cx + 8, 8 - b, 2, 15 + b, WOOD); px(cx + 8, 8 - b, 1, 15 + b, WOODD);
        const ORB = o.weaponTint !== undefined ? WPN : '#7fd0ff';
        px(cx + 6, 5 - b, 5, 5, ORB); px(cx + 7, 6 - b, 2, 2, '#ffffff'); // küre + parlama
      } else {
        // archer: kapüşon saçın üstüne
        px(cx - 6, 1 + b, 12, 4, BODYD); px(cx - 6, 1 + b, 12, 1, BODY);
        px(cx - 7, 4 + b, 2, 3, BODYD); px(cx + 5, 4 + b, 2, 3, BODYD);
        // yay: sol yanda dikey kavis + kiriş
        px(cx - 11, 10 - b, 2, 2, WOOD); px(cx - 12, 12 - b, 2, 12, WOOD);
        px(cx - 11, 24 - b, 2, 2, WOOD);
        px(cx - 12, 12 - b, 1, 12, WOODD);
        px(cx - 9, 11 - b, 1, 14, '#c8d2dc');                     // kiriş
      }
    });
    return outline(raw);
  });
  return { frames };
}
