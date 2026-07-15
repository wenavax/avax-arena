/** E2E: server-authoritative staked flow on live prod. Signs stake, creates,
 *  joins (cast-free via viem), seats bots, plays the engine with the returned
 *  seed, settles with the INPUT (not a ranking), verifies on-chain settlement. */
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';
import { initMatch, startRound, stepTick, roundDone, scoreRound, finalRanking, CFG, VEHICLES, type PlayEvent } from '../lib/cardgame/engine';

const BASE = 'https://frostbite.pro/avalanche/api/cardgame';
const RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
// Default = the live 1 AVAX escrow (2026-07-13 rollout); override via env for
// the retired 0.01 contract 0xb25Eec9D2C2b4FA5AB099677233A86BD9Aa6EE50.
const ESCROW = (process.env.CARDGAME_ESCROW || '0x3872DAb4eB43170b4b5Be08a9796f75f3802efe9') as Hex;
const pk = process.env.PRIVATE_KEY!;
const acct = privateKeyToAccount((pk.startsWith('0x') ? pk : '0x' + pk) as Hex);
const pub = createPublicClient({ chain: avalancheFuji, transport: http(RPC) });
const wal = createWalletClient({ chain: avalancheFuji, transport: http(RPC), account: acct });
const abi = parseAbi(['function joinMatch(bytes32) payable', 'function getStatus(bytes32) view returns (uint8)', 'function pendingPayouts(address) view returns (uint256)']);

function play(seed: string) {
  const s = initMatch(seed); const vehicles: string[] = []; const plays: PlayEvent[] = [];
  for (let r = 0; r < CFG.ROUNDS; r++) {
    const v = VEHICLES.filter((x) => !s.usedVeh.P1[x])[0]; vehicles.push(v); startRound(s, v);
    let g = 0;
    while (!roundDone(s) && g++ < CFG.TIMEOUT_TICKS + 5) {
      const p1 = s.players[0]; let cid: number[] | undefined;
      if (!p1.fin && s.t >= p1.cdUntil && p1.hand.length && s.t % 9 === 0) { cid = [p1.hand[0].id]; plays.push({ round: r, tick: s.t, cardIds: cid }); }
      stepTick(s, cid);
    }
    scoreRound(s);
  }
  return { input: { vehicles, plays }, ranking: finalRanking(s) };
}

async function main() {
  const nonce = Math.floor(Math.random() * 1e9);
  const message = `Frostbite CAR(D) GAME — authorize staked match\nplayer: ${acct.address.toLowerCase()}\nnonce: ${nonce}`;
  const sig = await acct.signMessage({ message });
  console.log('1) create-match…');
  let r = await (await fetch(`${BASE}/create-match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player: acct.address, nonce, sig }) })).json();
  if (r.error) throw new Error('create: ' + r.error);
  const mId = r.matchId as Hex; console.log('   matchId', mId.slice(0, 12));
  console.log(`2) join ${Number(r.entryFee) / 1e18} AVAX…`);
  await pub.waitForTransactionReceipt({ hash: await wal.writeContract({ address: ESCROW, abi, functionName: 'joinMatch', args: [mId], value: BigInt(r.entryFee) }) });
  console.log('3) seat-bots → seed…');
  const sb = await (await fetch(`${BASE}/seat-bots`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player: acct.address, nonce, sig }) })).json();
  if (sb.error) throw new Error('seat: ' + sb.error);
  const seed = sb.seed as string; console.log('   seed', seed.slice(0, 14));
  console.log('4) play engine locally with seed…');
  const { input, ranking } = play(seed);
  console.log('   local ranking', ranking.join('>'), '| plays', input.plays.length);
  console.log('5) settle with INPUT (server re-derives)…');
  const st = await (await fetch(`${BASE}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player: acct.address, nonce, sig, input }) })).json();
  if (st.error) throw new Error('settle: ' + st.error);
  console.log('   tx', (st.txHash as string).slice(0, 14), '| server ranking', (st.ranking as string[]).map((a) => a.slice(0, 6)).join('>'), '| valid', st.valid);
  const status = await pub.readContract({ address: ESCROW, abi, functionName: 'getStatus', args: [mId] });
  const pending = await pub.readContract({ address: ESCROW, abi, functionName: 'pendingPayouts', args: [acct.address] });
  console.log(`\n★ status=${status} (3=Settled) · your pending ${Number(pending) / 1e18} AVAX`);
  console.log(`   local-vs-server first place match: ${st.ranking[0].toLowerCase() === acct.address.toLowerCase() ? 'YOU won' : 'bot won'} (server-authoritative)`);
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
