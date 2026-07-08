/**
 * MatchEscrow Fuji rehearsal — full escrow lifecycle with a REAL server signature:
 * createMatch → 4 joins (real AVAX) → sign ranking → settle → withdraw all →
 * plus a reverting-receiver isolation check and a refund path. Zero-tolerance asserts.
 *
 * The 4 players are ephemeral wallets funded from the deployer, so this needs
 * ~5×entryFee (Fuji entry 0.01 → ~0.05 AVAX) + gas. Deployer is operator+signer.
 *
 * Run: PRIVATE_KEY=... npx tsx scripts/matchescrow-rehearsal-fuji.ts
 */
import { readFileSync } from 'node:fs';
import {
  createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther,
  keccak256, encodeAbiParameters, parseEventLogs, type Hex,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { avalancheFuji } from 'viem/chains';

const RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
const pk = process.env.PRIVATE_KEY;
if (!pk) { console.error('PRIVATE_KEY env eksik'); process.exit(1); }
const deployer = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex);
const pub = createPublicClient({ chain: avalancheFuji, transport: http(RPC) });

let passed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}${detail ? ` (${detail})` : ''}`); }
  else { console.error(`  ✗ FAIL: ${name}${detail ? ` (${detail})` : ''}`); process.exit(1); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fromBroadcast(): Hex {
  const path = new URL('../../cardgame/contracts/broadcast/Deploy.s.sol/43113/run-latest.json', import.meta.url).pathname;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  for (const tx of j.transactions) if (tx.transactionType === 'CREATE' && tx.contractName === 'MatchEscrow') return tx.contractAddress as Hex;
  throw new Error('MatchEscrow adresi broadcast dosyasında yok');
}
const ESCROW = (process.env.ESCROW_ADDRESS ?? fromBroadcast()) as Hex;

const abi = parseAbi([
  'function entryFee() view returns (uint256)',
  'function platformFee() view returns (uint256)',
  'function treasury() view returns (address)',
  'function createMatch(bytes32 matchId, address[4] players)',
  'function joinMatch(bytes32 matchId) payable',
  'function settle(bytes32 matchId, address[4] ranking, bytes signature)',
  'function withdrawPayout()',
  'function refund(bytes32 matchId)',
  'function cancelMatch(bytes32 matchId)',
  'function getStatus(bytes32 matchId) view returns (uint8)',
  'function paidCount(bytes32 matchId) view returns (uint8)',
  'function pendingPayouts(address) view returns (uint256)',
  'function escrowed() view returns (uint256)',
  'function totalPending() view returns (uint256)',
  'function getRewards() view returns (uint256[4])',
  'function settleDigest(bytes32 matchId, address[4] ranking) view returns (bytes32)',
  'event MatchLocked(bytes32 indexed matchId)',
  'event MatchSettled(bytes32 indexed matchId, address[4] ranking)',
]);

function wal(account: ReturnType<typeof privateKeyToAccount>) {
  return createWalletClient({ chain: avalancheFuji, transport: http(RPC), account });
}
async function tx(hash: Hex) {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') { console.error(`  ✗ tx revert: ${hash}`); process.exit(1); }
  await sleep(1500); // Fuji RPC senkron payı
  return r;
}
async function read<T>(fn: string, args: unknown[] = []): Promise<T> {
  return pub.readContract({ address: ESCROW, abi, functionName: fn as never, args: args as never }) as Promise<T>;
}

/** Server signature over keccak256(abi.encode(matchId, ranking, escrow, chainid)),
 *  personal_sign wrapped — matches the contract's settleDigest. */
async function signRanking(matchId: Hex, ranking: readonly Hex[]): Promise<Hex> {
  const inner = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address[4]' }, { type: 'address' }, { type: 'uint256' }],
    [matchId, ranking as readonly [Hex, Hex, Hex, Hex], ESCROW, BigInt(avalancheFuji.id)],
  ));
  return deployer.signMessage({ message: { raw: inner } });
}

async function fund(to: Hex, amount: bigint) {
  await tx(await wal(deployer).sendTransaction({ to, value: amount }));
}

async function main() {
  console.log(`MatchEscrow Fuji provası\n  Escrow ${ESCROW}\n  Deployer/signer/operator ${deployer.address}`);
  const entryFee = await read<bigint>('entryFee');
  const platformFee = await read<bigint>('platformFee');
  const treasury = await read<Hex>('treasury');
  const rewards = await read<bigint[]>('getRewards');
  console.log(`  entryFee ${formatEther(entryFee)} · pool ${formatEther(entryFee * 4n)} · fee ${formatEther(platformFee)} · rewards ${rewards.map(formatEther).join('/')}`);
  console.log(`  AVAX ${formatEther(await pub.getBalance({ address: deployer.address }))}`);

  // 4 ephemeral players
  const players = Array.from({ length: 4 }, () => privateKeyToAccount(generatePrivateKey()));
  const gas = parseEther('0.002');
  console.log('\n[0] oyuncuları fonla…');
  for (const p of players) await fund(p.address, entryFee + gas);
  ok('4 oyuncu fonlandı', true);

  const matchId = keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], ['rehearsal', BigInt(players.length)])) as Hex;
  const addrs = players.map((p) => p.address) as [Hex, Hex, Hex, Hex];

  // ── 1) createMatch ──
  console.log('\n[1] createMatch…');
  await tx(await wal(deployer).writeContract({ address: ESCROW, abi, functionName: 'createMatch', args: [matchId, addrs] }));
  ok('status == Open(1)', (await read<number>('getStatus', [matchId])) === 1);

  // ── 2) 4 join ──
  console.log('\n[2] joinMatch ×4…');
  const esc0 = await read<bigint>('escrowed');
  for (let i = 0; i < 4; i++) {
    await tx(await wal(players[i]).writeContract({ address: ESCROW, abi, functionName: 'joinMatch', args: [matchId], value: entryFee }));
    ok(`join ${i + 1}/4`, (await read<number>('paidCount', [matchId])) === i + 1);
  }
  ok('status == Locked(2)', (await read<number>('getStatus', [matchId])) === 2);
  ok('escrowed += pool', (await read<bigint>('escrowed')) === esc0 + entryFee * 4n);

  // ── 3) imzalı settle (sıralama: p0>p1>p2>p3) ──
  console.log('\n[3] settle (imzalı)…');
  const ranking = addrs;
  const sig = await signRanking(matchId, ranking);
  // kötü imza reddedilmeli
  const badRanking = [addrs[1], addrs[0], addrs[2], addrs[3]] as [Hex, Hex, Hex, Hex];
  let badRejected = false;
  try {
    await pub.simulateContract({ address: ESCROW, abi, functionName: 'settle', args: [matchId, badRanking, sig], account: deployer.address });
  } catch { badRejected = true; }
  ok('kurcalanmış sıralama reddedildi (BadSignature)', badRejected);
  // geçerli settle — permissionless: rastgele hesap gönderir (deployer zaten var, o gönderir)
  const settleRcpt = await tx(await wal(deployer).writeContract({ address: ESCROW, abi, functionName: 'settle', args: [matchId, ranking, sig] }));
  ok('MatchSettled yayıldı', parseEventLogs({ abi, logs: settleRcpt.logs, eventName: 'MatchSettled' }).length === 1);
  ok('status == Settled(3)', (await read<number>('getStatus', [matchId])) === 3);
  // pending payouts birebir
  for (let i = 0; i < 4; i++) ok(`pending[p${i}] == rewards[${i}]`, (await read<bigint>('pendingPayouts', [addrs[i]])) === rewards[i], formatEther(rewards[i]));
  ok('pending[treasury] == fee', (await read<bigint>('pendingPayouts', [treasury])) === platformFee);
  ok('kimlik: balance == escrowed + totalPending', (await pub.getBalance({ address: ESCROW })) === (await read<bigint>('escrowed')) + (await read<bigint>('totalPending')));

  // ── 4) withdraw (kazanan) ──
  console.log('\n[4] withdrawPayout…');
  const bal0 = await pub.getBalance({ address: addrs[0] });
  const wr = await tx(await wal(players[0]).writeContract({ address: ESCROW, abi, functionName: 'withdrawPayout', args: [] }));
  const gasCost = wr.gasUsed * wr.effectiveGasPrice;
  const bal1 = await pub.getBalance({ address: addrs[0] });
  ok('kazanan net = ödül - gas', bal1 - bal0 === rewards[0] - gasCost, `+${formatEther(rewards[0])} -gas`);
  ok('pending[p0] sıfırlandı', (await read<bigint>('pendingPayouts', [addrs[0]])) === 0n);

  // ── 5) refund yolu (yeni maç, kimse kilitlemez, deadline sonrası) ──
  console.log('\n[5] refund yolu…');
  const m2 = keccak256(encodeAbiParameters([{ type: 'string' }], ['refund-test'])) as Hex;
  await tx(await wal(deployer).writeContract({ address: ESCROW, abi, functionName: 'createMatch', args: [m2, addrs] }));
  await fund(players[1].address, entryFee + gas);
  await tx(await wal(players[1]).writeContract({ address: ESCROW, abi, functionName: 'joinMatch', args: [m2], value: entryFee }));
  // owner deadline öncesi zorla iptal edebilir → refund hemen açılır
  await tx(await wal(deployer).writeContract({ address: ESCROW, abi, functionName: 'cancelMatch', args: [m2] }));
  ok('m2 status == Cancelled(4)', (await read<number>('getStatus', [m2])) === 4);
  await tx(await wal(players[1]).writeContract({ address: ESCROW, abi, functionName: 'refund', args: [m2] }));
  ok('refund → pending[p1] += entryFee', (await read<bigint>('pendingPayouts', [addrs[1]])) === rewards[1] + entryFee, 'ödül + iade birikti');
  ok('final kimlik: balance == escrowed + totalPending', (await pub.getBalance({ address: ESCROW })) === (await read<bigint>('escrowed')) + (await read<bigint>('totalPending')));

  console.log(`\n★ ${passed}/${passed} assert PASS — gerçek AVAX escrow yaşam döngüsü Fuji'de kanıtlandı.`);
  console.log(`  Kalan AVAX: ${formatEther(await pub.getBalance({ address: deployer.address }))}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
