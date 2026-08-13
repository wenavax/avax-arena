// frontend/lib/game/td/sprites/interiorProps.ts
// ─── Faz 11.1: iç mekân mobilya çizimleri (canvas 2D; SSR'da draw() ÇAĞIRMA) ───
// DECO_SPEC deseni: Record<FurnKind,…> — interiors.ts'in union'ına eklenen tip burada
// çizimsiz kalırsa DERLEME hatası olur, runtime'a sızamaz. Modülü import etmek güvenli
// (DOM'a modül seviyesinde dokunulmaz); draw() yalnız client'ta çağrılır.
// Sanat dili props.ts ile aynı: 16px taban, 2-3 ton + koyu kontur çizgisi.
import type { FurnKind } from '../interiors';

const LINE = '#243141';           // chibi.outline konturuyla aynı ton

type Ctx = CanvasRenderingContext2D;
export interface FurnSpec {
  w: number; h: number;           // çizim kutusu (px) — taban alanı FURN_SIZE×16 ile hizalı
  draw: (g: Ctx, x: number, y: number) => void;
}

function px(g: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  g.fillStyle = c; g.fillRect(x, y, w, h);
}
/** 1px kontur çerçevesi — outline() sahne dışı çizimde yok, elle basılır. */
function frame(g: Ctx, x: number, y: number, w: number, h: number): void {
  px(g, x, y, w, 1, LINE); px(g, x, y + h - 1, w, 1, LINE);
  px(g, x, y, 1, h, LINE); px(g, x + w - 1, y, 1, h, LINE);
}

export const INTERIOR_FURN_SPEC: Record<FurnKind, FurnSpec> = {
  bed: {
    w: 16, h: 32,
    draw: (g, x, y) => {
      px(g, x + 1, y + 1, 14, 30, '#6e4e30');                       // ahşap karyola
      px(g, x + 2, y + 3, 12, 26, '#d8cdb8');                       // şilte
      px(g, x + 3, y + 4, 10, 5, '#eef6f8');                        // yastık
      px(g, x + 2, y + 11, 12, 18, '#a63a3a');                      // battaniye
      px(g, x + 2, y + 11, 12, 2, '#c85454');                       // battaniye kıvrımı
      px(g, x + 2, y + 27, 12, 2, '#7e2c2c');                       // ayak ucu gölgesi
      frame(g, x + 1, y + 1, 14, 30);
    },
  },
  table: {
    w: 32, h: 16,
    draw: (g, x, y) => {
      px(g, x + 1, y + 2, 30, 10, '#8a6845');                       // tabla
      px(g, x + 2, y + 3, 28, 2, '#a5835a');                        // üst vurgusu
      px(g, x + 3, y + 12, 3, 3, '#5c4530'); px(g, x + 26, y + 12, 3, 3, '#5c4530'); // ayaklar
      frame(g, x + 1, y + 2, 30, 10);
    },
  },
  chair: {
    w: 16, h: 16,
    draw: (g, x, y) => {
      px(g, x + 4, y + 2, 8, 3, '#6e4e30');                         // sırtlık
      px(g, x + 4, y + 6, 8, 6, '#8a6845');                         // oturak
      px(g, x + 4, y + 12, 2, 3, '#5c4530'); px(g, x + 10, y + 12, 2, 3, '#5c4530');
      frame(g, x + 4, y + 6, 8, 6);
    },
  },
  rug: {
    w: 32, h: 32,
    draw: (g, x, y) => {
      px(g, x + 1, y + 2, 30, 28, '#7e2c2c');                       // dış bant
      px(g, x + 4, y + 5, 24, 22, '#a63a3a');                       // orta alan
      px(g, x + 7, y + 8, 18, 16, '#c85454');                       // iç alan
      px(g, x + 14, y + 14, 4, 4, '#e8b23f');                       // merkez motif
      px(g, x + 2, y + 3, 3, 1, '#e8b23f'); px(g, x + 27, y + 28, 3, 1, '#e8b23f'); // köşe nakışı
    },
  },
  shelf: {
    w: 16, h: 16,
    draw: (g, x, y) => {
      px(g, x + 1, y + 1, 14, 14, '#6e4e30');                       // gövde
      px(g, x + 2, y + 3, 12, 4, '#3a2a1c'); px(g, x + 2, y + 9, 12, 4, '#3a2a1c'); // raf gözleri
      // kitap sırtları (iki gözde farklı renk dizilimi)
      const spines = ['#a63a3a', '#3f6e8a', '#5aa06a', '#e8b23f', '#8a5aa0'];
      for (let i = 0; i < 5; i++) px(g, x + 3 + i * 2, y + 3, 2, 4, spines[i]);
      for (let i = 0; i < 4; i++) px(g, x + 4 + i * 2, y + 9, 2, 4, spines[(i + 2) % 5]);
      frame(g, x + 1, y + 1, 14, 14);
    },
  },
  hearth: {
    w: 32, h: 16,
    draw: (g, x, y) => {
      px(g, x + 1, y + 1, 30, 14, '#7a7167');                       // taş gövde
      px(g, x + 2, y + 2, 28, 2, '#948b81');                        // üst taş sırası
      px(g, x + 6, y + 5, 20, 9, '#1a1512');                        // ocak ağzı
      px(g, x + 10, y + 8, 12, 6, '#ff9d3f');                       // alev
      px(g, x + 13, y + 6, 6, 6, '#ffd23f');
      px(g, x + 15, y + 5, 2, 3, '#fff2c0');
      frame(g, x + 1, y + 1, 30, 14);
    },
  },
  counter: {
    w: 48, h: 16,
    draw: (g, x, y) => {
      px(g, x + 1, y + 1, 46, 5, '#a5835a');                        // tezgâh üstü
      px(g, x + 1, y + 6, 46, 9, '#6e4e30');                        // ön panel
      px(g, x + 1, y + 6, 46, 1, '#54391f');                        // kenar derzi
      for (const bx of [9, 24, 39] as const) px(g, x + bx, y + 8, 1, 6, '#54391f'); // panel çizgileri
      px(g, x + 6, y + 2, 4, 3, '#d8cdb8'); px(g, x + 7, y + 1, 2, 1, '#eef6f8');   // kupa
      frame(g, x + 1, y + 1, 46, 14);
    },
  },
  lectern: {
    w: 16, h: 16,
    draw: (g, x, y) => {
      px(g, x + 6, y + 8, 4, 7, '#6e4e30');                         // ayak
      px(g, x + 3, y + 4, 10, 5, '#8a6845');                        // eğik rahle tablası
      px(g, x + 4, y + 3, 8, 4, '#eef6f8');                         // açık kitap sayfaları
      px(g, x + 8, y + 3, 1, 4, '#8fa6bd');                         // sayfa ortası
      frame(g, x + 3, y + 4, 10, 5);
    },
  },
  plant: {
    w: 16, h: 16,
    draw: (g, x, y) => {
      px(g, x + 5, y + 10, 6, 5, '#a66a3a');                        // saksı
      px(g, x + 5, y + 10, 6, 1, '#c8854f');
      px(g, x + 6, y + 4, 4, 6, '#3f8a56');                         // gövde yaprakları
      px(g, x + 4, y + 6, 3, 3, '#5aa06a'); px(g, x + 9, y + 5, 3, 3, '#5aa06a');
      px(g, x + 7, y + 2, 2, 3, '#2f6a44');
      frame(g, x + 5, y + 10, 6, 5);
    },
  },
  crate: {
    w: 16, h: 16,
    draw: (g, x, y) => {
      px(g, x + 2, y + 3, 12, 12, '#8a6845');                       // gövde
      px(g, x + 2, y + 3, 12, 2, '#a5835a');                        // üst tahta
      px(g, x + 2, y + 8, 12, 1, '#54391f'); px(g, x + 7, y + 3, 1, 12, '#54391f'); // çapraz derz
      frame(g, x + 2, y + 3, 12, 12);
    },
  },
};
