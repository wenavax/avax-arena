/**
 * CAR(D) GAME — UI smoke test (jsdom). Runs the REAL mount code to prove the
 * vehicle-selection screen renders, a pick starts the race, and neither renderer
 * throws at runtime. Not a visual check — a structural/no-crash guarantee.
 *
 *   npx tsx scripts/cardgame-ui-smoke.ts
 */
// @ts-ignore — jsdom is an ad-hoc dev dep (npm i jsdom --no-save), no bundled types
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const w = dom.window as unknown as Window & typeof globalThis;
const g = globalThis as Record<string, unknown>;
for (const k of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'Node', 'SVGElement']) {
  try { g[k] = (w as unknown as Record<string, unknown>)[k]; } catch { /* read-only global — skip */ }
}
g.getComputedStyle = w.getComputedStyle.bind(w);

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

async function main() {
  const { mountCardGame } = await import('../lib/cardgame/mount');
  const { mountStaked } = await import('../lib/cardgame/mountStaked');

  // ── Practice renderer ──────────────────────────────────────────────
  console.log('[1] practice mount — vehicle select → pick → race');
  const r1 = w.document.createElement('div');
  w.document.body.appendChild(r1);
  const cleanup1 = mountCardGame(r1, { address: '0xABCDEF0000000000000000000000000000001234' });
  const sel = r1.querySelector('.cg-vsel');
  ok(!!sel, 'round-1 vehicle selector rendered');
  const cards = r1.querySelectorAll('.cg-vcard');
  ok(cards.length === 3, `3 vehicle cards (got ${cards.length})`);
  ok(!!r1.querySelector('.cg-vcard.vr-legendary'), 'legendary rarity card present');
  ok(r1.querySelectorAll('.cg-vcard .cg-vbar').length === 6, 'stat bars rendered (2 per card)');
  ok(r1.querySelectorAll('.lane').length === 0, 'track not built before pick');
  (cards[0] as HTMLButtonElement).click(); // pick LEGENDARY
  ok(r1.querySelectorAll('.lane').length === 4, 'track built (4 lanes) after pick');
  ok(!r1.querySelector('.cg-vsel'), 'selector cleared after pick');
  ok(/LEG/.test((r1.querySelector('.lane .tag') as HTMLElement)?.innerHTML ?? ''), 'track tag shows vehicle abbr');
  cleanup1();

  // ── Staked renderer (engine-driven, captures choices) ──────────────
  console.log('[2] staked mount — selector → pick → capture');
  const r2 = w.document.createElement('div');
  w.document.body.appendChild(r2);
  let captured: { vehicles: string[] } | null = null;
  const cleanup2 = mountStaked(r2, {
    seed: 'smoke-seed-1',
    player: '0xAAAA000000000000000000000000000000000001',
    bots: ['0xBBBB000000000000000000000000000000000002', '0xCCCC000000000000000000000000000000000003', '0xDDDD000000000000000000000000000000000004'],
    onFinish: (input) => { captured = input; },
  });
  const sSel = r2.querySelector('.cg-vsel');
  ok(!!sSel, 'staked round-1 selector rendered');
  const sCards = r2.querySelectorAll('.cg-vcard');
  ok(sCards.length === 3, `staked 3 vehicle cards (got ${sCards.length})`);
  (sCards[0] as HTMLButtonElement).click(); // pick → capture + race
  ok(r2.querySelectorAll('.lane').length === 4, 'staked track built after pick');
  ok(/YOU/.test((r2.querySelector('.eng-picks') as HTMLElement)?.textContent ?? ''), 'pick announcement line populated');
  ok(!!(r2.querySelector('.eng-track .tag') as HTMLElement)?.innerHTML.match(/LEG|EPI|COM/), 'staked track tag shows abbr');
  // juice parity with practice mode
  ok(!!r2.querySelector('.cg-banner'), 'ROUND banner shown at round start');
  ok(/Round 1/.test((r2.querySelector('.eng-log') as HTMLElement)?.textContent ?? ''), 'event log records round start');
  ok(!!r2.querySelector('.eng-settle') && !!r2.querySelector('.eng-toast'), 'settle + toast slots present');
  const sCard0 = r2.querySelector('.eng-hand .card') as unknown as { onpointerdown: (e: { preventDefault: () => void }) => void };
  sCard0.onpointerdown({ preventDefault() {} }); // select 1 card
  ok(/→ x\d/.test((r2.querySelector('.eng-note') as HTMLElement)?.textContent ?? ''), 'play preview evaluates the selection');
  cleanup2();
  void captured; // match won't finish in smoke window; capture path exercised on pick

  console.log(`\n${fail === 0 ? '★' : '✗'} ${pass}/${pass + fail} PASS`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('THREW:', e); process.exit(1); });
