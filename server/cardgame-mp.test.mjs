/**
 * CAR(D) GAME multiplayer hub — headless integration test. Four simulated
 * clients connect to the REAL hub (no sockets, no wallets), pay, pick vehicles,
 * and play a full 3-round match driven by the tick pump. Asserts the crown-jewel
 * property: the server's live authoritative ranking == the ranking re-derived
 * from the recorded action log (what the on-chain settle would sign). So players
 * can never be settled a different result than they played.
 *
 *   node server/cardgame-mp.test.mjs
 */
import { createCardgameHub } from './cardgame-mp.mjs';
import { simulateMatchMP, PIDS } from './cardgame-engine.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const flush = () => new Promise((r) => setImmediate(r));

const ADDRS = [
  '0xAAaa000000000000000000000000000000000001',
  '0xBBbb000000000000000000000000000000000002',
  '0xCCcc000000000000000000000000000000000003',
  '0xDDdd000000000000000000000000000000000004',
];

async function runMatch(seed) {
  const clients = new Map(); // addrLower → client
  const emitToPlayer = (addr, event, data) => clients.get(addr.toLowerCase())?.recv(event, data);
  const emitToRoom = (roomId, event, data) => { for (const c of clients.values()) if (c.roomId === roomId) c.recv(event, data); };

  let capturedInput = null, capturedSim = null;
  const chain = {
    createMatch: async (players) => ({ matchId: '0xMATCH', seed, entryFee: '10000000000000000', players }),
    settle: async (matchId, input) => {
      capturedInput = input;
      capturedSim = simulateMatchMP(seed, input);
      return { ranking: capturedSim.ranking, txHash: '0xSETTLETX' };
    },
  };
  let clock = 0;
  const hub = createCardgameHub({ emitToPlayer, emitToRoom, chain, now: () => clock, log: () => {} });

  for (let i = 0; i < 4; i++) {
    const address = ADDRS[i];
    const c = {
      address, roomId: null, pid: null, hand: [], cd: 99, fin: false,
      pendingSubmit: false, played: 0, vehPref: i, finished: null, settled: null,
      stateCount: 0,
    };
    const maybePlay = () => {
      if (c.fin || c.cd !== 0 || c.pendingSubmit || !c.hand.length) return;
      let hi = c.hand[0];
      for (const card of c.hand) if (card.value > hi.value) hi = card;
      c.pendingSubmit = true; c.played++;
      hub.submitPlay(address, [hi.id]);
    };
    c.recv = (event, data) => {
      switch (event) {
        case 'cardgame:match-found': c.roomId = data.roomId; c.pid = data.seat; hub.markPaid(address); break;
        case 'cardgame:vehicle-select': hub.chooseVehicle(address, data.remaining[c.vehPref % data.remaining.length]); break;
        case 'cardgame:round-start': c.fin = false; c.pendingSubmit = false; break;
        case 'cardgame:hand': c.hand = data.hand; c.cd = data.cd; c.pendingSubmit = false; maybePlay(); break;
        case 'cardgame:state': { const me = data.players.find((p) => p.pid === c.pid); if (me) { c.cd = me.cd; c.fin = me.fin; } c.stateCount++; maybePlay(); break; }
        case 'cardgame:rejected': c.pendingSubmit = false; break;
        case 'cardgame:finished': c.finished = data; break;
        case 'cardgame:settled': c.settled = data; break;
      }
    };
    clients.set(address.toLowerCase(), c);
  }

  // enqueue all four → forms a match (createMatch is async)
  for (const a of ADDRS) hub.enqueue(a);
  await flush(); // let createMatch resolve + match-found fire (clients auto-pay + pick)

  // pump the authoritative tick until settled (or a safety cap)
  const arr = () => [...clients.values()];
  for (let i = 0; i < 12_000 && !arr().every((c) => c.settled); i++) {
    clock += 100;
    hub.tickAll();
    if (i % 20 === 0) await flush(); // let async settle at match end resolve
  }
  await flush();
  return { clients: arr(), capturedInput, capturedSim, hub };
}

console.log('[mp-integration] full 4-player match, live loop == recorded-log settle');
{
  const { clients, capturedInput, capturedSim } = await runMatch('mp-headless-seed-1');
  ok(clients.every((c) => c.finished), 'all 4 clients reached match end');
  ok(clients.every((c) => c.settled), 'all 4 clients received settlement');
  ok(clients.every((c) => c.played > 0), `every seat actually played cards (${clients.map((c) => c.played).join('/')})`);
  ok(!!capturedInput && capturedInput.actions.length > 0, `action log recorded (${capturedInput?.actions.length} plays)`);

  const serverRanking = clients[0].finished.ranking.join('>');
  const settleRanking = clients[0].settled.ranking.join('>');
  const resimRanking = capturedSim.ranking.join('>');
  ok(serverRanking === resimRanking, `live ranking == recorded-log re-sim (${serverRanking})`);
  ok(settleRanking === resimRanking, `settled ranking == re-sim (${settleRanking})`);
  ok(capturedSim.valid, 'recorded action log is valid (no illegal plays slipped in)');
  ok(new Set(capturedSim.ranking).size === 4 && PIDS.every((p) => capturedSim.ranking.includes(p)), 'ranking is a permutation of all 4 seats');
}

console.log('\n[mp-integration] determinism — same seed → same result twice');
{
  const a = await runMatch('mp-headless-seed-2');
  const b = await runMatch('mp-headless-seed-2');
  ok(a.capturedSim.ranking.join('>') === b.capturedSim.ranking.join('>'),
    `stable ranking ${a.capturedSim.ranking.join('>')}`);
}

console.log(`\n${fail === 0 ? '★' : '✗'} ${pass}/${pass + fail} PASS — real 4-player loop is server-authoritative & settle-faithful.`);
process.exit(fail === 0 ? 0 : 1);
