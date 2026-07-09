/**
 * CAR(D) GAME multiplayer renderer — jsdom smoke test. Feeds the real
 * mountMultiplayer a scripted stream of server events over a mock socket and
 * asserts: it renders the vehicle selector / track / hand, relays the player's
 * vehicle pick and card play back over the socket, fires the finish/settle
 * callbacks, and cleans up — all without throwing.
 *
 *   npx tsx scripts/cardgame-mp-client-smoke.ts
 */
// @ts-ignore — jsdom is an ad-hoc dev dep (npm i jsdom --no-save), no bundled types
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const w = dom.window as unknown as Window & typeof globalThis;
const g = globalThis as Record<string, unknown>;
for (const k of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'Node', 'SVGElement']) {
  try { g[k] = (w as unknown as Record<string, unknown>)[k]; } catch { /* read-only */ }
}
g.getComputedStyle = w.getComputedStyle.bind(w);

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

class MockSocket {
  handlers = new Map<string, Set<(d: any) => void>>();
  out: Array<[string, any]> = [];
  on(e: string, cb: (d: any) => void) { (this.handlers.get(e) ?? this.handlers.set(e, new Set()).get(e)!).add(cb); return this; }
  off(e: string, cb?: (d: any) => void) { if (cb) this.handlers.get(e)?.delete(cb); else this.handlers.delete(e); return this; }
  emit(e: string, d?: any) { this.out.push([e, d]); return this; }
  inject(e: string, d?: any) { for (const cb of [...(this.handlers.get(e) ?? [])]) cb(d); }
  sent(e: string) { return this.out.filter(([x]) => x === e).map(([, d]) => d); }
}

async function main() {
  const { mountMultiplayer } = await import('../lib/cardgame/mountMultiplayer');
  const me = '0xAAaa000000000000000000000000000000000001';
  const seats = [
    { pid: 'P1' as const, address: me },
    { pid: 'P2' as const, address: '0xBBbb000000000000000000000000000000000002' },
    { pid: 'P3' as const, address: '0xCCcc000000000000000000000000000000000003' },
    { pid: 'P4' as const, address: '0xDDdd000000000000000000000000000000000004' },
  ];
  const socket = new MockSocket();
  const root = w.document.createElement('div');
  w.document.body.appendChild(root);
  let finished = false, settled = false;
  const cleanup = mountMultiplayer(root as unknown as HTMLElement, {
    socket, myAddress: me, seats,
    onFinished: () => { finished = true; }, onSettled: () => { settled = true; },
  });

  ok(root.querySelectorAll('.lane').length === 4, 'four lanes built at mount');

  // vehicle selection → pick relays over socket
  socket.inject('cardgame:vehicle-select', { round: 0, remaining: ['LEGENDARY', 'EPIC', 'COMMON'] });
  ok(!!root.querySelector('.cg-vsel'), 'vehicle selector shown on vehicle-select');
  ok(root.querySelectorAll('.cg-vcard').length === 3, 'three vehicle cards');
  (root.querySelector('.cg-vcard.vr-legendary') as any).click();
  ok(socket.sent('cardgame:vehicle').some((d) => d.veh === 'LEGENDARY'), 'vehicle pick relayed to server');
  ok(!root.querySelector('.cg-vsel'), 'selector cleared after pick');

  // round start → picks line + banner + log
  socket.inject('cardgame:round-start', { round: 0, vehicles: { P1: 'LEGENDARY', P2: 'EPIC', P3: 'COMMON', P4: 'LEGENDARY' } });
  ok(/LEG/.test((root.querySelector('.eng-picks') as HTMLElement).innerHTML), 'round-start populates picks line');
  ok(!!root.querySelector('.cg-banner'), 'ROUND banner shown at round start');
  ok(/Round 1/.test((root.querySelector('.eng-log') as HTMLElement).textContent ?? ''), 'event log records round start');

  // hand → renders my cards
  socket.inject('cardgame:hand', { pid: 'P1', hlim: 8, cd: 0, hand: [
    { id: 11, value: 9, type: 'NORMAL', magic: null }, { id: 12, value: 3, type: 'NORMAL', magic: null },
    { id: 13, value: 7, type: 'MAGIC', magic: 'NITRO' },
  ] });
  ok(root.querySelectorAll('.eng-hand .card').length === 3, 'hand renders my cards');

  // state → positions the cars
  socket.inject('cardgame:state', { round: 0, t: 12, players: seats.map((s, i) => ({
    pid: s.pid, address: s.address, veh: 'LEGENDARY', dist: 100 + i * 30, speed: 10, fin: false, ft: null, total: 0, cd: 0, fx: null,
  })) });
  const myCar = root.querySelector('.eng-track [data-pid="P1"]') as HTMLElement;
  ok(!!myCar && myCar.style.left !== '', 'state positions cars');
  ok(/YOU/.test((myCar.querySelector('.tag') as HTMLElement).innerHTML), 'my lane tagged YOU');

  // select a card (hand cards use onpointerdown) → live preview, then PLAY → relays cardgame:play
  (root.querySelector('.eng-hand .card') as any).onpointerdown({ preventDefault() {} });
  ok(/→ x\d/.test((root.querySelector('.eng-hint') as HTMLElement).textContent ?? ''), 'selection shows evaluated play preview');
  (root.querySelector('.eng-play') as any).click();
  const plays = socket.sent('cardgame:play');
  ok(plays.length === 1 && Array.isArray(plays[0].cardIds) && plays[0].cardIds.length === 1, 'card play relayed to server');

  // server confirms the play in the state `applied` map → popup + log entry
  socket.inject('cardgame:state', { round: 0, t: 13, players: seats.map((s, i) => ({
    pid: s.pid, address: s.address, veh: 'LEGENDARY', dist: 110 + i * 30, speed: 10, fin: false, ft: null, total: 0, cd: 30, fx: 'fx-val',
  })), applied: { P1: { combo: null, mult: 1.18, fx: null }, P2: { combo: 'PAIR', mult: 1.54, fx: null } } });
  ok(!!root.querySelector('.eng-track .popup'), 'combo popup rendered over the track for my applied play');
  ok(/PAIR/.test((root.querySelector('.eng-log') as HTMLElement).textContent ?? ''), 'opponent applied play logged');

  // round end → toast
  socket.inject('cardgame:round-end', { round: 0, totals: { P1: 5, P2: 3, P3: 2, P4: 1 }, order: ['P1', 'P2', 'P3', 'P4'] });
  ok(/Round 1/.test((root.querySelector('.eng-toast') as HTMLElement).textContent ?? ''), 'round-end toast fired');

  // finish + settle callbacks (+ settlement panel with payouts / tx link)
  socket.inject('cardgame:finished', { ranking: ['P1', 'P2', 'P3', 'P4'], rankingAddresses: seats.map((s) => s.address), totals: { P1: 10, P2: 8, P3: 6, P4: 4 } });
  ok(finished, 'onFinished fired');
  ok(!!root.querySelector('.settleBox'), 'settlement panel rendered at match end');
  ok(/0\.02/.test(root.querySelector('.settleBox')!.textContent ?? ''), 'settlement panel shows escrow payouts');
  socket.inject('cardgame:settled', { ranking: seats.map((s) => s.address), txHash: '0xTX' });
  ok(settled, 'onSettled fired');
  ok(!!root.querySelector('.settleBox a.txh'), 'settled panel shows tx link');

  // cleanup detaches + clears
  cleanup();
  ok(root.innerHTML === '', 'cleanup clears the root');
  ok(socket.handlers.size === 0 || [...socket.handlers.values()].every((s) => s.size === 0), 'cleanup detaches socket handlers');

  console.log(`\n${fail === 0 ? '★' : '✗'} ${pass}/${pass + fail} PASS — multiplayer renderer drives from server events & relays inputs.`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('THREW:', e); process.exit(1); });
