/** Fuji UI smoke — headless browser against the local dev server (port 3005).
 *  Verifies client-side rendering with REAL Fuji data from the rehearsal run. */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3005/avalanche';
const REHEARSAL_POOL = '0xC79fB01422Da99b0C4EfD3bCae10cD83064D7298';

let passed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ FAIL: ${name}`); process.exitCode = 1; }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1) Liste: UIRH kartı + Trending pill
  console.log('[1] /launchpad listesi…');
  await page.goto(`${BASE}/launchpad`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=UIRH', { timeout: 30000 });
  ok('UIRH kartı render edildi', await page.isVisible('text=UIRH'));
  ok('Trending sıralama pill görünür', await page.isVisible('text=Trending'));
  ok('Graduated rozeti var', (await page.locator('text=DEX').count()) >= 1);
  await page.click('text=Trending');
  await page.screenshot({ path: '/tmp/fuji-smoke-list.png' });

  // 2) Detay: graduated akışı + fiyat grafiği + trade listesi
  console.log('[2] detay sayfası…');
  await page.goto(`${BASE}/launchpad/${REHEARSAL_POOL}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=UI Rehearsal', { timeout: 30000 });
  ok('token adı render', await page.isVisible('text=UI Rehearsal'));
  ok('Graduated durumu görünür', (await page.locator('text=Graduated').count()) >= 1);
  ok('Trader Joe yönlendirmesi var', await page.isVisible('text=Trade on Trader Joe'));
  // Price tab'ı — indexlenmiş trade'ler geldiyse aktif olmalı
  await page.waitForSelector('button:has-text("Price"):not([disabled])', { timeout: 20000 });
  await page.click('button:has-text("Price")');
  ok('Price grafiği tab\'ı aktif ve seçilebilir', true);
  await page.waitForSelector('text=/[0-9]+ trades?/', { timeout: 10000 });
  ok('trade sayacı görünür', true);
  const tradeRows = await page.locator('a[href*="/tx/"]').count();
  ok(`trade satırları listelendi (${tradeRows})`, tradeRows >= 3);
  await page.screenshot({ path: '/tmp/fuji-smoke-detail.png' });

  // 3) Ana sayfa: What's New bölümü
  console.log('[3] ana sayfa vitrini…');
  await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=NEW THIS', { timeout: 30000 });
  ok('"NEW THIS WEEK" bölümü render', true);
  ok('3 yeni ürün kartı', (await page.locator('text=Begin expedition').count()) === 1 && (await page.locator('text=Start staking').count()) === 1 && (await page.locator('text=Launch a token').count()) >= 1);
  await page.screenshot({ path: '/tmp/fuji-smoke-home.png', fullPage: false });

  await browser.close();
  console.log(`\nSONUÇ: ${passed} assert PASS${process.exitCode ? ' (BAŞARISIZLAR VAR)' : ''}`);
}

main().catch((e) => { console.error('HATA:', e?.message || e); process.exit(1); });
