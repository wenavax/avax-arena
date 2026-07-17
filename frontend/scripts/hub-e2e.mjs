// frontend/scripts/hub-e2e.mjs
// Harness rotasında: her hub kapısı için interact'i tetikle → overlay doğru
// iframe src ile açılır, sahne pause → ✕ → resume. VP=WxH ile viewport seçilir.
// Kullanım: node scripts/hub-e2e.mjs [baseUrl]   (default http://localhost:3000)
import { chromium } from 'file:///Users/hts_bot/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const BASE = process.argv[2] || 'http://localhost:3000';
const [vw, vh] = (process.env.VP || '1280x720').split('x').map(Number);
const isMobileVp = vw < 800;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: vw, height: vh }, hasTouch: isMobileVp, isMobile: isMobileVp });
const errs = [];
page.on('pageerror', e => errs.push(`pageerror: ${e}`));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

let fails = 0;
const ok = (c, m) => { console.log(c ? `  ✓ ${m}` : `  ✗ ${m}`); if (!c) fails++; };

await page.goto(`${BASE}/avalanche/world/hub-test`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('canvas', { timeout: 45000 });
await page.evaluate(() => localStorage.setItem('frostbite_tutorial_done', '1'));
await page.waitForTimeout(5000);

// Save'siz açılışta CharacterSelect gelir — Town'a zorla
await page.evaluate(() => {
  const g = window.__frostbiteGame;
  const cs = g.scene.getScene('CharacterSelect');
  if (cs && g.scene.isActive('CharacterSelect')) cs.scene.start('Town');
});
await page.waitForTimeout(4000);

// Kapı listesi sahnenin kendisinden (registry'yi ayrıca yüklemeye gerek yok)
const doors = await page.evaluate(() => {
  const g = window.__frostbiteGame;
  const town = g.scene.getScene('Town');
  const out = [];
  for (let ty = 0; ty < town.tiles.length; ty++)
    for (let tx = 0; tx < town.tiles[0].length; tx++) {
      const it = town.tiles[ty][tx].interact;
      if (it && it.startsWith('hub_')) out.push({ tx, ty, id: it.slice(4) });
    }
  return out;
});
ok(doors.length === 9, `sahnede 9 hub kapısı bulundu (${doors.length})`);

for (const d of doors) {
  await page.evaluate(({ tx, ty }) => {
    const g = window.__frostbiteGame;
    const town = g.scene.getScene('Town');
    town.playerTx = tx; town.playerTy = Math.min(town.tiles.length - 1, ty + 1);
    town.dispatchInteract(town.tiles[ty][tx], tx, ty);
  }, d);
  await page.waitForSelector('[data-testid="hub-overlay"] iframe', { timeout: 8000 });
  const src = await page.getAttribute('[data-testid="hub-overlay"] iframe', 'src');
  ok(src.startsWith('/avalanche') && src.includes('embed=1'), `${d.id}: overlay açıldı, src=${src}`);
  await page.waitForTimeout(400);
  const fr = page.frames().find(f => f.url().includes('embed=1'));
  let rendered = false;
  try {
    if (fr) {
      // state:'attached' — 'visible' (default) script/style gibi görünmez DOM
      // düğümlerine takılıp yanlış-negatif timeout veriyordu (içerik gerçekte render olmuş olsa da).
      await fr.waitForSelector('body *', { state: 'attached', timeout: 15000 });
      // Overlay kapanış/başka bir kapı geçişiyle frame yeniden navigate/detach olabilir;
      // waitForSelector sonrası taze referansla oku.
      const fr2 = page.frames().find(f => f.url().includes('embed=1')) || fr;
      rendered = await fr2.evaluate(() => document.body.children.length > 0 && document.body.innerText.length > 0);
    }
  } catch { /* rendered kalır false */ }
  ok(rendered, `${d.id}: iframe içerik render`);
  const paused = await page.evaluate(() => window.__frostbiteGame.scene.getScene('Town').scene.isPaused());
  ok(paused, `${d.id}: sahne pause`);
  await page.click('[data-testid="hub-close"]');
  await page.waitForTimeout(500);
  const resumed = await page.evaluate(() => {
    const t = window.__frostbiteGame.scene.getScene('Town');
    return !t.scene.isPaused() && !t.frozen;
  });
  ok(resumed, `${d.id}: kapatınca resume + unfreeze`);
}

const real = errs.filter(e => !/net::ERR|Failed to fetch|walletconnect|favicon|status of 40/i.test(e));
ok(real.length === 0, `konsol hatasız (${real.length})`);
real.slice(0, 5).forEach(e => console.log('   ', e.slice(0, 160)));
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
