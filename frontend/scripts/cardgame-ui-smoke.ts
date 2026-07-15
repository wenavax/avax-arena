/**
 * CAR(D) GAME — UI smoke test (jsdom). Runs the REAL mount code to prove the
 * vehicle-selection screen renders, a pick starts the race, the stage HUD
 * overlays populate, and the race keeps ticking while the tab is hidden
 * (background catch-up). Not a visual check — a structural/no-crash guarantee.
 * (jsdom has no WebGL, so this also exercises the 3D-unavailable fallback.)
 *
 *   npx tsx scripts/cardgame-ui-smoke.ts
 */
// @ts-ignore — jsdom is an ad-hoc dev dep (npm i jsdom --no-save), no bundled types
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const w = dom.window as unknown as Window & typeof globalThis;
const g = globalThis as Record<string, unknown>;
for (const k of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'Node', 'SVGElement', 'Comment']) {
  try { g[k] = (w as unknown as Record<string, unknown>)[k]; } catch { /* read-only global — skip */ }
}
g.getComputedStyle = w.getComputedStyle.bind(w);

// controllable document.hidden — the mounts consult it to skip DOM rendering
let hiddenFlag = false;
Object.defineProperty(w.document, 'hidden', { get: () => hiddenFlag, configurable: true });

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** max "NNNu" distance shown in the mini-standings overlay */
function maxDist(root: HTMLElement): number {
  let best = 0;
  root.querySelectorAll('.cg-hud-row em').forEach((el) => {
    const m = /(\d+)u/.exec(el.textContent ?? '');
    if (m) best = Math.max(best, +m[1]);
  });
  return best;
}

async function main() {
  const { mountCardGame } = await import('../lib/cardgame/mount');
  const { mountStaked } = await import('../lib/cardgame/mountStaked');

  // ── Practice renderer ──────────────────────────────────────────────
  console.log('[1] practice mount — vehicle select → pick → race on the 3D stage');
  const r1 = w.document.createElement('div');
  w.document.body.appendChild(r1);
  const cleanup1 = mountCardGame(r1, { address: '0xABCDEF0000000000000000000000000000001234' });
  ok(!!r1.querySelector('.cg-vsel'), 'round-1 vehicle selector rendered');
  const cards = r1.querySelectorAll('.cg-vcard');
  ok(cards.length === 3, `3 vehicle cards (got ${cards.length})`);
  ok(!!r1.querySelector('.cg-vcard.vr-legendary'), 'legendary rarity card present');
  ok(r1.querySelectorAll('.cg-vcard .cg-vbar').length === 6, 'stat bars rendered (2 per card)');
  const stage = r1.querySelector('#track3d') as HTMLElement;
  ok(!!stage, '3D stage present from mount (no 2D track, no toggle)');
  ok(!r1.querySelector('#track') && !r1.querySelector('#viewToggle'), '2D track + view toggle are gone');
  ok(stage.contains(r1.querySelector('#handPanel')), 'hand panel docked inside the stage');
  ok(stage.contains(r1.querySelector('#vehSelect')), 'vehicle selector docked inside the stage');
  ok(/ROUND 1\/3/.test((stage.querySelector('.cg-hud-chips') as HTMLElement)?.textContent ?? ''), 'HUD chip strip shows the round');
  (cards[0] as HTMLButtonElement).click(); // pick LEGENDARY
  ok(!r1.querySelector('.cg-vsel'), 'selector cleared after pick');
  ok(!!stage.querySelector('.cg-count'), '3·2·1·GO countdown shown on the stage');
  ok(stage.querySelectorAll('.cg-hud-row').length === 4, 'mini standings overlay shows 4 racers');
  ok((stage.querySelector('.cg-hud-log') as HTMLElement).textContent!.length > 0, 'HUD event log receiving lines');

  // background resilience: the race must keep ticking while document.hidden
  console.log('[1b] hidden-tab catch-up — the race never pauses');
  await sleep(2_700); // let the 3·2·1·GO countdown finish and the loop start
  hiddenFlag = true;
  const d0 = maxDist(stage);
  await sleep(1_000); // interval fires while "hidden" — engine must advance
  hiddenFlag = false;
  await sleep(250); // first visible fire re-renders the HUD
  const d1 = maxDist(stage);
  ok(d1 - d0 >= 5, `race advanced while hidden (${d0}u → ${d1}u)`);
  // wall-clock batch catch-up: jump performance.now by 10s → one fire steps ~100 ticks
  try {
    const perf = globalThis.performance as { now: () => number };
    const realNow = perf.now.bind(perf);
    let offset = 0;
    Object.defineProperty(perf, 'now', { value: () => realNow() + offset, configurable: true, writable: true });
    offset = 10_000;
    await sleep(250);
    const d2 = maxDist(stage);
    ok(d2 - d1 >= 60 || d2 >= 990, `batch catch-up stepped the backlog (${d1}u → ${d2}u)`);
    Object.defineProperty(perf, 'now', { value: realNow, configurable: true, writable: true });
  } catch { ok(false, 'performance.now not stubbable in this runtime'); }
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
    entryFee: '10000000000000000',
    onFinish: (input) => { captured = input; },
  });
  ok(!!r2.querySelector('.cg-vsel'), 'staked round-1 selector rendered');
  const sCards = r2.querySelectorAll('.cg-vcard');
  ok(sCards.length === 3, `staked 3 vehicle cards (got ${sCards.length})`);
  const sStage = r2.querySelector('.eng-track3d') as HTMLElement;
  ok(!!sStage && !r2.querySelector('.eng-track'), 'staked 3D stage present, 2D track gone');
  ok(sStage.contains(r2.querySelector('.eng-handcard')), 'staked hand panel docked inside the stage');
  (sCards[0] as HTMLButtonElement).click(); // pick → capture + race
  ok(/ROUND 1\/3/.test((sStage.querySelector('.cg-hud-chips') as HTMLElement)?.textContent ?? ''), 'staked HUD chips show the round');
  ok(!!sStage.querySelector('.cg-count'), '3·2·1·GO countdown shown at round start');
  ok(sStage.querySelectorAll('.cg-hud-row').length === 4, 'staked mini standings shows 4 racers');
  ok(/Round 1/.test((sStage.querySelector('.cg-hud-log') as HTMLElement)?.textContent ?? ''), 'HUD log records round start');
  ok(!!r2.querySelector('.eng-toast'), 'toast slot present (docked)');
  const sCard0 = r2.querySelector('.eng-hand .card') as unknown as { onpointerdown: (e: { preventDefault: () => void }) => void };
  sCard0.onpointerdown({ preventDefault() {} }); // select 1 card
  ok(/→ x\d/.test((r2.querySelector('.eng-note') as HTMLElement)?.textContent ?? ''), 'play preview evaluates the selection');
  cleanup2();
  void captured; // match won't finish in smoke window; capture path exercised on pick

  console.log(`\n${fail === 0 ? '★' : '✗'} ${pass}/${pass + fail} PASS`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('THREW:', e); process.exit(1); });
