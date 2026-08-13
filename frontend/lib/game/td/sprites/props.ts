// frontend/lib/game/td/sprites/props.ts
// ─── Prop sprite fabrikaları (client-only; SSR'da ÇAĞIRMA) ───
import { spr, outline, hashId, type Px } from './chibi';

const SNOW = '#eef6f8', TRUNK = '#5f4430';

/** Karlı çam — v: 0/1 küçük iki ton, 2/3 büyük iki ton. Çıktı meta: {img,ox,oy}. */
export function mkTree(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const big = v >= 2, tone = v % 2;
  const w = big ? 20 : 16, h = big ? 30 : 24, c0 = w >> 1;
  const G = tone ? ['#2b6e59', '#225746', '#3a8a70'] : ['#2f7a4c', '#265f3c', '#3f9660'];
  const layers: [number, number][] = big ? [[1, 6], [7, 8], [14, 10]] : [[1, 5], [6, 6], [11, 8]];
  const img = outline(spr(w, h, (px) => {
    px(c0 - 1, h - 6, 2, 6, TRUNK);
    for (const [cy, half] of layers) {
      for (let r = 0; r < half; r++) px(c0 - (r + 1), cy + r, (r + 1) * 2, 1, G[0]);
      px(c0 - half, cy + half - 1, half * 2, 1, G[1]);
      px(c0 - 2, cy + 2, 2, 1, G[2]);
      px(c0 - 1, cy, 2, 1, SNOW);
      px(c0 - half + 1, cy + half - 1, 3, 1, SNOW);
      px(c0 + half - 4, cy + half - 1, 3, 1, SNOW);
    }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

export function mkRock(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const ore = v === 1;
  const img = outline(spr(14, 11, (px) => {
    px(2, 4, 10, 6, '#8b95a0'); px(4, 2, 7, 3, '#8b95a0'); px(3, 3, 3, 2, '#a5aeb8');
    px(2, 8, 10, 2, '#6c7681'); px(10, 3, 2, 2, '#6c7681'); px(4, 1, 5, 1, SNOW);
    if (ore) { px(6, 5, 2, 1, '#e8b23f'); px(9, 7, 1, 1, '#e8b23f'); px(4, 7, 1, 1, '#e8b23f'); }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

export function mkBush(v: number): { img: HTMLCanvasElement; ox: number; oy: number } {
  const berry = v === 1;
  const img = outline(spr(26, 16, (px) => {
    px(6, 2, 14, 4, '#3f8a56'); px(4, 4, 18, 8, '#3f8a56'); px(2, 7, 22, 6, '#3f8a56');
    px(2, 11, 22, 3, '#2f6a44'); px(6, 3, 8, 2, '#5aa06a'); px(4, 6, 4, 2, '#5aa06a');
    px(8, 1, 6, 1, SNOW); px(16, 4, 4, 1, SNOW); px(3, 8, 3, 1, SNOW);
    if (berry) for (const [bx, by] of [[6, 6], [12, 8], [18, 5], [9, 11], [16, 10]] as const) {
      px(bx, by, 3, 3, '#e84142'); px(bx, by, 1, 1, '#ffd0c8');
    }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

/** Kesilmiş ağaç kütüğü — ağaç toplandıktan sonra texture swap hedefi. 12×8. */
export function mkStump(): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(12, 8, (px) => {
    px(1, 3, 10, 5, '#7a5a3e');
    px(2, 2, 8, 2, '#8f6c4a');
    px(3, 2, 3, 1, '#a5805c');
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

/** Tarla parseli — stage 0 boş toprak, 1 filiz, 2 yeşil demet, 3 olgun (kırmızı frostberry noktaları). 16×14. */
export function mkFarmPlot(stage: 0 | 1 | 2 | 3): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(16, 14, (px) => {
    px(1, 5, 14, 8, '#5a4028'); px(1, 5, 14, 2, '#6b4c31');
    for (const [rx, ry] of [[3, 6], [7, 6], [11, 6], [3, 10], [7, 10], [11, 10]] as const) px(rx, ry, 2, 1, '#4a3420');
    if (stage === 1) {
      for (const [sx, sy] of [[3, 4], [7, 4], [11, 4]] as const) { px(sx, sy, 1, 3, '#4a7a3a'); px(sx - 1, sy, 3, 1, '#5aa06a'); }
    } else if (stage === 2) {
      for (const [sx, sy] of [[3, 2], [7, 2], [11, 2]] as const) {
        px(sx - 1, sy, 3, 5, '#3f8a56'); px(sx - 1, sy, 3, 2, '#5aa06a');
      }
    } else if (stage === 3) {
      for (const [sx, sy] of [[3, 2], [7, 2], [11, 2]] as const) {
        px(sx - 1, sy, 3, 5, '#2f6a44'); px(sx - 1, sy, 3, 2, '#3f8a56');
        px(sx, sy + 1, 1, 1, '#e84142'); px(sx + 1, sy + 3, 1, 1, '#e84142');
      }
    }
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

/** 4-karelik kamp ateşi. */
export function mkFireFrames(): HTMLCanvasElement[] {
  return [0, 1, 2, 3].map(f => outline(spr(14, 12, (px) => {
    px(2, 9, 10, 2, '#5a4028'); px(3, 8, 3, 2, '#6b4c31'); px(8, 8, 3, 2, '#6b4c31');
    const F1 = '#ff9d3f', F2 = '#ffd23f';
    if (f === 0) { px(5, 3, 4, 6, F1); px(6, 1, 2, 4, F2); px(4, 6, 6, 3, F1); }
    else if (f === 1) { px(4, 4, 6, 5, F1); px(5, 2, 3, 4, F2); px(8, 3, 2, 3, F2); }
    else if (f === 2) { px(5, 2, 4, 7, F1); px(6, 0, 2, 4, F2); px(4, 5, 2, 4, F1); }
    else { px(4, 3, 6, 6, F1); px(6, 2, 2, 3, F2); px(9, 4, 1, 4, F1); px(3, 6, 2, 3, F1); }
  })));
}

// ── Faz "ev stilleri": 4 mimari stil, bina id'sinden deterministik seçilir ──
type BuildingStyle = 'lodge' | 'stone' | 'plaster' | 'tower';

/** id → stil eşlemesi (hub binaları). Bilinmeyen id → hash fallback (styleForId). */
const BUILDING_STYLE: Record<string, BuildingStyle> = {
  arena: 'stone', swap: 'stone',                              // resmi/sağlam yapılar
  cardgame: 'plaster', marketplace: 'plaster', nftscore: 'plaster', // çarşı hissi
  expeditions: 'lodge', adventures: 'lodge',                  // vahşi doğa/macera
  battleroyale: 'tower', launchpad: 'tower',                  // taçlı/fırlatma → sivri kule
  // Faz 11.1: iç mekânlı evler (worldProps.TD_HOUSES) — han sıcak kütük, arşiv resmi taş
  inn: 'lodge', archive: 'stone',
};
const STYLE_ORDER: BuildingStyle[] = ['lodge', 'stone', 'plaster', 'tower'];
function styleForId(id: string): BuildingStyle {
  return BUILDING_STYLE[id] ?? STYLE_ORDER[hashId(id || 'x') % STYLE_ORDER.length];
}

/** X-kiriş (half-timber çapraz) — stepped-diagonal, px-rect'e sadık kalır. */
function xBrace(px: Px, x0: number, y0: number, x1: number, y1: number, color: string) {
  const w = x1 - x0, h = y1 - y0, steps = Math.max(Math.abs(w), Math.abs(h), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    px(Math.round(x0 + t * w), Math.round(y0 + t * h), 1, 1, color);
    px(Math.round(x1 - t * w), Math.round(y0 + t * h), 1, 1, color);
  }
}

/** Tek çapraz kiriş (xBrace'in yarısı) — Faz 11.5 plaster varyant B + kılıç arması. */
function diagBrace(px: Px, x0: number, y0: number, x1: number, y1: number, color: string) {
  const w = x1 - x0, h = y1 - y0, steps = Math.max(Math.abs(w), Math.abs(h), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    px(Math.round(x0 + t * w), Math.round(y0 + t * h), 1, 1, color);
  }
}

// NOT (Faz 11.5): H = hTiles*16+26, wallH = hTiles*16-8 → duvar üstü boşluk H-wallH = 34px
// SABİT (hTiles'tan bağımsız). Aşağıdaki tüm çatı/baca/flama matematiği bu 34px paya güvenir.

/** lodge: ahşap kütük duvar + beşik çatı + TAM görünür taş baca (yönü per-id) + dormer (w≥4). */
function drawLodge(px: Px, W: number, H: number, wallH: number, accent: string, id: string) {
  const hv = hashId(id || 'lodge');
  const wallTop = H - wallH;
  px(2, wallTop, W - 4, wallH - 2, '#8a6845');
  for (let i = 0; i < wallH - 2; i += 4) {
    px(2, wallTop + i, W - 4, 3, (i / 4) % 2 === 0 ? '#96734e' : '#7a5c3c'); // kütük sırası
    px(2, wallTop + i + 3, W - 4, 1, '#5c4530');                              // kütük derzi
    // Faz 11.5: kütük uçları — köşelerde açık kesit noktaları
    px(2, wallTop + i + 1, 2, 2, '#b08a5e'); px(W - 4, wallTop + i + 1, 2, 2, '#b08a5e');
  }
  // Faz 11.5: accent kapı çerçevesi (kapı drawBuildingCommon'da üstüne çizilir → 2px çerçeve kalır)
  const dw = 10, dx0 = (W - dw) >> 1;
  px(dx0 - 2, H - 16, dw + 4, 16, accent);
  // Çatı: kiremit sıraları + tepede accent mahya bandı. (Önceki hâlde `r % 4 === 0`
  // accent veriyordu → çatı boydan boya zebra çizgiliydi; accent artık TEK bantta.)
  const roofH = 16, roofTop = wallTop - roofH;
  for (let r = 0; r < roofH; r++) {
    const inset = Math.max(0, Math.floor((roofH - r) * 0.45));
    const col = r < 2 ? SNOW : r < 4 ? accent : (r % 3 === 0 ? '#54391f' : '#6b4c31');
    px(inset, roofTop + r, W - inset * 2, 1, col);
  }
  px(0, wallTop - 2, W, 3, '#3d3126'); // üçgen alınlık gölgesi/saçak
  // Faz 11.5: baca artık TAM görünür (+26 pay; eski +14'te canvas dışına kırpılıyordu),
  // yönü per-id, tepesinde şapka + kar, üstünde 3 duman lülesi.
  const chX = hv % 2 === 0 ? 5 : W - 10;
  px(chX, roofTop - 8, 5, 12, '#7a7167'); px(chX, roofTop - 8, 5, 2, '#948b81');
  px(chX - 1, roofTop - 10, 7, 2, '#948b81');                   // şapka
  px(chX - 1, roofTop - 11, 5, 1, SNOW);                        // şapka karı
  px(chX + 2, roofTop - 13, 2, 2, 'rgba(225,230,235,.6)');      // duman lüleleri (yükseldikçe soluk)
  px(chX + (hv % 2 === 0 ? 4 : 0), roofTop - 16, 2, 2, 'rgba(225,230,235,.42)');
  px(chX + 2, roofTop - 18, 2, 2, 'rgba(225,230,235,.26)');
  // Faz 11.5: geniş lodge'da (w≥4 tile) çatı penceresi (dormer) — bacanın karşı yakası
  if (W >= 64) {
    const dxr = hv % 2 === 0 ? W - 24 : 12;
    px(dxr - 1, roofTop + 5, 12, 2, SNOW);                      // dormer mini çatısı
    px(dxr - 1, roofTop + 7, 12, 1, '#54391f');
    px(dxr, roofTop + 8, 10, 7, '#8a6845');                     // dormer gövdesi
    px(dxr + 3, roofTop + 9, 4, 5, '#ffd98a');                  // sıcak pencere
    px(dxr + 3, roofTop + 9, 4, 5, 'rgba(255,170,70,.28)');
    px(dxr + 2, roofTop + 9, 1, 5, '#3a2a1c'); px(dxr + 7, roofTop + 9, 1, 5, '#3a2a1c');
  }
  // Faz 11.5: han (inn) — kapı iki yanında sıcak fener + ışık halesi
  if (id === 'inn') {
    for (const lx of [dx0 - 6, dx0 + dw + 4]) {
      px(lx - 1, H - 13, 5, 6, 'rgba(255,217,138,.22)');        // hale
      px(lx, H - 13, 3, 1, '#3a3a3a');                          // fener başlığı
      px(lx, H - 12, 3, 3, '#ffd98a'); px(lx + 1, H - 11, 1, 1, '#fff3c8'); // cam + alev
      px(lx + 1, H - 9, 1, 2, '#3a3a3a');                       // alt askı
    }
  }
}

/** stone: taş blok duvar + köşe taşları (quoins) + kemerli kapı + sancak şeritleri.
 * 'arena' → mazgallı parapet (kale), 'archive' → kapı üstü parşömen rulosu. */
function drawStone(px: Px, W: number, H: number, wallH: number, accent: string, id: string) {
  const wallTop = H - wallH;
  const rowH = 4;
  for (let ry = 0, row = 0; ry < wallH - 2; ry += rowH, row++) {
    px(2, wallTop + ry, W - 4, rowH - 1, row % 2 ? '#9a9188' : '#8a8177');
    const off = (row % 2) * 4;
    for (let bx = 2 - off; bx < W - 2; bx += 8) {
      const x = Math.max(2, bx), w = Math.min(1, W - 2 - x);
      if (w > 0) px(x, wallTop + ry, w, rowH - 1, '#6c6258'); // derz kaydırma çizgisi
    }
    // Faz 11.5: quoins — köşelerde sırayla geniş/dar açık taş bloklar
    const qw = row % 2 ? 5 : 3;
    px(2, wallTop + ry, qw, rowH - 1, '#b0a79c'); px(W - 2 - qw, wallTop + ry, qw, rowH - 1, '#b0a79c');
  }
  const dw = 10, dx0 = (W - dw) >> 1; // kemerli kapı bandı (accent)
  px(dx0 - 2, H - 17, dw + 4, 3, accent);
  px(dx0 - 3, H - 15, dw + 6, 1, '#3a2a1c');
  // Faz 11.5: kapı yanı çift accent sancak şeridi (yarım kırlangıç kuyruklu)
  for (const sx of [dx0 - 6, dx0 + dw + 4]) {
    px(sx, H - 26, 2, 10, accent);
    px(sx, H - 26, 2, 1, '#ffffff55');
    px(sx, H - 16, 1, 2, accent);
  }
  // Faz 11.5: archive — kapı üstü parşömen rulosu motifi
  if (id === 'archive') {
    px(dx0 + 1, H - 22, dw - 2, 3, '#e8dcc0');
    px(dx0, H - 23, 2, 5, '#cfc0a0'); px(dx0 + dw - 2, H - 23, 2, 5, '#cfc0a0');
    px(dx0 + 3, H - 21, dw - 6, 1, '#8a7a5c');                  // yazı çiziği
  }
  if (id === 'arena') {
    // Faz 11.5: ARENA — çatı yerine mazgallı parapet (crenellation), kale hissi
    px(2, wallTop - 6, W - 4, 6, '#8a8177'); px(2, wallTop - 6, W - 4, 1, '#9a9188');
    for (let bx = 2; bx < W - 2; bx += 9) {
      const bw = Math.min(5, W - 2 - bx);
      px(bx, wallTop - 11, bw, 6, '#9a9188');
      px(bx, wallTop - 11, 1, 6, '#b0a79c');
      px(bx, wallTop - 12, bw, 1, SNOW);
    }
    px(0, wallTop - 2, W, 3, '#242a30');
  } else {
    const roofH = 12, roofTop = wallTop - roofH;
    for (let r = 0; r < roofH; r++) {
      const inset = Math.max(0, Math.floor((roofH - r) * 0.6));
      px(inset, roofTop + r, W - inset * 2, 1, r < 2 ? '#c7d6dc' : '#3a4148');
    }
    px(0, wallTop - 2, W, 3, '#242a30');
  }
}

/** plaster: açık sıva + yarım-kirişleme (per-id 2 varyant: X / paralel çapraz) + çizgili kapı tentesi. */
function drawPlaster(px: Px, W: number, H: number, wallH: number, accent: string, id: string) {
  const hv = hashId(id || 'plaster');
  const wallTop = H - wallH;
  px(2, wallTop, W - 4, wallH - 2, '#e8ddc8');
  px(2, wallTop, 3, wallH - 2, '#4a3420'); px(W - 5, wallTop, 3, wallH - 2, '#4a3420'); // dış dikmeler
  const midX = (W >> 1) - 1;
  px(midX, wallTop, 2, wallH - 2, '#4a3420');                                             // orta dikme
  const midY = wallTop + Math.floor((wallH - 2) / 2);
  px(2, midY, W - 4, 2, '#4a3420');                                                        // yatay orta kiriş
  if (hv % 2 === 0) {                                            // varyant A: X-kirişler
    xBrace(px, 5, wallTop + 2, midX - 2, midY - 1, '#4a3420');
    xBrace(px, midX + 3, wallTop + 2, W - 8, midY - 1, '#4a3420');
  } else {                                                       // varyant B: paralel çaprazlar (//)
    diagBrace(px, 5, midY - 1, midX - 2, wallTop + 2, '#4a3420');
    diagBrace(px, midX + 3, midY - 1, W - 8, wallTop + 2, '#4a3420');
  }
  const dw = 10, dx0 = (W - dw) >> 1; // kapı tentesi — Faz 11.5: accent + beyaz çizgili
  px(dx0 - 4, H - 19, dw + 8, 4, accent);
  for (let sx = dx0 - 4; sx < dx0 + dw + 4; sx += 4) px(sx, H - 19, 2, 4, '#f2ede2');
  px(dx0 - 4, H - 19, dw + 8, 1, '#ffffff40');
  px(dx0 - 5, H - 15, 1, 3, '#3a2a1c'); px(dx0 + dw + 4, H - 15, 1, 3, '#3a2a1c'); // tente direkleri
  const roofH = 14, roofTop = wallTop - roofH;
  for (let r = 0; r < roofH; r++) {
    const inset = Math.max(0, Math.floor((roofH - r) * 0.45));
    px(inset, roofTop + r, W - inset * 2, 1, r < 3 ? SNOW : '#6b4c31');
  }
  px(0, wallTop - 2, W, 3, '#3d3126');
}

/** tower: dar/yüksek taş kule + UZUN sivri çatı + büyük flama (yönü per-id). Yalnız dar (≤3 tile).
 * 'launchpad' → tepe anten/roket ucu, 'battleroyale' → duvarda çapraz kılıç arması. */
function drawTower(px: Px, W: number, H: number, wallH: number, accent: string, id: string) {
  const hv = hashId(id || 'tower');
  const wallTop = H - wallH;
  px(2, wallTop, W - 4, wallH - 2, '#8b95a0');
  for (let i = 1; i < wallH - 2; i += 6) px(2, wallTop + i, W - 4, 1, 'rgba(20,26,32,.18)');
  px(2, wallTop, 2, wallH - 2, '#9aa4ae'); px(W - 4, wallTop, 2, wallH - 2, '#77818c'); // köşe bantları
  // 🔴 Konik çatı TEPEDE dar, SAÇAKTA geniş olmalı. Önceki hâlde çarpan `(roofH-r)/roofH`
  // idi → r=0'da en geniş, aşağı daralan TERS üçgen ("örs" artefaktı). Doğrusu `(r+1)/roofH`.
  // Faz 11.5: roofH 14→20 (+26 payı) — kule silüeti belirgin sivrildi.
  const roofH = 20, apex = W >> 1, roofTop = wallTop - roofH;
  for (let r = 0; r < roofH; r++) {
    const half = Math.max(1, Math.round(((r + 1) / roofH) * (W / 2)));
    // Sol yüz aydınlık, sağ yüz gölgede: düz siyah kütle yerine hacim okunsun.
    px(apex - half, roofTop + r, half, 1, '#3d4550');
    px(apex, roofTop + r, half, 1, '#2c3238');
    if (r % 4 === 1) px(apex - half, roofTop + r, half * 2, 1, '#232930'); // kiremit sırası
  }
  px(apex - 2, roofTop, 4, 2, '#c7d6dc');        // tepede kar tıkacı
  px(0, wallTop - 2, W, 3, '#242a30');
  // Faz 11.5: flama büyüdü (8×4, kırlangıç kuyruk), yönü per-id
  const fdir = hv % 2 === 0 ? 1 : -1;
  px(apex, roofTop - 7, 1, 7, '#3a3a3a');        // flama direği
  const fx = fdir === 1 ? apex + 1 : apex - 8;
  px(fx, roofTop - 7, 8, 2, accent);
  px(fx + (fdir === 1 ? 0 : 3), roofTop - 5, 5, 2, accent);
  px(fx, roofTop - 7, 8, 1, '#ffffff55');
  if (id === 'launchpad') {                       // tepe anten + kızıl roket ucu
    px(apex, roofTop - 11, 1, 4, '#8a9098');
    px(apex - 1, roofTop - 13, 3, 2, '#e84142');
    px(apex, roofTop - 14, 1, 1, '#ffd23f');
  }
  if (id === 'battleroyale') {                    // çapraz kılıç arması (üst duvar merkezi)
    // Tur-1 ekran görüntüsü dersi: cy2 = H-24'te altın kabzalar sonra çizilen kapı
    // sundurmasının (drawBuildingCommon) altında kalıyordu → 3px yukarı alındı.
    const cx2 = W >> 1, cy2 = H - 27;
    diagBrace(px, cx2 - 4, cy2 - 4, cx2 + 4, cy2 + 4, '#c7d6dc');
    diagBrace(px, cx2 - 4, cy2 + 4, cx2 + 4, cy2 - 4, '#c7d6dc');
    px(cx2 - 6, cy2 + 4, 2, 2, '#e8b23f'); px(cx2 + 4, cy2 + 4, 2, 2, '#e8b23f'); // kabzalar
  }
}

/**
 * Ortak yükseltmeler: temel taşı sırası + kapı önü basamak, stil-duyarlı pencereler
 * (stone=kemer, plaster=tente+çiçek kutusu, tower=ok mazgalı; w≥5 tile'da 3. pencere),
 * kapı sundurması, saçakta kar/sarkıt buz, BÜYÜK accent-çerçeveli tabela (emoji).
 */
function drawBuildingCommon(px: Px, g: CanvasRenderingContext2D, W: number, H: number, wallH: number, icon: string, style: BuildingStyle, accent: string, wTiles: number) {
  const wallTop = H - wallH;
  // temel taşı sırası
  px(1, H - 2, W - 2, 2, '#4a4038'); px(1, H - 2, W - 2, 1, '#5c5148');
  // kapı önü basamaklar (kapı alt-orta)
  const dw = 10, dx0 = (W - dw) >> 1;
  px(dx0 - 2, H - 1, dw + 4, 1, '#7c7068'); px(dx0 - 1, H - 2, dw + 2, 1, '#8c8078');
  // kapı
  px(dx0, H - 14, dw, 14, '#3a2a1c'); px(dx0 + 1, H - 13, dw - 2, 13, '#2c2016');
  px(dx0 + dw - 3, H - 8, 2, 2, '#e8b23f'); // tokmak
  // Faz 11.5: kapı sundurması — 3px saçak + 2 destek pikseli (plaster hariç: kendi tentesi var)
  if (style !== 'plaster') {
    px(dx0 - 3, H - 21, dw + 6, 1, SNOW);
    px(dx0 - 3, H - 20, dw + 6, 2, '#54391f');
    px(dx0 - 3, H - 18, 1, 2, '#3a2a1c'); px(dx0 + dw + 2, H - 18, 1, 2, '#3a2a1c');
  }
  // pencereler: haç çerçeve + sıcak ışık parıltısı; Faz 11.5: stil süsleri + w≥5'te 3. pencere
  const winY = wallTop + 5;
  const wxs = [5, W - 13];
  if (wTiles >= 5) wxs.push((W >> 1) - 4);
  for (const wx of wxs) {
    if (style === 'tower') {
      // ok mazgalı: dar dikey yarık + taş lento
      px(wx + 2, winY - 2, 5, 1, '#77818c');
      px(wx + 3, winY - 1, 3, 10, '#1a2028');
      px(wx + 4, winY, 1, 8, '#ffd98a');
      px(wx + 2, winY + 9, 5, 1, '#77818c');
      continue;
    }
    px(wx, winY, 8, 8, '#ffd98a'); px(wx, winY, 8, 8, 'rgba(255,170,70,.28)');
    px(wx + 3, winY, 2, 8, '#3a2a1c'); px(wx, winY + 3, 8, 2, '#3a2a1c');
    px(wx - 1, winY - 1, 10, 1, '#3a2a1c'); px(wx - 1, winY + 8, 10, 1, '#3a2a1c');
    if (style === 'stone') {                       // kemerli pencere üstü + accent kilit taşı
      px(wx - 1, winY - 3, 10, 2, '#6c6258');
      px(wx + 1, winY - 4, 6, 1, '#6c6258');
      px(wx + 3, winY - 4, 2, 1, accent);
    } else if (style === 'plaster') {              // çizgili tente + çiçek kutusu
      px(wx - 2, winY - 5, 12, 3, accent);
      for (let sx = wx - 2; sx < wx + 10; sx += 4) px(sx, winY - 5, 2, 3, '#f2ede2');
      px(wx - 2, winY - 2, 12, 1, 'rgba(0,0,0,.2)');
      px(wx - 1, winY + 9, 10, 2, '#3f7a3f');
      px(wx - 1, winY + 9, 10, 1, '#4f9a4f');
      px(wx + 1, winY + 9, 1, 1, '#e84142'); px(wx + 4, winY + 9, 1, 1, '#e84142'); px(wx + 7, winY + 9, 1, 1, '#e84142');
    }
  }
  // Kar: taban köşelerinde YIĞIN değil, temele yaslanan ince eğimli birikinti.
  // (Önceki 6×3 opak bloklar duvardan kopuk "beyaz tuğla" gibi duruyordu.)
  px(1, H - 3, 5, 1, '#dfeaee'); px(1, H - 2, 7, 1, '#eef6f8');
  px(W - 6, H - 3, 5, 1, '#dfeaee'); px(W - 8, H - 2, 7, 1, '#eef6f8');
  // Saçak karı: opak beyaz slab yerine ince çizgi + altında gölge → hacim okunur.
  const eaveY = wallTop - 2;
  px(0, eaveY, W, 1, '#f2fbff'); px(0, eaveY + 1, W, 1, 'rgba(160,190,205,.55)');
  const nIce = Math.max(2, Math.floor(W / 16));
  for (let i = 0; i < nIce; i++) {
    const ix = 6 + i * Math.floor((W - 12) / nIce);
    px(ix, eaveY + 2, 1, 3, '#dff3fb'); px(ix, eaveY + 2, 1, 1, '#ffffff');
  }
  // Faz 11.5: BÜYÜK tabela — demir askı + accent çerçeve + ahşap zemin + 10px emoji
  const signCx = W >> 1;
  px(signCx - 8, wallTop - 20, 16, 2, '#2a2a2a');               // askı kolu
  px(signCx - 1, wallTop - 19, 1, 5, '#2a2a2a');                // zincir
  g.fillStyle = accent; g.fillRect(signCx - 8, wallTop - 15, 16, 13);   // accent çerçeve
  g.fillStyle = '#caa06a'; g.fillRect(signCx - 7, wallTop - 14, 14, 11); // ahşap zemin
  g.font = '10px serif'; g.textAlign = 'center';
  g.fillText(icon, signCx, wallTop - 4);
}

/** Hub binası — wTiles×hTiles, accent + id'den seçilen mimari stil, emoji tabela. Taban = alt kenar.
 * Faz 11.5: H payı +14 → +26 (baca/flama/duman/dormer sığar). Genişlik + taban çizgisi + kapı
 * konumu SÖZLEŞMEDİR (AYNEN); origin(0.5,1) olduğundan fazladan yükseklik yalnız YUKARI büyür. */
export function mkBuilding(wTiles: number, hTiles: number, accent: string, icon: string, id = ''): { img: HTMLCanvasElement; ox: number; oy: number } {
  const W = wTiles * 16, H = hTiles * 16 + 26;
  let style = styleForId(id);
  if (style === 'tower' && wTiles > 3) style = 'stone'; // tower yalnız dar binalarda (spec)
  const base = spr(W, H, (px, g) => {
    const wallH = hTiles * 16 - 8;
    if (style === 'lodge') drawLodge(px, W, H, wallH, accent, id);
    else if (style === 'stone') drawStone(px, W, H, wallH, accent, id);
    else if (style === 'plaster') drawPlaster(px, W, H, wallH, accent, id);
    else drawTower(px, W, H, wallH, accent, id);
    drawBuildingCommon(px, g, W, H, wallH, icon, style, accent, wTiles);
  });
  const img = outline(base);
  return { img, ox: img.width >> 1, oy: img.height - 2 };
}

/** Zindan kapısı — taş kemer + bölge-accent parıltı noktası. */
/** Faz 5.11: yol tabelası — ahşap direk + levha (metin sahnede Text olarak üstüne basılır). */
export function mkSignpost(): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(14, 16, (px) => {
    px(6, 3, 2, 13, '#6e4e30'); px(6, 3, 1, 13, '#54391f');      // direk
    px(1, 1, 12, 6, '#8a6a42'); px(1, 1, 12, 1, '#a5835a');      // levha + üst vurgusu
    px(1, 6, 12, 1, '#54391f');                                   // levha alt gölgesi
    px(2, 3, 10, 1, '#54391f'); px(2, 5, 8, 1, '#54391f');        // yazı çizikleri (dekoratif)
    px(2, 0, 4, 1, SNOW); px(9, 0, 3, 1, SNOW);                   // kar
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

/** Faz 5.6: kasaba portalı — taş kaide + camgöbeği ışıyan halka (2 kare: iç parıltı oynar). */
export function mkPortal(frame: 0 | 1 = 0): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(22, 26, (px) => {
    px(2, 22, 18, 4, '#6c7681'); px(4, 21, 14, 2, '#8b95a0');      // kaide
    px(4, 2, 14, 20, '#3a4e63');                                    // dış halka gövdesi
    px(6, 0, 10, 4, '#3a4e63');
    px(6, 4, 10, 17, '#0d1319');                                    // iç boşluk
    const g = frame === 0 ? '#57e8e0' : '#9ff5ef';
    px(7, 6, 8, 14, g === '#57e8e0' ? '#1e5e66' : '#27737d');       // girdap zemini
    px(8, 8 + frame, 3, 6, g); px(11, 12 - frame, 3, 5, g);         // girdap kolları
    px(9, 6, 2, 2, '#d8fffb'); px(12, 17, 2, 2, '#d8fffb');         // kıvılcımlar
    px(4, 2, 3, 2, SNOW); px(14, 0, 3, 2, SNOW);                    // kar
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

/** Faz 5.6: zindan cevher damarı — koyu kaya + parlak kristaller (SPACE ile kazılır). */
export function mkOreVein(): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(16, 12, (px) => {
    px(1, 4, 14, 8, '#454e58'); px(3, 2, 10, 4, '#454e58'); px(2, 3, 4, 2, '#59636e');
    px(1, 10, 14, 2, '#333b44');
    px(4, 5, 3, 3, '#e8b23f'); px(9, 7, 3, 2, '#e8b23f'); px(7, 3, 2, 2, '#ffd884');
    px(12, 4, 2, 2, '#e8b23f'); px(5, 9, 2, 1, '#ffd884');
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}

export function mkDungeonDoor(): { img: HTMLCanvasElement; ox: number; oy: number } {
  const img = outline(spr(28, 22, (px) => {
    px(2, 6, 24, 16, '#6c7681'); px(4, 2, 20, 6, '#6c7681'); px(6, 0, 16, 3, '#8b95a0');
    px(9, 8, 10, 14, '#1a2028'); px(10, 6, 8, 3, '#1a2028');
    px(4, 4, 4, 2, SNOW); px(20, 3, 4, 2, SNOW);
    px(13, 12, 2, 2, '#9fe8ff');
  }));
  return { img, ox: img.width >> 1, oy: img.height - 1 };
}
