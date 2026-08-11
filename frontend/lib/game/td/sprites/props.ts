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

/** lodge: ahşap kütük duvar + beşik çatı (üçgen alınlık) + taş baca. H-wallH SABİT 22px. */
function drawLodge(px: Px, W: number, H: number, wallH: number, accent: string) {
  px(2, H - wallH, W - 4, wallH - 2, '#8a6845');
  for (let i = 0; i < wallH - 2; i += 4) {
    px(2, H - wallH + i, W - 4, 3, (i / 4) % 2 === 0 ? '#96734e' : '#7a5c3c'); // kütük sırası
    px(2, H - wallH + i + 3, W - 4, 1, '#5c4530');                              // kütük derzi
  }
  // Çatı: kiremit sıraları + tepede accent mahya bandı. (Önceki hâlde `r % 4 === 0`
  // accent veriyordu → çatı boydan boya zebra çizgiliydi; accent artık TEK bantta.)
  const roofH = 16;
  for (let r = 0; r < roofH; r++) {
    const inset = Math.max(0, Math.floor((roofH - r) * 0.45));
    const col = r < 2 ? SNOW : r < 4 ? accent : (r % 3 === 0 ? '#54391f' : '#6b4c31');
    px(inset, H - wallH - roofH + r, W - inset * 2, 1, col);
  }
  px(0, H - wallH - 2, W, 3, '#3d3126'); // üçgen alınlık gölgesi/saçak
  px(5, H - wallH - roofH - 6, 5, 8, '#7a7167'); px(5, H - wallH - roofH - 6, 5, 2, '#948b81'); // taş baca
  px(6, H - wallH - roofH - 10, 2, 3, 'rgba(220,225,230,.5)'); // baca dumanı
}

/** stone: kaydırmalı derz taş blok duvar + kemerli kapı + koyu arduvaz kırma çatı. */
function drawStone(px: Px, W: number, H: number, wallH: number, accent: string) {
  const rowH = 4;
  for (let ry = 0, row = 0; ry < wallH - 2; ry += rowH, row++) {
    px(2, H - wallH + ry, W - 4, rowH - 1, row % 2 ? '#9a9188' : '#8a8177');
    const off = (row % 2) * 4;
    for (let bx = 2 - off; bx < W - 2; bx += 8) {
      const x = Math.max(2, bx), w = Math.min(1, W - 2 - x);
      if (w > 0) px(x, H - wallH + ry, w, rowH - 1, '#6c6258'); // derz kaydırma çizgisi
    }
  }
  const dw = 10, dx0 = (W - dw) >> 1; // kemerli kapı bandı (accent)
  px(dx0 - 2, H - 17, dw + 4, 3, accent);
  px(dx0 - 3, H - 15, dw + 6, 1, '#3a2a1c');
  const roofH = 12;
  for (let r = 0; r < roofH; r++) {
    const inset = Math.max(0, Math.floor((roofH - r) * 0.6));
    px(inset, H - wallH - roofH + r, W - inset * 2, 1, r < 2 ? '#c7d6dc' : '#3a4148');
  }
  px(0, H - wallH - 2, W, 3, '#242a30');
}

/** plaster: açık sıva + koyu ahşap yarım-kirişleme (half-timber) + kapı üstü accent tente. */
function drawPlaster(px: Px, W: number, H: number, wallH: number, accent: string) {
  px(2, H - wallH, W - 4, wallH - 2, '#e8ddc8');
  px(2, H - wallH, 3, wallH - 2, '#4a3420'); px(W - 5, H - wallH, 3, wallH - 2, '#4a3420'); // dış dikmeler
  const midX = (W >> 1) - 1;
  px(midX, H - wallH, 2, wallH - 2, '#4a3420');                                             // orta dikme
  const midY = H - wallH + Math.floor((wallH - 2) / 2);
  px(2, midY, W - 4, 2, '#4a3420');                                                          // yatay orta kiriş
  xBrace(px, 5, H - wallH + 2, midX - 2, midY - 1, '#4a3420');
  xBrace(px, midX + 3, H - wallH + 2, W - 8, midY - 1, '#4a3420');
  const dw = 10, dx0 = (W - dw) >> 1; // tente
  px(dx0 - 4, H - 19, dw + 8, 4, accent);
  px(dx0 - 4, H - 19, dw + 8, 1, '#ffffff40');
  px(dx0 - 5, H - 15, 1, 3, '#3a2a1c'); px(dx0 + dw + 4, H - 15, 1, 3, '#3a2a1c'); // tente direkleri
  const roofH = 14;
  for (let r = 0; r < roofH; r++) {
    const inset = Math.max(0, Math.floor((roofH - r) * 0.45));
    px(inset, H - wallH - roofH + r, W - inset * 2, 1, r < 3 ? SNOW : '#6b4c31');
  }
  px(0, H - wallH - 2, W, 3, '#3d3126');
}

/** tower: dar/yüksek taş kule + sivri konik çatı + tepede accent flama. Yalnız dar (≤3 tile) bina. */
function drawTower(px: Px, W: number, H: number, wallH: number, accent: string) {
  px(2, H - wallH, W - 4, wallH - 2, '#8b95a0');
  for (let i = 1; i < wallH - 2; i += 6) px(2, H - wallH + i, W - 4, 1, 'rgba(20,26,32,.18)');
  // 🔴 Konik çatı TEPEDE dar, SAÇAKTA geniş olmalı. Önceki hâlde çarpan `(roofH-r)/roofH`
  // idi → r=0'da en geniş, aşağı daralan TERS üçgen ("örs" artefaktı). Doğrusu `(r+1)/roofH`.
  const roofH = 14, apex = W >> 1;
  for (let r = 0; r < roofH; r++) {
    const half = Math.max(1, Math.round(((r + 1) / roofH) * (W / 2)));
    // Sol yüz aydınlık, sağ yüz gölgede: düz siyah kütle yerine hacim okunsun.
    px(apex - half, H - wallH - roofH + r, half, 1, '#3d4550');
    px(apex, H - wallH - roofH + r, half, 1, '#2c3238');
    if (r % 4 === 1) px(apex - half, H - wallH - roofH + r, half * 2, 1, '#232930'); // kiremit sırası
  }
  px(apex - 2, H - wallH - roofH, 4, 2, '#c7d6dc');        // tepede kar tıkacı
  px(0, H - wallH - 2, W, 3, '#242a30');
  px(apex, H - wallH - roofH - 5, 1, 5, '#3a3a3a');        // flama direği
  px(apex + 1, H - wallH - roofH - 8, 5, 3, accent);       // flama (direkten yana dalgalanır)
  px(apex + 1, H - wallH - roofH - 8, 5, 1, '#ffffff55');
}

/**
 * Ortak yükseltmeler: temel taşı sırası + kapı önü basamak, haç-çerçeveli sıcak pencereler,
 * saçakta kar/sarkıt buz, demir askıdan sarkan tabela (emoji). Tüm stillerde AYNI.
 */
function drawBuildingCommon(px: Px, g: CanvasRenderingContext2D, W: number, H: number, wallH: number, icon: string) {
  // temel taşı sırası
  px(1, H - 2, W - 2, 2, '#4a4038'); px(1, H - 2, W - 2, 1, '#5c5148');
  // kapı önü basamaklar (kapı alt-orta)
  const dw = 10, dx0 = (W - dw) >> 1;
  px(dx0 - 2, H - 1, dw + 4, 1, '#7c7068'); px(dx0 - 1, H - 2, dw + 2, 1, '#8c8078');
  // kapı
  px(dx0, H - 14, dw, 14, '#3a2a1c'); px(dx0 + 1, H - 13, dw - 2, 13, '#2c2016');
  px(dx0 + dw - 3, H - 8, 2, 2, '#e8b23f'); // tokmak
  // pencereler: haç çerçeve + sıcak ışık parıltısı
  const winY = H - wallH + 5;
  const drawWindow = (wx: number) => {
    px(wx, winY, 8, 8, '#ffd98a'); px(wx, winY, 8, 8, 'rgba(255,170,70,.28)');
    px(wx + 3, winY, 2, 8, '#3a2a1c'); px(wx, winY + 3, 8, 2, '#3a2a1c');
    px(wx - 1, winY - 1, 10, 1, '#3a2a1c'); px(wx - 1, winY + 8, 10, 1, '#3a2a1c');
  };
  drawWindow(5); drawWindow(W - 13);
  // Kar: taban köşelerinde YIĞIN değil, temele yaslanan ince eğimli birikinti.
  // (Önceki 6×3 opak bloklar duvardan kopuk "beyaz tuğla" gibi duruyordu.)
  px(1, H - 3, 5, 1, '#dfeaee'); px(1, H - 2, 7, 1, '#eef6f8');
  px(W - 6, H - 3, 5, 1, '#dfeaee'); px(W - 8, H - 2, 7, 1, '#eef6f8');
  // Saçak karı: opak beyaz slab yerine ince çizgi + altında gölge → hacim okunur.
  const eaveY = H - wallH - 2;
  px(0, eaveY, W, 1, '#f2fbff'); px(0, eaveY + 1, W, 1, 'rgba(160,190,205,.55)');
  const nIce = Math.max(2, Math.floor(W / 16));
  for (let i = 0; i < nIce; i++) {
    const ix = 6 + i * Math.floor((W - 12) / nIce);
    px(ix, eaveY + 2, 1, 3, '#dff3fb'); px(ix, eaveY + 2, 1, 1, '#ffffff');
  }
  // demir askıdan sarkan tabela (emoji levha)
  const signCx = W >> 1;
  px(signCx - 6, H - wallH - 17, 12, 2, '#2a2a2a');           // askı kolu
  px(signCx - 1, H - wallH - 17, 1, 4, '#2a2a2a');            // zincir
  g.font = '9px serif'; g.textAlign = 'center';
  g.fillStyle = '#caa06a'; g.fillRect(signCx - 7, H - wallH - 12, 14, 11);
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 1; g.strokeRect(signCx - 7, H - wallH - 12, 14, 11);
  g.fillText(icon, signCx, H - wallH - 3);
}

/** Hub binası — wTiles×hTiles, accent + id'den seçilen mimari stil, emoji tabela. Taban = alt kenar. */
export function mkBuilding(wTiles: number, hTiles: number, accent: string, icon: string, id = ''): { img: HTMLCanvasElement; ox: number; oy: number } {
  const W = wTiles * 16, H = hTiles * 16 + 14; // +14 çatı taşması — AYNEN korunur (yerleşim/solid buna bağlı)
  let style = styleForId(id);
  if (style === 'tower' && wTiles > 3) style = 'stone'; // tower yalnız dar binalarda (spec)
  const base = spr(W, H, (px, g) => {
    const wallH = hTiles * 16 - 8;
    if (style === 'lodge') drawLodge(px, W, H, wallH, accent);
    else if (style === 'stone') drawStone(px, W, H, wallH, accent);
    else if (style === 'plaster') drawPlaster(px, W, H, wallH, accent);
    else drawTower(px, W, H, wallH, accent);
    drawBuildingCommon(px, g, W, H, wallH, icon);
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
