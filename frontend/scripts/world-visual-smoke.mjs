// frontend/scripts/world-visual-smoke.mjs
// World görsel yükseltme paketleri için kalıcı smoke/screenshot scripti.
// Kullanım: node scripts/world-visual-smoke.mjs [baseUrl] [--shots dir]
import { chromium } from 'file:///Users/hts_bot/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const shotsDir = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
const BASE = (args[0] && args[0] !== '--shots' ? args[0] : null) || 'http://localhost:3000';
const URLS = ['/world', '/world/mint', '/world/battle-royale', '/world/adventures'];
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch();
let fails = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (const u of URLS) {
    let page;
    try {
      page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      await page.goto(`${BASE}/avalanche${u}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(u === '/world' ? 8000 : 4000);
      const real = errs.filter(e => !/net::ERR|Failed to fetch|walletconnect|favicon|status of 40/i.test(e));
      const pass = real.length === 0;
      if (!pass) fails++;
      console.log(`${pass ? '✓' : '✗'} ${u} err:${real.length}`);
      real.slice(0, 3).forEach(e => console.log('   ', e.slice(0, 160)));
      if (shotsDir) await page.screenshot({ path: `${shotsDir}/${u.replace(/\//g, '_')}.png` });
    } catch (e) {
      fails++;
      console.log(`✗ ${u} ERROR`);
      console.log('   ', String(e && e.message ? e.message : e).slice(0, 200));
    } finally {
      if (page) await page.close();
    }
  }
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
