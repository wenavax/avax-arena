// frontend/scripts/hub-embed-smoke.mjs
// 9 hub sayfası ?embed=1 ile: sidebar yok + 0 konsol hatası.
// Kullanım: node scripts/hub-embed-smoke.mjs [baseUrl]  (default http://localhost:3000)
import { chromium } from 'file:///Users/hts_bot/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const BASE = process.argv[2] || 'http://localhost:3000';
const URLS = ['/battle', '/cardgame', '/world/battle-royale', '/expeditions', '/world/adventures', '/swap', '/marketplace', '/launchpad', '/nft-score'];

const VIEWPORTS = [
  { width: 1024, height: 720 },
  { width: 1440, height: 900 },
];

const browser = await chromium.launch();
let fails = 0;
for (const viewport of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport });
  for (const u of URLS) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`${BASE}/avalanche${u}?embed=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    const chromeVisible = await page.evaluate(() =>
      [...document.querySelectorAll('[data-chrome]')].some(el => el.getClientRects().length > 0));
    const real = errs.filter(e => !/net::ERR|Failed to fetch|walletconnect|favicon|status of 40/i.test(e));
    const pass = !chromeVisible && real.length === 0;
    console.log(`${pass ? '✓' : '✗'} [${viewport.width}] ${u} — chrome:${chromeVisible ? 'GÖRÜNÜR' : 'gizli'} err:${real.length}`);
    real.slice(0, 3).forEach(e => console.log('   ', e.slice(0, 160)));
    if (!pass) fails++;
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
