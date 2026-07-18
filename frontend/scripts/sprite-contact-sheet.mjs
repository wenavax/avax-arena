// frontend/scripts/sprite-contact-sheet.mjs
// Kullanım: node scripts/sprite-contact-sheet.mjs public/sprites/kenney-1bit.png 16 1 out.png
// (dosya, tileSize, spacing, çıktı). Çıktı: 4x nearest büyütme + 5'te bir kırmızı cetvel + kenarda indeksler.
//
// Not: çizim + dışa aktarma tek page.evaluate() içinde, img.onload'dan resolve olan
// bir Promise ile yapılıyor. setContent + window.__done polling + ayrı bir evaluate
// round-trip'i denendi ama headless Chromium'da güvenilmez çıktı: draw'lar %100
// senkron/doğru çalışıyor (getImageData ile doğrulandı) ama context'ler arası geçişte
// ~%80 ihtimalle boş/siyah canvas'a screenshot alınıyordu (compositor/karşılama
// race'i, rAF çift-bekleme de çözmedi). Tek evaluate + Promise deseni 5/5 tekrarlı
// testte deterministik doğru çıktı verdi — bu yüzden bu kalıp kullanılıyor.
import { chromium } from 'file:///Users/hts_bot/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const [src, tileArg, gapArg, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: node scripts/sprite-contact-sheet.mjs <png> <tileSize> <spacing> <out>');
  process.exit(1);
}
const TILE = Number(tileArg || 16), GAP = Number(gapArg || 0), SCALE = 4;
const b64 = readFileSync(resolve(src)).toString('base64');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(({ b64, TILE, GAP, SCALE }) => {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const step = TILE + GAP;
        const cols = Math.floor((img.width + GAP) / step);
        const rows = Math.floor((img.height + GAP) / step);
        const c = document.createElement('canvas');
        c.width = img.width * SCALE + 60;
        c.height = img.height * SCALE + 60;
        const x = c.getContext('2d');
        x.fillStyle = '#223'; x.fillRect(0, 0, c.width, c.height);
        x.imageSmoothingEnabled = false;
        x.drawImage(img, 60, 60, img.width * SCALE, img.height * SCALE);
        x.strokeStyle = 'rgba(255,60,60,0.8)'; x.fillStyle = '#ffdd44'; x.font = '14px monospace';
        for (let cc = 0; cc <= cols; cc += 5) {
          const px = 60 + cc * step * SCALE;
          x.beginPath(); x.moveTo(px, 40); x.lineTo(px, c.height); x.stroke();
          x.fillText(String(cc), px + 2, 34);
        }
        for (let rr = 0; rr <= rows; rr += 5) {
          const py = 60 + rr * step * SCALE;
          x.beginPath(); x.moveTo(40, py); x.lineTo(c.width, py); x.stroke();
          x.fillText(String(rr), 2, py + 14);
        }
        x.fillText('index = row*' + cols + '+col', 60, 16);
        res(c.toDataURL('image/png'));
      };
      img.onerror = () => rej(new Error('sprite image failed to load'));
      img.src = 'data:image/png;base64,' + b64;
    });
  }, { b64, TILE, GAP, SCALE });

  writeFileSync(resolve(out), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', out);
} finally {
  await browser.close();
}
